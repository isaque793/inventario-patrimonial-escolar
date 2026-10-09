/**
 * Ajustes de banco que só ACRESCENTAM estrutura (tabelas e colunas novas,
 * todas opcionais). São aplicados automaticamente quando o servidor inicia,
 * para que um deploy nunca rode código novo sobre um banco antigo.
 *
 * Também podem ser rodados à mão (com prévia):
 *   pnpm tsx scripts/migrateHistoricalInventory.ts --dry-run
 *
 * Regras para acrescentar um passo aqui:
 *   - só CREATE TABLE IF NOT EXISTS / ADD COLUMN NULL / CREATE INDEX;
 *   - nunca apagar, renomear ou mudar tipo de nada;
 *   - o código antigo tem que continuar funcionando depois do passo.
 *
 * Nomes de tabela são comparados em minúsculas (MySQL no Windows).
 */
import mysql from "mysql2/promise";

export type SchemaStep = { description: string; sql: string };

/** O mínimo de uma conexão mysql2 usado aqui (facilita testar). */
export type Queryable = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

const CREATE_HISTORICAL_LOADS = `CREATE TABLE IF NOT EXISTS \`historicalInventoryLoads\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`schoolId\` int NOT NULL,
  \`year\` int NOT NULL,
  \`sourceFileName\` varchar(255) NULL,
  \`description\` varchar(255) NULL,
  \`importedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  INDEX \`historical_load_school_idx\` (\`schoolId\`),
  INDEX \`historical_load_school_year_idx\` (\`schoolId\`, \`year\`)
)`;

const CREATE_HISTORICAL_ITEMS = `CREATE TABLE IF NOT EXISTS \`historicalInventoryItems\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`loadId\` int NOT NULL,
  \`propertyNumber\` varchar(80) NOT NULL,
  \`description\` text NULL,
  \`materialCode\` varchar(80) NULL,
  \`itemCode\` varchar(80) NULL,
  \`conservationState\` varchar(80) NULL,
  \`quantity\` int NULL,
  \`unitValue\` decimal(14,2) NULL,
  \`totalValue\` decimal(14,2) NULL,
  \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  INDEX \`historical_item_load_idx\` (\`loadId\`),
  INDEX \`historical_item_property_idx\` (\`propertyNumber\`),
  UNIQUE INDEX \`historical_item_load_property_unique\` (\`loadId\`, \`propertyNumber\`)
)`;

type Row = Record<string, unknown>;

async function rows(connection: Queryable, sql: string, params: unknown[]) {
  const result = (await connection.query(sql, params)) as [Row[], unknown];
  return result[0];
}

/** Lista o que falta no banco, sem alterar nada. */
export async function planSchemaUpgrades(connection: Queryable, database: string): Promise<SchemaStep[]> {
  const tables = new Set(
    (await rows(connection, "SELECT LOWER(TABLE_NAME) AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?", [database])).map(row =>
      String(row.name),
    ),
  );
  const columns = new Set(
    (
      await rows(
        connection,
        "SELECT LOWER(TABLE_NAME) AS tableName, LOWER(COLUMN_NAME) AS columnName FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?",
        [database],
      )
    ).map(row => `${row.tableName}.${row.columnName}`),
  );
  const indexes = new Set(
    (
      await rows(
        connection,
        "SELECT LOWER(TABLE_NAME) AS tableName, LOWER(INDEX_NAME) AS indexName FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ?",
        [database],
      )
    ).map(row => `${row.tableName}.${row.indexName}`),
  );

  // Banco vazio ou de outro sistema: não mexer (drizzle-kit cria tudo do zero).
  if (!tables.has("schools")) return [];

  const steps: SchemaStep[] = [];
  if (!columns.has("schools.siadcode")) {
    steps.push({ description: "Adicionar coluna schools.siadCode", sql: "ALTER TABLE `schools` ADD COLUMN `siadCode` varchar(20) NULL" });
  }
  if (!indexes.has("schools.school_siad_code_unique")) {
    steps.push({ description: "Criar índice único school_siad_code_unique", sql: "CREATE UNIQUE INDEX `school_siad_code_unique` ON `schools` (`siadCode`)" });
  }
  if (tables.has("inventoryissues") && !columns.has("inventoryissues.sei")) {
    steps.push({ description: "Adicionar coluna inventoryIssues.sei", sql: "ALTER TABLE `inventoryIssues` ADD COLUMN `sei` varchar(120) NULL" });
  }
  if (!tables.has("historicalinventoryloads")) {
    steps.push({ description: "Criar tabela historicalInventoryLoads", sql: CREATE_HISTORICAL_LOADS });
  }
  if (!tables.has("historicalinventoryitems")) {
    steps.push({ description: "Criar tabela historicalInventoryItems", sql: CREATE_HISTORICAL_ITEMS });
  }
  return steps;
}

export async function applySchemaUpgrades(
  connection: Queryable,
  database: string,
  options: { dryRun?: boolean; log?: (message: string) => void } = {},
) {
  const log = options.log ?? (() => undefined);
  const steps = await planSchemaUpgrades(connection, database);
  for (const step of steps) {
    if (options.dryRun) {
      log(`• ${step.description}`);
      continue;
    }
    await connection.query(step.sql);
    log(`✔ ${step.description}`);
  }
  return steps;
}

/** Opções de conexão a partir do DATABASE_URL (local sem SSL, Aiven com SSL). */
export function connectionOptionsFromUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  };
}

/**
 * Chamado na inicialização do servidor. Nunca derruba o servidor: se algo
 * falhar, registra o erro no log e segue.
 */
export async function runSchemaUpgradesOnStartup() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  let connection: mysql.Connection | null = null;
  try {
    const options = connectionOptionsFromUrl(databaseUrl);
    connection = await mysql.createConnection({ ...options, connectTimeout: 10_000 });
    const steps = await applySchemaUpgrades(connection, options.database, { log: message => console.log(`[Schema] ${message}`) });
    if (!steps.length) console.log("[Schema] Banco já atualizado.");
  } catch (error) {
    console.error("[Schema] Falha ao atualizar a estrutura do banco:", error instanceof Error ? error.message : error);
  } finally {
    await connection?.end().catch(() => undefined);
  }
}
