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
      'Eliminates Chrome Android Aw Snap renderer crashes by disabling Workbox SW in dev + adding self-unregistering `/dev-sw.js` middleware, scoping eager COI computation off home/settings boot, guarding `PedigreeIndex.inbreeding` recursion cycles, and batching SQLite/IndexedDB mutations (React.lazy route splitting deferred).',
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
    title: 'Subpath-Safe PWA Base Config & GitHub Actions CI Pipeline',
    category: 'ci-tooling',
    source: 'session',
    summary:
      'Normalizes `VITE_BASE_PATH` in Vite/PWA config for GitHub Pages subpath builds while keeping `.env.example` commented out (no AI Studio env prompt), and runs unit tests, improvement verification, lint, and production + subpath builds in `.github/workflows/ci.yml`.',
    userIntent:
      'Automatically verify all domain tests, lint, improvements, and subpath PWA builds on every push without requiring user env prompts.',
    files: ['vite.config.ts', '.env.example', '.github/workflows/ci.yml', 'package.json'],
    invariants: [
      {
        filePath: 'vite.config.ts',
        requiredSubstrings: ['normalizeBasePath', 'process.env.VITE_BASE_PATH'],
        rationale: 'Base path normalization lets GitHub Pages subpath deploys load assets/SW correctly.',
      },
      {
        filePath: '.env.example',
        requiredSubstrings: ['# VITE_BASE_PATH='],
        rationale: 'Keeping `VITE_BASE_PATH` commented prevents AI Studio from prompting the user for an unconfigured env var.',
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
      'Ensure `normalizeBasePath(process.env.VITE_BASE_PATH)` wraps `base` and PWA icon/manifest paths in `vite.config.ts`.',
      'Keep `VITE_BASE_PATH` commented in `.env.example`.',
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
