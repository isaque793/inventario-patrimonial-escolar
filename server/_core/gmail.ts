import { ENV } from "./env";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

type GmailTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

function configurationError(): string | null {
  if (!ENV.googleClientId) return "GOOGLE_CLIENT_ID não configurado.";
  if (!ENV.googleClientSecret) return "GOOGLE_CLIENT_SECRET não configurado.";
  if (!ENV.googleRefreshToken) return "GOOGLE_REFRESH_TOKEN não configurado.";
  return null;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function buildMimeMessage(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): string {
  const boundary = `----=_InventarioPatrimonial_${Date.now().toString(16)}`;

  const headers = [
    "MIME-Version: 1.0",
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "Content-Type: multipart/alternative; boundary=\"" + boundary + "\"",
  ].join("\r\n");

  const body = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.text,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.html,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return `${headers}\r\n\r\n${body}`;
}

async function getAccessToken(): Promise<string> {
  const error = configurationError();
  if (error) throw new Error(error);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      refresh_token: ENV.googleRefreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = (await response.json()) as GmailTokenResponse;

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description ??
        data.error ??
        "Não foi possível obter um token de acesso do Gmail.",
    );
  }

  return data.access_token;
}

export async function sendGmailMessage(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ id: string }> {
  const accessToken = await getAccessToken();
  const raw = base64UrlEncode(buildMimeMessage(input));

  const response = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  const data = (await response.json()) as {
    id?: string;
    error?: { message?: string };
  };

  if (!response.ok || !data.id) {
    throw new Error(
      data.error?.message ?? "O Gmail recusou o envio da mensagem.",
    );
  }

  return { id: data.id };
}
