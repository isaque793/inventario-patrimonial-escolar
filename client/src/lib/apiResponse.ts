/**
 * Respostas de erro que NÃO vêm no formato do tRPC (limite de requisições,
 * bloqueio de origem, servidor fora do ar/reiniciando no Render) faziam a tela
 * mostrar "Unable to transform response from server". Esta função devolve uma
 * mensagem legível para esses casos, ou null quando a resposta deve seguir
 * normalmente para o tRPC (inclusive erros do próprio tRPC).
 */
export async function readableApiError(response: Response): Promise<string | null> {
  if (response.ok) return null;
  const text = await response.clone().text().catch(() => "");
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  // Erros do servidor no formato { error: "mensagem" } (limite, origem).
  if (body && typeof body === "object" && !Array.isArray(body) && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  // Qualquer JSON diferente disso é resposta do tRPC: deixa passar.
  if (body !== null) return null;

  if (response.status === 429) return "Muitas requisições em pouco tempo. Aguarde alguns minutos e tente novamente.";
  if (response.status >= 500) {
    return `O servidor não respondeu corretamente (código ${response.status}). Ele pode estar reiniciando: aguarde um instante e tente de novo.`;
  }
  return `Resposta inesperada do servidor (código ${response.status}). Tente de novo em instantes.`;
}
