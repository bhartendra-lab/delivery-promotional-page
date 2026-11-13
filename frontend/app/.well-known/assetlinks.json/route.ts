import { assetLinks } from "@/lib/app-links-config";

export function GET() {
  return Response.json(
    assetLinks(
      { pkg: process.env.NEXT_PUBLIC_PLAY_PACKAGE, fingerprints: process.env.NEXT_PUBLIC_ANDROID_CERT_SHA256 },
      { pkg: process.env.NEXT_PUBLIC_STUDIO_PLAY_PACKAGE, fingerprints: process.env.NEXT_PUBLIC_STUDIO_ANDROID_CERT_SHA256 },
    ),
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
