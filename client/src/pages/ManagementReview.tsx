import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CheckCircle2, CircleAlert, ClipboardCheck, FileCheck2, FileText, Landmark, Loader2, Send, ShieldCheck, UsersRound, Archive, RefreshCw } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";
import { ScrollableList } from "@/components/ScrollableList";

const documentLabels: Record<string, string> = { opening_minutes: "Ata de Abertura", responsibility_term: "Termo de Responsabilidade", closing_minutes: "Ata de Encerramento" };
const statusLabels: Record<string, string> = { draft: "Em preparação", submitted: "Submetido", under_review: "Em análise", returned: "Devolvido", validated: "Validado" };
const issueLabels: Record<string, string> = { not_found: "Bem não localizado", outside_register: "Bem fora da carga", new_equipment: "Equipamento novo", transfer: "Transferência", donation: "Doação", guard_term: "Termo de guarda", other: "Outra situação" };
const money = (value: number | string | null | undefined) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

const archiveStatusConfig: Record<string, { label: string; classes: string }> = {
  ACTIVE:   { label: "Aguardando arquivamento", classes: "bg-[#f5f5f0] text-[#6b7260]" },
  PENDING:  { label: "Arquivamento em andamento", classes: "bg-blue-100 text-blue-800" },
  ARCHIVED: { label: "Arquivado", classes: "bg-[#e8f1e8] text-[#286149]" },
  ERROR:    { label: "Falha no arquivamento", classes: "bg-rose-100 text-rose-700" },
};

function SectionTitle({ icon: Icon, title, description }: { icon: typeof FileText; title: string; description: string }) {
  return <div className="flex gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#e8f1e8] text-[#276249]"><Icon className="size-4" /></div><div><h2 className="font-semibold text-[#203f33]">{title}</h2><p className="mt-0.5 text-xs leading-5 text-[#6b7d72]">{description}</p></div></div>;
}

