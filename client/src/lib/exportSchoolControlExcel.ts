import * as XLSX from "xlsx-js-style";

export { exportPendingIssuesTemplate } from "./exportConsolidatedExcel";

export type SchoolControlExportRecord = {
  school: { name: string; schoolCode: string | null; city: string | null };
  cycle: { status: "draft" | "submitted" | "under_review" | "returned" | "validated" } | null;
  items: Array<{
    propertyNumber: string;
    description: string;
    technicalDetails: string | null;
    expenseCode: string;
    conservationCode: string | null;
    conservationState: string;
    quantity: number;
    unitValue: number | string;
    currentSituation: string;
  }>;
  members: Array<{ name: string; jobTitle: string; masp: string; isPresident: number }>;
  issues: Array<{ description: string; pendingDescription: string; resolutionStatus: "open" | "in_progress" | "resolved" }>;
  documents: Array<{ documentType: "opening_minutes" | "responsibility_term" | "closing_minutes" }>;
  notes: { problemsFound: string | null; quantityDivergences: string | null; valueDivergences: string | null } | null;
};

export const SCHOOL_CONTROL_TEMPLATE_HEADERS = [
  "Escola", "Codigo INEP", "Municipio", "N. patrimonio", "Descricao do bem", "Detalhes tecnicos",
  "Codigo de despesa", "Codigo de conservacao", "Estado de conservacao", "Valor unitario (R$)",
  "Valor total (R$)", "Situacao atual", "Ata de Abertura", "Termo de Responsabilidade", "Ata de Encerramento",
  "Status da validacao", "Pendencias / ocorrencias", "Problemas / divergencias", "Seq. escola", "Chave de busca",
] as const;

const cycleStatusLabels: Record<NonNullable<SchoolControlExportRecord["cycle"]>["status"], string> = {
  draft: "Em preparação", submitted: "Submetido", under_review: "Em análise", returned: "Devolvido", validated: "Validado",
};
const issueStatusLabels: Record<SchoolControlExportRecord["issues"][number]["resolutionStatus"], string> = {
  open: "Aberta", in_progress: "Em andamento", resolved: "Resolvida",
};

const thinBorder = {
  top: { style: "thin", color: { rgb: "D8E3DB" } },
  bottom: { style: "thin", color: { rgb: "D8E3DB" } },
  left: { style: "thin", color: { rgb: "D8E3DB" } },
  right: { style: "thin", color: { rgb: "D8E3DB" } },
};

const titleStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "0B5D4B" } },
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 16 },
  alignment: { horizontal: "left", vertical: "center" },
};
const subtitleStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "EAF3EE" } },
  font: { bold: true, color: { rgb: "173B30" } },
  alignment: { horizontal: "left", vertical: "center" },
  border: thinBorder,
};
const headerStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "0B5D4B" } },
  font: { bold: true, color: { rgb: "FFFFFF" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: thinBorder,
};
const inventoryHeaderStyle = {
  ...headerStyle,
  fill: { patternType: "solid", fgColor: { rgb: "2F6F5E" } },
};
const committeeHeaderStyle = {
  ...headerStyle,
  fill: { patternType: "solid", fgColor: { rgb: "3D5A80" } },
};
const documentsHeaderStyle = {
  ...headerStyle,
  fill: { patternType: "solid", fgColor: { rgb: "806A3B" } },
};
const validationHeaderStyle = {
  ...headerStyle,
  fill: { patternType: "solid", fgColor: { rgb: "7A4E48" } },
};
const headerSoftStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "DDEBE6" } },
  font: { bold: true, color: { rgb: "173B30" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: thinBorder,
};
const labelStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "EAF3EE" } },
  font: { bold: true, color: { rgb: "173B30" } },
  alignment: { horizontal: "left", vertical: "center", wrapText: true },
  border: thinBorder,
};
const inputStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "FFF8DC" } },
  font: { bold: true, color: { rgb: "6B5600" } },
  alignment: { horizontal: "left", vertical: "center", wrapText: true },
  border: thinBorder,
};
const valueStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } },
  font: { color: { rgb: "243F34" } },
  alignment: { vertical: "center", wrapText: true },
  border: thinBorder,
};
const bodyStyle = {
  alignment: { vertical: "top", wrapText: true },
  border: thinBorder,
};
const bodyAlternateStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "F5F9F6" } },
  alignment: { vertical: "top", wrapText: true },
  border: thinBorder,
};
const numberBodyStyle = {
  ...bodyStyle,
  alignment: { horizontal: "right", vertical: "top", wrapText: true },
};
const numberAlternateStyle = {
  ...bodyAlternateStyle,
  alignment: { horizontal: "right", vertical: "top", wrapText: true },
};
const centerBodyStyle = {
  ...bodyStyle,
  alignment: { horizontal: "center", vertical: "top", wrapText: true },
};
const centerAlternateStyle = {
  ...bodyAlternateStyle,
  alignment: { horizontal: "center", vertical: "top", wrapText: true },
};
const pendingStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "FFF7D6" } },
  font: { color: { rgb: "7A5A00" }, bold: true },
  alignment: { vertical: "top", wrapText: true },
  border: thinBorder,
};
const problemStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "FDEBEC" } },
  font: { color: { rgb: "8A3D46" }, bold: true },
  alignment: { vertical: "top", wrapText: true },
  border: thinBorder,
};
const missingPropertyStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "FFF4CC" } },
  font: { color: { rgb: "7A5A00" }, bold: true },
  alignment: { horizontal: "center", vertical: "top", wrapText: true },
  border: thinBorder,
};
const totalStyle = {
  fill: { patternType: "solid", fgColor: { rgb: "E8F2EB" } },
  font: { color: { rgb: "173B30" }, bold: true },
  alignment: { horizontal: "right", vertical: "center" },
  border: thinBorder,
};
const statusStyles: Record<string, any> = {
  "Em preparação": { fill: { patternType: "solid", fgColor: { rgb: "F1F3F1" } }, font: { color: { rgb: "5D675F" }, bold: true }, alignment: { horizontal: "center", vertical: "top", wrapText: true }, border: thinBorder },
  Submetido: { fill: { patternType: "solid", fgColor: { rgb: "FFF0CC" } }, font: { color: { rgb: "8A5B00" }, bold: true }, alignment: { horizontal: "center", vertical: "top", wrapText: true }, border: thinBorder },
  "Em análise": { fill: { patternType: "solid", fgColor: { rgb: "E6F1FB" } }, font: { color: { rgb: "255B85" }, bold: true }, alignment: { horizontal: "center", vertical: "top", wrapText: true }, border: thinBorder },
  Devolvido: { fill: { patternType: "solid", fgColor: { rgb: "FDEBEC" } }, font: { color: { rgb: "8A3D46" }, bold: true }, alignment: { horizontal: "center", vertical: "top", wrapText: true }, border: thinBorder },
  Validado: { fill: { patternType: "solid", fgColor: { rgb: "E4F3E8" } }, font: { color: { rgb: "286149" }, bold: true }, alignment: { horizontal: "center", vertical: "top", wrapText: true }, border: thinBorder },
};

function setStyle(sheet: XLSX.WorkSheet, address: string, style: any) {
  const cell = sheet[address] ?? { t: "z", v: "" };
  cell.s = style;
  sheet[address] = cell;
}

function hasMeaningfulNotes(record: SchoolControlExportRecord) {
  return Boolean(record.notes?.problemsFound?.trim() || record.notes?.quantityDivergences?.trim() || record.notes?.valueDivergences?.trim());
}

export function isSchoolRelevantForExport(record: SchoolControlExportRecord) {
  return record.items.length > 0 || record.issues.length > 0 || hasMeaningfulNotes(record);
}

export function filterSchoolControlRecords(records: SchoolControlExportRecord[]) {
  return records.filter(isSchoolRelevantForExport);
}

function documentStatus(record: SchoolControlExportRecord, type: SchoolControlExportRecord["documents"][number]["documentType"]) {
  return record.documents.some(document => document.documentType === type) ? "Enviado" : "Pendente";
}

function buildFollowUp(record: SchoolControlExportRecord) {
  const pendingSummary = record.issues.map(issue => `${issueStatusLabels[issue.resolutionStatus]} — ${issue.description}: ${issue.pendingDescription}`).join("\n");
  const problemsSummary = [record.notes?.problemsFound, record.notes?.quantityDivergences ? `Divergências de quantidade: ${record.notes.quantityDivergences}` : null, record.notes?.valueDivergences ? `Divergências de valor: ${record.notes.valueDivergences}` : null].filter(Boolean).join("\n");
  return [
    documentStatus(record, "opening_minutes"), documentStatus(record, "responsibility_term"), documentStatus(record, "closing_minutes"),
    record.cycle ? cycleStatusLabels[record.cycle.status] : "Não iniciado", pendingSummary, problemsSummary,
  ];
}

