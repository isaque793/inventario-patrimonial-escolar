// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  overviewQuery: vi.fn(() => ({ data: undefined, isLoading: false, refetch: vi.fn() })),
  schoolListQuery: vi.fn(() => ({ data: [], isLoading: false })),
  toastError: vi.fn(),
}));

const mutation = { mutate: vi.fn(), isPending: false };
let role: "admin" | "user" = "user";
let schools: any[] = [];
let overview: any;

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 999, role }, loading: false }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/", vi.fn()] }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ school: { list: { invalidate: vi.fn() } } }),
    school: { list: { useQuery: () => { mocks.schoolListQuery(); return { data: schools, isLoading: false }; } }, listAssignableUsers: { useQuery: () => ({ data: [] }) }, listMembers: { useQuery: () => ({ data: [], refetch: vi.fn() }) }, assignUser: { useMutation: () => mutation }, create: { useMutation: () => mutation }, update: { useMutation: () => mutation } },
    catalog: { expenseCategories: { useQuery: () => ({ data: [] }) } },
    inventory: {
      overview: { useQuery: (...args: unknown[]) => { (mocks.overviewQuery as unknown as (...queryArgs: unknown[]) => void)(...args); return { data: overview, isLoading: false, refetch: vi.fn() }; } }, createCycle: { useMutation: () => mutation }, setCommittee: { useMutation: () => mutation }, addItem: { useMutation: () => mutation }, updateItem: { useMutation: () => mutation }, deleteItem: { useMutation: () => mutation }, addIssue: { useMutation: () => mutation }, deleteIssue: { useMutation: () => mutation }, upsertNotes: { useMutation: () => mutation }, uploadDocument: { useMutation: () => mutation }, removeDocument: { useMutation: () => mutation }, submit: { useMutation: () => mutation },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: mocks.toastError } }));
vi.mock("@/components/BarcodeScannerDialog", () => ({ BarcodeScannerDialog: ({ open, onDetected }: { open: boolean; onDetected: (code: string) => void }) => open ? <div role="dialog" aria-label="Leitor de código de barras"><p>Não foi possível acessar a câmera. Autorize o uso ou digite o código manualmente.</p><button data-testid="simulate-barcode" type="button" onClick={() => onDetected("PAT-MOBILE-123")}>Simular leitura</button></div> : null }));

import Home from "./Home";

afterEach(() => { cleanup(); role = "user"; schools = []; overview = undefined; mutation.mutate.mockClear(); mocks.overviewQuery.mockClear(); mocks.schoolListQuery.mockClear(); mocks.toastError.mockClear(); });

