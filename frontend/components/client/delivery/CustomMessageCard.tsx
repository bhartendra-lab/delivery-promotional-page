"use client";

import type { KvData } from "@/lib/types";
import type { Tokens } from "./tokens";

type Props = {
  data: KvData;
  tokens: Tokens;
  /** Per-event eyebrow label, e.g. "A note from the couple". */
  label: string;
};

/**
 * Card with eyebrow + italic message body + signed name. Renders only when
 * `data.custom_message` is non-empty. Reference HTML lines 516–547.
 */
export function CustomMessageCard({ data, tokens, label }: Props) {
  if (!data.custom_message) return null;

  return (
    <section
      className="mx-6 mt-7 rounded-2xl px-6 py-7 sm:px-7"
      style={{
        background: tokens.bgCard,
        border: `1px solid ${tokens.borderHi}`,
      }}
    >
      <div
        className="mb-4 text-[10px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: tokens.accent }}
      >
        {label}
      </div>
      <p
        className="whitespace-pre-line italic"
        style={{
          color: tokens.text,
          fontSize: 15,
          fontWeight: 300,
          lineHeight: 1.75,
          letterSpacing: "-0.01em",
          marginBottom: 20,
        }}
      >
        {data.custom_message}
      </p>
      <div
        className="text-[13px] font-medium"
        style={{
          color: tokens.muted,
          letterSpacing: "-0.01em",
        }}
      >
        — {data.client_name}
      </div>
    </section>
  );
}
