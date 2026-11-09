export type AppRole = "admin" | "manager" | "user" | undefined;
export type NavigationItem = { label: string; path: "/" | "/inventario" | "/gestao" | "/validacao" | "/administradores" | "/solicitacoes-acesso"; icon: "schools" | "management" | "validation" | "administrators" | "requests" | "inventory" };

export function getNavigationItemsForRole(role: AppRole): NavigationItem[] {
  if (role === "admin") {
    return [
      { icon: "management", label: "Gestão e consolidação", path: "/gestao" },
      { icon: "validation", label: "Validação", path: "/validacao" },
      { icon: "schools", label: "Escolas", path: "/" },
      { icon: "inventory", label: "Inventário oficial", path: "/inventario" },
      { icon: "administrators", label: "Administradores", path: "/administradores" },
      { icon: "requests", label: "Solicitações de acesso", path: "/solicitacoes-acesso" },
    ];
  }
  if (role === "manager") {
    return [
      { icon: "management", label: "Gestão e consolidação", path: "/gestao" },
      { icon: "validation", label: "Validação", path: "/validacao" },
      { icon: "requests", label: "Solicitações de acesso", path: "/solicitacoes-acesso" },
    ];
  }
  return [
    { icon: "inventory", label: "Pré-inventário", path: "/" },
    { icon: "inventory", label: "Inventário", path: "/inventario" },
  ];
}
