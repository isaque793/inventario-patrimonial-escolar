import { randomBytes, timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import { ENV } from "./env";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

const STATE_COOKIE = "google_oauth_state";
const STATE_MAX_AGE_SECONDS = 10 * 60;

function getCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;

  if (!header) return null;

  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");

    if (key === name) {
      return decodeURIComponent(value.join("="));
    }
  }

  return null;
}

function setStateCookie(res: Response, state: string) {
  const secure = ENV.isProduction ? "; Secure" : "";

  res.setHeader(
    "Set-Cookie",
    `${STATE_COOKIE}=${encodeURIComponent(state)}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=${STATE_MAX_AGE_SECONDS}${secure}`,
  );
}

function clearStateCookie(res: Response) {
  const secure = ENV.isProduction ? "; Secure" : "";

  res.setHeader(
    "Set-Cookie",
    `${STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=0${secure}`,
  );
}

function statesMatch(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function configurationError(): string | null {
  if (!ENV.googleClientId) {
    return "GOOGLE_CLIENT_ID não configurado.";
  }

  if (!ENV.googleClientSecret) {
    return "GOOGLE_CLIENT_SECRET não configurado.";
  }

  if (!ENV.googleRedirectUri) {
    return "GOOGLE_REDIRECT_URI não configurado.";
  }

  return null;
}

function renderPage(title: string, message: string, details?: string) {
  const safeTitle = htmlEscape(title);
  const safeMessage = htmlEscape(message);
  const safeDetails = details ? htmlEscape(details) : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      max-width: 720px;
      margin: 48px auto;
      padding: 0 20px;
      line-height: 1.5;
    }

    h1 {
      font-size: 1.35rem;
    }

    .details {
      background: #f5f5f5;
      padding: 16px;
      border-radius: 8px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  <p>${safeMessage}</p>
  ${safeDetails ? `<div class="details">${safeDetails}</div>` : ""}
</body>
</html>`;
}

export function registerGoogleOAuth(app: Express) {
  app.get("/api/auth/google", (_req, res) => {
    const error = configurationError();

    if (error) {
      res.status(500).type("html").send(renderPage("Google OAuth", error));
      return;
    }

    const state = randomBytes(32).toString("hex");

    setStateCookie(res, state);

    const params = new URLSearchParams({
      client_id: ENV.googleClientId,
      redirect_uri: ENV.googleRedirectUri,
      response_type: "code",
      scope: GMAIL_SEND_SCOPE,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });

    res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    const error = configurationError();

    if (error) {
      res.status(500).type("html").send(renderPage("Google OAuth", error));
      return;
    }

    const state = typeof req.query.state === "string"
      ? req.query.state
      : "";

    const storedState = getCookie(req, STATE_COOKIE);

    clearStateCookie(res);

    if (!storedState || !state || !statesMatch(storedState, state)) {
      res
        .status(403)
        .type("html")
        .send(
          renderPage(
            "Google OAuth",
            "A validação de segurança da autorização falhou.",
          ),
        );

      return;
    }

    if (typeof req.query.error === "string") {
      res
        .status(400)
        .type("html")
        .send(
          renderPage(
            "Google OAuth",
            "A autorização do Gmail não foi concluída.",
            req.query.error,
          ),
        );

      return;
    }

    const code =
      typeof req.query.code === "string"
        ? req.query.code
        : "";

    if (!code) {
      res
        .status(400)
        .type("html")
        .send(
          renderPage(
            "Google OAuth",
            "O Google não retornou um código de autorização.",
          ),
        );

      return;
    }

    try {
      const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: ENV.googleClientId,
          client_secret: ENV.googleClientSecret,
          redirect_uri: ENV.googleRedirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokenData = (await tokenResponse.json()) as {
        access_token?: string;
        refresh_token?: string;
        error?: string;
        error_description?: string;
      };

      if (!tokenResponse.ok || !tokenData.access_token) {
        const detail =
          tokenData.error_description ??
          tokenData.error ??
          "Falha ao trocar o código por tokens.";

        res
          .status(502)
          .type("html")
          .send(
            renderPage(
              "Google OAuth",
              "O Google recusou a troca do código.",
              detail,
            ),
          );

        return;
      }

      if (!tokenData.refresh_token) {
        res
          .status(502)
          .type("html")
          .send(
            renderPage(
              "Google OAuth",
              "A autorização funcionou, mas o Google não retornou um refresh token.",
              "Revogue a autorização do aplicativo na conta Google e tente novamente.",
            ),
          );

        return;
      }

      if (ENV.isProduction) {
        res
          .type("html")
          .send(
            renderPage(
              "Google OAuth autorizado",
              "A autorização foi concluída. O refresh token foi recebido, mas não será exibido neste ambiente.",
              "Configure o GOOGLE_REFRESH_TOKEN usando um canal seguro de configuração do servidor.",
            ),
          );

        return;
      }

      res
        .type("html")
        .send(
          renderPage(
            "Google OAuth autorizado",
            "A autorização do Gmail foi concluída. O refresh token abaixo é um segredo: não o envie para ninguém e não o publique no GitHub.",
            tokenData.refresh_token,
          ),
        );
    } catch (error) {
      console.error(
        "[Google OAuth] Falha na troca do código:",
        error,
      );

      res
        .status(502)
        .type("html")
        .send(
          renderPage(
            "Google OAuth",
            "Não foi possível concluir a autorização com o Google.",
          ),
        );
    }
  });
}