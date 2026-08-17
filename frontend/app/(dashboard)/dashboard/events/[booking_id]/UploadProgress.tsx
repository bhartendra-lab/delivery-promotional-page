"use client";

import { useState } from "react";
import type { EngineProgress } from "@/lib/r2-upload/types";
import { useUploadStalled } from "@/lib/r2-upload/useUploadStall";
import { IconFolder, IconCheck, IconClock, IconLock, IconPause, IconPlay, IconWarning } from "./icons";

const RING_SIZE = 220;
const RING_STROKE = 4;
const RING_R = RING_SIZE / 2 - RING_STROKE * 2;
const RING_CIRC = 2 * Math.PI * RING_R;

export function UploadProgress({
  progress,
  onCancel,
  onTogglePause,
}: {
  progress: EngineProgress;
  /** Resolves once the run has fully settled (the caller shows the summary). */
  onCancel: () => void | Promise<void>;
  onTogglePause: () => void;
}) {
  const dashOffset = RING_CIRC * (1 - progress.percent / 100);
  const paused = progress.paused;
  const playState = paused ? "paused" : "running";
  /**
   * Cancelling is not instant: the engine waits for in-flight PUTs to settle
   * and flushes their metadata before it lets go. That's correct, but the
   * button used to sit there looking untouched the whole time. This is the
   * optimistic acknowledgement — it flips the moment the click lands and is
   * driven by nothing but the click.
   */
  const [cancelling, setCancelling] = useState(false);
  // Nothing has moved for a while (most often: this tab was backgrounded and
  // the browser throttled it). Say so instead of spinning a stalled ring.
  const stalled = useUploadStalled(progress.isUploading, paused, progress.photosDone);

  // No reset needed when the run ends: this card only renders while the engine
  // is active, so it unmounts (taking `cancelling` with it) the moment cancel
  // resolves.

  return (
    <section className="px-6 pb-12 pt-10 sm:px-10">
      <div className="overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-white">
        {/* Hero — animated brand mark */}
        <div
          className="border-b border-[var(--color-brand-border)] px-8 pb-7 pt-10 text-center"
          style={{
            background: "radial-gradient(circle at 50% 30%, #FDF7EC 0%, #FFFFFF 70%)",
          }}
        >
          <div className="inline-block">
            <div className="relative inline-flex items-center justify-center" style={{ width: RING_SIZE, height: RING_SIZE }}>
              <svg
                width={RING_SIZE}
                height={RING_SIZE}
                className="absolute inset-0"
                style={{ transform: "rotate(-90deg)" }}
              >
                <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} fill="none" stroke="#EFE7D6" strokeWidth={RING_STROKE} />
                <circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_R}
                  fill="none"
                  stroke="var(--color-brand-navy)"
                  strokeWidth={RING_STROKE}
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRC}
                  strokeDashoffset={dashOffset}
                  style={{ transition: "stroke-dashoffset 600ms ease" }}
                />
              </svg>
              <div
                className="brand-spin flex items-center justify-center"
                style={{ width: RING_SIZE - 56, height: RING_SIZE - 56, animationPlayState: playState }}
              >
                <div
                  className="brand-pulse flex h-full w-full items-center justify-center rounded-full"
                  style={{ animationPlayState: playState }}
                >
                  <img
                    src="/vyavasth-icon.svg"
                    alt=""
                    aria-hidden="true"
                    width={RING_SIZE - 80}
                    height={RING_SIZE - 80}
                  />
                </div>
              </div>
              <div
                className="absolute -bottom-2.5 -right-2.5 inline-flex h-14 w-14 items-center justify-center rounded-full border border-[var(--color-brand-border)] bg-white text-[17px] font-bold tabular-nums shadow-[0_2px_8px_rgba(42,34,24,0.06)]"
                style={{ color: paused ? "var(--color-brand-muted)" : "var(--color-brand-navy)" }}
              >
                {progress.percent}%
              </div>
            </div>
          </div>
          {/* Headline follows the engine and nothing else — the moment it says
              paused, this says paused. (It used to wait on a storage
              recalculation that has nothing to do with the pause itself.) */}
          <h3 className="mt-6 text-[22px] font-bold leading-tight tracking-tight text-[var(--color-brand-ink)]">
            {cancelling
              ? "Stopping the upload…"
              : paused
              ? `Paused at ${progress.photosDone.toLocaleString("en-IN")} of ${progress.photosTotal.toLocaleString("en-IN")} photos`
              : progress.isSavingMetadata
              ? "Filing the last photos…"
              : `Uploading ${progress.photosDone.toLocaleString("en-IN")} of ${progress.photosTotal.toLocaleString("en-IN")} photos`}
          </h3>
          <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--color-brand-muted)]">
            {cancelling ? (
              <>Finishing the photos already in flight so none are left half-uploaded.</>
            ) : paused ? (
              <>
                Nothing is transferring right now.{" "}
                <strong className="text-[var(--color-brand-ink)]">Resume</strong> whenever you&apos;re
                ready — we pick up exactly where we stopped.
              </>
            ) : stalled ? (
              <>Nothing has moved for a while — browsers slow down tabs left in the background.</>
            ) : (
              <>
                <strong className="text-[var(--color-brand-ink)]">{progress.etaLabel}</strong>
                {progress.speedLabel && <> · {progress.speedLabel}</>}
              </>
            )}
          </p>
        </div>

        {/* Uploading without the studio's mark. The watermark is baked into the
            pixels at upload time, so this can't be repaired afterwards by
            fixing the setting — the studio has to know now, while there's
            still the option to stop and re-upload. */}
        {progress.watermarkWarning && (
          <div className="flex items-start gap-2.5 border-b border-[var(--color-brand-border)] bg-[var(--color-brand-warning-soft)] px-8 py-3.5">
            <IconWarning size={15} className="mt-0.5 shrink-0 text-[var(--color-brand-warning)]" />
            <p className="text-[12.5px] leading-relaxed text-[var(--color-brand-ink)]">
              {progress.watermarkWarning}{" "}
              <span className="text-[var(--color-brand-muted)]">
                Photos already uploaded keep whatever mark they were uploaded with.
              </span>
            </p>
          </div>
        )}

        {/* Per-folder progress */}
        <div className="px-8 pb-2 pt-5">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-muted)]">
            Folder progress
          </div>
          {progress.folders.map((f, i) => {
            // Count failed files as "resolved" too — they'll be retried silently on
            // the next folder re-selection, so the folder shouldn't spin forever.
            const resolved = f.done + f.failed;
            const done = resolved >= f.count && f.count > 0;
            const pct = f.count === 0 ? 0 : Math.round((resolved / f.count) * 100);
            return (
              <div key={`${f.name}-${i}`} className="border-b border-[var(--color-brand-border)] py-3.5 last:border-b-0">
                <div className="mb-2 flex items-center gap-3">
                  {done ? (
                    <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-success-soft)] text-[var(--color-brand-success)]">
                      <IconCheck size={14} />
                    </span>
                  ) : (
                    <span
                      className="brand-row-spin inline-block h-[22px] w-[22px] shrink-0 rounded-full"
                      style={{
                        border: "2px solid var(--color-brand-border)",
                        borderTopColor: "var(--color-brand-navy)",
                        animationPlayState: playState,
                      }}
                    />
                  )}
                  <IconFolder
                    size={16}
                    className={done ? "text-[var(--color-brand-muted)]" : "text-[var(--color-brand-navy)]"}
                  />
                  <span className="flex-1 text-[13.5px] font-semibold text-[var(--color-brand-ink)]">{f.name}</span>
                  <span className="text-[12.5px] tabular-nums text-[var(--color-brand-muted)]">
                    {f.done.toLocaleString("en-IN")} / {f.count.toLocaleString("en-IN")}
                    {done && <span className="ml-2 font-semibold text-[var(--color-brand-success)]">Done</span>}
                  </span>
                </div>
                <div className="ml-[34px] h-[3px] overflow-hidden rounded-full bg-[#F2F0EB]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: done ? "var(--color-brand-success)" : "var(--color-brand-navy)",
                      transition: "width 600ms ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex flex-col items-start justify-between gap-3 border-t border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-8 py-3.5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5 text-[12.5px] text-[var(--color-brand-muted)]">
            {paused ? <IconLock size={15} /> : <IconClock size={15} />}
            <span>
              {paused
                ? "Paused. Rename, reorder, delete folders — then hit resume."
                : "Keep this tab open and go do something else — the upload follows you around the studio."}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setCancelling(true);
                void onCancel();
              }}
              disabled={cancelling}
              className="brand-focus rounded-md px-3 py-2 text-[12.5px] font-semibold text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-hover)] hover:text-[var(--color-brand-ink)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cancelling ? "Stopping…" : "Stop upload"}
            </button>
            <button
              type="button"
              onClick={onTogglePause}
              disabled={cancelling}
              className="brand-focus inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              style={
                paused
                  ? { background: "var(--color-brand-navy)", color: "#FFFFFF", borderColor: "var(--color-brand-navy)" }
                  : { background: "#FFFFFF", color: "var(--color-brand-ink)", borderColor: "var(--color-brand-border)" }
              }
            >
              {paused ? (
                <>
                  <IconPlay size={14} /> Resume upload
                </>
              ) : (
                <>
                  <IconPause size={14} /> Pause upload
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}


