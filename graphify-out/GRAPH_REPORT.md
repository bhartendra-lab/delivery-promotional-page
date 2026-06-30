# Graph Report - /Users/abhishekagarwal/Documents/delivery-promotional-page  (2026-06-30)

## Corpus Check
- 92 files · ~153,430 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 427 nodes · 620 edges · 69 communities detected
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 102 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]

## God Nodes (most connected - your core abstractions)
1. `UploadEngineCore` - 40 edges
2. `request()` - 29 edges
3. `base()` - 26 edges
4. `GET()` - 19 edges
5. `guestFetch()` - 16 edges
6. `handleSubmit()` - 8 edges
7. `add()` - 8 edges
8. `txn()` - 8 edges
9. `AimdController` - 8 edges
10. `refreshGuest()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `GET()` --calls--> `groupByFirstSubfolder()`  [INFERRED]
  /Users/abhishekagarwal/Documents/delivery-promotional-page/frontend/app/api/download/route.ts → /Users/abhishekagarwal/Documents/delivery-promotional-page/frontend/app/(dashboard)/dashboard/events/[booking_id]/useUploadEngine.ts
- `GET()` --calls--> `peekUploadEngine()`  [INFERRED]
  /Users/abhishekagarwal/Documents/delivery-promotional-page/frontend/app/api/download/route.ts → /Users/abhishekagarwal/Documents/delivery-promotional-page/frontend/lib/r2-upload/registry.ts
- `handleSubmit()` --calls--> `setToken()`  [INFERRED]
  /Users/abhishekagarwal/Documents/delivery-promotional-page/frontend/app/(dashboard)/login/page.tsx → /Users/abhishekagarwal/Documents/delivery-promotional-page/frontend/lib/auth.ts
- `GET()` --calls--> `reportBug()`  [INFERRED]
  /Users/abhishekagarwal/Documents/delivery-promotional-page/frontend/app/api/download/route.ts → /Users/abhishekagarwal/Documents/delivery-promotional-page/frontend/lib/report-bug.ts
- `GET()` --calls--> `getUploadEngine()`  [INFERRED]
  /Users/abhishekagarwal/Documents/delivery-promotional-page/frontend/app/api/download/route.ts → /Users/abhishekagarwal/Documents/delivery-promotional-page/frontend/lib/r2-upload/registry.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.11
Nodes (11): sleep(), UploadEngineCore, backoffMs(), sleep(), withRetry(), GET(), safeName(), makeFingerprint() (+3 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (37): submit(), ApiError, checkResetLink(), createBooking(), createCustomFolder(), createMediaBatch(), createWatermarkPreset(), deleteMedia() (+29 more)

### Community 2 - "Community 2"
Cohesion: 0.14
Nodes (26): base(), IconArrowRight(), IconBroadcast(), IconCaretDown(), IconCheck(), IconChevronLeft(), IconChevronRight(), IconCopy() (+18 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (14): subscribeCompany(), add(), update(), handleDrop(), onChange(), submit(), getUploadEngine(), notifyActive() (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (16): remove(), downloadSelected(), delay(), downloadImage(), downloadMany(), downloadZip(), nameFromUrl(), proxyUrl() (+8 more)

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (17): putBlobToPresignedUrl(), getGuestMedia(), getGuestSession(), GuestAuthError, guestFetch(), likePhoto(), markZipAsDownloaded(), presignGuestUploads() (+9 more)

### Community 6 - "Community 6"
Cohesion: 0.16
Nodes (10): getCachedCompanyId(), clearCompany(), clearToken(), emitCompanyChange(), getCompany(), getToken(), isAuthenticated(), setCompany() (+2 more)

### Community 7 - "Community 7"
Cohesion: 0.19
Nodes (11): formatEta(), listResumableRecords(), clearBooking(), getRecord(), listByBooking(), listByBookingAndStatus(), openDb(), putRecord() (+3 more)

### Community 8 - "Community 8"
Cohesion: 0.17
Nodes (6): OnlinePresencePage(), StudioIdentityPage(), StudioLogoPage(), useSectionSave(), useSettings(), changed()

### Community 9 - "Community 9"
Cohesion: 0.26
Nodes (5): blobToDataUrl(), CompressorPool, compressWithExif(), dataUrlToBlob(), fileToDataUrl()

### Community 10 - "Community 10"
Cohesion: 0.25
Nodes (3): copy(), send(), buildShareUrl()

### Community 11 - "Community 11"
Cohesion: 0.5
Nodes (8): clearGuestToken(), decodeGuestToken(), ensureGuestToken(), getGuestToken(), isGuestTokenExpired(), keyFor(), refreshGuest(), setGuestToken()

### Community 12 - "Community 12"
Cohesion: 0.22
Nodes (1): AimdController

### Community 13 - "Community 13"
Cohesion: 0.5
Nodes (6): buildTheme(), luminance(), mix(), rgba(), toHex(), toRgb()

### Community 14 - "Community 14"
Cohesion: 0.29
Nodes (0): 

### Community 15 - "Community 15"
Cohesion: 0.33
Nodes (0): 

### Community 16 - "Community 16"
Cohesion: 0.4
Nodes (2): SettingsChrome(), sectionLabelFor()

### Community 17 - "Community 17"
Cohesion: 0.4
Nodes (1): openEvent()

### Community 18 - "Community 18"
Cohesion: 0.67
Nodes (2): DashboardShell(), deriveBreadcrumb()

### Community 19 - "Community 19"
Cohesion: 0.5
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 0.5
Nodes (0): 

### Community 21 - "Community 21"
Cohesion: 0.5
Nodes (0): 

### Community 22 - "Community 22"
Cohesion: 0.5
Nodes (2): useEventTheme(), TeamSelectScreen()

### Community 23 - "Community 23"
Cohesion: 0.83
Nodes (3): deviceDiagnostics(), formatBugInfo(), reportBug()

### Community 24 - "Community 24"
Cohesion: 0.67
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 0.67
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 0.67
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 0.67
Nodes (0): 

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Community 39"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (0): 

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (0): 

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (0): 

### Community 61 - "Community 61"
Cohesion: 1.0
Nodes (0): 

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (0): 

### Community 63 - "Community 63"
Cohesion: 1.0
Nodes (0): 

### Community 64 - "Community 64"
Cohesion: 1.0
Nodes (0): 

### Community 65 - "Community 65"
Cohesion: 1.0
Nodes (0): 

### Community 66 - "Community 66"
Cohesion: 1.0
Nodes (0): 

### Community 67 - "Community 67"
Cohesion: 1.0
Nodes (0): 

### Community 68 - "Community 68"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 28`** (2 nodes): `RootLayout()`, `layout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (2 nodes): `RootPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (2 nodes): `DashboardGroupLayout()`, `layout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (2 nodes): `onKey()`, `TypeConfirmModal.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (2 nodes): `regenerate()`, `AccessSharingTab.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (2 nodes): `useEvent()`, `EventContext.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (2 nodes): `EventDetailPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (2 nodes): `Lightbox()`, `Lightbox.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (2 nodes): `ClientGroupLayout()`, `layout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (2 nodes): `retry()`, `EventExperience.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (2 nodes): `AuthCallbackClient()`, `AuthCallbackClient.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (2 nodes): `AuthCallbackPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (2 nodes): `tick()`, `StatCard.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (2 nodes): `onKey()`, `Drawer.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (2 nodes): `StatsBar()`, `StatsBar.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (2 nodes): `EventBadge()`, `EventBadge.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (2 nodes): `ChromeProvider()`, `ChromeContext.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (2 nodes): `ActiveUploadsIndicator()`, `ActiveUploadsIndicator.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (2 nodes): `async()`, `FoldersSidebar.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (2 nodes): `decideStep()`, `EventFlow.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (2 nodes): `EventNotFound()`, `EventNotFound.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (2 nodes): `BrandLoader()`, `BrandLoader.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (2 nodes): `signIn()`, `LoginScreen.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (2 nodes): `onKey()`, `ProfileSheet.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (2 nodes): `PolicyProvider()`, `PolicyContext.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (2 nodes): `onKey()`, `PolicyOverlay.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `open-next.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `postcss.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `eslint.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `next.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (1 nodes): `UploadProgress.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `EventTabStrip.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (1 nodes): `Pagination.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (1 nodes): `DlpUsageCard.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `Topbar.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `AmbientBackdrop.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `piexif-shim.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `errors.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `UploadEngineCore` connect `Community 0` to `Community 3`, `Community 7`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Why does `remove()` connect `Community 4` to `Community 3`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `add()` connect `Community 3` to `Community 0`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `request()` (e.g. with `getToken()` and `clearToken()`) actually correct?**
  _`request()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `GET()` (e.g. with `groupByFirstSubfolder()` and `reportBug()`) actually correct?**
  _`GET()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `guestFetch()` (e.g. with `ensureGuestToken()` and `.run()`) actually correct?**
  _`guestFetch()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._