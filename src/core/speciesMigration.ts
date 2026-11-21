/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Cross-Species Animal & Herd Migration Engine (`src/core/speciesMigration.ts`).
 *
 * Supports:
 * 1. Single-animal migration (`Move Species`)
 * 2. Multi-select pedigree-family migration (selected animals + their parents/ancestors +
 *    offspring/descendants + additional co-parents & pedigree ancestors linked to those offspring)
 * 3. Full-species bulk migration (`Migrate All` across ALL statuses and ALL species-scoped
 *    photos, care logs, chores, breedings, cages/pens, and show events)
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * Zero browser DOM (`window`, `document`) dependencies; portable directly into Expo / React Native.
 */

import {
  Animal,
  AnimalPhoto,
  BarnDatabaseSnapshot,
  BarnTask,
  BreedingRecord,
  CageLocation,
  CareLog,
  generateUuid,
  isSameSpecies,
  nowIsoUtc,
  PREDEFINED_SPECIES_PRESETS,
  resolveSpeciesProfile,
  ShowEvent,
  SpeciesProfile,
} from './models';
import { countAllSpeciesRecords } from './sampleData';
import { bumpRecordRevision } from './syncOutbox';

export interface SpeciesMigrationResult {
  snapshot: BarnDatabaseSnapshot;
  sourceSpecies: string;
  targetSpecies: string;
  animalsMigrated: number;
  photosMigrated: number;
  careLogsMigrated: number;
  tasksMigrated: number;
  breedingsMigrated: number;
  cagesMigratedOrAdded: number;
  showsUpdated: number;
  createdTargetProfile: boolean;
  /** Migrated animals that still reference a sire/dam staying in another species (will reconnect if those parents are migrated too). */
  splitParentLinksCount: number;
  /** Breedings left in the source species because one parent was migrated and the other parent was not. */
  splitBreedingsCount: number;
  /** Total records of any type remaining in `sourceSpecies` after this migration. */
  remainingSourceRecordsCount: number;
  /** Animals remaining in `sourceSpecies` after this migration. */
  remainingSourceAnimalsCount: number;
}

export interface SpeciesMigrationOptions {
  /** When true, moves 100% of animals (all statuses) AND all chores, cages, breedings, shows, photos, and logs in `sourceSpeciesName`. */
  migrateEntireSpecies?: boolean;
  /** Explicit source species name (required when `migrateEntireSpecies` is true and animal count may be 0). */
  sourceSpeciesName?: string;
}

export interface PedigreeFamilyExpansion {
  directIds: string[];
  ancestorIds: string[];
  descendantIds: string[];
  linkedCoParentAndRelativeIds: string[];
  allExpandedIds: string[];
  expandedAnimals: Animal[];
}

/**
 * Expands a user-selected set of animals inside `sourceSpecies` to include:
 * - Their parents & ancestors (`sireId`, `damId` recursively)
 * - Their offspring & descendants (children where `sireId` or `damId` matches, recursively)
 * - Any additional co-parents (and their pedigree ancestors) linked to those offspring
 *
 * Only expands through animals currently in `sourceSpecies` so unrelated species are never touched.
 */
