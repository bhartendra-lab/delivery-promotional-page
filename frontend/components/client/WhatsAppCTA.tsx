"use client";

import type { EventTemplate } from "@/lib/event-templates";
import type { KvData } from "@/lib/types";

type Props = {
  data: KvData;
  template: EventTemplate;
  variant?: "section" | "inline";
};

const WHATSAPP_GREEN = "#25D366";
const WHATSAPP_GREEN_DARK = "#128C7E";

function digitsOnly(input: string): string {
  return input.replace(/[^\d]/g, "");
}

export function WhatsAppCTA({ data, template, variant = "section" }: Props) {
  const number = data.company_contact_number
    ? digitsOnly(data.company_contact_number)
    : null;
  if (!number) return null;
  const studioName = data.company_name ?? "the studio";

  if (variant === "inline") {
    return (
      <a
        href={`https://wa.me/${number}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold text-white shadow-md"
        style={{ background: WHATSAPP_GREEN }}
      >
        <WhatsAppIcon className="h-5 w-5" />
        Chat on WhatsApp
      </a>
    );
  }

  return (
    <section className="relative px-6 py-16 sm:py-20">
      <div
        className="relative mx-auto max-w-2xl overflow-hidden rounded-3xl p-8 sm:p-10"
        style={{
          background: `linear-gradient(135deg, ${WHATSAPP_GREEN} 0%, ${WHATSAPP_GREEN_DARK} 100%)`,
        }}
      >
        {/* Decorative pattern */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-white/5"
        />

        <div className="relative flex flex-col items-center gap-5 text-center text-white sm:flex-row sm:items-center sm:gap-6 sm:text-left">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <WhatsAppIcon className="h-9 w-9" />
          </div>

          <div className="flex-1">
            <p className="text-xs uppercase tracking-[0.25em] text-white/85">
              Need anything?
            </p>
            <h3
              className="mt-1 text-2xl font-semibold leading-tight sm:text-3xl"
              style={{ fontFamily: template.headingFont }}
            >
              Chat with {studioName} on WhatsApp
            </h3>
            <p className="mt-2 text-sm text-white/90">
              Re-prints, raw files, queries — we&apos;re a message away.
            </p>
          </div>

          <a
            href={`https://wa.me/${number}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold transition-transform hover:-translate-y-0.5"
            style={{ color: WHATSAPP_GREEN_DARK }}
          >
            Open chat
            <span aria-hidden>→</span>
          </a>
        </div>
      </div>
    </section>
  );
}

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.73.45 3.41 1.32 4.9L2 22l5.31-1.39a9.86 9.86 0 0 0 4.73 1.2h.01c5.46 0 9.91-4.45 9.91-9.9 0-2.65-1.03-5.14-2.9-7.01A9.84 9.84 0 0 0 12.04 2zm0 18.07h-.01a8.24 8.24 0 0 1-4.2-1.15l-.3-.18-3.13.82.84-3.05-.2-.31a8.18 8.18 0 0 1-1.25-4.36c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.42 5.83c0 4.54-3.7 8.21-8.25 8.21zm4.52-6.16c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.56.12-.17.25-.64.8-.79.97-.15.17-.29.18-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.77-1.83-.2-.48-.4-.42-.56-.42h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.08 0 1.22.89 2.4 1.02 2.57.12.17 1.75 2.67 4.24 3.75.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.46-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.23-.17-.48-.29z" />
    </svg>
  );
}
