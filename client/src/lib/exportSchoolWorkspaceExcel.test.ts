import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx-js-style";
import { buildSchoolWorkspaceWorkbook, INVENTORY_SHEET_HEADERS, SUMMARY_SHEET_HEADERS } from "./exportSchoolWorkspaceExcel";

const input = {
  year: 2026,
  school: { name: "EE Edmundo Pena", schoolCode: "1265367", city: "Bom Jesus do Galho" },
  items: [
    { propertyNumber: "48431672", description: "Amplificador de áudio", technicalDetails: null, expenseCode: "52.08", conservationState: "Bom", quantity: 1, unitValue: "243.89", totalValue: "243.89", currentSituation: "Em uso" },
    { propertyNumber: "48431583", description: "Armário de cozinha", technicalDetails: "Aço", expenseCode: "52.14", conservationState: "Regular", quantity: 2, unitValue: "300", totalValue: "600", currentSituation: "Em uso" },
  ],
  consolidated: [
    { expenseCode: "52.08", element: "Aparelhos de som", quantity: 1, totalValue: 243.89 },
    { expenseCode: "52.14", element: "Mobiliário", quantity: 2, totalValue: 600 },
  ],
  issues: [
    { issueType: "not_found", resolutionStatus: "open", description: "Cadeira", propertyNumber: "123", quantity: 1, conservationState: null, location: "Bloco A", totalValue: "50", originBody: null, currentSituation: null, pendingDescription: "Não localizada", measuresTaken: null },
  ],
  categoryNames: { "52.08": "Aparelhos de som", "52.14": "Mobiliário" },
  issueLabels: { not_found: "Bem não localizado" },
};

describe("buildSchoolWorkspaceWorkbook", () => {
  it("separa inventário, resumo e pendências em abas com totais", () => {
    const workbook = buildSchoolWorkspaceWorkbook(input);
    expect(workbook.SheetNames).toEqual(["Inventário Detalhado", "Resumo Consolidado", "Pendências e Ocorrências"]);

    const inventory = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Inventário Detalhado"], { header: 1, defval: "" });
    expect(inventory[0][0]).toBe("INVENTÁRIO DETALHADO");
    expect(inventory[1][0]).toContain("EE Edmundo Pena");
    expect(inventory[2]).toEqual(INVENTORY_SHEET_HEADERS);
    expect(inventory[3].slice(0, 5)).toEqual(["48431672", "Amplificador de áudio", "", "52.08", "Aparelhos de som"]);
    expect(inventory[5][0]).toBe("TOTAL REGISTADO");
    expect(inventory[5][6]).toBe(3);
    expect(inventory[5][8]).toBeCloseTo(843.89);

    const summary = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Resumo Consolidado"], { header: 1, defval: "" });
    expect(summary[2]).toEqual(SUMMARY_SHEET_HEADERS);
    expect(summary[5]).toEqual(["TOTAL GLOBAL", "", 3, 843.89]);

    const pending = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Pendências e Ocorrências"], { header: 1, defval: "" });
    expect(pending[0][0]).toBe("PENDÊNCIAS E OCORRÊNCIAS");
    expect(pending[3].slice(0, 2)).toEqual(["Bem não localizado", "Aberta"]);
  });

  it("gera as abas mesmo sem pendências", () => {
    const workbook = buildSchoolWorkspaceWorkbook({ ...input, issues: [] });
    const pending = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Pendências e Ocorrências"], { header: 1, defval: "" });
    expect(pending[1][0]).toContain("Total de ocorrências: 0");
  });
});
