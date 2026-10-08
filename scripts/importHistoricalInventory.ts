/**
 * Importa uma planilha de inventário antigo (formato SIAD) para as tabelas
 * historicalInventoryLoads / historicalInventoryItems.
 *
 * O histórico NÃO vira inventário atual: ele só é consultado quando alguém
 * cadastra um patrimônio e o formulário pede os dados antigos.
 *
 * Uso (na raiz do projeto):
 *
 *   pnpm tsx scripts/importHistoricalInventory.ts --file "C:\caminho\EE EDMUNDO PENA(1).xlsx" --school-id 1 --year 2025 --dry-run
 *   pnpm tsx scripts/importHistoricalInventory.ts --file "C:\caminho\EE EDMUNDO PENA(1).xlsx" --school-id 1 --year 2025
 *
 * Opções:
 *   --file        caminho da planilha (.xlsx)                       [obrigatório]
 *   --school-id   id da escola na tabela schools                     [obrigatório]
 *   --year        ano do inventário histórico                        [obrigatório]
 *   --dry-run     só lê e valida a planilha, não grava nada
 *   --replace     se já existir carga da mesma escola+ano, apaga e reimporta
 *
 * Usa o DATABASE_URL do .env.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import mysql from "mysql2/promise";
import * as XLSXModule from "xlsx-js-style";

// xlsx-js-style é CommonJS; dependendo do loader os métodos vêm em .default.
const XLSX: typeof XLSXModule = (XLSXModule as any).default ?? XLSXModule;

type Args = { file: string; schoolId: number; year: number; dryRun: boolean; replace: boolean };

type HistoricalRow = {
  propertyNumber: string;
  description: string | null;
  materialCode: string | null;
  itemCode: string | null;
  conservationState: string | null;
  quantity: number;
  unitValue: string;
  totalValue: string;
};

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const file = get("--file");
  const schoolId = Number(get("--school-id"));
  const year = Number(get("--year"));
  if (!file) fail("Informe --file com o caminho da planilha.");
  if (!Number.isInteger(schoolId) || schoolId <= 0) fail("Informe --school-id com o id numérico da escola.");
  if (!Number.isInteger(year) || year < 2000 || year > 2100) fail("Informe --year com o ano do inventário (ex.: 2025).");
  return { file, schoolId, year, dryRun: argv.includes("--dry-run"), replace: argv.includes("--replace") };
}

/** Remove acentos, espaços extras e põe em maiúsculas para comparar cabeçalhos. */
function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function cleanText(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  // Várias descrições da SIAD terminam com " -" vazio (ex.: "ARMARIO DE COZINHA -").
  return text.replace(/\s*-\s*$/, "").trim() || null;
}

/** "Bom      " -> "Bom", "REGULAR" -> "Regular". */
function cleanState(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function toMoney(value: number) {
  return (Math.round(value * 100) / 100).toFixed(2);
}

/**
 * Número patrimonial como texto, só dígitos. O Excel guarda como número
 * (48431672); aceitamos também texto com espaços.
 */
function toPropertyNumber(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return value.trim().replace(/^0+(?=\d)/, "");
  return null;
}

function readSpreadsheet(file: string) {
  const workbook = XLSX.read(readFileSync(file), { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: true });

  // 1. Localiza o cabeçalho (linha cuja 1ª coluna é "PATRIMÔNIO").
  const headerIndex = rows.findIndex(row => normalizeHeader(row?.[0]) === "PATRIMONIO");
  if (headerIndex < 0) fail("Cabeçalho 'PATRIMÔNIO' não encontrado na primeira aba da planilha.");

  const header = rows[headerIndex].map(normalizeHeader);
  const col = (name: string) => {
    const index = header.indexOf(name);
    if (index < 0) fail(`Coluna '${name}' não encontrada. Cabeçalho lido: ${header.join(" | ")}`);
    return index;
  };
  const cProperty = 0;
  const cDescription = col("NOME ITEM MATERIAL");
  const cState = col("ESTADO CONSERVACAO");
  const cItem = col("ITEM");
  const cQty = col("QTDE");
  const cValue = col("VALOR");

  // 2. Lê o bloco principal: começa logo abaixo do cabeçalho e termina na
  //    primeira linha sem número patrimonial (antes de TOTAIS, assinaturas...).
  const items: HistoricalRow[] = [];
  let lastRowIndex = headerIndex;
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const propertyNumber = toPropertyNumber(row[cProperty]);
    if (!propertyNumber) break;
    lastRowIndex = index;

    const quantity = Number(row[cQty] ?? 1) || 1;
    const total = Number(row[cValue] ?? 0);
    if (!Number.isFinite(total)) fail(`Valor inválido na linha ${index + 1}: ${row[cValue]}`);

    items.push({
      propertyNumber,
      description: cleanText(row[cDescription]),
      // A planilha SIAD não traz código de material separado.
      materialCode: null,
      // Coluna ITEM (ex.: 5207) = código de despesa 52.07 no formulário.
      itemCode: row[cItem] == null ? null : String(row[cItem]).trim(),
      conservationState: cleanState(row[cState]),
      quantity,
      unitValue: toMoney(total / quantity),
      totalValue: toMoney(total),
    });
  }

  // 3. Procura a linha "TOTAL GLOBAL" para conferência.
  let expected: { quantity: number; value: number } | null = null;
  for (let index = lastRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const labelIndex = row.findIndex(cell => normalizeHeader(cell) === "TOTAL GLOBAL");
    if (labelIndex >= 0) {
      expected = { quantity: Number(row[labelIndex + 1]), value: Number(row[labelIndex + 2]) };
      break;
    }
  }

  return { items, expected, firstRow: headerIndex + 2, lastRow: lastRowIndex + 1 };
}

