import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import {
  committeeMembers,
  inventoryCycles,
  inventoryDocuments,
  inventoryIssues,
  inventoryItems,
  inventoryNotes,
  passwordResetTokens,
  schoolMemberships,
  schoolAccessRequests,
  schools,
  users,
  validationHistory,
  type InsertUser,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { hasSchoolAccess } from "./inventoryUtils";

let _db: MySql2Database | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      const pool = mysql.createPool({
        host: url.hostname,
        port: Number(url.port || 3306),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.replace(/^\//, ""),
        ssl: { rejectUnauthorized: false },
        // Mantém conexões vivas para evitar ECONNRESET do Aiven após idle.
        enableKeepAlive: true,
        keepAliveInitialDelay: 30_000, // 30 s
        // Limite de conexões simultâneas e fila de espera.
        waitForConnections: true,
        connectionLimit: 5,
        // Descarta conexões que ficaram ociosas por mais de 60 s (antes de
        // o Aiven fechá-las pelo lado dele, geralmente em ~120 s).
        idleTimeout: 60_000,
        // Timeout para estabelecer cada conexão (evita esperar infinitamente
        // quando o banco está temporariamente inacessível).
        connectTimeout: 10_000, // 10 s
      });
      _db = drizzle(pool as any) as any;
    } catch (error) {
      console.warn("[Database] Falha ao conectar:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("O identificador do utilizador é obrigatório.");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  } else if (user.role !== undefined) {
    values.role = user.role;
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPasswordHash(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, "hex");
  const suppliedBuffer = scryptSync(password, salt, 64);
  return hashBuffer.length === suppliedBuffer.length && timingSafeEqual(hashBuffer, suppliedBuffer);
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

export async function findSchoolByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;

  const normalizedEmail = email.trim().toLowerCase();

  const result = await db
    .select()
    .from(schools)
    .where(eq(schools.email, normalizedEmail))
    .limit(1);

  return result[0];
}

export async function createUserWithPassword(input: { email: string; password: string; name?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getUserByEmail(input.email);
  if (existing) throw new Error("E-mail já cadastrado");

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const isFirstUser = Number(count) === 0;

  await db.insert(users).values({
    openId: randomUUID(),
    email: input.email,
    name: input.name ?? null,
    passwordHash: hashPassword(input.password),
    loginMethod: "password",
    role: isFirstUser ? "admin" : "user",
  });

  return getUserByEmail(input.email);
}

export async function verifyUserPassword(email: string, password: string) {
  const user = await getUserByEmail(email);
  if (!user || !user.passwordHash) return null;
  return verifyPasswordHash(password, user.passwordHash) ? user : null;
}

const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPasswordResetToken(email: string) {
  const db = await requireDb();
  const normalizedEmail = email.trim().toLowerCase();
  const user = await getUserByEmail(normalizedEmail);

  if (!user) return null;

  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashPasswordResetToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  return { email: normalizedEmail, token, expiresAt };
}

export async function resetPasswordWithToken(token: string, password: string): Promise<boolean> {
  const db = await requireDb();
  const tokenHash = hashPasswordResetToken(token);
  const now = new Date();

  return db.transaction(async tx => {
    const rows = await tx
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
        ),
      )
      .limit(1);

    const resetToken = rows[0];
    if (!resetToken || resetToken.expiresAt.getTime() <= now.getTime()) {
      return false;
    }

    const result = await tx
      .update(users)
      .set({
        passwordHash: hashPassword(password),
        updatedAt: now,
        lastSignedIn: now,
      })
      .where(eq(users.id, resetToken.userId));

    if (Number(result[0].affectedRows) !== 1) return false;

    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokens.userId, resetToken.userId),
          isNull(passwordResetTokens.usedAt),
        ),
      );

    return true;
  });
}

export async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("A base de dados não está disponível neste momento.");
  return db;
}

/**
 * Executa uma função que usa o banco e, se o erro for de conectividade
 * transitória (ECONNRESET ou ETIMEDOUT), descarta o pool atual, reabre
 * a ligação e tenta novamente uma vez antes de propagar o erro.
 */
