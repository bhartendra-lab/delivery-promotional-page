"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBooking, ApiError } from "@/lib/api";
import { EVENT_TYPES, isCountBasedPlan, isStorageBasedPlan, type EventExpiryChoice, type EventType } from "@/lib/types";
import {
  EVENT_CLIENTS_MAX,
  EVENT_CLIENT_NAME_MAX,
  coupleEventNamePreview,
  createdEventNotice,
  createdEventNoticeKey,
  eventExpiryPreview,
  eventField,
  hasCompleteNumber,
  isCoupleEventType,
  validateEventDraft,
  type PersonDraft,
} from "@/lib/event-clients";
import { useChrome } from "./ChromeContext";
import { EventExpiryField } from "./EventExpiryField";
import { useUpgradeModal } from "@/components/billing/UpgradeModalProvider";
import { Modal } from "@/components/ui/Modal";
import { ChipRadioGroup } from "@/components/ui/ChipRadioGroup";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { useTip } from "@/components/ui/Tip";
import { IconPlus, IconX } from "@/components/ui/icons";

type Props = {
  open: boolean;
  onClose: () => void;
};

const FORM_ID = "add-event-form";
const TYPE_OPTIONS = EVENT_TYPES.map((type) => ({ value: type, label: type }));

/** Text inputs here share the +91 control's height and surface, so a name and
 *  the number beside it read as one row. */
const INPUT_CLASS =
  "brand-focus block h-10 w-full rounded-field border bg-[var(--color-brand-surface-raised)] px-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/60 disabled:cursor-not-allowed disabled:opacity-60";
const LABEL_CLASS = "mb-1.5 block text-[12.5px] font-semibold text-[var(--color-brand-ink)]";
const HINT_CLASS = "text-[12px] leading-relaxed text-[var(--color-brand-muted)]";
const ERROR_CLASS = "mt-1 text-[12px] text-[var(--color-brand-danger)]";
const borderFor = (invalid: boolean) =>
  invalid ? "border-[var(--color-brand-danger)]" : "border-[var(--color-brand-border)]";

let personSeq = 0;
const newPerson = (role: PersonDraft["role"]): PersonDraft => ({ id: `p${++personSeq}`, role, name: "", phone: "" });

/**
 * "Add new event". The event TYPE is chosen first and decides what the rest of
 * the form asks:
 *
 *  - a couple type (Wedding, Pre-wedding, Engagement, Anniversary) asks for the
 *    Bride and the Groom, and the event is named from their first names;
 *  - every other type asks for an event name and its Clients.
 *
 * Anyone given a WhatsApp number becomes a Client the moment the event exists
 * and can sign in with that number; the checkbox by the Create button decides
 * only whether they are sent the link. On a storage plan the form also asks,
 * compulsorily, when the event expires.
 *
 * The form itself lives in an inner component that is mounted only while the
 * modal is open, so every open starts from a clean form without an effect to
 * reset each field.
 */
export function AddEventModal({ open, onClose }: Props) {
  if (!open) return null;
  return <AddEventForm onClose={onClose} />;
}

function AddEventForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  // The company's plan decides two things here: whether the expiry is asked
  // (storage plans only) and whether the name is about to become permanent
  // (pay per event). Shared via ChromeContext (single dashboard-wide fetch).
  const { dlpUsage, dlpLoading } = useChrome();
  const { openUpgradeModal } = useUpgradeModal();

  const [eventType, setEventType] = useState<EventType | null>(null);
  // The two sets of people are held SEPARATELY, so switching between a couple
  // type and another type shows the other set and switching back restores
  // what was typed. Only the visible set is ever submitted.
  const [bride, setBride] = useState(() => newPerson("bride"));
  const [groom, setGroom] = useState(() => newPerson("groom"));
  const [extras, setExtras] = useState<PersonDraft[]>([]);
  const [eventName, setEventName] = useState("");
  const [clients, setClients] = useState<PersonDraft[]>(() => [newPerson("client")]);
  // Event date and expiry survive any switch of type.
  const [eventDate, setEventDate] = useState("");
  const [expiryChoice, setExpiryChoice] = useState<EventExpiryChoice | null>(null);
  const [expiryDate, setExpiryDate] = useState("");
  // Checked by default on every open. Kept while the checkbox is hidden, so
  // typing a number, deleting it and typing it again does not silently
  // uncheck it.
  const [notify, setNotify] = useState(true);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const typeLabelId = useId();
  const notifyId = useId();
  /** A row just added; its name field takes focus once it is on screen. */
  const focusAfterAdd = useRef<string | null>(null);

  const couple = isCoupleEventType(eventType);
  const people = couple ? [bride, groom, ...extras] : clients;
  const atCap = people.length >= EVENT_CLIENTS_MAX;
  const showExpiry = isStorageBasedPlan(dlpUsage?.service_type);
  const payPerEvent = isCountBasedPlan(dlpUsage?.service_type);
  const canNotify = hasCompleteNumber(people);
  const namePreview = coupleEventNamePreview(bride.name, groom.name);

  useEffect(() => {
    const id = focusAfterAdd.current;
    if (!id) return;
    focusAfterAdd.current = null;
    document.getElementById(eventField.personName(id))?.focus();
  }, [extras.length, clients.length]);

  /** Errors clear as the field they are about is corrected. */
  const clearError = (...keys: string[]) =>
    setErrors((prev) => {
      if (!keys.some((key) => key in prev)) return prev;
      const next = { ...prev };
      for (const key of keys) delete next[key];
      return next;
    });

  const patchPerson = (id: string, patch: Partial<PersonDraft>) => {
    const apply = (person: PersonDraft) => (person.id === id ? { ...person, ...patch } : person);
    if (id === bride.id) setBride(apply);
    else if (id === groom.id) setGroom(apply);
    else if (couple) setExtras((prev) => prev.map(apply));
    else setClients((prev) => prev.map(apply));
    clearError("name" in patch ? eventField.personName(id) : eventField.personPhone(id));
  };

  const addPerson = () => {
    if (atCap) return;
    const person = newPerson("client");
    focusAfterAdd.current = person.id;
    if (couple) setExtras((prev) => [...prev, person]);
    else setClients((prev) => [...prev, person]);
  };

  const removePerson = (id: string) => {
    if (couple) setExtras((prev) => prev.filter((p) => p.id !== id));
    else setClients((prev) => prev.filter((p) => p.id !== id));
    clearError(eventField.personName(id), eventField.personPhone(id));
  };

  /** Focus the first invalid field and bring it into view INSIDE the modal's
   *  scrolling body (the page itself never scrolls behind a modal). */
  const focusField = (key: string) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(key);
      el?.scrollIntoView({ block: "center" });
      el?.focus({ preventScroll: true });
    });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!eventType || dlpLoading || submitting) return;
    setServerError(null);

    // Validation runs here, on submit, rather than by greying the button: a
    // disabled Create tells the Studio nothing about what is missing.
    const draft = validateEventDraft({
      couple,
      eventName,
      people,
      expiry: { required: showExpiry, choice: expiryChoice, date: expiryDate },
    });
    setErrors(draft.errors);
    if (draft.firstInvalid) {
      focusField(draft.firstInvalid);
      return;
    }

    setSubmitting(true);
    try {
      // Event date is optional — send a numeric epoch only when set, else omit.
      const epoch = eventDate ? new Date(`${eventDate}T00:00:00`).getTime() : NaN;
      const res = await createBooking({
        event_type: eventType,
        // A couple event is named by the backend from the Bride and Groom.
        ...(couple ? {} : { event_name: eventName.trim() }),
        ...(Number.isFinite(epoch) ? { event_date: epoch } : {}),
        clients: draft.clients,
        ...(showExpiry && expiryChoice
          ? { event_expiry: expiryChoice === "custom" ? { choice: expiryChoice, date: expiryDate } : { choice: expiryChoice } }
          : {}),
        notify_clients: notify,
      });
      // What happened to the WhatsApp invitations is said ONCE, by the new
      // event's page. Carried in sessionStorage rather than the URL: nothing
      // to strip afterwards, and a refresh cannot replay it.
      const notice = createdEventNotice(res.client_invites);
      if (notice) {
        try {
          sessionStorage.setItem(createdEventNoticeKey(res.booking_id), notice);
        } catch {
          /* storage unavailable: the event is created, only the toast is lost */
        }
      }
      // Canonical metadata is fetched from getBookingById on the event page; no
      // need to cache it here.
      onClose();
      router.push(`/dashboard/events/${res.booking_id}`);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.status === 402) {
        onClose();
        openUpgradeModal({ preset: "event" });
        return;
      }
      setServerError(err instanceof Error ? err.message : "Could not create event");
    }
  }

  const personRow = (person: PersonDraft, opts: { label?: string; required?: boolean; removable?: boolean; what: string }) => (
    <PersonRow
      key={person.id}
      person={person}
      label={opts.label}
      required={opts.required}
      what={opts.what}
      disabled={submitting}
      nameError={errors[eventField.personName(person.id)]}
      phoneError={errors[eventField.personPhone(person.id)]}
      onChange={(patch) => patchPerson(person.id, patch)}
      onRemove={opts.removable ? () => removePerson(person.id) : undefined}
    />
  );

  return (
    <Modal
      open
      onClose={submitting ? () => {} : onClose}
      title="Add new event"
      subtitle="Create a page for this booking. You can upload photos and share the link in the next step."
      // "lg", not "md": seven type chips in four columns need about 120px a
      // chip once one is selected (its tick adds width), and the footer has to
      // hold the WhatsApp checkbox and both buttons on one row. At "md" (456px
      // of content) the longest chips overflowed and the footer wrapped.
      size="lg"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Shown only once somebody has a complete number: with none there is
              nobody to inform, and the control would be noise. A real checkbox
              with a real label, so the whole 44px row is the tap target. */}
          {canNotify ? (
            <label
              htmlFor={notifyId}
              className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[13px] font-medium text-[var(--color-brand-ink)]"
            >
              <input
                id={notifyId}
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
                disabled={submitting}
                className="brand-focus h-[18px] w-[18px] shrink-0 cursor-pointer rounded accent-[var(--color-brand-navy)]"
              />
              Send them the gallery link on WhatsApp
            </label>
          ) : (
            <span aria-hidden className="hidden sm:block" />
          )}
          <div className="flex shrink-0 items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="brand-focus inline-flex h-10 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13.5px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:opacity-50"
            >
              Cancel
            </button>
            {/* Enabled as soon as a type is chosen (and the plan is known);
                everything else is checked on submit. In the footer, outside the
                form element, hence the `form` attribute. */}
            <button
              type="submit"
              form={FORM_ID}
              disabled={!eventType || dlpLoading || submitting}
              className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-white/60 border-t-white" />
                  Creating…
                </>
              ) : (
                "Create event"
              )}
            </button>
          </div>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-5">
        {/* 1 · Event type. Chosen first; nothing else shows until it is. */}
        <div>
          <span id={typeLabelId} className={LABEL_CLASS}>
            Event type <span className="ml-0.5 text-[var(--color-brand-navy)]">*</span>
          </span>
          <ChipRadioGroup
            labelledBy={typeLabelId}
            options={TYPE_OPTIONS}
            value={eventType}
            onChange={setEventType}
            disabled={submitting}
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          />
        </div>

        {!eventType ? (
          <p className={HINT_CLASS}>Choose a type to see the rest.</p>
        ) : (
          <>
            {couple ? (
              /* 2 · A couple type: the Bride and the Groom name the event. */
              <div className="flex flex-col gap-3.5">
                {personRow(bride, { label: "Bride", required: true, what: "Bride" })}
                {personRow(groom, { label: "Groom", required: true, what: "Groom" })}
                <div>
                  <p aria-live="polite" className="text-[13px] text-[var(--color-brand-ink)]">
                    {namePreview && (
                      <>
                        <span className="text-[var(--color-brand-muted)]">Event name: </span>
                        <span className="font-semibold">{namePreview}</span>
                      </>
                    )}
                  </p>
                  {payPerEvent && <p className={HINT_CLASS}>The event name can&apos;t be changed after you create it.</p>}
                </div>
                {extras.length > 0 && (
                  <div className="flex flex-col gap-2.5">
                    {extras.map((person) => personRow(person, { removable: true, what: "Person" }))}
                  </div>
                )}
                {!atCap && (
                  <AddPersonButton
                    label="Add another person"
                    tip="Add a parent, sibling or planner who should also be a Client on this event."
                    onClick={addPerson}
                    disabled={submitting}
                  />
                )}
              </div>
            ) : (
              /* 3 · Every other type: an event name, and its Clients. */
              <>
                <div>
                  <label htmlFor={eventField.eventName} className={LABEL_CLASS}>
                    Event name <span className="ml-0.5 text-[var(--color-brand-navy)]">*</span>
                  </label>
                  <input
                    id={eventField.eventName}
                    type="text"
                    value={eventName}
                    onChange={(e) => {
                      setEventName(e.target.value);
                      clearError(eventField.eventName);
                    }}
                    placeholder="e.g. Meera's 30th Birthday"
                    disabled={submitting}
                    autoComplete="off"
                    aria-invalid={errors[eventField.eventName] ? true : undefined}
                    aria-describedby={errors[eventField.eventName] ? `${eventField.eventName}-error` : undefined}
                    className={`${INPUT_CLASS} ${borderFor(!!errors[eventField.eventName])}`}
                  />
                  {errors[eventField.eventName] && (
                    <p id={`${eventField.eventName}-error`} className={ERROR_CLASS}>
                      {errors[eventField.eventName]}
                    </p>
                  )}
                  {payPerEvent && (
                    <p className={`mt-1.5 ${HINT_CLASS}`}>The event name can&apos;t be changed after you create it.</p>
                  )}
                </div>
                <div className="flex flex-col gap-2.5">
                  <span className={`${LABEL_CLASS} mb-0`}>Clients</span>
                  {clients.map((person) => personRow(person, { removable: clients.length > 1, what: "Client" }))}
                  {!atCap && (
                    <AddPersonButton
                      label="Add another client"
                      tip="Add everyone who should be a Client on this event."
                      onClick={addPerson}
                      disabled={submitting}
                    />
                  )}
                </div>
              </>
            )}

            {/* 4 · One line under whichever people group is showing. */}
            <p className={`-mt-2 ${HINT_CLASS}`}>
              Optional. Anyone you add a number for joins as a Client and can sign in with that number.
            </p>

            {/* 5 · Event date. */}
            <div>
              <label htmlFor="add-event-date" className={LABEL_CLASS}>
                Event date <span className="font-medium text-[var(--color-brand-muted)]">(optional)</span>
              </label>
              <input
                id="add-event-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                disabled={submitting}
                className={`${INPUT_CLASS} ${borderFor(false)} sm:max-w-[220px]`}
              />
            </div>

            {/* 6 · Event expiry, on storage plans only. While the plan is still
                loading the slot holds a skeleton (and Create stays disabled);
                if it failed to load the field is left out and the server's
                default, never, applies. */}
            {dlpLoading ? (
              <div aria-hidden>
                <div className="skeleton mb-2 h-4 w-28 rounded" />
                <div className="skeleton h-10 w-full rounded-lg" />
              </div>
            ) : (
              showExpiry && (
                <EventExpiryField
                  required
                  choice={expiryChoice}
                  date={expiryDate}
                  onChoice={(choice) => {
                    setExpiryChoice(choice);
                    clearError(eventField.expiry, eventField.expiryDate);
                  }}
                  onDate={(date) => {
                    setExpiryDate(date);
                    clearError(eventField.expiryDate);
                  }}
                  outcome={eventExpiryPreview({ choice: expiryChoice, date: expiryDate })}
                  disabled={submitting}
                  choiceError={errors[eventField.expiry]}
                  dateError={errors[eventField.expiryDate]}
                />
              )
            )}
          </>
        )}

        {serverError && (
          <p
            role="alert"
            className="rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-3 py-2 text-[12.5px] text-[var(--color-brand-danger)]"
          >
            {serverError}
          </p>
        )}
      </form>
    </Modal>
  );
}

