"use client";

import type { EngineProgress } from "@/lib/r2-upload/types";

const RING_SIZE = 220;
const RING_STROKE = 4;
const RING_R = RING_SIZE / 2 - RING_STROKE * 2;
const RING_CIRC = 2 * Math.PI * RING_R;

export function UploadProgress({
  progress,
  onCancel,
  onTogglePause,
  autoPauseReason = null,
  onRecheckStorage,
  storageRechecking = false,
}: {
  progress: EngineProgress;
  onCancel: () => void;
  onTogglePause: () => void;
  /**
   * Non-null when the run was auto-paused for a storage overrun (vs a manual
   * user pause). Swaps in storage-specific copy and gates Resume until a
   * re-check confirms space was freed.
   */
  autoPauseReason?: string | null;
  /** Manual "Re-check storage" action, shown while auto-paused. */
  onRecheckStorage?: () => void;
  /** True while a re-check is in flight (disables the button + shows a spinner). */
  storageRechecking?: boolean;
}) {
  const dashOffset = RING_CIRC * (1 - progress.percent / 100);
  const paused = progress.paused;
  const playState = paused ? "paused" : "running";
  // Storage auto-pause: distinct copy + Resume stays disabled until re-checked.
  const storagePaused = paused && autoPauseReason !== null;

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
          <h3 className="mt-6 text-[22px] font-bold leading-tight tracking-tight text-[var(--color-brand-ink)]">
            {paused
              ? `Upload paused at ${progress.photosDone.toLocaleString("en-IN")} of ${progress.photosTotal.toLocaleString("en-IN")} photos`
              : progress.isSavingMetadata
              ? "Saving photo metadata…"
              : `Uploading ${progress.photosDone.toLocaleString("en-IN")} of ${progress.photosTotal.toLocaleString("en-IN")} photos`}
          </h3>
          <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--color-brand-muted)]">
            {storagePaused ? (
              <>
                You&apos;ve used all available storage on your plan. Delete older
                photos or upgrade your plan, then{" "}
                <strong className="text-[var(--color-brand-ink)]">re-check storage</strong> to
                resume.
              </>
            ) : paused ? (
              <>
                Transfer is on hold — the workspace is unlocked.{" "}
                <strong className="text-[var(--color-brand-ink)]">Resume</strong> to continue.
              </>
            ) : (
              <>
                <strong className="text-[var(--color-brand-ink)]">{progress.etaLabel}</strong>
                {progress.speedLabel && <> · upload speed {progress.speedLabel}</>}
              </>
            )}
          </p>
        </div>

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
                      <CheckIcon size={14} />
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
                  <FolderIcon
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
            {paused ? <LockIcon size={15} /> : <ClockIcon size={15} />}
            <span>
              {paused
                ? "Make your changes, then resume — nothing transfers while paused."
                : "Keep this tab open. We'll let you know when it's done — feel free to grab some chai."}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onCancel}
              className="brand-focus rounded-md px-3 py-2 text-[12.5px] font-semibold text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-surface)] hover:text-[var(--color-brand-ink)]"
            >
              Cancel upload
            </button>
            {storagePaused && onRecheckStorage && (
              <button
                type="button"
                onClick={onRecheckStorage}
                disabled={storageRechecking}
                className="brand-focus inline-flex items-center gap-1.5 rounded-md border border-[var(--color-brand-border)] bg-white px-4 py-2 text-[12.5px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {storageRechecking ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
                    Checking…
                  </>
                ) : (
                  "Re-check storage"
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onTogglePause}
              // While storage-auto-paused, Resume stays disabled until a re-check
              // confirms space was freed — otherwise it resumes into an instant re-pause.
              disabled={storagePaused}
              title={storagePaused ? "Free up storage and re-check before resuming." : undefined}
              className="brand-focus inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              style={
                paused
                  ? { background: "var(--color-brand-navy)", color: "#FFFFFF", borderColor: "var(--color-brand-navy)" }
                  : { background: "#FFFFFF", color: "var(--color-brand-ink)", borderColor: "var(--color-brand-border)" }
              }
            >
              {paused ? (
                <>
                  <PlayIcon size={14} /> Resume upload
                </>
              ) : (
                <>
                  <PauseIcon size={14} /> Pause upload
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function FolderIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function CheckIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="5 12 10 17 19 7" />
    </svg>
  );
}

function ClockIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}

function LockIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="1.6" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function PauseIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6.5" y="5" width="3.5" height="14" rx="1" />
      <rect x="14" y="5" width="3.5" height="14" rx="1" />
    </svg>
  );
}

function PlayIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M7 5l12 7-12 7V5z" />
    </svg>
  );
}

