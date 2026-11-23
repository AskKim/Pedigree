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
import type { PreRestoreArchiveInspection } from '../core/archiveInspector';
import type { BarnBenchBatchEntryDraft } from '../core/barnBench';
import type { CloudSyncProvider, CloudSyncSettings } from '../core/cloudAppFolderSync';
import type { P2pReconciliationSummary } from '../core/p2pSyncProtocol';
import type { PhotoStorageFootprintReport } from '../core/photoMaintenance';
import { reconcileCarrierTraitLists } from '../core/carrierGenetics';
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
  BarnJournalEntry,
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
  JudgeAssignment,
  JudgeClubContact,
  JudgeExpense,
  LedgerEntry,
  LitterWeightMilestone,
  MileageLog,
  normalizeBreedScheduleOverrides,
  normalizeCalendarSyncSettings,
  normalizeDefaultPedigreeGenerations,
  normalizeFeedPurgeWindowDays,
  normalizeIgnoredConflicts,
  normalizeLedgerCategory,
  normalizeClientKind,
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
import { normalizeBarnJournalEntry } from '../core/barnJournal';
import {
  normalizeJudgeAssignment,
  normalizeJudgeClubContact,
  normalizeJudgeExpense,
} from '../core/judgeNotebook';
import { normalizeMileageLog } from '../core/mileageTaxLog';
import { normalizeWoolHarvest } from '../core/woolFiber';
import type { CrmFollowUpReminder } from '../core/clientCrm';
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
import type { ConflictSelectionMap } from '../core/importers/conflictResolver';
import { PlatformImportPreview } from '../core/importers/importerTypes';
import type { SpeciesBackupReason } from '../core/syncAndExports';
import type {
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
  acknowledgeCloudCircuitBreakerWarning,
  clearAllCloudSyncState,
  clearCloudSyncMemoryToken,
  CloudSyncClientState,
  consumeCloudOAuthPkceCallback,
  getCloudSyncClientState,
  resetPersistedCloudCircuitBreaker,
  runCloudAppFolderSync,
  RunCloudAppFolderSyncResult,
  setCloudSyncMemoryToken,
  startCloudOAuthPkceRedirect,
  updatePersistedCloudSyncSettings,
} from '../storage/cloudAppFolderSync';
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
  | 'journal'
  | 'judge'
  | 'importExport'
  | 'settings'
  | 'techyStuff'
  | 'prompts'
  | 'suggestions';

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
  mileageLogs: MileageLog[];
  journalEntries: BarnJournalEntry[];
  judgeClubs: JudgeClubContact[];
  judgeAssignments: JudgeAssignment[];
  judgeExpenses: JudgeExpense[];
  testingRecordCount: number;
  nonTestingRecordCount: number;
  totalRecordCount: number;
}

