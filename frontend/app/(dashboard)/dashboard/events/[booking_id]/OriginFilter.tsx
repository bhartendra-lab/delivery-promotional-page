"use client";

import { useEffect, useRef, useState } from "react";
import type { UploadOrigins } from "@/lib/api";
import { photoCountLabel, sessionSubtitle, sessionTitle } from "@/lib/upload-origins";
import type { OriginFilter } from "./EventContext";
import { TypeConfirmModal } from "./TypeConfirmModal";
import { IconCheck, IconEdit, IconFunnel, IconTrash, IconX } from "./icons";

/**
 * SES-01: "Filter" beside the Media tab's sort control. Two lists, the event's
 * upload sessions (newest first) and the cameras that took its photos, each
 * with its count. Picking one narrows the grid (with the folder, if one is
 * chosen); `OriginFilterBar` then says what is shown and offers to delete it.
 *
 * Photos from before SES-01 have no session and no camera: they are listed
 * ("Earlier uploads", "Unknown camera") so the counts add up, but cannot be
 * picked. Same popover chrome as SortDropdown.
 */
export function OriginFilterButton({
  origins,
  value,
  onChange,
  onRenameCamera,
}: {
  origins: UploadOrigins;
  value: OriginFilter | null;
  onChange: (next: OriginFilter | null) => void;
  onRenameCamera: (deviceId: string, name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setRenaming(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (renaming) setRenaming(null);
      else setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, renaming]);

  const pick = (next: OriginFilter) => {
    onChange(value?.kind === next.kind && value.id === next.id ? null : next);
    setOpen(false);
  };
  const saveRename = async () => {
    if (!renaming) return;
    const { id, name } = renaming;
    setRenaming(null);
    await onRenameCamera(id, name.trim());
  };

  const sectionTitle = "px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-brand-muted)]";
  const rowBase = "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={`brand-focus inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold hover:border-[var(--color-brand-outline)] ${
          value
            ? "border-[var(--color-brand-navy)] bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]"
            : "border-[var(--color-brand-border)] bg-white text-[var(--color-brand-ink)]"
        }`}
      >
        <IconFunnel size={12} className="opacity-70" />
        Filter{value ? ": 1" : ""}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Filter by upload or camera"
          className="dash-rise absolute right-0 z-30 mt-1.5 max-h-[min(70vh,520px)] w-[min(92vw,340px)] overflow-y-auto rounded-xl border border-[var(--color-brand-border)] bg-white p-1 shadow-[0_14px_44px_rgba(42,34,24,0.18)]"
        >
          <div className={sectionTitle}>Upload sessions</div>
          {origins.sessions.map((s) => {
            const selected = value?.kind === "session" && value.id === s.id;
            const title = sessionTitle(s);
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={selected}
                onClick={() => pick({ kind: "session", id: s.id, label: title })}
                className={`brand-focus ${rowBase} hover:bg-[var(--color-brand-hover)]`}
              >
                <Tick on={selected} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-[var(--color-brand-ink)]">{title}</span>
                  <span className="block truncate text-[11.5px] text-[var(--color-brand-muted)]">{sessionSubtitle(s)}</span>
                </span>
              </button>
            );
          })}
          {origins.earlier_uploads.photo_count > 0 && (
            <div className={`${rowBase} cursor-default`} title="Uploaded before sessions were recorded">
              <Tick on={false} muted />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-[var(--color-brand-muted)]">Earlier uploads</span>
                <span className="block text-[11.5px] text-[var(--color-brand-muted)]">
                  {photoCountLabel(origins.earlier_uploads.photo_count)} · uploaded before sessions were recorded
                </span>
              </span>
            </div>
          )}

          <div className={`${sectionTitle} mt-1 border-t border-[var(--color-brand-border)] pt-2.5`}>Cameras</div>
          {origins.devices.length === 0 && (
            <p className="px-2.5 py-2 text-[12px] text-[var(--color-brand-muted)]">No camera details in these photos.</p>
          )}
          {origins.devices.map((d) => {
            const selected = value?.kind === "device" && value.id === d.id;
            if (renaming?.id === d.id) {
              return (
                <form
                  key={d.id}
                  className={`${rowBase} items-center`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveRename();
                  }}
                >
                  <input
                    autoFocus
                    value={renaming.name}
                    maxLength={40}
                    onChange={(e) => setRenaming({ id: d.id, name: e.target.value })}
                    placeholder={`${d.make} ${d.model}`}
                    aria-label="Camera name"
                    className="brand-focus min-w-0 flex-1 rounded-md border border-[var(--color-brand-border)] px-2 py-1.5 text-[13px]"
                  />
                  <button
                    type="submit"
                    aria-label="Save name"
                    className="brand-focus inline-flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-brand-navy)] text-white"
                  >
                    <IconCheck size={13} />
                  </button>
                </form>
              );
            }
            return (
              <div key={d.id} className="group flex items-center rounded-md hover:bg-[var(--color-brand-hover)]">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => pick({ kind: "device", id: d.id, label: d.label })}
                  className={`brand-focus ${rowBase} flex-1`}
                >
                  <Tick on={selected} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-[var(--color-brand-ink)]">{d.label}</span>
                    <span className="block truncate text-[11.5px] text-[var(--color-brand-muted)]">
                      {d.name ? `${d.make} ${d.model} · ` : ""}
                      {photoCountLabel(d.photo_count)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setRenaming({ id: d.id, name: d.name ?? "" })}
                  aria-label={`Rename ${d.label}`}
                  title="Rename this camera (for every event)"
                  className="brand-focus mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-white hover:text-[var(--color-brand-ink)]"
                >
                  <IconEdit size={13} />
                </button>
              </div>
            );
          })}
          {origins.unknown_device.photo_count > 0 && (
            <div className={`${rowBase} cursor-default`} title="These photos carry no camera details">
              <Tick on={false} muted />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-[var(--color-brand-muted)]">Unknown camera</span>
                <span className="block text-[11.5px] text-[var(--color-brand-muted)]">
                  {photoCountLabel(origins.unknown_device.photo_count)}
                </span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Tick({ on, muted = false }: { on: boolean; muted?: boolean }) {
  return (
    <span
      className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-colors ${
        on
          ? "border-[var(--color-brand-navy)] bg-[var(--color-brand-navy)] text-white"
          : muted
          ? "border-[var(--color-brand-border)] bg-[var(--color-brand-hover)] text-transparent"
          : "border-[var(--color-brand-outline)] bg-white text-transparent"
      }`}
    >
      <IconCheck size={12} />
    </span>
  );
}

