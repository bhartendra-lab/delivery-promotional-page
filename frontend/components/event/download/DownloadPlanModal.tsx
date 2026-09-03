"use client";

/**
 * The download pre-flight. MANDATORY in front of every bulk download, including
 * 2560px on desktop — nobody should be surprised by what is about to happen.
 * The single-photo lightbox download does not come through here.
 *
 * Two states in ONE component, and it deliberately does not close when the
 * download starts: it becomes the progress surface. A multi-hour download
 * deserves better than a toast, and `batchedZip` structurally requires a
 * persistent surface because each part needs its own click.
 *
 * It renders a plan; it does not make one. Every rule about sizes, tiers,
 * capabilities and platforms lives in `planDownload`, and every sentence lives
 * in `alertCopy` / `methodCopy` beside the alert definitions — never inline
 * here.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  alertCopy,
  formatBytes,
  methodCopy,
  type DownloadAlert,
  type DownloadTier,
} from "@/lib/download/plan";
import type { DownloadFlow } from "@/lib/download/useDownloadFlow";
import { ARCHIVE_TIER_FULL } from "@/lib/delivery-preferences";

/** Token subset both hosts can supply — the guest gallery's `ClientTheme`, or
 *  the dashboard's brand CSS variables. */
export type DownloadModalTheme = {
  card: string;
  sunken: string;
  border: string;
  text: string;
  muted: string;
  brand: string;
  onBrand: string;
  error: string;
  errorSoft: string;
  shadow: string;
  font?: string;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The archive tiers borrow their names from the studio-facing registry, so a
 * tier the studio uploaded as "Cinema 4K" is never offered for download under a
 * different name. The delivery copy keeps a plain-language label instead of the
 * studio's "QHD", because this selector is read by guests.
 */
const TIER_LABEL: Record<DownloadTier, string> = {
  "2560": "Web (2560px)",
  ...ARCHIVE_TIER_FULL,
};

export function DownloadPlanModal({
  flow,
  theme: t,
  /** Link a blocked guest can send themselves to finish on a computer. */
  shareUrl,
  /** Returns to selection mode so the guest can pick fewer photos. */
  onSelectFewer,
}: {
  flow: DownloadFlow;
  theme: DownloadModalTheme;
  shareUrl?: string;
  onSelectFewer?: () => void;
}) {
  const { state, close, confirm, cancel, setTier, downloadPart, forgetRememberedFolder } = flow;
  const { open, phase, plan, env, alerts, progress, partStates, result, rememberedFolder } =
    state;
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [copied, setCopied] = useState(false);

  // Escape closes only in the `plan` state. While running it asks first —
  // stopping throws away everything fetched so far.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (phase === "running") setConfirmCancel(true);
        else close();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, phase, close]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const share = useCallback(async () => {
    if (!shareUrl) return;
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    try {
      if (nav?.share) {
        await nav.share({ url: shareUrl });
        return;
      }
      await nav?.clipboard?.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      /* dismissed the share sheet, or no clipboard — nothing to report */
    }
  }, [shareUrl]);

  if (!open || typeof document === "undefined") return null;

  const count = plan?.items.length ?? 0;
  const blocked = plan?.method === "blocked";
  const font = t.font ? { fontFamily: t.font } : undefined;

  const body = (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6"
      style={{ background: "rgba(31,26,14,0.55)" }}
      onClick={() => {
        if (phase === "running") setConfirmCancel(true);
        else close();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl sm:max-w-[440px] sm:rounded-3xl"
        style={{ background: t.card, boxShadow: t.shadow, ...font }}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="shrink-0 px-5 pt-5">
          <div id={titleId} className="text-[17px] font-extrabold" style={{ color: t.text }}>
            {phase === "finished"
              ? "Download finished"
              : phase === "running"
                ? "Downloading…"
                : `Download ${count.toLocaleString("en-IN")} photo${count === 1 ? "" : "s"}`}
          </div>
        </div>

        {/* ── Scrolling body ────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-3">
          {phase === "resolving" && (
            <p className="text-[13px] font-semibold" style={{ color: t.muted }}>
              Working out what to download…
            </p>
          )}

          {phase === "plan" && plan && (
            <div className="flex flex-col gap-3.5">
              {/* Tier selector — only when this selection actually has an
                  archive copy AND the studio lets this viewer have it. Two
                  options, never three: a booking never carries both archive
                  tiers, so whichever the studio uploaded is the only one shown. */}
              {state.offeredArchiveTier && (
                <div role="radiogroup" aria-label="Quality" className="flex flex-col gap-1.5">
                  {(["2560", state.offeredArchiveTier] as DownloadTier[]).map((option) => (
                    <label
                      key={option}
                      className="flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5"
                      style={{
                        borderColor: state.tier === option ? t.brand : t.border,
                        background: state.tier === option ? t.sunken : "transparent",
                      }}
                    >
                      <input
                        type="radio"
                        name="download-tier"
                        checked={state.tier === option}
                        onChange={() => setTier(option)}
                        className="h-3.5 w-3.5"
                        style={{ accentColor: t.brand }}
                      />
                      <span className="text-[13px] font-bold" style={{ color: t.text }}>
                        {TIER_LABEL[option]}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {/* Exact size — summed from real byte counts, never estimated. */}
              <div className="text-[13px] font-semibold leading-relaxed" style={{ color: t.muted }}>
                {count.toLocaleString("en-IN")} photo{count === 1 ? "" : "s"} ·{" "}
                {TIER_LABEL[state.tier]} · {formatBytes(plan.totalBytes)}
              </div>

              {!blocked && (
                <div className="text-[13px] font-bold" style={{ color: t.text }}>
                  {methodCopy(plan.method, plan.batches.length)}
                </div>
              )}

              {/* The folder this booking was last saved into is OFFERED, never
                  silently reused — saving into a folder picked weeks ago
                  without saying so is not a nice surprise. */}
              {rememberedFolder && (
                <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: t.sunken }}>
                  <span className="min-w-0 truncate text-[12.5px] font-semibold" style={{ color: t.muted }}>
                    Saving to “{rememberedFolder}” again
                  </span>
                  <button
                    type="button"
                    onClick={forgetRememberedFolder}
                    className="shrink-0 cursor-pointer text-[12px] font-extrabold underline"
                    style={{ color: t.text }}
                  >
                    Change
                  </button>
                </div>
              )}

              <AlertList alerts={alerts} ios={env.ios} theme={t} />

              {state.error && (
                <p className="text-[12.5px] font-bold" style={{ color: t.error }}>
                  {state.error}
                </p>
              )}
            </div>
          )}

          {phase === "running" && plan && (
            <div className="flex flex-col gap-3.5">
              <Progress progress={progress} theme={t} />
              {plan.method === "batchedZip" && (
                <>
                  <PartList
                    parts={plan.batches.map((batch) =>
                      batch.reduce((n, item) => n + item.bytes, 0),
                    )}
                    states={partStates}
                    onDownload={downloadPart}
                    theme={t}
                  />
                  <p className="text-[11.5px] font-semibold" style={{ color: t.muted }}>
                    Don&apos;t refresh until all parts are saved.
                  </p>
                </>
              )}
              <AlertList alerts={alerts} ios={env.ios} theme={t} />
            </div>
          )}

          {phase === "finished" && result && (
            <div className="flex flex-col gap-2 text-[13px] font-semibold" style={{ color: t.muted }}>
              <span style={{ color: t.text }}>
                Saved {result.saved.toLocaleString("en-IN")} photo
                {result.saved === 1 ? "" : "s"}
                {result.folderName ? ` to “${result.folderName}”` : ""}.
              </span>
              {result.skipped > 0 && (
                <span>
                  {result.skipped.toLocaleString("en-IN")} were already there and were skipped.
                </span>
              )}
              {result.failed > 0 && (
                <span style={{ color: t.error }}>
                  {result.failed.toLocaleString("en-IN")} couldn&apos;t be fetched.
                </span>
              )}
              {result.aborted && <span>You stopped this download.</span>}
            </div>
          )}
        </div>

        {/* ── Sticky footer: the primary action is always reachable without
             scrolling, including on a 360×640 viewport. ─────────────────── */}
        <div
          className="shrink-0 border-t px-5 pb-5 pt-3.5"
          style={{ borderColor: t.border, background: t.card }}
        >
          {phase === "plan" && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={!plan?.canProceed}
                onClick={() => void confirm()}
                className="cursor-pointer rounded-full py-3 text-[13px] font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: t.brand, color: t.onBrand }}
              >
                Download {count.toLocaleString("en-IN")} photo{count === 1 ? "" : "s"}
              </button>
              {/* Always present when blocked: the escape hatch that turns a dead
                  end into a next step. The guest sends themselves the link and
                  finishes on a computer. */}
              {blocked && shareUrl && (
                <button
                  type="button"
                  onClick={() => void share()}
                  className="cursor-pointer rounded-full py-3 text-[13px] font-bold"
                  style={{ background: t.sunken, color: t.text, border: `1px solid ${t.border}` }}
                >
                  {copied ? "Link copied" : "Copy gallery link"}
                </button>
              )}
              {blocked && onSelectFewer && (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    onSelectFewer();
                  }}
                  className="cursor-pointer rounded-full py-3 text-[13px] font-bold"
                  style={{ background: t.sunken, color: t.text, border: `1px solid ${t.border}` }}
                >
                  Select fewer photos
                </button>
              )}
              <button
                type="button"
                onClick={close}
                className="cursor-pointer py-1.5 text-[12.5px] font-bold"
                style={{ color: t.muted }}
              >
                Cancel
              </button>
            </div>
          )}

          {phase === "running" && (
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="w-full cursor-pointer rounded-full py-3 text-[13px] font-bold"
              style={{ background: t.sunken, color: t.text, border: `1px solid ${t.border}` }}
            >
              Cancel download
            </button>
          )}

          {phase === "finished" && (
            <button
              type="button"
              onClick={close}
              className="w-full cursor-pointer rounded-full py-3 text-[13px] font-extrabold"
              style={{ background: t.brand, color: t.onBrand }}
            >
              Done
            </button>
          )}
        </div>
      </div>

      {/* Stopping throws away everything fetched so far, so it asks first. */}
      {confirmCancel && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center p-5"
          style={{ background: "rgba(31,26,14,0.55)" }}
          onClick={(e) => {
            e.stopPropagation();
            setConfirmCancel(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[340px] rounded-3xl p-6"
            style={{ background: t.card, boxShadow: t.shadow, ...font }}
          >
            <div className="text-[16px] font-extrabold" style={{ color: t.text }}>
              Cancel this download?
            </div>
            <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5]" style={{ color: t.muted }}>
              {progress
                ? `${progress.done.toLocaleString("en-IN")} of ${progress.total.toLocaleString("en-IN")} photos are done. Stopping now discards anything still in flight.`
                : "Stopping now discards everything fetched so far."}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmCancel(false);
                  cancel();
                }}
                className="cursor-pointer rounded-full py-3 text-[13px] font-extrabold"
                style={{ background: t.error, color: "#fff" }}
              >
                Cancel download
              </button>
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                className="cursor-pointer rounded-full py-3 text-[13px] font-bold"
                style={{ background: t.sunken, color: t.text, border: `1px solid ${t.border}` }}
              >
                Keep downloading
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(body, document.body);
}

function AlertList({
  alerts,
  ios,
  theme: t,
}: {
  alerts: DownloadAlert[];
  ios: boolean;
  theme: DownloadModalTheme;
}) {
  if (alerts.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {alerts.map((alert) => (
        <p
          key={`${alert.id}-${alert.severity}`}
          className="rounded-xl px-3 py-2.5 text-[12px] font-semibold leading-relaxed"
          style={{
            background: alert.severity === "blocking" ? t.errorSoft : t.sunken,
            color: alert.severity === "blocking" ? t.error : t.muted,
          }}
        >
          {alertCopy(alert, { ios })}
        </p>
      ))}
    </div>
  );
}

function Progress({
  progress,
  theme: t,
}: {
  progress: { done: number; total: number; etaSeconds: number | null; throughput: number | null } | null;
  theme: DownloadModalTheme;
}) {
  const done = progress?.done ?? 0;
  const total = progress?.total ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        {/* tabular-nums so the counter keeps a fixed width — proportional digits
            reflow the label on every tick, which reads as jitter. */}
        <span
          className="text-[13px] font-extrabold tabular-nums"
          style={{ color: t.text }}
          aria-live="polite"
        >
          {done.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}
        </span>
        {progress?.etaSeconds != null && (
          <span className="text-[11.5px] font-bold" style={{ color: t.muted }}>
            about {formatEta(progress.etaSeconds)} left
          </span>
        )}
      </div>
      <span className="block h-1.5 w-full overflow-hidden rounded-full" style={{ background: t.sunken }}>
        <span
          className="block h-full rounded-full transition-[width] duration-300 ease-out"
          style={{ background: t.brand, width: total > 0 ? `${pct}%` : "18%" }}
        />
      </span>
      {progress?.throughput != null && (
        <span className="text-[11px] font-semibold" style={{ color: t.muted }}>
          {formatBytes(progress.throughput)}/s
        </span>
      )}
    </div>
  );
}

function PartList({
  parts,
  states,
  onDownload,
  theme: t,
}: {
  parts: number[];
  states: string[];
  onDownload: (index: number) => void;
  theme: DownloadModalTheme;
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {parts.map((bytes, index) => {
        const state = states[index] ?? "pending";
        const isNext = state === "pending" && states.slice(0, index).every((s) => s === "done");
        return (
          <li
            key={index}
            className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
            style={{ background: t.sunken }}
          >
            <span className="text-[12.5px] font-bold" style={{ color: t.text }}>
              Part {index + 1}
              <span className="ml-1.5 font-semibold" style={{ color: t.muted }}>
                {formatBytes(bytes)}
              </span>
            </span>
            {state === "done" ? (
              <span className="text-[12px] font-bold" style={{ color: t.muted }}>
                Saved
              </span>
            ) : state === "active" ? (
              <span className="text-[12px] font-bold" style={{ color: t.muted }}>
                Downloading…
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onDownload(index)}
                disabled={!isNext && state !== "failed"}
                className="cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-extrabold disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: t.brand, color: t.onBrand }}
              >
                {state === "failed" ? "Retry" : "Download"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ${minutes % 60} min`;
}
