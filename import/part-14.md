# Codebase Export: AskKim/Pedigree (Part 14 of 16)

- **Branch:** `main`
- **Commit:** `847f8ec8a2fc88e92ecb94065d96cf1277189c07`
- **Generated (UTC):** 2026-11-21 17:00:43 UTC
- **Files in this part:** 9 (`src/hooks/useBarnStore.ts` -> `src/storage/feedTagOcr.ts`)
- **Index:** [index.md](./index.md)

---
## `src/hooks/useBarnStore.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Portable React State & Offline Database Controller Hook (`useBarnStore`).
 *
 * Connects React components to the `StorageAdapter` while enforcing:
 * 1. Strict per-species filtering across Herd, Breeding, Pedigree, Tasks, Cages, and Shows.
 * 2. Startup Landing Pinning (`pinnedLandingSpecies` opens directly inside a pinned species hub
 *    when configured, or on the All-Species Home page when empty).
 * 3. Automatic Master Task List chore cascading whenever a breeding record is logged.
 * 4. Persistent browser storage lock (`navigator.storage.persist()`), rolling backups,
 *    and append-only field-level multi-worker delta sync (`sync_outbox` + `sync_conflicts`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeBarnAnimalConflicts,
  AnimalConflictSummary,
  applyImportConflictAttentionFlags,
  LitterOffspringDraft,
} from '../core/animalConflicts';
import {
  inspectSnapshotBeforeRestorePure,
  PreRestoreArchiveInspection,
} from '../core/archiveInspector';
import {
  BarnBenchBatchEntryDraft,
  buildBarnBenchCommitPlan,
} from '../core/barnBench';
import {
  analyzePhotoStorageFootprintPure,
  PhotoStorageFootprintReport,
  pruneFullResPayloadsFromSnapshotPure,
  removeOrphanPhotosFromSnapshotPure,
} from '../core/photoMaintenance';
import { reconcileCarrierTraitLists } from '../core/carrierGenetics';
import { formatGenotypeArray, parseGenotypeString } from '../core/geneticsEngine';
import {
  calculateSavingsPercent,
  formatByteSizePure,
  ImageOptimizationPresetId,
  OptimizedImagePayload,
} from '../core/imageOptimizationSpec';
import {
  addDaysIso,
  Animal,
  AnimalConflictKind,
  AnimalPhoto,
  AnimalReservation,
  applyAnimalNamePrefix,
  BarnDatabaseSnapshot,
  BarnSettings,
  BarnTask,
  BreedingRecord,
  CageLocation,
  CareLog,
  ClientContact,
  FeedAllocation,
  FeedBatch,
  FeedPurgeWindowDays,
  generateUuid,
  isAnimalArchived,
  isSameSpecies,
  LedgerEntry,
  LitterWeightMilestone,
  normalizeBreedScheduleOverrides,
  normalizeCalendarSyncSettings,
  normalizeClientKind,
  normalizeDefaultPedigreeGenerations,
  normalizeFeedPurgeWindowDays,
  normalizeIgnoredConflicts,
  normalizeLedgerCategory,
  normalizeLedgerEntryType,
  normalizeLitterWeightMilestones,
  normalizePeltGrade,
  normalizePreferredContactMethod,
  normalizeProcessingStatus,
  normalizeReservationStatus,
  normalizeRufusLevel,
  normalizeServiceFeeDirection,
  normalizeSpeciesHubBlockOrder,
  normalizeTargetWeightCurve,
  normalizeUltrasoundResult,
  normalizeWaitlistIntent,
  normalizeWaitlistStatus,
  normalizeYouthOrgType,
  normalizeYouthProjectFeedLogs,
  PedigreeGenerationDepth,
  PREDEFINED_SPECIES_PRESETS,
  ProcessingLog,
  resolveSpeciesProfile,
  ServiceFeeDirection,
  ShowEvent,
  SpeciesHubBlockId,
  SpeciesProfile,
  TargetWeightPoint,
  todayDateIso,
  UltrasoundResult,
  WaitlistEntry,
  WoolHarvest,
  YouthProjectBook,
} from '../core/models';
import { normalizeWoolHarvest } from '../core/woolFiber';
import {
  buildSuggestedAgreementNumber,
  CrmFollowUpReminder,
  evaluateReservationFinancials,
} from '../core/clientCrm';
import { calculateDressOutPercent } from '../core/economicsLedger';
import {
  applyFeedAllocationToBatch,
  findPurgeEligibleFeedTagPhotos,
  purgeExpiredFeedTagPhotosPure,
  reverseFeedAllocationFromBatch,
} from '../core/feedInventory';
import {
  buildIcsCalendarForTasks,
  buildTaskAppDeepLink,
  formatSystemTaskTitle,
} from '../core/calendarExport';
import {
  BackupStatusEvaluation,
  evaluateBackupStatus,
  hasNonTestingBarnData,
  LastBackupMeta,
} from '../core/backupStatus';
import {
  ArchivedHerdIndexEntry,
  buildArchivedAnimalsBundle,
  buildVerifiedPreUpgradeJsonBackup,
  mergeRestoredArchiveIntoSnapshot,
  VaultBackupMetadata,
} from '../core/backupVault';
import { CURRENT_APP_VERSION } from '../core/upgradeGate';
import {
  buildSpeciesHerdMap,
  calculatePairingCoi,
  CoiAnalysis,
  createSpeciesCoiEvaluator,
} from '../core/pedigreeCalculator';
import { parseAppDeepLinkParams } from '../core/qrCode';
import {
  computeShowLegDeltas,
  mergeEnteredAnimalIdsWithResults,
  normalizeShowResults,
} from '../core/showResults';
import {
  buildFullPredefinedSampleSnapshot,
  buildSampleDataForSpecies,
  countAllSpeciesRecords,
  countSpeciesNonTestingRecords,
  countSpeciesTestingRecords,
  isSampleTestingId,
  purgeAllSpeciesRecordsPure,
  purgeSpeciesNonTestingDataPure,
  purgeSpeciesTestingDataPure,
} from '../core/sampleData';
import {
  ConflictSelectionMap,
  resolveAnimalsWithConflictChoices,
} from '../core/importers/conflictResolver';
import { PlatformImportPreview } from '../core/importers/importerTypes';
import {
  mergePhotosOnlyIntoSnapshot,
} from '../core/backupArchive';
import {
  buildSpeciesZipBackupFileName,
  formatTimestampedBackupSlug,
  mergeBarnSnapshots,
  parseBarnBackupJson,
  SpeciesBackupReason,
} from '../core/syncAndExports';
import {
  migrateAnimalsToSpecies,
  SpeciesMigrationOptions,
  SpeciesMigrationResult,
} from '../core/speciesMigration';
import {
  bumpRecordRevision,
  createOutboxOperation,
  diffEntityFieldsToOperations,
  diffSnapshotsToSyncOperations,
  mergeDeltaOperations,
  stripPhotoBlobsForSync,
  SyncConflictEntry,
  SyncEntityType,
  SyncOperation,
} from '../core/syncOutbox';
import {
  generateCascadedTasksForBreeding,
  getPendingBreedingCleanupTasks,
  recalculatePostBirthTasksForBreeding,
  resolveEffectiveSpeciesProfileForBreeding,
} from '../core/taskMaster';
import { sanitizeSpeciesMemo } from '../core/speciesMemo';
import { resolveThemeCssVariables } from '../core/themePalette';
import {
  allocateNextLogicalCounter,
  appendSyncConflictsToIdb,
  appendSyncOperationsToIdb,
  BackupSyncStatus,
  buildDeltaFilePayload,
  clearAllSyncStateInIdb,
  configureBackupSyncFolder,
  disconnectBackupSyncFolder,
  getOrCreateLocalDeviceId,
  getPersistedBackupSyncStatus,
  loadAllSyncConflictsFromIdb,
  loadAllSyncOperationsFromIdb,
  reauthorizeBackupSyncFolder,
  replaceSyncOperationsInIdb,
  saveSyncConflictInIdb,
  subscribeCrossTabDbCommits,
} from '../storage/localSyncChannels';
import {
  assertForegroundOrPause,
  BackgroundPausedError,
  clearPausedBackgroundJob,
  registerFreezeLifecycleListener,
} from '../storage/backgroundFreezeCoordinator';
import {
  emitAsyncErrorToast,
  isMemoryLikeError,
  logDiagnosticEvent,
  setCurrentDiagnosticRoute,
} from '../storage/crashLogger';
import {
  buildCompleteBackupZipToOpfsTmpOffThread,
  parseBackupArchiveOffThread,
} from '../storage/offThreadWorkerClient';
import {
  BoundedPhotoDataCache,
  hydrateSnapshotWithPhotoDataUrls,
  stripPhotoDataUrlsFromSnapshot,
} from '../storage/photoHydration';
import { StorageAdapter } from '../storage/storageAdapter';
import {
  analyzeBarnDataHealth,
  BarnHealthRepairResult,
  BarnHealthReport,
  repairBarnDataHealth,
} from '../core/dataHealthCheck';
import {
  checkStorageStatus,
  deleteRollingSnapshotBackup,
  getAdjustedNowIsoUtc,
  getAdjustedNowMs,
  getEffectiveOnlineStatus,
  isQuotaExceededError,
  listRollingSnapshotBackups,
  loadRollingSnapshotBackup,
  requestPersistentStorage,
  RollingBackupMeta,
  saveRollingSnapshotBackup,
  StorageProtectionStatus,
  useConnectivityStatus,
} from '../storage/storageProtection';
import { reoptimizeAnimalPhotoRecord } from '../storage/webImageOptimizer';
import { detectCurrentDeviceCapability } from '../storage/deviceCapabilityDetector';
import { markPreUpgradeBackupVerified } from '../storage/pwaUpdateManager';
import {
  clearOpfsPruneSyncWarning,
  clearPriorUseSentinel,
  deleteOpfsHerdArchive,
  deleteOpfsVaultBackup,
  flushOpfsBackupsToSyncFolder,
  isOpfsSupported,
  listOpfsHerdArchives,
  listOpfsVaultBackups,
  loadOpfsHerdArchive,
  loadOpfsVaultBackup,
  markPriorUseSentinelFromSnapshot,
  OpfsPruneSyncWarning,
  readOpfsHerdArchiveBlob,
  readOpfsPruneSyncWarning,
  readOpfsVaultBackupBlob,
  runOpfsExportCanary,
  saveOpfsHerdArchive,
  saveOpfsVaultBackup,
  shouldCreateMonthlyOpfsBackup,
  shouldRunExportCanary,
  sweepOrphanedOpfsTmpOnBoot,
  WipedStorageRecoveryContext,
} from '../storage/opfsStorage';
import { purgeOpfsTmp } from '../storage/opfsTempStream';
import { purgeStaleBrowserCaches, WebSqliteAdapter } from '../storage/webSqliteAdapter';
import {
  getGoogleCalendarAccessToken,
  GoogleCalendarOption,
  initGoogleCalendarAuth,
  listWritableGoogleCalendars,
  pushTasksToGoogleCalendar,
  signInGoogleCalendar,
  signOutGoogleCalendar,
} from '../utils/googleCalendarClient';
import {
  copyTextWithFallback,
  downloadBlobDirect,
  downloadTempOpfsExport,
  downloadTextFile,
  shareTextFileOrDownload,
} from '../utils/webFileActions';
import { pedigreeBridge } from '../native/pedigreeBridge';
import type { PendingGoogleCalendarSync } from '../components/CalendarIntegrationModals';

function getPhotoCacheBudgetForTier(tier: number): { maxEntries: number; maxBytes: number } {
  if (tier <= 1) return { maxEntries: 6, maxBytes: 2 * 1024 * 1024 };
  if (tier === 2) return { maxEntries: 10, maxBytes: 4 * 1024 * 1024 };
  if (tier === 3) return { maxEntries: 16, maxBytes: 8 * 1024 * 1024 };
  return { maxEntries: 24, maxBytes: 16 * 1024 * 1024 };
}

export type WorkspaceRoute =
  | 'home'
  | 'dashboard'
  | 'herd'
  | 'bench'
  | 'breeding'
  | 'pedigree'
  | 'feed'
  | 'economics'
  | 'crm'
  | 'reports'
  | 'memo'
  | 'importExport'
  | 'settings'
  | 'techyStuff'
  | 'prompts'
  | 'suggestions';

const NON_SPECIES_ROUTES: ReadonlySet<WorkspaceRoute> = new Set([
  'home',
  'settings',
  'importExport',
  'techyStuff',
  'prompts',
  'suggestions',
]);

export type BreedingTaskCheckoffAction =
  | { kind: 'palpated_positive' }
  | { kind: 'missed'; notes?: string }
  | {
      kind: 'birth_recorded';
      actualBirthDateIso: string;
      liveCount: number;
      stillbornCount: number;
      fosteredCount?: number;
      shiftPostBirthTasks?: boolean;
      notes?: string;
    };

export interface ActiveSpeciesData {
  speciesProfile: SpeciesProfile;
  animals: Animal[];
  activeAnimals: Animal[];
  archivedAnimals: Animal[];
  animalPhotos: AnimalPhoto[];
  photosByAnimalId: Map<string, AnimalPhoto[]>;
  primaryPhotoByAnimalId: Map<string, AnimalPhoto>;
  herdById: Map<string, Animal>;
  conflictsByAnimalId: Map<string, AnimalConflictSummary>;
  conflictedAnimalCount: number;
  activeConflictAnimalCount: number;
  coiByAnimalId: Map<string, CoiAnalysis>;
  cages: CageLocation[];
  breedings: BreedingRecord[];
  tasks: BarnTask[];
  careLogs: CareLog[];
  shows: ShowEvent[];
  feedBatches: FeedBatch[];
  feedAllocations: FeedAllocation[];
  ledgerEntries: LedgerEntry[];
  processingLogs: ProcessingLog[];
  youthProjectBooks: YouthProjectBook[];
  clientContacts: ClientContact[];
  waitlistEntries: WaitlistEntry[];
  animalReservations: AnimalReservation[];
  woolHarvests: WoolHarvest[];
  testingRecordCount: number;
  nonTestingRecordCount: number;
  totalRecordCount: number;
}

export function useBarnStore() {
  const adapterRef = useRef<StorageAdapter | null>(null);
  if (!adapterRef.current) {
    adapterRef.current = new WebSqliteAdapter();
  }
  const [initialPhotoCache] = useState<BoundedPhotoDataCache>(() => {
    const cap = detectCurrentDeviceCapability();
    const budget = getPhotoCacheBudgetForTier(cap.tier);
    return new BoundedPhotoDataCache(budget.maxEntries, budget.maxBytes);
  });
  const photoCacheRef = useRef<BoundedPhotoDataCache>(initialPhotoCache);
  const pedigreeAncestorCacheRef = useRef<Map<string, Animal>>(new Map());
  const loadedPedigreeArchiveKeysRef = useRef<Set<string>>(new Set());
  const snapshotRef = useRef<BarnDatabaseSnapshot | null>(null);
  const writeQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const backgroundMaintenanceInFlightRef = useRef<boolean>(false);
  const offloadAnimalsRef = useRef<
    ((animalIds: string[]) => Promise<{
      archivedCount: number;
      stubCount: number;
      removedCount: number;
      fileName: string;
    } | null>) | null
  >(null);

  const { clockSkewMs } = useConnectivityStatus();
  const [deviceId] = useState<string>(() => getOrCreateLocalDeviceId());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [snapshot, setSnapshot] = useState<BarnDatabaseSnapshot | null>(null);
  snapshotRef.current = snapshot;
  const [route, setRoute] = useState<WorkspaceRoute>('home');
  const routeHistoryRef = useRef<WorkspaceRoute[]>([]);
  const isApplyingHistoryStepRef = useRef<boolean>(false);
  const [activeSpeciesName, setActiveSpeciesName] = useState<string>('Rabbit');
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);
  const [pedigreeAnimalId, setPedigreeAnimalId] = useState<string | null>(null);
  const [pedigreeGenerations, setPedigreeGenerations] = useState<PedigreeGenerationDepth>(3);
  const [preselectedGrowthAnimalIds, setPreselectedGrowthAnimalIds] = useState<string[] | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [highlightedCageId, setHighlightedCageId] = useState<string | null>(null);
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);
  const [googleAuthConnected, setGoogleAuthConnected] = useState<boolean>(false);
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendarOption[]>([]);
  const [googleSyncBusy, setGoogleSyncBusy] = useState<boolean>(false);
  const [pendingCalendarSync, setPendingCalendarSync] =
    useState<PendingGoogleCalendarSync | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importConflictAlert, setImportConflictAlert] = useState<{
    message: string;
    speciesNames: string[];
    conflictedCount: number;
  } | null>(null);
  const [requestedHerdConflictNonce, setRequestedHerdConflictNonce] = useState<number>(0);
  const [storageStatus, setStorageStatus] = useState<StorageProtectionStatus | null>(null);
  const [syncOperations, setSyncOperations] = useState<SyncOperation[]>([]);
  const syncOperationsRef = useRef<SyncOperation[]>([]);
  syncOperationsRef.current = syncOperations;
  const [syncConflicts, setSyncConflicts] = useState<SyncConflictEntry[]>([]);
  const syncConflictsRef = useRef<SyncConflictEntry[]>([]);
  syncConflictsRef.current = syncConflicts;
  const [openAddSpeciesInSettings, setOpenAddSpeciesInSettings] = useState<boolean>(false);
  const [localLastBackupMeta, setLocalLastBackupMeta] = useState<LastBackupMeta | null>(() => {
    try {
      const raw = localStorage.getItem('pedigree.lastBackupMeta.v1');
      return raw ? (JSON.parse(raw) as LastBackupMeta) : null;
    } catch {
      return null;
    }
  });
  const [localSnoozedUntilMs, setLocalSnoozedUntilMs] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('pedigree.backupReminderSnoozedUntil.v1');
      return raw ? Number(raw) || 0 : 0;
    } catch {
      return 0;
    }
  });
  const [opfsSupported] = useState<boolean>(() => isOpfsSupported());
  const [opfsVaultBackups, setOpfsVaultBackups] = useState<VaultBackupMetadata[]>([]);
  const [rollingBackups, setRollingBackups] = useState<RollingBackupMeta[]>([]);
  const [archivedHerdBundles, setArchivedHerdBundles] = useState<ArchivedHerdIndexEntry[]>([]);
  const [wipedRecoveryContext, setWipedRecoveryContext] =
    useState<WipedStorageRecoveryContext | null>(null);
  const [exportCanaryWarning, setExportCanaryWarning] = useState<string | null>(null);
  const [backupSyncStatus, setBackupSyncStatus] = useState<BackupSyncStatus | null>(null);
  const [pruneSyncWarning, setPruneSyncWarning] = useState<OpfsPruneSyncWarning | null>(() =>
    readOpfsPruneSyncWarning()
  );

  const maxRevByEntityRef = useRef<Map<string, number>>(new Map());

  const rebuildMaxRevIndex = useCallback((ops: SyncOperation[]) => {
    const next = new Map<string, number>();
    for (const op of ops) {
      if (typeof op.record_rev === 'number' && Number.isFinite(op.record_rev)) {
        const prev = next.get(op.entity_uuid) ?? 0;
        if (op.record_rev > prev) {
          next.set(op.entity_uuid, op.record_rev);
        }
      }
    }
    maxRevByEntityRef.current = next;
  }, []);

  const nextEntityRev = useCallback((entityUuid: string, currentRev?: number): number => {
    const current = typeof currentRev === 'number' && Number.isFinite(currentRev) ? currentRev : 0;
    const indexed = maxRevByEntityRef.current.get(entityUuid) ?? 0;
    const nextRev = bumpRecordRevision({ _rev: Math.max(current, indexed) });
    maxRevByEntityRef.current.set(entityUuid, nextRev);
    return nextRev;
  }, []);

  const enqueueStoreMutation = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const next = writeQueueRef.current.then(task, task);
    // Keep queue chain alive even if an individual write rejects
    writeQueueRef.current = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }, []);

  const notify = useCallback((msg: string) => {
    setErrorMessage(null);
    setStatusMessage(msg);
  }, []);

  const reportPersistenceFailure = useCallback((actionLabel: string, err: unknown) => {
    if (err instanceof BackgroundPausedError || (err as { name?: string })?.name === 'BackgroundPausedError') {
      const paused = err as BackgroundPausedError;
      const isSeverity = Boolean(paused.severityIssue);
      logDiagnosticEvent({
        level: isSeverity ? 'warn' : 'info',
        category: 'lifecycle',
        message: paused.message,
      });
      emitAsyncErrorToast({
        title: isSeverity ? `${paused.taskName} Needs Attention` : `${paused.taskName} Paused`,
        detail: isSeverity
          ? `${paused.severityIssue} Tap Resume when ready.`
          : 'Progress was safely saved before switching apps and will auto-resume.',
        severity: isSeverity ? 'error' : 'warning',
        sticky: isSeverity,
        category: 'lifecycle',
        canOpenDiagnostics: isSeverity,
      });
      return;
    }
    const quotaHit = isQuotaExceededError(err);
    const memoryHit = isMemoryLikeError(err);
    logDiagnosticEvent({
      level: 'error',
      category: memoryHit ? 'memory' : 'storage',
      message: `${actionLabel} failed`,
      error: err,
    });
    if (quotaHit) {
      const msg = `Device storage is full while trying to ${actionLabel}. Open Import & Settings to download a backup, switch photos to Compact (960px), or free device space.`;
      setErrorMessage(msg);
      emitAsyncErrorToast({
        title: 'Device Storage Full',
        detail: msg,
        severity: 'error',
        sticky: true,
        category: 'storage',
        canOpenDiagnostics: true,
      });
    } else if (memoryHit) {
      const msg = `Low device memory while trying to ${actionLabel}. Close other browser tabs or use Compact photos in Import & Settings.`;
      setErrorMessage(msg);
      emitAsyncErrorToast({
        title: 'Low Memory Warning',
        detail: msg,
        severity: 'error',
        sticky: true,
        category: 'memory',
        canOpenDiagnostics: true,
      });
    } else {
      const detail = err instanceof Error ? err.message : 'Local storage write failed.';
      const msg = `Could not ${actionLabel}: ${detail}`;
      setErrorMessage(msg);
      emitAsyncErrorToast({
        title: `Could Not ${actionLabel}`,
        detail,
        severity: 'error',
        sticky: true,
        category: 'storage',
        canOpenDiagnostics: true,
      });
    }
  }, []);

  const recordOutboxOps = useCallback(async (ops: SyncOperation[]) => {
    if (ops.length === 0) return;
    const writtenOps = await appendSyncOperationsToIdb(ops);
    for (const op of writtenOps) {
      if (typeof op.record_rev === 'number' && Number.isFinite(op.record_rev)) {
        const prev = maxRevByEntityRef.current.get(op.entity_uuid) ?? 0;
        if (op.record_rev > prev) {
          maxRevByEntityRef.current.set(op.entity_uuid, op.record_rev);
        }
      }
    }
    const nextOps = [...syncOperationsRef.current, ...writtenOps];
    syncOperationsRef.current = nextOps;
    setSyncOperations(nextOps);
  }, []);

  const clearLocalSyncAndBackupReminderState = useCallback(async () => {
    await clearAllSyncStateInIdb();
    clearPausedBackgroundJob('directory_sync');
    maxRevByEntityRef.current.clear();
    syncOperationsRef.current = [];
    setSyncOperations([]);
    syncConflictsRef.current = [];
    setSyncConflicts([]);
    setLocalLastBackupMeta(null);
    setLocalSnoozedUntilMs(0);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('pedigree.lastBackupMeta.v1');
        localStorage.removeItem('pedigree.backupReminderSnoozedUntil.v1');
      } catch {
        // Ignore private browsing storage quota warnings
      }
    }
  }, []);

  const refreshStorageStatus = useCallback(async () => {
    const status = await checkStorageStatus();
    setStorageStatus(status);
    return status;
  }, []);

  const purgeOpfsTempWorkspace = useCallback(async (): Promise<{
    filesRemoved: number;
    bytesFreed: number;
  }> => {
    const result = await purgeOpfsTmp();
    await refreshStorageStatus();
    return result;
  }, [refreshStorageStatus]);

  const refreshVaultAndArchives = useCallback(async () => {
    const [opfsRes, rollingRes, archivesRes, syncRes] = await Promise.allSettled([
      listOpfsVaultBackups(),
      listRollingSnapshotBackups(),
      listOpfsHerdArchives(),
      getPersistedBackupSyncStatus(),
    ]);
    if (opfsRes.status === 'fulfilled') setOpfsVaultBackups(opfsRes.value);
    if (rollingRes.status === 'fulfilled') setRollingBackups(rollingRes.value);
    if (archivesRes.status === 'fulfilled') setArchivedHerdBundles(archivesRes.value);
    if (syncRes.status === 'fulfilled') setBackupSyncStatus(syncRes.value);
    setPruneSyncWarning(readOpfsPruneSyncWarning());
  }, []);

  const triggerPersistentStorageRequest = useCallback(async () => {
    const status = await requestPersistentStorage();
    setStorageStatus(status);
    notify(
      status.persisted
        ? 'Persistent local storage lock granted by browser.'
        : 'Browser kept standard storage mode. Install to Home Screen to elevate storage protection.'
    );
    return status;
  }, [notify]);

  // Sync active route into diagnostic logger
  useEffect(() => {
    setCurrentDiagnosticRoute(route);
  }, [route]);

  // Sync WorkspaceRoute steps with browser history (without interfering with ?emergency_reset=true)
  useEffect(() => {
    if (isLoading || typeof window === 'undefined') return;
    const stack = routeHistoryRef.current;
    const isWrapped = pedigreeBridge.isNativeWrapper();

    if (isApplyingHistoryStepRef.current) {
      isApplyingHistoryStepRef.current = false;
      return;
    }

    if (stack.length === 0) {
      stack.push(route);
      if (!isWrapped) {
        try {
          const currentState =
            window.history.state && typeof window.history.state === 'object'
              ? window.history.state
              : {};
          window.history.replaceState(
            { ...currentState, pedigreeRoute: route },
            '',
            window.location.href
          );
        } catch {
          // Ignore history restriction
        }
      }
      return;
    }

    if (route === 'home') {
      const alreadyAtHome = stack[stack.length - 1] === 'home';
      routeHistoryRef.current = ['home'];
      if (!alreadyAtHome && !isWrapped) {
        try {
          window.history.pushState({ pedigreeRoute: 'home' }, '', window.location.href);
        } catch {
          // Ignore history restriction
        }
      }
      return;
    }

    if (stack[stack.length - 1] !== route) {
      stack.push(route);
      if (stack.length > 50) {
        stack.splice(1, stack.length - 50);
      }
      if (!isWrapped) {
        try {
          window.history.pushState({ pedigreeRoute: route }, '', window.location.href);
        } catch {
          // Ignore history restriction
        }
      }
    }
  }, [route, isLoading]);

  useEffect(() => {
    if (typeof window === 'undefined' || pedigreeBridge.isNativeWrapper()) return;
    const onPopState = (event: PopStateEvent) => {
      if (isLoading) return;
      const state = event.state as { pedigreeRoute?: WorkspaceRoute; pedigreeModal?: boolean } | null;
      if (state && state.pedigreeModal) {
        return;
      }
      const stack = routeHistoryRef.current;
      // If a modal history entry popped back to the already-active route, keep route stack intact
      if (state && state.pedigreeRoute && state.pedigreeRoute === stack[stack.length - 1]) {
        return;
      }
      if (stack.length > 1) {
        stack.pop();
      }
      const nextRoute =
        (state && state.pedigreeRoute) ||
        stack[stack.length - 1] ||
        'home';
      isApplyingHistoryStepRef.current = true;
      setRoute(nextRoute);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isLoading]);

  // Priority 0 LIFO route step-back handler (modals register at priority >= 5 so they unwind first)
  useEffect(() => {
    return pedigreeBridge.registerBackHandler(() => {
      if (route === 'home') {
        routeHistoryRef.current = ['home'];
        return false;
      }
      const stack = routeHistoryRef.current;
      if (stack.length > 1) {
        stack.pop();
        const prevRoute = stack[stack.length - 1] || 'home';
        isApplyingHistoryStepRef.current = true;
        setRoute(prevRoute);
        try {
          window.history.replaceState({ pedigreeRoute: prevRoute }, '', window.location.href);
        } catch {
          // Ignore history restriction
        }
        return true;
      }
      routeHistoryRef.current = ['home'];
      isApplyingHistoryStepRef.current = true;
      setRoute('home');
      try {
        window.history.replaceState({ pedigreeRoute: 'home' }, '', window.location.href);
      } catch {
        // Ignore history restriction
      }
      return true;
    }, 0);
  }, [route]);

  const calendarDeliveryMode = snapshot?.settings.calendarSync?.deliveryMode;

  // Monitor Google Calendar auth state lazily only when Google Calendar delivery is enabled
  useEffect(() => {
    if (calendarDeliveryMode !== 'google_calendar') {
      return undefined;
    }
    return initGoogleCalendarAuth(
      (user) => {
        setGoogleAuthConnected(true);
        setGoogleUserEmail(user.email || user.displayName || 'Google Account');
      },
      (user) => {
        setGoogleAuthConnected(false);
        setGoogleUserEmail(user?.email || null);
      }
    );
  }, [calendarDeliveryMode]);

  // Initialize local SQLite / IndexedDB store + request persistent storage lock + load outbox
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const adapter = adapterRef.current!;
        let initial = await adapter.initialize({ lightweightPhotos: true });
        const detectedWiped = adapter.getWipedRecoveryContext?.() ?? null;
        if (!detectedWiped?.detected) {
          void sweepOrphanedOpfsTmpOnBoot();
          markPriorUseSentinelFromSnapshot(initial);
        }

        const [persistedRes, opsRes, conflictsRes] = await Promise.allSettled([
          requestPersistentStorage(),
          loadAllSyncOperationsFromIdb(),
          loadAllSyncConflictsFromIdb(),
        ]);

        const persistedStatus: StorageProtectionStatus | null =
          persistedRes.status === 'fulfilled'
            ? persistedRes.value
            : (() => {
                logDiagnosticEvent({
                  level: 'warn',
                  category: 'storage',
                  message:
                    'Corrective action: Persistent storage status check failed on startup — continuing with standard storage probe',
                  error: persistedRes.reason,
                });
                return null;
              })();

        const ops: SyncOperation[] =
          opsRes.status === 'fulfilled'
            ? opsRes.value
            : (() => {
                logDiagnosticEvent({
                  level: 'warn',
                  category: 'storage',
                  message:
                    'Corrective action: Failed loading local sync outbox on startup — initialized empty outbox queue',
                  error: opsRes.reason,
                });
                return [];
              })();

        const conflicts: SyncConflictEntry[] =
          conflictsRes.status === 'fulfilled'
            ? conflictsRes.value
            : (() => {
                logDiagnosticEvent({
                  level: 'warn',
                  category: 'storage',
                  message:
                    'Corrective action: Failed loading sync conflicts on startup — initialized empty conflict list',
                  error: conflictsRes.reason,
                });
                return [];
              })();

        // Run non-destructive startup health check & auto-repair if structural issues exist
        try {
          const healthReport = analyzeBarnDataHealth(initial);
          if (healthReport.autoRepairableCount > 0) {
            const repaired = repairBarnDataHealth(initial);
            if (repaired.repairsApplied.length > 0) {
              initial = repaired.nextSnapshot;
              try {
                await adapter.replaceSnapshot(initial);
              } catch (persistRepairErr) {
                logDiagnosticEvent({
                  level: 'warn',
                  category: 'storage',
                  message:
                    'Corrective action: Startup auto-repair applied in memory (disk re-save deferred)',
                  error: persistRepairErr,
                  details: repaired.repairsApplied,
                });
              }
              logDiagnosticEvent({
                level: 'warn',
                category: 'storage',
                message: `Corrective action: Startup health auto-repair fixed ${repaired.repairsApplied.length} database issue(s): ${repaired.repairsApplied.join(' | ')}`,
                details: repaired.repairsApplied,
              });
            }
          }
        } catch (healthErr) {
          logDiagnosticEvent({
            level: 'warn',
            category: 'storage',
            message:
              'Corrective action: Startup health scan skipped due to unexpected error — kept loaded snapshot intact',
            error: healthErr,
          });
        }

        if (!mounted) return;
        setSnapshot(initial);
        setWipedRecoveryContext(detectedWiped && detectedWiped.detected ? detectedWiped : null);
        setPedigreeGenerations(initial.settings.defaultGenerations);
        setStorageStatus(persistedStatus);
        rebuildMaxRevIndex(ops);
        syncOperationsRef.current = ops;
        setSyncOperations(ops);
        setSyncConflicts(conflicts);
        void refreshVaultAndArchives();

        const deepTarget = parseAppDeepLinkParams(
          typeof window !== 'undefined' ? window.location.search : ''
        );
        const deepTask = deepTarget.taskId
          ? initial.tasks.find((t) => t.id === deepTarget.taskId)
          : undefined;
        const deepAnimal = deepTarget.animalId
          ? initial.animals.find((a) => a.id === deepTarget.animalId)
          : undefined;
        const deepCage = deepTarget.cageId
          ? initial.cages.find((c) => c.id === deepTarget.cageId)
          : undefined;

        if (deepAnimal) {
          setActiveSpeciesName(deepAnimal.species);
          setSelectedAnimalId(deepAnimal.id);
          setRoute('herd');
        } else if (deepCage) {
          setActiveSpeciesName(deepCage.species);
          setHighlightedCageId(deepCage.id);
          setRoute('dashboard');
        } else if (deepTask) {
          setActiveSpeciesName(deepTask.species);
          setRoute('dashboard');
          setHighlightedTaskId(deepTask.id);
        } else if (deepTarget.species) {
          const matchedDeepSpecies = initial.speciesProfiles.find((sp) =>
            isSameSpecies(sp.name, deepTarget.species)
          );
          if (matchedDeepSpecies) {
            setActiveSpeciesName(matchedDeepSpecies.name);
            setRoute(deepTarget.route === 'herd' ? 'herd' : 'dashboard');
          } else {
            setActiveSpeciesName(initial.settings.defaultSpecies || 'Rabbit');
            setRoute('home');
          }
          if (deepTarget.animalId) {
            setStatusMessage(
              'Scanned animal profile was not found in local records on this device (it may have been deleted or live on another device).'
            );
          } else if (deepTarget.cageId) {
            setStatusMessage(
              'Linked cage or pen was not found in local records (it may have been deleted).'
            );
          } else if (deepTarget.taskId) {
            setStatusMessage(
              'Linked calendar chore was not found in local records (it may have been deleted).'
            );
          }
        } else if (deepTarget.animalId || deepTarget.cageId || deepTarget.taskId) {
          setActiveSpeciesName(initial.settings.defaultSpecies || 'Rabbit');
          setRoute('home');
          setStatusMessage(
            deepTarget.animalId
              ? 'Scanned animal profile was not found in local records on this device.'
              : deepTarget.cageId
                ? 'Linked cage or pen was not found in local records on this device.'
                : 'Linked calendar chore was not found in local records on this device.'
          );
        } else {
          const pinned = (initial.settings.pinnedLandingSpecies || '').trim();
          const matchedPinned = pinned
            ? initial.speciesProfiles.find((sp) => isSameSpecies(sp.name, pinned))
            : undefined;

          if (matchedPinned) {
            setActiveSpeciesName(matchedPinned.name);
            setRoute('dashboard');
          } else {
            setActiveSpeciesName(initial.settings.defaultSpecies || 'Rabbit');
            setRoute('home');
          }
        }

        if (
          typeof window !== 'undefined' &&
          !deepTarget.emergencyReset &&
          deepTarget.hasDeepLink
        ) {
          try {
            window.history.replaceState({}, '', window.location.pathname);
          } catch (historyErr) {
            logDiagnosticEvent({
              level: 'warn',
              category: 'runtime',
              message:
                'Corrective action: Could not clean deep-link URL query parameters via history.replaceState — continuing normally',
              error: historyErr,
            });
          }
        }
        logDiagnosticEvent({
          level: 'info',
          category: 'storage',
          message: `Database initialized (${adapter.engineName}: ${initial.animals.length} animals, ${(initial.animalPhotos ?? []).length} photos)`,
        });
        setIsLoading(false);
      } catch (err) {
        logDiagnosticEvent({
          level: 'fatal',
          category: isMemoryLikeError(err) ? 'memory' : 'storage',
          message: 'Database initialization failed during app startup — attempting emergency recovery',
          error: err,
        });

        let emergencySnapshot: BarnDatabaseSnapshot | null = null;
        let recoverySource = 'starter snapshot';
        try {
          const rollingList = await listRollingSnapshotBackups();
          for (const item of rollingList) {
            const recovered = await loadRollingSnapshotBackup(item.key);
            if (recovered) {
              emergencySnapshot = recovered;
              recoverySource = `rolling backup (${item.savedAtIso})`;
              break;
            }
          }
        } catch (rollingErr) {
          logDiagnosticEvent({
            level: 'warn',
            category: 'storage',
            message: 'Emergency startup rolling backup scan failed — using clean starter snapshot',
            error: rollingErr,
          });
        }

        if (!emergencySnapshot) {
          emergencySnapshot = buildFullPredefinedSampleSnapshot();
        }

        logDiagnosticEvent({
          level: 'warn',
          category: 'storage',
          message: `Corrective action: Startup crash auto-recovered using ${recoverySource} (${emergencySnapshot.animals.length} animals)`,
          error: err,
        });

        if (mounted) {
          setSnapshot(stripPhotoDataUrlsFromSnapshot(emergencySnapshot));
          setPedigreeGenerations(emergencySnapshot.settings.defaultGenerations || 3);
          setActiveSpeciesName(emergencySnapshot.settings.defaultSpecies || 'Rabbit');
          setRoute('home');
          setErrorMessage(
            `Local database hit a startup error and automatically recovered using ${recoverySource}. Open Import & Settings -> Diagnostics & Support to inspect logs.`
          );
          setIsLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Sync light/dark class and resolved warm/custom CSS variables on <html>
  useEffect(() => {
    if (!snapshot) return;
    const root = document.documentElement;
    if (snapshot.settings.themeMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    const vars = resolveThemeCssVariables(
      snapshot.settings.themeMode,
      snapshot.settings.customColors
    );
    for (const [prop, val] of Object.entries(vars)) {
      root.style.setProperty(prop, val);
    }
  }, [snapshot]);

  // Auto-clear transient status banner after 5s
  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  /**
   * Switches the active livestock species and clears any cross-species animal selection
   * so records from another species can NEVER bleed into the new species workspace.
   */
  const selectSpeciesWorkspace = useCallback(
    (speciesName: string, targetRoute: WorkspaceRoute = 'dashboard') => {
      if (!isSameSpecies(speciesName, activeSpeciesName)) {
        pedigreeAncestorCacheRef.current.clear();
        loadedPedigreeArchiveKeysRef.current.clear();
      }
      setActiveSpeciesName(speciesName);
      setSelectedAnimalId(null);
      setPedigreeAnimalId(null);
      setHighlightedTaskId(null);
      setRoute(targetRoute);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
    },
    [activeSpeciesName]
  );

  const isNonSpeciesRoute = NON_SPECIES_ROUTES.has(route);

  /**
   * Strictly species-isolated slice of all records for `activeSpeciesName`.
   * Skips heavy filtering/sorting when on non-species routes (`home`, `settings`, etc.)
   * and avoids re-evaluating across species-tab switches.
   */
  const baseSpeciesData = useMemo(() => {
    if (!snapshot) return null;
    const speciesProfile = resolveSpeciesProfile(activeSpeciesName, snapshot.speciesProfiles);
    if (isNonSpeciesRoute) {
      return {
        speciesProfile,
        animals: [],
        activeAnimals: [],
        archivedAnimals: [],
        animalPhotos: [],
        photosByAnimalId: new Map<string, AnimalPhoto[]>(),
        primaryPhotoByAnimalId: new Map<string, AnimalPhoto>(),
        herdById: new Map<string, Animal>(),
        cages: [],
        breedings: [],
        tasks: [],
        careLogs: [],
        shows: [],
        feedBatches: [],
        feedAllocations: [],
        ledgerEntries: [],
        processingLogs: [],
        youthProjectBooks: [],
        clientContacts: [],
        waitlistEntries: [],
        animalReservations: [],
        woolHarvests: [],
        testingRecordCount: 0,
        nonTestingRecordCount: 0,
        totalRecordCount: 0,
      };
    }
    const animals = snapshot.animals
      .filter((a) => isSameSpecies(a.species, speciesProfile.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    const activeAnimals = animals.filter((a) => !isAnimalArchived(a));
    const archivedAnimals = animals.filter((a) => isAnimalArchived(a));
    const archivedIds = new Set(archivedAnimals.map((a) => a.id));

    const herdById = buildSpeciesHerdMap(animals, speciesProfile.name);
    const cages = snapshot.cages.filter((c) => isSameSpecies(c.species, speciesProfile.name));
    const breedings = snapshot.breedings
      .filter((b) => isSameSpecies(b.species, speciesProfile.name))
      .sort((a, b) => b.bredDateIso.localeCompare(a.bredDateIso));

    const priorityRank = (p: string) => (p === 'High' ? 0 : p === 'Normal' ? 1 : 2);
    const tasks = snapshot.tasks
      .filter(
        (t) =>
          isSameSpecies(t.species, speciesProfile.name) &&
          // Archived animals stay in storage for pedigrees but do not generate active incomplete tasks
          (!t.linkedAnimalId || !archivedIds.has(t.linkedAnimalId) || t.completed)
      )
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const pDiff = priorityRank(a.priority) - priorityRank(b.priority);
        if (pDiff !== 0) return pDiff;
        return (a.dueDateIso || '9999-99-99').localeCompare(b.dueDateIso || '9999-99-99');
      });

    const careLogs = snapshot.careLogs
      .filter((l) => isSameSpecies(l.species, speciesProfile.name))
      .sort((a, b) => b.dateIso.localeCompare(a.dateIso));

    const animalPhotos = (snapshot.animalPhotos ?? []).filter((p) =>
      isSameSpecies(p.species, speciesProfile.name)
    );
    const photosByAnimalId = new Map<string, AnimalPhoto[]>();
    const primaryPhotoByAnimalId = new Map<string, AnimalPhoto>();

    for (const photo of animalPhotos) {
      const bucket = photosByAnimalId.get(photo.animalId) || [];
      bucket.push(photo);
      photosByAnimalId.set(photo.animalId, bucket);
    }
    for (const [aid, bucket] of photosByAnimalId.entries()) {
      bucket.sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.createdAt.localeCompare(b.createdAt);
      });
      if (bucket.length > 0) {
        primaryPhotoByAnimalId.set(aid, bucket[0]);
      }
    }

    const shows = snapshot.shows
      .filter((s) => isSameSpecies(s.species, speciesProfile.name))
      .sort((a, b) => a.eventDateIso.localeCompare(b.eventDateIso));

    const feedBatches = (snapshot.feedBatches ?? [])
      .filter((b) => isSameSpecies(b.species, speciesProfile.name))
      .sort((a, b) =>
        (b.purchaseDateIso || '').localeCompare(a.purchaseDateIso || '') ||
        b.createdAt.localeCompare(a.createdAt)
      );

    const feedAllocations = (snapshot.feedAllocations ?? [])
      .filter((al) => isSameSpecies(al.species, speciesProfile.name))
      .sort((a, b) =>
        (b.dateIso || '').localeCompare(a.dateIso || '') ||
        b.createdAt.localeCompare(a.createdAt)
      );

    const ledgerEntries = (snapshot.ledgerEntries ?? [])
      .filter((le) => isSameSpecies(le.species, speciesProfile.name))
      .sort((a, b) =>
        (b.dateIso || '').localeCompare(a.dateIso || '') ||
        b.createdAt.localeCompare(a.createdAt)
      );

    const processingLogs = (snapshot.processingLogs ?? [])
      .filter((pl) => isSameSpecies(pl.species, speciesProfile.name))
      .sort((a, b) =>
        (b.harvestDateIso || b.scheduledDateIso || '').localeCompare(
          a.harvestDateIso || a.scheduledDateIso || ''
        ) || b.createdAt.localeCompare(a.createdAt)
      );

    const youthProjectBooks = (snapshot.youthProjectBooks ?? [])
      .filter((yp) => isSameSpecies(yp.species, speciesProfile.name))
      .sort((a, b) =>
        (b.projectYear || '').localeCompare(a.projectYear || '') ||
        (b.startDateIso || '').localeCompare(a.startDateIso || '') ||
        b.createdAt.localeCompare(a.createdAt)
      );

    const clientContacts = (snapshot.clientContacts ?? [])
      .filter((c) => isSameSpecies(c.species, speciesProfile.name))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    const waitlistEntries = (snapshot.waitlistEntries ?? [])
      .filter((w) => isSameSpecies(w.species, speciesProfile.name))
      .sort(
        (a, b) =>
          (a.priorityRank || 9999) - (b.priorityRank || 9999) ||
          (a.inquiryDateIso || '').localeCompare(b.inquiryDateIso || '') ||
          a.createdAt.localeCompare(b.createdAt)
      );

    const animalReservations = (snapshot.animalReservations ?? [])
      .filter((r) => isSameSpecies(r.species, speciesProfile.name))
      .sort(
        (a, b) =>
          (b.reservedDateIso || '').localeCompare(a.reservedDateIso || '') ||
          b.createdAt.localeCompare(a.createdAt)
      );

    const woolHarvests = (snapshot.woolHarvests ?? [])
      .filter((w) => isSameSpecies(w.species, speciesProfile.name))
      .sort(
        (a, b) =>
          (b.harvestDateIso || '').localeCompare(a.harvestDateIso || '') ||
          b.createdAt.localeCompare(a.createdAt)
      );

    const testingRecordCount = countSpeciesTestingRecords(snapshot, speciesProfile.name);
    const nonTestingRecordCount = countSpeciesNonTestingRecords(snapshot, speciesProfile.name);
    const totalRecordCount = countAllSpeciesRecords(snapshot, speciesProfile.name);

    return {
      speciesProfile,
      animals,
      activeAnimals,
      archivedAnimals,
      animalPhotos,
      photosByAnimalId,
      primaryPhotoByAnimalId,
      herdById,
      cages,
      breedings,
      tasks,
      careLogs,
      shows,
      feedBatches,
      feedAllocations,
      ledgerEntries,
      processingLogs,
      youthProjectBooks,
      clientContacts,
      waitlistEntries,
      animalReservations,
      woolHarvests,
      testingRecordCount,
      nonTestingRecordCount,
      totalRecordCount,
    };
  }, [snapshot, activeSpeciesName, isNonSpeciesRoute]);

  const conflictsBySpeciesAnimalId = useMemo(() => {
    if (!baseSpeciesData || baseSpeciesData.animals.length === 0) {
      return {
        map: new Map<string, AnimalConflictSummary>(),
        conflictedAnimalCount: 0,
        activeConflictAnimalCount: 0,
      };
    }
    const map = analyzeBarnAnimalConflicts(baseSpeciesData.animals);
    let conflictedAnimalCount = 0;
    let activeConflictAnimalCount = 0;
    for (const summary of map.values()) {
      if (summary.hasAnyConflict) conflictedAnimalCount++;
      if (summary.hasActiveConflict) activeConflictAnimalCount++;
    }
    return { map, conflictedAnimalCount, activeConflictAnimalCount };
  }, [baseSpeciesData]);

  const coiByAnimalId = useMemo(() => {
    const map = new Map<string, CoiAnalysis>();
    if (!baseSpeciesData || baseSpeciesData.animals.length === 0) return map;
    if (route === 'pedigree') {
      const target =
        (pedigreeAnimalId ? baseSpeciesData.herdById.get(pedigreeAnimalId) : undefined) ??
        baseSpeciesData.animals[0];
      if (target) {
        const evaluator = createSpeciesCoiEvaluator(baseSpeciesData.herdById);
        map.set(target.id, evaluator.calculateAnimalCoi(target));
      }
    } else if (route === 'herd' && selectedAnimalId) {
      const target = baseSpeciesData.herdById.get(selectedAnimalId);
      if (target) {
        const evaluator = createSpeciesCoiEvaluator(baseSpeciesData.herdById);
        map.set(target.id, evaluator.calculateAnimalCoi(target));
      }
    }
    return map;
  }, [baseSpeciesData, route, pedigreeAnimalId, selectedAnimalId]);

  const activeSpeciesData: ActiveSpeciesData | null = useMemo(() => {
    if (!baseSpeciesData) return null;
    return {
      ...baseSpeciesData,
      conflictsByAnimalId: conflictsBySpeciesAnimalId.map,
      conflictedAnimalCount: conflictsBySpeciesAnimalId.conflictedAnimalCount,
      activeConflictAnimalCount: conflictsBySpeciesAnimalId.activeConflictAnimalCount,
      coiByAnimalId,
    };
  }, [baseSpeciesData, conflictsBySpeciesAnimalId, coiByAnimalId]);

  const effectiveLastBackupMeta: LastBackupMeta | null =
    snapshot?.settings.lastBackupMeta ?? localLastBackupMeta;

  const effectiveBackupSnoozedUntilMs: number =
    snapshot?.settings.backupReminderSnoozedUntilMs ?? localSnoozedUntilMs;

  const backupStatus: BackupStatusEvaluation | null = useMemo(() => {
    if (!snapshot) return null;
    void clockSkewMs;
    return evaluateBackupStatus(
      snapshot,
      effectiveLastBackupMeta,
      getAdjustedNowMs(),
      effectiveBackupSnoozedUntilMs
    );
  }, [snapshot, effectiveLastBackupMeta, effectiveBackupSnoozedUntilMs, clockSkewMs]);

  const loadAnimalPhotoDataUrl = useCallback(
    async (photoId: string): Promise<string | null> => {
      if (!photoId) return null;
      const cache = photoCacheRef.current!;
      const cached = cache.get(photoId);
      if (cached) return cached;
      const inState = (snapshot?.animalPhotos ?? []).find((p) => p.id === photoId);
      if (inState?.dataUrl) {
        cache.set(photoId, inState.dataUrl);
        return inState.dataUrl;
      }
      const fetched = await adapterRef.current?.loadAnimalPhotoDataUrl?.(photoId);
      if (fetched) {
        cache.set(photoId, fetched);
        return fetched;
      }
      return inState?.thumbnailDataUrl || null;
    },
    [snapshot]
  );

  const loadAnimalPhotoDataUrlsBatch = useCallback(
    async (photoIds: string[]): Promise<Record<string, string>> => {
      const uniqueIds = Array.from(new Set(photoIds.filter((id) => Boolean(id)))).slice(0, 60);
      if (uniqueIds.length === 0) return {};

      const result: Record<string, string> = {};
      const missing: string[] = [];
      const cache = photoCacheRef.current;
      const photoById = new Map((snapshotRef.current?.animalPhotos ?? []).map((p) => [p.id, p]));

      for (const id of uniqueIds) {
        const cached = cache?.get(id);
        if (cached) {
          result[id] = cached;
          continue;
        }
        const inState = photoById.get(id);
        if (inState?.dataUrl) {
          cache?.set(id, inState.dataUrl);
          result[id] = inState.dataUrl;
          continue;
        }
        missing.push(id);
      }

      if (missing.length > 0 && adapterRef.current?.loadAnimalPhotoDataUrlsBatch) {
        try {
          const fetched = await adapterRef.current.loadAnimalPhotoDataUrlsBatch(missing);
          for (const id of missing) {
            const url = fetched[id];
            if (url) {
              cache?.set(id, url);
              result[id] = url;
            }
          }
        } catch {
          // Fall back to thumbnails below without disrupting print preview
        }
      }

      for (const id of uniqueIds) {
        if (!result[id]) {
          const thumb = photoById.get(id)?.thumbnailDataUrl;
          if (thumb) result[id] = thumb;
        }
      }

      return result;
    },
    []
  );

  const hydrateSnapshotForExport = useCallback(
    async (
      targetSnapshot?: BarnDatabaseSnapshot,
      filterSpecies?: string
    ): Promise<BarnDatabaseSnapshot> => {
      const base = targetSnapshot ?? snapshotRef.current;
      if (!base) {
        throw new Error('Local database is not loaded yet.');
      }
      return hydrateSnapshotWithPhotoDataUrls(
        base,
        async (ids) =>
          (await adapterRef.current?.loadAnimalPhotoDataUrlsBatch?.(ids)) ?? {},
        filterSpecies,
        photoCacheRef.current ?? undefined
      );
    },
    []
  );

  const mirrorSnapshotToNativeVaultIfWrapped = useCallback(
    async (
      hydratedSnapshot: BarnDatabaseSnapshot,
      kind: 'manual' | 'monthly' | 'pre_reset' | 'pre_upgrade'
    ): Promise<boolean> => {
      if (!pedigreeBridge.isNativeWrapper() || typeof TextEncoder === 'undefined') {
        return false;
      }
      try {
        const encoder = new TextEncoder();
        const MAX_NATIVE_MIRROR_BYTES = 14 * 1024 * 1024;
        const estimatedPhotoPayloadBytes = (hydratedSnapshot.animalPhotos ?? []).reduce(
          (sum, photo) => sum + (photo.dataUrl?.length ?? 0),
          0
        );
        let photosDehydrated = estimatedPhotoPayloadBytes > 10 * 1024 * 1024;
        let payloadSnapshot = photosDehydrated
          ? stripPhotoDataUrlsFromSnapshot(hydratedSnapshot)
          : hydratedSnapshot;
        let encoded = encoder.encode(JSON.stringify(payloadSnapshot));
        if (!photosDehydrated && encoded.byteLength > MAX_NATIVE_MIRROR_BYTES) {
          payloadSnapshot = stripPhotoDataUrlsFromSnapshot(hydratedSnapshot);
          encoded = encoder.encode(JSON.stringify(payloadSnapshot));
          photosDehydrated = true;
        }
        if (encoded.byteLength > 15.5 * 1024 * 1024) {
          return false;
        }
        const ok = await pedigreeBridge.syncBackupSnapshotToNative({
          snapshotId: `${kind}_${Date.now()}`,
          createdAt: getAdjustedNowIsoUtc(),
          format: 'json',
          bytes: encoded,
          metadata: {
            kind,
            animalCount: payloadSnapshot.animals.length,
            photosDehydrated,
          },
        });
        return ok;
      } catch {
        return false;
      }
    },
    []
  );

  const saveSafetyRollingBackup = useCallback(
    async (targetSnapshot: BarnDatabaseSnapshot, note?: string): Promise<void> => {
      const hydrated = await hydrateSnapshotForExport(targetSnapshot);
      await Promise.allSettled([
        saveRollingSnapshotBackup(hydrated),
        isOpfsSupported()
          ? saveOpfsVaultBackup(hydrated, {
              kind: 'pre_reset',
              note: note || 'Automatic pre-destructive safety snapshot',
            })
          : Promise.resolve(null),
        mirrorSnapshotToNativeVaultIfWrapped(hydrated, 'pre_reset'),
      ]);
      void refreshVaultAndArchives();
    },
    [hydrateSnapshotForExport, mirrorSnapshotToNativeVaultIfWrapped, refreshVaultAndArchives]
  );

  const loadPedigreeNeighborhood = useCallback(
    async (rootIds: string[], maxDepth: number): Promise<Animal[]> => {
      const cleanRoots = Array.from(
        new Set(rootIds.filter((id) => typeof id === 'string' && id.trim().length > 0))
      );
      if (cleanRoots.length === 0) return [];
      const boundedDepth = Math.min(8, Math.max(0, Math.floor(maxDepth)));
      const adapter = adapterRef.current;

      const resolvedMap = new Map<string, Animal>();
      if (adapter?.queryPedigreeNeighborhood) {
        const rows = await adapter.queryPedigreeNeighborhood(cleanRoots, boundedDepth);
        for (const a of rows) {
          resolvedMap.set(a.id, a);
        }
      } else {
        const all = snapshotRef.current?.animals ?? [];
        const byId = new Map<string, Animal>(all.map((a) => [a.id, a]));
        const visited = new Set<string>();
        let frontier = cleanRoots;
        for (let depth = 0; depth <= boundedDepth && frontier.length > 0; depth++) {
          const nextFrontier: string[] = [];
          for (const id of frontier) {
            if (visited.has(id)) continue;
            visited.add(id);
            const found = byId.get(id);
            if (!found) continue;
            resolvedMap.set(found.id, found);
            if (depth < boundedDepth) {
              if (found.sireId && !visited.has(found.sireId)) nextFrontier.push(found.sireId);
              if (found.damId && !visited.has(found.damId)) nextFrontier.push(found.damId);
            }
          }
          frontier = nextFrontier;
        }
      }

      // Hydrate any offloaded OPFS /archives ancestor stubs lazily from cache or OPFS
      const cache = pedigreeAncestorCacheRef.current;
      const walkCacheParents = () => {
        let extraFrontier: string[] = [];
        for (const a of resolvedMap.values()) {
          if (a.sireId && !resolvedMap.has(a.sireId)) extraFrontier.push(a.sireId);
          if (a.damId && !resolvedMap.has(a.damId)) extraFrontier.push(a.damId);
        }
        for (let step = 0; step < boundedDepth && extraFrontier.length > 0; step++) {
          const nextExtra: string[] = [];
          for (const pid of extraFrontier) {
            if (resolvedMap.has(pid)) continue;
            const cachedParent = cache.get(pid);
            if (cachedParent) {
              // Refresh LRU position
              cache.delete(pid);
              cache.set(pid, cachedParent);
              resolvedMap.set(cachedParent.id, cachedParent);
              if (cachedParent.sireId && !resolvedMap.has(cachedParent.sireId)) {
                nextExtra.push(cachedParent.sireId);
              }
              if (cachedParent.damId && !resolvedMap.has(cachedParent.damId)) {
                nextExtra.push(cachedParent.damId);
              }
            }
          }
          extraFrontier = nextExtra;
        }
      };

      walkCacheParents();

      const candidateArchiveKeys = new Set<string>();
      for (const a of resolvedMap.values()) {
        if (!a.offloadedArchiveKey) continue;
        const missingParent =
          (a.sireId && !resolvedMap.has(a.sireId)) ||
          (a.damId && !resolvedMap.has(a.damId));
        if (
          missingParent ||
          !loadedPedigreeArchiveKeysRef.current.has(a.offloadedArchiveKey)
        ) {
          candidateArchiveKeys.add(a.offloadedArchiveKey);
        }
      }
      if (candidateArchiveKeys.size > 0 && isOpfsSupported()) {
        for (const archiveKey of candidateArchiveKeys) {
          loadedPedigreeArchiveKeysRef.current.add(archiveKey);
          try {
            const loaded = await loadOpfsHerdArchive(
              archiveKey,
              snapshotRef.current?.settings
            );
            if (loaded?.unpacked?.animals) {
              for (const archAnimal of loaded.unpacked.animals) {
                if (cache.has(archAnimal.id)) cache.delete(archAnimal.id);
                cache.set(archAnimal.id, archAnimal);
                while (cache.size > 256) {
                  const oldest = cache.keys().next().value;
                  if (oldest !== undefined) cache.delete(oldest);
                  else break;
                }
              }
            }
          } catch {
            // Best-effort archive hydration; stub remains safely usable
          }
        }
        walkCacheParents();
      }

      // Keep bounded LRU cache synced with fresh records
      for (const a of resolvedMap.values()) {
        if (cache.has(a.id)) cache.delete(a.id);
        cache.set(a.id, a);
        while (cache.size > 256) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
          else break;
        }
      }

      return Array.from(resolvedMap.values());
    },
    []
  );

  const checkPedigreeBranchesHaveAncestors = useCallback(
    async (animalIds: string[]): Promise<Record<string, boolean>> => {
      const cleanIds = Array.from(
        new Set(animalIds.filter((id) => typeof id === 'string' && id.trim().length > 0))
      );
      if (cleanIds.length === 0) return {};
      const adapter = adapterRef.current;
      if (adapter?.queryPedigreeBranchAncestorsExist) {
        return adapter.queryPedigreeBranchAncestorsExist(cleanIds);
      }
      const byId = new Map<string, Animal>(
        (snapshotRef.current?.animals ?? []).map((a) => [a.id, a])
      );
      const out: Record<string, boolean> = {};
      for (const id of cleanIds) {
        const a = byId.get(id);
        out[id] = Boolean(
          a &&
            ((a.sireId && byId.has(a.sireId)) ||
              (a.damId && byId.has(a.damId)) ||
              a.offloadedArchiveKey)
        );
      }
      return out;
    },
    []
  );

  const reloadFromAdapter = useCallback(async () => {
    const fresh = await adapterRef.current!.loadSnapshot({ lightweightPhotos: true });
    pedigreeAncestorCacheRef.current.clear();
    loadedPedigreeArchiveKeysRef.current.clear();
    snapshotRef.current = fresh;
    setSnapshot(fresh);
    void refreshStorageStatus();
    void refreshVaultAndArchives();
  }, [refreshStorageStatus, refreshVaultAndArchives]);

  const reloadFromAdapterSilently = useCallback(async () => {
    const adapter = adapterRef.current;
    if (!adapter) return;
    const [fresh, freshOps, freshConflicts] = await Promise.all([
      adapter.loadSnapshot({ lightweightPhotos: true }),
      loadAllSyncOperationsFromIdb().catch(() => syncOperationsRef.current),
      loadAllSyncConflictsFromIdb().catch(() => syncConflictsRef.current),
    ]);
    photoCacheRef.current?.clear();
    pedigreeAncestorCacheRef.current.clear();
    loadedPedigreeArchiveKeysRef.current.clear();
    snapshotRef.current = fresh;
    setSnapshot(fresh);
    setPedigreeGenerations(fresh.settings.defaultGenerations);
    rebuildMaxRevIndex(freshOps);
    syncOperationsRef.current = freshOps;
    setSyncOperations(freshOps);
    syncConflictsRef.current = freshConflicts;
    setSyncConflicts(freshConflicts);

    const animalIds = new Set(fresh.animals.map((a) => a.id));
    setSelectedAnimalId((prev) => (prev && !animalIds.has(prev) ? null : prev));
    setPedigreeAnimalId((prev) => (prev && !animalIds.has(prev) ? null : prev));

    const taskIds = new Set(fresh.tasks.map((t) => t.id));
    setHighlightedTaskId((prev) => (prev && !taskIds.has(prev) ? null : prev));

    setActiveSpeciesName((prev) => {
      if (fresh.speciesProfiles.some((sp) => isSameSpecies(sp.name, prev))) {
        return prev;
      }
      return fresh.speciesProfiles[0]?.name || fresh.settings.defaultSpecies || prev;
    });

    void refreshStorageStatus();
    void refreshVaultAndArchives();
  }, [refreshStorageStatus, refreshVaultAndArchives]);

  // Silently reload Tab B whenever another tab commits a new IndexedDB epoch
  useEffect(() => {
    if (isLoading) return;
    return subscribeCrossTabDbCommits(() => {
      void enqueueStoreMutation(() => reloadFromAdapterSilently());
    });
  }, [isLoading, enqueueStoreMutation, reloadFromAdapterSilently]);

  // Keep prior-use sentinel synced with active non-wiped barn data
  useEffect(() => {
    if (!snapshot || isLoading || wipedRecoveryContext?.detected) return;
    markPriorUseSentinelFromSnapshot(snapshot);
  }, [snapshot, isLoading, wipedRecoveryContext]);

  // Trim cached full-res photos on hide, and catch any remote-tab writes when returning visible
  useEffect(() => {
    return registerFreezeLifecycleListener({
      id: 'barn-store-photo-cache-trim',
      onHidden: () => {
        photoCacheRef.current?.clear();
        pedigreeAncestorCacheRef.current.clear();
        loadedPedigreeArchiveKeysRef.current.clear();
      },
      onVisible: () => {
        if (isLoading) return;
        const adapter = adapterRef.current;
        if (!adapter?.syncFromPersistedStorageIfStale) return;
        void enqueueStoreMutation(async () => {
          const updated = await adapter.syncFromPersistedStorageIfStale!();
          if (updated) {
            await reloadFromAdapterSilently();
          }
        });
      },
    });
  }, [isLoading, enqueueStoreMutation, reloadFromAdapterSilently]);

  const hasSnapshotReady = Boolean(snapshot);
  const wipedRecoveryDetected = Boolean(wipedRecoveryContext?.detected);

  // Idle Monthly OPFS Auto-Backup & Export Canary (visibilityState-guarded, zero foreground contention)
  useEffect(() => {
    if (isLoading || !hasSnapshotReady || wipedRecoveryDetected || !isOpfsSupported()) {
      return;
    }

    let cancelled = false;
    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const runBackgroundMaintenance = async () => {
      if (cancelled || backgroundMaintenanceInFlightRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const currentSnapshot = snapshotRef.current;
      if (!currentSnapshot) return;

      backgroundMaintenanceInFlightRef.current = true;
      try {
        try {
          if (currentSnapshot.animals.length > 0 && hasNonTestingBarnData(currentSnapshot)) {
            if (await shouldCreateMonthlyOpfsBackup()) {
              assertForegroundOrPause('Monthly OPFS Backup');
              const hydrated = await hydrateSnapshotForExport(currentSnapshot);
              assertForegroundOrPause('Monthly OPFS Backup');
              const saved = await saveOpfsVaultBackup(hydrated, {
                kind: 'monthly',
                note: 'Scheduled 30-day automatic backup',
              });
              void mirrorSnapshotToNativeVaultIfWrapped(hydrated, 'monthly');
              if (saved && !cancelled) {
                void refreshVaultAndArchives();
              }
            }
          }
        } catch (bgErr) {
          if (bgErr instanceof BackgroundPausedError) {
            return;
          }
          // Non-fatal background monthly backup check
        }

        if (cancelled) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

        try {
          if (shouldRunExportCanary()) {
            assertForegroundOrPause('Export Canary');
            const latestSnap = snapshotRef.current ?? currentSnapshot;
            const res = await runOpfsExportCanary(latestSnap);
            if (!res.ok && !cancelled) {
              setExportCanaryWarning(
                res.reason || 'Background export canary verification could not read back probe.'
              );
            }
          }
        } catch (canaryErr) {
          if (canaryErr instanceof BackgroundPausedError) {
            return;
          }
          // Non-fatal canary probe check
        }
      } finally {
        backgroundMaintenanceInFlightRef.current = false;
      }
    };

    const scheduleIdleRun = () => {
      if (cancelled) return;
      const win = typeof window !== 'undefined' ? (window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      }) : null;
      if (win && typeof win.requestIdleCallback === 'function') {
        if (idleHandle !== null && typeof win.cancelIdleCallback === 'function') {
          win.cancelIdleCallback(idleHandle);
        }
        idleHandle = win.requestIdleCallback(
          () => {
            idleHandle = null;
            void runBackgroundMaintenance();
          },
          { timeout: 6000 }
        );
      } else {
        if (timeoutHandle !== null) clearTimeout(timeoutHandle);
        timeoutHandle = setTimeout(() => {
          timeoutHandle = null;
          void runBackgroundMaintenance();
        }, 3500);
      }
    };

    scheduleIdleRun();

    const unregisterFreeze = registerFreezeLifecycleListener({
      id: 'barn-store-idle-maintenance',
      onVisible: () => {
        scheduleIdleRun();
      },
    });

    return () => {
      cancelled = true;
      unregisterFreeze();
      const win = typeof window !== 'undefined' ? (window as unknown as {
        cancelIdleCallback?: (id: number) => void;
      }) : null;
      if (idleHandle !== null && win && typeof win.cancelIdleCallback === 'function') {
        win.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) clearTimeout(timeoutHandle);
    };
  }, [
    isLoading,
    hasSnapshotReady,
    wipedRecoveryDetected,
    hydrateSnapshotForExport,
    refreshVaultAndArchives,
  ]);

  const updateSettingsInternal = useCallback(
    async (patch: Partial<BarnSettings>, options?: { silent?: boolean }) => {
      const currentSnapshot = snapshotRef.current;
      if (!currentSnapshot) return;
      try {
        const ts = getAdjustedNowIsoUtc();
        const rev = nextEntityRev(currentSnapshot.settings.id, currentSnapshot.settings._rev);
        const updated: BarnSettings = {
          ...currentSnapshot.settings,
          ...patch,
          _rev: rev,
          updatedAt: ts,
        };
        await adapterRef.current!.saveSettings(updated);
        const ops = diffEntityFieldsToOperations({
          entityType: 'settings',
          previous: currentSnapshot.settings,
          next: updated,
          deviceId,
          nextCounter: allocateNextLogicalCounter,
          timestamp: ts,
          recordRev: rev,
        });
        await recordOutboxOps(ops);
        if (patch.defaultGenerations) {
          setPedigreeGenerations(patch.defaultGenerations);
        }
        snapshotRef.current = { ...currentSnapshot, settings: updated };
        setSnapshot((prev) => (prev ? { ...prev, settings: updated } : prev));
        if (!options?.silent) {
          notify('Barn preferences saved locally.');
        }
      } catch (err) {
        reportPersistenceFailure('save barn preferences', err);
      }
    },
    [deviceId, nextEntityRev, recordOutboxOps, notify, reportPersistenceFailure]
  );

  const updateSettings = useCallback(
    async (patch: Partial<BarnSettings>, options?: { silent?: boolean }) => {
      return enqueueStoreMutation(() => updateSettingsInternal(patch, options));
    },
    [enqueueStoreMutation, updateSettingsInternal]
  );

  const ignoreTaskAlertsPermanently = useCallback(
    async (taskIds: string[]) => {
      if (taskIds.length === 0) return;
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        const merged = Array.from(
          new Set([...(currentSnapshot.settings.ignoredTaskIds || []), ...taskIds])
        );
        await updateSettingsInternal({ ignoredTaskIds: merged }, { silent: true });
        notify(`Dismissed ${taskIds.length} task alert(s) permanently.`);
      });
    },
    [enqueueStoreMutation, updateSettingsInternal, notify]
  );

  const clearTaskAlertGroup = useCallback(
    async (speciesName: string, groupSignature: string | string[]) => {
      const isEmpty = Array.isArray(groupSignature)
        ? groupSignature.length === 0
        : !groupSignature;
      if (isEmpty) return;
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        const key = speciesName.trim().toLowerCase();
        const prevMap = currentSnapshot.settings.dismissedTaskGroupKeys || {};
        const nextMap: Record<string, string | string[]> = { ...prevMap, [key]: groupSignature };
        await updateSettingsInternal({ dismissedTaskGroupKeys: nextMap }, { silent: true });
        notify(`Cleared alert for current ${speciesName} overdue tasks.`);
      });
    },
    [enqueueStoreMutation, updateSettingsInternal, notify]
  );

  const dismissSpeciesMemoAlert = useCallback(
    async (speciesName: string, memoSignature: string) => {
      if (!memoSignature) return;
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        const key = speciesName.trim().toLowerCase();
        const prevMap = currentSnapshot.settings.dismissedMemoAlertSignatures || {};
        const nextMap: Record<string, string> = { ...prevMap, [key]: memoSignature };
        await updateSettingsInternal(
          { dismissedMemoAlertSignatures: nextMap },
          { silent: true }
        );
      });
    },
    [enqueueStoreMutation, updateSettingsInternal]
  );

  const recordBackupExport = useCallback(
    async (format: 'zip' | 'sqlite' | 'json', fileName?: string) => {
      const meta: LastBackupMeta = {
        exportedAtIso: getAdjustedNowIsoUtc(),
        format,
        fileName,
      };
      setLocalLastBackupMeta(meta);
      setLocalSnoozedUntilMs(0);
      try {
        localStorage.setItem('pedigree.lastBackupMeta.v1', JSON.stringify(meta));
        localStorage.removeItem('pedigree.backupReminderSnoozedUntil.v1');
      } catch {
        // Ignore private browsing storage quota warnings
      }
      if (snapshotRef.current) {
        await enqueueStoreMutation(() =>
          updateSettingsInternal(
            { lastBackupMeta: meta, backupReminderSnoozedUntilMs: 0 },
            { silent: true }
          )
        );
      }
    },
    [enqueueStoreMutation, updateSettingsInternal]
  );

  const snoozeBackupReminder = useCallback(
    async (hours: number = 24) => {
      const untilMs = getAdjustedNowMs() + hours * 60 * 60 * 1000;
      setLocalSnoozedUntilMs(untilMs);
      try {
        localStorage.setItem('pedigree.backupReminderSnoozedUntil.v1', String(untilMs));
      } catch {
        // Ignore storage warnings
      }
      if (snapshotRef.current) {
        await enqueueStoreMutation(() =>
          updateSettingsInternal({ backupReminderSnoozedUntilMs: untilMs }, { silent: true })
        );
      }
    },
    [enqueueStoreMutation, updateSettingsInternal]
  );

  const togglePinSpeciesLanding = useCallback(
    async (speciesName: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        const currentlyPinned = isSameSpecies(
          currentSnapshot.settings.pinnedLandingSpecies,
          speciesName
        );
        const nextPinned = currentlyPinned ? '' : speciesName;
        await updateSettingsInternal({ pinnedLandingSpecies: nextPinned }, { silent: true });
        notify(
          nextPinned
            ? `Pinned ${speciesName} hub as your startup landing page.`
            : 'Unpinned startup species — app will open on All-Species Home.'
        );
      });
    },
    [enqueueStoreMutation, updateSettingsInternal, notify]
  );

  const saveSpeciesProfile = useCallback(
    async (profile: SpeciesProfile): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const ts = getAdjustedNowIsoUtc();
        const existing = currentSnapshot?.speciesProfiles.find((sp) => sp.id === profile.id);
        try {
          if (existing) {
            const rev = nextEntityRev(existing.id, existing._rev);
            const clean: SpeciesProfile = {
              ...profile,
              sortOrder: profile.sortOrder ?? existing.sortOrder ?? 0,
              name: profile.name.trim(),
              defaultAnimalPrefix: (profile.defaultAnimalPrefix || '').trim(),
              memoText: sanitizeSpeciesMemo(profile.memoText ?? existing.memoText ?? ''),
              memoUpdatedAt: profile.memoUpdatedAt ?? existing.memoUpdatedAt ?? '',
              breedOverrides: normalizeBreedScheduleOverrides(profile.breedOverrides),
              targetWeightCurve: normalizeTargetWeightCurve(
                profile.targetWeightCurve ?? existing.targetWeightCurve
              ),
              _rev: rev,
              createdAt: profile.createdAt || existing.createdAt || ts,
              updatedAt: ts,
            };

            const renamed =
              currentSnapshot && !isSameSpecies(existing.name, clean.name);
            if (renamed && currentSnapshot) {
              const oldName = existing.name;
              const newName = clean.name;
              const oldKey = oldName.trim().toLowerCase();
              const newKey = newName.trim().toLowerCase();

              const nextDismissedTaskGroups = {
                ...(currentSnapshot.settings.dismissedTaskGroupKeys || {}),
              };
              if (oldKey in nextDismissedTaskGroups) {
                nextDismissedTaskGroups[newKey] = nextDismissedTaskGroups[oldKey];
                delete nextDismissedTaskGroups[oldKey];
              }
              const nextDismissedMemos = {
                ...(currentSnapshot.settings.dismissedMemoAlertSignatures || {}),
              };
              if (oldKey in nextDismissedMemos) {
                nextDismissedMemos[newKey] = nextDismissedMemos[oldKey];
                delete nextDismissedMemos[oldKey];
              }

              const renamedSnapshot: BarnDatabaseSnapshot = {
                ...currentSnapshot,
                settings: {
                  ...currentSnapshot.settings,
                  defaultSpecies: isSameSpecies(currentSnapshot.settings.defaultSpecies, oldName)
                    ? newName
                    : currentSnapshot.settings.defaultSpecies,
                  pinnedLandingSpecies: isSameSpecies(
                    currentSnapshot.settings.pinnedLandingSpecies,
                    oldName
                  )
                    ? newName
                    : currentSnapshot.settings.pinnedLandingSpecies,
                  dismissedTaskGroupKeys: nextDismissedTaskGroups,
                  dismissedMemoAlertSignatures: nextDismissedMemos,
                  updatedAt: ts,
                },
                speciesProfiles: currentSnapshot.speciesProfiles.map((sp) =>
                  sp.id === clean.id ? clean : sp
                ),
                animals: currentSnapshot.animals.map((a) =>
                  isSameSpecies(a.species, oldName) ? { ...a, species: newName, updatedAt: ts } : a
                ),
                animalPhotos: (currentSnapshot.animalPhotos ?? []).map((p) =>
                  isSameSpecies(p.species, oldName) ? { ...p, species: newName, updatedAt: ts } : p
                ),
                cages: currentSnapshot.cages.map((c) =>
                  isSameSpecies(c.species, oldName) ? { ...c, species: newName, updatedAt: ts } : c
                ),
                breedings: currentSnapshot.breedings.map((b) =>
                  isSameSpecies(b.species, oldName) ? { ...b, species: newName, updatedAt: ts } : b
                ),
                tasks: currentSnapshot.tasks.map((t) =>
                  isSameSpecies(t.species, oldName) ? { ...t, species: newName, updatedAt: ts } : t
                ),
                careLogs: currentSnapshot.careLogs.map((l) =>
                  isSameSpecies(l.species, oldName) ? { ...l, species: newName, updatedAt: ts } : l
                ),
                shows: currentSnapshot.shows.map((s) =>
                  isSameSpecies(s.species, oldName) ? { ...s, species: newName, updatedAt: ts } : s
                ),
                feedBatches: (currentSnapshot.feedBatches ?? []).map((fb) =>
                  isSameSpecies(fb.species, oldName) ? { ...fb, species: newName, updatedAt: ts } : fb
                ),
                feedAllocations: (currentSnapshot.feedAllocations ?? []).map((fa) =>
                  isSameSpecies(fa.species, oldName) ? { ...fa, species: newName, updatedAt: ts } : fa
                ),
                ledgerEntries: (currentSnapshot.ledgerEntries ?? []).map((le) =>
                  isSameSpecies(le.species, oldName) ? { ...le, species: newName, updatedAt: ts } : le
                ),
                processingLogs: (currentSnapshot.processingLogs ?? []).map((pl) =>
                  isSameSpecies(pl.species, oldName) ? { ...pl, species: newName, updatedAt: ts } : pl
                ),
                youthProjectBooks: (currentSnapshot.youthProjectBooks ?? []).map((yp) =>
                  isSameSpecies(yp.species, oldName) ? { ...yp, species: newName, updatedAt: ts } : yp
                ),
                clientContacts: (currentSnapshot.clientContacts ?? []).map((c) =>
                  isSameSpecies(c.species, oldName) ? { ...c, species: newName, updatedAt: ts } : c
                ),
                waitlistEntries: (currentSnapshot.waitlistEntries ?? []).map((w) =>
                  isSameSpecies(w.species, oldName) ? { ...w, species: newName, updatedAt: ts } : w
                ),
                animalReservations: (currentSnapshot.animalReservations ?? []).map((r) =>
                  isSameSpecies(r.species, oldName) ? { ...r, species: newName, updatedAt: ts } : r
                ),
                woolHarvests: (currentSnapshot.woolHarvests ?? []).map((w) =>
                  isSameSpecies(w.species, oldName) ? { ...w, species: newName, updatedAt: ts } : w
                ),
              };
              await adapterRef.current!.replaceSnapshot(renamedSnapshot);
              if (isSameSpecies(activeSpeciesName, oldName)) {
                setActiveSpeciesName(newName);
              }
            } else {
              await adapterRef.current!.saveSpeciesProfile(clean);
            }

            await recordOutboxOps(
              diffEntityFieldsToOperations({
                entityType: 'species',
                previous: existing,
                next: clean,
                deviceId,
                nextCounter: allocateNextLogicalCounter,
                timestamp: ts,
                recordRev: rev,
              })
            );
            await reloadFromAdapter();
            notify(
              renamed
                ? `Renamed ${existing.name} to ${clean.name} across all barn records.`
                : `${clean.name} schedule saved.`
            );
          } else {
            const currentList = currentSnapshot?.speciesProfiles ?? [];
            const newId = profile.id || `species-${generateUuid()}`;
            const rev = nextEntityRev(newId, profile._rev);
            const cleanNew: SpeciesProfile = {
              ...profile,
              id: newId,
              sortOrder: currentList.length,
              name: profile.name.trim(),
              defaultAnimalPrefix: (profile.defaultAnimalPrefix || '').trim(),
              memoText: sanitizeSpeciesMemo(profile.memoText ?? ''),
              memoUpdatedAt: profile.memoUpdatedAt ?? '',
              breedOverrides: normalizeBreedScheduleOverrides(profile.breedOverrides),
              targetWeightCurve: normalizeTargetWeightCurve(profile.targetWeightCurve),
              _rev: rev,
              createdAt: profile.createdAt || ts,
              updatedAt: ts,
            };
            await adapterRef.current!.saveSpeciesProfile(cleanNew);
            await recordOutboxOps(
              diffEntityFieldsToOperations({
                entityType: 'species',
                previous: undefined,
                next: cleanNew,
                deviceId,
                nextCounter: allocateNextLogicalCounter,
                timestamp: ts,
                recordRev: rev,
              })
            );
            await reloadFromAdapter();
            notify(`${cleanNew.name} added to your barn.`);
          }
          return true;
        } catch (err) {
          reportPersistenceFailure(`save ${profile.name} species schedule`, err);
          return false;
        }
      });
    },
    [
      activeSpeciesName,
      deviceId,
      enqueueStoreMutation,
      nextEntityRev,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const updateSpeciesTargetWeightCurve = useCallback(
    async (speciesId: string, curve: TargetWeightPoint[]): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const existing = currentSnapshot?.speciesProfiles.find((sp) => sp.id === speciesId);
        if (!existing) return false;
        const ts = getAdjustedNowIsoUtc();
        const rev = nextEntityRev(existing.id, existing._rev);
        const cleanCurve = normalizeTargetWeightCurve(curve);
        const updated: SpeciesProfile = {
          ...existing,
          targetWeightCurve: cleanCurve,
          _rev: rev,
          updatedAt: ts,
        };
        try {
          await adapterRef.current!.saveSpeciesProfile(updated);
          await recordOutboxOps(
            diffEntityFieldsToOperations({
              entityType: 'species',
              previous: existing,
              next: updated,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: rev,
            })
          );
          await reloadFromAdapter();
          notify(
            cleanCurve.length > 0
              ? `Saved ${cleanCurve.length} target weight goal point${cleanCurve.length === 1 ? '' : 's'} for ${existing.name}.`
              : `Cleared target weight curve for ${existing.name}.`
          );
          return true;
        } catch (err) {
          reportPersistenceFailure(`update ${existing.name} target weight curve`, err);
          return false;
        }
      });
    },
    [
      deviceId,
      enqueueStoreMutation,
      nextEntityRev,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const saveSpeciesMemo = useCallback(
    async (speciesId: string, rawMemoText: unknown, options?: { silent?: boolean }) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        const existing = currentSnapshot.speciesProfiles.find((sp) => sp.id === speciesId);
        if (!existing) return;
        const cleanMemo = sanitizeSpeciesMemo(rawMemoText);
        if ((existing.memoText ?? '') === cleanMemo) return;
        const ts = getAdjustedNowIsoUtc();
        const rev = nextEntityRev(existing.id, existing._rev);
        const updated: SpeciesProfile = {
          ...existing,
          memoText: cleanMemo,
          memoUpdatedAt: ts,
          _rev: rev,
          updatedAt: ts,
        };
        try {
          await adapterRef.current!.saveSpeciesProfile(updated);
          await recordOutboxOps(
            diffEntityFieldsToOperations({
              entityType: 'species',
              previous: existing,
              next: updated,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: rev,
            })
          );
          await reloadFromAdapter();
          if (!options?.silent) {
            notify(`${existing.name} memo pad saved.`);
          }
        } catch (err) {
          reportPersistenceFailure(`save ${existing.name} memo pad`, err);
        }
      });
    },
    [enqueueStoreMutation, deviceId, nextEntityRev, recordOutboxOps, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const reorderSpeciesCardsInternal = useCallback(
    async (orderedIds: string[]) => {
      const currentSnapshot = snapshotRef.current;
      if (!currentSnapshot) return;
      try {
        const byId = new Map(currentSnapshot.speciesProfiles.map((sp) => [sp.id, sp]));
        const ordered: SpeciesProfile[] = [];
        const seen = new Set<string>();
        const ts = getAdjustedNowIsoUtc();

        for (const id of orderedIds) {
          const sp = byId.get(id);
          if (sp && !seen.has(id)) {
            seen.add(id);
            ordered.push({ ...sp, sortOrder: ordered.length, updatedAt: ts });
          }
        }
        for (const sp of currentSnapshot.speciesProfiles) {
          if (!seen.has(sp.id)) {
            ordered.push({ ...sp, sortOrder: ordered.length, updatedAt: ts });
          }
        }

        await adapterRef.current!.saveSpeciesProfilesBatch(ordered);
        await reloadFromAdapter();
      } catch (err) {
        reportPersistenceFailure('reorder species cards', err);
      }
    },
    [reloadFromAdapter, reportPersistenceFailure]
  );

  const reorderSpeciesCards = useCallback(
    async (orderedIds: string[]) => {
      return enqueueStoreMutation(() => reorderSpeciesCardsInternal(orderedIds));
    },
    [enqueueStoreMutation, reorderSpeciesCardsInternal]
  );

  const moveSpeciesCard = useCallback(
    async (speciesId: string, direction: 'up' | 'down' | 'top') => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        const ids = currentSnapshot.speciesProfiles.map((sp) => sp.id);
        const fromIdx = ids.indexOf(speciesId);
        if (fromIdx === -1) return;

        let toIdx = fromIdx;
        if (direction === 'top') toIdx = 0;
        else if (direction === 'up') toIdx = Math.max(0, fromIdx - 1);
        else if (direction === 'down') toIdx = Math.min(ids.length - 1, fromIdx + 1);

        if (toIdx === fromIdx) return;

        const nextIds = [...ids];
        const [moved] = nextIds.splice(fromIdx, 1);
        nextIds.splice(toIdx, 0, moved);
        await reorderSpeciesCardsInternal(nextIds);
      });
    },
    [enqueueStoreMutation, reorderSpeciesCardsInternal]
  );

  const reorderSpeciesHubBlocks = useCallback(
    async (speciesName: string, orderedBlockIds: SpeciesHubBlockId[]) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        const key = speciesName.trim().toLowerCase();
        const normalized = normalizeSpeciesHubBlockOrder(orderedBlockIds);
        const prevMap = currentSnapshot.settings.speciesHubBlockOrder || {};
        await updateSettingsInternal(
          {
            speciesHubBlockOrder: {
              ...prevMap,
              [key]: normalized,
            },
          },
          { silent: true }
        );
      });
    },
    [enqueueStoreMutation, updateSettingsInternal]
  );

  const moveSpeciesHubBlock = useCallback(
    async (
      speciesName: string,
      blockId: SpeciesHubBlockId,
      direction: 'up' | 'down' | 'top'
    ) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        const key = speciesName.trim().toLowerCase();
        const ids = normalizeSpeciesHubBlockOrder(
          currentSnapshot.settings.speciesHubBlockOrder?.[key]
        );
        const fromIdx = ids.indexOf(blockId);
        if (fromIdx === -1) return;

        let toIdx = fromIdx;
        if (direction === 'top') toIdx = 0;
        else if (direction === 'up') toIdx = Math.max(0, fromIdx - 1);
        else if (direction === 'down') toIdx = Math.min(ids.length - 1, fromIdx + 1);

        if (toIdx === fromIdx) return;

        const nextIds = [...ids];
        const [moved] = nextIds.splice(fromIdx, 1);
        nextIds.splice(toIdx, 0, moved);
        const prevMap = currentSnapshot.settings.speciesHubBlockOrder || {};
        await updateSettingsInternal(
          {
            speciesHubBlockOrder: {
              ...prevMap,
              [key]: normalizeSpeciesHubBlockOrder(nextIds),
            },
          },
          { silent: true }
        );
      });
    },
    [enqueueStoreMutation, updateSettingsInternal]
  );

  const deleteSpeciesProfile = useCallback(
    async (profile: SpeciesProfile) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        try {
          if (currentSnapshot) {
            const remainingRecords = countAllSpeciesRecords(currentSnapshot, profile.name);
            if (remainingRecords > 0) {
              notify(
                `Only empty species can be fully removed (${profile.name} still has ${remainingRecords} record${remainingRecords === 1 ? '' : 's'}).`
              );
              return;
            }
            if (currentSnapshot.speciesProfiles.length <= 1) {
              notify('At least one species must remain in your barn.');
              return;
            }
            await saveSafetyRollingBackup(currentSnapshot);
          }
          const ts = getAdjustedNowIsoUtc();
          await adapterRef.current!.deleteSpeciesProfile(profile.id);
          await recordOutboxOps([
            createOutboxOperation({
              entityType: 'species',
              entityUuid: profile.id,
              deviceId,
              logicalCounter: allocateNextLogicalCounter(),
              fieldName: '__delete__',
              newValue: true,
              timestamp: ts,
              recordRev: nextEntityRev(profile.id, profile._rev),
            }),
          ]);
          if (currentSnapshot && isSameSpecies(currentSnapshot.settings.pinnedLandingSpecies, profile.name)) {
            await updateSettingsInternal({ pinnedLandingSpecies: '' }, { silent: true });
          }
          await reloadFromAdapter();
          if (isSameSpecies(activeSpeciesName, profile.name)) {
            const fallbackName =
              currentSnapshot?.speciesProfiles.find((p) => p.id !== profile.id)?.name || 'Rabbit';
            setActiveSpeciesName(fallbackName);
            setRoute('home');
          }
          notify(`${profile.name} removed from configured species.`);
        } catch (err) {
          reportPersistenceFailure(`remove ${profile.name} species`, err);
        }
      });
    },
    [
      enqueueStoreMutation,
      activeSpeciesName,
      deviceId,
      nextEntityRev,
      recordOutboxOps,
      saveSafetyRollingBackup,
      updateSettingsInternal,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const exportTimestampedSpeciesBackup = useCallback(
    async (speciesName: string, reason: SpeciesBackupReason = 'manual') => {
      if (!snapshot) return;
      const filename = buildSpeciesZipBackupFileName(
        snapshot.settings.barnName,
        speciesName,
        reason
      );
      const hydrated = await hydrateSnapshotForExport(snapshot, speciesName);
      const archive = await buildCompleteBackupZipToOpfsTmpOffThread(hydrated, speciesName, {
        backupScope: 'species',
        backupReason: reason,
        targetSpecies: speciesName,
      });
      await downloadTempOpfsExport(filename, archive, 'application/zip');
      void recordBackupExport('zip', filename);
      notify(
        `Saved ${speciesName} backup archive: ${filename} (${archive.animalCount} animals, ${archive.photoCount} photos, Printable Barn Binder included)`
      );
    },
    [snapshot, hydrateSnapshotForExport, recordBackupExport, notify]
  );

  const saveAnimal = useCallback(
    async (
      draft: Omit<Animal, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string },
      linkParentTarget?: { childId: string; asSire: boolean },
      initialPhotos?: Array<OptimizedImagePayload & { caption?: string }>
    ): Promise<string | null> => {
      return enqueueStoreMutation(async () => {
        const latestSnapshot = snapshotRef.current ?? snapshot;
        const previous = draft.id
          ? latestSnapshot?.animals.find((a) => a.id === draft.id)
          : undefined;
        const hasExplicitRaw = typeof draft.genotypeRaw === 'string';
        const trimmedRaw = (draft.genotypeRaw || '').trim();
        const parsedGeno =
          hasExplicitRaw
            ? trimmedRaw
              ? draft.genotype &&
                draft.genotype.length > 0 &&
                formatGenotypeArray(draft.genotype) === trimmedRaw
                ? draft.genotype
                : parseGenotypeString(trimmedRaw, draft.species)
              : []
            : draft.genotype && draft.genotype.length > 0
            ? draft.genotype
            : [];
        const normalizedRaw = trimmedRaw || (hasExplicitRaw ? '' : formatGenotypeArray(parsedGeno));

        const carriers = reconcileCarrierTraitLists(
          draft.suspectedCarrierOf,
          draft.confirmedCarrierOf,
          draft.clearedCarrierOf
        );

        const resolvedIgnored = normalizeIgnoredConflicts(
          draft.ignoredConflicts ?? previous?.ignoredConflicts
        );

        const animalId = draft.id || generateUuid();
        const rev = nextEntityRev(animalId, previous?._rev);
        const adjustedTs = getAdjustedNowIsoUtc();

        const animal: Animal = {
          ...draft,
          id: animalId,
          tattoo: draft.tattoo.trim(),
          name: draft.name.trim(),
          archived: Boolean(draft.archived),
          needsAttention: Boolean(draft.needsAttention),
          ignoredConflicts: resolvedIgnored,
          genotype: parsedGeno,
          genotypeRaw: normalizedRaw,
          rufusLevel: normalizeRufusLevel(draft.rufusLevel),
          suspectedCarrierOf: carriers.suspectedCarrierOf,
          confirmedCarrierOf: carriers.confirmedCarrierOf,
          clearedCarrierOf: carriers.clearedCarrierOf,
          _rev: rev,
          createdAt: draft.createdAt || adjustedTs,
          updatedAt: adjustedTs,
        };

        try {
          await adapterRef.current!.saveAnimal(animal);
          await recordOutboxOps(
            diffEntityFieldsToOperations({
              entityType: 'animal',
              previous,
              next: animal,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: adjustedTs,
              recordRev: rev,
            })
          );

          if (initialPhotos && initialPhotos.length > 0) {
            const existingPhotos = (latestSnapshot?.animalPhotos ?? []).filter(
              (p) => p.animalId === animal.id
            );
            const hasPrimary = existingPhotos.some((p) => p.isPrimary);
            const newPhotoRecords: AnimalPhoto[] = initialPhotos.map((pay, idx) => ({
              id: generateUuid(),
              species: animal.species,
              animalId: animal.id,
              isPrimary: !hasPrimary && idx === 0,
              sortOrder: existingPhotos.length + idx,
              caption: (pay.caption || '').trim(),
              originalFileName: pay.originalFileName,
              mimeType: pay.mimeType,
              width: pay.width,
              height: pay.height,
              originalBytes: pay.originalBytes,
              storedBytes: pay.storedBytes,
              thumbnailDataUrl: pay.thumbnailDataUrl,
              dataUrl: pay.dataUrl,
              createdAt: adjustedTs,
              updatedAt: adjustedTs,
            }));
            await adapterRef.current!.saveAnimalPhotosBatch(newPhotoRecords);
            for (const rec of newPhotoRecords) {
              photoCacheRef.current.set(rec.id, rec.dataUrl);
            }
          }

          if (linkParentTarget && latestSnapshot) {
            const child = latestSnapshot.animals.find((a) => a.id === linkParentTarget.childId);
            const expectedSex = linkParentTarget.asSire ? 'Male' : 'Female';
            if (child && isSameSpecies(child.species, animal.species) && child.id !== animal.id) {
              if (animal.sex !== expectedSex) {
                logDiagnosticEvent({
                  level: 'warn',
                  category: 'storage',
                  message: `Prevented parent sex mismatch when linking "${animal.name}" (${animal.sex}) as ${
                    linkParentTarget.asSire ? 'Sire' : 'Dam'
                  } of "${child.name}"`,
                });
              } else {
                const childRev = nextEntityRev(child.id, child._rev);
                const updatedChild: Animal = {
                  ...child,
                  sireId: linkParentTarget.asSire ? animal.id : child.sireId,
                  damId: !linkParentTarget.asSire ? animal.id : child.damId,
                  _rev: childRev,
                  updatedAt: adjustedTs,
                };
                await adapterRef.current!.saveAnimal(updatedChild);
                await recordOutboxOps(
                  diffEntityFieldsToOperations({
                    entityType: 'animal',
                    previous: child,
                    next: updatedChild,
                    deviceId,
                    nextCounter: allocateNextLogicalCounter,
                    timestamp: adjustedTs,
                    recordRev: childRev,
                  })
                );
              }
            }
          }

          await reloadFromAdapter();
          notify(
            initialPhotos && initialPhotos.length > 0
              ? `${animal.name} saved with ${initialPhotos.length} optimized photo(s).`
              : `${animal.name} (${animal.tattoo || 'No ID'}) saved.`
          );
          return animal.id;
        } catch (err) {
          reportPersistenceFailure(`save ${animal.name}`, err);
          return null;
        }
      });
    },
    [
      snapshot,
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const ignoreAnimalConflicts = useCallback(
    async (animalId: string, kinds: AnimalConflictKind[]) => {
      if (kinds.length === 0) return;
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        const target = currentSnapshot.animals.find((a) => a.id === animalId);
        if (!target) return;
        const ts = getAdjustedNowIsoUtc();
        const rev = nextEntityRev(target.id, target._rev);
        const nextIgnored = normalizeIgnoredConflicts([
          ...(target.ignoredConflicts || []),
          ...kinds,
        ]);
        const summariesAfter = analyzeBarnAnimalConflicts(
          currentSnapshot.animals.map((a) =>
            a.id === animalId ? { ...a, ignoredConflicts: nextIgnored } : a
          )
        );
        const stillHasActive = Boolean(summariesAfter.get(animalId)?.hasActiveConflict);
        const updated: Animal = {
          ...target,
          ignoredConflicts: nextIgnored,
          needsAttention: stillHasActive ? target.needsAttention : false,
          _rev: rev,
          updatedAt: ts,
        };
        try {
          await adapterRef.current!.saveAnimal(updated);
          await recordOutboxOps(
            diffEntityFieldsToOperations({
              entityType: 'animal',
              previous: target,
              next: updated,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: rev,
            })
          );
          await reloadFromAdapter();
          notify(
            `Conflict alert ignored for ${target.name}. A soft warning remains visible until the underlying issue is resolved.`
          );
        } catch (err) {
          reportPersistenceFailure(`ignore conflict for ${target.name}`, err);
        }
      });
    },
    [enqueueStoreMutation, deviceId, nextEntityRev, recordOutboxOps, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const restoreAnimalConflictAlert = useCallback(
    async (animalId: string, kinds?: AnimalConflictKind[]) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        const target = currentSnapshot.animals.find((a) => a.id === animalId);
        if (!target) return;
        const ts = getAdjustedNowIsoUtc();
        const rev = nextEntityRev(target.id, target._rev);
        const currentIgnored = normalizeIgnoredConflicts(target.ignoredConflicts);
        const nextIgnored =
          kinds && kinds.length > 0
            ? currentIgnored.filter((k) => !kinds.includes(k))
            : [];
        const summariesAfter = analyzeBarnAnimalConflicts(
          currentSnapshot.animals.map((a) =>
            a.id === animalId ? { ...a, ignoredConflicts: nextIgnored } : a
          )
        );
        const hasActive = Boolean(summariesAfter.get(animalId)?.hasActiveConflict);
        const updated: Animal = {
          ...target,
          ignoredConflicts: nextIgnored,
          needsAttention: hasActive ? true : target.needsAttention,
          _rev: rev,
          updatedAt: ts,
        };
        try {
          await adapterRef.current!.saveAnimal(updated);
          await recordOutboxOps(
            diffEntityFieldsToOperations({
              entityType: 'animal',
              previous: target,
              next: updated,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: rev,
            })
          );
          await reloadFromAdapter();
          notify(`Conflict alert re-enabled for ${target.name}.`);
        } catch (err) {
          reportPersistenceFailure(`restore conflict alert for ${target.name}`, err);
        }
      });
    },
    [enqueueStoreMutation, deviceId, nextEntityRev, recordOutboxOps, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const archiveAnimals = useCallback(
    async (animalIds: string[], archived: boolean) => {
      if (animalIds.length === 0) return;
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        const idSet = new Set(animalIds);
        const ts = getAdjustedNowIsoUtc();
        const ops: SyncOperation[] = [];
        const updatedBatch: Animal[] = [];

        for (const animal of currentSnapshot.animals) {
          if (!idSet.has(animal.id)) continue;
          const rev = nextEntityRev(animal.id, animal._rev);
          const nextStatus =
            !archived &&
            (animal.status === 'Archived' ||
              animal.status === 'Deceased' ||
              animal.status === 'Sold' ||
              animal.status === 'Retired')
              ? 'Active'
              : archived && (animal.status === 'Active' || animal.status === 'Junior')
              ? 'Archived'
              : animal.status;
          const updated: Animal = {
            ...animal,
            archived,
            status: nextStatus,
            _rev: rev,
            updatedAt: ts,
          };
          updatedBatch.push(updated);
          ops.push(
            ...diffEntityFieldsToOperations({
              entityType: 'animal',
              previous: animal,
              next: updated,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: rev,
            })
          );
        }

        try {
          if (updatedBatch.length > 0) {
            await adapterRef.current!.saveAnimalsBatch(updatedBatch);
          }
          await recordOutboxOps(ops);
          const autoOffloadIds =
            archived && currentSnapshot.settings.autoOffloadRetiredToOpfs && isOpfsSupported()
              ? updatedBatch
                  .filter((a) => a.status === 'Sold' || a.status === 'Deceased')
                  .map((a) => a.id)
              : [];
          if (autoOffloadIds.length > 0 && offloadAnimalsRef.current) {
            const offloaded = await offloadAnimalsRef.current(autoOffloadIds);
            if (offloaded) return;
          }
          await reloadFromAdapter();
          notify(
            archived
              ? `Moved ${animalIds.length} animal${animalIds.length === 1 ? '' : 's'} to Archived (retained for pedigrees).`
              : `Restored ${animalIds.length} animal${animalIds.length === 1 ? '' : 's'} back to Active herd.`
          );
        } catch (err) {
          reportPersistenceFailure(archived ? 'archive animal(s)' : 'restore animal(s)', err);
        }
      });
    },
    [enqueueStoreMutation, deviceId, nextEntityRev, recordOutboxOps, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const deleteAnimalsBatch = useCallback(
    async (animalIds: string[]) => {
      if (animalIds.length === 0) return;
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        try {
          await saveSafetyRollingBackup(currentSnapshot);
          const idSet = new Set(animalIds);
          const ts = getAdjustedNowIsoUtc();
          const ops: SyncOperation[] = [];

          // Unlink offspring sire/dam references pointing to deleted animals in a single batch
          const unlinkedChildren: Animal[] = [];
          for (const a of currentSnapshot.animals) {
            if (idSet.has(a.id)) continue;
            const clearSire = a.sireId && idSet.has(a.sireId);
            const clearDam = a.damId && idSet.has(a.damId);
            if (clearSire || clearDam) {
              const childRev = nextEntityRev(a.id, a._rev);
              const nextChild: Animal = {
                ...a,
                sireId: clearSire ? '' : a.sireId,
                damId: clearDam ? '' : a.damId,
                _rev: childRev,
                updatedAt: ts,
              };
              unlinkedChildren.push(nextChild);
              ops.push(
                ...diffEntityFieldsToOperations({
                  entityType: 'animal',
                  previous: a,
                  next: nextChild,
                  deviceId,
                  nextCounter: allocateNextLogicalCounter,
                  timestamp: ts,
                  recordRev: childRev,
                })
              );
            }
          }
          if (unlinkedChildren.length > 0) {
            await adapterRef.current!.saveAnimalsBatch(unlinkedChildren);
          }

          await adapterRef.current!.deleteAnimalsBatch(Array.from(idSet));
          for (const photo of currentSnapshot.animalPhotos ?? []) {
            if (idSet.has(photo.animalId)) {
              photoCacheRef.current.delete(photo.id);
            }
          }
          for (const id of idSet) {
            const deletedAnimal = currentSnapshot.animals.find((a) => a.id === id);
            ops.push(
              createOutboxOperation({
                entityType: 'animal',
                entityUuid: id,
                deviceId,
                logicalCounter: allocateNextLogicalCounter(),
                fieldName: '__delete__',
                newValue: true,
                timestamp: ts,
                recordRev: nextEntityRev(id, deletedAnimal?._rev),
              })
            );
          }

          if (selectedAnimalId && idSet.has(selectedAnimalId)) setSelectedAnimalId(null);
          if (pedigreeAnimalId && idSet.has(pedigreeAnimalId)) setPedigreeAnimalId(null);
          await recordOutboxOps(ops);
          await reloadFromAdapter();
          notify(`Deleted ${idSet.size} selected animal${idSet.size === 1 ? '' : 's'}.`);
        } catch (err) {
          reportPersistenceFailure('delete selected animal(s)', err);
        }
      });
    },
    [
      enqueueStoreMutation,
      saveSafetyRollingBackup,
      selectedAnimalId,
      pedigreeAnimalId,
      deviceId,
      nextEntityRev,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  /**
   * Migrates one or more selected animals (or an entire species) via the pure `migrateAnimalsToSpecies`
   * engine, preserving linked family lines, photos, care logs, breedings, tasks, cages, and shows.
   */
  const migrateAnimalsSpecies = useCallback(
    async (
      animalIds: string[],
      targetSpeciesName: string,
      options?: SpeciesMigrationOptions
    ): Promise<SpeciesMigrationResult | null> => {
      if (!options?.migrateEntireSpecies && animalIds.length === 0) return null;
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return null;

        try {
          await saveSafetyRollingBackup(currentSnapshot);
          const result = migrateAnimalsToSpecies(
            currentSnapshot,
            animalIds,
            targetSpeciesName,
            options
          );
          await adapterRef.current!.replaceSnapshot(result.snapshot);
          const migrationOps = diffSnapshotsToSyncOperations({
            previous: currentSnapshot,
            next: result.snapshot,
            deviceId,
            nextCounter: allocateNextLogicalCounter,
            timestamp: getAdjustedNowIsoUtc(),
          });
          await recordOutboxOps(migrationOps);

          const prevSpeciesById = new Map(currentSnapshot.animals.map((a) => [a.id, a.species]));
          const movedSet = new Set(
            result.snapshot.animals
              .filter((a) => {
                const prevSpecies = prevSpeciesById.get(a.id);
                return prevSpecies !== undefined && !isSameSpecies(prevSpecies, a.species);
              })
              .map((a) => a.id)
          );
          if (selectedAnimalId && movedSet.has(selectedAnimalId)) setSelectedAnimalId(null);
          if (pedigreeAnimalId && movedSet.has(pedigreeAnimalId)) setPedigreeAnimalId(null);

          await reloadFromAdapter();
          notify(
            `Moved ${result.animalsMigrated} animal${result.animalsMigrated === 1 ? '' : 's'} to ${result.targetSpecies}.`
          );
          return result;
        } catch (err) {
          reportPersistenceFailure(`migrate stock to ${targetSpeciesName}`, err);
          return null;
        }
      });
    },
    [
      enqueueStoreMutation,
      saveSafetyRollingBackup,
      deviceId,
      recordOutboxOps,
      selectedAnimalId,
      pedigreeAnimalId,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const addOptimizedAnimalPhotos = useCallback(
    async (
      animal: Animal,
      payloads: Array<OptimizedImagePayload & { caption?: string }>
    ): Promise<number> => {
      if (payloads.length === 0) return 0;
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const ts = getAdjustedNowIsoUtc();
        const existingPhotos = (currentSnapshot?.animalPhotos ?? []).filter(
          (p) => p.animalId === animal.id
        );
        const hasPrimary = existingPhotos.some((p) => p.isPrimary);

        let origSum = 0;
        let storedSum = 0;

        const records: AnimalPhoto[] = payloads.map((pay, idx) => {
          origSum += pay.originalBytes;
          storedSum += pay.storedBytes;
          return {
            id: generateUuid(),
            species: animal.species,
            animalId: animal.id,
            isPrimary: !hasPrimary && idx === 0,
            sortOrder: existingPhotos.length + idx,
            caption: (pay.caption || '').trim(),
            originalFileName: pay.originalFileName,
            mimeType: pay.mimeType,
            width: pay.width,
            height: pay.height,
            originalBytes: pay.originalBytes,
            storedBytes: pay.storedBytes,
            thumbnailDataUrl: pay.thumbnailDataUrl,
            dataUrl: pay.dataUrl,
            _rev: 1,
            createdAt: ts,
            updatedAt: ts,
          };
        });

        try {
          await adapterRef.current!.saveAnimalPhotosBatch(records);
          for (const rec of records) {
            photoCacheRef.current.set(rec.id, rec.dataUrl);
          }
          // Metadata-only delta sync (binary blobs travel via .ZIP backups)
          await recordOutboxOps(
            records.map((rec) =>
              createOutboxOperation({
                entityType: 'photo',
                entityUuid: rec.id,
                deviceId,
                logicalCounter: allocateNextLogicalCounter(),
                fieldName: '__create__',
                newValue: stripPhotoBlobsForSync(rec),
                timestamp: ts,
                recordRev: rec._rev ?? 1,
              })
            )
          );
          await reloadFromAdapter();

          const totalAfter = existingPhotos.length + records.length;
          const pct = calculateSavingsPercent(origSum, storedSum);
          notify(
            pct > 0
              ? `Added ${records.length} photo${records.length === 1 ? '' : 's'} to ${
                  animal.name
                } (${formatByteSizePure(origSum)} → ${formatByteSizePure(storedSum)} · saved ${pct}%).`
              : `Added ${records.length} photo${records.length === 1 ? '' : 's'} to ${animal.name}.`
          );
          return totalAfter;
        } catch (err) {
          reportPersistenceFailure(`save photo(s) for ${animal.name}`, err);
          throw err;
        }
      });
    },
    [enqueueStoreMutation, deviceId, recordOutboxOps, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const setPrimaryAnimalPhoto = useCallback(
    async (animalId: string, photoId: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        const ts = getAdjustedNowIsoUtc();
        const targetPhotos = (currentSnapshot.animalPhotos ?? []).filter(
          (p) => p.animalId === animalId
        );
        if (targetPhotos.length === 0) return;

        const prevById = new Map(targetPhotos.map((p) => [p.id, p]));
        const updated = targetPhotos.map((p) => ({
          ...p,
          isPrimary: p.id === photoId,
          _rev: nextEntityRev(p.id, p._rev),
          updatedAt: ts,
        }));
        try {
          await adapterRef.current!.saveAnimalPhotosBatch(updated);
          const photoOps = updated.flatMap((nextPhoto) =>
            diffEntityFieldsToOperations({
              entityType: 'photo',
              previous: prevById.get(nextPhoto.id),
              next: nextPhoto,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              ignoreFields: ['dataUrl', 'thumbnailDataUrl'],
              timestamp: ts,
              recordRev: nextPhoto._rev,
            })
          );
          await recordOutboxOps(photoOps);
          await reloadFromAdapter();
          notify('Primary cover photo updated (available for pedigrees).');
        } catch (err) {
          reportPersistenceFailure('update primary cover photo', err);
        }
      });
    },
    [enqueueStoreMutation, deviceId, nextEntityRev, recordOutboxOps, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const updateAnimalPhotoCaption = useCallback(
    async (photoId: string, caption: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        const found = (currentSnapshot.animalPhotos ?? []).find((p) => p.id === photoId);
        if (!found) return;
        const ts = getAdjustedNowIsoUtc();
        const nextPhoto: AnimalPhoto = {
          ...found,
          caption: caption.trim(),
          _rev: nextEntityRev(found.id, found._rev),
          updatedAt: ts,
        };
        try {
          await adapterRef.current!.saveAnimalPhoto(nextPhoto);
          await recordOutboxOps(
            diffEntityFieldsToOperations({
              entityType: 'photo',
              previous: found,
              next: nextPhoto,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              ignoreFields: ['dataUrl', 'thumbnailDataUrl'],
              timestamp: ts,
              recordRev: nextPhoto._rev,
            })
          );
          await reloadFromAdapter();
        } catch (err) {
          reportPersistenceFailure('update photo caption', err);
        }
      });
    },
    [enqueueStoreMutation, deviceId, nextEntityRev, recordOutboxOps, reloadFromAdapter, reportPersistenceFailure]
  );

  const deleteAnimalPhoto = useCallback(
    async (photoId: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        const all = currentSnapshot.animalPhotos ?? [];
        const target = all.find((p) => p.id === photoId);
        const ts = getAdjustedNowIsoUtc();
        try {
          await adapterRef.current!.deleteAnimalPhoto(photoId);
          photoCacheRef.current.delete(photoId);
          const ops: SyncOperation[] = [
            createOutboxOperation({
              entityType: 'photo',
              entityUuid: photoId,
              deviceId,
              logicalCounter: allocateNextLogicalCounter(),
              fieldName: '__delete__',
              newValue: true,
              timestamp: ts,
              recordRev: nextEntityRev(photoId, target?._rev),
            }),
          ];

          if (target && target.isPrimary) {
            const siblings = all
              .filter((p) => p.animalId === target.animalId && p.id !== photoId)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            if (siblings.length > 0) {
              const promoted: AnimalPhoto = {
                ...siblings[0],
                isPrimary: true,
                _rev: nextEntityRev(siblings[0].id, siblings[0]._rev),
                updatedAt: ts,
              };
              await adapterRef.current!.saveAnimalPhoto(promoted);
              ops.push(
                ...diffEntityFieldsToOperations({
                  entityType: 'photo',
                  previous: siblings[0],
                  next: promoted,
                  deviceId,
                  nextCounter: allocateNextLogicalCounter,
                  ignoreFields: ['dataUrl', 'thumbnailDataUrl'],
                  timestamp: ts,
                  recordRev: promoted._rev,
                })
              );
            }
          }
          await recordOutboxOps(ops);
          await reloadFromAdapter();
          notify('Photo removed.');
        } catch (err) {
          reportPersistenceFailure('delete photo', err);
        }
      });
    },
    [
      enqueueStoreMutation,
      deviceId,
      nextEntityRev,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const deleteAnimal = useCallback(
    async (animal: Animal) => {
      await deleteAnimalsBatch([animal.id]);
    },
    [deleteAnimalsBatch]
  );

  const saveCage = useCallback(
    async (
      cageDraft: Omit<CageLocation, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
        const latestSnapshot = snapshotRef.current ?? snapshot;
        const ts = getAdjustedNowIsoUtc();
        const prev = cageDraft.id
          ? latestSnapshot?.cages.find((c) => c.id === cageDraft.id)
          : undefined;
        const cageId = cageDraft.id || generateUuid();
        const rev = nextEntityRev(cageId, prev?._rev);
        const cage: CageLocation = {
          ...cageDraft,
          id: cageId,
          label: cageDraft.label.trim(),
          _rev: rev,
          createdAt: prev?.createdAt || ts,
          updatedAt: ts,
        };
        try {
          await adapterRef.current!.saveCage(cage);
          await recordOutboxOps(
            diffEntityFieldsToOperations({
              entityType: 'cage',
              previous: prev,
              next: cage,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: rev,
            })
          );
          await reloadFromAdapter();
          notify(`Location ${cage.label} saved.`);
          return true;
        } catch (err) {
          reportPersistenceFailure(`save location ${cage.label}`, err);
          return false;
        }
      });
    },
    [
      snapshot,
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const deleteCage = useCallback(
    async (id: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const target = currentSnapshot?.cages.find((c) => c.id === id);
        const ts = getAdjustedNowIsoUtc();
        try {
          await adapterRef.current!.deleteCage(id);
          await recordOutboxOps([
            createOutboxOperation({
              entityType: 'cage',
              entityUuid: id,
              deviceId,
              logicalCounter: allocateNextLogicalCounter(),
              fieldName: '__delete__',
              newValue: true,
              timestamp: ts,
              recordRev: nextEntityRev(id, target?._rev),
            }),
          ]);
          await reloadFromAdapter();
          notify('Cage/location removed.');
        } catch (err) {
          reportPersistenceFailure('delete cage location', err);
        }
      });
    },
    [enqueueStoreMutation, deviceId, nextEntityRev, recordOutboxOps, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const assignAnimalToCage = useCallback(
    async (animalId: string, nextCageLabel: string): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current ?? snapshot;
        const target = currentSnapshot?.animals.find((a) => a.id === animalId);
        if (!target || target.offloadedArchiveKey) return false;
        const cleanLabel = nextCageLabel.trim();
        if (target.cageLocation.trim() === cleanLabel) return true;
        const ts = getAdjustedNowIsoUtc();
        const rev = nextEntityRev(target.id, target._rev);
        const updated: Animal = {
          ...target,
          cageLocation: cleanLabel,
          _rev: rev,
          updatedAt: ts,
        };
        try {
          await adapterRef.current!.saveAnimal(updated);
          await recordOutboxOps(
            diffEntityFieldsToOperations({
              entityType: 'animal',
              previous: target,
              next: updated,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: rev,
            })
          );
          await reloadFromAdapter();
          notify(
            cleanLabel
              ? `Assigned ${target.name} to ${cleanLabel}.`
              : `Removed ${target.name} from cage assignment.`
          );
          return true;
        } catch (err) {
          reportPersistenceFailure(`assign ${target.name} to cage`, err);
          return false;
        }
      });
    },
    [
      snapshot,
      enqueueStoreMutation,
      deviceId,
      nextEntityRev,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  /**
   * Logs a new breeding or updates an existing breeding, and automatically runs the
   * Master Task List engine to cascade species-appropriate barn tasks on creation.
   */
  const logBreedingWithCascade = useCallback(
    async (params: {
      sire?: Animal;
      quickSireName?: string;
      dam?: Animal;
      quickDamName?: string;
      bredDateIso: string;
      status: BreedingRecord['status'];
      serviceFeeCents?: number;
      serviceFeeDirection?: ServiceFeeDirection;
      notes: string;
      autoScheduleChores: boolean;
    }): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
      const currentSnapshot = snapshotRef.current ?? snapshot;
      if (!currentSnapshot) return false;
      const targetSpeciesName =
        params.dam?.species || params.sire?.species || activeSpeciesName;
      const sp = resolveSpeciesProfile(targetSpeciesName, currentSnapshot.speciesProfiles);
      const ts = getAdjustedNowIsoUtc();

      const buildQuickParent = (rawName: string, sex: 'Male' | 'Female'): Animal => ({
        id: generateUuid(),
        tattoo: '',
        name: rawName.trim(),
        species: sp.name,
        breed: '',
        variety: '',
        sex,
        status: 'Active',
        archived: false,
        needsAttention: true,
        birthDateIso: '',
        weightGrams: 0,
        genotype: [],
        genotypeRaw: '',
        registrationNumber: '',
        grandChampionNumber: '',
        legsCount: 0,
        cageLocation: '',
        breederName: '',
        ownerName: '',
        sireId: '',
        damId: '',
        notes: 'Quick-added during breeding entry — review and complete record details.',
        _rev: 1,
        createdAt: ts,
        updatedAt: ts,
      });

      const newlyCreatedParents: Animal[] = [];
      let resolvedSire = params.sire;
      if (!resolvedSire && params.quickSireName?.trim()) {
        resolvedSire = buildQuickParent(params.quickSireName, 'Male');
        newlyCreatedParents.push(resolvedSire);
      }
      let resolvedDam = params.dam;
      if (!resolvedDam && params.quickDamName?.trim()) {
        resolvedDam = buildQuickParent(params.quickDamName, 'Female');
        newlyCreatedParents.push(resolvedDam);
      }

      if (!resolvedSire || !resolvedDam) return false;

      const herdMap = buildSpeciesHerdMap(
        [...currentSnapshot.animals, ...newlyCreatedParents],
        sp.name
      );
      const coi = calculatePairingCoi(resolvedSire.id, resolvedDam.id, herdMap).coiPercent;
      const { profile: effectiveSp } = resolveEffectiveSpeciesProfileForBreeding(
        sp,
        resolvedDam,
        resolvedSire
      );

      const breeding: BreedingRecord = {
        id: generateUuid(),
        species: sp.name,
        sireId: resolvedSire.id,
        damId: resolvedDam.id,
        sireName: resolvedSire.name,
        damName: resolvedDam.name,
        bredDateIso: params.bredDateIso,
        expectedDueDateIso: addDaysIso(params.bredDateIso, effectiveSp.gestationDays),
        actualBirthDateIso: '',
        projectedCoiPercent: Math.round(coi * 100) / 100,
        liveCount: 0,
        stillbornCount: 0,
        fosteredCount: 0,
        weanedCount: 0,
        offspringCreated: false,
        status: params.status,
        serviceFeeCents: Math.max(0, Math.round(Number(params.serviceFeeCents) || 0)),
        serviceFeeDirection: normalizeServiceFeeDirection(params.serviceFeeDirection),
        notes: params.notes.trim(),
        _rev: 1,
        createdAt: ts,
        updatedAt: ts,
      };

      try {
        const ops: SyncOperation[] = [];
        if (newlyCreatedParents.length > 0) {
          await adapterRef.current!.saveAnimalsBatch(newlyCreatedParents);
          for (const created of newlyCreatedParents) {
            ops.push(
              ...diffEntityFieldsToOperations({
                entityType: 'animal',
                previous: undefined,
                next: created,
                deviceId,
                nextCounter: allocateNextLogicalCounter,
                timestamp: ts,
                recordRev: 1,
              })
            );
          }
        }

        await adapterRef.current!.saveBreeding(breeding);
        ops.push(
          ...diffEntityFieldsToOperations({
            entityType: 'breeding',
            previous: undefined,
            next: breeding,
            deviceId,
            nextCounter: allocateNextLogicalCounter,
            timestamp: ts,
            recordRev: 1,
          })
        );

        let cascaded: BarnTask[] = [];
        let taskCount = 0;
        if (params.autoScheduleChores) {
          cascaded = generateCascadedTasksForBreeding(breeding, effectiveSp).map((t) => ({
            ...t,
            _rev: 1,
          }));
          taskCount = cascaded.length;
          await adapterRef.current!.saveTasksBatch(cascaded);
          for (const t of cascaded) {
            ops.push(
              ...diffEntityFieldsToOperations({
                entityType: 'task',
                previous: undefined,
                next: t,
                deviceId,
                nextCounter: allocateNextLogicalCounter,
                timestamp: ts,
                recordRev: 1,
              })
            );
          }
        }

        await recordOutboxOps(ops);
        await reloadFromAdapter();

        let calendarResultMsg = '';
        const calConfig = normalizeCalendarSyncSettings(currentSnapshot.settings.calendarSync);
        if (calConfig.autoAddNewTasks && calConfig.includeBreedingTasks && cascaded.length > 0) {
          const dated = cascaded.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.dueDateIso || ''));
          if (dated.length > 0) {
            const isOnline = getEffectiveOnlineStatus();
            if (calConfig.deliveryMode === 'google_calendar' && isOnline) {
              setPendingCalendarSync({
                tasks: dated,
                filenameHint: `${resolvedDam.name}-breeding-chores`,
              });
              calendarResultMsg = ` & queued ${dated.length} event(s) for Google Calendar.`;
            } else {
              const appBaseUrl =
                typeof window !== 'undefined'
                  ? `${window.location.origin}${window.location.pathname}`
                  : '';
              const ics = buildIcsCalendarForTasks(
                dated,
                calConfig,
                currentSnapshot.settings.barnName,
                `${resolvedDam.name}-breeding-chores`,
                {
                  animals: [...currentSnapshot.animals, ...newlyCreatedParents],
                  breedings: [...currentSnapshot.breedings, breeding],
                  speciesProfiles: currentSnapshot.speciesProfiles,
                  appBaseUrl,
                }
              );
              if (ics) {
                await downloadTextFile(ics.filename, ics.icsContent, 'text/calendar');
                calendarResultMsg =
                  calConfig.deliveryMode === 'google_calendar' && !isOnline
                    ? ` & downloaded offline .ICS fallback (${ics.eventCount} event(s)).`
                    : ` & exported ${ics.eventCount} calendar event(s) (.ICS).`;
              }
            }
          }
        }

        const quickAddNote =
          newlyCreatedParents.length > 0
            ? ` Added ${newlyCreatedParents.map((p) => p.name).join(' & ')} (Needs Attention).`
            : '';

        notify(
          (taskCount > 0
            ? calendarResultMsg
              ? `Logged ${resolvedSire.name} × ${resolvedDam.name}, cascaded ${taskCount} chores${calendarResultMsg}`
              : `Logged ${resolvedSire.name} × ${resolvedDam.name} and cascaded ${taskCount} barn chores.`
            : `Logged pairing ${resolvedSire.name} × ${resolvedDam.name}.`) + quickAddNote
        );
        return true;
      } catch (err) {
        reportPersistenceFailure('save breeding record', err);
        return false;
      }
      });
    },
    [
      snapshot,
      activeSpeciesName,
      deviceId,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const updateBreedingOutcome = useCallback(
    async (
      existing: BreedingRecord,
      patch: {
        status: BreedingRecord['status'];
        actualBirthDateIso: string;
        liveCount: number;
        stillbornCount: number;
        fosteredCount: number;
        weanedCount: number;
        serviceFeeCents?: number;
        serviceFeeDirection?: ServiceFeeDirection;
        ultrasoundDateIso?: string;
        ultrasoundResult?: UltrasoundResult;
        ultrasoundFetalCount?: number;
        ultrasoundProjectedDueIso?: string;
        litterWeightMilestones?: LitterWeightMilestone[];
        notes: string;
        registerJuniorCount: number;
        offspringDrafts?: Array<Pick<LitterOffspringDraft, 'name' | 'tattoo' | 'sex'>>;
        shiftPostBirthTasksToActualDate?: boolean;
      }
    ): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
      const currentSnapshot = snapshotRef.current ?? snapshot;
      if (!currentSnapshot) return false;
      const ts = getAdjustedNowIsoUtc();
      const sp = resolveSpeciesProfile(existing.species, currentSnapshot.speciesProfiles);
      const sire = currentSnapshot.animals.find((a) => a.id === existing.sireId);
      const dam = currentSnapshot.animals.find((a) => a.id === existing.damId);
      const { profile: effectiveSp } = resolveEffectiveSpeciesProfileForBreeding(sp, dam, sire);
      const ops: SyncOperation[] = [];

      try {
        let createdAny = existing.offspringCreated;
        const requestedDrafts = patch.offspringDrafts;
        const effectiveCount = requestedDrafts
          ? Math.min(16, requestedDrafts.length)
          : Math.min(16, Math.max(0, patch.registerJuniorCount));
        if (effectiveCount > 0) {
          const createdJuniors: Animal[] = [];
          for (let i = 1; i <= effectiveCount; i++) {
            const draftItem = requestedDrafts?.[i - 1];
            const fallbackTattoo = `${(dam?.tattoo || sp.name.slice(0, 3).toUpperCase()).slice(0, 6)}-K${i}`;
            const fallbackName = applyAnimalNamePrefix(
              `${existing.damName} ${sp.offspringLabel} #${i}`,
              sp.defaultAnimalPrefix
            );
            const resolvedName =
              draftItem?.name?.trim() || fallbackName;
            const resolvedTattoo =
              draftItem !== undefined ? draftItem.tattoo.trim() : fallbackTattoo;
            const resolvedSex =
              draftItem?.sex || (i % 2 === 0 ? 'Male' : 'Female');

            const jr: Animal = {
              id: generateUuid(),
              tattoo: resolvedTattoo,
              name: resolvedName,
              species: sp.name,
              breed: dam?.breed || sire?.breed || '',
              variety: dam?.variety || sire?.variety || '',
              sex: resolvedSex,
              status: 'Junior',
              archived: false,
              birthDateIso: patch.actualBirthDateIso || existing.expectedDueDateIso,
              weightGrams: 0,
              genotype: [],
              genotypeRaw: '',
              registrationNumber: '',
              grandChampionNumber: '',
              legsCount: 0,
              cageLocation: dam?.cageLocation || '',
              breederName: currentSnapshot.settings.breederName || dam?.breederName || '',
              ownerName: currentSnapshot.settings.barnName || '',
              ownershipType: 'Owned',
              sireId: existing.sireId,
              damId: existing.damId,
              notes: `Auto-registered from ${existing.sireName} × ${existing.damName} litter.`,
              _rev: 1,
              createdAt: ts,
              updatedAt: ts,
            };
            createdJuniors.push(jr);
            ops.push(
              ...diffEntityFieldsToOperations({
                entityType: 'animal',
                previous: undefined,
                next: jr,
                deviceId,
                nextCounter: allocateNextLogicalCounter,
                timestamp: ts,
                recordRev: 1,
              })
            );
          }
          await adapterRef.current!.saveAnimalsBatch(createdJuniors);
          createdAny = true;
        }

        const breedingRev = nextEntityRev(existing.id, existing._rev);
        const updated: BreedingRecord = {
          ...existing,
          status: patch.status,
          actualBirthDateIso: patch.actualBirthDateIso,
          liveCount: patch.liveCount,
          stillbornCount: patch.stillbornCount,
          fosteredCount: patch.fosteredCount,
          weanedCount: patch.weanedCount,
          offspringCreated: createdAny,
          serviceFeeCents:
            patch.serviceFeeCents !== undefined
              ? Math.max(0, Math.round(Number(patch.serviceFeeCents) || 0))
              : existing.serviceFeeCents ?? 0,
          serviceFeeDirection:
            patch.serviceFeeDirection !== undefined
              ? normalizeServiceFeeDirection(patch.serviceFeeDirection)
              : normalizeServiceFeeDirection(existing.serviceFeeDirection),
          ultrasoundDateIso:
            patch.ultrasoundDateIso !== undefined
              ? patch.ultrasoundDateIso
              : existing.ultrasoundDateIso || '',
          ultrasoundResult:
            patch.ultrasoundResult !== undefined
              ? normalizeUltrasoundResult(patch.ultrasoundResult)
              : normalizeUltrasoundResult(existing.ultrasoundResult),
          ultrasoundFetalCount:
            patch.ultrasoundFetalCount !== undefined
              ? Math.max(0, Math.round(Number(patch.ultrasoundFetalCount) || 0))
              : existing.ultrasoundFetalCount ?? 0,
          ultrasoundProjectedDueIso:
            patch.ultrasoundProjectedDueIso !== undefined
              ? patch.ultrasoundProjectedDueIso
              : existing.ultrasoundProjectedDueIso || '',
          litterWeightMilestones:
            patch.litterWeightMilestones !== undefined
              ? normalizeLitterWeightMilestones(patch.litterWeightMilestones)
              : normalizeLitterWeightMilestones(existing.litterWeightMilestones),
          notes: patch.notes,
          _rev: breedingRev,
          updatedAt: ts,
        };

        await adapterRef.current!.saveBreeding(updated);
        ops.push(
          ...diffEntityFieldsToOperations({
            entityType: 'breeding',
            previous: existing,
            next: updated,
            deviceId,
            nextCounter: allocateNextLogicalCounter,
            timestamp: ts,
            recordRev: breedingRev,
          })
        );

        let clearedTaskCount = 0;
        let shiftedTaskCount = 0;

        if (patch.status === 'Missed') {
          const pendingCleanup = getPendingBreedingCleanupTasks(
            currentSnapshot.tasks,
            existing.id,
            effectiveSp
          );
          if (pendingCleanup.length > 0) {
            await adapterRef.current!.deleteTasksBatch(pendingCleanup.map((t) => t.id));
            clearedTaskCount = pendingCleanup.length;
            for (const ct of pendingCleanup) {
              ops.push(
                createOutboxOperation({
                  entityType: 'task',
                  entityUuid: ct.id,
                  deviceId,
                  logicalCounter: allocateNextLogicalCounter(),
                  fieldName: '__delete__',
                  newValue: true,
                  timestamp: ts,
                  recordRev: nextEntityRev(ct.id, ct._rev),
                })
              );
            }
          }
        } else if (
          patch.shiftPostBirthTasksToActualDate &&
          (patch.status === 'Born' || patch.status === 'Weaned') &&
          patch.actualBirthDateIso
        ) {
          const prevTaskById = new Map(currentSnapshot.tasks.map((t) => [t.id, t]));
          const { updatedTasks } = recalculatePostBirthTasksForBreeding(
            currentSnapshot.tasks,
            updated,
            effectiveSp,
            ts,
            patch.actualBirthDateIso
          );
          if (updatedTasks.length > 0) {
            const revAligned = updatedTasks.map((nextTask) => {
              const prevTask = prevTaskById.get(nextTask.id);
              const rev = nextEntityRev(nextTask.id, prevTask?._rev);
              return { ...nextTask, _rev: rev };
            });
            await adapterRef.current!.saveTasksBatch(revAligned);
            shiftedTaskCount = revAligned.length;
            for (const nextTask of revAligned) {
              const prevTask = prevTaskById.get(nextTask.id);
              ops.push(
                ...diffEntityFieldsToOperations({
                  entityType: 'task',
                  previous: prevTask,
                  next: nextTask,
                  deviceId,
                  nextCounter: allocateNextLogicalCounter,
                  timestamp: ts,
                  recordRev: nextTask._rev,
                })
              );
            }
          }
        }

        await recordOutboxOps(ops);
        await reloadFromAdapter();
        const extraNotes: string[] = [];
        if (clearedTaskCount > 0) {
          extraNotes.push(`cleared ${clearedTaskCount} pending barn chore${clearedTaskCount === 1 ? '' : 's'}`);
        }
        if (shiftedTaskCount > 0) {
          extraNotes.push(`shifted ${shiftedTaskCount} post-birth chore${shiftedTaskCount === 1 ? '' : 's'} to ${patch.actualBirthDateIso}`);
        }
        const baseMsg =
          effectiveCount > 0
            ? `Litter updated & ${effectiveCount} ${sp.offspringLabel.toLowerCase()} records created`
            : 'Litter outcome saved';
        notify(
          extraNotes.length > 0 ? `${baseMsg} (${extraNotes.join('; ')}).` : `${baseMsg}.`
        );
        return true;
      } catch (err) {
        reportPersistenceFailure('save litter outcome', err);
        return false;
      }
      });
    },
    [
      snapshot,
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const recalculateBreedingPostBirthTasks = useCallback(
    async (breedingId: string): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current ?? snapshot;
        if (!currentSnapshot) return false;
        const breeding = currentSnapshot.breedings.find((b) => b.id === breedingId);
        if (!breeding || !breeding.actualBirthDateIso || breeding.status === 'Missed') {
          notify('Record an actual birth date before recalculating post-birth chores.');
          return false;
        }
        const ts = getAdjustedNowIsoUtc();
        const sp = resolveSpeciesProfile(breeding.species, currentSnapshot.speciesProfiles);
        const sire = currentSnapshot.animals.find((a) => a.id === breeding.sireId);
        const dam = currentSnapshot.animals.find((a) => a.id === breeding.damId);
        const { profile: effectiveSp } = resolveEffectiveSpeciesProfileForBreeding(sp, dam, sire);

        const prevTaskById = new Map(currentSnapshot.tasks.map((t) => [t.id, t]));
        const { updatedTasks } = recalculatePostBirthTasksForBreeding(
          currentSnapshot.tasks,
          breeding,
          effectiveSp,
          ts
        );
        if (updatedTasks.length === 0) {
          notify('Post-birth chores already match the actual birth date.');
          return true;
        }

        try {
          const revAligned = updatedTasks.map((nextTask) => {
            const prevTask = prevTaskById.get(nextTask.id);
            const rev = nextEntityRev(nextTask.id, prevTask?._rev);
            return { ...nextTask, _rev: rev };
          });
          await adapterRef.current!.saveTasksBatch(revAligned);
          const ops: SyncOperation[] = [];
          for (const nextTask of revAligned) {
            const prevTask = prevTaskById.get(nextTask.id);
            ops.push(
              ...diffEntityFieldsToOperations({
                entityType: 'task',
                previous: prevTask,
                next: nextTask,
                deviceId,
                nextCounter: allocateNextLogicalCounter,
                timestamp: ts,
                recordRev: nextTask._rev,
              })
            );
          }
          await recordOutboxOps(ops);
          await reloadFromAdapter();
          notify(
            `Shifted ${revAligned.length} post-birth chore${
              revAligned.length === 1 ? '' : 's'
            } to ${breeding.actualBirthDateIso}.`
          );
          return true;
        } catch (err) {
          reportPersistenceFailure('recalculate post-birth chores', err);
          return false;
        }
      });
    },
    [
      snapshot,
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const completeBreedingTaskWithOutcome = useCallback(
    async (
      task: BarnTask,
      outcome: BreedingTaskCheckoffAction
    ): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current ?? snapshot;
        if (!currentSnapshot) return false;
        const ts = getAdjustedNowIsoUtc();
        const ops: SyncOperation[] = [];

        try {
          const taskRev = nextEntityRev(task.id, task._rev);
          const completedTask: BarnTask = {
            ...task,
            completed: true,
            _rev: taskRev,
            updatedAt: ts,
          };
          await adapterRef.current!.saveTask(completedTask);
          ops.push(
            ...diffEntityFieldsToOperations({
              entityType: 'task',
              previous: task,
              next: completedTask,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: taskRev,
            })
          );

          const breeding = task.linkedBreedingId
            ? currentSnapshot.breedings.find((b) => b.id === task.linkedBreedingId)
            : undefined;

          if (!breeding) {
            await recordOutboxOps(ops);
            await reloadFromAdapter();
            notify('Chore marked complete.');
            return true;
          }

          const sp = resolveSpeciesProfile(breeding.species, currentSnapshot.speciesProfiles);
          const sire = currentSnapshot.animals.find((a) => a.id === breeding.sireId);
          const dam = currentSnapshot.animals.find((a) => a.id === breeding.damId);
          const { profile: effectiveSp } = resolveEffectiveSpeciesProfileForBreeding(sp, dam, sire);

          if (outcome.kind === 'palpated_positive') {
            const nextStatus: BreedingRecord['status'] =
              breeding.status === 'Planned' || breeding.status === 'Bred'
                ? 'Palpated Positive'
                : breeding.status;
            const breedingRev = nextEntityRev(breeding.id, breeding._rev);
            const updatedBreeding: BreedingRecord = {
              ...breeding,
              status: nextStatus,
              _rev: breedingRev,
              updatedAt: ts,
            };
            await adapterRef.current!.saveBreeding(updatedBreeding);
            ops.push(
              ...diffEntityFieldsToOperations({
                entityType: 'breeding',
                previous: breeding,
                next: updatedBreeding,
                deviceId,
                nextCounter: allocateNextLogicalCounter,
                timestamp: ts,
                recordRev: breedingRev,
              })
            );
            await recordOutboxOps(ops);
            await reloadFromAdapter();
            notify(`Palpation confirmed positive for ${breeding.damName} × ${breeding.sireName}.`);
            return true;
          }

          if (outcome.kind === 'missed') {
            const breedingRev = nextEntityRev(breeding.id, breeding._rev);
            const nextNotes = outcome.notes?.trim()
              ? [breeding.notes, outcome.notes.trim()].filter(Boolean).join(' · ')
              : breeding.notes;
            const updatedBreeding: BreedingRecord = {
              ...breeding,
              status: 'Missed',
              notes: nextNotes,
              _rev: breedingRev,
              updatedAt: ts,
            };
            await adapterRef.current!.saveBreeding(updatedBreeding);
            ops.push(
              ...diffEntityFieldsToOperations({
                entityType: 'breeding',
                previous: breeding,
                next: updatedBreeding,
                deviceId,
                nextCounter: allocateNextLogicalCounter,
                timestamp: ts,
                recordRev: breedingRev,
              })
            );

            const pendingCleanup = getPendingBreedingCleanupTasks(
              currentSnapshot.tasks,
              breeding.id,
              effectiveSp,
              [task.id]
            );
            if (pendingCleanup.length > 0) {
              await adapterRef.current!.deleteTasksBatch(pendingCleanup.map((t) => t.id));
              for (const ct of pendingCleanup) {
                ops.push(
                  createOutboxOperation({
                    entityType: 'task',
                    entityUuid: ct.id,
                    deviceId,
                    logicalCounter: allocateNextLogicalCounter(),
                    fieldName: '__delete__',
                    newValue: true,
                    timestamp: ts,
                    recordRev: nextEntityRev(ct.id, ct._rev),
                  })
                );
              }
            }
            await recordOutboxOps(ops);
            await reloadFromAdapter();
            notify(
              pendingCleanup.length > 0
                ? `Marked ${breeding.damName} × ${breeding.sireName} Missed and cleared ${pendingCleanup.length} pending chore${pendingCleanup.length === 1 ? '' : 's'}.`
                : `Marked ${breeding.damName} × ${breeding.sireName} Missed.`
            );
            return true;
          }

          // outcome.kind === 'birth_recorded'
          const breedingRev = nextEntityRev(breeding.id, breeding._rev);
          const nextNotes = outcome.notes?.trim()
            ? [breeding.notes, outcome.notes.trim()].filter(Boolean).join(' · ')
            : breeding.notes;
          const updatedBreeding: BreedingRecord = {
            ...breeding,
            status: breeding.status === 'Weaned' ? 'Weaned' : 'Born',
            actualBirthDateIso: outcome.actualBirthDateIso || breeding.actualBirthDateIso || breeding.expectedDueDateIso,
            liveCount: Math.max(0, Math.round(outcome.liveCount)),
            stillbornCount: Math.max(0, Math.round(outcome.stillbornCount)),
            fosteredCount:
              outcome.fosteredCount !== undefined
                ? Math.round(outcome.fosteredCount)
                : breeding.fosteredCount,
            notes: nextNotes,
            _rev: breedingRev,
            updatedAt: ts,
          };
          await adapterRef.current!.saveBreeding(updatedBreeding);
          ops.push(
            ...diffEntityFieldsToOperations({
              entityType: 'breeding',
              previous: breeding,
              next: updatedBreeding,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: breedingRev,
            })
          );

          let shiftedCount = 0;
          if (outcome.shiftPostBirthTasks !== false && updatedBreeding.actualBirthDateIso) {
            const prevTaskById = new Map(currentSnapshot.tasks.map((t) => [t.id, t]));
            const tasksWithoutCompleted = currentSnapshot.tasks.filter((t) => t.id !== task.id);
            const { updatedTasks } = recalculatePostBirthTasksForBreeding(
              tasksWithoutCompleted,
              updatedBreeding,
              effectiveSp,
              ts,
              updatedBreeding.actualBirthDateIso
            );
            if (updatedTasks.length > 0) {
              const revAligned = updatedTasks.map((nextTask) => {
                const prevTask = prevTaskById.get(nextTask.id);
                const rev = nextEntityRev(nextTask.id, prevTask?._rev);
                return { ...nextTask, _rev: rev };
              });
              await adapterRef.current!.saveTasksBatch(revAligned);
              shiftedCount = revAligned.length;
              for (const nextTask of revAligned) {
                const prevTask = prevTaskById.get(nextTask.id);
                ops.push(
                  ...diffEntityFieldsToOperations({
                    entityType: 'task',
                    previous: prevTask,
                    next: nextTask,
                    deviceId,
                    nextCounter: allocateNextLogicalCounter,
                    timestamp: ts,
                    recordRev: nextTask._rev,
                  })
                );
              }
            }
          }

          await recordOutboxOps(ops);
          await reloadFromAdapter();
          notify(
            `Logged ${updatedBreeding.liveCount} live / ${updatedBreeding.stillbornCount} stillborn for ${breeding.damName}` +
              (shiftedCount > 0
                ? ` & shifted ${shiftedCount} post-birth chore${shiftedCount === 1 ? '' : 's'}.`
                : '.')
          );
          return true;
        } catch (err) {
          reportPersistenceFailure('complete breeding outcome chore', err);
          return false;
        }
      });
    },
    [
      snapshot,
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const deleteBreeding = useCallback(
    async (id: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const target = currentSnapshot?.breedings.find((b) => b.id === id);
        const linkedTasks = (currentSnapshot?.tasks ?? []).filter(
          (t) => t.linkedBreedingId === id
        );
        const ts = getAdjustedNowIsoUtc();
        try {
          await adapterRef.current!.deleteBreeding(id);
          const ops: SyncOperation[] = [
            createOutboxOperation({
              entityType: 'breeding',
              entityUuid: id,
              deviceId,
              logicalCounter: allocateNextLogicalCounter(),
              fieldName: '__delete__',
              newValue: true,
              timestamp: ts,
              recordRev: nextEntityRev(id, target?._rev),
            }),
            ...linkedTasks.map((t) =>
              createOutboxOperation({
                entityType: 'task',
                entityUuid: t.id,
                deviceId,
                logicalCounter: allocateNextLogicalCounter(),
                fieldName: '__delete__',
                newValue: true,
                timestamp: ts,
                recordRev: nextEntityRev(t.id, t._rev),
              })
            ),
          ];
          await recordOutboxOps(ops);
          await reloadFromAdapter();
          notify('Breeding & linked chores removed.');
        } catch (err) {
          reportPersistenceFailure('delete breeding record', err);
        }
      });
    },
    [enqueueStoreMutation, deviceId, nextEntityRev, recordOutboxOps, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const saveTask = useCallback(
    async (
      taskDraft: Omit<BarnTask, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current ?? snapshot;
        const ts = getAdjustedNowIsoUtc();
        const prev = taskDraft.id
          ? currentSnapshot?.tasks.find((t) => t.id === taskDraft.id)
          : undefined;
        const taskId = taskDraft.id || generateUuid();
        const taskRev = nextEntityRev(taskId, prev?._rev);
        const task: BarnTask = {
          ...taskDraft,
          id: taskId,
          title: taskDraft.title.trim(),
          _rev: taskRev,
          createdAt: prev?.createdAt || ts,
          updatedAt: ts,
        };
        try {
          await adapterRef.current!.saveTask(task);
          await recordOutboxOps(
            diffEntityFieldsToOperations({
              entityType: 'task',
              previous: prev,
              next: task,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: taskRev,
            })
          );
          await reloadFromAdapter();

          let calendarNote = '';
          if (!prev && task.dueDateIso) {
            const calConfig = normalizeCalendarSyncSettings(
              currentSnapshot?.settings.calendarSync
            );
            if (calConfig.autoAddNewTasks && calConfig.includeManualTasks) {
              const isOnline = getEffectiveOnlineStatus();
              if (calConfig.deliveryMode === 'google_calendar' && isOnline) {
                setPendingCalendarSync({
                  tasks: [task],
                  filenameHint: formatSystemTaskTitle(
                    task,
                    calConfig,
                    currentSnapshot ?? undefined
                  ),
                });
                calendarNote = ' Ready to add to Google Calendar.';
              } else {
                const appBaseUrl =
                  typeof window !== 'undefined'
                    ? `${window.location.origin}${window.location.pathname}`
                    : '';
                const ics = buildIcsCalendarForTasks(
                  [task],
                  calConfig,
                  currentSnapshot?.settings.barnName,
                  undefined,
                  {
                    animals: currentSnapshot?.animals,
                    breedings: currentSnapshot?.breedings,
                    speciesProfiles: currentSnapshot?.speciesProfiles,
                    appBaseUrl,
                  }
                );
                if (ics) {
                  await downloadTextFile(ics.filename, ics.icsContent, 'text/calendar');
                  calendarNote =
                    calConfig.deliveryMode === 'google_calendar' && !isOnline
                      ? ' Offline — downloaded .ICS fallback.'
                      : ' Exported to calendar (.ICS).';
                }
              }
            }
          }

          notify(calendarNote ? `Barn chore saved.${calendarNote}` : 'Barn chore saved.');
          return true;
        } catch (err) {
          reportPersistenceFailure('save barn chore', err);
          return false;
        }
      });
    },
    [
      snapshot,
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const downloadOfflineIcsForTasks = useCallback(
    (
      tasksToExport: BarnTask[],
      filenameHint?: string,
      options?: { useExternalShare?: boolean; fallbackPrefix?: string }
    ) => {
      if (!snapshot) return 0;
      const calConfig = normalizeCalendarSyncSettings(snapshot.settings.calendarSync);
      const appBaseUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}`
          : '';
      const ics = buildIcsCalendarForTasks(
        tasksToExport,
        calConfig,
        snapshot.settings.barnName,
        filenameHint,
        {
          animals: snapshot.animals,
          breedings: snapshot.breedings,
          speciesProfiles: snapshot.speciesProfiles,
          appBaseUrl,
        }
      );
      if (!ics) {
        notify('Selected chore(s) have no due date to add to calendar.');
        return 0;
      }

      if (options?.useExternalShare) {
        void shareTextFileOrDownload({
          filename: ics.filename,
          content: ics.icsContent,
          mimeType: 'text/calendar',
          title: filenameHint || `${snapshot.settings.barnName} Barn Chores`,
          text: 'Import barn chore into your calendar app',
        })
          .then((outcome) => {
            if (outcome === 'cancelled') {
              notify('Calendar share cancelled.');
              return;
            }
            notify(
              outcome === 'shared'
                ? `Opened external calendar handoff for ${ics.eventCount} event${
                    ics.eventCount === 1 ? '' : 's'
                  }.`
                : `Saved ${ics.eventCount} event${
                    ics.eventCount === 1 ? '' : 's'
                  } (.ICS) — open file to add to Outlook, Apple, or system calendar.`
            );
          })
          .catch((err) => {
            reportPersistenceFailure('share .ICS calendar file', err);
          });
        return ics.eventCount;
      }

      void downloadTextFile(ics.filename, ics.icsContent, 'text/calendar').catch((err) => {
        reportPersistenceFailure('download .ICS calendar file', err);
      });
      const prefix = options?.fallbackPrefix ? `${options.fallbackPrefix} ` : '';
      notify(
        `${prefix}Downloaded ${ics.eventCount} calendar event${
          ics.eventCount === 1 ? '' : 's'
        } (.ICS)${calConfig.alarmEnabled ? ' with alarm' : ''}.`
      );
      return ics.eventCount;
    },
    [snapshot, notify, reportPersistenceFailure]
  );

  const exportTasksToCalendar = useCallback(
    (tasksToExport: BarnTask[], filenameHint?: string) => {
      if (!snapshot) return 0;
      const dated = tasksToExport.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.dueDateIso || ''));
      if (dated.length === 0) {
        notify('Selected chore(s) have no due date to add to calendar.');
        return 0;
      }

      const calConfig = normalizeCalendarSyncSettings(snapshot.settings.calendarSync);
      const isOnline = getEffectiveOnlineStatus();

      if (calConfig.deliveryMode === 'google_calendar') {
        if (!isOnline) {
          return downloadOfflineIcsForTasks(dated, filenameHint, {
            fallbackPrefix: 'Device is offline —',
          });
        }
        setPendingCalendarSync({ tasks: dated, filenameHint });
        return dated.length;
      }

      if (calConfig.deliveryMode === 'external_app_or_ics') {
        return downloadOfflineIcsForTasks(dated, filenameHint, {
          useExternalShare: true,
        });
      }

      return downloadOfflineIcsForTasks(dated, filenameHint);
    },
    [snapshot, downloadOfflineIcsForTasks, notify]
  );

  const connectGoogleCalendar = useCallback(async (): Promise<boolean> => {
    setGoogleSyncBusy(true);
    try {
      const { user, accessToken } = await signInGoogleCalendar();
      setGoogleAuthConnected(true);
      setGoogleUserEmail(user.email || user.displayName || 'Google Account');
      const cals = await listWritableGoogleCalendars(accessToken);
      setGoogleCalendars(cals);
      notify(`Connected Google Calendar${user.email ? ` (${user.email})` : ''}.`);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Calendar sign-in cancelled.';
      setErrorMessage(`Could not connect Google Calendar: ${msg}`);
      return false;
    } finally {
      setGoogleSyncBusy(false);
    }
  }, [notify]);

  const disconnectGoogleCalendar = useCallback(async () => {
    await signOutGoogleCalendar();
    setGoogleAuthConnected(false);
    setGoogleUserEmail(null);
    setGoogleCalendars([]);
    notify('Signed out of Google Calendar.');
  }, [notify]);

  const refreshGoogleCalendars = useCallback(async () => {
    const token = getGoogleCalendarAccessToken();
    if (!token) {
      setGoogleAuthConnected(false);
      return;
    }
    setGoogleSyncBusy(true);
    try {
      const cals = await listWritableGoogleCalendars(token);
      setGoogleCalendars(cals);
    } catch {
      setGoogleAuthConnected(false);
    } finally {
      setGoogleSyncBusy(false);
    }
  }, []);

  const confirmGoogleCalendarSync = useCallback(async () => {
    if (!snapshot || !pendingCalendarSync) return;
    const { tasks: queuedTasks, filenameHint } = pendingCalendarSync;
    const calConfig = normalizeCalendarSyncSettings(snapshot.settings.calendarSync);
    const token = getGoogleCalendarAccessToken();
    const isOnline = getEffectiveOnlineStatus();

    if (!isOnline || !token) {
      setPendingCalendarSync(null);
      downloadOfflineIcsForTasks(queuedTasks, filenameHint, {
        fallbackPrefix: !isOnline
          ? 'Device is offline —'
          : 'Google session unavailable —',
      });
      return;
    }

    setGoogleSyncBusy(true);
    try {
      const appBaseUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}`
          : '';
      const result = await pushTasksToGoogleCalendar({
        accessToken: token,
        calendarId: calConfig.googleCalendarId || 'primary',
        tasks: queuedTasks,
        config: calConfig,
        barnName: snapshot.settings.barnName,
        context: {
          animals: snapshot.animals,
          breedings: snapshot.breedings,
          speciesProfiles: snapshot.speciesProfiles,
          appBaseUrl,
        },
      });

      if (result.authExpired) {
        setGoogleAuthConnected(false);
      }

      if (result.createdCount > 0 && result.failedCount === 0) {
        setPendingCalendarSync(null);
        notify(
          `Added ${result.createdCount} event${
            result.createdCount === 1 ? '' : 's'
          } to ${calConfig.googleCalendarName || 'Google Calendar'}.`
        );
        return;
      }

      // Automatic fallback to offline .ICS if Google Calendar couldn't save all events
      setPendingCalendarSync(null);
      downloadOfflineIcsForTasks(queuedTasks, filenameHint, {
        fallbackPrefix:
          result.createdCount > 0
            ? `Added ${result.createdCount} to Google Calendar; saved offline .ICS fallback for remaining`
            : 'Could not reach Google Calendar —',
      });
    } catch {
      setPendingCalendarSync(null);
      downloadOfflineIcsForTasks(queuedTasks, filenameHint, {
        fallbackPrefix: 'Could not reach Google Calendar —',
      });
    } finally {
      setGoogleSyncBusy(false);
    }
  }, [snapshot, pendingCalendarSync, downloadOfflineIcsForTasks, notify]);

  const fallbackPendingCalendarSyncToIcs = useCallback(() => {
    if (!pendingCalendarSync) return;
    const { tasks: queuedTasks, filenameHint } = pendingCalendarSync;
    setPendingCalendarSync(null);
    downloadOfflineIcsForTasks(queuedTasks, filenameHint, {
      useExternalShare: true,
    });
  }, [pendingCalendarSync, downloadOfflineIcsForTasks]);

  const cancelPendingCalendarSync = useCallback(() => {
    setPendingCalendarSync(null);
  }, []);

  const copyTaskAppLink = useCallback(
    async (task: BarnTask) => {
      const appBaseUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}`
          : '';
      const link = buildTaskAppDeepLink(appBaseUrl, task);
      if (!link) return;
      const mode = await copyTextWithFallback(link);
      if (mode !== 'unsupported') {
        notify('Copied direct app task link to clipboard.');
        return;
      }
      notify(`App task link: ${link}`);
    },
    [notify]
  );

  const toggleTaskCompleted = useCallback(
    async (task: BarnTask): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
        const ts = getAdjustedNowIsoUtc();
        const rev = nextEntityRev(task.id, task._rev);
        const updated: BarnTask = {
          ...task,
          completed: !task.completed,
          _rev: rev,
          updatedAt: ts,
        };
        try {
          await adapterRef.current!.saveTask(updated);
          await recordOutboxOps(
            diffEntityFieldsToOperations({
              entityType: 'task',
              previous: task,
              next: updated,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: rev,
            })
          );
          await reloadFromAdapter();
          return true;
        } catch (err) {
          reportPersistenceFailure('update task completion', err);
          return false;
        }
      });
    },
    [
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      reportPersistenceFailure,
    ]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const target = currentSnapshot?.tasks.find((t) => t.id === id);
        const ts = getAdjustedNowIsoUtc();
        try {
          await adapterRef.current!.deleteTask(id);
          await recordOutboxOps([
            createOutboxOperation({
              entityType: 'task',
              entityUuid: id,
              deviceId,
              logicalCounter: allocateNextLogicalCounter(),
              fieldName: '__delete__',
              newValue: true,
              timestamp: ts,
              recordRev: nextEntityRev(id, target?._rev),
            }),
          ]);
          await reloadFromAdapter();
        } catch (err) {
          reportPersistenceFailure('delete task', err);
        }
      });
    },
    [enqueueStoreMutation, deviceId, nextEntityRev, recordOutboxOps, reloadFromAdapter, reportPersistenceFailure]
  );

  const addCareLog = useCallback(
    async (draft: Omit<CareLog, 'id' | 'createdAt' | 'updatedAt'>): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current ?? snapshot;
        if (!currentSnapshot) return false;
        const ts = getAdjustedNowIsoUtc();
        const log: CareLog = {
          ...draft,
          id: generateUuid(),
          _rev: 1,
          createdAt: ts,
          updatedAt: ts,
        };
        try {
          await adapterRef.current!.saveCareLog(log);
          const ops: SyncOperation[] = diffEntityFieldsToOperations({
            entityType: 'careLog',
            previous: undefined,
            next: log,
            deviceId,
            nextCounter: allocateNextLogicalCounter,
            timestamp: ts,
            recordRev: 1,
          });

          const animal = currentSnapshot.animals.find((a) => a.id === draft.animalId);
          if (animal && (draft.weightGrams > 0 || draft.showLegEarned)) {
            const animalRev = nextEntityRev(animal.id, animal._rev);
            const nextAnimal: Animal = {
              ...animal,
              weightGrams: draft.weightGrams > 0 ? draft.weightGrams : animal.weightGrams,
              legsCount: draft.showLegEarned ? animal.legsCount + 1 : animal.legsCount,
              _rev: animalRev,
              updatedAt: ts,
            };
            await adapterRef.current!.saveAnimal(nextAnimal);
            ops.push(
              ...diffEntityFieldsToOperations({
                entityType: 'animal',
                previous: animal,
                next: nextAnimal,
                deviceId,
                nextCounter: allocateNextLogicalCounter,
                timestamp: ts,
                recordRev: animalRev,
              })
            );
          }

          await recordOutboxOps(ops);
          await reloadFromAdapter();
          notify(`${draft.type} logged.`);
          return true;
        } catch (err) {
          reportPersistenceFailure(`save ${draft.type} entry`, err);
          return false;
        }
      });
    },
    [
      snapshot,
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const commitBarnBenchEntry = useCallback(
    async (
      draft: BarnBenchBatchEntryDraft
    ): Promise<{ ok: boolean; animalId: string; summary: string[] }> => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current ?? snapshot;
        if (!currentSnapshot) {
          return { ok: false, animalId: draft.animalId, summary: [] };
        }
        const animal = currentSnapshot.animals.find((a) => a.id === draft.animalId);
        if (!animal || animal.offloadedArchiveKey) {
          return { ok: false, animalId: draft.animalId, summary: [] };
        }

        const ts = getAdjustedNowIsoUtc();
        const plan = buildBarnBenchCommitPlan(animal, draft, ts);
        if (!plan.hasChanges) {
          return { ok: false, animalId: animal.id, summary: [] };
        }

        try {
          const ops: SyncOperation[] = [];
          const adapter = adapterRef.current!;

          if (plan.careLogs.length > 0) {
            if (adapter.saveCareLogsBatch) {
              await adapter.saveCareLogsBatch(plan.careLogs);
            } else {
              for (const log of plan.careLogs) {
                await adapter.saveCareLog(log);
              }
            }
            for (const log of plan.careLogs) {
              ops.push(
                ...diffEntityFieldsToOperations({
                  entityType: 'careLog',
                  previous: undefined,
                  next: log,
                  deviceId,
                  nextCounter: allocateNextLogicalCounter,
                  timestamp: ts,
                  recordRev: log._rev ?? 1,
                })
              );
            }
          }

          if (plan.updatedAnimal) {
            const animalRev = nextEntityRev(animal.id, animal._rev);
            const nextAnimal: Animal = {
              ...plan.updatedAnimal,
              _rev: animalRev,
            };
            await adapter.saveAnimal(nextAnimal);
            ops.push(
              ...diffEntityFieldsToOperations({
                entityType: 'animal',
                previous: animal,
                next: nextAnimal,
                deviceId,
                nextCounter: allocateNextLogicalCounter,
                timestamp: ts,
                recordRev: animalRev,
              })
            );
          }

          await recordOutboxOps(ops);
          await reloadFromAdapter();
          notify(`${animal.name}: ${plan.summaryParts.join(' · ')} saved.`);
          return { ok: true, animalId: animal.id, summary: plan.summaryParts };
        } catch (err) {
          reportPersistenceFailure(`save Barn Bench entry for ${animal.name}`, err);
          return { ok: false, animalId: animal.id, summary: [] };
        }
      });
    },
    [
      snapshot,
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const deleteCareLog = useCallback(
    async (id: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const target = currentSnapshot?.careLogs.find((l) => l.id === id);
        const ts = getAdjustedNowIsoUtc();
        try {
          await adapterRef.current!.deleteCareLog(id);
          await recordOutboxOps([
            createOutboxOperation({
              entityType: 'careLog',
              entityUuid: id,
              deviceId,
              logicalCounter: allocateNextLogicalCounter(),
              fieldName: '__delete__',
              newValue: true,
              timestamp: ts,
              recordRev: nextEntityRev(id, target?._rev),
            }),
          ]);
          await reloadFromAdapter();
        } catch (err) {
          reportPersistenceFailure('delete care log entry', err);
        }
      });
    },
    [enqueueStoreMutation, deviceId, nextEntityRev, recordOutboxOps, reloadFromAdapter, reportPersistenceFailure]
  );

  const saveShow = useCallback(
    async (
      draft: Omit<ShowEvent, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current ?? snapshot;
        const ts = getAdjustedNowIsoUtc();
        const prev = draft.id
          ? currentSnapshot?.shows.find((s) => s.id === draft.id)
          : undefined;
        const showId = draft.id || generateUuid();
        const rev = nextEntityRev(showId, prev?._rev);
        const cleanResults = normalizeShowResults(draft.results ?? [], { dropEmpty: true });
        const syncedEnteredIds = mergeEnteredAnimalIdsWithResults(
          draft.enteredAnimalIds ?? [],
          cleanResults
        );
        const show: ShowEvent = {
          ...draft,
          id: showId,
          name: draft.name.trim(),
          enteredAnimalIds: syncedEnteredIds,
          results: cleanResults.length > 0 ? cleanResults : undefined,
          _rev: rev,
          createdAt: prev?.createdAt || ts,
          updatedAt: ts,
        };
        try {
          await adapterRef.current!.saveShow(show);
          const ops: SyncOperation[] = diffEntityFieldsToOperations({
            entityType: 'show',
            previous: prev,
            next: show,
            deviceId,
            nextCounter: allocateNextLogicalCounter,
            timestamp: ts,
            recordRev: rev,
          });

          const legDeltas = computeShowLegDeltas(prev?.results, show.results);
          if (legDeltas.size > 0 && currentSnapshot) {
            for (const [animalId, delta] of legDeltas.entries()) {
              const animal = currentSnapshot.animals.find((a) => a.id === animalId);
              if (!animal) continue;
              const nextLegs = Math.max(0, (animal.legsCount || 0) + delta);
              if (nextLegs === animal.legsCount) continue;
              const animalRev = nextEntityRev(animal.id, animal._rev);
              const nextAnimal: Animal = {
                ...animal,
                legsCount: nextLegs,
                _rev: animalRev,
                updatedAt: ts,
              };
              await adapterRef.current!.saveAnimal(nextAnimal);
              ops.push(
                ...diffEntityFieldsToOperations({
                  entityType: 'animal',
                  previous: animal,
                  next: nextAnimal,
                  deviceId,
                  nextCounter: allocateNextLogicalCounter,
                  timestamp: ts,
                  recordRev: animalRev,
                })
              );
            }
          }

          await recordOutboxOps(ops);
          await reloadFromAdapter();
          notify(`Show "${show.name}" saved.`);
          return true;
        } catch (err) {
          reportPersistenceFailure(`save show "${show.name}"`, err);
          return false;
        }
      });
    },
    [
      snapshot,
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const deleteShow = useCallback(
    async (id: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const target = currentSnapshot?.shows.find((s) => s.id === id);
        const ts = getAdjustedNowIsoUtc();
        try {
          await adapterRef.current!.deleteShow(id);
          const ops: SyncOperation[] = [
            createOutboxOperation({
              entityType: 'show',
              entityUuid: id,
              deviceId,
              logicalCounter: allocateNextLogicalCounter(),
              fieldName: '__delete__',
              newValue: true,
              timestamp: ts,
              recordRev: nextEntityRev(id, target?._rev),
            }),
          ];

          const legDeltas = computeShowLegDeltas(target?.results, undefined);
          if (legDeltas.size > 0 && currentSnapshot) {
            for (const [animalId, delta] of legDeltas.entries()) {
              const animal = currentSnapshot.animals.find((a) => a.id === animalId);
              if (!animal) continue;
              const nextLegs = Math.max(0, (animal.legsCount || 0) + delta);
              if (nextLegs === animal.legsCount) continue;
              const animalRev = nextEntityRev(animal.id, animal._rev);
              const nextAnimal: Animal = {
                ...animal,
                legsCount: nextLegs,
                _rev: animalRev,
                updatedAt: ts,
              };
              await adapterRef.current!.saveAnimal(nextAnimal);
              ops.push(
                ...diffEntityFieldsToOperations({
                  entityType: 'animal',
                  previous: animal,
                  next: nextAnimal,
                  deviceId,
                  nextCounter: allocateNextLogicalCounter,
                  timestamp: ts,
                  recordRev: animalRev,
                })
              );
            }
          }

          await recordOutboxOps(ops);
          await reloadFromAdapter();
          notify('Show removed.');
        } catch (err) {
          reportPersistenceFailure('delete show', err);
        }
      });
    },
    [enqueueStoreMutation, deviceId, nextEntityRev, recordOutboxOps, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const saveFeedBatch = useCallback(
    async (
      batchDraft: Omit<FeedBatch, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
        const latestSnapshot = snapshotRef.current ?? snapshot;
        const ts = getAdjustedNowIsoUtc();
        const prev = batchDraft.id
          ? (latestSnapshot?.feedBatches ?? []).find((b) => b.id === batchDraft.id)
          : undefined;
        const batchId = batchDraft.id || generateUuid();
        const rev = nextEntityRev(batchId, prev?._rev);
        const batch: FeedBatch = {
          ...batchDraft,
          id: batchId,
          brand: batchDraft.brand.trim(),
          productName: batchDraft.productName.trim(),
          lotNumber: batchDraft.lotNumber.trim(),
          millCode: (batchDraft.millCode || '').trim(),
          manufactureDateIso: (batchDraft.manufactureDateIso || '').trim(),
          purchaseDateIso: batchDraft.purchaseDateIso || todayDateIso(),
          bagCount: Math.max(0, Number(batchDraft.bagCount) || 0),
          bagWeightValue: Math.max(0, Number(batchDraft.bagWeightValue) || 0),
          bagWeightUnit: (batchDraft.bagWeightUnit || '').trim() || 'lbs',
          totalQuantity: Math.max(0, Number(batchDraft.totalQuantity) || 0),
          remainingQuantity: Math.max(0, Number(batchDraft.remainingQuantity) || 0),
          lowStockThreshold: Math.max(0, Number(batchDraft.lowStockThreshold) || 0),
          supplierName: (batchDraft.supplierName || '').trim(),
          notes: (batchDraft.notes || '').trim(),
          _rev: rev,
          createdAt: prev?.createdAt || ts,
          updatedAt: ts,
        };
        try {
          await adapterRef.current!.saveFeedBatch(batch);
          await recordOutboxOps(
            diffEntityFieldsToOperations({
              entityType: 'feedBatch',
              previous: prev,
              next: batch,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: rev,
            })
          );
          await reloadFromAdapter();
          notify(
            batch.lotNumber
              ? `Saved feed batch ${batch.brand || batch.productName} (Lot ${batch.lotNumber}).`
              : `Saved feed batch ${batch.brand || batch.productName}.`
          );
          return true;
        } catch (err) {
          reportPersistenceFailure(`save feed batch ${batch.brand || batch.productName}`, err);
          return false;
        }
      });
    },
    [
      snapshot,
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const deleteFeedBatch = useCallback(
    async (id: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const target = (currentSnapshot?.feedBatches ?? []).find((b) => b.id === id);
        const linkedAllocations = (currentSnapshot?.feedAllocations ?? []).filter(
          (al) => al.feedBatchId === id
        );
        const ts = getAdjustedNowIsoUtc();
        try {
          await adapterRef.current!.deleteFeedBatch(id);
          const ops: SyncOperation[] = [
            createOutboxOperation({
              entityType: 'feedBatch',
              entityUuid: id,
              deviceId,
              logicalCounter: allocateNextLogicalCounter(),
              fieldName: '__delete__',
              newValue: true,
              timestamp: ts,
              recordRev: nextEntityRev(id, target?._rev),
            }),
          ];
          for (const al of linkedAllocations) {
            await adapterRef.current!.deleteFeedAllocation(al.id);
            ops.push(
              createOutboxOperation({
                entityType: 'feedAllocation',
                entityUuid: al.id,
                deviceId,
                logicalCounter: allocateNextLogicalCounter(),
                fieldName: '__delete__',
                newValue: true,
                timestamp: ts,
                recordRev: nextEntityRev(al.id, al._rev),
              })
            );
          }
          await recordOutboxOps(ops);
          await reloadFromAdapter();
          notify('Feed batch and linked allocations removed.');
        } catch (err) {
          reportPersistenceFailure('delete feed batch', err);
        }
      });
    },
    [
      enqueueStoreMutation,
      deviceId,
      nextEntityRev,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const logFeedAllocation = useCallback(
    async (
      allocationDraft: Omit<FeedAllocation, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
      options?: { syncLinkedCageFeed?: boolean }
    ): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current ?? snapshot;
        if (!currentSnapshot) return false;
        const batch = (currentSnapshot.feedBatches ?? []).find(
          (b) => b.id === allocationDraft.feedBatchId
        );
        if (!batch) {
          notify('Selected feed batch no longer exists.');
          return false;
        }
        const ts = getAdjustedNowIsoUtc();
        const allocId = allocationDraft.id || generateUuid();
        const prevAlloc = allocationDraft.id
          ? (currentSnapshot.feedAllocations ?? []).find((a) => a.id === allocationDraft.id)
          : undefined;
        const allocRev = nextEntityRev(allocId, prevAlloc?._rev);
        const allocation: FeedAllocation = {
          ...allocationDraft,
          id: allocId,
          quantity: Math.max(0, Number(allocationDraft.quantity) || 0),
          unit: (allocationDraft.unit || '').trim() || batch.bagWeightUnit || 'lbs',
          dateIso: allocationDraft.dateIso || todayDateIso(),
          targetLabel: (allocationDraft.targetLabel || '').trim() || 'General Barn',
          notes: (allocationDraft.notes || '').trim(),
          _rev: allocRev,
          createdAt: prevAlloc?.createdAt || ts,
          updatedAt: ts,
        };

        try {
          const ops: SyncOperation[] = [];
          await adapterRef.current!.saveFeedAllocation(allocation);
          ops.push(
            ...diffEntityFieldsToOperations({
              entityType: 'feedAllocation',
              previous: prevAlloc,
              next: allocation,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: allocRev,
            })
          );

          if (!prevAlloc && allocation.quantity > 0) {
            const batchRev = nextEntityRev(batch.id, batch._rev);
            const updatedBatch: FeedBatch = {
              ...applyFeedAllocationToBatch(batch, allocation.quantity, ts),
              _rev: batchRev,
            };
            await adapterRef.current!.saveFeedBatch(updatedBatch);
            ops.push(
              ...diffEntityFieldsToOperations({
                entityType: 'feedBatch',
                previous: batch,
                next: updatedBatch,
                deviceId,
                nextCounter: allocateNextLogicalCounter,
                timestamp: ts,
                recordRev: batchRev,
              })
            );
          }

          if (
            options?.syncLinkedCageFeed &&
            allocation.targetType === 'cage' &&
            allocation.targetId
          ) {
            const targetCage = currentSnapshot.cages.find((c) => c.id === allocation.targetId);
            if (targetCage) {
              const cageRev = nextEntityRev(targetCage.id, targetCage._rev);
              const lotSummary = batch.lotNumber
                ? `${batch.brand || batch.productName} (Lot ${batch.lotNumber})`
                : `${batch.brand} ${batch.productName}`.trim();
              const nextCageStock =
                Math.round(
                  ((Number(targetCage.feedStockRemaining) || 0) + allocation.quantity) * 100
                ) / 100;
              const updatedCage: CageLocation = {
                ...targetCage,
                feedLotName: lotSummary,
                feedStockRemaining: nextCageStock,
                feedStockUnit: allocation.unit,
                _rev: cageRev,
                updatedAt: ts,
              };
              await adapterRef.current!.saveCage(updatedCage);
              ops.push(
                ...diffEntityFieldsToOperations({
                  entityType: 'cage',
                  previous: targetCage,
                  next: updatedCage,
                  deviceId,
                  nextCounter: allocateNextLogicalCounter,
                  timestamp: ts,
                  recordRev: cageRev,
                })
              );
            }
          }

          await recordOutboxOps(ops);
          await reloadFromAdapter();
          notify(`Logged ${allocation.quantity} ${allocation.unit} feed allocation to ${allocation.targetLabel}.`);
          return true;
        } catch (err) {
          reportPersistenceFailure('log feed allocation', err);
          return false;
        }
      });
    },
    [
      snapshot,
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const deleteFeedAllocation = useCallback(
    async (id: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const target = (currentSnapshot?.feedAllocations ?? []).find((a) => a.id === id);
        if (!target) return;
        const ts = getAdjustedNowIsoUtc();
        try {
          await adapterRef.current!.deleteFeedAllocation(id);
          const ops: SyncOperation[] = [
            createOutboxOperation({
              entityType: 'feedAllocation',
              entityUuid: id,
              deviceId,
              logicalCounter: allocateNextLogicalCounter(),
              fieldName: '__delete__',
              newValue: true,
              timestamp: ts,
              recordRev: nextEntityRev(id, target._rev),
            }),
          ];

          const batch = (currentSnapshot?.feedBatches ?? []).find(
            (b) => b.id === target.feedBatchId
          );
          if (batch && target.quantity > 0) {
            const batchRev = nextEntityRev(batch.id, batch._rev);
            const restoredBatch: FeedBatch = {
              ...reverseFeedAllocationFromBatch(batch, target.quantity, ts),
              _rev: batchRev,
            };
            await adapterRef.current!.saveFeedBatch(restoredBatch);
            ops.push(
              ...diffEntityFieldsToOperations({
                entityType: 'feedBatch',
                previous: batch,
                next: restoredBatch,
                deviceId,
                nextCounter: allocateNextLogicalCounter,
                timestamp: ts,
                recordRev: batchRev,
              })
            );
          }

          await recordOutboxOps(ops);
          await reloadFromAdapter();
          notify('Feed allocation removed and batch stock restored.');
        } catch (err) {
          reportPersistenceFailure('delete feed allocation', err);
        }
      });
    },
    [
      enqueueStoreMutation,
      deviceId,
      nextEntityRev,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const runFeedTagBiosecurityAutoPurge = useCallback(
    async (options?: {
      windowDays?: FeedPurgeWindowDays;
      silent?: boolean;
      todayIso?: string;
    }): Promise<{ purgedCount: number; reclaimedBytes: number }> => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return { purgedCount: 0, reclaimedBytes: 0 };
        const effectiveWindow = normalizeFeedPurgeWindowDays(
          options?.windowDays ?? currentSnapshot.settings.feedTagPurgeWindowDays
        );
        if (effectiveWindow === 0) {
          if (!options?.silent) {
            notify('Biosecurity auto-purge is set to Manual Only (0 days).');
          }
          return { purgedCount: 0, reclaimedBytes: 0 };
        }
        const ts = getAdjustedNowIsoUtc();
        const result = purgeExpiredFeedTagPhotosPure(
          currentSnapshot.feedBatches ?? [],
          effectiveWindow,
          {
            todayIso: options?.todayIso ?? todayDateIso(),
            nowIso: ts,
          }
        );
        if (result.purgedCount === 0) {
          if (!options?.silent) {
            notify(
              `No indexed feed tag photos older than ${effectiveWindow} days needed purging.`
            );
          }
          return { purgedCount: 0, reclaimedBytes: 0 };
        }
        try {
          const prevById = new Map((currentSnapshot.feedBatches ?? []).map((b) => [b.id, b]));
          const changedBatches: FeedBatch[] = [];
          const ops: SyncOperation[] = [];
          for (const nextBatch of result.nextBatches) {
            const prev = prevById.get(nextBatch.id);
            if (!prev || prev.tagPhotoPurgedAtIso === nextBatch.tagPhotoPurgedAtIso) continue;
            const rev = nextEntityRev(nextBatch.id, prev._rev);
            const bumped: FeedBatch = {
              ...nextBatch,
              _rev: rev,
            };
            changedBatches.push(bumped);
            ops.push(
              ...diffEntityFieldsToOperations({
                entityType: 'feedBatch',
                previous: prev,
                next: bumped,
                deviceId,
                nextCounter: allocateNextLogicalCounter,
                timestamp: ts,
                recordRev: rev,
              })
            );
          }
          if (changedBatches.length > 0) {
            await adapterRef.current!.saveFeedBatchesBatch(changedBatches);
            await recordOutboxOps(ops);
            await reloadFromAdapter();
          }
          if (!options?.silent) {
            notify(
              `Biosecurity purge reclaimed ${formatByteSizePure(result.reclaimedBytes)} across ${result.purgedCount} indexed feed tag photo${result.purgedCount === 1 ? '' : 's'} (lot numbers kept intact).`
            );
          }
          return { purgedCount: result.purgedCount, reclaimedBytes: result.reclaimedBytes };
        } catch (err) {
          reportPersistenceFailure('purge expired feed tag photos', err);
          return { purgedCount: 0, reclaimedBytes: 0 };
        }
      });
    },
    [
      enqueueStoreMutation,
      deviceId,
      nextEntityRev,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const feedAutoPurgeRanRef = useRef<boolean>(false);
  useEffect(() => {
    if (isLoading || !hasSnapshotReady || wipedRecoveryDetected || feedAutoPurgeRanRef.current) {
      return;
    }
    const currentSnapshot = snapshotRef.current;
    if (!currentSnapshot) return;
    const windowDays = normalizeFeedPurgeWindowDays(currentSnapshot.settings.feedTagPurgeWindowDays);
    if (windowDays <= 0) {
      feedAutoPurgeRanRef.current = true;
      return;
    }
    const eligible = findPurgeEligibleFeedTagPhotos(
      currentSnapshot.feedBatches ?? [],
      windowDays,
      todayDateIso()
    );
    if (eligible.length === 0) {
      feedAutoPurgeRanRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      if (feedAutoPurgeRanRef.current) return;
      feedAutoPurgeRanRef.current = true;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void runFeedTagBiosecurityAutoPurge({ silent: true, windowDays });
    }, 2500);
    return () => clearTimeout(timer);
  }, [isLoading, hasSnapshotReady, wipedRecoveryDetected, runFeedTagBiosecurityAutoPurge]);

  const saveLedgerEntry = useCallback(
    async (
      draft: Omit<LedgerEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
        const latestSnapshot = snapshotRef.current ?? snapshot;
        const ts = getAdjustedNowIsoUtc();
        const prev = draft.id
          ? (latestSnapshot?.ledgerEntries ?? []).find((x) => x.id === draft.id)
          : undefined;
        const id = draft.id || generateUuid();
        const rev = nextEntityRev(id, prev?._rev);
        const entry: LedgerEntry = {
          ...draft,
          id,
          dateIso: (draft.dateIso || '').trim() || todayDateIso(),
          entryType: normalizeLedgerEntryType(draft.entryType, 'expense'),
          category: normalizeLedgerCategory(draft.category, 'other'),
          amountCents: Math.max(0, Math.round(Number(draft.amountCents) || 0)),
          title: (draft.title || '').trim() || 'Ledger Entry',
          vendorOrParty: (draft.vendorOrParty || '').trim(),
          notes: (draft.notes || '').trim(),
          _rev: rev,
          createdAt: prev?.createdAt || ts,
          updatedAt: ts,
        };
        try {
          await adapterRef.current!.saveLedgerEntry(entry);
          await recordOutboxOps(
            diffEntityFieldsToOperations({
              entityType: 'ledgerEntry',
              previous: prev,
              next: prev
                ? entry
                : { ...entry, receiptPhotoDataUrl: '', receiptPhotoThumbnailDataUrl: '' },
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              ignoreFields: ['receiptPhotoDataUrl', 'receiptPhotoThumbnailDataUrl'],
              timestamp: ts,
              recordRev: rev,
            })
          );
          await reloadFromAdapter();
          notify(`Saved ${entry.entryType === 'income' ? 'income' : 'expense'}: ${entry.title}.`);
          return true;
        } catch (err) {
          reportPersistenceFailure(`save ledger entry ${entry.title}`, err);
          return false;
        }
      });
    },
    [
      snapshot,
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const deleteLedgerEntry = useCallback(
    async (id: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const target = (currentSnapshot?.ledgerEntries ?? []).find((x) => x.id === id);
        const ts = getAdjustedNowIsoUtc();
        try {
          await adapterRef.current!.deleteLedgerEntry(id);
          await recordOutboxOps([
            createOutboxOperation({
              entityType: 'ledgerEntry',
              entityUuid: id,
              deviceId,
              logicalCounter: allocateNextLogicalCounter(),
              fieldName: '__delete__',
              newValue: true,
              timestamp: ts,
              recordRev: nextEntityRev(id, target?._rev),
            }),
          ]);
          await reloadFromAdapter();
          notify('Ledger entry deleted.');
        } catch (err) {
          reportPersistenceFailure('delete ledger entry', err);
        }
      });
    },
    [
      enqueueStoreMutation,
      deviceId,
      nextEntityRev,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const saveProcessingLog = useCallback(
    async (
      draft: Omit<ProcessingLog, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
        const latestSnapshot = snapshotRef.current ?? snapshot;
        const ts = getAdjustedNowIsoUtc();
        const prev = draft.id
          ? (latestSnapshot?.processingLogs ?? []).find((x) => x.id === draft.id)
          : undefined;
        const id = draft.id || generateUuid();
        const rev = nextEntityRev(id, prev?._rev);
        const liveGrams = Math.max(0, Math.round(Number(draft.liveWeightGrams) || 0));
        const dressedGrams = Math.max(0, Math.round(Number(draft.dressedWeightGrams) || 0));
        const computedDressPct = calculateDressOutPercent(liveGrams, dressedGrams);
        const log: ProcessingLog = {
          ...draft,
          id,
          title: (draft.title || '').trim() || 'Processing Batch',
          scheduledDateIso: (draft.scheduledDateIso || '').trim(),
          harvestDateIso: (draft.harvestDateIso || '').trim(),
          status: normalizeProcessingStatus(draft.status, 'Processed'),
          animalCount: Math.max(1, Math.round(Number(draft.animalCount) || 1)),
          liveWeightGrams: liveGrams,
          dressedWeightGrams: dressedGrams,
          ...(computedDressPct !== undefined
            ? { dressOutPercent: computedDressPct }
            : typeof draft.dressOutPercent === 'number' && draft.dressOutPercent > 0
            ? { dressOutPercent: draft.dressOutPercent }
            : {}),
          peltCount: Math.max(0, Math.round(Number(draft.peltCount) || 0)),
          peltGrade: normalizePeltGrade(draft.peltGrade),
          peltColorNotes: (draft.peltColorNotes || '').trim(),
          notes: (draft.notes || '').trim(),
          _rev: rev,
          createdAt: prev?.createdAt || ts,
          updatedAt: ts,
        };
        try {
          await adapterRef.current!.saveProcessingLog(log);
          await recordOutboxOps(
            diffEntityFieldsToOperations({
              entityType: 'processingLog',
              previous: prev,
              next: log,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: rev,
            })
          );
          await reloadFromAdapter();
          notify(`Saved processing log: ${log.title} (${log.status}).`);
          return true;
        } catch (err) {
          reportPersistenceFailure(`save processing log ${log.title}`, err);
          return false;
        }
      });
    },
    [
      snapshot,
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const deleteProcessingLog = useCallback(
    async (id: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const target = (currentSnapshot?.processingLogs ?? []).find((x) => x.id === id);
        const ts = getAdjustedNowIsoUtc();
        try {
          await adapterRef.current!.deleteProcessingLog(id);
          await recordOutboxOps([
            createOutboxOperation({
              entityType: 'processingLog',
              entityUuid: id,
              deviceId,
              logicalCounter: allocateNextLogicalCounter(),
              fieldName: '__delete__',
              newValue: true,
              timestamp: ts,
              recordRev: nextEntityRev(id, target?._rev),
            }),
          ]);
          await reloadFromAdapter();
          notify('Processing log deleted.');
        } catch (err) {
          reportPersistenceFailure('delete processing log', err);
        }
      });
    },
    [
      enqueueStoreMutation,
      deviceId,
      nextEntityRev,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const saveYouthProjectBook = useCallback(
    async (
      draft: Omit<YouthProjectBook, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
        const latestSnapshot = snapshotRef.current ?? snapshot;
        const ts = getAdjustedNowIsoUtc();
        const prev = draft.id
          ? (latestSnapshot?.youthProjectBooks ?? []).find((x) => x.id === draft.id)
          : undefined;
        const id = draft.id || generateUuid();
        const rev = nextEntityRev(id, prev?._rev);
        const project: YouthProjectBook = {
          ...draft,
          id,
          organization: normalizeYouthOrgType(draft.organization, '4-H'),
          projectTitle: (draft.projectTitle || '').trim() || 'Youth Livestock Project',
          memberName: (draft.memberName || '').trim(),
          clubOrChapter: (draft.clubOrChapter || '').trim(),
          leaderOrAdvisor: (draft.leaderOrAdvisor || '').trim(),
          projectYear: (draft.projectYear || '').trim() || todayDateIso().slice(0, 4),
          startDateIso: (draft.startDateIso || '').trim() || todayDateIso(),
          endDateIso: (draft.endDateIso || '').trim(),
          status: draft.status === 'Completed' ? 'Completed' : 'Active',
          linkedAnimalIds: Array.isArray(draft.linkedAnimalIds) ? draft.linkedAnimalIds : [],
          linkedBreedingIds: Array.isArray(draft.linkedBreedingIds) ? draft.linkedBreedingIds : [],
          startingInventoryValueCents: Math.max(
            0,
            Math.round(Number(draft.startingInventoryValueCents) || 0)
          ),
          endingInventoryValueCents: Math.max(
            0,
            Math.round(Number(draft.endingInventoryValueCents) || 0)
          ),
          feedLogs: normalizeYouthProjectFeedLogs(draft.feedLogs),
          goalsAndReflection: (draft.goalsAndReflection || '').trim(),
          showAndCommunityNotes: (draft.showAndCommunityNotes || '').trim(),
          notes: (draft.notes || '').trim(),
          _rev: rev,
          createdAt: prev?.createdAt || ts,
          updatedAt: ts,
        };
        try {
          await adapterRef.current!.saveYouthProjectBook(project);
          await recordOutboxOps(
            diffEntityFieldsToOperations({
              entityType: 'youthProjectBook',
              previous: prev,
              next: project,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: rev,
            })
          );
          await reloadFromAdapter();
          notify(`Saved ${project.organization} project book: ${project.projectTitle}.`);
          return true;
        } catch (err) {
          reportPersistenceFailure(`save youth project book ${project.projectTitle}`, err);
          return false;
        }
      });
    },
    [
      snapshot,
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const deleteYouthProjectBook = useCallback(
    async (id: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const target = (currentSnapshot?.youthProjectBooks ?? []).find((x) => x.id === id);
        const ts = getAdjustedNowIsoUtc();
        try {
          await adapterRef.current!.deleteYouthProjectBook(id);
          await recordOutboxOps([
            createOutboxOperation({
              entityType: 'youthProjectBook',
              entityUuid: id,
              deviceId,
              logicalCounter: allocateNextLogicalCounter(),
              fieldName: '__delete__',
              newValue: true,
              timestamp: ts,
              recordRev: nextEntityRev(id, target?._rev),
            }),
          ]);
          await reloadFromAdapter();
          notify('Youth project record book deleted.');
        } catch (err) {
          reportPersistenceFailure('delete youth project book', err);
        }
      });
    },
    [
      enqueueStoreMutation,
      deviceId,
      nextEntityRev,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const saveClientContact = useCallback(
    async (
      draft: Omit<ClientContact, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): Promise<string | null> => {
      return enqueueStoreMutation(async () => {
        const latestSnapshot = snapshotRef.current ?? snapshot;
        const ts = getAdjustedNowIsoUtc();
        const prev = draft.id
          ? (latestSnapshot?.clientContacts ?? []).find((x) => x.id === draft.id)
          : undefined;
        const id = draft.id || generateUuid();
        const rev = nextEntityRev(id, prev?._rev);
        const cleanTags = Array.isArray(draft.tags)
          ? Array.from(new Set(draft.tags.map((t) => t.trim()).filter(Boolean)))
          : [];
        const contact: ClientContact = {
          ...draft,
          id,
          fullName: (draft.fullName || '').trim() || 'Buyer',
          ranchOrHerdName: (draft.ranchOrHerdName || '').trim(),
          email: (draft.email || '').trim(),
          phone: (draft.phone || '').trim(),
          preferredContact: normalizePreferredContactMethod(draft.preferredContact, 'sms'),
          clientKind: normalizeClientKind(draft.clientKind, 'pet_buyer'),
          cityState: (draft.cityState || '').trim(),
          shippingAddress: (draft.shippingAddress || '').trim(),
          tags: cleanTags,
          notes: (draft.notes || '').trim(),
          _rev: rev,
          createdAt: prev?.createdAt || ts,
          updatedAt: ts,
        };
        try {
          await adapterRef.current!.saveClientContact(contact);
          await recordOutboxOps(
            diffEntityFieldsToOperations({
              entityType: 'clientContact',
              previous: prev,
              next: contact,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: rev,
            })
          );
          await reloadFromAdapter();
          notify(`Saved client contact: ${contact.fullName}.`);
          return id;
        } catch (err) {
          reportPersistenceFailure(`save client contact ${contact.fullName}`, err);
          return null;
        }
      });
    },
    [
      snapshot,
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const deleteClientContact = useCallback(
    async (id: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const target = (currentSnapshot?.clientContacts ?? []).find((x) => x.id === id);
        const ts = getAdjustedNowIsoUtc();
        try {
          await adapterRef.current!.deleteClientContact(id);
          await recordOutboxOps([
            createOutboxOperation({
              entityType: 'clientContact',
              entityUuid: id,
              deviceId,
              logicalCounter: allocateNextLogicalCounter(),
              fieldName: '__delete__',
              newValue: true,
              timestamp: ts,
              recordRev: nextEntityRev(id, target?._rev),
            }),
          ]);
          await reloadFromAdapter();
          notify('Client contact deleted.');
        } catch (err) {
          reportPersistenceFailure('delete client contact', err);
        }
      });
    },
    [
      enqueueStoreMutation,
      deviceId,
      nextEntityRev,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const saveWaitlistEntry = useCallback(
    async (
      draft: Omit<WaitlistEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): Promise<string | null> => {
      return enqueueStoreMutation(async () => {
        const latestSnapshot = snapshotRef.current ?? snapshot;
        const ts = getAdjustedNowIsoUtc();
        const prev = draft.id
          ? (latestSnapshot?.waitlistEntries ?? []).find((x) => x.id === draft.id)
          : undefined;
        const id = draft.id || generateUuid();
        const rev = nextEntityRev(id, prev?._rev);
        const linkedClient = draft.clientId
          ? (latestSnapshot?.clientContacts ?? []).find((c) => c.id === draft.clientId)
          : undefined;
        const maxBudgetNum =
          draft.maxBudgetCents !== undefined && Number.isFinite(Number(draft.maxBudgetCents))
            ? Math.max(0, Math.round(Number(draft.maxBudgetCents)))
            : undefined;
        const entry: WaitlistEntry = {
          ...draft,
          id,
          clientName: linkedClient?.fullName || (draft.clientName || '').trim() || 'Buyer',
          priorityRank: Math.max(1, Math.round(Number(draft.priorityRank) || 1)),
          status: normalizeWaitlistStatus(draft.status, 'Active'),
          intent: normalizeWaitlistIntent(draft.intent, 'Show / Breeding'),
          desiredBreed: (draft.desiredBreed || '').trim(),
          desiredVariety: (draft.desiredVariety || '').trim(),
          preferredSex:
            draft.preferredSex === 'Male' || draft.preferredSex === 'Female'
              ? draft.preferredSex
              : 'Any',
          preferredBreedingId: draft.preferredBreedingId || undefined,
          requestedByDateIso: (draft.requestedByDateIso || '').trim(),
          inquiryDateIso: (draft.inquiryDateIso || '').trim() || todayDateIso(),
          followUpDateIso: (draft.followUpDateIso || '').trim(),
          lastContactedDateIso: (draft.lastContactedDateIso || '').trim(),
          maxBudgetCents: maxBudgetNum && maxBudgetNum > 0 ? maxBudgetNum : undefined,
          notes: (draft.notes || '').trim(),
          _rev: rev,
          createdAt: prev?.createdAt || ts,
          updatedAt: ts,
        };
        try {
          await adapterRef.current!.saveWaitlistEntry(entry);
          await recordOutboxOps(
            diffEntityFieldsToOperations({
              entityType: 'waitlistEntry',
              previous: prev,
              next: entry,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: rev,
            })
          );
          await reloadFromAdapter();
          notify(`Saved waitlist entry #${entry.priorityRank} for ${entry.clientName}.`);
          return id;
        } catch (err) {
          reportPersistenceFailure(`save waitlist entry for ${entry.clientName}`, err);
          return null;
        }
      });
    },
    [
      snapshot,
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const deleteWaitlistEntry = useCallback(
    async (id: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const target = (currentSnapshot?.waitlistEntries ?? []).find((x) => x.id === id);
        const ts = getAdjustedNowIsoUtc();
        try {
          await adapterRef.current!.deleteWaitlistEntry(id);
          await recordOutboxOps([
            createOutboxOperation({
              entityType: 'waitlistEntry',
              entityUuid: id,
              deviceId,
              logicalCounter: allocateNextLogicalCounter(),
              fieldName: '__delete__',
              newValue: true,
              timestamp: ts,
              recordRev: nextEntityRev(id, target?._rev),
            }),
          ]);
          await reloadFromAdapter();
          notify('Waitlist entry deleted.');
        } catch (err) {
          reportPersistenceFailure('delete waitlist entry', err);
        }
      });
    },
    [
      enqueueStoreMutation,
      deviceId,
      nextEntityRev,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const saveAnimalReservation = useCallback(
    async (
      draft: Omit<AnimalReservation, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): Promise<string | null> => {
      return enqueueStoreMutation(async () => {
        const latestSnapshot = snapshotRef.current ?? snapshot;
        const ts = getAdjustedNowIsoUtc();
        const prev = draft.id
          ? (latestSnapshot?.animalReservations ?? []).find((x) => x.id === draft.id)
          : undefined;
        const id = draft.id || generateUuid();
        const rev = nextEntityRev(id, prev?._rev);
        const linkedClient = draft.clientId
          ? (latestSnapshot?.clientContacts ?? []).find((c) => c.id === draft.clientId)
          : undefined;
        const speciesReservations = (latestSnapshot?.animalReservations ?? []).filter((r) =>
          isSameSpecies(r.species, draft.species)
        );
        const agreementNumber =
          (draft.agreementNumber || '').trim() ||
          prev?.agreementNumber ||
          buildSuggestedAgreementNumber(speciesReservations);
        const status = normalizeReservationStatus(draft.status, 'Pending Deposit');
        const totalPriceCents = Math.max(0, Math.round(Number(draft.totalPriceCents) || 0));
        const depositRequiredCents = Math.max(
          0,
          Math.round(Number(draft.depositRequiredCents) || 0)
        );
        const depositPaidCents = Math.max(0, Math.round(Number(draft.depositPaidCents) || 0));
        const fin = evaluateReservationFinancials({
          status,
          totalPriceCents,
          depositRequiredCents,
          depositPaidCents,
        });
        const reservation: AnimalReservation = {
          ...draft,
          id,
          agreementNumber,
          clientName: linkedClient?.fullName || (draft.clientName || '').trim() || 'Buyer',
          waitlistEntryId: draft.waitlistEntryId || undefined,
          animalId: draft.animalId || undefined,
          breedingId: draft.breedingId || undefined,
          pickOrder:
            draft.pickOrder !== undefined && Number(draft.pickOrder) > 0
              ? Math.round(Number(draft.pickOrder))
              : undefined,
          itemLabel: (draft.itemLabel || '').trim() || 'Reserved Animal / Pick',
          status: draft.id ? status : fin.suggestedStatus,
          reservedDateIso: (draft.reservedDateIso || '').trim() || todayDateIso(),
          holdExpiresDateIso: (draft.holdExpiresDateIso || '').trim(),
          totalPriceCents,
          depositRequiredCents,
          depositPaidCents,
          depositDueDateIso: (draft.depositDueDateIso || '').trim(),
          depositPaidDateIso: (draft.depositPaidDateIso || '').trim(),
          pickupScheduledDateIso: (draft.pickupScheduledDateIso || '').trim(),
          completedDateIso: (draft.completedDateIso || '').trim(),
          balanceReminderDateIso: (draft.balanceReminderDateIso || '').trim(),
          paymentMethod: (draft.paymentMethod || '').trim(),
          ledgerEntryId: draft.ledgerEntryId || undefined,
          termsSummary: (draft.termsSummary || '').trim(),
          healthGuaranteeNotes: (draft.healthGuaranteeNotes || '').trim(),
          notes: (draft.notes || '').trim(),
          _rev: rev,
          createdAt: prev?.createdAt || ts,
          updatedAt: ts,
        };
        try {
          await adapterRef.current!.saveAnimalReservation(reservation);
          const outboxOps = diffEntityFieldsToOperations({
            entityType: 'animalReservation',
            previous: prev,
            next: reservation,
            deviceId,
            nextCounter: allocateNextLogicalCounter,
            timestamp: ts,
            recordRev: rev,
          });
          if (
            reservation.waitlistEntryId &&
            reservation.status !== 'Cancelled' &&
            reservation.status !== 'Inquiry Hold'
          ) {
            const linkedWait = (latestSnapshot?.waitlistEntries ?? []).find(
              (w) => w.id === reservation.waitlistEntryId
            );
            if (linkedWait && (linkedWait.status === 'Active' || linkedWait.status === 'Matched')) {
              const nextWaitStatus =
                reservation.status === 'Picked Up / Completed' ? 'Fulfilled' : 'Deposited';
              const waitRev = nextEntityRev(linkedWait.id, linkedWait._rev);
              const updatedWait: WaitlistEntry = {
                ...linkedWait,
                status: nextWaitStatus,
                _rev: waitRev,
                updatedAt: ts,
              };
              await adapterRef.current!.saveWaitlistEntry(updatedWait);
              outboxOps.push(
                ...diffEntityFieldsToOperations({
                  entityType: 'waitlistEntry',
                  previous: linkedWait,
                  next: updatedWait,
                  deviceId,
                  nextCounter: allocateNextLogicalCounter,
                  timestamp: ts,
                  recordRev: waitRev,
                })
              );
            }
          }
          await recordOutboxOps(outboxOps);
          await reloadFromAdapter();
          notify(`Saved reservation ${reservation.agreementNumber} (${reservation.clientName}).`);
          return id;
        } catch (err) {
          reportPersistenceFailure(`save reservation ${reservation.agreementNumber}`, err);
          return null;
        }
      });
    },
    [
      snapshot,
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const deleteAnimalReservation = useCallback(
    async (id: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const target = (currentSnapshot?.animalReservations ?? []).find((x) => x.id === id);
        const ts = getAdjustedNowIsoUtc();
        try {
          await adapterRef.current!.deleteAnimalReservation(id);
          await recordOutboxOps([
            createOutboxOperation({
              entityType: 'animalReservation',
              entityUuid: id,
              deviceId,
              logicalCounter: allocateNextLogicalCounter(),
              fieldName: '__delete__',
              newValue: true,
              timestamp: ts,
              recordRev: nextEntityRev(id, target?._rev),
            }),
          ]);
          await reloadFromAdapter();
          notify('Reservation deleted.');
        } catch (err) {
          reportPersistenceFailure('delete reservation', err);
        }
      });
    },
    [
      enqueueStoreMutation,
      deviceId,
      nextEntityRev,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const saveWoolHarvest = useCallback(
    async (
      draft: Omit<WoolHarvest, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): Promise<string | null> => {
      return enqueueStoreMutation(async () => {
        const latestSnapshot = snapshotRef.current ?? snapshot;
        const ts = getAdjustedNowIsoUtc();
        const prev = draft.id
          ? (latestSnapshot?.woolHarvests ?? []).find((x) => x.id === draft.id)
          : undefined;
        const id = draft.id || generateUuid();
        const rev = nextEntityRev(id, prev?._rev);
        const normalized = normalizeWoolHarvest(
          {
            ...draft,
            id,
            _rev: rev,
            createdAt: prev?.createdAt || ts,
            updatedAt: ts,
          },
          draft.species || activeSpeciesName || 'Rabbit'
        );
        if (!normalized) return null;
        try {
          await adapterRef.current!.saveWoolHarvest(normalized);
          const outboxOps = diffEntityFieldsToOperations({
            entityType: 'woolHarvest',
            previous: prev,
            next: normalized,
            deviceId,
            nextCounter: allocateNextLogicalCounter,
            timestamp: ts,
            recordRev: rev,
          });
          await recordOutboxOps(outboxOps);
          await reloadFromAdapter();
          const totalG = normalized.primeWeightGrams + normalized.gradeWeightGrams;
          notify(`Saved wool harvest (${totalG} g on ${normalized.harvestDateIso}).`);
          return id;
        } catch (err) {
          reportPersistenceFailure('save wool harvest', err);
          return null;
        }
      });
    },
    [
      snapshot,
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const deleteWoolHarvest = useCallback(
    async (id: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const target = (currentSnapshot?.woolHarvests ?? []).find((x) => x.id === id);
        const ts = getAdjustedNowIsoUtc();
        try {
          await adapterRef.current!.deleteWoolHarvest(id);
          await recordOutboxOps([
            createOutboxOperation({
              entityType: 'woolHarvest',
              entityUuid: id,
              deviceId,
              logicalCounter: allocateNextLogicalCounter(),
              fieldName: '__delete__',
              newValue: true,
              timestamp: ts,
              recordRev: nextEntityRev(id, target?._rev),
            }),
          ]);
          await reloadFromAdapter();
          notify('Wool harvest record deleted.');
        } catch (err) {
          reportPersistenceFailure('delete wool harvest', err);
        }
      });
    },
    [
      enqueueStoreMutation,
      deviceId,
      nextEntityRev,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const completeReservationSale = useCallback(
    async (params: {
      reservationId: string;
      completedDateIso?: string;
      markAnimalSold?: boolean;
      recordLedgerIncome?: boolean;
    }): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
        const latestSnapshot = snapshotRef.current ?? snapshot;
        if (!latestSnapshot) return false;
        const target = (latestSnapshot.animalReservations ?? []).find(
          (r) => r.id === params.reservationId
        );
        if (!target) return false;

        const ts = getAdjustedNowIsoUtc();
        const completedDateIso = (params.completedDateIso || '').trim() || todayDateIso();
        const finalPaidCents = Math.max(target.totalPriceCents, target.depositPaidCents);
        let ledgerEntryId = target.ledgerEntryId;
        const outboxOps: SyncOperation[] = [];

        try {
          if (params.recordLedgerIncome && finalPaidCents > 0 && !ledgerEntryId) {
            const newLedgerId = generateUuid();
            const ledgerRev = nextEntityRev(newLedgerId);
            const ledgerEntry: LedgerEntry = {
              id: newLedgerId,
              species: target.species,
              dateIso: completedDateIso,
              entryType: 'income',
              category: 'animal_sale',
              amountCents: finalPaidCents,
              title: `${target.agreementNumber || 'Sale'} — ${target.itemLabel}`,
              vendorOrParty: target.clientName,
              linkedAnimalId: target.animalId,
              linkedBreedingId: target.breedingId,
              notes: `Completed reservation ${target.agreementNumber || target.id}`,
              _rev: ledgerRev,
              createdAt: ts,
              updatedAt: ts,
            };
            await adapterRef.current!.saveLedgerEntry(ledgerEntry);
            outboxOps.push(
              ...diffEntityFieldsToOperations({
                entityType: 'ledgerEntry',
                previous: undefined,
                next: ledgerEntry,
                deviceId,
                nextCounter: allocateNextLogicalCounter,
                timestamp: ts,
                recordRev: ledgerRev,
              })
            );
            ledgerEntryId = newLedgerId;
          }

          if (params.markAnimalSold !== false && target.animalId) {
            const animalPrev = latestSnapshot.animals.find((a) => a.id === target.animalId);
            if (animalPrev) {
              const animalRev = nextEntityRev(animalPrev.id, animalPrev._rev);
              const updatedAnimal: Animal = {
                ...animalPrev,
                status: 'Sold',
                soldDateIso: animalPrev.soldDateIso || completedDateIso,
                salePriceCents: finalPaidCents > 0 ? finalPaidCents : animalPrev.salePriceCents,
                buyerName: target.clientName || animalPrev.buyerName,
                _rev: animalRev,
                updatedAt: ts,
              };
              await adapterRef.current!.saveAnimal(updatedAnimal);
              outboxOps.push(
                ...diffEntityFieldsToOperations({
                  entityType: 'animal',
                  previous: animalPrev,
                  next: updatedAnimal,
                  deviceId,
                  nextCounter: allocateNextLogicalCounter,
                  timestamp: ts,
                  recordRev: animalRev,
                })
              );
            }
          }

          if (target.waitlistEntryId) {
            const waitPrev = (latestSnapshot.waitlistEntries ?? []).find(
              (w) => w.id === target.waitlistEntryId
            );
            if (waitPrev && waitPrev.status !== 'Fulfilled') {
              const waitRev = nextEntityRev(waitPrev.id, waitPrev._rev);
              const updatedWait: WaitlistEntry = {
                ...waitPrev,
                status: 'Fulfilled',
                _rev: waitRev,
                updatedAt: ts,
              };
              await adapterRef.current!.saveWaitlistEntry(updatedWait);
              outboxOps.push(
                ...diffEntityFieldsToOperations({
                  entityType: 'waitlistEntry',
                  previous: waitPrev,
                  next: updatedWait,
                  deviceId,
                  nextCounter: allocateNextLogicalCounter,
                  timestamp: ts,
                  recordRev: waitRev,
                })
              );
            }
          }

          const resRev = nextEntityRev(target.id, target._rev);
          const updatedRes: AnimalReservation = {
            ...target,
            status: 'Picked Up / Completed',
            depositPaidCents: finalPaidCents,
            depositPaidDateIso: target.depositPaidDateIso || completedDateIso,
            completedDateIso,
            ledgerEntryId,
            _rev: resRev,
            updatedAt: ts,
          };
          await adapterRef.current!.saveAnimalReservation(updatedRes);
          outboxOps.push(
            ...diffEntityFieldsToOperations({
              entityType: 'animalReservation',
              previous: target,
              next: updatedRes,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: resRev,
            })
          );

          await recordOutboxOps(outboxOps);
          await reloadFromAdapter();
          notify(`Completed sale for ${target.agreementNumber} (${target.clientName}).`);
          return true;
        } catch (err) {
          reportPersistenceFailure(`complete sale ${target.agreementNumber}`, err);
          return false;
        }
      });
    },
    [
      snapshot,
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const createCrmReminderTask = useCallback(
    async (speciesName: string, reminder: CrmFollowUpReminder): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const ts = getAdjustedNowIsoUtc();
        const taskId = generateUuid();
        const taskRev = nextEntityRev(taskId);
        const linkedAnimal = reminder.linkedAnimalId
          ? currentSnapshot?.animals.find((a) => a.id === reminder.linkedAnimalId)
          : undefined;
        const task: BarnTask = {
          id: taskId,
          species: speciesName,
          title: reminder.suggestedTaskTitle,
          category: reminder.suggestedTaskCategory,
          priority: reminder.suggestedTaskPriority,
          dueDateIso: reminder.targetDateIso || todayDateIso(),
          completed: false,
          linkedBreedingId: reminder.linkedBreedingId || '',
          linkedAnimalId: reminder.linkedAnimalId || '',
          linkedAnimalName: linkedAnimal?.name || reminder.clientName || '',
          _rev: taskRev,
          createdAt: ts,
          updatedAt: ts,
        };
        try {
          await adapterRef.current!.saveTask(task);
          await recordOutboxOps(
            diffEntityFieldsToOperations({
              entityType: 'task',
              previous: undefined,
              next: task,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: taskRev,
            })
          );
          await reloadFromAdapter();
          notify(`Added Master Task: ${task.title}`);
          return true;
        } catch (err) {
          reportPersistenceFailure(`create CRM task ${task.title}`, err);
          return false;
        }
      });
    },
    [
      deviceId,
      nextEntityRev,
      enqueueStoreMutation,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const seedSpeciesSampleData = useCallback(
    async (speciesName: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        const existingProfile = currentSnapshot.speciesProfiles.find((sp) =>
          isSameSpecies(sp.name, speciesName)
        );
        const bundle = buildSampleDataForSpecies(speciesName, existingProfile);
        if (!bundle) {
          notify(`No predefined testing dataset found for ${speciesName}.`);
          return;
        }
        try {
          const spKey = speciesName.trim().toLowerCase();
          const seedTaskIds = new Set(bundle.tasks.map((t) => t.id));
          const nextIgnored = (currentSnapshot.settings.ignoredTaskIds || []).filter(
            (id) => !seedTaskIds.has(id)
          );
          const nextDismissed = { ...(currentSnapshot.settings.dismissedTaskGroupKeys || {}) };
          delete nextDismissed[spKey];
          const refreshedSettings: BarnSettings = {
            ...currentSnapshot.settings,
            ignoredTaskIds: nextIgnored,
            dismissedTaskGroupKeys: nextDismissed,
            updatedAt: getAdjustedNowIsoUtc(),
          };
          const report = mergeBarnSnapshots(
            { ...currentSnapshot, settings: refreshedSettings },
            {
              settings: refreshedSettings,
              speciesProfiles: [bundle.speciesProfile],
              animals: bundle.animals,
              animalPhotos: [],
              cages: bundle.cages,
              breedings: bundle.breedings,
              tasks: bundle.tasks,
              careLogs: bundle.careLogs,
              shows: bundle.shows,
              feedBatches: [],
              feedAllocations: [],
              ledgerEntries: [],
              processingLogs: [],
              youthProjectBooks: [],
              clientContacts: [],
              waitlistEntries: [],
              animalReservations: [],
              woolHarvests: [],
            }
          );
          await adapterRef.current!.replaceSnapshot(report.snapshot);
          await reloadFromAdapter();
          notify(`Loaded 6-generation testing dataset for ${speciesName}.`);
        } catch (err) {
          reportPersistenceFailure(`load ${speciesName} testing dataset`, err);
        }
      });
    },
    [enqueueStoreMutation, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const seedAllPredefinedSpecies = useCallback(async () => {
    return enqueueStoreMutation(async () => {
      const currentSnapshot = snapshotRef.current;
      try {
        const cleanedSettings: Partial<BarnSettings> | undefined = currentSnapshot?.settings
          ? {
              ...currentSnapshot.settings,
              ignoredTaskIds: (currentSnapshot.settings.ignoredTaskIds || []).filter(
                (id) => !isSampleTestingId(id)
              ),
              dismissedTaskGroupKeys: {},
            }
          : undefined;
        const full = buildFullPredefinedSampleSnapshot(cleanedSettings);
        const memoBySpeciesKey = new Map(
          (currentSnapshot?.speciesProfiles || []).map((sp) => [
            sp.name.trim().toLowerCase(),
            {
              memoText: sanitizeSpeciesMemo(sp.memoText ?? ''),
              memoUpdatedAt: sp.memoUpdatedAt || '',
            },
          ])
        );
        full.speciesProfiles = full.speciesProfiles.map((sp) => {
          const prevMemo = memoBySpeciesKey.get(sp.name.trim().toLowerCase());
          return prevMemo && prevMemo.memoText
            ? { ...sp, memoText: prevMemo.memoText, memoUpdatedAt: prevMemo.memoUpdatedAt }
            : sp;
        });
        await adapterRef.current!.replaceSnapshot(full);
        await reloadFromAdapter();
        notify(
          `Loaded 6-generation testing herds across all ${PREDEFINED_SPECIES_PRESETS.length} predefined species.`
        );
      } catch (err) {
        reportPersistenceFailure('load predefined testing herds', err);
      }
    });
  }, [enqueueStoreMutation, reloadFromAdapter, notify, reportPersistenceFailure]);

  const deleteSpeciesTestingData = useCallback(
    async (speciesName: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        const { nextSnapshot, removedAnimals, removedTotalRecords, removedAnimalIds } =
          purgeSpeciesTestingDataPure(currentSnapshot, speciesName);
        if (removedTotalRecords === 0) {
          notify(`No testing records found in ${speciesName}.`);
          return;
        }
        try {
          await saveSafetyRollingBackup(currentSnapshot);
          await adapterRef.current!.replaceSnapshot(nextSnapshot);
          const keptPhotoIds = new Set((nextSnapshot.animalPhotos ?? []).map((p) => p.id));
          for (const photo of currentSnapshot.animalPhotos ?? []) {
            if (!keptPhotoIds.has(photo.id)) {
              photoCacheRef.current.delete(photo.id);
            }
          }
          if (selectedAnimalId && removedAnimalIds.has(selectedAnimalId)) {
            setSelectedAnimalId(null);
          }
          if (pedigreeAnimalId && removedAnimalIds.has(pedigreeAnimalId)) {
            setPedigreeAnimalId(null);
          }
          await reloadFromAdapter();
          notify(
            `Deleted ${speciesName} testing data (${removedAnimals} sample animals, ${removedTotalRecords} total testing records).`
          );
        } catch (err) {
          reportPersistenceFailure(`delete ${speciesName} testing data`, err);
        }
      });
    },
    [enqueueStoreMutation, selectedAnimalId, pedigreeAnimalId, saveSafetyRollingBackup, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const deleteSpeciesNonTestingData = useCallback(
    async (speciesName: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        const { nextSnapshot, removedAnimals, removedTotalRecords, removedAnimalIds } =
          purgeSpeciesNonTestingDataPure(currentSnapshot, speciesName);
        if (removedTotalRecords === 0) {
          notify(`No non-testing records found in ${speciesName}.`);
          return;
        }
        try {
          await saveSafetyRollingBackup(currentSnapshot);
          await adapterRef.current!.replaceSnapshot(nextSnapshot);
          const keptPhotoIds = new Set((nextSnapshot.animalPhotos ?? []).map((p) => p.id));
          for (const photo of currentSnapshot.animalPhotos ?? []) {
            if (!keptPhotoIds.has(photo.id)) {
              photoCacheRef.current.delete(photo.id);
            }
          }
          if (selectedAnimalId && removedAnimalIds.has(selectedAnimalId)) {
            setSelectedAnimalId(null);
          }
          if (pedigreeAnimalId && removedAnimalIds.has(pedigreeAnimalId)) {
            setPedigreeAnimalId(null);
          }
          await reloadFromAdapter();
          notify(
            `Removed ${speciesName} non-testing data (${removedAnimals} animals, ${removedTotalRecords} total records).`
          );
        } catch (err) {
          reportPersistenceFailure(`remove ${speciesName} non-testing data`, err);
        }
      });
    },
    [enqueueStoreMutation, selectedAnimalId, pedigreeAnimalId, saveSafetyRollingBackup, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const deleteAllSpeciesRecords = useCallback(
    async (speciesName: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        const { nextSnapshot, removedAnimals, removedTotalRecords, removedAnimalIds } =
          purgeAllSpeciesRecordsPure(currentSnapshot, speciesName);
        if (removedTotalRecords === 0) {
          notify(`${speciesName} already has zero records.`);
          return;
        }
        try {
          await saveSafetyRollingBackup(currentSnapshot);
          await adapterRef.current!.replaceSnapshot(nextSnapshot);
          const keptPhotoIds = new Set((nextSnapshot.animalPhotos ?? []).map((p) => p.id));
          for (const photo of currentSnapshot.animalPhotos ?? []) {
            if (!keptPhotoIds.has(photo.id)) {
              photoCacheRef.current.delete(photo.id);
            }
          }
          if (selectedAnimalId && removedAnimalIds.has(selectedAnimalId)) {
            setSelectedAnimalId(null);
          }
          if (pedigreeAnimalId && removedAnimalIds.has(pedigreeAnimalId)) {
            setPedigreeAnimalId(null);
          }
          await reloadFromAdapter();
          notify(
            `Deleted all ${speciesName} records (${removedAnimals} animals, ${removedTotalRecords} total records) while keeping ${speciesName} configured.`
          );
        } catch (err) {
          reportPersistenceFailure(`delete all ${speciesName} records`, err);
        }
      });
    },
    [enqueueStoreMutation, selectedAnimalId, pedigreeAnimalId, saveSafetyRollingBackup, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const clearAllRecordsKeepSpecies = useCallback(async () => {
    return enqueueStoreMutation(async () => {
      const currentSnapshot = snapshotRef.current;
      if (!currentSnapshot) return;
      try {
        await saveSafetyRollingBackup(currentSnapshot);
        const empty: BarnDatabaseSnapshot = {
          settings: {
            ...currentSnapshot.settings,
            lastBackupMeta: undefined,
            backupReminderSnoozedUntilMs: undefined,
            updatedAt: getAdjustedNowIsoUtc(),
          },
          speciesProfiles: currentSnapshot.speciesProfiles,
          animals: [],
          animalPhotos: [],
          cages: [],
          breedings: [],
          tasks: [],
          careLogs: [],
          shows: [],
          feedBatches: [],
          feedAllocations: [],
          ledgerEntries: [],
          processingLogs: [],
          youthProjectBooks: [],
          clientContacts: [],
          waitlistEntries: [],
          animalReservations: [],
          woolHarvests: [],
        };
        await adapterRef.current!.replaceSnapshot(empty);
        photoCacheRef.current.clear();
        await clearLocalSyncAndBackupReminderState();
        setSelectedAnimalId(null);
        setPedigreeAnimalId(null);
        await reloadFromAdapter();
        notify('Deleted all animal, photo, breeding, and chore data across all species.');
      } catch (err) {
        reportPersistenceFailure('clear all animal data', err);
      }
    });
  }, [
    enqueueStoreMutation,
    saveSafetyRollingBackup,
    clearLocalSyncAndBackupReminderState,
    reloadFromAdapter,
    notify,
    reportPersistenceFailure,
  ]);

  const restoreFactoryDefaults = useCallback(async () => {
    return enqueueStoreMutation(async () => {
      const currentSnapshot = snapshotRef.current;
      try {
        if (currentSnapshot) {
          await saveSafetyRollingBackup(currentSnapshot);
        }
        const factorySnapshot = buildFullPredefinedSampleSnapshot();
        await adapterRef.current!.replaceSnapshot(factorySnapshot);
        photoCacheRef.current.clear();
        await clearLocalSyncAndBackupReminderState();
        setSelectedAnimalId(null);
        setPedigreeAnimalId(null);
        setPedigreeGenerations(factorySnapshot.settings.defaultGenerations);
        setActiveSpeciesName(factorySnapshot.settings.defaultSpecies || 'Rabbit');
        setRoute('home');
        await reloadFromAdapter();
        notify('Restored app to factory settings, theme palette, and 9 starter species herds.');
      } catch (err) {
        reportPersistenceFailure('restore factory defaults', err);
      }
    });
  }, [
    enqueueStoreMutation,
    saveSafetyRollingBackup,
    clearLocalSyncAndBackupReminderState,
    reloadFromAdapter,
    notify,
    reportPersistenceFailure,
  ]);

  const importJsonBackup = useCallback(
    async (jsonText: string, mode: 'merge' | 'replace') => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        try {
          const incoming = parseBarnBackupJson(jsonText, currentSnapshot.settings);
          if (mode === 'replace') {
            if (currentSnapshot.animals.length > 0) {
              await saveSafetyRollingBackup(currentSnapshot, 'Pre-JSON-replace safety snapshot');
            }
            photoCacheRef.current.clear();
            const flagRes = applyImportConflictAttentionFlags(incoming.animals);
            const nextSnap: BarnDatabaseSnapshot = {
              ...incoming,
              settings: {
                ...incoming.settings,
                lastBackupMeta: undefined,
                backupReminderSnoozedUntilMs: undefined,
              },
              animals: flagRes.animals,
            };
            await adapterRef.current!.replaceSnapshot(nextSnap);
            await clearLocalSyncAndBackupReminderState();
            setWipedRecoveryContext(null);
            await reloadFromAdapter();
            if (flagRes.alertMessage) {
              const spNames = Array.from(
                new Set(
                  flagRes.animals
                    .filter((a) => flagRes.conflictedAnimalIds.includes(a.id))
                    .map((a) => a.species)
                )
              );
              setImportConflictAlert({
                message: flagRes.alertMessage,
                speciesNames: spNames,
                conflictedCount: flagRes.conflictedAnimalIds.length,
              });
              logDiagnosticEvent({
                level: 'warn',
                category: 'storage',
                message: flagRes.alertMessage,
              });
            }
            notify(
              `Restored ${incoming.animals.length} animals & ${incoming.animalPhotos.length} photos from JSON backup.${
                flagRes.alertMessage ? ` ${flagRes.alertMessage}` : ''
              }`
            );
          } else {
            const merged = mergeBarnSnapshots(currentSnapshot, incoming);
            const importedIds = new Set(incoming.animals.map((a) => a.id));
            const flagRes = applyImportConflictAttentionFlags(merged.snapshot.animals, importedIds);
            const nextSnap: BarnDatabaseSnapshot = { ...merged.snapshot, animals: flagRes.animals };
            await adapterRef.current!.replaceSnapshot(nextSnap);
            await reloadFromAdapter();
            if (flagRes.alertMessage) {
              const spNames = Array.from(
                new Set(
                  flagRes.animals
                    .filter((a) => flagRes.conflictedAnimalIds.includes(a.id))
                    .map((a) => a.species)
                )
              );
              setImportConflictAlert({
                message: flagRes.alertMessage,
                speciesNames: spNames,
                conflictedCount: flagRes.conflictedAnimalIds.length,
              });
              logDiagnosticEvent({
                level: 'warn',
                category: 'storage',
                message: flagRes.alertMessage,
              });
            }
            notify(
              `UUID/Timestamp sync complete: +${merged.animalsAdded} added, ${merged.animalsUpdated} updated, ${merged.photosMerged} photos merged.${
                flagRes.alertMessage ? ` ${flagRes.alertMessage}` : ''
              }`
            );
          }
        } catch (err) {
          reportPersistenceFailure('import JSON backup', err);
          throw err;
        }
      });
    },
    [
      enqueueStoreMutation,
      saveSafetyRollingBackup,
      clearLocalSyncAndBackupReminderState,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const importBackupArchiveBytes = useCallback(
    async (bytes: Uint8Array, fileName: string, mode: 'merge' | 'replace') => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        try {
          const parsed = await parseBackupArchiveOffThread(
            bytes,
            fileName,
            currentSnapshot.settings
          );

          if (parsed.kind === 'photos_only') {
            if (mode === 'replace') {
              throw new Error(
                'This ZIP contains only animal photos (photos/manifest.json without herd tables). Use "Merge (.JSON / .ZIP)" to restore photos without wiping your records.'
              );
            }
            const photoMerge = mergePhotosOnlyIntoSnapshot(
              currentSnapshot,
              parsed.photos,
              parsed.manifestEntries
            );
            await adapterRef.current!.replaceSnapshot(photoMerge.nextSnapshot);
            await reloadFromAdapter();
            const skippedMsg =
              photoMerge.unmatchedSkipped > 0
                ? ` (${photoMerge.unmatchedSkipped} unmatched skipped)`
                : '';
            logDiagnosticEvent({
              level: 'info',
              category: 'storage',
              message: `Merged photos-only archive "${fileName}" (+${photoMerge.photosAdded} added, ${photoMerge.photosUpdated} updated)`,
            });
            notify(
              `Photos archive merged: +${photoMerge.photosAdded} added, ${photoMerge.photosUpdated} updated${skippedMsg}.`
            );
            return;
          }

          if (mode === 'replace') {
            if (currentSnapshot.animals.length > 0) {
              await saveSafetyRollingBackup(currentSnapshot, 'Pre-archive-replace safety snapshot');
            }
            photoCacheRef.current.clear();
            const flagRes = applyImportConflictAttentionFlags(parsed.snapshot.animals);
            const nextSnap: BarnDatabaseSnapshot = {
              ...parsed.snapshot,
              settings: {
                ...parsed.snapshot.settings,
                lastBackupMeta: undefined,
                backupReminderSnoozedUntilMs: undefined,
              },
              animals: flagRes.animals,
            };
            await adapterRef.current!.replaceSnapshot(nextSnap);
            await clearLocalSyncAndBackupReminderState();
            setWipedRecoveryContext(null);
            await reloadFromAdapter();
            if (flagRes.alertMessage) {
              const spNames = Array.from(
                new Set(
                  flagRes.animals
                    .filter((a) => flagRes.conflictedAnimalIds.includes(a.id))
                    .map((a) => a.species)
                )
              );
              setImportConflictAlert({
                message: flagRes.alertMessage,
                speciesNames: spNames,
                conflictedCount: flagRes.conflictedAnimalIds.length,
              });
              logDiagnosticEvent({
                level: 'warn',
                category: 'storage',
                message: flagRes.alertMessage,
              });
            }
            logDiagnosticEvent({
              level: 'info',
              category: 'storage',
              message: `Restored full archive "${fileName}" (${parsed.snapshot.animals.length} animals, ${parsed.photosReconstructed} photos)`,
            });
            notify(
              `Restored ${parsed.snapshot.animals.length} animals & ${parsed.photosReconstructed} photos from ${parsed.sourceFormat.toUpperCase()} backup.${
                flagRes.alertMessage ? ` ${flagRes.alertMessage}` : ''
              }`
            );
          } else {
            const merged = mergeBarnSnapshots(currentSnapshot, parsed.snapshot);
            const importedIds = new Set(parsed.snapshot.animals.map((a) => a.id));
            const flagRes = applyImportConflictAttentionFlags(merged.snapshot.animals, importedIds);
            const nextSnap: BarnDatabaseSnapshot = { ...merged.snapshot, animals: flagRes.animals };
            await adapterRef.current!.replaceSnapshot(nextSnap);
            await reloadFromAdapter();
            if (flagRes.alertMessage) {
              const spNames = Array.from(
                new Set(
                  flagRes.animals
                    .filter((a) => flagRes.conflictedAnimalIds.includes(a.id))
                    .map((a) => a.species)
                )
              );
              setImportConflictAlert({
                message: flagRes.alertMessage,
                speciesNames: spNames,
                conflictedCount: flagRes.conflictedAnimalIds.length,
              });
              logDiagnosticEvent({
                level: 'warn',
                category: 'storage',
                message: flagRes.alertMessage,
              });
            }
            logDiagnosticEvent({
              level: 'info',
              category: 'storage',
              message: `Merged archive "${fileName}" (+${merged.animalsAdded} added, ${merged.photosMerged} photos merged)`,
            });
            notify(
              `Merge complete: +${merged.animalsAdded} added, ${merged.animalsUpdated} updated, ${merged.photosMerged} photos merged.${
                flagRes.alertMessage ? ` ${flagRes.alertMessage}` : ''
              }`
            );
          }
        } catch (err) {
          logDiagnosticEvent({
            level: 'error',
            category: isMemoryLikeError(err) ? 'memory' : 'storage',
            message: `Archive import failed for "${fileName}" (${bytes.byteLength} bytes, mode=${mode})`,
            error: err,
          });
          throw err;
        }
      });
    },
    [
      enqueueStoreMutation,
      saveSafetyRollingBackup,
      clearLocalSyncAndBackupReminderState,
      reloadFromAdapter,
      notify,
    ]
  );

  const importDeltaOperations = useCallback(
    async (incomingOps: SyncOperation[]) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current ?? snapshot;
        if (!currentSnapshot) return;
        try {
          const result = mergeDeltaOperations(
            currentSnapshot,
            syncOperationsRef.current,
            incomingOps,
            deviceId
          );
          if (result.appliedOpCount === 0) {
            notify('Delta sync checked — no new remote operations needed applying.');
            return;
          }
          await adapterRef.current!.replaceSnapshot(result.nextSnapshot);
          await replaceSyncOperationsInIdb(result.mergedOperations);
          rebuildMaxRevIndex(result.mergedOperations);
          syncOperationsRef.current = result.mergedOperations;
          setSyncOperations(result.mergedOperations);
          if (result.newConflicts.length > 0) {
            await appendSyncConflictsToIdb(result.newConflicts);
            setSyncConflicts((prev) => [...result.newConflicts, ...prev]);
          }
          await reloadFromAdapter();
          notify(
            result.newConflicts.length > 0
              ? `Merged ${result.appliedOpCount} field operation(s); ${result.newConflicts.length} field collision(s) logged for review.`
              : `Merged ${result.appliedOpCount} field operation(s) cleanly with zero collisions.`
          );
        } catch (err) {
          reportPersistenceFailure('apply delta sync operations', err);
          throw err;
        }
      });
    },
    [snapshot, deviceId, enqueueStoreMutation, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const resolveSyncConflict = useCallback(
    async (conflictId: string, useSide: 'winning' | 'losing') => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;
        const conflict = syncConflicts.find((c) => c.conflict_id === conflictId);
        if (!conflict) return;

        try {
          const chosenValue = useSide === 'winning' ? conflict.winning_value : conflict.losing_value;
          const op = createOutboxOperation({
            entityType: conflict.entity_type,
            entityUuid: conflict.entity_uuid,
            deviceId,
            logicalCounter: allocateNextLogicalCounter(),
            fieldName: conflict.field_name,
            newValue: chosenValue,
            timestamp: getAdjustedNowIsoUtc(),
            recordRev: nextEntityRev(conflict.entity_uuid),
          });

          const applied = mergeDeltaOperations(
            currentSnapshot,
            syncOperationsRef.current,
            [op],
            deviceId
          );
          await adapterRef.current!.replaceSnapshot(applied.nextSnapshot);
          await replaceSyncOperationsInIdb(applied.mergedOperations);
          rebuildMaxRevIndex(applied.mergedOperations);
          syncOperationsRef.current = applied.mergedOperations;
          setSyncOperations(applied.mergedOperations);

          const resolvedConflict: SyncConflictEntry = { ...conflict, resolved: true };
          await saveSyncConflictInIdb(resolvedConflict);
          setSyncConflicts((prev) =>
            prev.map((c) => (c.conflict_id === conflictId ? resolvedConflict : c))
          );
          await reloadFromAdapter();
          notify(`Applied chosen value for ${conflict.entity_label} (${conflict.field_name}).`);
        } catch (err) {
          reportPersistenceFailure('resolve sync conflict', err);
        }
      });
    },
    [enqueueStoreMutation, syncConflicts, deviceId, nextEntityRev, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const dismissSyncConflict = useCallback(
    async (conflictId: string) => {
      const conflict = syncConflicts.find((c) => c.conflict_id === conflictId);
      if (!conflict) return;
      const resolvedConflict: SyncConflictEntry = { ...conflict, resolved: true };
      await saveSyncConflictInIdb(resolvedConflict);
      setSyncConflicts((prev) =>
        prev.map((c) => (c.conflict_id === conflictId ? resolvedConflict : c))
      );
    },
    [syncConflicts]
  );

  const buildLocalDeltaJsonPayload = useCallback(() => {
    return {
      filename: `delta_${deviceId}.json`,
      content: JSON.stringify(buildDeltaFilePayload(deviceId, syncOperations), null, 2),
    };
  }, [deviceId, syncOperations]);

  const restoreRollingBackupByKey = useCallback(
    async (key: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        try {
          const snap = await loadRollingSnapshotBackup(key);
          if (!snap) {
            notify('Could not load that rolling backup snapshot.');
            return;
          }
          if (currentSnapshot && !wipedRecoveryContext?.detected && currentSnapshot.animals.length > 0) {
            await saveSafetyRollingBackup(currentSnapshot, 'Pre-rolling-restore safety snapshot');
          }
          photoCacheRef.current?.clear();
          const cleanedRollingSnap: BarnDatabaseSnapshot = {
            ...snap,
            settings: {
              ...snap.settings,
              lastBackupMeta: undefined,
              backupReminderSnoozedUntilMs: undefined,
            },
          };
          await adapterRef.current!.replaceSnapshot(cleanedRollingSnap);
          await clearLocalSyncAndBackupReminderState();
          setWipedRecoveryContext(null);
          await reloadFromAdapter();
          notify(`Restored rolling snapshot (${snap.animals.length} animals).`);
        } catch (err) {
          reportPersistenceFailure('restore rolling snapshot', err);
          throw err;
        }
      });
    },
    [
      enqueueStoreMutation,
      wipedRecoveryContext,
      saveSafetyRollingBackup,
      clearLocalSyncAndBackupReminderState,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const saveManualOpfsVaultBackup = useCallback(
    async (note?: string): Promise<VaultBackupMetadata | null> => {
      if (!snapshot) return null;
      try {
        const hydrated = await hydrateSnapshotForExport(snapshot);
        const [, opfsRes, nativeRes] = await Promise.allSettled([
          saveRollingSnapshotBackup(hydrated),
          isOpfsSupported()
            ? saveOpfsVaultBackup(hydrated, {
                kind: 'manual',
                note: note?.trim() || 'Manual snapshot saved to Vault',
              })
            : Promise.resolve(null),
          mirrorSnapshotToNativeVaultIfWrapped(hydrated, 'manual'),
        ]);
        const meta = opfsRes.status === 'fulfilled' ? opfsRes.value : null;
        const mirroredNative = nativeRes.status === 'fulfilled' && nativeRes.value;
        await refreshVaultAndArchives();
        if (mirroredNative) {
          void refreshStorageStatus();
        }
        if (meta) {
          await recordBackupExport('json', meta.fileName);
          notify(
            `Saved snapshot to OPFS Backup Vault (${meta.animalCount} animals, ${meta.photoCount} photos · ${formatByteSizePure(meta.byteSize)}).`
          );
          return meta;
        }
        await recordBackupExport('json', 'rolling-local-snapshot');
        notify(
          mirroredNative
            ? 'Saved snapshot to IndexedDB Rolling Vault and Native Android Backup Vault.'
            : 'Saved snapshot to IndexedDB Rolling Vault (OPFS directory access is unavailable in this browser).'
        );
        return null;
      } catch (err) {
        reportPersistenceFailure('save snapshot to backup vault', err);
        throw err;
      }
    },
    [
      snapshot,
      hydrateSnapshotForExport,
      mirrorSnapshotToNativeVaultIfWrapped,
      refreshVaultAndArchives,
      refreshStorageStatus,
      recordBackupExport,
      notify,
      reportPersistenceFailure,
    ]
  );

  const createAndVerifyPreUpgradeBackup = useCallback(async (): Promise<{
    verified: boolean;
    checksumSha256: string;
    fileName: string;
  } | null> => {
    if (!snapshot) return null;
    try {
      const hydrated = await hydrateSnapshotForExport(snapshot);
      const { jsonText, verification } = buildVerifiedPreUpgradeJsonBackup(
        hydrated,
        CURRENT_APP_VERSION
      );
      const stampSlug = formatTimestampedBackupSlug();
      const fileName = `community-pedigree-pre-upgrade-backup-${stampSlug}.json`;
      await downloadTextFile(fileName, jsonText, 'application/json');
      const mirroredNative = await mirrorSnapshotToNativeVaultIfWrapped(hydrated, 'pre_upgrade');
      if (isOpfsSupported()) {
        await saveOpfsVaultBackup(hydrated, {
          kind: 'pre_upgrade',
          appVersion: CURRENT_APP_VERSION,
          note: `Pre-upgrade verified (${verification.checksumSha256.slice(0, 12)})`,
        }).catch(() => null);
        await refreshVaultAndArchives();
      }
      if (mirroredNative) {
        void refreshStorageStatus();
      }
      await recordBackupExport('json', fileName);
      markPreUpgradeBackupVerified(verification.ok);
      notify(
        `Verified Pre-Upgrade Safety Backup saved (${verification.animalCount} animals · SHA-256 ${verification.checksumSha256.slice(0, 12)}…).`
      );
      return {
        verified: verification.ok,
        checksumSha256: verification.checksumSha256,
        fileName,
      };
    } catch (err) {
      reportPersistenceFailure('create verified pre-upgrade safety backup', err);
      return null;
    }
  }, [
    snapshot,
    hydrateSnapshotForExport,
    mirrorSnapshotToNativeVaultIfWrapped,
    refreshVaultAndArchives,
    refreshStorageStatus,
    recordBackupExport,
    notify,
    reportPersistenceFailure,
  ]);

  const restoreOpfsVaultBackupInternal = useCallback(
    async (key: string) => {
      const currentSnapshot = snapshotRef.current;
      try {
        const loaded = await loadOpfsVaultBackup(key, currentSnapshot?.settings);
        if (!loaded) {
          notify('Could not read or verify that OPFS backup file.');
          return;
        }
        const migrated = loaded.migrated;
        if (currentSnapshot && !wipedRecoveryContext?.detected && currentSnapshot.animals.length > 0) {
          await saveSafetyRollingBackup(currentSnapshot, 'Pre-vault-restore safety snapshot');
        }
        photoCacheRef.current?.clear();
        const cleanedVaultSnap: BarnDatabaseSnapshot = {
          ...migrated.snapshot,
          settings: {
            ...migrated.snapshot.settings,
            lastBackupMeta: undefined,
            backupReminderSnoozedUntilMs: undefined,
          },
        };
        await adapterRef.current!.replaceSnapshot(cleanedVaultSnap);
        await clearLocalSyncAndBackupReminderState();
        setWipedRecoveryContext(null);
        setActiveSpeciesName(migrated.snapshot.settings.defaultSpecies || 'Rabbit');
        await reloadFromAdapter();
        const migNote =
          migrated.migratedFromVersion < migrated.schemaVersion
            ? ` (migrated v${migrated.migratedFromVersion} → v${migrated.schemaVersion})`
            : '';
        notify(
          `Restored ${migrated.snapshot.animals.length} animals & ${(migrated.snapshot.animalPhotos ?? []).length} photos from OPFS Vault${migNote}.`
        );
      } catch (err) {
        reportPersistenceFailure('restore OPFS vault backup', err);
        throw err;
      }
    },
    [
      wipedRecoveryContext,
      saveSafetyRollingBackup,
      clearLocalSyncAndBackupReminderState,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const restoreOpfsVaultBackup = useCallback(
    async (key: string) => {
      return enqueueStoreMutation(() => restoreOpfsVaultBackupInternal(key));
    },
    [enqueueStoreMutation, restoreOpfsVaultBackupInternal]
  );

  const downloadOpfsVaultBackupByKey = useCallback(
    async (key: string) => {
      const res = await readOpfsVaultBackupBlob(key);
      if (!res) {
        notify('Could not read OPFS vault backup file for download.');
        return;
      }
      const matched = opfsVaultBackups.find((b) => b.key === key || b.fileName === key);
      const fileName = matched?.fileName || res.fileName;
      await downloadBlobDirect(fileName, res.blob);
      notify(`Downloaded ${fileName}.`);
    },
    [opfsVaultBackups, notify]
  );

  const deleteOpfsVaultBackupByKey = useCallback(
    async (key: string) => {
      await deleteOpfsVaultBackup(key);
      await refreshVaultAndArchives();
      notify('Removed backup from OPFS Vault.');
    },
    [refreshVaultAndArchives, notify]
  );

  const deleteRollingIdbBackupByKey = useCallback(
    async (key: string) => {
      await deleteRollingSnapshotBackup(key);
      await refreshVaultAndArchives();
      notify('Removed local IndexedDB rolling snapshot.');
    },
    [refreshVaultAndArchives, notify]
  );

  const offloadAnimalsToOpfsArchiveInternal = useCallback(
    async (
      animalIds: string[]
    ): Promise<{
      archivedCount: number;
      stubCount: number;
      removedCount: number;
      fileName: string;
    } | null> => {
      if (animalIds.length === 0) return null;
      if (!isOpfsSupported()) {
        notify(
          'OPFS /archives storage is not available in this browser. Animals remain in the local Archived tab.'
        );
        return null;
      }
      try {
        // Always load the authoritative fresh snapshot from the adapter so immediate
        // post-save offloads (before React re-renders) never read stale state.
        const freshBase = adapterRef.current
          ? await adapterRef.current.loadSnapshot({ lightweightPhotos: true })
          : snapshotRef.current;
        if (!freshBase) return null;
        const hydrated = await hydrateSnapshotForExport(freshBase);
        const built = buildArchivedAnimalsBundle(hydrated, animalIds);
        if (built.indexEntry.animalCount === 0) {
          notify('No eligible active/archived animals selected to offload.');
          return null;
        }
        await saveOpfsHerdArchive(built.indexEntry, built.zipBytes);
        await adapterRef.current!.replaceSnapshot(built.nextActiveSnapshot);
        photoCacheRef.current?.clear();

        const removedSet = new Set(built.removedAnimalIds);
        if (selectedAnimalId && removedSet.has(selectedAnimalId)) setSelectedAnimalId(null);
        if (pedigreeAnimalId && removedSet.has(pedigreeAnimalId)) setPedigreeAnimalId(null);

        await reloadFromAdapter();
        notify(
          `Offloaded ${built.indexEntry.animalCount} animal${built.indexEntry.animalCount === 1 ? '' : 's'} to OPFS /archives (${built.stubAnimalIds.length} retained as Pedigree Reference stub${built.stubAnimalIds.length === 1 ? '' : 's'}).`
        );
        return {
          archivedCount: built.indexEntry.animalCount,
          stubCount: built.stubAnimalIds.length,
          removedCount: built.removedAnimalIds.length,
          fileName: built.fileName,
        };
      } catch (err) {
        reportPersistenceFailure('offload animals to OPFS /archives', err);
        return null;
      }
    },
    [hydrateSnapshotForExport, selectedAnimalId, pedigreeAnimalId, reloadFromAdapter, notify, reportPersistenceFailure]
  );
  offloadAnimalsRef.current = offloadAnimalsToOpfsArchiveInternal;

  const offloadAnimalsToOpfsArchive = useCallback(
    async (animalIds: string[]) => {
      return enqueueStoreMutation(() => offloadAnimalsToOpfsArchiveInternal(animalIds));
    },
    [enqueueStoreMutation, offloadAnimalsToOpfsArchiveInternal]
  );

  const connectBackupSyncFolder = useCallback(async () => {
    try {
      const nextStatus = await configureBackupSyncFolder();
      const flushRes = await flushOpfsBackupsToSyncFolder();
      await refreshVaultAndArchives();
      const syncNote =
        flushRes.pushed > 0
          ? ` Synced ${flushRes.pushed} current vault backup(s) into "${nextStatus.folderName}/pedigree-vault-archive".`
          : '';
      notify(
        `Connected Backup Sync folder "${nextStatus.folderName}". Expiring local backups will copy there automatically before pruning.${syncNote}`
      );
      return nextStatus;
    } catch (err) {
      reportPersistenceFailure('connect Backup Sync folder', err);
      return null;
    }
  }, [refreshVaultAndArchives, notify, reportPersistenceFailure]);

  const reauthorizeBackupSyncFolderAction = useCallback(async () => {
    try {
      const nextStatus = await reauthorizeBackupSyncFolder();
      if (nextStatus.permissionState === 'granted') {
        const flushRes = await flushOpfsBackupsToSyncFolder();
        await refreshVaultAndArchives();
        notify(
          flushRes.pushed > 0
            ? `Re-authorized "${nextStatus.folderName}" and synced ${flushRes.pushed} vault backup(s).`
            : `Re-authorized "${nextStatus.folderName}" for pre-prune vault offload.`
        );
      } else {
        await refreshVaultAndArchives();
        notify('Folder permission was not granted.');
      }
      return nextStatus;
    } catch (err) {
      reportPersistenceFailure('re-authorize Backup Sync folder', err);
      return null;
    }
  }, [refreshVaultAndArchives, notify, reportPersistenceFailure]);

  const disconnectBackupSyncFolderAction = useCallback(async () => {
    try {
      const nextStatus = await disconnectBackupSyncFolder();
      setBackupSyncStatus(nextStatus);
      notify('Disconnected Backup Sync folder.');
    } catch (err) {
      reportPersistenceFailure('disconnect Backup Sync folder', err);
    }
  }, [notify, reportPersistenceFailure]);

  const syncVaultBackupsToSyncNow = useCallback(async () => {
    try {
      const res = await flushOpfsBackupsToSyncFolder();
      await refreshVaultAndArchives();
      if (res.pushed > 0) {
        notify(`Synced ${res.pushed} vault backup(s) to connected Backup Sync folder.`);
      } else if (res.skippedReason === 'permission_required') {
        notify('Backup Sync folder needs re-authorization before syncing.');
      } else if (res.skippedReason === 'not_configured') {
        notify('Connect a Backup Sync folder first.');
      } else {
        notify('Vault backups are already empty or up to date.');
      }
      return res;
    } catch (err) {
      reportPersistenceFailure('sync vault backups to folder', err);
      return { pushed: 0, failed: 0 };
    }
  }, [refreshVaultAndArchives, notify, reportPersistenceFailure]);

  const dismissPruneSyncWarning = useCallback(() => {
    clearOpfsPruneSyncWarning();
    setPruneSyncWarning(null);
  }, []);

  const restoreArchivedHerdBundle = useCallback(
    async (
      archiveKey: string,
      options?: { restoreToActiveStatus?: boolean; deleteArchiveAfterRestore?: boolean }
    ) => {
      return enqueueStoreMutation(async () => {
        const freshBase = adapterRef.current
          ? await adapterRef.current.loadSnapshot({ lightweightPhotos: true })
          : snapshotRef.current;
        if (!freshBase) return;
        try {
          const loaded = await loadOpfsHerdArchive(archiveKey, freshBase.settings);
          if (!loaded) {
            notify('Archived herd bundle could not be loaded or verified.');
            return;
          }
          const merged = mergeRestoredArchiveIntoSnapshot(freshBase, loaded.unpacked, options);
          await adapterRef.current!.replaceSnapshot(merged.nextSnapshot);
          if (options?.deleteArchiveAfterRestore !== false) {
            await deleteOpfsHerdArchive(archiveKey);
          }
          photoCacheRef.current?.clear();
          setWipedRecoveryContext(null);
          await reloadFromAdapter();
          notify(
            `Restored ${merged.restoredAnimalCount} animal(s), ${merged.restoredPhotoCount} photo(s), and ${merged.restoredCareLogCount} care log(s) from OPFS /archives.`
          );
        } catch (err) {
          reportPersistenceFailure('restore archived herd bundle', err);
          throw err;
        }
      });
    },
    [enqueueStoreMutation, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const downloadArchivedHerdBundle = useCallback(
    async (archiveKey: string) => {
      const res = await readOpfsHerdArchiveBlob(archiveKey);
      if (!res) {
        notify('Archived bundle file not found in OPFS /archives.');
        return;
      }
      await downloadBlobDirect(res.fileName, res.blob);
      notify(`Downloaded ${res.fileName}.`);
    },
    [notify]
  );

  const deleteArchivedHerdBundle = useCallback(
    async (archiveKey: string) => {
      return enqueueStoreMutation(async () => {
        try {
          await deleteOpfsHerdArchive(archiveKey);
          const currentSnap = snapshotRef.current;
          if (currentSnap) {
            const ts = getAdjustedNowIsoUtc();
            const staleStubs = currentSnap.animals
              .filter((a) => a.offloadedArchiveKey === archiveKey)
              .map((a) => ({
                ...a,
                offloadedArchiveKey: '',
                offloadedAtIso: '',
                _rev: nextEntityRev(a.id, a._rev),
                updatedAt: ts,
              }));
            if (staleStubs.length > 0) {
              await adapterRef.current!.saveAnimalsBatch(staleStubs);
            }
          }
          await reloadFromAdapter();
          notify('Deleted archive bundle from OPFS /archives.');
        } catch (err) {
          reportPersistenceFailure('delete archived herd bundle', err);
        }
      });
    },
    [enqueueStoreMutation, nextEntityRev, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const restoreLatestOpfsOnWipedRecovery = useCallback(async () => {
    return enqueueStoreMutation(async () => {
      let targetKey = wipedRecoveryContext?.latestOpfsBackup?.key;
      if (!targetKey) {
        const list = await listOpfsVaultBackups();
        targetKey = list[0]?.key;
      }
      if (!targetKey) {
        notify('No OPFS vault backup found to restore.');
        return;
      }
      await restoreOpfsVaultBackupInternal(targetKey);
    });
  }, [enqueueStoreMutation, wipedRecoveryContext, restoreOpfsVaultBackupInternal, notify]);

  const startFreshAfterWipedRecovery = useCallback(async () => {
    return enqueueStoreMutation(async () => {
      try {
        clearPriorUseSentinel();
        photoCacheRef.current?.clear();
        const adapter = adapterRef.current!;
        const fresh = adapter.rebuildCleanDatabase
          ? await adapter.rebuildCleanDatabase({ lightweightPhotos: true, allowSeedFresh: true })
          : await adapter.initialize({ lightweightPhotos: true, allowSeedFresh: true });
        await clearLocalSyncAndBackupReminderState();
        snapshotRef.current = fresh;
        setSnapshot(fresh);
        setWipedRecoveryContext(null);
        setSelectedAnimalId(null);
        setPedigreeAnimalId(null);
        setActiveSpeciesName(fresh.settings.defaultSpecies || 'Rabbit');
        setRoute('home');
        await refreshVaultAndArchives();
        notify(`Initialized fresh starter herds (${fresh.animals.length} sample animals).`);
      } catch (err) {
        reportPersistenceFailure('start fresh starter herds', err);
      }
    });
  }, [
    enqueueStoreMutation,
    clearLocalSyncAndBackupReminderState,
    refreshVaultAndArchives,
    notify,
    reportPersistenceFailure,
  ]);

  const applyPlatformImportPreview = useCallback(
    async (
      preview: PlatformImportPreview,
      optimizedPhotos: AnimalPhoto[] = [],
      conflictSelections: ConflictSelectionMap = {}
    ) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        if (!currentSnapshot) return;

        try {
          const resolvedAnimals = resolveAnimalsWithConflictChoices(
            preview.animals,
            currentSnapshot,
            conflictSelections
          );

          let localAdjustedSnapshot = currentSnapshot;
          let incomingSpeciesProfiles = preview.newSpeciesProfiles;
          if (preview.newSpeciesProfiles.length > 0) {
            const ts = getAdjustedNowIsoUtc();
            const offset = preview.newSpeciesProfiles.length;
            incomingSpeciesProfiles = preview.newSpeciesProfiles.map((sp, idx) => ({
              ...sp,
              sortOrder: idx,
              updatedAt: ts,
            }));
            localAdjustedSnapshot = {
              ...currentSnapshot,
              speciesProfiles: currentSnapshot.speciesProfiles.map((sp, idx) => ({
                ...sp,
                sortOrder: idx + offset,
              })),
            };
          }

          const incoming: BarnDatabaseSnapshot = {
            settings: localAdjustedSnapshot.settings,
            speciesProfiles: incomingSpeciesProfiles,
            animals: resolvedAnimals,
            animalPhotos: optimizedPhotos,
            cages: preview.cages,
            breedings: preview.breedings,
            tasks: preview.tasks,
            careLogs: preview.careLogs,
            shows: preview.shows,
            feedBatches: [],
            feedAllocations: [],
            ledgerEntries: [],
            processingLogs: [],
            youthProjectBooks: [],
            clientContacts: [],
            waitlistEntries: [],
            animalReservations: [],
            woolHarvests: [],
          };
          const merged = mergeBarnSnapshots(localAdjustedSnapshot, incoming);
          const importedIds = new Set(resolvedAnimals.map((a) => a.id));
          const flagRes = applyImportConflictAttentionFlags(merged.snapshot.animals, importedIds);
          const finalSnapshot: BarnDatabaseSnapshot = {
            ...merged.snapshot,
            animals: flagRes.animals,
          };
          await adapterRef.current!.replaceSnapshot(finalSnapshot);
          await reloadFromAdapter();
          if (flagRes.alertMessage) {
            const spNames = Array.from(
              new Set(
                flagRes.animals
                  .filter((a) => flagRes.conflictedAnimalIds.includes(a.id))
                  .map((a) => a.species)
              )
            );
            setImportConflictAlert({
              message: flagRes.alertMessage,
              speciesNames: spNames,
              conflictedCount: flagRes.conflictedAnimalIds.length,
            });
            logDiagnosticEvent({
              level: 'warn',
              category: 'storage',
              message: `${preview.platformName} import conflict alert: ${flagRes.alertMessage}`,
            });
          }
          if (preview.speciesDetected.length === 1) {
            setActiveSpeciesName(preview.speciesDetected[0]);
          } else if (preview.newSpeciesProfiles.length > 0) {
            setActiveSpeciesName(preview.newSpeciesProfiles[0].name);
          }
          const origPhotoBytes = optimizedPhotos.reduce((acc, p) => acc + p.originalBytes, 0);
          const storedPhotoBytes = optimizedPhotos.reduce((acc, p) => acc + p.storedBytes, 0);
          const photoSummary =
            optimizedPhotos.length > 0
              ? `, ${optimizedPhotos.length} optimized photos (${formatByteSizePure(
                  origPhotoBytes
                )} → ${formatByteSizePure(storedPhotoBytes)})`
              : '';
          const newSpSummary =
            preview.newSpeciesProfiles.length > 0
              ? `, +${preview.newSpeciesProfiles.length} custom species (${preview.newSpeciesProfiles
                  .map((s) => s.name)
                  .join(', ')})`
              : '';
          notify(
            `${preview.platformName} import complete: ${resolvedAnimals.length} animals (${preview.parentLinksResolved} parent links), ${preview.breedings.length} breedings, ${preview.careLogs.length} logs${photoSummary}${newSpSummary}.${
              flagRes.alertMessage ? ` ${flagRes.alertMessage}` : ''
            }`
          );
        } catch (err) {
          reportPersistenceFailure(`import ${preview.platformName} data`, err);
          throw err;
        }
      });
    },
    [enqueueStoreMutation, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const exportSqliteBytes = useCallback(async () => {
    return adapterRef.current!.exportRawSqliteBytes();
  }, []);

  const inspectSqliteRestoreBytes = useCallback(
    async (bytes: Uint8Array, fileName = 'backup.sqlite'): Promise<PreRestoreArchiveInspection> => {
      const adapter = adapterRef.current!;
      if (!adapter.inspectRawSqliteBytes) {
        throw new Error('SQLite inspection is unavailable in this browser.');
      }
      const incomingSnap = await adapter.inspectRawSqliteBytes(bytes, { lightweightPhotos: true });
      const baseSnap = snapshotRef.current ?? snapshot ?? incomingSnap;
      return inspectSnapshotBeforeRestorePure(incomingSnap, baseSnap, {
        fileName,
        sourceFormat: 'sqlite',
      });
    },
    [snapshot]
  );

  const importSqliteBytes = useCallback(
    async (bytes: Uint8Array) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        try {
          if (currentSnapshot && currentSnapshot.animals.length > 0) {
            await saveSafetyRollingBackup(currentSnapshot, 'Pre-SQLite-import safety snapshot');
          }
          photoCacheRef.current.clear();
          const snap = await adapterRef.current!.importRawSqliteBytes(bytes, {
            lightweightPhotos: true,
          });
          if (snap.settings.lastBackupMeta || snap.settings.backupReminderSnoozedUntilMs) {
            const cleanedSettings = {
              ...snap.settings,
              lastBackupMeta: undefined,
              backupReminderSnoozedUntilMs: undefined,
            };
            await adapterRef.current!.saveSettings(cleanedSettings);
            snap.settings = cleanedSettings;
          }
          await clearLocalSyncAndBackupReminderState();
          snapshotRef.current = snap;
          setSnapshot(snap);
          setWipedRecoveryContext(null);
          void refreshStorageStatus();
          void refreshVaultAndArchives();
          notify(
            `Loaded SQLite database (${snap.animals.length} animals, ${(snap.animalPhotos ?? []).length} photos).`
          );
        } catch (err) {
          reportPersistenceFailure('load SQLite database file', err);
          throw err;
        }
      });
    },
    [
      enqueueStoreMutation,
      saveSafetyRollingBackup,
      clearLocalSyncAndBackupReminderState,
      refreshStorageStatus,
      refreshVaultAndArchives,
      notify,
      reportPersistenceFailure,
    ]
  );

  const analyzePhotoStorageFootprint = useCallback(
    async (presetId?: ImageOptimizationPresetId): Promise<PhotoStorageFootprintReport | null> => {
      const base = snapshotRef.current ?? snapshot;
      if (!base) return null;
      const missingIds = (base.animalPhotos ?? [])
        .filter((p) => !p.dataUrl && (!p.storedBytes || p.storedBytes <= 0))
        .map((p) => p.id);
      let scanSnapshot = base;
      if (missingIds.length > 0 && adapterRef.current?.loadAnimalPhotoDataUrlsBatch) {
        const fetched = await adapterRef.current.loadAnimalPhotoDataUrlsBatch(missingIds);
        scanSnapshot = {
          ...base,
          animalPhotos: (base.animalPhotos ?? []).map((p) =>
            !p.dataUrl && fetched[p.id] ? { ...p, dataUrl: fetched[p.id] } : p
          ),
        };
      }
      return analyzePhotoStorageFootprintPure(
        scanSnapshot,
        presetId ?? scanSnapshot.settings.imageOptimizationPreset
      );
    },
    [snapshot]
  );

  const pruneOrphanAnimalPhotos = useCallback(async (): Promise<{
    removedCount: number;
    reclaimedBytes: number;
  }> => {
    return enqueueStoreMutation(async () => {
      const base = snapshotRef.current ?? snapshot;
      if (!base) return { removedCount: 0, reclaimedBytes: 0 };
      const preCheck = removeOrphanPhotosFromSnapshotPure(base);
      if (preCheck.removedCount === 0) {
        notify('Photo check finished — zero orphan attachments found.');
        return { removedCount: 0, reclaimedBytes: 0 };
      }
      const hydrated = await hydrateSnapshotForExport(base);
      const res = removeOrphanPhotosFromSnapshotPure(hydrated);
      if (res.removedCount === 0) {
        notify('Photo check finished — zero orphan attachments found.');
        return { removedCount: 0, reclaimedBytes: 0 };
      }
      await saveSafetyRollingBackup(hydrated, 'Pre-orphan-photo-prune safety snapshot');
      await adapterRef.current!.replaceSnapshot(res.nextSnapshot);
      for (const id of res.removedPhotoIds) {
        photoCacheRef.current.delete(id);
      }
      await reloadFromAdapter();
      void refreshStorageStatus();
      notify(
        `Removed ${res.removedCount} orphan photo(s), reclaiming ${formatByteSizePure(res.reclaimedBytes)}.`
      );
      return { removedCount: res.removedCount, reclaimedBytes: res.reclaimedBytes };
    });
  }, [snapshot, enqueueStoreMutation, hydrateSnapshotForExport, saveSafetyRollingBackup, reloadFromAdapter, refreshStorageStatus, notify]);

  const reoptimizeOversizedAnimalPhotos = useCallback(
    async (
      presetId?: ImageOptimizationPresetId
    ): Promise<{ updatedCount: number; oversizedFound: number; reclaimedBytes: number }> => {
      return enqueueStoreMutation(async () => {
        const base = snapshotRef.current ?? snapshot;
        if (!base) return { updatedCount: 0, oversizedFound: 0, reclaimedBytes: 0 };
        const targetPreset = presetId ?? base.settings.imageOptimizationPreset ?? 'balanced';
        const preReport = analyzePhotoStorageFootprintPure(base, targetPreset);
        if (preReport.oversizedPhotoIds.length === 0) {
          notify('All animal photos already fit cleanly inside the active optimization preset.');
          return { updatedCount: 0, oversizedFound: 0, reclaimedBytes: 0 };
        }
        const hydrated = await hydrateSnapshotForExport(base);
        const report = analyzePhotoStorageFootprintPure(hydrated, targetPreset);
        if (report.oversizedPhotoIds.length === 0) {
          notify('All animal photos already fit cleanly inside the active optimization preset.');
          return { updatedCount: 0, oversizedFound: 0, reclaimedBytes: 0 };
        }
        const oversizedSet = new Set(report.oversizedPhotoIds);
        const updatedPhotos: AnimalPhoto[] = [];
        let reclaimedBytes = 0;

        for (const photo of hydrated.animalPhotos ?? []) {
          if (!oversizedSet.has(photo.id)) continue;
          const res = await reoptimizeAnimalPhotoRecord(photo, targetPreset);
          if (res.updated && res.reclaimedBytes > 0) {
            const rev = nextEntityRev(photo.id, photo._rev);
            const nextRec: AnimalPhoto = {
              ...res.photo,
              _rev: rev,
              updatedAt: getAdjustedNowIsoUtc(),
            };
            updatedPhotos.push(nextRec);
            reclaimedBytes += res.reclaimedBytes;
          }
        }

        if (updatedPhotos.length === 0) {
          notify('Checked oversized photos — existing encodings are already smaller than re-encoding.');
          return {
            updatedCount: 0,
            oversizedFound: report.oversizedPhotoIds.length,
            reclaimedBytes: 0,
          };
        }

        await saveSafetyRollingBackup(hydrated, 'Pre-photo-reoptimization safety snapshot');
        await adapterRef.current!.saveAnimalPhotosBatch(updatedPhotos);
        for (const p of updatedPhotos) {
          photoCacheRef.current.set(p.id, p.dataUrl);
        }
        await reloadFromAdapter();
        void refreshStorageStatus();
        notify(
          `Re-optimized ${updatedPhotos.length} oversized photo(s), reclaiming ${formatByteSizePure(reclaimedBytes)}.`
        );
        return {
          updatedCount: updatedPhotos.length,
          oversizedFound: report.oversizedPhotoIds.length,
          reclaimedBytes,
        };
      });
    },
    [snapshot, enqueueStoreMutation, hydrateSnapshotForExport, nextEntityRev, saveSafetyRollingBackup, reloadFromAdapter, refreshStorageStatus, notify]
  );

  const pruneFullResPhotoPayloadsKeepingThumbnails = useCallback(async (): Promise<{
    prunedCount: number;
    reclaimedBytes: number;
  }> => {
    return enqueueStoreMutation(async () => {
      const base = snapshotRef.current ?? snapshot;
      if (!base) return { prunedCount: 0, reclaimedBytes: 0 };
      const preReport = analyzePhotoStorageFootprintPure(base);
      if (preReport.fullResPrunableIds.length === 0) {
        notify('No full-resolution photo payloads needed compacting.');
        return { prunedCount: 0, reclaimedBytes: 0 };
      }
      const hydrated = await hydrateSnapshotForExport(base);
      const res = pruneFullResPayloadsFromSnapshotPure(
        hydrated,
        undefined,
        getAdjustedNowIsoUtc()
      );
      if (res.prunedCount === 0) {
        notify('No full-resolution photo payloads needed compacting.');
        return { prunedCount: 0, reclaimedBytes: 0 };
      }
      await saveSafetyRollingBackup(hydrated, 'Pre-fullres-photo-prune safety snapshot');
      await adapterRef.current!.saveAnimalPhotosBatch(res.updatedPhotos);
      for (const p of res.updatedPhotos) {
        photoCacheRef.current.delete(p.id);
      }
      await reloadFromAdapter();
      void refreshStorageStatus();
      notify(
        `Compacted ${res.prunedCount} photo(s) to lightweight thumbnails, reclaiming ${formatByteSizePure(res.reclaimedBytes)}.`
      );
      return { prunedCount: res.prunedCount, reclaimedBytes: res.reclaimedBytes };
    });
  }, [snapshot, enqueueStoreMutation, hydrateSnapshotForExport, saveSafetyRollingBackup, reloadFromAdapter, refreshStorageStatus, notify]);

  const scanDatabaseHealth = useCallback((): BarnHealthReport | null => {
    if (!snapshot) return null;
    return analyzeBarnDataHealth(snapshot);
  }, [snapshot]);

  const runHealthCheckAndRepair = useCallback(async (): Promise<BarnHealthRepairResult | null> => {
    return enqueueStoreMutation(async () => {
      const currentSnapshot = snapshotRef.current;
      if (!currentSnapshot) return null;
      try {
        await saveSafetyRollingBackup(currentSnapshot);
        const result = repairBarnDataHealth(currentSnapshot);
        if (result.repairsApplied.length > 0) {
          await adapterRef.current!.replaceSnapshot(result.nextSnapshot);
          await reloadFromAdapter();
          logDiagnosticEvent({
            level: 'info',
            category: 'storage',
            message: `Database self-repair completed (${result.repairsApplied.length} repair(s) applied, 0 records deleted)`,
            details: result.repairsApplied,
          });
          notify(
            `Database health repair complete (${result.repairsApplied.length} fix(es) applied safely with zero data loss).`
          );
        } else {
          notify('Database health scan finished — no structural issues needed repair.');
        }
        return result;
      } catch (err) {
        reportPersistenceFailure('repair database health', err);
        throw err;
      }
    });
  }, [enqueueStoreMutation, saveSafetyRollingBackup, reloadFromAdapter, notify, reportPersistenceFailure]);

  const resetDatabaseConnection = useCallback(async () => {
    return enqueueStoreMutation(async () => {
      try {
        const adapter = adapterRef.current!;
        photoCacheRef.current.clear();
        const fresh = adapter.resetConnection
          ? await adapter.resetConnection({ lightweightPhotos: true })
          : await adapter.initialize({ lightweightPhotos: true });
        snapshotRef.current = fresh;
        setSnapshot(fresh);
        void refreshStorageStatus();
        logDiagnosticEvent({
          level: 'info',
          category: 'storage',
          message: `Reset local database connection (${adapter.engineName}: ${fresh.animals.length} animals intact)`,
        });
        notify(
          `Local database connection reset (${fresh.animals.length} animals & ${
            (fresh.animalPhotos ?? []).length
          } photos intact).`
        );
      } catch (err) {
        reportPersistenceFailure('reset database connection', err);
      }
    });
  }, [enqueueStoreMutation, refreshStorageStatus, notify, reportPersistenceFailure]);

  const purgeCorruptedCachesAndRecover = useCallback(
    async (options: { downloadBackupFirst: boolean; rebuildLocalDb: boolean }) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const adapter = adapterRef.current!;
        let backupFilename: string | null = null;

        if (options.downloadBackupFirst && currentSnapshot) {
          try {
            const hydrated = await hydrateSnapshotForExport(currentSnapshot);
            const zip = await buildCompleteBackupZipToOpfsTmpOffThread(hydrated);
            backupFilename = `pedigree-recovery-backup-${formatTimestampedBackupSlug()}.zip`;
            await downloadTempOpfsExport(backupFilename, zip, 'application/zip');
          } catch (err) {
            logDiagnosticEvent({
              level: 'error',
              category: isMemoryLikeError(err) ? 'memory' : 'storage',
              message: 'Pre-recovery backup download failed before cache purge',
              error: err,
            });
          }
        }

        const { cachesCleared, serviceWorkersUnregistered } = await purgeStaleBrowserCaches();

        photoCacheRef.current.clear();
        const fresh =
          options.rebuildLocalDb && adapter.rebuildCleanDatabase
            ? await adapter.rebuildCleanDatabase({ lightweightPhotos: true })
            : adapter.resetConnection
            ? await adapter.resetConnection({ lightweightPhotos: true })
            : await adapter.initialize({ lightweightPhotos: true });

        snapshotRef.current = fresh;
        setSnapshot(fresh);
        if (options.rebuildLocalDb) {
          setSelectedAnimalId(null);
          setPedigreeAnimalId(null);
        }
        void refreshStorageStatus();

        logDiagnosticEvent({
          level: 'info',
          category: 'storage',
          message: `Cache recovery executed (cachesCleared=${cachesCleared}, swUnregistered=${serviceWorkersUnregistered}, rebuildDb=${options.rebuildLocalDb}, backup="${
            backupFilename || 'none'
          }")`,
        });

        const backupNote = backupFilename ? ` Retained backup: ${backupFilename}.` : '';
        notify(
          options.rebuildLocalDb
            ? `Purged caches (${cachesCleared}) and rebuilt local DB cleanly.${backupNote} You can re-import your backup anytime via Restore (.ZIP).`
            : `Purged ${cachesCleared} browser cache(s) & ${serviceWorkersUnregistered} service worker(s) and reset DB connection (${fresh.animals.length} animals intact).${backupNote}`
        );
        return { cachesCleared, serviceWorkersUnregistered, backupFilename };
      });
    },
    [enqueueStoreMutation, hydrateSnapshotForExport, refreshStorageStatus, notify]
  );

  const handleSetPedigreeGenerations = useCallback(
    (gen: PedigreeGenerationDepth) => {
      setPedigreeGenerations(gen);
      if (snapshot && gen <= 6) {
        const persistedDepth = normalizeDefaultPedigreeGenerations(gen);
        if (snapshot.settings.defaultGenerations !== persistedDepth) {
          void updateSettings({ defaultGenerations: persistedDepth }, { silent: true });
        }
      }
    },
    [snapshot, updateSettings]
  );

  return {
    deviceId,
    isLoading,
    engineName: adapterRef.current?.engineName ?? 'SQLite WASM + IndexedDB',
    snapshot,
    activeSpeciesName,
    activeSpeciesData,
    backupStatus,
    recordBackupExport,
    snoozeBackupReminder,
    route,
    setRoute,
    selectSpeciesWorkspace,
    selectedAnimalId,
    setSelectedAnimalId,
    pedigreeAnimalId,
    setPedigreeAnimalId,
    pedigreeGenerations,
    setPedigreeGenerations: handleSetPedigreeGenerations,
    statusMessage,
    clearStatusMessage: () => setStatusMessage(null),
    errorMessage,
    clearErrorMessage: () => setErrorMessage(null),
    importConflictAlert,
    dismissImportConflictAlert: () => setImportConflictAlert(null),
    requestedHerdConflictNonce,
    locateConflictsInHerd: (speciesName?: string) => {
      if (speciesName) {
        setActiveSpeciesName(speciesName);
      }
      setSelectedAnimalId(null);
      setRequestedHerdConflictNonce((n) => n + 1);
      setRoute('herd');
    },
    storageStatus,
    refreshStorageStatus,
    triggerPersistentStorageRequest,
    opfsSupported,
    opfsVaultBackups,
    rollingBackups,
    archivedHerdBundles,
    refreshVaultAndArchives,
    saveManualOpfsVaultBackup,
    createAndVerifyPreUpgradeBackup,
    restoreOpfsVaultBackup,
    downloadOpfsVaultBackupByKey,
    deleteOpfsVaultBackupByKey,
    deleteRollingIdbBackupByKey,
    offloadAnimalsToOpfsArchive,
    restoreArchivedHerdBundle,
    downloadArchivedHerdBundle,
    deleteArchivedHerdBundle,
    wipedRecoveryContext,
    restoreLatestOpfsOnWipedRecovery,
    startFreshAfterWipedRecovery,
    exportCanaryWarning,
    dismissExportCanaryWarning: () => setExportCanaryWarning(null),
    backupSyncStatus,
    pruneSyncWarning,
    connectBackupSyncFolder,
    reauthorizeBackupSyncFolder: reauthorizeBackupSyncFolderAction,
    disconnectBackupSyncFolder: disconnectBackupSyncFolderAction,
    syncVaultBackupsToSyncNow,
    dismissPruneSyncWarning,
    syncOperations,
    syncConflicts,
    buildLocalDeltaJsonPayload,
    importDeltaOperations,
    resolveSyncConflict,
    dismissSyncConflict,
    restoreRollingBackupByKey,
    openAddSpeciesInSettings,
    setOpenAddSpeciesInSettings,
    updateSettings,
    ignoreTaskAlertsPermanently,
    clearTaskAlertGroup,
    dismissSpeciesMemoAlert,
    togglePinSpeciesLanding,
    saveSpeciesProfile,
    updateSpeciesTargetWeightCurve,
    saveSpeciesMemo,
    preselectedGrowthAnimalIds,
    setPreselectedGrowthAnimalIds,
    openGrowthCompareForAnimals: (animalIds: string[]) => {
      setPreselectedGrowthAnimalIds(animalIds.length > 0 ? animalIds : null);
      setRoute('breeding');
    },
    reorderSpeciesCards,
    moveSpeciesCard,
    reorderSpeciesHubBlocks,
    moveSpeciesHubBlock,
    deleteSpeciesProfile,
    exportTimestampedSpeciesBackup,
    saveAnimal,
    ignoreAnimalConflicts,
    restoreAnimalConflictAlert,
    archiveAnimals,
    deleteAnimalsBatch,
    migrateAnimalsSpecies,
    addOptimizedAnimalPhotos,
    loadAnimalPhotoDataUrl,
    loadAnimalPhotoDataUrlsBatch,
    hydrateSnapshotForExport,
    loadPedigreeNeighborhood,
    checkPedigreeBranchesHaveAncestors,
    setPrimaryAnimalPhoto,
    updateAnimalPhotoCaption,
    deleteAnimalPhoto,
    deleteAnimal,
    saveCage,
    deleteCage,
    assignAnimalToCage,
    logBreedingWithCascade,
    updateBreedingOutcome,
    recalculateBreedingPostBirthTasks,
    completeBreedingTaskWithOutcome,
    deleteBreeding,
    saveTask,
    exportTasksToCalendar,
    copyTaskAppLink,
    highlightedTaskId,
    setHighlightedTaskId,
    highlightedCageId,
    setHighlightedCageId,
    googleUserEmail,
    googleAuthConnected,
    googleCalendars,
    googleSyncBusy,
    pendingCalendarSync,
    connectGoogleCalendar,
    disconnectGoogleCalendar,
    refreshGoogleCalendars,
    confirmGoogleCalendarSync,
    fallbackPendingCalendarSyncToIcs,
    cancelPendingCalendarSync,
    toggleTaskCompleted,
    deleteTask,
    addCareLog,
    commitBarnBenchEntry,
    deleteCareLog,
    saveShow,
    deleteShow,
    saveFeedBatch,
    deleteFeedBatch,
    logFeedAllocation,
    deleteFeedAllocation,
    runFeedTagBiosecurityAutoPurge,
    saveLedgerEntry,
    deleteLedgerEntry,
    saveProcessingLog,
    deleteProcessingLog,
    saveYouthProjectBook,
    deleteYouthProjectBook,
    saveClientContact,
    deleteClientContact,
    saveWaitlistEntry,
    deleteWaitlistEntry,
    saveAnimalReservation,
    deleteAnimalReservation,
    completeReservationSale,
    createCrmReminderTask,
    saveWoolHarvest,
    deleteWoolHarvest,
    seedSpeciesSampleData,
    seedAllPredefinedSpecies,
    deleteSpeciesTestingData,
    deleteSpeciesNonTestingData,
    deleteAllSpeciesRecords,
    clearAllRecordsKeepSpecies,
    restoreFactoryDefaults,
    importJsonBackup,
    importBackupArchiveBytes,
    applyPlatformImportPreview,
    exportSqliteBytes,
    inspectSqliteRestoreBytes,
    importSqliteBytes,
    analyzePhotoStorageFootprint,
    pruneOrphanAnimalPhotos,
    reoptimizeOversizedAnimalPhotos,
    pruneFullResPhotoPayloadsKeepingThumbnails,
    scanDatabaseHealth,
    runHealthCheckAndRepair,
    resetDatabaseConnection,
    purgeCorruptedCachesAndRecover,
    purgeOpfsTempWorkspace,
    clearLocalSyncAndBackupReminderState,
  };
}
```

## `src/native/pedigreeBridge.test.ts`

```typescript
/**
 * Community Pedigree — Native Bridge Unit Tests
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ANDROID_ASSET_ORIGIN, createPedigreeBridge, PedigreeBridge } from './pedigreeBridge';

interface MockAnchor {
  href: string;
  target: string;
  rel: string;
  download: string;
  style: { display: string };
  click: ReturnType<typeof vi.fn>;
}

function setupMockDom(origin = 'https://appassets.androidplatform.net') {
  const createdAnchors: MockAnchor[] = [];
  const win: Record<string, unknown> = {
    location: {
      origin: origin,
      href: origin + '/',
    },
    print: vi.fn(),
  };

  const doc = {
    body: {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    },
    createElement: vi.fn((tag: string) => {
      const anchor: MockAnchor = {
        href: '',
        target: '',
        rel: '',
        download: '',
        style: { display: '' },
        click: vi.fn(),
      };
      if (tag === 'a') {
        createdAnchors.push(anchor);
      }
      return anchor;
    }),
  };

  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);

  return { win, doc, createdAnchors };
}

describe('PedigreeBridge', () => {
  let bridge: PedigreeBridge;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (bridge) {
      bridge.destroy();
    }
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('platform detection and browser fallbacks', () => {
    it('detects standard web browser when no native handler exists', () => {
      setupMockDom('https://askkim.github.io');
      bridge = createPedigreeBridge();

      expect(bridge.getPlatform()).toBe('web');
      expect(bridge.isNativeWrapper()).toBe(false);
      expect(bridge.openNativeDevPanel()).toBe(false);
      expect(bridge.openDevPanel()).toBe(false);
    });

    it('resolves getNativeContainerInfo immediately to null in standard browser', async () => {
      setupMockDom('https://askkim.github.io');
      bridge = createPedigreeBridge();

      const info = await bridge.getNativeContainerInfo(400);
      expect(info).toBeNull();
    });

    it('falls back to window.print() in standard browser', () => {
      const { win } = setupMockDom('https://askkim.github.io');
      bridge = createPedigreeBridge();

      expect(bridge.requestPrint()).toBe(true);
      expect(win.print).toHaveBeenCalledTimes(1);
    });

    it('falls back to Blob download for binary exports in standard browser', async () => {
      const { createdAnchors } = setupMockDom('https://askkim.github.io');
      const createObjectURL = vi.fn(() => 'blob:mock-backup');
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', class extends URL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = revokeObjectURL;
      });
      vi.stubGlobal('navigator', {});

      bridge = createPedigreeBridge();
      const payload = new Uint8Array([1, 2, 3, 4]);
      const result = await bridge.exportOrShareBinary({
        filename: 'barn-backup.zip',
        mimeType: 'application/zip',
        mode: 'save',
        bytes: payload,
      });

      expect(result).toEqual({ ok: true, handledBy: 'web-download' });
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(createdAnchors[0].download).toBe('barn-backup.zip');
      expect(createdAnchors[0].click).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(10000);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-backup');
    });

    it('revokes pending blob URLs and clears listeners on destroy()', async () => {
      setupMockDom('https://askkim.github.io');
      const createObjectURL = vi.fn(() => 'blob:pending-cleanup');
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', class extends URL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = revokeObjectURL;
      });
      vi.stubGlobal('navigator', {});

      bridge = createPedigreeBridge();
      await bridge.exportOrShareBinary({
        filename: 'pending.zip',
        mimeType: 'application/zip',
        mode: 'save',
        bytes: new Uint8Array([1, 2]),
      });

      bridge.destroy();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:pending-cleanup');
    });

    it('returns false for syncBackupSnapshotToNative in standard browser', async () => {
      setupMockDom('https://askkim.github.io');
      bridge = createPedigreeBridge();

      const ok = await bridge.syncBackupSnapshotToNative({
        snapshotId: 'web_noop',
        createdAt: '2026-11-19T15:00:00.000Z',
        format: 'json',
        bytes: new Uint8Array([123, 125]),
      });
      expect(ok).toBe(false);
    });
  });

  describe('openExternalUrl security validation', () => {
    it('permits https: and mailto: URLs and rejects unsafe schemes', () => {
      const { win, createdAnchors } = setupMockDom('https://askkim.github.io');
      bridge = createPedigreeBridge();

      expect(bridge.openExternalUrl('https://github.com/AskKim/Pedigree', 'repo')).toBe(true);
      expect(createdAnchors[0].href).toBe('https://github.com/AskKim/Pedigree');
      expect(createdAnchors[0].rel).toBe('noopener noreferrer');

      expect(bridge.openExternalUrl('mailto:support@example.org?subject=Diagnostics', 'support')).toBe(true);
      expect((win.location as { href: string }).href).toBe('mailto:support@example.org?subject=Diagnostics');

      expect(bridge.openExternalUrl('http://insecure.example.com')).toBe(false);
      expect(bridge.openExternalUrl('file:///etc/passwd')).toBe(false);
      expect(bridge.openExternalUrl('javascript:alert(1)')).toBe(false);
      expect(bridge.openExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(bridge.openExternalUrl('not a valid url')).toBe(false);
      expect(bridge.getDiagnosticEvents().length).toBe(5);
    });
  });

  describe('Android WebMessageListener serialization and replies', () => {
    function setupAndroidMock(origin = ANDROID_ASSET_ORIGIN) {
      const { win } = setupMockDom(origin);
      const posted: Array<string | ArrayBuffer> = [];
      let listener: ((event: { data: unknown; origin?: string }) => void) | null = null;

      const pedigreeNative = {
        postMessage: vi.fn((msg: string | ArrayBuffer) => {
          posted.push(msg);
        }),
        addEventListener: vi.fn((type: string, cb: (event: { data: unknown; origin?: string }) => void) => {
          if (type === 'message') {
            listener = cb;
          }
        }),
        removeEventListener: vi.fn(),
      };

      win.pedigreeNative = pedigreeNative;
      return {
        win,
        pedigreeNative,
        posted,
        emitNativeMessage: (data: unknown, msgOrigin = origin) => {
          if (listener) {
            listener({ data, origin: msgOrigin });
          }
        },
      };
    }

    it('streams BEGIN_BINARY_TRANSFER JSON metadata followed by sliced ArrayBuffer', async () => {
      const { posted } = setupAndroidMock();
      bridge = createPedigreeBridge();

      expect(bridge.getPlatform()).toBe('android');
      expect(bridge.isNativeWrapper()).toBe(true);

      const backing = new Uint8Array([9, 10, 11, 12, 13, 14]);
      const view = backing.subarray(1, 5); // [10, 11, 12, 13]

      const result = await bridge.exportOrShareBinary({
        filename: 'pedigree.pdf',
        mimeType: 'application/pdf',
        mode: 'share',
        bytes: view,
      });

      expect(result).toEqual({ ok: true, handledBy: 'android' });
      expect(posted).toHaveLength(2);

      const meta = JSON.parse(posted[0] as string);
      expect(meta.type).toBe('BEGIN_BINARY_TRANSFER');
      expect(meta.payload).toEqual({
        filename: 'pedigree.pdf',
        mimeType: 'application/pdf',
        mode: 'share',
        byteLength: 4,
      });

      expect(posted[1]).toBeInstanceOf(ArrayBuffer);
      expect(Array.from(new Uint8Array(posted[1] as ArrayBuffer))).toEqual([10, 11, 12, 13]);
    });

    it('executes back handlers by priority and LIFO, returning handled: false at root', async () => {
      const { posted, emitNativeMessage } = setupAndroidMock();
      bridge = createPedigreeBridge();

      const callOrder: string[] = [];
      const unregisterRoute = bridge.registerBackHandler(() => {
        callOrder.push('route');
        return true;
      }, 0);

      const unregisterModal = bridge.registerBackHandler(() => {
        callOrder.push('modal');
        return true;
      }, 10);

      emitNativeMessage(JSON.stringify({ type: 'NATIVE_BACK', requestId: 'req_1' }));
      await Promise.resolve();
      await Promise.resolve();

      expect(callOrder).toEqual(['modal']);
      expect(JSON.parse(posted[0] as string)).toEqual({
        type: 'NATIVE_BACK_RESULT',
        requestId: 'req_1',
        payload: { handled: true },
      });

      unregisterModal();
      unregisterRoute();

      emitNativeMessage(JSON.stringify({ type: 'NATIVE_BACK', requestId: 'req_2' }));
      await Promise.resolve();
      await Promise.resolve();

      expect(JSON.parse(posted[1] as string)).toEqual({
        type: 'NATIVE_BACK_RESULT',
        requestId: 'req_2',
        payload: { handled: false },
      });
    });

    it('correlates GET_CONTAINER_INFO replies and resolves null on 400ms timeout', async () => {
      const { posted, emitNativeMessage } = setupAndroidMock();
      bridge = createPedigreeBridge();

      const infoPromise = bridge.getNativeContainerInfo(400);
      const sent = JSON.parse(posted[0] as string);
      expect(sent.type).toBe('GET_CONTAINER_INFO');

      emitNativeMessage(
        JSON.stringify({
          type: 'CONTAINER_INFO_RESULT',
          requestId: sent.requestId,
          payload: {
            platform: 'android',
            webViewVersion: '108.0.5359.128',
            webViewMajorVersion: 108,
            opfsSupportedInWebView: false,
            vaultSnapshotCount: 3,
          },
        })
      );

      const info = await infoPromise;
      expect(info).toEqual({
        platform: 'android',
        webViewVersion: '108.0.5359.128',
        webViewMajorVersion: 108,
        opfsSupportedInWebView: false,
        vaultSnapshotCount: 3,
      });

      const timedOutPromise = bridge.getNativeContainerInfo(400);
      vi.advanceTimersByTime(400);
      const timedOut = await timedOutPromise;
      expect(timedOut).toBeNull();
    });

    it('ignores native messages from untrusted origins', async () => {
      const { posted, emitNativeMessage } = setupAndroidMock();
      bridge = createPedigreeBridge();

      emitNativeMessage(
        JSON.stringify({ type: 'NATIVE_BACK', requestId: 'bad_req' }),
        'https://evil.example.com'
      );
      await Promise.resolve();

      expect(posted).toHaveLength(0);
      expect(bridge.getDiagnosticEvents()[0].code).toBe('REJECTED_UNTRUSTED_ORIGIN');
    });

    it('mirrors backup snapshots via SYNC_BACKUP_SNAPSHOT + ArrayBuffer', async () => {
      const { posted } = setupAndroidMock();
      bridge = createPedigreeBridge();

      const ok = await bridge.syncBackupSnapshotToNative({
        snapshotId: 'snap_01',
        createdAt: '2026-11-19T14:16:00.000Z',
        format: 'zip',
        bytes: new Uint8Array([80, 75, 3, 4]),
        metadata: { herdCount: 12 },
      });

      expect(ok).toBe(true);
      expect(posted).toHaveLength(2);
      const meta = JSON.parse(posted[0] as string);
      expect(meta.type).toBe('SYNC_BACKUP_SNAPSHOT');
      expect(meta.payload.snapshotId).toBe('snap_01');
      expect(meta.payload.byteLength).toBe(4);
      expect(Array.from(new Uint8Array(posted[1] as ArrayBuffer))).toEqual([80, 75, 3, 4]);
    });

    it('falls back to inline base64Data when ArrayBuffer postMessage throws during binary export', async () => {
      const { pedigreeNative, posted } = setupAndroidMock();
      pedigreeNative.postMessage.mockImplementation((msg: string | ArrayBuffer) => {
        if (msg instanceof ArrayBuffer) {
          throw new TypeError('ArrayBuffer unsupported in legacy WebView');
        }
        posted.push(msg);
      });
      bridge = createPedigreeBridge();

      const result = await bridge.exportOrShareBinary({
        filename: 'legacy-export.txt',
        mimeType: 'text/plain',
        mode: 'save',
        bytes: new Uint8Array([72, 105]), // "Hi"
      });

      expect(result).toEqual({ ok: true, handledBy: 'android' });
      expect(posted).toHaveLength(2);
      const initialMeta = JSON.parse(posted[0] as string);
      const fallbackMeta = JSON.parse(posted[1] as string);
      expect(initialMeta.type).toBe('BEGIN_BINARY_TRANSFER');
      expect(initialMeta.payload.base64Data).toBeUndefined();
      expect(fallbackMeta).toEqual({
        type: 'BEGIN_BINARY_TRANSFER',
        requestId: initialMeta.requestId,
        payload: {
          filename: 'legacy-export.txt',
          mimeType: 'text/plain',
          mode: 'save',
          byteLength: 2,
          base64Data: 'SGk=',
        },
      });
    });

    it('falls back to inline base64Data when ArrayBuffer postMessage throws during backup snapshot sync', async () => {
      const { pedigreeNative, posted } = setupAndroidMock();
      pedigreeNative.postMessage.mockImplementation((msg: string | ArrayBuffer) => {
        if (msg instanceof ArrayBuffer) {
          throw new TypeError('ArrayBuffer unsupported in legacy WebView');
        }
        posted.push(msg);
      });
      bridge = createPedigreeBridge();

      const ok = await bridge.syncBackupSnapshotToNative({
        snapshotId: 'snap_legacy',
        createdAt: '2026-11-20T09:50:00.000Z',
        format: 'json',
        bytes: new Uint8Array([123, 125]), // "{}"
        metadata: { herdCount: 3 },
      });

      expect(ok).toBe(true);
      expect(posted).toHaveLength(2);
      const initialMeta = JSON.parse(posted[0] as string);
      const fallbackMeta = JSON.parse(posted[1] as string);
      expect(initialMeta.type).toBe('SYNC_BACKUP_SNAPSHOT');
      expect(initialMeta.payload.base64Data).toBeUndefined();
      expect(fallbackMeta).toEqual({
        type: 'SYNC_BACKUP_SNAPSHOT',
        requestId: initialMeta.requestId,
        payload: {
          snapshotId: 'snap_legacy',
          createdAt: '2026-11-20T09:50:00.000Z',
          format: 'json',
          byteLength: 2,
          base64Data: 'e30=',
          metadata: { herdCount: 3 },
        },
      });
    });

    it('posts OPEN_DEV_PANEL via openDevPanel() on Android', () => {
      const { posted } = setupAndroidMock();
      bridge = createPedigreeBridge();

      expect(bridge.openDevPanel()).toBe(true);
      expect(posted).toHaveLength(1);
      const envelope = JSON.parse(posted[0] as string);
      expect(envelope.type).toBe('OPEN_DEV_PANEL');
      expect(typeof envelope.requestId).toBe('string');
    });
  });

  describe('iOS WKScriptMessageHandler serialization', () => {
    it('serializes binary export as base64 payload for webkit messageHandlers', async () => {
      const { win } = setupMockDom('capacitor://localhost');
      const iosPosted: unknown[] = [];
      win.webkit = {
        messageHandlers: {
          pedigreeNative: {
            postMessage: vi.fn((msg: unknown) => {
              iosPosted.push(msg);
            }),
          },
        },
      };

      bridge = createPedigreeBridge();
      expect(bridge.getPlatform()).toBe('ios');
      expect(bridge.isNativeWrapper()).toBe(true);

      const bytes = new Uint8Array([72, 105]); // "Hi"
      const result = await bridge.exportOrShareBinary({
        filename: 'note.txt',
        mimeType: 'text/plain',
        mode: 'save',
        bytes: bytes,
      });

      expect(result).toEqual({ ok: true, handledBy: 'ios' });
      expect(iosPosted).toHaveLength(1);
      const envelope = iosPosted[0] as { type: string; payload: Record<string, unknown> };
      expect(envelope.type).toBe('EXPORT_OR_SHARE_BINARY');
      expect(envelope.payload.base64Data).toBe('SGk=');
      expect(envelope.payload.byteLength).toBe(2);
    });
  });
});
```

## `src/native/pedigreeBridge.ts`

```typescript
/**
 * Community Pedigree — Native Wrapper Bridge
 * Copyright (C) 2026 Community Pedigree Contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export type NativePlatform = 'android' | 'ios' | 'web';

export interface NativeEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  type: string;
  requestId?: string;
  payload?: TPayload;
}

export interface NativeContainerInfo {
  platform: NativePlatform;
  appVersion?: string;
  webViewPackage?: string;
  webViewVersion?: string;
  webViewMajorVersion?: number;
  opfsSupportedInWebView?: boolean;
  origin?: string;
  isDebugBuild?: boolean;
  vaultSnapshotCount?: number;
  vaultTotalBytes?: number;
  lastVaultBackupAt?: string | null;
  appWebViewBytes?: number;
}

export interface BinaryExportOptions {
  filename: string;
  mimeType: string;
  mode: 'save' | 'share';
  bytes: Uint8Array | ArrayBuffer;
}

export interface BinaryExportResult {
  ok: boolean;
  handledBy: 'android' | 'ios' | 'web-share' | 'web-download' | 'error';
  error?: string;
}

export interface BackupSnapshotInput {
  snapshotId: string;
  createdAt: string;
  format: 'json' | 'sqlite' | 'zip';
  bytes: Uint8Array | ArrayBuffer;
  metadata?: Record<string, unknown>;
}

export interface BridgeDiagnosticEvent {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  code: string;
  message: string;
}

export type BackHandler = () => boolean | Promise<boolean>;
export type DiagnosticEventListener = (event: BridgeDiagnosticEvent) => void;

interface AndroidWebMessageEvent {
  data: unknown;
  origin?: string;
}

interface AndroidPedigreeNativeObject {
  postMessage: (message: string | ArrayBuffer) => void;
  onmessage?: ((event: AndroidWebMessageEvent) => void) | null;
  addEventListener?: (type: 'message', listener: (event: AndroidWebMessageEvent) => void) => void;
  removeEventListener?: (type: 'message', listener: (event: AndroidWebMessageEvent) => void) => void;
}

interface IosScriptMessageHandler {
  postMessage: (message: unknown) => void;
}

interface WindowWithNativeBridge extends Window {
  pedigreeNative?: AndroidPedigreeNativeObject;
  webkit?: {
    messageHandlers?: {
      pedigreeNative?: IosScriptMessageHandler;
      [key: string]: IosScriptMessageHandler | undefined;
    };
  };
  __pedigreeBridgeReceive?: (message: unknown) => void;
}

interface RegisteredBackEntry {
  id: number;
  priority: number;
  handler: BackHandler;
}

interface PendingRequest<T> {
  resolve: (value: T) => void;
  timer: ReturnType<typeof setTimeout>;
}

export const ANDROID_ASSET_ORIGIN = 'https://appassets.androidplatform.net';

function getWindowRef(): WindowWithNativeBridge | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window as WindowWithNativeBridge;
}

function toUint8Array(input: Uint8Array | ArrayBuffer): Uint8Array {
  if (input instanceof Uint8Array) {
    return input;
  }
  return new Uint8Array(input);
}

function toSlicedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength &&
    bytes.buffer instanceof ArrayBuffer
  ) {
    return bytes.buffer;
  }
  if (bytes.buffer instanceof ArrayBuffer) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof btoa !== 'function') {
    return '';
  }
  const chunkSize = 0x1000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    parts.push(String.fromCharCode.apply(null, slice as unknown as number[]));
  }
  return btoa(parts.join(''));
}

function createRequestId(prefix: string): string {
  const randomPart = Math.floor(Math.random() * 1000000000).toString(36);
  return prefix + '_' + Date.now().toString(36) + '_' + randomPart;
}

function parseEnvelope(raw: unknown): NativeEnvelope | null {
  if (!raw) {
    return null;
  }
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (_err) {
      return null;
    }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.type !== 'string' || !candidate.type) {
    return null;
  }
  const envelope: NativeEnvelope = {
    type: candidate.type,
  };
  if (typeof candidate.requestId === 'string') {
    envelope.requestId = candidate.requestId;
  }
  if (typeof candidate.payload === 'object' && candidate.payload !== null) {
    envelope.payload = candidate.payload as Record<string, unknown>;
  }
  return envelope;
}

export class PedigreeBridge {
  private backEntries: RegisteredBackEntry[] = [];
  private nextBackEntryId = 1;
  private pendingContainerInfo = new Map<string, PendingRequest<NativeContainerInfo | null>>();
  private pendingBlobRevokes = new Map<ReturnType<typeof setTimeout>, string>();
  private diagnosticListeners = new Set<DiagnosticEventListener>();
  private recentDiagnostics: BridgeDiagnosticEvent[] = [];
  private listenerAttached = false;
  private boundAndroidObject: AndroidPedigreeNativeObject | null = null;
  private boundMessageHandler: ((event: AndroidWebMessageEvent) => void) | null = null;

  constructor() {
    this.ensureListenersAttached();
  }

  public getPlatform(): NativePlatform {
    const win = getWindowRef();
    if (!win) {
      return 'web';
    }
    if (win.pedigreeNative && typeof win.pedigreeNative.postMessage === 'function') {
      return 'android';
    }
    if (
      win.webkit &&
      win.webkit.messageHandlers &&
      win.webkit.messageHandlers.pedigreeNative &&
      typeof win.webkit.messageHandlers.pedigreeNative.postMessage === 'function'
    ) {
      return 'ios';
    }
    return 'web';
  }

  public isNativeWrapper(): boolean {
    return this.getPlatform() !== 'web';
  }

  public getExpectedOrigin(): string {
    const win = getWindowRef();
    if (win && win.location && typeof win.location.origin === 'string' && win.location.origin !== 'null') {
      return win.location.origin;
    }
    return ANDROID_ASSET_ORIGIN;
  }

  public onDiagnostic(listener: DiagnosticEventListener): () => void {
    this.diagnosticListeners.add(listener);
    return () => {
      this.diagnosticListeners.delete(listener);
    };
  }

  public getDiagnosticEvents(): BridgeDiagnosticEvent[] {
    return this.recentDiagnostics.slice();
  }

  public registerBackHandler(handler: BackHandler, priority = 0): () => void {
    this.ensureListenersAttached();
    const id = this.nextBackEntryId;
    this.nextBackEntryId += 1;
    const entry: RegisteredBackEntry = { id, priority, handler };
    this.backEntries.push(entry);

    return () => {
      this.backEntries = this.backEntries.filter(function (item) {
        return item.id !== id;
      });
    };
  }

  public async dispatchBackPress(): Promise<boolean> {
    // Evaluate highest priority first; within same priority evaluate LIFO (most recently added first).
    const snapshot = this.backEntries.slice().sort(function (a, b) {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return b.id - a.id;
    });

    for (let i = 0; i < snapshot.length; i += 1) {
      try {
        const handled = await snapshot[i].handler();
        if (handled) {
          return true;
        }
      } catch (err) {
        this.recordDiagnostic(
          'error',
          'BACK_HANDLER_ERROR',
          err instanceof Error ? err.message : 'Back handler threw an error'
        );
      }
    }
    return false;
  }

  public async exportOrShareBinary(options: BinaryExportOptions): Promise<BinaryExportResult> {
    this.ensureListenersAttached();
    const bytes = toUint8Array(options.bytes);
    const platform = this.getPlatform();
    const requestId = createRequestId('bin');

    if (platform === 'android') {
      const androidObj = this.getAndroidObject();
      if (!androidObj) {
        return { ok: false, handledBy: 'error', error: 'Android bridge unavailable' };
      }
      try {
        const metaEnvelope: NativeEnvelope = {
          type: 'BEGIN_BINARY_TRANSFER',
          requestId: requestId,
          payload: {
            filename: options.filename,
            mimeType: options.mimeType,
            mode: options.mode,
            byteLength: bytes.byteLength,
          },
        };
        androidObj.postMessage(JSON.stringify(metaEnvelope));
        try {
          androidObj.postMessage(toSlicedArrayBuffer(bytes));
        } catch (_arrayBufErr) {
          // Fallback for legacy Android WebViews (<116) without WEB_MESSAGE_ARRAY_BUFFER
          const fallbackEnvelope: NativeEnvelope = {
            type: 'BEGIN_BINARY_TRANSFER',
            requestId: requestId,
            payload: {
              filename: options.filename,
              mimeType: options.mimeType,
              mode: options.mode,
              byteLength: bytes.byteLength,
              base64Data: uint8ArrayToBase64(bytes),
            },
          };
          androidObj.postMessage(JSON.stringify(fallbackEnvelope));
        }
        return { ok: true, handledBy: 'android' };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to stream binary to Android';
        this.recordDiagnostic('error', 'ANDROID_BINARY_EXPORT_FAILED', message);
        return { ok: false, handledBy: 'error', error: message };
      }
    }

    if (platform === 'ios') {
      const iosHandler = this.getIosHandler();
      if (!iosHandler) {
        return { ok: false, handledBy: 'error', error: 'iOS bridge unavailable' };
      }
      try {
        const envelope: NativeEnvelope = {
          type: 'EXPORT_OR_SHARE_BINARY',
          requestId: requestId,
          payload: {
            filename: options.filename,
            mimeType: options.mimeType,
            mode: options.mode,
            byteLength: bytes.byteLength,
            base64Data: uint8ArrayToBase64(bytes),
          },
        };
        iosHandler.postMessage(envelope);
        return { ok: true, handledBy: 'ios' };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send binary to iOS';
        this.recordDiagnostic('error', 'IOS_BINARY_EXPORT_FAILED', message);
        return { ok: false, handledBy: 'error', error: message };
      }
    }

    // Standard browser fallback
    const slicedBuffer = toSlicedArrayBuffer(bytes);
    if (
      options.mode === 'share' &&
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof File !== 'undefined'
    ) {
      try {
        const file = new File([slicedBuffer], options.filename, { type: options.mimeType });
        const canShare =
          typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] });
        if (canShare) {
          await navigator.share({ files: [file], title: options.filename });
          return { ok: true, handledBy: 'web-share' };
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return { ok: false, handledBy: 'web-share', error: 'Share canceled by user' };
        }
        this.recordDiagnostic('warn', 'WEB_SHARE_FALLBACK', 'Falling back to blob download after share error');
      }
    }

    return this.triggerBrowserDownload(slicedBuffer, options.filename, options.mimeType);
  }

  public requestPrint(): boolean {
    this.ensureListenersAttached();
    const platform = this.getPlatform();
    const requestId = createRequestId('print');

    if (platform !== 'web') {
      return this.postControlEnvelope({
        type: 'REQUEST_PRINT',
        requestId: requestId,
      });
    }

    const win = getWindowRef();
    if (win && typeof win.print === 'function') {
      win.print();
      return true;
    }
    return false;
  }

  public openExternalUrl(url: string, purpose?: string): boolean {
    this.ensureListenersAttached();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (_err) {
      this.recordDiagnostic('warn', 'BLOCKED_MALFORMED_URL', 'Rejected malformed external URL');
      return false;
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'mailto:') {
      this.recordDiagnostic(
        'warn',
        'BLOCKED_UNSAFE_URL_SCHEME',
        'Blocked external URL with disallowed protocol: ' + parsed.protocol
      );
      return false;
    }

    const platform = this.getPlatform();
    if (platform !== 'web') {
      return this.postControlEnvelope({
        type: 'OPEN_EXTERNAL_URL',
        requestId: createRequestId('ext'),
        payload: {
          url: parsed.href,
          protocol: parsed.protocol,
          purpose: purpose || 'external',
        },
      });
    }

    const win = getWindowRef();
    if (!win || typeof document === 'undefined') {
      return false;
    }

    if (parsed.protocol === 'mailto:') {
      win.location.href = parsed.href;
      return true;
    }

    const anchor = document.createElement('a');
    anchor.href = parsed.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    if (document.body) {
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } else {
      anchor.click();
    }
    return true;
  }

  public openNativeDevPanel(): boolean {
    this.ensureListenersAttached();
    if (!this.isNativeWrapper()) {
      return false;
    }
    return this.postControlEnvelope({
      type: 'OPEN_DEV_PANEL',
      requestId: createRequestId('dev'),
    });
  }

  public openDevPanel(): boolean {
    return this.openNativeDevPanel();
  }

  public getNativeContainerInfo(timeoutMs = 400): Promise<NativeContainerInfo | null> {
    this.ensureListenersAttached();
    if (!this.isNativeWrapper()) {
      return Promise.resolve(null);
    }

    const requestId = createRequestId('info');
    return new Promise<NativeContainerInfo | null>((resolve) => {
      const effectiveTimeout = timeoutMs > 0 ? timeoutMs : 400;
      const timer = setTimeout(() => {
        this.pendingContainerInfo.delete(requestId);
        this.recordDiagnostic('warn', 'CONTAINER_INFO_TIMEOUT', 'Native container info request timed out');
        resolve(null);
      }, effectiveTimeout);

      this.pendingContainerInfo.set(requestId, { resolve, timer });

      const posted = this.postControlEnvelope({
        type: 'GET_CONTAINER_INFO',
        requestId: requestId,
      });

      if (!posted) {
        clearTimeout(timer);
        this.pendingContainerInfo.delete(requestId);
        resolve(null);
      }
    });
  }

  public syncBackupSnapshotToNative(snapshot: BackupSnapshotInput): Promise<boolean> {
    this.ensureListenersAttached();
    const platform = this.getPlatform();
    if (platform === 'web') {
      return Promise.resolve(false);
    }

    const bytes = toUint8Array(snapshot.bytes);
    const requestId = createRequestId('vault');

    if (platform === 'android') {
      const androidObj = this.getAndroidObject();
      if (!androidObj) {
        return Promise.resolve(false);
      }
      try {
        const envelope: NativeEnvelope = {
          type: 'SYNC_BACKUP_SNAPSHOT',
          requestId: requestId,
          payload: {
            snapshotId: snapshot.snapshotId,
            createdAt: snapshot.createdAt,
            format: snapshot.format,
            byteLength: bytes.byteLength,
            metadata: snapshot.metadata || {},
          },
        };
        androidObj.postMessage(JSON.stringify(envelope));
        try {
          androidObj.postMessage(toSlicedArrayBuffer(bytes));
        } catch (_arrayBufErr) {
          // Fallback for legacy Android WebViews (<116) without WEB_MESSAGE_ARRAY_BUFFER
          const fallbackEnvelope: NativeEnvelope = {
            type: 'SYNC_BACKUP_SNAPSHOT',
            requestId: requestId,
            payload: {
              snapshotId: snapshot.snapshotId,
              createdAt: snapshot.createdAt,
              format: snapshot.format,
              byteLength: bytes.byteLength,
              base64Data: uint8ArrayToBase64(bytes),
              metadata: snapshot.metadata || {},
            },
          };
          androidObj.postMessage(JSON.stringify(fallbackEnvelope));
        }
        return Promise.resolve(true);
      } catch (err) {
        this.recordDiagnostic(
          'error',
          'SYNC_SNAPSHOT_FAILED',
          err instanceof Error ? err.message : 'Failed to sync snapshot to Android vault'
        );
        return Promise.resolve(false);
      }
    }

    const iosHandler = this.getIosHandler();
    if (!iosHandler) {
      return Promise.resolve(false);
    }
    try {
      iosHandler.postMessage({
        type: 'SYNC_BACKUP_SNAPSHOT',
        requestId: requestId,
        payload: {
          snapshotId: snapshot.snapshotId,
          createdAt: snapshot.createdAt,
          format: snapshot.format,
          byteLength: bytes.byteLength,
          base64Data: uint8ArrayToBase64(bytes),
          metadata: snapshot.metadata || {},
        },
      });
      return Promise.resolve(true);
    } catch (err) {
      this.recordDiagnostic(
        'error',
        'IOS_SYNC_SNAPSHOT_FAILED',
        err instanceof Error ? err.message : 'Failed to sync snapshot to iOS'
      );
      return Promise.resolve(false);
    }
  }

  public handleIncomingNativeMessage(rawData: unknown, origin?: string): void {
    if (origin && origin !== 'null' && origin !== this.getExpectedOrigin()) {
      this.recordDiagnostic(
        'warn',
        'REJECTED_UNTRUSTED_ORIGIN',
        'Ignored native message from unexpected origin: ' + origin
      );
      return;
    }

    const envelope = parseEnvelope(rawData);
    if (!envelope) {
      return;
    }

    if (envelope.type === 'NATIVE_BACK') {
      void this.respondToNativeBack(envelope.requestId);
      return;
    }

    if (envelope.type === 'CONTAINER_INFO_RESULT' && envelope.requestId) {
      const pending = this.pendingContainerInfo.get(envelope.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingContainerInfo.delete(envelope.requestId);
        pending.resolve(this.normalizeContainerInfo(envelope.payload));
      }
    }
  }

  public destroy(): void {
    const win = getWindowRef();
    this.detachAndroidListener();
    if (win && win.__pedigreeBridgeReceive) {
      delete win.__pedigreeBridgeReceive;
    }
    this.pendingContainerInfo.forEach(function (entry) {
      clearTimeout(entry.timer);
      entry.resolve(null);
    });
    this.pendingContainerInfo.clear();
    this.pendingBlobRevokes.forEach(function (objectUrl, timer) {
      clearTimeout(timer);
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(objectUrl);
      }
    });
    this.pendingBlobRevokes.clear();
    this.backEntries = [];
    this.recentDiagnostics = [];
    this.diagnosticListeners.clear();
    this.listenerAttached = false;
  }

  private async respondToNativeBack(requestId?: string): Promise<void> {
    let handled = false;
    try {
      handled = await this.dispatchBackPress();
    } catch (_err) {
      handled = false;
    }
    if (this.isNativeWrapper()) {
      this.postControlEnvelope({
        type: 'NATIVE_BACK_RESULT',
        requestId: requestId,
        payload: { handled: handled },
      });
    }
  }

  private normalizeContainerInfo(payload?: Record<string, unknown>): NativeContainerInfo {
    const data = payload || {};
    const info: NativeContainerInfo = {
      platform:
        data.platform === 'android' || data.platform === 'ios' || data.platform === 'web'
          ? data.platform
          : this.getPlatform(),
    };
    if (typeof data.appVersion === 'string') info.appVersion = data.appVersion;
    if (typeof data.webViewPackage === 'string') info.webViewPackage = data.webViewPackage;
    if (typeof data.webViewVersion === 'string') info.webViewVersion = data.webViewVersion;
    if (typeof data.webViewMajorVersion === 'number') info.webViewMajorVersion = data.webViewMajorVersion;
    if (typeof data.opfsSupportedInWebView === 'boolean') info.opfsSupportedInWebView = data.opfsSupportedInWebView;
    if (typeof data.origin === 'string') info.origin = data.origin;
    if (typeof data.isDebugBuild === 'boolean') info.isDebugBuild = data.isDebugBuild;
    if (typeof data.vaultSnapshotCount === 'number') info.vaultSnapshotCount = data.vaultSnapshotCount;
    if (typeof data.vaultTotalBytes === 'number') info.vaultTotalBytes = data.vaultTotalBytes;
    if (typeof data.lastVaultBackupAt === 'string' || data.lastVaultBackupAt === null) {
      info.lastVaultBackupAt = data.lastVaultBackupAt;
    }
    if (typeof data.appWebViewBytes === 'number') info.appWebViewBytes = data.appWebViewBytes;
    return info;
  }

  private ensureListenersAttached(): void {
    const win = getWindowRef();
    if (!win) {
      return;
    }

    if (!this.listenerAttached) {
      win.__pedigreeBridgeReceive = (message: unknown) => {
        this.handleIncomingNativeMessage(message);
      };
      this.listenerAttached = true;
    }

    const androidObj = this.getAndroidObject();
    if (androidObj && androidObj !== this.boundAndroidObject) {
      this.detachAndroidListener();
      const handler = (event: AndroidWebMessageEvent) => {
        this.handleIncomingNativeMessage(event ? event.data : undefined, event ? event.origin : undefined);
      };
      if (typeof androidObj.addEventListener === 'function') {
        androidObj.addEventListener('message', handler);
      } else {
        androidObj.onmessage = handler;
      }
      this.boundAndroidObject = androidObj;
      this.boundMessageHandler = handler;
    }
  }

  private detachAndroidListener(): void {
    if (this.boundAndroidObject && this.boundMessageHandler) {
      if (typeof this.boundAndroidObject.removeEventListener === 'function') {
        this.boundAndroidObject.removeEventListener('message', this.boundMessageHandler);
      } else if (this.boundAndroidObject.onmessage === this.boundMessageHandler) {
        this.boundAndroidObject.onmessage = null;
      }
    }
    this.boundAndroidObject = null;
    this.boundMessageHandler = null;
  }

  private getAndroidObject(): AndroidPedigreeNativeObject | null {
    const win = getWindowRef();
    if (win && win.pedigreeNative && typeof win.pedigreeNative.postMessage === 'function') {
      return win.pedigreeNative;
    }
    return null;
  }

  private getIosHandler(): IosScriptMessageHandler | null {
    const win = getWindowRef();
    if (
      win &&
      win.webkit &&
      win.webkit.messageHandlers &&
      win.webkit.messageHandlers.pedigreeNative &&
      typeof win.webkit.messageHandlers.pedigreeNative.postMessage === 'function'
    ) {
      return win.webkit.messageHandlers.pedigreeNative;
    }
    return null;
  }

  private postControlEnvelope(envelope: NativeEnvelope): boolean {
    const platform = this.getPlatform();
    if (platform === 'android') {
      const androidObj = this.getAndroidObject();
      if (!androidObj) {
        return false;
      }
      try {
        androidObj.postMessage(JSON.stringify(envelope));
        return true;
      } catch (err) {
        this.recordDiagnostic(
          'error',
          'ANDROID_POST_MESSAGE_FAILED',
          err instanceof Error ? err.message : 'Failed posting message to Android'
        );
        return false;
      }
    }

    if (platform === 'ios') {
      const iosHandler = this.getIosHandler();
      if (!iosHandler) {
        return false;
      }
      try {
        iosHandler.postMessage(envelope);
        return true;
      } catch (err) {
        this.recordDiagnostic(
          'error',
          'IOS_POST_MESSAGE_FAILED',
          err instanceof Error ? err.message : 'Failed posting message to iOS'
        );
        return false;
      }
    }

    return false;
  }

  private triggerBrowserDownload(
    buffer: ArrayBuffer,
    filename: string,
    mimeType: string
  ): BinaryExportResult {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
      return { ok: false, handledBy: 'error', error: 'Browser download APIs unavailable' };
    }
    try {
      const blob = new Blob([buffer], { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.style.display = 'none';
      if (document.body) {
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      } else {
        anchor.click();
      }
      const self = this;
      const revokeTimer = setTimeout(function () {
        self.pendingBlobRevokes.delete(revokeTimer);
        URL.revokeObjectURL(objectUrl);
      }, 10000);
      this.pendingBlobRevokes.set(revokeTimer, objectUrl);
      return { ok: true, handledBy: 'web-download' };
    } catch (err) {
      return {
        ok: false,
        handledBy: 'error',
        error: err instanceof Error ? err.message : 'Browser download failed',
      };
    }
  }

  private recordDiagnostic(
    level: 'info' | 'warn' | 'error',
    code: string,
    message: string
  ): void {
    const entry: BridgeDiagnosticEvent = {
      timestamp: new Date().toISOString(),
      level: level,
      code: code,
      message: message,
    };
    this.recentDiagnostics.push(entry);
    if (this.recentDiagnostics.length > 50) {
      this.recentDiagnostics.shift();
    }
    this.diagnosticListeners.forEach(function (listener) {
      try {
        listener(entry);
      } catch (_err) {
        // Ignore listener errors
      }
    });
  }
}

export function createPedigreeBridge(): PedigreeBridge {
  return new PedigreeBridge();
}

export const pedigreeBridge = createPedigreeBridge();
```

## `src/storage/archiveAndImport.worker.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Dedicated Web Worker for Off-Thread `.ZIP` Archive Compression/Extraction,
 * Large External Pedigree Parsing, and Diagnostic Support Bundle Packaging.
 *
 * Keeps mobile Chrome/Safari UI threads responsive when compressing hundreds of
 * photos or unpacking multi-thousand-record CSV/HTM/JSON pedigree archives.
 */

import '../utils/es2018Shims';
import {
  inspectParsedArchiveBeforeRestorePure,
} from '../core/archiveInspector';
import {
  buildCompleteBackupZipArchive,
  buildPhotosOnlyZipArchive,
  parseBackupArchiveInput,
  streamCompleteBackupZipArchive,
  streamPhotosOnlyZipArchive,
  StreamingZipArchiveSummary,
} from '../core/backupArchive';
import type { ImporterRunOptions, RawArchiveInput } from '../core/importers/importerTypes';
import { getPlatformImporterById } from '../core/importers/registry';
import {
  type BarnDatabaseSnapshot,
  type BarnSettings,
  setCoreClockSkewMs,
} from '../core/models';
import {
  buildSupportBundleZipArchive,
  type SupportBundleBuildParams,
} from '../core/supportBundle';
import type { SpeciesBackupReason } from '../core/syncAndExports';
import { isOpfsSupported, writeTempOpfsFileStreamed } from './opfsTempStream';

export interface OpfsTempZipBuildResult {
  opfsTempFileName: string | null;
  bytes?: Uint8Array;
  blob?: Blob;
  byteSize: number;
  photoCount: number;
  animalCount: number;
  binderCount: number;
  totalImageBinaryBytes: number;
}

export type ArchiveWorkerRequest = (
  | {
      id: string;
      kind: 'buildCompleteBackupZip';
      snapshot: BarnDatabaseSnapshot;
      filterSpecies?: string;
      extraMeta?: {
        backupScope?: 'barn' | 'species';
        backupReason?: SpeciesBackupReason;
        targetSpecies?: string;
      };
    }
  | {
      id: string;
      kind: 'buildCompleteBackupZipToOpfsTmp';
      snapshot: BarnDatabaseSnapshot;
      filterSpecies?: string;
      extraMeta?: {
        backupScope?: 'barn' | 'species';
        backupReason?: SpeciesBackupReason;
        targetSpecies?: string;
      };
    }
  | {
      id: string;
      kind: 'buildPhotosOnlyZip';
      snapshot: BarnDatabaseSnapshot;
      filterSpecies?: string;
    }
  | {
      id: string;
      kind: 'buildPhotosOnlyZipToOpfsTmp';
      snapshot: BarnDatabaseSnapshot;
      filterSpecies?: string;
    }
  | {
      id: string;
      kind: 'parseBackupArchive';
      bytes: Uint8Array;
      fileName: string;
      fallbackSettings: BarnSettings;
    }
  | {
      id: string;
      kind: 'parseExternalImport';
      platformId: string;
      inputs: RawArchiveInput[];
      existingSnapshot: BarnDatabaseSnapshot;
      options: ImporterRunOptions;
    }
  | {
      id: string;
      kind: 'buildSupportBundleZip';
      params: SupportBundleBuildParams;
    }
  | {
      id: string;
      kind: 'inspectBackupArchive';
      bytes: Uint8Array;
      fileName: string;
      currentSnapshot: BarnDatabaseSnapshot;
      encrypted?: boolean;
    }
) & { clockSkewMs?: number };

export type ArchiveWorkerResponse =
  | {
      id: string;
      ok: true;
      result: unknown;
    }
  | {
      id: string;
      ok: false;
      error: string;
    };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ArchiveWorkerRequest>) => void) | null;
  postMessage: (message: ArchiveWorkerResponse, transfer?: Transferable[]) => void;
};

function concatChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const out = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function runStreamedZipInWorker(
  prefix: string,
  streamFn: (onChunk: (chunk: Uint8Array) => Promise<void>) => Promise<StreamingZipArchiveSummary>
): Promise<{ result: OpfsTempZipBuildResult; transfer: Transferable[] }> {
  if (isOpfsSupported()) {
    const staged = await writeTempOpfsFileStreamed(
      prefix,
      'zip',
      async (writeChunk) => streamFn((chunk) => writeChunk(chunk)),
      { keepActiveAfterWrite: true }
    );
    if (staged) {
      return {
        result: {
          opfsTempFileName: staged.fileName,
          byteSize: staged.byteSize,
          photoCount: staged.meta.photoCount,
          animalCount: staged.meta.animalCount,
          binderCount: staged.meta.binderCount,
          totalImageBinaryBytes: staged.meta.totalImageBinaryBytes,
        },
        transfer: [],
      };
    }
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const meta = await streamFn(async (chunk) => {
    chunks.push(chunk);
    total += chunk.byteLength;
  });
  const bytes = concatChunks(chunks, total);
  return {
    result: {
      opfsTempFileName: null,
      bytes,
      byteSize: bytes.byteLength,
      photoCount: meta.photoCount,
      animalCount: meta.animalCount,
      binderCount: meta.binderCount,
      totalImageBinaryBytes: meta.totalImageBinaryBytes,
    },
    transfer: [bytes.buffer],
  };
}

async function handleWorkerRequest(req: ArchiveWorkerRequest): Promise<void> {
  if (!req || !req.id) return;
  setCoreClockSkewMs(req.clockSkewMs ?? 0);

  try {
    if (req.kind === 'buildCompleteBackupZip') {
      const result = buildCompleteBackupZipArchive(
        req.snapshot,
        req.filterSpecies,
        req.extraMeta
      );
      workerScope.postMessage(
        { id: req.id, ok: true, result },
        [result.bytes.buffer]
      );
      return;
    }

    if (req.kind === 'buildCompleteBackupZipToOpfsTmp') {
      const { result, transfer } = await runStreamedZipInWorker('archive', (onChunk) =>
        streamCompleteBackupZipArchive(req.snapshot, onChunk, req.filterSpecies, req.extraMeta)
      );
      workerScope.postMessage({ id: req.id, ok: true, result }, transfer);
      return;
    }

    if (req.kind === 'buildPhotosOnlyZip') {
      const result = buildPhotosOnlyZipArchive(req.snapshot, req.filterSpecies);
      workerScope.postMessage(
        { id: req.id, ok: true, result },
        [result.bytes.buffer]
      );
      return;
    }

    if (req.kind === 'buildPhotosOnlyZipToOpfsTmp') {
      const { result, transfer } = await runStreamedZipInWorker('photos-archive', (onChunk) =>
        streamPhotosOnlyZipArchive(req.snapshot, onChunk, req.filterSpecies)
      );
      workerScope.postMessage({ id: req.id, ok: true, result }, transfer);
      return;
    }

    if (req.kind === 'parseBackupArchive') {
      const result = parseBackupArchiveInput(
        req.bytes,
        req.fileName,
        req.fallbackSettings
      );
      workerScope.postMessage({ id: req.id, ok: true, result });
      return;
    }

    if (req.kind === 'parseExternalImport') {
      const importer = getPlatformImporterById(req.platformId);
      const result = importer.parse(
        req.inputs,
        req.existingSnapshot,
        req.options
      );
      workerScope.postMessage({ id: req.id, ok: true, result });
      return;
    }

    if (req.kind === 'buildSupportBundleZip') {
      const result = buildSupportBundleZipArchive(req.params);
      workerScope.postMessage(
        { id: req.id, ok: true, result },
        [result.bytes.buffer]
      );
      return;
    }

    if (req.kind === 'inspectBackupArchive') {
      const parsed = parseBackupArchiveInput(
        req.bytes,
        req.fileName,
        req.currentSnapshot.settings
      );
      const inspection = inspectParsedArchiveBeforeRestorePure(
        parsed,
        req.currentSnapshot,
        {
          fileName: req.fileName,
          encrypted: Boolean(req.encrypted),
        }
      );
      workerScope.postMessage({
        id: req.id,
        ok: true,
        result: { parsed, inspection },
      });
      return;
    }

    workerScope.postMessage({
      id: (req as { id: string }).id,
      ok: false,
      error: 'Unsupported archive worker operation.',
    });
  } catch (err) {
    workerScope.postMessage({
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

workerScope.onmessage = (event: MessageEvent<ArchiveWorkerRequest>) => {
  void handleWorkerRequest(event.data);
};
```

## `src/storage/backgroundFreezeCoordinator.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Mobile Background Freeze Coordinator (`src/storage/backgroundFreezeCoordinator.ts`).
 *
 * Purpose:
 * - Integrates with `crashLogger`'s single `visibilitychange` / `pagehide` handlers to
 *   cooperatively pause heavy sync/backup work before iOS Safari / Android Chrome freeze JS.
 * - Auto-resumes minor clean pauses immediately when returning to `'visible'` (ergonomic for
 *   barn gloves and mobility), while escalating severity issues (e.g. lost folder permission,
 *   storage quota, partial I/O failure) to a sticky user-acknowledged prompt.
 */

import { releaseActiveOpfsHandles } from './opfsTempStream';
import {
  abortPendingWebLocks,
  releaseOpenBroadcastChannels,
  releaseOpenIdbResources,
} from './storageProbes';

export class BackgroundPausedError extends Error {
  readonly taskName: string;
  readonly severityIssue: string | null;
  readonly checkpointSummary: string | null;

  constructor(
    taskName: string,
    options?: {
      severityIssue?: string | null;
      checkpointSummary?: string | null;
    }
  ) {
    const severityIssue = options?.severityIssue || null;
    const checkpointSummary = options?.checkpointSummary || null;
    super(
      severityIssue
        ? `${taskName} paused: ${severityIssue}`
        : `${taskName} paused safely when app moved to background.`
    );
    this.name = 'BackgroundPausedError';
    this.taskName = taskName;
    this.severityIssue = severityIssue;
    this.checkpointSummary = checkpointSummary;
  }
}

export interface FreezeLifecycleListener {
  id: string;
  onHidden?: () => void | Promise<void>;
  onVisible?: () => void | Promise<void>;
  onReleaseResources?: (reason: 'hidden' | 'pagehide') => void | Promise<void>;
}

export interface PausedBackgroundJob {
  taskId: string;
  label: string;
  pausedAtMs: number;
  severity: 'minor' | 'severity';
  severityReason?: string;
  resumeHandler?: () => void | Promise<void>;
}

export type PausedJobsSubscriber = (jobs: PausedBackgroundJob[]) => void;

const lifecycleListeners = new Map<string, FreezeLifecycleListener>();
const pausedJobs = new Map<string, PausedBackgroundJob>();
const pausedJobSubscribers = new Set<PausedJobsSubscriber>();

function readInitialVisibilityState(): 'visible' | 'hidden' {
  try {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden'
      ? 'hidden'
      : 'visible';
  } catch {
    return 'visible';
  }
}

let lastVisibilityState: 'visible' | 'hidden' = readInitialVisibilityState();

function emitPausedJobs(): void {
  const snapshot = Array.from(pausedJobs.values());
  for (const sub of pausedJobSubscribers) {
    try {
      sub(snapshot);
    } catch {
      // Never allow subscriber failure to disrupt lifecycle handling
    }
  }
}

export function isDocumentHidden(docOverride?: { visibilityState?: string }): boolean {
  try {
    const target = docOverride ?? (typeof document !== 'undefined' ? document : undefined);
    return Boolean(target && target.visibilityState === 'hidden');
  } catch {
    return false;
  }
}

export function assertForegroundOrPause(
  taskName: string,
  checkpointSummary?: string | null,
  docOverride?: { visibilityState?: string }
): void {
  if (isDocumentHidden(docOverride)) {
    throw new BackgroundPausedError(taskName, {
      checkpointSummary: checkpointSummary ?? null,
    });
  }
}

export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export async function checkpointAwareStep(
  taskName: string,
  checkpointSummary?: string | null,
  docOverride?: { visibilityState?: string }
): Promise<void> {
  assertForegroundOrPause(taskName, checkpointSummary, docOverride);
  await yieldToEventLoop();
  assertForegroundOrPause(taskName, checkpointSummary, docOverride);
}

export function registerFreezeLifecycleListener(listener: FreezeLifecycleListener): () => void {
  lifecycleListeners.set(listener.id, listener);
  return () => {
    lifecycleListeners.delete(listener.id);
  };
}

export function registerPausedBackgroundJob(job: PausedBackgroundJob): void {
  pausedJobs.set(job.taskId, job);
  emitPausedJobs();
}

export function clearPausedBackgroundJob(taskId: string): void {
  if (pausedJobs.delete(taskId)) {
    emitPausedJobs();
  }
}

export function getPausedBackgroundJobs(): PausedBackgroundJob[] {
  return Array.from(pausedJobs.values());
}

export function subscribePausedBackgroundJobs(cb: PausedJobsSubscriber): () => void {
  pausedJobSubscribers.add(cb);
  try {
    cb(getPausedBackgroundJobs());
  } catch {
    // Ignore initial emit error
  }
  return () => {
    pausedJobSubscribers.delete(cb);
  };
}

export async function resumePausedBackgroundJob(taskId: string): Promise<boolean> {
  const job = pausedJobs.get(taskId);
  if (!job) return false;
  pausedJobs.delete(taskId);
  emitPausedJobs();
  if (job.resumeHandler) {
    await job.resumeHandler();
  }
  return true;
}

function emitReleaseResources(reason: 'hidden' | 'pagehide'): void {
  try {
    abortPendingWebLocks();
  } catch {
    // Non-fatal
  }
  try {
    releaseOpenIdbResources();
  } catch {
    // Non-fatal
  }
  try {
    releaseOpenBroadcastChannels();
  } catch {
    // Non-fatal
  }
  try {
    void releaseActiveOpfsHandles().catch(() => {});
  } catch {
    // Non-fatal
  }

  const listeners = Array.from(lifecycleListeners.values());
  for (const listener of listeners) {
    if (typeof listener.onReleaseResources === 'function') {
      try {
        void Promise.resolve(listener.onReleaseResources(reason)).catch(() => {});
      } catch {
        // Non-fatal resource release failure
      }
    }
  }
}

function applyBackgroundTransition(
  nextState: 'hidden' | 'visible',
  releaseReason: 'hidden' | 'pagehide'
): void {
  if (nextState === 'hidden') {
    emitReleaseResources(releaseReason);
  }

  if (nextState === lastVisibilityState && nextState === 'hidden') {
    return;
  }
  lastVisibilityState = nextState;

  const listeners = Array.from(lifecycleListeners.values());
  if (nextState === 'hidden') {
    for (const listener of listeners) {
      if (typeof listener.onHidden === 'function') {
        try {
          void Promise.resolve(listener.onHidden()).catch(() => {});
        } catch {
          // Non-fatal
        }
      }
    }
    return;
  }

  for (const listener of listeners) {
    if (typeof listener.onVisible === 'function') {
      try {
        void Promise.resolve(listener.onVisible()).catch(() => {});
      } catch {
        // Non-fatal
      }
    }
  }

  // Auto-resume clean paused jobs immediately when returning to foreground
  const jobsSnapshot = Array.from(pausedJobs.values());
  let removedAny = false;
  for (const job of jobsSnapshot) {
    if (job.severity === 'minor' && job.resumeHandler) {
      pausedJobs.delete(job.taskId);
      removedAny = true;
      try {
        void Promise.resolve(job.resumeHandler()).catch(() => {});
      } catch {
        // Handler reports its own errors
      }
    }
  }
  if (removedAny) {
    emitPausedJobs();
  }
}

/**
 * Called from `crashLogger`'s single `visibilitychange` / `pagehide` dispatcher.
 * - On `'hidden'`: releases OPFS/IDB/channel handles and notifies registered jobs to checkpoint & pause cleanly.
 * - On `'visible'`: auto-resumes clean minor paused jobs immediately (zero tap friction),
 *   while leaving `'severity'` paused jobs intact until acknowledged by the user.
 */
export function notifyBackgroundTransition(nextState: 'hidden' | 'visible'): void {
  applyBackgroundTransition(nextState, 'hidden');
}

/**
 * Called on `pagehide` (including bfcache transitions) to release active OPFS handles,
 * open IDB transactions/connections, and BroadcastChannels even if `visibilitychange`
 * already transitioned to `'hidden'`.
 */
export function notifyPageHide(): void {
  applyBackgroundTransition('hidden', 'pagehide');
}

export function resetBackgroundFreezeCoordinatorForTests(): void {
  lifecycleListeners.clear();
  pausedJobs.clear();
  pausedJobSubscribers.clear();
  lastVisibilityState = 'visible';
}
```

## `src/storage/capturedIdeasStore.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Offline-First Persistence Store for Captured Suggestion Ideas
 * (`src/storage/capturedIdeasStore.ts`).
 *
 * Storage Strategy & Invariants:
 * - Primary store: Dedicated IndexedDB database (`community_pedigree_ideas_v1`) with short,
 *   atomic `readonly` / `readwrite` transactions and `try/catch` VersionError protection.
 * - Secondary fallback / mirror: OPFS `/ideas/captured-ideas.json` (when supported) with
 *   deterministic `try/finally` `.close()` on writable streams, plus `localStorage` fallback.
 * - Quota defense: Catches `QuotaExceededError` on writes, purges OPFS `/tmp`, and retries once.
 * - Bounded growth: Enforces `MAX_CAPTURED_IDEAS_COUNT` (`500` entries).
 */

import { generateUuid, nowIsoUtc } from '../core/models';
import {
  CapturedIdeaEntry,
  isValidCapturedIdeaEntry,
  MAX_CAPTURED_IDEAS_COUNT,
  sanitizeIdeaInput,
} from '../core/suggestionsBacklog';
import { logDiagnosticEvent } from './crashLogger';
import { isOpfsSupported, purgeOpfsTmp } from './opfsStorage';
import {
  getOpfsRoot,
  writeFileToOpfsDir,
} from './opfsTempStream';
import {
  getSafeIndexedDb,
  getSafeLocalStorage,
  trackActiveIdbConnection,
  trackActiveIdbTransaction,
} from './storageProbes';
import { isQuotaExceededError } from './storageProtection';
import { readBlobAsText } from '../utils/es2018Shims';

const IDEAS_IDB_NAME = 'community_pedigree_ideas_v1';
const IDEAS_IDB_VERSION = 1;
const IDEAS_STORE_NAME = 'captured_ideas';
const IDEAS_LOCAL_STORAGE_KEY = 'pedigree.capturedIdeas.v1';
const IDEAS_OPFS_DIR = 'ideas';
const IDEAS_OPFS_FILE = 'captured-ideas.json';

function sortIdeasNewestFirst(ideas: readonly CapturedIdeaEntry[]): CapturedIdeaEntry[] {
  return [...ideas].sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
}

function parseIdeaList(raw: unknown): CapturedIdeaEntry[] {
  if (!Array.isArray(raw)) return [];
  const valid: CapturedIdeaEntry[] = [];
  const seenIds = new Set<string>();
  for (const item of raw) {
    if (!isValidCapturedIdeaEntry(item)) continue;
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    valid.push({
      id: item.id,
      text: item.text,
      createdAtIso: item.createdAtIso,
    });
  }
  return sortIdeasNewestFirst(valid).slice(0, MAX_CAPTURED_IDEAS_COUNT);
}

function readLocalFallback(): CapturedIdeaEntry[] {
  const ls = getSafeLocalStorage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(IDEAS_LOCAL_STORAGE_KEY);
    if (!raw) return [];
    return parseIdeaList(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeLocalFallback(ideas: readonly CapturedIdeaEntry[]): boolean {
  const ls = getSafeLocalStorage();
  if (!ls) return false;
  try {
    ls.setItem(IDEAS_LOCAL_STORAGE_KEY, JSON.stringify(ideas));
    return true;
  } catch (err) {
    if (isQuotaExceededError(err)) {
      throw err;
    }
    return false;
  }
}

async function openIdeasIndexedDb(): Promise<IDBDatabase | null> {
  const idb = getSafeIndexedDb();
  if (!idb) return null;
  try {
    return await new Promise<IDBDatabase | null>((resolve) => {
      let settled = false;
      const finish = (db: IDBDatabase | null) => {
        if (!settled) {
          settled = true;
          resolve(db);
        }
      };
      try {
        const req = idb.open(IDEAS_IDB_NAME, IDEAS_IDB_VERSION);
        req.onupgradeneeded = () => {
          try {
            const db = req.result;
            if (!db.objectStoreNames.contains(IDEAS_STORE_NAME)) {
              db.createObjectStore(IDEAS_STORE_NAME, { keyPath: 'id' });
            }
          } catch {
            // Handled cleanly by onerror/fallback
          }
        };
        req.onsuccess = () => finish(req.result);
        req.onerror = () => finish(null);
        req.onblocked = () => finish(null);
      } catch {
        finish(null);
      }
    });
  } catch {
    return null;
  }
}

async function readAllFromIdb(): Promise<CapturedIdeaEntry[] | null> {
  const db = await openIdeasIndexedDb();
  if (!db) return null;
  const untrackDb = trackActiveIdbConnection(db);
  try {
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction(IDEAS_STORE_NAME, 'readonly');
      const untrackTx = trackActiveIdbTransaction(tx);
      const store = tx.objectStore(IDEAS_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        untrackTx();
        resolve(Array.isArray(req.result) ? req.result : []);
      };
      req.onerror = () => {
        untrackTx();
        reject(req.error || new Error('IndexedDB read failed.'));
      };
      tx.onabort = () => {
        untrackTx();
        reject(tx.error || new Error('IndexedDB read aborted.'));
      };
    });
    return parseIdeaList(rows);
  } catch (err) {
    logDiagnosticEvent({
      level: 'warn',
      category: 'storage',
      message: 'Failed reading captured ideas from IndexedDB; falling back to local cache',
      error: err,
    });
    return null;
  } finally {
    untrackDb();
    try {
      db.close();
    } catch {
      // Ignore close error
    }
  }
}

async function putEntryInIdb(entry: CapturedIdeaEntry): Promise<boolean> {
  const db = await openIdeasIndexedDb();
  if (!db) return false;
  const untrackDb = trackActiveIdbConnection(db);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDEAS_STORE_NAME, 'readwrite');
      const untrackTx = trackActiveIdbTransaction(tx);
      tx.oncomplete = () => {
        untrackTx();
        resolve();
      };
      tx.onerror = () => {
        untrackTx();
        reject(tx.error || new Error('IndexedDB write failed.'));
      };
      tx.onabort = () => {
        untrackTx();
        reject(tx.error || new Error('IndexedDB write aborted.'));
      };
      tx.objectStore(IDEAS_STORE_NAME).put(entry);
    });
    return true;
  } finally {
    untrackDb();
    try {
      db.close();
    } catch {
      // Ignore close error
    }
  }
}

async function deleteEntryInIdb(id: string): Promise<boolean> {
  const db = await openIdeasIndexedDb();
  if (!db) return false;
  const untrackDb = trackActiveIdbConnection(db);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDEAS_STORE_NAME, 'readwrite');
      const untrackTx = trackActiveIdbTransaction(tx);
      tx.oncomplete = () => {
        untrackTx();
        resolve();
      };
      tx.onerror = () => {
        untrackTx();
        reject(tx.error || new Error('IndexedDB delete failed.'));
      };
      tx.onabort = () => {
        untrackTx();
        reject(tx.error || new Error('IndexedDB delete aborted.'));
      };
      tx.objectStore(IDEAS_STORE_NAME).delete(id);
    });
    return true;
  } finally {
    untrackDb();
    try {
      db.close();
    } catch {
      // Ignore close error
    }
  }
}

async function clearAllInIdb(): Promise<boolean> {
  const db = await openIdeasIndexedDb();
  if (!db) return false;
  const untrackDb = trackActiveIdbConnection(db);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDEAS_STORE_NAME, 'readwrite');
      const untrackTx = trackActiveIdbTransaction(tx);
      tx.oncomplete = () => {
        untrackTx();
        resolve();
      };
      tx.onerror = () => {
        untrackTx();
        reject(tx.error || new Error('IndexedDB clear failed.'));
      };
      tx.onabort = () => {
        untrackTx();
        reject(tx.error || new Error('IndexedDB clear aborted.'));
      };
      tx.objectStore(IDEAS_STORE_NAME).clear();
    });
    return true;
  } finally {
    untrackDb();
    try {
      db.close();
    } catch {
      // Ignore close error
    }
  }
}

async function writeIdeasToOpfs(ideas: readonly CapturedIdeaEntry[]): Promise<boolean> {
  if (!isOpfsSupported()) return false;
  const root = await getOpfsRoot();
  if (!root) return false;

  const ideasDir = await root.getDirectoryHandle(IDEAS_OPFS_DIR, { create: true });
  await writeFileToOpfsDir(ideasDir, IDEAS_OPFS_FILE, JSON.stringify(ideas, null, 2));
  return true;
}

async function readIdeasFromOpfs(): Promise<CapturedIdeaEntry[] | null> {
  if (!isOpfsSupported()) return null;
  const root = await getOpfsRoot();
  if (!root) return null;

  try {
    const ideasDir = await root.getDirectoryHandle(IDEAS_OPFS_DIR, { create: false });
    const fileHandle = await ideasDir.getFileHandle(IDEAS_OPFS_FILE, { create: false });
    const file = await fileHandle.getFile();
    const text = await readBlobAsText(file);
    if (!text.trim()) return [];
    return parseIdeaList(JSON.parse(text));
  } catch {
    return null;
  }
}

async function withQuotaRetry<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (err) {
    if (!isQuotaExceededError(err)) {
      throw err;
    }
    try {
      await purgeOpfsTmp();
    } catch {
      // Best-effort purge before retry
    }
    return task();
  }
}

/**
 * Loads all captured ideas from offline storage (IndexedDB primary, OPFS/localStorage fallback).
 */
export async function loadCapturedIdeas(): Promise<CapturedIdeaEntry[]> {
  const idbIdeas = await readAllFromIdb();
  if (idbIdeas !== null && idbIdeas.length > 0) {
    return idbIdeas;
  }

  const opfsIdeas = await readIdeasFromOpfs();
  if (opfsIdeas !== null && opfsIdeas.length > 0) {
    return opfsIdeas;
  }

  const localIdeas = readLocalFallback();
  if (localIdeas.length > 0) {
    return localIdeas;
  }

  return idbIdeas ?? opfsIdeas ?? [];
}

/**
 * Sanitizes raw user idea text, creates a timestamped entry, and persists it offline.
 */
export async function saveCapturedIdea(rawText: string): Promise<{
  entry: CapturedIdeaEntry;
  ideas: CapturedIdeaEntry[];
  truncated: boolean;
}> {
  const sanitized = sanitizeIdeaInput(rawText);
  if (!sanitized.ok) {
    throw new Error(sanitized.error);
  }

  const existing = await loadCapturedIdeas();
  if (existing.length >= MAX_CAPTURED_IDEAS_COUNT) {
    throw new Error(
      `Captured ideas limit (${MAX_CAPTURED_IDEAS_COUNT}) reached. Copy or export your pending ideas and clear older entries first.`
    );
  }

  const entry: CapturedIdeaEntry = {
    id: generateUuid(),
    text: sanitized.sanitizedText,
    createdAtIso: nowIsoUtc(),
  };

  const nextIdeas = sortIdeasNewestFirst([entry, ...existing]).slice(0, MAX_CAPTURED_IDEAS_COUNT);

  await withQuotaRetry(async () => {
    let persistedAnywhere = false;
    let lastQuotaError: unknown = null;

    try {
      if (await putEntryInIdb(entry)) {
        persistedAnywhere = true;
      }
    } catch (err) {
      if (isQuotaExceededError(err)) lastQuotaError = err;
    }

    try {
      if (await writeIdeasToOpfs(nextIdeas)) {
        persistedAnywhere = true;
      }
    } catch (err) {
      if (isQuotaExceededError(err)) lastQuotaError = err;
    }

    try {
      if (writeLocalFallback(nextIdeas)) {
        persistedAnywhere = true;
      }
    } catch (err) {
      if (isQuotaExceededError(err)) lastQuotaError = err;
    }

    if (!persistedAnywhere) {
      if (lastQuotaError) {
        throw lastQuotaError;
      }
      throw new Error('Could not persist captured idea to offline browser storage.');
    }
  });

  return {
    entry,
    ideas: nextIdeas,
    truncated: sanitized.truncated,
  };
}

/**
 * Removes a single captured idea by ID across offline stores.
 */
export async function deleteCapturedIdea(id: string): Promise<CapturedIdeaEntry[]> {
  const existing = await loadCapturedIdeas();
  const nextIdeas = existing.filter((item) => item.id !== id);

  try {
    await deleteEntryInIdb(id);
  } catch {
    // Non-fatal fallback
  }
  try {
    await writeIdeasToOpfs(nextIdeas);
  } catch {
    // Non-fatal fallback
  }
  try {
    writeLocalFallback(nextIdeas);
  } catch {
    // Non-fatal fallback
  }

  return nextIdeas;
}

/**
 * Clears all pending captured ideas after the user has exported or copied them.
 */
export async function clearCapturedIdeas(): Promise<CapturedIdeaEntry[]> {
  try {
    await clearAllInIdb();
  } catch {
    // Non-fatal fallback
  }
  try {
    await writeIdeasToOpfs([]);
  } catch {
    // Non-fatal fallback
  }
  try {
    writeLocalFallback([]);
  } catch {
    // Non-fatal fallback
  }
  return [];
}
```

## `src/storage/crashLogger.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Offline Crash Handler, Verbose Diagnostic & Memory Logger, and Retention Manager.
 *
 * Captures:
 * - Uncaught window runtime errors & resource load errors
 * - Unhandled Promise rejections (async IndexedDB / SQLite / image / ZIP errors)
 * - React ErrorBoundary component crashes
 * - Memory pressure warnings (`performance.memory`, `QuotaExceededError`, Allocation failures)
 * - Unclean previous-session exits (detects Android/iOS OS tab kills or silent OOM crashes)
 * - Verbose console error/warning & key storage/backup lifecycle breadcrumbs
 *
 * Storage Guardrails:
 * - Bounded retention window (`3`, `7`, or `14` days; default `7` days) + max entry count (500)
 * - Synchronous `localStorage` ring buffer for critical/error logs so crash data survives sudden kills
 * - IndexedDB store for full verbose history with automatic pruning
 */

import { generateUuid, nowIsoUtc } from '../core/models';
import type {
  DiagnosticCategory,
  DiagnosticConfig,
  DiagnosticLogEntry,
  DiagnosticLogLevel,
  DiagnosticSummary,
  LogRetentionDays,
  MemorySample,
} from '../core/supportBundle';
import {
  BackgroundPausedError,
  notifyBackgroundTransition,
  notifyPageHide,
} from './backgroundFreezeCoordinator';
import {
  getSafeIndexedDb,
  getSafeLocalStorage,
  getSafeSessionStorage,
  getSafeStorageManager,
  trackActiveIdbConnection,
  trackActiveIdbTransaction,
} from './storageProbes';

export type {
  DiagnosticCategory,
  DiagnosticConfig,
  DiagnosticLogEntry,
  DiagnosticLogLevel,
  DiagnosticSummary,
  LogRetentionDays,
  MemorySample,
};

export const DEFAULT_SUPPORT_EMAIL = '';

const LOG_IDB_NAME = 'community_pedigree_diagnostics_v1';
const LOG_STORE_NAME = 'diagnostic_logs';
const CONFIG_STORAGE_KEY = 'pedigree_diagnostic_config_v1';
const RING_STORAGE_KEY = 'pedigree_crash_ring_v1';
const EMERGENCY_SESSION_TRACE_KEY = 'pedigree_emergency_trace_v1';
const SESSION_HEARTBEAT_KEY = 'pedigree_session_heartbeat_v1';

const MAX_RING_ENTRIES = 60;
const MAX_EMERGENCY_SESSION_ENTRIES = 5;
const MAX_IDB_ENTRIES = 500;
const MEMORY_POLL_INTERVAL_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const VERBOSE_MEMORY_HEARTBEAT_MS = 5 * 60_000;
const ASYNC_TOAST_DEDUPE_MS = 4500;
const ASYNC_TOAST_AUTO_DISMISS_MS = 9000;
const MAX_ACTIVE_ASYNC_TOASTS = 2;

export interface AsyncErrorNotice {
  id: string;
  timestampMs: number;
  title: string;
  detail: string;
  severity: 'warning' | 'error';
  sticky: boolean;
  category: DiagnosticCategory;
  canOpenDiagnostics?: boolean;
  actionLabel?: string;
  actionJobId?: string;
}

const DEFAULT_CONFIG: DiagnosticConfig = {
  verboseEnabled: true,
  retentionDays: 7,
  supportEmail: DEFAULT_SUPPORT_EMAIL,
};

interface SessionHeartbeat {
  sessionId: string;
  active: boolean;
  startedAtMs: number;
  lastAliveMs: number;
  lastRoute: string;
  lastHeapPercent: number | null;
  lastHeapBytes: number | null;
}

const SESSION_STARTED_AT_MS = Date.now();
const SESSION_ID = `sess-${SESSION_STARTED_AT_MS.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

let handlersInstalled = false;
let currentRoute = 'boot';
let lastLoggedMemoryBytes: number | null = null;
let lastVerboseMemoryLogMs = 0;
let loggingConsole = false;
let memoryIntervalId: ReturnType<typeof setInterval> | null = null;
let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;

const subscribers = new Set<() => void>();
const asyncToastSubscribers = new Set<(notices: AsyncErrorNotice[]) => void>();
let activeAsyncToasts: AsyncErrorNotice[] = [];
const asyncToastTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastToastBySignature = new Map<string, number>();

function notifySubscribers(): void {
  for (const cb of subscribers) {
    try {
      cb();
    } catch {
      // Never let a diagnostic subscriber crash logging
    }
  }
}

export function subscribeDiagnosticLogs(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

function notifyAsyncToastSubscribers(): void {
  const snapshot = [...activeAsyncToasts];
  for (const cb of asyncToastSubscribers) {
    try {
      cb(snapshot);
    } catch {
      // Never let UI subscriber crash error toast emitter
    }
  }
}

export function getActiveAsyncErrorToasts(): AsyncErrorNotice[] {
  return [...activeAsyncToasts];
}

export function dismissAsyncErrorToast(id: string): void {
  const timer = asyncToastTimers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    asyncToastTimers.delete(id);
  }
  const next = activeAsyncToasts.filter((t) => t.id !== id);
  if (next.length !== activeAsyncToasts.length) {
    activeAsyncToasts = next;
    notifyAsyncToastSubscribers();
  }
}

export function subscribeAsyncErrorToasts(
  callback: (notices: AsyncErrorNotice[]) => void
): () => void {
  asyncToastSubscribers.add(callback);
  try {
    callback([...activeAsyncToasts]);
  } catch {
    // Ignore initial callback error
  }
  return () => {
    asyncToastSubscribers.delete(callback);
  };
}

/**
 * Emits a deduplicated, memory-bounded UI notice for uncaught async errors or paused background work.
 * Minor warnings auto-dismiss after 9s; severity issues (storage/quota/memory/write failure) remain
 * sticky until dismissed.
 */
export function emitAsyncErrorToast(params: {
  title: string;
  detail: string;
  severity: 'warning' | 'error';
  sticky?: boolean;
  category?: DiagnosticCategory;
  canOpenDiagnostics?: boolean;
  actionLabel?: string;
  actionJobId?: string;
}): AsyncErrorNotice | null {
  const cleanTitle = sanitizeLogString(params.title, 120);
  const cleanDetail = sanitizeLogString(params.detail, 260);
  const signature = `${params.severity}|${cleanTitle}|${cleanDetail}`.toLowerCase();
  const now = Date.now();

  const lastShown = lastToastBySignature.get(signature);
  if (lastShown !== undefined && now - lastShown < ASYNC_TOAST_DEDUPE_MS) {
    return null;
  }
  lastToastBySignature.set(signature, now);
  if (lastToastBySignature.size > 32) {
    // Keep signature map tightly bounded
    const oldestKey = lastToastBySignature.keys().next().value;
    if (oldestKey !== undefined) {
      lastToastBySignature.delete(oldestKey);
    }
  }

  const sticky = params.sticky ?? params.severity === 'error';
  const notice: AsyncErrorNotice = {
    id: generateUuid(),
    timestampMs: now,
    title: cleanTitle,
    detail: cleanDetail,
    severity: params.severity,
    sticky,
    category: params.category || 'promise',
    canOpenDiagnostics: params.canOpenDiagnostics ?? params.severity === 'error',
    actionLabel: params.actionLabel,
    actionJobId: params.actionJobId,
  };

  while (activeAsyncToasts.length >= MAX_ACTIVE_ASYNC_TOASTS) {
    // Drop oldest non-sticky notice first, otherwise oldest notice
    const nonStickyIdx = activeAsyncToasts.findIndex((t) => !t.sticky);
    const dropIdx = nonStickyIdx >= 0 ? nonStickyIdx : 0;
    const [dropped] = activeAsyncToasts.splice(dropIdx, 1);
    if (dropped) {
      const oldTimer = asyncToastTimers.get(dropped.id);
      if (oldTimer !== undefined) {
        clearTimeout(oldTimer);
        asyncToastTimers.delete(dropped.id);
      }
    }
  }

  activeAsyncToasts = [...activeAsyncToasts, notice];
  if (!sticky) {
    const timer = setTimeout(() => {
      asyncToastTimers.delete(notice.id);
      dismissAsyncErrorToast(notice.id);
    }, ASYNC_TOAST_AUTO_DISMISS_MS);
    asyncToastTimers.set(notice.id, timer);
  }
  notifyAsyncToastSubscribers();
  return notice;
}

export function resetAsyncErrorToastsForTests(): void {
  for (const timer of asyncToastTimers.values()) {
    clearTimeout(timer);
  }
  asyncToastTimers.clear();
  lastToastBySignature.clear();
  activeAsyncToasts = [];
  notifyAsyncToastSubscribers();
}

export function setCurrentDiagnosticRoute(route: string): void {
  currentRoute = route || 'unknown';
  updateSessionHeartbeat(true);
}

export function getDiagnosticConfig(): DiagnosticConfig {
  const ls = getSafeLocalStorage();
  if (!ls) return { ...DEFAULT_CONFIG };
  try {
    const raw = ls.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<DiagnosticConfig>;
    const days = parsed.retentionDays === 3 || parsed.retentionDays === 7 || parsed.retentionDays === 14
      ? parsed.retentionDays
      : DEFAULT_CONFIG.retentionDays;
    return {
      verboseEnabled: parsed.verboseEnabled !== false,
      retentionDays: days,
      supportEmail: '',
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function updateDiagnosticConfig(patch: Partial<DiagnosticConfig>): DiagnosticConfig {
  const next: DiagnosticConfig = {
    ...getDiagnosticConfig(),
    ...patch,
    supportEmail: '',
  };
  if (next.retentionDays !== 3 && next.retentionDays !== 7 && next.retentionDays !== 14) {
    next.retentionDays = 7;
  }
  const ls = getSafeLocalStorage();
  if (ls) {
    try {
      ls.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota issue while saving config
    }
  }
  void pruneExpiredDiagnosticLogs();
  notifySubscribers();
  return next;
}

function sanitizeLogString(raw: unknown, maxLen: number): string {
  let str: string;
  if (typeof raw === 'string') {
    str = raw;
  } else if (raw instanceof Error) {
    str = `${raw.name}: ${raw.message}`;
  } else {
    try {
      str = JSON.stringify(raw);
    } catch {
      str = String(raw ?? '');
    }
  }
  // Scrub large base64 data URIs so logs never cause memory bloat
  str = str.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]{80,}/g, '[image-data-uri omitted]');
  if (str.length > maxLen) {
    return `${str.slice(0, maxLen)}… [truncated]`;
  }
  return str;
}

export function captureMemorySample(): MemorySample {
  const perfMem =
    typeof performance !== 'undefined'
      ? (performance as Performance & {
          memory?: {
            usedJSHeapSize?: number;
            totalJSHeapSize?: number;
            jsHeapSizeLimit?: number;
          };
        }).memory
      : undefined;

  const usedHeapBytes =
    perfMem && typeof perfMem.usedJSHeapSize === 'number' ? perfMem.usedJSHeapSize : null;
  const totalHeapBytes =
    perfMem && typeof perfMem.totalJSHeapSize === 'number' ? perfMem.totalJSHeapSize : null;
  const heapLimitBytes =
    perfMem && typeof perfMem.jsHeapSizeLimit === 'number' ? perfMem.jsHeapSizeLimit : null;
  const heapPercent =
    usedHeapBytes !== null && heapLimitBytes && heapLimitBytes > 0
      ? Math.round((usedHeapBytes / heapLimitBytes) * 1000) / 10
      : null;

  const nav =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { deviceMemory?: number })
      : undefined;
  const deviceMemoryGb = nav && typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;

  return {
    usedHeapBytes,
    totalHeapBytes,
    heapLimitBytes,
    heapPercent,
    deviceMemoryGb,
  };
}

export async function captureMemoryAndStorageSample(): Promise<MemorySample> {
  const base = captureMemorySample();
  const storage = getSafeStorageManager();
  if (storage && typeof storage.estimate === 'function') {
    try {
      const est = await storage.estimate();
      base.storageUsageBytes = Number(est.usage) || 0;
      base.storageQuotaBytes = Number(est.quota) || 0;
    } catch {
      // Ignore storage estimate failures
    }
  }
  return base;
}

export function isMemoryLikeError(errOrMessage: unknown): boolean {
  const text =
    errOrMessage instanceof Error
      ? `${errOrMessage.name} ${errOrMessage.message} ${errOrMessage.stack || ''}`
      : String(errOrMessage ?? '');
  return /out of memory|oom|allocation failed|array buffer allocation|rangeerror|quotaexceeded|ns_error_dom_quota|datacloneerror|maximum call stack|cannot allocate|memory/i.test(
    text
  );
}

function getCutoffTimestampMs(retentionDays: number): number {
  return Date.now() - Math.max(1, retentionDays) * 86_400_000;
}

export function shouldIgnoreConsoleDiagnosticMessage(message: string): boolean {
  const trimmed = String(message || '').trim();
  if (!trimmed) return false;
  // Vite dev-client logs harmless WebSocket messages when HMR/WS is disabled behind an HTTP preview proxy
  return /^\[vite\]\s+(?:failed to connect to websocket|server connection lost|connecting\.\.\.)/i.test(
    trimmed
  );
}

export function normalizeStoredDiagnosticEntry(
  entry: DiagnosticLogEntry | null | undefined
): DiagnosticLogEntry | null {
  if (!entry || typeof entry.id !== 'string' || typeof entry.timestampMs !== 'number') {
    return null;
  }
  if (entry.category === 'console' && shouldIgnoreConsoleDiagnosticMessage(entry.message)) {
    return null;
  }
  if (
    entry.category === 'memory' &&
    /^Previous session \([^)]+\) terminated unexpectedly without clean pagehide/i.test(
      entry.message || ''
    )
  ) {
    let heapPct: number | null = null;
    if (entry.details) {
      try {
        const parsed = JSON.parse(entry.details) as { lastHeapPercent?: unknown };
        if (typeof parsed.lastHeapPercent === 'number' && Number.isFinite(parsed.lastHeapPercent)) {
          heapPct = parsed.lastHeapPercent;
        }
      } catch {
        // Ignore unparseable details JSON
      }
    }
    if (heapPct === null) {
      const match = /JS heap\s+([0-9]+(?:\.[0-9]+)?)%/i.exec(entry.message || '');
      if (match) {
        heapPct = Number(match[1]);
      }
    }
    if (heapPct === null || heapPct < 70) {
      return {
        ...entry,
        category: 'lifecycle',
        level: entry.level === 'error' || entry.level === 'fatal' ? 'warn' : entry.level,
      };
    }
  }
  return entry;
}

function readRingBuffer(): DiagnosticLogEntry[] {
  const ls = getSafeLocalStorage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(RING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = getCutoffTimestampMs(getDiagnosticConfig().retentionDays);
    const normalized: DiagnosticLogEntry[] = [];
    for (const item of parsed) {
      const clean = normalizeStoredDiagnosticEntry(item as DiagnosticLogEntry);
      if (clean && clean.timestampMs >= cutoff) {
        normalized.push(clean);
      }
    }
    return normalized;
  } catch {
    return [];
  }
}

export function readEmergencySessionTrace(
  sessionStore: Pick<Storage, 'getItem'> | null | undefined = getSafeSessionStorage()
): DiagnosticLogEntry[] {
  if (!sessionStore) return [];
  try {
    const raw = sessionStore.getItem(EMERGENCY_SESSION_TRACE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: any) => item && typeof item.id === 'string' && typeof item.timestampMs === 'number'
    );
  } catch {
    return [];
  }
}

export function clearEmergencySessionTrace(
  sessionStore: Pick<Storage, 'removeItem'> | null | undefined = getSafeSessionStorage()
): void {
  if (!sessionStore) return;
  try {
    sessionStore.removeItem(EMERGENCY_SESSION_TRACE_KEY);
  } catch {
    // Ignore
  }
}

export function writeEmergencySessionTraceSync(
  entry: DiagnosticLogEntry,
  sessionStore: Pick<Storage, 'getItem' | 'setItem'> | null | undefined = getSafeSessionStorage()
): boolean {
  if (!sessionStore) return false;
  const compactEntry: DiagnosticLogEntry = {
    id: entry.id,
    timestampIso: entry.timestampIso,
    timestampMs: entry.timestampMs,
    sessionId: entry.sessionId,
    level: entry.level,
    category: entry.category,
    route: entry.route,
    message: sanitizeLogString(entry.message, 240),
    stack: entry.stack ? sanitizeLogString(entry.stack, 240) : undefined,
  };
  try {
    const existing = readEmergencySessionTrace(sessionStore).filter((e) => e.id !== entry.id);
    const next = [...existing, compactEntry].slice(-MAX_EMERGENCY_SESSION_ENTRIES);
    sessionStore.setItem(EMERGENCY_SESSION_TRACE_KEY, JSON.stringify(next));
    return true;
  } catch {
    try {
      sessionStore.setItem(EMERGENCY_SESSION_TRACE_KEY, JSON.stringify([compactEntry]));
      return true;
    } catch {
      return false;
    }
  }
}

function writeRingBufferSync(entry: DiagnosticLogEntry): void {
  let localWriteOk = false;
  const ls = getSafeLocalStorage();
  if (ls) {
    try {
      const existing = readRingBuffer();
      const cutoff = getCutoffTimestampMs(getDiagnosticConfig().retentionDays);
      const filtered = [
        ...existing.filter((e) => e.id !== entry.id && e.timestampMs >= cutoff),
        entry,
      ].slice(-MAX_RING_ENTRIES);
      ls.setItem(RING_STORAGE_KEY, JSON.stringify(filtered));
      localWriteOk = true;
    } catch {
      // If localStorage is completely full, trim aggressively and retry once
      try {
        ls.setItem(RING_STORAGE_KEY, JSON.stringify([entry]));
        localWriteOk = true;
      } catch {
        localWriteOk = false;
      }
    }
  }
  if (!localWriteOk) {
    writeEmergencySessionTraceSync(entry);
  }
}

function openLogsIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb = getSafeIndexedDb();
    if (!idb) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Diagnostics IndexedDB open timeout'));
    }, 6000);

    try {
      const req = idb.open(LOG_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(LOG_STORE_NAME)) {
            const store = db.createObjectStore(LOG_STORE_NAME, { keyPath: 'id' });
            store.createIndex('timestampMs', 'timestampMs', { unique: false });
          }
        } catch (upgradeErr) {
          void import('./opfsStorage')
            .then((m) =>
              m.dumpIndexedDbDatabaseToOpfs(
                LOG_IDB_NAME,
                'Diagnostics IndexedDB schema upgrade failed'
              )
            )
            .catch(() => {});
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(upgradeErr);
          }
        }
      };
      req.onblocked = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error('Diagnostics IndexedDB open blocked'));
      };
      req.onsuccess = () => {
        if (settled) {
          try {
            req.result.close();
          } catch {
            // Ignore
          }
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(req.result);
      };
      req.onerror = () => {
        const err = req.error;
        if (err && (err.name === 'VersionError' || /version/i.test(String(err.message || '')))) {
          void import('./opfsStorage')
            .then((m) =>
              m.dumpIndexedDbDatabaseToOpfs(LOG_IDB_NAME, 'Diagnostics IndexedDB VersionError')
            )
            .catch(() => {});
        }
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      };
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    }
  });
}

async function persistEntryToIdb(entry: DiagnosticLogEntry): Promise<void> {
  if (!getSafeIndexedDb()) return;
  let db: IDBDatabase | null = null;
  let untrackDb: (() => void) | null = null;
  try {
    db = await openLogsIdb();
    untrackDb = trackActiveIdbConnection(db);
    await new Promise<void>((resolve) => {
      const tx = db!.transaction(LOG_STORE_NAME, 'readwrite');
      const untrackTx = trackActiveIdbTransaction(tx);
      const store = tx.objectStore(LOG_STORE_NAME);
      store.put(entry);
      tx.oncomplete = () => {
        untrackTx();
        resolve();
      };
      tx.onerror = () => {
        untrackTx();
        resolve();
      };
      tx.onabort = () => {
        untrackTx();
        resolve();
      };
    });
  } catch {
    // Ring buffer already persisted critical entries synchronously
  } finally {
    untrackDb?.();
    db?.close();
  }
}

export async function pruneExpiredDiagnosticLogs(): Promise<void> {
  const cfg = getDiagnosticConfig();
  const cutoff = getCutoffTimestampMs(cfg.retentionDays);

  const ls = getSafeLocalStorage();
  if (ls) {
    try {
      const ring = readRingBuffer().filter((e) => e.timestampMs >= cutoff);
      ls.setItem(RING_STORAGE_KEY, JSON.stringify(ring));
    } catch {
      // Ignore
    }
  }

  if (!getSafeIndexedDb()) return;
  let db: IDBDatabase | null = null;
  let untrackDb: (() => void) | null = null;
  try {
    db = await openLogsIdb();
    untrackDb = trackActiveIdbConnection(db);
    await new Promise<void>((resolve) => {
      const tx = db!.transaction(LOG_STORE_NAME, 'readwrite');
      const untrackTx = trackActiveIdbTransaction(tx);
      const store = tx.objectStore(LOG_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = (req.result as DiagnosticLogEntry[]) || [];
        all.sort((a, b) => b.timestampMs - a.timestampMs);
        all.forEach((item, idx) => {
          if (item.timestampMs < cutoff || idx >= MAX_IDB_ENTRIES) {
            store.delete(item.id);
          }
        });
      };
      tx.oncomplete = () => {
        untrackTx();
        resolve();
      };
      tx.onerror = () => {
        untrackTx();
        resolve();
      };
      tx.onabort = () => {
        untrackTx();
        resolve();
      };
    });
  } catch {
    // Ignore
  } finally {
    untrackDb?.();
    db?.close();
  }
}

export async function listDiagnosticLogs(): Promise<DiagnosticLogEntry[]> {
  const cfg = getDiagnosticConfig();
  const cutoff = getCutoffTimestampMs(cfg.retentionDays);
  const ring = readRingBuffer();
  const byId = new Map<string, DiagnosticLogEntry>();
  for (const e of ring) {
    if (e.timestampMs >= cutoff) byId.set(e.id, e);
  }

  if (getSafeIndexedDb()) {
    let db: IDBDatabase | null = null;
    let untrackDb: (() => void) | null = null;
    try {
      db = await openLogsIdb();
      untrackDb = trackActiveIdbConnection(db);
      const idbItems = await new Promise<DiagnosticLogEntry[]>((resolve) => {
        const tx = db!.transaction(LOG_STORE_NAME, 'readonly');
        const untrackTx = trackActiveIdbTransaction(tx);
        const req = tx.objectStore(LOG_STORE_NAME).getAll();
        req.onsuccess = () => {
          untrackTx();
          resolve((req.result as DiagnosticLogEntry[]) || []);
        };
        req.onerror = () => {
          untrackTx();
          resolve([]);
        };
        tx.onabort = () => {
          untrackTx();
          resolve([]);
        };
      });
      for (const e of idbItems) {
        const clean = normalizeStoredDiagnosticEntry(e);
        if (clean && clean.timestampMs >= cutoff) {
          byId.set(clean.id, clean);
        }
      }
    } catch {
      // Fall back to ring buffer entries
    } finally {
      untrackDb?.();
      db?.close();
    }
  }

  for (const e of readEmergencySessionTrace()) {
    const clean = normalizeStoredDiagnosticEntry(e);
    if (clean && clean.timestampMs >= cutoff && !byId.has(clean.id)) {
      byId.set(clean.id, clean);
    }
  }

  return Array.from(byId.values()).sort((a, b) => b.timestampMs - a.timestampMs);
}

export async function clearAllDiagnosticLogs(): Promise<void> {
  clearEmergencySessionTrace();
  const ls = getSafeLocalStorage();
  if (ls) {
    try {
      ls.removeItem(RING_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
  if (getSafeIndexedDb()) {
    let db: IDBDatabase | null = null;
    let untrackDb: (() => void) | null = null;
    try {
      db = await openLogsIdb();
      untrackDb = trackActiveIdbConnection(db);
      await new Promise<void>((resolve) => {
        const tx = db!.transaction(LOG_STORE_NAME, 'readwrite');
        const untrackTx = trackActiveIdbTransaction(tx);
        tx.objectStore(LOG_STORE_NAME).clear();
        tx.oncomplete = () => {
          untrackTx();
          resolve();
        };
        tx.onerror = () => {
          untrackTx();
          resolve();
        };
        tx.onabort = () => {
          untrackTx();
          resolve();
        };
      });
    } catch {
      // Ignore
    } finally {
      untrackDb?.();
      db?.close();
    }
  }
  notifySubscribers();
}

export async function getDiagnosticSummary(
  prefetchedEntries?: DiagnosticLogEntry[]
): Promise<DiagnosticSummary> {
  const entries = prefetchedEntries ?? (await listDiagnosticLogs());
  const cfg = getDiagnosticConfig();
  const currentMemory = await captureMemoryAndStorageSample();
  const errorCount = entries.filter((e) => e.level === 'error' || e.level === 'fatal').length;
  const memoryWarningCount = entries.filter(
    (e) => e.category === 'memory' && (e.level === 'warn' || e.level === 'error' || e.level === 'fatal')
  ).length;
  const crashCount = entries.filter(
    (e) => e.level === 'fatal' || e.category === 'react'
  ).length;

  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const ua = nav?.userAgent || 'Unknown browser';
  const cores = nav?.hardwareConcurrency ? `${nav.hardwareConcurrency} cores` : 'unknown cores';
  const viewport =
    typeof window !== 'undefined'
      ? `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}x`
      : 'non-DOM';

  return {
    totalEntries: entries.length,
    errorCount,
    memoryWarningCount,
    crashCount,
    oldestEntryIso: entries.length ? entries[entries.length - 1].timestampIso : null,
    newestEntryIso: entries.length ? entries[0].timestampIso : null,
    currentMemory,
    config: cfg,
    sessionId: SESSION_ID,
    userAgent: ua,
    platformInfo: `${viewport} · ${cores}${currentMemory.deviceMemoryGb ? ` · ${currentMemory.deviceMemoryGb}GB RAM` : ''}`,
  };
}

export function logDiagnosticEvent(params: {
  level: DiagnosticLogLevel;
  category: DiagnosticCategory;
  message: string;
  error?: unknown;
  componentStack?: string;
  details?: unknown;
}): DiagnosticLogEntry | null {
  const cfg = getDiagnosticConfig();
  const isCritical =
    params.level === 'error' || params.level === 'fatal' || params.category === 'react';

  // When verbose logging is toggled off, still record errors/crashes/memory faults!
  if (!cfg.verboseEnabled && !isCritical && params.category !== 'memory') {
    return null;
  }

  let stack: string | undefined;
  if (params.error instanceof Error) {
    stack = sanitizeLogString(params.error.stack || params.error.message, 2500);
  } else if (params.error !== undefined) {
    stack = sanitizeLogString(params.error, 1500);
  }

  const allowMemoryReclassification =
    params.category !== 'react' &&
    params.category !== 'lifecycle' &&
    (params.level === 'error' || params.level === 'fatal' || params.level === 'warn');
  const memoryFaultDetected =
    allowMemoryReclassification &&
    (isMemoryLikeError(params.message) || (params.error ? isMemoryLikeError(params.error) : false));
  const category: DiagnosticCategory = memoryFaultDetected ? 'memory' : params.category;

  const entry: DiagnosticLogEntry = {
    id: generateUuid(),
    timestampIso: nowIsoUtc(),
    timestampMs: Date.now(),
    sessionId: SESSION_ID,
    level: params.level,
    category,
    route: currentRoute,
    message: sanitizeLogString(params.message, 600),
    stack,
    componentStack: params.componentStack
      ? sanitizeLogString(params.componentStack, 2500)
      : undefined,
    details:
      params.details !== undefined ? sanitizeLogString(params.details, 1500) : undefined,
    memory: captureMemorySample(),
  };

  if (isCritical || params.level === 'warn' || params.category === 'memory') {
    writeRingBufferSync(entry);
  }

  void persistEntryToIdb(entry).then(() => {
    notifySubscribers();
  });

  if (isCritical || params.level === 'warn') {
    notifySubscribers();
  }

  return entry;
}

export function recordReactCrash(
  error: Error,
  componentStack?: string
): DiagnosticLogEntry | null {
  return logDiagnosticEvent({
    level: 'fatal',
    category: 'react',
    message: `React Render Crash: ${error.name}: ${error.message}`,
    error,
    componentStack,
    details: { memoryFault: isMemoryLikeError(error) },
  });
}

function updateSessionHeartbeat(active: boolean): void {
  const ls = getSafeLocalStorage();
  if (!ls) return;
  try {
    const mem = captureMemorySample();
    const hb: SessionHeartbeat = {
      sessionId: SESSION_ID,
      active,
      startedAtMs: SESSION_STARTED_AT_MS,
      lastAliveMs: Date.now(),
      lastRoute: currentRoute,
      lastHeapPercent: mem.heapPercent,
      lastHeapBytes: mem.usedHeapBytes,
    };
    ls.setItem(SESSION_HEARTBEAT_KEY, JSON.stringify(hb));
  } catch {
    // Ignore heartbeat write failures
  }
}

export function markCleanSessionExit(): void {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
  if (memoryIntervalId) {
    clearInterval(memoryIntervalId);
    memoryIntervalId = null;
  }
  updateSessionHeartbeat(false);
}

export function inspectPreviousSessionUncleanExit(): DiagnosticLogEntry | null {
  const ls = getSafeLocalStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(SESSION_HEARTBEAT_KEY);
    if (!raw) return null;
    const prev = JSON.parse(raw) as Partial<SessionHeartbeat>;
    if (prev.active && prev.sessionId && prev.sessionId !== SESSION_ID) {
      const gapMs = prev.lastAliveMs ? Date.now() - prev.lastAliveMs : 0;
      const highHeap = (prev.lastHeapPercent ?? 0) >= 70;
      const lastAliveIso = prev.lastAliveMs
        ? new Date(prev.lastAliveMs).toISOString()
        : 'unknown time';
      const reasonHint = highHeap
        ? 'Elevated JS heap — possible out-of-memory reload or mobile OS tab kill.'
        : 'Possible mobile OS tab suspension, browser reload, or iframe unmount.';
      return logDiagnosticEvent({
        level: highHeap ? 'error' : 'warn',
        category: highHeap ? 'memory' : 'lifecycle',
        message: `Previous session (${prev.sessionId}) terminated unexpectedly without clean pagehide (last active ${lastAliveIso}, route "${prev.lastRoute || 'unknown'}"${
          prev.lastHeapPercent !== null && prev.lastHeapPercent !== undefined
            ? `, JS heap ${prev.lastHeapPercent}%`
            : ''
        }). ${reasonHint}`,
        details: {
          previousSessionId: prev.sessionId,
          lastRoute: prev.lastRoute,
          lastHeapPercent: prev.lastHeapPercent,
          lastHeapBytes: prev.lastHeapBytes,
          downtimeMs: gapMs,
        },
      });
    }
  } catch {
    // Ignore malformed heartbeat
  }
  return null;
}

async function sampleMemoryPressure(): Promise<void> {
  const mem = await captureMemoryAndStorageSample();
  const cfg = getDiagnosticConfig();
  const used = mem.usedHeapBytes;
  const heapPct = mem.heapPercent;

  const deltaBytes =
    used !== null && lastLoggedMemoryBytes !== null ? used - lastLoggedMemoryBytes : 0;
  if (used !== null) {
    lastLoggedMemoryBytes = used;
  }

  const storagePct =
    mem.storageUsageBytes && mem.storageQuotaBytes && mem.storageQuotaBytes > 0
      ? Math.round((mem.storageUsageBytes / mem.storageQuotaBytes) * 1000) / 10
      : 0;

  if (heapPct !== null && heapPct >= 88) {
    logDiagnosticEvent({
      level: 'error',
      category: 'memory',
      message: `Critical JS heap memory pressure (${heapPct}% of browser heap limit)`,
      details: { ...mem, deltaBytes, storagePct },
    });
    return;
  }

  if (heapPct !== null && heapPct >= 75) {
    logDiagnosticEvent({
      level: 'warn',
      category: 'memory',
      message: `High JS heap memory usage (${heapPct}% of browser heap limit)`,
      details: { ...mem, deltaBytes, storagePct },
    });
    return;
  }

  if (deltaBytes >= 45 * 1024 * 1024) {
    logDiagnosticEvent({
      level: 'warn',
      category: 'memory',
      message: `Sudden JS heap spike (+${Math.round(deltaBytes / (1024 * 1024))} MB since last sample)`,
      details: { ...mem, deltaBytes, storagePct },
    });
    return;
  }

  if (storagePct >= 85) {
    logDiagnosticEvent({
      level: 'warn',
      category: 'storage',
      message: `Browser local storage quota high (${storagePct}% used)`,
      details: { ...mem, storagePct },
    });
    return;
  }

  const now = Date.now();
  if (cfg.verboseEnabled && now - lastVerboseMemoryLogMs >= VERBOSE_MEMORY_HEARTBEAT_MS) {
    lastVerboseMemoryLogMs = now;
    logDiagnosticEvent({
      level: 'debug',
      category: 'memory',
      message: `Periodic memory & storage snapshot (${
        heapPct !== null ? `${heapPct}% heap` : 'heap metric n/a'
      }, ${storagePct}% storage)`,
      details: { ...mem, storagePct },
    });
  }
}

export function handleUnhandledRejectionReason(reason: unknown): void {
  const errName = reason && typeof reason === 'object' ? String((reason as { name?: string }).name || '') : '';
  // Skip intentional user file-picker cancellations cleanly
  if (errName === 'AbortError') {
    return;
  }

  const rawMsg =
    reason instanceof Error
      ? `${reason.name}: ${reason.message}`
      : sanitizeLogString(reason, 400);

  if (reason instanceof BackgroundPausedError || errName === 'BackgroundPausedError') {
    const pausedErr = reason as BackgroundPausedError;
    const isSeverity = Boolean(pausedErr.severityIssue);
    logDiagnosticEvent({
      level: isSeverity ? 'warn' : 'info',
      category: 'lifecycle',
      message: rawMsg,
    });
    emitAsyncErrorToast({
      title: isSeverity ? `${pausedErr.taskName} Needs Attention` : `${pausedErr.taskName} Paused`,
      detail: isSeverity
        ? `${pausedErr.severityIssue} Tap Resume when ready.`
        : 'Progress was checkpointed when the app moved to the background and will resume automatically.',
      severity: isSeverity ? 'error' : 'warning',
      sticky: isSeverity,
      category: 'lifecycle',
      canOpenDiagnostics: isSeverity,
    });
    return;
  }

  const quotaLike =
    /quotaexceeded|ns_error_dom_quota/i.test(rawMsg) ||
    errName === 'QuotaExceededError' ||
    errName === 'NS_ERROR_DOM_QUOTA_REACHED';
  const memoryLike = isMemoryLikeError(reason || rawMsg);

  logDiagnosticEvent({
    level: 'error',
    category: memoryLike ? 'memory' : quotaLike ? 'storage' : 'promise',
    message: `Unhandled Promise Rejection: ${rawMsg}`,
    error: reason,
  });

  if (quotaLike) {
    emitAsyncErrorToast({
      title: 'Device Storage Full',
      detail:
        'A background save could not fit in browser storage. Open Backups to download a .JSON copy or free space.',
      severity: 'error',
      sticky: true,
      category: 'storage',
      canOpenDiagnostics: true,
    });
  } else if (memoryLike) {
    emitAsyncErrorToast({
      title: 'Low Memory During Background Action',
      detail:
        'Close other tabs or switch to Compact photos in Import & Settings, then retry your action.',
      severity: 'error',
      sticky: true,
      category: 'memory',
      canOpenDiagnostics: true,
    });
  } else {
    emitAsyncErrorToast({
      title: 'Background Task Did Not Finish',
      detail: `${sanitizeLogString(rawMsg, 150)} — Open Diagnostics to inspect details.`,
      severity: 'error',
      sticky: true,
      category: 'promise',
      canOpenDiagnostics: true,
    });
  }
}

export function installGlobalCrashHandlers(): void {
  if (typeof window === 'undefined' || handlersInstalled) return;
  handlersInstalled = true;

  inspectPreviousSessionUncleanExit();
  updateSessionHeartbeat(true);
  void pruneExpiredDiagnosticLogs();

  logDiagnosticEvent({
    level: 'info',
    category: 'lifecycle',
    message: `App diagnostic session started (${SESSION_ID})`,
  });

  // 1. Global uncaught errors & resource load errors
  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && target !== (window as unknown) && 'tagName' in target) {
        const src = (target as HTMLImageElement).src || (target as HTMLScriptElement).src || '';
        logDiagnosticEvent({
          level: 'error',
          category: 'runtime',
          message: `Resource load error on <${target.tagName.toLowerCase()}>`,
          details: { src },
        });
        return;
      }

      const errObj = event.error;
      const msg = event.message || (errObj instanceof Error ? errObj.message : 'Uncaught runtime error');
      logDiagnosticEvent({
        level: 'fatal',
        category: isMemoryLikeError(errObj || msg) ? 'memory' : 'runtime',
        message: msg,
        error: errObj,
        details: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    },
    true
  );

  // 2. Unhandled Promise rejections
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    handleUnhandledRejectionReason(event.reason);
  });

  // 3. Intercept console.error and console.warn safely
  const origConsoleError = console.error.bind(console);
  const origConsoleWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    origConsoleError(...args);
    if (loggingConsole) return;
    loggingConsole = true;
    try {
      const firstErr = args.find((a) => a instanceof Error);
      const summary = args.map((a) => sanitizeLogString(a, 300)).join(' ');
      if (shouldIgnoreConsoleDiagnosticMessage(summary)) {
        return;
      }
      logDiagnosticEvent({
        level: 'error',
        category: isMemoryLikeError(firstErr || summary) ? 'memory' : 'console',
        message: summary || 'console.error triggered',
        error: firstErr,
      });
    } finally {
      loggingConsole = false;
    }
  };

  console.warn = (...args: unknown[]) => {
    origConsoleWarn(...args);
    if (loggingConsole) return;
    loggingConsole = true;
    try {
      const summary = args.map((a) => sanitizeLogString(a, 300)).join(' ');
      if (summary && !shouldIgnoreConsoleDiagnosticMessage(summary)) {
        logDiagnosticEvent({
          level: 'warn',
          category: isMemoryLikeError(summary) ? 'memory' : 'console',
          message: summary,
        });
      }
    } finally {
      loggingConsole = false;
    }
  };

  const startVisibleWatchdogs = () => {
    if (document.visibilityState === 'hidden') return;
    if (!heartbeatIntervalId) {
      heartbeatIntervalId = setInterval(() => {
        if (document.visibilityState === 'visible') {
          updateSessionHeartbeat(true);
        }
      }, HEARTBEAT_INTERVAL_MS);
    }
    if (!memoryIntervalId) {
      memoryIntervalId = setInterval(() => {
        if (document.visibilityState === 'visible') {
          void sampleMemoryPressure();
        }
      }, MEMORY_POLL_INTERVAL_MS);
    }
  };

  const handleCleanBackgroundHide = () => {
    markCleanSessionExit();
    notifyBackgroundTransition('hidden');
  };

  const handleCleanPageHide = () => {
    markCleanSessionExit();
    notifyPageHide();
  };

  // 4. bfcache-safe pagehide / freeze / visibilitychange lifecycle hooks (avoid beforeunload)
  window.addEventListener('pagehide', handleCleanPageHide);

  document.addEventListener('freeze', handleCleanPageHide);

  document.addEventListener('resume', () => {
    updateSessionHeartbeat(true);
    void sampleMemoryPressure();
    startVisibleWatchdogs();
    notifyBackgroundTransition('visible');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      handleCleanBackgroundHide();
    } else {
      updateSessionHeartbeat(true);
      void sampleMemoryPressure();
      startVisibleWatchdogs();
      notifyBackgroundTransition('visible');
    }
  });

  // 5. Start heartbeat + memory watchdog only while foregrounded
  startVisibleWatchdogs();
}
```

## `src/storage/deviceCapabilityDetector.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Browser Hardware & Feature Signal Collector, Per-Device Dismissal State & React Hook
 * (`src/storage/deviceCapabilityDetector.ts`).
 *
 * Dismissal state is stored strictly in per-device `localStorage` (not inside the
 * portable BarnSettings JSON/SQLite snapshot) so restoring a desktop Tier 5 backup onto
 * a low-memory mobile device never suppresses critical Tier 1 / Tier 2 warnings.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assessBrowserCompatibility,
  BrowserCompatibilityAssessment,
  BrowserFeatureSignals,
  classifyDeviceCapability,
  DeviceCapabilityAssessment,
  DeviceHardwareSignals,
} from '../core/deviceCapability';
import { logDiagnosticEvent } from './crashLogger';
import { isArchiveWorkerDisabled } from './offThreadWorkerClient';
import {
  getSafeIndexedDb,
  getSafeLocalStorage,
  getSafeStorageManager,
} from './storageProbes';

const HOME_DISMISSED_KEY = 'pedigree.deviceCapability.homeDismissed.v1';
const SETTINGS_DISMISSED_KEY = 'pedigree.deviceCapability.settingsDismissed.v1';

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize?: number;
    totalJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  };
}

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number;
}

let cachedWebpEncodeSupported: boolean | null = null;

export function probeWebpEncodeSupport(): boolean {
  if (cachedWebpEncodeSupported !== null) return cachedWebpEncodeSupported;
  if (typeof document === 'undefined') {
    return true;
  }
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    if (typeof canvas.toDataURL !== 'function') {
      cachedWebpEncodeSupported = false;
      return false;
    }
    const url = canvas.toDataURL('image/webp');
    cachedWebpEncodeSupported = typeof url === 'string' && url.indexOf('data:image/webp') === 0;
  } catch {
    cachedWebpEncodeSupported = false;
  } finally {
    if (canvas) {
      try {
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (ctx && typeof ctx.clearRect === 'function') {
          ctx.clearRect(0, 0, 1, 1);
        }
      } catch {
        // Ignore teardown error
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  }
  return cachedWebpEncodeSupported;
}

export function readBrowserHardwareSignals(): DeviceHardwareSignals {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      deviceMemoryGb: null,
      hardwareConcurrency: null,
      jsHeapLimitBytes: null,
      usedHeapBytes: null,
      userAgent: '',
      maxTouchPoints: 0,
      coarsePointer: false,
      screenWidthPx: null,
      screenHeightPx: null,
      devicePixelRatio: null,
    };
  }

  const nav = navigator as NavigatorWithDeviceMemory;
  const deviceMemoryGb =
    typeof nav.deviceMemory === 'number' && Number.isFinite(nav.deviceMemory) && nav.deviceMemory > 0
      ? nav.deviceMemory
      : null;

  const hardwareConcurrency =
    typeof navigator.hardwareConcurrency === 'number' &&
    Number.isFinite(navigator.hardwareConcurrency) &&
    navigator.hardwareConcurrency > 0
      ? navigator.hardwareConcurrency
      : null;

  let jsHeapLimitBytes: number | null = null;
  let usedHeapBytes: number | null = null;
  try {
    const perf = typeof performance !== 'undefined' ? (performance as PerformanceWithMemory) : null;
    if (perf?.memory) {
      if (
        typeof perf.memory.jsHeapSizeLimit === 'number' &&
        Number.isFinite(perf.memory.jsHeapSizeLimit)
      ) {
        jsHeapLimitBytes = perf.memory.jsHeapSizeLimit;
      }
      if (
        typeof perf.memory.usedJSHeapSize === 'number' &&
        Number.isFinite(perf.memory.usedJSHeapSize)
      ) {
        usedHeapBytes = perf.memory.usedJSHeapSize;
      }
    }
  } catch {
    // Ignore restricted performance.memory access
  }

  let coarsePointer = false;
  try {
    if (typeof window.matchMedia === 'function') {
      coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    }
  } catch {
    coarsePointer = false;
  }

  let screenWidthPx: number | null = null;
  let screenHeightPx: number | null = null;
  try {
    if (typeof window.screen !== 'undefined') {
      if (typeof window.screen.width === 'number' && Number.isFinite(window.screen.width)) {
        screenWidthPx = window.screen.width;
      }
      if (typeof window.screen.height === 'number' && Number.isFinite(window.screen.height)) {
        screenHeightPx = window.screen.height;
      }
    }
  } catch {
    // Ignore restricted screen access
  }

  const devicePixelRatio =
    typeof window.devicePixelRatio === 'number' && Number.isFinite(window.devicePixelRatio)
      ? window.devicePixelRatio
      : null;

  return {
    deviceMemoryGb,
    hardwareConcurrency,
    jsHeapLimitBytes,
    usedHeapBytes,
    userAgent: navigator.userAgent || '',
    maxTouchPoints: typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0,
    coarsePointer,
    screenWidthPx,
    screenHeightPx,
    devicePixelRatio,
  };
}

export function readBrowserFeatureSignals(): BrowserFeatureSignals {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      userAgent: '',
      promiseSupported: true,
      indexedDbSupported: true,
      wasmSupported: true,
      moduleWorkerSupported: true,
      opfsSupported: true,
      directoryPickerSupported: true,
      persistStorageSupported: true,
      clipboardWriteSupported: true,
      webShareFilesSupported: true,
      webpEncodeSupported: true,
      createImageBitmapSupported: true,
      workerRuntimeDisabled: false,
    };
  }

  const indexedDbSupported = getSafeIndexedDb() !== null;

  let wasmSupported = false;
  try {
    wasmSupported =
      typeof WebAssembly === 'object' &&
      WebAssembly !== null &&
      typeof WebAssembly.instantiate === 'function';
  } catch {
    wasmSupported = false;
  }

  const storageObj = getSafeStorageManager();

  const opfsSupported =
    storageObj !== null && typeof storageObj.getDirectory === 'function';

  const persistStorageSupported =
    storageObj !== null && typeof storageObj.persist === 'function';

  let directoryPickerSupported = false;
  try {
    directoryPickerSupported =
      'showDirectoryPicker' in window &&
      typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker ===
        'function';
  } catch {
    directoryPickerSupported = false;
  }

  const clipboardWriteSupported =
    typeof navigator.clipboard !== 'undefined' &&
    navigator.clipboard !== null &&
    typeof navigator.clipboard.writeText === 'function';

  const webShareFilesSupported =
    typeof navigator.share === 'function' && typeof navigator.canShare === 'function';

  const workerDisabled = isArchiveWorkerDisabled();

  return {
    userAgent: navigator.userAgent || '',
    promiseSupported: typeof Promise === 'function',
    indexedDbSupported,
    wasmSupported,
    moduleWorkerSupported: typeof Worker === 'function',
    opfsSupported,
    directoryPickerSupported,
    persistStorageSupported,
    clipboardWriteSupported,
    webShareFilesSupported,
    webpEncodeSupported: probeWebpEncodeSupport(),
    createImageBitmapSupported: typeof createImageBitmap === 'function',
    workerRuntimeDisabled: workerDisabled,
  };
}

export function detectCurrentDeviceCapability(): DeviceCapabilityAssessment {
  return classifyDeviceCapability(readBrowserHardwareSignals());
}

export function detectCurrentBrowserCompatibility(
  assessment?: DeviceCapabilityAssessment
): BrowserCompatibilityAssessment {
  const resolved = assessment ?? detectCurrentDeviceCapability();
  return assessBrowserCompatibility(readBrowserFeatureSignals(), resolved.tier);
}

function readLocalFlag(key: string): boolean {
  try {
    const ls = getSafeLocalStorage();
    if (!ls) return false;
    return ls.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeLocalFlag(key: string, value: boolean): void {
  try {
    const ls = getSafeLocalStorage();
    if (!ls) return;
    if (value) {
      ls.setItem(key, '1');
    } else {
      ls.removeItem(key);
    }
  } catch {
    // Ignore quota or private-browsing storage restrictions
  }
}

export interface DeviceCapabilityController {
  assessment: DeviceCapabilityAssessment;
  browserCompatibility: BrowserCompatibilityAssessment;
  homeDismissed: boolean;
  settingsDismissed: boolean;
  homeVisible: boolean;
  settingsVisible: boolean;
  canCloseOnHome: boolean;
  canCloseInSettings: boolean;
  dismissOnHome: () => void;
  reopenOnHome: () => void;
  dismissInSettings: () => void;
  reopenInSettings: () => void;
  refreshDetection: () => void;
}

export function useDeviceCapability(): DeviceCapabilityController {
  const [assessment, setAssessment] = useState<DeviceCapabilityAssessment>(() =>
    detectCurrentDeviceCapability()
  );
  const [browserCompatibility, setBrowserCompatibility] = useState<BrowserCompatibilityAssessment>(
    () => detectCurrentBrowserCompatibility(assessment)
  );
  const [homeDismissedRaw, setHomeDismissedRaw] = useState<boolean>(() =>
    readLocalFlag(HOME_DISMISSED_KEY)
  );
  const [settingsDismissedRaw, setSettingsDismissedRaw] = useState<boolean>(() =>
    readLocalFlag(SETTINGS_DISMISSED_KEY)
  );

  const loggedInitialRef = useRef(false);

  useEffect(() => {
    if (loggedInitialRef.current) return;
    loggedInitialRef.current = true;
    logDiagnosticEvent({
      level: assessment.tier === 1 || browserCompatibility.isOutdatedBrowser ? 'warn' : 'info',
      category: assessment.shouldApplyLowMemoryHandling ? 'memory' : 'lifecycle',
      message: `Device capability detected: ${assessment.definition.shortLabel} (${assessment.signalSummary})${
        browserCompatibility.wasmFallbackActive ? ' · WebAssembly unavailable (JSON fallback)' : ''
      }${browserCompatibility.isOutdatedBrowser ? ' · Older browser engine detected' : ''}`,
      details: {
        tier: assessment.tier,
        formFactor: assessment.formFactor,
        confidence: assessment.confidence,
        deviceMemoryGb: assessment.signals.deviceMemoryGb,
        hardwareConcurrency: assessment.signals.hardwareConcurrency,
        jsHeapLimitBytes: assessment.signals.jsHeapLimitBytes,
        wasmSupported: browserCompatibility.signals.wasmSupported,
        opfsSupported: browserCompatibility.signals.opfsSupported,
        directoryPickerSupported: browserCompatibility.signals.directoryPickerSupported,
        isOutdatedBrowser: browserCompatibility.isOutdatedBrowser,
      },
    });
  }, [assessment, browserCompatibility]);

  const canCloseOnHome = assessment.definition.homeClosable;
  const canCloseInSettings = assessment.definition.settingsClosable;

  // Enforce tier visibility rules strictly regardless of any previously saved flags:
  // - Tier 1: never closable on Home OR Settings
  // - Tier 2: closable on Home, persistent (never closable) in Settings
  // - Tier 3–5: closable on Home & Settings, and reopenable from Settings
  const homeDismissed = canCloseOnHome ? homeDismissedRaw : false;
  const settingsDismissed = canCloseInSettings ? settingsDismissedRaw : false;

  const dismissOnHome = useCallback(() => {
    if (!canCloseOnHome) return;
    writeLocalFlag(HOME_DISMISSED_KEY, true);
    setHomeDismissedRaw(true);
  }, [canCloseOnHome]);

  const reopenOnHome = useCallback(() => {
    writeLocalFlag(HOME_DISMISSED_KEY, false);
    setHomeDismissedRaw(false);
  }, []);

  const dismissInSettings = useCallback(() => {
    if (!canCloseInSettings) return;
    writeLocalFlag(SETTINGS_DISMISSED_KEY, true);
    setSettingsDismissedRaw(true);
  }, [canCloseInSettings]);

  const reopenInSettings = useCallback(() => {
    writeLocalFlag(SETTINGS_DISMISSED_KEY, false);
    setSettingsDismissedRaw(false);
  }, []);

  const refreshDetection = useCallback(() => {
    const nextAssessment = detectCurrentDeviceCapability();
    setAssessment(nextAssessment);
    setBrowserCompatibility(detectCurrentBrowserCompatibility(nextAssessment));
  }, []);

  return {
    assessment,
    browserCompatibility,
    homeDismissed,
    settingsDismissed,
    homeVisible: !homeDismissed,
    settingsVisible: !settingsDismissed,
    canCloseOnHome,
    canCloseInSettings,
    dismissOnHome,
    reopenOnHome,
    dismissInSettings,
    reopenInSettings,
    refreshDetection,
  };
}
```

## `src/storage/feedTagOcr.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pre-Compression Feed Tag OCR & Biosecurity Image Capture Pipeline (`src/storage/feedTagOcr.ts`).
 *
 * Strategy:
 * 1. Decodes the full-resolution feed tag / receipt image BEFORE compression.
 * 2. Renders an EXIF-oriented, contrast-boosted grayscale canvas (capped safely at 2200px)
 *    so faded mill inkjet stamps remain readable to OCR without crashing mobile memory.
 * 3. Attempts Chromium/Android native `TextDetector` first (zero-network, instant),
 *    then lazy-loads `tesseract.js` in a bounded worker with `try/finally` termination.
 * 4. Fails softly offline (`status: 'offline_manual'`) so breeders can always inspect the photo
 *    and enter or override the stamped lot number manually.
 * 5. Compresses the stored tag image via `optimizeImageBlob(..., 'compact')` afterwards.
 */

import {
  extractFeedTagDetailsFromOcrText,
  FeedTagOcrParseResult,
} from '../core/feedInventory';
import { OptimizedImagePayload } from '../core/imageOptimizationSpec';
import { todayDateIso } from '../core/models';
import {
  enforceCanvasDimensions,
  optimizeImageBlob,
  releaseCanvas,
} from './webImageOptimizer';

export type FeedTagOcrStatus =
  | 'detected'
  | 'no_lot_found'
  | 'offline_manual'
  | 'ocr_failed';

export interface FeedTagCaptureResult {
  status: FeedTagOcrStatus;
  engine: 'native-text-detector' | 'tesseract-js' | 'none';
  rawText: string;
  confidence: number;
  parsed: FeedTagOcrParseResult;
  optimizedImage: OptimizedImagePayload;
  capturedDateIso: string;
  warningMessage?: string;
}

interface NativeDetectedTextBlock {
  rawValue?: string;
}

interface NativeTextDetectorConstructor {
  new (): {
    detect(image: ImageBitmapSource): Promise<NativeDetectedTextBlock[]>;
  };
}

const OCR_MAX_DIMENSION_PX = 2200;
const OCR_WORKER_TIMEOUT_MS = 18_000;

async function decodeRawImageForOcr(
  file: Blob
): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall back to HTMLImageElement
    }
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    const releaseImageObjectUrl = () => {
      img.onload = null;
      img.onerror = null;
      try {
        img.src = '';
      } catch {
        // Ignore readonly src teardown
      }
      URL.revokeObjectURL(objectUrl);
    };
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width || 1,
        height: img.naturalHeight || img.height || 1,
        cleanup: releaseImageObjectUrl,
      });
    };
    img.onerror = () => {
      releaseImageObjectUrl();
      reject(new Error('Could not decode image file for feed tag OCR.'));
    };
    img.src = objectUrl;
  });
}

function buildContrastOcrCanvas(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number
): HTMLCanvasElement {
  const longest = Math.max(srcWidth, srcHeight, 1);
  const scale = longest > OCR_MAX_DIMENSION_PX ? OCR_MAX_DIMENSION_PX / longest : 1;
  const safeDims = enforceCanvasDimensions(
    Math.max(1, Math.round(srcWidth * scale)),
    Math.max(1, Math.round(srcHeight * scale))
  );
  const targetWidth = safeDims.width;
  const targetHeight = safeDims.height;

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    releaseCanvas(canvas);
    throw new Error('2D Canvas context unavailable for feed tag OCR.');
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

  // Convert to grayscale and boost contrast slightly to lift faded mill dot-matrix stamps
  try {
    const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const data = imgData.data;
    const contrast = 1.38;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const stretched = Math.max(0, Math.min(255, (lum - 128) * contrast + 128));
      data[i] = stretched;
      data[i + 1] = stretched;
      data[i + 2] = stretched;
    }
    ctx.putImageData(imgData, 0, 0);
  } catch {
    // Non-fatal if browser restricts getImageData
  }

  return canvas;
}

async function tryNativeTextDetector(canvas: HTMLCanvasElement): Promise<string> {
  const win = typeof window !== 'undefined' ? (window as unknown as { TextDetector?: NativeTextDetectorConstructor }) : undefined;
  const DetectorCtor = win?.TextDetector;
  if (typeof DetectorCtor !== 'function') return '';
  try {
    const detector = new DetectorCtor();
    const blocks = await detector.detect(canvas);
    return blocks
      .map((b) => (typeof b.rawValue === 'string' ? b.rawValue.trim() : ''))
      .filter(Boolean)
      .join('\n');
  } catch {
    return '';
  }
}

async function runTesseractWorkerWithTimeout(
  canvas: HTMLCanvasElement,
  onProgress?: (stageLabel: string, progressPct?: number) => void
): Promise<{ text: string; confidence: number }> {
  const { createWorker } = await import('tesseract.js');
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const workPromise = (async () => {
    onProgress?.('Loading local OCR recognizer...', 20);
    worker = await createWorker('eng', 1, {
      logger: (msg) => {
        if (msg.status === 'recognizing text' && typeof msg.progress === 'number') {
          onProgress?.('Reading stamped lot numbers...', Math.round(35 + msg.progress * 55));
        }
      },
    });
    const res = await worker.recognize(canvas);
    return {
      text: typeof res.data?.text === 'string' ? res.data.text : '',
      confidence:
        typeof res.data?.confidence === 'number' && Number.isFinite(res.data.confidence)
          ? Math.max(0, Math.min(100, Math.round(res.data.confidence)))
          : 0,
    };
  })();

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Feed tag OCR timed out. Enter or adjust the stamped lot code manually.'));
    }, OCR_WORKER_TIMEOUT_MS);
  });

  try {
    return await Promise.race([workPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
    if (worker) {
      try {
        await (worker as { terminate: () => Promise<unknown> }).terminate();
      } catch {
        // Ignore worker cleanup errors
      }
    }
  }
}

/**
 * Captures a feed bag tag / receipt photo, executes pre-compression OCR to index mill lot codes,
 * and compresses the stored photo afterwards so heavy phone photos never bloat local SQLite.
 */
export async function captureFeedTagWithPreCompressionOcr(
  file: File,
  onProgress?: (stageLabel: string, progressPct?: number) => void
): Promise<FeedTagCaptureResult> {
  onProgress?.('Decoding full-resolution tag image...', 10);

  let rawText = '';
  let confidence = 0;
  let engine: FeedTagCaptureResult['engine'] = 'none';
  let warningMessage: string | undefined;
  let ocrErroredOffline = false;

  const decoded = await decodeRawImageForOcr(file);
  let ocrCanvas: HTMLCanvasElement | null = null;

  try {
    ocrCanvas = buildContrastOcrCanvas(decoded.source, decoded.width, decoded.height);

    // 1. Fast zero-network native TextDetector if available
    const nativeText = await tryNativeTextDetector(ocrCanvas);
    const nativeParsed = nativeText ? extractFeedTagDetailsFromOcrText(nativeText) : null;
    if (nativeText && nativeParsed && nativeParsed.bestLotNumber) {
      rawText = nativeText;
      confidence = 85;
      engine = 'native-text-detector';
    } else {
      // 2. Fallback to lazy tesseract.js OCR on the pre-compressed high-contrast canvas
      try {
        const tessRes = await runTesseractWorkerWithTimeout(ocrCanvas, onProgress);
        rawText = tessRes.text || nativeText;
        confidence = tessRes.confidence;
        engine = 'tesseract-js';
      } catch (err) {
        if (nativeText) {
          rawText = nativeText;
          confidence = 60;
          engine = 'native-text-detector';
        } else {
          ocrErroredOffline = true;
          const msg = err instanceof Error ? err.message : 'OCR unavailable';
          const looksOffline =
            (typeof navigator !== 'undefined' && navigator.onLine === false) ||
            /fetch|network|failed|load|import|traineddata|timeout/i.test(msg);
          warningMessage = looksOffline
            ? 'Offline or OCR language pack uncached — tag photo was saved cleanly. Enter the lot number manually.'
            : `OCR could not read stamp (${msg}). Tag photo saved cleanly; enter lot number manually.`;
        }
      }
    }
  } finally {
    releaseCanvas(ocrCanvas);
    ocrCanvas = null;
    decoded.cleanup();
  }

  onProgress?.('Compressing tag image for compact local storage...', 92);
  const optimizedImage = await optimizeImageBlob(
    file,
    file.name || 'feed-tag.jpg',
    'compact'
  );
  const parsed = extractFeedTagDetailsFromOcrText(rawText);

  let status: FeedTagOcrStatus = 'no_lot_found';
  if (parsed.bestLotNumber) {
    status = 'detected';
  } else if (ocrErroredOffline) {
    status = 'offline_manual';
  } else if (!rawText.trim()) {
    status = 'no_lot_found';
    warningMessage =
      warningMessage ||
      'No readable text detected on tag stamp (faded ink or glare). Confirm lot number manually.';
  } else {
    warningMessage =
      'Text was scanned, but no clear mill lot code matched automatically — select a token or type manually.';
  }

  onProgress?.('Done', 100);

  return {
    status,
    engine,
    rawText: parsed.sanitizedRawText,
    confidence,
    parsed,
    optimizedImage,
    capturedDateIso: todayDateIso(),
    warningMessage,
  };
}
```

<!-- END OF PART 14 OF 16 (9 files) -->
