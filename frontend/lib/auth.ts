import type { Company } from "./types";

/** Shared with app/api/session/route.ts, which re-issues the same cookie. */
export const TOKEN_KEY = "dlp_token";
const COMPANY_KEY = "dlp_company";

/**
 * "Stay signed in on this device." 400 days is the longest any browser will
 * keep a cookie (Chrome caps Max-Age there). The backend's token lasts a year
 * and is re-minted daily while the dashboard is in use (refreshSessionIfStale
 * in lib/api.ts), so an active device never reaches either limit.
 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

/** How old a session token gets before the dashboard swaps it for a fresh one. */
export const SESSION_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

export function getToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${TOKEN_KEY}=`));
  if (!match) return null;
  return decodeURIComponent(match.split("=")[1] ?? "") || null;
}

/**
 * Stores the session token, then has our own server re-issue the same cookie.
 *
 * The first write is here so the very next request can already read it. It is
 * not enough on its own: Safari (and every iOS browser) caps a cookie written
 * from JavaScript at 7 days whatever Max-Age says, which would sign a studio
 * out after a week away. A Set-Cookie from the same origin isn't capped, so
 * /api/session repeats it with the full lifetime. If that call fails the studio
 * is still signed in — only the week-long Safari limit comes back.
 */
export async function setToken(token: string): Promise<void> {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  try {
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    /* see above — the cookie written here still works */
  }
}

export function clearToken() {
  if (typeof document === "undefined") return;
  // Also removes the /api/session copy: same name, host and path, and it is
  // deliberately not HttpOnly (every API call reads it for the Bearer header).
  document.cookie = `${TOKEN_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** When the token was minted (ms), from its `iat` claim — null if unreadable. No signature check: scheduling only. */
export function tokenIssuedAt(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const { iat } = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { iat?: unknown };
    return typeof iat === "number" ? iat * 1000 : null;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

/**
 * Onboarding is a two-gate flow: WhatsApp verification, then Google
 * Business. `onboarding_completed_at` (stamped by the LAST step) is the
 * single source of truth — checking whatsapp_verified alone would let a
 * studio slip past the Google step by refreshing partway through.
 *
 * Studios that verified WhatsApp before the Google step existed were
 * backfilled with onboarding_completed_at by the backend migration script,
 * so they are never re-gated.
 */
export function needsOnboarding(company: Company): boolean {
  return Boolean(company.onboarding_required) && !company.onboarding_completed_at;
}

/**
 * The studio has finished onboarding but has not paid yet: it must buy events
 * or a storage plan (the compulsory step at /checkout?onboarding=1) before it
 * may see the dashboard. Decided by the API (`plan_required` on the company).
 *
 * An absent value is false on purpose. A company cached before this field
 * existed has none, and reading that as "must pay" would trap every signed-in
 * studio on the payment step.
 */
export function needsPlan(company: Company): boolean {
  return company.plan_required === true;
}

/** Where a studio that still has to choose a plan is sent. */
export const PLAN_STEP_PATH = "/checkout?onboarding=1";

/**
 * Only allows a same-origin relative path as a post-login redirect target —
 * guards against an open redirect via a crafted `next`/`redirect` query
 * param (e.g. `//evil.com` or `https://evil.com`), which an attacker could
 * otherwise use to send a login flow to an external site.
 */
export function sanitizeRedirectPath(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return fallback;
  return raw;
}

export function setCompany(company: Company): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(COMPANY_KEY, JSON.stringify(company));
  emitCompanyChange();
}

export function getCompany(): Company | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(COMPANY_KEY);
    return raw ? (JSON.parse(raw) as Company) : null;
  } catch {
    return null;
  }
}

export function clearCompany(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(COMPANY_KEY);
  emitCompanyChange();
}

/* ── reactive company store (SSR-safe, cross-tab) ──────────────────────
 * Backs the `useCompany` hook (in lib/useCompany.ts) so the Topbar/Sidebar can
 * read the cached company during render via useSyncExternalStore — no
 * setState-in-effect, no hydration mismatch. The store primitives live here
 * (no React import) so this module stays server-safe for lib/api.ts.
 */
const companyListeners = new Set<() => void>();
let companyCache: { raw: string | null; value: Company | null } = {
  raw: null,
  value: null,
};

function emitCompanyChange() {
  for (const listener of companyListeners) listener();
}

export function subscribeCompany(onChange: () => void): () => void {
  companyListeners.add(onChange);
  // `storage` covers cross-tab writes; same-tab writes notify via emitCompanyChange.
  if (typeof window !== "undefined") window.addEventListener("storage", onChange);
  return () => {
    companyListeners.delete(onChange);
    if (typeof window !== "undefined") window.removeEventListener("storage", onChange);
  };
}

/**
 * Stable snapshot: returns the same Company reference while the stored JSON is
 * unchanged. Required — returning a fresh object each call would make
 * useSyncExternalStore re-render on every read.
 */
export function getCompanySnapshot(): Company | null {
  const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(COMPANY_KEY);
  if (raw === companyCache.raw) return companyCache.value;
  let value: Company | null = null;
  try {
    value = raw ? (JSON.parse(raw) as Company) : null;
  } catch {
    value = null;
  }
  companyCache = { raw, value };
  return value;
}
