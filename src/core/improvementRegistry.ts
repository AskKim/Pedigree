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
