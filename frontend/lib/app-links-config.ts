/**
 * Pure. The universal-link / App Link association documents, served at
 * /.well-known/ on BOTH open.vyavasth.in and deliver.vyavasth.in. Two apps:
 *
 *   Guest app (Vyavasth gallery)  /e/* and /event/*, so a gallery link tapped
 *                                 in WhatsApp or SMS opens the app when it is
 *                                 installed.
 *   Studio app (Vyavasth Studio)  /r/* (referral links) and /dashboard/events/*
 *                                 (open an event), on deliver.vyavasth.in (the
 *                                 only domain the studio app claims). Nothing
 *                                 under billing or checkout opens it: those
 *                                 pages stay on the website (store rules).
 *
 * Studio custom domains cannot be listed in an app, which is why the paste and
 * QR flows exist.
 *
 * Every value is public by nature (Apple and Google fetch these files
 * anonymously), so they come from NEXT_PUBLIC_ build-time variables:
 *   NEXT_PUBLIC_APPLE_APP_ID                "<TEAMID>.in.vyavasth.gallery"
 *   NEXT_PUBLIC_PLAY_PACKAGE                "in.vyavasth.gallery"
 *   NEXT_PUBLIC_ANDROID_CERT_SHA256         comma-separated SHA-256 fingerprints of
 *                                           the Play App Signing key AND the upload key
 *   NEXT_PUBLIC_STUDIO_APPLE_APP_ID         "<TEAMID>.in.vyavasth.studio"
 *   NEXT_PUBLIC_STUDIO_PLAY_PACKAGE         "in.vyavasth.studio"
 *   NEXT_PUBLIC_STUDIO_ANDROID_CERT_SHA256  the studio app's two fingerprints, as above
 * An app whose values are unset is left out; with none set the documents are empty.
 */
export const GUEST_PATHS = ["/e/*", "/event/*"] as const;
export const STUDIO_PATHS = ["/r/*", "/dashboard/events/*"] as const;

export function appleAppSiteAssociation(guestAppId: string | undefined, studioAppId?: string | undefined) {
  const details: { appIDs: string[]; components: { "/": string }[] }[] = [];
  const add = (id: string | undefined, paths: readonly string[]) => {
    const appId = id?.trim();
    if (appId) details.push({ appIDs: [appId], components: paths.map((p) => ({ "/": p })) });
  };
  add(guestAppId, GUEST_PATHS);
  add(studioAppId, STUDIO_PATHS);
  return { applinks: { details } };
}

/** One Android app: its package and its comma-separated SHA-256 fingerprints. */
export type AndroidApp = { pkg: string | undefined; fingerprints: string | undefined };

/**
 * assetlinks.json has no paths (the app's own intent filters choose them); each
 * configured app gets one statement.
 */
export function assetLinks(...apps: AndroidApp[]) {
  return apps.flatMap(({ pkg, fingerprints }) => {
    const name = pkg?.trim();
    const sha = (fingerprints ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!name || sha.length === 0) return [];
    return [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: name, sha256_cert_fingerprints: sha },
      },
    ];
  });
}
