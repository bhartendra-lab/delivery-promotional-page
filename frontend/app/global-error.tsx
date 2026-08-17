"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Root-level fallback. `error.tsx` does not wrap the root layout, so a failure
 * there would otherwise reach Next's raw production fallback.
 *
 * Next 16: this file *replaces* the root layout when active, so it owns <html>
 * and <body> and must import global styles itself. `metadata` is not supported
 * in a Client Component — use React's <title>. The root layout's seven
 * `next/font/google` families are not loaded here, so this markup must not
 * depend on `--font-plus-jakarta` and friends.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error.digest, error);
  }, [error]);

  return (
    // global-error replaces the root layout, so it owns <html> and <body>.
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAFAF8] px-6 text-center">
        <title>Something went wrong · Vyavasth</title>
        <h1 className="text-[20px] font-extrabold tracking-tight text-[#2A2218]">
          Something went wrong
        </h1>
        <p className="max-w-[340px] text-[14px] leading-relaxed text-[#7A6F63]">
          Please reload the page and try again.
        </p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="mt-1 inline-flex h-11 items-center rounded-full bg-[#C25A3A] px-6 text-[14px] font-bold text-white"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
