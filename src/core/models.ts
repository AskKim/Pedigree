/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure TypeScript Domain Models for the Community Pedigree Project (Package: Pedigree).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * This module has ZERO browser DOM (`window`, `document`) or framework dependencies.
 * It can be copied directly into a React Native / Expo project (`expo-sqlite`) without
 * modification. Every persisted entity carries a globally unique `id` (UUID v4) and an
 * ISO-8601 UTC `updatedAt` timestamp for deterministic multi-device file merging, plus
 * clean 1:1 compatibility with JSON, CSV, Evans .HTM, and PDF exports.
 */

import type { ImageOptimizationPresetId } from './imageOptimizationSpec';
import type { CustomThemeColors } from './themePalette';

export type BiologicalSex = 'Male' | 'Female' | 'Unknown';

export type AnimalStatus = 'Active' | 'Junior' | 'Retired' | 'Archived' | 'Sold' | 'Deceased';

export type BreedingStatus =
  | 'Planned'
  | 'Bred'
  | 'Palpated Positive'
  | 'Born'
  | 'Weaned'
  | 'Missed';

export type TaskCategory =
  | 'Care'
  | 'Palpation'
  | 'Nestbox'
  | 'Birth Check'
  | 'Weaning'
  | 'Rebreed'
  | 'Health'
  | 'Show Prep'
  | 'Other';

export type TaskPriority = 'High' | 'Normal' | 'Low';

export type MilestoneRelativeTo = 'AFTER_BRED' | 'BEFORE_BIRTH' | 'AFTER_BIRTH';

export type WeightUnit = 'lbs_oz' | 'lbs' | 'grams';

export type CareLogType =
  | 'Weight Check'
  | 'Show / Leg'
  | 'Palpation'
  | 'Health / Vet'
  | 'Grooming & Hoof'
  | 'Journal Note';

/**
 * Single coat-color or trait locus pair (e.g., Rabbit Extension locus `{ locus: 'E', allele1: 'e', allele2: 'e' }`).
 * An unknown second allele is represented with `'_'` (e.g., `A_`).
 */
export interface GenotypeAllelePair {
  locus: string;
  allele1: string;
  allele2: string;
}

/**
 * Global Barn preferences stored locally on the user's device.
 * `pinnedLandingSpecies`:
 *   - `""` (empty string) opens on the Multi-Species Home Landing Page.
 *   - Any configured species name (e.g. `"Rabbit"`, `"Goat"`) opens directly inside that species' hub.
 */
export interface BarnSettings {
  id: string;
  barnName: string;
  breederName: string;
  preferredUnit: WeightUnit;
  defaultSpecies: string;
  pinnedLandingSpecies: string;
  defaultGenerations: 3 | 4 | 5 | 6;
  themeMode: 'light' | 'dark';
  customColors?: CustomThemeColors;
  imageOptimizationPreset?: ImageOptimizationPresetId;
  showHomeSummaryGrid?: boolean;
  barnNameOnboarded?: boolean;
  ignoredTaskIds?: string[];
  dismissedTaskGroupKeys?: Record<string, string | string[]>;
  includePhotoOnPedigree?: boolean;
  lastBackupMeta?: {
    exportedAtIso: string;
    format: 'zip' | 'sqlite' | 'json';
    fileName?: string;
  };
  backupReminderSnoozedUntilMs?: number;
  updatedAt: string;
}

/**
 * Configurable care or biological milestone rule attached to a `SpeciesProfile`.
 * Used by the Master Task List engine to automatically cascade barn chores when a breeding is logged.
 */
export interface SpeciesMilestoneTemplate {
  label: string;
  relativeTo: MilestoneRelativeTo;
  daysOffset: number;
  category: TaskCategory;
  priority: TaskPriority;
}

/**
 * Livestock species biological schedule, sex/offspring terminology, and Master Task List templates.
 */
