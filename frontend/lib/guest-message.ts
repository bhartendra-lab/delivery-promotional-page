/**
 * The studio's free-text `custom_message`, prepared for display.
 *
 * The textarea in Gallery Design stores exactly what the studio typed, newlines
 * and all, and the backend validators only `trim()` the two ends — so every
 * decision about what a blank line MEANS is made here, once, and shared by the
 * guest cover, the Read-more sheet and the studio's own preview. Nothing else
 * may re-interpret the raw string: two renderers splitting it differently is
 * how the preview came to hide what guests actually see.
 *
 * The rules, in full:
 *
 * - `\r\n` and `\r` normalise to `\n` (a message pasted from Windows or from an
 *   old Mac app must not read as one unbroken run).
 * - Every line is trimmed at both ends. `white-space: pre-line` collapses
 *   leading spaces anyway, so keeping them buys nothing and costs an invisible
 *   difference between two messages that look identical in the textarea.
 * - One or more lines that are empty after trimming end the paragraph. Two
 *   blank lines in a row therefore say nothing more than one does.
 * - Empty paragraphs are dropped, so blank lines at the start and end of the
 *   message disappear and a whitespace-only message is nothing at all.
 *
 * Deliberately NOT done: no HTML, no markdown, no link detection. The output is
 * plain text that React renders as text — a studio typing `<b>` or a guest
 * pasting a URL gets exactly those characters on screen.
 */

/** A studio message split for display: paragraphs, each a list of lines. */
export function toMessageParagraphs(raw: string | null | undefined): string[][] {
  if (!raw) return [];

  const paragraphs: string[][] = [];
  let current: string[] = [];

  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") {
      // A run of blank lines ends the paragraph once, not once per line.
      if (current.length > 0) {
        paragraphs.push(current);
        current = [];
      }
      continue;
    }
    current.push(trimmed);
  }
  if (current.length > 0) paragraphs.push(current);

  return paragraphs;
}

/**
 * The cover's compact form: every line of every paragraph joined with "\n", no
 * blank lines, ready for `white-space: pre-line`. `""` when there is nothing to
 * show.
 *
 * Paragraph breaks flatten to a single line break on purpose — the cover shows
 * three lines and an empty line would spend one of them on nothing. Real
 * paragraph spacing lives in the sheet, which has the room for it.
 */
export function toCompactMessage(raw: string | null | undefined): string {
  return toMessageParagraphs(raw)
    .map((lines) => lines.join("\n"))
    .join("\n");
}
