import { useSyncExternalStore } from "react";
import type { Company } from "./types";

const TOKEN_KEY = "dlp_token";
const COMPANY_KEY = "dlp_company";

export function getToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${TOKEN_KEY}=`));
  if (!match) return null;
  return decodeURIComponent(match.split("=")[1] ?? "") || null;
}

export function setToken(token: string) {
  if (typeof document === "undefined") return;
  const oneWeek = 60 * 60 * 24 * 7;
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; Path=/; Max-Age=${oneWeek}; SameSite=Lax`;
}

export function clearToken() {
  if (typeof document === "undefined") return;
  document.cookie = `${TOKEN_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function isAuthenticated(): boolean {
  return !!getToken();
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
 * Lets the Topbar/Sidebar read the cached company during render via
 * useSyncExternalStore — no setState-in-effect, no hydration mismatch.
 */
const companyListeners = new Set<() => void>();
let companyCache: { raw: string | null; value: Company | null } = {
  raw: null,
  value: null,
};

function emitCompanyChange() {
  for (const listener of companyListeners) listener();
}

function subscribeCompany(onChange: () => void): () => void {
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
function getCompanySnapshot(): Company | null {
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

/** Reactive, SSR-safe read of the cached company (server snapshot is null). */
export function useCompany(): Company | null {
  return useSyncExternalStore(subscribeCompany, getCompanySnapshot, () => null);
}
