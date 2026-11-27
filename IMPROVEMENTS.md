# Community Pedigree — App Improvements & GitHub-Overwrite Recovery Log

This document is synchronized with `src/domain/improvementRegistry.ts` and verified automatically
by `npm run verify:improvements` (and GitHub Actions CI). If an upstream GitHub pull or AI Studio
sync overwrites customized files, run the verifier to pinpoint exactly which improvements were wiped
and follow the restoration playbook below.

## Release Milestone Classification

- **Alpha 2 (v0.1.0-alpha.2 — Released Baseline):** `IMP-001` through `IMP-064` (64 improvements).
- **Alpha 3 (v0.1.0-alpha.3 — Active Deliverables):** `IMP-065` onwards (12 improvements).

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

## Logged Improvements (76)

### IMP-001: Backup Freshness Tracking, Reminders & Clean Human-Readable Exports

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Backups & Safety (`backup-safety`)
- **Origin:** Session Improvement
- **User Goal:** Add backup reminders and timestamps where necessary, place backup buttons prominently, and keep backups clean and human-readable.
- **Summary:** Tracks external backup timestamps/formats, renders proactive dismissible/snoozable backup reminders when non-testing edits are unbacked, and writes human-readable JSON v5 backups with barnSummary and clean filenames.
- **Tracked Files:** `src/domain/backupStatus.ts`, `src/domain/syncAndExports.ts`, `src/hooks/useBarnStore.ts`, `src/App.tsx`, `src/components/ImportExportHubScreen.tsx`, `src/components/SettingsAndSyncScreen.tsx`

**Automated Invariants Checked:**
- `src/domain/backupStatus.ts` must contain `evaluateBackupStatus`, `formatLocalDateTimeReadable`, `hasNonTestingBarnData` — *Backup freshness evaluator and human-readable timestamp formatters must stay intact.*
- `src/domain/syncAndExports.ts` must contain `buildCleanBackupFileName`, `exportedAtLocal`, `barnSummary` — *Clean filenames (`pedigree-backup-YYYY-MM-DD.json`) and top-level `barnSummary` prevent messy exports.*
- `src/hooks/useBarnStore.ts` must contain `recordBackupExport`, `snoozeBackupReminder`, `backupStatus` — *Store must track `lastBackupMeta` and expose `recordBackupExport`/`snoozeBackupReminder`.*
- `src/App.tsx` must contain `backupStatus.showDismissibleBanner`, `snoozeBackupReminder` — *Global dismissible/snoozable reminder banner alerts breeders when real edits are unbacked.*
- `src/components/ImportExportHubScreen.tsx` must contain `backupStatus`, `recordBackupExport` — *Import/Export Hub exports must show live backup timestamps and record external exports immediately.*
- `src/components/SettingsAndSyncScreen.tsx` must contain `backupStatus`, `onOpenImportExportHub('backup')` — *Settings must surface live top-level backup warnings and route exports directly to Import / Export Hub.*

**Restoration Playbook if Overwritten:**
1. Restore `evaluateBackupStatus` and timestamp formatters in `src/domain/backupStatus.ts`.
2. Ensure `exportBarnBackupJson` emits `exportedAtLocal`, `barnSummary`, and deterministically sorted animals in `src/domain/syncAndExports.ts`.
3. Wire `lastBackupMeta`, `recordBackupExport`, and `snoozeBackupReminder` in `src/hooks/useBarnStore.ts` and connect banner/cards in `src/App.tsx`, `ImportExportHubScreen.tsx`, and `SettingsAndSyncScreen.tsx`.

### IMP-002: Timestamped Pre-Removal Safety Backups & Non-Testing Record Purge

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Backups & Safety (`backup-safety`)
- **Origin:** Session Improvement
- **User Goal:** Provide collision-free timestamped backups before removing a species or clearing non-testing entries in case corruption caused the reset.
- **Summary:** Recommends and triggers second-precision timestamped species backups before deleting a species, wiping all species data, or clearing only non-testing livestock entries—never overwriting stable daily backups.
- **Tracked Files:** `src/domain/sampleData.ts`, `src/domain/syncAndExports.ts`, `src/hooks/useBarnStore.ts`, `src/components/SpeciesDashboardScreen.tsx`

**Automated Invariants Checked:**
- `src/domain/syncAndExports.ts` must contain `SpeciesBackupReason`, `buildSpeciesSafetyBackupFileName`, `exportSpeciesBackupJson` — *Pre-removal species JSON exports require distinct timestamped filenames and reason metadata.*
- `src/domain/sampleData.ts` must contain `countSpeciesNonTestingRecords`, `purgeSpeciesNonTestingDataPure` — *Non-testing purge must isolate user records cleanly without deleting starter sample rows.*
- `src/hooks/useBarnStore.ts` must contain `deleteSpeciesNonTestingData`, `purgeSpeciesNonTestingDataPure` — *Store must persist non-testing purges via batch operations and clear stale caches.*
- `src/components/SpeciesDashboardScreen.tsx` must contain `countSpeciesNonTestingRecords`, `pre-remove-non-testing`, `pre-remove-species` — *Species hub safety controls must offer 1-click timestamped safety backups before destructive wipes.*

**Restoration Playbook if Overwritten:**
1. Ensure `buildSpeciesSafetyBackupFileName` and 3-arg `exportSpeciesBackupJson(..., { reason })` exist in `src/domain/syncAndExports.ts`.
2. Keep `countSpeciesNonTestingRecords` and `purgeSpeciesNonTestingDataPure` in `src/domain/sampleData.ts`.
3. Expose `deleteSpeciesNonTestingData` in `src/hooks/useBarnStore.ts` and wire confirmation + timestamped backup buttons in `src/components/SpeciesDashboardScreen.tsx`.

### IMP-003: Decluttered Home Species Cards with Targeted Alerts & Arriving-Babies Indicator

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Home & Alerts (`alerts-home`)
- **Origin:** Session Improvement
- **User Goal:** Keep Home species cards focused strictly on navigation, sorting, due/overdue task actionability, and upcoming births.
- **Summary:** Removes clutter (delete-all button, herd counts, terminology tables, day counts, test-data toggles) from Home cards and adds targeted Due/Overdue Task alerts (Do / Ignore Permanently / Clear Current Group) plus Arriving-Babies gestation alerts.
- **Tracked Files:** `src/domain/models.ts`, `src/domain/barnAlerts.ts`, `src/hooks/useBarnStore.ts`, `src/components/HomeSpeciesScreen.tsx`

**Automated Invariants Checked:**
- `src/domain/models.ts` must contain `pluralizeSpeciesLabel` — *`barnAlerts.ts` uses `pluralizeSpeciesLabel` to format arriving-offspring labels cleanly.*
- `src/domain/barnAlerts.ts` must contain `evaluateSpeciesDueTasksAlert`, `evaluateSpeciesArrivingBabiesAlert`, `buildTaskAlertGroupSignature` — *Pure alert evaluation rules ensure group-clear signatures reappear only when new due tasks arrive.*
- `src/hooks/useBarnStore.ts` must contain `ignoreTaskAlertsPermanently`, `clearTaskAlertGroup` — *Store must persist ignored task IDs and cleared group signatures per species.*
- `src/components/HomeSpeciesScreen.tsx` must contain `evaluateSpeciesDueTasksAlert`, `evaluateSpeciesArrivingBabiesAlert` — *Home cards must consume `barnAlerts.ts` directly rather than drifting inline logic.*

**Restoration Playbook if Overwritten:**
1. Export `pluralizeSpeciesLabel` from `src/domain/models.ts`.
2. Use `evaluateSpeciesDueTasksAlert` and `evaluateSpeciesArrivingBabiesAlert` in `src/components/HomeSpeciesScreen.tsx`.
3. Ensure `clearTaskAlertGroup(speciesName, groupSignature)` persists the string signature in `dismissedTaskGroupKeys`.

### IMP-004: Optional Default Species Naming Prefix with Delimiter-Aware Override

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Save repetitive typing for rabbitry/herd prefixes without double-prefixing or blocking custom names.
- **Summary:** Supports per-species optional `defaultAnimalPrefix` (`Oak Ridge` or `OR-`) applied automatically on animal and litter creation only if the name does not already begin with the prefix, while letting users edit or override anytime.
- **Tracked Files:** `src/domain/models.ts`, `src/hooks/useBarnStore.ts`, `src/components/HerdScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`

**Automated Invariants Checked:**
- `src/domain/models.ts` must contain `applyAnimalNamePrefix`, `defaultAnimalPrefix` — *Delimiter-aware prefix helper handles hyphens/colons (`OR-Ruby`) and case-insensitive duplicate checks.*
- `src/hooks/useBarnStore.ts` must contain `applyAnimalNamePrefix` — *Litter offspring auto-creation in `updateBreedingOutcome` must respect the species default prefix.*

**Restoration Playbook if Overwritten:**
1. Keep `applyAnimalNamePrefix` (and `applySpeciesNamePrefix` alias) in `src/domain/models.ts`.
2. Apply `applyAnimalNamePrefix` in animal creation forms (`HerdScreen.tsx`) and litter generation (`useBarnStore.ts`).

### IMP-005: Species Hub Management Relocation, Cross-Species Migration Modal & Herd Pagination

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Move heavy destructive & migration controls into each species hub and support safe family-linked cross-species moves.
- **Summary:** Moves species backup, delete, and migrate controls out of Home mini-cards into each Species Hub & Herd screen; adds pedigree-family-aware `SpeciesMigrationModal` and 50-row Show More pagination in HerdScreen.
- **Tracked Files:** `src/domain/speciesMigration.ts`, `src/components/SpeciesMigrationModal.tsx`, `src/components/HerdScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/hooks/useBarnStore.ts`

**Automated Invariants Checked:**
- `src/domain/speciesMigration.ts` must contain `expandPedigreeFamilyInSpecies`, `migrateAnimalsToSpecies` — *Cross-species migration preserves ancestor/descendant links and moves photos/logs/breedings/tasks cleanly.*
- `src/components/HerdScreen.tsx` must contain `SpeciesMigrationModal`, `HERD_PAGE_SIZE` — *Herd screen uses `SpeciesMigrationModal` and paginates large rosters at 50 rows per page.*
- `src/components/SpeciesDashboardScreen.tsx` must contain `SpeciesMigrationModal`, `onDownloadTimestampedSpeciesBackup` — *Species Hub exposes hub-level backup, migration, and safety-backed deletion controls.*
- `src/hooks/useBarnStore.ts` must contain `migrateAnimalsToSpecies`, `SpeciesMigrationOptions` — *Store delegates species migration to the tested `migrateAnimalsToSpecies` engine.*

**Restoration Playbook if Overwritten:**
1. Wire `migrateAnimalsToSpecies` + rolling safety snapshot inside `useBarnStore.ts`.
2. Render `SpeciesMigrationModal` in both `HerdScreen.tsx` (single/multi-select) and `SpeciesDashboardScreen.tsx` (bulk-all).
3. Keep `HERD_PAGE_SIZE = 50` slicing + Show More button in `HerdScreen.tsx`.

### IMP-006: Archive-Aware Herd Status & Importer Normalization

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Ensure historical/inactive imported stock stays archived cleanly for pedigrees without triggering active barn tasks.
- **Summary:** Includes `Archived` in `AnimalStatus`, aligns `isAnimalArchived` / `isAnimalActive` / `normalizeAnimalStatus`, and teaches HerdBoss CSV importer to distinguish `Archived` & `Active` flags from `Reference` flags.
- **Tracked Files:** `src/domain/models.ts`, `src/domain/importers/herdBossImporter.ts`, `src/domain/syncAndExports.ts`

**Automated Invariants Checked:**
- `src/domain/models.ts` must contain `'Archived'`, `isAnimalActive`, `normalizeAnimalStatus` — *Canonical Archived status and importer helpers must stay exported from `models.ts`.*
- `src/domain/importers/herdBossImporter.ts` must contain `rawArchivedFlag`, `rawActiveFlag` — *CSV `Archived` / `Active` flags must map cleanly to `Archived` instead of collapsing into `Retired` or `Active`.*

**Restoration Playbook if Overwritten:**
1. Keep `Archived` in `AnimalStatus` and `ANIMAL_STATUSES` in `src/domain/models.ts`.
2. Keep `isAnimalActive`, `isAnimalArchived`, and `normalizeAnimalStatus` aligned with `herdBossImporter.test.ts`.
3. Separate `archivedFlag` and `activeFlag` lookup in `src/domain/importers/herdBossImporter.ts`.

### IMP-007: Mobile Chrome Crash Prevention, Cycle-Guarded COI & Batch Storage Writes

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Fix repeated Chrome Android tab crashes before/during app startup and keep pedigree/bulk operations fast under tight mobile RAM.
- **Summary:** Eliminates Chrome Android Aw Snap renderer crashes by disabling Workbox SW in dev + adding self-unregistering `/dev-sw.js` middleware, scoping eager COI computation off home/settings boot, guarding `PedigreeIndex.inbreeding` recursion cycles, batching SQLite/IndexedDB mutations, and code-splitting secondary routes with `React.lazy`.
- **Tracked Files:** `vite.config.ts`, `src/main.tsx`, `src/domain/pedigreeCalculator.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`

**Automated Invariants Checked:**
- `vite.config.ts` must contain `devServiceWorkerCleanupPlugin`, `enabled: false` — *Workbox devOptions enabled=true inside preview iframes causes stale chunk/SW crash loops on mobile.*
  - Forbidden regression: `devOptions: {
      enabled: true`
- `src/main.tsx` must contain `import.meta.env.PROD`, `navigator.serviceWorker.getRegistrations` — *Dev mode must unregister lingering service workers and clear caches instead of registering Workbox.*
- `src/domain/pedigreeCalculator.ts` must contain `inbreeding(id: string, activeCalls: Set<string> = new Set())` — *Cycle guard prevents stack overflow if an imported pedigree has an ancestral loop.*
- `src/storage/webSqliteAdapter.ts` must contain `saveAnimalsBatch`, `deleteAnimalsBatch`, `deleteTasksBatch` — *Single-transaction SQLite batch methods prevent O(N) disk/IDB flushes on bulk edits.*

**Restoration Playbook if Overwritten:**
1. Set `devOptions: { enabled: false }` and keep `devServiceWorkerCleanupPlugin` in `vite.config.ts`.
2. Guard `registerSW` behind `if (import.meta.env.PROD)` and unregister dev SWs in `src/main.tsx`.
3. Forward `activeCalls` inside `PedigreeIndex.inbreeding` in `src/domain/pedigreeCalculator.ts` and skip unnecessary COI precompute on `home`/`settings` in `src/hooks/useBarnStore.ts`.

### IMP-008: Hardcoded Root Base Path & Disabled Dev HMR Config + GitHub Actions CI

- **Release Milestone:** Alpha 2 (`alpha-2`)
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

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Diagnostics & Sync (`diagnostics-sync`)
- **Origin:** Preserved Upstream Feature
- **User Goal:** Diagnose and recover from browser/storage failures on mobile without losing breeder data.
- **Summary:** Catches render/window/promise crashes in `CrashErrorBoundary` + `crashLogger.ts`, exposes IndexedDB persistent-storage protection + DB integrity scan & repair in `dataHealthCheck.ts`, and exports one-click diagnostic ZIP support bundles.
- **Tracked Files:** `src/components/CrashErrorBoundary.tsx`, `src/storage/crashLogger.ts`, `src/domain/dataHealthCheck.ts`, `src/domain/supportBundle.ts`, `src/storage/storageProtection.ts`

**Automated Invariants Checked:**
- `src/main.tsx` must contain `CrashErrorBoundary`, `installGlobalCrashHandlers` — *Root mount must remain wrapped in `CrashErrorBoundary` with global handlers active.*
- `src/domain/dataHealthCheck.ts` must contain `analyzeBarnDataHealth`, `repairBarnDataHealth` — *Health scan & self-repair logic protects against orphaned pointers or malformed rows.*
- `src/domain/supportBundle.ts` must contain `buildSupportBundleZipArchive` — *Diagnostic ZIP generator packages device info, crash logs, and DB health safely.*

**Restoration Playbook if Overwritten:**
1. Keep `CrashErrorBoundary` wrapping `<App />` and `installGlobalCrashHandlers()` in `src/main.tsx`.
2. Preserve `DiagnosticsAndSupportPanel.tsx` integration inside `SettingsAndSyncScreen.tsx`.

### IMP-010: Offline Delta Sync Outbox, Conflict Log & Complete ZIP Photo Archive

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Diagnostics & Sync (`diagnostics-sync`)
- **Origin:** Preserved Upstream Feature
- **User Goal:** Enable multi-device barn sync and complete archival exports containing both records and photos.
- **Summary:** Provides local-first field-level delta sync bundles, Syncthing/shared-folder direct sync, field collision review log, and Complete Archive `.ZIP` exports bundling real organized animal image files alongside SQLite + JSON.
- **Tracked Files:** `src/domain/syncOutbox.ts`, `src/storage/localSyncChannels.ts`, `src/domain/backupArchive.ts`, `src/components/ImportExportHubScreen.tsx`

**Automated Invariants Checked:**
- `src/domain/syncOutbox.ts` must contain `diffEntityFieldsToOperations`, `mergeDeltaOperations` — *Field-level sync outbox prevents whole-record overwrites across peer devices.*
- `src/domain/backupArchive.ts` must contain `buildCompleteBackupZipArchive`, `parseBackupArchiveInput` — *ZIP archive builder/parser handles combined data + real image directory trees.*

**Restoration Playbook if Overwritten:**
1. Preserve `syncOutbox.ts`, `localSyncChannels.ts`, and `backupArchive.ts` hooks inside `useBarnStore.ts` and `ImportExportHubScreen.tsx`.

### IMP-011: Durable App Improvement Registry & GitHub-Overwrite Drift Verifier

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** CI & Tooling (`ci-tooling`)
- **Origin:** Session Improvement
- **User Goal:** Log every improvement in a durable, exportable system so a future GitHub sync wiping files can be detected and put back accurately.
- **Summary:** Maintains this machine-checkable registry (`improvementRegistry.ts`), human-readable `IMPROVEMENTS.md`, automated CLI verifier (`scripts/verify-improvements.ts`), and in-app export/copy panel inside Diagnostics so any GitHub overwrite is immediately spotted and restorable.
- **Tracked Files:** `src/domain/improvementRegistry.ts`, `scripts/verify-improvements.ts`, `IMPROVEMENTS.md`, `src/components/DiagnosticsAndSupportPanel.tsx`, `src/domain/__tests__/improvementRegistry.test.ts`

**Automated Invariants Checked:**
- `src/domain/improvementRegistry.ts` must contain `IMPROVEMENTS_REGISTRY`, `evaluateImprovementInvariants`, `formatImprovementsMarkdown`, `buildImprovementsRecoveryJson` — *Core registry and pure export/verification helpers must remain intact.*
- `scripts/verify-improvements.ts` must contain `evaluateImprovementInvariants`, `IMPROVEMENTS_REGISTRY` — *CLI script verifies actual workspace source files against registry invariants.*
- `src/components/DiagnosticsAndSupportPanel.tsx` must contain `IMPROVEMENTS_REGISTRY`, `formatImprovementsMarkdown`, `buildImprovementsRecoveryJson` — *Users can view, download (.md / .json), or copy the improvement recovery log directly in the app.*

**Restoration Playbook if Overwritten:**
1. Run `npm run verify:improvements` after any pull/merge from GitHub to list wiped invariants.
2. Use `IMPROVEMENTS.md` or the downloaded `pedigree-improvements-log.json` to restore missing helpers and wiring.

### IMP-012: Startup Self-Healing, Lazy Firebase Auth Guard & Corrective Action Logging

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Auto-fix any initial loading or crash errors on startup and log every corrective action for debugging.
- **Summary:** Prevents initial-load crashes and infinite loading hangs by keeping calendar auth initialization offline-safe (Firebase removed), wrapping SQLite JSON parsing in safe recovery helpers, isolating secondary startup promises with Promise.allSettled, running automatic startup health self-repair, falling back to rolling/starter snapshots on fatal DB load errors, and logging every corrective action via logDiagnosticEvent.
- **Tracked Files:** `src/hooks/useBarnStore.ts`, `src/storage/webSqliteAdapter.ts`, `src/utils/googleCalendarClient.ts`, `src/App.tsx`

**Automated Invariants Checked:**
- `src/hooks/useBarnStore.ts` must contain `normalizeRufusLevel`, `Promise.allSettled`, `Corrective action:` — *Startup must import normalizeRufusLevel, isolate secondary boot promises, and log corrective recovery actions.*
- `src/storage/webSqliteAdapter.ts` must contain `safeParseJson`, `Corrective action:` — *Malformed SQLite row JSON must auto-recover cleanly and record a diagnostic log entry.*
- `src/utils/googleCalendarClient.ts` must contain `initGoogleCalendarAuth`, `Corrective action:` — *Calendar auth hooks must initialize cleanly offline without external Firebase dependencies before React mounts.*
- `src/App.tsx` must contain `Local Database Recovery Needed` — *Render a non-blocking recovery UI if snapshot loading fails instead of trapping users on a loading skeleton.*

**Restoration Playbook if Overwritten:**
1. Ensure `normalizeRufusLevel` is imported from `../domain/models` in `src/hooks/useBarnStore.ts`.
2. Keep offline-safe `initGoogleCalendarAuth()` in `src/utils/googleCalendarClient.ts` and `safeParseJson()` in `src/storage/webSqliteAdapter.ts`.
3. Keep startup `Promise.allSettled`, `repairBarnDataHealth`, emergency recovery, and `Corrective action:` `logDiagnosticEvent` calls in `src/hooks/useBarnStore.ts`.

### IMP-013: Mobile Memory Hardening, Accessibility & Universal Pedigree Importer

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Optimize memory for mobile-first usage, improve cross-device accessibility, and import heterogeneous pedigree files gracefully without crashing.
- **Summary:** Adds UniversalPedigreeImporter for Evans .HTM rowspan trees, multi-gen CSV/TSV/pipe spreadsheets (UTF-8/UTF-16/Windows-1252, Excel serial dates), and nested JSON trees; hardens mobile memory/recursion bounds; and enforces dialog focus traps, label bindings, live regions, and keyboard accessibility across screens.
- **Tracked Files:** `src/domain/importers/universalPedigreeImporter.ts`, `src/engine/codecs/archiveAndCsvUtils.ts`, `src/domain/importers/registry.ts`, `src/domain/pedigreeCalculator.ts`, `src/domain/dataHealthCheck.ts`, `src/components/ExternalImporterPanel.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/domain/__tests__/resilienceAndUniversalImport.test.ts`

**Automated Invariants Checked:**
- `src/domain/importers/universalPedigreeImporter.ts` must contain `UniversalPedigreeImporter`, `parseEvansHtmlEntry`, `MULTI_GEN_COLUMN_SPECS` — *Universal importer handles Evans HTML, multi-generation spreadsheets, nested JSON, and unsupported binary warnings.*
- `src/engine/codecs/archiveAndCsvUtils.ts` must contain `decodeTextBytes`, `detectUnbommedUtf16`, `validateAndFormatYmd` — *Handles UTF-16LE/BE, Windows-1252, Excel serial dates, and calendar validation without crashing.*
- `src/domain/importers/registry.ts` must contain `UniversalPedigreeImporter` — *Registers the Universal Pedigree importer alongside HerdBoss.*
- `src/domain/pedigreeCalculator.ts` must contain `visitedPath: Set<string> = new Set()` — *Direct ancestor counting guards against circular ancestry loops.*
- `src/components/ExternalImporterPanel.tsx` must contain `effectiveParseError`, `role="progressbar"` — *Keeps parse error calculation pure and exposes accessible alert/progress semantics.*

**Restoration Playbook if Overwritten:**
1. Restore `UniversalPedigreeImporter` and register it in `src/domain/importers/registry.ts`.
2. Keep `decodeTextBytes` UTF-16/Windows-1252 decoding and `validateAndFormatYmd` in `src/engine/codecs/archiveAndCsvUtils.ts`.
3. Preserve `visitedPath` cycle guard on `countDirectAncestors` in `src/domain/pedigreeCalculator.ts` and accessibility attributes across modal/form components.

### IMP-014: Species Tattoo/Sex Conflict Guardrails, Override & Import Conflict Alerts

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Catch duplicate within-species IDs and parent sex mismatches, discourage accidental duplicate tattoos with an explicit override, never hard-block imports on conflicts, and let breeders locate or ignore soft warnings.
- **Summary:** Enforces same-species duplicate tattoo/ID checks and parent sex checks in DB health scans, discourages same-sex duplicate tattoo reuse during animal & litter creation unless the user types "override", allows non-blocking imports while flagging conflicted pedigrees/profiles, and supports Conflicts First sorting/filtering plus persistent soft-warning ignore controls.
- **Tracked Files:** `src/domain/animalConflicts.ts`, `src/domain/dataHealthCheck.ts`, `src/components/AnimalEditorModal.tsx`, `src/components/BreedingScreen.tsx`, `src/components/HerdScreen.tsx`, `src/hooks/useBarnStore.ts`, `src/App.tsx`, `src/domain/__tests__/animalConflictsAndHealth.test.ts`

**Automated Invariants Checked:**
- `src/domain/animalConflicts.ts` must contain `findSameSexDuplicateTattooCollisions`, `isOverrideConfirmationValid`, `analyzeBarnAnimalConflicts` — *Core conflict detection, override confirmation, and summary logic must remain intact.*
- `src/domain/dataHealthCheck.ts` must contain `duplicateTattooAnimalsCount`, `parentSexMismatchCount` — *Database health checks must report duplicate within-species tattoos and parent sex mismatches.*
- `src/components/AnimalEditorModal.tsx` must contain `findSameSexDuplicateTattooCollisions`, `isOverrideConfirmationValid` — *Single-animal editor must warn on same-sex duplicate tattoos and require explicit override typing.*
- `src/components/BreedingScreen.tsx` must contain `isOverrideConfirmationValid`, `isLitterOverrideConfirmed` — *Bulk litter creation must enforce the same duplicate tattoo override guardrail.*
- `src/components/HerdScreen.tsx` must contain `conflicts_first`, `duplicateTattooPeers` — *Herd screen must allow sorting/filtering conflicted animals and ignoring/restoring soft warnings.*
- `src/hooks/useBarnStore.ts` must contain `ignoreAnimalConflicts`, `restoreAnimalConflictAlert`, `importConflictAlert` — *Store must emit post-import conflict alerts and persist per-animal ignored conflict flags.*
- `src/App.tsx` must contain `store.importConflictAlert`, `locateConflictsInHerd` — *Root shell renders non-blocking import conflict banners with direct Locate Conflicted Animals action.*

**Restoration Playbook if Overwritten:**
1. Keep `findSameSexDuplicateTattooCollisions`, `isOverrideConfirmationValid`, and `analyzeBarnAnimalConflicts` in `src/domain/animalConflicts.ts`.
2. Preserve duplicate tattoo and parent sex mismatch checks in `src/domain/dataHealthCheck.ts`.
3. Keep `"override"` guards in `AnimalEditorModal.tsx` and `BreedingScreen.tsx`, `conflicts_first` sorting/ignore controls in `HerdScreen.tsx`, and `importConflictAlert` wiring in `useBarnStore.ts` / `App.tsx`.

### IMP-015: 5-Tier Device Capability Detection & Adaptive Memory Cautions

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Detect constrained mobile devices early, warn users appropriately by hardware tier, and keep Tier 1–2 cautions impossible to accidentally hide permanently.
- **Summary:** Classifies host hardware into 5 memory/CPU tiers, surfaces hardware guidance in Home onboarding & Settings with tier-locked dismissal rules (Tier 1 locked in both locations; Tier 2 closable on Home but persistent in Settings; Tiers 3–5 closable and reopenable), and applies workload cautions in the External Importer.
- **Tracked Files:** `src/domain/deviceCapability.ts`, `src/storage/deviceCapabilityDetector.ts`, `src/components/DeviceCapabilityCard.tsx`, `src/components/HomeSpeciesScreen.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/components/ExternalImporterPanel.tsx`, `src/App.tsx`, `src/domain/__tests__/deviceCapability.test.ts`

**Automated Invariants Checked:**
- `src/domain/deviceCapability.ts` must contain `DEVICE_CAPABILITY_TIERS`, `classifyDeviceCapability`, `evaluateBarnWorkloadForTier` — *Pure 5-tier classification, dismissal rules, and workload evaluator must remain intact.*
- `src/storage/deviceCapabilityDetector.ts` must contain `useDeviceCapability`, `readBrowserHardwareSignals` — *Per-device hardware signal collector and localStorage dismissal hook isolate device state from portable backups.*
- `src/components/DeviceCapabilityCard.tsx` must contain `DeviceCapabilityCard`, `evaluateBarnWorkloadForTier` — *Shared tier banner respects Home vs Settings tier-specific close/reopen rules.*
- `src/components/HomeSpeciesScreen.tsx` must contain `DeviceCapabilityCard` — *Home onboarding displays device capability card on startup.*
- `src/components/SettingsAndSyncScreen.tsx` must contain `DeviceCapabilityCard` — *Settings exposes upper Device Capability section with persistent Tier 1–2 status and reopen control.*
- `src/components/ExternalImporterPanel.tsx` must contain `evaluateBarnWorkloadForTier` — *Importer evaluates incoming record counts against host device capability tier.*
- `src/App.tsx` must contain `useDeviceCapability` — *Root shell runs `useDeviceCapability()` and passes controller to Home and Settings.*

**Restoration Playbook if Overwritten:**
1. Preserve `DEVICE_CAPABILITY_TIERS`, `classifyDeviceCapability`, and `evaluateBarnWorkloadForTier` in `src/domain/deviceCapability.ts`.
2. Keep `useDeviceCapability` in `src/storage/deviceCapabilityDetector.ts` and `<DeviceCapabilityCard>` mounts in `HomeSpeciesScreen.tsx` and `SettingsAndSyncScreen.tsx`.

### IMP-016: Route-Level Code Splitting with Retry & Chunk Error Boundary

- **Release Milestone:** Alpha 2 (`alpha-2`)
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

- **Release Milestone:** Alpha 2 (`alpha-2`)
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

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Backups & Safety (`backup-safety`)
- **Origin:** Session Improvement
- **User Goal:** Isolate temporary exports in OPFS /tmp, unify automated + manual backup vaults in OPFS /backups with IDB fallback, offload Sold/Deceased stock to OPFS /archives while preserving ancestor pedigree stubs, pause on wiped browser storage with restore recovery, and dump raw stores before resetting failed IndexedDB migrations.
- **Summary:** Adds pure TS schema v6 envelopes, SHA-256 verification, legacy migration, and .archive.zip bundling in `backupVault.ts`; manages OPFS `/tmp`, `/backups` (retention 6 monthly / 3 pre-upgrade / 8 pre-reset), `/archives`, boot orphan sweeps, QuotaExceededError recovery, idle Export Canary, prior-use sentinel, and IndexedDB rescue dumps in `opfsStorage.ts`; and mounts UnifiedBackupVaultPanel, ArchivedHerdsModal, WipedStorageRecoveryModal, and 1-click Save to Vault banner.
- **Tracked Files:** `src/domain/backupVault.ts`, `src/storage/opfsStorage.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/UnifiedBackupVaultPanel.tsx`, `src/components/ArchivedHerdsModal.tsx`, `src/components/WipedStorageRecoveryModal.tsx`, `src/App.tsx`, `src/domain/__tests__/backupVault.test.ts`, `src/storage/__tests__/opfsStorage.test.ts`

