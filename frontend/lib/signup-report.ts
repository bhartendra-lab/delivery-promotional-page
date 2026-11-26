// lib/signup-report.ts — the server half of "this sign up came from a campaign
// message" (app/api/signup-attribution/route.ts). Pure: fetch and the
// settings are handed in.
//
// The browser sends its session token; the vy_acq cookie (set by the /w
// tracking link) names the message. We ask the backend which studio that token
// belongs to, so a browser cannot name a studio itself, then tell the CRM.
// Nothing is stored in the product, and nothing goes to a third party.

import { ACQ_COOKIE, isRecipientToken } from "./campaign-link.ts";

export type SignupReportEnv = {
  apiBase?: string;
  /** The CRM's click webhook, e.g. https://<crm>/webhooks/click. Sign ups go to its sibling /webhooks/signup. */
  clickUrl?: string;
  secret?: string;
};

/** `done`: nothing more to try, so the browser can stop. */
export type SignupReport = { done: boolean };

const TIMEOUT_MS = 3000;

export function acqFromCookieHeader(header: string | null): string | null {
  for (const part of (header ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === ACQ_COOKIE) {
      const v = rest.join("=");
      return isRecipientToken(v) ? v : null;
    }
  }
  return null;
}

export async function reportSignup(
  input: { cookie: string | null; authorization: string | null },
  env: SignupReportEnv,
  fetcher: typeof fetch = fetch,
): Promise<SignupReport> {
  const token = acqFromCookieHeader(input.cookie);
  if (!token) return { done: true }; // did not come by a campaign link
  if (!env.apiBase || !env.clickUrl || !env.secret || !input.authorization) return { done: false };
  try {
    const me = await fetcher(`${env.apiBase}/onboarding/get-company-details`, {
      headers: { authorization: input.authorization },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!me.ok) return { done: false };
    const companyId = ((await me.json()) as { company?: { _id?: string } }).company?._id;
    if (!companyId) return { done: false };
    const res = await fetcher(new URL("signup", env.clickUrl).toString(), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.secret}` },
      body: JSON.stringify({ token, company_id: companyId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // 200: recorded (or the send already belongs to another studio). 400: it never will be.
    return { done: res.ok || res.status === 400 };
  } catch {
    return { done: false };
  }
}