/**
 * One person: a name and an optional WhatsApp number. Side by side from 640px
 * (the number column capped at 200px), stacked name over number below that,
 * so nothing is ever squeezed on a phone.
 */
function PersonRow({
  person,
  label,
  required,
  what,
  disabled,
  nameError,
  phoneError,
  onChange,
  onRemove,
}: {
  person: PersonDraft;
  /** The role, shown above the row ("Bride"). Rows without one are unlabelled extras. */
  label?: string;
  required?: boolean;
  /** What to call this person in the fields' accessible names. */
  what: string;
  disabled: boolean;
  nameError?: string;
  phoneError?: string;
  onChange: (patch: Partial<PersonDraft>) => void;
  onRemove?: () => void;
}) {
  const nameId = eventField.personName(person.id);
  const phoneId = eventField.personPhone(person.id);
  return (
    <div>
      {label && (
        <span className={LABEL_CLASS}>
          {label}
          {required && <span className="ml-0.5 text-[var(--color-brand-navy)]">*</span>}
        </span>
      )}
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,200px)]">
          <div className="min-w-0">
            <input
              id={nameId}
              type="text"
              value={person.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder={required ? "Full name" : "Name"}
              maxLength={EVENT_CLIENT_NAME_MAX}
              disabled={disabled}
              autoComplete="off"
              aria-label={`${what} name`}
              aria-required={required || undefined}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? `${nameId}-error` : undefined}
              className={`${INPUT_CLASS} ${borderFor(!!nameError)}`}
            />
            {nameError && (
              <p id={`${nameId}-error`} className={ERROR_CLASS}>
                {nameError}
              </p>
            )}
          </div>
          <div className="min-w-0">
            <PhoneInput
              id={phoneId}
              value={person.phone}
              onChange={(phone) => onChange({ phone })}
              disabled={disabled}
              invalid={!!phoneError}
              autoComplete="off"
              aria-label={`${what} WhatsApp number`}
              aria-describedby={phoneError ? `${phoneId}-error` : undefined}
            />
            {phoneError && (
              <p id={`${phoneId}-error`} className={ERROR_CLASS}>
                {phoneError}
              </p>
            )}
          </div>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label="Remove this person"
            className="brand-focus flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-hover)] hover:text-[var(--color-brand-ink)] disabled:opacity-50"
          >
            <IconX size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

/** "Add another person": a text button that explains itself on hover, focus
 *  and tap (a tap focuses it, which is what opens the tip on a touch screen). */
function AddPersonButton({
  label,
  tip,
  onClick,
  disabled,
}: {
  label: string;
  tip: string;
  onClick: () => void;
  disabled: boolean;
}) {
  const { anchorProps, tip: tipNode } = useTip<HTMLButtonElement>(tip);
  return (
    <>
      <button
        type="button"
        {...anchorProps}
        onClick={onClick}
        disabled={disabled}
        className="brand-focus inline-flex min-h-10 items-center gap-1.5 self-start rounded-lg px-1 text-[13px] font-semibold text-[var(--color-brand-navy)] hover:underline disabled:opacity-50"
      >
        <IconPlus size={14} weight="bold" />
        {label}
      </button>
      {tipNode}
    </>
  );
}
