/**
 * Guest token store — the guest JWT is kept client-side, scoped per event
 * (keyed by `unique_identifier`) so multiple shared galleries don't collide.
 *
 * On expiry the token is silently re-minted from the backend (which re-issues
 * from the guest's stored Google refresh token) rather than forcing a re-login;
 * only a failed refresh falls back to the Google sign-in flow.
 */

import { refreshGuestToken } from "./api";

const PREFIX = "vy_guest_token_";
const keyFor = (uid: string) => `${PREFIX}${uid}`;

export type GuestClaims = {
  id: string;
  email?: string;
  name?: string;
  company_id?: string | null;
  phone?: string | null;
  kind?: string;
  exp?: number;
  iat?: number;
};

export function getGuestToken(uid: string): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(keyFor(uid));
}

export function setGuestToken(uid: string, token: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(keyFor(uid), token);
}

export function clearGuestToken(uid: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(keyFor(uid));
}

/** Decode a JWT payload (no signature check — display/expiry use only). */
export function decodeGuestToken(token: string): GuestClaims | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join(""),
    );
    return JSON.parse(json) as GuestClaims;
  } catch {
    return null;
  }
}

/** True when the token is missing/undecodable or within `skewMs` of expiry. */
export function isGuestTokenExpired(token: string, skewMs = 30_000): boolean {
  const claims = decodeGuestToken(token);
  if (!claims?.exp) return true;
  return claims.exp * 1000 <= Date.now() + skewMs;
}

/** Re-mint and persist a fresh token; clears + returns null on failure. */
export async function refreshGuest(uid: string): Promise<string | null> {
  const old = getGuestToken(uid);
  if (!old) return null;
  try {
    const { token } = await refreshGuestToken(old);
    setGuestToken(uid, token);
    return token;
  } catch {
    clearGuestToken(uid);
    return null;
  }
}

/**
 * Return a usable token for this event, refreshing first if it's expired.
 * Returns null when there's no token or refresh fails (caller → re-login).
 */
export async function ensureGuestToken(uid: string): Promise<string | null> {
  const token = getGuestToken(uid);
  if (!token) return null;
  if (isGuestTokenExpired(token)) return refreshGuest(uid);
  return token;
}
