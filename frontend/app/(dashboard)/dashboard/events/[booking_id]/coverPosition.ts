/** Clamp a percentage to the valid [0, 100] range. */
export function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/** Parse a CSS object-position into numeric [x, y] percentages. */
export function parsePosNums(p: string): [number, number] {
  const m = p.match(/(-?[\d.]+)%\s+(-?[\d.]+)%/);
  return m ? [clamp(parseFloat(m[1])), clamp(parseFloat(m[2]))] : [50, 50];
}
