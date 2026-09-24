import type { CookieOptions, Request } from "express";

export function getSessionCookieOptions(
  _req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  // The application serves the frontend and API from the same origin.
  // Lax prevents the browser from sending the session cookie on cross-site
  // requests while remaining compatible with normal navigation and API calls.
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  };
}
