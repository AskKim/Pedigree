/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
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

export type AnimalConflictKind = 'duplicate_tattoo' | 'parent_sex_mismatch';

export function normalizeIgnoredConflicts(raw: unknown): AnimalConflictKind[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<AnimalConflictKind>();
  for (const item of raw) {
    if (item === 'duplicate_tattoo' || item === 'parent_sex_mismatch') {
      seen.add(item);
    }
  }
  return Array.from(seen);
}

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

export type WeightUnit = 'lbs_oz' | 'lbs' | 'grams' | 'kg';

export const WEIGHT_UNIT_OPTIONS: ReadonlyArray<{ value: WeightUnit; label: string; shortLabel: string }> = [
  { value: 'lbs_oz', label: 'Pounds & Oz', shortLabel: 'lbs / oz' },
  { value: 'lbs', label: 'Decimal Pounds', shortLabel: 'lbs' },
  { value: 'kg', label: 'Kilograms (Metric)', shortLabel: 'kg' },
  { value: 'grams', label: 'Grams (Metric)', shortLabel: 'g' },
];

export function normalizeWeightUnit(raw: unknown, fallback: WeightUnit = 'lbs_oz'): WeightUnit {
  if (raw === 'lbs_oz' || raw === 'lbs' || raw === 'grams' || raw === 'kg') {
    return raw;
  }
  return fallback;
}

export type CareLogType =
  | 'Weight Check'
  | 'Show / Leg'
  | 'Palpation'
  | 'Ultrasound'
  | 'Health / Vet'
  | 'Health Score / BCS'
  | 'Grooming & Hoof'
  | 'Journal Note';

export type OwnershipType = 'Owned' | 'Reference' | 'Outside';

export const OWNERSHIP_TYPES: ReadonlyArray<{ value: OwnershipType; label: string }> = [
  { value: 'Owned', label: 'Owned in My Barn' },
  { value: 'Reference', label: 'Pedigree Reference' },
  { value: 'Outside', label: 'Outside Stock' },
];

export function normalizeOwnershipType(
  raw: unknown,
  fallback: OwnershipType = 'Owned'
): OwnershipType {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  if (clean === 'owned' || clean === 'in barn' || clean === 'my barn') return 'Owned';
  if (clean === 'reference' || clean === 'pedigree reference') return 'Reference';
  if (clean === 'outside' || clean === 'outside stock') return 'Outside';
  return fallback;
}

export type ServiceFeeDirection = 'earned' | 'paid' | 'none';

export function normalizeServiceFeeDirection(raw: unknown): ServiceFeeDirection {
  if (raw === 'earned' || raw === 'paid' || raw === 'none') return raw;
  return 'none';
}

export type UltrasoundResult = '' | 'Positive' | 'Negative' | 'Inconclusive';

export const ULTRASOUND_RESULTS: ReadonlyArray<{ value: UltrasoundResult; label: string }> = [
  { value: '', label: 'Not recorded' },
  { value: 'Positive', label: 'Positive (Pregnant)' },
  { value: 'Negative', label: 'Negative (Open)' },
  { value: 'Inconclusive', label: 'Inconclusive / Recheck' },
];

export function normalizeUltrasoundResult(raw: unknown): UltrasoundResult {
  if (typeof raw !== 'string') return '';
  const clean = raw.trim().toLowerCase();
  if (clean === 'positive' || clean === 'pregnant' || clean === 'pos' || clean === '+') {
    return 'Positive';
  }
  if (clean === 'negative' || clean === 'open' || clean === 'neg' || clean === '-') {
    return 'Negative';
  }
  if (clean === 'inconclusive' || clean === 'recheck') {
    return 'Inconclusive';
  }
  return '';
}

export function normalizeCurrencyCode(raw: unknown, fallback = 'USD'): string {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(clean) ? clean : fallback;
}

export function formatCurrencyCents(
  cents: number | undefined,
  currencyCode = 'USD'
): string {
  const safeCents = Number.isFinite(Number(cents)) ? Math.round(Number(cents)) : 0;
  const amount = safeCents / 100;
  const code = normalizeCurrencyCode(currencyCode, 'USD');
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

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
 * Polygenic red/amber pigment richness modifier (tracked independently of Mendelian Wide-Band `ww`).
 */
export type RufusLevel = '' | 'Low' | 'Medium' | 'High';

export const RUFUS_LEVEL_OPTIONS: ReadonlyArray<{ value: RufusLevel; label: string }> = [
  { value: '', label: 'Unspecified' },
  { value: 'High', label: 'High Rufus (Deep Rich Red)' },
  { value: 'Medium', label: 'Medium Rufus' },
  { value: 'Low', label: 'Low Rufus (Pale / Washy)' },
];

export function normalizeRufusLevel(raw: unknown): RufusLevel {
  if (typeof raw !== 'string') return '';
  const clean = raw.trim().toLowerCase();
  if (clean === 'high' || clean === 'high rufus') return 'High';
  if (clean === 'medium' || clean === 'med' || clean === 'medium rufus') return 'Medium';
  if (clean === 'low' || clean === 'low rufus') return 'Low';
  return '';
}

export type ClearedCarrierProofType =
  | 'test_bred'
  | 'dna_tested'
  | 'homozygous_locus'
  | 'breeder_verified';

export const CLEARED_CARRIER_PROOF_LABELS: Record<ClearedCarrierProofType, string> = {
  test_bred: 'Test Bred (Clear)',
  dna_tested: 'DNA Tested Clear',
  homozygous_locus: 'Verified Homozygous Coat Locus',
  breeder_verified: 'Breeder Verified Clear',
};

export interface ClearedCarrierRecord {
  trait: string;
  proofType: ClearedCarrierProofType;
  testBreedingCount?: number;
  note?: string;
  recordedAt?: string;
}

export type SpeciesHubBlockId = 'tasks' | 'breedings' | 'cages' | 'feed' | 'shows';

export const DEFAULT_SPECIES_HUB_BLOCK_ORDER: SpeciesHubBlockId[] = [
  'tasks',
  'breedings',
  'cages',
  'feed',
  'shows',
];

export function normalizeSpeciesHubBlockOrder(raw?: unknown): SpeciesHubBlockId[] {
  const allowed = new Set<SpeciesHubBlockId>(DEFAULT_SPECIES_HUB_BLOCK_ORDER);
  const ordered: SpeciesHubBlockId[] = [];
  const seen = new Set<SpeciesHubBlockId>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string' && allowed.has(item as SpeciesHubBlockId)) {
        const id = item as SpeciesHubBlockId;
        if (!seen.has(id)) {
          seen.add(id);
          ordered.push(id);
        }
      }
    }
  }
  for (const defId of DEFAULT_SPECIES_HUB_BLOCK_ORDER) {
    if (!seen.has(defId)) {
      ordered.push(defId);
    }
  }
  return ordered;
}

export type CalendarDeliveryMode =
  | 'offline_ics'
  | 'google_calendar'
  | 'external_app_or_ics';

export interface CalendarSyncSettings {
  autoAddNewTasks: boolean;
  includeBreedingTasks: boolean;
  includeManualTasks: boolean;
  reminderTimeLocal: string;
  alarmEnabled: boolean;
  alarmMinutesBefore: number;
  includeAnimalPrefix: boolean;
  includeAnimalName: boolean;
  deliveryMode: CalendarDeliveryMode;
  googleCalendarId: string;
  googleCalendarName: string;
}

export const DEFAULT_CALENDAR_SYNC_SETTINGS: CalendarSyncSettings = {
  autoAddNewTasks: false,
  includeBreedingTasks: true,
  includeManualTasks: true,
  reminderTimeLocal: '08:00',
  alarmEnabled: true,
  alarmMinutesBefore: 15,
  includeAnimalPrefix: true,
  includeAnimalName: true,
  deliveryMode: 'offline_ics',
  googleCalendarId: 'primary',
  googleCalendarName: 'Primary Google Calendar',
};

