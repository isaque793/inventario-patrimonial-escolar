import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import {
  committeeMembers,
  inventoryCycles,
  inventoryDocuments,
  inventoryIssues,
  inventoryItems,
  inventoryNotes,
  passwordResetTokens,
  schoolAccessRequests,
  schoolMemberships,
  schools,
  users,
  validationHistory,
} from "../drizzle/schema";
import {
  findHistoricalItem,
  findSchoolMember,
  historicalPropertyNumberCandidates,
  getCycleById,
  getManagementCycles,
  getSchoolsWithMembers,
  getManagementControlExportData,
  getManagementIssues,
  getManagementItemTotals,
  getSchoolMembers,
  getMyPendingSchoolAccessRequests,
  getPendingSchoolAccessCounts,
  getPendingSchoolAccessRequests,
  getAllPendingSchoolAccessRequests,
  getSchoolOverview,
  getVisibleSchools,
  listAssignableUsers,
  requireDb,
  userCanAccessSchool,
  createPasswordResetToken,
  resetPasswordWithToken,
  linkUserToSchoolByEmail,
  requestSchoolAccess,
  reviewSchoolAccessRequest,
  searchSchoolsForAccessRequest,
} from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { TOO_MANY_LOGIN_ATTEMPTS_MESSAGE, failedLoginKey, failedLoginLimiter } from "./_core/rateLimit";
import { ENV } from "./_core/env";
import { sendGmailMessage } from "./_core/gmail";
import { SCHOOL_ACCESS_SUSPENDED_MESSAGE, isBlockedBySuspension, isSchoolAccessSuspended, setSchoolAccessSuspended } from "./_core/schoolAccess";
import { createSessionToken } from "./_core/session";
import { adminProcedure, protectedProcedure, publicProcedure, router, staffProcedure } from "./_core/trpc";
import type { TrpcContext } from "./_core/context";
import { systemRouter } from "./_core/systemRouter";
import { storagePut } from "./storage";
import { archiveCycle } from "./archiveService";
import {
  EXPENSE_CATEGORIES,
  REQUIRED_DOCUMENT_TYPES,
  calculateLineTotal,
  canChangeAdminRole,
  canTransitionStatus,
  consolidateExpenseItems,
  safeFileName,
  type CycleStatus,
} from "./inventoryUtils";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { CYCLE_TYPES, DEFAULT_CYCLE_TYPE } from "@shared/inventoryCycle";
import { describeImportResult, planPreInventoryImport, summarizeImportPlan, NO_PROPERTY_NUMBER } from "./preInventoryImport";
import { createUserWithPassword, verifyUserPassword } from "./db";


const yearInput = z.number().int().min(2020).max(2100);
// Sem o tipo, a chamada continua sendo do pré-inventário (comportamento anterior à separação).
const cycleTypeInput = z.enum(CYCLE_TYPES).default(DEFAULT_CYCLE_TYPE);
const schoolInput = z.object({ schoolId: z.number().int().positive() });
const editableCycleStatuses = ["draft", "returned"] as const;

function accessDenied() {
  return new TRPCError({ code: "FORBIDDEN", message: "Não tem permissão para aceder aos dados desta escola." });
}

async function assertSchoolAccess(user: NonNullable<Parameters<typeof getVisibleSchools>[0]>, schoolId: number) {
  if (!(await userCanAccessSchool(user, schoolId))) throw accessDenied();
}

async function assertEditableCycle(user: NonNullable<Parameters<typeof getVisibleSchools>[0]>, cycleId: number) {
  const cycle = await getCycleById(cycleId);
  if (!cycle) throw new TRPCError({ code: "NOT_FOUND", message: "Ciclo de inventário não encontrado." });
  await assertSchoolAccess(user, cycle.schoolId);
  if (!editableCycleStatuses.includes(cycle.status as (typeof editableCycleStatuses)[number])) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Este inventário já foi submetido para validação e não pode ser alterado." });
  }
  return cycle;
}

/** Ciclo oficial editável da escola autorizada (importação e conferência só existem no oficial). */
async function assertEditableOfficialCycle(user: NonNullable<Parameters<typeof getVisibleSchools>[0]>, cycleId: number) {
  const cycle = await assertEditableCycle(user, cycleId);
  if (cycle.type !== "official") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Esta operação só é permitida no inventário oficial." });
  }
  return cycle;
}

type DbClient = Awaited<ReturnType<typeof requireDb>>;

/** Lê, no mesmo contexto (ou transação), os ciclos e bens envolvidos na importação. */
async function loadImportContext(db: Pick<DbClient, "select">, schoolId: number, year: number) {
  const cycles = await db
    .select()
    .from(inventoryCycles)
    .where(and(eq(inventoryCycles.schoolId, schoolId), eq(inventoryCycles.year, year), inArray(inventoryCycles.type, ["pre_inventory", "official"])));
  const pre = cycles.find(cycle => cycle.type === "pre_inventory");
  const official = cycles.find(cycle => cycle.type === "official");
  if (!official) throw new TRPCError({ code: "NOT_FOUND", message: "Inicie o inventário oficial antes de importar bens do pré-inventário." });
  if (!pre) throw new TRPCError({ code: "NOT_FOUND", message: `Esta escola não tem pré-inventário de ${year} para importar.` });
  // Origem e destino têm de ser da mesma escola e dos tipos certos (nunca confiar só nos IDs do cliente).
  if (pre.schoolId !== official.schoolId || pre.schoolId !== schoolId) throw accessDenied();
  const [sourceItems, officialItems] = await Promise.all([
    db.select().from(inventoryItems).where(eq(inventoryItems.cycleId, pre.id)).orderBy(asc(inventoryItems.id)),
    db.select().from(inventoryItems).where(eq(inventoryItems.cycleId, official.id)),
  ]);
  const importedSourceItemIds = officialItems.flatMap(item => (item.sourceItemId != null ? [item.sourceItemId] : []));
  const officialPropertyNumbers = officialItems.map(item => item.propertyNumber);
  return { pre, official, sourceItems, importedSourceItemIds, officialPropertyNumbers };
}

