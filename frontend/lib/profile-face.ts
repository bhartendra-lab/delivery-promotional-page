/**
 * A guest's picture: their profile face, or (until the backend serves those)
 * their selfie, as it always was.
 *
 * The backend sends `profile_face_url` only while its PROFILE_FACE_ENABLED
 * switch is on: a cropped 256px face from a gallery photo the guest is matched
 * in, or null until one is found. So the KEY being there is the signal:
 *   - key present: the profile face or nothing (initials). The selfie is never
 *     shown, even when its URL is also in the row.
 *   - key absent: the selfie, exactly as before this existed.
 *
 * Used for the guest's own avatar in the lounge and for each row of the
 * studio's guest list, so both sides show the same face.
 */

type GuestPicture = { profile_face_url?: string | null; selfie_url?: string | null };

/** Does the backend serve profile faces for this row? */
export function profileFaceServed(row: GuestPicture | null | undefined): boolean {
  return !!row && "profile_face_url" in row && row.profile_face_url !== undefined;
}

const usable = (url: string | null | undefined) => (typeof url === "string" && url.trim() ? url : null);

/** The picture to show, or null for initials. */
export function guestPhotoUrl(row: GuestPicture | null | undefined): string | null {
  if (!row) return null;
  return profileFaceServed(row) ? usable(row.profile_face_url) : usable(row.selfie_url);
}

/** How long after the first search with matches to look for a new profile
 *  face once: the backend crops it after that search answers. */
export const PROFILE_FACE_RECHECK_MS = 5000;
