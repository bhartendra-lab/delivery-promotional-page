"use client";

import { useEffect } from "react";
import { sendPendingSignup } from "@/lib/signup-attribution";

/** Retries a sign up report that did not get through. Dashboard layout only; renders nothing. */
export function SignupReport() {
  useEffect(() => {
    void sendPendingSignup();
  }, []);
  return null;
}
