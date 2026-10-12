"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { closesInLabel, formatValidityDate } from "@/lib/event-validity";
import { phoneSlotCount, type LanePhoto, type LaneSpec } from "@/lib/memory-lane";
import { formatCount } from "@/lib/plans";
import { LaneAtmosphere } from "./LaneAtmosphere";
import { startLaneHero, type LaneHeroHandle } from "./lane-engine";
import styles from "./lane.module.css";

/** A floating print's paper, in pixels before the stage scales it. */
const PRINT_WIDTH = 190;

/**
 * The first screen of the Client's memory lane, and what scrolling does to it.
 *
 * FIRST: one line about the day, and their own photos floating around it as
 * instant prints, each a little crooked, drifting slowly. The favourite is
 * the largest; the ones the Client liked carry a small heart.
 *
 * THEN, as the page scrolls: the prints leave their places, lose their paper
 * borders on the way, and settle into the grid of a phone, which is their
 * gallery. Beside it the page says the two things it came to say: every photo
 * is still there, and the date it is live till. Two choices sit under that:
 * open the gallery, or keep it longer.
 *
 * It is the marketing site's hero, with their photos in it (see lane-engine).
 * The stage is a screen tall and stays put while a much taller section scrolls
 * behind it; nothing here is fixed to the window.
 *
 * With no photo of any kind there is nothing to float and nothing to gather,
 * so the same words and the same two choices are simply on one still screen.
 */
