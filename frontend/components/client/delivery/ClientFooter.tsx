"use client";

import type { KvData } from "@/lib/types";
import type { Tokens } from "./tokens";

type Props = {
  data: KvData;
  tokens: Tokens;
};

/**
 * "Delivered with care by {studio} / Powered by vyavasth" footer.
 * Reference HTML lines 708–724.
 */
export function ClientFooter({ data, tokens }: Props) {
  const studioName = data.company_name ?? "your studio";
  return (
    <footer
      className="mt-4 px-6 pb-14 pt-7 text-center"
      style={{ borderTop: `1px solid ${tokens.border}` }}
    >
      <div
        className="text-[11px] leading-[1.85]"
        style={{ color: tokens.faint }}
      >
        <div>Delivered with care by {studioName}</div>
        <div>
          Powered by{" "}
          <a
            href="https://vyavasth.in"
            target="_blank"
            rel="noreferrer"
            className="font-semibold"
            style={{ color: tokens.muted }}
          >
            vyavasth
          </a>
        </div>
      </div>
    </footer>
  );
}
