export const REQUIRED_DOCUMENT_TYPES = [
  "opening_minutes",
  "responsibility_term",
  "closing_minutes",
] as const;

export const EXPENSE_CATEGORIES = [
  ["52.01", "Aeronaves e componentes estruturais"],
  ["52.02", "Animais de trabalho, produção e reprodução"],
  ["52.03", "Armamento e equipamento de uso policial"],
  ["52.04", "Máquinas, aparelhos, utensílios e equipamentos industriais"],
  ["52.05", "Embarcações, pontões, diques, flutuantes e componentes estruturais"],
  ["52.06", "Equipamentos de comunicação e telefonia"],
  ["52.07", "Equipamentos de informática"],
  ["52.08", "Equipamentos de som, vídeo, fotografia e cinematográfico"],
  ["52.09", "Equipamentos hospitalares, odontológicos e de laboratório"],
  ["52.10", "Ferramentas, equipamentos e instrumentos para oficina, medição e inspeção"],
  ["52.11", "Instrumentos de laboratório, médicos e odontológicos"],
  ["52.12", "Máquinas, aparelhos, utensílios e equipamentos de uso administrativo"],
  ["52.13", "Material esportivo e recreativo"],
  ["52.14", "Mobiliário"],
  ["52.15", "Objetos de arte e antiguidades"],
  ["52.16", "Tratores, similares e implementos"],
  ["52.17", "Veículos"],
  ["52.18", "Coleção e materiais bibliográficos"],
  ["52.19", "Instrumentos musicais e artísticos"],
  ["52.20", "Equipamentos de segurança eletrônica"],
  ["52.21", "Material didático"],
  ["52.22", "Estruturas e componentes"],
  ["52.25", "Aparelhos e utensílios domésticos"],
  ["52.26", "Equipamentos de proteção, segurança e socorro"],
  ["52.99", "Outros materiais permanentes"],
] as const;

export type CycleStatus = "draft" | "submitted" | "under_review" | "returned" | "validated";

const transitionMap: Record<CycleStatus, CycleStatus[]> = {
  draft: ["submitted"],
  submitted: ["under_review", "returned", "validated"],
  under_review: ["returned", "validated"],
  returned: ["submitted"],
  validated: [],
};

export function calculateLineTotal(quantity: number, unitValue: number): string {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("A quantidade deve ser um número inteiro maior que zero.");
  }
  if (!Number.isFinite(unitValue) || unitValue < 0) {
    throw new Error("O valor unitário deve ser igual ou superior a zero.");
  }
  return (quantity * unitValue).toFixed(2);
}

export function missingDocumentTypes(documentTypes: readonly string[]): string[] {
  return REQUIRED_DOCUMENT_TYPES.filter(type => !documentTypes.includes(type));
}

export function canTransitionStatus(from: CycleStatus, to: CycleStatus): boolean {
  return transitionMap[from].includes(to);
}

export type UserRole = "admin" | "manager" | "user";

export function hasSchoolAccess(userRole: UserRole, hasMembership: boolean): boolean {
  return userRole === "admin" || hasMembership;
}

export function canChangeAdminRole(currentRole: UserRole, nextRole: UserRole, administratorCount: number): boolean {
  return !(currentRole === "admin" && nextRole !== "admin" && administratorCount <= 1);
}

export function consolidateExpenseItems<T extends { expenseCode: string; quantity: number; totalValue: string | number }>(items: T[]) {
  return Object.values(
    items.reduce<Record<string, { expenseCode: string; quantity: number; totalValue: number }>>((acc, item) => {
      acc[item.expenseCode] ??= { expenseCode: item.expenseCode, quantity: 0, totalValue: 0 };
      acc[item.expenseCode].quantity += item.quantity;
      acc[item.expenseCode].totalValue += Number(item.totalValue);
      return acc;
    }, {}),
  ).sort((a, b) => a.expenseCode.localeCompare(b.expenseCode));
}

export function safeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "documento";
}
