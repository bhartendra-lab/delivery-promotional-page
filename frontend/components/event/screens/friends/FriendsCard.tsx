"use client";

/**
 * Surface 3 — the lounge card.
 *
 * The feature's permanent home on the lounge, as against the sheet, which is a
 * one-time interruption. Visible whenever `friend_finder.enabled` is true, in
 * every state including "No thanks" — a guest who declined must be able to
 * change their mind without hunting, and must be able to ask individual people
 * even while allowing nobody by default.
 *
 * It sits BELOW the lounge's existing primary content and renders into a slot
 * the shells provide, so nothing above it is reordered or restyled.
 */

import type { ClientTheme } from "@/lib/client-theme";
import { FRIENDS_CARD_COPY } from "@/lib/friend-finder/copy";
import type { FriendPerson } from "@/lib/friend-finder/types";
import { IconChevronRight, IconUsers } from "@/components/ui/icons";
import { Avatar } from "./Avatar";

/** What the card is being asked to say. Resolved by the host, which is the only
 *  thing holding both the session block and the cached directory. */
export type FriendsCardState =
  | { kind: "no_selfie" }
  | { kind: "undecided" }
  | { kind: "chosen_no_group" }
  | { kind: "has_group"; members: FriendPerson[]; count: number | null };

export function FriendsCard({
  t,
  state,
  pendingCount,
  onAction,
}: {
  t: ClientTheme;
  state: FriendsCardState;
  /** People waiting on this guest. Above zero it becomes the badge. */
  pendingCount: number;
  onAction: () => void;
}) {
  const badge =
    pendingCount > 0
      ? `${pendingCount} want${pendingCount === 1 ? "s" : ""} to add you`
      : null;

  return (
    <button
      type="button"
      onClick={onAction}
      className="fx-rise flex w-full cursor-pointer items-center gap-3.5 rounded-3xl px-4 py-4 text-left transition-transform active:scale-[0.995]"
      style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadowSm }}
    >
      {state.kind === "has_group" && state.members.length > 0 ? (
        <AvatarStack t={t} members={state.members} />
      ) : (
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: t.accentWash, color: t.brand }}
          aria-hidden
        >
          <IconUsers size={20} weight="fill" />
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[14.5px] font-extrabold leading-[1.25]" style={{ color: t.text }}>
            {titleFor(state)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] font-semibold" style={{ color: t.muted }}>
          {subtitleFor(state)}
        </span>
        {badge && (
          <span
            className="mt-1.5 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold"
            style={{ background: t.accentWash, color: t.brand }}
          >
            {badge}
          </span>
        )}
      </span>

      <span className="shrink-0" style={{ color: t.faint }} aria-hidden>
        <IconChevronRight size={16} />
      </span>
    </button>
  );
}

function titleFor(state: FriendsCardState): string {
  switch (state.kind) {
    case "no_selfie":
      return FRIENDS_CARD_COPY.noSelfie.title;
    case "undecided":
      return FRIENDS_CARD_COPY.undecided.title;
    case "chosen_no_group":
      return FRIENDS_CARD_COPY.chosenNoGroup.title;
    case "has_group":
      // The count comes from the cached directory. Without one the card still
      // says something true rather than guessing a number.
      return state.count != null ? `Your group · ${state.count}` : "Your group";
  }
}

function subtitleFor(state: FriendsCardState): string {
  switch (state.kind) {
    case "no_selfie":
      return FRIENDS_CARD_COPY.noSelfie.subtitle;
    case "undecided":
      return FRIENDS_CARD_COPY.undecided.subtitle;
    case "chosen_no_group":
      return FRIENDS_CARD_COPY.chosenNoGroup.subtitle;
    case "has_group":
      return "See every photo you are in together";
  }
}

/** Up to four overlapping group faces. More than that stops reading as faces
 *  and starts reading as texture, and the count beside it already says how
 *  many there are. */
function AvatarStack({ t, members }: { t: ClientTheme; members: FriendPerson[] }) {
  return (
    <span className="flex shrink-0 items-center" aria-hidden>
      {members.slice(0, 4).map((person, i) => (
        <span key={person.guest_id} style={{ marginLeft: i === 0 ? 0 : -12, zIndex: 4 - i }}>
          <span className="block rounded-full" style={{ boxShadow: `0 0 0 2px ${t.card}` }}>
            <Avatar t={t} guestId={person.guest_id} name={person.name} url={person.avatar_url} size={34} />
          </span>
        </span>
      ))}
    </span>
  );
}
