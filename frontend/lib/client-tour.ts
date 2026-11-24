/**
 * Pure. The Client's guided tour of the gallery: what each step points at,
 * what it asks for, and what it says in English and Hindi. The web
 * (components/event/tour) and the app (src/gallery/tour) each draw it their
 * own way; this file is the single script both follow, synced into the app by
 * `npm run core:sync`.
 *
 * WHO SEES IT
 * Only a Client (is_client) in an event whose collections are on: the three
 * things it teaches are the Client's own tools.
 *
 * THREE PARTS, EACH SHOWN ONCE
 *   "guest-control"  as soon as the Client reaches the lounge after signing in.
 *                    Why: give special access and album edit to the guests
 *                    whose decision matters.
 *   "face-filter"    the first time the gallery's face bar is on screen.
 *                    Why: find the photos with your loved ones in a tap.
 *   "selection"      straight after "face-filter" (or on the first gallery
 *                    visit when the event has no face bar). Why: make the
 *                    album selection between Client and studio easy. The last
 *                    "send to the studio" step only TELLS: nothing is sent.
 *
 * Skipping ends the whole tour (every part is marked seen) and points at the
 * profile, where "Watch the tour" replays it.
 */

export type TourLang = "en" | "hi";
export type TourId = "guest-control" | "face-filter" | "selection";
export const TOUR_ORDER: readonly TourId[] = ["guest-control", "face-filter", "selection"];

/** The things a step can point at. Each platform maps these to its own
 *  elements (web: `data-tour="…"`; app: <TourTarget id="…">). */
export type TourTarget =
  | "profile"
  | "profile-guest-control"
  | "profile-tour"
  | "gc-passcode"
  | "gc-people"
  | "face-bar"
  | "face-box"
  | "photo-menu"
  | "menu-collect"
  | "save-sheet"
  | "nav-liked"
  | "segment-collections"
  | "review-send";

/**
 * How a step moves on.
 *   "tap"   the Client taps the highlighted control itself (it works as
 *           normal); the step after waits for what that opens.
 *   "next"  the card's button.
 *   "gone"  the highlighted thing closes (a sheet the Client is using, with
 *           its own Done button). The card has no button of its own: the
 *           sheet's work is the Client's to finish.
 */
export type TourAdvance = "tap" | "next" | "gone";

/** Something the platform does as a step opens: close the sheets the tour
 *  opened, or bring back the bottom nav a scroll folded away. */
export type TourAction = "close-overlays" | "reveal-nav";

type Copy = { title: string; body: string; cta?: string };

export type TourStep = {
  key: string;
  /** Nothing: a card in the middle of the screen. Several: the box around
   *  all of them that are on screen (the face bar and its open picker). */
  target?: TourTarget | readonly TourTarget[];
  advance: TourAdvance;
  /** May the Client use what is highlighted? "tap" steps always can; a
   *  "next" step only when this says so. The send step says no: it is there
   *  to be read, never pressed by accident mid-tour. */
  interactive?: boolean;
  /** Runs as the step opens. */
  action?: TourAction;
  /** A step whose target never appears is shown as a centred card instead,
   *  unless it is optional, when it is passed over. */
  optional?: boolean;
  copy: Record<TourLang, Copy>;
};

/* ── the script ─────────────────────────────────────────────────────────── */

const GUEST_CONTROL: readonly TourStep[] = [
  {
    key: "welcome",
    advance: "next",
    copy: {
      en: {
        title: "Welcome! This gallery is yours",
        body: "As the Client you have a few special tools. Let us show you around — it takes less than a minute.",
        cta: "Start the tour",
      },
      hi: {
        title: "स्वागत है! यह गैलरी आपकी है",
        body: "Client होने के नाते आपके पास कुछ ख़ास टूल हैं। चलिए, एक मिनट में सब दिखाते हैं।",
        cta: "टूर शुरू करें",
      },
    },
  },
  {
    key: "open-profile",
    target: "profile",
    advance: "tap",
    copy: {
      en: { title: "Your profile", body: "Your tools live here. Tap your profile to open it." },
      hi: { title: "आपकी प्रोफ़ाइल", body: "आपके सारे टूल यहीं हैं। प्रोफ़ाइल खोलने के लिए इस पर टैप करें।" },
    },
  },
  {
    key: "open-guest-control",
    target: "profile-guest-control",
    advance: "tap",
    copy: {
      en: {
        title: "Guest Control",
        body: "Decide who gets special access and who helps edit the album. Tap Guest Control.",
      },
      hi: {
        title: "Guest Control",
        body: "तय करें कि किसे ख़ास एक्सेस मिले और कौन एल्बम चुनने में मदद करे। Guest Control पर टैप करें।",
      },
    },
  },
  {
    key: "passcode",
    target: "gc-passcode",
    advance: "next",
    copy: {
      en: {
        title: "Special access",
        body: "Share this family passcode with the people who matter most. With it they see every photo, not only the ones they are in.",
      },
      hi: {
        title: "ख़ास एक्सेस",
        body: "यह फ़ैमिली पासकोड अपने सबसे ख़ास लोगों के साथ शेयर करें। इससे वे सारी फ़ोटो देख पाएँगे, सिर्फ़ अपनी नहीं।",
      },
    },
  },
  {
    key: "album-edit",
    target: "gc-people",
    advance: "next",
    copy: {
      en: {
        title: "Album edit",
        body: "Turn on album edit for the guests whose choice counts — they can help you pick the photos for your album.",
      },
      hi: {
        title: "एल्बम एडिट",
        body: "जिन मेहमानों की राय मायने रखती है, उनके लिए एल्बम एडिट चालू करें — वे एल्बम की फ़ोटो चुनने में आपकी मदद कर सकेंगे।",
      },
    },
  },
  {
    key: "next-gallery",
    target: "profile",
    advance: "next",
    action: "close-overlays",
    copy: {
      en: {
        title: "That’s Guest Control",
        body: "You’ll find it in your profile anytime. Now open the gallery — we’ll show you how to find photos with your loved ones.",
        cta: "Got it",
      },
      hi: {
        title: "यह था Guest Control",
        body: "यह आपको हमेशा प्रोफ़ाइल में मिलेगा। अब गैलरी खोलें — हम दिखाएँगे कि अपनों के साथ वाली फ़ोटो कैसे ढूँढें।",
        cta: "समझ गया",
      },
    },
  },
];