function isDuplicateEntryError(error: unknown) {
  const text = [error, (error as { cause?: unknown })?.cause].map(part => (part instanceof Error ? part.message : String(part ?? ""))).join(" ");
  return text.includes("ER_DUP_ENTRY") || text.includes("item_cycle_source_unique") || text.includes("Duplicate entry");
}

function csvText(value: string | null | undefined) {
  return value?.trim() || null;
}

/** Traduz violação dos índices únicos da escola numa mensagem legível. */
function rethrowDuplicateSchoolCode(error: unknown): never {
  const text = [error, (error as { cause?: unknown })?.cause]
    .map(part => (part instanceof Error ? part.message : String(part ?? "")))
    .join(" ");
  if (text.includes("school_siad_code_unique")) {
    throw new TRPCError({ code: "CONFLICT", message: "Já existe outra escola com este código SIAD." });
  }
  if (text.includes("school_code_unique")) {
    throw new TRPCError({ code: "CONFLICT", message: "Já existe outra escola com este código." });
  }
  if (text.includes("school_email_unique")) {
    throw new TRPCError({ code: "CONFLICT", message: "Já existe outra escola com este e-mail." });
  }
  throw error;
}

const schoolFields = {
  name: z.string().trim().min(3).max(255),
  schoolCode: z.string().trim().max(64).optional().nullable(),
  siadCode: z.string().trim().regex(/^\d{1,20}$/, "O código SIAD deve conter apenas números.").optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  regionalOffice: z.string().trim().max(160).optional().nullable(),
  email: z.string().trim().email().max(320).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  responsibleName: z.string().trim().max(255).optional().nullable(),
  responsibleMasp: z.string().trim().max(32).optional().nullable(),
  responsibleRole: z.string().trim().max(120).optional().nullable(),
  directorName: z.string().trim().max(255).optional().nullable(),
  directorMasp: z.string().trim().max(32).optional().nullable(),
};

