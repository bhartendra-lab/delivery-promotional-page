"use client";

import type { ClientPageProps } from "@/app/(client)/c/[delivery_landing_page_id]/ClientPage";
import { makeTokens } from "./tokens";
import { useIsDesktop } from "./useIsDesktop";
import { ClientHeader } from "./ClientHeader";
import { ClientHero } from "./ClientHero";
import { DesktopLeftPanel } from "./DesktopLeftPanel";
import { AccessSection } from "./AccessSection";
import { CustomMessageCard } from "./CustomMessageCard";
import { ReviewSection } from "./ReviewSection";
import { StudioSection } from "./StudioSection";
import { ClientFooter } from "./ClientFooter";

/**
 * Top-level delivery page. Same section sequence in both layouts:
 *
 *     Hero → AccessSection → CustomMessageCard → ReviewSection →
 *     StudioSection → ClientFooter
 *
 * Desktop hoists the Hero into a sticky 32vw left panel; the right column
 * starts at AccessSection and scrolls. Mobile stacks everything vertically
 * with the sticky header on top.
 */
export function DeliveryPage(props: ClientPageProps) {
  const { data, template, onDeliveryClick, onReviewClick } = props;
  const tokens = makeTokens({
    theme: template.theme,
    accent: template.accentColor,
    secondary: template.secondaryColor,
    heroGradient: template.heroGradient,
  });

  const isDesktop = useIsDesktop();

  const rightColumn = (
    <div className="mx-auto max-w-[480px]">
      <div className="pt-3">
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
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <div
        className="flex h-screen overflow-hidden"
        style={{
          background: tokens.bg,
          color: tokens.text,
          fontFamily: "var(--font-plus-jakarta), sans-serif",
        }}
      >
        <DesktopLeftPanel data={data} tokens={tokens} />
        <div
          className="w-px shrink-0"
          style={{ background: "rgba(240,232,220,0.07)" }}
          aria-hidden
        />
        <div
          className="h-screen flex-1 overflow-y-auto"
          style={{ background: tokens.bg }}
        >
          {rightColumn}
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: tokens.bg,
        color: tokens.text,
        fontFamily: "var(--font-plus-jakarta), sans-serif",
      }}
    >
      <div
        className="mx-auto min-h-screen max-w-[480px]"
        style={{ background: tokens.bg }}
      >
        <ClientHeader data={data} tokens={tokens} variant="sticky" />
        <ClientHero data={data} tokens={tokens} variant="mobile" />
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
      </div>
    </div>
  );
}
