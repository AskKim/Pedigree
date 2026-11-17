# Community Pedigree — App Improvements & GitHub-Overwrite Recovery Log

This document is synchronized with `src/core/improvementRegistry.ts` and verified automatically
by `npm run verify:improvements` (and GitHub Actions CI). If an upstream GitHub pull or AI Studio
sync overwrites customized files, run the verifier to pinpoint exactly which improvements were wiped
and follow the restoration playbook below.

## Quick Verification & Recovery Commands

```bash
# 1. Check all tracked improvement invariants against files on disk
npm run verify:improvements

# 2. Run domain unit tests (includes improvementRegistry drift checks)
npm test

# 3. Typecheck and build
npm run lint && npm run build
```

You can also open **Settings → Diagnostics & Support → App Improvements & Recovery Log** inside the app to browse every entry, copy recovery notes, or download `IMPROVEMENTS.md` / `pedigree-improvements-log.json` offline.

---

## Logged Improvements (23)

### IMP-001: Backup Freshness Tracking, Reminders & Clean Human-Readable Exports

- **Category:** Backups & Safety (`backup-safety`)
- **Origin:** Session Improvement
- **User Goal:** Add backup reminders and timestamps where necessary, place backup buttons prominently, and keep backups clean and human-readable.
- **Summary:** Tracks external backup timestamps/formats, renders proactive dismissible/snoozable backup reminders when non-testing edits are unbacked, and writes human-readable JSON v5 backups with `barnSummary` and clean filenames.
- **Tracked Files:** `src/core/backupStatus.ts`, `src/core/syncAndExports.ts`, `src/hooks/useBarnStore.ts`, `src/App.tsx`, `src/components/SettingsAndSyncScreen.tsx`

**Restoration Playbook if Overwritten:**
1. Restore `evaluateBackupStatus` and timestamp formatters in `src/core/backupStatus.ts`.
2. Ensure `exportBarnBackupJson` emits `exportedAtLocal`, `barnSummary`, and deterministically sorted animals in `src/core/syncAndExports.ts`.
3. Wire `lastBackupMeta`, `recordBackupExport`, and `snoozeBackupReminder` in `src/hooks/useBarnStore.ts` and connect banner/cards in `src/App.tsx` and `src/components/SettingsAndSyncScreen.tsx`.

### IMP-002: Timestamped Pre-Removal Safety Backups & Non-Testing Record Purge

- **Category:** Backups & Safety (`backup-safety`)
- **Origin:** Session Improvement
- **User Goal:** Provide collision-free timestamped backups before removing a species or clearing non-testing entries in case corruption caused the reset.
- **Summary:** Recommends and triggers second-precision timestamped species backups before deleting a species, wiping all species data, or clearing only non-testing livestock entries—never overwriting stable daily backups.
- **Tracked Files:** `src/core/sampleData.ts`, `src/core/syncAndExports.ts`, `src/hooks/useBarnStore.ts`, `src/components/SpeciesDashboardScreen.tsx`

**Restoration Playbook if Overwritten:**
1. Ensure `buildSpeciesSafetyBackupFileName` and 3-arg `exportSpeciesBackupJson(..., { reason })` exist in `src/core/syncAndExports.ts`.
2. Keep `countSpeciesNonTestingRecords` and `purgeSpeciesNonTestingDataPure` in `src/core/sampleData.ts`.
3. Expose `deleteSpeciesNonTestingData` in `src/hooks/useBarnStore.ts` and wire confirmation + timestamped backup buttons in `src/components/SpeciesDashboardScreen.tsx`.

### IMP-003: Decluttered Home Species Cards with Targeted Alerts & Arriving-Babies Indicator

- **Category:** Home & Alerts (`alerts-home`)
- **Origin:** Session Improvement
- **User Goal:** Keep Home species cards focused strictly on navigation, sorting, due/overdue task actionability, and upcoming births.
- **Summary:** Removes clutter from Home cards and adds targeted Due/Overdue Task alerts (Do / Ignore Permanently / Clear Current Group) plus Arriving-Babies gestation alerts.
- **Tracked Files:** `src/core/models.ts`, `src/core/barnAlerts.ts`, `src/hooks/useBarnStore.ts`, `src/components/HomeSpeciesScreen.tsx`

**Restoration Playbook if Overwritten:**
1. Export `pluralizeSpeciesLabel` from `src/core/models.ts`.
2. Use `evaluateSpeciesDueTasksAlert` and `evaluateSpeciesArrivingBabiesAlert` in `src/components/HomeSpeciesScreen.tsx`.
3. Ensure `clearTaskAlertGroup(speciesName, groupSignature)` persists the string signature in `dismissedTaskGroupKeys`.

