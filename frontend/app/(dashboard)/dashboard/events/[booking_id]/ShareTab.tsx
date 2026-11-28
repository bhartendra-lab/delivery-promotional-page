"use client";

import { useId, useState } from "react";
import { REGENERATE_PASSCODE_CONFIRM, type GuestAccessDescription } from "@/lib/guest-access-copy";
import { galleryInviteMessage, passcodeShareMessage, SHARE_LANGUAGES, type ShareLang } from "@/lib/share-message";
import { readShareLang, saveShareLang } from "@/lib/share-lang-store";
import { trackEvent } from "@/lib/analytics";
import { Tip } from "@/components/ui/Tip";
import { useEvent } from "./EventContext";
import { QrRow } from "./QrRow";
import { GuestTeamsEditor } from "./GuestTeamsCard";
import { IconCaretDown } from "@/components/ui/icons";
import {
  IconCheck,
  IconCopy,
  IconInfo,
  IconLink,
  IconLock,
  IconMail,
  IconRefresh,
  IconUsers,
  IconWhatsApp,
} from "./icons";

const CARD = "rounded-xl border border-[var(--color-brand-border)] bg-white";
const BTN =
  "brand-focus inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3.5 text-[12.5px] font-semibold text-[var(--color-brand-ink)] transition-colors hover:border-[var(--color-brand-outline)] disabled:opacity-50";
const BTN_WHATSAPP =
  "brand-focus inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#1FA855] px-3.5 text-[13px] font-semibold text-white disabled:opacity-50";

/** One line per audience. The longer explanation is behind the card's info icon. */
function guestLine(access: GuestAccessDescription, hasPublicPhotos: boolean): string {
  if (access.case === "all_public") return "They see every photo.";
  if (access.case === "public_only") return "They see your public folders.";
  if (access.case === "passcode_only") return "They need the passcode to see photos.";
  return hasPublicPhotos ? "They see their own photos and public folders." : "They see their own photos.";
}

/**
 * Share — the first view of Access & Sharing. Organised by WHO the studio is
 * sending to: guests get the link, family get the link and the passcode.
 */
export function ShareTab({
  eventName,
  shareUrl,
  passcode,
  onRegenerate,
  access,
  faceSearchOn,
  hasPublicPhotos,
  fullAccessRedundant,
  qr,
}: {
  eventName: string;
  shareUrl: string;
  passcode: string;
  onRegenerate: () => Promise<string>;
  access: GuestAccessDescription;
  faceSearchOn: boolean;
  hasPublicPhotos: boolean;
  fullAccessRedundant: boolean;
  qr: {
    qrUniqueId?: string;
    qrImageUrl?: string;
    eventDate?: number | null;
    coverUrl?: string;
  };
}) {
  // The language the share messages are written in, remembered per browser.
  // Read once on mount: this tab only mounts after the event has loaded in the
  // browser, so there is no server render for it to disagree with.
  const [lang, setLangState] = useState<ShareLang>(() => readShareLang());
  const setLang = (next: ShareLang) => {
    setLangState(next);
    saveShareLang(next);
  };

  // Shared with the Client's Guest Control, so both send the same words.
  const message = galleryInviteMessage({ eventName, url: shareUrl, faceSearchOn, lang });

  const familyLine =
    access.case !== "all_public"
      ? "Link and passcode. They see every photo."
      : fullAccessRedundant
        ? "Not needed: every photo is already public."
        : "Lets them download full-resolution files.";

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-4">
      {shareUrl ? (
        // Keyed so an edited message is dropped when the link or language changes.
        <Audiences
          key={`${shareUrl}|${lang}`}
          eventName={eventName}
          shareUrl={shareUrl}
          defaultMessage={message}
          lang={lang}
          onLangChange={setLang}
          guestLine={guestLine(access, hasPublicPhotos)}
          afterCards={<SignupQuestionRow />}
          guestTip={access.tooltip}
          family={
            <FamilyCard
              passcode={passcode}
              onRegenerate={onRegenerate}
              line={familyLine}
              eventName={eventName}
              shareUrl={shareUrl}
              lang={lang}
            />
          }
        />
      ) : (
        <div className="flex items-start gap-2.5 rounded-lg border border-[var(--color-brand-border)] bg-white px-3.5 py-3 text-[13px] text-[var(--color-brand-muted)]">
          <IconInfo size={15} className="mt-px shrink-0" />
          <span>The gallery link appears here once the event is set up. Try reopening this event.</span>
        </div>
      )}
      <QrRow {...qr} eventName={eventName} />
    </div>
  );
}

