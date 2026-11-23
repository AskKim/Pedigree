# Codebase Export: AskKim/Pedigree (Part 1 of 16)

- **Branch:** `main`
- **Commit:** `847f8ec8a2fc88e92ecb94065d96cf1277189c07`
- **Generated (UTC):** 2026-11-21 17:00:43 UTC
- **Files in this part:** 51 (`.env.example` -> `docs/plans/reduce-eager-heap-weight.md`)
- **Index:** [index.md](./index.md)

---
## `.env.example`

```
# No required environment variables.
# Community Pedigree is 100% offline-first and stores all data locally in the browser.
```

## `.gitignore`

```
node_modules/
build/
dist/
coverage/
.DS_Store
*.log
.env*
!.env.example
public/assets/aistudio/*.zip
public/assets/aistudio/Screenshot_*.jpg
android-wrapper/.gradle/
android-wrapper/**/build/
android-wrapper/local.properties
android-wrapper/app/src/main/assets/www/*
!android-wrapper/app/src/main/assets/www/.gitkeep
*.apk
*.aab
*.jks
*.keystore
```

## `AGENTS.md`

```markdown
# Agent Instructions: Community Pedigree Project

**Last-Edited Timestamp:** 2026-11-20

<SYSTEM_RULES_DIRECTIVE>
Before reading code, answering questions, or proposing edits, read and strictly follow all binding rules, token-spend limits, and coding invariants in `prompts/master_system_prompt.md`.
</SYSTEM_RULES_DIRECTIVE>

- **Canonical Rules File:** `prompts/master_system_prompt.md` (do not delete, move, or edit without explicit confirmation from Kimberly).
- **Architecture & Recovery Reference:** Consult `ARCHITECTURE.md` and `IMPROVEMENTS.md` only when relevant to the active task.
```

## `ARCHITECTURE.md`

```markdown
# Community Pedigree Project — Architecture & Expo Migration Guide

- **Project Name:** Community Pedigree Project
- **App Name:** Community Pedigree
- **Repository:** [`AskKim/Pedigree`](https://github.com/AskKim/Pedigree)
- **Package Name:** `pedigree`
- **License:** GNU AGPLv3 (`AGPL-3.0-or-later`) — see [LICENSE](./LICENSE)

## Cross-Platform & Expo Migration Guardrails

1. **100% Pure TypeScript Domain Core (`src/core/`):**
   - `models.ts`: Canonical entities (`BarnSettings`, `SpeciesProfile`, `Animal`, `CageLocation`, `BreedingRecord`, `BarnTask`, `CareLog`, `ShowEvent`) with globally unique `id` (UUID v4), ISO-8601 UTC `updatedAt` timestamps, per-species weight unit overrides (`lbs_oz`, `lbs`, `kg`, `grams`), and species-aware identifier labels.
   - `pedigreeCalculator.ts`: Recursive pedigree slot builder (3–6 gen), lazy Gen 4+ branch viewport helper (`buildPedigreeBranchViewport`), exact topological Wright COI / coancestry engine, depth-8 shared ancestor path contributions, pedigree completeness summaries, and cycle prevention.
   - `geneticsEngine.ts`: Multi-species coat color loci, allele inference, and Punnett test-breeding simulator across 11 predefined species plus custom-species fallback (flagged under development / incomplete via `ColorGeneticsNotice` and export notices pending domain-expert sign-off).
   - `taskMaster.ts`: Automated Master Task List chore cascading from configurable species milestone offsets, per-breed schedule overrides, and post-birth task recalculation.
   - `showResults.ts`: Structured per-animal `ShowEvent.results` normalization, XSS-safe E-Leg certificate photo sanitization, Grand Championship (3-leg / multi-judge) progress computation, `Animal.legsCount` delta reconciliation, and pedigree/report/binder show honor summaries.
   - `syncAndExports.ts`: Deterministic UUID + ISO-8601 `updatedAt` multi-device merge engine, `.json` (v5 + legacy v3/v4 import), `.csv`, Evans-compatible `.HTM` pedigrees, 4"×2" thermal cage cards, and PDF-ready DTO snapshots.
   - `backupVault.ts`, `upgradeGate.ts`, `archiveInspector.ts`, `encryptedExport.ts`, `photoMaintenance.ts`: `_schemaVersion`-stamped SHA-256 vault/pre-upgrade backup verification, pure uncached `version.json`/`status.json` release gate evaluation (`revokedVersions`, `schemaDelta >= 2`, Safe-Harbor floor), dry-run pre-restore species/conflict inspection, pure PBKDF2/AES-GCM container framing, and photo storage/orphan footprint auditing.
   - `syncOutbox.ts`, `calendarExport.ts`, & `supportBundle.ts`: Monotonic per-record `_rev` counters paired with clock-skew-adjusted timestamps (`compareSameEntitySyncOperations`), deterministic base32hex Google Calendar event IDs, and pure diagnostic support bundle packaging.
   - **Zero Browser DOM Coupling:** None of the modules in `src/core/` touch `window` or `document` or import from `src/storage/`, `src/hooks/`, `src/components/`, or `src/utils/`, so `src/core/` copies directly into an Expo / React Native codebase untouched.

2. **Pluggable Storage Adapter (`src/storage/`) & Optional Client OAuth (`src/utils/`):**
   - `storageAdapter.ts`: Defines the `StorageAdapter` contract.
   - `webSqliteAdapter.ts`: Executes standard relational SQLite (`PEDIGREE_SQLITE_SCHEMA`) in the browser via `sql.js` WebAssembly and persists the unencrypted `.sqlite` binary inside IndexedDB.
   - **Why SQLite-First Wins Cross-Platform:** The exact same `PEDIGREE_SQLITE_SCHEMA` SQL runs in `expo-sqlite` on Android/iOS, and users can export/sync a literal unencrypted `.sqlite` database file across devices via Google Drive, OneDrive, Dropbox, or SyncThing.
   - **Strictly Optional Google Calendar OAuth:** `firebase` (`firebase/app`, `firebase/auth`) + `firebase-applet-config.json` are scoped exclusively to `src/utils/googleCalendarClient.ts` for opt-in client-side Google Calendar sign-in; all core barn workflows remain 100% offline-first with `.ics` fallback.

3. **Strict Species Isolation:**
   - Every animal, breeding, task, cage, care log, and show carries an explicit `species` field.
   - `useBarnStore.ts` computes `activeSpeciesData` via case-insensitive `isSameSpecies(...)` filtering and resets selected animal IDs on species switch so records from one species never leak into another species' Herd, Breeding, or Pedigree screens.

4. **Documentation & Backlog (`docs/plans/`):**
   - Active unimplemented suggestions live in `docs/plans/suggestions-backlog.md` alongside `ARCHITECTURE.md` and `IMPROVEMENTS.md` so roadmap items persist across GitHub syncs and AI Studio reinstalls.
```

## `IMPROVEMENTS.md`

````markdown
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

## Logged Improvements (48)

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


````

## `LICENSE`

```
                    GNU AFFERO GENERAL PUBLIC LICENSE
                       Version 3, 19 November 2007

 Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>
 Everyone is permitted to copy and distribute verbatim copies
 of this license document, but changing it is not allowed.

                            Preamble

  The GNU Affero General Public License is a free, copyleft license for
software and other kinds of works, specifically designed to ensure
cooperation with the community in the case of network server software.

  The licenses for most software and other practical works are designed
to take away your freedom to share and change the works.  By contrast,
our General Public Licenses are intended to guarantee your freedom to
share and change all versions of a program--to make sure it remains free
software for all its users.

  When we speak of free software, we are referring to freedom, not
price.  Our General Public Licenses are designed to make sure that you
have the freedom to distribute copies of free software (and charge for
them if you wish), that you receive source code or can get it if you
want it, that you can change the software or use pieces of it in new
free programs, and that you know you can do these things.

  Developers that use our General Public Licenses protect your rights
with two steps: (1) assert copyright on the software, and (2) offer
you this License which gives you legal permission to copy, distribute
and/or modify the software.

  A secondary benefit of defending all users' freedom is that
improvements made in alternate versions of the program, if they
receive widespread use, become available for other developers to
incorporate.  Many developers of free software are heartened and
encouraged by the resulting cooperation.  However, in the case of
software used on network servers, this result may fail to come about.
The GNU General Public License permits making a modified version and
letting the public access it on a server without ever releasing its
source code to the public.

  The GNU Affero General Public License is designed specifically to
ensure that, in such cases, the modified source code becomes available
to the community.  It requires the operator of a network server to
provide the source code of the modified version running there to the
users of that server.  Therefore, public use of a modified version, on
a publicly accessible server, gives the public access to the source
code of the modified version.

  An older license, called the Affero General Public License and
published by Affero, was designed to accomplish similar goals.  This is
a different license, not a version of the Affero GPL, but Affero has
released a new version of the Affero GPL which permits relicensing under
this license.

  The precise terms and conditions for copying, distribution and
modification follow.

                       TERMS AND CONDITIONS

  0. Definitions.

  "This License" refers to version 3 of the GNU Affero General Public License.

  "Copyright" also means copyright-like laws that apply to other kinds of
works, such as semiconductor masks.

  "The Program" refers to any copyrightable work licensed under this
License.  Each licensee is addressed as "you".  "Licensees" and
"recipients" may be individuals or organizations.

  To "modify" a work means to copy from or adapt all or part of the work
in a fashion requiring copyright permission, other than the making of an
exact copy.  The resulting work is called a "modified version" of the
earlier work or a work "based on" the earlier work.

  A "covered work" means either the unmodified Program or a work based
on the Program.

  To "propagate" a work means to do anything with it that, without
permission, would make you directly or secondarily liable for
infringement under applicable copyright law, except executing it on a
computer or modifying a private copy.  Propagation includes copying,
distribution (with or without modification), making available to the
public, and in some countries other activities as well.

  To "convey" a work means any kind of propagation that enables other
parties to make or receive copies.  Mere interaction with a user through
a computer network, with no transfer of a copy, is not conveying.

  An interactive user interface displays "Appropriate Legal Notices"
to the extent that it includes a convenient and prominently visible
feature that (1) displays an appropriate copyright notice, and (2)
tells the user that there is no warranty for the work (except to the
extent that warranties are provided), that licensees may convey the
work under this License, and how to view a copy of this License.  If
the interface presents a list of user commands or options, such as a
menu, a prominent item in the list meets this criterion.

  1. Source Code.

  The "source code" for a work means the preferred form of the work
for making modifications to it.  "Object code" means any non-source
form of a work.

  A "Standard Interface" means an interface that either is an official
standard defined by a recognized standards body, or, in the case of
interfaces specified for a particular programming language, one that
is widely used among developers working in that language.

  The "System Libraries" of an executable work include anything, other
than the work as a whole, that (a) is included in the normal form of
packaging a Major Component, but which is not part of that Major
Component, and (b) serves only to enable use of the work with that
Major Component, or to implement a Standard Interface for which an
implementation is available to the public in source code form.  A
"Major Component", in this context, means a major essential component
(kernel, window system, and so on) of the specific operating system
(if any) on which the executable work runs, or a compiler used to
produce the work, or an object code interpreter used to run it.

  The "Corresponding Source" for a work in object code form means all
the source code needed to generate, install, and (for an executable
work) run the object code and to modify the work, including scripts to
control those activities.  However, it does not include the work's
System Libraries, or general-purpose tools or generally available free
programs which are used unmodified in performing those activities but
which are not part of the work.  For example, Corresponding Source
includes interface definition files associated with source files for
the work, and the source code for shared libraries and dynamically
linked subprograms that the work is specifically designed to require,
such as by intimate data communication or control flow between those
subprograms and other parts of the work.

  The Corresponding Source need not include anything that users
can regenerate automatically from other parts of the Corresponding
Source.

  The Corresponding Source for a work in source code form is that
same work.

  2. Basic Permissions.

  All rights granted under this License are granted for the term of
copyright on the Program, and are irrevocable provided the stated
conditions are met.  This License explicitly affirms your unlimited
permission to run the unmodified Program.  The output from running a
covered work is covered by this License only if the output, given its
content, constitutes a covered work.  This License acknowledges your
rights of fair use or other equivalent, as provided by copyright law.

  You may make, run and propagate covered works that you do not
convey, without conditions so long as your license otherwise remains
in force.  You may convey covered works to others for the sole purpose
of having them make modifications exclusively for you, or provide you
with facilities for running those works, provided that you comply with
the terms of this License in conveying all material for which you do
not control copyright.  Those thus making or running the covered works
for you must do so exclusively on your behalf, under your direction
and control, on terms that prohibit them from making any copies of
your copyrighted material outside their relationship with you.

  Conveying under any other circumstances is permitted solely under
the conditions stated below.  Sublicensing is not allowed; section 10
makes it unnecessary.

  3. Protecting Users' Legal Rights From Anti-Circumvention Law.

  No covered work shall be deemed part of an effective technological
measure under any applicable law fulfilling obligations under article
11 of the WIPO copyright treaty adopted on 20 December 1996, or
similar laws prohibiting or restricting circumvention of such
measures.

  When you convey a covered work, you waive any legal power to forbid
circumvention of technological measures to the extent such circumvention
is effected by exercising rights under this License with respect to
the covered work, and you disclaim any intention to limit operation or
modification of the work as a means of enforcing, against the work's
users, your or third parties' legal rights to forbid circumvention of
technological measures.

  4. Conveying Verbatim Copies.

  You may convey verbatim copies of the Program's source code as you
receive it, in any medium, provided that you conspicuously and
appropriately publish on each copy an appropriate copyright notice;
keep intact all notices stating that this License and any
non-permissive terms added in accord with section 7 apply to the code;
keep intact all notices of the absence of any warranty; and give all
recipients a copy of this License along with the Program.

  You may charge any price or no price for each copy that you convey,
and you may offer support or warranty protection for a fee.

  5. Conveying Modified Source Versions.

  You may convey a work based on the Program, or the modifications to
produce it from the Program, in the form of source code under the
terms of section 4, provided that you also meet all of these conditions:

    a) The work must carry prominent notices stating that you modified
    it, and giving a relevant date.

    b) The work must carry prominent notices stating that it is
    released under this License and any conditions added under section
    7.  This requirement modifies the requirement in section 4 to
    "keep intact all notices".

    c) You must license the entire work, as a whole, under this
    License to anyone who comes into possession of a copy.  This
    License will therefore apply, along with any applicable section 7
    additional terms, to the whole of the work, and all its parts,
    regardless of how they are packaged.  This License gives no
    permission to license the work in any other way, but it does not
    invalidate such permission if you have separately received it.

    d) If the work has interactive user interfaces, each must display
    Appropriate Legal Notices; however, if the Program has interactive
    interfaces that do not display Appropriate Legal Notices, your
    work need not make them do so.

  A compilation of a covered work with other separate and independent
works, which are not by their nature extensions of the covered work,
and which are not combined with it such as to form a larger program,
in or on a volume of a storage or distribution medium, is called an
"aggregate" if the compilation and its resulting copyright are not
used to limit the access or legal rights of the compilation's users
beyond what the individual works permit.  Inclusion of a covered work
in an aggregate does not cause this License to apply to the other
parts of the aggregate.

  6. Conveying Non-Source Forms.

  You may convey a covered work in object code form under the terms
of sections 4 and 5, provided that you also convey the
machine-readable Corresponding Source under the terms of this License,
in one of these ways:

    a) Convey the object code in, or embodied in, a physical product
    (including a physical distribution medium), accompanied by the
    Corresponding Source fixed on a durable physical medium
    customarily used for software interchange.

    b) Convey the object code in, or embodied in, a physical product
    (including a physical distribution medium), accompanied by a
    written offer, valid for at least three years and valid for as
    long as you offer spare parts or customer support for that product
    model, to give anyone who possesses the object code either (1) a
    copy of the Corresponding Source for all the software in the
    product that is covered by this License, on a durable physical
    medium customarily used for software interchange, for a price no
    more than your reasonable cost of physically performing this
    conveying of source, or (2) access to copy the
    Corresponding Source from a network server at no charge.

    c) Convey individual copies of the object code with a copy of the
    written offer to provide the Corresponding Source.  This
    alternative is allowed only occasionally and noncommercially, and
    only if you received the object code with such an offer, in accord
    with subsection 6b.

    d) Convey the object code by offering access from a designated
    place (gratis or for a charge), and offer equivalent access to the
    Corresponding Source in the same way through the same place at no
    further charge.  You need not require recipients to copy the
    Corresponding Source along with the object code.  If the place to
    copy the object code is a network server, the Corresponding Source
    may be on a different server (operated by you or a third party)
    that supports equivalent copying facilities, provided you maintain
    clear directions next to the object code saying where to find the
    Corresponding Source.  Regardless of what server hosts the
    Corresponding Source, you remain obligated to ensure that it is
    available for as long as needed to satisfy these requirements.

    e) Convey the object code using peer-to-peer transmission, provided
    you inform other peers where the object code and Corresponding
    Source of the work are being offered to the general public at no
    charge under subsection 6d.

  A separable portion of the object code, whose source code is excluded
from the Corresponding Source as a System Library, need not be
included in conveying the object code work.

  A "User Product" is either (1) a "consumer product", which means any
tangible personal property which is normally used for personal, family,
or household purposes, or (2) anything designed or sold for incorporation
into a dwelling.  In determining whether a product is a consumer product,
doubtful cases shall be resolved in favor of coverage.  For a particular
product received by a particular user, "normally used" refers to a
typical or common use of that class of product, regardless of the status
of the particular user or of the way in which the particular user
actually uses, or expects or is expected to use, the product.  A product
is a consumer product regardless of whether the product has substantial
commercial, industrial or non-consumer uses, unless such uses represent
the only significant mode of use of the product.

  "Installation Information" for a User Product means any methods,
procedures, authorization keys, or other information required to install
and execute modified versions of a covered work in that User Product from
a modified version of its Corresponding Source.  The information must
suffice to ensure that the continued functioning of the modified object
code is in no case prevented or interfered with solely because
modification has been made.

  If you convey an object code work under this section in, or with, or
specifically for use in, a User Product, and the conveying occurs as
part of a transaction in which the right of possession and use of the
User Product is transferred to the recipient in perpetuity or for a
fixed term (regardless of how the transaction is characterized), the
Corresponding Source conveyed under this section must be accompanied
by the Installation Information.  But this requirement does not apply
if neither you nor any third party retains the ability to install
modified object code on the User Product (for example, the work has
been installed in ROM).

  The requirement to provide Installation Information does not include a
requirement to continue to provide support service, warranty, or updates
for a work that has been modified or installed by the recipient, or for
the User Product in which it has been modified or installed.  Access to a
network may be denied when the modification itself materially and
adversely affects the operation of the network or violates the rules and
protocols for communication across the network.

  Corresponding Source conveyed, and Installation Information provided,
in accord with this section must be in a format that is publicly
documented (and with an implementation available to the public in
source code form), and must require no special password or key for
unpacking, reading or copying.

  7. Additional Terms.

  "Additional permissions" are terms that supplement the terms of this
License by making exceptions from one or more of its conditions.
Additional permissions that are applicable to the entire Program shall
be treated as though they were included in this License, to the extent
that they are valid under applicable law.  If additional permissions
apply only to part of the Program, that part may be used separately
under those permissions, but the entire Program remains governed by
this License without regard to the additional permissions.

  When you convey a copy of a covered work, you may at your option
remove any additional permissions from that copy, or from any part of
it.  (Additional permissions may be written to require their own
removal in certain cases when you modify the work.)  You may place
additional permissions on material, added by you to a covered work,
for which you have or can give appropriate copyright permission.

  Notwithstanding any other provision of this License, for material you
add to a covered work, you may (if authorized by the copyright holders of
that material) supplement the terms of this License with terms:

    a) Disclaiming warranty or limiting liability differently from the
    terms of sections 15 and 16 of this License; or

    b) Requiring preservation of specified reasonable legal notices or
    author attributions in that material or in the Appropriate Legal
    Notices displayed by works containing it; or

    c) Prohibiting misrepresentation of the origin of that material, or
    requiring that modified versions of such material be marked in
    reasonable ways as different from the original version; or

    d) Limiting the use for publicity purposes of names of licensors or
    authors of the material; or

    e) Declining to grant rights under trademark law for use of some
    trade names, trademarks, or service marks; or

    f) Requiring indemnification of licensors and authors of that
    material by anyone who conveys the material (or modified versions of
    it) with contractual assumptions of liability to the recipient, for
    any liability that these contractual assumptions directly impose on
    those licensors and authors.

  All other non-permissive additional terms are considered "further
restrictions" within the meaning of section 10.  If the Program as you
received it, or any part of it, contains a notice stating that it is
governed by this License along with a term that is a further
restriction, you may remove that term.  If a license document contains
a further restriction but permits relicensing or conveying under this
License, you may add to a covered work material governed by the terms
of that license document, provided that the further restriction does
not survive such relicensing or conveying.

  If you add terms to a covered work in accord with this section, you
must place, in the relevant source files, a statement of the
additional terms that apply to those files, or a notice indicating
where to find the applicable terms.

  Additional terms, permissive or non-permissive, may be stated in the
form of a separately written license, or stated as exceptions;
the above requirements apply either way.

  8. Termination.

  You may not propagate or modify a covered work except as expressly
provided under this License.  Any attempt otherwise to propagate or
modify it is void, and will automatically terminate your rights under
this License (including any patent licenses granted under the third
paragraph of section 11).

  However, if you cease all violation of this License, then your
license from a particular copyright holder is reinstated (a)
provisionally, unless and until the copyright holder explicitly and
finally terminates your license, and (b) permanently, if the copyright
holder fails to notify you of the violation by some reasonable means
prior to 60 days after the cessation.

  Moreover, your license from a particular copyright holder is
reinstated permanently if the copyright holder notifies you of the
violation by some reasonable means, this is the first time you have
received notice of violation of this License (for any work) from that
copyright holder, and you cure the violation prior to 30 days after
your receipt of the notice.

  Termination of your rights under this section does not terminate the
licenses of parties who have received copies or rights from you under
this License.  If your rights have been terminated and not permanently
reinstated, you do not qualify to receive new licenses for the same
material under section 10.

  9. Acceptance Not Required for Having Copies.

  You are not required to accept this License in order to receive or
run a copy of the Program.  Ancillary propagation of a covered work
occurring solely as a consequence of using peer-to-peer transmission
to receive a copy likewise does not require acceptance.  However,
nothing other than this License grants you permission to propagate or
modify any covered work.  These actions infringe copyright if you do
not accept this License.  Therefore, by modifying or propagating a
covered work, you indicate your acceptance of this License to do so.

  10. Automatic Licensing of Downstream Recipients.

  Each time you convey a covered work, the recipient automatically
receives a license from the original licensors, to run, modify and
propagate that work, subject to this License.  You are not responsible
for enforcing compliance by third parties with this License.

  An "entity transaction" is a transaction transferring control of an
organization, or substantially all assets of one, or subdividing an
organization, or merging organizations.  If propagation of a covered
work results from an entity transaction, each party to that
transaction who receives a copy of the work also receives whatever
licenses to the work the party's predecessor in interest had or could
give under the previous paragraph, plus a right to possession of the
Corresponding Source of the work from the predecessor in interest, if
the predecessor has it or can get it with reasonable efforts.

  You may not impose any further restrictions on the exercise of the
rights granted or affirmed under this License.  For example, you may
not impose a license fee, royalty, or other charge for exercise of
rights granted under this License, and you may not initiate litigation
(including a cross-claim or counterclaim in a lawsuit) alleging that
any patent claim is infringed by making, using, selling, offering for
sale, or importing the Program or any portion of it.

  11. Patents.

  A "contributor" is a copyright holder who authorizes use under this
License of the Program or a work on which the Program is based.  The
work thus licensed is called the contributor's "contributor version".

  A contributor's "essential patent claims" are all patent claims
owned or controlled by the contributor, whether already acquired or
hereafter acquired, that would be infringed by some manner, permitted
by this License, of making, using, or selling its contributor version,
but do not include claims that would be infringed only as a
consequence of further modification of the contributor version.  For
purposes of this definition, "control" includes the right to grant
patent sublicenses in a manner consistent with the requirements of
this License.

  Each contributor grants you a non-exclusive, worldwide, royalty-free
patent license under the contributor's essential patent claims, to
make, use, sell, offer for sale, import and otherwise run, modify and
propagate the contents of its contributor version.

  In the following three paragraphs, a "patent license" is any express
agreement or commitment, however denominated, not to enforce a patent
(such as an express permission to practice a patent or covenant not to
sue for patent infringement).  To "grant" such a patent license to a
party means to make such an agreement or commitment not to enforce a
patent against the party.

  If you convey a covered work, knowingly relying on a patent license,
and the Corresponding Source of the work is not available for anyone
to copy, free of charge and under the terms of this License, through a
publicly available network server or other readily accessible means,
then you must either (1) cause the Corresponding Source to be so
available, or (2) arrange to deprive yourself of the benefit of the
patent license for this particular work, or (3) arrange, in a manner
consistent with the requirements of this License, to extend the patent
license to downstream recipients.  "Knowingly relying" means you have
actual knowledge that, but for the patent license, your conveying the
covered work in a country, or your recipient's use of the covered work
in a country, would infringe one or more identifiable patents in that
country that you have reason to believe are valid.

  If, pursuant to or in connection with a single transaction or
arrangement, you convey, or propagate by procuring conveyance of, a
covered work, and grant a patent license to some of the parties
receiving the covered work authorizing them to use, propagate, modify
or convey a specific copy of the covered work, then the patent license
you grant is automatically extended to all recipients of the covered
work and works based on it.

  A patent license is "discriminatory" if it does not include within
the scope of its coverage, prohibits the exercise of, or is
conditioned on the non-exercise of one or more of the rights that are
specifically granted under this License.  You may not convey a covered
work if you are a party to an arrangement with a third party that is
in the business of distributing software, under which you make payment
to the third party based on the extent of your activity of conveying
the work, and under which the third party grants, to any of the
parties who would receive the covered work from you, a discriminatory
patent license (a) in connection with copies of the covered work
conveyed by you (or copies made from those copies), or (b) primarily
for and in connection with specific products or compilations that
contain the covered work, unless you entered into that arrangement,
or that patent license was granted, prior to 28 March 2007.

  Nothing in this License shall be construed as excluding or limiting
any implied license or other defenses to infringement that may
otherwise be available to you under applicable patent law.

  12. No Surrender of Others' Freedom.

  If conditions are imposed on you (whether by court order, agreement or
otherwise) that contradict the conditions of this License, they do not
excuse you from the conditions of this License.  If you cannot convey a
covered work so as to satisfy simultaneously your obligations under this
License and any other pertinent obligations, then as a consequence you may
not convey it at all.  For example, if you agree to terms that obligate you
to collect a royalty for further conveying from those to whom you convey
the Program, the only way you could satisfy both those terms and this
License would be to refrain entirely from conveying the Program.

  13. Remote Network Interaction; Use with the GNU General Public License.

  Notwithstanding any other provision of this License, if you modify the
Program, your modified version must prominently offer all users
interacting with it remotely through a computer network (if your version
supports such interaction) an opportunity to receive the Corresponding
Source of your version by providing access to the Corresponding Source
from a network server at no charge, through some standard or customary
means of facilitating copying of software.  This Corresponding Source
shall include the Corresponding Source for any work covered by version 3
of the GNU General Public License that is incorporated pursuant to the
following paragraph.

  Notwithstanding any other provision of this License, you have
permission to link or combine any covered work with a work licensed
under version 3 of the GNU General Public License into a single
combined work, and to convey the resulting work.  The terms of this
License will continue to apply to the part which is the covered work,
but the work with which it is combined will remain governed by version
3 of the GNU General Public License.

  14. Revised Versions of this License.

  The Free Software Foundation may publish revised and/or new versions of
the GNU Affero General Public License from time to time.  Such new versions
will be similar in spirit to the present version, but may differ in detail to
address new problems or concerns.

  Each version is given a distinguishing version number.  If the
Program specifies that a certain numbered version of the GNU Affero General
Public License "or any later version" applies to it, you have the
option of following the terms and conditions either of that numbered
version or of any later version published by the Free Software
Foundation.  If the Program does not specify a version number of the
GNU Affero General Public License, you may choose any version ever published
by the Free Software Foundation.

  If the Program specifies that a proxy can decide which future
versions of the GNU Affero General Public License can be used, that proxy's
public statement of acceptance of a version permanently authorizes you
to choose that version for the Program.

  Later license versions may give you additional or different
permissions.  However, no additional obligations are imposed on any
author or copyright holder as a result of your choosing to follow a
later version.

  15. Disclaimer of Warranty.

  THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY
APPLICABLE LAW.  EXCEPT WHEN OTHERWISE STATED IN WRITING THE COPYRIGHT
HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM "AS IS" WITHOUT WARRANTY
OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO,
THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
PURPOSE.  THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM
IS WITH YOU.  SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF
ALL NECESSARY SERVICING, REPAIR OR CORRECTION.

  16. Limitation of Liability.

  IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING
WILL ANY COPYRIGHT HOLDER, OR ANY OTHER PARTY WHO MODIFIES AND/OR CONVEYS
THE PROGRAM AS PERMITTED ABOVE, BE LIABLE TO YOU FOR DAMAGES, INCLUDING ANY
GENERAL, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE
USE OR INABILITY TO USE THE PROGRAM (INCLUDING BUT NOT LIMITED TO LOSS OF
DATA OR DATA BEING RENDERED INACCURATE OR LOSSES SUSTAINED BY YOU OR THIRD
PARTIES OR A FAILURE OF THE PROGRAM TO OPERATE WITH ANY OTHER PROGRAMS),
EVEN IF SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF
SUCH DAMAGES.

  17. Interpretation of Sections 15 and 16.

  If the disclaimer of warranty and limitation of liability provided
above cannot be given local legal effect according to their terms,
reviewing courts shall apply local law that most closely approximates
an absolute waiver of all civil liability in connection with the
Program, unless a warranty or assumption of liability accompanies a
copy of the Program in return for a fee.

                     END OF TERMS AND CONDITIONS

            How to Apply These Terms to Your New Programs

  If you develop a new program, and you want it to be of the greatest
possible use to the public, the best way to achieve this is to make it
free software which everyone can redistribute and change under these terms.

  To do so, attach the following notices to the program.  It is safest
to attach them to the start of each source file to most effectively
state the exclusion of warranty; and each file should have at least
the "copyright" line and a pointer to where the full notice is found.

    <one line to give the program's name and a brief idea of what it does.>
    Copyright (C) <year>  <name of author>

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.

Also add information on how to contact you by electronic and paper mail.

  If your software can interact with users remotely through a computer
network, you should also make sure that it provides a way for users to
get its source.  For example, if your program is a web application, its
interface could display a "Source" link that leads users to an archive
of the code.  There are many ways you could offer source, and different
solutions will be better for different programs; see section 13 for the
specific requirements.

  You should also get your employer (if you work as a programmer) or school,
if any, to sign a "copyright disclaimer" for the program, if necessary.
For more information on this, and how to apply and follow the GNU AGPL, see
<https://www.gnu.org/licenses/>.
```

