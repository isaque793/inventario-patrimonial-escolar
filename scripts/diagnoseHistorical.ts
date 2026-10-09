/**
 * Diagnóstico do histórico patrimonial: mostra em que ponto a consulta
 * "patrimônio encontrado no histórico" deixa de funcionar. Só lê.
 *
 *   pnpm tsx scripts/diagnoseHistorical.ts
 *   pnpm tsx scripts/diagnoseHistorical.ts --property 48431672
 *   pnpm tsx scripts/diagnoseHistorical.ts --property 48431672 --school "EDMUNDO PENA"
 *
 * Usa o DATABASE_URL do .env (ou do arquivo em DOTENV_CONFIG_PATH).
 */
import { connectFromEnv, type RowDataPacket } from "./lib/scriptDb";

/** Mesmas variações usadas pelo servidor (server/db.ts). */
function historicalPropertyNumberCandidates(propertyNumber: string) {
  const typed = propertyNumber.replace(/\s+/g, "").trim();
  const withoutZeros = typed.replace(/^0+(?=\d)/, "");
  return Array.from(new Set([typed, withoutZeros].filter(Boolean)));
}

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const property = arg("--property");
  const schoolFilter = arg("--school");
  const { connection, database, host } = await connectFromEnv();
  const q = async (sql: string, params: unknown[] = []) => (await connection.query<RowDataPacket[]>(sql, params))[0];

  try {
    console.log(`\n1. Banco consultado: ${database} em ${host}`);
    if (process.env.DOTENV_CONFIG_PATH) console.log(`   (variáveis de ${process.env.DOTENV_CONFIG_PATH})`);

    // 2. Estrutura
    const tables = (await q("SELECT LOWER(TABLE_NAME) AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?", [database])).map(row => row.name);
    const hasLoads = tables.includes("historicalinventoryloads");
    const hasItems = tables.includes("historicalinventoryitems");
    const [siadColumn] = await q(
      "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND LOWER(TABLE_NAME) = 'schools' AND LOWER(COLUMN_NAME) = 'siadcode'",
      [database],
    );
    console.log(`2. Tabelas do histórico: ${hasLoads && hasItems ? "✔ existem" : "✖ NÃO EXISTEM (o servidor/migração não rodou neste banco)"}`);
    console.log(`   Coluna schools.siadCode: ${Number(siadColumn.n) ? "✔ existe" : "✖ NÃO EXISTE"}`);
    if (!hasLoads || !hasItems) return;

    // 3. Cargas gravadas
    const loads = await q(
      `SELECT l.id, l.year, l.schoolId, s.name AS school, s.siadCode, l.sourceFileName,
              (SELECT COUNT(*) FROM historicalInventoryItems i WHERE i.loadId = l.id) AS items
         FROM historicalInventoryLoads l
         LEFT JOIN schools s ON s.id = l.schoolId
        ORDER BY s.name`,
    );
    const totalItems = loads.reduce((sum, row) => sum + Number(row.items), 0);
    console.log(`3. Cargas gravadas: ${loads.length} · ${totalItems} patrimônios`);
    if (!loads.length) {
      console.log("   ✖ Nenhuma carga neste banco. A importação rodou só com --dry-run, deu erro em todas as planilhas, ou foi feita em OUTRO banco.");
    }
    for (const row of loads.slice(0, 15)) {
      console.log(`   - carga ${row.id} · ${row.year} · escola id ${row.schoolId} ${row.school ?? "(ESCOLA NÃO EXISTE)"} · SIAD ${row.siadCode ?? "vazio"} · ${row.items} itens · ${row.sourceFileName}`);
    }
    if (loads.length > 15) console.log(`   ... e mais ${loads.length - 15}`);

    // 4. Escolas com SIAD
    const [siadCount] = await q("SELECT COUNT(*) AS total, SUM(siadCode IS NOT NULL AND siadCode <> '') AS withSiad FROM schools");
    console.log(`4. Escolas: ${siadCount.total} · com SIAD preenchido: ${Number(siadCount.withSiad ?? 0)}`);
    if (!Number(siadCount.withSiad ?? 0)) console.log("   ✖ Nenhuma escola tem SIAD: rode fillSchoolSiadCodes.ts com --apply antes de importar.");

    if (schoolFilter) {
      const schools = await q(
        `SELECT s.id, s.name, s.siadCode, s.schoolCode,
                (SELECT COUNT(*) FROM historicalInventoryLoads l WHERE l.schoolId = s.id) AS loads
           FROM schools s WHERE s.name LIKE ? ORDER BY s.name`,
        [`%${schoolFilter}%`],
      );
      console.log(`   Escolas com "${schoolFilter}":`);
      for (const row of schools) console.log(`   - id ${row.id} · ${row.name} · SIAD ${row.siadCode ?? "vazio"} · código ${row.schoolCode ?? "vazio"} · ${row.loads} carga(s)`);
    }

    // 5. Número patrimonial
    if (property) {
      const candidates = historicalPropertyNumberCandidates(property);
      const hits = await q(
        `SELECT i.propertyNumber, i.description, l.year, l.schoolId, s.name AS school
           FROM historicalInventoryItems i
           JOIN historicalInventoryLoads l ON l.id = i.loadId
           LEFT JOIN schools s ON s.id = l.schoolId
          WHERE i.propertyNumber IN (?)`,
        [candidates],
      );
      console.log(`5. Patrimônio ${property} (procurado como: ${candidates.join(", ")}):`);
      if (!hits.length) console.log("   ✖ Não está em nenhuma carga deste banco.");
      for (const row of hits) {
        console.log(`   ✔ ${row.propertyNumber} · ${row.description} · ${row.year} · escola id ${row.schoolId} ${row.school ?? ""}`);
      }
      if (hits.length) {
        console.log("   No formulário, ele só aparece no inventário DESSA escola (o histórico é consultado por escola).");
      }
    } else {
      const sample = await q("SELECT i.propertyNumber, s.name AS school FROM historicalInventoryItems i JOIN historicalInventoryLoads l ON l.id = i.loadId LEFT JOIN schools s ON s.id = l.schoolId LIMIT 3");
      if (sample.length) {
        console.log("5. Números para testar no formulário:");
        for (const row of sample) console.log(`   ${row.propertyNumber} → no inventário da escola ${row.school}`);
      }
    }
    console.log("");
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error("\n✖ Erro:", error instanceof Error ? error.message : error);
  process.exit(1);
});
