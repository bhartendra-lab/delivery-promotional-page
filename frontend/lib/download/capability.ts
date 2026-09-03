/**
 * What this browser can actually do with a bulk download, and the two memory
 * ceilings that follow from it.
 *
 * THE RULE THIS MODULE EXISTS TO ENFORCE: capability decides behaviour,
 * platform decides only the wording of an explanation. Every branch in the
 * executable logic keys off a feature probe; the only thing an operating-system
 * check may influence is which sentence a human reads.
 *
 * Getting that backwards is how this feature rots. A user-agent string cannot
 * tell you that Chrome on iPhone is WebKit with no File System Access, and it
 * cannot tell you that Chrome on Android gained it in v132. So `saveCapability`
 * never reads the user agent, and the two functions that do are marked, are the
 * ONLY two `navigator.userAgent` reads in the whole feature, and feed nothing
 * but copy selection and a memory constant.
 *
 * No aliased imports: `lib/download/*.test.ts` runs under `node --test`, which
 * cannot resolve `@/`.
 */

export type SaveCapability =
  /** File System Access directory picker: write each file into a chosen folder,
   *  streamed, no ZIP. Peak memory is one file regardless of selection size. */
  | "directory"
  /** File System Access save picker: one ZIP streamed to disk. Also bounded. */
  | "streamZip"
  /** Neither: a ZIP has to be built in RAM before it can be handed to the
   *  browser, so the selection size is bounded by what the tab can hold. */
  | "memoryZip";

/** The globals the probe looks at. A plain object so a test can stand in for
 *  `window` without a DOM. */
export type PickerHost = {
  showDirectoryPicker?: unknown;
  showSaveFilePicker?: unknown;
};

/**
 * Pure. The probe itself, over an explicit host object.
 *
 * Note that a `"directory"` answer is necessary but NOT sufficient: the API also
 * requires a secure context and throws inside a cross-origin iframe. The engine
 * must still catch the picker throwing and degrade — see `runDirectoryDownload`.
 */
export function probeSaveCapability(host: PickerHost | undefined | null): SaveCapability {
  if (!host) return "memoryZip";
  if (typeof host.showDirectoryPicker === "function") return "directory";
  if (typeof host.showSaveFilePicker === "function") return "streamZip";
  return "memoryZip";
}

let memoised: SaveCapability | null = null;

/**
 * Memoised probe against the real `window`. Server-side it answers
 * `"memoryZip"` — the most conservative option — and deliberately does NOT
 * memoise that answer, so the first client-side call still probes for real.
 */
export function saveCapability(): SaveCapability {
  if (typeof window === "undefined") return "memoryZip";
  if (memoised === null) memoised = probeSaveCapability(window as unknown as PickerHost);
  return memoised;
}

/* ── The two sanctioned user-agent reads ─────────────────────────────────── */

/** Pure. iOS detection over an explicit UA + touch-point count. */
export function isIOSFrom(ua: string, maxTouchPoints: number): boolean {
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ reports a desktop Mac user agent. A Mac with a touchscreen is
  // the giveaway, because none exist. This still only selects a sentence.
  return /Macintosh/i.test(ua) && maxTouchPoints > 1;
}

/** Pure. Mobile detection over an explicit UA + the Client Hints answer. */
export function isMobileFrom(ua: string, uaDataMobile: boolean | undefined): boolean {
  if (typeof uaDataMobile === "boolean") return uaDataMobile;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
}

/**
 * MESSAGING ONLY. Never gate behaviour on this — gate on `saveCapability()`.
 *
 * It exists for exactly one reason: so we never tell an iPhone user to install
 * Chrome. Every browser on iOS is WebKit underneath, so that advice is not
 * merely unhelpful there, it is wrong. On desktop Firefox the same sentence is
 * genuinely actionable, which is why the alert has two copy variants and one id.
 */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return isIOSFrom(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

/** Used only to pick a memory ceiling (see MEMORY_ZIP_CAP_*). Not a gate. */
export function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  return isMobileFrom(navigator.userAgent, uaData?.mobile);
}

/* ── Memory ceilings ─────────────────────────────────────────────────────── */

/**
 * Empirical ceilings, not measured limits. Mobile Safari terminates a tab
 * somewhere above ~1 GB resident, and the ZIP output Blob is only part of the
 * pressure (the fetched images are held too), so 300 MB leaves real headroom.
 * Named constants on purpose — do not scatter these numbers.
 */
export const MEMORY_ZIP_CAP_MOBILE = 300 * 1024 * 1024;
export const MEMORY_ZIP_CAP_DESKTOP = 1024 * 1024 * 1024;

/**
 * Everything `planDownload` needs to know about this device, resolved in one
 * place so the planner itself stays pure and testable. This is the seam: the
 * planner receives values, never probes.
 */
export type DownloadEnvironment = {
  capability: SaveCapability;
  memoryCap: number;
  /** Copy selection only. */
  ios: boolean;
};

export function downloadEnvironment(): DownloadEnvironment {
  return {
    capability: saveCapability(),
    memoryCap: isMobile() ? MEMORY_ZIP_CAP_MOBILE : MEMORY_ZIP_CAP_DESKTOP,
    ios: isIOS(),
  };
}
