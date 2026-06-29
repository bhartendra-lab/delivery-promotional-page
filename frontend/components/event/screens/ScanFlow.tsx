"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, putBlobToPresignedUrl } from "@/lib/api";
import { presignGuestUploads, searchSelfie, validateSelfie } from "@/lib/guest-api";
import { reportBug } from "@/lib/report-bug";
import { AmbientBackdrop } from "../AmbientBackdrop";
import { useEventTheme } from "../EventThemeContext";

type Phase = "intro" | "camera" | "processing" | "matched" | "error";

/**
 * Screen 2–4 · Face scan — T&C consent → live camera → upload + validate +
 * search → matched. Themed to the event's style_variant. The selfie is captured
 * as JPEG, uploaded direct to R2 via the presign endpoint, validated against the
 * face-search worker (retake on failure), then searched; the matched media_ids
 * feed the gallery.
 */
export function ScanFlow({
  guestName,
  onComplete,
}: {
  guestName?: string;
  /** Called with the matched media_ids + selfie url once the scan succeeds. */
  onComplete: (mediaIds: string[], selfieUrl: string) => void;
}) {
  const { theme: t, event, uniqueIdentifier } = useEventTheme();
  const bookingId = event.booking_id;

  const [phase, setPhase] = useState<Phase>("intro");
  const [agreed, setAgreed] = useState(false);
  const [pct, setPct] = useState(0);
  const [target, setTarget] = useState(0);
  const [status, setStatus] = useState("Scanning photos…");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [selfieUrl, setSelfieUrl] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  // Camera permission gate: a blocking pop-up shown over the camera screen when
  // the live camera can't start. Camera access is strictly required to proceed.
  const [camGate, setCamGate] = useState<CamGate>(null);
  const [camAttempt, setCamAttempt] = useState(0);
  const matchCount = matchedIds.length;

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Smoothly climb the displayed percentage toward the current stage target.
  useEffect(() => {
    const id = setInterval(() => {
      setPct((p) => (p < target ? Math.min(p + 2, target) : p));
    }, 40);
    return () => clearInterval(id);
  }, [target]);

  // Live camera while on the camera phase; stop tracks when leaving / unmounting.
  // Re-runs on each retry (camAttempt) so the gate's "try again" can re-request.
  useEffect(() => {
    if (phase !== "camera") return;
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
  }, [phase, camAttempt, uniqueIdentifier, bookingId]);

  function resetProgress() {
    setPct(0);
    setTarget(0);
    setStatus("Scanning photos…");
  }

  async function runPipeline(blob: Blob, previewUrl: string) {
    setPreview(previewUrl);
    setPhase("processing");
    resetProgress();
    try {
      setTarget(15);
      setStatus("Uploading your selfie…");
      const selfieId = crypto.randomUUID();
      const { uploads } = await presignGuestUploads(uniqueIdentifier, bookingId, [
        { filename: `${selfieId}.jpeg`, content_type: "image/jpeg" },
      ]);
      const up = uploads[0];
      await putBlobToPresignedUrl(up.presigned_url, blob, "image/jpeg");

      setTarget(45);
      setStatus("Checking your photo…");
      await validateSelfie(uniqueIdentifier, { selfie_id: selfieId, selfie_url: up.public_url });

      setTarget(80);
      setStatus("Matching faces…");
      const res = await searchSelfie(uniqueIdentifier, { selfie_id: selfieId, booking_id: bookingId });
      const ids = res.data || [];

      setTarget(100);
      setStatus("Match complete");
      setMatchedIds(ids);
      setSelfieUrl(up.public_url);
      // Brief beat at 100% before revealing the result (explicit "See my photos").
      window.setTimeout(() => setPhase("matched"), 750);
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

  /* ── views ──────────────────────────────────────────────────────────── */

  if (phase === "intro") {
    return (
      <Shell guestName={guestName}>
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-7 text-center">
          <div className="relative">
            {/* radar pulse */}
            <span className="fx-ring-ping absolute inset-0 rounded-full" style={{ border: `2px solid ${t.brand}` }} />
            <span className="brand-pulse relative flex h-32 w-32 items-center justify-center rounded-full" style={{ background: t.ring, padding: 5 }}>
              <span className="flex h-full w-full items-center justify-center rounded-full" style={{ background: t.sunken, border: "3px solid #fff" }}>
                <FaceIcon size={44} color={t.faint} />
              </span>
              <span className="absolute -bottom-1 -right-1 flex h-11 w-11 items-center justify-center rounded-full" style={{ background: t.brand, border: `3px solid ${t.bg}`, color: t.onBrand }}>
                <ScanIcon size={20} />
              </span>
            </span>
          </div>
          <div className="fx-blur-in flex flex-col gap-2.5">
            <h1 className="text-[26px] font-extrabold leading-[1.2] tracking-[-0.02em]" style={{ color: t.text }}>
              Let’s find you<br />in the photos
            </h1>
            <p className="text-[14px] font-semibold leading-[1.55]" style={{ color: t.muted }}>
              One quick selfie. We’ll scan the gallery and pull out every single photo you’re in.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3.5 px-6 pb-2">
          <button
            type="button"
            onClick={() => setAgreed((a) => !a)}
            className="flex cursor-pointer items-start gap-3 rounded-2xl p-3.5 text-left transition-colors"
            style={{ background: agreed ? t.accentWash : t.card, border: `1px solid ${agreed ? t.brand : t.border}` }}
          >
            <Checkbox checked={agreed} />
            <span className="text-[12.5px] font-semibold leading-[1.45]" style={{ color: t.text }}>
              I agree to let Vyavasth scan my selfie to match my face to these photos.
            </span>
          </button>
          <button
            type="button"
            onClick={() => agreed && setPhase("camera")}
            disabled={!agreed}
            className="cta-shine flex w-full cursor-pointer items-center justify-center gap-2 rounded-full py-4 text-[15px] font-extrabold transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
            style={{
              background: agreed ? t.brand : t.sunken,
              color: agreed ? t.onBrand : t.faint,
              cursor: agreed ? "pointer" : "not-allowed",
            }}
          >
            <ScanIcon size={18} /> Scan my face
          </button>
          <div className="text-center text-[11.5px] font-semibold" style={{ color: t.faint }}>
            Verifying your face is required to view your photos.
          </div>
        </div>
        <PoweredBy />
      </Shell>
    );
  }

  if (phase === "camera") {
    return (
      <Shell guestName={guestName}>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-7">
          <div className="relative">
            <span className="fx-glow-pulse absolute -inset-3 rounded-[32px]" style={{ background: t.accentWash, filter: "blur(22px)" }} />
            <div className="relative overflow-hidden" style={{ width: 260, height: 320, borderRadius: 26, background: t.viewer, boxShadow: t.shadow }}>
              <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" style={{ transform: "scaleX(-1)" }} />
              <Brackets />
            </div>
          </div>
          <p className="text-center text-[13.5px] font-semibold" style={{ color: t.muted }}>
            Center your face in the frame, then capture.
          </p>
        </div>
        <div className="flex flex-col gap-2.5 px-7 pb-2">
          <button
            type="button"
            onClick={capture}
            className="cta-shine flex w-full cursor-pointer items-center justify-center gap-2 rounded-full py-4 text-[15px] font-extrabold transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
            style={{ background: t.brand, color: t.onBrand }}
          >
            <ScanIcon size={18} /> Capture selfie
          </button>
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
          <LockIcon size={13} />
          <span className="text-center text-[12px] font-semibold">Your selfie is used only to match faces, then discarded.</span>
        </div>
        <PoweredBy />
      </Shell>
    );
  }

  if (phase === "matched") {
    return (
      <Shell guestName={guestName}>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-7 text-center">
          <div className="fx-pop relative">
            {/* success burst */}
            <span className="fx-ring-ping absolute inset-0 rounded-full" style={{ border: `2px solid ${t.success}` }} />
            <span className="relative flex h-28 w-28 items-center justify-center rounded-full" style={{ background: t.ring, padding: 5 }}>
              <span className="flex h-full w-full items-center justify-center rounded-full text-white" style={{ background: t.success, border: "3px solid #fff" }}>
                <CheckIcon size={44} />
              </span>
            </span>
          </div>
          <div className="fx-rise flex flex-col gap-2">
            <h1 className="text-[27px] font-extrabold tracking-[-0.02em]" style={{ color: t.text }}>
              Found <span className="fx-pop inline-block" style={{ color: t.brand }}>{matchCount}</span> photo{matchCount === 1 ? "" : "s"} of you
            </h1>
            <p className="text-[14px] font-semibold leading-[1.5]" style={{ color: t.muted }}>
              {matchCount > 0 ? "Your full set is ready and waiting inside." : "We couldn’t match any photos yet — more may appear as the studio adds them."}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 px-7 pb-2">
          <button
            type="button"
            onClick={() => onComplete(matchedIds, selfieUrl)}
            className="cta-shine flex w-full cursor-pointer items-center justify-center gap-2 rounded-full py-4 text-[15px] font-extrabold transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
            style={{ background: t.brand, color: t.onBrand }}
          >
            <ImagesIcon size={18} /> See my photos
          </button>
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              resetProgress();
              setPhase("camera");
            }}
            className="w-full cursor-pointer py-2 text-center text-[13px] font-bold"
            style={{ color: t.muted }}
          >
            Not you? Rescan my face
          </button>
        </div>
        <PoweredBy />
      </Shell>
    );
  }

  // error
  return (
    <Shell guestName={guestName}>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <span className="fx-pop flex h-20 w-20 items-center justify-center rounded-full" style={{ background: t.errorSoft, color: t.error }}>
          <FaceIcon size={36} color={t.error} />
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
            setPhase("camera");
          }}
          className="cta-shine flex w-full cursor-pointer items-center justify-center gap-2 rounded-full py-4 text-[15px] font-extrabold transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
          style={{ background: t.brand, color: t.onBrand }}
        >
          <ScanIcon size={18} /> Retake
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

