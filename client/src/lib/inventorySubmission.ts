/**
 * Requisitos para a escola submeter o inventário para validação.
 * Os documentos assinados (atas e termo) são opcionais e não entram aqui.
 * Nenhum patrimônio importado pode continuar aguardando conferência.
 * (O servidor repete essa validação em inventory.submit; esta função só antecipa o aviso na tela.)
 */
export function getInventorySubmissionRequirements({ itemCount, memberCount, pendingConfirmationCount = 0 }: { itemCount: number; memberCount: number; pendingConfirmationCount?: number }) {
  const missing = [
    ...(itemCount > 0 ? [] : ["Ao menos um item patrimonial"]),
    ...(memberCount >= 1 ? [] : ["Ao menos um integrante da subcomissão"]),
    ...(pendingConfirmationCount === 0
      ? []
      : [pendingConfirmationCount === 1 ? "Conferir 1 patrimônio importado pendente" : `Conferir ${pendingConfirmationCount} patrimônios importados pendentes`]),
  ];
  return { ready: missing.length === 0, missing };
}
