type ItemLike = { id: number; propertyNumber?: string | null; description?: string | null };
type IssueLike = { itemId?: number | null; propertyNumber?: string | null; description?: string | null };

const AUTO_PREFIX = "Bem sem número de patrimônio: ";

/**
 * Acha o bem a que uma pendência se refere. Usa o vínculo (itemId); em pendências
 * antigas sem vínculo, tenta pelo número de patrimônio e depois pela descrição,
 * mas só quando houver um único candidato.
 */
export function findItemForIssue<T extends ItemLike>(issue: IssueLike, items: T[]): T | null {
  if (issue.itemId != null) return items.find(item => item.id === issue.itemId) ?? null;

  const number = issue.propertyNumber?.trim();
  if (number) {
    const byNumber = items.filter(item => item.propertyNumber === number);
    if (byNumber.length === 1) return byNumber[0];
  }

  const description = (issue.description ?? "").replace(AUTO_PREFIX, "").trim();
  if (description) {
    const byDescription = items.filter(item => (item.description ?? "").trim() === description);
    if (byDescription.length === 1) return byDescription[0];
  }
  return null;
}
