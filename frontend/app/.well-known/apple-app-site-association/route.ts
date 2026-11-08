import { appleAppSiteAssociation } from "@/lib/app-links-config";

/** Served as application/json with no redirect, as Apple requires. */
export function GET() {
  return Response.json(appleAppSiteAssociation(process.env.NEXT_PUBLIC_APPLE_APP_ID), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
