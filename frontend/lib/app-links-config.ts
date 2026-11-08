/**
 * Pure. The universal-link / App Link association documents for the guest
 * app, served at /.well-known/ on BOTH open.vyavasth.in (paths /e/*) and
 * deliver.vyavasth.in (paths /event/*, so a gallery link tapped in WhatsApp
 * or SMS opens the app when it is installed). Studio custom domains cannot be
 * listed in the app, which is why the paste and QR flows exist.
 *
 * Every value is public by nature (Apple and Google fetch these files
 * anonymously), so they come from NEXT_PUBLIC_ build-time variables:
 *   NEXT_PUBLIC_APPLE_APP_ID          "<TEAMID>.in.vyavasth.gallery"
 *   NEXT_PUBLIC_PLAY_PACKAGE          "in.vyavasth.gallery"
 *   NEXT_PUBLIC_ANDROID_CERT_SHA256   comma-separated SHA-256 fingerprints of
 *                                     the Play App Signing key AND the upload key
 */
export function appleAppSiteAssociation(appId: string | undefined) {
  return {
    applinks: {
      details: appId
        ? [{ appIDs: [appId], components: [{ "/": "/e/*" }, { "/": "/event/*" }] }]
        : [],
    },
  };
}

export function assetLinks(pkg: string | undefined, fingerprints: string | undefined) {
  const sha = (fingerprints ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!pkg || sha.length === 0) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: sha },
    },
  ];
}