/**
 * The bar above a filtered grid: what is shown, Clear filter, and "Delete these
 * photos". The delete removes exactly the photos this view holds (the filter
 * AND the folder, if one is chosen), through the same path as a selection
 * delete, after the studio types "delete".
 */
export function OriginFilterBar({
  filter,
  count,
  folderLabel,
  capNote,
  disabled,
  onClear,
  onDeleteAll,
}: {
  filter: OriginFilter;
  /** Photos in the filtered view. */
  count: number;
  /** The chosen folder's name, when the view is also narrowed to one. */
  folderLabel: string | null;
  /** The photo-cap note a selection delete shows ("Deleted photos still count…"). */
  capNote: string | null;
  disabled: boolean;
  onClear: () => void;
  onDeleteAll: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const what = `${photoCountLabel(count)} from ${filter.label}${folderLabel ? ` in ${folderLabel}` : ""}`;

  return (
    <div className="dash-rise mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-navy-soft)] px-3.5 py-2.5">
      <span className="min-w-0 flex-1 text-[13px] text-[var(--color-brand-ink)]">
        Showing <span className="font-semibold">{what}</span>
      </span>
      <button
        type="button"
        onClick={onClear}
        className="brand-focus inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12.5px] font-semibold text-[var(--color-brand-navy)] hover:bg-white"
      >
        <IconX size={13} /> Clear filter
      </button>
      {count > 0 && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setConfirming(true)}
          className="brand-focus inline-flex items-center gap-1.5 rounded-md bg-[var(--color-brand-danger)] px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          <IconTrash size={14} /> Delete these photos
        </button>
      )}
      {confirming && (
        <TypeConfirmModal
          action="delete"
          title={`Delete ${photoCountLabel(count)}?`}
          description={`All ${what} are removed from the gallery and storage. This cannot be undone.`}
          warningText={capNote}
          busy={busy}
          onCancel={() => !busy && setConfirming(false)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await onDeleteAll();
              setConfirming(false);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
