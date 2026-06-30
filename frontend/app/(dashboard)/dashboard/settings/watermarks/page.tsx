"use client";

import { useEffect, useState } from "react";
import {
  getWatermarkPresets,
  deleteWatermarkPreset,
  updateWatermarkPreset,
} from "@/lib/api";
import type { WatermarkPreset } from "@/lib/types";
import { SectionHeading, SectionSkeleton, FetchError, Spinner } from "../SettingsUI";
import { WatermarkEditorModal, WatermarkPreview } from "./WatermarkEditorModal";

const MAX_PRESETS = 20;

type ModalState = { mode: "create" } | { mode: "edit"; preset: WatermarkPreset } | null;

export default function WatermarkPresetsPage() {
  const [presets, setPresets] = useState<WatermarkPreset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function refresh() {
    const res = await getWatermarkPresets();
    setPresets(res.presets);
  }

  useEffect(() => {
    getWatermarkPresets()
      .then((res) => setPresets(res.presets))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  async function handleSetDefault(id: string) {
    setBusyId(id);
    try {
      await updateWatermarkPreset(id, { is_default: true });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await deleteWatermarkPreset(id);
      setConfirmId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBusyId(null);
    }
  }

  function handleSaved(saved: WatermarkPreset) {
    setModal(null);
    // Re-fetch so default reassignment / ordering stays authoritative.
    refresh().catch(() => setPresets((prev) => mergeSaved(prev, saved)));
  }

  const atLimit = (presets?.length ?? 0) >= MAX_PRESETS;

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Brand & Delivery"
        title="Watermark Presets"
        description="Upload watermarks to overlay on your delivered photos. Set the position, size and opacity. Up to 20 presets."
      />

      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-brand-muted)]">
          {presets ? `${presets.length} of ${MAX_PRESETS} presets` : " "}
        </p>
        <button
          type="button"
          onClick={() => setModal({ mode: "create" })}
          disabled={atLimit}
          className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
          title={atLimit ? "Preset limit reached" : undefined}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Add watermark
        </button>
      </div>

      {error && <FetchError message={error} />}

      {presets === null && !error ? (
        <SectionSkeleton />
      ) : presets && presets.length === 0 ? (
        <EmptyState onAdd={() => setModal({ mode: "create" })} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {presets?.map((p) => (
            <div
              key={p._id}
              className="overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)]"
            >
              <WatermarkPreview src={p.image_url ?? null} position={p.position} size={p.size} opacity={p.opacity} />
              <div className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-[var(--color-brand-ink)]">
                    {p.name || "Untitled"}
                  </span>
                  {p.is_default && (
                    <span className="shrink-0 rounded-full bg-[var(--color-brand-navy-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-navy)]">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--color-brand-muted)]">
                  {p.position.replace("-", " ")} · {p.size}% · {p.opacity}% opacity
                </p>

                {confirmId === p._id ? (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs text-[var(--color-brand-danger)]">Delete?</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(p._id)}
                      disabled={busyId === p._id}
                      className="brand-focus rounded-md bg-[var(--color-brand-danger)] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {busyId === p._id ? "…" : "Yes"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="brand-focus rounded-md border border-[var(--color-brand-border)] px-2.5 py-1 text-xs font-semibold text-[var(--color-brand-ink)]"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 pt-1">
                    {!p.is_default && (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(p._id)}
                        disabled={busyId === p._id}
                        className="brand-focus inline-flex items-center gap-1 rounded-md border border-[var(--color-brand-border)] px-2.5 py-1 text-xs font-semibold text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-bg)] disabled:opacity-60"
                      >
                        {busyId === p._id ? <Spinner /> : "Set default"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setModal({ mode: "edit", preset: p })}
                      className="brand-focus rounded-md border border-[var(--color-brand-border)] px-2.5 py-1 text-xs font-semibold text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-bg)]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(p._id)}
                      className="brand-focus ml-auto rounded-md px-2.5 py-1 text-xs font-semibold text-[var(--color-brand-danger)] hover:bg-[var(--color-brand-danger-soft)]"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <WatermarkEditorModal
          mode={modal.mode}
          initial={modal.mode === "edit" ? modal.preset : undefined}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

/** Fallback local merge if the post-save refresh fails. */
function mergeSaved(prev: WatermarkPreset[] | null, saved: WatermarkPreset): WatermarkPreset[] {
  const list = prev ?? [];
  const idx = list.findIndex((p) => p._id === saved._id);
  if (idx === -1) return [saved, ...list];
  const copy = [...list];
  copy[idx] = saved;
  return copy;
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-6 py-12 text-center">
      <p className="text-sm font-semibold text-[var(--color-brand-ink)]">No watermark presets yet</p>
      <p className="max-w-sm text-xs text-[var(--color-brand-muted)]">
        Add a watermark to overlay your studio mark on delivered photos.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="brand-focus mt-1 inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-brand-navy-deep)]"
      >
        Add watermark
      </button>
    </div>
  );
}
