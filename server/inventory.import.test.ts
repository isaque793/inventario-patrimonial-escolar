import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { inventoryCycles, inventoryItems } from "../drizzle/schema";

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => {
  const state = { cycles: [] as Row[], itemQueue: [] as Row[][], inserted: [] as Row[][], updated: [] as Row[], access: true, cycleById: null as Row | null };
  return { state };
});

function makeDb() {
  // Cada consulta a inventoryItems consome a próxima lista da fila (a ordem das consultas é fixa).
  const rowsFor = (table: unknown) => (table === inventoryCycles ? mocks.state.cycles : table === inventoryItems ? mocks.state.itemQueue.shift() ?? [] : []);
  const select = () => ({
    from: (table: unknown) => {
      const rows = () => Promise.resolve(rowsFor(table));
      const result: any = { orderBy: rows, limit: rows, then: (resolve: any, reject: any) => rows().then(resolve, reject) };
      return { where: () => result, orderBy: rows, then: (resolve: any, reject: any) => rows().then(resolve, reject) };
    },
  });
  const insert = () => ({ values: async (values: Row | Row[]) => { mocks.state.inserted.push(Array.isArray(values) ? values : [values]); return [{ insertId: 1 }]; } });
  const update = () => ({ set: (values: Row) => ({ where: async () => { mocks.state.updated.push(values); } }) });
  const db: any = { select, insert, update };
  db.transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(db);
  return db;
}

vi.mock("./db", () => ({
  findSchoolMember: vi.fn(),
  getCycleById: vi.fn(async () => mocks.state.cycleById),
  getManagementCycles: vi.fn(),
  getManagementControlExportData: vi.fn(),
  getManagementIssues: vi.fn(),
  getManagementItems: vi.fn(),
  getSchoolMembers: vi.fn(),
  getSchoolOverview: vi.fn(),
  getVisibleSchools: vi.fn(),
  historicalPropertyNumberCandidates: (value: string) => [value],
  listAssignableUsers: vi.fn(),
  requireDb: vi.fn(async () => makeDb()),
  userCanAccessSchool: vi.fn(async () => mocks.state.access),
}));

import { appRouter } from "./routers";

