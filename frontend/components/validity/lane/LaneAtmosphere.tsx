import type { CSSProperties } from "react";
import type { LaneParticles } from "@/lib/memory-lane";
import styles from "./lane.module.css";

/**
 * What drifts through the air of the page, by the kind of day it was: petals
 * for a wedding or an anniversary, confetti for a birthday, slow points of
 * light for anything else.
 *
 * Fourteen small shapes, each with its own place, size, pace and delay. They
 * are worked out from a fixed seed, not at random, so the page looks the same
 * every time it is drawn. The stylesheet does the moving (transform and
 * opacity only) and switches every one of them off under reduced motion.
 * Decorative: hidden from a screen reader and never in the way of a tap.
 */

const COUNT = 14;

/** A small repeatable sequence, 0 to 1. */
function sequence(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const SPECKS = (() => {
  const next = sequence(11);
  return Array.from({ length: COUNT }, (_, i) => ({
    left: Math.round(next() * 100),
    size: 0.6 + next() * 0.9,
    duration: 14 + next() * 14,
    delay: -next() * 24,
    sway: (next() - 0.5) * 2,
    tone: i % 4,
  }));
})();

export function LaneAtmosphere({ kind }: { kind: LaneParticles }) {
  return (
    <div className={styles.specks} data-kind={kind} aria-hidden="true">
      {SPECKS.map((speck, i) => (
        <i
          key={i}
          data-tone={speck.tone}
          style={
            {
              left: `${speck.left}%`,
              "--size": speck.size.toFixed(2),
              "--dur": `${speck.duration.toFixed(1)}s`,
              "--delay": `${speck.delay.toFixed(1)}s`,
              "--sway": speck.sway.toFixed(2),
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
