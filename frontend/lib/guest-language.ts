/**
 * Pure. The guest's UI language: picked on the welcome screen (web
 * WelcomeScreen, app intro), kept on the device under LANG_STORAGE_KEY, and
 * sent as `language` with the sign-in call, which saves it on the guest. After
 * sign-in the saved value (session / account `language`) wins; the device's
 * choice covers the moments before, and a backend that has not answered with
 * one. Synced into the app by `npm run core:sync`.
 */

export type GuestLang = "en" | "hi";

export const LANG_STORAGE_KEY = "vy.lang";

export const GUEST_LANGS: readonly { code: GuestLang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
];

/** "en" / "hi", or null for anything else (nothing chosen yet). */
export function parseGuestLang(value: unknown): GuestLang | null {
  return value === "en" || value === "hi" ? value : null;
}

/** The language to show: the saved one, else the device's choice, else English. */
export function effectiveLang(saved: unknown, device: unknown): GuestLang {
  return parseGuestLang(saved) ?? parseGuestLang(device) ?? "en";
}

/** The welcome screens' own words. */
export const WELCOME_COPY: Record<
  GuestLang,
  {
    pickerLabel: string;
    galleryBy: (studio: string) => string;
    photosWaiting: (n: number, formatted: string) => string;
    findMyPhotos: string;
    viewPhotos: string;
    introTitle: string;
    introLines: [string, string, string];
    getStarted: string;
  }
> = {
  en: {
    pickerLabel: "Language",
    galleryBy: (studio) => `Gallery by ${studio}`,
    photosWaiting: (n, formatted) => `${formatted} photo${n === 1 ? "" : "s"} waiting for you`,
    findMyPhotos: "Find my photos",
    viewPhotos: "View photos",
    introTitle: "All your event photos, in one place",
    introLines: ["Find yourself with one selfie", "Save straight to your photos", "Get notified when new photos arrive"],
    getStarted: "Get started",
  },
  hi: {
    pickerLabel: "भाषा",
    galleryBy: (studio) => `${studio} की गैलरी`,
    photosWaiting: (_n, formatted) => `${formatted} फ़ोटो आपका इंतज़ार कर रही हैं`,
    findMyPhotos: "मेरी फ़ोटो ढूँढें",
    viewPhotos: "फ़ोटो देखें",
    introTitle: "आपके इवेंट की सारी फ़ोटो, एक जगह",
    introLines: ["एक सेल्फ़ी से अपनी फ़ोटो पाएँ", "सीधे अपनी गैलरी में सेव करें", "नई फ़ोटो आने पर सूचना पाएँ"],
    getStarted: "शुरू करें",
  },
};
