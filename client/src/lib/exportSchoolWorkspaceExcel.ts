import * as XLSX from "xlsx-js-style";

// Planilha da escola: mesmas abas do espaço da escola (inventário detalhado,
// resumo consolidado e pendências), com a identidade visual das exportações do admin.

export type SchoolWorkspaceExportItem = {
  propertyNumber: string;
  description: string;
  technicalDetails?: string | null;
  expenseCode: string;
  conservationState?: string | null;
  quantity: number;
  unitValue?: number | string | null;
  totalValue: number | string;
  currentSituation?: string | null;
};

export type SchoolWorkspaceExportIssue = {
  issueType: string;
  resolutionStatus: string;
  description: string;
  propertyNumber?: string | null;
  quantity?: number | null;
  conservationState?: string | null;
  totalValue?: number | string | null;
  currentSituation?: string | null;
  pendingDescription: string;
  sei?: string | null;
};

export type SchoolWorkspaceExportInput = {
  year: number;
  school: { name: string; schoolCode?: string | null; city?: string | null };
  items: SchoolWorkspaceExportItem[];
  consolidated: Array<{ expenseCode: string; element: string; quantity: number; totalValue: number }>;
  issues: SchoolWorkspaceExportIssue[];
  categoryNames: Record<string, string>;
  issueLabels: Record<string, string>;
};

export const INVENTORY_SHEET_HEADERS = ["Patrimônio", "Descrição", "Detalhes técnicos", "Código de despesa", "Elemento de despesa", "Conservação", "Quantidade", "Valor unitário (R$)", "Valor total (R$)", "Situação atual"];
export const PENDING_SHEET_HEADERS = [...INVENTORY_SHEET_HEADERS, "Tipo de ocorrência", "SEI", "Pendência detalhada"];
export const SUMMARY_SHEET_HEADERS = ["Código de despesa", "Elemento / item de despesa", "Quantidade", "Valor total (R$)"];

const thinBorder = {
  top: { style: "thin", color: { rgb: "D8E3DB" } },
  bottom: { style: "thin", color: { rgb: "D8E3DB" } },
  left: { style: "thin", color: { rgb: "D8E3DB" } },
  right: { style: "thin", color: { rgb: "D8E3DB" } },
};
const titleStyle = { fill: { patternType: "solid", fgColor: { rgb: "0B5D4B" } }, font: { bold: true, color: { rgb: "FFFFFF" }, sz: 16 }, alignment: { horizontal: "left", vertical: "center" } };
const subtitleStyle = { fill: { patternType: "solid", fgColor: { rgb: "EAF3EE" } }, font: { bold: true, color: { rgb: "173B30" } }, alignment: { horizontal: "left", vertical: "center" }, border: thinBorder };
const headerMain = { fill: { patternType: "solid", fgColor: { rgb: "0B5D4B" } }, font: { bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: thinBorder };
const headerDetail = { ...headerMain, fill: { patternType: "solid", fgColor: { rgb: "2F6F5E" } } };
const headerAction = { ...headerMain, fill: { patternType: "solid", fgColor: { rgb: "7A5A00" } } };
const bodyStyle = { alignment: { vertical: "top", wrapText: true }, border: thinBorder };
const bodyAltStyle = { ...bodyStyle, fill: { patternType: "solid", fgColor: { rgb: "F5F9F6" } } };
const totalStyle = { fill: { patternType: "solid", fgColor: { rgb: "E8F2EB" } }, font: { color: { rgb: "173B30" }, bold: true }, alignment: { horizontal: "right", vertical: "center" }, border: thinBorder };

type Align = "left" | "center" | "right";
type ColumnSpec = { width: number; align?: Align; money?: boolean; header?: "main" | "detail" | "action" };

function setStyle(sheet: XLSX.WorkSheet, address: string, style: any) {
  const cell = sheet[address] ?? { t: "z", v: "" };
  cell.s = style;
  sheet[address] = cell;
}

// Monta uma aba com título (linha 1), subtítulo (linha 2), cabeçalho (linha 3),
// dados zebrados e, opcionalmente, uma linha de total ao final.
function buildTableSheet({ title, subtitle, headers, columns, rows, totalRow }: { title: string; subtitle: string; headers: string[]; columns: ColumnSpec[]; rows: unknown[][]; totalRow?: unknown[] }) {
  const lastCol = headers.length - 1;
  const sheet = XLSX.utils.aoa_to_sheet([[title], [subtitle], headers, ...rows, ...(totalRow ? [totalRow] : [])]);
  const dataEndRow = 3 + rows.length;
  const lastRow = dataEndRow + (totalRow ? 1 : 0);
  sheet["!ref"] = `A1:${XLSX.utils.encode_col(lastCol)}${lastRow}`;
  sheet["!cols"] = columns.map(column => ({ wch: column.width }));
  sheet["!rows"] = [{ hpt: 30 }, { hpt: 20 }, { hpt: 36 }, ...rows.map(() => ({ hpt: 30 })), ...(totalRow ? [{ hpt: 24 }] : [])];
  sheet["!merges"] = [XLSX.utils.decode_range(`A1:${XLSX.utils.encode_col(lastCol)}1`), XLSX.utils.decode_range(`A2:${XLSX.utils.encode_col(lastCol)}2`)];
  sheet["!autofilter"] = { ref: `A3:${XLSX.utils.encode_col(lastCol)}${Math.max(dataEndRow, 3)}` };
  sheet["!tabColor"] = "0B5D4B";

  for (let col = 0; col <= lastCol; col += 1) {
    setStyle(sheet, XLSX.utils.encode_cell({ r: 0, c: col }), titleStyle);
    setStyle(sheet, XLSX.utils.encode_cell({ r: 1, c: col }), subtitleStyle);
    setStyle(sheet, XLSX.utils.encode_cell({ r: 2, c: col }), columns[col].header === "detail" ? headerDetail : columns[col].header === "action" ? headerAction : headerMain);
  }
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx += 1) {
    const base = rowIdx % 2 === 0 ? bodyAltStyle : bodyStyle;
    columns.forEach((column, col) => {
      const address = XLSX.utils.encode_cell({ r: rowIdx + 3, c: col });
      setStyle(sheet, address, { ...base, alignment: { ...base.alignment, horizontal: column.align ?? "left" } });
      if (column.money) sheet[address].z = "R$ #,##0.00";
    });
  }
  if (totalRow) {
    columns.forEach((column, col) => {
      const address = XLSX.utils.encode_cell({ r: dataEndRow, c: col });
      setStyle(sheet, address, totalStyle);
      if (column.money) sheet[address].z = "R$ #,##0.00";
    });
  }
  return sheet;
}

