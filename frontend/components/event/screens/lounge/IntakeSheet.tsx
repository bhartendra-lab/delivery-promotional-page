"use client";

import { useState } from "react";
import { useEventTheme } from "../../EventThemeContext";
import { IconCheck } from "@/components/ui/icons";

/**
 * "Tell us about you" — a NON-dismissible sheet raised over the Lounge for a
 * guest missing a real name and/or (at a team-scoped event) a team choice.
 * Unlike `PasscodeSheet`/`ProfileSheet`, there is deliberately no close
 * button, no Escape handler, and no backdrop-click dismiss: the grid and the
 * match-count banner underneath stay held until the guest submits — this is
 * the locked "hold results, never discard an in-progress answer" behaviour,
 * just implemented as an overlay instead of a screen now that the face
 * search itself runs inside the Lounge.
 *
 * The parent (`LoungeGallery`) decides whether to render this at all — if
 * both `showName` and `teams` would be empty, it doesn't mount this
 * component rather than rendering an empty question block.
 */
export function IntakeSheet({
  showName,
  teams,
  onSubmit,
}: {
  /** Full Name field — only true when session.name is missing or "Guest". */
  showName: boolean;
  /** Team options — only non-empty at a team-scoped event. */
  teams: string[];
  /** Persist the answer(s); resolves once saved. The sheet closes itself —
   *  the parent's session update naturally makes `showName`/`teams`-derived
   *  visibility go false on the next render. */
  onSubmit: (patch: { name?: string; team?: string }) => Promise<void>;
}) {
  const { theme: t } = useEventTheme();
  const [name, setName] = useState("");
  const [team, setTeam] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const nameOk = !showName || trimmedName.length > 0;
  const teamOk = teams.length === 0 || team !== null;
  const canSubmit = nameOk && teamOk && !busy;

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

  return (
    <div
      className="dash-fade fixed inset-0 z-[60] flex items-center justify-center p-5"
      style={{ background: "rgba(31,26,14,0.55)" }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="popup-pop w-full max-w-[420px] rounded-3xl p-7"
        style={{ background: t.card, fontFamily: t.font, boxShadow: t.shadow }}
      >
        <div className="text-center text-[19px] font-extrabold" style={{ color: t.text }}>
          Tell us about you
        </div>
        <p className="mt-1.5 text-center text-[12.5px] font-semibold" style={{ color: t.muted }}>
          One more thing before your gallery’s ready.
        </p>

        {showName && (
          <label className="mt-6 flex flex-col gap-1.5">
            <span className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: t.muted }}>
              Full Name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Priya Sharma"
              autoComplete="name"
              autoFocus
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
          <div className={showName ? "mt-5" : "mt-6"}>
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

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[14px] font-extrabold transition-transform active:scale-[0.99] disabled:cursor-not-allowed"
          style={{ background: canSubmit ? t.brand : t.sunken, color: canSubmit ? t.onBrand : t.faint }}
        >
          {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
          {busy ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "·";
}
