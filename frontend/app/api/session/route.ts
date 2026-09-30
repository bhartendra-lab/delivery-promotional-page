import { NextResponse, type NextRequest } from "next/server";
import { TOKEN_KEY, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";

/**
 * POST /api/session — re-issues the studio's session cookie from our own
 * origin, so it lives its full SESSION_MAX_AGE_SECONDS in Safari too (a cookie
 * written by JavaScript is capped at 7 days there; one from a same-origin
 * Set-Cookie is not). Called by setToken in lib/auth.ts right after it writes
 * the same cookie itself.
 *
 * Not HttpOnly, on purpose: the dashboard reads the token to send it as a
 * Bearer header to api.vyavasth.in. This endpoint changes nothing about who can
 * read it — only how long the browser keeps it.
 *
 * Studio hostnames never reach this (lib/host-gate.ts serves them only the
 * guest surface), so the cookie only ever exists on the dashboard's own domain.
 */
export async function POST(request: NextRequest) {
  // Only the dashboard's own fetch. A cross-site HTML form can't send
  // application/json, and a cross-site fetch that could would need a CORS
  // preflight this route never answers — so another site can't plant its own
  // token here and sign a visitor into the wrong studio.
  const contentType = request.headers.get("content-type") ?? "";
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!contentType.startsWith("application/json") || (fetchSite && fetchSite !== "same-origin")) {
    return new NextResponse(null, { status: 403 });
  }

  let token: unknown;
  try {
    ({ token } = (await request.json()) as { token?: unknown });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  // Shape check only — the signature is the backend's to verify, on every call.
  if (typeof token !== "string" || token.length > 4096 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
    return new NextResponse(null, { status: 400 });
  }

  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(TOKEN_KEY, token, {
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    httpOnly: false,
  });
  return response;
}
