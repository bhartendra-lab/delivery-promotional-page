"use client";

import {
  CONTENT_TYPES,
  PROVIDERS,
  type DeliveryUrl,
  type Provider,
} from "@/lib/types";

type Props = {
  value: DeliveryUrl[];
  onChange: (urls: DeliveryUrl[]) => void;
};

const EMPTY: DeliveryUrl = {
  content_type: "Images",
  url: "",
  provider: "Kwikpic",
};

const PROVIDER_INITIAL: Record<Provider, string> = {
  Kwikpic: "K",
  "Google Drive": "G",
  WeTransfer: "W",
  Samaro: "S",
  Other: "•",
};

export function DeliveryUrlsField({ value, onChange }: Props) {
  function update(index: number, patch: Partial<DeliveryUrl>) {
    const next = value.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange(next);
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...value, { ...EMPTY }]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
            Delivery links
          </span>
          <p className="text-xs text-[var(--color-brand-muted)]/80">
            One row per gallery — these appear on the client&apos;s page.
          </p>
        </div>
        <button
          type="button"
          onClick={add}
          className="brand-focus inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-brand-navy)] bg-white px-3 text-xs font-semibold text-[var(--color-brand-navy)] hover:bg-[var(--color-brand-navy-soft)]"
        >
          <PlusIcon />
          Add link
        </button>
      </div>

      {value.length === 0 && (
        <p className="rounded-xl border border-dashed border-[var(--color-brand-outline)] bg-white px-4 py-5 text-center text-sm text-[var(--color-brand-muted)]">
          No delivery links yet — add your first gallery above.
        </p>
      )}

      <div className="space-y-3">
        {value.map((row, i) => (
          <div
            key={i}
            className="relative rounded-2xl border border-[var(--color-brand-border)] bg-white p-4 transition-colors hover:border-[var(--color-brand-outline)]"
          >
            <div className="mb-3 flex items-center gap-2">
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-brand-navy-soft)] text-xs font-bold text-[var(--color-brand-navy)]"
              >
                {PROVIDER_INITIAL[row.provider]}
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
                Link #{i + 1}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="ml-auto inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-[var(--color-brand-danger)] hover:bg-[var(--color-brand-danger-soft)]"
                aria-label="Remove link"
              >
                <TrashIcon />
                Remove
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FieldSelect
                label="Provider"
                value={row.provider}
                onChange={(v) =>
                  update(i, { provider: v as DeliveryUrl["provider"] })
                }
                options={PROVIDERS}
              />
              <FieldSelect
                label="Content type"
                value={row.content_type}
                onChange={(v) =>
                  update(i, {
                    content_type: v as DeliveryUrl["content_type"],
                  })
                }
                options={CONTENT_TYPES}
              />
            </div>

            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
                URL
              </span>
              <input
                type="url"
                value={row.url}
                onChange={(e) => update(i, { url: e.target.value })}
                placeholder="https://…"
                className="brand-focus h-11 w-full rounded-xl border border-[var(--color-brand-border)] bg-white px-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/70"
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly T[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
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

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
