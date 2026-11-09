import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { IMPORT_STATUS_COLORS, IMPORT_STATUS_LABELS, type ImportStatus } from "@shared/inventoryCycle";
import { CheckCircle2, Clock3, Loader2, PackagePlus } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

/** Cor suave de fundo da linha do bem importado (amarelo = aguardando, verde = conferido). */
export function importRowColor(status: string | null | undefined) {
  return status === "pending_confirmation" || status === "confirmed" ? IMPORT_STATUS_COLORS[status as ImportStatus] : undefined;
}

/** A cor nunca é a única indicação: o selo sempre traz texto e ícone. */
export function ImportStatusBadge({ status }: { status: string | null | undefined }) {
  if (status !== "pending_confirmation" && status !== "confirmed") return null;
  const confirmed = status === "confirmed";
  const Icon = confirmed ? CheckCircle2 : Clock3;
  return (
    <span
      data-testid={`import-status-${status}`}
      className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${confirmed ? "bg-[#cfe8d5] text-[#1f5a35]" : "bg-[#f7e7a4] text-[#7a5a00]"}`}
    >
      <Icon className="size-3" />
      {IMPORT_STATUS_LABELS[status as ImportStatus]}
    </span>
  );
}

export type ImportFilter = "all" | "pending_confirmation" | "confirmed";

export function importCounts(items: Array<{ importStatus?: string | null }> | undefined) {
  const list = items ?? [];
  return {
    imported: list.filter(item => item.importStatus === "pending_confirmation" || item.importStatus === "confirmed").length,
    pending: list.filter(item => item.importStatus === "pending_confirmation").length,
    confirmed: list.filter(item => item.importStatus === "confirmed").length,
  };
}

export function filterByImportStatus<T extends { importStatus?: string | null }>(items: T[], filter: ImportFilter) {
  return filter === "all" ? items : items.filter(item => item.importStatus === filter);
}

export function ImportFilterTabs({ value, onChange, counts, total }: { value: ImportFilter; onChange: (value: ImportFilter) => void; counts: ReturnType<typeof importCounts>; total: number }) {
  const options: Array<[ImportFilter, string]> = [
    ["all", `Todos (${total})`],
    ["pending_confirmation", `Aguardando conferência (${counts.pending})`],
    ["confirmed", `Conferidos (${counts.confirmed})`],
  ];
  return (
    <div role="group" aria-label="Filtrar bens por situação" className="flex flex-wrap gap-2 px-5 pb-3">
      {options.map(([key, label]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)} className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${value === key ? "border-[#1e604a] bg-[#e8f1e8] text-[#1d4f3d]" : "border-[#dbe5dc] bg-white text-[#5f7367] hover:border-[#9ebca7]"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function ImportPanel({ counts, editable, onImport }: { counts: ReturnType<typeof importCounts>; editable: boolean; onImport: () => void }) {
  return (
    <div className="rounded-2xl border border-[#dce7dc] bg-white p-5" data-testid="import-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h3 className="font-semibold text-[#203f33]">Importar bens do pré-inventário</h3>
          <p className="mt-1 text-xs leading-5 text-[#6b7d72]">
            Importar cria cópias no inventário oficial para facilitar a conferência. O pré-inventário não é alterado nem esvaziado.
          </p>
          <p className="mt-2 text-xs font-semibold text-[#4e6559]">
            {counts.imported} importado(s) · {counts.pending} aguardando conferência · {counts.confirmed} conferido(s)
          </p>
        </div>
        {editable && (
          <Button className="bg-[#0c4a3e] hover:bg-[#083a31]" onClick={onImport}>
            <PackagePlus className="mr-2 size-4" />Importar bens do pré-inventário
          </Button>
        )}
      </div>
    </div>
  );
}

const stateLabels: Record<string, string> = {
  new: "Novo",
  already_imported: "Já importado",
  already_in_official: "Já existe no inventário",
  duplicated_in_source: "Repetido no pré-inventário",
};

export function ImportDialog({ open, onOpenChange, schoolId, year, onDone }: { open: boolean; onOpenChange: (value: boolean) => void; schoolId: number; year: number; onDone: () => void }) {
  const preview = trpc.inventory.importPreview.useQuery({ schoolId, year }, { enabled: open, retry: false, refetchOnWindowFocus: false });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<"all" | "selected">("all");
  const importMutation = trpc.inventory.importPreInventory.useMutation({
    onSuccess: result => {
      toast.success(result.message);
      onOpenChange(false);
      onDone();
    },
    onError: error => toast.error(error.message || "Não foi possível importar os bens."),
  });

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setMode("all");
    }
  }, [open]);

  const eligible = useMemo(() => (preview.data?.items ?? []).filter(item => item.state === "new"), [preview.data]);
  const count = mode === "all" ? eligible.length : selected.size;
  const toggle = (id: number) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const confirm = () => importMutation.mutate({ schoolId, year, ...(mode === "selected" ? { sourceItemIds: Array.from(selected) } : {}) });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar bens do pré-inventário</DialogTitle>
          <DialogDescription>
            Os bens serão copiados do pré-inventário de {preview.data?.sourceYear ?? year} para o inventário oficial e ficarão aguardando conferência. O pré-inventário não é alterado.
          </DialogDescription>
        </DialogHeader>
        {preview.isLoading ? (
          <div className="flex min-h-32 items-center justify-center"><Loader2 className="size-5 animate-spin text-[#2d6a51]" /></div>
        ) : preview.isError ? (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{preview.error.message}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">{eligible.length} disponível(is) para importar</Badge>
              <Badge variant="outline">{preview.data?.summary.alreadyImported ?? 0} já importado(s)</Badge>
              {(preview.data?.summary.alreadyInOfficial ?? 0) > 0 && <Badge variant="outline">{preview.data?.summary.alreadyInOfficial} já existente(s) no inventário</Badge>}
              {(preview.data?.summary.duplicatedInSource ?? 0) > 0 && <Badge variant="outline">{preview.data?.summary.duplicatedInSource} repetido(s) no pré-inventário</Badge>}
            </div>
            <div role="radiogroup" aria-label="O que importar" className="flex flex-wrap gap-4 text-sm text-[#3d564b]">
              <label className="flex items-center gap-2"><input type="radio" name="import-mode" checked={mode === "all"} onChange={() => setMode("all")} className="accent-[#0c4a3e]" />Todos os bens elegíveis</label>
              <label className="flex items-center gap-2"><input type="radio" name="import-mode" checked={mode === "selected"} onChange={() => setMode("selected")} className="accent-[#0c4a3e]" />Selecionar bens específicos</label>
            </div>
            {mode === "selected" && (
              <div className="max-h-72 overflow-y-auto rounded-xl border border-[#e1e9e2]">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-[#f7faf6] text-[10px] font-bold uppercase tracking-[.1em] text-[#6c7e72]"><tr><th className="w-10 px-3 py-2" /><th className="px-3 py-2">Património</th><th className="px-3 py-2">Descrição</th><th className="px-3 py-2">Situação</th></tr></thead>
                  <tbody>
                    {(preview.data?.items ?? []).map(item => (
                      <tr key={item.id} className="border-t border-[#edf2ed]">
                        <td className="px-3 py-2"><input type="checkbox" aria-label={`Selecionar ${item.propertyNumber}`} disabled={item.state !== "new"} checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="size-4 accent-[#0c4a3e]" /></td>
                        <td className="px-3 py-2 font-mono text-xs">{item.propertyNumber}</td>
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2 text-xs text-[#5f7367]">{stateLabels[item.state]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-sm font-semibold text-[#264438]" role="status">
              {count === 1 ? "1 bem será copiado" : `${count} bens serão copiados`} para o inventário oficial.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={preview.isLoading || preview.isError || count === 0 || importMutation.isPending} onClick={confirm} className="bg-[#0c4a3e] hover:bg-[#083a31]">
            {importMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Confirmar importação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ImportedItemNotice({ confirmed }: { confirmed: boolean }) {
  return confirmed ? (
    <div role="status" className="sm:col-span-2 rounded-xl border border-emerald-200 bg-[#E4F3E7] px-3 py-2.5 text-xs leading-5 text-emerald-900">
      <b>Este bem já foi conferido</b> no inventário oficial.
    </div>
  ) : (
    <div role="status" className="sm:col-span-2 rounded-xl border border-amber-200 bg-[#FFF4CC] px-3 py-2.5 text-xs leading-5 text-amber-900">
      <b>Bem importado do pré-inventário.</b> Os dados foram preenchidos automaticamente. Revise, corrija se for preciso e confirme para marcar como conferido.
    </div>
  );
}
