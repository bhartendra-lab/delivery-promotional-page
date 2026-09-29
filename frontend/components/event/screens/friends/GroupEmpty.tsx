"use client";

/**
 * My People with nothing on screen, which happens for four different reasons
 * and must not say the same thing for all of them.
 *
 *   No selfie yet: there is no set of "photos you are in" to search with, so
 *     the only useful thing is the scan. The sharing preference is asked after
 *     it, on the next visit to this tab.
 *   Still preparing: this guest's own face set is being stored server-side, a
 *     sub-second gap after their own search.
 *   Nobody added: no one in the guest's group at all — not connected, not
 *     asked, not declined. Adding people is the whole point of the tab.
 *   People added, feed empty: they have added people but share no photos with
 *     them, whether because those people have not answered yet or because
 *     they genuinely are not in a photo together. Both read the same, on
 *     purpose: the answer is the same button.
 */

import type { ClientTheme } from "@/lib/client-theme";
import { IconScanFace, IconUsers } from "@/components/ui/icons";

export function GroupEmpty({
  t,
  addedCount,
  preparing,
  needsSelfie,
  onAddMore,
  onScan,
}: {
  t: ClientTheme;
  /** People in this guest's group in any state: `in_group`, `requested` or
   *  `declined`. Zero is the "nobody added" state. */
  addedCount: number;
  /** The guest's own face set is still being computed server-side. */
  preparing: boolean;
  /** No selfie, so nothing to search with. */
  needsSelfie: boolean;
  /** "Add more people". The surface decides whether that asks the sharing
   *  preference first (still unanswered) or goes straight to Manage. */
  onAddMore: () => void;
  onScan: () => void;
}) {
  if (needsSelfie) {
    return (
      <Shell t={t} icon={<IconScanFace size={24} />} body="Scan your face to find your people">
        <Cta t={t} onClick={onScan}>
          Scan my face
        </Cta>
      </Shell>
    );
  }
  if (preparing) {
    return <Shell t={t} icon={<IconUsers size={24} weight="fill" />} body="Just a moment while we find your photos." />;
  }
  return (
    <Shell
      t={t}
      icon={<IconUsers size={24} weight="fill" />}
      body={
        addedCount === 0
          ? "Add some people to see common photos with them."
          : "No common photos found with your selected people."
      }
    >
      <Cta t={t} onClick={onAddMore}>
        Add more people
      </Cta>
    </Shell>
  );
}

function Shell({
  t,
  icon,
  body,
  children,
}: {
  t: ClientTheme;
  icon: React.ReactNode;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-8 py-16 text-center">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: t.accentWash, color: t.brand }}
        aria-hidden
      >
        {icon}
      </span>
      <p className="max-w-[320px] text-[13.5px] font-semibold leading-[1.5]" style={{ color: t.muted }}>
        {body}
      </p>
      {children}
    </div>
  );
}

function Cta({ t, onClick, children }: { t: ClientTheme; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 min-h-[44px] w-full max-w-[280px] cursor-pointer rounded-full text-[13px] font-extrabold"
      style={{ background: t.brand, color: t.onBrand }}
    >
      {children}
    </button>
  );
}
