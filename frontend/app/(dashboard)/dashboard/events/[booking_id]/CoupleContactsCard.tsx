"use client";

import { useId, useState } from "react";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { Tip } from "@/components/ui/Tip";
import {
  EVENT_CLIENT_NAME_MAX,
  PHONE_DIGITS,
  coupleContactsNotice,
  coupleField,
  validateCoupleContacts,
  type CoupleContactDraft,
  type CoupleRole,
  type CoupleSlot,
} from "@/lib/event-clients";
import { useEvent } from "./EventContext";
import { IconHeart } from "./icons";

const ROLE_LABEL: Record<CoupleRole, string> = { bride: "Bride", groom: "Groom" };
const EMPTY: CoupleContactDraft = { name: "", phone: "" };

/**
 * Access & Sharing, above the Guest list: the Bride's and/or Groom's WhatsApp
 * number, when event setup was left without it.
 *
 * Setup asks for the couple's names (they name the event) but their numbers
 * are optional, and the Guest list can mark anyone a Client but never as the
 * Bride or the Groom. So a number skipped at setup used to be gone for good.
 * Adding it here does what setup would have done: the person becomes a Client
 * who can sign in with that number (or, if they already signed in with it,
 * that Guest becomes the Bride or Groom), and the same WhatsApp invitation
 * goes out unless the box is unticked.
 *
 * Rendered only while at least one of the two has no number (`slots`), and
 * each row disappears as soon as its number is saved.
 */
