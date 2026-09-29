"use client";

/**
 * Everything a guest can change about their own participation.
 *
 * Two things now: who may search common photos with them, and the picture
 * other guests see. It opens from the gear inside Manage my people rather than
 * from the gallery, so the settings sit beside the list they act on.
 *
 * The question is titled exactly as the preference sheet asks it, with the
 * same bare options, so a Guest recognises the answer they gave.
 *
 * WHERE "STOP SHARING" WENT. There is no withdrawal button, and no longer a
 * line spelling out the two-step path either (the ff-v1.2 notice says only
 * "You can change this anytime"). A guest who wants out chooses "Only people I
 * choose" and removes everyone from their list, which is on the screen this
 * sheet opens over. The old Stop sharing wrote a `stopped_at` stamp that every
 * read then had to special-case, and the one thing it bought over the two-step
 * path was a confirm dialog.
 */

import type { ClientTheme } from "@/lib/client-theme";
import { FRIENDS_CHOICES, FRIENDS_SHEET_COPY } from "@/lib/friend-finder/copy";
import type { FriendChoice, FriendFinderBlock } from "@/lib/friend-finder/types";
import { IconCheck } from "@/components/ui/icons";
import { SheetShell } from "./SheetShell";

export function FriendsSettingsSheet({
  t,
  open,
  block,
  busy,
  onClose,
  onChoose,
  onChangePhoto,
}: {
  t: ClientTheme;
  open: boolean;
  block: FriendFinderBlock;
  busy: boolean;
  onClose: () => void;
  onChoose: (choice: FriendChoice) => void;
  onChangePhoto: () => void;
}) {
  return (
    <SheetShell t={t} open={open} onClose={onClose} title={FRIENDS_SHEET_COPY.title}>
      <section className="mb-5 mt-1">
        <div className="flex flex-col gap-2" role="radiogroup" aria-label={FRIENDS_SHEET_COPY.title}>
          {FRIENDS_CHOICES.map((option) => {
            const on = block.choice === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={busy}
                onClick={() => onChoose(option.value)}
                className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-2xl p-3 text-left disabled:opacity-60"
                style={{
                  background: on ? t.accentWash : t.sunken,
                  border: `1px solid ${on ? t.brand : t.border}`,
                }}
              >
                <span
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: on ? t.brand : "transparent",
                    border: on ? "none" : `2px solid ${t.border}`,
                    color: t.onBrand,
                  }}
                  aria-hidden
                >
                  {on && <IconCheck size={11} weight="bold" />}
                </span>
                <span className="min-w-0 flex-1 text-[13.5px] font-extrabold" style={{ color: t.text }}>
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <Section t={t} title="My display photo">
        {/* The NAME is not editable here. A Guest has one name — the one they
            gave on the lounge's intake sheet, or their Google name — and it is
            what the Studio's guest list, the gallery and this directory all
            show. A second name settable only here would mean the Studio knows
            them as one person while the wedding sees another. */}
        <button
          type="button"
          onClick={onChangePhoto}
          className="min-h-[44px] w-full cursor-pointer rounded-full text-[13px] font-bold"
          style={{ background: t.sunken, color: t.text, border: `1px solid ${t.border}` }}
        >
          Change photo
        </button>
      </Section>
    </SheetShell>
  );
}

function Section({ t, title, children }: { t: ClientTheme; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3
        className="mb-2 text-[11.5px] font-extrabold uppercase tracking-[0.06em]"
        style={{ color: t.faint }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}