const NON_SPECIES_ROUTES = new Set<WorkspaceRoute>([
  'home',
  'settings',
  'importExport',
  'techyStuff',
  'prompts',
  'suggestions',
]);

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
  const activeSpeciesNameRef = useRef<string>(activeSpeciesName);
  activeSpeciesNameRef.current = activeSpeciesName;
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
  const [cloudSyncState, setCloudSyncState] = useState<CloudSyncClientState>(() =>
    getCloudSyncClientState()
  );
  const [cloudSyncBusy, setCloudSyncBusy] = useState<boolean>(false);
  const cloudBackgroundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleBackgroundCloudSyncRef = useRef<() => void>(() => {});

  const maxRevByEntityRef = useRef<Map<string, number>>(new Map());
  const maxRevIndexReadyRef = useRef<boolean>(false);
  const maxRevIndexPromiseRef = useRef<Promise<void> | null>(null);
  const syncOperationsHydratedRef = useRef<boolean>(false);

  const rebuildMaxRevIndex = useCallback((ops: SyncOperation[]) => {
    const map = new Map<string, number>();
    for (const op of ops) {
      if (typeof op.record_rev === 'number' && Number.isFinite(op.record_rev)) {
        const prev = map.get(op.entity_uuid) ?? 0;
        if (op.record_rev > prev) {
          map.set(op.entity_uuid, op.record_rev);
        }
      }
    }
    maxRevByEntityRef.current = map;
    maxRevIndexReadyRef.current = true;
  }, []);

  const mergeMaxRevIndex = useCallback((ops: SyncOperation[]) => {
    const map = maxRevByEntityRef.current;
    for (const op of ops) {
      if (typeof op.record_rev === 'number' && Number.isFinite(op.record_rev)) {
        const prev = map.get(op.entity_uuid) ?? 0;
        if (op.record_rev > prev) {
          map.set(op.entity_uuid, op.record_rev);
        }
      }
    }
    maxRevIndexReadyRef.current = true;
  }, []);

  const loadSyncOperationsFromIdbAndIndex = useCallback(async (): Promise<SyncOperation[]> => {
    const ops = await loadAllSyncOperationsFromIdb();
    mergeMaxRevIndex(ops);
    return ops;
  }, [mergeMaxRevIndex]);

  const ensureMaxRevIndexInitialized = useCallback((): Promise<void> => {
    if (maxRevIndexReadyRef.current) return Promise.resolve();
    if (!maxRevIndexPromiseRef.current) {
      maxRevIndexPromiseRef.current = loadAllSyncOperationsFromIdb()
        .then((ops) => {
          mergeMaxRevIndex(ops);
          if (syncOperationsHydratedRef.current) {
            syncOperationsRef.current = ops;
            setSyncOperations(ops);
          }
        })
        .catch((err) => {
          logDiagnosticEvent({
            level: 'warn',
            category: 'storage',
            message:
              'Corrective action: Failed loading local sync outbox on startup — initialized empty outbox queue',
            error: err,
          });
          maxRevIndexReadyRef.current = true;
        })
        .finally(() => {
          maxRevIndexPromiseRef.current = null;
        });
    }
    return maxRevIndexPromiseRef.current;
  }, [mergeMaxRevIndex]);

  const nextEntityRev = useCallback((entityUuid: string, currentRev?: number): number => {
    const revArg = typeof currentRev === 'number' && Number.isFinite(currentRev) ? currentRev : 0;
    const revIndexed = maxRevByEntityRef.current.get(entityUuid) ?? 0;
    const maxSeen = revArg > revIndexed ? revArg : revIndexed;
    return bumpRecordRevision({ _rev: maxSeen });
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
    const revMap = maxRevByEntityRef.current;
    for (const op of writtenOps) {
      if (typeof op.record_rev === 'number' && Number.isFinite(op.record_rev)) {
        const prev = revMap.get(op.entity_uuid) ?? 0;
        if (op.record_rev > prev) {
          revMap.set(op.entity_uuid, op.record_rev);
        }
      }
    }
    if (syncOperationsHydratedRef.current) {
      const nextOps = [...syncOperationsRef.current, ...writtenOps];
      syncOperationsRef.current = nextOps;
      setSyncOperations(nextOps);
    }
    // Schedule non-blocking background cloud delta sync after local IDB outbox commit succeeds.
    // Cloud sync errors (including 403/507 quota) never block or roll back IndexedDB writes.
    try {
      scheduleBackgroundCloudSyncRef.current();
    } catch {
      // Non-blocking safeguard
    }
  }, []);

  const clearLocalSyncAndBackupReminderState = useCallback(async () => {
    if (cloudBackgroundTimerRef.current !== null) {
      clearTimeout(cloudBackgroundTimerRef.current);
      cloudBackgroundTimerRef.current = null;
    }
    await clearAllSyncStateInIdb();
    const { clearAllVetDocsFolderState } = await import('../storage/vetDocsFolder');
    await clearAllVetDocsFolderState();
    clearPausedBackgroundJob('directory_sync');
    clearAllCloudSyncState();
    setCloudSyncState(getCloudSyncClientState());
    maxRevByEntityRef.current.clear();
    maxRevIndexReadyRef.current = true;
    syncOperationsRef.current = [];
    setSyncOperations([]);
    syncConflictsRef.current = [];
    setSyncConflicts([]);
    setLocalLastBackupMeta(null);
    setLocalSnoozedUntilMs(0);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('pedigree.lastBackupMeta.v1');
        localStorage.removeItem('pedigree.backupReminderSnoozedUntil.v1');
      }
    } catch {
      // Ignore private browsing or restricted iframe storage errors
    }
    const { clearWeatherForecastCache } = await import('../storage/weatherForecast');
    clearWeatherForecastCache();
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

  // Monitor Google Calendar auth state only when direct Google Calendar mode is enabled
  const calendarDeliveryMode = snapshot?.settings.calendarSync?.deliveryMode;
  useEffect(() => {
    if (calendarDeliveryMode !== 'google_calendar') {
      setGoogleAuthConnected(false);
      setGoogleUserEmail(null);
      return;
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

  // Initialize local SQLite / IndexedDB store for fast first paint; defer non-critical probes & auto-repair
  useEffect(() => {
    let mounted = true;
    let deferredTimerId: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      try {
        const adapter = adapterRef.current!;
        const initial = await adapter.initialize({ lightweightPhotos: true });
        const detectedWiped = adapter.getWipedRecoveryContext?.() ?? null;
        if (!detectedWiped?.detected) {
          void sweepOrphanedOpfsTmpOnBoot();
          markPriorUseSentinelFromSnapshot(initial);
        }

        if (!mounted) return;
        snapshotRef.current = initial;
        setSnapshot(initial);
        setWipedRecoveryContext(detectedWiped && detectedWiped.detected ? detectedWiped : null);
        setPedigreeGenerations(initial.settings.defaultGenerations);

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

        // Defer non-critical startup probes, outbox revision index warming, and health auto-repair off first paint
        deferredTimerId = setTimeout(() => {
          if (!mounted) return;
          void refreshVaultAndArchives();

          void requestPersistentStorage()
            .then((persistedStatus) => {
              if (mounted) setStorageStatus(persistedStatus);
            })
            .catch((err) => {
              logDiagnosticEvent({
                level: 'warn',
                category: 'storage',
                message:
                  'Corrective action: Persistent storage status check failed on startup — continuing with standard storage probe',
                error: err,
              });
            });

          void loadAllSyncConflictsFromIdb()
            .then((conflicts) => {
              if (!mounted) return;
              syncConflictsRef.current = conflicts;
              setSyncConflicts(conflicts);
            })
            .catch((err) => {
              logDiagnosticEvent({
                level: 'warn',
                category: 'storage',
                message:
                  'Corrective action: Failed loading sync conflicts on startup — initialized empty conflict list',
                error: err,
              });
            });

          void ensureMaxRevIndexInitialized();

          // Non-destructive deferred startup health check & auto-repair serialized through write queue
          try {
            const healthCandidate = snapshotRef.current ?? initial;
            const healthReport = analyzeBarnDataHealth(healthCandidate);
            if (healthReport.autoRepairableCount > 0) {
              void enqueueStoreMutation(async () => {
                const latestSnap = snapshotRef.current;
                if (!mounted || !latestSnap) return;
                const repaired = repairBarnDataHealth(latestSnap);
                if (repaired.repairsApplied.length === 0) return;
                try {
                  await adapter.replaceSnapshot(repaired.nextSnapshot);
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
                if (mounted) {
                  snapshotRef.current = repaired.nextSnapshot;
                  setSnapshot(repaired.nextSnapshot);
                }
                logDiagnosticEvent({
                  level: 'warn',
                  category: 'storage',
                  message: `Corrective action: Startup health auto-repair fixed ${repaired.repairsApplied.length} database issue(s): ${repaired.repairsApplied.join(' | ')}`,
                  details: repaired.repairsApplied,
                });
              });
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
        }, 0);
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
      if (deferredTimerId !== null) {
        clearTimeout(deferredTimerId);
      }
    };
  }, []);

  // Hydrate full syncOperations array only on routes that render sync/outbox UI; release on other routes
  const isSyncOperationsRoute = route === 'importExport' || route === 'dashboard';
  useEffect(() => {
    if (isLoading) return;
    if (!isSyncOperationsRoute) {
      syncOperationsHydratedRef.current = false;
      syncOperationsRef.current = [];
      setSyncOperations((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    let active = true;
    syncOperationsHydratedRef.current = true;
    void loadSyncOperationsFromIdbAndIndex()
      .then((ops) => {
        if (!active || !syncOperationsHydratedRef.current) return;
        syncOperationsRef.current = ops;
        setSyncOperations(ops);
      })
      .catch(() => {
        // Non-fatal; outbox remains safely in IndexedDB
      });
    return () => {
      active = false;
    };
  }, [isLoading, isSyncOperationsRoute, loadSyncOperationsFromIdbAndIndex]);

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
      if (!isSameSpecies(activeSpeciesNameRef.current, speciesName)) {
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
    []
  );

  const isNonSpeciesRoute = NON_SPECIES_ROUTES.has(route);

  /**
   * Strictly species-isolated slice of all records for `activeSpeciesName`.
   * Skips heavy filtering/sorting when viewing global non-species routes (`home`, `settings`, etc.).
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
        mileageLogs: [],
        journalEntries: [],
        judgeClubs: [],
        judgeAssignments: [],
        judgeExpenses: [],
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
      .sort((a, b) => a.priorityRank - b.priorityRank || b.createdAt.localeCompare(a.createdAt));

    const animalReservations = (snapshot.animalReservations ?? [])
      .filter((r) => isSameSpecies(r.species, speciesProfile.name))
      .sort((a, b) =>
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

    const mileageLogs = (snapshot.mileageLogs ?? [])
      .filter((m) => isSameSpecies(m.species, speciesProfile.name))
      .sort(
        (a, b) =>
          (b.dateIso || '').localeCompare(a.dateIso || '') ||
          b.createdAt.localeCompare(a.createdAt)
      );

    const journalEntries = (snapshot.journalEntries ?? [])
      .filter((j) => isSameSpecies(j.species, speciesProfile.name))
      .sort(
        (a, b) =>
          (b.entryDateIso || '').localeCompare(a.entryDateIso || '') ||
          (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
          b.createdAt.localeCompare(a.createdAt)
      );

    const judgeClubs = (snapshot.judgeClubs ?? [])
      .filter((c) => isSameSpecies(c.species, speciesProfile.name))
      .sort((a, b) => a.clubName.localeCompare(b.clubName) || b.createdAt.localeCompare(a.createdAt));

    const judgeAssignments = (snapshot.judgeAssignments ?? [])
      .filter((a) => isSameSpecies(a.species, speciesProfile.name))
      .sort(
        (a, b) =>
          (a.showDateIso || '').localeCompare(b.showDateIso || '') ||
          b.createdAt.localeCompare(a.createdAt)
      );

    const judgeExpenses = (snapshot.judgeExpenses ?? [])
      .filter((e) => isSameSpecies(e.species, speciesProfile.name))
      .sort(
        (a, b) =>
          (b.dateIso || '').localeCompare(a.dateIso || '') ||
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
      mileageLogs,
      journalEntries,
      judgeClubs,
      judgeAssignments,
      judgeExpenses,
      testingRecordCount,
      nonTestingRecordCount,
      totalRecordCount,
    };
  }, [snapshot, activeSpeciesName, isNonSpeciesRoute]);

  const conflictsBySpeciesAnimalId = useMemo(() => {
    if (!baseSpeciesData || isNonSpeciesRoute || baseSpeciesData.animals.length === 0) {
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
  }, [baseSpeciesData, isNonSpeciesRoute]);

  const coiByAnimalId = useMemo(() => {
    const map = new Map<string, CoiAnalysis>();
    if (!baseSpeciesData || isNonSpeciesRoute || baseSpeciesData.animals.length === 0) return map;
    if (route === 'pedigree') {
      const targetSubject =
        (pedigreeAnimalId && baseSpeciesData.herdById.get(pedigreeAnimalId)) ||
        baseSpeciesData.animals[0] ||
        null;
      if (targetSubject) {
        const evaluator = createSpeciesCoiEvaluator(baseSpeciesData.herdById);
        map.set(targetSubject.id, evaluator.calculateAnimalCoi(targetSubject));
      }
    } else if (route === 'herd' && selectedAnimalId) {
      const selected = baseSpeciesData.herdById.get(selectedAnimalId);
      if (selected) {
        const evaluator = createSpeciesCoiEvaluator(baseSpeciesData.herdById);
        map.set(selected.id, evaluator.calculateAnimalCoi(selected));
      }
    }
    return map;
  }, [baseSpeciesData, isNonSpeciesRoute, route, pedigreeAnimalId, selectedAnimalId]);

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

  const loadFeedBatchTagPhotoDataUrl = useCallback(async (batchId: string): Promise<string | null> => {
    if (!batchId) return null;
    const cache = photoCacheRef.current;
    const cacheKey = `feed-tag:${batchId}`;
    const cached = cache?.get(cacheKey);
    if (cached) return cached;
    const inState = (snapshotRef.current?.feedBatches ?? []).find((b) => b.id === batchId);
    if (inState?.tagPhotoDataUrl) {
      cache?.set(cacheKey, inState.tagPhotoDataUrl);
      return inState.tagPhotoDataUrl;
    }
    const fetched = await adapterRef.current?.loadFeedBatchTagPhotoDataUrl?.(batchId);
    if (fetched) {
      cache?.set(cacheKey, fetched);
      return fetched;
    }
    return inState?.tagPhotoThumbnailDataUrl || null;
  }, []);

  const loadLedgerEntryReceiptPhotoDataUrl = useCallback(async (entryId: string): Promise<string | null> => {
    if (!entryId) return null;
    const cache = photoCacheRef.current;
    const cacheKey = `ledger-receipt:${entryId}`;
    const cached = cache?.get(cacheKey);
    if (cached) return cached;
    const inState = (snapshotRef.current?.ledgerEntries ?? []).find((le) => le.id === entryId);
    if (inState?.receiptPhotoDataUrl) {
      cache?.set(cacheKey, inState.receiptPhotoDataUrl);
      return inState.receiptPhotoDataUrl;
    }
    const fetched = await adapterRef.current?.loadLedgerEntryReceiptPhotoDataUrl?.(entryId);
    if (fetched) {
      cache?.set(cacheKey, fetched);
      return fetched;
    }
    return inState?.receiptPhotoThumbnailDataUrl || null;
  }, []);

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
        photoCacheRef.current ?? undefined,
        {
          fetchFeedTagBatch: async (ids) =>
            (await adapterRef.current?.loadFeedBatchTagPhotoDataUrlsBatch?.(ids)) ?? {},
          fetchLedgerReceiptBatch: async (ids) =>
            (await adapterRef.current?.loadLedgerEntryReceiptPhotoDataUrlsBatch?.(ids)) ?? {},
        }
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
    if (syncOperationsHydratedRef.current) {
      syncOperationsRef.current = freshOps;
      setSyncOperations(freshOps);
    }
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
  }, [rebuildMaxRevIndex, refreshStorageStatus, refreshVaultAndArchives]);

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

  // Trim cached full-res photos & ancestor caches on hide, and catch remote-tab writes when returning visible
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
                mileageLogs: (currentSnapshot.mileageLogs ?? []).map((m) =>
                  isSameSpecies(m.species, oldName) ? { ...m, species: newName, updatedAt: ts } : m
                ),
                journalEntries: (currentSnapshot.journalEntries ?? []).map((j) =>
                  isSameSpecies(j.species, oldName) ? { ...j, species: newName, updatedAt: ts } : j
                ),
                judgeClubs: (currentSnapshot.judgeClubs ?? []).map((c) =>
                  isSameSpecies(c.species, oldName) ? { ...c, species: newName, updatedAt: ts } : c
                ),
                judgeAssignments: (currentSnapshot.judgeAssignments ?? []).map((a) =>
                  isSameSpecies(a.species, oldName) ? { ...a, species: newName, updatedAt: ts } : a
                ),
                judgeExpenses: (currentSnapshot.judgeExpenses ?? []).map((e) =>
                  isSameSpecies(e.species, oldName) ? { ...e, species: newName, updatedAt: ts } : e
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
      const { buildSpeciesZipBackupFileName } = await import('../core/syncAndExports');
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
        const needsGeneticsEngine =
          (hasExplicitRaw && Boolean(trimmedRaw)) ||
          (!hasExplicitRaw && Boolean(draft.genotype && draft.genotype.length > 0));
        let parsedGeno =
          !hasExplicitRaw && draft.genotype && draft.genotype.length > 0 ? draft.genotype : [];
        let normalizedRaw = trimmedRaw;
        if (needsGeneticsEngine) {
          const { formatGenotypeArray, parseGenotypeString } = await import(
            '../core/geneticsEngine'
          );
          if (hasExplicitRaw && trimmedRaw) {
            parsedGeno =
              draft.genotype &&
              draft.genotype.length > 0 &&
              formatGenotypeArray(draft.genotype) === trimmedRaw
                ? draft.genotype
                : parseGenotypeString(trimmedRaw, draft.species);
          }
          normalizedRaw = trimmedRaw || (hasExplicitRaw ? '' : formatGenotypeArray(parsedGeno));
        }

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
          const { migrateAnimalsToSpecies } = await import('../core/speciesMigration');
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

  const rescheduleTask = useCallback(
    async (
      task: BarnTask,
      nextDates: { startDateIso?: string; dueDateIso: string }
    ): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
        const ts = getAdjustedNowIsoUtc();
        const rev = nextEntityRev(task.id, task._rev);
        const cleanStart = nextDates.startDateIso?.trim() || '';
        const updated: BarnTask = {
          ...task,
          ...(cleanStart ? { startDateIso: cleanStart } : { startDateIso: '' }),
          dueDateIso: nextDates.dueDateIso.trim() || task.dueDateIso,
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
          reportPersistenceFailure('reschedule barn chore', err);
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

  const applySmartTaskEscalations = useCallback(
    async (tasksToEscalate?: BarnTask[]): Promise<number> => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current ?? snapshot;
        if (!currentSnapshot) return 0;
        const sourceTasks = tasksToEscalate ?? currentSnapshot.tasks;
        const ts = getAdjustedNowIsoUtc();
        const { buildPriorityEscalationUpdates } = await import('../core/barnScheduler');
        const rawUpdates = buildPriorityEscalationUpdates(sourceTasks, todayDateIso(), ts);
        if (rawUpdates.length === 0) return 0;

        const prevById = new Map(currentSnapshot.tasks.map((t) => [t.id, t]));
        const revAligned: BarnTask[] = [];
        const ops: SyncOperation[] = [];
        for (const u of rawUpdates) {
          const prev = prevById.get(u.id);
          const rev = nextEntityRev(u.id, prev?._rev ?? u._rev);
          const nextTask: BarnTask = { ...u, _rev: rev, updatedAt: ts };
          revAligned.push(nextTask);
          ops.push(
            ...diffEntityFieldsToOperations({
              entityType: 'task',
              previous: prev,
              next: nextTask,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: rev,
            })
          );
        }

        try {
          await adapterRef.current!.saveTasksBatch(revAligned);
          await recordOutboxOps(ops);
          await reloadFromAdapter();
          notify(
            `Escalated ${revAligned.length} time-critical chore${revAligned.length === 1 ? '' : 's'}.`
          );
          return revAligned.length;
        } catch (err) {
          reportPersistenceFailure('escalate barn chores', err);
          return 0;
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
        const { buildBarnBenchCommitPlan } = await import('../core/barnBench');
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
            const { applyFeedAllocationToBatch } = await import('../core/feedInventory');
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
            const { reverseFeedAllocationFromBatch } = await import('../core/feedInventory');
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
        const { purgeExpiredFeedTagPhotosPure } = await import('../core/feedInventory');
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
    const hasUnpurgedTagPhoto = (currentSnapshot.feedBatches ?? []).some(
      (b) => !b.tagPhotoPurgedAtIso && Boolean(b.tagPhotoThumbnailDataUrl || b.tagPhotoDataUrl)
    );
    if (!hasUnpurgedTagPhoto) {
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
        const { calculateDressOutPercent } = await import('../core/economicsLedger');
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
        const { buildSuggestedAgreementNumber, evaluateReservationFinancials } =
          await import('../core/clientCrm');
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
          draft.species || activeSpeciesNameRef.current || 'Rabbit'
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

  const saveMileageLog = useCallback(
    async (
      draft: Omit<MileageLog, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): Promise<string | null> => {
      return enqueueStoreMutation(async () => {
        const latestSnapshot = snapshotRef.current ?? snapshot;
        const ts = getAdjustedNowIsoUtc();
        const prev = draft.id
          ? (latestSnapshot?.mileageLogs ?? []).find((x) => x.id === draft.id)
          : undefined;
        const id = draft.id || generateUuid();
        const rev = nextEntityRev(id, prev?._rev);
        const normalized = normalizeMileageLog({
          ...draft,
          id,
          species: draft.species || activeSpeciesNameRef.current || 'Rabbit',
          _rev: rev,
          createdAt: prev?.createdAt || ts,
          updatedAt: ts,
        });
        if (!normalized) return null;
        try {
          await adapterRef.current!.saveMileageLog(normalized);
          const outboxOps = diffEntityFieldsToOperations({
            entityType: 'mileageLog',
            previous: prev,
            next: normalized,
            deviceId,
            nextCounter: allocateNextLogicalCounter,
            timestamp: ts,
            recordRev: rev,
          });
          await recordOutboxOps(outboxOps);
          await reloadFromAdapter();
          notify(`Saved mileage trip (${normalized.miles.toFixed(1)} mi on ${normalized.dateIso}).`);
          return id;
        } catch (err) {
          reportPersistenceFailure('save mileage trip', err);
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

  const deleteMileageLog = useCallback(
    async (id: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const target = (currentSnapshot?.mileageLogs ?? []).find((x) => x.id === id);
        const ts = getAdjustedNowIsoUtc();
        try {
          await adapterRef.current!.deleteMileageLog(id);
          await recordOutboxOps([
            createOutboxOperation({
              entityType: 'mileageLog',
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
          notify('Mileage trip deleted.');
        } catch (err) {
          reportPersistenceFailure('delete mileage trip', err);
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

  const saveJournalEntry = useCallback(
    async (
      draft: Omit<BarnJournalEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): Promise<string | null> => {
      return enqueueStoreMutation(async () => {
        const latestSnapshot = snapshotRef.current ?? snapshot;
        const ts = getAdjustedNowIsoUtc();
        const prev = draft.id
          ? (latestSnapshot?.journalEntries ?? []).find((x) => x.id === draft.id)
          : undefined;
        const id = draft.id || generateUuid();
        const rev = nextEntityRev(id, prev?._rev);
        const normalized = normalizeBarnJournalEntry({
          ...draft,
          id,
          species: draft.species || activeSpeciesNameRef.current || 'Rabbit',
          _rev: rev,
          createdAt: prev?.createdAt || ts,
          updatedAt: ts,
        });
        if (!normalized) return null;
        try {
          await adapterRef.current!.saveJournalEntry(normalized);
          const outboxOps = diffEntityFieldsToOperations({
            entityType: 'journalEntry',
            previous: prev,
            next: normalized,
            deviceId,
            nextCounter: allocateNextLogicalCounter,
            timestamp: ts,
            recordRev: rev,
          });
          await recordOutboxOps(outboxOps);
          await reloadFromAdapter();
          notify(`Saved journal entry "${normalized.title}".`);
          return id;
        } catch (err) {
          reportPersistenceFailure('save journal entry', err);
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

  const deleteJournalEntry = useCallback(
    async (id: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const target = (currentSnapshot?.journalEntries ?? []).find((x) => x.id === id);
        const ts = getAdjustedNowIsoUtc();
        try {
          await adapterRef.current!.deleteJournalEntry(id);
          await recordOutboxOps([
            createOutboxOperation({
              entityType: 'journalEntry',
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
          notify('Journal entry deleted.');
        } catch (err) {
          reportPersistenceFailure('delete journal entry', err);
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

  const saveJudgeClub = useCallback(
    async (
      draft: Omit<JudgeClubContact, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): Promise<string | null> => {
      return enqueueStoreMutation(async () => {
        const latestSnapshot = snapshotRef.current ?? snapshot;
        const ts = getAdjustedNowIsoUtc();
        const prev = draft.id
          ? (latestSnapshot?.judgeClubs ?? []).find((x) => x.id === draft.id)
          : undefined;
        const id = draft.id || generateUuid();
        const rev = nextEntityRev(id, prev?._rev);
        const normalized = normalizeJudgeClubContact({
          ...draft,
          id,
          species: draft.species || activeSpeciesNameRef.current || 'Rabbit',
          _rev: rev,
          createdAt: prev?.createdAt || ts,
          updatedAt: ts,
        });
        if (!normalized) return null;
        try {
          await adapterRef.current!.saveJudgeClub(normalized);
          const outboxOps = diffEntityFieldsToOperations({
            entityType: 'judgeClub',
            previous: prev,
            next: normalized,
            deviceId,
            nextCounter: allocateNextLogicalCounter,
            timestamp: ts,
            recordRev: rev,
          });
          await recordOutboxOps(outboxOps);
          await reloadFromAdapter();
          notify(`Saved club contact "${normalized.clubName}".`);
          return id;
        } catch (err) {
          reportPersistenceFailure('save club contact', err);
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

  const deleteJudgeClub = useCallback(
    async (id: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const target = (currentSnapshot?.judgeClubs ?? []).find((x) => x.id === id);
        const ts = getAdjustedNowIsoUtc();
        try {
          await adapterRef.current!.deleteJudgeClub(id);
          await recordOutboxOps([
            createOutboxOperation({
              entityType: 'judgeClub',
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
          notify('Club contact deleted.');
        } catch (err) {
          reportPersistenceFailure('delete club contact', err);
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

  const saveJudgeAssignment = useCallback(
    async (
      draft: Omit<JudgeAssignment, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): Promise<string | null> => {
      return enqueueStoreMutation(async () => {
        const latestSnapshot = snapshotRef.current ?? snapshot;
        const ts = getAdjustedNowIsoUtc();
        const prev = draft.id
          ? (latestSnapshot?.judgeAssignments ?? []).find((x) => x.id === draft.id)
          : undefined;
        const id = draft.id || generateUuid();
        const rev = nextEntityRev(id, prev?._rev);
        const normalized = normalizeJudgeAssignment({
          ...draft,
          id,
          species: draft.species || activeSpeciesNameRef.current || 'Rabbit',
          _rev: rev,
          createdAt: prev?.createdAt || ts,
          updatedAt: ts,
        });
        if (!normalized) return null;
        try {
          await adapterRef.current!.saveJudgeAssignment(normalized);
          const outboxOps = diffEntityFieldsToOperations({
            entityType: 'judgeAssignment',
            previous: prev,
            next: normalized,
            deviceId,
            nextCounter: allocateNextLogicalCounter,
            timestamp: ts,
            recordRev: rev,
          });
          await recordOutboxOps(outboxOps);
          await reloadFromAdapter();
          notify(`Saved show assignment "${normalized.showName}".`);
          return id;
        } catch (err) {
          reportPersistenceFailure('save show assignment', err);
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

  const deleteJudgeAssignment = useCallback(
    async (id: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const target = (currentSnapshot?.judgeAssignments ?? []).find((x) => x.id === id);
        const ts = getAdjustedNowIsoUtc();
        try {
          await adapterRef.current!.deleteJudgeAssignment(id);
          await recordOutboxOps([
            createOutboxOperation({
              entityType: 'judgeAssignment',
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
          notify('Show assignment deleted.');
        } catch (err) {
          reportPersistenceFailure('delete show assignment', err);
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

  const saveJudgeExpense = useCallback(
    async (
      draft: Omit<JudgeExpense, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
    ): Promise<string | null> => {
      return enqueueStoreMutation(async () => {
        const latestSnapshot = snapshotRef.current ?? snapshot;
        const ts = getAdjustedNowIsoUtc();
        const prev = draft.id
          ? (latestSnapshot?.judgeExpenses ?? []).find((x) => x.id === draft.id)
          : undefined;
        const id = draft.id || generateUuid();
        const rev = nextEntityRev(id, prev?._rev);
        const normalized = normalizeJudgeExpense({
          ...draft,
          id,
          species: draft.species || activeSpeciesNameRef.current || 'Rabbit',
          _rev: rev,
          createdAt: prev?.createdAt || ts,
          updatedAt: ts,
        });
        if (!normalized) return null;
        try {
          await adapterRef.current!.saveJudgeExpense(normalized);
          const outboxOps = diffEntityFieldsToOperations({
            entityType: 'judgeExpense',
            previous: prev,
            next: normalized,
            deviceId,
            nextCounter: allocateNextLogicalCounter,
            timestamp: ts,
            recordRev: rev,
          });
          await recordOutboxOps(outboxOps);
          await reloadFromAdapter();
          notify(`Saved judging expense "${normalized.description}".`);
          return id;
        } catch (err) {
          reportPersistenceFailure('save judging expense', err);
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

  const deleteJudgeExpense = useCallback(
    async (id: string) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current;
        const target = (currentSnapshot?.judgeExpenses ?? []).find((x) => x.id === id);
        const ts = getAdjustedNowIsoUtc();
        try {
          await adapterRef.current!.deleteJudgeExpense(id);
          await recordOutboxOps([
            createOutboxOperation({
              entityType: 'judgeExpense',
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
          notify('Judging expense deleted.');
        } catch (err) {
          reportPersistenceFailure('delete judging expense', err);
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
          const { mergeBarnSnapshots } = await import('../core/syncAndExports');
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
              mileageLogs: [],
              journalEntries: [],
              judgeClubs: [],
              judgeAssignments: [],
              judgeExpenses: [],
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
          mileageLogs: [],
          journalEntries: [],
          judgeClubs: [],
          judgeAssignments: [],
          judgeExpenses: [],
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
          const { mergeBarnSnapshots, parseBarnBackupJson } = await import(
            '../core/syncAndExports'
          );
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
            const { mergePhotosOnlyIntoSnapshot } = await import('../core/backupArchive');
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
            const { mergeBarnSnapshots } = await import('../core/syncAndExports');
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
          const baseOps = syncOperationsHydratedRef.current
            ? syncOperationsRef.current
            : await loadSyncOperationsFromIdbAndIndex();
          const result = mergeDeltaOperations(
            currentSnapshot,
            baseOps,
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
          if (syncOperationsHydratedRef.current) {
            syncOperationsRef.current = result.mergedOperations;
            setSyncOperations(result.mergedOperations);
          }
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
    [
      snapshot,
      deviceId,
      enqueueStoreMutation,
      loadSyncOperationsFromIdbAndIndex,
      rebuildMaxRevIndex,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const reconcileP2pOutboxOps = useCallback(
    async (
      incomingOps: SyncOperation[],
      peerDeviceId?: string
    ): Promise<P2pReconciliationSummary> => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current ?? snapshot;
        const { summarizeTaskReconciliation } = await import('../core/p2pSyncProtocol');
        if (!currentSnapshot) {
          return summarizeTaskReconciliation({
            peerDeviceId: peerDeviceId || 'peer',
            receivedOps: incomingOps,
            appliedOpCount: 0,
            newConflicts: [],
            reconciledAtIso: getAdjustedNowIsoUtc(),
          });
        }
        try {
          const baseOps = syncOperationsHydratedRef.current
            ? syncOperationsRef.current
            : await loadSyncOperationsFromIdbAndIndex();
          const result = mergeDeltaOperations(
            currentSnapshot,
            baseOps,
            incomingOps,
            deviceId
          );
          if (result.appliedOpCount > 0 || result.newConflicts.length > 0) {
            if (result.appliedOpCount > 0) {
              await adapterRef.current!.replaceSnapshot(result.nextSnapshot);
            }
            await replaceSyncOperationsInIdb(result.mergedOperations);
            rebuildMaxRevIndex(result.mergedOperations);
            if (syncOperationsHydratedRef.current) {
              syncOperationsRef.current = result.mergedOperations;
              setSyncOperations(result.mergedOperations);
            }
            if (result.newConflicts.length > 0) {
              await appendSyncConflictsToIdb(result.newConflicts);
              setSyncConflicts((prev) => [...result.newConflicts, ...prev]);
            }
            if (result.appliedOpCount > 0) {
              await reloadFromAdapter();
            }
            notify(
              result.newConflicts.length > 0
                ? `LAN P2P merged ${result.appliedOpCount} op(s); ${result.newConflicts.length} conflict(s) logged.`
                : `LAN P2P merged ${result.appliedOpCount} op(s) cleanly.`
            );
          }
          return summarizeTaskReconciliation({
            peerDeviceId: peerDeviceId || 'peer',
            receivedOps: incomingOps,
            appliedOpCount: result.appliedOpCount,
            newConflicts: result.newConflicts,
            reconciledAtIso: getAdjustedNowIsoUtc(),
          });
        } catch (err) {
          reportPersistenceFailure('reconcile LAN P2P outbox', err);
          throw err;
        }
      });
    },
    [
      snapshot,
      deviceId,
      enqueueStoreMutation,
      loadSyncOperationsFromIdbAndIndex,
      rebuildMaxRevIndex,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
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

          const baseOps = syncOperationsHydratedRef.current
            ? syncOperationsRef.current
            : await loadSyncOperationsFromIdbAndIndex();
          const applied = mergeDeltaOperations(
            currentSnapshot,
            baseOps,
            [op],
            deviceId
          );
          await adapterRef.current!.replaceSnapshot(applied.nextSnapshot);
          await replaceSyncOperationsInIdb(applied.mergedOperations);
          rebuildMaxRevIndex(applied.mergedOperations);
          if (syncOperationsHydratedRef.current) {
            syncOperationsRef.current = applied.mergedOperations;
            setSyncOperations(applied.mergedOperations);
          }

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
    [
      enqueueStoreMutation,
      syncConflicts,
      deviceId,
      nextEntityRev,
      loadSyncOperationsFromIdbAndIndex,
      rebuildMaxRevIndex,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
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

  const executeCloudAppFolderSync = useCallback(
    async (trigger: 'auto_background' | 'manual'): Promise<RunCloudAppFolderSyncResult> => {
      if (trigger === 'manual') {
        setCloudSyncBusy(true);
      }
      try {
        const result = await runCloudAppFolderSync({
          trigger,
          deviceId,
          loadLocalSyncOperations: loadSyncOperationsFromIdbAndIndex,
          getSnapshotForRollingBackup: async () => snapshotRef.current,
          onMergeRemoteOperations: async (ops) => {
            if (ops.length > 0) {
              await importDeltaOperations(ops);
            }
          },
          uploadRollingBackup: trigger === 'manual',
        });
        setCloudSyncState(result.state);
        if (trigger === 'manual') {
          if (result.ok) {
            notify(
              `Cloud App-Folder Sync complete (${result.uploadedOpsCount} ops uploaded across ${result.uploadedChunksCount} ${
                result.chunkStrategy === 'tight_storage_incremental'
                  ? 'tight-storage incremental '
                  : ''
              }chunk(s), ${result.pulledOpsCount} pulled).`
            );
          } else if (result.circuitBreakerTripped) {
            setErrorMessage(
              result.error ||
                'Cloud storage/quota limit hit (HTTP 403/507). Automated cloud sync paused; local IndexedDB saves are unaffected.'
            );
          } else if (result.skipReason || result.error) {
            setErrorMessage(result.skipReason || result.error || 'Cloud sync paused.');
          }
        }
        return result;
      } finally {
        if (trigger === 'manual') {
          setCloudSyncBusy(false);
        }
      }
    },
    [deviceId, loadSyncOperationsFromIdbAndIndex, importDeltaOperations, notify]
  );

  const scheduleBackgroundCloudSync = useCallback(() => {
    const latest = getCloudSyncClientState();
    if (
      !latest.settings.enabled ||
      !latest.settings.autoBackgroundSync ||
      latest.circuitBreaker.tripped ||
      latest.circuitBreaker.pausedAutomatedSync ||
      !latest.hasMemoryTokenByProvider[latest.settings.provider]
    ) {
      return;
    }
    if (cloudBackgroundTimerRef.current !== null) {
      clearTimeout(cloudBackgroundTimerRef.current);
    }
    cloudBackgroundTimerRef.current = setTimeout(() => {
      cloudBackgroundTimerRef.current = null;
      void executeCloudAppFolderSync('auto_background').catch(() => {
        // Cloud failures must never surface unhandled rejections or affect local IndexedDB writes
      });
    }, 1800);
  }, [executeCloudAppFolderSync]);

  useEffect(() => {
    scheduleBackgroundCloudSyncRef.current = scheduleBackgroundCloudSync;
  }, [scheduleBackgroundCloudSync]);

  useEffect(() => {
    void consumeCloudOAuthPkceCallback()
      .then((res) => {
        if (!res.handled) return;
        setCloudSyncState(getCloudSyncClientState());
        if (res.error) {
          setErrorMessage(res.error);
        } else if (res.provider) {
          notify(
            `Connected ${
              res.provider === 'onedrive' ? 'OneDrive AppRoot' : 'Google Drive AppFolder'
            } (memory-only OAuth token).`
          );
        }
      })
      .catch(() => {
        // Non-fatal
      });
    return () => {
      if (cloudBackgroundTimerRef.current !== null) {
        clearTimeout(cloudBackgroundTimerRef.current);
        cloudBackgroundTimerRef.current = null;
      }
    };
  }, [notify]);

  const updateCloudSyncSettings = useCallback(
    (patch: Partial<CloudSyncSettings>) => {
      const next = updatePersistedCloudSyncSettings(patch);
      setCloudSyncState(next);
      return next;
    },
    []
  );

  const connectCloudSyncAccessToken = useCallback(
    (provider: CloudSyncProvider, accessToken: string) => {
      const ok = setCloudSyncMemoryToken(provider, accessToken);
      const next = updatePersistedCloudSyncSettings({
        provider,
        enabled: ok ? true : getCloudSyncClientState().settings.enabled,
      });
      setCloudSyncState(next);
      if (ok) {
        notify(
          `Connected ${
            provider === 'onedrive' ? 'OneDrive AppRoot' : 'Google Drive AppFolder'
          } (access token held in memory only).`
        );
      }
      return ok;
    },
    [notify]
  );

  const disconnectCloudSync = useCallback(
    (provider?: CloudSyncProvider) => {
      clearCloudSyncMemoryToken(provider);
      const next = getCloudSyncClientState();
      setCloudSyncState(next);
      notify('Disconnected cloud app-folder access token from memory.');
    },
    [notify]
  );

  const startCloudSyncPkce = useCallback(
    async (provider: CloudSyncProvider, clientId: string) => {
      updatePersistedCloudSyncSettings({ provider, customOAuthClientId: clientId, enabled: true });
      setCloudSyncState(getCloudSyncClientState());
      await startCloudOAuthPkceRedirect(provider, clientId);
    },
    []
  );

  const runManualCloudSyncNow = useCallback(async () => {
    return executeCloudAppFolderSync('manual');
  }, [executeCloudAppFolderSync]);

  const resetAndRetryCloudSync = useCallback(async () => {
    const next = resetPersistedCloudCircuitBreaker();
    setCloudSyncState(next);
    return executeCloudAppFolderSync('manual');
  }, [executeCloudAppFolderSync]);

  const dismissCloudCircuitBreakerWarning = useCallback(() => {
    const next = acknowledgeCloudCircuitBreakerWarning();
    setCloudSyncState(next);
  }, []);

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
      const { formatTimestampedBackupSlug } = await import('../core/syncAndExports');
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
          const { resolveAnimalsWithConflictChoices } =
            await import('../core/importers/conflictResolver');
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
            mileageLogs: [],
            journalEntries: [],
            judgeClubs: [],
            judgeAssignments: [],
            judgeExpenses: [],
          };
          const { mergeBarnSnapshots } = await import('../core/syncAndExports');
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
      const { inspectSnapshotBeforeRestorePure } = await import('../core/archiveInspector');
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
      const { analyzePhotoStorageFootprintPure } = await import('../core/photoMaintenance');
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
      const { removeOrphanPhotosFromSnapshotPure } = await import('../core/photoMaintenance');
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
        const [{ analyzePhotoStorageFootprintPure }, { reoptimizeAnimalPhotoRecord }] =
          await Promise.all([
            import('../core/photoMaintenance'),
            import('../storage/webImageOptimizer'),
          ]);
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
      const {
        analyzePhotoStorageFootprintPure,
        pruneFullResPayloadsFromSnapshotPure,
      } = await import('../core/photoMaintenance');
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
            const { formatTimestampedBackupSlug } = await import('../core/syncAndExports');
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
    reconcileP2pOutboxOps,
    resolveSyncConflict,
    dismissSyncConflict,
    cloudSyncState,
    cloudSyncBusy,
    updateCloudSyncSettings,
    connectCloudSyncAccessToken,
    disconnectCloudSync,
    startCloudSyncPkce,
    runManualCloudSyncNow,
    resetAndRetryCloudSync,
    dismissCloudCircuitBreakerWarning,
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
    loadFeedBatchTagPhotoDataUrl,
    loadLedgerEntryReceiptPhotoDataUrl,
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
    rescheduleTask,
    applySmartTaskEscalations,
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
    saveMileageLog,
    deleteMileageLog,
    saveJournalEntry,
    deleteJournalEntry,
    saveJudgeClub,
    deleteJudgeClub,
    saveJudgeAssignment,
    deleteJudgeAssignment,
    saveJudgeExpense,
    deleteJudgeExpense,
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
