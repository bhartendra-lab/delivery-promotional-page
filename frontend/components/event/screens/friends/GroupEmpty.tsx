"use client";

/**
 * My Group with nothing in it yet, which happens for two quite different
 * reasons and must not say the same thing for both.
 *
 * Nobody has said yes: the guest has asked people and is waiting. Name them,
 * because "waiting" without a who is just a spinner with words.
 *
 * Connected, but no shared photos: their face sets are still being worked out,
 * or they genuinely are not in a photo together yet. Neither is a failure and
 * neither is the guest's fault.
 */

import type { ClientTheme } from "@/lib/client-theme";
import { waitingSentence } from "@/lib/friend-finder/feed";
import { IconUsers } from "@/components/ui/icons";

export function GroupEmpty({
  t,
  memberCount,
  /** Names this guest has asked who have not answered — `rel: "requested"`. */
  waitingNames,
  preparing,
  onAddMore,
}: {
  t: ClientTheme;
  memberCount: number;
  waitingNames: string[];
  /** The guest's own face set is still being computed server-side. */
  preparing: boolean;
  onAddMore: () => void;
}) {
  const body =
    memberCount === 0
      ? waitingSentence(waitingNames)
      : preparing
        ? "Just a moment while we find your photos."
        : "No photos of you together yet. They will appear here as the studio adds more.";

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-8 py-16 text-center">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: t.accentWash, color: t.brand }}
        aria-hidden
      >
        <IconUsers size={24} weight="fill" />
      </span>
      <p className="max-w-[320px] text-[13.5px] font-semibold leading-[1.5]" style={{ color: t.muted }}>
        {body}
      </p>
      <button
        type="button"
        onClick={onAddMore}
        className="mt-1 min-h-[44px] w-full max-w-[280px] cursor-pointer rounded-full text-[13px] font-extrabold"
        style={{ background: t.brand, color: t.onBrand }}
      >
        Add more people
      </button>
    </div>
  );
}
