import {
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});


export const passwordResetTokens = mysqlTable(
  "passwordResetTokens",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    usedAt: timestamp("usedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    tokenHashIdx: uniqueIndex("password_reset_token_hash_unique").on(table.tokenHash),
    userIdx: index("password_reset_user_idx").on(table.userId),
    expiresIdx: index("password_reset_expires_idx").on(table.expiresAt),
  }),
);

export const schools = mysqlTable(
  "schools",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    schoolCode: varchar("schoolCode", { length: 64 }),
    city: varchar("city", { length: 120 }),
    regionalOffice: varchar("regionalOffice", { length: 160 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    responsibleName: varchar("responsibleName", { length: 255 }),
    responsibleMasp: varchar("responsibleMasp", { length: 32 }),
    responsibleRole: varchar("responsibleRole", { length: 120 }),
    directorName: varchar("directorName", { length: 255 }),
    directorMasp: varchar("directorMasp", { length: 32 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    schoolCodeUnique: uniqueIndex("school_code_unique").on(table.schoolCode),
    emailUnique: uniqueIndex("school_email_unique").on(table.email),
  }),
);

export const schoolMemberships = mysqlTable(
  "schoolMemberships",
  {
    id: int("id").autoincrement().primaryKey(),
    schoolId: int("schoolId").notNull(),
    userId: int("userId").notNull(),
    accessRole: mysqlEnum("accessRole", ["coordinator", "contributor"])
      .default("contributor")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    schoolUserUnique: uniqueIndex("school_user_unique").on(table.schoolId, table.userId),
    schoolIdx: index("membership_school_idx").on(table.schoolId),
    userIdx: index("membership_user_idx").on(table.userId),
  }),
);

export const schoolAccessRequests = mysqlTable(
  "schoolAccessRequests",
  {
    id: int("id").autoincrement().primaryKey(),
    schoolId: int("schoolId").notNull(),
    userId: int("userId").notNull(),
    status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    reviewedAt: timestamp("reviewedAt"),
    reviewedByUserId: int("reviewedByUserId"),
  },
  table => ({
    schoolUserUnique: uniqueIndex("access_request_school_user_unique").on(table.schoolId, table.userId),
    schoolStatusIdx: index("access_request_school_status_idx").on(table.schoolId, table.status),
    userStatusIdx: index("access_request_user_status_idx").on(table.userId, table.status),
  }),
);

export const inventoryCycles = mysqlTable(
  "inventoryCycles",
  {
    id: int("id").autoincrement().primaryKey(),
    schoolId: int("schoolId").notNull(),
    year: int("year").notNull(),
    status: mysqlEnum("status", ["draft", "submitted", "under_review", "returned", "validated"])
      .default("draft")
      .notNull(),
    submittedAt: timestamp("submittedAt"),
    reviewedAt: timestamp("reviewedAt"),
    reviewNotes: text("reviewNotes"),
    archiveStatus: mysqlEnum("archiveStatus", ["ACTIVE", "PENDING", "ARCHIVED", "ERROR"])
      .default("ACTIVE")
      .notNull(),
    archivedAt: timestamp("archivedAt"),
    archiveLocation: varchar("archiveLocation", { length: 512 }),
    archiveVersion: int("archiveVersion"),
    archiveError: text("archiveError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    schoolYearUnique: uniqueIndex("cycle_school_year_unique").on(table.schoolId, table.year),
    schoolIdx: index("cycle_school_idx").on(table.schoolId),
    statusIdx: index("cycle_status_idx").on(table.status),
    archiveStatusIdx: index("cycle_archive_status_idx").on(table.archiveStatus),
  }),
);

export const committeeMembers = mysqlTable(
  "committeeMembers",
  {
    id: int("id").autoincrement().primaryKey(),
    cycleId: int("cycleId").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    jobTitle: varchar("jobTitle", { length: 160 }).notNull(),
    masp: varchar("masp", { length: 32 }).notNull(),
    isPresident: int("isPresident").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ cycleIdx: index("committee_cycle_idx").on(table.cycleId) }),
);

