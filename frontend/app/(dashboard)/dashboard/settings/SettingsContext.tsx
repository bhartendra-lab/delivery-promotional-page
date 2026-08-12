"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  getCompanyDetails,
  updateCompanyDetails,
  getUserProfile,
  updateUserProfile,
  type CompanyUpdateInput,
  type UserProfileUpdateInput,
} from "@/lib/api";
import { setCompany } from "@/lib/auth";
import { useReminders } from "@/components/dashboard/RemindersProvider";
import type { Company, UserProfile } from "@/lib/types";
import type { SaveState } from "./SettingsUI";

/**
 * Shared data layer for the Settings area. The company is fetched once for the
 * whole sectioned area (not per section route) so navigating between sections
 * doesn't refetch. Each section sends only its changed fields through `save`,
 * which reuses the partial-diff update endpoint and keeps the cached company
 * (used by the Topbar/Sidebar) in sync.
 *
 * The personal profile is fetched alongside it. Studio Identity's "same as
 * login email" checkbox treats a slow/failed profile fetch as non-blocking —
 * it only powers one optional shortcut — so it reads `userProfile` directly
 * and tolerates null. The Personal Information page edits the profile itself,
 * so it must never render (or seed its form) against a null/stale profile;
 * it gates on `profileLoad` instead of `userProfile` being non-null, so a
 * slow fetch shows a skeleton and a failed one shows an error rather than
 * silently mounting with blank fields.
 */
type ProfileLoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready" };

type SettingsState = {
  company: Company;
  userProfile: UserProfile | null;
  profileLoad: ProfileLoadState;
  /** Persist a partial company update; resolves with the refreshed company. */
  save: (payload: CompanyUpdateInput) => Promise<Company>;
  /** Persist a partial profile update; resolves with the refreshed profile. */
  saveProfile: (payload: UserProfileUpdateInput) => Promise<UserProfile>;
  /**
   * Sync an already-fetched Company into this context without a network
   * round-trip — for flows that update the company through their own
   * dedicated endpoint (e.g. ChangeWhatsappModal's OTP verify) rather than
   * `save`/updateCompanyDetails. Does NOT touch the lib/auth cache; callers
   * that also need the Topbar/Sidebar to pick up the change must call
   * `setCompany` from `@/lib/auth` themselves.
   */
  setCompanyState: (company: Company) => void;
  /** True while the currently-mounted section has unsaved local edits. Only
   *  one section is ever mounted at a time (route-based), so a single flag
   *  is enough — see useReportDirty. Read by SettingsNav (to guard in-app
   *  navigation) and SettingsChrome (to guard tab close/reload). */
  isDirty: boolean;
  reportDirty: (dirty: boolean) => void;
};

const SettingsCtx = createContext<SettingsState | null>(null);

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; company: Company };

export function SettingsProvider({
  children,
}: {
  children: (load: LoadState) => React.ReactNode;
}) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoad, setProfileLoad] = useState<ProfileLoadState>({ status: "loading" });
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    let active = true;
    getCompanyDetails()
      .then((res) => {
        if (active) setLoad({ status: "ready", company: res.company });
      })
      .catch((err) => {
        if (active)
          setLoad({
            status: "error",
            message: err instanceof Error ? err.message : "Failed to load",
          });
      });
    getUserProfile()
      .then((res) => {
        if (!active) return;
        setUserProfile(res.user);
        setProfileLoad({ status: "ready" });
      })
      .catch((err) => {
        if (active)
          setProfileLoad({
            status: "error",
            message: err instanceof Error ? err.message : "Failed to load your profile.",
          });
      });
    return () => {
      active = false;
    };
  }, []);

  async function save(payload: CompanyUpdateInput): Promise<Company> {
    const res = await updateCompanyDetails(payload);
    setCompany(res.company);
    setLoad({ status: "ready", company: res.company });
    return res.company;
  }

  async function saveProfile(payload: UserProfileUpdateInput): Promise<UserProfile> {
    const res = await updateUserProfile(payload);
    setUserProfile(res.user);
    return res.user;
  }

  function setCompanyState(company: Company) {
    setLoad({ status: "ready", company });
  }

  if (load.status !== "ready") return <>{children(load)}</>;

  return (
    <SettingsCtx.Provider
      value={{
        company: load.company,
        userProfile,
        profileLoad,
        save,
        saveProfile,
        setCompanyState,
        isDirty,
        reportDirty: setIsDirty,
      }}
    >
      {children(load)}
    </SettingsCtx.Provider>
  );
}

