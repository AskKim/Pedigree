/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
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
  BarnDatabaseSnapshot,
  BarnSettings,
  BarnTask,
  BreedingRecord,
  CageLocation,
  CareLog,
  generateUuid,
  isAnimalArchived,
  isSameSpecies,
  nowIsoUtc,
  resolveSpeciesProfile,
  ShowEvent,
  SpeciesProfile,
} from '../core/models';
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
  countSpeciesTestingRecords,
  purgeAllSpeciesRecordsPure,
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
  exportSpeciesBackupJson,
  formatTimestampedBackupSlug,
  mergeBarnSnapshots,
  parseBarnBackupJson,
} from '../core/syncAndExports';
import {
  createOutboxOperation,
  diffEntityFieldsToOperations,
  mergeDeltaOperations,
  SyncConflictEntry,
  SyncEntityType,
  SyncOperation,
} from '../core/syncOutbox';
import { generateCascadedTasksForBreeding } from '../core/taskMaster';
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
import { downloadBinaryFile, downloadTextFile } from '../utils/webFileActions';

export type WorkspaceRoute =
  | 'home'
  | 'dashboard'
  | 'herd'
  | 'breeding'
  | 'pedigree'
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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [storageStatus, setStorageStatus] = useState<StorageProtectionStatus | null>(null);
  const [syncOperations, setSyncOperations] = useState<SyncOperation[]>([]);
  const [syncConflicts, setSyncConflicts] = useState<SyncConflictEntry[]>([]);
  const [openAddSpeciesInSettings, setOpenAddSpeciesInSettings] = useState<boolean>(false);

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
      setRoute(targetRoute);
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
    for (const animal of animals) {
      coiByAnimalId.set(animal.id, calculateAnimalCoi(animal, herdById));
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
      totalRecordCount,
    };
  }, [snapshot, activeSpeciesName]);

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
    async (speciesName: string, taskIds: string[]) => {
      if (!snapshot) return;
      const key = speciesName.trim().toLowerCase();
      const prevMap = snapshot.settings.dismissedTaskGroupKeys || {};
      const nextMap = { ...prevMap, [key]: taskIds };
      await updateSettings({ dismissedTaskGroupKeys: nextMap }, { silent: true });
      notify(`Cleared alert for current ${speciesName} overdue tasks.`);
    },
    [snapshot, updateSettings, notify]
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

  const deleteSpeciesProfile = useCallback(
    async (profile: SpeciesProfile) => {
      try {
        if (snapshot) {
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
          setActiveSpeciesName('Rabbit');
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
    (speciesName: string) => {
      if (!snapshot) return;
      const slug = speciesName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const stamp = formatTimestampedBackupSlug();
      const filename = `pedigree-${slug}-backup-${stamp}.json`;
      const json = exportSpeciesBackupJson(snapshot, speciesName);
      downloadTextFile(filename, json, 'application/json');
      notify(`Saved timestamped backup: ${filename}`);
    },
    [snapshot, notify]
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
          : parseGenotypeString(draft.genotypeRaw);
      const normalizedRaw = draft.genotypeRaw?.trim() || formatGenotypeArray(parsedGeno);

      const animal: Animal = {
        ...draft,
        id: draft.id || generateUuid(),
        tattoo: draft.tattoo.trim(),
        name: draft.name.trim(),
        archived: Boolean(draft.archived),
        genotype: parsedGeno,
        genotypeRaw: normalizedRaw,
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

      for (const animal of snapshot.animals) {
        if (!idSet.has(animal.id)) continue;
        const nextStatus =
          !archived && (animal.status === 'Deceased' || animal.status === 'Sold' || animal.status === 'Retired')
            ? 'Active'
            : animal.status;
        const updated: Animal = {
          ...animal,
          archived,
          status: nextStatus,
          updatedAt: ts,
        };
        await adapterRef.current!.saveAnimal(updated);
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

        // Unlink offspring sire/dam references pointing to deleted animals
        for (const a of snapshot.animals) {
          if (idSet.has(a.id)) continue;
          const clearSire = a.sireId && idSet.has(a.sireId);
          const clearDam = a.damId && idSet.has(a.damId);
          if (clearSire || clearDam) {
            await adapterRef.current!.saveAnimal({
              ...a,
              sireId: clearSire ? '' : a.sireId,
              damId: clearDam ? '' : a.damId,
              updatedAt: ts,
            });
          }
        }

        for (const id of idSet) {
          await adapterRef.current!.deleteAnimal(id);
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
   * Migrates one or more selected animals (plus their photos & care logs) to another species,
   * while preserving relationships among any animals that moved together and safely clearing
   * parent pointers if a parent stayed behind in the previous species.
   */
  const migrateAnimalsSpecies = useCallback(
    async (animalIds: string[], targetSpeciesName: string) => {
      if (!snapshot || animalIds.length === 0) return;
      const targetSp = snapshot.speciesProfiles.find((sp) =>
        isSameSpecies(sp.name, targetSpeciesName)
      );
      const cleanTarget = targetSp ? targetSp.name : targetSpeciesName.trim();
      if (!cleanTarget) return;

      const idSet = new Set(animalIds);
      const ts = nowIsoUtc();
      const ops: SyncOperation[] = [];

      for (const animal of snapshot.animals) {
        if (!idSet.has(animal.id)) continue;
        if (isSameSpecies(animal.species, cleanTarget)) continue;
        const updated: Animal = {
          ...animal,
          species: cleanTarget,
          // Keep parent link if parent was also migrated in this batch; otherwise clear cross-species pointer
          sireId: animal.sireId && idSet.has(animal.sireId) ? animal.sireId : '',
          damId: animal.damId && idSet.has(animal.damId) ? animal.damId : '',
          updatedAt: ts,
        };
        await adapterRef.current!.saveAnimal(updated);
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

      // Migrate attached photos & care logs cleanly
      const updatedPhotos: AnimalPhoto[] = [];
      for (const p of snapshot.animalPhotos ?? []) {
        if (idSet.has(p.animalId) && !isSameSpecies(p.species, cleanTarget)) {
          updatedPhotos.push({ ...p, species: cleanTarget, updatedAt: ts });
        }
      }
      if (updatedPhotos.length > 0) {
        await adapterRef.current!.saveAnimalPhotosBatch(updatedPhotos);
      }

      for (const log of snapshot.careLogs) {
        if (idSet.has(log.animalId) && !isSameSpecies(log.species, cleanTarget)) {
          const nextLog: CareLog = { ...log, species: cleanTarget, updatedAt: ts };
          await adapterRef.current!.saveCareLog(nextLog);
          ops.push(
            ...diffEntityFieldsToOperations({
              entityType: 'careLog',
              previous: log,
              next: nextLog,
              deviceId,
              nextCounter: allocateNextLogicalCounter,
            })
          );
        }
      }

      if (selectedAnimalId && idSet.has(selectedAnimalId)) setSelectedAnimalId(null);
      if (pedigreeAnimalId && idSet.has(pedigreeAnimalId)) setPedigreeAnimalId(null);

      await recordOutboxOps(ops);
      await reloadFromAdapter();
      notify(
        `Migrated ${idSet.size} animal${idSet.size === 1 ? '' : 's'} & their records to ${cleanTarget}.`
      );
    },
    [snapshot, selectedAnimalId, pedigreeAnimalId, deviceId, recordOutboxOps, reloadFromAdapter, notify]
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
      sire: Animal;
      dam: Animal;
      bredDateIso: string;
      status: BreedingRecord['status'];
      notes: string;
      autoScheduleChores: boolean;
    }) => {
      if (!snapshot) return;
      const sp = resolveSpeciesProfile(params.dam.species, snapshot.speciesProfiles);
      const herdMap = buildSpeciesHerdMap(snapshot.animals, sp.name);
      const coi = calculatePairingCoi(params.sire.id, params.dam.id, herdMap).coiPercent;
      const ts = nowIsoUtc();

      const breeding: BreedingRecord = {
        id: generateUuid(),
        species: sp.name,
        sireId: params.sire.id,
        damId: params.dam.id,
        sireName: params.sire.name,
        damName: params.dam.name,
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
        await adapterRef.current!.saveBreeding(breeding);
        const ops: SyncOperation[] = diffEntityFieldsToOperations({
          entityType: 'breeding',
          previous: undefined,
          next: breeding,
          deviceId,
          nextCounter: allocateNextLogicalCounter,
        });

        let taskCount = 0;
        if (params.autoScheduleChores) {
          const cascaded = generateCascadedTasksForBreeding(breeding, sp);
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
        notify(
          taskCount > 0
            ? `Logged ${params.sire.name} × ${params.dam.name} and cascaded ${taskCount} barn chores.`
            : `Logged pairing ${params.sire.name} × ${params.dam.name}.`
        );
      } catch (err) {
        reportPersistenceFailure('save breeding record', err);
      }
    },
    [snapshot, deviceId, recordOutboxOps, reloadFromAdapter, notify, reportPersistenceFailure]
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
        for (let i = 1; i <= count; i++) {
          const jr: Animal = {
            id: generateUuid(),
            tattoo: `${(dam?.tattoo || sp.name.slice(0, 3).toUpperCase()).slice(0, 6)}-K${i}`,
            name: `${existing.damName} ${sp.offspringLabel} #${i}`,
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
          await adapterRef.current!.saveAnimal(jr);
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
      notify('Barn chore saved.');
    },
    [snapshot, deviceId, recordOutboxOps, reloadFromAdapter, notify]
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
      const bundle = buildSampleDataForSpecies(speciesName);
      if (!bundle) {
        notify(`No predefined testing dataset found for ${speciesName}.`);
        return;
      }
      const report = mergeBarnSnapshots(snapshot, {
        settings: snapshot.settings,
        speciesProfiles: [bundle.speciesProfile],
        animals: bundle.animals,
        animalPhotos: [],
        cages: bundle.cages,
        breedings: bundle.breedings,
        tasks: bundle.tasks,
        careLogs: bundle.careLogs,
        shows: bundle.shows,
      });
      await adapterRef.current!.replaceSnapshot(report.snapshot);
      await reloadFromAdapter();
      notify(`Loaded 3-generation testing dataset for ${speciesName}.`);
    },
    [snapshot, reloadFromAdapter, notify]
  );

  const seedAllPredefinedSpecies = useCallback(async () => {
    const full = buildFullPredefinedSampleSnapshot(snapshot?.settings);
    await adapterRef.current!.replaceSnapshot(full);
    await reloadFromAdapter();
    notify('Loaded 3-generation testing herds across all 9 predefined livestock species.');
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
    engineName: adapterRef.current.engineName,
    snapshot,
    activeSpeciesName,
    activeSpeciesData,
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
    togglePinSpeciesLanding,
    saveSpeciesProfile,
    reorderSpeciesCards,
    moveSpeciesCard,
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
    toggleTaskCompleted,
    deleteTask,
    addCareLog,
    deleteCareLog,
    saveShow,
    deleteShow,
    seedSpeciesSampleData,
    seedAllPredefinedSpecies,
    deleteSpeciesTestingData,
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
