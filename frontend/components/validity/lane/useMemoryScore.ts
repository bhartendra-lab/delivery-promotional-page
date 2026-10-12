"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LANE_TRACKS, SCORES, midiToHz, stepSeconds, type LaneScoreId, type ScoreNote } from "@/lib/memory-lane";

/**
 * The music under the Client's memory lane page.
 *
 * It begins on the tap that opens the page and at no other time: a browser
 * only lets sound start from a person's own gesture, and nobody should be
 * surprised by music. From then on one small button turns it off and on, it
 * falls silent whenever the tab is hidden, and it drops to a murmur while the
 * page is asking its one question (`setDucked`).
 *
 * There is no audio file. The three scores in lib/memory-lane.ts (a slow waltz,
 * a music box, an open drift) are played through the browser's own
 * synthesiser: soft sine tones with a long tail, through a little reverb. It
 * costs no download, plays on a weak connection, and is nobody else's
 * recording. When a recorded track is licensed, name it in LANE_TRACKS and it
 * is played instead.
 *
 * A phone on silent stays silent: that switch is respected, not worked around.
 *
 * THREE THINGS KEEP IT CLEAN on a page that is busy drawing while it plays:
 *
 *   - the browser is asked for its long, safe output buffer (`latencyHint:
 *     "playback"`). The default is the short one meant for games, which runs
 *     dry and crackles the moment the device is busy; nothing here needs a
 *     fast response, so the page trades a tenth of a second of delay for sound
 *     that does not break up.
 *   - notes are booked well ahead of the clock (SCHEDULE_AHEAD_SECONDS), so a
 *     page that stalls for a second while it scrolls does not drop or bunch
 *     them. The score never changes, so booking early costs nothing.
 *   - nothing changes the level except the one master gain. There is no
 *     compressor or limiter: at MASTER_LEVEL the busiest bar of any score
 *     peaks at about a third of full scale (measured on an offline render of
 *     all three), so there is nothing to catch, and a gain that follows the
 *     signal can only add distortion of its own to the low notes.
 */

/**
 * How loud the whole thing is: quiet enough to talk over. If the scores, the
 * voices or the room below are changed, check the peak again before raising it.
 */
const MASTER_LEVEL = 0.244;
/** Its level while the page asks its question. */
const DUCKED_LEVEL = 0.4;
/** A recorded track's volume at full level. */
const TRACK_LEVEL = 0.55;
/** How far ahead of the clock notes are booked. Longer than any stall a page that still works has. */
const SCHEDULE_AHEAD_SECONDS = 1.5;
/** How often the booking is topped up. A browser may slow this to once a second; that still fits. */
const SCHEDULE_EVERY_MS = 250;
/** How long after the fade to silence the audio clock is stopped: time for the fade to reach the speaker. */
const SUSPEND_AFTER_MS = 800;

type Engine = {
  resume: () => void;
  pause: () => void;
  /** 0 to 1 of the engine's own full level. */
  setLevel: (level: number) => void;
  close: () => void;
};

type Partial3 = readonly [multiple: number, level: number, type: OscillatorType];

/** A felted piano: the note, a soft octave, a breath of the twelfth, and a slightly detuned twin. */
const KEYS: readonly Partial3[] = [
  [1, 1, "sine"],
  [2, 0.28, "sine"],
  [3, 0.08, "sine"],
  [1.003, 0.35, "triangle"],
];
/** A music box: the note with two glassy overtones that are not quite in tune, as on a real comb. */
const BELL: readonly Partial3[] = [
  [1, 1, "sine"],
  [2, 0.12, "sine"],
  [3.01, 0.22, "sine"],
  [5.4, 0.06, "sine"],
];
/** Low notes carry their octave and twelfth, which is all a phone's speaker can play of them. */
const BASS: readonly Partial3[] = [
  [1, 1, "sine"],
  [2, 0.5, "sine"],
  [3, 0.12, "sine"],
];

/** A soft, dark room: noise that fades out and loses its brightness as it does. */
function roomImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const k = 0.25 + 0.6 * t;
      last = last * k + (Math.random() * 2 - 1) * (1 - k);
      data[i] = last * Math.pow(1 - t, 2.6);
    }
  }
  return buffer;
}