### IMP-004: Optional Default Species Naming Prefix with Delimiter-Aware Override

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Save repetitive typing for rabbitry/herd prefixes without double-prefixing or blocking custom names.
- **Summary:** Supports per-species optional `defaultAnimalPrefix` (`Oak Ridge` or `OR-`) applied automatically on animal and litter creation only if the name does not already begin with the prefix, while letting users edit or override anytime.
- **Tracked Files:** `src/core/models.ts`, `src/hooks/useBarnStore.ts`, `src/components/HerdScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`

**Restoration Playbook if Overwritten:**
1. Keep `applyAnimalNamePrefix` (and `applySpeciesNamePrefix` alias) in `src/core/models.ts`.
2. Apply `applyAnimalNamePrefix` in animal creation forms (`HerdScreen.tsx`) and litter generation (`useBarnStore.ts`).

### IMP-005: Species Hub Management Relocation, Cross-Species Migration Modal & Herd Pagination

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Move heavy destructive & migration controls into each species hub and support safe family-linked cross-species moves.
- **Summary:** Moves species backup, delete, and migrate controls out of Home mini-cards into each Species Hub & Herd screen; adds pedigree-family-aware `SpeciesMigrationModal` and 50-row Show More pagination in `HerdScreen`.
- **Tracked Files:** `src/core/speciesMigration.ts`, `src/components/SpeciesMigrationModal.tsx`, `src/components/HerdScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/hooks/useBarnStore.ts`

**Restoration Playbook if Overwritten:**
1. Wire `migrateAnimalsToSpecies` + rolling safety snapshot inside `useBarnStore.ts`.
2. Render `SpeciesMigrationModal` in both `HerdScreen.tsx` (single/multi-select) and `SpeciesDashboardScreen.tsx` (bulk-all).
3. Keep `HERD_PAGE_SIZE = 50` slicing + Show More button in `HerdScreen.tsx`.

### IMP-006: Archive-Aware Herd Status & Importer Normalization

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Ensure historical/inactive imported stock stays archived cleanly for pedigrees without triggering active barn tasks.
- **Summary:** Includes `Archived` in `AnimalStatus`, aligns `isAnimalArchived` / `isAnimalActive` / `normalizeAnimalStatus`, and teaches HerdBoss CSV importer to distinguish `Archived` & `Active` flags from `Reference` flags.
- **Tracked Files:** `src/core/models.ts`, `src/core/importers/herdBossImporter.ts`, `src/core/syncAndExports.ts`

**Restoration Playbook if Overwritten:**
1. Keep `Archived` in `AnimalStatus` and `ANIMAL_STATUSES` in `src/core/models.ts`.
2. Keep `isAnimalActive`, `isAnimalArchived`, and `normalizeAnimalStatus` aligned with `herdBossImporter.test.ts`.
3. Separate `archivedFlag` and `activeFlag` lookup in `src/core/importers/herdBossImporter.ts`.

### IMP-007: Mobile Chrome Crash Prevention, Cycle-Guarded COI & Batch Storage Writes

- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Fix repeated Chrome Android tab crashes before/during app startup and keep pedigree/bulk operations fast under tight mobile RAM.
- **Summary:** Disables Workbox SW in dev + adds self-unregistering `/dev-sw.js` middleware, scopes eager COI computation off home/settings boot, guards `PedigreeIndex.inbreeding` recursion cycles, batches SQLite/IndexedDB mutations, and code-splits secondary routes with `React.lazy`.
- **Tracked Files:** `vite.config.ts`, `src/main.tsx`, `src/core/pedigreeCalculator.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`

**Restoration Playbook if Overwritten:**
1. Set `devOptions: { enabled: false }` and keep `devServiceWorkerCleanupPlugin` in `vite.config.ts`.
2. Guard `registerSW` behind `if (import.meta.env.PROD)` and unregister dev SWs in `src/main.tsx`.
3. Forward `activeCalls` inside `PedigreeIndex.inbreeding` in `src/core/pedigreeCalculator.ts` and skip unnecessary COI precompute on `home`/`settings` in `src/hooks/useBarnStore.ts`.

### IMP-008: Hardcoded Root Base Path & Disabled Dev HMR Config + GitHub Actions CI

- **Category:** CI & Tooling (`ci-tooling`)
- **Origin:** Session Improvement
- **User Goal:** Automatically verify all domain tests, lint, improvements, and PWA builds on every push with `/` and disabled dev HMR hardcoded so AI Studio never prompts for env vars.
- **Summary:** Hardcodes `basePath = '/'`, `hmr: false`, and `watch: null` in Vite config (removing `process.env.VITE_BASE_PATH` / `process.env.DISABLE_HMR` and omitting them from `.env.example`), and runs unit tests, improvement verification, lint, and builds in `.github/workflows/ci.yml`.
- **Tracked Files:** `vite.config.ts`, `.env.example`, `.github/workflows/ci.yml`, `package.json`

