/**
 * Worker entry — the Host gate wrapped around OpenNext's generated handler.
 *
 * `wrangler.jsonc` points `main` here instead of at `.open-next/worker.js`, so
 * this runs first on every request that reaches the Worker, ahead of Next's
 * router, its matchers, and its data routes. OpenNext's own handler is then
 * delegated to unchanged.
 *
 * See lib/host-gate.ts for why the gate lives here rather than in Next's
 * proxy.ts: Next 16 pins proxy to the Node.js runtime with no opt-out, and
 * @opennextjs/cloudflare either refuses to build that (1.19.x) or calls it
 * experimental and unmaintained (1.20.x). Neither is a place to put a security
 * boundary.
 *
 * Plain JS rather than TypeScript on purpose: it imports `.open-next/worker.js`,
 * which only exists after a build and is gitignored, so a .ts entry would fail
 * `tsc --noEmit` on a clean checkout. The logic that is worth type-checking and
 * testing lives in lib/host-gate.ts, which this file is a thin shell over.
 *
 * NOTE ON SCOPE, stated honestly: this is route-level. The dashboard bundle is
 * still DEPLOYED on a studio hostname — unreachable, not absent. Splitting the
 * gallery and the dashboard into two Workers is the complete fix and was
 * deliberately deferred; this gate is what makes deferring it safe.
 */
import { isRequestAllowed } from "./lib/host-gate.ts";
import openNextHandler from "./.open-next/worker.js";

// Re-exports OpenNext's Durable Object classes (queue, sharded tag cache, bucket
// cache purge) when the build emits them. `export *` skips `default`, which is
// replaced below. Without this, swapping `main` to this file would drop the DO
// bindings and break any build that enables them.
export * from "./.open-next/worker.js";

const worker = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // The Host header is what Cloudflare routes a custom hostname on, and it is
    // what `request.url` is built from here; read the header first so a request
    // that somehow carries a differing absolute URL is judged on the routed host.
    const host = request.headers.get("host") ?? url.host;

    if (!isRequestAllowed(host, url.pathname)) {
      return new Response(null, { status: 404 });
    }

    return openNextHandler.fetch(request, env, ctx);
  },
};

export default worker;
