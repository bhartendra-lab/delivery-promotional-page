"use client";

import type { EventTemplate } from "@/lib/event-templates";
import type { KvData } from "@/lib/types";

type Props = {
  data: KvData;
  template: EventTemplate;
};

export function StudioFooter({ data, template }: Props) {
  const year = new Date().getFullYear();
  return (
    <footer
      className="relative border-t border-current/10 px-6 py-14 sm:py-20"
      style={{ color: template.inkColor }}
    >
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        {data.company_logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.company_logo}
            alt={data.company_name ?? "Studio"}
            className="h-16 w-auto object-contain"
          />
        ) : (
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-semibold"
            style={{
              background: template.accentColor,
              color: "white",
            }}
          >
            {(data.company_name ?? "Studio").charAt(0)}
          </div>
        )}

        {data.company_name && (
          <p
            className="text-xs font-semibold uppercase tracking-[0.4em]"
            style={{ color: template.accentColor }}
          >
            {data.company_name}
          </p>
        )}

        <div className="flex flex-col gap-1 text-sm opacity-80">
          {data.company_address && <p>{data.company_address}</p>}
          {data.company_contact_number && (
            <p>
              <a
                href={`tel:${data.company_contact_number}`}
                className="hover:underline"
              >
                {data.company_contact_number}
              </a>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-2 text-sm">
          {data.company_website && (
            <FooterLink href={data.company_website} accent={template.accentColor}>
              Website
            </FooterLink>
          )}
          {data.company_instagram_link && (
            <FooterLink
              href={data.company_instagram_link}
              accent={template.accentColor}
            >
              <InstagramIcon className="h-4 w-4" /> Instagram
            </FooterLink>
          )}
          {data.company_facebook_link && (
            <FooterLink
              href={data.company_facebook_link}
              accent={template.accentColor}
            >
              <FacebookIcon className="h-4 w-4" /> Facebook
            </FooterLink>
          )}
        </div>

        <p className="pt-6 text-xs opacity-50">
          © {year} {data.company_name ?? "Studio"} · Made with care
        </p>
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  accent,
  children,
}: {
  href: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 underline-offset-4 transition-colors hover:underline"
      style={{ color: accent }}
    >
      {children}
    </a>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17" cy="7" r="1" fill="currentColor" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M13.5 21v-7h2.4l.4-3.2H13.5V8.7c0-.9.3-1.6 1.6-1.6h1.7V4.2c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1v2.6H8v3.2h2.4V21h3.1z" />
    </svg>
  );
}
