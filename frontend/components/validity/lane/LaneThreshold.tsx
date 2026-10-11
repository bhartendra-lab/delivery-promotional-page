"use client";

import { useEffect, useRef } from "react";
import { eventTitleStyle } from "@/components/event/screens/lounge/eventTitleStyle";
import styles from "./lane.module.css";

/**
 * The welcome screen: one still, dark moment before anything moves.
 *
 * It says how long it has been, names the day, and offers one thing to do.
 * The tap matters for two reasons. A browser only lets music start from a
 * person's own gesture, so this is where it starts. And walking in by choice
 * is what makes the rest feel like a visit, not an advert.
 *
 * Behind the words is the Client's own photo, far out of focus: recognisable
 * as theirs, not yet readable. It comes into focus as the screen lifts.
 *
 * "Enter quietly" is the same door without the music, for someone on a bus.
 */
export function LaneThreshold({
  lead,
  eventName,
  eventDay,
  backdrop,
  leaving,
  canPlaySound,
  onEnter,
}: {
  /** "Aanya, it has been two months since" */
  lead: string;
  eventName: string;
  /** "Saturday, 14 February 2026", or null when the day is not known. */
  eventDay: string | null;
  /** A photo of theirs for the blurred backdrop, or null. */
  backdrop: string | null;
  /** The tap has happened: play the lifting away. */
  leaving: boolean;
  canPlaySound: boolean;
  onEnter: (withSound: boolean) => void;
}) {
  const button = useRef<HTMLButtonElement | null>(null);
  // The one thing to do on this screen is under the keyboard's hand from the start.
  useEffect(() => {
    button.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className={`${styles.threshold} ${leaving ? styles.thresholdLeaving : ""}`} role="dialog" aria-modal="true" aria-label="Your gallery">
      {backdrop && (
        // eslint-disable-next-line @next/next/no-img-element -- a small copy of the Client's own photo, blurred by the stylesheet
        <img className={styles.thresholdPhoto} src={backdrop} alt="" draggable={false} />
      )}
      <div className={styles.thresholdWash} />
      <div className={styles.thresholdInner}>
        <p className={styles.thresholdLead}>{lead}</p>
        <h1 className={styles.thresholdName} style={eventTitleStyle("mobile")}>
          {eventName}
        </h1>
        {eventDay && <p className={styles.thresholdDay}>{eventDay}</p>}
        <button ref={button} type="button" className={styles.thresholdEnter} onClick={() => onEnter(canPlaySound)} disabled={leaving}>
          <span className={styles.thresholdPlay} aria-hidden>
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M5 3l8 5-8 5z" />
            </svg>
          </span>
          Walk down memory lane
        </button>
        {canPlaySound && (
          <p className={styles.thresholdHint}>
            Best with sound on.{" "}
            <button type="button" className={styles.thresholdQuiet} onClick={() => onEnter(false)} disabled={leaving}>
              Enter quietly
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
