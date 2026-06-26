"use client";

import { useState } from "react";
import { AmbientBackdrop } from "../AmbientBackdrop";
import { useEventTheme } from "../EventThemeContext";

/**
 * Screen · "Which team are you in?" — shown once, only when the event defines
 * `guest_types`. Wears the event theme (this is event personalisation, not the
 * Vyavasth trust layer). The choice persists via `update-guest-sub-type`.
 */
export function TeamSelectScreen({
  teams,
  onSubmit,
}: {
  teams: string[];
  /** Persist the chosen team; resolves when saved (parent advances the flow). */
  onSubmit: (team: string) => Promise<void>;
}) {
  const { theme: t, event } = useEventTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(selected);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Couldn’t save — try again.");
    }
  }

  return (
    <div
      className="relative isolate flex min-h-[100dvh] flex-col items-center px-6 py-10"
      style={{ background: t.bg, fontFamily: t.font }}
    >
      <AmbientBackdrop a={t.cover[0]} b={t.cover[1]} />
      <div className="flex w-full max-w-[460px] flex-1 flex-col">
        <div className="fx-rise flex flex-col items-center gap-2.5 pt-[clamp(16px,6vh,64px)] text-center">
          <div className="text-[12px] font-bold uppercase tracking-[0.2em]" style={{ color: t.brand }}>
            {event.event_name}
          </div>
          <h1 className="text-[27px] font-extrabold leading-[1.15] tracking-[-0.02em]" style={{ color: t.text }}>
            Which team are you in?
          </h1>
          <p className="max-w-[340px] text-[14.5px] font-semibold leading-[1.5]" style={{ color: t.muted }}>
            We’ll tag your photos to the right side of the celebration.
          </p>
        </div>

        <div className="fx-stagger mt-8 flex flex-col gap-3">
          {teams.map((team) => {
            const active = team === selected;
            return (
              <button
                key={team}
                type="button"
                onClick={() => setSelected(team)}
                aria-pressed={active}
                className="flex cursor-pointer items-center gap-4 rounded-2xl p-4 text-left transition-all duration-300 hover:-translate-y-[3px]"
                style={{
                  background: active ? t.accentWash : t.card,
                  border: `1.5px solid ${active ? t.brand : t.border}`,
                  boxShadow: active ? "none" : t.shadowSm,
                }}
              >
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
                  style={{ background: t.ring, padding: 3 }}
                >
                  <span
                    className="flex h-full w-full items-center justify-center rounded-full text-[16px] font-extrabold"
                    style={{ background: t.card, color: t.brand }}
                  >
                    {initials(team)}
                  </span>
                </span>
                <span className="flex-1 text-[16px] font-extrabold" style={{ color: t.text }}>
                  {team}
                </span>
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full"
                  style={{
                    border: `2px solid ${active ? t.brand : t.border}`,
                    background: active ? t.brand : "transparent",
                    color: t.onBrand,
                  }}
                >
                  {active && (
                    <span className="fx-pop inline-flex">
                      <CheckIcon size={13} />
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="mt-4 text-center text-[12.5px] font-semibold" style={{ color: t.error }}>
            {error}
          </p>
        )}

        <div className="flex-1" />

        <button
          type="button"
          onClick={submit}
          disabled={!selected || busy}
          className="cta-shine mt-8 flex w-full items-center justify-center gap-2 rounded-full py-4 text-[15px] font-extrabold transition-all hover:-translate-y-0.5"
          style={{
            background: selected ? t.brand : t.sunken,
            color: selected ? t.onBrand : t.faint,
            cursor: selected && !busy ? "pointer" : "not-allowed",
          }}
        >
          {busy ? (
            <>
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                style={{ opacity: 0.7 }}
              />
              Saving…
            </>
          ) : (
            "Continue"
          )}
        </button>
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "·";
}

function CheckIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="5 12 10 17 19 7" />
    </svg>
  );
}