function toPublicUser(user: NonNullable<TrpcContext["user"]>) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => (opts.ctx.user ? toPublicUser(opts.ctx.user) : null)),

        register: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        if (isSchoolAccessSuspended()) throw new TRPCError({ code: "FORBIDDEN", message: SCHOOL_ACCESS_SUSPENDED_MESSAGE });
        const user = await createUserWithPassword(input);
        await linkUserToSchoolByEmail(user!.id, user!.email);
        const token = await createSessionToken(user!.id);
        ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
        return toPublicUser(user!);
      }),

    login: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string() }))
      .mutation(async ({ input, ctx }) => {
        // Só tentativas com senha errada contam para o bloqueio (por IP + e-mail).
        const attemptKey = failedLoginKey(ctx.req, input.email);
        if (failedLoginLimiter.isBlocked(attemptKey)) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: TOO_MANY_LOGIN_ATTEMPTS_MESSAGE });
        }
        const user = await verifyUserPassword(input.email, input.password);
        if (!user) {
          failedLoginLimiter.hit(attemptKey);
          throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha inválidos" });
        }
        failedLoginLimiter.reset(attemptKey);
        if (isBlockedBySuspension(user)) throw new TRPCError({ code: "FORBIDDEN", message: SCHOOL_ACCESS_SUSPENDED_MESSAGE });
        await linkUserToSchoolByEmail(user.id, user.email);
        const token = await createSessionToken(user.id);
        ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
        return toPublicUser(user);
      }),

    requestPasswordReset: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input, ctx }) => {
        const reset = await createPasswordResetToken(input.email);

        if (!reset) {
          return { success: true } as const;
        }

        const forwardedProto = ctx.req.headers["x-forwarded-proto"];
        const forwardedHost = ctx.req.headers["x-forwarded-host"];
        const proto =
          ENV.isProduction && typeof forwardedProto === "string"
            ? forwardedProto.split(",")[0].trim()
            : ctx.req.protocol;
        const host =
          typeof forwardedHost === "string"
            ? forwardedHost.split(",")[0].trim()
            : ctx.req.get("host");

        if (!host) {
          console.error("[Password Reset] Host da aplicação não disponível.");
          return { success: true } as const;
        }

        const resetUrl = `${proto}://${host}/redefinir-senha?token=${encodeURIComponent(reset.token)}`;

        try {
          await sendGmailMessage({
            to: reset.email,
            subject: "Redefinição de senha — Inventário Patrimonial Escolar",
            text: [
              "Olá,",
              "",
              "Recebemos uma solicitação para redefinir a senha da sua conta no Inventário Patrimonial Escolar.",
              "",
              `Use este link para criar uma nova senha: ${resetUrl}`,
              "",
              "O link é válido por 30 minutos e pode ser usado apenas uma vez.",
              "Se você não solicitou esta alteração, ignore esta mensagem.",
              "",
              "Inventário Patrimonial Escolar",
            ].join("\n"),
            html: `<!doctype html>
<html lang="pt-BR">
<body style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937">
  <h2>Redefinição de senha</h2>
  <p>Recebemos uma solicitação para redefinir a senha da sua conta no Inventário Patrimonial Escolar.</p>
  <p><a href="${resetUrl}">Criar uma nova senha</a></p>
  <p>O link é válido por <strong>30 minutos</strong> e pode ser usado apenas uma vez.</p>
  <p>Se você não solicitou esta alteração, ignore esta mensagem.</p>
  <p>Inventário Patrimonial Escolar</p>
</body>
</html>`,
          });
        } catch (error) {
          console.error("[Password Reset] Falha ao enviar e-mail:", error);
        }

        return { success: true } as const;
      }),

    resetPassword: publicProcedure
      .input(
        z.object({
          token: z.string().min(20).max(200),
          password: z.string().min(8).max(128),
        }),
      )
      .mutation(async ({ input }) => {
        const success = await resetPasswordWithToken(input.token, input.password);

        if (!success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O link de redefinição é inválido ou expirou.",
          });
        }

        return { success: true } as const;
      }),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
    return { success: true } as const;
  }),
  }),

  catalog: router({
    expenseCategories: publicProcedure.query(() => EXPENSE_CATEGORIES.map(([code, label]) => ({ code, label }))),
  }),

  school: router({
    list: protectedProcedure.input(z.object({ viewerId: z.number().int().positive() })).query(async ({ ctx }) => getVisibleSchools(ctx.user)),
    create: adminProcedure.input(z.object(schoolFields)).mutation(async ({ input }) => {
      const db = await requireDb();
      const result = await db.insert(schools).values(input).catch(rethrowDuplicateSchoolCode);
      const school = await db.select().from(schools).where(eq(schools.id, Number(result[0].insertId))).limit(1);
      return school[0];
    }),
    update: protectedProcedure
      .input(z.object({ schoolId: z.number().int().positive(), ...schoolFields }))
      .mutation(async ({ ctx, input }) => {
        await assertSchoolAccess(ctx.user, input.schoolId);
        const db = await requireDb();
        const { schoolId, siadCode, ...otherFields } = input;
        // O código SIAD liga a escola às cargas históricas: só a equipe gestora pode alterá-lo.
        const fields = ctx.user.role === "admin" ? { ...otherFields, siadCode } : otherFields;
        await db.update(schools).set(fields).where(eq(schools.id, schoolId)).catch(rethrowDuplicateSchoolCode);
        return { success: true };
      }),
    listMembers: protectedProcedure.input(schoolInput).query(async ({ ctx, input }) => {
      await assertSchoolAccess(ctx.user, input.schoolId);
      return getSchoolMembers(input.schoolId);
    }),
    searchForAccess: protectedProcedure
      .input(z.object({ query: z.string().trim().min(2).max(100) }))
      .query(({ input }) => searchSchoolsForAccessRequest(input.query)),
    myAccessRequests: protectedProcedure.query(({ ctx }) => getMyPendingSchoolAccessRequests(ctx.user.id)),
    requestAccess: protectedProcedure
      .input(z.object({ schoolId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role === "admin" || ctx.user.role === "manager") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A equipa gestora já possui acesso a todas as escolas." });
        }
        return requestSchoolAccess(ctx.user.id, input.schoolId);
      }),
    pendingAccessRequests: staffProcedure
      .input(schoolInput)
      .query(({ input }) => getPendingSchoolAccessRequests(input.schoolId)),
    allPendingAccessRequests: staffProcedure
      .query(() => getAllPendingSchoolAccessRequests()),
    pendingAccessCounts: staffProcedure.query(() => getPendingSchoolAccessCounts()),
    reviewAccessRequest: staffProcedure
      .input(z.object({ requestId: z.number().int().positive(), decision: z.enum(["approved", "rejected"]) }))
      .mutation(async ({ ctx, input }) => reviewSchoolAccessRequest(input.requestId, ctx.user.id, input.decision)),
    listAssignableUsers: adminProcedure.query(() => listAssignableUsers()),
    assignUser: adminProcedure
      .input(z.object({ schoolId: z.number().int().positive(), userId: z.number().int().positive(), accessRole: z.enum(["coordinator", "contributor"]) }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        const existing = await findSchoolMember(input.schoolId, input.userId);
        if (existing) {
          await db.update(schoolMemberships).set({ accessRole: input.accessRole }).where(eq(schoolMemberships.id, existing.id));
        } else {
          await db.insert(schoolMemberships).values(input);
        }
        return { success: true };
      }),
  }),

  inventory: router({
    overview: protectedProcedure
      .input(z.object({ schoolId: z.number().int().positive(), year: yearInput, type: cycleTypeInput }))
      .query(async ({ ctx, input }) => {
        await assertSchoolAccess(ctx.user, input.schoolId);
        return getSchoolOverview(input.schoolId, input.year, input.type);
      }),
    lookupHistorical: protectedProcedure
      .input(z.object({ schoolId: z.number().int().positive(), propertyNumber: z.string().trim().min(1).max(80) }))
      .query(async ({ ctx, input }) => {
        await assertSchoolAccess(ctx.user, input.schoolId);
        return findHistoricalItem(input.schoolId, input.propertyNumber);
      }),
    createCycle: protectedProcedure
      .input(z.object({ schoolId: z.number().int().positive(), year: yearInput, type: cycleTypeInput }))
      .mutation(async ({ ctx, input }) => {
        await assertSchoolAccess(ctx.user, input.schoolId);
        const db = await requireDb();
        // Procura (ou cria) o ciclo do tipo pedido: o oficial nunca reaproveita o pré-inventário.
        const existing = await db
          .select()
          .from(inventoryCycles)
          .where(and(eq(inventoryCycles.schoolId, input.schoolId), eq(inventoryCycles.year, input.year), eq(inventoryCycles.type, input.type)))
          .limit(1);
        if (existing[0]) return existing[0];
        const result = await db.insert(inventoryCycles).values(input);
        const cycle = await db.select().from(inventoryCycles).where(eq(inventoryCycles.id, Number(result[0].insertId))).limit(1);
        return cycle[0];
      }),
    importPreview: protectedProcedure
      .input(z.object({ schoolId: z.number().int().positive(), year: yearInput }))
      .query(async ({ ctx, input }) => {
        await assertSchoolAccess(ctx.user, input.schoolId);
        const db = await requireDb();
        const context = await loadImportContext(db, input.schoolId, input.year);
        const plan = planPreInventoryImport({ sourceItems: context.sourceItems, importedSourceItemIds: context.importedSourceItemIds, officialPropertyNumbers: context.officialPropertyNumbers });
        const state = new Map<number, "new" | "already_imported" | "already_in_official" | "duplicated_in_source">();
        for (const entry of plan.toImport) state.set(entry.id, "new");
        for (const entry of plan.alreadyImported) state.set(entry.id, "already_imported");
        for (const entry of plan.alreadyInOfficial) state.set(entry.id, "already_in_official");
        for (const entry of plan.duplicatedInSource) state.set(entry.id, "duplicated_in_source");
        return {
          sourceYear: context.pre.year,
          officialCycleId: context.official.id,
          summary: summarizeImportPlan(plan),
          items: context.sourceItems.map(item => ({
            id: item.id,
            propertyNumber: item.propertyNumber,
            description: item.description,
            quantity: item.quantity,
            totalValue: item.totalValue,
            state: state.get(item.id) ?? "new",
          })),
        };
      }),
    importPreInventory: protectedProcedure
      .input(z.object({ schoolId: z.number().int().positive(), year: yearInput, sourceItemIds: z.array(z.number().int().positive()).min(1).max(5000).optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertSchoolAccess(ctx.user, input.schoolId);
        const db = await requireDb();
        try {
          return await db.transaction(async tx => {
            const context = await loadImportContext(tx, input.schoolId, input.year);
            // Só importa enquanto o ciclo oficial é editável (rascunho ou devolvido).
            await assertEditableOfficialCycle(ctx.user, context.official.id);
            let candidates = context.sourceItems;
            if (input.sourceItemIds) {
              const wanted = new Set(input.sourceItemIds);
              candidates = context.sourceItems.filter(item => wanted.has(item.id));
              if (candidates.length !== wanted.size) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Alguns bens selecionados não pertencem ao pré-inventário desta escola." });
              }
            }
            const plan = planPreInventoryImport({ sourceItems: candidates, importedSourceItemIds: context.importedSourceItemIds, officialPropertyNumbers: context.officialPropertyNumbers });
            if (plan.toImport.length) {
              // O bem de origem é apenas lido: a cópia guarda de onde veio e nasce "aguardando conferência".
              await tx.insert(inventoryItems).values(
                plan.toImport.map(item => ({
                  cycleId: context.official.id,
                  propertyNumber: item.propertyNumber,
                  quantity: item.quantity,
                  description: item.description,
                  technicalDetails: item.technicalDetails,
                  expenseCode: item.expenseCode,
                  conservationCode: item.conservationCode,
                  conservationState: item.conservationState,
                  unitValue: item.unitValue,
                  totalValue: item.totalValue,
                  currentSituation: item.currentSituation,
                  sourceCycleId: context.pre.id,
                  sourceItemId: item.id,
                  importStatus: "pending_confirmation" as const,
                })),
              );
            }
            const summary = summarizeImportPlan(plan);
            return { ...summary, imported: summary.toImport, message: describeImportResult(summary) };
          });
        } catch (error) {
          // Duas importações ao mesmo tempo: a chave única impede a cópia dupla e a transação desfaz tudo.
          if (isDuplicateEntryError(error)) {
            throw new TRPCError({ code: "CONFLICT", message: "Outra importação estava em andamento. Nada foi duplicado; tente novamente." });
          }
          throw error;
        }
      }),
    listImportedItems: protectedProcedure
      .input(z.object({ cycleId: z.number().int().positive(), status: z.enum(["pending_confirmation", "confirmed"]).optional() }))
      .query(async ({ ctx, input }) => {
        const cycle = await getCycleById(input.cycleId);
        if (!cycle) throw new TRPCError({ code: "NOT_FOUND", message: "Ciclo de inventário não encontrado." });
        await assertSchoolAccess(ctx.user, cycle.schoolId);
        const db = await requireDb();
        const rows = await db
          .select()
          .from(inventoryItems)
          .where(and(eq(inventoryItems.cycleId, cycle.id), isNotNull(inventoryItems.importStatus)))
          .orderBy(asc(inventoryItems.id));
        const items = input.status ? rows.filter(row => row.importStatus === input.status) : rows;
        return {
          pending: rows.filter(row => row.importStatus === "pending_confirmation").length,
          confirmed: rows.filter(row => row.importStatus === "confirmed").length,
          items,
        };
      }),
    findImportedItem: protectedProcedure
      .input(z.object({ cycleId: z.number().int().positive(), propertyNumber: z.string().trim().min(1).max(80) }))
      .query(async ({ ctx, input }) => {
        const cycle = await getCycleById(input.cycleId);
        if (!cycle) throw new TRPCError({ code: "NOT_FOUND", message: "Ciclo de inventário não encontrado." });
        await assertSchoolAccess(ctx.user, cycle.schoolId);
        if (cycle.type !== "official") return null;
        const db = await requireDb();
        // Só procura neste ciclo oficial (e, portanto, só nesta escola): nunca em outro ciclo.
        const rows = await db
          .select()
          .from(inventoryItems)
          .where(and(eq(inventoryItems.cycleId, cycle.id), isNotNull(inventoryItems.importStatus), inArray(inventoryItems.propertyNumber, historicalPropertyNumberCandidates(input.propertyNumber))))
          .orderBy(asc(inventoryItems.id));
        // Prefere o ainda não conferido; se só houver conferido, devolve-o para avisar que já foi conferido.
        return rows.find(row => row.importStatus === "pending_confirmation") ?? rows[0] ?? null;
      }),
    confirmImportedItem: protectedProcedure
      .input(
        z.object({
          cycleId: z.number().int().positive(),
          itemId: z.number().int().positive(),
          propertyNumber: z.string().trim().min(1).max(80),
          quantity: z.number().int().min(1).max(1000000),
          description: z.string().trim().min(2).max(4000),
          technicalDetails: z.string().trim().max(4000).optional().nullable(),
          expenseCode: z.string().trim().regex(/^52\.(0[1-9]|1[0-9]|2[0-2]|25|26|99)$/),
          conservationCode: z.string().trim().max(32).optional().nullable(),
          conservationState: z.string().trim().min(2).max(80),
          unitValue: z.number().min(0).max(999999999),
          currentSituation: z.string().trim().min(2).max(160),
          pending: z.object({
            issueType: z.enum(["not_found", "outside_register", "new_equipment", "transfer", "donation", "guard_term", "other"]),
            pendingDescription: z.string().trim().min(2).max(4000),
            sei: z.string().trim().max(120).optional().nullable(),
          }).optional().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const cycle = await assertEditableOfficialCycle(ctx.user, input.cycleId);
        const db = await requireDb();
        const { itemId, cycleId, unitValue, quantity, pending, ...fields } = input;
        const totalValue = calculateLineTotal(quantity, unitValue);
        return db.transaction(async tx => {
          const current = (await tx.select().from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1))[0];
          if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado." });
          // O bem tem de ser deste ciclo oficial e ter vindo do pré-inventário.
          if (current.cycleId !== cycle.id || current.importStatus == null) throw accessDenied();
          if (current.importStatus === "confirmed") {
            throw new TRPCError({ code: "CONFLICT", message: "Este bem já foi conferido." });
          }
          if (fields.propertyNumber !== NO_PROPERTY_NUMBER) {
            const duplicate = await tx
              .select({ id: inventoryItems.id })
              .from(inventoryItems)
              .where(and(eq(inventoryItems.cycleId, cycle.id), eq(inventoryItems.propertyNumber, fields.propertyNumber)))
              .limit(2);
            if (duplicate.some(entry => entry.id !== itemId)) {
              throw new TRPCError({ code: "CONFLICT", message: `Já existe um patrimônio com o número "${fields.propertyNumber}" neste inventário.` });
            }
          }
          // Atualiza o próprio registro importado (não cria um segundo bem). O estado verde só existe depois deste gravar.
          await tx
            .update(inventoryItems)
            .set({ ...fields, quantity, unitValue: unitValue.toFixed(2), totalValue, importStatus: "confirmed", confirmedAt: new Date(), confirmedBy: ctx.user.id })
            .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.importStatus, "pending_confirmation")));
          if (pending) {
            await tx.insert(inventoryIssues).values({
              cycleId: cycle.id,
              itemId,
              issueType: pending.issueType,
              propertyNumber: fields.propertyNumber,
              quantity,
              description: fields.description,
              conservationState: fields.conservationState,
              location: null,
              totalValue,
              originBody: null,
              currentSituation: fields.currentSituation,
              pendingDescription: pending.pendingDescription,
              sei: pending.sei ?? null,
              measuresTaken: null,
              resolutionStatus: "open",
            });
          }
          return { id: itemId, totalValue, importStatus: "confirmed" as const };
        });
      }),
    setCommittee: protectedProcedure
      .input(
        z.object({
          cycleId: z.number().int().positive(),
          members: z.array(z.object({ name: z.string().trim().min(3).max(255), jobTitle: z.string().trim().min(2).max(160), masp: z.string().trim().min(3).max(32), isPresident: z.boolean() })).min(1).max(25),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertEditableCycle(ctx.user, input.cycleId);
        const db = await requireDb();
        await db.delete(committeeMembers).where(eq(committeeMembers.cycleId, input.cycleId));
        await db.insert(committeeMembers).values(input.members.map(member => ({ ...member, cycleId: input.cycleId, isPresident: member.isPresident ? 1 : 0 })));
        return { success: true };
      }),
    addItem: protectedProcedure
      .input(
        z.object({
          cycleId: z.number().int().positive(),
          propertyNumber: z.string().trim().min(1).max(80),
          quantity: z.number().int().min(1).max(1000000),
          description: z.string().trim().min(2).max(4000),
          technicalDetails: z.string().trim().max(4000).optional().nullable(),
          expenseCode: z.string().trim().regex(/^52\.(0[1-9]|1[0-9]|2[0-2]|25|26|99)$/),
          conservationCode: z.string().trim().max(32).optional().nullable(),
          conservationState: z.string().trim().min(2).max(80),
          unitValue: z.number().min(0).max(999999999),
          currentSituation: z.string().trim().min(2).max(160),
          pending: z.object({
            issueType: z.enum(["not_found", "outside_register", "new_equipment", "transfer", "donation", "guard_term", "other"]),
            pendingDescription: z.string().trim().min(2).max(4000),
            sei: z.string().trim().max(120).optional().nullable(),
          }).optional().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertEditableCycle(ctx.user, input.cycleId);
        const db = await requireDb();

        // O número patrimonial identifica o bem dentro do inventário da escola.
        // "Não se aplica" é uma exceção válida e pode aparecer em mais de um item.
        const { unitValue, quantity, pending, ...fields } = input;
        const totalValue = calculateLineTotal(quantity, unitValue);

        const result = await db.transaction(async tx => {
          if (input.propertyNumber !== "Não se aplica") {
            const existing = await tx
              .select({ id: inventoryItems.id })
              .from(inventoryItems)
              .where(
                and(
                  eq(inventoryItems.cycleId, input.cycleId),
                  eq(inventoryItems.propertyNumber, input.propertyNumber),
                ),
              )
              .limit(1);

            if (existing[0]) {
              throw new TRPCError({
                code: "CONFLICT",
                message: `Já existe um patrimônio com o número "${input.propertyNumber}" neste inventário.`,
              });
            }
          }

          const itemResult = await tx.insert(inventoryItems).values({
            ...fields,
            quantity,
            unitValue: unitValue.toFixed(2),
            totalValue,
          });
          const itemId = Number(itemResult[0].insertId);

          if (pending) {
            await tx.insert(inventoryIssues).values({
              cycleId: input.cycleId,
              itemId,
              issueType: pending.issueType,
              propertyNumber: input.propertyNumber,
              quantity,
              description: fields.description,
              conservationState: fields.conservationState,
              location: null,
              totalValue,
              originBody: null,
              currentSituation: fields.currentSituation,
              pendingDescription: pending.pendingDescription,
              sei: pending.sei ?? null,
              measuresTaken: null,
              resolutionStatus: "open",
            });
          }

          return { id: itemId, totalValue };
        });

        return result;
      }),
    updateItem: protectedProcedure
      .input(
        z.object({
          itemId: z.number().int().positive(),
          cycleId: z.number().int().positive(),
          propertyNumber: z.string().trim().min(1).max(80),
          quantity: z.number().int().min(1).max(1000000),
          description: z.string().trim().min(2).max(4000),
          technicalDetails: z.string().trim().max(4000).optional().nullable(),
          expenseCode: z.string().trim().regex(/^52\.(0[1-9]|1[0-9]|2[0-2]|25|26|99)$/),
          conservationCode: z.string().trim().max(32).optional().nullable(),
          conservationState: z.string().trim().min(2).max(80),
          unitValue: z.number().min(0).max(999999999),
          currentSituation: z.string().trim().min(2).max(160),
          pending: z.object({
            issueId: z.number().int().positive(),
            issueType: z.enum(["not_found", "outside_register", "new_equipment", "transfer", "donation", "guard_term", "other"]),
            pendingDescription: z.string().trim().min(2).max(4000),
            sei: z.string().trim().max(120).optional().nullable(),
            measuresTaken: z.string().trim().max(4000).optional().nullable(),
            resolutionStatus: z.enum(["open", "in_progress", "resolved"]),
          }).optional().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const cycle = await assertEditableCycle(ctx.user, input.cycleId);
        const db = await requireDb();
        const item = await db.select().from(inventoryItems).where(eq(inventoryItems.id, input.itemId)).limit(1);
        if (!item[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado." });
        if (item[0].cycleId !== cycle.id) throw accessDenied();

        // Ao editar, o próprio registro atual não conta como duplicado.
        // "Não se aplica" continua podendo ser usado por vários itens.
        if (input.propertyNumber !== "Não se aplica") {
          const duplicate = await db
            .select({ id: inventoryItems.id })
            .from(inventoryItems)
            .where(
              and(
                eq(inventoryItems.cycleId, cycle.id),
                eq(inventoryItems.propertyNumber, input.propertyNumber),
              ),
            )
            .limit(2);

          if (duplicate.some(entry => entry.id !== input.itemId)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Já existe um patrimônio com o número "${input.propertyNumber}" neste inventário.`,
            });
          }
        }

        const { itemId, cycleId, unitValue, quantity, pending, ...fields } = input;
        const totalValue = calculateLineTotal(quantity, unitValue);
        // As pendências guardam uma cópia dos dados do bem; ao salvar, a cópia acompanha o bem.
        const itemCopy = {
          propertyNumber: fields.propertyNumber,
          quantity,
          description: fields.description,
          conservationState: fields.conservationState,
          currentSituation: fields.currentSituation,
          totalValue,
        };

        await db.transaction(async tx => {
          await tx.update(inventoryItems).set({ ...fields, cycleId, quantity, unitValue: unitValue.toFixed(2), totalValue }).where(eq(inventoryItems.id, itemId));
          await tx.update(inventoryIssues).set(itemCopy).where(and(eq(inventoryIssues.cycleId, cycle.id), eq(inventoryIssues.itemId, itemId)));

          if (pending) {
            const issue = await tx.select().from(inventoryIssues).where(eq(inventoryIssues.id, pending.issueId)).limit(1);
            if (!issue[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Pendência não encontrada." });
            if (issue[0].cycleId !== cycle.id) throw accessDenied();
            // Pendências antigas sem vínculo passam a apontar para este bem.
            if (issue[0].itemId != null && issue[0].itemId !== itemId) throw accessDenied();
            await tx.update(inventoryIssues).set({
              ...itemCopy,
              itemId,
              issueType: pending.issueType,
              pendingDescription: pending.pendingDescription,
              sei: pending.sei ?? null,
              measuresTaken: pending.measuresTaken ?? null,
              resolutionStatus: pending.resolutionStatus,
            }).where(eq(inventoryIssues.id, pending.issueId));
          }
        });
        return { id: itemId, totalValue };
      }),
    deleteItem: protectedProcedure.input(z.object({ itemId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const item = await db.select().from(inventoryItems).where(eq(inventoryItems.id, input.itemId)).limit(1);
      if (!item[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado." });
      await assertEditableCycle(ctx.user, item[0].cycleId);
      await db.delete(inventoryItems).where(eq(inventoryItems.id, input.itemId));
      return { success: true };
    }),
    addIssue: protectedProcedure
      .input(
        z.object({
          cycleId: z.number().int().positive(),
          issueType: z.enum(["not_found", "outside_register", "new_equipment", "transfer", "donation", "guard_term", "other"]),
          propertyNumber: z.string().trim().max(80).optional().nullable(),
          quantity: z.number().int().min(1).max(1000000).optional().nullable(),
          description: z.string().trim().min(2).max(4000),
          conservationState: z.string().trim().max(80).optional().nullable(),
          location: z.string().trim().max(160).optional().nullable(),
          totalValue: z.number().min(0).max(999999999).optional().nullable(),
          originBody: z.string().trim().max(255).optional().nullable(),
          currentSituation: z.string().trim().max(160).optional().nullable(),
          pendingDescription: z.string().trim().min(2).max(4000),
          sei: z.string().trim().max(120).optional().nullable(),
          measuresTaken: z.string().trim().max(4000).optional().nullable(),
          resolutionStatus: z.enum(["open", "in_progress", "resolved"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertEditableCycle(ctx.user, input.cycleId);
        const db = await requireDb();
        const { totalValue, ...fields } = input;
        const result = await db.insert(inventoryIssues).values({ ...fields, totalValue: totalValue === null || totalValue === undefined ? null : totalValue.toFixed(2) });
        return { id: Number(result[0].insertId) };
      }),
    deleteIssue: protectedProcedure.input(z.object({ issueId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const issue = await db.select().from(inventoryIssues).where(eq(inventoryIssues.id, input.issueId)).limit(1);
      if (!issue[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Pendência não encontrada." });
      await assertEditableCycle(ctx.user, issue[0].cycleId);
      await db.delete(inventoryIssues).where(eq(inventoryIssues.id, input.issueId));
      return { success: true };
    }),
    upsertNotes: protectedProcedure
      .input(z.object({ cycleId: z.number().int().positive(), problemsFound: z.string().trim().max(8000).optional().nullable(), quantityDivergences: z.string().trim().max(8000).optional().nullable(), valueDivergences: z.string().trim().max(8000).optional().nullable() }))
      .mutation(async ({ ctx, input }) => {
        await assertEditableCycle(ctx.user, input.cycleId);
        const db = await requireDb();
        await db.insert(inventoryNotes).values(input).onDuplicateKeyUpdate({ set: { problemsFound: csvText(input.problemsFound), quantityDivergences: csvText(input.quantityDivergences), valueDivergences: csvText(input.valueDivergences) } });
        return { success: true };
      }),
    uploadDocument: protectedProcedure
      .input(
        z.object({
          cycleId: z.number().int().positive(),
          documentType: z.enum(["opening_minutes", "responsibility_term", "closing_minutes"]),
          fileName: z.string().trim().min(1).max(255),
          mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
          contentBase64: z.string().min(1).max(14_000_000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const cycle = await assertEditableCycle(ctx.user, input.cycleId);
        const fileBuffer = Buffer.from(input.contentBase64, "base64");
        if (!fileBuffer.length || fileBuffer.length > 10 * 1024 * 1024) {
          throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Envie ficheiros de até 10 MB." });
        }
        const fileName = safeFileName(input.fileName);
        const folder = `inventarios/escola-${cycle.schoolId}/${cycle.year}/${input.documentType}`;
        const stored = await storagePut(`${folder}/${Date.now()}-${fileName}`, fileBuffer, input.mimeType);
        const db = await requireDb();
        const result = await db.insert(inventoryDocuments).values({ cycleId: input.cycleId, documentType: input.documentType, fileName, mimeType: input.mimeType, fileSize: fileBuffer.length, storageKey: stored.key, storageUrl: stored.url, uploadedByUserId: ctx.user.id });
        return { id: Number(result[0].insertId), ...stored };
      }),
    removeDocument: protectedProcedure.input(z.object({ documentId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const document = await db.select().from(inventoryDocuments).where(eq(inventoryDocuments.id, input.documentId)).limit(1);
      if (!document[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado." });
      await assertEditableCycle(ctx.user, document[0].cycleId);
      await db.delete(inventoryDocuments).where(eq(inventoryDocuments.id, input.documentId));
      return { success: true };
    }),
    submit: protectedProcedure.input(z.object({ cycleId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const cycle = await assertEditableCycle(ctx.user, input.cycleId);
      const db = await requireDb();
      // Documentos assinados são opcionais: não bloqueiam a submissão.
      const [items, members] = await Promise.all([
        db.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.cycleId, cycle.id)),
        db.select({ id: committeeMembers.id }).from(committeeMembers).where(eq(committeeMembers.cycleId, cycle.id)),
      ]);
      if (!items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Inclua ao menos um item patrimonial antes de submeter." });
      if (!members.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Registre ao menos um integrante da subcomissão antes de submeter." });
      await db.update(inventoryCycles).set({ status: "submitted", submittedAt: new Date(), reviewNotes: null }).where(eq(inventoryCycles.id, cycle.id));
      await db.insert(validationHistory).values({ cycleId: cycle.id, action: "submitted", note: "Inventário submetido pela escola.", performedByUserId: ctx.user.id });
      return { success: true };
    }),
  }),

  management: router({
    listUsers: adminProcedure.query(() => listAssignableUsers()),
    schoolAccessStatus: adminProcedure.query(() => ({ suspended: isSchoolAccessSuspended() })),
    setSchoolAccessSuspended: adminProcedure
      .input(z.object({ suspended: z.boolean() }))
      .mutation(({ input }) => {
        setSchoolAccessSuspended(input.suspended);
        return { suspended: isSchoolAccessSuspended() };
      }),
    controlExport: staffProcedure.input(z.object({ year: yearInput, schoolIds: z.array(z.number().int().positive()).max(50).optional() })).query(({ input }) => getManagementControlExportData(input.year, input.schoolIds)),
    reviewInventory: staffProcedure.input(z.object({ cycleId: z.number().int().positive() })).query(async ({ input }) => {
      const cycle = await getCycleById(input.cycleId);
      if (!cycle) throw new TRPCError({ code: "NOT_FOUND", message: "Ciclo de inventário não encontrado." });
      return getSchoolOverview(cycle.schoolId, cycle.year, cycle.type);
    }),
    setUserRole: adminProcedure
      .input(z.object({ userId: z.number().int().positive(), role: z.enum(["admin", "manager", "user"]) }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        const target = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
        if (!target[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Utilizador não encontrado." });
        if (target[0].role === input.role) return { success: true, unchanged: true };
        if (target[0].role === "admin" && input.role !== "admin") {
          const administrators = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
          if (!canChangeAdminRole(target[0].role, input.role, administrators.length)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "A plataforma deve manter pelo menos um administrador." });
          }
        }
        await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
        return { success: true, role: input.role };
      }),
    dashboard: staffProcedure.input(z.object({ year: yearInput })).query(async ({ input }) => {
      const [cycles, itemRows, issueRows, schoolsWithMembers] = await Promise.all([getManagementCycles(input.year), getManagementItemTotals(input.year), getManagementIssues(input.year), getSchoolsWithMembers()]);
      const itemCountBySchool = new Map<number, number>();
      for (const row of itemRows) itemCountBySchool.set(row.schoolId, (itemCountBySchool.get(row.schoolId) ?? 0) + row.itemCount);
      const schoolProgress = schoolsWithMembers.map(entry => ({ ...entry, itemCount: itemCountBySchool.get(entry.school.id) ?? 0 }));
      const totalValue = itemRows.reduce((sum, row) => sum + row.totalValue, 0);
      const consolidated = consolidateExpenseItems(itemRows);
      return {
        cycles,
        schoolProgress,
        pendingIssues: issueRows.map(row => ({ ...row.issue, school: row.school.name, schoolId: row.school.id, year: row.cycle.year })),
        consolidated,
        metrics: {
          schoolsWithCycles: cycles.length,
          schoolsStarted: schoolProgress.filter(entry => entry.itemCount > 0).length,
          schoolsNotStarted: schoolProgress.filter(entry => entry.itemCount === 0).length,
          submitted: cycles.filter(row => row.cycle.status === "submitted" || row.cycle.status === "under_review").length,
          validated: cycles.filter(row => row.cycle.status === "validated").length,
          openIssues: issueRows.filter(row => row.issue.resolutionStatus !== "resolved").length,
          totalValue,
        },
      };
    }),
    deleteUser: adminProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível excluir a sua própria conta." });
      const db = await requireDb();
      const target = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Utilizador não encontrado." });
      if (target[0].role === "admin") {
        const administrators = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
        if (administrators.length <= 1) throw new TRPCError({ code: "BAD_REQUEST", message: "A plataforma deve manter pelo menos um administrador." });
      }
      await db.delete(schoolMemberships).where(eq(schoolMemberships.userId, input.userId));
      await db.delete(schoolAccessRequests).where(eq(schoolAccessRequests.userId, input.userId));
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, input.userId));
      await db.delete(users).where(eq(users.id, input.userId));
      return { success: true };
    }),
    changeStatus: staffProcedure
      .input(z.object({ cycleId: z.number().int().positive(), status: z.enum(["under_review", "returned", "validated"]), note: z.string().trim().max(8000).optional().nullable() }))
      .mutation(async ({ ctx, input }) => {
        const cycle = await getCycleById(input.cycleId);
        if (!cycle) throw new TRPCError({ code: "NOT_FOUND", message: "Ciclo de inventário não encontrado." });
        if (!canTransitionStatus(cycle.status as CycleStatus, input.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Esta alteração de estado não é permitida." });
        }
        if (input.status === "returned" && !input.note?.trim()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Indique a razão de devolução para a escola." });
        }
        const db = await requireDb();
        await db.update(inventoryCycles).set({ status: input.status, reviewNotes: csvText(input.note), reviewedAt: new Date() }).where(eq(inventoryCycles.id, input.cycleId));
        await db.insert(validationHistory).values({ cycleId: input.cycleId, action: input.status, note: csvText(input.note), performedByUserId: ctx.user.id });
        if (input.status === "validated") {
          // A validação é o gatilho de elegibilidade para arquivamento (ver plano
          // de armazenamento). Não aguardamos nem propagamos falhas aqui: a
          // validação do inventário não deve ficar refém do empacotamento, que
          // pode ser reprocessado depois (archiveStatus fica "ERROR" e é
          // retomável via archiveCycle(cycleId)).
          void archiveCycle(input.cycleId).catch(error => {
            console.error(`[Archive] Falha não tratada ao arquivar ciclo ${input.cycleId}:`, error);
          });
        }
        return { success: true };
      }),
    retryArchive: staffProcedure.input(z.object({ cycleId: z.number().int().positive() })).mutation(async ({ input }) => {
      const cycle = await getCycleById(input.cycleId);
      if (!cycle) throw new TRPCError({ code: "NOT_FOUND", message: "Ciclo de inventário não encontrado." });
      const result = await archiveCycle(input.cycleId);
      if (!result.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error });
      return { success: true, location: result.location };
    }),
    archiveStats: staffProcedure.input(z.object({ year: yearInput })).query(async ({ input }) => {
      const db = await requireDb();
      // Traz todos os ciclos validados do ano com seus dados de arquivamento e escola
      const rows = await db
        .select({ cycle: inventoryCycles, school: schools })
        .from(inventoryCycles)
        .innerJoin(schools, eq(inventoryCycles.schoolId, schools.id))
        .where(and(eq(inventoryCycles.year, input.year), eq(inventoryCycles.status, "validated")));

      const counts = { ACTIVE: 0, PENDING: 0, ARCHIVED: 0, ERROR: 0 };
      for (const row of rows) counts[row.cycle.archiveStatus as keyof typeof counts]++;

      const withErrors = rows
        .filter(row => row.cycle.archiveStatus === "ERROR")
        .map(row => ({
          cycleId: row.cycle.id,
          schoolName: row.school.name,
          archiveError: row.cycle.archiveError,
        }));

      const archived = rows
        .filter(row => row.cycle.archiveStatus === "ARCHIVED")
        .map(row => ({
          cycleId: row.cycle.id,
          schoolName: row.school.name,
          archivedAt: row.cycle.archivedAt,
          archiveLocation: row.cycle.archiveLocation,
          archiveVersion: row.cycle.archiveVersion,
        }));

      return { counts, withErrors, archived };
    }),
  }),
});

export type AppRouter = typeof appRouter;
