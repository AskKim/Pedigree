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
import { reconcileCarrierTraitLists } from '../core/carrierGenetics';
import { formatGenotypeArray, parseGenotypeString } from '../core/geneticsEngine';
import {
  calculateSavingsPercent,
  formatByteSizePure,
  OptimizedImagePayload,
} from '../core/imageOptimizationSpec';
import {
  addDaysIso,
  Animal,
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
  normalizeSpeciesHubBlockOrder,
  nowIsoUtc,
  PREDEFINED_SPECIES_PRESETS,
  resolveSpeciesProfile,
  ShowEvent,
  SpeciesHubBlockId,
  SpeciesProfile,
} from '../core/models';
import {
  buildIcsCalendarForTasks,
  buildTaskAppDeepLink,
  formatSystemTaskTitle,
} from '../core/calendarExport';
import {
  BackupStatusEvaluation,
  evaluateBackupStatus,
  LastBackupMeta,
} from '../core/backupStatus';
import {
  buildSpeciesHerdMap,
  calculateAnimalCoi,
  calculatePairingCoi,
  CoiAnalysis,
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
  buildCompleteBackupZipArchive,
  mergePhotosOnlyIntoSnapshot,
  parseBackupArchiveInput,
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
  buildDeltaFilePayload,
  getOrCreateLocalDeviceId,
  loadAllSyncConflictsFromIdb,
  loadAllSyncOperationsFromIdb,
  replaceSyncOperationsInIdb,
  saveSyncConflictInIdb,
} from '../storage/localSyncChannels';
import {
  isMemoryLikeError,
  logDiagnosticEvent,
  setCurrentDiagnosticRoute,
} from '../storage/crashLogger';
import { StorageAdapter } from '../storage/storageAdapter';
import {
  analyzeBarnDataHealth,
  BarnHealthRepairResult,
  BarnHealthReport,
  repairBarnDataHealth,
} from '../core/dataHealthCheck';
import {
  checkStorageStatus,
  isQuotaExceededError,
  loadRollingSnapshotBackup,
  requestPersistentStorage,
  saveRollingSnapshotBackup,
  StorageProtectionStatus,
} from '../storage/storageProtection';
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
  downloadBinaryFile,
  downloadTextFile,
  shareTextFileOrDownload,
} from '../utils/webFileActions';
import type { PendingGoogleCalendarSync } from '../components/CalendarIntegrationModals';

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

  const [deviceId] = useState<string>(() => getOrCreateLocalDeviceId());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [snapshot, setSnapshot] = useState<BarnDatabaseSnapshot | null>(null);
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
  const [storageStatus, setStorageStatus] = useState<StorageProtectionStatus | null>(null);
  const [syncOperations, setSyncOperations] = useState<SyncOperation[]>([]);
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

  const notify = useCallback((msg: string) => {
    setErrorMessage(null);
    setStatusMessage(msg);
  }, []);

  const reportPersistenceFailure = useCallback((actionLabel: string, err: unknown) => {
    const quotaHit = isQuotaExceededError(err);
    const memoryHit = isMemoryLikeError(err);
    logDiagnosticEvent({
      level: 'error',
      category: memoryHit ? 'memory' : 'storage',
      message: `${actionLabel} failed`,
      error: err,
    });
    if (quotaHit) {
      setErrorMessage(
        `Device storage is full while trying to ${actionLabel}. Open Import & Settings to download a backup, switch photos to Compact (960px), or free device space.`
      );
    } else if (memoryHit) {
      setErrorMessage(
        `Low device memory while trying to ${actionLabel}. Close other browser tabs or use Compact photos in Import & Settings.`
      );
    } else {
      const detail = err instanceof Error ? err.message : 'Local storage write failed.';
      setErrorMessage(`Could not ${actionLabel}: ${detail}`);
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
        const [initial, persistedStatus, ops, conflicts] = await Promise.all([
          adapter.initialize(),
          requestPersistentStorage(),
          loadAllSyncOperationsFromIdb(),
          loadAllSyncConflictsFromIdb(),
        ]);
        if (!mounted) return;
        setSnapshot(initial);
        setPedigreeGenerations(initial.settings.defaultGenerations);
        setStorageStatus(persistedStatus);
        setSyncOperations(ops);
        setSyncConflicts(conflicts);

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
          window.history.replaceState({}, '', window.location.pathname);
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
          message: 'Database initialization failed during app startup',
          error: err,
        });
        if (mounted) {
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
   */
  const activeSpeciesData: ActiveSpeciesData | null = useMemo(() => {
    if (!snapshot) return null;
    const speciesProfile = resolveSpeciesProfile(activeSpeciesName, snapshot.speciesProfiles);
    const animals = snapshot.animals
      .filter((a) => isSameSpecies(a.species, speciesProfile.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    const activeAnimals = animals.filter((a) => !isAnimalArchived(a));
    const archivedAnimals = animals.filter((a) => isAnimalArchived(a));
    const archivedIds = new Set(archivedAnimals.map((a) => a.id));

    const herdById = buildSpeciesHerdMap(animals, speciesProfile.name);
    const coiByAnimalId = new Map<string, CoiAnalysis>();
    // Only precompute pedigree COI matrix on screens that render pedigree/lineage metrics
    if (route === 'herd' || route === 'pedigree' || route === 'breeding') {
      for (const animal of animals) {
        coiByAnimalId.set(animal.id, calculateAnimalCoi(animal, herdById));
      }
    }

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
      coiByAnimalId,
      cages,
      breedings,
      tasks,
      careLogs,
      shows,
      testingRecordCount,
      nonTestingRecordCount,
      totalRecordCount,
    };
  }, [snapshot, activeSpeciesName, route]);

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

  const reloadFromAdapter = useCallback(async () => {
    const fresh = await adapterRef.current!.loadSnapshot();
    setSnapshot(fresh);
    void refreshStorageStatus();
  }, [refreshStorageStatus]);

  const updateSettings = useCallback(
    async (patch: Partial<BarnSettings>, options?: { silent?: boolean }) => {
      if (!snapshot) return;
      try {
        const updated: BarnSettings = {
          ...snapshot.settings,
          ...patch,
          updatedAt: nowIsoUtc(),
        };
        await adapterRef.current!.saveSettings(updated);
        const ops = diffEntityFieldsToOperations({
          entityType: 'settings',
          previous: snapshot.settings,
          next: updated,
          deviceId,
          nextCounter: allocateNextLogicalCounter,
        });
        await recordOutboxOps(ops);
        if (patch.defaultGenerations) {
          setPedigreeGenerations(patch.defaultGenerations);
        }
        await reloadFromAdapter();
        if (!options?.silent) {
          notify('Barn preferences saved locally.');
        }
      } catch (err) {
        reportPersistenceFailure('save barn preferences', err);
      }
    },
    [snapshot, deviceId, recordOutboxOps, reloadFromAdapter, notify, reportPersistenceFailure]
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
      const ts = nowIsoUtc();
      const existing = snapshot?.speciesProfiles.find((sp) => sp.id === profile.id);
      if (existing) {
        const clean: SpeciesProfile = {
          ...profile,
          sortOrder: profile.sortOrder ?? existing.sortOrder ?? 0,
          name: profile.name.trim(),
          defaultAnimalPrefix: (profile.defaultAnimalPrefix || '').trim(),
          memoText: sanitizeSpeciesMemo(profile.memoText ?? existing.memoText ?? ''),
          memoUpdatedAt: profile.memoUpdatedAt ?? existing.memoUpdatedAt ?? '',
          createdAt: profile.createdAt || existing.createdAt || ts,
          updatedAt: ts,
        };
        await adapterRef.current!.saveSpeciesProfile(clean);
        await recordOutboxOps(
          diffEntityFieldsToOperations({
            entityType: 'species',
            previous: existing,
            next: clean,
            deviceId,
            nextCounter: allocateNextLogicalCounter,
          })
        );
        await reloadFromAdapter();
        notify(`${clean.name} schedule saved.`);
      } else {
        const currentList = snapshot?.speciesProfiles ?? [];
        const cleanNew: SpeciesProfile = {
          ...profile,
          id: profile.id || `species-${generateUuid()}`,
          sortOrder: currentList.length,
          name: profile.name.trim(),
          defaultAnimalPrefix: (profile.defaultAnimalPrefix || '').trim(),
          memoText: sanitizeSpeciesMemo(profile.memoText ?? ''),
          memoUpdatedAt: profile.memoUpdatedAt ?? '',
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
          })
        );
        await reloadFromAdapter();
        notify(`${cleanNew.name} added to your barn.`);
      }
    },
    [snapshot, deviceId, recordOutboxOps, reloadFromAdapter, notify]
  );

  const saveSpeciesMemo = useCallback(
    async (speciesId: string, rawMemoText: unknown, options?: { silent?: boolean }) => {
      if (!snapshot) return;
      const existing = snapshot.speciesProfiles.find((sp) => sp.id === speciesId);
      if (!existing) return;
      const cleanMemo = sanitizeSpeciesMemo(rawMemoText);
      if ((existing.memoText ?? '') === cleanMemo) return;
      const ts = nowIsoUtc();
      const updated: SpeciesProfile = {
        ...existing,
        memoText: cleanMemo,
        memoUpdatedAt: ts,
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
    [snapshot, deviceId, recordOutboxOps, reloadFromAdapter, notify, reportPersistenceFailure]
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
          await saveRollingSnapshotBackup(snapshot);
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
    [snapshot, activeSpeciesName, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const exportTimestampedSpeciesBackup = useCallback(
    (speciesName: string, reason: SpeciesBackupReason = 'manual') => {
      if (!snapshot) return;
      const filename = buildSpeciesZipBackupFileName(
        snapshot.settings.barnName,
        speciesName,
        reason
      );
      const archive = buildCompleteBackupZipArchive(snapshot, speciesName, {
        backupScope: 'species',
        backupReason: reason,
        targetSpecies: speciesName,
      });
      downloadBinaryFile(filename, archive.bytes, 'application/zip');
      void recordBackupExport('zip', filename);
      notify(
        `Saved ${speciesName} backup archive: ${filename} (${archive.animalCount} animals, ${archive.photoCount} photos, Printable Barn Binder included)`
      );
    },
    [snapshot, recordBackupExport, notify]
  );

  const saveAnimal = useCallback(
    async (
      draft: Omit<Animal, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string },
      linkParentTarget?: { childId: string; asSire: boolean },
      initialPhotos?: Array<OptimizedImagePayload & { caption?: string }>
    ): Promise<string> => {
      const ts = nowIsoUtc();
      const previous = draft.id ? snapshot?.animals.find((a) => a.id === draft.id) : undefined;
      const parsedGeno =
        draft.genotype && draft.genotype.length > 0
          ? draft.genotype
          : parseGenotypeString(draft.genotypeRaw, draft.species);
      const normalizedRaw = draft.genotypeRaw?.trim() || formatGenotypeArray(parsedGeno);

      const carriers = reconcileCarrierTraitLists(
        draft.suspectedCarrierOf,
        draft.confirmedCarrierOf,
        draft.clearedCarrierOf
      );

      const animal: Animal = {
        ...draft,
        id: draft.id || generateUuid(),
        tattoo: draft.tattoo.trim(),
        name: draft.name.trim(),
        archived: Boolean(draft.archived),
        needsAttention: Boolean(draft.needsAttention),
        genotype: parsedGeno,
        genotypeRaw: normalizedRaw,
        rufusLevel: normalizeRufusLevel(draft.rufusLevel),
        suspectedCarrierOf: carriers.suspectedCarrierOf,
        confirmedCarrierOf: carriers.confirmedCarrierOf,
        clearedCarrierOf: carriers.clearedCarrierOf,
        createdAt: draft.createdAt || ts,
        updatedAt: ts,
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
          })
        );

        if (initialPhotos && initialPhotos.length > 0) {
          const existingPhotos = (snapshot?.animalPhotos ?? []).filter(
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
            createdAt: ts,
            updatedAt: ts,
          }));
          await adapterRef.current!.saveAnimalPhotosBatch(newPhotoRecords);
        }

        if (linkParentTarget && snapshot) {
          const child = snapshot.animals.find((a) => a.id === linkParentTarget.childId);
          if (child && isSameSpecies(child.species, animal.species) && child.id !== animal.id) {
            const updatedChild: Animal = {
              ...child,
              sireId: linkParentTarget.asSire ? animal.id : child.sireId,
              damId: !linkParentTarget.asSire ? animal.id : child.damId,
              updatedAt: ts,
            };
            await adapterRef.current!.saveAnimal(updatedChild);
            await recordOutboxOps(
              diffEntityFieldsToOperations({
                entityType: 'animal',
                previous: child,
                next: updatedChild,
                deviceId,
                nextCounter: allocateNextLogicalCounter,
              })
            );
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
        return animal.id;
      }
    },
    [snapshot, deviceId, recordOutboxOps, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const archiveAnimals = useCallback(
    async (animalIds: string[], archived: boolean) => {
      if (!snapshot || animalIds.length === 0) return;
      const idSet = new Set(animalIds);
      const ts = nowIsoUtc();
      const ops: SyncOperation[] = [];
      const updatedBatch: Animal[] = [];

      for (const animal of snapshot.animals) {
        if (!idSet.has(animal.id)) continue;
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
          })
        );
      }

      if (updatedBatch.length > 0) {
        await adapterRef.current!.saveAnimalsBatch(updatedBatch);
      }
      await recordOutboxOps(ops);
      await reloadFromAdapter();
      notify(
        archived
          ? `Moved ${animalIds.length} animal${animalIds.length === 1 ? '' : 's'} to Archived (retained for pedigrees).`
          : `Restored ${animalIds.length} animal${animalIds.length === 1 ? '' : 's'} back to Active herd.`
      );
    },
    [snapshot, deviceId, recordOutboxOps, reloadFromAdapter, notify]
  );

  const deleteAnimalsBatch = useCallback(
    async (animalIds: string[]) => {
      if (!snapshot || animalIds.length === 0) return;
      try {
        await saveRollingSnapshotBackup(snapshot);
        const idSet = new Set(animalIds);
        const ts = nowIsoUtc();
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
              updatedAt: ts,
            });
          }
        }
        if (unlinkedChildren.length > 0) {
          await adapterRef.current!.saveAnimalsBatch(unlinkedChildren);
        }

        await adapterRef.current!.deleteAnimalsBatch(Array.from(idSet));
        for (const id of idSet) {
          ops.push(
            createOutboxOperation({
              entityType: 'animal',
              entityUuid: id,
              deviceId,
              logicalCounter: allocateNextLogicalCounter(),
              fieldName: '__delete__',
              newValue: true,
              timestamp: ts,
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
        await saveRollingSnapshotBackup(snapshot);
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
    async (cageDraft: Omit<CageLocation, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
      const ts = nowIsoUtc();
      const prev = cageDraft.id ? snapshot?.cages.find((c) => c.id === cageDraft.id) : undefined;
      const cage: CageLocation = {
        ...cageDraft,
        id: cageDraft.id || generateUuid(),
        label: cageDraft.label.trim(),
        createdAt: prev?.createdAt || ts,
        updatedAt: ts,
      };
      await adapterRef.current!.saveCage(cage);
      await recordOutboxOps(
        diffEntityFieldsToOperations({
          entityType: 'cage',
          previous: prev,
          next: cage,
          deviceId,
          nextCounter: allocateNextLogicalCounter,
        })
      );
      await reloadFromAdapter();
      notify(`Location ${cage.label} saved.`);
    },
    [snapshot, deviceId, recordOutboxOps, reloadFromAdapter, notify]
  );

  const deleteCage = useCallback(
    async (id: string) => {
      await adapterRef.current!.deleteCage(id);
      await reloadFromAdapter();
      notify('Cage/location removed.');
    },
    [reloadFromAdapter, notify]
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
      notes: string;
      autoScheduleChores: boolean;
    }) => {
      if (!snapshot) return;
      const targetSpeciesName =
        params.dam?.species || params.sire?.species || activeSpeciesName;
      const sp = resolveSpeciesProfile(targetSpeciesName, snapshot.speciesProfiles);
      const ts = nowIsoUtc();

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

      if (!resolvedSire || !resolvedDam) return;

      const herdMap = buildSpeciesHerdMap(
        [...snapshot.animals, ...newlyCreatedParents],
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
        notes: params.notes.trim(),
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
          })
        );

        let cascaded: BarnTask[] = [];
        let taskCount = 0;
        if (params.autoScheduleChores) {
          cascaded = generateCascadedTasksForBreeding(breeding, sp);
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
              })
            );
          }
        }

        await recordOutboxOps(ops);
        await reloadFromAdapter();

        let calendarResultMsg = '';
        const calConfig = normalizeCalendarSyncSettings(snapshot.settings.calendarSync);
        if (calConfig.autoAddNewTasks && calConfig.includeBreedingTasks && cascaded.length > 0) {
          const dated = cascaded.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.dueDateIso || ''));
          if (dated.length > 0) {
            const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
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
                snapshot.settings.barnName,
                `${resolvedDam.name}-breeding-chores`,
                {
                  animals: [...snapshot.animals, ...newlyCreatedParents],
                  breedings: [...snapshot.breedings, breeding],
                  speciesProfiles: snapshot.speciesProfiles,
                  appBaseUrl,
                }
              );
              if (ics) {
                downloadTextFile(ics.filename, ics.icsContent, 'text/calendar');
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
      } catch (err) {
        reportPersistenceFailure('save breeding record', err);
      }
    },
    [
      snapshot,
      activeSpeciesName,
      deviceId,
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
        notes: string;
        registerJuniorCount: number;
      }
    ) => {
      if (!snapshot) return;
      const ts = nowIsoUtc();
      const sp = resolveSpeciesProfile(existing.species, snapshot.speciesProfiles);
      const ops: SyncOperation[] = [];

      let createdAny = existing.offspringCreated;
      if (patch.registerJuniorCount > 0) {
        const sire = snapshot.animals.find((a) => a.id === existing.sireId);
        const dam = snapshot.animals.find((a) => a.id === existing.damId);
        const count = Math.min(16, Math.max(0, patch.registerJuniorCount));
        const createdJuniors: Animal[] = [];
        for (let i = 1; i <= count; i++) {
          const jr: Animal = {
            id: generateUuid(),
            tattoo: `${(dam?.tattoo || sp.name.slice(0, 3).toUpperCase()).slice(0, 6)}-K${i}`,
            name: applyAnimalNamePrefix(
              `${existing.damName} ${sp.offspringLabel} #${i}`,
              sp.defaultAnimalPrefix
            ),
            species: sp.name,
            breed: dam?.breed || sire?.breed || '',
            variety: dam?.variety || sire?.variety || '',
            sex: i % 2 === 0 ? 'Male' : 'Female',
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
            breederName: snapshot.settings.breederName || dam?.breederName || '',
            ownerName: snapshot.settings.barnName || '',
            sireId: existing.sireId,
            damId: existing.damId,
            notes: `Auto-registered from ${existing.sireName} × ${existing.damName} litter.`,
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
            })
          );
        }
        await adapterRef.current!.saveAnimalsBatch(createdJuniors);
        createdAny = true;
      }

      const updated: BreedingRecord = {
        ...existing,
        status: patch.status,
        actualBirthDateIso: patch.actualBirthDateIso,
        liveCount: patch.liveCount,
        stillbornCount: patch.stillbornCount,
        fosteredCount: patch.fosteredCount,
        weanedCount: patch.weanedCount,
        offspringCreated: createdAny,
        notes: patch.notes,
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
        })
      );
      await recordOutboxOps(ops);
      await reloadFromAdapter();
      notify(
        patch.registerJuniorCount > 0
          ? `Litter updated & ${patch.registerJuniorCount} ${sp.offspringLabel.toLowerCase()} records created.`
          : 'Litter outcome saved.'
      );
    },
    [snapshot, deviceId, recordOutboxOps, reloadFromAdapter, notify]
  );

  const deleteBreeding = useCallback(
    async (id: string) => {
      await adapterRef.current!.deleteBreeding(id);
      await reloadFromAdapter();
      notify('Breeding & linked chores removed.');
    },
    [reloadFromAdapter, notify]
  );

  const saveTask = useCallback(
    async (taskDraft: Omit<BarnTask, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
      const ts = nowIsoUtc();
      const prev = taskDraft.id ? snapshot?.tasks.find((t) => t.id === taskDraft.id) : undefined;
      const task: BarnTask = {
        ...taskDraft,
        id: taskDraft.id || generateUuid(),
        title: taskDraft.title.trim(),
        createdAt: prev?.createdAt || ts,
        updatedAt: ts,
      };
      await adapterRef.current!.saveTask(task);
      await recordOutboxOps(
        diffEntityFieldsToOperations({
          entityType: 'task',
          previous: prev,
          next: task,
          deviceId,
          nextCounter: allocateNextLogicalCounter,
        })
      );
      await reloadFromAdapter();

      let calendarNote = '';
      if (!prev && task.dueDateIso) {
        const calConfig = normalizeCalendarSyncSettings(snapshot?.settings.calendarSync);
        if (calConfig.autoAddNewTasks && calConfig.includeManualTasks) {
          const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
          if (calConfig.deliveryMode === 'google_calendar' && isOnline) {
            setPendingCalendarSync({
              tasks: [task],
              filenameHint: formatSystemTaskTitle(task, calConfig, snapshot ?? undefined),
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
              snapshot?.settings.barnName,
              undefined,
              {
                animals: snapshot?.animals,
                breedings: snapshot?.breedings,
                speciesProfiles: snapshot?.speciesProfiles,
                appBaseUrl,
              }
            );
            if (ics) {
              downloadTextFile(ics.filename, ics.icsContent, 'text/calendar');
              calendarNote =
                calConfig.deliveryMode === 'google_calendar' && !isOnline
                  ? ' Offline — downloaded .ICS fallback.'
                  : ' Exported to calendar (.ICS).';
            }
          }
        }
      }

      notify(calendarNote ? `Barn chore saved.${calendarNote}` : 'Barn chore saved.');
    },
    [snapshot, deviceId, recordOutboxOps, reloadFromAdapter, notify]
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

      downloadTextFile(ics.filename, ics.icsContent, 'text/calendar');
      const prefix = options?.fallbackPrefix ? `${options.fallbackPrefix} ` : '';
      notify(
        `${prefix}Downloaded ${ics.eventCount} calendar event${
          ics.eventCount === 1 ? '' : 's'
        } (.ICS)${calConfig.alarmEnabled ? ' with alarm' : ''}.`
      );
      return ics.eventCount;
    },
    [snapshot, notify]
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
      const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;

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
    const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;

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
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(link);
          notify('Copied direct app task link to clipboard.');
          return;
        }
      } catch {
        // Fallback below if clipboard permission is blocked in preview frame
      }
      notify(`App task link: ${link}`);
    },
    [notify]
  );

  const toggleTaskCompleted = useCallback(
    async (task: BarnTask) => {
      const updated = {
        ...task,
        completed: !task.completed,
        updatedAt: nowIsoUtc(),
      };
      await adapterRef.current!.saveTask(updated);
      await recordOutboxOps(
        diffEntityFieldsToOperations({
          entityType: 'task',
          previous: task,
          next: updated,
          deviceId,
          nextCounter: allocateNextLogicalCounter,
        })
      );
      await reloadFromAdapter();
    },
    [deviceId, recordOutboxOps, reloadFromAdapter]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      await adapterRef.current!.deleteTask(id);
      await reloadFromAdapter();
    },
    [reloadFromAdapter]
  );

  const addCareLog = useCallback(
    async (draft: Omit<CareLog, 'id' | 'createdAt' | 'updatedAt'>) => {
      if (!snapshot) return;
      const ts = nowIsoUtc();
      const log: CareLog = {
        ...draft,
        id: generateUuid(),
        createdAt: ts,
        updatedAt: ts,
      };
      await adapterRef.current!.saveCareLog(log);
      const ops: SyncOperation[] = diffEntityFieldsToOperations({
        entityType: 'careLog',
        previous: undefined,
        next: log,
        deviceId,
        nextCounter: allocateNextLogicalCounter,
      });

      const animal = snapshot.animals.find((a) => a.id === draft.animalId);
      if (animal && (draft.weightGrams > 0 || draft.showLegEarned)) {
        const nextAnimal: Animal = {
          ...animal,
          weightGrams: draft.weightGrams > 0 ? draft.weightGrams : animal.weightGrams,
          legsCount: draft.showLegEarned ? animal.legsCount + 1 : animal.legsCount,
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
          })
        );
      }

      await recordOutboxOps(ops);
      await reloadFromAdapter();
      notify(`${draft.type} logged.`);
    },
    [snapshot, deviceId, recordOutboxOps, reloadFromAdapter, notify]
  );

  const deleteCareLog = useCallback(
    async (id: string) => {
      await adapterRef.current!.deleteCareLog(id);
      await reloadFromAdapter();
    },
    [reloadFromAdapter]
  );

  const saveShow = useCallback(
    async (draft: Omit<ShowEvent, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
      const ts = nowIsoUtc();
      const prev = draft.id ? snapshot?.shows.find((s) => s.id === draft.id) : undefined;
      const show: ShowEvent = {
        ...draft,
        id: draft.id || generateUuid(),
        name: draft.name.trim(),
        createdAt: prev?.createdAt || ts,
        updatedAt: ts,
      };
      await adapterRef.current!.saveShow(show);
      await recordOutboxOps(
        diffEntityFieldsToOperations({
          entityType: 'show',
          previous: prev,
          next: show,
          deviceId,
          nextCounter: allocateNextLogicalCounter,
        })
      );
      await reloadFromAdapter();
      notify(`Show "${show.name}" saved.`);
    },
    [snapshot, deviceId, recordOutboxOps, reloadFromAdapter, notify]
  );

  const deleteShow = useCallback(
    async (id: string) => {
      await adapterRef.current!.deleteShow(id);
      await reloadFromAdapter();
      notify('Show removed.');
    },
    [reloadFromAdapter, notify]
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
        await saveRollingSnapshotBackup(snapshot);
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
    [snapshot, selectedAnimalId, pedigreeAnimalId, reloadFromAdapter, notify, reportPersistenceFailure]
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
        await saveRollingSnapshotBackup(snapshot);
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
    [snapshot, selectedAnimalId, pedigreeAnimalId, reloadFromAdapter, notify, reportPersistenceFailure]
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
        await saveRollingSnapshotBackup(snapshot);
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
    [snapshot, selectedAnimalId, pedigreeAnimalId, reloadFromAdapter, notify, reportPersistenceFailure]
  );

  const clearAllRecordsKeepSpecies = useCallback(async () => {
    if (!snapshot) return;
    try {
      await saveRollingSnapshotBackup(snapshot);
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
      setSelectedAnimalId(null);
      setPedigreeAnimalId(null);
      await reloadFromAdapter();
      notify('Deleted all animal, photo, breeding, and chore data across all species.');
    } catch (err) {
      reportPersistenceFailure('clear all animal data', err);
    }
  }, [snapshot, reloadFromAdapter, notify, reportPersistenceFailure]);

  const restoreFactoryDefaults = useCallback(async () => {
    try {
      if (snapshot) {
        await saveRollingSnapshotBackup(snapshot);
      }
      const factorySnapshot = buildFullPredefinedSampleSnapshot();
      await adapterRef.current!.replaceSnapshot(factorySnapshot);
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
  }, [snapshot, reloadFromAdapter, notify, reportPersistenceFailure]);

  const importJsonBackup = useCallback(
    async (jsonText: string, mode: 'merge' | 'replace') => {
      if (!snapshot) return;
      const incoming = parseBarnBackupJson(jsonText, snapshot.settings);
      if (mode === 'replace') {
        await saveRollingSnapshotBackup(snapshot);
        await adapterRef.current!.replaceSnapshot(incoming);
        await reloadFromAdapter();
        notify(
          `Restored ${incoming.animals.length} animals & ${incoming.animalPhotos.length} photos from JSON backup.`
        );
      } else {
        const merged = mergeBarnSnapshots(snapshot, incoming);
        await adapterRef.current!.replaceSnapshot(merged.snapshot);
        await reloadFromAdapter();
        notify(
          `UUID/Timestamp sync complete: +${merged.animalsAdded} added, ${merged.animalsUpdated} updated, ${merged.photosMerged} photos merged.`
        );
      }
    },
    [snapshot, reloadFromAdapter, notify]
  );

  const importBackupArchiveBytes = useCallback(
    async (bytes: Uint8Array, fileName: string, mode: 'merge' | 'replace') => {
      if (!snapshot) return;
      try {
        const parsed = parseBackupArchiveInput(bytes, fileName, snapshot.settings);

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
          await saveRollingSnapshotBackup(snapshot);
          await adapterRef.current!.replaceSnapshot(parsed.snapshot);
          await reloadFromAdapter();
          logDiagnosticEvent({
            level: 'info',
            category: 'storage',
            message: `Restored full archive "${fileName}" (${parsed.snapshot.animals.length} animals, ${parsed.photosReconstructed} photos)`,
          });
          notify(
            `Restored ${parsed.snapshot.animals.length} animals & ${parsed.photosReconstructed} photos from ${parsed.sourceFormat.toUpperCase()} backup.`
          );
        } else {
          const merged = mergeBarnSnapshots(snapshot, parsed.snapshot);
          await adapterRef.current!.replaceSnapshot(merged.snapshot);
          await reloadFromAdapter();
          logDiagnosticEvent({
            level: 'info',
            category: 'storage',
            message: `Merged archive "${fileName}" (+${merged.animalsAdded} added, ${merged.photosMerged} photos merged)`,
          });
          notify(
            `Merge complete: +${merged.animalsAdded} added, ${merged.animalsUpdated} updated, ${merged.photosMerged} photos merged.`
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
      if (!snapshot) return;
      const result = mergeDeltaOperations(snapshot, syncOperations, incomingOps, deviceId);
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
    },
    [snapshot, syncOperations, deviceId, reloadFromAdapter, notify]
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
    [snapshot, syncConflicts, syncOperations, deviceId, reloadFromAdapter, notify]
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
      await adapterRef.current!.replaceSnapshot(snap);
      await reloadFromAdapter();
      notify(`Restored rolling snapshot (${snap.animals.length} animals).`);
    },
    [reloadFromAdapter, notify]
  );

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
      await adapterRef.current!.replaceSnapshot(merged.snapshot);
      await reloadFromAdapter();
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
        `${preview.platformName} import complete: ${resolvedAnimals.length} animals (${preview.parentLinksResolved} parent links), ${preview.breedings.length} breedings, ${preview.careLogs.length} logs${photoSummary}${newSpSummary}.`
      );
    },
    [snapshot, reloadFromAdapter, notify]
  );

  const exportSqliteBytes = useCallback(async () => {
    return adapterRef.current!.exportRawSqliteBytes();
  }, []);

  const importSqliteBytes = useCallback(
    async (bytes: Uint8Array) => {
      if (snapshot) {
        await saveRollingSnapshotBackup(snapshot);
      }
      const snap = await adapterRef.current!.importRawSqliteBytes(bytes);
      setSnapshot(snap);
      void refreshStorageStatus();
      notify(
        `Loaded SQLite database (${snap.animals.length} animals, ${(snap.animalPhotos ?? []).length} photos).`
      );
    },
    [snapshot, refreshStorageStatus, notify]
  );

  const scanDatabaseHealth = useCallback((): BarnHealthReport | null => {
    if (!snapshot) return null;
    return analyzeBarnDataHealth(snapshot);
  }, [snapshot]);

  const runHealthCheckAndRepair = useCallback(async (): Promise<BarnHealthRepairResult | null> => {
    if (!snapshot) return null;
    try {
      await saveRollingSnapshotBackup(snapshot);
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
  }, [snapshot, reloadFromAdapter, notify, reportPersistenceFailure]);

  const resetDatabaseConnection = useCallback(async () => {
    const adapter = adapterRef.current!;
    const fresh = adapter.resetConnection
      ? await adapter.resetConnection()
      : await adapter.initialize();
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
          const zip = buildCompleteBackupZipArchive(snapshot);
          backupFilename = `pedigree-recovery-backup-${formatTimestampedBackupSlug()}.zip`;
          downloadBinaryFile(backupFilename, zip.bytes, 'application/zip');
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

      const fresh =
        options.rebuildLocalDb && adapter.rebuildCleanDatabase
          ? await adapter.rebuildCleanDatabase()
          : adapter.resetConnection
          ? await adapter.resetConnection()
          : await adapter.initialize();

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
    [snapshot, refreshStorageStatus, notify]
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
    storageStatus,
    refreshStorageStatus,
    triggerPersistentStorageRequest,
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
    archiveAnimals,
    deleteAnimalsBatch,
    migrateAnimalsSpecies,
    addOptimizedAnimalPhotos,
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
    importSqliteBytes,
    scanDatabaseHealth,
    runHealthCheckAndRepair,
    resetDatabaseConnection,
    purgeCorruptedCachesAndRecover,
  };
}
