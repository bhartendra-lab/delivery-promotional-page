"use client";

import { useEffect, useRef, useState } from "react";
import { APP_PACKAGE, buildIntentUrl, buildPlayUrl, handoffPlatform, handoffUrl, installRoute, itmsServicesUrl, SESSION_KEY_PREFIX, shouldOfferAppHandoff, type HandoffEnv } from "@/lib/app-handoff";
import { detectInAppBrowser, escapeUrl, shouldAutoEscape } from "@/lib/in-app-browser";
import type { DeliveryLandingPageData } from "@/lib/types";
import { useEventTheme } from "./EventThemeContext";

/**
 * "Get your photos in the app": every phone or tablet visitor is asked,
 * desktops never. Over the WelcomeScreen, once per event per browser session
 * (a fresh QR scan or link tap asks again; a reload does not).
 *
 *   iOS     copy the handoff link (best effort, for the app's paste offer
 *           after a fresh install), then go to open.vyavasth.in/e/<uid>: that
 *           cross-domain tap opens the app, or the page sends them to the App
 *           Store.
 *   Android intent:// that opens the app, or Play with the install referrer;
 *           straight to Play inside web views where intents are not
 *           dependable.
 *
 * DIRECT INSTALL (until the store listings exist): with an APK / manifest
 * URL set, "Continue in the app" opens the app when installed and otherwise
 * installs it from our CDN, then this sheet stays up with the install steps
 * and an "Open my photos in the app" button that lands on this event.
 *
 *   Android intent:// whose fallback is the APK: Chrome opens the app, or
 *           downloads the APK. In-app browsers (WhatsApp, Instagram) cannot
 *           install apps, so there the download is handed to the real browser.
 *   iOS     itms-services:// (an Ad Hoc build: paid Apple account, devices
 *           registered). Unset until then, so iPhones are not offered.
 *
 * Studio custom domains show it too (D9, default on).
 */
const ENV: HandoffEnv = {
  enabled: process.env.NEXT_PUBLIC_GUEST_APP_ENABLED === "1",
  appStoreId: process.env.NEXT_PUBLIC_APP_STORE_ID,
  playPackage: process.env.NEXT_PUBLIC_PLAY_PACKAGE,
  androidApkUrl: process.env.NEXT_PUBLIC_ANDROID_APK_URL,
  iosManifestUrl: process.env.NEXT_PUBLIC_IOS_MANIFEST_URL,
};
/** Shown on the button so a guest on mobile data knows what they're starting. */
const APK_SIZE_LABEL = process.env.NEXT_PUBLIC_ANDROID_APK_SIZE_MB ? `about ${process.env.NEXT_PUBLIC_ANDROID_APK_SIZE_MB} MB` : null;

const read = (k: string) => {
  try {
    return window.sessionStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    window.sessionStorage.setItem(k, v);
  } catch {
    /* asked again next time: harmless */
  }
};

export function useAppHandoff(uid: string, event: DeliveryLandingPageData) {
  const [state, setState] = useState<"pending" | "offer" | "browser" | "app">("pending");
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      const nav = window.navigator as Navigator & { userAgentData?: { mobile?: boolean } };
      const offer = shouldOfferAppHandoff({
        ua: nav.userAgent ?? "",
        uaMobile: nav.userAgentData?.mobile,
        maxTouchPoints: nav.maxTouchPoints ?? 0,
        env: ENV,
        event,
        sessionChoice: read(SESSION_KEY_PREFIX + uid),
      });
      setState(offer ? "offer" : "browser");
    });
    return () => {
      cancelled = true;
    };
  }, [uid, event]);
  const choose = (choice: "app" | "browser") => {
    write(SESSION_KEY_PREFIX + uid, choice);
    setState(choice);
  };
  return { state, choose };
}