export function expandPedigreeFamilyInSpecies(
  allAnimals: Animal[],
  selectedIds: string[],
  sourceSpecies: string
): PedigreeFamilyExpansion {
  const speciesAnimals = allAnimals.filter((a) => isSameSpecies(a.species, sourceSpecies));
  const byId = new Map(speciesAnimals.map((a) => [a.id, a]));
  const childrenByParentId = new Map<string, Animal[]>();

  for (const a of speciesAnimals) {
    if (a.sireId && byId.has(a.sireId)) {
      const list = childrenByParentId.get(a.sireId) || [];
      list.push(a);
      childrenByParentId.set(a.sireId, list);
    }
    if (a.damId && byId.has(a.damId) && a.damId !== a.sireId) {
      const list = childrenByParentId.get(a.damId) || [];
      list.push(a);
      childrenByParentId.set(a.damId, list);
    }
  }

  const directIds: string[] = [];
  const directSet = new Set<string>();
  for (const id of selectedIds) {
    if (byId.has(id) && !directSet.has(id)) {
      directSet.add(id);
      directIds.push(id);
    }
  }

  // 1. Descendants (offspring, grand-offspring, ...) downward from direct selection
  const descendantSet = new Set<string>();
  const downQueue = [...directIds];
  const visitedDown = new Set<string>(directIds);
  while (downQueue.length > 0) {
    const currId = downQueue.shift()!;
    const children = childrenByParentId.get(currId) || [];
    for (const child of children) {
      if (!visitedDown.has(child.id)) {
        visitedDown.add(child.id);
        if (!directSet.has(child.id)) {
          descendantSet.add(child.id);
        }
        downQueue.push(child.id);
      }
    }
  }

  // 2. Direct ancestors upward from direct selection
  const directAncestorSet = new Set<string>();
  const upDirectQueue = [...directIds];
  const visitedUpDirect = new Set<string>(directIds);
  while (upDirectQueue.length > 0) {
    const curr = byId.get(upDirectQueue.shift()!);
    if (!curr) continue;
    for (const parentId of [curr.sireId, curr.damId]) {
      if (parentId && byId.has(parentId) && !visitedUpDirect.has(parentId)) {
        visitedUpDirect.add(parentId);
        if (!directSet.has(parentId) && !descendantSet.has(parentId)) {
          directAncestorSet.add(parentId);
        }
        upDirectQueue.push(parentId);
      }
    }
  }

  // 3. Additional co-parents & ancestors linked via offspring (or parent pedigrees)
  const linkedCoParentSet = new Set<string>();
  const upFromAllQueue = [...directIds, ...descendantSet, ...directAncestorSet];
  const visitedAllUp = new Set<string>(upFromAllQueue);
  while (upFromAllQueue.length > 0) {
    const curr = byId.get(upFromAllQueue.shift()!);
    if (!curr) continue;
    for (const parentId of [curr.sireId, curr.damId]) {
      if (parentId && byId.has(parentId) && !visitedAllUp.has(parentId)) {
        visitedAllUp.add(parentId);
        if (
          !directSet.has(parentId) &&
          !descendantSet.has(parentId) &&
          !directAncestorSet.has(parentId)
        ) {
          linkedCoParentSet.add(parentId);
        }
        upFromAllQueue.push(parentId);
      }
    }
  }

  const allSet = new Set<string>([
    ...directIds,
    ...directAncestorSet,
    ...descendantSet,
    ...linkedCoParentSet,
  ]);

  const expandedAnimals = speciesAnimals.filter((a) => allSet.has(a.id));

  return {
    directIds,
    ancestorIds: Array.from(directAncestorSet),
    descendantIds: Array.from(descendantSet),
    linkedCoParentAndRelativeIds: Array.from(linkedCoParentSet),
    allExpandedIds: expandedAnimals.map((a) => a.id),
    expandedAnimals,
  };
}

/**
 * Resolves a user-supplied target species name against configured species profiles first,
 * then predefined presets (including common aliases like "Pig" -> "Swine / Pig"), or creates
 * a clean custom `SpeciesProfile` if brand-new.
 */
