"use client";

import { useSyncExternalStore } from "react";
import { LANG_STORAGE_KEY, parseGuestLang, type GuestLang } from "./guest-language";

/**
 * The welcome screen's language choice in this browser (lib/guest-language.ts
 * says how it is used). One value for every gallery: a language is the
 * guest's, not the event's. Storage can be blocked (private mode); then the
 * choice lasts as long as the page.
 */

let memory: GuestLang | null = null;
const listeners = new Set<() => void>();

export function getDeviceLang(): GuestLang | null {
  try {
    return parseGuestLang(window.localStorage.getItem(LANG_STORAGE_KEY)) ?? memory;
  } catch {
    return memory;
  }
}

export function setDeviceLang(lang: GuestLang) {
  memory = lang;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // kept in memory only
  }
  listeners.forEach((l) => l());
}

/** The device's choice, live; null on the server and before any choice. */
export function useDeviceLang(): GuestLang | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getDeviceLang,
    () => null,
  );
}