export default function ManagementReview() {
  const [, params] = useRoute("/gestao/analise/:cycleId");
  const [, setLocation] = useLocation();
  const cycleId = Number(params?.cycleId);
  const reviewQuery = trpc.management.reviewInventory.useQuery({ cycleId: Number.isInteger(cycleId) && cycleId > 0 ? cycleId : 0 }, { enabled: Number.isInteger(cycleId) && cycleId > 0, retry: false });
  const review = reviewQuery.data;
  const [nextStatus, setNextStatus] = useState<"under_review" | "returned" | "validated">("under_review");
  const [note, setNote] = useState("");
  const utils = trpc.useUtils();
  const changeStatus = trpc.management.changeStatus.useMutation({
    onSuccess: async () => {
      toast.success("Validação atualizada.");
      await Promise.all([reviewQuery.refetch(), utils.management.dashboard.invalidate()]);
    },
    onError: error => toast.error(error.message || "Não foi possível atualizar a validação."),
  });
  // ── retry archive (apenas para ciclos validados com falha) ──────────────────
  const retryArchive = trpc.management.retryArchive.useMutation({
    onSuccess: () => {
      toast.success("Arquivamento reprocessado com sucesso.");
      void reviewQuery.refetch();
    },
    onError: error => toast.error(error.message || "Não foi possível reprocessar o arquivamento."),
  });
  const transitions = useMemo(() => review?.cycle?.status === "submitted" ? ["under_review", "returned", "validated"] as const : review?.cycle?.status === "under_review" ? ["returned", "validated"] as const : [], [review?.cycle?.status]);
  useEffect(() => {
    if (transitions.length) setNextStatus(transitions[0]);
    setNote(review?.cycle?.reviewNotes || "");
  }, [review?.cycle?.id, review?.cycle?.reviewNotes, transitions]);

  if (reviewQuery.isLoading) return <div className="flex min-h-80 items-center justify-center"><Loader2 className="size-6 animate-spin text-[#2d6a51]" /></div>;
  if (!review || !review.cycle) return <Card className="mx-auto max-w-3xl border-[#dce7dc]"><CardContent className="p-8 text-center"><p className="font-semibold text-[#203f33]">Inventário não encontrado</p><p className="mt-2 text-sm text-[#6b7d72]">O registro pode ter sido removido ou não está disponível para revisão.</p><Button className="mt-5" variant="outline" onClick={() => setLocation("/gestao")}>Voltar à gestão</Button></CardContent></Card>;

  const { school, cycle, documents, items, issues, members, notes } = review;
  const totalValue = items.reduce((sum: number, item: any) => sum + Number(item.totalValue || 0), 0);
  const documentGroups = Object.keys(documentLabels).map(type => ({ type, files: documents.filter((document: any) => document.documentType === type) }));
  const canDecide = transitions.length > 0;
  const submitDecision = () => {
    if (nextStatus === "returned" && !note.trim()) {
      toast.error("Indique a razão da devolução para a escola.");
      return;
    }
    changeStatus.mutate({ cycleId: cycle.id, status: nextStatus, note: note.trim() || null });
  };

  return <div className="mx-auto max-w-7xl space-y-7"><header className="border-b border-[#dbe6dc] pb-7"><Button variant="ghost" size="sm" className="mb-4 -ml-2 text-[#3b6956] hover:bg-[#edf5ed]" onClick={() => setLocation("/gestao")}><ArrowLeft className="mr-2 size-4" />Voltar para gestão</Button><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#597566]">Revisão administrativa</p><h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[#173b30] md:text-4xl">{school.name}</h1><p className="mt-2 text-sm leading-6 text-[#65796e]">{school.city || "Município não informado"} · Inventário {cycle.year}</p></div><div className="flex flex-wrap items-center gap-2"><Badge className="border-0 bg-[#e8f1e8] px-3 py-1.5 text-[#286149]">{statusLabels[cycle.status]}</Badge>{cycle.status === "validated" && cycle.archiveStatus && (() => { const cfg = archiveStatusConfig[cycle.archiveStatus] ?? archiveStatusConfig["ACTIVE"]; return <Badge className={`border-0 px-3 py-1.5 text-xs ${cfg.classes}`}>{cfg.label}</Badge>; })()}{cycle.status === "validated" && cycle.archiveStatus === "ERROR" && (<Button size="sm" variant="outline" className="h-7 border-rose-200 text-rose-700 hover:bg-rose-50" disabled={retryArchive.isPending} onClick={() => retryArchive.mutate({ cycleId: cycle.id })}>{retryArchive.isPending ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : <RefreshCw className="mr-1.5 size-3" />}Reprocessar arquivo</Button>)}{cycle.status === "validated" && cycle.archiveLocation && (<span className="hidden text-xs text-[#6b7d72] lg:block" title={cycle.archiveLocation}><Archive className="mr-1 inline size-3 align-text-bottom" />{cycle.archiveLocation}</span>)}</div></div></header>    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Itens registrados" value={items.length} icon={Landmark} /><Metric label="Valor do inventário" value={money(totalValue)} icon={Landmark} /><Metric label="Documentos recebidos" value={`${new Set(documents.map((document: any) => document.documentType)).size}/3`} icon={FileCheck2} /><Metric label="Pendências abertas" value={issues.filter((issue: any) => issue.resolutionStatus !== "resolved").length} icon={CircleAlert} tone="amber" /></div>
    <div className="grid gap-6 xl:grid-cols-[1.35fr_.9fr]"><div className="space-y-6"><Card className="border-[#dce7dc]"><CardContent className="p-0"><div className="p-5"><SectionTitle icon={Landmark} title="Itens patrimoniais" description="Confira os bens, quantidades, conservação, valores e situação registrados pela escola." /></div><ScrollableList><table className="w-full min-w-[780px] text-sm"><thead className="border-y border-[#e4ece5] bg-[#f7faf6] text-[10px] font-bold uppercase tracking-[.1em] text-[#6c7e72]"><tr><th className="px-5 py-3 text-left">Patrimônio</th><th className="px-4 py-3 text-left">Descrição</th><th className="px-4 py-3 text-left">Conservação</th><th className="px-4 py-3 text-right">Qtd.</th><th className="px-4 py-3 text-right">Valor</th><th className="px-5 py-3 text-left">Situação</th></tr></thead><tbody>{items.length ? items.map((item: any) => <tr key={item.id} data-list-item className="border-b border-[#edf2ed]"><td className="px-5 py-4 font-mono text-xs font-semibold text-[#265c49]">{item.propertyNumber}</td><td className="px-4 py-4"><p className="font-medium text-[#213f34]">{item.description}</p>{item.technicalDetails && <p className="mt-1 text-xs text-[#708177]">{item.technicalDetails}</p>}</td><td className="px-4 py-4 text-[#4e6559]">{item.conservationState}</td><td className="px-4 py-4 text-right">{item.quantity}</td><td className="px-4 py-4 text-right font-semibold">{money(item.totalValue)}</td><td className="px-5 py-4 text-xs text-[#4e6559]">{item.currentSituation}</td></tr>) : <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-[#728177]">Nenhum item patrimonial foi registrado.</td></tr>}</tbody></table></ScrollableList></CardContent></Card>
      <Card className="border-[#dce7dc]"><CardContent className="p-5"><SectionTitle icon={CircleAlert} title="Pendências e divergências" description="Ocorrências e providências informadas pela escola." /><ScrollableList className="mt-5 space-y-3">{issues.length ? issues.map((issue: any) => <div key={issue.id} data-list-item className="rounded-xl border border-[#e3ebe4] bg-[#fcfdfb] p-4"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-[#254337]">{issue.description}</p><Badge variant="outline" className="border-[#d6e1d7] text-[10px] text-[#4e6759]">{issueLabels[issue.issueType] || "Ocorrência"}</Badge><Badge className={`border-0 text-[10px] ${issue.resolutionStatus === "resolved" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{issue.resolutionStatus === "resolved" ? "Resolvida" : issue.resolutionStatus === "in_progress" ? "Em tratamento" : "Aberta"}</Badge></div><p className="mt-2 text-sm text-[#64766b]">{issue.pendingDescription}</p>{issue.measuresTaken && <p className="mt-3 rounded-lg bg-[#f3f8f3] p-3 text-xs leading-5 text-[#52685b]"><b>Medidas adotadas:</b> {issue.measuresTaken}</p>}</div>) : <p className="rounded-xl bg-[#f7faf6] p-4 text-sm text-[#718277]">Não há pendências registradas neste inventário.</p>}</ScrollableList>{(notes?.problemsFound || notes?.quantityDivergences || notes?.valueDivergences) && <div className="mt-5 grid gap-3 md:grid-cols-3"><Note title="Problemas" value={notes.problemsFound} /><Note title="Divergências de quantidade" value={notes.quantityDivergences} /><Note title="Divergências de valores" value={notes.valueDivergences} /></div>}</CardContent></Card></div>
      <div className="space-y-6"><Card className="border-[#dce7dc]"><CardContent className="p-5"><SectionTitle icon={FileCheck2} title="Documentos enviados" description="Abra cada arquivo assinado para conferir a documentação encaminhada pela escola." /><div className="mt-5 space-y-3">{documentGroups.map(({ type, files }) => <div key={type} className="rounded-xl border border-[#e3ebe4] bg-[#fcfdfb] p-3"><p className="text-sm font-semibold text-[#294539]">{documentLabels[type]}</p>{files.length ? <div className="mt-2 space-y-2">{files.map((file: any) => <div key={file.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2"><div className="min-w-0"><p className="truncate text-xs font-medium text-[#3a584a]">{file.fileName}</p><p className="mt-0.5 text-[11px] text-[#75867a]">Enviado em {new Date(file.uploadedAt).toLocaleDateString("pt-BR")}</p></div><a href={file.storageUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg bg-[#e7f1e8] px-2.5 py-1.5 text-xs font-semibold text-[#1f5b44] hover:bg-[#d5e8d7]">Abrir</a></div>)}</div> : <p className="mt-2 text-xs text-[#8b5d52]">Documento não enviado.</p>}</div>)}</div></CardContent></Card>
      <Card className="border-[#dce7dc]"><CardContent className="p-5"><SectionTitle icon={UsersRound} title="Subcomissão" description="Membros responsáveis pela conferência do inventário." /><div className="mt-5 space-y-2">{members.length ? members.map((member: any) => <div key={member.id} className="rounded-xl bg-[#f7faf6] p-3"><p className="text-sm font-semibold text-[#274337]">{member.name}{member.isPresident ? " · Presidente" : ""}</p><p className="mt-1 text-xs text-[#728177]">{member.jobTitle} · MASP {member.masp}</p></div>) : <p className="text-sm text-[#718277]">Subcomissão não registrada.</p>}</div></CardContent></Card>
      <Card className="border-[#cfe0d2] bg-[#fbfdf9]"><CardContent className="p-5"><SectionTitle icon={ShieldCheck} title="Decisão da validação" description={canDecide ? "Conclua a revisão após conferir os documentos e o inventário." : cycle.status === "draft" ? "A escola ainda não submeteu o inventário para validação." : "Não há nova transição disponível para este inventário."} />{canDecide ? <div className="mt-5 space-y-4"><div><Label>Novo estado</Label><Select value={nextStatus} onValueChange={value => setNextStatus(value as "under_review" | "returned" | "validated")}><SelectTrigger className="mt-1.5 bg-white"><SelectValue /></SelectTrigger><SelectContent>{transitions.map(status => <SelectItem key={status} value={status}>{statusLabels[status]}</SelectItem>)}</SelectContent></Select></div><div><Label>Observação para a escola</Label><Textarea className="mt-1.5 min-h-24 bg-white" value={note} onChange={event => setNote(event.target.value)} placeholder="Registre orientações, correções solicitadas ou a conclusão da análise." /></div><Button className="w-full bg-[#0c4a3e] hover:bg-[#083a31]" disabled={changeStatus.isPending} onClick={submitDecision}>{changeStatus.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}Confirmar decisão</Button></div> : <p className="mt-5 rounded-xl bg-white p-3 text-sm text-[#62766a]">{cycle.reviewNotes || "Acompanhe os documentos desta escola. A validação ficará disponível após a submissão."}</p>}</CardContent></Card></div></div></div>;
}

function Metric({ icon: Icon, label, value, tone = "green" }: { icon: typeof Landmark; label: string; value: string | number; tone?: "green" | "amber" }) {
  return <Card className="border-[#dce7dc]"><CardContent className="p-4"><div className={`flex size-9 items-center justify-center rounded-xl ${tone === "amber" ? "bg-amber-100 text-amber-700" : "bg-[#e8f1e8] text-[#286149]"}`}><Icon className="size-4" /></div><p className="mt-4 text-[10px] font-bold uppercase tracking-[.11em] text-[#708175]">{label}</p><p className="mt-1 text-xl font-semibold text-[#1e4134]">{value}</p></CardContent></Card>;
}

function Note({ title, value }: { title: string; value: string | null | undefined }) { return <div className="rounded-xl bg-[#f7faf6] p-3"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-[#6a8072]">{title}</p><p className="mt-2 text-sm leading-5 text-[#52665b]">{value || "Não informado."}</p></div>; }
