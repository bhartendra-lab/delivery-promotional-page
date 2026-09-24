/**
 * Name search for the people screen.
 *
 * Filters the ALREADY LOADED list and never calls the backend: the directory
 * arrives in one payload, a wedding's guest list is small enough to filter in a
 * keystroke, and a search endpoint would be a second way to enumerate the
 * guests at an event.
 *
 * Accent- and case-insensitive, because a guest called "Zoë" is looked up as
 * "zoe" by half the people who know her — and on a phone keyboard, by nearly
 * all of them. NFD splits a letter from its diacritic so the combining marks
 * can be dropped; anything the normaliser cannot decompose is left as it is,
 * which is the right answer for scripts where the mark carries meaning.
 */

/** Strip accents, lowercase, collapse whitespace. */
export function foldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Does `name` match what was typed?
 *
 * A plain substring test on the folded forms. Deliberately not a fuzzy or
 * initials match: the list is short, the guest is usually typing a name they
 * know, and a fuzzy matcher's false positives are far more annoying here than
 * one extra keystroke.
 */
export function matchesQuery(name: string, foldedQuery: string): boolean {
  if (!foldedQuery) return true;
  return foldName(name).includes(foldedQuery);
}
