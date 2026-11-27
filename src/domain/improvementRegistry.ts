/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Improvement Registry & GitHub-Overwrite Drift Verifier (`src/domain/improvementRegistry.ts`).
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
  | 'diagnostics-sync'
  | 'workflow-polish';

export interface ImprovementInvariant {
  /** Workspace-relative POSIX path, e.g. `src/domain/models.ts` */
  filePath: string;
  /** Identifiers, functions, or critical guards that must remain present in this file */
  requiredSubstrings: string[];
  /** Anti-patterns or regressions that must NOT reappear in this file */
  forbiddenSubstrings?: string[];
  /** Short explanation of why this check exists */
  rationale: string;
}

export type ImprovementRelease = 'alpha-2' | 'alpha-3' | (string & {});

export const ALPHA_2_FINAL_IMP_ID = 'IMP-064';
export const ALPHA_2_RELEASE: ImprovementRelease = 'alpha-2';
export const ALPHA_3_RELEASE: ImprovementRelease = 'alpha-3';

export const IMPROVEMENT_RELEASE_LABELS: Record<string, string> = {
  'alpha-2': 'Alpha 2',
  'alpha-3': 'Alpha 3',
};

export interface ImprovementEntry {
  id: string;
  title: string;
  category: ImprovementCategory;
  release?: ImprovementRelease;
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
  'workflow-polish': 'Workflow & UI Polish',
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
      'src/domain/backupStatus.ts',
      'src/domain/syncAndExports.ts',
      'src/hooks/useBarnStore.ts',
      'src/App.tsx',
      'src/components/ImportExportHubScreen.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/backupStatus.ts',
        requiredSubstrings: ['evaluateBackupStatus', 'formatLocalDateTimeReadable', 'hasNonTestingBarnData'],
        rationale: 'Backup freshness evaluator and human-readable timestamp formatters must stay intact.',
      },
      {
        filePath: 'src/domain/syncAndExports.ts',
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
        requiredSubstrings: ['backupStatus', "onOpenImportExportHub('backup')"],
        rationale: 'Settings must surface live top-level backup warnings and route exports directly to Import / Export Hub.',
      },
    ],
    restorePlaybook: [
      'Restore `evaluateBackupStatus` and timestamp formatters in `src/domain/backupStatus.ts`.',
      'Ensure `exportBarnBackupJson` emits `exportedAtLocal`, `barnSummary`, and deterministically sorted animals in `src/domain/syncAndExports.ts`.',
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
      'src/domain/sampleData.ts',
      'src/domain/syncAndExports.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/SpeciesDashboardScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/syncAndExports.ts',
        requiredSubstrings: ['SpeciesBackupReason', 'buildSpeciesSafetyBackupFileName', 'exportSpeciesBackupJson'],
        rationale: 'Pre-removal species JSON exports require distinct timestamped filenames and reason metadata.',
      },
      {
        filePath: 'src/domain/sampleData.ts',
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
      'Ensure `buildSpeciesSafetyBackupFileName` and 3-arg `exportSpeciesBackupJson(..., { reason })` exist in `src/domain/syncAndExports.ts`.',
      'Keep `countSpeciesNonTestingRecords` and `purgeSpeciesNonTestingDataPure` in `src/domain/sampleData.ts`.',
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
      'src/domain/models.ts',
      'src/domain/barnAlerts.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/HomeSpeciesScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/models.ts',
        requiredSubstrings: ['pluralizeSpeciesLabel'],
        rationale: '`barnAlerts.ts` uses `pluralizeSpeciesLabel` to format arriving-offspring labels cleanly.',
      },
      {
        filePath: 'src/domain/barnAlerts.ts',
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
      'Export `pluralizeSpeciesLabel` from `src/domain/models.ts`.',
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
      'src/domain/models.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/HerdScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/models.ts',
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
      'Keep `applyAnimalNamePrefix` (and `applySpeciesNamePrefix` alias) in `src/domain/models.ts`.',
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
      'src/domain/speciesMigration.ts',
      'src/components/SpeciesMigrationModal.tsx',
      'src/components/HerdScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/hooks/useBarnStore.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/speciesMigration.ts',
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
      'src/domain/models.ts',
      'src/domain/importers/herdBossImporter.ts',
      'src/domain/syncAndExports.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/models.ts',
        requiredSubstrings: ["'Archived'", 'isAnimalActive', 'normalizeAnimalStatus'],
        rationale: 'Canonical Archived status and importer helpers must stay exported from `models.ts`.',
      },
      {
        filePath: 'src/domain/importers/herdBossImporter.ts',
        requiredSubstrings: ['rawArchivedFlag', 'rawActiveFlag'],
        rationale: 'CSV `Archived` / `Active` flags must map cleanly to `Archived` instead of collapsing into `Retired` or `Active`.',
      },
    ],
    restorePlaybook: [
      'Keep `Archived` in `AnimalStatus` and `ANIMAL_STATUSES` in `src/domain/models.ts`.',
      'Keep `isAnimalActive`, `isAnimalArchived`, and `normalizeAnimalStatus` aligned with `herdBossImporter.test.ts`.',
      'Separate `archivedFlag` and `activeFlag` lookup in `src/domain/importers/herdBossImporter.ts`.',
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
      'src/domain/pedigreeCalculator.ts',
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
        filePath: 'src/domain/pedigreeCalculator.ts',
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
      'Forward `activeCalls` inside `PedigreeIndex.inbreeding` in `src/domain/pedigreeCalculator.ts` and skip unnecessary COI precompute on `home`/`settings` in `src/hooks/useBarnStore.ts`.',
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
      'src/domain/dataHealthCheck.ts',
      'src/domain/supportBundle.ts',
      'src/storage/storageProtection.ts',
    ],
    invariants: [
      {
        filePath: 'src/main.tsx',
        requiredSubstrings: ['CrashErrorBoundary', 'installGlobalCrashHandlers'],
        rationale: 'Root mount must remain wrapped in `CrashErrorBoundary` with global handlers active.',
      },
      {
        filePath: 'src/domain/dataHealthCheck.ts',
        requiredSubstrings: ['analyzeBarnDataHealth', 'repairBarnDataHealth'],
        rationale: 'Health scan & self-repair logic protects against orphaned pointers or malformed rows.',
      },
      {
        filePath: 'src/domain/supportBundle.ts',
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
      'src/domain/syncOutbox.ts',
      'src/storage/localSyncChannels.ts',
      'src/domain/backupArchive.ts',
      'src/components/ImportExportHubScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/syncOutbox.ts',
        requiredSubstrings: ['diffEntityFieldsToOperations', 'mergeDeltaOperations'],
        rationale: 'Field-level sync outbox prevents whole-record overwrites across peer devices.',
      },
      {
        filePath: 'src/domain/backupArchive.ts',
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
      'src/domain/improvementRegistry.ts',
      'scripts/verify-improvements.ts',
      'IMPROVEMENTS.md',
      'src/components/DiagnosticsAndSupportPanel.tsx',
      'src/domain/__tests__/improvementRegistry.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/improvementRegistry.ts',
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
      'Prevents initial-load crashes and infinite loading hangs by keeping calendar auth initialization offline-safe (Firebase removed), wrapping SQLite JSON parsing in safe recovery helpers, isolating secondary startup promises with Promise.allSettled, running automatic startup health self-repair, falling back to rolling/starter snapshots on fatal DB load errors, and logging every corrective action via logDiagnosticEvent.',
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
        requiredSubstrings: ['initGoogleCalendarAuth', 'Corrective action:'],
        rationale: 'Calendar auth hooks must initialize cleanly offline without external Firebase dependencies before React mounts.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: ['Local Database Recovery Needed'],
        rationale: 'Render a non-blocking recovery UI if snapshot loading fails instead of trapping users on a loading skeleton.',
      },
    ],
    restorePlaybook: [
      'Ensure `normalizeRufusLevel` is imported from `../domain/models` in `src/hooks/useBarnStore.ts`.',
      'Keep offline-safe `initGoogleCalendarAuth()` in `src/utils/googleCalendarClient.ts` and `safeParseJson()` in `src/storage/webSqliteAdapter.ts`.',
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
      'src/domain/importers/universalPedigreeImporter.ts',
      'src/engine/codecs/archiveAndCsvUtils.ts',
      'src/domain/importers/registry.ts',
      'src/domain/pedigreeCalculator.ts',
      'src/domain/dataHealthCheck.ts',
      'src/components/ExternalImporterPanel.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/domain/__tests__/resilienceAndUniversalImport.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/importers/universalPedigreeImporter.ts',
        requiredSubstrings: ['UniversalPedigreeImporter', 'parseEvansHtmlEntry', 'MULTI_GEN_COLUMN_SPECS'],
        rationale: 'Universal importer handles Evans HTML, multi-generation spreadsheets, nested JSON, and unsupported binary warnings.',
      },
      {
        filePath: 'src/engine/codecs/archiveAndCsvUtils.ts',
        requiredSubstrings: ['decodeTextBytes', 'detectUnbommedUtf16', 'validateAndFormatYmd'],
        rationale: 'Handles UTF-16LE/BE, Windows-1252, Excel serial dates, and calendar validation without crashing.',
      },
      {
        filePath: 'src/domain/importers/registry.ts',
        requiredSubstrings: ['UniversalPedigreeImporter'],
        rationale: 'Registers the Universal Pedigree importer alongside HerdBoss.',
      },
      {
        filePath: 'src/domain/pedigreeCalculator.ts',
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
      'Restore `UniversalPedigreeImporter` and register it in `src/domain/importers/registry.ts`.',
      'Keep `decodeTextBytes` UTF-16/Windows-1252 decoding and `validateAndFormatYmd` in `src/engine/codecs/archiveAndCsvUtils.ts`.',
      'Preserve `visitedPath` cycle guard on `countDirectAncestors` in `src/domain/pedigreeCalculator.ts` and accessibility attributes across modal/form components.',
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
      'src/domain/animalConflicts.ts',
      'src/domain/dataHealthCheck.ts',
      'src/components/AnimalEditorModal.tsx',
      'src/components/BreedingScreen.tsx',
      'src/components/HerdScreen.tsx',
      'src/hooks/useBarnStore.ts',
      'src/App.tsx',
      'src/domain/__tests__/animalConflictsAndHealth.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/animalConflicts.ts',
        requiredSubstrings: [
          'findSameSexDuplicateTattooCollisions',
          'isOverrideConfirmationValid',
          'analyzeBarnAnimalConflicts',
        ],
        rationale: 'Core conflict detection, override confirmation, and summary logic must remain intact.',
      },
      {
        filePath: 'src/domain/dataHealthCheck.ts',
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
      'Keep `findSameSexDuplicateTattooCollisions`, `isOverrideConfirmationValid`, and `analyzeBarnAnimalConflicts` in `src/domain/animalConflicts.ts`.',
      'Preserve duplicate tattoo and parent sex mismatch checks in `src/domain/dataHealthCheck.ts`.',
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
      'src/domain/deviceCapability.ts',
      'src/storage/deviceCapabilityDetector.ts',
      'src/components/DeviceCapabilityCard.tsx',
      'src/components/HomeSpeciesScreen.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/components/ExternalImporterPanel.tsx',
      'src/App.tsx',
      'src/domain/__tests__/deviceCapability.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/deviceCapability.ts',
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
      'Preserve `DEVICE_CAPABILITY_TIERS`, `classifyDeviceCapability`, and `evaluateBarnWorkloadForTier` in `src/domain/deviceCapability.ts`.',
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
      'src/domain/backupVault.ts',
      'src/storage/opfsStorage.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/UnifiedBackupVaultPanel.tsx',
      'src/components/ArchivedHerdsModal.tsx',
      'src/components/WipedStorageRecoveryModal.tsx',
      'src/App.tsx',
      'src/domain/__tests__/backupVault.test.ts',
      'src/storage/__tests__/opfsStorage.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/backupVault.ts',
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
      'Keep `src/domain/backupVault.ts` pure TypeScript with schema v6 migration, SHA-256 verification, and `computePedigreeReferencedIds` stub preservation.',
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
      'src/domain/deviceCapability.ts',
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
        filePath: 'src/domain/deviceCapability.ts',
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
      'Keep `assessBrowserCompatibility` and `getHeavyZipExportGate` in `src/domain/deviceCapability.ts` and hook probes in `src/storage/deviceCapabilityDetector.ts`.',
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
      'src/domain/syncAndExports.ts',
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
          'subscribeOpenDialogCount',
          "o: { route: 'reports', label: 'Reports' }",
          "i: { route: 'importExport', label: 'Import / Export Hub' }",
          "s: { route: 'settings', label: 'Settings' }",
          'e.isComposing',
        ],
        rationale:
          'Root shell tracks open dialogs via subscribeOpenDialogCount (superseding rAF MutationObserver in IMP-052) and guards O/I/S/H/D/R/B/P/? shortcuts cleanly.',
      },
      {
        filePath: 'src/domain/syncAndExports.ts',
        requiredSubstrings: ['includeCleared: true,\n          includeLineage: true'],
        rationale: 'PDF snapshot DTO exports must include cleared and ancestral lineage carrier disclosures.',
      },
    ],
    restorePlaybook: [
      'Keep `src/utils/comboboxNav.ts` wired into `CarrierTraitCombobox.tsx`, `SearchableParentPicker.tsx`, and `ExternalImporterPanel.tsx` with `aria-activedescendant` and `onBlur`.',
      'Keep `subscribeOpenDialogCount` dialog tracking, IME/widget guards, and `O`/`S` shortcuts in `src/App.tsx` synced with `SettingsAndSyncScreen.tsx`.',
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
      'src/domain/pedigreeCalculator.ts',
      'src/domain/upgradeGate.ts',
      'src/domain/backupVault.ts',
      'src/components/PedigreeScreen.tsx',
      'src/storage/pwaUpdateManager.ts',
      'src/storage/storageProtection.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/App.tsx',
      'public/version.json',
      'public/status.json',
      'vite.config.ts',
      'src/domain/__tests__/upgradeGate.test.ts',
      'src/domain/__tests__/pedigreeCalculator.test.ts',
      'src/storage/__tests__/es2018AndPwaUpdate.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/pedigreeCalculator.ts',
        requiredSubstrings: ['buildPedigreeBranchViewport', 'getGen3BranchesWithKnownAncestors'],
        rationale: 'Pure branch viewport helper keeps initial 4–6 gen DOM compact while preserving full-depth export slots.',
      },
      {
        filePath: 'src/components/PedigreeScreen.tsx',
        requiredSubstrings: ['expandedGen3Branches', 'buildPedigreeBranchViewport'],
        rationale: 'Interactive pedigree chart must lazy-expand Gen 4+ branches on demand without losing focus or keyboard access.',
      },
      {
        filePath: 'src/domain/upgradeGate.ts',
        requiredSubstrings: ['evaluateUpgradeGate', 'parseVersionManifestJson', 'parseStatusManifestJson'],
        rationale: 'Pure pre-flight Upgrade Gate evaluates revoked builds, paused updates, Safe-Harbor schema floors, and schemaDelta>=2 backup gates.',
      },
      {
        filePath: 'src/domain/backupVault.ts',
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
      'Keep `buildPedigreeBranchViewport`, `getGen3BranchIndex`, and `getGen3BranchesWithKnownAncestors` in `src/domain/pedigreeCalculator.ts` wired into `PedigreeScreen.tsx`.',
      'Preserve `src/domain/upgradeGate.ts`, `buildVerifiedPreUpgradeJsonBackup` / `verifyPreUpgradeJsonBackup` in `src/domain/backupVault.ts`, and uncached `public/version.json` & `public/status.json` with `no-store` middleware + Workbox denylist in `vite.config.ts`.',
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
      'src/domain/photoMaintenance.ts',
      'src/domain/archiveInspector.ts',
      'src/domain/encryptedExport.ts',
      'src/domain/syncOutbox.ts',
      'src/domain/calendarExport.ts',
      'src/domain/models.ts',
      'src/domain/inputSanitization.ts',
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
      'src/domain/__tests__/stageBResilience.test.ts',
      'src/storage/__tests__/passphraseAndClockSkew.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/photoMaintenance.ts',
        requiredSubstrings: [
          'analyzePhotoStorageFootprintPure',
          'removeOrphanPhotosFromSnapshotPure',
          'pruneFullResPayloadsFromSnapshotPure',
        ],
        rationale: 'Pure photo storage footprint analyzer, orphan cleaner, and thumbnail compactor must stay DOM-free.',
      },
      {
        filePath: 'src/domain/archiveInspector.ts',
        requiredSubstrings: [
          'inspectSnapshotBeforeRestorePure',
          'inspectParsedArchiveBeforeRestorePure',
        ],
        rationale: 'Dry-run pre-restore inspector summarizes species, conflicts, and replace/merge impact before DB writes.',
      },
      {
        filePath: 'src/domain/encryptedExport.ts',
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
        filePath: 'src/domain/syncOutbox.ts',
        requiredSubstrings: ['compareSameEntitySyncOperations', 'bumpRecordRevision'],
        rationale: 'Monotonic record_rev ensures newer same-entity edits win even when a device clock rewinds.',
      },
      {
        filePath: 'src/domain/calendarExport.ts',
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
      'Keep pure modules `src/domain/photoMaintenance.ts`, `src/domain/archiveInspector.ts`, `src/domain/encryptedExport.ts`, `_rev` logic in `src/domain/syncOutbox.ts`, and `buildDeterministicGoogleCalendarEventId` in `src/domain/calendarExport.ts`.',
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
      'src/domain/barnAlerts.ts',
      'src/domain/__tests__/barnAlerts.test.ts',
      'src/components/HomeSpeciesScreen.tsx',
      'src/components/HerdScreen.tsx',
      'src/components/AnimalEditorModal.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/App.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/barnAlerts.ts',
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
      'Keep pure withdrawal functions (`buildWithdrawalByAnimalMap`, `evaluateAnimalActiveWithdrawal`, `evaluateSpeciesActiveWithdrawalsAlert`, `evaluateWithdrawalDispositionWarning`, `evaluateShowWithdrawalConflicts`) in `src/domain/barnAlerts.ts`.',
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
      'src/domain/syncOutbox.ts',
      'src/domain/speciesMigration.ts',
      'src/domain/backupArchive.ts',
      'src/domain/syncAndExports.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/AnimalPhotoGallery.tsx',
      'src/components/HerdScreen.tsx',
      'src/domain/__tests__/stageBResilience.test.ts',
      'src/storage/__tests__/crossTabLockAndReload.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/syncOutbox.ts',
        requiredSubstrings: ['stripPhotoBlobsForSync', 'diffSnapshotsToSyncOperations'],
        rationale:
          'Sync outbox must strip binary blobs on photo creates and support snapshot diffing for bulk migrations.',
      },
      {
        filePath: 'src/domain/speciesMigration.ts',
        requiredSubstrings: ['bumpRecordRevision'],
        rationale:
          'Cross-species migration must advance `_rev` counters on every migrated or created record.',
      },
      {
        filePath: 'src/domain/backupArchive.ts',
        requiredSubstrings: ['existingHasBlob', 'incHasBlob'],
        rationale:
          'Photos-Only ZIP merge must hydrate blobs onto metadata-only photo placeholders without overwriting newer metadata.',
      },
      {
        filePath: 'src/domain/syncAndExports.ts',
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
      'Keep `stripPhotoBlobsForSync`, `diffSnapshotsToSyncOperations`, and metadata-only `photo` `__create__` handling in `src/domain/syncOutbox.ts`.',
      'Keep `bumpRecordRevision` calls in `src/domain/speciesMigration.ts` and blob-preserving merge helpers in `src/domain/backupArchive.ts` and `src/domain/syncAndExports.ts`.',
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
      'src/domain/upgradeGate.ts',
      'src/storage/pwaUpdateManager.ts',
      'src/components/ImportExportHubScreen.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/storage/__tests__/passphraseAndClockSkew.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/upgradeGate.ts',
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
    ],
    restorePlaybook: [
      'Keep `nowEpochMs` default inside `computeHttpDateClockSkewMs` in `src/domain/upgradeGate.ts`.',
      'Keep `recordServerDateHeaderSkew` and `getAdjustedNowIsoUtc` in `src/storage/pwaUpdateManager.ts`.',
      'Keep `archiveExportLock = useAsyncSubmitLock()` wrapping all 4 export handlers in `src/components/ImportExportHubScreen.tsx`, plus `getAdjustedNowMs()` for `pausedAtMs`.',
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
      'src/domain/pedigreeCalculator.ts',
      'src/domain/__tests__/pedigreeCalculator.test.ts',
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
        filePath: 'src/domain/pedigreeCalculator.ts',
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
      'src/domain/barnAlerts.ts',
      'src/domain/barnBinder.ts',
      'src/domain/__tests__/barnAlerts.test.ts',
      'src/hooks/useBarnStore.ts',
      'src/App.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/components/AnimalEditorModal.tsx',
      'src/components/HomeSpeciesScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/barnAlerts.ts',
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
        filePath: 'src/domain/barnBinder.ts',
        requiredSubstrings: ['(over capacity)'],
        rationale:
          'Printable Barn Binder cage table must show occupancy/capacity ratios and over-capacity markers.',
      },
    ],
    restorePlaybook: [
      'Keep pure cage occupancy & assignment warning evaluators in `src/domain/barnAlerts.ts` and tests in `src/domain/__tests__/barnAlerts.test.ts`.',
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
      'src/domain/models.ts',
      'src/domain/taskMaster.ts',
      'src/domain/__tests__/taskMaster.test.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/domain/syncAndExports.ts',
      'src/domain/syncOutbox.ts',
      'src/hooks/useBarnStore.ts',
      'src/App.tsx',
      'src/components/SpeciesEditorModal.tsx',
      'src/components/BreedingScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/models.ts',
        requiredSubstrings: [
          'BreedScheduleOverride',
          'normalizeBreedScheduleOverrides',
          'breedOverrides',
        ],
        rationale:
          'SpeciesProfile must carry optional BreedScheduleOverride entries normalized deterministically in pure TypeScript.',
      },
      {
        filePath: 'src/domain/taskMaster.ts',
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
      'Keep BreedScheduleOverride & normalizeBreedScheduleOverrides in `src/domain/models.ts` and pure helpers in `src/domain/taskMaster.ts` with tests in `src/domain/__tests__/taskMaster.test.ts`.',
      'Keep `breed_overrides_json` persisted in `src/storage/webSqliteAdapter.ts` and normalized in `src/domain/syncAndExports.ts` and `src/domain/syncOutbox.ts`.',
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
      'src/domain/exporters/exporterTypes.ts',
      'src/domain/exporters/registry.ts',
      'src/domain/__tests__/exportersRegistry.test.ts',
      'src/components/ImportExportHubScreen.tsx',
      'src/hooks/useBarnStore.ts',
      'src/App.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/components/HomeSpeciesScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/exporters/exporterTypes.ts',
        requiredSubstrings: ['ExternalExporterDescriptor', 'ExportedArtifactPayload'],
        rationale: 'Pure TypeScript exporter interface contracts must remain DOM-free for cross-platform reuse.',
      },
      {
        filePath: 'src/domain/exporters/registry.ts',
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
      'Restore `src/domain/exporters/exporterTypes.ts`, `src/domain/exporters/registry.ts`, and `src/domain/__tests__/exportersRegistry.test.ts`.',
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
      'src/domain/importers/importerTypes.ts',
      'src/domain/importers/csvStarterTemplate.ts',
      'src/domain/importers/csvColumnMapper.ts',
      'src/domain/importers/universalPedigreeImporter.ts',
      'src/components/ExternalImporterPanel.tsx',
      'src/domain/__tests__/resilienceAndUniversalImport.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/importers/csvStarterTemplate.ts',
        requiredSubstrings: ['buildStarterCsvTemplate', 'STARTER_CSV_TEMPLATE_HEADERS'],
        rationale: 'Pure TS starter CSV template generator must remain DOM-free with standard pedigree headers.',
      },
      {
        filePath: 'src/domain/importers/csvColumnMapper.ts',
        requiredSubstrings: ['CSV_TARGET_FIELD_OPTIONS', 'resolveCsvColumnAssignments', 'makeCsvColumnOverrideKey'],
        rationale: 'Pure TS column mapper must resolve aliases, sample cells, and user overrides cleanly.',
      },
      {
        filePath: 'src/domain/importers/universalPedigreeImporter.ts',
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
      'Restore `src/domain/importers/csvStarterTemplate.ts` and `src/domain/importers/csvColumnMapper.ts` and keep `CsvTableMappingSummary`/`UnresolvedParentLink` in `src/domain/importers/importerTypes.ts`.',
      'Keep two-pass CSV resolution and `csvColumnMapping`/`unresolvedParentLinks` wiring in `src/domain/importers/universalPedigreeImporter.ts`.',
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
      'src/domain/syncAndExports.ts',
      'src/domain/backupArchive.ts',
      'src/utils/webFileActions.ts',
      'src/storage/archiveAndImport.worker.ts',
      'src/storage/offThreadWorkerClient.ts',
      'src/components/ImportExportHubScreen.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/hooks/useBarnStore.ts',
      'src/storage/__tests__/opfsStorage.test.ts',
      'src/storage/__tests__/photoHydrationAndWorker.test.ts',
      'src/domain/__tests__/syncAndExports.test.ts',
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
        filePath: 'src/domain/syncAndExports.ts',
        requiredSubstrings: ['generateBarnBackupJsonChunks'],
        rationale: 'Pure TypeScript backup JSON chunk generator prevents allocating monolithic strings for photo-heavy backups.',
      },
      {
        filePath: 'src/domain/backupArchive.ts',
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
      'Keep `generateBarnBackupJsonChunks` in `src/domain/syncAndExports.ts` and `streamCompleteBackupZipArchive` / `streamPhotosOnlyZipArchive` in `src/domain/backupArchive.ts`.',
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
      'src/domain/techyStuffGuardrails.ts',
      'src/domain/__tests__/techyStuffGuardrails.test.ts',
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
        filePath: 'src/domain/techyStuffGuardrails.ts',
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
      'Restore `src/domain/techyStuffGuardrails.ts` and `verifyStorageQuotaForDiagnosticAction` in `src/storage/storageProtection.ts`.',
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
      'src/domain/barnBench.ts',
      'src/domain/__tests__/barnBench.test.ts',
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
        filePath: 'src/domain/barnBench.ts',
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
      'Restore `src/domain/barnBench.ts` and `src/domain/__tests__/barnBench.test.ts`.',
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
      'src/domain/batchPrint.ts',
      'src/domain/__tests__/batchPrint.test.ts',
      'src/hooks/useBarnStore.ts',
      'src/App.tsx',
      'src/components/PrintPreviewModal.tsx',
      'src/components/HerdScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/batchPrint.ts',
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
      'Restore `src/domain/batchPrint.ts` and `src/domain/__tests__/batchPrint.test.ts`.',
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
      'src/domain/qrCode.ts',
      'src/domain/facilityBoard.ts',
      'src/domain/models.ts',
      'src/domain/batchPrint.ts',
      'src/domain/syncAndExports.ts',
      'src/domain/__tests__/qrCode.test.ts',
      'src/domain/__tests__/facilityBoard.test.ts',
      'src/domain/__tests__/batchPrint.test.ts',
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
        filePath: 'src/domain/qrCode.ts',
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
        filePath: 'src/domain/facilityBoard.ts',
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
        filePath: 'src/domain/batchPrint.ts',
        requiredSubstrings: ['includeQrCodes', 'supportsQrCode', 'buildAnimalProfileDeepLink'],
        rationale:
          '8-up batch cage cards must support scannable QR profile codes via includeQrCodes.',
      },
      {
        filePath: 'src/domain/syncAndExports.ts',
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
      'Restore `src/domain/qrCode.ts`, `src/domain/facilityBoard.ts`, and their tests in `src/domain/__tests__/qrCode.test.ts` and `src/domain/__tests__/facilityBoard.test.ts`.',
      'Keep extended `CageLocation` fields in `src/domain/models.ts`, SQLite columns/migrations in `src/storage/webSqliteAdapter.ts`, and JSON round-trip parsing in `src/domain/syncAndExports.ts`.',
      'Keep QR code rendering in `src/domain/syncAndExports.ts` (`generateThermalCageCardHtml`) and `src/domain/batchPrint.ts` (`includeQrCodes`) wired to `PrintPreviewModal.tsx`, `HerdScreen.tsx`, and `SpeciesDashboardScreen.tsx`.',
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
      'src/domain/pairingMatrix.ts',
      'src/domain/__tests__/pairingMatrix.test.ts',
      'src/components/PairingComparisonMatrix.tsx',
      'src/components/BreedingScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/pairingMatrix.ts',
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
      'Restore `src/domain/pairingMatrix.ts` and its unit tests in `src/domain/__tests__/pairingMatrix.test.ts`.',
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
      'src/domain/geneticsEngine.ts',
      'src/domain/pedigreeAnalysis.ts',
      'src/domain/__tests__/pedigreeAnalysis.test.ts',
      'src/components/ColoredGenotypeDisplay.tsx',
      'src/components/PedigreeScreen.tsx',
      'src/components/HerdScreen.tsx',
      'src/components/BreedingScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/geneticsEngine.ts',
        requiredSubstrings: [
          'analyzeAlleleProvenance',
          'AlleleProvenanceSource',
          'AnimalAlleleProvenanceResult',
        ],
        rationale:
          'Pure TS allele provenance classifier must support Mendelian elimination, offspring inference, X-linked loci, and custom species isolation without DOM dependencies.',
      },
      {
        filePath: 'src/domain/pedigreeAnalysis.ts',
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
      'Keep `analyzeAlleleProvenance` in `src/domain/geneticsEngine.ts` and `src/domain/pedigreeAnalysis.ts` with unit tests in `src/domain/__tests__/pedigreeAnalysis.test.ts`.',
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
      'src/domain/models.ts',
      'src/domain/syncAndExports.ts',
      'src/domain/pdfExporter.ts',
      'src/domain/__tests__/pdfExporter.test.ts',
      'src/utils/webPdfActions.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/components/PrintPreviewModal.tsx',
      'src/components/PedigreeScreen.tsx',
      'src/components/HerdScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/models.ts',
        requiredSubstrings: [
          'breederLogoDataUrl',
          'formatWeightArbaLbsOzDot',
          'formatPedigreeWeight',
        ],
        rationale:
          'BarnSettings must persist optional breederLogoDataUrl and models.ts must expose pure ARBA lbs.oz dot notation formatters.',
      },
      {
        filePath: 'src/domain/syncAndExports.ts',
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
        filePath: 'src/domain/pdfExporter.ts',
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
      'Keep `breederLogoDataUrl`, `formatWeightArbaLbsOzDot`, and `formatPedigreeWeight` in `src/domain/models.ts` and `webSqliteAdapter.ts` extra_settings_json.',
      'Restore `src/domain/pdfExporter.ts`, `src/utils/webPdfActions.ts`, and `src/domain/__tests__/pdfExporter.test.ts`.',
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
      'src/domain/models.ts',
      'src/domain/pedigreeCalculator.ts',
      'src/domain/pedigreePrintStyles.ts',
      'src/domain/shareablePedigreeCard.ts',
      'src/domain/syncAndExports.ts',
      'src/domain/pdfExporter.ts',
      'src/domain/exporters/exporterTypes.ts',
      'src/domain/exporters/registry.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/PrintPreviewModal.tsx',
      'src/components/PedigreeScreen.tsx',
      'src/components/HerdScreen.tsx',
      'src/components/ImportExportHubScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/models.ts',
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
        filePath: 'src/domain/pedigreePrintStyles.ts',
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
        filePath: 'src/domain/shareablePedigreeCard.ts',
        requiredSubstrings: [
          'generateShareablePedigreeCardHtml',
          'buildShareablePedigreeCardFileName',
          'ShareablePedigreeCardOptions',
        ],
        rationale:
          'Pure TS shareable HTML pedigree card generator must render zero-DOM self-contained cards with collapsible Gen 4–8 ancestry.',
      },
      {
        filePath: 'src/domain/exporters/registry.ts',
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
      'Keep `PedigreeGenerationDepth` (`3..8`) and normalizers in `src/domain/models.ts` plus Gen 7–8 `slotRoleLabel`/`buildPedigreeSlots` in `src/domain/pedigreeCalculator.ts`.',
      'Restore `src/domain/pedigreePrintStyles.ts`, `src/domain/shareablePedigreeCard.ts`, multi-page 7–8G sheets in `src/domain/pdfExporter.ts`, and `shareable-pedigree-card` in `src/domain/exporters/registry.ts`.',
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
      'src/domain/models.ts',
      'src/domain/showResults.ts',
      'src/domain/__tests__/showResults.test.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/domain/reportGenerators.ts',
      'src/domain/barnBinder.ts',
      'src/domain/syncAndExports.ts',
      'src/domain/pdfExporter.ts',
      'src/domain/shareablePedigreeCard.ts',
      'src/domain/exporters/registry.ts',
      'src/domain/speciesMigration.ts',
      'src/domain/syncOutbox.ts',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/components/PedigreeScreen.tsx',
      'src/components/HerdScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/models.ts',
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
        filePath: 'src/domain/showResults.ts',
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
        filePath: 'src/domain/reportGenerators.ts',
        requiredSubstrings: ['computeAnimalShowSummary', 'gcProgress', 'showWins', 'showPoints'],
        rationale:
          'Male/Female reports must aggregate show wins, points, combined legs, and Grand Champion progress automatically.',
      },
      {
        filePath: 'src/domain/barnBinder.ts',
        requiredSubstrings: ['computeAnimalShowSummary', 'Show Legs / GC Progress'],
        rationale:
          'Barn Binder must include structured show placements, judge notes, E-Leg cert numbers, and E-Leg photo thumbnails.',
      },
      {
        filePath: 'src/domain/syncAndExports.ts',
        requiredSubstrings: ['computeAnimalShowSummary', 'gcProgress.shortLabel'],
        rationale:
          'Evans .HTM pedigrees and JSON backups must carry structured ShowEvent.results and display show honors.',
      },
      {
        filePath: 'src/domain/pdfExporter.ts',
        requiredSubstrings: ['computeAnimalShowSummary', 'gcProgress.shortLabel'],
        rationale:
          'Offline PDF 1.4 pedigrees must render show legs/GC status, awards, points, and ancestor honors.',
      },
      {
        filePath: 'src/domain/shareablePedigreeCard.ts',
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
      'Keep ShowAwardCode, SHOW_AWARD_OPTIONS, ShowELegAttachment, ShowAnimalResult, and ShowEvent.results in `src/domain/models.ts` plus `src/domain/showResults.ts` and `src/domain/__tests__/showResults.test.ts`.',
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
      'src/domain/geneticsEngine.ts',
      'src/domain/__tests__/geneticsEngine.test.ts',
      'src/components/CoatExplorerSandbox.tsx',
      'src/components/BreedingScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/geneticsEngine.ts',
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
      'Keep `SingleGenotypeEvaluation`, `evaluateSingleGenotypeSandbox`, and `buildSandboxHypotheticalAnimal` in `src/domain/geneticsEngine.ts` with tests in `src/domain/__tests__/geneticsEngine.test.ts`.',
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
      'src/domain/models.ts',
      'src/domain/growthAnalytics.ts',
      'src/domain/__tests__/growthAnalytics.test.ts',
      'src/domain/syncAndExports.ts',
      'src/domain/reportCatalog.ts',
      'src/domain/reportGenerators.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/GrowthAndSurvivalLab.tsx',
      'src/components/BreedingScreen.tsx',
      'src/components/HerdScreen.tsx',
      'src/App.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/models.ts',
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
        filePath: 'src/domain/growthAnalytics.ts',
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
        filePath: 'src/domain/reportGenerators.ts',
        requiredSubstrings: ['litter-survival-performance-report', 'evaluateLitterSurvivalAndMilestones'],
        rationale:
          'Reports catalog and generator must expose Litter Survival & Parent Performance Report.',
      },
    ],
    restorePlaybook: [
      'Keep `TargetWeightPoint`, `normalizeTargetWeightCurve`, `LitterWeightMilestone`, and `normalizeLitterWeightMilestones` in `src/domain/models.ts` plus `target_weight_curve_json` & `litter_weight_milestones_json` in `src/storage/webSqliteAdapter.ts` and `src/domain/syncAndExports.ts`.',
      'Restore `src/domain/growthAnalytics.ts` and `src/domain/__tests__/growthAnalytics.test.ts`.',
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
      'src/domain/models.ts',
      'src/domain/feedInventory.ts',
      'src/domain/feedManufacturerDirectory.ts',
      'src/domain/__tests__/feedInventory.test.ts',
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
        filePath: 'src/domain/models.ts',
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
        filePath: 'src/domain/feedInventory.ts',
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
        filePath: 'src/domain/feedManufacturerDirectory.ts',
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
      'Keep `FeedBatch`, `FeedAllocation`, `FEED_PURGE_WINDOW_OPTIONS`, and `normalizeFeedPurgeWindowDays` in `src/domain/models.ts` plus SQLite tables in `src/storage/webSqliteAdapter.ts`.',
      'Restore `src/domain/feedInventory.ts`, `src/domain/feedManufacturerDirectory.ts`, `src/domain/__tests__/feedInventory.test.ts`, and `src/storage/feedTagOcr.ts`.',
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
      'src/domain/importers/pdfScanExtractor.ts',
      'src/domain/importers/pedigreeOcrParser.ts',
      'src/domain/__tests__/pedigreeOcrParser.test.ts',
      'src/storage/pedigreeOcrScanner.ts',
      'src/components/PedigreeOcrScannerPanel.tsx',
      'src/components/ExternalImporterPanel.tsx',
      'src/components/ImportExportHubScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/importers/pdfScanExtractor.ts',
        requiredSubstrings: [
          'extractPedigreePdfPages',
          'MAX_PDF_SCAN_BYTES',
          'MAX_PDF_SCAN_PAGES',
        ],
        rationale:
          'Pure TS offline PDF vector text (`BT...ET`) and embedded `/DCTDecode` JPEG extractor must remain zero-DOM.',
      },
      {
        filePath: 'src/domain/importers/pedigreeOcrParser.ts',
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
      'Restore pure parsers `src/domain/importers/pdfScanExtractor.ts`, `src/domain/importers/pedigreeOcrParser.ts`, and `src/domain/__tests__/pedigreeOcrParser.test.ts`.',
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
      'src/domain/models.ts',
      'src/domain/economicsLedger.ts',
      'src/domain/__tests__/economicsLedger.test.ts',
      'src/domain/reportCatalog.ts',
      'src/domain/reportGenerators.ts',
      'src/domain/syncOutbox.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/EconomicsLedgerScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/App.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/models.ts',
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
        filePath: 'src/domain/economicsLedger.ts',
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
      'Keep `LedgerEntry`, `ProcessingLog`, and `YouthProjectBook` interfaces and normalizers in `src/domain/models.ts` plus SQLite v4 tables in `src/storage/webSqliteAdapter.ts`.',
      'Restore `src/domain/economicsLedger.ts` and `src/domain/__tests__/economicsLedger.test.ts` along with the 3 financial/production/youth presets in `reportCatalog.ts` and `reportGenerators.ts`.',
      'Keep store CRUD mutations in `src/hooks/useBarnStore.ts` and wire `EconomicsLedgerScreen.tsx` into `SpeciesDashboardScreen.tsx` and `App.tsx`.',
    ],
  },
  {
    id: 'IMP-047',
    title: 'Post-Crash Alignment, Ready External Exporters, Feed/Archive Parity & Android WebView Print/Share',
    category: 'stability-pwa',
    source: 'session',
    summary:
      'Enforces the React PWA preservation rule in `AGENTS.md` and `prompts/master_system_prompt.md`; aligns PWA/Android versions to `0.1.0-alpha.2`; migrates `feedBatches` and `feedAllocations` during cross-species moves; surfaces v3/v4 feed, ledger, processing, and 4-H/FFA counts in `archiveInspector.ts`; implements `herdboss-transfer-bundle` (.ZIP) and `registry-worksheet-csv` (.CSV) as ready exporters; and fixes `@media print` extraction, accent-ink preservation, native wrapper Share .HTM enablement, and Android `PrintBridge.kt` offscreen HTML + landscape/portrait printing while removing the stale `PedigreePrintNotice` banner.',
    userIntent:
      'Realign the entire codebase after build-crash drift, keep the PWA locked to React + Vite + TypeScript, complete half-done exporters and migration/inspector coverage, and make pedigree/binder print & share work seamlessly on desktop, mobile web, and the Android WebView APK.',
    files: [
      'AGENTS.md',
      '.env.example',
      'package.json',
      'public/version.json',
      'src/domain/upgradeGate.ts',
      'src/domain/speciesMigration.ts',
      'src/domain/archiveInspector.ts',
      'src/domain/exporters/exporterTypes.ts',
      'src/domain/exporters/registry.ts',
      'src/native/pedigreeBridge.ts',
      'src/components/PrintPreviewModal.tsx',
      'src/components/ImportExportHubScreen.tsx',
      'src/index.css',
      'android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/MainActivity.kt',
      'android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/PrintBridge.kt',
      '.github/structure.txt',
    ],
    invariants: [
      {
        filePath: 'AGENTS.md',
        requiredSubstrings: ['Never Convert PWA Away From React'],
        rationale: 'Workspace agent rules must lock the PWA against non-React rewrites.',
      },
      {
        filePath: 'src/domain/speciesMigration.ts',
        requiredSubstrings: ['feedBatchesMigrated', 'feedAllocationsMigrated'],
        rationale: 'Cross-species migrations must move linked feedBatches and feedAllocations.',
      },
      {
        filePath: 'src/domain/archiveInspector.ts',
        requiredSubstrings: [
          'feedBatchCount',
          'feedAllocationCount',
          'ledgerEntryCount',
          'processingLogCount',
          'youthProjectBookCount',
        ],
        rationale: 'Pre-restore dry-run inspection must count v3/v4 feed, ledger, processing, and youth records.',
      },
      {
        filePath: 'src/domain/exporters/registry.ts',
        requiredSubstrings: ['herdboss-transfer-bundle', 'registry-worksheet-csv', 'binaryContent'],
        rationale: 'HerdBoss Transfer Tables (.ZIP) and Breed Registry & Show Worksheets (.CSV) must stay active ready exporters.',
      },
      {
        filePath: 'src/components/PrintPreviewModal.tsx',
        requiredSubstrings: [
          'canShareHtmlDocument',
          'extractScopedPrintCssFromRules',
          'detectDocumentPrintOrientation',
        ],
        rationale: 'PrintPreviewModal must enable Share .HTM on native wrappers, extract @media print rules, and forward orientation/HTML to native print.',
      },
      {
        filePath: 'android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/PrintBridge.kt',
        requiredSubstrings: ['printFromBridge', 'printHtmlDocument', 'buildPrintAttributes'],
        rationale: 'Android PrintBridge must render self-contained HTML in a hardened offscreen WebView with landscape/portrait PrintAttributes.',
      },
    ],
    restorePlaybook: [
      'Verify `AGENTS.md` and `prompts/master_system_prompt.md` keep the React PWA lock rule intact.',
      'Ensure `package.json`, `public/version.json`, and `src/domain/upgradeGate.ts` match `android-wrapper/app/build.gradle.kts` (`0.1.0-alpha.2`).',
      'Keep `herdboss-transfer-bundle` and `registry-worksheet-csv` in `src/domain/exporters/registry.ts` with `binaryContent` download dispatch in `ImportExportHubScreen.tsx`.',
      'Keep `@media print` extraction, native Share .HTM support, and Android `PrintBridge.kt` offscreen HTML rendering intact and do not reintroduce `PedigreePrintNotice`.',
    ],
  },
  {
    id: 'IMP-048',
    title: 'Hybrid Architecture Guardrails & React-Only Core PWA Lock',
    category: 'ci-tooling',
    source: 'session',
    userIntent:
      'Prevent AI Studio, GitHub import triage, or contributors from misinterpreting the hybrid Kotlin Android WebView wrapper (`android-wrapper/`) as a signal to rewrite the core React PWA into Kotlin.',
    summary:
      'Documents and enforces across `AGENTS.md`, `README.md`, `ARCHITECTURE.md`, `metadata.json`, `package.json`, `index.html`, `.github/structure.txt`, `.github/workflows/build-android-apk.yml`, and `android-wrapper/` (`README.md`, Gradle build files, `MainActivity.kt`) that the core PWA (`/src/`) MUST always stay React + Vite + TypeScript while `android-wrapper/` is strictly a thin hybrid WebView shell.',
    files: [
      'AGENTS.md',
      'README.md',
      'ARCHITECTURE.md',
      'metadata.json',
      'package.json',
      'index.html',
      'android-wrapper/README.md',
      'android-wrapper/build.gradle.kts',
      'android-wrapper/settings.gradle.kts',
      'android-wrapper/app/build.gradle.kts',
      'android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/MainActivity.kt',
      '.github/structure.txt',
      '.github/workflows/build-android-apk.yml',
    ],
    invariants: [
      {
        filePath: 'AGENTS.md',
        requiredSubstrings: [
          'Core PWA MUST Always Stay in React',
          'NEVER recode the site in Kotlin',
        ],
        rationale:
          'AGENTS.md must explicitly define the hybrid wrapper boundary and forbid Kotlin rewrites during bootability recovery.',
      },
      {
        filePath: 'README.md',
        requiredSubstrings: [
          'Core PWA MUST Always Stay in React',
          'Never Recode the PWA in Kotlin',
        ],
        rationale:
          'Root README must immediately clarify the React + Vite + TypeScript core PWA vs thin android-wrapper/ split.',
      },
      {
        filePath: 'ARCHITECTURE.md',
        requiredSubstrings: [
          'Critical Hybrid Architecture Boundary',
          'Never Convert PWA Away From React',
        ],
        rationale:
          'ARCHITECTURE.md must define the thin Kotlin WebView shell vs mandatory React PWA architecture.',
      },
      {
        filePath: 'metadata.json',
        requiredSubstrings: [
          'React + Vite + TypeScript offline-first PWA',
          'thin hybrid Kotlin WebView shell',
        ],
        rationale:
          'AI Studio metadata.json must state that the core app is a React + Vite + TypeScript PWA.',
      },
      {
        filePath: 'package.json',
        requiredSubstrings: ['React + Vite + TypeScript offline-first PWA'],
        rationale:
          'package.json description must identify the React + Vite + TypeScript PWA stack and thin hybrid wrapper.',
      },
      {
        filePath: 'index.html',
        requiredSubstrings: ['NEVER CONVERT THIS PWA AWAY FROM REACT'],
        rationale:
          'HTML entry point must carry an explicit guard comment against converting the PWA into Kotlin.',
      },
      {
        filePath: 'android-wrapper/README.md',
        requiredSubstrings: [
          'Thin Hybrid Shell ONLY',
          'NEVER convert, rewrite, or recode the core PWA into Kotlin',
        ],
        rationale:
          'android-wrapper/ must explicitly warn readers that it is only a thin WebView container.',
      },
      {
        filePath: 'android-wrapper/app/build.gradle.kts',
        requiredSubstrings: ['CRITICAL HYBRID BOUNDARY'],
        rationale:
          'Android Gradle config must mark itself as a thin WebView shell packaging the React PWA.',
      },
    ],
    restorePlaybook: [
      'Ensure `AGENTS.md`, `README.md`, `ARCHITECTURE.md`, `metadata.json`, `package.json`, and `index.html` explicitly lock the core PWA to React + Vite + TypeScript.',
      'Keep `android-wrapper/README.md` and the `CRITICAL HYBRID BOUNDARY` headers in `android-wrapper/build.gradle.kts`, `settings.gradle.kts`, `app/build.gradle.kts`, and `MainActivity.kt`.',
    ],
  },
  {
    id: 'IMP-049',
    title: 'Client CRM, Buyer Waitlist, Reservations & Deposit Reminders',
    category: 'species-ux',
    source: 'session',
    summary:
      'Adds species-isolated local-first breeder CRM tracking buyer contacts (`ClientContact`), ranked waitlist inquiries (`WaitlistEntry`) with live unreserved animal/pairing match scoring (`findWaitlistMatches`), animal/litter-pick reservations (`AnimalReservation`) with sequential agreement numbering and deposit/balance progress (`evaluateReservationFinancials`), automated overdue/due/upcoming follow-up reminders (`evaluateCrmFollowUpReminders`) with 1-click Master Task creation, XSS-safe printable Sales Agreements with optional breeder logo and active withdrawal disclosures (`generateSalesAgreementHtml`), SQLite v5 persistence, sync outbox deltas, 2 CRM report presets, and `ClientCrmScreen.tsx` accessible from Species Dashboard & `C` shortcut.',
    userIntent:
      'Track buyer contacts, waitlist queues, animal/litter reservations, deposit due reminders, and printable sales agreements offline without cloud dependencies.',
    files: [
      'src/domain/models.ts',
      'src/domain/clientCrm.ts',
      'src/domain/__tests__/clientCrm.test.ts',
      'src/domain/reportCatalog.ts',
      'src/domain/reportGenerators.ts',
      'src/domain/syncOutbox.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/ClientCrmScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/App.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/models.ts',
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
        filePath: 'src/domain/clientCrm.ts',
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
      'Keep `ClientContact`, `WaitlistEntry`, and `AnimalReservation` interfaces and normalizers in `src/domain/models.ts` plus SQLite v5 tables in `src/storage/webSqliteAdapter.ts`.',
      'Restore `src/domain/clientCrm.ts` and `src/domain/__tests__/clientCrm.test.ts` along with the 2 CRM presets in `reportCatalog.ts` and `reportGenerators.ts`.',
      'Keep CRM mutations in `src/hooks/useBarnStore.ts` and wire `ClientCrmScreen.tsx` into `SpeciesDashboardScreen.tsx` and `App.tsx`.',
    ],
  },
  {
    id: 'IMP-050',
    title: 'Alternative Certificates, Show Entry/Remark Cards & IAGARB Wool/Fiber Tracking',
    category: 'species-ux',
    source: 'session',
    summary:
      'Adds privacy-scoped Pet-Sale Birth Certificates (omitting breeder contact info & pricing), official Breeding/Service Certificates, ARBA-style Show Entry Forms (`mailto:` + plain-text copy + Open/Youth/fees) & 4-up/1-up Show Remark Cards from ShowEvent rosters, Gen 0–2 multi-photo Family Portrait and IAGARB German Angora pedigree layouts, and SQLite v6 `wool_harvests` tracking via lazy-loaded `WoolHarvestPanel` with 7-position 100-pt IAGARB scoring and 90-day 325g shearing yield calculations.',
    userIntent:
      'Support alternative companion birth/breeding certificates, printable/emailable show documents directly from show rosters, family portrait & IAGARB Angora pedigree templates, and wool/fiber harvest logging.',
    files: [
      'src/domain/models.ts',
      'src/domain/woolFiber.ts',
      'src/domain/alternativeCertificates.ts',
      'src/domain/showDocuments.ts',
      'src/domain/pedigreePrintStyles.ts',
      'src/domain/syncAndExports.ts',
      'src/domain/pdfExporter.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/PrintPreviewModal.tsx',
      'src/components/WoolHarvestPanel.tsx',
      'src/components/HerdScreen.tsx',
      'src/components/PedigreeScreen.tsx',
      'src/components/BreedingScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/App.tsx',
      'src/domain/__tests__/woolFiber.test.ts',
      'src/domain/__tests__/alternativeCertificates.test.ts',
      'src/domain/__tests__/showDocuments.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/models.ts',
        requiredSubstrings: [
          'WoolHarvest',
          'IagarbScorecard',
          'WOOL_HARVEST_METHODS',
          'normalizeWoolHarvestMethod',
        ],
        rationale: 'WoolHarvest and IagarbScorecard domain models and normalizers must remain intact.',
      },
      {
        filePath: 'src/domain/woolFiber.ts',
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
        filePath: 'src/domain/alternativeCertificates.ts',
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
        filePath: 'src/domain/showDocuments.ts',
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
        filePath: 'src/domain/pedigreePrintStyles.ts',
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
        filePath: 'src/components/WoolHarvestPanel.tsx',
        requiredSubstrings: [
          'WoolHarvestPanel',
          'onSaveWoolHarvest',
          'IAGARB_JUDGING_POSITIONS',
        ],
        rationale:
          'WoolHarvestPanel must provide lazy-loaded Wool / Fiber logging and IAGARB 100-pt judging scorecards.',
      },
      {
        filePath: 'src/components/HerdScreen.tsx',
        requiredSubstrings: [
          'generatePetBirthCertificateHtml',
          'onSaveWoolHarvest',
          'WoolHarvestPanel',
        ],
        rationale:
          'HerdScreen must provide Pet-Sale Birth Certificate previews and mount WoolHarvestPanel.',
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
      'Keep `WoolHarvest` and `IagarbScorecard` models in `src/domain/models.ts` and `wool_harvests` SQLite v6 schema in `src/storage/webSqliteAdapter.ts`.',
      'Restore pure modules `src/domain/woolFiber.ts`, `src/domain/alternativeCertificates.ts`, and `src/domain/showDocuments.ts` with their unit tests.',
      'Keep `family_portrait` & `iagarb_angora` rendering in `pedigreePrintStyles.ts`, `syncAndExports.ts`, and `pdfExporter.ts`, plus UI wiring in `WoolHarvestPanel.tsx`, `HerdScreen.tsx`, `PedigreeScreen.tsx`, `BreedingScreen.tsx`, `SpeciesDashboardScreen.tsx`, and `App.tsx`.',
    ],
  },
  {
    id: 'IMP-051',
    title: 'Founder Loss / Heritability Analytics, Interactive Barn Scheduler Gantt & LAN P2P Outbox Sync',
    category: 'species-ux',
    source: 'session',
    summary:
      'Wires pure TypeScript path-summed founder & ancestor genetic contributions (`0.5^depth`), Lacy effective founders (`fe`), Lost/Endangered/Active founder bottleneck ledger, and mid-parent OLS heritability (`h²`) cohort trends (`pedigreeAnalytics.ts`) via lazy-loaded `FounderAndHeritabilityPanel` into both `PedigreeScreen.tsx` and `BreedingScreen.tsx`; wires pure UTC multi-day Gantt timeline, smart critical priority escalation (`barnScheduler.ts`), SQLite `barn_tasks.start_date_iso` persistence, `useBarnStore` task rescheduling/escalation/reconciliation mutations, and zero-server WebRTC DataChannel & folder delta reconciliation (`p2pSyncProtocol.ts`, `p2pLanChannel.ts`) via lazy-loaded `BarnSchedulerGantt` inside `SpeciesDashboardScreen.tsx`.',
    userIntent:
      'Provide heritability trends, founder-loss analytics, drag-and-drop chore scheduling with smart escalation, and serverless LAN P2P outbox sync.',
    files: [
      'src/domain/models.ts',
      'src/domain/pedigreeAnalytics.ts',
      'src/domain/barnScheduler.ts',
      'src/domain/p2pSyncProtocol.ts',
      'src/storage/p2pLanChannel.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/FounderAndHeritabilityPanel.tsx',
      'src/components/BarnSchedulerGantt.tsx',
      'src/components/PedigreeScreen.tsx',
      'src/components/BreedingScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/App.tsx',
      'src/domain/__tests__/pedigreeAnalytics.test.ts',
      'src/domain/__tests__/barnScheduler.test.ts',
      'src/domain/__tests__/p2pSyncProtocol.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/pedigreeAnalytics.ts',
        requiredSubstrings: [
          'analyzeAnimalFounderContributions',
          'analyzePairingFounderShift',
          'analyzeSpeciesFounderLoss',
          'analyzeSpeciesHeritabilityTrends',
        ],
        rationale:
          'Pure TS founder contribution, effective founders fe, founder-loss ledger, and heritability h² calculators must remain zero-DOM.',
      },
      {
        filePath: 'src/domain/barnScheduler.ts',
        requiredSubstrings: [
          'evaluateTaskPriorityEscalation',
          'buildPriorityEscalationUpdates',
          'buildBarnGanttTimeline',
          'shiftTaskDatesByDays',
          'resizeTaskStartDateByDays',
        ],
        rationale:
          'Pure TS Gantt timeline builder, UTC span shift/resize helpers, and critical-task escalation engine must remain zero-DOM.',
      },
      {
        filePath: 'src/domain/p2pSyncProtocol.ts',
        requiredSubstrings: [
          'encodeP2pSignalToken',
          'decodeP2pSignalToken',
          'createP2pDeltaWireMessage',
          'parseP2pWireOrDeltaPayload',
          'summarizeTaskReconciliation',
        ],
        rationale:
          'Pure TS LAN P2P CP-LAN1 signaling codec, wire delta framing, and reconciliation summary helpers must remain intact.',
      },
      {
        filePath: 'src/storage/p2pLanChannel.ts',
        requiredSubstrings: [
          'supportsLanWebRtcP2p',
          'createLanP2pSession',
          'reconcileWithPickedSyncFolder',
        ],
        rationale:
          'Zero-server WebRTC DataChannel (iceServers: []) and Sync Folder reconciliation bridge must remain wired.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: ['start_date_iso'],
        rationale: 'SQLite barn_tasks table must persist and hydrate startDateIso across reloads.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: [
          'rescheduleTask',
          'applySmartTaskEscalations',
          'reconcileP2pOutboxOps',
        ],
        rationale:
          'Store must expose serialized mutations for Gantt rescheduling, smart priority escalation, and P2P outbox reconciliation.',
      },
      {
        filePath: 'src/components/FounderAndHeritabilityPanel.tsx',
        requiredSubstrings: [
          'FounderAndHeritabilityPanel',
          'analyzeSpeciesFounderLoss',
          'analyzeSpeciesHeritabilityTrends',
        ],
        rationale:
          'FounderAndHeritabilityPanel must render subject founder balance, herd bottleneck ledger, and cohort h² SVG trends.',
      },
      {
        filePath: 'src/components/BarnSchedulerGantt.tsx',
        requiredSubstrings: [
          'BarnSchedulerGantt',
          'buildBarnGanttTimeline',
          'createLanP2pSession',
        ],
        rationale:
          'BarnSchedulerGantt must render interactive drag/resize Gantt lanes, smart escalations, and LAN P2P sync controls.',
      },
      {
        filePath: 'src/components/PedigreeScreen.tsx',
        requiredSubstrings: ['FounderAndHeritabilityPanel', 'mode="pedigree"'],
        rationale: 'PedigreeScreen must lazy-mount FounderAndHeritabilityPanel in pedigree mode.',
      },
      {
        filePath: 'src/components/BreedingScreen.tsx',
        requiredSubstrings: ['FounderAndHeritabilityPanel', 'mode="breeding"'],
        rationale: 'BreedingScreen must lazy-mount FounderAndHeritabilityPanel in breeding mode.',
      },
      {
        filePath: 'src/components/SpeciesDashboardScreen.tsx',
        requiredSubstrings: ['BarnSchedulerGantt', 'taskViewMode', 'onReconcileOutboxOps'],
        rationale:
          'SpeciesDashboardScreen must expose List/Gantt chore view switching and mount lazy-loaded BarnSchedulerGantt.',
      },
    ],
    restorePlaybook: [
      'Keep pure domain engines `src/domain/pedigreeAnalytics.ts`, `src/domain/barnScheduler.ts`, `src/domain/p2pSyncProtocol.ts`, `src/storage/p2pLanChannel.ts`, and their Vitest suites intact.',
      'Keep `barn_tasks.start_date_iso` in `src/storage/webSqliteAdapter.ts` and `rescheduleTask`, `applySmartTaskEscalations`, and `reconcileP2pOutboxOps` in `src/hooks/useBarnStore.ts`.',
      'Keep lazy-loaded `FounderAndHeritabilityPanel` mounted in `PedigreeScreen.tsx` & `BreedingScreen.tsx` and lazy-loaded `BarnSchedulerGantt` toggled inside `SpeciesDashboardScreen.tsx` & wired from `App.tsx`.',
    ],
  },
  {
    id: 'IMP-052',
    title: 'Post-Import Bootability, Bundle Hygiene, Atomic SQLite Migrations & Memory Hardening',
    category: 'stability-pwa',
    source: 'session',
    summary:
      'Restores `.env.example` (IMP-008), archives 3.6 MB AI Studio dumps out of `public/` into `docs/archive/aistudio-exports/`, enforces `NODE_ENV=production` in Android APK CI, removes explicit `: any` annotations (fixing a silent `AFTER_BRED` backup-parser bug), makes `index.html` preflight treat missing `indexedDB` as advisory so Safari Lockdown / Private Mode can enter Ephemeral Mode, loads Google Fonts asynchronously, arms boot-stability completion only after React store hydration (`!store.isLoading`), upgrades SQLite migrations to version-gated atomic `BEGIN`/`COMMIT`/`ROLLBACK` transactions with `PRAGMA table_info` checks and `{ lightweightPhotos: true }` pre-upgrade backups, bypasses OPFS `/tmp` staging for `<512 KB` iOS standalone PWA shares to preserve user activation, extracts pure `src/engine/binaryEncoding.ts` + eliminates all 3 Vite `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings + configures vendor/icon Rolldown code-splitting, defers non-critical startup probes/auto-repair off first paint, scopes `syncOperations` React state to sync-consuming routes, replaces `document.body` `MutationObserver` with `subscribeOpenDialogCount`, stabilizes `AnimalPhotoGallery` lazy hydration, and dehydrates Tier 3 mirror photos.',
    userIntent:
      'Harden post-import booting stability, first-paint loading speed, bundle footprint, and mobile memory management without breaking offline-first guarantees.',
    files: [
      '.env.example',
      '.github/workflows/build-android-apk.yml',
      'index.html',
      'vite.config.ts',
      'src/main.tsx',
      'src/App.tsx',
      'src/engine/binaryEncoding.ts',
      'src/domain/deviceCapability.ts',
      'src/domain/syncAndExports.ts',
      'src/storage/storageProbes.ts',
      'src/storage/opfsStorage.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/utils/webFileActions.ts',
      'src/utils/useAccessibleDialog.ts',
      'src/components/AnimalPhotoGallery.tsx',
      'src/components/CrashErrorBoundary.tsx',
      'src/components/TechyStuffErrorBoundary.tsx',
      'src/storage/__tests__/postImportHardening.test.ts',
    ],
    invariants: [
      {
        filePath: '.env.example',
        requiredSubstrings: ['# No required environment variables.'],
        rationale: 'Keep .env.example present with zero secret placeholders to satisfy IMP-008.',
      },
      {
        filePath: '.github/workflows/build-android-apk.yml',
        requiredSubstrings: ['NODE_ENV: production'],
        rationale: 'Android APK CI must force NODE_ENV=production so jsx-dev-runtime never ships in APK assets.',
      },
      {
        filePath: 'index.html',
        requiredSubstrings: ['indexedDbAvailable', 'media="print"', "this.media='all'"],
        rationale: 'Preflight must allow Safari Lockdown/Private Ephemeral Mode and keep Google Fonts non-render-blocking.',
      },
      {
        filePath: 'vite.config.ts',
        requiredSubstrings: ['codeSplitting', 'vendor-react', 'vendor-icons', 'vendor-sql'],
        rationale: 'Rolldown code-splitting must isolate vendor chunks and consolidate lucide-react micro-chunks.',
      },
      {
        filePath: 'src/engine/binaryEncoding.ts',
        requiredSubstrings: [
          'utf8StringToBytes',
          'bytesToUtf8String',
          'bytesToBase64Pure',
          'base64ToBytesPure',
          'dataUrlToBinary',
          'binaryToDataUrl',
        ],
        rationale: 'Pure TS binary/base64/dataURL encoding helpers must stay decoupled from fflate and DOM.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: [
          'PRAGMA table_info(',
          'BEGIN TRANSACTION;',
          'ROLLBACK;',
          'this.loadSnapshotUnlocked({ lightweightPhotos: true })',
        ],
        rationale: 'SQLite migrations must be version-gated, PRAGMA-checked, atomic, and memory-bounded during pre-upgrade backups.',
      },
      {
        filePath: 'src/storage/storageProbes.ts',
        requiredSubstrings: ['registerIndexedDbOpfsDumper', 'triggerIndexedDbOpfsDump'],
        rationale: 'Shared callback registry avoids circular dynamic import warnings for opfsStorage.',
      },
      {
        filePath: 'src/utils/webFileActions.ts',
        requiredSubstrings: ['shouldBypassOpfsForIosGesture'],
        rationale: 'Small (<512 KB) iOS standalone PWA shares must bypass OPFS /tmp staging to preserve tap gesture activation.',
      },
      {
        filePath: 'src/utils/useAccessibleDialog.ts',
        requiredSubstrings: ['getOpenDialogCount', 'subscribeOpenDialogCount'],
        rationale: 'Dialog count subscription replaces document.body MutationObserver in App.tsx.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: [
          'subscribeOpenDialogCount',
          '__PEDIGREE_MARK_BOOT_STABLE__',
          'routeKey="calendar-sync-confirm"',
        ],
        rationale: 'Root shell must mark boot stable after store hydration, track dialogs via subscription, and guard CalendarSyncConfirmModal.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: [
          'isSyncOperationsRoute',
          'ensureMaxRevIndexInitialized',
          "import('../domain/archiveInspector')",
        ],
        rationale: 'Store must defer non-critical startup probes, scope syncOperations state to sync routes, and dynamic-import cold modules.',
      },
      {
        filePath: 'src/components/AnimalPhotoGallery.tsx',
        requiredSubstrings: ['hydratedUrlsRef', 'inFlightPhotoIdsRef'],
        rationale: 'Photo gallery lazy hydration must guard duplicate requests via refs instead of self-retriggering effect deps.',
      },
    ],
    restorePlaybook: [
      'Keep `.env.example` clean, keep AI Studio dumps archived in `docs/archive/aistudio-exports/` (never under `public/`), and preserve `NODE_ENV: production` in `.github/workflows/build-android-apk.yml`.',
      'Preserve advisory `indexedDbAvailable` preflight & async Google Fonts in `index.html`, post-hydration `__PEDIGREE_MARK_BOOT_STABLE__` in `src/App.tsx`, and atomic `PRAGMA table_info` migrations in `src/storage/webSqliteAdapter.ts`.',
      'Keep `src/engine/binaryEncoding.ts`, `triggerIndexedDbOpfsDump` in `storageProbes.ts`, `shouldBypassOpfsForIosGesture` in `webFileActions.ts`, `subscribeOpenDialogCount` in `useAccessibleDialog.ts`, Rolldown `codeSplitting` in `vite.config.ts`, and route-scoped `syncOperations` + deferred startup work in `useBarnStore.ts`.',
    ],
  },
  {
    id: 'IMP-053',
    title: 'v0.1.0-alpha.2 Release Readiness: Targeted Strict TS, Cold-Start Splits, Worker Freeze Trim, Unified PWA+APK Release CI & Prompt Governance',
    category: 'stability-pwa',
    source: 'session',
    userIntent:
      'Prepare Community Pedigree cleanly for its v0.1.0-alpha.2 GitHub release tag with zero new features—optimizing cold-start payload, compiler strictness, mobile worker memory cleanup, unified PWA+Android APK release packaging, plan deletion on wrap-up, and mandatory improvement logging for significant changes.',
    summary:
      'Enables 7 targeted strict TypeScript compiler checks in `tsconfig.json` (`alwaysStrict`, `noImplicitAny`, `noImplicitThis`, `strictBindCallApply`, `strictFunctionTypes`, `useUnknownInCatchVariables`, `noFallthroughCasesInSwitch`), converts Excel serial date parsing in `src/engine/codecs/archiveAndCsvUtils.ts` to calendar-safe `Date.UTC(1899, 11, 30 + serial)`, splits 7 cold domain modules (`barnBench`, `barnScheduler`, `p2pSyncProtocol`, `clientCrm`, `economicsLedger`, `feedInventory`, `importers/conflictResolver`) out of the initial entry bundle in `src/hooks/useBarnStore.ts`, hooks `src/storage/offThreadWorkerClient.ts` into `registerFreezeLifecycleListener` to terminate idle Web Workers immediately on mobile background hide/`pagehide`, upgrades `.github/workflows/release.yml` to verify cross-file version alignment (`0.1.0-alpha.2`), verify root + subpath builds, and attach both PWA `.zip` + `.sha256` and Android WebView `.apk` + `.sha256` artifacts to GitHub Releases, syncs `public/version.json`, Fastlane changelog, and release guides, updates `prompts/master_system_prompt.md` (and backlog/crash prompts) to delete wrapped-up plans and log every significant boot/load/memory change in `IMPROVEMENTS.md`, and removes completed crash-era plan files from `docs/archive/`.',
    files: [
      'tsconfig.json',
      'src/engine/codecs/archiveAndCsvUtils.ts',
      'src/hooks/useBarnStore.ts',
      'src/storage/offThreadWorkerClient.ts',
      '.github/workflows/release.yml',
      'public/version.json',
      'fastlane/metadata/android/en-US/changelogs/1.txt',
      'docs/HOW_TO_CREATE_A_RELEASE.md',
      '.github/WORKFLOWS_GUIDE.md',
      'README.md',
      'prompts/master_system_prompt.md',
      'prompts/start_new_backlog_prompt.md',
      'prompts/resume_backlog_plan_prompt.md',
      'prompts/fix_error_log_prompt.md',
      'src/domain/__tests__/releaseReadiness.test.ts',
    ],
    invariants: [
      {
        filePath: 'tsconfig.json',
        requiredSubstrings: [
          '"noImplicitAny": true',
          '"strictFunctionTypes": true',
          '"useUnknownInCatchVariables": true',
          '"noFallthroughCasesInSwitch": true',
        ],
        rationale: 'Targeted strict TypeScript checks must remain enabled to catch implicit-any and untyped catch regressions before release.',
      },
      {
        filePath: 'src/engine/codecs/archiveAndCsvUtils.ts',
        requiredSubstrings: ['Date.UTC(1899, 11, 30 + serial)'],
        rationale: 'Excel serial date decoding must use explicit Date.UTC calendar offset math instead of raw millisecond addition.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: [
          "import('../domain/economicsLedger')",
          "import('../domain/clientCrm')",
          "import('../domain/barnBench')",
          "import('../domain/barnScheduler')",
          "import('../domain/p2pSyncProtocol')",
          "import('../domain/feedInventory')",
          "import('../domain/importers/conflictResolver')",
        ],
        rationale: 'Cold domain modules must remain dynamically imported inside async store handlers to keep the initial entry bundle lean.',
      },
      {
        filePath: 'src/storage/offThreadWorkerClient.ts',
        requiredSubstrings: [
          'terminateIdleArchiveWorker',
          'archive-worker-freeze-trim',
          'registerFreezeLifecycleListener',
        ],
        rationale: 'Idle archive/import Web Workers must terminate promptly on background hide/pagehide to release mobile RAM.',
      },
      {
        filePath: '.github/workflows/release.yml',
        requiredSubstrings: [
          'Verify cross-file version alignment',
          'release-android-apk:',
          'publish-github-release:',
          'release-pwa-dist',
        ],
        rationale: 'GitHub tag releases must verify version sync and package + attach both the PWA ZIP and Android WebView APKs with SHA-256 checksums.',
      },
      {
        filePath: 'prompts/master_system_prompt.md',
        requiredSubstrings: [
          'Plan Lifecycle (Delete on Wrap-Up)',
          'Mandatory Improvement Logging (`IMPROVEMENTS.md` & `src/domain/improvementRegistry.ts`)',
        ],
        rationale: 'Master System Prompt must enforce deleting wrapped-up plan files and logging every significant boot/load/memory change in IMPROVEMENTS.md.',
      },
    ],
    restorePlaybook: [
      'Keep targeted strict TypeScript flags in `tsconfig.json` and calendar-safe `Date.UTC(1899, 11, 30 + serial)` in `src/engine/codecs/archiveAndCsvUtils.ts`.',
      'Preserve dynamic `import(...)` lazy splits for the 7 cold modules in `src/hooks/useBarnStore.ts` and `terminateIdleArchiveWorker` background-freeze cleanup in `src/storage/offThreadWorkerClient.ts`.',
      'Keep unified PWA ZIP + Android WebView APK + SHA-256 packaging and version-alignment checks in `.github/workflows/release.yml`, and retain the Plan Lifecycle and Mandatory Improvement Logging rules in `prompts/master_system_prompt.md`.',
    ],
  },
  {
    id: 'IMP-054',
    title: 'Zero-Server Breeder Showcase & For-Sale Catalog Exporter',
    category: 'species-ux',
    source: 'session',
    userIntent:
      'Let breeders mark eligible livestock For Sale with asking price and buyer notes, configure public contact details in Barn Settings, and export a self-contained static HTML storefront & printable buyer stock sheet without any server.',
    summary:
      'Adds `forSale`, `askingPriceCents`, and `saleNotes` fields plus `isAnimalAvailableForSale()` on `Animal`, optional public contact/tagline fields on `BarnSettings` (`breederEmail`, `breederPhone`, `breederLocation`, `breederWebsite`, `showcaseTagline`), `sanitizeSafeExternalHttpUrl()` + sync field allowlists in `inputSanitization.ts`, JSON v6 backup round-trip in `syncAndExports.ts`, atomic SQLite schema v7 migration (`for_sale`, `asking_price_cents`, `sale_notes` + `extra_settings_json`) in `webSqliteAdapter.ts`, pure TypeScript `src/domain/breederShowcase.ts` static HTML catalog + printable stock sheet generator (photos, 2-gen pedigrees, COI%, show/wool/carrier disclosures, reservation hold badges, medication withdrawal holds, QR badge, zero-dependency progressive search/filter, and XSS/SVG-safe sanitization), registers `breeder-showcase-html` in `src/domain/exporters/registry.ts`, adds For-Sale listing controls in `AnimalEditorModal.tsx`, breeder contact inputs in `SettingsAndSyncScreen.tsx`, `For Sale` herd filter + preview toggles in `HerdScreen.tsx`, and showcase photo hydration in `ImportExportHubScreen.tsx`.',
    files: [
      'src/domain/models.ts',
      'src/domain/inputSanitization.ts',
      'src/domain/breederShowcase.ts',
      'src/domain/exporters/registry.ts',
      'src/domain/syncAndExports.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/components/AnimalEditorModal.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/components/HerdScreen.tsx',
      'src/components/ImportExportHubScreen.tsx',
      'src/domain/__tests__/breederShowcase.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/models.ts',
        requiredSubstrings: [
          'isAnimalAvailableForSale',
          'forSale?: boolean',
          'breederEmail?: string',
        ],
        rationale: 'Animal For-Sale eligibility helper and BarnSettings showcase contact fields must stay intact.',
      },
      {
        filePath: 'src/domain/inputSanitization.ts',
        requiredSubstrings: ['sanitizeSafeExternalHttpUrl'],
        rationale: 'Showcase website links must enforce strict http/https protocol sanitization.',
      },
      {
        filePath: 'src/domain/breederShowcase.ts',
        requiredSubstrings: [
          'buildBreederShowcaseResult',
          'generateBreederShowcaseHtml',
          'buildBreederShowcaseFileName',
        ],
        rationale: 'Pure TypeScript zero-server showcase HTML + stock sheet generator must stay decoupled from DOM.',
      },
      {
        filePath: 'src/domain/exporters/registry.ts',
        requiredSubstrings: ['breeder-showcase-html', 'buildBreederShowcaseResult'],
        rationale: 'Import/Export Hub exporter registry must retain breeder-showcase-html.',
      },
      {
        filePath: 'src/domain/syncAndExports.ts',
        requiredSubstrings: ['breederEmail', 'askingPriceCents'],
        rationale: 'JSON backup parser must preserve breeder contact info and animal asking prices.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: ['SQLITE_SCHEMA_VERSION', 'for_sale', 'asking_price_cents'],
        rationale: 'SQLite schema v7+ must persist and migrate For-Sale columns and contact settings atomically.',
      },
      {
        filePath: 'src/components/AnimalEditorModal.tsx',
        requiredSubstrings: ['askingPriceInput', 'saleNotes'],
        rationale: 'Animal editor must expose For-Sale toggle, asking price, and buyer-facing listing notes.',
      },
      {
        filePath: 'src/components/SettingsAndSyncScreen.tsx',
        requiredSubstrings: ['breederEmail', 'showcaseTagline'],
        rationale: 'Barn settings must expose public showcase contact info and catalog tagline.',
      },
      {
        filePath: 'src/components/HerdScreen.tsx',
        requiredSubstrings: ['For-Sale Catalog', 'generateBreederShowcaseHtml'],
        rationale: 'Herd screen must expose For-Sale filter pill and live PrintPreviewModal catalog toggles.',
      },
      {
        filePath: 'src/components/ImportExportHubScreen.tsx',
        requiredSubstrings: ['breeder-showcase-html'],
        rationale: 'Import/Export Hub must hydrate photos on Tier 2+ devices for breeder-showcase-html exports.',
      },
    ],
    restorePlaybook: [
      'Restore `BarnSettings` contact fields, `Animal` for-sale fields, and `isAnimalAvailableForSale` in `src/domain/models.ts`, plus `sanitizeSafeExternalHttpUrl` and sync field allowlists in `src/domain/inputSanitization.ts`.',
      'Restore `src/domain/breederShowcase.ts`, register `breeder-showcase-html` in `src/domain/exporters/registry.ts`, preserve JSON round-trip in `src/domain/syncAndExports.ts`, and retain SQLite schema v7 columns in `src/storage/webSqliteAdapter.ts`.',
      'Keep For-Sale controls in `AnimalEditorModal.tsx`, breeder contact settings in `SettingsAndSyncScreen.tsx`, For-Sale catalog preview/filter in `HerdScreen.tsx`, photo hydration in `ImportExportHubScreen.tsx`, and unit tests in `src/domain/__tests__/breederShowcase.test.ts`.',
    ],
  },
  {
    id: 'IMP-055',
    title: 'Health Reference Wiki Links, Local Veterinary PDF Folder Pointer & External Backup Reminders',
    category: 'species-ux',
    source: 'session',
    userIntent:
      'Provide curated online links to external rabbit and livestock health wikis alongside a simple local device folder pointer for personal offline veterinary PDFs, paired with periodic reminders to back up external document folders.',
    summary:
      'Adds a pure TypeScript curated health wiki index and reminder engine (`src/domain/healthReference.ts`) covering all 11 predefined species plus custom species substring resolution with strict `https://` URL sanitization (`sanitizeSafeExternalHttpUrl`); adds generic named directory-handle helpers in `src/storage/localSyncChannels.ts` reusing the existing `sync_handles` IDB store without bumping schema version; creates `src/storage/vetDocsFolder.ts` for read-only folder handle persistence, bounded depth/entry PDF scanning (`MAX_VET_PDF_SCAN_DEPTH = 2`, `MAX_VET_PDF_ENTRIES = 250`), path-note persistence, and configurable backup reminder cadence (`14/30/60/90` days + `7d` snooze); integrates full wipe/reset cleanup in `src/hooks/useBarnStore.ts`; builds lazy-loaded `HealthReferencePanel` & `HealthReferenceModal` with offline notice, disabled-with-explanation fallback on unsupported browsers (`IMP-019`), direct file-picker fallback, single-PDF `<iframe>` preview + `URL.revokeObjectURL` lifecycle cleanup; and wires periodic reminder banners and launchers into `App.tsx`, `SpeciesDashboardScreen.tsx`, `HerdScreen.tsx`, and `SettingsAndSyncScreen.tsx`.',
    files: [
      'src/domain/healthReference.ts',
      'src/storage/localSyncChannels.ts',
      'src/storage/vetDocsFolder.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/HealthReferencePanel.tsx',
      'src/App.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/components/HerdScreen.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/domain/__tests__/healthReference.test.ts',
      'src/storage/__tests__/vetDocsFolder.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/healthReference.ts',
        requiredSubstrings: [
          'HEALTH_WIKI_REFERENCES',
          'getHealthWikiLinksForSpecies',
          'evaluateVetDocsBackupReminder',
          'filterAndSortVetPdfEntries',
          'normalizeVetDocsFolderMeta',
        ],
        rationale:
          'Pure TypeScript health wiki directory and external PDF folder backup reminder evaluator must remain DOM-free and strict https:// validated.',
      },
      {
        filePath: 'src/storage/localSyncChannels.ts',
        requiredSubstrings: [
          'saveNamedDirectoryHandleToIdb',
          'loadNamedDirectoryHandleFromIdb',
          'deleteNamedDirectoryHandleFromIdb',
          'queryDirectoryHandleReadPermission',
        ],
        rationale:
          'Shared IDB sync_handles accessors allow vetDocsFolder persistence without bumping the IDB schema version.',
      },
      {
        filePath: 'src/storage/vetDocsFolder.ts',
        requiredSubstrings: [
          'VET_DOCS_HANDLE_KEY',
          'VET_DOCS_META_LS_KEY',
          'connectVetDocsFolder',
          'scanVetDocsDirectory',
          'markVetDocsBackedUpNow',
          'clearAllVetDocsFolderState',
        ],
        rationale:
          'Vet PDF folder adapter must persist read-only directory handles, scan PDFs safely, track backup acknowledgments, and support full factory reset cleanup.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: ['clearAllVetDocsFolderState'],
        rationale: 'Factory reset and sync-state wipe flows must clear stored vet PDF handles and metadata.',
      },
      {
        filePath: 'src/components/HealthReferencePanel.tsx',
        requiredSubstrings: [
          'HealthReferencePanel',
          'HealthReferenceModal',
          'platformBridge.openExternalUrl',
          'URL.revokeObjectURL',
        ],
        rationale:
          'Lazy health reference modal must route external links through IPlatformBridge and deterministically revoke PDF blob URLs.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: [
          'HealthReferenceModal',
          'vetDocsReminder.showBanner',
          'onOpenHealthReference',
        ],
        rationale:
          'App shell must lazy-load HealthReferenceModal, surface periodic external PDF folder backup reminders, and pass launcher handlers to screens.',
      },
      {
        filePath: 'src/components/SpeciesDashboardScreen.tsx',
        requiredSubstrings: ['onOpenHealthReference'],
        rationale: 'Species Dashboard must expose quick Health Wikis & Vet PDFs launcher.',
      },
      {
        filePath: 'src/components/HerdScreen.tsx',
        requiredSubstrings: ['onOpenHealthReference'],
        rationale: 'Animal Health Journal must expose contextual Health Wikis & Vet PDFs launcher.',
      },
      {
        filePath: 'src/components/SettingsAndSyncScreen.tsx',
        requiredSubstrings: ['onOpenHealthReference'],
        rationale: 'Barn Settings must expose Health Reference Wikis & Local Vet PDF Folder launcher.',
      },
    ],
    restorePlaybook: [
      'Restore pure TypeScript wiki links, species matcher, and reminder math in `src/domain/healthReference.ts` and tests in `src/domain/__tests__/healthReference.test.ts`.',
      'Keep generic `saveNamedDirectoryHandleToIdb`/`loadNamedDirectoryHandleFromIdb`/`deleteNamedDirectoryHandleFromIdb` in `src/storage/localSyncChannels.ts` and restore `src/storage/vetDocsFolder.ts` + `src/storage/__tests__/vetDocsFolder.test.ts`.',
      'Keep `clearAllVetDocsFolderState()` cleanup in `src/hooks/useBarnStore.ts`, lazy `HealthReferenceModal` + reminder banner in `src/App.tsx`, and `onOpenHealthReference` launchers in `SpeciesDashboardScreen.tsx`, `HerdScreen.tsx`, and `SettingsAndSyncScreen.tsx`.',
    ],
  },
  {
    id: 'IMP-056',
    title: 'Restricted Health Wiki Article Sources Blocklist (House Rabbit Society & Custom Rules)',
    category: 'species-ux',
    source: 'session',
    userIntent:
      'Maintain a restricted sources list for health wiki article connections starting with House Rabbit Society.',
    summary:
      'Removes House Rabbit Society (`rabbit.org`) from curated health wiki links and introduces a pure TypeScript restricted wiki sources engine (`DEFAULT_RESTRICTED_WIKI_SOURCES`, `findMatchingRestrictedWikiSource`, `isHealthWikiSourceRestricted`, `filterAllowedHealthWikiReferences`, `normalizeRestrictedWikiSources`) in `src/domain/healthReference.ts`; persists user-added custom restricted sources in `localStorage` via `src/storage/vetDocsFolder.ts` while keeping built-in restrictions locked; enforces click-time blocking and exposes a collapsible Restricted Wiki Sources manager inside `src/components/HealthReferencePanel.tsx`.',
    files: [
      'src/domain/healthReference.ts',
      'src/storage/vetDocsFolder.ts',
      'src/components/HealthReferencePanel.tsx',
      'src/domain/__tests__/healthReference.test.ts',
      'src/storage/__tests__/vetDocsFolder.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/healthReference.ts',
        requiredSubstrings: [
          'DEFAULT_RESTRICTED_WIKI_SOURCES',
          'restricted-house-rabbit-society',
          'findMatchingRestrictedWikiSource',
          'filterAllowedHealthWikiReferences',
          'normalizeRestrictedWikiSources',
        ],
        forbiddenSubstrings: ['wiki-rabbit-hrs'],
        rationale:
          'House Rabbit Society must remain on the built-in restricted wiki sources list and excluded from curated health wiki links.',
      },
      {
        filePath: 'src/storage/vetDocsFolder.ts',
        requiredSubstrings: [
          'RESTRICTED_WIKI_SOURCES_LS_KEY',
          'readRestrictedWikiSources',
          'addCustomRestrictedWikiSource',
          'removeCustomRestrictedWikiSource',
        ],
        rationale:
          'Custom restricted wiki sources must persist locally without allowing built-in restricted entries to be deleted.',
      },
      {
        filePath: 'src/components/HealthReferencePanel.tsx',
        requiredSubstrings: [
          'Restricted Wiki Sources',
          'findMatchingRestrictedWikiSource',
          'handleAddRestrictedSource',
        ],
        rationale:
          'Health Reference panel must enforce restricted source checks at click time and let users view/manage restricted sources.',
      },
    ],
    restorePlaybook: [
      'Restore `DEFAULT_RESTRICTED_WIKI_SOURCES` (with `House Rabbit Society` / `rabbit.org`), `findMatchingRestrictedWikiSource`, and `filterAllowedHealthWikiReferences` in `src/domain/healthReference.ts`.',
      'Restore `readRestrictedWikiSources`, `addCustomRestrictedWikiSource`, and `removeCustomRestrictedWikiSource` in `src/storage/vetDocsFolder.ts`.',
      'Restore the click-time `findMatchingRestrictedWikiSource` guard and collapsible `Restricted Wiki Sources` manager in `src/components/HealthReferencePanel.tsx`.',
    ],
  },
  {
    id: 'IMP-057',
    title: 'Preferred Wiki Sources, English USA (en-US) App Locale & Multi-Language Wiki Filter',
    category: 'species-ux',
    source: 'session',
    userIntent:
      'Create a preferred sources list for health wiki links (Merck Veterinary Manual, USDA & equivalent federal agencies in all countries, and state/federal/land-grant universities in all countries), define the app locale as English USA (en-US), and require English wiki sources via an extensible multi-language array.',
    summary:
      'Defines `APP_LOCALE = \'en-US\'` (`APP_LOCALE_METADATA`, `normalizeBcp47LanguageTag`, `extractBaseLanguageCode`) in `src/domain/models.ts` and updates `index.html` + `vite.config.ts` PWA manifest to `en-US`; adds `DEFAULT_PREFERRED_WIKI_SOURCES` (`Merck Veterinary Manual`, global federal ag/vet agencies, and global state/federal/land-grant universities), `DEFAULT_ALLOWED_WIKI_LANGUAGES = [\'en\']`, `doesWikiLanguageMatchAllowed`, `normalizeAllowedWikiLanguages`, `findMatchingPreferredWikiSource`, and `sortHealthWikiReferencesWithPreferred` in `src/domain/healthReference.ts`; persists custom preferred sources and multi-language arrays in `src/storage/vetDocsFolder.ts`; and renders preferred source prioritization and management inside `src/components/HealthReferencePanel.tsx`.',
    files: [
      'src/domain/models.ts',
      'index.html',
      'vite.config.ts',
      'src/domain/healthReference.ts',
      'src/storage/vetDocsFolder.ts',
      'src/components/HealthReferencePanel.tsx',
      'src/domain/__tests__/healthReference.test.ts',
      'src/storage/__tests__/vetDocsFolder.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/models.ts',
        requiredSubstrings: [
          "APP_LOCALE = 'en-US'",
          'APP_LOCALE_METADATA',
          'normalizeBcp47LanguageTag',
          'extractBaseLanguageCode',
        ],
        rationale:
          'Application code and translation baseline must remain explicitly typed as English (United States) `en-US`.',
      },
      {
        filePath: 'index.html',
        requiredSubstrings: ['<html lang="en-US">'],
        rationale: 'Root HTML document language must declare English USA (`en-US`).',
      },
      {
        filePath: 'vite.config.ts',
        requiredSubstrings: ["lang: 'en-US'"],
        rationale: 'PWA web app manifest must declare `lang: "en-US"`.',
      },
      {
        filePath: 'src/domain/healthReference.ts',
        requiredSubstrings: [
          'DEFAULT_PREFERRED_WIKI_SOURCES',
          'DEFAULT_ALLOWED_WIKI_LANGUAGES',
          'doesWikiLanguageMatchAllowed',
          'normalizeAllowedWikiLanguages',
          'findMatchingPreferredWikiSource',
          'sortHealthWikiReferencesWithPreferred',
        ],
        rationale:
          'Preferred sources (Merck, global federal ag/vet agencies, global universities) and configurable multi-language English filtering must remain intact.',
      },
      {
        filePath: 'src/storage/vetDocsFolder.ts',
        requiredSubstrings: [
          'PREFERRED_WIKI_SOURCES_LS_KEY',
          'ALLOWED_WIKI_LANGUAGES_LS_KEY',
          'readPreferredWikiSources',
          'readAllowedWikiLanguages',
          'setAllowedWikiLanguages',
        ],
        rationale:
          'Custom preferred wiki sources and multi-language wiki filters must persist locally with built-in locking.',
      },
      {
        filePath: 'src/components/HealthReferencePanel.tsx',
        requiredSubstrings: [
          'Preferred Wiki Sources',
          'findMatchingPreferredWikiSource',
          'handleAddPreferredSource',
          'APP_LOCALE',
        ],
        rationale:
          'Health Reference panel must surface preferred source badges, language requirements, and preferred source management.',
      },
    ],
    restorePlaybook: [
      'Restore `APP_LOCALE = \'en-US\'` and BCP 47 helpers in `src/domain/models.ts`, `<html lang="en-US">` in `index.html`, and `lang: \'en-US\'` in `vite.config.ts`.',
      'Restore `DEFAULT_PREFERRED_WIKI_SOURCES`, `DEFAULT_ALLOWED_WIKI_LANGUAGES`, and language/preferred matching + sorting in `src/domain/healthReference.ts`.',
      'Restore `readPreferredWikiSources`/`readAllowedWikiLanguages`/`setAllowedWikiLanguages` in `src/storage/vetDocsFolder.ts` and UI controls in `src/components/HealthReferencePanel.tsx`.',
    ],
  },
  {
    id: 'IMP-058',
    title: 'Breeding Calendar Moon/Holiday/Weather Overlays, Mileage & Tax Report Log & Personal Barn Journal',
    category: 'species-ux',
    source: 'session',
    userIntent:
      'Add offline moon-phase and holiday markers plus an optional online 7-day weather forecast strip to the Breeding Calendar, track IRS-deductible farm/show mileage with annual tax reports, and add a date-organized Personal Barn Journal with rich text notes, color categories, star ratings, and full-text search.',
    summary:
      'Introduces pure TypeScript `src/domain/breedingCalendar.ts` (synodic moon-phase engine, Gregorian Easter & US/seasonal holiday calculator, monthly calendar grid builder, WMO code mapping) paired with strictly opt-in Open-Meteo client `src/storage/weatherForecast.ts` and `src/components/BreedingCalendarPanel.tsx` inside `BreedingScreen.tsx`; creates `src/domain/mileageTaxLog.ts` (IRS standard mileage presets, integer-cent deduction calculations, formula-safe CSV and XSS-safe annual tax HTML) with `src/components/MileageTaxPanel.tsx` inside `EconomicsLedgerScreen.tsx`; builds `src/domain/barnJournal.ts` (rich-text AST notes via `parseMemoBlocks`, color categories, 0–5 star ratings, pinning, `#tag` hygiene, multi-token full-text search, Markdown/CSV/Print exports) and `src/components/BarnJournalScreen.tsx` at route `journal`; and persists `mileage_logs`, `journal_entries`, and `weatherForecast` settings across SQLite schema v8 (`webSqliteAdapter.ts`), JSON v5/ZIP exports, sample-data purging, cross-species migration, and delta sync outbox (`IMP-025`).',
    files: [
      'src/domain/models.ts',
      'src/domain/breedingCalendar.ts',
      'src/domain/mileageTaxLog.ts',
      'src/domain/barnJournal.ts',
      'src/storage/weatherForecast.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/BreedingCalendarPanel.tsx',
      'src/components/MileageTaxPanel.tsx',
      'src/components/BarnJournalScreen.tsx',
      'src/components/BreedingScreen.tsx',
      'src/components/EconomicsLedgerScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/App.tsx',
      'src/domain/__tests__/breedingCalendar.test.ts',
      'src/domain/__tests__/mileageTaxLog.test.ts',
      'src/domain/__tests__/barnJournal.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/breedingCalendar.ts',
        requiredSubstrings: [
          'computeMoonPhaseForDateIso',
          'getHolidaysForYear',
          'buildBreedingCalendarMonth',
          'formatTemperatureForUnit',
        ],
        rationale:
          'Pure TypeScript moon-phase, holiday, and monthly calendar computation must stay DOM-free and UTC-deterministic.',
      },
      {
        filePath: 'src/storage/weatherForecast.ts',
        requiredSubstrings: [
          'searchWeatherLocations',
          'fetchWeeklyWeatherForecast',
          'clearWeatherForecastCache',
        ],
        rationale:
          'Optional Open-Meteo 7-day forecast client must respect connectivity checks, cache TTL, and reset clearing.',
      },
      {
        filePath: 'src/domain/mileageTaxLog.ts',
        requiredSubstrings: [
          'computeMileageLogDeductionCents',
          'evaluateAnnualMileageTaxSummary',
          'exportMileageTaxCsv',
          'generateAnnualMileageTaxHtml',
        ],
        rationale:
          'IRS mileage tax deduction calculations and formula/HTML-escaped annual exports must remain pure TypeScript.',
      },
      {
        filePath: 'src/domain/barnJournal.ts',
        requiredSubstrings: [
          'normalizeBarnJournalEntry',
          'filterAndSearchJournalEntries',
          'groupJournalEntriesByMonthAndDate',
          'exportBarnJournalMarkdown',
          'generateBarnJournalHtml',
        ],
        rationale:
          'Personal Barn Journal search, grouping, tag normalization, and exports must remain DOM-free and AST-sanitized.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: [
          'SQLITE_SCHEMA_VERSION',
          'mileage_logs',
          'journal_entries',
        ],
        rationale:
          'SQLite schema must create and migrate mileage_logs and journal_entries tables atomically.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: ['saveMileageLog', 'deleteMileageLog', 'saveJournalEntry', 'deleteJournalEntry'],
        rationale: 'Store must expose persisted CRUD mutators for mileage logs and journal entries.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: ['BarnJournalScreen', "route === 'journal'"],
        rationale: 'App router must lazy-load and mount BarnJournalScreen at route journal.',
      },
    ],
    restorePlaybook: [
      'Restore types (`MileageLog`, `BarnJournalEntry`, `WeatherForecastSettings`) in `src/domain/models.ts` plus pure engines `breedingCalendar.ts`, `mileageTaxLog.ts`, and `barnJournal.ts`.',
      'Restore `src/storage/weatherForecast.ts`, SQLite schema v8 (`mileage_logs`, `journal_entries`) in `webSqliteAdapter.ts`, and CRUD actions in `useBarnStore.ts`.',
      'Restore `BreedingCalendarPanel.tsx` in `BreedingScreen.tsx`, `MileageTaxPanel.tsx` in `EconomicsLedgerScreen.tsx`, and `BarnJournalScreen.tsx` at route `journal` in `App.tsx`.',
    ],
  },
  {
    id: 'IMP-059',
    title: "The Judge's Notebook (Dedicated Show Judge Module)",
    category: 'species-ux',
    source: 'session',
    userIntent:
      'Add an optional module for show judges to manage assigned show dates, club contacts, travel mileage, judging expenses, bid statuses, and judging contracts.',
    summary:
      "Introduces optional show-judge models (`enableJudgeNotebook`, `JudgeClubContact`, `JudgeAssignment`, `JudgeExpense`) in `src/domain/models.ts`; implements pure TypeScript DOM-free engine `src/domain/judgeNotebook.ts` (normalizers, draft factories, double-booking date conflict detection, `MileageLog`-integrated financials & reimbursements, annual summary, formula-safe CSV exports, and XSS-escaped printable HTML Judging Agreements & Annual Summary Reports); persists `judge_clubs`, `judge_assignments`, and `judge_expenses` tables across SQLite schema v9 (`webSqliteAdapter.ts`), JSON/ZIP backups, delta sync outbox, sample-data purging, species migration, and health repair; exposes store CRUD actions in `src/hooks/useBarnStore.ts`; and renders opt-in `src/components/JudgeNotebookScreen.tsx` at route `judge` (`G` shortcut) with dashboard and Settings toggles.",
    files: [
      'src/domain/models.ts',
      'src/domain/judgeNotebook.ts',
      'src/storage/storageAdapter.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/domain/syncOutbox.ts',
      'src/domain/inputSanitization.ts',
      'src/domain/syncAndExports.ts',
      'src/domain/backupArchive.ts',
      'src/domain/backupStatus.ts',
      'src/domain/backupVault.ts',
      'src/domain/sampleData.ts',
      'src/domain/speciesMigration.ts',
      'src/domain/dataHealthCheck.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/JudgeNotebookScreen.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/App.tsx',
      'src/domain/__tests__/judgeNotebook.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/models.ts',
        requiredSubstrings: [
          'enableJudgeNotebook?: boolean',
          'JudgeClubContact',
          'JudgeAssignment',
          'JudgeExpense',
        ],
        rationale:
          'BarnSettings must preserve the optional enableJudgeNotebook flag alongside Judge domain interfaces.',
      },
      {
        filePath: 'src/domain/judgeNotebook.ts',
        requiredSubstrings: [
          'detectJudgeDateConflicts',
          'evaluateJudgeAssignmentFinancials',
          'summarizeJudgeNotebook',
          'exportJudgeAssignmentsCsv',
          'generateJudgeContractHtml',
          'generateJudgeSummaryReportHtml',
        ],
        rationale:
          'Pure TypeScript Judge Notebook conflict checks, mileage/expense calculations, CSV exports, and XSS-safe HTML contracts must remain DOM-free.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: [
          'SQLITE_SCHEMA_VERSION = 9',
          'judge_clubs',
          'judge_assignments',
          'judge_expenses',
          'enableJudgeNotebook',
        ],
        rationale:
          'SQLite schema v9 must create, migrate, and persist judge_clubs, judge_assignments, judge_expenses, and enableJudgeNotebook.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: [
          'saveJudgeClub',
          'deleteJudgeClub',
          'saveJudgeAssignment',
          'deleteJudgeAssignment',
          'saveJudgeExpense',
          'deleteJudgeExpense',
        ],
        rationale:
          'Store must expose outbox-tracked CRUD mutators for Judge clubs, assignments, and expenses.',
      },
      {
        filePath: 'src/components/JudgeNotebookScreen.tsx',
        requiredSubstrings: [
          'JudgeNotebookScreen',
          'detectJudgeDateConflicts',
          'generateJudgeContractHtml',
          'PrintPreviewModal',
        ],
        rationale:
          "JudgeNotebookScreen must provide the opt-in gate, conflict alerts, financial tabs, and printable contract preview.",
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: ['JudgeNotebookScreen', "route === 'judge'"],
        rationale: "App router must lazy-load and mount JudgeNotebookScreen at route 'judge'.",
      },
    ],
    restorePlaybook: [
      'Restore Judge types and `enableJudgeNotebook` in `src/domain/models.ts` plus pure engine `src/domain/judgeNotebook.ts`.',
      'Restore SQLite schema v9 tables (`judge_clubs`, `judge_assignments`, `judge_expenses`) in `webSqliteAdapter.ts` and sync/export wiring.',
      'Restore CRUD methods in `useBarnStore.ts`, `JudgeNotebookScreen.tsx`, Settings toggle, Dashboard launcher, and route `judge` in `App.tsx`.',
    ],
  },
  {
    id: 'IMP-060',
    title: 'Optional Cloud App-Folder Sync (Google Drive AppFolder / OneDrive AppRoot) & 403/507 Quota Circuit Breaker',
    category: 'diagnostics-sync',
    source: 'session',
    summary:
      'Adds strictly opt-in personal cloud sync (`enabled: false` by default, zero Firebase, zero `.env` secrets) targeting isolated Google Drive `appDataFolder` and OneDrive `special/approot` directories using memory-only OAuth tokens and PKCE; plans incremental delta chunks that automatically downshift to tight-storage chunking (`25 ops / 48 KiB`) when storage usage or device tier is constrained; and intercepts HTTP 403/507 quota responses with an immediate persistent circuit breaker that pauses automated cloud syncs, prunes oldest rolling cloud backups, surfaces persistent banners in `App.tsx` and Sync panels, and never blocks or rolls back local IndexedDB writes.',
    userIntent:
      'Support strictly optional app-folder cloud delta sync with tight-storage incremental chunking and an immediate 403/507 quota circuit breaker that protects local IndexedDB writes.',
    files: [
      'src/domain/cloudAppFolderSync.ts',
      'src/storage/cloudAppFolderSync.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/CloudAppFolderSyncPanel.tsx',
      'src/components/ImportExportHubScreen.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/App.tsx',
      'src/domain/__tests__/cloudAppFolderSync.test.ts',
      'src/storage/__tests__/cloudAppFolderSync.test.ts',
    ],
    invariants: [
      {
        filePath: 'src/domain/cloudAppFolderSync.ts',
        requiredSubstrings: [
          'planIncrementalCloudDeltaChunks',
          'classifyCloudHttpResponse',
          'tripCloudQuotaCircuitBreaker',
          'selectRollingCloudBackupsToPrune',
          'shouldRunAutomatedCloudSync',
        ],
        rationale:
          'Pure TypeScript incremental delta chunk planner, HTTP 403/507 classifier, circuit breaker state machine, and rolling backup pruner must remain DOM-free.',
      },
      {
        filePath: 'src/storage/cloudAppFolderSync.ts',
        requiredSubstrings: [
          'memoryTokensByProvider',
          'createGoogleDriveAppFolderTransport',
          'createOneDriveAppRootTransport',
          'runCloudAppFolderSync',
        ],
        rationale:
          'Cloud app-folder transport must keep OAuth tokens strictly in JS memory, isolate appDataFolder/approot, and never block or roll back local IndexedDB writes.',
      },
      {
        filePath: 'src/hooks/useBarnStore.ts',
        requiredSubstrings: [
          'executeCloudAppFolderSync',
          'scheduleBackgroundCloudSync',
          'resetAndRetryCloudSync',
          'dismissCloudCircuitBreakerWarning',
        ],
        rationale:
          'Store must schedule non-blocking background cloud delta sync after outbox commits and expose manual sync, reset-and-retry, and warning dismissal controls.',
      },
      {
        filePath: 'src/components/CloudAppFolderSyncPanel.tsx',
        requiredSubstrings: [
          'CloudAppFolderSyncPanel',
          'Reset Circuit Breaker',
          'Sync Cloud App-Folder Now',
        ],
        rationale:
          'Cloud App-Folder Sync panel must provide opt-in provider/token controls, tight-storage chunk indicators, and circuit breaker reset actions.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: [
          'store.cloudSyncState.circuitBreaker.tripped',
          'store.dismissCloudCircuitBreakerWarning',
          'cloudSyncState={store.cloudSyncState}',
        ],
        rationale:
          'App shell must display the persistent global 403/507 quota circuit breaker warning banner and wire cloud sync state into ImportExportHubScreen and SettingsAndSyncScreen.',
      },
    ],
    restorePlaybook: [
      'Restore pure chunking, HTTP 403/507 classification, and circuit breaker state helpers in `src/domain/cloudAppFolderSync.ts`.',
      'Restore memory-only OAuth token store, Google Drive/OneDrive transports, and cross-tab-locked coordinator in `src/storage/cloudAppFolderSync.ts`.',
      'Restore non-blocking `scheduleBackgroundCloudSync`, `CloudAppFolderSyncPanel.tsx`, and global persistent circuit breaker warning banner in `useBarnStore.ts`, `ImportExportHubScreen.tsx`, `SettingsAndSyncScreen.tsx`, and `App.tsx`.',
    ],
  },
  {
    id: 'IMP-061',
    title: 'Developer Console Tabbed Reorganization, Collapsible Subunits & OPFS/Runtime Telemetry',
    category: 'diagnostics-sync',
    source: 'session',
    summary:
      'Reorganizes "The Techy Stuff" (`TechyStuffScreen.tsx`) with an always-open title header containing an "Open All Sections / Collapse All Sections" toggle, 4 segmented workspace tabs (`Storage & OPFS`, `Runtime & Sync`, `Logs & Support`, `Maintenance & Resets`), and 15 individually collapsible subunits (`createDefaultSubunitOpenMap(false)` — including the host telemetry bar, the permanent non-closeable 5-tier comparison matrix `data-permanent-tier-hierarchy="true"`, and modular `DiagnosticsAndSupportPanel` `visibleSections` + `collapsible` cards). Surfaces previously unexposed storage and runtime utilities: read-only OPFS `/tmp`/`/backups`/`/archives` inspector (`inspectOpfsNamespaces`), OPFS canary & orphan sweep controls, Prior-Use Sentinel & prune sync warning status, 20-collection `computeSnapshotCollectionFootprint`, 14-signal browser compatibility matrix, idle Archive Worker heap reclaim, live IDB/BroadcastChannel/WebLocks/OPFS handle counters (`getTrackedActiveResourceCounts`, `getActiveOpfsHandleCount`), Freeze Queue controls, clock skew causality & release manifest diff, Sync Outbox/Cloud breaker status, and Native Bridge event log.',
    userIntent:
      'Optimize the developer page, identify and surface unadded useful internal tools, organize the workspace into clean tabbed and collapsible subunits with a header Open All toggle to improve UI/UX.',
    files: [
      'src/domain/techyStuffGuardrails.ts',
      'src/domain/__tests__/techyStuffGuardrails.test.ts',
      'src/storage/storageProbes.ts',
      'src/storage/opfsTempStream.ts',
      'src/storage/opfsStorage.ts',
      'src/components/DiagnosticsAndSupportPanel.tsx',
      'src/components/TechyStuffScreen.tsx',
      'src/App.tsx',
    ],
    invariants: [
      {
        filePath: 'src/domain/techyStuffGuardrails.ts',
        requiredSubstrings: [
          'DEVELOPER_CONSOLE_TABS',
          'DEVELOPER_CONSOLE_SUBUNIT_IDS',
          'createDefaultSubunitOpenMap',
          'normalizeDeveloperConsoleTab',
          'computeSnapshotCollectionFootprint',
        ],
        rationale:
          'Pure TypeScript developer console tab registry, 15-subunit collapsible state helpers, and 20-collection snapshot footprint calculator must remain DOM-free.',
      },
      {
        filePath: 'src/storage/storageProbes.ts',
        requiredSubstrings: ['getTrackedActiveResourceCounts'],
        rationale:
          'Storage probes must expose live IDB connection/transaction, BroadcastChannel, and Web Lock resource counts for runtime inspection.',
      },
      {
        filePath: 'src/storage/opfsStorage.ts',
        requiredSubstrings: [
          'inspectOpfsNamespaces',
          'getActiveOpfsHandleCount',
          'getActiveTempFiles',
        ],
        rationale:
          'OPFS storage adapter must expose read-only namespace inspection across /tmp, /backups, and /archives alongside live OPFS handle counters.',
      },
      {
        filePath: 'src/components/DiagnosticsAndSupportPanel.tsx',
        requiredSubstrings: ['visibleSections', 'collapsible'],
        rationale:
          'DiagnosticsAndSupportPanel must support section filtering (`all`, `logs-and-support`, `maintenance`) and optional collapsible outer wrapping without breaking standalone rendering.',
      },
      {
        filePath: 'src/components/TechyStuffScreen.tsx',
        requiredSubstrings: [
          'DEVELOPER_CONSOLE_TABS',
          'DEVELOPER_CONSOLE_SUBUNIT_IDS',
          'createDefaultSubunitOpenMap',
          'Open All Sections',
          'inspectOpfsNamespaces',
          'computeSnapshotCollectionFootprint',
          'detectCurrentBrowserCompatibility',
          'getTrackedActiveResourceCounts',
        ],
        rationale:
          'TechyStuffScreen must keep the title header open with an Open All Sections toggle, make all 15 subunits collapsible, and surface OPFS inspection, snapshot footprint, browser compatibility matrix, and live handle telemetry.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: [
          'syncOperations={store.syncOperations}',
          'backupSyncStatus={store.backupSyncStatus}',
        ],
        rationale:
          'App shell must pass live sync outbox operations and backup sync folder status into TechyStuffScreen.',
      },
    ],
    restorePlaybook: [
      'Restore `DEVELOPER_CONSOLE_TABS`, `DEVELOPER_CONSOLE_SUBUNIT_IDS`, `createDefaultSubunitOpenMap`, `normalizeDeveloperConsoleTab`, and `computeSnapshotCollectionFootprint` in `src/domain/techyStuffGuardrails.ts`.',
      'Restore `getTrackedActiveResourceCounts` in `src/storage/storageProbes.ts`, plus `getActiveOpfsHandleCount`, `getActiveTempFiles`, and `inspectOpfsNamespaces` in `src/storage/opfsTempStream.ts` and `src/storage/opfsStorage.ts`.',
      'Restore `visibleSections` and `collapsible` props in `src/components/DiagnosticsAndSupportPanel.tsx`, the collapsible 15-subunit tabbed workspace layout + header Open All toggle + telemetry cards in `src/components/TechyStuffScreen.tsx`, and live sync props in `src/App.tsx`.',
    ],
  },
  {
    id: 'IMP-062',
    title: 'Alpha-to-Release Optimization: CI & Android APK Hardening, IndexedDB Quota Recovery, Print Stage XSS Sanitization & Sub-500kB Bundle Splits',
    category: 'stability-pwa',
    source: 'session',
    userIntent:
      'Prepare Community Pedigree from Alpha to release with zero new features by fixing highest-risk CI, storage, security, and cold-start bundle bottlenecks while guaranteeing bootability.',
    summary:
      'Restores clean `.env.example` (IMP-008/IMP-052); scopes `NODE_ENV: production` strictly to the Vite build step in `.github/workflows/build-android-apk.yml` so `npm install` never skips `devDependencies` (`vitest`, `tsx`, `typescript`, `vite-plugin-pwa`); adds `status.json` to Android `PedigreeAssetPathHandler.kt` `Cache-Control: no-cache`; implements `executeIdbWriteWithQuotaRecovery` in `src/storage/webSqliteAdapter.ts` to purge OPFS `/tmp` and non-essential fallback caches and retry once on `QuotaExceededError`; hardens `#barn-print-stage` in `src/components/PrintPreviewModal.tsx` with `sanitizePrintStageHtml` + DOM node/attribute scrubbing; decouples `src/domain/backupVault.ts` from `backupArchive.ts` via direct `./binaryEncoding` imports (eliminating Vite `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings); converts cold imports (`geneticsEngine`, `syncAndExports`, `weatherForecast`) in `src/hooks/useBarnStore.ts` and `improvementRegistry` (~206 kB) in `src/components/DiagnosticsAndSupportPanel.tsx` to on-demand dynamic imports; and refines Rolldown `codeSplitting` groups with `includeDependenciesRecursively: false` in `vite.config.ts`, cutting `index-*.js` from 645 kB to 350 kB (-45.8%) and `TechyStuffScreen` from 339 kB to 136 kB (-59.9%) with zero Vite >500 kB chunk warnings.',
    files: [
      '.env.example',
      '.github/workflows/build-android-apk.yml',
      'android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/PedigreeAssetPathHandler.kt',
      'src/storage/webSqliteAdapter.ts',
      'src/components/PrintPreviewModal.tsx',
      'src/domain/backupVault.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/DiagnosticsAndSupportPanel.tsx',
      'vite.config.ts',
      'src/utils/__tests__/printPreviewHelpers.test.ts',
      'src/domain/__tests__/releaseReadiness.test.ts',
    ],
    invariants: [
      {
        filePath: '.github/workflows/build-android-apk.yml',
        requiredSubstrings: [
          'Install PWA dependencies & run verification suite',
          'Build production PWA bundle (root path)',
          'NODE_ENV: production',
        ],
        rationale:
          'Android APK CI must install devDependencies without NODE_ENV=production and apply NODE_ENV=production strictly to the Vite production build step.',
      },
      {
        filePath:
          'android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/PedigreeAssetPathHandler.kt',
        requiredSubstrings: ['resolvedPath == "status.json"'],
        rationale:
          'Android WebView asset handler must serve status.json with Cache-Control: no-cache alongside version.json.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: ['executeIdbWriteWithQuotaRecovery', 'purgeOpfsTmp'],
        rationale:
          'Primary IndexedDB writes must catch QuotaExceededError, purge OPFS /tmp and non-essential fallback caches, and retry once before failing.',
      },
      {
        filePath: 'src/components/PrintPreviewModal.tsx',
        requiredSubstrings: ['sanitizePrintStageHtml'],
        rationale:
          'Print stage DOM mounting must strip executable tags, inline event handlers, and dangerous URLs before inserting HTML into #barn-print-stage.',
      },
      {
        filePath: 'src/domain/backupVault.ts',
        requiredSubstrings: ["from './binaryEncoding'"],
        rationale:
          'backupVault.ts must import binary encoding helpers directly from binaryEncoding.ts instead of pulling backupArchive.ts into the startup graph.',
      },
      {
        filePath: 'src/components/DiagnosticsAndSupportPanel.tsx',
        requiredSubstrings: ['loadImprovementRegistryModule', "import('../domain/improvementRegistry')"],
        rationale:
          'DiagnosticsAndSupportPanel must lazy-load the 200+ kB improvementRegistry manifest on demand instead of bloating TechyStuffScreen.',
      },
      {
        filePath: 'vite.config.ts',
        requiredSubstrings: [
          'storage-sqlite',
          'core-backups',
          'improvement-registry',
          'includeDependenciesRecursively: false',
        ],
        rationale:
          'Rolldown codeSplitting must isolate app storage, backup, domain, and registry chunks with includeDependenciesRecursively: false so no chunk exceeds 500 kB.',
      },
    ],
    restorePlaybook: [
      'Keep `.env.example` clean, keep `NODE_ENV: production` scoped only to `npm run build` in `.github/workflows/build-android-apk.yml`, and preserve `resolvedPath == "status.json"` no-cache handling in `PedigreeAssetPathHandler.kt`.',
      'Preserve `executeIdbWriteWithQuotaRecovery` in `src/storage/webSqliteAdapter.ts` and `sanitizePrintStageHtml` in `src/components/PrintPreviewModal.tsx`.',
      'Keep `backupVault.ts` importing from `./binaryEncoding`, keep dynamic imports of `geneticsEngine`, `syncAndExports`, and `weatherForecast` in `src/hooks/useBarnStore.ts`, keep lazy `loadImprovementRegistryModule` in `DiagnosticsAndSupportPanel.tsx`, and retain isolated Rolldown `codeSplitting` groups in `vite.config.ts`.',
    ],
  },
  {
    id: 'IMP-063',
    title: 'Mobile Chrome Dev Preview Boot Memory Guard: Inline Sourcemap Stripping, Direct Lucide Icon ESM & Lazy Error-Boundary Export',
    category: 'stability-pwa',
    source: 'session',
    userIntent:
      'Fix mobile Chrome Preview iframe Aw Snap crashes on startup by eliminating excessive dev-mode JS parse memory and inline source map bloat.',
    summary:
      'Adds dev-only `devInlineSourcemapStripPlugin` (stripping ~9.5 MB of base64 inline sourcemaps from served JS/CSS responses) and `devLucideDirectImportPlugin` + `optimizeDeps.exclude: [\'lucide-react\']` (rewriting `lucide-react` barrel imports to direct per-icon ESM files and eliminating the 3.72 MB monolithic icon bundle and 504 dep re-optimization errors) in `vite.config.ts`, while deferring `syncAndExports` imports in `CrashErrorBoundary.tsx` and `TechyStuffErrorBoundary.tsx` to click handlers—cutting dev boot payload from 13.52 MB to 3.05 MB (-77.4%) with zero production build changes.',
    files: [
      'vite.config.ts',
      'src/components/CrashErrorBoundary.tsx',
      'src/components/TechyStuffErrorBoundary.tsx',
    ],
    invariants: [
      {
        filePath: 'vite.config.ts',
        requiredSubstrings: [
          'devInlineSourcemapStripPlugin',
          'devLucideDirectImportPlugin',
          "exclude: ['lucide-react']",
        ],
        rationale:
          'Dev preview must strip multi-megabyte base64 inline sourcemaps and resolve lucide-react icons directly without pre-bundling all 1,600+ icons so mobile Chrome preview iframes do not OOM.',
      },
      {
        filePath: 'src/components/CrashErrorBoundary.tsx',
        requiredSubstrings: ["import('../domain/syncAndExports')"],
        forbiddenSubstrings: ["from '../domain/syncAndExports'"],
        rationale:
          'CrashErrorBoundary mounts at root and must load formatTimestampedBackupSlug dynamically on click rather than eagerly pulling syncAndExports into startup.',
      },
      {
        filePath: 'src/components/TechyStuffErrorBoundary.tsx',
        requiredSubstrings: ["import('../domain/syncAndExports')"],
        forbiddenSubstrings: ["from '../domain/syncAndExports'"],
        rationale:
          'TechyStuffErrorBoundary mounts in App.tsx and must load formatTimestampedBackupSlug dynamically on click rather than eagerly pulling syncAndExports into startup.',
      },
    ],
    restorePlaybook: [
      'Keep `devLucideDirectImportPlugin()`, `devInlineSourcemapStripPlugin()`, and `optimizeDeps.exclude: [\'lucide-react\']` in `vite.config.ts`.',
      'Keep dynamic `import(\'../domain/syncAndExports\')` inside crash log download handlers in `CrashErrorBoundary.tsx` and `TechyStuffErrorBoundary.tsx`.',
    ],
  },
  {
    id: 'IMP-064',
    title: 'GitHub Pages Deployment, Subpath Routing & Search Engine Optimization (SEO)',
    category: 'ci-tooling',
    source: 'session',
    userIntent:
      'Optimize all GitHub Pages for utility, setup, social preview cards, and search engine discoverability.',
    summary:
      'Enhances GitHub Pages delivery and SEO discovery: configures GitHub repository description, homepage URL, and 16 topics; optimizes index.html with keyword-rich meta tags, canonical link, Open Graph preview tags, Twitter summary card, and Schema.org WebApplication structured data; creates public/robots.txt, public/sitemap.xml, and public/404.html SPA router fallback; updates deploy-pages.yml to trigger on both main and release branches while verifying robots.txt, sitemap.xml, and 404.html in distribution; and adds GitHub Pages status badges and direct web app launch links to README.md and package.json.',
    files: [
      'index.html',
      'public/robots.txt',
      'public/sitemap.xml',
      'public/404.html',
      '.github/workflows/deploy-pages.yml',
      'README.md',
      'package.json',
    ],
    invariants: [
      {
        filePath: 'index.html',
        requiredSubstrings: [
          'https://askkim.github.io/Pedigree/',
          'application/ld+json',
          'og:image',
          'twitter:card',
          'rel="canonical"',
        ],
        rationale:
          'index.html must maintain canonical, OpenGraph, Twitter card, and Schema.org structured data for SEO.',
      },
      {
        filePath: 'public/robots.txt',
        requiredSubstrings: ['User-agent: *', 'Sitemap: https://askkim.github.io/Pedigree/sitemap.xml'],
        rationale: 'public/robots.txt must guide search crawlers to the sitemap.',
      },
      {
        filePath: 'public/sitemap.xml',
        requiredSubstrings: ['<loc>https://askkim.github.io/Pedigree/</loc>'],
        rationale: 'public/sitemap.xml must define the canonical GitHub Pages location.',
      },
      {
        filePath: 'public/404.html',
        requiredSubstrings: ['Community Pedigree Project - GitHub Pages SPA Fallback'],
        rationale: 'public/404.html must provide client-side route fallback for GitHub Pages.',
      },
      {
        filePath: '.github/workflows/deploy-pages.yml',
        requiredSubstrings: ['- main', '- release', 'dist/robots.txt', 'dist/sitemap.xml'],
        rationale:
          'deploy-pages.yml must deploy from both main and release branches and verify SEO artifacts.',
      },
      {
        filePath: 'package.json',
        requiredSubstrings: ['"homepage": "https://askkim.github.io/Pedigree/"'],
        rationale: 'package.json must state the official GitHub Pages homepage URL.',
      },
    ],
    restorePlaybook: [
      'Preserve SEO meta tags, canonical link, Open Graph, and JSON-LD structured data in `index.html`.',
      'Keep `public/robots.txt`, `public/sitemap.xml`, and `public/404.html` in place.',
      'Ensure `.github/workflows/deploy-pages.yml` triggers on `main` and `release` and verifies `dist/robots.txt` and `dist/sitemap.xml`.',
      'Keep `"homepage": "https://askkim.github.io/Pedigree/"` in `package.json` and live links in `README.md`.',
    ],
  },
  {
    id: 'IMP-065',
    title: 'Boot Stability & Stale-Chunk Recovery: 504 Outdated-Dep Auto-Reload, Pre-Boot Error Separation & Safe EOF Sourcemap Stripping',
    category: 'stability-pwa',
    release: 'alpha-3',
    source: 'session',
    userIntent:
      'Eliminate transient first-load boot errors after updates or dev restarts that only disappear on manual refresh.',
    summary:
      'Hardens startup resilience across 4 layers: (1) updates `stripDevSourceMapTrailer` and `devInlineSourcemapStripPlugin` in `vite.config.ts` to strip only true EOF `sourceMappingURL` trailers and guard `Content-Length` against encoded/chunked headers; (2) splits genuine ES2018 syntax/parse incompatibility from transient module fetch / HTTP 504 `Outdated Optimize Dep` errors in `index.html`, adding capture-phase `<script>` and `unhandledrejection` pre-boot listeners with a 15-second cooldown-guarded reload that clears `pedigree_pending_boot_ts` so recovery never trips crash-loop protection; (3) upgrades `src/main.tsx` dev-mode cleanup to trigger a single guarded reload whenever a stale Service Worker controller was active; and (4) adds `isRecoverableChunkError` + `attemptOneTimeChunkReload` to `src/utils/lazyRoute.tsx` so stale dynamic imports and `RouteErrorBoundary` Retry Screen reload cleanly instead of reusing memoized rejected ES module promises.',
    files: [
      'vite.config.ts',
      'index.html',
      'src/main.tsx',
      'src/utils/lazyRoute.tsx',
      'src/utils/__tests__/lazyRoute.test.ts',
    ],
    invariants: [
      {
        filePath: 'vite.config.ts',
        requiredSubstrings: ['export function stripDevSourceMapTrailer', 'hasEncoding'],
        rationale:
          'Dev sourcemap stripping must only remove trailing EOF comments and skip Content-Length mutation on encoded responses.',
      },
      {
        filePath: 'index.html',
        requiredSubstrings: [
          'PREBOOT_RELOAD_KEY',
          'attemptOneShotPreBootReload',
          'handlePreBootTransientFetchFailure',
        ],
        rationale:
          'Pre-boot guard must separate transient module fetch/504 glitches from real ES2018 browser incompatibility and recover via cooldown-guarded reload.',
      },
      {
        filePath: 'src/main.tsx',
        requiredSubstrings: ['hadActiveController', 'pedigree_dev_sw_cleanup_reload_ts'],
        rationale:
          'Dev startup must reload cleanly once if a stale Service Worker controller intercepted the initial boot.',
      },
      {
        filePath: 'src/utils/lazyRoute.tsx',
        requiredSubstrings: ['isRecoverableChunkError', 'attemptOneTimeChunkReload'],
        rationale:
          'Lazy route loader and RouteErrorBoundary must detect stale chunk / 504 errors and perform a guarded clean reload instead of retrying a permanently rejected ES module entry.',
      },
    ],
    restorePlaybook: [
      'Keep EOF-only `stripDevSourceMapTrailer` checks and `hasEncoding` guard in `vite.config.ts`.',
      'Preserve `attemptOneShotPreBootReload`, `handlePreBootTransientFetchFailure`, capture-phase script `error`, and pre-boot `unhandledrejection` handlers in `index.html`.',
      'Preserve `hadActiveController` reload guard in `src/main.tsx`.',
      'Preserve `isRecoverableChunkError` and `attemptOneTimeChunkReload` in `src/utils/lazyRoute.tsx`.',
    ],
  },
  {
    id: 'IMP-066',
    title:
      'Alpha 3 Modular Core Primitives, Multi-Platform Storage Bridges, Decoupled @features/* Modules & Parameterized Android Wrapper',
    category: 'stability-pwa',
    release: 'alpha-3',
    source: 'session',
    userIntent:
      'Execute the Hydrogen modular architecture plan with strict three-layer boundaries, iOS/desktop/Android storage and print bridges, decoupled feature packages, and zero boot or Alpha 2 baseline regressions.',
    summary:
      'Establishes `@engine/primitives/*` pure sanitization and crypto utilities; upgrades `@engine/bridge/*` with request-ID-correlated iOS `WKWebView` SQLite storage replies + timeouts (`ios-wrapper/BRIDGE_CONTRACT.md`), runtime Electron/Tauri `desktopBridgeAdapter.ts` delegation, and Android WebView two-frame `ArrayBuffer`/print parity; enforces strict `requiresIosStorageBridge` anti-eviction routing in `resilientStorageAdapter.ts` and `NativeBridgeStorageAdapter`; parameterizes `android-wrapper/` names, shortcuts, prefs, clipboard labels, and export filenames via Gradle `pedigree.wrapper.*` properties while keeping `minSdk = 26`; extracts 5 new domain-agnostic feature modules (`@features/csv-exporter`, `@features/backup-vault`, `@features/document-export`, `@features/ics-calendar`, `@features/ocr-parser`) alongside `@features/csv-importer`; and wires lightweight `PEDIGREE_APP_CONFIG` + end-to-end repositories and workflows through `@app/pedigreeAppWiring.ts` and `useBarnStore.ts` while deferring standalone `core` extraction until transfer readiness.',
    files: [
      'HYDROGEN_MODULAR_PLAN.md',
      'src/engine/primitives/index.ts',
      'src/engine/primitives/sanitization.ts',
      'src/engine/primitives/crypto.ts',
      'src/engine/bridge/platformBridge.ts',
      'src/engine/bridge/desktopBridgeAdapter.ts',
      'src/engine/storage/resilientStorageAdapter.ts',
      'src/engine/storage/nativeBridgeStorageAdapter.ts',
      'src/features/csv-exporter/csvExporter.ts',
      'src/features/backup-vault/portableVault.ts',
      'src/features/document-export/htmlPrintPackage.ts',
      'src/features/ics-calendar/icsBuilder.ts',
      'src/features/ocr-parser/ocrTextPipeline.ts',
      'src/app/pedigreeAppConfig.ts',
      'src/app/pedigreeAppWiring.ts',
      'src/hooks/useBarnStore.ts',
      'android-wrapper/app/build.gradle.kts',
      'android-wrapper/settings.gradle.kts',
      'ios-wrapper/BRIDGE_CONTRACT.md',
    ],
    invariants: [
      {
        filePath: 'src/engine/primitives/sanitization.ts',
        requiredSubstrings: ['isSafeObjectKey', 'sanitizeCsvFormulaCell', 'escapeSafeHtml'],
        rationale: 'Shared pure sanitization helpers must live in @engine/primitives without DOM/Node or domain dependencies.',
      },
      {
        filePath: 'src/engine/primitives/crypto.ts',
        requiredSubstrings: ['fnv1a64Hex', 'sha256HexPure', 'wrapGenericEncryptedZip'],
        rationale: 'Shared FNV-1a and SHA-256 primitives must live in @engine/primitives.',
      },
      {
        filePath: 'src/engine/bridge/desktopBridgeAdapter.ts',
        requiredSubstrings: ['detectDesktopShellType', 'createDesktopBridgeDelegates'],
        rationale: 'Desktop Electron/Tauri runtime detection must remain dependency-free in @engine/bridge.',
      },
      {
        filePath: 'src/engine/bridge/platformBridge.ts',
        requiredSubstrings: [
          'DEFAULT_IOS_STORAGE_REPLY_GLOBAL',
          'handleStorageBridgeResponse',
          'openExternalUrl',
        ],
        rationale: 'PlatformBridge must support correlated iOS WKWebView storage replies and unified safe URL/desktop/Android routing.',
      },
      {
        filePath: 'src/engine/storage/nativeBridgeStorageAdapter.ts',
        requiredSubstrings: ['return caps.hasNativeBridge;', 'Native storage bridge is not configured'],
        rationale: 'NativeBridgeStorageAdapter must verify caps.hasNativeBridge is active instead of accepting unbacked iOS signals.',
      },
      {
        filePath: 'src/engine/storage/resilientStorageAdapter.ts',
        requiredSubstrings: ['if (caps.requiresIosStorageBridge)', 'fnv1a64Hex'],
        rationale: 'createResilientStorageAdapter must strictly route ios-wkwebview through native bridge storage rather than evictable IndexedDB/OPFS.',
      },
      {
        filePath: 'src/features/csv-exporter/csvExporter.ts',
        requiredSubstrings: ['exportRecordsToCsv', 'createCsvExporterFeatureModule'],
        rationale: 'Decoupled CSV exporter must remain domain-agnostic in @features/csv-exporter.',
      },
      {
        filePath: 'src/features/backup-vault/portableVault.ts',
        requiredSubstrings: ['exportPortableVault', 'restorePortableVault', 'createBackupVaultFeatureModule'],
        rationale: 'Decoupled SHA-256 verified portable vault must remain domain-agnostic in @features/backup-vault.',
      },
      {
        filePath: 'src/features/document-export/htmlPrintPackage.ts',
        requiredSubstrings: ['buildPrintableHtmlDocument', 'dispatchPrintPackage', 'createDocumentExportFeatureModule'],
        rationale: 'Printable HTML packager must dispatch through IPlatformBridge without domain coupling.',
      },
      {
        filePath: 'src/features/ics-calendar/icsBuilder.ts',
        requiredSubstrings: ['buildGenericIcsCalendar', 'createIcsCalendarFeatureModule'],
        rationale: 'RFC 5545 calendar builder must accept generic events without livestock domain coupling.',
      },
      {
        filePath: 'src/features/ocr-parser/ocrTextPipeline.ts',
        requiredSubstrings: ['groupWordBoxesIntoLines', 'extractStructuredFieldsFromOcr', 'createOcrParserFeatureModule'],
        rationale: 'OCR line/field extraction pipeline must remain schema-driven and domain-agnostic.',
      },
      {
        filePath: 'src/app/pedigreeAppConfig.ts',
        requiredSubstrings: ['export const PEDIGREE_APP_CONFIG', 'document-export', 'backup-vault'],
        forbiddenSubstrings: ['fflate', 'sql.js'],
        rationale: 'PEDIGREE_APP_CONFIG must stay lightweight so useBarnStore startup does not pull ZIP or SQLite WASM engines.',
      },
      {
        filePath: 'src/app/pedigreeAppWiring.ts',
        requiredSubstrings: [
          'exportAnimalCsvFromStorage',
          'exportPedigreePortableVault',
          'printPedigreeDocument',
          'buildBarnTasksIcsFeed',
          'extractPedigreeOcrSummary',
        ],
        rationale: '@app/pedigreeAppWiring.ts is the sole composition layer connecting domain configs to @features/* and @engine/*.',
      },
      {
        filePath: 'android-wrapper/app/build.gradle.kts',
        requiredSubstrings: [
          'minSdk = 26',
          'pedigree.wrapper.appName',
          'pedigree.wrapper.debugPrefsName',
          'pedigree.wrapper.diagnosticsClipLabel',
          'pedigree.wrapper.defaultExportFilename',
        ],
        rationale: 'Android wrapper must preserve minSdk = 26 and Gradle property parameterization.',
      },
      {
        filePath: 'ios-wrapper/BRIDGE_CONTRACT.md',
        requiredSubstrings: ['NATIVE_STORAGE_OP', '__platformBridgeStorageReceive', '.applicationSupportDirectory'],
        rationale: 'iOS WKWebView SQLite storage bridge protocol must remain documented for native Apple shell implementations.',
      },
    ],
    restorePlaybook: [
      'Restore `@engine/primitives/*`, `@engine/bridge/desktopBridgeAdapter.ts`, and request-ID-correlated iOS storage reply handling in `@engine/bridge/platformBridge.ts`.',
      'Keep strict `caps.hasNativeBridge` verification in `NativeBridgeStorageAdapter` and anti-eviction routing in `createResilientStorageAdapter`.',
      'Preserve all six decoupled `@features/*` modules (`csv-importer`, `csv-exporter`, `backup-vault`, `document-export`, `ics-calendar`, `ocr-parser`) and `@app/pedigreeAppConfig.ts` + `@app/pedigreeAppWiring.ts` composition wiring.',
      'Maintain Gradle `pedigree.wrapper.*` parameterization and `minSdk = 26` in `android-wrapper/app/build.gradle.kts`.',
    ],
  },
  {
    id: 'IMP-067',
    title: 'NEON Phases 1–2: Boot-Entry Lock, 100% Extraction Inventory & Pure Shared Primitives Decoupling',
    category: 'stability-pwa',
    source: 'session',
    release: 'alpha-3',
    userIntent:
      'Lock boot/entry stability, classify 100% of shared vs domain modules, and extract pure content-agnostic primitives from remaining shared src/domain and src/utils modules without breaking Alpha 2 exports.',
    summary:
      'Establishes immutable boot-entry SHA-256 lock checksums (`BOOT_ENTRY_LOCK_CHECKSUMS`) for `src/main.tsx`, `src/App.tsx`, and `index.html`; classifies 100% of non-test modules across `src/domain/`, `src/features/`, `src/app/`, `src/storage/`, and `src/utils/` in `EXTRACTION_INVENTORY.md` (recording `FLASH_HYGIENE_PLAN.md` absorption and ES2018/`import/` config parity); extracts pure content-agnostic primitives (`themeColor.ts`, `qrCodec.ts`, `genericSync.ts`, `genericRegistries.ts`, `deviceCapabilityCore.ts`, `pdfDocumentExtractor.ts`, plus expanded `crypto.ts` and `sanitization.ts`) behind thin Alpha 2 compatibility facades; decouples `archiveAndCsvUtils.ts` and reusable `src/utils/*` (`es2018Shims.ts`, `useVirtualWindow.ts`, `lazyRoute.tsx`); wires domain factories in `@app/pedigreeAppWiring.ts`; and enforces automated zero-domain-term, import-direction, and boot-lock tests while deferring standalone `core` extraction until Phase 7.',
    files: [
      'EXTRACTION_INVENTORY.md',
      'ROADMAP.md',
      'src/domain/improvementRegistry.ts',
      'src/engine/primitives/index.ts',
      'src/engine/primitives/crypto.ts',
      'src/engine/primitives/sanitization.ts',
      'src/engine/primitives/themeColor.ts',
      'src/engine/primitives/qrCodec.ts',
      'src/engine/primitives/genericSync.ts',
      'src/engine/primitives/genericRegistries.ts',
      'src/engine/primitives/deviceCapabilityCore.ts',
      'src/engine/primitives/pdfDocumentExtractor.ts',
      'src/engine/codecs/archiveAndCsvUtils.ts',
      'src/domain/importers/pdfScanExtractor.ts',
      'src/app/pedigreeAppWiring.ts',
      'src/utils/es2018Shims.ts',
      'src/utils/useVirtualWindow.ts',
      'src/utils/lazyRoute.tsx',
      'src/domain/__tests__/modularLayerArchitecture.test.ts',
    ],
    invariants: [
      {
        filePath: 'EXTRACTION_INVENTORY.md',
        requiredSubstrings: [
          'FLASH_HYGIENE_PLAN.md',
          'extractable-core',
          'extractable-feature',
          'extractable-ui-util',
          'pedigree-domain',
        ],
        rationale: 'Extraction inventory must document FLASH_HYGIENE_PLAN.md absorption and classify 100% of non-test source files.',
      },
      {
        filePath: 'src/domain/improvementRegistry.ts',
        requiredSubstrings: ['export const BOOT_ENTRY_LOCK_CHECKSUMS', 'src/main.tsx', 'src/App.tsx', 'index.html'],
        rationale: 'Boot-entry SHA-256 lock checksums must remain registered to protect active boot stability.',
      },
      {
        filePath: 'src/engine/primitives/index.ts',
        requiredSubstrings: [
          './themeColor',
          './qrCodec',
          './genericSync',
          './genericRegistries',
          './deviceCapabilityCore',
          './pdfDocumentExtractor',
        ],
        rationale: 'Pure content-agnostic Phase 2 primitives must stay exported from @engine/primitives.',
      },
      {
        filePath: 'src/engine/codecs/archiveAndCsvUtils.ts',
        requiredSubstrings: ['@engine/primitives/sanitization', '@engine/primitives/genericRegistries'],
        rationale: 'archiveAndCsvUtils.ts must depend solely on content-agnostic @engine/primitives contracts.',
      },
      {
        filePath: 'src/app/pedigreeAppWiring.ts',
        requiredSubstrings: [
          'wrapPedigreeEncryptedZip',
          'PEDIGREE_P2P_WIRE_CONFIG',
          'buildPedigreeRecordDeepLink',
          'getPedigreeHeavyZipGate',
        ],
        rationale: '@app/pedigreeAppWiring.ts must inject Pedigree defaults into pure @engine/primitives helpers.',
      },
      {
        filePath: 'src/utils/es2018Shims.ts',
        requiredSubstrings: ['__coreEs2018Shim'],
        forbiddenSubstrings: ['__pedigreeEs2018Shim'],
        rationale: 'Reusable ES2018 shims must stay free of domain-specific internal marker names.',
      },
      {
        filePath: 'src/utils/lazyRoute.tsx',
        requiredSubstrings: ['configureLazyRouteDefaults', 'ChunkReloadOptions'],
        forbiddenSubstrings: ['Back to All Species'],
        rationale: 'lazyRoute.tsx must expose parameterized reload defaults and domain-neutral fallback UI copy.',
      },
    ],
    restorePlaybook: [
      'Preserve `BOOT_ENTRY_LOCK_CHECKSUMS` in `src/domain/improvementRegistry.ts` and boot-lock verification tests in `src/domain/__tests__/modularLayerArchitecture.test.ts`.',
      'Keep all pure content-agnostic primitives under `src/engine/primitives/*` and thin Alpha 2 compatibility facades in `src/domain/*`.',
      'Keep 100% file-by-file module classifications synchronized in `EXTRACTION_INVENTORY.md` and domain wiring in `@app/pedigreeAppWiring.ts`.',
      'Preserve domain-neutral markers and parameterized defaults in `src/utils/es2018Shims.ts`, `src/utils/useVirtualWindow.ts`, and `src/utils/lazyRoute.tsx`.',
    ],
  },
  {
    id: 'IMP-068',
    title: 'AI Studio GitHub Import Fast-Boot, Compact Initial Output & Cold-Start Optimizations',
    category: 'ci-tooling',
    release: 'alpha-3',
    source: 'session',
    userIntent:
      'Speed up AI Studio startup when importing from GitHub, keep prompts/master_system_prompt.md mandatory, and reduce initial screen output.',
    summary:
      'Adds Section 0 (AI Studio GitHub Import Fast-Boot & Compact Output) to `AGENTS.md` so GitHub imports always read `prompts/master_system_prompt.md`, declare pre-configured AI Studio runtime facts (Node/npm, `0.0.0.0:3000`, `hmr: false`, browser `sql.js`, zero env vars), skip non-boot docs and full `npm test`/`tsc --noEmit`/`verify:improvements` runs on import-only boot, and limit clean startup output to `ALIGNED` + `Ready: Community Pedigree (port 3000).`; sets `audit=false` and `fund=false` in `.npmrc`; removes lazy `tesseract.js` from eager Vite `optimizeDeps.include` and sets `reportCompressedSize: false` in `vite.config.ts`; and keeps `releaseReadiness.test.ts` tolerant of gitignored `Screenshot_*` attachments in `public/assets/aistudio/`.',
    files: [
      'AGENTS.md',
      '.npmrc',
      'vite.config.ts',
      'src/domain/__tests__/releaseReadiness.test.ts',
    ],
    invariants: [
      {
        filePath: 'AGENTS.md',
        requiredSubstrings: [
          'prompts/master_system_prompt.md',
          'AI Studio GitHub Import Fast-Boot & Compact Output',
          'Minimal Initial Screen Output',
          'Ready: Community Pedigree (port 3000).',
        ],
        rationale:
          'AGENTS.md must enforce reading master_system_prompt.md, fast-boot skip rules on GitHub import, and compact 2-line initial screen output.',
      },
      {
        filePath: '.npmrc',
        requiredSubstrings: ['legacy-peer-deps=true', 'audit=false', 'fund=false'],
        rationale:
          '.npmrc must disable npm audit and funding network calls to accelerate cold AI Studio dependency installation.',
      },
      {
        filePath: 'vite.config.ts',
        requiredSubstrings: ['reportCompressedSize: false'],
        forbiddenSubstrings: ["'tesseract.js',"],
        rationale:
          'Vite must skip gzip size reporting on build and avoid eagerly pre-bundling lazy tesseract.js during dev startup.',
      },
    ],
    restorePlaybook: [
      'Keep Section 0 (`AI Studio GitHub Import Fast-Boot & Compact Output`) and the mandatory `prompts/master_system_prompt.md` directive at the top of `AGENTS.md`.',
      'Keep `legacy-peer-deps=true`, `audit=false`, and `fund=false` in `.npmrc`.',
      'Keep `reportCompressedSize: false` and omit `tesseract.js` from `optimizeDeps.include` in `vite.config.ts`.',
    ],
  },
  {
    id: 'IMP-069',
    title: 'Alpha 3 Modularity Remediation: Full Utils Decoupling, IPlatformBridge Context DI, iOS SQLite Backing Seam & Boundary Guardrails',
    category: 'stability-pwa',
    release: 'alpha-3',
    source: 'session',
    userIntent:
      'Close all remaining modularity gaps after Phase 1 DI rollout: decouple src/utils/*, remove all concrete pedigreeBridge imports from components/utils/storage, route iOS WKWebView SQLite persistence through NativeBridgeStorageAdapter, fix double back-handler registration, and harden automated layer tests.',
    summary:
      'Decouples `src/utils/lazyRoute.tsx` (`app_chunk_reload_ts`, `--ui-*` CSS aliases in `src/index.css`, injectable diagnostic hooks), `src/utils/webFileActions.ts` (`configureWebFileBridge`), `src/utils/webPdfActions.ts` -> `src/app/pedigreePdfActions.ts`, and `src/utils/googleCalendarClient.ts` -> `src/app/pedigreeCalendarClient.ts` so 100% of `src/utils/` is domain-free; adds `PlatformBridgeContext` (`usePlatformBridge()`) and extends `IPlatformBridge` with optional diagnostic/dev-panel/container hooks, migrating `PrintPreviewModal`, `HealthReferencePanel`, `SettingsAndSyncScreen`, `DiagnosticsAndSupportPanel`, `TechyStuffScreen`, and `storageProtection.ts` off concrete `pedigreeBridge`; fixes duplicate back-handler registration in `createPedigreeBridgePlatformAdapter`; adds an optional `backingStore?: IStorageAdapter` seam to `WebSqliteAdapter` wired via `createPedigreeDomainStorageAdapter` in `pedigreeAppWiring.ts` so iOS `WKWebView` routes SQLite persistence through `NativeBridgeStorageAdapter`; decouples `CrashErrorBoundary` from direct `WebSqliteAdapter` construction; and upgrades `modularLayerArchitecture.test.ts` with dynamic core/utils scanning, relative cross-feature import detection, and zero concrete `pedigreeBridge` enforcement.',
    files: [
      'src/index.css',
      'src/utils/lazyRoute.tsx',
      'src/utils/webFileActions.ts',
      'src/utils/webPdfActions.ts',
      'src/utils/googleCalendarClient.ts',
      'src/app/PlatformBridgeContext.tsx',
      'src/app/pedigreePdfActions.ts',
      'src/app/pedigreeCalendarClient.ts',
      'src/app/pedigreeAppWiring.ts',
      'src/engine/bridge/platformBridge.interface.ts',
      'src/native/pedigreeBridge.ts',
      'src/storage/storageProtection.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/App.tsx',
      'src/components/CrashErrorBoundary.tsx',
      'src/components/HealthReferencePanel.tsx',
      'src/components/SettingsAndSyncScreen.tsx',
      'src/components/PrintPreviewModal.tsx',
      'src/components/DiagnosticsAndSupportPanel.tsx',
      'src/components/TechyStuffScreen.tsx',
      'src/domain/__tests__/modularLayerArchitecture.test.ts',
      'EXTRACTION_INVENTORY.md',
    ],
    invariants: [
      {
        filePath: 'src/app/PlatformBridgeContext.tsx',
        requiredSubstrings: ['PlatformBridgeProvider', 'usePlatformBridge'],
        rationale:
          'UI components must consume IPlatformBridge via React Context rather than importing concrete pedigreeBridge.',
      },
      {
        filePath: 'src/utils/webFileActions.ts',
        requiredSubstrings: ['configureWebFileBridge', 'NativeExportBridge'],
        forbiddenSubstrings: ['pedigreeBridge'],
        rationale: 'webFileActions.ts must stay decoupled from concrete pedigreeBridge globals.',
      },
      {
        filePath: 'src/app/pedigreeAppWiring.ts',
        requiredSubstrings: [
          'initializePedigreeRuntimeDefaults',
          'createPedigreeDomainStorageAdapter',
          'NativeBridgeStorageAdapter',
        ],
        rationale:
          'Composition root must wire runtime defaults and route iOS WKWebView SQLite persistence through NativeBridgeStorageAdapter.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: ['backingStore?: IStorageAdapter'],
        rationale:
          'WebSqliteAdapter must support an injected IStorageAdapter backing store for iOS anti-eviction routing.',
      },
    ],
    restorePlaybook: [
      'Preserve `PlatformBridgeProvider` in `src/App.tsx` and `usePlatformBridge()` across UI components.',
      'Keep `configureLazyRouteDefaults`, `configureWebFileBridge`, and `configureStorageProtectionBridge` wired in `src/app/pedigreeAppWiring.ts`.',
      'Keep `backingStore?: IStorageAdapter` in `src/storage/webSqliteAdapter.ts` and `createPedigreeDomainStorageAdapter` in `src/app/pedigreeAppWiring.ts`.',
    ],
  },
  {
    id: 'IMP-070',
    title: 'Alpha 3 Modularity Hardening: iOS Backing-Store Write Guard, True Utils Isolation, Zero-Cycle Gate, Core Typecheck & Wrapper Contracts',
    category: 'stability-pwa',
    release: 'alpha-3',
    source: 'session',
    userIntent:
      'Review the completed Alpha 3 modularity rollout, fix missed runtime bugs and boundary leaks, eliminate circular dependencies, harden core storage/bridge adapters, and add an isolated core build profile.',
    summary:
      'Fixes a critical `WebSqliteAdapter` persistence bug where `persistToDiskLocked` and `findRecoveredBackupSnapshot` short-circuited on `!getSafeIndexedDb()` before checking `this.backingStore` (verified with an end-to-end no-IDB SQLite WASM round-trip test over `NativeBridgeStorageAdapter`); syncs injected bridges in `PlatformBridgeProvider`; decouples `src/utils/webFileActions.ts`, `src/utils/googleCalendarClient.ts`, and `src/utils/webPdfActions.ts` (`src/utils/canvasUtils.ts`) from all `src/storage/*` imports and breaks all 3 circular dependencies (`opfsStorage <-> localSyncChannels <-> webFileActions`, `inputSanitization <-> syncOutbox <-> showResults`); adds forbidden-import checks for `src/utils/*` and a DFS zero-cycle test in `modularLayerArchitecture.test.ts`; wires Electron `onBackPressed` in `PlatformBridge`, adds `VersionError`/`QuotaExceededError` hooks to `IndexedDbStorageAdapter`, adds `wasmUrl` to `SqliteWasmStorageAdapter`, and adds SHA-256 + FNV-1a verification to `PortableStorageBundle`; adds `configureCapturedIdeasBackingStore` for iOS anti-eviction; adds modular `core` barrels (`src/engine/index.ts`, `src/engine/codecs/index.ts`, `src/engine/sync/index.ts`) and `tsconfig.engine.json` (`npm run verify:engine`), fixing an ES2019 `.trimStart()` leak in `sanitization.ts`; removes remaining `as any` casts in tests and temporary root plan files; and completes `apple-wrapper/` and `desktop-wrapper/` bridge/storage/installer contracts.',
    files: [
      'src/storage/webSqliteAdapter.ts',
      'src/storage/__tests__/nativeBackingStore.test.ts',
      'src/app/PlatformBridgeContext.tsx',
      'src/utils/canvasUtils.ts',
      'src/utils/webPdfActions.ts',
      'src/utils/googleCalendarClient.ts',
      'src/utils/webFileActions.ts',
      'src/utils/es2018Shims.ts',
      'src/app/pedigreeAppWiring.ts',
      'src/domain/inputSanitization.ts',
      'src/domain/syncOutbox.ts',
      'src/engine/primitives/sanitization.ts',
      'src/engine/bridge/desktopBridgeAdapter.ts',
      'src/engine/bridge/platformBridge.ts',
      'src/engine/storage/browserStorageAdapters.ts',
      'src/engine/storage/sqliteWasmStorageAdapter.ts',
      'src/engine/storage/resilientStorageAdapter.ts',
      'src/storage/capturedIdeasStore.ts',
      'src/storage/photoHydration.ts',
      'src/engine/index.ts',
      'src/engine/codecs/index.ts',
      'src/engine/sync/index.ts',
      'tsconfig.engine.json',
      'package.json',
      'apple-wrapper/BRIDGE_CONTRACT.md',
      'apple-wrapper/WKWebViewSQLiteContract.md',
      'desktop-wrapper/BRIDGE_CONTRACT.md',
      'desktop-wrapper/INSTALLER_TARGETS.md',
      'src/domain/__tests__/modularLayerArchitecture.test.ts',
      'EXTRACTION_INVENTORY.md',
    ],
    invariants: [
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: ['(!this.backingStore && !getSafeIndexedDb())'],
        rationale:
          'WebSqliteAdapter must never silently drop writes into ephemeral mode when backingStore is configured without IndexedDB.',
      },
      {
        filePath: 'src/utils/webFileActions.ts',
        requiredSubstrings: ['configureWebFileRuntime', 'WebFileRuntimeHooks'],
        forbiddenSubstrings: ['../storage/'],
        rationale:
          'Extractable UI utilities in src/utils/ must never import legacy pedigree-domain modules from src/storage/.',
      },
      {
        filePath: 'tsconfig.engine.json',
        requiredSubstrings: ['src/engine/index.ts', 'src/features/**/*.ts', 'src/utils/*.ts'],
        rationale:
          'Isolated tsconfig.engine.json profile (npm run verify:engine) proves the extractable framework compiles with zero domain/app/storage dependencies.',
      },
      {
        filePath: 'package.json',
        requiredSubstrings: ['"verify:engine": "tsc -p tsconfig.engine.json --noEmit"'],
        rationale: 'package.json must expose verify:engine for isolated framework compilation checks.',
      },
      {
        filePath: 'src/domain/__tests__/modularLayerArchitecture.test.ts',
        requiredSubstrings: ['enforces zero circular dependencies across core, features, app, utils, and storage'],
        rationale: 'Automated boundary suite must fail on any circular dependency or src/utils/* storage import.',
      },
    ],
    restorePlaybook: [
      'Keep `(!this.backingStore && !getSafeIndexedDb())` guards in `src/storage/webSqliteAdapter.ts` and preserve `src/storage/__tests__/nativeBackingStore.test.ts`.',
      'Keep `configureWebFileRuntime`, `configureGoogleCalendarClient`, and `src/utils/canvasUtils.ts` decoupled from `src/storage/*` and wired in `src/app/pedigreeAppWiring.ts`.',
      'Keep `tsconfig.engine.json`, `npm run verify:engine`, and the zero-cycle test in `src/domain/__tests__/modularLayerArchitecture.test.ts`.',
    ],
  },
  {
    id: 'IMP-071',
    title: 'Engine Extraction Readiness: Core→Domain Rename, Engine Dependency Direction, Layer Audit Ratchet & Shared Text Encoders',
    category: 'stability-pwa',
    release: 'alpha-3',
    source: 'session',
    userIntent:
      'Review the modularity rollout, fix gaps after the `@core` → `@engine` migration, avoid the term "core" (reserved for the Core Pedigree brand), and add automated enforcement.',
    summary:
      'Moves `binaryEncoding` and `archiveAndCsvUtils` into `src/engine` (shims remain in `src/domain`); renames `src/core/` to `src/domain/` (`@domain`) with the `App.tsx` boot-lock checksum updated; adds `npm run verify:layers` (`scripts/audit-layers.ts`, shrinking-allowlist ratchet) in CI alongside `verify:engine`; globs `tsconfig.engine.json`; moves engine-only tests to `src/engine/__tests__`; and shares CSV/ICS encoders via `@engine/codecs/textFormats`.',
    files: [
      'src/engine/binaryEncoding.ts',
      'src/engine/codecs/archiveAndCsvUtils.ts',
      'src/engine/codecs/textFormats.ts',
      'scripts/audit-layers.ts',
      'scripts/layer-allowlist.json',
      'tsconfig.engine.json',
      'package.json',
      '.github/workflows/ci.yml',
      'EXTRACTION_INVENTORY.md',
    ],
    invariants: [
      {
        filePath: 'src/engine/index.ts',
        requiredSubstrings: ["'./binaryEncoding'", "'./codecs/archiveAndCsvUtils'"],
        forbiddenSubstrings: ['../domain/'],
        rationale: 'The engine must never import from the domain layer.',
      },
      {
        filePath: 'src/engine/codecs/textFormats.ts',
        requiredSubstrings: ['escapeCsvCell', 'escapeCsvCellWithLimit', 'escapeIcsText', 'formatIcsAlarmTrigger'],
        rationale: 'CSV and ICS encoders must have a single shared implementation.',
      },
      {
        filePath: 'package.json',
        requiredSubstrings: ['"verify:layers": "tsx scripts/audit-layers.ts"'],
        rationale: 'package.json must expose verify:layers.',
      },
      {
        filePath: '.github/workflows/ci.yml',
        requiredSubstrings: ['npm run verify:layers', 'npm run verify:engine'],
        rationale: 'CI must run the layer audit and the isolated engine typecheck.',
      },
    ],
    restorePlaybook: [
      'Keep implementations of `binaryEncoding`, `archiveAndCsvUtils` and `textFormats` under `src/engine/` with only re-export shims in `src/domain/`.',
      'Keep `scripts/audit-layers.ts` and `scripts/layer-allowlist.json` (entries may only be removed) and run them in CI.',
      'Use `@domain` / `src/domain/` for pedigree domain logic; never reintroduce "core" in layer names.',
    ],
  },
  {
    id: 'IMP-072',
    title: 'Isolated Engine Extraction Rehearsal Gate & Shared Text-Format Codec Tests',
    category: 'stability-pwa',
    release: 'alpha-3',
    source: 'session',
    userIntent:
      'Add an automated temp-directory extraction rehearsal proving @engine, @features, and src/utils compile standalone without domain/app/storage files, and add direct engine codec unit tests.',
    summary:
      'Adds `scripts/rehearse-engine-extraction.ts` (`npm run verify:extraction`) which copies `src/engine`, `src/features`, `src/utils`, `tsconfig.json`, and `tsconfig.engine.json` into an isolated temp directory and runs `tsc -p tsconfig.engine.json --noEmit` with zero `src/domain`, `src/app`, `src/storage`, `src/hooks`, or `src/components` files present; wires `verify:extraction` into `.github/workflows/ci.yml`; and adds `src/engine/__tests__/textFormats.test.ts` covering CSV cell escaping, `.map(escapeCsvCell)` safety, and RFC-5545 ICS formatting.',
    files: [
      'scripts/rehearse-engine-extraction.ts',
      'package.json',
      '.github/workflows/ci.yml',
      'src/engine/__tests__/textFormats.test.ts',
    ],
    invariants: [
      {
        filePath: 'package.json',
        requiredSubstrings: ['"verify:extraction": "tsx scripts/rehearse-engine-extraction.ts"'],
        rationale: 'package.json must expose verify:extraction for isolated engine extraction rehearsal.',
      },
      {
        filePath: '.github/workflows/ci.yml',
        requiredSubstrings: ['npm run verify:extraction'],
        rationale: 'CI must run the isolated engine extraction rehearsal.',
      },
      {
        filePath: 'scripts/rehearse-engine-extraction.ts',
        requiredSubstrings: ["'src/engine'", "'src/features'", "'src/utils'", "'tsconfig.engine.json'"],
        rationale: 'Extraction rehearsal must compile engine, features, and utils without domain/app/storage.',
      },
    ],
    restorePlaybook: [
      'Keep `scripts/rehearse-engine-extraction.ts` and `"verify:extraction"` in `package.json` and `.github/workflows/ci.yml`.',
      'Keep `src/engine/__tests__/textFormats.test.ts` testing `@engine/codecs/textFormats`.',
    ],
  },
  {
    id: 'IMP-073',
    title: 'Shared Canvas/OCR Decoding, SQLite Statement Cleanup & Workflow Modularity Gates',
    category: 'stability-pwa',
    release: 'alpha-3',
    source: 'session',
    userIntent:
      'Improve modularity and workflows, verify boot and loading, optimize memory management, and reduce token use.',
    summary:
      'Consolidates duplicated image-blob decoding, ObjectURL/bitmap teardown, and contrast-grayscale OCR canvas preprocessing into `src/utils/canvasUtils.ts` (`decodeBlobToCanvasSource`, `buildContrastGrayscaleCanvas`, `releaseCanvas`) across `pedigreeOcrScanner.ts`, `feedTagOcr.ts`, and `webImageOptimizer.ts`; wraps `queryObjectsFromDb` prepared-statement stepping in `try/finally { stmt.free(); }` in `src/storage/webSqliteAdapter.ts`; adds npm download caching, concurrency cancellation, and `verify:layers`/`verify:engine`/`verify:extraction` gates across `.github/workflows/ci.yml`, `deploy-pages.yml`, `build-android-apk.yml`, and `guardrails.yml`; and excludes `.vite`, `.idea`, `.vscode`, `import`, `upload`, and `.map` artifacts in `export_repo_to_md.yml`.',
    files: [
      'src/utils/canvasUtils.ts',
      'src/storage/pedigreeOcrScanner.ts',
      'src/storage/feedTagOcr.ts',
      'src/storage/webImageOptimizer.ts',
      'src/storage/webSqliteAdapter.ts',
      '.github/workflows/ci.yml',
      '.github/workflows/deploy-pages.yml',
      '.github/workflows/build-android-apk.yml',
      '.github/workflows/guardrails.yml',
      '.github/workflows/export_repo_to_md.yml',
    ],
    invariants: [
      {
        filePath: 'src/utils/canvasUtils.ts',
        requiredSubstrings: [
          'decodeBlobToCanvasSource',
          'buildContrastGrayscaleCanvas',
          'releaseCanvas',
        ],
        rationale:
          'Shared canvas/blob decode and OCR preprocessing helpers must remain centralized in src/utils/canvasUtils.ts.',
      },
      {
        filePath: 'src/storage/webSqliteAdapter.ts',
        requiredSubstrings: ['try {', 'stmt.free();', '} finally {'],
        rationale:
          'SQLite WASM prepared statements in queryObjectsFromDb must always be freed in a finally block.',
      },
      {
        filePath: '.github/workflows/deploy-pages.yml',
        requiredSubstrings: ['bun run verify:layers', 'bun run verify:engine', 'bun run verify:extraction'],
        rationale:
          'GitHub Pages deployment workflow must enforce layer boundary and engine extraction gates.',
      },
      {
        filePath: '.github/workflows/build-android-apk.yml',
        requiredSubstrings: ['npm run verify:layers', 'npm run verify:engine', 'npm run verify:extraction'],
        rationale:
          'Android APK workflow must enforce layer boundary and engine extraction gates.',
      },
    ],
    restorePlaybook: [
      'Keep `decodeBlobToCanvasSource`, `buildContrastGrayscaleCanvas`, and `releaseCanvas` centralized in `src/utils/canvasUtils.ts` and imported by `pedigreeOcrScanner.ts`, `feedTagOcr.ts`, and `webImageOptimizer.ts`.',
      'Keep `try/finally { stmt.free(); }` in `queryObjectsFromDb` inside `src/storage/webSqliteAdapter.ts`.',
      'Keep `verify:layers`, `verify:engine`, and `verify:extraction` active in `ci.yml`, `deploy-pages.yml`, and `build-android-apk.yml`.',
    ],
  },
  {
    id: 'IMP-074',
    title: 'Settings UI/UX Modernization, Logical Subunits, Title Header & System Links',
    category: 'workflow-polish',
    release: 'alpha-3',
    source: 'session',
    userIntent:
      'Improve the UI/UX of the settings page by condensing logically related items into shared subunits in logical order, adding title text, and providing links to prompts, about, developer, and help pages.',
    summary:
      'Reorganizes `SettingsAndSyncScreen.tsx` into 8 clean, logically ordered subunits beneath a prominent page header and quick-jump navigation bar linking to Prompts (`onOpenPromptsDirectory`), About (`AboutModal.tsx`), Developer (`onOpenTechyStuff`), and Help & Husbandry Guides (`onOpenHelpDocs`); groups Farm Identity, Species Setup, Measurement Units, Appearance Studio, Calendar Alarms, Storage & Image Compression, Backup & Installation, and System Resources; and coordinates return routing from `PromptsDirectoryScreen` in `src/App.tsx`.',
    files: [
      'src/components/SettingsAndSyncScreen.tsx',
      'src/components/AboutModal.tsx',
      'src/App.tsx',
    ],
    invariants: [
      {
        filePath: 'src/components/SettingsAndSyncScreen.tsx',
        requiredSubstrings: [
          'Settings &amp; Preferences',
          'onOpenPromptsDirectory',
          'handleOpenAboutTrigger',
          'AboutModal',
        ],
        rationale:
          'SettingsAndSyncScreen must include title header, quick jump links for prompts, about, developer, and help.',
      },
      {
        filePath: 'src/components/AboutModal.tsx',
        requiredSubstrings: [
          'Community Pedigree',
          '100% On-Device',
          'Zero Telemetry',
          'AGPL-3.0',
        ],
        rationale:
          'AboutModal must present app details, offline architecture, and AGPL-3.0 license.',
      },
      {
        filePath: 'src/App.tsx',
        requiredSubstrings: [
          'returnRouteFromPrompts',
          'onOpenPromptsDirectory',
        ],
        rationale:
          'App.tsx must wire onOpenPromptsDirectory and track return routing for PromptsDirectoryScreen.',
      },
    ],
    restorePlaybook: [
      'Keep Settings header title, quick navigation links (Prompts, About, Developer, Help), and 8 modular subunits in `src/components/SettingsAndSyncScreen.tsx`.',
      'Keep `AboutModal.tsx` accessible modal showing offline guarantees and AGPL license.',
      'Keep `returnRouteFromPrompts` and `onOpenPromptsDirectory` wired in `src/App.tsx`.',
    ],
  },
  {
    id: 'IMP-075',
    title: 'Dependency Reduction, Deprecated API & Legacy Config Remediation',
    category: 'ci-tooling',
    source: 'session',
    release: 'alpha-3',
    userIntent:
      'Remove unused/deprecated dependencies, replace outdated runtime/API calls and legacy syntax, and clean up unsupported or obsolete configurations across the app without feature loss.',
    summary:
      'Removes unused `autoprefixer` (and its unused transitive PostCSS helpers) since Tailwind CSS v4 (`@tailwindcss/vite`) handles prefixing natively via Lightning CSS; moves `@types/sql.js` from `dependencies` to `devDependencies` (`^1.16.1`) with strict peer-dependency resolution verified; strips obsolete `experimentalDecorators`, `useDefineForClassFields`, and `allowJs` from `tsconfig.json`; uses `node:path` in `vite.config.ts`; adds standard `<meta name="mobile-web-app-capable" content="yes" />` alongside iOS meta tags in `index.html`; replaces deprecated Annex B `escape()`/`unescape()` fallbacks in `src/engine/binaryEncoding.ts` with pure RFC 3629 UTF-8 encode/decode loops (covered by `binaryEncoding.test.ts`); prefers `navigator.userAgentData?.platform` before `navigator.platform` in `src/storage/storageProtection.ts`; migrates `PWAInstallButton.tsx` off legacy `React.FC`; and updates `bg-gradient-to-br` to Tailwind v4 `bg-linear-to-br` in `ImportExportHubScreen.tsx`.',
    files: [
      'package.json',
      'tsconfig.json',
      'vite.config.ts',
      'index.html',
      'src/engine/binaryEncoding.ts',
      'src/domain/__tests__/binaryEncoding.test.ts',
      'src/storage/storageProtection.ts',
      'src/components/PWAInstallButton.tsx',
      'src/components/ImportExportHubScreen.tsx',
    ],
    invariants: [
      {
        filePath: 'package.json',
        requiredSubstrings: ['"@types/sql.js"'],
        forbiddenSubstrings: ['"autoprefixer"'],
        rationale:
          'Unused autoprefixer must not be re-introduced under Tailwind CSS v4 (@tailwindcss/vite).',
      },
      {
        filePath: 'tsconfig.json',
        requiredSubstrings: ['"target": "ES2018"', '"jsx": "react-jsx"'],
        forbiddenSubstrings: ['"experimentalDecorators"', '"allowJs"'],
        rationale:
          'Obsolete decorator and JS-interop compiler flags must stay removed from strict TS config.',
      },
      {
        filePath: 'vite.config.ts',
        requiredSubstrings: ["import path from 'node:path';"],
        rationale: 'Vite config must use explicit Node built-in protocol imports (node:path).',
      },
      {
        filePath: 'index.html',
        requiredSubstrings: ['<meta name="mobile-web-app-capable" content="yes" />'],
        rationale: 'index.html must include the standard mobile-web-app-capable meta tag.',
      },
      {
        filePath: 'src/engine/binaryEncoding.ts',
        requiredSubstrings: ['RFC 3629 UTF-8 fallback'],
        forbiddenSubstrings: ['unescape(', 'escape(raw)'],
        rationale:
          'binaryEncoding.ts must use pure RFC 3629 UTF-8 fallbacks instead of deprecated Annex B escape/unescape globals.',
      },
      {
        filePath: 'src/components/PWAInstallButton.tsx',
        requiredSubstrings: ['export function PWAInstallButton(', 'export function OfflineIndicator()'],
        forbiddenSubstrings: ['React.FC'],
        rationale: 'PWAInstallButton.tsx must use standard React 19 function component signatures.',
      },
    ],
    restorePlaybook: [
      'Keep `autoprefixer` removed from `package.json` and `@types/sql.js` in `devDependencies`.',
      'Keep `experimentalDecorators`, `useDefineForClassFields`, and `allowJs` out of `tsconfig.json`, and keep `node:path` in `vite.config.ts`.',
      'Keep `<meta name="mobile-web-app-capable" content="yes" />` in `index.html`.',
      'Preserve pure RFC 3629 UTF-8 fallback in `src/engine/binaryEncoding.ts` (no `escape`/`unescape`), `userAgentData?.platform` check in `src/storage/storageProtection.ts`, React 19 function components in `src/components/PWAInstallButton.tsx`, and `bg-linear-to-br` in `src/components/ImportExportHubScreen.tsx`.',
    ],
  },
];