export function LaneHero({
  spec,
  photos,
  eventName,
  eventDay,
  eventStamp,
  studioName,
  photoCount,
  peopleCount,
  endsAt,
  galleryUrl,
  hasWalk,
  entered,
  reduced,
  askLabel,
  onKeep,
}: {
  spec: LaneSpec;
  photos: LanePhoto[];
  eventName: string;
  eventDay: string | null;
  /** The event's day as a film camera stamps it, in the corner of every print.
   *  The same day on all of them: no photo's own date or time is ever shown. */
  eventStamp: string | null;
  studioName: string | null;
  photoCount: number;
  peopleCount: number;
  endsAt: number | null;
  galleryUrl: string | null;
  /** The line of the day follows, so "keep scrolling" is a true invitation. */
  hasWalk: boolean;
  /** The welcome screen has been tapped away. */
  entered: boolean;
  reduced: boolean;
  /** What the button that jumps to the end of the page says: "Keep it longer"
   *  on a renewal, "A small favour" on a keepsake (laneAskLabel). */
  askLabel: string;
  onKeep: () => void;
}) {
  const heroRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const objsRef = useRef<HTMLDivElement | null>(null);
  const copyRef = useRef<HTMLDivElement | null>(null);
  const copy2Ref = useRef<HTMLDivElement | null>(null);
  const cueRef = useRef<HTMLDivElement | null>(null);
  const phoneRef = useRef<HTMLDivElement | null>(null);
  const haloRef = useRef<HTMLDivElement | null>(null);
  const handle = useRef<LaneHeroHandle | null>(null);
  const enteredRef = useRef(entered);

  const floating = photos.length > 0;
  // The engine holds on to the prints' own elements, so it must start again
  // whenever they are replaced (a refreshed link can bring new copies).
  const printsKey = photos.map((photo) => photo.url).join("|");

  useEffect(() => {
    if (!floating) return;
    const hero = heroRef.current;
    const stage = stageRef.current;
    const objs = objsRef.current;
    const copy = copyRef.current;
    const copy2 = copy2Ref.current;
    const phone = phoneRef.current;
    const halo = haloRef.current;
    if (!hero || !stage || !objs || !copy || !copy2 || !phone || !halo) return;
    const started = startLaneHero({ hero, stage, objs, copy, copy2, cue: cueRef.current, phone, halo }, { reduced });
    handle.current = started;
    if (enteredRef.current) started.enter();
    return () => {
      started.dispose();
      handle.current = null;
    };
  }, [floating, printsKey, reduced]);

  useEffect(() => {
    enteredRef.current = entered;
    if (entered) handle.current?.enter();
  }, [entered]);

  const openTill = endsAt ? formatValidityDate(endsAt) : null;
  const gathered = photoCount > 0 ? `${formatCount(photoCount)} photos from that day.` : "Your photos from that day.";

  const words = (
    <>
      {eventDay && <p className={styles.eyebrow}>{eventDay}</p>}
      <h1 className={styles.headline}>{spec.headline}</h1>
      <p className={styles.heroName}>{eventName}</p>
    </>
  );

  const choices = (
    <div className={styles.choices}>
      <div className={styles.choiceRow}>
        {galleryUrl && (
          <a className={styles.btnGhost} href={galleryUrl}>
            Open the gallery
          </a>
        )}
        <button type="button" className={styles.btnSolid} onClick={onKeep}>
          {askLabel}
        </button>
      </div>
      {hasWalk && <p className={styles.choicesCue}>Or keep scrolling to walk through the day</p>}
    </div>
  );

  const stillHere = (
    <div className={styles.copy2Text}>
      <p className={styles.eyebrow}>Still here, every one of them</p>
      <h2 className={styles.gathered}>{gathered}</h2>
      {openTill && endsAt && (
        <p className={styles.openTill}>
          Your gallery is live till <strong>{openTill}</strong>.<span className={styles.chip}>{closesInLabel(endsAt)}</span>
        </p>
      )}
    </div>
  );

  if (!floating) {
    return (
      <section className={styles.heroQuiet}>
        <div className={styles.wash} />
        <LaneAtmosphere kind={spec.particles} />
        <div className={`${styles.quietInner} ${entered ? styles.entered : ""}`}>
          {words}
          {openTill && endsAt && (
            <p className={styles.openTill}>
              Your gallery is live till <strong>{openTill}</strong>.<span className={styles.chip}>{closesInLabel(endsAt)}</span>
            </p>
          )}
          {choices}
        </div>
      </section>
    );
  }

  const slots = phoneSlotCount(photos.length);
  const more = Math.max(0, photoCount - slots);
  const meta = [photoCount > 0 ? `${formatCount(photoCount)} photos` : null, peopleCount > 1 ? `${formatCount(peopleCount)} people` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className={styles.hero} ref={heroRef}>
      <div className={`${styles.stage} ${entered ? styles.entered : ""}`} ref={stageRef}>
        {/* Their own photo, far out of focus, is the room everything floats in. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a small copy of the Client's own photo, blurred by the stylesheet */}
        <img className={styles.backdrop} src={photos[0].url} alt="" draggable={false} />
        <div className={styles.wash} />
        <LaneAtmosphere kind={spec.particles} />

        <div className={styles.halo} ref={haloRef} />
        <div className={styles.phone} ref={phoneRef} aria-hidden="true">
          <div className={styles.bezel} />
          <div className={styles.screen}>
            <div className={styles.island} />
            <div className={styles.phoneHead}>
              <div className={styles.phoneStudio}>{studioName || "Your gallery"}</div>
              <div className={styles.phoneTitle}>{eventName}</div>
              {meta && <div className={styles.phoneMeta}>{meta}</div>}
              <div className={styles.phoneTabs}>
                <span className={styles.on}>All photos</span>
                <span>Favourites</span>
                <span>People</span>
              </div>
            </div>
            <div className={styles.phoneGrid}>
              {Array.from({ length: slots }, (_, i) => (
                <div key={i} className={styles.slot} data-slot="" />
              ))}
            </div>
            {more > 0 && <div className={styles.phoneMore}>and {formatCount(more)} more</div>}
          </div>
        </div>

        <div className={styles.objs} ref={objsRef} aria-hidden="true">
          {photos.map((photo) => (
            <div key={photo.url} className={styles.tile} data-tile="" style={{ "--w": `${PRINT_WIDTH}px` } as CSSProperties}>
              <div className={styles.paper}>
                <div className={styles.print}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- the reel's own small copy, served as it is */}
                  <img src={photo.url} alt="" draggable={false} decoding="async" />
                </div>
                <div className={styles.printFoot}>
                  {eventStamp && <span className={styles.stamp}>{eventStamp}</span>}
                  {photo.liked && (
                    <svg className={styles.printHeart} viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 21s-7.500-4.700-9.600-9.300C.9 8.300 2.700 4.500 6.300 4.500c2.100 0 3.700 1.200 5.700 3.500 2-2.300 3.600-3.500 5.700-3.500 3.600 0 5.400 3.800 3.900 7.200C19.500 16.300 12 21 12 21z" />
                    </svg>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.copy} ref={copyRef}>
          {words}
        </div>

        <div className={styles.cue} ref={cueRef} aria-hidden="true">
          <span>Scroll, slowly</span>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 6l4.500 4.500L12.500 6" />
          </svg>
        </div>

        <div className={styles.copy2} ref={copy2Ref}>
          {stillHere}
          {choices}
        </div>
      </div>
    </section>
  );
}
