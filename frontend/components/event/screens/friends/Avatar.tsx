"use client";

/**
 * A guest's face picture, or their initials when there is none.
 *
 * Shared by the card, the people rows and the My Group header, so the fallback
 * is decided in exactly one place. The colour is derived from `guest_id` rather
 * than random, so the same person is the same colour on every surface and
 * across reloads — that consistency is most of what makes initials readable as
 * an identity at all.
 *
 * Pictures are the backend's 256px WebP crop. Fixed `width`/`height` are set so
 * a row reserves its box before the image lands, and `loading="lazy"` keeps a
 * 150-person directory from firing 150 requests on open.
 */

import { useState } from "react";
import type { ClientTheme } from "@/lib/client-theme";

/** Warm hues only, to sit inside the guest palette rather than beside it.
 *  Picked for contrast against white text at the weight used below. */
const INITIAL_COLORS = [
  "#A8442A",
  "#8C5A2B",
  "#6B6036",
  "#3F6154",
  "#3C5A76",
  "#6A4A72",
  "#8A3F55",
  "#7A5230",
];

/** Stable per-guest hue. A plain sum is enough: the ids are Mongo ObjectIds,
 *  so their trailing characters vary well within one event. */
function colorFor(guestId: string): string {
  let sum = 0;
  for (let i = 0; i < guestId.length; i++) sum = (sum + guestId.charCodeAt(i)) % 997;
  return INITIAL_COLORS[sum % INITIAL_COLORS.length];
}

/** First letter of the first word, uppercased. Deliberately ONE letter: two
 *  initials require guessing which part of a name is the family name, and that
 *  guess is wrong in most of the naming conventions this product serves. */
function initialOf(name: string): string {
  const first = name.trim()[0];
  return first ? first.toUpperCase() : "·";
}

export function Avatar({
  t,
  guestId,
  name,
  url,
  size = 48,
  /** Ring in the accent colour — used for group members. */
  ringed = false,
}: {
  t: ClientTheme;
  guestId: string;
  name: string;
  url?: string | null;
  size?: number;
  ringed?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = !!url && !failed;

  return (
    <span
      // The name is on the row's own label, so this is decorative: announcing
      // "Priya" twice is worse than not announcing the picture.
      aria-hidden
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        background: showImage ? t.sunken : colorFor(guestId),
        boxShadow: ringed ? `0 0 0 2px ${t.brand}` : undefined,
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="font-extrabold leading-none text-white"
          style={{ fontSize: Math.round(size * 0.4) }}
        >
          {initialOf(name)}
        </span>
      )}
    </span>
  );
}