export function resolveOrCreateTargetSpeciesProfile(
  targetSpeciesInput: string,
  existingProfiles: SpeciesProfile[],
  ts: string
): { profile: SpeciesProfile; created: boolean } {
  const trimmed = targetSpeciesInput.trim();
  const aliasMap: Record<string, string> = {
    pig: 'Swine / Pig',
    pigs: 'Swine / Pig',
    swine: 'Swine / Pig',
    hog: 'Swine / Pig',
    hogs: 'Swine / Pig',
    rabbits: 'Rabbit',
    goats: 'Goat',
    cow: 'Cattle',
    cows: 'Cattle',
    cavy: 'Guinea Pig',
    cavies: 'Guinea Pig',
    chinchillas: 'Chinchilla',
    ferrets: 'Ferret',
    alpacas: 'Alpaca',
    dog: 'Dog',
    dogs: 'Dog',
    canine: 'Dog',
    cat: 'Cat',
    cats: 'Cat',
    feline: 'Cat',
  };

  const existingDirect = existingProfiles.find((p) => isSameSpecies(p.name, trimmed));
  if (existingDirect) {
    return { profile: existingDirect, created: false };
  }

  const aliasedName = aliasMap[trimmed.toLowerCase()];
  if (aliasedName) {
    const existingAliased = existingProfiles.find((p) => isSameSpecies(p.name, aliasedName));
    if (existingAliased) {
      return { profile: existingAliased, created: false };
    }
  }

  const lookupName = aliasedName || trimmed;
  const preset = PREDEFINED_SPECIES_PRESETS.find((p) => isSameSpecies(p.name, lookupName));
  if (preset) {
    return {
      profile: {
        ...preset,
        id: generateUuid(),
        sortOrder: existingProfiles.length,
        _rev: 1,
        createdAt: ts,
        updatedAt: ts,
      },
      created: true,
    };
  }

  const resolved = resolveSpeciesProfile(trimmed, existingProfiles);
  return {
    profile: {
      ...resolved,
      id: generateUuid(),
      sortOrder: existingProfiles.length,
      _rev: 1,
      createdAt: ts,
      updatedAt: ts,
    },
    created: true,
  };
}

/**
 * Migrates the specified `animalIds` (or 100% of a species when `options.migrateEntireSpecies` is true)
 * into `targetSpeciesInput` along with strictly isolated dependent records.
 *
 * Pedigree UUID links (`sireId`, `damId`) are always preserved so partial/batch migrations
 * automatically reconnect pedigree trees once parents/offspring are also migrated.
 */
