"use client";

import { useState } from "react";
import { IconArrowRight, IconCheck, IconCopy, IconInfo, IconLink, IconLock, IconMail, IconScanFace, IconShieldCheck, IconWhatsApp } from "./icons";

/**
 * Tab 3 · Access & Sharing — two-audience console (Host full gallery + Guest
 * face-search). Recreated from `access-sharing-tab.jsx`.
 *
 * TODO(backend): real share-link + passcode generation isn't built yet. The
 * URLs and passcode below are deterministic placeholders derived from the
 * booking. Wire these to the delivery-landing-page routing pipeline (two URLs:
 * /k/<host> and /g/<guest>, family passcode) once the backend lands.
 */
export function AccessSharingTab({
  eventName,
  bookingId,
}: {
  eventName: string;
  bookingId: string;
}) {
  const suffix = bookingId.slice(-4) || "0000";
  const base = slug(eventName);
  // TODO(backend): replace placeholders with real generated links + passcode.
  const hostUrl = `https://vyavasth.in/k/${base}-${suffix}`;
  const guestUrl = `https://vyavasth.in/g/${base}-guests-${suffix}`;
  const passcode = stubPasscode(bookingId);

  const hostMsg = `Namaste! The full gallery for ${eventName} is ready to view and download.

Open your private gallery: ${hostUrl}
Family passcode: ${passcode}

Please keep this passcode within the family.`;

  const guestMsg = `You're invited to relive ${eventName}!

Find every photo you appear in — just open the link and take one quick selfie. No login, no passcode:
${guestUrl}`;

  return (
    <div className="flex-1 overflow-auto bg-[var(--color-brand-bg)]">
      <div className="mx-auto max-w-[1240px] px-6 py-6 sm:px-8">
        <div className="flex flex-col items-stretch gap-4 lg:flex-row">
          {/* Host */}
          <AudienceCard
            tag="URL 1 · Host"
            tagFg="var(--color-brand-navy)"
            tagBg="var(--color-brand-navy-soft)"
            Icon={IconLock}
            accent="var(--color-brand-navy)"
            accentTint="var(--color-brand-navy-soft)"
            title="Host link — full gallery"
            tip="For the couple and immediate family. Opens every folder with the family passcode — downloads enabled, plus a built-in face-search shortcut."
          >
            <Label>Host gallery link</Label>
            <UrlField url={hostUrl} accent="var(--color-brand-navy)" />

            <div className="mt-3.5 flex items-end gap-3">
              <div>
                <Label tip="Auto-included in the Host message. Regenerating invalidates any passcode already shared.">
                  Family passcode
                </Label>
                <div className="inline-flex items-center gap-2.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3.5 py-2">
                  <IconLock size={14} className="text-[var(--color-brand-navy)]" />
                  <span className="font-mono text-[17px] font-bold tabular-nums tracking-[0.2em] text-[var(--color-brand-ink)]">
                    {passcode}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="brand-focus inline-flex items-center gap-1.5 pb-2 text-[12.5px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
                title="Regenerate (not wired yet)"
              >
                <IconArrowRight size={13} /> Regenerate
              </button>
            </div>

            <Dispatch audience="the Host" message={hostMsg} accent="var(--color-brand-navy)" />
          </AudienceCard>

          {/* Guest */}
          <AudienceCard
            tag="URL 2 · Guest"
            tagFg="var(--color-brand-muted)"
            tagBg="#F2F0EB"
            Icon={IconScanFace}
            accent="var(--color-brand-ink)"
            accentTint="#F2F0EB"
            title="Guest link — face photos only"
            tip="For the wider guest list. A guest takes one selfie and sees only the photos they appear in — no passcode, no full-gallery access."
          >
            <Label tip="Guests land on “Find your photos”, take one selfie, and matched results unlock instantly.">
              Guest face-search link
            </Label>
            <UrlField url={guestUrl} accent="var(--color-brand-muted)" />

            <div className="mt-3.5 flex items-center gap-2 text-[12.5px] text-[var(--color-brand-muted)]">
              <IconShieldCheck size={15} className="shrink-0 text-[var(--color-brand-success)]" />
              <span>Selfie matched in-memory, never stored. No passcode required.</span>
            </div>

            <Dispatch audience="Guests" message={guestMsg} accent="var(--color-brand-ink)" />
          </AudienceCard>
        </div>

        <p className="mt-4 text-[12px] text-[var(--color-brand-muted)]">
          Links and passcode shown here are placeholders — real generation will be wired to the backend.
        </p>
      </div>
    </div>
  );
}