const FACE_FILTER: readonly TourStep[] = [
  {
    key: "tap-face",
    target: "face-bar",
    advance: "tap",
    copy: {
      en: {
        title: "Find photos with your loved ones",
        body: "These are the faces in your gallery. Tap someone to see only the photos they are in.",
      },
      hi: {
        title: "अपनों के साथ वाली फ़ोटो ढूँढें",
        body: "ये आपकी गैलरी के चेहरे हैं। किसी पर टैप करें और सिर्फ़ उनकी फ़ोटो देखें।",
      },
    },
  },
  {
    key: "more-faces",
    target: ["face-bar", "face-box"],
    advance: "next",
    interactive: true,
    copy: {
      en: {
        title: "Together, in one tap",
        body: "Tap more faces to find the photos you are all in together. Tap a face again to remove it.",
      },
      hi: {
        title: "सब साथ, एक टैप में",
        body: "और चेहरों पर टैप करें और वे फ़ोटो पाएँ जिनमें आप सब साथ हैं। हटाने के लिए चेहरे पर फिर से टैप करें।",
      },
    },
  },
];

const SELECTION: readonly TourStep[] = [
  {
    key: "photo-menu",
    target: "photo-menu",
    advance: "tap",
    copy: {
      en: {
        title: "Pick photos for your album",
        body: "Choosing the album with {studio} is easy from here. Tap ⋯ on a photo you love.",
      },
      hi: {
        title: "एल्बम के लिए फ़ोटो चुनें",
        body: "{studio} के साथ एल्बम की फ़ोटो चुनना अब आसान है। अपनी पसंद की फ़ोटो पर ⋯ टैप करें।",
      },
    },
  },
  {
    key: "add-to-collection",
    target: "menu-collect",
    advance: "tap",
    copy: {
      en: { title: "Add to collection", body: "Tap Add to collection." },
      hi: { title: "कलेक्शन में जोड़ें", body: "Add to collection पर टैप करें।" },
    },
  },
  {
    key: "choose-collection",
    target: "save-sheet",
    advance: "gone",
    interactive: true,
    copy: {
      en: {
        title: "Choose a collection",
        body: "Tick a collection, or make a new one like “Album”, then tap Done.",
      },
      hi: {
        title: "कलेक्शन चुनें",
        body: "कोई कलेक्शन चुनें या “Album” जैसा नया बनाएँ, फिर Done पर टैप करें।",
      },
    },
  },
  {
    key: "open-liked",
    target: "nav-liked",
    advance: "tap",
    action: "reveal-nav",
    copy: {
      en: { title: "Review your picks", body: "Everything you like and collect is waiting in Liked. Tap Liked." },
      hi: { title: "अपनी पसंद देखें", body: "आपकी पसंद और कलेक्शन, सब Liked में हैं। Liked पर टैप करें।" },
    },
  },
  {
    key: "open-collections",
    target: "segment-collections",
    advance: "tap",
    copy: {
      en: { title: "Your collections", body: "Tap Collections to go through what you have picked." },
      hi: { title: "आपके कलेक्शन", body: "जो चुना है उसे देखने के लिए Collections पर टैप करें।" },
    },
  },
  {
    key: "send",
    target: "review-send",
    advance: "next",
    optional: true,
    copy: {
      en: {
        title: "Tell {studio} when you’re done",
        body: "Once your photo selection is complete, send it to {studio} from here so they can start on your album. No rush — do it whenever you are ready.",
        cta: "Got it",
      },
      hi: {
        title: "पूरा होने पर {studio} को बताएँ",
        body: "जब आपकी फ़ोटो चुनना पूरा हो जाए, तो यहीं से {studio} को भेज दें ताकि वे एल्बम पर काम शुरू करें। कोई जल्दी नहीं — जब तैयार हों तब भेजें।",
        cta: "समझ गया",
      },
    },
  },
  {
    key: "replay-hint",
    target: "profile",
    advance: "next",
    copy: {
      en: {
        title: "You’re all set",
        body: "You can watch this tour again anytime from your profile.",
        cta: "Finish",
      },
      hi: {
        title: "आप पूरी तरह तैयार हैं",
        body: "यह टूर आप कभी भी अपनी प्रोफ़ाइल से दोबारा देख सकते हैं।",
        cta: "पूरा करें",
      },
    },
  },
];