**Restoration Playbook if Overwritten:**
1. Keep `const basePath = '/'`, `hmr: false`, and `watch: null` hardcoded in `vite.config.ts` without reading `process.env.VITE_BASE_PATH` or `process.env.DISABLE_HMR`.
2. Do not add `VITE_BASE_PATH` or `DISABLE_HMR` to `.env.example`.
3. Ensure `package.json` defines `"test"` and `"verify:improvements"`, and `.github/workflows/ci.yml` executes both.

### IMP-009: Crash Error Boundary, Persistent Crash Log & DB Health Self-Repair

- **Category:** Diagnostics & Sync (`diagnostics-sync`)
- **Origin:** Preserved Upstream Feature
- **User Goal:** Diagnose and recover from browser/storage failures on mobile without losing breeder data.
- **Summary:** Catches render/window/promise crashes in `CrashErrorBoundary` + `crashLogger.ts`, exposes IndexedDB persistent-storage protection + DB integrity scan & repair in `dataHealthCheck.ts`, and exports one-click diagnostic ZIP support bundles.
- **Tracked Files:** `src/components/CrashErrorBoundary.tsx`, `src/storage/crashLogger.ts`, `src/core/dataHealthCheck.ts`, `src/core/supportBundle.ts`, `src/storage/storageProtection.ts`

**Restoration Playbook if Overwritten:**
1. Keep `CrashErrorBoundary` wrapping `<App />` and `installGlobalCrashHandlers()` in `src/main.tsx`.
2. Preserve `DiagnosticsAndSupportPanel.tsx` integration inside `SettingsAndSyncScreen.tsx`.

### IMP-010: Offline Delta Sync Outbox, Conflict Log & Complete ZIP Photo Archive

- **Category:** Diagnostics & Sync (`diagnostics-sync`)
- **Origin:** Preserved Upstream Feature
- **User Goal:** Enable multi-device barn sync and complete archival exports containing both records and photos.
- **Summary:** Provides local-first field-level delta sync bundles, Syncthing/shared-folder direct sync, field collision review log, and Complete Archive `.ZIP` exports bundling real organized animal image files alongside SQLite + JSON.
- **Tracked Files:** `src/core/syncOutbox.ts`, `src/storage/localSyncChannels.ts`, `src/core/backupArchive.ts`, `src/components/SettingsAndSyncScreen.tsx`

**Restoration Playbook if Overwritten:**
1. Preserve `syncOutbox.ts`, `localSyncChannels.ts`, and `backupArchive.ts` hooks inside `useBarnStore.ts` and `SettingsAndSyncScreen.tsx`.

### IMP-011: Durable App Improvement Registry & GitHub-Overwrite Drift Verifier

- **Category:** CI & Tooling (`ci-tooling`)
- **Origin:** Session Improvement
- **User Goal:** Log every improvement in a durable, exportable system so a future GitHub sync wiping files can be detected and put back accurately.
- **Summary:** Maintains `src/core/improvementRegistry.ts`, human-readable `IMPROVEMENTS.md`, automated CLI verifier `scripts/verify-improvements.ts`, and in-app export/copy panel inside Diagnostics so any GitHub overwrite is immediately spotted and restorable.
- **Tracked Files:** `src/core/improvementRegistry.ts`, `scripts/verify-improvements.ts`, `IMPROVEMENTS.md`, `src/components/DiagnosticsAndSupportPanel.tsx`, `src/core/__tests__/improvementRegistry.test.ts`

**Restoration Playbook if Overwritten:**
1. Run `npm run verify:improvements` after any pull/merge from GitHub to list wiped invariants.
2. Use `IMPROVEMENTS.md` or the downloaded `pedigree-improvements-log.json` to restore missing helpers and wiring.

### IMP-012: Startup Self-Healing, Lazy Firebase Auth Guard & Corrective Action Logging

- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Auto-fix any initial loading or crash errors on startup and log every corrective action for debugging.
- **Summary:** Prevents initial-load crashes and infinite loading hangs by lazily initializing Firebase Auth, wrapping SQLite JSON parsing in safe recovery helpers, isolating secondary startup promises with `Promise.allSettled`, running automatic startup health self-repair, falling back to rolling/starter snapshots on fatal DB load errors, and logging every corrective action via `logDiagnosticEvent`.
- **Tracked Files:** `src/hooks/useBarnStore.ts`, `src/storage/webSqliteAdapter.ts`, `src/utils/googleCalendarClient.ts`, `src/App.tsx`

