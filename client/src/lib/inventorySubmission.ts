/**
 * Requisitos para a escola submeter o inventário para validação.
 * Os documentos assinados (atas e termo) são opcionais e não entram aqui.
 */
export function getInventorySubmissionRequirements({ itemCount, memberCount }: { itemCount: number; memberCount: number }) {
  const missing = [
    ...(itemCount > 0 ? [] : ["Ao menos um item patrimonial"]),
    ...(memberCount >= 1 ? [] : ["Ao menos um integrante da subcomissão"]),
  ];
  return { ready: missing.length === 0, missing };
}
