import { reportSignup } from "@/lib/signup-report";
import { ACQ_COOKIE } from "@/lib/campaign-link";

/**
 * POST /api/signup-attribution — called by the dashboard after a sign up that
 * came by a campaign link. Server to server from here, so the CRM secret never
 * reaches the browser. Always answers 200 with { done }.
 */
export async function POST(request: Request) {
  const result = await reportSignup(
    { cookie: request.headers.get("cookie"), authorization: request.headers.get("authorization") },
    { apiBase: process.env.NEXT_PUBLIC_API_BASE_URL, clickUrl: process.env.CRM_CLICK_URL, secret: process.env.CRM_CLICK_SECRET },
  );
  const headers = new Headers({ "cache-control": "no-store" });
  // Reported: forget the link, so it is never counted again.
  if (result.done) headers.append("set-cookie", `${ACQ_COOKIE}=; Max-Age=0; Path=/; Domain=vyavasth.in; Secure; SameSite=Lax`);
  return Response.json(result, { headers });
}
