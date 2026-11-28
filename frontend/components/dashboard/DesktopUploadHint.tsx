"use client";

import { useState } from "react";
import { IconMonitor, IconShare, IconX } from "@/components/ui/icons";

const DISMISS_KEY = "vyavasth:desktop-upload-hint-dismissed";

function wasDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * On a phone, above an event's photos: uploading works here, but a whole
 * event is easier from a computer. Most new Studios arrive from a WhatsApp
 * campaign on their phone, create the event there, and then face hundreds of
 * photos. "Send this link to yourself" opens the phone's share sheet
 * (WhatsApp, email...) with this event's address, so the computer is one tap
 * away; without a share sheet the link is copied.
 *
 * Phones only (hidden from sm up). Closing it lasts for this visit.
 */
export function DesktopUploadHint() {
  const [hidden, setHidden] = useState(() => typeof window !== "undefined" && wasDismissed());
  const [copied, setCopied] = useState(false);
  if (hidden) return null;

  async function sendToSelf() {
    const url = window.location.href.split("?")[0];
    const text = "Open this on your computer to upload the event's photos:";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Upload on Vyavasth", text, url });
        return;
      }
    } catch {
      /* closed the share sheet: nothing to do */
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* no clipboard either: the address bar still has it */
    }
  }

  function close() {
    setHidden(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* remembered for this page only */
    }
  }

  return (
    <div className="flex shrink-0 items-start gap-2.5 border-b border-[var(--color-brand-border)] bg-[var(--color-brand-navy-soft)] px-4 py-3 sm:hidden">
      <IconMonitor size={18} className="mt-0.5 shrink-0 text-[var(--color-brand-navy)]" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-snug text-[var(--color-brand-ink)]">
          Uploading works on your phone too, but a computer is smoother and faster for a full event.
        </p>
        <button
          type="button"
          onClick={sendToSelf}
          className="brand-focus mt-1.5 inline-flex items-center gap-1.5 rounded text-[12.5px] font-semibold text-[var(--color-brand-navy)] underline-offset-2 hover:underline"
        >
          <IconShare size={13} />
          {copied ? "Link copied" : "Send this link to yourself"}
        </button>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="brand-focus -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-brand-muted)] hover:bg-white/60"
      >
        <IconX size={13} />
      </button>
    </div>
  );
}
