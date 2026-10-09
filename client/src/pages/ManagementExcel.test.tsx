// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exports: { consolidated: vi.fn(() => true), pending: vi.fn(() => true) },
  controlRecords: [
    {
      school: { name: "EE Afonso Pena", schoolCode: "284", city: "Belo Horizonte" },
      cycle: { status: "validated" },
      items: [],
      members: [],
      issues: [],
      documents: [],
      notes: null,
    },
  ],
  controlRefetch: vi.fn(),
  navigate: vi.fn(),
}));

mocks.controlRefetch.mockResolvedValue({ data: mocks.controlRecords });

vi.mock("@/lib/exportSchoolControlExcel", () => ({
  exportSchoolControlWorkbook: mocks.exports.consolidated,
  exportPendingIssuesTemplate: mocks.exports.pending,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    management: {
      dashboard: {
        useQuery: () => ({
          isLoading: false,
          refetch: vi.fn(),
          data: {
            metrics: { schoolsWithCycles: 1, submitted: 0, validated: 0, openIssues: 1, totalValue: 100 },
            cycles: [
              {
                cycle: { id: 7, status: "submitted", submittedAt: new Date("2026-08-26") },
                school: { name: "EE Afonso Pena", city: "Belo Horizonte" },
              },
            ],
            consolidated: [{ expenseCode: "52.14", quantity: 2, totalValue: "100.00" }],
            pendingIssues: [
              {
                id: 1,
                school: "EE Afonso Pena",
                schoolId: 1,
                issueType: "not_found",
                resolutionStatus: "open",
                description: "Armário de aço",
                propertyNumber: "123",
                quantity: 2,
                conservationState: "Bom",
                location: "Bloco A",
                totalValue: "100.00",
                originBody: "SEE",
                currentSituation: "Em uso",
                pendingDescription: "Bem não localizado",
                measuresTaken: "Solicitada conferência",
              },
            ],
          },
        }),
      },
      controlExport: { useQuery: () => ({ isFetching: false, refetch: mocks.controlRefetch }) },
      archiveStats: { useQuery: () => ({ isLoading: false, isFetching: false, data: null, refetch: vi.fn() }) },
      retryArchive: { useMutation: () => ({ isPending: false, variables: null, mutate: vi.fn() }) },
    },
    catalog: { expenseCategories: { useQuery: () => ({ data: [{ code: "52.14", label: "Material permanente" }] }) } },
  },
}));

vi.mock("wouter", () => ({ useLocation: () => ["/gestao", mocks.navigate] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import ManagementExcel from "./ManagementExcel";

afterEach(() => {
  cleanup();
  mocks.exports.consolidated.mockClear();
  mocks.exports.pending.mockClear();
  mocks.controlRefetch.mockClear();
  mocks.navigate.mockClear();
});

describe("exportações Excel no painel de gestão", () => {
  it("aciona o consolidado e o registro de pendências com todos os campos", async () => {
    render(<ManagementExcel />);
    const buttons = screen.getAllByRole("button", { name: "Excel" });

    fireEvent.click(buttons[0]);
    await waitFor(() =>
      expect(mocks.exports.consolidated).toHaveBeenCalledWith(
        expect.objectContaining({ year: expect.any(Number), records: mocks.controlRecords }),
      ),
    );

    fireEvent.click(buttons[1]);
    expect(mocks.exports.pending).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: expect.stringMatching(/^registro-pendencias-/),
        rows: [
          expect.objectContaining({
            Quantidade: 2,
            "Estado de conservação": "Bom",
            "Local / bloco": "Bloco A",
            "Valor total (R$)": "100.00",
            "Órgão de origem": "SEE",
            "Situação atual": "Em uso",
          }),
        ],
      }),
    );

  });
});
