"use client";

import { useState } from "react";
import type { EngineProgress } from "@/lib/r2-upload/types";
import type { UploadRecord } from "@/lib/r2-upload/types";

const RING_SIZE = 220;
const RING_STROKE = 4;
const RING_R = RING_SIZE / 2 - RING_STROKE * 2;
const RING_CIRC = 2 * Math.PI * RING_R;

export function UploadProgress({
  progress,
  failed,
  onCancel,
  onRetryFailed,
  onRetryMetadata,
}: {
  progress: EngineProgress;
  failed: UploadRecord[];
  onCancel: () => void;
  /** Opens the upload modal so the user can re-select the failed files. */
  onRetryFailed: () => void;
  /** Re-runs the batch create-media call. */
  onRetryMetadata: () => void;
}) {
  const dashOffset = RING_CIRC * (1 - progress.percent / 100);
  const [showFailed, setShowFailed] = useState(false);

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
                style={{ width: RING_SIZE - 56, height: RING_SIZE - 56 }}
              >
                <div className="brand-pulse flex h-full w-full items-center justify-center rounded-full">
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
                className="absolute -bottom-2.5 -right-2.5 inline-flex h-14 w-14 items-center justify-center rounded-full border border-[var(--color-brand-border)] bg-white text-[17px] font-bold tabular-nums text-[var(--color-brand-navy)] shadow-[0_2px_8px_rgba(42,34,24,0.06)]"
              >
                {progress.percent}%
              </div>
            </div>
          </div>
          <h3 className="mt-6 text-[22px] font-bold leading-tight tracking-tight text-[var(--color-brand-ink)]">
            {progress.isSavingMetadata
              ? "Saving photo metadata…"
              : `Uploading ${progress.photosDone.toLocaleString("en-IN")} of ${progress.photosTotal.toLocaleString("en-IN")} photos`}
          </h3>
          <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--color-brand-muted)]">
            <strong className="text-[var(--color-brand-ink)]">{progress.etaLabel}</strong>
            {progress.speedLabel && <> · upload speed {progress.speedLabel}</>}
          </p>

          {/* Failed pill + expander */}
          {(progress.photosFailed > 0 || failed.length > 0) && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowFailed((v) => !v)}
                className="brand-focus inline-flex items-center gap-2 rounded-full bg-[var(--color-brand-danger-soft)] px-3 py-1 text-[12px] font-semibold text-[var(--color-brand-danger)]"
              >
                <FailIcon size={12} />
                Failed ({Math.max(progress.photosFailed, failed.length)})
                <CaretIcon size={10} open={showFailed} />
              </button>
              {showFailed && (
                <div className="mx-auto mt-3 max-w-[520px] overflow-hidden rounded-lg border border-[var(--color-brand-border)] bg-white text-left">
                  <ul className="max-h-48 overflow-y-auto divide-y divide-[var(--color-brand-border)]">
                    {failed.slice(0, 50).map((f) => (
                      <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[12px]">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-[var(--color-brand-ink)]">{f.filename}</div>
                          {f.lastError && (
                            <div className="truncate text-[var(--color-brand-muted)]">{f.lastError}</div>
                          )}
                        </div>
                      </li>
                    ))}
                    {failed.length > 50 && (
                      <li className="px-3 py-2 text-[12px] text-[var(--color-brand-muted)]">
                        …and {failed.length - 50} more
                      </li>
                    )}
                  </ul>
                  <div className="border-t border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={onRetryFailed}
                      className="brand-focus inline-flex h-8 items-center rounded-md border border-[var(--color-brand-border)] bg-white px-3 text-[12px] font-semibold text-[var(--color-brand-ink)]"
                    >
                      Re-pick & retry
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {progress.metadataSaveError && (
            <div className="mx-auto mt-4 max-w-[520px] rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-3 py-2 text-left text-[12px] text-[var(--color-brand-danger)]">
              <div className="font-semibold">Couldn&apos;t save metadata</div>
              <div className="mt-1 break-all">{progress.metadataSaveError}</div>
              <button
                type="button"
                onClick={onRetryMetadata}
                className="brand-focus mt-2 inline-flex h-8 items-center rounded-md border border-[var(--color-brand-danger)]/30 bg-white px-3 text-[12px] font-semibold text-[var(--color-brand-danger)]"
              >
                Retry save
              </button>
            </div>
          )}
        </div>

        {/* Per-folder progress */}
        <div className="px-8 pb-2 pt-5">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-muted)]">
            Folder progress
          </div>
          {progress.folders.map((f, i) => {
            const done = f.done >= f.count && f.count > 0;
            const pct = f.count === 0 ? 0 : Math.round((f.done / f.count) * 100);
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
        <div className="flex items-center justify-between border-t border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-8 py-3.5">
          <div className="flex items-center gap-2.5 text-[12.5px] text-[var(--color-brand-muted)]">
            <ClockIcon size={15} />
            <span>Keep this tab open. We&apos;ll let you know when it&apos;s done — feel free to grab some chai.</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="brand-focus shrink-0 rounded-md px-2 py-1.5 text-[12.5px] font-semibold text-[var(--color-brand-navy)] hover:bg-[var(--color-brand-navy-soft)]"
          >
            Cancel upload
          </button>
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

function FailIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  );
}

function CaretIcon({ size, open }: { size: number; open: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms" }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
