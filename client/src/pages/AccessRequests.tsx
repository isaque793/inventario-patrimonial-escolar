import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Clock3, Search, UserRoundCheck, XCircle } from "lucide-react";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { ScrollableList } from "@/components/ScrollableList";

export default function AccessRequests() {
  const utils = trpc.useUtils();
  const requestsQuery = trpc.school.allPendingAccessRequests.useQuery();
  const [search, setSearch] = useState("");
  const [candidate, setCandidate] = useState<any>(null);

  const review = trpc.school.reviewAccessRequest.useMutation({
    onSuccess: async result => {
      toast.success(result.status === "approved" ? "Acesso aprovado. O utilizador já pode entrar na escola." : "Solicitação recusada.");
      setCandidate(null);
      await Promise.all([
        utils.school.allPendingAccessRequests.invalidate(),
        utils.school.pendingAccessCounts.invalidate(),
        utils.school.list.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message || "Não foi possível atualizar a solicitação."),
  });

  const requests = requestsQuery.data ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (!term) return requests;
    return requests.filter((entry: any) =>
      [entry.user?.name, entry.user?.email, entry.school?.name, entry.school?.schoolCode, entry.school?.city]
        .filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(term),
    );
  }, [requests, search]);

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <div className="border-b border-[#dbe6dc] pb-7">
        <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#597566]">Gestão de acessos</p>
        <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-[#173b30] md:text-4xl">Solicitações de acesso</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#65796e]">
              Consulte em um único lugar os pedidos feitos pelos utilizadores para entrar nas escolas e libere ou recuse o acesso sem precisar abrir cada escola individualmente.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
            <Clock3 className="size-4 text-amber-700" />
            <span className="text-sm font-semibold text-amber-900">{requests.length} pendente{requests.length === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div>

      <Card className="border-[#dce7dc]">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-[#e4ece5] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#718277]" />
              <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Pesquisar por utilizador ou escola..." className="h-10 border-[#d9e5da] bg-[#fbfdf9] pl-10" />
            </div>
            <p className="text-xs text-[#718277]">{filtered.length} de {requests.length} solicitação{requests.length === 1 ? "" : "ões"}</p>
          </div>

          {requestsQuery.isLoading ? (
            <div className="p-10 text-center text-sm text-[#718277]">Carregando solicitações...</div>
          ) : filtered.length ? (
            <ScrollableList className="divide-y divide-[#edf2ed]">
              {filtered.map((entry: any) => (
                <div key={entry.request.id} data-list-item className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e8f1e8] text-[#276249]"><UserRoundCheck className="size-5" /></div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-[#254437]">{entry.user?.name || "Utilizador sem nome"}</p>
                        <Badge className="border-0 bg-amber-100 text-amber-800">Pendente</Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-[#687a6e]">{entry.user?.email || "E-mail não informado"}</p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#52695d]">
                        <span><strong>Escola:</strong> {entry.school?.name}</span>
                        <span>{entry.school?.city || "Município não informado"}</span>
                        {entry.school?.schoolCode ? <span>INEP {entry.school.schoolCode}</span> : null}
                      </div>
                      <p className="mt-1 text-[11px] text-[#8a998f]">Solicitado em {new Date(entry.request.createdAt).toLocaleString("pt-BR")}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2 lg:justify-end">
                    <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => setCandidate({ ...entry, decision: "rejected" })} className="border-rose-200 text-rose-700 hover:bg-rose-50">
                      <XCircle className="mr-1.5 size-4" />Recusar
                    </Button>
                    <Button size="sm" disabled={review.isPending} onClick={() => setCandidate({ ...entry, decision: "approved" })} className="bg-[#0c4a3e] hover:bg-[#083a31]">
                      <CheckCircle2 className="mr-1.5 size-4" />Aprovar acesso
                    </Button>
                  </div>
                </div>
              ))}
            </ScrollableList>
          ) : (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[#e8f1e8] text-[#276249]"><CheckCircle2 className="size-6" /></div>
              <h2 className="mt-4 text-base font-semibold text-[#244438]">{search ? "Nenhuma solicitação encontrada" : "Tudo em dia"}</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#718277]">
                {search ? "Tente pesquisar por outro nome, e-mail ou escola." : "Não há solicitações de acesso aguardando análise neste momento."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(candidate)} onOpenChange={open => !open && setCandidate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{candidate?.decision === "approved" ? "Aprovar acesso à escola?" : "Recusar solicitação?"}</DialogTitle>
            <DialogDescription>
              {candidate?.decision === "approved"
                ? (candidate?.user?.name || "Este utilizador") + " terá acesso à escola " + (candidate?.school?.name || "") + "."
                : "A solicitação de " + (candidate?.user?.name || "este utilizador") + " para " + (candidate?.school?.name || "") + " será recusada."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCandidate(null)}>Cancelar</Button>
            <Button disabled={review.isPending} onClick={() => candidate && review.mutate({ requestId: candidate.request.id, decision: candidate.decision })} className={candidate?.decision === "approved" ? "bg-[#0c4a3e] hover:bg-[#083a31]" : "bg-rose-700 hover:bg-rose-800"}>
              {candidate?.decision === "approved" ? "Confirmar aprovação" : "Confirmar recusa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
