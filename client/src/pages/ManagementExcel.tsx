import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArchiveStatusPanel } from "@/components/ArchiveStatusPanel";
import { exportPendingIssuesTemplate, exportSchoolControlWorkbook } from "@/lib/exportSchoolControlExcel";
import { trpc } from "@/lib/trpc";
import { Building2, CheckCircle2, CircleAlert, ClipboardCheck, FileSpreadsheet, Landmark, Loader2, Send } from "lucide-react";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { ScrollableList } from "@/components/ScrollableList";

const CURRENT_YEAR = new Date().getFullYear();

const issueLabels: Record<string, string> = {
  not_found: "Bem não localizado",
  outside_register: "Bem sem identificação patrimonial",
  new_equipment: "Divergência de patrimônio",
  transfer: "Transferência",
  donation: "Doação",
  guard_term: "Termo de guarda",
  other: "Outro",
};

const issueStatusLabels: Record<string, string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  resolved: "Resolvida",
};

const cycleStatusLabels: Record<string, string> = {
  draft: "Em preparação",
  submitted: "Submetido",
  under_review: "Em análise",
  returned: "Devolvido",
  validated: "Validado",
};

const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

function Metric({
  icon: Icon,
  label,
  value,
  tone = "green",
}: {
  icon: typeof Building2;
  label: string;
  value: string | number;
  tone?: "green" | "amber" | "rose";
}) {
  const colors = {
    green: "bg-[#e8f1e8] text-[#286149]",
    amber: "bg-amber-100 text-amber-700",
    rose: "bg-rose-100 text-rose-700",
  };

  return (
    <Card className="border-[#dce7dc]">
      <CardContent className="p-4">
        <div className={`flex size-9 items-center justify-center rounded-xl ${colors[tone]}`}>
          <Icon className="size-4" />
        </div>
        <p className="mt-4 text-[10px] font-bold uppercase tracking-[.11em] text-[#708175]">{label}</p>
        <p className="mt-1 text-xl font-semibold text-[#1e4134]">{value}</p>
      </CardContent>
    </Card>
  );
}