export function normalizeCalendarSyncSettings(raw?: unknown): CalendarSyncSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawTime = typeof obj.reminderTimeLocal === 'string' ? obj.reminderTimeLocal.trim() : '';
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime)
    ? rawTime
    : DEFAULT_CALENDAR_SYNC_SETTINGS.reminderTimeLocal;
  const rawLead = Number(obj.alarmMinutesBefore);
  const validLead =
    Number.isFinite(rawLead) && rawLead >= 0
      ? Math.round(rawLead)
      : DEFAULT_CALENDAR_SYNC_SETTINGS.alarmMinutesBefore;
  const rawDelivery = obj.deliveryMode;
  const validDelivery: CalendarDeliveryMode =
    rawDelivery === 'google_calendar' ||
    rawDelivery === 'external_app_or_ics' ||
    rawDelivery === 'offline_ics'
      ? rawDelivery
      : DEFAULT_CALENDAR_SYNC_SETTINGS.deliveryMode;
  const rawCalId =
    typeof obj.googleCalendarId === 'string' && obj.googleCalendarId.trim()
      ? obj.googleCalendarId.trim()
      : DEFAULT_CALENDAR_SYNC_SETTINGS.googleCalendarId;
  const rawCalName =
    typeof obj.googleCalendarName === 'string' && obj.googleCalendarName.trim()
      ? obj.googleCalendarName.trim()
      : DEFAULT_CALENDAR_SYNC_SETTINGS.googleCalendarName;

  return {
    autoAddNewTasks:
      typeof obj.autoAddNewTasks === 'boolean'
        ? obj.autoAddNewTasks
        : DEFAULT_CALENDAR_SYNC_SETTINGS.autoAddNewTasks,
    includeBreedingTasks:
      typeof obj.includeBreedingTasks === 'boolean'
        ? obj.includeBreedingTasks
        : DEFAULT_CALENDAR_SYNC_SETTINGS.includeBreedingTasks,
    includeManualTasks:
      typeof obj.includeManualTasks === 'boolean'
        ? obj.includeManualTasks
        : DEFAULT_CALENDAR_SYNC_SETTINGS.includeManualTasks,
    reminderTimeLocal: validTime,
    alarmEnabled:
      typeof obj.alarmEnabled === 'boolean'
        ? obj.alarmEnabled
        : DEFAULT_CALENDAR_SYNC_SETTINGS.alarmEnabled,
    alarmMinutesBefore: validLead,
    includeAnimalPrefix:
      typeof obj.includeAnimalPrefix === 'boolean'
        ? obj.includeAnimalPrefix
        : DEFAULT_CALENDAR_SYNC_SETTINGS.includeAnimalPrefix,
    includeAnimalName:
      typeof obj.includeAnimalName === 'boolean'
        ? obj.includeAnimalName
        : DEFAULT_CALENDAR_SYNC_SETTINGS.includeAnimalName,
    deliveryMode: validDelivery,
    googleCalendarId: rawCalId,
    googleCalendarName: rawCalName,
  };
}

/**
 * Global Barn preferences stored locally on the user's device.
 * `pinnedLandingSpecies`:
 *   - `""` (empty string) opens on the Multi-Species Home Landing Page.
 *   - Any configured species name (e.g. `"Rabbit"`, `"Goat"`) opens directly inside that species' hub.
 */
export type DefaultPedigreeGenerations = 3 | 4 | 5 | 6;
export type PedigreeGenerationDepth = 3 | 4 | 5 | 6 | 7 | 8;

export function normalizePedigreeGenerationDepth(
  value: unknown,
  fallback: PedigreeGenerationDepth = 3
): PedigreeGenerationDepth {
  const n = Number(value);
  if (n === 3 || n === 4 || n === 5 || n === 6 || n === 7 || n === 8) {
    return n;
  }
  return fallback;
}

export function normalizeDefaultPedigreeGenerations(
  value: unknown,
  fallback: DefaultPedigreeGenerations = 3
): DefaultPedigreeGenerations {
  const n = Number(value);
  if (n === 3 || n === 4 || n === 5 || n === 6) {
    return n;
  }
  return fallback;
}

export interface BarnSettings {
  id: string;
  barnName: string;
  breederName: string;
  preferredUnit: WeightUnit;
  currencyCode?: string;
  defaultSpecies: string;
  pinnedLandingSpecies: string;
  defaultGenerations: DefaultPedigreeGenerations;
  themeMode: 'light' | 'dark';
  customColors?: CustomThemeColors;
  imageOptimizationPreset?: ImageOptimizationPresetId;
  showHomeSummaryGrid?: boolean;
  barnNameOnboarded?: boolean;
  ignoredTaskIds?: string[];
  dismissedTaskGroupKeys?: Record<string, string | string[]>;
  dismissedMemoAlertSignatures?: Record<string, string>;
  speciesHubBlockOrder?: Record<string, SpeciesHubBlockId[]>;
  includePhotoOnPedigree?: boolean;
  breederLogoDataUrl?: string;
  calendarSync?: CalendarSyncSettings;
  autoOffloadRetiredToOpfs?: boolean;
  feedTagPurgeWindowDays?: FeedPurgeWindowDays;
  lastBackupMeta?: {
    exportedAtIso: string;
    format: 'zip' | 'sqlite' | 'json';
    fileName?: string;
  };
  backupReminderSnoozedUntilMs?: number;
  _rev?: number;
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

export interface BreedMilestoneOffsetOverride {
  label: string;
  daysOffset: number;
}

export interface BreedScheduleOverride {
  breed: string;
  gestationDays?: number;
  weanDaysAfterBirth?: number;
  rebreedDaysAfterBirth?: number;
  maturityDays?: number;
  milestoneOverrides?: BreedMilestoneOffsetOverride[];
}

export function normalizeBreedScheduleOverrides(raw: unknown): BreedScheduleOverride[] {
  if (!Array.isArray(raw)) return [];
  const byBreedKey = new Map<string, BreedScheduleOverride>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const obj = entry as Record<string, unknown>;
    const breed = typeof obj.breed === 'string' ? obj.breed.trim().slice(0, 120) : '';
    if (!breed) continue;

    const cleanPosInt = (val: unknown, max: number): number | undefined => {
      if (val === undefined || val === null || val === '') return undefined;
      const n = Number(val);
      if (!Number.isFinite(n) || n <= 0) return undefined;
      return Math.min(max, Math.max(1, Math.round(n)));
    };
    const cleanNonNegInt = (val: unknown, max: number): number | undefined => {
      if (val === undefined || val === null || val === '') return undefined;
      const n = Number(val);
      if (!Number.isFinite(n) || n < 0) return undefined;
      return Math.min(max, Math.round(n));
    };

    const gestationDays = cleanPosInt(obj.gestationDays, 750);
    const weanDaysAfterBirth = cleanPosInt(obj.weanDaysAfterBirth, 600);
    const rebreedDaysAfterBirth = cleanNonNegInt(obj.rebreedDaysAfterBirth, 600);
    const maturityDays = cleanPosInt(obj.maturityDays, 1500);

    let milestoneOverrides: BreedMilestoneOffsetOverride[] | undefined;
    if (Array.isArray(obj.milestoneOverrides)) {
      const byLabelKey = new Map<string, BreedMilestoneOffsetOverride>();
      for (const mo of obj.milestoneOverrides) {
        if (!mo || typeof mo !== 'object' || Array.isArray(mo)) continue;
        const mObj = mo as Record<string, unknown>;
        const label = typeof mObj.label === 'string' ? mObj.label.trim().slice(0, 120) : '';
        const daysNum = Number(mObj.daysOffset);
        if (!label || !Number.isFinite(daysNum) || daysNum < 0) continue;
        byLabelKey.set(label.toLowerCase(), {
          label,
          daysOffset: Math.min(700, Math.round(daysNum)),
        });
      }
      if (byLabelKey.size > 0) {
        milestoneOverrides = Array.from(byLabelKey.values());
      }
    }

    if (
      gestationDays === undefined &&
      weanDaysAfterBirth === undefined &&
      rebreedDaysAfterBirth === undefined &&
      maturityDays === undefined &&
      (!milestoneOverrides || milestoneOverrides.length === 0)
    ) {
      continue;
    }

    const clean: BreedScheduleOverride = { breed };
    if (gestationDays !== undefined) clean.gestationDays = gestationDays;
    if (weanDaysAfterBirth !== undefined) clean.weanDaysAfterBirth = weanDaysAfterBirth;
    if (rebreedDaysAfterBirth !== undefined) clean.rebreedDaysAfterBirth = rebreedDaysAfterBirth;
    if (maturityDays !== undefined) clean.maturityDays = maturityDays;
    if (milestoneOverrides && milestoneOverrides.length > 0) {
      clean.milestoneOverrides = milestoneOverrides;
    }
    byBreedKey.set(breed.toLowerCase(), clean);
  }
  return Array.from(byBreedKey.values()).sort((a, b) => a.breed.localeCompare(b.breed));
}

