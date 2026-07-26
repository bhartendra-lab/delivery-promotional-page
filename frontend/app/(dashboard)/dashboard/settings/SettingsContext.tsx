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
import type { Company, UserProfile } from "@/lib/types";
import type { SaveState } from "./SettingsUI";

/**
 * Shared data layer for the Settings area. The company is fetched once for the
 * whole sectioned area (not per section route) so navigating between sections
 * doesn't refetch. Each section sends only its changed fields through `save`,
 * which reuses the partial-diff update endpoint and keeps the cached company
 * (used by the Topbar/Sidebar) in sync.
 *
 * The personal profile is fetched alongside it, best-effort: it's not yet
 * backed by a real endpoint (see `getUserProfile` in `lib/api.ts`), so a
 * failure leaves `userProfile` null instead of blocking the rest of Settings.
 * Studio Identity's "same as personal" checkboxes and the Personal
 * Information page both read/write it from here.
 */
type SettingsState = {
  company: Company;
  userProfile: UserProfile | null;
  /** Persist a partial company update; resolves with the refreshed company. */
  save: (payload: CompanyUpdateInput) => Promise<Company>;
  /** Persist a partial profile update; resolves with the refreshed profile. */
  saveProfile: (payload: UserProfileUpdateInput) => Promise<UserProfile>;
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
    // Best-effort — see the type-level note on `getUserProfile`. A missing
    // or failing endpoint just leaves userProfile null; nothing here should
    // ever surface as a Settings-wide load error.
    getUserProfile()
      .then((res) => {
        if (active) setUserProfile(res.user);
      })
      .catch(() => {});
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

  if (load.status !== "ready") return <>{children(load)}</>;

  return (
    <SettingsCtx.Provider value={{ company: load.company, userProfile, save, saveProfile }}>
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