function PoweredBy() {
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
          {unsupported ? <BrowserIcon size={30} /> : <CameraOffIcon size={30} />}
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
              <CopyIcon size={16} /> {copied ? "Link copied!" : "Copy link"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onRetry}
              className="cta-shine flex w-full cursor-pointer items-center justify-center gap-2 rounded-full py-3.5 text-[14px] font-extrabold transition-transform active:scale-[0.99]"
              style={{ background: t.brand, color: t.onBrand }}
            >
              <ScanIcon size={16} /> Enable camera &amp; try again
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
      {checked && <CheckIcon size={12} />}
    </span>
  );
}

function ScanIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" />
      <path d="M9 10h.01M15 10h.01M9.5 14.5a3.5 3.5 0 0 0 5 0" />
    </svg>
  );
}
function CameraOffIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 16H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1m3-2h4l2 2h2a2 2 0 0 1 2 2v6m-7-2.5a2.5 2.5 0 0 0 3 3" />
      <path d="M2 2l20 20" />
    </svg>
  );
}
function BrowserIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M7 6.5h.01M10 6.5h.01" />
    </svg>
  );
}
function CopyIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
function FaceIcon({ size = 44, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 10h.01M15.5 10h.01M8.5 14.5a4.5 4.5 0 0 0 7 0" />
    </svg>
  );
}
function CheckIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="5 12 10 17 19 7" />
    </svg>
  );
}
function ImagesIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="M7 19l5-5 4 4M21 8v11a2 2 0 0 1-2 2H8" />
    </svg>
  );
}
function LockIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