function validate(items: HistoricalRow[], expected: { quantity: number; value: number } | null) {
  if (!items.length) fail("Nenhum patrimônio encontrado abaixo do cabeçalho.");

  const seen = new Map<string, number>();
  for (const item of items) seen.set(item.propertyNumber, (seen.get(item.propertyNumber) ?? 0) + 1);
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([number]) => number);
  if (duplicates.length) fail(`Números patrimoniais repetidos na planilha: ${duplicates.join(", ")}`);

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = items.reduce((sum, item) => sum + Number(item.totalValue), 0);

  if (expected) {
    if (expected.quantity !== totalQuantity) {
      fail(`Quantidade lida (${totalQuantity}) diferente do TOTAL GLOBAL da planilha (${expected.quantity}).`);
    }
    if (Math.abs(expected.value - totalValue) > 0.05) {
      fail(`Valor lido (${toMoney(totalValue)}) diferente do TOTAL GLOBAL da planilha (${toMoney(expected.value)}).`);
    }
  } else {
    console.warn("⚠ Linha 'TOTAL GLOBAL' não encontrada — não foi possível conferir os totais.");
  }

  return { totalQuantity, totalValue };
}

async function connect() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) fail("DATABASE_URL não está definido no .env.");
  const url = new URL(databaseUrl);
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  return mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    // MySQL local normalmente não tem SSL; o Aiven exige.
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceFileName = basename(args.file);

  console.log(`\nLendo ${sourceFileName}...`);
  const { items, expected, firstRow, lastRow } = readSpreadsheet(args.file);
  const { totalQuantity, totalValue } = validate(items, expected);

  console.log(`✔ ${items.length} patrimônios encontrados (linhas ${firstRow} a ${lastRow} do Excel)`);
  console.log(`✔ Quantidade total: ${totalQuantity}`);
  console.log(`✔ Valor total: R$ ${toMoney(totalValue)}${expected ? " (confere com TOTAL GLOBAL)" : ""}`);
  console.log(`  Primeiro: ${items[0].propertyNumber} · ${items[0].description}`);
  console.log(`  Último:   ${items.at(-1)!.propertyNumber} · ${items.at(-1)!.description}`);

  if (args.dryRun) {
    console.log("\n(dry-run) Nada foi gravado. Rode de novo sem --dry-run para importar.\n");
    return;
  }

  const connection = await connect();
  try {
    const [schoolRows] = await connection.query<mysql.RowDataPacket[]>("SELECT id, name FROM schools WHERE id = ?", [args.schoolId]);
    if (!schoolRows[0]) fail(`Escola com id ${args.schoolId} não existe neste banco.`);
    console.log(`\nEscola: ${schoolRows[0].name} (id ${args.schoolId}) · Ano: ${args.year}`);

    const [existing] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT id, sourceFileName FROM historicalInventoryLoads WHERE schoolId = ? AND year = ?",
      [args.schoolId, args.year],
    );
    if (existing.length && !args.replace) {
      fail(
        `Já existe carga histórica ${args.year} para esta escola (id ${existing.map(row => row.id).join(", ")}). ` +
          "Use --replace para apagar e importar de novo.",
      );
    }

    await connection.beginTransaction();
    try {
      for (const load of existing) {
        await connection.query("DELETE FROM historicalInventoryItems WHERE loadId = ?", [load.id]);
        await connection.query("DELETE FROM historicalInventoryLoads WHERE id = ?", [load.id]);
        console.log(`  Carga anterior ${load.id} removida.`);
      }

      const [loadResult] = await connection.query<mysql.ResultSetHeader>(
        "INSERT INTO historicalInventoryLoads (schoolId, year, sourceFileName, description) VALUES (?, ?, ?, ?)",
        [args.schoolId, args.year, sourceFileName, `Inventário histórico ${args.year} importado da planilha SIAD`],
      );
      const loadId = loadResult.insertId;

      const chunkSize = 200;
      for (let start = 0; start < items.length; start += chunkSize) {
        const chunk = items.slice(start, start + chunkSize).map(item => [
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

      const [check] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) AS total, COALESCE(SUM(totalValue), 0) AS value FROM historicalInventoryItems WHERE loadId = ?",
        [loadId],
      );
      const savedCount = Number(check[0].total);
      if (savedCount !== items.length) {
        throw new Error(`Esperado ${items.length} registros, gravados ${savedCount}.`);
      }

      await connection.commit();
      console.log(`\n✔ Carga ${loadId} criada com ${savedCount} patrimônios (R$ ${Number(check[0].value).toFixed(2)}).\n`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error("\n✖ Importação cancelada, nada foi gravado:", error instanceof Error ? error.message : error);
  process.exit(1);
});
