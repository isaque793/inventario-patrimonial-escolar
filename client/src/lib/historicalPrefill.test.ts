import { describe, expect, it } from "vitest";
import { buildHistoricalPrefill, itemCodeToExpenseCode, normalizeConservationState, shouldLookupHistorical } from "./historicalPrefill";

const codes = ["52.04", "52.07", "52.14", "52.99"];

describe("historicalPrefill", () => {
  it("converte a coluna ITEM da SIAD em código de despesa", () => {
    expect(itemCodeToExpenseCode("5207", codes)).toBe("52.07");
    expect(itemCodeToExpenseCode("5214", codes)).toBe("52.14");
    expect(itemCodeToExpenseCode("5213", codes)).toBeNull();
    expect(itemCodeToExpenseCode(null, codes)).toBeNull();
  });

  it("normaliza o estado de conservação", () => {
    expect(normalizeConservationState("Bom                           ")).toBe("Bom");
    expect(normalizeConservationState("REGULAR")).toBe("Regular");
    expect(normalizeConservationState("Ótimo")).toBeNull();
  });

  it("só consulta números com pelo menos 4 caracteres", () => {
    expect(shouldLookupHistorical("123")).toBe(false);
    expect(shouldLookupHistorical("48431672")).toBe(true);
    expect(shouldLookupHistorical("Não se aplica")).toBe(false);
  });

  it("monta os valores do formulário a partir do histórico", () => {
    const prefill = buildHistoricalPrefill(
      {
        year: 2025,
        propertyNumber: "48431672",
        description: "AMPLIFICADOR DE AUDIO",
        itemCode: "5208",
        conservationState: "Bom",
        quantity: 1,
        unitValue: "243.89",
        totalValue: "243.89",
      },
      [...codes, "52.08"],
    );
    expect(prefill).toEqual({
      year: 2025,
      propertyNumber: "48431672",
      description: "AMPLIFICADOR DE AUDIO",
      expenseCode: "52.08",
      conservationState: "Bom",
      unitValue: "243.89",
      historicalConservationState: "Bom",
    });
  });
});
