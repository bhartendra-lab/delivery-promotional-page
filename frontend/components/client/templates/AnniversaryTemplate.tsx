"use client";

import type { ClientPageProps } from "@/app/(client)/c/[delivery_landing_page_id]/ClientPage";
import { DeliveryLinkCard } from "@/components/client/DeliveryLinkCard";
import { ReviewSpotlight } from "@/components/client/ReviewSpotlight";
import { StudioFooter } from "@/components/client/StudioFooter";
import { WhatsAppCTA } from "@/components/client/WhatsAppCTA";
import {
  AnniversaryDecor,
  RoseDivider,
} from "@/components/client/decorations/AnniversaryDecor";
import {
  CustomMessage,
  DeliverySectionHeading,
  formatEventDate,
  yearsSince,
} from "./shared";

export function AnniversaryTemplate({
  data,
  template,
  onDeliveryClick,
  onReviewClick,
}: ClientPageProps) {
  const years = yearsSince(data.event_date);

  return (
    <article
      className="relative overflow-hidden"
      style={{ fontFamily: template.bodyFont, color: template.inkColor }}
    >
      <AnniversaryDecor />

      {/* HERO -------------------------------------------------------------- */}
      <section
        className={`relative px-6 py-16 sm:py-24 ${template.pageBackground}`}
      >
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 md:grid-cols-2">
          {/* Image with elegant frame */}
          {data.background_image ? (
            <div className="client-anim-fade-up relative">
              <div
                className="absolute -inset-3 rounded-[2rem] opacity-25"
                style={{ background: template.accentColor }}
                aria-hidden
              />
              <div
                className="relative aspect-[4/5] overflow-hidden rounded-[2rem] shadow-2xl"
                style={{
                  border: `1px solid ${template.accentColor}55`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.background_image}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
              <HeartBadge className="absolute -right-4 -top-4 h-20 w-20 sm:-right-6 sm:-top-6 sm:h-24 sm:w-24" />
            </div>
          ) : (
            <div className="client-anim-fade-up flex items-center justify-center">
              <HeartBadge className="h-40 w-40" />
            </div>
          )}

          <div className="flex flex-col items-start text-left">
            <p
              className="client-anim-fade-up text-[11px] font-semibold uppercase tracking-[0.4em]"
              style={{
                color: template.accentColor,
                animationDelay: "0.15s",
              }}
            >
              {data.event_type}
            </p>

            <h1
              className="client-anim-fade-up mt-3 text-5xl leading-[1.05] sm:text-6xl"
              style={{
                fontFamily: template.headingFont,
                color: template.inkColor,
                animationDelay: "0.3s",
              }}
            >
              {data.client_name}
            </h1>

            {data.event_date && (
              <div
                className="client-anim-fade-up mt-6 flex items-baseline gap-3"
                style={{ animationDelay: "0.5s" }}
              >
                {years > 0 && (
                  <span
                    className="text-5xl font-light tabular-nums sm:text-6xl"
                    style={{
                      color: template.secondaryColor,
                      fontFamily: template.headingFont,
                    }}
                  >
                    {years}
                  </span>
                )}
                <div>
                  {years > 0 && (
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-current/70">
                      Years of love
                    </p>
                  )}
                  <p className="text-sm text-current/70">
                    {formatEventDate(data.event_date)}
                  </p>
                </div>
              </div>
            )}

            <RoseDivider className="my-6 sm:my-8" />

            {data.custom_message && (
              <>
                <p
                  className="client-anim-fade-up mb-3 text-[11px] font-semibold uppercase tracking-[0.35em]"
                  style={{ color: template.accentColor }}
                >
                  {template.customMessageLabel}
                </p>
                <CustomMessage
                  data={data}
                  className="client-anim-fade-up text-base sm:text-lg"
                />
              </>
            )}
          </div>
        </div>
      </section>

      <ReviewSpotlight
        data={data}
        template={template}
        onReviewClick={onReviewClick}
      />

      {data.delivery_urls.length > 0 && (
        <section
          className={`relative px-6 py-20 sm:py-28 ${template.pageBackground}`}
        >
          <div className="relative mx-auto max-w-2xl">
            <DeliverySectionHeading
              template={template}
              eyebrow="Your keepsakes"
              title="The gallery"
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

function HeartBadge({ className }: { className?: string }) {
  return (
    <div className={`client-anim-heartbeat ${className ?? ""}`}>
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <defs>
          <radialGradient id="anniv-heart-grad" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#fdb4c4" />
            <stop offset="100%" stopColor="#b56576" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="white" stroke="#b56576" strokeWidth="2" />
        <path
          d="M50 76S26 60 26 42c0-9 7-14 14-14 5 0 8 3 10 6 2-3 5-6 10-6 7 0 14 5 14 14 0 18-24 34-24 34z"
          fill="url(#anniv-heart-grad)"
        />
      </svg>
    </div>
  );
}
