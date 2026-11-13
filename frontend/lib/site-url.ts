/**
 * The Vyavasth site's own base URL (NEXT_PUBLIC_BASE_URL, inlined at build
 * time), trailing slash stripped. Web only: the pure modules that need it
 * (`gallery-url.ts`) take it as a parameter so the studio app can share them.
 */
export const VYAVASTH_BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
