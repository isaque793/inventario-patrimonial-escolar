import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollableList } from "@/components/ScrollableList";
import { trpc } from "@/lib/trpc";
import { ClipboardCheck, Loader2, Search } from "lucide-react";
import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";

const CURRENT_YEAR = new Date().getFullYear();

const cycleStatusLabels: Record<string, string> = {
  draft: "Em preparação",
  submitted: "Submetido",
  under_review: "Em análise",
  returned: "Devolvido",
  validated: "Validado",
};

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Validation() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [search, setSearch] = useState("");
  const [, setLocation] = useLocation();

  const dashboardQuery = trpc.management.dashboard.useQuery({ year });
  const cycles: any[] = dashboardQuery.data?.cycles ?? [];

  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    if (!term) return cycles;
    return cycles.filter(entry =>
      normalize([entry.school?.name, entry.school?.city, entry.school?.schoolCode, cycleStatusLabels[entry.cycle.status]].filter(Boolean).join(" ")).includes(term),
    );
  }, [cycles, search]);

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="flex flex-col gap-5 border-b border-[#dbe6dc] pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#597566]">Equipa gestora</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[#173b30] md:text-4xl">Validação</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#65796e]">
            Localize uma escola e abra a revisão para conferir documentos, inventário e pendências.
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

          <div className="flex flex-col gap-3 border-y border-[#e4ece5] bg-[#f7faf6] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#718277]" />
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Pesquisar escola, município ou situação..."
                aria-label="Pesquisar escola"
                className="h-10 border-[#d9e5da] bg-white pl-10"
              />
            </div>
            <p className="text-xs text-[#718277]">
              {filtered.length} de {cycles.length} escola{cycles.length === 1 ? "" : "s"}
            </p>
          </div>

          {dashboardQuery.isLoading ? (
            <div className="flex min-h-40 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-[#2d6a51]" />
            </div>
          ) : (
            <ScrollableList>
              <table className="w-full min-w-[680px] text-sm">
                <thead className="border-b border-[#e4ece5] bg-[#f7faf6] text-[10px] font-bold uppercase tracking-[.1em] text-[#6c7e72]">
                  <tr>
                    <th className="px-5 py-3 text-left">Escola</th>
                    <th className="px-4 py-3 text-left">Situação</th>
                    <th className="px-4 py-3 text-right">Submissão</th>
                    <th className="px-5 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(entry => (
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
                  {!filtered.length && (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-sm text-[#718277]">
                        {cycles.length ? "Nenhuma escola encontrada para esta pesquisa." : "Não há escolas com ciclo neste ano."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </ScrollableList>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
