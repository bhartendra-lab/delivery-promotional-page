
# Task: wire `recalculate-studio-storage` into the frontend, retire mid-upload usage polling

Repo: `delivery-promotional-page/frontend` (Next.js dashboard). No backend work — everything below is already shipped on the API side; this is a frontend-only integration. File/line references are current as of this writing; re-locate by function name if line numbers have drifted.

## Background

`GET /deliverables/get-dlp-usage` used to compute storage usage live on every call (`getDlpUsage`, `backend/src/controllers/deliverables.controller.js`), and its cost scaled with how much storage a studio had used, because it walked R2 to sum object sizes. That's been fixed on the backend: a `storage_used` field now lives on the `Subscription` document, `get-dlp-usage` just reads it (cheap), and a new `recalculateStorage({booking_id | company_id})` function (`backend/src/services/galleryCleanup.js:69-141`) does the expensive R2-walking aggregation and writes the fresh number to `storage_used`. It already runs nightly via `teardownBooking()` (gallery cleanup cron). It's now also exposed as `POST /bookings/recalculate-studio-storage` (auth-only, no body/params — reads `company_id` off the authenticated user, returns `{ usedStorage, message }`; see `backend/src/controllers/bookings.controller.js:419-427` and `backend/src/routes/bookings.routes.js:16`).

Because `get-dlp-usage` no longer computes anything live, its number is only as fresh as the last time something recalculated it. The frontend needs to call the new endpoint at the specific moments storage changes, and stop calling `get-dlp-usage` as a mid-upload polling/enforcement mechanism (that mechanism is being removed outright, see part 3).

## 1. Add the API wrapper

In `frontend/lib/api.ts`, add a function next to `clearBookingData` (~line 253):

```ts
/**
 * POST /bookings/recalculate-studio-storage — re-walks R2 for every non-expired
 * booking on the company's active subscription and writes the fresh total to
 * Subscription.storage_used. Expensive (R2 listing), so only call it at
 * well-defined storage-changing moments (clear data; upload paused/cancelled/
 * completed) — never on a timer or poll.
 */
export function recalculateStudioStorage() {
  return request<{ usedStorage: number; message: string }>(
    "/bookings/recalculate-studio-storage",
    { method: "POST" },
  );
}
```

No path param, no body — company comes from the auth token, same as every other `protect`-only route in this file.

## 2. Clear event data — two call sites, same fix

`clearBookingData` is called from exactly two places today, and both already re-sync usage afterward via `refreshDlpUsage()` (from `useChrome()`):

- `frontend/components/dashboard/useBookingLifecycle.tsx`, `onClearData` (lines 53-66) — the dashboard events grid's "Clear data" action.
- `frontend/app/(dashboard)/dashboard/events/[booking_id]/EventWorkspace.tsx`, `doClearData` (lines 762-778) — the same action from inside a single event's workspace (gated by `overlayBusy`).

In both, insert `await recalculateStudioStorage()` between the `clearBookingData(...)` call and `refreshDlpUsage()`:

```ts
await clearBookingData(bookingId /* or row._id */);
await recalculateStudioStorage();   // ← new: refresh storage_used before re-reading it
await refreshDlpUsage();            // now returns the corrected number
await reload(); // or reloadBooking()
notify(/* or toast(...) */ "Event data cleared. Only the cover photo remains.");
```

Both functions already run their whole sequence inside one `try` block before the success `notify`/`toast`, and only flip their busy flag off in `finally` — so this one-line insertion is sufficient to satisfy "only show the clear-data completion status once recalculate-studio-storage also completes." No new state needed here.

Error handling: a `clearBookingData` call that succeeded must not be reported as a failure just because the follow-up recalculation had a hiccup. Wrap only the new call so it can't throw into the outer catch:

```ts
try {
  await recalculateStudioStorage();
} catch (err) {
  console.warn("[clear-data] recalculate-studio-storage failed", err);
}
```

(Mirrors how `refreshDlpUsage` itself already swallows its own errors and returns `null` rather than throwing.)

