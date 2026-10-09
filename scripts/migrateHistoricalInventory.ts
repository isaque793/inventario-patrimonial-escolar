/**
 * Prepara o banco para o histórico de cargas patrimoniais. Pode ser rodado
 * mais de uma vez: só cria o que ainda não existe.
 *
 *   pnpm tsx scripts/migrateHistoricalInventory.ts --dry-run   (mostra o que faria)
 *   pnpm tsx scripts/migrateHistoricalInventory.ts             (aplica)
 *
 * Usa o DATABASE_URL do .env (banco local ou Aiven).
 *
 * O que verifica/cria:
 *   - tabela historicalInventoryLoads
 *   - tabela historicalInventoryItems
 *   - coluna schools.siadCode + índice único
 *   - coluna inventoryIssues.sei (campo SEI das pendências, que não tinha migration)
 *
 * Por que não drizzle-kit push: no MySQL do Windows os nomes de tabela ficam em
 * minúsculas e o push passa a querer recriar/apagar tabelas existentes.
 */
import { connectFromEnv, type RowDataPacket } from "./lib/scriptDb";

type Step = { description: string; sql: string };

const CREATE_LOADS = `CREATE TABLE IF NOT EXISTS \`historicalInventoryLoads\` (
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

const CREATE_ITEMS = `CREATE TABLE IF NOT EXISTS \`historicalInventoryItems\` (
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

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { connection, database, host } = await connectFromEnv();

  try {
    // Nomes comparados em minúsculas (MySQL no Windows).
    const [tableRows] = await connection.query<RowDataPacket[]>(
      "SELECT LOWER(TABLE_NAME) AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",
      [database],
    );
    const tables = new Set(tableRows.map(row => String(row.name)));

    const [columnRows] = await connection.query<RowDataPacket[]>(
      "SELECT LOWER(TABLE_NAME) AS tableName, LOWER(COLUMN_NAME) AS columnName FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?",
      [database],
    );
    const hasColumn = (table: string, column: string) =>
      columnRows.some(row => row.tableName === table.toLowerCase() && row.columnName === column.toLowerCase());

    const [indexRows] = await connection.query<RowDataPacket[]>(
      "SELECT LOWER(TABLE_NAME) AS tableName, LOWER(INDEX_NAME) AS indexName FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ?",
      [database],
    );
    const hasIndex = (table: string, index: string) =>
      indexRows.some(row => row.tableName === table.toLowerCase() && row.indexName === index.toLowerCase());

    for (const required of ["schools", "inventoryissues"]) {
      if (!tables.has(required)) throw new Error(`A tabela ${required} não existe neste banco. Ele não parece ser o banco do sistema.`);
    }

    const steps: Step[] = [];
    if (!tables.has("historicalinventoryloads")) steps.push({ description: "Criar tabela historicalInventoryLoads", sql: CREATE_LOADS });
    if (!tables.has("historicalinventoryitems")) steps.push({ description: "Criar tabela historicalInventoryItems", sql: CREATE_ITEMS });
    if (!hasColumn("schools", "siadCode")) {
      steps.push({ description: "Adicionar coluna schools.siadCode", sql: "ALTER TABLE `schools` ADD COLUMN `siadCode` varchar(20) NULL AFTER `schoolCode`" });
    }
    if (!hasIndex("schools", "school_siad_code_unique")) {
      steps.push({ description: "Criar índice único school_siad_code_unique", sql: "CREATE UNIQUE INDEX `school_siad_code_unique` ON `schools` (`siadCode`)" });
    }
    if (!hasColumn("inventoryIssues", "sei")) {
      steps.push({ description: "Adicionar coluna inventoryIssues.sei", sql: "ALTER TABLE `inventoryIssues` ADD COLUMN `sei` varchar(120) NULL" });
    }

    console.log(`\nBanco: ${database} em ${host}\n`);
    if (!steps.length) {
      console.log("✔ Nada a fazer: o banco já está preparado para o histórico.\n");
      return;
    }

    for (const step of steps) {
      if (dryRun) {
        console.log(`• ${step.description}`);
        continue;
      }
      await connection.query(step.sql);
      console.log(`✔ ${step.description}`);
    }
    console.log(dryRun ? "\n(dry-run) Nada foi alterado. Rode sem --dry-run para aplicar.\n" : "\n✔ Banco preparado.\n");
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error("\n✖ Erro:", error instanceof Error ? error.message : error);
  process.exit(1);
});