**Restoration Playbook if Overwritten:**
1. Ensure `normalizeRufusLevel` is imported from `../core/models` in `src/hooks/useBarnStore.ts`.
2. Keep lazy `getFirebaseAuthSafe()` in `src/utils/googleCalendarClient.ts` and `safeParseJson()` in `src/storage/webSqliteAdapter.ts`.
3. Keep startup `Promise.allSettled`, `repairBarnDataHealth`, emergency recovery, and `Corrective action:` `logDiagnosticEvent` calls in `src/hooks/useBarnStore.ts`.

### IMP-013: Mobile Memory Hardening, Accessibility & Universal Pedigree Importer

- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Optimize memory for mobile-first usage, improve cross-device accessibility, and import heterogeneous pedigree files gracefully without crashing.
- **Summary:** Adds `UniversalPedigreeImporter` for Evans `.HTM` rowspan trees, multi-gen CSV/TSV/pipe spreadsheets (UTF-8/UTF-16/Windows-1252, Excel serial dates), and nested JSON trees; hardens mobile memory/recursion bounds; and enforces dialog focus traps, label bindings, live regions, and keyboard accessibility across screens.
- **Tracked Files:** `src/core/importers/universalPedigreeImporter.ts`, `src/core/importers/archiveAndCsvUtils.ts`, `src/core/importers/registry.ts`, `src/core/pedigreeCalculator.ts`, `src/core/dataHealthCheck.ts`, `src/components/ExternalImporterPanel.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/core/__tests__/resilienceAndUniversalImport.test.ts`

**Restoration Playbook if Overwritten:**
1. Restore `UniversalPedigreeImporter` and register it in `src/core/importers/registry.ts`.
2. Keep `decodeTextBytes` UTF-16/Windows-1252 decoding and `validateAndFormatYmd` in `src/core/importers/archiveAndCsvUtils.ts`.
3. Preserve `visitedPath` cycle guard on `countDirectAncestors` in `src/core/pedigreeCalculator.ts` and accessibility attributes across modal/form components.

### IMP-014: Species Tattoo/Sex Conflict Guardrails, Override & Import Conflict Alerts

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Catch duplicate within-species IDs and parent sex mismatches, discourage accidental duplicate tattoos with an explicit override, never hard-block imports on conflicts, and let breeders locate or ignore soft warnings.
- **Summary:** Enforces same-species duplicate tattoo/ID checks and parent sex checks in DB health scans, requires typing `override` before reusing a same-sex duplicate tattoo on animal/litter creation, flags imported conflicts non-blockingly via `importConflictAlert` + `Conflicts First` sorting, and supports persistent per-animal soft-warning ignore toggles.
- **Tracked Files:** `src/core/animalConflicts.ts`, `src/core/dataHealthCheck.ts`, `src/components/AnimalEditorModal.tsx`, `src/components/BreedingScreen.tsx`, `src/components/HerdScreen.tsx`, `src/hooks/useBarnStore.ts`, `src/App.tsx`, `src/core/__tests__/animalConflictsAndHealth.test.ts`

**Restoration Playbook if Overwritten:**
1. Keep `findSameSexDuplicateTattooCollisions`, `isOverrideConfirmationValid`, and `analyzeBarnAnimalConflicts` in `src/core/animalConflicts.ts`.
2. Preserve duplicate tattoo and parent sex mismatch checks in `src/core/dataHealthCheck.ts`.
3. Keep `"override"` guards in `AnimalEditorModal.tsx` and `BreedingScreen.tsx`, `conflicts_first` sorting/ignore controls in `HerdScreen.tsx`, and `importConflictAlert` wiring in `useBarnStore.ts` / `App.tsx`.

### IMP-015: 5-Tier Device Capability Detection & Adaptive Memory Cautions

- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Detect constrained mobile devices early, warn users appropriately by hardware tier, and keep Tier 1–2 cautions impossible to accidentally hide permanently.
- **Summary:** Classifies host hardware into 5 memory/CPU tiers, surfaces hardware guidance in Home onboarding and Settings with tier-locked dismissal rules (Tier 1 locked in both; Tier 2 closable on Home, persistent in Settings; Tiers 3–5 closable and reopenable), and applies workload cautions in the External Importer.
- **Tracked Files:** `src/core/deviceCapability.ts`, `src/storage/deviceCapabilityDetector.ts`, `src/components/DeviceCapabilityCard.tsx`, `src/components/HomeSpeciesScreen.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/components/ExternalImporterPanel.tsx`, `src/App.tsx`, `src/core/__tests__/deviceCapability.test.ts`

**Restoration Playbook if Overwritten:**
1. Preserve `DEVICE_CAPABILITY_TIERS`, `classifyDeviceCapability`, and `evaluateBarnWorkloadForTier` in `src/core/deviceCapability.ts`.
2. Keep `useDeviceCapability` in `src/storage/deviceCapabilityDetector.ts` and `<DeviceCapabilityCard>` mounts in `HomeSpeciesScreen.tsx` and `SettingsAndSyncScreen.tsx`.

