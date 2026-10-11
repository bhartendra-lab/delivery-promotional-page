"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ApiError, confirmValidityPayment, getApiErrorCode, getApiFieldErrors, startValidityCheckout, validityReceiptUrl } from "@/lib/api";
import { PLATFORM_SKIN, type ClientTheme } from "@/lib/client-theme";
import { GST_STATE_CODES } from "@/lib/gst-state-codes";
import { formatPrice } from "@/lib/plans";
import { openCheckout } from "@/lib/razorpay";
import {
  chargedOptionPrice,
  closesInLabel,
  formatValidityDate,
  guardFollowUp,
  guardSentence,
  looksLikeEmail,
  maskEmail,
  periodLabel,
  type ValidityLinkView,
  type ValidityOption,
} from "@/lib/event-validity";
import { IconCheck } from "@/components/ui/icons";
import { RollingDate } from "./RollingDate";
import { useInViewOnce, usePrefersReducedMotion } from "./motion";
import styles from "./lane/lane.module.css";

/** "Did my payment land?" is asked every 2 seconds, 15 times, then the page
 *  stops asking and says the invoice will arrive by email. The server settles
 *  the payment itself if its webhook is late, so this normally answers at once. */
const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 15;

type Phase = "idle" | "opening" | "confirming" | "slow" | "done";
type FieldErrors = { email?: string; state_code?: string };

/** A period's price as the plan lists it: what the card shows. */
const priceOf = (option: ValidityOption) => formatPrice(option.price);
/** What the Client actually pays for it, GST included: what the button says. */
const paidOf = (option: ValidityOption) => formatPrice(chargedOptionPrice(option));

/** States A to Z, as a person looks for theirs. */
const STATES = [...GST_STATE_CODES].sort((a, b) => a.name.localeCompare(b.name));

/**
 * The note at the end of the Client's memory lane: one quiet question, the
 * periods on offer, the two details an invoice needs, and the payment.
 *
 * After a dark page full of their photos, this is a sheet of plain paper: the
 * walk is over and something is being said to them. It reads as a short note,
 * in four moves. How many days are left. When the gallery closes and what
 * that means, once and plainly. That keeping it is possible, and that not
 * keeping it is fine too (with the way to save their photos). Then the
 * periods, each with its price and the date it would run to.
 *
 * The paper wears the Vyavasth platform skin (`t`), exactly as the gallery's
 * sign-in and face-scan screens do: from here on the Client is dealing with
 * Vyavasth, and the page should look like it. The music steps back while this
 * is on screen (see MemoryLane).
 *
 * Nothing is preselected, and three things stand between a Client and paying
 * by mistake: the guard rail (if the event was already extended, it says by
 * whom and when, and a tick box gates the button), the lock (if someone else
 * is paying for the event right now, there is no button at all), and the fine
 * print, which sits just above the button and is never hidden.
 *
 * Every date here is the SAFE date: the last day the gallery is live. The
 * deletion is named once, in plain words, and never used to frighten.
 */
