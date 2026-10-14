import { describe, expect, it } from "vitest";
import { readableApiError } from "./apiResponse";

const response = (status: number, body: string, contentType = "application/json") =>
  new Response(body, { status, headers: { "content-type": contentType } });

describe("readableApiError", () => {
  it("deixa passar respostas normais e erros no formato do tRPC", async () => {
    expect(await readableApiError(response(200, "[]"))).toBeNull();
    expect(await readableApiError(response(401, JSON.stringify([{ error: { json: { message: "E-mail ou senha inválidos" } } }])))).toBeNull();
    expect(await readableApiError(response(400, JSON.stringify({ error: { json: { message: "x" } } })))).toBeNull();
  });

  it("mostra a mensagem do limite de requisições", async () => {
    expect(await readableApiError(response(429, JSON.stringify({ error: "Muitas requisições em pouco tempo." })))).toBe("Muitas requisições em pouco tempo.");
  });

  it("explica quando o servidor devolve uma página de erro (Render reiniciando)", async () => {
    expect(await readableApiError(response(502, "<html>Bad Gateway</html>", "text/html"))).toMatch(/código 502/);
    expect(await readableApiError(response(429, "Too Many Requests", "text/plain"))).toMatch(/Muitas requisições/);
  });
});
