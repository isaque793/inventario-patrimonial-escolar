import { normalizeCode, normalizeText, type SreSchool } from "./siadSpreadsheet";

export type DbSchool = { id: number; name: string; schoolCode: string | null; siadCode: string | null; city: string | null };

/**
 * - "exact": mesmo código da escola e mesmo nome (preenchimento automático)
 * - "code":  mesmo código, nome diferente (confirmar)
 * - "name":  mesmo nome e município, código diferente (confirmar)
 */
export type MatchKind = "exact" | "code" | "name";
export type SchoolMatch = { school: DbSchool; sre: SreSchool; by: MatchKind };

/**
 * Casa as escolas do sistema com a lista da SRE. Cada escola e cada linha
 * da lista são usadas no máximo uma vez. Ordem: código + nome, depois só
 * nome + município (candidato único), depois só código (candidato único).
 */
export function matchSchools(dbSchools: DbSchool[], sreSchools: SreSchool[]) {
  const name = (value: string) => normalizeText(value);
  const nameCity = (value: string, city: string | null) => `${name(value)}|${normalizeText(city)}`;
  const usedSre = new Set<SreSchool>();
  const usedDb = new Set<DbSchool>();
  const matches: SchoolMatch[] = [];
  const take = (school: DbSchool, sre: SreSchool, by: MatchKind) => {
    matches.push({ school, sre, by });
    usedSre.add(sre);
    usedDb.add(school);
  };
  const free = <T,>(items: T[], used: Set<T>) => items.filter(item => !used.has(item));

  // 1. Código da escola + nome iguais.
  for (const school of dbSchools) {
    const code = normalizeCode(school.schoolCode);
    if (!code) continue;
    const candidates = free(sreSchools, usedSre).filter(sre => sre.schoolCode === code && name(sre.name) === name(school.name));
    if (candidates.length === 1) take(school, candidates[0], "exact");
  }

  // 2. Nome + município iguais (um único candidato de cada lado).
  for (const school of free(dbSchools, usedDb)) {
    const key = nameCity(school.name, school.city);
    const candidates = free(sreSchools, usedSre).filter(sre => nameCity(sre.name, sre.city) === key);
    const sameNameInDb = free(dbSchools, usedDb).filter(other => nameCity(other.name, other.city) === key);
    if (candidates.length === 1 && sameNameInDb.length === 1) take(school, candidates[0], "name");
  }

  // 3. Só o código da escola (um único candidato de cada lado).
  for (const school of free(dbSchools, usedDb)) {
    const code = normalizeCode(school.schoolCode);
    if (!code) continue;
    const candidates = free(sreSchools, usedSre).filter(sre => sre.schoolCode === code);
    const sameCodeInDb = free(dbSchools, usedDb).filter(other => normalizeCode(other.schoolCode) === code);
    if (candidates.length === 1 && sameCodeInDb.length === 1) take(school, candidates[0], "code");
  }

  return {
    matches,
    unmatched: free(dbSchools, usedDb),
    sreWithoutSchool: free(sreSchools, usedSre),
  };
}
