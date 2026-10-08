/** Registro devolvido por trpc.inventory.lookupHistorical. */
export type HistoricalItem = {
  year: number;
  propertyNumber: string;
  description: string | null;
  itemCode: string | null;
  conservationState: string | null;
  quantity: number | null;
  unitValue: string | null;
  totalValue: string | null;
};

/** Valores que o formulário de bem patrimonial aceita receber do histórico. */
export type HistoricalPrefill = {
  year: number;
  propertyNumber: string;
  description: string | null;
  expenseCode: string | null;
  conservationState: string | null;
  unitValue: string | null;
  historicalConservationState: string | null;
};

const CONSERVATION_STATES = ["Novo", "Bom", "Regular", "Ruim"];

/** Lookup só faz sentido para números com alguns dígitos. */
export function shouldLookupHistorical(propertyNumber: string) {
  const value = propertyNumber.trim();
  return value.length >= 4 && value !== "Não se aplica";
}

/** Coluna ITEM da planilha SIAD (ex.: 5207) -> código de despesa do formulário (52.07). */
export function itemCodeToExpenseCode(itemCode: string | null | undefined, validCodes: string[]) {
  const digits = String(itemCode ?? "").replace(/\D/g, "");
  if (digits.length !== 4) return null;
  const code = `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return validCodes.includes(code) ? code : null;
}

/** "Bom      " / "BOM" -> "Bom"; estados desconhecidos ficam de fora. */
export function normalizeConservationState(state: string | null | undefined) {
  const value = String(state ?? "").trim().toLowerCase();
  return CONSERVATION_STATES.find(option => option.toLowerCase() === value) ?? null;
}

export function buildHistoricalPrefill(item: HistoricalItem, validExpenseCodes: string[]): HistoricalPrefill {
  const quantity = item.quantity && item.quantity > 0 ? item.quantity : 1;
  const unit = item.unitValue ?? (item.totalValue != null ? (Number(item.totalValue) / quantity).toFixed(2) : null);
  return {
    year: item.year,
    propertyNumber: item.propertyNumber,
    description: item.description?.trim() || null,
    expenseCode: itemCodeToExpenseCode(item.itemCode, validExpenseCodes),
    conservationState: normalizeConservationState(item.conservationState),
    unitValue: unit != null && Number.isFinite(Number(unit)) ? Number(unit).toFixed(2) : null,
    historicalConservationState: item.conservationState?.trim() || null,
  };
}
