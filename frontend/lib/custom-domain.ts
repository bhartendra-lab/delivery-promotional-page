/**
 * Client-side mirror of the backend's custom-domain hostname rules
 * (backend: src/utils/domain.utils.js — normalizeHostname / validateCustomHostname).
 *
 * This exists so a studio who types their root domain finds out before a
 * round-trip, not after. The backend remains the only gate that counts: it
 * re-normalises and re-validates everything this file sees, and Cloudflare
 * rejects whatever gets past both. Kept deliberately small and pure so the
 * tests beside it can pin it against the backend's own test cases.
 *
 * If you change a rule here, change it there in the same commit.
 */

/** Our own zone. A studio can never claim a hostname under it. */
const RESERVED_ZONE = "vyavasth.in";

/** One DNS label: 1–63 chars, alphanumeric, inner hyphens allowed. */
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Strip everything a studio might paste around a bare hostname — a scheme, a
 * path, a port, a trailing dot, whitespace, uppercase. Returns "" when there is
 * no hostname left.
 *
 * Forgiving on purpose: someone who pastes "https://Gallery.StudioXYZ.com/" has
 * told us exactly which hostname they mean, and making them retype it is a
 * worse experience than understanding it.
 */
export function normalizeHostname(raw: string | null | undefined): string {
  let value = String(raw ?? "").trim().toLowerCase();
  if (!value) return "";
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme
  value = value.split("/")[0]; // path
  value = value.split("?")[0].split("#")[0];
  value = value.split("@").pop() ?? ""; // userinfo
  value = value.split(":")[0]; // port
  value = value.replace(/\.+$/, ""); // trailing root dot
  return value.trim();
}

/**
 * Validate an already-normalized hostname. Returns null when it's acceptable,
 * or the message to show the studio when it isn't.
 *
 * Subdomain-only, checked as "at least three labels". Same deliberate
 * simplification as the backend, with the same known gap: an apex under a
 * multi-part public suffix (studio.co.uk) has three labels and passes here,
 * and Cloudflare rejects it later with its own message. Documented rather than
 * fixed — a public-suffix list is a dependency this doesn't earn.
 */
export function validateCustomHostname(hostname: string): string | null {
  if (!hostname) return "Enter the domain you want to use, like gallery.yourstudio.com.";
  if (hostname.length < 4 || hostname.length > 253) {
    return "That doesn't look like a valid domain.";
  }
  const labels = hostname.split(".");
  if (!labels.every((label) => LABEL.test(label))) {
    return "That doesn't look like a valid domain.";
  }
  if (labels.length < 3) {
    return "Enter a subdomain like gallery.yourstudio.com, not your root domain.";
  }
  if (hostname === RESERVED_ZONE || hostname.endsWith(`.${RESERVED_ZONE}`)) {
    return "Enter a domain you own — vyavasth.in addresses can't be used here.";
  }
  return null;
}

/** Normalize then validate — what every input handler actually wants. */
export function checkHostnameInput(raw: string): { hostname: string; error: string | null } {
  const hostname = normalizeHostname(raw);
  return { hostname, error: validateCustomHostname(hostname) };
}
