/**
 * ArchiveStatusPanel
 *
 * Painel de monitoramento do arquivamento histórico de inventários validados.
 * Exibe contagens por estado (ACTIVE / PENDING / ARCHIVED / ERROR), lista
 * ciclos com falha e permite acionar o reprocessamento individualmente.
 *
 * Integrado na página ManagementExcel abaixo das métricas de gestão.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import type { CycleType } from "@shared/inventoryCycle";
import {
  Archive,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileArchive,
  Loader2,
  RefreshCw,
} from "lucide-react";
import React from "react";
import { toast } from "sonner";

// ── tipos locais ──────────────────────────────────────────────────────────────

type ArchiveStats = {
  counts: { ACTIVE: number; PENDING: number; ARCHIVED: number; ERROR: number };
  withErrors: Array<{ cycleId: number; schoolName: string; archiveError: string | null }>;
  archived: Array<{
    cycleId: number;
    schoolName: string;
    archivedAt: Date | null;
    archiveLocation: string | null;
    archiveVersion: number | null;
  }>;
};

// ── helpers ───────────────────────────────────────────────────────────────────

const archiveStatusConfig = {
  ARCHIVED: {
    label: "Arquivados",
    icon: CheckCircle2,
    bg: "bg-[#e8f1e8]",
    text: "text-[#286149]",
  },
  ACTIVE: {
    label: "Aguardando",
    icon: Clock,
    bg: "bg-[#f5f5f0]",
    text: "text-[#6b7260]",
  },
  PENDING: {
    label: "Em andamento",
    icon: Loader2,
    bg: "bg-blue-50",
    text: "text-blue-700",
  },
  ERROR: {
    label: "Com falha",
    icon: AlertCircle,
    bg: "bg-rose-50",
    text: "text-rose-700",
  },
} as const;

// ── componente ────────────────────────────────────────────────────────────────

export function ArchiveStatusPanel({ year, type = "pre_inventory" }: { year: number; type?: CycleType }) {
  const statsQuery = trpc.management.archiveStats.useQuery({ year, type });
  const stats = statsQuery.data as ArchiveStats | undefined;

  const retryMutation = trpc.management.retryArchive.useMutation({
    onSuccess: async (data) => {
      toast.success(`Arquivamento concluído. Pacote em: ${data.location}`);
      await statsQuery.refetch();
    },
    onError: (error) =>
      toast.error(error.message || "Não foi possível reprocessar o arquivamento."),
  });

  if (statsQuery.isLoading) {
    return (
      <Card className="border-[#dce7dc]">
        <CardContent className="flex min-h-32 items-center justify-center p-5">
          <Loader2 className="size-5 animate-spin text-[#2d6a51]" />
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  const { counts, withErrors, archived } = stats;
  const total = counts.ACTIVE + counts.PENDING + counts.ARCHIVED + counts.ERROR;

  return (
    <Card className="border-[#dce7dc]">
      <CardContent className="p-0">
        {/* cabeçalho */}
        <div className="flex items-start justify-between gap-3 p-5">
          <div className="flex gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#e8f1e8] text-[#276249]">
              <FileArchive className="size-4" />
            </div>
            <div>
              <h2 className="font-semibold text-[#203f33]">Arquivamento histórico</h2>
              <p className="mt-0.5 text-xs leading-5 text-[#6b7d72]">
                Estado do empacotamento de ciclos validados em {year}.{" "}
                {total === 0 && "Nenhum ciclo validado encontrado neste ano."}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-[#3b6956] hover:bg-[#edf5ed]"
            onClick={() => void statsQuery.refetch()}
            disabled={statsQuery.isFetching}
            aria-label="Atualizar estado do arquivamento"
          >
            <RefreshCw className={`size-3.5 ${statsQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* contadores */}
        {total > 0 && (
          <div className="grid grid-cols-2 gap-px border-t border-[#e4ece5] bg-[#e4ece5] sm:grid-cols-4">
            {(["ARCHIVED", "ACTIVE", "PENDING", "ERROR"] as const).map((key) => {
              const cfg = archiveStatusConfig[key];
              const Icon = cfg.icon;
              return (
                <div key={key} className="flex flex-col gap-1 bg-[#f7faf6] px-5 py-4">
                  <div className={`flex size-7 items-center justify-center rounded-lg ${cfg.bg} ${cfg.text}`}>
                    <Icon className="size-3.5" />
                  </div>
                  <p className="mt-1 text-xl font-semibold text-[#1e4134]">{counts[key]}</p>
                  <p className="text-[10px] font-bold uppercase tracking-[.1em] text-[#708175]">
                    {cfg.label}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* ciclos com falha */}
        {withErrors.length > 0 && (
          <div className="border-t border-[#e4ece5]">
            <p className="px-5 pt-4 text-[11px] font-bold uppercase tracking-[.1em] text-rose-600">
              Ciclos com falha — reprocessamento disponível
            </p>
            <div className="divide-y divide-[#edf2ed]">
              {withErrors.map((entry) => (
                <div
                  key={entry.cycleId}
                  className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-[#283f36]">{entry.schoolName}</p>
                    {entry.archiveError && (
                      <p className="mt-1 break-all text-xs text-rose-600" title={entry.archiveError}>
                        {entry.archiveError.length > 120
                          ? entry.archiveError.slice(0, 120) + "…"
                          : entry.archiveError}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-rose-200 text-rose-700 hover:bg-rose-50"
                    disabled={retryMutation.isPending && retryMutation.variables?.cycleId === entry.cycleId}
                    onClick={() => retryMutation.mutate({ cycleId: entry.cycleId })}
                    aria-label={`Reprocessar arquivamento da escola ${entry.schoolName}`}
                  >
                    {retryMutation.isPending &&
                    retryMutation.variables?.cycleId === entry.cycleId ? (
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1.5 size-3.5" />
                    )}
                    Reprocessar
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ciclos arquivados com sucesso */}
        {archived.length > 0 && (
          <div className="border-t border-[#e4ece5]">
            <p className="px-5 pt-4 text-[11px] font-bold uppercase tracking-[.1em] text-[#6b7d72]">
              Pacotes concluídos
            </p>
            <div className="divide-y divide-[#edf2ed]">
              {archived.map((entry) => (
                <div
                  key={entry.cycleId}
                  className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-[#283f36]">{entry.schoolName}</p>
                    {entry.archiveLocation && (
                      <p className="mt-0.5 break-all text-xs text-[#6b7d72]" title={entry.archiveLocation}>
                        <Archive className="mr-1 inline size-3 align-text-bottom" />
                        {entry.archiveLocation}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {entry.archiveVersion !== null && (
                      <Badge variant="outline" className="border-[#d5e3d7] text-[10px] text-[#557060]">
                        v{entry.archiveVersion}
                      </Badge>
                    )}
                    {entry.archivedAt && (
                      <span className="text-xs text-[#6b7d72]">
                        {new Date(entry.archivedAt).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                    <Badge className="border-0 bg-[#e8f1e8] text-[10px] text-[#286149]">
                      Arquivado
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
