"use client";

import { useEffect, useRef, useState } from "react";
import { TypeConfirmModal, type ConfirmAction } from "./TypeConfirmModal";
import { IconBroadcast, IconCaretDown, IconLock, IconWarning } from "./icons";

/**
 * Pill state, derived by the workspace from the booking's DB fields:
 *   empty       — no media yet → disabled "Unpublished" + lock
 *   publish     — media ready, never published → pulsing Publish
 *   publishing  — embeddings running → disabled "Publishing…" (status stays unpublished)
 *   published   — live + in sync → Published pill, dropdown → Deactivate
 *   republish   — live + new media added → amber Republish
 *   deactivated — temporarily off → Deactivated pill, dropdown → Activate
 */
export type LivePillState =
  | "empty"
  | "publish"
  | "publishing"
  | "published"
  | "republish"
  | "deactivated";

type Props = {
  state: LivePillState;
  /** True while an upload is actively running — the pill is shown but inert. */
  disabled?: boolean;
  unsyncedCount?: number;
  onPublish: () => Promise<void>;
  onRepublish: () => Promise<void>;
  onActivate: () => Promise<void>;
  onDeactivate: () => Promise<void>;
};

export function LivePill({
  state,
  disabled = false,
  unsyncedCount = 0,
  onPublish,
  onRepublish,
  onActivate,
  onDeactivate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<ConfirmAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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
      if (confirming === "publish") await onPublish();
      else if (confirming === "republish") await onRepublish();
      else if (confirming === "activate") await onActivate();
      else await onDeactivate();
      setConfirming(null);
    } finally {
      setBusy(false);
    }
  }

  const modal = confirming ? (
    <TypeConfirmModal
      action={confirming}
      busy={busy}
      title={CONFIRM_COPY[confirming].title}
      description={CONFIRM_COPY[confirming].description}
      warningText={CONFIRM_COPY[confirming].warning}
      onConfirm={runConfirm}
      onCancel={() => setConfirming(null)}
    />
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

  // ── No media → disabled Unpublished + tooltip ─────────────────────────────
  if (state === "empty") {
    return (
      <div className="relative" onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}>
        <button
          type="button"
          disabled
          className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-[var(--color-brand-border)] bg-[#F2F0EB] py-1.5 pl-3 pr-3 opacity-80"
        >
          <IconLock size={12} className="text-[#B5ADA4]" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#B5ADA4]">Live</span>
          <span className="text-[13px] font-semibold text-[var(--color-brand-muted)]">Unpublished</span>
        </button>
        {tip && <Tooltip>Upload media to this event before publishing the gallery to guests.</Tooltip>}
      </div>
    );
  }

  // ── Embeddings running → Publishing… ──────────────────────────────────────
  if (state === "publishing") {
    return (
      <div className="relative" onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}>
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-brand-border)] bg-white py-1.5 pl-3 pr-3.5">
          <span className="h-3 w-3 animate-spin rounded-full border-[2px] border-[var(--color-brand-navy)]/30 border-t-[var(--color-brand-navy)]" />
          <span className="text-[13px] font-semibold text-[var(--color-brand-ink)]">Publishing…</span>
        </span>
        {tip && <Tooltip>The AI gallery is getting ready — we’ll notify you once it’s live for guests.</Tooltip>}
      </div>
    );
  }

  // ── Media ready, never published → pulsing Publish ────────────────────────
  if (state === "publish") {
    return (
      <>
        <button
          type="button"
          onClick={() => setConfirming("publish")}
          className="live-pill-pulse brand-focus inline-flex items-center gap-2 rounded-lg border border-[var(--color-brand-navy)] bg-[var(--color-brand-navy)] px-4 py-1.5 text-white hover:bg-[var(--color-brand-navy-deep)]"
        >
          <IconBroadcast size={14} className="text-white/85" />
          <span className="text-[13px] font-bold">Publish</span>
        </button>
        {modal}
      </>
    );
  }

  // ── Published + new media → amber Republish ───────────────────────────────
  if (state === "republish") {
    return (
      <>
        <button
          type="button"
          onClick={() => setConfirming("republish")}
          className="live-pill-pulse-amber brand-focus inline-flex items-center gap-2 rounded-lg border border-[#F0D9B5] bg-[var(--color-brand-warning-soft)] px-3 py-1.5 text-[var(--color-brand-warning)]"
        >
          <IconWarning size={14} />
          <span className="text-[13px] font-bold">Republish</span>
          <span className="text-[11px] font-semibold text-[var(--color-brand-warning)]/60">
            {unsyncedCount > 0 ? `${unsyncedCount.toLocaleString("en-IN")} new` : "new media"}
          </span>
        </button>
        {modal}
      </>
    );
  }

  // ── Published / Deactivated → status pill + dropdown ──────────────────────
  const isDeactivated = state === "deactivated";
  const meta = isDeactivated
    ? { word: "Deactivated", dot: "var(--color-brand-warning)", fg: "var(--color-brand-warning)", tint: "var(--color-brand-warning-soft)", border: "#F0D9B5" }
    : { word: "Published", dot: "var(--color-brand-success)", fg: "var(--color-brand-ink)", tint: "#FFFFFF", border: "var(--color-brand-border)" };
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
          </div>
        )}
      </div>
      {modal}
    </>
  );
}

const CONFIRM_COPY: Record<ConfirmAction, { title: string; description: string; warning: string | null }> = {
  publish: {
    title: "Publish gallery?",
    description:
      "This starts preparing the AI gallery (face recognition). It becomes live for guests once processing finishes — we’ll notify you then.",
    warning: "Publishing re-computes image embeddings (GPU-intensive) and can take a little while.",
  },
  republish: {
    title: "Republish gallery?",
    description:
      "New media was added since the last publish. Republishing re-runs face recognition so the new photos appear in guest search.",
    warning: "Republishing re-computes image embeddings (GPU-intensive) — only run it when you have new media to deliver.",
  },
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
};

const DISABLED_WORD: Record<LivePillState, string> = {
  empty: "Unpublished",
  publish: "Unpublished",
  publishing: "Publishing…",
  published: "Published",
  republish: "Published",
  deactivated: "Deactivated",
};

function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[244px] rounded-lg bg-[var(--color-brand-ink)] px-3 py-2.5 text-[12px] leading-relaxed text-white shadow-[0_6px_20px_rgba(42,34,24,0.22)]">
      <span className="absolute -top-[5px] right-[18px] h-2.5 w-2.5 rotate-45 bg-[var(--color-brand-ink)]" />
      {children}
    </div>
  );
}
