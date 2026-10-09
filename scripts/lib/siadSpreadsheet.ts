/**
 * Leitura das planilhas exportadas da SIAD:
 *   - carga patrimonial de uma unidade (inventário histórico)
 *   - lista de escolas da SRE (código SIAD x código da escola)
 *
 * As funções parse* recebem as linhas já lidas (array de arrays), para
 * poderem ser testadas sem arquivo.
 */
import { readFileSync } from "node:fs";
import * as XLSXModule from "xlsx-js-style";

// xlsx-js-style é CommonJS; dependendo do loader os métodos vêm em .default.
const XLSX: typeof XLSXModule = (XLSXModule as any).default ?? XLSXModule;

export type SheetRows = unknown[][];

export type HistoricalRow = {
  propertyNumber: string;
  description: string | null;
  materialCode: string | null;
  itemCode: string | null;
  conservationState: string | null;
  quantity: number;
  unitValue: string;
  totalValue: string;
};

export type SiadInventory = {
  siadCode: string | null;
  unitName: string | null;
  items: HistoricalRow[];
  expected: { quantity: number; value: number } | null;
  firstRow: number;
  lastRow: number;
  totalQuantity: number;
  totalValue: number;
};

export type SreSchool = {
  siadCode: string;
  schoolCode: string | null;
  name: string;
  city: string | null;
  row: number;
};

/** Lê a primeira aba de um .xlsx como linhas (índice da linha = linha do Excel - 1). */
export function readSheetRows(file: string): SheetRows {
  const workbook = XLSX.read(readFileSync(file), { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: true });
}

/** Remove acentos, junta espaços/quebras de linha e põe em maiúsculas. */
export function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Código numérico como texto, sem casas decimais nem zeros à esquerda (1265367.0 -> "1265367"). */
export function normalizeCode(value: unknown) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? String(Math.trunc(value)) : null;
  const digits = String(value).trim().replace(/\.0+$/, "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits || null;
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

export function toMoney(value: number) {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function toPropertyNumber(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return value.trim().replace(/^0+(?=\d)/, "");
  return null;
}

/** Procura "COD. SIAD: 1265367" e "UN. ADMINISTRATIVA: ..." nas linhas antes do cabeçalho. */
function readHeaderInfo(rows: SheetRows, headerIndex: number) {
  let siadCode: string | null = null;
  let unitName: string | null = null;
  for (const row of rows.slice(0, headerIndex)) {
    for (const cell of row ?? []) {
      const text = normalizeText(cell);
      if (!text) continue;
      const siad = text.match(/COD(?:IGO)?\.?\s*SIAD\s*:?\s*(\d+)/);
      if (siad && !siadCode) siadCode = normalizeCode(siad[1]);
      const unit = String(cell ?? "").match(/UN(?:IDADE)?\.?\s*ADMINISTRATIVA\s*:\s*(.+)/i);
      if (unit && !unitName) unitName = unit[1].replace(/\s+/g, " ").trim() || null;
    }
  }
  return { siadCode, unitName };
}

/**
 * Interpreta a planilha de carga patrimonial da SIAD. Lê só o bloco de
 * patrimônios (do cabeçalho "PATRIMÔNIO" até a primeira linha sem número),
 * ignorando TOTAIS, responsáveis, MASP e assinaturas. Lança Error se algo
 * não confere.
 */
export function parseSiadInventory(rows: SheetRows): SiadInventory {
  const headerIndex = rows.findIndex(row => normalizeText(row?.[0]) === "PATRIMONIO");
  if (headerIndex < 0) throw new Error("Cabeçalho 'PATRIMÔNIO' não encontrado na primeira aba.");

  const header = rows[headerIndex].map(normalizeText);
  const col = (name: string) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`Coluna '${name}' não encontrada. Cabeçalho lido: ${header.filter(Boolean).join(" | ")}`);
    return index;
  };
  const cDescription = col("NOME ITEM MATERIAL");
  const cState = col("ESTADO CONSERVACAO");
  const cItem = col("ITEM");
  const cQty = col("QTDE");
  const cValue = col("VALOR");

  const items: HistoricalRow[] = [];
  let lastRowIndex = headerIndex;
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const propertyNumber = toPropertyNumber(row[0]);
    if (!propertyNumber) break;
    lastRowIndex = index;

    const quantity = Number(row[cQty] ?? 1) || 1;
    const total = Number(row[cValue] ?? 0);
    if (!Number.isFinite(total)) throw new Error(`Valor inválido na linha ${index + 1}: ${row[cValue]}`);

    items.push({
      propertyNumber,
      description: cleanText(row[cDescription]),
      // A planilha SIAD não traz código de material separado.
      materialCode: null,
      // Coluna ITEM (ex.: 5207) = código de despesa 52.07 no formulário.
      itemCode: row[cItem] == null ? null : normalizeCode(row[cItem]),
      conservationState: cleanState(row[cState]),
      quantity,
      unitValue: toMoney(total / quantity),
      totalValue: toMoney(total),
    });
  }
  if (!items.length) throw new Error("Nenhum patrimônio encontrado abaixo do cabeçalho.");

  let expected: SiadInventory["expected"] = null;
  for (let index = lastRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const labelIndex = row.findIndex(cell => normalizeText(cell) === "TOTAL GLOBAL");
    if (labelIndex >= 0) {
      expected = { quantity: Number(row[labelIndex + 1]), value: Number(row[labelIndex + 2]) };
      break;
    }
  }

  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.propertyNumber, (counts.get(item.propertyNumber) ?? 0) + 1);
  const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([number]) => number);
  if (duplicates.length) throw new Error(`Números patrimoniais repetidos: ${duplicates.slice(0, 10).join(", ")}${duplicates.length > 10 ? "…" : ""}`);

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = items.reduce((sum, item) => sum + Number(item.totalValue), 0);
  if (expected) {
    if (expected.quantity !== totalQuantity) {
      throw new Error(`Quantidade lida (${totalQuantity}) diferente do TOTAL GLOBAL (${expected.quantity}).`);
    }
    if (Math.abs(expected.value - totalValue) > 0.05) {
      throw new Error(`Valor lido (${toMoney(totalValue)}) diferente do TOTAL GLOBAL (${toMoney(expected.value)}).`);
    }
  }

  const { siadCode, unitName } = readHeaderInfo(rows, headerIndex);
  return { siadCode, unitName, items, expected, firstRow: headerIndex + 2, lastRow: lastRowIndex + 1, totalQuantity, totalValue };
}