export function buildSchoolControlTemplateRows(records: SchoolControlExportRecord[]) {
  return filterSchoolControlRecords(records).flatMap(record => {
    const shared = [record.school.name, record.school.schoolCode ?? "", record.school.city ?? ""];
    const followUp = buildFollowUp(record);
    const itemRows = record.items.length ? record.items : [null];
    return itemRows.map(item => [
      ...shared, item?.propertyNumber ?? "", item?.description ?? "", item?.technicalDetails ?? "", item?.expenseCode ?? "",
      item?.conservationCode ?? "", item?.conservationState ?? "", item ? Number(item.unitValue) : "",
      item ? Number(item.unitValue) * Number(item.quantity) : "", item?.currentSituation ?? "", ...followUp, "", "",
    ]);
  });
}

function applyWorksheetLayout(worksheet: XLSX.WorkSheet, dataEndRow: number) {
  worksheet["!autofilter"] = { ref: `A4:T${Math.max(dataEndRow, 4)}` };
  worksheet["!cols"] = [34, 14, 22, 18, 32, 36, 18, 20, 20, 18, 18, 22, 17, 23, 20, 20, 42, 42, 3, 3].map((wch, index) => index >= 18 ? { wch, hidden: true } : { wch });
  worksheet["!rows"] = [{ hpt: 30 }, { hpt: 21 }, { hpt: 9 }, { hpt: 42 }, ...Array.from({ length: Math.max(dataEndRow - 4, 0) }, () => ({ hpt: 38 }))];

  setStyle(worksheet, "A1", titleStyle);
  setStyle(worksheet, "A2", subtitleStyle);
  for (let column = 1; column < 20; column += 1) {
    setStyle(worksheet, XLSX.utils.encode_cell({ r: 0, c: column }), titleStyle);
    setStyle(worksheet, XLSX.utils.encode_cell({ r: 1, c: column }), subtitleStyle);
  }

  for (let column = 0; column < 20; column += 1) {
    const style = column < 3 ? headerStyle : column < 12 ? inventoryHeaderStyle : column < 15 ? documentsHeaderStyle : column < 18 ? validationHeaderStyle : headerSoftStyle;
    setStyle(worksheet, XLSX.utils.encode_cell({ r: 3, c: column }), style);
  }

  for (let row = 5; row <= dataEndRow; row += 1) {
    const alternating = row % 2 === 0;
    const defaultStyle = alternating ? bodyAlternateStyle : bodyStyle;
    const numberStyle = alternating ? numberAlternateStyle : numberBodyStyle;
    const centerStyle = alternating ? centerAlternateStyle : centerBodyStyle;

    for (let column = 0; column < 20; column += 1) {
      let style = defaultStyle;
      if ([7, 8, 11, 12, 13, 14, 15].includes(column)) style = centerStyle;
      if ([9, 10].includes(column)) style = numberStyle;
      setStyle(worksheet, XLSX.utils.encode_cell({ r: row - 1, c: column }), style);
    }

    worksheet[`J${row}`] = { ...(worksheet[`J${row}`] ?? { t: "n", v: "" }), z: "R$ #,##0.00" };
    worksheet[`K${row}`] = { ...(worksheet[`K${row}`] ?? { t: "n", v: "" }), z: "R$ #,##0.00", s: numberStyle };
    worksheet[`S${row}`] = { t: "n", v: "", f: `IF(A${row}="","",COUNTIF($A$5:A${row},A${row}))`, s: defaultStyle };
    worksheet[`T${row}`] = { t: "s", v: "", f: `IF(A${row}="","",A${row}&"|"&S${row})`, s: defaultStyle };

    const status = String(worksheet[`P${row}`]?.v ?? "");
    if (statusStyles[status]) setStyle(worksheet, `P${row}`, statusStyles[status]);
    if (worksheet[`Q${row}`]?.v) setStyle(worksheet, `Q${row}`, pendingStyle);
    if (worksheet[`R${row}`]?.v) setStyle(worksheet, `R${row}`, problemStyle);
    if (String(worksheet[`D${row}`]?.v ?? "").trim() === "Não se aplica") setStyle(worksheet, `D${row}`, missingPropertyStyle);
  }

  worksheet["!merges"] = [XLSX.utils.decode_range("A1:T1"), XLSX.utils.decode_range("A2:T2")];
  worksheet["!tabColor"] = "0B5D4B";
}

