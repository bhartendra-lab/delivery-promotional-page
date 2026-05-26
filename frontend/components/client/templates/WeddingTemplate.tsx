"use client";

import type { ClientPageProps } from "@/app/(client)/c/[delivery_landing_page_id]/ClientPage";
import { DeliveryLinkCard } from "@/components/client/DeliveryLinkCard";
import { ReviewSpotlight } from "@/components/client/ReviewSpotlight";
import { StudioFooter } from "@/components/client/StudioFooter";
import { WhatsAppCTA } from "@/components/client/WhatsAppCTA";
import { WeddingDecor } from "@/components/client/decorations/WeddingDecor";
import {
  CustomMessage,
  DeliverySectionHeading,
  ScrollCue,
  formatEventDate,
} from "./shared";

export function WeddingTemplate({
  data,
  template,
  onDeliveryClick,
  onReviewClick,
}: ClientPageProps) {
  const [first, second] = splitNames(data.client_name);

  return (
    <article
      className="relative overflow-hidden"
      style={{ fontFamily: template.bodyFont, color: template.inkColor }}
    >
      <WeddingDecor />

      {/* HERO -------------------------------------------------------------- */}
      <section className="relative min-h-[100svh] w-full overflow-hidden">
        {data.background_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.background_image}
            alt=""
            className="client-anim-slow-zoom absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#fdf8f2] via-[#f5e6d6] to-[#c9a76a]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/45 to-black/85" />

        <div className="relative z-30 flex min-h-[100svh] flex-col items-center justify-end px-6 pb-20 text-center text-white sm:pb-28">
          <p className="client-anim-fade-up mb-4 text-[11px] uppercase tracking-[0.6em] text-white/90">
            A {data.event_type.toLowerCase()} story
          </p>

          {second ? (
            <h1
              className="flex flex-col items-center gap-1 leading-none sm:gap-2"
              style={{ fontFamily: template.headingFont }}
            >
              <span
                className="client-anim-fade-up text-5xl font-light italic sm:text-7xl"
                style={{ animationDelay: "0.15s" }}
              >
                {first}
              </span>
              <span
                className="client-anim-fade-up text-2xl text-[#c9a76a] sm:text-3xl"
                style={{ animationDelay: "0.35s" }}
              >
                &amp;
              </span>
              <span
                className="client-anim-fade-up text-5xl font-light italic sm:text-7xl"
                style={{ animationDelay: "0.55s" }}
              >
                {second}
              </span>
            </h1>
          ) : (
            <h1
              className="client-anim-fade-up text-5xl font-light italic leading-none sm:text-7xl"
              style={{
                fontFamily: template.headingFont,
                animationDelay: "0.15s",
              }}
            >
              {first}
            </h1>
          )}

          {data.event_date && (
            <div
              className="client-anim-fade-up mt-8 flex items-center gap-4"
              style={{ animationDelay: "0.8s" }}
            >
              <span className="h-px w-12 bg-[#c9a76a]" />
              <span className="text-[11px] uppercase tracking-[0.4em]">
                {formatEventDate(data.event_date)}
              </span>
              <span className="h-px w-12 bg-[#c9a76a]" />
            </div>
          )}

          <div
            className="client-anim-fade-up absolute bottom-8 left-1/2 -translate-x-1/2 text-white/80"
            style={{ animationDelay: "1.4s" }}
          >
            <ScrollCue />
          </div>
        </div>
      </section>

      {/* CUSTOM MESSAGE ---------------------------------------------------- */}
      {data.custom_message && (
        <section
          className={`relative px-6 py-20 sm:py-28 ${template.pageBackground}`}
        >
          <div className="relative mx-auto max-w-2xl text-center">
            <p
              className="mb-6 text-[11px] font-semibold uppercase tracking-[0.35em]"
              style={{ color: template.accentColor }}
            >
              {template.customMessageLabel}
            </p>
            <Quote className="mx-auto mb-6 h-10 w-10 text-[#c9a76a]" />
            <CustomMessage
              data={data}
              className="text-lg italic leading-relaxed sm:text-xl"
            />
            <div className="mt-10 flex items-center justify-center gap-3">
              <span className="h-px w-10 bg-[#c9a76a]/50" />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#c9a76a">
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span className="h-px w-10 bg-[#c9a76a]/50" />
            </div>
          </div>
        </section>
      )}

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
              eyebrow="And now"
              title="Your photographs"
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

function splitNames(name: string): [string, string | null] {
  const m = name.match(/^(.+?)\s*[&×]\s*(.+)$/);
  if (m) return [m[1].trim(), m[2].trim()];
  if (/\s+and\s+/i.test(name)) {
    const parts = name.split(/\s+and\s+/i);
    if (parts.length === 2) return [parts[0].trim(), parts[1].trim()];
  }
  return [name, null];
}

function Quote({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="currentColor" className={className}>
      <path d="M12 9c-3 0-6 3-6 8v9h8V17h-4c0-3 2-5 4-5l-2-3zM28 9c-3 0-6 3-6 8v9h8V17h-4c0-3 2-5 4-5l-2-3z" />
    </svg>
  );
}
