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
});
