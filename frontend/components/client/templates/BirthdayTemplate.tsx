"use client";

import type { ClientPageProps } from "@/app/(client)/c/[delivery_landing_page_id]/ClientPage";
import { DeliveryLinkCard } from "@/components/client/DeliveryLinkCard";
import { ReviewSpotlight } from "@/components/client/ReviewSpotlight";
import { StudioFooter } from "@/components/client/StudioFooter";
import { WhatsAppCTA } from "@/components/client/WhatsAppCTA";
import { BirthdayDecor } from "@/components/client/decorations/BirthdayDecor";
import {
  CustomMessage,
  DeliverySectionHeading,
  formatEventDate,
} from "./shared";

export function BirthdayTemplate({
  data,
  template,
  onDeliveryClick,
  onReviewClick,
}: ClientPageProps) {
  return (
    <article
      className="relative overflow-hidden"
      style={{ fontFamily: template.bodyFont, color: template.inkColor }}
    >
      <BirthdayDecor />

      {/* HERO -------------------------------------------------------------- */}
      <section
        className={`relative px-6 pb-12 pt-16 sm:pt-24 ${template.pageBackground}`}
      >
        <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
          <span
            className="client-anim-pop-in mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-white shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${template.accentColor}, ${template.secondaryColor})`,
            }}
          >
            <CakeIcon className="h-4 w-4" />
            It&apos;s a {data.event_type.toLowerCase()}!
          </span>

          {data.background_image ? (
            <div
              className="client-anim-pop-in relative mb-8 w-full max-w-xl"
              style={{ animationDelay: "0.15s" }}
            >
              <div
                className="absolute -inset-2 rounded-[2rem] opacity-60 blur-2xl"
                style={{
                  background: `linear-gradient(135deg, ${template.accentColor}, ${template.secondaryColor})`,
                }}
                aria-hidden
              />
              <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] ring-4 ring-white/80 shadow-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.background_image}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
              <BalloonCluster className="absolute -right-6 -top-6 h-20 w-20 sm:-right-10 -top-10 sm:h-28 sm:w-28" />
            </div>
          ) : (
            <BalloonCluster className="mb-8 h-32 w-32" />
          )}

          <p
            className="client-anim-fade-up text-sm font-semibold uppercase tracking-[0.3em]"
            style={{
              color: template.accentColor,
              animationDelay: "0.3s",
            }}
          >
            Happy Birthday
          </p>
          <h1
            className="client-anim-fade-up mt-3 text-5xl font-extrabold leading-tight sm:text-7xl"
            style={{
              fontFamily: template.headingFont,
              color: template.inkColor,
              animationDelay: "0.5s",
            }}
          >
            {data.client_name}
            <span style={{ color: template.accentColor }}> !</span>
          </h1>
          {data.event_date && (
            <p
              className="client-anim-fade-up mt-3 text-sm text-current/70"
              style={{ animationDelay: "0.7s" }}
            >
              {formatEventDate(data.event_date)}
            </p>
          )}

          {data.custom_message && (
            <div
              className="client-anim-fade-up mt-10 max-w-xl rounded-3xl bg-white/70 p-6 shadow-md backdrop-blur"
              style={{ animationDelay: "0.9s" }}
            >
              <CustomMessage data={data} className="text-center" />
            </div>
          )}
        </div>
      </section>

      {/* REVIEW SPOTLIGHT --------------------------------------------------- */}
      <ReviewSpotlight
        data={data}
        template={template}
        onReviewClick={onReviewClick}
      />

      {/* DELIVERY ---------------------------------------------------------- */}
      {data.delivery_urls.length > 0 && (
        <section
          className={`relative px-6 py-20 sm:py-28 ${template.pageBackground}`}
        >
          <div className="relative mx-auto max-w-2xl">
            <DeliverySectionHeading
              template={template}
              eyebrow="Time to unwrap"
              title="Your party album"
            />
            <div className="mt-10 space-y-4">
              {data.delivery_urls.map((link, i) => (
                <DeliveryLinkCard
                  key={`${link.url}-${i}`}
                  link={link}
                  style={template.deliveryCardStyle}
                  onClick={onDeliveryClick}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <WhatsAppCTA data={data} template={template} />
      <StudioFooter data={data} template={template} />
    </article>
  );
}

function CakeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2l1 3-1 1-1-1zM6 9h12v3H6zM4 13h16v8H4z" />
    </svg>
  );
}

function BalloonCluster({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <g>
        <ellipse cx="42" cy="40" rx="20" ry="24" fill="#fb7185" />
        <ellipse cx="36" cy="32" rx="5" ry="8" fill="white" opacity="0.4" />
        <ellipse cx="76" cy="46" rx="18" ry="22" fill="#fbbf24" />
        <ellipse cx="70" cy="38" rx="4" ry="7" fill="white" opacity="0.4" />
        <ellipse cx="58" cy="22" rx="16" ry="20" fill="#60a5fa" />
        <ellipse cx="52" cy="14" rx="4" ry="6" fill="white" opacity="0.4" />
        <path
          d="M42 64c-2 8 4 14 0 24M76 68c2 8-4 14 0 24M58 42c0 8 6 14 0 26"
          stroke="#52525b"
          strokeWidth="0.8"
          fill="none"
          opacity="0.7"
        />
      </g>
    </svg>
  );
}
