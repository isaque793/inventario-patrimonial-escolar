import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const inserted: unknown[] = [];
  const db = {
    select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => selectResults.shift() ?? [] }) }) })),
    insert: vi.fn(() => ({ values: vi.fn(async (values: unknown) => { inserted.push(values); return [{ insertId: 77 }]; }) })),
  };
  return { db, selectResults, inserted, getSchoolOverview: vi.fn(async () => ({ cycle: null })), userCanAccessSchool: vi.fn(async () => true) };
});

vi.mock("./db", () => ({
  findSchoolMember: vi.fn(),
  getCycleById: vi.fn(),
  getManagementCycles: vi.fn(),
  getManagementControlExportData: vi.fn(),
  getManagementIssues: vi.fn(),
  getManagementItems: vi.fn(),
  getSchoolMembers: vi.fn(),
  getSchoolOverview: mocks.getSchoolOverview,
  getVisibleSchools: vi.fn(),
  listAssignableUsers: vi.fn(),
  requireDb: vi.fn(async () => mocks.db),
  userCanAccessSchool: mocks.userCanAccessSchool,
}));

import { appRouter } from "./routers";

function userContext(): TrpcContext {
  return {
    user: { id: 11, openId: "school-user", name: "Escola", email: "school@example.com", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

beforeEach(() => {
  mocks.selectResults.length = 0;
  mocks.inserted.length = 0;
  mocks.getSchoolOverview.mockClear();
  mocks.userCanAccessSchool.mockResolvedValue(true);
});

describe("inventory.overview por tipo de ciclo", () => {
  it("sem tipo, continua consultando o pré-inventário", async () => {
    await appRouter.createCaller(userContext()).inventory.overview({ schoolId: 4, year: 2026 });
    expect(mocks.getSchoolOverview).toHaveBeenCalledWith(4, 2026, "pre_inventory");
  });

  it("repassa o tipo oficial", async () => {
    await appRouter.createCaller(userContext()).inventory.overview({ schoolId: 4, year: 2026, type: "official" });
    expect(mocks.getSchoolOverview).toHaveBeenCalledWith(4, 2026, "official");
  });

  it("rejeita tipo desconhecido", async () => {
    await expect(appRouter.createCaller(userContext()).inventory.overview({ schoolId: 4, year: 2026, type: "outro" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("não consulta dados de escola sem acesso", async () => {
    mocks.userCanAccessSchool.mockResolvedValue(false);
    await expect(appRouter.createCaller(userContext()).inventory.overview({ schoolId: 9, year: 2026, type: "official" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getSchoolOverview).not.toHaveBeenCalled();
  });
});

describe("inventory.createCycle por tipo de ciclo", () => {
  it("cria o ciclo oficial mesmo quando já existe o pré-inventário", async () => {
    // 1ª consulta (procura ciclo oficial): nada; 2ª (lê o ciclo criado): o novo ciclo
    mocks.selectResults.push([], [{ id: 77, schoolId: 4, year: 2026, type: "official" }]);
    const cycle = await appRouter.createCaller(userContext()).inventory.createCycle({ schoolId: 4, year: 2026, type: "official" });
    expect(mocks.inserted).toEqual([{ schoolId: 4, year: 2026, type: "official" }]);
    expect(cycle).toMatchObject({ id: 77, type: "official" });
  });

  it("sem tipo, cria pré-inventário", async () => {
    mocks.selectResults.push([], [{ id: 78, schoolId: 4, year: 2026, type: "pre_inventory" }]);
    await appRouter.createCaller(userContext()).inventory.createCycle({ schoolId: 4, year: 2026 });
    expect(mocks.inserted).toEqual([{ schoolId: 4, year: 2026, type: "pre_inventory" }]);
  });

  it("reaproveita o ciclo do mesmo tipo que já existe", async () => {
    const existing = { id: 5, schoolId: 4, year: 2026, type: "official" };
    mocks.selectResults.push([existing]);
    await expect(appRouter.createCaller(userContext()).inventory.createCycle({ schoolId: 4, year: 2026, type: "official" })).resolves.toEqual(existing);
    expect(mocks.inserted).toEqual([]);
  });
});