export const TOURS: Readonly<Record<TourId, readonly TourStep[]>> = {
  "guest-control": GUEST_CONTROL,
  "face-filter": FACE_FILTER,
  selection: SELECTION,
};

/** Shown once after a skip: where the tour lives now. */
export const SKIP_HINT: TourStep = {
  key: "skip-hint",
  target: "profile",
  advance: "next",
  action: "close-overlays",
  copy: {
    en: { title: "Tour skipped", body: "Whenever you want it, “Watch the tour” is in your profile.", cta: "Okay" },
    hi: { title: "टूर छोड़ दिया", body: "जब चाहें, “टूर देखें” आपकी प्रोफ़ाइल में मिलेगा।", cta: "ठीक है" },
  },
};

/** The card's own words. */
export const TOUR_CHROME: Record<TourLang, { next: string; skip: string; tapHint: string; tapHere: string; stepOf: (n: number, total: number) => string; replay: string; replayHint: string }> = {
  en: {
    next: "Next",
    tapHint: "Tap the glowing button",
    tapHere: "Tap here",
    skip: "Skip tour",
    stepOf: (n, total) => `${n} of ${total}`,
    replay: "Watch the tour",
    replayHint: "Guest Control, face filters and album selection",
  },
  hi: {
    next: "आगे",
    skip: "टूर छोड़ें",
    tapHint: "चमकते बटन पर टैप करें",
    tapHere: "यहाँ टैप करें",
    stepOf: (n, total) => `${total} में से ${n}`,
    replay: "टूर देखें",
    replayHint: "Guest Control, फ़ेस फ़िल्टर और एल्बम चयन",
  },
};

/* ── helpers ────────────────────────────────────────────────────────────── */

/** The guest's saved language, as the tour reads it: Hindi only when asked. */
export function tourLang(language: string | null | undefined): TourLang {
  return language === "hi" ? "hi" : "en";
}

/** A step's words in a language, with the studio's name filled in. */
export function stepCopy(step: TourStep, lang: TourLang, studio: string): Required<Copy> {
  const c = step.copy[lang] ?? step.copy.en;
  const fill = (s: string) => s.split("{studio}").join(studio);
  return { title: fill(c.title), body: fill(c.body), cta: fill(c.cta ?? TOUR_CHROME[lang].next) };
}

/** A step's targets as a list (empty for a centred card). */
export function stepTargets(step: TourStep): readonly TourTarget[] {
  if (!step.target) return [];
  return typeof step.target === "string" ? [step.target] : step.target;
}

/** May the Client touch what this step highlights? */
export function stepInteractive(step: TourStep): boolean {
  return step.advance === "tap" || step.advance === "gone" || step.interactive === true;
}

/** Where "seen" is remembered, per event and per tour part. */
export function tourSeenKey(scope: string, tour: TourId): string {
  return `vy.tour.v1.${scope}.${tour}`;
}

/** The tour part that runs straight after this one, if any. */
export function chainedTour(tour: TourId): TourId | null {
  return tour === "face-filter" ? "selection" : null;
}

/** How long a step waits for its target before giving up on it. */
export const TARGET_WAIT_MS = 5000;

/**
 * Which part, if any, should start now. `seen` says what this Client has
 * already been through; `onScreen` which targets are visible right now;
 * `faceBarMissingMs` how long the gallery's photos have been on screen with
 * no face bar (the event has none, or this Client has no faces to show).
 */
export function nextTourToStart({
  seen,
  onScreen,
  faceBarMissingMs,
}: {
  seen: Readonly<Partial<Record<TourId, boolean>>>;
  onScreen: (target: TourTarget) => boolean;
  faceBarMissingMs: number;
}): TourId | null {
  if (!seen["guest-control"]) return onScreen("profile") ? "guest-control" : null;
  if (!seen["face-filter"] && onScreen("face-bar")) return "face-filter";
  if (!seen.selection && onScreen("photo-menu") && (seen["face-filter"] || faceBarMissingMs >= 4000)) return "selection";
  return null;
}
