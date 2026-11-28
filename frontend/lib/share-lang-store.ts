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
/**
 * The Client's own choice in Guest Control. A separate key, so a studio that
 * opens a gallery as a guest does not change the language it sends invites in.
 */
export const GUEST_SHARE_LANG_KEY = "vy_guest_share_message_lang";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readShareLang(storage: StorageLike | null = defaultStorage(), key: string = SHARE_LANG_KEY): ShareLang {
  try {
    const value = storage?.getItem(key);
    return isShareLang(value) ? value : DEFAULT_SHARE_LANG;
  } catch {
    return DEFAULT_SHARE_LANG;
  }
}

export function saveShareLang(lang: ShareLang, storage: StorageLike | null = defaultStorage(), key: string = SHARE_LANG_KEY): void {
  try {
    storage?.setItem(key, lang);
  } catch {
    /* remembering the choice is a courtesy, never a requirement */
  }
}
