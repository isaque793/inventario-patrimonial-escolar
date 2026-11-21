import { describe, expect, it } from "vitest";
import { getInventorySubmissionRequirements } from "./inventorySubmission";

describe("requisitos de submissão do inventário", () => {
  it("lista claramente todos os requisitos ausentes", () => {
    expect(getInventorySubmissionRequirements({ itemCount: 0, memberCount: 0 })).toEqual({
      ready: false,
      missing: ["Ao menos um item patrimonial", "Ao menos um integrante da subcomissão"],
    });
  });

  it("libera a submissão com item e um integrante ou mais, sem exigir documentos", () => {
    expect(getInventorySubmissionRequirements({ itemCount: 1, memberCount: 1 })).toEqual({ ready: true, missing: [] });
    expect(getInventorySubmissionRequirements({ itemCount: 1, memberCount: 25 })).toEqual({ ready: true, missing: [] });
  });

  it("bloqueia enquanto houver patrimônios importados aguardando conferência", () => {
    expect(getInventorySubmissionRequirements({ itemCount: 150, memberCount: 1, pendingConfirmationCount: 30 })).toEqual({
      ready: false,
      missing: ["Conferir 30 patrimônios importados pendentes"],
    });
    expect(getInventorySubmissionRequirements({ itemCount: 150, memberCount: 1, pendingConfirmationCount: 1 }).missing).toEqual(["Conferir 1 patrimônio importado pendente"]);
    expect(getInventorySubmissionRequirements({ itemCount: 150, memberCount: 1, pendingConfirmationCount: 0 })).toEqual({ ready: true, missing: [] });
  });
});

