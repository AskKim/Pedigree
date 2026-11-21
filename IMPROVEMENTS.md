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

---

## Logged Improvements (49)

### IMP-001: Backup Freshness Tracking, Reminders & Clean Human-Readable Exports

- **Category:** Backups & Safety (`backup-safety`)
- **Origin:** Session Improvement
- **User Goal:** Add backup reminders and timestamps where necessary, place backup buttons prominently, and keep backups clean and human-readable.
- **Summary:** Tracks external backup timestamps/formats, renders proactive dismissible/snoozable backup reminders when non-testing edits are unbacked, and writes human-readable JSON v5 backups with barnSummary and clean filenames.
- **Tracked Files:** `src/core/backupStatus.ts`, `src/core/syncAndExports.ts`, `src/hooks/useBarnStore.ts`, `src/App.tsx`, `src/components/ImportExportHubScreen.tsx`, `src/components/SettingsAndSyncScreen.tsx`

**Automated Invariants Checked:**
- `src/core/backupStatus.ts` must contain `evaluateBackupStatus`, `formatLocalDateTimeReadable`, `hasNonTestingBarnData` — *Backup freshness evaluator and human-readable timestamp formatters must stay intact.*
- `src/core/syncAndExports.ts` must contain `buildCleanBackupFileName`, `exportedAtLocal`, `barnSummary` — *Clean filenames (`pedigree-backup-YYYY-MM-DD.json`) and top-level `barnSummary` prevent messy exports.*
- `src/hooks/useBarnStore.ts` must contain `recordBackupExport`, `snoozeBackupReminder`, `backupStatus` — *Store must track `lastBackupMeta` and expose `recordBackupExport`/`snoozeBackupReminder`.*
- `src/App.tsx` must contain `backupStatus.showDismissibleBanner`, `snoozeBackupReminder` — *Global dismissible/snoozable reminder banner alerts breeders when real edits are unbacked.*
- `src/components/ImportExportHubScreen.tsx` must contain `backupStatus`, `recordBackupExport` — *Import/Export Hub exports must show live backup timestamps and record external exports immediately.*
- `src/components/SettingsAndSyncScreen.tsx` must contain `backupStatus`, `recordBackupExport` — *Settings backup summary & pre-reset export must show live backup status and record exports immediately.*

**Restoration Playbook if Overwritten:**
1. Restore `evaluateBackupStatus` and timestamp formatters in `src/core/backupStatus.ts`.
2. Ensure `exportBarnBackupJson` emits `exportedAtLocal`, `barnSummary`, and deterministically sorted animals in `src/core/syncAndExports.ts`.
3. Wire `lastBackupMeta`, `recordBackupExport`, and `snoozeBackupReminder` in `src/hooks/useBarnStore.ts` and connect banner/cards in `src/App.tsx`, `ImportExportHubScreen.tsx`, and `SettingsAndSyncScreen.tsx`.

### IMP-002: Timestamped Pre-Removal Safety Backups & Non-Testing Record Purge

- **Category:** Backups & Safety (`backup-safety`)
- **Origin:** Session Improvement
- **User Goal:** Provide collision-free timestamped backups before removing a species or clearing non-testing entries in case corruption caused the reset.
- **Summary:** Recommends and triggers second-precision timestamped species backups before deleting a species, wiping all species data, or clearing only non-testing livestock entries—never overwriting stable daily backups.
- **Tracked Files:** `src/core/sampleData.ts`, `src/core/syncAndExports.ts`, `src/hooks/useBarnStore.ts`, `src/components/SpeciesDashboardScreen.tsx`

**Automated Invariants Checked:**
- `src/core/syncAndExports.ts` must contain `SpeciesBackupReason`, `buildSpeciesSafetyBackupFileName`, `exportSpeciesBackupJson` — *Pre-removal species JSON exports require distinct timestamped filenames and reason metadata.*
- `src/core/sampleData.ts` must contain `countSpeciesNonTestingRecords`, `purgeSpeciesNonTestingDataPure` — *Non-testing purge must isolate user records cleanly without deleting starter sample rows.*
- `src/hooks/useBarnStore.ts` must contain `deleteSpeciesNonTestingData`, `purgeSpeciesNonTestingDataPure` — *Store must persist non-testing purges via batch operations and clear stale caches.*
- `src/components/SpeciesDashboardScreen.tsx` must contain `countSpeciesNonTestingRecords`, `pre-remove-non-testing`, `pre-remove-species` — *Species hub safety controls must offer 1-click timestamped safety backups before destructive wipes.*

**Restoration Playbook if Overwritten:**
1. Ensure `buildSpeciesSafetyBackupFileName` and 3-arg `exportSpeciesBackupJson(..., { reason })` exist in `src/core/syncAndExports.ts`.
2. Keep `countSpeciesNonTestingRecords` and `purgeSpeciesNonTestingDataPure` in `src/core/sampleData.ts`.
3. Expose `deleteSpeciesNonTestingData` in `src/hooks/useBarnStore.ts` and wire confirmation + timestamped backup buttons in `src/components/SpeciesDashboardScreen.tsx`.

### IMP-003: Decluttered Home Species Cards with Targeted Alerts & Arriving-Babies Indicator

- **Category:** Home & Alerts (`alerts-home`)
- **Origin:** Session Improvement
- **User Goal:** Keep Home species cards focused strictly on navigation, sorting, due/overdue task actionability, and upcoming births.
- **Summary:** Removes clutter (delete-all button, herd counts, terminology tables, day counts, test-data toggles) from Home cards and adds targeted Due/Overdue Task alerts (Do / Ignore Permanently / Clear Current Group) plus Arriving-Babies gestation alerts.
- **Tracked Files:** `src/core/models.ts`, `src/core/barnAlerts.ts`, `src/hooks/useBarnStore.ts`, `src/components/HomeSpeciesScreen.tsx`

**Automated Invariants Checked:**
- `src/core/models.ts` must contain `pluralizeSpeciesLabel` — *`barnAlerts.ts` uses `pluralizeSpeciesLabel` to format arriving-offspring labels cleanly.*
- `src/core/barnAlerts.ts` must contain `evaluateSpeciesDueTasksAlert`, `evaluateSpeciesArrivingBabiesAlert`, `buildTaskAlertGroupSignature` — *Pure alert evaluation rules ensure group-clear signatures reappear only when new due tasks arrive.*
- `src/hooks/useBarnStore.ts` must contain `ignoreTaskAlertsPermanently`, `clearTaskAlertGroup` — *Store must persist ignored task IDs and cleared group signatures per species.*
- `src/components/HomeSpeciesScreen.tsx` must contain `evaluateSpeciesDueTasksAlert`, `evaluateSpeciesArrivingBabiesAlert` — *Home cards must consume `barnAlerts.ts` directly rather than drifting inline logic.*

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

**Automated Invariants Checked:**
- `src/core/models.ts` must contain `applyAnimalNamePrefix`, `defaultAnimalPrefix` — *Delimiter-aware prefix helper handles hyphens/colons (`OR-Ruby`) and case-insensitive duplicate checks.*
- `src/hooks/useBarnStore.ts` must contain `applyAnimalNamePrefix` — *Litter offspring auto-creation in `updateBreedingOutcome` must respect the species default prefix.*

**Restoration Playbook if Overwritten:**
1. Keep `applyAnimalNamePrefix` (and `applySpeciesNamePrefix` alias) in `src/core/models.ts`.
2. Apply `applyAnimalNamePrefix` in animal creation forms (`HerdScreen.tsx`) and litter generation (`useBarnStore.ts`).

### IMP-005: Species Hub Management Relocation, Cross-Species Migration Modal & Herd Pagination

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Move heavy destructive & migration controls into each species hub and support safe family-linked cross-species moves.
- **Summary:** Moves species backup, delete, and migrate controls out of Home mini-cards into each Species Hub & Herd screen; adds pedigree-family-aware `SpeciesMigrationModal` and 50-row Show More pagination in HerdScreen.
- **Tracked Files:** `src/core/speciesMigration.ts`, `src/components/SpeciesMigrationModal.tsx`, `src/components/HerdScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/hooks/useBarnStore.ts`

**Automated Invariants Checked:**
- `src/core/speciesMigration.ts` must contain `expandPedigreeFamilyInSpecies`, `migrateAnimalsToSpecies` — *Cross-species migration preserves ancestor/descendant links and moves photos/logs/breedings/tasks cleanly.*
- `src/components/HerdScreen.tsx` must contain `SpeciesMigrationModal`, `HERD_PAGE_SIZE` — *Herd screen uses `SpeciesMigrationModal` and paginates large rosters at 50 rows per page.*
- `src/components/SpeciesDashboardScreen.tsx` must contain `SpeciesMigrationModal`, `onDownloadTimestampedSpeciesBackup` — *Species Hub exposes hub-level backup, migration, and safety-backed deletion controls.*
- `src/hooks/useBarnStore.ts` must contain `migrateAnimalsToSpecies`, `SpeciesMigrationOptions` — *Store delegates species migration to the tested `migrateAnimalsToSpecies` engine.*

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

**Automated Invariants Checked:**
- `src/core/models.ts` must contain `'Archived'`, `isAnimalActive`, `normalizeAnimalStatus` — *Canonical Archived status and importer helpers must stay exported from `models.ts`.*
- `src/core/importers/herdBossImporter.ts` must contain `rawArchivedFlag`, `rawActiveFlag` — *CSV `Archived` / `Active` flags must map cleanly to `Archived` instead of collapsing into `Retired` or `Active`.*

**Restoration Playbook if Overwritten:**
1. Keep `Archived` in `AnimalStatus` and `ANIMAL_STATUSES` in `src/core/models.ts`.
2. Keep `isAnimalActive`, `isAnimalArchived`, and `normalizeAnimalStatus` aligned with `herdBossImporter.test.ts`.
3. Separate `archivedFlag` and `activeFlag` lookup in `src/core/importers/herdBossImporter.ts`.

### IMP-007: Mobile Chrome Crash Prevention, Cycle-Guarded COI & Batch Storage Writes

- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Fix repeated Chrome Android tab crashes before/during app startup and keep pedigree/bulk operations fast under tight mobile RAM.
- **Summary:** Eliminates Chrome Android Aw Snap renderer crashes by disabling Workbox SW in dev + adding self-unregistering `/dev-sw.js` middleware, scoping eager COI computation off home/settings boot, guarding `PedigreeIndex.inbreeding` recursion cycles, batching SQLite/IndexedDB mutations, and code-splitting secondary routes with `React.lazy`.
- **Tracked Files:** `vite.config.ts`, `src/main.tsx`, `src/core/pedigreeCalculator.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`

**Automated Invariants Checked:**
- `vite.config.ts` must contain `devServiceWorkerCleanupPlugin`, `enabled: false` — *Workbox devOptions enabled=true inside preview iframes causes stale chunk/SW crash loops on mobile.*
  - Forbidden regression: `devOptions: {
      enabled: true`
- `src/main.tsx` must contain `import.meta.env.PROD`, `navigator.serviceWorker.getRegistrations` — *Dev mode must unregister lingering service workers and clear caches instead of registering Workbox.*
- `src/core/pedigreeCalculator.ts` must contain `inbreeding(id: string, activeCalls: Set<string> = new Set())` — *Cycle guard prevents stack overflow if an imported pedigree has an ancestral loop.*
- `src/storage/webSqliteAdapter.ts` must contain `saveAnimalsBatch`, `deleteAnimalsBatch`, `deleteTasksBatch` — *Single-transaction SQLite batch methods prevent O(N) disk/IDB flushes on bulk edits.*

**Restoration Playbook if Overwritten:**
1. Set `devOptions: { enabled: false }` and keep `devServiceWorkerCleanupPlugin` in `vite.config.ts`.
2. Guard `registerSW` behind `if (import.meta.env.PROD)` and unregister dev SWs in `src/main.tsx`.
3. Forward `activeCalls` inside `PedigreeIndex.inbreeding` in `src/core/pedigreeCalculator.ts` and skip unnecessary COI precompute on `home`/`settings` in `src/hooks/useBarnStore.ts`.

### IMP-008: Hardcoded Root Base Path & Disabled Dev HMR Config + GitHub Actions CI

- **Category:** CI & Tooling (`ci-tooling`)
- **Origin:** Session Improvement
- **User Goal:** Automatically verify all domain tests, lint, improvements, and PWA builds on every push with `/` and disabled dev HMR hardcoded so AI Studio never prompts for env vars.
- **Summary:** Hardcodes `basePath = '/'`, `hmr: false`, and `watch: null` in Vite config so AI Studio never prompts for `VITE_BASE_PATH` or `DISABLE_HMR`, and runs unit tests, improvement verification, lint, and production builds in `.github/workflows/ci.yml`.
- **Tracked Files:** `vite.config.ts`, `.env.example`, `.github/workflows/ci.yml`, `package.json`

**Automated Invariants Checked:**
- `vite.config.ts` must contain `const basePath = '/'`, `hmr: false`, `watch: null` — *Hardcoding `basePath = '/'`, `hmr: false`, and `watch: null` prevents AI Studio from prompting for `VITE_BASE_PATH` or `DISABLE_HMR`.*
  - Forbidden regression: `process.env.VITE_BASE_PATH`, `process.env.DISABLE_HMR`
- `.env.example` must contain `# No required environment variables.` — *Omitting `VITE_BASE_PATH` and `DISABLE_HMR` from `.env.example` prevents AI Studio from prompting for unconfigured env vars.*
  - Forbidden regression: `VITE_BASE_PATH`, `DISABLE_HMR`
- `.github/workflows/ci.yml` must contain `npm test`, `npm run verify:improvements`, `npm run lint`, `npm run build` — *CI must block merges if tests, improvement invariants, TypeScript, or builds break.*
- `package.json` must contain `"test": "vitest run"`, `"verify:improvements": "tsx scripts/verify-improvements.ts"` — *Standard npm scripts power local & CI verification.*
- `.github/workflows/deploy-pages.yml` must contain `oven-sh/setup-bun`, `bun run build --base=` — *GitHub Pages deployment strictly requires Bun and passes dynamic --base on CLI.*
- `vite.config.ts` must contain `scope: './'`, `start_url: './'`, `id: './'` — *Relative PWA manifest fields ensure installability on both root (/) and GitHub Pages subpaths (/Pedigree/).*

**Restoration Playbook if Overwritten:**
1. Keep `const basePath = '/'`, `hmr: false`, and `watch: null` hardcoded in `vite.config.ts` without reading `process.env.VITE_BASE_PATH` or `process.env.DISABLE_HMR`.
2. Keep relative `id`, `scope`, and `start_url` (`./`) in `VitePWA` manifest and keep `.github/workflows/deploy-pages.yml` strictly on Bun passing `--base=...` via CLI.
3. Do not add `VITE_BASE_PATH` or `DISABLE_HMR` to `.env.example`.
4. Ensure `package.json` defines `"test"` and `"verify:improvements"`, and `.github/workflows/ci.yml` executes both.

### IMP-009: Crash Error Boundary, Persistent Crash Log & DB Health Self-Repair

- **Category:** Diagnostics & Sync (`diagnostics-sync`)
- **Origin:** Preserved Upstream Feature
- **User Goal:** Diagnose and recover from browser/storage failures on mobile without losing breeder data.
- **Summary:** Catches render/window/promise crashes in `CrashErrorBoundary` + `crashLogger.ts`, exposes IndexedDB persistent-storage protection + DB integrity scan & repair in `dataHealthCheck.ts`, and exports one-click diagnostic ZIP support bundles.
- **Tracked Files:** `src/components/CrashErrorBoundary.tsx`, `src/storage/crashLogger.ts`, `src/core/dataHealthCheck.ts`, `src/core/supportBundle.ts`, `src/storage/storageProtection.ts`

**Automated Invariants Checked:**
- `src/main.tsx` must contain `CrashErrorBoundary`, `installGlobalCrashHandlers` — *Root mount must remain wrapped in `CrashErrorBoundary` with global handlers active.*
- `src/core/dataHealthCheck.ts` must contain `analyzeBarnDataHealth`, `repairBarnDataHealth` — *Health scan & self-repair logic protects against orphaned pointers or malformed rows.*
- `src/core/supportBundle.ts` must contain `buildSupportBundleZipArchive` — *Diagnostic ZIP generator packages device info, crash logs, and DB health safely.*

**Restoration Playbook if Overwritten:**
1. Keep `CrashErrorBoundary` wrapping `<App />` and `installGlobalCrashHandlers()` in `src/main.tsx`.
2. Preserve `DiagnosticsAndSupportPanel.tsx` integration inside `SettingsAndSyncScreen.tsx`.

### IMP-010: Offline Delta Sync Outbox, Conflict Log & Complete ZIP Photo Archive

- **Category:** Diagnostics & Sync (`diagnostics-sync`)
- **Origin:** Preserved Upstream Feature
- **User Goal:** Enable multi-device barn sync and complete archival exports containing both records and photos.
- **Summary:** Provides local-first field-level delta sync bundles, Syncthing/shared-folder direct sync, field collision review log, and Complete Archive `.ZIP` exports bundling real organized animal image files alongside SQLite + JSON.
- **Tracked Files:** `src/core/syncOutbox.ts`, `src/storage/localSyncChannels.ts`, `src/core/backupArchive.ts`, `src/components/ImportExportHubScreen.tsx`

**Automated Invariants Checked:**
- `src/core/syncOutbox.ts` must contain `diffEntityFieldsToOperations`, `mergeDeltaOperations` — *Field-level sync outbox prevents whole-record overwrites across peer devices.*
- `src/core/backupArchive.ts` must contain `buildCompleteBackupZipArchive`, `parseBackupArchiveInput` — *ZIP archive builder/parser handles combined data + real image directory trees.*

**Restoration Playbook if Overwritten:**
1. Preserve `syncOutbox.ts`, `localSyncChannels.ts`, and `backupArchive.ts` hooks inside `useBarnStore.ts` and `ImportExportHubScreen.tsx`.

### IMP-011: Durable App Improvement Registry & GitHub-Overwrite Drift Verifier

- **Category:** CI & Tooling (`ci-tooling`)
- **Origin:** Session Improvement
- **User Goal:** Log every improvement in a durable, exportable system so a future GitHub sync wiping files can be detected and put back accurately.
- **Summary:** Maintains this machine-checkable registry (`improvementRegistry.ts`), human-readable `IMPROVEMENTS.md`, automated CLI verifier (`scripts/verify-improvements.ts`), and in-app export/copy panel inside Diagnostics so any GitHub overwrite is immediately spotted and restorable.
- **Tracked Files:** `src/core/improvementRegistry.ts`, `scripts/verify-improvements.ts`, `IMPROVEMENTS.md`, `src/components/DiagnosticsAndSupportPanel.tsx`, `src/core/__tests__/improvementRegistry.test.ts`

**Automated Invariants Checked:**
- `src/core/improvementRegistry.ts` must contain `IMPROVEMENTS_REGISTRY`, `evaluateImprovementInvariants`, `formatImprovementsMarkdown`, `buildImprovementsRecoveryJson` — *Core registry and pure export/verification helpers must remain intact.*
- `scripts/verify-improvements.ts` must contain `evaluateImprovementInvariants`, `IMPROVEMENTS_REGISTRY` — *CLI script verifies actual workspace source files against registry invariants.*
- `src/components/DiagnosticsAndSupportPanel.tsx` must contain `IMPROVEMENTS_REGISTRY`, `formatImprovementsMarkdown`, `buildImprovementsRecoveryJson` — *Users can view, download (.md / .json), or copy the improvement recovery log directly in the app.*

**Restoration Playbook if Overwritten:**
1. Run `npm run verify:improvements` after any pull/merge from GitHub to list wiped invariants.
2. Use `IMPROVEMENTS.md` or the downloaded `pedigree-improvements-log.json` to restore missing helpers and wiring.

### IMP-012: Startup Self-Healing, Lazy Firebase Auth Guard & Corrective Action Logging

- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Auto-fix any initial loading or crash errors on startup and log every corrective action for debugging.
- **Summary:** Prevents initial-load crashes and infinite loading hangs by lazily initializing Firebase Auth, wrapping SQLite JSON parsing in safe recovery helpers, isolating secondary startup promises with Promise.allSettled, running automatic startup health self-repair, falling back to rolling/starter snapshots on fatal DB load errors, and logging every corrective action via logDiagnosticEvent.
- **Tracked Files:** `src/hooks/useBarnStore.ts`, `src/storage/webSqliteAdapter.ts`, `src/utils/googleCalendarClient.ts`, `src/App.tsx`

**Automated Invariants Checked:**
- `src/hooks/useBarnStore.ts` must contain `normalizeRufusLevel`, `Promise.allSettled`, `Corrective action:` — *Startup must import normalizeRufusLevel, isolate secondary boot promises, and log corrective recovery actions.*
- `src/storage/webSqliteAdapter.ts` must contain `safeParseJson`, `Corrective action:` — *Malformed SQLite row JSON must auto-recover cleanly and record a diagnostic log entry.*
- `src/utils/googleCalendarClient.ts` must contain `getFirebaseAuthSafe`, `Corrective action:` — *Firebase Auth must initialize lazily so offline/restricted browsers never crash before React mounts.*
- `src/App.tsx` must contain `Local Database Recovery Needed` — *Render a non-blocking recovery UI if snapshot loading fails instead of trapping users on a loading skeleton.*

**Restoration Playbook if Overwritten:**
1. Ensure `normalizeRufusLevel` is imported from `../core/models` in `src/hooks/useBarnStore.ts`.
2. Keep lazy `getFirebaseAuthSafe()` in `src/utils/googleCalendarClient.ts` and `safeParseJson()` in `src/storage/webSqliteAdapter.ts`.
3. Keep startup `Promise.allSettled`, `repairBarnDataHealth`, emergency recovery, and `Corrective action:` `logDiagnosticEvent` calls in `src/hooks/useBarnStore.ts`.

### IMP-013: Mobile Memory Hardening, Accessibility & Universal Pedigree Importer

- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Optimize memory for mobile-first usage, improve cross-device accessibility, and import heterogeneous pedigree files gracefully without crashing.
- **Summary:** Adds UniversalPedigreeImporter for Evans .HTM rowspan trees, multi-gen CSV/TSV/pipe spreadsheets (UTF-8/UTF-16/Windows-1252, Excel serial dates), and nested JSON trees; hardens mobile memory/recursion bounds; and enforces dialog focus traps, label bindings, live regions, and keyboard accessibility across screens.
- **Tracked Files:** `src/core/importers/universalPedigreeImporter.ts`, `src/core/importers/archiveAndCsvUtils.ts`, `src/core/importers/registry.ts`, `src/core/pedigreeCalculator.ts`, `src/core/dataHealthCheck.ts`, `src/components/ExternalImporterPanel.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/core/__tests__/resilienceAndUniversalImport.test.ts`

**Automated Invariants Checked:**
- `src/core/importers/universalPedigreeImporter.ts` must contain `UniversalPedigreeImporter`, `parseEvansHtmlEntry`, `MULTI_GEN_COLUMN_SPECS` — *Universal importer handles Evans HTML, multi-generation spreadsheets, nested JSON, and unsupported binary warnings.*
- `src/core/importers/archiveAndCsvUtils.ts` must contain `decodeTextBytes`, `detectUnbommedUtf16`, `validateAndFormatYmd` — *Handles UTF-16LE/BE, Windows-1252, Excel serial dates, and calendar validation without crashing.*
- `src/core/importers/registry.ts` must contain `UniversalPedigreeImporter` — *Registers the Universal Pedigree importer alongside HerdBoss.*
- `src/core/pedigreeCalculator.ts` must contain `visitedPath: Set<string> = new Set()` — *Direct ancestor counting guards against circular ancestry loops.*
- `src/components/ExternalImporterPanel.tsx` must contain `effectiveParseError`, `role="progressbar"` — *Keeps parse error calculation pure and exposes accessible alert/progress semantics.*

**Restoration Playbook if Overwritten:**
1. Restore `UniversalPedigreeImporter` and register it in `src/core/importers/registry.ts`.
2. Keep `decodeTextBytes` UTF-16/Windows-1252 decoding and `validateAndFormatYmd` in `src/core/importers/archiveAndCsvUtils.ts`.
3. Preserve `visitedPath` cycle guard on `countDirectAncestors` in `src/core/pedigreeCalculator.ts` and accessibility attributes across modal/form components.

### IMP-014: Species Tattoo/Sex Conflict Guardrails, Override & Import Conflict Alerts

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Catch duplicate within-species IDs and parent sex mismatches, discourage accidental duplicate tattoos with an explicit override, never hard-block imports on conflicts, and let breeders locate or ignore soft warnings.
- **Summary:** Enforces same-species duplicate tattoo/ID checks and parent sex checks in DB health scans, discourages same-sex duplicate tattoo reuse during animal & litter creation unless the user types "override", allows non-blocking imports while flagging conflicted pedigrees/profiles, and supports Conflicts First sorting/filtering plus persistent soft-warning ignore controls.
- **Tracked Files:** `src/core/animalConflicts.ts`, `src/core/dataHealthCheck.ts`, `src/components/AnimalEditorModal.tsx`, `src/components/BreedingScreen.tsx`, `src/components/HerdScreen.tsx`, `src/hooks/useBarnStore.ts`, `src/App.tsx`, `src/core/__tests__/animalConflictsAndHealth.test.ts`

**Automated Invariants Checked:**
- `src/core/animalConflicts.ts` must contain `findSameSexDuplicateTattooCollisions`, `isOverrideConfirmationValid`, `analyzeBarnAnimalConflicts` — *Core conflict detection, override confirmation, and summary logic must remain intact.*
- `src/core/dataHealthCheck.ts` must contain `duplicateTattooAnimalsCount`, `parentSexMismatchCount` — *Database health checks must report duplicate within-species tattoos and parent sex mismatches.*
- `src/components/AnimalEditorModal.tsx` must contain `findSameSexDuplicateTattooCollisions`, `isOverrideConfirmationValid` — *Single-animal editor must warn on same-sex duplicate tattoos and require explicit override typing.*
- `src/components/BreedingScreen.tsx` must contain `isOverrideConfirmationValid`, `isLitterOverrideConfirmed` — *Bulk litter creation must enforce the same duplicate tattoo override guardrail.*
- `src/components/HerdScreen.tsx` must contain `conflicts_first`, `duplicateTattooPeers` — *Herd screen must allow sorting/filtering conflicted animals and ignoring/restoring soft warnings.*
- `src/hooks/useBarnStore.ts` must contain `ignoreAnimalConflicts`, `restoreAnimalConflictAlert`, `importConflictAlert` — *Store must emit post-import conflict alerts and persist per-animal ignored conflict flags.*
- `src/App.tsx` must contain `store.importConflictAlert`, `locateConflictsInHerd` — *Root shell renders non-blocking import conflict banners with direct Locate Conflicted Animals action.*

**Restoration Playbook if Overwritten:**
1. Keep `findSameSexDuplicateTattooCollisions`, `isOverrideConfirmationValid`, and `analyzeBarnAnimalConflicts` in `src/core/animalConflicts.ts`.
2. Preserve duplicate tattoo and parent sex mismatch checks in `src/core/dataHealthCheck.ts`.
3. Keep `"override"` guards in `AnimalEditorModal.tsx` and `BreedingScreen.tsx`, `conflicts_first` sorting/ignore controls in `HerdScreen.tsx`, and `importConflictAlert` wiring in `useBarnStore.ts` / `App.tsx`.

### IMP-015: 5-Tier Device Capability Detection & Adaptive Memory Cautions

- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Detect constrained mobile devices early, warn users appropriately by hardware tier, and keep Tier 1–2 cautions impossible to accidentally hide permanently.
- **Summary:** Classifies host hardware into 5 memory/CPU tiers, surfaces hardware guidance in Home onboarding & Settings with tier-locked dismissal rules (Tier 1 locked in both locations; Tier 2 closable on Home but persistent in Settings; Tiers 3–5 closable and reopenable), and applies workload cautions in the External Importer.
- **Tracked Files:** `src/core/deviceCapability.ts`, `src/storage/deviceCapabilityDetector.ts`, `src/components/DeviceCapabilityCard.tsx`, `src/components/HomeSpeciesScreen.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/components/ExternalImporterPanel.tsx`, `src/App.tsx`, `src/core/__tests__/deviceCapability.test.ts`

**Automated Invariants Checked:**
- `src/core/deviceCapability.ts` must contain `DEVICE_CAPABILITY_TIERS`, `classifyDeviceCapability`, `evaluateBarnWorkloadForTier` — *Pure 5-tier classification, dismissal rules, and workload evaluator must remain intact.*
- `src/storage/deviceCapabilityDetector.ts` must contain `useDeviceCapability`, `readBrowserHardwareSignals` — *Per-device hardware signal collector and localStorage dismissal hook isolate device state from portable backups.*
- `src/components/DeviceCapabilityCard.tsx` must contain `DeviceCapabilityCard`, `evaluateBarnWorkloadForTier` — *Shared tier banner respects Home vs Settings tier-specific close/reopen rules.*
- `src/components/HomeSpeciesScreen.tsx` must contain `DeviceCapabilityCard` — *Home onboarding displays device capability card on startup.*
- `src/components/SettingsAndSyncScreen.tsx` must contain `DeviceCapabilityCard` — *Settings exposes upper Device Capability section with persistent Tier 1–2 status and reopen control.*
- `src/components/ExternalImporterPanel.tsx` must contain `evaluateBarnWorkloadForTier` — *Importer evaluates incoming record counts against host device capability tier.*
- `src/App.tsx` must contain `useDeviceCapability` — *Root shell runs `useDeviceCapability()` and passes controller to Home and Settings.*

**Restoration Playbook if Overwritten:**
1. Preserve `DEVICE_CAPABILITY_TIERS`, `classifyDeviceCapability`, and `evaluateBarnWorkloadForTier` in `src/core/deviceCapability.ts`.
2. Keep `useDeviceCapability` in `src/storage/deviceCapabilityDetector.ts` and `<DeviceCapabilityCard>` mounts in `HomeSpeciesScreen.tsx` and `SettingsAndSyncScreen.tsx`.

### IMP-016: Route-Level Code Splitting with Retry & Chunk Error Boundary

- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Reduce startup JS bundle size and memory pressure by lazy-loading secondary screens without breaking offline or stale-chunk recovery.
- **Summary:** Code-splits secondary screens and calendar modal via `lazyNamedRoute` (`React.lazy`) with automatic single retry, `RouteLoadingFallback` skeleton, and `RouteErrorBoundary` recovery UI to slash initial JS parse/compile memory on mobile devices.
- **Tracked Files:** `src/utils/lazyRoute.tsx`, `src/App.tsx`, `src/utils/__tests__/lazyRoute.test.ts`

**Automated Invariants Checked:**
- `src/utils/lazyRoute.tsx` must contain `lazyNamedRoute`, `loadWithSingleRetry`, `RouteErrorBoundary`, `RouteLoadingFallback` — *Named-export lazy wrapper, single chunk retry, and route error boundary prevent blank-screen crashes.*
- `src/App.tsx` must contain `lazyNamedRoute`, `RouteErrorBoundary`, `RouteLoadingFallback` — *Secondary routes in `App.tsx` must stay lazily loaded inside `RouteErrorBoundary` + `Suspense`.*

**Restoration Playbook if Overwritten:**
1. Keep `lazyNamedRoute`, `loadWithSingleRetry`, `RouteLoadingFallback`, and `RouteErrorBoundary` in `src/utils/lazyRoute.tsx`.
2. Keep `React.lazy` declarations and `<RouteErrorBoundary><Suspense>` wrapping secondary routes in `src/App.tsx`.

### IMP-017: On-Demand Full-Resolution Photo Hydration & Off-Thread `.ZIP`/Import Worker

- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Eliminate heavy base64 photo retention and UI-thread freezes during large `.ZIP` backups and external pedigree imports on mobile devices.
- **Summary:** Keeps only lightweight thumbnails in reactive snapshot RAM, lazily hydrates full-resolution photo `dataUrl`s via a bounded LRU cache (`BoundedPhotoDataCache`) and SQLite fetchers on gallery/lightbox/pedigree-print/binder/export demand while guarding writes against wiping stored `data_url` rows, and moves `.ZIP` compression/extraction and external archive parsing into a dedicated Web Worker with async fallback.
- **Tracked Files:** `src/storage/photoHydration.ts`, `src/storage/webSqliteAdapter.ts`, `src/storage/archiveAndImport.worker.ts`, `src/storage/offThreadWorkerClient.ts`, `src/hooks/useBarnStore.ts`, `src/components/AnimalPhotoGallery.tsx`, `src/components/ExternalImporterPanel.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/storage/__tests__/photoHydrationAndWorker.test.ts`

**Automated Invariants Checked:**
- `src/storage/photoHydration.ts` must contain `BoundedPhotoDataCache`, `stripPhotoDataUrlsFromSnapshot`, `hydrateSnapshotWithPhotoDataUrls` — *Bounded LRU cache and batch hydration helpers keep full-res base64 strings out of steady-state RAM.*
- `src/storage/webSqliteAdapter.ts` must contain `lightweightPhotos`, `loadAnimalPhotoDataUrl`, `loadAnimalPhotoDataUrlsBatch` — *SQLite adapter supports thumbnail-only snapshot loads, on-demand photo reads, and non-destructive dehydrated writes.*
- `src/storage/archiveAndImport.worker.ts` must contain `buildCompleteBackupZipArchive`, `buildPhotosOnlyZipArchive`, `parseBackupArchiveInput` — *Dedicated module worker runs heavy ZIP builds/extractions and importer parsing off the UI thread.*
- `src/storage/offThreadWorkerClient.ts` must contain `buildCompleteBackupZipOffThread`, `parseExternalImportOffThread`, `buildImporterWorkerSnapshot` — *Worker client strips base64 images before cloning snapshots and falls back gracefully when `Worker` is unavailable.*
- `src/hooks/useBarnStore.ts` must contain `BoundedPhotoDataCache`, `loadAnimalPhotoDataUrl`, `hydrateSnapshotForExport`, `buildCompleteBackupZipToOpfsTmpOffThread` — *Store loads lightweight snapshots, caches hydrated photos, hydrates rolling/export snapshots, and streams off-thread ZIP archives via OPFS /tmp.*
- `src/components/AnimalPhotoGallery.tsx` must contain `onLoadFullPhoto`, `activePhotoSrc` — *Photo gallery and lightbox fetch full-resolution images lazily while displaying thumbnails immediately.*
- `src/components/ExternalImporterPanel.tsx` must contain `parseExternalImportOffThread`, `isParsingArchive` — *External importer unpacks and parses staged archives asynchronously off-thread with request sequencing.*

**Restoration Playbook if Overwritten:**
1. Keep `BoundedPhotoDataCache` and `hydrateSnapshotWithPhotoDataUrls` in `src/storage/photoHydration.ts` plus `lightweightPhotos` guards in `src/storage/webSqliteAdapter.ts`.
2. Keep `archiveAndImport.worker.ts` and `offThreadWorkerClient.ts` wired into `useBarnStore.ts`, `SettingsAndSyncScreen.tsx`, `DiagnosticsAndSupportPanel.tsx`, and `ExternalImporterPanel.tsx`.
3. Keep `onLoadFullPhoto` / `onHydrateSnapshotForExport` props wired from `App.tsx` to galleries, pedigree print modals, Barn Binders, and backup exports.

### IMP-018: Hybrid OPFS Storage Vault, Archived Herds, Wiped-Storage Recovery & IDB Migration Guard

- **Category:** Backups & Safety (`backup-safety`)
- **Origin:** Session Improvement
- **User Goal:** Isolate temporary exports in OPFS /tmp, unify automated + manual backup vaults in OPFS /backups with IDB fallback, offload Sold/Deceased stock to OPFS /archives while preserving ancestor pedigree stubs, pause on wiped browser storage with restore recovery, and dump raw stores before resetting failed IndexedDB migrations.
- **Summary:** Adds pure TS schema v6 envelopes, SHA-256 verification, legacy migration, and .archive.zip bundling in `backupVault.ts`; manages OPFS `/tmp`, `/backups` (retention 6 monthly / 3 pre-upgrade / 8 pre-reset), `/archives`, boot orphan sweeps, QuotaExceededError recovery, idle Export Canary, prior-use sentinel, and IndexedDB rescue dumps in `opfsStorage.ts`; and mounts UnifiedBackupVaultPanel, ArchivedHerdsModal, WipedStorageRecoveryModal, and 1-click Save to Vault banner.
- **Tracked Files:** `src/core/backupVault.ts`, `src/storage/opfsStorage.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/UnifiedBackupVaultPanel.tsx`, `src/components/ArchivedHerdsModal.tsx`, `src/components/WipedStorageRecoveryModal.tsx`, `src/App.tsx`, `src/core/__tests__/backupVault.test.ts`, `src/storage/__tests__/opfsStorage.test.ts`

**Automated Invariants Checked:**
- `src/core/backupVault.ts` must contain `CURRENT_BACKUP_SCHEMA_VERSION`, `migrateAndValidateBackupEnvelope`, `buildExportCanaryProbe`, `buildArchivedAnimalsBundle` — *Pure TypeScript OPFS vault envelopes, schema migration, canary verification, and pedigree-stub-safe archive bundling must remain intact.*
- `src/storage/opfsStorage.ts` must contain `sweepOrphanedOpfsTmpOnBoot`, `saveOpfsVaultBackup`, `saveOpfsHerdArchive`, `detectReturningUserWipedStorage`, `dumpIndexedDbDatabaseToOpfs` — *OPFS `/tmp`, `/backups`, `/archives` persistence, boot sweeps, QuotaExceededError retries, wiped detection, and IDB rescue dumps must stay wired.*
- `src/storage/webSqliteAdapter.ts` must contain `allowSeedFresh`, `detectReturningUserWipedStorage`, `markPriorUseSentinelFromSnapshot`, `pre_upgrade` — *SQLite adapter must pause sample seeding on wiped returning storage, create pre-upgrade snapshots, and update prior-use sentinels.*
- `src/hooks/useBarnStore.ts` must contain `wipedRecoveryContext`, `opfsVaultBackups`, `archivedHerdBundles`, `offloadAnimalsToOpfsArchive`, `runOpfsExportCanary` — *Barn store must orchestrate unified OPFS/IDB vault actions, archive offload/restore, idle canary checks, and wiped-storage recovery.*
- `src/components/UnifiedBackupVaultPanel.tsx` must contain `UnifiedBackupVaultPanel`, `onRestoreOpfsBackup`, `onRestoreRollingBackup` — *Settings UI must unify OPFS vault backups and IndexedDB rolling snapshots in one clean recovery panel.*
- `src/components/ArchivedHerdsModal.tsx` must contain `ArchivedHerdsModal`, `autoOffloadRetiredToOpfs`, `onRestoreArchive` — *Archived Herds modal must support searching, downloading, deleting, and restoring offloaded Sold/Deceased bundles.*
- `src/components/WipedStorageRecoveryModal.tsx` must contain `WipedStorageRecoveryModal`, `onRestoreLatestOpfs`, `onStartFresh` — *Blocking wiped-storage recovery dialog must offer latest OPFS restore, local file upload, and explicit two-step Start Fresh.*
- `src/App.tsx` must contain `<WipedStorageRecoveryModal`, `store.exportCanaryWarning`, `Save to Vault` — *App shell must mount WipedStorageRecoveryModal, Export Canary alerts, and 1-click Save to Vault on backup banners.*

