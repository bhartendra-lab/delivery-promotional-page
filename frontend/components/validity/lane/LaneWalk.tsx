"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { reelPhotoAlt } from "@/lib/event-validity";
import { WALK_LIGHTS, walkEndWords, walkEnds, walkLight, walkTags, type LanePhoto } from "@/lib/memory-lane";
import { startLaneWalk } from "./lane-engine";
import styles from "./lane.module.css";

/** Each print hangs a little differently from the one before. Degrees. */
const TILTS = [-2.2, 1.6, -1.2, 2.4, -1.8, 1.1, -2.6, 1.9, -0.9, 2.1];

/**
 * The line of the day: the Client's photos as prints pegged to a string of
 * lights. Twenty at the very most (WALK_PHOTO_MAX): it is a taste of the day,
 * and it ends by pointing at the gallery, where all of it is.
 *
 * This is the lane. The section is tall, its stage stays put, and scrolling
 * down slides the string sideways one pixel for every pixel scrolled: walking
 * the page IS walking past the photos. Each print hangs a little crooked and
 * sways from its peg.
 *
 * It is labelled with the Studio's own folder names ("Haldi", "Sangeet",
 * "Reception"), and with nothing else. A small paper tag hangs where each
 * folder begins, the line under the title names the folder of the print in
 * the middle of the screen, and the thin bar at the foot runs from the first
 * folder to the last. No date and no clock time is printed anywhere: a
 * camera's clock is whatever its owner last set it to. An event with no
 * folders simply has no labels.
 *
 * The light behind the string still turns as you walk, from morning gold to
 * night, but it follows how far along the line you are, not any clock.
 *
 * With reduced motion nothing is pinned and nothing sways: the string is an
 * ordinary strip to swipe along.
 */
export function LaneWalk({
  photos,
  photoCount,
  galleryUrl,
  eventName,
  reduced,
}: {
  photos: LanePhoto[];
  /** Every photo of the event, for the words after the last print. */
  photoCount: number;
  galleryUrl: string | null;
  eventName: string;
  reduced: boolean;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLElement | null>(null);
  const [index, setIndex] = useState(0);
  // The engine measures the row of prints and its tags, so it starts again
  // when either changes (a renamed folder changes a tag's width).
  const printsKey = photos.map((photo) => `${photo.url}#${photo.folder ?? ""}`).join("|");

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

  const tags = useMemo(() => walkTags(photos), [photos]);
  const ends = useMemo(() => walkEnds(photos), [photos]);
  const current = photos[Math.min(index, photos.length - 1)];
  const light = walkLight(index, photos.length);
  const after = walkEndWords(photos.length, photoCount);

  return (
    <section ref={sectionRef} className={`${styles.walk} ${reduced ? styles.walkPlain : ""}`} aria-label="The day, as it happened">
      <div className={styles.walkStage} ref={stageRef}>
        {WALK_LIGHTS.map((part) => (
          <div key={part} className={`${styles.walkTint} ${light === part ? styles.on : ""}`} data-part={part} aria-hidden="true" />
        ))}

        <header className={styles.walkHead}>
          <h2 className={styles.walkTitle}>The day, as it happened</h2>
          {/* The folder of the middle print, for the eye only: it changes as the page scrolls.
              With reduced motion nothing tracks the middle print, so the tags alone do the naming. */}
          <p className={styles.walkNow} aria-hidden="true">
            {(!reduced && current?.folder) || " "}
          </p>
        </header>

        <div className={styles.walkTrack} ref={trackRef}>
          <div className={styles.walkString} aria-hidden="true" />
          {photos.map((photo, i) => {
            const tag = tags[i];
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
                        alt={reelPhotoAlt(eventName, photo.folder)}
                        loading={i < 3 ? "eager" : "lazy"}
                        decoding="async"
                        draggable={false}
                      />
                    </div>
                    {/* The paper's wide bottom edge, as on an instant print. It carries a heart on the ones they liked. */}
                    <figcaption className={styles.hangCaption}>
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
            <p className={styles.walkEndLine}>{after.line}</p>
            <p className={styles.walkEndSub}>{after.sub}</p>
            {galleryUrl && (
              <a className={`${styles.btnGhost} ${styles.walkEndOpen}`} href={galleryUrl}>
                Open the gallery
              </a>
            )}
          </div>
        </div>

        <div className={styles.walkFoot} aria-hidden="true">
          <span>{ends.start}</span>
          <div className={styles.walkBar}>
            <i ref={barRef} />
          </div>
          <span>{ends.end}</span>
        </div>
      </div>
    </section>
  );
}
