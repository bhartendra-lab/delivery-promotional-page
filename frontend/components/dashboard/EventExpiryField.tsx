"use client";

import { ChipRadioGroup } from "@/components/ui/ChipRadioGroup";
import { EVENT_EXPIRY_OPTIONS, eventField, tomorrowIstDateInput } from "@/lib/event-clients";
import type { EventExpiryChoice } from "@/lib/types";

/** Custom date is the odd one out: under 640px it takes the full width, so
 *  the four fixed answers sit as a tidy two-by-two above it. */
const OPTIONS = EVENT_EXPIRY_OPTIONS.map((option) => ({
  ...option,
  className: option.value === "custom" ? "col-span-2 sm:col-span-1" : undefined,
}));

/**
 * "When does this event expire?" for a storage plan event: five chips, a date
 * input when Custom date is chosen, and one line underneath that names what
 * will actually happen with a real date.
 *
 * Shared by the "Add new event" modal (where it is compulsory and starts
 * unanswered) and "Edit event details" (where it starts on the stored answer).
 * It holds no state of its own: the caller owns the choice, the date, the
 * errors and the outcome line, because the two callers decide those
 * differently (a stored expiry keeps its stored date until it is changed; a
 * new choice counts from today).
 */
export function EventExpiryField({
  choice,
  date,
  onChoice,
  onDate,
  outcome,
  required,
  disabled,
  choiceError,
  dateError,
}: {
  choice: EventExpiryChoice | null;
  /** "YYYY-MM-DD", meaningful with "custom". */
  date: string;
  onChoice: (choice: EventExpiryChoice) => void;
  onDate: (date: string) => void;
  /** The line naming the outcome, or null while there is nothing to say. */
  outcome: string | null;
  required?: boolean;
  disabled?: boolean;
  choiceError?: string;
  dateError?: string;
}) {
  const labelId = `${eventField.expiry}-label`;
  const choiceErrorId = `${eventField.expiry}-error`;
  const dateErrorId = `${eventField.expiryDate}-error`;
  return (
    <div>
      <span id={labelId} className="mb-2 block text-[12.5px] font-semibold text-[var(--color-brand-ink)]">
        Event expiry
        {required && <span className="ml-0.5 text-[var(--color-brand-navy)]">*</span>}
      </span>
      <ChipRadioGroup
        id={eventField.expiry}
        labelledBy={labelId}
        options={OPTIONS}
        value={choice}
        onChange={onChoice}
        disabled={disabled}
        invalid={!!choiceError}
        describedBy={choiceError ? choiceErrorId : undefined}
        className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
      />
      {choiceError && (
        <p id={choiceErrorId} className="mt-1.5 text-[12px] text-[var(--color-brand-danger)]">
          {choiceError}
        </p>
      )}

      {choice === "custom" && (
        <div className="mt-2.5">
          <input
            id={eventField.expiryDate}
            type="date"
            aria-label="Expiry date"
            value={date}
            min={tomorrowIstDateInput()}
            onChange={(e) => onDate(e.target.value)}
            disabled={disabled}
            aria-invalid={dateError ? true : undefined}
            aria-describedby={dateError ? dateErrorId : undefined}
            className={`brand-focus block w-full rounded-lg border bg-white px-3.5 py-2.5 text-[14px] text-[var(--color-brand-ink)] outline-none sm:max-w-[220px] ${
              dateError ? "border-[var(--color-brand-danger)]" : "border-[var(--color-brand-border)]"
            }`}
          />
          {dateError && (
            <p id={dateErrorId} className="mt-1.5 text-[12px] text-[var(--color-brand-danger)]">
              {dateError}
            </p>
          )}
        </div>
      )}

      {outcome && (
        <p aria-live="polite" className="mt-2.5 text-[12px] leading-relaxed text-[var(--color-brand-muted)]">
          {outcome}
        </p>
      )}
    </div>
  );
}
