"use client";

import { USER_FACING_UPLOAD_ERROR } from "@/lib/r2-upload/errors";
import type { UploadRecord } from "@/lib/r2-upload/types";

export function UploadFailuresPanel({
  failed,
  metadataSaveFailed,
  onRetryFailed,
  onRetryMetadata,
}: {
  failed: UploadRecord[];
  metadataSaveFailed: boolean;
  onRetryFailed: () => void;
  onRetryMetadata: () => void;
}) {
  if (failed.length === 0 && !metadataSaveFailed) return null;

  return (
    <section className="px-6 pb-6 pt-2 sm:px-10">
      <div className="overflow-hidden rounded-xl border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)]">
        <div className="border-b border-[var(--color-brand-danger)]/20 px-5 py-4">
          <div className="flex items-start gap-3">
            <FailIcon size={18} className="mt-0.5 shrink-0 text-[var(--color-brand-danger)]" />
            <div>
              <h3 className="text-[15px] font-bold tracking-tight text-[var(--color-brand-danger)]">
                Some photos didn&apos;t upload
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-brand-danger)]/90">
                {USER_FACING_UPLOAD_ERROR}. Your successful uploads are safe — retry the ones below
                when you&apos;re ready.
              </p>
            </div>
          </div>
        </div>

        {failed.length > 0 && (
          <div className="border-b border-[var(--color-brand-danger)]/15 bg-white px-5 py-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-muted)]">
              Failed photos ({failed.length.toLocaleString("en-IN")})
            </div>
            <ul className="max-h-52 overflow-y-auto rounded-lg border border-[var(--color-brand-border)] divide-y divide-[var(--color-brand-border)]">
              {failed.slice(0, 100).map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-[var(--color-brand-ink)]">{f.filename}</div>
                    {f.folderName && (
                      <div className="truncate text-[12px] text-[var(--color-brand-muted)]">{f.folderName}</div>
                    )}
                  </div>
                  <span className="shrink-0 text-[12px] text-[var(--color-brand-muted)]">
                    {USER_FACING_UPLOAD_ERROR}
                  </span>
                </li>
              ))}
              {failed.length > 100 && (
                <li className="px-3 py-2 text-[12px] text-[var(--color-brand-muted)]">
                  …and {(failed.length - 100).toLocaleString("en-IN")} more
                </li>
              )}
            </ul>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={onRetryFailed}
                className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13.5px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)]"
              >
                <RetryIcon size={14} />
                Re-pick &amp; retry failed photos
              </button>
            </div>
          </div>
        )}

        {metadataSaveFailed && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-5 py-4">
            <p className="text-[13px] text-[var(--color-brand-ink)]">
              Some photos uploaded but couldn&apos;t be saved to your gallery. {USER_FACING_UPLOAD_ERROR}
            </p>
            <button
              type="button"
              onClick={onRetryMetadata}
              className="brand-focus inline-flex h-9 shrink-0 items-center rounded-md border border-[var(--color-brand-danger)]/30 bg-white px-3 text-[12.5px] font-semibold text-[var(--color-brand-danger)]"
            >
              Retry save
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function FailIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  );
}

function RetryIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}
