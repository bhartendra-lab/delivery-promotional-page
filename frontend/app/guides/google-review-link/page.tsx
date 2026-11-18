import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How to get your Google review link | Vyavasth",
  description:
    "Copy the link that opens your Google review box directly, and paste it into Vyavasth so guests can review your studio in one tap.",
};

/**
 * Add a file name here (placed in /public/guides/google-review-link/) once a
 * screen recording or screenshot exists for that step. A step without media
 * shows text only, so the page is complete and correct before the visuals land.
 */
const STEP_MEDIA: Record<number, { src: string; alt: string } | undefined> = {};

const STEPS: { title: string; body: string }[] = [
  {
    title: "Open your Google Business Profile",
    body: "On your phone or computer, sign in to the Google account that manages your studio. Search for your studio name on Google. Your Business Profile appears at the top with the buttons to manage it.",
  },
  {
    title: "Tap Ask for reviews",
    body: "In the buttons under your studio name, tap Ask for reviews. On some accounts this reads Get more reviews or Share review form.",
  },
  {
    title: "Copy the link",
    body: "Google shows a short link that starts with g.page/r/ and ends with /review. Tap Copy link.",
  },
  {
    title: "Paste it into Vyavasth",
    body: "Go to Settings, then Studio Identity, then Google Business integration. Paste the link into Or paste your review link, and save. Use Test this link to check that it opens your review box.",
  },
];

export default function GoogleReviewLinkGuide() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 text-[var(--color-brand-ink)] sm:py-14">
      <h1 className="text-2xl font-semibold tracking-[-0.01em] sm:text-[30px]">
        How to get your Google review link
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-brand-muted)]">
        This is the link that opens your Google review box directly. Guests who open your gallery tap one button and land
        on it, so there is nothing to search for. It takes about a minute.
      </p>

      <ol className="mt-8 space-y-6">
        {STEPS.map((step, i) => {
          const media = STEP_MEDIA[i + 1];
          return (
            <li
              key={step.title}
              className="rounded-card border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] p-5 sm:p-6"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-navy)] text-[13px] font-semibold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h2 className="text-[16px] font-semibold">{step.title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-brand-muted)]">{step.body}</p>
                </div>
              </div>
              {media && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={media.src}
                  alt={media.alt}
                  loading="lazy"
                  className="mt-4 w-full rounded-field border border-[var(--color-brand-border)]"
                />
              )}
            </li>
          );
        })}
      </ol>

      <section className="mt-10 space-y-4 text-sm leading-relaxed">
        <h2 className="text-[16px] font-semibold">If something looks different</h2>
        <p className="text-[var(--color-brand-muted)]">
          <strong className="font-semibold text-[var(--color-brand-ink)]">The link opens your listing, not the review box.</strong>{" "}
          You copied the Maps or profile link. Go back and use Ask for reviews, as in step 2.
        </p>
        <p className="text-[var(--color-brand-muted)]">
          <strong className="font-semibold text-[var(--color-brand-ink)]">You do not see Ask for reviews.</strong>{" "}
          You are probably signed in to a different Google account, or your profile is not claimed yet. Claim it for free
          at business.google.com, then follow the steps again.
        </p>
        <p className="text-[var(--color-brand-muted)]">
          <strong className="font-semibold text-[var(--color-brand-ink)]">You still cannot get the link.</strong>{" "}
          Message us on WhatsApp and we will set it up with you.
        </p>
      </section>
    </main>
  );
}