**Automated Invariants Checked:**
- `src/domain/backupVault.ts` must contain `CURRENT_BACKUP_SCHEMA_VERSION`, `migrateAndValidateBackupEnvelope`, `buildExportCanaryProbe`, `buildArchivedAnimalsBundle` — *Pure TypeScript OPFS vault envelopes, schema migration, canary verification, and pedigree-stub-safe archive bundling must remain intact.*
- `src/storage/opfsStorage.ts` must contain `sweepOrphanedOpfsTmpOnBoot`, `saveOpfsVaultBackup`, `saveOpfsHerdArchive`, `detectReturningUserWipedStorage`, `dumpIndexedDbDatabaseToOpfs` — *OPFS `/tmp`, `/backups`, `/archives` persistence, boot sweeps, QuotaExceededError retries, wiped detection, and IDB rescue dumps must stay wired.*
- `src/storage/webSqliteAdapter.ts` must contain `allowSeedFresh`, `detectReturningUserWipedStorage`, `markPriorUseSentinelFromSnapshot`, `pre_upgrade` — *SQLite adapter must pause sample seeding on wiped returning storage, create pre-upgrade snapshots, and update prior-use sentinels.*
- `src/hooks/useBarnStore.ts` must contain `wipedRecoveryContext`, `opfsVaultBackups`, `archivedHerdBundles`, `offloadAnimalsToOpfsArchive`, `runOpfsExportCanary` — *Barn store must orchestrate unified OPFS/IDB vault actions, archive offload/restore, idle canary checks, and wiped-storage recovery.*
- `src/components/UnifiedBackupVaultPanel.tsx` must contain `UnifiedBackupVaultPanel`, `onRestoreOpfsBackup`, `onRestoreRollingBackup` — *Settings UI must unify OPFS vault backups and IndexedDB rolling snapshots in one clean recovery panel.*
- `src/components/ArchivedHerdsModal.tsx` must contain `ArchivedHerdsModal`, `autoOffloadRetiredToOpfs`, `onRestoreArchive` — *Archived Herds modal must support searching, downloading, deleting, and restoring offloaded Sold/Deceased bundles.*
- `src/components/WipedStorageRecoveryModal.tsx` must contain `WipedStorageRecoveryModal`, `onRestoreLatestOpfs`, `onStartFresh` — *Blocking wiped-storage recovery dialog must offer latest OPFS restore, local file upload, and explicit two-step Start Fresh.*
- `src/App.tsx` must contain `<WipedStorageRecoveryModal`, `store.exportCanaryWarning`, `Save to Vault` — *App shell must mount WipedStorageRecoveryModal, Export Canary alerts, and 1-click Save to Vault on backup banners.*

**Restoration Playbook if Overwritten:**
1. Keep `src/domain/backupVault.ts` pure TypeScript with schema v6 migration, SHA-256 verification, and `computePedigreeReferencedIds` stub preservation.
2. Keep `src/storage/opfsStorage.ts` managing `/tmp`, `/backups`, `/archives`, `try/finally` `.close()`, boot sweeps, canary checks, and IDB failure dumps.
3. Keep `UnifiedBackupVaultPanel.tsx`, `ArchivedHerdsModal.tsx`, `WipedStorageRecoveryModal.tsx`, `useBarnStore.ts`, and `App.tsx` connected.

### IMP-019: ES2018 Compatibility Build, Crash-Loop Circuit Breaker, Manual SW Update & Graceful Fallbacks

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Support 2018+ browsers gracefully without polyfill bloat, break reload/crash loops cleanly, defer PWA updates while editing, offer low-memory DB-only exports, and keep unavailable controls visible with explanation text.
- **Summary:** Downlevels TS/Vite build to ES2018 (2018+ devices: Chrome 68+/Safari 12+/Firefox 63+/Edge 79+) with minimal zero-bloat shims, runs an ES5 pre-flight + 3-in-60s crash-loop circuit breaker & ?emergency_reset=true hatch in index.html, switches SW updates to a manual prompt gate with controllerchange handshake and open-modal deferral, offers lightweight Database-Only .JSON backups on Tier 1/2, windows large report/care-log lists, and keeps unsupported optional controls visible with clear disabled reasons.
- **Tracked Files:** `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/utils/es2018Shims.ts`, `src/storage/pwaUpdateManager.ts`, `src/domain/deviceCapability.ts`, `src/storage/deviceCapabilityDetector.ts`, `src/utils/webFileActions.ts`, `src/components/UnifiedBackupVaultPanel.tsx`, `src/components/ImportExportHubScreen.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/components/PrintPreviewModal.tsx`, `src/App.tsx`

**Automated Invariants Checked:**
- `vite.config.ts` must contain `es2018`, `safari12`, `cssTarget`, `registerType: 'prompt'` — *Vite build must target ES2018 / Safari 12+ (2018+ browsers) with manual prompt SW activation.*
- `index.html` must contain `__PEDIGREE_PREFLIGHT__`, `pedigree-preflight-guard`, `__PEDIGREE_BOOT_OK__`, `emergency_reset=true`, `__PEDIGREE_RECORD_BOOT_CRASH__` — *ES5 pre-flight guard, 3-in-60s crash-loop circuit breaker, and ?emergency_reset=true recovery hatch must remain intact.*
- `src/utils/es2018Shims.ts` must contain `ensureEs2018Globals`, `allSettled`, `fromEntries` — *Zero-bloat ES2018 runtime shims prevent missing globalThis/allSettled/fromEntries crashes on 2018 browsers.*
- `src/storage/pwaUpdateManager.ts` must contain `usePwaUpdateStatus`, `controllerchange`, `applyPwaUpdateNow` — *Manual Service Worker update gate and single-reload controllerchange handshake must remain intact.*
- `src/domain/deviceCapability.ts` must contain `assessBrowserCompatibility`, `getHeavyZipExportGate` — *Pure TypeScript browser compatibility classifier and Tier 1/outdated ZIP caution gate must remain intact.*
- `src/utils/webFileActions.ts` must contain `copyTextWithFallback` — *Clipboard fallback for restricted/older browser contexts must remain available.*
- `src/components/ImportExportHubScreen.tsx` must contain `pendingHeavyZipExport`, `heavyZipGate`, `handleDownloadDatabaseOnlyBackup` — *Heavy .ZIP exports must warn Tier 1/outdated browsers and offer Database-Only .JSON fallback without photo hydration.*

**Restoration Playbook if Overwritten:**
1. Keep ES2018 target in `tsconfig.json` and `vite.config.ts` (`safari12`, `registerType: "prompt"`) plus ES5 guard, circuit breaker, and `?emergency_reset=true` in `index.html`.
2. Keep `src/utils/es2018Shims.ts` imported first in `src/main.tsx` alongside `src/storage/pwaUpdateManager.ts`.
3. Keep `assessBrowserCompatibility` and `getHeavyZipExportGate` in `src/domain/deviceCapability.ts` and hook probes in `src/storage/deviceCapabilityDetector.ts`.
4. Keep disabled-with-reason UI controls (`Share .HTM` in `PrintPreviewModal.tsx`, Storage Vault, Import/Export Hub, Settings), Database-Only `.JSON` export, table/care-log windowing, and open-dialog PWA update deferral in `App.tsx`.

### IMP-020: Mobile Background Freeze Pause/Resume, Double-Submit Guards & Async Error Toast

- **Release Milestone:** Alpha 2 (`alpha-2`)
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

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Restore and strengthen keyboard shortcuts, tab stops, ARIA combobox navigation, and focus indicators while cleaning up minor export and DOM observer inefficiencies.
- **Summary:** Adds full WAI-ARIA keyboard navigation (`stepEnabledComboboxIndex`, `aria-activedescendant`, `ArrowDown`/`ArrowUp`/`Home`/`End`/`Enter`/`Escape`, `scrollIntoView`, and blur boundary closing) across `CarrierTraitCombobox`, `SearchableParentPicker`, and `ExternalImporterPanel`; adds `O` (Reports) and `S` (Import & Settings) global shortcuts with IME/widget guards and synchronized help panels; restores visible focus rings and pedigree focus scrolling; coalesces `App.tsx` modal `MutationObserver` via `requestAnimationFrame`; and aligns `buildPdfReadyBarnSnapshot` carrier disclosures.
- **Tracked Files:** `src/utils/comboboxNav.ts`, `src/utils/__tests__/comboboxNav.test.ts`, `src/components/CarrierTraitCombobox.tsx`, `src/components/SearchableParentPicker.tsx`, `src/components/ExternalImporterPanel.tsx`, `src/App.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/components/HomeSpeciesScreen.tsx`, `src/components/AnimalPhotoGallery.tsx`, `src/components/PedigreeScreen.tsx`, `src/components/HerdScreen.tsx`, `src/components/SpeciesMemoScreen.tsx`, `src/domain/syncAndExports.ts`

**Automated Invariants Checked:**
- `src/utils/comboboxNav.ts` must contain `clampComboboxIndex`, `stepEnabledComboboxIndex` — *Pure combobox index-stepping helper powers keyboard traversal across all custom listboxes.*
- `src/components/CarrierTraitCombobox.tsx` must contain `aria-activedescendant`, `stepEnabledComboboxIndex` — *Carrier trait combobox must expose aria-activedescendant and full keyboard navigation.*
- `src/components/SearchableParentPicker.tsx` must contain `aria-activedescendant`, `stepEnabledComboboxIndex` — *Searchable parent picker must expose aria-activedescendant and full keyboard navigation.*
- `src/components/ExternalImporterPanel.tsx` must contain `aria-activedescendant`, `stepEnabledComboboxIndex`, `speciesOptionRefs` — *Default species combobox must support keyboard traversal and close on focus blur.*
- `src/App.tsx` must contain `subscribeOpenDialogCount`, `o: { route: 'reports', label: 'Reports' }`, `i: { route: 'importExport', label: 'Import / Export Hub' }`, `s: { route: 'settings', label: 'Settings' }`, `e.isComposing` — *Root shell tracks open dialogs via subscribeOpenDialogCount (superseding rAF MutationObserver in IMP-052) and guards O/I/S/H/D/R/B/P/? shortcuts cleanly.*
- `src/domain/syncAndExports.ts` must contain `includeCleared: true,
          includeLineage: true` — *PDF snapshot DTO exports must include cleared and ancestral lineage carrier disclosures.*

**Restoration Playbook if Overwritten:**
1. Keep `src/utils/comboboxNav.ts` wired into `CarrierTraitCombobox.tsx`, `SearchableParentPicker.tsx`, and `ExternalImporterPanel.tsx` with `aria-activedescendant` and `onBlur`.
2. Keep `subscribeOpenDialogCount` dialog tracking, IME/widget guards, and `O`/`S` shortcuts in `src/App.tsx` synced with `SettingsAndSyncScreen.tsx`.
3. Preserve `focus-visible` outlines (`HomeSpeciesScreen.tsx`, `PedigreeScreen.tsx`, `AnimalPhotoGallery.tsx`), `WeightTrendSvg` ARIA labels (`HerdScreen.tsx`), `aria-pressed` (`SpeciesMemoScreen.tsx`), and `buildPdfReadyBarnSnapshot` carrier options (`syncAndExports.ts`).

### IMP-022: Virtualized Pedigree Branch Loading, PWA Update Governor, Offline Probe & Upgrade Gate

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Keep pedigree SVG/DOM light on mobile devices, prevent unwanted or revoked app-shell reloads during active barn sessions, separate app offline holding from device Airplane Mode, and require verified backups on multi-version schema jumps.
- **Summary:** Bounds collapsed 4–6 generation pedigree chart DOM to Gen 0–3 (15 slots max) via lazy per-branch Gen 4+ expansion (`buildPedigreeBranchViewport`) while preserving full-depth `.HTM`/Barn Binder printouts; decouples PWA updates from raw `navigator.onLine` using `auto`/`notify`/`pinned` policy governance, a Manual App Offline toggle, and a timed `AbortController` captive-portal connectivity probe; and serves uncached `version.json`/`status.json` manifests with pre-upgrade SHA-256 backup verification and Safe-Harbor reset gates.
- **Tracked Files:** `src/domain/pedigreeCalculator.ts`, `src/domain/upgradeGate.ts`, `src/domain/backupVault.ts`, `src/components/PedigreeScreen.tsx`, `src/storage/pwaUpdateManager.ts`, `src/storage/storageProtection.ts`, `src/hooks/useBarnStore.ts`, `src/components/SettingsAndSyncScreen.tsx`, `src/App.tsx`, `public/version.json`, `public/status.json`, `vite.config.ts`, `src/domain/__tests__/upgradeGate.test.ts`, `src/domain/__tests__/pedigreeCalculator.test.ts`, `src/storage/__tests__/es2018AndPwaUpdate.test.ts`

**Automated Invariants Checked:**
- `src/domain/pedigreeCalculator.ts` must contain `buildPedigreeBranchViewport`, `getGen3BranchesWithKnownAncestors` — *Pure branch viewport helper keeps initial 4–6 gen DOM compact while preserving full-depth export slots.*
- `src/components/PedigreeScreen.tsx` must contain `expandedGen3Branches`, `buildPedigreeBranchViewport` — *Interactive pedigree chart must lazy-expand Gen 4+ branches on demand without losing focus or keyboard access.*
- `src/domain/upgradeGate.ts` must contain `evaluateUpgradeGate`, `parseVersionManifestJson`, `parseStatusManifestJson` — *Pure pre-flight Upgrade Gate evaluates revoked builds, paused updates, Safe-Harbor schema floors, and schemaDelta>=2 backup gates.*
- `src/domain/backupVault.ts` must contain `buildVerifiedPreUpgradeJsonBackup`, `verifyPreUpgradeJsonBackup` — *Pre-upgrade safety backups must emit _schemaVersion-stamped envelopes and verify SHA-256 round-trip integrity.*
- `src/storage/pwaUpdateManager.ts` must contain `pedigree_pwa_update_policy_v1`, `fetchUpgradeGateDecision` — *PWA updater enforces persisted auto/notify/pinned policies and uncached Upgrade Gate checks before posting SKIP_WAITING.*
- `src/storage/storageProtection.ts` must contain `pedigree_manual_offline_v1`, `probeNetworkConnectivity` — *Connectivity governor combines Manual App Offline Mode with a timed AbortController captive-portal probe.*
- `public/version.json` must contain `minDirectUpgradeSchema` — *Release version manifest must expose current appVersion, schemaVersion, and minDirectUpgradeSchema floor.*
- `public/status.json` must contain `revokedVersions` — *Remote killswitch manifest must expose allowUpdates and revokedVersions lists.*
- `vite.config.ts` must contain `navigateFallbackDenylist: [/^\/api\//, /\/version\.json$/, /\/status\.json$/]` — *Service worker navigation fallback must never intercept or precache uncached version.json / status.json manifests on root or subpaths.*

**Restoration Playbook if Overwritten:**
1. Keep `buildPedigreeBranchViewport`, `getGen3BranchIndex`, and `getGen3BranchesWithKnownAncestors` in `src/domain/pedigreeCalculator.ts` wired into `PedigreeScreen.tsx`.
2. Preserve `src/domain/upgradeGate.ts`, `buildVerifiedPreUpgradeJsonBackup` / `verifyPreUpgradeJsonBackup` in `src/domain/backupVault.ts`, and uncached `public/version.json` & `public/status.json` with `no-store` middleware + Workbox denylist in `vite.config.ts`.
3. Keep `PwaUpdatePolicy` (`auto` / `notify` / `pinned`) + `fetchUpgradeGateDecision` in `src/storage/pwaUpdateManager.ts`, `setManualOfflineMode` + `probeNetworkConnectivity` in `src/storage/storageProtection.ts`, and UI controls in `App.tsx`, `useBarnStore.ts`, and `SettingsAndSyncScreen.tsx`.

### IMP-023: Storage Pruning, Pre-Restore Archive Inspector, Clock-Skew Compensation, Monotonic _rev & Encrypted Backups

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Backups & Safety (`backup-safety`)
- **Origin:** Session Improvement
- **User Goal:** Prevent runaway photo quota growth, inspect backups for species/conflicts before committing restores, protect multi-device sync order against wrong or rewound clocks, avoid duplicate Google Calendar events, and offer opt-in passphrase encryption for shared archives/sync folders.
- **Summary:** Adds a Diagnostics Photo Storage & Orphan Attachment Pruner (`photoMaintenance.ts`, `reoptimizeAnimalPhotoRecord`), an off-thread Pre-Restore Archive Inspector dry-run for `.ZIP`/`.JSON`/`.SQLITE` (`archiveInspector.ts`, `inspectRawSqliteBytes`), persistent HTTP `Date` clock-skew compensation (`recordServerDateHeaderSkew`, `getAdjustedNowIsoUtc`) with a non-blocking drift banner, per-record monotonic `_rev` counters (`compareSameEntitySyncOperations`, `bumpRecordRevision`) paired with deterministic `[a-v0-9]` Google Calendar IDs + `409` `PUT` updates, and optional PBKDF2-SHA256 + AES-256-GCM passphrase encryption for shared backups and SyncThing deltas (`encryptedExport.ts`, `passphraseCrypto.ts`) while keeping plain 1-click exports as the default.
- **Tracked Files:** `src/domain/photoMaintenance.ts`, `src/domain/archiveInspector.ts`, `src/domain/encryptedExport.ts`, `src/domain/syncOutbox.ts`, `src/domain/calendarExport.ts`, `src/domain/models.ts`, `src/domain/inputSanitization.ts`, `src/storage/passphraseCrypto.ts`, `src/storage/storageProtection.ts`, `src/storage/localSyncChannels.ts`, `src/storage/offThreadWorkerClient.ts`, `src/storage/archiveAndImport.worker.ts`, `src/storage/webImageOptimizer.ts`, `src/storage/webSqliteAdapter.ts`, `src/utils/googleCalendarClient.ts`, `src/hooks/useBarnStore.ts`, `src/components/DiagnosticsAndSupportPanel.tsx`, `src/components/ImportExportHubScreen.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/App.tsx`, `src/domain/__tests__/stageBResilience.test.ts`, `src/storage/__tests__/passphraseAndClockSkew.test.ts`

**Automated Invariants Checked:**
- `src/domain/photoMaintenance.ts` must contain `analyzePhotoStorageFootprintPure`, `removeOrphanPhotosFromSnapshotPure`, `pruneFullResPayloadsFromSnapshotPure` — *Pure photo storage footprint analyzer, orphan cleaner, and thumbnail compactor must stay DOM-free.*
- `src/domain/archiveInspector.ts` must contain `inspectSnapshotBeforeRestorePure`, `inspectParsedArchiveBeforeRestorePure` — *Dry-run pre-restore inspector summarizes species, conflicts, and replace/merge impact before DB writes.*
- `src/domain/encryptedExport.ts` must contain `ENCRYPTED_ENVELOPE_FORMAT`, `wrapEncryptedZipContainer`, `tryExtractEncryptedEnvelopeFromZip` — *Pure encrypted envelope framing and ZIP wrapper/extractor must remain intact.*
- `src/storage/passphraseCrypto.ts` must contain `encryptBytesWithPassphrase`, `decryptBytesWithPassphrase` — *Client-side PBKDF2-SHA256 + AES-256-GCM encryption runs strictly with memory-only passphrases.*
- `src/storage/storageProtection.ts` must contain `recordServerDateHeaderSkew`, `getAdjustedNowIsoUtc`, `clockDriftWarning` — *Server Date skew capture compensates timestamps and flags drift >= 5 minutes cleanly.*
- `src/domain/syncOutbox.ts` must contain `compareSameEntitySyncOperations`, `bumpRecordRevision` — *Monotonic record_rev ensures newer same-entity edits win even when a device clock rewinds.*
- `src/domain/calendarExport.ts` must contain `buildDeterministicGoogleCalendarEventId` — *Deterministic [a-v0-9] Google Calendar IDs prevent duplicate calendar events on retry/sync.*
- `src/utils/googleCalendarClient.ts` must contain `res.status === 409` — *Google Calendar push must update existing events via PUT when deterministic ID returns HTTP 409.*
- `src/components/ImportExportHubScreen.tsx` must contain `pendingRestoreInspection`, `encryptBackupExport` — *Import/Export Hub must require Pre-Restore Inspector confirmation and expose opt-in backup/sync encryption.*
- `src/components/DiagnosticsAndSupportPanel.tsx` must contain `onAnalyzePhotoFootprint`, `onPruneOrphanPhotos` — *Diagnostics exposes Photo Storage & Orphan Attachment Pruner actions safely.*
- `src/App.tsx` must contain `connectivity.clockDriftWarning` — *Root shell renders non-blocking Clock Drift Nudge Banner when drift reaches threshold.*

**Restoration Playbook if Overwritten:**
1. Keep pure modules `src/domain/photoMaintenance.ts`, `src/domain/archiveInspector.ts`, `src/domain/encryptedExport.ts`, `_rev` logic in `src/domain/syncOutbox.ts`, and `buildDeterministicGoogleCalendarEventId` in `src/domain/calendarExport.ts`.
2. Keep `src/storage/passphraseCrypto.ts`, clock-skew compensation in `src/storage/storageProtection.ts`, encrypted delta/directory sync in `src/storage/localSyncChannels.ts`, off-thread inspection in `src/storage/offThreadWorkerClient.ts`, and `inspectRawSqliteBytes` in `src/storage/webSqliteAdapter.ts`.
3. Keep Stage B store handlers in `src/hooks/useBarnStore.ts`, `409` PUT retry in `src/utils/googleCalendarClient.ts`, and UI mounts in `DiagnosticsAndSupportPanel.tsx`, `ImportExportHubScreen.tsx`, and `App.tsx`.

### IMP-024: Active Medication Withdrawal Countdown & Livestock Safety Alerts

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Home & Alerts (`alerts-home`)
- **Origin:** Session Improvement
- **User Goal:** Surface active care-log withdrawal periods on Herd cards and Home alerts and trigger soft confirmation warnings before marking an animal under active withdrawal for sale, meat/cull processing, or show exhibition.
- **Summary:** Surfaces active CareLog medication withdrawal periods (`withdrawalClearDateIso` / `dateIso + withdrawalDays`, cleared on the clear date itself) via an O(L) withdrawal map across Home species cards (session-closable), Herd roster rows, single-animal profiles, and Withdrawal filter/sort controls, and triggers non-blocking soft confirmation warnings before saving Sold/Culled dispositions or Show entries whose event date overlaps withdrawal.
- **Tracked Files:** `src/domain/barnAlerts.ts`, `src/domain/__tests__/barnAlerts.test.ts`, `src/components/HomeSpeciesScreen.tsx`, `src/components/HerdScreen.tsx`, `src/components/AnimalEditorModal.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/App.tsx`

**Automated Invariants Checked:**
- `src/domain/barnAlerts.ts` must contain `buildWithdrawalByAnimalMap`, `evaluateSpeciesActiveWithdrawalsAlert`, `evaluateWithdrawalDispositionWarning`, `evaluateShowWithdrawalConflicts` — *Pure withdrawal countdown evaluator and safety conflict helpers must remain intact and DOM-free.*
- `src/components/HomeSpeciesScreen.tsx` must contain `evaluateSpeciesActiveWithdrawalsAlert`, `onDismissWithdrawalAlert` — *Home species cards must surface closable session-scoped withdrawal safety alerts.*
- `src/components/HerdScreen.tsx` must contain `buildWithdrawalByAnimalMap`, `withdrawal_soonest`, `Withdrawal (` — *HerdScreen must display active withdrawal countdowns, filter tab, sort, and profile alert banner.*
- `src/components/AnimalEditorModal.tsx` must contain `evaluateWithdrawalDispositionWarning`, `pendingWithdrawalWarning` — *AnimalEditorModal must require soft confirmation before saving Sold or Flagged-for-Cull stock under active withdrawal.*
- `src/components/SpeciesDashboardScreen.tsx` must contain `evaluateShowWithdrawalConflicts`, `pendingShowWithdrawalWarning` — *Show entry form must warn when selected animals have medication withdrawals overlapping eventDateIso.*
- `src/App.tsx` must contain `dismissedWithdrawalSpecies`, `requestedHerdWithdrawalNonce` — *Root shell tracks session-scoped Home withdrawal dismissal and Herd filter navigation.*

**Restoration Playbook if Overwritten:**
1. Keep pure withdrawal functions (`buildWithdrawalByAnimalMap`, `evaluateAnimalActiveWithdrawal`, `evaluateSpeciesActiveWithdrawalsAlert`, `evaluateWithdrawalDispositionWarning`, `evaluateShowWithdrawalConflicts`) in `src/domain/barnAlerts.ts`.
2. Keep session-scoped `dismissedWithdrawalSpecies` in `src/App.tsx` wired to `HomeSpeciesScreen.tsx` and `HerdScreen.tsx`.
3. Keep Herd withdrawal filter/sort/countdown badges in `HerdScreen.tsx` passing `animalCareLogs` into `AnimalEditorModal.tsx`, and keep show-date overlap checks in `SpeciesDashboardScreen.tsx`.

### IMP-025: Sync Outbox Alignment, Metadata-Only Photo Sync & Reset State Cleanup

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Diagnostics & Sync (`diagnostics-sync`)
- **Origin:** Session Improvement
- **User Goal:** Align Folder/Delta Sync outbox mutations for photo actions and cross-species migrations while guaranteeing stale P2P sync queues, conflict logs, and backup reminders never leak across factory resets or full Replace restores.
- **Summary:** Queues metadata-only photo operations (stripping image blobs so large photos travel exclusively via .ZIP backups) and full cross-species migration snapshot diffs with bumped `_rev` counters into the delta outbox, hydrates missing blobs onto metadata-only photo placeholders during .ZIP/.JSON merges without clobbering newer edits, guards UI galleries against empty image URLs, and wipes `sync_outbox`, `sync_conflicts`, `sync_checkpoints`, plus backup reminder keys (`pedigree.lastBackupMeta.v1`, `pedigree.backupReminderSnoozedUntil.v1`) on factory resets and full Replace restores.
- **Tracked Files:** `src/domain/syncOutbox.ts`, `src/domain/speciesMigration.ts`, `src/domain/backupArchive.ts`, `src/domain/syncAndExports.ts`, `src/hooks/useBarnStore.ts`, `src/components/AnimalPhotoGallery.tsx`, `src/components/HerdScreen.tsx`, `src/domain/__tests__/stageBResilience.test.ts`, `src/storage/__tests__/crossTabLockAndReload.test.ts`

**Automated Invariants Checked:**
- `src/domain/syncOutbox.ts` must contain `stripPhotoBlobsForSync`, `diffSnapshotsToSyncOperations` — *Sync outbox must strip binary blobs on photo creates and support snapshot diffing for bulk migrations.*
- `src/domain/speciesMigration.ts` must contain `bumpRecordRevision` — *Cross-species migration must advance `_rev` counters on every migrated or created record.*
- `src/domain/backupArchive.ts` must contain `existingHasBlob`, `incHasBlob` — *Photos-Only ZIP merge must hydrate blobs onto metadata-only photo placeholders without overwriting newer metadata.*
- `src/domain/syncAndExports.ts` must contain `mergeAnimalPhotosWithBlobPreservation` — *Barn snapshot merges must rehydrate blobs onto metadata-only photos without losing existing local blobs.*
- `src/hooks/useBarnStore.ts` must contain `clearLocalSyncAndBackupReminderState`, `clearAllSyncStateInIdb`, `stripPhotoBlobsForSync`, `diffSnapshotsToSyncOperations` — *Store must clear sync/backup-reminder state on resets/replaces and enqueue metadata-only photo & migration outbox ops.*
- `src/components/AnimalPhotoGallery.tsx` must contain `p.thumbnailDataUrl || p.dataUrl` — *Photo gallery must avoid rendering broken <img src=""> tags for metadata-only synced photo placeholders.*

**Restoration Playbook if Overwritten:**
1. Keep `stripPhotoBlobsForSync`, `diffSnapshotsToSyncOperations`, and metadata-only `photo` `__create__` handling in `src/domain/syncOutbox.ts`.
2. Keep `bumpRecordRevision` calls in `src/domain/speciesMigration.ts` and blob-preserving merge helpers in `src/domain/backupArchive.ts` and `src/domain/syncAndExports.ts`.
3. Keep `clearLocalSyncAndBackupReminderState` wired across resets and Replace restores plus metadata-only photo/migration outbox emissions in `src/hooks/useBarnStore.ts`, and keep empty-src placeholders in `AnimalPhotoGallery.tsx` and `HerdScreen.tsx`.

### IMP-026: Clock-Skew Consistency & Archive Export Double-Tap Locks

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Backups & Safety (`backup-safety`)
- **Origin:** Session Improvement
- **User Goal:** Enforce clock-skew compensation consistently across upgrade checks and Settings timestamps while eliminating the <16ms double-tap race on heavy archive and backup exports.
- **Summary:** Aligns upgrade-gate HTTP Date skew capture (`recordServerDateHeaderSkew`), core `nowEpochMs()` fallback defaults, and Settings folder/background pause timestamps (`getAdjustedNowMs()`) when device clocks drift, and guards all 4 backup/archive exports (`handleDownloadTimestampedFullBackup`, `handleDownloadDatabaseOnlyBackup`, `handleDownloadCompleteZip`, `handleDownloadPhotosOnlyZip`) plus heavy-ZIP caution and reset backup buttons with synchronous `archiveExportLock` (`useAsyncSubmitLock`).
- **Tracked Files:** `src/domain/upgradeGate.ts`, `src/storage/pwaUpdateManager.ts`, `src/components/ImportExportHubScreen.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/storage/__tests__/passphraseAndClockSkew.test.ts`

**Automated Invariants Checked:**
- `src/domain/upgradeGate.ts` must contain `nowEpochMs`, `computeHttpDateClockSkewMs` — *Upgrade-gate HTTP Date skew calculation must default to clock-skew-aware nowEpochMs().*
- `src/storage/pwaUpdateManager.ts` must contain `recordServerDateHeaderSkew`, `getAdjustedNowIsoUtc` — *Version/status manifest checks must propagate HTTP Date skew and record adjusted timestamps.*
- `src/components/ImportExportHubScreen.tsx` must contain `archiveExportLock`, `getAdjustedNowMs`, `archiveExportLock.runLocked` — *Archive/backup exports must lock synchronously against double-tap and record skew-adjusted pause timestamps.*

**Restoration Playbook if Overwritten:**
1. Keep `nowEpochMs` default inside `computeHttpDateClockSkewMs` in `src/domain/upgradeGate.ts`.
2. Keep `recordServerDateHeaderSkew` and `getAdjustedNowIsoUtc` in `src/storage/pwaUpdateManager.ts`.
3. Keep `archiveExportLock = useAsyncSubmitLock()` wrapping all 4 export handlers in `src/components/ImportExportHubScreen.tsx`, plus `getAdjustedNowMs()` for `pausedAtMs`.

### IMP-027: True Lazy 2–3 Gen SQLite/OPFS Pedigree Fetching & ES2018 Windowed List Virtualization

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Reduce mobile RAM and DOM overhead by fetching Gen 4+ / archived pedigree ancestors lazily from SQLite/OPFS and virtualizing large Breeding, Herd, and Reports lists.
- **Summary:** Keeps initial interactive pedigree charts bounded to Gen 0–3 while probing and lazily fetching Gen 4+ and OPFS `/archives` offloaded ancestors on branch expand or pre-print hydration via cycle-safe SQLite BFS (`queryPedigreeNeighborhood`, `queryPedigreeBranchAncestorsExist`) and a 256-entry LRU ancestor cache (`pedigreeAncestorCacheRef`); and replaces unbounded/static-slice lists in `BreedingScreen`, `HerdScreen`, and `ReportsScreen` with a zero-dependency ES2018 scroll window virtualizer (`useVirtualWindow`).
- **Tracked Files:** `src/utils/useVirtualWindow.ts`, `src/utils/__tests__/virtualWindow.test.ts`, `src/storage/storageAdapter.ts`, `src/storage/webSqliteAdapter.ts`, `src/storage/__tests__/pedigreeLazyFetch.test.ts`, `src/domain/pedigreeCalculator.ts`, `src/domain/__tests__/pedigreeCalculator.test.ts`, `src/hooks/useBarnStore.ts`, `src/App.tsx`, `src/components/PedigreeScreen.tsx`, `src/components/BreedingScreen.tsx`, `src/components/HerdScreen.tsx`, `src/components/ReportsScreen.tsx`

**Automated Invariants Checked:**
- `src/utils/useVirtualWindow.ts` must contain `computeVirtualWindow`, `useVirtualWindow`, `ResizeObserver` — *Zero-dependency ES2018 scroll virtualizer must remain intact with guarded ResizeObserver cleanup.*
- `src/storage/webSqliteAdapter.ts` must contain `queryPedigreeNeighborhood`, `queryPedigreeBranchAncestorsExist`, `mapAnimalRow` — *SQLite adapter must provide cycle-safe bounded BFS pedigree queries and lightweight branch-existence probes.*
- `src/hooks/useBarnStore.ts` must contain `loadPedigreeNeighborhood`, `checkPedigreeBranchesHaveAncestors`, `pedigreeAncestorCacheRef` — *Barn store must cache lazily fetched SQLite/OPFS pedigree ancestors in a bounded LRU map.*
- `src/domain/pedigreeCalculator.ts` must contain `hasKnownAncestors`, `externalKnownBranches` — *Branch summaries must surface externally detected Gen 4+ ancestors before full depth is loaded in RAM.*
- `src/components/PedigreeScreen.tsx` must contain `gen0To3BaseMap`, `fetchAndMergeBranchAncestors`, `handleOpenPrintModal` — *Pedigree screen must scope initial tree to Gen 0–3 and hydrate Gen 4+ on branch expand or print.*
- `src/components/BreedingScreen.tsx` must contain `useVirtualWindow`, `breedingVirtual`, `ledgerStatusFilter` — *Breeding & litter ledger must filter and virtualize large pairing histories cleanly.*
- `src/components/HerdScreen.tsx` must contain `useVirtualWindow`, `herdVirtual`, `HERD_PAGE_SIZE` — *Herd roster list must virtualize rows via useVirtualWindow with HERD_PAGE_SIZE pre-layout fallback.*
- `src/components/ReportsScreen.tsx` must contain `useVirtualWindow`, `reportVirtual`, `windowedRows` — *Reports table must virtualize displayed rows while exporting full filtered sets to CSV and Print.*