export function ValidityQuestion({
  t,
  token,
  view,
  eventName,
  onRefresh,
}: {
  t: ClientTheme;
  token: string;
  view: ValidityLinkView;
  eventName: string;
  /** Re-read the link ("Check again", or the event closing under the page). */
  onRefresh: () => Promise<void>;
}) {
  const P = PLATFORM_SKIN;
  const reduced = usePrefersReducedMotion();
  const [sectionRef, seen] = useInViewOnce<HTMLElement>({ threshold: 0.12 });
  const headingId = useId();
  const groupName = useId();
  const emailId = useId();
  const stateId = useId();
  const againId = useId();

  const [months, setMonths] = useState<number | null>(null);
  const [email, setEmail] = useState(view.billing.email ?? "");
  const [stateCode, setStateCode] = useState(view.billing.state_code ?? "");
  const [again, setAgain] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [lockedNow, setLockedNow] = useState(false);
  const [checking, setChecking] = useState(false);
  const [orderRef, setOrderRef] = useState<string | null>(null);
  const [doneEndsAt, setDoneEndsAt] = useState<number | null>(null);
  const [pollRound, setPollRound] = useState(0);

  const emailRef = useRef<HTMLInputElement | null>(null);
  const stateRef = useRef<HTMLSelectElement | null>(null);
  const doneHeading = useRef<HTMLHeadingElement | null>(null);

  const endsAt = view.ends_at ?? 0;
  const currentDate = formatValidityDate(endsAt);
  const picked = view.options.find((option) => option.months === months) ?? null;
  // The Event-based plan's GST switch. When its prices are before GST, each
  // card shows the listed price with "Plus GST" and the button shows what is
  // paid. Absent from an API that predates the switch: every price included GST.
  const gstInclusive = view.gst_inclusive !== false;
  const guardLine = guardSentence(view.guard, "client");
  const needsAgain = view.guard.extended;
  const locked = view.lock_held_by_other || lockedNow;

  /* ── confirming ───────────────────────────────────────────────── */

  useEffect(() => {
    if (phase !== "confirming" || !orderRef) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (cancelled || !orderRef) return;
      attempts += 1;
      try {
        const res = await confirmValidityPayment(token, orderRef);
        if (cancelled) return;
        if (res.state === "paid") {
          setDoneEndsAt(res.ends_at ?? picked?.new_end ?? null);
          setPhase("done");
          return;
        }
        if (res.state === "failed") {
          setNotice("That payment did not go through, and nothing was charged. You can try again.");
          setPhase("idle");
          return;
        }
      } catch (err) {
        // Asked too often (the page shares a per-network budget): stop asking
        // rather than be refused again. Anything else is transient.
        if (err instanceof ApiError && err.status === 429) attempts = MAX_ATTEMPTS;
      }
      if (cancelled) return;
      if (attempts >= MAX_ATTEMPTS) {
        setPhase("slow");
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // `picked` is only read for a fallback date and must not restart the poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, orderRef, token, pollRound]);

  // Once it is done, the result is what a screen reader should land on.
  useEffect(() => {
    if (phase === "done") doneHeading.current?.focus();
  }, [phase]);

  /* ── paying ───────────────────────────────────────────────────── */

  const pay = useCallback(async () => {
    if (!picked || phase === "opening") return;
    const cleanEmail = email.trim().toLowerCase();
    const next: FieldErrors = {};
    if (!cleanEmail) next.email = "Enter the email your invoice should go to.";
    else if (!looksLikeEmail(cleanEmail)) next.email = "That email address does not look right.";
    if (!stateCode) next.state_code = "Choose your state.";
    setErrors(next);
    setNotice(null);
    if (next.email) {
      emailRef.current?.focus();
      return;
    }
    if (next.state_code) {
      stateRef.current?.focus();
      return;
    }

    setPhase("opening");
    try {
      const order = await startValidityCheckout(token, { months: picked.months, email: cleanEmail, state_code: stateCode });
      setOrderRef(order.order_ref);
      await openCheckout({
        keyId: order.key_id,
        orderId: order.razorpay_order_id,
        amountRupees: order.amount,
        description: `${eventName}: ${periodLabel(picked.months)} more`,
        prefill: { email: cleanEmail, name: view.client_first_name ?? undefined },
        timeoutSeconds: order.checkout_timeout_seconds,
        onSuccess: () => {
          setPollRound((n) => n + 1);
          setPhase("confirming");
        },
        onDismiss: () => {
          setNotice("Payment was not completed. Nothing was charged.");
          setPhase("idle");
        },
      });
    } catch (err) {
      setPhase("idle");
      const code = getApiErrorCode(err);
      if (code === "EXTENSION_IN_PROGRESS") {
        setLockedNow(true);
        return;
      }
      if (code === "EVENT_EXPIRED") {
        // It closed while the page was open: show the closed page.
        void onRefresh();
        return;
      }
      const fields = getApiFieldErrors(err);
      if (fields) {
        const fromServer: FieldErrors = {};
        for (const field of fields) {
          if (field.field === "email") fromServer.email = field.message;
          else if (field.field === "state_code") fromServer.state_code = field.message;
        }
        if (fromServer.email || fromServer.state_code) {
          setErrors(fromServer);
          (fromServer.email ? emailRef.current : stateRef.current)?.focus();
          return;
        }
      }
      setNotice(
        err instanceof ApiError && [400, 409, 429].includes(err.status)
          ? err.message
          : "The payment window could not open. Check your connection and try again.",
      );
    }
  }, [picked, phase, email, stateCode, token, eventName, view.client_first_name, onRefresh]);

  const checkAgain = useCallback(async () => {
    setChecking(true);
    try {
      await onRefresh();
      setLockedNow(false);
    } finally {
      setChecking(false);
    }
  }, [onRefresh]);

  /* ── done ─────────────────────────────────────────────────────── */

  if (phase === "done") {
    const newDate = formatValidityDate(doneEndsAt ?? picked?.new_end ?? endsAt);
    const thumbs = (view.reel?.items ?? []).slice(0, 4).map((item) => item.url);
    return (
      <section id="keep" className={styles.note} aria-live="polite">
        <div className={`${styles.notePaper} ${styles.notePaperDone}`} style={{ background: t.bg, color: t.text }}>
          {thumbs.length > 0 && <GatherStack t={t} urls={thumbs} reduced={reduced} />}
          <h2 ref={doneHeading} tabIndex={-1} className={`${styles.noteTitle} outline-none`} style={{ color: t.text }}>
            It&apos;s staying. Till <RollingDate value={newDate} from={currentDate} play />.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed" style={{ color: t.muted }}>
            Every photo is right where you left it. Your invoice is on its way to {maskEmail(email)}.
          </p>
          <div className="mt-7 flex w-full flex-col gap-3 sm:flex-row">
            {view.gallery_url && (
              <a
                href={view.gallery_url}
                className="inline-flex h-12 items-center justify-center rounded-full px-6 text-[15px] font-bold"
                style={{ background: t.brand, color: t.onBrand }}
              >
                Open the gallery
              </a>
            )}
            {orderRef && (
              <a
                href={validityReceiptUrl(token, orderRef)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center justify-center rounded-full border px-6 text-[15px] font-bold"
                style={{ borderColor: t.border, color: t.text, background: t.card }}
              >
                Download receipt
              </a>
            )}
          </div>
        </div>
      </section>
    );
  }

  /* ── asking ───────────────────────────────────────────────────── */

  const waiting = phase === "confirming" || phase === "slow";
  const canPay = Boolean(picked) && !locked && phase === "idle" && (!needsAgain || again);

  return (
    <section id="keep" ref={sectionRef} className={styles.note} aria-labelledby={headingId}>
      <div className={`${styles.notePaper} validity-reveal ${seen ? "is-in" : ""}`} style={{ background: t.bg, color: t.text }}>
        <div className="max-w-[620px]">
          {endsAt > 0 && (
            <p className={styles.noteChip} style={{ background: t.accentWash, color: t.brandDeep }}>
              {closesInLabel(endsAt)}
            </p>
          )}
          <h2 id={headingId} className={styles.noteTitle} style={{ color: t.text }}>
            Before you go, a small note.
          </h2>
          {/* The deletion, once, in plain words. Never again on this page. */}
          <p className={styles.noteBody} style={{ color: t.text }}>
            This gallery is live till <strong>{currentDate}</strong>. After that it closes and its photos are deleted.
          </p>
          <p className={styles.noteBody} style={{ color: t.muted }}>
            If you would like more time with them, you can keep it open for longer. If not, that is fine too.{" "}
            {view.gallery_url ? (
              <a href={view.gallery_url} className="font-bold underline underline-offset-2" style={{ color: t.text }}>
                Open the gallery
              </a>
            ) : (
              "Open the gallery"
            )}{" "}
            and save the ones you love before then.
          </p>
          <p className={styles.noteAsk} style={{ color: t.text }}>
            Keep it open for
          </p>
        </div>

        <div className="mt-4 lg:grid lg:grid-cols-12 lg:items-start lg:gap-12">
          {/* Left on a wide screen: the guard rail and the periods. */}
          <div className="lg:col-span-7">
            {guardLine && (
              <div className="mb-4 px-4 py-3.5" style={{ background: t.accentWash, borderRadius: t.rField }}>
                <p className="text-[14px] font-bold leading-snug" style={{ color: t.text }}>
                  {guardLine}
                </p>
                <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: t.text }}>
                  {guardFollowUp(view.guard)}
                </p>
              </div>
            )}

            <div role="radiogroup" aria-labelledby={headingId} className="flex flex-col gap-3">
              {view.options.map((option) => {
                const selected = option.months === months;
                return (
                  <label key={option.months} className="validity-option relative block cursor-pointer">
                    <input
                      type="radio"
                      name={groupName}
                      value={option.months}
                      checked={selected}
                      disabled={waiting || phase === "opening"}
                      onChange={() => {
                        setMonths(option.months);
                        setNotice(null);
                      }}
                      className="peer sr-only"
                    />
                    <span
                      className="flex min-h-[84px] items-center gap-4 border-2 px-4 py-4 peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2"
                      style={{
                        background: t.card,
                        borderColor: selected ? t.brand : t.border,
                        borderRadius: t.rField,
                        boxShadow: selected ? t.shadow : t.shadowSm,
                        ["--tw-ring-color" as string]: t.brand,
                      }}
                    >
                      <span
                        aria-hidden
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2"
                        style={{ borderColor: selected ? t.brand : t.border, background: selected ? t.brand : "transparent", color: t.onBrand }}
                      >
                        {selected && <IconCheck size={13} weight="bold" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[18px] font-extrabold leading-tight" style={{ color: t.text }}>
                            {periodLabel(option.months)}
                          </span>
                          {option.best_value && (
                            <span
                              className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.07em]"
                              style={{ background: t.accentWash, color: t.brand }}
                            >
                              Best value
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block text-[13.5px] font-medium" style={{ color: t.muted }}>
                          Live till{" "}
                          <RollingDate value={formatValidityDate(option.new_end)} from={currentDate} play={selected} />
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[18px] font-extrabold tabular-nums leading-tight" style={{ color: t.text }}>
                          {priceOf(option)}
                        </span>
                        <span className="mt-1 block text-[12px] font-medium" style={{ color: t.muted }}>
                          {gstInclusive ? "GST included" : "Plus GST"}
                        </span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            {needsAgain && (
              <label htmlFor={againId} className="mt-4 flex min-h-[44px] cursor-pointer items-center gap-3">
                <input
                  id={againId}
                  type="checkbox"
                  checked={again}
                  onChange={(e) => setAgain(e.target.checked)}
                  className="h-5 w-5 shrink-0"
                  style={{ accentColor: t.brand }}
                />
                <span className="text-[15px] font-bold" style={{ color: t.text }}>
                  Yes, extend it again
                </span>
              </label>
            )}
          </div>

          {/* Right on a wide screen, below on a phone: the Vyavasth trust layer. */}
          <div className="mt-7 lg:col-span-5 lg:mt-0" style={{ fontFamily: P.font }}>
            {waiting ? (
              <div className="px-5 py-6" style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: P.rCard }} aria-live="polite">
                {phase === "confirming" ? (
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2"
                      style={{ borderColor: P.border, borderTopColor: P.brand }}
                    />
                    <p className="text-[15px] font-bold" style={{ color: P.text }}>
                      Confirming your payment
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-[15px] leading-relaxed" style={{ color: P.text }}>
                      Your payment went through and is taking a moment to show. You can close this page; your invoice will reach
                      your email.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setPollRound((n) => n + 1);
                        setPhase("confirming");
                      }}
                      className="mt-4 inline-flex h-11 items-center rounded-full border px-5 text-[14px] font-bold"
                      style={{ borderColor: P.border, color: P.text, background: P.card }}
                    >
                      Check again
                    </button>
                  </>
                )}
              </div>
            ) : (
              picked && (
                <>
                  {!locked && (
                    <div className="px-5 py-5" style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: P.rCard }}>
                      <h3 className="text-[16px] font-extrabold" style={{ color: P.text }}>
                        Your details
                      </h3>

                      <label htmlFor={emailId} className="mt-4 block text-[13.5px] font-bold" style={{ color: P.text }}>
                        Email for your GST invoice
                      </label>
                      <input
                        ref={emailRef}
                        id={emailId}
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        required
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                        }}
                        aria-invalid={errors.email ? true : undefined}
                        aria-describedby={`${emailId}-note${errors.email ? ` ${emailId}-error` : ""}`}
                        className="mt-1.5 h-12 w-full border px-3.5 text-[16px] outline-none focus-visible:ring-2"
                        style={{
                          borderColor: errors.email ? P.error : P.border,
                          borderRadius: 12,
                          color: P.text,
                          background: P.bg,
                          ["--tw-ring-color" as string]: P.ring,
                        }}
                      />
                      {errors.email && (
                        <p id={`${emailId}-error`} role="alert" className="mt-1.5 text-[13px] font-semibold" style={{ color: P.error }}>
                          {errors.email}
                        </p>
                      )}
                      <p id={`${emailId}-note`} className="mt-1.5 text-[12.5px]" style={{ color: P.muted }}>
                        We&apos;ll email your invoice here.
                      </p>

                      <label htmlFor={stateId} className="mt-4 block text-[13.5px] font-bold" style={{ color: P.text }}>
                        Your state
                      </label>
                      <select
                        ref={stateRef}
                        id={stateId}
                        required
                        value={stateCode}
                        onChange={(e) => {
                          setStateCode(e.target.value);
                          if (errors.state_code) setErrors((prev) => ({ ...prev, state_code: undefined }));
                        }}
                        aria-invalid={errors.state_code ? true : undefined}
                        aria-describedby={errors.state_code ? `${stateId}-error` : undefined}
                        className="mt-1.5 h-12 w-full border px-3 text-[16px] outline-none focus-visible:ring-2"
                        style={{
                          borderColor: errors.state_code ? P.error : P.border,
                          borderRadius: 12,
                          color: P.text,
                          background: P.bg,
                          ["--tw-ring-color" as string]: P.ring,
                        }}
                      >
                        <option value="">Choose your state</option>
                        {STATES.map((state) => (
                          <option key={state.code} value={state.code}>
                            {state.name}
                          </option>
                        ))}
                      </select>
                      {errors.state_code && (
                        <p id={`${stateId}-error`} role="alert" className="mt-1.5 text-[13px] font-semibold" style={{ color: P.error }}>
                          {errors.state_code}
                        </p>
                      )}
                    </div>
                  )}

                  {/* On a phone this bar sticks to the bottom of the screen for
                      as long as the question is on it, and comes to rest right
                      under the details at the end, so it is still within reach
                      by scrolling when the keyboard covers the bottom edge. On
                      a wide screen it simply sits under the details. */}
                  <div
                    className="sticky bottom-0 z-10 -mx-6 mt-5 border-t px-6 pt-3 lg:static lg:mx-0 lg:border-t-0 lg:px-0 lg:pt-0"
                    style={{ background: P.bg, borderColor: P.border, paddingBottom: "max(14px, env(safe-area-inset-bottom))" }}
                  >
                    {notice && (
                      <p role="status" className="mb-2 text-[13px] font-semibold leading-snug" style={{ color: P.text }}>
                        {notice}
                      </p>
                    )}
                    {locked ? (
                      <div aria-live="polite">
                        <p className="text-[14px] leading-relaxed" style={{ color: P.text }}>
                          Someone is paying for this right now. Check back in a few minutes.
                        </p>
                        <button
                          type="button"
                          onClick={checkAgain}
                          disabled={checking}
                          className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-full border text-[15px] font-bold disabled:opacity-60"
                          style={{ borderColor: P.border, color: P.text, background: P.card }}
                        >
                          {checking ? "Checking" : "Check again"}
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="mb-2.5 text-[11.5px] leading-snug" style={{ color: P.muted }}>
                          Payment by Razorpay, for Vyavasth, the platform your photographer uses.{" "}
                          {gstInclusive ? "GST included." : `${paidOf(picked)} includes GST.`} Extensions are not
                          refundable.
                        </p>
                        <button
                          type="button"
                          onClick={pay}
                          disabled={!canPay}
                          className="flex h-14 w-full flex-col items-center justify-center rounded-full disabled:opacity-50"
                          style={{ background: P.brand, color: P.onBrand }}
                        >
                          <span className="text-[16px] font-extrabold leading-tight">
                            {phase === "opening" ? "Opening payment" : `Pay ${paidOf(picked)}`}
                          </span>
                          <span className="text-[12px] font-semibold leading-tight opacity-90">
                            Live till {formatValidityDate(picked.new_end)}
                          </span>
                        </button>
                      </>
                    )}
                  </div>
                </>
              )
            )}
            {/* Breathing room under the section on a phone when nothing is chosen yet. */}
            {!picked && !waiting && <div className="h-12 lg:hidden" aria-hidden />}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The day's first few photos, gathered into a small neat stack.
 *
 * One FLIP: each thumbnail is placed where its photo sat in the strip above
 * (First), then let go to settle into the stack (Last), in a single transform
 * transition of 650ms. The stack is offset, never rotated. With reduced
 * motion, or when a strip photo cannot be found, it is simply there.
 */
function GatherStack({ t, urls, reduced }: { t: ClientTheme; urls: string[]; reduced: boolean }) {
  const refs = useRef<Array<HTMLImageElement | null>>([]);
  const offsets = useMemo(() => urls.map((_, i) => i * 14), [urls]);

  useLayoutEffect(() => {
    if (reduced) return;
    const moved: HTMLImageElement[] = [];
    refs.current.forEach((node, i) => {
      const source = document.querySelector<HTMLElement>(`[data-reel-thumb="${i}"]`);
      if (!node || !source) return;
      const first = source.getBoundingClientRect();
      const last = node.getBoundingClientRect();
      if (!first.width || !last.width) return;
      // A photo far off screen would cross the whole page; it comes in from
      // just past the edge instead.
      const limitX = window.innerWidth;
      const limitY = window.innerHeight;
      const dx = Math.max(-limitX, Math.min(limitX, first.left - last.left));
      const dy = Math.max(-limitY, Math.min(limitY, first.top - last.top));
      const scale = Math.min(3, first.width / last.width);
      node.style.transition = "none";
      node.style.transformOrigin = "top left";
      node.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
      node.style.opacity = "0.6";
      moved.push(node);
    });
    if (moved.length === 0) return;
    // Two frames: one to paint the start, one to let go.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        for (const node of moved) {
          node.style.transition = "";
          node.style.transform = "";
          node.style.opacity = "";
        }
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [reduced, urls]);

  return (
    <div aria-hidden className="relative h-[84px]" style={{ width: 84 + offsets[offsets.length - 1] }}>
      {urls.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- a reel copy already on the page, served as it is
        <img
          key={url}
          ref={(node) => {
            refs.current[i] = node;
          }}
          src={url}
          alt=""
          className="validity-gather absolute top-0 h-[84px] w-[84px] object-cover"
          style={{ left: offsets[i], zIndex: i, borderRadius: t.rTile, boxShadow: t.shadow }}
        />
      ))}
    </div>
  );
}
