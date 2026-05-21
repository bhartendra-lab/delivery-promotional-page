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
}
