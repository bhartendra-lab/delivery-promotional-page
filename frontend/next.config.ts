import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "media.vyavasth.in" },
      { protocol: "https", hostname: "**.vyavasth.in" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
