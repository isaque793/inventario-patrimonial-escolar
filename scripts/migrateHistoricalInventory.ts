/**
 * Aplica à mão os ajustes de banco de server/schemaUpgrades.ts (tabelas do
 * histórico, schools.siadCode, inventoryIssues.sei). O servidor já faz isso
 * sozinho ao iniciar; este script serve para ver a prévia e para bancos de
 * teste. Pode rodar mais de uma vez: só cria o que falta.
 *
 *   pnpm tsx scripts/migrateHistoricalInventory.ts --dry-run   (mostra o que faria)
 *   pnpm tsx scripts/migrateHistoricalInventory.ts             (aplica)
 *
 * Usa o DATABASE_URL do .env.
 */
import { applySchemaUpgrades } from "../server/schemaUpgrades";
import { connectFromEnv } from "./lib/scriptDb";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { connection, database, host } = await connectFromEnv();
  try {
    console.log(`\nBanco: ${database} em ${host}\n`);
    const steps = await applySchemaUpgrades(connection, database, { dryRun, log: message => console.log(message) });
    if (!steps.length) console.log("✔ Nada a fazer: o banco já está atualizado.");
    else if (dryRun) console.log("\n(dry-run) Nada foi alterado. Rode sem --dry-run para aplicar.");
    else console.log("\n✔ Banco atualizado.");
    console.log("");
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error("\n✖ Erro:", error instanceof Error ? error.message : error);
  process.exit(1);
});