## `README.md`

````markdown
# Community Pedigree Project

- **Project Name:** Community Pedigree Project
- **App Name:** Community Pedigree
- **Repository:** [`AskKim/Pedigree`](https://github.com/AskKim/Pedigree) (GitHub paths stay `AskKim/Pedigree`)
- **Package Name:** `pedigree` (lowercase package identifier for `package.json` and the eventual `.apk` / bundle ID segment, e.g., `<reverse-domain>.pedigree`)
- **License:** GNU AGPLv3 (`AGPL-3.0-or-later`) — see [LICENSE](./LICENSE)

**Community Pedigree** is an open-source, offline-first livestock registry, cage-side breeding & chore manager, coat color genetics lab, and recursive Wright Coefficient of Inbreeding (COI) pedigree engine—initially tailored for ARBA **New Zealand Red** rabbitry workflows and built out across multi-species livestock.

## Key Capabilities

- **Zero Lock-In Unencrypted Local SQLite:** Runs standard relational SQLite locally on your hardware (`sql.js` WebAssembly + IndexedDB in browsers; ready for `expo-sqlite` on native Android/iOS) with zero accounts, subscriptions, or proprietary cloud servers.
- **Multi-Species Barn Hub + Startup Pinning:** Configure biological gestation, weaning, rebreeding, and Master Task List rules across 9 built-in livestock presets (**Rabbit, Goat, Sheep, Swine / Pig, Cattle, Guinea Pig, Chinchilla, Ferret, Alpaca**) or custom species. Pin any species hub to launch straight into it on startup, or open on the All-Species Barn Home page.
- **Strict Per-Species Isolation:** Each species workspace strictly scopes its Herd, Sire/Dam pickers, Breeding & COI Lab, Barn Chores, Cages, Shows, and Pedigree Explorer to that species alone.
- **Automated Master Task List Chore Cascading:** Logging a breeding automatically calculates and schedules downstream chores (e.g., Day 14 Palpation, Day 28 Place Nestbox, Day 31 Expected Kindling, Day 42 Weaning, and Rebreed readiness).
- **Recursive Pedigree & Wright COI Engine:** Interactive 3- and 4-generation pan/zoom Bezier pedigree trees with exact memoized coancestry COI, shared ancestor path decomposition, and linebreeding occurrence indicators (`2×`, `3×`).
- **Coat Color Genetics & Allele Inference:** Structured ARBA rabbit coat color loci (`A, B, C, D, E, W, En, V, Du`), hidden recessive allele inference from parents and offspring, genetic conflict detection, and test-breeding Punnett predictions.
- **Open Portability & Multi-Device Sync:** 1-click exports to raw `.sqlite`, `.json` (v5 + backward-compatible import of v3/v4 backups), `.csv`, Evans-compatible `.HTM` pedigrees, printable PDF pedigree certificates, and 4"×2" thermal cage cards, plus deterministic UUID + ISO-8601 `updatedAt` multi-device file merging.

## Local Development

```bash
npm install
npm run dev
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the pure TypeScript domain layout and Expo / React Native migration guide.
````

## `firebase-applet-config.json`

```json
{
  "projectId": "gen-lang-client-0793029558",
  "appId": "1:945867233541:web:bf6ed0d48e8c86cd6dbf6c",
  "apiKey": "AIzaSyDlu88x2Qb1osV6oxr8WXl3Udvmw6hMHEI",
  "authDomain": "gen-lang-client-0793029558.firebaseapp.com",
  "storageBucket": "gen-lang-client-0793029558.firebasestorage.app",
  "messagingSenderId": "945867233541",
  "measurementId": "",
  "oAuthClientId": "945867233541-rbf569uvvrt58t8lv5k929eqe7juko3u.apps.googleusercontent.com",
  "recaptchaSiteKey": ""
}
```

## `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#141814" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Pedigree" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <title>Community Pedigree</title>
    <meta name="description" content="Community Pedigree Project (Package: Pedigree) — Open-source multi-platform pedigree project." />
    <meta property="og:title" content="Community Pedigree" />
    <meta property="og:description" content="Community Pedigree Project (Package: Pedigree) — Open-source multi-platform pedigree project." />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <style>
      .pedigree-preflight-wrap {
        min-height: 100vh;
        background-color: #f2e9da;
        color: #241e18;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        padding: 24px 16px;
        box-sizing: border-box;
      }
      .pedigree-preflight-card {
        max-width: 560px;
        margin: 24px auto;
        background-color: #faf5eb;
        border: 1px solid #cfc0a8;
        border-radius: 16px;
        padding: 24px;
        box-shadow: 0 6px 24px rgba(36, 30, 24, 0.08);
      }
      .pedigree-preflight-badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 8px;
        background-color: #f5e1d5;
        border: 1px solid #a84b28;
        color: #8c3f20;
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 12px;
      }
      .pedigree-preflight-title {
        margin: 0 0 10px 0;
        font-size: 22px;
        line-height: 1.25;
        color: #241e18;
      }
      .pedigree-preflight-text {
        margin: 0 0 14px 0;
        font-size: 14px;
        line-height: 1.55;
        color: #4a4035;
      }
      .pedigree-preflight-list {
        margin: 0 0 16px 0;
        padding-left: 20px;
        font-size: 13px;
        line-height: 1.55;
        color: #241e18;
      }
      .pedigree-preflight-list li {
        margin-bottom: 6px;
      }
      .pedigree-preflight-btn {
        display: inline-block;
        padding: 10px 18px;
        border-radius: 10px;
        border: none;
        background-color: #2d5e3f;
        color: #fff8f0;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .pedigree-preflight-btn:focus-visible {
        outline: 2px solid #2d5e3f;
        outline-offset: 2px;
      }
      @media (prefers-color-scheme: dark) {
        .pedigree-preflight-wrap {
          background-color: #141814;
          color: #ede5d6;
        }
        .pedigree-preflight-card {
          background-color: #1c221c;
          border-color: #344034;
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
        }
        .pedigree-preflight-badge {
          background-color: #3d241c;
          border-color: #c96842;
          color: #f4b79e;
        }
        .pedigree-preflight-title,
        .pedigree-preflight-list {
          color: #ede5d6;
        }
        .pedigree-preflight-text {
          color: #c2b8a6;
        }
        .pedigree-preflight-btn {
          background-color: #3a7550;
          color: #fff8f0;
        }
        .pedigree-preflight-btn:focus-visible {
          outline-color: #88c096;
        }
      }
    </style>
  </head>
  <body>
    <noscript>
      <div class="pedigree-preflight-wrap">
        <div class="pedigree-preflight-card">
          <div class="pedigree-preflight-badge">JavaScript Required</div>
          <h1 class="pedigree-preflight-title">Community Pedigree Needs JavaScript Enabled</h1>
          <p class="pedigree-preflight-text">
            Community Pedigree stores your herd records and pedigrees directly inside your browser
            with zero cloud servers. Please enable JavaScript in your browser settings and reload.
          </p>
        </div>
      </div>
    </noscript>
    <div id="pedigree-preflight-guard" style="display:none;"></div>
    <div id="root"></div>
    <script>
      (function () {
        var CRASH_TS_KEY = 'pedigree_boot_crash_ts';
        var PENDING_BOOT_KEY = 'pedigree_pending_boot_ts';
        var CRASH_WINDOW_MS = 60000;
        var MAX_CRASHES = 3;
        var bootStartedAt = Date.now();

        function parseTsList(raw) {
          if (!raw) return [];
          try {
            var parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            var out = [];
            for (var i = 0; i < parsed.length; i++) {
              if (typeof parsed[i] === 'number' && isFinite(parsed[i])) {
                out.push(parsed[i]);
              }
            }
            return out;
          } catch (e) {
            return [];
          }
        }

        function filterRecentTs(list, now) {
          var kept = [];
          for (var i = 0; i < list.length; i++) {
            var age = now - list[i];
            if (age >= 0 && age <= CRASH_WINDOW_MS) {
              kept.push(list[i]);
            }
          }
          return kept;
        }

        function readSessionValue(key) {
          try {
            return window.sessionStorage ? window.sessionStorage.getItem(key) : null;
          } catch (e) {
            return null;
          }
        }

        function writeSessionValue(key, val) {
          try {
            if (!window.sessionStorage) return;
            if (val === null) {
              window.sessionStorage.removeItem(key);
            } else {
              window.sessionStorage.setItem(key, val);
            }
          } catch (e) {
            // Ignore private/restricted sessionStorage
          }
        }

        function purgeSwAndCachesPreservingDb(onDone) {
          var tasks = [];
          try {
            if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
              tasks.push(
                navigator.serviceWorker.getRegistrations().then(function (regs) {
                  var unreg = [];
                  for (var i = 0; i < regs.length; i++) {
                    unreg.push(regs[i].unregister());
                  }
                  return Promise.all(unreg);
                })
              );
            }
          } catch (e) {
            // Ignore SW error
          }
          try {
            if ('caches' in window && window.caches && window.caches.keys) {
              tasks.push(
                window.caches.keys().then(function (keys) {
                  var dels = [];
                  for (var i = 0; i < keys.length; i++) {
                    dels.push(window.caches.delete(keys[i]));
                  }
                  return Promise.all(dels);
                })
              );
            }
          } catch (e) {
            // Ignore CacheStorage error
          }
          if (typeof Promise === 'function' && Promise.all && tasks.length > 0) {
            Promise.all(tasks).then(
              function () { if (onDone) onDone(); },
              function () { if (onDone) onDone(); }
            );
          } else if (onDone) {
            onDone();
          }
        }

        window.__PEDIGREE_RECORD_BOOT_CRASH__ = function () {
          var now = Date.now();
          if (now - bootStartedAt > CRASH_WINDOW_MS) return;
          var list = filterRecentTs(parseTsList(readSessionValue(CRASH_TS_KEY)), now);
          list.push(now);
          writeSessionValue(CRASH_TS_KEY, JSON.stringify(list));
        };

        window.__PEDIGREE_MARK_BOOT_STABLE__ = function () {
          writeSessionValue(CRASH_TS_KEY, null);
          writeSessionValue(PENDING_BOOT_KEY, null);
        };

        function escapeHtmlText(text) {
          return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        }

        function renderNoticeCard(opts) {
          window.__PEDIGREE_PREFLIGHT_BLOCKED__ = true;
          var rootEl = document.getElementById('root');
          if (rootEl) {
            rootEl.style.display = 'none';
          }
          var guardEl = document.getElementById('pedigree-preflight-guard');
          if (!guardEl) return;
          guardEl.style.display = 'block';

          var itemsHtml = '';
          for (var i = 0; i < opts.bullets.length; i++) {
            itemsHtml += '<li>' + escapeHtmlText(opts.bullets[i]) + '</li>';
          }

          guardEl.innerHTML =
            '<div class="pedigree-preflight-wrap" role="alert">' +
              '<div class="pedigree-preflight-card">' +
                '<div class="pedigree-preflight-badge">' + escapeHtmlText(opts.badge) + '</div>' +
                '<h1 class="pedigree-preflight-title">' + escapeHtmlText(opts.title) + '</h1>' +
                '<p class="pedigree-preflight-text">' + escapeHtmlText(opts.intro) + '</p>' +
                (itemsHtml ? '<ul class="pedigree-preflight-list">' + itemsHtml + '</ul>' : '') +
                '<p class="pedigree-preflight-text">' + opts.footerHtml + '</p>' +
                '<button type="button" class="pedigree-preflight-btn" id="pedigree-preflight-action-btn">' +
                  escapeHtmlText(opts.buttonLabel) +
                '</button>' +
              '</div>' +
            '</div>';

          var actionBtn = document.getElementById('pedigree-preflight-action-btn');
          if (actionBtn) {
            actionBtn.onclick = opts.onAction;
          }
        }

        var searchStr = window.location && window.location.search ? String(window.location.search) : '';
        var isEmergencyReset = /(?:^|[?&])emergency_reset=true(?:&|$)/i.test(searchStr);

        if (isEmergencyReset) {
          writeSessionValue(CRASH_TS_KEY, null);
          writeSessionValue(PENDING_BOOT_KEY, null);
          purgeSwAndCachesPreservingDb(function () {
            try {
              if (window.history && window.history.replaceState) {
                var cleanSearch = searchStr
                  .replace(/([?&])emergency_reset=true(&|$)/i, function (_m, p1, p2) {
                    return p2 ? p1 : '';
                  })
                  .replace(/[?&]$/, '');
                var cleanUrl =
                  window.location.pathname + cleanSearch + (window.location.hash || '');
                window.history.replaceState(null, '', cleanUrl);
              }
            } catch (e) {
              // Ignore history rewrite error
            }
          });
          renderNoticeCard({
            badge: 'Emergency Cache Reset',
            title: 'Offline App Cache & Service Workers Cleared',
            intro:
              'Community Pedigree detected ?emergency_reset=true and unregistered cached app workers so fresh scripts can load.',
            bullets: [
              'Your IndexedDB / SQLite herd records and animal photos were NOT deleted.',
              'If an incomplete cached update was looping, launching fresh below will restore clean startup.'
            ],
            footerHtml:
              '<strong>Ready when you are:</strong> Click below to launch Community Pedigree with clean browser caches.',
            buttonLabel: 'Launch Fresh App',
            onAction: function () {
              window.location.href = window.location.pathname + (window.location.hash || '');
            }
          });
          window.__PEDIGREE_PREFLIGHT__ = {
            passed: false,
            wasmSupported: false,
            blockedReasons: ['Emergency cache reset requested via ?emergency_reset=true']
          };
          return;
        }

        var recentCrashes = filterRecentTs(parseTsList(readSessionValue(CRASH_TS_KEY)), bootStartedAt);
        var pendingBootRaw = readSessionValue(PENDING_BOOT_KEY);
        if (pendingBootRaw) {
          var pendingTs = Number(pendingBootRaw);
          if (isFinite(pendingTs) && bootStartedAt - pendingTs >= 0 && bootStartedAt - pendingTs <= CRASH_WINDOW_MS) {
            recentCrashes.push(pendingTs);
            writeSessionValue(CRASH_TS_KEY, JSON.stringify(recentCrashes));
          }
        }

        if (recentCrashes.length >= MAX_CRASHES) {
          writeSessionValue(CRASH_TS_KEY, null);
          writeSessionValue(PENDING_BOOT_KEY, null);
          purgeSwAndCachesPreservingDb();
          renderNoticeCard({
            badge: 'Startup Recovery Guard',
            title: 'Crash-Loop Protection Activated',
            intro:
              'Community Pedigree detected 3 interrupted startups within 60 seconds and cleared cached Service Worker scripts automatically to break any reload loop.',
            bullets: [
              'Your offline IndexedDB herd records and photos remain safely intact.',
              'Cached offline bundles were purged so the app can fetch clean files.'
            ],
            footerHtml:
              '<strong>Next step:</strong> Reload now, or open <strong>?emergency_reset=true</strong> anytime you need a clean cache reset.',
            buttonLabel: 'Reload Clean App',
            onAction: function () {
              window.location.reload();
            }
          });
          window.__PEDIGREE_PREFLIGHT__ = {
            passed: false,
            wasmSupported: false,
            blockedReasons: ['Startup crash-loop circuit breaker tripped (3 crashes in 60s)']
          };
          return;
        }

        var missingCritical = [];
        var wasmSupported = false;

        try {
          if (typeof Promise !== 'function') {
            missingCritical.push('Standard JavaScript Promises (ES2018)');
          }
        } catch (e) {
          missingCritical.push('Standard JavaScript Promises (ES2018)');
        }

        try {
          if (typeof fetch !== 'function') {
            missingCritical.push('Standard Web Fetch API');
          }
        } catch (e) {
          missingCritical.push('Standard Web Fetch API');
        }

        try {
          if (
            typeof Map !== 'function' ||
            typeof Set !== 'function' ||
            typeof Array.prototype.find !== 'function' ||
            typeof Object.assign !== 'function' ||
            typeof TextEncoder !== 'function'
          ) {
            missingCritical.push('ES2018 standard JavaScript collections & text encoding');
          }
        } catch (e) {
          missingCritical.push('ES2018 standard JavaScript features');
        }

        try {
          var testScript = document.createElement('script');
          if (!('noModule' in testScript)) {
            missingCritical.push('ES Module script support');
          }
        } catch (e) {
          missingCritical.push('ES Module script support');
        }

        try {
          if (typeof window === 'undefined' || !('indexedDB' in window) || !window.indexedDB) {
            missingCritical.push('IndexedDB local database storage (may be disabled in private mode)');
          }
        } catch (e) {
          missingCritical.push('IndexedDB local database storage (blocked by browser privacy settings)');
        }

        try {
          wasmSupported =
            typeof WebAssembly === 'object' &&
            WebAssembly !== null &&
            typeof WebAssembly.instantiate === 'function';
        } catch (e) {
          wasmSupported = false;
        }

        function renderBlockedNotice(reasons, isWatchdogFallback) {
          var heading = isWatchdogFallback
            ? 'This Browser Could Not Finish Loading Community Pedigree'
            : 'Older or Restricted Browser Detected';
          var intro = isWatchdogFallback
            ? 'Your browser appears to be an older version or interrupted loading before the app could start safely.'
            : 'To protect your herd records from silent data loss, Community Pedigree requires local storage and ES2018 browser features that are unavailable right now:';
          renderNoticeCard({
            badge: 'Browser Compatibility Check',
            title: heading,
            intro: intro,
            bullets: reasons,
            footerHtml:
              '<strong>How to fix this:</strong> Use <strong>Chrome 68+</strong>, <strong>Safari 12+</strong>, <strong>Firefox 63+</strong>, or <strong>Edge 79+</strong> (2018+ browsers). ' +
              'If you are already on a supported browser, check that Private/Incognito mode is not blocking IndexedDB, or trigger <a href="?emergency_reset=true">?emergency_reset=true</a> to clear stale caches.',
            buttonLabel: 'Try Reloading Page',
            onAction: function () {
              window.location.reload();
            }
          });
        }

        window.__PEDIGREE_PREFLIGHT__ = {
          passed: missingCritical.length === 0,
          wasmSupported: wasmSupported,
          blockedReasons: missingCritical
        };

        if (missingCritical.length > 0) {
          renderBlockedNotice(missingCritical, false);
          return;
        }

        writeSessionValue(PENDING_BOOT_KEY, String(bootStartedAt));
        window.__PEDIGREE_BOOT_OK__ = false;

        var preBootSyntaxHandled = false;
        window.addEventListener('error', function (ev) {
          if (window.__PEDIGREE_BOOT_OK__ || preBootSyntaxHandled) return;
          var msg = ev && ev.message ? String(ev.message) : '';
          if (/syntaxerror|unexpected token|cannot use import|import\.meta|module/i.test(msg)) {
            preBootSyntaxHandled = true;
            renderBlockedNotice(
              ['This browser could not parse modern app scripts (' + msg + ').'],
              true
            );
          }
        });

        window.setTimeout(function () {
          if (!window.__PEDIGREE_BOOT_OK__ && !window.__PEDIGREE_PREFLIGHT_BLOCKED__) {
            renderBlockedNotice(
              ['Modern ES module startup did not complete cleanly on this browser or connection.'],
              true
            );
          }
        }, 12000);
      })();
    </script>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

## `metadata.json`

```json
{
  "name": "Community Pedigree",
  "description": "Community Pedigree Project (Package: Pedigree) — Open-source multi-platform pedigree project.",
  "requestFramePermissions": [],
  "majorCapabilities": ["MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"]
}
```

## `package.json`

```json
{
  "name": "pedigree",
  "description": "Community Pedigree Project — App Name: Community Pedigree | Repo: AskKim/Pedigree | Package Name: pedigree",
  "license": "AGPL-3.0-or-later",
  "version": "0.1.0-prealpha.1",
  "type": "module",
  "scripts": {
    "dev": "vite --port=3000 --host=0.0.0.0",
    "build": "vite build",
    "preview": "vite preview",
    "clean": "rm -rf dist server.js",
    "lint": "tsc --noEmit",
    "test": "vitest run",
    "verify:improvements": "tsx scripts/verify-improvements.ts"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@types/sql.js": "^1.4.11",
    "@vitejs/plugin-react": "^6.1.1",
    "fflate": "^0.8.3",
    "firebase": "^13.3.0",
    "lucide-react": "^0.546.0",
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "sql.js": "^1.16.0",
    "tesseract.js": "^7.0.0",
    "vite": "^8.3.0"
  },
  "devDependencies": {
    "@types/node": "^22.14.0",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "autoprefixer": "^10.4.21",
    "esbuild": "^0.25.0",
    "tailwindcss": "^4.3.3",
    "tsx": "^4.21.0",
    "typescript": "^7.0.2",
    "vite-plugin-pwa": "^2.0.0",
    "vitest": "^5.1.0"
  }
}
```

## `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2018",
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "module": "ESNext",
    "types": ["vite/client", "vite-plugin-pwa/client"],
    "lib": [
      "ES2018",
      "ES2020.Promise",
      "DOM",
      "DOM.Iterable"
    ],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "moduleDetection": "force",
    "allowJs": true,
    "jsx": "react-jsx",
    "paths": {
      "@/*": [
        "./*"
      ]
    },
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "exclude": ["dist"]
}
```

## `vite.config.ts`

```typescript
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs/promises';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { buildPromptsCatalogManifest } from './src/core/promptsCatalog';

async function scanPromptsFolderOnDisk(rootDir: string) {
  const promptsDir = path.resolve(rootDir, 'prompts');
  const filesByPath: Record<string, string> = {};
  try {
    const entries = await fs.readdir(promptsDir, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
        .map(async (entry) => {
          const fullPath = path.join(promptsDir, entry.name);
          const content = await fs.readFile(fullPath, 'utf8');
          filesByPath[`prompts/${entry.name}`] = content;
        })
    );
  } catch {
    // Return empty manifest if /prompts/ directory is temporarily missing
  }
  return buildPromptsCatalogManifest(filesByPath, new Date().toISOString(), true);
}

function promptsDirectoryPlugin(): Plugin {
  const rootDir = import.meta.dirname;
  return {
    name: 'prompts-directory-manifest',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] || '';
        if (!url.endsWith('/prompts-manifest.json')) {
          next();
          return;
        }
        void scanPromptsFolderOnDisk(rootDir)
          .then((manifest) => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store, max-age=0');
            res.end(JSON.stringify(manifest));
          })
          .catch((err) => {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : 'Failed to scan /prompts/ directory.',
              })
            );
          });
      });
    },
    async generateBundle() {
      const manifest = await scanPromptsFolderOnDisk(rootDir);
      this.emitFile({
        type: 'asset',
        fileName: 'prompts-manifest.json',
        source: JSON.stringify(manifest, null, 2),
      });
    },
  };
}

function devServiceWorkerCleanupPlugin(): Plugin {
  const selfDestructSw = `
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clientsList = await self.clients.matchAll({ type: 'window' });
    for (const client of clientsList) {
      client.postMessage({ type: 'DEV_SW_UNREGISTERED' });
    }
  })());
});
`;
  return {
    name: 'dev-sw-cleanup',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] || '';
        if (url.endsWith('/dev-sw.js') || url.endsWith('/sw.js')) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(selfDestructSw);
          return;
        }
        if (url.endsWith('/version.json') || url.endsWith('/status.json')) {
          res.setHeader('Cache-Control', 'no-store, max-age=0');
        }
        next();
      });
    },
  };
}

export default defineConfig(() => {
  // Hardcoded '/' keeps AI Studio from prompting for VITE_BASE_PATH (IMP-008).
  // GitHub Pages subpath builds run via Bun in .github/workflows/deploy-pages.yml passing `--base=...` on CLI.
  const basePath = '/';

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      devServiceWorkerCleanupPlugin(),
      promptsDirectoryPlugin(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: './',
          name: 'Community Pedigree',
          short_name: 'Pedigree',
          description:
            '100% Free Offline-First Multi-Species Livestock Registry, Pedigree & Barn Chore Manager.',
          theme_color: '#141814',
          background_color: '#141814',
          display: 'standalone',
          orientation: 'any',
          scope: './',
          start_url: './',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//, /\/version\.json$/, /\/status\.json$/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 16,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'lucide-react',
        'fflate',
        'sql.js',
      ],
    },
    build: {
      target: ['es2018', 'chrome68', 'safari12', 'firefox63', 'edge79'],
      cssTarget: ['chrome68', 'safari12', 'firefox63', 'edge79'],
    },
    worker: {
      format: 'es' as const,
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR, WebSocket server, and file watching are hardcoded disabled to prevent preview flickering,
      // mobile iframe reload loops, and AI Studio env-var prompts (production/Pages builds are unaffected).
      hmr: false,
      ws: false as const,
      watch: null,
    },
  };
});
```

## `.github/structure.txt`

```text
Pedigree/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   └── deploy-pages.yml
│   └── structure.txt
├── docs/
│   └── plans/
│       └── suggestions-backlog.md
├── prompts/                               <-- Do not remove prompts without confirmation (update src/components/PromptsDirectoryScreen.tsx, src/core/promptsCatalog.ts, and vite.config.ts if moved)
│   ├── fix_error_log_prompt.md            <-- Active crash & error log remediation prompt
│   ├── master_system_prompt.md            <-- Active Master System Prompt
│   ├── master_system_prompt_old_v1.md     <-- Archived v1 prompt (reference only)
│   ├── master_system_prompt_old_v2.md     <-- Archived v2 prompt (reference only)
│   ├── master_system_prompt_old_v4.md     <-- Archived v4 prompt (reference only)
│   ├── resume_backlog_plan_prompt.md      <-- Active backlog plan continuation prompt
│   └── start_new_backlog_prompt.md        <-- Active backlog plan starter prompt
├── public/
├── scripts/
├── src/
│   ├── components/
│   ├── core/
│   ├── hooks/
│   ├── storage/
│   └── utils/
├── ARCHITECTURE.md
├── IMPROVEMENTS.md
├── LICENSE
├── package.json
└── README.md
```

## `.github/workflows/build-android-apk.yml`

```yaml
name: Build Android APK

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: build-android-apk-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build-android:
    name: Build PWA dist & Android Debug/Release APKs
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Setup Bun
        if: hashFiles('bun.lock', 'bun.lockb') != ''
        uses: oven-sh/setup-bun@v2

      # Builds and verifies the TypeScript bridge + web bundle before packaging into Android assets.
      # Ensure Vite builds with `--base=/` so all asset URLs resolve cleanly from
      # https://appassets.androidplatform.net/index.html.
      - name: Install PWA dependencies, verify & build dist/
        run: |
          if [ -f bun.lock ] || [ -f bun.lockb ]; then
            bun install --frozen-lockfile || bun install
          elif [ -f package-lock.json ]; then
            npm ci
          else
            npm install --legacy-peer-deps --no-audit --no-fund
          fi
          npm run verify:improvements
          npm test
          npm run lint
          npm run build -- --base=/

      # Copies the built web bundle into android-wrapper/app/src/main/assets/www/ so
      # PedigreeAssetPathHandler can serve the entire app 100% offline.
      - name: Bundle dist/ into android-wrapper assets/www/
        run: |
          rm -rf android-wrapper/app/src/main/assets/www
          mkdir -p android-wrapper/app/src/main/assets/www
          cp -R dist/. android-wrapper/app/src/main/assets/www/
          test -f android-wrapper/app/src/main/assets/www/index.html

      - name: Setup Java 17
        uses: actions/setup-java@v4
        with:
          distribution: "temurin"
          java-version: "17"

      - name: Setup Gradle 8.13
        uses: gradle/actions/setup-gradle@v4
        with:
          build-root-directory: android-wrapper
          gradle-version: "8.13"

      - name: Decode release keystore if secrets are configured
        id: keystore
        shell: bash
        env:
          ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
        run: |
          if [ -n "${ANDROID_KEYSTORE_BASE64:-}" ]; then
            KEYSTORE_FILE="${RUNNER_TEMP}/pedigree-release.jks"
            printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode > "$KEYSTORE_FILE"
            echo "keystore_path=$KEYSTORE_FILE" >> "$GITHUB_OUTPUT"
            echo "signed=true" >> "$GITHUB_OUTPUT"
          else
            echo "keystore_path=" >> "$GITHUB_OUTPUT"
            echo "signed=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Accept Android SDK licenses
        run: |
          SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}}"
          echo "ANDROID_HOME=$SDK_DIR" >> "$GITHUB_ENV"
          if [ -x "$SDK_DIR/cmdline-tools/latest/bin/sdkmanager" ]; then
            yes | "$SDK_DIR/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null || true
          fi
          test -f "$SDK_DIR/licenses/android-sdk-license"

      - name: Build Debug APK
        working-directory: android-wrapper
        run: gradle assembleDebug --no-daemon

      - name: Upload Debug APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: pedigree-debug-apk
          path: android-wrapper/app/build/outputs/apk/debug/*.apk
          if-no-files-found: error

      - name: Build Release APK
        working-directory: android-wrapper
        env:
          ANDROID_KEYSTORE_PATH: ${{ steps.keystore.outputs.keystore_path }}
          ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
        run: gradle assembleRelease --no-daemon

      - name: Clean up temporary keystore
        if: always() && steps.keystore.outputs.keystore_path != ''
        run: rm -f "${{ steps.keystore.outputs.keystore_path }}"

      - name: Upload Release APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: pedigree-release-apk
          path: android-wrapper/app/build/outputs/apk/release/*.apk
          if-no-files-found: error
```

## `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  verify:
    name: Test, Typecheck & Build
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: |
          if [ -f package-lock.json ]; then
            npm ci
          else
            npm install --no-audit --no-fund
          fi

      - name: Run domain unit tests
        run: npm test

      - name: Verify App Improvements Registry
        run: npm run verify:improvements

      - name: Run TypeScript typecheck (lint)
        run: npm run lint

      - name: Build production bundle (root path)
        env:
          NODE_ENV: production
        run: npm run build

      - name: Verify GitHub Pages subpath build
        env:
          NODE_ENV: production
        run: |
          REPO_NAME="${{ github.event.repository.name }}"
          if [ -z "$REPO_NAME" ]; then
            REPO_NAME="Pedigree"
          fi
          SUBPATH="/${REPO_NAME}/"
          npm run build -- --base="$SUBPATH"
          grep -q '"start_url":"./"' dist/manifest.webmanifest
          grep -q '"scope":"./"' dist/manifest.webmanifest
          grep -q '"id":"./"' dist/manifest.webmanifest
          grep -q "${SUBPATH}assets/" dist/index.html
          grep -q "${SUBPATH}manifest.webmanifest" dist/index.html
```

## `.github/workflows/deploy-pages.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - release
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      # IMPORTANT: GitHub Pages deployment STRICTLY REQUIRES Bun (oven-sh/setup-bun).
      # Previous attempts switching this workflow from Bun to npm broke GitHub Pages builds.
      # Do NOT replace Bun with npm/Node in this workflow.
      - name: Set up Bun
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: |
          if [ -f bun.lock ] || [ -f bun.lockb ]; then
            bun install --frozen-lockfile
          else
            bun install
          fi

      - name: Run domain unit tests
        run: bun run test

      - name: Verify App Improvements Registry
        run: bun run verify:improvements

      - name: Run TypeScript typecheck (lint)
        run: bun run lint

      - name: Configure GitHub Pages
        id: pages
        uses: actions/configure-pages@v5

      - name: Build subpath-safe production bundle (Bun CLI --base)
        env:
          NODE_ENV: production
        run: |
          BASE_PATH="${{ steps.pages.outputs.base_path }}"
          if [ -z "$BASE_PATH" ]; then
            BASE_PATH="/"
          fi
          case "$BASE_PATH" in
            */) ;;
            *) BASE_PATH="${BASE_PATH}/" ;;
          esac
          bun run build --base="$BASE_PATH"
          grep -q '"start_url":"./"' dist/manifest.webmanifest
          grep -q '"scope":"./"' dist/manifest.webmanifest
          grep -q '"id":"./"' dist/manifest.webmanifest
          if [ "$BASE_PATH" != "/" ]; then
            grep -q "${BASE_PATH}assets/" dist/index.html
            grep -q "${BASE_PATH}manifest.webmanifest" dist/index.html
          fi

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

