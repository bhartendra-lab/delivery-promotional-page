"use client";

import { useEffect } from "react";

/**
 * Guest-facing error boundary for the whole `(client)` group. Copy is deliberately
 * distinct from `EventExperience`'s `LoadError` ("We couldn't load this gallery"),
 * which covers a failed *initial fetch* — telling the two apart in a support
 * screenshot matters.
 *
 * Next 16: the recovery prop is `unstable_retry`, not `reset`.
 */
export default function ClientError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[guest-error]", error.digest, error);
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#FAFAF8] px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/vyavasth-icon.svg" alt="Vyavasth" className="mb-1 h-11 w-11 opacity-90" />
      <h1 className="text-[20px] font-extrabold tracking-tight text-[#2A2218]">
        This gallery hit a snag
      </h1>
      <p className="max-w-[340px] text-[14px] leading-relaxed text-[#7A6F63]">
        Sorry about that. Try again — and if it keeps happening, reloading the page
        usually clears it.
      </p>
      {/*
        `unstable_retry()` re-renders the boundary's children into the *same*
        existing DOM — right for a transient fetch failure, useless when the DOM
        itself is corrupted (browser translation, extensions). Offer both rather
        than a retry that silently re-crashes.
      */}
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="mt-1 inline-flex h-11 items-center rounded-full bg-[#C25A3A] px-6 text-[14px] font-bold text-white hover:bg-[#A8442A]"
      >
        Try again
      </button>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="text-[12.5px] font-bold text-[#7A6F63] underline underline-offset-2"
      >
        Reload the page
      </button>
    </div>
  );
}
