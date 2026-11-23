"use client";

import { useMemo } from "react";
import { normalizeDeliveryPreferences } from "@/lib/delivery-preferences";
import { AmbientBackdrop } from "../AmbientBackdrop";
import { useEventTheme } from "../EventThemeContext";
import { HeroSubtitle } from "./lounge/HeroSubtitle";
import { eventTitleStyle } from "./lounge/eventTitleStyle";
import { formatDate, useIsDesktop } from "./LoungeGallery";
import { IconGlobe, IconImages } from "@/components/ui/icons";
import { GUEST_LANGS, WELCOME_COPY, effectiveLang, type GuestLang } from "@/lib/guest-language";
import { setDeviceLang, useDeviceLang } from "@/lib/guest-language-store";
import type { ClientTheme } from "@/lib/client-theme";

/**
 * Pre-auth welcome — the first thing an unauthenticated guest sees: the
 * event's cover, name, studio and date, a teaser strip, and a single CTA into
 * sign-in. Skipped entirely for a guest with a valid stored token (see
 * `EventFlow`) — this is only ever the guest's first screen, never shown again
 * once they've signed in once.
 *
 * THE STRIP may show private photos. `sample_media_urls` comes from the
 * landing endpoint's teaser copies (public-folder photos first, then the most
 * liked, then the most recent): separate ~320px WebPs under unguessable keys,
 * never the gallery's own URLs, so nothing here can be turned back into a
 * full-size photo. A brand-new gallery may have none yet (they are built after
 * the first visit), and then the strip is simply absent.
 *
 * The COVER is the flexible element: it takes whatever height the bottom block
 * (count, strip, CTA) leaves, so there is no dead band between them, and on a
 * very short viewport (a landscape phone) its minimum holds and the page
 * scrolls. The CTA follows the event's face search switch: a gallery with it
 * off never asks for a selfie.
 *
 * THE LANGUAGE PICKER sits right above the CTA: English or Hindi, chosen
 * before signing in, kept in this browser and sent with the sign-in so it is
 * saved on the guest (lib/guest-language.ts). This screen's own words follow
 * it at once, so the choice visibly takes.
 */
export function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  const { theme: t, event } = useEventTheme();
  const isDesktop = useIsDesktop();
  const lang = effectiveLang(null, useDeviceLang());
  const copy = WELCOME_COPY[lang];
  const eventName = event.event_name || "this event";
  const branding = event.include_company_branding === true;
  const date = formatDate(event.event_date);
  const photoCount = event.photo_count ?? 0;
  const sampleUrls = event.sample_media_urls ?? [];
  const faceSearchOn = useMemo(
    () => normalizeDeliveryPreferences(event.delivery_preferences).face_search_enabled,
    [event.delivery_preferences],
  );

  const cover = event.background_image
    ? { backgroundImage: `url(${event.background_image})`, backgroundSize: "cover", backgroundPosition: event.background_position || "center" }
    : { backgroundImage: `linear-gradient(150deg, ${t.cover[0]}, ${t.cover[1]})` };

  return (
    <div className="relative isolate flex min-h-[100dvh] flex-col" style={{ background: t.bg, fontFamily: t.font }}>
      <AmbientBackdrop a={t.cover[0]} b={t.brand} />

      {/* cover */}
      <div className="relative min-h-[300px] flex-1 overflow-hidden">
        <div className={`absolute inset-0 ${event.background_image ? "hero-kenburns" : ""}`} style={cover} />
        <div className="absolute inset-0" style={{ background: t.heroScrim }} />
        <div className="fx-blur-in absolute inset-x-0 bottom-0 p-7">
          {branding && event.company_name && (
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/85">
              {copy.galleryBy(event.company_name)}
            </span>
          )}
          {/* The lounge covers' own title treatment, from the one helper all
              three share, so this screen and the gallery it leads into can no
              longer drift apart. */}
          <h1 className="mt-1.5 text-white" style={eventTitleStyle(isDesktop ? "desktop" : "mobile")}>
            {eventName}
          </h1>
          <HeroSubtitle event={event} date={date} size="mobile" />
        </div>
      </div>

      {/* Sized to its content; the cover above absorbs the rest. */}
      <div className="relative mx-auto flex w-full max-w-[460px] shrink-0 flex-col px-7 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6">
        {photoCount > 0 && (
          <div className="fx-rise text-center text-[14.5px] font-bold" style={{ color: t.text }}>
            {copy.photosWaiting(photoCount, photoCount.toLocaleString("en-IN"))}
          </div>
        )}

        {sampleUrls.length > 0 && (
          <div className="fx-rise mt-4 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {sampleUrls.map((url, i) => (
              <div key={i} className="h-24 w-24 flex-none overflow-hidden rounded-xl" style={{ background: t.sunken }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="h-full w-full select-none object-cover [-webkit-touch-callout:none]"
                />
              </div>
            ))}
          </div>
        )}

        <LanguagePicker t={t} lang={lang} label={copy.pickerLabel} className={photoCount > 0 || sampleUrls.length > 0 ? "mt-6" : ""} />

        <button
          type="button"
          onClick={onContinue}
          className={`cta-shine mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full py-4 text-[15px] font-extrabold transition-transform hover:-translate-y-0.5 active:scale-[0.99]`}
          style={{ background: t.brand, color: t.onBrand, boxShadow: t.shadowSm }}
        >
          <IconImages size={18} /> {faceSearchOn ? copy.findMyPhotos : copy.viewPhotos}
        </button>
      </div>
    </div>
  );
}

/** English | हिन्दी, with a thumb that slides to the choice. */
function LanguagePicker({ t, lang, label, className }: { t: ClientTheme; lang: GuestLang; label: string; className: string }) {
  const index = GUEST_LANGS.findIndex((l) => l.code === lang);
  return (
    <div className={`fx-rise flex items-center justify-center gap-3 ${className}`}>
      <span className="flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: t.muted }}>
        <IconGlobe size={15} /> {label}
      </span>
      <div role="radiogroup" aria-label="Language / भाषा" className="relative flex rounded-full p-1" style={{ background: t.sunken }}>
        <span
          aria-hidden
          className="absolute bottom-1 top-1 rounded-full transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ left: 4, width: "calc(50% - 4px)", transform: `translateX(${index * 100}%)`, background: t.card, boxShadow: t.shadowSm }}
        />
        {GUEST_LANGS.map((l) => {
          const on = l.code === lang;
          return (
            <button
              key={l.code}
              type="button"
              role="radio"
              aria-checked={on}
              lang={l.code}
              onClick={() => setDeviceLang(l.code)}
              className="relative z-10 min-w-[84px] cursor-pointer rounded-full px-4 py-1.5 text-[13.5px] transition-colors"
              style={{ color: on ? t.text : t.muted, fontWeight: on ? 800 : 600 }}
            >
              {l.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