## `.github/workflows/export_repo_to_md.yml`

```yaml
name: Export Codebase to Markdown

on:
  workflow_dispatch:
    inputs:
      output_dir:
        description: "Target folder inside the repository for exported Markdown files"
        required: false
        default: "export"
        type: string
      max_part_kb:
        description: "Max size per Markdown part in KB (default 450 to prevent GitHub/viewer truncation; set 0 for a single unsplit file)"
        required: false
        default: "450"
        type: string

permissions:
  contents: write

concurrency:
  group: export-codebase-md-${{ github.ref }}
  cancel-in-progress: false

jobs:
  export-markdown:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Generate complete Markdown export in export folder
        id: generate
        env:
          REPO_FULL_NAME: ${{ github.repository }}
          REPO_NAME: ${{ github.event.repository.name }}
          BRANCH_NAME: ${{ github.ref_name }}
          COMMIT_SHA: ${{ github.sha }}
          OUTPUT_DIR: ${{ inputs.output_dir || 'export' }}
          MAX_PART_KB: ${{ inputs.max_part_kb || '450' }}
        run: |
          STAMP_READABLE=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
          export STAMP_READABLE

          python3 - <<'EOF'
          import glob
          import hashlib
          import os
          import re
          import sys
          from pathlib import Path

          repo_full_name = os.environ.get("REPO_FULL_NAME", "repository")
          repo_name = os.environ.get("REPO_NAME", os.path.basename(os.path.abspath(".")))
          raw_branch = os.environ.get("BRANCH_NAME", "unknown-branch")
          commit_sha = os.environ.get("COMMIT_SHA", "unknown")
          stamp_readable = os.environ.get("STAMP_READABLE", "Unknown UTC")

          raw_output_dir = (os.environ.get("OUTPUT_DIR") or "export").strip().strip("/")
          if not raw_output_dir or ".." in Path(raw_output_dir).parts or os.path.isabs(raw_output_dir):
              print(f"Invalid output_dir: {raw_output_dir!r}", file=sys.stderr)
              sys.exit(1)

          try:
              max_part_kb = int(os.environ.get("MAX_PART_KB", "450"))
          except ValueError:
              print("Invalid max_part_kb; expected an integer.", file=sys.stderr)
              sys.exit(1)
          max_part_bytes = max_part_kb * 1024 if max_part_kb > 0 else 0

          output_dir = Path(raw_output_dir)
          output_dir_top = output_dir.parts[0]

          ignore_dirs = {
              ".git",
              "node_modules",
              "venv",
              ".venv",
              "__pycache__",
              "dist",
              "build",
              "coverage",
              ".gradle",
              output_dir_top,
          }

          ignore_files = {
              ".DS_Store",
              "package-lock.json",
              "yarn.lock",
              "pnpm-lock.yaml",
              "bun.lock",
              "bun.lockb",
          }

          ignore_extensions = {
              ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".bmp", ".tiff",
              ".pdf", ".zip", ".tar", ".gz", ".7z", ".rar",
              ".exe", ".dll", ".so", ".dylib", ".bin", ".wasm",
              ".lock", ".lockb",
              ".woff", ".woff2", ".ttf", ".otf", ".eot",
              ".apk", ".aab", ".jar", ".jks", ".keystore",
              ".mp3", ".mp4", ".wav", ".webm", ".mov",
              ".db", ".sqlite", ".sqlite3",
          }

          lang_map = {
              ".py": "python",
              ".js": "javascript",
              ".mjs": "javascript",
              ".cjs": "javascript",
              ".jsx": "jsx",
              ".ts": "typescript",
              ".tsx": "tsx",
              ".html": "html",
              ".css": "css",
              ".scss": "scss",
              ".json": "json",
              ".yml": "yaml",
              ".yaml": "yaml",
              ".md": "markdown",
              ".sh": "bash",
              ".sql": "sql",
              ".go": "go",
              ".rs": "rust",
              ".java": "java",
              ".kt": "kotlin",
              ".kts": "kotlin",
              ".gradle": "groovy",
              ".properties": "properties",
              ".toml": "toml",
              ".c": "c",
              ".cpp": "cpp",
              ".cs": "csharp",
              ".php": "php",
              ".rb": "ruby",
              ".xml": "xml",
              ".svg": "xml",
              ".txt": "text",
          }

          def make_fence(text: str) -> str:
              """Return a backtick fence strictly longer than any run in text."""
              runs = re.findall(r"`+", text)
              longest = max((len(run) for run in runs), default=0)
              return "`" * max(3, longest + 1)

          def write_file_atomic(path: Path, text: str) -> int:
              encoded = text.encode("utf-8")
              tmp_path = path.with_suffix(path.suffix + ".tmp")
              with open(tmp_path, "wb") as fh:
                  fh.write(encoded)
                  fh.flush()
                  os.fsync(fh.fileno())
              os.replace(tmp_path, path)
              return len(encoded)

          # Remove any legacy root-level combined exports from prior runs
          removed_legacy = []
          for legacy_path in sorted(glob.glob("*_combined_codebase_*.md")):
              if os.path.isfile(legacy_path):
                  os.remove(legacy_path)
                  removed_legacy.append(legacy_path)

          # Clean prior exported Markdown files inside output_dir
          output_dir.mkdir(parents=True, exist_ok=True)
          for old_file in sorted(output_dir.glob("*.md")):
              if old_file.is_file():
                  old_file.unlink()

          # Discover and read all eligible text files deterministically
          records = []
          skipped = []

          for root, dirs, files in os.walk("."):
              dirs[:] = sorted(d for d in dirs if d not in ignore_dirs)
              for filename in sorted(files):
                  rel_path = Path(os.path.normpath(os.path.join(root, filename))).as_posix()
                  if filename in ignore_files:
                      skipped.append((rel_path, "ignored lock/system file"))
                      continue

                  ext = os.path.splitext(filename)[1].lower()
                  if ext in ignore_extensions:
                      skipped.append((rel_path, f"ignored binary/asset extension ({ext})"))
                      continue

                  try:
                      raw_bytes = Path(rel_path).read_bytes()
                  except OSError as exc:
                      print(f"Failed to read {rel_path}: {exc}", file=sys.stderr)
                      sys.exit(1)

                  if b"\x00" in raw_bytes:
                      skipped.append((rel_path, "binary content detected"))
                      continue

                  try:
                      content = raw_bytes.decode("utf-8")
                  except UnicodeDecodeError:
                      skipped.append((rel_path, "non-UTF-8 binary/encoded content"))
                      continue

                  normalized = content.replace("\r\n", "\n").replace("\r", "\n")
                  line_count = normalized.count("\n") + (0 if normalized.endswith("\n") or not normalized else 1)
                  lang = lang_map.get(ext, "")
                  fence = make_fence(normalized)
                  trailing_nl = "" if (not normalized or normalized.endswith("\n")) else "\n"
                  section = f"## `{rel_path}`\n\n{fence}{lang}\n{normalized}{trailing_nl}{fence}\n\n"

                  records.append({
                      "path": rel_path,
                      "bytes": len(raw_bytes),
                      "lines": line_count,
                      "section": section,
                      "section_bytes": len(section.encode("utf-8")),
                  })

          if not records:
              print("No eligible text files found to export.", file=sys.stderr)
              sys.exit(1)

          # Partition whole files into size-bounded parts (never split mid-file)
          parts = []
          if max_part_bytes <= 0:
              parts.append(records)
          else:
              current_part = []
              current_size = 0
              header_budget = 2048
              for rec in records:
                  projected = current_size + rec["section_bytes"] + header_budget
                  if current_part and projected > max_part_bytes:
                      parts.append(current_part)
                      current_part = [rec]
                      current_size = rec["section_bytes"]
                  else:
                      current_part.append(rec)
                      current_size += rec["section_bytes"]
              if current_part:
                  parts.append(current_part)

          total_parts = len(parts)
          part_width = max(2, len(str(total_parts)))
          part_summaries = []
          file_to_part = {}

          for idx, part_records in enumerate(parts, start=1):
              part_name = (
                  f"{repo_name}_combined_codebase.md"
                  if total_parts == 1 and max_part_bytes <= 0
                  else f"part-{idx:0{part_width}d}.md"
              )
              part_path = output_dir / part_name
              sentinel = f"<!-- END OF PART {idx:0{part_width}d} OF {total_parts:0{part_width}d} ({len(part_records)} files) -->"

              header_lines = [
                  f"# Codebase Export: {repo_full_name} (Part {idx} of {total_parts})",
                  "",
                  f"- **Branch:** `{raw_branch}`",
                  f"- **Commit:** `{commit_sha}`",
                  f"- **Generated (UTC):** {stamp_readable}",
                  f"- **Files in this part:** {len(part_records)} (`{part_records[0]['path']}` -> `{part_records[-1]['path']}`)",
                  "- **Index:** [index.md](./index.md)",
                  "",
                  "---",
                  "",
              ]
              body = "".join(rec["section"] for rec in part_records)
              full_text = "\n".join(header_lines) + body + sentinel + "\n"
              expected_sha256 = hashlib.sha256(full_text.encode("utf-8")).hexdigest()
              written_bytes = write_file_atomic(part_path, full_text)

              part_summaries.append({
                  "index": idx,
                  "name": part_name,
                  "path": part_path,
                  "file_count": len(part_records),
                  "bytes": written_bytes,
                  "sha256": expected_sha256,
                  "first_file": part_records[0]["path"],
                  "last_file": part_records[-1]["path"],
                  "sentinel": sentinel,
                  "expected_paths": [rec["path"] for rec in part_records],
              })
              for rec in part_records:
                  file_to_part[rec["path"]] = part_name

          # Write master index.md
          index_sentinel = "<!-- END OF CODEBASE EXPORT INDEX -->"
          total_source_bytes = sum(rec["bytes"] for rec in records)
          total_export_bytes = sum(p["bytes"] for p in part_summaries)

          index_lines = [
              f"# Codebase Export Index: {repo_full_name}",
              "",
              f"- **Branch:** `{raw_branch}`",
              f"- **Commit:** `{commit_sha}`",
              f"- **Generated (UTC):** {stamp_readable}",
              f"- **Exported Files:** {len(records)} (0 truncated)",
              f"- **Skipped Binary/Ignored Files:** {len(skipped)}",
              f"- **Parts:** {total_parts} (target cap: {'unsplit' if max_part_bytes <= 0 else f'{max_part_kb} KB/part'})",
              f"- **Total Source Size:** {total_source_bytes:,} bytes ({total_source_bytes / 1024 / 1024:.2f} MB)",
              f"- **Total Export Size:** {total_export_bytes:,} bytes ({total_export_bytes / 1024 / 1024:.2f} MB)",
              "",
              "## Parts",
              "",
              "| Part | Files | Size (KB) | First File | Last File |",
              "| --- | ---: | ---: | --- | --- |",
          ]
          for p in part_summaries:
              index_lines.append(
                  f"| [{p['name']}](./{p['name']}) | {p['file_count']} | {p['bytes'] / 1024:.1f} | `{p['first_file']}` | `{p['last_file']}` |"
              )

          index_lines.extend([
              "",
              "## Exported Files",
              "",
              "| File | Part | Lines | Bytes |",
              "| --- | --- | ---: | ---: |",
          ])
          for rec in records:
              pname = file_to_part[rec["path"]]
              index_lines.append(
                  f"| `{rec['path']}` | [{pname}](./{pname}) | {rec['lines']:,} | {rec['bytes']:,} |"
              )

          if skipped:
              index_lines.extend([
                  "",
                  "## Skipped Files",
                  "",
                  "| File | Reason |",
                  "| --- | --- |",
              ])
              for spath, reason in skipped:
                  index_lines.append(f"| `{spath}` | {reason} |")

          index_lines.extend(["", index_sentinel, ""])
          index_path = output_dir / "index.md"
          write_file_atomic(index_path, "\n".join(index_lines))

          # Strict post-write completeness, fence balance & anti-truncation verification
          def extract_top_level_headings(md_text: str) -> list[str]:
              headings = []
              open_fence_len = 0
              for line in md_text.splitlines():
                  if open_fence_len:
                      if re.fullmatch(r"`{" + str(open_fence_len) + r",}", line):
                          open_fence_len = 0
                      continue
                  fence_match = re.match(r"^(`{3,})[^`]*$", line)
                  if fence_match:
                      open_fence_len = len(fence_match.group(1))
                      continue
                  heading_match = re.fullmatch(r"## `([^`]+)`", line)
                  if heading_match:
                      headings.append(heading_match.group(1))
              if open_fence_len:
                  raise ValueError(f"Unclosed code fence ({open_fence_len} backticks) at end of file.")
              return headings

          verified_paths = []
          for p in part_summaries:
              disk_bytes = p["path"].read_bytes()
              disk_sha256 = hashlib.sha256(disk_bytes).hexdigest()
              if disk_sha256 != p["sha256"]:
                  print(f"Verification failed: SHA-256 mismatch on {p['path']} (possible truncation).", file=sys.stderr)
                  sys.exit(1)
              disk_text = disk_bytes.decode("utf-8")
              if not disk_text.rstrip().endswith(p["sentinel"]):
                  print(f"Verification failed: {p['path']} is missing end sentinel (possible truncation).", file=sys.stderr)
                  sys.exit(1)
              try:
                  found_headings = extract_top_level_headings(disk_text)
              except ValueError as exc:
                  print(f"Verification failed in {p['path']}: {exc}", file=sys.stderr)
                  sys.exit(1)
              if found_headings != p["expected_paths"]:
                  print(
                      f"Verification failed in {p['path']}: expected {len(p['expected_paths'])} files, found {len(found_headings)}.",
                      file=sys.stderr,
                  )
                  sys.exit(1)
              verified_paths.extend(found_headings)

          expected_all = [rec["path"] for rec in records]
          if verified_paths != expected_all:
              print(
                  f"Global verification failed: expected {len(expected_all)} files, verified {len(verified_paths)}.",
                  file=sys.stderr,
              )
              sys.exit(1)

          index_disk = index_path.read_text(encoding="utf-8")
          if not index_disk.rstrip().endswith(index_sentinel):
              print(f"Verification failed: {index_path} is missing end sentinel.", file=sys.stderr)
              sys.exit(1)

          print(
              f"Verified complete export: {len(records)} files across {total_parts} part(s) "
              f"in '{raw_output_dir}/' ({total_export_bytes / 1024 / 1024:.2f} MB total)."
          )
          if removed_legacy:
              print(f"Removed legacy root exports: {', '.join(removed_legacy)}")

          github_output = os.environ.get("GITHUB_OUTPUT")
          if github_output:
              with open(github_output, "a", encoding="utf-8") as out_env:
                  out_env.write(f"output_dir={raw_output_dir}\n")
                  out_env.write(f"file_count={len(records)}\n")
                  out_env.write(f"part_count={total_parts}\n")
                  out_env.write(f"total_mb={total_export_bytes / 1024 / 1024:.2f}\n")
          EOF

      - name: Commit and push Markdown export to repository
        env:
          OUTPUT_DIR: ${{ steps.generate.outputs.output_dir }}
          BRANCH_NAME: ${{ github.ref_name }}
          FILE_COUNT: ${{ steps.generate.outputs.file_count }}
          PART_COUNT: ${{ steps.generate.outputs.part_count }}
          TOTAL_MB: ${{ steps.generate.outputs.total_mb }}
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

          git add -A -- "$OUTPUT_DIR"
          git ls-files -z '*_combined_codebase_*.md' | xargs -0 -r git rm -f --ignore-unmatch --

          if git diff --cached --quiet; then
            echo "Export is already up to date; nothing to commit."
          else
            git commit -m "chore(export): update codebase markdown export (${FILE_COUNT} files, ${PART_COUNT} parts) [skip ci]"
            git push origin "HEAD:${BRANCH_NAME}"
          fi

          if [ -n "$GITHUB_STEP_SUMMARY" ]; then
            {
              echo "### Codebase Markdown Export Complete"
              echo ""
              echo "- **Folder:** \`${OUTPUT_DIR}/\`"
              echo "- **Index:** \`${OUTPUT_DIR}/index.md\`"
              echo "- **Exported Files:** ${FILE_COUNT}"
              echo "- **Parts:** ${PART_COUNT}"
              echo "- **Total Size:** ${TOTAL_MB} MB"
            } >> "$GITHUB_STEP_SUMMARY"
          fi
```

## `.github/workflows/unzip.yml`

```yaml
name: Extract Android Wrapper
on:
  workflow_dispatch:
permissions:
  contents: write