export function AppHandoffSheet({ uid, onChoose }: { uid: string; onChoose: (c: "app" | "browser") => void }) {
  const { theme: t } = useEventTheme();
  const [platform] = useState(() => {
    const nav = window.navigator as Navigator & { userAgentData?: { mobile?: boolean } };
    return handoffPlatform({ ua: nav.userAgent, uaMobile: nav.userAgentData?.mobile, maxTouchPoints: nav.maxTouchPoints ?? 0 });
  });
  const [inApp] = useState(() => detectInAppBrowser(navigator.userAgent ?? ""));
  const route = installRoute(platform, ENV);
  const direct = route === "direct";
  const [step, setStep] = useState<"offer" | "install">("offer");
  const store = platform === "ios" ? "App Store" : "Play Store";
  const pkg = ENV.playPackage ?? APP_PACKAGE;
  const apk = ENV.androidApkUrl ?? "";
  // An in-app browser cannot install an APK: hand the download to the real one.
  const apkInBrowser = inApp ? (escapeUrl(apk, "android") ?? apk) : apk;

  // Direct install: when the app opens, this page goes to the background
  // within a moment of the tap; when it does not, the download starts and the
  // page stays, so show the steps.
  const watch = useRef<(() => void) | null>(null);
  useEffect(() => () => watch.current?.(), []);
  function openOrInstall(go: () => void) {
    watch.current?.();
    let opened = false;
    const onHide = () => {
      if (document.visibilityState === "hidden") opened = true;
    };
    document.addEventListener("visibilitychange", onHide);
    const timer = window.setTimeout(() => {
      cleanup();
      if (opened) onChoose("app");
      else setStep("install");
    }, 1600);
    const cleanup = () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHide);
      watch.current = null;
    };
    watch.current = cleanup;
    go();
  }

  /** Best effort, inside the tap: the app offers a copied gallery link after a fresh install. */
  const copyLink = () => navigator.clipboard?.writeText(handoffUrl(uid, "")).catch(() => {});

  function openApp() {
    if (direct && platform === "android") {
      copyLink();
      if (inApp) {
        // WhatsApp / Instagram: intents and downloads are unreliable in here.
        window.location.href = apkInBrowser;
        setStep("install");
        return;
      }
      openOrInstall(() => {
        window.location.href = buildIntentUrl(pkg, uid, apk);
      });
      return;
    }
    if (direct && platform === "ios") {
      copyLink();
      openOrInstall(() => {
        window.location.href = itmsServicesUrl(ENV.iosManifestUrl!);
      });
      return;
    }
    onChoose("app");
    if (platform === "ios") {
      // Inside the tap handler, so the clipboard write is allowed.
      copyLink();
      window.location.href = handoffUrl(uid);
      return;
    }
    window.location.href = inApp && !shouldAutoEscape(inApp) ? buildPlayUrl(pkg, uid) : buildIntentUrl(pkg, uid);
  }

  /** After installing: open the app at this event (the universal / App Link). */
  function openPhotos() {
    if (platform === "ios") {
      onChoose("app");
      window.location.href = handoffUrl(uid);
      return;
    }
    openOrInstall(() => {
      window.location.href = buildIntentUrl(pkg, uid, apkInBrowser);
    });
  }

  const hint = !direct
    ? `Opens the Vyavasth app, or the ${store} if you don\u2019t have it yet.`
    : platform === "android"
      ? `Opens the Vyavasth app, or downloads it${APK_SIZE_LABEL ? ` (${APK_SIZE_LABEL})` : ""} if you don\u2019t have it yet.`
      : "Opens the Vyavasth app, or installs it if you don\u2019t have it yet.";

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="app-handoff-title" className="fixed inset-0 z-[80] flex items-end justify-center" style={{ background: "rgba(15,11,6,0.48)" }}>
      <div className="sheet-up w-full max-w-[460px] rounded-t-[28px] px-6 pb-[calc(24px+env(safe-area-inset-bottom))] pt-6" style={{ background: t.bg, fontFamily: t.font }}>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/vyavasth-icon.svg" alt="" className="h-12 w-12 rounded-2xl" />
          <h2 id="app-handoff-title" className="text-[21px] font-extrabold leading-tight" style={{ color: t.text }}>
            {step === "install" ? "Install the Vyavasth app" : "Get your photos in the app"}
          </h2>
        </div>

        {step === "offer" ? (
          <>
            <ul className="mt-4 space-y-2 text-[14.5px] font-semibold" style={{ color: t.text }}>
              <li>Sign in once for every event</li>
              <li>Save photos straight to your phone</li>
              <li>Get notified when new photos arrive</li>
            </ul>
            <button type="button" onClick={openApp} className="mt-6 h-12 w-full cursor-pointer rounded-full text-[15px] font-extrabold active:scale-[0.98]" style={{ background: t.brand, color: t.onBrand }}>
              Continue in the app
            </button>
            <p className="mt-2 text-center text-[12.5px]" style={{ color: t.muted }}>
              {hint}
            </p>
          </>
        ) : (
          <InstallSteps platform={platform} inApp={!!inApp} apk={apkInBrowser} theme={t} onOpenPhotos={openPhotos} />
        )}

        <button type="button" onClick={() => onChoose("browser")} className="mt-3 h-12 w-full cursor-pointer rounded-full text-[15px] font-bold" style={{ color: t.text, border: `1px solid ${t.border}` }}>
          {step === "install" ? "Continue in browser for now" : "Continue in browser"}
        </button>
      </div>
    </div>
  );
}

type SheetTheme = ReturnType<typeof useEventTheme>["theme"];

function InstallSteps({ platform, inApp, apk, theme: t, onOpenPhotos }: { platform: string | null; inApp: boolean; apk: string; theme: SheetTheme; onOpenPhotos: () => void }) {
  const steps =
    platform === "ios"
      ? ["Tap Install when your iPhone asks.", "Wait for Vyavasth to appear on your home screen.", "Come back here and open your photos."]
      : [
          inApp ? "Your download opens in your browser. Let it finish." : "Your download has started. Let it finish.",
          "Tap the downloaded file (or its notification).",
          "If your phone asks, allow installing from your browser, then tap Install.",
          "Come back here and open your photos.",
        ];
  return (
    <>
      <ol className="mt-4 space-y-2.5 text-[14.5px] font-semibold" style={{ color: t.text }}>
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12.5px] font-extrabold" style={{ background: t.brand, color: t.onBrand }}>
              {i + 1}
            </span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
      <button type="button" onClick={onOpenPhotos} className="mt-6 h-12 w-full cursor-pointer rounded-full text-[15px] font-extrabold active:scale-[0.98]" style={{ background: t.brand, color: t.onBrand }}>
        Open my photos in the app
      </button>
      {platform === "android" && (
        <p className="mt-2 text-center text-[12.5px]" style={{ color: t.muted }}>
          Vyavasth isn&apos;t on the Play Store yet, so Android asks you to confirm.{" "}
          <a href={apk} className="font-bold underline" style={{ color: t.text }}>
            Download again
          </a>
        </p>
      )}
    </>
  );
}
