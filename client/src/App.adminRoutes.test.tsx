// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 9, name: "Admin", role: "admin" }, loading: false }) }));
vi.mock("./components/DashboardLayout", () => ({ default: ({ children }: any) => <div data-testid="layout-admin">{children}</div> }));
vi.mock("./components/AdminGuard", () => ({ AdminGuard: ({ children }: any) => <>{children}</> }));
vi.mock("./components/ErrorBoundary", () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock("./contexts/ThemeContext", () => ({ ThemeProvider: ({ children }: any) => <>{children}</> }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/components/ui/tooltip", () => ({ TooltipProvider: ({ children }: any) => <>{children}</> }));
vi.mock("./pages/Home", () => ({ default: () => <h1>Conteúdo de Escolas</h1> }));
vi.mock("./pages/ManagementExcel", () => ({ default: () => <h1>Conteúdo de Gestão</h1> }));
vi.mock("./pages/AdminUsers", () => ({ default: () => <h1>Conteúdo de Administradores</h1> }));
vi.mock("./pages/NotFound", () => ({ default: () => <h1>Não encontrado</h1> }));

import App from "./App";

afterEach(() => { cleanup(); window.history.pushState({}, "", "/"); });

describe("rotas administrativas", () => {
  for (const [path, content] of [["/", "Conteúdo de Escolas"], ["/gestao", "Conteúdo de Gestão"], ["/administradores", "Conteúdo de Administradores"]] as const) {
    it(`carrega ${path} para o administrador`, () => {
      window.history.pushState({}, "", path);
      render(<App />);
      expect(screen.getByTestId("layout-admin")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: content })).toBeInTheDocument();
    });
  }
});