**Restoration Playbook if Overwritten:**
1. Keep `src/utils/useVirtualWindow.ts` and `queryPedigreeNeighborhood` / `queryPedigreeBranchAncestorsExist` in `src/storage/webSqliteAdapter.ts`.
2. Keep `loadPedigreeNeighborhood`, `checkPedigreeBranchesHaveAncestors`, and `pedigreeAncestorCacheRef` in `src/hooks/useBarnStore.ts` wired through `src/App.tsx` to `src/components/PedigreeScreen.tsx`.
3. Keep `useVirtualWindow` integration in `BreedingScreen.tsx`, `HerdScreen.tsx`, and `ReportsScreen.tsx`.

### IMP-028: Cage / Pen Capacity Warnings & Quick Occupant Assignment

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Compare current animal occupants against CageLocation.capacity (e.g., 3/2 over capacity), allow one-click occupant assignment from housing cards, and warn before exceeding capacity.
- **Summary:** Compares active, junior, and unarchived/non-offloaded retired occupants per species against `CageLocation.capacity` via pure single-pass evaluators (`evaluateCageOccupancy`, `evaluateSpeciesCagesOccupancy`, `evaluateCageAssignmentCapacityWarning`), surfaces over-capacity welfare alerts on `HomeSpeciesScreen` and `SpeciesDashboardScreen` and in printed Barn Binder housing tables (`barnBinder.ts`), adds inline cage capacity/section editing and 1-click quick occupant assignment/unassignment (`assignAnimalToCage`) on Cages & Pens cards, and displays soft confirmation warnings in both Quick Assign and `AnimalEditorModal` before exceeding capacity.
- **Tracked Files:** `src/domain/barnAlerts.ts`, `src/domain/barnBinder.ts`, `src/domain/__tests__/barnAlerts.test.ts`, `src/hooks/useBarnStore.ts`, `src/App.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/components/AnimalEditorModal.tsx`, `src/components/HomeSpeciesScreen.tsx`

**Automated Invariants Checked:**
- `src/domain/barnAlerts.ts` must contain `isCageOccupyingAnimal`, `evaluateCageOccupancy`, `evaluateSpeciesCagesOccupancy`, `evaluateCageAssignmentCapacityWarning` — *Pure occupancy counting and capacity warning evaluation must remain in pure TS core with species isolation.*
- `src/hooks/useBarnStore.ts` must contain `assignAnimalToCage` — *Store must expose queued FIFO assignAnimalToCage mutation updating _rev and syncOutbox.*
- `src/components/SpeciesDashboardScreen.tsx` must contain `cagesOccupancySummary`, `handleQuickAssignSelect`, `pendingCageAssignConfirm`, `onAssignAnimalToCage` — *Cages & Pens cards must show occupancy ratios, quick occupant assignment/unassignment, inline edit, and over-capacity alerts.*
- `src/components/AnimalEditorModal.tsx` must contain `liveCageCapacityWarning`, `pendingCapacityWarning`, `checkCapacityThenSave` — *Animal editor must display live cage occupancy feedback and soft confirmation before saving an over-capacity assignment.*
- `src/components/HomeSpeciesScreen.tsx` must contain `evaluateSpeciesCagesOccupancy`, `shouldShowOverCapacityAlert` — *Home species cards must surface an actionable alert when any species cage exceeds capacity.*
- `src/domain/barnBinder.ts` must contain `(over capacity)` — *Printable Barn Binder cage table must show occupancy/capacity ratios and over-capacity markers.*

**Restoration Playbook if Overwritten:**
1. Keep pure cage occupancy & assignment warning evaluators in `src/domain/barnAlerts.ts` and tests in `src/domain/__tests__/barnAlerts.test.ts`.
2. Keep `assignAnimalToCage` in `src/hooks/useBarnStore.ts` passed to `<SpeciesDashboardScreen onAssignAnimalToCage={store.assignAnimalToCage} />` in `src/App.tsx`.
3. Keep live ratio displays, over-capacity alerts, quick assign/unassign, and soft capacity confirmations in `SpeciesDashboardScreen.tsx`, `AnimalEditorModal.tsx`, `HomeSpeciesScreen.tsx`, and `barnBinder.ts`.

### IMP-029: Breeding Lab & Master Task List Refinements (Post-Birth Recalculation, Quick Checkoffs & Breed Overrides)

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Recalculate post-birth tasks to the actual birth date when births arrive early or late, support one-click Palpation/Birth Check checkoffs with automatic Missed task cleanup, and allow optional per-breed gestation/weaning/milestone overrides.
- **Summary:** Adds BreedScheduleOverride support (with case-insensitive dam-first, sire-fallback resolution via resolveEffectiveSpeciesProfileForBreeding and SQLite/sync/JSON preservation), adds pure post-birth task evaluation & recalculation (evaluateStalePostBirthTasksForBreeding, recalculatePostBirthTasksForBreeding) plus pending Missed cleanup (getPendingBreedingCleanupTasks) in taskMaster.ts, exposes recalculateBreedingPostBirthTasks & completeBreedingTaskWithOutcome in useBarnStore.ts, and adds UI controls in SpeciesEditorModal, BreedingScreen, and SpeciesDashboardScreen.
- **Tracked Files:** `src/domain/models.ts`, `src/domain/taskMaster.ts`, `src/domain/__tests__/taskMaster.test.ts`, `src/storage/webSqliteAdapter.ts`, `src/domain/syncAndExports.ts`, `src/domain/syncOutbox.ts`, `src/hooks/useBarnStore.ts`, `src/App.tsx`, `src/components/SpeciesEditorModal.tsx`, `src/components/BreedingScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`

**Automated Invariants Checked:**
- `src/domain/models.ts` must contain `BreedScheduleOverride`, `normalizeBreedScheduleOverrides`, `breedOverrides` — *SpeciesProfile must carry optional BreedScheduleOverride entries normalized deterministically in pure TypeScript.*
- `src/domain/taskMaster.ts` must contain `resolveEffectiveSpeciesProfileForBreeding`, `recalculatePostBirthTasksForBreeding`, `getPendingBreedingCleanupTasks`, `isPalpationTask`, `isBirthCheckTask` — *Breed override resolution, AFTER_BIRTH task date recalculation, and Missed breeding task cleanup helpers must remain pure and reusable.*
- `src/storage/webSqliteAdapter.ts` must contain `breed_overrides_json` — *SQLite schema and migrations must persist species breedOverrides across reloads.*
- `src/hooks/useBarnStore.ts` must contain `recalculateBreedingPostBirthTasks`, `completeBreedingTaskWithOutcome` — *Store must expose queued FIFO mutations for post-birth task recalculation and one-click breeding task outcome checkoffs with cleanup.*
- `src/components/SpeciesEditorModal.tsx` must contain `Per-Breed Schedule Overrides`, `handleSaveBreedOverride` — *Species Editor must allow configuring optional per-breed gestation, weaning, rebreed, maturity, and milestone day overrides.*
- `src/components/BreedingScreen.tsx` must contain `onRecalculatePostBirthTasks`, `outcomeStalePostBirth`, `outcomeMissedCleanupCount` — *Breeding Lab must resolve breed overrides in previews, offer one-tap post-birth chore shifting, and surface automatic Missed cleanup notice.*
- `src/components/SpeciesDashboardScreen.tsx` must contain `onCompleteBreedingTask`, `isPalpationTask`, `isBirthCheckTask` — *Species Hub task list must support one-click Palpation & Birth Check checkoffs and inline post-birth chore shifting on active pairings.*

**Restoration Playbook if Overwritten:**
1. Keep BreedScheduleOverride & normalizeBreedScheduleOverrides in `src/domain/models.ts` and pure helpers in `src/domain/taskMaster.ts` with tests in `src/domain/__tests__/taskMaster.test.ts`.
2. Keep `breed_overrides_json` persisted in `src/storage/webSqliteAdapter.ts` and normalized in `src/domain/syncAndExports.ts` and `src/domain/syncOutbox.ts`.
3. Keep `recalculateBreedingPostBirthTasks` and `completeBreedingTaskWithOutcome` in `src/hooks/useBarnStore.ts` wired through `src/App.tsx` to `SpeciesDashboardScreen.tsx`, `BreedingScreen.tsx`, and `SpeciesEditorModal.tsx`.

### IMP-030: Consolidated Import/Export Hub & Extensible Non-Native Exporter Registry

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Backups & Safety (`backup-safety`)
- **Origin:** Session Improvement
- **User Goal:** Consolidate all backup, native restore, multi-worker sync, external importer, and non-native exporter tools into a clean 3-section Import/Export Hub page integrated into navigation and Settings.
- **Summary:** Adds a pure TypeScript extensible non-native exporter registry (`exporterTypes.ts`, `registry.ts`) supporting `.CSV`, Evans `.HTM`, Printable Barn Binder `.HTM`, Normalized Report DTO `.JSON`, and `.ICS` calendar tasks plus future external schema slots; introduces `ImportExportHubScreen` structured cleanly into System Backup, Imports (Native System Imports first followed by External Format Importers), and Exporters; wires `'importExport'` into `useBarnStore.ts`, `App.tsx` (desktop/mobile nav + `I` shortcut + backup banner routing), `SpeciesDashboardScreen.tsx`, `HomeSpeciesScreen.tsx`, and `SettingsAndSyncScreen.tsx`.
- **Tracked Files:** `src/domain/exporters/exporterTypes.ts`, `src/domain/exporters/registry.ts`, `src/domain/__tests__/exportersRegistry.test.ts`, `src/components/ImportExportHubScreen.tsx`, `src/hooks/useBarnStore.ts`, `src/App.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/components/HomeSpeciesScreen.tsx`

**Automated Invariants Checked:**
- `src/domain/exporters/exporterTypes.ts` must contain `ExternalExporterDescriptor`, `ExportedArtifactPayload` — *Pure TypeScript exporter interface contracts must remain DOM-free for cross-platform reuse.*
- `src/domain/exporters/registry.ts` must contain `BUILTIN_NON_NATIVE_EXPORTERS`, `PLANNED_EXTERNAL_SCHEMA_TARGETS`, `buildExporterCatalog`, `runExternalExporter` — *Non-native exporter catalog must keep built-in formats and extensible registry hooks intact.*
- `src/components/ImportExportHubScreen.tsx` must contain `ImportExportHubScreen`, `ExternalImporterPanel`, `UnifiedBackupVaultPanel`, `BUILTIN_NON_NATIVE_EXPORTERS` — *Hub screen must organize System Backup, Native & External Imports, and Exporters cleanly.*
- `src/hooks/useBarnStore.ts` must contain `| 'importExport'` — *WorkspaceRoute union must include importExport.*
- `src/App.tsx` must contain `ImportExportHubScreen`, `openImportExportHub` — *Root shell must route, lazy-load, and link banners/shortcuts cleanly to ImportExportHubScreen.*
- `src/components/SettingsAndSyncScreen.tsx` must contain `onOpenImportExportHub` — *Settings must link cleanly into all sections of the Import/Export Hub without duplicating forms.*

**Restoration Playbook if Overwritten:**
1. Restore `src/domain/exporters/exporterTypes.ts`, `src/domain/exporters/registry.ts`, and `src/domain/__tests__/exportersRegistry.test.ts`.
2. Restore `src/components/ImportExportHubScreen.tsx` and keep `importExport` inside `WorkspaceRoute` in `src/hooks/useBarnStore.ts`.
3. Keep `ImportExportHubScreen` routing, `I` shortcut, navigation buttons, and Settings/Home/Species Hub links wired across `App.tsx`, `SettingsAndSyncScreen.tsx`, `SpeciesDashboardScreen.tsx`, and `HomeSpeciesScreen.tsx`.

### IMP-031: Interactive CSV Column Mapper, Starter Template & Unlinked Parent Preview

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Provide a one-click Starter CSV Template download, interactive column-mapping preview for spreadsheets, and pre-import highlighting for unresolved Sire/Dam links on non-HerdBoss CSV imports.
- **Summary:** Adds pure TS Starter CSV Template generation (`csvStarterTemplate.ts`), unified column alias & override resolution (`csvColumnMapper.ts`), two-pass out-of-order CSV parent linking with unresolved Sire/Dam pre-import tracking in `universalPedigreeImporter.ts`, and interactive UI controls in `ExternalImporterPanel.tsx`.
- **Tracked Files:** `src/domain/importers/importerTypes.ts`, `src/domain/importers/csvStarterTemplate.ts`, `src/domain/importers/csvColumnMapper.ts`, `src/domain/importers/universalPedigreeImporter.ts`, `src/components/ExternalImporterPanel.tsx`, `src/domain/__tests__/resilienceAndUniversalImport.test.ts`

**Automated Invariants Checked:**
- `src/domain/importers/csvStarterTemplate.ts` must contain `buildStarterCsvTemplate`, `STARTER_CSV_TEMPLATE_HEADERS` — *Pure TS starter CSV template generator must remain DOM-free with standard pedigree headers.*
- `src/domain/importers/csvColumnMapper.ts` must contain `CSV_TARGET_FIELD_OPTIONS`, `resolveCsvColumnAssignments`, `makeCsvColumnOverrideKey` — *Pure TS column mapper must resolve aliases, sample cells, and user overrides cleanly.*
- `src/domain/importers/universalPedigreeImporter.ts` must contain `resolveCsvColumnAssignments`, `unresolvedParentLinks`, `csvTables` — *Universal importer must perform two-pass parent resolution and surface column mapping & unresolved Sire/Dam links.*
- `src/components/ExternalImporterPanel.tsx` must contain `Download Starter CSV Template`, `handleCsvColumnSelectionChange`, `unresolvedParentLinks` — *External importer UI must expose template download, interactive column mapping, and unresolved parent link warnings.*

**Restoration Playbook if Overwritten:**
1. Restore `src/domain/importers/csvStarterTemplate.ts` and `src/domain/importers/csvColumnMapper.ts` and keep `CsvTableMappingSummary`/`UnresolvedParentLink` in `src/domain/importers/importerTypes.ts`.
2. Keep two-pass CSV resolution and `csvColumnMapping`/`unresolvedParentLinks` wiring in `src/domain/importers/universalPedigreeImporter.ts`.
3. Keep the Starter CSV Template download button, column-mapping region, and unresolved Sire/Dam highlight card in `src/components/ExternalImporterPanel.tsx`.

### IMP-032: Low-RAM Export Streaming & Full OPFS /tmp Staging

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Backups & Safety (`backup-safety`)
- **Origin:** Session Improvement
- **User Goal:** Route all printable/shareable exports (including <512 KB .HTM pedigrees and cage cards) through OPFS /tmp with immediate post-use cleanup, and stream large .ZIP and .JSON backup chunks incrementally into OPFS /tmp without materializing monolithic JS heap buffers.
- **Summary:** Adds worker-safe `opfsTempStream.ts` (`writeTempOpfsFileStreamed`) and chunked `writeTempOpfsFile`; stages all `downloadTextFile`, `downloadBinaryFile`, `shareTextFileOrDownload`, and `shareBinaryFileOrDownload` exports through OPFS `/tmp` with immediate cleanup in `webFileActions.ts`; streams `.JSON` backup chunks via `generateBarnBackupJsonChunks` (`syncAndExports.ts`); streams `.ZIP` archives one photo and one binder at a time via `streamCompleteBackupZipArchive` & `streamPhotosOnlyZipArchive` (`backupArchive.ts`); and wires worker/UI/store callers cleanly.
- **Tracked Files:** `src/storage/opfsTempStream.ts`, `src/storage/opfsStorage.ts`, `src/domain/syncAndExports.ts`, `src/domain/backupArchive.ts`, `src/utils/webFileActions.ts`, `src/storage/archiveAndImport.worker.ts`, `src/storage/offThreadWorkerClient.ts`, `src/components/ImportExportHubScreen.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/hooks/useBarnStore.ts`, `src/storage/__tests__/opfsStorage.test.ts`, `src/storage/__tests__/photoHydrationAndWorker.test.ts`, `src/domain/__tests__/syncAndExports.test.ts`

**Automated Invariants Checked:**
- `src/storage/opfsTempStream.ts` must contain `writeTempOpfsFileStreamed`, `writeTempOpfsFile`, `purgeOpfsTmp`, `readTempOpfsFileAsBlob` — *Worker-safe OPFS /tmp chunk streamer must remain free of React/DOM imports and close writables in try/finally.*
- `src/domain/syncAndExports.ts` must contain `generateBarnBackupJsonChunks` — *Pure TypeScript backup JSON chunk generator prevents allocating monolithic strings for photo-heavy backups.*
- `src/domain/backupArchive.ts` must contain `streamCompleteBackupZipArchive`, `streamPhotosOnlyZipArchive` — *Streaming fflate Zip/ZipPassThrough/ZipDeflate builders decode and flush one entry at a time incrementally.*
- `src/utils/webFileActions.ts` must contain `downloadTextChunks`, `downloadTempOpfsExport`, `stagePayloadInOpfsTmp` — *All printable, shareable, and streamed browser exports stage via OPFS /tmp when supported and clean up deterministically.*
- `src/storage/offThreadWorkerClient.ts` must contain `buildCompleteBackupZipToOpfsTmpOffThread`, `buildPhotosOnlyZipToOpfsTmpOffThread` — *Off-thread worker bridge streams ZIP chunks straight to OPFS /tmp and falls back gracefully without Worker or OPFS.*

**Restoration Playbook if Overwritten:**
1. Keep `src/storage/opfsTempStream.ts` free of React/DOM imports and delegated from `src/storage/opfsStorage.ts` and `src/storage/archiveAndImport.worker.ts`.
2. Keep `generateBarnBackupJsonChunks` in `src/domain/syncAndExports.ts` and `streamCompleteBackupZipArchive` / `streamPhotosOnlyZipArchive` in `src/domain/backupArchive.ts`.
3. Keep full OPFS `/tmp` staging + `downloadTextChunks` / `downloadTempOpfsExport` in `src/utils/webFileActions.ts`, wired through `offThreadWorkerClient.ts`, `ImportExportHubScreen.tsx`, `SettingsAndSyncScreen.tsx`, and `useBarnStore.ts`.

### IMP-033: "The Techy Stuff" Developer & Troubleshooting Screen, Permanent Tier Hierarchy & Production Guardrails

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Diagnostics & Sync (`diagnostics-sync`)
- **Origin:** Session Improvement
- **User Goal:** Relocate advanced, non-routine operational controls out of Settings into a dedicated lazy-loaded "The Techy Stuff" developer screen with a permanent non-closeable Tier/Memory Hierarchy block, isolated error boundary, OPFS/IDB quota pre-flight checks, strict input sanitization, and multi-step destructive safeguards.
- **Summary:** Introduces lazy-loaded `TechyStuffScreen` wrapped in an isolated `TechyStuffErrorBoundary`; relocates Storage Protection, Connectivity Governor, App Update Policy & Release Gate, `DiagnosticsAndSupportPanel`, and Destructive Reset Lab controls out of `SettingsAndSyncScreen` while preserving original `DeviceCapabilityCard` & Home hierarchy banners intact; embeds a permanent, non-closeable copy of the 5-tier Device Tier & Memory Hierarchy guidelines (`data-permanent-tier-hierarchy="true"`); and enforces pure TS validation/sanitization & OPFS/IDB quota pre-flight checks (`techyStuffGuardrails.ts`, `verifyStorageQuotaForDiagnosticAction`) plus multi-step armed phrase safeguards.
- **Tracked Files:** `src/domain/techyStuffGuardrails.ts`, `src/domain/__tests__/techyStuffGuardrails.test.ts`, `src/storage/storageProtection.ts`, `src/components/TechyStuffErrorBoundary.tsx`, `src/components/TechyStuffScreen.tsx`, `src/components/DiagnosticsAndSupportPanel.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/hooks/useBarnStore.ts`, `src/App.tsx`

**Automated Invariants Checked:**
- `src/domain/techyStuffGuardrails.ts` must contain `evaluateStorageQuotaForOperation`, `validateDiagnosticTriggerInput`, `validateSupportRecipientEmail`, `DESTRUCTIVE_CONFIRM_PHRASES`, `isDestructiveActionConfirmationValid` — *Pure TS developer guardrails module must stay DOM-free and enforce quota evaluations, strict input validation/sanitization, and confirmation phrases.*
- `src/storage/storageProtection.ts` must contain `verifyStorageQuotaForDiagnosticAction` — *Browser storage adapter must execute OPFS + IndexedDB quota pre-flight checks and log low-headroom diagnostics.*
- `src/components/TechyStuffErrorBoundary.tsx` must contain `TechyStuffErrorBoundary`, `recordReactCrash` — *Developer & Troubleshooting screen must stay isolated in a dedicated Error Boundary so faulty diagnostics cannot crash herd/breeding views.*
- `src/components/TechyStuffScreen.tsx` must contain `TechyStuffScreen`, `data-permanent-tier-hierarchy="true"`, `DEVICE_CAPABILITY_TIER_LIST`, `destructiveArmed` — *The Techy Stuff screen must include a permanent non-closeable Tier/Memory Hierarchy block and multi-step armed safeguards for destructive actions.*
- `src/components/SettingsAndSyncScreen.tsx` must contain `onOpenTechyStuff`, `DeviceCapabilityCard` — *Settings must link cleanly to The Techy Stuff while keeping routine barn preferences and original DeviceCapabilityCard intact.*
- `src/App.tsx` must contain `TechyStuffScreen`, `TechyStuffErrorBoundary`, `route === 'techyStuff'` — *Root shell must lazy-load TechyStuffScreen inside Suspense + TechyStuffErrorBoundary.*

**Restoration Playbook if Overwritten:**
1. Restore `src/domain/techyStuffGuardrails.ts` and `verifyStorageQuotaForDiagnosticAction` in `src/storage/storageProtection.ts`.
2. Restore `src/components/TechyStuffErrorBoundary.tsx` and `src/components/TechyStuffScreen.tsx` with its permanent `data-permanent-tier-hierarchy="true"` section and `destructiveArmed` phrase gates.
3. Keep `techyStuff` in `WorkspaceRoute` (`useBarnStore.ts`), `SettingsAndSyncScreen.tsx` launcher (`onOpenTechyStuff`), and lazy boundary mount in `src/App.tsx`.

### IMP-034: "Barn Bench" Fast Sequential Batch Entry Mode

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Let breeders walk down a cage row logging weights, body condition scores, nail trims, or cage moves rapidly with auto-advance and minimal modal switching.
- **Summary:** Adds a tap-friendly, strictly species-isolated Barn Bench sequential chore sheet filtered by barn row/section, herd status, and search text; supports rapid cage-by-cage logging of weights (in species unit), 1-tap BCS presets, nail trims, cage moves with live capacity warnings, and notes with auto-advance, transactional batch care-log writes (`saveCareLogsBatch`), and field-level sync outbox recording.
- **Tracked Files:** `src/domain/barnBench.ts`, `src/domain/__tests__/barnBench.test.ts`, `src/storage/storageAdapter.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/BarnBenchScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/components/HerdScreen.tsx`, `src/App.tsx`

**Automated Invariants Checked:**
- `src/domain/barnBench.ts` must contain `extractSpeciesCageSections`, `buildBarnBenchQueue`, `buildBarnBenchCommitPlan`, `findNextBarnBenchIndex`, `BARN_BENCH_BCS_PRESETS` — *Pure TS Barn Bench queue builder, commit planner, and auto-advance selector must remain DOM-free and species-isolated.*
- `src/storage/webSqliteAdapter.ts` must contain `saveCareLogsBatch` — *Transactional batch CareLog persistence prevents multi-flush overhead when logging combined bench entries.*
- `src/hooks/useBarnStore.ts` must contain `| 'bench'`, `commitBarnBenchEntry`, `buildBarnBenchCommitPlan` — *Store must expose the bench route and queued atomic commitBarnBenchEntry action with outbox sync ops.*
- `src/components/BarnBenchScreen.tsx` must contain `BarnBenchScreen`, `evaluateCageAssignmentCapacityWarning`, `useAsyncSubmitLock`, `findNextBarnBenchIndex` — *Barn Bench screen must guard async commits against double-taps, check cage capacity on moves, and auto-advance cleanly.*
- `src/App.tsx` must contain `BarnBenchScreen`, `route === 'bench'`, `k: { route: 'bench'` — *Root shell must lazy-load BarnBenchScreen under route === bench with keyboard shortcut K.*

**Restoration Playbook if Overwritten:**
1. Restore `src/domain/barnBench.ts` and `src/domain/__tests__/barnBench.test.ts`.
2. Keep `saveCareLogsBatch` on `StorageAdapter` and `WebSqliteAdapter` and `commitBarnBenchEntry` + `bench` route in `src/hooks/useBarnStore.ts`.
3. Keep lazy `BarnBenchScreen` mounted in `src/App.tsx` with `K` shortcut and launchers in `SpeciesDashboardScreen.tsx` and `HerdScreen.tsx`.

### IMP-035: Batch Cage Card, Compact Mini-Sheet & Pedigree Printing from Herd Multi-Select

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Print cage cards, 4-up mini pedigrees, 4x6 photo cards, or stacked pedigrees for multiple selected animals in one pass for shows, auctions, or transport.
- **Summary:** Allows breeders to multi-select animals in `HerdScreen` and generate a single printable `.HTM` / Print-to-PDF sheet across four formats: 8-up kennel/cage cards, 1/4-page (4-up) mini 3-gen pedigree sheets, 3-generation 4x6 photo cards (2-up Letter or direct 4x6 paper), and stacked formal 3–6G pedigrees, backed by pure TS HTML generation (`batchPrint.ts`), bounded on-demand batch photo hydration (`loadAnimalPhotoDataUrlsBatch`), and live layout/option controls in `PrintPreviewModal`.
- **Tracked Files:** `src/domain/batchPrint.ts`, `src/domain/__tests__/batchPrint.test.ts`, `src/hooks/useBarnStore.ts`, `src/App.tsx`, `src/components/PrintPreviewModal.tsx`, `src/components/HerdScreen.tsx`

**Automated Invariants Checked:**
- `src/domain/batchPrint.ts` must contain `BATCH_PRINT_LAYOUTS`, `generateBatchPrintHtml`, `resolveBatchPrintAnimals`, `computeBatchPrintPageCount`, `buildBatchPrintFileName` — *Pure TS batch print engine must remain DOM-free and support cage cards, 4-up mini sheets, 4x6 photo cards, and stacked pedigrees.*
- `src/hooks/useBarnStore.ts` must contain `loadAnimalPhotoDataUrlsBatch` — *Store must expose bounded on-demand batch photo hydration without retaining full-res images in reactive snapshot RAM.*
- `src/components/PrintPreviewModal.tsx` must contain `batchPrintOptions`, `onChangeBatchPrintOptions`, `BATCH_PRINT_LAYOUTS` — *Print preview modal must render live layout switcher and batch print options toolbar.*
- `src/components/HerdScreen.tsx` must contain `openBatchPrintPreview`, `generateBatchPrintHtml`, `resolveBatchPrintAnimals`, `Batch Print (` — *HerdScreen multi-select bulk bar must launch batch print previews and clean up hydrated photos on close.*

**Restoration Playbook if Overwritten:**
1. Restore `src/domain/batchPrint.ts` and `src/domain/__tests__/batchPrint.test.ts`.
2. Keep `loadAnimalPhotoDataUrlsBatch` exported from `src/hooks/useBarnStore.ts` and passed as `onLoadFullPhotosBatch` to `HerdScreen` in `src/App.tsx`.
3. Keep `batchPrintOptions` controls in `src/components/PrintPreviewModal.tsx` and multi-select `Batch Print` wiring in `src/components/HerdScreen.tsx`.

### IMP-036: QR-Coded Cage Cards & Visual Hutch-Row / Facility Pen Board

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Embed scannable QR codes on printable cage cards that open the animal profile route directly in the PWA, and provide a visual Hutch-by-Hutch / Cage Row & Pasture Board grouping pens by barn section with linked feedlot inventories and recurring maintenance reminders.
- **Summary:** Adds a zero-dependency pure TS ISO/IEC 18004 QR code encoder and single-path SVG renderer (`qrCode.ts`), embeds toggleable scannable QR profile deep links into both thermal single cage cards (`generateThermalCageCardHtml`) and 8-up batch cage cards (`batchPrint.ts`), parses `?route=herd&animalId=...` and `?route=dashboard&cageId=...` on startup in `useBarnStore.ts`, extends `CageLocation` and SQLite/JSON serialization with housing unit type, feedlot inventory, and recurring maintenance schedules, and adds the pure `facilityBoard.ts` engine plus interactive `FacilityPenBoard` inside `SpeciesDashboardScreen` (with compact list toggle, full-screen board modal, quick stock adjustments, 1-click maintenance logging/task scheduling, and pen/row QR card printing).
- **Tracked Files:** `src/domain/qrCode.ts`, `src/domain/facilityBoard.ts`, `src/domain/models.ts`, `src/domain/batchPrint.ts`, `src/domain/syncAndExports.ts`, `src/domain/__tests__/qrCode.test.ts`, `src/domain/__tests__/facilityBoard.test.ts`, `src/domain/__tests__/batchPrint.test.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/FacilityPenBoard.tsx`, `src/components/PrintPreviewModal.tsx`, `src/components/HerdScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/App.tsx`

**Automated Invariants Checked:**
- `src/domain/qrCode.ts` must contain `encodeQrMatrix`, `renderQrSvg`, `buildAnimalProfileDeepLink`, `buildCageBoardDeepLink`, `parseAppDeepLinkParams` — *Pure TS offline QR encoder, vector SVG renderer, and deep-link helpers must remain zero-DOM and self-contained.*
- `src/domain/facilityBoard.ts` must contain `buildFacilityBoardModel`, `evaluateCageMaintenanceStatus`, `evaluateCageFeedStatus`, `buildCageMaintenanceTaskDraft`, `matchesFacilityBoardFilter` — *Pure TS facility board grouping, feedlot rollups, and UTC calendar maintenance evaluators must remain DOM-free.*
- `src/domain/batchPrint.ts` must contain `includeQrCodes`, `supportsQrCode`, `buildAnimalProfileDeepLink` — *8-up batch cage cards must support scannable QR profile codes via includeQrCodes.*
- `src/domain/syncAndExports.ts` must contain `ThermalCageCardOptions`, `buildAnimalProfileDeepLink`, `renderQrSvg` — *Single thermal cage cards must embed optional QR profile deep links and backup JSON must preserve extended CageLocation metadata.*
- `src/storage/webSqliteAdapter.ts` must contain `feed_lot_name`, `maintenance_interval_days`, `last_maintenance_date_iso` — *SQLite cages table and idempotent migrations must persist housing type, feedlot inventory, and maintenance schedule columns.*
- `src/hooks/useBarnStore.ts` must contain `parseAppDeepLinkParams`, `highlightedCageId`, `setHighlightedCageId` — *Store startup deep-link handler must resolve scanned QR animalId and cageId routes cleanly.*
- `src/components/FacilityPenBoard.tsx` must contain `FacilityPenBoard`, `buildCageMaintenanceTaskDraft`, `onPrintCageCardsForAnimals` — *Visual Hutch-Row & Pasture Board must display grouped pens, feedlot controls, maintenance checkoffs, and QR cage card printing.*
- `src/components/SpeciesDashboardScreen.tsx` must contain `FacilityPenBoard`, `facilityBoardModel`, `handlePrintCageCardsForAnimals`, `highlightedCageId` — *Species dashboard Cages & Pens block must mount FacilityPenBoard alongside compact list view, full-screen board modal, and QR card print preview.*

