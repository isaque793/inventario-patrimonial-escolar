import { describe, expect, it } from "vitest";
import { getConferenceProgress } from "@shared/inventoryCycle";

describe("getConferenceProgress", () => {
  it("120 de 150 conferidos: 30 pendentes, 80% e bloqueado", () => {
    const items = [...Array(120).fill({ importStatus: "confirmed" }), ...Array(30).fill({ importStatus: "pending_confirmation" })];
    expect(getConferenceProgress(items)).toEqual({ total: 150, confirmed: 120, pending: 30, percent: 80, complete: false });
  });

  it("bens manuais (sem importStatus) não entram na conta; sem importados o progresso é completo", () => {
    expect(getConferenceProgress([{ importStatus: null }, {}])).toEqual({ total: 0, confirmed: 0, pending: 0, percent: 100, complete: true });
  });

  it("um bem excluído deixa de contar como pendente", () => {
    const items = [{ importStatus: "confirmed" }, { importStatus: "pending_confirmation" }];
    expect(getConferenceProgress(items.slice(0, 1)).complete).toBe(true);
  });
});
