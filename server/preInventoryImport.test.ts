import { describe, expect, it } from "vitest";
import { describeImportResult, planPreInventoryImport, summarizeImportPlan } from "./preInventoryImport";

const item = (id: number, propertyNumber: string) => ({ id, propertyNumber });

describe("planPreInventoryImport", () => {
  it("copia todos os bens quando o oficial está vazio", () => {
    const plan = planPreInventoryImport({ sourceItems: [item(1, "A"), item(2, "B")], importedSourceItemIds: [], officialPropertyNumbers: [] });
    expect(plan.toImport.map(entry => entry.id)).toEqual([1, 2]);
    expect(summarizeImportPlan(plan)).toEqual({ toImport: 2, alreadyImported: 0, duplicatedInSource: 0, alreadyInOfficial: 0 });
  });

  it("repetir a importação não duplica: ignora o que já foi copiado", () => {
    const plan = planPreInventoryImport({ sourceItems: [item(1, "A"), item(2, "B"), item(3, "C")], importedSourceItemIds: [1, 2], officialPropertyNumbers: ["A", "B"] });
    expect(plan.toImport.map(entry => entry.id)).toEqual([3]);
    expect(plan.alreadyImported.map(entry => entry.id)).toEqual([1, 2]);
    expect(plan.alreadyInOfficial).toEqual([]);
  });

  it("não copia patrimônio que já existe no oficial por cadastro direto", () => {
    const plan = planPreInventoryImport({ sourceItems: [item(1, "A"), item(2, "B")], importedSourceItemIds: [], officialPropertyNumbers: ["B"] });
    expect(plan.toImport.map(entry => entry.id)).toEqual([1]);
    expect(plan.alreadyInOfficial.map(entry => entry.id)).toEqual([2]);
  });

  it("número repetido no pré-inventário: só o primeiro é copiado e o restante é sinalizado", () => {
    const plan = planPreInventoryImport({ sourceItems: [item(5, "A"), item(2, "A"), item(3, "B")], importedSourceItemIds: [], officialPropertyNumbers: [] });
    expect(plan.toImport.map(entry => entry.id)).toEqual([2, 3]);
    expect(plan.duplicatedInSource.map(entry => entry.id)).toEqual([5]);
  });

  it('"Não se aplica" pode se repetir e não bloqueia a cópia', () => {
    const plan = planPreInventoryImport({ sourceItems: [item(1, "Não se aplica"), item(2, "Não se aplica")], importedSourceItemIds: [], officialPropertyNumbers: ["Não se aplica"] });
    expect(plan.toImport.map(entry => entry.id)).toEqual([1, 2]);
  });

  it("não altera a lista de origem", () => {
    const source = [item(2, "B"), item(1, "A")];
    planPreInventoryImport({ sourceItems: source, importedSourceItemIds: [], officialPropertyNumbers: [] });
    expect(source.map(entry => entry.id)).toEqual([2, 1]);
  });
});

describe("describeImportResult", () => {
  it("informa quantos novos entraram e o que foi ignorado", () => {
    expect(describeImportResult({ toImport: 1, alreadyImported: 3, duplicatedInSource: 0, alreadyInOfficial: 2 })).toBe(
      "1 bem novo incluído; 3 já importado(s) anteriormente; 2 já existente(s) no inventário.",
    );
    expect(describeImportResult({ toImport: 0, alreadyImported: 4, duplicatedInSource: 0, alreadyInOfficial: 0 })).toBe("0 bens novos incluídos; 4 já importado(s) anteriormente.");
  });
});