**Restoration Playbook if Overwritten:**
1. Keep `src/core/backupVault.ts` pure TypeScript with schema v6 migration, SHA-256 verification, and `computePedigreeReferencedIds` stub preservation.
2. Keep `src/storage/opfsStorage.ts` managing `/tmp`, `/backups`, `/archives`, `try/finally` `.close()`, boot sweeps, canary checks, and IDB failure dumps.
3. Keep `UnifiedBackupVaultPanel.tsx`, `ArchivedHerdsModal.tsx`, `WipedStorageRecoveryModal.tsx`, `useBarnStore.ts`, and `App.tsx` connected.

### IMP-019: ES2018 Compatibility Build, Crash-Loop Circuit Breaker, Manual SW Update & Graceful Fallbacks

- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Support 2018+ browsers gracefully without polyfill bloat, break reload/crash loops cleanly, defer PWA updates while editing, offer low-memory DB-only exports, and keep unavailable controls visible with explanation text.
- **Summary:** Downlevels TS/Vite build to ES2018 (2018+ devices: Chrome 68+/Safari 12+/Firefox 63+/Edge 79+) with minimal zero-bloat shims, runs an ES5 pre-flight + 3-in-60s crash-loop circuit breaker & ?emergency_reset=true hatch in index.html, switches SW updates to a manual prompt gate with controllerchange handshake and open-modal deferral, offers lightweight Database-Only .JSON backups on Tier 1/2, windows large report/care-log lists, and keeps unsupported optional controls visible with clear disabled reasons.
- **Tracked Files:** `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/utils/es2018Shims.ts`, `src/storage/pwaUpdateManager.ts`, `src/core/deviceCapability.ts`, `src/storage/deviceCapabilityDetector.ts`, `src/utils/webFileActions.ts`, `src/components/UnifiedBackupVaultPanel.tsx`, `src/components/ImportExportHubScreen.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/components/PrintPreviewModal.tsx`, `src/App.tsx`

**Automated Invariants Checked:**
- `vite.config.ts` must contain `es2018`, `safari12`, `cssTarget`, `registerType: 'prompt'` — *Vite build must target ES2018 / Safari 12+ (2018+ browsers) with manual prompt SW activation.*
- `index.html` must contain `__PEDIGREE_PREFLIGHT__`, `pedigree-preflight-guard`, `__PEDIGREE_BOOT_OK__`, `emergency_reset=true`, `__PEDIGREE_RECORD_BOOT_CRASH__` — *ES5 pre-flight guard, 3-in-60s crash-loop circuit breaker, and ?emergency_reset=true recovery hatch must remain intact.*
- `src/utils/es2018Shims.ts` must contain `ensureEs2018Globals`, `allSettled`, `fromEntries` — *Zero-bloat ES2018 runtime shims prevent missing globalThis/allSettled/fromEntries crashes on 2018 browsers.*
- `src/storage/pwaUpdateManager.ts` must contain `usePwaUpdateStatus`, `controllerchange`, `applyPwaUpdateNow` — *Manual Service Worker update gate and single-reload controllerchange handshake must remain intact.*
- `src/core/deviceCapability.ts` must contain `assessBrowserCompatibility`, `getHeavyZipExportGate` — *Pure TypeScript browser compatibility classifier and Tier 1/outdated ZIP caution gate must remain intact.*
- `src/utils/webFileActions.ts` must contain `copyTextWithFallback` — *Clipboard fallback for restricted/older browser contexts must remain available.*
- `src/components/ImportExportHubScreen.tsx` must contain `pendingHeavyZipExport`, `heavyZipGate`, `handleDownloadDatabaseOnlyBackup` — *Heavy .ZIP exports must warn Tier 1/outdated browsers and offer Database-Only .JSON fallback without photo hydration.*

**Restoration Playbook if Overwritten:**
1. Keep ES2018 target in `tsconfig.json` and `vite.config.ts` (`safari12`, `registerType: "prompt"`) plus ES5 guard, circuit breaker, and `?emergency_reset=true` in `index.html`.
2. Keep `src/utils/es2018Shims.ts` imported first in `src/main.tsx` alongside `src/storage/pwaUpdateManager.ts`.
3. Keep `assessBrowserCompatibility` and `getHeavyZipExportGate` in `src/core/deviceCapability.ts` and hook probes in `src/storage/deviceCapabilityDetector.ts`.
4. Keep disabled-with-reason UI controls (`Share .HTM` in `PrintPreviewModal.tsx`, Storage Vault, Import/Export Hub, Settings), Database-Only `.JSON` export, table/care-log windowing, and open-dialog PWA update deferral in `App.tsx`.

### IMP-020: Mobile Background Freeze Pause/Resume, Double-Submit Guards & Async Error Toast

- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Prevent mid-batch IndexedDB corruption on iOS/Android background freeze, stop rapid-tap duplicate submits while holding unsaved form notes on write failures, and surface gentle non-blocking recovery toasts for uncaught async errors.
- **Summary:** Cooperatively pauses & checkpoints active Folder Sync / idle vault tasks on mobile background freeze (`visibilityState === "hidden"`), auto-resumes clean pauses on foreground return while keeping severity/permission faults sticky, adds bounded `sessionStorage` emergency crash traces (`pedigree_emergency_trace_v1`) + deduplicated `AsyncErrorToastHost` notifications for uncaught rejections/persistence errors, serializes `useBarnStore` mutations via a FIFO write queue (`enqueueStoreMutation`), and enforces synchronous `ref` + React submit locks (`useAsyncSubmitLock`, `useAsyncKeyedLock`) across primary forms, sync actions, and inline toggles.
- **Tracked Files:** `src/storage/backgroundFreezeCoordinator.ts`, `src/storage/crashLogger.ts`, `src/storage/localSyncChannels.ts`, `src/utils/useAsyncSubmitLock.ts`, `src/hooks/useBarnStore.ts`, `src/components/AsyncErrorToastHost.tsx`, `src/components/AnimalEditorModal.tsx`, `src/components/BreedingScreen.tsx`, `src/components/HerdScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/components/SpeciesEditorModal.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/components/DiagnosticsAndSupportPanel.tsx`, `src/App.tsx`, `src/utils/__tests__/asyncSubmitLock.test.ts`, `src/storage/__tests__/backgroundFreezeAndToast.test.ts`

**Automated Invariants Checked:**
- `src/storage/backgroundFreezeCoordinator.ts` must contain `BackgroundPausedError`, `notifyBackgroundTransition`, `registerPausedBackgroundJob`, `registerFreezeLifecycleListener` — *Single-source background freeze coordinator must manage cooperative pauses, auto-resume clean tasks, and hold severity tasks until acknowledged.*
- `src/storage/crashLogger.ts` must contain `EMERGENCY_SESSION_TRACE_KEY`, `emitAsyncErrorToast`, `handleUnhandledRejectionReason`, `notifyBackgroundTransition` — *Uncaught rejections and QuotaExceeded writes must fall back to bounded sessionStorage emergency traces and emit deduplicated non-blocking error toasts.*
- `src/storage/localSyncChannels.ts` must contain `withSyncIdb`, `sync_checkpoints`, `BackgroundPausedError`, `resumePersistedDirectorySyncIfGranted` — *Folder Sync must close IDB handles deterministically on abort, checkpoint progress on hide, and support foreground resume.*
- `src/utils/useAsyncSubmitLock.ts` must contain `createAsyncLockController`, `createAsyncKeyedLockController`, `useAsyncSubmitLock`, `useAsyncKeyedLock` — *Synchronous ref-based double-submit locks must gate same-frame double taps and always unlock in finally.*
- `src/hooks/useBarnStore.ts` must contain `enqueueStoreMutation`, `registerFreezeLifecycleListener`, `emitAsyncErrorToast` — *Store mutations must run sequentially without interleaving outbox/SQLite writes and surface storage errors without dropping typed form inputs.*
- `src/components/AsyncErrorToastHost.tsx` must contain `subscribeAsyncErrorToasts`, `subscribePausedBackgroundJobs`, `Tap to Resume` — *Global non-blocking toast stack must render auto-dismissing minor notices, sticky error alerts, and severity-only Tap to Resume controls.*
- `src/components/AnimalEditorModal.tsx` must contain `useAsyncSubmitLock` — *Animal editor modal Save/Delete actions must prevent rapid double-tap duplicate animals.*
- `src/components/BreedingScreen.tsx` must contain `breedingSubmitLock`, `outcomeSubmitLock` — *Breeding Log and Outcome forms must block rapid double-submits and hold entered fields on storage error.*
- `src/components/HerdScreen.tsx` must contain `careLogSubmitLock`, `inlineAnimalLock` — *Care log form and inline quick animal actions must prevent duplicate writes cleanly.*
- `src/components/SpeciesDashboardScreen.tsx` must contain `taskSubmitLock`, `taskToggleLock` — *Species hub chore/cage/show forms and silent per-row chore toggles must prevent rapid double-tap races.*

**Restoration Playbook if Overwritten:**
1. Restore `src/storage/backgroundFreezeCoordinator.ts` and hook `notifyBackgroundTransition` inside `src/storage/crashLogger.ts`.
2. Preserve `writeEmergencySessionTraceSync`, `emitAsyncErrorToast`, and `handleUnhandledRejectionReason` in `src/storage/crashLogger.ts` and mount `<AsyncErrorToastHost />` in `src/App.tsx`.
3. Keep `withSyncIdb`, `sync_checkpoints` (IDB v3), `BackgroundPausedError`, and `resumePersistedDirectorySyncIfGranted` in `src/storage/localSyncChannels.ts` wired into `SettingsAndSyncScreen.tsx`.
4. Keep `enqueueStoreMutation` + boolean/id Promise returns in `src/hooks/useBarnStore.ts` and `useAsyncSubmitLock` / `useAsyncKeyedLock` guards in `App.tsx`, `AnimalEditorModal.tsx`, `BreedingScreen.tsx`, `HerdScreen.tsx`, `SpeciesDashboardScreen.tsx`, `SpeciesEditorModal.tsx`, `SettingsAndSyncScreen.tsx`, and `DiagnosticsAndSupportPanel.tsx`.

### IMP-021: ARIA Combobox Navigation, Reports/Settings Shortcuts, Focus Polish & rAF Observer Optimization

- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Restore and strengthen keyboard shortcuts, tab stops, ARIA combobox navigation, and focus indicators while cleaning up minor export and DOM observer inefficiencies.
- **Summary:** Adds full WAI-ARIA keyboard navigation (`stepEnabledComboboxIndex`, `aria-activedescendant`, `ArrowDown`/`ArrowUp`/`Home`/`End`/`Enter`/`Escape`, `scrollIntoView`, and blur boundary closing) across `CarrierTraitCombobox`, `SearchableParentPicker`, and `ExternalImporterPanel`; adds `O` (Reports) and `S` (Import & Settings) global shortcuts with IME/widget guards and synchronized help panels; restores visible focus rings and pedigree focus scrolling; coalesces `App.tsx` modal `MutationObserver` via `requestAnimationFrame`; and aligns `buildPdfReadyBarnSnapshot` carrier disclosures.
- **Tracked Files:** `src/utils/comboboxNav.ts`, `src/utils/__tests__/comboboxNav.test.ts`, `src/components/CarrierTraitCombobox.tsx`, `src/components/SearchableParentPicker.tsx`, `src/components/ExternalImporterPanel.tsx`, `src/App.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/components/HomeSpeciesScreen.tsx`, `src/components/AnimalPhotoGallery.tsx`, `src/components/PedigreeScreen.tsx`, `src/components/HerdScreen.tsx`, `src/components/SpeciesMemoScreen.tsx`, `src/core/syncAndExports.ts`

**Automated Invariants Checked:**
- `src/utils/comboboxNav.ts` must contain `clampComboboxIndex`, `stepEnabledComboboxIndex` — *Pure combobox index-stepping helper powers keyboard traversal across all custom listboxes.*
- `src/components/CarrierTraitCombobox.tsx` must contain `aria-activedescendant`, `stepEnabledComboboxIndex` — *Carrier trait combobox must expose aria-activedescendant and full keyboard navigation.*
- `src/components/SearchableParentPicker.tsx` must contain `aria-activedescendant`, `stepEnabledComboboxIndex` — *Searchable parent picker must expose aria-activedescendant and full keyboard navigation.*
- `src/components/ExternalImporterPanel.tsx` must contain `aria-activedescendant`, `stepEnabledComboboxIndex`, `speciesOptionRefs` — *Default species combobox must support keyboard traversal and close on focus blur.*
- `src/App.tsx` must contain `requestAnimationFrame`, `o: { route: 'reports', label: 'Reports' }`, `i: { route: 'importExport', label: 'Import / Export Hub' }`, `s: { route: 'settings', label: 'Settings' }`, `e.isComposing` — *Root shell coalesces MutationObserver work via rAF and guards O/I/S/H/D/R/B/P/? shortcuts cleanly.*
- `src/core/syncAndExports.ts` must contain `includeCleared: true,
          includeLineage: true` — *PDF snapshot DTO exports must include cleared and ancestral lineage carrier disclosures.*

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

**Automated Invariants Checked:**
- `src/core/pedigreeCalculator.ts` must contain `buildPedigreeBranchViewport`, `getGen3BranchesWithKnownAncestors` — *Pure branch viewport helper keeps initial 4–6 gen DOM compact while preserving full-depth export slots.*
- `src/components/PedigreeScreen.tsx` must contain `expandedGen3Branches`, `buildPedigreeBranchViewport` — *Interactive pedigree chart must lazy-expand Gen 4+ branches on demand without losing focus or keyboard access.*
- `src/core/upgradeGate.ts` must contain `evaluateUpgradeGate`, `parseVersionManifestJson`, `parseStatusManifestJson` — *Pure pre-flight Upgrade Gate evaluates revoked builds, paused updates, Safe-Harbor schema floors, and schemaDelta>=2 backup gates.*
- `src/core/backupVault.ts` must contain `buildVerifiedPreUpgradeJsonBackup`, `verifyPreUpgradeJsonBackup` — *Pre-upgrade safety backups must emit _schemaVersion-stamped envelopes and verify SHA-256 round-trip integrity.*
- `src/storage/pwaUpdateManager.ts` must contain `pedigree_pwa_update_policy_v1`, `fetchUpgradeGateDecision` — *PWA updater enforces persisted auto/notify/pinned policies and uncached Upgrade Gate checks before posting SKIP_WAITING.*
- `src/storage/storageProtection.ts` must contain `pedigree_manual_offline_v1`, `probeNetworkConnectivity` — *Connectivity governor combines Manual App Offline Mode with a timed AbortController captive-portal probe.*
- `public/version.json` must contain `minDirectUpgradeSchema` — *Release version manifest must expose current appVersion, schemaVersion, and minDirectUpgradeSchema floor.*
- `public/status.json` must contain `revokedVersions` — *Remote killswitch manifest must expose allowUpdates and revokedVersions lists.*
- `vite.config.ts` must contain `navigateFallbackDenylist: [/^\/api\//, /\/version\.json$/, /\/status\.json$/]` — *Service worker navigation fallback must never intercept or precache uncached version.json / status.json manifests on root or subpaths.*

**Restoration Playbook if Overwritten:**
1. Keep `buildPedigreeBranchViewport`, `getGen3BranchIndex`, and `getGen3BranchesWithKnownAncestors` in `src/core/pedigreeCalculator.ts` wired into `PedigreeScreen.tsx`.
2. Preserve `src/core/upgradeGate.ts`, `buildVerifiedPreUpgradeJsonBackup` / `verifyPreUpgradeJsonBackup` in `src/core/backupVault.ts`, and uncached `public/version.json` & `public/status.json` with `no-store` middleware + Workbox denylist in `vite.config.ts`.
3. Keep `PwaUpdatePolicy` (`auto` / `notify` / `pinned`) + `fetchUpgradeGateDecision` in `src/storage/pwaUpdateManager.ts`, `setManualOfflineMode` + `probeNetworkConnectivity` in `src/storage/storageProtection.ts`, and UI controls in `App.tsx`, `useBarnStore.ts`, and `SettingsAndSyncScreen.tsx`.

### IMP-023: Storage Pruning, Pre-Restore Archive Inspector, Clock-Skew Compensation, Monotonic _rev & Encrypted Backups

- **Category:** Backups & Safety (`backup-safety`)
- **Origin:** Session Improvement
- **User Goal:** Prevent runaway photo quota growth, inspect backups for species/conflicts before committing restores, protect multi-device sync order against wrong or rewound clocks, avoid duplicate Google Calendar events, and offer opt-in passphrase encryption for shared archives/sync folders.
- **Summary:** Adds a Diagnostics Photo Storage & Orphan Attachment Pruner (`photoMaintenance.ts`, `reoptimizeAnimalPhotoRecord`), an off-thread Pre-Restore Archive Inspector dry-run for `.ZIP`/`.JSON`/`.SQLITE` (`archiveInspector.ts`, `inspectRawSqliteBytes`), persistent HTTP `Date` clock-skew compensation (`recordServerDateHeaderSkew`, `getAdjustedNowIsoUtc`) with a non-blocking drift banner, per-record monotonic `_rev` counters (`compareSameEntitySyncOperations`, `bumpRecordRevision`) paired with deterministic `[a-v0-9]` Google Calendar IDs + `409` `PUT` updates, and optional PBKDF2-SHA256 + AES-256-GCM passphrase encryption for shared backups and SyncThing deltas (`encryptedExport.ts`, `passphraseCrypto.ts`) while keeping plain 1-click exports as the default.
- **Tracked Files:** `src/core/photoMaintenance.ts`, `src/core/archiveInspector.ts`, `src/core/encryptedExport.ts`, `src/core/syncOutbox.ts`, `src/core/calendarExport.ts`, `src/core/models.ts`, `src/core/inputSanitization.ts`, `src/storage/passphraseCrypto.ts`, `src/storage/storageProtection.ts`, `src/storage/localSyncChannels.ts`, `src/storage/offThreadWorkerClient.ts`, `src/storage/archiveAndImport.worker.ts`, `src/storage/webImageOptimizer.ts`, `src/storage/webSqliteAdapter.ts`, `src/utils/googleCalendarClient.ts`, `src/hooks/useBarnStore.ts`, `src/components/DiagnosticsAndSupportPanel.tsx`, `src/components/ImportExportHubScreen.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/App.tsx`, `src/core/__tests__/stageBResilience.test.ts`, `src/storage/__tests__/passphraseAndClockSkew.test.ts`

**Automated Invariants Checked:**
- `src/core/photoMaintenance.ts` must contain `analyzePhotoStorageFootprintPure`, `removeOrphanPhotosFromSnapshotPure`, `pruneFullResPayloadsFromSnapshotPure` — *Pure photo storage footprint analyzer, orphan cleaner, and thumbnail compactor must stay DOM-free.*
- `src/core/archiveInspector.ts` must contain `inspectSnapshotBeforeRestorePure`, `inspectParsedArchiveBeforeRestorePure` — *Dry-run pre-restore inspector summarizes species, conflicts, and replace/merge impact before DB writes.*
- `src/core/encryptedExport.ts` must contain `ENCRYPTED_ENVELOPE_FORMAT`, `wrapEncryptedZipContainer`, `tryExtractEncryptedEnvelopeFromZip` — *Pure encrypted envelope framing and ZIP wrapper/extractor must remain intact.*
- `src/storage/passphraseCrypto.ts` must contain `encryptBytesWithPassphrase`, `decryptBytesWithPassphrase` — *Client-side PBKDF2-SHA256 + AES-256-GCM encryption runs strictly with memory-only passphrases.*
- `src/storage/storageProtection.ts` must contain `recordServerDateHeaderSkew`, `getAdjustedNowIsoUtc`, `clockDriftWarning` — *Server Date skew capture compensates timestamps and flags drift >= 5 minutes cleanly.*
- `src/core/syncOutbox.ts` must contain `compareSameEntitySyncOperations`, `bumpRecordRevision` — *Monotonic record_rev ensures newer same-entity edits win even when a device clock rewinds.*
- `src/core/calendarExport.ts` must contain `buildDeterministicGoogleCalendarEventId` — *Deterministic [a-v0-9] Google Calendar IDs prevent duplicate calendar events on retry/sync.*
- `src/utils/googleCalendarClient.ts` must contain `res.status === 409` — *Google Calendar push must update existing events via PUT when deterministic ID returns HTTP 409.*
- `src/components/ImportExportHubScreen.tsx` must contain `pendingRestoreInspection`, `encryptBackupExport` — *Import/Export Hub must require Pre-Restore Inspector confirmation and expose opt-in backup/sync encryption.*
- `src/components/DiagnosticsAndSupportPanel.tsx` must contain `onAnalyzePhotoFootprint`, `onPruneOrphanPhotos` — *Diagnostics exposes Photo Storage & Orphan Attachment Pruner actions safely.*
- `src/App.tsx` must contain `connectivity.clockDriftWarning` — *Root shell renders non-blocking Clock Drift Nudge Banner when drift reaches threshold.*

