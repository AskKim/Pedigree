/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Animal Conflict Detection, Duplicate-Tattoo Override Guard &
 * Import Attention Engine (`src/core/animalConflicts.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) or Node dependencies.
 * Runs identically in Web PWA, Node.js tests, and React Native / Expo.
 *
 * Covers:
 * - Same-species duplicate ear # / tattoo detection (with same-sex collision emphasis on creation)
 * - Explicit `"override"` confirmation verification
 * - Parent sex mismatch detection (Sire != Male, Dam != Female)
 * - Non-blocking import conflict alerting & `needsAttention` flagging
 * - Per-animal conflict ignore state that clears urgent attention while retaining soft warnings
 */

import {
  Animal,
  AnimalConflictKind,
  BiologicalSex,
  isSameSpecies,
  normalizeIgnoredConflicts,
  nowIsoUtc,
} from './models';

export interface DuplicateTattooPeer {
  peer: Animal;
  sameSex: boolean;
}

export interface ParentSexMismatchDetail {
  role: 'sire' | 'dam';
  expectedSex: 'Male' | 'Female';
  parent: Animal;
  actualSex: BiologicalSex;
}

export interface AnimalConflictSummary {
  animalId: string;
  species: string;
  duplicateTattooPeers: DuplicateTattooPeer[];
  sireSexMismatch: ParentSexMismatchDetail | null;
  damSexMismatch: ParentSexMismatchDetail | null;
  conflictKinds: AnimalConflictKind[];
  ignoredKinds: AnimalConflictKind[];
  activeKinds: AnimalConflictKind[];
  hasAnyConflict: boolean;
  hasActiveConflict: boolean;
  isIgnoredWithSoftWarning: boolean;
  headlineReasons: string[];
}

export interface LitterOffspringDraft {
  index: number;
  name: string;
  tattoo: string;
  sex: BiologicalSex;
}

export interface LitterTattooConflictDetail {
  rowIndex: number;
  tattoo: string;
  sex: BiologicalSex;
  existingMatches: Animal[];
  batchPeerIndices: number[];
}

export interface ImportConflictFlagResult {
  animals: Animal[];
  newlyFlaggedIds: string[];
  conflictedAnimalIds: string[];
  duplicateTattooAnimalCount: number;
  parentSexMismatchAnimalCount: number;
  alertMessage: string | null;
}

export function normalizeTattooKey(raw: string | undefined | null): string {
  return (raw || '').trim().toLowerCase();
}

export function isOverrideConfirmationValid(raw: string | undefined | null): boolean {
  return (raw || '').trim().toLowerCase() === 'override';
}

/**
 * Finds preexisting animals in the SAME species with the SAME sex and normalized tattoo/ear #.
 * Used during animal creation and bulk litter creation to discourage accidental duplicate IDs
 * unless the user explicitly types `override`.
 */
export function findSameSexDuplicateTattooCollisions(params: {
  tattoo: string;
  sex: BiologicalSex;
  species: string;
  animals: Animal[];
  excludeAnimalIds?: string[];
}): Animal[] {
  const tatKey = normalizeTattooKey(params.tattoo);
  if (!tatKey) return [];
  const excluded = new Set(params.excludeAnimalIds || []);
  return params.animals.filter(
    (a) =>
      !excluded.has(a.id) &&
      isSameSpecies(a.species, params.species) &&
      normalizeTattooKey(a.tattoo) === tatKey &&
      a.sex === params.sex
  );
}

/**
 * Finds all same-species duplicate tattoo peers (any sex) for informational/editing checks.
 */
export function findAllSpeciesDuplicateTattooPeers(params: {
  tattoo: string;
  species: string;
  animals: Animal[];
  excludeAnimalIds?: string[];
}): Animal[] {
  const tatKey = normalizeTattooKey(params.tattoo);
  if (!tatKey) return [];
  const excluded = new Set(params.excludeAnimalIds || []);
  return params.animals.filter(
    (a) =>
      !excluded.has(a.id) &&
      isSameSpecies(a.species, params.species) &&
      normalizeTattooKey(a.tattoo) === tatKey
  );
}

/**
 * Validates bulk litter offspring drafts against existing animals of the same species/sex
 * AND against other babies in the same litter batch.
 */
export function findLitterOffspringTattooConflicts(
  drafts: LitterOffspringDraft[],
  species: string,
  existingAnimals: Animal[]
): LitterTattooConflictDetail[] {
  const results: LitterTattooConflictDetail[] = [];

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i];
    const tatKey = normalizeTattooKey(draft.tattoo);
    if (!tatKey) continue;

    const existingMatches = findSameSexDuplicateTattooCollisions({
      tattoo: draft.tattoo,
      sex: draft.sex,
      species,
      animals: existingAnimals,
    });

    const batchPeerIndices: number[] = [];
    for (let j = 0; j < drafts.length; j++) {
      if (i === j) continue;
      const other = drafts[j];
      if (normalizeTattooKey(other.tattoo) === tatKey && other.sex === draft.sex) {
        batchPeerIndices.push(j);
      }
    }

    if (existingMatches.length > 0 || batchPeerIndices.length > 0) {
      results.push({
        rowIndex: draft.index,
        tattoo: draft.tattoo.trim(),
        sex: draft.sex,
        existingMatches,
        batchPeerIndices,
      });
    }
  }

  return results;
}

/**
 * Finds existing offspring within the same species that currently reference `parentId`
 * as their Sire or Dam so sex changes can be prevented before creating a mismatch.
 */
export function findOffspringRequiringParentSex(
  parentId: string,
  species: string,
  animals: Animal[]
): { asSireOf: Animal[]; asDamOf: Animal[] } {
  if (!parentId) return { asSireOf: [], asDamOf: [] };
  const asSireOf: Animal[] = [];
  const asDamOf: Animal[] = [];
  for (const a of animals) {
    if (!isSameSpecies(a.species, species) || a.id === parentId) continue;
    if (a.sireId === parentId) asSireOf.push(a);
    if (a.damId === parentId) asDamOf.push(a);
  }
  return { asSireOf, asDamOf };
}

/**
 * Computes live per-animal conflict summaries across all animals (strictly species-isolated).
 */
export function analyzeBarnAnimalConflicts(
  animals: Animal[]
): Map<string, AnimalConflictSummary> {
  const result = new Map<string, AnimalConflictSummary>();

  const bySpecies = new Map<string, Animal[]>();
  for (const a of animals) {
    const spKey = (a.species || '').trim().toLowerCase();
    const list = bySpecies.get(spKey) || [];
    list.push(a);
    bySpecies.set(spKey, list);
  }

  for (const speciesGroup of bySpecies.values()) {
    const byId = new Map<string, Animal>();
    const byTattoo = new Map<string, Animal[]>();

    for (const a of speciesGroup) {
      byId.set(a.id, a);
      const tatKey = normalizeTattooKey(a.tattoo);
      if (tatKey) {
        const list = byTattoo.get(tatKey) || [];
        list.push(a);
        byTattoo.set(tatKey, list);
      }
    }

    for (const a of speciesGroup) {
      const tatKey = normalizeTattooKey(a.tattoo);
      const duplicateTattooPeers: DuplicateTattooPeer[] = tatKey
        ? (byTattoo.get(tatKey) || [])
            .filter((peer) => peer.id !== a.id)
            .map((peer) => ({
              peer,
              sameSex: peer.sex === a.sex,
            }))
        : [];

      let sireSexMismatch: ParentSexMismatchDetail | null = null;
      if (a.sireId) {
        const sire = byId.get(a.sireId);
        if (sire && sire.id !== a.id && sire.sex !== 'Male') {
          sireSexMismatch = {
            role: 'sire',
            expectedSex: 'Male',
            parent: sire,
            actualSex: sire.sex,
          };
        }
      }

      let damSexMismatch: ParentSexMismatchDetail | null = null;
      if (a.damId) {
        const dam = byId.get(a.damId);
        if (dam && dam.id !== a.id && dam.sex !== 'Female') {
          damSexMismatch = {
            role: 'dam',
            expectedSex: 'Female',
            parent: dam,
            actualSex: dam.sex,
          };
        }
      }

      const conflictKinds: AnimalConflictKind[] = [];
      if (duplicateTattooPeers.length > 0) {
        conflictKinds.push('duplicate_tattoo');
      }
      if (sireSexMismatch || damSexMismatch) {
        conflictKinds.push('parent_sex_mismatch');
      }

      const rawIgnored = normalizeIgnoredConflicts(a.ignoredConflicts);
      const ignoredKinds = conflictKinds.filter((k) => rawIgnored.includes(k));
      const activeKinds = conflictKinds.filter((k) => !ignoredKinds.includes(k));

      const headlineReasons: string[] = [];
      if (duplicateTattooPeers.length > 0) {
        const sameSexCount = duplicateTattooPeers.filter((p) => p.sameSex).length;
        headlineReasons.push(
          sameSexCount > 0
            ? `Duplicate tattoo "${a.tattoo.trim()}" (${sameSexCount} same-sex match${sameSexCount === 1 ? '' : 'es'})`
            : `Duplicate tattoo "${a.tattoo.trim()}" (${duplicateTattooPeers.length} match${duplicateTattooPeers.length === 1 ? '' : 'es'} in species)`
        );
      }
      if (sireSexMismatch) {
        headlineReasons.push(
          `Sire "${sireSexMismatch.parent.name}" is recorded as ${sireSexMismatch.actualSex}`
        );
      }
      if (damSexMismatch) {
        headlineReasons.push(
          `Dam "${damSexMismatch.parent.name}" is recorded as ${damSexMismatch.actualSex}`
        );
      }

      result.set(a.id, {
        animalId: a.id,
        species: a.species,
        duplicateTattooPeers,
        sireSexMismatch,
        damSexMismatch,
        conflictKinds,
        ignoredKinds,
        activeKinds,
        hasAnyConflict: conflictKinds.length > 0,
        hasActiveConflict: activeKinds.length > 0,
        isIgnoredWithSoftWarning: conflictKinds.length > 0 && activeKinds.length === 0,
        headlineReasons,
      });
    }
  }

  return result;
}

/**
 * Flags animals involved in active duplicate-tattoo or parent-sex-mismatch conflicts
 * after an import WITHOUT blocking the import.
 *
 * - If `importedAnimalIds` is provided (merge / platform import), flags imported animals AND any
 *   existing herd peers newly colliding with those imported animals (unless ignored).
 * - If `importedAnimalIds` is omitted (full backup replace), evaluates the entire imported herd.
 */
export function applyImportConflictAttentionFlags(
  animals: Animal[],
  importedAnimalIds?: Set<string>
): ImportConflictFlagResult {
  const summaries = analyzeBarnAnimalConflicts(animals);
  const ts = nowIsoUtc();

  const touchedIds = new Set<string>();
  const newlyFlaggedIds: string[] = [];
  const dupAnimals = new Set<string>();
  const mismatchAnimals = new Set<string>();

  const nextAnimals = animals.map((animal) => {
    const summary = summaries.get(animal.id);
    if (!summary || !summary.hasActiveConflict) {
      return animal;
    }

    const involvesImport =
      !importedAnimalIds ||
      importedAnimalIds.has(animal.id) ||
      summary.duplicateTattooPeers.some((p) => importedAnimalIds.has(p.peer.id)) ||
      (summary.sireSexMismatch ? importedAnimalIds.has(summary.sireSexMismatch.parent.id) : false) ||
      (summary.damSexMismatch ? importedAnimalIds.has(summary.damSexMismatch.parent.id) : false);

    if (!involvesImport) {
      return animal;
    }

    touchedIds.add(animal.id);
    if (summary.activeKinds.includes('duplicate_tattoo')) {
      dupAnimals.add(animal.id);
    }
    if (summary.activeKinds.includes('parent_sex_mismatch')) {
      mismatchAnimals.add(animal.id);
    }

    if (animal.needsAttention) {
      return animal;
    }
    newlyFlaggedIds.push(animal.id);
    return {
      ...animal,
      needsAttention: true,
      updatedAt: animal.updatedAt || ts,
    };
  });

  const conflictedAnimalIds = Array.from(touchedIds);
  const parts: string[] = [];
  if (dupAnimals.size > 0) {
    parts.push(`${dupAnimals.size} with duplicate ID/tattoo`);
  }
  if (mismatchAnimals.size > 0) {
    parts.push(`${mismatchAnimals.size} with parent sex mismatch`);
  }

  const alertMessage =
    conflictedAnimalIds.length > 0
      ? `Import completed with ${conflictedAnimalIds.length} record(s) needing review (${parts.join(', ')}). Profiles & pedigrees were flagged for attention.`
      : null;

  return {
    animals: nextAnimals,
    newlyFlaggedIds,
    conflictedAnimalIds,
    duplicateTattooAnimalCount: dupAnimals.size,
    parentSexMismatchAnimalCount: mismatchAnimals.size,
    alertMessage,
  };
}

/**
 * Ranks animals so Active Conflicts come first, Ignored Soft Warnings second, and clean animals third.
 */
export function getConflictSortPriority(summary: AnimalConflictSummary | undefined): number {
  if (!summary || !summary.hasAnyConflict) return 2;
  if (summary.hasActiveConflict) return 0;
  return 1;
}
