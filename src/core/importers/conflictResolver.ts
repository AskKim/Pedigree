/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Preexisting Animal Match & Contradiction Resolution Engine
 * (`src/core/importers/conflictResolver.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) dependencies.
 *
 * Responsibilities:
 * 1. Matches incoming imported animal rows against preexisting barn animals within the SAME species
 *    (by exact ID, Registration #, Tag/Tattoo, or Name + Birth Date).
 * 2. Distinguishes harmless blank-field enrichments from genuine data contradictions.
 * 3. Applies user-selected per-field resolutions (`'existing' | 'incoming' | 'combine'`) while
 *    keeping parsed genotypes and pedigree cycle guards strictly valid.
 */

import { parseGenotypeString } from '../geneticsEngine';
import {
  Animal,
  BarnDatabaseSnapshot,
  formatReadableDate,
  formatSexForSpecies,
  formatWeight,
  isSameSpecies,
  nowIsoUtc,
  resolveSpeciesProfile,
  SpeciesProfile,
  WeightUnit,
} from '../models';
import { buildSpeciesHerdMap, wouldCreateCycle } from '../pedigreeCalculator';
import { isSampleTestingId } from '../sampleData';

export type AnimalConflictFieldKey =
  | 'name'
  | 'tattoo'
  | 'sex'
  | 'status'
  | 'archived'
  | 'birthDateIso'
  | 'breed'
  | 'variety'
  | 'weightGrams'
  | 'registrationNumber'
  | 'grandChampionNumber'
  | 'genotypeRaw'
  | 'cageLocation'
  | 'breederName'
  | 'ownerName'
  | 'sireId'
  | 'damId'
  | 'notes';

export type FieldResolutionChoice = 'existing' | 'incoming' | 'combine';

export interface AnimalFieldContradiction {
  field: AnimalConflictFieldKey;
  label: string;
  existingDisplay: string;
  incomingDisplay: string;
  supportsCombine: boolean;
  defaultChoice: FieldResolutionChoice;
}

export interface AnimalImportConflict {
  animalId: string;
  species: string;
  displayName: string;
  displayTag: string;
  matchedBy: 'ID' | 'Registration #' | 'Tag / Tattoo' | 'Name & Birth Date' | 'Name';
  existingAnimal: Animal;
  incomingAnimal: Animal;
  contradictions: AnimalFieldContradiction[];
}

/**
 * Keyed by `${animalId}::${field}` -> `'existing' | 'incoming' | 'combine'`.
 */
export type ConflictSelectionMap = Record<string, FieldResolutionChoice>;

export function makeConflictSelectionKey(
  animalId: string,
  field: AnimalConflictFieldKey
): string {
  return `${animalId}::${field}`;
}

export interface PreexistingAnimalMatch {
  animal: Animal;
  matchedBy: AnimalImportConflict['matchedBy'];
}

function normStr(val: string | undefined | null): string {
  return (val || '').trim().toLowerCase();
}

/**
 * Finds a preexisting animal in `existingAnimals` within `speciesName` that represents
 * the same real-world animal as the incoming row.
 *
 * Note: Sample seed animals (`seed-...`) only match if their exact ID or exact Tag/Registration
 * matches, avoiding accidental collisions with unrelated real imports.
 */
export function findPreexistingAnimalMatch(
  existingAnimals: Animal[],
  params: {
    species: string;
    candidateDeterministicId: string;
    externalId?: string;
    tattoo?: string;
    registrationNumber?: string;
    name?: string;
    birthDateIso?: string;
  }
): PreexistingAnimalMatch | null {
  const candidates = existingAnimals.filter((a) => isSameSpecies(a.species, params.species));
  if (candidates.length === 0) return null;

  const extIdNorm = normStr(params.externalId);
  const candDetNorm = normStr(params.candidateDeterministicId);
  const regNorm = normStr(params.registrationNumber);
  const tattooNorm = normStr(params.tattoo);
  const nameNorm = normStr(params.name);
  const dobNorm = normStr(params.birthDateIso);

  // 1. Exact ID match (e.g. re-importing an updated HerdBoss export or matching UUID)
  for (const ex of candidates) {
    const exId = normStr(ex.id);
    if (exId === candDetNorm || (extIdNorm && exId === extIdNorm)) {
      return { animal: ex, matchedBy: 'ID' };
    }
  }

  // 2. Non-empty Registration Number match within the same species
  if (regNorm) {
    const byReg = candidates.find((ex) => normStr(ex.registrationNumber) === regNorm);
    if (byReg) {
      return { animal: byReg, matchedBy: 'Registration #' };
    }
  }

  // 3. Non-empty Tag / Tattoo match within the same species
  if (tattooNorm) {
    const byTag = candidates.find((ex) => normStr(ex.tattoo) === tattooNorm);
    if (byTag) {
      return { animal: byTag, matchedBy: 'Tag / Tattoo' };
    }
  }

  // 4. Exact Name + Birth Date match (when tags don't explicitly contradict two distinct tagged animals)
  if (nameNorm && dobNorm) {
    const byNameDob = candidates.find((ex) => {
      if (isSampleTestingId(ex.id)) return false;
      if (normStr(ex.name) !== nameNorm || normStr(ex.birthDateIso) !== dobNorm) return false;
      // If both records carry non-empty, different tags, treat them as distinct littermates/animals
      if (tattooNorm && normStr(ex.tattoo) && normStr(ex.tattoo) !== tattooNorm) return false;
      return true;
    });
    if (byNameDob) {
      return { animal: byNameDob, matchedBy: 'Name & Birth Date' };
    }
  }

  // 5. Unique Name match when at least one side has no tag and birth dates don't conflict
  if (nameNorm && !/^animal #\d+$/i.test(nameNorm)) {
    const nameMatches = candidates.filter((ex) => {
      if (isSampleTestingId(ex.id)) return false;
      if (normStr(ex.name) !== nameNorm) return false;
      if (tattooNorm && normStr(ex.tattoo) && normStr(ex.tattoo) !== tattooNorm) return false;
      if (dobNorm && normStr(ex.birthDateIso) && normStr(ex.birthDateIso) !== dobNorm) {
        return false;
      }
      return true;
    });
    if (nameMatches.length === 1) {
      return { animal: nameMatches[0], matchedBy: 'Name' };
    }
  }

  return null;
}

function formatParentLabel(
  parentId: string,
  allKnownAnimalsById: Map<string, Animal>
): string {
  if (!parentId) return 'Unlinked';
  const found = allKnownAnimalsById.get(parentId);
  if (!found) return parentId;
  return found.tattoo ? `${found.name} (${found.tattoo})` : found.name;
}

function isSameParentAnimal(
  existingParentId: string,
  incomingParentId: string,
  allKnownAnimalsById: Map<string, Animal>
): boolean {
  if (existingParentId === incomingParentId) return true;
  const ex = allKnownAnimalsById.get(existingParentId);
  const inc = allKnownAnimalsById.get(incomingParentId);
  if (!ex || !inc) return false;
  if (ex.tattoo && inc.tattoo && normStr(ex.tattoo) === normStr(inc.tattoo)) return true;
  if (
    ex.registrationNumber &&
    inc.registrationNumber &&
    normStr(ex.registrationNumber) === normStr(inc.registrationNumber)
  ) {
    return true;
  }
  return normStr(ex.name) === normStr(inc.name) && normStr(ex.name) !== '';
}

/**
 * Compares an existing barn `Animal` and an incoming imported `Animal` (with the same `id`),
 * returning all fields where BOTH sides have non-empty values that genuinely contradict.
 */
export function buildAnimalContradictions(
  existing: Animal,
  incoming: Animal,
  options: {
    preferredUnit: WeightUnit;
    speciesProfiles: SpeciesProfile[];
    allKnownAnimalsById: Map<string, Animal>;
  }
): AnimalFieldContradiction[] {
  const contradictions: AnimalFieldContradiction[] = [];
  const sp = resolveSpeciesProfile(existing.species, options.speciesProfiles);

  const checkText = (
    field: AnimalConflictFieldKey,
    label: string,
    exVal: string,
    incVal: string,
    caseInsensitive = false,
    supportsCombine = false
  ) => {
    const exClean = (exVal || '').trim();
    const incClean = (incVal || '').trim();
    if (!exClean || !incClean) return;
    const equal = caseInsensitive
      ? exClean.toLowerCase() === incClean.toLowerCase()
      : exClean === incClean;
    if (equal) return;
    // For notes, if one already contains the other substring, no contradiction
    if (
      supportsCombine &&
      (exClean.toLowerCase().includes(incClean.toLowerCase()) ||
        incClean.toLowerCase().includes(exClean.toLowerCase()))
    ) {
      return;
    }

    contradictions.push({
      field,
      label,
      existingDisplay: exClean,
      incomingDisplay: incClean,
      supportsCombine,
      defaultChoice: supportsCombine ? 'combine' : 'existing',
    });
  };

  checkText('name', 'Name', existing.name, incoming.name);
  checkText('tattoo', 'Tag / Tattoo', existing.tattoo, incoming.tattoo, true);

  if (
    existing.sex !== 'Unknown' &&
    incoming.sex !== 'Unknown' &&
    existing.sex !== incoming.sex
  ) {
    contradictions.push({
      field: 'sex',
      label: 'Biological Sex',
      existingDisplay: `${formatSexForSpecies(existing.sex, sp)} (${existing.sex})`,
      incomingDisplay: `${formatSexForSpecies(incoming.sex, sp)} (${incoming.sex})`,
      supportsCombine: false,
      defaultChoice: 'existing',
    });
  }

  if (existing.status && incoming.status && existing.status !== incoming.status) {
    contradictions.push({
      field: 'status',
      label: 'Herd Status',
      existingDisplay: existing.status,
      incomingDisplay: incoming.status,
      supportsCombine: false,
      defaultChoice: 'existing',
    });
  }

  if (Boolean(existing.archived) !== Boolean(incoming.archived)) {
    contradictions.push({
      field: 'archived',
      label: 'Active vs. Archived',
      existingDisplay: existing.archived ? 'Archived (Non-Active)' : 'Active Herd',
      incomingDisplay: incoming.archived ? 'Archived (Non-Active)' : 'Active Herd',
      supportsCombine: false,
      defaultChoice: incoming.archived ? 'incoming' : 'existing',
    });
  }

  if (
    existing.birthDateIso &&
    incoming.birthDateIso &&
    existing.birthDateIso !== incoming.birthDateIso
  ) {
    contradictions.push({
      field: 'birthDateIso',
      label: 'Birth Date',
      existingDisplay: `${formatReadableDate(existing.birthDateIso)} (${existing.birthDateIso})`,
      incomingDisplay: `${formatReadableDate(incoming.birthDateIso)} (${incoming.birthDateIso})`,
      supportsCombine: false,
      defaultChoice: 'existing',
    });
  }

  checkText('breed', 'Breed', existing.breed, incoming.breed, true);
  checkText('variety', 'Color / Variety', existing.variety, incoming.variety, true);

  // Weight: treat > 5g difference when both > 0 as a contradiction
  if (
    existing.weightGrams > 0 &&
    incoming.weightGrams > 0 &&
    Math.abs(existing.weightGrams - incoming.weightGrams) > 5
  ) {
    contradictions.push({
      field: 'weightGrams',
      label: 'Current Weight',
      existingDisplay: formatWeight(existing.weightGrams, options.preferredUnit),
      incomingDisplay: formatWeight(incoming.weightGrams, options.preferredUnit),
      supportsCombine: false,
      defaultChoice: 'incoming',
    });
  }

  checkText(
    'registrationNumber',
    'Registration #',
    existing.registrationNumber,
    incoming.registrationNumber,
    true
  );
  checkText(
    'grandChampionNumber',
    'Grand Champion #',
    existing.grandChampionNumber,
    incoming.grandChampionNumber,
    true
  );
  checkText('genotypeRaw', 'Genotype / DNA', existing.genotypeRaw, incoming.genotypeRaw);
  checkText('cageLocation', 'Cage / Group Location', existing.cageLocation, incoming.cageLocation, true);
  checkText('breederName', 'Breeder', existing.breederName, incoming.breederName, true);
  checkText('ownerName', 'Owner', existing.ownerName, incoming.ownerName, true);

  if (
    existing.sireId &&
    incoming.sireId &&
    !isSameParentAnimal(existing.sireId, incoming.sireId, options.allKnownAnimalsById)
  ) {
    contradictions.push({
      field: 'sireId',
      label: `${sp.maleLabel} / Sire`,
      existingDisplay: formatParentLabel(existing.sireId, options.allKnownAnimalsById),
      incomingDisplay: formatParentLabel(incoming.sireId, options.allKnownAnimalsById),
      supportsCombine: false,
      defaultChoice: 'existing',
    });
  }

  if (
    existing.damId &&
    incoming.damId &&
    !isSameParentAnimal(existing.damId, incoming.damId, options.allKnownAnimalsById)
  ) {
    contradictions.push({
      field: 'damId',
      label: `${sp.femaleLabel} / Dam`,
      existingDisplay: formatParentLabel(existing.damId, options.allKnownAnimalsById),
      incomingDisplay: formatParentLabel(incoming.damId, options.allKnownAnimalsById),
      supportsCombine: false,
      defaultChoice: 'existing',
    });
  }

  checkText('notes', 'Notes', existing.notes, incoming.notes, false, true);

  return contradictions;
}

/**
 * Builds the default `ConflictSelectionMap` for a list of `AnimalImportConflict` items.
 */
export function buildInitialConflictSelections(
  conflicts: AnimalImportConflict[]
): ConflictSelectionMap {
  const map: ConflictSelectionMap = {};
  for (const c of conflicts) {
    for (const item of c.contradictions) {
      map[makeConflictSelectionKey(c.animalId, item.field)] = item.defaultChoice;
    }
  }
  return map;
}

/**
 * Merges a preexisting `existing` animal with an `incoming` animal:
 * - Blank fields on either side automatically enrich from the non-blank side.
 * - Any contradicting field uses the user's explicit selection in `selections` (falling back to `'existing'`).
 * - Validates Sire/Dam cycle safety and re-parses `genotype` from `genotypeRaw`.
 */
export function resolveAnimalsWithConflictChoices(
  importedAnimals: Animal[],
  existingSnapshot: BarnDatabaseSnapshot,
  selections: ConflictSelectionMap
): Animal[] {
  const ts = nowIsoUtc();
  const existingById = new Map<string, Animal>();
  for (const a of existingSnapshot.animals) {
    existingById.set(a.id, a);
  }

  const pickNonEmptyText = (
    animalId: string,
    field: AnimalConflictFieldKey,
    exVal: string,
    incVal: string
  ): string => {
    const exClean = (exVal || '').trim();
    const incClean = (incVal || '').trim();
    if (!exClean) return incClean;
    if (!incClean) return exClean;
    if (exClean === incClean) return exClean;

    const choice = selections[makeConflictSelectionKey(animalId, field)] || 'existing';
    if (choice === 'combine') {
      if (exClean.toLowerCase().includes(incClean.toLowerCase())) return exClean;
      if (incClean.toLowerCase().includes(exClean.toLowerCase())) return incClean;
      return `${exClean} · ${incClean}`;
    }
    return choice === 'incoming' ? incClean : exClean;
  };

  const resolvedList: Animal[] = importedAnimals.map((inc) => {
    const ex = existingById.get(inc.id);
    if (!ex) {
      return { ...inc, updatedAt: ts };
    }

    const sexChoice = selections[makeConflictSelectionKey(ex.id, 'sex')] || 'existing';
    const resolvedSex =
      ex.sex === 'Unknown'
        ? inc.sex
        : inc.sex === 'Unknown'
          ? ex.sex
          : sexChoice === 'incoming'
            ? inc.sex
            : ex.sex;

    const statusChoice = selections[makeConflictSelectionKey(ex.id, 'status')] || 'existing';
    const resolvedStatus = !ex.status
      ? inc.status
      : !inc.status
        ? ex.status
        : statusChoice === 'incoming'
          ? inc.status
          : ex.status;

    const weightChoice = selections[makeConflictSelectionKey(ex.id, 'weightGrams')] || 'incoming';
    const resolvedWeight =
      ex.weightGrams <= 0
        ? inc.weightGrams
        : inc.weightGrams <= 0
          ? ex.weightGrams
          : weightChoice === 'incoming'
            ? inc.weightGrams
            : ex.weightGrams;

    const resolvedGenotypeRaw = pickNonEmptyText(
      ex.id,
      'genotypeRaw',
      ex.genotypeRaw,
      inc.genotypeRaw
    );

    const sireChoice = selections[makeConflictSelectionKey(ex.id, 'sireId')] || 'existing';
    const resolvedSireId = !ex.sireId
      ? inc.sireId
      : !inc.sireId
        ? ex.sireId
        : sireChoice === 'incoming'
          ? inc.sireId
          : ex.sireId;

    const damChoice = selections[makeConflictSelectionKey(ex.id, 'damId')] || 'existing';
    const resolvedDamId = !ex.damId
      ? inc.damId
      : !inc.damId
        ? ex.damId
        : damChoice === 'incoming'
          ? inc.damId
          : ex.damId;

    const archivedChoice = selections[makeConflictSelectionKey(ex.id, 'archived')] || 'incoming';
    const resolvedArchived =
      Boolean(ex.archived) === Boolean(inc.archived)
        ? Boolean(ex.archived)
        : archivedChoice === 'incoming'
          ? Boolean(inc.archived)
          : Boolean(ex.archived);

    return {
      id: ex.id,
      species: ex.species,
      name: pickNonEmptyText(ex.id, 'name', ex.name, inc.name) || ex.name,
      tattoo: pickNonEmptyText(ex.id, 'tattoo', ex.tattoo, inc.tattoo),
      sex: resolvedSex,
      status: resolvedStatus,
      archived: resolvedArchived,
      birthDateIso: pickNonEmptyText(ex.id, 'birthDateIso', ex.birthDateIso, inc.birthDateIso),
      breed: pickNonEmptyText(ex.id, 'breed', ex.breed, inc.breed),
      variety: pickNonEmptyText(ex.id, 'variety', ex.variety, inc.variety),
      weightGrams: resolvedWeight,
      genotypeRaw: resolvedGenotypeRaw,
      genotype: resolvedGenotypeRaw ? parseGenotypeString(resolvedGenotypeRaw) : ex.genotype,
      registrationNumber: pickNonEmptyText(
        ex.id,
        'registrationNumber',
        ex.registrationNumber,
        inc.registrationNumber
      ),
      grandChampionNumber: pickNonEmptyText(
        ex.id,
        'grandChampionNumber',
        ex.grandChampionNumber,
        inc.grandChampionNumber
      ),
      legsCount: Math.max(ex.legsCount || 0, inc.legsCount || 0),
      cageLocation: pickNonEmptyText(ex.id, 'cageLocation', ex.cageLocation, inc.cageLocation),
      breederName: pickNonEmptyText(ex.id, 'breederName', ex.breederName, inc.breederName),
      ownerName: pickNonEmptyText(ex.id, 'ownerName', ex.ownerName, inc.ownerName),
      sireId: resolvedSireId === ex.id ? '' : resolvedSireId,
      damId: resolvedDamId === ex.id ? '' : resolvedDamId,
      notes: pickNonEmptyText(ex.id, 'notes', ex.notes, inc.notes),
      createdAt: ex.createdAt || inc.createdAt || ts,
      updatedAt: ts,
    };
  });

  // Final cycle-safety pass across combined barn + imported herd per species
  const combinedAnimals = new Map<string, Animal>();
  for (const a of existingSnapshot.animals) combinedAnimals.set(a.id, a);
  for (const a of resolvedList) combinedAnimals.set(a.id, a);

  const allCombined = Array.from(combinedAnimals.values());
  const speciesSet = new Set(resolvedList.map((a) => a.species));
  for (const spName of speciesSet) {
    const herdMap = buildSpeciesHerdMap(allCombined, spName);
    for (const animal of resolvedList) {
      if (!isSameSpecies(animal.species, spName)) continue;
      if (animal.sireId && wouldCreateCycle(animal.id, animal.sireId, herdMap)) {
        animal.sireId = '';
      }
      if (animal.damId && wouldCreateCycle(animal.id, animal.damId, herdMap)) {
        animal.damId = '';
      }
    }
  }

  return resolvedList;
}
