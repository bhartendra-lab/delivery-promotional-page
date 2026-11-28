/**
 * What the "Your gallery is live" dialog says after an upload run, as pure
 * functions so the claims can be tested.
 *
 * The notification facts come from the backend's guestNotify.service.js:
 *  - the first "gallery is live" message (WhatsApp, or email for a guest who
 *    registered with one) goes ONCE, when the photos finish processing, to every
 *    guest and Client with a phone or an email;
 *  - after that, "new photos" messages go at most once a day, in sweeps at
 *    9 AM, 3 PM and 9 PM India time.
 * Nothing is sent at the moment of upload, so the copy never says it has been.
 */

export const NOTIFY_FIRST_LINE =
  "When the photos finish processing, guests who have not been told yet get one message that your gallery is live.";

export const NOTIFY_LATER_LINE =
  "After that, new photos are announced at most once a day, at 9 AM, 3 PM or 9 PM India time.";

export function uploadSuccessHeadline(count: number): string {
  return `${count.toLocaleString("en-IN")} photo${count === 1 ? "" : "s"} uploaded`;
}

/**
 * How many people have a way to be reached, from the guest list the dashboard
 * already loads. A person is reachable with an email or a phone, which is the
 * rule the sender uses (guestChannelOf). Returns null when the list is unknown.
 */
export function reachableLine(guests: ReadonlyArray<{ email?: string | null; phone?: string | null; is_client?: boolean }> | null): string | null {
  if (!guests) return null;
  const reachable = guests.filter((g) => !!g.email || !!g.phone);
  if (reachable.length === 0) {
    return "No guests or Clients have signed in to this gallery yet, so there is no one to message yet.";
  }
  const clients = reachable.filter((g) => g.is_client === true).length;
  const people = `${reachable.length.toLocaleString("en-IN")} ${reachable.length === 1 ? "person" : "people"}`;
  const clientPart = clients > 0 ? `, ${clients.toLocaleString("en-IN")} of them ${clients === 1 ? "a Client" : "Clients"}` : "";
  return `${people} can be messaged right now${clientPart}.`;
}