**Restoration Playbook if Overwritten:**
1. Restore `src/domain/qrCode.ts`, `src/domain/facilityBoard.ts`, and their tests in `src/domain/__tests__/qrCode.test.ts` and `src/domain/__tests__/facilityBoard.test.ts`.
2. Keep extended `CageLocation` fields in `src/domain/models.ts`, SQLite columns/migrations in `src/storage/webSqliteAdapter.ts`, and JSON round-trip parsing in `src/domain/syncAndExports.ts`.
3. Keep QR code rendering in `src/domain/syncAndExports.ts` (`generateThermalCageCardHtml`) and `src/domain/batchPrint.ts` (`includeQrCodes`) wired to `PrintPreviewModal.tsx`, `HerdScreen.tsx`, and `SpeciesDashboardScreen.tsx`.
4. Keep `FacilityPenBoard.tsx` mounted in `SpeciesDashboardScreen.tsx` and `highlightedCageId` deep-link resolution in `useBarnStore.ts` and `src/App.tsx`.

### IMP-037: Side-by-Side Multi-Candidate Pairing Comparison Matrix (Breeding Lab)

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Compare one dam against multiple candidate sires (or vice versa) in a single Breeding Lab table showing COI %, shared bottleneck ancestors, carrier risk flags, and predicted coat varieties side by side.
- **Summary:** Adds a pure TypeScript multi-candidate pairing matrix engine (`pairingMatrix.ts`) and interactive `PairingComparisonMatrix` table inside `BreedingScreen` so breeders can compare one Dam against multiple candidate Sires (or one Sire against multiple candidate Dams) side by side for projected Wright COI %, shared bottleneck ancestors, carrier and genetic health/lethal risk flags, and predicted coat varieties, with 1-click loading into the Cage-Side Pairing Logger.
- **Tracked Files:** `src/domain/pairingMatrix.ts`, `src/domain/__tests__/pairingMatrix.test.ts`, `src/components/PairingComparisonMatrix.tsx`, `src/components/BreedingScreen.tsx`

**Automated Invariants Checked:**
- `src/domain/pairingMatrix.ts` must contain `buildPairingComparisonMatrix`, `selectDefaultMatrixCandidateIds`, `createSpeciesCoiEvaluator`, `analyzePairingCarrierRisksFromAnalyses`, `simulatePairingGenetics` — *Pure TS multi-candidate comparison matrix must share one species COI evaluator, run carrier lineage + Punnett simulations, and remain zero-DOM.*
- `src/components/PairingComparisonMatrix.tsx` must contain `PairingComparisonMatrix`, `buildPairingComparisonMatrix`, `ColorGeneticsNotice`, `onLoadPairingInLogger` — *Breeding Lab comparison matrix UI must render anchor/candidate selectors, sort/filter controls, coat genetics notice, and Load in Logger wiring.*
- `src/components/BreedingScreen.tsx` must contain `PairingComparisonMatrix`, `handleLoadPairingFromMatrix` — *BreedingScreen must mount PairingComparisonMatrix and connect Load in Logger to the Cage-Side Pairing Logger.*

**Restoration Playbook if Overwritten:**
1. Restore `src/domain/pairingMatrix.ts` and its unit tests in `src/domain/__tests__/pairingMatrix.test.ts`.
2. Restore `src/components/PairingComparisonMatrix.tsx` with anchor role toggle, candidate multi-select, COI/bottleneck/carrier/variety columns, and `ColorGeneticsNotice`.
3. Mount `<PairingComparisonMatrix />` and `handleLoadPairingFromMatrix` inside `src/components/BreedingScreen.tsx`.

### IMP-038: Color-Coded Allele Provenance, Unique-Ancestor Dimming & ARBA Registration Flags

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Color-code alleles by inheritance provenance (sire vs. dam vs. offspring vs. manual), dim unique non-convergent ancestors on pedigree trees to highlight linebred convergence, and flag Gen 0–3 pedigree nodes in red when missing ARBA registration fields would block registration.
- **Summary:** Adds a pure TypeScript allele provenance classifier (`analyzeAlleleProvenance` in `geneticsEngine.ts`) and pedigree convergence + ARBA 3-generation registration evaluator (`pedigreeAnalysis.ts`), a reusable color-coded genotype renderer (`ColoredGenotypeDisplay.tsx`), Dim Unique convergence spotlighting and red ARBA registration deficiency overlays on `PedigreeScreen`, and provenance displays with legend across `HerdScreen` and `BreedingScreen`.
- **Tracked Files:** `src/domain/geneticsEngine.ts`, `src/domain/pedigreeAnalysis.ts`, `src/domain/__tests__/pedigreeAnalysis.test.ts`, `src/components/ColoredGenotypeDisplay.tsx`, `src/components/PedigreeScreen.tsx`, `src/components/HerdScreen.tsx`, `src/components/BreedingScreen.tsx`

**Automated Invariants Checked:**
- `src/domain/geneticsEngine.ts` must contain `analyzeAlleleProvenance`, `AlleleProvenanceSource`, `AnimalAlleleProvenanceResult` — *Pure TS allele provenance classifier must support Mendelian elimination, offspring inference, X-linked loci, and custom species isolation without DOM dependencies.*
- `src/domain/pedigreeAnalysis.ts` must contain `isArbaRegistrationSpecies`, `evaluateAnimalArbaRegistration`, `analyzePedigreeTree` — *Pure TS pedigree convergence and ARBA registration evaluator must scope ARBA rules to Rabbit/Cavy Gen 0–3 nodes and remain zero-DOM.*
- `src/components/ColoredGenotypeDisplay.tsx` must contain `ColoredGenotypeDisplay`, `AlleleProvenanceLegend` — *Reusable provenance renderer must style Sire, Dam, Offspring, Manual, and Unverified alleles with accessible labels and legend.*
- `src/components/PedigreeScreen.tsx` must contain `analyzePedigreeTree`, `analyzeAlleleProvenance`, `dimUniqueAncestors`, `showRegistrationFlags`, `ColoredGenotypeDisplay` — *PedigreeScreen must wire Dim Unique convergence spotlighting, ARBA registration flags, and color-coded node alleles.*
- `src/components/HerdScreen.tsx` must contain `analyzeAlleleProvenance`, `ColoredGenotypeDisplay` — *HerdScreen Genetics & Allele Inference card must display color-coded allele provenance and uncommitted inference previews.*
- `src/components/BreedingScreen.tsx` must contain `analyzeAlleleProvenance`, `ColoredGenotypeDisplay`, `AlleleProvenanceLegend` — *BreedingScreen Coat Color Punnett panel must display color-coded Sire/Dam allele provenance alongside locus pair highlights.*

**Restoration Playbook if Overwritten:**
1. Keep `analyzeAlleleProvenance` in `src/domain/geneticsEngine.ts` and `src/domain/pedigreeAnalysis.ts` with unit tests in `src/domain/__tests__/pedigreeAnalysis.test.ts`.
2. Restore `src/components/ColoredGenotypeDisplay.tsx` (`ColoredGenotypeDisplay` + `AlleleProvenanceLegend`).
3. Keep Dim Unique, ARBA Reg Flags, and provenance wiring in `PedigreeScreen.tsx`, `HerdScreen.tsx`, and `BreedingScreen.tsx`.

### IMP-039: Pedigree Print Orientation Toggle, Optional Breeder Logo, ARBA lbs.oz Notation & Direct Offline PDF Export

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Allow breeders to switch ARBA pedigrees between Landscape and Portrait 8.5"x11", attach a rabbitry/barn logo in the header, toggle ARBA lbs.oz decimal dot weights, and download a .PDF file directly 100% offline.
- **Summary:** Adds Landscape/Portrait 8.5"x11" print orientation, optional barn/rabbitry raster logo header upload (`BarnSettings.breederLogoDataUrl`), ARBA `lbs.oz` dot weight notation (`formatWeightArbaLbsOzDot`, e.g., `10.04`), and a zero-dependency pure TypeScript 100% offline PDF 1.4 binary generator (`buildPedigreePdfBytes` in `pdfExporter.ts` + `webPdfActions.ts`) with direct Download .PDF in `PrintPreviewModal`.
- **Tracked Files:** `src/domain/models.ts`, `src/domain/syncAndExports.ts`, `src/domain/pdfExporter.ts`, `src/domain/__tests__/pdfExporter.test.ts`, `src/utils/webPdfActions.ts`, `src/storage/webSqliteAdapter.ts`, `src/components/SettingsAndSyncScreen.tsx`, `src/components/PrintPreviewModal.tsx`, `src/components/PedigreeScreen.tsx`, `src/components/HerdScreen.tsx`

**Automated Invariants Checked:**
- `src/domain/models.ts` must contain `breederLogoDataUrl`, `formatWeightArbaLbsOzDot`, `formatPedigreeWeight` — *BarnSettings must persist optional breederLogoDataUrl and models.ts must expose pure ARBA lbs.oz dot notation formatters.*
- `src/domain/syncAndExports.ts` must contain `PedigreePrintOrientation`, `arbaLbsOzDotNotation`, `showBreederLogo`, `barn-logo` — *generateEvansHtmPedigree must support Landscape/Portrait @page sizing, ARBA lbs.oz dot weights, and header logo rendering.*
- `src/domain/pdfExporter.ts` must contain `buildPedigreePdfBytes`, `PdfRasterImage`, `/DCTDecode` — *Pure TS offline PDF 1.4 generator must emit valid PDF binaries with JPEG XObjects and zero DOM dependencies.*
- `src/components/PrintPreviewModal.tsx` must contain `onDownloadPdf`, `Download .PDF`, `ARBA lbs.oz (10.04)`, `Portrait (8.5` — *PrintPreviewModal must expose orientation toggle, lbs.oz dot toggle, logo controls, and direct Download .PDF action.*

**Restoration Playbook if Overwritten:**
1. Keep `breederLogoDataUrl`, `formatWeightArbaLbsOzDot`, and `formatPedigreeWeight` in `src/domain/models.ts` and `webSqliteAdapter.ts` extra_settings_json.
2. Restore `src/domain/pdfExporter.ts`, `src/utils/webPdfActions.ts`, and `src/domain/__tests__/pdfExporter.test.ts`.
3. Keep orientation, ARBA lbs.oz, logo upload/toggle, and `onDownloadPdf` wired across `SettingsAndSyncScreen.tsx`, `PrintPreviewModal.tsx`, `PedigreeScreen.tsx`, and `HerdScreen.tsx`.

### IMP-040: 8-Generation Pedigree Tree Mode, Custom Print Styling Presets & Shareable HTML Pedigree Cards

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Let breeders view and export up to 8 generations on demand, customize pedigree print borders, colors, and layouts safely on crisp white paper, and export lightweight standalone shareable pedigree HTML cards.
- **Summary:** Extends pedigree traversal, SQLite neighborhood loading, Evans .HTM output, and pure-TS offline PDF 1.4 export (auto-paginating 7-gen into 2 sheets and 8-gen into 4 grandparent quadrants) up to 8 generations on demand while keeping startup defaults capped at 3–6G; adds white-paper-locked color/border/layout print presets (`pedigreePrintStyles.ts`) and lightweight standalone mobile `.HTML` shareable pedigree cards (`shareablePedigreeCard.ts`).
- **Tracked Files:** `src/domain/models.ts`, `src/domain/pedigreeCalculator.ts`, `src/domain/pedigreePrintStyles.ts`, `src/domain/shareablePedigreeCard.ts`, `src/domain/syncAndExports.ts`, `src/domain/pdfExporter.ts`, `src/domain/exporters/exporterTypes.ts`, `src/domain/exporters/registry.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/PrintPreviewModal.tsx`, `src/components/PedigreeScreen.tsx`, `src/components/HerdScreen.tsx`, `src/components/ImportExportHubScreen.tsx`

**Automated Invariants Checked:**
- `src/domain/models.ts` must contain `DefaultPedigreeGenerations`, `PedigreeGenerationDepth`, `normalizePedigreeGenerationDepth`, `normalizeDefaultPedigreeGenerations` — *models.ts must separate 3–6G startup defaults from on-demand 3–8G PedigreeGenerationDepth.*
- `src/domain/pedigreePrintStyles.ts` must contain `PEDIGREE_COLOR_PRESETS`, `PEDIGREE_BORDER_STYLES`, `PEDIGREE_LAYOUT_PRESETS`, `resolvePedigreePrintTheme` — *Pure TS print preset engine must define color, border, and layout presets locked to #FFFFFF paper.*
- `src/domain/shareablePedigreeCard.ts` must contain `generateShareablePedigreeCardHtml`, `buildShareablePedigreeCardFileName`, `ShareablePedigreeCardOptions` — *Pure TS shareable HTML pedigree card generator must render zero-DOM self-contained cards with collapsible Gen 4–8 ancestry.*
- `src/domain/exporters/registry.ts` must contain `shareable-pedigree-card`, `generateShareablePedigreeCardHtml` — *Exporters registry must expose Shareable Pedigree Card (.HTML) alongside 8-gen Evans .HTM.*
- `src/components/PrintPreviewModal.tsx` must contain `pedigreeDocMode`, `onChangePedigreeDocMode`, `PEDIGREE_COLOR_PRESETS`, `PEDIGREE_BORDER_STYLES`, `PEDIGREE_LAYOUT_PRESETS` — *PrintPreviewModal must allow switching between Formal Certificate and Shareable Card and picking color, border, and layout presets.*
- `src/storage/webSqliteAdapter.ts` must contain `Math.min(8, Math.max(0, Math.floor(maxDepth)))`, `MAX_RECORDS = 512` — *SQLite neighborhood loader must fetch up to 8 generations with expanded ancestor node cap (512).*

**Restoration Playbook if Overwritten:**
1. Keep `PedigreeGenerationDepth` (`3..8`) and normalizers in `src/domain/models.ts` plus Gen 7–8 `slotRoleLabel`/`buildPedigreeSlots` in `src/domain/pedigreeCalculator.ts`.
2. Restore `src/domain/pedigreePrintStyles.ts`, `src/domain/shareablePedigreeCard.ts`, multi-page 7–8G sheets in `src/domain/pdfExporter.ts`, and `shareable-pedigree-card` in `src/domain/exporters/registry.ts`.
3. Preserve 7/8-gen toggles, style preset selectors, and `pedigreeDocMode` wiring across `webSqliteAdapter.ts`, `useBarnStore.ts`, `PrintPreviewModal.tsx`, `PedigreeScreen.tsx`, `HerdScreen.tsx`, and `ImportExportHubScreen.tsx`.

### IMP-041: Structured Show Placements, Wins, Judge Notes & E-Leg Vault

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Capture structured show results, judge feedback, legs, and E-Leg certificate photos per entered animal so GC progress and show wins automatically enrich pedigrees, Barn Binder, and breeder reports.
- **Summary:** Expands ShowEvent entries with per-animal class placements, sanctionable awards (BOB, BOS, BIS, GCH, BOV, BOSV, RIS), judge names and notes, earned legs/points, E-Leg certificate numbers, and compressed raster E-Leg photo attachments (showResults.ts), synchronizing Animal.legsCount deltas and feeding Grand Championship progress and show honors into Male/Female reports, Barn Binder, Evans .HTM, Shareable Cards, Offline PDF pedigrees, and Herd/Pedigree/Species screens.
- **Tracked Files:** `src/domain/models.ts`, `src/domain/showResults.ts`, `src/domain/__tests__/showResults.test.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/domain/reportGenerators.ts`, `src/domain/barnBinder.ts`, `src/domain/syncAndExports.ts`, `src/domain/pdfExporter.ts`, `src/domain/shareablePedigreeCard.ts`, `src/domain/exporters/registry.ts`, `src/domain/speciesMigration.ts`, `src/domain/syncOutbox.ts`, `src/components/SpeciesDashboardScreen.tsx`, `src/components/PedigreeScreen.tsx`, `src/components/HerdScreen.tsx`

**Automated Invariants Checked:**
- `src/domain/models.ts` must contain `ShowAwardCode`, `SHOW_AWARD_OPTIONS`, `ShowELegAttachment`, `ShowAnimalResult` — *Canonical show award codes, E-Leg attachment types, and ShowEvent.results schema must stay intact.*
- `src/domain/showResults.ts` must contain `normalizeShowResults`, `sanitizeShowELegAttachment`, `computeShowLegDeltas`, `computeAnimalShowSummary` — *Pure TS show results normalization, XSS-safe E-Leg attachment sanitization, leg delta reconciliation, and GC progress calculation must remain zero-DOM.*
- `src/storage/webSqliteAdapter.ts` must contain `results_json`, `normalizeShowResults` — *SQLite shows table and idempotent schema migration must persist and normalize results_json.*
- `src/hooks/useBarnStore.ts` must contain `normalizeShowResults`, `computeShowLegDeltas` — *Store show save/delete mutations must normalize results and reconcile Animal.legsCount deltas atomically.*
- `src/domain/reportGenerators.ts` must contain `computeAnimalShowSummary`, `gcProgress`, `showWins`, `showPoints` — *Male/Female reports must aggregate show wins, points, combined legs, and Grand Champion progress automatically.*
- `src/domain/barnBinder.ts` must contain `computeAnimalShowSummary`, `Show Legs / GC Progress` — *Barn Binder must include structured show placements, judge notes, E-Leg cert numbers, and E-Leg photo thumbnails.*
- `src/domain/syncAndExports.ts` must contain `computeAnimalShowSummary`, `gcProgress.shortLabel` — *Evans .HTM pedigrees and JSON backups must carry structured ShowEvent.results and display show honors.*
- `src/domain/pdfExporter.ts` must contain `computeAnimalShowSummary`, `gcProgress.shortLabel` — *Offline PDF 1.4 pedigrees must render show legs/GC status, awards, points, and ancestor honors.*
- `src/domain/shareablePedigreeCard.ts` must contain `computeAnimalShowSummary`, `awardsSummaryText` — *Shareable pedigree cards must badge show legs, GC eligibility, awards, and points.*
- `src/components/SpeciesDashboardScreen.tsx` must contain `ShowAnimalResult`, `SHOW_AWARD_OPTIONS`, `eLegLightboxRef`, `showSubmitLock` — *Species Hub must expose the accessible Show & Results Editor Modal, multi-award toggles, E-Leg photo vault uploader, and lightbox viewer.*
- `src/components/PedigreeScreen.tsx` must contain `computeAnimalShowSummary`, `subjectShowSummary` — *PedigreeScreen must surface show honors and forward shows/careLogs to all pedigree exports.*
- `src/components/HerdScreen.tsx` must contain `computeAnimalShowSummary`, `activeAnimalShowSummary`, `eLegLightboxRef` — *HerdScreen profile must display GC progress bar, show history, E-Leg vault lightbox, and forward shows/careLogs to formal prints.*

**Restoration Playbook if Overwritten:**
1. Keep ShowAwardCode, SHOW_AWARD_OPTIONS, ShowELegAttachment, ShowAnimalResult, and ShowEvent.results in `src/domain/models.ts` plus `src/domain/showResults.ts` and `src/domain/__tests__/showResults.test.ts`.
2. Preserve `results_json` persistence/migration in `src/storage/webSqliteAdapter.ts`, leg delta reconciliation in `src/hooks/useBarnStore.ts`, and species migration/outbox handling in `speciesMigration.ts` / `syncOutbox.ts`.
3. Keep `computeAnimalShowSummary` integrations across `reportGenerators.ts`, `barnBinder.ts`, `syncAndExports.ts`, `pdfExporter.ts`, `shareablePedigreeCard.ts`, `exporters/registry.ts`, `SpeciesDashboardScreen.tsx`, `PedigreeScreen.tsx`, and `HerdScreen.tsx`.

### IMP-042: Genetic Variety / Coat Explorer Sandbox (What-If Playground in Breeding Lab)

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Let breeders experiment with hypothetical loci combinations and What-If crosses inside Breeding Lab and see predicted coat varieties, hidden carriers, and alerts without creating temporary animal records first.
- **Summary:** Adds pure TS single-genotype phenotype, hidden recessive carrier, and single-animal health/lethal alert evaluation (`evaluateSingleGenotypeSandbox`, `buildSandboxHypotheticalAnimal` in `geneticsEngine.ts`) plus the ephemeral interactive `CoatExplorerSandbox` playground inside `BreedingScreen` supporting Single Genotype and What-If Pairing Cross modes, variety presets with optional modifier checks, read-only herd/logger seeding, and interactive locus allele editing without creating temporary animal records.
- **Tracked Files:** `src/domain/geneticsEngine.ts`, `src/domain/__tests__/geneticsEngine.test.ts`, `src/components/CoatExplorerSandbox.tsx`, `src/components/BreedingScreen.tsx`

**Automated Invariants Checked:**
- `src/domain/geneticsEngine.ts` must contain `SingleGenotypeEvaluation`, `evaluateSingleGenotypeSandbox`, `buildSandboxHypotheticalAnimal` — *Pure TS Coat Explorer Sandbox evaluator and hypothetical animal shell builder must remain zero-DOM and custom-species isolated.*
- `src/components/CoatExplorerSandbox.tsx` must contain `CoatExplorerSandbox`, `evaluateSingleGenotypeSandbox`, `buildSandboxHypotheticalAnimal`, `ColorGeneticsNotice` — *Breeding Lab Coat Explorer Sandbox UI must remain strictly ephemeral (no persistence writes) with What-If Single & Cross modes and ColorGeneticsNotice.*
- `src/components/BreedingScreen.tsx` must contain `<CoatExplorerSandbox` — *BreedingScreen must mount CoatExplorerSandbox inside Breeding Lab.*

**Restoration Playbook if Overwritten:**
1. Keep `SingleGenotypeEvaluation`, `evaluateSingleGenotypeSandbox`, and `buildSandboxHypotheticalAnimal` in `src/domain/geneticsEngine.ts` with tests in `src/domain/__tests__/geneticsEngine.test.ts`.
2. Restore `src/components/CoatExplorerSandbox.tsx` with Single Genotype & What-If Cross modes, variety presets, locus selectors, and `ColorGeneticsNotice`.
3. Mount `<CoatExplorerSandbox />` inside `src/components/BreedingScreen.tsx`.

### IMP-043: Rate of Gain, Comparative Weight Charts & Litter Survival Curves

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Track kit/offspring survival rate per dam and sire, chart litter weight-gain milestones across seasons, and compare multi-animal Rate of Gain curves on an age-in-days axis with native target/goal overlays.
- **Summary:** Adds pure TS age-in-days Rate of Gain (ADG), Barn Cohort Benchmark, interpolated user-defined goal weight curves, meteorological seasonal bucketing, and dam/sire litter survival & milestone analytics (`growthAnalytics.ts`) backed by `SpeciesProfile.targetWeightCurve` and `BreedingRecord.litterWeightMilestones` across SQLite, JSON, store hooks, `GrowthAndSurvivalLab`, `BreedingScreen` Outcome milestone editor, `HerdScreen` compare actions, and the `litter-survival-performance-report`.
- **Tracked Files:** `src/domain/models.ts`, `src/domain/growthAnalytics.ts`, `src/domain/__tests__/growthAnalytics.test.ts`, `src/domain/syncAndExports.ts`, `src/domain/reportCatalog.ts`, `src/domain/reportGenerators.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/GrowthAndSurvivalLab.tsx`, `src/components/BreedingScreen.tsx`, `src/components/HerdScreen.tsx`, `src/App.tsx`

**Automated Invariants Checked:**
- `src/domain/models.ts` must contain `TargetWeightPoint`, `normalizeTargetWeightCurve`, `LitterWeightMilestone`, `normalizeLitterWeightMilestones` — *Target weight curve points and litter weight-gain milestone types/normalizers must remain intact on SpeciesProfile and BreedingRecord.*
- `src/domain/growthAnalytics.ts` must contain `evaluateLitterSurvivalAndMilestones`, `buildAnimalGrowthSeries`, `buildBarnCohortBenchmarkCurve`, `buildComparativeGrowthChartModel`, `resolveMeteorologicalSeason` — *Pure TS growth, seasonal litter survival, cohort benchmark, and comparative ADG engine must stay zero-DOM.*
- `src/storage/webSqliteAdapter.ts` must contain `target_weight_curve_json`, `litter_weight_milestones_json` — *SQLite schema and idempotent migrations must persist species target curves and breeding litter milestones.*
- `src/hooks/useBarnStore.ts` must contain `updateSpeciesTargetWeightCurve`, `openGrowthCompareForAnimals` — *Store must persist species target weight curves, litter milestones, and launch preselected multi-animal growth comparisons.*
- `src/components/GrowthAndSurvivalLab.tsx` must contain `GrowthAndSurvivalLab`, `buildComparativeGrowthChartModel`, `evaluateLitterSurvivalAndMilestones` — *GrowthAndSurvivalLab UI must expose Comparative Rate of Gain charts with goal/cohort overlays and Litter Survival & Parent Curves.*
- `src/components/BreedingScreen.tsx` must contain `<GrowthAndSurvivalLab`, `litterWeightMilestones` — *BreedingScreen must mount GrowthAndSurvivalLab and expose litter weight milestone editing inside the Outcome modal.*
- `src/domain/reportGenerators.ts` must contain `litter-survival-performance-report`, `evaluateLitterSurvivalAndMilestones` — *Reports catalog and generator must expose Litter Survival & Parent Performance Report.*

**Restoration Playbook if Overwritten:**
1. Keep `TargetWeightPoint`, `normalizeTargetWeightCurve`, `LitterWeightMilestone`, and `normalizeLitterWeightMilestones` in `src/domain/models.ts` plus `target_weight_curve_json` & `litter_weight_milestones_json` in `src/storage/webSqliteAdapter.ts` and `src/domain/syncAndExports.ts`.
2. Restore `src/domain/growthAnalytics.ts` and `src/domain/__tests__/growthAnalytics.test.ts`.
3. Keep `updateSpeciesTargetWeightCurve`, `openGrowthCompareForAnimals`, `GrowthAndSurvivalLab.tsx`, Outcome milestone inputs in `BreedingScreen.tsx`, Herd growth compare buttons in `HerdScreen.tsx` / `App.tsx`, and `litter-survival-performance-report` in `reportCatalog.ts` / `reportGenerators.ts`.

### IMP-044: Feed Inventory Ledger, Tag Lot-Number OCR & Biosecurity Auto-Purge

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Track purchased feed lots, allocate intake to pens and litters, scan feed tag stamps before deep compression with manual fallback, auto-purge heavy raw tag images after lot indexing, and keep an offline feed manufacturer recall & hotline directory.
- **Summary:** Adds strictly species-isolated `FeedBatch` & `FeedAllocation` tracking across SQLite schema v3 (`feed_batches`, `feed_allocations`), JSON/ZIP backups, data health repair, and `useBarnStore`, paired with pre-compression local OCR (`captureFeedTagWithPreCompressionOcr` + `extractFeedTagDetailsFromOcrText`) to index mill lot numbers and plant codes with manual override, configurable 30/60/90-day biosecurity auto-purge of stored tag images (`purgeExpiredFeedTagPhotosPure`), lot traceability across cages/litters/animals (`traceFeedLotToCagesAndLitters`), and an offline manufacturer emergency directory (`FEED_MANUFACTURER_DIRECTORY`).
- **Tracked Files:** `src/domain/models.ts`, `src/domain/feedInventory.ts`, `src/domain/feedManufacturerDirectory.ts`, `src/domain/__tests__/feedInventory.test.ts`, `src/storage/feedTagOcr.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/FeedLedgerScreen.tsx`, `src/components/FacilityPenBoard.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/App.tsx`

**Automated Invariants Checked:**
- `src/domain/models.ts` must contain `FeedBatch`, `FeedAllocation`, `FEED_PURGE_WINDOW_OPTIONS`, `normalizeFeedPurgeWindowDays` — *FeedBatch, FeedAllocation, and 30/60/90/0 biosecurity purge window options must remain intact in core models.*
- `src/domain/feedInventory.ts` must contain `extractFeedTagDetailsFromOcrText`, `purgeExpiredFeedTagPhotosPure`, `traceFeedLotToCagesAndLitters`, `formatFeedLedgerCsv` — *Pure TS lot OCR parser, lot-gated biosecurity purge transform, lot traceability, and CSV exporter must stay zero-DOM.*
- `src/domain/feedManufacturerDirectory.ts` must contain `FEED_MANUFACTURER_DIRECTORY`, `filterFeedManufacturerDirectory`, `matchManufacturerForBrand` — *Bundled offline manufacturer emergency & recall directory must stay accessible with zero network.*
- `src/storage/feedTagOcr.ts` must contain `captureFeedTagWithPreCompressionOcr`, `optimizeImageBlob` — *Feed tag OCR must decode and analyze full-resolution images BEFORE compact image compression.*
- `src/storage/webSqliteAdapter.ts` must contain `feed_batches`, `feed_allocations`, `saveFeedBatchesBatch` — *SQLite persistence schema and adapter methods must store and hydrate feed batches and intake allocations.*
- `src/hooks/useBarnStore.ts` must contain `saveFeedBatch`, `logFeedAllocation`, `runFeedTagBiosecurityAutoPurge` — *Store must expose species-isolated feed ledger mutations, cage stock sync, and idle biosecurity auto-purge.*
- `src/components/FeedLedgerScreen.tsx` must contain `FeedLedgerScreen`, `captureFeedTagWithPreCompressionOcr`, `FEED_MANUFACTURER_DIRECTORY` — *FeedLedgerScreen must provide purchase/OCR scanning, intake allocations, lot traceability, and offline manufacturer contacts.*
- `src/App.tsx` must contain `FeedLedgerScreen`, `route === 'feed'` — *Root router must lazy-load and mount FeedLedgerScreen on route feed.*

**Restoration Playbook if Overwritten:**
1. Keep `FeedBatch`, `FeedAllocation`, `FEED_PURGE_WINDOW_OPTIONS`, and `normalizeFeedPurgeWindowDays` in `src/domain/models.ts` plus SQLite tables in `src/storage/webSqliteAdapter.ts`.
2. Restore `src/domain/feedInventory.ts`, `src/domain/feedManufacturerDirectory.ts`, `src/domain/__tests__/feedInventory.test.ts`, and `src/storage/feedTagOcr.ts`.
3. Keep `saveFeedBatch`, `logFeedAllocation`, `runFeedTagBiosecurityAutoPurge` in `useBarnStore.ts` and mount `FeedLedgerScreen.tsx` in `SpeciesDashboardScreen.tsx`, `FacilityPenBoard.tsx`, and `App.tsx`.

### IMP-045: Offline Photo Pedigree Scanning & Local OCR Importer

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Allow breeders to snap a photo or upload JPG/PNG/WebP/PDF scans of paper pedigrees completely offline, review/correct extracted ancestor names, ear tattoos, weights, and ARBA registration numbers across 3 generations, and stage them straight into the Import Review Queue with duplicate/conflict resolution.
- **Summary:** Adds 100% offline client-side paper pedigree scanning and PDF extraction via `pdfScanExtractor.ts` (searchable `/FlateDecode` `BT...ET` text vectors with coordinates and embedded `/DCTDecode` scanned JPEG pages) plus `pedigreeOcrParser.ts` (2D bounding-box 3-col/4-col pedigree tree reconstruction and text heuristics into an editable 15-slot 3-generation draft queue backed by `PlatformImportPreview`), wired with `pedigreeOcrScanner.ts` (native Chromium `TextDetector` + lazy bounded `tesseract.js` worker with `offline_manual` fallback) into `PedigreeOcrScannerPanel.tsx` and `ExternalImporterPanel.tsx`.
- **Tracked Files:** `src/domain/importers/pdfScanExtractor.ts`, `src/domain/importers/pedigreeOcrParser.ts`, `src/domain/__tests__/pedigreeOcrParser.test.ts`, `src/storage/pedigreeOcrScanner.ts`, `src/components/PedigreeOcrScannerPanel.tsx`, `src/components/ExternalImporterPanel.tsx`, `src/components/ImportExportHubScreen.tsx`

