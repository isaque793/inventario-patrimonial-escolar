import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => {
  const updates: unknown[] = [];
  const history: unknown[] = [];
  // Itens e integrantes da subcomissão; documentos não são consultados (opcionais).
  const selectResults: unknown[][] = [
    [{ id: 1 }],
    [{ id: 1 }],
  ];
  const db = {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(async () => selectResults.shift() ?? []) })) })),
    update: vi.fn(() => ({ set: vi.fn((data: unknown) => { updates.push(data); return { where: vi.fn(async () => undefined) }; }) })),
    insert: vi.fn(() => ({ values: vi.fn(async (data: unknown) => { history.push(data); return undefined; }) })),
  };
  return { db, updates, history, selectResults };
});

vi.mock("./db", () => ({
  findSchoolMember: vi.fn(),
  getCycleById: vi.fn(async () => ({ id: 77, schoolId: 4, year: 2026, status: "draft" })),
  getManagementCycles: vi.fn(),
  getManagementControlExportData: vi.fn(),
  getManagementIssues: vi.fn(),
  getManagementItems: vi.fn(),
  getSchoolMembers: vi.fn(),
  getSchoolOverview: vi.fn(),
  getVisibleSchools: vi.fn(),
  listAssignableUsers: vi.fn(),
  requireDb: vi.fn(async () => mocks.db),
  userCanAccessSchool: vi.fn(async () => true),
}));

import { appRouter } from "./routers";

function userContext(): TrpcContext {
  return {
    user: { id: 11, openId: "school-user", name: "Escola", email: "school@example.com", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("inventory.submit", () => {
  it("envia um ciclo elegível com um integrante, sem documentos assinados, registra a data e cria o histórico de submissão", async () => {
    const result = await appRouter.createCaller(userContext()).inventory.submit({ cycleId: 77 });

    expect(result).toEqual({ success: true });
    expect(mocks.updates).toEqual([expect.objectContaining({ status: "submitted", reviewNotes: null, submittedAt: expect.any(Date) })]);
    expect(mocks.history).toEqual([expect.objectContaining({ cycleId: 77, action: "submitted", note: "Inventário submetido pela escola.", performedByUserId: 11 })]);
  });
});
