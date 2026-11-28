// lib/powered-by.ts — the "Powered by Vyavasth" link at the foot of the guest
// gallery. The tags on the link are all the tracking there is: vyavasth.in's own
// analytics can tell a visitor who came from a gallery from anyone else.

export const POWERED_BY_BASE_URL = "https://vyavasth.in";

/** The link, tagged utm_source=gallery&utm_medium=referral. Existing parameters are kept. */
export function poweredByUrl(base: string = POWERED_BY_BASE_URL): string {
  const url = new URL(base);
  url.searchParams.set("utm_source", "gallery");
  url.searchParams.set("utm_medium", "referral");
  return url.toString();
}
