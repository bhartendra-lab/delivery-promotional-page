// lib/signup-attribution.ts — the browser half: remember that a sign up still
// has to be reported, and report it. Never throws and never blocks sign in; a
// report that fails is tried again on the next dashboard page load.

import { getToken } from "@/lib/auth";
import { ACQ_COOKIE } from "@/lib/campaign-link";

const PENDING_KEY = "vy_signup_pending";
/** Longest a redirect waits for the report. */
const SEND_BUDGET_MS = 1500;

/** Called at sign up. Only a visitor who came by a campaign link has anything to report. */
export function markSignup(): void {
  try {
    if (document.cookie.includes(`${ACQ_COOKIE}=`)) localStorage.setItem(PENDING_KEY, "1");
  } catch {
    /* blocked storage: nothing to report */
  }
}

export async function sendPendingSignup(): Promise<void> {
  try {
    const token = getToken();
    if (!token || localStorage.getItem(PENDING_KEY) !== "1") return;
    const res = await fetch("/api/signup-attribution", { method: "POST", headers: { authorization: `Bearer ${token}` }, keepalive: true });
    if (res.ok && ((await res.json()) as { done?: boolean }).done) localStorage.removeItem(PENDING_KEY);
  } catch {
    /* kept for another try */
  }
}

/** For a page that is about to leave: waits for the report, but never longer than the budget. */
export async function sendPendingSignupBeforeLeaving(): Promise<void> {
  await Promise.race([sendPendingSignup(), new Promise<void>((resolve) => setTimeout(resolve, SEND_BUDGET_MS))]);
}
