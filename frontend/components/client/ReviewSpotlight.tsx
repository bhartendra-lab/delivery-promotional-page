"use client";

import type { EventTemplate } from "@/lib/event-templates";
import type { KvData } from "@/lib/types";

type Props = {
  data: KvData;
  template: EventTemplate;
  onReviewClick: () => void;
};

/**
 * The "leave a Google review BEFORE checking your images" moment. Designed
 * to sit between the hero and the delivery cards as the dominant call to
 * action — full-bleed banner with an animated 5-star line and a glowing,
 * pulsing CTA that the client genuinely wants to tap.
 */
export function ReviewSpotlight({ data, template, onReviewClick }: Props) {
  if (!data.company_gmb_link) return null;
  const { reviewCopy } = template;

  return (
    <section
      className="relative isolate overflow-hidden px-6 py-20 sm:py-28"
      style={{
        background: `linear-gradient(135deg, ${template.accentColor} 0%, ${template.secondaryColor} 100%)`,
      }}
    >
      {/* Concentric soft circles */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
        <div className="absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
      </div>

      {/* Floating stars in the background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {[
          { left: "8%", top: "20%", size: 14, delay: 0.2 },
          { left: "16%", top: "70%", size: 10, delay: 1.4 },
          { left: "82%", top: "18%", size: 18, delay: 0.8 },
          { left: "90%", top: "62%", size: 12, delay: 2.0 },
          { left: "70%", top: "85%", size: 16, delay: 1.1 },
          { left: "26%", top: "85%", size: 9, delay: 1.7 },
        ].map((s, i) => (
          <span
            key={i}
            className="absolute text-white/40"
            style={{
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
              animation: `sparkle ${3 + (i % 3)}s ease-in-out ${s.delay}s infinite`,
            }}
          >
            <StarIcon className="h-full w-full" />
          </span>
        ))}
      </div>

      <div className="mx-auto flex max-w-2xl flex-col items-center text-center text-white">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.4em] text-white/85">
          {reviewCopy.eyebrow}
        </p>

        {/* 5 stars with staggered pop-in */}
        <div className="mb-6 flex items-center gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="block h-7 w-7 text-yellow-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)] sm:h-9 sm:w-9"
              style={{
                animation: `pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${
                  i * 0.12
                }s both`,
              }}
            >
              <StarIcon className="h-full w-full" filled />
            </span>
          ))}
        </div>

        <h2
          className="text-3xl leading-tight sm:text-5xl"
          style={{ fontFamily: template.headingFont, fontWeight: 500 }}
        >
          {reviewCopy.title}
        </h2>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-white/90 sm:text-lg">
          {reviewCopy.body}
        </p>

        <a
          href={data.company_gmb_link}
          target="_blank"
          rel="noreferrer"
          onClick={onReviewClick}
          className="client-anim-pulse-glow group mt-9 inline-flex h-14 items-center gap-3 rounded-full bg-white px-7 text-base font-semibold sm:h-16 sm:px-9 sm:text-lg"
          style={{
            color: template.accentColor,
            ["--pulse-color" as string]: template.glowColor,
          }}
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-yellow-300 text-yellow-900 sm:h-8 sm:w-8">
            <StarIcon className="h-4 w-4 sm:h-5 sm:w-5" filled />
          </span>
          {reviewCopy.cta}
          <span className="transition-transform group-hover:translate-x-1">
            →
          </span>
        </a>

        <p className="mt-4 text-xs text-white/75">
          Takes ~30 seconds · Opens Google in a new tab
        </p>
      </div>
    </section>
  );
}

function StarIcon({
  className,
  filled = false,
}: {
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M12 2.5l2.85 6.08 6.65.78-4.95 4.7 1.3 6.62L12 17.6 6.15 20.7l1.3-6.62-4.95-4.7 6.65-.78L12 2.5z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
