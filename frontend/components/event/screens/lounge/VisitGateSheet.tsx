"use client";

import { useEffect, useId } from "react";
import { useEventTheme } from "../../EventThemeContext";
import { IconCheck, IconX } from "@/components/ui/icons";
import type { SocialVisitGate } from "@/lib/social-platforms";
import { SocialChip } from "./SocialIcons";

/**
 * The Studio's required visit, asked at the Guest's FIRST DOWNLOAD.
 *
 * It used to sit inside the non-dismissible intake sheet and hold the whole
 * gallery until the link was opened. Now browsing is never blocked: the ask
 * comes at the moment the Guest takes something away, which is when a favour
 * in return reads as fair. So this sheet is DISMISSIBLE — a close button,
 * Escape and a tap on the backdrop all cancel the download and record nothing,
 * and the Guest is simply asked again at their next download.
 *
 * The rules that held inside the intake sheet still hold (see `VisitCard`):
 * once per event, platform-independent, never re-asked after the Studio
 * changes the link, a real `<a target="_blank">` rather than `window.open`, and
 * satisfaction from the click alone. The parent (`LoungeGallery`) owns the
 * record request and runs the download once Continue resolves.
 *
 * `z-[75]`: above the PhotoViewer (`z-[70]`), because a download started from
 * the viewer must be answerable without closing it — dismissing lands the
 * Guest back on the same photo. Below the friends sheets (80) and every
 * download layer (300+), which open after this has done its job.
 */
export function VisitGateSheet({
  gate,
  visited,
  busy,
  onVisit,
  onContinue,
  onClose,
}: {
  gate: SocialVisitGate;
  /** The Guest has opened the link from this sheet. */
  visited: boolean;
  /** The visit is being recorded; Continue waits on it, bounded. */
  busy: boolean;
  /** Called from the link's own click — the ONLY thing that satisfies the gate. */
  onVisit: () => void;
  onContinue: () => void;
  /** Cancels the download. Records nothing. */
  onClose: () => void;
}) {
  const { theme: t, event } = useEventTheme();
  const helperId = useId();
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || busy) return;
      // Capture phase + stopPropagation: the PhotoViewer under this sheet
      // listens for Escape too, and must stay open when this closes.
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [busy, onClose]);

  const canContinue = visited && !busy;

  return (
    <div
      className="dash-fade fixed inset-0 z-[75] flex overflow-y-auto p-5"
      style={{ background: "rgba(31,26,14,0.55)" }}
      onClick={busy ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="popup-pop m-auto w-full max-w-[420px] rounded-3xl p-7"
        style={{ background: t.card, fontFamily: t.font, boxShadow: t.shadow }}
      >
        <div className="flex items-start justify-between gap-3">
          <div id={titleId} className="text-[19px] font-extrabold" style={{ color: t.text }}>
            Before you download
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full disabled:cursor-not-allowed"
            style={{ color: t.muted }}
          >
            <IconX size={18} />
          </button>
        </div>

        <VisitCard
          gate={gate}
          visited={visited}
          studioName={event.company_name?.trim() || "The Studio"}
          onVisit={onVisit}
        />

        {/* Stays visible while disabled: a Guest needs to see what they are
            working towards. */}
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          aria-describedby={!visited ? helperId : undefined}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[14px] font-extrabold transition-transform active:scale-[0.99] disabled:cursor-not-allowed"
          style={{ background: canContinue ? t.brand : t.sunken, color: canContinue ? t.onBrand : t.faint }}
        >
          {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
          {busy ? "Saving…" : "Continue to download"}
        </button>
        {/* Kept in the layout once satisfied (just hidden), so nothing jumps
            at the moment the Guest comes back from the link. */}
        <p
          id={helperId}
          aria-hidden={visited}
          className={`mt-2.5 text-center text-[12px] font-semibold ${visited ? "invisible" : ""}`}
          style={{ color: t.faint }}
        >
          Open the link above to continue.
        </p>
      </div>
    </div>
  );
}

/**
 * The required visit, as a favour asked on the Studio's behalf. Never "must"
 * or "required" in here — that is Studio vocabulary and belongs in Settings.
 *
 * The same three rows in both states (header, one line, a 48px action row), so
 * the card does not change height when the Guest opens the link.
 */
function VisitCard({
  gate,
  visited,
  studioName,
  onVisit,
}: {
  gate: SocialVisitGate;
  visited: boolean;
  studioName: string;
  onVisit: () => void;
}) {
  const { theme: t } = useEventTheme();
  // A real anchor, never window.open(): a popup blocker silently swallows
  // window.open, leaving a Continue that never enables and no visible reason.
  // Satisfaction comes from this click alone — never from focus/visibility
  // events, which in-app browsers do not fire reliably.
  const linkProps = {
    href: gate.url,
    target: "_blank",
    rel: "noopener noreferrer",
    onClick: onVisit,
    // Middle-click opens the tab without a click event. Button 1 only: a right
    // click (context menu) also fires auxclick but opens nothing.
    onAuxClick: (e: React.MouseEvent) => {
      if (e.button === 1) onVisit();
    },
  } as const;

  return (
    <div className="mt-5 p-4" style={{ border: `1.5px solid ${t.border}`, background: t.sunken, borderRadius: t.rField }}>
      <div className="flex items-center gap-3">
        {visited ? (
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: t.accentWash, color: t.brand }}
          >
            <IconCheck size={17} weight="bold" />
          </span>
        ) : (
          <SocialChip platform={gate.platform} size={36} />
        )}
        <div className="min-w-0 text-[14.5px] font-extrabold leading-tight" style={{ color: t.text }}>
          {visited ? "Thanks for visiting" : gate.label}
        </div>
      </div>
      <p className="mt-2.5 text-[12.5px] font-semibold leading-snug" style={{ color: t.muted }}>
        {visited
          ? `${studioName} appreciates it. Your download is ready when you are.`
          : `${studioName} would love your support. Open their ${gate.label} page, then come back for your download.`}
      </p>
      {visited ? (
        <div className="mt-3 flex min-h-[48px] items-center justify-center">
          <a {...linkProps} className="cursor-pointer text-[13px] font-bold underline-offset-2 hover:underline" style={{ color: t.brand }}>
            Open again ↗
          </a>
        </div>
      ) : (
        <a
          {...linkProps}
          className="mt-3 flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-full px-4 text-center text-[14px] font-extrabold"
          style={{ background: t.card, border: `1.5px solid ${t.border}`, color: t.text }}
        >
          Open {gate.label} ↗
        </a>
      )}
    </div>
  );
}
