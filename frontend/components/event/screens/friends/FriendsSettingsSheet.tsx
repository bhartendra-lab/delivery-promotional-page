"use client";

/**
 * Surface 7 — everything a guest can change about their own participation.
 *
 * Four things, in the order they matter: who may add them, whether they hear
 * about requests, what other guests see of them, and the way out.
 *
 * "Stop sharing" is last and is the only destructive one, so it is the only one
 * that asks — and its confirm spells out all three consequences rather than
 * saying "are you sure?", because none of them is guessable from the label.
 */

import { useState } from "react";
import type { ClientTheme } from "@/lib/client-theme";
import { DISPLAY_NAME_MAX, FRIENDS_CHOICES } from "@/lib/friend-finder/copy";
import type { FriendChoice, FriendFinderBlock } from "@/lib/friend-finder/types";
import { IconCheck } from "@/components/ui/icons";
import { SheetShell } from "./SheetShell";

/** The third option, which the consent sheet renders as a text button rather
 *  than a card. Here it is a peer of the other two: this is the screen where
 *  changing your mind in either direction belongs. */
const NONE_OPTION = {
  value: "none" as const,
  label: "No thanks",
  subtitle: "People must ask you",
};

export function FriendsSettingsSheet({
  t,
  open,
  block,
  muted,
  busy,
  onClose,
  onChoose,
  onMute,
  onRename,
  onChangePhoto,
  onStop,
}: {
  t: ClientTheme;
  open: boolean;
  block: FriendFinderBlock;
  muted: boolean;
  busy: boolean;
  onClose: () => void;
  onChoose: (choice: FriendChoice) => void;
  onMute: (muted: boolean) => void;
  onRename: (name: string) => void;
  onChangePhoto: () => void;
  onStop: () => void;
}) {
  const [name, setName] = useState(block.display_name ?? "");
  const [confirmStop, setConfirmStop] = useState(false);

  const nameDirty = name.trim().length > 0 && name.trim() !== (block.display_name ?? "");
  // A guest who has stopped has `choice: "none"` written by the backend, but
  // that is a consequence of stopping rather than an answer they gave — so no
  // option is shown as chosen until they pick one again.
  const activeChoice: FriendChoice | null = block.stopped ? null : block.choice;

  return (
    <>
      <SheetShell t={t} open={open} onClose={onClose} title="Friends group settings">
        <Section t={t} title="Who can add you">
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Who can add you">
            {[...FRIENDS_CHOICES, NONE_OPTION].map((option) => {
              const on = activeChoice === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={busy}
                  onClick={() => onChoose(option.value)}
                  className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-2xl p-3 text-left disabled:opacity-60"
                  style={{
                    background: on ? t.accentWash : t.sunken,
                    border: `1px solid ${on ? t.brand : t.border}`,
                  }}
                >
                  <span
                    className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: on ? t.brand : "transparent",
                      border: on ? "none" : `2px solid ${t.border}`,
                      color: t.onBrand,
                    }}
                    aria-hidden
                  >
                    {on && <IconCheck size={11} weight="bold" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-extrabold" style={{ color: t.text }}>
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-[12px] font-semibold" style={{ color: t.muted }}>
                      {option.subtitle}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section t={t} title="Request messages">
          <button
            type="button"
            role="switch"
            aria-checked={!muted}
            disabled={busy}
            onClick={() => onMute(!muted)}
            className="flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-3 rounded-2xl p-3 text-left disabled:opacity-60"
            style={{ background: t.sunken, border: `1px solid ${t.border}` }}
          >
            <span className="min-w-0 text-[13px] font-semibold" style={{ color: t.text }}>
              Tell me on WhatsApp or email when someone asks
            </span>
            <span
              className="relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors"
              style={{ background: muted ? t.border : t.brand }}
              aria-hidden
            >
              <span
                className="absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all"
                style={{ left: muted ? 3 : 21 }}
              />
            </span>
          </button>
        </Section>

        <Section t={t} title="Edit my name and photo">
          <label className="block">
            <span className="sr-only">Your name, as friends will see it</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, DISPLAY_NAME_MAX))}
              autoComplete="name"
              maxLength={DISPLAY_NAME_MAX}
              placeholder="Your name, as friends will see it"
              className="min-h-[44px] w-full rounded-2xl px-4 text-[14px] font-semibold outline-none"
              style={{ background: t.sunken, border: `1px solid ${t.border}`, color: t.text }}
            />
          </label>
          {nameDirty && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRename(name.trim())}
              className="mt-2 min-h-[44px] w-full cursor-pointer rounded-full text-[13px] font-extrabold disabled:opacity-60"
              style={{ background: t.brand, color: t.onBrand }}
            >
              Save name
            </button>
          )}
          <button
            type="button"
            onClick={onChangePhoto}
            className="mt-2 min-h-[44px] w-full cursor-pointer rounded-full text-[13px] font-bold"
            style={{ background: t.sunken, color: t.text, border: `1px solid ${t.border}` }}
          >
            Change photo
          </button>
        </Section>

        <Section t={t} title="Stop sharing">
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmStop(true)}
            className="min-h-[44px] w-full cursor-pointer rounded-full text-[13px] font-extrabold disabled:opacity-60"
            style={{ background: t.errorSoft, color: t.error }}
          >
            Stop sharing
          </button>
        </Section>
      </SheetShell>

      {confirmStop && (
        <SheetShell
          t={t}
          open
          onClose={() => setConfirmStop(false)}
          title="Stop sharing?"
          desktopWidth={420}
        >
          <p className="text-[13px] font-semibold leading-[1.55]" style={{ color: t.muted }}>
            You will leave everyone&rsquo;s groups, your face picture will be hidden, and nobody can ask
            to add you. You can join again anytime.
          </p>
          <div className="mt-4 flex flex-col gap-2 pb-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirmStop(false);
                onStop();
              }}
              className="min-h-[44px] w-full cursor-pointer rounded-full text-[14px] font-extrabold disabled:opacity-60"
              style={{ background: t.error, color: "#fff" }}
            >
              Stop sharing
            </button>
            <button
              type="button"
              onClick={() => setConfirmStop(false)}
              className="min-h-[44px] w-full cursor-pointer rounded-full text-[13.5px] font-bold"
              style={{ background: t.sunken, color: t.text, border: `1px solid ${t.border}` }}
            >
              Keep sharing
            </button>
          </div>
        </SheetShell>
      )}
    </>
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
