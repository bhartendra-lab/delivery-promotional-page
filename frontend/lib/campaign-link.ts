// lib/campaign-link.ts — the campaign cookie as the dashboard reads it. The
// tracking link itself lives on the website (https://vyavasth.in/w/<id>, in the
// landing repo), which records the tap and sets this cookie for the whole
// vyavasth.in domain. Same name and format on both sides.

/** First-party cookie holding the id of the message that brought this browser. */
export const ACQ_COOKIE = "vy_acq";

/** A CRM recipient id: a ULID, 26 Crockford base32 characters. */
export function isRecipientToken(v: unknown): v is string {
  return typeof v === "string" && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(v);
}
