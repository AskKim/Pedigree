# Implementation Plan: Cross-Device UX, Low-Memory Hygiene & Graceful Failure Hardening

## Progress Checklist
- [ ] Step 0: Read & Digest Master Prompt + Reference Docs
- [ ] Phase 0: Baseline Audit & Plan Sync
- [ ] Phase 1: Conservative Tier-1 Guardrails, Cross-Device Shell & Low-Memory UI
- [ ] Phase 2: Storage, Lifecycle & Write-Safe PWA Update Hardening
- [ ] Phase 3: Cross-Platform Export Cascade & Canvas/Photo Memory Protection
- [ ] Phase 4: Worker Crash Recovery & Lazy Bundle Splitting
- [ ] Phase 5: Regression Tests, Registry Sync & Final Recheck

---

## Step 0: Read & Digest the Master Prompt First (Before Anything Else)
Before reading other files, inspecting code, proposing edits, or running commands:
1. Read `prompts/master_system_prompt.md` completely and digest all rules, architectural boundaries, tone/style norms, and workflow expectations.
2. Briefly note the key rules internally so every subsequent step stays aligned without drift.
3. Only after digesting `prompts/master_system_prompt.md`, read `prompts/resume_backlog_plan_prompt.md`, `prompts/start_new_backlog_prompt.md`, `docs/plans/active-backlog-plan.md`, `docs/plans/suggestions-backlog.md`, `IMPROVEMENTS.md` (latest entries), `src/core/improvementRegistry.ts`, and `package.json`.

## Session Operating Protocol (Token-Lean & GitHub-Sync Safe)
- **Check active work before starting:** Inspect `docs/plans/active-backlog-plan.md` and `git status` / recent changes. If an unfinished plan already exists, determine completion status and finish/reconcile it or confirm with the user before overwriting `active-backlog-plan.md`.
- **Protect the suggestions list:** Never remove an item from `docs/plans/suggestions-backlog.md` until its implementation, tests, and `package.json` CI checks (`test`, `verify:improvements`, `lint`, `build`) pass.
- **Conserve tokens:** Work one phase at a time. Read only targeted sections of large files unless full context is needed, make surgical edits, and update `docs/plans/active-backlog-plan.md` with exact completed/remaining checkboxes at the end of each phase so you can sync to GitHub if tokens run out and resume cleanly.

## Hard Constraints & Guardrails (Do NOT Violate)
- **No server-side user storage, no third-party APIs, no telemetry/data collection, and no community sales board/marketplace.**
- **No new encryption or forced full-DB encryption:** Leave `src/core/encryptedExport.ts` and `src/storage/passphraseCrypto.ts` completely untouched (reserved for future optional, user-triggered export protection).
- **No PDF layout redesign:** Do not redesign print/PDF layouts in `src/components/PrintPreviewModal.tsx` or `src/core/barnBinder.ts`.
- **No premature Tier-1 "live cloud/shared memory" promises:** Do not build or advertise a "fetch from voluntary cloud/shared storage without persistent memory" mode yet. Keep Tier-1 thresholds and warnings honest and conservative out of the gate so users are never promised features that might later be restricted.
- **Zero/minimal memory & storage bloat:** Do not add heavy npm dependencies or duplicate large datasets in RAM or storage.
- **Android APK readiness:** Keep `src/core/` DOM-free and cleanly decoupled from browser/platform adapters in `src/storage/`, `src/utils/`, and `src/components/`.

---

## Phase 0: Baseline Audit & Plan Sync (No Code Edits)
1. Inspect targeted sections of:
   - `index.html`, `src/index.css`, `src/App.tsx`, `vite.config.ts`, `.github/workflows/deploy-pages.yml`
   - `src/core/deviceCapability.ts`, `src/storage/deviceCapabilityDetector.ts`, `src/components/DeviceCapabilityCard.tsx`
   - `src/utils/useAccessibleDialog.ts`, `src/utils/useVirtualWindow.ts`, `src/utils/lazyRoute.tsx`, `src/utils/webFileActions.ts`
   - `src/storage/webSqliteAdapter.ts`, `src/storage/opfsStorage.ts`, `src/storage/storageProtection.ts`, `src/storage/backgroundFreezeCoordinator.ts`, `src/storage/localSyncChannels.ts`, `src/storage/pwaUpdateManager.ts`, `src/storage/offThreadWorkerClient.ts`, `src/storage/webImageOptimizer.ts`, `src/storage/photoHydration.ts`
