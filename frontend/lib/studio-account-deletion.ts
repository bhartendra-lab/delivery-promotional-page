/**
 * Studio account deletion (BE-02): the words every surface shows — the public
 * page (app/delete-studio-account), the dashboard's Personal Information and
 * the Vyavasth Studio app (synced through core:sync). Pure: no React, no API.
 *
 * Who deletes what is the server's rule (an admin deletes the whole studio,
 * anyone else only their own account); the signed-in code request answers the
 * scope, so a screen can explain exactly what is about to happen.
 */

export type StudioDeletionScope = "studio" | "user";

/** The server's rule, for a screen that already knows the role (the app's session). */
export const deletionScopeForRole = (role: string | null | undefined): StudioDeletionScope => (role === "admin" ? "studio" : "user");

export const STUDIO_DELETION_TITLE: Record<StudioDeletionScope, string> = {
  studio: "Delete studio account",
  user: "Delete my account",
};

export type StudioDeletionCopy = { deletes: string; keeps: string; howLong: string };

export const STUDIO_DELETION_HEADINGS = {
  deletes: "What we delete:",
  keeps: "What we keep, and why:",
  howLong: "How long:",
} as const;

export const STUDIO_DELETION_COPY: Record<StudioDeletionScope, StudioDeletionCopy> = {
  studio: {
    deletes:
      "Your whole studio: every event with its photos, videos and archives, guest lists, selfies and face data, likes and selections, QR codes, watermarks and logos, your custom domain, and every team member's account.",
    keeps:
      "Invoices and payment, renewal and accounting records, which the law requires us to keep; the record of consents given and withdrawn; and records of WhatsApp messages sent (billing). None of them holds your photos.",
    howLong:
      "Straight away nobody in your studio can sign in, your galleries go offline, uploads stop and auto-renew is turned off. Everything is deleted after 30 days. To change your mind before then, contact support.",
  },
  user: {
    deletes: "Your account: your sign-in and your profile (name, email and phone). The studio keeps the events and photos you worked on.",
    keeps: "The studio's own records of the work you did, and the consent and WhatsApp records the law requires us to keep.",
    howLong: "You are signed out straight away and cannot sign in again. Your account is deleted after 30 days. To change your mind before then, contact support.",
  },
};

/** The public page, before the code says which account it is. */
export const STUDIO_DELETION_WEB_INTRO =
  "Enter the email you sign in to Vyavasth with. If you are your studio's admin, this deletes the whole studio; otherwise it deletes only your own account.";

export const STUDIO_DELETION_SCOPE_LINE: Record<StudioDeletionScope, string> = {
  studio: "You are the studio's admin, so this deletes the whole studio for everyone in it.",
  user: "This deletes only your own account. Your studio and its events stay.",
};

export const STUDIO_DELETION_CODE_SENT = (email: string) => `We sent a 6-digit code to ${email}.`;
export const STUDIO_DELETION_CODE_SENT_WEB = "If that address has a studio account, we sent it a 6-digit code.";

/** The final confirm: what happens the moment it is pressed. */
export const STUDIO_DELETION_CONFIRM: Record<StudioDeletionScope, { title: string; body: string; action: string }> = {
  studio: {
    title: "Delete your studio?",
    body: "Nobody in your studio will be able to sign in, and your galleries go offline now. Everything is deleted after 30 days.",
    action: "Delete studio",
  },
  user: {
    title: "Delete your account?",
    body: "You will be signed out now and your account is deleted after 30 days. Your studio keeps your work.",
    action: "Delete my account",
  },
};

/** The purge date as the studio reads it (IST, "12 Dec 2026"). */
export function purgeDateLabel(purgeAtMs: number): string {
  return new Date(purgeAtMs).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

/** After the request is accepted. */
export function deletionDoneMessage(scope: StudioDeletionScope, purgeAtMs: number | null | undefined): { title: string; body: string } {
  const when = purgeAtMs ? `on ${purgeDateLabel(purgeAtMs)}` : "after 30 days";
  return {
    title: scope === "studio" ? "Your studio account is being deleted." : "Your account is being deleted.",
    body: `Everything listed is deleted ${when}. To change your mind before then, contact support.`,
  };
}
