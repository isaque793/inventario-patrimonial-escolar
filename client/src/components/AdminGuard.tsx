import { useAuth } from "@/_core/hooks/useAuth";
import { ShieldAlert } from "lucide-react";
import React from "react";

export function AdminGuard({ children, allowManager = false }: { children: React.ReactNode; allowManager?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-[280px]" aria-busy="true" />;
  if (user?.role === "admin" || (allowManager && user?.role === "manager")) return <>{children}</>;
  return <div className="mx-auto flex min-h-[360px] max-w-xl flex-col items-center justify-center px-6 text-center"><div className="flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800"><ShieldAlert className="size-6" /></div><h1 className="mt-5 font-serif text-2xl font-semibold text-[#193d31]">Acesso reservado à equipa gestora</h1><p className="mt-2 text-sm leading-6 text-[#64766b]">Esta área é exclusiva para utilizadores com perfil de administrador. Peça a promoção a um administrador já autorizado, se necessário.</p></div>;
}
