"use client";

import { useId, useState } from "react";
import { useEventTheme } from "../../EventThemeContext";
import { IconCheck } from "@/components/ui/icons";
import type { SocialPlatformKey, SocialVisitGate } from "@/lib/social-platforms";
import { SocialChip } from "./SocialIcons";

/**
 * "Tell us about you" — a NON-dismissible sheet raised over the Lounge for a
 * guest missing a real name, (at a team-scoped event) a team choice, and/or the
 * Studio's required visit link. Unlike `PasscodeSheet`/`ProfileSheet`, there is
 * deliberately no close button, no Escape handler, and no backdrop-click
 * dismiss: the grid and the match-count banner underneath stay held until the
 * guest submits — this is the locked "hold results, never discard an
 * in-progress answer" behaviour, just implemented as an overlay instead of a
 * screen now that the face search itself runs inside the Lounge.
 *
 * Because it cannot be dismissed, Continue must never be PERMANENTLY disabled.
 * Every reason it can be off is something the Guest can do right here: type a
 * name, pick a team, open the link (a real anchor that always has a URL — the
 * parent never passes a gate without one), or wait out a save that is bounded.
 *
 * The parent (`LoungeGallery`) decides whether to render this at all — if
 * name, teams and gate would all be empty, it doesn't mount this component
 * rather than rendering an empty question block.
 */
export function IntakeSheet({
  showName,
  teams,
  gate,
  visited,
  onVisit,
  onSubmit,
}: {
  /** Full Name field — only true when session.name is missing or "Guest". */
  showName: boolean;
  /** Team options — only non-empty at a team-scoped event. */
  teams: string[];
  /** The Studio's required visit, or null when this Guest has nothing to open. */
  gate: SocialVisitGate | null;
  /** The Guest has opened the gate's link from this sheet. */
  visited: boolean;
  /** Called from the link's own click — the ONLY thing that satisfies the gate. */
  onVisit: (platform: SocialPlatformKey) => void;
  /** Persist the answer(s); resolves once saved. The sheet closes itself —
   *  the parent's session update naturally makes `showName`/`teams`/gate-derived
   *  visibility go false on the next render. */
  onSubmit: (patch: { name?: string; team?: string }) => Promise<void>;
}) {
  const { theme: t, event } = useEventTheme();
  const [name, setName] = useState("");
  const [team, setTeam] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const helperId = useId();

  const trimmedName = name.trim();
  const nameOk = !showName || trimmedName.length > 0;
  const teamOk = teams.length === 0 || team !== null;
  const gateOk = !gate || visited;
  const canSubmit = nameOk && teamOk && gateOk && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        ...(showName ? { name: trimmedName } : {}),
        ...(team ? { team } : {}),
      });
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Couldn’t save — try again.");
    }
  }

  // Only the link to open: "Tell us about you" would promise a question that
  // is not there.
  const onlyGate = !!gate && !showName && teams.length === 0;

  return (
    <div
      // Scrolls when the sheet is taller than the viewport (name + team + gate
      // on a small phone); `m-auto` below still centres it whenever it fits, and
      // unlike items-center it never pushes the top out of reach.
      className="dash-fade fixed inset-0 z-[60] flex overflow-y-auto p-5"
      style={{ background: "rgba(31,26,14,0.55)" }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="popup-pop m-auto w-full max-w-[420px] rounded-3xl p-7"
        style={{ background: t.card, fontFamily: t.font, boxShadow: t.shadow }}
      >
        <div className="text-center text-[19px] font-extrabold" style={{ color: t.text }}>
          {onlyGate ? "Almost there" : "Tell us about you"}
        </div>
        <p className="mt-1.5 text-center text-[12.5px] font-semibold" style={{ color: t.muted }}>
          One more thing before your gallery’s ready.
        </p>

        {/* First, above the name: this is the thing standing between the Guest
            and the gallery, and burying it would leave a Guest pressing a
            disabled Continue and hunting for why. */}
        {gate && (
          <VisitCard
            gate={gate}
            visited={visited}
            studioName={event.company_name?.trim() || "The Studio"}
            onVisit={() => onVisit(gate.platform)}
          />
        )}

        {showName && (
          <label className={`${gate ? "mt-5" : "mt-6"} flex flex-col gap-1.5`}>
            <span className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: t.muted }}>
              Full Name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Priya Sharma"
              autoComplete="name"
              // Not while a link is waiting to be opened: on a phone the
              // keyboard would cover the card the Guest has to use first.
              autoFocus={!gate}
              className="w-full min-h-[50px]"
              style={{
                background: t.sunken,
                border: `1.5px solid ${t.border}`,
                borderRadius: t.rField,
                padding: "0 16px",
                fontSize: 15,
                fontWeight: 700,
                color: t.text,
                fontFamily: t.font,
              }}
            />
          </label>
        )}

        {teams.length > 0 && (
          <div className={showName || gate ? "mt-5" : "mt-6"}>
            <span className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: t.muted }}>
              Which team are you in?
            </span>
            <div className="mt-2 flex flex-col gap-2">
              {teams.map((option) => {
                const active = option === team;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setTeam(option)}
                    aria-pressed={active}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl p-3 text-left transition-colors"
                    style={{ background: active ? t.accentWash : t.sunken, border: `1.5px solid ${active ? t.brand : t.border}` }}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold"
                      style={{ background: t.card, color: t.brand, border: `1.5px solid ${t.brand}` }}
                    >
                      {initials(option)}
                    </span>
                    <span className="flex-1 text-[14px] font-extrabold" style={{ color: t.text }}>
                      {option}
                    </span>
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{ border: `2px solid ${active ? t.brand : t.border}`, background: active ? t.brand : "transparent", color: t.onBrand }}
                    >
                      {active && <IconCheck size={11} weight="bold" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 text-center text-[12.5px] font-semibold" style={{ color: t.error }}>
            {error}
          </p>
        )}

        {/* Stays visible while disabled: a Guest needs to see what they are
            working towards. */}
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          aria-describedby={gate && !visited ? helperId : undefined}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[14px] font-extrabold transition-transform active:scale-[0.99] disabled:cursor-not-allowed"
          style={{ background: canSubmit ? t.brand : t.sunken, color: canSubmit ? t.onBrand : t.faint }}
        >
          {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
          {busy ? "Saving…" : "Continue"}
        </button>
        {gate && (
          // Kept in the layout once satisfied (just hidden), so nothing jumps
          // at the moment the Guest comes back from the link.
          <p
            id={helperId}
            aria-hidden={visited}
            className={`mt-2.5 text-center text-[12px] font-semibold ${visited ? "invisible" : ""}`}
            style={{ color: t.faint }}
          >
            Open the link above to continue.
          </p>
        )}
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
    <div className="mt-6 p-4" style={{ border: `1.5px solid ${t.border}`, background: t.sunken, borderRadius: t.rField }}>
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
          ? `${studioName} appreciates it. Your photos are ready when you are.`
          : `${studioName} would love your support. Open their ${gate.label} page, then come back for your photos.`}
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "·";
}