2. Output a concise Gap Table per file: already present (skip), missing behavior (keep), and doc/registry sync items (`IMPROVEMENTS.md`, `improvementRegistry.ts`, `active-backlog-plan.md`).
3. Update `docs/plans/active-backlog-plan.md` (after confirming if another active plan is mid-flight) and pause if near token budget, or proceed to Phase 1.

---

## Phase 1: Conservative Tier-1 Guardrails, Cross-Device Shell & Low-Memory UI
**Targets:** `index.html`, `src/index.css`, `src/App.tsx`, `src/core/deviceCapability.ts`, `src/storage/deviceCapabilityDetector.ts`, `src/components/DeviceCapabilityCard.tsx`, `src/components/PWAInstallButton.tsx`, `src/utils/useAccessibleDialog.ts`, `src/components/AnimalEditorModal.tsx`, `src/components/BreedingScreen.tsx`, `src/components/SearchableParentPicker.tsx`, `src/components/CarrierTraitCombobox.tsx`, `src/components/HerdScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/components/PedigreeScreen.tsx`

1. **Tier-1 & Non-PWA Framing:** Treat `navigator.deviceMemory === undefined` (Safari/Firefox) neutrally rather than as low RAM; support updated Chromium buckets (`1`–`32` GB) alongside CPU/viewport/runtime signals. Present honest, conservative Tier-1 herd/pedigree limits and clear guidance when a browser lacks reliable persistent PWA storage (suggesting a more capable browser today without promising future shared/cloud workflows).
2. **Viewport, Safe Areas & Cold Start:** Ensure `<meta name="viewport">` has `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content` and never blocks zoom (`user-scalable=no` / `maximum-scale=1`). Apply `env(safe-area-inset-*)` and `@supports(padding: max(0px))` (`max(16px, env(safe-area-inset-bottom))`) to fixed/sticky bars, use `100dvh`/`100svh` with `100vh` fallbacks, and avoid cold-start standalone header jumps.
3. **Mobile Keyboard Inset (`--kb-inset`):** Add a lightweight `window.visualViewport` helper (`resize` + `scroll`, re-read via `requestAnimationFrame` on `focusin`) setting `--kb-inset` on `document.documentElement` without resizing root height in JS. Anchor sticky form/modal footers (`AnimalEditorModal.tsx`, `BreedingScreen.tsx`, `SearchableParentPicker.tsx`) with `calc(var(--kb-inset, 0px) + env(safe-area-inset-bottom))` and verify `inputmode` / `autocomplete`.
4. **Standalone Chrome & `CloseWatcher`:** In standalone mode (`matchMedia('(display-mode: standalone)')` / `navigator.standalone`), show a Back button on non-root views, an in-app Refresh action wired to `pwaUpdateManager.ts`, and external-link cues. Keep `PWAInstallButton.tsx` accurate for non-standalone iOS Safari. In `useAccessibleDialog.ts`, guard `CloseWatcher` (`typeof CloseWatcher !== 'undefined'`) for Android Back / `Esc` / scrub gestures with dirty-form `onCancel` confirmation and a plain `keydown` Escape fallback without duplicate `history.pushState` pushes.
5. **Offscreen Rendering, Wake Lock & A11y:** Pair `useVirtualWindow.ts` with `content-visibility: auto` + `contain-intrinsic-size` on heavy non-virtualized sections while keeping in-app search prominent (Safari `Cmd+F` can miss skipped offscreen text). Add an opt-in "Keep screen awake" toggle in active barn/pedigree views using `navigator.wakeLock` in `try/catch` (gesture-triggered, re-acquired on `visibilitychange` when enabled, released on exit/unmount). Enforce >=24px (44–48px preferred) touch targets, `prefers-reduced-motion`, `color-scheme`, 200% zoom, and selectable text.

