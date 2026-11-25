import { campaignLanding, isRecipientToken, ACQ_COOKIE, ACQ_COOKIE_MAX_AGE } from "@/lib/campaign-link";

/**
 * GET /w/<recipient id> — the tracking link in a WhatsApp campaign template
 * (button link https://deliver.vyavasth.in/w/{{1}}, filled per studio by the CRM).
 *
 * Tells the CRM about the tap (server to server, so the studio's browser never
 * talks to the CRM), then sends the studio to sign-in with utm tags for GA4.
 * The recipient id goes in a first-party cookie, not the URL, so it never
 * reaches Google; a later signup can read it to tie the account to the send.
 *
 * Never fails the visitor: a bad token, an unset CRM, a slow or broken CRM
 * all still land on /login.
 */
const CRM_TIMEOUT_MS = 1500;

export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const valid = isRecipientToken(token);

  let campaign: string | null = null;
  const url = process.env.CRM_CLICK_URL;
  const secret = process.env.CRM_CLICK_SECRET;
  if (valid && url && secret) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(CRM_TIMEOUT_MS),
      });
      if (res.ok) campaign = ((await res.json()) as { campaign?: string | null }).campaign ?? null;
    } catch {
      // The click is lost, the visitor is not.
    }
  }

  const target = new URL(campaignLanding(campaign), request.url);
  const headers = new Headers({ location: target.toString(), "cache-control": "no-store" });
  if (valid) {
    headers.append(
      "set-cookie",
      `${ACQ_COOKIE}=${token}; Max-Age=${ACQ_COOKIE_MAX_AGE}; Path=/; Secure; SameSite=Lax`,
    );
  }
  return new Response(null, { status: 302, headers });
}