### IMP-016: Route-Level Code Splitting with Retry & Chunk Error Boundary

- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Reduce startup JS bundle size and memory pressure by lazy-loading secondary screens without breaking offline or stale-chunk recovery.
- **Summary:** Code-splits secondary screens and calendar modal via `lazyNamedRoute` (`React.lazy`) with automatic single retry, `RouteLoadingFallback` skeleton, and `RouteErrorBoundary` recovery UI.
- **Tracked Files:** `src/utils/lazyRoute.tsx`, `src/App.tsx`, `src/utils/__tests__/lazyRoute.test.ts`

**Restoration Playbook if Overwritten:**
1. Keep `lazyNamedRoute`, `loadWithSingleRetry`, `RouteLoadingFallback`, and `RouteErrorBoundary` in `src/utils/lazyRoute.tsx`.
2. Keep `React.lazy` declarations and `<RouteErrorBoundary><Suspense>` wrapping secondary routes in `src/App.tsx`.

### IMP-017: On-Demand Full-Resolution Photo Hydration & Off-Thread `.ZIP`/Import Worker

- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Eliminate heavy base64 photo retention and UI-thread freezes during large `.ZIP` backups and external pedigree imports on mobile devices.
- **Summary:** Keeps only lightweight thumbnails in reactive snapshot RAM, lazily hydrates full-resolution photo `dataUrl`s via `BoundedPhotoDataCache` and SQLite fetchers on gallery/lightbox/print/export demand while protecting stored `data_url` rows on write, and runs `.ZIP` builds/extractions and external archive parsing in a dedicated Web Worker with async fallback.
- **Tracked Files:** `src/storage/photoHydration.ts`, `src/storage/webSqliteAdapter.ts`, `src/storage/archiveAndImport.worker.ts`, `src/storage/offThreadWorkerClient.ts`, `src/hooks/useBarnStore.ts`, `src/components/AnimalPhotoGallery.tsx`, `src/components/ExternalImporterPanel.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/storage/__tests__/photoHydrationAndWorker.test.ts`

**Restoration Playbook if Overwritten:**
1. Keep `BoundedPhotoDataCache` and `hydrateSnapshotWithPhotoDataUrls` in `src/storage/photoHydration.ts` plus `lightweightPhotos` guards in `src/storage/webSqliteAdapter.ts`.
2. Keep `archiveAndImport.worker.ts` and `offThreadWorkerClient.ts` wired into `useBarnStore.ts`, `SettingsAndSyncScreen.tsx`, `DiagnosticsAndSupportPanel.tsx`, and `ExternalImporterPanel.tsx`.
3. Keep `onLoadFullPhoto` / `onHydrateSnapshotForExport` props wired from `App.tsx` to galleries, pedigree print modals, Barn Binders, and backup exports.

### IMP-018: Hybrid OPFS Storage Vault, Archived Herds, Wiped-Storage Recovery & IDB Migration Guard

- **Category:** Backups & Safety (`backup-safety`)
- **Origin:** Session Improvement
- **User Goal:** Isolate temporary exports in OPFS `/tmp`, unify automated + manual backup vaults in OPFS `/backups` with IDB fallback, offload Sold/Deceased stock to OPFS `/archives` while preserving ancestor pedigree stubs, pause on wiped browser storage with restore recovery, and dump raw stores before resetting failed IndexedDB migrations.
- **Summary:** Adds pure TS schema v6 envelopes, SHA-256 verification, legacy migration, and `.archive.zip` bundling in `backupVault.ts`; manages OPFS `/tmp`, `/backups` (retention 6 monthly / 3 pre-upgrade / 8 pre-reset), `/archives`, boot orphan sweeps, `QuotaExceededError` recovery, idle Export Canary, prior-use sentinel, and IndexedDB rescue dumps in `opfsStorage.ts`; and mounts `UnifiedBackupVaultPanel`, `ArchivedHerdsModal`, `WipedStorageRecoveryModal`, and a 1-click Save to Vault banner.
- **Tracked Files:** `src/core/backupVault.ts`, `src/storage/opfsStorage.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/UnifiedBackupVaultPanel.tsx`, `src/components/ArchivedHerdsModal.tsx`, `src/components/WipedStorageRecoveryModal.tsx`, `src/App.tsx`, `src/core/__tests__/backupVault.test.ts`, `src/storage/__tests__/opfsStorage.test.ts`

