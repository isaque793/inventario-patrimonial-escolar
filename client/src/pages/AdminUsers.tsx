import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { ShieldCheck, Trash2, UserCog, UsersRound } from "lucide-react";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";

type Role = "admin" | "manager" | "user";

const roleLabels: Record<Role, string> = { admin: "Administrador", manager: "Gestor", user: "Escola" };
const roleBadgeClasses: Record<Role, string> = {
  admin: "border-0 bg-[#e8f1e8] text-[#246147]",
  manager: "border-0 bg-[#fff1c6] text-[#8a5a0c]",
  user: "border-0 bg-stone-100 text-stone-700",
};

export default function AdminUsers() {
  const usersQuery = trpc.management.listUsers.useQuery();
  const [candidate, setCandidate] = useState<{ user: any; role: Role } | null>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const utils = trpc.useUtils();
  const changeRole = trpc.management.setUserRole.useMutation({
    onSuccess: async (_, variables) => {
      toast.success(variables.role === "admin" ? "Acesso integral concedido." : variables.role === "manager" ? "Perfil de gestor atribuído." : "Perfil administrativo removido.");
      setCandidate(null);
      await utils.management.listUsers.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const deleteUser = trpc.management.deleteUser.useMutation({
    onSuccess: async () => {
      toast.success("Conta excluída.");
      setDeleting(null);
      await utils.management.listUsers.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const accessQuery = trpc.management.schoolAccessStatus.useQuery();
  const [confirmingSuspension, setConfirmingSuspension] = useState(false);
  const setSuspension = trpc.management.setSchoolAccessSuspended.useMutation({
    onSuccess: async result => {
      toast.success(result.suspended ? "Acesso das escolas suspenso." : "Acesso das escolas reativado.");
      setConfirmingSuspension(false);
      await utils.management.schoolAccessStatus.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const schoolsSuspended = accessQuery.data?.suspended ?? false;
  const users = usersQuery.data ?? [];
  const administrators = useMemo(() => users.filter((user: any) => user.role === "admin"), [users]);
  const managers = useMemo(() => users.filter((user: any) => user.role === "manager"), [users]);
  const nextRole = candidate?.role;
  const candidateName = candidate?.user?.name || "este utilizador";

  const dialogTitle = nextRole === "admin" ? "Conceder acesso administrativo" : nextRole === "manager" ? "Atribuir perfil de gestor" : "Revogar acesso administrativo";
  const dialogText =
    nextRole === "admin"
      ? `Confirma que ${candidateName} poderá aceder a todas as escolas e gerir validações e acessos?`
      : nextRole === "manager"
        ? `Confirma que ${candidateName} será gestor? O gestor acessa apenas Gestão e consolidação, Validação e Solicitações de acesso.`
        : `Confirma a remoção do perfil administrativo de ${candidateName}? O acesso às escolas atribuídas, se existir, será preservado.`;
  const confirmLabel = nextRole === "admin" ? "Conceder acesso total" : nextRole === "manager" ? "Tornar gestor" : "Revogar acesso";

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <div className="border-b border-[#dbe6dc] pb-7">
        <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#597566]">Segurança e acesso</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[#173b30] md:text-4xl">Administradores da plataforma</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#65796e]">
          Conceda acesso total a administradores de confiança ou o perfil de gestor, limitado a Gestão e consolidação, Validação e Solicitações de acesso. Também é possível excluir contas.
        </p>
      </div>
      <Card className="border-[#dce7dc]">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-[#203f33]">Acesso das escolas</h2>
              <Badge className={schoolsSuspended ? "border-0 bg-[#fde2e0] text-[#9b2c24]" : "border-0 bg-[#e8f1e8] text-[#246147]"}>{schoolsSuspended ? "Suspenso" : "Ativo"}</Badge>
            </div>
            <p className="mt-1 max-w-xl text-xs leading-5 text-[#6b7d72]">
              Enquanto estiver suspenso, contas de escola não conseguem entrar nem usar o sistema. Administradores e gestores não são afetados. Ao reiniciar o servidor, o estado volta ao valor de SCHOOL_ACCESS_SUSPENDED.
            </p>
          </div>
          <Button variant={schoolsSuspended ? "default" : "destructive"} disabled={accessQuery.isLoading || setSuspension.isPending} onClick={() => (schoolsSuspended ? setSuspension.mutate({ suspended: false }) : setConfirmingSuspension(true))}>
            {schoolsSuspended ? "Reativar escolas" : "Suspender escolas"}
          </Button>
        </CardContent>
      </Card>
      <Dialog open={confirmingSuspension} onOpenChange={setConfirmingSuspension}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspender o acesso das escolas</DialogTitle>
            <DialogDescription>Confirma? As escolas serão desconectadas e não poderão entrar até a reativação. Administradores e gestores continuam normalmente.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingSuspension(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={setSuspension.isPending} onClick={() => setSuspension.mutate({ suspended: true })}>Suspender escolas</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-[#dce7dc]"><CardContent className="p-5"><div className="flex size-10 items-center justify-center rounded-xl bg-[#e8f1e8] text-[#286149]"><ShieldCheck className="size-5" /></div><p className="mt-4 text-[10px] font-bold uppercase tracking-[.12em] text-[#6c8173]">Administradores ativos</p><p className="mt-1 text-3xl font-semibold text-[#1d4033]">{administrators.length}</p></CardContent></Card>
        <Card className="border-[#dce7dc]"><CardContent className="p-5"><div className="flex size-10 items-center justify-center rounded-xl bg-[#fff1c6] text-[#9a6510]"><UserCog className="size-5" /></div><p className="mt-4 text-[10px] font-bold uppercase tracking-[.12em] text-[#6c8173]">Gestores</p><p className="mt-1 text-3xl font-semibold text-[#1d4033]">{managers.length}</p></CardContent></Card>
        <Card className="border-[#dce7dc]"><CardContent className="p-5"><div className="flex size-10 items-center justify-center rounded-xl bg-stone-100 text-stone-600"><UsersRound className="size-5" /></div><p className="mt-4 text-[10px] font-bold uppercase tracking-[.12em] text-[#6c8173]">Utilizadores registados</p><p className="mt-1 text-3xl font-semibold text-[#1d4033]">{users.length}</p></CardContent></Card>
      </div>
      <Card className="border-[#dce7dc]">
        <CardContent className="p-0">
          <div className="flex gap-3 border-b border-[#e4ece5] p-5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#e8f1e8] text-[#276249]"><UserCog className="size-4" /></div>
            <div>
              <h2 className="font-semibold text-[#203f33]">Gestão de acessos</h2>
              <p className="mt-0.5 text-xs leading-5 text-[#6b7d72]">A revogação e a exclusão são bloqueadas apenas se restar um único administrador.</p>
            </div>
          </div>
          {usersQuery.isLoading ? (
            <div className="p-8 text-sm text-[#6e8075]">A carregar utilizadores...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-[#e4ece5] bg-[#f7faf6] text-[10px] font-bold uppercase tracking-[.1em] text-[#6c7e72]">
                  <tr>
                    <th className="px-5 py-3 text-left">Utilizador</th>
                    <th className="px-4 py-3 text-left">E-mail</th>
                    <th className="px-4 py-3 text-left">Perfil</th>
                    <th className="px-5 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user: any) => {
                    const role = user.role as Role;
                    const isLastAdministrator = role === "admin" && administrators.length === 1;
                    return (
                      <tr key={user.id} className="border-b border-[#edf2ed] last:border-0">
                        <td className="px-5 py-4 font-semibold text-[#254437]">{user.name || `Utilizador ${user.id}`}</td>
                        <td className="px-4 py-4 text-xs text-[#687a6e]">{user.email || "—"}</td>
                        <td className="px-4 py-4"><Badge className={roleBadgeClasses[role]}>{roleLabels[role]}</Badge></td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap justify-end gap-2">
                            {role !== "admin" && (
                              <Button size="sm" variant="outline" onClick={() => setCandidate({ user, role: role === "manager" ? "user" : "manager" })}>
                                {role === "manager" ? "Remover gestor" : "Tornar gestor"}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant={role === "admin" ? "outline" : "default"}
                              disabled={isLastAdministrator}
                              className={role === "admin" ? "" : "bg-[#0c4a3e] hover:bg-[#083a31]"}
                              onClick={() => setCandidate({ user, role: role === "admin" ? "user" : "admin" })}
                            >
                              {isLastAdministrator ? "Último administrador" : role === "admin" ? "Revogar acesso" : "Tornar administrador"}
                            </Button>
                            <Button size="sm" variant="outline" aria-label={`Excluir conta de ${user.name || user.email}`} disabled={isLastAdministrator} className="text-rose-700 hover:text-rose-800" onClick={() => setDeleting(user)}>
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!users.length && <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-[#718277]">Ainda não há utilizadores com sessão iniciada na plataforma.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(candidate)} onOpenChange={open => !open && setCandidate(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialogTitle}</DialogTitle><DialogDescription>{dialogText}</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCandidate(null)}>Cancelar</Button>
            <Button disabled={changeRole.isPending} onClick={() => candidate && changeRole.mutate({ userId: candidate.user.id, role: candidate.role })} className={nextRole === "user" ? "bg-rose-700 hover:bg-rose-800" : "bg-[#0c4a3e] hover:bg-[#083a31]"}>{confirmLabel}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={open => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir conta</DialogTitle>
            <DialogDescription>
              Confirma a exclusão da conta de {deleting?.name || deleting?.email || "este utilizador"}? Os vínculos com escolas e as solicitações de acesso serão removidos. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button disabled={deleteUser.isPending} onClick={() => deleting && deleteUser.mutate({ userId: deleting.id })} className="bg-rose-700 hover:bg-rose-800">Excluir conta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
