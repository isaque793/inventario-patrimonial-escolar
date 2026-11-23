/**
 * Requisitos para a escola submeter o inventário para validação.
 * No inventário oficial, os quatro documentos assinados são obrigatórios.
 * Nenhum patrimônio importado pode continuar aguardando conferência.
 */
const requiredDocuments = [
  ["opening_minutes", "Ata de Abertura"],
  ["responsibility_term", "Termo de Responsabilidade"],
  ["closing_minutes", "Ata de Encerramento"],
  ["consolidated", "Consolidado"],
] as const;

export function getInventorySubmissionRequirements({ itemCount, memberCount, pendingConfirmationCount = 0, documentTypes = [], requireDocuments = false }: { itemCount: number; memberCount: number; pendingConfirmationCount?: number; documentTypes?: string[]; requireDocuments?: boolean }) {
  const uploaded = new Set(documentTypes);
  const missing = [
    ...(itemCount > 0 ? [] : ["Ao menos um item patrimonial"]),
    ...(memberCount >= 1 ? [] : ["Ao menos um integrante da subcomissão"]),
    ...(pendingConfirmationCount === 0 ? [] : [pendingConfirmationCount === 1 ? "Conferir 1 patrimônio importado pendente" : `Conferir ${pendingConfirmationCount} patrimônios importados pendentes`]),
    ...(requireDocuments ? requiredDocuments.filter(([type]) => !uploaded.has(type)).map(([, label]) => `Enviar: ${label}`) : []),
  ];
  return { ready: missing.length === 0, missing };
}
