"use client";

/**
 * Surface 2 — the friends consent sheet.
 *
 * Its own explicit step, never pre-selected and never folded into the
 * face-search consent: agreeing to have your own face matched is not agreeing
 * that other guests may see which photos you are in together, and the DPDP Act
 * wants each purpose consented to separately. The backend records this as its
 * own `consent_logs` row under `ff-v1.0`.
 *
 * The words come from `lib/friend-finder/copy.ts`, which is the same text the
 * backend stores as that version. Do not edit them here.
 *
 * Swiping the sheet away (backdrop, Escape, the close button) records NOTHING.
 * Only Continue and "No thanks" write, and they write different choices.
 */

import { useState } from "react";
import type { ClientTheme } from "@/lib/client-theme";
import {
  FRIENDS_CHOICES,
  FRIENDS_SHEET_COPY,
} from "@/lib/friend-finder/copy";
import type { FriendChoice } from "@/lib/friend-finder/types";
import { IconCheck } from "@/components/ui/icons";
import { SheetShell } from "./SheetShell";

export function FriendsSheet({
  t,
  open,
  busy,
  onClose,
  /** Continue: the picked choice. The name other guests see is the one this
   *  Guest gave at sign-in — there is no second name to collect here. */
  onChoose,
  /** "No thanks": records `choice: "none"` and closes. */
  onDecline,
}: {
  t: ClientTheme;
  open: boolean;
  /** A choose request is in flight — the buttons lock rather than double-fire. */
  busy: boolean;
  onClose: () => void;
  onChoose: (choice: Exclude<FriendChoice, "none">) => void;
  onDecline: () => void;
}) {
  const [choice, setChoice] = useState<Exclude<FriendChoice, "none"> | null>(null);
  const canContinue = choice !== null && !busy;

  return (
    <SheetShell
      t={t}
      open={open}
      onClose={onClose}
      title={FRIENDS_SHEET_COPY.title}
      footer={
        <div className="flex flex-col gap-1">
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => choice && onChoose(choice)}
            className="w-full cursor-pointer rounded-full py-3.5 text-[15px] font-extrabold transition-transform active:scale-[0.99] disabled:cursor-not-allowed"
            style={{
              background: canContinue ? t.brand : t.sunken,
              color: canContinue ? t.onBrand : t.faint,
            }}
          >
            {busy ? "Saving…" : FRIENDS_SHEET_COPY.continueLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDecline}
            className="w-full cursor-pointer py-2.5 text-[13px] font-bold disabled:opacity-50"
            style={{ color: t.muted }}
          >
            {FRIENDS_SHEET_COPY.declineLabel}
          </button>
        </div>
      }
    >
      <p className="text-[13.5px] font-semibold leading-[1.55]" style={{ color: t.muted }}>
        {FRIENDS_SHEET_COPY.body}
      </p>

      {/* Radio semantics by hand: a real fieldset of styled inputs would have
          meant fighting the browser's own control for the check mark, and this
          stays keyboard- and screen-reader-correct via role + aria-checked. */}
      <div className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label={FRIENDS_SHEET_COPY.title}>
        {FRIENDS_CHOICES.map((option) => {
          const on = choice === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setChoice(option.value)}
              className="flex cursor-pointer items-start gap-3 rounded-2xl p-3.5 text-left transition-colors"
              style={{
                background: on ? t.accentWash : t.sunken,
                border: `1px solid ${on ? t.brand : t.border}`,
              }}
            >
              <span
                className="mt-0.5 flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full"
                style={{
                  background: on ? t.brand : "transparent",
                  border: on ? "none" : `2px solid ${t.border}`,
                  color: t.onBrand,
                }}
                aria-hidden
              >
                {on && <IconCheck size={12} weight="bold" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-extrabold leading-[1.3]" style={{ color: t.text }}>
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[12px] font-semibold leading-[1.4]" style={{ color: t.muted }}>
                  {option.subtitle}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-[11.5px] font-semibold leading-[1.5]" style={{ color: t.faint }}>
        {FRIENDS_SHEET_COPY.smallPrint}
      </p>
    </SheetShell>
  );
}
