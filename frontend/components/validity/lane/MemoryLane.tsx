"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PLATFORM_SKIN } from "@/lib/client-theme";
import { closesInLabel, formatEventDay, formatValidityDate, type ValidityLinkView } from "@/lib/event-validity";
import { filmStamp, heroPhotos, keptClosePhotos, laneSpecOf, thresholdLead, timeSinceLabel, walkPhotos } from "@/lib/memory-lane";
import { usePrefersReducedMotion } from "../motion";
import { ValidityQuestion } from "../ValidityQuestion";
import { LaneHero } from "./LaneHero";
import { LaneKeepsakes } from "./LaneKeepsakes";
import { LaneThreshold } from "./LaneThreshold";
import { LaneWalk } from "./LaneWalk";
import { useMemoryScore } from "./useMemoryScore";
import styles from "./lane.module.css";

/** How long the welcome screen takes to lift away, in ms. Matches the stylesheet. */
const LIFT_MS = 1300;

type Door = "closed" | "opening" | "open";

/**
 * The Client's validity page, as a walk down memory lane.
 *
 * It is opened about two months after the day, from a WhatsApp message, by
 * someone who has mostly stopped opening the gallery. So before it asks for
 * anything it gives the day back, in five beats:
 *
 *   1. The door      one still screen: how long it has been, the day's name,
 *                    one button. The tap starts the music.
 *   2. The flood     their photos floating as prints around one line about
 *                    the day; scrolling gathers them into a phone, beside the
 *                    date the gallery is live till and two plain choices.
 *   3. The lane      the day in order, prints pegged to a string of lights
 *                    that slides past as the page scrolls.
 *   4. Keepsakes     a few true numbers, the favourite, the ones they liked.
 *   5. The note      the question itself, on paper, with the music turned
 *                    down: when it closes, what that means, what it costs to
 *                    keep it, and that not keeping it is fine too.
 *
 * The mood (words, colours, what drifts in the air, which score plays) follows
 * the kind of event the Studio set: a wedding is not a birthday.
 *
 * The date the gallery is live till is never out of reach: it is in beat 2,
 * on a small pill that follows the walk, and at the top of the note.
 *
 * PUBLIC, and reached only from a link sent to one Client. Every photo here is
 * one of the reel's own small copies, never a gallery photo's address.
 */
