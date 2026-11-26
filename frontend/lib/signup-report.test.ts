import { test } from "node:test";
import assert from "node:assert/strict";
import { acqFromCookieHeader, reportSignup } from "./signup-report.ts";

const RID = "01JD8K3M5N7P9Q1R2S4T6V8W0X";
const env = { apiBase: "https://api.test", clickUrl: "https://crm.test/webhooks/click", secret: "s".repeat(32) };
const input = { cookie: `a=1; vy_acq=${RID}`, authorization: "Bearer studio-token" };

function fake(crmStatus = 200, meStatus = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return String(url).includes("get-company-details")
      ? new Response(JSON.stringify({ company: { _id: "c".repeat(24) } }), { status: meStatus })
      : new Response("{}", { status: crmStatus });
  }) as unknown as typeof fetch;
  return { f, calls };
}

test("asks the backend who is signed in, then tells the CRM which message brought them", async () => {
  const { f, calls } = fake();
  assert.deepEqual(await reportSignup(input, env, f), { done: true });
  assert.equal(calls[0].url, "https://api.test/onboarding/get-company-details");
  assert.equal(calls[1].url, "https://crm.test/webhooks/signup");
  assert.deepEqual(JSON.parse(String(calls[1].init.body)), { token: RID, company_id: "c".repeat(24) });
  assert.equal((calls[1].init.headers as Record<string, string>).authorization, `Bearer ${env.secret}`);
});

test("a visitor who did not come by a campaign link sends nothing", async () => {
  const { f, calls } = fake();
  assert.deepEqual(await reportSignup({ ...input, cookie: "vy_acq=junk" }, env, f), { done: true });
  assert.equal(calls.length, 0);
  assert.equal(acqFromCookieHeader(null), null);
});

test("tries again later when the CRM or backend cannot be reached, or the CRM is not set up", async () => {
  assert.deepEqual(await reportSignup(input, env, fake(503).f), { done: false });
  assert.deepEqual(await reportSignup(input, env, fake(404).f), { done: false });
  assert.deepEqual(await reportSignup(input, env, fake(200, 401).f), { done: false });
  assert.deepEqual(await reportSignup(input, { ...env, secret: undefined }, fake().f), { done: false });
  const down = (async () => {
    throw new Error("down");
  }) as unknown as typeof fetch;
  assert.deepEqual(await reportSignup(input, env, down), { done: false });
  assert.deepEqual(await reportSignup(input, env, fake(400).f), { done: true });
});
