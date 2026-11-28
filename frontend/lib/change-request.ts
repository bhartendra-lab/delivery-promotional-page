/**
 * Pure rules for the "Request change" flow on a locked event name or cover:
 * which request is still open for a type, and the words the event shows for it.
 * The wording never says a change happened before the team decided.
 */
export type ChangeRequestType = "event_name" | "cover_photo";
export type ChangeRequestStatus = "pending" | "approved" | "rejected";

/** One request, as the studio sees it. `note` is the team's message once decided. */
export type ChangeRequest = {
  _id: string;
  booking_id: string;
  type: ChangeRequestType;
  /** The name, or the cover's URL, when it was asked. */
  current_value: string;
  /** The new name, or the new cover's URL. */
  requested_value: string;
  reason: string;
  status: ChangeRequestStatus;
  note: string | null;
  decided_at: string | null;
  createdAt: string;
};

/** The open (pending) request of this type for the event, or null. At most one exists. */
export function pendingRequestOf(requests: readonly ChangeRequest[], type: ChangeRequestType): ChangeRequest | null {
  return requests.find((r) => r.type === type && r.status === "pending") ?? null;
}

/** The latest decided request of this type, for the "approved" / "not approved" line. */
export function lastDecidedOf(requests: readonly ChangeRequest[], type: ChangeRequestType): ChangeRequest | null {
  return (
    [...requests]
      .filter((r) => r.type === type && r.status !== "pending")
      .sort((a, b) => String(b.decided_at ?? b.createdAt).localeCompare(String(a.decided_at ?? a.createdAt)))[0] ?? null
  );
}

export const TYPE_NOUN: Record<ChangeRequestType, string> = { event_name: "event name", cover_photo: "cover photo" };

/** What sits next to the lock: a button to ask, or the state of the request already open. */
export function requestChip(requests: readonly ChangeRequest[], type: ChangeRequestType): { kind: "ask" } | { kind: "waiting"; label: string; title: string } {
  const open = pendingRequestOf(requests, type);
  if (!open) return { kind: "ask" };
  return {
    kind: "waiting",
    label: "Change requested",
    title: `Your ${TYPE_NOUN[type]} change is waiting for a decision from the Vyavasth team.`,
  };
}

/** One line about the last decision, or null when there has not been one (or one is waiting). */
export function decisionLine(requests: readonly ChangeRequest[], type: ChangeRequestType): string | null {
  if (pendingRequestOf(requests, type)) return null;
  const last = lastDecidedOf(requests, type);
  if (!last) return null;
  const base = last.status === "approved" ? `Your ${TYPE_NOUN[type]} change was approved.` : `Your ${TYPE_NOUN[type]} change was not approved.`;
  return last.note ? `${base} ${last.note}` : base;
}

/** Why the dialog may not send yet, or null when it may. */
export function requestFormError(input: { type: ChangeRequestType | null; name: string; coverChosen: boolean; currentName: string }): string | null {
  if (!input.type) return "Choose what you want to change.";
  if (input.type === "event_name") {
    const next = input.name.replace(/\s+/g, " ").trim();
    if (!next) return "Enter the new event name.";
    if (next === input.currentName.replace(/\s+/g, " ").trim()) return "That is already the event name.";
    return null;
  }
  return input.coverChosen ? null : "Choose a cover photo.";
}
