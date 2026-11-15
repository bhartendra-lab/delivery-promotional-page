"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { confirmStudioDeletion, requestStudioDeletionCode, type StudioDeletionAccepted } from "@/lib/api";
import { clearCompany, clearToken } from "@/lib/auth";
import {
  deletionDoneMessage,
  STUDIO_DELETION_CODE_SENT,
  STUDIO_DELETION_CONFIRM,
  STUDIO_DELETION_COPY,
  STUDIO_DELETION_HEADINGS,
  STUDIO_DELETION_SCOPE_LINE,
  STUDIO_DELETION_TITLE,
  type StudioDeletionScope,
} from "@/lib/studio-account-deletion";
import { AlertIcon, Card } from "../SettingsUI";

/**
 * Personal Information → Delete account (BE-02). The same code flow as the
 * app and the public page: "Send code" (the answer says the scope: the whole
 * studio for an admin, only this account otherwise, and the modal then says
 * exactly what goes), the code, the confirm, then the accepted state and a
 * sign out. Copy from lib/studio-account-deletion.ts.
 */
export function DeleteAccountCard({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<StudioDeletionScope | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<StudioDeletionAccepted | null>(null);

  function close() {
    if (busy) return;
    if (done) return signOut();
    setOpen(false);
    setScope(null);
    setCode("");
    setError(null);
  }
  function signOut() {
    clearToken();
    clearCompany();
    router.replace("/login");
  }
  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await requestStudioDeletionCode();
      setScope(res.scope);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      setDone(await confirmStudioDeletion(code, "dashboard"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const doneCopy = done ? deletionDoneMessage(done.scope, done.purge_at) : null;
  const copy = scope ? STUDIO_DELETION_COPY[scope] : null;
  const danger =
    "brand-focus inline-flex h-10 items-center justify-center rounded-lg bg-[var(--color-brand-danger)] px-4 text-[13.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";
  const plain =
    "brand-focus inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13.5px] font-medium text-[var(--color-brand-ink)] disabled:opacity-50";

  return (
    <Card title="Delete account" icon={<AlertIcon />}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-[220px] flex-1 text-[13px] leading-relaxed text-[var(--color-brand-muted)]">
          An admin deletes the whole studio; anyone else deletes only their own account. A code is sent to your login email first.
        </p>
        <button type="button" className={danger} onClick={() => setOpen(true)}>
          Delete account
        </button>
      </div>

      <Modal
        open={open}
        onClose={close}
        title={scope ? STUDIO_DELETION_TITLE[scope] : "Delete account"}
        size="sm"
        dismissOnBackdrop={false}
        footer={
          <div className="flex items-center justify-end gap-2.5">
            {done ? (
              <button type="button" className={plain} onClick={signOut}>
                Sign out
              </button>
            ) : (
              <>
                <button type="button" className={plain} onClick={close} disabled={busy}>
                  Cancel
                </button>
                {scope ? (
                  <button type="button" className={danger} onClick={confirm} disabled={busy || code.length !== 6}>
                    {busy ? "Deleting…" : STUDIO_DELETION_CONFIRM[scope].action}
                  </button>
                ) : (
                  <button type="button" className={danger} onClick={send} disabled={busy}>
                    {busy ? "Sending…" : "Send code"}
                  </button>
                )}
              </>
            )}
          </div>
        }
      >
        {doneCopy ? (
          <div className="space-y-2 text-[14px] leading-relaxed text-[var(--color-brand-muted)]" role="status">
            <p className="font-semibold text-[var(--color-brand-ink)]">{doneCopy.title}</p>
            <p>{doneCopy.body}</p>
          </div>
        ) : (
          <div className="space-y-4 text-[13.5px] leading-relaxed text-[var(--color-brand-muted)]">
            {!scope ? (
              <p>We will email a 6-digit code to {email || "your login email"}. Admins delete the whole studio; anyone else deletes only their own account.</p>
            ) : (
              <>
                <p className="font-semibold text-[var(--color-brand-ink)]">{STUDIO_DELETION_SCOPE_LINE[scope]}</p>
                <p>
                  <b className="text-[var(--color-brand-ink)]">{STUDIO_DELETION_HEADINGS.deletes}</b> {copy!.deletes}
                </p>
                <p>
                  <b className="text-[var(--color-brand-ink)]">{STUDIO_DELETION_HEADINGS.keeps}</b> {copy!.keeps}
                </p>
                <p>
                  <b className="text-[var(--color-brand-ink)]">{STUDIO_DELETION_HEADINGS.howLong}</b> {copy!.howLong}
                </p>
                <p>{STUDIO_DELETION_CODE_SENT(email || "your login email")}</p>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-label="Code"
                  className="brand-focus h-11 w-full rounded-lg border border-[var(--color-brand-border)] bg-white px-3 font-mono text-[16px] tracking-[0.3em] text-[var(--color-brand-ink)] outline-none"
                />
              </>
            )}
            {error && (
              <p className="text-[12.5px] font-semibold text-[var(--color-brand-danger)]" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}