jobs:
  unzip:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - name: Extract and flatten into target folder
        run: |
          ls -la
          ZIP_FILE=$(ls *.zip | head -n 1)
          mkdir -p temp_extract android-wrapper
          unzip -o "$ZIP_FILE" -d temp_extract
          shopt -s dotglob
          mv temp_extract/*/* android-wrapper/
          rm -rf temp_extract "$ZIP_FILE"
      - name: Commit extracted files
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add .
          git commit -m "Add Android wrapper files"
          git push
```

## `android-wrapper/.env.example`

```
# GEMINI_API_KEY: Required for Gemini AI API calls.
# AI Studio automatically injects this at runtime from user secrets.
# Users configure this via the Secrets panel in the AI Studio UI.
GEMINI_API_KEY="MY_GEMINI_API_KEY"

# APP_URL: The URL where this applet is hosted.
# AI Studio automatically injects this at runtime with the Cloud Run service URL.
# Used for self-referential links, OAuth callbacks, and API endpoints.
APP_URL="MY_APP_URL"
```

## `android-wrapper/LICENSE`

```
                    GNU AFFERO GENERAL PUBLIC LICENSE
                       Version 3, 19 November 2007

 Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>
 Everyone is permitted to copy and distribute verbatim copies
 of this license document, but changing it is not allowed.

                            Preamble

  The GNU Affero General Public License is a free, copyleft license for
software and other kinds of works, specifically designed to ensure
cooperation with the community in the case of network server software.

  The licenses for most software and other practical works are designed
to take away your freedom to share and change the works.  By contrast,
our General Public Licenses are intended to guarantee your freedom to
share and change all versions of a program--to make sure it remains free
software for all its users.

  When we speak of free software, we are referring to freedom, not
price.  Our General Public Licenses are designed to make sure that you
have the freedom to distribute copies of free software (and charge for
them if you wish), that you receive source code or can get it if you
want it, that you can change the software or use pieces of it in new
free programs, and that you know you can do these things.

  Developers that use our General Public Licenses protect your rights
with two steps: (1) assert copyright on the software, and (2) offer
you this License which gives you legal permission to copy, distribute
and/or modify the software.

  A secondary benefit of defending all users' freedom is that
improvements made in alternate versions of the program, if they
receive widespread use, become available for other developers to
incorporate.  Many developers of free software are heartened and
encouraged by the resulting cooperation.  However, in the case of
software used on network servers, this result may fail to come about.
The GNU General Public License permits making a modified version and
letting the public access it on a server without ever releasing its
source code to the public.

  The GNU Affero General Public License is designed specifically to
ensure that, in such cases, the modified source code becomes available
to the community.  It requires the operator of a network server to
provide the source code of the modified version running there to the
users of that server.  Therefore, public use of a modified version, on
a publicly accessible server, gives the public access to the source
code of the modified version.

  An older license, called the Affero General Public License and
published by Affero, was designed to accomplish similar goals.  This is
a different license, not a version of the Affero GPL, but Affero has
released a new version of the Affero GPL which permits relicensing under
this license.

  The precise terms and conditions for copying, distribution and
modification follow.

                       TERMS AND CONDITIONS

  0. Definitions.

  "This License" refers to version 3 of the GNU Affero General Public License.

  "Copyright" also means copyright-like laws that apply to other kinds of
works, such as semiconductor masks.

  "The Program" refers to any copyrightable work licensed under this
License.  Each licensee is addressed as "you".  "Licensees" and
"recipients" may be individuals or organizations.

  To "modify" a work means to copy from or adapt all or part of the work
in a fashion requiring copyright permission, other than the making of an
exact copy.  The resulting work is called a "modified version" of the
earlier work or a work "based on" the earlier work.

  A "covered work" means either the unmodified Program or a work based
on the Program.

  To "propagate" a work means to do anything with it that, without
permission, would make you directly or secondarily liable for
infringement under applicable copyright law, except executing it on a
computer or modifying a private copy.  Propagation includes copying,
distribution (with or without modification), making available to the
public, and in some countries other activities as well.

  To "convey" a work means any kind of propagation that enables other
parties to make or receive copies.  Mere interaction with a user through
a computer network, with no transfer of a copy, is not conveying.

  An interactive user interface displays "Appropriate Legal Notices"
to the extent that it includes a convenient and prominently visible
feature that (1) displays an appropriate copyright notice, and (2)
tells the user that there is no warranty for the work (except to the
extent that warranties are provided), that licensees may convey the
work under this License, and how to view a copy of this License.  If
the interface presents a list of user commands or options, such as a
menu, a prominent item in the list meets this criterion.

  1. Source Code.

  The "source code" for a work means the preferred form of the work
for making modifications to it.  "Object code" means any non-source
form of a work.

  A "Standard Interface" means an interface that either is an official
standard defined by a recognized standards body, or, in the case of
interfaces specified for a particular programming language, one that
is widely used among developers working in that language.

  The "System Libraries" of an executable work include anything, other
than the work as a whole, that (a) is included in the normal form of
packaging a Major Component, but which is not part of that Major
Component, and (b) serves only to enable use of the work with that
Major Component, or to implement a Standard Interface for which an
implementation is available to the public in source code form.  A
"Major Component", in this context, means a major essential component
(kernel, window system, and so on) of the specific operating system
(if any) on which the executable work runs, or a compiler used to
produce the work, or an object code interpreter used to run it.

  The "Corresponding Source" for a work in object code form means all
the source code needed to generate, install, and (for an executable
work) run the object code and to modify the work, including scripts to
control those activities.  However, it does not include the work's
System Libraries, or general-purpose tools or generally available free
programs which are used unmodified in performing those activities but
which are not part of the work.  For example, Corresponding Source
includes interface definition files associated with source files for
the work, and the source code for shared libraries and dynamically
linked subprograms that the work is specifically designed to require,
such as by intimate data communication or control flow between those
subprograms and other parts of the work.

  The Corresponding Source need not include anything that users
can regenerate automatically from other parts of the Corresponding
Source.

  The Corresponding Source for a work in source code form is that
same work.

  2. Basic Permissions.

  All rights granted under this License are granted for the term of
copyright on the Program, and are irrevocable provided the stated
conditions are met.  This License explicitly affirms your unlimited
permission to run the unmodified Program.  The output from running a
covered work is covered by this License only if the output, given its
content, constitutes a covered work.  This License acknowledges your
rights of fair use or other equivalent, as provided by copyright law.

  You may make, run and propagate covered works that you do not
convey, without conditions so long as your license otherwise remains
in force.  You may convey covered works to others for the sole purpose
of having them make modifications exclusively for you, or provide you
with facilities for running those works, provided that you comply with
the terms of this License in conveying all material for which you do
not control copyright.  Those thus making or running the covered works
for you must do so exclusively on your behalf, under your direction
and control, on terms that prohibit them from making any copies of
your copyrighted material outside their relationship with you.

  Conveying under any other circumstances is permitted solely under
the conditions stated below.  Sublicensing is not allowed; section 10
makes it unnecessary.

  3. Protecting Users' Legal Rights From Anti-Circumvention Law.

  No covered work shall be deemed part of an effective technological
measure under any applicable law fulfilling obligations under article
11 of the WIPO copyright treaty adopted on 20 December 1996, or
similar laws prohibiting or restricting circumvention of such
measures.

  When you convey a covered work, you waive any legal power to forbid
circumvention of technological measures to the extent such circumvention
is effected by exercising rights under this License with respect to
the covered work, and you disclaim any intention to limit operation or
modification of the work as a means of enforcing, against the work's
users, your or third parties' legal rights to forbid circumvention of
technological measures.

  4. Conveying Verbatim Copies.

  You may convey verbatim copies of the Program's source code as you
receive it, in any medium, provided that you conspicuously and
appropriately publish on each copy an appropriate copyright notice;
keep intact all notices stating that this License and any
non-permissive terms added in accord with section 7 apply to the code;
keep intact all notices of the absence of any warranty; and give all
recipients a copy of this License along with the Program.

  You may charge any price or no price for each copy that you convey,
and you may offer support or warranty protection for a fee.

  5. Conveying Modified Source Versions.

  You may convey a work based on the Program, or the modifications to
produce it from the Program, in the form of source code under the
terms of section 4, provided that you also meet all of these conditions:

    a) The work must carry prominent notices stating that you modified
    it, and giving a relevant date.

    b) The work must carry prominent notices stating that it is
    released under this License and any conditions added under section
    7.  This requirement modifies the requirement in section 4 to
    "keep intact all notices".

    c) You must license the entire work, as a whole, under this
    License to anyone who comes into possession of a copy.  This
    License will therefore apply, along with any applicable section 7
    additional terms, to the whole of the work, and all its parts,
    regardless of how they are packaged.  This License gives no
    permission to license the work in any other way, but it does not
    invalidate such permission if you have separately received it.

    d) If the work has interactive user interfaces, each must display
    Appropriate Legal Notices; however, if the Program has interactive
    interfaces that do not display Appropriate Legal Notices, your
    work need not make them do so.

  A compilation of a covered work with other separate and independent
works, which are not by their nature extensions of the covered work,
and which are not combined with it such as to form a larger program,
in or on a volume of a storage or distribution medium, is called an
"aggregate" if the compilation and its resulting copyright are not
used to limit the access or legal rights of the compilation's users
beyond what the individual works permit.  Inclusion of a covered work
in an aggregate does not cause this License to apply to the other
parts of the aggregate.

  6. Conveying Non-Source Forms.

  You may convey a covered work in object code form under the terms
of sections 4 and 5, provided that you also convey the
machine-readable Corresponding Source under the terms of this License,
in one of these ways:

    a) Convey the object code in, or embodied in, a physical product
    (including a physical distribution medium), accompanied by the
    Corresponding Source fixed on a durable physical medium
    customarily used for software interchange.

    b) Convey the object code in, or embodied in, a physical product
    (including a physical distribution medium), accompanied by a
    written offer, valid for at least three years and valid for as
    long as you offer spare parts or customer support for that product
    model, to give anyone who possesses the object code either (1) a
    copy of the Corresponding Source for all the software in the
    product that is covered by this License, on a durable physical
    medium customarily used for software interchange, for a price no
    more than your reasonable cost of physically performing this
    conveying of source, or (2) access to copy the
    Corresponding Source from a network server at no charge.

    c) Convey individual copies of the object code with a copy of the
    written offer to provide the Corresponding Source.  This
    alternative is allowed only occasionally and noncommercially, and
    only if you received the object code with such an offer, in accord
    with subsection 6b.

    d) Convey the object code by offering access from a designated
    place (gratis or for a charge), and offer equivalent access to the
    Corresponding Source in the same way through the same place at no
    further charge.  You need not require recipients to copy the
    Corresponding Source along with the object code.  If the place to
    copy the object code is a network server, the Corresponding Source
    may be on a different server (operated by you or a third party)
    that supports equivalent copying facilities, provided you maintain
    clear directions next to the object code saying where to find the
    Corresponding Source.  Regardless of what server hosts the
    Corresponding Source, you remain obligated to ensure that it is
    available for as long as needed to satisfy these requirements.

    e) Convey the object code using peer-to-peer transmission, provided
    you inform other peers where the object code and Corresponding
    Source of the work are being offered to the general public at no
    charge under subsection 6d.

  A separable portion of the object code, whose source code is excluded
from the Corresponding Source as a System Library, need not be
included in conveying the object code work.

  A "User Product" is either (1) a "consumer product", which means any
tangible personal property which is normally used for personal, family,
or household purposes, or (2) anything designed or sold for incorporation
into a dwelling.  In determining whether a product is a consumer product,
doubtful cases shall be resolved in favor of coverage.  For a particular
product received by a particular user, "normally used" refers to a
typical or common use of that class of product, regardless of the status
of the particular user or of the way in which the particular user
actually uses, or expects or is expected to use, the product.  A product
is a consumer product regardless of whether the product has substantial
commercial, industrial or non-consumer uses, unless such uses represent
the only significant mode of use of the product.

  "Installation Information" for a User Product means any methods,
procedures, authorization keys, or other information required to install
and execute modified versions of a covered work in that User Product from
a modified version of its Corresponding Source.  The information must
suffice to ensure that the continued functioning of the modified object
code is in no case prevented or interfered with solely because
modification has been made.

  If you convey an object code work under this section in, or with, or
specifically for use in, a User Product, and the conveying occurs as
part of a transaction in which the right of possession and use of the
User Product is transferred to the recipient in perpetuity or for a
fixed term (regardless of how the transaction is characterized), the
Corresponding Source conveyed under this section must be accompanied
by the Installation Information.  But this requirement does not apply
if neither you nor any third party retains the ability to install
modified object code on the User Product (for example, the work has
been installed in ROM).

  The requirement to provide Installation Information does not include a
requirement to continue to provide support service, warranty, or updates
for a work that has been modified or installed by the recipient, or for
the User Product in which it has been modified or installed.  Access to a
network may be denied when the modification itself materially and
adversely affects the operation of the network or violates the rules and
protocols for communication across the network.

  Corresponding Source conveyed, and Installation Information provided,
in accord with this section must be in a format that is publicly
documented (and with an implementation available to the public in
source code form), and must require no special password or key for
unpacking, reading or copying.

  7. Additional Terms.

  "Additional permissions" are terms that supplement the terms of this
License by making exceptions from one or more of its conditions.
Additional permissions that are applicable to the entire Program shall
be treated as though they were included in this License, to the extent
that they are valid under applicable law.  If additional permissions
apply only to part of the Program, that part may be used separately
under those permissions, but the entire Program remains governed by
this License without regard to the additional permissions.

  When you convey a copy of a covered work, you may at your option
remove any additional permissions from that copy, or from any part of
it.  (Additional permissions may be written to require their own
removal in certain cases when you modify the work.)  You may place
additional permissions on material, added by you to a covered work,
for which you have or can give appropriate copyright permission.

  Notwithstanding any other provision of this License, for material you
add to a covered work, you may (if authorized by the copyright holders of
that material) supplement the terms of this License with terms:

    a) Disclaiming warranty or limiting liability differently from the
    terms of sections 15 and 16 of this License; or

    b) Requiring preservation of specified reasonable legal notices or
    author attributions in that material or in the Appropriate Legal
    Notices displayed by works containing it; or

    c) Prohibiting misrepresentation of the origin of that material, or
    requiring that modified versions of such material be marked in
    reasonable ways as different from the original version; or

    d) Limiting the use for publicity purposes of names of licensors or
    authors of the material; or

    e) Declining to grant rights under trademark law for use of some
    trade names, trademarks, or service marks; or

    f) Requiring indemnification of licensors and authors of that
    material by anyone who conveys the material (or modified versions of
    it) with contractual assumptions of liability to the recipient, for
    any liability that these contractual assumptions directly impose on
    those licensors and authors.

  All other non-permissive additional terms are considered "further
restrictions" within the meaning of section 10.  If the Program as you
received it, or any part of it, contains a notice stating that it is
governed by this License along with a term that is a further
restriction, you may remove that term.  If a license document contains
a further restriction but permits relicensing or conveying under this
License, you may add to a covered work material governed by the terms
of that license document, provided that the further restriction does
not survive such relicensing or conveying.

  If you add terms to a covered work in accord with this section, you
must place, in the relevant source files, a statement of the
additional terms that apply to those files, or a notice indicating
where to find the applicable terms.

  Additional terms, permissive or non-permissive, may be stated in the
form of a separately written license, or stated as exceptions;
the above requirements apply either way.

  8. Termination.

  You may not propagate or modify a covered work except as expressly
provided under this License.  Any attempt otherwise to propagate or
modify it is void, and will automatically terminate your rights under
this License (including any patent licenses granted under the third
paragraph of section 11).

  However, if you cease all violation of this License, then your
license from a particular copyright holder is reinstated (a)
provisionally, unless and until the copyright holder explicitly and
finally terminates your license, and (b) permanently, if the copyright
holder fails to notify you of the violation by some reasonable means
prior to 60 days after the cessation.

  Moreover, your license from a particular copyright holder is
reinstated permanently if the copyright holder notifies you of the
violation by some reasonable means, this is the first time you have
received notice of violation of this License (for any work) from that
copyright holder, and you cure the violation prior to 30 days after
your receipt of the notice.

  Termination of your rights under this section does not terminate the
licenses of parties who have received copies or rights from you under
this License.  If your rights have been terminated and not permanently
reinstated, you do not qualify to receive new licenses for the same
material under section 10.

  9. Acceptance Not Required for Having Copies.

  You are not required to accept this License in order to receive or
run a copy of the Program.  Ancillary propagation of a covered work
occurring solely as a consequence of using peer-to-peer transmission
to receive a copy likewise does not require acceptance.  However,
nothing other than this License grants you permission to propagate or
modify any covered work.  These actions infringe copyright if you do
not accept this License.  Therefore, by modifying or propagating a
covered work, you indicate your acceptance of this License to do so.

  10. Automatic Licensing of Downstream Recipients.

  Each time you convey a covered work, the recipient automatically
receives a license from the original licensors, to run, modify and
propagate that work, subject to this License.  You are not responsible
for enforcing compliance by third parties with this License.

  An "entity transaction" is a transaction transferring control of an
organization, or substantially all assets of one, or subdividing an
organization, or merging organizations.  If propagation of a covered
work results from an entity transaction, each party to that
transaction who receives a copy of the work also receives whatever
licenses to the work the party's predecessor in interest had or could
give under the previous paragraph, plus a right to possession of the
Corresponding Source of the work from the predecessor in interest, if
the predecessor has it or can get it with reasonable efforts.

  You may not impose any further restrictions on the exercise of the
rights granted or affirmed under this License.  For example, you may
not impose a license fee, royalty, or other charge for exercise of
rights granted under this License, and you may not initiate litigation
(including a cross-claim or counterclaim in a lawsuit) alleging that
any patent claim is infringed by making, using, selling, offering for
sale, or importing the Program or any portion of it.

  11. Patents.

  A "contributor" is a copyright holder who authorizes use under this
License of the Program or a work on which the Program is based.  The
work thus licensed is called the contributor's "contributor version".

  A contributor's "essential patent claims" are all patent claims
owned or controlled by the contributor, whether already acquired or
hereafter acquired, that would be infringed by some manner, permitted
by this License, of making, using, or selling its contributor version,
but do not include claims that would be infringed only as a
consequence of further modification of the contributor version.  For
purposes of this definition, "control" includes the right to grant
patent sublicenses in a manner consistent with the requirements of
this License.

  Each contributor grants you a non-exclusive, worldwide, royalty-free
patent license under the contributor's essential patent claims, to
make, use, sell, offer for sale, import and otherwise run, modify and
propagate the contents of its contributor version.

  In the following three paragraphs, a "patent license" is any express
agreement or commitment, however denominated, not to enforce a patent
(such as an express permission to practice a patent or covenant not to
sue for patent infringement).  To "grant" such a patent license to a
party means to make such an agreement or commitment not to enforce a
patent against the party.

  If you convey a covered work, knowingly relying on a patent license,
and the Corresponding Source of the work is not available for anyone
to copy, free of charge and under the terms of this License, through a
publicly available network server or other readily accessible means,
then you must either (1) cause the Corresponding Source to be so
available, or (2) arrange to deprive yourself of the benefit of the
patent license for this particular work, or (3) arrange, in a manner
consistent with the requirements of this License, to extend the patent
license to downstream recipients.  "Knowingly relying" means you have
actual knowledge that, but for the patent license, your conveying the
covered work in a country, or your recipient's use of the covered work
in a country, would infringe one or more identifiable patents in that
country that you have reason to believe are valid.

  If, pursuant to or in connection with a single transaction or
arrangement, you convey, or propagate by procuring conveyance of, a
covered work, and grant a patent license to some of the parties
receiving the covered work authorizing them to use, propagate, modify
or convey a specific copy of the covered work, then the patent license
you grant is automatically extended to all recipients of the covered
work and works based on it.

  A patent license is "discriminatory" if it does not include within
the scope of its coverage, prohibits the exercise of, or is
conditioned on the non-exercise of one or more of the rights that are
specifically granted under this License.  You may not convey a covered
work if you are a party to an arrangement with a third party that is
in the business of distributing software, under which you make payment
to the third party based on the extent of your activity of conveying
the work, and under which the third party grants, to any of the
parties who would receive the covered work from you, a discriminatory
patent license (a) in connection with copies of the covered work
conveyed by you (or copies made from those copies), or (b) primarily
for and in connection with specific products or compilations that
contain the covered work, unless you entered into that arrangement,
or that patent license was granted, prior to 28 March 2007.

  Nothing in this License shall be construed as excluding or limiting
any implied license or other defenses to infringement that may
otherwise be available to you under applicable patent law.

  12. No Surrender of Others' Freedom.

  If conditions are imposed on you (whether by court order, agreement or
otherwise) that contradict the conditions of this License, they do not
excuse you from the conditions of this License.  If you cannot convey a
covered work so as to satisfy simultaneously your obligations under this
License and any other pertinent obligations, then as a consequence you may
not convey it at all.  For example, if you agree to terms that obligate you
to collect a royalty for further conveying from those to whom you convey
the Program, the only way you could satisfy both those terms and this
License would be to refrain entirely from conveying the Program.

  13. Remote Network Interaction; Use with the GNU General Public License.

  Notwithstanding any other provision of this License, if you modify the
Program, your modified version must prominently offer all users
interacting with it remotely through a computer network (if your version
supports such interaction) an opportunity to receive the Corresponding
Source of your version by providing access to the Corresponding Source
from a network server at no charge, through some standard or customary
means of facilitating copying of software.  This Corresponding Source
shall include the Corresponding Source for any work covered by version 3
of the GNU General Public License that is incorporated pursuant to the
following paragraph.

  Notwithstanding any other provision of this License, you have
permission to link or combine any covered work with a work licensed
under version 3 of the GNU General Public License into a single
combined work, and to convey the resulting work.  The terms of this
License will continue to apply to the part which is the covered work,
but the work with which it is combined will remain governed by version
3 of the GNU General Public License.

  14. Revised Versions of this License.

  The Free Software Foundation may publish revised and/or new versions of
the GNU Affero General Public License from time to time.  Such new versions
will be similar in spirit to the present version, but may differ in detail to
address new problems or concerns.

  Each version is given a distinguishing version number.  If the
Program specifies that a certain numbered version of the GNU Affero General
Public License "or any later version" applies to it, you have the
option of following the terms and conditions either of that numbered
version or of any later version published by the Free Software
Foundation.  If the Program does not specify a version number of the
GNU Affero General Public License, you may choose any version ever published
by the Free Software Foundation.

  If the Program specifies that a proxy can decide which future
versions of the GNU Affero General Public License can be used, that proxy's
public statement of acceptance of a version permanently authorizes you
to choose that version for the Program.

  Later license versions may give you additional or different
permissions.  However, no additional obligations are imposed on any
author or copyright holder as a result of your choosing to follow a
later version.

  15. Disclaimer of Warranty.

  THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY
APPLICABLE LAW.  EXCEPT WHEN OTHERWISE STATED IN WRITING THE COPYRIGHT
HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM "AS IS" WITHOUT WARRANTY
OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO,
THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
PURPOSE.  THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM
IS WITH YOU.  SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF
ALL NECESSARY SERVICING, REPAIR OR CORRECTION.

  16. Limitation of Liability.

  IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING
WILL ANY COPYRIGHT HOLDER, OR ANY OTHER PARTY WHO MODIFIES AND/OR CONVEYS
THE PROGRAM AS PERMITTED ABOVE, BE LIABLE TO YOU FOR DAMAGES, INCLUDING ANY
GENERAL, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE
USE OR INABILITY TO USE THE PROGRAM (INCLUDING BUT NOT LIMITED TO LOSS OF
DATA OR DATA BEING RENDERED INACCURATE OR LOSSES SUSTAINED BY YOU OR THIRD
PARTIES OR A FAILURE OF THE PROGRAM TO OPERATE WITH ANY OTHER PROGRAMS),
EVEN IF SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF
SUCH DAMAGES.

  17. Interpretation of Sections 15 and 16.

  If the disclaimer of warranty and limitation of liability provided
above cannot be given local legal effect according to their terms,
reviewing courts shall apply local law that most closely approximates
an absolute waiver of all civil liability in connection with the
Program, unless a warranty or assumption of liability accompanies a
copy of the Program in return for a fee.

                     END OF TERMS AND CONDITIONS

            How to Apply These Terms to Your New Programs

  If you develop a new program, and you want it to be of the greatest
possible use to the public, the best way to achieve this is to make it
free software which everyone can redistribute and change under these terms.

  To do so, attach the following notices to the program.  It is safest
to attach them to the start of each source file to most effectively
state the exclusion of warranty; and each file should have at least
the "copyright" line and a pointer to where the full notice is found.

    <one line to give the program's name and a brief idea of what it does.>
    Copyright (C) <year>  <name of author>

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.

Also add information on how to contact you by electronic and paper mail.

  If your software can interact with users remotely through a computer
network, you should also make sure that it provides a way for users to
get its source.  For example, if your program is a web application, its
interface could display a "Source" link that leads users to an archive
of the code.  There are many ways you could offer source, and different
solutions will be better for different programs; see section 13 for the
specific requirements.

  You should also get your employer (if you work as a programmer) or school,
if any, to sign a "copyright disclaimer" for the program, if necessary.
For more information on this, and how to apply and follow the GNU AGPL, see
<https://www.gnu.org/licenses/>.
```

## `android-wrapper/build.gradle.kts`

```kotlin
// Top-level build file for Pedigree Android Wrapper
// SPDX-License-Identifier: AGPL-3.0-or-later

plugins {
    id("com.android.application") version "8.13.0" apply false
    id("org.jetbrains.kotlin.android") version "2.3.21" apply false
}
```

## `android-wrapper/gradle.properties`

```properties
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.nonTransitiveRClass=true
kotlin.code.style=official
```

## `android-wrapper/settings.gradle.kts`

```kotlin
/*
 * Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "pedigree-android-wrapper"
include(":app")
```

## `android-wrapper/app/build.gradle.kts`

```kotlin
/*
 * Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import java.io.File
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "org.askkim.pedigree.wrapper"
    compileSdk = 36

    defaultConfig {
        applicationId = "org.askkim.pedigree.wrapper"
        // Android 8.0+ (API 26) supports WebViewAssetLoader, Safe Browsing, and modern WebMessageCompat.
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0-alpha.2"
    }

    buildFeatures {
        buildConfig = true
    }

    // Reproducible & F-Droid friendly: omit Google dependency metadata blobs
    dependenciesInfo {
        includeInApk = false
        includeInBundle = false
    }

    // Release signing credentials are supplied via CI environment variables (never committed).
    val keystorePath = System.getenv("ANDROID_KEYSTORE_PATH")
    val keystorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
    val keyAliasEnv = System.getenv("ANDROID_KEY_ALIAS")
    val keyPasswordEnv = System.getenv("ANDROID_KEY_PASSWORD")
    val hasReleaseSigning = !keystorePath.isNullOrBlank() &&
        !keystorePassword.isNullOrBlank() &&
        !keyAliasEnv.isNullOrBlank() &&
        !keyPasswordEnv.isNullOrBlank() &&
        File(keystorePath).exists()

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = File(keystorePath!!)
                storePassword = keystorePassword
                keyAlias = keyAliasEnv
                keyPassword = keyPasswordEnv
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources {
            excludes += setOf(
                "META-INF/LICENSE*",
                "META-INF/NOTICE*",
                "META-INF/*.kotlin_module"
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

// Strict minimal dependency policy: pure AndroidX WebView/Custom Tabs/AppCompat only.
// No Google Play Services, Firebase, Capacitor, or proprietary analytics/crash SDKs.
dependencies {
    implementation("androidx.appcompat:appcompat:1.8.0")
    implementation("androidx.webkit:webkit:1.15.0")
    implementation("androidx.browser:browser:1.10.0")
}
```

## `android-wrapper/app/proguard-rules.pro`

```
# ProGuard / R8 rules for Pedigree Android Wrapper
# SPDX-License-Identifier: AGPL-3.0-or-later

-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

-keep class androidx.webkit.** { *; }
-keep interface org.chromium.support_lib_boundary.** { *; }
-dontwarn androidx.webkit.**
-dontwarn org.chromium.support_lib_boundary.**
```

## `android-wrapper/app/src/debug/res/values/strings.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Pedigree (Debug)</string>
</resources>
```

## `android-wrapper/app/src/debug/res/xml/shortcuts.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
    <shortcut
        android:shortcutId="open_diagnostics"
        android:enabled="true"
        android:icon="@mipmap/ic_launcher"
        android:shortcutShortLabel="@string/shortcut_diagnostics_short"
        android:shortcutLongLabel="@string/shortcut_diagnostics_long">
        <intent
            android:action="org.askkim.pedigree.wrapper.action.OPEN_DIAGNOSTICS"
            android:targetPackage="org.askkim.pedigree.wrapper.debug"
            android:targetClass="org.askkim.pedigree.wrapper.MainActivity" />
    </shortcut>
</shortcuts>
```

## `android-wrapper/app/src/main/AndroidManifest.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Minimal permission footprint: INTERNET is required for virtual HTTPS asset origin, optional user-initiated links, and debug staging. -->
    <uses-permission android:name="android.permission.INTERNET" />

    <!-- Android 11+ (API 30+) package visibility for Custom Tabs, browsers, and mailto: -->
    <queries>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="https" />
        </intent>
        <intent>
            <action android:name="android.support.customtabs.action.CustomTabsService" />
        </intent>
        <intent>
            <action android:name="android.intent.action.SENDTO" />
            <data android:scheme="mailto" />
        </intent>
    </queries>

    <!-- allowBackup=false prevents Android Auto Backup from uploading private offline DBs; usesCleartextTraffic=false blocks http://. -->
    <application
        android:allowBackup="false"
        android:dataExtractionRules="@xml/data_extraction_rules"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.PedigreeWrapper"
        android:usesCleartextTraffic="false">

        <!-- launchMode=singleTop delivers launcher shortcut & future OAuth redirect intents to onNewIntent() without recreating WebView. -->
        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|screenSize|smallestScreenSize|keyboardHidden|uiMode"
            android:exported="true"
            android:launchMode="singleTop"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
            <meta-data
                android:name="android.app.shortcuts"
                android:resource="@xml/shortcuts" />
        </activity>

        <!-- Scoped FileProvider exposing only cacheDir/exports/ (see res/xml/file_paths.xml) for Intent.ACTION_SEND shares. -->
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>

    </application>

</manifest>
```

## `android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/BackNavigationBridge.kt`

```kotlin
/*
 * Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

package org.askkim.pedigree.wrapper

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.JavaScriptReplyProxy
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.atomic.AtomicLong

/**
 * Coordinates Android system Back gestures/buttons with the PWA's in-app modal and route stack
 * via `pedigreeBridge`.
 *
 * Flow on every Back press:
 * 1. Sends `{"type":"NATIVE_BACK","requestId":"back_N"}` to the PWA and starts a 250ms timer.
 * 2. The PWA evaluates registered Back handlers (modals at priority >= 5 first, then routes at
 *    priority 0 in LIFO order) and replies with `NATIVE_BACK_RESULT { handled: true|false }`.
 * 3. If `handled == true`, native code does nothing (the PWA closed a modal or stepped back).
 * 4. If `handled == false` or the 250ms timer expires, [performNativeFallback] steps through
 *    `webView.canGoBack()` or shows a 2-second "Press Back again to exit" toast before exiting.
 */
class BackNavigationBridge(
    private val activity: AppCompatActivity,
    private val webViewProvider: () -> WebView?,
    private val replyProxyProvider: () -> JavaScriptReplyProxy?,
    private val activeOriginProvider: () -> String,
    private val onExitRequested: () -> Unit = { activity.finish() },
    private val diagnosticBuffer: DiagnosticRingBuffer? = null
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val sequence = AtomicLong(0L)

    private var pendingRequestId: String? = null
    private var pendingDispatchElapsedMs: Long = 0L
    private var pendingTimeoutRunnable: Runnable? = null
    private var lastExitPromptTimestampMs: Long = 0L
    private var activeExitToast: Toast? = null
    private var destroyed = false

    private val backPressedCallback = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            onSystemBackPressed()
        }
    }

    /** Registers the AndroidX [OnBackPressedCallback] on the Activity dispatcher. */
    fun attach() {
        activity.onBackPressedDispatcher.addCallback(activity, backPressedCallback)
    }

    /**
     * Processes `NATIVE_BACK_RESULT` replies from JS, ignoring stale or mismatched `requestId`s
     * after a timeout has already fired.
     */
    fun handleNativeBackResult(requestId: String, payload: JSONObject?) {
        if (destroyed) return
        val handled = payload?.optBoolean("handled", false) ?: false

        val applyResult = Runnable {
            if (destroyed) return@Runnable
            val currentPending = pendingRequestId
            if (currentPending == null || (requestId.isNotEmpty() && requestId != currentPending)) {
                return@Runnable
            }
            val latencyMs = (SystemClock.elapsedRealtime() - pendingDispatchElapsedMs).coerceAtLeast(0L)
            clearPendingTimeout()
            diagnosticBuffer?.record(
                DiagnosticRingBuffer.LEVEL_INFO,
                "BACK_RESULT",
                "handled=$handled in ${latencyMs}ms"
            )
            if (!handled) {
                performNativeFallback()
            }
        }

        if (Looper.myLooper() == Looper.getMainLooper()) {
            applyResult.run()
        } else {
            mainHandler.post(applyResult)
        }
    }

    /** Clears any in-flight Back request (called when the WebView is torn down or remounted). */
    fun resetPendingRequest() {
        clearPendingTimeout()
    }

    /** Unregisters the Back callback and cancels timers/toasts on Activity destruction. */
    fun destroy() {
        destroyed = true
        backPressedCallback.remove()
        clearPendingTimeout()
        activeExitToast?.cancel()
        activeExitToast = null
    }

    private fun onSystemBackPressed() {
        if (destroyed || pendingRequestId != null) return

        val wv = webViewProvider()
        if (wv == null) {
            performNativeFallback()
            return
        }

        val requestId = "back_${sequence.incrementAndGet()}"
        pendingRequestId = requestId
        pendingDispatchElapsedMs = SystemClock.elapsedRealtime()

        val timeoutRunnable = Runnable {
            if (destroyed) return@Runnable
            if (pendingRequestId == requestId) {
                val latencyMs = (SystemClock.elapsedRealtime() - pendingDispatchElapsedMs).coerceAtLeast(0L)
                pendingRequestId = null
                pendingTimeoutRunnable = null
                diagnosticBuffer?.record(
                    DiagnosticRingBuffer.LEVEL_WARN,
                    "BACK_TIMEOUT",
                    "JS back reply timed out after ${latencyMs}ms; falling back"
                )
                performNativeFallback()
            }
        }
        pendingTimeoutRunnable = timeoutRunnable
        mainHandler.postDelayed(timeoutRunnable, BACK_REPLY_TIMEOUT_MS)

        val envelopeJson = JSONObject().apply {
            put("type", "NATIVE_BACK")
            put("requestId", requestId)
        }.toString()

        val dispatched = dispatchBackEnvelope(wv, envelopeJson)
        if (!dispatched) {
            clearPendingTimeout()
            diagnosticBuffer?.record(
                DiagnosticRingBuffer.LEVEL_INFO,
                "BACK_DISPATCH_SKIP",
                "JS bridge unavailable; using native fallback"
            )
            performNativeFallback()
        }
    }

    /**
     * Sends `NATIVE_BACK` via the active `JavaScriptReplyProxy` when available.
     *
     * Note on `JavaScriptReplyProxy` availability: Android `WebViewCompat.addWebMessageListener`
     * only provides a `replyProxy` after JS sends its first message to native. If the user presses
     * Back before JS has posted anything, we fall back to `window.__pedigreeBridgeReceive(...)`—
     * but ONLY after verifying that `webView.url`'s origin strictly matches [activeOriginProvider].
     */
    private fun dispatchBackEnvelope(webView: WebView, envelopeJson: String): Boolean {
        val proxy = replyProxyProvider()
        if (proxy != null) {
            return try {
                proxy.postMessage(envelopeJson)
                true
            } catch (_: Exception) {
                false
            }
        }

        // Fallback before JS sends its first message: invoke the bridge receiver only if current origin matches
        val currentUrl = webView.url ?: return false
        val uri = try {
            Uri.parse(currentUrl)
        } catch (_: Exception) {
            return false
        }
        val scheme = uri.scheme?.lowercase(Locale.US) ?: return false
        val host = uri.host?.lowercase(Locale.US) ?: return false
        val isDefaultPort = (scheme == "https" && uri.port == 443) || (scheme == "http" && uri.port == 80)
        val currentOrigin = "$scheme://$host" + if (uri.port != -1 && !isDefaultPort) ":${uri.port}" else ""
        if (currentOrigin != activeOriginProvider()) {
            return false
        }

        val quotedEnvelope = JSONObject.quote(envelopeJson)
        webView.evaluateJavascript(
            "window.__pedigreeBridgeReceive && window.__pedigreeBridgeReceive($quotedEnvelope);",
            null
        )
        return true
    }

    /** Executes native WebView history back or the 2-second double-back-to-exit confirmation. */
    private fun performNativeFallback() {
        if (destroyed) return

        val wv = webViewProvider()
        if (wv != null && wv.canGoBack()) {
            wv.goBack()
            return
        }

        val now = SystemClock.elapsedRealtime()
        if (now - lastExitPromptTimestampMs <= DOUBLE_BACK_EXIT_WINDOW_MS) {
            activeExitToast?.cancel()
            activeExitToast = null
            onExitRequested()
        } else {
            lastExitPromptTimestampMs = now
            activeExitToast?.cancel()
            activeExitToast = Toast.makeText(
                activity,
                R.string.press_back_again_to_exit,
                Toast.LENGTH_SHORT
            ).also { it.show() }
        }
    }

    private fun clearPendingTimeout() {
        pendingTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        pendingTimeoutRunnable = null
        pendingRequestId = null
    }

    companion object {
        private const val BACK_REPLY_TIMEOUT_MS = 250L
        private const val DOUBLE_BACK_EXIT_WINDOW_MS = 2_000L
    }
}
```

## `android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/DeveloperPanelDialog.kt`

```kotlin
/*
 * Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

package org.askkim.pedigree.wrapper

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewCompat
import org.json.JSONObject
import java.util.Locale

/**
 * Lazy, leak-free native Developer & Diagnostics Panel rendered as an AndroidX [AlertDialog]
 * with a programmatic [ScrollView].
 *
 * Design highlights:
 * - **Zero extra dependencies**: built purely with standard Android views (`ScrollView`, `LinearLayout`,
 *   `TextView`, `Button`) so no Material/Compose bloat is added to the APK.
 * - **Leak-free lifecycle**: holds no static Activity reference and is explicitly dismissed in
 *   `MainActivity.onDestroy()`.
 * - **Zero PII**: shows runtime versions, honest `navigator.storage` probe results, read-only
 *   `app_webview` / `pedigree-vault` byte counts, and sanitized [DiagnosticRingBuffer] events—never
 *   animal records or personal data.
 * - **Release security**: the Debug Target URL switcher is gated on `BuildConfig.DEBUG` so R8
 *   strips it completely from release APKs.
 */
