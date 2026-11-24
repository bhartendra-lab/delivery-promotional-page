/**
 * The studio's last chosen message language, remembered per browser.
 *
 * localStorage can throw (private mode, a blocked site, a full disk) or hold
 * something that is not ours, so every read and write is wrapped and a value is
 * only trusted when it is one of the languages we ship. Nothing here is
 * personal data: it is a language code.
 */
import { DEFAULT_SHARE_LANG, isShareLang, type ShareLang } from "./share-message-i18n.ts";

export const SHARE_LANG_KEY = "vy_share_message_lang";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readShareLang(storage: StorageLike | null = defaultStorage()): ShareLang {
  try {
    const value = storage?.getItem(SHARE_LANG_KEY);
    return isShareLang(value) ? value : DEFAULT_SHARE_LANG;
  } catch {
    return DEFAULT_SHARE_LANG;
  }
}

export function saveShareLang(lang: ShareLang, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(SHARE_LANG_KEY, lang);
  } catch {
    /* remembering the choice is a courtesy, never a requirement */
  }
}