function createSynth(scoreId: LaneScoreId): Engine | null {
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  // The long output buffer; see the note at the top. A browser too old to
  // know the option gets its default.
  let ctx: AudioContext;
  try {
    ctx = new Ctor({ latencyHint: "playback" });
  } catch {
    ctx = new Ctor();
  }
  const score = SCORES[scoreId];
  const step = stepSeconds(score);

  // voices -> tone -> (dry + room) -> master -> out
  const master = ctx.createGain();
  master.gain.value = 0;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 3400;
  tone.Q.value = 0.3;
  const dry = ctx.createGain();
  dry.gain.value = 0.8;
  const wet = ctx.createGain();
  wet.gain.value = 0.42;
  const room = ctx.createConvolver();
  room.buffer = roomImpulse(ctx, 3.4);
  tone.connect(dry);
  dry.connect(master);
  tone.connect(room);
  room.connect(wet);
  wet.connect(master);
  master.connect(ctx.destination);

  function pad(hz: number, when: number, seconds: number, vel: number) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(vel * 0.5, when + seconds * 0.4);
    gain.gain.linearRampToValueAtTime(0.0001, when + seconds + 1.2);
    const soft = ctx.createBiquadFilter();
    soft.type = "lowpass";
    soft.frequency.value = 900;
    gain.connect(soft);
    soft.connect(tone);
    for (const detune of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = hz;
      osc.detune.value = detune;
      osc.connect(gain);
      osc.start(when);
      osc.stop(when + seconds + 1.3);
    }
  }

  function play(note: ScoreNote, when: number) {
    const hz = midiToHz(note.midi);
    const seconds = note.len * step;
    if (note.voice === "pad") {
      pad(hz, when, seconds, note.vel);
      return;
    }
    const partials = note.voice === "bell" ? BELL : note.voice === "bass" ? BASS : KEYS;
    // How long the note rings: struck, then left to die away, like a key held down.
    const ring = note.voice === "bell" ? 1.6 : note.voice === "bass" ? Math.max(1.8, seconds * 1.2) : Math.max(1.4, seconds * 1.6);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(note.vel, when + (note.voice === "bass" ? 0.02 : 0.008));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + ring);
    gain.connect(tone);
    for (const [multiple, level, type] of partials) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = hz * multiple;
      const part = ctx.createGain();
      part.gain.value = level;
      osc.connect(part);
      part.connect(gain);
      osc.start(when);
      osc.stop(when + ring + 0.05);
    }
  }

  // Each bar's notes by the step they fall on.
  const bars = score.bars.map((bar) => {
    const steps: ScoreNote[][] = Array.from({ length: score.stepsPerBar }, () => []);
    for (const note of bar) steps[note.at]?.push(note);
    return steps;
  });
  let barIndex = 0;
  let stepIndex = 0;
  let nextTime = ctx.currentTime + 0.15;

  // Notes are booked well ahead of the clock, so a busy page never makes the
  // music stumble. Only after a stall longer than that does it skip ahead.
  function schedule() {
    if (ctx.state !== "running") return;
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + SCHEDULE_AHEAD_SECONDS) {
      for (const note of bars[barIndex][stepIndex]) {
        // A human hand is never exactly on the beat.
        play(note, nextTime + (note.voice === "bass" || note.voice === "pad" ? 0 : Math.random() * 0.012));
      }
      nextTime += step;
      stepIndex += 1;
      if (stepIndex >= score.stepsPerBar) {
        stepIndex = 0;
        barIndex = (barIndex + 1) % bars.length;
      }
    }
  }
  const timer = window.setInterval(schedule, SCHEDULE_EVERY_MS);

  let level = 1;
  let suspendTimer = 0;
  const apply = (seconds: number) => master.gain.setTargetAtTime(MASTER_LEVEL * level, ctx.currentTime, seconds);

  return {
    resume: () => {
      window.clearTimeout(suspendTimer);
      void ctx.resume().then(() => {
        apply(0.9);
        schedule();
      });
    },
    pause: () => {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      window.clearTimeout(suspendTimer);
      suspendTimer = window.setTimeout(() => void ctx.suspend(), SUSPEND_AFTER_MS);
    },
    setLevel: (next) => {
      level = next;
      if (ctx.state === "running") apply(0.5);
    },
    close: () => {
      window.clearInterval(timer);
      window.clearTimeout(suspendTimer);
      void ctx.close().catch(() => undefined);
    },
  };
}

/** A recorded track, looped. Used only when LANE_TRACKS names one. */
function createTrack(url: string): Engine {
  const audio = new Audio(url);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0;
  let level = 1;
  let target = 0;
  let raf = 0;
  const fade = () => {
    const diff = target - audio.volume;
    if (Math.abs(diff) < 0.01) {
      audio.volume = target;
      if (target === 0) audio.pause();
      return;
    }
    audio.volume = Math.min(1, Math.max(0, audio.volume + diff * 0.08));
    raf = requestAnimationFrame(fade);
  };
  const fadeTo = (next: number) => {
    target = next;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(fade);
  };
  return {
    resume: () => {
      void audio.play().catch(() => undefined);
      fadeTo(TRACK_LEVEL * level);
    },
    pause: () => fadeTo(0),
    setLevel: (next) => {
      level = next;
      if (!audio.paused) fadeTo(TRACK_LEVEL * level);
    },
    close: () => {
      cancelAnimationFrame(raf);
      audio.pause();
      audio.removeAttribute("src");
    },
  };
}

export type MemoryScore = {
  /** Music is on right now. */
  playing: boolean;
  /** False once a browser has turned out to have no way to play it. */
  available: boolean;
  /** Start the music. Call it from a tap or a click, never from an effect. */
  start: () => void;
  /** The sound button. */
  toggle: () => void;
  /** Lower it while the page asks its question, and bring it back after. */
  setDucked: (ducked: boolean) => void;
};

export function useMemoryScore(scoreId: LaneScoreId): MemoryScore {
  const engine = useRef<Engine | null>(null);
  const on = useRef(false);
  const ducked = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [available, setAvailable] = useState(true);

  const start = useCallback(() => {
    if (!engine.current) {
      try {
        const track = LANE_TRACKS[scoreId];
        engine.current = track ? createTrack(track) : createSynth(scoreId);
      } catch {
        engine.current = null;
      }
      if (!engine.current) {
        setAvailable(false);
        return;
      }
    }
    engine.current.setLevel(ducked.current ? DUCKED_LEVEL : 1);
    engine.current.resume();
    on.current = true;
    setPlaying(true);
  }, [scoreId]);

  const toggle = useCallback(() => {
    if (!engine.current || !on.current) {
      start();
      return;
    }
    engine.current.pause();
    on.current = false;
    setPlaying(false);
  }, [start]);

  const setDucked = useCallback((next: boolean) => {
    ducked.current = next;
    engine.current?.setLevel(next ? DUCKED_LEVEL : 1);
  }, []);

  // A hidden tab is a silent tab. It picks up where it stopped on the way back.
  useEffect(() => {
    const onVisibility = () => {
      if (!engine.current || !on.current) return;
      if (document.hidden) engine.current.pause();
      else engine.current.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(
    () => () => {
      engine.current?.close();
      engine.current = null;
    },
    [],
  );

  return { playing, available, start, toggle, setDucked };
}
