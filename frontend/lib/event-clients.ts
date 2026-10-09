import type { ClientInvites, EventClient, EventClientRole, EventExpiryChoice } from "./types";

/**
 * Who an event is for, how a couple event is named, and when a storage plan
 * event expires: the pure rules behind the "Add new event" modal and the
 * expiry control in "Edit event details".
 *
 * Client-side mirror of the backend's rules (backend: `isCoupleEventType`,
 * `coupleEventName` and `sanitizeEventClients` in src/utils/bookings.utils.js,
 * and `resolveEventExpiry` in src/utils/ist-time.utils.js). The backend is the
 * authority and repeats every check; this exists so the modal can preview the
 * event name and the expiry date, and point at the wrong field, before
 * anything is sent. A preview that promised a different name or day than the
 * server stores would be worse than no preview.
 *
 * If you change a rule here, change it there in the same commit.
 *
 * Dependency-free on purpose (type-only imports), so `node --test` can load it
 * directly.
 */

/* ── couple events ──────────────────────────────────────────────────────── */

/** Event types that are about two people. These ask for a Bride and a Groom
 *  instead of an event name. */
export const COUPLE_EVENT_TYPES: readonly string[] = ["Wedding", "Pre-wedding", "Engagement", "Anniversary"];

export function isCoupleEventType(type: string | null | undefined): boolean {
  return typeof type === "string" && COUPLE_EVENT_TYPES.includes(type);
}

const collapseWhitespace = (value: string | null | undefined): string =>
  String(value ?? "").replace(/\s+/g, " ").trim();

/** The first whitespace-separated word of a name, or "" when there is none. */
export function firstNameOf(name: string | null | undefined): string {
  return collapseWhitespace(name).split(" ")[0] ?? "";
}

/** A couple event's name: the two first names, Bride first. */
export function coupleEventName(brideName: string, groomName: string): string {
  return `${firstNameOf(brideName)} & ${firstNameOf(groomName)}`;
}

/** The live "Event name: Aanya & Rohan" preview, or null until BOTH first
 *  names exist (half a name is not worth announcing). */
export function coupleEventNamePreview(brideName: string, groomName: string): string | null {
  return firstNameOf(brideName) && firstNameOf(groomName) ? coupleEventName(brideName, groomName) : null;
}

/* ── the people ─────────────────────────────────────────────────────────── */

/** Most people one event may be created with, Bride and Groom included. */
export const EVENT_CLIENTS_MAX = 6;
/** Longest name the Studio may type for one of them. */
export const EVENT_CLIENT_NAME_MAX = 60;
/** A WhatsApp number is typed as its bare ten digits, after a fixed +91. */
export const PHONE_DIGITS = 10;

/** One row of the people form, as the Studio is typing it. */
export type PersonDraft = {
  /** Stable for the life of the row; keys its fields and its errors. */
  id: string;
  role: EventClientRole;
  name: string;
  /** Bare digits, 0 to 10 long. */
  phone: string;
};

/** The key an error is stored under, and the DOM id of the field it is about. */
export const eventField = {
  eventName: "event-name",
  personName: (id: string) => `person-${id}-name`,
  personPhone: (id: string) => `person-${id}-phone`,
  expiry: "event-expiry",
  expiryDate: "event-expiry-date",
} as const;

/** True once at least one person has a complete number: only then is there
 *  anybody to message, and only then is the WhatsApp checkbox worth showing. */
export function hasCompleteNumber(people: PersonDraft[]): boolean {
  return people.some((person) => person.phone.length === PHONE_DIGITS);
}

/** A row nobody has typed in. Dropped silently, never an error. */
const isEmptyRow = (person: PersonDraft): boolean => !collapseWhitespace(person.name) && !person.phone;

export type EventDraft = {
  /** A couple type: Bride and Groom name the event, and both are required. */
  couple: boolean;
  /** The typed event name. Ignored on a couple type. */
  eventName: string;
  /** The rows on screen, in display order. */
  people: PersonDraft[];
  expiry: {
    /** Storage plans only. When false the expiry is neither checked nor sent. */
    required: boolean;
    choice: EventExpiryChoice | null;
    /** "YYYY-MM-DD", used with "custom". */
    date: string;
  };
  nowMs?: number;
};

export type EventDraftResult = {
  /** Field key (see `eventField`) to the sentence shown under that field. */
  errors: Record<string, string>;
  /** The first invalid field in reading order, for focus. Null when valid. */
  firstInvalid: string | null;
  /** The people to send, with empty rows dropped. Meaningful when valid. */
  clients: EventClient[];
};

