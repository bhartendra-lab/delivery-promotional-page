// lib/attribution-send.ts — sends the kept first touch to the backend, once,
// right after sign up. Never throws and never blocks sign in: a studio that
// signs up with nothing kept sends nothing, and a failed send leaves the touch
// kept for the next sign-up page that tries (the backend saves it write-once).

import { saveAttribution } from "@/lib/api";
import { clearStoredAttribution, getStoredAttribution } from "@/lib/attribution-storage";

/** Longest a redirect waits for the send. */
const SEND_BUDGET_MS = 1500;

export async function sendStoredAttribution(): Promise<void> {
  const touch = getStoredAttribution();
  if (!touch) return;
  try {
    await saveAttribution(touch);
    // Saved, or the studio already had one: either way it is done.
    clearStoredAttribution();
  } catch {
    // Kept for another try.
  }
}

/** For a page that is about to leave: waits for the send, but never longer than the budget. */
export async function sendStoredAttributionBeforeLeaving(): Promise<void> {
  await Promise.race([sendStoredAttribution(), new Promise<void>((resolve) => setTimeout(resolve, SEND_BUDGET_MS))]);
}