**Restoration Playbook if Overwritten:**
1. Keep pure modules `src/core/photoMaintenance.ts`, `src/core/archiveInspector.ts`, `src/core/encryptedExport.ts`, `_rev` logic in `src/core/syncOutbox.ts`, and `buildDeterministicGoogleCalendarEventId` in `src/core/calendarExport.ts`.
2. Keep `src/storage/passphraseCrypto.ts`, clock-skew compensation in `src/storage/storageProtection.ts`, encrypted delta/directory sync in `src/storage/localSyncChannels.ts`, off-thread inspection in `src/storage/offThreadWorkerClient.ts`, and `inspectRawSqliteBytes` in `src/storage/webSqliteAdapter.ts`.
3. Keep Stage B store handlers in `src/hooks/useBarnStore.ts`, `409` PUT retry in `src/utils/googleCalendarClient.ts`, and UI mounts in `DiagnosticsAndSupportPanel.tsx`, `ImportExportHubScreen.tsx`, and `App.tsx`.

### IMP-024: Active Medication Withdrawal Countdown & Livestock Safety Alerts

- **Category:** Home & Alerts (`alerts-home`)
- **Origin:** Session Improvement
- **User Goal:** Surface active care-log withdrawal periods on Herd cards and Home alerts and trigger soft confirmation warnings before marking an animal under active withdrawal for sale, meat/cull processing, or show exhibition.
- **Summary:** Surfaces active CareLog medication withdrawal periods (`withdrawalClearDateIso` / `dateIso + withdrawalDays`, cleared on the clear date itself) via an O(L) withdrawal map across Home species cards (session-closable), Herd roster rows, single-animal profiles, and Withdrawal filter/sort controls, and triggers non-blocking soft confirmation warnings before saving Sold/Culled dispositions or Show entries whose event date overlaps withdrawal.
- **Tracked Files:** `src/core/barnAlerts.ts`, `src/core/__tests__/barnAlerts.test.ts`, `src/components/HomeSpeciesScreen.tsx`, `src/components/HerdScreen.tsx`, `src/components/AnimalEditorModal.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/App.tsx`

**Automated Invariants Checked:**
- `src/core/barnAlerts.ts` must contain `buildWithdrawalByAnimalMap`, `evaluateSpeciesActiveWithdrawalsAlert`, `evaluateWithdrawalDispositionWarning`, `evaluateShowWithdrawalConflicts` — *Pure withdrawal countdown evaluator and safety conflict helpers must remain intact and DOM-free.*
- `src/components/HomeSpeciesScreen.tsx` must contain `evaluateSpeciesActiveWithdrawalsAlert`, `onDismissWithdrawalAlert` — *Home species cards must surface closable session-scoped withdrawal safety alerts.*
- `src/components/HerdScreen.tsx` must contain `buildWithdrawalByAnimalMap`, `withdrawal_soonest`, `Withdrawal (` — *HerdScreen must display active withdrawal countdowns, filter tab, sort, and profile alert banner.*
- `src/components/AnimalEditorModal.tsx` must contain `evaluateWithdrawalDispositionWarning`, `pendingWithdrawalWarning` — *AnimalEditorModal must require soft confirmation before saving Sold or Flagged-for-Cull stock under active withdrawal.*
- `src/components/SpeciesDashboardScreen.tsx` must contain `evaluateShowWithdrawalConflicts`, `pendingShowWithdrawalWarning` — *Show entry form must warn when selected animals have medication withdrawals overlapping eventDateIso.*
- `src/App.tsx` must contain `dismissedWithdrawalSpecies`, `requestedHerdWithdrawalNonce` — *Root shell tracks session-scoped Home withdrawal dismissal and Herd filter navigation.*

**Restoration Playbook if Overwritten:**
1. Keep pure withdrawal functions (`buildWithdrawalByAnimalMap`, `evaluateAnimalActiveWithdrawal`, `evaluateSpeciesActiveWithdrawalsAlert`, `evaluateWithdrawalDispositionWarning`, `evaluateShowWithdrawalConflicts`) in `src/core/barnAlerts.ts`.
2. Keep session-scoped `dismissedWithdrawalSpecies` in `src/App.tsx` wired to `HomeSpeciesScreen.tsx` and `HerdScreen.tsx`.
3. Keep Herd withdrawal filter/sort/countdown badges in `HerdScreen.tsx` passing `animalCareLogs` into `AnimalEditorModal.tsx`, and keep show-date overlap checks in `SpeciesDashboardScreen.tsx`.

### IMP-025: Sync Outbox Alignment, Metadata-Only Photo Sync & Reset State Cleanup

- **Category:** Diagnostics & Sync (`diagnostics-sync`)
- **Origin:** Session Improvement
- **User Goal:** Align Folder/Delta Sync outbox mutations for photo actions and cross-species migrations while guaranteeing stale P2P sync queues, conflict logs, and backup reminders never leak across factory resets or full Replace restores.
- **Summary:** Queues metadata-only photo operations (stripping image blobs so large photos travel exclusively via .ZIP backups) and full cross-species migration snapshot diffs with bumped `_rev` counters into the delta outbox, hydrates missing blobs onto metadata-only photo placeholders during .ZIP/.JSON merges without clobbering newer edits, guards UI galleries against empty image URLs, and wipes `sync_outbox`, `sync_conflicts`, `sync_checkpoints`, plus backup reminder keys (`pedigree.lastBackupMeta.v1`, `pedigree.backupReminderSnoozedUntil.v1`) on factory resets and full Replace restores.
- **Tracked Files:** `src/core/syncOutbox.ts`, `src/core/speciesMigration.ts`, `src/core/backupArchive.ts`, `src/core/syncAndExports.ts`, `src/hooks/useBarnStore.ts`, `src/components/AnimalPhotoGallery.tsx`, `src/components/HerdScreen.tsx`, `src/core/__tests__/stageBResilience.test.ts`, `src/storage/__tests__/crossTabLockAndReload.test.ts`

**Automated Invariants Checked:**
- `src/core/syncOutbox.ts` must contain `stripPhotoBlobsForSync`, `diffSnapshotsToSyncOperations` — *Sync outbox must strip binary blobs on photo creates and support snapshot diffing for bulk migrations.*
- `src/core/speciesMigration.ts` must contain `bumpRecordRevision` — *Cross-species migration must advance `_rev` counters on every migrated or created record.*
- `src/core/backupArchive.ts` must contain `existingHasBlob`, `incHasBlob` — *Photos-Only ZIP merge must hydrate blobs onto metadata-only photo placeholders without overwriting newer metadata.*
- `src/core/syncAndExports.ts` must contain `mergeAnimalPhotosWithBlobPreservation` — *Barn snapshot merges must rehydrate blobs onto metadata-only photos without losing existing local blobs.*
- `src/hooks/useBarnStore.ts` must contain `clearLocalSyncAndBackupReminderState`, `clearAllSyncStateInIdb`, `stripPhotoBlobsForSync`, `diffSnapshotsToSyncOperations` — *Store must clear sync/backup-reminder state on resets/replaces and enqueue metadata-only photo & migration outbox ops.*
- `src/components/AnimalPhotoGallery.tsx` must contain `p.thumbnailDataUrl || p.dataUrl` — *Photo gallery must avoid rendering broken <img src=""> tags for metadata-only synced photo placeholders.*

**Restoration Playbook if Overwritten:**
1. Keep `stripPhotoBlobsForSync`, `diffSnapshotsToSyncOperations`, and metadata-only `photo` `__create__` handling in `src/core/syncOutbox.ts`.
2. Keep `bumpRecordRevision` calls in `src/core/speciesMigration.ts` and blob-preserving merge helpers in `src/core/backupArchive.ts` and `src/core/syncAndExports.ts`.
3. Keep `clearLocalSyncAndBackupReminderState` wired across resets and Replace restores plus metadata-only photo/migration outbox emissions in `src/hooks/useBarnStore.ts`, and keep empty-src placeholders in `AnimalPhotoGallery.tsx` and `HerdScreen.tsx`.

### IMP-026: Clock-Skew Consistency & Archive Export Double-Tap Locks

- **Category:** Backups & Safety (`backup-safety`)
- **Origin:** Session Improvement
- **User Goal:** Enforce clock-skew compensation consistently across upgrade checks and Settings timestamps while eliminating the <16ms double-tap race on heavy archive and backup exports.
- **Summary:** Aligns upgrade-gate HTTP Date skew capture (`recordServerDateHeaderSkew`), core `nowEpochMs()` fallback defaults, and Settings folder/background pause timestamps (`getAdjustedNowMs()`) when device clocks drift, and guards all 4 backup/archive exports (`handleDownloadTimestampedFullBackup`, `handleDownloadDatabaseOnlyBackup`, `handleDownloadCompleteZip`, `handleDownloadPhotosOnlyZip`) plus heavy-ZIP caution and reset backup buttons with synchronous `archiveExportLock` (`useAsyncSubmitLock`).
- **Tracked Files:** `src/core/upgradeGate.ts`, `src/storage/pwaUpdateManager.ts`, `src/components/ImportExportHubScreen.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/storage/__tests__/passphraseAndClockSkew.test.ts`

**Automated Invariants Checked:**
- `src/core/upgradeGate.ts` must contain `nowEpochMs`, `computeHttpDateClockSkewMs` — *Upgrade-gate HTTP Date skew calculation must default to clock-skew-aware nowEpochMs().*
- `src/storage/pwaUpdateManager.ts` must contain `recordServerDateHeaderSkew`, `getAdjustedNowIsoUtc` — *Version/status manifest checks must propagate HTTP Date skew and record adjusted timestamps.*
- `src/components/ImportExportHubScreen.tsx` must contain `archiveExportLock`, `getAdjustedNowMs`, `archiveExportLock.runLocked` — *Archive/backup exports must lock synchronously against double-tap and record skew-adjusted pause timestamps.*
- `src/components/SettingsAndSyncScreen.tsx` must contain `archiveExportLock`, `archiveExportLock.runLocked` — *Pre-reset full JSON backup in Settings must lock synchronously against double-tap.*

**Restoration Playbook if Overwritten:**
1. Keep `nowEpochMs` default inside `computeHttpDateClockSkewMs` in `src/core/upgradeGate.ts`.
2. Keep `recordServerDateHeaderSkew` and `getAdjustedNowIsoUtc` in `src/storage/pwaUpdateManager.ts`.
3. Keep `archiveExportLock = useAsyncSubmitLock()` wrapping all 4 export handlers in `src/components/ImportExportHubScreen.tsx` and the pre-reset backup handler in `src/components/SettingsAndSyncScreen.tsx`, plus `getAdjustedNowMs()` for `pausedAtMs`.

### IMP-027: True Lazy 2–3 Gen SQLite/OPFS Pedigree Fetching & ES2018 Windowed List Virtualization

- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Reduce mobile RAM and DOM overhead by fetching Gen 4+ / archived pedigree ancestors lazily from SQLite/OPFS and virtualizing large Breeding, Herd, and Reports lists.
- **Summary:** Keeps initial interactive pedigree charts bounded to Gen 0–3 while probing and lazily fetching Gen 4+ and OPFS `/archives` offloaded ancestors on branch expand or pre-print hydration via cycle-safe SQLite BFS (`queryPedigreeNeighborhood`, `queryPedigreeBranchAncestorsExist`) and a 256-entry LRU ancestor cache (`pedigreeAncestorCacheRef`); and replaces unbounded/static-slice lists in `BreedingScreen`, `HerdScreen`, and `ReportsScreen` with a zero-dependency ES2018 scroll window virtualizer (`useVirtualWindow`).
- **Tracked Files:** `src/utils/useVirtualWindow.ts`, `src/utils/__tests__/virtualWindow.test.ts`, `src/storage/storageAdapter.ts`, `src/storage/webSqliteAdapter.ts`, `src/storage/__tests__/pedigreeLazyFetch.test.ts`, `src/core/pedigreeCalculator.ts`, `src/core/__tests__/pedigreeCalculator.test.ts`, `src/hooks/useBarnStore.ts`, `src/App.tsx`, `src/components/PedigreeScreen.tsx`, `src/components/BreedingScreen.tsx`, `src/components/HerdScreen.tsx`, `src/components/ReportsScreen.tsx`

**Automated Invariants Checked:**
- `src/utils/useVirtualWindow.ts` must contain `computeVirtualWindow`, `useVirtualWindow`, `ResizeObserver` — *Zero-dependency ES2018 scroll virtualizer must remain intact with guarded ResizeObserver cleanup.*
- `src/storage/webSqliteAdapter.ts` must contain `queryPedigreeNeighborhood`, `queryPedigreeBranchAncestorsExist`, `mapAnimalRow` — *SQLite adapter must provide cycle-safe bounded BFS pedigree queries and lightweight branch-existence probes.*
- `src/hooks/useBarnStore.ts` must contain `loadPedigreeNeighborhood`, `checkPedigreeBranchesHaveAncestors`, `pedigreeAncestorCacheRef` — *Barn store must cache lazily fetched SQLite/OPFS pedigree ancestors in a bounded LRU map.*
- `src/core/pedigreeCalculator.ts` must contain `hasKnownAncestors`, `externalKnownBranches` — *Branch summaries must surface externally detected Gen 4+ ancestors before full depth is loaded in RAM.*
- `src/components/PedigreeScreen.tsx` must contain `gen0To3BaseMap`, `fetchAndMergeBranchAncestors`, `handleOpenPrintModal` — *Pedigree screen must scope initial tree to Gen 0–3 and hydrate Gen 4+ on branch expand or print.*
- `src/components/BreedingScreen.tsx` must contain `useVirtualWindow`, `breedingVirtual`, `ledgerStatusFilter` — *Breeding & litter ledger must filter and virtualize large pairing histories cleanly.*
- `src/components/HerdScreen.tsx` must contain `useVirtualWindow`, `herdVirtual`, `HERD_PAGE_SIZE` — *Herd roster list must virtualize rows via useVirtualWindow with HERD_PAGE_SIZE pre-layout fallback.*
- `src/components/ReportsScreen.tsx` must contain `useVirtualWindow`, `reportVirtual`, `windowedRows` — *Reports table must virtualize displayed rows while exporting full filtered sets to CSV and Print.*

**Restoration Playbook if Overwritten:**
1. Keep `src/utils/useVirtualWindow.ts` and `queryPedigreeNeighborhood` / `queryPedigreeBranchAncestorsExist` in `src/storage/webSqliteAdapter.ts`.
2. Keep `loadPedigreeNeighborhood`, `checkPedigreeBranchesHaveAncestors`, and `pedigreeAncestorCacheRef` in `src/hooks/useBarnStore.ts` wired through `src/App.tsx` to `src/components/PedigreeScreen.tsx`.
3. Keep `useVirtualWindow` integration in `BreedingScreen.tsx`, `HerdScreen.tsx`, and `ReportsScreen.tsx`.

### IMP-028: Cage / Pen Capacity Warnings & Quick Occupant Assignment

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Compare current animal occupants against CageLocation.capacity (e.g., 3/2 over capacity), allow one-click occupant assignment from housing cards, and warn before exceeding capacity.
- **Summary:** Compares active, junior, and unarchived/non-offloaded retired occupants per species against `CageLocation.capacity` via pure single-pass evaluators (`evaluateCageOccupancy`, `evaluateSpeciesCagesOccupancy`, `evaluateCageAssignmentCapacityWarning`), surfaces over-capacity welfare alerts on `HomeSpeciesScreen` and `SpeciesDashboardScreen` and in printed Barn Binder housing tables (`barnBinder.ts`), adds inline cage capacity/section editing and 1-click quick occupant assignment/unassignment (`assignAnimalToCage`) on Cages & Pens cards, and displays soft confirmation warnings in both Quick Assign and `AnimalEditorModal` before exceeding capacity.
- **Tracked Files:** `src/core/barnAlerts.ts`, `src/core/barnBinder.ts`, `src/core/__tests__/barnAlerts.test.ts`, `src/hooks/useBarnStore.ts`, `src/App.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/components/AnimalEditorModal.tsx`, `src/components/HomeSpeciesScreen.tsx`

**Automated Invariants Checked:**
- `src/core/barnAlerts.ts` must contain `isCageOccupyingAnimal`, `evaluateCageOccupancy`, `evaluateSpeciesCagesOccupancy`, `evaluateCageAssignmentCapacityWarning` — *Pure occupancy counting and capacity warning evaluation must remain in pure TS core with species isolation.*
- `src/hooks/useBarnStore.ts` must contain `assignAnimalToCage` — *Store must expose queued FIFO assignAnimalToCage mutation updating _rev and syncOutbox.*
- `src/components/SpeciesDashboardScreen.tsx` must contain `cagesOccupancySummary`, `handleQuickAssignSelect`, `pendingCageAssignConfirm`, `onAssignAnimalToCage` — *Cages & Pens cards must show occupancy ratios, quick occupant assignment/unassignment, inline edit, and over-capacity alerts.*
- `src/components/AnimalEditorModal.tsx` must contain `liveCageCapacityWarning`, `pendingCapacityWarning`, `checkCapacityThenSave` — *Animal editor must display live cage occupancy feedback and soft confirmation before saving an over-capacity assignment.*
- `src/components/HomeSpeciesScreen.tsx` must contain `evaluateSpeciesCagesOccupancy`, `shouldShowOverCapacityAlert` — *Home species cards must surface an actionable alert when any species cage exceeds capacity.*
- `src/core/barnBinder.ts` must contain `(over capacity)` — *Printable Barn Binder cage table must show occupancy/capacity ratios and over-capacity markers.*

**Restoration Playbook if Overwritten:**
1. Keep pure cage occupancy & assignment warning evaluators in `src/core/barnAlerts.ts` and tests in `src/core/__tests__/barnAlerts.test.ts`.
2. Keep `assignAnimalToCage` in `src/hooks/useBarnStore.ts` passed to `<SpeciesDashboardScreen onAssignAnimalToCage={store.assignAnimalToCage} />` in `src/App.tsx`.
3. Keep live ratio displays, over-capacity alerts, quick assign/unassign, and soft capacity confirmations in `SpeciesDashboardScreen.tsx`, `AnimalEditorModal.tsx`, `HomeSpeciesScreen.tsx`, and `barnBinder.ts`.

### IMP-029: Breeding Lab & Master Task List Refinements (Post-Birth Recalculation, Quick Checkoffs & Breed Overrides)

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Recalculate post-birth tasks to the actual birth date when births arrive early or late, support one-click Palpation/Birth Check checkoffs with automatic Missed task cleanup, and allow optional per-breed gestation/weaning/milestone overrides.
- **Summary:** Adds BreedScheduleOverride support (with case-insensitive dam-first, sire-fallback resolution via resolveEffectiveSpeciesProfileForBreeding and SQLite/sync/JSON preservation), adds pure post-birth task evaluation & recalculation (evaluateStalePostBirthTasksForBreeding, recalculatePostBirthTasksForBreeding) plus pending Missed cleanup (getPendingBreedingCleanupTasks) in taskMaster.ts, exposes recalculateBreedingPostBirthTasks & completeBreedingTaskWithOutcome in useBarnStore.ts, and adds UI controls in SpeciesEditorModal, BreedingScreen, and SpeciesDashboardScreen.
- **Tracked Files:** `src/core/models.ts`, `src/core/taskMaster.ts`, `src/core/__tests__/taskMaster.test.ts`, `src/storage/webSqliteAdapter.ts`, `src/core/syncAndExports.ts`, `src/core/syncOutbox.ts`, `src/hooks/useBarnStore.ts`, `src/App.tsx`, `src/components/SpeciesEditorModal.tsx`, `src/components/BreedingScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`

