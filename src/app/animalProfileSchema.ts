/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Canonical Animal Profile Schema & Serialization (`@app/animalProfileSchema.ts`).
 */

import { parseGenotypeString } from '../domain/geneticsEngine';
import {
  type Animal,
  type BiologicalSex,
  generateUuid,
  normalizeAnimalStatus,
  nowIsoUtc,
} from '../domain/models';

export const ANIMAL_PROFILE_SCHEMA_VERSION = 1 as const;

export interface AnimalProfileEnvelope {
  format: 'pedigree-animal-profiles';
  schemaVersion: typeof ANIMAL_PROFILE_SCHEMA_VERSION;
  exportedAtIso: string;
  profiles: Animal[];
}

export function normalizeAnimalSex(raw: unknown): BiologicalSex {
  if (typeof raw !== 'string') return 'Unknown';
  const clean = raw.trim().toLowerCase();
  if (
    clean === 'm' ||
    clean === 'male' ||
    clean === 'buck' ||
    clean === 'ram' ||
    clean === 'bull' ||
    clean === 'boar' ||
    clean === 'stallion' ||
    clean === 'rooster' ||
    clean === 'sire'
  ) {
    return 'Male';
  }
  if (
    clean === 'f' ||
    clean === 'female' ||
    clean === 'doe' ||
    clean === 'ewe' ||
    clean === 'cow' ||
    clean === 'sow' ||
    clean === 'mare' ||
    clean === 'hen' ||
    clean === 'dam'
  ) {
    return 'Female';
  }
  return 'Unknown';
}

export function normalizeAnimalProfileRecord(
  input: Partial<Animal>,
  fallbackSpecies = 'Rabbit'
): Animal {
  const now = nowIsoUtc();
  const species = (input.species || '').trim() || fallbackSpecies;
  const genotypeRaw = (input.genotypeRaw || '').trim();
  const genotype =
    Array.isArray(input.genotype) && input.genotype.length > 0
      ? input.genotype
      : genotypeRaw
      ? parseGenotypeString(genotypeRaw, species)
      : [];

  return {
    id: (input.id || '').trim() || generateUuid(),
    tattoo: (input.tattoo || '').trim(),
    name: (input.name || '').trim(),
    species,
    breed: (input.breed || '').trim(),
    variety: (input.variety || '').trim(),
    sex: normalizeAnimalSex(input.sex),
    status: normalizeAnimalStatus(input.status),
    birthDateIso: (input.birthDateIso || '').trim(),
    weightGrams:
      typeof input.weightGrams === 'number' && Number.isFinite(input.weightGrams) && input.weightGrams >= 0
        ? Math.round(input.weightGrams)
        : 0,
    genotype,
    genotypeRaw,
    registrationNumber: (input.registrationNumber || '').trim(),
    grandChampionNumber: (input.grandChampionNumber || '').trim(),
    legsCount:
      typeof input.legsCount === 'number' && Number.isFinite(input.legsCount) && input.legsCount >= 0
        ? Math.round(input.legsCount)
        : 0,
    cageLocation: (input.cageLocation || '').trim(),
    breederName: (input.breederName || '').trim(),
    ownerName: (input.ownerName || '').trim(),
    sireId: (input.sireId || '').trim(),
    damId: (input.damId || '').trim(),
    notes: (input.notes || '').trim(),
    createdAt: (input.createdAt || '').trim() || now,
    updatedAt: (input.updatedAt || '').trim() || now,
    ...(input.archived !== undefined ? { archived: Boolean(input.archived) } : {}),
    ...(input.ownershipType ? { ownershipType: input.ownershipType } : {}),
    ...(input._rev !== undefined ? { _rev: input._rev } : {}),
  };
}

export function validateAnimalProfile(
  input: Partial<Animal>,
  fallbackSpecies = 'Rabbit'
): { ok: boolean; errors: string[]; record: Animal } {
  const record = normalizeAnimalProfileRecord(input, fallbackSpecies);
  const errors: string[] = [];

  if (!record.name && !record.tattoo) {
    errors.push('Animal profile requires at least a name or tattoo/ear ID.');
  }
  if (!record.species) {
    errors.push('Animal profile requires a species.');
  }
  if (record.birthDateIso && !/^\d{4}-\d{2}-\d{2}$/.test(record.birthDateIso)) {
    errors.push('Birth date must use YYYY-MM-DD format.');
  }
  if (!Number.isFinite(record.weightGrams) || record.weightGrams < 0) {
    errors.push('Weight in grams must be a non-negative number.');
  }

  return {
    ok: errors.length === 0,
    errors,
    record,
  };
}

export function serializeAnimalProfiles(profiles: Animal[]): string {
  const envelope: AnimalProfileEnvelope = {
    format: 'pedigree-animal-profiles',
    schemaVersion: ANIMAL_PROFILE_SCHEMA_VERSION,
    exportedAtIso: nowIsoUtc(),
    profiles: profiles.map((p) => normalizeAnimalProfileRecord(p, p.species || 'Rabbit')),
  };
  return JSON.stringify(envelope);
}

export function deserializeAnimalProfiles(rawJson: string): Animal[] {
  const parsed = JSON.parse(rawJson) as unknown;
  if (Array.isArray(parsed)) {
    return parsed
      .filter((item): item is Partial<Animal> => Boolean(item && typeof item === 'object'))
      .map((item) => normalizeAnimalProfileRecord(item));
  }
  if (parsed && typeof parsed === 'object') {
    const env = parsed as Partial<AnimalProfileEnvelope>;
    if (env.format === 'pedigree-animal-profiles' && Array.isArray(env.profiles)) {
      return env.profiles.map((item) => normalizeAnimalProfileRecord(item));
    }
  }
  throw new Error('Unrecognized animal profile archive format');
}
