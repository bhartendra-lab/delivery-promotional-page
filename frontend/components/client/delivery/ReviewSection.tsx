"use client";

import { useState } from "react";
import type { KvData } from "@/lib/types";
import type { Tokens } from "./tokens";
import type { EventTemplate } from "@/lib/event-templates";
import { GoogleG, StarIcon } from "./icons";

type Props = {
  data: KvData;
  tokens: Tokens;
  template: EventTemplate;
  onReviewClick: () => void;
};

/**
 * Card with eyebrow + title + body + interactive 5-star picker. When the
 * client picks a star, the card transitions to a "Thank you" state with
 * filled stars. The Google review CTA is a quiet bordered link, not a
 * gradient banner. Reference HTML lines 549–622.
 *
 * If the studio hasn't provided a `company_gmb_link`, the whole section
 * is skipped — we don't want to render a review prompt with nowhere to send
 * the click.
 */
export function ReviewSection({
  data,
  tokens,
  template,
  onReviewClick,
}: Props) {
  const [hover, setHover] = useState(0);
  const [picked, setPicked] = useState(0);
  const [done, setDone] = useState(false);

  if (!data.company_gmb_link) return null;
  const { reviewCopy } = template;

  const handleStar = (n: number) => {
    setPicked(n);
    setTimeout(() => {
      setDone(true);
      onReviewClick();
      // Open the Google review page in a new tab so the client can leave a
      // real review while the thank-you state remains visible behind it.
      window.open(data.company_gmb_link, "_blank", "noopener");
    }, 480);
  };

  return (
    <section
      className="mx-6 mt-7 rounded-2xl px-6 py-8 text-center"
      style={{
        background: tokens.bgCard,
        border: `1px solid ${tokens.borderHi}`,
      }}
    >
      {done ? (
        <>
          <div className="mb-3.5 flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <StarIcon key={n} s={22} filled color={tokens.gold} />
            ))}
          </div>
          <div
            className="mb-1.5 text-[19px] font-bold"
            style={{ color: tokens.text }}
          >
            Thank you.
          </div>
          <div
            className="text-[13px] leading-[1.6]"
            style={{ color: tokens.muted }}
          >
            Your words help us reach more families.
          </div>
          <a
            href={data.company_gmb_link}
            target="_blank"
            rel="noreferrer"
            onClick={onReviewClick}
            className="mt-6 inline-flex items-center gap-2 rounded-lg px-5 py-[11px] text-[13px] font-semibold"
            style={{
              background: "transparent",
              border: `1px solid ${tokens.borderHi}`,
              color: tokens.muted,
            }}
          >
            <GoogleG /> {reviewCopy.cta}
          </a>
        </>
      ) : (
        <>
          <div
            className="mb-3.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: tokens.accent }}
          >
            {reviewCopy.eyebrow}
          </div>
          <h2
            className="mb-2.5 text-[20px] font-bold leading-[1.3]"
            style={{ color: tokens.text, letterSpacing: "-0.02em" }}
          >
            {reviewCopy.title}
          </h2>
          <p
            className="mb-7 text-[13px] leading-[1.65]"
            style={{ color: tokens.muted }}
          >
            {reviewCopy.body}
          </p>
          <div className="mb-6 flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => {
              const active = (hover || picked) >= n;
              return (
                <button
                  key={n}
                  type="button"
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => handleStar(n)}
                  className="border-none bg-transparent p-1 transition-transform duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                  style={{
                    transform: active ? "scale(1.2)" : "scale(1)",
                    cursor: "pointer",
                  }}
                  aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
                >
                  <StarIcon
                    s={30}
                    filled={active}
                    color={active ? tokens.gold : tokens.faint}
                  />
                </button>
              );
            })}
          </div>
          <a
            href={data.company_gmb_link}
            target="_blank"
            rel="noreferrer"
            onClick={onReviewClick}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-[11px] text-[13px] font-semibold"
            style={{
              background: "transparent",
              border: `1px solid ${tokens.borderHi}`,
              color: tokens.muted,
            }}
          >
            <GoogleG /> {reviewCopy.cta}
          </a>
        </>
      )}
    </section>
  );
}
