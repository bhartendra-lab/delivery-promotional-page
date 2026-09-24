"use client";

/**
 * My Group's header: who is in the group, how many are still to answer, and
 * the way to change either.
 *
 * Rendered into a slot the gallery provides, so all of this copy and every
 * avatar stays in the friends chunk. The gallery holds a `<div>`.
 */

import type { ClientTheme } from "@/lib/client-theme";
import type { FriendPerson } from "@/lib/friend-finder/types";
import { IconGear } from "@/components/ui/icons";
import { Avatar } from "./Avatar";

/** Past this many faces the strip stops reading as people and starts reading
 *  as texture, so the rest become a count. Phones scroll instead. */
const DESKTOP_FACES = 8;

export function GroupHeader({
  t,
  members,
  waitingCount,
  desktop,
  onManage,
  onSettings,
}: {
  t: ClientTheme;
  members: FriendPerson[];
  /** People this guest has asked who have not answered — the "N waiting" pill. */
  waitingCount: number;
  desktop: boolean;
  onManage: () => void;
  onSettings: () => void;
}) {
  const shown = desktop ? members.slice(0, DESKTOP_FACES) : members;
  const overflow = desktop ? Math.max(0, members.length - DESKTOP_FACES) : 0;

  return (
    <div
      className="flex items-center gap-3 rounded-3xl px-4 py-3"
      style={{ background: t.card, border: `1px solid ${t.border}` }}
    >
      {/* Phone: one horizontally scrolling strip, because a wedding party can
          be a dozen faces and wrapping them would push the grid off screen.
          Laptop: one row, capped, with the remainder counted. */}
      <div
        className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto lg:overflow-visible"
        style={{ scrollbarWidth: "none" }}
      >
        <div className="flex shrink-0 items-center">
          {shown.map((person, i) => (
            <span key={person.guest_id} style={{ marginLeft: i === 0 ? 0 : -10 }}>
              <span className="block rounded-full" style={{ boxShadow: `0 0 0 2px ${t.card}` }}>
                <Avatar t={t} guestId={person.guest_id} name={person.name} url={person.avatar_url} size={34} />
              </span>
            </span>
          ))}
          {overflow > 0 && (
            <span
              className="ml-[-10px] flex h-[34px] w-[34px] items-center justify-center rounded-full text-[12px] font-extrabold"
              style={{ background: t.sunken, color: t.muted, boxShadow: `0 0 0 2px ${t.card}` }}
              aria-hidden
            >
              +{overflow}
            </span>
          )}
        </div>

        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-extrabold" style={{ color: t.text }}>
            Your group · {members.length}
          </p>
          {waitingCount > 0 && (
            <span
              className="mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-extrabold"
              style={{ background: t.accentWash, color: t.brand }}
            >
              {waitingCount} waiting
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onManage}
          className="min-h-[44px] cursor-pointer whitespace-nowrap rounded-full px-4 text-[13px] font-extrabold"
          style={{ background: t.sunken, color: t.text, border: `1px solid ${t.border}` }}
        >
          Manage
        </button>
        {/* One item today, so it is the item rather than a menu with one row in
            it. Phase 5 turns this into the overflow menu proper. */}
        <button
          type="button"
          onClick={onSettings}
          aria-label="Friends group settings"
          className="flex h-[44px] w-[44px] cursor-pointer items-center justify-center rounded-full"
          style={{ color: t.muted }}
        >
          <IconGear size={17} />
        </button>
      </div>
    </div>
  );
}
