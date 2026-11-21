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

/**
 * Progresso da conferência dos bens importados. Só entram na conta os bens que
 * vieram de importação (importStatus preenchido); bens cadastrados manualmente
 * já nascem conferidos pela própria escola. Bens excluídos deixam de existir na
 * lista e, portanto, deixam de contar como pendentes.
 */
export function getConferenceProgress(items: ReadonlyArray<{ importStatus?: string | null }>) {
  const imported = items.filter(item => item.importStatus === "pending_confirmation" || item.importStatus === "confirmed");
  const pending = imported.filter(item => item.importStatus === "pending_confirmation").length;
  const confirmed = imported.length - pending;
  const total = imported.length;
  return { total, confirmed, pending, percent: total === 0 ? 100 : Math.round((confirmed / total) * 100), complete: pending === 0 };
}

export function describePendingConference(pending: number) {
  return pending === 1
    ? "Existe 1 patrimônio aguardando conferência. A escola precisa concluir a verificação antes de submeter o inventário."
    : `Existem ${pending} patrimônios aguardando conferência. A escola precisa concluir a verificação antes de submeter o inventário.`;
}
