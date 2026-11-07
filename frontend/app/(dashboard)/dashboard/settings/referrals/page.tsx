"use client";

import { useEffect, useState } from "react";
import { getMyReferrals } from "@/lib/api";
import {
  referralStatusLabel,
  rewardForMyPlanSentence,
  whatsappShareUrl,
  type MyReferrals,
} from "@/lib/referral";
import { IconGift, IconUsers, IconWhatsApp } from "@/components/ui/icons";
import { SectionHeading, Card, CopyableIdField, SectionSkeleton, FetchError } from "../SettingsUI";

const formatDate = (when: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(
    new Date(when),
  );

/**
 * Refer a Studio: this studio's Referral code and link, what it earns per
 * referral on its current plan, and the studios that joined with its code.
 * Every code, link, figure and message comes from GET /referrals/me; the page
 * words them and nothing more.
 *
 * Only a studio that has paid has a code (the API says `eligible: false`
 * before that), and the reward depends on the plan it is on when a referred
 * studio pays, so the sentence follows its current plan.
 */
export default function ReferralsSettingsPage() {
  const [data, setData] = useState<MyReferrals | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyReferrals()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load your referrals.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const heading = (
    <SectionHeading title="Refer a Studio" description="Invite other studios to Vyavasth with your code." />
  );

  if (error) {
    return (
      <div className="space-y-6">
        {heading}
        <FetchError message={error} />
      </div>
    );
  }
  if (!data) return <SectionSkeleton />;

  const referredBy = data.referred_by?.studio_name ? (
    <p className="text-sm text-[var(--color-brand-muted)]">
      You were referred by <strong className="font-semibold text-[var(--color-brand-ink)]">{data.referred_by.studio_name}</strong>.
    </p>
  ) : null;

  if (!data.eligible || !data.code || !data.link) {
    return (
      <div className="space-y-6">
        {heading}
        <Card title="Your Referral code" icon={<IconGift size={15} />}>
          <p className="text-sm text-[var(--color-brand-muted)]">Refer other studios after your first purchase.</p>
        </Card>
        {referredBy}
      </div>
    );
  }

  const reward = rewardForMyPlanSentence(data.rewards_for_my_plan);

  return (
    <div className="space-y-6">
      {heading}

      <Card title="Your Referral code" description={reward ?? undefined} icon={<IconGift size={15} />}>
        <div className="space-y-4">
          <CopyableIdField label="Code" value={data.code} />
          <CopyableIdField label="Link" value={data.link} />
          <a
            href={whatsappShareUrl(data.share_message, data.link)}
            target="_blank"
            rel="noopener noreferrer"
            className="brand-focus inline-flex h-10 items-center gap-2 rounded-field bg-[var(--color-brand-navy)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
          >
            <IconWhatsApp size={15} />
            Share on WhatsApp
          </a>
        </div>
      </Card>

      <Card title="Studios you referred" icon={<IconUsers size={15} />}>
        {data.stats && (
          <dl className="mb-5 grid grid-cols-3 gap-3">
            <Stat label="Joined" value={data.stats.joined} />
            <Stat label="Rewarded" value={data.stats.rewarded} />
            <Stat label="Reward saved" value={data.stats.pending} />
          </dl>
        )}
        {data.referrals.length === 0 ? (
          <p className="text-sm text-[var(--color-brand-muted)]">No studio has joined with your code yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-brand-border)]">
            {data.referrals.map((referral, i) => (
              <li key={`${referral.studio_name}-${referral.createdAt}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                <span className="min-w-0 truncate text-sm font-medium text-[var(--color-brand-ink)]">
                  {referral.studio_name ?? "A studio"}
                </span>
                <span className="text-xs text-[var(--color-brand-muted)]">
                  {referralStatusLabel(referral.status)} · {formatDate(referral.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {referredBy}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-field bg-[var(--color-brand-bg)] px-3 py-2.5">
      <dt className="text-xs text-[var(--color-brand-muted)]">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--color-brand-ink)]">{value}</dd>
    </div>
  );
}