class DeveloperPanelDialog(
    private val activity: AppCompatActivity,
    private val diagnosticBuffer: DiagnosticRingBuffer,
    private val nativeBackupVault: NativeBackupVault,
    private val webViewProvider: () -> WebView?,
    private val activeOriginProvider: () -> String,
    private val activeStartUrlProvider: () -> String,
    private val onReloadApp: () -> Unit,
    private val onSoftCacheReset: () -> Unit,
    private val onDebugTargetUrlChanged: (String?) -> Unit
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var activeDialog: AlertDialog? = null
    private var lastTriggerSource: String = "unknown"

    private var cachedPersisted: Boolean? = null
    private var cachedQuotaUsageBytes: Long? = null
    private var cachedQuotaTotalBytes: Long? = null

    /**
     * Inflates and shows the diagnostics dialog on demand, triggering async JS storage quota
     * and native disk-size probes without blocking the UI thread.
     */
    fun show(triggerSource: String) {
        if (activity.isFinishing || activity.isDestroyed) return
        if (activeDialog?.isShowing == true) return

        lastTriggerSource = triggerSource
        cachedPersisted = null
        cachedQuotaUsageBytes = null
        cachedQuotaTotalBytes = null
        diagnosticBuffer.record(
            DiagnosticRingBuffer.LEVEL_INFO,
            "DEV_PANEL_OPEN",
            "Opened Developer Panel ($triggerSource)"
        )

        val pkgInfo = WebViewCompat.getCurrentWebViewPackage(activity)
        val webViewPkg = pkgInfo?.packageName ?: "unknown"
        val webViewVer = pkgInfo?.versionName ?: "unknown"
        val webViewMajor = webViewVer.substringBefore('.').trim().toIntOrNull()
        val activeOrigin = activeOriginProvider()
        val activeUrlSanitized = DiagnosticRingBuffer.sanitizeUrl(webViewProvider()?.url ?: activeStartUrlProvider())

        val scrollView = ScrollView(activity).apply {
            isFillViewport = true
        }
        val container = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            val pad = dp(16)
            setPadding(pad, pad, pad, pad)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }
        scrollView.addView(container)

        // 1. WebView Runtime Info
        container.addView(buildSectionHeader("WebView & Container Runtime"))
        val runtimeText = buildString {
            appendLine("Build: ${BuildConfig.VERSION_NAME} (${if (BuildConfig.DEBUG) "DEBUG" else "RELEASE"})")
            appendLine("Android: ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
            appendLine("WebView: $webViewPkg $webViewVer")
            appendLine("Origin: $activeOrigin")
            if (activeUrlSanitized.isNotEmpty()) {
                appendLine("URL: $activeUrlSanitized")
            }
            append("Trigger: $triggerSource")
        }
        container.addView(buildMonospaceBox(runtimeText))

        if (webViewMajor != null && webViewMajor < 109) {
            val opfsWarn = TextView(activity).apply {
                text = "Notice: WebView <109 detected ($webViewMajor). OPFS is unavailable; IndexedDB/SQLite fallback active."
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                setTextColor(0xFFD97706.toInt())
                setPadding(0, dp(6), 0, dp(4))
            }
            container.addView(opfsWarn)
        }

        // 2. Storage Truth Card
        container.addView(buildSectionHeader("Storage Truth Card"))
        val initialVault = nativeBackupVault.getVaultInfo()
        val initialAppWebView = nativeBackupVault.getAppWebViewBytes()
        val storageTruthView = buildMonospaceBox(
            formatStorageTruthText(
                persistedText = "Querying...",
                quotaText = "Querying...",
                appWebViewBytes = initialAppWebView,
                vaultState = initialVault
            )
        )
        container.addView(storageTruthView)

        // Query JS navigator.storage.persisted() & estimate() with short timeout + read-only disk stats
        var jsPersistedLabel = "Unavailable"
        var jsQuotaLabel = "Unavailable"
        var latestAppWebViewBytes = initialAppWebView
        var latestVaultState = initialVault

        fun refreshStorageCardText() {
            if (activeDialog?.isShowing != true || activity.isFinishing || activity.isDestroyed) return
            storageTruthView.text = formatStorageTruthText(
                persistedText = jsPersistedLabel,
                quotaText = jsQuotaLabel,
                appWebViewBytes = latestAppWebViewBytes,
                vaultState = latestVaultState
            )
        }

        probeWebViewStorageQuota(activeOrigin) { persisted, usage, quota, statusNote ->
            cachedPersisted = persisted
            cachedQuotaUsageBytes = usage
            cachedQuotaTotalBytes = quota
            jsPersistedLabel = persisted?.toString() ?: statusNote
            jsQuotaLabel = if (usage != null && quota != null && quota > 0L) {
                "${formatBytes(usage)} / ${formatBytes(quota)}"
            } else if (usage != null) {
                formatBytes(usage)
            } else {
                statusNote
            }
            refreshStorageCardText()
        }

        nativeBackupVault.refreshStorageMetricsAsync { updatedVault, updatedAppWebViewBytes ->
            mainHandler.post {
                latestVaultState = updatedVault
                latestAppWebViewBytes = updatedAppWebViewBytes
                refreshStorageCardText()
            }
        }

        // 3. Recovery & Diagnostic Actions
        container.addView(buildSectionHeader("Actions"))

        val copyJsonBtn = buildActionButton("Copy Diagnostic JSON") {
            val compactJson = buildCompactDiagnosticJson(
                webViewPkg = webViewPkg,
                webViewVer = webViewVer,
                webViewMajor = webViewMajor,
                activeOrigin = activeOrigin,
                vaultState = latestVaultState,
                appWebViewBytes = latestAppWebViewBytes
            )
            val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            if (clipboard != null) {
                clipboard.setPrimaryClip(ClipData.newPlainText("Pedigree Diagnostics", compactJson))
                Toast.makeText(activity, R.string.dev_panel_copied, Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(activity, R.string.dev_panel_copy_failed, Toast.LENGTH_SHORT).show()
            }
        }
        container.addView(copyJsonBtn)

        val reloadBtn = buildActionButton("Reload App") {
            dismiss()
            onReloadApp()
        }
        container.addView(reloadBtn)

        val softResetBtn = buildActionButton("Soft Cache Reset (?emergency_reset=true)") {
            dismiss()
            onSoftCacheReset()
        }
        container.addView(softResetBtn)

        // 4. BuildConfig.DEBUG-only HTTPS URL Switcher (stripped by R8 in release builds)
        if (BuildConfig.DEBUG) {
            container.addView(buildSectionHeader("Debug Target URL (DEBUG Only)"))
            val urlInput = EditText(activity).apply {
                setText(activeStartUrlProvider())
                setSingleLine(true)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                typeface = Typeface.MONOSPACE
                hint = "https://askkim.github.io/Pedigree/"
            }
            container.addView(urlInput)

            val switchRow = LinearLayout(activity).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
            }
            val useBundledBtn = Button(activity).apply {
                text = "Bundled Assets"
                isAllCaps = false
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                setOnClickListener {
                    dismiss()
                    onDebugTargetUrlChanged(null)
                }
            }
            val loadDebugUrlBtn = Button(activity).apply {
                text = "Load HTTPS URL"
                isAllCaps = false
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                setOnClickListener {
                    val candidate = urlInput.text?.toString()?.trim().orEmpty()
                    if (!isAllowedDebugHttpsUrl(candidate)) {
                        Toast.makeText(activity, R.string.dev_panel_debug_url_invalid, Toast.LENGTH_SHORT).show()
                        return@setOnClickListener
                    }
                    dismiss()
                    onDebugTargetUrlChanged(candidate)
                }
            }
            switchRow.addView(useBundledBtn)
            switchRow.addView(loadDebugUrlBtn)
            container.addView(switchRow)
        }

        // 5. 100-Event Ring Buffer Log
        val events = diagnosticBuffer.snapshot()
        container.addView(buildSectionHeader("Recent Events (${events.size}/${DiagnosticRingBuffer.CAPACITY})"))
        val eventsText = if (events.isEmpty()) {
            "No native events recorded yet."
        } else {
            val sb = StringBuilder(events.size * 64)
            for (i in events.indices.reversed()) {
                val ev = events[i]
                val t = DiagnosticRingBuffer.formatLocalTimeShort(ev.timestampMs)
                val lvl = ev.level.firstOrNull()?.uppercaseChar() ?: 'I'
                sb.append('[').append(t).append("] ").append(lvl).append(' ')
                    .append(ev.code)
                if (ev.repeatCount > 1) {
                    sb.append(" (x").append(ev.repeatCount).append(')')
                }
                sb.append(": ").append(ev.message)
                if (i > 0) sb.append('\n')
            }
            sb.toString()
        }
        container.addView(buildMonospaceBox(eventsText))

        val dialog = AlertDialog.Builder(activity)
            .setTitle(R.string.dev_panel_title)
            .setView(scrollView)
            .setPositiveButton(android.R.string.ok, null)
            .create()

        dialog.setOnDismissListener {
            mainHandler.removeCallbacksAndMessages(null)
            if (activeDialog === dialog) {
                activeDialog = null
            }
        }

        activeDialog = dialog
        dialog.show()
    }

    /** Dismisses the dialog and cancels any pending storage-probe polling callbacks. */
    fun dismiss() {
        mainHandler.removeCallbacksAndMessages(null)
        val dlg = activeDialog
        activeDialog = null
        if (dlg != null && dlg.isShowing) {
            try {
                dlg.dismiss()
            } catch (_: Exception) {
                // Activity window already detached
            }
        }
    }

    /**
     * Evaluates `navigator.storage.persisted()` and `navigator.storage.estimate()` inside the
     * active WebView (only when its origin matches [activeOrigin]) using a 500ms timeout ceiling.
     */
    private fun probeWebViewStorageQuota(
        activeOrigin: String,
        onResult: (persisted: Boolean?, usage: Long?, quota: Long?, statusNote: String) -> Unit
    ) {
        val wv = webViewProvider()
        if (wv == null) {
            onResult(null, null, null, "WebView unmounted")
            return
        }

        val currentOrigin = extractOrigin(wv.url)
        if (currentOrigin == null || currentOrigin != activeOrigin) {
            onResult(null, null, null, "Origin mismatch")
            return
        }

        var settled = false
        val timeoutRunnable = Runnable {
            if (!settled) {
                settled = true
                onResult(null, null, null, "Timed out (${STORAGE_PROBE_TIMEOUT_MS}ms)")
            }
        }
        mainHandler.postDelayed(timeoutRunnable, STORAGE_PROBE_TIMEOUT_MS)

        val triggerScript = """
            (function(){
              try {
                if (!navigator || !navigator.storage) {
                  return JSON.stringify({supported:false});
                }
                window.__pedigreeDevStorageProbe = null;
                Promise.all([
                  navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(null),
                  navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(null)
                ]).then(function(res){
                  window.__pedigreeDevStorageProbe = JSON.stringify({
                    supported: true,
                    persisted: res[0],
                    usage: res[1] && typeof res[1].usage === 'number' ? res[1].usage : null,
                    quota: res[1] && typeof res[1].quota === 'number' ? res[1].quota : null
                  });
                }).catch(function(){
                  window.__pedigreeDevStorageProbe = JSON.stringify({supported:false});
                });
                return "PENDING";
              } catch (e) {
                return JSON.stringify({supported:false});
              }
            })();
        """.trimIndent()

        fun pollResult(attempt: Int) {
            if (settled || activeDialog?.isShowing != true) return
            val activeWv = webViewProvider() ?: run {
                settled = true
                mainHandler.removeCallbacks(timeoutRunnable)
                onResult(null, null, null, "WebView unmounted")
                return
            }
            activeWv.evaluateJavascript(
                "(function(){var r=window.__pedigreeDevStorageProbe; if(r){try{delete window.__pedigreeDevStorageProbe;}catch(e){}} return r;})();"
            ) { raw ->
                if (settled || activeDialog?.isShowing != true) return@evaluateJavascript
                val parsedJson = decodeJsStringResult(raw)
                if (parsedJson != null) {
                    settled = true
                    mainHandler.removeCallbacks(timeoutRunnable)
                    applyStorageProbeJson(parsedJson, onResult)
                } else if (attempt < 3) {
                    mainHandler.postDelayed({ pollResult(attempt + 1) }, 120L)
                }
            }
        }

        try {
            wv.evaluateJavascript(triggerScript) { raw ->
                if (settled || activeDialog?.isShowing != true) return@evaluateJavascript
                val value = decodeJsStringResult(raw)
                if (value == null || value == "PENDING") {
                    mainHandler.postDelayed({ pollResult(1) }, 100L)
                } else {
                    settled = true
                    mainHandler.removeCallbacks(timeoutRunnable)
                    applyStorageProbeJson(value, onResult)
                }
            }
        } catch (_: Exception) {
            if (!settled) {
                settled = true
                mainHandler.removeCallbacks(timeoutRunnable)
                onResult(null, null, null, "Probe failed")
            }
        }
    }

    private fun applyStorageProbeJson(
        jsonString: String,
        onResult: (persisted: Boolean?, usage: Long?, quota: Long?, statusNote: String) -> Unit
    ) {
        try {
            val obj = JSONObject(jsonString)
            if (!obj.optBoolean("supported", false)) {
                onResult(null, null, null, "navigator.storage unsupported")
                return
            }
            val persisted = if (obj.isNull("persisted")) null else obj.optBoolean("persisted")
            val usage = if (obj.isNull("usage")) null else obj.optLong("usage")
            val quota = if (obj.isNull("quota")) null else obj.optLong("quota")
            onResult(persisted, usage, quota, "OK")
        } catch (_: Exception) {
            onResult(null, null, null, "Parse error")
        }
    }

    /**
     * Builds a compact diagnostic JSON payload omitting null/empty fields and excluding all user
     * records or PII, ready to copy to clipboard for support or AI triage.
     */
    private fun buildCompactDiagnosticJson(
        webViewPkg: String,
        webViewVer: String,
        webViewMajor: Int?,
        activeOrigin: String,
        vaultState: NativeBackupVault.VaultState,
        appWebViewBytes: Long
    ): String {
        val root = JSONObject()

        val appObj = JSONObject().apply {
            if (BuildConfig.VERSION_NAME.isNotEmpty()) put("ver", BuildConfig.VERSION_NAME)
            put("build", if (BuildConfig.DEBUG) "debug" else "release")
            put("sdk", Build.VERSION.SDK_INT)
            if (lastTriggerSource.isNotEmpty()) put("trigger", lastTriggerSource)
        }
        root.put("app", appObj)

        val wvObj = JSONObject().apply {
            if (webViewPkg.isNotEmpty()) put("pkg", webViewPkg)
            if (webViewVer.isNotEmpty()) put("ver", webViewVer)
            if (webViewMajor != null) {
                put("major", webViewMajor)
                put("opfs", webViewMajor >= 109)
            }
            if (activeOrigin.isNotEmpty()) put("origin", activeOrigin)
        }
        root.put("wv", wvObj)

        val storageObj = JSONObject().apply {
            cachedPersisted?.let { put("persisted", it) }
            cachedQuotaUsageBytes?.let { put("jsUsage", it) }
            cachedQuotaTotalBytes?.let { put("jsQuota", it) }
            if (appWebViewBytes >= 0L) put("appWebViewB", appWebViewBytes)
            put("vaultCount", vaultState.snapshotCount)
            put("vaultB", vaultState.totalBytes)
            val lastAt = vaultState.latestTimestampIso
            if (!lastAt.isNullOrEmpty()) put("lastVaultAt", lastAt)
        }
        root.put("storage", storageObj)

        val eventsArr = diagnosticBuffer.toCompactJsonArray()
        if (eventsArr.length() > 0) {
            root.put("events", eventsArr)
        }
        return root.toString()
    }

    private fun formatStorageTruthText(
        persistedText: String,
        quotaText: String,
        appWebViewBytes: Long,
        vaultState: NativeBackupVault.VaultState
    ): String {
        val appWebViewText = if (appWebViewBytes >= 0L) formatBytes(appWebViewBytes) else "Measuring..."
        val vaultText = "${vaultState.snapshotCount} snapshot(s) · ${formatBytes(vaultState.totalBytes)}"
        val lastBackup = vaultState.latestTimestampIso ?: "None yet"
        return buildString {
            appendLine("navigator.storage.persisted(): $persistedText")
            appendLine("JS storage estimate: $quotaText")
            appendLine("app_webview (read-only): $appWebViewText")
            appendLine("filesDir/pedigree-vault/: $vaultText")
            append("Last native backup: $lastBackup")
        }
    }

    private fun buildSectionHeader(title: String): TextView {
        return TextView(activity).apply {
            text = title
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            setTypeface(null, Typeface.BOLD)
            setPadding(0, dp(10), 0, dp(4))
        }
    }

    private fun buildMonospaceBox(content: String): TextView {
        return TextView(activity).apply {
            text = content
            typeface = Typeface.MONOSPACE
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            setTextIsSelectable(true)
            val pad = dp(8)
            setPadding(pad, pad, pad, pad)
            setBackgroundColor(0x14888888)
        }
    }

    private fun buildActionButton(label: String, onClick: () -> Unit): Button {
        return Button(activity).apply {
            text = label
            isAllCaps = false
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            setOnClickListener { onClick() }
        }
    }

    private fun extractOrigin(rawUrl: String?): String? {
        if (rawUrl.isNullOrBlank()) return null
        val uri = try {
            Uri.parse(rawUrl)
        } catch (_: Exception) {
            return null
        }
        val scheme = uri.scheme?.lowercase(Locale.US) ?: return null
        val host = uri.host?.lowercase(Locale.US) ?: return null
        val isDefaultPort = (scheme == "https" && uri.port == 443) || (scheme == "http" && uri.port == 80)
        return "$scheme://$host" + if (uri.port != -1 && !isDefaultPort) ":${uri.port}" else ""
    }

    private fun decodeJsStringResult(raw: String?): String? {
        if (raw.isNullOrBlank() || raw == "null") return null
        return try {
            org.json.JSONTokener(raw).nextValue() as? String
        } catch (_: Exception) {
            null
        }
    }

    private fun isAllowedDebugHttpsUrl(candidate: String): Boolean {
        if (!BuildConfig.DEBUG) return false
        val uri = try {
            Uri.parse(candidate)
        } catch (_: Exception) {
            return false
        }
        val path = uri.path.orEmpty()
        return uri.scheme?.lowercase(Locale.US) == "https" &&
            uri.userInfo == null &&
            (uri.port == -1 || uri.port == 443) &&
            uri.host?.lowercase(Locale.US) == DEBUG_ALLOWED_HOST &&
            (path == DEBUG_ALLOWED_PATH_PREFIX || path.startsWith("$DEBUG_ALLOWED_PATH_PREFIX/"))
    }

    private fun formatBytes(bytes: Long): String {
        if (bytes < 0L) return "0 B"
        if (bytes < 1024L) return "$bytes B"
        val kib = bytes / 1024.0
        if (kib < 1024.0) return String.format(Locale.US, "%.1f KiB", kib)
        val mib = kib / 1024.0
        return String.format(Locale.US, "%.2f MiB", mib)
    }

    private fun dp(value: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            activity.resources.displayMetrics
        ).toInt()
    }

    companion object {
        private const val STORAGE_PROBE_TIMEOUT_MS = 500L
        private const val DEBUG_ALLOWED_HOST = "askkim.github.io"
        private const val DEBUG_ALLOWED_PATH_PREFIX = "/Pedigree"
    }
}
```

## `android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/DiagnosticRingBuffer.kt`

```kotlin
/*
 * Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

package org.askkim.pedigree.wrapper

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Fixed-capacity (100-entry) synchronized circular ring buffer for native wrapper diagnostics.
 *
 * Design goals for low-RAM Android 8+ phones and privacy:
 * - **Zero heap churn**: backed by a single pre-allocated `Array<DiagnosticEvent?>(100)`—no
 *   `LinkedList` node allocations, no `removeAt(0)` array shifts, and zero disk log files.
 * - **60s burst deduplication**: identical consecutive `(level, code, message)` events within
 *   60 seconds increment `repeatCount` in place instead of flooding the buffer.
 * - **PII & secret stripping**: [sanitizeUrl] strips query parameters, fragments, and `user:pass@`
 *   userinfo, and [sanitizeMessage] bounds messages to 240 chars at insert time.
 */
class DiagnosticRingBuffer {

    data class DiagnosticEvent(
        val timestampMs: Long,
        val level: String,
        val code: String,
        val message: String,
        val repeatCount: Int = 1
    )

    private val lock = Any()
    private val buffer = arrayOfNulls<DiagnosticEvent>(CAPACITY)
    private var startIndex = 0
    private var count = 0

    /**
     * Records a sanitized diagnostic event in O(1) time. Thread-safe across WebView, I/O, and UI threads.
     */
    fun record(level: String, code: String, message: String) {
        val normalizedLevel = when (level.trim().lowercase(Locale.US)) {
            LEVEL_ERROR -> LEVEL_ERROR
            LEVEL_WARN -> LEVEL_WARN
            else -> LEVEL_INFO
        }
        val normalizedCode = code.trim()
            .ifEmpty { "EVENT" }
            .take(MAX_CODE_CHARS)
        val sanitizedMessage = sanitizeMessage(message)
        val nowMs = System.currentTimeMillis()

        synchronized(lock) {
            if (count > 0) {
                val lastIndex = (startIndex + count - 1) % CAPACITY
                val last = buffer[lastIndex]
                if (last != null &&
                    last.level == normalizedLevel &&
                    last.code == normalizedCode &&
                    last.message == sanitizedMessage &&
                    (nowMs - last.timestampMs) <= DEDUP_WINDOW_MS
                ) {
                    buffer[lastIndex] = last.copy(
                        timestampMs = nowMs,
                        repeatCount = (last.repeatCount + 1).coerceAtMost(9999)
                    )
                    return
                }
            }

            val event = DiagnosticEvent(
                timestampMs = nowMs,
                level = normalizedLevel,
                code = normalizedCode,
                message = sanitizedMessage,
                repeatCount = 1
            )
            if (count < CAPACITY) {
                val writeIndex = (startIndex + count) % CAPACITY
                buffer[writeIndex] = event
                count += 1
            } else {
                buffer[startIndex] = event
                startIndex = (startIndex + 1) % CAPACITY
            }
        }
    }

    /** Returns an ordered chronological copy (oldest -> newest) of buffered events. */
    fun snapshot(): List<DiagnosticEvent> {
        synchronized(lock) {
            if (count == 0) return emptyList()
            val result = ArrayList<DiagnosticEvent>(count)
            for (i in 0 until count) {
                val item = buffer[(startIndex + i) % CAPACITY]
                if (item != null) {
                    result.add(item)
                }
            }
            return result
        }
    }

    /** Returns the current number of buffered events (`0..100`). */
    fun count(): Int {
        synchronized(lock) {
            return count
        }
    }

    /**
     * Serializes buffered events into a compact JSON array (short keys `ts`, `lvl`, `code`, `msg`,
     * optional `n` when `repeatCount > 1`) to minimize clipboard and AI-triage token size.
     */
    fun toCompactJsonArray(): JSONArray {
        val events = snapshot()
        val array = JSONArray()
        for (event in events) {
            val obj = JSONObject()
            obj.put("ts", formatTimestampUtc(event.timestampMs))
            if (event.level.isNotEmpty()) obj.put("lvl", event.level)
            if (event.code.isNotEmpty()) obj.put("code", event.code)
            if (event.message.isNotEmpty()) obj.put("msg", event.message)
            if (event.repeatCount > 1) obj.put("n", event.repeatCount)
            array.put(obj)
        }
        return array
    }

    companion object {
        const val CAPACITY = 100
        const val MAX_MESSAGE_CHARS = 240
        const val MAX_CODE_CHARS = 48
        private const val DEDUP_WINDOW_MS = 60_000L

        const val LEVEL_INFO = "info"
        const val LEVEL_WARN = "warn"
        const val LEVEL_ERROR = "error"

        private val EMBEDDED_URL_REGEX = Regex("https?://[^\\s\"'<>]+", RegexOption.IGNORE_CASE)
        private val LOCAL_TIME_FORMATTER: DateTimeFormatter =
            DateTimeFormatter.ofPattern("HH:mm:ss", Locale.US).withZone(ZoneId.systemDefault())

        /**
         * Strips `?query`, `#fragment`, and `user:pass@` authority credentials from a URL so tokens,
         * OAuth codes, and sensitive parameters can never enter diagnostics.
         */
        fun sanitizeUrl(rawUrl: String?): String {
            if (rawUrl.isNullOrBlank()) return ""
            val trimmed = rawUrl.trim()
            val qIdx = trimmed.indexOf('?')
            val hIdx = trimmed.indexOf('#')
            val cutIdx = when {
                qIdx >= 0 && hIdx >= 0 -> minOf(qIdx, hIdx)
                qIdx >= 0 -> qIdx
                hIdx >= 0 -> hIdx
                else -> trimmed.length
            }
            var base = trimmed.substring(0, cutIdx)
            val schemeSep = base.indexOf("://")
            if (schemeSep >= 0) {
                val authStart = schemeSep + 3
                val pathStart = base.indexOf('/', authStart).let { if (it < 0) base.length else it }
                val atIdx = base.indexOf('@', authStart)
                if (atIdx in authStart until pathStart) {
                    base = base.substring(0, authStart) + base.substring(atIdx + 1)
                }
            }
            return if (base.length > 160) base.substring(0, 157) + "..." else base
        }

        fun sanitizeMessage(rawMessage: String?): String {
            if (rawMessage.isNullOrBlank()) return ""
            val collapsed = rawMessage.replace('\r', ' ').replace('\n', ' ').trim()
            val stripped = EMBEDDED_URL_REGEX.replace(collapsed) { match ->
                sanitizeUrl(match.value)
            }
            return if (stripped.length > MAX_MESSAGE_CHARS) {
                stripped.substring(0, MAX_MESSAGE_CHARS - 3) + "..."
            } else {
                stripped
            }
        }

        fun formatTimestampUtc(timestampMs: Long): String {
            return DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(timestampMs))
        }

        fun formatLocalTimeShort(timestampMs: Long): String {
            return LOCAL_TIME_FORMATTER.format(Instant.ofEpochMilli(timestampMs))
        }
    }
}
```

## `android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/ExternalNavigationBridge.kt`

```kotlin
/*
 * Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

package org.askkim.pedigree.wrapper

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import org.json.JSONObject
import java.util.Locale

/**
 * Routes `mailto:`, external `https://` links, and Google Calendar / Firebase OAuth URLs out of
 * the WebView to native email clients or Android Custom Tabs with default-browser fallback.
 *
 * Security model:
 * - Only same-origin `https://` requests (`activeOrigin`) are allowed to stay inside the WebView.
 * - `http://`, `file://`, `content://`, `javascript:`, `data:`, and `blob:` are unconditionally
 *   blocked and recorded in [DiagnosticRingBuffer].
 * - Google/Firebase OAuth hosts (`accounts.google.com`, `*.firebaseapp.com/__/auth`) are never
 *   permitted inside an embedded WebView (`403 disallowed_useragent`); they always launch in
 *   Custom Tabs with sharing disabled (`SHARE_STATE_OFF`) to protect authorization URLs/states.
 */