export function migrateAnimalsToSpecies(
  snapshot: BarnDatabaseSnapshot,
  animalIds: string[],
  targetSpeciesInput: string,
  options?: SpeciesMigrationOptions
): SpeciesMigrationResult {
  const cleanTargetInput = targetSpeciesInput.trim();
  if (!cleanTargetInput) {
    throw new Error('Please choose or enter a target livestock species.');
  }

  const ts = nowIsoUtc();
  const { profile: targetProfile, created: createdTargetProfile } =
    resolveOrCreateTargetSpeciesProfile(cleanTargetInput, snapshot.speciesProfiles, ts);
  const targetName = targetProfile.name;

  const migrateEntireSpecies = Boolean(options?.migrateEntireSpecies);
  const explicitSource = (options?.sourceSpeciesName || '').trim();

  const idSet = new Set(animalIds);
  if (migrateEntireSpecies && explicitSource) {
    for (const a of snapshot.animals) {
      if (isSameSpecies(a.species, explicitSource)) {
        idSet.add(a.id);
      }
    }
  }

  const animalsToMove = snapshot.animals.filter((a) => idSet.has(a.id));
  const actuallyMovingIds = new Set(
    animalsToMove.filter((a) => !isSameSpecies(a.species, targetName)).map((a) => a.id)
  );

  const sourceSpeciesSet = new Set(
    animalsToMove.filter((a) => actuallyMovingIds.has(a.id)).map((a) => a.species)
  );
  if (explicitSource && !isSameSpecies(explicitSource, targetName)) {
    sourceSpeciesSet.add(explicitSource);
  }
  const sourceSpecies = Array.from(sourceSpeciesSet).join(', ');
  const isFullSpeciesFromSource = (recordSpecies: string): boolean =>
    Boolean(
      migrateEntireSpecies &&
        sourceSpeciesSet.size > 0 &&
        Array.from(sourceSpeciesSet).some((src) => isSameSpecies(recordSpecies, src))
    );

  const hasSpeciesRecordsToMove =
    migrateEntireSpecies &&
    explicitSource &&
    !isSameSpecies(explicitSource, targetName) &&
    countAllSpeciesRecords(snapshot, explicitSource) > 0;

  if (actuallyMovingIds.size === 0 && !hasSpeciesRecordsToMove) {
    throw new Error(
      animalsToMove.length > 0
        ? `Selected animal(s) are already in ${targetName}.`
        : 'No animals or records were selected to migrate.'
    );
  }

  // 1. Update species on selected animals (ALL statuses; preserving sireId & damId UUIDs)
  const nextAnimals: Animal[] = snapshot.animals.map((a) =>
    actuallyMovingIds.has(a.id)
      ? {
          ...a,
          species: targetName,
          _rev: bumpRecordRevision(a),
          updatedAt: ts,
        }
      : a
  );

  const nextAnimalById = new Map(nextAnimals.map((a) => [a.id, a]));

  // Count migrated animals whose parent(s) still live in a different species
  let splitParentLinksCount = 0;
  for (const id of actuallyMovingIds) {
    const moved = nextAnimalById.get(id);
    if (!moved) continue;
    const sire = moved.sireId ? nextAnimalById.get(moved.sireId) : undefined;
    const dam = moved.damId ? nextAnimalById.get(moved.damId) : undefined;
    if (
      (sire && !isSameSpecies(sire.species, targetName)) ||
      (dam && !isSameSpecies(dam.species, targetName))
    ) {
      splitParentLinksCount++;
    }
  }

  // 2. Migrate AnimalPhotos belonging to moved animals (or all in source species during bulk migrate)
  let photosMigrated = 0;
  const nextPhotos: AnimalPhoto[] = (snapshot.animalPhotos ?? []).map((p) => {
    if (
      (actuallyMovingIds.has(p.animalId) || isFullSpeciesFromSource(p.species)) &&
      !isSameSpecies(p.species, targetName)
    ) {
      photosMigrated++;
      return { ...p, species: targetName, _rev: bumpRecordRevision(p), updatedAt: ts };
    }
    return p;
  });

  // 3. Migrate CareLogs belonging to moved animals (or all in source species during bulk migrate)
  let careLogsMigrated = 0;
  const nextCareLogs: CareLog[] = snapshot.careLogs.map((l) => {
    if (
      (actuallyMovingIds.has(l.animalId) || isFullSpeciesFromSource(l.species)) &&
      !isSameSpecies(l.species, targetName)
    ) {
      careLogsMigrated++;
      return { ...l, species: targetName, _rev: bumpRecordRevision(l), updatedAt: ts };
    }
    return l;
  });

  // 4. Migrate BreedingRecords where both present parents end up in targetName (or all in full-species mode)
  let breedingsMigrated = 0;
  let splitBreedingsCount = 0;
  const migratedBreedingIds = new Set<string>();

  const nextBreedings: BreedingRecord[] = snapshot.breedings.map((b) => {
    const sireMoved = Boolean(b.sireId && actuallyMovingIds.has(b.sireId));
    const damMoved = Boolean(b.damId && actuallyMovingIds.has(b.damId));
    const fullSpeciesBreeding = isFullSpeciesFromSource(b.species);
    if (!sireMoved && !damMoved && !fullSpeciesBreeding) return b;

    const sire = b.sireId ? nextAnimalById.get(b.sireId) : undefined;
    const dam = b.damId ? nextAnimalById.get(b.damId) : undefined;
    const sireInTarget = !sire || isSameSpecies(sire.species, targetName);
    const damInTarget = !dam || isSameSpecies(dam.species, targetName);

    if (
      ((sireInTarget && damInTarget) || fullSpeciesBreeding) &&
      !isSameSpecies(b.species, targetName)
    ) {
      breedingsMigrated++;
      migratedBreedingIds.add(b.id);
      return { ...b, species: targetName, _rev: bumpRecordRevision(b), updatedAt: ts };
    }
    splitBreedingsCount++;
    return b;
  });

  // 5. Migrate BarnTasks linked to moved animals/breedings (plus unlinked species tasks in full-species mode)
  let tasksMigrated = 0;
  const nextTasks: BarnTask[] = snapshot.tasks.map((t) => {
    const linkedToMovedAnimal = Boolean(t.linkedAnimalId && actuallyMovingIds.has(t.linkedAnimalId));
    const linkedToMovedBreeding = Boolean(
      t.linkedBreedingId && migratedBreedingIds.has(t.linkedBreedingId)
    );
    const fullSpeciesTask = isFullSpeciesFromSource(t.species);
    if (
      (linkedToMovedAnimal || linkedToMovedBreeding || fullSpeciesTask) &&
      !isSameSpecies(t.species, targetName)
    ) {
      tasksMigrated++;
      return { ...t, species: targetName, _rev: bumpRecordRevision(t), updatedAt: ts };
    }
    return t;
  });

  // 6. Migrate / deduplicate CageLocations
  let cagesMigratedOrAdded = 0;
  const usedCageKeysInTarget = new Set(
    snapshot.cages
      .filter((c) => isSameSpecies(c.species, targetName))
      .map((c) => c.label.trim().toLowerCase())
  );

  const movedCageLabelsBySource = new Map<string, { sourceSpecies: string; label: string }>();
  for (const id of actuallyMovingIds) {
    const moved = nextAnimalById.get(id);
    const rawLabel = moved?.cageLocation.trim();
    if (!moved || !rawLabel) continue;
    const origSource = animalsToMove.find((a) => a.id === id)?.species || '';
    movedCageLabelsBySource.set(`${origSource.toLowerCase()}::${rawLabel.toLowerCase()}`, {
      sourceSpecies: origSource,
      label: rawLabel,
    });
  }

  const cagesToAppend: CageLocation[] = [];
  const nextCages: CageLocation[] = [];

  for (const c of snapshot.cages) {
    const labelKey = c.label.trim().toLowerCase();
    const pairKey = `${c.species.toLowerCase()}::${labelKey}`;
    const fullSpeciesCage = isFullSpeciesFromSource(c.species) && !isSameSpecies(c.species, targetName);

    if (fullSpeciesCage) {
      if (!usedCageKeysInTarget.has(labelKey)) {
        usedCageKeysInTarget.add(labelKey);
        cagesMigratedOrAdded++;
        nextCages.push({ ...c, species: targetName, _rev: bumpRecordRevision(c), updatedAt: ts });
      }
      // If target already had a cage with identical label, omit the duplicate source cage cleanly
      continue;
    }

    if (!movedCageLabelsBySource.has(pairKey)) {
      nextCages.push(c);
      continue;
    }

    const stillUsedInSource = nextAnimals.some(
      (a) =>
        isSameSpecies(a.species, c.species) && a.cageLocation.trim().toLowerCase() === labelKey
    );

    if (!stillUsedInSource && !usedCageKeysInTarget.has(labelKey)) {
      usedCageKeysInTarget.add(labelKey);
      cagesMigratedOrAdded++;
      nextCages.push({ ...c, species: targetName, _rev: bumpRecordRevision(c), updatedAt: ts });
      continue;
    }

    if (!usedCageKeysInTarget.has(labelKey)) {
      usedCageKeysInTarget.add(labelKey);
      cagesMigratedOrAdded++;
      cagesToAppend.push({
        ...c,
        id: generateUuid(),
        species: targetName,
        _rev: 1,
        createdAt: ts,
        updatedAt: ts,
      });
    }
    nextCages.push(c);
  }

  // 7. Update ShowEvents cleanly
  let showsUpdated = 0;
  const showsToAppend: ShowEvent[] = [];
  const nextShows: ShowEvent[] = snapshot.shows.map((s) => {
    if (isSameSpecies(s.species, targetName)) return s;

    const fullSpeciesShow = isFullSpeciesFromSource(s.species);
    const movedEntered = s.enteredAnimalIds.filter((id) => actuallyMovingIds.has(id));
    const movedResults = (s.results ?? []).filter((r) => actuallyMovingIds.has(r.animalId));
    if (movedEntered.length === 0 && movedResults.length === 0 && !fullSpeciesShow) return s;

    const remainingEntered = s.enteredAnimalIds.filter((id) => !actuallyMovingIds.has(id));
    const remainingResults = (s.results ?? []).filter((r) => !actuallyMovingIds.has(r.animalId));
    const sourceHasRemainingAnimals = nextAnimals.some((a) => isSameSpecies(a.species, s.species));
    showsUpdated++;

    if (
      fullSpeciesShow ||
      (remainingEntered.length === 0 && remainingResults.length === 0 && !sourceHasRemainingAnimals)
    ) {
      return { ...s, species: targetName, _rev: bumpRecordRevision(s), updatedAt: ts };
    }

    showsToAppend.push({
      ...s,
      id: generateUuid(),
      species: targetName,
      enteredAnimalIds: movedEntered,
      results: movedResults.length > 0 ? movedResults : undefined,
      _rev: 1,
      createdAt: ts,
      updatedAt: ts,
    });
    return {
      ...s,
      enteredAnimalIds: remainingEntered,
      results: remainingResults.length > 0 ? remainingResults : undefined,
      _rev: bumpRecordRevision(s),
      updatedAt: ts,
    };
  });

  const nextSpeciesProfiles = createdTargetProfile
    ? [...snapshot.speciesProfiles, targetProfile]
    : snapshot.speciesProfiles;

  const nextLedgerEntries = (snapshot.ledgerEntries ?? []).map((le) => {
    const linkedAnimalMoved = Boolean(le.linkedAnimalId && actuallyMovingIds.has(le.linkedAnimalId));
    const linkedBreedingMoved = Boolean(le.linkedBreedingId && migratedBreedingIds.has(le.linkedBreedingId));
    const fullSpecies = isFullSpeciesFromSource(le.species);
    if ((linkedAnimalMoved || linkedBreedingMoved || fullSpecies) && !isSameSpecies(le.species, targetName)) {
      return { ...le, species: targetName, _rev: bumpRecordRevision(le), updatedAt: ts };
    }
    return le;
  });

  const nextProcessingLogs = (snapshot.processingLogs ?? []).map((pl) => {
    const linkedAnimalMoved = Boolean(pl.linkedAnimalId && actuallyMovingIds.has(pl.linkedAnimalId));
    const linkedBreedingMoved = Boolean(pl.linkedBreedingId && migratedBreedingIds.has(pl.linkedBreedingId));
    const fullSpecies = isFullSpeciesFromSource(pl.species);
    if ((linkedAnimalMoved || linkedBreedingMoved || fullSpecies) && !isSameSpecies(pl.species, targetName)) {
      return { ...pl, species: targetName, _rev: bumpRecordRevision(pl), updatedAt: ts };
    }
    return pl;
  });

  const nextYouthBooks = (snapshot.youthProjectBooks ?? []).map((yp) => {
    const fullSpecies = isFullSpeciesFromSource(yp.species);
    if (fullSpecies && !isSameSpecies(yp.species, targetName)) {
      return { ...yp, species: targetName, _rev: bumpRecordRevision(yp), updatedAt: ts };
    }
    return yp;
  });

  const nextSnapshot: BarnDatabaseSnapshot = {
    ...snapshot,
    speciesProfiles: nextSpeciesProfiles,
    animals: nextAnimals,
    animalPhotos: nextPhotos,
    cages: [...nextCages, ...cagesToAppend],
    breedings: nextBreedings,
    tasks: nextTasks,
    careLogs: nextCareLogs,
    shows: [...nextShows, ...showsToAppend],
    ledgerEntries: nextLedgerEntries,
    processingLogs: nextProcessingLogs,
    youthProjectBooks: nextYouthBooks,
  };

  let remainingSourceRecordsCount = 0;
  let remainingSourceAnimalsCount = 0;
  for (const src of sourceSpeciesSet) {
    remainingSourceRecordsCount += countAllSpeciesRecords(nextSnapshot, src);
    remainingSourceAnimalsCount += nextAnimals.filter((a) => isSameSpecies(a.species, src)).length;
  }

  return {
    snapshot: nextSnapshot,
    sourceSpecies,
    targetSpecies: targetName,
    animalsMigrated: actuallyMovingIds.size,
    photosMigrated,
    careLogsMigrated,
    tasksMigrated,
    breedingsMigrated,
    cagesMigratedOrAdded,
    showsUpdated,
    createdTargetProfile,
    splitParentLinksCount,
    splitBreedingsCount,
    remainingSourceRecordsCount,
    remainingSourceAnimalsCount,
  };
}
