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
  applyAnimalNamePrefix,
  BarnDatabaseSnapshot,
  BarnSettings,
  BarnTask,
  BreedingRecord,
  CageLocation,
  CareLog,
  generateUuid,
  isAnimalArchived,
  isSameSpecies,
  normalizeBreedScheduleOverrides,
  normalizeCalendarSyncSettings,
  normalizeIgnoredConflicts,
  normalizeRufusLevel,
  normalizeServiceFeeDirection,
  normalizeSpeciesHubBlockOrder,
  normalizeUltrasoundResult,
  PREDEFINED_SPECIES_PRESETS,
  resolveSpeciesProfile,
  ServiceFeeDirection,
  ShowEvent,
  SpeciesHubBlockId,
  SpeciesProfile,
  UltrasoundResult,
} from '../core/models';
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
  | 'breeding'
  | 'pedigree'
  | 'reports'
  | 'memo'
  | 'importExport'
  | 'settings'
  | 'techyStuff'
  | 'prompts';

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
  const [pedigreeGenerations, setPedigreeGenerations] = useState<3 | 4 | 5 | 6>(3);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
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

  const nextEntityRev = useCallback((entityUuid: string, currentRev?: number): number => {
    let maxSeen = typeof currentRev === 'number' && Number.isFinite(currentRev) ? currentRev : 0;
    for (const op of syncOperationsRef.current) {
      if (op.entity_uuid === entityUuid && typeof op.record_rev === 'number' && op.record_rev > maxSeen) {
        maxSeen = op.record_rev;
      }
    }
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
    const nextOps = [...syncOperationsRef.current, ...writtenOps];
    syncOperationsRef.current = nextOps;
    setSyncOperations(nextOps);
  }, []);

  const clearLocalSyncAndBackupReminderState = useCallback(async () => {
    await clearAllSyncStateInIdb();
    clearPausedBackgroundJob('directory_sync');
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

  // Monitor Google Calendar auth state (access token is kept strictly in memory)
  useEffect(() => {
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
  }, []);

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
        setSyncOperations(ops);
        setSyncConflicts(conflicts);
        void refreshVaultAndArchives();

        const urlParams =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search)
            : null;
        const deepTaskId = (urlParams?.get('taskId') || '').trim();
        const deepSpecies = (urlParams?.get('species') || '').trim();
        const deepRoute = (urlParams?.get('route') || '').trim();
        const deepTask = deepTaskId
          ? initial.tasks.find((t) => t.id === deepTaskId)
          : undefined;

        if (deepTask) {
          setActiveSpeciesName(deepTask.species);
          setRoute('dashboard');
          setHighlightedTaskId(deepTask.id);
        } else if (deepSpecies) {
          const matchedDeepSpecies = initial.speciesProfiles.find((sp) =>
            isSameSpecies(sp.name, deepSpecies)
          );
          if (matchedDeepSpecies) {
            setActiveSpeciesName(matchedDeepSpecies.name);
            setRoute(deepRoute === 'herd' ? 'herd' : 'dashboard');
          } else {
            setActiveSpeciesName(initial.settings.defaultSpecies || 'Rabbit');
            setRoute('home');
          }
          if (deepTaskId) {
            setStatusMessage(
              'Linked calendar chore was not found in local records (it may have been deleted).'
            );
          }
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

        const preserveEmergencyReset = urlParams?.get('emergency_reset') === 'true';
        if (
          typeof window !== 'undefined' &&
          !preserveEmergencyReset &&
          (deepTaskId || deepSpecies || deepRoute)
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

  /**
   * Strictly species-isolated slice of all records for `activeSpeciesName`.
   * Decoupled from `route` so navigating between screens never re-filters/re-sorts herd records.
   */
  const baseSpeciesData = useMemo(() => {
    if (!snapshot) return null;
    const speciesProfile = resolveSpeciesProfile(activeSpeciesName, snapshot.speciesProfiles);
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
      testingRecordCount,
      nonTestingRecordCount,
      totalRecordCount,
    };
  }, [snapshot, activeSpeciesName]);

  const conflictsBySpeciesAnimalId = useMemo(() => {
    if (!baseSpeciesData) {
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
    if (!baseSpeciesData) return map;
    if (route === 'herd' || route === 'pedigree' || route === 'breeding') {
      const evaluator = createSpeciesCoiEvaluator(baseSpeciesData.herdById);
      for (const animal of baseSpeciesData.animals) {
        map.set(animal.id, evaluator.calculateAnimalCoi(animal));
      }
    }
    return map;
  }, [baseSpeciesData, route]);

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
      const boundedDepth = Math.min(6, Math.max(0, Math.floor(maxDepth)));
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
        }).then((outcome) => {
          notify(
            outcome === 'shared'
              ? `Opened external calendar handoff for ${ics.eventCount} event${
                  ics.eventCount === 1 ? '' : 's'
                }.`
              : `Saved ${ics.eventCount} event${
                  ics.eventCount === 1 ? '' : 's'
                } (.ICS) — open file to add to Outlook, Apple, or system calendar.`
          );
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
        const show: ShowEvent = {
          ...draft,
          id: showId,
          name: draft.name.trim(),
          _rev: rev,
          createdAt: prev?.createdAt || ts,
          updatedAt: ts,
        };
        try {
          await adapterRef.current!.saveShow(show);
          await recordOutboxOps(
            diffEntityFieldsToOperations({
              entityType: 'show',
              previous: prev,
              next: show,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
              timestamp: ts,
              recordRev: rev,
            })
          );
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
          await recordOutboxOps([
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
          ]);
          await reloadFromAdapter();
          notify('Show removed.');
        } catch (err) {
          reportPersistenceFailure('delete show', err);
        }
      });
    },
    [enqueueStoreMutation, deviceId, nextEntityRev, recordOutboxOps, reloadFromAdapter, notify, reportPersistenceFailure]
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
    (gen: 3 | 4 | 5 | 6) => {
      setPedigreeGenerations(gen);
      if (snapshot && snapshot.settings.defaultGenerations !== gen) {
        void updateSettings({ defaultGenerations: gen }, { silent: true });
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
    saveSpeciesMemo,
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
    deleteCareLog,
    saveShow,
    deleteShow,
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