/** Interpreta a lista de escolas da SRE (colunas CÓDIGO SIAD, CÓDIGO DA ESCOLA, ESTABELECIMENTO DE ENSINO, MUNICÍPIO). */
export function parseSreSchoolList(rows: SheetRows): SreSchool[] {
  const headerIndex = rows.findIndex(row => (row ?? []).some(cell => normalizeText(cell) === "CODIGO SIAD"));
  if (headerIndex < 0) throw new Error("Coluna 'CÓDIGO SIAD' não encontrada na lista de escolas.");
  const header = rows[headerIndex].map(normalizeText);
  const find = (...names: string[]) => header.findIndex(cell => names.includes(cell));
  const cSiad = find("CODIGO SIAD");
  const cSchoolCode = find("CODIGO DA ESCOLA", "CODIGO ESCOLA");
  const cName = find("ESTABELECIMENTO DE ENSINO", "ESCOLA", "NOME DA ESCOLA");
  const cCity = find("MUNICIPIO");
  if (cName < 0) throw new Error("Coluna 'ESTABELECIMENTO DE ENSINO' não encontrada na lista de escolas.");

  const schools: SreSchool[] = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const siadCode = normalizeCode(row[cSiad]);
    const name = String(row[cName] ?? "").replace(/\s+/g, " ").trim();
    if (!siadCode || !name) continue;
    schools.push({
      siadCode,
      schoolCode: cSchoolCode >= 0 ? normalizeCode(row[cSchoolCode]) : null,
      name,
      city: cCity >= 0 ? String(row[cCity] ?? "").replace(/\s+/g, " ").trim() || null : null,
      row: index + 1,
    });
  }
  return schools;
}
