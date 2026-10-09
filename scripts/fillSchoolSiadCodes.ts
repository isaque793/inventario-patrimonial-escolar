/**
 * Preenche schools.siadCode a partir da lista de escolas da SRE
 * (planilha com as colunas CÓDIGO SIAD, CÓDIGO DA ESCOLA, ESTABELECIMENTO DE
 * ENSINO e MUNICÍPIO).
 *
 *   pnpm tsx scripts/fillSchoolSiadCodes.ts --file "dados-historicos/Escolas_da_SRE_A.xlsx"
 *       mostra o que faria (padrão: não grava nada)
 *
 *   pnpm tsx scripts/fillSchoolSiadCodes.ts --file "dados-historicos/Escolas_da_SRE_A.xlsx" --apply
 *       grava os SIAD em que código da escola e nome batem
 *
 *   ... --apply --include-uncertain
 *       grava também os casos prováveis (mesmo nome com código diferente,
 *       ou mesmo código com nome diferente), depois de você conferir a lista
 *
 * Nunca sobrescreve um SIAD já preenchido com outro valor: isso só pelo
 * cadastro da escola, por alguém da equipe gestora.
 */
import { basename } from "node:path";
import { connectFromEnv, type RowDataPacket } from "./lib/scriptDb";
import { matchSchools, type DbSchool, type SchoolMatch } from "./lib/schoolMatching";
import { parseSreSchoolList, readSheetRows } from "./lib/siadSpreadsheet";

async function main() {
  const argv = process.argv.slice(2);
  const fileIndex = argv.indexOf("--file");
  const file = fileIndex >= 0 ? argv[fileIndex + 1] : undefined;
  if (!file) throw new Error('Informe --file com a planilha de escolas da SRE (ex.: --file "dados-historicos/Escolas_da_SRE_A.xlsx").');
  const apply = argv.includes("--apply");
  const includeUncertain = argv.includes("--include-uncertain");

  const sreSchools = parseSreSchoolList(readSheetRows(file));
  const { connection, database, host } = await connectFromEnv();

  try {
    const [rows] = await connection.query<RowDataPacket[]>("SELECT id, name, schoolCode, siadCode, city FROM schools ORDER BY name");
    const dbSchools = rows as DbSchool[];
    const siadOwner = new Map(dbSchools.filter(school => school.siadCode).map(school => [school.siadCode!, school]));
    const { matches, unmatched, sreWithoutSchool } = matchSchools(dbSchools, sreSchools);

    console.log(`\nBanco: ${database} em ${host}`);
    console.log(`Lista: ${basename(file)} · ${sreSchools.length} escolas · Sistema: ${dbSchools.length} escolas\n`);

    const toWrite: SchoolMatch[] = [];
    const lines = { ok: [] as string[], fill: [] as string[], uncertain: [] as string[], conflict: [] as string[] };
    for (const match of matches) {
      const { school, sre } = match;
      const label = `${school.name} (${school.city ?? "sem município"}) → SIAD ${sre.siadCode}`;
      if (school.siadCode === sre.siadCode) {
        lines.ok.push(label);
        continue;
      }
      if (school.siadCode) {
        lines.conflict.push(`${label}: a escola já tem SIAD ${school.siadCode}. Não alterado.`);
        continue;
      }
      const owner = siadOwner.get(sre.siadCode);
      if (owner && owner.id !== school.id) {
        lines.conflict.push(`${label}: esse SIAD já está na escola "${owner.name}". Não alterado.`);
        continue;
      }
      if (match.by === "exact") {
        lines.fill.push(label);
        toWrite.push(match);
      } else if (match.by === "name") {
        lines.uncertain.push(`${label}\n      mesmo nome e município; código da escola no sistema ${school.schoolCode ?? "vazio"}, na lista ${sre.schoolCode ?? "vazio"}`);
        if (includeUncertain) toWrite.push(match);
      } else {
        lines.uncertain.push(`${label}\n      mesmo código da escola (${sre.schoolCode}); nome na lista: ${sre.name}`);
        if (includeUncertain) toWrite.push(match);
      }
    }

    const section = (title: string, items: string[]) => {
      if (!items.length) return;
      console.log(`${title} (${items.length})`);
      for (const item of items) console.log(`  ${item}`);
      console.log("");
    };
    section("✔ Já com o SIAD certo", lines.ok);
    section("+ Preencher (mesmo código da escola e mesmo nome)", lines.fill);
    section(
      `? Prováveis, mas confira${includeUncertain ? " (serão preenchidas)" : " (use --include-uncertain para preencher)"}`,
      lines.uncertain,
    );
    section("⚠ Conflitos", lines.conflict);
    section(
      "✖ Escolas do sistema sem correspondência na lista (preencha o SIAD no cadastro da escola)",
      unmatched.map(school => `${school.name} (${school.city ?? "sem município"}) · código ${school.schoolCode ?? "vazio"}`),
    );
    section(
      "• Escolas da lista que não existem no sistema",
      sreWithoutSchool.map(sre => `${sre.name} (${sre.city ?? "sem município"}) · SIAD ${sre.siadCode} · código ${sre.schoolCode ?? "vazio"}`),
    );

    if (!apply) {
      console.log(`Nada foi gravado. ${toWrite.length} escola(s) seriam preenchidas. Rode com --apply para gravar.\n`);
      return;
    }

    await connection.beginTransaction();
    try {
      for (const { school, sre } of toWrite) {
        await connection.query("UPDATE schools SET siadCode = ? WHERE id = ? AND (siadCode IS NULL OR siadCode = '')", [sre.siadCode, school.id]);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
    console.log(`✔ ${toWrite.length} escola(s) com SIAD preenchido.\n`);
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error("\n✖ Erro:", error instanceof Error ? error.message : error);
  process.exit(1);
});
