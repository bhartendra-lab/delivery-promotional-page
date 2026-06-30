"use client";

/**
 * Soft, slowly-drifting colour blobs that sit behind a full-screen step to give
 * the guest flow a premium, alive feel. Purely decorative and additive: render
 * it as the first child of a `relative isolate` container — it pins to
 * `inset-0` at `-z-10`, above the container's own background but below content,
 * so no layout or structure changes are needed. Drift halts under
 * `prefers-reduced-motion` (handled globally).
 */
export function AmbientBackdrop({ a, b }: { a: string; b: string }) {
  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
      <div
        className="fx-aurora-1 absolute h-[60vh] w-[60vh] rounded-full"
        style={{ left: "-18%", top: "-12%", background: a, filter: "blur(100px)", opacity: 0.42 }}
      />
      <div
        className="fx-aurora-2 absolute h-[65vh] w-[65vh] rounded-full"
        style={{ right: "-15%", bottom: "-15%", background: b, filter: "blur(110px)", opacity: 0.32 }}
      />
    </div>
  );
}
