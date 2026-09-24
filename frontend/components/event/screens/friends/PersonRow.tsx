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
  added_you: { label: "Add back", tone: "primary" },
  open: { label: "Add", tone: "primary" },
  ask: { label: "Ask", tone: "primary" },
  not_sharing: { label: "Not sharing", tone: "disabled" },
};

/** The verb each button performs, for its accessible name. "In group" and
 *  "Requested" are states rather than actions, so they describe what tapping
 *  them undoes. */
const ACTION_LABEL: Record<FriendRel, (name: string) => string> = {
  in_group: (n) => `${n} is in your group. Remove them`,
  requested: (n) => `Request sent to ${n}. Cancel it`,
  added_you: (n) => `Add ${n} back`,
  open: (n) => `Add ${n}`,
  ask: (n) => `Ask ${n}`,
  not_sharing: (n) => `${n} is not sharing`,
};

export function PersonRow({
  t,
  person,
  /** How many photos the two are in together, when the server could say. Zero
   *  is left unsaid: "0 photos together" reads as a verdict on the friendship. */
  sharedCount,
  busy,
  desktop,
  onPrimary,
  /** Present only in the "Wants to add you" section. */
  onDecline,
}: {
  t: ClientTheme;
  person: FriendPerson;
  sharedCount: number;
  busy: boolean;
  desktop: boolean;
  onPrimary: () => void;
  onDecline?: () => void;
}) {
  const spec = BUTTON[person.rel];
  const disabled = spec.tone === "disabled" || busy;

  return (
    <li
      className="flex items-center gap-3 py-2"
      // Skips layout and paint for rows scrolled out of view. The intrinsic
      // size keeps the scrollbar honest while they are skipped.
      style={{ contentVisibility: "auto", containIntrinsicSize: `${desktop ? 72 : 64}px` }}
    >
      <Avatar
        t={t}
        guestId={person.guest_id}
        name={person.name}
        url={person.avatar_url}
        size={desktop ? 56 : 48}
        ringed={person.rel === "in_group"}
      />

      <div className="min-w-0 flex-1">
        {/* One line, ellipsised. The full name is on the button's label below,
            so nothing is lost to a screen reader when it is cut here. */}
        <p className="truncate text-[14.5px] font-extrabold leading-[1.3]" style={{ color: t.text }}>
          {person.name}
        </p>
        {sharedCount > 0 && (
          <p className="mt-0.5 text-[12px] font-semibold" style={{ color: t.muted }}>
            {sharedCount} photo{sharedCount === 1 ? "" : "s"} together
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {onDecline && (
          <button
            type="button"
            onClick={onDecline}
            disabled={busy}
            aria-label={`Not now for ${person.name}`}
            // 44px minimum touch target, here and on every button below.
            className="min-h-[44px] cursor-pointer whitespace-nowrap rounded-full px-3 text-[13px] font-bold disabled:opacity-50"
            style={{ color: t.muted }}
          >
            Not now
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
          className="flex min-h-[44px] cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[13px] font-extrabold transition-colors disabled:cursor-not-allowed"
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