class ExternalNavigationBridge(
    private val activity: AppCompatActivity,
    private val diagnosticBuffer: DiagnosticRingBuffer? = null
) {
    /**
     * Handles WebView navigation requests. Returns `true` if handled/blocked natively,
     * or `false` if the WebView should proceed loading the same-origin app URL.
     */
    fun handleWebViewNavigation(
        uri: Uri,
        isForMainFrame: Boolean,
        activeOrigin: String
    ): Boolean {
        val scheme = uri.scheme?.lowercase(Locale.US) ?: return true

        if (scheme == "mailto") {
            if (isForMainFrame) {
                openMailtoSafely(uri)
            }
            return true
        }

        if (scheme != "https") {
            // Reject http://, file://, content://, javascript:, data:, blob:, etc.
            diagnosticBuffer?.record(
                DiagnosticRingBuffer.LEVEL_WARN,
                "EXT_BLOCKED_SCHEME",
                "Blocked $scheme URL (${DiagnosticRingBuffer.sanitizeUrl(uri.toString())})"
            )
            return true
        }

        val host = uri.host?.lowercase(Locale.US)
        if (host.isNullOrBlank()) {
            diagnosticBuffer?.record(
                DiagnosticRingBuffer.LEVEL_WARN,
                "EXT_BLOCKED_HOST",
                "Blocked https URL with empty host"
            )
            return true
        }

        // Never open Google / Firebase OAuth flows inside the WebView
        if (isOAuthUri(uri)) {
            if (isForMainFrame) {
                openHttpsExternalSafely(uri, purpose = PURPOSE_OAUTH)
            }
            return true
        }

        val requestOrigin = "https://$host" + if (uri.port != -1 && uri.port != 443) ":${uri.port}" else ""
        if (requestOrigin == activeOrigin) {
            return false
        }

        if (isForMainFrame) {
            openHttpsExternalSafely(uri, purpose = PURPOSE_EXTERNAL)
        }
        return true
    }

    /**
     * Handles `OPEN_EXTERNAL_URL` bridge envelopes sent by `pedigreeBridge.openExternalUrl`.
     */
    fun handleBridgeRequest(payload: JSONObject?) {
        if (payload == null) return
        val urlString = if (payload.isNull("url")) "" else payload.optString("url", "").trim()
        if (urlString.isEmpty()) return

        val purpose = if (payload.isNull("purpose")) {
            PURPOSE_EXTERNAL
        } else {
            payload.optString("purpose", PURPOSE_EXTERNAL).trim().lowercase(Locale.US)
        }

        val uri = try {
            Uri.parse(urlString)
        } catch (_: Exception) {
            return
        }

        when (uri.scheme?.lowercase(Locale.US)) {
            "https" -> if (!uri.host.isNullOrBlank()) {
                openHttpsExternalSafely(uri, purpose)
            }
            "mailto" -> openMailtoSafely(uri)
        }
    }

    /**
     * Extension hook for future public-release Google Calendar / Firebase OAuth redirect intents
     * delivered to `MainActivity.onNewIntent`. Active v1 signing defers Calendar OAuth.
     */
    fun onOAuthRedirectIntent(@Suppress("UNUSED_PARAMETER") intent: Intent?) {
        // Intentionally deferred in v1: future public release can forward verified OAuth redirect
        // results back to the PWA bridge here.
    }

    /**
     * Launches an external `https://` URL in Android Custom Tabs, falling back to `Intent.ACTION_VIEW`
     * if no Custom Tabs provider is installed on the device.
     */
    fun openHttpsExternalSafely(uri: Uri, purpose: String = PURPOSE_EXTERNAL) {
        if (uri.scheme?.lowercase(Locale.US) != "https") return
        val isOAuth = isOAuthPurpose(purpose) || isOAuthUri(uri)
        val sanitized = DiagnosticRingBuffer.sanitizeUrl(uri.toString())
        diagnosticBuffer?.record(
            DiagnosticRingBuffer.LEVEL_INFO,
            if (isOAuth) "EXT_REROUTED_OAUTH" else "EXT_REROUTED_HTTPS",
            "Rerouted $sanitized to Custom Tab"
        )

        try {
            val builder = CustomTabsIntent.Builder()
                .setShowTitle(true)
            if (isOAuth) {
                // Prevent OAuth authorization URLs/states from being shared from the Custom Tab menu
                builder.setShareState(CustomTabsIntent.SHARE_STATE_OFF)
            }
            builder.build().launchUrl(activity, uri)
        } catch (_: Exception) {
            try {
                activity.startActivity(Intent(Intent.ACTION_VIEW, uri))
            } catch (_: Exception) {
                diagnosticBuffer?.record(
                    DiagnosticRingBuffer.LEVEL_WARN,
                    "EXT_LAUNCH_FAILED",
                    "No handler for $sanitized"
                )
                Toast.makeText(activity, R.string.external_link_unavailable, Toast.LENGTH_SHORT).show()
            }
        }
    }

    /** Opens a `mailto:` URI in the device's email client via `Intent.ACTION_SENDTO`. */
    fun openMailtoSafely(uri: Uri) {
        if (uri.scheme?.lowercase(Locale.US) != "mailto") return
        diagnosticBuffer?.record(
            DiagnosticRingBuffer.LEVEL_INFO,
            "EXT_REROUTED_MAILTO",
            "Rerouted mailto intent"
        )
        try {
            activity.startActivity(Intent(Intent.ACTION_SENDTO, uri))
        } catch (_: Exception) {
            diagnosticBuffer?.record(
                DiagnosticRingBuffer.LEVEL_WARN,
                "EXT_MAILTO_FAILED",
                "No email client available"
            )
            Toast.makeText(activity, R.string.external_link_unavailable, Toast.LENGTH_SHORT).show()
        }
    }

    private fun isOAuthPurpose(purpose: String): Boolean {
        return purpose.contains("oauth") || purpose.contains("calendar-auth") || purpose == "auth"
    }

    private fun isOAuthUri(uri: Uri): Boolean {
        val host = uri.host?.lowercase(Locale.US) ?: return false
        val path = uri.path?.lowercase(Locale.US) ?: ""
        if (host == "accounts.google.com") {
            return true
        }
        if ((host.endsWith(".firebaseapp.com") || host.endsWith(".web.app")) &&
            path.startsWith("/__/auth")
        ) {
            return true
        }
        return false
    }

    companion object {
        private const val PURPOSE_EXTERNAL = "external"
        private const val PURPOSE_OAUTH = "oauth"
    }
}
```

## `android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/FileAndExportBridge.kt`

```kotlin
/*
 * Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

package org.askkim.pedigree.wrapper

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicLong

/**
 * Handles WebView `<input type="file">` selection via [ActivityResultContracts.OpenDocument] /
 * [ActivityResultContracts.OpenMultipleDocuments] and binary exports/shares (`BEGIN_BINARY_TRANSFER`
 * + `ArrayBuffer`) off the UI thread via SAF (`ACTION_CREATE_DOCUMENT`) or [FileProvider] +
 * `Intent.ACTION_SEND`.
 *
 * Why is this bridge needed?
 * Inside Android `WebView`, `<a download="backup.zip" href="blob:...">` links are silently
 * ignored and `<input type="file">` does nothing unless [WebChromeClient.onShowFileChooser] is
 * implemented and registered via AndroidX Activity Result launchers.
 */
class FileAndExportBridge(
    private val activity: AppCompatActivity
) {
    private val appContext: Context = activity.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private val ioExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val shareSequence = AtomicLong(0L)

    private var pendingFilePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingTransfer: PendingBinaryTransfer? = null
    private var pendingSavePayload: PendingSavePayload? = null
    private var destroyed = false

    private val openSingleDocumentLauncher: ActivityResultLauncher<Array<String>> =
        activity.registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            val callback = pendingFilePathCallback
            pendingFilePathCallback = null
            if (callback != null) {
                callback.onReceiveValue(if (uri != null) arrayOf(uri) else null)
            }
        }

    private val openMultipleDocumentsLauncher: ActivityResultLauncher<Array<String>> =
        activity.registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
            val callback = pendingFilePathCallback
            pendingFilePathCallback = null
            if (callback != null) {
                val result = if (uris.isNotEmpty()) uris.toTypedArray() else null
                callback.onReceiveValue(result)
            }
        }

    private val createDocumentLauncher: ActivityResultLauncher<CreateDocumentRequest> =
        activity.registerForActivityResult(CreateDocumentWithMimeContract()) { uri ->
            val payload = pendingSavePayload
            pendingSavePayload = null
            if (uri != null && payload != null && !destroyed) {
                writeBytesToDocumentUriAsync(uri, payload.filename, payload.bytes)
            }
        }

    /**
     * Bridges `<input type="file">` taps from Chromium WebView to Android's system file picker.
     * Always resolves any orphaned [pendingFilePathCallback] first, because leaving a WebView
     * `ValueCallback` uninvoked permanently freezes future `<input type="file">` clicks.
     */
    fun onShowFileChooser(
        @Suppress("UNUSED_PARAMETER") webView: WebView?,
        filePathCallback: ValueCallback<Array<Uri>>?,
        fileChooserParams: WebChromeClient.FileChooserParams?
    ): Boolean {
        if (filePathCallback == null) {
            return false
        }
        if (destroyed) {
            filePathCallback.onReceiveValue(null)
            return true
        }

        // Always settle any unfulfilled previous callback so the WebView file input never locks up
        pendingFilePathCallback?.onReceiveValue(null)
        pendingFilePathCallback = filePathCallback

        val mimeTypes = resolveAcceptMimeTypes(fileChooserParams?.acceptTypes)
        val allowMultiple =
            fileChooserParams?.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE

        return try {
            if (allowMultiple) {
                openMultipleDocumentsLauncher.launch(mimeTypes)
            } else {
                openSingleDocumentLauncher.launch(mimeTypes)
            }
            true
        } catch (_: Exception) {
            pendingFilePathCallback?.onReceiveValue(null)
            pendingFilePathCallback = null
            showToast(activity.getString(R.string.file_picker_unavailable))
            true
        }
    }

    /**
     * Phase 1 of a binary export/share: records file metadata (`filename`, `mimeType`, `mode`,
     * `expectedByteLength`) from the `BEGIN_BINARY_TRANSFER` JSON envelope so the immediately
     * following `TYPE_ARRAY_BUFFER` frame knows where to write. Also supports an inline
     * `base64Data` fallback for legacy WebViews without `WEB_MESSAGE_ARRAY_BUFFER`.
     */
    fun beginBinaryTransfer(requestId: String, payload: JSONObject?): Boolean {
        if (destroyed || payload == null) {
            pendingTransfer = null
            return false
        }

        val rawFilename = if (payload.isNull("filename")) "pedigree-export.bin" else payload.optString("filename", "pedigree-export.bin")
        val filename = sanitizeFilename(rawFilename)
        val rawMimeType = if (payload.isNull("mimeType")) "application/octet-stream" else payload.optString("mimeType", "application/octet-stream")
        val mimeType = sanitizeMimeType(rawMimeType)
        val rawMode = if (payload.isNull("mode")) "save" else payload.optString("mode", "save")
        val mode = if (rawMode.equals("share", ignoreCase = true)) {
            TransferMode.SHARE
        } else {
            TransferMode.SAVE
        }
        val expectedByteLength = payload.optLong("byteLength", -1L)

        // Optional inline base64 fallback for legacy WebViews without WEB_MESSAGE_ARRAY_BUFFER
        val inlineBase64 = if (payload.isNull("base64Data")) "" else payload.optString("base64Data", "")
        if (inlineBase64.isNotEmpty()) {
            pendingTransfer = null
            val decoded = try {
                Base64.decode(inlineBase64, Base64.DEFAULT)
            } catch (_: IllegalArgumentException) {
                return false
            }
            dispatchBinaryTransfer(
                PendingBinaryTransfer(
                    requestId = requestId,
                    filename = filename,
                    mimeType = mimeType,
                    mode = mode,
                    expectedByteLength = expectedByteLength
                ),
                decoded
            )
            return false
        }

        pendingTransfer = PendingBinaryTransfer(
            requestId = requestId,
            filename = filename,
            mimeType = mimeType,
            mode = mode,
            expectedByteLength = expectedByteLength
        )
        return true
    }

    /** Clears any staged transfer metadata when a frame mismatch or WebView teardown occurs. */
    fun clearPendingTransfer() {
        pendingTransfer = null
    }

    /**
     * Phase 2 of a binary export/share: validates the incoming `ArrayBuffer` byte length against
     * `expectedByteLength` and launches SAF save or `FileProvider` share.
     */
    fun handleIncomingBinaryPayload(bytes: ByteArray) {
        if (destroyed) return
        val transfer = pendingTransfer ?: return
        pendingTransfer = null

        if (transfer.expectedByteLength >= 0L && bytes.size.toLong() != transfer.expectedByteLength) {
            showToast(activity.getString(R.string.export_save_failed))
            return
        }

        dispatchBinaryTransfer(transfer, bytes)
    }

    /** Settles any open file-picker callback, clears pending payloads, and shuts down the I/O executor. */
    fun destroy() {
        destroyed = true
        mainHandler.removeCallbacksAndMessages(null)
        pendingFilePathCallback?.onReceiveValue(null)
        pendingFilePathCallback = null
        pendingTransfer = null
        pendingSavePayload = null
        ioExecutor.shutdown()
    }

    private fun dispatchBinaryTransfer(transfer: PendingBinaryTransfer, bytes: ByteArray) {
        when (transfer.mode) {
            TransferMode.SAVE -> launchSafSave(transfer.filename, transfer.mimeType, bytes)
            TransferMode.SHARE -> shareViaFileProviderAsync(transfer.filename, transfer.mimeType, bytes)
        }
    }

    private fun launchSafSave(filename: String, mimeType: String, bytes: ByteArray) {
        val runLaunch = Runnable {
            if (destroyed || activity.isFinishing || activity.isDestroyed) return@Runnable
            pendingSavePayload = PendingSavePayload(filename = filename, bytes = bytes)
            try {
                createDocumentLauncher.launch(CreateDocumentRequest(filename = filename, mimeType = mimeType))
            } catch (_: ActivityNotFoundException) {
                pendingSavePayload = null
                showToast(activity.getString(R.string.export_save_failed))
            }
        }

        if (Looper.myLooper() == Looper.getMainLooper()) {
            runLaunch.run()
        } else {
            mainHandler.post(runLaunch)
        }
    }

    private fun writeBytesToDocumentUriAsync(uri: Uri, filename: String, bytes: ByteArray) {
        if (destroyed || ioExecutor.isShutdown) return
        try {
            ioExecutor.execute {
                val wrote = try {
                    val stream = try {
                        appContext.contentResolver.openOutputStream(uri, "wt")
                    } catch (_: Exception) {
                        appContext.contentResolver.openOutputStream(uri)
                    }
                    stream?.use { output ->
                        writeBytesChunked(output, bytes)
                        true
                    } ?: false
                } catch (_: Exception) {
                    false
                }

                mainHandler.post {
                    if (!destroyed) {
                        if (wrote) {
                            showToast(activity.getString(R.string.export_saved, filename))
                        } else {
                            showToast(activity.getString(R.string.export_save_failed))
                        }
                    }
                }
            }
        } catch (_: RejectedExecutionException) {
            // Activity shutting down
        }
    }

    private fun shareViaFileProviderAsync(filename: String, mimeType: String, bytes: ByteArray) {
        if (destroyed || ioExecutor.isShutdown) return
        try {
            ioExecutor.execute {
                val contentUri = try {
                    val exportsDir = File(appContext.cacheDir, EXPORTS_CACHE_SUBDIR)
                    if (!exportsDir.exists()) {
                        exportsDir.mkdirs()
                    }
                    pruneStaleExports(exportsDir)

                    val slotDir = File(
                        exportsDir,
                        "${System.currentTimeMillis().toString(36)}_${shareSequence.incrementAndGet()}"
                    )
                    slotDir.mkdirs()
                    val outFile = File(slotDir, filename)
                    FileOutputStream(outFile, false).use { output ->
                        writeBytesChunked(output, bytes)
                    }
                    FileProvider.getUriForFile(
                        appContext,
                        "${appContext.packageName}.fileprovider",
                        outFile
                    )
                } catch (_: Exception) {
                    null
                }

                mainHandler.post {
                    if (destroyed || activity.isFinishing || activity.isDestroyed) return@post
                    if (contentUri == null) {
                        showToast(activity.getString(R.string.export_save_failed))
                        return@post
                    }

                    val sendIntent = Intent(Intent.ACTION_SEND).apply {
                        type = mimeType
                        putExtra(Intent.EXTRA_STREAM, contentUri)
                        putExtra(Intent.EXTRA_SUBJECT, filename)
                        clipData = ClipData.newRawUri(filename, contentUri)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    val chooser = Intent.createChooser(sendIntent, filename).apply {
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    try {
                        activity.startActivity(chooser)
                    } catch (_: ActivityNotFoundException) {
                        showToast(activity.getString(R.string.export_share_unavailable))
                    }
                }
            }
        } catch (_: RejectedExecutionException) {
            // Activity shutting down
        }
    }

    private fun writeBytesChunked(rawOut: OutputStream, bytes: ByteArray) {
        BufferedOutputStream(rawOut, STREAM_BUFFER_BYTES).use { out ->
            var offset = 0
            while (offset < bytes.size) {
                val chunkLen = minOf(STREAM_BUFFER_BYTES, bytes.size - offset)
                out.write(bytes, offset, chunkLen)
                offset += chunkLen
            }
            out.flush()
        }
    }

    /** Deletes staged export directories in `cacheDir/exports/` older than 1 hour (`EXPORT_CACHE_TTL_MS`). */
    private fun pruneStaleExports(exportsDir: File) {
        val cutoffMs = System.currentTimeMillis() - EXPORT_CACHE_TTL_MS
        val children = exportsDir.listFiles() ?: return
        for (child in children) {
            if (child.lastModified() < cutoffMs) {
                child.deleteRecursively()
            }
        }
    }

    /**
     * Converts HTML `<input accept="...">` extensions/MIME tokens into Android `DocumentsUI`
     * MIME filters. Falls back to a wildcard MIME filter whenever custom data extensions (`.sqlite`,
     * `.db`, `.tsv`, `.json`, `.csv`, `.zip`) are included because many Android file providers
     * classify them as `application/octet-stream` and would otherwise gray them out.
     */
    private fun resolveAcceptMimeTypes(acceptTypes: Array<String>?): Array<String> {
        if (acceptTypes == null || acceptTypes.isEmpty()) {
            return DEFAULT_DOCUMENT_MIME_TYPES
        }

        val tokens = acceptTypes
            .flatMap { it.split(',') }
            .map { it.trim().lowercase(Locale.US) }
            .filter { it.isNotEmpty() }

        if (tokens.isEmpty()) {
            return DEFAULT_DOCUMENT_MIME_TYPES
        }

        val resolved = LinkedHashSet<String>()
        var includesCustomBinaryExt = false

        for (token in tokens) {
            when {
                token == "*/*" -> {
                    resolved.add("*/*")
                }
                token == "image/*" || token == ".png" || token == ".jpg" || token == ".jpeg" ||
                    token == ".webp" || token == ".gif" || token == ".avif" -> {
                    resolved.add("image/*")
                }
                token == ".zip" || token == "application/zip" || token == "application/x-zip-compressed" -> {
                    resolved.add("application/zip")
                    resolved.add("application/x-zip-compressed")
                    resolved.add("application/octet-stream")
                    includesCustomBinaryExt = true
                }
                token == ".json" || token == "application/json" -> {
                    resolved.add("application/json")
                    resolved.add("text/json")
                    resolved.add("text/plain")
                    includesCustomBinaryExt = true
                }
                token == ".csv" || token == "text/csv" -> {
                    resolved.add("text/csv")
                    resolved.add("text/comma-separated-values")
                    resolved.add("application/csv")
                    resolved.add("text/plain")
                    includesCustomBinaryExt = true
                }
                token == ".tsv" || token == "text/tab-separated-values" -> {
                    resolved.add("text/tab-separated-values")
                    resolved.add("text/plain")
                    includesCustomBinaryExt = true
                }
                token == ".htm" || token == ".html" || token == "text/html" -> {
                    resolved.add("text/html")
                }
                token == ".sqlite" || token == ".db" ||
                    token == "application/vnd.sqlite3" || token == "application/x-sqlite3" -> {
                    resolved.add("application/vnd.sqlite3")
                    resolved.add("application/x-sqlite3")
                    resolved.add("application/octet-stream")
                    includesCustomBinaryExt = true
                }
                token.contains('/') -> {
                    resolved.add(token)
                }
                token.startsWith('.') -> {
                    resolved.add("application/octet-stream")
                    includesCustomBinaryExt = true
                }
            }
        }

        if (resolved.isEmpty()) {
            return DEFAULT_DOCUMENT_MIME_TYPES
        }

        // Android's DocumentsUI often assigns generic MIME types to `.sqlite`, `.db`, `.tsv`, or
        // `.json` backups; fall back to `*/*` when those formats are accepted so files stay selectable.
        if (includesCustomBinaryExt || resolved.contains("*/*")) {
            return arrayOf("*/*")
        }

        return resolved.toTypedArray()
    }

    private fun sanitizeFilename(raw: String): String {
        val base = raw
            .replace('\\', '/')
            .substringAfterLast('/')
            .replace(Regex("[\\u0000-\\u001F<>:\"|?*]"), "_")
            .trim()
        if (base.isEmpty() || base == "." || base == "..") {
            return "pedigree-export.bin"
        }
        return base.take(128)
    }

    private fun sanitizeMimeType(raw: String): String {
        val cleaned = raw.substringBefore(';').trim().lowercase(Locale.US)
        if (cleaned.isEmpty() || !cleaned.contains('/')) {
            return "application/octet-stream"
        }
        return cleaned
    }

    private fun showToast(message: String) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            Toast.makeText(activity, message, Toast.LENGTH_SHORT).show()
        } else {
            mainHandler.post {
                if (!destroyed) {
                    Toast.makeText(activity, message, Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private enum class TransferMode {
        SAVE,
        SHARE
    }

    private data class PendingBinaryTransfer(
        val requestId: String,
        val filename: String,
        val mimeType: String,
        val mode: TransferMode,
        val expectedByteLength: Long
    )

    private class PendingSavePayload(
        val filename: String,
        val bytes: ByteArray
    )

    private data class CreateDocumentRequest(
        val filename: String,
        val mimeType: String
    )

    private class CreateDocumentWithMimeContract :
        ActivityResultContract<CreateDocumentRequest, Uri?>() {
        override fun createIntent(context: Context, input: CreateDocumentRequest): Intent {
            return Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = input.mimeType
                putExtra(Intent.EXTRA_TITLE, input.filename)
            }
        }

        override fun parseResult(resultCode: Int, intent: Intent?): Uri? {
            return if (resultCode == Activity.RESULT_OK) intent?.data else null
        }
    }

    companion object {
        private const val EXPORTS_CACHE_SUBDIR = "exports"
        private const val EXPORT_CACHE_TTL_MS = 60L * 60L * 1000L
        private const val STREAM_BUFFER_BYTES = 16 * 1024

        private val DEFAULT_DOCUMENT_MIME_TYPES = arrayOf(
            "application/zip",
            "application/x-zip-compressed",
            "application/json",
            "text/csv",
            "text/comma-separated-values",
            "text/tab-separated-values",
            "text/html",
            "application/vnd.sqlite3",
            "application/x-sqlite3",
            "application/octet-stream",
            "text/plain",
            "image/*",
            "*/*"
        )
    }
}
```

## `android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/MainActivity.kt`

```kotlin
/*
 * Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

package org.askkim.pedigree.wrapper

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.ServiceWorkerClientCompat
import androidx.webkit.ServiceWorkerControllerCompat
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.util.Locale

/**
 * Main host Activity for the Pedigree Android Wrapper (`org.askkim.pedigree.wrapper`).
 *
 * Architecture & Security Responsibilities:
 * 1. **Offline Asset Hosting**: Serves bundled Vite `dist/` assets from `assets/www/` at virtual
 *    origin `https://appassets.androidplatform.net/` via [WebViewAssetLoader] and intercepts
 *    Service Worker requests via [ServiceWorkerControllerCompat].
 * 2. **Origin-Locked IPC Bridge**: Exposes `window.pedigreeNative` via `WebViewCompat.addWebMessageListener`
 *    (strictly rejecting `addJavascriptInterface`), verifying `isMainFrame && sourceOrigin == activeOrigin`.
 * 3. **Two-Frame Binary Routing**: Coordinates [PendingBinaryTarget] (`NONE`, `EXPORT`, `VAULT`) so
 *    JSON metadata headers (`BEGIN_BINARY_TRANSFER`, `SYNC_BACKUP_SNAPSHOT`) pair safely with the
 *    trailing `TYPE_ARRAY_BUFFER` frame.
 * 4. **OWASP Hardening**: Disables file/content URL access, mixed content, and JS popups; ties
 *    remote WebView debugging and staging URL overrides strictly to `BuildConfig.DEBUG`.
 * 5. **Resilient Lifecycle**: Recovers from Chromium renderer crashes (`onRenderProcessGone`) with
 *    a foreground-deferred remount and 3-crash circuit breaker, and never calls `pauseTimers()`.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var rootContainer: FrameLayout
    private lateinit var assetLoader: WebViewAssetLoader
    private lateinit var backNavigationBridge: BackNavigationBridge
    private lateinit var fileAndExportBridge: FileAndExportBridge
    private lateinit var printBridge: PrintBridge
    private lateinit var externalNavigationBridge: ExternalNavigationBridge
    private lateinit var nativeBackupVault: NativeBackupVault

    private val diagnosticBuffer = DiagnosticRingBuffer()
    private var developerPanelDialog: DeveloperPanelDialog? = null
    private var pendingBinaryTarget: PendingBinaryTarget = PendingBinaryTarget.NONE

    private var webView: WebView? = null
    private var activeOrigin: String = ASSET_ORIGIN
    private var activeStartUrl: String = ASSET_START_URL
    private var currentReplyProxy: JavaScriptReplyProxy? = null

    private var lastRenderCrashTimestampMs: Long = 0L
    private var consecutiveRenderCrashCount: Int = 0
    private var isActivityResumed: Boolean = false
    private var pendingRendererRemount: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        rootContainer = DevTriggerRootContainer(this) {
            openDeveloperPanel("corner_5tap")
        }.apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        ViewCompat.setOnApplyWindowInsetsListener(rootContainer) { view, windowInsets ->
            val insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or
                    WindowInsetsCompat.Type.displayCutout() or
                    WindowInsetsCompat.Type.ime()
            )
            view.setPadding(insets.left, insets.top, insets.right, insets.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(rootContainer)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }

        assetLoader = WebViewAssetLoader.Builder()
            .setDomain(ASSET_HOST)
            .addPathHandler("/", PedigreeAssetPathHandler(applicationContext))
            .build()

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        configureServiceWorkerAssetInterceptor()
        resolveTargetUrlAndOrigin()

        nativeBackupVault = NativeBackupVault(applicationContext, diagnosticBuffer)
        fileAndExportBridge = FileAndExportBridge(this)
        printBridge = PrintBridge(
            activity = this,
            webViewProvider = { webView }
        )
        externalNavigationBridge = ExternalNavigationBridge(this, diagnosticBuffer)
        backNavigationBridge = BackNavigationBridge(
            activity = this,
            webViewProvider = { webView },
            replyProxyProvider = { currentReplyProxy },
            activeOriginProvider = { activeOrigin },
            diagnosticBuffer = diagnosticBuffer
        )
        backNavigationBridge.attach()

        mountWebView(savedInstanceState)
        if (savedInstanceState == null) {
            handleDiagnosticsShortcutIntent(intent)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        externalNavigationBridge.onOAuthRedirectIntent(intent)
        handleDiagnosticsShortcutIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        isActivityResumed = true
        if (pendingRendererRemount) {
            pendingRendererRemount = false
            mountWebView(null)
        } else {
            webView?.onResume()
        }
    }

    override fun onPause() {
        isActivityResumed = false
        webView?.onPause()
        // Never call webView.pauseTimers() — it pauses timers process-wide across WebViews.
        super.onPause()
    }

    override fun onDestroy() {
        ViewCompat.setOnApplyWindowInsetsListener(rootContainer, null)
        developerPanelDialog?.dismiss()
        developerPanelDialog = null
        backNavigationBridge.destroy()
        fileAndExportBridge.destroy()
        printBridge.destroy()
        nativeBackupVault.destroy()
        teardownWebView()
        super.onDestroy()
    }

    /**
     * Connects [ServiceWorkerControllerCompat] to [WebViewAssetLoader] so Service Worker fetches
     * under `https://appassets.androidplatform.net/` resolve from bundled APK assets offline.
     */
    private fun configureServiceWorkerAssetInterceptor() {
        if (
            WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE) &&
            WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)
        ) {
            val swController = ServiceWorkerControllerCompat.getInstance()
            // Top-level/static helper avoids capturing Activity reference inside process-wide singleton.
            swController.setServiceWorkerClient(PedigreeServiceWorkerClient(assetLoader))
        }
    }

    private fun resolveTargetUrlAndOrigin() {
        activeStartUrl = ASSET_START_URL
        activeOrigin = ASSET_ORIGIN

        if (!BuildConfig.DEBUG) {
            return
        }

        val prefs = getSharedPreferences(DEBUG_PREFS_NAME, Context.MODE_PRIVATE)
        val overrideUrl = prefs.getString(KEY_DEBUG_TARGET_URL, null)?.trim()
        if (!overrideUrl.isNullOrEmpty() && isAllowedDebugTargetUrl(overrideUrl)) {
            val uri = Uri.parse(overrideUrl)
            val host = uri.host?.lowercase(Locale.US) ?: return
            activeStartUrl = overrideUrl
            activeOrigin = "https://$host" + if (uri.port != -1 && uri.port != 443) ":${uri.port}" else ""
        }
    }

    private fun isAllowedDebugTargetUrl(candidate: String): Boolean {
        if (!BuildConfig.DEBUG) return false
        val uri = try {
            Uri.parse(candidate)
        } catch (_: Exception) {
            return false
        }
        val path = uri.path.orEmpty()
        return uri.scheme?.lowercase(Locale.US) == "https" &&
            uri.userInfo == null &&
            (uri.port == -1 || uri.port == 443) &&
            uri.host?.lowercase(Locale.US) == DEBUG_PAGES_HOST &&
            (path == DEBUG_PAGES_PATH_PREFIX || path.startsWith("$DEBUG_PAGES_PATH_PREFIX/"))
    }

    /**
     * Creates, configures, and attaches a hardened [WebView] instance to [rootContainer].
     * Called on initial launch, debug URL switches, and renderer crash recovery.
     */
    @SuppressLint("SetJavaScriptEnabled")
    private fun mountWebView(
        savedInstanceState: Bundle? = null,
        initialUrl: String = activeStartUrl
    ) {
        teardownWebView()
        rootContainer.removeAllViews()

        val wv = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }

        applyOwaspWebViewSettings(wv.settings)
        attachOriginLockedWebMessageListener(wv)

        wv.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                val uri = request.url
                if (uri.scheme?.lowercase(Locale.US) == "https" && uri.host?.lowercase(Locale.US) == ASSET_HOST) {
                    return assetLoader.shouldInterceptRequest(uri)
                }
                return super.shouldInterceptRequest(view, request)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                return externalNavigationBridge.handleWebViewNavigation(
                    uri = request.url,
                    isForMainFrame = request.isForMainFrame,
                    activeOrigin = activeOrigin
                )
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                val url = DiagnosticRingBuffer.sanitizeUrl(request?.url?.toString())
                val code = error?.errorCode ?: -1
                val desc = error?.description?.toString() ?: "error"
                val frame = if (request?.isForMainFrame == true) "main" else "sub"
                diagnosticBuffer.record(
                    DiagnosticRingBuffer.LEVEL_ERROR,
                    "WV_ERROR",
                    "[$frame] $code $desc ($url)"
                )
            }

            override fun onReceivedHttpError(
                view: WebView?,
                request: WebResourceRequest?,
                errorResponse: WebResourceResponse?
            ) {
                super.onReceivedHttpError(view, request, errorResponse)
                val status = errorResponse?.statusCode ?: 0
                val url = DiagnosticRingBuffer.sanitizeUrl(request?.url?.toString())
                val frame = if (request?.isForMainFrame == true) "main" else "sub"
                val level = if (status >= 500) DiagnosticRingBuffer.LEVEL_ERROR else DiagnosticRingBuffer.LEVEL_WARN
                diagnosticBuffer.record(
                    level,
                    "WV_HTTP_ERROR",
                    "[$frame] HTTP $status ($url)"
                )
            }

            override fun onRenderProcessGone(
                view: WebView,
                detail: RenderProcessGoneDetail
            ): Boolean {
                diagnosticBuffer.record(
                    DiagnosticRingBuffer.LEVEL_ERROR,
                    "WV_RENDER_GONE",
                    "didCrash=${detail.didCrash()} prio=${detail.rendererPriorityAtExit()} fg=$isActivityResumed"
                )
                handleRendererProcessGone(view, didCrash = detail.didCrash())
                return true
            }
        }

        wv.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                return fileAndExportBridge.onShowFileChooser(
                    webView = webView,
                    filePathCallback = filePathCallback,
                    fileChooserParams = fileChooserParams
                )
            }

            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                if (consoleMessage != null) {
                    val msgLevel = consoleMessage.messageLevel()
                    if (msgLevel == ConsoleMessage.MessageLevel.ERROR ||
                        msgLevel == ConsoleMessage.MessageLevel.WARNING
                    ) {
                        val level = if (msgLevel == ConsoleMessage.MessageLevel.ERROR) {
                            DiagnosticRingBuffer.LEVEL_ERROR
                        } else {
                            DiagnosticRingBuffer.LEVEL_WARN
                        }
                        val src = DiagnosticRingBuffer.sanitizeUrl(consoleMessage.sourceId())
                        val line = consoleMessage.lineNumber()
                        val text = consoleMessage.message().orEmpty()
                        diagnosticBuffer.record(
                            level,
                            "JS_CONSOLE",
                            "$src:$line $text"
                        )
                    }
                }
                return super.onConsoleMessage(consoleMessage)
            }
        }

        webView = wv
        rootContainer.addView(wv)

        if (savedInstanceState != null) {
            val restored = wv.restoreState(savedInstanceState)
            if (restored == null) {
                wv.loadUrl(initialUrl)
            }
        } else {
            wv.loadUrl(initialUrl)
        }
    }

    /**
     * Applies OWASP Mobile WebView hardening defaults:
     * - Blocks `file://` and `content://` reads so untrusted web content cannot read local files.
     * - Blocks `http://` mixed content and automatic `window.open()` popups.
     * - Enables Safe Browsing when supported by the installed Android System WebView.
     */
    @SuppressLint("SetJavaScriptEnabled")
    private fun applyOwaspWebViewSettings(settings: WebSettings) {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        @Suppress("DEPRECATION")
        settings.allowFileAccessFromFileURLs = false
        @Suppress("DEPRECATION")
        settings.allowUniversalAccessFromFileURLs = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.setSupportMultipleWindows(false)
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.mediaPlaybackRequiresUserGesture = false

        if (WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ENABLE)) {
            WebSettingsCompat.setSafeBrowsingEnabled(settings, true)
        }
    }

    /**
     * Attaches the origin-locked `window.pedigreeNative` WebMessageListener and routes incoming
     * JSON control envelopes (`TYPE_STRING`) and trailing binary payloads (`TYPE_ARRAY_BUFFER`).
     */
    private fun attachOriginLockedWebMessageListener(wv: WebView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            return
        }

        // Strict origin lock — never use addJavascriptInterface
        WebViewCompat.addWebMessageListener(
            wv,
            BRIDGE_OBJECT_NAME,
            setOf(activeOrigin)
        ) { _, message, sourceOrigin, isMainFrame, replyProxy ->
            if (!isMainFrame || sourceOrigin.toString() != activeOrigin) {
                return@addWebMessageListener
            }
            currentReplyProxy = replyProxy
            when (message.type) {
                WebMessageCompat.TYPE_STRING -> {
                    val raw = message.data ?: return@addWebMessageListener
                    handleIncomingControlEnvelope(raw, replyProxy)
                }

                WebMessageCompat.TYPE_ARRAY_BUFFER -> {
                    val target = pendingBinaryTarget
                    pendingBinaryTarget = PendingBinaryTarget.NONE
                    if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER)) {
                        val bytes = message.arrayBuffer
                        when (target) {
                            PendingBinaryTarget.EXPORT -> {
                                fileAndExportBridge.handleIncomingBinaryPayload(bytes)
                            }
                            PendingBinaryTarget.VAULT -> {
                                nativeBackupVault.handleIncomingSnapshotBytes(bytes)
                            }
                            PendingBinaryTarget.NONE -> {
                                diagnosticBuffer.record(
                                    DiagnosticRingBuffer.LEVEL_WARN,
                                    "BINARY_FRAME_UNEXPECTED",
                                    "Dropped unexpected ArrayBuffer (${bytes.size} B)"
                                )
                            }
                        }
                    } else {
                        fileAndExportBridge.clearPendingTransfer()
                        nativeBackupVault.clearPendingSnapshot()
                    }
                }
            }
        }
    }

    /**
     * Parses a `TYPE_STRING` control envelope from `pedigreeBridge` and dispatches it to the
     * matching native subsystem, enforcing the two-frame [PendingBinaryTarget] invariant.
     */
    private fun handleIncomingControlEnvelope(rawJson: String, replyProxy: JavaScriptReplyProxy) {
        val envelope = try {
            JSONObject(rawJson)
        } catch (_: Exception) {
            return
        }
        val type = envelope.optNonNullString("type")
        val requestId = envelope.optNonNullString("requestId")
        val payload = envelope.optJSONObject("payload")

        if (pendingBinaryTarget != PendingBinaryTarget.NONE &&
            type != "BEGIN_BINARY_TRANSFER" &&
            type != "SYNC_BACKUP_SNAPSHOT"
        ) {
            diagnosticBuffer.record(
                DiagnosticRingBuffer.LEVEL_WARN,
                "BINARY_FRAME_MISMATCH",
                "Cleared pending $pendingBinaryTarget before $type"
            )
            pendingBinaryTarget = PendingBinaryTarget.NONE
            fileAndExportBridge.clearPendingTransfer()
            nativeBackupVault.clearPendingSnapshot()
        }

        when (type) {
            "NATIVE_BACK_RESULT" -> {
                backNavigationBridge.handleNativeBackResult(requestId, payload)
            }

            "BEGIN_BINARY_TRANSFER" -> {
                nativeBackupVault.clearPendingSnapshot()
                val expectsBinaryFrame = fileAndExportBridge.beginBinaryTransfer(requestId, payload)
                pendingBinaryTarget = if (expectsBinaryFrame) {
                    PendingBinaryTarget.EXPORT
                } else {
                    PendingBinaryTarget.NONE
                }
            }

            "SYNC_BACKUP_SNAPSHOT" -> {
                fileAndExportBridge.clearPendingTransfer()
                val expectsBinaryFrame = nativeBackupVault.beginSnapshotSync(requestId, payload)
                pendingBinaryTarget = if (expectsBinaryFrame) {
                    PendingBinaryTarget.VAULT
                } else {
                    PendingBinaryTarget.NONE
                }
            }

            "REQUEST_PRINT" -> {
                printBridge.printCurrentPage()
            }

            "OPEN_EXTERNAL_URL" -> {
                externalNavigationBridge.handleBridgeRequest(payload)
            }

            "OPEN_DEV_PANEL" -> {
                openDeveloperPanel("bridge")
            }

            "GET_CONTAINER_INFO" -> {
                val pkgInfo = WebViewCompat.getCurrentWebViewPackage(this)
                val versionName = pkgInfo?.versionName ?: "unknown"
                val majorVersion = versionName.substringBefore('.').trim().toIntOrNull()
                val vaultInfo = nativeBackupVault.getVaultInfo()
                val appWebViewBytes = nativeBackupVault.getAppWebViewBytes()
                val resultPayload = JSONObject().apply {
                    put("platform", "android")
                    put("appVersion", BuildConfig.VERSION_NAME)
                    put("webViewPackage", pkgInfo?.packageName ?: "unknown")
                    put("webViewVersion", versionName)
                    if (majorVersion != null) {
                        put("webViewMajorVersion", majorVersion)
                        put("opfsSupportedInWebView", majorVersion >= 109)
                    }
                    put("origin", activeOrigin)
                    put("isDebugBuild", BuildConfig.DEBUG)
                    put("vaultSnapshotCount", vaultInfo.snapshotCount)
                    put("vaultTotalBytes", vaultInfo.totalBytes)
                    put("lastVaultBackupAt", vaultInfo.latestTimestampIso ?: JSONObject.NULL)
                    if (appWebViewBytes >= 0L) {
                        put("appWebViewBytes", appWebViewBytes)
                    }
                }
                val reply = JSONObject().apply {
                    put("type", "CONTAINER_INFO_RESULT")
                    put("requestId", requestId)
                    put("payload", resultPayload)
                }
                replyProxy.postMessage(reply.toString())
            }
        }
    }

    /**
     * Handles Chromium renderer process termination (`onRenderProcessGone`) without crashing the
     * Android app. Defers remount if the Activity is backgrounded, and stops after
     * [MAX_CONSECUTIVE_RENDER_CRASHES] crashes within [RENDER_CRASH_WINDOW_MS] to show a manual
     * recovery screen instead of looping.
     */
    private fun handleRendererProcessGone(crashedView: WebView, didCrash: Boolean) {
        if (webView === crashedView) {
            teardownWebView()
        } else {
            (crashedView.parent as? ViewGroup)?.removeView(crashedView)
            crashedView.destroy()
        }

        if (!isActivityResumed) {
            // Defer WebView recreation until user returns to foreground so LMKD doesn't kill a hidden renderer.
            pendingRendererRemount = true
            if (!didCrash) {
                consecutiveRenderCrashCount = 0
            }
            return
        }

        val now = SystemClock.elapsedRealtime()
        if (now - lastRenderCrashTimestampMs <= RENDER_CRASH_WINDOW_MS) {
            consecutiveRenderCrashCount += 1
        } else {
            consecutiveRenderCrashCount = 1
        }
        lastRenderCrashTimestampMs = now

        if (consecutiveRenderCrashCount > MAX_CONSECUTIVE_RENDER_CRASHES) {
            showRenderRecoveryFallback()
            return
        }

        mountWebView(null)
    }

    private fun showRenderRecoveryFallback() {
        rootContainer.removeAllViews()
        val fgColor = getColor(R.color.pedigree_launcher_fg)
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(getColor(R.color.pedigree_splash_bg))
            setPadding(64, 64, 64, 64)
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }
        val title = TextView(this).apply {
            text = getString(R.string.render_crash_title)
            textSize = 18f
            setTextColor(fgColor)
        }
        val body = TextView(this).apply {
            text = getString(R.string.render_crash_body)
            textSize = 14f
            setTextColor(fgColor)
            alpha = 0.85f
            setPadding(0, 16, 0, 32)
        }
        val retryBtn = Button(this).apply {
            text = getString(R.string.render_crash_retry)
            setOnClickListener {
                consecutiveRenderCrashCount = 0
                mountWebView(null)
            }
        }
        panel.addView(title)
        panel.addView(body)
        panel.addView(retryBtn)
        rootContainer.addView(panel)
    }

    private fun teardownWebView() {
        currentReplyProxy = null
        pendingBinaryTarget = PendingBinaryTarget.NONE
        pendingRendererRemount = false
        backNavigationBridge.resetPendingRequest()
        fileAndExportBridge.clearPendingTransfer()
        nativeBackupVault.clearPendingSnapshot()
        val wv = webView ?: return
        webView = null
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.removeWebMessageListener(wv, BRIDGE_OBJECT_NAME)
        }
        (wv.parent as? ViewGroup)?.removeView(wv)
        wv.stopLoading()
        wv.webChromeClient = null
        wv.webViewClient = WebViewClient()
        wv.destroy()
    }

    private fun handleDiagnosticsShortcutIntent(shortcutIntent: Intent?) {
        if (shortcutIntent?.action != ACTION_OPEN_DIAGNOSTICS) return
        rootContainer.post {
            if (!isFinishing && !isDestroyed) {
                openDeveloperPanel("shortcut")
            }
        }
    }

    private fun openDeveloperPanel(triggerSource: String) {
        if (isFinishing || isDestroyed) return
        val panel = developerPanelDialog ?: DeveloperPanelDialog(
            activity = this,
            diagnosticBuffer = diagnosticBuffer,
            nativeBackupVault = nativeBackupVault,
            webViewProvider = { webView },
            activeOriginProvider = { activeOrigin },
            activeStartUrlProvider = { activeStartUrl },
            onReloadApp = {
                val wv = webView
                if (wv != null) {
                    wv.reload()
                } else {
                    consecutiveRenderCrashCount = 0
                    mountWebView(null)
                }
            },
            onSoftCacheReset = {
                performSoftCacheReset()
            },
            onDebugTargetUrlChanged = { nextUrl ->
                updateDebugTargetUrl(nextUrl)
            }
        ).also { developerPanelDialog = it }
        panel.show(triggerSource)
    }

    private fun performSoftCacheReset() {
        val resetUrl = buildEmergencyResetUrl(activeStartUrl)
        diagnosticBuffer.record(
            DiagnosticRingBuffer.LEVEL_INFO,
            "SOFT_CACHE_RESET",
            "Clearing HTTP cache and reloading with ?emergency_reset=true"
        )
        val wv = webView
        if (wv != null) {
            // clearCache(false) clears RAM/HTTP cache only, preserving SQLite/IDB/OPFS & app_webview
            wv.clearCache(false)
            wv.loadUrl(resetUrl)
        } else {
            consecutiveRenderCrashCount = 0
            mountWebView(null, initialUrl = resetUrl)
        }
    }

    private fun buildEmergencyResetUrl(baseUrl: String): String {
        val uri = Uri.parse(baseUrl)
        if (uri.getQueryParameter("emergency_reset") == "true") {
            return baseUrl
        }
        return uri.buildUpon()
            .appendQueryParameter("emergency_reset", "true")
            .build()
            .toString()
    }

    private fun updateDebugTargetUrl(candidate: String?) {
        if (!BuildConfig.DEBUG) return
        val prefs = getSharedPreferences(DEBUG_PREFS_NAME, Context.MODE_PRIVATE)
        if (candidate.isNullOrBlank()) {
            prefs.edit().remove(KEY_DEBUG_TARGET_URL).apply()
            diagnosticBuffer.record(
                DiagnosticRingBuffer.LEVEL_INFO,
                "DEBUG_URL_RESET",
                "Switched back to bundled assets"
            )
        } else if (isAllowedDebugTargetUrl(candidate)) {
            prefs.edit().putString(KEY_DEBUG_TARGET_URL, candidate.trim()).apply()
            diagnosticBuffer.record(
                DiagnosticRingBuffer.LEVEL_INFO,
                "DEBUG_URL_SET",
                "Switched target to ${DiagnosticRingBuffer.sanitizeUrl(candidate)}"
            )
        } else {
            return
        }
        resolveTargetUrlAndOrigin()
        consecutiveRenderCrashCount = 0
        mountWebView(null)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView?.saveState(outState)
    }

    private fun JSONObject.optNonNullString(key: String): String {
        return if (isNull(key)) "" else optString(key, "")
    }

    private enum class PendingBinaryTarget {
        NONE,
        EXPORT,
        VAULT
    }

    /**
     * Lightweight wrapper around [rootContainer] that detects 5 taps within 2.5s inside the
     * top-right 80dp corner without consuming touches or adding invisible overlay views.
     */
    private class DevTriggerRootContainer(
        context: Context,
        private val onFiveTapTriggered: () -> Unit
    ) : FrameLayout(context) {
        private val cornerSizePx: Float = TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            DEV_CORNER_DP,
            resources.displayMetrics
        )
        private var tapCount = 0
        private var firstTapElapsedMs = 0L

        override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
            if (ev.actionMasked == MotionEvent.ACTION_DOWN && width > 0 && height > 0) {
                val inTopRightCorner =
                    ev.x >= (width - paddingRight - cornerSizePx) &&
                    ev.y <= (paddingTop + cornerSizePx)
                if (inTopRightCorner) {
                    val now = SystemClock.elapsedRealtime()
                    if (tapCount == 0 || now - firstTapElapsedMs > DEV_TAP_WINDOW_MS) {
                        tapCount = 1
                        firstTapElapsedMs = now
                    } else {
                        tapCount += 1
                    }
                    if (tapCount >= DEV_TAP_THRESHOLD) {
                        tapCount = 0
                        firstTapElapsedMs = 0L
                        onFiveTapTriggered()
                    }
                } else {
                    tapCount = 0
                    firstTapElapsedMs = 0L
                }
            }
            return super.onInterceptTouchEvent(ev)
        }
    }

    /**
     * Static/top-level [ServiceWorkerClientCompat] implementation so the process-wide
     * [ServiceWorkerControllerCompat] singleton never retains a reference to [MainActivity].
     */
    private class PedigreeServiceWorkerClient(
        private val loader: WebViewAssetLoader
    ) : ServiceWorkerClientCompat() {
        override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? {
            val url = request.url
            if (url.scheme?.lowercase(Locale.US) == "https" && url.host?.lowercase(Locale.US) == ASSET_HOST) {
                return loader.shouldInterceptRequest(url)
            }
            return null
        }
    }

    companion object {
        private const val ASSET_HOST = "appassets.androidplatform.net"
        private const val ASSET_ORIGIN = "https://$ASSET_HOST"
        private const val ASSET_START_URL = "$ASSET_ORIGIN/index.html"
        private const val DEBUG_PAGES_HOST = "askkim.github.io"
        private const val DEBUG_PAGES_PATH_PREFIX = "/Pedigree"
        private const val DEBUG_PREFS_NAME = "pedigree_wrapper_debug_prefs"
        private const val KEY_DEBUG_TARGET_URL = "debug_target_url"
        private const val BRIDGE_OBJECT_NAME = "pedigreeNative"
        private const val ACTION_OPEN_DIAGNOSTICS = "org.askkim.pedigree.wrapper.action.OPEN_DIAGNOSTICS"
        private const val DEV_CORNER_DP = 80f
        private const val DEV_TAP_WINDOW_MS = 2_500L
        private const val DEV_TAP_THRESHOLD = 5
        private const val RENDER_CRASH_WINDOW_MS = 15_000L
        private const val MAX_CONSECUTIVE_RENDER_CRASHES = 3
    }
}
```

## `android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/NativeBackupVault.kt`

```kotlin
/*
 * Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

package org.askkim.pedigree.wrapper

import android.content.Context
import android.util.Base64
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.file.Files
import java.security.MessageDigest
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicLong

/**
 * Mirrors `SYNC_BACKUP_SNAPSHOT` payloads into `filesDir/pedigree-vault/` on a single serial
 * background executor using 16 KiB streaming I/O, SHA-256 deduplication, atomic `.tmp` rename,
 * and 5-snapshot rotation.
 *
 * Why keep a native vault outside `app_webview/`?
 * Chromium WebView storage (`IndexedDB` / `OPFS`) lives inside `app_webview/` and can be
 * affected by WebView upgrades or browser quota eviction. Mirroring verified snapshots into
 * `Context.filesDir/pedigree-vault/` provides an independent safety net inside the app's private
 * sandbox without ever reading or modifying `app_webview/` beyond read-only size accounting.
 */
