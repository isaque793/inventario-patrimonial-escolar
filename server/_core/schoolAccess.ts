export const SCHOOL_ACCESS_SUSPENDED_MESSAGE = "O acesso das escolas está temporariamente suspenso. Tente novamente mais tarde.";

// Estado em memória: volta ao valor de SCHOOL_ACCESS_SUSPENDED quando o servidor reinicia.
let suspended = process.env.SCHOOL_ACCESS_SUSPENDED === "true";

export function isSchoolAccessSuspended() {
  return suspended;
}

export function setSchoolAccessSuspended(value: boolean) {
  suspended = value;
}

/** Só o perfil de escola ("user") é afetado; administradores e gestores seguem normalmente. */
export function isBlockedBySuspension(user: { role: string } | null | undefined) {
  return suspended && user?.role === "user";
}
