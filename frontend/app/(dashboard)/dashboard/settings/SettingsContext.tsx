"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  getCompanyDetails,
  updateCompanyDetails,
  type CompanyUpdateInput,
} from "@/lib/api";
import { setCompany } from "@/lib/auth";
import type { Company } from "@/lib/types";
import type { SaveState } from "./SettingsUI";

/**
 * Shared data layer for the Settings area. The company is fetched once for the
 * whole sectioned area (not per section route) so navigating between sections
 * doesn't refetch. Each section sends only its changed fields through `save`,
 * which reuses the partial-diff update endpoint and keeps the cached company
 * (used by the Topbar/Sidebar) in sync.
 */
type SettingsState = {
  company: Company;
  /** Persist a partial update; resolves with the refreshed company. */
  save: (payload: CompanyUpdateInput) => Promise<Company>;
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

  if (load.status !== "ready") return <>{children(load)}</>;

  return (
    <SettingsCtx.Provider value={{ company: load.company, save }}>
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
 * Per-section save state machine. Handles the saving/saved/error transitions,
 * the transient "saved" confirmation, and the no-op short-circuit when nothing
 * changed — so each section page only has to build its diff payload.
 */
export function useSectionSave() {
  const { save } = useSettings();
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