## 3. Remove get-dlp-usage polling during upload — and the auto-pause feature built on it

This is the part described as "I don't want this anymore." The mid-upload check lives in `EventWorkspace.tsx`, inside the `engine.onMetadataSaved` effect (lines 458-482):

```ts
// Storage-plan overrun guard — usage is changing live during this upload,
// so refetch fresh (not the cached value) and update the shared meter.
if (isStorageBasedPlan(dlpServiceTypeRef.current)) {
  void refreshDlpUsage().then((fresh) => {
    if (fresh && isStorageBasedPlan(fresh.service_type) && (fresh.remaining ?? 0) <= 0) {
      setAutoPauseReason("storage-exhausted");
      engine.pause();
    }
  });
}
```

Delete this block (keep the debounced `reload()` a few lines above it — that part is unrelated). Once it's gone, nothing ever sets `autoPauseReason`, which makes the rest of that feature dead code. Remove it entirely, across these files:

- **`EventWorkspace.tsx`**
  - `autoPauseReason` / `setAutoPauseReason` state (line 148) and the effect that clears it on a new run (lines 484-492).
  - `storageRechecking` / `setStorageRechecking` state (line 149) and the `recheckStorage` callback (lines 494-510).
  - Remove `autoPauseReason`, `storageRechecking`, `recheckStorage` from the `EventContextValue` object literal and its `useMemo` dependency array (lines 877-879 and 890).
  - `dlpServiceTypeRef` (lines 154-157) was only feeding the deleted block — remove it too if nothing else reads it.
- **`EventContext.tsx`** — remove the three matching fields from the `EventContextValue` type (lines 120-133: `autoPauseReason`, `storageRechecking`, `recheckStorage` and their doc comments).
- **`MediaTab.tsx`** — remove the three from the context destructuring (lines 39-41) and the matching props passed to `<UploadProgress>` (lines 272-274: `autoPauseReason={autoPauseReason}`, `onRecheckStorage={() => void recheckStorage()}`, `storageRechecking={storageRechecking}`).
- **`UploadProgress.tsx`** — remove the `autoPauseReason`, `onRecheckStorage`, `storageRechecking` props (lines 14-16 and the type block at 22-31), the `storagePaused` derived value (line 36), its copy branch (lines 103-109 — collapse to the plain "Transfer is on hold… Resume to continue" copy that already exists for a manual pause), the "Re-check storage" button (lines 195-211), and `disabled={storagePaused}` / the conditional `title` on the Resume button (lines 216-218 — Resume goes back to being always-enabled while paused).

Net result: manual Pause / Resume / Cancel keep working exactly as they do today. What disappears is the ability for the app to notice mid-upload that a storage-based plan ran out of space and force-pause with a "re-check storage" gate — there is no live number to detect that with anymore, by design.

## 4. Call recalculate-studio-storage on pause / cancel / complete — gate the status shown

Two real trigger points exist in the upload engine's state machine (`EngineProgress`, `frontend/lib/r2-upload/types.ts:58-81`):

