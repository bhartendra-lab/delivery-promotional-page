// instrumentation-client.ts — runs after the document loads but before React
// hydration. Diagnostics for the browser-translation DOM crash: see
// GOOGLE_TRANSLATE_OTP_CRASH_ANALYSIS.md at the repo root.

function translateState() {
  try {
    return {
      htmlClass: document.documentElement.className,
      // Chrome's translate injects <font style="vertical-align: inherit"> wrappers.
      fontNodes: document.querySelectorAll("font").length,
      lang: document.documentElement.lang,
      navLangs: navigator.languages?.join(","),
      path: location.pathname,
    };
  } catch {
    return null;
  }
}

try {
  window.addEventListener("error", (event) => {
    try {
      const isDomOwnershipError =
        (event.error as Error | undefined)?.name === "NotFoundError" ||
        /insertBefore|removeChild/.test(event.message ?? "");
      if (isDomOwnershipError) {
        console.error("[translate-crash]", event.message, translateState());
        // TODO(observability): POST to the logging endpoint instead of console
        // once one exists, so guest-side occurrences are actually visible.
      }
    } catch {
      /* never let diagnostics throw */
    }
  });
} catch {
  /* no-op */
}
