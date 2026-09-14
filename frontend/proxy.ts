import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Host gate for studio custom domains — the security boundary for the whole
 * custom-domain feature, and the app's FIRST proxy/middleware of any kind.
 *
 * WHY THIS FILE IS NAMED proxy.ts
 * -------------------------------
 * Next 16 deprecated the `middleware` file convention and renamed it to
 * `proxy` (see node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/proxy.md — "v16.0.0: Middleware is deprecated and renamed
 * to Proxy"). A file called middleware.ts is the deprecated spelling on this
 * version; this is the same feature under its current name.
 *
 * WHAT IT DOES
 * ------------
 * One Worker serves both the studio dashboard and the public galleries. Once a
 * studio points gallery.studioxyz.com at us, that Worker answers on their
 * hostname too — which would otherwise mean the entire Vyavasth dashboard,
 * login page included, is reachable at a URL that looks like it belongs to the
 * studio. So: on any host that is not ours, only the guest-facing surface is
 * served and everything else is a 404.
 *
 * 404, NOT A REDIRECT. Redirecting /dashboard to deliver.vyavasth.in would tell
 * anyone poking at a studio URL exactly where the real app lives, and would make
 * a studio's own domain look like it forwards to a third party. A 404 says
 * "there is nothing here", which is true.
 *
 * SCOPE, HONESTLY STATED: this is route-level only. The dashboard bundle is
 * still DEPLOYED on that host — it is unreachable, not absent. Splitting the
 * gallery and the dashboard into two Workers is the complete fix and was
 * deliberately deferred; this gate is what makes deferring it safe.
 */

/**
 * Hosts that get the whole app. Compared against the request's `host` header
 * (which includes the port), so the localhost entries are matched by hostname
 * separately below — a dev server's port varies (3000/3001/8082) and pinning
 * every one of them here would be a trap.
 */
const VYAVASTH_HOSTS = new Set(["deliver.vyavasth.in", "dev.deliver.vyavasth.in"]);

/** Loopback hostnames. Local dev must behave exactly like the real domain. */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Paths a studio hostname may serve. Everything guest-facing, and nothing else.
 *
 * `/_next` is here for completeness rather than necessity: with
 * `run_worker_first` unset, Cloudflare serves everything under
 * `.open-next/assets` (which is `/_next/static/**` plus `public/**`) directly
 * from the asset binding without invoking this Worker at all. The matcher below
 * excludes those too. Listing them means a future `run_worker_first` flip
 * doesn't silently 404 every stylesheet.
 */
const PUBLIC_PREFIXES = ["/event/", "/_next/"];
const PUBLIC_EXACT = new Set([
  "/error/qr-not-found",
  "/error/qr-not-assigned",
  "/favicon.ico",
  "/icon.svg",
  "/robots.txt",
  // public/ — served by the asset binding in practice, allowed here for the
  // same reason as /_next above.
  "/vyavasth-full-logo.svg",
  "/vyavasth-icon.svg",
  "/file.svg",
  "/globe.svg",
  "/next.svg",
  "/vercel.svg",
  "/window.svg",
]);

function isVyavasthHost(host: string): boolean {
  if (VYAVASTH_HOSTS.has(host)) return true;
  // Strip the port before the loopback check; an IPv6 literal keeps its
  // brackets, which is why they are in LOCAL_HOSTNAMES above.
  const hostname = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  return LOCAL_HOSTNAMES.has(hostname);
}

function isGuestSurface(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";

  // FIRST and cheapest branch, deliberately: every request to our own domains —
  // which is all of them today — costs one Set lookup and nothing else. Nothing
  // about the existing app changes.
  if (isVyavasthHost(host)) return NextResponse.next();

  // Any other host is a studio custom domain (Cloudflare for SaaS only routes
  // hostnames we explicitly created, so an unknown host here means either a
  // studio domain or a direct hit on the fallback origin).
  if (isGuestSurface(request.nextUrl.pathname)) return NextResponse.next();

  return new NextResponse(null, { status: 404 });
}

export const config = {
  // Skips the gate on static assets and image optimisation, which the asset
  // binding already serves without reaching the Worker. `_next/data` is
  // deliberately NOT excluded — Next runs proxy on those routes regardless (see
  // the negative-matching note in the proxy docs), which is what stops a
  // protected page leaking through its own data route.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
