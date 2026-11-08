import { AppFallback } from "./AppFallback";

/**
 * open.vyavasth.in/e/<uid> — loads ONLY when the app did not open (an
 * installed app catches the universal link / App Link before any page
 * loads). Sends the visitor on: iOS to the App Store, Android to Play with the
 * install referrer, anything else to the gallery itself.
 */
export default async function Page({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  return <AppFallback uid={decodeURIComponent(uid)} />;
}

export const metadata = { robots: { index: false } };