export async function withDb<T>(fn: (db: MySql2Database) => Promise<T>): Promise<T> {
  const db = await requireDb();
  try {
    return await fn(db);
  } catch (error: unknown) {
    const code =
      error instanceof Error && "code" in error
        ? (error as NodeJS.ErrnoException).code
        : undefined;
    const message = error instanceof Error ? error.message : "";
    const isTransient =
      code === "ECONNRESET" ||
      code === "ETIMEDOUT" ||
      code === "ECONNREFUSED" ||
      message.includes("ECONNRESET") ||
      message.includes("ETIMEDOUT");

    if (!isTransient) throw error;

    console.warn(`[Database] Erro transitório (${code ?? "desconhecido"}) — descartando pool e reconectando...`);
    _db = null; // força recriação do pool na próxima chamada
    const freshDb = await requireDb();
    return fn(freshDb);
  }
}

export async function getVisibleSchools(user: typeof users.$inferSelect) {
  const db = await requireDb();
  if (user.role === "admin") return db.select().from(schools).orderBy(asc(schools.name));
  const rows = await db
    .select({ school: schools })
    .from(schoolMemberships)
    .innerJoin(schools, eq(schoolMemberships.schoolId, schools.id))
    .where(eq(schoolMemberships.userId, user.id))
    .orderBy(asc(schools.name));
  return rows.map(row => row.school);
}

export async function userCanAccessSchool(user: typeof users.$inferSelect, schoolId: number) {
  if (hasSchoolAccess(user.role, false)) return true;
  const db = await requireDb();
  const membership = await db
    .select({ id: schoolMemberships.id })
    .from(schoolMemberships)
    .where(and(eq(schoolMemberships.schoolId, schoolId), eq(schoolMemberships.userId, user.id)))
    .limit(1);
  return hasSchoolAccess(user.role, Boolean(membership[0]));
}

export async function getCycleById(cycleId: number) {
  const db = await requireDb();
  const rows = await db.select().from(inventoryCycles).where(eq(inventoryCycles.id, cycleId)).limit(1);
  return rows[0];
}

export async function getSchoolOverview(schoolId: number, year: number) {
  const db = await requireDb();
  const school = (await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1))[0];
  if (!school) return null;
  const cycle = (
    await db
      .select()
      .from(inventoryCycles)
      .where(and(eq(inventoryCycles.schoolId, schoolId), eq(inventoryCycles.year, year)))
      .limit(1)
  )[0];
  if (!cycle) return { school, cycle: null, members: [], items: [], issues: [], documents: [], notes: null, history: [] };
  const [members, items, issues, documents, notes, history] = await Promise.all([
    db.select().from(committeeMembers).where(eq(committeeMembers.cycleId, cycle.id)).orderBy(asc(committeeMembers.id)),
    db.select().from(inventoryItems).where(eq(inventoryItems.cycleId, cycle.id)).orderBy(asc(inventoryItems.id)),
    db.select().from(inventoryIssues).where(eq(inventoryIssues.cycleId, cycle.id)).orderBy(asc(inventoryIssues.id)),
    db.select().from(inventoryDocuments).where(eq(inventoryDocuments.cycleId, cycle.id)).orderBy(asc(inventoryDocuments.uploadedAt)),
    db.select().from(inventoryNotes).where(eq(inventoryNotes.cycleId, cycle.id)).limit(1),
    db.select().from(validationHistory).where(eq(validationHistory.cycleId, cycle.id)).orderBy(asc(validationHistory.createdAt)),
  ]);
  return { school, cycle, members, items, issues, documents, notes: notes[0] ?? null, history };
}

export async function getManagementCycles(year: number) {
  const db = await requireDb();
  return db
    .select({ cycle: inventoryCycles, school: schools })
    .from(inventoryCycles)
    .innerJoin(schools, eq(inventoryCycles.schoolId, schools.id))
    .where(eq(inventoryCycles.year, year))
    .orderBy(asc(schools.name));
}

export async function getManagementItems(year: number) {
  const db = await requireDb();
  return db
    .select({ item: inventoryItems, school: schools, cycle: inventoryCycles })
    .from(inventoryItems)
    .innerJoin(inventoryCycles, eq(inventoryItems.cycleId, inventoryCycles.id))
    .innerJoin(schools, eq(inventoryCycles.schoolId, schools.id))
    .where(eq(inventoryCycles.year, year));
}