**Automated Invariants Checked:**
- `src/core/models.ts` must contain `BreedScheduleOverride`, `normalizeBreedScheduleOverrides`, `breedOverrides` — *SpeciesProfile must carry optional BreedScheduleOverride entries normalized deterministically in pure TypeScript.*
- `src/core/taskMaster.ts` must contain `resolveEffectiveSpeciesProfileForBreeding`, `recalculatePostBirthTasksForBreeding`, `getPendingBreedingCleanupTasks`, `isPalpationTask`, `isBirthCheckTask` — *Breed override resolution, AFTER_BIRTH task date recalculation, and Missed breeding task cleanup helpers must remain pure and reusable.*
- `src/storage/webSqliteAdapter.ts` must contain `breed_overrides_json` — *SQLite schema and migrations must persist species breedOverrides across reloads.*
- `src/hooks/useBarnStore.ts` must contain `recalculateBreedingPostBirthTasks`, `completeBreedingTaskWithOutcome` — *Store must expose queued FIFO mutations for post-birth task recalculation and one-click breeding task outcome checkoffs with cleanup.*
- `src/components/SpeciesEditorModal.tsx` must contain `Per-Breed Schedule Overrides`, `handleSaveBreedOverride` — *Species Editor must allow configuring optional per-breed gestation, weaning, rebreed, maturity, and milestone day overrides.*
- `src/components/BreedingScreen.tsx` must contain `onRecalculatePostBirthTasks`, `outcomeStalePostBirth`, `outcomeMissedCleanupCount` — *Breeding Lab must resolve breed overrides in previews, offer one-tap post-birth chore shifting, and surface automatic Missed cleanup notice.*
- `src/components/SpeciesDashboardScreen.tsx` must contain `onCompleteBreedingTask`, `isPalpationTask`, `isBirthCheckTask` — *Species Hub task list must support one-click Palpation & Birth Check checkoffs and inline post-birth chore shifting on active pairings.*

**Restoration Playbook if Overwritten:**
1. Keep BreedScheduleOverride & normalizeBreedScheduleOverrides in `src/core/models.ts` and pure helpers in `src/core/taskMaster.ts` with tests in `src/core/__tests__/taskMaster.test.ts`.
2. Keep `breed_overrides_json` persisted in `src/storage/webSqliteAdapter.ts` and normalized in `src/core/syncAndExports.ts` and `src/core/syncOutbox.ts`.
3. Keep `recalculateBreedingPostBirthTasks` and `completeBreedingTaskWithOutcome` in `src/hooks/useBarnStore.ts` wired through `src/App.tsx` to `SpeciesDashboardScreen.tsx`, `BreedingScreen.tsx`, and `SpeciesEditorModal.tsx`.

### IMP-030: Consolidated Import/Export Hub & Extensible Non-Native Exporter Registry

- **Category:** Backups & Safety (`backup-safety`)
- **Origin:** Session Improvement
- **User Goal:** Consolidate all backup, native restore, multi-worker sync, external importer, and non-native exporter tools into a clean 3-section Import/Export Hub page integrated into navigation and Settings.
- **Summary:** Adds a pure TypeScript extensible non-native exporter registry (`exporterTypes.ts`, `registry.ts`) supporting `.CSV`, Evans `.HTM`, Printable Barn Binder `.HTM`, Normalized Report DTO `.JSON`, and `.ICS` calendar tasks plus future external schema slots; introduces `ImportExportHubScreen` structured cleanly into System Backup, Imports (Native System Imports first followed by External Format Importers), and Exporters; wires `'importExport'` into `useBarnStore.ts`, `App.tsx` (desktop/mobile nav + `I` shortcut + backup banner routing), `SpeciesDashboardScreen.tsx`, `HomeSpeciesScreen.tsx`, and `SettingsAndSyncScreen.tsx`.
- **Tracked Files:** `src/core/exporters/exporterTypes.ts`, `src/core/exporters/registry.ts`, `src/core/__tests__/exportersRegistry.test.ts`, `src/components/ImportExportHubScreen.tsx`, `src/hooks/useBarnStore.ts`, `src/App.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/components/HomeSpeciesScreen.tsx`

**Automated Invariants Checked:**
- `src/core/exporters/exporterTypes.ts` must contain `ExternalExporterDescriptor`, `ExportedArtifactPayload` — *Pure TypeScript exporter interface contracts must remain DOM-free for cross-platform reuse.*
- `src/core/exporters/registry.ts` must contain `BUILTIN_NON_NATIVE_EXPORTERS`, `PLANNED_EXTERNAL_SCHEMA_TARGETS`, `buildExporterCatalog`, `runExternalExporter` — *Non-native exporter catalog must keep built-in formats and extensible registry hooks intact.*
- `src/components/ImportExportHubScreen.tsx` must contain `ImportExportHubScreen`, `ExternalImporterPanel`, `UnifiedBackupVaultPanel`, `BUILTIN_NON_NATIVE_EXPORTERS` — *Hub screen must organize System Backup, Native & External Imports, and Exporters cleanly.*
- `src/hooks/useBarnStore.ts` must contain `| 'importExport'` — *WorkspaceRoute union must include importExport.*
- `src/App.tsx` must contain `ImportExportHubScreen`, `openImportExportHub` — *Root shell must route, lazy-load, and link banners/shortcuts cleanly to ImportExportHubScreen.*
- `src/components/SettingsAndSyncScreen.tsx` must contain `onOpenImportExportHub` — *Settings must link cleanly into all sections of the Import/Export Hub without duplicating forms.*

**Restoration Playbook if Overwritten:**
1. Restore `src/core/exporters/exporterTypes.ts`, `src/core/exporters/registry.ts`, and `src/core/__tests__/exportersRegistry.test.ts`.
2. Restore `src/components/ImportExportHubScreen.tsx` and keep `importExport` inside `WorkspaceRoute` in `src/hooks/useBarnStore.ts`.
3. Keep `ImportExportHubScreen` routing, `I` shortcut, navigation buttons, and Settings/Home/Species Hub links wired across `App.tsx`, `SettingsAndSyncScreen.tsx`, `SpeciesDashboardScreen.tsx`, and `HomeSpeciesScreen.tsx`.

### IMP-031: Interactive CSV Column Mapper, Starter Template & Unlinked Parent Preview

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Provide a one-click Starter CSV Template download, interactive column-mapping preview for spreadsheets, and pre-import highlighting for unresolved Sire/Dam links on non-HerdBoss CSV imports.
- **Summary:** Adds pure TS Starter CSV Template generation (`csvStarterTemplate.ts`), unified column alias & override resolution (`csvColumnMapper.ts`), two-pass out-of-order CSV parent linking with unresolved Sire/Dam pre-import tracking in `universalPedigreeImporter.ts`, and interactive UI controls in `ExternalImporterPanel.tsx`.
- **Tracked Files:** `src/core/importers/importerTypes.ts`, `src/core/importers/csvStarterTemplate.ts`, `src/core/importers/csvColumnMapper.ts`, `src/core/importers/universalPedigreeImporter.ts`, `src/components/ExternalImporterPanel.tsx`, `src/core/__tests__/resilienceAndUniversalImport.test.ts`

**Automated Invariants Checked:**
- `src/core/importers/csvStarterTemplate.ts` must contain `buildStarterCsvTemplate`, `STARTER_CSV_TEMPLATE_HEADERS` — *Pure TS starter CSV template generator must remain DOM-free with standard pedigree headers.*
- `src/core/importers/csvColumnMapper.ts` must contain `CSV_TARGET_FIELD_OPTIONS`, `resolveCsvColumnAssignments`, `makeCsvColumnOverrideKey` — *Pure TS column mapper must resolve aliases, sample cells, and user overrides cleanly.*
- `src/core/importers/universalPedigreeImporter.ts` must contain `resolveCsvColumnAssignments`, `unresolvedParentLinks`, `csvTables` — *Universal importer must perform two-pass parent resolution and surface column mapping & unresolved Sire/Dam links.*
- `src/components/ExternalImporterPanel.tsx` must contain `Download Starter CSV Template`, `handleCsvColumnSelectionChange`, `unresolvedParentLinks` — *External importer UI must expose template download, interactive column mapping, and unresolved parent link warnings.*

**Restoration Playbook if Overwritten:**
1. Restore `src/core/importers/csvStarterTemplate.ts` and `src/core/importers/csvColumnMapper.ts` and keep `CsvTableMappingSummary`/`UnresolvedParentLink` in `src/core/importers/importerTypes.ts`.
2. Keep two-pass CSV resolution and `csvColumnMapping`/`unresolvedParentLinks` wiring in `src/core/importers/universalPedigreeImporter.ts`.
3. Keep the Starter CSV Template download button, column-mapping region, and unresolved Sire/Dam highlight card in `src/components/ExternalImporterPanel.tsx`.

### IMP-032: Low-RAM Export Streaming & Full OPFS /tmp Staging

- **Category:** Backups & Safety (`backup-safety`)
- **Origin:** Session Improvement
- **User Goal:** Route all printable/shareable exports (including <512 KB .HTM pedigrees and cage cards) through OPFS /tmp with immediate post-use cleanup, and stream large .ZIP and .JSON backup chunks incrementally into OPFS /tmp without materializing monolithic JS heap buffers.
- **Summary:** Adds worker-safe `opfsTempStream.ts` (`writeTempOpfsFileStreamed`) and chunked `writeTempOpfsFile`; stages all `downloadTextFile`, `downloadBinaryFile`, `shareTextFileOrDownload`, and `shareBinaryFileOrDownload` exports through OPFS `/tmp` with immediate cleanup in `webFileActions.ts`; streams `.JSON` backup chunks via `generateBarnBackupJsonChunks` (`syncAndExports.ts`); streams `.ZIP` archives one photo and one binder at a time via `streamCompleteBackupZipArchive` & `streamPhotosOnlyZipArchive` (`backupArchive.ts`); and wires worker/UI/store callers cleanly.
- **Tracked Files:** `src/storage/opfsTempStream.ts`, `src/storage/opfsStorage.ts`, `src/core/syncAndExports.ts`, `src/core/backupArchive.ts`, `src/utils/webFileActions.ts`, `src/storage/archiveAndImport.worker.ts`, `src/storage/offThreadWorkerClient.ts`, `src/components/ImportExportHubScreen.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/hooks/useBarnStore.ts`, `src/storage/__tests__/opfsStorage.test.ts`, `src/storage/__tests__/photoHydrationAndWorker.test.ts`, `src/core/__tests__/syncAndExports.test.ts`

**Automated Invariants Checked:**
- `src/storage/opfsTempStream.ts` must contain `writeTempOpfsFileStreamed`, `writeTempOpfsFile`, `purgeOpfsTmp`, `readTempOpfsFileAsBlob` — *Worker-safe OPFS /tmp chunk streamer must remain free of React/DOM imports and close writables in try/finally.*
- `src/core/syncAndExports.ts` must contain `generateBarnBackupJsonChunks` — *Pure TypeScript backup JSON chunk generator prevents allocating monolithic strings for photo-heavy backups.*
- `src/core/backupArchive.ts` must contain `streamCompleteBackupZipArchive`, `streamPhotosOnlyZipArchive` — *Streaming fflate Zip/ZipPassThrough/ZipDeflate builders decode and flush one entry at a time incrementally.*
- `src/utils/webFileActions.ts` must contain `downloadTextChunks`, `downloadTempOpfsExport`, `stagePayloadInOpfsTmp` — *All printable, shareable, and streamed browser exports stage via OPFS /tmp when supported and clean up deterministically.*
- `src/storage/offThreadWorkerClient.ts` must contain `buildCompleteBackupZipToOpfsTmpOffThread`, `buildPhotosOnlyZipToOpfsTmpOffThread` — *Off-thread worker bridge streams ZIP chunks straight to OPFS /tmp and falls back gracefully without Worker or OPFS.*

**Restoration Playbook if Overwritten:**
1. Keep `src/storage/opfsTempStream.ts` free of React/DOM imports and delegated from `src/storage/opfsStorage.ts` and `src/storage/archiveAndImport.worker.ts`.
2. Keep `generateBarnBackupJsonChunks` in `src/core/syncAndExports.ts` and `streamCompleteBackupZipArchive` / `streamPhotosOnlyZipArchive` in `src/core/backupArchive.ts`.
3. Keep full OPFS `/tmp` staging + `downloadTextChunks` / `downloadTempOpfsExport` in `src/utils/webFileActions.ts`, wired through `offThreadWorkerClient.ts`, `ImportExportHubScreen.tsx`, `SettingsAndSyncScreen.tsx`, and `useBarnStore.ts`.

### IMP-033: "The Techy Stuff" Developer & Troubleshooting Screen, Permanent Tier Hierarchy & Production Guardrails

- **Category:** Diagnostics & Sync (`diagnostics-sync`)
- **Origin:** Session Improvement
- **User Goal:** Relocate advanced, non-routine operational controls out of Settings into a dedicated lazy-loaded "The Techy Stuff" developer screen with a permanent non-closeable Tier/Memory Hierarchy block, isolated error boundary, OPFS/IDB quota pre-flight checks, strict input sanitization, and multi-step destructive safeguards.
- **Summary:** Introduces lazy-loaded `TechyStuffScreen` wrapped in an isolated `TechyStuffErrorBoundary`; relocates Storage Protection, Connectivity Governor, App Update Policy & Release Gate, `DiagnosticsAndSupportPanel`, and Destructive Reset Lab controls out of `SettingsAndSyncScreen` while preserving original `DeviceCapabilityCard` & Home hierarchy banners intact; embeds a permanent, non-closeable copy of the 5-tier Device Tier & Memory Hierarchy guidelines (`data-permanent-tier-hierarchy="true"`); and enforces pure TS validation/sanitization & OPFS/IDB quota pre-flight checks (`techyStuffGuardrails.ts`, `verifyStorageQuotaForDiagnosticAction`) plus multi-step armed phrase safeguards.
- **Tracked Files:** `src/core/techyStuffGuardrails.ts`, `src/core/__tests__/techyStuffGuardrails.test.ts`, `src/storage/storageProtection.ts`, `src/components/TechyStuffErrorBoundary.tsx`, `src/components/TechyStuffScreen.tsx`, `src/components/DiagnosticsAndSupportPanel.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/hooks/useBarnStore.ts`, `src/App.tsx`

**Automated Invariants Checked:**
- `src/core/techyStuffGuardrails.ts` must contain `evaluateStorageQuotaForOperation`, `validateDiagnosticTriggerInput`, `validateSupportRecipientEmail`, `DESTRUCTIVE_CONFIRM_PHRASES`, `isDestructiveActionConfirmationValid` — *Pure TS developer guardrails module must stay DOM-free and enforce quota evaluations, strict input validation/sanitization, and confirmation phrases.*
- `src/storage/storageProtection.ts` must contain `verifyStorageQuotaForDiagnosticAction` — *Browser storage adapter must execute OPFS + IndexedDB quota pre-flight checks and log low-headroom diagnostics.*
- `src/components/TechyStuffErrorBoundary.tsx` must contain `TechyStuffErrorBoundary`, `recordReactCrash` — *Developer & Troubleshooting screen must stay isolated in a dedicated Error Boundary so faulty diagnostics cannot crash herd/breeding views.*
- `src/components/TechyStuffScreen.tsx` must contain `TechyStuffScreen`, `data-permanent-tier-hierarchy="true"`, `DEVICE_CAPABILITY_TIER_LIST`, `destructiveArmed` — *The Techy Stuff screen must include a permanent non-closeable Tier/Memory Hierarchy block and multi-step armed safeguards for destructive actions.*
- `src/components/SettingsAndSyncScreen.tsx` must contain `onOpenTechyStuff`, `DeviceCapabilityCard` — *Settings must link cleanly to The Techy Stuff while keeping routine barn preferences and original DeviceCapabilityCard intact.*
- `src/App.tsx` must contain `TechyStuffScreen`, `TechyStuffErrorBoundary`, `route === 'techyStuff'` — *Root shell must lazy-load TechyStuffScreen inside Suspense + TechyStuffErrorBoundary.*

**Restoration Playbook if Overwritten:**
1. Restore `src/core/techyStuffGuardrails.ts` and `verifyStorageQuotaForDiagnosticAction` in `src/storage/storageProtection.ts`.
2. Restore `src/components/TechyStuffErrorBoundary.tsx` and `src/components/TechyStuffScreen.tsx` with its permanent `data-permanent-tier-hierarchy="true"` section and `destructiveArmed` phrase gates.
3. Keep `techyStuff` in `WorkspaceRoute` (`useBarnStore.ts`), `SettingsAndSyncScreen.tsx` launcher (`onOpenTechyStuff`), and lazy boundary mount in `src/App.tsx`.

### IMP-034: "Barn Bench" Fast Sequential Batch Entry Mode

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Let breeders walk down a cage row logging weights, body condition scores, nail trims, or cage moves rapidly with auto-advance and minimal modal switching.
- **Summary:** Adds a tap-friendly, strictly species-isolated Barn Bench sequential chore sheet filtered by barn row/section, herd status, and search text; supports rapid cage-by-cage logging of weights (in species unit), 1-tap BCS presets, nail trims, cage moves with live capacity warnings, and notes with auto-advance, transactional batch care-log writes (`saveCareLogsBatch`), and field-level sync outbox recording.
- **Tracked Files:** `src/core/barnBench.ts`, `src/core/__tests__/barnBench.test.ts`, `src/storage/storageAdapter.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/BarnBenchScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/components/HerdScreen.tsx`, `src/App.tsx`

**Automated Invariants Checked:**
- `src/core/barnBench.ts` must contain `extractSpeciesCageSections`, `buildBarnBenchQueue`, `buildBarnBenchCommitPlan`, `findNextBarnBenchIndex`, `BARN_BENCH_BCS_PRESETS` — *Pure TS Barn Bench queue builder, commit planner, and auto-advance selector must remain DOM-free and species-isolated.*
- `src/storage/webSqliteAdapter.ts` must contain `saveCareLogsBatch` — *Transactional batch CareLog persistence prevents multi-flush overhead when logging combined bench entries.*
- `src/hooks/useBarnStore.ts` must contain `| 'bench'`, `commitBarnBenchEntry`, `buildBarnBenchCommitPlan` — *Store must expose the bench route and queued atomic commitBarnBenchEntry action with outbox sync ops.*
- `src/components/BarnBenchScreen.tsx` must contain `BarnBenchScreen`, `evaluateCageAssignmentCapacityWarning`, `useAsyncSubmitLock`, `findNextBarnBenchIndex` — *Barn Bench screen must guard async commits against double-taps, check cage capacity on moves, and auto-advance cleanly.*
- `src/App.tsx` must contain `BarnBenchScreen`, `route === 'bench'`, `k: { route: 'bench'` — *Root shell must lazy-load BarnBenchScreen under route === bench with keyboard shortcut K.*

**Restoration Playbook if Overwritten:**
1. Restore `src/core/barnBench.ts` and `src/core/__tests__/barnBench.test.ts`.
2. Keep `saveCareLogsBatch` on `StorageAdapter` and `WebSqliteAdapter` and `commitBarnBenchEntry` + `bench` route in `src/hooks/useBarnStore.ts`.
3. Keep lazy `BarnBenchScreen` mounted in `src/App.tsx` with `K` shortcut and launchers in `SpeciesDashboardScreen.tsx` and `HerdScreen.tsx`.

