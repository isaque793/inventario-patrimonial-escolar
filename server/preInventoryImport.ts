/**
 * Regras puras da importação de bens do pré-inventário para o inventário
 * oficial. A importação é uma CÓPIA: o bem de origem nunca é alterado.
 */

/** "Não se aplica" pode aparecer em vários bens e não identifica duplicidade. */
export const NO_PROPERTY_NUMBER = "Não se aplica";

export type ImportSourceItem = { id: number; propertyNumber: string };

export type ImportPlan<T extends ImportSourceItem> = {
  /** Bens que serão copiados agora. */
  toImport: T[];
  /** Origens já copiadas antes para este inventário oficial (reimportação). */
  alreadyImported: T[];
  /** Mesmo número patrimonial repetido no pré-inventário: só o primeiro é copiado. */
  duplicatedInSource: T[];
  /** O número patrimonial já existe no inventário oficial (cadastrado ou importado de outra origem). */
  alreadyInOfficial: T[];
};

export function planPreInventoryImport<T extends ImportSourceItem>(input: {
  sourceItems: T[];
  /** IDs de origem (sourceItemId) que já foram copiados para o ciclo oficial. */
  importedSourceItemIds: Iterable<number>;
  /** Números patrimoniais que já existem no ciclo oficial. */
  officialPropertyNumbers: Iterable<string>;
}): ImportPlan<T> {
  const imported = new Set(input.importedSourceItemIds);
  const official = new Set(input.officialPropertyNumbers);
  const seenInSource = new Set<string>();
  const plan: ImportPlan<T> = { toImport: [], alreadyImported: [], duplicatedInSource: [], alreadyInOfficial: [] };

  // Ordem estável: a cópia mais antiga (menor id) é a que vale quando há repetidos.
  for (const item of [...input.sourceItems].sort((a, b) => a.id - b.id)) {
    if (imported.has(item.id)) {
      plan.alreadyImported.push(item);
      continue;
    }
    const checksNumber = item.propertyNumber !== NO_PROPERTY_NUMBER;
    if (checksNumber && official.has(item.propertyNumber)) {
      plan.alreadyInOfficial.push(item);
      continue;
    }
    if (checksNumber && seenInSource.has(item.propertyNumber)) {
      plan.duplicatedInSource.push(item);
      continue;
    }
    if (checksNumber) seenInSource.add(item.propertyNumber);
    plan.toImport.push(item);
  }
  return plan;
}

export function summarizeImportPlan(plan: ImportPlan<ImportSourceItem>) {
  return {
    toImport: plan.toImport.length,
    alreadyImported: plan.alreadyImported.length,
    duplicatedInSource: plan.duplicatedInSource.length,
    alreadyInOfficial: plan.alreadyInOfficial.length,
  };
}

/** Mensagem curta para o usuário depois de importar (ou de repetir a importação). */
export function describeImportResult(summary: ReturnType<typeof summarizeImportPlan>) {
  const parts: string[] = [];
  parts.push(summary.toImport === 1 ? "1 bem novo incluído" : `${summary.toImport} bens novos incluídos`);
  if (summary.alreadyImported) parts.push(`${summary.alreadyImported} já importado(s) anteriormente`);
  if (summary.alreadyInOfficial) parts.push(`${summary.alreadyInOfficial} já existente(s) no inventário`);
  if (summary.duplicatedInSource) parts.push(`${summary.duplicatedInSource} repetido(s) no pré-inventário`);
  return `${parts.join("; ")}.`;
}