**Automated Invariants Checked:**
- `src/domain/importers/pdfScanExtractor.ts` must contain `extractPedigreePdfPages`, `MAX_PDF_SCAN_BYTES`, `MAX_PDF_SCAN_PAGES` — *Pure TS offline PDF vector text (`BT...ET`) and embedded `/DCTDecode` JPEG extractor must remain zero-DOM.*
- `src/domain/importers/pedigreeOcrParser.ts` must contain `PEDIGREE_OCR_SLOT_DESCRIPTORS`, `parsePedigreeSlotLines`, `parsePedigreeOcrResult`, `buildPlatformImportPreviewFromOcrDrafts` — *Pure TS 2D tree/line pedigree parser and Import Review Queue preview bridge must stay zero-DOM and deterministic.*
- `src/storage/pedigreeOcrScanner.ts` must contain `scanPedigreeDocumentFile`, `tesseract.js` — *Browser OCR runner must lazy-load Tesseract worker with bounded timeout, native TextDetector precheck, and soft offline manual fallback.*
- `src/components/PedigreeOcrScannerPanel.tsx` must contain `PedigreeOcrScannerPanel`, `scanPedigreeDocumentFile`, `buildPlatformImportPreviewFromOcrDrafts` — *Scanner UI must offer camera/photo/PDF capture, editable 15-slot 3-generation review, and staging into Import Review Queue.*
- `src/components/ExternalImporterPanel.tsx` must contain `externalOcrPreview`, `onClearExternalOcrPreview` — *ExternalImporterPanel must accept staged OCR PlatformImportPreview drafts for full conflict resolution and WebP photo optimization.*
- `src/components/ImportExportHubScreen.tsx` must contain `<PedigreeOcrScannerPanel`, `stagedOcrPreview` — *ImportExportHubScreen Section 02 must mount PedigreeOcrScannerPanel connected to ExternalImporterPanel.*

**Restoration Playbook if Overwritten:**
1. Restore pure parsers `src/domain/importers/pdfScanExtractor.ts`, `src/domain/importers/pedigreeOcrParser.ts`, and `src/domain/__tests__/pedigreeOcrParser.test.ts`.
2. Restore `src/storage/pedigreeOcrScanner.ts` and `src/components/PedigreeOcrScannerPanel.tsx`.
3. Keep `externalOcrPreview`/`onClearExternalOcrPreview` props in `ExternalImporterPanel.tsx` and `<PedigreeOcrScannerPanel>` wired inside `ImportExportHubScreen.tsx`.

### IMP-046: Local Economic Ledger, Meat/Pelt Processing Yields & 4-H/FFA Project Books

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Provide offline barn bookkeeping with receipt photos, automated animal/litter P&L margins, meat/pelt carcass yield and pelt grading logs, and printable 4-H/FFA youth livestock project completion books.
- **Summary:** Adds species-isolated general barn income/expense tracking (`LedgerEntry`) with compressed receipt photo attachments (`optimizeImageFile`) and feed-lot deduplication; automated per-animal and per-litter net profit/loss margins (`computeAnimalProfitMargins`, `computeLitterProfitMargins`); meat & pelt processing logs (`ProcessingLog`) tracking butcher schedules, harvest dates, live-to-dressed carcass dress-out %, and pelt grades; 4-H/FFA Youth Project Record Books (`YouthProjectBook`) with ration feed logs, inventory changes, and printable `.HTM`/PDF completion reports (`generateYouthProjectReportHtml`); SQLite v4 persistence, sync outbox deltas, 3 new report presets, and `EconomicsLedgerScreen.tsx` accessible from Species Dashboard & `E` shortcut.
- **Tracked Files:** `src/domain/models.ts`, `src/domain/economicsLedger.ts`, `src/domain/__tests__/economicsLedger.test.ts`, `src/domain/reportCatalog.ts`, `src/domain/reportGenerators.ts`, `src/domain/syncOutbox.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/EconomicsLedgerScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/App.tsx`

**Automated Invariants Checked:**
- `src/domain/models.ts` must contain `LedgerEntry`, `LEDGER_CATEGORY_OPTIONS`, `ProcessingLog`, `PELT_GRADE_OPTIONS`, `YouthProjectBook` — *LedgerEntry, ProcessingLog, and YouthProjectBook domain models and normalizers must remain intact.*
- `src/domain/economicsLedger.ts` must contain `calculateDressOutPercent`, `computeAnimalProfitMargins`, `computeLitterProfitMargins`, `evaluateSpeciesEconomicsSummary`, `evaluateProcessingSummary`, `evaluateYouthProjectSummary`, `generateYouthProjectReportHtml` — *Pure TS economics margins, yield analytics, CSV exporters, and printable youth completion report builder must remain zero-DOM.*
- `src/storage/webSqliteAdapter.ts` must contain `ledger_entries`, `processing_logs`, `youth_project_books`, `saveLedgerEntry`, `saveProcessingLog`, `saveYouthProjectBook` — *SQLite persistence schema v4 and adapter CRUD methods must store and hydrate ledger entries, processing logs, and youth project books.*
- `src/hooks/useBarnStore.ts` must contain `saveLedgerEntry`, `saveProcessingLog`, `saveYouthProjectBook` — *Store must expose species-isolated economics, processing, and 4-H/FFA project mutations with delta outbox sync.*
- `src/components/EconomicsLedgerScreen.tsx` must contain `EconomicsLedgerScreen`, `generateYouthProjectReportHtml`, `evaluateSpeciesEconomicsSummary` — *EconomicsLedgerScreen must provide general ledger + receipt photos, meat/pelt yields, and 4-H/FFA project record books.*
- `src/App.tsx` must contain `EconomicsLedgerScreen`, `route === 'economics'` — *Root router must lazy-load and mount EconomicsLedgerScreen on route economics.*

**Restoration Playbook if Overwritten:**
1. Keep `LedgerEntry`, `ProcessingLog`, and `YouthProjectBook` interfaces and normalizers in `src/domain/models.ts` plus SQLite v4 tables in `src/storage/webSqliteAdapter.ts`.
2. Restore `src/domain/economicsLedger.ts` and `src/domain/__tests__/economicsLedger.test.ts` along with the 3 financial/production/youth presets in `reportCatalog.ts` and `reportGenerators.ts`.
3. Keep store CRUD mutations in `src/hooks/useBarnStore.ts` and wire `EconomicsLedgerScreen.tsx` into `SpeciesDashboardScreen.tsx` and `App.tsx`.

### IMP-047: Post-Crash Alignment, Ready External Exporters, Feed/Archive Parity & Android WebView Print/Share

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Realign the entire codebase after build-crash drift, keep the PWA locked to React + Vite + TypeScript, complete half-done exporters and migration/inspector coverage, and make pedigree/binder print & share work seamlessly on desktop, mobile web, and the Android WebView APK.
- **Summary:** Enforces the React PWA preservation rule in `AGENTS.md` and `prompts/master_system_prompt.md`; aligns PWA/Android versions to `0.1.0-alpha.2`; migrates `feedBatches` and `feedAllocations` during cross-species moves; surfaces v3/v4 feed, ledger, processing, and 4-H/FFA counts in `archiveInspector.ts`; implements `herdboss-transfer-bundle` (.ZIP) and `registry-worksheet-csv` (.CSV) as ready exporters; and fixes `@media print` extraction, accent-ink preservation, native wrapper Share .HTM enablement, and Android `PrintBridge.kt` offscreen HTML + landscape/portrait printing while removing the stale `PedigreePrintNotice` banner.
- **Tracked Files:** `AGENTS.md`, `.env.example`, `package.json`, `public/version.json`, `src/domain/upgradeGate.ts`, `src/domain/speciesMigration.ts`, `src/domain/archiveInspector.ts`, `src/domain/exporters/exporterTypes.ts`, `src/domain/exporters/registry.ts`, `src/native/pedigreeBridge.ts`, `src/components/PrintPreviewModal.tsx`, `src/components/ImportExportHubScreen.tsx`, `src/index.css`, `android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/MainActivity.kt`, `android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/PrintBridge.kt`, `.github/structure.txt`

**Automated Invariants Checked:**
- `AGENTS.md` must contain `Never Convert PWA Away From React` — *Workspace agent rules must lock the PWA against non-React rewrites.*
- `src/domain/speciesMigration.ts` must contain `feedBatchesMigrated`, `feedAllocationsMigrated` — *Cross-species migrations must move linked feedBatches and feedAllocations.*
- `src/domain/archiveInspector.ts` must contain `feedBatchCount`, `feedAllocationCount`, `ledgerEntryCount`, `processingLogCount`, `youthProjectBookCount` — *Pre-restore dry-run inspection must count v3/v4 feed, ledger, processing, and youth records.*
- `src/domain/exporters/registry.ts` must contain `herdboss-transfer-bundle`, `registry-worksheet-csv`, `binaryContent` — *HerdBoss Transfer Tables (.ZIP) and Breed Registry & Show Worksheets (.CSV) must stay active ready exporters.*
- `src/components/PrintPreviewModal.tsx` must contain `canShareHtmlDocument`, `extractScopedPrintCssFromRules`, `detectDocumentPrintOrientation` — *PrintPreviewModal must enable Share .HTM on native wrappers, extract @media print rules, and forward orientation/HTML to native print.*
- `android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/PrintBridge.kt` must contain `printFromBridge`, `printHtmlDocument`, `buildPrintAttributes` — *Android PrintBridge must render self-contained HTML in a hardened offscreen WebView with landscape/portrait PrintAttributes.*

**Restoration Playbook if Overwritten:**
1. Verify `AGENTS.md` and `prompts/master_system_prompt.md` keep the React PWA lock rule intact.
2. Ensure `package.json`, `public/version.json`, and `src/domain/upgradeGate.ts` match `android-wrapper/app/build.gradle.kts` (`0.1.0-alpha.2`).
3. Keep `herdboss-transfer-bundle` and `registry-worksheet-csv` in `src/domain/exporters/registry.ts` with `binaryContent` download dispatch in `ImportExportHubScreen.tsx`.
4. Keep `@media print` extraction, native Share .HTM support, and Android `PrintBridge.kt` offscreen HTML rendering intact and do not reintroduce `PedigreePrintNotice`.

### IMP-048: Hybrid Architecture Guardrails & React-Only Core PWA Lock

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** CI & Tooling (`ci-tooling`)
- **Origin:** Session Improvement
- **User Goal:** Prevent AI Studio, GitHub import triage, or contributors from misinterpreting the hybrid Kotlin Android WebView wrapper (`android-wrapper/`) as a signal to rewrite the core React PWA into Kotlin.
- **Summary:** Documents and enforces across `AGENTS.md`, `README.md`, `ARCHITECTURE.md`, `metadata.json`, `package.json`, `index.html`, `.github/structure.txt`, `.github/workflows/build-android-apk.yml`, and `android-wrapper/` (`README.md`, Gradle build files, `MainActivity.kt`) that the core PWA (`/src/`) MUST always stay React + Vite + TypeScript while `android-wrapper/` is strictly a thin hybrid WebView shell.
- **Tracked Files:** `AGENTS.md`, `README.md`, `ARCHITECTURE.md`, `metadata.json`, `package.json`, `index.html`, `android-wrapper/README.md`, `android-wrapper/build.gradle.kts`, `android-wrapper/settings.gradle.kts`, `android-wrapper/app/build.gradle.kts`, `android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/MainActivity.kt`, `.github/structure.txt`, `.github/workflows/build-android-apk.yml`

**Automated Invariants Checked:**
- `AGENTS.md` must contain `Core PWA MUST Always Stay in React`, `NEVER recode the site in Kotlin` — *AGENTS.md must explicitly define the hybrid wrapper boundary and forbid Kotlin rewrites during bootability recovery.*
- `README.md` must contain `Core PWA MUST Always Stay in React`, `Never Recode the PWA in Kotlin` — *Root README must immediately clarify the React + Vite + TypeScript core PWA vs thin android-wrapper/ split.*
- `ARCHITECTURE.md` must contain `Critical Hybrid Architecture Boundary`, `Never Convert PWA Away From React` — *ARCHITECTURE.md must define the thin Kotlin WebView shell vs mandatory React PWA architecture.*
- `metadata.json` must contain `React + Vite + TypeScript offline-first PWA`, `thin hybrid Kotlin WebView shell` — *AI Studio metadata.json must state that the core app is a React + Vite + TypeScript PWA.*
- `package.json` must contain `React + Vite + TypeScript offline-first PWA` — *package.json description must identify the React + Vite + TypeScript PWA stack and thin hybrid wrapper.*
- `index.html` must contain `NEVER CONVERT THIS PWA AWAY FROM REACT` — *HTML entry point must carry an explicit guard comment against converting the PWA into Kotlin.*
- `android-wrapper/README.md` must contain `Thin Hybrid Shell ONLY`, `NEVER convert, rewrite, or recode the core PWA into Kotlin` — *android-wrapper/ must explicitly warn readers that it is only a thin WebView container.*
- `android-wrapper/app/build.gradle.kts` must contain `CRITICAL HYBRID BOUNDARY` — *Android Gradle config must mark itself as a thin WebView shell packaging the React PWA.*

**Restoration Playbook if Overwritten:**
1. Ensure `AGENTS.md`, `README.md`, `ARCHITECTURE.md`, `metadata.json`, `package.json`, and `index.html` explicitly lock the core PWA to React + Vite + TypeScript.
2. Keep `android-wrapper/README.md` and the `CRITICAL HYBRID BOUNDARY` headers in `android-wrapper/build.gradle.kts`, `settings.gradle.kts`, `app/build.gradle.kts`, and `MainActivity.kt`.

### IMP-049: Client CRM, Buyer Waitlist, Reservations & Deposit Reminders

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Track buyer contacts, waitlist queues, animal/litter reservations, deposit due reminders, and printable sales agreements offline without cloud dependencies.
- **Summary:** Adds species-isolated local-first breeder CRM tracking buyer contacts (`ClientContact`), ranked waitlist inquiries (`WaitlistEntry`) with live unreserved animal/pairing match scoring (`findWaitlistMatches`), animal/litter-pick reservations (`AnimalReservation`) with sequential agreement numbering and deposit/balance progress (`evaluateReservationFinancials`), automated overdue/due/upcoming follow-up reminders (`evaluateCrmFollowUpReminders`) with 1-click Master Task creation, XSS-safe printable Sales Agreements with optional breeder logo and active withdrawal disclosures (`generateSalesAgreementHtml`), SQLite v5 persistence, sync outbox deltas, 2 CRM report presets, and `ClientCrmScreen.tsx` accessible from Species Dashboard & `C` shortcut.
- **Tracked Files:** `src/domain/models.ts`, `src/domain/clientCrm.ts`, `src/domain/__tests__/clientCrm.test.ts`, `src/domain/reportCatalog.ts`, `src/domain/reportGenerators.ts`, `src/domain/syncOutbox.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/ClientCrmScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/App.tsx`

**Automated Invariants Checked:**
- `src/domain/models.ts` must contain `ClientContact`, `WaitlistEntry`, `AnimalReservation`, `RESERVATION_STATUSES`, `WAITLIST_STATUSES` — *ClientContact, WaitlistEntry, and AnimalReservation domain models and normalizers must remain intact.*
- `src/domain/clientCrm.ts` must contain `evaluateReservationFinancials`, `evaluateCrmFollowUpReminders`, `findWaitlistMatches`, `generateSalesAgreementHtml`, `formatReservationsCsv` — *Pure TS CRM financial evaluation, automated follow-up reminders, waitlist matching, CSV export, and printable Sales Agreement generator must stay zero-DOM.*
- `src/storage/webSqliteAdapter.ts` must contain `client_contacts`, `waitlist_entries`, `animal_reservations`, `saveClientContact`, `saveWaitlistEntry`, `saveAnimalReservation` — *SQLite schema v5 and adapter CRUD methods must store and hydrate CRM contacts, waitlist entries, and reservations.*
- `src/hooks/useBarnStore.ts` must contain `saveClientContact`, `saveWaitlistEntry`, `saveAnimalReservation`, `completeReservationSale`, `createCrmReminderTask` — *Store must expose species-isolated CRM mutations, atomic sale completion, and reminder task creation with delta outbox sync.*
- `src/components/ClientCrmScreen.tsx` must contain `ClientCrmScreen`, `generateSalesAgreementHtml`, `evaluateCrmFollowUpReminders`, `findWaitlistMatches` — *ClientCrmScreen must render reminders, reservation/deposit tracking, ranked waitlist matching, client directory, and printable sales agreements.*
- `src/App.tsx` must contain `ClientCrmScreen`, `route === 'crm'` — *Root router must lazy-load and mount ClientCrmScreen on route crm.*

**Restoration Playbook if Overwritten:**
1. Keep `ClientContact`, `WaitlistEntry`, and `AnimalReservation` interfaces and normalizers in `src/domain/models.ts` plus SQLite v5 tables in `src/storage/webSqliteAdapter.ts`.
2. Restore `src/domain/clientCrm.ts` and `src/domain/__tests__/clientCrm.test.ts` along with the 2 CRM presets in `reportCatalog.ts` and `reportGenerators.ts`.
3. Keep CRM mutations in `src/hooks/useBarnStore.ts` and wire `ClientCrmScreen.tsx` into `SpeciesDashboardScreen.tsx` and `App.tsx`.

### IMP-050: Alternative Certificates, Show Entry/Remark Cards & IAGARB Wool/Fiber Tracking

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Support alternative companion birth/breeding certificates, printable/emailable show documents directly from show rosters, family portrait & IAGARB Angora pedigree templates, and wool/fiber harvest logging.
- **Summary:** Adds privacy-scoped Pet-Sale Birth Certificates (omitting breeder contact info & pricing), official Breeding/Service Certificates, ARBA-style Show Entry Forms (`mailto:` + plain-text copy + Open/Youth/fees) & 4-up/1-up Show Remark Cards from ShowEvent rosters, Gen 0–2 multi-photo Family Portrait and IAGARB German Angora pedigree layouts, and SQLite v6 `wool_harvests` tracking via lazy-loaded `WoolHarvestPanel` with 7-position 100-pt IAGARB scoring and 90-day 325g shearing yield calculations.
- **Tracked Files:** `src/domain/models.ts`, `src/domain/woolFiber.ts`, `src/domain/alternativeCertificates.ts`, `src/domain/showDocuments.ts`, `src/domain/pedigreePrintStyles.ts`, `src/domain/syncAndExports.ts`, `src/domain/pdfExporter.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/PrintPreviewModal.tsx`, `src/components/WoolHarvestPanel.tsx`, `src/components/HerdScreen.tsx`, `src/components/PedigreeScreen.tsx`, `src/components/BreedingScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/App.tsx`, `src/domain/__tests__/woolFiber.test.ts`, `src/domain/__tests__/alternativeCertificates.test.ts`, `src/domain/__tests__/showDocuments.test.ts`

**Automated Invariants Checked:**
- `src/domain/models.ts` must contain `WoolHarvest`, `IagarbScorecard`, `WOOL_HARVEST_METHODS`, `normalizeWoolHarvestMethod` — *WoolHarvest and IagarbScorecard domain models and normalizers must remain intact.*
- `src/domain/woolFiber.ts` must contain `IAGARB_JUDGING_POSITIONS`, `computeIagarbScoreTotal`, `evaluateIagarbEligibility`, `compute90DayEquivalentGrams`, `summarizeAnimalWoolHarvests` — *Pure TS IAGARB 100-point rubric, 325g/90-day performance yield normalization, and harvest summary calculators must stay zero-DOM.*
- `src/domain/alternativeCertificates.ts` must contain `generatePetBirthCertificateHtml`, `generateBreedingCertificateHtml`, `buildPetBirthCertificateFileName`, `buildBreedingCertificateFileName` — *Pure TS Pet-Sale Birth Certificate (no breeder contact/pricing) and Breeding Certificate generators must remain zero-DOM and XSS-safe.*
- `src/domain/showDocuments.ts` must contain `generateShowEntryFormHtml`, `generateShowRemarkCardsHtml`, `buildShowEntryMailtoUrl`, `buildShowEntryPlainTextSummary` — *Pure TS ARBA Show Entry Form, emailable plain-text/mailto dispatchers, and 4-up/1-up Remark Card generators must remain zero-DOM.*
- `src/domain/pedigreePrintStyles.ts` must contain `family_portrait`, `iagarb_angora` — *Family Portrait and IAGARB German Angora pedigree presets must stay registered.*
- `src/storage/webSqliteAdapter.ts` must contain `wool_harvests`, `saveWoolHarvest`, `deleteWoolHarvest` — *SQLite schema v6 must store and hydrate wool_harvests cleanly.*
- `src/hooks/useBarnStore.ts` must contain `saveWoolHarvest`, `deleteWoolHarvest` — *Store must expose species-isolated wool harvest mutations with delta outbox sync.*
- `src/components/WoolHarvestPanel.tsx` must contain `WoolHarvestPanel`, `onSaveWoolHarvest`, `IAGARB_JUDGING_POSITIONS` — *WoolHarvestPanel must provide lazy-loaded Wool / Fiber logging and IAGARB 100-pt judging scorecards.*
- `src/components/HerdScreen.tsx` must contain `generatePetBirthCertificateHtml`, `onSaveWoolHarvest`, `WoolHarvestPanel` — *HerdScreen must provide Pet-Sale Birth Certificate previews and mount WoolHarvestPanel.*
- `src/components/BreedingScreen.tsx` must contain `generateBreedingCertificateHtml`, `Breeding Cert` — *BreedingScreen must expose Breeding Certificate preview controls.*
- `src/components/SpeciesDashboardScreen.tsx` must contain `generateShowEntryFormHtml`, `generateShowRemarkCardsHtml`, `buildShowEntryMailtoUrl` — *SpeciesDashboardScreen must expose Show Entry Form and Remark Cards print/email previews directly from ShowEvents.*

**Restoration Playbook if Overwritten:**
1. Keep `WoolHarvest` and `IagarbScorecard` models in `src/domain/models.ts` and `wool_harvests` SQLite v6 schema in `src/storage/webSqliteAdapter.ts`.
2. Restore pure modules `src/domain/woolFiber.ts`, `src/domain/alternativeCertificates.ts`, and `src/domain/showDocuments.ts` with their unit tests.
3. Keep `family_portrait` & `iagarb_angora` rendering in `pedigreePrintStyles.ts`, `syncAndExports.ts`, and `pdfExporter.ts`, plus UI wiring in `WoolHarvestPanel.tsx`, `HerdScreen.tsx`, `PedigreeScreen.tsx`, `BreedingScreen.tsx`, `SpeciesDashboardScreen.tsx`, and `App.tsx`.

### IMP-051: Founder Loss / Heritability Analytics, Interactive Barn Scheduler Gantt & LAN P2P Outbox Sync

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Provide heritability trends, founder-loss analytics, drag-and-drop chore scheduling with smart escalation, and serverless LAN P2P outbox sync.
- **Summary:** Wires pure TypeScript path-summed founder & ancestor genetic contributions (`0.5^depth`), Lacy effective founders (`fe`), Lost/Endangered/Active founder bottleneck ledger, and mid-parent OLS heritability (`h²`) cohort trends (`pedigreeAnalytics.ts`) via lazy-loaded `FounderAndHeritabilityPanel` into both `PedigreeScreen.tsx` and `BreedingScreen.tsx`; wires pure UTC multi-day Gantt timeline, smart critical priority escalation (`barnScheduler.ts`), SQLite `barn_tasks.start_date_iso` persistence, `useBarnStore` task rescheduling/escalation/reconciliation mutations, and zero-server WebRTC DataChannel & folder delta reconciliation (`p2pSyncProtocol.ts`, `p2pLanChannel.ts`) via lazy-loaded `BarnSchedulerGantt` inside `SpeciesDashboardScreen.tsx`.
- **Tracked Files:** `src/domain/models.ts`, `src/domain/pedigreeAnalytics.ts`, `src/domain/barnScheduler.ts`, `src/domain/p2pSyncProtocol.ts`, `src/storage/p2pLanChannel.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/FounderAndHeritabilityPanel.tsx`, `src/components/BarnSchedulerGantt.tsx`, `src/components/PedigreeScreen.tsx`, `src/components/BreedingScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/App.tsx`, `src/domain/__tests__/pedigreeAnalytics.test.ts`, `src/domain/__tests__/barnScheduler.test.ts`, `src/domain/__tests__/p2pSyncProtocol.test.ts`

**Automated Invariants Checked:**
- `src/domain/pedigreeAnalytics.ts` must contain `analyzeAnimalFounderContributions`, `analyzePairingFounderShift`, `analyzeSpeciesFounderLoss`, `analyzeSpeciesHeritabilityTrends` — *Pure TS founder contribution, effective founders fe, founder-loss ledger, and heritability h² calculators must remain zero-DOM.*
- `src/domain/barnScheduler.ts` must contain `evaluateTaskPriorityEscalation`, `buildPriorityEscalationUpdates`, `buildBarnGanttTimeline`, `shiftTaskDatesByDays`, `resizeTaskStartDateByDays` — *Pure TS Gantt timeline builder, UTC span shift/resize helpers, and critical-task escalation engine must remain zero-DOM.*
- `src/domain/p2pSyncProtocol.ts` must contain `encodeP2pSignalToken`, `decodeP2pSignalToken`, `createP2pDeltaWireMessage`, `parseP2pWireOrDeltaPayload`, `summarizeTaskReconciliation` — *Pure TS LAN P2P CP-LAN1 signaling codec, wire delta framing, and reconciliation summary helpers must remain intact.*
- `src/storage/p2pLanChannel.ts` must contain `supportsLanWebRtcP2p`, `createLanP2pSession`, `reconcileWithPickedSyncFolder` — *Zero-server WebRTC DataChannel (iceServers: []) and Sync Folder reconciliation bridge must remain wired.*
- `src/storage/webSqliteAdapter.ts` must contain `start_date_iso` — *SQLite barn_tasks table must persist and hydrate startDateIso across reloads.*
- `src/hooks/useBarnStore.ts` must contain `rescheduleTask`, `applySmartTaskEscalations`, `reconcileP2pOutboxOps` — *Store must expose serialized mutations for Gantt rescheduling, smart priority escalation, and P2P outbox reconciliation.*
- `src/components/FounderAndHeritabilityPanel.tsx` must contain `FounderAndHeritabilityPanel`, `analyzeSpeciesFounderLoss`, `analyzeSpeciesHeritabilityTrends` — *FounderAndHeritabilityPanel must render subject founder balance, herd bottleneck ledger, and cohort h² SVG trends.*
- `src/components/BarnSchedulerGantt.tsx` must contain `BarnSchedulerGantt`, `buildBarnGanttTimeline`, `createLanP2pSession` — *BarnSchedulerGantt must render interactive drag/resize Gantt lanes, smart escalations, and LAN P2P sync controls.*
- `src/components/PedigreeScreen.tsx` must contain `FounderAndHeritabilityPanel`, `mode="pedigree"` — *PedigreeScreen must lazy-mount FounderAndHeritabilityPanel in pedigree mode.*
- `src/components/BreedingScreen.tsx` must contain `FounderAndHeritabilityPanel`, `mode="breeding"` — *BreedingScreen must lazy-mount FounderAndHeritabilityPanel in breeding mode.*
- `src/components/SpeciesDashboardScreen.tsx` must contain `BarnSchedulerGantt`, `taskViewMode`, `onReconcileOutboxOps` — *SpeciesDashboardScreen must expose List/Gantt chore view switching and mount lazy-loaded BarnSchedulerGantt.*

**Restoration Playbook if Overwritten:**
1. Keep pure domain engines `src/domain/pedigreeAnalytics.ts`, `src/domain/barnScheduler.ts`, `src/domain/p2pSyncProtocol.ts`, `src/storage/p2pLanChannel.ts`, and their Vitest suites intact.
2. Keep `barn_tasks.start_date_iso` in `src/storage/webSqliteAdapter.ts` and `rescheduleTask`, `applySmartTaskEscalations`, and `reconcileP2pOutboxOps` in `src/hooks/useBarnStore.ts`.
3. Keep lazy-loaded `FounderAndHeritabilityPanel` mounted in `PedigreeScreen.tsx` & `BreedingScreen.tsx` and lazy-loaded `BarnSchedulerGantt` toggled inside `SpeciesDashboardScreen.tsx` & wired from `App.tsx`.

### IMP-052: Post-Import Bootability, Bundle Hygiene, Atomic SQLite Migrations & Memory Hardening

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Harden post-import booting stability, first-paint loading speed, bundle footprint, and mobile memory management without breaking offline-first guarantees.
- **Summary:** Restores `.env.example` (IMP-008), archives 3.6 MB AI Studio dumps out of `public/` into `docs/archive/aistudio-exports/`, enforces `NODE_ENV=production` in Android APK CI, removes explicit `: any` annotations (fixing a silent `AFTER_BRED` backup-parser bug), makes `index.html` preflight treat missing `indexedDB` as advisory so Safari Lockdown / Private Mode can enter Ephemeral Mode, loads Google Fonts asynchronously, arms boot-stability completion only after React store hydration (`!store.isLoading`), upgrades SQLite migrations to version-gated atomic `BEGIN`/`COMMIT`/`ROLLBACK` transactions with `PRAGMA table_info` checks and `{ lightweightPhotos: true }` pre-upgrade backups, bypasses OPFS `/tmp` staging for `<512 KB` iOS standalone PWA shares to preserve user activation, extracts pure `src/engine/binaryEncoding.ts` + eliminates all 3 Vite `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings + configures vendor/icon Rolldown code-splitting, defers non-critical startup probes/auto-repair off first paint, scopes `syncOperations` React state to sync-consuming routes, replaces `document.body` `MutationObserver` with `subscribeOpenDialogCount`, stabilizes `AnimalPhotoGallery` lazy hydration, and dehydrates Tier 3 mirror photos.
- **Tracked Files:** `.env.example`, `.github/workflows/build-android-apk.yml`, `index.html`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/engine/binaryEncoding.ts`, `src/domain/deviceCapability.ts`, `src/domain/syncAndExports.ts`, `src/storage/storageProbes.ts`, `src/storage/opfsStorage.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/utils/webFileActions.ts`, `src/utils/useAccessibleDialog.ts`, `src/components/AnimalPhotoGallery.tsx`, `src/components/CrashErrorBoundary.tsx`, `src/components/TechyStuffErrorBoundary.tsx`, `src/storage/__tests__/postImportHardening.test.ts`

**Automated Invariants Checked:**
- `.env.example` must contain `# No required environment variables.` — *Keep .env.example present with zero secret placeholders to satisfy IMP-008.*
- `.github/workflows/build-android-apk.yml` must contain `NODE_ENV: production` — *Android APK CI must force NODE_ENV=production so jsx-dev-runtime never ships in APK assets.*
- `index.html` must contain `indexedDbAvailable`, `media="print"`, `this.media='all'` — *Preflight must allow Safari Lockdown/Private Ephemeral Mode and keep Google Fonts non-render-blocking.*
- `vite.config.ts` must contain `codeSplitting`, `vendor-react`, `vendor-icons`, `vendor-sql` — *Rolldown code-splitting must isolate vendor chunks and consolidate lucide-react micro-chunks.*
- `src/engine/binaryEncoding.ts` must contain `utf8StringToBytes`, `bytesToUtf8String`, `bytesToBase64Pure`, `base64ToBytesPure`, `dataUrlToBinary`, `binaryToDataUrl` — *Pure TS binary/base64/dataURL encoding helpers must stay decoupled from fflate and DOM.*
- `src/storage/webSqliteAdapter.ts` must contain `PRAGMA table_info(`, `BEGIN TRANSACTION;`, `ROLLBACK;`, `this.loadSnapshotUnlocked({ lightweightPhotos: true })` — *SQLite migrations must be version-gated, PRAGMA-checked, atomic, and memory-bounded during pre-upgrade backups.*
- `src/storage/storageProbes.ts` must contain `registerIndexedDbOpfsDumper`, `triggerIndexedDbOpfsDump` — *Shared callback registry avoids circular dynamic import warnings for opfsStorage.*
- `src/utils/webFileActions.ts` must contain `shouldBypassOpfsForIosGesture` — *Small (<512 KB) iOS standalone PWA shares must bypass OPFS /tmp staging to preserve tap gesture activation.*
- `src/utils/useAccessibleDialog.ts` must contain `getOpenDialogCount`, `subscribeOpenDialogCount` — *Dialog count subscription replaces document.body MutationObserver in App.tsx.*
- `src/App.tsx` must contain `subscribeOpenDialogCount`, `__PEDIGREE_MARK_BOOT_STABLE__`, `routeKey="calendar-sync-confirm"` — *Root shell must mark boot stable after store hydration, track dialogs via subscription, and guard CalendarSyncConfirmModal.*
- `src/hooks/useBarnStore.ts` must contain `isSyncOperationsRoute`, `ensureMaxRevIndexInitialized`, `import('../domain/archiveInspector')` — *Store must defer non-critical startup probes, scope syncOperations state to sync routes, and dynamic-import cold modules.*
- `src/components/AnimalPhotoGallery.tsx` must contain `hydratedUrlsRef`, `inFlightPhotoIdsRef` — *Photo gallery lazy hydration must guard duplicate requests via refs instead of self-retriggering effect deps.*

