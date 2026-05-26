"use client";

import type { ClientPageProps } from "@/app/(client)/c/[delivery_landing_page_id]/ClientPage";
import { DeliveryLinkCard } from "@/components/client/DeliveryLinkCard";
import { ReviewSpotlight } from "@/components/client/ReviewSpotlight";
import { StudioFooter } from "@/components/client/StudioFooter";
import { WhatsAppCTA } from "@/components/client/WhatsAppCTA";
import { PreWeddingDecor } from "@/components/client/decorations/PreWeddingDecor";
import {
  CustomMessage,
  DeliverySectionHeading,
  ScrollCue,
  formatEventDate,
} from "./shared";

export function PreWeddingTemplate({
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
      <PreWeddingDecor />

      {/* HERO — cinematic letterbox -------------------------------------- */}
      <section className="relative min-h-[100svh] w-full overflow-hidden bg-black text-white">
        {/* Background image */}
        <div className="client-anim-letterbox absolute inset-0">
          {data.background_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.background_image}
              alt=""
              className="client-anim-slow-zoom absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#3d2c1f] via-[#7c2d12] to-[#c2410c]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/80" />
        </div>

        {/* Letterbox bars */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-[8vh] bg-black" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-[8vh] bg-black" />

        <div className="relative z-40 flex min-h-[100svh] flex-col items-start justify-end px-6 pb-24 sm:px-12 sm:pb-32">
          <p
            className="client-anim-fade-up text-[11px] uppercase tracking-[0.5em] text-[#fbbf24]"
            style={{ animationDelay: "1.6s" }}
          >
            {data.event_type}
          </p>
          <h1
            className="client-anim-fade-up mt-3 max-w-3xl text-5xl font-medium uppercase leading-[0.95] tracking-tight sm:text-7xl md:text-8xl"
            style={{
              fontFamily: template.headingFont,
              animationDelay: "1.8s",
            }}
          >
            {data.client_name}
          </h1>
          {data.event_date && (
            <div
              className="client-anim-fade-up mt-6 flex items-center gap-3 text-sm tracking-[0.25em] uppercase"
              style={{ animationDelay: "2.1s" }}
            >
              <span
                className="h-[2px] w-10"
                style={{ background: "#fbbf24" }}
              />
              <span>{formatEventDate(data.event_date)}</span>
            </div>
          )}

          <p
            className="client-anim-fade-up mt-2 text-xs uppercase tracking-[0.35em] text-white/60"
            style={{ animationDelay: "2.3s" }}
          >
            {template.moodDescriptor}
          </p>

          <div
            className="client-anim-fade-up absolute bottom-[12vh] right-6 text-white/80 sm:right-12"
            style={{ animationDelay: "2.6s" }}
          >
            <ScrollCue />
          </div>
        </div>
      </section>

      {/* CUSTOM MESSAGE — magazine-style ---------------------------------- */}
      {data.custom_message && (
        <section
          className={`relative px-6 py-20 sm:py-28 ${template.pageBackground}`}
        >
          <div className="relative mx-auto max-w-3xl">
            <span
              className="block text-[11px] font-semibold uppercase tracking-[0.4em]"
              style={{ color: template.accentColor }}
            >
              {template.customMessageLabel}
            </span>
            <div
              className="my-4 h-[3px] w-12"
              style={{ background: template.accentColor }}
            />
            <CustomMessage
              data={data}
              className="text-lg leading-relaxed sm:text-2xl"
            />
          </div>
        </section>
      )}

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
              eyebrow="Behind the lens"
              title="The full reel"
              align="left"
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