- **Cancel and natural completion both resolve through the same place**: the "on run completion" effect in `EventWorkspace.tsx` (lines 515-529), which fires whenever `engine.progress.isUploading || engine.progress.isSavingMetadata` flips from `true` to `false`. That happens both when `run()` finishes naturally (`lib/r2-upload/engine.ts:246-277`) and when `cancel()` finishes (`engine.ts:287-302` — cancel's own `finally`, after `wipeAll()`, is what flips `isUploading` false for a cancelled run). One hook covers "cancelled" and "completed."
- **Pause does not go through that effect.** `pause()` (`engine.ts:313-317`) only flips `paused: true`; `isUploading` deliberately stays `true` (see the comment at `engine.ts:309-311` — the progress card stays mounted, the workspace just unlocks). Pause needs its own hook at the point it's invoked: today that's the inline handler in `MediaTab.tsx:271` (`onTogglePause={() => (paused ? engine.resume() : engine.pause())}`).

At all three (pause, cancel, complete): call `recalculateStudioStorage()`, then `refreshDlpUsage()` (so the sidebar meter and a subsequently-opened `UploadModal` show the corrected number), and don't reveal the resting "Paused" / cancelled / done state until that settles.

Suggested implementation — add one new busy flag, following the same pattern as the `overlayBusy`/`storageRechecking` flags already used elsewhere in this codebase (e.g. `finalizingStorage: boolean`, surfaced through `EventContextValue` next to `engine`):

- Set it `true` the instant a pause/cancel/complete transition is detected; run `recalculateStudioStorage()` then `refreshDlpUsage()` inside `try/finally`; set it back to `false` when done (the `finally` matters — a failed recalculation must not strand the UI on a spinner forever).
- `MediaTab.tsx`'s `state` derivation (lines 68-75, currently `engineActive ? "uploading" : media.length ? "populated" : "empty"`) should also treat `finalizingStorage` as "still uploading," so the progress card doesn't hand off to the media grid / post-upload banner (`setBanner`, `EventWorkspace.tsx:525`) before the recalculation lands.
- For the pause case, have `UploadProgress.tsx` show a brief transitional state (e.g. "Pausing…") instead of immediately switching to "Upload paused at N of M photos" while `finalizingStorage` is true, then reveal the normal paused copy once it clears.
- Worth checking for visual consistency (not a hard requirement): `activeLocked` (`EventWorkspace.tsx:534`, `engineActive && !engine.progress.paused`) unlocks the rest of the workspace chrome — other tabs, etc. — the instant `pause()` flips `paused: true`, independent of `finalizingStorage`. Decide whether the rest of the workspace should also wait for `finalizingStorage` to clear, or whether it's fine for the rest of the workspace to unlock immediately while only the upload card itself still reads "Pausing…". The hard requirement is only about the status shown for the upload/clear-data action itself.

Error handling: identical to part 2 — a `recalculateStudioStorage()` failure must not strand the UI. Swallow it (console warning), still clear the busy flag, still reveal the resting status.

## 5. Leave this untouched

`frontend/app/(dashboard)/dashboard/events/[booking_id]/UploadModal.tsx` implements the pre-upload check ("only allow the upload if the estimated size fits the remaining storage") — `overStorage` (lines 137-142), fed by `estimateGB` (client-side estimate via `estimateCompressedGB()`, lines 108-134) compared against `remainingGB` (`dlpUsage.remaining`, read from the already-cached `useChrome()` value). It gates the "Start upload" button (line 422) and short-circuits `start()` (line 239). It does **not** call `get-dlp-usage` or `refreshDlpUsage` itself — it only reads whatever `ChromeContext` already has cached — so nothing above touches it. Do not modify this file.

## Acceptance checklist

- Clearing an event's data, from both the dashboard grid and the event workspace, calls `recalculate-studio-storage` after `clear-booking-data` succeeds and before the success toast/status appears.
- No call to `get-dlp-usage` / `refreshDlpUsage` remains inside the upload's `onMetadataSaved` handler.
- `autoPauseReason`, `storageRechecking`, and `recheckStorage` no longer exist anywhere in `EventContext.tsx`, `EventWorkspace.tsx`, `MediaTab.tsx`, or `UploadProgress.tsx` (grep each name — zero matches).
- Pausing, cancelling, and letting an upload run to completion each trigger exactly one `recalculate-studio-storage` call, and the corresponding "Paused" / "Cancelled" / done UI only appears after that call has settled (success or failure).
- `UploadModal`'s pre-upload storage-estimate gate is unmodified and still blocks "Start upload" when the estimate exceeds the remaining allowance.
- A `recalculate-studio-storage` failure never leaves the UI stuck on a busy/spinner state, and never blocks or reverts the underlying action (clear/pause/cancel/complete), which already succeeded server-side.
- Manual pause/resume/cancel behavior for count-based plans (Free/Event-based) is unchanged — none of this touches count-based limit checks.
