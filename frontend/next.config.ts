import type { NextConfig } from "next";
import { posthogRewrites } from "./lib/posthog-config.ts";

const nextConfig: NextConfig = {
  // PostHog's own endpoints use a trailing slash; redirecting them breaks event delivery.
  skipTrailingSlashRedirect: true,
  // PostHog (dashboard only) talks to /ingest on our own domain, which is proxied to PostHog, so an ad
  // blocker that blocks posthog.com does not drop the events. Empty unless NEXT_PUBLIC_POSTHOG_KEY and
  // NEXT_PUBLIC_POSTHOG_HOST are set at build time.
  async rewrites() {
    return posthogRewrites();
  },
  experimental: {
    optimizePackageImports: [
      "@phosphor-icons/react",
      "react-icons",
      "react-icons/si",
      "react-icons/fa",
      "react-icons/ri",
      "react-icons/bi",
      "react-icons/hi",
      "react-icons/io5",
      "lucide-react",
    ],
  },
  // The Client's memory lane page used to live at /validity/<token>. Links
  // already sent on WhatsApp keep working: they land on the new address.
  async redirects() {
    return [{ source: "/validity/:token", destination: "/memory-lane/:token", permanent: true }];
  },
  // `npm run dev` runs webpack, and pptxgenjs (loaded only when a studio clicks
  // "Download standee designs") has two dynamic `import("node:fs")` calls for
  // writing files from Node. In the browser they are never reached, but webpack
  // still tries to bundle them and stops on the `node:` scheme. Turning those two
  // modules into empty ones for the client bundle fixes dev; the production
  // build (Turbopack) already copes. The empty `turbopack` object is required
  // by Next whenever a `webpack` function is present.
  turbopack: {},
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // Swapped for an empty module before webpack's scheme check runs.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:(fs|https)$/, (resource: { request: string }) => {
          resource.request = "data:text/javascript,module.exports={}";
        }),
      );
    }
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "media.vyavasth.in" },
      { protocol: "https", hostname: "**.vyavasth.in" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
