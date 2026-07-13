"use client";

import { useEffect, useRef, useState } from "react";
import type { ServiceType } from "@/lib/types";
import { isStorageBasedPlan } from "@/lib/types";
import { TypeConfirmModal, type ConfirmAction } from "./TypeConfirmModal";
import { IconArchive, IconCaretDown, IconLock } from "./icons";

/**
 * Pill state, derived by the workspace from the booking's DB fields.
 *
 * Events are LIVE from creation — there is no publish/unpublish and no
 * republish. Uploading media generates embeddings immediately and the backend
 * re-clusters + rebuilds the download zip on its own, so the pill is a status
 * indicator with exactly one control: deactivate/reactivate.
 *
 *   live        — gallery live and in sync → green pill, dropdown → Deactivate
 *   syncing     — new media is being processed automatically (embeddings →
 *                 face search → zip); amber status, resolves on its own
 *   deactivated — temporarily off → dropdown → Activate
 */
export type LivePillState = "live" | "syncing" | "deactivated";

type Props = {
  state: LivePillState;
  /** True while an upload is actively running — the pill is shown but inert. */
  disabled?: boolean;
  unsyncedCount?: number;
  /** The booking's own plan. Archive is offered only for Monthly/Yearly. */
  serviceType?: ServiceType | null;
  onActivate: () => Promise<void>;
  onDeactivate: () => Promise<void>;
  /** Archive this booking (deactivate + start the 7-day expiry countdown). */
  onArchive?: () => Promise<void>;
};

