"use client";

import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "./motion";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * A date that rolls into place digit by digit, like an odometer: "17 Oct 2026"
 * turning into "17 Jan 2027" when a Client picks a period.
 *
 * `from` is the date it rolls FROM (the event's current end). Each number in
 * `value` starts on the matching number of `from` and rolls to its own; words
 * (the month) simply read as the new one. The roll happens once, when `play`
 * first turns true. Until then, and for good under reduced motion, the plain
 * `value` is shown, so the card never displays a date it does not mean.
 *
 * A screen reader hears the date once, as text: the rolling columns are hidden
 * from it.
 */
export function RollingDate({ value, from, play }: { value: string; from?: string | null; play: boolean }) {
  const reduced = usePrefersReducedMotion();
  // false: digits sit on `from`. true: digits sit on `value`. Flipped one
  // frame after `play`, so the browser has painted the start to roll from.
  const [rolled, setRolled] = useState(false);
  useEffect(() => {
    if (!play || rolled || reduced) return;
    const frame = requestAnimationFrame(() => setRolled(true));
    return () => cancelAnimationFrame(frame);
  }, [play, rolled, reduced]);

  if (reduced || !play) return <span>{value}</span>;

  const tokens = value.split(" ");
  const fromTokens = (from ?? "").split(" ");
  let digitIndex = 0;
  return (
    <span>
      <span className="sr-only">{value}</span>
      <span aria-hidden>
        {tokens.map((token, t) => {
          const lead = t === 0 ? "" : " ";
          if (!/^\d+$/.test(token)) return <span key={t}>{lead + token}</span>;
          // Right-aligned against the old number, so 7 rolling to 17 starts
          // its tens digit on 0 rather than borrowing the old units.
          const before = /^\d+$/.test(fromTokens[t] ?? "") ? fromTokens[t].padStart(token.length, "0").slice(-token.length) : "";
          return (
            <span key={t}>
              {lead}
              {[...token].map((char, c) => {
                const showing = rolled ? Number(char) : Number(before[c] ?? 0);
                const index = digitIndex++;
                return (
                  <span key={c} className="validity-digit tabular-nums">
                    <span style={{ ["--d" as string]: showing, ["--i" as string]: index }}>
                      {DIGITS.map((digit) => (
                        <span key={digit}>{digit}</span>
                      ))}
                    </span>
                  </span>
                );
              })}
            </span>
          );
        })}
      </span>
    </span>
  );
}
