"use client";

import type { ClientPageProps } from "@/app/(client)/c/[delivery_landing_page_id]/ClientPage";
import { DeliveryLinkCard } from "@/components/client/DeliveryLinkCard";
import { ReviewSpotlight } from "@/components/client/ReviewSpotlight";
import { StudioFooter } from "@/components/client/StudioFooter";
import { WhatsAppCTA } from "@/components/client/WhatsAppCTA";
import {
  CustomMessage,
  DeliverySectionHeading,
  formatEventDate,
} from "./shared";

export function CorporateTemplate({
  data,
  template,
  onDeliveryClick,
  onReviewClick,
}: ClientPageProps) {
  const hasImage = Boolean(data.background_image);

  return (
    <article
      className="relative"
      style={{ fontFamily: template.bodyFont, color: template.inkColor }}
    >
      {/* HERO -------------------------------------------------------------- */}
      {hasImage ? (
        <section className="relative min-h-[80svh] w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.background_image}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, transparent 30%, rgba(26,35,50,0.85) 100%)",
            }}
          />
          <div className="relative z-10 flex min-h-[80svh] flex-col items-center justify-end px-6 pb-20 text-center text-white sm:pb-28">
            <p className="client-anim-fade-in text-[11px] font-semibold uppercase tracking-[0.4em] text-white/85">
              {data.event_type}
            </p>
            <h1
              className="client-anim-fade-in mt-4 text-4xl leading-[1.1] sm:text-6xl"
              style={{ fontFamily: template.headingFont }}
            >
              {data.client_name}
            </h1>
            {data.event_date && (
              <p className="client-anim-fade-in mt-4 text-sm uppercase tracking-[0.3em] text-white/85">
                {formatEventDate(data.event_date)}
              </p>
            )}
          </div>
        </section>
      ) : (
        <section
          className={`relative px-6 py-24 sm:py-32 ${template.pageBackground}`}
        >
          <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
            <p
              className="client-anim-fade-in text-[11px] font-semibold uppercase tracking-[0.4em]"
              style={{ color: template.accentColor }}
            >
              {data.event_type}
            </p>
            <h1
              className="client-anim-fade-in mt-4 text-4xl leading-[1.1] sm:text-6xl"
              style={{
                fontFamily: template.headingFont,
                color: template.inkColor,
              }}
            >
              {data.client_name}
            </h1>
            {data.event_date && (
              <p className="client-anim-fade-in mt-4 text-sm uppercase tracking-[0.3em] text-current/70">
                {formatEventDate(data.event_date)}
              </p>
            )}
          </div>
        </section>
      )}

      {/* CUSTOM MESSAGE ---------------------------------------------------- */}
      {data.custom_message && (
        <section
          className={`relative px-6 py-20 sm:py-24 ${template.pageBackground}`}
        >
          <div className="relative mx-auto max-w-2xl text-center">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.35em]"
              style={{ color: template.accentColor }}
            >
              {template.customMessageLabel}
            </p>
            <div className="mt-6">
              <CustomMessage data={data} className="text-lg leading-relaxed" />
            </div>
          </div>
        </section>
      )}

      {/* DELIVERY ---------------------------------------------------------- */}
      {data.delivery_urls.length > 0 && (
        <section
          className={`relative px-6 py-20 sm:py-24 ${template.pageBackground}`}
        >
          <div className="relative mx-auto max-w-2xl">
            <DeliverySectionHeading
              template={template}
              eyebrow="Your files"
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

      <ReviewSpotlight
        data={data}
        template={template}
        onReviewClick={onReviewClick}
      />
      <WhatsAppCTA data={data} template={template} />
      <StudioFooter data={data} template={template} />
    </article>
  );
}