/**
 * The question Guests answer when they first sign in ("Which team are you
 * in?"), as one row on the Share view. It is set best before the link goes
 * out, so it sits beside the link. Guests who joined before teams were added
 * are asked on their next visit (see intakeNeeds), so changing it later works.
 */
function SignupQuestionRow() {
  const { meta } = useEvent();
  const saved = meta.guestTypes ?? [];
  const [editing, setEditing] = useState(false);
  const editorId = useId();

  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-brand-ink)]">
          Sign-up question
          <Tip text="After signing in, guests pick their team, and Smart Selects can be filtered by it. With no teams, guests skip the question." />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-brand-body)]">
          {saved.length > 0 ? (
            <>
              &ldquo;Which team are you in?&rdquo; <span className="text-[var(--color-brand-muted)]">· {saved.join(" · ")}</span>
            </>
          ) : (
            <span className="text-[var(--color-brand-muted)]">None. Guests go straight to their photos.</span>
          )}
        </span>
        <button
          type="button"
          aria-expanded={editing}
          aria-controls={editorId}
          onClick={() => setEditing((v) => !v)}
          className="brand-focus h-9 rounded text-[12.5px] font-semibold text-[var(--color-brand-navy)] hover:underline"
        >
          {editing ? "Done" : saved.length > 0 ? "Edit teams" : "Add teams"}
        </button>
      </div>
      {editing && (
        <div id={editorId} className="border-t border-[#ECE5D8] px-4 py-3">
          <GuestTeamsEditor key={JSON.stringify(saved)} saved={saved} eventType={meta.type} />
        </div>
      )}
    </section>
  );
}

function CardHeading({ icon, title, tip, line }: { icon: React.ReactNode; title: string; tip: string; line: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className="flex items-center gap-1.5 text-[15.5px] font-bold tracking-tight text-[var(--color-brand-ink)]">
          {title}
          <Tip text={tip} />
        </h3>
        <p className="mt-0.5 text-[13px] text-[var(--color-brand-body)]">{line}</p>
      </div>
    </div>
  );
}

/** The two audience cards, then the guest message they can edit. One component
 *  because the guest card sends the edited message. */
