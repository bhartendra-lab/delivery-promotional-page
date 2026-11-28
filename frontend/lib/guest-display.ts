/**
 * How a Guest row shows what is stored. Display only: the stored value is never
 * touched, and the export still carries it exactly as saved.
 */

/** `+91 98273 88808` for an Indian mobile number however it was stored
 *  (`919827388808`, `+919827388808`, `9827388808`, with spaces or dashes).
 *  Anything else is shown as it is, trimmed: a number we cannot place is better
 *  read than guessed at. Not masked: studios use these numbers as leads. */
export function formatPhoneForDisplay(phone: string | null | undefined): string {
  const raw = (phone ?? "").trim();
  if (!raw) return "";
  const compact = raw.replace(/[\s\-().]/g, "");
  const match = /^(?:\+?91)?([6-9]\d{9})$/.exec(compact);
  if (!match) return raw;
  const n = match[1];
  return `+91 ${n.slice(0, 5)} ${n.slice(5)}`;
}

/** A name with the whitespace tidied (trimmed, runs collapsed), nothing else. */
export function tidyName(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ");
}