**Restoration Playbook if Overwritten:**
1. Keep `.env.example` clean, keep AI Studio dumps archived in `docs/archive/aistudio-exports/` (never under `public/`), and preserve `NODE_ENV: production` in `.github/workflows/build-android-apk.yml`.
2. Preserve advisory `indexedDbAvailable` preflight & async Google Fonts in `index.html`, post-hydration `__PEDIGREE_MARK_BOOT_STABLE__` in `src/App.tsx`, and atomic `PRAGMA table_info` migrations in `src/storage/webSqliteAdapter.ts`.
3. Keep `src/engine/binaryEncoding.ts`, `triggerIndexedDbOpfsDump` in `storageProbes.ts`, `shouldBypassOpfsForIosGesture` in `webFileActions.ts`, `subscribeOpenDialogCount` in `useAccessibleDialog.ts`, Rolldown `codeSplitting` in `vite.config.ts`, and route-scoped `syncOperations` + deferred startup work in `useBarnStore.ts`.

### IMP-053: v0.1.0-alpha.2 Release Readiness: Targeted Strict TS, Cold-Start Splits, Worker Freeze Trim, Unified PWA+APK Release CI & Prompt Governance

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Prepare Community Pedigree cleanly for its v0.1.0-alpha.2 GitHub release tag with zero new features—optimizing cold-start payload, compiler strictness, mobile worker memory cleanup, unified PWA+Android APK release packaging, plan deletion on wrap-up, and mandatory improvement logging for significant changes.
- **Summary:** Enables 7 targeted strict TypeScript compiler checks in `tsconfig.json` (`alwaysStrict`, `noImplicitAny`, `noImplicitThis`, `strictBindCallApply`, `strictFunctionTypes`, `useUnknownInCatchVariables`, `noFallthroughCasesInSwitch`), converts Excel serial date parsing in `src/engine/codecs/archiveAndCsvUtils.ts` to calendar-safe `Date.UTC(1899, 11, 30 + serial)`, splits 7 cold domain modules (`barnBench`, `barnScheduler`, `p2pSyncProtocol`, `clientCrm`, `economicsLedger`, `feedInventory`, `importers/conflictResolver`) out of the initial entry bundle in `src/hooks/useBarnStore.ts`, hooks `src/storage/offThreadWorkerClient.ts` into `registerFreezeLifecycleListener` to terminate idle Web Workers immediately on mobile background hide/`pagehide`, upgrades `.github/workflows/release.yml` to verify cross-file version alignment (`0.1.0-alpha.2`), verify root + subpath builds, and attach both PWA `.zip` + `.sha256` and Android WebView `.apk` + `.sha256` artifacts to GitHub Releases, syncs `public/version.json`, Fastlane changelog, and release guides, updates `prompts/master_system_prompt.md` (and backlog/crash prompts) to delete wrapped-up plans and log every significant boot/load/memory change in `IMPROVEMENTS.md`, and removes completed crash-era plan files from `docs/archive/`.
- **Tracked Files:** `tsconfig.json`, `src/engine/codecs/archiveAndCsvUtils.ts`, `src/hooks/useBarnStore.ts`, `src/storage/offThreadWorkerClient.ts`, `.github/workflows/release.yml`, `public/version.json`, `fastlane/metadata/android/en-US/changelogs/1.txt`, `docs/HOW_TO_CREATE_A_RELEASE.md`, `.github/WORKFLOWS_GUIDE.md`, `README.md`, `prompts/master_system_prompt.md`, `prompts/start_new_backlog_prompt.md`, `prompts/resume_backlog_plan_prompt.md`, `prompts/fix_error_log_prompt.md`, `src/domain/__tests__/releaseReadiness.test.ts`

**Automated Invariants Checked:**
- `tsconfig.json` must contain `"noImplicitAny": true`, `"strictFunctionTypes": true`, `"useUnknownInCatchVariables": true`, `"noFallthroughCasesInSwitch": true` — *Targeted strict TypeScript checks must remain enabled to catch implicit-any and untyped catch regressions before release.*
- `src/engine/codecs/archiveAndCsvUtils.ts` must contain `Date.UTC(1899, 11, 30 + serial)` — *Excel serial date decoding must use explicit Date.UTC calendar offset math instead of raw millisecond addition.*
- `src/hooks/useBarnStore.ts` must contain `import('../domain/economicsLedger')`, `import('../domain/clientCrm')`, `import('../domain/barnBench')`, `import('../domain/barnScheduler')`, `import('../domain/p2pSyncProtocol')`, `import('../domain/feedInventory')`, `import('../domain/importers/conflictResolver')` — *Cold domain modules must remain dynamically imported inside async store handlers to keep the initial entry bundle lean.*
- `src/storage/offThreadWorkerClient.ts` must contain `terminateIdleArchiveWorker`, `archive-worker-freeze-trim`, `registerFreezeLifecycleListener` — *Idle archive/import Web Workers must terminate promptly on background hide/pagehide to release mobile RAM.*
- `.github/workflows/release.yml` must contain `Verify cross-file version alignment`, `release-android-apk:`, `publish-github-release:`, `release-pwa-dist` — *GitHub tag releases must verify version sync and package + attach both the PWA ZIP and Android WebView APKs with SHA-256 checksums.*
- `prompts/master_system_prompt.md` must contain `Plan Lifecycle (Delete on Wrap-Up)`, `Mandatory Improvement Logging (`IMPROVEMENTS.md` & `src/domain/improvementRegistry.ts`)` — *Master System Prompt must enforce deleting wrapped-up plan files and logging every significant boot/load/memory change in IMPROVEMENTS.md.*

**Restoration Playbook if Overwritten:**
1. Keep targeted strict TypeScript flags in `tsconfig.json` and calendar-safe `Date.UTC(1899, 11, 30 + serial)` in `src/engine/codecs/archiveAndCsvUtils.ts`.
2. Preserve dynamic `import(...)` lazy splits for the 7 cold modules in `src/hooks/useBarnStore.ts` and `terminateIdleArchiveWorker` background-freeze cleanup in `src/storage/offThreadWorkerClient.ts`.
3. Keep unified PWA ZIP + Android WebView APK + SHA-256 packaging and version-alignment checks in `.github/workflows/release.yml`, and retain the Plan Lifecycle and Mandatory Improvement Logging rules in `prompts/master_system_prompt.md`.

### IMP-054: Zero-Server Breeder Showcase & For-Sale Catalog Exporter

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Let breeders mark eligible livestock For Sale with asking price and buyer notes, configure public contact details in Barn Settings, and export a self-contained static HTML storefront & printable buyer stock sheet without any server.
- **Summary:** Adds `forSale`, `askingPriceCents`, and `saleNotes` fields plus `isAnimalAvailableForSale()` on `Animal`, optional public contact/tagline fields on `BarnSettings` (`breederEmail`, `breederPhone`, `breederLocation`, `breederWebsite`, `showcaseTagline`), `sanitizeSafeExternalHttpUrl()` + sync field allowlists in `inputSanitization.ts`, JSON v6 backup round-trip in `syncAndExports.ts`, atomic SQLite schema v7 migration (`for_sale`, `asking_price_cents`, `sale_notes` + `extra_settings_json`) in `webSqliteAdapter.ts`, pure TypeScript `src/domain/breederShowcase.ts` static HTML catalog + printable stock sheet generator (photos, 2-gen pedigrees, COI%, show/wool/carrier disclosures, reservation hold badges, medication withdrawal holds, QR badge, zero-dependency progressive search/filter, and XSS/SVG-safe sanitization), registers `breeder-showcase-html` in `src/domain/exporters/registry.ts`, adds For-Sale listing controls in `AnimalEditorModal.tsx`, breeder contact inputs in `SettingsAndSyncScreen.tsx`, `For Sale` herd filter + preview toggles in `HerdScreen.tsx`, and showcase photo hydration in `ImportExportHubScreen.tsx`.
- **Tracked Files:** `src/domain/models.ts`, `src/domain/inputSanitization.ts`, `src/domain/breederShowcase.ts`, `src/domain/exporters/registry.ts`, `src/domain/syncAndExports.ts`, `src/storage/webSqliteAdapter.ts`, `src/components/AnimalEditorModal.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/components/HerdScreen.tsx`, `src/components/ImportExportHubScreen.tsx`, `src/domain/__tests__/breederShowcase.test.ts`

**Automated Invariants Checked:**
- `src/domain/models.ts` must contain `isAnimalAvailableForSale`, `forSale?: boolean`, `breederEmail?: string` — *Animal For-Sale eligibility helper and BarnSettings showcase contact fields must stay intact.*
- `src/domain/inputSanitization.ts` must contain `sanitizeSafeExternalHttpUrl` — *Showcase website links must enforce strict http/https protocol sanitization.*
- `src/domain/breederShowcase.ts` must contain `buildBreederShowcaseResult`, `generateBreederShowcaseHtml`, `buildBreederShowcaseFileName` — *Pure TypeScript zero-server showcase HTML + stock sheet generator must stay decoupled from DOM.*
- `src/domain/exporters/registry.ts` must contain `breeder-showcase-html`, `buildBreederShowcaseResult` — *Import/Export Hub exporter registry must retain breeder-showcase-html.*
- `src/domain/syncAndExports.ts` must contain `breederEmail`, `askingPriceCents` — *JSON backup parser must preserve breeder contact info and animal asking prices.*
- `src/storage/webSqliteAdapter.ts` must contain `SQLITE_SCHEMA_VERSION`, `for_sale`, `asking_price_cents` — *SQLite schema v7+ must persist and migrate For-Sale columns and contact settings atomically.*
- `src/components/AnimalEditorModal.tsx` must contain `askingPriceInput`, `saleNotes` — *Animal editor must expose For-Sale toggle, asking price, and buyer-facing listing notes.*
- `src/components/SettingsAndSyncScreen.tsx` must contain `breederEmail`, `showcaseTagline` — *Barn settings must expose public showcase contact info and catalog tagline.*
- `src/components/HerdScreen.tsx` must contain `For-Sale Catalog`, `generateBreederShowcaseHtml` — *Herd screen must expose For-Sale filter pill and live PrintPreviewModal catalog toggles.*
- `src/components/ImportExportHubScreen.tsx` must contain `breeder-showcase-html` — *Import/Export Hub must hydrate photos on Tier 2+ devices for breeder-showcase-html exports.*

**Restoration Playbook if Overwritten:**
1. Restore `BarnSettings` contact fields, `Animal` for-sale fields, and `isAnimalAvailableForSale` in `src/domain/models.ts`, plus `sanitizeSafeExternalHttpUrl` and sync field allowlists in `src/domain/inputSanitization.ts`.
2. Restore `src/domain/breederShowcase.ts`, register `breeder-showcase-html` in `src/domain/exporters/registry.ts`, preserve JSON round-trip in `src/domain/syncAndExports.ts`, and retain SQLite schema v7 columns in `src/storage/webSqliteAdapter.ts`.
3. Keep For-Sale controls in `AnimalEditorModal.tsx`, breeder contact settings in `SettingsAndSyncScreen.tsx`, For-Sale catalog preview/filter in `HerdScreen.tsx`, photo hydration in `ImportExportHubScreen.tsx`, and unit tests in `src/domain/__tests__/breederShowcase.test.ts`.

### IMP-055: Health Reference Wiki Links, Local Veterinary PDF Folder Pointer & External Backup Reminders

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Provide curated online links to external rabbit and livestock health wikis alongside a simple local device folder pointer for personal offline veterinary PDFs, paired with periodic reminders to back up external document folders.
- **Summary:** Adds a pure TypeScript curated health wiki index and reminder engine (`src/domain/healthReference.ts`) covering all 11 predefined species plus custom species substring resolution with strict `https://` URL sanitization (`sanitizeSafeExternalHttpUrl`); adds generic named directory-handle helpers in `src/storage/localSyncChannels.ts` reusing the existing `sync_handles` IDB store without bumping schema version; creates `src/storage/vetDocsFolder.ts` for read-only folder handle persistence, bounded depth/entry PDF scanning (`MAX_VET_PDF_SCAN_DEPTH = 2`, `MAX_VET_PDF_ENTRIES = 250`), path-note persistence, and configurable backup reminder cadence (`14/30/60/90` days + `7d` snooze); integrates full wipe/reset cleanup in `src/hooks/useBarnStore.ts`; builds lazy-loaded `HealthReferencePanel` & `HealthReferenceModal` with offline notice, disabled-with-explanation fallback on unsupported browsers (`IMP-019`), direct file-picker fallback, single-PDF `<iframe>` preview + `URL.revokeObjectURL` lifecycle cleanup; and wires periodic reminder banners and launchers into `App.tsx`, `SpeciesDashboardScreen.tsx`, `HerdScreen.tsx`, and `SettingsAndSyncScreen.tsx`.
- **Tracked Files:** `src/domain/healthReference.ts`, `src/storage/localSyncChannels.ts`, `src/storage/vetDocsFolder.ts`, `src/hooks/useBarnStore.ts`, `src/components/HealthReferencePanel.tsx`, `src/App.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/components/HerdScreen.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/domain/__tests__/healthReference.test.ts`, `src/storage/__tests__/vetDocsFolder.test.ts`

**Automated Invariants Checked:**
- `src/domain/healthReference.ts` must contain `HEALTH_WIKI_REFERENCES`, `getHealthWikiLinksForSpecies`, `evaluateVetDocsBackupReminder`, `filterAndSortVetPdfEntries`, `normalizeVetDocsFolderMeta` — *Pure TypeScript health wiki directory and external PDF folder backup reminder evaluator must remain DOM-free and strict https:// validated.*
- `src/storage/localSyncChannels.ts` must contain `saveNamedDirectoryHandleToIdb`, `loadNamedDirectoryHandleFromIdb`, `deleteNamedDirectoryHandleFromIdb`, `queryDirectoryHandleReadPermission` — *Shared IDB sync_handles accessors allow vetDocsFolder persistence without bumping the IDB schema version.*
- `src/storage/vetDocsFolder.ts` must contain `VET_DOCS_HANDLE_KEY`, `VET_DOCS_META_LS_KEY`, `connectVetDocsFolder`, `scanVetDocsDirectory`, `markVetDocsBackedUpNow`, `clearAllVetDocsFolderState` — *Vet PDF folder adapter must persist read-only directory handles, scan PDFs safely, track backup acknowledgments, and support full factory reset cleanup.*
- `src/hooks/useBarnStore.ts` must contain `clearAllVetDocsFolderState` — *Factory reset and sync-state wipe flows must clear stored vet PDF handles and metadata.*
- `src/components/HealthReferencePanel.tsx` must contain `HealthReferencePanel`, `HealthReferenceModal`, `platformBridge.openExternalUrl`, `URL.revokeObjectURL` — *Lazy health reference modal must route external links through IPlatformBridge and deterministically revoke PDF blob URLs.*
- `src/App.tsx` must contain `HealthReferenceModal`, `vetDocsReminder.showBanner`, `onOpenHealthReference` — *App shell must lazy-load HealthReferenceModal, surface periodic external PDF folder backup reminders, and pass launcher handlers to screens.*
- `src/components/SpeciesDashboardScreen.tsx` must contain `onOpenHealthReference` — *Species Dashboard must expose quick Health Wikis & Vet PDFs launcher.*
- `src/components/HerdScreen.tsx` must contain `onOpenHealthReference` — *Animal Health Journal must expose contextual Health Wikis & Vet PDFs launcher.*
- `src/components/SettingsAndSyncScreen.tsx` must contain `onOpenHealthReference` — *Barn Settings must expose Health Reference Wikis & Local Vet PDF Folder launcher.*

**Restoration Playbook if Overwritten:**
1. Restore pure TypeScript wiki links, species matcher, and reminder math in `src/domain/healthReference.ts` and tests in `src/domain/__tests__/healthReference.test.ts`.
2. Keep generic `saveNamedDirectoryHandleToIdb`/`loadNamedDirectoryHandleFromIdb`/`deleteNamedDirectoryHandleFromIdb` in `src/storage/localSyncChannels.ts` and restore `src/storage/vetDocsFolder.ts` + `src/storage/__tests__/vetDocsFolder.test.ts`.
3. Keep `clearAllVetDocsFolderState()` cleanup in `src/hooks/useBarnStore.ts`, lazy `HealthReferenceModal` + reminder banner in `src/App.tsx`, and `onOpenHealthReference` launchers in `SpeciesDashboardScreen.tsx`, `HerdScreen.tsx`, and `SettingsAndSyncScreen.tsx`.

### IMP-056: Restricted Health Wiki Article Sources Blocklist (House Rabbit Society & Custom Rules)

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Maintain a restricted sources list for health wiki article connections starting with House Rabbit Society.
- **Summary:** Removes House Rabbit Society (`rabbit.org`) from curated health wiki links and introduces a pure TypeScript restricted wiki sources engine (`DEFAULT_RESTRICTED_WIKI_SOURCES`, `findMatchingRestrictedWikiSource`, `isHealthWikiSourceRestricted`, `filterAllowedHealthWikiReferences`, `normalizeRestrictedWikiSources`) in `src/domain/healthReference.ts`; persists user-added custom restricted sources in `localStorage` via `src/storage/vetDocsFolder.ts` while keeping built-in restrictions locked; enforces click-time blocking and exposes a collapsible Restricted Wiki Sources manager inside `src/components/HealthReferencePanel.tsx`.
- **Tracked Files:** `src/domain/healthReference.ts`, `src/storage/vetDocsFolder.ts`, `src/components/HealthReferencePanel.tsx`, `src/domain/__tests__/healthReference.test.ts`, `src/storage/__tests__/vetDocsFolder.test.ts`

**Automated Invariants Checked:**
- `src/domain/healthReference.ts` must contain `DEFAULT_RESTRICTED_WIKI_SOURCES`, `restricted-house-rabbit-society`, `findMatchingRestrictedWikiSource`, `filterAllowedHealthWikiReferences`, `normalizeRestrictedWikiSources` — *House Rabbit Society must remain on the built-in restricted wiki sources list and excluded from curated health wiki links.*
  - Forbidden regression: `wiki-rabbit-hrs`
- `src/storage/vetDocsFolder.ts` must contain `RESTRICTED_WIKI_SOURCES_LS_KEY`, `readRestrictedWikiSources`, `addCustomRestrictedWikiSource`, `removeCustomRestrictedWikiSource` — *Custom restricted wiki sources must persist locally without allowing built-in restricted entries to be deleted.*
- `src/components/HealthReferencePanel.tsx` must contain `Restricted Wiki Sources`, `findMatchingRestrictedWikiSource`, `handleAddRestrictedSource` — *Health Reference panel must enforce restricted source checks at click time and let users view/manage restricted sources.*

**Restoration Playbook if Overwritten:**
1. Restore `DEFAULT_RESTRICTED_WIKI_SOURCES` (with `House Rabbit Society` / `rabbit.org`), `findMatchingRestrictedWikiSource`, and `filterAllowedHealthWikiReferences` in `src/domain/healthReference.ts`.
2. Restore `readRestrictedWikiSources`, `addCustomRestrictedWikiSource`, and `removeCustomRestrictedWikiSource` in `src/storage/vetDocsFolder.ts`.
3. Restore the click-time `findMatchingRestrictedWikiSource` guard and collapsible `Restricted Wiki Sources` manager in `src/components/HealthReferencePanel.tsx`.

### IMP-057: Preferred Wiki Sources, English USA (en-US) App Locale & Multi-Language Wiki Filter

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Create a preferred sources list for health wiki links (Merck Veterinary Manual, USDA & equivalent federal agencies in all countries, and state/federal/land-grant universities in all countries), define the app locale as English USA (en-US), and require English wiki sources via an extensible multi-language array.
- **Summary:** Defines `APP_LOCALE = 'en-US'` (`APP_LOCALE_METADATA`, `normalizeBcp47LanguageTag`, `extractBaseLanguageCode`) in `src/domain/models.ts` and updates `index.html` + `vite.config.ts` PWA manifest to `en-US`; adds `DEFAULT_PREFERRED_WIKI_SOURCES` (`Merck Veterinary Manual`, global federal ag/vet agencies, and global state/federal/land-grant universities), `DEFAULT_ALLOWED_WIKI_LANGUAGES = ['en']`, `doesWikiLanguageMatchAllowed`, `normalizeAllowedWikiLanguages`, `findMatchingPreferredWikiSource`, and `sortHealthWikiReferencesWithPreferred` in `src/domain/healthReference.ts`; persists custom preferred sources and multi-language arrays in `src/storage/vetDocsFolder.ts`; and renders preferred source prioritization and management inside `src/components/HealthReferencePanel.tsx`.
- **Tracked Files:** `src/domain/models.ts`, `index.html`, `vite.config.ts`, `src/domain/healthReference.ts`, `src/storage/vetDocsFolder.ts`, `src/components/HealthReferencePanel.tsx`, `src/domain/__tests__/healthReference.test.ts`, `src/storage/__tests__/vetDocsFolder.test.ts`

**Automated Invariants Checked:**
- `src/domain/models.ts` must contain `APP_LOCALE = 'en-US'`, `APP_LOCALE_METADATA`, `normalizeBcp47LanguageTag`, `extractBaseLanguageCode` — *Application code and translation baseline must remain explicitly typed as English (United States) `en-US`.*
- `index.html` must contain `<html lang="en-US">` — *Root HTML document language must declare English USA (`en-US`).*
- `vite.config.ts` must contain `lang: 'en-US'` — *PWA web app manifest must declare `lang: "en-US"`.*
- `src/domain/healthReference.ts` must contain `DEFAULT_PREFERRED_WIKI_SOURCES`, `DEFAULT_ALLOWED_WIKI_LANGUAGES`, `doesWikiLanguageMatchAllowed`, `normalizeAllowedWikiLanguages`, `findMatchingPreferredWikiSource`, `sortHealthWikiReferencesWithPreferred` — *Preferred sources (Merck, global federal ag/vet agencies, global universities) and configurable multi-language English filtering must remain intact.*
- `src/storage/vetDocsFolder.ts` must contain `PREFERRED_WIKI_SOURCES_LS_KEY`, `ALLOWED_WIKI_LANGUAGES_LS_KEY`, `readPreferredWikiSources`, `readAllowedWikiLanguages`, `setAllowedWikiLanguages` — *Custom preferred wiki sources and multi-language wiki filters must persist locally with built-in locking.*
- `src/components/HealthReferencePanel.tsx` must contain `Preferred Wiki Sources`, `findMatchingPreferredWikiSource`, `handleAddPreferredSource`, `APP_LOCALE` — *Health Reference panel must surface preferred source badges, language requirements, and preferred source management.*

**Restoration Playbook if Overwritten:**
1. Restore `APP_LOCALE = 'en-US'` and BCP 47 helpers in `src/domain/models.ts`, `<html lang="en-US">` in `index.html`, and `lang: 'en-US'` in `vite.config.ts`.
2. Restore `DEFAULT_PREFERRED_WIKI_SOURCES`, `DEFAULT_ALLOWED_WIKI_LANGUAGES`, and language/preferred matching + sorting in `src/domain/healthReference.ts`.
3. Restore `readPreferredWikiSources`/`readAllowedWikiLanguages`/`setAllowedWikiLanguages` in `src/storage/vetDocsFolder.ts` and UI controls in `src/components/HealthReferencePanel.tsx`.

### IMP-058: Breeding Calendar Moon/Holiday/Weather Overlays, Mileage & Tax Report Log & Personal Barn Journal

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Add offline moon-phase and holiday markers plus an optional online 7-day weather forecast strip to the Breeding Calendar, track IRS-deductible farm/show mileage with annual tax reports, and add a date-organized Personal Barn Journal with rich text notes, color categories, star ratings, and full-text search.
- **Summary:** Introduces pure TypeScript `src/domain/breedingCalendar.ts` (synodic moon-phase engine, Gregorian Easter & US/seasonal holiday calculator, monthly calendar grid builder, WMO code mapping) paired with strictly opt-in Open-Meteo client `src/storage/weatherForecast.ts` and `src/components/BreedingCalendarPanel.tsx` inside `BreedingScreen.tsx`; creates `src/domain/mileageTaxLog.ts` (IRS standard mileage presets, integer-cent deduction calculations, formula-safe CSV and XSS-safe annual tax HTML) with `src/components/MileageTaxPanel.tsx` inside `EconomicsLedgerScreen.tsx`; builds `src/domain/barnJournal.ts` (rich-text AST notes via `parseMemoBlocks`, color categories, 0–5 star ratings, pinning, `#tag` hygiene, multi-token full-text search, Markdown/CSV/Print exports) and `src/components/BarnJournalScreen.tsx` at route `journal`; and persists `mileage_logs`, `journal_entries`, and `weatherForecast` settings across SQLite schema v8 (`webSqliteAdapter.ts`), JSON v5/ZIP exports, sample-data purging, cross-species migration, and delta sync outbox (`IMP-025`).
- **Tracked Files:** `src/domain/models.ts`, `src/domain/breedingCalendar.ts`, `src/domain/mileageTaxLog.ts`, `src/domain/barnJournal.ts`, `src/storage/weatherForecast.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/components/BreedingCalendarPanel.tsx`, `src/components/MileageTaxPanel.tsx`, `src/components/BarnJournalScreen.tsx`, `src/components/BreedingScreen.tsx`, `src/components/EconomicsLedgerScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/App.tsx`, `src/domain/__tests__/breedingCalendar.test.ts`, `src/domain/__tests__/mileageTaxLog.test.ts`, `src/domain/__tests__/barnJournal.test.ts`

**Automated Invariants Checked:**
- `src/domain/breedingCalendar.ts` must contain `computeMoonPhaseForDateIso`, `getHolidaysForYear`, `buildBreedingCalendarMonth`, `formatTemperatureForUnit` — *Pure TypeScript moon-phase, holiday, and monthly calendar computation must stay DOM-free and UTC-deterministic.*
- `src/storage/weatherForecast.ts` must contain `searchWeatherLocations`, `fetchWeeklyWeatherForecast`, `clearWeatherForecastCache` — *Optional Open-Meteo 7-day forecast client must respect connectivity checks, cache TTL, and reset clearing.*
- `src/domain/mileageTaxLog.ts` must contain `computeMileageLogDeductionCents`, `evaluateAnnualMileageTaxSummary`, `exportMileageTaxCsv`, `generateAnnualMileageTaxHtml` — *IRS mileage tax deduction calculations and formula/HTML-escaped annual exports must remain pure TypeScript.*
- `src/domain/barnJournal.ts` must contain `normalizeBarnJournalEntry`, `filterAndSearchJournalEntries`, `groupJournalEntriesByMonthAndDate`, `exportBarnJournalMarkdown`, `generateBarnJournalHtml` — *Personal Barn Journal search, grouping, tag normalization, and exports must remain DOM-free and AST-sanitized.*
- `src/storage/webSqliteAdapter.ts` must contain `SQLITE_SCHEMA_VERSION`, `mileage_logs`, `journal_entries` — *SQLite schema must create and migrate mileage_logs and journal_entries tables atomically.*
- `src/hooks/useBarnStore.ts` must contain `saveMileageLog`, `deleteMileageLog`, `saveJournalEntry`, `deleteJournalEntry` — *Store must expose persisted CRUD mutators for mileage logs and journal entries.*
- `src/App.tsx` must contain `BarnJournalScreen`, `route === 'journal'` — *App router must lazy-load and mount BarnJournalScreen at route journal.*

**Restoration Playbook if Overwritten:**
1. Restore types (`MileageLog`, `BarnJournalEntry`, `WeatherForecastSettings`) in `src/domain/models.ts` plus pure engines `breedingCalendar.ts`, `mileageTaxLog.ts`, and `barnJournal.ts`.
2. Restore `src/storage/weatherForecast.ts`, SQLite schema v8 (`mileage_logs`, `journal_entries`) in `webSqliteAdapter.ts`, and CRUD actions in `useBarnStore.ts`.
3. Restore `BreedingCalendarPanel.tsx` in `BreedingScreen.tsx`, `MileageTaxPanel.tsx` in `EconomicsLedgerScreen.tsx`, and `BarnJournalScreen.tsx` at route `journal` in `App.tsx`.

### IMP-059: The Judge's Notebook (Dedicated Show Judge Module)

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Species & Herd UX (`species-ux`)
- **Origin:** Session Improvement
- **User Goal:** Add an optional module for show judges to manage assigned show dates, club contacts, travel mileage, judging expenses, bid statuses, and judging contracts.
- **Summary:** Introduces optional show-judge models (`enableJudgeNotebook`, `JudgeClubContact`, `JudgeAssignment`, `JudgeExpense`) in `src/domain/models.ts`; implements pure TypeScript DOM-free engine `src/domain/judgeNotebook.ts` (normalizers, draft factories, double-booking date conflict detection, `MileageLog`-integrated financials & reimbursements, annual summary, formula-safe CSV exports, and XSS-escaped printable HTML Judging Agreements & Annual Summary Reports); persists `judge_clubs`, `judge_assignments`, and `judge_expenses` tables across SQLite schema v9 (`webSqliteAdapter.ts`), JSON/ZIP backups, delta sync outbox, sample-data purging, species migration, and health repair; exposes store CRUD actions in `src/hooks/useBarnStore.ts`; and renders opt-in `src/components/JudgeNotebookScreen.tsx` at route `judge` (`G` shortcut) with dashboard and Settings toggles.
- **Tracked Files:** `src/domain/models.ts`, `src/domain/judgeNotebook.ts`, `src/storage/storageAdapter.ts`, `src/storage/webSqliteAdapter.ts`, `src/domain/syncOutbox.ts`, `src/domain/inputSanitization.ts`, `src/domain/syncAndExports.ts`, `src/domain/backupArchive.ts`, `src/domain/backupStatus.ts`, `src/domain/backupVault.ts`, `src/domain/sampleData.ts`, `src/domain/speciesMigration.ts`, `src/domain/dataHealthCheck.ts`, `src/hooks/useBarnStore.ts`, `src/components/JudgeNotebookScreen.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/App.tsx`, `src/domain/__tests__/judgeNotebook.test.ts`

**Automated Invariants Checked:**
- `src/domain/models.ts` must contain `enableJudgeNotebook?: boolean`, `JudgeClubContact`, `JudgeAssignment`, `JudgeExpense` — *BarnSettings must preserve the optional enableJudgeNotebook flag alongside Judge domain interfaces.*
- `src/domain/judgeNotebook.ts` must contain `detectJudgeDateConflicts`, `evaluateJudgeAssignmentFinancials`, `summarizeJudgeNotebook`, `exportJudgeAssignmentsCsv`, `generateJudgeContractHtml`, `generateJudgeSummaryReportHtml` — *Pure TypeScript Judge Notebook conflict checks, mileage/expense calculations, CSV exports, and XSS-safe HTML contracts must remain DOM-free.*
- `src/storage/webSqliteAdapter.ts` must contain `SQLITE_SCHEMA_VERSION = 9`, `judge_clubs`, `judge_assignments`, `judge_expenses`, `enableJudgeNotebook` — *SQLite schema v9 must create, migrate, and persist judge_clubs, judge_assignments, judge_expenses, and enableJudgeNotebook.*
- `src/hooks/useBarnStore.ts` must contain `saveJudgeClub`, `deleteJudgeClub`, `saveJudgeAssignment`, `deleteJudgeAssignment`, `saveJudgeExpense`, `deleteJudgeExpense` — *Store must expose outbox-tracked CRUD mutators for Judge clubs, assignments, and expenses.*
- `src/components/JudgeNotebookScreen.tsx` must contain `JudgeNotebookScreen`, `detectJudgeDateConflicts`, `generateJudgeContractHtml`, `PrintPreviewModal` — *JudgeNotebookScreen must provide the opt-in gate, conflict alerts, financial tabs, and printable contract preview.*
- `src/App.tsx` must contain `JudgeNotebookScreen`, `route === 'judge'` — *App router must lazy-load and mount JudgeNotebookScreen at route 'judge'.*

**Restoration Playbook if Overwritten:**
1. Restore Judge types and `enableJudgeNotebook` in `src/domain/models.ts` plus pure engine `src/domain/judgeNotebook.ts`.
2. Restore SQLite schema v9 tables (`judge_clubs`, `judge_assignments`, `judge_expenses`) in `webSqliteAdapter.ts` and sync/export wiring.
3. Restore CRUD methods in `useBarnStore.ts`, `JudgeNotebookScreen.tsx`, Settings toggle, Dashboard launcher, and route `judge` in `App.tsx`.

