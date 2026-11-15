/**
 * How the Media tab's Filter names an upload session and a camera (SES-01).
 * Pure: no DOM, no React, so it unit-tests and syncs to the Vyavasth Studio app
 * (APP-05 shows the same lists).
 *
 * A session row reads, for example:
 *   "Camera · Canon EOS R6"      "10 Nov, 2:14 to 3:40 pm · 812 photos"
 *   "Web upload"                 "10 Nov, 4:02 pm · 120 photos"
 */

export type OriginSessionLike = {
  source: "camera" | "folder" | "photos" | "web";
  label: string | null;
  started_at: string;
  ended_at: string | null;
  photo_count: number;
  devices: Array<{ label: string }>;
};

const SOURCE_NAMES: Record<OriginSessionLike["source"], string> = {
  camera: "Camera",
  folder: "Phone folder",
  photos: "Photo picker",
  web: "Web upload",
};

/** "Camera · Canon EOS R6", "Phone folder · Day 1", "Photo picker", "Web upload". */
export function sessionTitle(s: Pick<OriginSessionLike, "source" | "label" | "devices">): string {
  const name = SOURCE_NAMES[s.source];
  if (s.source === "camera") {
    // The camera the photos themselves name wins over the USB label.
    const camera = s.devices.length === 1 ? s.devices[0].label : s.label;
    return camera ? `${name} · ${camera}` : name;
  }
  if (s.source === "folder" && s.label) return `${name} · ${s.label}`;
  return name;
}

/** "812 photos", "1 photo", with Indian digit grouping. */
export function photoCountLabel(n: number): string {
  return `${n.toLocaleString("en-IN")} photo${n === 1 ? "" : "s"}`;
}

type Parts = { day: string; time: string; period: string };

function partsOf(iso: string, timeZone?: string): Parts {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone }).format(d);
  const raw = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone })
    .format(d)
    .toLowerCase()
    .replace(/\s+/g, " ");
  const [time, period = ""] = raw.split(" ");
  return { day, time, period: period.replace(/\./g, "") };
}

/**
 * When a session ran, in the viewer's clock (or `timeZone`, for tests):
 * "10 Nov, 4:02 pm" (one minute), "10 Nov, 2:14 to 3:40 pm" (same half of
 * the day), "10 Nov, 11:50 am to 12:30 pm", "10 Nov, 11:50 pm to 11 Nov, 12:30 am".
 */
export function sessionTimeRange(startIso: string, endIso: string | null, timeZone?: string): string {
  const a = partsOf(startIso, timeZone);
  if (!endIso) return `${a.day}, ${a.time} ${a.period}`;
  const b = partsOf(endIso, timeZone);
  if (a.day !== b.day) return `${a.day}, ${a.time} ${a.period} to ${b.day}, ${b.time} ${b.period}`;
  if (a.time === b.time && a.period === b.period) return `${a.day}, ${a.time} ${a.period}`;
  if (a.period === b.period) return `${a.day}, ${a.time} to ${b.time} ${b.period}`;
  return `${a.day}, ${a.time} ${a.period} to ${b.time} ${b.period}`;
}

/** The second line of a session row: "10 Nov, 2:14 to 3:40 pm · 812 photos". */
export function sessionSubtitle(s: OriginSessionLike, timeZone?: string): string {
  return `${sessionTimeRange(s.started_at, s.ended_at, timeZone)} · ${photoCountLabel(s.photo_count)}`;
}
