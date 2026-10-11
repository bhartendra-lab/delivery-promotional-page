"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import { formatClockTime, istHour, lastPhotoLine, partOfDay, reelPhotoAlt, type PartOfDay, type ValidityReel } from "@/lib/event-validity";
import type { LanePhoto } from "@/lib/memory-lane";
import { startLaneWalk } from "./lane-engine";
import styles from "./lane.module.css";

type Part = PartOfDay;

const PARTS: readonly Part[] = ["morning", "afternoon", "golden", "night"];
const PART_LABEL: Record<Part, string> = { morning: "Morning", afternoon: "Afternoon", golden: "Golden hour", night: "Night" };

/** Each print hangs a little differently from the one before. Degrees. */
const TILTS = [-2.2, 1.6, -1.2, 2.4, -1.8, 1.1, -2.6, 1.9, -0.9, 2.1];

/** The part of the day a print was taken in, when its camera time can be trusted. */
const partOf = (photo: LanePhoto): Part | null =>
  photo.timeReliable && photo.capturedAt != null ? partOfDay(istHour(photo.capturedAt)) : null;

/**
 * The line of the day: the Client's photos as prints pegged to a string of
 * lights, in the order they were taken.
 *
 * This is the lane. The section is tall, its stage stays put, and scrolling
 * down slides the string sideways one pixel for every pixel scrolled: walking
 * the page IS walking past the photos. Each print hangs a little crooked and
 * sways from its peg. Under it, in the paper's wide bottom edge, is the time it
 * was taken, but only when that time came from the camera itself.
 *
 * The day passes as you walk: the light behind the string turns from morning
 * gold to afternoon, to the apricot of golden hour, to night, following the
 * print in the middle of the screen, and a small paper tag hangs where each
 * part of the day begins. After the last print the string ends in one line of
 * words, and the page scrolls on.
 *
 * With reduced motion nothing is pinned and nothing sways: the string is an
 * ordinary strip to swipe along.
 */
export function LaneWalk({
  photos,
  reel,
  eventName,
  reduced,
}: {
  photos: LanePhoto[];
  reel: ValidityReel;
  eventName: string;
  reduced: boolean;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLElement | null>(null);
  const [index, setIndex] = useState(0);
  // The engine measures the row of prints, so it starts again when they change.
  const printsKey = photos.map((photo) => photo.url).join("|");

  useEffect(() => {
    if (reduced) return;
    const section = sectionRef.current;
    const stage = stageRef.current;
    const track = trackRef.current;
    if (!section || !stage || !track) return;
    return startLaneWalk({ section, stage, track, bar: barRef.current }, { count: photos.length, onIndex: setIndex });
    // `photos.length` is read inside; `printsKey` covers it and any change of copies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printsKey, reduced]);

  const current = photos[Math.min(index, photos.length - 1)];
  const currentPart = current ? partOf(current) : null;
  const first = photos[0];
  const last = photos[photos.length - 1];
  const firstTime = first && first.timeReliable && first.capturedAt != null ? formatClockTime(first.capturedAt) : null;
  const lastTime = last && last.timeReliable && last.capturedAt != null ? formatClockTime(last.capturedAt) : null;
  const now =
    current && currentPart && current.capturedAt != null ? `${PART_LABEL[currentPart]}, ${formatClockTime(current.capturedAt)}` : null;

  // A paper tag hangs before the first print of each part of the day.
  const tags: Array<string | null> = [];
  let shownPart: Part | null = null;
  for (const photo of photos) {
    const part = partOf(photo);
    tags.push(part && part !== shownPart ? PART_LABEL[part] : null);
    if (part) shownPart = part;
  }

  return (
    <section ref={sectionRef} className={`${styles.walk} ${reduced ? styles.walkPlain : ""}`} aria-label="The day, as it happened">
      <div className={styles.walkStage} ref={stageRef}>
        {PARTS.map((part) => (
          <div key={part} className={`${styles.walkTint} ${currentPart === part ? styles.on : ""}`} data-part={part} aria-hidden="true" />
        ))}

        <header className={styles.walkHead}>
          <h2 className={styles.walkTitle}>The day, as it happened</h2>
          {/* What the middle print says, for the eye only: it changes as the page scrolls. */}
          <p className={styles.walkNow} aria-hidden="true">
            {now ?? " "}
          </p>
        </header>

        <div className={styles.walkTrack} ref={trackRef}>
          <div className={styles.walkString} aria-hidden="true" />
          {photos.map((photo, i) => {
            const tag = tags[i];
            const time = photo.timeReliable && photo.capturedAt != null ? formatClockTime(photo.capturedAt) : null;
            return (
              <Fragment key={photo.url}>
                {tag && (
                  <div className={styles.walkTag} aria-hidden="true">
                    <span>{tag}</span>
                  </div>
                )}
                <figure
                  className={styles.hang}
                  data-reel-thumb={i}
                  style={{ "--tilt": `${TILTS[i % TILTS.length]}deg`, "--swing": `${(5.5 + (i % 4) * 0.9).toFixed(1)}s` } as CSSProperties}
                >
                  <span className={styles.peg} aria-hidden="true" />
                  <div className={styles.hangPaper}>
                    <div
                      className={styles.hangPhoto}
                      style={{ width: `min(78vw, calc(var(--hang-h) * ${photo.ratio.toFixed(4)}))`, aspectRatio: String(photo.ratio) }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- the reel's own small copy, served as it is */}
                      <img
                        src={photo.url}
                        alt={reelPhotoAlt(eventName, { captured_at: photo.capturedAt, time_reliable: photo.timeReliable })}
                        loading={i < 3 ? "eager" : "lazy"}
                        decoding="async"
                        draggable={false}
                      />
                    </div>
                    <figcaption className={styles.hangCaption}>
                      <span>{time ?? " "}</span>
                      {photo.liked && (
                        <svg className={styles.hangHeart} viewBox="0 0 24 24" role="img" aria-label="One you liked">
                          <path d="M12 21s-7.500-4.700-9.600-9.300C.9 8.300 2.700 4.500 6.300 4.500c2.100 0 3.700 1.200 5.700 3.500 2-2.300 3.600-3.500 5.700-3.500 3.600 0 5.400 3.800 3.900 7.200C19.500 16.300 12 21 12 21z" />
                        </svg>
                      )}
                    </figcaption>
                  </div>
                </figure>
              </Fragment>
            );
          })}
          <div className={styles.walkEnd}>
            <p className={styles.walkEndLine}>{lastPhotoLine(reel) ?? "And that was the last one."}</p>
            <p className={styles.walkEndSub}>Every one of them is still in your gallery.</p>
          </div>
        </div>

        <div className={styles.walkFoot} aria-hidden="true">
          <span>{firstTime ?? "The start"}</span>
          <div className={styles.walkBar}>
            <i ref={barRef} />
          </div>
          <span>{lastTime ?? "The end"}</span>
        </div>
      </div>
    </section>
  );
}