export interface TargetWeightPoint {
  ageDays: number;
  weightGrams: number;
  label?: string;
}

export function normalizeTargetWeightCurve(raw: unknown): TargetWeightPoint[] {
  if (!Array.isArray(raw)) return [];
  const byAge = new Map<number, TargetWeightPoint>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const obj = entry as Record<string, unknown>;
    const ageNum = Number(obj.ageDays);
    const weightNum = Number(obj.weightGrams);
    if (!Number.isFinite(ageNum) || ageNum < 0 || !Number.isFinite(weightNum) || weightNum <= 0) {
      continue;
    }
    const ageDays = Math.min(2000, Math.round(ageNum));
    const weightGrams = Math.round(weightNum);
    const label = typeof obj.label === 'string' ? obj.label.trim().slice(0, 60) : '';
    byAge.set(ageDays, {
      ageDays,
      weightGrams,
      ...(label ? { label } : {}),
    });
  }
  return Array.from(byAge.values()).sort((a, b) => a.ageDays - b.ageDays);
}

/**
 * Livestock species biological schedule, sex/offspring terminology, and Master Task List templates.
 */
export interface SpeciesProfile {
  id: string;
  name: string;
  sortOrder?: number;
  defaultAnimalPrefix?: string;
  preferredUnit?: WeightUnit;
  memoText?: string;
  memoUpdatedAt?: string;
  gestationDays: number;
  rebreedDaysAfterBirth: number;
  weanDaysAfterBirth: number;
  maturityDays?: number;
  birthEventLabel: string;
  maleLabel: string;
  femaleLabel: string;
  offspringLabel: string;
  exampleBreeds: string[];
  milestones: SpeciesMilestoneTemplate[];
  breedOverrides?: BreedScheduleOverride[];
  targetWeightCurve?: TargetWeightPoint[];
  _rev?: number;
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
  needsAttention?: boolean;
  ignoredConflicts?: AnimalConflictKind[];
  birthDateIso: string; // YYYY-MM-DD or ""
  weightGrams: number;
  genotype: GenotypeAllelePair[];
  genotypeRaw: string;
  rufusLevel?: RufusLevel;
  suspectedCarrierOf?: string[];
  confirmedCarrierOf?: string[];
  clearedCarrierOf?: ClearedCarrierRecord[];
  registrationNumber: string;
  grandChampionNumber: string;
  legsCount: number;
  cageLocation: string;
  breederName: string;
  ownerName: string;
  ownershipType?: OwnershipType;
  culled?: boolean;
  cullDateIso?: string;
  cullReason?: string;
  deceasedDateIso?: string;
  deathCause?: string;
  soldDateIso?: string;
  salePriceCents?: number;
  purchaseCostCents?: number;
  buyerName?: string;
  sireId: string;
  damId: string;
  notes: string;
  offloadedArchiveKey?: string;
  offloadedAtIso?: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export type HousingUnitType = 'hutch' | 'cage' | 'pen' | 'stall' | 'pasture' | 'colony';

export const HOUSING_UNIT_TYPES: ReadonlyArray<{ value: HousingUnitType; label: string }> = [
  { value: 'hutch', label: 'Hutch' },
  { value: 'cage', label: 'Cage' },
  { value: 'pen', label: 'Pen' },
  { value: 'stall', label: 'Stall' },
  { value: 'pasture', label: 'Pasture / Paddock' },
  { value: 'colony', label: 'Colony / Group Run' },
];

export function normalizeHousingUnitType(raw: unknown): HousingUnitType | undefined {
  if (typeof raw !== 'string') return undefined;
  const clean = raw.trim().toLowerCase();
  if (
    clean === 'hutch' ||
    clean === 'cage' ||
    clean === 'pen' ||
    clean === 'stall' ||
    clean === 'pasture' ||
    clean === 'colony'
  ) {
    return clean;
  }
  return undefined;
}

/**
 * Physical cage, hutch, pen, stall, or pasture location scoped to a species.
 * Optional feedlot inventory and recurring maintenance fields power the visual Facility Pen Board.
 */
export interface CageLocation {
  id: string;
  species: string;
  label: string;
  section: string;
  capacity: number;
  notes: string;
  unitType?: HousingUnitType;
  feedLotName?: string;
  feedStockRemaining?: number;
  feedStockUnit?: string;
  dailyRationNote?: string;
  feedLowThreshold?: number;
  maintenanceIntervalDays?: number;
  maintenanceTaskLabel?: string;
  lastMaintenanceDateIso?: string; // YYYY-MM-DD or ""
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LitterWeightMilestone {
  id: string;
  ageDays: number;
  dateIso?: string;
  label: string;
  liveCount?: number;
  totalWeightGrams: number;
  avgWeightGrams?: number;
  notes?: string;
}

export function normalizeLitterWeightMilestones(raw: unknown): LitterWeightMilestone[] {
  if (!Array.isArray(raw)) return [];
  const seenIds = new Set<string>();
  const out: LitterWeightMilestone[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const obj = entry as Record<string, unknown>;
    const ageNum = Number(obj.ageDays);
    if (!Number.isFinite(ageNum) || ageNum < 0) continue;
    const ageDays = Math.min(1000, Math.round(ageNum));
    const totalNum = Number(obj.totalWeightGrams);
    const avgNum = Number(obj.avgWeightGrams);
    const liveNum = Number(obj.liveCount);
    const liveCount =
      Number.isFinite(liveNum) && liveNum >= 0 ? Math.min(50, Math.round(liveNum)) : undefined;
    let totalWeightGrams =
      Number.isFinite(totalNum) && totalNum > 0 ? Math.round(totalNum) : 0;
    let avgWeightGrams =
      Number.isFinite(avgNum) && avgNum > 0 ? Math.round(avgNum) : undefined;
    if (totalWeightGrams <= 0 && avgWeightGrams && liveCount && liveCount > 0) {
      totalWeightGrams = Math.round(avgWeightGrams * liveCount);
    }
    if (avgWeightGrams === undefined && totalWeightGrams > 0 && liveCount && liveCount > 0) {
      avgWeightGrams = Math.round(totalWeightGrams / liveCount);
    }
    if (totalWeightGrams <= 0 && !avgWeightGrams && liveCount === undefined) continue;
    const rawId = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim().slice(0, 80) : `lwm-${ageDays}-${i + 1}`;
    const id = seenIds.has(rawId) ? `${rawId}-${i + 1}` : rawId;
    seenIds.add(id);
    const dateIso =
      typeof obj.dateIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.dateIso.trim())
        ? obj.dateIso.trim()
        : undefined;
    const label =
      typeof obj.label === 'string' && obj.label.trim()
        ? obj.label.trim().slice(0, 80)
        : `${ageDays}-Day Check`;
    const notes = typeof obj.notes === 'string' && obj.notes.trim() ? obj.notes.trim().slice(0, 300) : undefined;
    out.push({
      id,
      ageDays,
      ...(dateIso ? { dateIso } : {}),
      label,
      ...(liveCount !== undefined ? { liveCount } : {}),
      totalWeightGrams,
      ...(avgWeightGrams !== undefined ? { avgWeightGrams } : {}),
      ...(notes ? { notes } : {}),
    });
  }
  return out.sort((a, b) => a.ageDays - b.ageDays);
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
  serviceFeeCents?: number;
  serviceFeeDirection?: ServiceFeeDirection;
  ultrasoundDateIso?: string;
  ultrasoundResult?: UltrasoundResult;
  ultrasoundFetalCount?: number;
  ultrasoundProjectedDueIso?: string;
  litterWeightMilestones?: LitterWeightMilestone[];
  notes: string;
  _rev?: number;
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
  _rev?: number;
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
  medicationName?: string;
  dosage?: string;
  administrationRoute?: string;
  withdrawalDays?: number;
  withdrawalClearDateIso?: string;
  bodyConditionScore?: number;
  famachaScore?: number;
  fecalEggCount?: number;
  ultrasoundResult?: UltrasoundResult;
  ultrasoundFetalCount?: number;
  notes: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export type ShowAwardCode = 'BOB' | 'BOS' | 'BIS' | 'GCH' | 'BOV' | 'BOSV' | 'RIS';

export const SHOW_AWARD_OPTIONS: ReadonlyArray<{
  code: ShowAwardCode;
  label: string;
  shortLabel: string;
}> = [
  { code: 'BOB', label: 'Best of Breed (BOB)', shortLabel: 'BOB' },
  { code: 'BOS', label: 'Best of Opposite Sex (BOS)', shortLabel: 'BOS' },
  { code: 'BIS', label: 'Best in Show (BIS)', shortLabel: 'BIS' },
  { code: 'GCH', label: 'Grand Champion (GCH)', shortLabel: 'GCH' },
  { code: 'BOV', label: 'Best of Variety (BOV)', shortLabel: 'BOV' },
  { code: 'BOSV', label: 'Best Opposite Variety (BOSV)', shortLabel: 'BOSV' },
  { code: 'RIS', label: 'Reserve in Show (RIS)', shortLabel: 'RIS' },
];

export interface ShowELegAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  storedBytes: number;
  thumbnailDataUrl: string;
  dataUrl: string;
  caption?: string;
  addedAtIso: string;
}

export interface ShowAnimalResult {
  animalId: string;
  classPlacement: string;
  awards: ShowAwardCode[];
  judgeName?: string;
  judgeNotes: string;
  legsEarned: number;
  pointsEarned?: number;
  legCertificateNumber?: string;
  eLegAttachments: ShowELegAttachment[];
}

/**
 * Livestock or ARBA show event with entered animal roster and structured placements/wins/e-leg vault,
 * scoped to a `species`.
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
  results?: ShowAnimalResult[];
  notes: string;
  _rev?: number;
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
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export type FeedPurgeWindowDays = 30 | 60 | 90 | 0;

export const FEED_PURGE_WINDOW_OPTIONS: ReadonlyArray<{
  days: FeedPurgeWindowDays;
  label: string;
  description: string;
}> = [
  { days: 30, label: '30 Days', description: 'Aggressive space savings after lot indexing' },
  { days: 60, label: '60 Days (Recommended)', description: 'Balanced biosecurity retention window' },
  { days: 90, label: '90 Days', description: 'Extended quarter-year tag photo retention' },
  { days: 0, label: 'Manual Purge Only', description: 'Keep tag photos until manually purged' },
];

export function normalizeFeedPurgeWindowDays(
  raw: unknown,
  fallback: FeedPurgeWindowDays = 60
): FeedPurgeWindowDays {
  const n = Number(raw);
  if (n === 30 || n === 60 || n === 90 || n === 0) return n;
  return fallback;
}

export type FeedAllocationTargetType = 'cage' | 'litter' | 'animal' | 'general';

/**
 * Purchased feed lot / batch record with active inventory, indexed mill lot number,
 * and biosecurity tag photo lifecycle (auto-purged after 30/60/90 days once lot is indexed).
 */
export interface FeedBatch {
  id: string;
  species: string;
  brand: string;
  productName: string;
  lotNumber: string;
  millCode: string;
  manufactureDateIso: string; // YYYY-MM-DD or ""
  purchaseDateIso: string; // YYYY-MM-DD
  bagCount: number;
  bagWeightValue: number;
  bagWeightUnit: string; // 'lbs' | 'kg' | 'bales' | 'bags' | etc.
  totalQuantity: number;
  remainingQuantity: number;
  lowStockThreshold: number;
  totalCostCents?: number;
  supplierName: string;
  proteinPercent?: number;
  notes: string;
  tagPhotoDataUrl?: string;
  tagPhotoThumbnailDataUrl?: string;
  tagPhotoMimeType?: string;
  tagPhotoBytes?: number;
  tagPhotoCapturedDateIso?: string; // YYYY-MM-DD
  tagPhotoPurgedAtIso?: string; // ISO UTC when raw/heavy image was purged
  tagPhotoBytesReclaimed?: number;
  ocrRawText?: string;
  ocrConfidence?: number;
  ocrManualOverride?: boolean;
  recallFlagged?: boolean;
  recallNote?: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Feed intake / allocation entry linked directly to a cage/pen, litter (breeding), animal, or barn group.
 */
export interface FeedAllocation {
  id: string;
  species: string;
  feedBatchId: string;
  targetType: FeedAllocationTargetType;
  targetId: string;
  targetLabel: string;
  dateIso: string; // YYYY-MM-DD
  quantity: number;
  unit: string;
  notes: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export type LedgerEntryType = 'expense' | 'income';

export type LedgerCategory =
  | 'feed'
  | 'bedding'
  | 'vet'
  | 'equipment'
  | 'processing'
  | 'show_entry'
  | 'supplies'
  | 'animal_sale'
  | 'stud_fee'
  | 'meat_pelt_sale'
  | 'grant_sponsor'
  | 'other';

export const LEDGER_CATEGORY_OPTIONS: ReadonlyArray<{
  value: LedgerCategory;
  label: string;
  defaultType: LedgerEntryType;
}> = [
  { value: 'feed', label: 'Feed & Supplements', defaultType: 'expense' },
  { value: 'bedding', label: 'Bedding & Litter', defaultType: 'expense' },
  { value: 'vet', label: 'Veterinary & Medication', defaultType: 'expense' },
  { value: 'equipment', label: 'Cages, Hutches & Equipment', defaultType: 'expense' },
  { value: 'processing', label: 'Butcher & Pelt Processing', defaultType: 'expense' },
  { value: 'show_entry', label: 'Show Entries & Travel', defaultType: 'expense' },
  { value: 'supplies', label: 'Barn Supplies & Tattoos', defaultType: 'expense' },
  { value: 'animal_sale', label: 'Animal / Offspring Sale', defaultType: 'income' },
  { value: 'stud_fee', label: 'Stud / Service Fee', defaultType: 'income' },
  { value: 'meat_pelt_sale', label: 'Meat & Pelt Sale', defaultType: 'income' },
  { value: 'grant_sponsor', label: 'Fair Premium / Grant / Sponsor', defaultType: 'income' },
  { value: 'other', label: 'Other Income / Expense', defaultType: 'expense' },
];

export function normalizeLedgerEntryType(
  raw: unknown,
  fallback: LedgerEntryType = 'expense'
): LedgerEntryType {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  if (clean === 'income' || clean === 'revenue' || clean === 'sale') return 'income';
  if (clean === 'expense' || clean === 'cost') return 'expense';
  return fallback;
}

export function normalizeLedgerCategory(
  raw: unknown,
  fallback: LedgerCategory = 'other'
): LedgerCategory {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  const valid = new Set<LedgerCategory>(LEDGER_CATEGORY_OPTIONS.map((o) => o.value));
  if (valid.has(clean as LedgerCategory)) {
    return clean as LedgerCategory;
  }
  if (clean.includes('feed')) return 'feed';
  if (clean.includes('bed')) return 'bedding';
  if (clean.includes('vet') || clean.includes('med')) return 'vet';
  if (clean.includes('equip') || clean.includes('cage') || clean.includes('hutch')) return 'equipment';
  if (clean.includes('process') || clean.includes('butcher')) return 'processing';
  if (clean.includes('show')) return 'show_entry';
  if (clean.includes('suppl')) return 'supplies';
  if (clean.includes('meat') || clean.includes('pelt')) return 'meat_pelt_sale';
  if (clean.includes('stud')) return 'stud_fee';
  if (clean.includes('grant') || clean.includes('premium')) return 'grant_sponsor';
  if (clean.includes('sale')) return 'animal_sale';
  return fallback;
}

/**
 * General barn income or expense entry with optional animal, litter, feed lot, or 4-H/FFA project
 * linkage and optional compressed receipt photo attachment.
 */
export interface LedgerEntry {
  id: string;
  species: string;
  dateIso: string; // YYYY-MM-DD
  entryType: LedgerEntryType;
  category: LedgerCategory;
  amountCents: number;
  title: string;
  vendorOrParty: string;
  linkedAnimalId?: string;
  linkedBreedingId?: string;
  linkedFeedBatchId?: string;
  linkedProjectId?: string;
  receiptPhotoDataUrl?: string;
  receiptPhotoThumbnailDataUrl?: string;
  receiptPhotoMimeType?: string;
  receiptPhotoBytes?: number;
  notes: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export type ProcessingStatus = 'Scheduled' | 'Processed' | 'Cancelled';

export type PeltGrade = '' | 'Prime' | 'No. 1' | 'No. 2' | 'No. 3' | 'Cull' | 'Not Saved';

export const PELT_GRADE_OPTIONS: ReadonlyArray<{ value: PeltGrade; label: string }> = [
  { value: '', label: 'Unspecified' },
  { value: 'Prime', label: 'Prime (Dense, Even Fur)' },
  { value: 'No. 1', label: 'No. 1 (Clean, Minor Flaws)' },
  { value: 'No. 2', label: 'No. 2 (Moderate Molt / Guard Hair)' },
  { value: 'No. 3', label: 'No. 3 (Heavy Molt / Craft Grade)' },
  { value: 'Cull', label: 'Cull / Damaged' },
  { value: 'Not Saved', label: 'Not Saved' },
];

export function normalizeProcessingStatus(
  raw: unknown,
  fallback: ProcessingStatus = 'Processed'
): ProcessingStatus {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  if (clean === 'scheduled' || clean === 'planned') return 'Scheduled';
  if (clean === 'cancelled' || clean === 'canceled') return 'Cancelled';
  if (clean === 'processed' || clean === 'harvested' || clean === 'completed') return 'Processed';
  return fallback;
}

export function normalizePeltGrade(raw: unknown): PeltGrade {
  if (typeof raw !== 'string') return '';
  const clean = raw.trim().toLowerCase();
  if (clean === 'prime') return 'Prime';
  if (clean === 'no. 1' || clean === 'no 1' || clean === '1' || clean === 'grade 1') return 'No. 1';
  if (clean === 'no. 2' || clean === 'no 2' || clean === '2' || clean === 'grade 2') return 'No. 2';
  if (clean === 'no. 3' || clean === 'no 3' || clean === '3' || clean === 'grade 3') return 'No. 3';
  if (clean === 'cull') return 'Cull';
  if (clean === 'not saved' || clean === 'none' || clean === 'discarded') return 'Not Saved';
  return '';
}

/**
 * Meat & Pelt processing log supporting scheduled butcher dates, harvest dates,
 * live-to-dressed carcass yield percentages, and pelt grading.
 */
export interface ProcessingLog {
  id: string;
  species: string;
  title: string;
  linkedAnimalId?: string;
  linkedBreedingId?: string;
  scheduledDateIso: string; // YYYY-MM-DD or ""
  harvestDateIso: string; // YYYY-MM-DD or ""
  status: ProcessingStatus;
  animalCount: number;
  liveWeightGrams: number;
  dressedWeightGrams: number;
  dressOutPercent?: number;
  peltCount: number;
  peltGrade: PeltGrade;
  peltColorNotes: string;
  processingCostCents?: number;
  meatValueCents?: number;
  peltValueCents?: number;
  notes: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export type YouthOrgType = '4-H' | 'FFA' | 'Other Youth';

export const YOUTH_ORG_OPTIONS: ReadonlyArray<{ value: YouthOrgType; label: string }> = [
  { value: '4-H', label: '4-H Youth Project' },
  { value: 'FFA', label: 'FFA SAE / Project' },
  { value: 'Other Youth', label: 'Other Youth Livestock Club' },
];

export function normalizeYouthOrgType(
  raw: unknown,
  fallback: YouthOrgType = '4-H'
): YouthOrgType {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  if (clean === 'ffa') return 'FFA';
  if (clean === '4-h' || clean === '4h') return '4-H';
  if (clean === 'other youth' || clean === 'other') return 'Other Youth';
  return fallback;
}

export interface YouthProjectFeedLogEntry {
  id: string;
  dateIso: string; // YYYY-MM-DD
  feedType: string;
  quantity: number;
  unit: string;
  costCents: number;
  linkedFeedBatchId?: string;
  notes?: string;
}

export function normalizeYouthProjectFeedLogs(raw: unknown): YouthProjectFeedLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const seenIds = new Set<string>();
  const out: YouthProjectFeedLogEntry[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const obj = entry as Record<string, unknown>;
    const feedType = typeof obj.feedType === 'string' ? obj.feedType.trim().slice(0, 120) : '';
    const dateIso =
      typeof obj.dateIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.dateIso.trim())
        ? obj.dateIso.trim()
        : '';
    const qtyNum = Number(obj.quantity);
    const quantity = Number.isFinite(qtyNum) && qtyNum >= 0 ? Number(qtyNum.toFixed(2)) : 0;
    const costNum = Number(obj.costCents);
    const costCents = Number.isFinite(costNum) && costNum >= 0 ? Math.round(costNum) : 0;
    if (!feedType && quantity <= 0 && costCents <= 0) continue;
    const rawId =
      typeof obj.id === 'string' && obj.id.trim()
        ? obj.id.trim().slice(0, 80)
        : `yfl-${i + 1}`;
    const id = seenIds.has(rawId) ? `${rawId}-${i + 1}` : rawId;
    seenIds.add(id);
    const unit =
      typeof obj.unit === 'string' && obj.unit.trim() ? obj.unit.trim().slice(0, 24) : 'lbs';
    const linkedFeedBatchId =
      typeof obj.linkedFeedBatchId === 'string' && obj.linkedFeedBatchId.trim()
        ? obj.linkedFeedBatchId.trim()
        : undefined;
    const notes =
      typeof obj.notes === 'string' && obj.notes.trim()
        ? obj.notes.trim().slice(0, 300)
        : undefined;
    out.push({
      id,
      dateIso,
      feedType: feedType || 'Project Feed',
      quantity,
      unit,
      costCents,
      ...(linkedFeedBatchId ? { linkedFeedBatchId } : {}),
      ...(notes ? { notes } : {}),
    });
  }
  return out.sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''));
}

/**
 * 4-H / FFA Youth Project Record Book tracking member details, enrolled animals/litters,
 * project-specific feed logs, inventory valuation, learning goals, and printable completion reports.
 */
export interface YouthProjectBook {
  id: string;
  species: string;
  organization: YouthOrgType;
  projectTitle: string;
  memberName: string;
  clubOrChapter: string;
  leaderOrAdvisor: string;
  projectYear: string;
  startDateIso: string; // YYYY-MM-DD
  endDateIso: string; // YYYY-MM-DD or ""
  status: 'Active' | 'Completed';
  linkedAnimalIds: string[];
  linkedBreedingIds: string[];
  startingInventoryValueCents: number;
  endingInventoryValueCents: number;
  feedLogs: YouthProjectFeedLogEntry[];
  goalsAndReflection: string;
  showAndCommunityNotes: string;
  notes: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export type PreferredContactMethod = 'email' | 'phone' | 'sms' | 'in_person' | 'other';

export const PREFERRED_CONTACT_METHODS: ReadonlyArray<{
  value: PreferredContactMethod;
  label: string;
}> = [
  { value: 'sms', label: 'Text / SMS' },
  { value: 'phone', label: 'Phone Call' },
  { value: 'email', label: 'Email' },
  { value: 'in_person', label: 'In Person / Barn Visit' },
  { value: 'other', label: 'Other' },
];

export function normalizePreferredContactMethod(
  raw: unknown,
  fallback: PreferredContactMethod = 'sms'
): PreferredContactMethod {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  if (clean === 'email' || clean === 'mail') return 'email';
  if (clean === 'phone' || clean === 'call') return 'phone';
  if (clean === 'sms' || clean === 'text') return 'sms';
  if (clean === 'in_person' || clean === 'in person' || clean === 'barn') return 'in_person';
  if (clean === 'other') return 'other';
  return fallback;
}

export type ClientKind =
  | 'pet_buyer'
  | 'show_breeder'
  | 'commercial_meat'
  | 'youth_4h_ffa'
  | 'rescue_partner'
  | 'other';

export const CLIENT_KINDS: ReadonlyArray<{
  value: ClientKind;
  label: string;
}> = [
  { value: 'pet_buyer', label: 'Pet / Companion Buyer' },
  { value: 'show_breeder', label: 'Show & Breeding Program' },
  { value: 'youth_4h_ffa', label: '4-H / FFA Youth Buyer' },
  { value: 'commercial_meat', label: 'Commercial / Meat / Homestead' },
  { value: 'rescue_partner', label: 'Partner / Exchange' },
  { value: 'other', label: 'Other Client' },
];

export function normalizeClientKind(
  raw: unknown,
  fallback: ClientKind = 'pet_buyer'
): ClientKind {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  const valid = new Set<ClientKind>(CLIENT_KINDS.map((o) => o.value));
  if (valid.has(clean as ClientKind)) return clean as ClientKind;
  if (clean.includes('show') || clean.includes('breed')) return 'show_breeder';
  if (clean.includes('4-h') || clean.includes('4h') || clean.includes('ffa') || clean.includes('youth')) {
    return 'youth_4h_ffa';
  }
  if (clean.includes('meat') || clean.includes('commercial') || clean.includes('homestead')) {
    return 'commercial_meat';
  }
  if (clean.includes('rescue') || clean.includes('partner')) return 'rescue_partner';
  if (clean.includes('pet') || clean.includes('companion')) return 'pet_buyer';
  return fallback;
}

/**
 * Local-first breeder CRM client contact record, scoped to a `species`.
 */
export interface ClientContact {
  id: string;
  species: string;
  fullName: string;
  ranchOrHerdName: string;
  email: string;
  phone: string;
  preferredContact: PreferredContactMethod;
  clientKind: ClientKind;
  cityState: string;
  shippingAddress: string;
  tags: string[];
  notes: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export type WaitlistStatus =
  | 'Active'
  | 'Matched'
  | 'Deposited'
  | 'Fulfilled'
  | 'Paused'
  | 'Cancelled';

export const WAITLIST_STATUSES: ReadonlyArray<WaitlistStatus> = [
  'Active',
  'Matched',
  'Deposited',
  'Fulfilled',
  'Paused',
  'Cancelled',
];

export function normalizeWaitlistStatus(
  raw: unknown,
  fallback: WaitlistStatus = 'Active'
): WaitlistStatus {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  if (clean === 'active' || clean === 'waiting' || clean === 'open') return 'Active';
  if (clean === 'matched') return 'Matched';
  if (clean === 'deposited' || clean === 'reserved') return 'Deposited';
  if (clean === 'fulfilled' || clean === 'completed' || clean === 'sold') return 'Fulfilled';
  if (clean === 'paused' || clean === 'hold') return 'Paused';
  if (clean === 'cancelled' || clean === 'canceled') return 'Cancelled';
  return fallback;
}

export type WaitlistIntent =
  | 'Show / Breeding'
  | 'Pet / Companion'
  | '4-H / FFA Youth'
  | 'Meat / Commercial'
  | 'Any';

export const WAITLIST_INTENTS: ReadonlyArray<WaitlistIntent> = [
  'Show / Breeding',
  'Pet / Companion',
  '4-H / FFA Youth',
  'Meat / Commercial',
  'Any',
];

export function normalizeWaitlistIntent(
  raw: unknown,
  fallback: WaitlistIntent = 'Show / Breeding'
): WaitlistIntent {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  if (clean.includes('show') || clean.includes('breed')) return 'Show / Breeding';
  if (clean.includes('pet') || clean.includes('companion')) return 'Pet / Companion';
  if (clean.includes('4-h') || clean.includes('4h') || clean.includes('ffa') || clean.includes('youth')) {
    return '4-H / FFA Youth';
  }
  if (clean.includes('meat') || clean.includes('commercial')) return 'Meat / Commercial';
  if (clean === 'any') return 'Any';
  return fallback;
}

/**
 * Buyer waitlist inquiry & preference record, scoped to a `species`.
 */
export interface WaitlistEntry {
  id: string;
  species: string;
  clientId: string;
  clientName: string;
  priorityRank: number;
  status: WaitlistStatus;
  intent: WaitlistIntent;
  desiredBreed: string;
  desiredVariety: string;
  preferredSex: 'Any' | 'Male' | 'Female';
  preferredBreedingId?: string;
  requestedByDateIso: string; // YYYY-MM-DD or ""
  inquiryDateIso: string; // YYYY-MM-DD
  followUpDateIso: string; // YYYY-MM-DD or ""
  lastContactedDateIso: string; // YYYY-MM-DD or ""
  maxBudgetCents?: number;
  notes: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export type ReservationStatus =
  | 'Inquiry Hold'
  | 'Pending Deposit'
  | 'Deposit Paid'
  | 'Paid in Full'
  | 'Ready for Pickup'
  | 'Picked Up / Completed'
  | 'Cancelled';

export const RESERVATION_STATUSES: ReadonlyArray<ReservationStatus> = [
  'Inquiry Hold',
  'Pending Deposit',
  'Deposit Paid',
  'Paid in Full',
  'Ready for Pickup',
  'Picked Up / Completed',
  'Cancelled',
];

export function normalizeReservationStatus(
  raw: unknown,
  fallback: ReservationStatus = 'Pending Deposit'
): ReservationStatus {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  if (clean === 'inquiry hold' || clean === 'hold') return 'Inquiry Hold';
  if (clean === 'pending deposit' || clean === 'pending') return 'Pending Deposit';
  if (clean === 'deposit paid' || clean === 'deposited') return 'Deposit Paid';
  if (clean === 'paid in full' || clean === 'paid') return 'Paid in Full';
  if (clean === 'ready for pickup' || clean === 'ready') return 'Ready for Pickup';
  if (
    clean === 'picked up / completed' ||
    clean === 'completed' ||
    clean === 'picked up' ||
    clean === 'sold'
  ) {
    return 'Picked Up / Completed';
  }
  if (clean === 'cancelled' || clean === 'canceled') return 'Cancelled';
  return fallback;
}

/**
 * Animal or litter-pick reservation with deposit schedule, hold expiration,
 * follow-up reminders, and printable sales agreement metadata, scoped to a `species`.
 */
export interface AnimalReservation {
  id: string;
  species: string;
  agreementNumber: string;
  clientId: string;
  clientName: string;
  waitlistEntryId?: string;
  animalId?: string;
  breedingId?: string;
  pickOrder?: number;
  itemLabel: string;
  status: ReservationStatus;
  reservedDateIso: string; // YYYY-MM-DD
  holdExpiresDateIso: string; // YYYY-MM-DD or ""
  totalPriceCents: number;
  depositRequiredCents: number;
  depositPaidCents: number;
  depositDueDateIso: string; // YYYY-MM-DD or ""
  depositPaidDateIso: string; // YYYY-MM-DD or ""
  pickupScheduledDateIso: string; // YYYY-MM-DD or ""
  completedDateIso: string; // YYYY-MM-DD or ""
  balanceReminderDateIso: string; // YYYY-MM-DD or ""
  paymentMethod: string;
  ledgerEntryId?: string;
  termsSummary: string;
  healthGuaranteeNotes: string;
  notes: string;
  _rev?: number;
  createdAt: string;
  updatedAt: string;
}

export type WoolHarvestMethod = 'Shear' | 'Pluck' | 'Brush / Comb' | 'Other';

export const WOOL_HARVEST_METHODS: ReadonlyArray<WoolHarvestMethod> = [
  'Shear',
  'Pluck',
  'Brush / Comb',
  'Other',
];

export function normalizeWoolHarvestMethod(
  raw: unknown,
  fallback: WoolHarvestMethod = 'Shear'
): WoolHarvestMethod {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().toLowerCase();
  if (clean === 'shear' || clean === 'clipped' || clean === 'clip' || clean === 'sheared') {
    return 'Shear';
  }
  if (clean === 'pluck' || clean === 'plucked') return 'Pluck';
  if (clean === 'brush / comb' || clean === 'brush' || clean === 'comb' || clean === 'combed') {
    return 'Brush / Comb';
  }
  if (clean === 'other') return 'Other';
  return fallback;
}

/**
 * Official 100-point 7-position IAGARB German Angora evaluation breakdown:
 * Weight (20), Body Type (20), Wool Density & Length (15), Wool Uniformity (15),
 * Wool Texture (15), Furnishings (10), Condition (5).
 */
export interface IagarbScorecard {
  weightPts: number;
  bodyTypePts: number;
  densityLengthPts: number;
  uniformityPts: number;
  texturePts: number;
  furnishingsPts: number;
  conditionPts: number;
  totalPts: number;
  evaluatorName: string;
  evaluationDateIso: string; // YYYY-MM-DD or ""
}

/**
 * Per-animal wool/fiber harvest record supporting prime vs. grade yields,
 * shearing cycle interval tracking (e.g., 90-day IAGARB performance test),
 * and optional IAGARB German Angora 7-position judging scorecard.
 */
export interface WoolHarvest {
  id: string;
  species: string;
  animalId: string;
  harvestDateIso: string; // YYYY-MM-DD
  shearingIntervalDays?: number;
  primeWeightGrams: number;
  gradeWeightGrams: number;
  harvestMethod: WoolHarvestMethod;
  stapleLengthMm?: number;
  iagarbScore?: IagarbScorecard;
  witnessedBy?: string;
  notes: string;
  _rev?: number;
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
  feedBatches: FeedBatch[];
  feedAllocations: FeedAllocation[];
  ledgerEntries?: LedgerEntry[];
  processingLogs?: ProcessingLog[];
  youthProjectBooks?: YouthProjectBook[];
  clientContacts?: ClientContact[];
  waitlistEntries?: WaitlistEntry[];
  animalReservations?: AnimalReservation[];
  woolHarvests?: WoolHarvest[];
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
  'Ultrasound',
  'Health / Vet',
  'Health Score / BCS',
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

let coreClockSkewMs = 0;

/**
 * Sets the active device clock-skew offset (serverMs - localDeviceMs) so pure domain
 * timestamps (`nowEpochMs`, `nowIsoUtc`, `todayDateIso`) automatically compensate for
 * drifted or rewound device clocks without introducing upward `storage/` imports.
 */
export function setCoreClockSkewMs(skewMs: number | null | undefined): void {
  coreClockSkewMs =
    typeof skewMs === 'number' && Number.isFinite(skewMs) ? Math.round(skewMs) : 0;
}

export function getCoreClockSkewMs(): number {
  return coreClockSkewMs;
}

/**
 * Returns the current UTC epoch milliseconds adjusted for any recorded server clock skew.
 */
export function nowEpochMs(): number {
  return Date.now() + coreClockSkewMs;
}

/**
 * Returns the current UTC timestamp in ISO-8601 format (`YYYY-MM-DDTHH:mm:ss.sssZ`),
 * adjusted for any recorded server clock skew.
 */
export function nowIsoUtc(): string {
  return new Date(nowEpochMs()).toISOString();
}

/**
 * Returns today's local calendar date as `YYYY-MM-DD` using the clock-skew-adjusted time.
 */
export function todayDateIso(): string {
  const now = new Date(nowEpochMs());
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
    [
      'male',
      'm',
      'buck',
      'ram',
      'boar',
      'bull',
      'hob',
      'macho',
      'sire',
      'stallion',
      'tom',
      'stud',
    ].includes(s)
  ) {
    return 'Male';
  }
  if (
    [
      'female',
      'f',
      'doe',
      'ewe',
      'sow',
      'cow',
      'jill',
      'hembra',
      'dam',
      'mare',
      'queen',
      'bitch',
    ].includes(s)
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
  if (event === 'whelping') return 'Whelped';
  if (event === 'queening') return 'Queened';
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

/**
 * Strips an optional species default prefix from an animal name for external calendar display.
 * Falls back to the original trimmed name if stripping would leave an empty string.
 */
export function stripAnimalNamePrefix(name: string, prefix?: string): string {
  const cleanName = (name || '').trim();
  const cleanPrefix = (prefix || '').trim();
  if (!cleanPrefix || !cleanName) return cleanName;
  if (!cleanName.toLowerCase().startsWith(cleanPrefix.toLowerCase())) {
    return cleanName;
  }
  const stripped = cleanName
    .slice(cleanPrefix.length)
    .replace(/^[\s\-_:/#']+/, '')
    .trim();
  return stripped || cleanName;
}

export const applySpeciesNamePrefix = applyAnimalNamePrefix;

/**
 * Resolves the effective display/input weight unit for a given species, honoring any
 * per-species override before falling back to the barn-wide default `settings.preferredUnit`.
 */
export function resolveSpeciesWeightUnit(
  speciesOrProfile: Pick<SpeciesProfile, 'preferredUnit'> | string | undefined,
  settings: Pick<BarnSettings, 'preferredUnit'>,
  configuredProfiles?: SpeciesProfile[]
): WeightUnit {
  const barnFallback = normalizeWeightUnit(settings.preferredUnit, 'lbs_oz');
  if (!speciesOrProfile) return barnFallback;
  if (typeof speciesOrProfile === 'string') {
    const match = configuredProfiles?.find((sp) => isSameSpecies(sp.name, speciesOrProfile));
    return match?.preferredUnit ? normalizeWeightUnit(match.preferredUnit, barnFallback) : barnFallback;
  }
  return speciesOrProfile.preferredUnit
    ? normalizeWeightUnit(speciesOrProfile.preferredUnit, barnFallback)
    : barnFallback;
}

/**
 * Formats integer grams for numeric text input in the active weight unit.
 */
export function formatWeightInputValue(weightGrams: number, unit: WeightUnit): string {
  if (!weightGrams || weightGrams <= 0) return '';
  if (unit === 'grams') return String(Math.round(weightGrams));
  if (unit === 'kg') return (weightGrams / 1000).toFixed(2);
  return (weightGrams / 453.59237).toFixed(2);
}

/**
 * Returns input labels and example placeholders for a given weight unit.
 */
export function getWeightInputMeta(unit: WeightUnit): {
  unitLabel: string;
  shortUnit: string;
  placeholder: string;
} {
  switch (unit) {
    case 'grams':
      return { unitLabel: 'grams', shortUnit: 'g', placeholder: 'e.g. 4650' };
    case 'kg':
      return { unitLabel: 'kg', shortUnit: 'kg', placeholder: 'e.g. 18.50' };
    default:
      return { unitLabel: 'decimal lbs', shortUnit: 'lbs', placeholder: 'e.g. 10.25' };
  }
}

/**
 * Returns species-appropriate UI labels and placeholders for the `tattoo` identifier field
 * without altering the underlying `animal.tattoo` schema key.
 */
export function getSpeciesIdentifierLabels(speciesName?: string): {
  fieldLabel: string;
  shortLabel: string;
  placeholder: string;
} {
  const key = (speciesName || '').trim().toLowerCase();
  if (key === 'dog' || key === 'cat') {
    return {
      fieldLabel: 'Microchip / Tattoo / ID',
      shortLabel: 'ID / Microchip',
      placeholder: 'e.g. 985112004512 or Collar-01',
    };
  }
  if (
    key === 'cattle' ||
    key === 'goat' ||
    key === 'sheep' ||
    key === 'swine / pig' ||
    key === 'alpaca'
  ) {
    return {
      fieldLabel: 'Ear Tag / Tattoo / Notch ID',
      shortLabel: 'Ear Tag / ID',
      placeholder: 'e.g. TAG-204',
    };
  }
  if (key === 'rabbit') {
    return {
      fieldLabel: 'Ear Tattoo / Tag ID',
      shortLabel: 'Ear Tattoo / ID',
      placeholder: 'e.g. NZR-301',
    };
  }
  return {
    fieldLabel: 'ID / Tag / Tattoo / Microchip',
    shortLabel: 'ID / Tag',
    placeholder: 'e.g. ID-104',
  };
}

/**
 * Formats weight in `lbs_oz`, decimal `lbs`, `kg`, or `grams`.
 */
export function formatWeight(weightGrams: number, unit: WeightUnit): string {
  if (!weightGrams || weightGrams <= 0) return 'Unweighed';
  if (unit === 'grams') {
    return `${Math.round(weightGrams).toLocaleString()} g`;
  }
  if (unit === 'kg') {
    return `${(weightGrams / 1000).toFixed(2)} kg`;
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
 * Formats weight in traditional ARBA `lbs.oz` dot notation (e.g., `10.04` for 10 lb 4 oz).
 */
export function formatWeightArbaLbsOzDot(weightGrams: number): string {
  if (!weightGrams || !Number.isFinite(weightGrams) || weightGrams <= 0) {
    return 'Unweighed';
  }
  const totalOunces = weightGrams / 28.349523125;
  const rawLbs = Math.floor(totalOunces / 16);
  const rawOz = Math.round(totalOunces - rawLbs * 16);
  const lbs = rawOz === 16 ? rawLbs + 1 : rawLbs;
  const oz = rawOz === 16 ? 0 : rawOz;
  return `${lbs}.${String(oz).padStart(2, '0')}`;
}

/**
 * Formats pedigree weights using either standard unit display or ARBA `lbs.oz` dot notation.
 */
export function formatPedigreeWeight(
  weightGrams: number,
  unit: WeightUnit,
  useArbaLbsOzDot = false
): string {
  if (!weightGrams || !Number.isFinite(weightGrams) || weightGrams <= 0) {
    return 'Unweighed';
  }
  return useArbaLbsOzDot ? formatWeightArbaLbsOzDot(weightGrams) : formatWeight(weightGrams, unit);
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
  if (unit === 'kg') return Math.round(numeric * 1000);
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
  if (
    dt.getUTCFullYear() !== parts[0] ||
    dt.getUTCMonth() !== parts[1] - 1 ||
    dt.getUTCDate() !== parts[2]
  ) {
    return dateIso;
  }
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
  {
    id: 'species-dog',
    name: 'Dog',
    gestationDays: 63,
    rebreedDaysAfterBirth: 180,
    weanDaysAfterBirth: 56,
    birthEventLabel: 'Whelping',
    maleLabel: 'Male',
    femaleLabel: 'Female',
    offspringLabel: 'Puppy',
    exampleBreeds: [
      'Golden Retriever',
      'Labrador Retriever',
      'German Shepherd',
      'Australian Shepherd',
      'Poodle',
      'Border Collie',
    ],
    milestones: [
      {
        label: 'Ultrasound / Pregnancy Confirmation',
        relativeTo: 'AFTER_BRED',
        daysOffset: 28,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'X-Ray Puppy Count Check',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 7,
        category: 'Health',
        priority: 'Normal',
      },
      {
        label: 'Prep Whelping Box & Supplies',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 5,
        category: 'Nestbox',
        priority: 'High',
      },
      {
        label: 'Early Weight & Deworming Check',
        relativeTo: 'AFTER_BIRTH',
        daysOffset: 14,
        category: 'Health',
        priority: 'Normal',
      },
    ],
  },
  {
    id: 'species-cat',
    name: 'Cat',
    gestationDays: 65,
    rebreedDaysAfterBirth: 120,
    weanDaysAfterBirth: 56,
    birthEventLabel: 'Queening',
    maleLabel: 'Tom',
    femaleLabel: 'Queen',
    offspringLabel: 'Kitten',
    exampleBreeds: [
      'Maine Coon',
      'Ragdoll',
      'British Shorthair',
      'Siamese',
      'Bengal',
      'Sphynx',
    ],
    milestones: [
      {
        label: 'Pinking Up & Palpation Check',
        relativeTo: 'AFTER_BRED',
        daysOffset: 21,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'Prep Queening Box & Heating Pad',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 5,
        category: 'Nestbox',
        priority: 'High',
      },
      {
        label: 'Kitten Birth Weight & Latch Check',
        relativeTo: 'AFTER_BIRTH',
        daysOffset: 1,
        category: 'Birth Check',
        priority: 'High',
      },
      {
        label: 'First FVRCP Vaccine & Deworming Window',
        relativeTo: 'AFTER_BIRTH',
        daysOffset: 42,
        category: 'Health',
        priority: 'Normal',
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

/**
 * Returns `true` when an animal record is flagged as needing follow-up attention
 * (for example, quick-added as an outside or unlisted parent during breeding).
 */
export function doesAnimalNeedAttention(animal: Animal | null | undefined): boolean {
  return Boolean(animal?.needsAttention);
}

/**
 * Classifies whether an animal is a non-adult (juvenile/pre-maturity) based on `status === 'Junior'`
 * or age against `speciesProfile.maturityDays` (falling back to `weanDaysAfterBirth * 2`).
 */
export function isAnimalNonAdult(
  animal: Pick<Animal, 'status' | 'birthDateIso'>,
  speciesProfile?: Pick<SpeciesProfile, 'maturityDays' | 'weanDaysAfterBirth'>,
  referenceDateIso: string = todayDateIso()
): boolean {
  if (animal.status === 'Junior') return true;
  if (!animal.birthDateIso || !referenceDateIso) return false;
  const birthMs = Date.parse(`${animal.birthDateIso}T00:00:00Z`);
  const refMs = Date.parse(`${referenceDateIso}T00:00:00Z`);
  if (!Number.isFinite(birthMs) || !Number.isFinite(refMs) || refMs < birthMs) return false;
  const ageDays = Math.floor((refMs - birthMs) / 86_400_000);
  const cutoff =
    speciesProfile?.maturityDays && speciesProfile.maturityDays > 0
      ? speciesProfile.maturityDays
      : Math.max(28, (speciesProfile?.weanDaysAfterBirth || 42) * 2);
  return ageDays < cutoff;
}
