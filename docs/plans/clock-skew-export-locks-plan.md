# Implementation Plan: Consistent Clock-Skew Adjustment & Archive Export Double-Tap Locks

## Objective
Implement Backlog Item #1:
1. Capture HTTP `Date` headers during uncached upgrade-gate checks (`./version.json` / `./status.json`) in `src/storage/pwaUpdateManager.ts` and record `lastCheckedAtIso` using `getAdjustedNowIsoUtc()`.
2. Enforce active clock-skew compensation consistently across pure domain helpers (`src/core/`), SQLite adapter (`src/storage/webSqliteAdapter.ts`), Web Worker archive/import jobs (`src/storage/archiveAndImport.worker.ts` & `offThreadWorkerClient.ts`), and UI modals/screens (`SpeciesEditorModal.tsx`, `SettingsAndSyncScreen.tsx`), while keeping `src/core/` 100% pure TS with zero `storage/` or DOM imports.
3. Guard `handleDownloadCompleteZip`, `handleDownloadPhotosOnlyZip`, `handleDownloadTimestampedFullBackup`, and `handleDownloadDatabaseOnlyBackup` in `src/components/SettingsAndSyncScreen.tsx` with `useAsyncSubmitLock` to eliminate the `<16ms` pre-render double-tap race window.

## Architecture & Changes
1. **Pure Core Clock-Skew Synchronization (`src/core/models.ts`, `backupStatus.ts`, `upgradeGate.ts`, `syncAndExports.ts`)**
   - Add pure module-level `coreClockSkewMs` state in `src/core/models.ts` with `setCoreClockSkewMs`, `getCoreClockSkewMs`, and `nowEpochMs()` (`Date.now() + coreClockSkewMs`).
   - Update `nowIsoUtc()` and `todayDateIso()` in `src/core/models.ts` to derive from `nowEpochMs()` so every pure consumer (`herdBossImporter.ts`, `universalPedigreeImporter.ts`, `conflictResolver.ts`, `taskMaster.ts`, `syncOutbox.ts`, `speciesMigration.ts`, `backupVault.ts`, `backupArchive.ts`, `SpeciesEditorModal.tsx`, etc.) automatically emits clock-skew-adjusted UTC/calendar timestamps with zero upward dependencies.
   - Update default `nowMs` / `localNowMs` / `date` parameters in `src/core/backupStatus.ts` (`nowEpochMs()`), `src/core/upgradeGate.ts` (`nowEpochMs()`), and `src/core/syncAndExports.ts` (`formatTimestampedBackupSlug(date = new Date(nowEpochMs()))`).

2. **Storage & Worker Clock-Skew Propagation (`storageProtection.ts`, `pwaUpdateManager.ts`, `webSqliteAdapter.ts`, `offThreadWorkerClient.ts`, `archiveAndImport.worker.ts`)**
   - Sync `setCoreClockSkewMs` inside `src/storage/storageProtection.ts` on initial load, inside `recordServerDateHeaderSkew`, and inside `resetConnectivityStateForTests`, and use `getAdjustedNowIsoUtc()` for `lastProbeAtIsoState`, `requestPersistentStorage`, `checkStorageStatus`, and `saveRollingSnapshotBackup` (`savedAtIso`).
   - In `src/storage/pwaUpdateManager.ts`:
     - Forward `res.headers?.get?.('date')` inside `fetchJsonNoStore` to `recordServerDateHeaderSkew()`.
     - Replace `nowIsoUtc()` calls on `lastCheckedAtIso` with `getAdjustedNowIsoUtc()`.
   - In `src/storage/webSqliteAdapter.ts`:
     - Use `getAdjustedNowIsoUtc()` for persisted `updatedAtIso` (`IDB_WRITE_EPOCH_KEY`) and fallback `updatedAt` timestamps (keeping monotonic `Date.now()` strictly for 15s debounce throttle `lastRollingSaveMs`).
   - In `src/storage/offThreadWorkerClient.ts` & `src/storage/archiveAndImport.worker.ts`:
     - Pass `clockSkewMs: getCoreClockSkewMs()` on every `ArchiveWorkerRequest` and call `setCoreClockSkewMs(req.clockSkewMs ?? 0)` inside the worker handler.

3. **UI Clock-Skew & Archive Export Double-Tap Locks (`SettingsAndSyncScreen.tsx`, `SpeciesEditorModal.tsx`)**
   - In `src/components/SettingsAndSyncScreen.tsx`:
     - Add `archiveExportLock = useAsyncSubmitLock()` and wrap `handleDownloadTimestampedFullBackup`, `handleDownloadDatabaseOnlyBackup`, `handleDownloadCompleteZip`, and `handleDownloadPhotosOnlyZip` so `<16ms` rapid taps are synchronously gated (`disabled={zipExportBusy !== null || archiveExportLock.isSubmitting}`).
     - Keep `pendingHeavyZipExport` confirmation synchronous only for showing the prompt, and lock all heavy export execution buttons cleanly (including secondary buttons in the reset confirmation rows and heavy-ZIP modal).
     - Replace `pausedAtMs: Date.now()` calls with `pausedAtMs: getAdjustedNowMs()`.
   - In `src/components/SpeciesEditorModal.tsx`:
     - Switch timestamp generation to `getAdjustedNowIsoUtc()` (which delegates to the same adjusted UTC source).

4. **Tests, Registry & Verification**
   - Add unit tests in `src/storage/__tests__/passphraseAndClockSkew.test.ts` (upgrade-gate HTTP `Date` capture, core `nowIsoUtc()` / `taskMaster` / `importers` / `syncOutbox` / `formatTimestampedBackupSlug` clock-skew sync, and `resetConnectivityStateForTests` reset) and `src/utils/__tests__/asyncSubmitLock.test.ts` / `SettingsAndSyncScreen` lock coverage.
   - Register `IMP-026` in `src/core/improvementRegistry.ts` and `IMPROVEMENTS.md`.
   - Run `npm test`, `npm run verify:improvements`, `compile_applet`, and `lint_applet`, then remove completed Item #1 from `docs/plans/suggestions-backlog.md` and delete this temporary plan.
