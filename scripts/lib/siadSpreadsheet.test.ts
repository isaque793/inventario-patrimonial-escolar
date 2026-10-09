import { describe, expect, it } from "vitest";
import { matchSchools, type DbSchool } from "./schoolMatching";
import { normalizeCode, parseSiadInventory, parseSreSchoolList, unitNameMatchesSchool } from "./siadSpreadsheet";

const inventoryRows = [
  ["UN. ADMINISTRATIVA:  E.E.EDMUNDO PENA-BOM JESUS DO ", null, null, null, null, null, null],
  ["COD. SIAD:   1265367", null, null, null, null, null, null],
  [null, null, null, null, null, null, null],
  ["PATRIMÔNIO", "NOME ITEM MATERIAL", "CÓDIGO CONSERVAÇÃO", "ESTADO CONSERVAÇÃO", "ITEM", "QTDE", "VALOR"],
  [48431672, "AMPLIFICADOR DE AUDIO -      ", 2, "Bom                ", 5208, 1, 243.89],
  [48431583, "ARMARIO DE COZINHA -", 3, "Regular     ", 5214, 1, 300.78],
  [null, null, null, null, "TOTAIS", null, null],
  [null, null, null, null, 5208, 1, 243.89],
  [null, null, null, null, "TOTAL GLOBAL", 2, 544.67],
  ["CORRESPONSÁVEL(IS)", null, null, null, null, null, null],
  ["NOME:", null, "MASP:", null, null, null, null],
];

describe("parseSiadInventory", () => {
  it("lê o SIAD do cabeçalho e só o bloco de patrimônios", () => {
    const inventory = parseSiadInventory(inventoryRows);
    expect(inventory.siadCode).toBe("1265367");
    expect(inventory.unitName).toBe("E.E.EDMUNDO PENA-BOM JESUS DO");
    expect(inventory.items).toHaveLength(2);
    expect(inventory.firstRow).toBe(5);
    expect(inventory.lastRow).toBe(6);
    expect(inventory.items[0]).toEqual({
      propertyNumber: "48431672",
      description: "AMPLIFICADOR DE AUDIO",
      materialCode: null,
      itemCode: "5208",
      conservationState: "Bom",
      quantity: 1,
      unitValue: "243.89",
      totalValue: "243.89",
    });
  });

  it("recusa planilha cujo total não bate com o TOTAL GLOBAL", () => {
    const rows = inventoryRows.map(row => [...row]);
    rows[4][6] = 999;
    expect(() => parseSiadInventory(rows)).toThrow(/TOTAL GLOBAL/);
  });

  it("recusa número patrimonial repetido", () => {
    const rows = inventoryRows.map(row => [...row]);
    rows[5][0] = 48431672;
    rows[8][6] = 487.78;
    expect(() => parseSiadInventory(rows)).toThrow(/repetidos/);
  });

  it("recusa planilha sem cabeçalho PATRIMÔNIO", () => {
    expect(() => parseSiadInventory([["qualquer coisa"]])).toThrow(/PATRIMÔNIO/);
  });
});

describe("unitNameMatchesSchool", () => {
  it("aceita nome cortado pela SIAD e com município", () => {
    expect(unitNameMatchesSchool("E.E.DR GAMA CERQUEIRA-BELO VAL", "EE DR GAMA CERQUEIRA")).toBe(true);
    expect(unitNameMatchesSchool("EE ABELARDO DUARTE PASSO", "EE ABELARDO DUARTE PASSOS")).toBe(true);
    expect(unitNameMatchesSchool("E.E.EDMUNDO PENA-BOM JESUS DO", "EE EDMUNDO PENA")).toBe(true);
  });

  it("recusa planilha de outra escola", () => {
    expect(unitNameMatchesSchool("E.E.PADRE PEDRO THYSEN-PIEDADE", "EE PANDIÁ CALÓGERAS")).toBe(false);
    expect(unitNameMatchesSchool("E.E.PADRE HEITOR-BARAO DE COCA", "EE PADRE PEDRO THYSEN")).toBe(false);
  });
});

it("explica quando a coluna VALOR veio com #VALUE!", () => {
  const rows = inventoryRows.map(row => [...row]);
  rows[4][6] = "#VALUE!";
  expect(() => parseSiadInventory(rows)).toThrow(/exporte a planilha de novo/);
});

describe("normalizeCode", () => {
  it("normaliza códigos numéricos", () => {
    expect(normalizeCode(1265367.0)).toBe("1265367");
    expect(normalizeCode("001265367")).toBe("1265367");
    expect(normalizeCode("1265367.0")).toBe("1265367");
    expect(normalizeCode(null)).toBeNull();
  });
});

const sreRows = [
  ["SRE", "MUNICÍPIO", "CÓDIGO SIAD", "CÓDIGO DA ESCOLA", "ESTABELECIMENTO DE ENSINO"],
  ["Metropolitana A", "BOM JESUS DO AMPARO", 1265367.0, 102792.0, "EE EDMUNDO PENA"],
  ["Metropolitana A", "BELO HORIZONTE", 1265617.0, 1066.0, "EE PESTALOZZI"],
  ["Metropolitana A", "BELO HORIZONTE", 1265241.0, 1821.0, "EE PROFESSORA MARIA AMÉLIA GUIMARÃES"],
  ["Metropolitana A", "BELO HORIZONTE", 1265286.0, 1996.0, "INSTITUTO DE EDUCAÇÃO DE \nMINAS GERAIS (IEMG)"],
];

describe("parseSreSchoolList + matchSchools", () => {
  const sre = parseSreSchoolList(sreRows);
  const school = (id: number, name: string, schoolCode: string, city = "BELO HORIZONTE"): DbSchool => ({ id, name, schoolCode, siadCode: null, city });

  it("lê a lista da SRE", () => {
    expect(sre).toHaveLength(4);
    expect(sre[3]).toMatchObject({ siadCode: "1265286", schoolCode: "1996", name: "INSTITUTO DE EDUCAÇÃO DE MINAS GERAIS (IEMG)" });
  });

  it("casa por código + nome, por nome + município e deixa de fora o ambíguo", () => {
    const { matches, unmatched } = matchSchools(
      [
        school(1, "EE EDMUNDO PENA", "102792", "BOM JESUS DO AMPARO"),
        school(2, "EE PESTALOZZI", "1060"),
        // Duas escolas com o mesmo código: só a de nome igual é casada.
        school(3, "EE PROFESSORA AMÉLIA DE CASTRO MONTEIRO", "1821"),
        school(4, "EE PROFESSORA MARIA AMELIA GUIMARAES", "1821"),
        school(5, "EE SEM LISTA", "9999"),
      ],
      sre,
    );
    const byId = Object.fromEntries(matches.map(match => [match.school.id, match]));
    expect(byId[1]).toMatchObject({ by: "exact", sre: { siadCode: "1265367" } });
    expect(byId[2]).toMatchObject({ by: "name", sre: { siadCode: "1265617" } });
    expect(byId[4]).toMatchObject({ by: "exact", sre: { siadCode: "1265241" } });
    expect(byId[3]).toBeUndefined();
    expect(unmatched.map(item => item.id)).toEqual([3, 5]);
  });
});
