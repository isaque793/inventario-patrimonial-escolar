import { createHash } from "crypto";
import type { Request } from "express";

/**
 * Contador simples em memória por chave (janela fixa). Zera quando o servidor
 * reinicia — suficiente para conter abuso sem bloquear uso normal.
 */
export function createRateLimiter({ windowMs, limit }: { windowMs: number; limit: number }) {
  const entries = new Map<string, { count: number; resetAt: number }>();

  // Limpeza periódica para o Map não crescer indefinidamente.
  const cleanup = setInterval(() => {
    const now = Date.now();
    entries.forEach((entry, key) => {
      if (entry.resetAt <= now) entries.delete(key);
    });
  }, windowMs);
  cleanup.unref?.();

  return {
    limit,
    /** Registra uma ocorrência; `allowed` é false quando a chave passou do limite. */
    hit(key: string, now = Date.now()) {
      const current = entries.get(key);
      if (!current || current.resetAt <= now) {
        entries.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      current.count += 1;
      return { allowed: current.count <= limit, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
    },
    /** Consulta sem registrar. */
    isBlocked(key: string, now = Date.now()) {
      const current = entries.get(key);
      return Boolean(current && current.resetAt > now && current.count >= limit);
    },
    reset(key: string) {
      entries.delete(key);
    },
  };
}

export function getClientIp(req: Pick<Request, "ip" | "socket">): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/**
 * Chave para limitar o uso da API: por sessão (usuário logado) quando houver
 * cookie, senão por IP. Assim, várias pessoas na mesma rede (mesmo IP público,
 * ex.: rede da SEE) não dividem o mesmo limite.
 */
export function apiRateLimitKey(req: Pick<Request, "ip" | "socket" | "headers">, cookieName: string): string {
  const cookieHeader = req.headers?.cookie ?? "";
  const match = cookieHeader.split(";").map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`));
  const session = match?.slice(cookieName.length + 1);
  if (session) return `session:${createHash("sha256").update(session).digest("hex").slice(0, 32)}`;
  return `ip:${getClientIp(req)}`;
}

/** Tentativas de login erradas: limitadas por IP + e-mail (não pela rede inteira). */
export const failedLoginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, limit: 10 });

export function failedLoginKey(req: Pick<Request, "ip" | "socket">, email: string) {
  return `${getClientIp(req)}:${email.trim().toLowerCase()}`;
}

export const TOO_MANY_LOGIN_ATTEMPTS_MESSAGE =
  "Muitas tentativas de login com senha incorreta. Aguarde 15 minutos ou use \"Esqueci minha senha\".";
