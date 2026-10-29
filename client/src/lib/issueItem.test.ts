import { describe, expect, it } from "vitest";
import { findItemForIssue } from "./issueItem";

const items = [
  { id: 1, propertyNumber: "123", description: "Mesa" },
  { id: 2, propertyNumber: "Não se aplica", description: "Cadeira azul" },
  { id: 3, propertyNumber: "Não se aplica", description: "Cadeira azul" },
  { id: 4, propertyNumber: "Não se aplica", description: "Armário" },
];

describe("findItemForIssue", () => {
  it("usa o vínculo pelo id, inclusive para bens sem patrimônio repetidos", () => {
    expect(findItemForIssue({ itemId: 3, propertyNumber: "Não se aplica", description: "Cadeira azul" }, items)?.id).toBe(3);
  });

  it("não procura outro bem quando o vínculo aponta para um bem removido", () => {
    expect(findItemForIssue({ itemId: 99, propertyNumber: "123" }, items)).toBeNull();
  });

  it("pendência antiga: acha pelo número de patrimônio quando é único", () => {
    expect(findItemForIssue({ propertyNumber: "123", description: "Mesa" }, items)?.id).toBe(1);
  });

  it("pendência antiga de bem sem patrimônio: acha pela descrição, inclusive com o prefixo automático", () => {
    expect(findItemForIssue({ propertyNumber: null, description: "Bem sem número de patrimônio: Armário" }, items)?.id).toBe(4);
  });

  it("não adivinha quando há bens idênticos sem vínculo", () => {
    expect(findItemForIssue({ propertyNumber: "Não se aplica", description: "Cadeira azul" }, items)).toBeNull();
  });
});
