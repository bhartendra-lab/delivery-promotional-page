export default function ClientGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Chrome's translate feature re-parents text nodes into injected <font>
  // wrappers, which desynchronises them from the nodes React holds references
  // to; the next structural commit then throws NotFoundError and tears down the
  // whole root (see GOOGLE_TRANSLATE_OTP_CRASH_ANALYSIS.md). Until the guest UI
  // ships real Hindi copy, opt this subtree out of browser translation. The
  // `notranslate` class is the legacy form of the same signal; keep both.
  return (
    <div className="notranslate flex min-h-screen flex-col" translate="no">
      {children}
    </div>
  );
}