const INVENTORY_COLUMNS: ColumnSpec[] = [
  { width: 18, align: "center" }, { width: 40 }, { width: 36 }, { width: 14, align: "center", header: "detail" }, { width: 32, header: "detail" },
  { width: 16, align: "center", header: "detail" }, { width: 12, align: "right", header: "detail" }, { width: 18, align: "right", money: true, header: "detail" },
  { width: 18, align: "right", money: true, header: "detail" }, { width: 24, align: "center" },
];

function inventoryRow(item: SchoolWorkspaceExportItem, categoryNames: Record<string, string>) {
  return [
    item.propertyNumber, item.description, item.technicalDetails ?? "", item.expenseCode, categoryNames[item.expenseCode] || "",
    item.conservationState ?? "", Number(item.quantity || 0), item.unitValue == null || item.unitValue === "" ? "" : Number(item.unitValue),
    Number(item.totalValue || 0), item.currentSituation ?? "",
  ];
}

// A pendência é gravada junto com o item e copia o patrimônio e a descrição dele;
// usa esses campos para recuperar o item completo do inventário.
function findIssueItem(issue: SchoolWorkspaceExportIssue, items: SchoolWorkspaceExportItem[]) {
  const sameProperty = items.filter(item => item.propertyNumber === (issue.propertyNumber ?? ""));
  return sameProperty.find(item => item.description === issue.description) ?? (sameProperty.length === 1 ? sameProperty[0] : undefined);
}

export function buildSchoolWorkspaceWorkbook({ year, school, items, consolidated, issues, categoryNames, issueLabels }: SchoolWorkspaceExportInput) {
  const schoolLine = [school.name, school.schoolCode ? `INEP ${school.schoolCode}` : null, school.city, `Ano ${year}`].filter(Boolean).join(" · ");

  const inventoryTotal = items.reduce((sum, item) => sum + Number(item.totalValue || 0), 0);
  const inventoryQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const inventorySheet = buildTableSheet({
    title: "INVENTÁRIO DETALHADO",
    subtitle: `${schoolLine} · Itens: ${items.length}`,
    headers: INVENTORY_SHEET_HEADERS,
    columns: INVENTORY_COLUMNS,
    rows: items.map(item => inventoryRow(item, categoryNames)),
    totalRow: ["TOTAL REGISTADO", "", "", "", "", "", inventoryQuantity, "", inventoryTotal, ""],
  });

  const summaryTotal = consolidated.reduce((sum, row) => sum + Number(row.totalValue || 0), 0);
  const summaryQuantity = consolidated.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const summarySheet = buildTableSheet({
    title: "RESUMO CONSOLIDADO",
    subtitle: `${schoolLine} · Quantidade e valores por código de despesa`,
    headers: SUMMARY_SHEET_HEADERS,
    columns: [{ width: 20, align: "center" }, { width: 44 }, { width: 14, align: "right", header: "detail" }, { width: 20, align: "right", money: true, header: "detail" }],
    rows: consolidated.map(row => [row.expenseCode, row.element || "Não classificado", Number(row.quantity || 0), Number(row.totalValue || 0)]),
    totalRow: ["TOTAL GLOBAL", "", summaryQuantity, summaryTotal],
  });

  const pendingSheet = buildTableSheet({
    title: "PENDÊNCIAS E OCORRÊNCIAS",
    subtitle: `${schoolLine} · Total de ocorrências: ${issues.length}`,
    headers: PENDING_SHEET_HEADERS,
    columns: [...INVENTORY_COLUMNS, { width: 22, align: "center", header: "action" }, { width: 22, align: "center", header: "action" }, { width: 50, header: "action" }],
    rows: issues.map(issue => {
      const item = findIssueItem(issue, items);
      const itemColumns = item ? inventoryRow(item, categoryNames) : [
        issue.propertyNumber ?? "", issue.description, "", "", "", issue.conservationState ?? "", Number(issue.quantity || 0), "",
        Number(issue.totalValue || 0), issue.currentSituation ?? "",
      ];
      return [...itemColumns, issueLabels[issue.issueType] || "Outra situação", issue.sei ?? "", issue.pendingDescription];
    }),
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, inventorySheet, "Inventário Detalhado");
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumo Consolidado");
  XLSX.utils.book_append_sheet(workbook, pendingSheet, "Pendências e Ocorrências");
  return workbook;
}

export function exportSchoolWorkspaceExcel(input: SchoolWorkspaceExportInput) {
  const slug = input.school.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  XLSX.writeFile(buildSchoolWorkspaceWorkbook(input), `inventario-${slug || "escola"}-${input.year}.xlsx`);
}
