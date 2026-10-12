"use client";

import { useId } from "react";
import type { ClientTheme } from "@/lib/client-theme";
import { closesInLabel, formatValidityDate, type ValidityLinkView } from "@/lib/event-validity";
import { keepsakeReviewUrl, moreTimeMessage, referralMessage, studioNameOr, studioWhatsAppUrl } from "@/lib/memory-lane";
import type { SocialLinks } from "@/lib/types";
import { SocialRow, ensureHttp } from "@/components/event/screens/lounge/StudioCard";
import { useInViewOnce } from "../motion";
import styles from "./lane.module.css";

/** "lumen.example" from whatever the Studio typed as its website. */
function siteLabel(url: string): string {
  return url
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
}

/**
 * The note at the end of a KEEPSAKE: a storage plan event's memory lane.
 *
 * It stands where the renewal's question stands (ValidityQuestion), on the
 * same sheet of paper and with the music turned down the same way, but it
 * asks for no money. The walk was a gift from the Studio; this is the Studio
 * asking two small things back, and it is written to be easy to say no to:
 *
 *   1. When the gallery is closing (the event was archived, or its expiry is
 *      set), that comes first and plainly: the date, that the photos are
 *      deleted after it, the way to save them, and who to ask for more time.
 *      A gallery with no end in sight says only that the photos are still
 *      there.
 *   2. A Google review, when the Studio has a listing and has not switched
 *      review asks off. The gallery's own rule decides (keepsakeReviewUrl).
 *   3. A referral: one tap opens a WhatsApp chat with the Studio, with a line
 *      already typed. Nothing about the friend is collected here; the Client
 *      says what they want to say, to the Studio, themselves.
 *   4. The Studio's mark and where to find it.
 *
 * A Studio with no listing and no WhatsApp number gets a note with neither
 * ask: just the gallery line and its name. Nothing is shown empty.
 *
 * The paper wears the Vyavasth platform skin (`t`), like the renewal's note.
 * On paper the Studio's default (dark) logo is the right one.
 */
export function LaneStudioNote({ t, view }: { t: ClientTheme; view: ValidityLinkView }) {
  const [sectionRef, seen] = useInViewOnce<HTMLElement>({ threshold: 0.12 });
  const headingId = useId();

  const studio = view.studio ?? null;
  const named = Boolean(view.studio_name?.trim());
  const studioName = studioNameOr(view.studio_name);
  const endsAt = view.ends_at;

  const reviewUrl = keepsakeReviewUrl(studio);
  const referUrl = studioWhatsAppUrl(studio?.whatsapp_number, referralMessage(view.studio_name, view.event_name));
  const moreTimeUrl = studioWhatsAppUrl(studio?.whatsapp_number, moreTimeMessage(view.studio_name, view.event_name));
  const favours = [reviewUrl, referUrl].filter(Boolean).length;

  const logo = studio?.logo || studio?.logo_light || null;
  const website = studio?.website?.trim() || null;

  const galleryLink = view.gallery_url ? (
    <a href={view.gallery_url} className="font-bold underline underline-offset-2" style={{ color: t.text }}>
      Open the gallery
    </a>
  ) : null;

  return (
    <section id="keep" ref={sectionRef} className={styles.note} aria-labelledby={headingId}>
      <div
        className={`${styles.notePaper} ${styles.notePaperKeepsake} validity-reveal ${seen ? "is-in" : ""}`}
        style={{ background: t.bg, color: t.text }}
      >
        <div className="max-w-[620px]">
          {endsAt != null && (
            <p className={styles.noteChip} style={{ background: t.accentWash, color: t.brandDeep }}>
              {closesInLabel(endsAt)}
            </p>
          )}
          <h2 id={headingId} className={styles.noteTitle} style={{ color: t.text }}>
            Before you go, a small note.
          </h2>
          {endsAt != null ? (
            <>
              {/* The deletion, once, in plain words. Never again on this page. */}
              <p className={styles.noteBody} style={{ color: t.text }}>
                This gallery is open till <strong>{formatValidityDate(endsAt)}</strong>. After that it closes and its photos are deleted.
              </p>
              <p className={styles.noteBody} style={{ color: t.muted }}>
                {galleryLink ?? "Open the gallery"} and save the ones you love before then.
                {moreTimeUrl && (
                  <>
                    {" "}
                    If you need more time with them,{" "}
                    <a
                      href={moreTimeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold underline underline-offset-2"
                      style={{ color: t.text }}
                    >
                      ask {studioName}
                    </a>
                    .
                  </>
                )}
              </p>
            </>
          ) : (
            <p className={styles.noteBody} style={{ color: t.text }}>
              Every one of these photos is still in your gallery, whenever you want them.
              {galleryLink && <> {galleryLink}.</>}
            </p>
          )}
        </div>

        {favours > 0 && (
          <>
            <p className={styles.noteAsk} style={{ color: t.text }}>
              {favours > 1 ? "Two small favours" : "One small favour"}
              {named ? `, for ${studioName}` : ""}
            </p>
            <div className={styles.favours}>
              {reviewUrl && (
                <div className={styles.favour} style={{ background: t.card, borderColor: t.border }}>
                  <h3 className={styles.favourTitle} style={{ color: t.text }}>
                    A few kind words go a long way.
                  </h3>
                  <p className={styles.favourText} style={{ color: t.muted }}>
                    If these photos made you smile, a Google review is the best thank you {studioName} can get. It takes a minute.
                  </p>
                  <a
                    className={styles.favourBtn}
                    style={{ background: t.brand, color: t.onBrand }}
                    href={reviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Leave a Google review
                  </a>
                </div>
              )}
              {referUrl && (
                <div className={styles.favour} style={{ background: t.card, borderColor: t.border }}>
                  <h3 className={styles.favourTitle} style={{ color: t.text }}>
                    Know someone with a big day coming up?
                  </h3>
                  <p className={styles.favourText} style={{ color: t.muted }}>
                    If a friend or someone in the family is looking for a photographer, {studioName} would love to hear from you.
                  </p>
                  <a
                    className={`${styles.favourBtn} ${styles.favourBtnQuiet}`}
                    style={{ color: t.text, borderColor: t.text }}
                    href={referUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Message {studioName}
                  </a>
                </div>
              )}
            </div>
          </>
        )}

        {(logo || named || website) && (
          <footer className={styles.studioSign} style={{ borderColor: t.border }}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- the Studio's own logo, served as it is
              <img className={styles.studioSignLogo} src={logo} alt={studioName} draggable={false} />
            ) : (
              named && (
                <p className={styles.studioSignName} style={{ color: t.text }}>
                  {studioName}
                </p>
              )
            )}
            {named && (
              <p className={styles.studioSignLine} style={{ color: t.muted }}>
                Photographed by {studioName}
              </p>
            )}
            {website && (
              <a
                className={styles.studioSignSite}
                style={{ color: t.text }}
                href={ensureHttp(website)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {siteLabel(website)}
              </a>
            )}
            {studio && <SocialRow t={t} event={{ company_social_links: studio.social_links as SocialLinks }} align="center" />}
          </footer>
        )}
      </div>
    </section>
  );
}