export function buildSchoolLookupSheet(dataEndRow: number) {
  const lastRow = Math.max(dataEndRow, 5);
  const searchSheet = XLSX.utils.aoa_to_sheet([
    ["LOCALIZAR ESCOLA"], ["Pesquisa rápida no consolidado do ano selecionado"], ["Digite parte do nome da escola ou o nome completo:"], [""], [],
    ["Escola encontrada", ""], ["Codigo INEP", ""], ["Municipio", ""],
    ["Status da validacao", ""], ["Pendencias / ocorrencias", ""], ["Problemas / divergencias", ""], ["Quantidade de registros", ""], ["Valor total registrado", ""], [],
    ["BENS PATRIMONIAIS DA ESCOLA LOCALIZADA"],
    ["N. patrimonio", "Descricao do bem", "Codigo de despesa", "Estado de conservacao", "Valor unitario (R$)", "Valor total (R$)", "Situacao atual"],
  ]);
  const lookup = {
    B6: `IF($A$4="","",IFERROR(INDEX('Escolas e Inventario'!$A$5:$A${lastRow},MATCH("*"&$A$4&"*",'Escolas e Inventario'!$A$5:$A${lastRow},0)),"ESCOLA NAO ENCONTRADA"))`,
    B7: `IF(OR($B$6="",$B$6="ESCOLA NAO ENCONTRADA"),"",IFERROR(INDEX('Escolas e Inventario'!$B$5:$B${lastRow},MATCH($B$6,'Escolas e Inventario'!$A$5:$A${lastRow},0)),""))`,
    B8: `IF(OR($B$6="",$B$6="ESCOLA NAO ENCONTRADA"),"",IFERROR(INDEX('Escolas e Inventario'!$C$5:$C${lastRow},MATCH($B$6,'Escolas e Inventario'!$A$5:$A${lastRow},0)),""))`,
    B9: `IF(OR($B$6="",$B$6="ESCOLA NAO ENCONTRADA"),"",IFERROR(INDEX('Escolas e Inventario'!$P$5:$P${lastRow},MATCH($B$6,'Escolas e Inventario'!$A$5:$A${lastRow},0)),""))`,
    B10: `IF(OR($B$6="",$B$6="ESCOLA NAO ENCONTRADA"),"",IFERROR(INDEX('Escolas e Inventario'!$Q$5:$Q${lastRow},MATCH($B$6,'Escolas e Inventario'!$A$5:$A${lastRow},0)),""))`,
    B11: `IF(OR($B$6="",$B$6="ESCOLA NAO ENCONTRADA"),"",IFERROR(INDEX('Escolas e Inventario'!$R$5:$R${lastRow},MATCH($B$6,'Escolas e Inventario'!$A$5:$A${lastRow},0)),""))`,
    B12: `IF(OR($B$6="",$B$6="ESCOLA NAO ENCONTRADA"),"",COUNTIF('Escolas e Inventario'!$A$5:$A${lastRow},$B$6))`,
    B13: `IF(OR($B$6="",$B$6="ESCOLA NAO ENCONTRADA"),"",SUMIF('Escolas e Inventario'!$A$5:$A${lastRow},$B$6,'Escolas e Inventario'!$K$5:$K${lastRow}))`,
  } as const;
  Object.entries(lookup).forEach(([address, formula]) => { searchSheet[address] = { t: "s", v: "", f: formula, z: address === "B16" ? "R$ #,##0.00" : "General" }; });
  for (let row = 19; row <= 68; row += 1) {
    const sourceColumns = ["D", "E", "G", "I", "J", "K", "L"];
    sourceColumns.forEach((sourceColumn, index) => {
      const address = `${XLSX.utils.encode_col(index)}${row}`;
      const format = index === 4 || index === 5 ? "R$ #,##0.00" : "General";
      searchSheet[address] = { t: "s", v: "", f: `IFERROR(INDEX('Escolas e Inventario'!${sourceColumn}$5:${sourceColumn}${lastRow},MATCH($H${row},'Escolas e Inventario'!$T$5:$T${lastRow},0)),"")`, z: format };
    });
    searchSheet[`H${row}`] = { t: "s", v: "", f: `IF(OR($B$6="",$B$6="ESCOLA NAO ENCONTRADA"),"",$B$6&"|"&ROWS($H$19:H${row}))` };
  }
  searchSheet["!ref"] = "A1:H68";
  searchSheet["!autofilter"] = { ref: "A16:G68" };
  searchSheet["!cols"] = [20, 36, 23, 24, 20, 20, 22, 2].map((wch, index) => index === 7 ? { wch, hidden: true } : { wch });
  searchSheet["!rows"] = [{ hpt: 30 }, { hpt: 20 }, { hpt: 20 }, { hpt: 22 }, { hpt: 8 }, ...Array.from({ length: 8 }, () => ({ hpt: 22 })), { hpt: 8 }, { hpt: 26 }, { hpt: 36 }, ...Array.from({ length: 50 }, () => ({ hpt: 30 }))];
  searchSheet["!merges"] = [XLSX.utils.decode_range("A1:H1"), XLSX.utils.decode_range("A2:H2"), XLSX.utils.decode_range("A4:D4"), XLSX.utils.decode_range("A15:G15")];
  searchSheet["!tabColor"] = "3D6B59";

  ["A1", "B1", "C1", "D1", "E1", "F1", "G1", "H1"].forEach(address => setStyle(searchSheet, address, titleStyle));
  ["A2", "B2", "C2", "D2", "E2", "F2", "G2", "H2"].forEach(address => setStyle(searchSheet, address, subtitleStyle));
  ["A6", "A7", "A8", "A9", "A10", "A11", "A12", "A13"].forEach(address => setStyle(searchSheet, address, labelStyle));
  setStyle(searchSheet, "A4", inputStyle);
  setStyle(searchSheet, "B4", inputStyle);
  ["A15", "B15", "C15", "D15", "E15", "F15", "G15"].forEach(address => setStyle(searchSheet, address, titleStyle));
  ["A16", "B16", "C16", "D16", "E16", "F16", "G16"].forEach(address => setStyle(searchSheet, address, headerSoftStyle));

  for (let row = 6; row <= 13; row += 1) {
    setStyle(searchSheet, `B${row}`, valueStyle);
  }
  setStyle(searchSheet, "B6", { ...valueStyle, fill: { patternType: "solid", fgColor: { rgb: "E8F2EB" } }, font: { bold: true, color: { rgb: "1E523E" } } });
  setStyle(searchSheet, "B10", pendingStyle);
  setStyle(searchSheet, "B11", problemStyle);
  setStyle(searchSheet, "B13", totalStyle);

  for (let row = 17; row <= 68; row += 1) {
    for (let column = 0; column < 7; column += 1) {
      const style = row % 2 === 0 ? bodyAlternateStyle : bodyStyle;
      setStyle(searchSheet, `${XLSX.utils.encode_col(column)}${row}`, style);
    }
    setStyle(searchSheet, `E${row}`, row % 2 === 0 ? numberAlternateStyle : numberBodyStyle);
    setStyle(searchSheet, `F${row}`, row % 2 === 0 ? numberAlternateStyle : numberBodyStyle);
  }

  return searchSheet;
}

