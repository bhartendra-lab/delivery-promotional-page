"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { dismissDashboardAttention, getDashboardAttention, updateGalleryActivationStatus } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";
import { ATTENTION_MAX_ROWS, attentionDismissKey, mergeAttention, type AttentionRow, type UploadItem } from "@/lib/dashboard-home";
import { IconX } from "@/components/ui/icons";
import { useActiveUploads } from "@/lib/r2-upload/useActiveUploads";
import { BlockError, BlockShell } from "./BlockShell";
import { useLoader } from "./useLoader";

/**
 * Needs attention: a short list (6 rows, and every row once View all is
 * opened, in place), each with one clear action,
 * or one calm line when nothing needs doing. Events needing attention come
 * from the server; uploads running in this browser are added on top. The cross
 * on a row closes it for good, for that event only (stored on its booking).
 */
export function NeedsAttention({ onChanged }: { onChanged?: () => void }) {
  const load = useCallback(() => getDashboardAttention(), []);
  const { state, reload } = useLoader(load);
  const active = useActiveUploads();
  const uploads = useMemo<UploadItem[]>(
    () => active.map((u) => ({ booking_id: u.bookingId, name: u.name, paused: u.paused, percent: u.percent })),
    [active],
  );
  // Rows closed in this visit, hidden at once while the server records it.
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState(false);
  const merged = useMemo(() => {
    if (state.status !== "ok") return null;
    const items = state.data.items.filter((i) => !closed.has(`${attentionDismissKey(i)}:${i.booking_id}`));
    const total = Math.max(items.length, state.data.total - (state.data.items.length - items.length));
    return mergeAttention(items, uploads, expanded ? Number.POSITIVE_INFINITY : ATTENTION_MAX_ROWS, total);
  }, [state, uploads, closed, expanded]);

  // Reactivate is a one tap action with a confirm step on the row, so a stray tap cannot put a gallery live.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  async function dismiss(row: AttentionRow) {
    if (!row.dismissKey) return;
    setRowError(null);
    setClosed((prev) => new Set(prev).add(row.key));
    try {
      await dismissDashboardAttention(row.booking_id, row.dismissKey);
      reload();
    } catch (err) {
      setClosed((prev) => {
        const next = new Set(prev);
        next.delete(row.key);
        return next;
      });
      setRowError({ id: row.booking_id, message: err instanceof Error ? err.message : "Could not remove this. Try again." });
    }
  }

  async function reactivate(row: AttentionRow) {
    setBusyId(row.booking_id);
    setRowError(null);
    try {
      await updateGalleryActivationStatus(row.booking_id, true);
      setConfirmId(null);
      reload();
      onChanged?.();
    } catch (err) {
      setRowError({ id: row.booking_id, message: err instanceof Error ? err.message : "Could not reactivate. Try again." });
    } finally {
      setBusyId(null);
    }
  }

  // Nothing to act on: the block takes no room at all rather than saying so.
  if (merged && merged.rows.length === 0) return null;

  return (
    <BlockShell
      title="Needs attention"
      action={
        merged && (expanded || merged.hidden > 0) ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="brand-focus text-sm font-semibold text-[var(--color-brand-navy)] underline-offset-2 hover:underline"
          >
            {expanded ? "Show less" : `View all (${merged.hidden} more)`}
          </button>
        ) : undefined
      }
    >
      {state.status === "loading" ? (
        <AttentionSkeleton />
      ) : state.status === "error" ? (
        <BlockError message="Could not load what needs your attention." onRetry={reload} />
      ) : (
        <ul className="divide-y divide-[var(--color-brand-border)] overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)]">
          {merged?.rows.map((row) => (
            <li key={row.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/dashboard/events/${encodeURIComponent(row.booking_id)}`} className="brand-focus block truncate text-sm font-semibold text-[var(--color-brand-ink)] hover:underline">
                  {row.name}
                </Link>
                <p className="type-meta">{row.text}</p>
                {rowError?.id === row.booking_id && (
                  <p role="alert" className="mt-0.5 text-xs text-[var(--color-brand-danger)]">
                    {rowError.message}
                  </p>
                )}
              </div>
              {row.action && "reactivate" in row.action ? (
                confirmId === row.booking_id ? (
                  <span className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === row.booking_id}
                      onClick={() => void reactivate(row)}
                      className="brand-focus inline-flex h-8 items-center rounded-lg bg-[var(--color-brand-navy)] px-3 text-xs font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:opacity-60"
                    >
                      {busyId === row.booking_id ? "Reactivating…" : "Make it live again"}
                    </button>
                    <button type="button" onClick={() => setConfirmId(null)} className="brand-focus text-xs font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      trackEvent("dashboard_attention_clicked", { kind: row.kind });
                      setConfirmId(row.booking_id);
                    }}
                    className={ACTION_CLASS}
                  >
                    {row.action.label}
                  </button>
                )
              ) : row.action ? (
                <Link href={row.action.href} onClick={() => trackEvent("dashboard_attention_clicked", { kind: row.kind })} className={ACTION_CLASS}>
                  {row.action.label}
                </Link>
              ) : null}
              {row.dismissKey && (
                <button
                  type="button"
                  onClick={() => void dismiss(row)}
                  aria-label={`Remove this from Needs attention for ${row.name}`}
                  title="Don't show this again"
                  className="brand-focus -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-brand-muted)] transition-colors hover:bg-[var(--color-brand-border)] hover:text-[var(--color-brand-ink)]"
                >
                  <IconX size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </BlockShell>
  );
}

const ACTION_CLASS =
  "brand-focus inline-flex h-8 shrink-0 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-3 text-xs font-semibold text-[var(--color-brand-ink)] transition-colors hover:border-[var(--color-brand-outline)]";

function AttentionSkeleton() {
  return (
    <div className="divide-y divide-[var(--color-brand-border)] overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)]" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="space-y-2">
            <div className="skeleton h-3.5 w-40 rounded" />
            <div className="skeleton h-3 w-56 rounded" />
          </div>
          <div className="skeleton h-8 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
