"use client";

/**
 * One guest in the people list.
 *
 * ONE button, chosen by `rel` and nothing else — the whole point of the
 * backend computing a single relationship per person is that this component
 * never has to combine flags to work out what to offer. The one exception is
 * the "Wants to add you" section, which offers a pair (Add back / Not now)
 * because it is answering a question rather than starting one.
 *
 * Every button's accessible name carries the person's name ("Add Priya"), so a
 * screen-reader user tabbing a list of forty rows hears what each button will
 * do rather than forty identical "Add"s.
 */

import type { ClientTheme } from "@/lib/client-theme";
import type { FriendPerson, FriendRel } from "@/lib/friend-finder/types";
import { IconCheck } from "@/components/ui/icons";
import { Avatar } from "./Avatar";

/** Label and tone for each relationship's single button. */
const BUTTON: Record<FriendRel, { label: string; tone: "primary" | "quiet" | "disabled" }> = {
  in_group: { label: "In group", tone: "quiet" },
  requested: { label: "Requested", tone: "quiet" },
  // Primary, not quiet: being turned down is the one state on this screen with
  // something left to do about it.
  declined: { label: "Ask again", tone: "primary" },
  added_you: { label: "Add back", tone: "primary" },
  open: { label: "Add", tone: "primary" },
  ask: { label: "Ask", tone: "primary" },
};

/** The verb each button performs, for its accessible name. "In group" and
 *  "Requested" are states rather than actions, so they describe what tapping
 *  them undoes. */
const ACTION_LABEL: Record<FriendRel, (name: string) => string> = {
  in_group: (n) => `${n} is in your group. Remove them`,
  requested: (n) => `Request sent to ${n}. Cancel it`,
  declined: (n) => `${n} did not accept your request. Ask again`,
  added_you: (n) => `Add ${n} back`,
  open: (n) => `Add ${n}`,
  ask: (n) => `Ask ${n}`,
};

/**
 * The quiet line under a name.
 *
 * ONE line, always — "not accepted" takes the place of the photo count rather
 * than sitting beside it, so a turned-down row is exactly as tall as every
 * other row and the list does not reflow around it. That is the whole design
 * brief for this state: say it plainly, take no extra space.
 */
function noteFor(rel: FriendRel, sharedCount: number): { text: string; quiet: boolean } | null {
  if (rel === "declined") return { text: "Not accepted", quiet: false };
  if (sharedCount > 0) {
    return { text: `${sharedCount} photo${sharedCount === 1 ? "" : "s"} together`, quiet: true };
  }
  return null;
}

export function PersonRow({
  t,
  person,
  /** How many photos the two are in together, when the server could say. Zero
   *  is left unsaid: "0 photos together" reads as a verdict on the friendship. */
  sharedCount,
  busy,
  desktop,
  onPrimary,
  /**
   * The quiet button left of the main one, when the row has a second thing
   * worth doing. Two rows have one: "Wants to add you" offers Not now, and a
   * row that was turned down offers Remove — that guest can still see the
   * photos you share until you take the access back, which is the part of
   * being declined that is easy to miss.
   */
  secondary,
}: {
  t: ClientTheme;
  person: FriendPerson;
  sharedCount: number;
  busy: boolean;
  desktop: boolean;
  onPrimary: () => void;
  secondary?: { label: string; onSelect: () => void; describe: (name: string) => string };
}) {
  const spec = BUTTON[person.rel];
  const disabled = spec.tone === "disabled" || busy;
  const note = noteFor(person.rel, sharedCount);

  return (
    <li
      /* `flex-wrap` with a floor on the name column. A row with two buttons has
         about 40px left for the name at 320px, which renders "Ananya Rao" as
         "Ana…" — so below that the buttons drop to their own line instead and
         the name is readable. Every phone from 360px up keeps one line. */
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-2"
      // Skips layout and paint for rows scrolled out of view. The intrinsic
      // size keeps the scrollbar honest while they are skipped.
      // The phone figure is 60, not 64: the avatar came down to 44px when the
      // rows were tightened. A stale hint is what makes a long list's scrollbar
      // jump as rows scroll in and their real height replaces the estimate.
      style={{ contentVisibility: "auto", containIntrinsicSize: `${desktop ? 72 : 60}px` }}
    >
      <Avatar
        t={t}
        guestId={person.guest_id}
        name={person.name}
        url={person.avatar_url}
        size={desktop ? 56 : 44}
        ringed={person.rel === "in_group"}
      />

      {/* The floor is what decides where the row wraps, so it is tuned rather
          than picked: 96px holds a two-word name at this size, which keeps
          every phone from 360px up on one line and lets only the narrowest
          screens drop the buttons below. */}
      <div className="min-w-[88px] flex-1">
        {/* One line, ellipsised. The full name is on the button's label below,
            so nothing is lost to a screen reader when it is cut here. */}
        <p className="truncate text-[14.5px] font-extrabold leading-[1.3]" style={{ color: t.text }}>
          {person.name}
        </p>
        {note && (
          // `truncate`, like the name above it. A row with TWO buttons leaves
          // this column narrow enough that "1 photo together" wrapped onto a
          // second line and made that row taller than every other one — which
          // is the reflow the one-line rule exists to prevent.
          <p
            className="mt-0.5 truncate text-[12px] font-semibold"
            style={{ color: note.quiet ? t.muted : t.error }}
          >
            {note.text}
          </p>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {secondary && (
          <button
            type="button"
            onClick={secondary.onSelect}
            disabled={busy}
            aria-label={secondary.describe(person.name)}
            // 44px minimum touch target, here and on every button below.
            className="min-h-[44px] cursor-pointer whitespace-nowrap rounded-full px-2.5 text-[13px] font-bold disabled:opacity-50"
            style={{ color: t.muted }}
          >
            {secondary.label}
          </button>
        )}
        <button
          type="button"
          onClick={onPrimary}
          disabled={disabled}
          aria-label={ACTION_LABEL[person.rel](person.name)}
          // The anchor the people screen's arrow keys rove between. One per
          // row, and it is the row's real action — so Enter and Space keep the
          // behaviour any button has, with no parallel key handling.
          data-row-action=""
          className="flex min-h-[44px] cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-extrabold transition-colors disabled:cursor-not-allowed"
          style={buttonStyle(t, spec.tone, busy)}
        >
          {person.rel === "in_group" && <IconCheck size={13} weight="bold" />}
          {spec.label}
        </button>
      </div>
    </li>
  );
}

function buttonStyle(t: ClientTheme, tone: "primary" | "quiet" | "disabled", busy: boolean) {
  const base = { opacity: busy ? 0.55 : 1 };
  if (tone === "primary") return { ...base, background: t.brand, color: t.onBrand };
  if (tone === "quiet") {
    return { ...base, background: t.sunken, color: t.text, border: `1px solid ${t.border}` };
  }
  return { ...base, background: "transparent", color: t.faint, border: `1px solid ${t.border}`, opacity: 0.6 };
}