### IMP-035: Batch Cage Card, Compact Mini-Sheet & Pedigree Printing from Herd Multi-Select

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Print cage cards, 4-up mini pedigrees, 4x6 photo cards, or stacked pedigrees for multiple selected animals in one pass for shows, auctions, or transport.
- **Summary:** Allows breeders to multi-select animals in `HerdScreen` and generate a single printable `.HTM` / Print-to-PDF sheet across four formats: 8-up kennel/cage cards, 1/4-page (4-up) mini 3-gen pedigree sheets, 3-generation 4x6 photo cards (2-up Letter or direct 4x6 paper), and stacked formal 3–6G pedigrees, backed by pure TS HTML generation (`batchPrint.ts`), bounded on-demand batch photo hydration (`loadAnimalPhotoDataUrlsBatch`), and live layout/option controls in `PrintPreviewModal`.
- **Tracked Files:** `src/core/batchPrint.ts`, `src/core/__tests__/batchPrint.test.ts`, `src/hooks/useBarnStore.ts`, `src/App.tsx`, `src/components/PrintPreviewModal.tsx`, `src/components/HerdScreen.tsx`

**Automated Invariants Checked:**
- `src/core/batchPrint.ts` must contain `BATCH_PRINT_LAYOUTS`, `generateBatchPrintHtml`, `resolveBatchPrintAnimals`, `computeBatchPrintPageCount`, `buildBatchPrintFileName` — *Pure TS batch print engine must remain DOM-free and support cage cards, 4-up mini sheets, 4x6 photo cards, and stacked pedigrees.*
- `src/hooks/useBarnStore.ts` must contain `loadAnimalPhotoDataUrlsBatch` — *Store must expose bounded on-demand batch photo hydration without retaining full-res images in reactive snapshot RAM.*
- `src/components/PrintPreviewModal.tsx` must contain `batchPrintOptions`, `onChangeBatchPrintOptions`, `BATCH_PRINT_LAYOUTS` — *Print preview modal must render live layout switcher and batch print options toolbar.*
- `src/components/HerdScreen.tsx` must contain `openBatchPrintPreview`, `generateBatchPrintHtml`, `resolveBatchPrintAnimals`, `Batch Print (` — *HerdScreen multi-select bulk bar must launch batch print previews and clean up hydrated photos on close.*

**Restoration Playbook if Overwritten:**
1. Restore `src/core/batchPrint.ts` and `src/core/__tests__/batchPrint.test.ts`.
2. Keep `loadAnimalPhotoDataUrlsBatch` exported from `src/hooks/useBarnStore.ts` and passed as `onLoadFullPhotosBatch` to `HerdScreen` in `src/App.tsx`.
3. Keep `batchPrintOptions` controls in `src/components/PrintPreviewModal.tsx` and multi-select `Batch Print` wiring in `src/components/HerdScreen.tsx`.

### IMP-036: QR-Coded Cage Cards & Visual Hutch-Row / Facility Pen Board

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Embed scannable QR codes on printable cage cards that open the animal profile route directly in the PWA, and provide a visual Hutch-by-Hutch / Cage Row & Pasture Board grouping pens by barn section with linked feedlot inventories and recurring maintenance reminders.
- **Summary:** Adds a zero-dependency pure TS ISO/IEC 18004 QR code encoder and single-path SVG renderer (`qrCode.ts`), embeds toggleable scannable QR profile deep links into both thermal single cage cards (`generateThermalCageCardHtml`) and 8-up batch cage cards (`batchPrint.ts`), parses `?route=herd&animalId=...` and `?route=dashboard&cageId=...` on startup in `useBarnStore.ts`, extends `CageLocation` and SQLite/JSON serialization with housing unit type, feedlot inventory, and recurring maintenance schedules, and adds the pure `facilityBoard.ts` engine plus interactive `FacilityPenBoard` inside `SpeciesDashboardScreen` (with compact list toggle, full-screen board modal, quick stock adjustments, 1-click maintenance logging/task scheduling, and pen/row QR card printing).
- **Tracked Files:** `src/core/qrCode.ts`, `src/core/facilityBoard.ts`, `src/core/models.ts`, `src/core/batchPrint.ts`, `src/core/syncAndExports.ts`, `src/core/__tests__/qrCode.test.ts`, `src/core/__tests__/facilityBoard.test.ts`, `src/core/__tests__/batchPrint.test.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/FacilityPenBoard.tsx`, `src/components/PrintPreviewModal.tsx`, `src/components/HerdScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/App.tsx`

**Automated Invariants Checked:**
- `src/core/qrCode.ts` must contain `encodeQrMatrix`, `renderQrSvg`, `buildAnimalProfileDeepLink`, `buildCageBoardDeepLink`, `parseAppDeepLinkParams` — *Pure TS offline QR encoder, vector SVG renderer, and deep-link helpers must remain zero-DOM and self-contained.*
- `src/core/facilityBoard.ts` must contain `buildFacilityBoardModel`, `evaluateCageMaintenanceStatus`, `evaluateCageFeedStatus`, `buildCageMaintenanceTaskDraft`, `matchesFacilityBoardFilter` — *Pure TS facility board grouping, feedlot rollups, and UTC calendar maintenance evaluators must remain DOM-free.*
- `src/core/batchPrint.ts` must contain `includeQrCodes`, `supportsQrCode`, `buildAnimalProfileDeepLink` — *8-up batch cage cards must support scannable QR profile codes via includeQrCodes.*
- `src/core/syncAndExports.ts` must contain `ThermalCageCardOptions`, `buildAnimalProfileDeepLink`, `renderQrSvg` — *Single thermal cage cards must embed optional QR profile deep links and backup JSON must preserve extended CageLocation metadata.*
- `src/storage/webSqliteAdapter.ts` must contain `feed_lot_name`, `maintenance_interval_days`, `last_maintenance_date_iso` — *SQLite cages table and idempotent migrations must persist housing type, feedlot inventory, and maintenance schedule columns.*
- `src/hooks/useBarnStore.ts` must contain `parseAppDeepLinkParams`, `highlightedCageId`, `setHighlightedCageId` — *Store startup deep-link handler must resolve scanned QR animalId and cageId routes cleanly.*
- `src/components/FacilityPenBoard.tsx` must contain `FacilityPenBoard`, `buildCageMaintenanceTaskDraft`, `onPrintCageCardsForAnimals` — *Visual Hutch-Row & Pasture Board must display grouped pens, feedlot controls, maintenance checkoffs, and QR cage card printing.*
- `src/components/SpeciesDashboardScreen.tsx` must contain `FacilityPenBoard`, `facilityBoardModel`, `handlePrintCageCardsForAnimals`, `highlightedCageId` — *Species dashboard Cages & Pens block must mount FacilityPenBoard alongside compact list view, full-screen board modal, and QR card print preview.*

**Restoration Playbook if Overwritten:**
1. Restore `src/core/qrCode.ts`, `src/core/facilityBoard.ts`, and their tests in `src/core/__tests__/qrCode.test.ts` and `src/core/__tests__/facilityBoard.test.ts`.
2. Keep extended `CageLocation` fields in `src/core/models.ts`, SQLite columns/migrations in `src/storage/webSqliteAdapter.ts`, and JSON round-trip parsing in `src/core/syncAndExports.ts`.
3. Keep QR code rendering in `src/core/syncAndExports.ts` (`generateThermalCageCardHtml`) and `src/core/batchPrint.ts` (`includeQrCodes`) wired to `PrintPreviewModal.tsx`, `HerdScreen.tsx`, and `SpeciesDashboardScreen.tsx`.
4. Keep `FacilityPenBoard.tsx` mounted in `SpeciesDashboardScreen.tsx` and `highlightedCageId` deep-link resolution in `useBarnStore.ts` and `src/App.tsx`.

### IMP-037: Side-by-Side Multi-Candidate Pairing Comparison Matrix (Breeding Lab)

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Compare one dam against multiple candidate sires (or vice versa) in a single Breeding Lab table showing COI %, shared bottleneck ancestors, carrier risk flags, and predicted coat varieties side by side.
- **Summary:** Adds a pure TypeScript multi-candidate pairing matrix engine (`pairingMatrix.ts`) and interactive `PairingComparisonMatrix` table inside `BreedingScreen` so breeders can compare one Dam against multiple candidate Sires (or one Sire against multiple candidate Dams) side by side for projected Wright COI %, shared bottleneck ancestors, carrier and genetic health/lethal risk flags, and predicted coat varieties, with 1-click loading into the Cage-Side Pairing Logger.
- **Tracked Files:** `src/core/pairingMatrix.ts`, `src/core/__tests__/pairingMatrix.test.ts`, `src/components/PairingComparisonMatrix.tsx`, `src/components/BreedingScreen.tsx`

**Automated Invariants Checked:**
- `src/core/pairingMatrix.ts` must contain `buildPairingComparisonMatrix`, `selectDefaultMatrixCandidateIds`, `createSpeciesCoiEvaluator`, `analyzePairingCarrierRisksFromAnalyses`, `simulatePairingGenetics` — *Pure TS multi-candidate comparison matrix must share one species COI evaluator, run carrier lineage + Punnett simulations, and remain zero-DOM.*
- `src/components/PairingComparisonMatrix.tsx` must contain `PairingComparisonMatrix`, `buildPairingComparisonMatrix`, `ColorGeneticsNotice`, `onLoadPairingInLogger` — *Breeding Lab comparison matrix UI must render anchor/candidate selectors, sort/filter controls, coat genetics notice, and Load in Logger wiring.*
- `src/components/BreedingScreen.tsx` must contain `PairingComparisonMatrix`, `handleLoadPairingFromMatrix` — *BreedingScreen must mount PairingComparisonMatrix and connect Load in Logger to the Cage-Side Pairing Logger.*

**Restoration Playbook if Overwritten:**
1. Restore `src/core/pairingMatrix.ts` and its unit tests in `src/core/__tests__/pairingMatrix.test.ts`.
2. Restore `src/components/PairingComparisonMatrix.tsx` with anchor role toggle, candidate multi-select, COI/bottleneck/carrier/variety columns, and `ColorGeneticsNotice`.
3. Mount `<PairingComparisonMatrix />` and `handleLoadPairingFromMatrix` inside `src/components/BreedingScreen.tsx`.

### IMP-038: Color-Coded Allele Provenance, Unique-Ancestor Dimming & ARBA Registration Flags

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Color-code alleles by inheritance provenance (sire vs. dam vs. offspring vs. manual), dim unique non-convergent ancestors on pedigree trees to highlight linebred convergence, and flag Gen 0–3 pedigree nodes in red when missing ARBA registration fields would block registration.
- **Summary:** Adds a pure TypeScript allele provenance classifier (`analyzeAlleleProvenance` in `geneticsEngine.ts`) and pedigree convergence + ARBA 3-generation registration evaluator (`pedigreeAnalysis.ts`), a reusable color-coded genotype renderer (`ColoredGenotypeDisplay.tsx`), Dim Unique convergence spotlighting and red ARBA registration deficiency overlays on `PedigreeScreen`, and provenance displays with legend across `HerdScreen` and `BreedingScreen`.
- **Tracked Files:** `src/core/geneticsEngine.ts`, `src/core/pedigreeAnalysis.ts`, `src/core/__tests__/pedigreeAnalysis.test.ts`, `src/components/ColoredGenotypeDisplay.tsx`, `src/components/PedigreeScreen.tsx`, `src/components/HerdScreen.tsx`, `src/components/BreedingScreen.tsx`

**Automated Invariants Checked:**
- `src/core/geneticsEngine.ts` must contain `analyzeAlleleProvenance`, `AlleleProvenanceSource`, `AnimalAlleleProvenanceResult` — *Pure TS allele provenance classifier must support Mendelian elimination, offspring inference, X-linked loci, and custom species isolation without DOM dependencies.*
- `src/core/pedigreeAnalysis.ts` must contain `isArbaRegistrationSpecies`, `evaluateAnimalArbaRegistration`, `analyzePedigreeTree` — *Pure TS pedigree convergence and ARBA registration evaluator must scope ARBA rules to Rabbit/Cavy Gen 0–3 nodes and remain zero-DOM.*
- `src/components/ColoredGenotypeDisplay.tsx` must contain `ColoredGenotypeDisplay`, `AlleleProvenanceLegend` — *Reusable provenance renderer must style Sire, Dam, Offspring, Manual, and Unverified alleles with accessible labels and legend.*
- `src/components/PedigreeScreen.tsx` must contain `analyzePedigreeTree`, `analyzeAlleleProvenance`, `dimUniqueAncestors`, `showRegistrationFlags`, `ColoredGenotypeDisplay` — *PedigreeScreen must wire Dim Unique convergence spotlighting, ARBA registration flags, and color-coded node alleles.*
- `src/components/HerdScreen.tsx` must contain `analyzeAlleleProvenance`, `ColoredGenotypeDisplay` — *HerdScreen Genetics & Allele Inference card must display color-coded allele provenance and uncommitted inference previews.*
- `src/components/BreedingScreen.tsx` must contain `analyzeAlleleProvenance`, `ColoredGenotypeDisplay`, `AlleleProvenanceLegend` — *BreedingScreen Coat Color Punnett panel must display color-coded Sire/Dam allele provenance alongside locus pair highlights.*

**Restoration Playbook if Overwritten:**
1. Keep `analyzeAlleleProvenance` in `src/core/geneticsEngine.ts` and `src/core/pedigreeAnalysis.ts` with unit tests in `src/core/__tests__/pedigreeAnalysis.test.ts`.
2. Restore `src/components/ColoredGenotypeDisplay.tsx` (`ColoredGenotypeDisplay` + `AlleleProvenanceLegend`).
3. Keep Dim Unique, ARBA Reg Flags, and provenance wiring in `PedigreeScreen.tsx`, `HerdScreen.tsx`, and `BreedingScreen.tsx`.

### IMP-039: Pedigree Print Orientation Toggle, Optional Breeder Logo, ARBA lbs.oz Notation & Direct Offline PDF Export

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Allow breeders to switch ARBA pedigrees between Landscape and Portrait 8.5"x11", attach a rabbitry/barn logo in the header, toggle ARBA lbs.oz decimal dot weights, and download a .PDF file directly 100% offline.
- **Summary:** Adds Landscape/Portrait 8.5"x11" print orientation, optional barn/rabbitry raster logo header upload (`BarnSettings.breederLogoDataUrl`), ARBA `lbs.oz` dot weight notation (`formatWeightArbaLbsOzDot`, e.g., `10.04`), and a zero-dependency pure TypeScript 100% offline PDF 1.4 binary generator (`buildPedigreePdfBytes` in `pdfExporter.ts` + `webPdfActions.ts`) with direct Download .PDF in `PrintPreviewModal`.
- **Tracked Files:** `src/core/models.ts`, `src/core/syncAndExports.ts`, `src/core/pdfExporter.ts`, `src/core/__tests__/pdfExporter.test.ts`, `src/utils/webPdfActions.ts`, `src/storage/webSqliteAdapter.ts`, `src/components/SettingsAndSyncScreen.tsx`, `src/components/PrintPreviewModal.tsx`, `src/components/PedigreeScreen.tsx`, `src/components/HerdScreen.tsx`

**Automated Invariants Checked:**
- `src/core/models.ts` must contain `breederLogoDataUrl`, `formatWeightArbaLbsOzDot`, `formatPedigreeWeight` — *BarnSettings must persist optional breederLogoDataUrl and models.ts must expose pure ARBA lbs.oz dot notation formatters.*
- `src/core/syncAndExports.ts` must contain `PedigreePrintOrientation`, `arbaLbsOzDotNotation`, `showBreederLogo`, `barn-logo` — *generateEvansHtmPedigree must support Landscape/Portrait @page sizing, ARBA lbs.oz dot weights, and header logo rendering.*
- `src/core/pdfExporter.ts` must contain `buildPedigreePdfBytes`, `PdfRasterImage`, `/DCTDecode` — *Pure TS offline PDF 1.4 generator must emit valid PDF binaries with JPEG XObjects and zero DOM dependencies.*
- `src/components/PrintPreviewModal.tsx` must contain `onDownloadPdf`, `Download .PDF`, `ARBA lbs.oz (10.04)`, `Portrait (8.5` — *PrintPreviewModal must expose orientation toggle, lbs.oz dot toggle, logo controls, and direct Download .PDF action.*

**Restoration Playbook if Overwritten:**
1. Keep `breederLogoDataUrl`, `formatWeightArbaLbsOzDot`, and `formatPedigreeWeight` in `src/core/models.ts` and `webSqliteAdapter.ts` extra_settings_json.
2. Restore `src/core/pdfExporter.ts`, `src/utils/webPdfActions.ts`, and `src/core/__tests__/pdfExporter.test.ts`.
3. Keep orientation, ARBA lbs.oz, logo upload/toggle, and `onDownloadPdf` wired across `SettingsAndSyncScreen.tsx`, `PrintPreviewModal.tsx`, `PedigreeScreen.tsx`, and `HerdScreen.tsx`.

### IMP-040: 8-Generation Pedigree Tree Mode, Custom Print Styling Presets & Shareable HTML Pedigree Cards

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Let breeders view and export up to 8 generations on demand, customize pedigree print borders, colors, and layouts safely on crisp white paper, and export lightweight standalone shareable pedigree HTML cards.
- **Summary:** Extends pedigree traversal, SQLite neighborhood loading, Evans .HTM output, and pure-TS offline PDF 1.4 export (auto-paginating 7-gen into 2 sheets and 8-gen into 4 grandparent quadrants) up to 8 generations on demand while keeping startup defaults capped at 3–6G; adds white-paper-locked color/border/layout print presets (`pedigreePrintStyles.ts`) and lightweight standalone mobile `.HTML` shareable pedigree cards (`shareablePedigreeCard.ts`).
- **Tracked Files:** `src/core/models.ts`, `src/core/pedigreeCalculator.ts`, `src/core/pedigreePrintStyles.ts`, `src/core/shareablePedigreeCard.ts`, `src/core/syncAndExports.ts`, `src/core/pdfExporter.ts`, `src/core/exporters/exporterTypes.ts`, `src/core/exporters/registry.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/PrintPreviewModal.tsx`, `src/components/PedigreeScreen.tsx`, `src/components/HerdScreen.tsx`, `src/components/ImportExportHubScreen.tsx`

**Automated Invariants Checked:**
- `src/core/models.ts` must contain `DefaultPedigreeGenerations`, `PedigreeGenerationDepth`, `normalizePedigreeGenerationDepth`, `normalizeDefaultPedigreeGenerations` — *models.ts must separate 3–6G startup defaults from on-demand 3–8G PedigreeGenerationDepth.*
- `src/core/pedigreePrintStyles.ts` must contain `PEDIGREE_COLOR_PRESETS`, `PEDIGREE_BORDER_STYLES`, `PEDIGREE_LAYOUT_PRESETS`, `resolvePedigreePrintTheme` — *Pure TS print preset engine must define color, border, and layout presets locked to #FFFFFF paper.*
- `src/core/shareablePedigreeCard.ts` must contain `generateShareablePedigreeCardHtml`, `buildShareablePedigreeCardFileName`, `ShareablePedigreeCardOptions` — *Pure TS shareable HTML pedigree card generator must render zero-DOM self-contained cards with collapsible Gen 4–8 ancestry.*
- `src/core/exporters/registry.ts` must contain `shareable-pedigree-card`, `generateShareablePedigreeCardHtml` — *Exporters registry must expose Shareable Pedigree Card (.HTML) alongside 8-gen Evans .HTM.*
- `src/components/PrintPreviewModal.tsx` must contain `pedigreeDocMode`, `onChangePedigreeDocMode`, `PEDIGREE_COLOR_PRESETS`, `PEDIGREE_BORDER_STYLES`, `PEDIGREE_LAYOUT_PRESETS` — *PrintPreviewModal must allow switching between Formal Certificate and Shareable Card and picking color, border, and layout presets.*
- `src/storage/webSqliteAdapter.ts` must contain `Math.min(8, Math.max(0, Math.floor(maxDepth)))`, `MAX_RECORDS = 512` — *SQLite neighborhood loader must fetch up to 8 generations with expanded ancestor node cap (512).*

