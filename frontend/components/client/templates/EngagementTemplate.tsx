"use client";

import type { ClientPageProps } from "@/app/(client)/c/[delivery_landing_page_id]/ClientPage";
import { DeliveryLinkCard } from "@/components/client/DeliveryLinkCard";
import { ReviewSpotlight } from "@/components/client/ReviewSpotlight";
import { StudioFooter } from "@/components/client/StudioFooter";
import { WhatsAppCTA } from "@/components/client/WhatsAppCTA";
import {
  EngagementDecor,
  EngagementRing,
} from "@/components/client/decorations/EngagementDecor";
import {
  CustomMessage,
  DeliverySectionHeading,
  formatEventDate,
} from "./shared";

export function EngagementTemplate({
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
      <EngagementDecor />

      {/* HERO — ring viewport --------------------------------------------- */}
      <section
        className={`relative px-6 pb-20 pt-20 sm:pt-28 ${template.pageBackground}`}
      >
        <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
          <EngagementRing className="client-anim-fade-up mb-6 h-16 w-12 sm:h-20 sm:w-16" />

          <p
            className="client-anim-fade-up text-[11px] font-semibold uppercase tracking-[0.45em]"
            style={{
              color: template.accentColor,
              animationDelay: "0.2s",
            }}
          >
            She said yes ✨ &nbsp;{data.event_type}
          </p>

          {/* Circular framed photo */}
          {data.background_image ? (
            <div
              className="client-anim-pop-in relative my-8"
              style={{ animationDelay: "0.4s" }}
            >
              <div className="absolute inset-0 client-anim-ring-shimmer">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `conic-gradient(from 0deg, transparent, ${template.accentColor}55, transparent, ${template.secondaryColor}55, transparent)`,
                    padding: "8px",
                    WebkitMask:
                      "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                    WebkitMaskComposite: "xor",
                    maskComposite: "exclude",
                  }}
                />
              </div>
              <div className="relative aspect-square w-64 overflow-hidden rounded-full ring-8 ring-white shadow-2xl sm:w-80">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.background_image}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          ) : (
            <div
              className="my-8 flex aspect-square w-64 items-center justify-center rounded-full shadow-2xl ring-8 ring-white sm:w-80"
              style={{
                background: `linear-gradient(135deg, ${template.secondaryColor}, ${template.accentColor})`,
              }}
            >
              <EngagementRing className="h-32 w-24 text-white" />
            </div>
          )}

          <h1
            className="client-anim-fade-up text-4xl leading-tight sm:text-6xl"
            style={{
              fontFamily: template.headingFont,
              color: template.inkColor,
              animationDelay: "0.6s",
            }}
          >
            {data.client_name}
          </h1>

          {data.event_date && (
            <p
              className="client-anim-fade-up mt-4 inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-1.5 text-sm font-medium shadow-sm backdrop-blur"
              style={{
                color: template.secondaryColor,
                animationDelay: "0.8s",
              }}
            >
              <SparkleIcon className="h-3.5 w-3.5" />
              {formatEventDate(data.event_date)}
              <SparkleIcon className="h-3.5 w-3.5" />
            </p>
          )}

          {data.custom_message && (
            <div
              className="client-anim-fade-up mt-10 max-w-xl rounded-3xl bg-white/60 p-6 backdrop-blur sm:p-8"
              style={{ animationDelay: "1s" }}
            >
              <CustomMessage data={data} className="text-center text-base sm:text-lg" />
            </div>
          )}
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
              eyebrow="The sparkle"
              title="Your photo gallery"
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

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2l1.6 7L21 12l-7.4 3L12 22l-1.6-7L3 12l7.4-3z" />
    </svg>
  );
}