/**
 * Immutable SHA-256 baseline checksums for boot/entry files locked during NEON Phases 1–2
 * to prevent accidental boot/initialization regressions during modular extraction.
 */
export const BOOT_ENTRY_LOCK_CHECKSUMS: Readonly<Record<string, string>> = {
  'src/main.tsx': 'b77239b90e2ab0ca96469ccd8692531d17fddc73267cc9aab3a3638a49a663dc',
  'src/App.tsx': '8bb772f8ba65b3a8894455bea3ab8fb9f7f1c7822d45ea0a16ce7f23da8f85d7',
  'index.html': '2ac08f65d0471f000bde064d5edecc433a540e814790b602f99af1a578c13454',
};

/**
 * Evaluates all `IMPROVEMENTS_REGISTRY` code invariants against an in-memory map of file contents.
 * Keys may be POSIX relative paths (`src/domain/models.ts`) with or without a leading `/`.
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
 * Determines the release milestone for an improvement entry.
 * If explicitly specified on the entry (`entry.release`), uses that value.
 * Otherwise, entries up to and including IMP-064 default to 'alpha-2',
 * and entries from IMP-065 onwards default to 'alpha-3'.
 */
export function getImprovementRelease(entry: {
  id: string;
  release?: ImprovementRelease;
}): ImprovementRelease {
  if (entry.release) {
    return entry.release;
  }
  const match = entry.id.match(/^IMP-(\d+)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num <= 64) {
      return ALPHA_2_RELEASE;
    }
  }
  return ALPHA_3_RELEASE;
}

