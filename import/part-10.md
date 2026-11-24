# Codebase Export: AskKim/Pedigree (Part 10 of 16)

- **Branch:** `main`
- **Commit:** `847f8ec8a2fc88e92ecb94065d96cf1277189c07`
- **Generated (UTC):** 2026-11-21 17:00:43 UTC
- **Files in this part:** 12 (`src/core/improvementRegistry.ts` -> `src/core/promptsCatalog.ts`)
- **Index:** [index.md](./index.md)

---
## `src/core/improvementRegistry.ts`

````typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Improvement Registry & GitHub-Overwrite Drift Verifier (`src/core/improvementRegistry.ts`).
 *
 * Purpose:
 *   Tracks every intentional behavioral, safety, UX, and stability improvement in Community Pedigree
 *   alongside concrete code invariants and step-by-step restoration playbooks. If an external sync
 *   or merge accidentally overwrites modified files, running `npm run verify:improvements` (or CI)
 *   pinpoints exactly what regressed and how to put it back.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 *   100% pure TypeScript with zero browser DOM (`window`, `document`) or Node (`fs`, `path`) imports.
 *   Node file loading lives in `scripts/verify-improvements.ts`.
 */

import { nowIsoUtc } from './models';

export type ImprovementCategory =
  | 'backup-safety'
  | 'alerts-home'
  | 'species-ux'
  | 'stability-pwa'
  | 'ci-tooling'
  | 'diagnostics-sync';

export interface ImprovementInvariant {
  /** Workspace-relative POSIX path, e.g. `src/core/models.ts` */
  filePath: string;
  /** Identifiers, functions, or critical guards that must remain present in this file */
  requiredSubstrings: string[];
  /** Anti-patterns or regressions that must NOT reappear in this file */
  forbiddenSubstrings?: string[];
  /** Short explanation of why this check exists */
  rationale: string;
}

export interface ImprovementEntry {
  id: string;
  title: string;
  category: ImprovementCategory;
  source: 'session' | 'github-preserved';
  summary: string;
  userIntent: string;
  files: string[];
  invariants: ImprovementInvariant[];
  restorePlaybook: string[];
}

export interface ImprovementDriftViolation {
  entryId: string;
  title: string;
  filePath: string;
  issue: string;
  restorePlaybook: string[];
}

export interface ImprovementDriftReport {
  checkedAtIso: string;
  totalEntries: number;
  totalFilesChecked: number;
  passedCount: number;
  violations: ImprovementDriftViolation[];
  ok: boolean;
}

export const IMPROVEMENT_CATEGORY_LABELS: Record<ImprovementCategory, string> = {
  'backup-safety': 'Backups & Safety',
  'alerts-home': 'Home & Alerts',
  'species-ux': 'Species & Herd UX',
  'stability-pwa': 'Stability & Mobile PWA',
  'ci-tooling': 'CI & Tooling',
  'diagnostics-sync': 'Diagnostics & Sync',
};

export const IMPROVEMENTS_REGISTRY: ImprovementEntry[] = [
  {
    id: 'IMP-001',
    title: 'Backup Freshness Tracking, Reminders & Clean Human-Readable Exports',
    category: 'backup-safety',
    source: 'session',
    summary:
      'Tracks external backup timestamps/formats, renders proactive dismissible/snoozable backup reminders when non-testing edits are unbacked, and writes human-readable JSON v5 backups with barnSummary and clean filenames.',
    userIntent:
      'Add backup reminders and timestamps where necessary, place backup buttons prominently, and keep backups clean and human-readable.',
    files: [
      'src/core/backupStatus.ts',
      'src/core/syncAndExports.ts',
      'src/hooks/useBarnStore.ts',
      'src/App.tsx',
      'src/components/ImportExportHubScreen.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/backupStatus.ts',
        requiredSubstrings: ['evaluateBackupStatus', 'formatLocalDateTimeReadable', 'hasNonTestingBarnData'],
        rationale: 'Backup freshness evaluator and human-readable timestamp formatters must stay intact.',
      },
      {
        filePath: 'src/core/syncAndExports.ts',
        requiredSubstrings: ['buildCleanBackupFileName', 'exportedAtLocal', 'barnSummary'],
        rationale: 'Clean filenames (`pedigree-backup-YYYY-MM-DD.json`) and top-level `barnSummary` prevent messy exports.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: ['recordBackupExport', 'snoozeBackupReminder', 'backupStatus'],
        rationale: 'Store must track `lastBackupMeta` and expose `recordBackupExport`/`snoozeBackupReminder`.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: ['backupStatus.showDismissibleBanner', 'snoozeBackupReminder'],
        rationale: 'Global dismissible/snoozable reminder banner alerts breeders when real edits are unbacked.',
      },
      {
        filePath: 'src/components/ImportExportHubScreen.tsx',
        requiredSubstrings: ['backupStatus', 'recordBackupExport'],
        rationale: 'Import/Export Hub exports must show live backup timestamps and record external exports immediately.',
      },
      {
        filePath: 'src/components/SettingsAndSyncScreen.tsx',
        requiredSubstrings: ['backupStatus', 'recordBackupExport'],
        rationale: 'Settings backup summary & pre-reset export must show live backup status and record exports immediately.',
      },
    ],
    restorePlaybook: [
      'Restore `evaluateBackupStatus` and timestamp formatters in `src/core/backupStatus.ts`.',
      'Ensure `exportBarnBackupJson` emits `exportedAtLocal`, `barnSummary`, and deterministically sorted animals in `src/core/syncAndExports.ts`.',
      'Wire `lastBackupMeta`, `recordBackupExport`, and `snoozeBackupReminder` in `src/hooks/useBarnStore.ts` and connect banner/cards in `src/App.tsx`, `ImportExportHubScreen.tsx`, and `SettingsAndSyncScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-002',
    title: 'Timestamped Pre-Removal Safety Backups & Non-Testing Record Purge',
    category: 'backup-safety',
    source: 'session',
    summary:
      'Recommends and triggers second-precision timestamped species backups before deleting a species, wiping all species data, or clearing only non-testing livestock entries—never overwriting stable daily backups.',
    userIntent:
      'Provide collision-free timestamped backups before removing a species or clearing non-testing entries in case corruption caused the reset.',
    files: [
      'src/core/sampleData.ts',
      'src/core/syncAndExports.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/SpeciesDashboardScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/syncAndExports.ts',
        requiredSubstrings: ['SpeciesBackupReason', 'buildSpeciesSafetyBackupFileName', 'exportSpeciesBackupJson'],
        rationale: 'Pre-removal species JSON exports require distinct timestamped filenames and reason metadata.',
      },
      {
        filePath: 'src/core/sampleData.ts',
        requiredSubstrings: ['countSpeciesNonTestingRecords', 'purgeSpeciesNonTestingDataPure'],
        rationale: 'Non-testing purge must isolate user records cleanly without deleting starter sample rows.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: ['deleteSpeciesNonTestingData', 'purgeSpeciesNonTestingDataPure'],
        rationale: 'Store must persist non-testing purges via batch operations and clear stale caches.',
      },
      {
        filePath: 'src/components/SpeciesDashboardScreen.tsx',
        requiredSubstrings: ['countSpeciesNonTestingRecords', 'pre-remove-non-testing', 'pre-remove-species'],
        rationale: 'Species hub safety controls must offer 1-click timestamped safety backups before destructive wipes.',
      },
    ],
    restorePlaybook: [
      'Ensure `buildSpeciesSafetyBackupFileName` and 3-arg `exportSpeciesBackupJson(..., { reason })` exist in `src/core/syncAndExports.ts`.',
      'Keep `countSpeciesNonTestingRecords` and `purgeSpeciesNonTestingDataPure` in `src/core/sampleData.ts`.',
      'Expose `deleteSpeciesNonTestingData` in `src/hooks/useBarnStore.ts` and wire confirmation + timestamped backup buttons in `src/components/SpeciesDashboardScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-003',
    title: 'Decluttered Home Species Cards with Targeted Alerts & Arriving-Babies Indicator',
    category: 'alerts-home',
    source: 'session',
    summary:
      'Removes clutter (delete-all button, herd counts, terminology tables, day counts, test-data toggles) from Home cards and adds targeted Due/Overdue Task alerts (Do / Ignore Permanently / Clear Current Group) plus Arriving-Babies gestation alerts.',
    userIntent:
      'Keep Home species cards focused strictly on navigation, sorting, due/overdue task actionability, and upcoming births.',
    files: [
      'src/core/models.ts',
      'src/core/barnAlerts.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/HomeSpeciesScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/models.ts',
        requiredSubstrings: ['pluralizeSpeciesLabel'],
        rationale: '`barnAlerts.ts` uses `pluralizeSpeciesLabel` to format arriving-offspring labels cleanly.',
      },
      {
        filePath: 'src/core/barnAlerts.ts',
        requiredSubstrings: [
          'evaluateSpeciesDueTasksAlert',
          'evaluateSpeciesArrivingBabiesAlert',
          'buildTaskAlertGroupSignature',
        ],
        rationale: 'Pure alert evaluation rules ensure group-clear signatures reappear only when new due tasks arrive.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: ['ignoreTaskAlertsPermanently', 'clearTaskAlertGroup'],
        rationale: 'Store must persist ignored task IDs and cleared group signatures per species.',
      },
      {
        filePath: 'src/components/HomeSpeciesScreen.tsx',
        requiredSubstrings: ['evaluateSpeciesDueTasksAlert', 'evaluateSpeciesArrivingBabiesAlert'],
        rationale: 'Home cards must consume `barnAlerts.ts` directly rather than drifting inline logic.',
      },
    ],
    restorePlaybook: [
      'Export `pluralizeSpeciesLabel` from `src/core/models.ts`.',
      'Use `evaluateSpeciesDueTasksAlert` and `evaluateSpeciesArrivingBabiesAlert` in `src/components/HomeSpeciesScreen.tsx`.',
      'Ensure `clearTaskAlertGroup(speciesName, groupSignature)` persists the string signature in `dismissedTaskGroupKeys`.',
    ],
  },
  {
    id: 'IMP-004',
    title: 'Optional Default Species Naming Prefix with Delimiter-Aware Override',
    category: 'species-ux',
    source: 'session',
    summary:
      'Supports per-species optional `defaultAnimalPrefix` (`Oak Ridge` or `OR-`) applied automatically on animal and litter creation only if the name does not already begin with the prefix, while letting users edit or override anytime.',
    userIntent:
      'Save repetitive typing for rabbitry/herd prefixes without double-prefixing or blocking custom names.',
    files: [
      'src/core/models.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/HerdScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/models.ts',
        requiredSubstrings: ['applyAnimalNamePrefix', 'defaultAnimalPrefix'],
        rationale: 'Delimiter-aware prefix helper handles hyphens/colons (`OR-Ruby`) and case-insensitive duplicate checks.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: ['applyAnimalNamePrefix'],
        rationale: 'Litter offspring auto-creation in `updateBreedingOutcome` must respect the species default prefix.',
      },
    ],
    restorePlaybook: [
      'Keep `applyAnimalNamePrefix` (and `applySpeciesNamePrefix` alias) in `src/core/models.ts`.',
      'Apply `applyAnimalNamePrefix` in animal creation forms (`HerdScreen.tsx`) and litter generation (`useBarnStore.ts`).',
    ],
  },
  {
    id: 'IMP-005',
    title: 'Species Hub Management Relocation, Cross-Species Migration Modal & Herd Pagination',
    category: 'species-ux',
    source: 'session',
    summary:
      'Moves species backup, delete, and migrate controls out of Home mini-cards into each Species Hub & Herd screen; adds pedigree-family-aware `SpeciesMigrationModal` and 50-row Show More pagination in HerdScreen.',
    userIntent:
      'Move heavy destructive & migration controls into each species hub and support safe family-linked cross-species moves.',
    files: [
      'src/core/speciesMigration.ts',
      'src/components/SpeciesMigrationModal.tsx',
      'src/components/HerdScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/hooks/useBarnStore.ts',
    ],
    invariants: [
      {
        filePath: 'src/core/speciesMigration.ts',
        requiredSubstrings: ['expandPedigreeFamilyInSpecies', 'migrateAnimalsToSpecies'],
        rationale: 'Cross-species migration preserves ancestor/descendant links and moves photos/logs/breedings/tasks cleanly.',
      },
      {
        filePath: 'src/components/HerdScreen.tsx',
        requiredSubstrings: ['SpeciesMigrationModal', 'HERD_PAGE_SIZE'],
        rationale: 'Herd screen uses `SpeciesMigrationModal` and paginates large rosters at 50 rows per page.',
      },
      {
        filePath: 'src/components/SpeciesDashboardScreen.tsx',
        requiredSubstrings: ['SpeciesMigrationModal', 'onDownloadTimestampedSpeciesBackup'],
        rationale: 'Species Hub exposes hub-level backup, migration, and safety-backed deletion controls.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: ['migrateAnimalsToSpecies', 'SpeciesMigrationOptions'],
        rationale: 'Store delegates species migration to the tested `migrateAnimalsToSpecies` engine.',
      },
    ],
    restorePlaybook: [
      'Wire `migrateAnimalsToSpecies` + rolling safety snapshot inside `useBarnStore.ts`.',
      'Render `SpeciesMigrationModal` in both `HerdScreen.tsx` (single/multi-select) and `SpeciesDashboardScreen.tsx` (bulk-all).',
      'Keep `HERD_PAGE_SIZE = 50` slicing + Show More button in `HerdScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-006',
    title: 'Archive-Aware Herd Status & Importer Normalization',
    category: 'species-ux',
    source: 'session',
    summary:
      'Includes `Archived` in `AnimalStatus`, aligns `isAnimalArchived` / `isAnimalActive` / `normalizeAnimalStatus`, and teaches HerdBoss CSV importer to distinguish `Archived` & `Active` flags from `Reference` flags.',
    userIntent:
      'Ensure historical/inactive imported stock stays archived cleanly for pedigrees without triggering active barn tasks.',
    files: [
      'src/core/models.ts',
      'src/core/importers/herdBossImporter.ts',
      'src/core/syncAndExports.ts',
    ],
    invariants: [
      {
        filePath: 'src/core/models.ts',
        requiredSubstrings: ["'Archived'", 'isAnimalActive', 'normalizeAnimalStatus'],
        rationale: 'Canonical Archived status and importer helpers must stay exported from `models.ts`.',
      },
      {
        filePath: 'src/core/importers/herdBossImporter.ts',
        requiredSubstrings: ['rawArchivedFlag', 'rawActiveFlag'],
        rationale: 'CSV `Archived` / `Active` flags must map cleanly to `Archived` instead of collapsing into `Retired` or `Active`.',
      },
    ],
    restorePlaybook: [
      'Keep `Archived` in `AnimalStatus` and `ANIMAL_STATUSES` in `src/core/models.ts`.',
      'Keep `isAnimalActive`, `isAnimalArchived`, and `normalizeAnimalStatus` aligned with `herdBossImporter.test.ts`.',
      'Separate `archivedFlag` and `activeFlag` lookup in `src/core/importers/herdBossImporter.ts`.',
    ],
  },
  {
    id: 'IMP-007',
    title: 'Mobile Chrome Crash Prevention, Cycle-Guarded COI & Batch Storage Writes',
    category: 'stability-pwa',
    source: 'session',
    summary:
      'Eliminates Chrome Android Aw Snap renderer crashes by disabling Workbox SW in dev + adding self-unregistering `/dev-sw.js` middleware, scoping eager COI computation off home/settings boot, guarding `PedigreeIndex.inbreeding` recursion cycles, batching SQLite/IndexedDB mutations, and code-splitting secondary routes with `React.lazy`.',
    userIntent:
      'Fix repeated Chrome Android tab crashes before/during app startup and keep pedigree/bulk operations fast under tight mobile RAM.',
    files: [
      'vite.config.ts',
      'src/main.tsx',
      'src/core/pedigreeCalculator.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
    ],
    invariants: [
      {
        filePath: 'vite.config.ts',
        requiredSubstrings: ['devServiceWorkerCleanupPlugin', 'enabled: false'],
        forbiddenSubstrings: ['devOptions: {\n      enabled: true'],
        rationale: 'Workbox devOptions enabled=true inside preview iframes causes stale chunk/SW crash loops on mobile.',
      },
      {
        filePath: 'src/main.tsx',
        requiredSubstrings: ['import.meta.env.PROD', "navigator.serviceWorker.getRegistrations"],
        rationale: 'Dev mode must unregister lingering service workers and clear caches instead of registering Workbox.',
      },
      {
        filePath: 'src/core/pedigreeCalculator.ts',
        requiredSubstrings: ['inbreeding(id: string, activeCalls: Set<string> = new Set())'],
        rationale: 'Cycle guard prevents stack overflow if an imported pedigree has an ancestral loop.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: ['saveAnimalsBatch', 'deleteAnimalsBatch', 'deleteTasksBatch'],
        rationale: 'Single-transaction SQLite batch methods prevent O(N) disk/IDB flushes on bulk edits.',
      },
    ],
    restorePlaybook: [
      'Set `devOptions: { enabled: false }` and keep `devServiceWorkerCleanupPlugin` in `vite.config.ts`.',
      'Guard `registerSW` behind `if (import.meta.env.PROD)` and unregister dev SWs in `src/main.tsx`.',
      'Forward `activeCalls` inside `PedigreeIndex.inbreeding` in `src/core/pedigreeCalculator.ts` and skip unnecessary COI precompute on `home`/`settings` in `src/hooks/useBarnStore.ts`.',
    ],
  },
  {
    id: 'IMP-008',
    title: 'Hardcoded Root Base Path & Disabled Dev HMR Config + GitHub Actions CI',
    category: 'ci-tooling',
    source: 'session',
    summary:
      "Hardcodes `basePath = '/'`, `hmr: false`, and `watch: null` in Vite config so AI Studio never prompts for `VITE_BASE_PATH` or `DISABLE_HMR`, and runs unit tests, improvement verification, lint, and production builds in `.github/workflows/ci.yml`.",
    userIntent:
      'Automatically verify all domain tests, lint, improvements, and PWA builds on every push with `/` and disabled dev HMR hardcoded so AI Studio never prompts for env vars.',
    files: ['vite.config.ts', '.env.example', '.github/workflows/ci.yml', 'package.json'],
    invariants: [
      {
        filePath: 'vite.config.ts',
        requiredSubstrings: ["const basePath = '/'", 'hmr: false', 'watch: null'],
        forbiddenSubstrings: ['process.env.VITE_BASE_PATH', 'process.env.DISABLE_HMR'],
        rationale:
          "Hardcoding `basePath = '/'`, `hmr: false`, and `watch: null` prevents AI Studio from prompting for `VITE_BASE_PATH` or `DISABLE_HMR`.",
      },
      {
        filePath: '.env.example',
        requiredSubstrings: ['# No required environment variables.'],
        forbiddenSubstrings: ['VITE_BASE_PATH', 'DISABLE_HMR'],
        rationale:
          'Omitting `VITE_BASE_PATH` and `DISABLE_HMR` from `.env.example` prevents AI Studio from prompting for unconfigured env vars.',
      },
      {
        filePath: '.github/workflows/ci.yml',
        requiredSubstrings: ['npm test', 'npm run verify:improvements', 'npm run lint', 'npm run build'],
        rationale: 'CI must block merges if tests, improvement invariants, TypeScript, or builds break.',
      },
      {
        filePath: 'package.json',
        requiredSubstrings: ['"test": "vitest run"', '"verify:improvements": "tsx scripts/verify-improvements.ts"'],
        rationale: 'Standard npm scripts power local & CI verification.',
      },
      {
        filePath: '.github/workflows/deploy-pages.yml',
        requiredSubstrings: ['oven-sh/setup-bun', 'bun run build --base='],
        rationale: 'GitHub Pages deployment strictly requires Bun and passes dynamic --base on CLI.',
      },
      {
        filePath: 'vite.config.ts',
        requiredSubstrings: ["scope: './'", "start_url: './'", "id: './'"],
        rationale: 'Relative PWA manifest fields ensure installability on both root (/) and GitHub Pages subpaths (/Pedigree/).',
      },
    ],
    restorePlaybook: [
      "Keep `const basePath = '/'`, `hmr: false`, and `watch: null` hardcoded in `vite.config.ts` without reading `process.env.VITE_BASE_PATH` or `process.env.DISABLE_HMR`.",
      'Keep relative `id`, `scope`, and `start_url` (`./`) in `VitePWA` manifest and keep `.github/workflows/deploy-pages.yml` strictly on Bun passing `--base=...` via CLI.',
      'Do not add `VITE_BASE_PATH` or `DISABLE_HMR` to `.env.example`.',
      'Ensure `package.json` defines `"test"` and `"verify:improvements"`, and `.github/workflows/ci.yml` executes both.',
    ],
  },
  {
    id: 'IMP-009',
    title: 'Crash Error Boundary, Persistent Crash Log & DB Health Self-Repair',
    category: 'diagnostics-sync',
    source: 'github-preserved',
    summary:
      'Catches render/window/promise crashes in `CrashErrorBoundary` + `crashLogger.ts`, exposes IndexedDB persistent-storage protection + DB integrity scan & repair in `dataHealthCheck.ts`, and exports one-click diagnostic ZIP support bundles.',
    userIntent:
      'Diagnose and recover from browser/storage failures on mobile without losing breeder data.',
    files: [
      'src/components/CrashErrorBoundary.tsx',
      'src/storage/crashLogger.ts',
      'src/core/dataHealthCheck.ts',
      'src/core/supportBundle.ts',
      'src/storage/storageProtection.ts',
    ],
    invariants: [
      {
        filePath: 'src/main.tsx',
        requiredSubstrings: ['CrashErrorBoundary', 'installGlobalCrashHandlers'],
        rationale: 'Root mount must remain wrapped in `CrashErrorBoundary` with global handlers active.',
      },
      {
        filePath: 'src/core/dataHealthCheck.ts',
        requiredSubstrings: ['analyzeBarnDataHealth', 'repairBarnDataHealth'],
        rationale: 'Health scan & self-repair logic protects against orphaned pointers or malformed rows.',
      },
      {
        filePath: 'src/core/supportBundle.ts',
        requiredSubstrings: ['buildSupportBundleZipArchive'],
        rationale: 'Diagnostic ZIP generator packages device info, crash logs, and DB health safely.',
      },
    ],
    restorePlaybook: [
      'Keep `CrashErrorBoundary` wrapping `<App />` and `installGlobalCrashHandlers()` in `src/main.tsx`.',
      'Preserve `DiagnosticsAndSupportPanel.tsx` integration inside `SettingsAndSyncScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-010',
    title: 'Offline Delta Sync Outbox, Conflict Log & Complete ZIP Photo Archive',
    category: 'diagnostics-sync',
    source: 'github-preserved',
    summary:
      'Provides local-first field-level delta sync bundles, Syncthing/shared-folder direct sync, field collision review log, and Complete Archive `.ZIP` exports bundling real organized animal image files alongside SQLite + JSON.',
    userIntent:
      'Enable multi-device barn sync and complete archival exports containing both records and photos.',
    files: [
      'src/core/syncOutbox.ts',
      'src/storage/localSyncChannels.ts',
      'src/core/backupArchive.ts',
      'src/components/ImportExportHubScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/syncOutbox.ts',
        requiredSubstrings: ['diffEntityFieldsToOperations', 'mergeDeltaOperations'],
        rationale: 'Field-level sync outbox prevents whole-record overwrites across peer devices.',
      },
      {
        filePath: 'src/core/backupArchive.ts',
        requiredSubstrings: ['buildCompleteBackupZipArchive', 'parseBackupArchiveInput'],
        rationale: 'ZIP archive builder/parser handles combined data + real image directory trees.',
      },
    ],
    restorePlaybook: [
      'Preserve `syncOutbox.ts`, `localSyncChannels.ts`, and `backupArchive.ts` hooks inside `useBarnStore.ts` and `ImportExportHubScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-011',
    title: 'Durable App Improvement Registry & GitHub-Overwrite Drift Verifier',
    category: 'ci-tooling',
    source: 'session',
    summary:
      'Maintains this machine-checkable registry (`improvementRegistry.ts`), human-readable `IMPROVEMENTS.md`, automated CLI verifier (`scripts/verify-improvements.ts`), and in-app export/copy panel inside Diagnostics so any GitHub overwrite is immediately spotted and restorable.',
    userIntent:
      'Log every improvement in a durable, exportable system so a future GitHub sync wiping files can be detected and put back accurately.',
    files: [
      'src/core/improvementRegistry.ts',
      'scripts/verify-improvements.ts',
      'IMPROVEMENTS.md',
      'src/components/DiagnosticsAndSupportPanel.tsx',
      'src/core/__tests__/improvementRegistry.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/core/improvementRegistry.ts',
        requiredSubstrings: [
          'IMPROVEMENTS_REGISTRY',
          'evaluateImprovementInvariants',
          'formatImprovementsMarkdown',
          'buildImprovementsRecoveryJson',
        ],
        rationale: 'Core registry and pure export/verification helpers must remain intact.',
      },
      {
        filePath: 'scripts/verify-improvements.ts',
        requiredSubstrings: ['evaluateImprovementInvariants', 'IMPROVEMENTS_REGISTRY'],
        rationale: 'CLI script verifies actual workspace source files against registry invariants.',
      },
      {
        filePath: 'src/components/DiagnosticsAndSupportPanel.tsx',
        requiredSubstrings: ['IMPROVEMENTS_REGISTRY', 'formatImprovementsMarkdown', 'buildImprovementsRecoveryJson'],
        rationale: 'Users can view, download (.md / .json), or copy the improvement recovery log directly in the app.',
      },
    ],
    restorePlaybook: [
      'Run `npm run verify:improvements` after any pull/merge from GitHub to list wiped invariants.',
      'Use `IMPROVEMENTS.md` or the downloaded `pedigree-improvements-log.json` to restore missing helpers and wiring.',
    ],
  },
  {
    id: 'IMP-012',
    title: 'Startup Self-Healing, Lazy Firebase Auth Guard & Corrective Action Logging',
    category: 'stability-pwa',
    source: 'session',
    summary:
      'Prevents initial-load crashes and infinite loading hangs by lazily initializing Firebase Auth, wrapping SQLite JSON parsing in safe recovery helpers, isolating secondary startup promises with Promise.allSettled, running automatic startup health self-repair, falling back to rolling/starter snapshots on fatal DB load errors, and logging every corrective action via logDiagnosticEvent.',
    userIntent:
      'Auto-fix any initial loading or crash errors on startup and log every corrective action for debugging.',
    files: [
      'src/hooks/useBarnStore.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/utils/googleCalendarClient.ts',
      'src/App.tsx',
    ],
    invariants: [
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: ['normalizeRufusLevel', 'Promise.allSettled', 'Corrective action:'],
        rationale: 'Startup must import normalizeRufusLevel, isolate secondary boot promises, and log corrective recovery actions.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: ['safeParseJson', 'Corrective action:'],
        rationale: 'Malformed SQLite row JSON must auto-recover cleanly and record a diagnostic log entry.',
      },
      {
        filePath: 'src/utils/googleCalendarClient.ts',
        requiredSubstrings: ['getFirebaseAuthSafe', 'Corrective action:'],
        rationale: 'Firebase Auth must initialize lazily so offline/restricted browsers never crash before React mounts.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: ['Local Database Recovery Needed'],
        rationale: 'Render a non-blocking recovery UI if snapshot loading fails instead of trapping users on a loading skeleton.',
      },
    ],
    restorePlaybook: [
      'Ensure `normalizeRufusLevel` is imported from `../core/models` in `src/hooks/useBarnStore.ts`.',
      'Keep lazy `getFirebaseAuthSafe()` in `src/utils/googleCalendarClient.ts` and `safeParseJson()` in `src/storage/webSqliteAdapter.ts`.',
      'Keep startup `Promise.allSettled`, `repairBarnDataHealth`, emergency recovery, and `Corrective action:` `logDiagnosticEvent` calls in `src/hooks/useBarnStore.ts`.',
    ],
  },
  {
    id: 'IMP-013',
    title: 'Mobile Memory Hardening, Accessibility & Universal Pedigree Importer',
    category: 'stability-pwa',
    source: 'session',
    summary:
      'Adds UniversalPedigreeImporter for Evans .HTM rowspan trees, multi-gen CSV/TSV/pipe spreadsheets (UTF-8/UTF-16/Windows-1252, Excel serial dates), and nested JSON trees; hardens mobile memory/recursion bounds; and enforces dialog focus traps, label bindings, live regions, and keyboard accessibility across screens.',
    userIntent:
      'Optimize memory for mobile-first usage, improve cross-device accessibility, and import heterogeneous pedigree files gracefully without crashing.',
    files: [
      'src/core/importers/universalPedigreeImporter.ts',
      'src/core/importers/archiveAndCsvUtils.ts',
      'src/core/importers/registry.ts',
      'src/core/pedigreeCalculator.ts',
      'src/core/dataHealthCheck.ts',
      'src/components/ExternalImporterPanel.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/core/__tests__/resilienceAndUniversalImport.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/core/importers/universalPedigreeImporter.ts',
        requiredSubstrings: ['UniversalPedigreeImporter', 'parseEvansHtmlEntry', 'MULTI_GEN_COLUMN_SPECS'],
        rationale: 'Universal importer handles Evans HTML, multi-generation spreadsheets, nested JSON, and unsupported binary warnings.',
      },
      {
        filePath: 'src/core/importers/archiveAndCsvUtils.ts',
        requiredSubstrings: ['decodeTextBytes', 'detectUnbommedUtf16', 'validateAndFormatYmd'],
        rationale: 'Handles UTF-16LE/BE, Windows-1252, Excel serial dates, and calendar validation without crashing.',
      },
      {
        filePath: 'src/core/importers/registry.ts',
        requiredSubstrings: ['UniversalPedigreeImporter'],
        rationale: 'Registers the Universal Pedigree importer alongside HerdBoss.',
      },
      {
        filePath: 'src/core/pedigreeCalculator.ts',
        requiredSubstrings: ['visitedPath: Set<string> = new Set()'],
        rationale: 'Direct ancestor counting guards against circular ancestry loops.',
      },
      {
        filePath: 'src/components/ExternalImporterPanel.tsx',
        requiredSubstrings: ['effectiveParseError', 'role="progressbar"'],
        rationale: 'Keeps parse error calculation pure and exposes accessible alert/progress semantics.',
      },
    ],
    restorePlaybook: [
      'Restore `UniversalPedigreeImporter` and register it in `src/core/importers/registry.ts`.',
      'Keep `decodeTextBytes` UTF-16/Windows-1252 decoding and `validateAndFormatYmd` in `src/core/importers/archiveAndCsvUtils.ts`.',
      'Preserve `visitedPath` cycle guard on `countDirectAncestors` in `src/core/pedigreeCalculator.ts` and accessibility attributes across modal/form components.',
    ],
  },
  {
    id: 'IMP-014',
    title: 'Species Tattoo/Sex Conflict Guardrails, Override & Import Conflict Alerts',
    category: 'species-ux',
    source: 'session',
    summary:
      'Enforces same-species duplicate tattoo/ID checks and parent sex checks in DB health scans, discourages same-sex duplicate tattoo reuse during animal & litter creation unless the user types "override", allows non-blocking imports while flagging conflicted pedigrees/profiles, and supports Conflicts First sorting/filtering plus persistent soft-warning ignore controls.',
    userIntent:
      'Catch duplicate within-species IDs and parent sex mismatches, discourage accidental duplicate tattoos with an explicit override, never hard-block imports on conflicts, and let breeders locate or ignore soft warnings.',
    files: [
      'src/core/animalConflicts.ts',
      'src/core/dataHealthCheck.ts',
      'src/components/AnimalEditorModal.tsx',
      'src/components/BreedingScreen.tsx',
      'src/components/HerdScreen.tsx',
      'src/hooks/useBarnStore.ts',
      'src/App.tsx',
      'src/core/__tests__/animalConflictsAndHealth.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/core/animalConflicts.ts',
        requiredSubstrings: [
          'findSameSexDuplicateTattooCollisions',
          'isOverrideConfirmationValid',
          'analyzeBarnAnimalConflicts',
        ],
        rationale: 'Core conflict detection, override confirmation, and summary logic must remain intact.',
      },
      {
        filePath: 'src/core/dataHealthCheck.ts',
        requiredSubstrings: ['duplicateTattooAnimalsCount', 'parentSexMismatchCount'],
        rationale: 'Database health checks must report duplicate within-species tattoos and parent sex mismatches.',
      },
      {
        filePath: 'src/components/AnimalEditorModal.tsx',
        requiredSubstrings: ['findSameSexDuplicateTattooCollisions', 'isOverrideConfirmationValid'],
        rationale: 'Single-animal editor must warn on same-sex duplicate tattoos and require explicit override typing.',
      },
      {
        filePath: 'src/components/BreedingScreen.tsx',
        requiredSubstrings: ['isOverrideConfirmationValid', 'isLitterOverrideConfirmed'],
        rationale: 'Bulk litter creation must enforce the same duplicate tattoo override guardrail.',
      },
      {
        filePath: 'src/components/HerdScreen.tsx',
        requiredSubstrings: ['conflicts_first', 'duplicateTattooPeers'],
        rationale: 'Herd screen must allow sorting/filtering conflicted animals and ignoring/restoring soft warnings.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: [
          'ignoreAnimalConflicts',
          'restoreAnimalConflictAlert',
          'importConflictAlert',
        ],
        rationale: 'Store must emit post-import conflict alerts and persist per-animal ignored conflict flags.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: ['store.importConflictAlert', 'locateConflictsInHerd'],
        rationale: 'Root shell renders non-blocking import conflict banners with direct Locate Conflicted Animals action.',
      },
    ],
    restorePlaybook: [
      'Keep `findSameSexDuplicateTattooCollisions`, `isOverrideConfirmationValid`, and `analyzeBarnAnimalConflicts` in `src/core/animalConflicts.ts`.',
      'Preserve duplicate tattoo and parent sex mismatch checks in `src/core/dataHealthCheck.ts`.',
      'Keep `"override"` guards in `AnimalEditorModal.tsx` and `BreedingScreen.tsx`, `conflicts_first` sorting/ignore controls in `HerdScreen.tsx`, and `importConflictAlert` wiring in `useBarnStore.ts` / `App.tsx`.',
    ],
  },
  {
    id: 'IMP-015',
    title: '5-Tier Device Capability Detection & Adaptive Memory Cautions',
    category: 'stability-pwa',
    source: 'session',
    summary:
      'Classifies host hardware into 5 memory/CPU tiers, surfaces hardware guidance in Home onboarding & Settings with tier-locked dismissal rules (Tier 1 locked in both locations; Tier 2 closable on Home but persistent in Settings; Tiers 3–5 closable and reopenable), and applies workload cautions in the External Importer.',
    userIntent:
      'Detect constrained mobile devices early, warn users appropriately by hardware tier, and keep Tier 1–2 cautions impossible to accidentally hide permanently.',
    files: [
      'src/core/deviceCapability.ts',
      'src/storage/deviceCapabilityDetector.ts',
      'src/components/DeviceCapabilityCard.tsx',
      'src/components/HomeSpeciesScreen.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/components/ExternalImporterPanel.tsx',
      'src/App.tsx',
      'src/core/__tests__/deviceCapability.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/core/deviceCapability.ts',
        requiredSubstrings: [
          'DEVICE_CAPABILITY_TIERS',
          'classifyDeviceCapability',
          'evaluateBarnWorkloadForTier',
        ],
        rationale: 'Pure 5-tier classification, dismissal rules, and workload evaluator must remain intact.',
      },
      {
        filePath: 'src/storage/deviceCapabilityDetector.ts',
        requiredSubstrings: ['useDeviceCapability', 'readBrowserHardwareSignals'],
        rationale: 'Per-device hardware signal collector and localStorage dismissal hook isolate device state from portable backups.',
      },
      {
        filePath: 'src/components/DeviceCapabilityCard.tsx',
        requiredSubstrings: ['DeviceCapabilityCard', 'evaluateBarnWorkloadForTier'],
        rationale: 'Shared tier banner respects Home vs Settings tier-specific close/reopen rules.',
      },
      {
        filePath: 'src/components/HomeSpeciesScreen.tsx',
        requiredSubstrings: ['DeviceCapabilityCard'],
        rationale: 'Home onboarding displays device capability card on startup.',
      },
      {
        filePath: 'src/components/SettingsAndSyncScreen.tsx',
        requiredSubstrings: ['DeviceCapabilityCard'],
        rationale: 'Settings exposes upper Device Capability section with persistent Tier 1–2 status and reopen control.',
      },
      {
        filePath: 'src/components/ExternalImporterPanel.tsx',
        requiredSubstrings: ['evaluateBarnWorkloadForTier'],
        rationale: 'Importer evaluates incoming record counts against host device capability tier.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: ['useDeviceCapability'],
        rationale: 'Root shell runs `useDeviceCapability()` and passes controller to Home and Settings.',
      },
    ],
    restorePlaybook: [
      'Preserve `DEVICE_CAPABILITY_TIERS`, `classifyDeviceCapability`, and `evaluateBarnWorkloadForTier` in `src/core/deviceCapability.ts`.',
      'Keep `useDeviceCapability` in `src/storage/deviceCapabilityDetector.ts` and `<DeviceCapabilityCard>` mounts in `HomeSpeciesScreen.tsx` and `SettingsAndSyncScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-016',
    title: 'Route-Level Code Splitting with Retry & Chunk Error Boundary',
    category: 'stability-pwa',
    source: 'session',
    summary:
      'Code-splits secondary screens and calendar modal via `lazyNamedRoute` (`React.lazy`) with automatic single retry, `RouteLoadingFallback` skeleton, and `RouteErrorBoundary` recovery UI to slash initial JS parse/compile memory on mobile devices.',
    userIntent:
      'Reduce startup JS bundle size and memory pressure by lazy-loading secondary screens without breaking offline or stale-chunk recovery.',
    files: [
      'src/utils/lazyRoute.tsx',
      'src/App.tsx',
      'src/utils/__tests__/lazyRoute.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/utils/lazyRoute.tsx',
        requiredSubstrings: [
          'lazyNamedRoute',
          'loadWithSingleRetry',
          'RouteErrorBoundary',
          'RouteLoadingFallback',
        ],
        rationale: 'Named-export lazy wrapper, single chunk retry, and route error boundary prevent blank-screen crashes.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: ['lazyNamedRoute', 'RouteErrorBoundary', 'RouteLoadingFallback'],
        rationale: 'Secondary routes in `App.tsx` must stay lazily loaded inside `RouteErrorBoundary` + `Suspense`.',
      },
    ],
    restorePlaybook: [
      'Keep `lazyNamedRoute`, `loadWithSingleRetry`, `RouteLoadingFallback`, and `RouteErrorBoundary` in `src/utils/lazyRoute.tsx`.',
      'Keep `React.lazy` declarations and `<RouteErrorBoundary><Suspense>` wrapping secondary routes in `src/App.tsx`.',
    ],
  },
  {
    id: 'IMP-017',
    title: 'On-Demand Full-Resolution Photo Hydration & Off-Thread `.ZIP`/Import Worker',
    category: 'stability-pwa',
    source: 'session',
    summary:
      'Keeps only lightweight thumbnails in reactive snapshot RAM, lazily hydrates full-resolution photo `dataUrl`s via a bounded LRU cache (`BoundedPhotoDataCache`) and SQLite fetchers on gallery/lightbox/pedigree-print/binder/export demand while guarding writes against wiping stored `data_url` rows, and moves `.ZIP` compression/extraction and external archive parsing into a dedicated Web Worker with async fallback.',
    userIntent:
      'Eliminate heavy base64 photo retention and UI-thread freezes during large `.ZIP` backups and external pedigree imports on mobile devices.',
    files: [
      'src/storage/photoHydration.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/storage/archiveAndImport.worker.ts',
      'src/storage/offThreadWorkerClient.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/AnimalPhotoGallery.tsx',
      'src/components/ExternalImporterPanel.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/storage/__tests__/photoHydrationAndWorker.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/storage/photoHydration.ts',
        requiredSubstrings: [
          'BoundedPhotoDataCache',
          'stripPhotoDataUrlsFromSnapshot',
          'hydrateSnapshotWithPhotoDataUrls',
        ],
        rationale: 'Bounded LRU cache and batch hydration helpers keep full-res base64 strings out of steady-state RAM.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: [
          'lightweightPhotos',
          'loadAnimalPhotoDataUrl',
          'loadAnimalPhotoDataUrlsBatch',
        ],
        rationale: 'SQLite adapter supports thumbnail-only snapshot loads, on-demand photo reads, and non-destructive dehydrated writes.',
      },
      {
        filePath: 'src/storage/archiveAndImport.worker.ts',
        requiredSubstrings: [
          'buildCompleteBackupZipArchive',
          'buildPhotosOnlyZipArchive',
          'parseBackupArchiveInput',
        ],
        rationale: 'Dedicated module worker runs heavy ZIP builds/extractions and importer parsing off the UI thread.',
      },
      {
        filePath: 'src/storage/offThreadWorkerClient.ts',
        requiredSubstrings: [
          'buildCompleteBackupZipOffThread',
          'parseExternalImportOffThread',
          'buildImporterWorkerSnapshot',
        ],
        rationale: 'Worker client strips base64 images before cloning snapshots and falls back gracefully when `Worker` is unavailable.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: [
          'BoundedPhotoDataCache',
          'loadAnimalPhotoDataUrl',
          'hydrateSnapshotForExport',
          'buildCompleteBackupZipToOpfsTmpOffThread',
        ],
        rationale: 'Store loads lightweight snapshots, caches hydrated photos, hydrates rolling/export snapshots, and streams off-thread ZIP archives via OPFS /tmp.',
      },
      {
        filePath: 'src/components/AnimalPhotoGallery.tsx',
        requiredSubstrings: ['onLoadFullPhoto', 'activePhotoSrc'],
        rationale: 'Photo gallery and lightbox fetch full-resolution images lazily while displaying thumbnails immediately.',
      },
      {
        filePath: 'src/components/ExternalImporterPanel.tsx',
        requiredSubstrings: ['parseExternalImportOffThread', 'isParsingArchive'],
        rationale: 'External importer unpacks and parses staged archives asynchronously off-thread with request sequencing.',
      },
    ],
    restorePlaybook: [
      'Keep `BoundedPhotoDataCache` and `hydrateSnapshotWithPhotoDataUrls` in `src/storage/photoHydration.ts` plus `lightweightPhotos` guards in `src/storage/webSqliteAdapter.ts`.',
      'Keep `archiveAndImport.worker.ts` and `offThreadWorkerClient.ts` wired into `useBarnStore.ts`, `SettingsAndSyncScreen.tsx`, `DiagnosticsAndSupportPanel.tsx`, and `ExternalImporterPanel.tsx`.',
      'Keep `onLoadFullPhoto` / `onHydrateSnapshotForExport` props wired from `App.tsx` to galleries, pedigree print modals, Barn Binders, and backup exports.',
    ],
  },
  {
    id: 'IMP-018',
    title: 'Hybrid OPFS Storage Vault, Archived Herds, Wiped-Storage Recovery & IDB Migration Guard',
    category: 'backup-safety',
    source: 'session',
    userIntent:
      'Isolate temporary exports in OPFS /tmp, unify automated + manual backup vaults in OPFS /backups with IDB fallback, offload Sold/Deceased stock to OPFS /archives while preserving ancestor pedigree stubs, pause on wiped browser storage with restore recovery, and dump raw stores before resetting failed IndexedDB migrations.',
    summary:
      'Adds pure TS schema v6 envelopes, SHA-256 verification, legacy migration, and .archive.zip bundling in `backupVault.ts`; manages OPFS `/tmp`, `/backups` (retention 6 monthly / 3 pre-upgrade / 8 pre-reset), `/archives`, boot orphan sweeps, QuotaExceededError recovery, idle Export Canary, prior-use sentinel, and IndexedDB rescue dumps in `opfsStorage.ts`; and mounts UnifiedBackupVaultPanel, ArchivedHerdsModal, WipedStorageRecoveryModal, and 1-click Save to Vault banner.',
    files: [
      'src/core/backupVault.ts',
      'src/storage/opfsStorage.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/UnifiedBackupVaultPanel.tsx',
      'src/components/ArchivedHerdsModal.tsx',
      'src/components/WipedStorageRecoveryModal.tsx',
      'src/App.tsx',
      'src/core/__tests__/backupVault.test.ts',
      'src/storage/__tests__/opfsStorage.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/core/backupVault.ts',
        requiredSubstrings: [
          'CURRENT_BACKUP_SCHEMA_VERSION',
          'migrateAndValidateBackupEnvelope',
          'buildExportCanaryProbe',
          'buildArchivedAnimalsBundle',
        ],
        rationale: 'Pure TypeScript OPFS vault envelopes, schema migration, canary verification, and pedigree-stub-safe archive bundling must remain intact.',
      },
      {
        filePath: 'src/storage/opfsStorage.ts',
        requiredSubstrings: [
          'sweepOrphanedOpfsTmpOnBoot',
          'saveOpfsVaultBackup',
          'saveOpfsHerdArchive',
          'detectReturningUserWipedStorage',
          'dumpIndexedDbDatabaseToOpfs',
        ],
        rationale: 'OPFS `/tmp`, `/backups`, `/archives` persistence, boot sweeps, QuotaExceededError retries, wiped detection, and IDB rescue dumps must stay wired.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: [
          'allowSeedFresh',
          'detectReturningUserWipedStorage',
          'markPriorUseSentinelFromSnapshot',
          'pre_upgrade',
        ],
        rationale: 'SQLite adapter must pause sample seeding on wiped returning storage, create pre-upgrade snapshots, and update prior-use sentinels.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: [
          'wipedRecoveryContext',
          'opfsVaultBackups',
          'archivedHerdBundles',
          'offloadAnimalsToOpfsArchive',
          'runOpfsExportCanary',
        ],
        rationale: 'Barn store must orchestrate unified OPFS/IDB vault actions, archive offload/restore, idle canary checks, and wiped-storage recovery.',
      },
      {
        filePath: 'src/components/UnifiedBackupVaultPanel.tsx',
        requiredSubstrings: [
          'UnifiedBackupVaultPanel',
          'onRestoreOpfsBackup',
          'onRestoreRollingBackup',
        ],
        rationale: 'Settings UI must unify OPFS vault backups and IndexedDB rolling snapshots in one clean recovery panel.',
      },
      {
        filePath: 'src/components/ArchivedHerdsModal.tsx',
        requiredSubstrings: [
          'ArchivedHerdsModal',
          'autoOffloadRetiredToOpfs',
          'onRestoreArchive',
        ],
        rationale: 'Archived Herds modal must support searching, downloading, deleting, and restoring offloaded Sold/Deceased bundles.',
      },
      {
        filePath: 'src/components/WipedStorageRecoveryModal.tsx',
        requiredSubstrings: [
          'WipedStorageRecoveryModal',
          'onRestoreLatestOpfs',
          'onStartFresh',
        ],
        rationale: 'Blocking wiped-storage recovery dialog must offer latest OPFS restore, local file upload, and explicit two-step Start Fresh.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: [
          '<WipedStorageRecoveryModal',
          'store.exportCanaryWarning',
          'Save to Vault',
        ],
        rationale: 'App shell must mount WipedStorageRecoveryModal, Export Canary alerts, and 1-click Save to Vault on backup banners.',
      },
    ],
    restorePlaybook: [
      'Keep `src/core/backupVault.ts` pure TypeScript with schema v6 migration, SHA-256 verification, and `computePedigreeReferencedIds` stub preservation.',
      'Keep `src/storage/opfsStorage.ts` managing `/tmp`, `/backups`, `/archives`, `try/finally` `.close()`, boot sweeps, canary checks, and IDB failure dumps.',
      'Keep `UnifiedBackupVaultPanel.tsx`, `ArchivedHerdsModal.tsx`, `WipedStorageRecoveryModal.tsx`, `useBarnStore.ts`, and `App.tsx` connected.',
    ],
  },
  {
    id: 'IMP-019',
    title: 'ES2018 Compatibility Build, Crash-Loop Circuit Breaker, Manual SW Update & Graceful Fallbacks',
    category: 'stability-pwa',
    source: 'session',
    summary:
      'Downlevels TS/Vite build to ES2018 (2018+ devices: Chrome 68+/Safari 12+/Firefox 63+/Edge 79+) with minimal zero-bloat shims, runs an ES5 pre-flight + 3-in-60s crash-loop circuit breaker & ?emergency_reset=true hatch in index.html, switches SW updates to a manual prompt gate with controllerchange handshake and open-modal deferral, offers lightweight Database-Only .JSON backups on Tier 1/2, windows large report/care-log lists, and keeps unsupported optional controls visible with clear disabled reasons.',
    userIntent:
      'Support 2018+ browsers gracefully without polyfill bloat, break reload/crash loops cleanly, defer PWA updates while editing, offer low-memory DB-only exports, and keep unavailable controls visible with explanation text.',
    files: [
      'tsconfig.json',
      'vite.config.ts',
      'index.html',
      'src/main.tsx',
      'src/utils/es2018Shims.ts',
      'src/storage/pwaUpdateManager.ts',
      'src/core/deviceCapability.ts',
      'src/storage/deviceCapabilityDetector.ts',
      'src/utils/webFileActions.ts',
      'src/components/UnifiedBackupVaultPanel.tsx',
      'src/components/ImportExportHubScreen.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/components/PrintPreviewModal.tsx',
      'src/App.tsx',
    ],
    invariants: [
      {
        filePath: 'vite.config.ts',
        requiredSubstrings: ['es2018', 'safari12', 'cssTarget', "registerType: 'prompt'"],
        rationale: 'Vite build must target ES2018 / Safari 12+ (2018+ browsers) with manual prompt SW activation.',
      },
      {
        filePath: 'index.html',
        requiredSubstrings: [
          '__PEDIGREE_PREFLIGHT__',
          'pedigree-preflight-guard',
          '__PEDIGREE_BOOT_OK__',
          'emergency_reset=true',
          '__PEDIGREE_RECORD_BOOT_CRASH__',
        ],
        rationale: 'ES5 pre-flight guard, 3-in-60s crash-loop circuit breaker, and ?emergency_reset=true recovery hatch must remain intact.',
      },
      {
        filePath: 'src/utils/es2018Shims.ts',
        requiredSubstrings: ['ensureEs2018Globals', 'allSettled', 'fromEntries'],
        rationale: 'Zero-bloat ES2018 runtime shims prevent missing globalThis/allSettled/fromEntries crashes on 2018 browsers.',
      },
      {
        filePath: 'src/storage/pwaUpdateManager.ts',
        requiredSubstrings: ['usePwaUpdateStatus', 'controllerchange', 'applyPwaUpdateNow'],
        rationale: 'Manual Service Worker update gate and single-reload controllerchange handshake must remain intact.',
      },
      {
        filePath: 'src/core/deviceCapability.ts',
        requiredSubstrings: ['assessBrowserCompatibility', 'getHeavyZipExportGate'],
        rationale: 'Pure TypeScript browser compatibility classifier and Tier 1/outdated ZIP caution gate must remain intact.',
      },
      {
        filePath: 'src/utils/webFileActions.ts',
        requiredSubstrings: ['copyTextWithFallback'],
        rationale: 'Clipboard fallback for restricted/older browser contexts must remain available.',
      },
      {
        filePath: 'src/components/ImportExportHubScreen.tsx',
        requiredSubstrings: ['pendingHeavyZipExport', 'heavyZipGate', 'handleDownloadDatabaseOnlyBackup'],
        rationale: 'Heavy .ZIP exports must warn Tier 1/outdated browsers and offer Database-Only .JSON fallback without photo hydration.',
      },
    ],
    restorePlaybook: [
      'Keep ES2018 target in `tsconfig.json` and `vite.config.ts` (`safari12`, `registerType: "prompt"`) plus ES5 guard, circuit breaker, and `?emergency_reset=true` in `index.html`.',
      'Keep `src/utils/es2018Shims.ts` imported first in `src/main.tsx` alongside `src/storage/pwaUpdateManager.ts`.',
      'Keep `assessBrowserCompatibility` and `getHeavyZipExportGate` in `src/core/deviceCapability.ts` and hook probes in `src/storage/deviceCapabilityDetector.ts`.',
      'Keep disabled-with-reason UI controls (`Share .HTM` in `PrintPreviewModal.tsx`, Storage Vault, Import/Export Hub, Settings), Database-Only `.JSON` export, table/care-log windowing, and open-dialog PWA update deferral in `App.tsx`.',
    ],
  },
  {
    id: 'IMP-020',
    title: 'Mobile Background Freeze Pause/Resume, Double-Submit Guards & Async Error Toast',
    category: 'stability-pwa',
    source: 'session',
    summary:
      'Cooperatively pauses & checkpoints active Folder Sync / idle vault tasks on mobile background freeze (`visibilityState === "hidden"`), auto-resumes clean pauses on foreground return while keeping severity/permission faults sticky, adds bounded `sessionStorage` emergency crash traces (`pedigree_emergency_trace_v1`) + deduplicated `AsyncErrorToastHost` notifications for uncaught rejections/persistence errors, serializes `useBarnStore` mutations via a FIFO write queue (`enqueueStoreMutation`), and enforces synchronous `ref` + React submit locks (`useAsyncSubmitLock`, `useAsyncKeyedLock`) across primary forms, sync actions, and inline toggles.',
    userIntent:
      'Prevent mid-batch IndexedDB corruption on iOS/Android background freeze, stop rapid-tap duplicate submits while holding unsaved form notes on write failures, and surface gentle non-blocking recovery toasts for uncaught async errors.',
    files: [
      'src/storage/backgroundFreezeCoordinator.ts',
      'src/storage/crashLogger.ts',
      'src/storage/localSyncChannels.ts',
      'src/utils/useAsyncSubmitLock.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/AsyncErrorToastHost.tsx',
      'src/components/AnimalEditorModal.tsx',
      'src/components/BreedingScreen.tsx',
      'src/components/HerdScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/components/SpeciesEditorModal.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/components/DiagnosticsAndSupportPanel.tsx',
      'src/App.tsx',
      'src/utils/__tests__/asyncSubmitLock.test.ts',
      'src/storage/__tests__/backgroundFreezeAndToast.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/storage/backgroundFreezeCoordinator.ts',
        requiredSubstrings: [
          'BackgroundPausedError',
          'notifyBackgroundTransition',
          'registerPausedBackgroundJob',
          'registerFreezeLifecycleListener',
        ],
        rationale:
          'Single-source background freeze coordinator must manage cooperative pauses, auto-resume clean tasks, and hold severity tasks until acknowledged.',
      },
      {
        filePath: 'src/storage/crashLogger.ts',
        requiredSubstrings: [
          'EMERGENCY_SESSION_TRACE_KEY',
          'emitAsyncErrorToast',
          'handleUnhandledRejectionReason',
          'notifyBackgroundTransition',
        ],
        rationale:
          'Uncaught rejections and QuotaExceeded writes must fall back to bounded sessionStorage emergency traces and emit deduplicated non-blocking error toasts.',
      },
      {
        filePath: 'src/storage/localSyncChannels.ts',
        requiredSubstrings: [
          'withSyncIdb',
          'sync_checkpoints',
          'BackgroundPausedError',
          'resumePersistedDirectorySyncIfGranted',
        ],
        rationale:
          'Folder Sync must close IDB handles deterministically on abort, checkpoint progress on hide, and support foreground resume.',
      },
      {
        filePath: 'src/utils/useAsyncSubmitLock.ts',
        requiredSubstrings: [
          'createAsyncLockController',
          'createAsyncKeyedLockController',
          'useAsyncSubmitLock',
          'useAsyncKeyedLock',
        ],
        rationale:
          'Synchronous ref-based double-submit locks must gate same-frame double taps and always unlock in finally.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: [
          'enqueueStoreMutation',
          'registerFreezeLifecycleListener',
          'emitAsyncErrorToast',
        ],
        rationale:
          'Store mutations must run sequentially without interleaving outbox/SQLite writes and surface storage errors without dropping typed form inputs.',
      },
      {
        filePath: 'src/components/AsyncErrorToastHost.tsx',
        requiredSubstrings: ['subscribeAsyncErrorToasts', 'subscribePausedBackgroundJobs', 'Tap to Resume'],
        rationale:
          'Global non-blocking toast stack must render auto-dismissing minor notices, sticky error alerts, and severity-only Tap to Resume controls.',
      },
      {
        filePath: 'src/components/AnimalEditorModal.tsx',
        requiredSubstrings: ['useAsyncSubmitLock'],
        rationale: 'Animal editor modal Save/Delete actions must prevent rapid double-tap duplicate animals.',
      },
      {
        filePath: 'src/components/BreedingScreen.tsx',
        requiredSubstrings: ['breedingSubmitLock', 'outcomeSubmitLock'],
        rationale: 'Breeding Log and Outcome forms must block rapid double-submits and hold entered fields on storage error.',
      },
      {
        filePath: 'src/components/HerdScreen.tsx',
        requiredSubstrings: ['careLogSubmitLock', 'inlineAnimalLock'],
        rationale: 'Care log form and inline quick animal actions must prevent duplicate writes cleanly.',
      },
      {
        filePath: 'src/components/SpeciesDashboardScreen.tsx',
        requiredSubstrings: ['taskSubmitLock', 'taskToggleLock'],
        rationale: 'Species hub chore/cage/show forms and silent per-row chore toggles must prevent rapid double-tap races.',
      },
    ],
    restorePlaybook: [
      'Restore `src/storage/backgroundFreezeCoordinator.ts` and hook `notifyBackgroundTransition` inside `src/storage/crashLogger.ts`.',
      'Preserve `writeEmergencySessionTraceSync`, `emitAsyncErrorToast`, and `handleUnhandledRejectionReason` in `src/storage/crashLogger.ts` and mount `<AsyncErrorToastHost />` in `src/App.tsx`.',
      'Keep `withSyncIdb`, `sync_checkpoints` (IDB v3), `BackgroundPausedError`, and `resumePersistedDirectorySyncIfGranted` in `src/storage/localSyncChannels.ts` wired into `SettingsAndSyncScreen.tsx`.',
      'Keep `enqueueStoreMutation` + boolean/id Promise returns in `src/hooks/useBarnStore.ts` and `useAsyncSubmitLock` / `useAsyncKeyedLock` guards in `App.tsx`, `AnimalEditorModal.tsx`, `BreedingScreen.tsx`, `HerdScreen.tsx`, `SpeciesDashboardScreen.tsx`, `SpeciesEditorModal.tsx`, `SettingsAndSyncScreen.tsx`, and `DiagnosticsAndSupportPanel.tsx`.',
    ],
  },
  {
    id: 'IMP-021',
    title: 'ARIA Combobox Navigation, Reports/Settings Shortcuts, Focus Polish & rAF Observer Optimization',
    category: 'stability-pwa',
    source: 'session',
    summary:
      'Adds full WAI-ARIA keyboard navigation (`stepEnabledComboboxIndex`, `aria-activedescendant`, `ArrowDown`/`ArrowUp`/`Home`/`End`/`Enter`/`Escape`, `scrollIntoView`, and blur boundary closing) across `CarrierTraitCombobox`, `SearchableParentPicker`, and `ExternalImporterPanel`; adds `O` (Reports) and `S` (Import & Settings) global shortcuts with IME/widget guards and synchronized help panels; restores visible focus rings and pedigree focus scrolling; coalesces `App.tsx` modal `MutationObserver` via `requestAnimationFrame`; and aligns `buildPdfReadyBarnSnapshot` carrier disclosures.',
    userIntent:
      'Restore and strengthen keyboard shortcuts, tab stops, ARIA combobox navigation, and focus indicators while cleaning up minor export and DOM observer inefficiencies.',
    files: [
      'src/utils/comboboxNav.ts',
      'src/utils/__tests__/comboboxNav.test.ts',
      'src/components/CarrierTraitCombobox.tsx',
      'src/components/SearchableParentPicker.tsx',
      'src/components/ExternalImporterPanel.tsx',
      'src/App.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/components/HomeSpeciesScreen.tsx',
      'src/components/AnimalPhotoGallery.tsx',
      'src/components/PedigreeScreen.tsx',
      'src/components/HerdScreen.tsx',
      'src/components/SpeciesMemoScreen.tsx',
      'src/core/syncAndExports.ts',
    ],
    invariants: [
      {
        filePath: 'src/utils/comboboxNav.ts',
        requiredSubstrings: ['clampComboboxIndex', 'stepEnabledComboboxIndex'],
        rationale: 'Pure combobox index-stepping helper powers keyboard traversal across all custom listboxes.',
      },
      {
        filePath: 'src/components/CarrierTraitCombobox.tsx',
        requiredSubstrings: ['aria-activedescendant', 'stepEnabledComboboxIndex'],
        rationale: 'Carrier trait combobox must expose aria-activedescendant and full keyboard navigation.',
      },
      {
        filePath: 'src/components/SearchableParentPicker.tsx',
        requiredSubstrings: ['aria-activedescendant', 'stepEnabledComboboxIndex'],
        rationale: 'Searchable parent picker must expose aria-activedescendant and full keyboard navigation.',
      },
      {
        filePath: 'src/components/ExternalImporterPanel.tsx',
        requiredSubstrings: ['aria-activedescendant', 'stepEnabledComboboxIndex', 'speciesOptionRefs'],
        rationale: 'Default species combobox must support keyboard traversal and close on focus blur.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: [
          'requestAnimationFrame',
          "o: { route: 'reports', label: 'Reports' }",
          "i: { route: 'importExport', label: 'Import / Export Hub' }",
          "s: { route: 'settings', label: 'Settings' }",
          'e.isComposing',
        ],
        rationale: 'Root shell coalesces MutationObserver work via rAF and guards O/I/S/H/D/R/B/P/? shortcuts cleanly.',
      },
      {
        filePath: 'src/core/syncAndExports.ts',
        requiredSubstrings: ['includeCleared: true,\n          includeLineage: true'],
        rationale: 'PDF snapshot DTO exports must include cleared and ancestral lineage carrier disclosures.',
      },
    ],
    restorePlaybook: [
      'Keep `src/utils/comboboxNav.ts` wired into `CarrierTraitCombobox.tsx`, `SearchableParentPicker.tsx`, and `ExternalImporterPanel.tsx` with `aria-activedescendant` and `onBlur`.',
      'Keep rAF-coalesced `MutationObserver`, IME/widget guards, and `O`/`S` shortcuts in `src/App.tsx` synced with `SettingsAndSyncScreen.tsx`.',
      'Preserve `focus-visible` outlines (`HomeSpeciesScreen.tsx`, `PedigreeScreen.tsx`, `AnimalPhotoGallery.tsx`), `WeightTrendSvg` ARIA labels (`HerdScreen.tsx`), `aria-pressed` (`SpeciesMemoScreen.tsx`), and `buildPdfReadyBarnSnapshot` carrier options (`syncAndExports.ts`).',
    ],
  },
  {
    id: 'IMP-022',
    title: 'Virtualized Pedigree Branch Loading, PWA Update Governor, Offline Probe & Upgrade Gate',
    category: 'stability-pwa',
    source: 'session',
    summary:
      'Bounds collapsed 4–6 generation pedigree chart DOM to Gen 0–3 (15 slots max) via lazy per-branch Gen 4+ expansion (`buildPedigreeBranchViewport`) while preserving full-depth `.HTM`/Barn Binder printouts; decouples PWA updates from raw `navigator.onLine` using `auto`/`notify`/`pinned` policy governance, a Manual App Offline toggle, and a timed `AbortController` captive-portal connectivity probe; and serves uncached `version.json`/`status.json` manifests with pre-upgrade SHA-256 backup verification and Safe-Harbor reset gates.',
    userIntent:
      'Keep pedigree SVG/DOM light on mobile devices, prevent unwanted or revoked app-shell reloads during active barn sessions, separate app offline holding from device Airplane Mode, and require verified backups on multi-version schema jumps.',
    files: [
      'src/core/pedigreeCalculator.ts',
      'src/core/upgradeGate.ts',
      'src/core/backupVault.ts',
      'src/components/PedigreeScreen.tsx',
      'src/storage/pwaUpdateManager.ts',
      'src/storage/storageProtection.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/App.tsx',
      'public/version.json',
      'public/status.json',
      'vite.config.ts',
      'src/core/__tests__/upgradeGate.test.ts',
      'src/core/__tests__/pedigreeCalculator.test.ts',
      'src/storage/__tests__/es2018AndPwaUpdate.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/core/pedigreeCalculator.ts',
        requiredSubstrings: ['buildPedigreeBranchViewport', 'getGen3BranchesWithKnownAncestors'],
        rationale: 'Pure branch viewport helper keeps initial 4–6 gen DOM compact while preserving full-depth export slots.',
      },
      {
        filePath: 'src/components/PedigreeScreen.tsx',
        requiredSubstrings: ['expandedGen3Branches', 'buildPedigreeBranchViewport'],
        rationale: 'Interactive pedigree chart must lazy-expand Gen 4+ branches on demand without losing focus or keyboard access.',
      },
      {
        filePath: 'src/core/upgradeGate.ts',
        requiredSubstrings: ['evaluateUpgradeGate', 'parseVersionManifestJson', 'parseStatusManifestJson'],
        rationale: 'Pure pre-flight Upgrade Gate evaluates revoked builds, paused updates, Safe-Harbor schema floors, and schemaDelta>=2 backup gates.',
      },
      {
        filePath: 'src/core/backupVault.ts',
        requiredSubstrings: ['buildVerifiedPreUpgradeJsonBackup', 'verifyPreUpgradeJsonBackup'],
        rationale: 'Pre-upgrade safety backups must emit _schemaVersion-stamped envelopes and verify SHA-256 round-trip integrity.',
      },
      {
        filePath: 'src/storage/pwaUpdateManager.ts',
        requiredSubstrings: ['pedigree_pwa_update_policy_v1', 'fetchUpgradeGateDecision'],
        rationale: 'PWA updater enforces persisted auto/notify/pinned policies and uncached Upgrade Gate checks before posting SKIP_WAITING.',
      },
      {
        filePath: 'src/storage/storageProtection.ts',
        requiredSubstrings: ['pedigree_manual_offline_v1', 'probeNetworkConnectivity'],
        rationale: 'Connectivity governor combines Manual App Offline Mode with a timed AbortController captive-portal probe.',
      },
      {
        filePath: 'public/version.json',
        requiredSubstrings: ['minDirectUpgradeSchema'],
        rationale: 'Release version manifest must expose current appVersion, schemaVersion, and minDirectUpgradeSchema floor.',
      },
      {
        filePath: 'public/status.json',
        requiredSubstrings: ['revokedVersions'],
        rationale: 'Remote killswitch manifest must expose allowUpdates and revokedVersions lists.',
      },
      {
        filePath: 'vite.config.ts',
        requiredSubstrings: ['navigateFallbackDenylist: [/^\\/api\\//, /\\/version\\.json$/, /\\/status\\.json$/]'],
        rationale: 'Service worker navigation fallback must never intercept or precache uncached version.json / status.json manifests on root or subpaths.',
      },
    ],
    restorePlaybook: [
      'Keep `buildPedigreeBranchViewport`, `getGen3BranchIndex`, and `getGen3BranchesWithKnownAncestors` in `src/core/pedigreeCalculator.ts` wired into `PedigreeScreen.tsx`.',
      'Preserve `src/core/upgradeGate.ts`, `buildVerifiedPreUpgradeJsonBackup` / `verifyPreUpgradeJsonBackup` in `src/core/backupVault.ts`, and uncached `public/version.json` & `public/status.json` with `no-store` middleware + Workbox denylist in `vite.config.ts`.',
      'Keep `PwaUpdatePolicy` (`auto` / `notify` / `pinned`) + `fetchUpgradeGateDecision` in `src/storage/pwaUpdateManager.ts`, `setManualOfflineMode` + `probeNetworkConnectivity` in `src/storage/storageProtection.ts`, and UI controls in `App.tsx`, `useBarnStore.ts`, and `SettingsAndSyncScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-023',
    title: 'Storage Pruning, Pre-Restore Archive Inspector, Clock-Skew Compensation, Monotonic _rev & Encrypted Backups',
    category: 'backup-safety',
    source: 'session',
    summary:
      'Adds a Diagnostics Photo Storage & Orphan Attachment Pruner (`photoMaintenance.ts`, `reoptimizeAnimalPhotoRecord`), an off-thread Pre-Restore Archive Inspector dry-run for `.ZIP`/`.JSON`/`.SQLITE` (`archiveInspector.ts`, `inspectRawSqliteBytes`), persistent HTTP `Date` clock-skew compensation (`recordServerDateHeaderSkew`, `getAdjustedNowIsoUtc`) with a non-blocking drift banner, per-record monotonic `_rev` counters (`compareSameEntitySyncOperations`, `bumpRecordRevision`) paired with deterministic `[a-v0-9]` Google Calendar IDs + `409` `PUT` updates, and optional PBKDF2-SHA256 + AES-256-GCM passphrase encryption for shared backups and SyncThing deltas (`encryptedExport.ts`, `passphraseCrypto.ts`) while keeping plain 1-click exports as the default.',
    userIntent:
      'Prevent runaway photo quota growth, inspect backups for species/conflicts before committing restores, protect multi-device sync order against wrong or rewound clocks, avoid duplicate Google Calendar events, and offer opt-in passphrase encryption for shared archives/sync folders.',
    files: [
      'src/core/photoMaintenance.ts',
      'src/core/archiveInspector.ts',
      'src/core/encryptedExport.ts',
      'src/core/syncOutbox.ts',
      'src/core/calendarExport.ts',
      'src/core/models.ts',
      'src/core/inputSanitization.ts',
      'src/storage/passphraseCrypto.ts',
      'src/storage/storageProtection.ts',
      'src/storage/localSyncChannels.ts',
      'src/storage/offThreadWorkerClient.ts',
      'src/storage/archiveAndImport.worker.ts',
      'src/storage/webImageOptimizer.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/utils/googleCalendarClient.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/DiagnosticsAndSupportPanel.tsx',
      'src/components/ImportExportHubScreen.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/App.tsx',
      'src/core/__tests__/stageBResilience.test.ts',
      'src/storage/__tests__/passphraseAndClockSkew.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/core/photoMaintenance.ts',
        requiredSubstrings: [
          'analyzePhotoStorageFootprintPure',
          'removeOrphanPhotosFromSnapshotPure',
          'pruneFullResPayloadsFromSnapshotPure',
        ],
        rationale: 'Pure photo storage footprint analyzer, orphan cleaner, and thumbnail compactor must stay DOM-free.',
      },
      {
        filePath: 'src/core/archiveInspector.ts',
        requiredSubstrings: [
          'inspectSnapshotBeforeRestorePure',
          'inspectParsedArchiveBeforeRestorePure',
        ],
        rationale: 'Dry-run pre-restore inspector summarizes species, conflicts, and replace/merge impact before DB writes.',
      },
      {
        filePath: 'src/core/encryptedExport.ts',
        requiredSubstrings: [
          'ENCRYPTED_ENVELOPE_FORMAT',
          'wrapEncryptedZipContainer',
          'tryExtractEncryptedEnvelopeFromZip',
        ],
        rationale: 'Pure encrypted envelope framing and ZIP wrapper/extractor must remain intact.',
      },
      {
        filePath: 'src/storage/passphraseCrypto.ts',
        requiredSubstrings: ['encryptBytesWithPassphrase', 'decryptBytesWithPassphrase'],
        rationale: 'Client-side PBKDF2-SHA256 + AES-256-GCM encryption runs strictly with memory-only passphrases.',
      },
      {
        filePath: 'src/storage/storageProtection.ts',
        requiredSubstrings: [
          'recordServerDateHeaderSkew',
          'getAdjustedNowIsoUtc',
          'clockDriftWarning',
        ],
        rationale: 'Server Date skew capture compensates timestamps and flags drift >= 5 minutes cleanly.',
      },
      {
        filePath: 'src/core/syncOutbox.ts',
        requiredSubstrings: ['compareSameEntitySyncOperations', 'bumpRecordRevision'],
        rationale: 'Monotonic record_rev ensures newer same-entity edits win even when a device clock rewinds.',
      },
      {
        filePath: 'src/core/calendarExport.ts',
        requiredSubstrings: ['buildDeterministicGoogleCalendarEventId'],
        rationale: 'Deterministic [a-v0-9] Google Calendar IDs prevent duplicate calendar events on retry/sync.',
      },
      {
        filePath: 'src/utils/googleCalendarClient.ts',
        requiredSubstrings: ['res.status === 409'],
        rationale: 'Google Calendar push must update existing events via PUT when deterministic ID returns HTTP 409.',
      },
      {
        filePath: 'src/components/ImportExportHubScreen.tsx',
        requiredSubstrings: ['pendingRestoreInspection', 'encryptBackupExport'],
        rationale: 'Import/Export Hub must require Pre-Restore Inspector confirmation and expose opt-in backup/sync encryption.',
      },
      {
        filePath: 'src/components/DiagnosticsAndSupportPanel.tsx',
        requiredSubstrings: ['onAnalyzePhotoFootprint', 'onPruneOrphanPhotos'],
        rationale: 'Diagnostics exposes Photo Storage & Orphan Attachment Pruner actions safely.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: ['connectivity.clockDriftWarning'],
        rationale: 'Root shell renders non-blocking Clock Drift Nudge Banner when drift reaches threshold.',
      },
    ],
    restorePlaybook: [
      'Keep pure modules `src/core/photoMaintenance.ts`, `src/core/archiveInspector.ts`, `src/core/encryptedExport.ts`, `_rev` logic in `src/core/syncOutbox.ts`, and `buildDeterministicGoogleCalendarEventId` in `src/core/calendarExport.ts`.',
      'Keep `src/storage/passphraseCrypto.ts`, clock-skew compensation in `src/storage/storageProtection.ts`, encrypted delta/directory sync in `src/storage/localSyncChannels.ts`, off-thread inspection in `src/storage/offThreadWorkerClient.ts`, and `inspectRawSqliteBytes` in `src/storage/webSqliteAdapter.ts`.',
      'Keep Stage B store handlers in `src/hooks/useBarnStore.ts`, `409` PUT retry in `src/utils/googleCalendarClient.ts`, and UI mounts in `DiagnosticsAndSupportPanel.tsx`, `ImportExportHubScreen.tsx`, and `App.tsx`.',
    ],
  },
  {
    id: 'IMP-024',
    title: 'Active Medication Withdrawal Countdown & Livestock Safety Alerts',
    category: 'alerts-home',
    source: 'session',
    summary:
      'Surfaces active CareLog medication withdrawal periods (`withdrawalClearDateIso` / `dateIso + withdrawalDays`, cleared on the clear date itself) via an O(L) withdrawal map across Home species cards (session-closable), Herd roster rows, single-animal profiles, and Withdrawal filter/sort controls, and triggers non-blocking soft confirmation warnings before saving Sold/Culled dispositions or Show entries whose event date overlaps withdrawal.',
    userIntent:
      'Surface active care-log withdrawal periods on Herd cards and Home alerts and trigger soft confirmation warnings before marking an animal under active withdrawal for sale, meat/cull processing, or show exhibition.',
    files: [
      'src/core/barnAlerts.ts',
      'src/core/__tests__/barnAlerts.test.ts',
      'src/components/HomeSpeciesScreen.tsx',
      'src/components/HerdScreen.tsx',
      'src/components/AnimalEditorModal.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/App.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/barnAlerts.ts',
        requiredSubstrings: [
          'buildWithdrawalByAnimalMap',
          'evaluateSpeciesActiveWithdrawalsAlert',
          'evaluateWithdrawalDispositionWarning',
          'evaluateShowWithdrawalConflicts',
        ],
        rationale:
          'Pure withdrawal countdown evaluator and safety conflict helpers must remain intact and DOM-free.',
      },
      {
        filePath: 'src/components/HomeSpeciesScreen.tsx',
        requiredSubstrings: [
          'evaluateSpeciesActiveWithdrawalsAlert',
          'onDismissWithdrawalAlert',
        ],
        rationale: 'Home species cards must surface closable session-scoped withdrawal safety alerts.',
      },
      {
        filePath: 'src/components/HerdScreen.tsx',
        requiredSubstrings: ['buildWithdrawalByAnimalMap', 'withdrawal_soonest', 'Withdrawal ('],
        rationale:
          'HerdScreen must display active withdrawal countdowns, filter tab, sort, and profile alert banner.',
      },
      {
        filePath: 'src/components/AnimalEditorModal.tsx',
        requiredSubstrings: ['evaluateWithdrawalDispositionWarning', 'pendingWithdrawalWarning'],
        rationale:
          'AnimalEditorModal must require soft confirmation before saving Sold or Flagged-for-Cull stock under active withdrawal.',
      },
      {
        filePath: 'src/components/SpeciesDashboardScreen.tsx',
        requiredSubstrings: ['evaluateShowWithdrawalConflicts', 'pendingShowWithdrawalWarning'],
        rationale:
          'Show entry form must warn when selected animals have medication withdrawals overlapping eventDateIso.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: ['dismissedWithdrawalSpecies', 'requestedHerdWithdrawalNonce'],
        rationale: 'Root shell tracks session-scoped Home withdrawal dismissal and Herd filter navigation.',
      },
    ],
    restorePlaybook: [
      'Keep pure withdrawal functions (`buildWithdrawalByAnimalMap`, `evaluateAnimalActiveWithdrawal`, `evaluateSpeciesActiveWithdrawalsAlert`, `evaluateWithdrawalDispositionWarning`, `evaluateShowWithdrawalConflicts`) in `src/core/barnAlerts.ts`.',
      'Keep session-scoped `dismissedWithdrawalSpecies` in `src/App.tsx` wired to `HomeSpeciesScreen.tsx` and `HerdScreen.tsx`.',
      'Keep Herd withdrawal filter/sort/countdown badges in `HerdScreen.tsx` passing `animalCareLogs` into `AnimalEditorModal.tsx`, and keep show-date overlap checks in `SpeciesDashboardScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-025',
    title: 'Sync Outbox Alignment, Metadata-Only Photo Sync & Reset State Cleanup',
    category: 'diagnostics-sync',
    source: 'session',
    summary:
      'Queues metadata-only photo operations (stripping image blobs so large photos travel exclusively via .ZIP backups) and full cross-species migration snapshot diffs with bumped `_rev` counters into the delta outbox, hydrates missing blobs onto metadata-only photo placeholders during .ZIP/.JSON merges without clobbering newer edits, guards UI galleries against empty image URLs, and wipes `sync_outbox`, `sync_conflicts`, `sync_checkpoints`, plus backup reminder keys (`pedigree.lastBackupMeta.v1`, `pedigree.backupReminderSnoozedUntil.v1`) on factory resets and full Replace restores.',
    userIntent:
      'Align Folder/Delta Sync outbox mutations for photo actions and cross-species migrations while guaranteeing stale P2P sync queues, conflict logs, and backup reminders never leak across factory resets or full Replace restores.',
    files: [
      'src/core/syncOutbox.ts',
      'src/core/speciesMigration.ts',
      'src/core/backupArchive.ts',
      'src/core/syncAndExports.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/AnimalPhotoGallery.tsx',
      'src/components/HerdScreen.tsx',
      'src/core/__tests__/stageBResilience.test.ts',
      'src/storage/__tests__/crossTabLockAndReload.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/core/syncOutbox.ts',
        requiredSubstrings: ['stripPhotoBlobsForSync', 'diffSnapshotsToSyncOperations'],
        rationale:
          'Sync outbox must strip binary blobs on photo creates and support snapshot diffing for bulk migrations.',
      },
      {
        filePath: 'src/core/speciesMigration.ts',
        requiredSubstrings: ['bumpRecordRevision'],
        rationale:
          'Cross-species migration must advance `_rev` counters on every migrated or created record.',
      },
      {
        filePath: 'src/core/backupArchive.ts',
        requiredSubstrings: ['existingHasBlob', 'incHasBlob'],
        rationale:
          'Photos-Only ZIP merge must hydrate blobs onto metadata-only photo placeholders without overwriting newer metadata.',
      },
      {
        filePath: 'src/core/syncAndExports.ts',
        requiredSubstrings: ['mergeAnimalPhotosWithBlobPreservation'],
        rationale:
          'Barn snapshot merges must rehydrate blobs onto metadata-only photos without losing existing local blobs.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: [
          'clearLocalSyncAndBackupReminderState',
          'clearAllSyncStateInIdb',
          'stripPhotoBlobsForSync',
          'diffSnapshotsToSyncOperations',
        ],
        rationale:
          'Store must clear sync/backup-reminder state on resets/replaces and enqueue metadata-only photo & migration outbox ops.',
      },
      {
        filePath: 'src/components/AnimalPhotoGallery.tsx',
        requiredSubstrings: ['p.thumbnailDataUrl || p.dataUrl'],
        rationale:
          'Photo gallery must avoid rendering broken <img src=""> tags for metadata-only synced photo placeholders.',
      },
    ],
    restorePlaybook: [
      'Keep `stripPhotoBlobsForSync`, `diffSnapshotsToSyncOperations`, and metadata-only `photo` `__create__` handling in `src/core/syncOutbox.ts`.',
      'Keep `bumpRecordRevision` calls in `src/core/speciesMigration.ts` and blob-preserving merge helpers in `src/core/backupArchive.ts` and `src/core/syncAndExports.ts`.',
      'Keep `clearLocalSyncAndBackupReminderState` wired across resets and Replace restores plus metadata-only photo/migration outbox emissions in `src/hooks/useBarnStore.ts`, and keep empty-src placeholders in `AnimalPhotoGallery.tsx` and `HerdScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-026',
    title: 'Clock-Skew Consistency & Archive Export Double-Tap Locks',
    category: 'backup-safety',
    source: 'session',
    summary:
      'Aligns upgrade-gate HTTP Date skew capture (`recordServerDateHeaderSkew`), core `nowEpochMs()` fallback defaults, and Settings folder/background pause timestamps (`getAdjustedNowMs()`) when device clocks drift, and guards all 4 backup/archive exports (`handleDownloadTimestampedFullBackup`, `handleDownloadDatabaseOnlyBackup`, `handleDownloadCompleteZip`, `handleDownloadPhotosOnlyZip`) plus heavy-ZIP caution and reset backup buttons with synchronous `archiveExportLock` (`useAsyncSubmitLock`).',
    userIntent:
      'Enforce clock-skew compensation consistently across upgrade checks and Settings timestamps while eliminating the <16ms double-tap race on heavy archive and backup exports.',
    files: [
      'src/core/upgradeGate.ts',
      'src/storage/pwaUpdateManager.ts',
      'src/components/ImportExportHubScreen.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/storage/__tests__/passphraseAndClockSkew.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/core/upgradeGate.ts',
        requiredSubstrings: ['nowEpochMs', 'computeHttpDateClockSkewMs'],
        rationale: 'Upgrade-gate HTTP Date skew calculation must default to clock-skew-aware nowEpochMs().',
      },
      {
        filePath: 'src/storage/pwaUpdateManager.ts',
        requiredSubstrings: ['recordServerDateHeaderSkew', 'getAdjustedNowIsoUtc'],
        rationale: 'Version/status manifest checks must propagate HTTP Date skew and record adjusted timestamps.',
      },
      {
        filePath: 'src/components/ImportExportHubScreen.tsx',
        requiredSubstrings: ['archiveExportLock', 'getAdjustedNowMs', 'archiveExportLock.runLocked'],
        rationale: 'Archive/backup exports must lock synchronously against double-tap and record skew-adjusted pause timestamps.',
      },
      {
        filePath: 'src/components/SettingsAndSyncScreen.tsx',
        requiredSubstrings: ['archiveExportLock', 'archiveExportLock.runLocked'],
        rationale: 'Pre-reset full JSON backup in Settings must lock synchronously against double-tap.',
      },
    ],
    restorePlaybook: [
      'Keep `nowEpochMs` default inside `computeHttpDateClockSkewMs` in `src/core/upgradeGate.ts`.',
      'Keep `recordServerDateHeaderSkew` and `getAdjustedNowIsoUtc` in `src/storage/pwaUpdateManager.ts`.',
      'Keep `archiveExportLock = useAsyncSubmitLock()` wrapping all 4 export handlers in `src/components/ImportExportHubScreen.tsx` and the pre-reset backup handler in `src/components/SettingsAndSyncScreen.tsx`, plus `getAdjustedNowMs()` for `pausedAtMs`.',
    ],
  },
  {
    id: 'IMP-027',
    title: 'True Lazy 2–3 Gen SQLite/OPFS Pedigree Fetching & ES2018 Windowed List Virtualization',
    category: 'stability-pwa',
    source: 'session',
    summary:
      'Keeps initial interactive pedigree charts bounded to Gen 0–3 while probing and lazily fetching Gen 4+ and OPFS `/archives` offloaded ancestors on branch expand or pre-print hydration via cycle-safe SQLite BFS (`queryPedigreeNeighborhood`, `queryPedigreeBranchAncestorsExist`) and a 256-entry LRU ancestor cache (`pedigreeAncestorCacheRef`); and replaces unbounded/static-slice lists in `BreedingScreen`, `HerdScreen`, and `ReportsScreen` with a zero-dependency ES2018 scroll window virtualizer (`useVirtualWindow`).',
    userIntent:
      'Reduce mobile RAM and DOM overhead by fetching Gen 4+ / archived pedigree ancestors lazily from SQLite/OPFS and virtualizing large Breeding, Herd, and Reports lists.',
    files: [
      'src/utils/useVirtualWindow.ts',
      'src/utils/__tests__/virtualWindow.test.ts',
      'src/storage/storageAdapter.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/storage/__tests__/pedigreeLazyFetch.test.ts',
      'src/core/pedigreeCalculator.ts',
      'src/core/__tests__/pedigreeCalculator.test.ts',
      'src/hooks/useBarnStore.ts',
      'src/App.tsx',
      'src/components/PedigreeScreen.tsx',
      'src/components/BreedingScreen.tsx',
      'src/components/HerdScreen.tsx',
      'src/components/ReportsScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/utils/useVirtualWindow.ts',
        requiredSubstrings: ['computeVirtualWindow', 'useVirtualWindow', 'ResizeObserver'],
        rationale: 'Zero-dependency ES2018 scroll virtualizer must remain intact with guarded ResizeObserver cleanup.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: ['queryPedigreeNeighborhood', 'queryPedigreeBranchAncestorsExist', 'mapAnimalRow'],
        rationale: 'SQLite adapter must provide cycle-safe bounded BFS pedigree queries and lightweight branch-existence probes.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: ['loadPedigreeNeighborhood', 'checkPedigreeBranchesHaveAncestors', 'pedigreeAncestorCacheRef'],
        rationale: 'Barn store must cache lazily fetched SQLite/OPFS pedigree ancestors in a bounded LRU map.',
      },
      {
        filePath: 'src/core/pedigreeCalculator.ts',
        requiredSubstrings: ['hasKnownAncestors', 'externalKnownBranches'],
        rationale: 'Branch summaries must surface externally detected Gen 4+ ancestors before full depth is loaded in RAM.',
      },
      {
        filePath: 'src/components/PedigreeScreen.tsx',
        requiredSubstrings: ['gen0To3BaseMap', 'fetchAndMergeBranchAncestors', 'handleOpenPrintModal'],
        rationale: 'Pedigree screen must scope initial tree to Gen 0–3 and hydrate Gen 4+ on branch expand or print.',
      },
      {
        filePath: 'src/components/BreedingScreen.tsx',
        requiredSubstrings: ['useVirtualWindow', 'breedingVirtual', 'ledgerStatusFilter'],
        rationale: 'Breeding & litter ledger must filter and virtualize large pairing histories cleanly.',
      },
      {
        filePath: 'src/components/HerdScreen.tsx',
        requiredSubstrings: ['useVirtualWindow', 'herdVirtual', 'HERD_PAGE_SIZE'],
        rationale: 'Herd roster list must virtualize rows via useVirtualWindow with HERD_PAGE_SIZE pre-layout fallback.',
      },
      {
        filePath: 'src/components/ReportsScreen.tsx',
        requiredSubstrings: ['useVirtualWindow', 'reportVirtual', 'windowedRows'],
        rationale: 'Reports table must virtualize displayed rows while exporting full filtered sets to CSV and Print.',
      },
    ],
    restorePlaybook: [
      'Keep `src/utils/useVirtualWindow.ts` and `queryPedigreeNeighborhood` / `queryPedigreeBranchAncestorsExist` in `src/storage/webSqliteAdapter.ts`.',
      'Keep `loadPedigreeNeighborhood`, `checkPedigreeBranchesHaveAncestors`, and `pedigreeAncestorCacheRef` in `src/hooks/useBarnStore.ts` wired through `src/App.tsx` to `src/components/PedigreeScreen.tsx`.',
      'Keep `useVirtualWindow` integration in `BreedingScreen.tsx`, `HerdScreen.tsx`, and `ReportsScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-028',
    title: 'Cage / Pen Capacity Warnings & Quick Occupant Assignment',
    category: 'species-ux',
    source: 'session',
    summary:
      'Compares active, junior, and unarchived/non-offloaded retired occupants per species against `CageLocation.capacity` via pure single-pass evaluators (`evaluateCageOccupancy`, `evaluateSpeciesCagesOccupancy`, `evaluateCageAssignmentCapacityWarning`), surfaces over-capacity welfare alerts on `HomeSpeciesScreen` and `SpeciesDashboardScreen` and in printed Barn Binder housing tables (`barnBinder.ts`), adds inline cage capacity/section editing and 1-click quick occupant assignment/unassignment (`assignAnimalToCage`) on Cages & Pens cards, and displays soft confirmation warnings in both Quick Assign and `AnimalEditorModal` before exceeding capacity.',
    userIntent:
      'Compare current animal occupants against CageLocation.capacity (e.g., 3/2 over capacity), allow one-click occupant assignment from housing cards, and warn before exceeding capacity.',
    files: [
      'src/core/barnAlerts.ts',
      'src/core/barnBinder.ts',
      'src/core/__tests__/barnAlerts.test.ts',
      'src/hooks/useBarnStore.ts',
      'src/App.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/components/AnimalEditorModal.tsx',
      'src/components/HomeSpeciesScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/barnAlerts.ts',
        requiredSubstrings: [
          'isCageOccupyingAnimal',
          'evaluateCageOccupancy',
          'evaluateSpeciesCagesOccupancy',
          'evaluateCageAssignmentCapacityWarning',
        ],
        rationale:
          'Pure occupancy counting and capacity warning evaluation must remain in pure TS core with species isolation.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: ['assignAnimalToCage'],
        rationale:
          'Store must expose queued FIFO assignAnimalToCage mutation updating _rev and syncOutbox.',
      },
      {
        filePath: 'src/components/SpeciesDashboardScreen.tsx',
        requiredSubstrings: [
          'cagesOccupancySummary',
          'handleQuickAssignSelect',
          'pendingCageAssignConfirm',
          'onAssignAnimalToCage',
        ],
        rationale:
          'Cages & Pens cards must show occupancy ratios, quick occupant assignment/unassignment, inline edit, and over-capacity alerts.',
      },
      {
        filePath: 'src/components/AnimalEditorModal.tsx',
        requiredSubstrings: [
          'liveCageCapacityWarning',
          'pendingCapacityWarning',
          'checkCapacityThenSave',
        ],
        rationale:
          'Animal editor must display live cage occupancy feedback and soft confirmation before saving an over-capacity assignment.',
      },
      {
        filePath: 'src/components/HomeSpeciesScreen.tsx',
        requiredSubstrings: ['evaluateSpeciesCagesOccupancy', 'shouldShowOverCapacityAlert'],
        rationale:
          'Home species cards must surface an actionable alert when any species cage exceeds capacity.',
      },
      {
        filePath: 'src/core/barnBinder.ts',
        requiredSubstrings: ['(over capacity)'],
        rationale:
          'Printable Barn Binder cage table must show occupancy/capacity ratios and over-capacity markers.',
      },
    ],
    restorePlaybook: [
      'Keep pure cage occupancy & assignment warning evaluators in `src/core/barnAlerts.ts` and tests in `src/core/__tests__/barnAlerts.test.ts`.',
      'Keep `assignAnimalToCage` in `src/hooks/useBarnStore.ts` passed to `<SpeciesDashboardScreen onAssignAnimalToCage={store.assignAnimalToCage} />` in `src/App.tsx`.',
      'Keep live ratio displays, over-capacity alerts, quick assign/unassign, and soft capacity confirmations in `SpeciesDashboardScreen.tsx`, `AnimalEditorModal.tsx`, `HomeSpeciesScreen.tsx`, and `barnBinder.ts`.',
    ],
  },
  {
    id: 'IMP-029',
    title:
      'Breeding Lab & Master Task List Refinements (Post-Birth Recalculation, Quick Checkoffs & Breed Overrides)',
    category: 'species-ux',
    source: 'session',
    userIntent:
      'Recalculate post-birth tasks to the actual birth date when births arrive early or late, support one-click Palpation/Birth Check checkoffs with automatic Missed task cleanup, and allow optional per-breed gestation/weaning/milestone overrides.',
    summary:
      'Adds BreedScheduleOverride support (with case-insensitive dam-first, sire-fallback resolution via resolveEffectiveSpeciesProfileForBreeding and SQLite/sync/JSON preservation), adds pure post-birth task evaluation & recalculation (evaluateStalePostBirthTasksForBreeding, recalculatePostBirthTasksForBreeding) plus pending Missed cleanup (getPendingBreedingCleanupTasks) in taskMaster.ts, exposes recalculateBreedingPostBirthTasks & completeBreedingTaskWithOutcome in useBarnStore.ts, and adds UI controls in SpeciesEditorModal, BreedingScreen, and SpeciesDashboardScreen.',
    files: [
      'src/core/models.ts',
      'src/core/taskMaster.ts',
      'src/core/__tests__/taskMaster.test.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/core/syncAndExports.ts',
      'src/core/syncOutbox.ts',
      'src/hooks/useBarnStore.ts',
      'src/App.tsx',
      'src/components/SpeciesEditorModal.tsx',
      'src/components/BreedingScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/models.ts',
        requiredSubstrings: [
          'BreedScheduleOverride',
          'normalizeBreedScheduleOverrides',
          'breedOverrides',
        ],
        rationale:
          'SpeciesProfile must carry optional BreedScheduleOverride entries normalized deterministically in pure TypeScript.',
      },
      {
        filePath: 'src/core/taskMaster.ts',
        requiredSubstrings: [
          'resolveEffectiveSpeciesProfileForBreeding',
          'recalculatePostBirthTasksForBreeding',
          'getPendingBreedingCleanupTasks',
          'isPalpationTask',
          'isBirthCheckTask',
        ],
        rationale:
          'Breed override resolution, AFTER_BIRTH task date recalculation, and Missed breeding task cleanup helpers must remain pure and reusable.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: ['breed_overrides_json'],
        rationale:
          'SQLite schema and migrations must persist species breedOverrides across reloads.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: [
          'recalculateBreedingPostBirthTasks',
          'completeBreedingTaskWithOutcome',
        ],
        rationale:
          'Store must expose queued FIFO mutations for post-birth task recalculation and one-click breeding task outcome checkoffs with cleanup.',
      },
      {
        filePath: 'src/components/SpeciesEditorModal.tsx',
        requiredSubstrings: [
          'Per-Breed Schedule Overrides',
          'handleSaveBreedOverride',
        ],
        rationale:
          'Species Editor must allow configuring optional per-breed gestation, weaning, rebreed, maturity, and milestone day overrides.',
      },
      {
        filePath: 'src/components/BreedingScreen.tsx',
        requiredSubstrings: [
          'onRecalculatePostBirthTasks',
          'outcomeStalePostBirth',
          'outcomeMissedCleanupCount',
        ],
        rationale:
          'Breeding Lab must resolve breed overrides in previews, offer one-tap post-birth chore shifting, and surface automatic Missed cleanup notice.',
      },
      {
        filePath: 'src/components/SpeciesDashboardScreen.tsx',
        requiredSubstrings: [
          'onCompleteBreedingTask',
          'isPalpationTask',
          'isBirthCheckTask',
        ],
        rationale:
          'Species Hub task list must support one-click Palpation & Birth Check checkoffs and inline post-birth chore shifting on active pairings.',
      },
    ],
    restorePlaybook: [
      'Keep BreedScheduleOverride & normalizeBreedScheduleOverrides in `src/core/models.ts` and pure helpers in `src/core/taskMaster.ts` with tests in `src/core/__tests__/taskMaster.test.ts`.',
      'Keep `breed_overrides_json` persisted in `src/storage/webSqliteAdapter.ts` and normalized in `src/core/syncAndExports.ts` and `src/core/syncOutbox.ts`.',
      'Keep `recalculateBreedingPostBirthTasks` and `completeBreedingTaskWithOutcome` in `src/hooks/useBarnStore.ts` wired through `src/App.tsx` to `SpeciesDashboardScreen.tsx`, `BreedingScreen.tsx`, and `SpeciesEditorModal.tsx`.',
    ],
  },
  {
    id: 'IMP-030',
    title: 'Consolidated Import/Export Hub & Extensible Non-Native Exporter Registry',
    category: 'backup-safety',
    source: 'session',
    userIntent:
      'Consolidate all backup, native restore, multi-worker sync, external importer, and non-native exporter tools into a clean 3-section Import/Export Hub page integrated into navigation and Settings.',
    summary:
      'Adds a pure TypeScript extensible non-native exporter registry (`exporterTypes.ts`, `registry.ts`) supporting `.CSV`, Evans `.HTM`, Printable Barn Binder `.HTM`, Normalized Report DTO `.JSON`, and `.ICS` calendar tasks plus future external schema slots; introduces `ImportExportHubScreen` structured cleanly into System Backup, Imports (Native System Imports first followed by External Format Importers), and Exporters; wires `' +
      "'importExport'" +
      '` into `useBarnStore.ts`, `App.tsx` (desktop/mobile nav + `I` shortcut + backup banner routing), `SpeciesDashboardScreen.tsx`, `HomeSpeciesScreen.tsx`, and `SettingsAndSyncScreen.tsx`.',
    files: [
      'src/core/exporters/exporterTypes.ts',
      'src/core/exporters/registry.ts',
      'src/core/__tests__/exportersRegistry.test.ts',
      'src/components/ImportExportHubScreen.tsx',
      'src/hooks/useBarnStore.ts',
      'src/App.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/components/HomeSpeciesScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/exporters/exporterTypes.ts',
        requiredSubstrings: ['ExternalExporterDescriptor', 'ExportedArtifactPayload'],
        rationale: 'Pure TypeScript exporter interface contracts must remain DOM-free for cross-platform reuse.',
      },
      {
        filePath: 'src/core/exporters/registry.ts',
        requiredSubstrings: [
          'BUILTIN_NON_NATIVE_EXPORTERS',
          'PLANNED_EXTERNAL_SCHEMA_TARGETS',
          'buildExporterCatalog',
          'runExternalExporter',
        ],
        rationale: 'Non-native exporter catalog must keep built-in formats and extensible registry hooks intact.',
      },
      {
        filePath: 'src/components/ImportExportHubScreen.tsx',
        requiredSubstrings: [
          'ImportExportHubScreen',
          'ExternalImporterPanel',
          'UnifiedBackupVaultPanel',
          'BUILTIN_NON_NATIVE_EXPORTERS',
        ],
        rationale: 'Hub screen must organize System Backup, Native & External Imports, and Exporters cleanly.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: ["| 'importExport'"],
        rationale: 'WorkspaceRoute union must include importExport.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: ['ImportExportHubScreen', 'openImportExportHub'],
        rationale: 'Root shell must route, lazy-load, and link banners/shortcuts cleanly to ImportExportHubScreen.',
      },
      {
        filePath: 'src/components/SettingsAndSyncScreen.tsx',
        requiredSubstrings: ['onOpenImportExportHub'],
        rationale: 'Settings must link cleanly into all sections of the Import/Export Hub without duplicating forms.',
      },
    ],
    restorePlaybook: [
      'Restore `src/core/exporters/exporterTypes.ts`, `src/core/exporters/registry.ts`, and `src/core/__tests__/exportersRegistry.test.ts`.',
      'Restore `src/components/ImportExportHubScreen.tsx` and keep `importExport` inside `WorkspaceRoute` in `src/hooks/useBarnStore.ts`.',
      'Keep `ImportExportHubScreen` routing, `I` shortcut, navigation buttons, and Settings/Home/Species Hub links wired across `App.tsx`, `SettingsAndSyncScreen.tsx`, `SpeciesDashboardScreen.tsx`, and `HomeSpeciesScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-031',
    title: 'Interactive CSV Column Mapper, Starter Template & Unlinked Parent Preview',
    category: 'species-ux',
    source: 'session',
    userIntent:
      'Provide a one-click Starter CSV Template download, interactive column-mapping preview for spreadsheets, and pre-import highlighting for unresolved Sire/Dam links on non-HerdBoss CSV imports.',
    summary:
      'Adds pure TS Starter CSV Template generation (`csvStarterTemplate.ts`), unified column alias & override resolution (`csvColumnMapper.ts`), two-pass out-of-order CSV parent linking with unresolved Sire/Dam pre-import tracking in `universalPedigreeImporter.ts`, and interactive UI controls in `ExternalImporterPanel.tsx`.',
    files: [
      'src/core/importers/importerTypes.ts',
      'src/core/importers/csvStarterTemplate.ts',
      'src/core/importers/csvColumnMapper.ts',
      'src/core/importers/universalPedigreeImporter.ts',
      'src/components/ExternalImporterPanel.tsx',
      'src/core/__tests__/resilienceAndUniversalImport.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/core/importers/csvStarterTemplate.ts',
        requiredSubstrings: ['buildStarterCsvTemplate', 'STARTER_CSV_TEMPLATE_HEADERS'],
        rationale: 'Pure TS starter CSV template generator must remain DOM-free with standard pedigree headers.',
      },
      {
        filePath: 'src/core/importers/csvColumnMapper.ts',
        requiredSubstrings: ['CSV_TARGET_FIELD_OPTIONS', 'resolveCsvColumnAssignments', 'makeCsvColumnOverrideKey'],
        rationale: 'Pure TS column mapper must resolve aliases, sample cells, and user overrides cleanly.',
      },
      {
        filePath: 'src/core/importers/universalPedigreeImporter.ts',
        requiredSubstrings: ['resolveCsvColumnAssignments', 'unresolvedParentLinks', 'csvTables'],
        rationale: 'Universal importer must perform two-pass parent resolution and surface column mapping & unresolved Sire/Dam links.',
      },
      {
        filePath: 'src/components/ExternalImporterPanel.tsx',
        requiredSubstrings: [
          'Download Starter CSV Template',
          'handleCsvColumnSelectionChange',
          'unresolvedParentLinks',
        ],
        rationale: 'External importer UI must expose template download, interactive column mapping, and unresolved parent link warnings.',
      },
    ],
    restorePlaybook: [
      'Restore `src/core/importers/csvStarterTemplate.ts` and `src/core/importers/csvColumnMapper.ts` and keep `CsvTableMappingSummary`/`UnresolvedParentLink` in `src/core/importers/importerTypes.ts`.',
      'Keep two-pass CSV resolution and `csvColumnMapping`/`unresolvedParentLinks` wiring in `src/core/importers/universalPedigreeImporter.ts`.',
      'Keep the Starter CSV Template download button, column-mapping region, and unresolved Sire/Dam highlight card in `src/components/ExternalImporterPanel.tsx`.',
    ],
  },
  {
    id: 'IMP-032',
    title: 'Low-RAM Export Streaming & Full OPFS /tmp Staging',
    category: 'backup-safety',
    source: 'session',
    userIntent:
      'Route all printable/shareable exports (including <512 KB .HTM pedigrees and cage cards) through OPFS /tmp with immediate post-use cleanup, and stream large .ZIP and .JSON backup chunks incrementally into OPFS /tmp without materializing monolithic JS heap buffers.',
    summary:
      'Adds worker-safe `opfsTempStream.ts` (`writeTempOpfsFileStreamed`) and chunked `writeTempOpfsFile`; stages all `downloadTextFile`, `downloadBinaryFile`, `shareTextFileOrDownload`, and `shareBinaryFileOrDownload` exports through OPFS `/tmp` with immediate cleanup in `webFileActions.ts`; streams `.JSON` backup chunks via `generateBarnBackupJsonChunks` (`syncAndExports.ts`); streams `.ZIP` archives one photo and one binder at a time via `streamCompleteBackupZipArchive` & `streamPhotosOnlyZipArchive` (`backupArchive.ts`); and wires worker/UI/store callers cleanly.',
    files: [
      'src/storage/opfsTempStream.ts',
      'src/storage/opfsStorage.ts',
      'src/core/syncAndExports.ts',
      'src/core/backupArchive.ts',
      'src/utils/webFileActions.ts',
      'src/storage/archiveAndImport.worker.ts',
      'src/storage/offThreadWorkerClient.ts',
      'src/components/ImportExportHubScreen.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/hooks/useBarnStore.ts',
      'src/storage/__tests__/opfsStorage.test.ts',
      'src/storage/__tests__/photoHydrationAndWorker.test.ts',
      'src/core/__tests__/syncAndExports.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/storage/opfsTempStream.ts',
        requiredSubstrings: [
          'writeTempOpfsFileStreamed',
          'writeTempOpfsFile',
          'purgeOpfsTmp',
          'readTempOpfsFileAsBlob',
        ],
        rationale: 'Worker-safe OPFS /tmp chunk streamer must remain free of React/DOM imports and close writables in try/finally.',
      },
      {
        filePath: 'src/core/syncAndExports.ts',
        requiredSubstrings: ['generateBarnBackupJsonChunks'],
        rationale: 'Pure TypeScript backup JSON chunk generator prevents allocating monolithic strings for photo-heavy backups.',
      },
      {
        filePath: 'src/core/backupArchive.ts',
        requiredSubstrings: ['streamCompleteBackupZipArchive', 'streamPhotosOnlyZipArchive'],
        rationale: 'Streaming fflate Zip/ZipPassThrough/ZipDeflate builders decode and flush one entry at a time incrementally.',
      },
      {
        filePath: 'src/utils/webFileActions.ts',
        requiredSubstrings: [
          'downloadTextChunks',
          'downloadTempOpfsExport',
          'stagePayloadInOpfsTmp',
        ],
        rationale: 'All printable, shareable, and streamed browser exports stage via OPFS /tmp when supported and clean up deterministically.',
      },
      {
        filePath: 'src/storage/offThreadWorkerClient.ts',
        requiredSubstrings: [
          'buildCompleteBackupZipToOpfsTmpOffThread',
          'buildPhotosOnlyZipToOpfsTmpOffThread',
        ],
        rationale: 'Off-thread worker bridge streams ZIP chunks straight to OPFS /tmp and falls back gracefully without Worker or OPFS.',
      },
    ],
    restorePlaybook: [
      'Keep `src/storage/opfsTempStream.ts` free of React/DOM imports and delegated from `src/storage/opfsStorage.ts` and `src/storage/archiveAndImport.worker.ts`.',
      'Keep `generateBarnBackupJsonChunks` in `src/core/syncAndExports.ts` and `streamCompleteBackupZipArchive` / `streamPhotosOnlyZipArchive` in `src/core/backupArchive.ts`.',
      'Keep full OPFS `/tmp` staging + `downloadTextChunks` / `downloadTempOpfsExport` in `src/utils/webFileActions.ts`, wired through `offThreadWorkerClient.ts`, `ImportExportHubScreen.tsx`, `SettingsAndSyncScreen.tsx`, and `useBarnStore.ts`.',
    ],
  },
  {
    id: 'IMP-033',
    title: '"The Techy Stuff" Developer & Troubleshooting Screen, Permanent Tier Hierarchy & Production Guardrails',
    category: 'diagnostics-sync',
    source: 'session',
    userIntent:
      'Relocate advanced, non-routine operational controls out of Settings into a dedicated lazy-loaded "The Techy Stuff" developer screen with a permanent non-closeable Tier/Memory Hierarchy block, isolated error boundary, OPFS/IDB quota pre-flight checks, strict input sanitization, and multi-step destructive safeguards.',
    summary:
      'Introduces lazy-loaded `TechyStuffScreen` wrapped in an isolated `TechyStuffErrorBoundary`; relocates Storage Protection, Connectivity Governor, App Update Policy & Release Gate, `DiagnosticsAndSupportPanel`, and Destructive Reset Lab controls out of `SettingsAndSyncScreen` while preserving original `DeviceCapabilityCard` & Home hierarchy banners intact; embeds a permanent, non-closeable copy of the 5-tier Device Tier & Memory Hierarchy guidelines (`data-permanent-tier-hierarchy="true"`); and enforces pure TS validation/sanitization & OPFS/IDB quota pre-flight checks (`techyStuffGuardrails.ts`, `verifyStorageQuotaForDiagnosticAction`) plus multi-step armed phrase safeguards.',
    files: [
      'src/core/techyStuffGuardrails.ts',
      'src/core/__tests__/techyStuffGuardrails.test.ts',
      'src/storage/storageProtection.ts',
      'src/components/TechyStuffErrorBoundary.tsx',
      'src/components/TechyStuffScreen.tsx',
      'src/components/DiagnosticsAndSupportPanel.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/hooks/useBarnStore.ts',
      'src/App.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/techyStuffGuardrails.ts',
        requiredSubstrings: [
          'evaluateStorageQuotaForOperation',
          'validateDiagnosticTriggerInput',
          'validateSupportRecipientEmail',
          'DESTRUCTIVE_CONFIRM_PHRASES',
          'isDestructiveActionConfirmationValid',
        ],
        rationale:
          'Pure TS developer guardrails module must stay DOM-free and enforce quota evaluations, strict input validation/sanitization, and confirmation phrases.',
      },
      {
        filePath: 'src/storage/storageProtection.ts',
        requiredSubstrings: ['verifyStorageQuotaForDiagnosticAction'],
        rationale:
          'Browser storage adapter must execute OPFS + IndexedDB quota pre-flight checks and log low-headroom diagnostics.',
      },
      {
        filePath: 'src/components/TechyStuffErrorBoundary.tsx',
        requiredSubstrings: ['TechyStuffErrorBoundary', 'recordReactCrash'],
        rationale:
          'Developer & Troubleshooting screen must stay isolated in a dedicated Error Boundary so faulty diagnostics cannot crash herd/breeding views.',
      },
      {
        filePath: 'src/components/TechyStuffScreen.tsx',
        requiredSubstrings: [
          'TechyStuffScreen',
          'data-permanent-tier-hierarchy="true"',
          'DEVICE_CAPABILITY_TIER_LIST',
          'destructiveArmed',
        ],
        rationale:
          'The Techy Stuff screen must include a permanent non-closeable Tier/Memory Hierarchy block and multi-step armed safeguards for destructive actions.',
      },
      {
        filePath: 'src/components/SettingsAndSyncScreen.tsx',
        requiredSubstrings: ['onOpenTechyStuff', 'DeviceCapabilityCard'],
        rationale:
          'Settings must link cleanly to The Techy Stuff while keeping routine barn preferences and original DeviceCapabilityCard intact.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: ['TechyStuffScreen', 'TechyStuffErrorBoundary', "route === 'techyStuff'"],
        rationale:
          'Root shell must lazy-load TechyStuffScreen inside Suspense + TechyStuffErrorBoundary.',
      },
    ],
    restorePlaybook: [
      'Restore `src/core/techyStuffGuardrails.ts` and `verifyStorageQuotaForDiagnosticAction` in `src/storage/storageProtection.ts`.',
      'Restore `src/components/TechyStuffErrorBoundary.tsx` and `src/components/TechyStuffScreen.tsx` with its permanent `data-permanent-tier-hierarchy="true"` section and `destructiveArmed` phrase gates.',
      'Keep `techyStuff` in `WorkspaceRoute` (`useBarnStore.ts`), `SettingsAndSyncScreen.tsx` launcher (`onOpenTechyStuff`), and lazy boundary mount in `src/App.tsx`.',
    ],
  },
  {
    id: 'IMP-034',
    title: '"Barn Bench" Fast Sequential Batch Entry Mode',
    category: 'species-ux',
    source: 'session',
    summary:
      'Adds a tap-friendly, strictly species-isolated Barn Bench sequential chore sheet filtered by barn row/section, herd status, and search text; supports rapid cage-by-cage logging of weights (in species unit), 1-tap BCS presets, nail trims, cage moves with live capacity warnings, and notes with auto-advance, transactional batch care-log writes (`saveCareLogsBatch`), and field-level sync outbox recording.',
    userIntent:
      'Let breeders walk down a cage row logging weights, body condition scores, nail trims, or cage moves rapidly with auto-advance and minimal modal switching.',
    files: [
      'src/core/barnBench.ts',
      'src/core/__tests__/barnBench.test.ts',
      'src/storage/storageAdapter.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/BarnBenchScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/components/HerdScreen.tsx',
      'src/App.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/barnBench.ts',
        requiredSubstrings: [
          'extractSpeciesCageSections',
          'buildBarnBenchQueue',
          'buildBarnBenchCommitPlan',
          'findNextBarnBenchIndex',
          'BARN_BENCH_BCS_PRESETS',
        ],
        rationale:
          'Pure TS Barn Bench queue builder, commit planner, and auto-advance selector must remain DOM-free and species-isolated.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: ['saveCareLogsBatch'],
        rationale:
          'Transactional batch CareLog persistence prevents multi-flush overhead when logging combined bench entries.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: ["| 'bench'", 'commitBarnBenchEntry', 'buildBarnBenchCommitPlan'],
        rationale:
          'Store must expose the bench route and queued atomic commitBarnBenchEntry action with outbox sync ops.',
      },
      {
        filePath: 'src/components/BarnBenchScreen.tsx',
        requiredSubstrings: [
          'BarnBenchScreen',
          'evaluateCageAssignmentCapacityWarning',
          'useAsyncSubmitLock',
          'findNextBarnBenchIndex',
        ],
        rationale:
          'Barn Bench screen must guard async commits against double-taps, check cage capacity on moves, and auto-advance cleanly.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: ['BarnBenchScreen', "route === 'bench'", "k: { route: 'bench'"],
        rationale:
          'Root shell must lazy-load BarnBenchScreen under route === bench with keyboard shortcut K.',
      },
    ],
    restorePlaybook: [
      'Restore `src/core/barnBench.ts` and `src/core/__tests__/barnBench.test.ts`.',
      'Keep `saveCareLogsBatch` on `StorageAdapter` and `WebSqliteAdapter` and `commitBarnBenchEntry` + `bench` route in `src/hooks/useBarnStore.ts`.',
      'Keep lazy `BarnBenchScreen` mounted in `src/App.tsx` with `K` shortcut and launchers in `SpeciesDashboardScreen.tsx` and `HerdScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-035',
    title: 'Batch Cage Card, Compact Mini-Sheet & Pedigree Printing from Herd Multi-Select',
    category: 'species-ux',
    source: 'session',
    summary:
      'Allows breeders to multi-select animals in `HerdScreen` and generate a single printable `.HTM` / Print-to-PDF sheet across four formats: 8-up kennel/cage cards, 1/4-page (4-up) mini 3-gen pedigree sheets, 3-generation 4x6 photo cards (2-up Letter or direct 4x6 paper), and stacked formal 3–6G pedigrees, backed by pure TS HTML generation (`batchPrint.ts`), bounded on-demand batch photo hydration (`loadAnimalPhotoDataUrlsBatch`), and live layout/option controls in `PrintPreviewModal`.',
    userIntent:
      'Print cage cards, 4-up mini pedigrees, 4x6 photo cards, or stacked pedigrees for multiple selected animals in one pass for shows, auctions, or transport.',
    files: [
      'src/core/batchPrint.ts',
      'src/core/__tests__/batchPrint.test.ts',
      'src/hooks/useBarnStore.ts',
      'src/App.tsx',
      'src/components/PrintPreviewModal.tsx',
      'src/components/HerdScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/batchPrint.ts',
        requiredSubstrings: [
          'BATCH_PRINT_LAYOUTS',
          'generateBatchPrintHtml',
          'resolveBatchPrintAnimals',
          'computeBatchPrintPageCount',
          'buildBatchPrintFileName',
        ],
        rationale:
          'Pure TS batch print engine must remain DOM-free and support cage cards, 4-up mini sheets, 4x6 photo cards, and stacked pedigrees.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: ['loadAnimalPhotoDataUrlsBatch'],
        rationale:
          'Store must expose bounded on-demand batch photo hydration without retaining full-res images in reactive snapshot RAM.',
      },
      {
        filePath: 'src/components/PrintPreviewModal.tsx',
        requiredSubstrings: [
          'batchPrintOptions',
          'onChangeBatchPrintOptions',
          'BATCH_PRINT_LAYOUTS',
        ],
        rationale:
          'Print preview modal must render live layout switcher and batch print options toolbar.',
      },
      {
        filePath: 'src/components/HerdScreen.tsx',
        requiredSubstrings: [
          'openBatchPrintPreview',
          'generateBatchPrintHtml',
          'resolveBatchPrintAnimals',
          'Batch Print (',
        ],
        rationale:
          'HerdScreen multi-select bulk bar must launch batch print previews and clean up hydrated photos on close.',
      },
    ],
    restorePlaybook: [
      'Restore `src/core/batchPrint.ts` and `src/core/__tests__/batchPrint.test.ts`.',
      'Keep `loadAnimalPhotoDataUrlsBatch` exported from `src/hooks/useBarnStore.ts` and passed as `onLoadFullPhotosBatch` to `HerdScreen` in `src/App.tsx`.',
      'Keep `batchPrintOptions` controls in `src/components/PrintPreviewModal.tsx` and multi-select `Batch Print` wiring in `src/components/HerdScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-036',
    title: 'QR-Coded Cage Cards & Visual Hutch-Row / Facility Pen Board',
    category: 'species-ux',
    source: 'session',
    userIntent:
      'Embed scannable QR codes on printable cage cards that open the animal profile route directly in the PWA, and provide a visual Hutch-by-Hutch / Cage Row & Pasture Board grouping pens by barn section with linked feedlot inventories and recurring maintenance reminders.',
    summary:
      'Adds a zero-dependency pure TS ISO/IEC 18004 QR code encoder and single-path SVG renderer (`qrCode.ts`), embeds toggleable scannable QR profile deep links into both thermal single cage cards (`generateThermalCageCardHtml`) and 8-up batch cage cards (`batchPrint.ts`), parses `?route=herd&animalId=...` and `?route=dashboard&cageId=...` on startup in `useBarnStore.ts`, extends `CageLocation` and SQLite/JSON serialization with housing unit type, feedlot inventory, and recurring maintenance schedules, and adds the pure `facilityBoard.ts` engine plus interactive `FacilityPenBoard` inside `SpeciesDashboardScreen` (with compact list toggle, full-screen board modal, quick stock adjustments, 1-click maintenance logging/task scheduling, and pen/row QR card printing).',
    files: [
      'src/core/qrCode.ts',
      'src/core/facilityBoard.ts',
      'src/core/models.ts',
      'src/core/batchPrint.ts',
      'src/core/syncAndExports.ts',
      'src/core/__tests__/qrCode.test.ts',
      'src/core/__tests__/facilityBoard.test.ts',
      'src/core/__tests__/batchPrint.test.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/FacilityPenBoard.tsx',
      'src/components/PrintPreviewModal.tsx',
      'src/components/HerdScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/App.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/qrCode.ts',
        requiredSubstrings: [
          'encodeQrMatrix',
          'renderQrSvg',
          'buildAnimalProfileDeepLink',
          'buildCageBoardDeepLink',
          'parseAppDeepLinkParams',
        ],
        rationale:
          'Pure TS offline QR encoder, vector SVG renderer, and deep-link helpers must remain zero-DOM and self-contained.',
      },
      {
        filePath: 'src/core/facilityBoard.ts',
        requiredSubstrings: [
          'buildFacilityBoardModel',
          'evaluateCageMaintenanceStatus',
          'evaluateCageFeedStatus',
          'buildCageMaintenanceTaskDraft',
          'matchesFacilityBoardFilter',
        ],
        rationale:
          'Pure TS facility board grouping, feedlot rollups, and UTC calendar maintenance evaluators must remain DOM-free.',
      },
      {
        filePath: 'src/core/batchPrint.ts',
        requiredSubstrings: ['includeQrCodes', 'supportsQrCode', 'buildAnimalProfileDeepLink'],
        rationale:
          '8-up batch cage cards must support scannable QR profile codes via includeQrCodes.',
      },
      {
        filePath: 'src/core/syncAndExports.ts',
        requiredSubstrings: ['ThermalCageCardOptions', 'buildAnimalProfileDeepLink', 'renderQrSvg'],
        rationale:
          'Single thermal cage cards must embed optional QR profile deep links and backup JSON must preserve extended CageLocation metadata.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: [
          'feed_lot_name',
          'maintenance_interval_days',
          'last_maintenance_date_iso',
        ],
        rationale:
          'SQLite cages table and idempotent migrations must persist housing type, feedlot inventory, and maintenance schedule columns.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: ['parseAppDeepLinkParams', 'highlightedCageId', 'setHighlightedCageId'],
        rationale:
          'Store startup deep-link handler must resolve scanned QR animalId and cageId routes cleanly.',
      },
      {
        filePath: 'src/components/FacilityPenBoard.tsx',
        requiredSubstrings: [
          'FacilityPenBoard',
          'buildCageMaintenanceTaskDraft',
          'onPrintCageCardsForAnimals',
        ],
        rationale:
          'Visual Hutch-Row & Pasture Board must display grouped pens, feedlot controls, maintenance checkoffs, and QR cage card printing.',
      },
      {
        filePath: 'src/components/SpeciesDashboardScreen.tsx',
        requiredSubstrings: [
          'FacilityPenBoard',
          'facilityBoardModel',
          'handlePrintCageCardsForAnimals',
          'highlightedCageId',
        ],
        rationale:
          'Species dashboard Cages & Pens block must mount FacilityPenBoard alongside compact list view, full-screen board modal, and QR card print preview.',
      },
    ],
    restorePlaybook: [
      'Restore `src/core/qrCode.ts`, `src/core/facilityBoard.ts`, and their tests in `src/core/__tests__/qrCode.test.ts` and `src/core/__tests__/facilityBoard.test.ts`.',
      'Keep extended `CageLocation` fields in `src/core/models.ts`, SQLite columns/migrations in `src/storage/webSqliteAdapter.ts`, and JSON round-trip parsing in `src/core/syncAndExports.ts`.',
      'Keep QR code rendering in `src/core/syncAndExports.ts` (`generateThermalCageCardHtml`) and `src/core/batchPrint.ts` (`includeQrCodes`) wired to `PrintPreviewModal.tsx`, `HerdScreen.tsx`, and `SpeciesDashboardScreen.tsx`.',
      'Keep `FacilityPenBoard.tsx` mounted in `SpeciesDashboardScreen.tsx` and `highlightedCageId` deep-link resolution in `useBarnStore.ts` and `src/App.tsx`.',
    ],
  },
  {
    id: 'IMP-037',
    title: 'Side-by-Side Multi-Candidate Pairing Comparison Matrix (Breeding Lab)',
    category: 'species-ux',
    source: 'session',
    summary:
      'Adds a pure TypeScript multi-candidate pairing matrix engine (`pairingMatrix.ts`) and interactive `PairingComparisonMatrix` table inside `BreedingScreen` so breeders can compare one Dam against multiple candidate Sires (or one Sire against multiple candidate Dams) side by side for projected Wright COI %, shared bottleneck ancestors, carrier and genetic health/lethal risk flags, and predicted coat varieties, with 1-click loading into the Cage-Side Pairing Logger.',
    userIntent:
      'Compare one dam against multiple candidate sires (or vice versa) in a single Breeding Lab table showing COI %, shared bottleneck ancestors, carrier risk flags, and predicted coat varieties side by side.',
    files: [
      'src/core/pairingMatrix.ts',
      'src/core/__tests__/pairingMatrix.test.ts',
      'src/components/PairingComparisonMatrix.tsx',
      'src/components/BreedingScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/pairingMatrix.ts',
        requiredSubstrings: [
          'buildPairingComparisonMatrix',
          'selectDefaultMatrixCandidateIds',
          'createSpeciesCoiEvaluator',
          'analyzePairingCarrierRisksFromAnalyses',
          'simulatePairingGenetics',
        ],
        rationale:
          'Pure TS multi-candidate comparison matrix must share one species COI evaluator, run carrier lineage + Punnett simulations, and remain zero-DOM.',
      },
      {
        filePath: 'src/components/PairingComparisonMatrix.tsx',
        requiredSubstrings: [
          'PairingComparisonMatrix',
          'buildPairingComparisonMatrix',
          'ColorGeneticsNotice',
          'onLoadPairingInLogger',
        ],
        rationale:
          'Breeding Lab comparison matrix UI must render anchor/candidate selectors, sort/filter controls, coat genetics notice, and Load in Logger wiring.',
      },
      {
        filePath: 'src/components/BreedingScreen.tsx',
        requiredSubstrings: ['PairingComparisonMatrix', 'handleLoadPairingFromMatrix'],
        rationale:
          'BreedingScreen must mount PairingComparisonMatrix and connect Load in Logger to the Cage-Side Pairing Logger.',
      },
    ],
    restorePlaybook: [
      'Restore `src/core/pairingMatrix.ts` and its unit tests in `src/core/__tests__/pairingMatrix.test.ts`.',
      'Restore `src/components/PairingComparisonMatrix.tsx` with anchor role toggle, candidate multi-select, COI/bottleneck/carrier/variety columns, and `ColorGeneticsNotice`.',
      'Mount `<PairingComparisonMatrix />` and `handleLoadPairingFromMatrix` inside `src/components/BreedingScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-038',
    title: 'Color-Coded Allele Provenance, Unique-Ancestor Dimming & ARBA Registration Flags',
    category: 'species-ux',
    source: 'session',
    summary:
      'Adds a pure TypeScript allele provenance classifier (`analyzeAlleleProvenance` in `geneticsEngine.ts`) and pedigree convergence + ARBA 3-generation registration evaluator (`pedigreeAnalysis.ts`), a reusable color-coded genotype renderer (`ColoredGenotypeDisplay.tsx`), Dim Unique convergence spotlighting and red ARBA registration deficiency overlays on `PedigreeScreen`, and provenance displays with legend across `HerdScreen` and `BreedingScreen`.',
    userIntent:
      'Color-code alleles by inheritance provenance (sire vs. dam vs. offspring vs. manual), dim unique non-convergent ancestors on pedigree trees to highlight linebred convergence, and flag Gen 0–3 pedigree nodes in red when missing ARBA registration fields would block registration.',
    files: [
      'src/core/geneticsEngine.ts',
      'src/core/pedigreeAnalysis.ts',
      'src/core/__tests__/pedigreeAnalysis.test.ts',
      'src/components/ColoredGenotypeDisplay.tsx',
      'src/components/PedigreeScreen.tsx',
      'src/components/HerdScreen.tsx',
      'src/components/BreedingScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/geneticsEngine.ts',
        requiredSubstrings: [
          'analyzeAlleleProvenance',
          'AlleleProvenanceSource',
          'AnimalAlleleProvenanceResult',
        ],
        rationale:
          'Pure TS allele provenance classifier must support Mendelian elimination, offspring inference, X-linked loci, and custom species isolation without DOM dependencies.',
      },
      {
        filePath: 'src/core/pedigreeAnalysis.ts',
        requiredSubstrings: [
          'isArbaRegistrationSpecies',
          'evaluateAnimalArbaRegistration',
          'analyzePedigreeTree',
        ],
        rationale:
          'Pure TS pedigree convergence and ARBA registration evaluator must scope ARBA rules to Rabbit/Cavy Gen 0–3 nodes and remain zero-DOM.',
      },
      {
        filePath: 'src/components/ColoredGenotypeDisplay.tsx',
        requiredSubstrings: ['ColoredGenotypeDisplay', 'AlleleProvenanceLegend'],
        rationale:
          'Reusable provenance renderer must style Sire, Dam, Offspring, Manual, and Unverified alleles with accessible labels and legend.',
      },
      {
        filePath: 'src/components/PedigreeScreen.tsx',
        requiredSubstrings: [
          'analyzePedigreeTree',
          'analyzeAlleleProvenance',
          'dimUniqueAncestors',
          'showRegistrationFlags',
          'ColoredGenotypeDisplay',
        ],
        rationale:
          'PedigreeScreen must wire Dim Unique convergence spotlighting, ARBA registration flags, and color-coded node alleles.',
      },
      {
        filePath: 'src/components/HerdScreen.tsx',
        requiredSubstrings: ['analyzeAlleleProvenance', 'ColoredGenotypeDisplay'],
        rationale:
          'HerdScreen Genetics & Allele Inference card must display color-coded allele provenance and uncommitted inference previews.',
      },
      {
        filePath: 'src/components/BreedingScreen.tsx',
        requiredSubstrings: [
          'analyzeAlleleProvenance',
          'ColoredGenotypeDisplay',
          'AlleleProvenanceLegend',
        ],
        rationale:
          'BreedingScreen Coat Color Punnett panel must display color-coded Sire/Dam allele provenance alongside locus pair highlights.',
      },
    ],
    restorePlaybook: [
      'Keep `analyzeAlleleProvenance` in `src/core/geneticsEngine.ts` and `src/core/pedigreeAnalysis.ts` with unit tests in `src/core/__tests__/pedigreeAnalysis.test.ts`.',
      'Restore `src/components/ColoredGenotypeDisplay.tsx` (`ColoredGenotypeDisplay` + `AlleleProvenanceLegend`).',
      'Keep Dim Unique, ARBA Reg Flags, and provenance wiring in `PedigreeScreen.tsx`, `HerdScreen.tsx`, and `BreedingScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-039',
    title: 'Pedigree Print Orientation Toggle, Optional Breeder Logo, ARBA lbs.oz Notation & Direct Offline PDF Export',
    category: 'species-ux',
    source: 'session',
    summary:
      'Adds Landscape/Portrait 8.5"x11" print orientation, optional barn/rabbitry raster logo header upload (`BarnSettings.breederLogoDataUrl`), ARBA `lbs.oz` dot weight notation (`formatWeightArbaLbsOzDot`, e.g., `10.04`), and a zero-dependency pure TypeScript 100% offline PDF 1.4 binary generator (`buildPedigreePdfBytes` in `pdfExporter.ts` + `webPdfActions.ts`) with direct Download .PDF in `PrintPreviewModal`.',
    userIntent:
      'Allow breeders to switch ARBA pedigrees between Landscape and Portrait 8.5"x11", attach a rabbitry/barn logo in the header, toggle ARBA lbs.oz decimal dot weights, and download a .PDF file directly 100% offline.',
    files: [
      'src/core/models.ts',
      'src/core/syncAndExports.ts',
      'src/core/pdfExporter.ts',
      'src/core/__tests__/pdfExporter.test.ts',
      'src/utils/webPdfActions.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/components/PrintPreviewModal.tsx',
      'src/components/PedigreeScreen.tsx',
      'src/components/HerdScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/models.ts',
        requiredSubstrings: [
          'breederLogoDataUrl',
          'formatWeightArbaLbsOzDot',
          'formatPedigreeWeight',
        ],
        rationale:
          'BarnSettings must persist optional breederLogoDataUrl and models.ts must expose pure ARBA lbs.oz dot notation formatters.',
      },
      {
        filePath: 'src/core/syncAndExports.ts',
        requiredSubstrings: [
          'PedigreePrintOrientation',
          'arbaLbsOzDotNotation',
          'showBreederLogo',
          'barn-logo',
        ],
        rationale:
          'generateEvansHtmPedigree must support Landscape/Portrait @page sizing, ARBA lbs.oz dot weights, and header logo rendering.',
      },
      {
        filePath: 'src/core/pdfExporter.ts',
        requiredSubstrings: ['buildPedigreePdfBytes', 'PdfRasterImage', '/DCTDecode'],
        rationale:
          'Pure TS offline PDF 1.4 generator must emit valid PDF binaries with JPEG XObjects and zero DOM dependencies.',
      },
      {
        filePath: 'src/components/PrintPreviewModal.tsx',
        requiredSubstrings: ['onDownloadPdf', 'Download .PDF', 'ARBA lbs.oz (10.04)', 'Portrait (8.5'],
        rationale:
          'PrintPreviewModal must expose orientation toggle, lbs.oz dot toggle, logo controls, and direct Download .PDF action.',
      },
    ],
    restorePlaybook: [
      'Keep `breederLogoDataUrl`, `formatWeightArbaLbsOzDot`, and `formatPedigreeWeight` in `src/core/models.ts` and `webSqliteAdapter.ts` extra_settings_json.',
      'Restore `src/core/pdfExporter.ts`, `src/utils/webPdfActions.ts`, and `src/core/__tests__/pdfExporter.test.ts`.',
      'Keep orientation, ARBA lbs.oz, logo upload/toggle, and `onDownloadPdf` wired across `SettingsAndSyncScreen.tsx`, `PrintPreviewModal.tsx`, `PedigreeScreen.tsx`, and `HerdScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-040',
    title: '8-Generation Pedigree Tree Mode, Custom Print Styling Presets & Shareable HTML Pedigree Cards',
    category: 'species-ux',
    source: 'session',
    summary:
      'Extends pedigree traversal, SQLite neighborhood loading, Evans .HTM output, and pure-TS offline PDF 1.4 export (auto-paginating 7-gen into 2 sheets and 8-gen into 4 grandparent quadrants) up to 8 generations on demand while keeping startup defaults capped at 3–6G; adds white-paper-locked color/border/layout print presets (`pedigreePrintStyles.ts`) and lightweight standalone mobile `.HTML` shareable pedigree cards (`shareablePedigreeCard.ts`).',
    userIntent:
      'Let breeders view and export up to 8 generations on demand, customize pedigree print borders, colors, and layouts safely on crisp white paper, and export lightweight standalone shareable pedigree HTML cards.',
    files: [
      'src/core/models.ts',
      'src/core/pedigreeCalculator.ts',
      'src/core/pedigreePrintStyles.ts',
      'src/core/shareablePedigreeCard.ts',
      'src/core/syncAndExports.ts',
      'src/core/pdfExporter.ts',
      'src/core/exporters/exporterTypes.ts',
      'src/core/exporters/registry.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/PrintPreviewModal.tsx',
      'src/components/PedigreeScreen.tsx',
      'src/components/HerdScreen.tsx',
      'src/components/ImportExportHubScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/models.ts',
        requiredSubstrings: [
          'DefaultPedigreeGenerations',
          'PedigreeGenerationDepth',
          'normalizePedigreeGenerationDepth',
          'normalizeDefaultPedigreeGenerations',
        ],
        rationale:
          'models.ts must separate 3–6G startup defaults from on-demand 3–8G PedigreeGenerationDepth.',
      },
      {
        filePath: 'src/core/pedigreePrintStyles.ts',
        requiredSubstrings: [
          'PEDIGREE_COLOR_PRESETS',
          'PEDIGREE_BORDER_STYLES',
          'PEDIGREE_LAYOUT_PRESETS',
          'resolvePedigreePrintTheme',
        ],
        rationale:
          'Pure TS print preset engine must define color, border, and layout presets locked to #FFFFFF paper.',
      },
      {
        filePath: 'src/core/shareablePedigreeCard.ts',
        requiredSubstrings: [
          'generateShareablePedigreeCardHtml',
          'buildShareablePedigreeCardFileName',
          'ShareablePedigreeCardOptions',
        ],
        rationale:
          'Pure TS shareable HTML pedigree card generator must render zero-DOM self-contained cards with collapsible Gen 4–8 ancestry.',
      },
      {
        filePath: 'src/core/exporters/registry.ts',
        requiredSubstrings: ['shareable-pedigree-card', 'generateShareablePedigreeCardHtml'],
        rationale:
          'Exporters registry must expose Shareable Pedigree Card (.HTML) alongside 8-gen Evans .HTM.',
      },
      {
        filePath: 'src/components/PrintPreviewModal.tsx',
        requiredSubstrings: [
          'pedigreeDocMode',
          'onChangePedigreeDocMode',
          'PEDIGREE_COLOR_PRESETS',
          'PEDIGREE_BORDER_STYLES',
          'PEDIGREE_LAYOUT_PRESETS',
        ],
        rationale:
          'PrintPreviewModal must allow switching between Formal Certificate and Shareable Card and picking color, border, and layout presets.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: ['Math.min(8, Math.max(0, Math.floor(maxDepth)))', 'MAX_RECORDS = 512'],
        rationale:
          'SQLite neighborhood loader must fetch up to 8 generations with expanded ancestor node cap (512).',
      },
    ],
    restorePlaybook: [
      'Keep `PedigreeGenerationDepth` (`3..8`) and normalizers in `src/core/models.ts` plus Gen 7–8 `slotRoleLabel`/`buildPedigreeSlots` in `src/core/pedigreeCalculator.ts`.',
      'Restore `src/core/pedigreePrintStyles.ts`, `src/core/shareablePedigreeCard.ts`, multi-page 7–8G sheets in `src/core/pdfExporter.ts`, and `shareable-pedigree-card` in `src/core/exporters/registry.ts`.',
      'Preserve 7/8-gen toggles, style preset selectors, and `pedigreeDocMode` wiring across `webSqliteAdapter.ts`, `useBarnStore.ts`, `PrintPreviewModal.tsx`, `PedigreeScreen.tsx`, `HerdScreen.tsx`, and `ImportExportHubScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-041',
    title: 'Structured Show Placements, Wins, Judge Notes & E-Leg Vault',
    category: 'species-ux',
    source: 'session',
    summary:
      'Expands ShowEvent entries with per-animal class placements, sanctionable awards (BOB, BOS, BIS, GCH, BOV, BOSV, RIS), judge names and notes, earned legs/points, E-Leg certificate numbers, and compressed raster E-Leg photo attachments (showResults.ts), synchronizing Animal.legsCount deltas and feeding Grand Championship progress and show honors into Male/Female reports, Barn Binder, Evans .HTM, Shareable Cards, Offline PDF pedigrees, and Herd/Pedigree/Species screens.',
    userIntent:
      'Capture structured show results, judge feedback, legs, and E-Leg certificate photos per entered animal so GC progress and show wins automatically enrich pedigrees, Barn Binder, and breeder reports.',
    files: [
      'src/core/models.ts',
      'src/core/showResults.ts',
      'src/core/__tests__/showResults.test.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/core/reportGenerators.ts',
      'src/core/barnBinder.ts',
      'src/core/syncAndExports.ts',
      'src/core/pdfExporter.ts',
      'src/core/shareablePedigreeCard.ts',
      'src/core/exporters/registry.ts',
      'src/core/speciesMigration.ts',
      'src/core/syncOutbox.ts',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/components/PedigreeScreen.tsx',
      'src/components/HerdScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/models.ts',
        requiredSubstrings: [
          'ShowAwardCode',
          'SHOW_AWARD_OPTIONS',
          'ShowELegAttachment',
          'ShowAnimalResult',
        ],
        rationale:
          'Canonical show award codes, E-Leg attachment types, and ShowEvent.results schema must stay intact.',
      },
      {
        filePath: 'src/core/showResults.ts',
        requiredSubstrings: [
          'normalizeShowResults',
          'sanitizeShowELegAttachment',
          'computeShowLegDeltas',
          'computeAnimalShowSummary',
        ],
        rationale:
          'Pure TS show results normalization, XSS-safe E-Leg attachment sanitization, leg delta reconciliation, and GC progress calculation must remain zero-DOM.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: ['results_json', 'normalizeShowResults'],
        rationale:
          'SQLite shows table and idempotent schema migration must persist and normalize results_json.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: ['normalizeShowResults', 'computeShowLegDeltas'],
        rationale:
          'Store show save/delete mutations must normalize results and reconcile Animal.legsCount deltas atomically.',
      },
      {
        filePath: 'src/core/reportGenerators.ts',
        requiredSubstrings: ['computeAnimalShowSummary', 'gcProgress', 'showWins', 'showPoints'],
        rationale:
          'Male/Female reports must aggregate show wins, points, combined legs, and Grand Champion progress automatically.',
      },
      {
        filePath: 'src/core/barnBinder.ts',
        requiredSubstrings: ['computeAnimalShowSummary', 'Show Legs / GC Progress'],
        rationale:
          'Barn Binder must include structured show placements, judge notes, E-Leg cert numbers, and E-Leg photo thumbnails.',
      },
      {
        filePath: 'src/core/syncAndExports.ts',
        requiredSubstrings: ['computeAnimalShowSummary', 'gcProgress.shortLabel'],
        rationale:
          'Evans .HTM pedigrees and JSON backups must carry structured ShowEvent.results and display show honors.',
      },
      {
        filePath: 'src/core/pdfExporter.ts',
        requiredSubstrings: ['computeAnimalShowSummary', 'gcProgress.shortLabel'],
        rationale:
          'Offline PDF 1.4 pedigrees must render show legs/GC status, awards, points, and ancestor honors.',
      },
      {
        filePath: 'src/core/shareablePedigreeCard.ts',
        requiredSubstrings: ['computeAnimalShowSummary', 'awardsSummaryText'],
        rationale:
          'Shareable pedigree cards must badge show legs, GC eligibility, awards, and points.',
      },
      {
        filePath: 'src/components/SpeciesDashboardScreen.tsx',
        requiredSubstrings: ['ShowAnimalResult', 'SHOW_AWARD_OPTIONS', 'eLegLightboxRef', 'showSubmitLock'],
        rationale:
          'Species Hub must expose the accessible Show & Results Editor Modal, multi-award toggles, E-Leg photo vault uploader, and lightbox viewer.',
      },
      {
        filePath: 'src/components/PedigreeScreen.tsx',
        requiredSubstrings: ['computeAnimalShowSummary', 'subjectShowSummary'],
        rationale:
          'PedigreeScreen must surface show honors and forward shows/careLogs to all pedigree exports.',
      },
      {
        filePath: 'src/components/HerdScreen.tsx',
        requiredSubstrings: ['computeAnimalShowSummary', 'activeAnimalShowSummary', 'eLegLightboxRef'],
        rationale:
          'HerdScreen profile must display GC progress bar, show history, E-Leg vault lightbox, and forward shows/careLogs to formal prints.',
      },
    ],
    restorePlaybook: [
      'Keep ShowAwardCode, SHOW_AWARD_OPTIONS, ShowELegAttachment, ShowAnimalResult, and ShowEvent.results in `src/core/models.ts` plus `src/core/showResults.ts` and `src/core/__tests__/showResults.test.ts`.',
      'Preserve `results_json` persistence/migration in `src/storage/webSqliteAdapter.ts`, leg delta reconciliation in `src/hooks/useBarnStore.ts`, and species migration/outbox handling in `speciesMigration.ts` / `syncOutbox.ts`.',
      'Keep `computeAnimalShowSummary` integrations across `reportGenerators.ts`, `barnBinder.ts`, `syncAndExports.ts`, `pdfExporter.ts`, `shareablePedigreeCard.ts`, `exporters/registry.ts`, `SpeciesDashboardScreen.tsx`, `PedigreeScreen.tsx`, and `HerdScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-042',
    title: 'Genetic Variety / Coat Explorer Sandbox (What-If Playground in Breeding Lab)',
    category: 'species-ux',
    source: 'session',
    summary:
      'Adds pure TS single-genotype phenotype, hidden recessive carrier, and single-animal health/lethal alert evaluation (`evaluateSingleGenotypeSandbox`, `buildSandboxHypotheticalAnimal` in `geneticsEngine.ts`) plus the ephemeral interactive `CoatExplorerSandbox` playground inside `BreedingScreen` supporting Single Genotype and What-If Pairing Cross modes, variety presets with optional modifier checks, read-only herd/logger seeding, and interactive locus allele editing without creating temporary animal records.',
    userIntent:
      'Let breeders experiment with hypothetical loci combinations and What-If crosses inside Breeding Lab and see predicted coat varieties, hidden carriers, and alerts without creating temporary animal records first.',
    files: [
      'src/core/geneticsEngine.ts',
      'src/core/__tests__/geneticsEngine.test.ts',
      'src/components/CoatExplorerSandbox.tsx',
      'src/components/BreedingScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/geneticsEngine.ts',
        requiredSubstrings: [
          'SingleGenotypeEvaluation',
          'evaluateSingleGenotypeSandbox',
          'buildSandboxHypotheticalAnimal',
        ],
        rationale:
          'Pure TS Coat Explorer Sandbox evaluator and hypothetical animal shell builder must remain zero-DOM and custom-species isolated.',
      },
      {
        filePath: 'src/components/CoatExplorerSandbox.tsx',
        requiredSubstrings: [
          'CoatExplorerSandbox',
          'evaluateSingleGenotypeSandbox',
          'buildSandboxHypotheticalAnimal',
          'ColorGeneticsNotice',
        ],
        rationale:
          'Breeding Lab Coat Explorer Sandbox UI must remain strictly ephemeral (no persistence writes) with What-If Single & Cross modes and ColorGeneticsNotice.',
      },
      {
        filePath: 'src/components/BreedingScreen.tsx',
        requiredSubstrings: ['<CoatExplorerSandbox'],
        rationale:
          'BreedingScreen must mount CoatExplorerSandbox inside Breeding Lab.',
      },
    ],
    restorePlaybook: [
      'Keep `SingleGenotypeEvaluation`, `evaluateSingleGenotypeSandbox`, and `buildSandboxHypotheticalAnimal` in `src/core/geneticsEngine.ts` with tests in `src/core/__tests__/geneticsEngine.test.ts`.',
      'Restore `src/components/CoatExplorerSandbox.tsx` with Single Genotype & What-If Cross modes, variety presets, locus selectors, and `ColorGeneticsNotice`.',
      'Mount `<CoatExplorerSandbox />` inside `src/components/BreedingScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-043',
    title: 'Rate of Gain, Comparative Weight Charts & Litter Survival Curves',
    category: 'species-ux',
    source: 'session',
    summary:
      'Adds pure TS age-in-days Rate of Gain (ADG), Barn Cohort Benchmark, interpolated user-defined goal weight curves, meteorological seasonal bucketing, and dam/sire litter survival & milestone analytics (`growthAnalytics.ts`) backed by `SpeciesProfile.targetWeightCurve` and `BreedingRecord.litterWeightMilestones` across SQLite, JSON, store hooks, `GrowthAndSurvivalLab`, `BreedingScreen` Outcome milestone editor, `HerdScreen` compare actions, and the `litter-survival-performance-report`.',
    userIntent:
      'Track kit/offspring survival rate per dam and sire, chart litter weight-gain milestones across seasons, and compare multi-animal Rate of Gain curves on an age-in-days axis with native target/goal overlays.',
    files: [
      'src/core/models.ts',
      'src/core/growthAnalytics.ts',
      'src/core/__tests__/growthAnalytics.test.ts',
      'src/core/syncAndExports.ts',
      'src/core/reportCatalog.ts',
      'src/core/reportGenerators.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/GrowthAndSurvivalLab.tsx',
      'src/components/BreedingScreen.tsx',
      'src/components/HerdScreen.tsx',
      'src/App.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/models.ts',
        requiredSubstrings: [
          'TargetWeightPoint',
          'normalizeTargetWeightCurve',
          'LitterWeightMilestone',
          'normalizeLitterWeightMilestones',
        ],
        rationale:
          'Target weight curve points and litter weight-gain milestone types/normalizers must remain intact on SpeciesProfile and BreedingRecord.',
      },
      {
        filePath: 'src/core/growthAnalytics.ts',
        requiredSubstrings: [
          'evaluateLitterSurvivalAndMilestones',
          'buildAnimalGrowthSeries',
          'buildBarnCohortBenchmarkCurve',
          'buildComparativeGrowthChartModel',
          'resolveMeteorologicalSeason',
        ],
        rationale:
          'Pure TS growth, seasonal litter survival, cohort benchmark, and comparative ADG engine must stay zero-DOM.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: ['target_weight_curve_json', 'litter_weight_milestones_json'],
        rationale:
          'SQLite schema and idempotent migrations must persist species target curves and breeding litter milestones.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: ['updateSpeciesTargetWeightCurve', 'openGrowthCompareForAnimals'],
        rationale:
          'Store must persist species target weight curves, litter milestones, and launch preselected multi-animal growth comparisons.',
      },
      {
        filePath: 'src/components/GrowthAndSurvivalLab.tsx',
        requiredSubstrings: [
          'GrowthAndSurvivalLab',
          'buildComparativeGrowthChartModel',
          'evaluateLitterSurvivalAndMilestones',
        ],
        rationale:
          'GrowthAndSurvivalLab UI must expose Comparative Rate of Gain charts with goal/cohort overlays and Litter Survival & Parent Curves.',
      },
      {
        filePath: 'src/components/BreedingScreen.tsx',
        requiredSubstrings: ['<GrowthAndSurvivalLab', 'litterWeightMilestones'],
        rationale:
          'BreedingScreen must mount GrowthAndSurvivalLab and expose litter weight milestone editing inside the Outcome modal.',
      },
      {
        filePath: 'src/core/reportGenerators.ts',
        requiredSubstrings: ['litter-survival-performance-report', 'evaluateLitterSurvivalAndMilestones'],
        rationale:
          'Reports catalog and generator must expose Litter Survival & Parent Performance Report.',
      },
    ],
    restorePlaybook: [
      'Keep `TargetWeightPoint`, `normalizeTargetWeightCurve`, `LitterWeightMilestone`, and `normalizeLitterWeightMilestones` in `src/core/models.ts` plus `target_weight_curve_json` & `litter_weight_milestones_json` in `src/storage/webSqliteAdapter.ts` and `src/core/syncAndExports.ts`.',
      'Restore `src/core/growthAnalytics.ts` and `src/core/__tests__/growthAnalytics.test.ts`.',
      'Keep `updateSpeciesTargetWeightCurve`, `openGrowthCompareForAnimals`, `GrowthAndSurvivalLab.tsx`, Outcome milestone inputs in `BreedingScreen.tsx`, Herd growth compare buttons in `HerdScreen.tsx` / `App.tsx`, and `litter-survival-performance-report` in `reportCatalog.ts` / `reportGenerators.ts`.',
    ],
  },
  {
    id: 'IMP-044',
    title: 'Feed Inventory Ledger, Tag Lot-Number OCR & Biosecurity Auto-Purge',
    category: 'species-ux',
    source: 'session',
    summary:
      'Adds strictly species-isolated `FeedBatch` & `FeedAllocation` tracking across SQLite schema v3 (`feed_batches`, `feed_allocations`), JSON/ZIP backups, data health repair, and `useBarnStore`, paired with pre-compression local OCR (`captureFeedTagWithPreCompressionOcr` + `extractFeedTagDetailsFromOcrText`) to index mill lot numbers and plant codes with manual override, configurable 30/60/90-day biosecurity auto-purge of stored tag images (`purgeExpiredFeedTagPhotosPure`), lot traceability across cages/litters/animals (`traceFeedLotToCagesAndLitters`), and an offline manufacturer emergency directory (`FEED_MANUFACTURER_DIRECTORY`).',
    userIntent:
      'Track purchased feed lots, allocate intake to pens and litters, scan feed tag stamps before deep compression with manual fallback, auto-purge heavy raw tag images after lot indexing, and keep an offline feed manufacturer recall & hotline directory.',
    files: [
      'src/core/models.ts',
      'src/core/feedInventory.ts',
      'src/core/feedManufacturerDirectory.ts',
      'src/core/__tests__/feedInventory.test.ts',
      'src/storage/feedTagOcr.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/FeedLedgerScreen.tsx',
      'src/components/FacilityPenBoard.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/App.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/models.ts',
        requiredSubstrings: [
          'FeedBatch',
          'FeedAllocation',
          'FEED_PURGE_WINDOW_OPTIONS',
          'normalizeFeedPurgeWindowDays',
        ],
        rationale:
          'FeedBatch, FeedAllocation, and 30/60/90/0 biosecurity purge window options must remain intact in core models.',
      },
      {
        filePath: 'src/core/feedInventory.ts',
        requiredSubstrings: [
          'extractFeedTagDetailsFromOcrText',
          'purgeExpiredFeedTagPhotosPure',
          'traceFeedLotToCagesAndLitters',
          'formatFeedLedgerCsv',
        ],
        rationale:
          'Pure TS lot OCR parser, lot-gated biosecurity purge transform, lot traceability, and CSV exporter must stay zero-DOM.',
      },
      {
        filePath: 'src/core/feedManufacturerDirectory.ts',
        requiredSubstrings: [
          'FEED_MANUFACTURER_DIRECTORY',
          'filterFeedManufacturerDirectory',
          'matchManufacturerForBrand',
        ],
        rationale:
          'Bundled offline manufacturer emergency & recall directory must stay accessible with zero network.',
      },
      {
        filePath: 'src/storage/feedTagOcr.ts',
        requiredSubstrings: ['captureFeedTagWithPreCompressionOcr', 'optimizeImageBlob'],
        rationale:
          'Feed tag OCR must decode and analyze full-resolution images BEFORE compact image compression.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: ['feed_batches', 'feed_allocations', 'saveFeedBatchesBatch'],
        rationale:
          'SQLite persistence schema and adapter methods must store and hydrate feed batches and intake allocations.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: [
          'saveFeedBatch',
          'logFeedAllocation',
          'runFeedTagBiosecurityAutoPurge',
        ],
        rationale:
          'Store must expose species-isolated feed ledger mutations, cage stock sync, and idle biosecurity auto-purge.',
      },
      {
        filePath: 'src/components/FeedLedgerScreen.tsx',
        requiredSubstrings: [
          'FeedLedgerScreen',
          'captureFeedTagWithPreCompressionOcr',
          'FEED_MANUFACTURER_DIRECTORY',
        ],
        rationale:
          'FeedLedgerScreen must provide purchase/OCR scanning, intake allocations, lot traceability, and offline manufacturer contacts.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: ['FeedLedgerScreen', "route === 'feed'"],
        rationale: 'Root router must lazy-load and mount FeedLedgerScreen on route feed.',
      },
    ],
    restorePlaybook: [
      'Keep `FeedBatch`, `FeedAllocation`, `FEED_PURGE_WINDOW_OPTIONS`, and `normalizeFeedPurgeWindowDays` in `src/core/models.ts` plus SQLite tables in `src/storage/webSqliteAdapter.ts`.',
      'Restore `src/core/feedInventory.ts`, `src/core/feedManufacturerDirectory.ts`, `src/core/__tests__/feedInventory.test.ts`, and `src/storage/feedTagOcr.ts`.',
      'Keep `saveFeedBatch`, `logFeedAllocation`, `runFeedTagBiosecurityAutoPurge` in `useBarnStore.ts` and mount `FeedLedgerScreen.tsx` in `SpeciesDashboardScreen.tsx`, `FacilityPenBoard.tsx`, and `App.tsx`.',
    ],
  },
  {
    id: 'IMP-045',
    title: 'Offline Photo Pedigree Scanning & Local OCR Importer',
    category: 'species-ux',
    source: 'session',
    summary:
      'Adds 100% offline client-side paper pedigree scanning and PDF extraction via `pdfScanExtractor.ts` (searchable `/FlateDecode` `BT...ET` text vectors with coordinates and embedded `/DCTDecode` scanned JPEG pages) plus `pedigreeOcrParser.ts` (2D bounding-box 3-col/4-col pedigree tree reconstruction and text heuristics into an editable 15-slot 3-generation draft queue backed by `PlatformImportPreview`), wired with `pedigreeOcrScanner.ts` (native Chromium `TextDetector` + lazy bounded `tesseract.js` worker with `offline_manual` fallback) into `PedigreeOcrScannerPanel.tsx` and `ExternalImporterPanel.tsx`.',
    userIntent:
      'Allow breeders to snap a photo or upload JPG/PNG/WebP/PDF scans of paper pedigrees completely offline, review/correct extracted ancestor names, ear tattoos, weights, and ARBA registration numbers across 3 generations, and stage them straight into the Import Review Queue with duplicate/conflict resolution.',
    files: [
      'src/core/importers/pdfScanExtractor.ts',
      'src/core/importers/pedigreeOcrParser.ts',
      'src/core/__tests__/pedigreeOcrParser.test.ts',
      'src/storage/pedigreeOcrScanner.ts',
      'src/components/PedigreeOcrScannerPanel.tsx',
      'src/components/ExternalImporterPanel.tsx',
      'src/components/ImportExportHubScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/importers/pdfScanExtractor.ts',
        requiredSubstrings: [
          'extractPedigreePdfPages',
          'MAX_PDF_SCAN_BYTES',
          'MAX_PDF_SCAN_PAGES',
        ],
        rationale:
          'Pure TS offline PDF vector text (`BT...ET`) and embedded `/DCTDecode` JPEG extractor must remain zero-DOM.',
      },
      {
        filePath: 'src/core/importers/pedigreeOcrParser.ts',
        requiredSubstrings: [
          'PEDIGREE_OCR_SLOT_DESCRIPTORS',
          'parsePedigreeSlotLines',
          'parsePedigreeOcrResult',
          'buildPlatformImportPreviewFromOcrDrafts',
        ],
        rationale:
          'Pure TS 2D tree/line pedigree parser and Import Review Queue preview bridge must stay zero-DOM and deterministic.',
      },
      {
        filePath: 'src/storage/pedigreeOcrScanner.ts',
        requiredSubstrings: ['scanPedigreeDocumentFile', 'tesseract.js'],
        rationale:
          'Browser OCR runner must lazy-load Tesseract worker with bounded timeout, native TextDetector precheck, and soft offline manual fallback.',
      },
      {
        filePath: 'src/components/PedigreeOcrScannerPanel.tsx',
        requiredSubstrings: [
          'PedigreeOcrScannerPanel',
          'scanPedigreeDocumentFile',
          'buildPlatformImportPreviewFromOcrDrafts',
        ],
        rationale:
          'Scanner UI must offer camera/photo/PDF capture, editable 15-slot 3-generation review, and staging into Import Review Queue.',
      },
      {
        filePath: 'src/components/ExternalImporterPanel.tsx',
        requiredSubstrings: ['externalOcrPreview', 'onClearExternalOcrPreview'],
        rationale:
          'ExternalImporterPanel must accept staged OCR PlatformImportPreview drafts for full conflict resolution and WebP photo optimization.',
      },
      {
        filePath: 'src/components/ImportExportHubScreen.tsx',
        requiredSubstrings: ['<PedigreeOcrScannerPanel', 'stagedOcrPreview'],
        rationale:
          'ImportExportHubScreen Section 02 must mount PedigreeOcrScannerPanel connected to ExternalImporterPanel.',
      },
    ],
    restorePlaybook: [
      'Restore pure parsers `src/core/importers/pdfScanExtractor.ts`, `src/core/importers/pedigreeOcrParser.ts`, and `src/core/__tests__/pedigreeOcrParser.test.ts`.',
      'Restore `src/storage/pedigreeOcrScanner.ts` and `src/components/PedigreeOcrScannerPanel.tsx`.',
      'Keep `externalOcrPreview`/`onClearExternalOcrPreview` props in `ExternalImporterPanel.tsx` and `<PedigreeOcrScannerPanel>` wired inside `ImportExportHubScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-046',
    title: 'Local Economic Ledger, Meat/Pelt Processing Yields & 4-H/FFA Project Books',
    category: 'species-ux',
    source: 'session',
    summary:
      'Adds species-isolated general barn income/expense tracking (`LedgerEntry`) with compressed receipt photo attachments (`optimizeImageFile`) and feed-lot deduplication; automated per-animal and per-litter net profit/loss margins (`computeAnimalProfitMargins`, `computeLitterProfitMargins`); meat & pelt processing logs (`ProcessingLog`) tracking butcher schedules, harvest dates, live-to-dressed carcass dress-out %, and pelt grades; 4-H/FFA Youth Project Record Books (`YouthProjectBook`) with ration feed logs, inventory changes, and printable `.HTM`/PDF completion reports (`generateYouthProjectReportHtml`); SQLite v4 persistence, sync outbox deltas, 3 new report presets, and `EconomicsLedgerScreen.tsx` accessible from Species Dashboard & `E` shortcut.',
    userIntent:
      'Provide offline barn bookkeeping with receipt photos, automated animal/litter P&L margins, meat/pelt carcass yield and pelt grading logs, and printable 4-H/FFA youth livestock project completion books.',
    files: [
      'src/core/models.ts',
      'src/core/economicsLedger.ts',
      'src/core/__tests__/economicsLedger.test.ts',
      'src/core/reportCatalog.ts',
      'src/core/reportGenerators.ts',
      'src/core/syncOutbox.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/EconomicsLedgerScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/App.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/models.ts',
        requiredSubstrings: [
          'LedgerEntry',
          'LEDGER_CATEGORY_OPTIONS',
          'ProcessingLog',
          'PELT_GRADE_OPTIONS',
          'YouthProjectBook',
        ],
        rationale:
          'LedgerEntry, ProcessingLog, and YouthProjectBook domain models and normalizers must remain intact.',
      },
      {
        filePath: 'src/core/economicsLedger.ts',
        requiredSubstrings: [
          'calculateDressOutPercent',
          'computeAnimalProfitMargins',
          'computeLitterProfitMargins',
          'evaluateSpeciesEconomicsSummary',
          'evaluateProcessingSummary',
          'evaluateYouthProjectSummary',
          'generateYouthProjectReportHtml',
        ],
        rationale:
          'Pure TS economics margins, yield analytics, CSV exporters, and printable youth completion report builder must remain zero-DOM.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: [
          'ledger_entries',
          'processing_logs',
          'youth_project_books',
          'saveLedgerEntry',
          'saveProcessingLog',
          'saveYouthProjectBook',
        ],
        rationale:
          'SQLite persistence schema v4 and adapter CRUD methods must store and hydrate ledger entries, processing logs, and youth project books.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: [
          'saveLedgerEntry',
          'saveProcessingLog',
          'saveYouthProjectBook',
        ],
        rationale:
          'Store must expose species-isolated economics, processing, and 4-H/FFA project mutations with delta outbox sync.',
      },
      {
        filePath: 'src/components/EconomicsLedgerScreen.tsx',
        requiredSubstrings: [
          'EconomicsLedgerScreen',
          'generateYouthProjectReportHtml',
          'evaluateSpeciesEconomicsSummary',
        ],
        rationale:
          'EconomicsLedgerScreen must provide general ledger + receipt photos, meat/pelt yields, and 4-H/FFA project record books.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: ['EconomicsLedgerScreen', "route === 'economics'"],
        rationale: 'Root router must lazy-load and mount EconomicsLedgerScreen on route economics.',
      },
    ],
    restorePlaybook: [
      'Keep `LedgerEntry`, `ProcessingLog`, and `YouthProjectBook` interfaces and normalizers in `src/core/models.ts` plus SQLite v4 tables in `src/storage/webSqliteAdapter.ts`.',
      'Restore `src/core/economicsLedger.ts` and `src/core/__tests__/economicsLedger.test.ts` along with the 3 financial/production/youth presets in `reportCatalog.ts` and `reportGenerators.ts`.',
      'Keep store CRUD mutations in `src/hooks/useBarnStore.ts` and wire `EconomicsLedgerScreen.tsx` into `SpeciesDashboardScreen.tsx` and `App.tsx`.',
    ],
  },
  {
    id: 'IMP-047',
    title: 'Client CRM, Buyer Waitlist, Reservations & Deposit Reminders',
    category: 'species-ux',
    source: 'session',
    summary:
      'Adds species-isolated local-first breeder CRM tracking buyer contacts (`ClientContact`), ranked waitlist inquiries (`WaitlistEntry`) with live unreserved animal/pairing match scoring (`findWaitlistMatches`), animal/litter-pick reservations (`AnimalReservation`) with sequential agreement numbering and deposit/balance progress (`evaluateReservationFinancials`), automated overdue/due/upcoming follow-up reminders (`evaluateCrmFollowUpReminders`) with 1-click Master Task creation, XSS-safe printable Sales Agreements with optional breeder logo and active withdrawal disclosures (`generateSalesAgreementHtml`), SQLite v5 persistence, sync outbox deltas, 2 CRM report presets, and `ClientCrmScreen.tsx` accessible from Species Dashboard & `C` shortcut.',
    userIntent:
      'Track buyer contacts, waitlist queues, animal/litter reservations, deposit due reminders, and printable sales agreements offline without cloud dependencies.',
    files: [
      'src/core/models.ts',
      'src/core/clientCrm.ts',
      'src/core/__tests__/clientCrm.test.ts',
      'src/core/reportCatalog.ts',
      'src/core/reportGenerators.ts',
      'src/core/syncOutbox.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/ClientCrmScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/App.tsx',
    ],
    invariants: [
      {
        filePath: 'src/core/models.ts',
        requiredSubstrings: [
          'ClientContact',
          'WaitlistEntry',
          'AnimalReservation',
          'RESERVATION_STATUSES',
          'WAITLIST_STATUSES',
        ],
        rationale:
          'ClientContact, WaitlistEntry, and AnimalReservation domain models and normalizers must remain intact.',
      },
      {
        filePath: 'src/core/clientCrm.ts',
        requiredSubstrings: [
          'evaluateReservationFinancials',
          'evaluateCrmFollowUpReminders',
          'findWaitlistMatches',
          'generateSalesAgreementHtml',
          'formatReservationsCsv',
        ],
        rationale:
          'Pure TS CRM financial evaluation, automated follow-up reminders, waitlist matching, CSV export, and printable Sales Agreement generator must stay zero-DOM.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: [
          'client_contacts',
          'waitlist_entries',
          'animal_reservations',
          'saveClientContact',
          'saveWaitlistEntry',
          'saveAnimalReservation',
        ],
        rationale:
          'SQLite schema v5 and adapter CRUD methods must store and hydrate CRM contacts, waitlist entries, and reservations.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: [
          'saveClientContact',
          'saveWaitlistEntry',
          'saveAnimalReservation',
          'completeReservationSale',
          'createCrmReminderTask',
        ],
        rationale:
          'Store must expose species-isolated CRM mutations, atomic sale completion, and reminder task creation with delta outbox sync.',
      },
      {
        filePath: 'src/components/ClientCrmScreen.tsx',
        requiredSubstrings: [
          'ClientCrmScreen',
          'generateSalesAgreementHtml',
          'evaluateCrmFollowUpReminders',
          'findWaitlistMatches',
        ],
        rationale:
          'ClientCrmScreen must render reminders, reservation/deposit tracking, ranked waitlist matching, client directory, and printable sales agreements.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: ['ClientCrmScreen', "route === 'crm'"],
        rationale: 'Root router must lazy-load and mount ClientCrmScreen on route crm.',
      },
    ],
    restorePlaybook: [
      'Keep `ClientContact`, `WaitlistEntry`, and `AnimalReservation` interfaces and normalizers in `src/core/models.ts` plus SQLite v5 tables in `src/storage/webSqliteAdapter.ts`.',
      'Restore `src/core/clientCrm.ts` and `src/core/__tests__/clientCrm.test.ts` along with the 2 CRM presets in `reportCatalog.ts` and `reportGenerators.ts`.',
      'Keep CRM mutations in `src/hooks/useBarnStore.ts` and wire `ClientCrmScreen.tsx` into `SpeciesDashboardScreen.tsx` and `App.tsx`.',
    ],
  },
  {
    id: 'IMP-048',
    title: 'Alternative Certificates, Show Entry/Remark Cards & IAGARB Wool/Fiber Tracking',
    category: 'species-ux',
    source: 'session',
    summary:
      'Adds privacy-scoped Pet-Sale Birth Certificates (omitting breeder contact info & pricing), official Breeding/Service Certificates, ARBA-style Show Entry Forms (`mailto:` + plain-text copy + Open/Youth/fees) & 4-up/1-up Show Remark Cards from ShowEvent rosters, Gen 0–2 multi-photo Family Portrait and IAGARB German Angora pedigree layouts, and SQLite v6 `wool_harvests` tracking with 7-position 100-pt IAGARB scoring and 90-day 325g shearing yield calculations.',
    userIntent:
      'Support alternative companion birth/breeding certificates, printable/emailable show documents directly from show rosters, family portrait & IAGARB Angora pedigree templates, and wool/fiber harvest logging.',
    files: [
      'src/core/models.ts',
      'src/core/woolFiber.ts',
      'src/core/alternativeCertificates.ts',
      'src/core/showDocuments.ts',
      'src/core/pedigreePrintStyles.ts',
      'src/core/syncAndExports.ts',
      'src/core/pdfExporter.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/PrintPreviewModal.tsx',
      'src/components/HerdScreen.tsx',
      'src/components/PedigreeScreen.tsx',
      'src/components/BreedingScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/App.tsx',
      'src/core/__tests__/woolFiber.test.ts',
      'src/core/__tests__/alternativeCertificates.test.ts',
      'src/core/__tests__/showDocuments.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/core/models.ts',
        requiredSubstrings: [
          'WoolHarvest',
          'IagarbScorecard',
          'WOOL_HARVEST_METHODS',
          'normalizeWoolHarvestMethod',
        ],
        rationale: 'WoolHarvest and IagarbScorecard domain models and normalizers must remain intact.',
      },
      {
        filePath: 'src/core/woolFiber.ts',
        requiredSubstrings: [
          'IAGARB_JUDGING_POSITIONS',
          'computeIagarbScoreTotal',
          'evaluateIagarbEligibility',
          'compute90DayEquivalentGrams',
          'summarizeAnimalWoolHarvests',
        ],
        rationale:
          'Pure TS IAGARB 100-point rubric, 325g/90-day performance yield normalization, and harvest summary calculators must stay zero-DOM.',
      },
      {
        filePath: 'src/core/alternativeCertificates.ts',
        requiredSubstrings: [
          'generatePetBirthCertificateHtml',
          'generateBreedingCertificateHtml',
          'buildPetBirthCertificateFileName',
          'buildBreedingCertificateFileName',
        ],
        rationale:
          'Pure TS Pet-Sale Birth Certificate (no breeder contact/pricing) and Breeding Certificate generators must remain zero-DOM and XSS-safe.',
      },
      {
        filePath: 'src/core/showDocuments.ts',
        requiredSubstrings: [
          'generateShowEntryFormHtml',
          'generateShowRemarkCardsHtml',
          'buildShowEntryMailtoUrl',
          'buildShowEntryPlainTextSummary',
        ],
        rationale:
          'Pure TS ARBA Show Entry Form, emailable plain-text/mailto dispatchers, and 4-up/1-up Remark Card generators must remain zero-DOM.',
      },
      {
        filePath: 'src/core/pedigreePrintStyles.ts',
        requiredSubstrings: ['family_portrait', 'iagarb_angora'],
        rationale: 'Family Portrait and IAGARB German Angora pedigree presets must stay registered.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: ['wool_harvests', 'saveWoolHarvest', 'deleteWoolHarvest'],
        rationale: 'SQLite schema v6 must store and hydrate wool_harvests cleanly.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: ['saveWoolHarvest', 'deleteWoolHarvest'],
        rationale: 'Store must expose species-isolated wool harvest mutations with delta outbox sync.',
      },
      {
        filePath: 'src/components/HerdScreen.tsx',
        requiredSubstrings: [
          'generatePetBirthCertificateHtml',
          'onSaveWoolHarvest',
          'IAGARB_JUDGING_POSITIONS',
        ],
        rationale:
          'HerdScreen must provide Pet-Sale Birth Certificate previews and Wool / Fiber + IAGARB scoring.',
      },
      {
        filePath: 'src/components/BreedingScreen.tsx',
        requiredSubstrings: ['generateBreedingCertificateHtml', 'Breeding Cert'],
        rationale: 'BreedingScreen must expose Breeding Certificate preview controls.',
      },
      {
        filePath: 'src/components/SpeciesDashboardScreen.tsx',
        requiredSubstrings: [
          'generateShowEntryFormHtml',
          'generateShowRemarkCardsHtml',
          'buildShowEntryMailtoUrl',
        ],
        rationale:
          'SpeciesDashboardScreen must expose Show Entry Form and Remark Cards print/email previews directly from ShowEvents.',
      },
    ],
    restorePlaybook: [
      'Keep `WoolHarvest` and `IagarbScorecard` models in `src/core/models.ts` and `wool_harvests` SQLite v6 schema in `src/storage/webSqliteAdapter.ts`.',
      'Restore pure modules `src/core/woolFiber.ts`, `src/core/alternativeCertificates.ts`, and `src/core/showDocuments.ts` with their unit tests.',
      'Keep `family_portrait` & `iagarb_angora` rendering in `pedigreePrintStyles.ts`, `syncAndExports.ts`, and `pdfExporter.ts`, plus UI wiring in `HerdScreen.tsx`, `PedigreeScreen.tsx`, `BreedingScreen.tsx`, `SpeciesDashboardScreen.tsx`, and `App.tsx`.',
    ],
  },
];

/**
 * Evaluates all `IMPROVEMENTS_REGISTRY` code invariants against an in-memory map of file contents.
 * Keys may be POSIX relative paths (`src/core/models.ts`) with or without a leading `/`.
 */
export function evaluateImprovementInvariants(
  filesByPath: Record<string, string | undefined>,
  entries: ImprovementEntry[] = IMPROVEMENTS_REGISTRY
): ImprovementDriftReport {
  const normalizedMap = new Map<string, string>();
  for (const [k, v] of Object.entries(filesByPath)) {
    if (typeof v === 'string') {
      normalizedMap.set(k.replace(/^\/+/, ''), v);
    }
  }

  const violations: ImprovementDriftViolation[] = [];
  const checkedFiles = new Set<string>();
  let passedCount = 0;

  for (const entry of entries) {
    let entryPassed = true;

    for (const inv of entry.invariants) {
      const cleanPath = inv.filePath.replace(/^\/+/, '');
      checkedFiles.add(cleanPath);
      const content = normalizedMap.get(cleanPath);

      if (content === undefined) {
        entryPassed = false;
        violations.push({
          entryId: entry.id,
          title: entry.title,
          filePath: cleanPath,
          issue: `Missing tracked file "${cleanPath}" (${inv.rationale})`,
          restorePlaybook: entry.restorePlaybook,
        });
        continue;
      }

      for (const req of inv.requiredSubstrings) {
        if (!content.includes(req)) {
          entryPassed = false;
          violations.push({
            entryId: entry.id,
            title: entry.title,
            filePath: cleanPath,
            issue: `Missing expected token "${req}" in ${cleanPath} — ${inv.rationale}`,
            restorePlaybook: entry.restorePlaybook,
          });
        }
      }

      for (const forbidden of inv.forbiddenSubstrings ?? []) {
        if (content.includes(forbidden)) {
          entryPassed = false;
          violations.push({
            entryId: entry.id,
            title: entry.title,
            filePath: cleanPath,
            issue: `Detected regression pattern "${forbidden}" in ${cleanPath} — ${inv.rationale}`,
            restorePlaybook: entry.restorePlaybook,
          });
        }
      }
    }

    if (entryPassed) {
      passedCount += 1;
    }
  }

  return {
    checkedAtIso: nowIsoUtc(),
    totalEntries: entries.length,
    totalFilesChecked: checkedFiles.size,
    passedCount,
    violations,
    ok: violations.length === 0,
  };
}

/**
 * Generates a clean, self-contained Markdown improvements & GitHub-overwrite recovery manual.
 */
export function formatImprovementsMarkdown(
  entries: ImprovementEntry[] = IMPROVEMENTS_REGISTRY
): string {
  const lines: string[] = [
    '# Community Pedigree — App Improvements & GitHub-Overwrite Recovery Log',
    '',
    'This document is synchronized with `src/core/improvementRegistry.ts` and verified automatically',
    'by `npm run verify:improvements` (and GitHub Actions CI). If an upstream GitHub pull or AI Studio',
    'sync overwrites customized files, run the verifier to pinpoint exactly which improvements were wiped',
    'and follow the restoration playbook below.',
    '',
    '## Quick Verification & Recovery Commands',
    '',
    '```bash',
    '# 1. Check all tracked improvement invariants against files on disk',
    'npm run verify:improvements',
    '',
    '# 2. Run domain unit tests (includes improvementRegistry drift checks)',
    'npm test',
    '',
    '# 3. Typecheck and build',
    'npm run lint && npm run build',
    '```',
    '',
    '---',
    '',
    `## Logged Improvements (${entries.length})`,
    '',
  ];

  for (const entry of entries) {
    const sourceBadge =
      entry.source === 'github-preserved' ? 'Preserved Upstream Feature' : 'Session Improvement';
    lines.push(`### ${entry.id}: ${entry.title}`);
    lines.push('');
    lines.push(
      `- **Category:** ${IMPROVEMENT_CATEGORY_LABELS[entry.category]} (\`${entry.category}\`)`
    );
    lines.push(`- **Origin:** ${sourceBadge}`);
    lines.push(`- **User Goal:** ${entry.userIntent}`);
    lines.push(`- **Summary:** ${entry.summary}`);
    lines.push(`- **Tracked Files:** ${entry.files.map((f) => `\`${f}\``).join(', ')}`);
    lines.push('');
    lines.push('**Automated Invariants Checked:**');
    for (const inv of entry.invariants) {
      const reqList = inv.requiredSubstrings.map((s) => `\`${s}\``).join(', ');
      lines.push(`- \`${inv.filePath}\` must contain ${reqList} — *${inv.rationale}*`);
      if (inv.forbiddenSubstrings && inv.forbiddenSubstrings.length > 0) {
        const forbList = inv.forbiddenSubstrings.map((s) => `\`${s}\``).join(', ');
        lines.push(`  - Forbidden regression: ${forbList}`);
      }
    }
    lines.push('');
    lines.push('**Restoration Playbook if Overwritten:**');
    entry.restorePlaybook.forEach((step, idx) => {
      lines.push(`${idx + 1}. ${step}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Serializes the full improvement registry into a structured JSON recovery bundle
 * downloadable directly from Settings -> Diagnostics & Support.
 */
export function buildImprovementsRecoveryJson(
  entries: ImprovementEntry[] = IMPROVEMENTS_REGISTRY
): string {
  return JSON.stringify(
    {
      format: 'community-pedigree-improvements-log',
      package: 'Pedigree',
      version: 1,
      exportedAtIsoUtc: nowIsoUtc(),
      verifyCommand: 'npm run verify:improvements',
      totalEntries: entries.length,
      entries,
    },
    null,
    2
  );
}
````

## `src/core/inputSanitization.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Input Sanitization, File Size Guardrails & ZIP-Bomb / Injection Defense.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript + `fflate` Uint8Array helpers with zero browser DOM (`window`, `document`)
 * dependencies so the exact same validation and sanitization layer runs identically in
 * Web PWAs, unit tests, and React Native / Expo.
 */

import { unzipSync } from 'fflate';
import type { SyncEntityType, SyncOperation } from './syncOutbox';
import type { CustomThemeColors } from './themePalette';

// ============================================================================
// Rational File & Payload Size Limits
// ============================================================================

export const MAX_PHOTO_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB per image file
export const MAX_PHOTO_BATCH_COUNT = 50; // Max images in one direct pick/drop batch
export const MAX_IMAGE_PIXEL_DIMENSION = 16_384; // Max single axis pixel count
export const MAX_IMAGE_TOTAL_PIXELS = 100_000_000; // 100 MP canvas bomb limit

export const MAX_JSON_BACKUP_BYTES = 150 * 1024 * 1024; // 150 MB standalone JSON backup
export const MAX_DELTA_JSON_BYTES = 50 * 1024 * 1024; // 50 MB single delta JSON file
export const MAX_DELTA_BATCH_FILES = 50; // Max peer delta files per upload/sync pass
export const MAX_DELTA_BATCH_TOTAL_BYTES = 100 * 1024 * 1024; // 100 MB combined delta batch
export const MAX_DELTA_OPERATIONS = 100_000; // Max operations accepted in one merge

export const MAX_ZIP_ARCHIVE_BYTES = 250 * 1024 * 1024; // 250 MB single .ZIP file
export const MAX_EXTERNAL_IMPORT_FILES = 20; // Max staged files in External Importer
export const MAX_EXTERNAL_IMPORT_TOTAL_BYTES = 300 * 1024 * 1024; // 300 MB staged total

export const MAX_ZIP_ENTRY_BYTES = 150 * 1024 * 1024; // 150 MB single decompressed ZIP entry
export const MAX_ZIP_UNCOMPRESSED_TOTAL_BYTES = 400 * 1024 * 1024; // 400 MB total decompressed bytes
export const MAX_ZIP_ENTRY_COUNT = 5_000; // Max entries in one archive

export const MAX_CSV_TEXT_BYTES = 50 * 1024 * 1024; // 50 MB decoded CSV/TSV/JSON text table
export const MAX_CSV_ROWS = 200_000; // Pathological CSV row cap
export const MAX_SQLITE_DB_BYTES = 250 * 1024 * 1024; // 250 MB raw SQLite binary

const SQLITE_HEADER_MAGIC = 'SQLite format 3\0';

const ALLOWED_CUSTOM_COLOR_KEYS: ReadonlyArray<keyof CustomThemeColors> = [
  'lightPrimary',
  'lightAccent',
  'lightMale',
  'lightCanvas',
  'lightSurface',
  'darkPrimary',
  'darkAccent',
  'darkMale',
  'darkCanvas',
  'darkSurface',
];

const DANGEROUS_RECORD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function formatReadableByteLimit(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${mb >= 10 || Number.isInteger(mb) ? Math.round(mb) : mb.toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${Math.round(bytes)} B`;
}

/**
 * Validates that an uploaded file has a non-empty, finite byte size and does not
 * exceed a rational upper ceiling before the browser reads/decodes it into memory.
 */
export function validateUploadFileSize(
  fileName: string,
  byteSize: number,
  maxBytes: number,
  kindLabel: string
): { ok: true } | { ok: false; error: string } {
  const safeName = sanitizeSingleLineText(fileName || 'selected file', 180) || 'selected file';
  if (!Number.isFinite(byteSize) || byteSize < 0) {
    return {
      ok: false,
      error: `Could not read "${safeName}": invalid file size reported.`,
    };
  }
  if (byteSize === 0) {
    return {
      ok: false,
      error: `File "${safeName}" is empty (0 bytes) and cannot be imported.`,
    };
  }
  if (byteSize > maxBytes) {
    return {
      ok: false,
      error: `File "${safeName}" is ${formatReadableByteLimit(byteSize)}, which exceeds the rational ${formatReadableByteLimit(maxBytes)} limit for ${kindLabel}. Check that you selected the intended file.`,
    };
  }
  return { ok: true };
}

/**
 * Verifies SQLite binary bounds and the mandatory 16-byte `"SQLite format 3\0"` file signature
 * before handing bytes to the WebAssembly SQLite engine.
 */
export function validateSqliteFileHeader(
  bytes: Uint8Array,
  fileName = 'database.sqlite'
): { ok: true } | { ok: false; error: string } {
  const safeName = sanitizeSingleLineText(fileName || 'database.sqlite', 180) || 'database.sqlite';
  const sizeCheck = validateUploadFileSize(safeName, bytes.byteLength, MAX_SQLITE_DB_BYTES, 'a SQLite database');
  if (!sizeCheck.ok) return sizeCheck;

  if (bytes.byteLength < 100) {
    return {
      ok: false,
      error: `File "${safeName}" is too small (${bytes.byteLength} bytes) to be a valid SQLite database.`,
    };
  }

  for (let i = 0; i < SQLITE_HEADER_MAGIC.length; i++) {
    if (bytes[i] !== SQLITE_HEADER_MAGIC.charCodeAt(i)) {
      return {
        ok: false,
        error: `File "${safeName}" does not have a valid SQLite 3 database header. Select a .sqlite or .db file exported by this app.`,
      };
    }
  }

  return { ok: true };
}

export interface SafeUnzipOptions {
  archiveName?: string;
  maxArchiveBytes?: number;
  maxEntries?: number;
  maxEntryBytes?: number;
  maxTotalUncompressedBytes?: number;
  entryFilter?: (entryPath: string) => boolean;
}

/**
 * Safely unpacks a `.zip` archive while enforcing entry count, single-entry size, and
 * cumulative decompressed byte limits BEFORE and AFTER inflating entries to stop ZIP bombs.
 */
export function safeUnzipArchive(
  bytes: Uint8Array,
  options: SafeUnzipOptions = {}
): Record<string, Uint8Array> {
  const archiveName = sanitizeSingleLineText(options.archiveName || 'archive.zip', 180) || 'archive.zip';
  const maxArchiveBytes = options.maxArchiveBytes ?? MAX_ZIP_ARCHIVE_BYTES;
  const maxEntries = options.maxEntries ?? MAX_ZIP_ENTRY_COUNT;
  const maxEntryBytes = options.maxEntryBytes ?? MAX_ZIP_ENTRY_BYTES;
  const maxTotalUncompressedBytes =
    options.maxTotalUncompressedBytes ?? MAX_ZIP_UNCOMPRESSED_TOTAL_BYTES;
  const entryFilter = options.entryFilter;

  const sizeCheck = validateUploadFileSize(
    archiveName,
    bytes.byteLength,
    maxArchiveBytes,
    'a ZIP archive'
  );
  if (!sizeCheck.ok) {
    throw new Error(sizeCheck.error);
  }

  let entryCount = 0;
  let declaredTotalBytes = 0;

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes, {
      filter(file) {
        entryCount++;
        if (entryCount > maxEntries) {
          throw new Error(
            `ZIP archive "${archiveName}" contains more than ${maxEntries.toLocaleString()} entries and was rejected to prevent resource exhaustion.`
          );
        }
        const declaredSize = Number(file.originalSize) || 0;
        if (declaredSize > maxEntryBytes) {
          throw new Error(
            `Entry "${sanitizeSingleLineText(file.name, 120)}" inside "${archiveName}" expands to ${formatReadableByteLimit(declaredSize)}, exceeding the ${formatReadableByteLimit(maxEntryBytes)} per-file limit.`
          );
        }
        declaredTotalBytes += declaredSize;
        if (declaredTotalBytes > maxTotalUncompressedBytes) {
          throw new Error(
            `ZIP archive "${archiveName}" expands beyond the ${formatReadableByteLimit(maxTotalUncompressedBytes)} safety limit.`
          );
        }
        return entryFilter ? Boolean(entryFilter(file.name)) : true;
      },
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('limit') || err.message.includes('entries'))
    ) {
      throw err;
    }
    throw new Error(
      `Could not open ZIP archive "${archiveName}". Ensure the file is a valid, uncorrupted .zip archive.`
    );
  }

  let actualTotalBytes = 0;
  const sanitizedMap: Record<string, Uint8Array> = Object.create(null);
  for (const [entryPath, entryBytes] of Object.entries(unzipped)) {
    if (!isSafeRecordKey(entryPath)) continue;
    if (entryBytes.byteLength > maxEntryBytes) {
      throw new Error(
        `Entry "${sanitizeSingleLineText(entryPath, 120)}" inside "${archiveName}" exceeds the ${formatReadableByteLimit(maxEntryBytes)} decompressed file limit.`
      );
    }
    actualTotalBytes += entryBytes.byteLength;
    if (actualTotalBytes > maxTotalUncompressedBytes) {
      throw new Error(
        `ZIP archive "${archiveName}" decompressed to more than ${formatReadableByteLimit(maxTotalUncompressedBytes)} and was rejected.`
      );
    }
    sanitizedMap[entryPath] = entryBytes;
  }

  return sanitizedMap;
}

/**
 * Strips NUL bytes, unsafe C0/C1 control characters (preserving `\t`, `\n`, `\r`),
 * Trojan-Source bidirectional overrides, and unpaired UTF-16 surrogates, while keeping valid emojis.
 */
export function sanitizePlainText(value: unknown, maxLen = 20_000): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  let out = '';

  for (let i = 0; i < raw.length && out.length < maxLen; i++) {
    const code = raw.charCodeAt(i);

    // Preserve valid surrogate pairs (emojis / supplementary plane characters)
    if (code >= 0xd800 && code <= 0xdbff) {
      if (i + 1 < raw.length) {
        const low = raw.charCodeAt(i + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          if (out.length + 2 > maxLen) break;
          out += raw[i] + raw[i + 1];
          i++;
        }
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      // Unpaired low surrogate
      continue;
    }

    // Strip NUL and C0 controls except \t (0x09), \n (0x0A), \r (0x0D)
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      continue;
    }
    // Strip DEL and C1 controls
    if (code === 0x7f || (code >= 0x80 && code <= 0x9f)) {
      continue;
    }
    // Strip Unicode bidirectional control overrides/isolates
    if ((code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) {
      continue;
    }

    out += raw[i];
  }

  return out;
}

/**
 * Sanitizes single-line text fields (names, tattoos, breeds, IDs, labels) by removing control
 * characters and converting embedded line breaks/tabs into spaces.
 */
export function sanitizeSingleLineText(value: unknown, maxLen = 500): string {
  return sanitizePlainText(value, maxLen)
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
}

/**
 * Strictly validates that an image URL is a base64 raster data URI (`png`, `jpeg`, `webp`,
 * `gif`, `avif`, `bmp`). Blocks `image/svg+xml`, `javascript:`, HTML quotes, and oversized strings.
 */
export function sanitizeSafeRasterImageDataUrl(
  value: unknown,
  maxChars = 15_000_000
): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxChars) return '';
  const match = trimmed.match(
    /^data:image\/(png|jpe?g|pjpeg|webp|gif|avif|bmp);base64,([A-Za-z0-9+/=\s]+)$/i
  );
  if (!match) return '';
  const subtype = match[1].toLowerCase() === 'pjpeg' ? 'jpeg' : match[1].toLowerCase();
  const cleanPayload = match[2].replace(/\s+/g, '');
  if (!cleanPayload) return '';
  return `data:image/${subtype};base64,${cleanPayload}`;
}

/**
 * Detects SVG images by MIME type, filename extension, or leading `<svg` markup so they
 * cannot smuggle executable XML/script payloads through image upload fields.
 */
export function isSvgImageInput(
  mimeType: string | undefined,
  fileName: string | undefined,
  bytesPrefix?: Uint8Array
): boolean {
  if (mimeType && /svg/i.test(mimeType)) return true;
  if (fileName && /\.svgz?$/i.test(fileName.trim())) return true;
  if (bytesPrefix && bytesPrefix.length > 0) {
    const headLen = Math.min(bytesPrefix.length, 512);
    let head = '';
    for (let i = 0; i < headLen; i++) {
      const ch = bytesPrefix[i];
      if (ch === 0) break;
      head += String.fromCharCode(ch);
    }
    if (/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(head)) return true;
  }
  return false;
}

/**
 * Validates that a CSS color value is strictly a 6-digit `#RRGGBB` hex string.
 */
export function sanitizeCssHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toUpperCase() : undefined;
}

/**
 * Filters a user/imported custom theme palette down to the exact allowed `CustomThemeColors`
 * keys with validated `#RRGGBB` hex colors.
 */
export function sanitizeCustomColors(raw: unknown): CustomThemeColors | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  const clean: CustomThemeColors = {};
  let hasAny = false;

  for (const key of ALLOWED_CUSTOM_COLOR_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    const validHex = sanitizeCssHexColor(src[key]);
    if (validHex) {
      clean[key] = validHex;
      hasAny = true;
    }
  }
  return hasAny ? clean : undefined;
}

/**
 * Neutralizes spreadsheet formula injection (CSV Injection) on cells whose first character
 * or trimmed-start character triggers formula evaluation (`=`, `+`, `-`, `@`, `\t`, `\r`),
 * while preserving legitimate purely negative numeric values like `-12.5`.
 */
export function sanitizeCsvFormulaCell(rawText: string): string {
  if (!rawText) return '';
  if (/^\s*-\d+(?:\.\d+)?\s*$/.test(rawText)) {
    return rawText;
  }
  const firstChar = rawText[0];
  const trimmedFirst = rawText.trimStart()[0];
  if (
    firstChar === '=' ||
    firstChar === '+' ||
    firstChar === '-' ||
    firstChar === '@' ||
    firstChar === '\t' ||
    firstChar === '\r' ||
    trimmedFirst === '=' ||
    trimmedFirst === '+' ||
    trimmedFirst === '-' ||
    trimmedFirst === '@'
  ) {
    return `'${rawText}`;
  }
  return rawText;
}

/**
 * Escapes all HTML meta-characters including single quotes (`&#39;`).
 */
export function escapeSafeHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Returns `false` for prototype-polluting object keys (`__proto__`, `constructor`, `prototype`).
 */
export function isSafeRecordKey(key: unknown): key is string {
  return typeof key === 'string' && key.length > 0 && !DANGEROUS_RECORD_KEYS.has(key);
}

/**
 * Copies plain JSON object string/string[] dictionaries safely without inheriting or
 * mutating prototype chains.
 */
export function sanitizePlainDictionary<T>(
  raw: unknown,
  coerceValue: (val: unknown) => T | undefined,
  maxEntries = 500
): Record<string, T> {
  const out: Record<string, T> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  let count = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= maxEntries) break;
    if (!isSafeRecordKey(k)) continue;
    const coerced = coerceValue(v);
    if (coerced !== undefined) {
      out[k] = coerced;
      count++;
    }
  }
  return out;
}

const VALID_SYNC_ENTITY_TYPES = new Set<SyncEntityType>([
  'animal',
  'breeding',
  'task',
  'careLog',
  'show',
  'cage',
  'species',
  'settings',
  'photo',
  'feedBatch',
  'feedAllocation',
  'ledgerEntry',
  'processingLog',
  'youthProjectBook',
  'clientContact',
  'waitlistEntry',
  'animalReservation',
  'woolHarvest',
]);

export const ALLOWED_SYNC_FIELDS_BY_ENTITY: Record<SyncEntityType, ReadonlySet<string>> = {
  animal: new Set([
    'tattoo',
    'name',
    'species',
    'breed',
    'variety',
    'sex',
    'status',
    'archived',
    'needsAttention',
    'ignoredConflicts',
    'birthDateIso',
    'weightGrams',
    'genotype',
    'genotypeRaw',
    'rufusLevel',
    'suspectedCarrierOf',
    'confirmedCarrierOf',
    'clearedCarrierOf',
    'registrationNumber',
    'grandChampionNumber',
    'legsCount',
    'cageLocation',
    'breederName',
    'ownerName',
    'ownershipType',
    'culled',
    'cullDateIso',
    'cullReason',
    'deceasedDateIso',
    'deathCause',
    'soldDateIso',
    'salePriceCents',
    'purchaseCostCents',
    'buyerName',
    'sireId',
    'damId',
    'notes',
    '_rev',
  ]),
  breeding: new Set([
    'species',
    'sireId',
    'damId',
    'sireName',
    'damName',
    'bredDateIso',
    'expectedDueDateIso',
    'actualBirthDateIso',
    'projectedCoiPercent',
    'liveCount',
    'stillbornCount',
    'fosteredCount',
    'weanedCount',
    'offspringCreated',
    'status',
    'serviceFeeCents',
    'serviceFeeDirection',
    'ultrasoundDateIso',
    'ultrasoundResult',
    'ultrasoundFetalCount',
    'ultrasoundProjectedDueIso',
    'notes',
    '_rev',
  ]),
  task: new Set([
    'species',
    'title',
    'category',
    'priority',
    'dueDateIso',
    'linkedAnimalId',
    'linkedAnimalName',
    'linkedBreedingId',
    'completed',
    '_rev',
  ]),
  careLog: new Set([
    'species',
    'animalId',
    'dateIso',
    'type',
    'title',
    'weightGrams',
    'showLegEarned',
    'medicationName',
    'dosage',
    'administrationRoute',
    'withdrawalDays',
    'withdrawalClearDateIso',
    'bodyConditionScore',
    'famachaScore',
    'fecalEggCount',
    'ultrasoundResult',
    'ultrasoundFetalCount',
    'notes',
    '_rev',
  ]),
  show: new Set([
    'species',
    'name',
    'location',
    'sanctioningBody',
    'eventDateIso',
    'entryDeadlineIso',
    'enteredAnimalIds',
    'notes',
    '_rev',
  ]),
  cage: new Set(['species', 'label', 'section', 'capacity', 'notes', '_rev']),
  species: new Set([
    'name',
    'sortOrder',
    'defaultAnimalPrefix',
    'preferredUnit',
    'memoText',
    'memoUpdatedAt',
    'gestationDays',
    'rebreedDaysAfterBirth',
    'weanDaysAfterBirth',
    'maturityDays',
    'birthEventLabel',
    'maleLabel',
    'femaleLabel',
    'offspringLabel',
    'exampleBreeds',
    'milestones',
    '_rev',
  ]),
  settings: new Set([
    'barnName',
    'breederName',
    'preferredUnit',
    'currencyCode',
    'defaultSpecies',
    'pinnedLandingSpecies',
    'defaultGenerations',
    'themeMode',
    'customColors',
    'imageOptimizationPreset',
    'showHomeSummaryGrid',
    'barnNameOnboarded',
    'ignoredTaskIds',
    'dismissedTaskGroupKeys',
    'dismissedMemoAlertSignatures',
    'speciesHubBlockOrder',
    'includePhotoOnPedigree',
    'breederLogoDataUrl',
    'calendarSync',
    '_rev',
  ]),
  photo: new Set([
    'species',
    'animalId',
    'isPrimary',
    'sortOrder',
    'caption',
    'originalFileName',
    'mimeType',
    'width',
    'height',
    'originalBytes',
    'storedBytes',
    'thumbnailDataUrl',
    'dataUrl',
    '_rev',
  ]),
  feedBatch: new Set([
    'species',
    'brand',
    'productName',
    'lotNumber',
    'millCode',
    'manufactureDateIso',
    'purchaseDateIso',
    'bagCount',
    'bagWeightValue',
    'bagWeightUnit',
    'totalQuantity',
    'remainingQuantity',
    'lowStockThreshold',
    'totalCostCents',
    'supplierName',
    'proteinPercent',
    'notes',
    'tagPhotoDataUrl',
    'tagPhotoThumbnailDataUrl',
    'tagPhotoMimeType',
    'tagPhotoBytes',
    'tagPhotoCapturedDateIso',
    'tagPhotoPurgedAtIso',
    'tagPhotoBytesReclaimed',
    'ocrRawText',
    'ocrConfidence',
    'ocrManualOverride',
    'recallFlagged',
    'recallNote',
    '_rev',
  ]),
  feedAllocation: new Set([
    'species',
    'feedBatchId',
    'targetType',
    'targetId',
    'targetLabel',
    'dateIso',
    'quantity',
    'unit',
    'notes',
    '_rev',
  ]),
  ledgerEntry: new Set([
    'species',
    'dateIso',
    'entryType',
    'category',
    'amountCents',
    'title',
    'vendorOrParty',
    'linkedAnimalId',
    'linkedBreedingId',
    'linkedFeedBatchId',
    'linkedProjectId',
    'receiptPhotoDataUrl',
    'receiptPhotoThumbnailDataUrl',
    'receiptPhotoMimeType',
    'receiptPhotoBytes',
    'notes',
    '_rev',
  ]),
  processingLog: new Set([
    'species',
    'title',
    'linkedAnimalId',
    'linkedBreedingId',
    'scheduledDateIso',
    'harvestDateIso',
    'status',
    'animalCount',
    'liveWeightGrams',
    'dressedWeightGrams',
    'dressOutPercent',
    'peltCount',
    'peltGrade',
    'peltColorNotes',
    'processingCostCents',
    'meatValueCents',
    'peltValueCents',
    'notes',
    '_rev',
  ]),
  youthProjectBook: new Set([
    'species',
    'organization',
    'projectTitle',
    'memberName',
    'clubOrChapter',
    'leaderOrAdvisor',
    'projectYear',
    'startDateIso',
    'endDateIso',
    'status',
    'linkedAnimalIds',
    'linkedBreedingIds',
    'startingInventoryValueCents',
    'endingInventoryValueCents',
    'feedLogs',
    'goalsAndReflection',
    'showAndCommunityNotes',
    'notes',
    '_rev',
  ]),
  clientContact: new Set([
    'species',
    'fullName',
    'ranchOrHerdName',
    'email',
    'phone',
    'preferredContact',
    'clientKind',
    'cityState',
    'shippingAddress',
    'tags',
    'notes',
    '_rev',
  ]),
  waitlistEntry: new Set([
    'species',
    'clientId',
    'clientName',
    'priorityRank',
    'status',
    'intent',
    'desiredBreed',
    'desiredVariety',
    'preferredSex',
    'preferredBreedingId',
    'requestedByDateIso',
    'inquiryDateIso',
    'followUpDateIso',
    'lastContactedDateIso',
    'maxBudgetCents',
    'notes',
    '_rev',
  ]),
  animalReservation: new Set([
    'species',
    'agreementNumber',
    'clientId',
    'clientName',
    'waitlistEntryId',
    'animalId',
    'breedingId',
    'pickOrder',
    'itemLabel',
    'status',
    'reservedDateIso',
    'holdExpiresDateIso',
    'totalPriceCents',
    'depositRequiredCents',
    'depositPaidCents',
    'depositDueDateIso',
    'depositPaidDateIso',
    'pickupScheduledDateIso',
    'completedDateIso',
    'balanceReminderDateIso',
    'paymentMethod',
    'ledgerEntryId',
    'termsSummary',
    'healthGuaranteeNotes',
    'notes',
    '_rev',
  ]),
  woolHarvest: new Set([
    'species',
    'animalId',
    'harvestDateIso',
    'shearingIntervalDays',
    'primeWeightGrams',
    'gradeWeightGrams',
    'harvestMethod',
    'stapleLengthMm',
    'iagarbScore',
    'witnessedBy',
    'notes',
    '_rev',
  ]),
};

/**
 * Validates that an incoming `SyncOperation` has valid entity types, safe field names
 * (preventing `__proto__`/prototype injection or arbitrary properties), and well-typed metadata.
 */
export function isValidSyncOperation(op: unknown): op is SyncOperation {
  if (!op || typeof op !== 'object' || Array.isArray(op)) return false;
  const candidate = op as Record<string, unknown>;
  if (typeof candidate.op_id !== 'string' || !candidate.op_id.trim()) return false;
  if (typeof candidate.entity_type !== 'string' || !VALID_SYNC_ENTITY_TYPES.has(candidate.entity_type as SyncEntityType)) {
    return false;
  }
  if (typeof candidate.entity_uuid !== 'string' || !candidate.entity_uuid.trim()) return false;
  if (typeof candidate.device_id !== 'string' || !candidate.device_id.trim()) return false;
  if (typeof candidate.timestamp !== 'string' || !candidate.timestamp.trim()) return false;
  if (typeof candidate.logical_counter !== 'number' || !Number.isFinite(candidate.logical_counter)) {
    return false;
  }
  if (
    candidate.record_rev !== undefined &&
    (typeof candidate.record_rev !== 'number' ||
      !Number.isFinite(candidate.record_rev) ||
      candidate.record_rev < 0)
  ) {
    return false;
  }
  const field = candidate.field_name;
  if (!isSafeRecordKey(field)) return false;
  if (field === '__create__' || field === '__delete__') {
    if (field === '__create__') {
      if (!candidate.new_value || typeof candidate.new_value !== 'object' || Array.isArray(candidate.new_value)) {
        return false;
      }
    }
    return true;
  }
  return ALLOWED_SYNC_FIELDS_BY_ENTITY[candidate.entity_type as SyncEntityType].has(field);
}
```

## `src/core/models.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Domain Models for the Community Pedigree Project (Package: Pedigree).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * This module has ZERO browser DOM (`window`, `document`) or framework dependencies.
 * It can be copied directly into a React Native / Expo project (`expo-sqlite`) without
 * modification. Every persisted entity carries a globally unique `id` (UUID v4) and an
 * ISO-8601 UTC `updatedAt` timestamp for deterministic multi-device file merging, plus
 * clean 1:1 compatibility with JSON, CSV, Evans .HTM, and PDF exports.
 */

import type { ImageOptimizationPresetId } from './imageOptimizationSpec';
import type { CustomThemeColors } from './themePalette';

export type BiologicalSex = 'Male' | 'Female' | 'Unknown';

export type AnimalConflictKind = 'duplicate_tattoo' | 'parent_sex_mismatch';

export function normalizeIgnoredConflicts(raw: unknown): AnimalConflictKind[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<AnimalConflictKind>();
  for (const item of raw) {
    if (item === 'duplicate_tattoo' || item === 'parent_sex_mismatch') {
      seen.add(item);
    }
  }
  return Array.from(seen);
}

export type AnimalStatus = 'Active' | 'Junior' | 'Retired' | 'Archived' | 'Sold' | 'Deceased';

export type BreedingStatus =
  | 'Planned'
  | 'Bred'
  | 'Palpated Positive'
  | 'Born'
  | 'Weaned'
  | 'Missed';

export type TaskCategory =
  | 'Care'
  | 'Palpation'
  | 'Nestbox'
  | 'Birth Check'
  | 'Weaning'
  | 'Rebreed'
  | 'Health'
  | 'Show Prep'
  | 'Other';

export type TaskPriority = 'High' | 'Normal' | 'Low';

export type MilestoneRelativeTo = 'AFTER_BRED' | 'BEFORE_BIRTH' | 'AFTER_BIRTH';

export type WeightUnit = 'lbs_oz' | 'lbs' | 'grams' | 'kg';

export const WEIGHT_UNIT_OPTIONS: ReadonlyArray<{ value: WeightUnit; label: string; shortLabel: string }> = [
  { value: 'lbs_oz', label: 'Pounds & Oz', shortLabel: 'lbs / oz' },
  { value: 'lbs', label: 'Decimal Pounds', shortLabel: 'lbs' },
  { value: 'kg', label: 'Kilograms (Metric)', shortLabel: 'kg' },
  { value: 'grams', label: 'Grams (Metric)', shortLabel: 'g' },
];

export function normalizeWeightUnit(raw: unknown, fallback: WeightUnit = 'lbs_oz'): WeightUnit {
  if (raw === 'lbs_oz' || raw === 'lbs' || raw === 'grams' || raw === 'kg') {
    return raw;
  }
  return fallback;
}

export type CareLogType =
  | 'Weight Check'
  | 'Show / Leg'
  | 'Palpation'
  | 'Ultrasound'
  | 'Health / Vet'
  | 'Health Score / BCS'
  | 'Grooming & Hoof'
  | 'Journal Note';

export type OwnershipType = 'Owned' | 'Reference' | 'Outside';

export const OWNERSHIP_TYPES: ReadonlyArray<{ value: OwnershipType; label: string }> = [
  { value: 'Owned', label: 'Owned in My Barn' },
  { value: 'Reference', label: 'Pedigree Reference' },
  { value: 'Outside', label: 'Outside Stock' },
];

export function normalizeOwnershipType(
  raw: unknown,
  fallback: OwnershipType = 'Owned'
): OwnershipType {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  if (clean === 'owned' || clean === 'in barn' || clean === 'my barn') return 'Owned';
  if (clean === 'reference' || clean === 'pedigree reference') return 'Reference';
  if (clean === 'outside' || clean === 'outside stock') return 'Outside';
  return fallback;
}

export type ServiceFeeDirection = 'earned' | 'paid' | 'none';

export function normalizeServiceFeeDirection(raw: unknown): ServiceFeeDirection {
  if (raw === 'earned' || raw === 'paid' || raw === 'none') return raw;
  return 'none';
}

export type UltrasoundResult = '' | 'Positive' | 'Negative' | 'Inconclusive';

export const ULTRASOUND_RESULTS: ReadonlyArray<{ value: UltrasoundResult; label: string }> = [
  { value: '', label: 'Not recorded' },
  { value: 'Positive', label: 'Positive (Pregnant)' },
  { value: 'Negative', label: 'Negative (Open)' },
  { value: 'Inconclusive', label: 'Inconclusive / Recheck' },
];

export function normalizeUltrasoundResult(raw: unknown): UltrasoundResult {
  if (typeof raw !== 'string') return '';
  const clean = raw.trim().toLowerCase();
  if (clean === 'positive' || clean === 'pregnant' || clean === 'pos' || clean === '+') {
    return 'Positive';
  }
  if (clean === 'negative' || clean === 'open' || clean === 'neg' || clean === '-') {
    return 'Negative';
  }
  if (clean === 'inconclusive' || clean === 'recheck') {
    return 'Inconclusive';
  }
  return '';
}

export function normalizeCurrencyCode(raw: unknown, fallback = 'USD'): string {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(clean) ? clean : fallback;
}

export function formatCurrencyCents(
  cents: number | undefined,
  currencyCode = 'USD'
): string {
  const safeCents = Number.isFinite(Number(cents)) ? Math.round(Number(cents)) : 0;
  const amount = safeCents / 100;
  const code = normalizeCurrencyCode(currencyCode, 'USD');
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

/**
 * Single coat-color or trait locus pair (e.g., Rabbit Extension locus `{ locus: 'E', allele1: 'e', allele2: 'e' }`).
 * An unknown second allele is represented with `'_'` (e.g., `A_`).
 */
export interface GenotypeAllelePair {
  locus: string;
  allele1: string;
  allele2: string;
}

/**
 * Polygenic red/amber pigment richness modifier (tracked independently of Mendelian Wide-Band `ww`).
 */
export type RufusLevel = '' | 'Low' | 'Medium' | 'High';

export const RUFUS_LEVEL_OPTIONS: ReadonlyArray<{ value: RufusLevel; label: string }> = [
  { value: '', label: 'Unspecified' },
  { value: 'High', label: 'High Rufus (Deep Rich Red)' },
  { value: 'Medium', label: 'Medium Rufus' },
  { value: 'Low', label: 'Low Rufus (Pale / Washy)' },
];

export function normalizeRufusLevel(raw: unknown): RufusLevel {
  if (typeof raw !== 'string') return '';
  const clean = raw.trim().toLowerCase();
  if (clean === 'high' || clean === 'high rufus') return 'High';
  if (clean === 'medium' || clean === 'med' || clean === 'medium rufus') return 'Medium';
  if (clean === 'low' || clean === 'low rufus') return 'Low';
  return '';
}

export type ClearedCarrierProofType =
  | 'test_bred'
  | 'dna_tested'
  | 'homozygous_locus'
  | 'breeder_verified';

export const CLEARED_CARRIER_PROOF_LABELS: Record<ClearedCarrierProofType, string> = {
  test_bred: 'Test Bred (Clear)',
  dna_tested: 'DNA Tested Clear',
  homozygous_locus: 'Verified Homozygous Coat Locus',
  breeder_verified: 'Breeder Verified Clear',
};

export interface ClearedCarrierRecord {
  trait: string;
  proofType: ClearedCarrierProofType;
  testBreedingCount?: number;
  note?: string;
  recordedAt?: string;
}

export type SpeciesHubBlockId = 'tasks' | 'breedings' | 'cages' | 'feed' | 'shows';

export const DEFAULT_SPECIES_HUB_BLOCK_ORDER: SpeciesHubBlockId[] = [
  'tasks',
  'breedings',
  'cages',
  'feed',
  'shows',
];

export function normalizeSpeciesHubBlockOrder(raw?: unknown): SpeciesHubBlockId[] {
  const allowed = new Set<SpeciesHubBlockId>(DEFAULT_SPECIES_HUB_BLOCK_ORDER);
  const ordered: SpeciesHubBlockId[] = [];
  const seen = new Set<SpeciesHubBlockId>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string' && allowed.has(item as SpeciesHubBlockId)) {
        const id = item as SpeciesHubBlockId;
        if (!seen.has(id)) {
          seen.add(id);
          ordered.push(id);
        }
      }
    }
  }
  for (const defId of DEFAULT_SPECIES_HUB_BLOCK_ORDER) {
    if (!seen.has(defId)) {
      ordered.push(defId);
    }
  }
  return ordered;
}

export type CalendarDeliveryMode =
  | 'offline_ics'
  | 'google_calendar'
  | 'external_app_or_ics';

export interface CalendarSyncSettings {
  autoAddNewTasks: boolean;
  includeBreedingTasks: boolean;
  includeManualTasks: boolean;
  reminderTimeLocal: string;
  alarmEnabled: boolean;
  alarmMinutesBefore: number;
  includeAnimalPrefix: boolean;
  includeAnimalName: boolean;
  deliveryMode: CalendarDeliveryMode;
  googleCalendarId: string;
  googleCalendarName: string;
}

export const DEFAULT_CALENDAR_SYNC_SETTINGS: CalendarSyncSettings = {
  autoAddNewTasks: false,
  includeBreedingTasks: true,
  includeManualTasks: true,
  reminderTimeLocal: '08:00',
  alarmEnabled: true,
  alarmMinutesBefore: 15,
  includeAnimalPrefix: true,
  includeAnimalName: true,
  deliveryMode: 'offline_ics',
  googleCalendarId: 'primary',
  googleCalendarName: 'Primary Google Calendar',
};

export function normalizeCalendarSyncSettings(raw?: unknown): CalendarSyncSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawTime = typeof obj.reminderTimeLocal === 'string' ? obj.reminderTimeLocal.trim() : '';
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime)
    ? rawTime
    : DEFAULT_CALENDAR_SYNC_SETTINGS.reminderTimeLocal;
  const rawLead = Number(obj.alarmMinutesBefore);
  const validLead =
    Number.isFinite(rawLead) && rawLead >= 0
      ? Math.round(rawLead)
      : DEFAULT_CALENDAR_SYNC_SETTINGS.alarmMinutesBefore;
  const rawDelivery = obj.deliveryMode;
  const validDelivery: CalendarDeliveryMode =
    rawDelivery === 'google_calendar' ||
    rawDelivery === 'external_app_or_ics' ||
    rawDelivery === 'offline_ics'
      ? rawDelivery
      : DEFAULT_CALENDAR_SYNC_SETTINGS.deliveryMode;
  const rawCalId =
    typeof obj.googleCalendarId === 'string' && obj.googleCalendarId.trim()
      ? obj.googleCalendarId.trim()
      : DEFAULT_CALENDAR_SYNC_SETTINGS.googleCalendarId;
  const rawCalName =
    typeof obj.googleCalendarName === 'string' && obj.googleCalendarName.trim()
      ? obj.googleCalendarName.trim()
      : DEFAULT_CALENDAR_SYNC_SETTINGS.googleCalendarName;

  return {
    autoAddNewTasks:
      typeof obj.autoAddNewTasks === 'boolean'
        ? obj.autoAddNewTasks
        : DEFAULT_CALENDAR_SYNC_SETTINGS.autoAddNewTasks,
    includeBreedingTasks:
      typeof obj.includeBreedingTasks === 'boolean'
        ? obj.includeBreedingTasks
        : DEFAULT_CALENDAR_SYNC_SETTINGS.includeBreedingTasks,
    includeManualTasks:
      typeof obj.includeManualTasks === 'boolean'
        ? obj.includeManualTasks
        : DEFAULT_CALENDAR_SYNC_SETTINGS.includeManualTasks,
    reminderTimeLocal: validTime,
    alarmEnabled:
      typeof obj.alarmEnabled === 'boolean'
        ? obj.alarmEnabled
        : DEFAULT_CALENDAR_SYNC_SETTINGS.alarmEnabled,
    alarmMinutesBefore: validLead,
    includeAnimalPrefix:
      typeof obj.includeAnimalPrefix === 'boolean'
        ? obj.includeAnimalPrefix
        : DEFAULT_CALENDAR_SYNC_SETTINGS.includeAnimalPrefix,
    includeAnimalName:
      typeof obj.includeAnimalName === 'boolean'
        ? obj.includeAnimalName
        : DEFAULT_CALENDAR_SYNC_SETTINGS.includeAnimalName,
    deliveryMode: validDelivery,
    googleCalendarId: rawCalId,
    googleCalendarName: rawCalName,
  };
}

/**
 * Global Barn preferences stored locally on the user's device.
 * `pinnedLandingSpecies`:
 *   - `""` (empty string) opens on the Multi-Species Home Landing Page.
 *   - Any configured species name (e.g. `"Rabbit"`, `"Goat"`) opens directly inside that species' hub.
 */
export type DefaultPedigreeGenerations = 3 | 4 | 5 | 6;
export type PedigreeGenerationDepth = 3 | 4 | 5 | 6 | 7 | 8;

export function normalizePedigreeGenerationDepth(
  value: unknown,
  fallback: PedigreeGenerationDepth = 3
): PedigreeGenerationDepth {
  const n = Number(value);
  if (n === 3 || n === 4 || n === 5 || n === 6 || n === 7 || n === 8) {
    return n;
  }
  return fallback;
}

export function normalizeDefaultPedigreeGenerations(
  value: unknown,
  fallback: DefaultPedigreeGenerations = 3
): DefaultPedigreeGenerations {
  const n = Number(value);
  if (n === 3 || n === 4 || n === 5 || n === 6) {
    return n;
  }
  return fallback;
}

export interface BarnSettings {
  id: string;
  barnName: string;
  breederName: string;
  preferredUnit: WeightUnit;
  currencyCode?: string;
  defaultSpecies: string;
  pinnedLandingSpecies: string;
  defaultGenerations: DefaultPedigreeGenerations;
  themeMode: 'light' | 'dark';
  customColors?: CustomThemeColors;
  imageOptimizationPreset?: ImageOptimizationPresetId;
  showHomeSummaryGrid?: boolean;
  barnNameOnboarded?: boolean;
  ignoredTaskIds?: string[];
  dismissedTaskGroupKeys?: Record<string, string | string[]>;
  dismissedMemoAlertSignatures?: Record<string, string>;
  speciesHubBlockOrder?: Record<string, SpeciesHubBlockId[]>;
  includePhotoOnPedigree?: boolean;
  breederLogoDataUrl?: string;
  calendarSync?: CalendarSyncSettings;
  autoOffloadRetiredToOpfs?: boolean;
  feedTagPurgeWindowDays?: FeedPurgeWindowDays;
  lastBackupMeta?: {
    exportedAtIso: string;
    format: 'zip' | 'sqlite' | 'json';
    fileName?: string;
  };
  backupReminderSnoozedUntilMs?: number;
  _rev?: number;
  updatedAt: string;
}

/**
 * Configurable care or biological milestone rule attached to a `SpeciesProfile`.
 * Used by the Master Task List engine to automatically cascade barn chores when a breeding is logged.
 */
export interface SpeciesMilestoneTemplate {
  label: string;
  relativeTo: MilestoneRelativeTo;
  daysOffset: number;
  category: TaskCategory;
  priority: TaskPriority;
}

export interface BreedMilestoneOffsetOverride {
  label: string;
  daysOffset: number;
}

export interface BreedScheduleOverride {
  breed: string;
  gestationDays?: number;
  weanDaysAfterBirth?: number;
  rebreedDaysAfterBirth?: number;
  maturityDays?: number;
  milestoneOverrides?: BreedMilestoneOffsetOverride[];
}

export function normalizeBreedScheduleOverrides(raw: unknown): BreedScheduleOverride[] {
  if (!Array.isArray(raw)) return [];
  const byBreedKey = new Map<string, BreedScheduleOverride>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const obj = entry as Record<string, unknown>;
    const breed = typeof obj.breed === 'string' ? obj.breed.trim().slice(0, 120) : '';
    if (!breed) continue;

    const cleanPosInt = (val: unknown, max: number): number | undefined => {
      if (val === undefined || val === null || val === '') return undefined;
      const n = Number(val);
      if (!Number.isFinite(n) || n <= 0) return undefined;
      return Math.min(max, Math.max(1, Math.round(n)));
    };
    const cleanNonNegInt = (val: unknown, max: number): number | undefined => {
      if (val === undefined || val === null || val === '') return undefined;
      const n = Number(val);
      if (!Number.isFinite(n) || n < 0) return undefined;
      return Math.min(max, Math.round(n));
    };

    const gestationDays = cleanPosInt(obj.gestationDays, 750);
    const weanDaysAfterBirth = cleanPosInt(obj.weanDaysAfterBirth, 600);
    const rebreedDaysAfterBirth = cleanNonNegInt(obj.rebreedDaysAfterBirth, 600);
    const maturityDays = cleanPosInt(obj.maturityDays, 1500);

    let milestoneOverrides: BreedMilestoneOffsetOverride[] | undefined;
    if (Array.isArray(obj.milestoneOverrides)) {
      const byLabelKey = new Map<string, BreedMilestoneOffsetOverride>();
      for (const mo of obj.milestoneOverrides) {
        if (!mo || typeof mo !== 'object' || Array.isArray(mo)) continue;
        const mObj = mo as Record<string, unknown>;
        const label = typeof mObj.label === 'string' ? mObj.label.trim().slice(0, 120) : '';
        const daysNum = Number(mObj.daysOffset);
        if (!label || !Number.isFinite(daysNum) || daysNum < 0) continue;
        byLabelKey.set(label.toLowerCase(), {
          label,
          daysOffset: Math.min(700, Math.round(daysNum)),
        });
      }
      if (byLabelKey.size > 0) {
        milestoneOverrides = Array.from(byLabelKey.values());
      }
    }

    if (
      gestationDays === undefined &&
      weanDaysAfterBirth === undefined &&
      rebreedDaysAfterBirth === undefined &&
      maturityDays === undefined &&
      (!milestoneOverrides || milestoneOverrides.length === 0)
    ) {
      continue;
    }

    const clean: BreedScheduleOverride = { breed };
    if (gestationDays !== undefined) clean.gestationDays = gestationDays;
    if (weanDaysAfterBirth !== undefined) clean.weanDaysAfterBirth = weanDaysAfterBirth;
    if (rebreedDaysAfterBirth !== undefined) clean.rebreedDaysAfterBirth = rebreedDaysAfterBirth;
    if (maturityDays !== undefined) clean.maturityDays = maturityDays;
    if (milestoneOverrides && milestoneOverrides.length > 0) {
      clean.milestoneOverrides = milestoneOverrides;
    }
    byBreedKey.set(breed.toLowerCase(), clean);
  }
  return Array.from(byBreedKey.values()).sort((a, b) => a.breed.localeCompare(b.breed));
}

export interface TargetWeightPoint {
  ageDays: number;
  weightGrams: number;
  label?: string;
}

export function normalizeTargetWeightCurve(raw: unknown): TargetWeightPoint[] {
  if (!Array.isArray(raw)) return [];
  const byAge = new Map<number, TargetWeightPoint>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const obj = entry as Record<string, unknown>;
    const ageNum = Number(obj.ageDays);
    const weightNum = Number(obj.weightGrams);
    if (!Number.isFinite(ageNum) || ageNum < 0 || !Number.isFinite(weightNum) || weightNum <= 0) {
      continue;
    }
    const ageDays = Math.min(2000, Math.round(ageNum));
    const weightGrams = Math.round(weightNum);
    const label = typeof obj.label === 'string' ? obj.label.trim().slice(0, 60) : '';
    byAge.set(ageDays, {
      ageDays,
      weightGrams,
      ...(label ? { label } : {}),
    });
  }
  return Array.from(byAge.values()).sort((a, b) => a.ageDays - b.ageDays);
}

/**
 * Livestock species biological schedule, sex/offspring terminology, and Master Task List templates.
 */
export interface SpeciesProfile {
  id: string;
  name: string;
  sortOrder?: number;
  defaultAnimalPrefix?: string;
  preferredUnit?: WeightUnit;
  memoText?: string;
  memoUpdatedAt?: string;
  gestationDays: number;
  rebreedDaysAfterBirth: number;
  weanDaysAfterBirth: number;
  maturityDays?: number;
  birthEventLabel: string;
  maleLabel: string;
  femaleLabel: string;
  offspringLabel: string;
  exampleBreeds: string[];
  milestones: SpeciesMilestoneTemplate[];
  breedOverrides?: BreedScheduleOverride[];
  targetWeightCurve?: TargetWeightPoint[];
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Individual animal registry record.
 * Multi-photo attachments live in the dedicated `AnimalPhoto` table (`animal_photos`) so core
 * pedigree and COI queries remain lightweight.
 */
export interface Animal {
  id: string;
  tattoo: string;
  name: string;
  species: string;
  breed: string;
  variety: string;
  sex: BiologicalSex;
  status: AnimalStatus;
  archived?: boolean;
  needsAttention?: boolean;
  ignoredConflicts?: AnimalConflictKind[];
  birthDateIso: string; // YYYY-MM-DD or ""
  weightGrams: number;
  genotype: GenotypeAllelePair[];
  genotypeRaw: string;
  rufusLevel?: RufusLevel;
  suspectedCarrierOf?: string[];
  confirmedCarrierOf?: string[];
  clearedCarrierOf?: ClearedCarrierRecord[];
  registrationNumber: string;
  grandChampionNumber: string;
  legsCount: number;
  cageLocation: string;
  breederName: string;
  ownerName: string;
  ownershipType?: OwnershipType;
  culled?: boolean;
  cullDateIso?: string;
  cullReason?: string;
  deceasedDateIso?: string;
  deathCause?: string;
  soldDateIso?: string;
  salePriceCents?: number;
  purchaseCostCents?: number;
  buyerName?: string;
  sireId: string;
  damId: string;
  notes: string;
  offloadedArchiveKey?: string;
  offloadedAtIso?: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export type HousingUnitType = 'hutch' | 'cage' | 'pen' | 'stall' | 'pasture' | 'colony';

export const HOUSING_UNIT_TYPES: ReadonlyArray<{ value: HousingUnitType; label: string }> = [
  { value: 'hutch', label: 'Hutch' },
  { value: 'cage', label: 'Cage' },
  { value: 'pen', label: 'Pen' },
  { value: 'stall', label: 'Stall' },
  { value: 'pasture', label: 'Pasture / Paddock' },
  { value: 'colony', label: 'Colony / Group Run' },
];

export function normalizeHousingUnitType(raw: unknown): HousingUnitType | undefined {
  if (typeof raw !== 'string') return undefined;
  const clean = raw.trim().toLowerCase();
  if (
    clean === 'hutch' ||
    clean === 'cage' ||
    clean === 'pen' ||
    clean === 'stall' ||
    clean === 'pasture' ||
    clean === 'colony'
  ) {
    return clean;
  }
  return undefined;
}

/**
 * Physical cage, hutch, pen, stall, or pasture location scoped to a species.
 * Optional feedlot inventory and recurring maintenance fields power the visual Facility Pen Board.
 */
export interface CageLocation {
  id: string;
  species: string;
  label: string;
  section: string;
  capacity: number;
  notes: string;
  unitType?: HousingUnitType;
  feedLotName?: string;
  feedStockRemaining?: number;
  feedStockUnit?: string;
  dailyRationNote?: string;
  feedLowThreshold?: number;
  maintenanceIntervalDays?: number;
  maintenanceTaskLabel?: string;
  lastMaintenanceDateIso?: string; // YYYY-MM-DD or ""
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LitterWeightMilestone {
  id: string;
  ageDays: number;
  dateIso?: string;
  label: string;
  liveCount?: number;
  totalWeightGrams: number;
  avgWeightGrams?: number;
  notes?: string;
}

export function normalizeLitterWeightMilestones(raw: unknown): LitterWeightMilestone[] {
  if (!Array.isArray(raw)) return [];
  const seenIds = new Set<string>();
  const out: LitterWeightMilestone[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const obj = entry as Record<string, unknown>;
    const ageNum = Number(obj.ageDays);
    if (!Number.isFinite(ageNum) || ageNum < 0) continue;
    const ageDays = Math.min(1000, Math.round(ageNum));
    const totalNum = Number(obj.totalWeightGrams);
    const avgNum = Number(obj.avgWeightGrams);
    const liveNum = Number(obj.liveCount);
    const liveCount =
      Number.isFinite(liveNum) && liveNum >= 0 ? Math.min(50, Math.round(liveNum)) : undefined;
    let totalWeightGrams =
      Number.isFinite(totalNum) && totalNum > 0 ? Math.round(totalNum) : 0;
    let avgWeightGrams =
      Number.isFinite(avgNum) && avgNum > 0 ? Math.round(avgNum) : undefined;
    if (totalWeightGrams <= 0 && avgWeightGrams && liveCount && liveCount > 0) {
      totalWeightGrams = Math.round(avgWeightGrams * liveCount);
    }
    if (avgWeightGrams === undefined && totalWeightGrams > 0 && liveCount && liveCount > 0) {
      avgWeightGrams = Math.round(totalWeightGrams / liveCount);
    }
    if (totalWeightGrams <= 0 && !avgWeightGrams && liveCount === undefined) continue;
    const rawId = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim().slice(0, 80) : `lwm-${ageDays}-${i + 1}`;
    const id = seenIds.has(rawId) ? `${rawId}-${i + 1}` : rawId;
    seenIds.add(id);
    const dateIso =
      typeof obj.dateIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.dateIso.trim())
        ? obj.dateIso.trim()
        : undefined;
    const label =
      typeof obj.label === 'string' && obj.label.trim()
        ? obj.label.trim().slice(0, 80)
        : `${ageDays}-Day Check`;
    const notes = typeof obj.notes === 'string' && obj.notes.trim() ? obj.notes.trim().slice(0, 300) : undefined;
    out.push({
      id,
      ageDays,
      ...(dateIso ? { dateIso } : {}),
      label,
      ...(liveCount !== undefined ? { liveCount } : {}),
      totalWeightGrams,
      ...(avgWeightGrams !== undefined ? { avgWeightGrams } : {}),
      ...(notes ? { notes } : {}),
    });
  }
  return out.sort((a, b) => a.ageDays - b.ageDays);
}

/**
 * Breeding pairing and kindling/birth litter record.
 */
export interface BreedingRecord {
  id: string;
  species: string;
  sireId: string;
  damId: string;
  sireName: string;
  damName: string;
  bredDateIso: string; // YYYY-MM-DD
  expectedDueDateIso: string; // YYYY-MM-DD
  actualBirthDateIso: string; // YYYY-MM-DD or ""
  projectedCoiPercent: number;
  liveCount: number;
  stillbornCount: number;
  fosteredCount: number;
  weanedCount: number;
  offspringCreated: boolean;
  status: BreedingStatus;
  serviceFeeCents?: number;
  serviceFeeDirection?: ServiceFeeDirection;
  ultrasoundDateIso?: string;
  ultrasoundResult?: UltrasoundResult;
  ultrasoundFetalCount?: number;
  ultrasoundProjectedDueIso?: string;
  litterWeightMilestones?: LitterWeightMilestone[];
  notes: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Scheduled barn chore or Master Task List cascaded task, strictly scoped to a `species`.
 */
export interface BarnTask {
  id: string;
  species: string;
  title: string;
  category: TaskCategory;
  priority: TaskPriority;
  startDateIso?: string; // YYYY-MM-DD or ""
  dueDateIso: string; // YYYY-MM-DD or ""
  linkedAnimalId: string;
  linkedAnimalName: string;
  linkedBreedingId: string;
  completed: boolean;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Per-animal weight check, show leg, palpation, or health log entry.
 */
export interface CareLog {
  id: string;
  species: string;
  animalId: string;
  dateIso: string; // YYYY-MM-DD
  type: CareLogType;
  title: string;
  weightGrams: number;
  showLegEarned: boolean;
  medicationName?: string;
  dosage?: string;
  administrationRoute?: string;
  withdrawalDays?: number;
  withdrawalClearDateIso?: string;
  bodyConditionScore?: number;
  famachaScore?: number;
  fecalEggCount?: number;
  ultrasoundResult?: UltrasoundResult;
  ultrasoundFetalCount?: number;
  notes: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export type ShowAwardCode = 'BOB' | 'BOS' | 'BIS' | 'GCH' | 'BOV' | 'BOSV' | 'RIS';

export const SHOW_AWARD_OPTIONS: ReadonlyArray<{
  code: ShowAwardCode;
  label: string;
  shortLabel: string;
}> = [
  { code: 'BOB', label: 'Best of Breed (BOB)', shortLabel: 'BOB' },
  { code: 'BOS', label: 'Best of Opposite Sex (BOS)', shortLabel: 'BOS' },
  { code: 'BIS', label: 'Best in Show (BIS)', shortLabel: 'BIS' },
  { code: 'GCH', label: 'Grand Champion (GCH)', shortLabel: 'GCH' },
  { code: 'BOV', label: 'Best of Variety (BOV)', shortLabel: 'BOV' },
  { code: 'BOSV', label: 'Best Opposite Variety (BOSV)', shortLabel: 'BOSV' },
  { code: 'RIS', label: 'Reserve in Show (RIS)', shortLabel: 'RIS' },
];

export interface ShowELegAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  storedBytes: number;
  thumbnailDataUrl: string;
  dataUrl: string;
  caption?: string;
  addedAtIso: string;
}

export interface ShowAnimalResult {
  animalId: string;
  classPlacement: string;
  awards: ShowAwardCode[];
  judgeName?: string;
  judgeNotes: string;
  legsEarned: number;
  pointsEarned?: number;
  legCertificateNumber?: string;
  eLegAttachments: ShowELegAttachment[];
}

/**
 * Livestock or ARBA show event with entered animal roster and structured placements/wins/e-leg vault,
 * scoped to a `species`.
 */
export interface ShowEvent {
  id: string;
  species: string;
  name: string;
  location: string;
  sanctioningBody: string;
  eventDateIso: string; // YYYY-MM-DD
  entryDeadlineIso: string; // YYYY-MM-DD or ""
  enteredAnimalIds: string[];
  results?: ShowAnimalResult[];
  notes: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Optimized per-animal photo record stored in its own relational table (`animal_photos`)
 * so an animal can have 1 or many photos without slowing down pedigree/herd queries.
 * Supports both direct user uploads and batch-optimized platform imports.
 */
export interface AnimalPhoto {
  id: string;
  species: string;
  animalId: string;
  isPrimary: boolean;
  sortOrder: number;
  caption: string;
  originalFileName: string;
  mimeType: string;
  width: number;
  height: number;
  originalBytes: number;
  storedBytes: number;
  thumbnailDataUrl: string;
  dataUrl: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export type FeedPurgeWindowDays = 30 | 60 | 90 | 0;

export const FEED_PURGE_WINDOW_OPTIONS: ReadonlyArray<{
  days: FeedPurgeWindowDays;
  label: string;
  description: string;
}> = [
  { days: 30, label: '30 Days', description: 'Aggressive space savings after lot indexing' },
  { days: 60, label: '60 Days (Recommended)', description: 'Balanced biosecurity retention window' },
  { days: 90, label: '90 Days', description: 'Extended quarter-year tag photo retention' },
  { days: 0, label: 'Manual Purge Only', description: 'Keep tag photos until manually purged' },
];

export function normalizeFeedPurgeWindowDays(
  raw: unknown,
  fallback: FeedPurgeWindowDays = 60
): FeedPurgeWindowDays {
  const n = Number(raw);
  if (n === 30 || n === 60 || n === 90 || n === 0) return n;
  return fallback;
}

export type FeedAllocationTargetType = 'cage' | 'litter' | 'animal' | 'general';

/**
 * Purchased feed lot / batch record with active inventory, indexed mill lot number,
 * and biosecurity tag photo lifecycle (auto-purged after 30/60/90 days once lot is indexed).
 */
export interface FeedBatch {
  id: string;
  species: string;
  brand: string;
  productName: string;
  lotNumber: string;
  millCode: string;
  manufactureDateIso: string; // YYYY-MM-DD or ""
  purchaseDateIso: string; // YYYY-MM-DD
  bagCount: number;
  bagWeightValue: number;
  bagWeightUnit: string; // 'lbs' | 'kg' | 'bales' | 'bags' | etc.
  totalQuantity: number;
  remainingQuantity: number;
  lowStockThreshold: number;
  totalCostCents?: number;
  supplierName: string;
  proteinPercent?: number;
  notes: string;
  tagPhotoDataUrl?: string;
  tagPhotoThumbnailDataUrl?: string;
  tagPhotoMimeType?: string;
  tagPhotoBytes?: number;
  tagPhotoCapturedDateIso?: string; // YYYY-MM-DD
  tagPhotoPurgedAtIso?: string; // ISO UTC when raw/heavy image was purged
  tagPhotoBytesReclaimed?: number;
  ocrRawText?: string;
  ocrConfidence?: number;
  ocrManualOverride?: boolean;
  recallFlagged?: boolean;
  recallNote?: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Feed intake / allocation entry linked directly to a cage/pen, litter (breeding), animal, or barn group.
 */
export interface FeedAllocation {
  id: string;
  species: string;
  feedBatchId: string;
  targetType: FeedAllocationTargetType;
  targetId: string;
  targetLabel: string;
  dateIso: string; // YYYY-MM-DD
  quantity: number;
  unit: string;
  notes: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export type LedgerEntryType = 'expense' | 'income';

export type LedgerCategory =
  | 'feed'
  | 'bedding'
  | 'vet'
  | 'equipment'
  | 'processing'
  | 'show_entry'
  | 'supplies'
  | 'animal_sale'
  | 'stud_fee'
  | 'meat_pelt_sale'
  | 'grant_sponsor'
  | 'other';

export const LEDGER_CATEGORY_OPTIONS: ReadonlyArray<{
  value: LedgerCategory;
  label: string;
  defaultType: LedgerEntryType;
}> = [
  { value: 'feed', label: 'Feed & Supplements', defaultType: 'expense' },
  { value: 'bedding', label: 'Bedding & Litter', defaultType: 'expense' },
  { value: 'vet', label: 'Veterinary & Medication', defaultType: 'expense' },
  { value: 'equipment', label: 'Cages, Hutches & Equipment', defaultType: 'expense' },
  { value: 'processing', label: 'Butcher & Pelt Processing', defaultType: 'expense' },
  { value: 'show_entry', label: 'Show Entries & Travel', defaultType: 'expense' },
  { value: 'supplies', label: 'Barn Supplies & Tattoos', defaultType: 'expense' },
  { value: 'animal_sale', label: 'Animal / Offspring Sale', defaultType: 'income' },
  { value: 'stud_fee', label: 'Stud / Service Fee', defaultType: 'income' },
  { value: 'meat_pelt_sale', label: 'Meat & Pelt Sale', defaultType: 'income' },
  { value: 'grant_sponsor', label: 'Fair Premium / Grant / Sponsor', defaultType: 'income' },
  { value: 'other', label: 'Other Income / Expense', defaultType: 'expense' },
];

export function normalizeLedgerEntryType(
  raw: unknown,
  fallback: LedgerEntryType = 'expense'
): LedgerEntryType {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  if (clean === 'income' || clean === 'revenue' || clean === 'sale') return 'income';
  if (clean === 'expense' || clean === 'cost') return 'expense';
  return fallback;
}

export function normalizeLedgerCategory(
  raw: unknown,
  fallback: LedgerCategory = 'other'
): LedgerCategory {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  const valid = new Set<LedgerCategory>(LEDGER_CATEGORY_OPTIONS.map((o) => o.value));
  if (valid.has(clean as LedgerCategory)) {
    return clean as LedgerCategory;
  }
  if (clean.includes('feed')) return 'feed';
  if (clean.includes('bed')) return 'bedding';
  if (clean.includes('vet') || clean.includes('med')) return 'vet';
  if (clean.includes('equip') || clean.includes('cage') || clean.includes('hutch')) return 'equipment';
  if (clean.includes('process') || clean.includes('butcher')) return 'processing';
  if (clean.includes('show')) return 'show_entry';
  if (clean.includes('suppl')) return 'supplies';
  if (clean.includes('meat') || clean.includes('pelt')) return 'meat_pelt_sale';
  if (clean.includes('stud')) return 'stud_fee';
  if (clean.includes('grant') || clean.includes('premium')) return 'grant_sponsor';
  if (clean.includes('sale')) return 'animal_sale';
  return fallback;
}

/**
 * General barn income or expense entry with optional animal, litter, feed lot, or 4-H/FFA project
 * linkage and optional compressed receipt photo attachment.
 */
export interface LedgerEntry {
  id: string;
  species: string;
  dateIso: string; // YYYY-MM-DD
  entryType: LedgerEntryType;
  category: LedgerCategory;
  amountCents: number;
  title: string;
  vendorOrParty: string;
  linkedAnimalId?: string;
  linkedBreedingId?: string;
  linkedFeedBatchId?: string;
  linkedProjectId?: string;
  receiptPhotoDataUrl?: string;
  receiptPhotoThumbnailDataUrl?: string;
  receiptPhotoMimeType?: string;
  receiptPhotoBytes?: number;
  notes: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export type ProcessingStatus = 'Scheduled' | 'Processed' | 'Cancelled';

export type PeltGrade = '' | 'Prime' | 'No. 1' | 'No. 2' | 'No. 3' | 'Cull' | 'Not Saved';

export const PELT_GRADE_OPTIONS: ReadonlyArray<{ value: PeltGrade; label: string }> = [
  { value: '', label: 'Unspecified' },
  { value: 'Prime', label: 'Prime (Dense, Even Fur)' },
  { value: 'No. 1', label: 'No. 1 (Clean, Minor Flaws)' },
  { value: 'No. 2', label: 'No. 2 (Moderate Molt / Guard Hair)' },
  { value: 'No. 3', label: 'No. 3 (Heavy Molt / Craft Grade)' },
  { value: 'Cull', label: 'Cull / Damaged' },
  { value: 'Not Saved', label: 'Not Saved' },
];

export function normalizeProcessingStatus(
  raw: unknown,
  fallback: ProcessingStatus = 'Processed'
): ProcessingStatus {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  if (clean === 'scheduled' || clean === 'planned') return 'Scheduled';
  if (clean === 'cancelled' || clean === 'canceled') return 'Cancelled';
  if (clean === 'processed' || clean === 'harvested' || clean === 'completed') return 'Processed';
  return fallback;
}

export function normalizePeltGrade(raw: unknown): PeltGrade {
  if (typeof raw !== 'string') return '';
  const clean = raw.trim().toLowerCase();
  if (clean === 'prime') return 'Prime';
  if (clean === 'no. 1' || clean === 'no 1' || clean === '1' || clean === 'grade 1') return 'No. 1';
  if (clean === 'no. 2' || clean === 'no 2' || clean === '2' || clean === 'grade 2') return 'No. 2';
  if (clean === 'no. 3' || clean === 'no 3' || clean === '3' || clean === 'grade 3') return 'No. 3';
  if (clean === 'cull') return 'Cull';
  if (clean === 'not saved' || clean === 'none' || clean === 'discarded') return 'Not Saved';
  return '';
}

/**
 * Meat & Pelt processing log supporting scheduled butcher dates, harvest dates,
 * live-to-dressed carcass yield percentages, and pelt grading.
 */
export interface ProcessingLog {
  id: string;
  species: string;
  title: string;
  linkedAnimalId?: string;
  linkedBreedingId?: string;
  scheduledDateIso: string; // YYYY-MM-DD or ""
  harvestDateIso: string; // YYYY-MM-DD or ""
  status: ProcessingStatus;
  animalCount: number;
  liveWeightGrams: number;
  dressedWeightGrams: number;
  dressOutPercent?: number;
  peltCount: number;
  peltGrade: PeltGrade;
  peltColorNotes: string;
  processingCostCents?: number;
  meatValueCents?: number;
  peltValueCents?: number;
  notes: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export type YouthOrgType = '4-H' | 'FFA' | 'Other Youth';

export const YOUTH_ORG_OPTIONS: ReadonlyArray<{ value: YouthOrgType; label: string }> = [
  { value: '4-H', label: '4-H Youth Project' },
  { value: 'FFA', label: 'FFA SAE / Project' },
  { value: 'Other Youth', label: 'Other Youth Livestock Club' },
];

export function normalizeYouthOrgType(
  raw: unknown,
  fallback: YouthOrgType = '4-H'
): YouthOrgType {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  if (clean === 'ffa') return 'FFA';
  if (clean === '4-h' || clean === '4h') return '4-H';
  if (clean === 'other youth' || clean === 'other') return 'Other Youth';
  return fallback;
}

export interface YouthProjectFeedLogEntry {
  id: string;
  dateIso: string; // YYYY-MM-DD
  feedType: string;
  quantity: number;
  unit: string;
  costCents: number;
  linkedFeedBatchId?: string;
  notes?: string;
}

export function normalizeYouthProjectFeedLogs(raw: unknown): YouthProjectFeedLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const seenIds = new Set<string>();
  const out: YouthProjectFeedLogEntry[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const obj = entry as Record<string, unknown>;
    const feedType = typeof obj.feedType === 'string' ? obj.feedType.trim().slice(0, 120) : '';
    const dateIso =
      typeof obj.dateIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.dateIso.trim())
        ? obj.dateIso.trim()
        : '';
    const qtyNum = Number(obj.quantity);
    const quantity = Number.isFinite(qtyNum) && qtyNum >= 0 ? Number(qtyNum.toFixed(2)) : 0;
    const costNum = Number(obj.costCents);
    const costCents = Number.isFinite(costNum) && costNum >= 0 ? Math.round(costNum) : 0;
    if (!feedType && quantity <= 0 && costCents <= 0) continue;
    const rawId =
      typeof obj.id === 'string' && obj.id.trim()
        ? obj.id.trim().slice(0, 80)
        : `yfl-${i + 1}`;
    const id = seenIds.has(rawId) ? `${rawId}-${i + 1}` : rawId;
    seenIds.add(id);
    const unit =
      typeof obj.unit === 'string' && obj.unit.trim() ? obj.unit.trim().slice(0, 24) : 'lbs';
    const linkedFeedBatchId =
      typeof obj.linkedFeedBatchId === 'string' && obj.linkedFeedBatchId.trim()
        ? obj.linkedFeedBatchId.trim()
        : undefined;
    const notes =
      typeof obj.notes === 'string' && obj.notes.trim()
        ? obj.notes.trim().slice(0, 300)
        : undefined;
    out.push({
      id,
      dateIso,
      feedType: feedType || 'Project Feed',
      quantity,
      unit,
      costCents,
      ...(linkedFeedBatchId ? { linkedFeedBatchId } : {}),
      ...(notes ? { notes } : {}),
    });
  }
  return out.sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''));
}

/**
 * 4-H / FFA Youth Project Record Book tracking member details, enrolled animals/litters,
 * project-specific feed logs, inventory valuation, learning goals, and printable completion reports.
 */
export interface YouthProjectBook {
  id: string;
  species: string;
  organization: YouthOrgType;
  projectTitle: string;
  memberName: string;
  clubOrChapter: string;
  leaderOrAdvisor: string;
  projectYear: string;
  startDateIso: string; // YYYY-MM-DD
  endDateIso: string; // YYYY-MM-DD or ""
  status: 'Active' | 'Completed';
  linkedAnimalIds: string[];
  linkedBreedingIds: string[];
  startingInventoryValueCents: number;
  endingInventoryValueCents: number;
  feedLogs: YouthProjectFeedLogEntry[];
  goalsAndReflection: string;
  showAndCommunityNotes: string;
  notes: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export type PreferredContactMethod = 'email' | 'phone' | 'sms' | 'in_person' | 'other';

export const PREFERRED_CONTACT_METHODS: ReadonlyArray<{
  value: PreferredContactMethod;
  label: string;
}> = [
  { value: 'sms', label: 'Text / SMS' },
  { value: 'phone', label: 'Phone Call' },
  { value: 'email', label: 'Email' },
  { value: 'in_person', label: 'In Person / Barn Visit' },
  { value: 'other', label: 'Other' },
];

export function normalizePreferredContactMethod(
  raw: unknown,
  fallback: PreferredContactMethod = 'sms'
): PreferredContactMethod {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  if (clean === 'email' || clean === 'mail') return 'email';
  if (clean === 'phone' || clean === 'call') return 'phone';
  if (clean === 'sms' || clean === 'text') return 'sms';
  if (clean === 'in_person' || clean === 'in person' || clean === 'barn') return 'in_person';
  if (clean === 'other') return 'other';
  return fallback;
}

export type ClientKind =
  | 'pet_buyer'
  | 'show_breeder'
  | 'commercial_meat'
  | 'youth_4h_ffa'
  | 'rescue_partner'
  | 'other';

export const CLIENT_KINDS: ReadonlyArray<{
  value: ClientKind;
  label: string;
}> = [
  { value: 'pet_buyer', label: 'Pet / Companion Buyer' },
  { value: 'show_breeder', label: 'Show & Breeding Program' },
  { value: 'youth_4h_ffa', label: '4-H / FFA Youth Buyer' },
  { value: 'commercial_meat', label: 'Commercial / Meat / Homestead' },
  { value: 'rescue_partner', label: 'Partner / Exchange' },
  { value: 'other', label: 'Other Client' },
];

export function normalizeClientKind(
  raw: unknown,
  fallback: ClientKind = 'pet_buyer'
): ClientKind {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  const valid = new Set<ClientKind>(CLIENT_KINDS.map((o) => o.value));
  if (valid.has(clean as ClientKind)) return clean as ClientKind;
  if (clean.includes('show') || clean.includes('breed')) return 'show_breeder';
  if (clean.includes('4-h') || clean.includes('4h') || clean.includes('ffa') || clean.includes('youth')) {
    return 'youth_4h_ffa';
  }
  if (clean.includes('meat') || clean.includes('commercial') || clean.includes('homestead')) {
    return 'commercial_meat';
  }
  if (clean.includes('rescue') || clean.includes('partner')) return 'rescue_partner';
  if (clean.includes('pet') || clean.includes('companion')) return 'pet_buyer';
  return fallback;
}

/**
 * Local-first breeder CRM client contact record, scoped to a `species`.
 */
export interface ClientContact {
  id: string;
  species: string;
  fullName: string;
  ranchOrHerdName: string;
  email: string;
  phone: string;
  preferredContact: PreferredContactMethod;
  clientKind: ClientKind;
  cityState: string;
  shippingAddress: string;
  tags: string[];
  notes: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export type WaitlistStatus =
  | 'Active'
  | 'Matched'
  | 'Deposited'
  | 'Fulfilled'
  | 'Paused'
  | 'Cancelled';

export const WAITLIST_STATUSES: ReadonlyArray<WaitlistStatus> = [
  'Active',
  'Matched',
  'Deposited',
  'Fulfilled',
  'Paused',
  'Cancelled',
];

export function normalizeWaitlistStatus(
  raw: unknown,
  fallback: WaitlistStatus = 'Active'
): WaitlistStatus {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  if (clean === 'active' || clean === 'waiting' || clean === 'open') return 'Active';
  if (clean === 'matched') return 'Matched';
  if (clean === 'deposited' || clean === 'reserved') return 'Deposited';
  if (clean === 'fulfilled' || clean === 'completed' || clean === 'sold') return 'Fulfilled';
  if (clean === 'paused' || clean === 'hold') return 'Paused';
  if (clean === 'cancelled' || clean === 'canceled') return 'Cancelled';
  return fallback;
}

export type WaitlistIntent =
  | 'Show / Breeding'
  | 'Pet / Companion'
  | '4-H / FFA Youth'
  | 'Meat / Commercial'
  | 'Any';

export const WAITLIST_INTENTS: ReadonlyArray<WaitlistIntent> = [
  'Show / Breeding',
  'Pet / Companion',
  '4-H / FFA Youth',
  'Meat / Commercial',
  'Any',
];

export function normalizeWaitlistIntent(
  raw: unknown,
  fallback: WaitlistIntent = 'Show / Breeding'
): WaitlistIntent {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  if (clean.includes('show') || clean.includes('breed')) return 'Show / Breeding';
  if (clean.includes('pet') || clean.includes('companion')) return 'Pet / Companion';
  if (clean.includes('4-h') || clean.includes('4h') || clean.includes('ffa') || clean.includes('youth')) {
    return '4-H / FFA Youth';
  }
  if (clean.includes('meat') || clean.includes('commercial')) return 'Meat / Commercial';
  if (clean === 'any') return 'Any';
  return fallback;
}

/**
 * Buyer waitlist inquiry & preference record, scoped to a `species`.
 */
export interface WaitlistEntry {
  id: string;
  species: string;
  clientId: string;
  clientName: string;
  priorityRank: number;
  status: WaitlistStatus;
  intent: WaitlistIntent;
  desiredBreed: string;
  desiredVariety: string;
  preferredSex: 'Any' | 'Male' | 'Female';
  preferredBreedingId?: string;
  requestedByDateIso: string; // YYYY-MM-DD or ""
  inquiryDateIso: string; // YYYY-MM-DD
  followUpDateIso: string; // YYYY-MM-DD or ""
  lastContactedDateIso: string; // YYYY-MM-DD or ""
  maxBudgetCents?: number;
  notes: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export type ReservationStatus =
  | 'Inquiry Hold'
  | 'Pending Deposit'
  | 'Deposit Paid'
  | 'Paid in Full'
  | 'Ready for Pickup'
  | 'Picked Up / Completed'
  | 'Cancelled';

export const RESERVATION_STATUSES: ReadonlyArray<ReservationStatus> = [
  'Inquiry Hold',
  'Pending Deposit',
  'Deposit Paid',
  'Paid in Full',
  'Ready for Pickup',
  'Picked Up / Completed',
  'Cancelled',
];

export function normalizeReservationStatus(
  raw: unknown,
  fallback: ReservationStatus = 'Pending Deposit'
): ReservationStatus {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  if (clean === 'inquiry hold' || clean === 'hold') return 'Inquiry Hold';
  if (clean === 'pending deposit' || clean === 'pending') return 'Pending Deposit';
  if (clean === 'deposit paid' || clean === 'deposited') return 'Deposit Paid';
  if (clean === 'paid in full' || clean === 'paid') return 'Paid in Full';
  if (clean === 'ready for pickup' || clean === 'ready') return 'Ready for Pickup';
  if (
    clean === 'picked up / completed' ||
    clean === 'completed' ||
    clean === 'picked up' ||
    clean === 'sold'
  ) {
    return 'Picked Up / Completed';
  }
  if (clean === 'cancelled' || clean === 'canceled') return 'Cancelled';
  return fallback;
}

/**
 * Animal or litter-pick reservation with deposit schedule, hold expiration,
 * follow-up reminders, and printable sales agreement metadata, scoped to a `species`.
 */
export interface AnimalReservation {
  id: string;
  species: string;
  agreementNumber: string;
  clientId: string;
  clientName: string;
  waitlistEntryId?: string;
  animalId?: string;
  breedingId?: string;
  pickOrder?: number;
  itemLabel: string;
  status: ReservationStatus;
  reservedDateIso: string; // YYYY-MM-DD
  holdExpiresDateIso: string; // YYYY-MM-DD or ""
  totalPriceCents: number;
  depositRequiredCents: number;
  depositPaidCents: number;
  depositDueDateIso: string; // YYYY-MM-DD or ""
  depositPaidDateIso: string; // YYYY-MM-DD or ""
  pickupScheduledDateIso: string; // YYYY-MM-DD or ""
  completedDateIso: string; // YYYY-MM-DD or ""
  balanceReminderDateIso: string; // YYYY-MM-DD or ""
  paymentMethod: string;
  ledgerEntryId?: string;
  termsSummary: string;
  healthGuaranteeNotes: string;
  notes: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export type WoolHarvestMethod = 'Shear' | 'Pluck' | 'Brush / Comb' | 'Other';

export const WOOL_HARVEST_METHODS: ReadonlyArray<WoolHarvestMethod> = [
  'Shear',
  'Pluck',
  'Brush / Comb',
  'Other',
];

export function normalizeWoolHarvestMethod(
  raw: unknown,
  fallback: WoolHarvestMethod = 'Shear'
): WoolHarvestMethod {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  if (clean === 'shear' || clean === 'clipped' || clean === 'clip' || clean === 'sheared') {
    return 'Shear';
  }
  if (clean === 'pluck' || clean === 'plucked') return 'Pluck';
  if (clean === 'brush / comb' || clean === 'brush' || clean === 'comb' || clean === 'combed') {
    return 'Brush / Comb';
  }
  if (clean === 'other') return 'Other';
  return fallback;
}

/**
 * Official 100-point 7-position IAGARB German Angora evaluation breakdown:
 * Weight (20), Body Type (20), Wool Density & Length (15), Wool Uniformity (15),
 * Wool Texture (15), Furnishings (10), Condition (5).
 */
export interface IagarbScorecard {
  weightPts: number;
  bodyTypePts: number;
  densityLengthPts: number;
  uniformityPts: number;
  texturePts: number;
  furnishingsPts: number;
  conditionPts: number;
  totalPts: number;
  evaluatorName: string;
  evaluationDateIso: string; // YYYY-MM-DD or ""
}

/**
 * Per-animal wool/fiber harvest record supporting prime vs. grade yields,
 * shearing cycle interval tracking (e.g., 90-day IAGARB performance test),
 * and optional IAGARB German Angora 7-position judging scorecard.
 */
export interface WoolHarvest {
  id: string;
  species: string;
  animalId: string;
  harvestDateIso: string; // YYYY-MM-DD
  shearingIntervalDays?: number;
  primeWeightGrams: number;
  gradeWeightGrams: number;
  harvestMethod: WoolHarvestMethod;
  stapleLengthMm?: number;
  iagarbScore?: IagarbScorecard;
  witnessedBy?: string;
  notes: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Complete in-memory snapshot of the unencrypted local database.
 */
export interface BarnDatabaseSnapshot {
  settings: BarnSettings;
  speciesProfiles: SpeciesProfile[];
  animals: Animal[];
  animalPhotos: AnimalPhoto[];
  cages: CageLocation[];
  breedings: BreedingRecord[];
  tasks: BarnTask[];
  careLogs: CareLog[];
  shows: ShowEvent[];
  feedBatches: FeedBatch[];
  feedAllocations: FeedAllocation[];
  ledgerEntries?: LedgerEntry[];
  processingLogs?: ProcessingLog[];
  youthProjectBooks?: YouthProjectBook[];
  clientContacts?: ClientContact[];
  waitlistEntries?: WaitlistEntry[];
  animalReservations?: AnimalReservation[];
  woolHarvests?: WoolHarvest[];
}

export const ANIMAL_STATUSES: AnimalStatus[] = [
  'Active',
  'Junior',
  'Retired',
  'Archived',
  'Sold',
  'Deceased',
];

export const BREEDING_STATUSES: BreedingStatus[] = [
  'Planned',
  'Bred',
  'Palpated Positive',
  'Born',
  'Weaned',
  'Missed',
];

export const TASK_CATEGORIES: TaskCategory[] = [
  'Care',
  'Palpation',
  'Nestbox',
  'Birth Check',
  'Weaning',
  'Rebreed',
  'Health',
  'Show Prep',
  'Other',
];

export const TASK_PRIORITIES: TaskPriority[] = ['High', 'Normal', 'Low'];

export const CARE_LOG_TYPES: CareLogType[] = [
  'Weight Check',
  'Show / Leg',
  'Palpation',
  'Ultrasound',
  'Health / Vet',
  'Health Score / BCS',
  'Grooming & Hoof',
  'Journal Note',
];

export const SHOW_SANCTIONS: string[] = [
  'ARBA',
  'ADGA / AGS',
  '4-H / FFA',
  'Specialty Club',
  'County / State Fair',
  'Other',
];

/**
 * Generates an RFC-4122 v4 UUID using pure JS fallback if `crypto.randomUUID` is unavailable.
 */
export function generateUuid(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let coreClockSkewMs = 0;

/**
 * Sets the active device clock-skew offset (serverMs - localDeviceMs) so pure domain
 * timestamps (`nowEpochMs`, `nowIsoUtc`, `todayDateIso`) automatically compensate for
 * drifted or rewound device clocks without introducing upward `storage/` imports.
 */
export function setCoreClockSkewMs(skewMs: number | null | undefined): void {
  coreClockSkewMs =
    typeof skewMs === 'number' && Number.isFinite(skewMs) ? Math.round(skewMs) : 0;
}

export function getCoreClockSkewMs(): number {
  return coreClockSkewMs;
}

/**
 * Returns the current UTC epoch milliseconds adjusted for any recorded server clock skew.
 */
export function nowEpochMs(): number {
  return Date.now() + coreClockSkewMs;
}

/**
 * Returns the current UTC timestamp in ISO-8601 format (`YYYY-MM-DDTHH:mm:ss.sssZ`),
 * adjusted for any recorded server clock skew.
 */
export function nowIsoUtc(): string {
  return new Date(nowEpochMs()).toISOString();
}

/**
 * Returns today's local calendar date as `YYYY-MM-DD` using the clock-skew-adjusted time.
 */
export function todayDateIso(): string {
  const now = new Date(nowEpochMs());
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Adds a signed integer number of calendar days to an ISO `YYYY-MM-DD` date string.
 */
export function addDaysIso(baseDateIso: string, daysOffset: number): string {
  if (!baseDateIso) return '';
  const parts = baseDateIso.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return '';
  const utc = Date.UTC(parts[0], parts[1] - 1, parts[2] + Math.round(daysOffset));
  const dt = new Date(utc);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Converts epoch milliseconds (from legacy v3/v4 JSON backups) to `YYYY-MM-DD`.
 */
export function millisToDateIso(millis: number): string {
  if (!millis || millis <= 0) return '';
  const dt = new Date(millis);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Normalizes species-specific sex strings (`Buck`, `Doe`, `Ram`, `Ewe`, `Boar`, `Sow`,
 * `Bull`, `Cow`, `Hob`, `Jill`, `Macho`, `Hembra`) into canonical `BiologicalSex`.
 */
export function normalizeBiologicalSex(rawSex: string): BiologicalSex {
  const s = (rawSex || '').trim().toLowerCase();
  if (
    [
      'male',
      'm',
      'buck',
      'ram',
      'boar',
      'bull',
      'hob',
      'macho',
      'sire',
      'stallion',
      'tom',
      'stud',
    ].includes(s)
  ) {
    return 'Male';
  }
  if (
    [
      'female',
      'f',
      'doe',
      'ewe',
      'sow',
      'cow',
      'jill',
      'hembra',
      'dam',
      'mare',
      'queen',
      'bitch',
    ].includes(s)
  ) {
    return 'Female';
  }
  return 'Unknown';
}

/**
 * Returns the species-appropriate sex label (`Buck` / `Doe`, `Ram` / `Ewe`, etc.).
 */
export function formatSexForSpecies(sex: BiologicalSex, speciesProfile?: SpeciesProfile): string {
  if (sex === 'Male') return speciesProfile?.maleLabel || 'Male';
  if (sex === 'Female') return speciesProfile?.femaleLabel || 'Female';
  return 'Unknown';
}

/**
 * Returns a species-appropriate breeding status label (e.g., `"Kindled"` for Rabbit, `"Kidded"` for Goat).
 */
export function formatBreedingStatusForSpecies(
  status: BreedingStatus,
  speciesProfile?: SpeciesProfile
): string {
  if (status !== 'Born') return status;
  const event = (speciesProfile?.birthEventLabel || 'Birth').toLowerCase();
  if (event === 'kindling') return 'Kindled';
  if (event === 'kidding') return 'Kidded';
  if (event === 'lambing') return 'Lambed';
  if (event === 'farrowing') return 'Farrowed';
  if (event === 'calving') return 'Calved';
  if (event === 'unpacking') return 'Unpacked';
  if (event === 'whelping') return 'Whelped';
  if (event === 'queening') return 'Queened';
  return 'Born';
}

/**
 * Case-insensitive species equality check used across all screens to guarantee strict species isolation.
 */
export function isSameSpecies(a: string | undefined, b: string | undefined): boolean {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

/**
 * Returns true when an animal is archived (out of active herd tasks while kept for pedigree history).
 */
export function isAnimalArchived(
  animal: Partial<Pick<Animal, 'archived' | 'status'>> | undefined | null
): boolean {
  if (!animal) return false;
  if (
    animal.status === 'Archived' ||
    animal.status === 'Deceased' ||
    animal.status === 'Sold' ||
    animal.status === 'Retired'
  ) {
    return true;
  }
  return Boolean(animal.archived);
}

/**
 * Returns true when an animal is considered active (not archived/sold/deceased/retired).
 */
export function isAnimalActive(
  animal: Partial<Pick<Animal, 'archived' | 'status'>> | undefined | null
): boolean {
  if (!animal) return false;
  return !isAnimalArchived(animal);
}

/**
 * Normalizes imported or legacy livestock status strings and boolean flags into canonical `AnimalStatus`.
 */
export function normalizeAnimalStatus(
  rawStatus?: string,
  archivedFlag?: unknown,
  activeFlag?: unknown
): AnimalStatus {
  const s = (rawStatus || '').trim().toLowerCase();
  if (s) {
    if (/\b(?:dead|deceased|died|culled|cull|butchered|harvested|euthanized|lost)\b/.test(s)) {
      return 'Deceased';
    }
    if (/\b(?:sold|sale|transferred|marketed)\b/.test(s)) {
      return 'Sold';
    }
    if (/\b(?:ref|reference|ancestor|pedigree|retired|historical|external)\b/.test(s)) {
      return 'Retired';
    }
    if (/\b(?:archived|inactive|not active|non-active|gone|pet)\b/.test(s)) {
      return 'Archived';
    }
    if (/\b(?:junior|weanling|nursing|jr)\b/.test(s)) {
      return 'Junior';
    }
    if (s === 'active') {
      return 'Active';
    }
  }

  if (archivedFlag === true || /^(?:1|true|yes|y)$/i.test(String(archivedFlag ?? '').trim())) {
    return 'Archived';
  }
  if (activeFlag === false || /^(?:0|false|no|n)$/i.test(String(activeFlag ?? '').trim())) {
    return 'Archived';
  }
  return 'Active';
}

/**
 * Pluralizes singular offspring/species labels cleanly (e.g., Puppy -> Puppies, Kit -> Kits, Calf -> Calves).
 */
export function pluralizeSpeciesLabel(label: string): string {
  const clean = (label || 'Baby').trim();
  if (!clean) return 'Babies';
  const lower = clean.toLowerCase();
  if (lower.endsWith('s') || lower.endsWith('x') || lower.endsWith('ch') || lower.endsWith('sh')) {
    return `${clean}es`;
  }
  if (lower.endsWith('calf')) {
    return `${clean.slice(0, -1)}ves`;
  }
  if (lower.endsWith('y') && !/[aeiou]y$/i.test(clean)) {
    return `${clean.slice(0, -1)}ies`;
  }
  return `${clean}s`;
}

/**
 * Prepends an optional species default prefix to a new animal name unless it already starts with it.
 * Honors delimiter-terminated prefixes such as `OR-` or `CC:` without inserting an unwanted space.
 */
export function applyAnimalNamePrefix(name: string, prefix?: string): string {
  const cleanName = (name || '').trim();
  const cleanPrefix = (prefix || '').trim();
  if (!cleanPrefix || !cleanName) return cleanName;
  if (cleanName.toLowerCase().startsWith(cleanPrefix.toLowerCase())) {
    return cleanName;
  }
  const endsWithPunct = /[-_:/#']$/.test(cleanPrefix);
  return endsWithPunct ? `${cleanPrefix}${cleanName}` : `${cleanPrefix} ${cleanName}`;
}

/**
 * Strips an optional species default prefix from an animal name for external calendar display.
 * Falls back to the original trimmed name if stripping would leave an empty string.
 */
export function stripAnimalNamePrefix(name: string, prefix?: string): string {
  const cleanName = (name || '').trim();
  const cleanPrefix = (prefix || '').trim();
  if (!cleanPrefix || !cleanName) return cleanName;
  if (!cleanName.toLowerCase().startsWith(cleanPrefix.toLowerCase())) {
    return cleanName;
  }
  const stripped = cleanName
    .slice(cleanPrefix.length)
    .replace(/^[\s\-_:/#']+/, '')
    .trim();
  return stripped || cleanName;
}

export const applySpeciesNamePrefix = applyAnimalNamePrefix;

/**
 * Resolves the effective display/input weight unit for a given species, honoring any
 * per-species override before falling back to the barn-wide default `settings.preferredUnit`.
 */
export function resolveSpeciesWeightUnit(
  speciesOrProfile: Pick<SpeciesProfile, 'preferredUnit'> | string | undefined,
  settings: Pick<BarnSettings, 'preferredUnit'>,
  configuredProfiles?: SpeciesProfile[]
): WeightUnit {
  const barnFallback = normalizeWeightUnit(settings.preferredUnit, 'lbs_oz');
  if (!speciesOrProfile) return barnFallback;
  if (typeof speciesOrProfile === 'string') {
    const match = configuredProfiles?.find((sp) => isSameSpecies(sp.name, speciesOrProfile));
    return match?.preferredUnit ? normalizeWeightUnit(match.preferredUnit, barnFallback) : barnFallback;
  }
  return speciesOrProfile.preferredUnit
    ? normalizeWeightUnit(speciesOrProfile.preferredUnit, barnFallback)
    : barnFallback;
}

/**
 * Formats integer grams for numeric text input in the active weight unit.
 */
export function formatWeightInputValue(weightGrams: number, unit: WeightUnit): string {
  if (!weightGrams || weightGrams <= 0) return '';
  if (unit === 'grams') return String(Math.round(weightGrams));
  if (unit === 'kg') return (weightGrams / 1000).toFixed(2);
  return (weightGrams / 453.59237).toFixed(2);
}

/**
 * Returns input labels and example placeholders for a given weight unit.
 */
export function getWeightInputMeta(unit: WeightUnit): {
  unitLabel: string;
  shortUnit: string;
  placeholder: string;
} {
  switch (unit) {
    case 'grams':
      return { unitLabel: 'grams', shortUnit: 'g', placeholder: 'e.g. 4650' };
    case 'kg':
      return { unitLabel: 'kg', shortUnit: 'kg', placeholder: 'e.g. 18.50' };
    default:
      return { unitLabel: 'decimal lbs', shortUnit: 'lbs', placeholder: 'e.g. 10.25' };
  }
}

/**
 * Returns species-appropriate UI labels and placeholders for the `tattoo` identifier field
 * without altering the underlying `animal.tattoo` schema key.
 */
export function getSpeciesIdentifierLabels(speciesName?: string): {
  fieldLabel: string;
  shortLabel: string;
  placeholder: string;
} {
  const key = (speciesName || '').trim().toLowerCase();
  if (key === 'dog' || key === 'cat') {
    return {
      fieldLabel: 'Microchip / Tattoo / ID',
      shortLabel: 'ID / Microchip',
      placeholder: 'e.g. 985112004512 or Collar-01',
    };
  }
  if (
    key === 'cattle' ||
    key === 'goat' ||
    key === 'sheep' ||
    key === 'swine / pig' ||
    key === 'alpaca'
  ) {
    return {
      fieldLabel: 'Ear Tag / Tattoo / Notch ID',
      shortLabel: 'Ear Tag / ID',
      placeholder: 'e.g. TAG-204',
    };
  }
  if (key === 'rabbit') {
    return {
      fieldLabel: 'Ear Tattoo / Tag ID',
      shortLabel: 'Ear Tattoo / ID',
      placeholder: 'e.g. NZR-301',
    };
  }
  return {
    fieldLabel: 'ID / Tag / Tattoo / Microchip',
    shortLabel: 'ID / Tag',
    placeholder: 'e.g. ID-104',
  };
}

/**
 * Formats weight in `lbs_oz`, decimal `lbs`, `kg`, or `grams`.
 */
export function formatWeight(weightGrams: number, unit: WeightUnit): string {
  if (!weightGrams || weightGrams <= 0) return 'Unweighed';
  if (unit === 'grams') {
    return `${Math.round(weightGrams).toLocaleString()} g`;
  }
  if (unit === 'kg') {
    return `${(weightGrams / 1000).toFixed(2)} kg`;
  }
  const totalOunces = weightGrams / 28.349523125;
  if (unit === 'lbs') {
    return `${(totalOunces / 16).toFixed(1)} lbs`;
  }
  const lbs = Math.floor(totalOunces / 16);
  const oz = Math.round(totalOunces - lbs * 16);
  if (oz === 16) {
    return `${lbs + 1} lb 0 oz`;
  }
  return `${lbs} lb ${oz} oz`;
}

/**
 * Formats weight in traditional ARBA `lbs.oz` dot notation (e.g., `10.04` for 10 lb 4 oz).
 */
export function formatWeightArbaLbsOzDot(weightGrams: number): string {
  if (!weightGrams || !Number.isFinite(weightGrams) || weightGrams <= 0) {
    return 'Unweighed';
  }
  const totalOunces = weightGrams / 28.349523125;
  const rawLbs = Math.floor(totalOunces / 16);
  const rawOz = Math.round(totalOunces - rawLbs * 16);
  const lbs = rawOz === 16 ? rawLbs + 1 : rawLbs;
  const oz = rawOz === 16 ? 0 : rawOz;
  return `${lbs}.${String(oz).padStart(2, '0')}`;
}

/**
 * Formats pedigree weights using either standard unit display or ARBA `lbs.oz` dot notation.
 */
export function formatPedigreeWeight(
  weightGrams: number,
  unit: WeightUnit,
  useArbaLbsOzDot = false
): string {
  if (!weightGrams || !Number.isFinite(weightGrams) || weightGrams <= 0) {
    return 'Unweighed';
  }
  return useArbaLbsOzDot ? formatWeightArbaLbsOzDot(weightGrams) : formatWeight(weightGrams, unit);
}

/**
 * Parses a weight input string in the user's preferred unit back into integer grams.
 */
export function parseWeightInputToGrams(input: string, unit: WeightUnit): number {
  const clean = input.trim();
  if (!clean) return 0;
  const numeric = Number(clean);
  if (Number.isNaN(numeric) || numeric <= 0) return 0;
  if (unit === 'grams') return Math.round(numeric);
  if (unit === 'kg') return Math.round(numeric * 1000);
  return Math.round(numeric * 453.59237);
}

/**
 * Formats an ISO `YYYY-MM-DD` date into a readable label (`Nov 14, 2026`).
 */
export function formatReadableDate(dateIso: string): string {
  if (!dateIso) return 'Unset';
  const parts = dateIso.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return dateIso;
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (
    dt.getUTCFullYear() !== parts[0] ||
    dt.getUTCMonth() !== parts[1] - 1 ||
    dt.getUTCDate() !== parts[2]
  ) {
    return dateIso;
  }
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Predefined starter livestock species with authentic gestation, weaning, rebreeding,
 * sex/birth terminology, and cascading Master Task List care templates.
 */
export const PREDEFINED_SPECIES_PRESETS: Omit<SpeciesProfile, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'species-rabbit',
    name: 'Rabbit',
    gestationDays: 31,
    rebreedDaysAfterBirth: 28,
    weanDaysAfterBirth: 42,
    birthEventLabel: 'Kindling',
    maleLabel: 'Buck',
    femaleLabel: 'Doe',
    offspringLabel: 'Kit',
    exampleBreeds: [
      'New Zealand Red',
      'New Zealand White',
      'Californian',
      'Rex',
      'Holland Lop',
      'Flemish Giant',
    ],
    milestones: [
      {
        label: 'Palpation Check',
        relativeTo: 'AFTER_BRED',
        daysOffset: 14,
        category: 'Palpation',
        priority: 'High',
      },
      {
        label: 'Place Nestbox',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 3,
        category: 'Nestbox',
        priority: 'High',
      },
      {
        label: 'Expected Kindling Check & Kit Count',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 0,
        category: 'Birth Check',
        priority: 'High',
      },
      {
        label: 'Remove Clean Nestbox',
        relativeTo: 'AFTER_BIRTH',
        daysOffset: 21,
        category: 'Nestbox',
        priority: 'Normal',
      },
    ],
  },
  {
    id: 'species-goat',
    name: 'Goat',
    gestationDays: 150,
    rebreedDaysAfterBirth: 120,
    weanDaysAfterBirth: 60,
    birthEventLabel: 'Kidding',
    maleLabel: 'Buck',
    femaleLabel: 'Doe',
    offspringLabel: 'Kid',
    exampleBreeds: ['Nigerian Dwarf', 'Nubian', 'Boer', 'Alpine', 'LaMancha'],
    milestones: [
      {
        label: 'Pregnancy / Blood or Ultrasound Check',
        relativeTo: 'AFTER_BRED',
        daysOffset: 35,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'CDT & BoSe Pre-Kidding Booster',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 28,
        category: 'Health',
        priority: 'High',
      },
      {
        label: 'Prep Kidding Stall & Kit',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 7,
        category: 'Nestbox',
        priority: 'High',
      },
    ],
  },
  {
    id: 'species-sheep',
    name: 'Sheep',
    gestationDays: 147,
    rebreedDaysAfterBirth: 150,
    weanDaysAfterBirth: 60,
    birthEventLabel: 'Lambing',
    maleLabel: 'Ram',
    femaleLabel: 'Ewe',
    offspringLabel: 'Lamb',
    exampleBreeds: ['Katahdin', 'Dorper', 'Suffolk', 'Babydoll Southdown', 'Hampshire'],
    milestones: [
      {
        label: 'Scanning / Pregnancy Confirmation',
        relativeTo: 'AFTER_BRED',
        daysOffset: 45,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'Crutching, Vaccination & Hoof Trim',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 14,
        category: 'Health',
        priority: 'Normal',
      },
      {
        label: 'Prepare Lambing Jug',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 5,
        category: 'Nestbox',
        priority: 'High',
      },
    ],
  },
  {
    id: 'species-swine',
    name: 'Swine / Pig',
    gestationDays: 114,
    rebreedDaysAfterBirth: 35,
    weanDaysAfterBirth: 28,
    birthEventLabel: 'Farrowing',
    maleLabel: 'Boar',
    femaleLabel: 'Sow',
    offspringLabel: 'Piglet',
    exampleBreeds: ['Berkshire', 'Kunekune', 'Duroc', 'Hampshire', 'Mangalica'],
    milestones: [
      {
        label: '21-Day Heat Return / Pregnancy Check',
        relativeTo: 'AFTER_BRED',
        daysOffset: 21,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'Move to Farrowing Pen',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 5,
        category: 'Nestbox',
        priority: 'High',
      },
      {
        label: 'Piglet Iron & Navel Check',
        relativeTo: 'AFTER_BIRTH',
        daysOffset: 3,
        category: 'Health',
        priority: 'High',
      },
    ],
  },
  {
    id: 'species-cattle',
    name: 'Cattle',
    gestationDays: 283,
    rebreedDaysAfterBirth: 60,
    weanDaysAfterBirth: 205,
    birthEventLabel: 'Calving',
    maleLabel: 'Bull',
    femaleLabel: 'Cow',
    offspringLabel: 'Calf',
    exampleBreeds: ['Dexter', 'Highland', 'Jersey', 'Angus', 'Hereford'],
    milestones: [
      {
        label: 'Pregnancy Palpation / Ultrasound',
        relativeTo: 'AFTER_BRED',
        daysOffset: 40,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'Dry-Off & Close-Up Mineral Check',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 60,
        category: 'Care',
        priority: 'Normal',
      },
      {
        label: 'Move to Calving Paddock',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 14,
        category: 'Nestbox',
        priority: 'High',
      },
    ],
  },
  {
    id: 'species-guinea-pig',
    name: 'Guinea Pig',
    gestationDays: 68,
    rebreedDaysAfterBirth: 45,
    weanDaysAfterBirth: 21,
    birthEventLabel: 'Birth',
    maleLabel: 'Boar',
    femaleLabel: 'Sow',
    offspringLabel: 'Pup',
    exampleBreeds: ['Abyssinian', 'American', 'Peruvian', 'Teddy', 'Silkie'],
    milestones: [
      {
        label: 'Gentle Weight & Belly Check',
        relativeTo: 'AFTER_BRED',
        daysOffset: 28,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'Separate Boar & Add Deep Bedding',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 4,
        category: 'Nestbox',
        priority: 'High',
      },
    ],
  },
  {
    id: 'species-chinchilla',
    name: 'Chinchilla',
    gestationDays: 111,
    rebreedDaysAfterBirth: 60,
    weanDaysAfterBirth: 56,
    birthEventLabel: 'Birth',
    maleLabel: 'Buck',
    femaleLabel: 'Doe',
    offspringLabel: 'Kit',
    exampleBreeds: ['Standard Gray', 'Violet', 'Beige', 'Black Velvet', 'White Mosaic'],
    milestones: [
      {
        label: 'Weight Gain Check',
        relativeTo: 'AFTER_BRED',
        daysOffset: 45,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'Install Kit-Safe Cage Mesh & Remove Ledges',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 5,
        category: 'Nestbox',
        priority: 'High',
      },
    ],
  },
  {
    id: 'species-ferret',
    name: 'Ferret',
    gestationDays: 42,
    rebreedDaysAfterBirth: 60,
    weanDaysAfterBirth: 49,
    birthEventLabel: 'Whelping',
    maleLabel: 'Hob',
    femaleLabel: 'Jill',
    offspringLabel: 'Kit',
    exampleBreeds: ['Sable', 'Cinnamon', 'Silver', 'Blaze', 'Albino'],
    milestones: [
      {
        label: 'Abdominal Palpation Check',
        relativeTo: 'AFTER_BRED',
        daysOffset: 16,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'Prepare Quiet Whelping Box',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 5,
        category: 'Nestbox',
        priority: 'High',
      },
    ],
  },
  {
    id: 'species-alpaca',
    name: 'Alpaca',
    gestationDays: 345,
    rebreedDaysAfterBirth: 21,
    weanDaysAfterBirth: 180,
    birthEventLabel: 'Unpacking',
    maleLabel: 'Macho',
    femaleLabel: 'Hembra',
    offspringLabel: 'Cria',
    exampleBreeds: ['Huacaya', 'Suri'],
    milestones: [
      {
        label: 'Spit-Off & Ultrasound Confirmation',
        relativeTo: 'AFTER_BRED',
        daysOffset: 45,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'Prep Birthing Pasture & Cria Coat Kit',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 14,
        category: 'Nestbox',
        priority: 'High',
      },
    ],
  },
  {
    id: 'species-dog',
    name: 'Dog',
    gestationDays: 63,
    rebreedDaysAfterBirth: 180,
    weanDaysAfterBirth: 56,
    birthEventLabel: 'Whelping',
    maleLabel: 'Male',
    femaleLabel: 'Female',
    offspringLabel: 'Puppy',
    exampleBreeds: [
      'Golden Retriever',
      'Labrador Retriever',
      'German Shepherd',
      'Australian Shepherd',
      'Poodle',
      'Border Collie',
    ],
    milestones: [
      {
        label: 'Ultrasound / Pregnancy Confirmation',
        relativeTo: 'AFTER_BRED',
        daysOffset: 28,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'X-Ray Puppy Count Check',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 7,
        category: 'Health',
        priority: 'Normal',
      },
      {
        label: 'Prep Whelping Box & Supplies',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 5,
        category: 'Nestbox',
        priority: 'High',
      },
      {
        label: 'Early Weight & Deworming Check',
        relativeTo: 'AFTER_BIRTH',
        daysOffset: 14,
        category: 'Health',
        priority: 'Normal',
      },
    ],
  },
  {
    id: 'species-cat',
    name: 'Cat',
    gestationDays: 65,
    rebreedDaysAfterBirth: 120,
    weanDaysAfterBirth: 56,
    birthEventLabel: 'Queening',
    maleLabel: 'Tom',
    femaleLabel: 'Queen',
    offspringLabel: 'Kitten',
    exampleBreeds: [
      'Maine Coon',
      'Ragdoll',
      'British Shorthair',
      'Siamese',
      'Bengal',
      'Sphynx',
    ],
    milestones: [
      {
        label: 'Pinking Up & Palpation Check',
        relativeTo: 'AFTER_BRED',
        daysOffset: 21,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'Prep Queening Box & Heating Pad',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 5,
        category: 'Nestbox',
        priority: 'High',
      },
      {
        label: 'Kitten Birth Weight & Latch Check',
        relativeTo: 'AFTER_BIRTH',
        daysOffset: 1,
        category: 'Birth Check',
        priority: 'High',
      },
      {
        label: 'First FVRCP Vaccine & Deworming Window',
        relativeTo: 'AFTER_BIRTH',
        daysOffset: 42,
        category: 'Health',
        priority: 'Normal',
      },
    ],
  },
];

/**
 * Resolves a `SpeciesProfile` by name from configured profiles, falling back to presets or defaults.
 */
export function resolveSpeciesProfile(
  speciesName: string,
  configured: SpeciesProfile[]
): SpeciesProfile {
  const clean = (speciesName || 'Rabbit').trim() || 'Rabbit';
  const found = configured.find((sp) => isSameSpecies(sp.name, clean));
  if (found) return found;

  const preset = PREDEFINED_SPECIES_PRESETS.find((p) => isSameSpecies(p.name, clean));
  const ts = nowIsoUtc();
  if (preset) {
    return { ...preset, createdAt: ts, updatedAt: ts };
  }

  return {
    id: `species-${clean.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: clean,
    gestationDays: 30,
    rebreedDaysAfterBirth: 30,
    weanDaysAfterBirth: 42,
    birthEventLabel: 'Birth',
    maleLabel: 'Male',
    femaleLabel: 'Female',
    offspringLabel: 'Offspring',
    exampleBreeds: [],
    milestones: [
      {
        label: 'Prepare Birthing Area',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 3,
        category: 'Nestbox',
        priority: 'High',
      },
    ],
    createdAt: ts,
    updatedAt: ts,
  };
}

/**
 * Returns `true` when an animal record is flagged as needing follow-up attention
 * (for example, quick-added as an outside or unlisted parent during breeding).
 */
export function doesAnimalNeedAttention(animal: Animal | null | undefined): boolean {
  return Boolean(animal?.needsAttention);
}

/**
 * Classifies whether an animal is a non-adult (juvenile/pre-maturity) based on `status === 'Junior'`
 * or age against `speciesProfile.maturityDays` (falling back to `weanDaysAfterBirth * 2`).
 */
export function isAnimalNonAdult(
  animal: Pick<Animal, 'status' | 'birthDateIso'>,
  speciesProfile?: Pick<SpeciesProfile, 'maturityDays' | 'weanDaysAfterBirth'>,
  referenceDateIso: string = todayDateIso()
): boolean {
  if (animal.status === 'Junior') return true;
  if (!animal.birthDateIso || !referenceDateIso) return false;
  const birthMs = Date.parse(`${animal.birthDateIso}T00:00:00Z`);
  const refMs = Date.parse(`${referenceDateIso}T00:00:00Z`);
  if (!Number.isFinite(birthMs) || !Number.isFinite(refMs) || refMs < birthMs) return false;
  const ageDays = Math.floor((refMs - birthMs) / 86_400_000);
  const cutoff =
    speciesProfile?.maturityDays && speciesProfile.maturityDays > 0
      ? speciesProfile.maturityDays
      : Math.max(28, (speciesProfile?.weanDaysAfterBirth || 42) * 2);
  return ageDays < cutoff;
}
```

## `src/core/p2pSyncProtocol.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Local P2P / LAN Outbox Reconciliation Protocol (`src/core/p2pSyncProtocol.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) dependencies.
 * Enables zero-server WebRTC DataChannel & local LAN delta exchange by framing
 * compact SDP session signals and `SyncOperation[]` outbox payloads for deterministic
 * field-level reconciliation via `mergeDeltaOperations`.
 */

import { isValidSyncOperation, MAX_DELTA_OPERATIONS } from './inputSanitization';
import { nowIsoUtc } from './models';
import {
  DeltaExportFile,
  SyncConflictEntry,
  SyncOperation,
} from './syncOutbox';

export type P2pWireMessage =
  | {
      kind: 'pedigree-p2p-delta-v1';
      senderDeviceId: string;
      sentAtIso: string;
      operations: SyncOperation[];
    }
  | {
      kind: 'pedigree-p2p-ack-v1';
      senderDeviceId: string;
      receivedCount: number;
      appliedCount: number;
      taskOpsCount: number;
      conflictCount: number;
      ackAtIso: string;
    };

export interface P2pSignalEnvelope {
  v: 1;
  type: 'offer' | 'answer';
  deviceId: string;
  sdp: string;
  createdAtIso: string;
}

export interface P2pReconciliationSummary {
  peerDeviceId: string;
  receivedOpsCount: number;
  appliedOpCount: number;
  taskOpsReceivedCount: number;
  newConflictCount: number;
  newTaskConflictCount: number;
  reconciledAtIso: string;
}

/**
 * Builds an outbound P2P wire message containing all delta operations authored by
 * `deviceId` (or all known operations when relaying across peers).
 */
export function createP2pDeltaWireMessage(params: {
  senderDeviceId: string;
  operations: SyncOperation[];
  includePeerRelays?: boolean;
  sentAtIso?: string;
}): P2pWireMessage {
  const filtered = params.includePeerRelays
    ? params.operations
    : params.operations.filter((op) => op.device_id === params.senderDeviceId);

  return {
    kind: 'pedigree-p2p-delta-v1',
    senderDeviceId: params.senderDeviceId,
    sentAtIso: params.sentAtIso || nowIsoUtc(),
    operations: filtered.slice(-MAX_DELTA_OPERATIONS),
  };
}

/**
 * Builds a P2P reconciliation acknowledgment packet.
 */
export function createP2pAckWireMessage(params: {
  senderDeviceId: string;
  receivedCount: number;
  appliedCount: number;
  taskOpsCount: number;
  conflictCount: number;
  ackAtIso?: string;
}): P2pWireMessage {
  return {
    kind: 'pedigree-p2p-ack-v1',
    senderDeviceId: params.senderDeviceId,
    receivedCount: params.receivedCount,
    appliedCount: params.appliedCount,
    taskOpsCount: params.taskOpsCount,
    conflictCount: params.conflictCount,
    ackAtIso: params.ackAtIso || nowIsoUtc(),
  };
}

/**
 * Parses an incoming wire JSON message from a P2P DataChannel or pasted LAN delta bundle.
 * Supports both `pedigree-p2p-delta-v1` wire packets and `community-pedigree-delta-v1` files.
 */
export function parseP2pWireOrDeltaPayload(rawText: string): {
  messageKind: 'delta' | 'ack';
  senderDeviceId: string;
  operations: SyncOperation[];
  ack?: Extract<P2pWireMessage, { kind: 'pedigree-p2p-ack-v1' }>;
} {
  const parsed = JSON.parse(rawText) as Record<string, unknown> | unknown[];
  if (parsed && !Array.isArray(parsed) && parsed.kind === 'pedigree-p2p-ack-v1') {
    return {
      messageKind: 'ack',
      senderDeviceId: String(parsed.senderDeviceId || 'peer'),
      operations: [],
      ack: parsed as unknown as Extract<P2pWireMessage, { kind: 'pedigree-p2p-ack-v1' }>,
    };
  }

  let rawOps: unknown[] | null = null;
  let senderDeviceId = 'peer';

  if (Array.isArray(parsed)) {
    rawOps = parsed;
  } else if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.operations)) {
      rawOps = parsed.operations;
    }
    if (typeof parsed.senderDeviceId === 'string' && parsed.senderDeviceId.trim()) {
      senderDeviceId = parsed.senderDeviceId.trim();
    } else if (typeof (parsed as Partial<DeltaExportFile>).device_id === 'string') {
      senderDeviceId = String((parsed as Partial<DeltaExportFile>).device_id).trim() || 'peer';
    }
  }

  if (!rawOps) {
    throw new Error('Payload is not a valid Community Pedigree P2P or delta outbox message.');
  }
  if (rawOps.length > MAX_DELTA_OPERATIONS) {
    throw new Error(
      `Peer payload contains ${rawOps.length.toLocaleString()} operations, exceeding the ${MAX_DELTA_OPERATIONS.toLocaleString()} safety limit.`
    );
  }

  const validOps = rawOps.filter((op): op is SyncOperation => isValidSyncOperation(op));
  return {
    messageKind: 'delta',
    senderDeviceId,
    operations: validOps,
  };
}

/**
 * Summarizes task-specific reconciliation outcomes from a `mergeDeltaOperations` run.
 */
export function summarizeTaskReconciliation(params: {
  peerDeviceId: string;
  receivedOps: SyncOperation[];
  appliedOpCount: number;
  newConflicts: SyncConflictEntry[];
  reconciledAtIso?: string;
}): P2pReconciliationSummary {
  const taskOpsReceivedCount = params.receivedOps.filter(
    (op) => op.entity_type === 'task'
  ).length;
  const newTaskConflictCount = params.newConflicts.filter(
    (c) => c.entity_type === 'task'
  ).length;

  return {
    peerDeviceId: params.peerDeviceId || 'peer',
    receivedOpsCount: params.receivedOps.length,
    appliedOpCount: params.appliedOpCount,
    taskOpsReceivedCount,
    newConflictCount: params.newConflicts.length,
    newTaskConflictCount,
    reconciledAtIso: params.reconciledAtIso || nowIsoUtc(),
  };
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeBytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    out += BASE64_CHARS[(triplet >> 18) & 63];
    out += BASE64_CHARS[(triplet >> 12) & 63];
    out += hasB1 ? BASE64_CHARS[(triplet >> 6) & 63] : '=';
    out += hasB2 ? BASE64_CHARS[triplet & 63] : '=';
  }
  return out;
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[\r\n\s]/g, '');
  if (typeof atob === 'function') {
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const len = clean.length;
  if (len % 4 !== 0) {
    throw new Error('Malformed base64 pairing token.');
  }
  let padding = 0;
  if (clean.endsWith('==')) padding = 2;
  else if (clean.endsWith('=')) padding = 1;
  const outLen = (len / 4) * 3 - padding;
  const out = new Uint8Array(outLen);
  let outIdx = 0;
  for (let i = 0; i < len; i += 4) {
    const c0 = BASE64_CHARS.indexOf(clean[i]);
    const c1 = BASE64_CHARS.indexOf(clean[i + 1]);
    const c2 = clean[i + 2] === '=' ? 0 : BASE64_CHARS.indexOf(clean[i + 2]);
    const c3 = clean[i + 3] === '=' ? 0 : BASE64_CHARS.indexOf(clean[i + 3]);
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) {
      throw new Error('Malformed base64 character in pairing token.');
    }
    const triplet = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (outIdx < outLen) out[outIdx++] = (triplet >> 16) & 255;
    if (outIdx < outLen) out[outIdx++] = (triplet >> 8) & 255;
    if (outIdx < outLen) out[outIdx++] = triplet & 255;
  }
  return out;
}

/**
 * Encodes a serverless WebRTC SDP Offer/Answer envelope into a single-line copy/QR token (`CP-LAN1:...`).
 * Uses pure UTF-8 base64 without requiring DOM `window.btoa` or Node `Buffer`.
 */
export function encodeP2pSignalToken(envelope: P2pSignalEnvelope): string {
  const json = JSON.stringify(envelope);
  const bytes = new TextEncoder().encode(json);
  return `CP-LAN1:${encodeBytesToBase64(bytes)}`;
}

/**
 * Decodes a `CP-LAN1:...` or raw JSON WebRTC SDP Offer/Answer token.
 */
export function decodeP2pSignalToken(rawToken: string): P2pSignalEnvelope {
  const clean = rawToken.trim();
  if (!clean) {
    throw new Error('Paste a peer connection code first.');
  }
  let jsonStr = clean;
  if (clean.startsWith('CP-LAN1:')) {
    const b64 = clean.slice('CP-LAN1:'.length).trim();
    const bytes = decodeBase64ToBytes(b64);
    jsonStr = new TextDecoder().decode(bytes);
  }
  const parsed = JSON.parse(jsonStr) as Partial<P2pSignalEnvelope>;
  if (
    !parsed ||
    parsed.v !== 1 ||
    (parsed.type !== 'offer' && parsed.type !== 'answer') ||
    typeof parsed.sdp !== 'string' ||
    !parsed.sdp.trim()
  ) {
    throw new Error('Invalid LAN P2P pairing code. Copy the full CP-LAN1 token from your peer device.');
  }
  return {
    v: 1,
    type: parsed.type,
    deviceId: typeof parsed.deviceId === 'string' && parsed.deviceId.trim() ? parsed.deviceId.trim() : 'peer',
    sdp: parsed.sdp,
    createdAtIso: typeof parsed.createdAtIso === 'string' ? parsed.createdAtIso : nowIsoUtc(),
  };
}
```

## `src/core/pairingMatrix.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Multi-Candidate Pairing Comparison Matrix Engine (`src/core/pairingMatrix.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) dependencies so the exact
 * same comparison matrix runs offline in Web PWAs and native mobile apps.
 *
 * Design:
 * - Compares 1 anchor Dam against multiple candidate Sires, OR 1 anchor Sire against multiple
 *   candidate Dams, strictly scoped to a single species.
 * - Shares one `createSpeciesCoiEvaluator(herdById)` instance across all candidate evaluations
 *   and pre-computes anchor carrier lineage once so multi-candidate matrices stay fast on mobile.
 */

import {
  analyzeAnimalCarrierLineage,
  analyzePairingCarrierRisksFromAnalyses,
  AnimalCarrierLineageAnalysis,
  PairingCarrierRisk,
} from './carrierGenetics';
import {
  BreedingGeneticAlert,
  PredictedPhenotypeRow,
  PunnettSimulationSummary,
  simulatePairingGenetics,
} from './geneticsEngine';
import { Animal, isAnimalArchived, isSameSpecies } from './models';
import {
  AncestorContribution,
  CoiRiskDescriptor,
  createSpeciesCoiEvaluator,
  getPedigreeCompletenessSummary,
  PedigreeCompletenessSummary,
} from './pedigreeCalculator';

export type PairingAnchorRole = 'dam' | 'sire';

export type PairingMatrixSortBy =
  | 'best_match'
  | 'coi_asc'
  | 'coi_desc'
  | 'risk_asc'
  | 'name_asc';

export const MAX_MATRIX_CANDIDATES = 40;
export const DEFAULT_MATRIX_INITIAL_SELECTION = 6;
export const TOP_BOTTLENECK_LIMIT = 3;
export const TOP_VARIETY_LIMIT = 3;

export interface PairingBottleneckSummary {
  ancestorId: string;
  name: string;
  tattoo: string;
  coiContributionPercent: number;
  sireAppearances: number;
  damAppearances: number;
}

export interface PairingRiskBadgeSummary {
  carrierDangerCount: number;
  carrierWarningCount: number;
  carrierInfoCount: number;
  geneticDangerCount: number;
  geneticWarningCount: number;
  totalDangerCount: number;
  totalWarningCount: number;
  carrierRisks: PairingCarrierRisk[];
  geneticAlerts: BreedingGeneticAlert[];
}

export interface PairingMatrixRow {
  pairKey: string;
  candidate: Animal;
  sire: Animal;
  dam: Animal;
  coiPercent: number;
  coiRisk: CoiRiskDescriptor;
  completeness: PedigreeCompletenessSummary;
  sharedAncestors: AncestorContribution[];
  topBottlenecks: PairingBottleneckSummary[];
  totalSharedAncestorCount: number;
  riskSummary: PairingRiskBadgeSummary;
  genetics: PunnettSimulationSummary;
  topVarieties: PredictedPhenotypeRow[];
  sameBreed: boolean;
  isRecommendedLowestRisk: boolean;
}

export interface PairingMatrixSummary {
  totalRequested: number;
  totalEvaluated: number;
  totalMatchingFilters: number;
  truncatedCount: number;
  lowCoiCount: number;
  dangerRiskCount: number;
  lowestCoiPercent: number | null;
  highestCoiPercent: number | null;
}

export interface PairingMatrixResult {
  anchorRole: PairingAnchorRole;
  anchor: Animal;
  speciesName: string;
  rows: PairingMatrixRow[];
  summary: PairingMatrixSummary;
}

export interface BuildPairingMatrixParams {
  anchor: Animal;
  anchorRole: PairingAnchorRole;
  candidates: Animal[];
  herdById: Map<string, Animal>;
  speciesName?: string;
  sortBy?: PairingMatrixSortBy;
  hideDangerRisks?: boolean;
  maxCoiPercent?: number | null;
  maxCandidates?: number;
}

function normalizeBreedKey(breed?: string): string {
  return (breed || '').trim().toLowerCase();
}

/**
 * Selects a sensible default candidate ID list for an anchor animal:
 * prioritizes active same-breed candidates first, then other active candidates,
 * then archived candidates, sorted alphabetically and capped at `maxInitial`.
 */
export function selectDefaultMatrixCandidateIds(
  anchor: Animal | null | undefined,
  candidates: Animal[],
  maxInitial: number = DEFAULT_MATRIX_INITIAL_SELECTION
): string[] {
  if (!anchor || candidates.length === 0 || maxInitial <= 0) return [];
  const anchorBreed = normalizeBreedKey(anchor.breed);
  const seen = new Set<string>();
  const eligible: Animal[] = [];

  for (const c of candidates) {
    if (!c || !c.id || c.id === anchor.id || seen.has(c.id)) continue;
    if (!isSameSpecies(c.species, anchor.species)) continue;
    seen.add(c.id);
    eligible.push(c);
  }

  eligible.sort((a, b) => {
    const aArchived = isAnimalArchived(a) ? 1 : 0;
    const bArchived = isAnimalArchived(b) ? 1 : 0;
    if (aArchived !== bArchived) return aArchived - bArchived;

    if (anchorBreed) {
      const aSame = normalizeBreedKey(a.breed) === anchorBreed ? 0 : 1;
      const bSame = normalizeBreedKey(b.breed) === anchorBreed ? 0 : 1;
      if (aSame !== bSame) return aSame - bSame;
    }

    return a.name.localeCompare(b.name) || a.tattoo.localeCompare(b.tattoo);
  });

  return eligible.slice(0, maxInitial).map((c) => c.id);
}

function compareMatrixRows(
  a: PairingMatrixRow,
  b: PairingMatrixRow,
  sortBy: PairingMatrixSortBy
): number {
  const byName = () =>
    a.candidate.name.localeCompare(b.candidate.name) ||
    a.candidate.tattoo.localeCompare(b.candidate.tattoo);

  if (sortBy === 'name_asc') {
    return byName();
  }
  if (sortBy === 'coi_asc') {
    if (Math.abs(a.coiPercent - b.coiPercent) > 0.0001) return a.coiPercent - b.coiPercent;
    if (a.riskSummary.totalDangerCount !== b.riskSummary.totalDangerCount) {
      return a.riskSummary.totalDangerCount - b.riskSummary.totalDangerCount;
    }
    return byName();
  }
  if (sortBy === 'coi_desc') {
    if (Math.abs(b.coiPercent - a.coiPercent) > 0.0001) return b.coiPercent - a.coiPercent;
    return byName();
  }
  if (sortBy === 'risk_asc') {
    if (a.riskSummary.totalDangerCount !== b.riskSummary.totalDangerCount) {
      return a.riskSummary.totalDangerCount - b.riskSummary.totalDangerCount;
    }
    if (a.riskSummary.totalWarningCount !== b.riskSummary.totalWarningCount) {
      return a.riskSummary.totalWarningCount - b.riskSummary.totalWarningCount;
    }
    if (a.riskSummary.carrierInfoCount !== b.riskSummary.carrierInfoCount) {
      return a.riskSummary.carrierInfoCount - b.riskSummary.carrierInfoCount;
    }
    if (Math.abs(a.coiPercent - b.coiPercent) > 0.0001) return a.coiPercent - b.coiPercent;
    return byName();
  }

  // Default: 'best_match' — safety first (zero danger flags), then lower COI %, then fewer warnings, then breed match
  if (a.riskSummary.totalDangerCount !== b.riskSummary.totalDangerCount) {
    return a.riskSummary.totalDangerCount - b.riskSummary.totalDangerCount;
  }
  if (Math.abs(a.coiPercent - b.coiPercent) > 0.0001) {
    return a.coiPercent - b.coiPercent;
  }
  if (a.riskSummary.totalWarningCount !== b.riskSummary.totalWarningCount) {
    return a.riskSummary.totalWarningCount - b.riskSummary.totalWarningCount;
  }
  if (a.sameBreed !== b.sameBreed) {
    return a.sameBreed ? -1 : 1;
  }
  return byName();
}

/**
 * Evaluates a single anchor animal (Dam or Sire) against multiple opposite-sex candidates
 * side by side, returning COI %, shared bottleneck ancestors, carrier/genetic risk flags,
 * and predicted coat varieties for each pairing.
 */
export function buildPairingComparisonMatrix(
  params: BuildPairingMatrixParams
): PairingMatrixResult {
  const {
    anchor,
    anchorRole,
    candidates,
    herdById,
    sortBy = 'best_match',
    hideDangerRisks = false,
    maxCoiPercent = null,
  } = params;

  const effectiveSpecies = params.speciesName || anchor.species || 'Rabbit';
  const candidateCap = Math.max(1, Math.min(MAX_MATRIX_CANDIDATES, params.maxCandidates ?? MAX_MATRIX_CANDIDATES));

  // Deduplicate, enforce same-species boundary, and exclude self
  const seenIds = new Set<string>();
  const validCandidates: Animal[] = [];
  for (const c of candidates) {
    if (!c || !c.id || c.id === anchor.id || seenIds.has(c.id)) continue;
    if (!isSameSpecies(c.species, effectiveSpecies)) continue;
    seenIds.add(c.id);
    validCandidates.push(c);
  }

  const totalRequested = validCandidates.length;
  const boundedCandidates = validCandidates.slice(0, candidateCap);
  const truncatedCount = Math.max(0, totalRequested - boundedCandidates.length);

  // Build species-safe map ensuring anchor and all selected candidates are present
  const evalMap = new Map<string, Animal>(herdById);
  if (!evalMap.has(anchor.id)) {
    evalMap.set(anchor.id, anchor);
  }
  for (const c of boundedCandidates) {
    if (!evalMap.has(c.id)) {
      evalMap.set(c.id, c);
    }
  }

  const coiEvaluator = createSpeciesCoiEvaluator(evalMap);
  const anchorCarrierAnalysis: AnimalCarrierLineageAnalysis = analyzeAnimalCarrierLineage(
    anchor,
    evalMap
  );
  const anchorBreedKey = normalizeBreedKey(anchor.breed);

  const allEvaluatedRows: PairingMatrixRow[] = [];

  for (const candidate of boundedCandidates) {
    const sire = anchorRole === 'dam' ? candidate : anchor;
    const dam = anchorRole === 'dam' ? anchor : candidate;

    const coi = coiEvaluator.calculatePairingCoi(sire.id, dam.id);
    const completeness = getPedigreeCompletenessSummary(coi);

    const candidateCarrierAnalysis = analyzeAnimalCarrierLineage(candidate, evalMap);
    const carrierRisks =
      anchorRole === 'dam'
        ? analyzePairingCarrierRisksFromAnalyses(candidateCarrierAnalysis, anchorCarrierAnalysis)
        : analyzePairingCarrierRisksFromAnalyses(anchorCarrierAnalysis, candidateCarrierAnalysis);

    const genetics = simulatePairingGenetics(sire, dam, effectiveSpecies);

    const carrierDangerCount = carrierRisks.filter((r) => r.severity === 'danger').length;
    const carrierWarningCount = carrierRisks.filter((r) => r.severity === 'warning').length;
    const carrierInfoCount = carrierRisks.filter((r) => r.severity === 'info').length;
    const geneticDangerCount = genetics.lethalOrHealthAlerts.filter(
      (a) => a.severity === 'danger'
    ).length;
    const geneticWarningCount = genetics.lethalOrHealthAlerts.filter(
      (a) => a.severity === 'warning'
    ).length;

    const riskSummary: PairingRiskBadgeSummary = {
      carrierDangerCount,
      carrierWarningCount,
      carrierInfoCount,
      geneticDangerCount,
      geneticWarningCount,
      totalDangerCount: carrierDangerCount + geneticDangerCount,
      totalWarningCount: carrierWarningCount + geneticWarningCount,
      carrierRisks,
      geneticAlerts: genetics.lethalOrHealthAlerts,
    };

    const topBottlenecks: PairingBottleneckSummary[] = coi.sharedAncestors
      .slice(0, TOP_BOTTLENECK_LIMIT)
      .map((sa) => ({
        ancestorId: sa.ancestor.id,
        name: sa.ancestor.name,
        tattoo: sa.ancestor.tattoo,
        coiContributionPercent: sa.coiContributionPercent,
        sireAppearances: sa.sireAppearances,
        damAppearances: sa.damAppearances,
      }));

    const candBreedKey = normalizeBreedKey(candidate.breed);
    const sameBreed = Boolean(anchorBreedKey && candBreedKey && anchorBreedKey === candBreedKey);

    allEvaluatedRows.push({
      pairKey: `${sire.id}__${dam.id}`,
      candidate,
      sire,
      dam,
      coiPercent: coi.coiPercent,
      coiRisk: coi.risk,
      completeness,
      sharedAncestors: coi.sharedAncestors,
      topBottlenecks,
      totalSharedAncestorCount: coi.sharedAncestors.length,
      riskSummary,
      genetics,
      topVarieties: genetics.predictedPhenotypes.slice(0, TOP_VARIETY_LIMIT),
      sameBreed,
      isRecommendedLowestRisk: false,
    });
  }

  // Apply optional filters
  const filteredRows = allEvaluatedRows.filter((row) => {
    if (hideDangerRisks && row.riskSummary.totalDangerCount > 0) return false;
    if (
      typeof maxCoiPercent === 'number' &&
      Number.isFinite(maxCoiPercent) &&
      row.coiPercent > maxCoiPercent + 0.0001
    ) {
      return false;
    }
    return true;
  });

  // Identify lowest-risk recommended candidate(s) across filtered rows when comparing >= 2
  if (filteredRows.length >= 2) {
    const safePool = filteredRows.filter(
      (r) => r.riskSummary.totalDangerCount === 0 && r.coiPercent < 12.5
    );
    if (safePool.length > 0) {
      const sortedSafe = [...safePool].sort((a, b) => compareMatrixRows(a, b, 'best_match'));
      const best = sortedSafe[0];
      for (const row of safePool) {
        if (
          Math.abs(row.coiPercent - best.coiPercent) <= 0.0001 &&
          row.riskSummary.totalWarningCount === best.riskSummary.totalWarningCount
        ) {
          row.isRecommendedLowestRisk = true;
        }
      }
    }
  }

  filteredRows.sort((a, b) => compareMatrixRows(a, b, sortBy));

  let lowestCoiPercent: number | null = null;
  let highestCoiPercent: number | null = null;
  let lowCoiCount = 0;
  let dangerRiskCount = 0;

  for (const row of filteredRows) {
    if (lowestCoiPercent === null || row.coiPercent < lowestCoiPercent) {
      lowestCoiPercent = row.coiPercent;
    }
    if (highestCoiPercent === null || row.coiPercent > highestCoiPercent) {
      highestCoiPercent = row.coiPercent;
    }
    if (row.coiPercent < 6.25 && row.riskSummary.totalDangerCount === 0) {
      lowCoiCount += 1;
    }
    if (row.riskSummary.totalDangerCount > 0) {
      dangerRiskCount += 1;
    }
  }

  return {
    anchorRole,
    anchor,
    speciesName: effectiveSpecies,
    rows: filteredRows,
    summary: {
      totalRequested,
      totalEvaluated: allEvaluatedRows.length,
      totalMatchingFilters: filteredRows.length,
      truncatedCount,
      lowCoiCount,
      dangerRiskCount,
      lowestCoiPercent,
      highestCoiPercent,
    },
  };
}
```

## `src/core/pdfExporter.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript 100% Offline PDF 1.4 Generator (`src/core/pdfExporter.ts`).
 *
 * Produces vector-sharp, searchable, standards-compliant PDF 1.4 binaries (`Uint8Array`)
 * for multi-generation ARBA/Evans-style pedigrees with zero external dependencies and
 * zero browser DOM (`window`, `document`) calls.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * Runs identically in Web Workers, Node/Vitest, PWA main thread, and React Native / Expo.
 * Raster images (optional breeder logo & subject portrait) are accepted as pre-encoded
 * baseline JPEG payloads (`PdfRasterImage`) and embedded natively via PDF `/DCTDecode`.
 */

import { formatCompactCarrierDisclosure } from './carrierGenetics';
import { formatGenotypeArray } from './geneticsEngine';
import {
  Animal,
  BarnSettings,
  formatPedigreeWeight,
  formatReadableDate,
  formatSexForSpecies,
  normalizePedigreeGenerationDepth,
  nowIsoUtc,
  PedigreeGenerationDepth,
  resolveSpeciesProfile,
  resolveSpeciesWeightUnit,
  SpeciesProfile,
} from './models';
import {
  buildPedigreeSlots,
  buildSpeciesHerdMap,
  calculateAnimalCoi,
  PedigreeSlot,
} from './pedigreeCalculator';
import { hexToPdfRgb, resolvePedigreePrintTheme } from './pedigreePrintStyles';
import { computeAnimalShowSummary } from './showResults';
import type { PedigreePrintOrientation, PedigreePrintOptions } from './syncAndExports';
import {
  AnimalWoolSummary,
  buildWoolHarvestSummaryByAnimalId,
  formatWoolWeightSummary,
  summarizeAnimalWoolHarvests,
} from './woolFiber';

export interface PdfRasterImage {
  /** Raw JPEG bytes (`FF D8 ... FF D9`) for native PDF `/DCTDecode` embedding. */
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface PedigreePdfExportParams {
  subject: Animal;
  allAnimals: Animal[];
  speciesProfiles: SpeciesProfile[];
  settings: BarnSettings;
  generations?: PedigreeGenerationDepth;
  printOptions?: PedigreePrintOptions;
  subjectPhotoJpeg?: PdfRasterImage;
  breederLogoJpeg?: PdfRasterImage;
}

const PT_LETTER_SHORT = 612; // 8.5 in * 72 pt/in
const PT_LETTER_LONG = 792; // 11.0 in * 72 pt/in

function toPdfAscii(raw: string): string {
  return (raw || '')
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00B7|\u2022/g, '|')
    .replace(/\u2192/g, '->')
    .replace(/\u00D7/g, 'x')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapePdfLiteral(raw: string): string {
  return toPdfAscii(raw)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function estimateTextWidthPt(text: string, fontSize: number, isBold = false): number {
  const avgFactor = isBold ? 0.56 : 0.52;
  return text.length * fontSize * avgFactor;
}

function wrapPdfLines(
  rawText: string,
  maxWidthPt: number,
  fontSize: number,
  maxLines: number,
  isBold = false
): string[] {
  const clean = toPdfAscii(rawText);
  if (!clean || maxLines <= 0 || maxWidthPt <= 8) return [];
  const maxCharsPerLine = Math.max(4, Math.floor(maxWidthPt / (fontSize * (isBold ? 0.56 : 0.52))));
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  const pushTruncated = (text: string) => {
    if (text.length <= maxCharsPerLine) {
      lines.push(text);
    } else {
      lines.push(`${text.slice(0, Math.max(1, maxCharsPerLine - 3))}...`);
    }
  };

  for (const word of words) {
    if (!current) {
      if (word.length <= maxCharsPerLine) {
        current = word;
      } else {
        current = word.slice(0, maxCharsPerLine);
      }
      continue;
    }
    const candidate = `${current} ${word}`;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      lines.push(current);
      if (lines.length >= maxLines) {
        const last = lines[lines.length - 1];
        if (last.length > maxCharsPerLine - 3) {
          lines[lines.length - 1] = `${last.slice(0, Math.max(1, maxCharsPerLine - 3))}...`;
        } else {
          lines[lines.length - 1] = `${last}...`;
        }
        return lines;
      }
      current = word.length <= maxCharsPerLine ? word : word.slice(0, maxCharsPerLine);
    }
  }

  if (current && lines.length < maxLines) {
    pushTruncated(current);
  }
  return lines.slice(0, maxLines);
}

function encodeAsciiBytes(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    out[i] = str.charCodeAt(i) & 0xff;
  }
  return out;
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.byteLength;
  }
  return result;
}

function fmtPt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

function isValidJpegImage(img?: PdfRasterImage): img is PdfRasterImage {
  return Boolean(
    img &&
      img.bytes &&
      img.bytes.byteLength >= 4 &&
      img.width > 0 &&
      img.height > 0 &&
      img.bytes[0] === 0xff &&
      img.bytes[1] === 0xd8
  );
}

const GEN_COLUMN_TITLES: readonly string[] = [
  'Parents (Gen 1)',
  'Grandparents (Gen 2)',
  'Great-Grandparents (Gen 3)',
  '4th Gen (Gen 4)',
  '5th Gen (Gen 5)',
  '6th Gen (Gen 6)',
  '7th Gen (Gen 7)',
  '8th Gen (Gen 8)',
];

function formatAncestorLabel(animal: Animal | null | undefined, roleFallback: string): string {
  if (!animal) return `${roleFallback} (Unknown)`;
  return animal.tattoo ? `${animal.name} (${animal.tattoo})` : animal.name;
}

/**
 * Builds a clean, vector-text + optional JPEG-image US Letter PDF (`Uint8Array`)
 * for 3–8 generation ARBA/Evans pedigrees.
 * - 3–6 Generations: Single-page US Letter certificate.
 * - 7 Generations: 2-page US Letter chart (Sire's Line Gen 2–7, Dam's Line Gen 2–7).
 * - 8 Generations: 4-page US Letter chart (one quadrant per Gen-2 Grandparent, Gen 3–8).
 */
export function buildPedigreePdfBytes(params: PedigreePdfExportParams): Uint8Array {
  const {
    subject,
    allAnimals,
    speciesProfiles,
    settings,
    generations = 3,
    printOptions,
    subjectPhotoJpeg,
    breederLogoJpeg,
  } = params;

  const depth = normalizePedigreeGenerationDepth(generations, 3);
  const theme = resolvePedigreePrintTheme(printOptions, settings.customColors);
  const primaryRgb = hexToPdfRgb(theme.primaryHex);
  const accentRgb = hexToPdfRgb(theme.accentHex);
  const sireRgb = hexToPdfRgb(theme.sireHex);
  const damRgb = hexToPdfRgb(theme.damHex);
  const borderRgb = hexToPdfRgb(theme.borderHex);
  const cellBorderRgb = hexToPdfRgb(theme.cellBorderHex);
  const inkRgb = hexToPdfRgb(theme.inkHex);
  const mutedInkRgb = hexToPdfRgb(theme.mutedInkHex);

  const orientation: PedigreePrintOrientation =
    printOptions?.orientation === 'portrait' ? 'portrait' : 'landscape';
  const isPortrait = orientation === 'portrait';
  const isCompactLedger = theme.layoutPreset === 'compact_ledger';
  const isShowCert = theme.layoutPreset === 'show_certificate';

  const pageWidth = isPortrait ? PT_LETTER_SHORT : PT_LETTER_LONG;
  const pageHeight = isPortrait ? PT_LETTER_LONG : PT_LETTER_SHORT;
  const margin = depth >= 5 || isCompactLedger ? 24 : isPortrait ? 28 : 32;
  const contentWidth = pageWidth - margin * 2;

  const sp = resolveSpeciesProfile(subject.species, speciesProfiles);
  const herdById = buildSpeciesHerdMap(allAnimals, subject.species);
  const slots = buildPedigreeSlots(subject, herdById, depth, sp);
  const coi = calculateAnimalCoi(subject, herdById);

  const showWeights = printOptions?.showWeights ?? true;
  const arbaLbsOzDotNotation = Boolean(printOptions?.arbaLbsOzDotNotation);
  const showGenotypes = printOptions?.showGenotypes ?? true;
  const showBreederFooter = printOptions?.showBreederFooter ?? true;
  const breederContactLine = (printOptions?.breederContactLine || '').trim();
  const showBreederLogo = printOptions?.showBreederLogo ?? true;
  const effectiveWeightUnit = resolveSpeciesWeightUnit(sp, settings);

  const slotMap = new Map<string, PedigreeSlot>();
  for (const sl of slots) {
    slotMap.set(`${sl.generation}:${sl.slotIndex}`, sl);
  }

  const hasLogo = showBreederLogo && isValidJpegImage(breederLogoJpeg);
  const hasPhoto = isValidJpegImage(subjectPhotoJpeg);

  const subjectGeno = showGenotypes
    ? subject.genotypeRaw || formatGenotypeArray(subject.genotype)
    : '';
  const subjectCarriers = formatCompactCarrierDisclosure(subject, {
    herdById,
    includeLineage: true,
    includeCleared: true,
  });

  const subjectFields: string[] = [
    `Name: ${subject.name}`,
    `Tattoo/ID: ${subject.tattoo || 'Unmarked'}`,
    `Breed & Variety: ${[subject.breed, subject.variety].filter(Boolean).join(' ') || 'Unspecified'}`,
    `Sex: ${formatSexForSpecies(subject.sex, sp)}`,
    `DOB: ${formatReadableDate(subject.birthDateIso)}`,
  ];
  if (showWeights) {
    subjectFields.push(
      `Weight: ${formatPedigreeWeight(subject.weightGrams, effectiveWeightUnit, arbaLbsOzDotNotation)}`
    );
  }
  if (subject.registrationNumber) subjectFields.push(`Reg #: ${subject.registrationNumber}`);
  if (subject.grandChampionNumber) subjectFields.push(`GC #: ${subject.grandChampionNumber}`);
  const subjShow = computeAnimalShowSummary(
    subject,
    printOptions?.shows ?? [],
    printOptions?.careLogs ?? []
  );
  if (subjShow.effectiveLegs > 0 || subjShow.showsEntered > 0) {
    subjectFields.push(`Legs / GC: ${subjShow.gcProgress.shortLabel}`);
  }
  if (subjShow.awardsSummaryText) {
    subjectFields.push(`Show Wins: ${subjShow.awardsSummaryText}`);
  }
  if (subjShow.totalPoints > 0) {
    subjectFields.push(`Show Points: ${subjShow.totalPoints}`);
  }
  if (subject.rufusLevel) subjectFields.push(`Rufus: ${subject.rufusLevel}`);
  const woolHarvestList = printOptions?.woolHarvests ?? [];
  const woolSummaryByAnimalId =
    woolHarvestList.length > 0
      ? buildWoolHarvestSummaryByAnimalId(woolHarvestList)
      : new Map<string, AnimalWoolSummary>();
  const subjectWool =
    woolHarvestList.length > 0 ? summarizeAnimalWoolHarvests(woolHarvestList, subject.id) : null;
  const subjectWoolLine = subjectWool ? formatWoolWeightSummary(subjectWool) : '';
  if (subjectWoolLine) subjectFields.push(`Wool / Fiber: ${subjectWoolLine}`);
  if (showGenotypes && subjectGeno) subjectFields.push(`Genotype: ${subjectGeno}`);
  if (subjectCarriers) subjectFields.push(`Carriers: ${subjectCarriers}`);

  const hasNotice =
    (showGenotypes &&
      (Boolean(subjectGeno) ||
        slots.some((sl) => Boolean(sl.animal && (sl.animal.genotypeRaw || sl.animal.genotype.length))))) ||
    Boolean(subject.rufusLevel);

  interface PageSlice {
    rootGen: number;
    rootSlotIdx: number;
    branchBanner: string;
    pageNumber: number;
    totalPages: number;
  }

  const pageSlices: PageSlice[] = [];
  if (depth <= 6) {
    pageSlices.push({
      rootGen: 0,
      rootSlotIdx: 0,
      branchBanner: '',
      pageNumber: 1,
      totalPages: 1,
    });
  } else if (depth === 7) {
    const sire = slotMap.get('1:0')?.animal;
    const dam = slotMap.get('1:1')?.animal;
    pageSlices.push(
      {
        rootGen: 1,
        rootSlotIdx: 0,
        branchBanner: `Sheet 1 of 2 | ${sp.maleLabel}'s Ancestry Line (Gen 2-7): ${formatAncestorLabel(sire, sp.maleLabel)}`,
        pageNumber: 1,
        totalPages: 2,
      },
      {
        rootGen: 1,
        rootSlotIdx: 1,
        branchBanner: `Sheet 2 of 2 | ${sp.femaleLabel}'s Ancestry Line (Gen 2-7): ${formatAncestorLabel(dam, sp.femaleLabel)}`,
        pageNumber: 2,
        totalPages: 2,
      }
    );
  } else {
    const quadrantConfigs: Array<{ idx: number; label: string }> = [
      { idx: 0, label: `Paternal Grandsire Line (${sp.maleLabel}'s ${sp.maleLabel})` },
      { idx: 1, label: `Paternal Granddam Line (${sp.maleLabel}'s ${sp.femaleLabel})` },
      { idx: 2, label: `Maternal Grandsire Line (${sp.femaleLabel}'s ${sp.maleLabel})` },
      { idx: 3, label: `Maternal Granddam Line (${sp.femaleLabel}'s ${sp.femaleLabel})` },
    ];
    quadrantConfigs.forEach((quad, qIdx) => {
      const parentSlot = slotMap.get(`1:${quad.idx >> 1}`)?.animal;
      const gpSlot = slotMap.get(`2:${quad.idx}`)?.animal;
      const parentTag = quad.idx < 2 ? sp.maleLabel : sp.femaleLabel;
      pageSlices.push({
        rootGen: 2,
        rootSlotIdx: quad.idx,
        branchBanner: `Sheet ${qIdx + 1} of 4 | ${quad.label}: ${formatAncestorLabel(parentSlot, parentTag)} -> ${formatAncestorLabel(gpSlot, 'Gen 2')} (Gen 3-8)`,
        pageNumber: qIdx + 1,
        totalPages: 4,
      });
    });
  }

  const renderPageStream = (slice: PageSlice): Uint8Array => {
    const ops: string[] = [];
    const drawText = (
      x: number,
      yTop: number,
      text: string,
      font: 'F1' | 'F2' | 'F3',
      size: number,
      rgb: [number, number, number] = inkRgb
    ) => {
      const clean = escapePdfLiteral(text);
      if (!clean) return;
      const pdfY = pageHeight - yTop;
      ops.push(
        `BT /${font} ${fmtPt(size)} Tf ${rgb.map((v) => v.toFixed(3)).join(' ')} rg 1 0 0 1 ${fmtPt(x)} ${fmtPt(pdfY)} Tm (${clean}) Tj ET`
      );
    };

    const drawRect = (
      x: number,
      yTop: number,
      w: number,
      h: number,
      opts?: {
        fillRgb?: [number, number, number];
        strokeRgb?: [number, number, number];
        lineWidth?: number;
      }
    ) => {
      const pdfBottom = pageHeight - (yTop + h);
      ops.push('q');
      if (opts?.lineWidth !== undefined) {
        ops.push(`${fmtPt(opts.lineWidth)} w`);
      }
      if (opts?.fillRgb) {
        ops.push(`${opts.fillRgb.map((v) => v.toFixed(3)).join(' ')} rg`);
      }
      if (opts?.strokeRgb) {
        ops.push(`${opts.strokeRgb.map((v) => v.toFixed(3)).join(' ')} RG`);
      }
      ops.push(`${fmtPt(x)} ${fmtPt(pdfBottom)} ${fmtPt(w)} ${fmtPt(h)} re`);
      if (opts?.fillRgb && opts?.strokeRgb) {
        ops.push('B');
      } else if (opts?.fillRgb) {
        ops.push('f');
      } else {
        ops.push('S');
      }
      ops.push('Q');
    };

    const drawLine = (
      x1: number,
      yTop1: number,
      x2: number,
      yTop2: number,
      rgb: [number, number, number] = cellBorderRgb,
      lineWidth = 0.75
    ) => {
      ops.push('q');
      ops.push(`${fmtPt(lineWidth)} w`);
      ops.push(`${rgb.map((v) => v.toFixed(3)).join(' ')} RG`);
      ops.push(`${fmtPt(x1)} ${fmtPt(pageHeight - yTop1)} m ${fmtPt(x2)} ${fmtPt(pageHeight - yTop2)} l S`);
      ops.push('Q');
    };

    const drawImage = (
      name: string,
      x: number,
      yTop: number,
      w: number,
      h: number
    ) => {
      const pdfBottom = pageHeight - (yTop + h);
      ops.push(`q ${fmtPt(w)} 0 0 ${fmtPt(h)} ${fmtPt(x)} ${fmtPt(pdfBottom)} cm /${name} Do Q`);
    };

    // White page backdrop
    drawRect(0, 0, pageWidth, pageHeight, { fillRgb: [1, 1, 1] });

    // Outer frame for double_frame or modern_rounded
    const frameInset = theme.borderStyle === 'double_frame' ? 8 : 0;
    if (theme.borderStyle === 'double_frame') {
      const outerPad = Math.max(8, margin - 8);
      drawRect(outerPad, outerPad, pageWidth - outerPad * 2, pageHeight - outerPad * 2, {
        strokeRgb: borderRgb,
        lineWidth: 1.4,
      });
      drawRect(outerPad + 3, outerPad + 3, pageWidth - (outerPad + 3) * 2, pageHeight - (outerPad + 3) * 2, {
        strokeRgb: borderRgb,
        lineWidth: 0.65,
      });
    } else if (theme.borderStyle === 'modern_rounded') {
      const outerPad = Math.max(10, margin - 6);
      drawRect(outerPad, outerPad, pageWidth - outerPad * 2, pageHeight - outerPad * 2, {
        strokeRgb: borderRgb,
        lineWidth: 1.0,
      });
    }

    const innerLeft = margin + frameInset * 0.5;
    const innerWidth = contentWidth - frameInset;
    let cursorY = margin + frameInset * 0.5;

    // --- Header Band ---
    const headerHeight = isCompactLedger ? (hasLogo ? 32 : 26) : hasLogo ? 40 : 32;
    const barnTitle = settings.barnName || 'Community Pedigree';
    const pageSuffix = slice.totalPages > 1 ? ` | Page ${slice.pageNumber}/${slice.totalPages}` : '';
    const subLeft = `${
      theme.layoutPreset === 'iagarb_angora'
        ? `IAGARB German Angora ${depth}-Generation Wool Pedigree`
        : theme.layoutPreset === 'family_portrait'
        ? `Family Portrait ${depth}-Generation ${subject.species} Pedigree`
        : `Official ${depth}-Generation ${subject.species} Pedigree Certificate`
    }${settings.breederName ? ` | Breeder: ${settings.breederName}` : ''}`;
    const rightMeta = `Generated ${formatReadableDate(nowIsoUtc().slice(0, 10))} | Wright COI: ${coi.coiPercent.toFixed(2)}% (${coi.risk.label})${pageSuffix}`;

    if (isShowCert && !hasLogo) {
      const titleSize = isPortrait ? 15 : 16.5;
      const titleW = estimateTextWidthPt(toPdfAscii(barnTitle), titleSize, true);
      drawText(innerLeft + Math.max(0, (innerWidth - titleW) / 2), cursorY + 13, barnTitle, 'F2', titleSize, primaryRgb);
      const centeredSub = `${subLeft}  |  ${rightMeta}`;
      const subSize = isPortrait ? 7.5 : 8.2;
      const subW = estimateTextWidthPt(toPdfAscii(centeredSub), subSize, false);
      drawText(innerLeft + Math.max(0, (innerWidth - subW) / 2), cursorY + 26, centeredSub, 'F1', subSize, mutedInkRgb);
    } else {
      let titleOffsetX = innerLeft;
      if (hasLogo && breederLogoJpeg) {
        const maxLogoH = isCompactLedger ? 26 : 34;
        const maxLogoW = isCompactLedger ? 76 : 92;
        const scale = Math.min(maxLogoW / breederLogoJpeg.width, maxLogoH / breederLogoJpeg.height);
        const drawW = Math.max(12, breederLogoJpeg.width * scale);
        const drawH = Math.max(12, breederLogoJpeg.height * scale);
        drawImage('ImLogo', innerLeft, cursorY + (headerHeight - 6 - drawH) / 2, drawW, drawH);
        titleOffsetX = innerLeft + drawW + 10;
      }

      drawText(
        titleOffsetX,
        cursorY + (isCompactLedger ? 12 : 14),
        barnTitle,
        'F2',
        isCompactLedger ? 13 : isPortrait ? 14 : 15,
        primaryRgb
      );
      drawText(
        titleOffsetX,
        cursorY + (isCompactLedger ? 23 : 27),
        subLeft,
        'F1',
        isCompactLedger ? 7.5 : isPortrait ? 8 : 8.5,
        mutedInkRgb
      );
      const rightSize = isCompactLedger ? 7.2 : isPortrait ? 7.5 : 8.5;
      const rightW = estimateTextWidthPt(toPdfAscii(rightMeta), rightSize, false);
      drawText(
        Math.max(titleOffsetX + 180, innerLeft + innerWidth - rightW),
        cursorY + (isCompactLedger ? 23 : 27),
        rightMeta,
        'F1',
        rightSize,
        mutedInkRgb
      );
    }

    cursorY += headerHeight;
    drawLine(
      innerLeft,
      cursorY,
      innerLeft + innerWidth,
      cursorY,
      borderRgb,
      theme.borderStyle === 'minimal_lines' ? 0.8 : 1.5
    );
    cursorY += isCompactLedger ? 5 : 8;

    // --- Subject Summary Box (Full on Page 1 or 3-6G, Compact on Pages 2-4 of 7-8G) ---
    const isContinuationPage = slice.pageNumber > 1;
    if (isContinuationPage) {
      const compactText = `${subject.name}${subject.tattoo ? ` (${subject.tattoo})` : ''} | ${[subject.breed, subject.variety].filter(Boolean).join(' ')} | ${formatSexForSpecies(subject.sex, sp)} | Wright COI: ${coi.coiPercent.toFixed(2)}%`;
      drawRect(innerLeft, cursorY, innerWidth, 18, {
        fillRgb: [1, 1, 1],
        strokeRgb: theme.borderStyle === 'minimal_lines' ? cellBorderRgb : borderRgb,
        lineWidth: 0.65,
      });
      drawText(innerLeft + 6, cursorY + 12, compactText, 'F2', 8, inkRgb);
      cursorY += 22;
    } else {
      const photoBoxSize = hasPhoto ? (isCompactLedger ? 40 : isPortrait ? 52 : 58) : 0;
      const subjectTextX = innerLeft + 8 + (hasPhoto ? photoBoxSize + 10 : 0);
      const subjectTextWidth = innerWidth - 16 - (hasPhoto ? photoBoxSize + 10 : 0);
      const subjectFontSize = isCompactLedger ? 7.5 : isPortrait ? 8 : 8.5;
      const subjectLineHeight = isCompactLedger ? 9.5 : 11;
      const subjectLines = wrapPdfLines(
        subjectFields.join('   |   '),
        subjectTextWidth,
        subjectFontSize,
        isCompactLedger ? 3 : 5
      );
      const subjectBoxH = Math.max(
        hasPhoto ? photoBoxSize + 10 : isCompactLedger ? 26 : 34,
        subjectLines.length * subjectLineHeight + (isCompactLedger ? 8 : 12)
      );

      drawRect(innerLeft, cursorY, innerWidth, subjectBoxH, {
        fillRgb: [1, 1, 1],
        strokeRgb: theme.borderStyle === 'minimal_lines' ? cellBorderRgb : borderRgb,
        lineWidth: theme.borderStyle === 'minimal_lines' ? 0.6 : 0.85,
      });

      if (hasPhoto && subjectPhotoJpeg) {
        const scale = Math.min(photoBoxSize / subjectPhotoJpeg.width, photoBoxSize / subjectPhotoJpeg.height);
        const drawW = Math.max(12, subjectPhotoJpeg.width * scale);
        const drawH = Math.max(12, subjectPhotoJpeg.height * scale);
        const px = innerLeft + 8 + (photoBoxSize - drawW) / 2;
        const py = cursorY + (subjectBoxH - drawH) / 2;
        drawImage('ImPhoto', px, py, drawW, drawH);
      }

      subjectLines.forEach((line, idx) => {
        drawText(subjectTextX, cursorY + (isCompactLedger ? 10 : 13) + idx * subjectLineHeight, line, 'F1', subjectFontSize, inkRgb);
      });

      cursorY += subjectBoxH + (isCompactLedger ? 5 : 8);
    }

    if (slice.branchBanner) {
      drawRect(innerLeft, cursorY, innerWidth, 16, {
        fillRgb: [1, 1, 1],
        strokeRgb: borderRgb,
        lineWidth: 0.75,
      });
      drawText(innerLeft + 6, cursorY + 11, slice.branchBanner, 'F2', 7.8, primaryRgb);
      cursorY += 20;
    }

    // --- Footer / Notice Height Reservation ---
    const showFooterOnThisPage = showBreederFooter && (slice.totalPages === 1 || slice.pageNumber === slice.totalPages);
    const noticeHeight = hasNotice ? 14 : 0;
    const footerHeight = showFooterOnThisPage ? (breederContactLine ? 38 : 26) : 0;
    const bottomReserved =
      margin +
      frameInset * 0.5 +
      noticeHeight +
      footerHeight +
      (noticeHeight || footerHeight ? 8 : 0);

    const tableTopY = cursorY;
    const displayGenStart = slice.rootGen + 1;
    const displayColCount = depth - slice.rootGen;
    const tableHeaderH = depth >= 5 || isCompactLedger ? 16 : 20;
    const availableTableBodyH = Math.max(160, pageHeight - bottomReserved - tableTopY - tableHeaderH);

    // --- Generation Column Headers ---
    const colW = innerWidth / displayColCount;
    const headerFontSize = depth >= 5 || isPortrait || isCompactLedger ? 7.3 : 8.5;

    for (let c = 0; c < displayColCount; c++) {
      const g = displayGenStart + c;
      const gx = innerLeft + c * colW;
      drawRect(gx, tableTopY, colW, tableHeaderH, {
        fillRgb: [1, 1, 1],
        strokeRgb: borderRgb,
        lineWidth: theme.borderStyle === 'minimal_lines' ? 0.65 : 0.9,
      });
      drawText(
        gx + 4,
        tableTopY + tableHeaderH - 5,
        GEN_COLUMN_TITLES[g - 1] || `Gen ${g}`,
        'F2',
        headerFontSize,
        primaryRgb
      );
    }

    // --- Ancestor Matrix Cells ---
    const bodyTopY = tableTopY + tableHeaderH;
    const compactMode = depth >= 5 || isCompactLedger;
    const cellBorderWidth = theme.borderStyle === 'minimal_lines' ? 0.35 : 0.55;

    for (let c = 0; c < displayColCount; c++) {
      const g = displayGenStart + c;
      const relDepth = g - slice.rootGen; // 1..displayColCount
      const localSlotCount = 1 << relDepth;
      const cellH = availableTableBodyH / localSlotCount;
      const gx = innerLeft + c * colW;
      const padX = compactMode ? 3.5 : 5;
      const innerCellW = Math.max(18, colW - padX * 2);

      const nameSize =
        cellH < 8
          ? 4.6
          : cellH < 12
          ? 5.2
          : cellH < 20
          ? 6.2
          : cellH < 36
          ? 7.2
          : isPortrait && depth >= 4
          ? 7.6
          : 8.5;
      const metaSize = Math.max(4.4, nameSize - 1.1);
      const lineStep = Math.max(5.5, metaSize + 1.6);

      for (let localIdx = 0; localIdx < localSlotCount; localIdx++) {
        const globalSlotIdx = (slice.rootSlotIdx << relDepth) + localIdx;
        const cy = bodyTopY + localIdx * cellH;
        const slot = slotMap.get(`${g}:${globalSlotIdx}`);
        const animal = slot?.animal;
        const isSire = globalSlotIdx % 2 === 0;
        const roleTag = isSire ? sp.maleLabel : sp.femaleLabel;

        drawRect(gx, cy, colW, cellH, {
          fillRgb: [1, 1, 1],
          strokeRgb: cellBorderRgb,
          lineWidth: cellBorderWidth,
        });

        if (!animal) {
          if (cellH >= 6.4) {
            drawText(
              gx + padX,
              cy + Math.min(cellH - 1.5, cellH / 2 + metaSize * 0.35),
              `${roleTag} - Unknown`,
              'F1',
              Math.min(metaSize, cellH * 0.68),
              [0.38, 0.38, 0.38]
            );
          }
          continue;
        }

        drawLine(
          gx + 1.1,
          cy + 0.4,
          gx + 1.1,
          cy + cellH - 0.4,
          isSire ? sireRgb : damRgb,
          cellH < 9 ? 1.4 : 2.0
        );

        const linesToRender: Array<{ text: string; font: 'F1' | 'F2' | 'F3'; size: number; rgb: [number, number, number] }> = [];
        const inlineTattoo = cellH < 13 && animal.tattoo ? `${animal.name} (${animal.tattoo})` : animal.name;
        const nameWrapped = wrapPdfLines(inlineTattoo, innerCellW, nameSize, cellH >= 38 ? 2 : 1, true);
        for (const nl of nameWrapped) {
          linesToRender.push({ text: nl, font: 'F2', size: nameSize, rgb: inkRgb });
        }

        const metaParts = [
          animal.tattoo ? `ID: ${animal.tattoo}` : '',
          !compactMode && animal.variety ? animal.variety : '',
          showWeights && !compactMode && animal.weightGrams > 0
            ? formatPedigreeWeight(animal.weightGrams, effectiveWeightUnit, arbaLbsOzDotNotation)
            : '',
        ].filter(Boolean);
        if (metaParts.length > 0 && cellH >= 14.5) {
          const metaWrapped = wrapPdfLines(metaParts.join(' | '), innerCellW, metaSize, 1);
          for (const ml of metaWrapped) {
            linesToRender.push({ text: ml, font: 'F3', size: metaSize, rgb: [0.2, 0.2, 0.2] });
          }
        }

        if (!compactMode && animal.birthDateIso && cellH >= 28) {
          linesToRender.push({
            text: `DOB: ${formatReadableDate(animal.birthDateIso)}`,
            font: 'F3',
            size: metaSize,
            rgb: [0.24, 0.24, 0.24],
          });
        }

        const ancShowSummary =
          (printOptions?.shows?.length || 0) > 0 || (printOptions?.careLogs?.length || 0) > 0
            ? computeAnimalShowSummary(animal, printOptions?.shows ?? [], printOptions?.careLogs ?? [])
            : null;
        const ancLegs = ancShowSummary ? ancShowSummary.effectiveLegs : animal.legsCount;
        const regParts = [
          animal.registrationNumber ? `Reg: ${animal.registrationNumber}` : '',
          animal.grandChampionNumber ? `GC: ${animal.grandChampionNumber}` : '',
          ancLegs > 0 ? `Legs: ${ancLegs}` : '',
          ancShowSummary?.awardsSummaryText ? ancShowSummary.awardsSummaryText : '',
        ].filter(Boolean);
        const ancWool = woolSummaryByAnimalId.get(animal.id);
        const ancWoolText =
          ancWool && (ancWool.harvestCount > 0 || ancWool.highestIagarbScore)
            ? formatWoolWeightSummary(ancWool, { compact: true })
            : '';
        if (!compactMode && ancWoolText && cellH >= 40) {
          const woolWrapped = wrapPdfLines(ancWoolText, innerCellW, metaSize, 1);
          for (const wl of woolWrapped) {
            linesToRender.push({ text: wl, font: 'F3', size: metaSize, rgb: primaryRgb });
          }
        }
        if (!compactMode && regParts.length > 0 && cellH >= 36) {
          const regWrapped = wrapPdfLines(regParts.join(' | '), innerCellW, metaSize, 1);
          for (const rl of regWrapped) {
            linesToRender.push({ text: rl, font: 'F3', size: metaSize, rgb: [0.24, 0.24, 0.24] });
          }
        }

        const geno = showGenotypes ? animal.genotypeRaw || formatGenotypeArray(animal.genotype) : '';
        if (showGenotypes && !compactMode && geno && cellH >= 44) {
          const genoWrapped = wrapPdfLines(geno, innerCellW, metaSize, 1);
          for (const gl of genoWrapped) {
            linesToRender.push({ text: gl, font: 'F3', size: metaSize, rgb: primaryRgb });
          }
        }

        const carrierText = formatCompactCarrierDisclosure(animal, {
          herdById,
          includeCleared: true,
          ultraCompact: compactMode,
          maxItemsPerGroup: compactMode ? 1 : 3,
        });
        if (carrierText && cellH >= 22) {
          const carrierWrapped = wrapPdfLines(carrierText, innerCellW, metaSize, 1);
          for (const cl of carrierWrapped) {
            linesToRender.push({ text: cl, font: 'F1', size: metaSize, rgb: accentRgb });
          }
        }

        const maxFitLines = Math.max(1, Math.floor((cellH - 2) / lineStep));
        const visibleLines = linesToRender.slice(0, maxFitLines);
        const totalBlockH = visibleLines.length * lineStep;
        const startY =
          cellH < 9
            ? cy + Math.min(cellH - 1.2, cellH / 2 + nameSize * 0.35)
            : cy + Math.max(nameSize + 0.8, (cellH - totalBlockH) / 2 + nameSize * 0.8);

        visibleLines.forEach((item, lIdx) => {
          drawText(innerLeft + c * colW + padX + 1.5, startY + lIdx * lineStep, item.text, item.font, item.size, item.rgb);
        });
      }
    }

    // --- Bottom Notice & Breeder Certification Footer ---
    let footerY = bodyTopY + availableTableBodyH + 10;
    if (hasNotice) {
      drawText(
        innerLeft,
        footerY,
        'Notice: Color genetics, Rufus intensity & genotype calculation is under development and incomplete (unverified).',
        'F1',
        7.5,
        mutedInkRgb
      );
      footerY += 12;
    }

    if (showFooterOnThisPage) {
      drawLine(innerLeft, footerY, innerLeft + innerWidth, footerY, cellBorderRgb, 0.6);
      footerY += 11;
      if (breederContactLine) {
        drawText(innerLeft, footerY, breederContactLine, 'F2', 8, primaryRgb);
        footerY += 11;
      }
      drawText(
        innerLeft,
        footerY,
        'I hereby certify that this pedigree is correct to the best of my knowledge and belief.',
        'F1',
        8,
        inkRgb
      );
      const sigText = 'Breeder Signature: ________________________   Date: ____________';
      const sigW = estimateTextWidthPt(sigText, 8, false);
      drawText(Math.max(innerLeft + 260, innerLeft + innerWidth - sigW), footerY, sigText, 'F1', 8, inkRgb);
    }

    return encodeAsciiBytes(ops.join('\n'));
  };

  // --- Assemble PDF 1.4 Objects & Exact Byte-Offset XRef ---
  // Reserve 1: Catalog, 2: Pages, 3: Page 1, 4: F1, 5: F2, 6: F3, 7: Contents 1, 8+: XObjects, then extra Page+Contents pairs
  const pageContentStreams = pageSlices.map((slice) => renderPageStream(slice));
  const xObjectEntries: string[] = [];
  let nextObjId = 8;
  const imageObjects: Array<{ id: number; bytes: Uint8Array }> = [];

  const pushJpegXObject = (name: string, img: PdfRasterImage) => {
    const id = nextObjId++;
    xObjectEntries.push(`/${name} ${id} 0 R`);
    const header = encodeAsciiBytes(
      `<< /Type /XObject /Subtype /Image /Width ${Math.round(img.width)} /Height ${Math.round(img.height)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.byteLength} >>\nstream\n`
    );
    const footer = encodeAsciiBytes(`\nendstream`);
    imageObjects.push({ id, bytes: concatUint8Arrays([header, img.bytes, footer]) });
  };

  if (hasLogo && breederLogoJpeg) {
    pushJpegXObject('ImLogo', breederLogoJpeg);
  }
  if (hasPhoto && subjectPhotoJpeg) {
    pushJpegXObject('ImPhoto', subjectPhotoJpeg);
  }

  const xObjDict = xObjectEntries.length > 0 ? ` /XObject << ${xObjectEntries.join(' ')} >>` : '';
  const extraPageObjects: Array<{ id: number; bytes: Uint8Array }> = [];
  const kidPageIds: number[] = [3];

  for (let pIdx = 1; pIdx < pageSlices.length; pIdx++) {
    const pageObjId = nextObjId++;
    const contentObjId = nextObjId++;
    kidPageIds.push(pageObjId);

    const streamBytes = pageContentStreams[pIdx];
    extraPageObjects.push({
      id: pageObjId,
      bytes: encodeAsciiBytes(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >>${xObjDict} >> /Contents ${contentObjId} 0 R >>`
      ),
    });
    extraPageObjects.push({
      id: contentObjId,
      bytes: concatUint8Arrays([
        encodeAsciiBytes(`<< /Length ${streamBytes.byteLength} >>\nstream\n`),
        streamBytes,
        encodeAsciiBytes('\nendstream'),
      ]),
    });
  }

  const firstPageBytes = pageContentStreams[0];
  const objects: Array<{ id: number; bytes: Uint8Array }> = [
    {
      id: 1,
      bytes: encodeAsciiBytes('<< /Type /Catalog /Pages 2 0 R >>'),
    },
    {
      id: 2,
      bytes: encodeAsciiBytes(
        `<< /Type /Pages /Kids [${kidPageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${kidPageIds.length} >>`
      ),
    },
    {
      id: 3,
      bytes: encodeAsciiBytes(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >>${xObjDict} >> /Contents 7 0 R >>`
      ),
    },
    {
      id: 4,
      bytes: encodeAsciiBytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
    },
    {
      id: 5,
      bytes: encodeAsciiBytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
    },
    {
      id: 6,
      bytes: encodeAsciiBytes('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'),
    },
    {
      id: 7,
      bytes: concatUint8Arrays([
        encodeAsciiBytes(`<< /Length ${firstPageBytes.byteLength} >>\nstream\n`),
        firstPageBytes,
        encodeAsciiBytes('\nendstream'),
      ]),
    },
    ...imageObjects,
    ...extraPageObjects,
  ];

  const pdfChunks: Uint8Array[] = [encodeAsciiBytes('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  let byteOffset = pdfChunks[0].byteLength;
  const xrefOffsets: number[] = [0];

  for (const obj of objects) {
    xrefOffsets.push(byteOffset);
    const objHead = encodeAsciiBytes(`${obj.id} 0 obj\n`);
    const objTail = encodeAsciiBytes('\nendobj\n');
    pdfChunks.push(objHead, obj.bytes, objTail);
    byteOffset += objHead.byteLength + obj.bytes.byteLength + objTail.byteLength;
  }

  const xrefStartOffset = byteOffset;
  const xrefLines: string[] = [
    `xref\n0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
  ];
  for (let i = 1; i <= objects.length; i++) {
    xrefLines.push(`${String(xrefOffsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  xrefLines.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStartOffset}\n%%EOF\n`
  );
  pdfChunks.push(encodeAsciiBytes(xrefLines.join('')));

  return concatUint8Arrays(pdfChunks);
}
```

## `src/core/pedigreeAnalysis.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Pedigree Linebred Convergence & ARBA Registration Readiness Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) dependencies so the exact
 * same convergence spotlight and ARBA registration checks run offline on Web PWA and native mobile.
 */

import { Animal } from './models';
import { PedigreeSlot } from './pedigreeCalculator';

export type RegistrationDeficiencyCode =
  | 'missing_tattoo'
  | 'missing_breed'
  | 'missing_variety'
  | 'missing_weight'
  | 'missing_dob'
  | 'unknown_sex'
  | 'incomplete_3gen_lineage'
  | 'breed_mismatch'
  | 'missing_ancestor_slot';

export interface RegistrationDeficiency {
  code: RegistrationDeficiencyCode;
  label: string;
  shortLabel: string;
}

export interface PedigreeNodeRegistrationStatus {
  slotKey: string;
  generation: number;
  isApplicable: boolean;
  isBlocking: boolean;
  deficiencies: RegistrationDeficiency[];
  summaryText: string;
}

export interface PedigreeTreeAnalysis {
  isArbaSpecies: boolean;
  convergentAnimalIds: Set<string>;
  convergentSlotKeys: Set<string>;
  hasConvergentAncestors: boolean;
  registrationBySlotKey: Map<string, PedigreeNodeRegistrationStatus>;
  blockingNodeCount: number;
  blockingAnimalNodeCount: number;
  missingAncestorSlotCount: number;
  subjectRegistration: PedigreeNodeRegistrationStatus | null;
  subjectKnown3Gen: number;
}

/**
 * Returns `true` when the active species falls under ARBA (American Rabbit Breeders Association)
 * pedigree registration standards (Rabbits and Cavies / Guinea Pigs).
 */
export function isArbaRegistrationSpecies(speciesName?: string): boolean {
  const clean = (speciesName || '').trim().toLowerCase();
  return (
    clean === 'rabbit' ||
    clean === 'rabbits' ||
    clean === 'guinea pig' ||
    clean === 'guinea pigs' ||
    clean === 'cavy' ||
    clean === 'cavies'
  );
}

/**
 * Evaluates objective ARBA registration field readiness for a single animal node within a
 * 3-generation pedigree (without inventing breed-specific weight cutoffs or unverified SOP rules).
 */
export function evaluateAnimalArbaRegistration(
  animal: Animal,
  options: {
    isSubject: boolean;
    subjectBreed?: string;
    knownAncestorsIn3Gen?: number;
    speciesName?: string;
  }
): Omit<PedigreeNodeRegistrationStatus, 'slotKey' | 'generation'> {
  const effectiveSpecies = options.speciesName || animal.species;
  if (!isArbaRegistrationSpecies(effectiveSpecies)) {
    return {
      isApplicable: false,
      isBlocking: false,
      deficiencies: [],
      summaryText: '',
    };
  }

  const isRabbit = (effectiveSpecies || '').trim().toLowerCase().startsWith('rabbit');
  const deficiencies: RegistrationDeficiency[] = [];

  if (!(animal.tattoo || '').trim()) {
    deficiencies.push({
      code: 'missing_tattoo',
      label: isRabbit ? 'Missing ear tattoo' : 'Missing ear tag / ID',
      shortLabel: isRabbit ? 'Tattoo' : 'Ear ID',
    });
  }

  if (!(animal.breed || '').trim()) {
    deficiencies.push({
      code: 'missing_breed',
      label: 'Missing breed',
      shortLabel: 'Breed',
    });
  }

  if (!(animal.variety || '').trim()) {
    deficiencies.push({
      code: 'missing_variety',
      label: 'Missing variety / color',
      shortLabel: 'Variety',
    });
  }

  if (!Number.isFinite(animal.weightGrams) || animal.weightGrams <= 0) {
    deficiencies.push({
      code: 'missing_weight',
      label: 'Missing weight',
      shortLabel: 'Weight',
    });
  }

  if (options.isSubject) {
    if (!(animal.birthDateIso || '').trim()) {
      deficiencies.push({
        code: 'missing_dob',
        label: 'Missing date of birth',
        shortLabel: 'DOB',
      });
    }
    if (animal.sex === 'Unknown') {
      deficiencies.push({
        code: 'unknown_sex',
        label: 'Unknown sex',
        shortLabel: 'Sex',
      });
    }
    if (
      typeof options.knownAncestorsIn3Gen === 'number' &&
      options.knownAncestorsIn3Gen < 14
    ) {
      const known = Math.max(0, Math.min(14, Math.round(options.knownAncestorsIn3Gen)));
      deficiencies.push({
        code: 'incomplete_3gen_lineage',
        label: `Incomplete 3-gen lineage (${known}/14 ancestors)`,
        shortLabel: `3-Gen ${known}/14`,
      });
    }
  } else if (options.subjectBreed && animal.breed) {
    const subjNorm = options.subjectBreed.trim().toLowerCase();
    const ancNorm = animal.breed.trim().toLowerCase();
    if (subjNorm && ancNorm && subjNorm !== ancNorm) {
      deficiencies.push({
        code: 'breed_mismatch',
        label: `Breed mismatch (${animal.breed.trim()} vs ${options.subjectBreed.trim()})`,
        shortLabel: 'Breed Mismatch',
      });
    }
  }

  const summaryText =
    deficiencies.length > 0
      ? `ARBA registration blocked: ${deficiencies.map((d) => d.label).join(', ')}`
      : '';

  return {
    isApplicable: true,
    isBlocking: deficiencies.length > 0,
    deficiencies,
    summaryText,
  };
}

/**
 * Analyzes an entire pedigree slot array for:
 * 1. Linebred convergence (ancestors appearing > 1x in generations >= 1) so unique ancestors can be dimmed.
 * 2. ARBA 3-generation registration readiness flags (Generations 0..3 only; Gen 4–6 excluded).
 */
export function analyzePedigreeTree(
  subject: Animal,
  slots: PedigreeSlot[],
  speciesName?: string
): PedigreeTreeAnalysis {
  const effectiveSpecies = speciesName || subject.species;
  const isArbaSpecies = isArbaRegistrationSpecies(effectiveSpecies);

  const convergentAnimalIds = new Set<string>();
  const convergentSlotKeys = new Set<string>();

  let subjectKnown3Gen = 0;

  for (const slot of slots) {
    const key = `${slot.generation}:${slot.slotIndex}`;
    if (slot.generation >= 1 && slot.generation <= 3 && slot.animal) {
      subjectKnown3Gen += 1;
    }
    if (slot.generation >= 1 && slot.animal && slot.occurrenceCount > 1) {
      convergentAnimalIds.add(slot.animal.id);
      convergentSlotKeys.add(key);
    }
  }

  const registrationBySlotKey = new Map<string, PedigreeNodeRegistrationStatus>();
  let blockingNodeCount = 0;
  let blockingAnimalNodeCount = 0;
  let missingAncestorSlotCount = 0;
  let subjectRegistration: PedigreeNodeRegistrationStatus | null = null;

  for (const slot of slots) {
    const slotKey = `${slot.generation}:${slot.slotIndex}`;

    if (!isArbaSpecies || slot.generation > 3) {
      registrationBySlotKey.set(slotKey, {
        slotKey,
        generation: slot.generation,
        isApplicable: false,
        isBlocking: false,
        deficiencies: [],
        summaryText: '',
      });
      continue;
    }

    if (slot.animal) {
      const evaluated = evaluateAnimalArbaRegistration(slot.animal, {
        isSubject: slot.generation === 0,
        subjectBreed: subject.breed,
        knownAncestorsIn3Gen: slot.generation === 0 ? subjectKnown3Gen : undefined,
        speciesName: effectiveSpecies,
      });
      const status: PedigreeNodeRegistrationStatus = {
        slotKey,
        generation: slot.generation,
        ...evaluated,
      };
      registrationBySlotKey.set(slotKey, status);
      if (slot.generation === 0) {
        subjectRegistration = status;
      }
      if (status.isBlocking) {
        blockingNodeCount += 1;
        blockingAnimalNodeCount += 1;
      }
    } else {
      const deficiency: RegistrationDeficiency = {
        code: 'missing_ancestor_slot',
        label: `Missing ${slot.roleLabel} (blocks 3-gen ARBA pedigree)`,
        shortLabel: 'Missing Ancestor',
      };
      const status: PedigreeNodeRegistrationStatus = {
        slotKey,
        generation: slot.generation,
        isApplicable: true,
        isBlocking: true,
        deficiencies: [deficiency],
        summaryText: deficiency.label,
      };
      registrationBySlotKey.set(slotKey, status);
      blockingNodeCount += 1;
      missingAncestorSlotCount += 1;
    }
  }

  return {
    isArbaSpecies,
    convergentAnimalIds,
    convergentSlotKeys,
    hasConvergentAncestors: convergentAnimalIds.size > 0,
    registrationBySlotKey,
    blockingNodeCount,
    blockingAnimalNodeCount,
    missingAncestorSlotCount,
    subjectRegistration,
    subjectKnown3Gen,
  };
}
```

## `src/core/pedigreeAnalytics.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Founder Loss, Ancestor Genetic Contribution & Heritability Analytics Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) or framework dependencies.
 * Implements:
 * 1. Exact path-summed founder & ancestor genetic contributions (0.5^depth), Sire/Dam line splits,
 *    Lacy (1989) Effective Number of Founders (fe = 1 / sum(p_i^2)), and unknown-origin accounting.
 * 2. Herd-wide Founder Loss & Bottleneck ledger comparing historical founders vs active stock.
 * 3. Mid-Parent–Offspring (and single-parent fallback) OLS regression heritability (h²) estimates
 *    and chronological birth-year cohort genetic diversity & trait trends.
 */

import {
  Animal,
  BreedingRecord,
  CareLog,
  isAnimalArchived,
  isSameSpecies,
} from './models';
import {
  buildSpeciesHerdMap,
  calculateAnimalCoi,
  calculatePairingCoi,
  getPedigreeCompletenessSummary,
} from './pedigreeCalculator';

export interface AncestorGeneticContributionEntry {
  animal: Animal;
  isFounder: boolean;
  contributionPercent: number; // 0..100 (sum of 0.5^depth across paths)
  sireLinePercent: number;
  damLinePercent: number;
  appearances: number;
  minDepth: number;
  maxDepth: number;
}

export interface AnimalFounderAnalysis {
  subjectId: string;
  subjectName: string;
  maxDepthAnalyzed: number;
  founders: AncestorGeneticContributionEntry[];
  topAncestors: AncestorGeneticContributionEntry[];
  knownFounderCount: number;
  knownLineagePercent: number;
  unknownOriginPercent: number;
  effectiveFoundersFe: number;
  founderBalanceRatio: number; // fe / knownFounderCount (0..1)
  dominantFounderSharePercent: number; // highest normalized share among known founders
}

export interface PairingFounderShiftAnalysis {
  sireAnalysis: AnimalFounderAnalysis;
  damAnalysis: AnimalFounderAnalysis;
  projectedOffspring: AnimalFounderAnalysis;
  sharedFounderIds: string[];
  uniqueSireFounderIds: string[];
  uniqueDamFounderIds: string[];
  projectedCoiPercent: number;
  feGainVsMeanParent: number;
}

export type FounderStatusCode = 'Active Core' | 'Endangered' | 'Lost';

export interface SpeciesFounderLedgerEntry {
  founder: Animal;
  status: FounderStatusCode;
  activeDescendantsCount: number;
  meanActiveContributionPercent: number;
  maxActiveContributionPercent: number;
  historicalDescendantsCount: number;
  isActiveAnimalItself: boolean;
}

export interface SpeciesFounderLossReport {
  speciesName: string;
  totalAnimalsCount: number;
  activeAnimalsCount: number;
  totalFoundersCount: number;
  activeFoundersCount: number;
  lostFoundersCount: number;
  endangeredFoundersCount: number;
  founderLossPercent: number;
  pooledEffectiveFoundersFe: number;
  meanAnimalEffectiveFoundersFe: number;
  meanActiveKnownLineagePercent: number;
  topBottleneckFounder: SpeciesFounderLedgerEntry | null;
  founderLedger: SpeciesFounderLedgerEntry[];
}

export type HeritabilityMethod = 'mid_parent' | 'single_parent' | 'insufficient';

export interface HeritabilityTraitEstimate {
  traitKey: 'weight_grams' | 'adg_grams_per_day' | 'litter_live_born';
  label: string;
  unitLabel: string;
  method: HeritabilityMethod;
  heritabilityH2: number | null; // Clamped [0, 1] for quantitative interpretation
  rawSlope: number | null;
  rSquared: number | null;
  pairCount: number;
  meanOffspringValue: number | null;
  meanParentValue: number | null;
  confidenceNote: string;
}

export interface CohortGeneticTrendPoint {
  year: number;
  animalCount: number;
  meanCoiPercent: number;
  meanEffectiveFoundersFe: number;
  meanKnownLineagePercent: number;
  meanWeightGrams: number | null;
  meanAdgGramsPerDay: number | null;
  cumulativeWeightH2: number | null;
  weightPairCount: number;
}

export interface SpeciesHeritabilityReport {
  speciesName: string;
  traits: HeritabilityTraitEstimate[];
  cohorts: CohortGeneticTrendPoint[];
  totalEvaluatedAnimals: number;
}

function isFounderInHerd(animal: Animal, herdById: Map<string, Animal>): boolean {
  const hasSire = Boolean(animal.sireId && animal.sireId !== animal.id && herdById.has(animal.sireId));
  const hasDam = Boolean(animal.damId && animal.damId !== animal.id && herdById.has(animal.damId));
  return !hasSire && !hasDam;
}

function isBreedingActiveAnimal(animal: Animal): boolean {
  return (
    !isAnimalArchived(animal) &&
    animal.status !== 'Sold' &&
    animal.status !== 'Deceased' &&
    !animal.culled
  );
}

interface InternalContributionAccum {
  animal: Animal;
  isFounder: boolean;
  totalFraction: number;
  sireFraction: number;
  damFraction: number;
  appearances: number;
  minDepth: number;
  maxDepth: number;
}

function accumulateLineageContributions(
  startAnimalId: string | undefined,
  initialWeight: number,
  side: 'sire' | 'dam',
  startDepth: number,
  maxDepth: number,
  herdById: Map<string, Animal>,
  visitedPath: Set<string>,
  accumMap: Map<string, InternalContributionAccum>,
  unknownAcc: { fraction: number }
): void {
  if (!startAnimalId || !herdById.has(startAnimalId) || visitedPath.has(startAnimalId)) {
    unknownAcc.fraction += initialWeight;
    return;
  }

  const walk = (nodeId: string, weight: number, depth: number) => {
    const node = herdById.get(nodeId);
    if (!node || visitedPath.has(nodeId)) {
      unknownAcc.fraction += weight;
      return;
    }

    const sireRaw = Boolean(node.sireId && node.sireId !== nodeId && herdById.has(node.sireId));
    const damRaw = Boolean(node.damId && node.damId !== nodeId && herdById.has(node.damId));
    const sireValid = sireRaw && !visitedPath.has(node.sireId);
    const damValid = damRaw && !visitedPath.has(node.damId);
    const isTerminalFounder = !sireRaw && !damRaw;

    let entry = accumMap.get(nodeId);
    if (!entry) {
      entry = {
        animal: node,
        isFounder: isTerminalFounder,
        totalFraction: 0,
        sireFraction: 0,
        damFraction: 0,
        appearances: 0,
        minDepth: depth,
        maxDepth: depth,
      };
      accumMap.set(nodeId, entry);
    } else {
      entry.minDepth = Math.min(entry.minDepth, depth);
      entry.maxDepth = Math.max(entry.maxDepth, depth);
      if (!isTerminalFounder) entry.isFounder = false;
    }

    entry.totalFraction += weight;
    if (side === 'sire') {
      entry.sireFraction += weight;
    } else {
      entry.damFraction += weight;
    }
    entry.appearances += 1;

    if (isTerminalFounder) {
      return;
    }

    if (depth >= maxDepth) {
      // Depth cutoff reached while ancestors continue; mark remaining branch as founder-boundary proxy
      entry.isFounder = true;
      return;
    }

    visitedPath.add(nodeId);
    const half = weight * 0.5;
    if (sireValid && node.sireId) {
      walk(node.sireId, half, depth + 1);
    } else {
      unknownAcc.fraction += half;
    }

    if (damValid && node.damId) {
      walk(node.damId, half, depth + 1);
    } else {
      unknownAcc.fraction += half;
    }
    visitedPath.delete(nodeId);
  };

  walk(startAnimalId, initialWeight, startDepth);
}

function finalizeFounderAnalysis(
  subjectId: string,
  subjectName: string,
  maxDepthAnalyzed: number,
  accumMap: Map<string, InternalContributionAccum>,
  unknownFraction: number
): AnimalFounderAnalysis {
  const allEntries: AncestorGeneticContributionEntry[] = Array.from(accumMap.values()).map(
    (item) => ({
      animal: item.animal,
      isFounder: item.isFounder,
      contributionPercent: item.totalFraction * 100,
      sireLinePercent: item.sireFraction * 100,
      damLinePercent: item.damFraction * 100,
      appearances: item.appearances,
      minDepth: item.minDepth,
      maxDepth: item.maxDepth,
    })
  );

  const founders = allEntries
    .filter((e) => e.isFounder)
    .sort((a, b) => b.contributionPercent - a.contributionPercent || a.minDepth - b.minDepth);

  const topAncestors = [...allEntries].sort(
    (a, b) => b.contributionPercent - a.contributionPercent || a.minDepth - b.minDepth
  );

  const rawKnownPct = founders.reduce((sum, f) => sum + f.contributionPercent, 0);
  const knownLineagePercent = Math.min(100, Math.max(0, rawKnownPct));
  const unknownOriginPercent = Math.min(100, Math.max(0, 100 - knownLineagePercent));

  let effectiveFoundersFe = 0;
  let dominantFounderSharePercent = 0;
  if (rawKnownPct > 0.0001 && founders.length > 0) {
    let sumSquares = 0;
    for (const f of founders) {
      const p = f.contributionPercent / rawKnownPct;
      sumSquares += p * p;
      const sharePct = p * 100;
      if (sharePct > dominantFounderSharePercent) {
        dominantFounderSharePercent = sharePct;
      }
    }
    effectiveFoundersFe = sumSquares > 0 ? 1 / sumSquares : 0;
  }

  // Note: When unknownFraction accounts for missing records vs founder nodes, keep balance in [0, 1].
  void unknownFraction;
  const founderBalanceRatio =
    founders.length > 0 ? Math.min(1, effectiveFoundersFe / founders.length) : 0;

  return {
    subjectId,
    subjectName,
    maxDepthAnalyzed,
    founders,
    topAncestors,
    knownFounderCount: founders.length,
    knownLineagePercent,
    unknownOriginPercent,
    effectiveFoundersFe,
    founderBalanceRatio,
    dominantFounderSharePercent,
  };
}

/**
 * Computes exact path-summed founder & ancestor genetic contributions for an individual `Animal`.
 */
export function analyzeAnimalFounderContributions(
  subject: Animal,
  herdById: Map<string, Animal>,
  options?: { maxDepth?: number }
): AnimalFounderAnalysis {
  const maxDepth = Math.min(12, Math.max(3, Math.round(options?.maxDepth ?? 10)));
  const accumMap = new Map<string, InternalContributionAccum>();
  const unknownAcc = { fraction: 0 };
  const visited = new Set<string>([subject.id]);

  accumulateLineageContributions(
    subject.sireId,
    0.5,
    'sire',
    1,
    maxDepth,
    herdById,
    visited,
    accumMap,
    unknownAcc
  );
  accumulateLineageContributions(
    subject.damId,
    0.5,
    'dam',
    1,
    maxDepth,
    herdById,
    visited,
    accumMap,
    unknownAcc
  );

  return finalizeFounderAnalysis(subject.id, subject.name, maxDepth, accumMap, unknownAcc.fraction);
}

/**
 * Projects founder contributions, effective founders (fe), and unique/shared founder overlap
 * for a hypothetical Sire × Dam pairing.
 */
export function analyzePairingFounderShift(
  sire: Animal,
  dam: Animal,
  herdById: Map<string, Animal>,
  options?: { maxDepth?: number }
): PairingFounderShiftAnalysis {
  const maxDepth = Math.min(12, Math.max(3, Math.round(options?.maxDepth ?? 10)));
  const sireAnalysis = analyzeAnimalFounderContributions(sire, herdById, { maxDepth });
  const damAnalysis = analyzeAnimalFounderContributions(dam, herdById, { maxDepth });

  const accumMap = new Map<string, InternalContributionAccum>();
  const unknownAcc = { fraction: 0 };
  const visited = new Set<string>();

  accumulateLineageContributions(
    sire.id,
    0.5,
    'sire',
    1,
    maxDepth,
    herdById,
    visited,
    accumMap,
    unknownAcc
  );
  accumulateLineageContributions(
    dam.id,
    0.5,
    'dam',
    1,
    maxDepth,
    herdById,
    visited,
    accumMap,
    unknownAcc
  );

  const projectedOffspring = finalizeFounderAnalysis(
    `pairing:${sire.id}x${dam.id}`,
    `${sire.name} × ${dam.name}`,
    maxDepth,
    accumMap,
    unknownAcc.fraction
  );

  const sireFounderIds = new Set(sireAnalysis.founders.map((f) => f.animal.id));
  const damFounderIds = new Set(damAnalysis.founders.map((f) => f.animal.id));
  const sharedFounderIds: string[] = [];
  const uniqueSireFounderIds: string[] = [];
  const uniqueDamFounderIds: string[] = [];

  for (const id of sireFounderIds) {
    if (damFounderIds.has(id)) {
      sharedFounderIds.push(id);
    } else {
      uniqueSireFounderIds.push(id);
    }
  }
  for (const id of damFounderIds) {
    if (!sireFounderIds.has(id)) {
      uniqueDamFounderIds.push(id);
    }
  }

  const coi = calculatePairingCoi(sire.id, dam.id, herdById);
  const parentFeSamples = [sireAnalysis.effectiveFoundersFe, damAnalysis.effectiveFoundersFe].filter(
    (v) => v > 0
  );
  const meanParentFe =
    parentFeSamples.length > 0
      ? parentFeSamples.reduce((a, b) => a + b, 0) / parentFeSamples.length
      : 0;

  return {
    sireAnalysis,
    damAnalysis,
    projectedOffspring,
    sharedFounderIds,
    uniqueSireFounderIds,
    uniqueDamFounderIds,
    projectedCoiPercent: coi.coiPercent,
    feGainVsMeanParent: projectedOffspring.effectiveFoundersFe - meanParentFe,
  };
}

/**
 * Evaluates herd-wide Founder Loss, Active Gene-Pool Retention, and Dominant Founder Bottlenecks
 * strictly scoped to a single species.
 */
export function analyzeSpeciesFounderLoss(
  animals: Animal[],
  speciesName: string,
  options?: { maxDepth?: number }
): SpeciesFounderLossReport {
  const herdById = buildSpeciesHerdMap(animals, speciesName);
  const speciesAnimals = Array.from(herdById.values());
  const activeAnimals = speciesAnimals.filter(isBreedingActiveAnimal);
  const maxDepth = Math.min(12, Math.max(3, Math.round(options?.maxDepth ?? 10)));

  // Identify all founders in the species (animals with no known parents in herdById)
  const founderIds = new Set<string>();
  for (const animal of speciesAnimals) {
    if (isFounderInHerd(animal, herdById)) {
      founderIds.add(animal.id);
    }
  }

  const activeDescendantSetByFounder = new Map<string, Set<string>>();
  const historicalDescendantSetByFounder = new Map<string, Set<string>>();
  const activeContributionSumByFounder = new Map<string, number>();
  const activeContributionMaxByFounder = new Map<string, number>();

  for (const fId of founderIds) {
    activeDescendantSetByFounder.set(fId, new Set());
    historicalDescendantSetByFounder.set(fId, new Set());
    activeContributionSumByFounder.set(fId, 0);
    activeContributionMaxByFounder.set(fId, 0);
  }

  // Evaluate historical descendants
  for (const animal of speciesAnimals) {
    const analysis = analyzeAnimalFounderContributions(animal, herdById, { maxDepth });
    for (const f of analysis.founders) {
      if (!founderIds.has(f.animal.id)) {
        founderIds.add(f.animal.id);
        activeDescendantSetByFounder.set(f.animal.id, new Set());
        historicalDescendantSetByFounder.set(f.animal.id, new Set());
        activeContributionSumByFounder.set(f.animal.id, 0);
        activeContributionMaxByFounder.set(f.animal.id, 0);
      }
      historicalDescendantSetByFounder.get(f.animal.id)!.add(animal.id);
    }
  }

  // Evaluate active breeding stock representation
  let activeFeSum = 0;
  let activeFeCount = 0;
  let activeKnownLineageSum = 0;

  for (const active of activeAnimals) {
    if (founderIds.has(active.id)) {
      // An active founder carries 100% of its own founding genome in the active pool
      activeDescendantSetByFounder.get(active.id)!.add(active.id);
      activeContributionSumByFounder.set(
        active.id,
        (activeContributionSumByFounder.get(active.id) ?? 0) + 100
      );
      activeContributionMaxByFounder.set(
        active.id,
        Math.max(activeContributionMaxByFounder.get(active.id) ?? 0, 100)
      );
      activeKnownLineageSum += 100;
      activeFeSum += 1;
      activeFeCount += 1;
      continue;
    }

    const analysis = analyzeAnimalFounderContributions(active, herdById, { maxDepth });
    activeKnownLineageSum += analysis.knownLineagePercent;
    if (analysis.effectiveFoundersFe > 0) {
      activeFeSum += analysis.effectiveFoundersFe;
      activeFeCount += 1;
    }

    for (const f of analysis.founders) {
      activeDescendantSetByFounder.get(f.animal.id)?.add(active.id);
      activeContributionSumByFounder.set(
        f.animal.id,
        (activeContributionSumByFounder.get(f.animal.id) ?? 0) + f.contributionPercent
      );
      activeContributionMaxByFounder.set(
        f.animal.id,
        Math.max(activeContributionMaxByFounder.get(f.animal.id) ?? 0, f.contributionPercent)
      );
    }
  }

  const activeDenom = Math.max(1, activeAnimals.length);
  const ledger: SpeciesFounderLedgerEntry[] = [];
  let activeFoundersCount = 0;
  let lostFoundersCount = 0;
  let endangeredFoundersCount = 0;
  let totalMeanContribAcrossFounders = 0;

  for (const fId of founderIds) {
    const founder = herdById.get(fId);
    if (!founder) continue;
    const activeDescCount = activeDescendantSetByFounder.get(fId)?.size ?? 0;
    const histDescCount = historicalDescendantSetByFounder.get(fId)?.size ?? 0;
    const isSelfActive = isBreedingActiveAnimal(founder);
    const meanActivePct = (activeContributionSumByFounder.get(fId) ?? 0) / activeDenom;
    const maxActivePct = activeContributionMaxByFounder.get(fId) ?? 0;

    let status: FounderStatusCode;
    if (activeDescCount === 0 && !isSelfActive) {
      status = 'Lost';
      lostFoundersCount += 1;
    } else if (activeDescCount <= 1 || meanActivePct < 2.0) {
      status = 'Endangered';
      activeFoundersCount += 1;
      endangeredFoundersCount += 1;
    } else {
      status = 'Active Core';
      activeFoundersCount += 1;
    }

    totalMeanContribAcrossFounders += meanActivePct;

    ledger.push({
      founder,
      status,
      activeDescendantsCount: activeDescCount,
      meanActiveContributionPercent: meanActivePct,
      maxActiveContributionPercent: maxActivePct,
      historicalDescendantsCount: histDescCount,
      isActiveAnimalItself: isSelfActive,
    });
  }

  ledger.sort(
    (a, b) =>
      b.meanActiveContributionPercent - a.meanActiveContributionPercent ||
      b.historicalDescendantsCount - a.historicalDescendantsCount ||
      a.founder.name.localeCompare(b.founder.name)
  );

  let pooledEffectiveFoundersFe = 0;
  if (totalMeanContribAcrossFounders > 0.0001) {
    let sumSq = 0;
    for (const row of ledger) {
      if (row.meanActiveContributionPercent <= 0) continue;
      const p = row.meanActiveContributionPercent / totalMeanContribAcrossFounders;
      sumSq += p * p;
    }
    pooledEffectiveFoundersFe = sumSq > 0 ? 1 / sumSq : 0;
  }

  const totalFoundersCount = ledger.length;
  const founderLossPercent =
    totalFoundersCount > 0 ? (lostFoundersCount / totalFoundersCount) * 100 : 0;

  return {
    speciesName,
    totalAnimalsCount: speciesAnimals.length,
    activeAnimalsCount: activeAnimals.length,
    totalFoundersCount,
    activeFoundersCount,
    lostFoundersCount,
    endangeredFoundersCount,
    founderLossPercent,
    pooledEffectiveFoundersFe,
    meanAnimalEffectiveFoundersFe: activeFeCount > 0 ? activeFeSum / activeFeCount : 0,
    meanActiveKnownLineagePercent:
      activeAnimals.length > 0 ? activeKnownLineageSum / activeAnimals.length : 0,
    topBottleneckFounder:
      ledger.find((entry) => entry.meanActiveContributionPercent > 0) ?? null,
    founderLedger: ledger,
  };
}

function parseIsoUtcMs(iso: string | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return null;
  const [y, m, d] = iso.trim().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt.getTime();
}

function computeLinearRegression(
  xs: number[],
  ys: number[]
): { slope: number; rSquared: number | null } | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  if (varX <= 1e-9) return null;
  const slope = cov / varX;
  const rSquared = varY > 1e-9 ? Math.min(1, Math.max(0, (cov * cov) / (varX * varY))) : null;
  return { slope, rSquared };
}

function resolveAnimalLatestWeightGrams(
  animal: Animal,
  careLogsByAnimalId: Map<string, CareLog[]>
): number | null {
  const logs = careLogsByAnimalId.get(animal.id) ?? [];
  for (let i = logs.length - 1; i >= 0; i--) {
    if (Number.isFinite(logs[i].weightGrams) && logs[i].weightGrams > 0) {
      return logs[i].weightGrams;
    }
  }
  if (Number.isFinite(animal.weightGrams) && animal.weightGrams > 0) {
    return animal.weightGrams;
  }
  return null;
}

function resolveAnimalAdgGramsPerDay(
  animal: Animal,
  careLogsByAnimalId: Map<string, CareLog[]>
): number | null {
  const logs = (careLogsByAnimalId.get(animal.id) ?? [])
    .filter((l) => Number.isFinite(l.weightGrams) && l.weightGrams > 0 && parseIsoUtcMs(l.dateIso) !== null)
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso));

  if (logs.length >= 2) {
    const first = logs[0];
    const last = logs[logs.length - 1];
    const t0 = parseIsoUtcMs(first.dateIso)!;
    const t1 = parseIsoUtcMs(last.dateIso)!;
    const days = Math.round((t1 - t0) / 86_400_000);
    if (days >= 7) {
      return (last.weightGrams - first.weightGrams) / days;
    }
  }

  const birthMs = parseIsoUtcMs(animal.birthDateIso);
  if (birthMs !== null && logs.length >= 1) {
    const last = logs[logs.length - 1];
    const t1 = parseIsoUtcMs(last.dateIso)!;
    const ageDays = Math.round((t1 - birthMs) / 86_400_000);
    if (ageDays >= 14) {
      return last.weightGrams / ageDays;
    }
  }

  return null;
}

function estimateTraitHeritability(params: {
  traitKey: HeritabilityTraitEstimate['traitKey'];
  label: string;
  unitLabel: string;
  animals: Animal[];
  herdById: Map<string, Animal>;
  getTraitValue: (animal: Animal) => number | null;
}): HeritabilityTraitEstimate {
  const midParentXs: number[] = [];
  const midParentYs: number[] = [];
  const singleParentXs: number[] = [];
  const singleParentYs: number[] = [];

  for (const offspring of params.animals) {
    const y = params.getTraitValue(offspring);
    if (y === null || !Number.isFinite(y)) continue;

    const sire = offspring.sireId ? params.herdById.get(offspring.sireId) : undefined;
    const dam = offspring.damId ? params.herdById.get(offspring.damId) : undefined;
    const sVal = sire ? params.getTraitValue(sire) : null;
    const dVal = dam ? params.getTraitValue(dam) : null;

    if (sVal !== null && dVal !== null) {
      midParentXs.push((sVal + dVal) * 0.5);
      midParentYs.push(y);
    } else if (dVal !== null) {
      singleParentXs.push(dVal);
      singleParentYs.push(y);
    } else if (sVal !== null) {
      singleParentXs.push(sVal);
      singleParentYs.push(y);
    }
  }

  if (midParentXs.length >= 3) {
    const reg = computeLinearRegression(midParentXs, midParentYs);
    if (reg) {
      const h2 = Math.min(1, Math.max(0, reg.slope));
      const meanP = midParentXs.reduce((a, b) => a + b, 0) / midParentXs.length;
      const meanO = midParentYs.reduce((a, b) => a + b, 0) / midParentYs.length;
      return {
        traitKey: params.traitKey,
        label: params.label,
        unitLabel: params.unitLabel,
        method: 'mid_parent',
        heritabilityH2: h2,
        rawSlope: reg.slope,
        rSquared: reg.rSquared,
        pairCount: midParentXs.length,
        meanOffspringValue: meanO,
        meanParentValue: meanP,
        confidenceNote:
          midParentXs.length >= 8
            ? `Observed mid-parent regression (${midParentXs.length} family pairs)`
            : `Provisional mid-parent regression (${midParentXs.length} pairs; 8+ recommended)`,
      };
    }
  }

  if (singleParentXs.length >= 3) {
    const reg = computeLinearRegression(singleParentXs, singleParentYs);
    if (reg) {
      const h2 = Math.min(1, Math.max(0, reg.slope * 2));
      const meanP = singleParentXs.reduce((a, b) => a + b, 0) / singleParentXs.length;
      const meanO = singleParentYs.reduce((a, b) => a + b, 0) / singleParentYs.length;
      return {
        traitKey: params.traitKey,
        label: params.label,
        unitLabel: params.unitLabel,
        method: 'single_parent',
        heritabilityH2: h2,
        rawSlope: reg.slope,
        rSquared: reg.rSquared,
        pairCount: singleParentXs.length,
        meanOffspringValue: meanO,
        meanParentValue: meanP,
        confidenceNote: `Single-parent regression 2b (${singleParentXs.length} pairs; mid-parent preferred)`,
      };
    }
  }

  const totalKnownPairs = Math.max(midParentXs.length, singleParentXs.length);
  return {
    traitKey: params.traitKey,
    label: params.label,
    unitLabel: params.unitLabel,
    method: 'insufficient',
    heritabilityH2: null,
    rawSlope: null,
    rSquared: null,
    pairCount: totalKnownPairs,
    meanOffspringValue: null,
    meanParentValue: null,
    confidenceNote:
      totalKnownPairs === 0
        ? 'No parent-offspring trait pairs recorded yet.'
        : `Need at least 3 parent-offspring pairs (${totalKnownPairs} recorded).`,
  };
}

/**
 * Computes narrow-sense heritability (h²) estimates and chronological birth-year cohort
 * diversity/trait trends for a species using recorded herd weights, CareLogs, and litter outcomes.
 */
export function analyzeSpeciesHeritabilityTrends(params: {
  animals: Animal[];
  breedings: BreedingRecord[];
  careLogs: CareLog[];
  speciesName: string;
}): SpeciesHeritabilityReport {
  const herdById = buildSpeciesHerdMap(params.animals, params.speciesName);
  const speciesAnimals = Array.from(herdById.values());

  const careLogsByAnimalId = new Map<string, CareLog[]>();
  for (const log of params.careLogs) {
    if (!isSameSpecies(log.species, params.speciesName)) continue;
    const list = careLogsByAnimalId.get(log.animalId) ?? [];
    list.push(log);
    careLogsByAnimalId.set(log.animalId, list);
  }
  for (const list of careLogsByAnimalId.values()) {
    list.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  }

  // Build per-dam average live-born litter size map from Born/Weaned breedings
  const damLitterCounts = new Map<string, { sum: number; count: number }>();
  for (const b of params.breedings) {
    if (!isSameSpecies(b.species, params.speciesName)) continue;
    if (b.status !== 'Born' && b.status !== 'Weaned') continue;
    if (!b.damId) continue;
    const prev = damLitterCounts.get(b.damId) ?? { sum: 0, count: 0 };
    prev.sum += Math.max(0, b.liveCount || 0);
    prev.count += 1;
    damLitterCounts.set(b.damId, prev);
  }

  const weightCache = new Map<string, number | null>();
  const getWeight = (a: Animal): number | null => {
    if (weightCache.has(a.id)) return weightCache.get(a.id)!;
    const val = resolveAnimalLatestWeightGrams(a, careLogsByAnimalId);
    weightCache.set(a.id, val);
    return val;
  };

  const adgCache = new Map<string, number | null>();
  const getAdg = (a: Animal): number | null => {
    if (adgCache.has(a.id)) return adgCache.get(a.id)!;
    const val = resolveAnimalAdgGramsPerDay(a, careLogsByAnimalId);
    adgCache.set(a.id, val);
    return val;
  };

  const getLitterSize = (a: Animal): number | null => {
    const rec = damLitterCounts.get(a.id);
    if (!rec || rec.count === 0) return null;
    return rec.sum / rec.count;
  };

  const weightTrait = estimateTraitHeritability({
    traitKey: 'weight_grams',
    label: 'Adult / Recorded Weight',
    unitLabel: 'g',
    animals: speciesAnimals,
    herdById,
    getTraitValue: getWeight,
  });

  const adgTrait = estimateTraitHeritability({
    traitKey: 'adg_grams_per_day',
    label: 'Average Daily Gain (ADG)',
    unitLabel: 'g/day',
    animals: speciesAnimals,
    herdById,
    getTraitValue: getAdg,
  });

  const litterTrait = estimateTraitHeritability({
    traitKey: 'litter_live_born',
    label: 'Litter Size (Live Born)',
    unitLabel: 'offspring',
    animals: speciesAnimals,
    herdById,
    getTraitValue: getLitterSize,
  });

  // Group animals by birth year for chronological diversity & h² trend
  const byYear = new Map<number, Animal[]>();
  for (const a of speciesAnimals) {
    const match = /^(\d{4})-\d{2}-\d{2}$/.exec((a.birthDateIso || '').trim());
    if (!match) continue;
    const year = Number(match[1]);
    if (!Number.isFinite(year) || year < 1950 || year > 2100) continue;
    const arr = byYear.get(year) ?? [];
    arr.push(a);
    byYear.set(year, arr);
  }

  const sortedYears = Array.from(byYear.keys()).sort((a, b) => a - b);
  const cumulativeAnimals: Animal[] = [];
  const cohorts: CohortGeneticTrendPoint[] = [];

  for (const year of sortedYears) {
    const cohortAnimals = byYear.get(year)!;
    cumulativeAnimals.push(...cohortAnimals);

    let coiSum = 0;
    let knownPctSum = 0;
    let feSum = 0;
    let feCount = 0;
    let weightSum = 0;
    let weightCount = 0;
    let adgSum = 0;
    let adgCount = 0;

    for (const a of cohortAnimals) {
      const coi = calculateAnimalCoi(a, herdById);
      const comp = getPedigreeCompletenessSummary(coi);
      const founderInfo = analyzeAnimalFounderContributions(a, herdById, { maxDepth: 8 });
      coiSum += coi.coiPercent;
      knownPctSum += comp.percent3Gen;
      if (founderInfo.effectiveFoundersFe > 0) {
        feSum += founderInfo.effectiveFoundersFe;
        feCount += 1;
      }
      const w = getWeight(a);
      if (w !== null) {
        weightSum += w;
        weightCount += 1;
      }
      const adg = getAdg(a);
      if (adg !== null) {
        adgSum += adg;
        adgCount += 1;
      }
    }

    const cumulativeWeightEst = estimateTraitHeritability({
      traitKey: 'weight_grams',
      label: 'Weight',
      unitLabel: 'g',
      animals: cumulativeAnimals,
      herdById,
      getTraitValue: getWeight,
    });

    cohorts.push({
      year,
      animalCount: cohortAnimals.length,
      meanCoiPercent: coiSum / cohortAnimals.length,
      meanEffectiveFoundersFe: feCount > 0 ? feSum / feCount : 0,
      meanKnownLineagePercent: knownPctSum / cohortAnimals.length,
      meanWeightGrams: weightCount > 0 ? weightSum / weightCount : null,
      meanAdgGramsPerDay: adgCount > 0 ? adgSum / adgCount : null,
      cumulativeWeightH2: cumulativeWeightEst.heritabilityH2,
      weightPairCount: cumulativeWeightEst.pairCount,
    });
  }

  return {
    speciesName: params.speciesName,
    traits: [weightTrait, adgTrait, litterTrait],
    cohorts,
    totalEvaluatedAnimals: speciesAnimals.length,
  };
}
```

## `src/core/pedigreeCalculator.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Recursive Pedigree Tree & Exact Wright's Coefficient of Inbreeding (COI) Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero DOM or platform dependencies.
 *
 * Implements:
 * 1. Exact Wright coancestry/kinship recursion with topological ranking and cycle guards:
 *    - F(X) = kinship(sire(X), dam(X))
 *    - kinship(i, i) = 0.5 * (1 + F(i))
 *    - kinship(i, j) = 0.5 * (kinship(sire(i), j) + kinship(dam(i), j))
 * 2. Wright path-based common ancestor contribution breakdown for breeder transparency.
 * 3. Strict species-boundary enforcement so animals of one species can never pollute
 *    pedigrees or parent candidate lists of another species.
 */

import { Animal, BiologicalSex, isSameSpecies, SpeciesProfile } from './models';

export type CoiRiskCode = 'OUTCROSS' | 'LOW' | 'MODERATE' | 'LINEBRED' | 'HIGH';

export interface CoiRiskDescriptor {
  code: CoiRiskCode;
  label: string;
  guidance: string;
}

export interface AncestorContribution {
  ancestor: Animal;
  coiContributionPercent: number;
  sireAppearances: number;
  damAppearances: number;
}

export interface CoiAnalysis {
  coiFraction: number;
  coiPercent: number;
  risk: CoiRiskDescriptor;
  sharedAncestors: AncestorContribution[];
  knownAncestorsIn3Gen: number;
  knownAncestorsIn4Gen: number;
}

export interface PedigreeSlot {
  generation: number; // 0 = subject, 1 = parents, 2 = grandparents, 3 = great-grandparents, 4 = G4
  slotIndex: number; // 0..(2^generation - 1)
  animal: Animal | null;
  roleLabel: string;
  occurrenceCount: number;
  childAnimalId: string;
  expectedSex: BiologicalSex;
}

/**
 * Classifies a COI percentage into standard breeder risk tiers.
 */
export function describeCoiRisk(percent: number): CoiRiskDescriptor {
  if (percent <= 0.0001) {
    return {
      code: 'OUTCROSS',
      label: 'Outcross',
      guidance: 'Zero shared ancestry detected across recorded generations.',
    };
  }
  if (percent < 6.25) {
    return {
      code: 'LOW',
      label: 'Low Inbreeding',
      guidance: 'High genetic diversity (< 6.25%, lighter than first cousins).',
    };
  }
  if (percent < 12.5) {
    return {
      code: 'MODERATE',
      label: 'Mild Linebreeding',
      guidance: 'Comparable to first-cousin or great-grandparent linebreeding (6.25% – 12.4%).',
    };
  }
  if (percent < 25.0) {
    return {
      code: 'LINEBRED',
      label: 'Close Linebreeding',
      guidance: 'Comparable to half-sibling or grandparent pairing (12.5% – 24.9%). Monitor vigor.',
    };
  }
  return {
    code: 'HIGH',
    label: 'Close Inbreeding',
    guidance: 'Comparable to parent-offspring or full-sibling pairing (>= 25%). High homozygosity.',
  };
}

export interface PedigreeCompletenessSummary {
  known3Gen: number;
  max3Gen: number;
  known4Gen: number;
  max4Gen: number;
  percent3Gen: number;
  isSparsePedigree: boolean;
  isIncompleteZeroOutcross: boolean;
}

/**
 * Summarizes recorded pedigree depth alongside a `CoiAnalysis` so breeders can distinguish
 * a true outcross (complete 3-generation pedigree with 0% overlap) from an incomplete pedigree
 * that simply lacks ancestor records.
 */
export function getPedigreeCompletenessSummary(
  coi: Pick<CoiAnalysis, 'coiPercent' | 'knownAncestorsIn3Gen' | 'knownAncestorsIn4Gen'>
): PedigreeCompletenessSummary {
  const max3Gen = 14;
  const max4Gen = 30;
  const known3Gen = Math.max(0, Math.min(max3Gen, coi.knownAncestorsIn3Gen || 0));
  const known4Gen = Math.max(0, Math.min(max4Gen, coi.knownAncestorsIn4Gen || 0));
  const percent3Gen = Math.round((known3Gen / max3Gen) * 100);
  const isIncompleteZeroOutcross = (coi.coiPercent || 0) <= 0.0001 && known3Gen < max3Gen;
  return {
    known3Gen,
    max3Gen,
    known4Gen,
    max4Gen,
    percent3Gen,
    isSparsePedigree: known3Gen < 6,
    isIncompleteZeroOutcross,
  };
}

/**
 * Builds an ID lookup map strictly scoped to a single livestock species.
 */
export function buildSpeciesHerdMap(
  animals: Animal[],
  speciesName: string
): Map<string, Animal> {
  const map = new Map<string, Animal>();
  for (const animal of animals) {
    if (isSameSpecies(animal.species, speciesName)) {
      map.set(animal.id, animal);
    }
  }
  return map;
}

/**
 * Checks whether assigning `candidateAncestorId` as a parent of `childId` would introduce a cycle.
 */
export function wouldCreateCycle(
  childId: string,
  candidateAncestorId: string,
  herdById: Map<string, Animal>
): boolean {
  if (!childId || !candidateAncestorId) return false;
  if (childId === candidateAncestorId) return true;

  const visited = new Set<string>();
  const stack = [candidateAncestorId];

  while (stack.length > 0) {
    const curr = stack.pop()!;
    if (curr === childId) return true;
    if (visited.has(curr)) continue;
    visited.add(curr);

    const rec = herdById.get(curr);
    if (!rec) continue;
    if (rec.sireId && herdById.has(rec.sireId)) stack.push(rec.sireId);
    if (rec.damId && herdById.has(rec.damId)) stack.push(rec.damId);
  }
  return false;
}

/**
 * Internal memoized tabular coancestry engine with topological depth ordering.
 */
class CoancestryEngine {
  private readonly topoRank = new Map<string, number>();
  private readonly fMemo = new Map<string, number>();
  private readonly phiMemo = new Map<string, number>();

  constructor(private readonly herdById: Map<string, Animal>) {}

  private rankOf(id: string, visiting: Set<string> = new Set()): number {
    const cached = this.topoRank.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // cycle guard

    visiting.add(id);
    const animal = this.herdById.get(id);
    let rank = 0;
    if (animal) {
      const sRank = animal.sireId ? this.rankOf(animal.sireId, visiting) : -1;
      const dRank = animal.damId ? this.rankOf(animal.damId, visiting) : -1;
      rank = Math.max(sRank, dRank) + 1;
    }
    visiting.delete(id);
    this.topoRank.set(id, rank);
    return rank;
  }

  inbreeding(id: string, activeCalls: Set<string> = new Set()): number {
    if (!id) return 0;
    const cached = this.fMemo.get(id);
    if (cached !== undefined) return cached;

    const animal = this.herdById.get(id);
    const f =
      !animal || !animal.sireId || !animal.damId
        ? 0
        : this.kinship(animal.sireId, animal.damId, activeCalls);
    this.fMemo.set(id, f);
    return f;
  }

  kinship(a: string, b: string, activeCalls: Set<string> = new Set()): number {
    if (!a || !b) return 0;
    if (!this.herdById.has(a) || !this.herdById.has(b)) return 0;

    const key = a <= b ? `${a}|${b}` : `${b}|${a}`;
    const cached = this.phiMemo.get(key);
    if (cached !== undefined) return cached;
    if (activeCalls.has(key)) return 0; // cycle guard

    activeCalls.add(key);
    let result = 0;

    if (a === b) {
      result = 0.5 * (1 + this.inbreeding(a, activeCalls));
    } else {
      const rA = this.rankOf(a);
      const rB = this.rankOf(b);
      const expandId = rA > rB ? a : rB > rA ? b : a > b ? a : b;
      const otherId = expandId === a ? b : a;
      const animal = this.herdById.get(expandId);
      if (animal) {
        const s = animal.sireId ? this.kinship(animal.sireId, otherId, activeCalls) : 0;
        const d = animal.damId ? this.kinship(animal.damId, otherId, activeCalls) : 0;
        result = 0.5 * (s + d);
      }
    }

    activeCalls.delete(key);
    this.phiMemo.set(key, result);
    return result;
  }
}

function countDirectAncestors(
  animalId: string,
  herdById: Map<string, Animal>,
  depth: number,
  overrideAnimal?: Animal,
  visitedPath: Set<string> = new Set()
): number {
  if (depth <= 0) return 0;
  const effectiveId = overrideAnimal?.id || animalId;
  if (effectiveId && visitedPath.has(effectiveId)) return 0;
  const animal = overrideAnimal ?? herdById.get(animalId);
  if (!animal) return 0;

  if (effectiveId) visitedPath.add(effectiveId);
  let total = 0;
  if (animal.sireId && herdById.has(animal.sireId) && !visitedPath.has(animal.sireId)) {
    total += 1 + countDirectAncestors(animal.sireId, herdById, depth - 1, undefined, visitedPath);
  }
  if (animal.damId && herdById.has(animal.damId) && !visitedPath.has(animal.damId)) {
    total += 1 + countDirectAncestors(animal.damId, herdById, depth - 1, undefined, visitedPath);
  }
  if (effectiveId) visitedPath.delete(effectiveId);
  return total;
}

function countSubtree(rootId: string, herdById: Map<string, Animal>, depthRemaining: number): number {
  if (!rootId || !herdById.has(rootId)) return 0;
  return 1 + countDirectAncestors(rootId, herdById, depthRemaining - 1);
}

function collectSimplePaths(
  startId: string,
  herdById: Map<string, Animal>,
  maxDepth: number
): Map<string, string[][]> {
  const result = new Map<string, string[][]>();
  if (!herdById.has(startId)) return result;

  const dfs = (currId: string, path: string[]) => {
    const list = result.get(currId) ?? [];
    list.push([...path]);
    result.set(currId, list);

    if (path.length > maxDepth) return;
    const animal = herdById.get(currId);
    if (!animal) return;

    if (animal.sireId && herdById.has(animal.sireId) && !path.includes(animal.sireId)) {
      path.push(animal.sireId);
      dfs(animal.sireId, path);
      path.pop();
    }
    if (animal.damId && herdById.has(animal.damId) && !path.includes(animal.damId)) {
      path.push(animal.damId);
      dfs(animal.damId, path);
      path.pop();
    }
  };

  dfs(startId, [startId]);
  return result;
}

function computeCommonAncestorContributions(
  sireId: string,
  damId: string,
  herdById: Map<string, Animal>,
  engine: CoancestryEngine,
  sirePathsOverride?: Map<string, string[][]>,
  damPathsOverride?: Map<string, string[][]>
): AncestorContribution[] {
  const sirePaths = sirePathsOverride ?? collectSimplePaths(sireId, herdById, 8);
  const damPaths = damPathsOverride ?? collectSimplePaths(damId, herdById, 8);

  const contributions: AncestorContribution[] = [];
  for (const [ancestorId, sList] of sirePaths.entries()) {
    const dList = damPaths.get(ancestorId);
    if (!dList) continue;
    const ancestor = herdById.get(ancestorId);
    if (!ancestor) continue;

    const fA = engine.inbreeding(ancestorId);
    let sum = 0;

    for (const sp of sList) {
      const sInternal = new Set(sp.slice(0, -1));
      for (const dp of dList) {
        const dInternal = dp.slice(0, -1);
        const overlaps = dInternal.some((id) => sInternal.has(id));
        if (!overlaps) {
          const n1 = sp.length - 1;
          const n2 = dp.length - 1;
          sum += Math.pow(0.5, n1 + n2 + 1) * (1 + fA);
        }
      }
    }

    if (sum > 0) {
      contributions.push({
        ancestor,
        coiContributionPercent: sum * 100,
        sireAppearances: sList.length,
        damAppearances: dList.length,
      });
    }
  }

  return contributions.sort((a, b) => b.coiContributionPercent - a.coiContributionPercent);
}

export interface SpeciesCoiEvaluator {
  calculatePairingCoi: (
    sireId: string,
    damId: string,
    overrideSubject?: Animal
  ) => CoiAnalysis;
  calculateAnimalCoi: (animal: Animal) => CoiAnalysis;
}

/**
 * Creates a reusable per-species COI evaluator that shares one `CoancestryEngine`
 * and caches ancestor simple paths & subtree counts across batch calculations
 * (such as herd-wide COI maps or Breed-With pairing matrices).
 */
export function createSpeciesCoiEvaluator(
  herdById: Map<string, Animal>
): SpeciesCoiEvaluator {
  const engine = new CoancestryEngine(herdById);
  const pathsCache = new Map<string, Map<string, string[][]>>();
  const subtree3Cache = new Map<string, number>();
  const subtree4Cache = new Map<string, number>();

  const getPaths = (id: string): Map<string, string[][]> => {
    let cached = pathsCache.get(id);
    if (!cached) {
      cached = collectSimplePaths(id, herdById, 8);
      pathsCache.set(id, cached);
    }
    return cached;
  };

  const getSubtree3 = (id: string): number => {
    if (!id || !herdById.has(id)) return 0;
    let cached = subtree3Cache.get(id);
    if (cached === undefined) {
      cached = countSubtree(id, herdById, 3);
      subtree3Cache.set(id, cached);
    }
    return cached;
  };

  const getSubtree4 = (id: string): number => {
    if (!id || !herdById.has(id)) return 0;
    let cached = subtree4Cache.get(id);
    if (cached === undefined) {
      cached = countSubtree(id, herdById, 4);
      subtree4Cache.set(id, cached);
    }
    return cached;
  };

  const evalPairing = (
    sireId: string,
    damId: string,
    overrideSubject?: Animal
  ): CoiAnalysis => {
    const countKnown = (): [number, number] => {
      if (overrideSubject) {
        return [
          countDirectAncestors(overrideSubject.id, herdById, 3, overrideSubject),
          countDirectAncestors(overrideSubject.id, herdById, 4, overrideSubject),
        ];
      }
      return [
        getSubtree3(sireId) + getSubtree3(damId),
        getSubtree4(sireId) + getSubtree4(damId),
      ];
    };

    if (!sireId || !damId) {
      const [g3, g4] = countKnown();
      return {
        coiFraction: 0,
        coiPercent: 0,
        risk: describeCoiRisk(0),
        sharedAncestors: [],
        knownAncestorsIn3Gen: g3,
        knownAncestorsIn4Gen: g4,
      };
    }

    const fraction = Math.min(1, Math.max(0, engine.kinship(sireId, damId)));
    const percent = fraction * 100;
    const sharedAncestors = computeCommonAncestorContributions(
      sireId,
      damId,
      herdById,
      engine,
      getPaths(sireId),
      getPaths(damId)
    );
    const [g3, g4] = countKnown();

    return {
      coiFraction: fraction,
      coiPercent: percent,
      risk: describeCoiRisk(percent),
      sharedAncestors,
      knownAncestorsIn3Gen: g3,
      knownAncestorsIn4Gen: g4,
    };
  };

  return {
    calculatePairingCoi: evalPairing,
    calculateAnimalCoi: (animal: Animal): CoiAnalysis => {
      if (!animal.sireId || !animal.damId) {
        return evalPairing('', '', animal);
      }
      return evalPairing(animal.sireId, animal.damId, animal);
    },
  };
}

/**
 * Calculates projected Wright's COI for a hypothetical Sire × Dam pairing.
 */
export function calculatePairingCoi(
  sireId: string,
  damId: string,
  herdById: Map<string, Animal>,
  overrideSubject?: Animal
): CoiAnalysis {
  const countKnown = (): [number, number] => {
    if (overrideSubject) {
      return [
        countDirectAncestors(overrideSubject.id, herdById, 3, overrideSubject),
        countDirectAncestors(overrideSubject.id, herdById, 4, overrideSubject),
      ];
    }
    const g3 = countSubtree(sireId, herdById, 3) + countSubtree(damId, herdById, 3);
    const g4 = countSubtree(sireId, herdById, 4) + countSubtree(damId, herdById, 4);
    return [g3, g4];
  };

  if (!sireId || !damId) {
    const [g3, g4] = countKnown();
    return {
      coiFraction: 0,
      coiPercent: 0,
      risk: describeCoiRisk(0),
      sharedAncestors: [],
      knownAncestorsIn3Gen: g3,
      knownAncestorsIn4Gen: g4,
    };
  }

  const engine = new CoancestryEngine(herdById);
  const fraction = Math.min(1, Math.max(0, engine.kinship(sireId, damId)));
  const percent = fraction * 100;
  const sharedAncestors = computeCommonAncestorContributions(sireId, damId, herdById, engine);
  const [g3, g4] = countKnown();

  return {
    coiFraction: fraction,
    coiPercent: percent,
    risk: describeCoiRisk(percent),
    sharedAncestors,
    knownAncestorsIn3Gen: g3,
    knownAncestorsIn4Gen: g4,
  };
}

/**
 * Calculates Wright's COI for an existing individual animal.
 */
export function calculateAnimalCoi(
  animal: Animal,
  herdById: Map<string, Animal>
): CoiAnalysis {
  if (!animal.sireId || !animal.damId) {
    return calculatePairingCoi('', '', herdById, animal);
  }
  return calculatePairingCoi(animal.sireId, animal.damId, herdById, animal);
}

function slotRoleLabel(gen: number, idx: number, speciesProfile?: SpeciesProfile): string {
  const sireTitle = speciesProfile ? `Sire (${speciesProfile.maleLabel})` : 'Sire';
  const damTitle = speciesProfile ? `Dam (${speciesProfile.femaleLabel})` : 'Dam';

  if (gen === 0) return 'Subject';
  if (gen === 1) return idx === 0 ? sireTitle : damTitle;
  if (gen === 2) {
    switch (idx) {
      case 0:
        return 'Paternal Grandsire';
      case 1:
        return 'Paternal Granddam';
      case 2:
        return 'Maternal Grandsire';
      default:
        return 'Maternal Granddam';
    }
  }
  const side = idx < 1 << (gen - 1) ? 'Sire Line' : 'Dam Line';
  const parentRole = idx % 2 === 0 ? 'Sire' : 'Dam';
  if (gen === 3) return `Great-Grand${parentRole.toLowerCase()} (${side})`;
  if (gen === 4) return `2nd Great-Grand${parentRole.toLowerCase()} (${side})`;
  if (gen === 5) return `3rd Great-Grand${parentRole.toLowerCase()} (${side})`;
  if (gen === 6) return `4th Great-Grand${parentRole.toLowerCase()} (${side})`;
  if (gen === 7) return `5th Great-Grand${parentRole.toLowerCase()} (${side})`;
  if (gen === 8) return `6th Great-Grand${parentRole.toLowerCase()} (${side})`;
  return `G${gen} ${side} ${parentRole}`;
}

/**
 * Builds an ordered list of pedigree tree slots from Generation 0 (Subject) up to `maxGeneration` (1–8).
 * Tracks `occurrenceCount` so repeated linebred ancestors are highlighted automatically.
 */
export function buildPedigreeSlots(
  subject: Animal,
  herdById: Map<string, Animal>,
  maxGeneration: number = 3,
  speciesProfile?: SpeciesProfile
): PedigreeSlot[] {
  const cappedGen = Math.min(8, Math.max(1, maxGeneration));
  const rawGrid: (Animal | null)[][] = [];
  rawGrid[0] = [subject];

  for (let gen = 1; gen <= cappedGen; gen++) {
    const prevRow = rawGrid[gen - 1];
    const currRow: (Animal | null)[] = [];
    for (const parent of prevRow) {
      const sire = parent?.sireId ? herdById.get(parent.sireId) ?? null : null;
      const dam = parent?.damId ? herdById.get(parent.damId) ?? null : null;
      currRow.push(sire, dam);
    }
    rawGrid[gen] = currRow;
  }

  // Count ancestor occurrences across generations 1..cappedGen
  const counts = new Map<string, number>();
  for (let gen = 1; gen <= cappedGen; gen++) {
    for (const a of rawGrid[gen]) {
      if (a) {
        counts.set(a.id, (counts.get(a.id) ?? 0) + 1);
      }
    }
  }

  const slots: PedigreeSlot[] = [];
  for (let gen = 0; gen <= cappedGen; gen++) {
    const row = rawGrid[gen];
    for (let idx = 0; idx < row.length; idx++) {
      const animal = row[idx];
      const childAnimal = gen > 0 ? rawGrid[gen - 1][Math.floor(idx / 2)] : null;
      const expectedSex: BiologicalSex = gen === 0 ? subject.sex : idx % 2 === 0 ? 'Male' : 'Female';

      slots.push({
        generation: gen,
        slotIndex: idx,
        animal,
        roleLabel: slotRoleLabel(gen, idx, speciesProfile),
        occurrenceCount: animal && gen > 0 ? counts.get(animal.id) ?? 1 : 1,
        childAnimalId: childAnimal?.id ?? '',
        expectedSex,
      });
    }
  }

  return slots;
}

export interface PedigreeGen3BranchSummary {
  branchIndex: number; // 0..7 corresponding to generation 3 slotIndex
  slotKey: string; // "3:<branchIndex>"
  isExpanded: boolean;
  hiddenTotalSlots: number;
  hiddenKnownAncestors: number;
  hasKnownAncestors: boolean;
}

export interface PedigreeBranchViewportResult {
  visibleSlots: PedigreeSlot[];
  branchSummaries: Map<string, PedigreeGen3BranchSummary>;
  totalSlotsCount: number;
  visibleSlotsCount: number;
  hiddenSlotsCount: number;
  hiddenKnownAncestorsCount: number;
}

/**
 * Maps any slot at generation >= 4 back to its Generation-3 great-grandparent branch index (0..7).
 * Returns `null` for generations 0..3.
 */
export function getGen3BranchIndex(generation: number, slotIndex: number): number | null {
  if (generation < 4) return null;
  const shift = generation - 3;
  return Math.floor(slotIndex / (1 << shift));
}

/**
 * Keeps Generation 0–3 (`15` slots max) active in the pedigree chart DOM by default and filters
 * Generation 4–6 ancestor slots strictly to explicitly expanded Generation-3 branches.
 * Note: `buildPedigreeSlots` continues returning full depth for `.HTM` & Barn Binder printouts.
 */
export function buildPedigreeBranchViewport(
  slots: PedigreeSlot[],
  maxGeneration: number,
  expandedGen3Branches: ReadonlySet<number>,
  externalKnownBranches?: ReadonlySet<number>
): PedigreeBranchViewportResult {
  const branchTotals = new Array<number>(8).fill(0);
  const branchKnowns = new Array<number>(8).fill(0);

  if (maxGeneration >= 4) {
    for (const slot of slots) {
      const branchIdx = getGen3BranchIndex(slot.generation, slot.slotIndex);
      if (branchIdx === null || branchIdx < 0 || branchIdx >= 8) continue;
      branchTotals[branchIdx] += 1;
      if (slot.animal) {
        branchKnowns[branchIdx] += 1;
      }
    }
  }

  const branchSummaries = new Map<string, PedigreeGen3BranchSummary>();
  if (maxGeneration >= 4) {
    for (let b = 0; b < 8; b++) {
      const isExpanded = expandedGen3Branches.has(b);
      const hasExternal = Boolean(externalKnownBranches?.has(b));
      const knownCount = branchKnowns[b];
      branchSummaries.set(`3:${b}`, {
        branchIndex: b,
        slotKey: `3:${b}`,
        isExpanded,
        hiddenTotalSlots: isExpanded ? 0 : branchTotals[b],
        hiddenKnownAncestors: isExpanded ? 0 : knownCount,
        hasKnownAncestors: knownCount > 0 || hasExternal,
      });
    }
  }

  const visibleSlots: PedigreeSlot[] = [];
  let hiddenKnownAncestorsCount = 0;

  for (const slot of slots) {
    if (slot.generation <= 3) {
      visibleSlots.push(slot);
      continue;
    }
    const branchIdx = getGen3BranchIndex(slot.generation, slot.slotIndex);
    if (branchIdx !== null && expandedGen3Branches.has(branchIdx)) {
      visibleSlots.push(slot);
    } else if (slot.animal) {
      hiddenKnownAncestorsCount += 1;
    }
  }

  return {
    visibleSlots,
    branchSummaries,
    totalSlotsCount: slots.length,
    visibleSlotsCount: visibleSlots.length,
    hiddenSlotsCount: slots.length - visibleSlots.length,
    hiddenKnownAncestorsCount,
  };
}

/**
 * Returns the Generation-3 branch indices (`0..7`) that have at least one recorded Generation 4+ ancestor.
 */
export function getGen3BranchesWithKnownAncestors(slots: PedigreeSlot[]): number[] {
  const active = new Set<number>();
  for (const slot of slots) {
    if (slot.generation >= 4 && slot.animal) {
      const b = getGen3BranchIndex(slot.generation, slot.slotIndex);
      if (b !== null) active.add(b);
    }
  }
  return Array.from(active).sort((a, b) => a - b);
}

```

## `src/core/pedigreePrintStyles.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Pedigree Print Styling, Color, Border & Layout Presets (`src/core/pedigreePrintStyles.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) calls so the exact same
 * print palettes and layout rules power HTML exports, native PDF 1.4 rendering, and React Native / Expo.
 * All paper backgrounds are strictly locked to `#FFFFFF` for printer ink safety.
 */

import {
  CustomThemeColors,
  DEFAULT_WARM_THEME_COLORS,
  mixHex,
  relativeLuminance,
} from './themePalette';

export type PedigreeColorPresetId =
  | 'classic_sage'
  | 'royal_navy'
  | 'heritage_burgundy'
  | 'barn_palette'
  | 'monochrome_ink';

export type PedigreeBorderStyleId =
  | 'classic_rule'
  | 'double_frame'
  | 'modern_rounded'
  | 'minimal_lines';

export type PedigreeLayoutPresetId =
  | 'evans_standard'
  | 'show_certificate'
  | 'compact_ledger'
  | 'family_portrait'
  | 'iagarb_angora';

export interface PedigreeColorPresetSpec {
  id: PedigreeColorPresetId;
  label: string;
  description: string;
  primaryHex: string;
  accentHex: string;
  sireHex: string;
  damHex: string;
  borderHex: string;
  cellBorderHex: string;
}

export interface PedigreeBorderStyleSpec {
  id: PedigreeBorderStyleId;
  label: string;
  description: string;
}

export interface PedigreeLayoutPresetSpec {
  id: PedigreeLayoutPresetId;
  label: string;
  description: string;
}

export interface PedigreeQuickPresetSpec {
  id: string;
  label: string;
  description: string;
  colorPreset: PedigreeColorPresetId;
  borderStyle: PedigreeBorderStyleId;
  layoutPreset: PedigreeLayoutPresetId;
}

export interface ResolvedPedigreePrintTheme {
  colorPreset: PedigreeColorPresetId;
  borderStyle: PedigreeBorderStyleId;
  layoutPreset: PedigreeLayoutPresetId;
  paperBg: '#FFFFFF';
  inkHex: string;
  mutedInkHex: string;
  primaryHex: string;
  accentHex: string;
  sireHex: string;
  damHex: string;
  borderHex: string;
  cellBorderHex: string;
  isMonochrome: boolean;
}

export const PEDIGREE_COLOR_PRESETS: readonly PedigreeColorPresetSpec[] = [
  {
    id: 'classic_sage',
    label: 'Classic Barn Sage',
    description: 'Traditional forest green header with slate sire & terracotta dam accents.',
    primaryHex: '#1E3F2A',
    accentHex: '#2D5A3D',
    sireHex: '#366685',
    damHex: '#8C3F20',
    borderHex: '#2D5A3D',
    cellBorderHex: '#B8B3A8',
  },
  {
    id: 'royal_navy',
    label: 'Registry Navy & Gold',
    description: 'Deep navy headers with muted brass borders and cobalt/burgundy parent bars.',
    primaryHex: '#1B365D',
    accentHex: '#7A5C18',
    sireHex: '#2B547E',
    damHex: '#7C2D3B',
    borderHex: '#1B365D',
    cellBorderHex: '#AEBAC9',
  },
  {
    id: 'heritage_burgundy',
    label: 'Heritage Burgundy',
    description: 'Warm show-barn burgundy headings with espresso rules.',
    primaryHex: '#5C1D28',
    accentHex: '#4A3728',
    sireHex: '#345978',
    damHex: '#8C3340',
    borderHex: '#5C1D28',
    cellBorderHex: '#C4B6B2',
  },
  {
    id: 'barn_palette',
    label: 'My Barn Theme',
    description: 'Adapts your custom Barn Color Picker palette safely for white-paper print.',
    primaryHex: DEFAULT_WARM_THEME_COLORS.lightPrimary,
    accentHex: DEFAULT_WARM_THEME_COLORS.lightAccent,
    sireHex: DEFAULT_WARM_THEME_COLORS.lightMale,
    damHex: DEFAULT_WARM_THEME_COLORS.lightAccent,
    borderHex: DEFAULT_WARM_THEME_COLORS.lightPrimary,
    cellBorderHex: '#B8B3A8',
  },
  {
    id: 'monochrome_ink',
    label: 'Ink Saver (B&W)',
    description: 'Pure black & charcoal lines optimized for monochrome laser or thermal print.',
    primaryHex: '#000000',
    accentHex: '#18181B',
    sireHex: '#18181B',
    damHex: '#3F3F46',
    borderHex: '#000000',
    cellBorderHex: '#9CA3AF',
  },
];

export const PEDIGREE_BORDER_STYLES: readonly PedigreeBorderStyleSpec[] = [
  {
    id: 'classic_rule',
    label: 'Classic Rule',
    description: 'Crisp single grid lines with colored sire/dam accent bars.',
  },
  {
    id: 'double_frame',
    label: 'Certificate Double Frame',
    description: 'Formal double outer certificate border framing the pedigree.',
  },
  {
    id: 'modern_rounded',
    label: 'Modern Rounded',
    description: 'Subtle rounded outer subject & header framing with clean table grid.',
  },
  {
    id: 'minimal_lines',
    label: 'Minimal Hairline',
    description: 'Lightweight rules maximizing vertical room for 6–8 generation pedigrees.',
  },
];

export const PEDIGREE_LAYOUT_PRESETS: readonly PedigreeLayoutPresetSpec[] = [
  {
    id: 'evans_standard',
    label: 'Evans Classic',
    description: 'Standard Evans-style header, subject summary strip, and full rowspan matrix.',
  },
  {
    id: 'show_certificate',
    label: 'Show Certificate',
    description: 'Centered formal title banner with prominent registration & GC callouts.',
  },
  {
    id: 'compact_ledger',
    label: 'Compact Ledger',
    description: 'Tighter header & subject summary leaving maximum vertical space for deep trees.',
  },
  {
    id: 'family_portrait',
    label: 'Family Portrait (Photos)',
    description: 'Multi-photo pedigree displaying portrait thumbnails for subject, parents & grandparents.',
  },
  {
    id: 'iagarb_angora',
    label: 'IAGARB German Angora',
    description: 'Official 100-point wool judging breakdown, 325g/90d yield stats & ancestor fiber table.',
  },
];

export const PEDIGREE_QUICK_STYLE_PRESETS: readonly PedigreeQuickPresetSpec[] = [
  {
    id: 'evans-classic',
    label: 'Evans Classic',
    description: 'Barn Sage · Classic Rule · Evans Layout',
    colorPreset: 'classic_sage',
    borderStyle: 'classic_rule',
    layoutPreset: 'evans_standard',
  },
  {
    id: 'grand-champion',
    label: 'Grand Champion Cert',
    description: 'Registry Navy · Double Frame · Show Certificate',
    colorPreset: 'royal_navy',
    borderStyle: 'double_frame',
    layoutPreset: 'show_certificate',
  },
  {
    id: 'family-portrait',
    label: 'Family Photo Keepsake',
    description: 'Barn Sage · Double Frame · Multi-Photo Portrait',
    colorPreset: 'classic_sage',
    borderStyle: 'double_frame',
    layoutPreset: 'family_portrait',
  },
  {
    id: 'iagarb-german-angora',
    label: 'IAGARB German Angora',
    description: 'Heritage Burgundy · Classic Rule · Wool Yield & 100-pt Scale',
    colorPreset: 'heritage_burgundy',
    borderStyle: 'classic_rule',
    layoutPreset: 'iagarb_angora',
  },
  {
    id: 'deep-archival',
    label: 'Deep 8-Gen Ledger',
    description: 'Barn Sage · Minimal Hairline · Compact Ledger',
    colorPreset: 'classic_sage',
    borderStyle: 'minimal_lines',
    layoutPreset: 'compact_ledger',
  },
  {
    id: 'laser-ink-saver',
    label: 'Laser Ink Saver',
    description: 'Monochrome B&W · Classic Rule · Compact Ledger',
    colorPreset: 'monochrome_ink',
    borderStyle: 'classic_rule',
    layoutPreset: 'compact_ledger',
  },
];

function ensurePrintInkHex(rawHex: string | undefined, fallbackHex: string): string {
  const trimmed = (rawHex || '').trim();
  const valid = /^#[0-9a-fA-F]{6}$/.test(trimmed)
    ? trimmed.toUpperCase()
    : fallbackHex.toUpperCase();
  const lum = relativeLuminance(valid);
  if (lum > 0.34) {
    return mixHex(valid, '#141B15', 0.56);
  }
  if (lum > 0.22) {
    return mixHex(valid, '#141B15', 0.3);
  }
  return valid;
}

export function hexToPdfRgb(hex: string): [number, number, number] {
  const clean = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : '1E3F2A';
  const num = parseInt(clean, 16);
  return [
    Number((((num >> 16) & 255) / 255).toFixed(3)),
    Number((((num >> 8) & 255) / 255).toFixed(3)),
    Number(((num & 255) / 255).toFixed(3)),
  ];
}

export function normalizeColorPresetId(raw: unknown): PedigreeColorPresetId {
  if (
    raw === 'classic_sage' ||
    raw === 'royal_navy' ||
    raw === 'heritage_burgundy' ||
    raw === 'barn_palette' ||
    raw === 'monochrome_ink'
  ) {
    return raw;
  }
  return 'classic_sage';
}

export function normalizeBorderStyleId(raw: unknown): PedigreeBorderStyleId {
  if (
    raw === 'classic_rule' ||
    raw === 'double_frame' ||
    raw === 'modern_rounded' ||
    raw === 'minimal_lines'
  ) {
    return raw;
  }
  return 'classic_rule';
}

export function normalizeLayoutPresetId(raw: unknown): PedigreeLayoutPresetId {
  if (
    raw === 'evans_standard' ||
    raw === 'show_certificate' ||
    raw === 'compact_ledger' ||
    raw === 'family_portrait' ||
    raw === 'iagarb_angora'
  ) {
    return raw;
  }
  return 'evans_standard';
}

export function resolvePedigreePrintTheme(
  options?: {
    colorPreset?: PedigreeColorPresetId;
    borderStyle?: PedigreeBorderStyleId;
    layoutPreset?: PedigreeLayoutPresetId;
  },
  customColors?: CustomThemeColors
): ResolvedPedigreePrintTheme {
  const colorPreset = normalizeColorPresetId(options?.colorPreset);
  const borderStyle = normalizeBorderStyleId(options?.borderStyle);
  const layoutPreset = normalizeLayoutPresetId(options?.layoutPreset);

  if (colorPreset === 'monochrome_ink') {
    return {
      colorPreset,
      borderStyle,
      layoutPreset,
      paperBg: '#FFFFFF',
      inkHex: '#000000',
      mutedInkHex: '#3F3F46',
      primaryHex: '#000000',
      accentHex: '#18181B',
      sireHex: '#18181B',
      damHex: '#3F3F46',
      borderHex: '#000000',
      cellBorderHex: '#9CA3AF',
      isMonochrome: true,
    };
  }

  if (colorPreset === 'barn_palette') {
    const primary = ensurePrintInkHex(
      customColors?.lightPrimary,
      DEFAULT_WARM_THEME_COLORS.lightPrimary
    );
    const accent = ensurePrintInkHex(
      customColors?.lightAccent,
      DEFAULT_WARM_THEME_COLORS.lightAccent
    );
    const sire = ensurePrintInkHex(
      customColors?.lightMale,
      DEFAULT_WARM_THEME_COLORS.lightMale
    );
    return {
      colorPreset,
      borderStyle,
      layoutPreset,
      paperBg: '#FFFFFF',
      inkHex: '#171C17',
      mutedInkHex: '#434D42',
      primaryHex: primary,
      accentHex: accent,
      sireHex: sire,
      damHex: accent,
      borderHex: primary,
      cellBorderHex: '#B8B3A8',
      isMonochrome: false,
    };
  }

  const spec =
    PEDIGREE_COLOR_PRESETS.find((p) => p.id === colorPreset) ?? PEDIGREE_COLOR_PRESETS[0];

  return {
    colorPreset,
    borderStyle,
    layoutPreset,
    paperBg: '#FFFFFF',
    inkHex: '#1E241E',
    mutedInkHex: '#434D42',
    primaryHex: spec.primaryHex,
    accentHex: spec.accentHex,
    sireHex: spec.sireHex,
    damHex: spec.damHex,
    borderHex: spec.borderHex,
    cellBorderHex: spec.cellBorderHex,
    isMonochrome: false,
  };
}
```

## `src/core/photoMaintenance.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Photo Storage Footprint Analyzer & Orphan/Full-Res Pruner (`src/core/photoMaintenance.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`, `<canvas>`)
 * or Node APIs so photo storage auditing runs identically across Web PWA and React Native / Expo.
 */

import {
  estimateDataUrlByteLength,
  ImageOptimizationPresetId,
  resolveImageOptimizationPreset,
} from './imageOptimizationSpec';
import { AnimalPhoto, BarnDatabaseSnapshot, nowIsoUtc } from './models';

export const OVERSIZED_PHOTO_BYTES_THRESHOLD = 450 * 1024; // 450 KB stored photo threshold
export const FULL_RES_PRUNABLE_MIN_BYTES = 20 * 1024; // >20 KB full payload worth pruning down to thumbnail

export interface SpeciesPhotoFootprint {
  species: string;
  photoCount: number;
  storedBytes: number;
  thumbnailBytes: number;
  orphanCount: number;
  oversizedCount: number;
  fullResPrunableCount: number;
}

export interface PhotoStorageFootprintReport {
  analyzedAtIso: string;
  activePresetId: ImageOptimizationPresetId;
  activePresetMaxDimension: number;
  totalPhotoCount: number;
  totalStoredBytes: number;
  totalThumbnailBytes: number;
  orphanPhotoIds: string[];
  orphanBytes: number;
  oversizedPhotoIds: string[];
  oversizedBytes: number;
  fullResPrunableIds: string[];
  estimatedReclaimableFullResBytes: number;
  speciesBreakdown: SpeciesPhotoFootprint[];
}

function resolvePhotoStoredBytes(photo: AnimalPhoto): number {
  if (photo.dataUrl) {
    return Math.max(photo.storedBytes || 0, estimateDataUrlByteLength(photo.dataUrl));
  }
  return Math.max(0, Number(photo.storedBytes) || 0);
}

function resolvePhotoThumbnailBytes(photo: AnimalPhoto): number {
  return photo.thumbnailDataUrl ? estimateDataUrlByteLength(photo.thumbnailDataUrl) : 0;
}

/**
 * Pure footprint analyzer inspecting per-species photo byte usage, orphan attachments
 * referencing deleted/missing animals, oversized photos exceeding the active preset
 * dimensions or size threshold, and full-res payloads that can be compacted cleanly to thumbnails.
 */
export function analyzePhotoStorageFootprintPure(
  snapshot: BarnDatabaseSnapshot,
  activePresetId?: ImageOptimizationPresetId
): PhotoStorageFootprintReport {
  const preset = resolveImageOptimizationPreset(
    activePresetId ?? snapshot.settings.imageOptimizationPreset
  );
  const animalIds = new Set(snapshot.animals.map((a) => a.id));
  const photos = snapshot.animalPhotos ?? [];

  const orphanPhotoIds: string[] = [];
  const oversizedPhotoIds: string[] = [];
  const fullResPrunableIds: string[] = [];
  let totalStoredBytes = 0;
  let totalThumbnailBytes = 0;
  let orphanBytes = 0;
  let oversizedBytes = 0;
  let estimatedReclaimableFullResBytes = 0;

  const bySpecies = new Map<string, SpeciesPhotoFootprint>();

  for (const photo of photos) {
    const storedBytes = resolvePhotoStoredBytes(photo);
    const thumbBytes = resolvePhotoThumbnailBytes(photo);
    const isOrphan = !photo.animalId || !animalIds.has(photo.animalId);
    const exceedsDimension =
      (photo.width > preset.maxDimension || photo.height > preset.maxDimension) &&
      storedBytes > FULL_RES_PRUNABLE_MIN_BYTES;
    const isOversized = !isOrphan && (exceedsDimension || storedBytes > OVERSIZED_PHOTO_BYTES_THRESHOLD);

    const hasDistinctThumbnail =
      Boolean(photo.thumbnailDataUrl) &&
      photo.thumbnailDataUrl !== photo.dataUrl &&
      thumbBytes > 0 &&
      storedBytes > Math.max(FULL_RES_PRUNABLE_MIN_BYTES, thumbBytes + 8 * 1024);

    totalStoredBytes += storedBytes;
    totalThumbnailBytes += thumbBytes;

    if (isOrphan) {
      orphanPhotoIds.push(photo.id);
      orphanBytes += storedBytes;
    }
    if (isOversized) {
      oversizedPhotoIds.push(photo.id);
      oversizedBytes += storedBytes;
    }
    if (!isOrphan && hasDistinctThumbnail) {
      fullResPrunableIds.push(photo.id);
      estimatedReclaimableFullResBytes += Math.max(0, storedBytes - thumbBytes);
    }

    const spName = (photo.species || 'Unspecified').trim() || 'Unspecified';
    const spKey = spName.toLowerCase();
    const bucket = bySpecies.get(spKey) || {
      species: spName,
      photoCount: 0,
      storedBytes: 0,
      thumbnailBytes: 0,
      orphanCount: 0,
      oversizedCount: 0,
      fullResPrunableCount: 0,
    };
    bucket.photoCount += 1;
    bucket.storedBytes += storedBytes;
    bucket.thumbnailBytes += thumbBytes;
    if (isOrphan) bucket.orphanCount += 1;
    if (isOversized) bucket.oversizedCount += 1;
    if (!isOrphan && hasDistinctThumbnail) bucket.fullResPrunableCount += 1;
    bySpecies.set(spKey, bucket);
  }

  const speciesBreakdown = Array.from(bySpecies.values()).sort(
    (a, b) => b.storedBytes - a.storedBytes || a.species.localeCompare(b.species)
  );

  return {
    analyzedAtIso: nowIsoUtc(),
    activePresetId: preset.id,
    activePresetMaxDimension: preset.maxDimension,
    totalPhotoCount: photos.length,
    totalStoredBytes,
    totalThumbnailBytes,
    orphanPhotoIds,
    orphanBytes,
    oversizedPhotoIds,
    oversizedBytes,
    fullResPrunableIds,
    estimatedReclaimableFullResBytes,
    speciesBreakdown,
  };
}

/**
 * Removes orphan `AnimalPhoto` records whose `animalId` no longer exists in `snapshot.animals`.
 */
export function removeOrphanPhotosFromSnapshotPure(snapshot: BarnDatabaseSnapshot): {
  nextSnapshot: BarnDatabaseSnapshot;
  removedPhotoIds: string[];
  removedCount: number;
  reclaimedBytes: number;
} {
  const animalIds = new Set(snapshot.animals.map((a) => a.id));
  const kept: AnimalPhoto[] = [];
  const removedPhotoIds: string[] = [];
  let reclaimedBytes = 0;

  for (const photo of snapshot.animalPhotos ?? []) {
    if (!photo.animalId || !animalIds.has(photo.animalId)) {
      removedPhotoIds.push(photo.id);
      reclaimedBytes += resolvePhotoStoredBytes(photo);
    } else {
      kept.push(photo);
    }
  }

  if (removedPhotoIds.length === 0) {
    return {
      nextSnapshot: snapshot,
      removedPhotoIds: [],
      removedCount: 0,
      reclaimedBytes: 0,
    };
  }

  return {
    nextSnapshot: {
      ...snapshot,
      animalPhotos: kept,
    },
    removedPhotoIds,
    removedCount: removedPhotoIds.length,
    reclaimedBytes,
  };
}

/**
 * Replaces redundant heavy full-resolution `dataUrl` image payloads with their already-generated
 * `thumbnailDataUrl` previews so herd/pedigree thumbnails and metadata remain intact while freeing quota.
 */
export function pruneFullResPayloadsFromSnapshotPure(
  snapshot: BarnDatabaseSnapshot,
  targetPhotoIds?: string[],
  timestampIso?: string
): {
  nextSnapshot: BarnDatabaseSnapshot;
  prunedCount: number;
  reclaimedBytes: number;
  updatedPhotos: AnimalPhoto[];
} {
  const allowSet = targetPhotoIds ? new Set(targetPhotoIds) : null;
  const ts = timestampIso || nowIsoUtc();
  let prunedCount = 0;
  let reclaimedBytes = 0;
  const updatedPhotos: AnimalPhoto[] = [];

  const nextPhotos = (snapshot.animalPhotos ?? []).map((photo) => {
    if (allowSet && !allowSet.has(photo.id)) return photo;
    if (!photo.thumbnailDataUrl || photo.thumbnailDataUrl === photo.dataUrl) {
      return photo;
    }
    const prevBytes = resolvePhotoStoredBytes(photo);
    const thumbBytes = resolvePhotoThumbnailBytes(photo);
    if (thumbBytes <= 0 || prevBytes <= Math.max(FULL_RES_PRUNABLE_MIN_BYTES, thumbBytes + 8 * 1024)) {
      return photo;
    }
    const nextPhoto: AnimalPhoto = {
      ...photo,
      dataUrl: photo.thumbnailDataUrl,
      storedBytes: thumbBytes,
      _rev: (photo._rev ?? 0) + 1,
      updatedAt: ts,
    };
    prunedCount += 1;
    reclaimedBytes += Math.max(0, prevBytes - thumbBytes);
    updatedPhotos.push(nextPhoto);
    return nextPhoto;
  });

  if (prunedCount === 0) {
    return {
      nextSnapshot: snapshot,
      prunedCount: 0,
      reclaimedBytes: 0,
      updatedPhotos: [],
    };
  }

  return {
    nextSnapshot: {
      ...snapshot,
      animalPhotos: nextPhotos,
    },
    prunedCount,
    reclaimedBytes,
    updatedPhotos,
  };
}
```

## `src/core/promptsCatalog.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Prompt Directory Catalog & Parser (`src/core/promptsCatalog.ts`).
 *
 * Maintenance Note:
 * If the `/prompts/` folder in the repository root is ever moved or renamed,
 * update `PROMPTS_FOLDER_PATH` and `PROMPTS_FILE_STRUCTURE_BREADCRUMB` here,
 * the `import.meta.glob` path in `src/components/PromptsDirectoryScreen.tsx`,
 * and the disk scanner in `vite.config.ts`.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) or Node imports.
 */

export const PROMPTS_FOLDER_PATH = '/prompts';

export const PROMPTS_FILE_STRUCTURE_BREADCRUMB: readonly string[] = [
  'Pedigree (Repo Root)',
  'prompts',
];

export const PROMPTS_MOVED_DOCUMENTATION_NOTE =
  'Documentation Note: All prompts are protected in /prompts/ (DO_NOT_REMOVE_WITHOUT_CONFIRMATION). If these prompt files are ever moved or renamed in the repository, this Prompts Directory page (src/components/PromptsDirectoryScreen.tsx), src/core/promptsCatalog.ts, and the /prompts/ manifest scanner in vite.config.ts must be updated to match.';

export type PromptStatus = 'active' | 'archived';

export interface PromptCatalogEntry {
  filename: string;
  relativePath: string;
  title: string;
  summary: string;
  whenToUse: string;
  status: PromptStatus;
  protectedDoNotRemove: boolean;
  protectionFlag: string | null;
  lastEdited: string | null;
  lineCount: number;
  byteLength: number;
  rawContent?: string;
}

export interface PromptsCatalogManifest {
  folderPath: string;
  scannedAtIso: string;
  entries: PromptCatalogEntry[];
}

interface CuratedPromptDescription {
  title: string;
  summary: string;
  whenToUse: string;
  preferredOrder: number;
}

const CURATED_PROMPT_DESCRIPTIONS: Record<string, CuratedPromptDescription> = {
  'master_system_prompt.md': {
    title: 'Master System Prompt (Active)',
    summary:
      'Single source of truth for execution discipline, strict TypeScript safety, modular boundaries (core vs storage/hooks/components/utils), offline-first IndexedDB/SQLite/OPFS invariants, memory limits, and pure calendar date math.',
    whenToUse:
      'Load first at the start of any engineering session or automated prompt workflow before modifying application code.',
    preferredOrder: 1,
  },
  'start_new_backlog_prompt.md': {
    title: 'Start New Backlog Item Prompt',
    summary:
      '7-step workflow for picking the highest-priority item from docs/plans/suggestions-backlog.md, drafting docs/plans/active-backlog-plan.md, implementing end-to-end, auditing stability/memory/performance, and cleaning up completed items.',
    whenToUse:
      'Run when starting the next pending item from the suggestions backlog (automatically redirects to resume_backlog_plan_prompt.md if an active plan already exists).',
    preferredOrder: 2,
  },
  'resume_backlog_plan_prompt.md': {
    title: 'Resume Backlog Plan Prompt',
    summary:
      '4-phase continuation workflow that loads the active master system prompt, reads docs/plans/active-backlog-plan.md, executes the next pending task, runs tests/typechecks, and closes out the plan once all tasks pass.',
    whenToUse:
      'Run when resuming an in-progress implementation plan in docs/plans/ across sessions.',
    preferredOrder: 3,
  },
  'fix_error_log_prompt.md': {
    title: 'Automated Crash Diagnostic & Code Remediation Prompt',
    summary:
      '4-phase root-cause debugging workflow that ingests crash/support logs, inspects [ERROR]/[FATAL]/[WARN] traces and storage/memory warnings, implements defensive fixes with regression tests, and reports verified results.',
    whenToUse:
      'Run alongside an exported support-report.txt, error-logs.json, or stack trace to diagnose and fix application crashes.',
    preferredOrder: 4,
  },
  'master_system_prompt_old_v4.md': {
    title: 'Master System Prompt (Archived v4)',
    summary:
      'Superseded v4 edition of the Community Pedigree Master System Prompt preserved strictly for historical reference and diff comparison.',
    whenToUse:
      'Reference only — do not use as active instructions; use prompts/master_system_prompt.md instead.',
    preferredOrder: 100,
  },
  'master_system_prompt_old_v2.md': {
    title: 'Master System Prompt (Archived v2)',
    summary:
      'Superseded v2 edition of the Community Pedigree Master System Prompt preserved strictly for historical reference and diff comparison.',
    whenToUse:
      'Reference only — do not use as active instructions; use prompts/master_system_prompt.md instead.',
    preferredOrder: 101,
  },
  'master_system_prompt_old_v1.md': {
    title: 'Master System Prompt (Archived v1)',
    summary:
      'Original v1 edition of the Community Pedigree Master System Prompt retained strictly for historical audit and provenance.',
    whenToUse:
      'Reference only — do not use as active instructions; use prompts/master_system_prompt.md instead.',
    preferredOrder: 102,
  },
};

function computeUtf8ByteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  return text.length;
}

function humanizeFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  return base
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function extractFilenameFromPath(rawKey: string): string {
  const normalized = rawKey.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/');
  return segments[segments.length - 1] || normalized;
}

function extractMarkdownTitle(filename: string, content: string): string {
  const curated = CURATED_PROMPT_DESCRIPTIONS[filename];
  if (curated) return curated.title;

  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('<!--')) continue;
    const h1Match = /^#\s+(.+)$/.exec(trimmed);
    if (h1Match && h1Match[1]) {
      return h1Match[1].trim();
    }
    const commentHeading = /^(?:\/\/|#)\s*([A-Za-z0-9].+)$/.exec(trimmed);
    if (commentHeading && commentHeading[1] && !commentHeading[1].startsWith('!')) {
      return commentHeading[1].trim();
    }
  }
  return humanizeFilename(filename);
}

function extractLastEdited(content: string): string | null {
  const match = /\*\*Last-Edited(?:\s+Timestamp)?:\*\*\s*(.+)/i.exec(content);
  return match && match[1] ? match[1].trim() : null;
}

function detectArchivedStatus(filename: string, content: string): PromptStatus {
  const lowerName = filename.toLowerCase();
  if (
    lowerName.includes('_old_') ||
    lowerName.includes('old_v') ||
    lowerName.includes('archived') ||
    lowerName.includes('deprecated')
  ) {
    return 'archived';
  }
  if (
    /ARCHIVED\s*[—-]\s*STRICTLY FOR REFERENCE ONLY/i.test(content) ||
    /older v\d+ version of the master system prompt/i.test(content) ||
    /<!--\s*PROMPT_STATUS\s*:\s*archived\s*-->/i.test(content)
  ) {
    return 'archived';
  }
  return 'active';
}

function detectProtectionFlag(content: string): {
  protectedDoNotRemove: boolean;
  protectionFlag: string | null;
} {
  if (/DO_NOT_REMOVE_WITHOUT_CONFIRMATION/i.test(content)) {
    return {
      protectedDoNotRemove: true,
      protectionFlag: 'DO_NOT_REMOVE_WITHOUT_CONFIRMATION',
    };
  }
  if (
    /Never delete,\s*overwrite,\s*(?:remove|or remove)/i.test(content) ||
    /Do not delete,\s*move,\s*(?:overwrite,\s*)?or remove/i.test(content)
  ) {
    return {
      protectedDoNotRemove: true,
      protectionFlag: 'PROTECTED_PROMPT_FILE',
    };
  }
  return {
    protectedDoNotRemove: false,
    protectionFlag: null,
  };
}

function extractFallbackSummary(content: string): string {
  const lines = content.split(/\r?\n/);
  const proseLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed === '---' ||
      trimmed.startsWith('<!--') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('>') ||
      /^\*\*Last-Edited/i.test(trimmed)
    ) {
      if (proseLines.length > 0) break;
      continue;
    }
    const cleaned = trimmed
      .replace(/^[-*]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/\*\*/g, '')
      .replace(/`/g, '');
    if (cleaned.length > 0) {
      proseLines.push(cleaned);
    }
    if (proseLines.join(' ').length >= 220) break;
  }

  const joined = proseLines.join(' ').trim();
  if (!joined) {
    return 'Custom prompt or script detected in /prompts/. Click View Source to inspect its instructions.';
  }
  return joined.length > 260 ? `${joined.slice(0, 257).trimEnd()}...` : joined;
}

export function parsePromptEntry(
  rawFilenameOrPath: string,
  rawContent: string,
  includeContent = true
): PromptCatalogEntry {
  const filename = extractFilenameFromPath(rawFilenameOrPath);
  const curated = CURATED_PROMPT_DESCRIPTIONS[filename];
  const status = detectArchivedStatus(filename, rawContent);
  const protection = detectProtectionFlag(rawContent);
  const title = extractMarkdownTitle(filename, rawContent);
  const summary = curated ? curated.summary : extractFallbackSummary(rawContent);
  const whenToUse = curated
    ? curated.whenToUse
    : status === 'archived'
      ? 'Archived for historical reference only; check active prompts before executing.'
      : 'Added to /prompts/ — review the source instructions before invoking.';
  const lastEdited = extractLastEdited(rawContent);
  const lineCount = rawContent.length === 0 ? 0 : rawContent.split(/\r?\n/).length;
  const byteLength = computeUtf8ByteLength(rawContent);

  return {
    filename,
    relativePath: `prompts/${filename}`,
    title,
    summary,
    whenToUse,
    status,
    protectedDoNotRemove: protection.protectedDoNotRemove,
    protectionFlag: protection.protectionFlag,
    lastEdited,
    lineCount,
    byteLength,
    ...(includeContent ? { rawContent } : {}),
  };
}

export function buildPromptsCatalogManifest(
  filesByPath: Record<string, string>,
  scannedAtIso: string = new Date().toISOString(),
  includeContent = true
): PromptsCatalogManifest {
  const dedupedByName = new Map<string, PromptCatalogEntry>();

  for (const [key, content] of Object.entries(filesByPath)) {
    if (typeof content !== 'string') continue;
    const filename = extractFilenameFromPath(key);
    if (!filename || filename.startsWith('.')) continue;
    dedupedByName.set(filename, parsePromptEntry(filename, content, includeContent));
  }

  const entries = Array.from(dedupedByName.values()).sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'active' ? -1 : 1;
    }
    const orderA = CURATED_PROMPT_DESCRIPTIONS[a.filename]?.preferredOrder ?? 50;
    const orderB = CURATED_PROMPT_DESCRIPTIONS[b.filename]?.preferredOrder ?? 50;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.filename.localeCompare(b.filename);
  });

  return {
    folderPath: PROMPTS_FOLDER_PATH,
    scannedAtIso,
    entries,
  };
}

export function partitionPromptsByStatus(entries: readonly PromptCatalogEntry[]): {
  active: PromptCatalogEntry[];
  archived: PromptCatalogEntry[];
} {
  const active: PromptCatalogEntry[] = [];
  const archived: PromptCatalogEntry[] = [];

  for (const entry of entries) {
    if (entry.status === 'archived') {
      archived.push(entry);
    } else {
      active.push(entry);
    }
  }

  return { active, archived };
}

export function isValidPromptsManifest(raw: unknown): raw is PromptsCatalogManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.folderPath !== 'string' || typeof obj.scannedAtIso !== 'string') return false;
  if (!Array.isArray(obj.entries)) return false;

  return obj.entries.every((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const entry = item as Record<string, unknown>;
    return (
      typeof entry.filename === 'string' &&
      typeof entry.relativePath === 'string' &&
      typeof entry.title === 'string' &&
      typeof entry.summary === 'string' &&
      (entry.status === 'active' || entry.status === 'archived') &&
      typeof entry.protectedDoNotRemove === 'boolean' &&
      typeof entry.lineCount === 'number' &&
      typeof entry.byteLength === 'number'
    );
  });
}
```

<!-- END OF PART 10 OF 16 (12 files) -->
