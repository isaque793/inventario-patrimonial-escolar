// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("wouter", () => ({ useLocation: () => ["/validacao", navigate] }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    management: {
      dashboard: {
        useQuery: () => ({
          isLoading: false,
          data: {
            cycles: [
              { cycle: { id: 7, status: "submitted", submittedAt: new Date("2026-08-26") }, school: { name: "EE Afonso Pena", city: "Belo Horizonte" } },
              { cycle: { id: 8, status: "validated", submittedAt: null }, school: { name: "EE Água Limpa", city: "Contagem" } },
            ],
          },
        }),
      },
    },
  },
}));

import Validation from "./Validation";

afterEach(cleanup);

describe("aba de validação", () => {
  it("filtra as escolas pela pesquisa, ignorando acentos", () => {
    render(<Validation />);
    expect(screen.getByText("EE Afonso Pena")).toBeInTheDocument();
    expect(screen.getByText("EE Água Limpa")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Pesquisar escola"), { target: { value: "agua" } });
    expect(screen.queryByText("EE Afonso Pena")).not.toBeInTheDocument();
    expect(screen.getByText("EE Água Limpa")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Pesquisar escola"), { target: { value: "zzz" } });
    expect(screen.getByText("Nenhuma escola encontrada para esta pesquisa.")).toBeInTheDocument();
  });

  it("abre a análise da escola", () => {
    render(<Validation />);
    fireEvent.click(screen.getAllByRole("button", { name: "Analisar" })[0]);
    expect(navigate).toHaveBeenCalledWith("/gestao/analise/7");
  });
});