**Restoration Playbook if Overwritten:**
1. Keep `PedigreeGenerationDepth` (`3..8`) and normalizers in `src/core/models.ts` plus Gen 7–8 `slotRoleLabel`/`buildPedigreeSlots` in `src/core/pedigreeCalculator.ts`.
2. Restore `src/core/pedigreePrintStyles.ts`, `src/core/shareablePedigreeCard.ts`, multi-page 7–8G sheets in `src/core/pdfExporter.ts`, and `shareable-pedigree-card` in `src/core/exporters/registry.ts`.
3. Preserve 7/8-gen toggles, style preset selectors, and `pedigreeDocMode` wiring across `webSqliteAdapter.ts`, `useBarnStore.ts`, `PrintPreviewModal.tsx`, `PedigreeScreen.tsx`, `HerdScreen.tsx`, and `ImportExportHubScreen.tsx`.

### IMP-041: Structured Show Placements, Wins, Judge Notes & E-Leg Vault

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Capture structured show results, judge feedback, legs, and E-Leg certificate photos per entered animal so GC progress and show wins automatically enrich pedigrees, Barn Binder, and breeder reports.
- **Summary:** Expands ShowEvent entries with per-animal class placements, sanctionable awards (BOB, BOS, BIS, GCH, BOV, BOSV, RIS), judge names and notes, earned legs/points, E-Leg certificate numbers, and compressed raster E-Leg photo attachments (showResults.ts), synchronizing Animal.legsCount deltas and feeding Grand Championship progress and show honors into Male/Female reports, Barn Binder, Evans .HTM, Shareable Cards, Offline PDF pedigrees, and Herd/Pedigree/Species screens.
- **Tracked Files:** `src/core/models.ts`, `src/core/showResults.ts`, `src/core/__tests__/showResults.test.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/core/reportGenerators.ts`, `src/core/barnBinder.ts`, `src/core/syncAndExports.ts`, `src/core/pdfExporter.ts`, `src/core/shareablePedigreeCard.ts`, `src/core/exporters/registry.ts`, `src/core/speciesMigration.ts`, `src/core/syncOutbox.ts`, `src/components/SpeciesDashboardScreen.tsx`, `src/components/PedigreeScreen.tsx`, `src/components/HerdScreen.tsx`

**Automated Invariants Checked:**
- `src/core/models.ts` must contain `ShowAwardCode`, `SHOW_AWARD_OPTIONS`, `ShowELegAttachment`, `ShowAnimalResult` — *Canonical show award codes, E-Leg attachment types, and ShowEvent.results schema must stay intact.*
- `src/core/showResults.ts` must contain `normalizeShowResults`, `sanitizeShowELegAttachment`, `computeShowLegDeltas`, `computeAnimalShowSummary` — *Pure TS show results normalization, XSS-safe E-Leg attachment sanitization, leg delta reconciliation, and GC progress calculation must remain zero-DOM.*
- `src/storage/webSqliteAdapter.ts` must contain `results_json`, `normalizeShowResults` — *SQLite shows table and idempotent schema migration must persist and normalize results_json.*
- `src/hooks/useBarnStore.ts` must contain `normalizeShowResults`, `computeShowLegDeltas` — *Store show save/delete mutations must normalize results and reconcile Animal.legsCount deltas atomically.*
- `src/core/reportGenerators.ts` must contain `computeAnimalShowSummary`, `gcProgress`, `showWins`, `showPoints` — *Male/Female reports must aggregate show wins, points, combined legs, and Grand Champion progress automatically.*
- `src/core/barnBinder.ts` must contain `computeAnimalShowSummary`, `Show Legs / GC Progress` — *Barn Binder must include structured show placements, judge notes, E-Leg cert numbers, and E-Leg photo thumbnails.*
- `src/core/syncAndExports.ts` must contain `computeAnimalShowSummary`, `gcProgress.shortLabel` — *Evans .HTM pedigrees and JSON backups must carry structured ShowEvent.results and display show honors.*
- `src/core/pdfExporter.ts` must contain `computeAnimalShowSummary`, `gcProgress.shortLabel` — *Offline PDF 1.4 pedigrees must render show legs/GC status, awards, points, and ancestor honors.*
- `src/core/shareablePedigreeCard.ts` must contain `computeAnimalShowSummary`, `awardsSummaryText` — *Shareable pedigree cards must badge show legs, GC eligibility, awards, and points.*
- `src/components/SpeciesDashboardScreen.tsx` must contain `ShowAnimalResult`, `SHOW_AWARD_OPTIONS`, `eLegLightboxRef`, `showSubmitLock` — *Species Hub must expose the accessible Show & Results Editor Modal, multi-award toggles, E-Leg photo vault uploader, and lightbox viewer.*
- `src/components/PedigreeScreen.tsx` must contain `computeAnimalShowSummary`, `subjectShowSummary` — *PedigreeScreen must surface show honors and forward shows/careLogs to all pedigree exports.*
- `src/components/HerdScreen.tsx` must contain `computeAnimalShowSummary`, `activeAnimalShowSummary`, `eLegLightboxRef` — *HerdScreen profile must display GC progress bar, show history, E-Leg vault lightbox, and forward shows/careLogs to formal prints.*

**Restoration Playbook if Overwritten:**
1. Keep ShowAwardCode, SHOW_AWARD_OPTIONS, ShowELegAttachment, ShowAnimalResult, and ShowEvent.results in `src/core/models.ts` plus `src/core/showResults.ts` and `src/core/__tests__/showResults.test.ts`.
2. Preserve `results_json` persistence/migration in `src/storage/webSqliteAdapter.ts`, leg delta reconciliation in `src/hooks/useBarnStore.ts`, and species migration/outbox handling in `speciesMigration.ts` / `syncOutbox.ts`.
3. Keep `computeAnimalShowSummary` integrations across `reportGenerators.ts`, `barnBinder.ts`, `syncAndExports.ts`, `pdfExporter.ts`, `shareablePedigreeCard.ts`, `exporters/registry.ts`, `SpeciesDashboardScreen.tsx`, `PedigreeScreen.tsx`, and `HerdScreen.tsx`.

### IMP-042: Genetic Variety / Coat Explorer Sandbox (What-If Playground in Breeding Lab)

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Let breeders experiment with hypothetical loci combinations and What-If crosses inside Breeding Lab and see predicted coat varieties, hidden carriers, and alerts without creating temporary animal records first.
- **Summary:** Adds pure TS single-genotype phenotype, hidden recessive carrier, and single-animal health/lethal alert evaluation (`evaluateSingleGenotypeSandbox`, `buildSandboxHypotheticalAnimal` in `geneticsEngine.ts`) plus the ephemeral interactive `CoatExplorerSandbox` playground inside `BreedingScreen` supporting Single Genotype and What-If Pairing Cross modes, variety presets with optional modifier checks, read-only herd/logger seeding, and interactive locus allele editing without creating temporary animal records.
- **Tracked Files:** `src/core/geneticsEngine.ts`, `src/core/__tests__/geneticsEngine.test.ts`, `src/components/CoatExplorerSandbox.tsx`, `src/components/BreedingScreen.tsx`

**Automated Invariants Checked:**
- `src/core/geneticsEngine.ts` must contain `SingleGenotypeEvaluation`, `evaluateSingleGenotypeSandbox`, `buildSandboxHypotheticalAnimal` — *Pure TS Coat Explorer Sandbox evaluator and hypothetical animal shell builder must remain zero-DOM and custom-species isolated.*
- `src/components/CoatExplorerSandbox.tsx` must contain `CoatExplorerSandbox`, `evaluateSingleGenotypeSandbox`, `buildSandboxHypotheticalAnimal`, `ColorGeneticsNotice` — *Breeding Lab Coat Explorer Sandbox UI must remain strictly ephemeral (no persistence writes) with What-If Single & Cross modes and ColorGeneticsNotice.*
- `src/components/BreedingScreen.tsx` must contain `<CoatExplorerSandbox` — *BreedingScreen must mount CoatExplorerSandbox inside Breeding Lab.*

**Restoration Playbook if Overwritten:**
1. Keep `SingleGenotypeEvaluation`, `evaluateSingleGenotypeSandbox`, and `buildSandboxHypotheticalAnimal` in `src/core/geneticsEngine.ts` with tests in `src/core/__tests__/geneticsEngine.test.ts`.
2. Restore `src/components/CoatExplorerSandbox.tsx` with Single Genotype & What-If Cross modes, variety presets, locus selectors, and `ColorGeneticsNotice`.
3. Mount `<CoatExplorerSandbox />` inside `src/components/BreedingScreen.tsx`.

### IMP-043: Rate of Gain, Comparative Weight Charts & Litter Survival Curves

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Track kit/offspring survival rate per dam and sire, chart litter weight-gain milestones across seasons, and compare multi-animal Rate of Gain curves on an age-in-days axis with native target/goal overlays.
- **Summary:** Adds pure TS age-in-days Rate of Gain (ADG), Barn Cohort Benchmark, interpolated user-defined goal weight curves, meteorological seasonal bucketing, and dam/sire litter survival & milestone analytics (`growthAnalytics.ts`) backed by `SpeciesProfile.targetWeightCurve` and `BreedingRecord.litterWeightMilestones` across SQLite, JSON, store hooks, `GrowthAndSurvivalLab`, `BreedingScreen` Outcome milestone editor, `HerdScreen` compare actions, and the `litter-survival-performance-report`.
- **Tracked Files:** `src/core/models.ts`, `src/core/growthAnalytics.ts`, `src/core/__tests__/growthAnalytics.test.ts`, `src/core/syncAndExports.ts`, `src/core/reportCatalog.ts`, `src/core/reportGenerators.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/GrowthAndSurvivalLab.tsx`, `src/components/BreedingScreen.tsx`, `src/components/HerdScreen.tsx`, `src/App.tsx`

**Automated Invariants Checked:**
- `src/core/models.ts` must contain `TargetWeightPoint`, `normalizeTargetWeightCurve`, `LitterWeightMilestone`, `normalizeLitterWeightMilestones` — *Target weight curve points and litter weight-gain milestone types/normalizers must remain intact on SpeciesProfile and BreedingRecord.*
- `src/core/growthAnalytics.ts` must contain `evaluateLitterSurvivalAndMilestones`, `buildAnimalGrowthSeries`, `buildBarnCohortBenchmarkCurve`, `buildComparativeGrowthChartModel`, `resolveMeteorologicalSeason` — *Pure TS growth, seasonal litter survival, cohort benchmark, and comparative ADG engine must stay zero-DOM.*
- `src/storage/webSqliteAdapter.ts` must contain `target_weight_curve_json`, `litter_weight_milestones_json` — *SQLite schema and idempotent migrations must persist species target curves and breeding litter milestones.*
- `src/hooks/useBarnStore.ts` must contain `updateSpeciesTargetWeightCurve`, `openGrowthCompareForAnimals` — *Store must persist species target weight curves, litter milestones, and launch preselected multi-animal growth comparisons.*
- `src/components/GrowthAndSurvivalLab.tsx` must contain `GrowthAndSurvivalLab`, `buildComparativeGrowthChartModel`, `evaluateLitterSurvivalAndMilestones` — *GrowthAndSurvivalLab UI must expose Comparative Rate of Gain charts with goal/cohort overlays and Litter Survival & Parent Curves.*
- `src/components/BreedingScreen.tsx` must contain `<GrowthAndSurvivalLab`, `litterWeightMilestones` — *BreedingScreen must mount GrowthAndSurvivalLab and expose litter weight milestone editing inside the Outcome modal.*
- `src/core/reportGenerators.ts` must contain `litter-survival-performance-report`, `evaluateLitterSurvivalAndMilestones` — *Reports catalog and generator must expose Litter Survival & Parent Performance Report.*

**Restoration Playbook if Overwritten:**
1. Keep `TargetWeightPoint`, `normalizeTargetWeightCurve`, `LitterWeightMilestone`, and `normalizeLitterWeightMilestones` in `src/core/models.ts` plus `target_weight_curve_json` & `litter_weight_milestones_json` in `src/storage/webSqliteAdapter.ts` and `src/core/syncAndExports.ts`.
2. Restore `src/core/growthAnalytics.ts` and `src/core/__tests__/growthAnalytics.test.ts`.
3. Keep `updateSpeciesTargetWeightCurve`, `openGrowthCompareForAnimals`, `GrowthAndSurvivalLab.tsx`, Outcome milestone inputs in `BreedingScreen.tsx`, Herd growth compare buttons in `HerdScreen.tsx` / `App.tsx`, and `litter-survival-performance-report` in `reportCatalog.ts` / `reportGenerators.ts`.

### IMP-044: Feed Inventory Ledger, Tag Lot-Number OCR & Biosecurity Auto-Purge

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Track purchased feed lots, allocate intake to pens and litters, scan feed tag stamps before deep compression with manual fallback, auto-purge heavy raw tag images after lot indexing, and keep an offline feed manufacturer recall & hotline directory.
- **Summary:** Adds strictly species-isolated `FeedBatch` & `FeedAllocation` tracking across SQLite schema v3 (`feed_batches`, `feed_allocations`), JSON/ZIP backups, data health repair, and `useBarnStore`, paired with pre-compression local OCR (`captureFeedTagWithPreCompressionOcr` + `extractFeedTagDetailsFromOcrText`) to index mill lot numbers and plant codes with manual override, configurable 30/60/90-day biosecurity auto-purge of stored tag images (`purgeExpiredFeedTagPhotosPure`), lot traceability across cages/litters/animals (`traceFeedLotToCagesAndLitters`), and an offline manufacturer emergency directory (`FEED_MANUFACTURER_DIRECTORY`).
- **Tracked Files:** `src/core/models.ts`, `src/core/feedInventory.ts`, `src/core/feedManufacturerDirectory.ts`, `src/core/__tests__/feedInventory.test.ts`, `src/storage/feedTagOcr.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/FeedLedgerScreen.tsx`, `src/components/FacilityPenBoard.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/App.tsx`

**Automated Invariants Checked:**
- `src/core/models.ts` must contain `FeedBatch`, `FeedAllocation`, `FEED_PURGE_WINDOW_OPTIONS`, `normalizeFeedPurgeWindowDays` — *FeedBatch, FeedAllocation, and 30/60/90/0 biosecurity purge window options must remain intact in core models.*
- `src/core/feedInventory.ts` must contain `extractFeedTagDetailsFromOcrText`, `purgeExpiredFeedTagPhotosPure`, `traceFeedLotToCagesAndLitters`, `formatFeedLedgerCsv` — *Pure TS lot OCR parser, lot-gated biosecurity purge transform, lot traceability, and CSV exporter must stay zero-DOM.*
- `src/core/feedManufacturerDirectory.ts` must contain `FEED_MANUFACTURER_DIRECTORY`, `filterFeedManufacturerDirectory`, `matchManufacturerForBrand` — *Bundled offline manufacturer emergency & recall directory must stay accessible with zero network.*
- `src/storage/feedTagOcr.ts` must contain `captureFeedTagWithPreCompressionOcr`, `optimizeImageBlob` — *Feed tag OCR must decode and analyze full-resolution images BEFORE compact image compression.*
- `src/storage/webSqliteAdapter.ts` must contain `feed_batches`, `feed_allocations`, `saveFeedBatchesBatch` — *SQLite persistence schema and adapter methods must store and hydrate feed batches and intake allocations.*
- `src/hooks/useBarnStore.ts` must contain `saveFeedBatch`, `logFeedAllocation`, `runFeedTagBiosecurityAutoPurge` — *Store must expose species-isolated feed ledger mutations, cage stock sync, and idle biosecurity auto-purge.*
- `src/components/FeedLedgerScreen.tsx` must contain `FeedLedgerScreen`, `captureFeedTagWithPreCompressionOcr`, `FEED_MANUFACTURER_DIRECTORY` — *FeedLedgerScreen must provide purchase/OCR scanning, intake allocations, lot traceability, and offline manufacturer contacts.*
- `src/App.tsx` must contain `FeedLedgerScreen`, `route === 'feed'` — *Root router must lazy-load and mount FeedLedgerScreen on route feed.*

**Restoration Playbook if Overwritten:**
1. Keep `FeedBatch`, `FeedAllocation`, `FEED_PURGE_WINDOW_OPTIONS`, and `normalizeFeedPurgeWindowDays` in `src/core/models.ts` plus SQLite tables in `src/storage/webSqliteAdapter.ts`.
2. Restore `src/core/feedInventory.ts`, `src/core/feedManufacturerDirectory.ts`, `src/core/__tests__/feedInventory.test.ts`, and `src/storage/feedTagOcr.ts`.
3. Keep `saveFeedBatch`, `logFeedAllocation`, `runFeedTagBiosecurityAutoPurge` in `useBarnStore.ts` and mount `FeedLedgerScreen.tsx` in `SpeciesDashboardScreen.tsx`, `FacilityPenBoard.tsx`, and `App.tsx`.

### IMP-045: Offline Photo Pedigree Scanning & Local OCR Importer

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Allow breeders to snap a photo or upload JPG/PNG/WebP/PDF scans of paper pedigrees completely offline, review/correct extracted ancestor names, ear tattoos, weights, and ARBA registration numbers across 3 generations, and stage them straight into the Import Review Queue with duplicate/conflict resolution.
- **Summary:** Adds 100% offline client-side paper pedigree scanning and PDF extraction via `pdfScanExtractor.ts` (searchable `/FlateDecode` `BT...ET` text vectors with coordinates and embedded `/DCTDecode` scanned JPEG pages) plus `pedigreeOcrParser.ts` (2D bounding-box 3-col/4-col pedigree tree reconstruction and text heuristics into an editable 15-slot 3-generation draft queue backed by `PlatformImportPreview`), wired with `pedigreeOcrScanner.ts` (native Chromium `TextDetector` + lazy bounded `tesseract.js` worker with `offline_manual` fallback) into `PedigreeOcrScannerPanel.tsx` and `ExternalImporterPanel.tsx`.
- **Tracked Files:** `src/core/importers/pdfScanExtractor.ts`, `src/core/importers/pedigreeOcrParser.ts`, `src/core/__tests__/pedigreeOcrParser.test.ts`, `src/storage/pedigreeOcrScanner.ts`, `src/components/PedigreeOcrScannerPanel.tsx`, `src/components/ExternalImporterPanel.tsx`, `src/components/ImportExportHubScreen.tsx`

**Automated Invariants Checked:**
- `src/core/importers/pdfScanExtractor.ts` must contain `extractPedigreePdfPages`, `MAX_PDF_SCAN_BYTES`, `MAX_PDF_SCAN_PAGES` — *Pure TS offline PDF vector text (`BT...ET`) and embedded `/DCTDecode` JPEG extractor must remain zero-DOM.*
- `src/core/importers/pedigreeOcrParser.ts` must contain `PEDIGREE_OCR_SLOT_DESCRIPTORS`, `parsePedigreeSlotLines`, `parsePedigreeOcrResult`, `buildPlatformImportPreviewFromOcrDrafts` — *Pure TS 2D tree/line pedigree parser and Import Review Queue preview bridge must stay zero-DOM and deterministic.*
- `src/storage/pedigreeOcrScanner.ts` must contain `scanPedigreeDocumentFile`, `tesseract.js` — *Browser OCR runner must lazy-load Tesseract worker with bounded timeout, native TextDetector precheck, and soft offline manual fallback.*
- `src/components/PedigreeOcrScannerPanel.tsx` must contain `PedigreeOcrScannerPanel`, `scanPedigreeDocumentFile`, `buildPlatformImportPreviewFromOcrDrafts` — *Scanner UI must offer camera/photo/PDF capture, editable 15-slot 3-generation review, and staging into Import Review Queue.*
- `src/components/ExternalImporterPanel.tsx` must contain `externalOcrPreview`, `onClearExternalOcrPreview` — *ExternalImporterPanel must accept staged OCR PlatformImportPreview drafts for full conflict resolution and WebP photo optimization.*
- `src/components/ImportExportHubScreen.tsx` must contain `<PedigreeOcrScannerPanel`, `stagedOcrPreview` — *ImportExportHubScreen Section 02 must mount PedigreeOcrScannerPanel connected to ExternalImporterPanel.*