export interface SpeciesProfile {
  id: string;
  name: string;
  sortOrder?: number;
  defaultAnimalPrefix?: string;
  gestationDays: number;
  rebreedDaysAfterBirth: number;
  weanDaysAfterBirth: number;
  birthEventLabel: string;
  maleLabel: string;
  femaleLabel: string;
  offspringLabel: string;
  exampleBreeds: string[];
  milestones: SpeciesMilestoneTemplate[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Individual animal registry record.
 * Multi-photo attachments live in the dedicated `AnimalPhoto` table (`animal_photos`) so core
 * pedigree and COI queries remain lightweight.
 */
export interface Animal {
  id: string;
  tattoo: string;
  name: string;
  species: string;
  breed: string;
  variety: string;
  sex: BiologicalSex;
  status: AnimalStatus;
  archived?: boolean;
  birthDateIso: string; // YYYY-MM-DD or ""
  weightGrams: number;
  genotype: GenotypeAllelePair[];
  genotypeRaw: string;
  registrationNumber: string;
  grandChampionNumber: string;
  legsCount: number;
  cageLocation: string;
  breederName: string;
  ownerName: string;
  sireId: string;
  damId: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Physical cage, hutch, pen, stall, or pasture location scoped to a species.
 */
export interface CageLocation {
  id: string;
  species: string;
  label: string;
  section: string;
  capacity: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Breeding pairing and kindling/birth litter record.
 */
export interface BreedingRecord {
  id: string;
  species: string;
  sireId: string;
  damId: string;
  sireName: string;
  damName: string;
  bredDateIso: string; // YYYY-MM-DD
  expectedDueDateIso: string; // YYYY-MM-DD
  actualBirthDateIso: string; // YYYY-MM-DD or ""
  projectedCoiPercent: number;
  liveCount: number;
  stillbornCount: number;
  fosteredCount: number;
  weanedCount: number;
  offspringCreated: boolean;
  status: BreedingStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Scheduled barn chore or Master Task List cascaded task, strictly scoped to a `species`.
 */
export interface BarnTask {
  id: string;
  species: string;
  title: string;
  category: TaskCategory;
  priority: TaskPriority;
  dueDateIso: string; // YYYY-MM-DD or ""
  linkedAnimalId: string;
  linkedAnimalName: string;
  linkedBreedingId: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Per-animal weight check, show leg, palpation, or health log entry.
 */
export interface CareLog {
  id: string;
  species: string;
  animalId: string;
  dateIso: string; // YYYY-MM-DD
  type: CareLogType;
  title: string;
  weightGrams: number;
  showLegEarned: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Livestock or ARBA show event with entered animal roster, scoped to a `species`.
 */
export interface ShowEvent {
  id: string;
  species: string;
  name: string;
  location: string;
  sanctioningBody: string;
  eventDateIso: string; // YYYY-MM-DD
  entryDeadlineIso: string; // YYYY-MM-DD or ""
  enteredAnimalIds: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Optimized per-animal photo record stored in its own relational table (`animal_photos`)
 * so an animal can have 1 or many photos without slowing down pedigree/herd queries.
 * Supports both direct user uploads and batch-optimized platform imports.
 */
export interface AnimalPhoto {
  id: string;
  species: string;
  animalId: string;
  isPrimary: boolean;
  sortOrder: number;
  caption: string;
  originalFileName: string;
  mimeType: string;
  width: number;
  height: number;
  originalBytes: number;
  storedBytes: number;
  thumbnailDataUrl: string;
  dataUrl: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Complete in-memory snapshot of the unencrypted local database.
 */
export interface BarnDatabaseSnapshot {
  settings: BarnSettings;
  speciesProfiles: SpeciesProfile[];
  animals: Animal[];
  animalPhotos: AnimalPhoto[];
  cages: CageLocation[];
  breedings: BreedingRecord[];
  tasks: BarnTask[];
  careLogs: CareLog[];
  shows: ShowEvent[];
}

export const ANIMAL_STATUSES: AnimalStatus[] = [
  'Active',
  'Junior',
  'Retired',
  'Archived',
  'Sold',
  'Deceased',
];

export const BREEDING_STATUSES: BreedingStatus[] = [
  'Planned',
  'Bred',
  'Palpated Positive',
  'Born',
  'Weaned',
  'Missed',
];

export const TASK_CATEGORIES: TaskCategory[] = [
  'Care',
  'Palpation',
  'Nestbox',
  'Birth Check',
  'Weaning',
  'Rebreed',
  'Health',
  'Show Prep',
  'Other',
];

export const TASK_PRIORITIES: TaskPriority[] = ['High', 'Normal', 'Low'];

export const CARE_LOG_TYPES: CareLogType[] = [
  'Weight Check',
  'Show / Leg',
  'Palpation',
  'Health / Vet',
  'Grooming & Hoof',
  'Journal Note',
];

export const SHOW_SANCTIONS: string[] = [
  'ARBA',
  'ADGA / AGS',
  '4-H / FFA',
  'Specialty Club',
  'County / State Fair',
  'Other',
];

/**
 * Generates an RFC-4122 v4 UUID using pure JS fallback if `crypto.randomUUID` is unavailable.
 */
export function generateUuid(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns the current UTC timestamp in ISO-8601 format (`YYYY-MM-DDTHH:mm:ss.sssZ`).
 */
export function nowIsoUtc(): string {
  return new Date().toISOString();
}

/**
 * Returns today's local calendar date as `YYYY-MM-DD`.
 */
export function todayDateIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Adds a signed integer number of calendar days to an ISO `YYYY-MM-DD` date string.
 */
export function addDaysIso(baseDateIso: string, daysOffset: number): string {
  if (!baseDateIso) return '';
  const parts = baseDateIso.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return '';
  const utc = Date.UTC(parts[0], parts[1] - 1, parts[2] + Math.round(daysOffset));
  const dt = new Date(utc);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Converts epoch milliseconds (from legacy v3/v4 JSON backups) to `YYYY-MM-DD`.
 */
export function millisToDateIso(millis: number): string {
  if (!millis || millis <= 0) return '';
  const dt = new Date(millis);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Normalizes species-specific sex strings (`Buck`, `Doe`, `Ram`, `Ewe`, `Boar`, `Sow`,
 * `Bull`, `Cow`, `Hob`, `Jill`, `Macho`, `Hembra`) into canonical `BiologicalSex`.
 */
export function normalizeBiologicalSex(rawSex: string): BiologicalSex {
  const s = (rawSex || '').trim().toLowerCase();
  if (
    ['male', 'm', 'buck', 'ram', 'boar', 'bull', 'hob', 'macho', 'sire', 'stallion'].includes(s)
  ) {
    return 'Male';
  }
  if (
    ['female', 'f', 'doe', 'ewe', 'sow', 'cow', 'jill', 'hembra', 'dam', 'mare'].includes(s)
  ) {
    return 'Female';
  }
  return 'Unknown';
}

/**
 * Returns the species-appropriate sex label (`Buck` / `Doe`, `Ram` / `Ewe`, etc.).
 */
export function formatSexForSpecies(sex: BiologicalSex, speciesProfile?: SpeciesProfile): string {
  if (sex === 'Male') return speciesProfile?.maleLabel || 'Male';
  if (sex === 'Female') return speciesProfile?.femaleLabel || 'Female';
  return 'Unknown';
}

/**
 * Returns a species-appropriate breeding status label (e.g., `"Kindled"` for Rabbit, `"Kidded"` for Goat).
 */
export function formatBreedingStatusForSpecies(
  status: BreedingStatus,
  speciesProfile?: SpeciesProfile
): string {
  if (status !== 'Born') return status;
  const event = (speciesProfile?.birthEventLabel || 'Birth').toLowerCase();
  if (event === 'kindling') return 'Kindled';
  if (event === 'kidding') return 'Kidded';
  if (event === 'lambing') return 'Lambed';
  if (event === 'farrowing') return 'Farrowed';
  if (event === 'calving') return 'Calved';
  if (event === 'unpacking') return 'Unpacked';
  return 'Born';
}

/**
 * Case-insensitive species equality check used across all screens to guarantee strict species isolation.
 */
export function isSameSpecies(a: string | undefined, b: string | undefined): boolean {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

/**
 * Returns true when an animal is archived (out of active herd tasks while kept for pedigree history).
 */
export function isAnimalArchived(
  animal: Partial<Pick<Animal, 'archived' | 'status'>> | undefined | null
): boolean {
  if (!animal) return false;
  if (
    animal.status === 'Archived' ||
    animal.status === 'Deceased' ||
    animal.status === 'Sold' ||
    animal.status === 'Retired'
  ) {
    return true;
  }
  return Boolean(animal.archived);
}

/**
 * Returns true when an animal is considered active (not archived/sold/deceased/retired).
 */
export function isAnimalActive(
  animal: Partial<Pick<Animal, 'archived' | 'status'>> | undefined | null
): boolean {
  if (!animal) return false;
  return !isAnimalArchived(animal);
}

/**
 * Normalizes imported or legacy livestock status strings and boolean flags into canonical `AnimalStatus`.
 */
export function normalizeAnimalStatus(
  rawStatus?: string,
  archivedFlag?: unknown,
  activeFlag?: unknown
): AnimalStatus {
  const s = (rawStatus || '').trim().toLowerCase();
  if (s) {
    if (/\b(?:dead|deceased|died|culled|cull|butchered|harvested|euthanized|lost)\b/.test(s)) {
      return 'Deceased';
    }
    if (/\b(?:sold|sale|transferred|marketed)\b/.test(s)) {
      return 'Sold';
    }
    if (/\b(?:ref|reference|ancestor|pedigree|retired|historical|external)\b/.test(s)) {
      return 'Retired';
    }
    if (/\b(?:archived|inactive|not active|non-active|gone|pet)\b/.test(s)) {
      return 'Archived';
    }
    if (/\b(?:junior|weanling|nursing|jr)\b/.test(s)) {
      return 'Junior';
    }
    if (s === 'active') {
      return 'Active';
    }
  }

  if (archivedFlag === true || /^(?:1|true|yes|y)$/i.test(String(archivedFlag ?? '').trim())) {
    return 'Archived';
  }
  if (activeFlag === false || /^(?:0|false|no|n)$/i.test(String(activeFlag ?? '').trim())) {
    return 'Archived';
  }
  return 'Active';
}

/**
 * Pluralizes singular offspring/species labels cleanly (e.g., Puppy -> Puppies, Kit -> Kits, Calf -> Calves).
 */
export function pluralizeSpeciesLabel(label: string): string {
  const clean = (label || 'Baby').trim();
  if (!clean) return 'Babies';
  const lower = clean.toLowerCase();
  if (lower.endsWith('s') || lower.endsWith('x') || lower.endsWith('ch') || lower.endsWith('sh')) {
    return `${clean}es`;
  }
  if (lower.endsWith('calf')) {
    return `${clean.slice(0, -1)}ves`;
  }
  if (lower.endsWith('y') && !/[aeiou]y$/i.test(clean)) {
    return `${clean.slice(0, -1)}ies`;
  }
  return `${clean}s`;
}

/**
 * Prepends an optional species default prefix to a new animal name unless it already starts with it.
 * Honors delimiter-terminated prefixes such as `OR-` or `CC:` without inserting an unwanted space.
 */
export function applyAnimalNamePrefix(name: string, prefix?: string): string {
  const cleanName = (name || '').trim();
  const cleanPrefix = (prefix || '').trim();
  if (!cleanPrefix || !cleanName) return cleanName;
  if (cleanName.toLowerCase().startsWith(cleanPrefix.toLowerCase())) {
    return cleanName;
  }
  const endsWithPunct = /[-_:/#']$/.test(cleanPrefix);
  return endsWithPunct ? `${cleanPrefix}${cleanName}` : `${cleanPrefix} ${cleanName}`;
}

export const applySpeciesNamePrefix = applyAnimalNamePrefix;

/**
 * Formats weight in `lbs_oz`, decimal `lbs`, or `grams`.
 */
export function formatWeight(weightGrams: number, unit: WeightUnit): string {
  if (!weightGrams || weightGrams <= 0) return 'Unweighed';
  if (unit === 'grams') {
    return `${Math.round(weightGrams).toLocaleString()} g`;
  }
  const totalOunces = weightGrams / 28.349523125;
  if (unit === 'lbs') {
    return `${(totalOunces / 16).toFixed(1)} lbs`;
  }
  const lbs = Math.floor(totalOunces / 16);
  const oz = Math.round(totalOunces - lbs * 16);
  if (oz === 16) {
    return `${lbs + 1} lb 0 oz`;
  }
  return `${lbs} lb ${oz} oz`;
}

/**
 * Parses a weight input string in the user's preferred unit back into integer grams.
 */
export function parseWeightInputToGrams(input: string, unit: WeightUnit): number {
  const clean = input.trim();
  if (!clean) return 0;
  const numeric = Number(clean);
  if (Number.isNaN(numeric) || numeric <= 0) return 0;
  if (unit === 'grams') return Math.round(numeric);
  return Math.round(numeric * 453.59237);
}

/**
 * Formats an ISO `YYYY-MM-DD` date into a readable label (`Nov 14, 2026`).
 */
export function formatReadableDate(dateIso: string): string {
  if (!dateIso) return 'Unset';
  const parts = dateIso.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return dateIso;
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Predefined starter livestock species with authentic gestation, weaning, rebreeding,
 * sex/birth terminology, and cascading Master Task List care templates.
 */
export const PREDEFINED_SPECIES_PRESETS: Omit<SpeciesProfile, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'species-rabbit',
    name: 'Rabbit',
    gestationDays: 31,
    rebreedDaysAfterBirth: 28,
    weanDaysAfterBirth: 42,
    birthEventLabel: 'Kindling',
    maleLabel: 'Buck',
    femaleLabel: 'Doe',
    offspringLabel: 'Kit',
    exampleBreeds: [
      'New Zealand Red',
      'New Zealand White',
      'Californian',
      'Rex',
      'Holland Lop',
      'Flemish Giant',
    ],
    milestones: [
      {
        label: 'Palpation Check',
        relativeTo: 'AFTER_BRED',
        daysOffset: 14,
        category: 'Palpation',
        priority: 'High',
      },
      {
        label: 'Place Nestbox',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 3,
        category: 'Nestbox',
        priority: 'High',
      },
      {
        label: 'Expected Kindling Check & Kit Count',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 0,
        category: 'Birth Check',
        priority: 'High',
      },
      {
        label: 'Remove Clean Nestbox',
        relativeTo: 'AFTER_BIRTH',
        daysOffset: 21,
        category: 'Nestbox',
        priority: 'Normal',
      },
    ],
  },
  {
    id: 'species-goat',
    name: 'Goat',
    gestationDays: 150,
    rebreedDaysAfterBirth: 120,
    weanDaysAfterBirth: 60,
    birthEventLabel: 'Kidding',
    maleLabel: 'Buck',
    femaleLabel: 'Doe',
    offspringLabel: 'Kid',
    exampleBreeds: ['Nigerian Dwarf', 'Nubian', 'Boer', 'Alpine', 'LaMancha'],
    milestones: [
      {
        label: 'Pregnancy / Blood or Ultrasound Check',
        relativeTo: 'AFTER_BRED',
        daysOffset: 35,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'CDT & BoSe Pre-Kidding Booster',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 28,
        category: 'Health',
        priority: 'High',
      },
      {
        label: 'Prep Kidding Stall & Kit',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 7,
        category: 'Nestbox',
        priority: 'High',
      },
    ],
  },
  {
    id: 'species-sheep',
    name: 'Sheep',
    gestationDays: 147,
    rebreedDaysAfterBirth: 150,
    weanDaysAfterBirth: 60,
    birthEventLabel: 'Lambing',
    maleLabel: 'Ram',
    femaleLabel: 'Ewe',
    offspringLabel: 'Lamb',
    exampleBreeds: ['Katahdin', 'Dorper', 'Suffolk', 'Babydoll Southdown', 'Hampshire'],
    milestones: [
      {
        label: 'Scanning / Pregnancy Confirmation',
        relativeTo: 'AFTER_BRED',
        daysOffset: 45,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'Crutching, Vaccination & Hoof Trim',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 14,
        category: 'Health',
        priority: 'Normal',
      },
      {
        label: 'Prepare Lambing Jug',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 5,
        category: 'Nestbox',
        priority: 'High',
      },
    ],
  },
  {
    id: 'species-swine',
    name: 'Swine / Pig',
    gestationDays: 114,
    rebreedDaysAfterBirth: 35,
    weanDaysAfterBirth: 28,
    birthEventLabel: 'Farrowing',
    maleLabel: 'Boar',
    femaleLabel: 'Sow',
    offspringLabel: 'Piglet',
    exampleBreeds: ['Berkshire', 'Kunekune', 'Duroc', 'Hampshire', 'Mangalica'],
    milestones: [
      {
        label: '21-Day Heat Return / Pregnancy Check',
        relativeTo: 'AFTER_BRED',
        daysOffset: 21,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'Move to Farrowing Pen',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 5,
        category: 'Nestbox',
        priority: 'High',
      },
      {
        label: 'Piglet Iron & Navel Check',
        relativeTo: 'AFTER_BIRTH',
        daysOffset: 3,
        category: 'Health',
        priority: 'High',
      },
    ],
  },
  {
    id: 'species-cattle',
    name: 'Cattle',
    gestationDays: 283,
    rebreedDaysAfterBirth: 60,
    weanDaysAfterBirth: 205,
    birthEventLabel: 'Calving',
    maleLabel: 'Bull',
    femaleLabel: 'Cow',
    offspringLabel: 'Calf',
    exampleBreeds: ['Dexter', 'Highland', 'Jersey', 'Angus', 'Hereford'],
    milestones: [
      {
        label: 'Pregnancy Palpation / Ultrasound',
        relativeTo: 'AFTER_BRED',
        daysOffset: 40,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'Dry-Off & Close-Up Mineral Check',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 60,
        category: 'Care',
        priority: 'Normal',
      },
      {
        label: 'Move to Calving Paddock',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 14,
        category: 'Nestbox',
        priority: 'High',
      },
    ],
  },
  {
    id: 'species-guinea-pig',
    name: 'Guinea Pig',
    gestationDays: 68,
    rebreedDaysAfterBirth: 45,
    weanDaysAfterBirth: 21,
    birthEventLabel: 'Birth',
    maleLabel: 'Boar',
    femaleLabel: 'Sow',
    offspringLabel: 'Pup',
    exampleBreeds: ['Abyssinian', 'American', 'Peruvian', 'Teddy', 'Silkie'],
    milestones: [
      {
        label: 'Gentle Weight & Belly Check',
        relativeTo: 'AFTER_BRED',
        daysOffset: 28,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'Separate Boar & Add Deep Bedding',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 4,
        category: 'Nestbox',
        priority: 'High',
      },
    ],
  },
  {
    id: 'species-chinchilla',
    name: 'Chinchilla',
    gestationDays: 111,
    rebreedDaysAfterBirth: 60,
    weanDaysAfterBirth: 56,
    birthEventLabel: 'Birth',
    maleLabel: 'Buck',
    femaleLabel: 'Doe',
    offspringLabel: 'Kit',
    exampleBreeds: ['Standard Gray', 'Violet', 'Beige', 'Black Velvet', 'White Mosaic'],
    milestones: [
      {
        label: 'Weight Gain Check',
        relativeTo: 'AFTER_BRED',
        daysOffset: 45,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'Install Kit-Safe Cage Mesh & Remove Ledges',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 5,
        category: 'Nestbox',
        priority: 'High',
      },
    ],
  },
  {
    id: 'species-ferret',
    name: 'Ferret',
    gestationDays: 42,
    rebreedDaysAfterBirth: 60,
    weanDaysAfterBirth: 49,
    birthEventLabel: 'Whelping',
    maleLabel: 'Hob',
    femaleLabel: 'Jill',
    offspringLabel: 'Kit',
    exampleBreeds: ['Sable', 'Cinnamon', 'Silver', 'Blaze', 'Albino'],
    milestones: [
      {
        label: 'Abdominal Palpation Check',
        relativeTo: 'AFTER_BRED',
        daysOffset: 16,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'Prepare Quiet Whelping Box',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 5,
        category: 'Nestbox',
        priority: 'High',
      },
    ],
  },
  {
    id: 'species-alpaca',
    name: 'Alpaca',
    gestationDays: 345,
    rebreedDaysAfterBirth: 21,
    weanDaysAfterBirth: 180,
    birthEventLabel: 'Unpacking',
    maleLabel: 'Macho',
    femaleLabel: 'Hembra',
    offspringLabel: 'Cria',
    exampleBreeds: ['Huacaya', 'Suri'],
    milestones: [
      {
        label: 'Spit-Off & Ultrasound Confirmation',
        relativeTo: 'AFTER_BRED',
        daysOffset: 45,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'Prep Birthing Pasture & Cria Coat Kit',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 14,
        category: 'Nestbox',
        priority: 'High',
      },
    ],
  },
];

/**
 * Resolves a `SpeciesProfile` by name from configured profiles, falling back to presets or defaults.
 */
export function resolveSpeciesProfile(
  speciesName: string,
  configured: SpeciesProfile[]
): SpeciesProfile {
  const clean = (speciesName || 'Rabbit').trim() || 'Rabbit';
  const found = configured.find((sp) => isSameSpecies(sp.name, clean));
  if (found) return found;

  const preset = PREDEFINED_SPECIES_PRESETS.find((p) => isSameSpecies(p.name, clean));
  const ts = nowIsoUtc();
  if (preset) {
    return { ...preset, createdAt: ts, updatedAt: ts };
  }

  return {
    id: `species-${clean.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: clean,
    gestationDays: 30,
    rebreedDaysAfterBirth: 30,
    weanDaysAfterBirth: 42,
    birthEventLabel: 'Birth',
    maleLabel: 'Male',
    femaleLabel: 'Female',
    offspringLabel: 'Offspring',
    exampleBreeds: [],
    milestones: [
      {
        label: 'Prepare Birthing Area',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 3,
        category: 'Nestbox',
        priority: 'High',
      },
    ],
    createdAt: ts,
    updatedAt: ts,
  };
}
