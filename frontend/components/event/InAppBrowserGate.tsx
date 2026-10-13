"use client";

import { useEffect, useState } from "react";
import {
  canContinueInApp,
  detectInAppBrowser,
  escapeUrl,
  shouldAutoEscape,
  type InAppBrowser,
} from "@/lib/in-app-browser";
import { IconBrowser, IconCopy } from "@/components/ui/icons";
import { useEventTheme } from "./EventThemeContext";

/** The automatic hand-off has been tried in this tab — once is enough: a second
 *  try that also fails would just flicker the page again on every reload. */
const TRIED_KEY = "vy-inapp-escape-tried";
/** The Guest chose to stay (Android only). Per tab, so a fresh visit asks again. */
const DISMISSED_KEY = "vy-inapp-dismissed";

/** How long to wait for the hand-off to take the Guest away before concluding
 *  it didn't, and showing the manual steps. */
const ESCAPE_GRACE_MS = 1500;

const recall = (key: string): boolean => {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};
const remember = (key: string): void => {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    /* storage blocked — worst case the Guest is asked again */
  }
};

/** Ask the device to reopen this page in a real browser. */
function openInBrowser(browser: InAppBrowser): void {
  const target = escapeUrl(window.location.href, browser.platform);
  if (target) window.location.href = target;
}

/**
 * Gets a Guest out of an in-app browser (see `lib/in-app-browser.ts` for why
 * and how). On load it tries the automatic hand-off to Safari / the default
 * browser; if the Guest is still here a moment later, it shows this screen with
 * a button to try again and the manual steps.
 *
 * On iPhone the screen cannot be dismissed, because a download there fails
 * silently. Everywhere else it is a warning with a way past it.
 *
 * Renders nothing in a real browser, which is what almost every Guest is in.
 */
export function InAppBrowserGate() {
  const { theme: t } = useEventTheme();
  const [browser, setBrowser] = useState<InAppBrowser | null>(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    (async () => {
      // Defer so this never calls setState synchronously inside the effect body.
      await Promise.resolve();
      if (cancelled) return;
      const nav = window.navigator as Navigator & { standalone?: boolean };
      const standalone =
        nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
      const found = detectInAppBrowser(nav.userAgent ?? "", standalone);
      if (!found) return;
      if (canContinueInApp(found) && recall(DISMISSED_KEY)) return;
      setBrowser(found);
      if (shouldAutoEscape(found) && !recall(TRIED_KEY)) {
        remember(TRIED_KEY);
        openInBrowser(found);
        timer = window.setTimeout(() => {
          if (!cancelled) setVisible(true);
        }, ESCAPE_GRACE_MS);
      } else {
        setVisible(true);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (!browser || !visible) return null;

  const ios = browser.platform === "ios";
  const realBrowser = ios ? "Safari" : "your browser";
  const here = browser.app ? `${browser.app}’s built-in browser` : "an app’s built-in browser";
  const canOpen = browser.platform !== "other";
  const dismissible = canContinueInApp(browser);

  async function copyLink() {
    try {
      await navigator.clipboard?.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the steps above still work */
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
      style={{ background: "rgba(20,14,9,0.55)", backdropFilter: "blur(2px)", fontFamily: t.font }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="inapp-gate-title"
    >
      <div
        className="fx-rise m-3 w-full max-w-[400px] rounded-3xl p-6"
        style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}
      >
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: t.errorSoft, color: t.error }}
        >
          <IconBrowser size={30} />
        </div>
        <h2
          id="inapp-gate-title"
          className="text-center text-[19px] font-extrabold tracking-[-0.02em]"
          style={{ color: t.text }}
        >
          Open in {realBrowser} to continue
        </h2>
        <p className="mt-2 text-center text-[13.5px] font-semibold leading-[1.5]" style={{ color: t.muted }}>
          You’re viewing this gallery in {here}, where photo downloads don’t work properly.
        </p>

        <ol
          className="mt-4 list-decimal space-y-1.5 rounded-2xl py-3 pl-9 pr-4 text-[13px] font-semibold leading-[1.45]"
          style={{ background: t.sunken, color: t.text }}
        >
          <li>Tap the ••• or ⋮ menu at the top or bottom of this screen.</li>
          <li>Choose “Open in browser” (it may say “Open in {ios ? "Safari" : "Chrome"}”).</li>
        </ol>

        <div className="mt-5 flex flex-col gap-2.5">
          {canOpen && (
            <button
              type="button"
              onClick={() => openInBrowser(browser)}
              className="cta-shine flex w-full cursor-pointer items-center justify-center gap-2 rounded-full py-3.5 text-[14px] font-extrabold transition-transform active:scale-[0.99]"
              style={{ background: t.brand, color: t.onBrand }}
            >
              <IconBrowser size={16} /> Open in {realBrowser}
            </button>
          )}
          <button
            type="button"
            onClick={copyLink}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full py-3.5 text-[14px] font-extrabold transition-transform active:scale-[0.99]"
            style={{ background: t.sunken, color: t.text, border: `1px solid ${t.border}` }}
          >
            <IconCopy size={16} /> {copied ? "Link copied!" : "Copy link"}
          </button>
          {dismissible && (
            <button
              type="button"
              onClick={() => {
                remember(DISMISSED_KEY);
                setVisible(false);
              }}
              className="cursor-pointer py-1.5 text-[13px] font-bold underline underline-offset-2"
              style={{ color: t.muted }}
            >
              Continue here anyway
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