export function LivePill({
  state,
  disabled = false,
  unsyncedCount = 0,
  serviceType = null,
  onActivate,
  onDeactivate,
  onArchive,
}: Props) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<ConfirmAction | null>(null);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Archive is a storage-plan-only control; the pill only ever renders while the
  // booking is published, so no extra status gate is needed here.
  const canArchive = !!onArchive && isStorageBasedPlan(serviceType);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function runConfirm() {
    if (!confirming) return;
    setBusy(true);
    try {
      if (confirming === "activate") await onActivate();
      else if (confirming === "archive") await onArchive?.();
      else await onDeactivate();
      setConfirming(null);
    } finally {
      setBusy(false);
    }
  }

  const modal = confirming ? (
    <TypeConfirmModal
      action={confirming}
      // Archive is a simple confirm (no typing); activate/deactivate stay typed.
      requireTyping={confirming !== "archive"}
      busy={busy}
      title={CONFIRM_COPY[confirming].title}
      description={CONFIRM_COPY[confirming].description}
      warningText={CONFIRM_COPY[confirming].warning}
      onConfirm={runConfirm}
      onCancel={() => setConfirming(null)}
    />
  ) : null;

  // The Archive row shared by every dropdown variant (all render while published).
  const archiveRow = canArchive ? (
    <button
      type="button"
      onClick={() => {
        setOpen(false);
        setConfirming("archive");
      }}
      className="flex w-full items-start gap-2.5 border-t border-[var(--color-brand-border)] px-3.5 py-3 text-left hover:bg-[var(--color-brand-bg)]"
    >
      <IconArchive size={15} className="mt-px shrink-0 text-[var(--color-brand-warning)]" />
      <span className="flex-1">
        <span className="block text-[13px] font-semibold text-[var(--color-brand-ink)]">Archive</span>
        <span className="mt-px block text-[11.5px] text-[var(--color-brand-muted)]">
          Hide from guests and start the 7-day countdown to clear
        </span>
      </span>
    </button>
  ) : null;

  // While uploading, show the current status inert (no actions).
  if (disabled) {
    const word = DISABLED_WORD[state];
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-brand-border)] bg-[#F2F0EB] py-1.5 pl-3 pr-3 opacity-75">
        <IconLock size={12} className="text-[#B5ADA4]" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#B5ADA4]">Live</span>
        <span className="text-[13px] font-semibold text-[var(--color-brand-muted)]">{word}</span>
      </span>
    );
  }

  // ── New media processing → amber "Syncing" status with dropdown ──────────
  // Purely informational: embeddings run as media uploads, the booking
  // re-clusters and the zip rebuilds automatically, and the workspace polls
  // until the backend reports in-sync. The only action here is Deactivate.
  if (state === "syncing") {
    return (
      <>
        <div className="relative" ref={wrapRef}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="live-pill-pulse-amber brand-focus inline-flex items-center gap-2 rounded-lg border border-[#F0D9B5] bg-[var(--color-brand-warning-soft)] px-3 py-1.5 text-[var(--color-brand-warning)]"
          >
            <IconClock size={14} />
            <span className="text-[13px] font-bold">Syncing</span>
            <span className="text-[11px] font-semibold text-[var(--color-brand-warning)]/60">
              {unsyncedCount > 0 ? `${unsyncedCount.toLocaleString("en-IN")} new` : "new media"}
            </span>
            <IconCaretDown size={13} className="ml-px opacity-70" />
          </button>

          {open && (
            <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[266px] overflow-hidden rounded-[10px] border border-[var(--color-brand-border)] bg-white shadow-[0_8px_28px_rgba(42,34,24,0.14)]">
              <div className="border-b border-[var(--color-brand-border)] px-3.5 pb-2 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-muted)]">
                Gallery availability
              </div>
              <div className="border-b border-[var(--color-brand-border)] px-3.5 py-3 text-[11.5px] leading-relaxed text-[var(--color-brand-muted)]">
                New photos are being added to guest face search and the download
                zip automatically. This usually takes a few minutes.
              </div>
              <button
                type="button"
                onClick={() => { setOpen(false); setConfirming("deactivate"); }}
                className="flex w-full items-start gap-2.5 px-3.5 py-3 text-left hover:bg-[var(--color-brand-bg)]"
              >
                <span className="mt-[5px] h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--color-brand-danger)" }} />
                <span className="flex-1">
                  <span className="block text-[13px] font-semibold text-[var(--color-brand-ink)]">Deactivate</span>
                  <span className="mt-px block text-[11.5px] text-[var(--color-brand-muted)]">Temporarily take the gallery offline</span>
                </span>
              </button>
              {archiveRow}
            </div>
          )}
        </div>
        {modal}
      </>
    );
  }

  // ── Live / Deactivated → status pill + dropdown ───────────────────────────
  const isDeactivated = state === "deactivated";
  const meta = isDeactivated
    ? { word: "Deactivated", dot: "var(--color-brand-warning)", fg: "var(--color-brand-warning)", tint: "var(--color-brand-warning-soft)", border: "#F0D9B5" }
    : { word: "Active", dot: "var(--color-brand-success)", fg: "var(--color-brand-ink)", tint: "#FFFFFF", border: "var(--color-brand-border)" };
  const nextAction: ConfirmAction = isDeactivated ? "activate" : "deactivate";
  const nextLabel = isDeactivated ? "Activate" : "Deactivate";
  const nextDesc = isDeactivated
    ? "Bring the gallery back online for guests"
    : "Temporarily take the gallery offline";
  const nextDot = isDeactivated ? "var(--color-brand-success)" : "var(--color-brand-danger)";

  return (
    <>
      <div className="relative" ref={wrapRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="brand-focus inline-flex items-center gap-2 rounded-full border py-1.5 pl-3 pr-2.5"
          style={{ background: meta.tint, borderColor: meta.border }}
        >
          <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: meta.dot }} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#B5ADA4]">Live</span>
          <span className="text-[13px] font-semibold" style={{ color: meta.fg }}>{meta.word}</span>
          <IconCaretDown size={13} className="ml-px text-[var(--color-brand-muted)]" />
        </button>

        {open && (
          <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[266px] overflow-hidden rounded-[10px] border border-[var(--color-brand-border)] bg-white shadow-[0_8px_28px_rgba(42,34,24,0.14)]">
            <div className="border-b border-[var(--color-brand-border)] px-3.5 pb-2 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-muted)]">
              Gallery availability
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirming(nextAction);
              }}
              className="flex w-full items-start gap-2.5 px-3.5 py-3 text-left hover:bg-[var(--color-brand-bg)]"
            >
              <span className="mt-[5px] h-2 w-2 shrink-0 rounded-full" style={{ background: nextDot }} />
              <span className="flex-1">
                <span className="block text-[13px] font-semibold text-[var(--color-brand-ink)]">{nextLabel}</span>
                <span className="mt-px block text-[11.5px] text-[var(--color-brand-muted)]">{nextDesc}</span>
              </span>
            </button>
            {archiveRow}
          </div>
        )}
      </div>
      {modal}
    </>
  );
}

const CONFIRM_COPY: Record<ConfirmAction, { title: string; description: string; warning: string | null }> = {
  activate: {
    title: "Activate gallery?",
    description: "This brings the gallery back online. Guests will be able to open the shared link again immediately.",
    warning: null,
  },
  deactivate: {
    title: "Deactivate gallery?",
    description:
      "This temporarily takes the gallery offline. Guests who open the link see an “unavailable” message until you reactivate. Your media and design are kept.",
    warning: "Any guests currently viewing the gallery will lose access immediately.",
  },
  archive: {
    title: "Archive this event?",
    description:
      "This deactivates the gallery and hides it from guests. You can restore it later, within 7 days, before its media is permanently cleared.",
    warning: null,
  },
  // Not triggered from the pill, but present so the copy map stays exhaustive.
  delete: {
    title: "Clear this event's data?",
    description: "This permanently removes every photo and all face-search data for this event.",
    warning: "Only the cover photo is kept. This cannot be undone.",
  },
};

const DISABLED_WORD: Record<LivePillState, string> = {
  live: "Active",
  syncing: "Active",
  deactivated: "Deactivated",
};

function IconClock({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}
