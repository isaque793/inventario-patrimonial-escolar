import * as XLSX from "xlsx-js-style";
import { describe, expect, it } from "vitest";
import { buildSchoolWorkspaceWorkbook, buildSchoolsWorkspaceInput } from "./exportSchoolWorkspaceExcel";

const item = (propertyNumber: string, expenseCode: string, quantity: number, totalValue: number) => ({ propertyNumber, description: `Bem ${propertyNumber}`, expenseCode, quantity, totalValue });
const records = [
  { school: { name: "EE A" }, items: [item("1", "449052", 1, 100)], issues: [{ issueType: "other", resolutionStatus: "open", description: "Bem 1", propertyNumber: "1", pendingDescription: "p" }] },
  { school: { name: "EE B" }, items: [item("1", "449052", 2, 50)], issues: [] },
];
const build = (recs: typeof records) => buildSchoolWorkspaceWorkbook(buildSchoolsWorkspaceInput({ year: 2026, records: recs, categoryNames: { "449052": "Equip." }, issueLabels: { other: "Outra situação" } }));

describe("planilha geral das escolas", () => {
  it("soma as escolas, acrescenta a coluna Escola e mantém as três abas", () => {
    const workbook = build(records);
    expect(workbook.SheetNames).toEqual(["Inventário Detalhado", "Resumo Consolidado", "Pendências e Ocorrências"]);
    const inventory = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Inventário Detalhado"], { header: 1, defval: "" });
    expect(inventory[2]?.[0]).toBe("Escola");
    expect(inventory[3]?.[0]).toBe("EE A");
    expect(inventory[4]?.[0]).toBe("EE B");
    const summary = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Resumo Consolidado"], { header: 1, defval: "" });
    expect(summary[3]).toEqual(["449052", "Equip.", 3, 150]);
  });

  it("com uma só escola gera o mesmo layout da planilha individual (sem coluna Escola)", () => {
    const workbook = build(records.slice(0, 1));
    const inventory = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Inventário Detalhado"], { header: 1, defval: "" });
    expect(inventory[2]?.[0]).toBe("Patrimônio");
  });
});

describe("células seguras para o Excel", () => {
  it("remove caracteres inválidos, limita o tamanho e troca números inválidos", () => {
    const bad = { ...item("9", "52.07", Number.NaN, Number.NaN), description: `A\u0000B\u000bC${"x".repeat(40000)}` };
    const workbook = build([{ school: { name: "EE A" }, items: [bad], issues: [] }]);
    const inventory = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Inventário Detalhado"], { header: 1, defval: "" });
    const description = String(inventory[3]?.[1]);
    expect(description.startsWith("ABC")).toBe(true);
    expect(description.length).toBe(32767);
    expect(inventory[3]?.[6]).toBe(0);
    expect(inventory[3]?.[8]).toBe(0);
  });
});
