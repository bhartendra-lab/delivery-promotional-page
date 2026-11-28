"use client";

import { useState } from "react";
import { isCoupleEventType } from "@/lib/event-clients";
import { useEvent } from "./EventContext";
import { IconPlus, IconX } from "./icons";

/** What update-booking keeps (see the backend's sanitizeGuestTypes). The form
 *  says so up front rather than letting a save quietly trim. */
const MAX_TEAMS = 6;
const MAX_TEAM_LENGTH = 40;
/** One tap to add on a couple event, while not already there. */
const COUPLE_SUGGESTIONS = ["Bride Team", "Groom Team"];

const clean = (list: string[]) => list.map((t) => t.trim()).filter(Boolean);
const sameTeam = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The editor for the Guest teams (sub-types) a Guest picks from after signing
 * in ("Which team are you in?"), e.g. Bride Team / Groom Team. Shown on the
 * Share view, inside the sign-up question row: it decides what Guests are asked
 * when they first open the link, so it sits beside the link itself.
 *
 * Its own Save, shown only while there is something to save. The parent keys
 * this editor on the saved list, so a save (or a change from another tab)
 * starts it fresh from what the server holds.
 */
export function GuestTeamsEditor({ saved, eventType }: { saved: string[]; eventType: string }) {
  const { saveGuestTypes, toast } = useEvent();
  const [teams, setTeams] = useState<string[]>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(clean(teams)) !== JSON.stringify(clean(saved));
  const suggestions = isCoupleEventType(eventType)
    ? COUPLE_SUGGESTIONS.filter((s) => !teams.some((t) => sameTeam(t, s)))
    : [];
  const full = teams.length >= MAX_TEAMS;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await saveGuestTypes(clean(teams));
      toast("Guest teams saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the teams");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2">
        {teams.map((team, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={team}
              onChange={(e) => setTeams((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder="e.g. Bride Team"
              aria-label={`Team ${i + 1}`}
              maxLength={MAX_TEAM_LENGTH}
              disabled={busy}
              className="brand-focus block h-10 min-w-0 flex-1 rounded-lg border border-[var(--color-brand-border)] bg-white px-3 text-[13.5px] text-[var(--color-brand-ink)] outline-none disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setTeams((prev) => prev.filter((_, j) => j !== i))}
              disabled={busy}
              aria-label={`Remove ${team.trim() || `team ${i + 1}`}`}
              className="brand-focus inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--color-brand-border)] text-[var(--color-brand-muted)] hover:border-[var(--color-brand-outline)] hover:text-[var(--color-brand-ink)] disabled:opacity-50"
            >
              <IconX size={14} />
            </button>
          </div>
        ))}


        {!full && (
          <div className="flex flex-wrap items-center gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTeams((prev) => [...prev, s])}
                disabled={busy}
                className="brand-focus inline-flex h-9 items-center gap-1 rounded-full border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 text-[12px] font-semibold text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:opacity-50"
              >
                <IconPlus size={12} /> {s}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setTeams((prev) => [...prev, ""])}
              disabled={busy}
              className="brand-focus inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-[var(--color-brand-outline)] px-3 text-[12.5px] font-semibold text-[var(--color-brand-navy)] hover:bg-[var(--color-brand-navy-soft)] disabled:opacity-50"
            >
              <IconPlus size={14} /> {suggestions.length > 0 ? "Custom team" : "Add team"}
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-[12px] text-[var(--color-brand-danger)]">
            {error}
          </p>
        )}
      </div>

      {dirty && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setTeams(saved);
              setError(null);
            }}
            disabled={busy}
            className="brand-focus inline-flex h-9 items-center rounded-lg px-3 text-[12.5px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="brand-focus inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-[12.5px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:opacity-60"
          >
            {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-white/60 border-t-white" />}
            {busy ? "Saving…" : "Save teams"}
          </button>
        </div>
      )}
    </div>
  );
}