function userContext(): TrpcContext {
  return {
    user: { id: 11, openId: "school-user", name: "Escola", email: "school@example.com", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const sourceItem = (id: number, propertyNumber: string, extra: Row = {}) => ({
  id, cycleId: 1, propertyNumber, quantity: 1, description: `Bem ${propertyNumber}`, technicalDetails: null, expenseCode: "52.06",
  conservationCode: null, conservationState: "Bom", unitValue: "10.00", totalValue: "10.00", currentSituation: "Em uso",
  sourceCycleId: null, sourceItemId: null, importStatus: null, ...extra,
});

const pre = { id: 1, schoolId: 4, year: 2026, type: "pre_inventory", status: "submitted" };
const official = (status = "draft") => ({ id: 2, schoolId: 4, year: 2026, type: "official", status });

beforeEach(() => {
  mocks.state.cycles = [pre, official()];
  // importação: 1ª consulta = bens do pré-inventário, 2ª = bens do oficial
  mocks.state.itemQueue = [[sourceItem(10, "A"), sourceItem(11, "B")], []];
  mocks.state.inserted = [];
  mocks.state.updated = [];
  mocks.state.access = true;
  mocks.state.cycleById = official();
});

describe("inventory.importPreInventory", () => {
  it("copia os bens para o oficial como aguardando conferência, guardando a origem", async () => {
    const result = await appRouter.createCaller(userContext()).inventory.importPreInventory({ schoolId: 4, year: 2026 });
    expect(result).toMatchObject({ imported: 2, alreadyImported: 0 });
    const rows = mocks.state.inserted[0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ cycleId: 2, sourceCycleId: 1, sourceItemId: 10, importStatus: "pending_confirmation", propertyNumber: "A" });
    // a origem nunca é alterada
    expect(mocks.state.updated).toEqual([]);
  });

  it("repetir a importação não copia de novo o que já veio da mesma origem", async () => {
    mocks.state.itemQueue = [[sourceItem(10, "A"), sourceItem(11, "B")], [sourceItem(20, "A", { cycleId: 2, sourceCycleId: 1, sourceItemId: 10, importStatus: "pending_confirmation" })]];
    const result = await appRouter.createCaller(userContext()).inventory.importPreInventory({ schoolId: 4, year: 2026 });
    expect(result).toMatchObject({ imported: 1, alreadyImported: 1 });
    expect(mocks.state.inserted[0].map(row => row.sourceItemId)).toEqual([11]);
  });

  it("importa só os bens selecionados", async () => {
    await appRouter.createCaller(userContext()).inventory.importPreInventory({ schoolId: 4, year: 2026, sourceItemIds: [11] });
    expect(mocks.state.inserted[0].map(row => row.sourceItemId)).toEqual([11]);
  });

  it("rejeita seleção com bem que não é do pré-inventário da escola", async () => {
    await expect(appRouter.createCaller(userContext()).inventory.importPreInventory({ schoolId: 4, year: 2026, sourceItemIds: [999] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.state.inserted).toEqual([]);
  });

  it("não deixa importar para escola sem acesso", async () => {
    mocks.state.access = false;
    await expect(appRouter.createCaller(userContext()).inventory.importPreInventory({ schoolId: 9, year: 2026 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("exige o ciclo oficial criado", async () => {
    mocks.state.cycles = [pre];
    await expect(appRouter.createCaller(userContext()).inventory.importPreInventory({ schoolId: 4, year: 2026 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("exige o pré-inventário do mesmo ano", async () => {
    mocks.state.cycles = [official()];
    await expect(appRouter.createCaller(userContext()).inventory.importPreInventory({ schoolId: 4, year: 2026 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("bloqueia a importação quando o oficial já foi enviado para análise", async () => {
    mocks.state.cycles = [pre, official("under_review")];
    mocks.state.cycleById = official("under_review");
    await expect(appRouter.createCaller(userContext()).inventory.importPreInventory({ schoolId: 4, year: 2026 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.state.inserted).toEqual([]);
  });
});

describe("inventory.importPreview", () => {
  it("informa a quantidade a copiar antes de confirmar, sem gravar nada", async () => {
    const preview = await appRouter.createCaller(userContext()).inventory.importPreview({ schoolId: 4, year: 2026 });
    expect(preview.summary).toMatchObject({ toImport: 2, alreadyImported: 0 });
    expect(preview.items.map(item => item.state)).toEqual(["new", "new"]);
    expect(mocks.state.inserted).toEqual([]);
  });
});

const confirmInput = { cycleId: 2, itemId: 20, propertyNumber: "A", quantity: 1, description: "Bem A", expenseCode: "52.06", conservationState: "Bom", unitValue: 10, currentSituation: "Em uso" };

describe("inventory.confirmImportedItem", () => {
  beforeEach(() => {
    mocks.state.cycleById = official();
    mocks.state.itemQueue = [[sourceItem(20, "A", { cycleId: 2, sourceCycleId: 1, sourceItemId: 10, importStatus: "pending_confirmation" })], []];
  });

  it("atualiza o próprio registro importado para conferido, sem criar outro bem", async () => {
    const result = await appRouter.createCaller(userContext()).inventory.confirmImportedItem(confirmInput);
    expect(result).toMatchObject({ id: 20, importStatus: "confirmed" });
    expect(mocks.state.updated[0]).toMatchObject({ importStatus: "confirmed", confirmedBy: 11 });
    expect(mocks.state.updated[0].confirmedAt).toBeInstanceOf(Date);
    expect(mocks.state.inserted).toEqual([]);
  });

  it("não reconfere um bem já conferido", async () => {
    mocks.state.itemQueue = [[sourceItem(20, "A", { cycleId: 2, importStatus: "confirmed" })]];
    await expect(appRouter.createCaller(userContext()).inventory.confirmImportedItem(confirmInput)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.state.updated).toEqual([]);
  });

  it("recusa bem de outro ciclo ou que não veio da importação", async () => {
    mocks.state.itemQueue = [[sourceItem(20, "A", { cycleId: 1 })]];
    await expect(appRouter.createCaller(userContext()).inventory.confirmImportedItem(confirmInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("não confirma no pré-inventário", async () => {
    mocks.state.cycleById = pre;
    await expect(appRouter.createCaller(userContext()).inventory.confirmImportedItem({ ...confirmInput, cycleId: 1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("inventory.findImportedItem", () => {
  it("devolve o bem importado pendente do ciclo oficial", async () => {
    mocks.state.cycleById = official();
    mocks.state.itemQueue = [[sourceItem(20, "A", { cycleId: 2, importStatus: "pending_confirmation" })]];
    const found = await appRouter.createCaller(userContext()).inventory.findImportedItem({ cycleId: 2, propertyNumber: "A" });
    expect(found).toMatchObject({ id: 20, importStatus: "pending_confirmation" });
  });

  it("no pré-inventário não há bem importado", async () => {
    mocks.state.cycleById = pre;
    await expect(appRouter.createCaller(userContext()).inventory.findImportedItem({ cycleId: 1, propertyNumber: "A" })).resolves.toBeNull();
  });

  it("sem acesso à escola, não consulta", async () => {
    mocks.state.cycleById = official();
    mocks.state.access = false;
    await expect(appRouter.createCaller(userContext()).inventory.findImportedItem({ cycleId: 2, propertyNumber: "A" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