export function MemoryLane({ token, view, onRefresh }: { token: string; view: ValidityLinkView; onRefresh: () => Promise<void> }) {
  const reduced = usePrefersReducedMotion();
  const spec = useMemo(() => laneSpecOf(view.event_type), [view.event_type]);
  const photos = useMemo(() => heroPhotos(view), [view]);
  const walk = useMemo(() => walkPhotos(view.reel), [view.reel]);
  const kept = useMemo(() => keptClosePhotos(view.reel), [view.reel]);
  const score = useMemoryScore(spec.score);
  const { setDucked, start: startScore } = score;

  const [door, setDoor] = useState<Door>("closed");
  const [pastHero, setPastHero] = useState(false);
  const [noteInView, setNoteInView] = useState(false);
  const heroEnd = useRef<HTMLDivElement | null>(null);
  const note = useRef<HTMLDivElement | null>(null);
  const liftTimer = useRef(0);

  const eventName = view.event_name?.trim() || "Your gallery";
  const eventDay = view.event_date ? formatEventDay(view.event_date) : null;
  const lead = useMemo(() => thresholdLead(view.client_first_name, timeSinceLabel(view.event_date)), [view.client_first_name, view.event_date]);

  /* ── the door ─────────────────────────────────────────────────── */

  const enter = useCallback(
    (withSound: boolean) => {
      // In the tap itself: a browser will not start sound from anywhere else.
      if (withSound) startScore();
      window.scrollTo(0, 0);
      setDoor("opening");
      window.clearTimeout(liftTimer.current);
      liftTimer.current = window.setTimeout(() => setDoor("open"), reduced ? 0 : LIFT_MS);
    },
    [startScore, reduced],
  );

  useEffect(() => () => window.clearTimeout(liftTimer.current), []);

  // Nothing scrolls behind the welcome screen.
  useEffect(() => {
    if (door !== "closed") return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [door]);

  /* ── where the reader is ──────────────────────────────────────── */

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const watch = (node: Element | null, onChange: (entry: IntersectionObserverEntry) => void, options?: IntersectionObserverInit) => {
      if (!node) return null;
      const observer = new IntersectionObserver((entries) => entries.forEach(onChange), options);
      observer.observe(node);
      return observer;
    };
    // The marker sits where the first screen ends: once it has gone off the
    // top of the screen, the reader is past it.
    const hero = watch(heroEnd.current, (entry) => setPastHero(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    const question = watch(note.current, (entry) => setNoteInView(entry.isIntersecting), { rootMargin: "0px 0px -30% 0px" });
    return () => {
      hero?.disconnect();
      question?.disconnect();
    };
  }, []);

  // The music steps back while the page asks its one question.
  useEffect(() => {
    setDucked(noteInView);
  }, [noteInView, setDucked]);

  const goToNote = useCallback(() => {
    document.getElementById("keep")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [reduced]);

  const vars = {
    "--l-bg0": spec.palette.bg0,
    "--l-bg1": spec.palette.bg1,
    "--l-glow": spec.palette.glow,
    "--l-accent": spec.palette.accent,
    "--l-on-accent": spec.palette.onAccent,
    fontFamily: PLATFORM_SKIN.font,
  } as CSSProperties;

  const entered = door !== "closed";
  const showPill = door === "open" && pastHero && !noteInView && view.ends_at != null;

  return (
    <main className={styles.lane} style={vars} data-mood={spec.mood}>
      {door !== "open" && (
        <LaneThreshold
          lead={lead}
          eventName={eventName}
          eventDay={eventDay}
          // The cover the Studio chose for this gallery is the first thing the
          // Client ever saw of it, so it is what waits behind the door; failing
          // that, their favourite photo.
          backdrop={view.cover ?? photos[0]?.url ?? null}
          leaving={door === "opening"}
          canPlaySound={score.available}
          onEnter={enter}
        />
      )}

      {/* Who made the photos, and the one control the music has. */}
      <div className={`${styles.bar} ${entered ? styles.barIn : ""} ${noteInView ? styles.barOnPaper : ""}`}>
        <p className={styles.barStudio}>{view.studio_name ? `Photos by ${view.studio_name}` : " "}</p>
        {score.available && (
          <button
            type="button"
            className={styles.sound}
            onClick={score.toggle}
            aria-pressed={score.playing}
            aria-label={score.playing ? "Turn the music off" : "Turn the music on"}
          >
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3.500 7.800h2.700L10 4.600v10.800L6.200 12.200H3.500z" fill="currentColor" stroke="none" />
              {score.playing ? (
                <>
                  <path d="M12.800 7.600a3.400 3.400 0 0 1 0 4.800" />
                  <path d="M14.900 5.600a6.200 6.200 0 0 1 0 8.800" />
                </>
              ) : (
                <path d="M13 8l4 4m0-4l-4 4" />
              )}
            </svg>
          </button>
        )}
      </div>

      <LaneHero
        spec={spec}
        photos={photos}
        eventName={eventName}
        eventDay={eventDay}
        eventStamp={filmStamp(view.event_date)}
        studioName={view.studio_name}
        photoCount={view.reel?.stats.photos ?? 0}
        peopleCount={view.reel?.stats.people ?? 0}
        endsAt={view.ends_at}
        galleryUrl={view.gallery_url}
        hasWalk={walk.length > 0}
        entered={entered}
        reduced={reduced}
        onKeep={goToNote}
      />
      <div ref={heroEnd} className={styles.marker} aria-hidden="true" />

      {view.reel && walk.length > 0 && <LaneWalk photos={walk} reel={view.reel} eventName={eventName} reduced={reduced} />}
      {view.reel && <LaneKeepsakes reel={view.reel} eventName={eventName} kept={kept} />}

      <div ref={note}>
        <ValidityQuestion t={PLATFORM_SKIN} token={token} view={view} eventName={eventName} onRefresh={onRefresh} />
      </div>

      {/* The date, within reach for the whole walk. It steps aside once the note is on screen. */}
      {view.ends_at != null && (
        <div className={`${styles.pill} ${showPill ? styles.pillIn : ""}`} aria-hidden={!showPill}>
          <span className={styles.pillDate}>
            <span>
              Live till <strong>{formatValidityDate(view.ends_at)}</strong>
            </span>
            <em>{closesInLabel(view.ends_at)}</em>
          </span>
          <button type="button" className={styles.pillGo} onClick={goToNote} tabIndex={showPill ? 0 : -1}>
            Keep it longer
          </button>
        </div>
      )}
    </main>
  );
}