/**
 * Check the whole form at once, on submit. Returns every problem (so each
 * field can show its own message) and which one comes first on screen.
 *
 *  - A couple type needs the Bride's and the Groom's names. Every other type
 *    needs an event name; its Clients' names are optional.
 *  - A number that was started must be all ten digits.
 *  - No two people may share a number; the LATER row is the one marked, since
 *    that is the one the Studio just typed.
 *  - A row with neither a name nor a number is dropped, not flagged (the
 *    Bride and Groom rows excepted: their names are required).
 */
export function validateEventDraft(draft: EventDraft): EventDraftResult {
  const errors: Record<string, string> = {};
  const order: string[] = [];
  const flag = (key: string, message: string) => {
    if (!(key in errors)) {
      errors[key] = message;
      order.push(key);
    }
  };

  if (!draft.couple && !collapseWhitespace(draft.eventName)) {
    flag(eventField.eventName, "Enter an event name");
  }

  const clients: EventClient[] = [];
  const seenPhones = new Set<string>();
  for (const person of draft.people) {
    const role: EventClientRole = draft.couple ? person.role : "client";
    const isCouple = role === "bride" || role === "groom";
    if (!isCouple && isEmptyRow(person)) continue;

    const name = collapseWhitespace(person.name).slice(0, EVENT_CLIENT_NAME_MAX).trim();
    if (isCouple && !name) {
      flag(eventField.personName(person.id), role === "bride" ? "Enter the bride's name" : "Enter the groom's name");
    }

    if (person.phone) {
      if (person.phone.length !== PHONE_DIGITS) {
        flag(eventField.personPhone(person.id), "Enter a 10 digit WhatsApp number");
      } else if (seenPhones.has(person.phone)) {
        flag(eventField.personPhone(person.id), "This number is already used above");
      } else {
        seenPhones.add(person.phone);
      }
    }

    clients.push({ role, ...(name ? { name } : {}), ...(person.phone ? { phone: person.phone } : {}) });
  }

  if (draft.expiry.required) {
    if (!draft.expiry.choice) {
      flag(eventField.expiry, "Choose when this event expires");
    } else if (draft.expiry.choice === "custom") {
      if (!draft.expiry.date) {
        flag(eventField.expiryDate, "Pick a date");
      } else {
        try {
          resolveEventExpiry({ choice: "custom", date: draft.expiry.date, nowMs: draft.nowMs });
        } catch (err) {
          flag(eventField.expiryDate, err instanceof Error ? err.message : "Pick a date");
        }
      }
    }
  }

  return { errors, firstInvalid: order[0] ?? null, clients };
}

/* ── event expiry ───────────────────────────────────────────────────────── */

/** The five answers, in the order the chips show them. */
export const EVENT_EXPIRY_OPTIONS: ReadonlyArray<{ value: EventExpiryChoice; label: string }> = [
  { value: "1m", label: "1 month" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "never", label: "Never" },
  { value: "custom", label: "Custom date" },
];

const DAY_MS = 24 * 60 * 60 * 1000;
/** IST is a fixed UTC+05:30 with no DST, so a constant offset is exact. */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const EVENT_EXPIRY_PRESET_MONTHS: Partial<Record<EventExpiryChoice, number>> = { "1m": 1, "3m": 3, "6m": 6 };
/** A custom date further out than this is a typo, not a plan. */
const EVENT_EXPIRY_MAX_YEARS = 10;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Epoch ms of 23:59:59.999 IST on the given calendar day (month is 0-based). */
const istEndOfDay = (year: number, month: number, day: number): number =>
  Date.UTC(year, month, day) + DAY_MS - 1 - IST_OFFSET_MS;

