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
  migrateAnimalsToSpecies,
  SpeciesMigrationResult,
} from '../core/speciesMigration';
import { mergeBarnSnapshots, parseBarnBackupJson } from '../core/syncAndExports';
import { generateCascadedTasksForBreeding } from '../core/masterTaskList';
import { resolveThemeCssVariables } from '../core/themePalette';
import { StorageAdapter } from '../storage/storageAdapter';
import { WebSqliteAdapter } from '../storage/webSqliteAdapter';

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

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [snapshot, setSnapshot] = useState<BarnDatabaseSnapshot | null>(null);
  const [route, setRoute] = useState<WorkspaceRoute>('home');
  const [activeSpeciesName, setActiveSpeciesName] = useState<string>('Rabbit');
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);
  const [pedigreeAnimalId, setPedigreeAnimalId] = useState<string | null>(null);
  const [pedigreeGenerations, setPedigreeGenerations] = useState<3 | 4>(3);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const notify = useCallback((msg: string) => {
    setStatusMessage(msg);
  }, []);

  // Initialize local SQLite / IndexedDB store once on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      const adapter = adapterRef.current!;
      const initial = await adapter.initialize();
      if (!mounted) return;
      setSnapshot(initial);
      setPedigreeGenerations(initial.settings.defaultGenerations);

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
      setIsLoading(false);
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

  // Auto-clear transient status banner after 4.5s
  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 4500);
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
      .filter((t) => isSameSpecies(t.species, speciesProfile.name))
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
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<BarnSettings>, options?: { silent?: boolean }) => {
      if (!snapshot) return;
      const updated: BarnSettings = {
        ...snapshot.settings,
        ...patch,
        updatedAt: nowIsoUtc(),
      };
      await adapterRef.current!.saveSettings(updated);
      if (patch.defaultGenerations) {
        setPedigreeGenerations(patch.defaultGenerations);
      }
      await reloadFromAdapter();
      if (!options?.silent) {
        notify('Barn preferences saved locally.');
      }
    },
    [snapshot, reloadFromAdapter, notify]
  );

  const togglePinSpeciesLanding = useCallback(
    async (speciesName: string) => {
      if (!snapshot) return;
      const currentlyPinned = isSameSpecies(snapshot.settings.pinnedLandingSpecies, speciesName);
      const nextPinned = currentlyPinned ? '' : speciesName;
      const updated: BarnSettings = {
        ...snapshot.settings,
        pinnedLandingSpecies: nextPinned,
        updatedAt: nowIsoUtc(),
      };
      await adapterRef.current!.saveSettings(updated);
      await reloadFromAdapter();
      notify(
        nextPinned
          ? `Pinned ${speciesName} Hub as your startup landing page.`
          : 'Unpinned startup species — app will open on All-Species Home.'
      );
    },
    [snapshot, reloadFromAdapter, notify]
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
          createdAt: profile.createdAt || existing.createdAt || ts,
          updatedAt: ts,
        };
        await adapterRef.current!.saveSpeciesProfile(clean);
        await reloadFromAdapter();
        notify(`${clean.name} schedule saved.`);
      } else {
        // Place newly added custom livestock at the top of the Home grid so it is immediately visible
        const cleanNew: SpeciesProfile = {
          ...profile,
          id: profile.id || `species-${generateUuid()}`,
          sortOrder: 0,
          name: profile.name.trim(),
          createdAt: profile.createdAt || ts,
          updatedAt: ts,
        };
        const currentList = snapshot?.speciesProfiles ?? [];
        const shifted = currentList.map((sp, idx) => ({
          ...sp,
          sortOrder: idx + 1,
          updatedAt: ts,
        }));
        await adapterRef.current!.saveSpeciesProfilesBatch([cleanNew, ...shifted]);
        await reloadFromAdapter();
        notify(`${cleanNew.name} added to your barn.`);
      }
    },
    [snapshot, reloadFromAdapter, notify]
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
    },
    [snapshot, activeSpeciesName, reloadFromAdapter, notify]
  );

  const saveAnimal = useCallback(
    async (
      draft: Omit<Animal, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string },
      linkParentTarget?: { childId: string; asSire: boolean },
      initialPhotos?: Array<OptimizedImagePayload & { caption?: string }>
    ): Promise<string> => {
      const ts = nowIsoUtc();
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
        genotype: parsedGeno,
        genotypeRaw: normalizedRaw,
        createdAt: draft.createdAt || ts,
        updatedAt: ts,
      };

      await adapterRef.current!.saveAnimal(animal);

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
          await adapterRef.current!.saveAnimal({
            ...child,
            sireId: linkParentTarget.asSire ? animal.id : child.sireId,
            damId: !linkParentTarget.asSire ? animal.id : child.damId,
            updatedAt: ts,
          });
        }
      }

      await reloadFromAdapter();
      notify(
        initialPhotos && initialPhotos.length > 0
          ? `${animal.name} saved with ${initialPhotos.length} optimized photo(s).`
          : `${animal.name} (${animal.tattoo || 'No ID'}) saved.`
      );
      return animal.id;
    },
    [snapshot, reloadFromAdapter, notify]
  );

  const addOptimizedAnimalPhotos = useCallback(
    async (
      animal: Animal,
      payloads: Array<OptimizedImagePayload & { caption?: string }>
    ): Promise<void> => {
      if (payloads.length === 0) return;
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

      await adapterRef.current!.saveAnimalPhotosBatch(records);
      await reloadFromAdapter();

      const pct = calculateSavingsPercent(origSum, storedSum);
      notify(
        pct > 0
          ? `Added ${records.length} photo${records.length === 1 ? '' : 's'} to ${
              animal.name
            } (${formatByteSizePure(origSum)} → ${formatByteSizePure(storedSum)} · saved ${pct}%).`
          : `Added ${records.length} photo${records.length === 1 ? '' : 's'} to ${animal.name}.`
      );
    },
    [snapshot, reloadFromAdapter, notify]
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
      notify('Primary cover photo updated.');
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

      // If we deleted the primary photo and siblings remain, promote the next sibling automatically
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
      await adapterRef.current!.deleteAnimal(animal.id);
      if (selectedAnimalId === animal.id) setSelectedAnimalId(null);
      if (pedigreeAnimalId === animal.id) setPedigreeAnimalId(null);
      await reloadFromAdapter();
      notify(`${animal.name} deleted.`);
    },
    [selectedAnimalId, pedigreeAnimalId, reloadFromAdapter, notify]
  );

  const deleteAnimalsBatch = useCallback(
    async (animalIds: string[]) => {
      if (animalIds.length === 0) return;
      const idSet = new Set(animalIds);
      await adapterRef.current!.deleteAnimalsBatch(animalIds);
      if (selectedAnimalId && idSet.has(selectedAnimalId)) setSelectedAnimalId(null);
      if (pedigreeAnimalId && idSet.has(pedigreeAnimalId)) setPedigreeAnimalId(null);
      await reloadFromAdapter();
      notify(`Deleted ${animalIds.length} selected animal${animalIds.length === 1 ? '' : 's'}.`);
    },
    [selectedAnimalId, pedigreeAnimalId, reloadFromAdapter, notify]
  );

  const setAnimalsArchiveState = useCallback(
    async (animalIds: string[], archived: boolean) => {
      if (!snapshot || animalIds.length === 0) return;
      const idSet = new Set(animalIds);
      const ts = nowIsoUtc();
      const targetStatus = archived ? ('Archived' as const) : ('Active' as const);
      const targets = snapshot.animals
        .filter((a) => idSet.has(a.id))
        .map((a) => ({
          ...a,
          status: targetStatus,
          updatedAt: ts,
        }));
      if (targets.length === 0) return;
      await adapterRef.current!.saveAnimalsBatch(targets);
      await reloadFromAdapter();
      if (targets.length === 1) {
        notify(
          archived
            ? `Moved ${targets[0].name} to Archived.`
            : `Moved ${targets[0].name} back to Active herd.`
        );
      } else {
        notify(
          archived
            ? `Moved ${targets.length} animals to Archived.`
            : `Moved ${targets.length} animals back to Active herd.`
        );
      }
    },
    [snapshot, reloadFromAdapter, notify]
  );

  const migrateAnimalsSpecies = useCallback(
    async (
      animalIds: string[],
      targetSpeciesName: string,
      options?: {
        switchToTarget?: boolean;
        migrateEntireSpecies?: boolean;
        sourceSpeciesName?: string;
      }
    ): Promise<SpeciesMigrationResult | null> => {
      if (!snapshot) return null;
      const result = migrateAnimalsToSpecies(snapshot, animalIds, targetSpeciesName, {
        migrateEntireSpecies: options?.migrateEntireSpecies,
        sourceSpeciesName: options?.sourceSpeciesName,
      });
      await adapterRef.current!.replaceSnapshot(result.snapshot);
      await reloadFromAdapter();

      const movedIds = new Set(
        result.snapshot.animals
          .filter((a) => {
            const orig = snapshot.animals.find((o) => o.id === a.id);
            return orig && !isSameSpecies(orig.species, a.species);
          })
          .map((a) => a.id)
      );
      if (selectedAnimalId && movedIds.has(selectedAnimalId)) {
        setSelectedAnimalId(null);
      }
      if (pedigreeAnimalId && movedIds.has(pedigreeAnimalId)) {
        setPedigreeAnimalId(null);
      }

      const remainingInActive = result.snapshot.animals.filter((a) =>
        isSameSpecies(a.species, activeSpeciesName)
      ).length;

      if (
        options?.switchToTarget ||
        (route !== 'home' &&
          remainingInActive === 0 &&
          !isSameSpecies(activeSpeciesName, result.targetSpecies))
      ) {
        setActiveSpeciesName(result.targetSpecies);
      }

      const extras: string[] = [];
      if (result.photosMigrated > 0) extras.push(`${result.photosMigrated} photos`);
      if (result.careLogsMigrated > 0) extras.push(`${result.careLogsMigrated} logs`);
      if (result.tasksMigrated > 0) extras.push(`${result.tasksMigrated} chores`);
      if (result.breedingsMigrated > 0) extras.push(`${result.breedingsMigrated} breedings`);
      if (result.cagesMigratedOrAdded > 0) extras.push(`${result.cagesMigratedOrAdded} cages`);
      if (result.showsUpdated > 0) extras.push(`${result.showsUpdated} shows`);
      if (result.splitParentLinksCount > 0) {
        extras.push(
          `${result.splitParentLinksCount} with parent IDs preserved for follow-up`
        );
      }

      notify(
        `Migrated ${result.animalsMigrated} animal${result.animalsMigrated === 1 ? '' : 's'} from ${
          result.sourceSpecies
        } → ${result.targetSpecies}${extras.length > 0 ? ` (${extras.join(', ')})` : ''}.`
      );
      return result;
    },
    [snapshot, activeSpeciesName, route, selectedAnimalId, pedigreeAnimalId, reloadFromAdapter, notify]
  );

  const saveCage = useCallback(
    async (cageDraft: Omit<CageLocation, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
      const ts = nowIsoUtc();
      const cage: CageLocation = {
        ...cageDraft,
        id: cageDraft.id || generateUuid(),
        label: cageDraft.label.trim(),
        createdAt: ts,
        updatedAt: ts,
      };
      await adapterRef.current!.saveCage(cage);
      await reloadFromAdapter();
      notify(`Location ${cage.label} saved.`);
    },
    [reloadFromAdapter, notify]
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

      await adapterRef.current!.saveBreeding(breeding);

      let taskCount = 0;
      if (params.autoScheduleChores) {
        const cascaded = generateCascadedTasksForBreeding(breeding, sp);
        taskCount = cascaded.length;
        await adapterRef.current!.saveTasksBatch(cascaded);
      }

      await reloadFromAdapter();
      notify(
        taskCount > 0
          ? `Logged ${params.sire.name} × ${params.dam.name} and cascaded ${taskCount} barn chores.`
          : `Logged pairing ${params.sire.name} × ${params.dam.name}.`
      );
    },
    [snapshot, reloadFromAdapter, notify]
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

      let createdAny = existing.offspringCreated;
      const count = Math.min(16, Math.max(0, Math.round(patch.registerJuniorCount || 0)));
      if (count > 0) {
        const sire = snapshot.animals.find((a) => a.id === existing.sireId);
        const dam = snapshot.animals.find((a) => a.id === existing.damId);
        const juniorRecords: Animal[] = [];
        for (let i = 1; i <= count; i++) {
          juniorRecords.push({
            id: generateUuid(),
            tattoo: `${(dam?.tattoo || sp.name.slice(0, 3).toUpperCase()).slice(0, 6)}-K${i}`,
            name: `${existing.damName} ${sp.offspringLabel} #${i}`,
            species: sp.name,
            breed: dam?.breed || sire?.breed || '',
            variety: dam?.variety || sire?.variety || '',
            sex: i % 2 === 0 ? 'Male' : 'Female',
            status: 'Junior',
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
          });
        }
        await adapterRef.current!.saveAnimalsBatch(juniorRecords);
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
      await reloadFromAdapter();
      notify(
        patch.registerJuniorCount > 0
          ? `Litter updated & ${patch.registerJuniorCount} ${sp.offspringLabel.toLowerCase()} records created.`
          : 'Litter outcome saved.'
      );
    },
    [snapshot, reloadFromAdapter, notify]
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
      const task: BarnTask = {
        ...taskDraft,
        id: taskDraft.id || generateUuid(),
        title: taskDraft.title.trim(),
        createdAt: ts,
        updatedAt: ts,
      };
      await adapterRef.current!.saveTask(task);
      await reloadFromAdapter();
      notify('Barn chore saved.');
    },
    [reloadFromAdapter, notify]
  );

  const toggleTaskCompleted = useCallback(
    async (task: BarnTask) => {
      await adapterRef.current!.saveTask({
        ...task,
        completed: !task.completed,
        updatedAt: nowIsoUtc(),
      });
      await reloadFromAdapter();
    },
    [reloadFromAdapter]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      await adapterRef.current!.deleteTask(id);
      await reloadFromAdapter();
    },
    [reloadFromAdapter]
  );

  const setTasksCompletedBatch = useCallback(
    async (taskIds: string[], completed: boolean) => {
      if (!snapshot || taskIds.length === 0) return;
      const ts = nowIsoUtc();
      const idSet = new Set(taskIds);
      const updated = snapshot.tasks
        .filter((t) => idSet.has(t.id) && t.completed !== completed)
        .map((t) => ({ ...t, completed, updatedAt: ts }));
      if (updated.length > 0) {
        await adapterRef.current!.saveTasksBatch(updated);
        await reloadFromAdapter();
        notify(
          `${completed ? 'Completed' : 'Reopened'} ${updated.length} chore${
            updated.length === 1 ? '' : 's'
          }.`
        );
      }
    },
    [snapshot, reloadFromAdapter, notify]
  );

  const deleteTasksBatch = useCallback(
    async (taskIds: string[]) => {
      if (taskIds.length === 0) return;
      await adapterRef.current!.deleteTasksBatch(taskIds);
      await reloadFromAdapter();
      notify(`Deleted ${taskIds.length} selected chore${taskIds.length === 1 ? '' : 's'}.`);
    },
    [reloadFromAdapter, notify]
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

      // Keep animal's latest weight and show leg count automatically updated
      const animal = snapshot.animals.find((a) => a.id === draft.animalId);
      if (animal && (draft.weightGrams > 0 || draft.showLegEarned)) {
        await adapterRef.current!.saveAnimal({
          ...animal,
          weightGrams: draft.weightGrams > 0 ? draft.weightGrams : animal.weightGrams,
          legsCount: draft.showLegEarned ? animal.legsCount + 1 : animal.legsCount,
          updatedAt: ts,
        });
      }

      await reloadFromAdapter();
      notify(`${draft.type} logged.`);
    },
    [snapshot, reloadFromAdapter, notify]
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
      const show: ShowEvent = {
        ...draft,
        id: draft.id || generateUuid(),
        name: draft.name.trim(),
        createdAt: ts,
        updatedAt: ts,
      };
      await adapterRef.current!.saveShow(show);
      await reloadFromAdapter();
      notify(`Show "${show.name}" saved.`);
    },
    [reloadFromAdapter, notify]
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
        notify(`No predefined sample pack found for ${speciesName}.`);
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
      notify(`Loaded 3-generation sample ${speciesName} herd & tasks.`);
    },
    [snapshot, reloadFromAdapter, notify]
  );

  const seedAllPredefinedSpecies = useCallback(async () => {
    const full = buildFullPredefinedSampleSnapshot(snapshot?.settings);
    await adapterRef.current!.replaceSnapshot(full);
    await reloadFromAdapter();
    notify('Loaded 3-generation sample herds across all 9 predefined livestock species.');
  }, [snapshot, reloadFromAdapter, notify]);

  const deleteSpeciesTestingData = useCallback(
    async (speciesName: string) => {
      if (!snapshot) return;
      const { nextSnapshot, removedAnimals, removedTotalRecords, removedAnimalIds } =
        purgeSpeciesTestingDataPure(snapshot, speciesName);
      if (removedTotalRecords === 0) {
        notify(`No sample/testing records found in ${speciesName}.`);
        return;
      }
      await adapterRef.current!.replaceSnapshot(nextSnapshot);
      if (selectedAnimalId && removedAnimalIds.has(selectedAnimalId)) {
        setSelectedAnimalId(null);
      }
      if (pedigreeAnimalId && removedAnimalIds.has(pedigreeAnimalId)) {
        setPedigreeAnimalId(null);
      }
      await reloadFromAdapter();
      notify(
        `Deleted ${speciesName} testing data (${removedAnimals} sample animals, ${removedTotalRecords} total sample records).`
      );
    },
    [snapshot, selectedAnimalId, pedigreeAnimalId, reloadFromAdapter, notify]
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
    },
    [snapshot, selectedAnimalId, pedigreeAnimalId, reloadFromAdapter, notify]
  );

  const clearAllRecordsKeepSpecies = useCallback(async () => {
    if (!snapshot) return;
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
  }, [snapshot, reloadFromAdapter, notify]);

  const restoreFactoryDefaults = useCallback(async () => {
    const factorySnapshot = buildFullPredefinedSampleSnapshot();
    await adapterRef.current!.replaceSnapshot(factorySnapshot);
    setSelectedAnimalId(null);
    setPedigreeAnimalId(null);
    setPedigreeGenerations(factorySnapshot.settings.defaultGenerations);
    setActiveSpeciesName(factorySnapshot.settings.defaultSpecies || 'Rabbit');
    setRoute('home');
    await reloadFromAdapter();
    notify('Restored app to factory settings, theme palette, and 9 starter species herds.');
  }, [reloadFromAdapter, notify]);

  const importJsonBackup = useCallback(
    async (jsonText: string, mode: 'merge' | 'replace') => {
      if (!snapshot) return;
      const incoming = parseBarnBackupJson(jsonText, snapshot.settings);
      if (mode === 'replace') {
        await adapterRef.current!.replaceSnapshot(incoming);
        await reloadFromAdapter();
        notify(`Restored ${incoming.animals.length} animals from JSON backup.`);
      } else {
        const merged = mergeBarnSnapshots(snapshot, incoming);
        await adapterRef.current!.replaceSnapshot(merged.snapshot);
        await reloadFromAdapter();
        notify(
          `UUID/Timestamp sync complete: +${merged.animalsAdded} added, ${merged.animalsUpdated} updated.`
        );
      }
    },
    [snapshot, reloadFromAdapter, notify]
  );

  const applyPlatformImportPreview = useCallback(
    async (
      preview: PlatformImportPreview,
      optimizedPhotos: AnimalPhoto[] = [],
      conflictSelections: ConflictSelectionMap = {}
    ) => {
      if (!snapshot) return;

      // Resolve any preexisting animal field-by-field choices (and enrich blank fields cleanly)
      const resolvedAnimals = resolveAnimalsWithConflictChoices(
        preview.animals,
        snapshot,
        conflictSelections
      );

      // Place brand-new imported custom species at the top of the Home grid (just like manual Add Custom Livestock)
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
      const snap = await adapterRef.current!.importRawSqliteBytes(bytes);
      setSnapshot(snap);
      notify(`Loaded SQLite database (${snap.animals.length} animals).`);
    },
    [notify]
  );

  return {
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
    setPedigreeGenerations,
    statusMessage,
    clearStatusMessage: () => setStatusMessage(null),
    updateSettings,
    togglePinSpeciesLanding,
    saveSpeciesProfile,
    reorderSpeciesCards,
    moveSpeciesCard,
    deleteSpeciesProfile,
    saveAnimal,
    addOptimizedAnimalPhotos,
    setPrimaryAnimalPhoto,
    updateAnimalPhotoCaption,
    deleteAnimalPhoto,
    deleteAnimal,
    deleteAnimalsBatch,
    setAnimalsArchiveState,
    migrateAnimalsSpecies,
    saveCage,
    deleteCage,
    logBreedingWithCascade,
    updateBreedingOutcome,
    deleteBreeding,
    saveTask,
    toggleTaskCompleted,
    deleteTask,
    setTasksCompletedBatch,
    deleteTasksBatch,
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
    applyPlatformImportPreview,
    exportSqliteBytes,
    importSqliteBytes,
  };
}
