"use client";

import { useEffect, useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { DeliveryUrlsField } from "./DeliveryUrlsField";
import {
  buildShareUrl,
  fromDateInputValue,
  toDateInputValue,
} from "./shared";
import {
  EVENT_TYPES,
  type DeliveryLandingPage,
  type DeliveryUrl,
  type EventType,
} from "@/lib/types";
import { createDeliveryPage, updateDeliveryPage } from "@/lib/api";

type Props = {
  open: boolean;
  target: DeliveryLandingPage | null;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  client_name: string;
  event_type: EventType;
  event_date: string;
  custom_message: string;
  delivery_urls: DeliveryUrl[];
  background_image: File | null;
};

function blankState(target: DeliveryLandingPage | null): FormState {
  return {
    client_name: target?.client_name ?? "",
    event_type: target?.event_type ?? "Wedding",
    event_date: toDateInputValue(target?.event_date),
    custom_message: target?.custom_message ?? "",
    delivery_urls: target?.delivery_urls ?? [],
    background_image: null,
  };
}

export function CreateEditDrawer({ open, target, onClose, onSaved }: Props) {
  const [state, setState] = useState<FormState>(() => blankState(target));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setState(blankState(target));
      setError(null);
    }
  }, [open, target]);

  const isEdit = !!target;
  const shareUrl = target ? buildShareUrl(target._id) : null;

  async function copyShare() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        client_name: state.client_name,
        event_type: state.event_type,
        event_date: fromDateInputValue(state.event_date),
        custom_message: state.custom_message,
        delivery_urls: state.delivery_urls,
        background_image: state.background_image,
      };
      if (isEdit && target) {
        await updateDeliveryPage(target._id, payload);
      } else {
        await createDeliveryPage(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit delivery page" : "Create delivery page"}
      subtitle={
        isEdit
          ? "Update your client's branded delivery link."
          : "Set up a new branded delivery link for your client."
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="hidden text-xs text-[var(--color-brand-muted)] sm:block">
            {isEdit ? "Edits go live instantly." : "You can edit anything later."}
          </p>
          <div className="flex w-full justify-end gap-2 sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="brand-focus h-11 rounded-xl border border-[var(--color-brand-border)] bg-white px-4 text-sm font-medium text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-navy-soft)]/50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="delivery-form"
              disabled={submitting}
              className="brand-focus group inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--color-brand-navy)] px-5 text-sm font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Spinner />
                  Saving…
                </>
              ) : (
                <>
                  {isEdit ? "Save changes" : "Create page"}
                  <span aria-hidden>→</span>
                </>
              )}
            </button>
          </div>
        </div>
      }
    >
      <form id="delivery-form" onSubmit={handleSubmit} className="space-y-6">
        {/* Share URL banner (edit only) */}
        {isEdit && shareUrl && (
          <div className="rounded-2xl border border-[var(--color-brand-gold)]/40 bg-[var(--color-brand-gold-soft)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-gold-deep)]">
                  Share with your client
                </p>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block truncate text-sm font-medium text-[var(--color-brand-navy)] hover:underline"
                >
                  {shareUrl}
                </a>
              </div>
              <button
                type="button"
                onClick={copyShare}
                className="brand-focus inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-[var(--color-brand-navy)] hover:bg-[var(--color-brand-navy-soft)]"
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {/* Section: Basics */}
        <SectionTitle index={1} title="The basics" />
        <Field
          label="Client name"
          required
          value={state.client_name}
          onChange={(v) => setState((s) => ({ ...s, client_name: v }))}
          placeholder="e.g. Rohan &amp; Aanya"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="Event type"
            value={state.event_type}
            onChange={(v) =>
              setState((s) => ({ ...s, event_type: v as EventType }))
            }
            options={EVENT_TYPES}
          />
          <Field
            label="Event date"
            type="date"
            value={state.event_date}
            onChange={(v) => setState((s) => ({ ...s, event_date: v }))}
          />
        </div>

        <Field
          label="Custom message"
          textarea
          rows={3}
          placeholder="A note to the couple / client (optional)"
          value={state.custom_message}
          onChange={(v) => setState((s) => ({ ...s, custom_message: v }))}
        />

        {/* Section: Visual */}
        <SectionTitle index={2} title="Visual" />
        <ImageUpload
          existingUrl={target?.background_image ?? null}
          file={state.background_image}
          onChange={(file) =>
            setState((s) => ({ ...s, background_image: file }))
          }
        />

        {/* Section: Delivery */}
        <SectionTitle index={3} title="Galleries" />
        <DeliveryUrlsField
          value={state.delivery_urls}
          onChange={(urls) =>
            setState((s) => ({ ...s, delivery_urls: urls }))
          }
        />

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-3 py-2.5 text-sm text-[var(--color-brand-danger)]"
          >
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </form>
    </Drawer>
  );
}

function SectionTitle({ index, title }: { index: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] text-[11px] font-bold text-white">
        {index}
      </span>
      <h3
        className="text-lg font-semibold text-[var(--color-brand-ink)]"
        style={{ fontFamily: "var(--font-cormorant)" }}
      >
        {title}
      </h3>
      <span className="h-px flex-1 bg-[var(--color-brand-border)]" />
    </div>
  );
}

function Field({
  label,
  type = "text",
  required,
  textarea,
  rows,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type?: string;
  required?: boolean;
  textarea?: boolean;
  rows?: number;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
        {label}
        {required && <span className="ml-1 text-[var(--color-brand-gold)]">*</span>}
      </span>
      {textarea ? (
        <textarea
          rows={rows}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="brand-focus w-full rounded-xl border border-[var(--color-brand-border)] bg-white px-3 py-2.5 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/70"
        />
      ) : (
        <input
          type={type}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="brand-focus h-11 w-full rounded-xl border border-[var(--color-brand-border)] bg-white px-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/70"
        />
      )}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="brand-focus h-11 w-full appearance-none rounded-xl border border-[var(--color-brand-border)] bg-white px-3 pr-9 text-sm text-[var(--color-brand-ink)] outline-none"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[var(--color-brand-muted)]">
          <ChevronDown />
        </span>
      </div>
    </label>
  );
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 8v5M12 16.5v.01"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2.5"
      />
      <path
        d="M21 12a9 9 0 00-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