### IMP-060: Optional Cloud App-Folder Sync (Google Drive AppFolder / OneDrive AppRoot) & 403/507 Quota Circuit Breaker

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Diagnostics & Sync (`diagnostics-sync`)
- **Origin:** Session Improvement
- **User Goal:** Support strictly optional app-folder cloud delta sync with tight-storage incremental chunking and an immediate 403/507 quota circuit breaker that protects local IndexedDB writes.
- **Summary:** Adds strictly opt-in personal cloud sync (`enabled: false` by default, zero Firebase, zero `.env` secrets) targeting isolated Google Drive `appDataFolder` and OneDrive `special/approot` directories using memory-only OAuth tokens and PKCE; plans incremental delta chunks that automatically downshift to tight-storage chunking (`25 ops / 48 KiB`) when storage usage or device tier is constrained; and intercepts HTTP 403/507 quota responses with an immediate persistent circuit breaker that pauses automated cloud syncs, prunes oldest rolling cloud backups, surfaces persistent banners in `App.tsx` and Sync panels, and never blocks or rolls back local IndexedDB writes.
- **Tracked Files:** `src/domain/cloudAppFolderSync.ts`, `src/storage/cloudAppFolderSync.ts`, `src/hooks/useBarnStore.ts`, `src/components/CloudAppFolderSyncPanel.tsx`, `src/components/ImportExportHubScreen.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/App.tsx`, `src/domain/__tests__/cloudAppFolderSync.test.ts`, `src/storage/__tests__/cloudAppFolderSync.test.ts`

**Automated Invariants Checked:**
- `src/domain/cloudAppFolderSync.ts` must contain `planIncrementalCloudDeltaChunks`, `classifyCloudHttpResponse`, `tripCloudQuotaCircuitBreaker`, `selectRollingCloudBackupsToPrune`, `shouldRunAutomatedCloudSync` — *Pure TypeScript incremental delta chunk planner, HTTP 403/507 classifier, circuit breaker state machine, and rolling backup pruner must remain DOM-free.*
- `src/storage/cloudAppFolderSync.ts` must contain `memoryTokensByProvider`, `createGoogleDriveAppFolderTransport`, `createOneDriveAppRootTransport`, `runCloudAppFolderSync` — *Cloud app-folder transport must keep OAuth tokens strictly in JS memory, isolate appDataFolder/approot, and never block or roll back local IndexedDB writes.*
- `src/hooks/useBarnStore.ts` must contain `executeCloudAppFolderSync`, `scheduleBackgroundCloudSync`, `resetAndRetryCloudSync`, `dismissCloudCircuitBreakerWarning` — *Store must schedule non-blocking background cloud delta sync after outbox commits and expose manual sync, reset-and-retry, and warning dismissal controls.*
- `src/components/CloudAppFolderSyncPanel.tsx` must contain `CloudAppFolderSyncPanel`, `Reset Circuit Breaker`, `Sync Cloud App-Folder Now` — *Cloud App-Folder Sync panel must provide opt-in provider/token controls, tight-storage chunk indicators, and circuit breaker reset actions.*
- `src/App.tsx` must contain `store.cloudSyncState.circuitBreaker.tripped`, `store.dismissCloudCircuitBreakerWarning`, `cloudSyncState={store.cloudSyncState}` — *App shell must display the persistent global 403/507 quota circuit breaker warning banner and wire cloud sync state into ImportExportHubScreen and SettingsAndSyncScreen.*

**Restoration Playbook if Overwritten:**
1. Restore pure chunking, HTTP 403/507 classification, and circuit breaker state helpers in `src/domain/cloudAppFolderSync.ts`.
2. Restore memory-only OAuth token store, Google Drive/OneDrive transports, and cross-tab-locked coordinator in `src/storage/cloudAppFolderSync.ts`.
3. Restore non-blocking `scheduleBackgroundCloudSync`, `CloudAppFolderSyncPanel.tsx`, and global persistent circuit breaker warning banner in `useBarnStore.ts`, `ImportExportHubScreen.tsx`, `SettingsAndSyncScreen.tsx`, and `App.tsx`.

### IMP-061: Developer Console Tabbed Reorganization, Collapsible Subunits & OPFS/Runtime Telemetry

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Diagnostics & Sync (`diagnostics-sync`)
- **Origin:** Session Improvement
- **User Goal:** Optimize the developer page, identify and surface unadded useful internal tools, organize the workspace into clean tabbed and collapsible subunits with a header Open All toggle to improve UI/UX.
- **Summary:** Reorganizes "The Techy Stuff" (`TechyStuffScreen.tsx`) with an always-open title header containing an "Open All Sections / Collapse All Sections" toggle, 4 segmented workspace tabs (`Storage & OPFS`, `Runtime & Sync`, `Logs & Support`, `Maintenance & Resets`), and 15 individually collapsible subunits (`createDefaultSubunitOpenMap(false)` — including the host telemetry bar, the permanent non-closeable 5-tier comparison matrix `data-permanent-tier-hierarchy="true"`, and modular `DiagnosticsAndSupportPanel` `visibleSections` + `collapsible` cards). Surfaces previously unexposed storage and runtime utilities: read-only OPFS `/tmp`/`/backups`/`/archives` inspector (`inspectOpfsNamespaces`), OPFS canary & orphan sweep controls, Prior-Use Sentinel & prune sync warning status, 20-collection `computeSnapshotCollectionFootprint`, 14-signal browser compatibility matrix, idle Archive Worker heap reclaim, live IDB/BroadcastChannel/WebLocks/OPFS handle counters (`getTrackedActiveResourceCounts`, `getActiveOpfsHandleCount`), Freeze Queue controls, clock skew causality & release manifest diff, Sync Outbox/Cloud breaker status, and Native Bridge event log.
- **Tracked Files:** `src/domain/techyStuffGuardrails.ts`, `src/domain/__tests__/techyStuffGuardrails.test.ts`, `src/storage/storageProbes.ts`, `src/storage/opfsTempStream.ts`, `src/storage/opfsStorage.ts`, `src/components/DiagnosticsAndSupportPanel.tsx`, `src/components/TechyStuffScreen.tsx`, `src/App.tsx`

**Automated Invariants Checked:**
- `src/domain/techyStuffGuardrails.ts` must contain `DEVELOPER_CONSOLE_TABS`, `DEVELOPER_CONSOLE_SUBUNIT_IDS`, `createDefaultSubunitOpenMap`, `normalizeDeveloperConsoleTab`, `computeSnapshotCollectionFootprint` — *Pure TypeScript developer console tab registry, 15-subunit collapsible state helpers, and 20-collection snapshot footprint calculator must remain DOM-free.*
- `src/storage/storageProbes.ts` must contain `getTrackedActiveResourceCounts` — *Storage probes must expose live IDB connection/transaction, BroadcastChannel, and Web Lock resource counts for runtime inspection.*
- `src/storage/opfsStorage.ts` must contain `inspectOpfsNamespaces`, `getActiveOpfsHandleCount`, `getActiveTempFiles` — *OPFS storage adapter must expose read-only namespace inspection across /tmp, /backups, and /archives alongside live OPFS handle counters.*
- `src/components/DiagnosticsAndSupportPanel.tsx` must contain `visibleSections`, `collapsible` — *DiagnosticsAndSupportPanel must support section filtering (`all`, `logs-and-support`, `maintenance`) and optional collapsible outer wrapping without breaking standalone rendering.*
- `src/components/TechyStuffScreen.tsx` must contain `DEVELOPER_CONSOLE_TABS`, `DEVELOPER_CONSOLE_SUBUNIT_IDS`, `createDefaultSubunitOpenMap`, `Open All Sections`, `inspectOpfsNamespaces`, `computeSnapshotCollectionFootprint`, `detectCurrentBrowserCompatibility`, `getTrackedActiveResourceCounts` — *TechyStuffScreen must keep the title header open with an Open All Sections toggle, make all 15 subunits collapsible, and surface OPFS inspection, snapshot footprint, browser compatibility matrix, and live handle telemetry.*
- `src/App.tsx` must contain `syncOperations={store.syncOperations}`, `backupSyncStatus={store.backupSyncStatus}` — *App shell must pass live sync outbox operations and backup sync folder status into TechyStuffScreen.*

**Restoration Playbook if Overwritten:**
1. Restore `DEVELOPER_CONSOLE_TABS`, `DEVELOPER_CONSOLE_SUBUNIT_IDS`, `createDefaultSubunitOpenMap`, `normalizeDeveloperConsoleTab`, and `computeSnapshotCollectionFootprint` in `src/domain/techyStuffGuardrails.ts`.
2. Restore `getTrackedActiveResourceCounts` in `src/storage/storageProbes.ts`, plus `getActiveOpfsHandleCount`, `getActiveTempFiles`, and `inspectOpfsNamespaces` in `src/storage/opfsTempStream.ts` and `src/storage/opfsStorage.ts`.
3. Restore `visibleSections` and `collapsible` props in `src/components/DiagnosticsAndSupportPanel.tsx`, the collapsible 15-subunit tabbed workspace layout + header Open All toggle + telemetry cards in `src/components/TechyStuffScreen.tsx`, and live sync props in `src/App.tsx`.

