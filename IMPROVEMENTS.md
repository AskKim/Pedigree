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

## Logged Improvements (13)

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
- **Summary:** Disables Workbox SW in dev + adds self-unregistering `/dev-sw.js` middleware, scopes eager COI computation off home/settings boot, guards `PedigreeIndex.inbreeding` recursion cycles, and batches SQLite/IndexedDB mutations (`React.lazy` route splitting deferred).
- **Tracked Files:** `vite.config.ts`, `src/main.tsx`, `src/core/pedigreeCalculator.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`

**Restoration Playbook if Overwritten:**
1. Set `devOptions: { enabled: false }` and keep `devServiceWorkerCleanupPlugin` in `vite.config.ts`.
2. Guard `registerSW` behind `if (import.meta.env.PROD)` and unregister dev SWs in `src/main.tsx`.
3. Forward `activeCalls` inside `PedigreeIndex.inbreeding` in `src/core/pedigreeCalculator.ts` and skip unnecessary COI precompute on `home`/`settings` in `src/hooks/useBarnStore.ts`.

### IMP-008: Subpath-Safe PWA Base Config & GitHub Actions CI Pipeline

- **Category:** CI & Tooling (`ci-tooling`)
- **Origin:** Session Improvement
- **User Goal:** Automatically verify all domain tests, lint, improvements, and subpath PWA builds on every push without requiring user env prompts.
- **Summary:** Normalizes `VITE_BASE_PATH` in Vite/PWA config for GitHub Pages subpath builds while keeping `.env.example` commented out, and runs unit tests, improvement verification, lint, and builds in `.github/workflows/ci.yml`.
- **Tracked Files:** `vite.config.ts`, `.env.example`, `.github/workflows/ci.yml`, `package.json`

**Restoration Playbook if Overwritten:**
1. Ensure `normalizeBasePath(process.env.VITE_BASE_PATH)` wraps `base` and PWA icon/manifest paths in `vite.config.ts`.
2. Keep `VITE_BASE_PATH` commented in `.env.example`.
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