export default function ManagementExcel() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [issueStatus, setIssueStatus] = useState("all");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [, setLocation] = useLocation();

  const dashboardQuery = trpc.management.dashboard.useQuery({ year });
  const controlExportQuery = trpc.management.controlExport.useQuery({ year }, { enabled: false });
  const categoriesQuery = trpc.catalog.expenseCategories.useQuery();

  const dashboard = dashboardQuery.data;
  const categories = Object.fromEntries((categoriesQuery.data ?? []).map(category => [category.code, category.label]));

  const schools = useMemo(
    () => Array.from(new Map((dashboard?.pendingIssues || []).map((issue: any) => [String(issue.schoolId), issue.school])).entries()),
    [dashboard?.pendingIssues],
  );

  const visibleIssues = useMemo(
    () =>
      (dashboard?.pendingIssues || []).filter(
        (issue: any) =>
          (issueStatus === "all" || issue.resolutionStatus === issueStatus) &&
          (schoolFilter === "all" || String(issue.schoolId) === schoolFilter),
      ),
    [dashboard?.pendingIssues, issueStatus, schoolFilter],
  );

  const pendingExportRows = visibleIssues.map((issue: any) => ({
    Escola: issue.school,
    Tipo: issueLabels[issue.issueType] || "Outro",
    Situação: issueStatusLabels[issue.resolutionStatus] || "Aberta",
    Descrição: issue.description,
    Património: issue.propertyNumber,
    Quantidade: issue.quantity,
    "Estado de conservação": issue.conservationState,
    "Local / bloco": issue.location,
    "Valor total (R$)": issue.totalValue,
    "Órgão de origem": issue.originBody,
    "Situação atual": issue.currentSituation,
    Pendência: issue.pendingDescription,
    Medidas: issue.measuresTaken,
  }));

  if (dashboardQuery.isLoading || !dashboard) {
    return (
      <div className="flex min-h-80 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#2d6a51]" />
      </div>
    );
  }

  const { metrics } = dashboard;

  const exportPending = () => {
    if (!exportPendingIssuesTemplate({ rows: pendingExportRows, fileName: `registro-pendencias-${year}` })) {
      toast.info("Não existem pendências com estes filtros.");
    }
  };

  const exportConsolidated = async () => {
    const result = await controlExportQuery.refetch();
    if (result.error || !result.data) {
      toast.error("Não foi possível preparar o resumo consolidado.");
      return;
    }

    if (exportSchoolControlWorkbook({ year, records: result.data })) {
      toast.success("Resumo consolidado exportado com somente as escolas que possuem patrimônio, pendências ou divergências.");
    } else {
      toast.info("Não existem escolas com patrimônio, pendências ou divergências para exportar neste período.");
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="flex flex-col gap-5 border-b border-[#dbe6dc] pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#597566]">Equipa gestora</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[#173b30] md:text-4xl">Gestão e consolidação</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#65796e]">
            Acompanhe as escolas, valide inventários e exporte os consolidados em planilhas Excel.
          </p>
        </div>
        <Select value={String(year)} onValueChange={value => setYear(Number(value))}>
          <SelectTrigger className="w-[112px] bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map(option => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={Building2} label="Escolas com ciclo" value={metrics.schoolsWithCycles} />
        <Metric icon={Send} label="Submetidos" value={metrics.submitted} tone="amber" />
        <Metric icon={CheckCircle2} label="Validados" value={metrics.validated} />
        <Metric icon={CircleAlert} label="Pendências abertas" value={metrics.openIssues} tone="rose" />
        <Metric icon={Landmark} label="Valor consolidado" value={money(metrics.totalValue)} />
      </div>

      <Card className="border-[#dce7dc]">
        <CardContent className="p-0">
          <div className="flex items-start gap-3 p-5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#e8f1e8] text-[#276249]">
              <ClipboardCheck className="size-4" />
            </div>
            <div>
              <h2 className="font-semibold text-[#203f33]">Validações por escola</h2>
              <p className="mt-0.5 text-xs leading-5 text-[#6b7d72]">
                Abra a revisão para conferir documentos, inventário, pendências e concluir a análise administrativa.
              </p>
            </div>
          </div>

          <ScrollableList>
            <table className="w-full min-w-[680px] text-sm">
              <thead className="border-y border-[#e4ece5] bg-[#f7faf6] text-[10px] font-bold uppercase tracking-[.1em] text-[#6c7e72]">
                <tr>
                  <th className="px-5 py-3 text-left">Escola</th>
                  <th className="px-4 py-3 text-left">Situação</th>
                  <th className="px-4 py-3 text-right">Submissão</th>
                  <th className="px-5 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.cycles.map((entry: any) => (
                  <tr key={entry.cycle.id} data-list-item className="border-b border-[#edf2ed]">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-[#234136]">{entry.school.name}</p>
                      <p className="text-xs text-[#75867a]">{entry.school.city || "Sem município"}</p>
                    </td>
                    <td className="px-4 py-4">
                      <Badge className="border-0 bg-[#e8f1e8] text-[#286149]">{cycleStatusLabels[entry.cycle.status]}</Badge>
                    </td>
                    <td className="px-4 py-4 text-right text-xs text-[#687a6e]">
                      {entry.cycle.submittedAt ? new Date(entry.cycle.submittedAt).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button size="sm" variant="outline" onClick={() => setLocation(`/gestao/analise/${entry.cycle.id}`)}>
                        Analisar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableList>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-[#dce7dc]">
          <CardContent className="p-0">
            <div className="flex items-start justify-between gap-4 p-5">
              <div>
                <h2 className="font-semibold text-[#203f33]">Resumo consolidado</h2>
                <p className="mt-1 text-xs text-[#6b7d72]">
                  O Excel usa o modelo de controle por escola e bem patrimonial e ignora escolas sem patrimônio, pendências ou divergências.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => void exportConsolidated()}
                disabled={controlExportQuery.isFetching}
                className="bg-[#0c4a3e] hover:bg-[#083a31]"
              >
                <FileSpreadsheet className="mr-1.5 size-4" />
                {controlExportQuery.isFetching ? "Preparando" : "Excel"}
              </Button>
            </div>

            <ScrollableList>
              <table className="w-full min-w-[520px] text-sm">
                <thead className="border-y border-[#e4ece5] bg-[#f7faf6] text-[10px] font-bold uppercase tracking-[.1em] text-[#6c7e72]">
                  <tr>
                    <th className="px-5 py-3 text-left">Código</th>
                    <th className="px-4 py-3 text-left">Elemento</th>
                    <th className="px-4 py-3 text-right">Qtd.</th>
                    <th className="px-5 py-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.consolidated.map((line: any) => (
                    <tr key={line.expenseCode} data-list-item className="border-b border-[#edf2ed]">
                      <td className="px-5 py-3 font-mono text-xs text-[#245b48]">{line.expenseCode}</td>
                      <td className="px-4 py-3 text-xs text-[#52675b]">{categories[line.expenseCode] || "Não classificado"}</td>
                      <td className="px-4 py-3 text-right">{line.quantity}</td>
                      <td className="px-5 py-3 text-right font-semibold">{money(line.totalValue)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot data-list-footer className="sticky bottom-0 bg-[#edf5ed] shadow-[0_-1px_0_#dce7dc]">
                  <tr>
                    <td colSpan={3} className="px-5 py-3 text-right text-xs font-bold uppercase tracking-[.12em] text-[#526d5d]">
                      Total global
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-[#183f31]">{money(metrics.totalValue)}</td>
                  </tr>
                </tfoot>
              </table>
            </ScrollableList>
          </CardContent>
        </Card>

        <Card className="border-[#dce7dc]">
          <CardContent className="p-0">
            <div className="flex items-start justify-between gap-4 p-5">
              <div>
                <h2 className="font-semibold text-[#203f33]">Pendências consolidadas</h2>
                <p className="mt-1 text-xs text-[#6b7d72]">Exportação no formato Registro de Pendências, com 12 colunas e aba de listas.</p>
              </div>
              <Button size="sm" onClick={exportPending} className="bg-[#0c4a3e] hover:bg-[#083a31]">
                <FileSpreadsheet className="mr-1.5 size-4" />
                Excel
              </Button>
            </div>

            <div className="grid gap-2 border-y border-[#e4ece5] bg-[#f7faf6] p-3 sm:grid-cols-2">
              <Select value={schoolFilter} onValueChange={setSchoolFilter}>
                <SelectTrigger className="h-8 bg-white text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as escolas</SelectItem>
                  {schools.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name as string}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={issueStatus} onValueChange={setIssueStatus}>
                <SelectTrigger className="h-8 bg-white text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os estados</SelectItem>
                  <SelectItem value="open">Abertas</SelectItem>
                  <SelectItem value="in_progress">Em andamento</SelectItem>
                  <SelectItem value="resolved">Resolvidas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <ScrollableList className="divide-y divide-[#edf2ed]">
              {visibleIssues.length ? (
                visibleIssues.map((issue: any) => (
                  <div key={issue.id} data-list-item className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[.1em] text-[#688073]">
                          {issue.school} · {issueLabels[issue.issueType] || "Outro"}
                        </p>
                        <p className="mt-1 font-semibold text-[#254337]">{issue.description}</p>
                      </div>
                      <Badge className="border-0 bg-amber-100 text-amber-800">{issueStatusLabels[issue.resolutionStatus]}</Badge>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[#697c70]">{issue.pendingDescription}</p>
                  </div>
                ))
              ) : (
                <div className="px-5 py-10 text-center text-sm text-[#718277]">Não há pendências com estes filtros.</div>
              )}
            </ScrollableList>
          </CardContent>
        </Card>
      </div>

      <ArchiveStatusPanel year={year} />
    </div>
  );
}
