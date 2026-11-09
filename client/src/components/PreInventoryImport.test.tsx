// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportFilterTabs, ImportPanel, ImportStatusBadge, ImportedItemNotice, filterByImportStatus, importCounts, importRowColor } from "./PreInventoryImport";

afterEach(cleanup);

const items = [
  { id: 1, importStatus: "pending_confirmation" },
  { id: 2, importStatus: "confirmed" },
  { id: 3, importStatus: null },
  { id: 4, importStatus: "pending_confirmation" },
];

describe("estados do bem importado", () => {
  it("amarelo suave para aguardando conferência, verde suave para conferido, sem cor nos demais", () => {
    expect(importRowColor("pending_confirmation")).toBe("#FFF4CC");
    expect(importRowColor("confirmed")).toBe("#E4F3E7");
    expect(importRowColor(null)).toBeUndefined();
    expect(importRowColor(undefined)).toBeUndefined();
  });

  it("a situação também aparece em texto (a cor não é o único sinal)", () => {
    const { rerender } = render(<ImportStatusBadge status="pending_confirmation" />);
    expect(screen.getByText("Aguardando conferência")).toBeInTheDocument();
    rerender(<ImportStatusBadge status="confirmed" />);
    expect(screen.getByText("Conferido")).toBeInTheDocument();
    rerender(<ImportStatusBadge status={null} />);
    expect(screen.queryByText("Conferido")).not.toBeInTheDocument();
  });

  it("conta importados, pendentes e conferidos e filtra por situação", () => {
    expect(importCounts(items)).toEqual({ imported: 3, pending: 2, confirmed: 1 });
    expect(filterByImportStatus(items, "pending_confirmation").map(item => item.id)).toEqual([1, 4]);
    expect(filterByImportStatus(items, "confirmed").map(item => item.id)).toEqual([2]);
    expect(filterByImportStatus(items, "all")).toHaveLength(4);
  });
});

describe("componentes de importação", () => {
  it("o painel deixa claro que importar copia e não altera o pré-inventário", () => {
    const onImport = vi.fn();
    render(<ImportPanel counts={{ imported: 3, pending: 2, confirmed: 1 }} editable onImport={onImport} />);
    expect(screen.getByText(/cria cópias no inventário oficial/i)).toBeInTheDocument();
    expect(screen.getByText(/não é alterado/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /importar bens do pré-inventário/i }));
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it("sem permissão de edição não oferece a importação", () => {
    render(<ImportPanel counts={{ imported: 0, pending: 0, confirmed: 0 }} editable={false} onImport={() => undefined} />);
    expect(screen.queryByRole("button", { name: /importar/i })).not.toBeInTheDocument();
  });

  it("filtros mostram as quantidades e avisam a seleção", () => {
    const onChange = vi.fn();
    render(<ImportFilterTabs value="all" onChange={onChange} counts={{ imported: 3, pending: 2, confirmed: 1 }} total={4} />);
    fireEvent.click(screen.getByRole("button", { name: "Conferidos (1)" }));
    expect(onChange).toHaveBeenCalledWith("confirmed");
    expect(screen.getByRole("button", { name: "Todos (4)" })).toHaveAttribute("aria-pressed", "true");
  });

  it("avisos do formulário: importado pendente x já conferido", () => {
    const { rerender } = render(<ImportedItemNotice confirmed={false} />);
    expect(screen.getByText(/Bem importado do pré-inventário/)).toBeInTheDocument();
    rerender(<ImportedItemNotice confirmed />);
    expect(screen.getByText(/já foi conferido/)).toBeInTheDocument();
  });
});
