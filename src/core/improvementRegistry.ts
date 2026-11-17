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
        filePath: 'src/components/SettingsAndSyncScreen.tsx',
        requiredSubstrings: ['backupStatus', 'recordBackupExport'],
        rationale: 'Settings exports must show live backup timestamps and record external exports immediately.',
      },
    ],
    restorePlaybook: [
      'Restore `evaluateBackupStatus` and timestamp formatters in `src/core/backupStatus.ts`.',
      'Ensure `exportBarnBackupJson` emits `exportedAtLocal`, `barnSummary`, and deterministically sorted animals in `src/core/syncAndExports.ts`.',
      'Wire `lastBackupMeta`, `recordBackupExport`, and `snoozeBackupReminder` in `src/hooks/useBarnStore.ts` and connect banner/cards in `src/App.tsx` and `src/components/SettingsAndSyncScreen.tsx`.',
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
    ],
    restorePlaybook: [
      "Keep `const basePath = '/'`, `hmr: false`, and `watch: null` hardcoded in `vite.config.ts` without reading `process.env.VITE_BASE_PATH` or `process.env.DISABLE_HMR`.",
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
      'src/components/SettingsAndSyncScreen.tsx',
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
      'Preserve `syncOutbox.ts`, `localSyncChannels.ts`, and `backupArchive.ts` hooks inside `useBarnStore.ts` and `SettingsAndSyncScreen.tsx`.',
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
          'buildCompleteBackupZipOffThread',
        ],
        rationale: 'Store loads lightweight snapshots, caches hydrated photos, hydrates rolling/export snapshots, and uses off-thread ZIP calls.',
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
        filePath: 'src/components/SettingsAndSyncScreen.tsx',
        requiredSubstrings: ['pendingHeavyZipExport', 'heavyZipGate', 'handleDownloadDatabaseOnlyBackup'],
        rationale: 'Heavy .ZIP exports must warn Tier 1/outdated browsers and offer Database-Only .JSON fallback without photo hydration.',
      },
    ],
    restorePlaybook: [
      'Keep ES2018 target in `tsconfig.json` and `vite.config.ts` (`safari12`, `registerType: "prompt"`) plus ES5 guard, circuit breaker, and `?emergency_reset=true` in `index.html`.',
      'Keep `src/utils/es2018Shims.ts` imported first in `src/main.tsx` alongside `src/storage/pwaUpdateManager.ts`.',
      'Keep `assessBrowserCompatibility` and `getHeavyZipExportGate` in `src/core/deviceCapability.ts` and hook probes in `src/storage/deviceCapabilityDetector.ts`.',
      'Keep disabled-with-reason UI controls (`Share .HTM` in `PrintPreviewModal.tsx`, Storage Vault, Settings), Database-Only `.JSON` export, table/care-log windowing, and open-dialog PWA update deferral in `App.tsx`.',
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