**Restoration Playbook if Overwritten:**
1. Keep `src/core/backupVault.ts` pure TypeScript with schema v6 migration, SHA-256 verification, and `computePedigreeReferencedIds` stub preservation.
2. Keep `src/storage/opfsStorage.ts` managing `/tmp`, `/backups`, `/archives`, `try/finally` `.close()`, boot sweeps, canary checks, and IDB failure dumps.
3. Keep `UnifiedBackupVaultPanel.tsx`, `ArchivedHerdsModal.tsx`, `WipedStorageRecoveryModal.tsx`, `useBarnStore.ts`, and `App.tsx` connected.

### IMP-019: ES2018 Compatibility Build, Crash-Loop Circuit Breaker, Manual SW Update & Graceful Fallbacks

- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Support 2018+ browsers gracefully without polyfill bloat, break reload/crash loops cleanly, defer PWA updates while editing, offer low-memory DB-only exports, and keep unavailable controls visible with explanation text.
- **Summary:** Downlevels TS/Vite build to ES2018 (`chrome68`, `safari12`, `firefox63`, `edge79`) with zero-bloat shims (`src/utils/es2018Shims.ts`), runs an ES5 pre-flight guard + 3-in-60s startup crash-loop circuit breaker and `?emergency_reset=true` panic hatch in `index.html`, uses a manual `registerType: 'prompt'` Service Worker update gate with `controllerchange` single-reload handshake and open-modal deferral (`src/storage/pwaUpdateManager.ts`, `App.tsx`), prompts Tier 1/outdated browsers with Database-Only `.JSON` (Skip Photos) exports before heavy `.ZIP` builds, windows report tables (100 rows) and care logs (30 rows), and keeps unsupported optional controls visible with clear disabled reasons (including `PrintPreviewModal` `Share .HTM`).
- **Tracked Files:** `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/utils/es2018Shims.ts`, `src/storage/pwaUpdateManager.ts`, `src/core/deviceCapability.ts`, `src/storage/deviceCapabilityDetector.ts`, `src/utils/webFileActions.ts`, `src/components/UnifiedBackupVaultPanel.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/components/PrintPreviewModal.tsx`, `src/App.tsx`

**Restoration Playbook if Overwritten:**
1. Keep ES2018 target in `tsconfig.json` and `vite.config.ts` (`safari12`, `registerType: 'prompt'`, `workbox.navigateFallback: 'index.html'`) plus ES5 guard, crash-loop circuit breaker, and `?emergency_reset=true` in `index.html`.
2. Keep `src/utils/es2018Shims.ts` imported first in `src/main.tsx` alongside `src/storage/pwaUpdateManager.ts`.
3. Keep `assessBrowserCompatibility` and `getHeavyZipExportGate` in `src/core/deviceCapability.ts`, hook probes in `src/storage/deviceCapabilityDetector.ts`, disabled-with-reason UI controls (`Share .HTM`, Vault, Settings), Database-Only `.JSON` export, and report/care-log pagination.

### IMP-020: Mobile Background Freeze Pause/Resume, Double-Submit Guards & Async Error Toast

- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Prevent mid-batch IndexedDB corruption on iOS/Android background freeze, stop rapid-tap duplicate submits while holding unsaved form notes on write failures, and surface gentle non-blocking recovery toasts for uncaught async errors.
- **Summary:** Cooperatively pauses & checkpoints active Folder Sync and idle vault tasks on mobile background freeze (`visibilityState === "hidden"`), auto-resumes clean pauses on foreground return while keeping severity/permission faults sticky, adds bounded `sessionStorage` emergency crash traces (`pedigree_emergency_trace_v1`) + deduplicated `AsyncErrorToastHost` notifications for uncaught rejections/persistence errors, serializes `useBarnStore` mutations via a FIFO write queue (`enqueueStoreMutation`), and enforces synchronous `ref` + React submit locks (`useAsyncSubmitLock`, `useAsyncKeyedLock`) across primary forms, sync actions, and inline toggles.
- **Tracked Files:** `src/storage/backgroundFreezeCoordinator.ts`, `src/storage/crashLogger.ts`, `src/storage/localSyncChannels.ts`, `src/utils/useAsyncSubmitLock.ts`, `src/hooks/useBarnStore.ts`, `src/components/AsyncErrorToastHost.tsx`, `src/components/AnimalEditorModal.tsx`, `src/components/BreedingScreen.tsx`, `src/components/HerdScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/components/SpeciesEditorModal.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/components/DiagnosticsAndSupportPanel.tsx`, `src/App.tsx`, `src/utils/__tests__/asyncSubmitLock.test.ts`, `src/storage/__tests__/backgroundFreezeAndToast.test.ts`

