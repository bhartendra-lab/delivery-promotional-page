/**
 * Pure. The cover's focal point, stored on the booking as a CSS
 * object-position ("50% 35%"): what guests see of a cover cropped to the
 * banner. The Studio app shares it through its core sync.
 */

/** Clamp a percentage to the valid [0, 100] range. */
export function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/** Parse a CSS object-position into numeric [x, y] percentages. */
export function parsePosNums(p: string): [number, number] {
  const m = p.match(/(-?[\d.]+)%\s+(-?[\d.]+)%/);
  return m ? [clamp(parseFloat(m[1])), clamp(parseFloat(m[2]))] : [50, 50];
}

/** The stored form of a focal point, one decimal place (the reposition drag writes this). */
export function formatPos(x: number, y: number): string {
  return `${clamp(x).toFixed(1)}% ${clamp(y).toFixed(1)}%`;
}
