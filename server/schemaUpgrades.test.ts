import { describe, expect, it } from "vitest";
import { applySchemaUpgrades, planSchemaUpgrades, type Queryable } from "./schemaUpgrades";

function fakeDb(tables: Record<string, string[]>, indexes: Record<string, string[]> = {}) {
  const executed: string[] = [];
  const connection: Queryable = {
    async query(sql: string) {
      if (sql.includes("information_schema.TABLES")) return [Object.keys(tables).map(name => ({ name: name.toLowerCase() })), []];
      if (sql.includes("information_schema.COLUMNS")) {
        return [
          Object.entries(tables).flatMap(([table, columns]) =>
            columns.map(column => {
              // "schoolId!" = coluna NOT NULL
              const notNull = column.endsWith("!");
              return { tableName: table.toLowerCase(), columnName: column.replace("!", "").toLowerCase(), nullable: notNull ? "NO" : "YES" };
            }),
          ),
          [],
        ];
      }
      if (sql.includes("information_schema.STATISTICS")) {
        return [Object.entries(indexes).flatMap(([table, names]) => names.map(indexName => ({ tableName: table.toLowerCase(), indexName: indexName.toLowerCase() }))), []];
      }
      executed.push(sql);
      return [[], []];
    },
  };
  return { connection, executed };
}

describe("schemaUpgrades", () => {
  it("banco de produção antigo: acrescenta só o que falta, na ordem certa", async () => {
    const { connection, executed } = fakeDb({ schools: ["id", "name", "schoolCode"], inventoryIssues: ["id", "sei"] });
    const steps = await applySchemaUpgrades(connection, "prod");
    expect(steps.map(step => step.description)).toEqual([
      "Adicionar coluna schools.siadCode",
      "Criar índice único school_siad_code_unique",
      "Criar tabela historicalInventoryLoads",
      "Criar tabela historicalInventoryItems",
    ]);
    expect(executed).toHaveLength(4);
    expect(executed.every(sql => !/\b(DROP|RENAME|MODIFY)\b/i.test(sql))).toBe(true);
  });

  it("banco já atualizado (nomes em minúsculas, como no Windows): não faz nada", async () => {
    const { connection, executed } = fakeDb(
      {
        schools: ["id", "siadCode"],
        inventoryissues: ["sei"],
        historicalinventoryloads: ["id", "schoolId", "siadCode"],
        historicalinventoryitems: ["id"],
      },
      { schools: ["school_siad_code_unique"] },
    );
    expect(await applySchemaUpgrades(connection, "local")).toEqual([]);
    expect(executed).toEqual([]);
  });

  it("histórico já criado com schoolId obrigatório: torna opcional e acrescenta siadCode", async () => {
    const { connection, executed } = fakeDb(
      {
        schools: ["id", "siadCode"],
        inventoryIssues: ["sei"],
        historicalInventoryLoads: ["id", "schoolId!"],
        historicalInventoryItems: ["id"],
      },
      { schools: ["school_siad_code_unique"] },
    );
    const steps = await applySchemaUpgrades(connection, "prod");
    expect(steps.map(step => step.description)).toEqual([
      "Permitir carga histórica sem escola (historicalInventoryLoads.schoolId opcional)",
      "Adicionar coluna historicalInventoryLoads.siadCode",
    ]);
    expect(executed[0]).toContain("MODIFY COLUMN `schoolId` int NULL");
  });

  it("dry-run não executa nada", async () => {
    const { connection, executed } = fakeDb({ schools: ["id"], inventoryIssues: ["id"] });
    const steps = await applySchemaUpgrades(connection, "prod", { dryRun: true });
    expect(steps.length).toBeGreaterThan(0);
    expect(executed).toEqual([]);
  });

  it("banco vazio: não mexe (drizzle-kit cria do zero)", async () => {
    const { connection } = fakeDb({});
    expect(await planSchemaUpgrades(connection, "novo")).toEqual([]);
  });
});
