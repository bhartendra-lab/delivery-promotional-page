import { assetLinks } from "@/lib/app-links-config";

export function GET() {
  return Response.json(assetLinks(process.env.NEXT_PUBLIC_PLAY_PACKAGE, process.env.NEXT_PUBLIC_ANDROID_CERT_SHA256), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