export function CoupleContactsCard({ slots, onAdded }: { slots: CoupleSlot[]; onAdded: () => void }) {
  const { addCoupleContacts, toast } = useEvent();
  const [drafts, setDrafts] = useState<Partial<Record<CoupleRole, CoupleContactDraft>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const notifyId = useId();

  const draftOf = (role: CoupleRole) => drafts[role] ?? EMPTY;
  const canNotify = slots.some((s) => draftOf(s.role).phone.length === PHONE_DIGITS);
  const typedAnything = slots.some((s) => draftOf(s.role).phone.length > 0);
  const both = slots.length === 2;

  const patch = (role: CoupleRole, next: Partial<CoupleContactDraft>) => {
    setDrafts((prev) => ({ ...prev, [role]: { ...(prev[role] ?? EMPTY), ...next } }));
    setServerError(null);
    setErrors((prev) => {
      const key = "name" in next ? coupleField.name(role) : coupleField.phone(role);
      if (!(key in prev)) return prev;
      const rest = { ...prev };
      delete rest[key];
      return rest;
    });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateCoupleContacts(slots, drafts);
    setErrors(result.errors);
    if (result.firstInvalid) {
      document.getElementById(result.firstInvalid)?.focus();
      return;
    }
    setBusy(true);
    setServerError(null);
    try {
      const res = await addCoupleContacts({ contacts: result.contacts, notify_clients: notify });
      const names = result.contacts.map((c) => c.name ?? slots.find((s) => s.role === c.role)?.name ?? ROLE_LABEL[c.role]);
      toast(coupleContactsNotice(names, res.client_invites));
      setDrafts((prev) => {
        const rest = { ...prev };
        for (const c of result.contacts) delete rest[c.role];
        return rest;
      });
      onAdded();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Couldn't add the number");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="@container flex shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-white">
      <div className="flex items-center gap-3 border-b border-[#ECE5D8] px-4 py-4">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]"
          style={{ background: "var(--color-brand-navy-soft)", color: "var(--color-brand-navy)" }}
        >
          <IconHeart size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-[15.5px] font-bold tracking-tight text-[var(--color-brand-ink)]">
            {both ? "Add the couple's WhatsApp" : `Add the ${slots[0].role}'s WhatsApp`}
            <Tip text="A number added here makes that person a Client: they sign in with it and see the full gallery. If they already signed in with this number, their existing Guest entry becomes the Bride or Groom." />
          </h3>
          <p className="mt-0.5 text-[12.5px] text-[var(--color-brand-muted)]">
            {both ? "Not added at setup. They become Clients with full access." : "Not added at setup. They become a Client with full access."}
          </p>
        </div>
      </div>

      <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-4">
        {slots.map((slot) => (
          <CoupleRow
            key={slot.role}
            slot={slot}
            draft={draftOf(slot.role)}
            disabled={busy}
            nameError={errors[coupleField.name(slot.role)]}
            phoneError={errors[coupleField.phone(slot.role)]}
            onChange={(next) => patch(slot.role, next)}
          />
        ))}

        {serverError && (
          <p role="alert" className="text-[12px] text-[var(--color-brand-danger)]">
            {serverError}
          </p>
        )}

        {/* The checkbox wraps above the button on a narrow card rather than
            squeezing it; the button keeps its own line end. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[#ECE5D8] pt-3">
          {canNotify ? (
            <label
              htmlFor={notifyId}
              className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[12.5px] font-medium text-[var(--color-brand-ink)]"
            >
              <input
                id={notifyId}
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
                disabled={busy}
                className="brand-focus h-[18px] w-[18px] shrink-0 cursor-pointer rounded accent-[var(--color-brand-navy)]"
              />
              Send {both ? "them" : `the ${slots[0].role}`} the gallery link on WhatsApp
            </label>
          ) : (
            <span className="text-[11.5px] text-[var(--color-brand-muted)]">
              {both ? "Add one or both numbers." : "They can sign in with this number."}
            </span>
          )}
          <button
            type="submit"
            disabled={busy || !typedAnything}
            className="brand-focus ml-auto inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13px] font-semibold text-white hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-white/60 border-t-white" />}
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      </form>
    </section>
  );
}

/**
 * One half of the couple. With a name on record: the role and name, and the
 * number beside them once the card is wide enough (stacked below that). With
 * no name on record (an event made before names were kept): a name field and
 * the number.
 */
function CoupleRow({
  slot,
  draft,
  disabled,
  nameError,
  phoneError,
  onChange,
}: {
  slot: CoupleSlot;
  draft: CoupleContactDraft;
  disabled: boolean;
  nameError?: string;
  phoneError?: string;
  onChange: (next: Partial<CoupleContactDraft>) => void;
}) {
  const role = ROLE_LABEL[slot.role];
  const nameId = coupleField.name(slot.role);
  const phoneId = coupleField.phone(slot.role);
  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 @md:grid-cols-[minmax(0,1fr)_minmax(0,220px)] @md:items-start">
      {slot.name ? (
        <div className="min-w-0 @md:flex @md:h-10 @md:flex-col @md:justify-center">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-brand-muted)]">{role}</span>
          <p className="truncate text-[13.5px] font-semibold text-[var(--color-brand-ink)]">{slot.name}</p>
        </div>
      ) : (
        <div className="min-w-0">
          <label htmlFor={nameId} className="sr-only">
            {role} name
          </label>
          <input
            id={nameId}
            type="text"
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={`${role}'s full name`}
            maxLength={EVENT_CLIENT_NAME_MAX}
            disabled={disabled}
            autoComplete="off"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${nameId}-error` : undefined}
            className={`brand-focus block h-10 w-full rounded-field border bg-[var(--color-brand-surface-raised)] px-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/60 disabled:opacity-60 ${
              nameError ? "border-[var(--color-brand-danger)]" : "border-[var(--color-brand-border)]"
            }`}
          />
          {nameError && (
            <p id={`${nameId}-error`} className="mt-1 text-[12px] text-[var(--color-brand-danger)]">
              {nameError}
            </p>
          )}
        </div>
      )}
      <div className="min-w-0">
        <PhoneInput
          id={phoneId}
          value={draft.phone}
          onChange={(phone) => onChange({ phone })}
          disabled={disabled}
          invalid={!!phoneError}
          autoComplete="off"
          aria-label={`${role} WhatsApp number`}
          aria-describedby={phoneError ? `${phoneId}-error` : undefined}
        />
        {phoneError && (
          <p id={`${phoneId}-error`} className="mt-1 text-[12px] text-[var(--color-brand-danger)]">
            {phoneError}
          </p>
        )}
      </div>
    </div>
  );
}