### IMP-062: Alpha-to-Release Optimization: CI & Android APK Hardening, IndexedDB Quota Recovery, Print Stage XSS Sanitization & Sub-500kB Bundle Splits

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Prepare Community Pedigree from Alpha to release with zero new features by fixing highest-risk CI, storage, security, and cold-start bundle bottlenecks while guaranteeing bootability.
- **Summary:** Restores clean `.env.example` (IMP-008/IMP-052); scopes `NODE_ENV: production` strictly to the Vite build step in `.github/workflows/build-android-apk.yml` so `npm install` never skips `devDependencies` (`vitest`, `tsx`, `typescript`, `vite-plugin-pwa`); adds `status.json` to Android `PedigreeAssetPathHandler.kt` `Cache-Control: no-cache`; implements `executeIdbWriteWithQuotaRecovery` in `src/storage/webSqliteAdapter.ts` to purge OPFS `/tmp` and non-essential fallback caches and retry once on `QuotaExceededError`; hardens `#barn-print-stage` in `src/components/PrintPreviewModal.tsx` with `sanitizePrintStageHtml` + DOM node/attribute scrubbing; decouples `src/domain/backupVault.ts` from `backupArchive.ts` via direct `./binaryEncoding` imports (eliminating Vite `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings); converts cold imports (`geneticsEngine`, `syncAndExports`, `weatherForecast`) in `src/hooks/useBarnStore.ts` and `improvementRegistry` (~206 kB) in `src/components/DiagnosticsAndSupportPanel.tsx` to on-demand dynamic imports; and refines Rolldown `codeSplitting` groups with `includeDependenciesRecursively: false` in `vite.config.ts`, cutting `index-*.js` from 645 kB to 350 kB (-45.8%) and `TechyStuffScreen` from 339 kB to 136 kB (-59.9%) with zero Vite >500 kB chunk warnings.
- **Tracked Files:** `.env.example`, `.github/workflows/build-android-apk.yml`, `android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/PedigreeAssetPathHandler.kt`, `src/storage/webSqliteAdapter.ts`, `src/components/PrintPreviewModal.tsx`, `src/domain/backupVault.ts`, `src/hooks/useBarnStore.ts`, `src/components/DiagnosticsAndSupportPanel.tsx`, `vite.config.ts`, `src/utils/__tests__/printPreviewHelpers.test.ts`, `src/domain/__tests__/releaseReadiness.test.ts`

**Automated Invariants Checked:**
- `.github/workflows/build-android-apk.yml` must contain `Install PWA dependencies & run verification suite`, `Build production PWA bundle (root path)`, `NODE_ENV: production` — *Android APK CI must install devDependencies without NODE_ENV=production and apply NODE_ENV=production strictly to the Vite production build step.*
- `android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/PedigreeAssetPathHandler.kt` must contain `resolvedPath == "status.json"` — *Android WebView asset handler must serve status.json with Cache-Control: no-cache alongside version.json.*
- `src/storage/webSqliteAdapter.ts` must contain `executeIdbWriteWithQuotaRecovery`, `purgeOpfsTmp` — *Primary IndexedDB writes must catch QuotaExceededError, purge OPFS /tmp and non-essential fallback caches, and retry once before failing.*
- `src/components/PrintPreviewModal.tsx` must contain `sanitizePrintStageHtml` — *Print stage DOM mounting must strip executable tags, inline event handlers, and dangerous URLs before inserting HTML into #barn-print-stage.*
- `src/domain/backupVault.ts` must contain `from './binaryEncoding'` — *backupVault.ts must import binary encoding helpers directly from binaryEncoding.ts instead of pulling backupArchive.ts into the startup graph.*
- `src/components/DiagnosticsAndSupportPanel.tsx` must contain `loadImprovementRegistryModule`, `import('../domain/improvementRegistry')` — *DiagnosticsAndSupportPanel must lazy-load the 200+ kB improvementRegistry manifest on demand instead of bloating TechyStuffScreen.*
- `vite.config.ts` must contain `storage-sqlite`, `core-backups`, `improvement-registry`, `includeDependenciesRecursively: false` — *Rolldown codeSplitting must isolate app storage, backup, domain, and registry chunks with includeDependenciesRecursively: false so no chunk exceeds 500 kB.*

**Restoration Playbook if Overwritten:**
1. Keep `.env.example` clean, keep `NODE_ENV: production` scoped only to `npm run build` in `.github/workflows/build-android-apk.yml`, and preserve `resolvedPath == "status.json"` no-cache handling in `PedigreeAssetPathHandler.kt`.
2. Preserve `executeIdbWriteWithQuotaRecovery` in `src/storage/webSqliteAdapter.ts` and `sanitizePrintStageHtml` in `src/components/PrintPreviewModal.tsx`.
3. Keep `backupVault.ts` importing from `./binaryEncoding`, keep dynamic imports of `geneticsEngine`, `syncAndExports`, and `weatherForecast` in `src/hooks/useBarnStore.ts`, keep lazy `loadImprovementRegistryModule` in `DiagnosticsAndSupportPanel.tsx`, and retain isolated Rolldown `codeSplitting` groups in `vite.config.ts`.

### IMP-063: Mobile Chrome Dev Preview Boot Memory Guard: Inline Sourcemap Stripping, Direct Lucide Icon ESM & Lazy Error-Boundary Export

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Fix mobile Chrome Preview iframe Aw Snap crashes on startup by eliminating excessive dev-mode JS parse memory and inline source map bloat.
- **Summary:** Adds dev-only `devInlineSourcemapStripPlugin` (stripping ~9.5 MB of base64 inline sourcemaps from served JS/CSS responses) and `devLucideDirectImportPlugin` + `optimizeDeps.exclude: ['lucide-react']` (rewriting `lucide-react` barrel imports to direct per-icon ESM files and eliminating the 3.72 MB monolithic icon bundle and 504 dep re-optimization errors) in `vite.config.ts`, while deferring `syncAndExports` imports in `CrashErrorBoundary.tsx` and `TechyStuffErrorBoundary.tsx` to click handlers—cutting dev boot payload from 13.52 MB to 3.05 MB (-77.4%) with zero production build changes.
- **Tracked Files:** `vite.config.ts`, `src/components/CrashErrorBoundary.tsx`, `src/components/TechyStuffErrorBoundary.tsx`

**Automated Invariants Checked:**
- `vite.config.ts` must contain `devInlineSourcemapStripPlugin`, `devLucideDirectImportPlugin`, `exclude: ['lucide-react']` — *Dev preview must strip multi-megabyte base64 inline sourcemaps and resolve lucide-react icons directly without pre-bundling all 1,600+ icons so mobile Chrome preview iframes do not OOM.*
- `src/components/CrashErrorBoundary.tsx` must contain `import('../domain/syncAndExports')` — *CrashErrorBoundary mounts at root and must load formatTimestampedBackupSlug dynamically on click rather than eagerly pulling syncAndExports into startup.*
  - Forbidden regression: `from '../domain/syncAndExports'`
- `src/components/TechyStuffErrorBoundary.tsx` must contain `import('../domain/syncAndExports')` — *TechyStuffErrorBoundary mounts in App.tsx and must load formatTimestampedBackupSlug dynamically on click rather than eagerly pulling syncAndExports into startup.*
  - Forbidden regression: `from '../domain/syncAndExports'`

**Restoration Playbook if Overwritten:**
1. Keep `devLucideDirectImportPlugin()`, `devInlineSourcemapStripPlugin()`, and `optimizeDeps.exclude: ['lucide-react']` in `vite.config.ts`.
2. Keep dynamic `import('../domain/syncAndExports')` inside crash log download handlers in `CrashErrorBoundary.tsx` and `TechyStuffErrorBoundary.tsx`.

### IMP-064: GitHub Pages Deployment, Subpath Routing & Search Engine Optimization (SEO)

- **Release Milestone:** Alpha 2 (`alpha-2`)
- **Category:** CI & Tooling (`ci-tooling`)
- **Origin:** Session Improvement
- **User Goal:** Optimize all GitHub Pages for utility, setup, social preview cards, and search engine discoverability.
- **Summary:** Enhances GitHub Pages delivery and SEO discovery: configures GitHub repository description, homepage URL, and 16 topics; optimizes index.html with keyword-rich meta tags, canonical link, Open Graph preview tags, Twitter summary card, and Schema.org WebApplication structured data; creates public/robots.txt, public/sitemap.xml, and public/404.html SPA router fallback; updates deploy-pages.yml to trigger on both main and release branches while verifying robots.txt, sitemap.xml, and 404.html in distribution; and adds GitHub Pages status badges and direct web app launch links to README.md and package.json.
- **Tracked Files:** `index.html`, `public/robots.txt`, `public/sitemap.xml`, `public/404.html`, `.github/workflows/deploy-pages.yml`, `README.md`, `package.json`

**Automated Invariants Checked:**
- `index.html` must contain `https://askkim.github.io/Pedigree/`, `application/ld+json`, `og:image`, `twitter:card`, `rel="canonical"` — *index.html must maintain canonical, OpenGraph, Twitter card, and Schema.org structured data for SEO.*
- `public/robots.txt` must contain `User-agent: *`, `Sitemap: https://askkim.github.io/Pedigree/sitemap.xml` — *public/robots.txt must guide search crawlers to the sitemap.*
- `public/sitemap.xml` must contain `<loc>https://askkim.github.io/Pedigree/</loc>` — *public/sitemap.xml must define the canonical GitHub Pages location.*
- `public/404.html` must contain `Community Pedigree Project - GitHub Pages SPA Fallback` — *public/404.html must provide client-side route fallback for GitHub Pages.*
- `.github/workflows/deploy-pages.yml` must contain `- main`, `- release`, `dist/robots.txt`, `dist/sitemap.xml` — *deploy-pages.yml must deploy from both main and release branches and verify SEO artifacts.*
- `package.json` must contain `"homepage": "https://askkim.github.io/Pedigree/"` — *package.json must state the official GitHub Pages homepage URL.*

**Restoration Playbook if Overwritten:**
1. Preserve SEO meta tags, canonical link, Open Graph, and JSON-LD structured data in `index.html`.
2. Keep `public/robots.txt`, `public/sitemap.xml`, and `public/404.html` in place.
3. Ensure `.github/workflows/deploy-pages.yml` triggers on `main` and `release` and verifies `dist/robots.txt` and `dist/sitemap.xml`.
4. Keep `"homepage": "https://askkim.github.io/Pedigree/"` in `package.json` and live links in `README.md`.

### IMP-065: Boot Stability & Stale-Chunk Recovery: 504 Outdated-Dep Auto-Reload, Pre-Boot Error Separation & Safe EOF Sourcemap Stripping

- **Release Milestone:** Alpha 3 (`alpha-3`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Eliminate transient first-load boot errors after updates or dev restarts that only disappear on manual refresh.
- **Summary:** Hardens startup resilience across 4 layers: (1) updates `stripDevSourceMapTrailer` and `devInlineSourcemapStripPlugin` in `vite.config.ts` to strip only true EOF `sourceMappingURL` trailers and guard `Content-Length` against encoded/chunked headers; (2) splits genuine ES2018 syntax/parse incompatibility from transient module fetch / HTTP 504 `Outdated Optimize Dep` errors in `index.html`, adding capture-phase `<script>` and `unhandledrejection` pre-boot listeners with a 15-second cooldown-guarded reload that clears `pedigree_pending_boot_ts` so recovery never trips crash-loop protection; (3) upgrades `src/main.tsx` dev-mode cleanup to trigger a single guarded reload whenever a stale Service Worker controller was active; and (4) adds `isRecoverableChunkError` + `attemptOneTimeChunkReload` to `src/utils/lazyRoute.tsx` so stale dynamic imports and `RouteErrorBoundary` Retry Screen reload cleanly instead of reusing memoized rejected ES module promises.
- **Tracked Files:** `vite.config.ts`, `index.html`, `src/main.tsx`, `src/utils/lazyRoute.tsx`, `src/utils/__tests__/lazyRoute.test.ts`

**Automated Invariants Checked:**
- `vite.config.ts` must contain `export function stripDevSourceMapTrailer`, `hasEncoding` — *Dev sourcemap stripping must only remove trailing EOF comments and skip Content-Length mutation on encoded responses.*
- `index.html` must contain `PREBOOT_RELOAD_KEY`, `attemptOneShotPreBootReload`, `handlePreBootTransientFetchFailure` — *Pre-boot guard must separate transient module fetch/504 glitches from real ES2018 browser incompatibility and recover via cooldown-guarded reload.*
- `src/main.tsx` must contain `hadActiveController`, `pedigree_dev_sw_cleanup_reload_ts` — *Dev startup must reload cleanly once if a stale Service Worker controller intercepted the initial boot.*
- `src/utils/lazyRoute.tsx` must contain `isRecoverableChunkError`, `attemptOneTimeChunkReload` — *Lazy route loader and RouteErrorBoundary must detect stale chunk / 504 errors and perform a guarded clean reload instead of retrying a permanently rejected ES module entry.*

**Restoration Playbook if Overwritten:**
1. Keep EOF-only `stripDevSourceMapTrailer` checks and `hasEncoding` guard in `vite.config.ts`.
2. Preserve `attemptOneShotPreBootReload`, `handlePreBootTransientFetchFailure`, capture-phase script `error`, and pre-boot `unhandledrejection` handlers in `index.html`.
3. Preserve `hadActiveController` reload guard in `src/main.tsx`.
4. Preserve `isRecoverableChunkError` and `attemptOneTimeChunkReload` in `src/utils/lazyRoute.tsx`.

### IMP-066: Alpha 3 Modular Core Primitives, Multi-Platform Storage Bridges, Decoupled @features/* Modules & Parameterized Android Wrapper

- **Release Milestone:** Alpha 3 (`alpha-3`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Execute the Hydrogen modular architecture plan with strict three-layer boundaries, iOS/desktop/Android storage and print bridges, decoupled feature packages, and zero boot or Alpha 2 baseline regressions.
- **Summary:** Establishes `@engine/primitives/*` pure sanitization and crypto utilities; upgrades `@engine/bridge/*` with request-ID-correlated iOS `WKWebView` SQLite storage replies + timeouts (`ios-wrapper/BRIDGE_CONTRACT.md`), runtime Electron/Tauri `desktopBridgeAdapter.ts` delegation, and Android WebView two-frame `ArrayBuffer`/print parity; enforces strict `requiresIosStorageBridge` anti-eviction routing in `resilientStorageAdapter.ts` and `NativeBridgeStorageAdapter`; parameterizes `android-wrapper/` names, shortcuts, prefs, clipboard labels, and export filenames via Gradle `pedigree.wrapper.*` properties while keeping `minSdk = 26`; extracts 5 new domain-agnostic feature modules (`@features/csv-exporter`, `@features/backup-vault`, `@features/document-export`, `@features/ics-calendar`, `@features/ocr-parser`) alongside `@features/csv-importer`; and wires lightweight `PEDIGREE_APP_CONFIG` + end-to-end repositories and workflows through `@app/pedigreeAppWiring.ts` and `useBarnStore.ts` while deferring standalone `core` extraction until transfer readiness.
- **Tracked Files:** `HYDROGEN_MODULAR_PLAN.md`, `src/engine/primitives/index.ts`, `src/engine/primitives/sanitization.ts`, `src/engine/primitives/crypto.ts`, `src/engine/bridge/platformBridge.ts`, `src/engine/bridge/desktopBridgeAdapter.ts`, `src/engine/storage/resilientStorageAdapter.ts`, `src/engine/storage/nativeBridgeStorageAdapter.ts`, `src/features/csv-exporter/csvExporter.ts`, `src/features/backup-vault/portableVault.ts`, `src/features/document-export/htmlPrintPackage.ts`, `src/features/ics-calendar/icsBuilder.ts`, `src/features/ocr-parser/ocrTextPipeline.ts`, `src/app/pedigreeAppConfig.ts`, `src/app/pedigreeAppWiring.ts`, `src/hooks/useBarnStore.ts`, `android-wrapper/app/build.gradle.kts`, `android-wrapper/settings.gradle.kts`, `ios-wrapper/BRIDGE_CONTRACT.md`

**Automated Invariants Checked:**
- `src/engine/primitives/sanitization.ts` must contain `isSafeObjectKey`, `sanitizeCsvFormulaCell`, `escapeSafeHtml` — *Shared pure sanitization helpers must live in @engine/primitives without DOM/Node or domain dependencies.*
- `src/engine/primitives/crypto.ts` must contain `fnv1a64Hex`, `sha256HexPure`, `wrapGenericEncryptedZip` — *Shared FNV-1a and SHA-256 primitives must live in @engine/primitives.*
- `src/engine/bridge/desktopBridgeAdapter.ts` must contain `detectDesktopShellType`, `createDesktopBridgeDelegates` — *Desktop Electron/Tauri runtime detection must remain dependency-free in @engine/bridge.*
- `src/engine/bridge/platformBridge.ts` must contain `DEFAULT_IOS_STORAGE_REPLY_GLOBAL`, `handleStorageBridgeResponse`, `openExternalUrl` — *PlatformBridge must support correlated iOS WKWebView storage replies and unified safe URL/desktop/Android routing.*
- `src/engine/storage/nativeBridgeStorageAdapter.ts` must contain `return caps.hasNativeBridge;`, `Native storage bridge is not configured` — *NativeBridgeStorageAdapter must verify caps.hasNativeBridge is active instead of accepting unbacked iOS signals.*
- `src/engine/storage/resilientStorageAdapter.ts` must contain `if (caps.requiresIosStorageBridge)`, `fnv1a64Hex` — *createResilientStorageAdapter must strictly route ios-wkwebview through native bridge storage rather than evictable IndexedDB/OPFS.*
- `src/features/csv-exporter/csvExporter.ts` must contain `exportRecordsToCsv`, `createCsvExporterFeatureModule` — *Decoupled CSV exporter must remain domain-agnostic in @features/csv-exporter.*
- `src/features/backup-vault/portableVault.ts` must contain `exportPortableVault`, `restorePortableVault`, `createBackupVaultFeatureModule` — *Decoupled SHA-256 verified portable vault must remain domain-agnostic in @features/backup-vault.*
- `src/features/document-export/htmlPrintPackage.ts` must contain `buildPrintableHtmlDocument`, `dispatchPrintPackage`, `createDocumentExportFeatureModule` — *Printable HTML packager must dispatch through IPlatformBridge without domain coupling.*
- `src/features/ics-calendar/icsBuilder.ts` must contain `buildGenericIcsCalendar`, `createIcsCalendarFeatureModule` — *RFC 5545 calendar builder must accept generic events without livestock domain coupling.*
- `src/features/ocr-parser/ocrTextPipeline.ts` must contain `groupWordBoxesIntoLines`, `extractStructuredFieldsFromOcr`, `createOcrParserFeatureModule` — *OCR line/field extraction pipeline must remain schema-driven and domain-agnostic.*
- `src/app/pedigreeAppConfig.ts` must contain `export const PEDIGREE_APP_CONFIG`, `document-export`, `backup-vault` — *PEDIGREE_APP_CONFIG must stay lightweight so useBarnStore startup does not pull ZIP or SQLite WASM engines.*
  - Forbidden regression: `fflate`, `sql.js`
- `src/app/pedigreeAppWiring.ts` must contain `exportAnimalCsvFromStorage`, `exportPedigreePortableVault`, `printPedigreeDocument`, `buildBarnTasksIcsFeed`, `extractPedigreeOcrSummary` — *@app/pedigreeAppWiring.ts is the sole composition layer connecting domain configs to @features/* and @engine/*.*
- `android-wrapper/app/build.gradle.kts` must contain `minSdk = 26`, `pedigree.wrapper.appName`, `pedigree.wrapper.debugPrefsName`, `pedigree.wrapper.diagnosticsClipLabel`, `pedigree.wrapper.defaultExportFilename` — *Android wrapper must preserve minSdk = 26 and Gradle property parameterization.*
- `ios-wrapper/BRIDGE_CONTRACT.md` must contain `NATIVE_STORAGE_OP`, `__platformBridgeStorageReceive`, `.applicationSupportDirectory` — *iOS WKWebView SQLite storage bridge protocol must remain documented for native Apple shell implementations.*

**Restoration Playbook if Overwritten:**
1. Restore `@engine/primitives/*`, `@engine/bridge/desktopBridgeAdapter.ts`, and request-ID-correlated iOS storage reply handling in `@engine/bridge/platformBridge.ts`.
2. Keep strict `caps.hasNativeBridge` verification in `NativeBridgeStorageAdapter` and anti-eviction routing in `createResilientStorageAdapter`.
3. Preserve all six decoupled `@features/*` modules (`csv-importer`, `csv-exporter`, `backup-vault`, `document-export`, `ics-calendar`, `ocr-parser`) and `@app/pedigreeAppConfig.ts` + `@app/pedigreeAppWiring.ts` composition wiring.
4. Maintain Gradle `pedigree.wrapper.*` parameterization and `minSdk = 26` in `android-wrapper/app/build.gradle.kts`.

### IMP-067: NEON Phases 1–2: Boot-Entry Lock, 100% Extraction Inventory & Pure Shared Primitives Decoupling

- **Release Milestone:** Alpha 3 (`alpha-3`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Lock boot/entry stability, classify 100% of shared vs domain modules, and extract pure content-agnostic primitives from remaining shared src/domain and src/utils modules without breaking Alpha 2 exports.
- **Summary:** Establishes immutable boot-entry SHA-256 lock checksums (`BOOT_ENTRY_LOCK_CHECKSUMS`) for `src/main.tsx`, `src/App.tsx`, and `index.html`; classifies 100% of non-test modules across `src/domain/`, `src/features/`, `src/app/`, `src/storage/`, and `src/utils/` in `EXTRACTION_INVENTORY.md` (recording `FLASH_HYGIENE_PLAN.md` absorption and ES2018/`import/` config parity); extracts pure content-agnostic primitives (`themeColor.ts`, `qrCodec.ts`, `genericSync.ts`, `genericRegistries.ts`, `deviceCapabilityCore.ts`, `pdfDocumentExtractor.ts`, plus expanded `crypto.ts` and `sanitization.ts`) behind thin Alpha 2 compatibility facades; decouples `archiveAndCsvUtils.ts` and reusable `src/utils/*` (`es2018Shims.ts`, `useVirtualWindow.ts`, `lazyRoute.tsx`); wires domain factories in `@app/pedigreeAppWiring.ts`; and enforces automated zero-domain-term, import-direction, and boot-lock tests while deferring standalone `core` extraction until Phase 7.
- **Tracked Files:** `EXTRACTION_INVENTORY.md`, `ROADMAP.md`, `src/domain/improvementRegistry.ts`, `src/engine/primitives/index.ts`, `src/engine/primitives/crypto.ts`, `src/engine/primitives/sanitization.ts`, `src/engine/primitives/themeColor.ts`, `src/engine/primitives/qrCodec.ts`, `src/engine/primitives/genericSync.ts`, `src/engine/primitives/genericRegistries.ts`, `src/engine/primitives/deviceCapabilityCore.ts`, `src/engine/primitives/pdfDocumentExtractor.ts`, `src/engine/codecs/archiveAndCsvUtils.ts`, `src/domain/importers/pdfScanExtractor.ts`, `src/app/pedigreeAppWiring.ts`, `src/utils/es2018Shims.ts`, `src/utils/useVirtualWindow.ts`, `src/utils/lazyRoute.tsx`, `src/domain/__tests__/modularLayerArchitecture.test.ts`

**Automated Invariants Checked:**
- `EXTRACTION_INVENTORY.md` must contain `FLASH_HYGIENE_PLAN.md`, `extractable-core`, `extractable-feature`, `extractable-ui-util`, `pedigree-domain` — *Extraction inventory must document FLASH_HYGIENE_PLAN.md absorption and classify 100% of non-test source files.*
- `src/domain/improvementRegistry.ts` must contain `export const BOOT_ENTRY_LOCK_CHECKSUMS`, `src/main.tsx`, `src/App.tsx`, `index.html` — *Boot-entry SHA-256 lock checksums must remain registered to protect active boot stability.*
- `src/engine/primitives/index.ts` must contain `./themeColor`, `./qrCodec`, `./genericSync`, `./genericRegistries`, `./deviceCapabilityCore`, `./pdfDocumentExtractor` — *Pure content-agnostic Phase 2 primitives must stay exported from @engine/primitives.*
- `src/engine/codecs/archiveAndCsvUtils.ts` must contain `@engine/primitives/sanitization`, `@engine/primitives/genericRegistries` — *archiveAndCsvUtils.ts must depend solely on content-agnostic @engine/primitives contracts.*
- `src/app/pedigreeAppWiring.ts` must contain `wrapPedigreeEncryptedZip`, `PEDIGREE_P2P_WIRE_CONFIG`, `buildPedigreeRecordDeepLink`, `getPedigreeHeavyZipGate` — *@app/pedigreeAppWiring.ts must inject Pedigree defaults into pure @engine/primitives helpers.*
- `src/utils/es2018Shims.ts` must contain `__coreEs2018Shim` — *Reusable ES2018 shims must stay free of domain-specific internal marker names.*
  - Forbidden regression: `__pedigreeEs2018Shim`
- `src/utils/lazyRoute.tsx` must contain `configureLazyRouteDefaults`, `ChunkReloadOptions` — *lazyRoute.tsx must expose parameterized reload defaults and domain-neutral fallback UI copy.*
  - Forbidden regression: `Back to All Species`

**Restoration Playbook if Overwritten:**
1. Preserve `BOOT_ENTRY_LOCK_CHECKSUMS` in `src/domain/improvementRegistry.ts` and boot-lock verification tests in `src/domain/__tests__/modularLayerArchitecture.test.ts`.
2. Keep all pure content-agnostic primitives under `src/engine/primitives/*` and thin Alpha 2 compatibility facades in `src/domain/*`.
3. Keep 100% file-by-file module classifications synchronized in `EXTRACTION_INVENTORY.md` and domain wiring in `@app/pedigreeAppWiring.ts`.
4. Preserve domain-neutral markers and parameterized defaults in `src/utils/es2018Shims.ts`, `src/utils/useVirtualWindow.ts`, and `src/utils/lazyRoute.tsx`.

### IMP-068: AI Studio GitHub Import Fast-Boot, Compact Initial Output & Cold-Start Optimizations

- **Release Milestone:** Alpha 3 (`alpha-3`)
- **Category:** CI & Tooling (`ci-tooling`)
- **Origin:** Session Improvement
- **User Goal:** Speed up AI Studio startup when importing from GitHub, keep prompts/master_system_prompt.md mandatory, and reduce initial screen output.
- **Summary:** Adds Section 0 (AI Studio GitHub Import Fast-Boot & Compact Output) to `AGENTS.md` so GitHub imports always read `prompts/master_system_prompt.md`, declare pre-configured AI Studio runtime facts (Node/npm, `0.0.0.0:3000`, `hmr: false`, browser `sql.js`, zero env vars), skip non-boot docs and full `npm test`/`tsc --noEmit`/`verify:improvements` runs on import-only boot, and limit clean startup output to `ALIGNED` + `Ready: Community Pedigree (port 3000).`; sets `audit=false` and `fund=false` in `.npmrc`; removes lazy `tesseract.js` from eager Vite `optimizeDeps.include` and sets `reportCompressedSize: false` in `vite.config.ts`; and keeps `releaseReadiness.test.ts` tolerant of gitignored `Screenshot_*` attachments in `public/assets/aistudio/`.
- **Tracked Files:** `AGENTS.md`, `.npmrc`, `vite.config.ts`, `src/domain/__tests__/releaseReadiness.test.ts`

**Automated Invariants Checked:**
- `AGENTS.md` must contain `prompts/master_system_prompt.md`, `AI Studio GitHub Import Fast-Boot & Compact Output`, `Minimal Initial Screen Output`, `Ready: Community Pedigree (port 3000).` — *AGENTS.md must enforce reading master_system_prompt.md, fast-boot skip rules on GitHub import, and compact 2-line initial screen output.*
- `.npmrc` must contain `legacy-peer-deps=true`, `audit=false`, `fund=false` — *.npmrc must disable npm audit and funding network calls to accelerate cold AI Studio dependency installation.*
- `vite.config.ts` must contain `reportCompressedSize: false` — *Vite must skip gzip size reporting on build and avoid eagerly pre-bundling lazy tesseract.js during dev startup.*
  - Forbidden regression: `'tesseract.js',`

**Restoration Playbook if Overwritten:**
1. Keep Section 0 (`AI Studio GitHub Import Fast-Boot & Compact Output`) and the mandatory `prompts/master_system_prompt.md` directive at the top of `AGENTS.md`.
2. Keep `legacy-peer-deps=true`, `audit=false`, and `fund=false` in `.npmrc`.
3. Keep `reportCompressedSize: false` and omit `tesseract.js` from `optimizeDeps.include` in `vite.config.ts`.

### IMP-069: Alpha 3 Modularity Remediation: Full Utils Decoupling, IPlatformBridge Context DI, iOS SQLite Backing Seam & Boundary Guardrails

- **Release Milestone:** Alpha 3 (`alpha-3`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Close all remaining modularity gaps after Phase 1 DI rollout: decouple src/utils/*, remove all concrete pedigreeBridge imports from components/utils/storage, route iOS WKWebView SQLite persistence through NativeBridgeStorageAdapter, fix double back-handler registration, and harden automated layer tests.
- **Summary:** Decouples `src/utils/lazyRoute.tsx` (`app_chunk_reload_ts`, `--ui-*` CSS aliases in `src/index.css`, injectable diagnostic hooks), `src/utils/webFileActions.ts` (`configureWebFileBridge`), `src/utils/webPdfActions.ts` -> `src/app/pedigreePdfActions.ts`, and `src/utils/googleCalendarClient.ts` -> `src/app/pedigreeCalendarClient.ts` so 100% of `src/utils/` is domain-free; adds `PlatformBridgeContext` (`usePlatformBridge()`) and extends `IPlatformBridge` with optional diagnostic/dev-panel/container hooks, migrating `PrintPreviewModal`, `HealthReferencePanel`, `SettingsAndSyncScreen`, `DiagnosticsAndSupportPanel`, `TechyStuffScreen`, and `storageProtection.ts` off concrete `pedigreeBridge`; fixes duplicate back-handler registration in `createPedigreeBridgePlatformAdapter`; adds an optional `backingStore?: IStorageAdapter` seam to `WebSqliteAdapter` wired via `createPedigreeDomainStorageAdapter` in `pedigreeAppWiring.ts` so iOS `WKWebView` routes SQLite persistence through `NativeBridgeStorageAdapter`; decouples `CrashErrorBoundary` from direct `WebSqliteAdapter` construction; and upgrades `modularLayerArchitecture.test.ts` with dynamic core/utils scanning, relative cross-feature import detection, and zero concrete `pedigreeBridge` enforcement.
- **Tracked Files:** `src/index.css`, `src/utils/lazyRoute.tsx`, `src/utils/webFileActions.ts`, `src/utils/webPdfActions.ts`, `src/utils/googleCalendarClient.ts`, `src/app/PlatformBridgeContext.tsx`, `src/app/pedigreePdfActions.ts`, `src/app/pedigreeCalendarClient.ts`, `src/app/pedigreeAppWiring.ts`, `src/engine/bridge/platformBridge.interface.ts`, `src/native/pedigreeBridge.ts`, `src/storage/storageProtection.ts`, `src/storage/webSqliteAdapter.ts`, `src/hooks/useBarnStore.ts`, `src/App.tsx`, `src/components/CrashErrorBoundary.tsx`, `src/components/HealthReferencePanel.tsx`, `src/components/SettingsAndSyncScreen.tsx`, `src/components/PrintPreviewModal.tsx`, `src/components/DiagnosticsAndSupportPanel.tsx`, `src/components/TechyStuffScreen.tsx`, `src/domain/__tests__/modularLayerArchitecture.test.ts`, `EXTRACTION_INVENTORY.md`

**Automated Invariants Checked:**
- `src/app/PlatformBridgeContext.tsx` must contain `PlatformBridgeProvider`, `usePlatformBridge` — *UI components must consume IPlatformBridge via React Context rather than importing concrete pedigreeBridge.*
- `src/utils/webFileActions.ts` must contain `configureWebFileBridge`, `NativeExportBridge` — *webFileActions.ts must stay decoupled from concrete pedigreeBridge globals.*
  - Forbidden regression: `pedigreeBridge`
- `src/app/pedigreeAppWiring.ts` must contain `initializePedigreeRuntimeDefaults`, `createPedigreeDomainStorageAdapter`, `NativeBridgeStorageAdapter` — *Composition root must wire runtime defaults and route iOS WKWebView SQLite persistence through NativeBridgeStorageAdapter.*
- `src/storage/webSqliteAdapter.ts` must contain `backingStore?: IStorageAdapter` — *WebSqliteAdapter must support an injected IStorageAdapter backing store for iOS anti-eviction routing.*

**Restoration Playbook if Overwritten:**
1. Preserve `PlatformBridgeProvider` in `src/App.tsx` and `usePlatformBridge()` across UI components.
2. Keep `configureLazyRouteDefaults`, `configureWebFileBridge`, and `configureStorageProtectionBridge` wired in `src/app/pedigreeAppWiring.ts`.
3. Keep `backingStore?: IStorageAdapter` in `src/storage/webSqliteAdapter.ts` and `createPedigreeDomainStorageAdapter` in `src/app/pedigreeAppWiring.ts`.

### IMP-070: Alpha 3 Modularity Hardening: iOS Backing-Store Write Guard, True Utils Isolation, Zero-Cycle Gate, Core Typecheck & Wrapper Contracts

- **Release Milestone:** Alpha 3 (`alpha-3`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Review the completed Alpha 3 modularity rollout, fix missed runtime bugs and boundary leaks, eliminate circular dependencies, harden core storage/bridge adapters, and add an isolated core build profile.
- **Summary:** Fixes a critical `WebSqliteAdapter` persistence bug where `persistToDiskLocked` and `findRecoveredBackupSnapshot` short-circuited on `!getSafeIndexedDb()` before checking `this.backingStore` (verified with an end-to-end no-IDB SQLite WASM round-trip test over `NativeBridgeStorageAdapter`); syncs injected bridges in `PlatformBridgeProvider`; decouples `src/utils/webFileActions.ts`, `src/utils/googleCalendarClient.ts`, and `src/utils/webPdfActions.ts` (`src/utils/canvasUtils.ts`) from all `src/storage/*` imports and breaks all 3 circular dependencies (`opfsStorage <-> localSyncChannels <-> webFileActions`, `inputSanitization <-> syncOutbox <-> showResults`); adds forbidden-import checks for `src/utils/*` and a DFS zero-cycle test in `modularLayerArchitecture.test.ts`; wires Electron `onBackPressed` in `PlatformBridge`, adds `VersionError`/`QuotaExceededError` hooks to `IndexedDbStorageAdapter`, adds `wasmUrl` to `SqliteWasmStorageAdapter`, and adds SHA-256 + FNV-1a verification to `PortableStorageBundle`; adds `configureCapturedIdeasBackingStore` for iOS anti-eviction; adds modular `core` barrels (`src/engine/index.ts`, `src/engine/codecs/index.ts`, `src/engine/sync/index.ts`) and `tsconfig.engine.json` (`npm run verify:engine`), fixing an ES2019 `.trimStart()` leak in `sanitization.ts`; removes remaining `as any` casts in tests and temporary root plan files; and completes `apple-wrapper/` and `desktop-wrapper/` bridge/storage/installer contracts.
- **Tracked Files:** `src/storage/webSqliteAdapter.ts`, `src/storage/__tests__/nativeBackingStore.test.ts`, `src/app/PlatformBridgeContext.tsx`, `src/utils/canvasUtils.ts`, `src/utils/webPdfActions.ts`, `src/utils/googleCalendarClient.ts`, `src/utils/webFileActions.ts`, `src/utils/es2018Shims.ts`, `src/app/pedigreeAppWiring.ts`, `src/domain/inputSanitization.ts`, `src/domain/syncOutbox.ts`, `src/engine/primitives/sanitization.ts`, `src/engine/bridge/desktopBridgeAdapter.ts`, `src/engine/bridge/platformBridge.ts`, `src/engine/storage/browserStorageAdapters.ts`, `src/engine/storage/sqliteWasmStorageAdapter.ts`, `src/engine/storage/resilientStorageAdapter.ts`, `src/storage/capturedIdeasStore.ts`, `src/storage/photoHydration.ts`, `src/engine/index.ts`, `src/engine/codecs/index.ts`, `src/engine/sync/index.ts`, `tsconfig.engine.json`, `package.json`, `apple-wrapper/BRIDGE_CONTRACT.md`, `apple-wrapper/WKWebViewSQLiteContract.md`, `desktop-wrapper/BRIDGE_CONTRACT.md`, `desktop-wrapper/INSTALLER_TARGETS.md`, `src/domain/__tests__/modularLayerArchitecture.test.ts`, `EXTRACTION_INVENTORY.md`

**Automated Invariants Checked:**
- `src/storage/webSqliteAdapter.ts` must contain `(!this.backingStore && !getSafeIndexedDb())` — *WebSqliteAdapter must never silently drop writes into ephemeral mode when backingStore is configured without IndexedDB.*
- `src/utils/webFileActions.ts` must contain `configureWebFileRuntime`, `WebFileRuntimeHooks` — *Extractable UI utilities in src/utils/ must never import legacy pedigree-domain modules from src/storage/.*
  - Forbidden regression: `../storage/`
- `tsconfig.engine.json` must contain `src/engine/index.ts`, `src/features/**/*.ts`, `src/utils/*.ts` — *Isolated tsconfig.engine.json profile (npm run verify:engine) proves the extractable framework compiles with zero domain/app/storage dependencies.*
- `package.json` must contain `"verify:engine": "tsc -p tsconfig.engine.json --noEmit"` — *package.json must expose verify:engine for isolated framework compilation checks.*
- `src/domain/__tests__/modularLayerArchitecture.test.ts` must contain `enforces zero circular dependencies across core, features, app, utils, and storage` — *Automated boundary suite must fail on any circular dependency or src/utils/* storage import.*

**Restoration Playbook if Overwritten:**
1. Keep `(!this.backingStore && !getSafeIndexedDb())` guards in `src/storage/webSqliteAdapter.ts` and preserve `src/storage/__tests__/nativeBackingStore.test.ts`.
2. Keep `configureWebFileRuntime`, `configureGoogleCalendarClient`, and `src/utils/canvasUtils.ts` decoupled from `src/storage/*` and wired in `src/app/pedigreeAppWiring.ts`.
3. Keep `tsconfig.engine.json`, `npm run verify:engine`, and the zero-cycle test in `src/domain/__tests__/modularLayerArchitecture.test.ts`.

### IMP-071: Engine Extraction Readiness: Core→Domain Rename, Engine Dependency Direction, Layer Audit Ratchet & Shared Text Encoders

- **Release Milestone:** Alpha 3 (`alpha-3`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Review the modularity rollout, fix gaps after the `@core` → `@engine` migration, avoid the term "core" (reserved for the Core Pedigree brand), and add automated enforcement.
- **Summary:** Moves `binaryEncoding` and `archiveAndCsvUtils` into `src/engine` (shims remain in `src/domain`); renames `src/core/` to `src/domain/` (`@domain`) with the `App.tsx` boot-lock checksum updated; adds `npm run verify:layers` (`scripts/audit-layers.ts`, shrinking-allowlist ratchet) in CI alongside `verify:engine`; globs `tsconfig.engine.json`; moves engine-only tests to `src/engine/__tests__`; and shares CSV/ICS encoders via `@engine/codecs/textFormats`.
- **Tracked Files:** `src/engine/binaryEncoding.ts`, `src/engine/codecs/archiveAndCsvUtils.ts`, `src/engine/codecs/textFormats.ts`, `scripts/audit-layers.ts`, `scripts/layer-allowlist.json`, `tsconfig.engine.json`, `package.json`, `.github/workflows/ci.yml`, `EXTRACTION_INVENTORY.md`

**Automated Invariants Checked:**
- `src/engine/index.ts` must contain `'./binaryEncoding'`, `'./codecs/archiveAndCsvUtils'` — *The engine must never import from the domain layer.*
  - Forbidden regression: `../domain/`
- `src/engine/codecs/textFormats.ts` must contain `escapeCsvCell`, `escapeCsvCellWithLimit`, `escapeIcsText`, `formatIcsAlarmTrigger` — *CSV and ICS encoders must have a single shared implementation.*
- `package.json` must contain `"verify:layers": "tsx scripts/audit-layers.ts"` — *package.json must expose verify:layers.*
- `.github/workflows/ci.yml` must contain `npm run verify:layers`, `npm run verify:engine` — *CI must run the layer audit and the isolated engine typecheck.*

**Restoration Playbook if Overwritten:**
1. Keep implementations of `binaryEncoding`, `archiveAndCsvUtils` and `textFormats` under `src/engine/` with only re-export shims in `src/domain/`.
2. Keep `scripts/audit-layers.ts` and `scripts/layer-allowlist.json` (entries may only be removed) and run them in CI.
3. Use `@domain` / `src/domain/` for pedigree domain logic; never reintroduce "core" in layer names.

### IMP-072: Isolated Engine Extraction Rehearsal Gate & Shared Text-Format Codec Tests

- **Release Milestone:** Alpha 3 (`alpha-3`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Add an automated temp-directory extraction rehearsal proving @engine, @features, and src/utils compile standalone without domain/app/storage files, and add direct engine codec unit tests.
- **Summary:** Adds `scripts/rehearse-engine-extraction.ts` (`npm run verify:extraction`) which copies `src/engine`, `src/features`, `src/utils`, `tsconfig.json`, and `tsconfig.engine.json` into an isolated temp directory and runs `tsc -p tsconfig.engine.json --noEmit` with zero `src/domain`, `src/app`, `src/storage`, `src/hooks`, or `src/components` files present; wires `verify:extraction` into `.github/workflows/ci.yml`; and adds `src/engine/__tests__/textFormats.test.ts` covering CSV cell escaping, `.map(escapeCsvCell)` safety, and RFC-5545 ICS formatting.
- **Tracked Files:** `scripts/rehearse-engine-extraction.ts`, `package.json`, `.github/workflows/ci.yml`, `src/engine/__tests__/textFormats.test.ts`

**Automated Invariants Checked:**
- `package.json` must contain `"verify:extraction": "tsx scripts/rehearse-engine-extraction.ts"` — *package.json must expose verify:extraction for isolated engine extraction rehearsal.*
- `.github/workflows/ci.yml` must contain `npm run verify:extraction` — *CI must run the isolated engine extraction rehearsal.*
- `scripts/rehearse-engine-extraction.ts` must contain `'src/engine'`, `'src/features'`, `'src/utils'`, `'tsconfig.engine.json'` — *Extraction rehearsal must compile engine, features, and utils without domain/app/storage.*

**Restoration Playbook if Overwritten:**
1. Keep `scripts/rehearse-engine-extraction.ts` and `"verify:extraction"` in `package.json` and `.github/workflows/ci.yml`.
2. Keep `src/engine/__tests__/textFormats.test.ts` testing `@engine/codecs/textFormats`.

### IMP-073: Shared Canvas/OCR Decoding, SQLite Statement Cleanup & Workflow Modularity Gates

- **Release Milestone:** Alpha 3 (`alpha-3`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Improve modularity and workflows, verify boot and loading, optimize memory management, and reduce token use.
- **Summary:** Consolidates duplicated image-blob decoding, ObjectURL/bitmap teardown, and contrast-grayscale OCR canvas preprocessing into `src/utils/canvasUtils.ts` (`decodeBlobToCanvasSource`, `buildContrastGrayscaleCanvas`, `releaseCanvas`) across `pedigreeOcrScanner.ts`, `feedTagOcr.ts`, and `webImageOptimizer.ts`; wraps `queryObjectsFromDb` prepared-statement stepping in `try/finally { stmt.free(); }` in `src/storage/webSqliteAdapter.ts`; adds npm download caching, concurrency cancellation, and `verify:layers`/`verify:engine`/`verify:extraction` gates across `.github/workflows/ci.yml`, `deploy-pages.yml`, `build-android-apk.yml`, and `guardrails.yml`; and excludes `.vite`, `.idea`, `.vscode`, `import`, `upload`, and `.map` artifacts in `export_repo_to_md.yml`.
- **Tracked Files:** `src/utils/canvasUtils.ts`, `src/storage/pedigreeOcrScanner.ts`, `src/storage/feedTagOcr.ts`, `src/storage/webImageOptimizer.ts`, `src/storage/webSqliteAdapter.ts`, `.github/workflows/ci.yml`, `.github/workflows/deploy-pages.yml`, `.github/workflows/build-android-apk.yml`, `.github/workflows/guardrails.yml`, `.github/workflows/export_repo_to_md.yml`

**Automated Invariants Checked:**
- `src/utils/canvasUtils.ts` must contain `decodeBlobToCanvasSource`, `buildContrastGrayscaleCanvas`, `releaseCanvas` — *Shared canvas/blob decode and OCR preprocessing helpers must remain centralized in src/utils/canvasUtils.ts.*
- `src/storage/webSqliteAdapter.ts` must contain `try {`, `stmt.free();`, `} finally {` — *SQLite WASM prepared statements in queryObjectsFromDb must always be freed in a finally block.*
- `.github/workflows/deploy-pages.yml` must contain `bun run verify:layers`, `bun run verify:engine`, `bun run verify:extraction` — *GitHub Pages deployment workflow must enforce layer boundary and engine extraction gates.*
- `.github/workflows/build-android-apk.yml` must contain `npm run verify:layers`, `npm run verify:engine`, `npm run verify:extraction` — *Android APK workflow must enforce layer boundary and engine extraction gates.*

**Restoration Playbook if Overwritten:**
1. Keep `decodeBlobToCanvasSource`, `buildContrastGrayscaleCanvas`, and `releaseCanvas` centralized in `src/utils/canvasUtils.ts` and imported by `pedigreeOcrScanner.ts`, `feedTagOcr.ts`, and `webImageOptimizer.ts`.
2. Keep `try/finally { stmt.free(); }` in `queryObjectsFromDb` inside `src/storage/webSqliteAdapter.ts`.
3. Keep `verify:layers`, `verify:engine`, and `verify:extraction` active in `ci.yml`, `deploy-pages.yml`, and `build-android-apk.yml`.

### IMP-074: Settings UI/UX Modernization, Logical Subunits, Title Header & System Links

- **Release Milestone:** Alpha 3 (`alpha-3`)
- **Category:** Workflow & UI Polish (`workflow-polish`)
- **Origin:** Session Improvement
- **User Goal:** Improve the UI/UX of the settings page by condensing logically related items into shared subunits in logical order, adding title text, and providing links to prompts, about, developer, and help pages.
- **Summary:** Reorganizes `SettingsAndSyncScreen.tsx` into 8 clean, logically ordered subunits beneath a prominent page header and quick-jump navigation bar linking to Prompts (`onOpenPromptsDirectory`), About (`AboutModal.tsx`), Developer (`onOpenTechyStuff`), and Help & Husbandry Guides (`onOpenHelpDocs`); groups Farm Identity, Species Setup, Measurement Units, Appearance Studio, Calendar Alarms, Storage & Image Compression, Backup & Installation, and System Resources; and coordinates return routing from `PromptsDirectoryScreen` in `src/App.tsx`.
- **Tracked Files:** `src/components/SettingsAndSyncScreen.tsx`, `src/components/AboutModal.tsx`, `src/App.tsx`

**Automated Invariants Checked:**
- `src/components/SettingsAndSyncScreen.tsx` must contain `Settings &amp; Preferences`, `onOpenPromptsDirectory`, `handleOpenAboutTrigger`, `AboutModal` — *SettingsAndSyncScreen must include title header, quick jump links for prompts, about, developer, and help.*
- `src/components/AboutModal.tsx` must contain `Community Pedigree`, `100% On-Device`, `Zero Telemetry`, `AGPL-3.0` — *AboutModal must present app details, offline architecture, and AGPL-3.0 license.*
- `src/App.tsx` must contain `returnRouteFromPrompts`, `onOpenPromptsDirectory` — *App.tsx must wire onOpenPromptsDirectory and track return routing for PromptsDirectoryScreen.*

**Restoration Playbook if Overwritten:**
1. Keep Settings header title, quick navigation links (Prompts, About, Developer, Help), and 8 modular subunits in `src/components/SettingsAndSyncScreen.tsx`.
2. Keep `AboutModal.tsx` accessible modal showing offline guarantees and AGPL license.
3. Keep `returnRouteFromPrompts` and `onOpenPromptsDirectory` wired in `src/App.tsx`.

### IMP-075: Dependency Reduction, Deprecated API & Legacy Config Remediation

- **Release Milestone:** Alpha 3 (`alpha-3`)
- **Category:** CI & Tooling (`ci-tooling`)
- **Origin:** Session Improvement
- **User Goal:** Remove unused/deprecated dependencies, replace outdated runtime/API calls and legacy syntax, and clean up unsupported or obsolete configurations across the app without feature loss.
- **Summary:** Removes unused `autoprefixer` (and its unused transitive PostCSS helpers) since Tailwind CSS v4 (`@tailwindcss/vite`) handles prefixing natively via Lightning CSS; moves `@types/sql.js` from `dependencies` to `devDependencies` (`^1.16.1`) with strict peer-dependency resolution verified; strips obsolete `experimentalDecorators`, `useDefineForClassFields`, and `allowJs` from `tsconfig.json`; uses `node:path` in `vite.config.ts`; adds standard `<meta name="mobile-web-app-capable" content="yes" />` alongside iOS meta tags in `index.html`; replaces deprecated Annex B `escape()`/`unescape()` fallbacks in `src/engine/binaryEncoding.ts` with pure RFC 3629 UTF-8 encode/decode loops (covered by `binaryEncoding.test.ts`); prefers `navigator.userAgentData?.platform` before `navigator.platform` in `src/storage/storageProtection.ts`; migrates `PWAInstallButton.tsx` off legacy `React.FC`; and updates `bg-gradient-to-br` to Tailwind v4 `bg-linear-to-br` in `ImportExportHubScreen.tsx`.
- **Tracked Files:** `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/engine/binaryEncoding.ts`, `src/domain/__tests__/binaryEncoding.test.ts`, `src/storage/storageProtection.ts`, `src/components/PWAInstallButton.tsx`, `src/components/ImportExportHubScreen.tsx`

**Automated Invariants Checked:**
- `package.json` must contain `"@types/sql.js"` — *Unused autoprefixer must not be re-introduced under Tailwind CSS v4 (@tailwindcss/vite).*
  - Forbidden regression: `"autoprefixer"`
- `tsconfig.json` must contain `"target": "ES2018"`, `"jsx": "react-jsx"` — *Obsolete decorator and JS-interop compiler flags must stay removed from strict TS config.*
  - Forbidden regression: `"experimentalDecorators"`, `"allowJs"`
- `vite.config.ts` must contain `import path from 'node:path';` — *Vite config must use explicit Node built-in protocol imports (node:path).*
- `index.html` must contain `<meta name="mobile-web-app-capable" content="yes" />` — *index.html must include the standard mobile-web-app-capable meta tag.*
- `src/engine/binaryEncoding.ts` must contain `RFC 3629 UTF-8 fallback` — *binaryEncoding.ts must use pure RFC 3629 UTF-8 fallbacks instead of deprecated Annex B escape/unescape globals.*
  - Forbidden regression: `unescape(`, `escape(raw)`
- `src/components/PWAInstallButton.tsx` must contain `export function PWAInstallButton(`, `export function OfflineIndicator()` — *PWAInstallButton.tsx must use standard React 19 function component signatures.*
  - Forbidden regression: `React.FC`

**Restoration Playbook if Overwritten:**
1. Keep `autoprefixer` removed from `package.json` and `@types/sql.js` in `devDependencies`.
2. Keep `experimentalDecorators`, `useDefineForClassFields`, and `allowJs` out of `tsconfig.json`, and keep `node:path` in `vite.config.ts`.
3. Keep `<meta name="mobile-web-app-capable" content="yes" />` in `index.html`.
4. Preserve pure RFC 3629 UTF-8 fallback in `src/engine/binaryEncoding.ts` (no `escape`/`unescape`), `userAgentData?.platform` check in `src/storage/storageProtection.ts`, React 19 function components in `src/components/PWAInstallButton.tsx`, and `bg-linear-to-br` in `src/components/ImportExportHubScreen.tsx`.

### IMP-076: Older-Browser Performance, Zero-Dep ES2018+ Shims & Graceful CSS/API Fallbacks

- **Release Milestone:** Alpha 3 (`alpha-3`)
- **Category:** Stability & Mobile PWA (`stability-pwa`)
- **Origin:** Session Improvement
- **User Goal:** Improve performance and runtime compatibility in older ES2018-era browsers while preserving memory management, strict modularity, and graceful degradation when APIs or CSS features are unavailable.
- **Summary:** Extends zero-dependency `src/utils/es2018Shims.ts` with non-enumerable, frozen-host-safe shims for `queueMicrotask`, `Object.hasOwn`, `String.prototype.replaceAll`, `Array.prototype.at`, and `String.prototype.at` (covered in `es2018AndPwaUpdate.test.ts`); guards `AbortController` and timeout cleanup in `src/storage/weatherForecast.ts` so older browsers without `AbortController` degrade gracefully; adds `flex-basis` and `@supports not (height: 1dvh)` viewport fallbacks plus `html.pedigree-low-power` / `prefers-reduced-transparency` / `prefers-reduced-motion` GPU compositing reductions in `src/index.css` wired via `useDeviceCapability` with unmount cleanup in `src/storage/deviceCapabilityDetector.ts` (preserving boot-locked `src/App.tsx`); and adds `loading="lazy" decoding="async"` to list/gallery thumbnails in `HerdScreen.tsx`, `SpeciesDashboardScreen.tsx`, `FeedLedgerScreen.tsx`, and `AnimalPhotoGallery.tsx`.
- **Tracked Files:** `src/utils/es2018Shims.ts`, `src/storage/weatherForecast.ts`, `src/storage/deviceCapabilityDetector.ts`, `src/index.css`, `src/components/HerdScreen.tsx`, `src/components/SpeciesDashboardScreen.tsx`, `src/components/FeedLedgerScreen.tsx`, `src/components/AnimalPhotoGallery.tsx`, `src/storage/__tests__/es2018AndPwaUpdate.test.ts`

**Automated Invariants Checked:**
- `src/utils/es2018Shims.ts` must contain `queueMicrotaskShim`, `objectHasOwnShim`, `stringReplaceAllShim`, `arrayAtShim`, `stringAtShim` — *Zero-dependency ES2018 runtime shims must cover queueMicrotask, Object.hasOwn, replaceAll, and .at() with graceful frozen-host handling.*
- `src/storage/weatherForecast.ts` must contain `typeof AbortController === 'function' ? new AbortController() : null`, `if (timer !== null) clearTimeout(timer);` — *Weather forecast fetches must guard AbortController on legacy browsers and always clear timers in finally blocks.*
- `src/index.css` must contain `@supports not (height: 1dvh)`, `html.pedigree-low-power`, `prefers-reduced-transparency: reduce`, `prefers-reduced-motion: reduce` — *Legacy browsers must receive vh viewport fallbacks and reduced backdrop-filter/motion GPU load.*
- `src/storage/deviceCapabilityDetector.ts` must contain `isLegacyOrLowPowerDevice`, `classList.toggle('pedigree-low-power'`, `classList.remove('pedigree-low-power')` — *useDeviceCapability must toggle pedigree-low-power for constrained/outdated browsers with unmount cleanup.*

**Restoration Playbook if Overwritten:**
1. Keep `queueMicrotask`, `Object.hasOwn`, `String.prototype.replaceAll`, `Array.prototype.at`, and `String.prototype.at` shims in `src/utils/es2018Shims.ts`.
2. Keep guarded `AbortController` and `if (timer !== null) clearTimeout(timer)` in `src/storage/weatherForecast.ts`.
3. Keep `@supports not (height: 1dvh)` and `html.pedigree-low-power` / reduced-motion rules in `src/index.css` and the cleanup `useEffect` in `src/storage/deviceCapabilityDetector.ts`.
4. Keep `loading="lazy" decoding="async"` on list/gallery thumbnail `<img>` tags.
