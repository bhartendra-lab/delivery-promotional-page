"use client";

import { useState } from "react";
import { confirmStudioDeletionByEmail, requestStudioDeletionByEmail, type StudioDeletionAccepted } from "@/lib/api";
import {
  deletionDoneMessage,
  STUDIO_DELETION_CODE_SENT_WEB,
  STUDIO_DELETION_COPY,
  STUDIO_DELETION_HEADINGS,
  STUDIO_DELETION_WEB_INTRO,
} from "@/lib/studio-account-deletion";

/**
 * The studio counterpart of app/delete-account: the login email, a code sent
 * to it, then the request. The server answers the same whether or not the
 * address has an account until a correct code proves who is asking; the
 * accepted answer says which scope ran (the whole studio for an admin).
 */
export function DeleteStudioAccountForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"enter" | "code" | "done">("enter");
  const [done, setDone] = useState<StudioDeletionAccepted | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await requestStudioDeletionByEmail(email.trim());
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
      setDone(await confirmStudioDeletionByEmail(email.trim(), code));
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = "h-12 w-full rounded-2xl border border-[#E8E2D8] bg-white px-4 text-[16px] font-semibold text-[#2A2218] outline-none focus:border-[#C25A3A]";
  const button = "h-12 w-full rounded-full bg-[#C25A3A] text-[15px] font-extrabold text-white disabled:opacity-50";
  const doneCopy = done ? deletionDoneMessage(done.scope, done.purge_at) : null;
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[460px] flex-col gap-5 bg-[#FAFAF8] px-5 py-12 text-[#2A2218]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/vyavasth-icon.svg" alt="Vyavasth" className="h-10 w-10" />
      <h1 className="text-[26px] font-extrabold tracking-tight">Delete your Vyavasth studio account</h1>
      {step === "done" && doneCopy ? (
        <div className="space-y-2 text-[15px] leading-relaxed text-[#5C5246]" role="status">
          <p className="font-bold text-[#2A2218]">{doneCopy.title}</p>
          <p>{doneCopy.body}</p>
        </div>
      ) : (
        <>
          <p className="text-[14px] leading-relaxed text-[#5C5246]">{STUDIO_DELETION_WEB_INTRO}</p>
          <section className="space-y-3 text-[14px] leading-relaxed text-[#5C5246]">
            <p>
              <b className="text-[#2A2218]">{STUDIO_DELETION_HEADINGS.deletes}</b> {STUDIO_DELETION_COPY.studio.deletes} For a team member, only:{" "}
              {STUDIO_DELETION_COPY.user.deletes}
            </p>
            <p>
              <b className="text-[#2A2218]">{STUDIO_DELETION_HEADINGS.keeps}</b> {STUDIO_DELETION_COPY.studio.keeps}
            </p>
            <p>
              <b className="text-[#2A2218]">{STUDIO_DELETION_HEADINGS.howLong}</b> {STUDIO_DELETION_COPY.studio.howLong} You can also delete your account in the Vyavasth Studio app (Studio tab) or on the dashboard (Personal Information).
            </p>
          </section>
          {step === "enter" ? (
            <div className="space-y-3">
              <input
                className={field}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                inputMode="email"
                autoComplete="email"
                placeholder="you@yourstudio.com"
                aria-label="Login email"
              />
              <button type="button" className={button} disabled={busy || !email.trim()} onClick={send}>
                {busy ? "Sending…" : "Send code"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[14px] text-[#5C5246]">{STUDIO_DELETION_CODE_SENT_WEB}</p>
              <input
                className={`${field} font-mono tracking-[0.3em]`}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label="Code"
              />
              <button type="button" className={button} disabled={busy || code.length !== 6} onClick={confirm}>
                {busy ? "Deleting…" : "Delete my account"}
              </button>
            </div>
          )}
          {error && (
            <p className="text-[14px] font-bold text-[#E2524C]" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </main>
  );
}
