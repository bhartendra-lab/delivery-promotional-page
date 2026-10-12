"use client";

import type { CSSProperties } from "react";
import { favouriteCaption, type ValidityReel } from "@/lib/event-validity";
import type { LanePhoto } from "@/lib/memory-lane";
import { formatCount } from "@/lib/plans";
import { useCountUp, useInViewOnce } from "../motion";
import styles from "./lane.module.css";

const HEART = "M12 21s-7.500-4.700-9.600-9.300C.9 8.300 2.700 4.500 6.300 4.500c2.100 0 3.700 1.200 5.700 3.500 2-2.300 3.600-3.500 5.700-3.500 3.600 0 5.400 3.800 3.900 7.200C19.500 16.300 12 21 12 21z";

/** How each small print of the fan leans. Degrees. */
const FAN = [-9, -4, 2, 7, 12];

/**
 * What the day left behind, after the walk: a few true numbers, the one photo
 * everyone loved, and the ones the Client liked themselves.
 *
 * Nothing here is decoration. The numbers are the event's own (how many
 * photos, how many people have been to the gallery), the big print is the
 * photo with the most hearts in the gallery, and the small fan under it is
 * what this Client tapped a heart on. Any part with nothing true to show is
 * simply not there. How long the day ran is not among the numbers: it could
 * only come from the cameras' clocks, and those are not to be trusted.
 */
export function LaneKeepsakes({ reel, eventName, kept }: { reel: ValidityReel; eventName: string; kept: LanePhoto[] }) {
  const [ref, seen] = useInViewOnce<HTMLElement>({ threshold: 0.18 });
  const photos = useCountUp(reel.stats.photos, seen, 1400);
  const people = useCountUp(reel.stats.people, seen, 1400);
  const favourite = reel.favourite;
  const showNumbers = reel.stats.photos > 0;
  if (!showNumbers && !favourite && kept.length < 2) return null;

  const favouriteRatio = favourite?.width && favourite?.height ? favourite.width / favourite.height : 3 / 2;

  return (
    <section ref={ref} className={`${styles.keepsakes} ${seen ? styles.seen : ""}`} aria-label="What the day left behind">
      <div className={styles.keepsakesInner}>
        {showNumbers && (
          <div className={styles.numbers}>
            <p className={styles.eyebrow}>What the day left behind</p>
            <dl className={styles.numberList}>
              <div className={styles.number}>
                <dt>photos</dt>
                <dd>{formatCount(photos)}</dd>
              </div>
              {reel.stats.people > 1 && (
                <div className={styles.number}>
                  <dt>people in them</dt>
                  <dd>{formatCount(people)}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {favourite && (
          <figure className={styles.favourite}>
            <div className={styles.favouritePaper}>
              <div
                className={styles.favouritePhoto}
                style={{
                  width: `min(78vw, 460px, calc(clamp(260px, 54svh, 520px) * ${favouriteRatio.toFixed(4)}))`,
                  aspectRatio: String(favouriteRatio),
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- the reel's own small copy, served as it is */}
                <img src={favourite.url} alt={`The favourite photo from ${eventName}`} loading="lazy" decoding="async" draggable={false} />
              </div>
              <figcaption className={styles.favouriteCaption}>
                <span>{favouriteCaption(favourite)}</span>
                {favourite.hearts > 0 && (
                  <span className={styles.hearts}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d={HEART} />
                    </svg>
                    {formatCount(favourite.hearts)}
                    <span className="sr-only">{favourite.hearts === 1 ? " heart" : " hearts"}</span>
                  </span>
                )}
              </figcaption>
            </div>
          </figure>
        )}
      </div>

      {kept.length >= 2 && (
        <div className={styles.kept}>
          <p className={styles.keptTitle}>The ones you kept close</p>
          <div className={styles.fan} aria-hidden="true">
            {kept.map((photo, i) => (
              <div key={photo.url} className={styles.fanPrint} style={{ "--lean": `${FAN[i % FAN.length]}deg`, "--i": i } as CSSProperties}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the reel's own small copy, served as it is */}
                <img src={photo.url} alt="" loading="lazy" decoding="async" draggable={false} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