describe("início sem vínculo escolar", () => {
  it("exibe orientação e mantém a consulta de inventário desativada", () => {
    render(<Home />);
    expect(screen.getByText("A equipa gestora ainda não associou o seu acesso a uma escola. Peça ao responsável pela plataforma para o configurar.")).toBeInTheDocument();
    expect(mocks.overviewQuery).toHaveBeenCalledWith(expect.objectContaining({ schoolId: 0 }), expect.objectContaining({ enabled: false }));
  });

  it("carrega a página real de escolas para administrador", async () => {
    role = "admin";
    schools = [{ id: 12, name: "Escola Administrativa", schoolCode: "31234567", city: "Belo Horizonte" }];
    render(<Home />);
    expect(screen.getByRole("heading", { name: "Escolas e inventários" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("Escola Administrativa").length).toBeGreaterThan(0));
    await waitFor(() => expect(mocks.overviewQuery).toHaveBeenLastCalledWith(expect.objectContaining({ schoolId: 12 }), expect.objectContaining({ enabled: true })));
  });

  it("mostra exigências pendentes e não envia um inventário incompleto", async () => {
    schools = [{ id: 12, name: "Escola de teste", schoolCode: "31234567", city: "Belo Horizonte" }];
    overview = { school: schools[0], cycle: { id: 55, status: "draft" }, items: [{ id: 1, totalValue: "25.00" }], members: [], documents: [], issues: [], history: [], notes: null };
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/Ao menos um integrante da subcomissão/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Concluir exigências para submeter" }));
    expect(mutation.mutate).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("Ao menos um integrante da subcomissão"));
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.stringContaining("Ata de Abertura"));
  });

  it("envia o inventário sem documentos assinados (são opcionais)", async () => {
    schools = [{ id: 12, name: "Escola sem documentos", schoolCode: "31234567", city: "Belo Horizonte" }];
    overview = { school: schools[0], cycle: { id: 57, status: "draft" }, items: [{ id: 1, totalValue: "25.00" }], members: [{ id: 1, name: "Ana", jobTitle: "Professora", masp: "1", isPresident: 1 }], documents: [], issues: [], history: [], notes: null };
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Submeter para validação" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Submeter para validação" }));
    expect(mutation.mutate).toHaveBeenCalledWith({ cycleId: 57 });
  });

  it("envia o inventário com um integrante quando os demais requisitos foram concluídos", async () => {
    schools = [{ id: 12, name: "Escola completa", schoolCode: "31234567", city: "Belo Horizonte" }];
    overview = { school: schools[0], cycle: { id: 56, status: "draft" }, items: [{ id: 1, totalValue: "25.00" }], members: [{ id: 1, name: "Ana", jobTitle: "Professora", masp: "1", isPresident: 1 }], documents: [{ documentType: "opening_minutes" }, { documentType: "responsibility_term" }, { documentType: "closing_minutes" }], issues: [], history: [], notes: null };
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Submeter para validação" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Submeter para validação" }));
    expect(mutation.mutate).toHaveBeenCalledWith({ cycleId: 56 });
  });

  it("usa a redação em português brasileiro no acompanhamento do inventário", async () => {
    schools = [{ id: 12, name: "Escola acompanhada", schoolCode: "31234567", city: "Belo Horizonte" }];
    overview = { school: schools[0], cycle: { id: 57, status: "submitted" }, items: [], members: [], documents: [], issues: [], history: [], notes: null };
    render(<Home />);
    await waitFor(() => expect(screen.getByText("A equipe gestora está acompanhando este inventário.")).toBeInTheDocument());
  });

  it("abre o leitor no cadastro móvel e preenche o número patrimonial após a leitura", async () => {
    schools = [{ id: 12, name: "Escola móvel", schoolCode: "31234567", city: "Belo Horizonte" }];
    overview = { school: schools[0], cycle: { id: 59, status: "draft" }, items: [], members: [{ id: 1, name: "Ana", jobTitle: "Professora", masp: "1", isPresident: 1 }], documents: [], issues: [], history: [], notes: null };
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Adicionar item" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Adicionar item" }));
    fireEvent.click(screen.getByRole("button", { name: "Ler código de barras pela câmera" }));
    await waitFor(() => expect(document.querySelector("[data-testid='simulate-barcode']")).toBeTruthy());
    expect(screen.getByText("Não foi possível acessar a câmera. Autorize o uso ou digite o código manualmente.")).toBeTruthy();
    const propertyInput = document.querySelector('input[name="propertyNumber"]') as HTMLInputElement;
    fireEvent.change(propertyInput, { target: { value: "PAT-MANUAL-456" } });
    expect(propertyInput.value).toBe("PAT-MANUAL-456");
    fireEvent.click(document.querySelector("[data-testid='simulate-barcode']") as HTMLElement);
    expect((document.querySelector('input[name="propertyNumber"]') as HTMLInputElement).value).toBe("PAT-MOBILE-123");
    expect(document.querySelector("[class*='sm:max-w-3xl']")).toBeTruthy();
  });

  it("permite ampliar a subcomissão até o limite de 25 integrantes", async () => {
    schools = [{ id: 12, name: "Escola da subcomissão", schoolCode: "31234567", city: "Belo Horizonte" }];
    overview = { school: schools[0], cycle: { id: 58, status: "draft" }, items: [], members: [{ id: 1, name: "Ana", jobTitle: "Professora", masp: "1", isPresident: 1 }], documents: [], issues: [], history: [], notes: null };
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    for (let index = 0; index < 24; index += 1) fireEvent.click(screen.getByRole("button", { name: "Adicionar integrante" }));
    expect(screen.getByText("25 de 25 integrantes cadastrados")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Limite de 25 integrantes" })).toBeDisabled();
  });
});