**Restoration Playbook if Overwritten:**
1. Restore pure parsers `src/core/importers/pdfScanExtractor.ts`, `src/core/importers/pedigreeOcrParser.ts`, and `src/core/__tests__/pedigreeOcrParser.test.ts`.
2. Restore `src/storage/pedigreeOcrScanner.ts` and `src/components/PedigreeOcrScannerPanel.tsx`.
3. Keep `externalOcrPreview`/`onClearExternalOcrPreview` props in `ExternalImporterPanel.tsx` and `<PedigreeOcrScannerPanel>` wired inside `ImportExportHubScreen.tsx`.

### IMP-046: Local Economic Ledger, Meat/Pelt Processing Yields & 4-H/FFA Project Books

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Provide offline barn bookkeeping with receipt photos, automated animal/litter P&L margins, meat/pelt carcass yield and pelt grading logs, and printable 4-H/FFA youth livestock project completion books.
- **Summary:** Adds species-isolated general barn income/expense tracking (`LedgerEntry`) with compressed receipt photo attachments (`optimizeImageFile`) and feed-lot deduplication; automated per-animal and per-litter net profit/loss margins (`computeAnimalProfitMargins`, `computeLitterProfitMargins`); meat & pelt processing logs (`ProcessingLog`) tracking butcher schedules, harvest dates, live-to-dressed carcass dress-out %, and pelt grades; 4-H/FFA Youth Project Record Books (`YouthProjectBook`) with ration feed logs, inventory changes, and printable `.HTM`/PDF completion reports (`generateYouthProjectReportHtml`); SQLite v4 persistence, sync outbox deltas, 3 new report presets, and `EconomicsLedgerScreen.tsx` accessible from Species Dashboard & `E` shortcut.
- **Tracked Files:** `src/core/models.ts`, `src/core/economicsLedger.ts`, `src/core/__tests__/economicsLedger.test.ts`, `src/core/reportCatalog.ts`, `src/core/reportGenerators.ts`, `src/core/syncOutbox.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/EconomicsLedgerScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/App.tsx`

**Automated Invariants Checked:**
- `src/core/models.ts` must contain `LedgerEntry`, `LEDGER_CATEGORY_OPTIONS`, `ProcessingLog`, `PELT_GRADE_OPTIONS`, `YouthProjectBook` — *LedgerEntry, ProcessingLog, and YouthProjectBook domain models and normalizers must remain intact.*
- `src/core/economicsLedger.ts` must contain `calculateDressOutPercent`, `computeAnimalProfitMargins`, `computeLitterProfitMargins`, `evaluateSpeciesEconomicsSummary`, `evaluateProcessingSummary`, `evaluateYouthProjectSummary`, `generateYouthProjectReportHtml` — *Pure TS economics margins, yield analytics, CSV exporters, and printable youth completion report builder must remain zero-DOM.*
- `src/storage/webSqliteAdapter.ts` must contain `ledger_entries`, `processing_logs`, `youth_project_books`, `saveLedgerEntry`, `saveProcessingLog`, `saveYouthProjectBook` — *SQLite persistence schema v4 and adapter CRUD methods must store and hydrate ledger entries, processing logs, and youth project books.*
- `src/hooks/useBarnStore.ts` must contain `saveLedgerEntry`, `saveProcessingLog`, `saveYouthProjectBook` — *Store must expose species-isolated economics, processing, and 4-H/FFA project mutations with delta outbox sync.*
- `src/components/EconomicsLedgerScreen.tsx` must contain `EconomicsLedgerScreen`, `generateYouthProjectReportHtml`, `evaluateSpeciesEconomicsSummary` — *EconomicsLedgerScreen must provide general ledger + receipt photos, meat/pelt yields, and 4-H/FFA project record books.*
- `src/App.tsx` must contain `EconomicsLedgerScreen`, `route === 'economics'` — *Root router must lazy-load and mount EconomicsLedgerScreen on route economics.*

**Restoration Playbook if Overwritten:**
1. Keep `LedgerEntry`, `ProcessingLog`, and `YouthProjectBook` interfaces and normalizers in `src/core/models.ts` plus SQLite v4 tables in `src/storage/webSqliteAdapter.ts`.
2. Restore `src/core/economicsLedger.ts` and `src/core/__tests__/economicsLedger.test.ts` along with the 3 financial/production/youth presets in `reportCatalog.ts` and `reportGenerators.ts`.
3. Keep store CRUD mutations in `src/hooks/useBarnStore.ts` and wire `EconomicsLedgerScreen.tsx` into `SpeciesDashboardScreen.tsx` and `App.tsx`.

### IMP-047: Client CRM, Buyer Waitlist, Reservations & Deposit Reminders

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Track buyer contacts, waitlist queues, animal/litter reservations, deposit due reminders, and printable sales agreements offline without cloud dependencies.
- **Summary:** Adds species-isolated local-first breeder CRM tracking buyer contacts (`ClientContact`), ranked waitlist inquiries (`WaitlistEntry`) with live unreserved animal/pairing match scoring (`findWaitlistMatches`), animal/litter-pick reservations (`AnimalReservation`) with sequential agreement numbering and deposit/balance progress (`evaluateReservationFinancials`), automated overdue/due/upcoming follow-up reminders (`evaluateCrmFollowUpReminders`) with 1-click Master Task creation, XSS-safe printable Sales Agreements with optional breeder logo and active withdrawal disclosures (`generateSalesAgreementHtml`), SQLite v5 persistence, sync outbox deltas, 2 CRM report presets, and `ClientCrmScreen.tsx` accessible from Species Dashboard & `C` shortcut.
- **Tracked Files:** `src/core/models.ts`, `src/core/clientCrm.ts`, `src/core/__tests__/clientCrm.test.ts`, `src/core/reportCatalog.ts`, `src/core/reportGenerators.ts`, `src/core/syncOutbox.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/ClientCrmScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/App.tsx`

**Automated Invariants Checked:**
- `src/core/models.ts` must contain `ClientContact`, `WaitlistEntry`, `AnimalReservation`, `RESERVATION_STATUSES`, `WAITLIST_STATUSES` — *ClientContact, WaitlistEntry, and AnimalReservation domain models and normalizers must remain intact.*
- `src/core/clientCrm.ts` must contain `evaluateReservationFinancials`, `evaluateCrmFollowUpReminders`, `findWaitlistMatches`, `generateSalesAgreementHtml`, `formatReservationsCsv` — *Pure TS CRM financial evaluation, automated follow-up reminders, waitlist matching, CSV export, and printable Sales Agreement generator must stay zero-DOM.*
- `src/storage/webSqliteAdapter.ts` must contain `client_contacts`, `waitlist_entries`, `animal_reservations`, `saveClientContact`, `saveWaitlistEntry`, `saveAnimalReservation` — *SQLite schema v5 and adapter CRUD methods must store and hydrate CRM contacts, waitlist entries, and reservations.*
- `src/hooks/useBarnStore.ts` must contain `saveClientContact`, `saveWaitlistEntry`, `saveAnimalReservation`, `completeReservationSale`, `createCrmReminderTask` — *Store must expose species-isolated CRM mutations, atomic sale completion, and reminder task creation with delta outbox sync.*
- `src/components/ClientCrmScreen.tsx` must contain `ClientCrmScreen`, `generateSalesAgreementHtml`, `evaluateCrmFollowUpReminders`, `findWaitlistMatches` — *ClientCrmScreen must render reminders, reservation/deposit tracking, ranked waitlist matching, client directory, and printable sales agreements.*
- `src/App.tsx` must contain `ClientCrmScreen`, `route === 'crm'` — *Root router must lazy-load and mount ClientCrmScreen on route crm.*

**Restoration Playbook if Overwritten:**
1. Keep `ClientContact`, `WaitlistEntry`, and `AnimalReservation` interfaces and normalizers in `src/core/models.ts` plus SQLite v5 tables in `src/storage/webSqliteAdapter.ts`.
2. Restore `src/core/clientCrm.ts` and `src/core/__tests__/clientCrm.test.ts` along with the 2 CRM presets in `reportCatalog.ts` and `reportGenerators.ts`.
3. Keep CRM mutations in `src/hooks/useBarnStore.ts` and wire `ClientCrmScreen.tsx` into `SpeciesDashboardScreen.tsx` and `App.tsx`.

### IMP-048: Alternative Certificates, Show Entry/Remark Cards & IAGARB Wool/Fiber Tracking

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Support alternative companion birth/breeding certificates, printable/emailable show documents directly from show rosters, family portrait & IAGARB Angora pedigree templates, and wool/fiber harvest logging.
- **Summary:** Adds privacy-scoped Pet-Sale Birth Certificates (omitting breeder contact info & pricing), official Breeding/Service Certificates, ARBA-style Show Entry Forms (`mailto:` + plain-text copy + Open/Youth/fees) & 4-up/1-up Show Remark Cards from ShowEvent rosters, Gen 0–2 multi-photo Family Portrait and IAGARB German Angora pedigree layouts, and SQLite v6 `wool_harvests` tracking with 7-position 100-pt IAGARB scoring and 90-day 325g shearing yield calculations.
- **Tracked Files:** `src/core/models.ts`, `src/core/woolFiber.ts`, `src/core/alternativeCertificates.ts`, `src/core/showDocuments.ts`, `src/core/pedigreePrintStyles.ts`, `src/core/syncAndExports.ts`, `src/core/pdfExporter.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/PrintPreviewModal.tsx`, `src/components/HerdScreen.tsx`, `src/components/PedigreeScreen.tsx`, `src/components/BreedingScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/App.tsx`, `src/core/__tests__/woolFiber.test.ts`, `src/core/__tests__/alternativeCertificates.test.ts`, `src/core/__tests__/showDocuments.test.ts`

**Automated Invariants Checked:**
- `src/core/models.ts` must contain `WoolHarvest`, `IagarbScorecard`, `WOOL_HARVEST_METHODS`, `normalizeWoolHarvestMethod` — *WoolHarvest and IagarbScorecard domain models and normalizers must remain intact.*
- `src/core/woolFiber.ts` must contain `IAGARB_JUDGING_POSITIONS`, `computeIagarbScoreTotal`, `evaluateIagarbEligibility`, `compute90DayEquivalentGrams`, `summarizeAnimalWoolHarvests` — *Pure TS IAGARB 100-point rubric, 325g/90-day performance yield normalization, and harvest summary calculators must stay zero-DOM.*
- `src/core/alternativeCertificates.ts` must contain `generatePetBirthCertificateHtml`, `generateBreedingCertificateHtml`, `buildPetBirthCertificateFileName`, `buildBreedingCertificateFileName` — *Pure TS Pet-Sale Birth Certificate (no breeder contact/pricing) and Breeding Certificate generators must remain zero-DOM and XSS-safe.*
- `src/core/showDocuments.ts` must contain `generateShowEntryFormHtml`, `generateShowRemarkCardsHtml`, `buildShowEntryMailtoUrl`, `buildShowEntryPlainTextSummary` — *Pure TS ARBA Show Entry Form, emailable plain-text/mailto dispatchers, and 4-up/1-up Remark Card generators must remain zero-DOM.*
- `src/core/pedigreePrintStyles.ts` must contain `family_portrait`, `iagarb_angora` — *Family Portrait and IAGARB German Angora pedigree presets must stay registered.*
- `src/storage/webSqliteAdapter.ts` must contain `wool_harvests`, `saveWoolHarvest`, `deleteWoolHarvest` — *SQLite schema v6 must store and hydrate wool_harvests cleanly.*
- `src/hooks/useBarnStore.ts` must contain `saveWoolHarvest`, `deleteWoolHarvest` — *Store must expose species-isolated wool harvest mutations with delta outbox sync.*
- `src/components/HerdScreen.tsx` must contain `generatePetBirthCertificateHtml`, `onSaveWoolHarvest`, `IAGARB_JUDGING_POSITIONS` — *HerdScreen must provide Pet-Sale Birth Certificate previews and Wool / Fiber + IAGARB scoring.*
- `src/components/BreedingScreen.tsx` must contain `generateBreedingCertificateHtml`, `Breeding Cert` — *BreedingScreen must expose Breeding Certificate preview controls.*
- `src/components/SpeciesDashboardScreen.tsx` must contain `generateShowEntryFormHtml`, `generateShowRemarkCardsHtml`, `buildShowEntryMailtoUrl` — *SpeciesDashboardScreen must expose Show Entry Form and Remark Cards print/email previews directly from ShowEvents.*

**Restoration Playbook if Overwritten:**
1. Keep `WoolHarvest` and `IagarbScorecard` models in `src/core/models.ts` and `wool_harvests` SQLite v6 schema in `src/storage/webSqliteAdapter.ts`.
2. Restore pure modules `src/core/woolFiber.ts`, `src/core/alternativeCertificates.ts`, and `src/core/showDocuments.ts` with their unit tests.
3. Keep `family_portrait` & `iagarb_angora` rendering in `pedigreePrintStyles.ts`, `syncAndExports.ts`, and `pdfExporter.ts`, plus UI wiring in `HerdScreen.tsx`, `PedigreeScreen.tsx`, `BreedingScreen.tsx`, `SpeciesDashboardScreen.tsx`, and `App.tsx`.

### IMP-049: Founder Loss / Heritability Analytics & Interactive Barn Scheduler Gantt with LAN P2P Reconciliation

- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Add heritability coefficient trends and founder-loss / ancestor genetic contribution analytics in Breeding Lab & Pedigree Explorer, plus an interactive drag-and-drop Barn Scheduler Gantt timeline with smart priority escalation paired with local P2P/LAN outbox reconciliation.
- **Summary:** Adds pure TS path-summed founder & ancestor genetic contribution analysis (0.5^depth), Lacy Effective Number of Founders (fe), species Founder-Loss & Bottleneck tracking (Active Core / Endangered / Lost), and mid-parent/single-parent OLS heritability (h²) + birth-year cohort trends embedded in Pedigree Explorer & Breeding Lab (`FounderAndHeritabilityPanel.tsx`), alongside an interactive drag-and-drop Barn Scheduler Gantt timeline (`barnScheduler.ts`, `BarnSchedulerGantt.tsx`, `BarnTask.startDateIso` in SQLite) with smart priority escalation for time-critical chores and serverless WebRTC LAN DataChannel + shared-folder + manual delta P2P outbox reconciliation (`p2pSyncProtocol.ts`, `p2pLanChannel.ts`).
- **Tracked Files:** `src/core/models.ts`, `src/core/inputSanitization.ts`, `src/core/pedigreeAnalytics.ts`, `src/core/barnScheduler.ts`, `src/core/p2pSyncProtocol.ts`, `src/storage/p2pLanChannel.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/FounderAndHeritabilityPanel.tsx`, `src/components/BarnSchedulerGantt.tsx`, `src/components/PedigreeScreen.tsx`, `src/components/BreedingScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/App.tsx`, `src/core/__tests__/pedigreeAnalytics.test.ts`, `src/core/__tests__/barnScheduler.test.ts`, `src/core/__tests__/p2pSyncProtocol.test.ts`

**Automated Invariants Checked:**
- `src/core/models.ts` must contain `startDateIso?: string` — *BarnTask must carry optional startDateIso for multi-day Gantt bar spans.*
- `src/core/pedigreeAnalytics.ts` must contain `analyzeAnimalFounderContributions`, `analyzePairingFounderShift`, `analyzeSpeciesFounderLoss`, `analyzeSpeciesHeritabilityTrends` — *Pure TS founder genetic contribution, effective founder fe, founder-loss ledger, and heritability h² analytics must stay zero-DOM.*
- `src/core/barnScheduler.ts` must contain `evaluateTaskPriorityEscalation`, `buildPriorityEscalationUpdates`, `shiftTaskDatesByDays`, `resizeTaskStartDateByDays`, `buildBarnGanttTimeline` — *Pure TS smart priority escalation, UTC date shifting/resizing, and Gantt timeline builders must stay zero-DOM.*
- `src/core/p2pSyncProtocol.ts` must contain `createP2pDeltaWireMessage`, `parseP2pWireOrDeltaPayload`, `summarizeTaskReconciliation`, `encodeP2pSignalToken`, `decodeP2pSignalToken` — *Pure TS LAN P2P wire framing, CP-LAN1 signaling tokens, and task reconciliation summaries must stay zero-DOM and Buffer-free.*
- `src/storage/p2pLanChannel.ts` must contain `createLanP2pSession`, `reconcileWithPickedSyncFolder` — *Serverless LAN WebRTC DataChannel transport and shared-folder reconciliation must stay isolated in storage/.*
- `src/storage/webSqliteAdapter.ts` must contain `start_date_iso` — *SQLite tasks table must persist and hydrate start_date_iso across restarts.*
- `src/hooks/useBarnStore.ts` must contain `rescheduleTaskDates`, `applySmartTaskEscalations`, `reconcileOutboxOperations` — *Store must expose serialized Gantt rescheduling, smart escalation batching, and P2P outbox reconciliation with _rev bumping.*
- `src/components/FounderAndHeritabilityPanel.tsx` must contain `FounderAndHeritabilityPanel`, `analyzeSpeciesFounderLoss`, `analyzeSpeciesHeritabilityTrends` — *FounderAndHeritabilityPanel must visualize founder shares, founder loss, and h² cohort trends.*
- `src/components/BarnSchedulerGantt.tsx` must contain `BarnSchedulerGantt`, `buildBarnGanttTimeline`, `createLanP2pSession` — *BarnSchedulerGantt must provide drag-and-drop Gantt rescheduling, escalation controls, and LAN P2P reconciliation.*
- `src/components/PedigreeScreen.tsx` must contain `FounderAndHeritabilityPanel` — *Pedigree Explorer must embed Founder & Heritability Analytics.*
- `src/components/BreedingScreen.tsx` must contain `FounderAndHeritabilityPanel` — *Breeding Lab must embed Heritability Trends, Pairing Founder Shift & Founder Loss.*
- `src/components/SpeciesDashboardScreen.tsx` must contain `BarnSchedulerGantt`, `evaluateTaskPriorityEscalation` — *Species Dashboard Master Task List must expose the Checklist | Gantt switcher and smart escalation count.*
- `src/App.tsx` must contain `rescheduleTaskDates`, `applySmartTaskEscalations`, `reconcileOutboxOperations` — *App root must wire scheduler and P2P outbox reconciliation handlers into SpeciesDashboardScreen.*

**Restoration Playbook if Overwritten:**
1. Keep `startDateIso?: string` on `BarnTask` in `src/core/models.ts`, allowlist it in `src/core/inputSanitization.ts`, and preserve `start_date_iso` SQLite migration/persistence in `src/storage/webSqliteAdapter.ts`.
2. Restore pure modules `src/core/pedigreeAnalytics.ts`, `src/core/barnScheduler.ts`, and `src/core/p2pSyncProtocol.ts` with their unit tests (`pedigreeAnalytics.test.ts`, `barnScheduler.test.ts`, `p2pSyncProtocol.test.ts`).
3. Keep `src/storage/p2pLanChannel.ts`, store actions in `src/hooks/useBarnStore.ts`, `FounderAndHeritabilityPanel.tsx`, `BarnSchedulerGantt.tsx`, and host mounts in `PedigreeScreen.tsx`, `BreedingScreen.tsx`, `SpeciesDashboardScreen.tsx`, and `App.tsx`.