**Gate:** Run typecheck, lint, and relevant UI/capability tests; update `docs/plans/active-backlog-plan.md`.

---

## Phase 2: Storage, Lifecycle & Write-Safe PWA Update Hardening
**Targets:** `src/storage/webSqliteAdapter.ts`, `src/storage/opfsStorage.ts`, `src/storage/storageProtection.ts`, `src/storage/backgroundFreezeCoordinator.ts`, `src/storage/localSyncChannels.ts`, `src/storage/pwaUpdateManager.ts`, `src/components/WipedStorageRecoveryModal.tsx`, `vite.config.ts`

1. **OPFS / IndexedDB / Quota Fallbacks:** Fall back cleanly when OPFS is unavailable or throws (e.g., Safari Private mode) to IndexedDB VFS or an explicit ephemeral-session banner with a 1-tap "Export before closing" reminder. Chunk bulk reads/writes on IndexedDB fallback to prevent Safari `RangeError` / `QuotaExceededError`. Check `navigator.storage.estimate()` before bulk imports or photo saves to abort/downgrade oversized photo additions before hitting tight private-mode caps (~100 MB / ~5% disk), offering text-only import and backup export. Request/check `navigator.storage.persist()` cleanly after engagement and warn when persistence is denied or headroom is low.
2. **Multi-Tab Worker Locks & Lifecycle:** Guard `navigator.locks` defensively, hold a Web Lock on the active DB worker when supported so background tabs serving sibling tabs via `localSyncChannels.ts` aren't suspended, and add query timeouts with a "Reconnect storage" action. Flush dirty buffers on `visibilitychange` (`hidden`) and `pagehide` (never `unload`); re-validate OPFS handles and worker health on `pageshow` (`persisted`) and `visibilitychange` (`visible`) with bounded `SQLITE_BUSY` retries.
3. **iOS Container Isolation Notice:** In `WipedStorageRecoveryModal.tsx`, detect an empty DB in standalone iOS mode and explain Safari-vs-Home-Screen container isolation with Export-from-Safari / Import-into-PWA steps.
4. **GitHub Pages Cache & Write-Safe Updates:** Set a unique `workbox.cacheId` prefix, aligned `base` path, and `registerType: 'prompt'` in `vite.config.ts`. In `pwaUpdateManager.ts`, hold off SW activation/reload while any write, sync/export, or open/dirty editor is active; once clear, flush state, release locks, call `updateSW()`, and include a fallback `window.location.reload()` timer if `controllerchange` stalls.

**Gate:** Run storage/lifecycle/update tests (`opfsStorage.test.ts`, `crossTabLockAndReload.test.ts`, `backgroundFreezeAndToast.test.ts`, `es2018AndPwaUpdate.test.ts`, `stageBResilience.test.ts`); update `docs/plans/active-backlog-plan.md`.

---

## Phase 3: Cross-Platform Export Cascade & Canvas/Photo Memory Protection
**Targets:** `src/utils/webFileActions.ts`, `src/components/UnifiedBackupVaultPanel.tsx`, `src/components/ImportExportHubScreen.tsx`, `src/storage/webImageOptimizer.ts`, `src/storage/photoHydration.ts`, `src/components/AnimalPhotoGallery.tsx`

1. **3-Tier Export Cascade (`webFileActions.ts`):** Add narrow `isInstalledIosPwa()` (`iPhone|iPad|iPod` or `MacIntel` with `maxTouchPoints > 1`, plus standalone display mode):
   - **Installed iOS/iPadOS PWA:** Pre-prepare a `Blob`-backed `File` (never base64 data URLs) so transient user activation does not expire before `navigator.share()`. Check `window.isSecureContext`, `navigator.share`, and `navigator.canShare({ files: [file] })`, then call `await navigator.share({ files: [file] })` for "Save to Files". Treat `AbortError` as harmless cancel keeping the file ready; after resolve, remind the user to verify the file in its destination rather than claiming guaranteed save. If `canShare` is unavailable/false on standalone iOS, **never** call `<a download>`; show instructions to open in Safari and provide a clipboard copy action for text exports.
   - **Desktop Chromium:** Feature-detect `typeof window.showSaveFilePicker === 'function'` under user activation, treat `AbortError` as cancel, and fall back to `<a download>` when unavailable.
   - **Desktop Firefox/Safari & Android:** Use `<a download>` with a `Blob` object URL, revoking it only after safe handoff.
