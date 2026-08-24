"use client";

import { AmbientBackdrop } from "../AmbientBackdrop";
import { useEventTheme } from "../EventThemeContext";
import { HeroSubtitle } from "./lounge/HeroSubtitle";
import { formatDate } from "./LoungeGallery";
import { IconImages } from "@/components/ui/icons";

/**
 * Pre-auth welcome — the first thing an unauthenticated guest sees: the
 * event's cover, name, studio, date, a teaser strip from the (public-folder-
 * scoped) sample photos, and a single "Find my photos" CTA into sign-in.
 * Skipped entirely for a guest with a valid stored token (see
 * `EventFlow`) — this is only ever the guest's first screen, never shown
 * again once they've signed in once.
 */
export function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  const { theme: t, event } = useEventTheme();
  const eventName = event.event_name || "this event";
  const branding = event.include_company_branding === true;
  const date = formatDate(event.event_date);
  const photoCount = event.photo_count ?? 0;
  const sampleUrls = event.sample_media_urls ?? [];

  const cover = event.background_image
    ? { backgroundImage: `url(${event.background_image})`, backgroundSize: "cover", backgroundPosition: event.background_position || "center" }
    : { backgroundImage: `linear-gradient(150deg, ${t.cover[0]}, ${t.cover[1]})` };

  return (
    <div className="relative isolate flex min-h-[100dvh] flex-col" style={{ background: t.bg, fontFamily: t.font }}>
      <AmbientBackdrop a={t.cover[0]} b={t.brand} />

      {/* cover */}
      <div className="relative h-[42vh] min-h-[260px] shrink-0 overflow-hidden">
        <div className={`absolute inset-0 ${event.background_image ? "hero-kenburns" : ""}`} style={cover} />
        <div className="absolute inset-0" style={{ background: t.heroScrim }} />
        <div className="fx-blur-in absolute inset-x-0 bottom-0 p-7">
          {branding && event.company_name && (
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/85">
              Gallery by {event.company_name}
            </span>
          )}
          <h1 className="mt-1.5 text-[32px] font-extrabold leading-[1.1] tracking-[-0.02em] text-white">
            {eventName}
          </h1>
          <HeroSubtitle event={event} date={date} size="mobile" />
        </div>
      </div>

      <div className="relative mx-auto flex w-full max-w-[460px] flex-1 flex-col px-7 pb-8 pt-6">
        {photoCount > 0 && (
          <div className="fx-rise text-center text-[14.5px] font-bold" style={{ color: t.text }}>
            {photoCount.toLocaleString("en-IN")} photo{photoCount === 1 ? "" : "s"} waiting for you
          </div>
        )}

        {sampleUrls.length > 0 && (
          <div className="fx-rise mt-4 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {sampleUrls.map((url, i) => (
              <div key={i} className="h-24 w-24 flex-none overflow-hidden rounded-xl" style={{ background: t.sunken }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        )}

        <div className="flex-1" />

        <p className="mb-4 text-center text-[12.5px] font-semibold leading-[1.5]" style={{ color: t.faint }}>
          You’ll sign in with WhatsApp and take a quick selfie — allow camera access when your browser asks.
        </p>

        <button
          type="button"
          onClick={onContinue}
          className="cta-shine flex w-full cursor-pointer items-center justify-center gap-2 rounded-full py-4 text-[15px] font-extrabold transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
          style={{ background: t.brand, color: t.onBrand, boxShadow: t.shadowSm }}
        >
          <IconImages size={18} /> Find my photos
        </button>
      </div>
    </div>
  );
}