/**
 * Checks if an improvement was implemented during the Alpha 2 release cycle.
 */
export function isAlpha2Improvement(entry: { id: string; release?: ImprovementRelease }): boolean {
  return getImprovementRelease(entry) === ALPHA_2_RELEASE;
}

/**
 * Checks if an improvement belongs to the Alpha 3 release cycle.
 */
export function isAlpha3Improvement(entry: { id: string; release?: ImprovementRelease }): boolean {
  return getImprovementRelease(entry) === ALPHA_3_RELEASE;
}

/**
 * Filters improvement entries by release milestone ('alpha-2' or 'alpha-3').
 */
export function getImprovementsByRelease(
  release: ImprovementRelease,
  entries: ImprovementEntry[] = IMPROVEMENTS_REGISTRY
): ImprovementEntry[] {
  return entries.filter((e) => getImprovementRelease(e) === release);
}

/**
 * Generates a clean, self-contained Markdown improvements & GitHub-overwrite recovery manual.
 */
export function formatImprovementsMarkdown(
  entries: ImprovementEntry[] = IMPROVEMENTS_REGISTRY
): string {
  const alpha2Count = entries.filter(isAlpha2Improvement).length;
  const alpha3Count = entries.filter(isAlpha3Improvement).length;

  const lines: string[] = [
    '# Community Pedigree — App Improvements & GitHub-Overwrite Recovery Log',
    '',
    'This document is synchronized with `src/domain/improvementRegistry.ts` and verified automatically',
    'by `npm run verify:improvements` (and GitHub Actions CI). If an upstream GitHub pull or AI Studio',
    'sync overwrites customized files, run the verifier to pinpoint exactly which improvements were wiped',
    'and follow the restoration playbook below.',
    '',
    '## Release Milestone Classification',
    '',
    `- **Alpha 2 (v0.1.0-alpha.2 — Released Baseline):** \`IMP-001\` through \`IMP-064\` (${alpha2Count} improvements).`,
    `- **Alpha 3 (v0.1.0-alpha.3 — Active Deliverables):** \`IMP-065\` onwards (${alpha3Count} improvements).`,
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
    const rel = getImprovementRelease(entry);
    const relLabel = IMPROVEMENT_RELEASE_LABELS[rel] ?? rel;
    const sourceBadge =
      entry.source === 'github-preserved' ? 'Preserved Upstream Feature' : 'Session Improvement';
    lines.push(`### ${entry.id}: ${entry.title}`);
    lines.push('');
    lines.push(`- **Release Milestone:** ${relLabel} (\`${rel}\`)`);
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
  const entriesWithRelease = entries.map((e) => ({
    ...e,
    release: getImprovementRelease(e),
  }));
  return JSON.stringify(
    {
      format: 'community-pedigree-improvements-log',
      package: 'Pedigree',
      version: 1,
      exportedAtIsoUtc: nowIsoUtc(),
      verifyCommand: 'npm run verify:improvements',
      totalEntries: entries.length,
      alpha2Total: entries.filter(isAlpha2Improvement).length,
      alpha3Total: entries.filter(isAlpha3Improvement).length,
      entries: entriesWithRelease,
    },
    null,
    2
  );
}
