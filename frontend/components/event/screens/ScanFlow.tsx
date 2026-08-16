"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, putBlobToPresignedUrl } from "@/lib/api";
import { presignGuestUploads, recordConsent, validateSelfie } from "@/lib/guest-api";
import { reportBug } from "@/lib/report-bug";
import { AmbientBackdrop } from "../AmbientBackdrop";
import { useEventTheme } from "../EventThemeContext";
import { POLICY_VERSION, usePolicy } from "../policy/PolicyContext";
import {
  IconScanFace,
  IconCameraOff,
  IconBrowser,
  IconCopy,
  IconSmiley,
  IconCheck,
  IconLock,
} from "@/components/ui/icons";

type Phase = "consent" | "processing" | "error";

/**
 * Screen 2–3 · Face scan — consent + live camera merged into one screen, then
 * upload + validate. Themed to the event's style_variant. The selfie is
 * captured as JPEG and uploaded direct to R2 via the presign endpoint, then
 * validated against the face-search worker (retake on failure). The actual
 * face search — and the matched-photos reveal — happens after handoff, in the
 * Lounge (`LoungeGallery`'s own mediaIds-resolution effect), not here.
 */
export function ScanFlow({
  guestName,
  onComplete,
}: {
  guestName?: string;
  /** Called once the selfie is uploaded and validated (search + match happen
   *  after handoff, in the Lounge). `selfieId` seeds `session.selfie_id` so
   *  the Lounge can run its own search. */
  onComplete: (selfieUrl: string, selfieId: string) => void;
}) {
  const { theme: t, event, uniqueIdentifier } = useEventTheme();
  const { openPolicy } = usePolicy();
  const bookingId = event.booking_id;

  const [phase, setPhase] = useState<Phase>("consent");
  const [agreed, setAgreed] = useState(false);
  const [pct, setPct] = useState(0);
  const [target, setTarget] = useState(0);
  const [status, setStatus] = useState("Uploading your selfie…");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // Camera permission gate: a blocking pop-up shown over the camera screen when
  // the live camera can't start. Camera access is strictly required to proceed.
  const [camGate, setCamGate] = useState<CamGate>(null);
  const [camAttempt, setCamAttempt] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Smoothly climb the displayed percentage toward the current stage target.
  useEffect(() => {
    const id = setInterval(() => {
      setPct((p) => (p < target ? Math.min(p + 2, target) : p));
    }, 40);
    return () => clearInterval(id);
  }, [target]);

  // Live camera once consent is given (ticking the checkbox starts it); stop
  // tracks when consent is withdrawn, phase moves on, or on unmount. Re-runs
  // on each retry (camAttempt) so the gate's "try again" can re-request, and
  // again on a retake (phase drops back to "consent" with `agreed` still true).
  useEffect(() => {
    if (!agreed || phase !== "consent") return;
    let cancelled = false;
    let stream: MediaStream | null = null;

    const fail = (reason: CameraFailReason, err?: unknown) => {
      if (cancelled) return;
      const name = err instanceof Error ? err.name : undefined;
      // Raise the blocking permission pop-up — there is no way past it but to
      // grant camera access (or switch browsers, for the unsupported case).
      setCamGate(reason === "unsupported" ? { kind: "unsupported" } : { kind: "blocked", reason, name });
      // If this bug appears again, report it — covers the Realme/ColorOS case
      // where the permission prompt is suppressed and the camera never starts.
      void reportCameraFailure(reason, err, { event: uniqueIdentifier, booking: bookingId });
    };

    (async () => {
      // getUserMedia only exists in a secure context; it's undefined on plain
      // HTTP and in stripped-down in-app webviews (Instagram / WhatsApp browser).
      if (!navigator.mediaDevices?.getUserMedia) {
        fail("unsupported");
        return;
      }
      try {
        // Race a timeout so a suppressed/disabled permission prompt that never
        // resolves can't trap the guest on a black screen (the reported bug).
        stream = await getUserMediaWithTimeout({ video: { facingMode: "user" }, audio: false }, 12_000);
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        setCamGate(null); // camera is live — dismiss any pop-up from a prior try
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        fail(err instanceof Error && err.name === "TimeoutError" ? "timeout" : "denied", err);
      }
    })();
    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    };
  }, [agreed, phase, camAttempt, uniqueIdentifier, bookingId]);

  function resetProgress() {
    setPct(0);
    setTarget(0);
    setStatus("Uploading your selfie…");
  }

  async function runPipeline(blob: Blob, previewUrl: string) {
    setPreview(previewUrl);
    setPhase("processing");
    resetProgress();
    try {
      setTarget(35);
      setStatus("Uploading your selfie…");
      const selfieId = crypto.randomUUID();
      const { uploads } = await presignGuestUploads(uniqueIdentifier, bookingId, [
        { filename: `${selfieId}.jpeg`, content_type: "image/jpeg" },
      ]);
      const up = uploads[0];
      await putBlobToPresignedUrl(up.presigned_url, blob, "image/jpeg");

      setTarget(90);
      setStatus("Checking your photo…");
      await validateSelfie(uniqueIdentifier, { selfie_id: selfieId, selfie_url: up.public_url });

      // Hand off immediately — the face search (and the "Found N photos"
      // moment) now happens in the Lounge, not here.
      onComplete(up.public_url, selfieId);
    } catch (err) {
      setErrorMsg(toFriendlyError(err));
      setPhase("error");
    }
  }

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const maxDim = 1080;
    const scale = Math.min(1, maxDim / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setErrorMsg("Couldn’t capture the photo. Please retake.");
          setPhase("error");
          return;
        }
        void runPipeline(blob, canvas.toDataURL("image/jpeg", 0.6));
      },
      "image/jpeg",
      0.8,
    );
  }

  /**
   * Ticking the consent checkbox both records the audit-trail proof and starts
   * the camera (the camera-starting effect above is gated on `agreed`).
   * Fire-and-forget: the tick itself is the consent, so a logging failure must
   * never block the scan (we report it instead). Un-ticking stops the camera;
   * re-ticking records consent again, which is fine — it's genuinely a fresh
   * consent event.
   */
  function toggleAgreed() {
    setAgreed((a) => {
      const next = !a;
      if (next) {
        void recordConsent(uniqueIdentifier, { policy_version: POLICY_VERSION }).catch((err) => {
          void reportBug("Face scan — consent log failed", {
            Event: uniqueIdentifier,
            Booking: bookingId,
            "Error message": err instanceof Error ? err.message : String(err),
          });
        });
      }
      return next;
    });
  }

  /* ── views ──────────────────────────────────────────────────────────── */

  if (phase === "consent") {
    return (
      <Shell guestName={guestName}>
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-7">
          {/* viewfinder — inert placeholder pre-consent, live once agreed */}
          <div className="relative">
            {agreed && <span className="fx-glow-pulse absolute -inset-3 rounded-[32px]" style={{ background: t.accentWash, filter: "blur(22px)" }} />}
            <div className="relative overflow-hidden" style={{ width: 248, height: 300, borderRadius: 26, background: t.viewer, boxShadow: t.shadow }}>
              {agreed ? (
                <>
                  <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" style={{ transform: "scaleX(-1)" }} />
                  <Brackets />
                </>
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <IconSmiley size={40} style={{ color: t.faint }} />
                </div>
              )}
            </div>
          </div>

          <div className="fx-blur-in flex flex-col gap-1.5 text-center">
            <h1 className="text-[24px] font-extrabold leading-[1.2] tracking-[-0.02em]" style={{ color: t.text }}>
              Let’s find you in the photos
            </h1>
            <p className="text-[13px] font-semibold leading-[1.5]" style={{ color: t.muted }}>
              {agreed ? "Center your face in the frame, then capture." : "Good light, face centered, no sunglasses."}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-6 pb-2">
          {/* consent checkbox — directly under the viewfinder; ticking it starts the camera */}
          <button
            type="button"
            onClick={toggleAgreed}
            className="flex cursor-pointer items-start gap-3 rounded-2xl p-3.5 text-left transition-colors"
            style={{ background: agreed ? t.accentWash : t.card, border: `1px solid ${agreed ? t.brand : t.border}` }}
          >
            <Checkbox checked={agreed} />
            <span className="text-[12.5px] font-semibold leading-[1.45]" style={{ color: t.text }}>
              I agree to let Vyavasth use my selfie to match my face to these photos and keep it on my gallery profile.
            </span>
          </button>

          {/* Consent moment: the three policies, inline + underlined. */}
          <p className="px-1 text-center text-[11px] font-semibold leading-[1.5]" style={{ color: t.faint }}>
            By continuing you agree to our{" "}
            <button type="button" onClick={() => openPolicy("terms")} className="underline underline-offset-2" style={{ color: t.muted }}>
              Terms of Service
            </button>
            ,{" "}
            <button type="button" onClick={() => openPolicy("privacy")} className="underline underline-offset-2" style={{ color: t.muted }}>
              Privacy Policy
            </button>{" "}
            &amp;{" "}
            <button type="button" onClick={() => openPolicy("cookies")} className="underline underline-offset-2" style={{ color: t.muted }}>
              Cookies
            </button>
            .
          </p>

          <button
            type="button"
            onClick={capture}
            disabled={!agreed}
            className="cta-shine flex w-full cursor-pointer items-center justify-center gap-2 rounded-full py-4 text-[15px] font-extrabold transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
            style={{
              background: agreed ? t.brand : t.sunken,
              color: agreed ? t.onBrand : t.faint,
              cursor: agreed ? "pointer" : "not-allowed",
            }}
          >
            <IconScanFace size={18} /> Capture selfie
          </button>
          <div className="text-center text-[11.5px] font-semibold" style={{ color: t.faint }}>
            Verifying your face is required to view your photos.
          </div>
        </div>
        <PoweredBy />
        {camGate && <PermissionGate gate={camGate} onRetry={() => setCamAttempt((n) => n + 1)} />}
      </Shell>
    );
  }

  if (phase === "processing") {
    const shown = Math.min(pct, 100);
    return (
      <Shell guestName={guestName}>
        <div className="flex flex-1 flex-col items-center justify-center gap-7 px-7">
          <div className="relative">
            <span className="fx-glow-pulse absolute -inset-3 rounded-[32px]" style={{ background: t.accentWash, filter: "blur(22px)" }} />
            <div className="relative overflow-hidden" style={{ width: 248, height: 300, borderRadius: 26, background: t.viewer, boxShadow: t.shadow }}>
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-full w-full object-cover opacity-90" style={{ transform: "scaleX(-1)" }} />
              )}
              <div className="absolute inset-0" style={{ background: "radial-gradient(120% 80% at 50% 35%, transparent 38%, rgba(23,17,10,0.72) 100%)" }} />
              <div className="scan-laser absolute inset-x-0 top-0" style={{ height: 3, background: `linear-gradient(90deg, transparent, ${t.brand}, transparent)`, boxShadow: `0 0 14px 2px ${t.brand}` }} />
              <Brackets />
            </div>
          </div>
          <div className="flex w-full flex-col items-center gap-1.5 text-center">
            <div className="text-[52px] font-extrabold leading-none tracking-[-0.03em]" style={{ color: t.brand }}>{shown}%</div>
            <div className="flex items-center gap-1.5 text-[14px] font-bold" style={{ color: t.text }}>
              {status}
              <span className="fx-dots inline-flex items-center gap-[3px]">
                <span className="h-[3px] w-[3px] rounded-full" style={{ background: t.brand }} />
                <span className="h-[3px] w-[3px] rounded-full" style={{ background: t.brand }} />
                <span className="h-[3px] w-[3px] rounded-full" style={{ background: t.brand }} />
              </span>
            </div>
            <div className="mt-3 h-[7px] w-full overflow-hidden rounded-full" style={{ background: t.sunken }}>
              <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${shown}%`, background: `linear-gradient(90deg, ${t.brandDeep}, ${t.brand})` }} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 px-7 pb-2" style={{ color: t.faint }}>
          <IconLock size={13} />
          <span className="text-center text-[12px] font-semibold">Your selfie is saved to your gallery profile to match your photos — rescan anytime.</span>
        </div>
        <PoweredBy />
      </Shell>
    );
  }

  // error — retake goes back to "consent" with `agreed` still true, which
  // re-triggers the camera-starting effect for a fresh stream.
  return (
    <Shell guestName={guestName}>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <span className="fx-pop flex h-20 w-20 items-center justify-center rounded-full" style={{ background: t.errorSoft, color: t.error }}>
          <IconSmiley size={36} style={{ color: t.error }} />
        </span>
        <h1 className="text-[22px] font-extrabold tracking-[-0.02em]" style={{ color: t.text }}>Let’s try that again</h1>
        <p className="max-w-[340px] text-[14px] font-semibold leading-[1.5]" style={{ color: t.muted }}>
          {errorMsg ?? "Something went wrong. Please retake your selfie."}
        </p>
      </div>
      <div className="flex flex-col gap-2.5 px-7 pb-2">
        <button
          type="button"
          onClick={() => {
            setErrorMsg(null);
            resetProgress();
            setPhase("consent");
          }}
          className="cta-shine flex w-full cursor-pointer items-center justify-center gap-2 rounded-full py-4 text-[15px] font-extrabold transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
          style={{ background: t.brand, color: t.onBrand }}
        >
          <IconScanFace size={18} /> Retake
        </button>
      </div>
      <PoweredBy />
    </Shell>
  );
}

/* ── camera access ──────────────────────────────────────────────────────── */

type CameraFailReason = "unsupported" | "timeout" | "denied";

/** State of the blocking camera pop-up. `null` = camera is (or may be) live. */
type CamGate =
  | null
  | { kind: "blocked"; reason: CameraFailReason; name?: string }
  | { kind: "unsupported" };

/**
 * getUserMedia that rejects with a `TimeoutError` if it neither resolves nor
 * rejects within `ms`. Some Android browsers (Realme/ColorOS Chrome) leave the
 * promise pending when the permission prompt is suppressed — without this the
 * guest is stuck on a black camera with a no-op capture button. A stream that
 * arrives after the timeout is stopped so the camera indicator goes back off.
 */
function getUserMediaWithTimeout(constraints: MediaStreamConstraints, ms: number): Promise<MediaStream> {
  return new Promise<MediaStream>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const e = new Error("getUserMedia timed out");
      e.name = "TimeoutError";
      reject(e);
    }, ms);
    navigator.mediaDevices.getUserMedia(constraints).then(
      (s) => {
        if (settled) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(s);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Content for the camera pop-up: a title, supporting body, and (optionally)
 *  numbered steps to re-enable camera access. */
function gateContent(gate: Exclude<CamGate, null>): { title: string; body: string; steps?: string[] } {
  if (gate.kind === "unsupported") {
    return {
      title: "Open in a different browser",
      body: "This page can’t reach the camera here — it may be running inside another app’s in-app browser. Open the link in Chrome (Android) or Safari (iPhone) to continue.",
    };
  }
  const enableSteps = [
    "Tap the lock or ⋮ icon in your browser’s address bar.",
    "Open Permissions / Site settings and allow Camera.",
    "Come back here and tap “Enable camera & try again”.",
  ];
  if (gate.name === "NotReadableError" || gate.name === "AbortError") {
    return {
      title: "Your camera is busy",
      body: "Another app is using the camera. Close any open camera or video-call apps, then try again.",
    };
  }
  if (gate.name === "NotFoundError" || gate.name === "OverconstrainedError") {
    return {
      title: "No camera found",
      body: "We couldn’t find a usable camera on this device. A working front camera is required to verify your face.",
    };
  }
  // denied / NotAllowedError / SecurityError / timeout (prompt likely suppressed)
  return {
    title: "Camera access needed",
    body:
      gate.reason === "timeout"
        ? "Your camera didn’t respond — the permission prompt may be blocked for this site."
        : "Verifying your face needs camera access, and it’s currently blocked.",
    steps: enableSteps,
  };
}

/** Read the camera permission state (best-effort) and report the failure. */
async function reportCameraFailure(reason: CameraFailReason, err: unknown, ids: { event: string; booking: string }) {
  let permission: string | undefined;
  try {
    const status = await navigator.permissions?.query({ name: "camera" as PermissionName });
    permission = status?.state;
  } catch {
    /* Permissions API not available (e.g. Firefox/Safari camera query) */
  }
  void reportBug(`Face scan — camera unavailable (${reason})`, {
    Event: ids.event,
    Booking: ids.booking,
    "Camera permission": permission,
    "Error name": err instanceof Error ? err.name : undefined,
    "Error message": err instanceof Error ? err.message : err ? String(err) : undefined,
    "mediaDevices present": typeof navigator !== "undefined" ? String(!!navigator.mediaDevices) : undefined,
  });
}

/** Dig a human-readable reason out of the worker's (possibly nested) error body. */
function extractReason(body: unknown): string {
  if (!body) return "";
  if (typeof body === "string") return body === "Failed to validate selfie" ? "" : body;
  if (typeof body !== "object") return "";
  const o = body as Record<string, unknown>;
  for (const c of [o.error, o.reason, o.detail, o.message, o.errors]) {
    if (typeof c === "string" && c && c !== "Failed to validate selfie") return c;
    if (Array.isArray(c) && c.length) {
      const first = typeof c[0] === "string" ? c[0] : extractReason(c[0]);
      if (first) return first;
    }
    if (c && typeof c === "object") {
      const nested = extractReason(c);
      if (nested) return nested;
    }
  }
  return "";
}

/** Turn a validation failure into clear, non-technical guidance for the guest. */
function toFriendlyError(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return "Something went wrong. Please check your connection and retake.";
  }
  const reason = extractReason(err.body) || "";
  const r = reason.toLowerCase();
  if (/no face|face not (found|detected)|couldn'?t (find|detect)|0 face|without a face/.test(r))
    return "We couldn’t find a face in your photo. Make sure your face is clearly visible and centered, then retake.";
  if (/multiple|more than one|two face|2 face|several face|many face/.test(r))
    return "We found more than one face. Make sure only your face is in the frame, then retake.";
  if (/blur|sharp|focus/.test(r)) return "Your photo looks blurry. Hold steady in good light and retake.";
  if (/dark|dim|low.?light|bright|exposure|lighting/.test(r)) return "The lighting was off. Move somewhere brighter and retake.";
  if (/small|too far|distance|zoom/.test(r)) return "Your face was too small in the frame. Come a little closer and retake.";
  if (/angle|frontal|straight|profile|side|looking away|pose/.test(r)) return "Please look straight at the camera and retake.";
  if (/sunglass|glasses|mask|cover|occlu|obstruct/.test(r)) return "Please remove anything covering your face (sunglasses, mask) and retake.";
  // Show the worker's reason if it's short and clean; otherwise a general hint.
  if (reason && reason.length < 110 && !/\b\d{3}\b|status|http|exception|traceback|null|undefined/i.test(reason)) {
    const clean = reason.charAt(0).toUpperCase() + reason.slice(1);
    return /[.!?]$/.test(clean) ? clean : `${clean}. Please retake.`;
  }
  return "We couldn’t verify your face clearly. Make sure it’s well-lit, centered, and unobstructed, then retake.";
}

/* ── chrome + bits ──────────────────────────────────────────────────────── */

function Shell({ guestName, children }: { guestName?: string; children: React.ReactNode }) {
  const { theme: t, event } = useEventTheme();
  const studioLogo = event.include_company_branding ? event.company_logo : undefined;
  return (
    <div className="relative isolate flex min-h-[100dvh] flex-col" style={{ background: t.bg, fontFamily: t.font }}>
      <AmbientBackdrop a={t.cover[0]} b={t.cover[1]} />
      <div className="flex items-center justify-between px-5 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={studioLogo || "/vyavasth-icon.svg"} alt="" className="h-7 w-7 rounded object-contain" />
        {guestName && (
          <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: t.card, border: `1px solid ${t.border}` }}>
            <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-extrabold text-white" style={{ background: t.brand }}>
              {(guestName[0] ?? "·").toUpperCase()}
            </span>
            <span className="text-[12px] font-bold" style={{ color: t.text }}>{guestName.split(" ")[0]}</span>
          </span>
        )}
      </div>
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col">{children}</div>
    </div>
  );
}

export function PoweredBy() {
  const { theme: t } = useEventTheme();
  return (
    <div className="py-4 text-center text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: t.faint }}>
      Powered by Vyavasth
    </div>
  );
}

/**
 * Blocking permission pop-up shown over the camera screen. Camera access is
 * strictly required: the only way forward is to grant it and tap "try again"
 * (or, for an unsupported browser, switch browsers). There is intentionally no
 * dismiss / bypass.
 */
function PermissionGate({ gate, onRetry }: { gate: Exclude<CamGate, null>; onRetry: () => void }) {
  const { theme: t } = useEventTheme();
  const [copied, setCopied] = useState(false);
  const unsupported = gate.kind === "unsupported";
  const { title, body, steps } = gateContent(gate);

  const copyLink = async () => {
    try {
      await navigator.clipboard?.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the user can still copy from the address bar */
    }
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ background: "rgba(20,14,9,0.55)", backdropFilter: "blur(2px)" }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fx-rise m-3 w-full max-w-[400px] rounded-3xl p-6"
        style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}
      >
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: t.errorSoft, color: t.error }}
        >
          {unsupported ? <IconBrowser size={30} /> : <IconCameraOff size={30} />}
        </div>
        <h2 className="text-center text-[19px] font-extrabold tracking-[-0.02em]" style={{ color: t.text }}>
          {title}
        </h2>
        <p className="mt-2 text-center text-[13.5px] font-semibold leading-[1.5]" style={{ color: t.muted }}>
          {body}
        </p>
        {steps && (
          <ol className="mt-4 flex flex-col gap-2.5">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13px] font-semibold leading-[1.4]" style={{ color: t.text }}>
                <span
                  className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold"
                  style={{ background: t.accentWash, color: t.brand }}
                >
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        )}
        <div className="mt-5 flex flex-col gap-2">
          {unsupported ? (
            <button
              type="button"
              onClick={copyLink}
              className="cta-shine flex w-full cursor-pointer items-center justify-center gap-2 rounded-full py-3.5 text-[14px] font-extrabold transition-transform active:scale-[0.99]"
              style={{ background: t.brand, color: t.onBrand }}
            >
              <IconCopy size={16} /> {copied ? "Link copied!" : "Copy link"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onRetry}
              className="cta-shine flex w-full cursor-pointer items-center justify-center gap-2 rounded-full py-3.5 text-[14px] font-extrabold transition-transform active:scale-[0.99]"
              style={{ background: t.brand, color: t.onBrand }}
            >
              <IconScanFace size={16} /> Enable camera &amp; try again
            </button>
          )}
          <button
            type="button"
            onClick={onRetry}
            className="w-full cursor-pointer py-2 text-center text-[12.5px] font-bold"
            style={{ color: t.muted }}
          >
            {unsupported ? "I’ve switched browsers — try again" : "Try again"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Brackets() {
  const { theme: t } = useEventTheme();
  const base: React.CSSProperties = { position: "absolute", width: 26, height: 26, borderColor: t.brand, borderStyle: "solid", borderWidth: 0 };
  const m = 14;
  return (
    <>
      <span style={{ ...base, top: m, left: m, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 }} />
      <span style={{ ...base, top: m, right: m, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 }} />
      <span style={{ ...base, bottom: m, left: m, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 }} />
      <span style={{ ...base, bottom: m, right: m, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 }} />
    </>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  const { theme: t } = useEventTheme();
  return (
    <span
      className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
      style={{ background: checked ? t.brand : "transparent", border: `1.5px solid ${checked ? t.brand : t.border}`, color: t.onBrand }}
    >
      {checked && <IconCheck size={12} weight="bold" />}
    </span>
  );
}