export function useSettings(): SettingsState {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

/**
 * Same as useSettings, but returns null instead of throwing when there's no
 * provider in the tree yet — SettingsNav renders unconditionally inside
 * SettingsChrome, including while the company is still loading/erroring,
 * during which SettingsProvider renders bare `children(load)` without
 * mounting SettingsCtx.Provider at all (see the `load.status !== "ready"`
 * early return above).
 */
export function useSettingsMaybe(): SettingsState | null {
  return useContext(SettingsCtx);
}

/**
 * Reports a section's local `dirty` flag up to SettingsContext so navigation
 * guards (SettingsNav's Link intercept, SettingsChrome's beforeunload) know
 * whether there's anything to lose. Clears itself on unmount, so navigating
 * away (once confirmed, or via a route that doesn't need confirming) always
 * leaves the next section starting clean.
 *
 * Reads the context directly (not via useSettings) and no-ops when there
 * isn't one, rather than throwing — `BillingDetailsForm` calls this too, and
 * it's reused inside UpgradeModal, which is NOT rendered under
 * SettingsProvider. This lets it report correctly when mounted in Settings
 * and do nothing everywhere else, with no caller-side branching.
 */
export function useReportDirty(dirty: boolean) {
  const ctx = useContext(SettingsCtx);
  useEffect(() => {
    if (!ctx) return;
    ctx.reportDirty(dirty);
    return () => ctx.reportDirty(false);
  }, [ctx, dirty]);
}

/**
 * Shared saving/saved/error state machine behind both `useSectionSave` and
 * `useProfileSectionSave` — handles the transient "saved" confirmation and
 * clears its timer on unmount.
 */
function useSaveState() {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  function flashSaved() {
    setSaveState("saved");
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaveState("idle"), 3000);
  }

  return { saveState, setSaveState, errorMsg, setErrorMsg, flashSaved };
}

/**
 * Per-section save state for Company-backed sections (Studio Identity,
 * Social Links, Studio Logo). Each section only has to build its diff
 * payload; this handles the no-op short-circuit and the saving/saved/error
 * transitions.
 */
export function useSectionSave() {
  const { save } = useSettings();
  const { saveState, setSaveState, errorMsg, setErrorMsg, flashSaved } = useSaveState();
  const { refresh: refreshReminders } = useReminders();

  /** Returns true when the save succeeded (or was a no-op), false on error. */
  async function submit(payload: CompanyUpdateInput): Promise<boolean> {
    if (Object.keys(payload).length === 0) {
      flashSaved();
      return true;
    }
    setSaveState("saving");
    setErrorMsg(null);
    try {
      await save(payload);
      flashSaved();
      // Studio Identity (logo, Google Business) and Social Links both save
      // through here, and both can resolve a branding-readiness checkpoint —
      // refresh so a studio returning to an event sees it reflected instead
      // of the stale snapshot RemindersProvider fetched once at dashboard
      // mount. Best-effort; never blocks the save's own success state.
      void refreshReminders();
      return true;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save");
      setSaveState("error");
      return false;
    }
  }

  return { saveState, errorMsg, submit };
}

/** Same as `useSectionSave`, for the profile-backed Personal Information page. */
export function useProfileSectionSave() {
  const { saveProfile } = useSettings();
  const { saveState, setSaveState, errorMsg, setErrorMsg, flashSaved } = useSaveState();

  async function submit(payload: UserProfileUpdateInput): Promise<boolean> {
    if (Object.keys(payload).length === 0) {
      flashSaved();
      return true;
    }
    setSaveState("saving");
    setErrorMsg(null);
    try {
      await saveProfile(payload);
      flashSaved();
      return true;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save");
      setSaveState("error");
      return false;
    }
  }

  return { saveState, errorMsg, submit };
}
