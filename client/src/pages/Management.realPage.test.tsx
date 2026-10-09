// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({ trpc: { management: { dashboard: { useQuery: () => ({ isLoading: false, data: { metrics: { schoolsWithCycles: 0, submitted: 0, validated: 0, openIssues: 0, totalValue: 0 }, cycles: [], consolidated: [], pendingIssues: [] } }) }, changeStatus: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } }, catalog: { expenseCategories: { useQuery: () => ({ data: [] }) } } } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import Management from "./Management";

afterEach(cleanup);
describe("painel real de gestão", () => {
  it("carrega os conteúdos de gestão e consolidação", () => {
    render(<Management />);
    expect(screen.getByRole("heading", { name: "Gestão e consolidação" })).toBeInTheDocument();
    expect(screen.getByText("Resumo consolidado")).toBeInTheDocument();
    expect(screen.getByText("Pendências consolidadas")).toBeInTheDocument();
  });
});