export async function getManagementIssues(year: number) {
  const db = await requireDb();
  return db
    .select({ issue: inventoryIssues, school: schools, cycle: inventoryCycles })
    .from(inventoryIssues)
    .innerJoin(inventoryCycles, eq(inventoryIssues.cycleId, inventoryCycles.id))
    .innerJoin(schools, eq(inventoryCycles.schoolId, schools.id))
    .where(eq(inventoryCycles.year, year));
}

export async function getManagementControlExportData(year: number) {
  const db = await requireDb();
  const [schoolRows, cycleRows] = await Promise.all([
    db.select().from(schools).orderBy(asc(schools.name)),
    db.select().from(inventoryCycles).where(eq(inventoryCycles.year, year)),
  ]);
  const cycleIds = cycleRows.map(cycle => cycle.id);
  const empty = Promise.resolve([]);
  const [itemRows, memberRows, issueRows, documentRows, noteRows] = await Promise.all([
    cycleIds.length ? db.select().from(inventoryItems).where(inArray(inventoryItems.cycleId, cycleIds)).orderBy(asc(inventoryItems.propertyNumber)) : empty,
    cycleIds.length ? db.select().from(committeeMembers).where(inArray(committeeMembers.cycleId, cycleIds)).orderBy(asc(committeeMembers.id)) : empty,
    cycleIds.length ? db.select().from(inventoryIssues).where(inArray(inventoryIssues.cycleId, cycleIds)).orderBy(asc(inventoryIssues.id)) : empty,
    cycleIds.length ? db.select().from(inventoryDocuments).where(inArray(inventoryDocuments.cycleId, cycleIds)).orderBy(asc(inventoryDocuments.uploadedAt)) : empty,
    cycleIds.length ? db.select().from(inventoryNotes).where(inArray(inventoryNotes.cycleId, cycleIds)) : empty,
  ]);
  const cycleBySchool = new Map(cycleRows.map(cycle => [cycle.schoolId, cycle]));
  const byCycle = <T extends { cycleId: number }>(rows: T[]) => rows.reduce<Map<number, T[]>>((groups, row) => {
    groups.set(row.cycleId, [...(groups.get(row.cycleId) ?? []), row]);
    return groups;
  }, new Map());
  const itemsByCycle = byCycle(itemRows);
  const membersByCycle = byCycle(memberRows);
  const issuesByCycle = byCycle(issueRows);
  const documentsByCycle = byCycle(documentRows);
  const notesByCycle = new Map(noteRows.map(note => [note.cycleId, note]));

  return schoolRows.map(school => {
    const cycle = cycleBySchool.get(school.id) ?? null;
    return {
      school,
      cycle,
      items: cycle ? itemsByCycle.get(cycle.id) ?? [] : [],
      members: cycle ? membersByCycle.get(cycle.id) ?? [] : [],
      issues: cycle ? issuesByCycle.get(cycle.id) ?? [] : [],
      documents: cycle ? documentsByCycle.get(cycle.id) ?? [] : [],
      notes: cycle ? notesByCycle.get(cycle.id) ?? null : null,
    };
  });
}

export async function listAssignableUsers() {
  const db = await requireDb();
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).orderBy(asc(users.name));
}

export async function findSchoolMember(schoolId: number, userId: number) {
  const db = await requireDb();
  const result = await db
    .select()
    .from(schoolMemberships)
    .where(and(eq(schoolMemberships.schoolId, schoolId), eq(schoolMemberships.userId, userId)))
    .limit(1);
  return result[0];
}

export async function linkUserToSchoolByEmail(userId: number, email?: string | null) {
  if (!email) return null;
  const db = await getDb();
  if (!db) return null;

  const normalized = email.trim().toLowerCase();
  const [school] = await db
    .select({ id: schools.id })
    .from(schools)
    .where(sql`lower(trim(${schools.email})) = ${normalized}`)
    .limit(1);
  if (!school) return null;

  const existing = await findSchoolMember(school.id, userId);
  if (existing) return school.id;

  await db
    .insert(schoolMemberships)
    .values({ schoolId: school.id, userId, accessRole: "contributor" })
    .onDuplicateKeyUpdate({ set: { schoolId: school.id } });

  return school.id;
}

