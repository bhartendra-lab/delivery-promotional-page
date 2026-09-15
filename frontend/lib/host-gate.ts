/**
 * Host gate for studio custom domains — the decision half.
 *
 * One Worker serves both the studio dashboard and the public galleries. Once a
 * studio points gallery.studioxyz.com at us, that Worker answers on their
 * hostname too — which would otherwise mean the entire Vyavasth dashboard,
 * login page included, is reachable at a URL that looks like it belongs to the
 * studio. So: on any host that is not ours, only the guest-facing surface is
 * served and everything else is a 404.
 *
 * Pure and dependency-free so it can be unit-tested directly (see
 * host-gate.test.ts) and imported by the Worker entry (worker-entry.js), which
 * runs ahead of Next entirely.
 *
 * WHY NOT next's proxy.ts / middleware.ts
 * ---------------------------------------
 * Next 16 renamed `middleware` to `proxy` AND pinned it to the Node.js runtime
 * with no opt-out — `get-page-static-info.js` throws "Proxy always runs on
 * Node.js runtime" if you try to set one. @opennextjs/cloudflare 1.19.11 refuses
 * to build a Node middleware outright, and 1.20.x only downgrades that to a
 * warning that it is "experimental ... and not officially maintained". A
 * security boundary does not belong on an experimental, unmaintained code path,
 * so the gate lives in the Worker entry instead — which is what the design
 * called for anyway ("gate by Host in the Worker"), and is a strictly stronger
 * position: it runs before Next's router, its matchers, and its data routes.
 */

/** Hosts that get the whole app. Matched against the request's hostname. */
const VYAVASTH_HOSTS = new Set(["deliver.vyavasth.in", "dev.deliver.vyavasth.in"]);

/**
 * Loopback hostnames. Local dev and `wrangler dev` must behave exactly like the
 * real domain, and their ports vary (3000/8787/8082), so this is matched on the
 * hostname with the port already stripped.
 */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Path prefixes a studio hostname may serve.
 *
 * `/_next/image` is NOT optional: the gallery renders photos through next/image,
 * so blocking it would leave a studio's own domain serving a gallery with no
 * pictures in it. `/_next/static` is here for completeness — Cloudflare's asset
 * binding serves it without ever invoking this Worker while `run_worker_first`
 * is unset — so that a future flip of that flag doesn't silently 404 every
 * stylesheet.
 *
 * Note what is deliberately ABSENT: a blanket `/_next/` allowance. `/_next/data`
 * is a Pages Router data route, and allowing the whole prefix is exactly how a
 * page gets protected while its data route leaks.
 */
const ALLOWED_PREFIXES = [
  "/event/",
  "/_next/static/",
  "/_next/image",
  // Cloudflare's own image-resizing path. These never reach a production
  // Worker; it is allowed so local/preview behaviour matches production.
  "/cdn-cgi/",
];

/** Exact paths a studio hostname may serve. */
const ALLOWED_EXACT = new Set([
  "/error/qr-not-found",
  "/error/qr-not-assigned",
  "/favicon.ico",
  "/icon.svg",
  "/robots.txt",
  // public/ — served by the asset binding in practice, allowed for the same
  // reason as /_next/static above.
  "/vyavasth-full-logo.svg",
  "/vyavasth-icon.svg",
  "/file.svg",
  "/globe.svg",
  "/next.svg",
  "/vercel.svg",
  "/window.svg",
]);

/**
 * Is this one of our own hostnames (or local dev)?
 *
 * Accepts a bare hostname or a host:port. An IPv6 literal keeps its brackets,
 * which is why they appear in LOCAL_HOSTNAMES.
 */
export function isVyavasthHost(host: string | null | undefined): boolean {
  const raw = (host ?? "").trim().toLowerCase();
  if (!raw) return false;
  const hostname = raw.startsWith("[") ? raw.slice(0, raw.indexOf("]") + 1) : raw.split(":")[0];
  return VYAVASTH_HOSTS.has(hostname) || LOCAL_HOSTNAMES.has(hostname);
}

/** Is this path part of the guest-facing surface a studio hostname may serve? */
export function isGuestSurfacePath(pathname: string): boolean {
  if (ALLOWED_EXACT.has(pathname)) return true;
  return ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * The whole decision, in one call: may this (host, path) be served?
 *
 * A caller that gets `false` must answer **404, not a redirect**. Redirecting
 * /dashboard to deliver.vyavasth.in would tell anyone poking at a studio URL
 * exactly where the real app lives, and would make a studio's own domain look
 * like it forwards to a third party. A 404 says "there is nothing here", which
 * from that hostname is true.
 */
export function isRequestAllowed(host: string | null | undefined, pathname: string): boolean {
  // First and cheapest branch, deliberately: every request to our own domains —
  // which is all of them today — costs one Set lookup and nothing else.
  if (isVyavasthHost(host)) return true;
  return isGuestSurfacePath(pathname);
}
