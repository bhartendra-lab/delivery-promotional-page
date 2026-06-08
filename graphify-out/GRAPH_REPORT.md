# Graph Report - delivery-promotional-page  (2026-06-08)

## Corpus Check
- 72 files · ~67,413 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 246 nodes · 297 edges · 16 communities detected
- Extraction: 81% EXTRACTED · 19% INFERRED · 0% AMBIGUOUS · INFERRED: 55 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]

## God Nodes (most connected - your core abstractions)
1. `UploadEngineCore` - 21 edges
2. `request()` - 19 edges
3. `GET()` - 12 edges
4. `handleSubmit()` - 8 edges
5. `txn()` - 8 edges
6. `updateRecord()` - 8 edges
7. `AimdController` - 8 edges
8. `CompressorPool` - 6 edges
9. `withRetry()` - 6 edges
10. `compressWithExif()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `GET()` --calls--> `groupByFirstSubfolder()`  [INFERRED]
  /Users/abhishekagarwal/Documents/delivery-promotional-page/frontend/app/api/kv/[id]/route.ts → frontend/app/(dashboard)/dashboard/events/[booking_id]/useUploadEngine.ts
- `handleSubmit()` --calls--> `setToken()`  [INFERRED]
  frontend/app/(dashboard)/login/page.tsx → /Users/abhishekagarwal/Documents/delivery-promotional-page/frontend/lib/auth.ts
- `handleSubmit()` --calls--> `setCompany()`  [INFERRED]
  frontend/app/(dashboard)/login/page.tsx → /Users/abhishekagarwal/Documents/delivery-promotional-page/frontend/lib/auth.ts
- `request()` --calls--> `getToken()`  [INFERRED]
  frontend/lib/api.ts → /Users/abhishekagarwal/Documents/delivery-promotional-page/frontend/lib/auth.ts
- `request()` --calls--> `clearToken()`  [INFERRED]
  frontend/lib/api.ts → /Users/abhishekagarwal/Documents/delivery-promotional-page/frontend/lib/auth.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.1
Nodes (21): submit(), ApiError, checkResetLink(), createBooking(), createCustomFolder(), createMediaBatch(), getAllBookings(), getBookingById() (+13 more)

### Community 1 - "Community 1"
Cohesion: 0.25
Nodes (5): UploadEngineCore, GET(), makeFingerprint(), makeRecordId(), updateRecord()

### Community 2 - "Community 2"
Cohesion: 0.18
Nodes (11): formatEta(), listResumableRecords(), sleep(), clearBooking(), getRecord(), listByBooking(), listByBookingAndStatus(), openDb() (+3 more)

### Community 3 - "Community 3"
Cohesion: 0.18
Nodes (9): getCachedCompanyId(), clearCompany(), clearToken(), getCompany(), getToken(), isAuthenticated(), setCompany(), setToken() (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.26
Nodes (5): blobToDataUrl(), CompressorPool, compressWithExif(), dataUrlToBlob(), fileToDataUrl()

### Community 6 - "Community 6"
Cohesion: 0.22
Nodes (3): copy(), buildShareUrl(), formatEventDate()

### Community 7 - "Community 7"
Cohesion: 0.22
Nodes (1): AimdController

### Community 8 - "Community 8"
Cohesion: 0.29
Nodes (4): ClientPage(), getEventTemplate(), resolveStudioTheme(), seedFromString()

### Community 10 - "Community 10"
Cohesion: 0.33
Nodes (3): readKvData(), NotFound(), ClientLandingPage()

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (1): add()

### Community 12 - "Community 12"
Cohesion: 0.47
Nodes (3): backoffMs(), sleep(), withRetry()

### Community 13 - "Community 13"
Cohesion: 0.4
Nodes (2): groupByFirstSubfolder(), useUploadEngine()

### Community 14 - "Community 14"
Cohesion: 0.67
Nodes (2): DashboardShell(), deriveBreadcrumb()

### Community 15 - "Community 15"
Cohesion: 0.5
Nodes (1): openEvent()

### Community 17 - "Community 17"
Cohesion: 0.67
Nodes (2): share(), showToast()

### Community 18 - "Community 18"
Cohesion: 0.83
Nodes (3): captureClientSignals(), captureGeoData(), captureVisitorData()

## Knowledge Gaps
- **Thin community `Community 7`** (9 nodes): `AimdController`, `.canStart()`, `.constructor()`, `.currentLimit()`, `.noteFailure()`, `.noteSuccess()`, `.snapshot()`, `.start()`, `concurrency.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 11`** (6 nodes): `DeliveryUrlsField.tsx`, `add()`, `remove()`, `update()`, `.onUploaded()`, `.subscribe()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (5 nodes): `useUploadEngine.ts`, `.getState()`, `filterImages()`, `groupByFirstSubfolder()`, `useUploadEngine()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (4 nodes): `layout.tsx`, `DashboardLayout()`, `DashboardShell()`, `deriveBreadcrumb()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (4 nodes): `page.tsx`, `page.tsx`, `openCreate()`, `openEvent()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (4 nodes): `share()`, `showToast()`, `switch()`, `AccessSection.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `presignUploads()` connect `Community 0` to `Community 1`?**
  _High betweenness centrality (0.123) - this node is a cross-community bridge._
- **Why does `UploadEngineCore` connect `Community 1` to `Community 2`, `Community 11`, `Community 13`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `request()` connect `Community 0` to `Community 3`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `request()` (e.g. with `getToken()` and `clearToken()`) actually correct?**
  _`request()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 11 inferred relationships involving `GET()` (e.g. with `readKvData()` and `groupByFirstSubfolder()`) actually correct?**
  _`GET()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `handleSubmit()` (e.g. with `updateCompanyDetails()` and `resetPassword()`) actually correct?**
  _`handleSubmit()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._