**Restoration Playbook if Overwritten:**
1. Restore `src/storage/backgroundFreezeCoordinator.ts` and hook `notifyBackgroundTransition` inside `src/storage/crashLogger.ts`.
2. Preserve `writeEmergencySessionTraceSync`, `emitAsyncErrorToast`, and `handleUnhandledRejectionReason` in `src/storage/crashLogger.ts` and mount `<AsyncErrorToastHost />` in `src/App.tsx`.
3. Keep `withSyncIdb`, `sync_checkpoints` (IDB v3), `BackgroundPausedError`, and `resumePersistedDirectorySyncIfGranted` in `src/storage/localSyncChannels.ts` wired into `SettingsAndSyncScreen.tsx`.
4. Keep `enqueueStoreMutation` + Promise returns in `src/hooks/useBarnStore.ts` and `useAsyncSubmitLock` / `useAsyncKeyedLock` guards in `App.tsx`, `AnimalEditorModal.tsx`, `BreedingScreen.tsx`, `HerdScreen.tsx`, `SpeciesDashboardScreen.tsx`, `SpeciesEditorModal.tsx`, `SettingsAndSyncScreen.tsx`, and `DiagnosticsAndSupportPanel.tsx`.

### IMP-021: ARIA Combobox Navigation, Reports/Settings Shortcuts, Focus Polish & rAF Observer Optimization

- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Restore and strengthen keyboard shortcuts, tab stops, ARIA combobox navigation, and focus indicators while cleaning up minor export and DOM observer inefficiencies.
- **Summary:** Adds full WAI-ARIA keyboard navigation (`stepEnabledComboboxIndex`, `aria-activedescendant`, `ArrowDown`/`ArrowUp`/`Home`/`End`/`Enter`/`Escape`, `scrollIntoView`, and blur boundary closing) across `CarrierTraitCombobox`, `SearchableParentPicker`, and `ExternalImporterPanel`; adds `O` (Reports) and `S` (Import & Settings) global shortcuts with IME/widget guards and synchronized help panels; restores visible focus rings and pedigree focus scrolling; coalesces `App.tsx` modal `MutationObserver` via `requestAnimationFrame`; and aligns `buildPdfReadyBarnSnapshot` carrier disclosures.
- **Tracked Files:** `src/utils/comboboxNav.ts`, `src/utils/__tests__/comboboxNav.test.ts`, `src/components/CarrierTraitCombobox.tsx`, `src/components/SearchableParentPicker.tsx`, `src/components/ExternalImporterPanel.tsx`, `src/App.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/components/HomeSpeciesScreen.tsx`, `src/components/AnimalPhotoGallery.tsx`, `src/components/PedigreeScreen.tsx`, `src/components/HerdScreen.tsx`, `src/components/SpeciesMemoScreen.tsx`, `src/core/syncAndExports.ts`

**Restoration Playbook if Overwritten:**
1. Keep `src/utils/comboboxNav.ts` wired into `CarrierTraitCombobox.tsx`, `SearchableParentPicker.tsx`, and `ExternalImporterPanel.tsx` with `aria-activedescendant` and `onBlur`.
2. Keep rAF-coalesced `MutationObserver`, IME/widget guards, and `O`/`S` shortcuts in `src/App.tsx` synced with `SettingsAndSyncScreen.tsx`.
3. Preserve `focus-visible` outlines (`HomeSpeciesScreen.tsx`, `PedigreeScreen.tsx`, `AnimalPhotoGallery.tsx`), `WeightTrendSvg` ARIA labels (`HerdScreen.tsx`), `aria-pressed` (`SpeciesMemoScreen.tsx`), and `buildPdfReadyBarnSnapshot` carrier options (`syncAndExports.ts`).

### IMP-022: Virtualized Pedigree Branch Loading, PWA Update Governor, Offline Probe & Upgrade Gate

- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Keep pedigree SVG/DOM light on mobile devices, prevent unwanted or revoked app-shell reloads during active barn sessions, separate app offline holding from device Airplane Mode, and require verified backups on multi-version schema jumps.
- **Summary:** Bounds collapsed 4–6 generation pedigree chart DOM to Gen 0–3 (15 slots max) via lazy per-branch Gen 4+ expansion (`buildPedigreeBranchViewport`) while preserving full-depth `.HTM`/Barn Binder printouts; decouples PWA updates from raw `navigator.onLine` using `auto`/`notify`/`pinned` policy governance, a Manual App Offline toggle, and a timed `AbortController` captive-portal connectivity probe; and serves uncached `version.json`/`status.json` manifests with pre-upgrade SHA-256 backup verification and Safe-Harbor reset gates.
- **Tracked Files:** `src/core/pedigreeCalculator.ts`, `src/core/upgradeGate.ts`, `src/core/backupVault.ts`, `src/components/PedigreeScreen.tsx`, `src/storage/pwaUpdateManager.ts`, `src/storage/storageProtection.ts`, `src/hooks/useBarnStore.ts`, `src/components/SettingsAndSyncScreen.tsx`, `src/App.tsx`, `public/version.json`, `public/status.json`, `vite.config.ts`, `src/core/__tests__/upgradeGate.test.ts`, `src/core/__tests__/pedigreeCalculator.test.ts`, `src/storage/__tests__/es2018AndPwaUpdate.test.ts`

