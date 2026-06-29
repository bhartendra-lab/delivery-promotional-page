/**
 * Public bug reporter → `POST /auth/report-bug` (no auth; emails the team).
 *
 * Fire-and-forget by design: it never throws and never returns a rejected
 * promise, so a reporting failure can't break the very flow that's already
 * failing. Identical reports are de-duped within a short window so a retry loop
 * can't spam the inbox.
 *
 * The backend interpolates `bug_info` straight into one `<p>` of an HTML email,
 * so we join diagnostic lines with `<br/>` (newlines wouldn't render). Only our
 * own diagnostics go in here — never raw guest free-text.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/** Arbitrary key → value diagnostics; nullish/empty values are dropped. */
export type BugContext = Record<string, unknown>;

const DEDUPE_MS = 30_000;
const recent = new Map<string, number>();

/** Ambient browser/device diagnostics — all best-effort, all optional. */
function deviceDiagnostics(): BugContext {
  if (typeof window === "undefined") return {};
  const nav = window.navigator;
  const uaData = (nav as unknown as { userAgentData?: { platform?: string } }).userAgentData;
  return {
    "User agent": nav?.userAgent,
    Platform: uaData?.platform ?? nav?.platform,
    Language: nav?.language,
    Screen: typeof screen !== "undefined" ? `${screen.width}×${screen.height}` : undefined,
    Viewport: `${window.innerWidth}×${window.innerHeight}`,
    "Secure context": typeof window.isSecureContext === "boolean" ? String(window.isSecureContext) : undefined,
    URL: window.location?.href,
    When: new Date().toISOString(),
  };
}

/** Render a summary + context bag into the email-friendly `bug_info` string. */
function formatBugInfo(summary: string, ctx: BugContext): string {
  const lines = [summary];
  for (const [k, v] of Object.entries(ctx)) {
    if (v == null || v === "") continue;
    lines.push(`${k}: ${String(v)}`);
  }
  return lines.join("<br/>");
}

/**
 * Report a bug to the team. Pass a short human summary plus any structured
 * context; device diagnostics (UA, secure-context, URL, …) are attached
 * automatically. Awaiting is optional — failures are swallowed.
 */
export async function reportBug(summary: string, ctx: BugContext = {}): Promise<void> {
  try {
    const now = Date.now();
    const prev = recent.get(summary);
    if (prev && now - prev < DEDUPE_MS) return;
    recent.set(summary, now);

    const bug_info = formatBugInfo(summary, { ...ctx, ...deviceDiagnostics() });
    await fetch(`${API_BASE}/auth/report-bug`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bug_info }),
      // Survive a page unload (guest navigates away after the failure).
      keepalive: true,
    });
  } catch {
    // Reporting must never surface to the user.
  }
}
