"use client";

import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

async function post(path: string, body: unknown) {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new Error(data.message ?? "Something went wrong. Please try again.");
  return data;
}

/**
 * Enter the WhatsApp number or the Google / Apple email the account uses,
 * verify with a code (WhatsApp or email), confirm. The server never says
 * whether an account exists until a correct code proves who is asking.
 */
export function DeleteAccountForm() {
  const [mode, setMode] = useState<"phone" | "email">("phone");
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"enter" | "code" | "done">("enter");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const identity = mode === "phone" ? { phone: `91${value.replace(/\D/g, "").slice(-10)}` } : { email: value.trim() };

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await post("/app/deletion-requests", identity);
      setStep("code");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await post("/app/deletion-requests/verify", { ...identity, code });
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = "h-12 w-full rounded-2xl border border-[#E8E2D8] bg-white px-4 text-[16px] font-semibold text-[#2A2218] outline-none focus:border-[#C25A3A]";
  const button = "h-12 w-full rounded-full bg-[#C25A3A] text-[15px] font-extrabold text-white disabled:opacity-50";
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[460px] flex-col gap-5 bg-[#FAFAF8] px-5 py-12 text-[#2A2218]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/vyavasth-icon.svg" alt="Vyavasth" className="h-10 w-10" />
      <h1 className="text-[26px] font-extrabold tracking-tight">Delete your Vyavasth account</h1>
      {step === "done" ? (
        <p className="text-[15px] leading-relaxed text-[#5C5246]">
          Your account is being deleted. Everything below will be gone within 24 hours.
        </p>
      ) : (
        <>
          <section className="space-y-2 text-[14px] leading-relaxed text-[#5C5246]">
            <p><b className="text-[#2A2218]">What we delete:</b> your app account, saved selfie and face data, the photos we matched to you, your likes, and your place in every event you joined. Events a studio added you to keep your name on their guest list, without your sign-in.</p>
            <p><b className="text-[#2A2218]">What we keep, and why:</b> the record that you gave and withdrew consent (legal proof), and records of WhatsApp sign-in messages (billing). Neither holds your photos or face data.</p>
            <p><b className="text-[#2A2218]">How long:</b> within 24 hours. You can also delete your account in the app, under Settings.</p>
          </section>
          {step === "enter" ? (
            <div className="space-y-3">
              <div className="flex gap-2" role="radiogroup">
                {(["phone", "email"] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setValue(""); }}
                    className={`h-10 flex-1 rounded-full border text-[14px] font-bold ${mode === m ? "border-[#C25A3A] bg-[#F7E9E3] text-[#C25A3A]" : "border-[#E8E2D8]"}`}>
                    {m === "phone" ? "WhatsApp number" : "Google / Apple email"}
                  </button>
                ))}
              </div>
              <input className={field} value={value} onChange={(e) => setValue(e.target.value)} inputMode={mode === "phone" ? "numeric" : "email"}
                placeholder={mode === "phone" ? "98765 43210" : "you@example.com"} aria-label={mode === "phone" ? "WhatsApp number" : "Email"} />
              <button type="button" className={button} disabled={busy || !value.trim()} onClick={send}>{busy ? "Sending…" : "Send code"}</button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[14px] text-[#5C5246]">If an account matches, we sent a 6-digit code {mode === "phone" ? "on WhatsApp" : "by email"}.</p>
              <input className={`${field} font-mono tracking-[0.3em]`} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" aria-label="Code" />
              <button type="button" className={button} disabled={busy || code.length !== 6} onClick={confirm}>{busy ? "Deleting…" : "Delete my account"}</button>
            </div>
          )}
          {error && <p className="text-[14px] font-bold text-[#E2524C]" role="alert">{error}</p>}
        </>
      )}
    </main>
  );
}