function AudienceCard({
  tag,
  tagFg,
  tagBg,
  Icon,
  title,
  tip,
  accent,
  accentTint,
  children,
}: {
  tag: string;
  tagFg: string;
  tagBg: string;
  Icon: (p: { size?: number; style?: React.CSSProperties; className?: string }) => React.ReactElement;
  title: string;
  tip: string;
  accent: string;
  accentTint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-1 flex-col overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-white">
      <div className="flex items-center gap-3 border-b border-[#ECE5D8] px-4 py-4">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]"
          style={{ background: accentTint, color: accent }}
        >
          <Icon size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <span
            className="text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{ color: tagFg, background: tagBg, padding: "2px 7px", borderRadius: 4 }}
          >
            {tag}
          </span>
          <h3 className="mt-1 flex items-center gap-1.5 text-[15.5px] font-bold tracking-tight text-[var(--color-brand-ink)]">
            {title}
            <Tip text={tip} />
          </h3>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">{children}</div>
    </section>
  );
}

function UrlField({ url, accent }: { url: string; accent: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border border-[var(--color-brand-border)] bg-white">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5">
        <IconLink size={14} className="shrink-0" style={{ color: accent }} />
        <span className="truncate font-mono text-[12.5px] text-[var(--color-brand-ink)]">{url}</span>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
        className="inline-flex shrink-0 items-center gap-1.5 border-l border-[var(--color-brand-border)] px-3.5 text-[12.5px] font-semibold"
        style={{
          background: copied ? "var(--color-brand-success-soft)" : "var(--color-brand-bg)",
          color: copied ? "var(--color-brand-success)" : "var(--color-brand-ink)",
        }}
      >
        {copied ? <IconCheck size={15} /> : <IconCopy size={14} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function Dispatch({ audience, message, accent }: { audience: string; message: string; accent: string }) {
  const [text, setText] = useState(message);
  return (
    <div className="mt-4 border-t border-[#ECE5D8] pt-3.5">
      <div className="mb-1.5 flex items-center justify-between">
        <Label tip={`This text is pre-loaded into WhatsApp / email when you dispatch to ${audience}.`}>
          Message to {audience}
        </Label>
        <button
          type="button"
          onClick={() => setText(message)}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
        >
          Reset
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        className="brand-focus block w-full resize-none rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 py-2.5 font-[inherit] text-[12.5px] leading-relaxed text-[var(--color-brand-ink)] outline-none"
      />
      <div className="mt-3 flex items-center gap-2">
        {/* TODO(backend): wire WhatsApp / Email dispatch to real share links. */}
        <button
          type="button"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[12.5px] font-semibold text-white"
          style={{ background: "#1FA855" }}
        >
          <IconWhatsApp size={16} /> WhatsApp
        </button>
        <button
          type="button"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-[12.5px] font-semibold"
          style={{ borderColor: accent, color: accent }}
        >
          <IconMail size={15} /> Email
        </button>
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(text)}
          title="Copy message"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--color-brand-border)] bg-white text-[var(--color-brand-ink)]"
        >
          <IconCopy size={15} />
        </button>
      </div>
    </div>
  );
}

function Label({ children, tip }: { children: React.ReactNode; tip?: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-brand-muted)]">{children}</span>
      {tip && <Tip text={tip} />}
    </div>
  );
}

function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <IconInfo size={14} className="cursor-help text-[#B5ADA4]" />
      {show && (
        <span className="absolute bottom-[calc(100%+8px)] left-1/2 z-50 w-[250px] -translate-x-1/2 rounded-lg bg-[var(--color-brand-ink)] px-3 py-2.5 text-left text-[11.5px] font-medium leading-relaxed text-white shadow-[0_6px_20px_rgba(42,34,24,0.22)]">
          {text}
        </span>
      )}
    </span>
  );
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 22) || "event"
  );
}

/** Deterministic 4-digit stub passcode (TODO: backend mints the real one). */
function stubPasscode(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return String(1000 + (h % 9000));
}
