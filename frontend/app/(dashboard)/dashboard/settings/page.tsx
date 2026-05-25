"use client";

import { useEffect, useRef, useState } from "react";
import { getCompanyDetails, updateCompanyDetails } from "@/lib/api";
import { setCompany } from "@/lib/auth";
import { ImageUpload } from "@/components/ui/ImageUpload";
import type { Company } from "@/lib/types";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function SettingsPage() {
  const [company, setCompanyData] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    getCompanyDetails()
      .then((res) => setCompanyData(res.company))
      .catch((err) => setFetchError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (fetchError) return <FetchError message={fetchError} />;
  if (!company) return null;

  return (
    <div className="space-y-8 dash-rise">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <a
            href="/dashboard"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to dashboard
          </a>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-muted)]">
            Settings
          </p>
          <h1 className="mt-1.5 text-3xl font-bold text-[var(--color-brand-ink)]">
            Studio settings
          </h1>
          <p className="mt-1 text-sm text-[var(--color-brand-muted)]">
            Update your studio information. Changes apply to all delivery pages.
          </p>
        </div>
      </div>

      <CompanyForm
        initial={company}
        onSaved={(updated) => {
          setCompany(updated);
          setCompanyData(updated);
        }}
      />
    </div>
  );
}

function CompanyForm({ initial, onSaved }: { initial: Company; onSaved: (c: Company) => void }) {
  const [name, setName] = useState(initial.name ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [contactNumber, setContactNumber] = useState(initial.contact_number ?? "");
  const [website, setWebsite] = useState(initial.website ?? "");
  const [gmbLink, setGmbLink] = useState(initial.gmb_link ?? "");
  const [instagramLink, setInstagramLink] = useState(initial.instagram_link ?? "");
  const [facebookLink, setFacebookLink] = useState(initial.facebook_link ?? "");
  const [googlePlaceId, setGooglePlaceId] = useState(initial.google_place_id ?? "");
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaveState("saving");
    setErrorMsg(null);
    try {
      const res = await updateCompanyDetails({
        name: name.trim(),
        address: address.trim(),
        contact_number: contactNumber.trim(),
        website: website.trim(),
        gmb_link: gmbLink.trim(),
        instagram_link: instagramLink.trim(),
        facebook_link: facebookLink.trim(),
        google_place_id: googlePlaceId.trim(),
        logo: logoFile,
      });
      onSaved(res.company);
      setLogoFile(null);
      setSaveState("saved");
      savedTimerRef.current = setTimeout(() => setSaveState("idle"), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save");
      setSaveState("error");
    }
  }

  useEffect(() => () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current); }, []);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Card title="Studio identity" icon={<BuildingIcon />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Studio name" value={name} onChange={setName} required placeholder="e.g. Radiant Studios" className="sm:col-span-2" />
          <Field label="Address" value={address} onChange={setAddress} placeholder="123 Main St, City" className="sm:col-span-2" />
          <Field label="Contact number" value={contactNumber} onChange={setContactNumber} placeholder="+91 98765 43210" type="tel" />
          <Field label="Website" value={website} onChange={setWebsite} placeholder="https://yourstudio.com" type="url" />
        </div>
      </Card>

      <Card title="Online presence" icon={<GlobeIcon />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Google My Business link" value={gmbLink} onChange={setGmbLink} placeholder="https://g.page/your-studio" type="url" />
          <Field label="Google Place ID" value={googlePlaceId} onChange={setGooglePlaceId} placeholder="ChIJ..." />
          <Field label="Instagram" value={instagramLink} onChange={setInstagramLink} placeholder="https://instagram.com/yourstudio" type="url" />
          <Field label="Facebook" value={facebookLink} onChange={setFacebookLink} placeholder="https://facebook.com/yourstudio" type="url" />
        </div>
      </Card>

      <Card title="Studio logo" icon={<ImageIcon />}>
        <ImageUpload
          label="Logo"
          existingUrl={initial.logo ?? null}
          file={logoFile}
          onChange={setLogoFile}
        />
        <p className="mt-2 text-xs text-[var(--color-brand-muted)]">
          Used on all delivery pages. PNG, JPG or WEBP — max 5 MB.
        </p>
      </Card>

      {/* Save bar */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-5 py-4">
        {saveState === "error" && errorMsg ? (
          <p className="flex items-center gap-2 text-sm text-[var(--color-brand-danger)]">
            <AlertIcon className="h-4 w-4 shrink-0" />
            {errorMsg}
          </p>
        ) : saveState === "saved" ? (
          <p className="flex items-center gap-2 text-sm text-[var(--color-brand-success)]">
            <CheckIcon className="h-4 w-4 shrink-0" />
            Changes saved
          </p>
        ) : (
          <p className="text-sm text-[var(--color-brand-muted)]">
            Changes apply to all delivery pages immediately.
          </p>
        )}

        <button
          type="submit"
          disabled={saveState === "saving" || !name.trim()}
          className="brand-focus inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saveState === "saving" ? (
            <><Spinner />Saving…</>
          ) : (
            <><SaveIcon className="h-4 w-4" />Save changes</>
          )}
        </button>
      </div>
    </form>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] p-5 shadow-[0_1px_3px_rgba(42,34,24,0.08)]">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
          {icon}
        </span>
        <h2 className="text-sm font-semibold text-[var(--color-brand-ink)]">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, required, type = "text", className = "" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; type?: string; className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
        {label}
        {required && <span className="ml-1 text-[var(--color-brand-danger)]">*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="brand-focus h-10 w-full rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] px-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/60 focus:border-[var(--color-brand-outline)]"
      />
    </label>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="skeleton h-3 w-12 rounded" />
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="skeleton h-4 w-72 rounded" />
      </div>
      {[1, 2, 3].map((i) => <div key={i} className="skeleton h-44 rounded-xl" />)}
    </div>
  );
}

function FetchError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] p-4 text-sm text-[var(--color-brand-danger)]">
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function BuildingIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 9h18M9 21V9M15 21V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SaveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M17 21v-8H7v8M7 3v5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8v5M12 16.5v.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