/** The IST calendar day `ms` falls on, as its three numbers. */
function istDayOf(ms: number): { year: number; month: number; day: number } {
  const d = new Date(ms + IST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

/**
 * Turn the Studio's expiry answer into the instant the event is archived: the
 * END of that day in IST, or null for "never". Throws an Error with a sentence
 * the Studio can read. Same rules, same messages, as the backend's function of
 * the same name:
 *
 *  - a preset counts calendar months from TODAY (the IST day of `nowMs`), with
 *    the day clamped to the target month's last one (31 Aug plus 6 months is
 *    28 or 29 Feb);
 *  - a custom date must be tomorrow (IST) or later, and at most 10 years out.
 */
export function resolveEventExpiry({
  choice,
  date,
  nowMs = Date.now(),
}: {
  choice: EventExpiryChoice | null | undefined;
  date?: string | null;
  nowMs?: number;
}): { choice: EventExpiryChoice; at: number | null } {
  if (choice === "never") return { choice, at: null };
  const { year, month, day } = istDayOf(nowMs);

  const months = choice ? EVENT_EXPIRY_PRESET_MONTHS[choice] : undefined;
  if (choice && months) {
    const targetIndex = month + months;
    const targetYear = year + Math.floor(targetIndex / 12);
    const targetMonth = targetIndex % 12;
    // Day 0 of the following month is the last day of the target one.
    const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    return { choice, at: istEndOfDay(targetYear, targetMonth, Math.min(day, lastDay)) };
  }

  if (choice === "custom") {
    const match = typeof date === "string" ? DATE_ONLY.exec(date) : null;
    if (!match) throw new Error("Pick a valid expiry date");
    const [y, m, d] = match.slice(1).map(Number);
    const probe = new Date(Date.UTC(y, m - 1, d));
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
      throw new Error("Pick a valid expiry date");
    }
    const at = istEndOfDay(y, m - 1, d);
    if (at <= istEndOfDay(year, month, day)) {
      throw new Error("The expiry date must be tomorrow or later");
    }
    if (at > istEndOfDay(year + EVENT_EXPIRY_MAX_YEARS, month, day)) {
      throw new Error(`The expiry date can be at most ${EVENT_EXPIRY_MAX_YEARS} years away`);
    }
    return { choice, at };
  }

  throw new Error("Choose when this event expires");
}

/** "7 Jan 2027": the IST calendar day an expiry instant falls on. */
export function formatExpiryDay(at: number): string {
  const { year, month, day } = istDayOf(at);
  return `${day} ${MONTHS[month]} ${year}`;
}

/** "YYYY-MM-DD" for the IST day `ms` falls on: a date input's value. */
export function istDateInputOf(ms: number): string {
  const { year, month, day } = istDayOf(ms);
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

/** The earliest custom expiry date: tomorrow in IST. A date input's `min`. */
export function tomorrowIstDateInput(nowMs: number = Date.now()): string {
  return istDateInputOf(nowMs + DAY_MS);
}

/**
 * The line under the expiry control: what will actually happen, named with a
 * real date, so "3 months" is never left for the Studio to work out.
 * `at` null is "never".
 */
export function expiryOutcomeLine(at: number | null): string {
  return at == null
    ? "This gallery stays live until you archive it."
    : `Guests can open this gallery until ${formatExpiryDay(at)}. It is then archived, and its photos are deleted 7 days later unless you restore it.`;
}

/** The outcome line for an answer still being chosen, or null when there is
 *  nothing to say yet (no choice, or a custom date that is missing or wrong). */
export function eventExpiryPreview({
  choice,
  date,
  nowMs = Date.now(),
}: {
  choice: EventExpiryChoice | null | undefined;
  date?: string | null;
  nowMs?: number;
}): string | null {
  if (!choice) return null;
  try {
    return expiryOutcomeLine(resolveEventExpiry({ choice, date, nowMs }).at);
  } catch {
    return null;
  }
}

/* ── after create ───────────────────────────────────────────────────────── */

/**
 * The toast the new event's page shows once, from what `create-booking` said
 * about the WhatsApp invitations. Null when there is nothing worth saying:
 * nobody was given a number, or the template is not live yet. WhatsApp is only
 * ever mentioned when something was sent or deliberately not sent.
 */
export function createdEventNotice(invites: ClientInvites | null | undefined): string | null {
  if (!invites) return null;
  if (invites.status === "sending" && invites.count > 0) {
    const who = invites.count === 1 ? "1 person" : `${invites.count} people`;
    return `Event created. Sending the gallery link to ${who} on WhatsApp.`;
  }
  if (invites.status === "skipped") return "Event created. Your Clients were not messaged.";
  return null;
}

/** sessionStorage key carrying that toast across the navigation to the new
 *  event. Written by the create modal, read once and removed by the event
 *  page: no URL change, and a refresh cannot replay it. */
export function createdEventNoticeKey(bookingId: string): string {
  return `event_created_notice_${bookingId}`;
}

/* ── after restore ──────────────────────────────────────────────────────── */

/**
 * Said when a restored event's own expiry had already passed. The backend
 * sets such an expiry back to Never (or the next nightly run would archive
 * the event again), and the Studio should hear that rather than discover it.
 * Shared by the two places an event can be restored from.
 */
export const RESTORED_WITH_EXPIRY_RESET =
  "Restored. Its expiry is now set to Never; change it in Edit event details.";
