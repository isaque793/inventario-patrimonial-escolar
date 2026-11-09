/**
 * Tipo do ciclo de inventário: cada escola tem, por ano, um pré-inventário e
 * um inventário oficial, independentes entre si.
 */
export const CYCLE_TYPES = ["pre_inventory", "official"] as const;
export type CycleType = (typeof CYCLE_TYPES)[number];

/** Os ciclos que já existiam antes da separação são pré-inventários. */
export const DEFAULT_CYCLE_TYPE: CycleType = "pre_inventory";

export const CYCLE_TYPE_LABELS: Record<CycleType, string> = {
  pre_inventory: "Pré-inventário",
  official: "Inventário",
};

/** Estados do bem importado do pré-inventário para o inventário oficial. */
export const IMPORT_STATUSES = ["pending_confirmation", "confirmed"] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

/** Cores suaves de destaque (nunca a única indicação: a tela também mostra texto). */
export const IMPORT_STATUS_COLORS: Record<ImportStatus, string> = {
  pending_confirmation: "#FFF4CC",
  confirmed: "#E4F3E7",
};

export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  pending_confirmation: "Aguardando conferência",
  confirmed: "Conferido",
};