class NativeBackupVault(
    context: Context,
    private val diagnosticBuffer: DiagnosticRingBuffer
) {
    data class VaultState(
        val snapshotCount: Int,
        val totalBytes: Long,
        val latestTimestampIso: String?,
        val latestDigestHex: String?,
        val latestByteLength: Long
    )

    private data class PendingSnapshotHeader(
        val requestId: String,
        val snapshotId: String,
        val createdAtIso: String,
        val extension: String,
        val expectedByteLength: Long,
        val rejectOversized: Boolean
    )

    private class QueuedSnapshotWrite(
        val header: PendingSnapshotHeader,
        val bytes: ByteArray
    )

    private val appContext: Context = context.applicationContext
    private val ioExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val sequence = AtomicLong(0L)
    private val pendingWriteLock = Any()
    private var latestQueuedWrite: QueuedSnapshotWrite? = null
    private var drainScheduled = false

    private var pendingHeader: PendingSnapshotHeader? = null

    @Volatile
    private var destroyed = false

    @Volatile
    private var cachedState = VaultState(
        snapshotCount = 0,
        totalBytes = 0L,
        latestTimestampIso = null,
        latestDigestHex = null,
        latestByteLength = -1L
    )

    @Volatile
    private var cachedAppWebViewBytes: Long = -1L

    init {
        try {
            ioExecutor.execute {
                if (!destroyed) {
                    initializeVaultStateBlocking()
                    cachedAppWebViewBytes = measureAppWebViewBytesBlocking()
                }
            }
        } catch (_: RejectedExecutionException) {
            // Ignore during teardown
        }
    }

    /**
     * Parses `SYNC_BACKUP_SNAPSHOT` header metadata.
     * Returns `true` if a trailing `TYPE_ARRAY_BUFFER` frame is expected next.
     */
    fun beginSnapshotSync(requestId: String, payload: JSONObject?): Boolean {
        if (destroyed || payload == null) {
            pendingHeader = null
            return false
        }

        val rawId = if (payload.isNull("snapshotId")) "" else payload.optString("snapshotId", "")
        val snapshotId = sanitizeSnapshotId(rawId)
        val createdAtIso = if (payload.isNull("createdAt")) "" else payload.optString("createdAt", "").trim().take(64)
        val format = if (payload.isNull("format")) "bin" else payload.optString("format", "bin")
        val extension = sanitizeFormatExtension(format)
        val expectedByteLength = payload.optLong("byteLength", -1L)

        // Optional inline base64 fallback
        val inlineBase64 = if (payload.isNull("base64Data")) "" else payload.optString("base64Data", "")
        if (inlineBase64.isNotEmpty()) {
            pendingHeader = null
            val decoded = try {
                Base64.decode(inlineBase64, Base64.DEFAULT)
            } catch (_: IllegalArgumentException) {
                diagnosticBuffer.record(
                    DiagnosticRingBuffer.LEVEL_WARN,
                    "VAULT_BASE64_INVALID",
                    "Ignored invalid base64 snapshot $snapshotId"
                )
                return false
            }
            val header = PendingSnapshotHeader(
                requestId = requestId,
                snapshotId = snapshotId,
                createdAtIso = createdAtIso,
                extension = extension,
                expectedByteLength = expectedByteLength,
                rejectOversized = expectedByteLength > MAX_SNAPSHOT_BYTES
            )
            enqueueSnapshotBytes(header, decoded)
            return false
        }

        pendingHeader = PendingSnapshotHeader(
            requestId = requestId,
            snapshotId = snapshotId,
            createdAtIso = createdAtIso,
            extension = extension,
            expectedByteLength = expectedByteLength,
            rejectOversized = expectedByteLength > MAX_SNAPSHOT_BYTES
        )
        return true
    }

    /** Cancels any staged header awaiting a trailing binary frame. */
    fun clearPendingSnapshot() {
        pendingHeader = null
    }

    /** Receives the trailing `TYPE_ARRAY_BUFFER` frame paired with [pendingHeader] and queues it for disk write. */
    fun handleIncomingSnapshotBytes(bytes: ByteArray) {
        val header = pendingHeader
        pendingHeader = null
        if (destroyed || header == null) return

        enqueueSnapshotBytes(header, bytes)
    }

    /** Returns the latest cached vault summary in O(1) without blocking the UI or bridge thread. */
    fun getVaultInfo(): VaultState = cachedState

    /** Returns the most recently measured `app_webview` directory size in bytes (`-1` if not yet measured). */
    fun getAppWebViewBytes(): Long = cachedAppWebViewBytes

    /** Returns the absolute path to `filesDir/pedigree-vault/`. */
    fun getVaultDirectoryPath(): String = File(appContext.filesDir, VAULT_DIR_NAME).absolutePath

    /** Re-scans `pedigree-vault/` and measures `app_webview/` read-only on the background executor. */
    fun refreshStorageMetricsAsync(onComplete: (VaultState, Long) -> Unit) {
        if (destroyed || ioExecutor.isShutdown) return
        try {
            ioExecutor.execute {
                if (destroyed) return@execute
                val vaultState = scanVaultDirectoryBlocking(computeLatestDigest = false)
                cachedState = vaultState
                val webViewBytes = measureAppWebViewBytesBlocking()
                cachedAppWebViewBytes = webViewBytes
                if (!destroyed) {
                    onComplete(vaultState, webViewBytes)
                }
            }
        } catch (_: RejectedExecutionException) {
            // Shutting down
        }
    }

    /** Clears pending writes and shuts down the background I/O executor on Activity destroy. */
    fun destroy() {
        destroyed = true
        pendingHeader = null
        synchronized(pendingWriteLock) {
            latestQueuedWrite = null
            drainScheduled = false
        }
        ioExecutor.shutdown()
    }

    private fun enqueueSnapshotBytes(header: PendingSnapshotHeader, bytes: ByteArray) {
        if (header.rejectOversized || bytes.size.toLong() > MAX_SNAPSHOT_BYTES) {
            val reportedSize = maxOf(header.expectedByteLength, bytes.size.toLong())
            diagnosticBuffer.record(
                DiagnosticRingBuffer.LEVEL_WARN,
                "VAULT_SNAPSHOT_TOO_LARGE",
                "Dropped snapshot ${header.snapshotId} ($reportedSize B > 16 MiB cap)"
            )
            return
        }

        if (bytes.isEmpty()) {
            diagnosticBuffer.record(
                DiagnosticRingBuffer.LEVEL_WARN,
                "VAULT_SNAPSHOT_EMPTY",
                "Ignored empty snapshot ${header.snapshotId}"
            )
            return
        }

        if (header.expectedByteLength >= 0L && bytes.size.toLong() != header.expectedByteLength) {
            diagnosticBuffer.record(
                DiagnosticRingBuffer.LEVEL_WARN,
                "VAULT_LENGTH_MISMATCH",
                "Snapshot ${header.snapshotId} expected ${header.expectedByteLength} B, got ${bytes.size} B"
            )
            return
        }

        if (destroyed || ioExecutor.isShutdown) return

        // Conflate rapid sync bursts to a single pending slot so queued snapshot RAM stays <= 16 MiB.
        val shouldScheduleDrain = synchronized(pendingWriteLock) {
            latestQueuedWrite = QueuedSnapshotWrite(header, bytes)
            val shouldStart = !drainScheduled
            if (shouldStart) {
                drainScheduled = true
            }
            shouldStart
        }

        if (!shouldScheduleDrain) return

        try {
            ioExecutor.execute {
                drainPendingWritesBlocking()
            }
        } catch (_: RejectedExecutionException) {
            synchronized(pendingWriteLock) {
                latestQueuedWrite = null
                drainScheduled = false
            }
        }
    }

    private fun drainPendingWritesBlocking() {
        while (!destroyed) {
            val nextWrite = synchronized(pendingWriteLock) {
                val queued = latestQueuedWrite
                latestQueuedWrite = null
                if (queued == null) {
                    drainScheduled = false
                }
                queued
            } ?: return
            persistSnapshotBlocking(nextWrite.header, nextWrite.bytes)
        }
        synchronized(pendingWriteLock) {
            latestQueuedWrite = null
            drainScheduled = false
        }
    }

    private fun initializeVaultStateBlocking() {
        val vaultDir = File(appContext.filesDir, VAULT_DIR_NAME)
        if (vaultDir.exists()) {
            vaultDir.listFiles()?.forEach { file ->
                if (file.isFile && file.name.endsWith(TMP_SUFFIX)) {
                    file.delete()
                }
            }
        }
        cachedState = scanVaultDirectoryBlocking(computeLatestDigest = true)
    }

    /**
     * Streams one snapshot to `.tmp`, deduplicates by SHA-256 + byte length against the latest
     * stored snapshot (skipping redundant flash writes), atomically renames on change, and rotates
     * to keep at most [MAX_RETAINED_SNAPSHOTS] (5) files.
     */
    private fun persistSnapshotBlocking(header: PendingSnapshotHeader, bytes: ByteArray) {
        val vaultDir = File(appContext.filesDir, VAULT_DIR_NAME)
        if (!vaultDir.exists() && !vaultDir.mkdirs()) {
            diagnosticBuffer.record(
                DiagnosticRingBuffer.LEVEL_ERROR,
                "VAULT_MKDIR_FAILED",
                "Could not create native backup vault directory"
            )
            return
        }

        val current = cachedState
        if (current.latestDigestHex != null && current.latestByteLength == bytes.size.toLong()) {
            val preDigestHex = computeBytesSha256InChunks(bytes)
            if (preDigestHex == current.latestDigestHex) {
                diagnosticBuffer.record(
                    DiagnosticRingBuffer.LEVEL_INFO,
                    "VAULT_SYNC_DEDUP",
                    "Skipped unchanged snapshot ${header.snapshotId} (${bytes.size} B)"
                )
                return
            }
        }

        val nowMs = System.currentTimeMillis()
        val seq = sequence.incrementAndGet() % 10000L
        val prefix = String.format(Locale.US, "%013d_%04d_%s", nowMs, seq, header.snapshotId)
        val tmpFile = File(vaultDir, "$prefix$TMP_SUFFIX")

        val digestHex = try {
            val digest = MessageDigest.getInstance("SHA-256")
            BufferedOutputStream(FileOutputStream(tmpFile, false), STREAM_BUFFER_BYTES).use { out ->
                var offset = 0
                while (offset < bytes.size) {
                    val chunkLen = minOf(STREAM_BUFFER_BYTES, bytes.size - offset)
                    out.write(bytes, offset, chunkLen)
                    digest.update(bytes, offset, chunkLen)
                    offset += chunkLen
                }
                out.flush()
            }
            digest.digest().toHexStringLower()
        } catch (err: Exception) {
            tmpFile.delete()
            diagnosticBuffer.record(
                DiagnosticRingBuffer.LEVEL_ERROR,
                "VAULT_WRITE_FAILED",
                "Failed writing vault temp file: ${err.message ?: err.javaClass.simpleName}"
            )
            return
        }

        val finalFile = File(vaultDir, "$prefix.${header.extension}")
        if (!tmpFile.renameTo(finalFile)) {
            tmpFile.delete()
            diagnosticBuffer.record(
                DiagnosticRingBuffer.LEVEL_ERROR,
                "VAULT_COMMIT_FAILED",
                "Atomic rename failed for ${finalFile.name}"
            )
            return
        }

        val retained = rotateSnapshotsBlocking(vaultDir)
        val totalBytes = retained.sumOf { it.length() }
        val latestTimestampIso = header.createdAtIso.ifEmpty {
            DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(nowMs))
        }
        cachedState = VaultState(
            snapshotCount = retained.size,
            totalBytes = totalBytes,
            latestTimestampIso = latestTimestampIso,
            latestDigestHex = digestHex,
            latestByteLength = bytes.size.toLong()
        )
        diagnosticBuffer.record(
            DiagnosticRingBuffer.LEVEL_INFO,
            "VAULT_SYNC_SAVED",
            "Mirrored ${finalFile.name} (${bytes.size} B; ${retained.size}/$MAX_RETAINED_SNAPSHOTS kept)"
        )
    }

    private fun rotateSnapshotsBlocking(vaultDir: File): List<File> {
        val files = vaultDir.listFiles()
            ?.filter { it.isFile && !it.name.endsWith(TMP_SUFFIX) }
            ?.sortedByDescending { it.name }
            ?: emptyList()

        if (files.size > MAX_RETAINED_SNAPSHOTS) {
            for (i in MAX_RETAINED_SNAPSHOTS until files.size) {
                files[i].delete()
            }
            return files.take(MAX_RETAINED_SNAPSHOTS)
        }
        return files
    }

    private fun scanVaultDirectoryBlocking(computeLatestDigest: Boolean): VaultState {
        val vaultDir = File(appContext.filesDir, VAULT_DIR_NAME)
        if (!vaultDir.exists()) {
            return VaultState(0, 0L, null, null, -1L)
        }

        val retained = rotateSnapshotsBlocking(vaultDir)
        if (retained.isEmpty()) {
            return VaultState(0, 0L, null, null, -1L)
        }

        val newest = retained.first()
        val totalBytes = retained.sumOf { it.length() }
        val newestTimestampMs = parseTimestampPrefixMs(newest.name) ?: newest.lastModified()
        val latestIso = if (newestTimestampMs > 0L) {
            DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(newestTimestampMs))
        } else {
            null
        }

        val existing = cachedState
        val digestHex = if (computeLatestDigest) {
            computeFileSha256Blocking(newest)
        } else {
            existing.latestDigestHex
        }
        val latestByteLen = if (computeLatestDigest) {
            newest.length()
        } else if (existing.latestByteLength >= 0L) {
            existing.latestByteLength
        } else {
            newest.length()
        }

        val resolvedTimestampIso = if (
            existing.latestDigestHex != null &&
            existing.latestDigestHex == digestHex &&
            existing.latestTimestampIso != null
        ) {
            existing.latestTimestampIso
        } else {
            latestIso ?: existing.latestTimestampIso
        }

        return VaultState(
            snapshotCount = retained.size,
            totalBytes = totalBytes,
            latestTimestampIso = resolvedTimestampIso,
            latestDigestHex = digestHex,
            latestByteLength = latestByteLen
        )
    }

    private fun computeFileSha256Blocking(file: File): String? {
        return try {
            val digest = MessageDigest.getInstance("SHA-256")
            val buffer = ByteArray(STREAM_BUFFER_BYTES)
            BufferedInputStream(FileInputStream(file), STREAM_BUFFER_BYTES).use { input ->
                while (true) {
                    val read = input.read(buffer)
                    if (read <= 0) break
                    digest.update(buffer, 0, read)
                }
            }
            digest.digest().toHexStringLower()
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Walks `dataDir/app_webview` strictly read-only (skipping symlinks) to report WebView
     * disk consumption in the Storage Truth Card. Never opens, modifies, or deletes WebView files.
     */
    private fun measureAppWebViewBytesBlocking(): Long {
        val appWebViewDir = File(appContext.dataDir, APP_WEBVIEW_DIR_NAME)
        if (!appWebViewDir.exists()) return 0L
        return computeDirectoryBytesReadOnly(appWebViewDir)
    }

    private fun computeDirectoryBytesReadOnly(root: File): Long {
        var total = 0L
        val stack = ArrayList<File>()
        stack.add(root)
        while (stack.isNotEmpty()) {
            val current = stack.removeAt(stack.lastIndex)
            val path = try {
                current.toPath()
            } catch (_: Exception) {
                continue
            }
            if (Files.isSymbolicLink(path)) continue
            if (current.isFile) {
                total += current.length()
            } else if (current.isDirectory) {
                val children = current.listFiles() ?: continue
                for (child in children) {
                    stack.add(child)
                }
            }
        }
        return total
    }

    private fun parseTimestampPrefixMs(filename: String): Long? {
        val prefix = filename.substringBefore('_')
        return prefix.toLongOrNull()
    }

    private fun computeBytesSha256InChunks(bytes: ByteArray): String? {
        return try {
            val digest = MessageDigest.getInstance("SHA-256")
            var offset = 0
            while (offset < bytes.size) {
                val chunkLen = minOf(STREAM_BUFFER_BYTES, bytes.size - offset)
                digest.update(bytes, offset, chunkLen)
                offset += chunkLen
            }
            digest.digest().toHexStringLower()
        } catch (_: Exception) {
            null
        }
    }

    private fun sanitizeSnapshotId(raw: String): String {
        val cleaned = raw.trim().replace(UNSAFE_ID_REGEX, "_")
        if (cleaned.isEmpty()) return "snap"
        return cleaned.take(48)
    }

    private fun sanitizeFormatExtension(rawFormat: String): String {
        return when (rawFormat.trim().lowercase(Locale.US)) {
            "json" -> "json"
            "sqlite" -> "sqlite"
            "zip" -> "zip"
            else -> "bin"
        }
    }

    private fun ByteArray.toHexStringLower(): String {
        val chars = CharArray(size * 2)
        val hex = "0123456789abcdef"
        for (i in indices) {
            val v = this[i].toInt() and 0xFF
            chars[i * 2] = hex[v ushr 4]
            chars[i * 2 + 1] = hex[v and 0x0F]
        }
        return String(chars)
    }

    companion object {
        const val VAULT_DIR_NAME = "pedigree-vault"
        private const val APP_WEBVIEW_DIR_NAME = "app_webview"
        private const val TMP_SUFFIX = ".tmp"
        private const val MAX_RETAINED_SNAPSHOTS = 5
        private const val STREAM_BUFFER_BYTES = 16 * 1024
        const val MAX_SNAPSHOT_BYTES = 16L * 1024L * 1024L
        private val UNSAFE_ID_REGEX = Regex("[^A-Za-z0-9_-]")
    }
}
```

## `android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/PedigreeAssetPathHandler.kt`

```kotlin
/*
 * Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

package org.askkim.pedigree.wrapper

import android.content.Context
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.IOException
import java.net.URLConnection
import java.util.Locale

/**
 * Serves bundled Vite `dist/` files from `assets/www/` under `https://appassets.androidplatform.net/`
 * with explicit MIME types required for Android 8+ WebViews (`.wasm`, `.js`, `.mjs`, `.webmanifest`).
 *
 * Why `WebViewAssetLoader` instead of `file://`?
 * Loading a modern ES-module SPA from `file:///android_asset/` triggers strict `null`-origin
 * CORS errors on `<script type="module">`, `fetch()`, Service Workers, and IndexedDB/OPFS.
 * `WebViewAssetLoader` maps a virtual HTTPS origin (`appassets.androidplatform.net`) directly to
 * APK assets completely offline without making any real network request.
 */
class PedigreeAssetPathHandler(context: Context) : WebViewAssetLoader.PathHandler {

    private val appContext = context.applicationContext

    /**
     * Resolves an incoming virtual HTTPS path (e.g. `""`, `"assets/index-abc.js"`, or a
     * client-side SPA route like `"herd"`) to a [WebResourceResponse] backed by APK assets.
     *
     * Returns `null` for traversal attempts or missing asset files so WebView returns a 404.
     */
    override fun handle(path: String): WebResourceResponse? {
        val sanitized = sanitizeRelativePath(path) ?: return null
        val targetPath = if (sanitized.isEmpty() || sanitized.endsWith("/")) {
            "${sanitized}index.html"
        } else {
            sanitized
        }

        val (resolvedPath, stream) = openAssetWithSpaFallback(targetPath) ?: return null
        val mimeInfo = resolveMimeType(resolvedPath)
        val headers = HashMap<String, String>(2)
        headers["X-Content-Type-Options"] = "nosniff"
        // Keep entry HTML, version probe, and Service Worker scripts uncached so APK updates
        // take effect immediately; hashed Vite bundle assets under `assets/` are immutable.
        if (
            resolvedPath == "index.html" ||
            resolvedPath == "version.json" ||
            resolvedPath.endsWith("sw.js") ||
            resolvedPath.endsWith("service-worker.js")
        ) {
            headers["Cache-Control"] = "no-cache"
        } else if (resolvedPath.startsWith("assets/")) {
            headers["Cache-Control"] = "public, max-age=31536000, immutable"
        }

        return WebResourceResponse(
            mimeInfo.mimeType,
            mimeInfo.encoding,
            200,
            "OK",
            headers,
            stream
        )
    }

    /**
     * Opens `assets/www/<candidate>`. If missing and the path has no file extension (indicating a
     * client-side SPA route rather than a missing `.js`/`.png`/`.wasm` file), falls back to
     * `assets/www/index.html`.
     */
    private fun openAssetWithSpaFallback(candidate: String): Pair<String, java.io.InputStream>? {
        try {
            return candidate to appContext.assets.open("www/$candidate")
        } catch (_: IOException) {
            // SPA client-side route fallback only when the path has no file extension
            val lastSegment = candidate.substringAfterLast('/')
            if (!lastSegment.contains('.')) {
                return try {
                    "index.html" to appContext.assets.open("www/index.html")
                } catch (_: IOException) {
                    null
                }
            }
            return null
        }
    }

    /**
     * Strips query/hash suffixes and rejects backslashes, null bytes, and `.` / `..` segments
     * to prevent directory-traversal reads outside `assets/www/`.
     */
    private fun sanitizeRelativePath(rawPath: String): String? {
        val withoutQuery = rawPath.substringBefore('?').substringBefore('#')
        if (withoutQuery.contains('\\') || withoutQuery.contains('\u0000')) {
            return null
        }
        var trimmed = withoutQuery.trimStart('/')
        if (trimmed.isEmpty()) {
            return ""
        }
        while (trimmed.contains("//")) {
            trimmed = trimmed.replace("//", "/")
        }
        val segments = trimmed.split('/')
        for (segment in segments) {
            if (segment == ".." || segment == ".") {
                return null
            }
        }
        return trimmed
    }

    private data class MimeInfo(val mimeType: String, val encoding: String?)

    /**
     * Maps file extensions explicitly because Android 8–10 `URLConnection.guessContentTypeFromName`
     * frequently returns `null` or `application/octet-stream` for `.mjs`, `.wasm`, and `.webmanifest`,
     * which causes Chromium WebView to refuse executing ES modules or WebAssembly.
     */
    private fun resolveMimeType(path: String): MimeInfo {
        val ext = path.substringAfterLast('.', "").lowercase(Locale.US)
        return when (ext) {
            "html", "htm" -> MimeInfo("text/html", "UTF-8")
            "js", "mjs" -> MimeInfo("application/javascript", "UTF-8")
            "css" -> MimeInfo("text/css", "UTF-8")
            "wasm" -> MimeInfo("application/wasm", null)
            "json", "webmanifest", "map" -> MimeInfo("application/json", "UTF-8")
            "svg" -> MimeInfo("image/svg+xml", "UTF-8")
            "png" -> MimeInfo("image/png", null)
            "jpg", "jpeg" -> MimeInfo("image/jpeg", null)
            "webp" -> MimeInfo("image/webp", null)
            "avif" -> MimeInfo("image/avif", null)
            "gif" -> MimeInfo("image/gif", null)
            "ico" -> MimeInfo("image/x-icon", null)
            "woff2" -> MimeInfo("font/woff2", null)
            "woff" -> MimeInfo("font/woff", null)
            "ttf" -> MimeInfo("font/ttf", null)
            "otf" -> MimeInfo("font/otf", null)
            "pdf" -> MimeInfo("application/pdf", null)
            "ogg", "opus" -> MimeInfo("audio/ogg", null)
            "mp3" -> MimeInfo("audio/mpeg", null)
            "mp4" -> MimeInfo("video/mp4", null)
            "webm" -> MimeInfo("video/webm", null)
            "txt", "md", "csv", "tsv", "ics" -> MimeInfo("text/plain", "UTF-8")
            "sqlite", "db", "zip" -> MimeInfo("application/octet-stream", null)
            else -> {
                val guessed = URLConnection.guessContentTypeFromName(path)
                val mime = if (guessed.isNullOrBlank()) "application/octet-stream" else guessed
                val encoding = if (mime.startsWith("text/")) "UTF-8" else null
                MimeInfo(mime, encoding)
            }
        }
    }
}
```

## `android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/PrintBridge.kt`

```kotlin
/*
 * Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

package org.askkim.pedigree.wrapper

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

/**
 * Handles `REQUEST_PRINT` messages from `pedigreeBridge` using Android's [PrintManager]
 * and `webView.createPrintDocumentAdapter("Pedigree")`.
 *
 * Why is this bridge needed?
 * Inside Android `WebView`, calling JavaScript `window.print()` directly is a silent no-op.
 * Bridging `REQUEST_PRINT` to Android's native [PrintManager] lets users print pedigree
 * certificates, cage cards, and Barn Binders or export them via Android's built-in "Save as PDF".
 */
class PrintBridge(
    private val activity: AppCompatActivity,
    private val webViewProvider: () -> WebView?
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var destroyed = false

    /**
     * Opens the Android system print/PDF preview for the currently loaded WebView page.
     * Safe to invoke from any thread; marshals automatically onto the Android main thread because
     * `WebView.createPrintDocumentAdapter` must be called on the UI thread.
     */
    fun printCurrentPage() {
        val runPrint = Runnable {
            if (destroyed || activity.isFinishing || activity.isDestroyed) return@Runnable
            val wv = webViewProvider() ?: return@Runnable
            val printManager = activity.getSystemService(Context.PRINT_SERVICE) as? PrintManager
            if (printManager == null) {
                Toast.makeText(activity, R.string.print_unavailable, Toast.LENGTH_SHORT).show()
                return@Runnable
            }

            try {
                val adapter = wv.createPrintDocumentAdapter(PRINT_DOCUMENT_NAME)
                val attributes = PrintAttributes.Builder().build()
                printManager.print(PRINT_DOCUMENT_NAME, adapter, attributes)
            } catch (_: Exception) {
                Toast.makeText(activity, R.string.print_unavailable, Toast.LENGTH_SHORT).show()
            }
        }

        if (Looper.myLooper() == Looper.getMainLooper()) {
            runPrint.run()
        } else {
            mainHandler.post(runPrint)
        }
    }

    /** Cancels pending main-thread print callbacks when the hosting Activity is destroyed. */
    fun destroy() {
        destroyed = true
        mainHandler.removeCallbacksAndMessages(null)
    }

    companion object {
        private const val PRINT_DOCUMENT_NAME = "Pedigree"
    }
}
```

## `android-wrapper/app/src/main/res/drawable/ic_launcher_foreground.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="@color/pedigree_launcher_fg"
        android:pathData="M54,28c-3.87,0 -7,3.13 -7,7c0,2.76 1.6,5.15 3.92,6.29v10.22l-13.9,13.9c-0.78,-0.26 -1.62,-0.41 -2.49,-0.41c-4.42,0 -8,3.58 -8,8s3.58,8 8,8s8,-3.58 8,-8c0,-0.87 -0.15,-1.71 -0.41,-2.49L54,58.63l11.88,11.88c-0.26,0.78 -0.41,1.62 -0.41,2.49c0,4.42 3.58,8 8,8s8,-3.58 8,-8s-3.58,-8 -8,-8c-0.87,0 -1.71,0.15 -2.49,0.41l-13.9,-13.9V41.29C59.4,40.15 61,37.76 61,35C61,31.13 57.87,28 54,28z" />
</vector>
```

## `android-wrapper/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/pedigree_launcher_bg" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
```

## `android-wrapper/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/pedigree_launcher_bg" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
```

## `android-wrapper/app/src/main/res/values/colors.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="pedigree_splash_bg">#1B231E</color>
    <color name="pedigree_launcher_bg">#2D4A3E</color>
    <color name="pedigree_launcher_fg">#F4F1EA</color>
</resources>
```

## `android-wrapper/app/src/main/res/values/strings.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Pedigree</string>
    <string name="render_crash_title">WebView Renderer Interrupted</string>
    <string name="render_crash_body">The offline page renderer stopped unexpectedly. Your local barn data remains safely stored.</string>
    <string name="render_crash_retry">Reload App</string>
    <string name="press_back_again_to_exit">Press Back again to exit</string>
    <string name="export_saved">Saved %1$s</string>
    <string name="export_save_failed">Could not save file</string>
    <string name="export_share_unavailable">No app available to share this file</string>
    <string name="file_picker_unavailable">No file picker available on this device</string>
    <string name="print_unavailable">Printing is unavailable on this device</string>
    <string name="external_link_unavailable">No app available to open this link</string>
    <string name="shortcut_diagnostics_short">Diagnostics</string>
    <string name="shortcut_diagnostics_long">Open Diagnostics &amp; Vault</string>
    <string name="dev_panel_title">Developer &amp; Diagnostics Panel</string>
    <string name="dev_panel_copied">Diagnostic JSON copied to clipboard</string>
    <string name="dev_panel_copy_failed">Clipboard unavailable</string>
    <string name="dev_panel_debug_url_invalid">Debug URL must use https://askkim.github.io/Pedigree/</string>
</resources>
```

## `android-wrapper/app/src/main/res/values/themes.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.PedigreeWrapper" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:windowBackground">@color/pedigree_splash_bg</item>
    </style>
</resources>
```

## `android-wrapper/app/src/main/res/xml/data_extraction_rules.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="root" />
        <exclude domain="database" />
        <exclude domain="sharedpref" />
    </cloud-backup>
    <device-transfer>
        <exclude domain="root" />
        <exclude domain="database" />
        <exclude domain="sharedpref" />
    </device-transfer>
</data-extraction-rules>
```

## `android-wrapper/app/src/main/res/xml/file_paths.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<paths>
    <cache-path
        name="shared_exports"
        path="exports/" />
</paths>
```

## `android-wrapper/app/src/main/res/xml/shortcuts.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
    <shortcut
        android:shortcutId="open_diagnostics"
        android:enabled="true"
        android:icon="@mipmap/ic_launcher"
        android:shortcutShortLabel="@string/shortcut_diagnostics_short"
        android:shortcutLongLabel="@string/shortcut_diagnostics_long">
        <intent
            android:action="org.askkim.pedigree.wrapper.action.OPEN_DIAGNOSTICS"
            android:targetPackage="org.askkim.pedigree.wrapper"
            android:targetClass="org.askkim.pedigree.wrapper.MainActivity" />
    </shortcut>
</shortcuts>
```

## `android-wrapper/gradle/wrapper/gradle-wrapper.properties`

```properties
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-8.13-bin.zip
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
```

## `docs/plans/active-backlog-plan.md`

```markdown
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
```

## `docs/plans/harden-canvas-photo-ios-exports.md`

```markdown
# Implementation Plan: Harden Canvas Dimensions, Photo Cleanup & iOS Standalone PWA Exports

**Status:** Complete  
**Created:** 2026-11-21

## Hard Exclusions (Must Preserve)
- NO server-side storage of user information.
- NO community sales board or marketplace features.
- NO new encryption features (`encryptedExport.ts` / `passphraseCrypto.ts` untouched).
- NO PDF layout redesign (`barnBinder.ts` / PDF layout geometry untouched).
- Strict TypeScript (`tsc --noEmit`, zero `as any` / `@ts-ignore` / `@ts-expect-error`).
- Keep `src/core/` 100% pure TypeScript with zero DOM/`window` dependencies.

## Progress Checklist
- [x] Step 1: Inspect `webImageOptimizer.ts`, `photoHydration.ts`, `imageOptimizationSpec.ts`, `AnimalPhotoGallery.tsx`, `webFileActions.ts`, `PrintPreviewModal.tsx`, and related canvas/share callers.
- [x] Step 2: Add pure canvas area ceiling (`<= 16,000,000` px / `<= 3,000,000` px constrained) and DPR cap (`Math.min(2, dpr)` / `1` constrained) helpers in `src/core/imageOptimizationSpec.ts`.
- [x] Step 3: Harden `src/storage/webImageOptimizer.ts` (and canvas callers `webPdfActions.ts`, `deviceCapabilityDetector.ts`, `feedTagOcr.ts`, `pedigreeOcrScanner.ts`) with `probeOffscreenCanvas2dSupport()` (`typeof OffscreenCanvas !== 'undefined'` + `new OffscreenCanvas(1, 1).getContext('2d')`) + main-thread fallback, `releaseCanvas` in `finally` blocks (`width = 1; height = 1; clearRect(0, 0, 1, 1); width = 0; height = 0`), area ceiling enforcement, and sequential photo compression.
- [x] Step 4: Harden `src/storage/photoHydration.ts` and `src/components/AnimalPhotoGallery.tsx` with sequential photo hydration, `blob:` URL revocation on replacement/trim/delete/animal-switch/unmount, and visible error handling instead of unhandled rejections or silent catches.
- [x] Step 5: Harden `src/utils/webFileActions.ts`, `src/storage/localSyncChannels.ts`, `src/components/PrintPreviewModal.tsx`, and callers for iOS/standalone PWA exports (`navigator.canShare({ files: [file] })` + `navigator.share({ files: [file] })` without `title`/`text`/`url`, clean `AbortError` handling, safe delay before `blob:` URL revocation on anchor fallback, and visible error surfacing).
- [x] Step 6: Add/update unit tests and run `npm test` and `npm run lint`.

## Verification Results
- `npm run lint` (`tsc --noEmit`): 0 errors.
- `npm test`: 64/65 files passed, 406/407 tests passed (including all `imageOptimizationSpec.test.ts`, `photoHydrationAndWorker.test.ts`, `printPreviewFileActions.test.ts`, `deviceCapability.test.ts`); 1 pre-existing unrelated failure in `src/core/__tests__/p2pSyncProtocol.test.ts`.

```

## `docs/plans/reduce-eager-heap-weight.md`

```markdown
# Implementation Plan: Audit & Reduce Eager/Resident JS Heap Weight (2,000+ Animals)

**Status:** In Progress  
**Created:** 2026-11-21

## Hard Exclusions (Must Preserve)
- NO server-side storage of user information.
- NO community sales board or marketplace features.
- NO new encryption features (`src/core/encryptedExport.ts` / `src/storage/passphraseCrypto.ts` untouched).
- NO PDF layout redesign (`src/core/barnBinder.ts` / `src/core/pdfExporter.ts` / `src/components/PrintPreviewModal.tsx` layout untouched).
- Strict TypeScript (`tsc --noEmit`, zero `as any` / `@ts-ignore` / `@ts-expect-error`).
- Keep `src/core/` 100% pure TypeScript with zero DOM/`window` dependencies.
- Keep `IMPROVEMENTS.md` and `src/core/improvementRegistry.ts` invariants intact.

## Baseline Audit Findings
1. **Initial Entry Chunk Bloat (`dist/assets/index-*.js` = 1,594.03 kB / 447.32 kB gzip):**
   - `src/hooks/useBarnStore.ts` statically imports `offThreadWorkerClient.ts`, which statically imports `backupArchive.ts` (`fflate`), `archiveInspector.ts`, `supportBundle.ts`, and `importers/registry.ts` (all CSV/Evans/PDF importers) even though those are only needed for Worker fallbacks on Import/Export/Diagnostics routes.
   - `src/hooks/useBarnStore.ts` statically imports `googleCalendarClient.ts`, which statically imports `firebase/app` + `firebase/auth` and runs `initGoogleCalendarAuth()` on boot even though `cachedAccessToken` starts `null` and Google Calendar sync is opt-in.
   - `src/App.tsx` statically imports `WipedStorageRecoveryModal` even when `wipedRecoveryContext?.detected` is false.
   - `src/components/HerdScreen.tsx` (138.20 kB chunk) statically imports `AnimalEditorModal` (~101 kB), `PrintPreviewModal` (~92 kB), `SpeciesMigrationModal`, and `ArchivedHerdsModal`, pulling all heavy editor/print UI into the Herd list view immediately.
2. **Eager/Resident Heap & Per-Render Work (`useBarnStore.ts`, `webSqliteAdapter.ts`, `HerdScreen.tsx`):**
   - `useBarnStore.ts` `coiByAnimalId` eagerly runs `createSpeciesCoiEvaluator` across all `animals` (2,000+ active + archived) on `'herd' | 'pedigree' | 'breeding'` routes even though `BreedingScreen` never reads `coiByAnimalId`, `PedigreeScreen` only needs the selected `subject`, and `HerdScreen` only renders the virtualized `visibleAnimals` slice + `activeAnimal`.
   - `useBarnStore.ts` `baseSpeciesData` & `conflictsBySpeciesAnimalId` eagerly filter/sort all 15 species collections and run `analyzeBarnAnimalConflicts` even when on non-species routes (`home`, `settings`, `importExport`, `techyStuff`, `prompts`, `suggestions`).
   - `useBarnStore.ts` `pedigreeAncestorCacheRef` and `loadedPedigreeArchiveKeysRef` are not cleared on `selectSpeciesWorkspace` or `onHidden` background freeze.
   - `useBarnStore.ts` `nextEntityRev` linearly scans `syncOperationsRef.current` on every write instead of using an O(1) `maxRevByEntityRef` index.
   - `webSqliteAdapter.ts` `loadSnapshotUnlocked({ lightweightPhotos: true })` strips `animal_photos.data_url`, but still loads `feed_batches.tag_photo_data_url` and `ledger_entries.receipt_photo_data_url` full-res data URLs into reactive `snapshot` memory (when `lightweightPhotos: true` only needs thumbnails until viewed/exported).
   - `HerdScreen.tsx` `carrierAnalysisById` eagerly runs `analyzeAnimalCarrierLineage(a, herdById)` for all 2,000+ animals even when `carrierFilterMode === 'all'` and `carrierTraitQuery` is empty; when no carrier filter is active, only `visibleAnimals` + `activeAnimal` need lineage analysis.
   - `HerdScreen.tsx` `herdVirtual` uses `overscan: 8` and `initialFallbackCount: HERD_PAGE_SIZE` (50) regardless of Low-Memory / constrained device tier; constrained/Low-Memory devices can use leaner `overscan` (3) and `initialFallbackCount` (20) while keeping `HERD_PAGE_SIZE = 50` exported for invariants.
3. **Unbounded Dropdown DOM Nodes (`SearchableParentPicker.tsx`):**
   - Renders all `selectableOptions` into the DOM at once (2,000+ `<button role="option">` items per Sire/Dam picker when "Include Archived" is checked).
   - Allocates `[c.name, c.tattoo, ...].join(' ').toLowerCase()` per candidate per keystroke and keeps an unbounded `optionRefs` array.
   - Needs `useVirtualWindow` virtualization on the listbox, keyboard `activeIndex` scroll sync, allocation-free filtering, and bounded `Map` refs.

## Progress Checklist
- [x] Step 1: Inspect `useBarnStore.ts`, `App.tsx`, `lazyRoute.tsx`, `HerdScreen.tsx`, `SearchableParentPicker.tsx`, and related bundle/storage paths; record baseline audit.
- [ ] Step 2: Reduce initial entry chunk & cold route/modal eager imports (`offThreadWorkerClient.ts` dynamic fallback imports, `googleCalendarClient.ts` lazy Firebase Auth, `App.tsx` lazy `WipedStorageRecoveryModal`, `HerdScreen.tsx` lazy modals).
- [ ] Step 3: Trim resident heap & eager cross-species/photo/derived caches (`useBarnStore.ts` lazy/scoped `coiByAnimalId`, non-species route lightweight `baseSpeciesData`/conflict skip, species-switch & `onHidden` cache eviction, O(1) `maxRevByEntityRef`; `webSqliteAdapter.ts` lightweight feed/receipt photo loading + on-demand fetchers).
- [ ] Step 4: Keep Herd list & parent picker DOM/CPU lean on 2,000+ animals and Low-Memory devices (`HerdScreen.tsx` on-demand carrier analysis for visible rows + constrained virtual overscan/fallback; `SearchableParentPicker.tsx` virtualized listbox via `useVirtualWindow`, allocation-free filtering, Map refs).
- [ ] Step 5: Add/update unit tests for new lazy/virtualization/lightweight-load invariants and sync `IMPROVEMENTS.md` / `src/core/improvementRegistry.ts` if needed.
- [ ] Step 6: Run `npm test`, `npm run verify:improvements`, `npm run lint`, and `npm run build`; update this plan to `Complete`.
```

<!-- END OF PART 01 OF 16 (51 files) -->
