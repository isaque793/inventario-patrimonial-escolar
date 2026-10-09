import { describe, expect, it } from "vitest";
import { getNavigationItemsForRole } from "./roleNavigation";

describe("navegação por perfil", () => {
  it("exibe todas as abas administrativas para qualquer administrador", () => {
    expect(getNavigationItemsForRole("admin").map(item => item.label)).toEqual(["Gestão e consolidação", "Validação", "Escolas", "Administradores", "Solicitações de acesso"]);
  });

  it("mantém o menu restrito para utilizadores de escola", () => {
    expect(getNavigationItemsForRole("user").map(item => item.label)).toEqual(["Meu inventário"]);
  });
});
