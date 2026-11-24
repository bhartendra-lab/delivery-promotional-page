/**
 * "Tell us about you": what a signed-in Guest still has to answer.
 *
 * Two places raise the intake sheet — `EventFlow`, over the selfie step, so a
 * WhatsApp Guest is named straight after sign-in rather than after their scan;
 * and `LoungeGallery`, for a Guest who goes straight to the gallery (face search
 * off, a selfie already on file, or the scan skipped before). Both read the
 * same rule from here, so the sheet can never rise in one and not the other.
 * Saving the answer is `saveIntake`, in guest-api.ts. This module stays free
 * of runtime imports so the rule can be tested on its own.
 */

import type { GuestSession } from "./types";

export type IntakeAnswer = { name?: string; team?: string };

/**
 * `needsName` means the name is missing or the "Guest" placeholder, which is
 * a new WhatsApp Guest (sign-in no longer asks). A Google Guest arrives with
 * their display name, so no flag is needed to tell the two sign-ins apart.
 * `needsTeam` only at an event the Studio split into teams.
 */
export function intakeNeeds(
  session: Pick<GuestSession, "name" | "guest_sub_type">,
  teams: string[],
): { needsName: boolean; needsTeam: boolean; show: boolean } {
  const needsName = !session.name || session.name === "Guest";
  const needsTeam = teams.length > 0 && !session.guest_sub_type;
  return { needsName, needsTeam, show: needsName || needsTeam };
}

/**
 * A like belongs to a signed-in Guest with a name. A Guest the name prompt has
 * not been answered for yet (a new WhatsApp Guest, or the "Guest" placeholder)
 * is sent through that prompt first, and the like is applied after it. The
 * team question never holds a like back: a like needs a name, not a team.
 * This is the same on every folder, public ones included.
 */
export function likeWaitsForName(session: Pick<GuestSession, "name">): boolean {
  return !session.name || session.name === "Guest";
}
