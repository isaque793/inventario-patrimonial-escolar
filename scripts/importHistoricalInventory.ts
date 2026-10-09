/**
 * Importa planilhas de carga patrimonial da SIAD para o histórico
 * (historicalInventoryLoads / historicalInventoryItems).
 *
 * O histórico NÃO vira inventário atual: só é consultado quando alguém
 * cadastra um patrimônio e o formulário busca os dados antigos.
 *
 * A escola é identificada pelo "COD. SIAD" do cabeçalho da planilha, que
 * precisa estar preenchido em schools.siadCode (ver fillSchoolSiadCodes.ts).
 *
 * Uso (na raiz do projeto):
 *
 *   Pasta inteira (o ano vem do nome da pasta):
 *     pnpm tsx scripts/importHistoricalInventory.ts --dir dados-historicos/2025 --dry-run
 *     pnpm tsx scripts/importHistoricalInventory.ts --dir dados-historicos/2025
 *
 *   Um arquivo:
 *     pnpm tsx scripts/importHistoricalInventory.ts --file "dados-historicos/2025/EE EDMUNDO PENA.xlsx" --dry-run
 *
 * Opções:
 *   --dir         pasta com as planilhas .xlsx (não entra em subpastas)
 *   --file        uma planilha .xlsx
 *   --year        ano da carga; opcional se a pasta se chamar 2025, 2024...
 *   --school-id   (só com --file) força a escola, ignorando o SIAD da planilha
 *   --dry-run     lê, valida e mostra o que faria, sem gravar nada
 *   --replace     se a escola já tiver carga do mesmo ano, apaga e reimporta
 *
 * Usa o DATABASE_URL do .env (local ou Aiven).
 */
import { readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { connectFromEnv, type ResultSetHeader, type RowDataPacket } from "./lib/scriptDb";
import { parseSiadInventory, readSheetRows, toMoney, type SiadInventory } from "./lib/siadSpreadsheet";

type Args = { files: string[]; year: number; schoolId: number | null; dryRun: boolean; replace: boolean };
type School = { id: number; name: string };
type Outcome = { file: string; status: "ok" | "skipped" | "error"; message: string };

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function yearFromPath(path: string) {
  const name = basename(path);
  return /^\d{4}$/.test(name) ? Number(name) : null;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const dir = get("--dir");
  const file = get("--file");
  if (!dir === !file) fail("Informe --dir (pasta) ou --file (um arquivo).");

  let files: string[];
  if (dir) {
    const folder = resolve(dir);
    try {
      if (!statSync(folder).isDirectory()) fail(`${dir} não é uma pasta.`);
    } catch {
      fail(`Pasta não encontrada: ${dir}`);
    }
    files = readdirSync(folder)
      .filter(name => name.toLowerCase().endsWith(".xlsx") && !name.startsWith("~$"))
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map(name => join(folder, name));
    if (!files.length) fail(`Nenhuma planilha .xlsx em ${dir}`);
  } else {
    files = [resolve(file!)];
  }

  const yearArg = get("--year");
  const year = yearArg ? Number(yearArg) : yearFromPath(dir ? resolve(dir) : dirname(resolve(file!)));
  if (!year || !Number.isInteger(year) || year < 2000 || year > 2100) {
    fail("Não deu para saber o ano. Use uma pasta com o nome do ano (dados-historicos/2025) ou informe --year 2025.");
  }

  const schoolIdArg = get("--school-id");
  if (schoolIdArg && dir) fail("--school-id só pode ser usado com --file.");
  const schoolId = schoolIdArg ? Number(schoolIdArg) : null;
  if (schoolIdArg && (!Number.isInteger(schoolId) || schoolId! <= 0)) fail("--school-id deve ser o id numérico da escola.");

  return { files, year, schoolId, dryRun: argv.includes("--dry-run"), replace: argv.includes("--replace") };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { connection, database, host } = await connectFromEnv();
  const outcomes: Outcome[] = [];
  const seenSchools = new Map<number, string>();

  console.log(`\nBanco: ${database} em ${host}`);
  console.log(`Ano da carga: ${args.year} · ${args.files.length} planilha(s)${args.dryRun ? " · DRY-RUN (nada será gravado)" : ""}\n`);

  try {
    for (const file of args.files) {
      const fileName = basename(file);
      const log = (status: Outcome["status"], message: string) => {
        outcomes.push({ file: fileName, status, message });
        const icon = status === "ok" ? "✔" : status === "skipped" ? "⚠" : "✖";
        console.log(`${icon} ${fileName}\n    ${message}`);
      };

      // 1. Ler e conferir a planilha.
      let inventory: SiadInventory;
      try {
        inventory = parseSiadInventory(readSheetRows(file));
      } catch (error) {
        log("error", error instanceof Error ? error.message : String(error));
        continue;
      }

      // 2. Achar a escola (pelo SIAD do cabeçalho, ou --school-id).
      let school: School | undefined;
      if (args.schoolId) {
        const [rows] = await connection.query<RowDataPacket[]>("SELECT id, name FROM schools WHERE id = ?", [args.schoolId]);
        school = rows[0] as School | undefined;
        if (!school) {
          log("error", `Escola com id ${args.schoolId} não existe.`);
          continue;
        }
      } else {
        if (!inventory.siadCode) {
          log("error", "A planilha não tem 'COD. SIAD' no cabeçalho. Use --file com --school-id.");
          continue;
        }
        const [rows] = await connection.query<RowDataPacket[]>("SELECT id, name FROM schools WHERE siadCode = ?", [inventory.siadCode]);
        school = rows[0] as School | undefined;
        if (!school) {
          log("error", `SIAD ${inventory.siadCode} (${inventory.unitName ?? "sem nome"}) não está em nenhuma escola. Preencha o código SIAD da escola e rode de novo.`);
          continue;
        }
      }

      const summary = `${school.name} (id ${school.id}${inventory.siadCode ? ` · SIAD ${inventory.siadCode}` : ""}) · ${inventory.items.length} itens · R$ ${toMoney(inventory.totalValue)}${inventory.expected ? " · confere com TOTAL GLOBAL" : " · sem TOTAL GLOBAL para conferir"}`;

      // 3. Evitar duas planilhas da mesma escola no mesmo lote.
      if (seenSchools.has(school.id)) {
        log("error", `${school.name} já apareceu neste lote em "${seenSchools.get(school.id)}". Deixe só uma planilha por escola na pasta.`);
        continue;
      }
      seenSchools.set(school.id, fileName);

      // 4. Carga já existente para escola + ano?
      const [existing] = await connection.query<RowDataPacket[]>(
        "SELECT id FROM historicalInventoryLoads WHERE schoolId = ? AND year = ?",
        [school.id, args.year],
      );
      if (existing.length && !args.replace) {
        log("skipped", `${summary}\n    Já existe carga ${args.year} para esta escola (use --replace para substituir).`);
        continue;
      }

      if (args.dryRun) {
        log("ok", `${summary}${existing.length ? "\n    Substituiria a carga existente (--replace)." : ""}`);
        continue;
      }

      // 5. Gravar numa transação por escola.
      try {
        await connection.beginTransaction();
        for (const load of existing) {
          await connection.query("DELETE FROM historicalInventoryItems WHERE loadId = ?", [load.id]);
          await connection.query("DELETE FROM historicalInventoryLoads WHERE id = ?", [load.id]);
        }
        const [loadResult] = await connection.query<ResultSetHeader>(
          "INSERT INTO historicalInventoryLoads (schoolId, year, sourceFileName, description) VALUES (?, ?, ?, ?)",
          [school.id, args.year, fileName, `Carga patrimonial ${args.year} importada da planilha SIAD`],
        );
        const loadId = loadResult.insertId;
        const chunkSize = 200;
        for (let start = 0; start < inventory.items.length; start += chunkSize) {
          const chunk = inventory.items.slice(start, start + chunkSize).map(item => [
            loadId,
            item.propertyNumber,
            item.description,
            item.materialCode,
            item.itemCode,
            item.conservationState,
            item.quantity,
            item.unitValue,
            item.totalValue,
          ]);
          await connection.query(
            `INSERT INTO historicalInventoryItems
              (loadId, propertyNumber, description, materialCode, itemCode, conservationState, quantity, unitValue, totalValue)
             VALUES ?`,
            [chunk],
          );
        }
        const [check] = await connection.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM historicalInventoryItems WHERE loadId = ?", [loadId]);
        if (Number(check[0].total) !== inventory.items.length) {
          throw new Error(`esperado ${inventory.items.length} registros, gravados ${check[0].total}`);
        }
        await connection.commit();
        log("ok", `${summary}\n    Carga ${loadId} gravada${existing.length ? " (substituiu a anterior)" : ""}.`);
      } catch (error) {
        await connection.rollback();
        log("error", `${summary}\n    Nada gravado: ${error instanceof Error ? error.message : error}`);
      }
    }
  } finally {
    await connection.end();
  }

  const count = (status: Outcome["status"]) => outcomes.filter(outcome => outcome.status === status).length;
  console.log(
    `\nResumo: ${count("ok")} ${args.dryRun ? "prontas para importar" : "importadas"} · ${count("skipped")} já existentes · ${count("error")} com erro\n`,
  );
  if (count("error")) process.exitCode = 1;
}

main().catch(error => {
  console.error("\n✖ Importação interrompida:", error instanceof Error ? error.message : error);
  process.exit(1);
});
