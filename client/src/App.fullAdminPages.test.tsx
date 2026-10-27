// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mutation = { mutate: vi.fn(), isPending: false };
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 9, name: "Administrador de teste", role: "admin" }, loading: false, logout: vi.fn() }) }));
vi.mock("./components/DashboardLayout", () => ({ default: ({ children }: any) => <main data-testid="app-layout">{children}</main> }));
vi.mock("./components/ErrorBoundary", () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock("./contexts/ThemeContext", () => ({ ThemeProvider: ({ children }: any) => <>{children}</> }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/components/ui/tooltip", () => ({ TooltipProvider: ({ children }: any) => <>{children}</> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ school: { list: { invalidate: vi.fn() } }, management: { listUsers: { invalidate: vi.fn() }, schoolAccessStatus: { invalidate: vi.fn() } } }),
    school: { myAccessRequests: { useQuery: () => ({ data: [] }) }, pendingAccessCounts: { useQuery: () => ({ data: {} }) }, requestAccess: { useMutation: () => mutation }, searchForAccess: { useQuery: () => ({ data: [] }) }, pendingAccessRequests: { useQuery: () => ({ data: [] }) }, reviewAccessRequest: { useMutation: () => mutation }, listAssignableUsers: { useQuery: () => ({ data: [] }) }, listMembers: { useQuery: () => ({ data: [], refetch: vi.fn() }) }, assignUser: { useMutation: () => mutation }, list: { useQuery: () => ({ data: [] }) }, create: { useMutation: () => mutation }, update: { useMutation: () => mutation } },
    catalog: { expenseCategories: { useQuery: () => ({ data: [] }) } },
    inventory: { overview: { useQuery: () => ({ data: undefined, isLoading: false, refetch: vi.fn() }) }, createCycle: { useMutation: () => mutation }, setCommittee: { useMutation: () => mutation }, addItem: { useMutation: () => mutation }, updateItem: { useMutation: () => mutation }, deleteItem: { useMutation: () => mutation }, addIssue: { useMutation: () => mutation }, deleteIssue: { useMutation: () => mutation }, upsertNotes: { useMutation: () => mutation }, uploadDocument: { useMutation: () => mutation }, removeDocument: { useMutation: () => mutation }, submit: { useMutation: () => mutation } },
    management: { dashboard: { useQuery: () => ({ isLoading: false, data: { metrics: { schoolsWithCycles: 0, submitted: 0, validated: 0, openIssues: 0, totalValue: 0 }, cycles: [], consolidated: [], pendingIssues: [] } }) }, controlExport: { useQuery: () => ({ isFetching: false, refetch: vi.fn() }) }, changeStatus: { useMutation: () => mutation }, listUsers: { useQuery: () => ({ data: [] }) }, setUserRole: { useMutation: () => mutation }, deleteUser: { useMutation: () => mutation }, schoolAccessStatus: { useQuery: () => ({ data: { suspended: false }, isLoading: false }) }, setSchoolAccessSuspended: { useMutation: () => mutation }, archiveStats: { useQuery: () => ({ isLoading: false, isFetching: false, data: null, refetch: vi.fn() }) }, retryArchive: { useMutation: () => ({ ...mutation, variables: null }) } },
  },
}));

import App from "./App";

afterEach(() => { cleanup(); window.history.pushState({}, "", "/"); });
describe("aplicação com administrador", () => {
  for (const [path, heading] of [["/", "Escolas e inventários"], ["/gestao", "Gestão e consolidação"], ["/administradores", "Administradores da plataforma"]] as const) {
    it(`carrega a página real ${path}`, () => {
      window.history.pushState({}, "", path);
      render(<App />);
      expect(screen.getByTestId("app-layout")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    });
  }
});