2. **Canvas & ObjectURL Hygiene:** Process photos sequentially on constrained paths; prefer `createImageBitmap(blob, { resizeWidth, resizeHeight, resizeQuality: 'high' })` when supported; set `canvas.width = 0; canvas.height = 0` inside `finally` after `canvas.toBlob()`; revoke `URL.createObjectURL()` URLs on swap, modal close, and unmount; and if canvas context creation fails or image optimization rejects under memory pressure, fall back to saving the text record with a "Photos paused to conserve memory" notice.

**Gate:** Run `photoHydrationAndWorker.test.ts` and file-action tests; update `docs/plans/active-backlog-plan.md`.

---

## Phase 4: Worker Crash Recovery & Lazy Bundle Splitting
**Targets:** `src/storage/offThreadWorkerClient.ts`, `src/storage/archiveAndImport.worker.ts`, `src/components/ExternalImporterPanel.tsx`, `src/utils/lazyRoute.tsx`, `src/App.tsx`, `src/components/TechyStuffErrorBoundary.tsx`, `src/components/CrashErrorBoundary.tsx`

1. **Worker Timeout & OOM Recovery:** Attach `error`, `messageerror`, and an inactivity timeout to `offThreadWorkerClient.ts` jobs; on crash/timeout, call `worker.terminate()`, clean up pending promises, respawn on next job, and offer a smaller-batch retry or yielded main-thread fallback for text-only/smaller payloads.
2. **Lazy Route/Modal Splitting:** Move non-initial heavy screens/modals in `src/App.tsx` (`ImportExportHubScreen.tsx`, `SpeciesDashboardScreen.tsx`, `ExternalImporterPanel.tsx`, `TechyStuffScreen.tsx`, `DiagnosticsAndSupportPanel.tsx`, `ReportsScreen.tsx`) behind `lazyRoute.tsx` wrapped by error boundaries with an offline stale-chunk reload prompt.

**Gate:** Run `lazyRoute.test.ts`, `resilienceAndUniversalImport.test.ts`, and production `build`; update `docs/plans/active-backlog-plan.md`.

---

## Phase 5: Regression Tests, Registry Sync & Final Recheck
**Targets:** `src/storage/__tests__/`, `src/core/__tests__/`, `src/utils/__tests__/`, `IMPROVEMENTS.md`, `src/core/improvementRegistry.ts`, `docs/plans/suggestions-backlog.md`, `docs/plans/active-backlog-plan.md`

1. **Regression Tests:** Cover `webFileActions.ts` (`showSaveFilePicker` + `AbortError`, `<a download>`, standalone iOS `canShare`/`share`/`AbortError` and `canShare === false` without `<a download>`), `deviceCapabilityDetector.ts` (`deviceMemory === undefined`, Chromium 147+ buckets, missing/throwing `navigator.storage`, Tier-1 conservatism), `--kb-inset` + `useAccessibleDialog` (`CloseWatcher` + `Escape` fallback + single-history guard), canvas null/cleanup + `revokeObjectURL`, worker timeout/`terminate()` recovery, and `pwaUpdateManager.ts` deferring updates during active writes or open/dirty editors.
2. **Registry & CI Checks:** Update `IMPROVEMENTS.md` and `src/core/improvementRegistry.ts` as needed; run all `package.json` verification scripts (`test`, `verify:improvements`, typecheck, `lint`, `build`) before updating `active-backlog-plan.md` and `suggestions-backlog.md`.
3. **Final Recheck & Optimization Audit:** Re-check all diffs against `prompts/master_system_prompt.md`, hard constraints, and user goals; trim dead code, redundant state, or unnecessary token bloat; run a final verification pass on affected checks and summarize results concisely.