function Audiences({
  eventName,
  shareUrl,
  defaultMessage,
  lang,
  onLangChange,
  guestLine,
  guestTip,
  family,
  afterCards,
}: {
  eventName: string;
  shareUrl: string;
  defaultMessage: string;
  lang: ShareLang;
  onLangChange: (lang: ShareLang) => void;
  guestLine: string;
  guestTip: string;
  family: React.ReactNode;
  /** Between the two cards and the message row: the sign-up question. */
  afterCards?: React.ReactNode;
}) {
  const [text, setText] = useState(defaultMessage);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const langId = useId();
  const messageId = useId();

  const openWhatsApp = () => {
    trackEvent("invite_shared", { channel: "whatsapp", language: lang });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  const openEmail = () => {
    trackEvent("invite_shared", { channel: "email", language: lang });
    const subject = `Your photos from ${eventName} are ready`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  };
  const copy = () => {
    void navigator.clipboard?.writeText(text);
    trackEvent("invite_shared", { channel: "copy", language: lang });
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
        <section className={`${CARD} flex flex-col gap-4 p-4`}>
          <CardHeading icon={<IconUsers size={17} />} title="For guests" tip={guestTip} line={guestLine} />
          <UrlField url={shareUrl} />
          <div className="mt-auto flex flex-col gap-2">
            <button type="button" onClick={openWhatsApp} className={BTN_WHATSAPP}>
              <IconWhatsApp size={16} />
              Send to guests
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={openEmail} className={BTN}>
                <IconMail size={15} />
                Email
              </button>
              <button type="button" onClick={copy} className={BTN}>
                {copied ? <IconCheck size={15} className="text-[var(--color-brand-success)]" /> : <IconCopy size={15} />}
                {copied ? "Copied" : "Copy message"}
              </button>
            </div>
          </div>
        </section>
        {family}
      </div>

      {afterCards}

      <section className={CARD}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <label htmlFor={langId} className="text-[13px] font-semibold text-[var(--color-brand-ink)]">
            Message language
          </label>
          <span className="relative">
            <select
              id={langId}
              value={lang}
              onChange={(e) => onLangChange(e.target.value as ShareLang)}
              className="brand-focus h-9 cursor-pointer appearance-none rounded-lg border border-[var(--color-brand-border)] bg-white pl-2.5 pr-8 text-[12.5px] text-[var(--color-brand-ink)]"
            >
              {SHARE_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[var(--color-brand-muted)]">
              <IconCaretDown size={12} />
            </span>
          </span>
          <button
            type="button"
            aria-expanded={editing}
            aria-controls={messageId}
            onClick={() => setEditing((v) => !v)}
            className="brand-focus ml-auto h-9 rounded text-[12.5px] font-semibold text-[var(--color-brand-navy)] hover:underline"
          >
            {editing ? "Done" : "Edit guest message"}
          </button>
        </div>
        <div id={messageId} hidden={!editing} className="border-t border-[#ECE5D8] px-4 py-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            aria-label="Message to guests"
            className="brand-focus block w-full resize-none rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 py-2.5 font-[inherit] text-[13px] leading-relaxed text-[var(--color-brand-ink)] outline-none"
          />
          <button
            type="button"
            onClick={() => setText(defaultMessage)}
            className="brand-focus mt-2 rounded text-[12px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
          >
            Reset to default
          </button>
        </div>
      </section>
    </>
  );
}

function FamilyCard({
  passcode,
  onRegenerate,
  line,
  eventName,
  shareUrl,
  lang,
}: {
  passcode: string;
  onRegenerate: () => Promise<string>;
  line: string;
  eventName: string;
  /** The gallery link, put after the passcode in the WhatsApp message. */
  shareUrl: string;
  lang: ShareLang;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function regenerate() {
    setBusy(true);
    try {
      // The parent owns the passcode and re-renders this card with the new prop.
      await onRegenerate();
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${CARD} flex flex-col gap-4 p-4`}>
      <CardHeading
        icon={<IconLock size={17} />}
        title="For family"
        tip="Share this privately with the couple and close family. They enter the passcode in the gallery to unlock every photo in every folder."
        line={line}
      />

      <div className="flex items-stretch overflow-hidden rounded-lg border border-[var(--color-brand-border)] bg-white">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
          <IconLock size={14} className="shrink-0 text-[var(--color-brand-navy)]" />
          <span className="sr-only">Family passcode</span>
          <span className="font-mono text-[15px] font-bold tabular-nums tracking-[0.2em] text-[var(--color-brand-ink)]">
            {passcode || "······"}
          </span>
        </div>
        <button
          type="button"
          disabled={!passcode}
          onClick={() => {
            void navigator.clipboard?.writeText(passcode);
            trackEvent("passcode_shared", { channel: "copy" });
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="brand-focus inline-flex shrink-0 items-center gap-1.5 border-l border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3.5 text-[12.5px] font-semibold text-[var(--color-brand-ink)] disabled:opacity-50"
        >
          {copied ? <IconCheck size={15} className="text-[var(--color-brand-success)]" /> : <IconCopy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <button
          type="button"
          disabled={!passcode}
          onClick={() => {
            trackEvent("passcode_shared", { channel: "whatsapp", language: lang });
            window.open(
              `https://wa.me/?text=${encodeURIComponent(passcodeShareMessage({ passcode, eventName, url: shareUrl, lang }))}`,
              "_blank",
              "noopener",
            );
          }}
          className={BTN_WHATSAPP}
        >
          <IconWhatsApp size={16} />
          Send to family
        </button>

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="brand-focus inline-flex h-10 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
          >
            <IconRefresh size={13} /> Change passcode
          </button>
        ) : (
          <div className="rounded-lg border border-[#F0D9B5] bg-[var(--color-brand-warning-soft)] px-3 py-2.5 text-[12.5px] text-[var(--color-brand-warning)]">
            <p>Make a new passcode? {REGENERATE_PASSCODE_CONFIRM}</p>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={regenerate}
                className="brand-focus rounded-md bg-[var(--color-brand-navy)] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:opacity-60"
              >
                {busy ? "Working…" : "Confirm"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="brand-focus text-[12px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)] disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function UrlField({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border border-[var(--color-brand-border)] bg-white">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5">
        <IconLink size={14} className="shrink-0 text-[var(--color-brand-navy)]" />
        <span className="truncate font-mono text-[12.5px] text-[var(--color-brand-ink)]">{url}</span>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(url);
          trackEvent("gallery_link_copied", { location: "access_tab" });
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
