import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  committeeMembers,
  inventoryCycles,
  inventoryDocuments,
  inventoryIssues,
  inventoryItems,
  inventoryNotes,
  schoolMemberships,
  schools,
  users,
  validationHistory,
} from "../drizzle/schema";
import {
  findSchoolMember,
  getCycleById,
  getManagementCycles,
  getManagementControlExportData,
  getManagementIssues,
  getManagementItems,
  getSchoolMembers,
  getSchoolOverview,
  getVisibleSchools,
  listAssignableUsers,
  requireDb,
  userCanAccessSchool,
  createPasswordResetToken,
  resetPasswordWithToken,
  linkUserToSchoolByEmail,
} from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { sendGmailMessage } from "./_core/gmail";
import { createSessionToken } from "./_core/session";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
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
  missingDocumentTypes,
  safeFileName,
  type CycleStatus,
} from "./inventoryUtils";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { createUserWithPassword, verifyUserPassword } from "./db";


const yearInput = z.number().int().min(2020).max(2100);
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

function csvText(value: string | null | undefined) {
  return value?.trim() || null;
}

const schoolFields = {
  name: z.string().trim().min(3).max(255),
  schoolCode: z.string().trim().max(64).optional().nullable(),
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

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),

        register: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const user = await createUserWithPassword(input);
        await linkUserToSchoolByEmail(user!.id, user!.email);
        const token = await createSessionToken(user!.id);
        ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
        return user;
      }),

    login: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const user = await verifyUserPassword(input.email, input.password);
        if (!user) throw new Error("E-mail ou senha inválidos");
        await linkUserToSchoolByEmail(user.id, user.email);
        const token = await createSessionToken(user.id);
        ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
        return user;
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
      const result = await db.insert(schools).values(input);
      const school = await db.select().from(schools).where(eq(schools.id, Number(result[0].insertId))).limit(1);
      return school[0];
    }),
    update: protectedProcedure
      .input(z.object({ schoolId: z.number().int().positive(), ...schoolFields }))
      .mutation(async ({ ctx, input }) => {
        await assertSchoolAccess(ctx.user, input.schoolId);
        const db = await requireDb();
        const { schoolId, ...fields } = input;
        await db.update(schools).set(fields).where(eq(schools.id, schoolId));
        return { success: true };
      }),
    listMembers: protectedProcedure.input(schoolInput).query(async ({ ctx, input }) => {
      await assertSchoolAccess(ctx.user, input.schoolId);
      return getSchoolMembers(input.schoolId);
    }),
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
      .input(z.object({ schoolId: z.number().int().positive(), year: yearInput }))
      .query(async ({ ctx, input }) => {
        await assertSchoolAccess(ctx.user, input.schoolId);
        return getSchoolOverview(input.schoolId, input.year);
      }),
    createCycle: protectedProcedure
      .input(z.object({ schoolId: z.number().int().positive(), year: yearInput }))
      .mutation(async ({ ctx, input }) => {
        await assertSchoolAccess(ctx.user, input.schoolId);
        const db = await requireDb();
        const existing = await db
          .select()
          .from(inventoryCycles)
          .where(and(eq(inventoryCycles.schoolId, input.schoolId), eq(inventoryCycles.year, input.year)))
          .limit(1);
        if (existing[0]) return existing[0];
        const result = await db.insert(inventoryCycles).values(input);
        const cycle = await db.select().from(inventoryCycles).where(eq(inventoryCycles.id, Number(result[0].insertId))).limit(1);
        return cycle[0];
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
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertEditableCycle(ctx.user, input.cycleId);
        const db = await requireDb();
        const { unitValue, quantity, ...fields } = input;
        const totalValue = calculateLineTotal(quantity, unitValue);
        const result = await db.insert(inventoryItems).values({ ...fields, quantity, unitValue: unitValue.toFixed(2), totalValue });
        return { id: Number(result[0].insertId), totalValue };
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
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const cycle = await assertEditableCycle(ctx.user, input.cycleId);
        const db = await requireDb();
        const item = await db.select().from(inventoryItems).where(eq(inventoryItems.id, input.itemId)).limit(1);
        if (!item[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado." });
        if (item[0].cycleId !== cycle.id) throw accessDenied();
        const { itemId, cycleId, unitValue, quantity, ...fields } = input;
        const totalValue = calculateLineTotal(quantity, unitValue);
        await db.update(inventoryItems).set({ ...fields, cycleId, quantity, unitValue: unitValue.toFixed(2), totalValue }).where(eq(inventoryItems.id, itemId));
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
      const [items, members, documents] = await Promise.all([
        db.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.cycleId, cycle.id)),
        db.select({ id: committeeMembers.id }).from(committeeMembers).where(eq(committeeMembers.cycleId, cycle.id)),
        db.select({ type: inventoryDocuments.documentType }).from(inventoryDocuments).where(eq(inventoryDocuments.cycleId, cycle.id)),
      ]);
      if (!items.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Inclua ao menos um item patrimonial antes de submeter." });
      if (!members.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Registre ao menos um integrante da subcomissão antes de submeter." });
      const missing = missingDocumentTypes(documents.map(document => document.type));
      if (missing.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Envie os três documentos assinados antes de submeter." });
      await db.update(inventoryCycles).set({ status: "submitted", submittedAt: new Date(), reviewNotes: null }).where(eq(inventoryCycles.id, cycle.id));
      await db.insert(validationHistory).values({ cycleId: cycle.id, action: "submitted", note: "Inventário submetido pela escola.", performedByUserId: ctx.user.id });
      return { success: true };
    }),
  }),

  management: router({
    listUsers: adminProcedure.query(() => listAssignableUsers()),
    controlExport: adminProcedure.input(z.object({ year: yearInput })).query(({ input }) => getManagementControlExportData(input.year)),
    reviewInventory: adminProcedure.input(z.object({ cycleId: z.number().int().positive() })).query(async ({ input }) => {
      const cycle = await getCycleById(input.cycleId);
      if (!cycle) throw new TRPCError({ code: "NOT_FOUND", message: "Ciclo de inventário não encontrado." });
      return getSchoolOverview(cycle.schoolId, cycle.year);
    }),
    setUserRole: adminProcedure
      .input(z.object({ userId: z.number().int().positive(), role: z.enum(["admin", "user"]) }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        const target = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
        if (!target[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Utilizador não encontrado." });
        if (target[0].role === input.role) return { success: true, unchanged: true };
        if (target[0].role === "admin" && input.role === "user") {
          const administrators = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
          if (!canChangeAdminRole(target[0].role, input.role, administrators.length)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "A plataforma deve manter pelo menos um administrador." });
          }
        }
        await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
        return { success: true, role: input.role };
      }),
    dashboard: adminProcedure.input(z.object({ year: yearInput })).query(async ({ input }) => {
      const [cycles, itemRows, issueRows] = await Promise.all([getManagementCycles(input.year), getManagementItems(input.year), getManagementIssues(input.year)]);
      const totalValue = itemRows.reduce((sum, row) => sum + Number(row.item.totalValue), 0);
      const consolidated = consolidateExpenseItems(itemRows.map(row => row.item));
      return {
        cycles,
        pendingIssues: issueRows.map(row => ({ ...row.issue, school: row.school.name, schoolId: row.school.id, year: row.cycle.year })),
        consolidated,
        metrics: {
          schoolsWithCycles: cycles.length,
          submitted: cycles.filter(row => row.cycle.status === "submitted" || row.cycle.status === "under_review").length,
          validated: cycles.filter(row => row.cycle.status === "validated").length,
          openIssues: issueRows.filter(row => row.issue.resolutionStatus !== "resolved").length,
          totalValue,
        },
      };
    }),
    changeStatus: adminProcedure
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
    retryArchive: adminProcedure.input(z.object({ cycleId: z.number().int().positive() })).mutation(async ({ input }) => {
      const cycle = await getCycleById(input.cycleId);
      if (!cycle) throw new TRPCError({ code: "NOT_FOUND", message: "Ciclo de inventário não encontrado." });
      const result = await archiveCycle(input.cycleId);
      if (!result.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error });
      return { success: true, location: result.location };
    }),
    archiveStats: adminProcedure.input(z.object({ year: yearInput })).query(async ({ input }) => {
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