**Restoration Playbook if Overwritten:**
1. Keep `buildPedigreeBranchViewport`, `getGen3BranchIndex`, and `getGen3BranchesWithKnownAncestors` in `src/core/pedigreeCalculator.ts` wired into `PedigreeScreen.tsx`.
2. Preserve `src/core/upgradeGate.ts`, `buildVerifiedPreUpgradeJsonBackup` / `verifyPreUpgradeJsonBackup` in `src/core/backupVault.ts`, and uncached `public/version.json` & `public/status.json` with `no-store` middleware + Workbox denylist in `vite.config.ts`.
3. Keep `PwaUpdatePolicy` (`auto` / `notify` / `pinned`) + `fetchUpgradeGateDecision` in `src/storage/pwaUpdateManager.ts`, `setManualOfflineMode` + `probeNetworkConnectivity` in `src/storage/storageProtection.ts`, and UI controls in `App.tsx`, `useBarnStore.ts`, and `SettingsAndSyncScreen.tsx`.

### IMP-023: Storage Pruning, Pre-Restore Archive Inspector, Clock-Skew Compensation, Monotonic `_rev` & Encrypted Backups

- **Category:** Backups & Safety (`backup-safety`)
- **Origin:** Session Improvement
- **User Goal:** Prevent runaway photo quota growth, inspect backups for species/conflicts before committing restores, protect multi-device sync order against wrong or rewound clocks, avoid duplicate Google Calendar events, and offer opt-in passphrase encryption for shared archives/sync folders.
- **Summary:** Adds a Diagnostics Photo Storage & Orphan Attachment Pruner (`photoMaintenance.ts`, `reoptimizeAnimalPhotoRecord`), an off-thread Pre-Restore Archive Inspector dry-run for `.ZIP`/`.JSON`/`.SQLITE` (`archiveInspector.ts`, `inspectRawSqliteBytes`), persistent HTTP `Date` clock-skew compensation (`recordServerDateHeaderSkew`, `getAdjustedNowIsoUtc`) with a non-blocking drift banner, per-record monotonic `_rev` counters (`compareSameEntitySyncOperations`, `bumpRecordRevision`) paired with deterministic `[a-v0-9]` Google Calendar IDs + `409` `PUT` updates, and optional PBKDF2-SHA256 + AES-256-GCM passphrase encryption for shared backups and SyncThing deltas (`encryptedExport.ts`, `passphraseCrypto.ts`) while keeping plain 1-click exports as the default.
- **Tracked Files:** `src/core/photoMaintenance.ts`, `src/core/archiveInspector.ts`, `src/core/encryptedExport.ts`, `src/core/syncOutbox.ts`, `src/core/calendarExport.ts`, `src/core/models.ts`, `src/core/inputSanitization.ts`, `src/storage/passphraseCrypto.ts`, `src/storage/storageProtection.ts`, `src/storage/localSyncChannels.ts`, `src/storage/offThreadWorkerClient.ts`, `src/storage/archiveAndImport.worker.ts`, `src/storage/webImageOptimizer.ts`, `src/storage/webSqliteAdapter.ts`, `src/utils/googleCalendarClient.ts`, `src/hooks/useBarnStore.ts`, `src/components/DiagnosticsAndSupportPanel.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/App.tsx`, `src/core/__tests__/stageBResilience.test.ts`, `src/storage/__tests__/passphraseAndClockSkew.test.ts`

**Restoration Playbook if Overwritten:**
1. Keep pure modules `src/core/photoMaintenance.ts`, `src/core/archiveInspector.ts`, `src/core/encryptedExport.ts`, `_rev` logic in `src/core/syncOutbox.ts`, and `buildDeterministicGoogleCalendarEventId` in `src/core/calendarExport.ts`.
2. Keep `src/storage/passphraseCrypto.ts`, clock-skew compensation in `src/storage/storageProtection.ts`, encrypted delta/directory sync in `src/storage/localSyncChannels.ts`, off-thread inspection in `src/storage/offThreadWorkerClient.ts`, and `inspectRawSqliteBytes` in `src/storage/webSqliteAdapter.ts`.
3. Keep Stage B store handlers in `src/hooks/useBarnStore.ts`, `409` `PUT` retry in `src/utils/googleCalendarClient.ts`, and UI mounts in `DiagnosticsAndSupportPanel.tsx`, `SettingsAndSyncScreen.tsx`, and `App.tsx`.

