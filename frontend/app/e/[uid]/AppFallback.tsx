"use client";

import { useEffect } from "react";
import { fallbackTarget, handoffPlatform } from "@/lib/app-handoff";

const GALLERY_BASE = process.env.NEXT_PUBLIC_GALLERY_BASE_URL ?? "https://deliver.vyavasth.in";

export function AppFallback({ uid }: { uid: string }) {
  useEffect(() => {
    const nav = window.navigator as Navigator & { userAgentData?: { mobile?: boolean } };
    const platform = handoffPlatform({ ua: nav.userAgent, uaMobile: nav.userAgentData?.mobile, maxTouchPoints: nav.maxTouchPoints ?? 0 });
    window.location.replace(
      fallbackTarget({
        platform,
        uid,
        env: {
          enabled: true,
          appStoreId: process.env.NEXT_PUBLIC_APP_STORE_ID,
          playPackage: process.env.NEXT_PUBLIC_PLAY_PACKAGE,
          androidApkUrl: process.env.NEXT_PUBLIC_ANDROID_APK_URL,
          iosManifestUrl: process.env.NEXT_PUBLIC_IOS_MANIFEST_URL,
        },
        galleryBase: GALLERY_BASE,
      }),
    );
  }, [uid]);
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#FAFAF8] px-6 text-center">
      <p className="text-[15px] font-semibold text-[#7A6F63]">Opening Vyavasth…</p>
    </main>
  );
}
