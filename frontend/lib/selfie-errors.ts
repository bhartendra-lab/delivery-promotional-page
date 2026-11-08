/**
 * Pure. The selfie screen's error wording, moved unchanged out of ScanFlow.tsx
 * so the mobile app shows guests exactly the same guidance (it copies this
 * file through its core sync).
 *
 * The one change is how an API error is recognised: structurally (an Error
 * with a numeric `status` and a `body`), not with `instanceof ApiError`,
 * because importing lib/api would pull in browser and env code. Both the
 * web's ApiError and the app's have that shape; nothing else thrown on the
 * selfie path does.
 */

type ApiErrorLike = Error & { status: number; body: unknown };

function isApiError(err: unknown): err is ApiErrorLike {
  return err instanceof Error && typeof (err as { status?: unknown }).status === "number" && "body" in err;
}

/** Dig a human-readable reason out of the worker's (possibly nested) error body. */
export function extractReason(body: unknown): string {
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

/**
 * Turn a validation failure into clear, non-technical guidance for the guest,
 * and say whether retaking could possibly help.
 *
 * `faceSearchDisabled` is the one case where it cannot: the Studio has switched
 * face search off for this event, so every retake would be refused identically.
 * The caller shows the gallery instead of a Retake button.
 */
export function toFriendlyError(err: unknown): { message: string; faceSearchDisabled: boolean } {
  if (!isApiError(err)) {
    return {
      message: "Something went wrong. Please check your connection and retake.",
      faceSearchDisabled: false,
    };
  }
  // The backend's own sentinel, not a guess at the message — see
  // FACE_SEARCH_DISABLED in deliverables.controller.js.
  if (
    err.status === 403 &&
    (err.body as { code?: string } | null)?.code === "FACE_SEARCH_DISABLED"
  ) {
    return {
      message: "Face search has been turned off for this gallery.",
      faceSearchDisabled: true,
    };
  }
  const friendly = (message: string) => ({ message, faceSearchDisabled: false });
  const reason = extractReason(err.body) || "";
  const r = reason.toLowerCase();
  if (/no face|face not (found|detected)|couldn'?t (find|detect)|0 face|without a face/.test(r))
    return friendly("We couldn’t find a face in your photo. Make sure your face is clearly visible and centered, then retake.");
  if (/multiple|more than one|two face|2 face|several face|many face/.test(r))
    return friendly("We found more than one face. Make sure only your face is in the frame, then retake.");
  if (/blur|sharp|focus/.test(r)) return friendly("Your photo looks blurry. Hold steady in good light and retake.");
  if (/dark|dim|low.?light|bright|exposure|lighting/.test(r)) return friendly("The lighting was off. Move somewhere brighter and retake.");
  if (/small|too far|distance|zoom/.test(r)) return friendly("Your face was too small in the frame. Come a little closer and retake.");
  if (/angle|frontal|straight|profile|side|looking away|pose/.test(r)) return friendly("Please look straight at the camera and retake.");
  if (/sunglass|glasses|mask|cover|occlu|obstruct/.test(r)) return friendly("Please remove anything covering your face (sunglasses, mask) and retake.");
  // Show the worker's reason if it's short and clean; otherwise a general hint.
  if (reason && reason.length < 110 && !/\b\d{3}\b|status|http|exception|traceback|null|undefined/i.test(reason)) {
    const clean = reason.charAt(0).toUpperCase() + reason.slice(1);
    return friendly(/[.!?]$/.test(clean) ? clean : `${clean}. Please retake.`);
  }
  return friendly("We couldn’t verify your face clearly. Make sure it’s well-lit, centered, and unobstructed, then retake.");
}
