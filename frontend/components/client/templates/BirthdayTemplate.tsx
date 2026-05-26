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
      {/* HERO -------------------------------------------------------------- */}
      <section
        className={`relative px-6 pb-12 pt-16 sm:pt-24 ${template.pageBackground}`}
      >
        <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
          {data.background_image && (
            <div className="client-anim-pop-in relative mb-8 w-full max-w-xl">
              <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] shadow-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.background_image}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
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
              <p
                className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.35em]"
                style={{ color: template.accentColor }}
              >
                {template.customMessageLabel}
              </p>
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
