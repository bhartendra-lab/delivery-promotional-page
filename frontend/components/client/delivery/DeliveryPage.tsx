"use client";

import type { ClientPageProps } from "@/app/(client)/c/[delivery_landing_page_id]/ClientPage";
import { makeTokens } from "./tokens";
import { ClientHeader } from "./ClientHeader";
import { ClientHero } from "./ClientHero";
import { DesktopLeftPanel } from "./DesktopLeftPanel";
import { AccessSection } from "./AccessSection";
import { CustomMessageCard } from "./CustomMessageCard";
import { ReviewSection } from "./ReviewSection";
import { StudioSection } from "./StudioSection";
import { ClientFooter } from "./ClientFooter";

/**
 * Top-level delivery page.
 *
 * The page has two flows — desktop (sticky 32vw left panel + scrolling
 * right column) and mobile (vertical stack) — but the section sequence
 * is identical:
 *
 *   Hero → AccessSection → CustomMessageCard → ReviewSection →
 *   StudioSection → ClientFooter
 *
 * Layout switching is done with CSS media queries (Tailwind's `min-[860px]`
 * arbitrary breakpoint, matching the reference HTML's `useIsDesktop`
 * threshold). Doing the switch in CSS rather than in JS keeps server and
 * client render trees identical — no hydration mismatch, no flash from
 * mobile-then-swap-to-desktop on hydration.
 *
 * The shared sections (Access, CustomMessage, Review, Studio, Footer)
 * render exactly once; only the hero/header chrome varies between flows.
 */
export function DeliveryPage(props: ClientPageProps) {
  const { data, template, onDeliveryClick, onReviewClick } = props;
  const tokens = makeTokens({
    theme: template.theme,
    accent: template.accentColor,
    secondary: template.secondaryColor,
    heroGradient: template.heroGradient,
  });

  const sections = (
    <>
      <AccessSection
        data={data}
        tokens={tokens}
        onDeliveryClick={onDeliveryClick}
      />
      <CustomMessageCard
        data={data}
        tokens={tokens}
        label={template.customMessageLabel}
      />
      <ReviewSection
        data={data}
        tokens={tokens}
        template={template}
        onReviewClick={onReviewClick}
      />
      <StudioSection data={data} tokens={tokens} template={template} />
      <ClientFooter data={data} tokens={tokens} />
    </>
  );

  return (
    <div
      className="min-h-screen min-[860px]:flex min-[860px]:h-screen min-[860px]:overflow-hidden"
      // Diagnostic attributes — exposed so we can verify in DevTools that the
      // event_type from KV is actually reaching the render. Cheap to keep,
      // useful for QA. Drop these once the dashboard→KV pipeline is trusted.
      data-event-type={data.event_type}
      data-template={template.themeName}
      data-theme={template.theme}
      data-accent={template.accentColor}
      style={{
        background: tokens.bg,
        color: tokens.text,
        fontFamily: "var(--font-plus-jakarta), sans-serif",
      }}
    >
      {/* Desktop: sticky 32vw left panel with hero hoisted in. */}
      <div className="hidden min-[860px]:block">
        <DesktopLeftPanel data={data} tokens={tokens} />
      </div>
      <div
        className="hidden w-px shrink-0 min-[860px]:block"
        style={{ background: "rgba(240,232,220,0.07)" }}
        aria-hidden
      />

      {/* Mobile: sticky header + full-width hero stacked above the
          shared section column. */}
      <div className="min-[860px]:hidden">
        <ClientHeader data={data} tokens={tokens} variant="sticky" />
        <ClientHero data={data} tokens={tokens} variant="mobile" />
      </div>

      {/* Shared right column (desktop scrolls, mobile continues the
          stack). Same sections rendered once for both flows. */}
      <div
        className="min-[860px]:h-screen min-[860px]:flex-1 min-[860px]:overflow-y-auto"
        style={{ background: tokens.bg }}
      >
        <div className="mx-auto max-w-[480px] pt-3">{sections}</div>
      </div>
    </div>
  );
}
