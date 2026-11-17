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
  normalizeCalendarSyncSettings,
  normalizeIgnoredConflicts,
  normalizeRufusLevel,
  normalizeServiceFeeDirection,
  normalizeSpeciesHubBlockOrder,
  normalizeUltrasoundResult,
  nowIsoUtc,
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
  mergeDeltaOperations,
  SyncConflictEntry,
  SyncEntityType,
  SyncOperation,
} from '../core/syncOutbox';
import { generateCascadedTasksForBreeding } from '../core/taskMaster';
import { sanitizeSpeciesMemo } from '../core/speciesMemo';
import { resolveThemeCssVariables } from '../core/themePalette';
import {
  allocateNextLogicalCounter,
  appendSyncConflictsToIdb,
  appendSyncOperationsToIdb,
  BackupSinkStatus,
  buildDeltaFilePayload,
  configureBackupSinkFolder,
  disconnectBackupSinkFolder,
  getOrCreateLocalDeviceId,
  getPersistedBackupSinkStatus,
  loadAllSyncConflictsFromIdb,
  loadAllSyncOperationsFromIdb,
  reauthorizeBackupSinkFolder,
  replaceSyncOperationsInIdb,
  saveSyncConflictInIdb,
} from '../storage/localSyncChannels';
import {
  assertForegroundOrPause,
  BackgroundPausedError,
  registerFreezeLifecycleListener,
} from '../storage/backgroundFreezeCoordinator';
import {
  emitAsyncErrorToast,
  isMemoryLikeError,
  logDiagnosticEvent,
  setCurrentDiagnosticRoute,
} from '../storage/crashLogger';
import {
  buildCompleteBackupZipOffThread,
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
  getEffectiveOnlineStatus,
  isQuotaExceededError,
  listRollingSnapshotBackups,
  loadRollingSnapshotBackup,
  requestPersistentStorage,
  RollingBackupMeta,
  saveRollingSnapshotBackup,
  StorageProtectionStatus,
} from '../storage/storageProtection';
import { reoptimizeAnimalPhotoRecord } from '../storage/webImageOptimizer';
import { detectCurrentDeviceCapability } from '../storage/deviceCapabilityDetector';
import { markPreUpgradeBackupVerified } from '../storage/pwaUpdateManager';
import {
  clearOpfsPruneSinkWarning,
  clearPriorUseSentinel,
  deleteOpfsHerdArchive,
  deleteOpfsVaultBackup,
  flushOpfsBackupsToSinkFolder,
  isOpfsSupported,
  listOpfsHerdArchives,
  listOpfsVaultBackups,
  loadOpfsHerdArchive,
  loadOpfsVaultBackup,
  markPriorUseSentinelFromSnapshot,
  OpfsPruneSinkWarning,
  readOpfsHerdArchiveBlob,
  readOpfsPruneSinkWarning,
  readOpfsVaultBackupBlob,
  runOpfsExportCanary,
  saveOpfsHerdArchive,
  saveOpfsVaultBackup,
  shouldCreateMonthlyOpfsBackup,
  shouldRunExportCanary,
  sweepOrphanedOpfsTmpOnBoot,
  WipedStorageRecoveryContext,
} from '../storage/opfsStorage';
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
  downloadBinaryFile,
  downloadBlobDirect,
  downloadTextFile,
  shareTextFileOrDownload,
} from '../utils/webFileActions';
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
  | 'settings';

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

  const [deviceId] = useState<string>(() => getOrCreateLocalDeviceId());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [snapshot, setSnapshot] = useState<BarnDatabaseSnapshot | null>(null);
  snapshotRef.current = snapshot;
  const [route, setRoute] = useState<WorkspaceRoute>('home');
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
  const [backupSinkStatus, setBackupSinkStatus] = useState<BackupSinkStatus | null>(null);
  const [pruneSinkWarning, setPruneSinkWarning] = useState<OpfsPruneSinkWarning | null>(() =>
    readOpfsPruneSinkWarning()
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
    await appendSyncOperationsToIdb(ops);
    setSyncOperations((prev) => [...prev, ...ops]);
  }, []);

  const refreshStorageStatus = useCallback(async () => {
    const status = await checkStorageStatus();
    setStorageStatus(status);
    return status;
  }, []);

  const refreshVaultAndArchives = useCallback(async () => {
    const [opfsRes, rollingRes, archivesRes, sinkRes] = await Promise.allSettled([
      listOpfsVaultBackups(),
      listRollingSnapshotBackups(),
      listOpfsHerdArchives(),
      getPersistedBackupSinkStatus(),
    ]);
    if (opfsRes.status === 'fulfilled') setOpfsVaultBackups(opfsRes.value);
    if (rollingRes.status === 'fulfilled') setRollingBackups(rollingRes.value);
    if (archivesRes.status === 'fulfilled') setArchivedHerdBundles(archivesRes.value);
    if (sinkRes.status === 'fulfilled') setBackupSinkStatus(sinkRes.value);
    setPruneSinkWarning(readOpfsPruneSinkWarning());
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

        if (
          typeof window !== 'undefined' &&
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
    return evaluateBackupStatus(
      snapshot,
      effectiveLastBackupMeta,
      Date.now(),
      effectiveBackupSnoozedUntilMs
    );
  }, [snapshot, effectiveLastBackupMeta, effectiveBackupSnoozedUntilMs]);

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
      ]);
      void refreshVaultAndArchives();
    },
    [hydrateSnapshotForExport, refreshVaultAndArchives]
  );

  const reloadFromAdapter = useCallback(async () => {
    const fresh = await adapterRef.current!.loadSnapshot({ lightweightPhotos: true });
    setSnapshot(fresh);
    void refreshStorageStatus();
    void refreshVaultAndArchives();
  }, [refreshStorageStatus, refreshVaultAndArchives]);

  // Keep prior-use sentinel synced with active non-wiped barn data
  useEffect(() => {
    if (!snapshot || isLoading || wipedRecoveryContext?.detected) return;
    markPriorUseSentinelFromSnapshot(snapshot);
  }, [snapshot, isLoading, wipedRecoveryContext]);

  // Trim cached full-res photos whenever the browser tab moves to the background (via shared freeze dispatcher)
  useEffect(() => {
    return registerFreezeLifecycleListener({
      id: 'barn-store-photo-cache-trim',
      onHidden: () => {
        photoCacheRef.current?.clear();
      },
    });
  }, []);

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

  const updateSettings = useCallback(
    async (patch: Partial<BarnSettings>, options?: { silent?: boolean }) => {
      if (!snapshot) return;
      try {
        const ts = getAdjustedNowIsoUtc();
        const rev = nextEntityRev(snapshot.settings.id, snapshot.settings._rev);
        const updated: BarnSettings = {
          ...snapshot.settings,
          ...patch,
          _rev: rev,
          updatedAt: ts,
        };
        await adapterRef.current!.saveSettings(updated);
        const ops = diffEntityFieldsToOperations({
          entityType: 'settings',
          previous: snapshot.settings,
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
        setSnapshot((prev) => (prev ? { ...prev, settings: updated } : prev));
        if (!options?.silent) {
          notify('Barn preferences saved locally.');
        }
      } catch (err) {
        reportPersistenceFailure('save barn preferences', err);
      }
    },
    [snapshot, deviceId, nextEntityRev, recordOutboxOps, notify, reportPersistenceFailure]
  );

  const ignoreTaskAlertsPermanently = useCallback(
    async (taskIds: string[]) => {
      if (!snapshot || taskIds.length === 0) return;
      const merged = Array.from(
        new Set([...(snapshot.settings.ignoredTaskIds || []), ...taskIds])
      );
      await updateSettings({ ignoredTaskIds: merged }, { silent: true });
      notify(`Dismissed ${taskIds.length} task alert(s) permanently.`);
    },
    [snapshot, updateSettings, notify]
  );

  const clearTaskAlertGroup = useCallback(
    async (speciesName: string, groupSignature: string | string[]) => {
      const isEmpty = Array.isArray(groupSignature)
        ? groupSignature.length === 0
        : !groupSignature;
      if (!snapshot || isEmpty) return;
      const key = speciesName.trim().toLowerCase();
      const prevMap = snapshot.settings.dismissedTaskGroupKeys || {};
      const nextMap: Record<string, string | string[]> = { ...prevMap, [key]: groupSignature };
      await updateSettings({ dismissedTaskGroupKeys: nextMap }, { silent: true });
      notify(`Cleared alert for current ${speciesName} overdue tasks.`);
    },
    [snapshot, updateSettings, notify]
  );

  const dismissSpeciesMemoAlert = useCallback(
    async (speciesName: string, memoSignature: string) => {
      if (!snapshot || !memoSignature) return;
      const key = speciesName.trim().toLowerCase();
      const prevMap = snapshot.settings.dismissedMemoAlertSignatures || {};
      const nextMap: Record<string, string> = { ...prevMap, [key]: memoSignature };
      await updateSettings({ dismissedMemoAlertSignatures: nextMap }, { silent: true });
    },
    [snapshot, updateSettings]
  );

  const recordBackupExport = useCallback(
    async (format: 'zip' | 'sqlite' | 'json', fileName?: string) => {
      const meta: LastBackupMeta = {
        exportedAtIso: nowIsoUtc(),
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
      if (snapshot) {
        await updateSettings(
          { lastBackupMeta: meta, backupReminderSnoozedUntilMs: 0 },
          { silent: true }
        );
      }
    },
    [snapshot, updateSettings]
  );

  const snoozeBackupReminder = useCallback(
    async (hours: number = 24) => {
      const untilMs = Date.now() + hours * 60 * 60 * 1000;
      setLocalSnoozedUntilMs(untilMs);
      try {
        localStorage.setItem('pedigree.backupReminderSnoozedUntil.v1', String(untilMs));
      } catch {
        // Ignore storage warnings
      }
      if (snapshot) {
        await updateSettings({ backupReminderSnoozedUntilMs: untilMs }, { silent: true });
      }
    },
    [snapshot, updateSettings]
  );

  const togglePinSpeciesLanding = useCallback(
    async (speciesName: string) => {
      if (!snapshot) return;
      const currentlyPinned = isSameSpecies(snapshot.settings.pinnedLandingSpecies, speciesName);
      const nextPinned = currentlyPinned ? '' : speciesName;
      await updateSettings({ pinnedLandingSpecies: nextPinned }, { silent: true });
      notify(
        nextPinned
          ? `Pinned ${speciesName} hub as your startup landing page.`
          : 'Unpinned startup species — app will open on All-Species Home.'
      );
    },
    [snapshot, updateSettings, notify]
  );

  const saveSpeciesProfile = useCallback(
    async (profile: SpeciesProfile) => {
      const ts = getAdjustedNowIsoUtc();
      const existing = snapshot?.speciesProfiles.find((sp) => sp.id === profile.id);
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
            _rev: rev,
            createdAt: profile.createdAt || existing.createdAt || ts,
            updatedAt: ts,
          };

          const renamed =
            snapshot && !isSameSpecies(existing.name, clean.name);
          if (renamed && snapshot) {
            const oldName = existing.name;
            const newName = clean.name;
            const oldKey = oldName.trim().toLowerCase();
            const newKey = newName.trim().toLowerCase();

            const nextDismissedTaskGroups = {
              ...(snapshot.settings.dismissedTaskGroupKeys || {}),
            };
            if (oldKey in nextDismissedTaskGroups) {
              nextDismissedTaskGroups[newKey] = nextDismissedTaskGroups[oldKey];
              delete nextDismissedTaskGroups[oldKey];
            }
            const nextDismissedMemos = {
              ...(snapshot.settings.dismissedMemoAlertSignatures || {}),
            };
            if (oldKey in nextDismissedMemos) {
              nextDismissedMemos[newKey] = nextDismissedMemos[oldKey];
              delete nextDismissedMemos[oldKey];
            }

            const renamedSnapshot: BarnDatabaseSnapshot = {
              ...snapshot,
              settings: {
                ...snapshot.settings,
                defaultSpecies: isSameSpecies(snapshot.settings.defaultSpecies, oldName)
                  ? newName
                  : snapshot.settings.defaultSpecies,
                pinnedLandingSpecies: isSameSpecies(snapshot.settings.pinnedLandingSpecies, oldName)
                  ? newName
                  : snapshot.settings.pinnedLandingSpecies,
                dismissedTaskGroupKeys: nextDismissedTaskGroups,
                dismissedMemoAlertSignatures: nextDismissedMemos,
                updatedAt: ts,
              },
              speciesProfiles: snapshot.speciesProfiles.map((sp) =>
                sp.id === clean.id ? clean : sp
              ),
              animals: snapshot.animals.map((a) =>
                isSameSpecies(a.species, oldName) ? { ...a, species: newName, updatedAt: ts } : a
              ),
              animalPhotos: (snapshot.animalPhotos ?? []).map((p) =>
                isSameSpecies(p.species, oldName) ? { ...p, species: newName, updatedAt: ts } : p
              ),
              cages: snapshot.cages.map((c) =>
                isSameSpecies(c.species, oldName) ? { ...c, species: newName, updatedAt: ts } : c
              ),
              breedings: snapshot.breedings.map((b) =>
                isSameSpecies(b.species, oldName) ? { ...b, species: newName, updatedAt: ts } : b
              ),
              tasks: snapshot.tasks.map((t) =>
                isSameSpecies(t.species, oldName) ? { ...t, species: newName, updatedAt: ts } : t
              ),
              careLogs: snapshot.careLogs.map((l) =>
                isSameSpecies(l.species, oldName) ? { ...l, species: newName, updatedAt: ts } : l
              ),
              shows: snapshot.shows.map((s) =>
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
          const currentList = snapshot?.speciesProfiles ?? [];
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
    },
    [
      snapshot,
      activeSpeciesName,
      deviceId,
      nextEntityRev,
      recordOutboxOps,
      reloadFromAdapter,
      notify,
      reportPersistenceFailure,
    ]
  );

  const saveSpeciesMemo = useCallback(
    async (speciesId: string, rawMemoText: unknown, options?: { silent?: boolean }) => {
      if (!snapshot) return;
      const existing = snapshot.speciesProfiles.find((sp) => sp.id === speciesId);
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
    },
    [snapshot, deviceId, nextEntityRev, recordOutboxOps, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const reorderSpeciesCards = useCallback(
    async (orderedIds: string[]) => {
      if (!snapshot) return;
      const byId = new Map(snapshot.speciesProfiles.map((sp) => [sp.id, sp]));
      const ordered: SpeciesProfile[] = [];
      const seen = new Set<string>();
      const ts = nowIsoUtc();

      for (const id of orderedIds) {
        const sp = byId.get(id);
        if (sp && !seen.has(id)) {
          seen.add(id);
          ordered.push({ ...sp, sortOrder: ordered.length, updatedAt: ts });
        }
      }
      for (const sp of snapshot.speciesProfiles) {
        if (!seen.has(sp.id)) {
          ordered.push({ ...sp, sortOrder: ordered.length, updatedAt: ts });
        }
      }

      await adapterRef.current!.saveSpeciesProfilesBatch(ordered);
      await reloadFromAdapter();
    },
    [snapshot, reloadFromAdapter]
  );

  const moveSpeciesCard = useCallback(
    async (speciesId: string, direction: 'up' | 'down' | 'top') => {
      if (!snapshot) return;
      const ids = snapshot.speciesProfiles.map((sp) => sp.id);
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
      await reorderSpeciesCards(nextIds);
    },
    [snapshot, reorderSpeciesCards]
  );

  const reorderSpeciesHubBlocks = useCallback(
    async (speciesName: string, orderedBlockIds: SpeciesHubBlockId[]) => {
      if (!snapshot) return;
      const key = speciesName.trim().toLowerCase();
      const normalized = normalizeSpeciesHubBlockOrder(orderedBlockIds);
      const prevMap = snapshot.settings.speciesHubBlockOrder || {};
      await updateSettings(
        {
          speciesHubBlockOrder: {
            ...prevMap,
            [key]: normalized,
          },
        },
        { silent: true }
      );
    },
    [snapshot, updateSettings]
  );

  const moveSpeciesHubBlock = useCallback(
    async (
      speciesName: string,
      blockId: SpeciesHubBlockId,
      direction: 'up' | 'down' | 'top'
    ) => {
      if (!snapshot) return;
      const key = speciesName.trim().toLowerCase();
      const ids = normalizeSpeciesHubBlockOrder(snapshot.settings.speciesHubBlockOrder?.[key]);
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
      await reorderSpeciesHubBlocks(speciesName, nextIds);
    },
    [snapshot, reorderSpeciesHubBlocks]
  );

  const deleteSpeciesProfile = useCallback(
    async (profile: SpeciesProfile) => {
      try {
        if (snapshot) {
          const remainingRecords = countAllSpeciesRecords(snapshot, profile.name);
          if (remainingRecords > 0) {
            notify(
              `Only empty species can be fully removed (${profile.name} still has ${remainingRecords} record${remainingRecords === 1 ? '' : 's'}).`
            );
            return;
          }
          if (snapshot.speciesProfiles.length <= 1) {
            notify('At least one species must remain in your barn.');
            return;
          }
          await saveSafetyRollingBackup(snapshot);
        }
        await adapterRef.current!.deleteSpeciesProfile(profile.id);
        if (snapshot && isSameSpecies(snapshot.settings.pinnedLandingSpecies, profile.name)) {
          await adapterRef.current!.saveSettings({
            ...snapshot.settings,
            pinnedLandingSpecies: '',
            updatedAt: nowIsoUtc(),
          });
        }
        await reloadFromAdapter();
        if (isSameSpecies(activeSpeciesName, profile.name)) {
          const fallbackName =
            snapshot?.speciesProfiles.find((p) => p.id !== profile.id)?.name || 'Rabbit';
          setActiveSpeciesName(fallbackName);
          setRoute('home');
        }
        notify(`${profile.name} removed from configured species.`);
      } catch (err) {
        reportPersistenceFailure(`remove ${profile.name} species`, err);
      }
    },
    [snapshot, activeSpeciesName, saveSafetyRollingBackup, reloadFromAdapter, notify, reportPersistenceFailure]
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
      const archive = await buildCompleteBackupZipOffThread(hydrated, speciesName, {
        backupScope: 'species',
        backupReason: reason,
        targetSpecies: speciesName,
      });
      await downloadBinaryFile(filename, archive.bytes, 'application/zip');
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
        const ts = nowIsoUtc();
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
      if (!snapshot || kinds.length === 0) return;
      const target = snapshot.animals.find((a) => a.id === animalId);
      if (!target) return;
      const ts = getAdjustedNowIsoUtc();
      const rev = nextEntityRev(target.id, target._rev);
      const nextIgnored = normalizeIgnoredConflicts([
        ...(target.ignoredConflicts || []),
        ...kinds,
      ]);
      const summariesAfter = analyzeBarnAnimalConflicts(
        snapshot.animals.map((a) =>
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
    },
    [snapshot, deviceId, nextEntityRev, recordOutboxOps, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const restoreAnimalConflictAlert = useCallback(
    async (animalId: string, kinds?: AnimalConflictKind[]) => {
      if (!snapshot) return;
      const target = snapshot.animals.find((a) => a.id === animalId);
      if (!target) return;
      const ts = getAdjustedNowIsoUtc();
      const rev = nextEntityRev(target.id, target._rev);
      const currentIgnored = normalizeIgnoredConflicts(target.ignoredConflicts);
      const nextIgnored =
        kinds && kinds.length > 0
          ? currentIgnored.filter((k) => !kinds.includes(k))
          : [];
      const summariesAfter = analyzeBarnAnimalConflicts(
        snapshot.animals.map((a) =>
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
    },
    [snapshot, deviceId, nextEntityRev, recordOutboxOps, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const archiveAnimals = useCallback(
    async (animalIds: string[], archived: boolean) => {
      if (!snapshot || animalIds.length === 0) return;
      const idSet = new Set(animalIds);
      const ts = getAdjustedNowIsoUtc();
      const ops: SyncOperation[] = [];
      const updatedBatch: Animal[] = [];

      for (const animal of snapshot.animals) {
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
          archived && snapshot.settings.autoOffloadRetiredToOpfs && isOpfsSupported()
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
    },
    [snapshot, deviceId, nextEntityRev, recordOutboxOps, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const deleteAnimalsBatch = useCallback(
    async (animalIds: string[]) => {
      if (!snapshot || animalIds.length === 0) return;
      try {
        await saveSafetyRollingBackup(snapshot);
        const idSet = new Set(animalIds);
        const ts = getAdjustedNowIsoUtc();
        const ops: SyncOperation[] = [];

        // Unlink offspring sire/dam references pointing to deleted animals in a single batch
        const unlinkedChildren: Animal[] = [];
        for (const a of snapshot.animals) {
          if (idSet.has(a.id)) continue;
          const clearSire = a.sireId && idSet.has(a.sireId);
          const clearDam = a.damId && idSet.has(a.damId);
          if (clearSire || clearDam) {
            unlinkedChildren.push({
              ...a,
              sireId: clearSire ? '' : a.sireId,
              damId: clearDam ? '' : a.damId,
              _rev: nextEntityRev(a.id, a._rev),
              updatedAt: ts,
            });
          }
        }
        if (unlinkedChildren.length > 0) {
          await adapterRef.current!.saveAnimalsBatch(unlinkedChildren);
        }

        await adapterRef.current!.deleteAnimalsBatch(Array.from(idSet));
        for (const id of idSet) {
          const deletedAnimal = snapshot.animals.find((a) => a.id === id);
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
    },
    [
      snapshot,
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
      if (!snapshot) return null;
      if (!options?.migrateEntireSpecies && animalIds.length === 0) return null;

      try {
        await saveSafetyRollingBackup(snapshot);
        const result = migrateAnimalsToSpecies(snapshot, animalIds, targetSpeciesName, options);
        await adapterRef.current!.replaceSnapshot(result.snapshot);

        const prevSpeciesById = new Map(snapshot.animals.map((a) => [a.id, a.species]));
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
    },
    [
      snapshot,
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
      const ts = nowIsoUtc();
      const existingPhotos = (snapshot?.animalPhotos ?? []).filter(
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
          createdAt: ts,
          updatedAt: ts,
        };
      });

      try {
        await adapterRef.current!.saveAnimalPhotosBatch(records);
        for (const rec of records) {
          photoCacheRef.current.set(rec.id, rec.dataUrl);
        }
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
    },
    [snapshot, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const setPrimaryAnimalPhoto = useCallback(
    async (animalId: string, photoId: string) => {
      if (!snapshot) return;
      const ts = nowIsoUtc();
      const targetPhotos = (snapshot.animalPhotos ?? []).filter((p) => p.animalId === animalId);
      if (targetPhotos.length === 0) return;

      const updated = targetPhotos.map((p) => ({
        ...p,
        isPrimary: p.id === photoId,
        updatedAt: ts,
      }));
      await adapterRef.current!.saveAnimalPhotosBatch(updated);
      await reloadFromAdapter();
      notify('Primary cover photo updated (available for pedigrees).');
    },
    [snapshot, reloadFromAdapter, notify]
  );

  const updateAnimalPhotoCaption = useCallback(
    async (photoId: string, caption: string) => {
      if (!snapshot) return;
      const found = (snapshot.animalPhotos ?? []).find((p) => p.id === photoId);
      if (!found) return;
      await adapterRef.current!.saveAnimalPhoto({
        ...found,
        caption: caption.trim(),
        updatedAt: nowIsoUtc(),
      });
      await reloadFromAdapter();
    },
    [snapshot, reloadFromAdapter]
  );

  const deleteAnimalPhoto = useCallback(
    async (photoId: string) => {
      if (!snapshot) return;
      const all = snapshot.animalPhotos ?? [];
      const target = all.find((p) => p.id === photoId);
      await adapterRef.current!.deleteAnimalPhoto(photoId);
      photoCacheRef.current.delete(photoId);

      if (target && target.isPrimary) {
        const siblings = all
          .filter((p) => p.animalId === target.animalId && p.id !== photoId)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        if (siblings.length > 0) {
          await adapterRef.current!.saveAnimalPhoto({
            ...siblings[0],
            isPrimary: true,
            updatedAt: nowIsoUtc(),
          });
        }
      }
      await reloadFromAdapter();
      notify('Photo removed.');
    },
    [snapshot, reloadFromAdapter, notify]
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
      try {
        await adapterRef.current!.deleteCage(id);
        await reloadFromAdapter();
        notify('Cage/location removed.');
      } catch (err) {
        reportPersistenceFailure('delete cage location', err);
      }
    },
    [reloadFromAdapter, notify, reportPersistenceFailure]
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

      const breeding: BreedingRecord = {
        id: generateUuid(),
        species: sp.name,
        sireId: resolvedSire.id,
        damId: resolvedDam.id,
        sireName: resolvedSire.name,
        damName: resolvedDam.name,
        bredDateIso: params.bredDateIso,
        expectedDueDateIso: addDaysIso(params.bredDateIso, sp.gestationDays),
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
          cascaded = generateCascadedTasksForBreeding(breeding, sp).map((t) => ({
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
      }
    ): Promise<boolean> => {
      return enqueueStoreMutation(async () => {
      const currentSnapshot = snapshotRef.current ?? snapshot;
      if (!currentSnapshot) return false;
      const ts = getAdjustedNowIsoUtc();
      const sp = resolveSpeciesProfile(existing.species, currentSnapshot.speciesProfiles);
      const ops: SyncOperation[] = [];

      try {
        let createdAny = existing.offspringCreated;
        const requestedDrafts = patch.offspringDrafts;
        const effectiveCount = requestedDrafts
          ? Math.min(16, requestedDrafts.length)
          : Math.min(16, Math.max(0, patch.registerJuniorCount));
        if (effectiveCount > 0) {
          const sire = currentSnapshot.animals.find((a) => a.id === existing.sireId);
          const dam = currentSnapshot.animals.find((a) => a.id === existing.damId);
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
        await recordOutboxOps(ops);
        await reloadFromAdapter();
        notify(
          effectiveCount > 0
            ? `Litter updated & ${effectiveCount} ${sp.offspringLabel.toLowerCase()} records created.`
            : 'Litter outcome saved.'
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

  const deleteBreeding = useCallback(
    async (id: string) => {
      try {
        await adapterRef.current!.deleteBreeding(id);
        await reloadFromAdapter();
        notify('Breeding & linked chores removed.');
      } catch (err) {
        reportPersistenceFailure('delete breeding record', err);
      }
    },
    [reloadFromAdapter, notify, reportPersistenceFailure]
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
      try {
        await adapterRef.current!.deleteTask(id);
        await reloadFromAdapter();
      } catch (err) {
        reportPersistenceFailure('delete task', err);
      }
    },
    [reloadFromAdapter, reportPersistenceFailure]
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
      try {
        await adapterRef.current!.deleteCareLog(id);
        await reloadFromAdapter();
      } catch (err) {
        reportPersistenceFailure('delete care log entry', err);
      }
    },
    [reloadFromAdapter, reportPersistenceFailure]
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
      try {
        await adapterRef.current!.deleteShow(id);
        await reloadFromAdapter();
        notify('Show removed.');
      } catch (err) {
        reportPersistenceFailure('delete show', err);
      }
    },
    [reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const seedSpeciesSampleData = useCallback(
    async (speciesName: string) => {
      if (!snapshot) return;
      const existingProfile = snapshot.speciesProfiles.find((sp) =>
        isSameSpecies(sp.name, speciesName)
      );
      const bundle = buildSampleDataForSpecies(speciesName, existingProfile);
      if (!bundle) {
        notify(`No predefined testing dataset found for ${speciesName}.`);
        return;
      }
      const spKey = speciesName.trim().toLowerCase();
      const seedTaskIds = new Set(bundle.tasks.map((t) => t.id));
      const nextIgnored = (snapshot.settings.ignoredTaskIds || []).filter(
        (id) => !seedTaskIds.has(id)
      );
      const nextDismissed = { ...(snapshot.settings.dismissedTaskGroupKeys || {}) };
      delete nextDismissed[spKey];
      const refreshedSettings: BarnSettings = {
        ...snapshot.settings,
        ignoredTaskIds: nextIgnored,
        dismissedTaskGroupKeys: nextDismissed,
        updatedAt: nowIsoUtc(),
      };
      const report = mergeBarnSnapshots(
        { ...snapshot, settings: refreshedSettings },
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
    },
    [snapshot, reloadFromAdapter, notify]
  );

  const seedAllPredefinedSpecies = useCallback(async () => {
    const cleanedSettings: Partial<BarnSettings> | undefined = snapshot?.settings
      ? {
          ...snapshot.settings,
          ignoredTaskIds: (snapshot.settings.ignoredTaskIds || []).filter(
            (id) => !isSampleTestingId(id)
          ),
          dismissedTaskGroupKeys: {},
        }
      : undefined;
    const full = buildFullPredefinedSampleSnapshot(cleanedSettings);
    const memoBySpeciesKey = new Map(
      (snapshot?.speciesProfiles || []).map((sp) => [
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
  }, [snapshot, reloadFromAdapter, notify]);

  const deleteSpeciesTestingData = useCallback(
    async (speciesName: string) => {
      if (!snapshot) return;
      const { nextSnapshot, removedAnimals, removedTotalRecords, removedAnimalIds } =
        purgeSpeciesTestingDataPure(snapshot, speciesName);
      if (removedTotalRecords === 0) {
        notify(`No testing records found in ${speciesName}.`);
        return;
      }
      try {
        await saveSafetyRollingBackup(snapshot);
        await adapterRef.current!.replaceSnapshot(nextSnapshot);
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
    },
    [snapshot, selectedAnimalId, pedigreeAnimalId, saveSafetyRollingBackup, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const deleteSpeciesNonTestingData = useCallback(
    async (speciesName: string) => {
      if (!snapshot) return;
      const { nextSnapshot, removedAnimals, removedTotalRecords, removedAnimalIds } =
        purgeSpeciesNonTestingDataPure(snapshot, speciesName);
      if (removedTotalRecords === 0) {
        notify(`No non-testing records found in ${speciesName}.`);
        return;
      }
      try {
        await saveSafetyRollingBackup(snapshot);
        await adapterRef.current!.replaceSnapshot(nextSnapshot);
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
    },
    [snapshot, selectedAnimalId, pedigreeAnimalId, saveSafetyRollingBackup, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const deleteAllSpeciesRecords = useCallback(
    async (speciesName: string) => {
      if (!snapshot) return;
      const { nextSnapshot, removedAnimals, removedTotalRecords, removedAnimalIds } =
        purgeAllSpeciesRecordsPure(snapshot, speciesName);
      if (removedTotalRecords === 0) {
        notify(`${speciesName} already has zero records.`);
        return;
      }
      try {
        await saveSafetyRollingBackup(snapshot);
        await adapterRef.current!.replaceSnapshot(nextSnapshot);
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
    },
    [snapshot, selectedAnimalId, pedigreeAnimalId, saveSafetyRollingBackup, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const clearAllRecordsKeepSpecies = useCallback(async () => {
    if (!snapshot) return;
    try {
      await saveSafetyRollingBackup(snapshot);
      const empty: BarnDatabaseSnapshot = {
        settings: { ...snapshot.settings, updatedAt: nowIsoUtc() },
        speciesProfiles: snapshot.speciesProfiles,
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
      setSelectedAnimalId(null);
      setPedigreeAnimalId(null);
      await reloadFromAdapter();
      notify('Deleted all animal, photo, breeding, and chore data across all species.');
    } catch (err) {
      reportPersistenceFailure('clear all animal data', err);
    }
  }, [snapshot, saveSafetyRollingBackup, reloadFromAdapter, notify, reportPersistenceFailure]);

  const restoreFactoryDefaults = useCallback(async () => {
    try {
      if (snapshot) {
        await saveSafetyRollingBackup(snapshot);
      }
      const factorySnapshot = buildFullPredefinedSampleSnapshot();
      await adapterRef.current!.replaceSnapshot(factorySnapshot);
      photoCacheRef.current.clear();
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
  }, [snapshot, saveSafetyRollingBackup, reloadFromAdapter, notify, reportPersistenceFailure]);

  const importJsonBackup = useCallback(
    async (jsonText: string, mode: 'merge' | 'replace') => {
      if (!snapshot) return;
      const incoming = parseBarnBackupJson(jsonText, snapshot.settings);
      if (mode === 'replace') {
        if (snapshot.animals.length > 0) {
          await saveSafetyRollingBackup(snapshot, 'Pre-JSON-replace safety snapshot');
        }
        photoCacheRef.current.clear();
        const flagRes = applyImportConflictAttentionFlags(incoming.animals);
        const nextSnap: BarnDatabaseSnapshot = { ...incoming, animals: flagRes.animals };
        await adapterRef.current!.replaceSnapshot(nextSnap);
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
        const merged = mergeBarnSnapshots(snapshot, incoming);
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
    },
    [snapshot, reloadFromAdapter, notify]
  );

  const importBackupArchiveBytes = useCallback(
    async (bytes: Uint8Array, fileName: string, mode: 'merge' | 'replace') => {
      if (!snapshot) return;
      try {
        const parsed = await parseBackupArchiveOffThread(bytes, fileName, snapshot.settings);

        if (parsed.kind === 'photos_only') {
          if (mode === 'replace') {
            throw new Error(
              'This ZIP contains only animal photos (photos/manifest.json without herd tables). Use "Merge (.JSON / .ZIP)" to restore photos without wiping your records.'
            );
          }
          const photoMerge = mergePhotosOnlyIntoSnapshot(
            snapshot,
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
          if (snapshot.animals.length > 0) {
            await saveSafetyRollingBackup(snapshot, 'Pre-archive-replace safety snapshot');
          }
          photoCacheRef.current.clear();
          const flagRes = applyImportConflictAttentionFlags(parsed.snapshot.animals);
          const nextSnap: BarnDatabaseSnapshot = { ...parsed.snapshot, animals: flagRes.animals };
          await adapterRef.current!.replaceSnapshot(nextSnap);
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
          const merged = mergeBarnSnapshots(snapshot, parsed.snapshot);
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
    },
    [snapshot, reloadFromAdapter, notify]
  );

  const importDeltaOperations = useCallback(
    async (incomingOps: SyncOperation[]) => {
      return enqueueStoreMutation(async () => {
        const currentSnapshot = snapshotRef.current ?? snapshot;
        if (!currentSnapshot) return;
        const result = mergeDeltaOperations(currentSnapshot, syncOperations, incomingOps, deviceId);
        if (result.appliedOpCount === 0) {
          notify('Delta sync checked — no new remote operations needed applying.');
          return;
        }
        await adapterRef.current!.replaceSnapshot(result.nextSnapshot);
        await replaceSyncOperationsInIdb(result.mergedOperations);
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
      });
    },
    [snapshot, syncOperations, deviceId, enqueueStoreMutation, reloadFromAdapter, notify]
  );

  const resolveSyncConflict = useCallback(
    async (conflictId: string, useSide: 'winning' | 'losing') => {
      if (!snapshot) return;
      const conflict = syncConflicts.find((c) => c.conflict_id === conflictId);
      if (!conflict) return;

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

      const applied = mergeDeltaOperations(snapshot, syncOperations, [op], deviceId);
      await adapterRef.current!.replaceSnapshot(applied.nextSnapshot);
      await replaceSyncOperationsInIdb(applied.mergedOperations);
      setSyncOperations(applied.mergedOperations);

      const resolvedConflict: SyncConflictEntry = { ...conflict, resolved: true };
      await saveSyncConflictInIdb(resolvedConflict);
      setSyncConflicts((prev) =>
        prev.map((c) => (c.conflict_id === conflictId ? resolvedConflict : c))
      );
      await reloadFromAdapter();
      notify(`Applied chosen value for ${conflict.entity_label} (${conflict.field_name}).`);
    },
    [snapshot, syncConflicts, syncOperations, deviceId, nextEntityRev, reloadFromAdapter, notify]
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
      const snap = await loadRollingSnapshotBackup(key);
      if (!snap) {
        notify('Could not load that rolling backup snapshot.');
        return;
      }
      if (snapshot && !wipedRecoveryContext?.detected && snapshot.animals.length > 0) {
        await saveSafetyRollingBackup(snapshot, 'Pre-rolling-restore safety snapshot');
      }
      await adapterRef.current!.replaceSnapshot(snap);
      setWipedRecoveryContext(null);
      await reloadFromAdapter();
      notify(`Restored rolling snapshot (${snap.animals.length} animals).`);
    },
    [snapshot, wipedRecoveryContext, saveSafetyRollingBackup, reloadFromAdapter, notify]
  );

  const saveManualOpfsVaultBackup = useCallback(
    async (note?: string): Promise<VaultBackupMetadata | null> => {
      if (!snapshot) return null;
      try {
        const hydrated = await hydrateSnapshotForExport(snapshot);
        const [, opfsRes] = await Promise.allSettled([
          saveRollingSnapshotBackup(hydrated),
          isOpfsSupported()
            ? saveOpfsVaultBackup(hydrated, {
                kind: 'manual',
                note: note?.trim() || 'Manual snapshot saved to Vault',
              })
            : Promise.resolve(null),
        ]);
        const meta = opfsRes.status === 'fulfilled' ? opfsRes.value : null;
        await refreshVaultAndArchives();
        if (meta) {
          await recordBackupExport('json', meta.fileName);
          notify(
            `Saved snapshot to OPFS Backup Vault (${meta.animalCount} animals, ${meta.photoCount} photos · ${formatByteSizePure(meta.byteSize)}).`
          );
          return meta;
        }
        await recordBackupExport('json', 'rolling-local-snapshot');
        notify(
          'Saved snapshot to IndexedDB Rolling Vault (OPFS directory access is unavailable in this browser).'
        );
        return null;
      } catch (err) {
        reportPersistenceFailure('save snapshot to backup vault', err);
        throw err;
      }
    },
    [snapshot, hydrateSnapshotForExport, refreshVaultAndArchives, recordBackupExport, notify, reportPersistenceFailure]
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
      if (isOpfsSupported()) {
        await saveOpfsVaultBackup(hydrated, {
          kind: 'pre_upgrade',
          appVersion: CURRENT_APP_VERSION,
          note: `Pre-upgrade verified (${verification.checksumSha256.slice(0, 12)})`,
        }).catch(() => null);
        await refreshVaultAndArchives();
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
    refreshVaultAndArchives,
    recordBackupExport,
    notify,
    reportPersistenceFailure,
  ]);

  const restoreOpfsVaultBackup = useCallback(
    async (key: string) => {
      try {
        const loaded = await loadOpfsVaultBackup(key, snapshot?.settings);
        if (!loaded) {
          notify('Could not read or verify that OPFS backup file.');
          return;
        }
        const migrated = loaded.migrated;
        if (snapshot && !wipedRecoveryContext?.detected && snapshot.animals.length > 0) {
          await saveSafetyRollingBackup(snapshot, 'Pre-vault-restore safety snapshot');
        }
        photoCacheRef.current?.clear();
        await adapterRef.current!.replaceSnapshot(migrated.snapshot);
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
    [snapshot, wipedRecoveryContext, saveSafetyRollingBackup, reloadFromAdapter, notify, reportPersistenceFailure]
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

  const offloadAnimalsToOpfsArchive = useCallback(
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
  offloadAnimalsRef.current = offloadAnimalsToOpfsArchive;

  const connectBackupSinkFolder = useCallback(async () => {
    try {
      const nextStatus = await configureBackupSinkFolder();
      const flushRes = await flushOpfsBackupsToSinkFolder();
      await refreshVaultAndArchives();
      const syncNote =
        flushRes.pushed > 0
          ? ` Synced ${flushRes.pushed} current vault backup(s) into "${nextStatus.folderName}/pedigree-vault-archive".`
          : '';
      notify(
        `Connected Backup Sink folder "${nextStatus.folderName}". Expiring local backups will copy there automatically before pruning.${syncNote}`
      );
      return nextStatus;
    } catch (err) {
      reportPersistenceFailure('connect Backup Sink folder', err);
      return null;
    }
  }, [refreshVaultAndArchives, notify, reportPersistenceFailure]);

  const reauthorizeBackupSinkFolderAction = useCallback(async () => {
    try {
      const nextStatus = await reauthorizeBackupSinkFolder();
      if (nextStatus.permissionState === 'granted') {
        const flushRes = await flushOpfsBackupsToSinkFolder();
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
      reportPersistenceFailure('re-authorize Backup Sink folder', err);
      return null;
    }
  }, [refreshVaultAndArchives, notify, reportPersistenceFailure]);

  const disconnectBackupSinkFolderAction = useCallback(async () => {
    try {
      const nextStatus = await disconnectBackupSinkFolder();
      setBackupSinkStatus(nextStatus);
      notify('Disconnected Backup Sink folder.');
    } catch (err) {
      reportPersistenceFailure('disconnect Backup Sink folder', err);
    }
  }, [notify, reportPersistenceFailure]);

  const syncVaultBackupsToSinkNow = useCallback(async () => {
    try {
      const res = await flushOpfsBackupsToSinkFolder();
      await refreshVaultAndArchives();
      if (res.pushed > 0) {
        notify(`Synced ${res.pushed} vault backup(s) to connected Backup Sink folder.`);
      } else if (res.skippedReason === 'permission_required') {
        notify('Backup Sink folder needs re-authorization before syncing.');
      } else if (res.skippedReason === 'not_configured') {
        notify('Connect a Backup Sink folder first.');
      } else {
        notify('Vault backups are already empty or up to date.');
      }
      return res;
    } catch (err) {
      reportPersistenceFailure('sync vault backups to folder', err);
      return { pushed: 0, failed: 0 };
    }
  }, [refreshVaultAndArchives, notify, reportPersistenceFailure]);

  const dismissPruneSinkWarning = useCallback(() => {
    clearOpfsPruneSinkWarning();
    setPruneSinkWarning(null);
  }, []);

  const restoreArchivedHerdBundle = useCallback(
    async (
      archiveKey: string,
      options?: { restoreToActiveStatus?: boolean; deleteArchiveAfterRestore?: boolean }
    ) => {
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
    },
    [reloadFromAdapter, notify, reportPersistenceFailure]
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
      await deleteOpfsHerdArchive(archiveKey);
      const currentSnap = snapshotRef.current;
      if (currentSnap) {
        const staleStubs = currentSnap.animals
          .filter((a) => a.offloadedArchiveKey === archiveKey)
          .map((a) => ({
            ...a,
            offloadedArchiveKey: '',
            offloadedAtIso: '',
            updatedAt: nowIsoUtc(),
          }));
        if (staleStubs.length > 0) {
          await adapterRef.current!.saveAnimalsBatch(staleStubs);
        }
      }
      await reloadFromAdapter();
      notify('Deleted archive bundle from OPFS /archives.');
    },
    [reloadFromAdapter, notify]
  );

  const restoreLatestOpfsOnWipedRecovery = useCallback(async () => {
    let targetKey = wipedRecoveryContext?.latestOpfsBackup?.key;
    if (!targetKey) {
      const list = await listOpfsVaultBackups();
      targetKey = list[0]?.key;
    }
    if (!targetKey) {
      notify('No OPFS vault backup found to restore.');
      return;
    }
    await restoreOpfsVaultBackup(targetKey);
  }, [wipedRecoveryContext, restoreOpfsVaultBackup, notify]);

  const startFreshAfterWipedRecovery = useCallback(async () => {
    clearPriorUseSentinel();
    photoCacheRef.current?.clear();
    const adapter = adapterRef.current!;
    const fresh = adapter.rebuildCleanDatabase
      ? await adapter.rebuildCleanDatabase({ lightweightPhotos: true, allowSeedFresh: true })
      : await adapter.initialize({ lightweightPhotos: true, allowSeedFresh: true });
    setSnapshot(fresh);
    setWipedRecoveryContext(null);
    setSelectedAnimalId(null);
    setPedigreeAnimalId(null);
    setActiveSpeciesName(fresh.settings.defaultSpecies || 'Rabbit');
    setRoute('home');
    await refreshVaultAndArchives();
    notify(`Initialized fresh starter herds (${fresh.animals.length} sample animals).`);
  }, [refreshVaultAndArchives, notify]);

  const applyPlatformImportPreview = useCallback(
    async (
      preview: PlatformImportPreview,
      optimizedPhotos: AnimalPhoto[] = [],
      conflictSelections: ConflictSelectionMap = {}
    ) => {
      if (!snapshot) return;

      const resolvedAnimals = resolveAnimalsWithConflictChoices(
        preview.animals,
        snapshot,
        conflictSelections
      );

      let localAdjustedSnapshot = snapshot;
      let incomingSpeciesProfiles = preview.newSpeciesProfiles;
      if (preview.newSpeciesProfiles.length > 0) {
        const ts = nowIsoUtc();
        const offset = preview.newSpeciesProfiles.length;
        incomingSpeciesProfiles = preview.newSpeciesProfiles.map((sp, idx) => ({
          ...sp,
          sortOrder: idx,
          updatedAt: ts,
        }));
        localAdjustedSnapshot = {
          ...snapshot,
          speciesProfiles: snapshot.speciesProfiles.map((sp, idx) => ({
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
    },
    [snapshot, reloadFromAdapter, notify]
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
      if (snapshot && snapshot.animals.length > 0) {
        await saveSafetyRollingBackup(snapshot, 'Pre-SQLite-import safety snapshot');
      }
      photoCacheRef.current.clear();
      const snap = await adapterRef.current!.importRawSqliteBytes(bytes, {
        lightweightPhotos: true,
      });
      setSnapshot(snap);
      setWipedRecoveryContext(null);
      void refreshStorageStatus();
      void refreshVaultAndArchives();
      notify(
        `Loaded SQLite database (${snap.animals.length} animals, ${(snap.animalPhotos ?? []).length} photos).`
      );
    },
    [snapshot, saveSafetyRollingBackup, refreshStorageStatus, refreshVaultAndArchives, notify]
  );

  const analyzePhotoStorageFootprint = useCallback(
    async (presetId?: ImageOptimizationPresetId): Promise<PhotoStorageFootprintReport | null> => {
      const base = snapshotRef.current ?? snapshot;
      if (!base) return null;
      const hydrated = await hydrateSnapshotForExport(base);
      return analyzePhotoStorageFootprintPure(
        hydrated,
        presetId ?? hydrated.settings.imageOptimizationPreset
      );
    },
    [snapshot, hydrateSnapshotForExport]
  );

  const pruneOrphanAnimalPhotos = useCallback(async (): Promise<{
    removedCount: number;
    reclaimedBytes: number;
  }> => {
    return enqueueStoreMutation(async () => {
      const base = snapshotRef.current ?? snapshot;
      if (!base) return { removedCount: 0, reclaimedBytes: 0 };
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
        const hydrated = await hydrateSnapshotForExport(base);
        const targetPreset = presetId ?? hydrated.settings.imageOptimizationPreset ?? 'balanced';
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
      const hydrated = await hydrateSnapshotForExport(base);
      const res = pruneFullResPayloadsFromSnapshotPure(hydrated);
      if (res.prunedCount === 0) {
        notify('No full-resolution photo payloads needed compacting.');
        return { prunedCount: 0, reclaimedBytes: 0 };
      }
      await saveSafetyRollingBackup(hydrated, 'Pre-fullres-photo-prune safety snapshot');
      await adapterRef.current!.saveAnimalPhotosBatch(res.updatedPhotos);
      for (const p of res.updatedPhotos) {
        photoCacheRef.current.set(p.id, p.dataUrl);
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
    if (!snapshot) return null;
    try {
      await saveSafetyRollingBackup(snapshot);
      const result = repairBarnDataHealth(snapshot);
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
  }, [snapshot, saveSafetyRollingBackup, reloadFromAdapter, notify, reportPersistenceFailure]);

  const resetDatabaseConnection = useCallback(async () => {
    const adapter = adapterRef.current!;
    photoCacheRef.current.clear();
    const fresh = adapter.resetConnection
      ? await adapter.resetConnection({ lightweightPhotos: true })
      : await adapter.initialize({ lightweightPhotos: true });
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
  }, [refreshStorageStatus, notify]);

  const purgeCorruptedCachesAndRecover = useCallback(
    async (options: { downloadBackupFirst: boolean; rebuildLocalDb: boolean }) => {
      const adapter = adapterRef.current!;
      let backupFilename: string | null = null;

      if (options.downloadBackupFirst && snapshot) {
        try {
          const hydrated = await hydrateSnapshotForExport(snapshot);
          const zip = await buildCompleteBackupZipOffThread(hydrated);
          backupFilename = `pedigree-recovery-backup-${formatTimestampedBackupSlug()}.zip`;
          await downloadBinaryFile(backupFilename, zip.bytes, 'application/zip');
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
    },
    [snapshot, hydrateSnapshotForExport, refreshStorageStatus, notify]
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
    backupSinkStatus,
    pruneSinkWarning,
    connectBackupSinkFolder,
    reauthorizeBackupSinkFolder: reauthorizeBackupSinkFolderAction,
    disconnectBackupSinkFolder: disconnectBackupSinkFolderAction,
    syncVaultBackupsToSinkNow,
    dismissPruneSinkWarning,
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
    setPrimaryAnimalPhoto,
    updateAnimalPhotoCaption,
    deleteAnimalPhoto,
    deleteAnimal,
    saveCage,
    deleteCage,
    logBreedingWithCascade,
    updateBreedingOutcome,
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
  };
}
