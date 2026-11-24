"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PREVIEW_MESSAGE_SOURCE, readPreviewMessage, type PreviewDraft } from "@/lib/preview-data";
import { IconLink } from "./icons";

/** The width a phone is previewed at, in CSS pixels. The real gallery lays out at it, scaled down only when the column is narrower. */
export const PHONE_WIDTH = 390;
/** Height of the phone preview and of the desktop preview, at their own widths. */
const PHONE_HEIGHT = 780;
/** The width the desktop gallery is laid out at before it is scaled to fit the column. */
const DESKTOP_WIDTH = 1280;
const DESKTOP_HEIGHT = 800;

/** The content-box width of `ref`'s element, tracked live; null until measured. */
function useContentWidth(ref: React.RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/**
 * The real guest gallery, in an iframe, for the Gallery Design tab. It is the
 * dashboard's own preview route (`/dashboard/events/:id/preview`), which renders
 * the actual guest screens with nothing recorded, so what the studio sees here
 * is what guests get, not a mock of it.
 *
 * Each change in the tab's draft (theme, event briefing, studio profile) is
 * pushed in with postMessage, so it shows before it is saved. The desktop
 * gallery is laid out at 1280px and scaled to fit the column; the phone one at
 * 390px. Only this page's own origin is listened to.
 */
export function GalleryPreviewFrame({
  bookingId,
  uniqueIdentifier,
  galleryUrl,
  scope,
  device,
  draft,
}: {
  bookingId: string;
  uniqueIdentifier: string | undefined;
  /** The real, custom-domain aware gallery link, shown where a browser would show it. */
  galleryUrl: string;
  scope: "landing" | "gallery";
  device: "desktop" | "mobile";
  draft: PreviewDraft;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const available = useContentWidth(wrapRef);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [readyFor, setReadyFor] = useState<string | null>(null);

  const src = uniqueIdentifier
    ? `/dashboard/events/${encodeURIComponent(bookingId)}/preview?uid=${encodeURIComponent(uniqueIdentifier)}&view=${scope}`
    : null;

  // The frame says it is ready each time it loads; only then is a draft sent.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const msg = readPreviewMessage(e, window.location.origin);
      if (msg?.type === "ready") setReadyFor(src);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [src]);

  // The draft, whenever it changes and the frame is ready for it.
  const draftKey = JSON.stringify(draft);
  useEffect(() => {
    if (!src || readyFor !== src) return;
    iframeRef.current?.contentWindow?.postMessage(
      { source: PREVIEW_MESSAGE_SOURCE, type: "draft", draft },
      window.location.origin,
    );
    // `draft` is carried by draftKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, readyFor, src]);

  if (!src) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-[13px] text-[var(--color-brand-body)]">
        The preview appears once the event is fully set up. Try reopening this event.
      </div>
    );
  }

  const natural = device === "desktop" ? { w: DESKTOP_WIDTH, h: DESKTOP_HEIGHT } : { w: PHONE_WIDTH, h: PHONE_HEIGHT };
  // Scale down whole when the column is narrower; never scale up.
  const scale = available === null ? 1 : Math.min(1, Math.max(0.2, (available - (device === "mobile" ? 24 : 0)) / natural.w));

  const frame = (
    <iframe
      ref={iframeRef}
      key={src}
      src={src}
      title={`Preview of the ${scope === "landing" ? "landing page" : "photo gallery"}, as guests see it`}
      className="block border-0 bg-white"
      style={{ width: natural.w, height: natural.h }}
    />
  );

  return (
    <div ref={wrapRef} className="flex flex-1 flex-col items-center gap-3 p-4 sm:p-6 lg:overflow-auto">
      {device === "desktop" ? (
        <div
          className="shrink-0 overflow-hidden rounded-xl border border-[var(--color-brand-outline)] bg-white shadow-[0_14px_36px_rgba(42,34,24,0.12)]"
          style={{ width: natural.w * scale, height: (natural.h + 40) * scale }}
        >
          <div style={{ width: natural.w, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <div className="flex h-10 items-center gap-2.5 border-b border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3.5">
              <span className="flex gap-1.5">
                {["#E0796A", "#E6B84F", "#74B36A"].map((c) => (
                  <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                ))}
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-[var(--color-brand-border)] bg-white px-3 py-1 font-mono text-[12px] text-[var(--color-brand-body)]">
                <IconLink size={12} className="shrink-0 text-[var(--color-brand-success)]" />
                <span className="truncate">{galleryUrl || "Your gallery link"}</span>
              </div>
            </div>
            {frame}
          </div>
        </div>
      ) : (
        <div
          className="shrink-0 overflow-hidden rounded-[34px] bg-[var(--color-brand-ink)] shadow-[0_14px_36px_rgba(42,34,24,0.18)]"
          style={{ width: (natural.w + 20) * scale, height: (natural.h + 20) * scale }}
        >
          <div style={{ width: natural.w + 20, height: natural.h + 20, transform: `scale(${scale})`, transformOrigin: "top left", padding: 10 }}>
            <div className="overflow-hidden rounded-[26px] bg-white" style={{ width: natural.w, height: natural.h }}>
              {frame}
            </div>
          </div>
        </div>
      )}
      <p className="type-meta max-w-[560px] text-center">
        This is your real gallery, with your unsaved changes. Nothing you do here is counted or sent.
        {galleryUrl && (
          <>
            {" "}
            Guests open it at <span className="font-mono">{galleryUrl}</span>.
          </>
        )}
      </p>
    </div>
  );
}