export const inventoryItems = mysqlTable(
  "inventoryItems",
  {
    id: int("id").autoincrement().primaryKey(),
    cycleId: int("cycleId").notNull(),
    propertyNumber: varchar("propertyNumber", { length: 80 }).notNull(),
    quantity: int("quantity").notNull(),
    description: text("description").notNull(),
    technicalDetails: text("technicalDetails"),
    expenseCode: varchar("expenseCode", { length: 16 }).notNull(),
    conservationCode: varchar("conservationCode", { length: 32 }),
    conservationState: varchar("conservationState", { length: 80 }).notNull(),
    unitValue: decimal("unitValue", { precision: 14, scale: 2 }).notNull(),
    totalValue: decimal("totalValue", { precision: 14, scale: 2 }).notNull(),
    currentSituation: varchar("currentSituation", { length: 160 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    cycleIdx: index("item_cycle_idx").on(table.cycleId),
    expenseIdx: index("item_expense_idx").on(table.expenseCode),
  }),
);

export const inventoryIssues = mysqlTable(
  "inventoryIssues",
  {
    id: int("id").autoincrement().primaryKey(),
    cycleId: int("cycleId").notNull(),
    issueType: mysqlEnum("issueType", [
      "not_found",
      "outside_register",
      "new_equipment",
      "transfer",
      "donation",
      "guard_term",
      "other",
    ]).notNull(),
    propertyNumber: varchar("propertyNumber", { length: 80 }),
    quantity: int("quantity"),
    description: text("description").notNull(),
    conservationState: varchar("conservationState", { length: 80 }),
    location: varchar("location", { length: 160 }),
    totalValue: decimal("totalValue", { precision: 14, scale: 2 }),
    originBody: varchar("originBody", { length: 255 }),
    currentSituation: varchar("currentSituation", { length: 160 }),
    pendingDescription: text("pendingDescription").notNull(),
    measuresTaken: text("measuresTaken"),
    resolutionStatus: mysqlEnum("resolutionStatus", ["open", "in_progress", "resolved"])
      .default("open")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    cycleIdx: index("issue_cycle_idx").on(table.cycleId),
    statusIdx: index("issue_status_idx").on(table.resolutionStatus),
  }),
);

export const inventoryNotes = mysqlTable(
  "inventoryNotes",
  {
    id: int("id").autoincrement().primaryKey(),
    cycleId: int("cycleId").notNull().unique(),
    problemsFound: text("problemsFound"),
    quantityDivergences: text("quantityDivergences"),
    valueDivergences: text("valueDivergences"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({ cycleIdx: index("notes_cycle_idx").on(table.cycleId) }),
);

export const inventoryDocuments = mysqlTable(
  "inventoryDocuments",
  {
    id: int("id").autoincrement().primaryKey(),
    cycleId: int("cycleId").notNull(),
    documentType: mysqlEnum("documentType", [
      "opening_minutes",
      "responsibility_term",
      "closing_minutes",
    ]).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    mimeType: varchar("mimeType", { length: 120 }).notNull(),
    fileSize: int("fileSize").notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    storageUrl: varchar("storageUrl", { length: 512 }).notNull(),
    uploadedByUserId: int("uploadedByUserId").notNull(),
    uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
  },
  table => ({
    cycleTypeIdx: index("document_cycle_type_idx").on(table.cycleId, table.documentType),
  }),
);

export const validationHistory = mysqlTable(
  "validationHistory",
  {
    id: int("id").autoincrement().primaryKey(),
    cycleId: int("cycleId").notNull(),
    action: mysqlEnum("action", ["submitted", "under_review", "returned", "validated"])
      .notNull(),
    note: text("note"),
    performedByUserId: int("performedByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ cycleIdx: index("validation_cycle_idx").on(table.cycleId) }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