export async function searchSchoolsForAccessRequest(query: string) {
  const db = await requireDb();
  const term = query.trim().toLowerCase();
  if (!term) return [];
  const pattern = `%${term}%`;
  return db
    .select({
      id: schools.id,
      name: schools.name,
      schoolCode: schools.schoolCode,
      city: schools.city,
      regionalOffice: schools.regionalOffice,
    })
    .from(schools)
    .where(
      sql`lower(${schools.name}) like ${pattern}
        or lower(coalesce(${schools.schoolCode}, '')) like ${pattern}
        or lower(coalesce(${schools.city}, '')) like ${pattern}`,
    )
    .orderBy(asc(schools.name))
    .limit(20);
}

export async function requestSchoolAccess(userId: number, schoolId: number) {
  const db = await requireDb();
  const school = (await db.select({ id: schools.id, name: schools.name }).from(schools).where(eq(schools.id, schoolId)).limit(1))[0];
  if (!school) throw new Error("Escola não encontrada.");

  const membership = await findSchoolMember(schoolId, userId);
  if (membership) return { status: "approved" as const, school };

  const existing = (await db
    .select()
    .from(schoolAccessRequests)
    .where(and(eq(schoolAccessRequests.schoolId, schoolId), eq(schoolAccessRequests.userId, userId)))
    .limit(1))[0];

  if (existing?.status === "pending") return { status: "pending" as const, school };
  if (existing?.status === "approved") return { status: "approved" as const, school };

  if (existing) {
    await db.update(schoolAccessRequests)
      .set({ status: "pending", reviewedAt: null, reviewedByUserId: null, updatedAt: new Date() })
      .where(eq(schoolAccessRequests.id, existing.id));
  } else {
    await db.insert(schoolAccessRequests).values({ schoolId, userId, status: "pending" });
  }

  return { status: "pending" as const, school };
}

export async function getPendingSchoolAccessRequests(schoolId: number) {
  const db = await requireDb();
  return db
    .select({
      request: schoolAccessRequests,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(schoolAccessRequests)
    .innerJoin(users, eq(schoolAccessRequests.userId, users.id))
    .where(and(eq(schoolAccessRequests.schoolId, schoolId), eq(schoolAccessRequests.status, "pending")))
    .orderBy(asc(schoolAccessRequests.createdAt));
}

export async function getPendingSchoolAccessCounts() {
  const db = await requireDb();
  const rows = await db
    .select({
      schoolId: schoolAccessRequests.schoolId,
      count: sql<number>`count(*)`,
    })
    .from(schoolAccessRequests)
    .where(eq(schoolAccessRequests.status, "pending"))
    .groupBy(schoolAccessRequests.schoolId);
  return Object.fromEntries(rows.map(row => [row.schoolId, Number(row.count)]));
}

export async function reviewSchoolAccessRequest(requestId: number, reviewerId: number, decision: "approved" | "rejected") {
  const db = await requireDb();
  const request = (await db.select().from(schoolAccessRequests).where(eq(schoolAccessRequests.id, requestId)).limit(1))[0];
  if (!request) throw new Error("Solicitação não encontrada.");

  return db.transaction(async tx => {
    if (request.status !== "pending") {
      return { status: request.status, schoolId: request.schoolId, userId: request.userId };
    }

    if (decision === "approved") {
      await tx
        .insert(schoolMemberships)
        .values({ schoolId: request.schoolId, userId: request.userId, accessRole: "contributor" })
        .onDuplicateKeyUpdate({ set: { schoolId: request.schoolId } });
    }

    await tx
      .update(schoolAccessRequests)
      .set({ status: decision, reviewedAt: new Date(), reviewedByUserId: reviewerId, updatedAt: new Date() })
      .where(eq(schoolAccessRequests.id, requestId));

    return { status: decision, schoolId: request.schoolId, userId: request.userId };
  });
}

export async function getSchoolMembers(schoolId: number) {
  const db = await requireDb();
  return db
    .select({
      membership: schoolMemberships,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      },
    })
    .from(schoolMemberships)
    .innerJoin(users, eq(schoolMemberships.userId, users.id))
    .where(eq(schoolMemberships.schoolId, schoolId));
}

export async function getCyclesForSchoolIds(schoolIds: number[], year: number) {
  if (schoolIds.length === 0) return [];
  const db = await requireDb();
  return db.select().from(inventoryCycles).where(and(inArray(inventoryCycles.schoolId, schoolIds), eq(inventoryCycles.year, year)));
}