export function buildSchoolControlWorkbook(records: SchoolControlExportRecord[], year?: number) {
  const relevantRecords = filterSchoolControlRecords(records);
  const rows = buildSchoolControlTemplateRows(relevantRecords);
  const dataEndRow = 4 + rows.length;
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["RESUMO CONSOLIDADO DO INVENTÁRIO PATRIMONIAL"],
    [`Ano do inventário: ${year ?? ""} · Escolas com patrimônio, pendências ou divergências: ${relevantRecords.length}`],
    [],
    [...SCHOOL_CONTROL_TEMPLATE_HEADERS],
    ...rows,
  ]);
  worksheet["!ref"] = `A1:T${Math.max(dataEndRow, 4)}`;
  applyWorksheetLayout(worksheet, dataEndRow);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Escolas e Inventario");
  XLSX.utils.book_append_sheet(workbook, buildSchoolLookupSheet(dataEndRow), "Localizar Escola");
  return workbook;
}

export function exportSchoolControlWorkbook({ year, records }: { year: number; records: SchoolControlExportRecord[] }) {
  const relevantRecords = filterSchoolControlRecords(records);
  if (!relevantRecords.length) return false;
  const workbook = buildSchoolControlWorkbook(relevantRecords, year);
  XLSX.writeFile(workbook, `resumo-consolidado-inventario-${year}.xlsx`);
  return true;
}
