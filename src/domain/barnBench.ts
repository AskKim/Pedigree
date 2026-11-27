/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript "Barn Bench" Fast Sequential Batch Entry Engine (`src/domain/barnBench.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) calls.
 *
 * Builds species-isolated, cage-row-walkable sequential chore queues and converts
 * rapid cage-side inputs (weights, body condition scores, nail trims, cage moves)
 * into clean `CareLog` records and `Animal` updates ready for atomic persistence.
 */

import { isCageOccupyingAnimal, normalizeCageLabelKey } from './barnAlerts';
import {
  Animal,
  CageLocation,
  CareLog,
  generateUuid,
  isSameSpecies,
  nowIsoUtc,
  todayDateIso,
} from './models';
import { bumpRecordRevision } from './syncOutbox';

export type BarnBenchFocusMode = 'all' | 'weight' | 'bcs' | 'nail_trim' | 'cage_move';

export type BarnBenchStatusFilter = 'housing' | 'active_only' | 'junior_only';

export const BARN_BENCH_SECTION_ALL = '__ALL__';
export const BARN_BENCH_SECTION_UNASSIGNED = '__UNASSIGNED__';

/**
 * Standard 1–5 livestock & rabbit Body Condition Score quick-tap presets.
 */
export const BARN_BENCH_BCS_PRESETS: readonly number[] = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

export interface BarnBenchRowItem {
  animal: Animal;
  cage: CageLocation | null;
  cageLabel: string;
  sectionLabel: string;
  hasAssignedCage: boolean;
  latestBcs: number;
  latestBcsDateIso: string;
  latestNailTrimDateIso: string;
}

export interface BarnBenchFilterOptions {
  speciesName: string;
  sectionFilter?: string;
  statusFilter?: BarnBenchStatusFilter;
  searchQuery?: string;
}

export interface BarnBenchBatchEntryDraft {
  animalId: string;
  dateIso?: string;
  /** Weight measurement in integer grams; omit or <= 0 to skip logging weight. */
  weightGrams?: number;
  /** Body Condition Score (e.g. 1-5 or 1-9); omit or <= 0 to skip logging BCS. */
  bodyConditionScore?: number;
  /** True when nail trim / hoof grooming was performed. */
  nailTrimDone?: boolean;
  /** Optional custom title override for nail trim log. */
  nailTrimTitle?: string;
  /** Target cage/pen label (`""` unassigns); undefined leaves cage unchanged. */
  targetCageLocation?: string;
  /** Optional note attached to logged care entries. */
  notes?: string;
}

export interface BarnBenchCommitPlan {
  careLogs: CareLog[];
  updatedAnimal: Animal | null;
  summaryParts: string[];
  hasChanges: boolean;
}

/**
 * Extracts distinct non-empty physical cage row / section names for a single species,
 * sorted naturally so row buttons match barn layout (`Row A`, `Row B`, `Pasture 1`, etc.).
 */
export function extractSpeciesCageSections(
  cages: readonly CageLocation[],
  speciesName: string
): string[] {
  const seen = new Map<string, string>();
  for (const cage of cages) {
    if (!isSameSpecies(cage.species, speciesName)) continue;
    const clean = (cage.section || '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, clean);
    }
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );
}

/**
 * Builds the sequential Barn Bench walkthrough queue for a species, filtered by
 * cage row/section, housing status, and search text, and sorted naturally down the row.
 */
export function buildBarnBenchQueue(params: {
  animals: readonly Animal[];
  cages: readonly CageLocation[];
  careLogs: readonly CareLog[];
  options: BarnBenchFilterOptions;
}): BarnBenchRowItem[] {
  const { animals, cages, careLogs, options } = params;
  const speciesName = options.speciesName;
  const sectionFilter = options.sectionFilter || BARN_BENCH_SECTION_ALL;
  const statusFilter = options.statusFilter || 'housing';
  const query = (options.searchQuery || '').trim().toLowerCase();

  // Map species cages by normalized label
  const cageByLabelKey = new Map<string, CageLocation>();
  for (const cage of cages) {
    if (!isSameSpecies(cage.species, speciesName)) continue;
    const key = normalizeCageLabelKey(cage.label);
    if (key && !cageByLabelKey.has(key)) {
      cageByLabelKey.set(key, cage);
    }
  }

  // Single O(L) pass to gather latest BCS & latest Grooming & Hoof date per animal
  const latestBcsByAnimal = new Map<string, { score: number; dateIso: string }>();
  const latestTrimByAnimal = new Map<string, string>();

  for (const log of careLogs) {
    if (!isSameSpecies(log.species, speciesName) || !log.animalId) continue;
    const logDate = (log.dateIso || '').trim();

    if (typeof log.bodyConditionScore === 'number' && log.bodyConditionScore > 0) {
      const prev = latestBcsByAnimal.get(log.animalId);
      if (!prev || logDate.localeCompare(prev.dateIso) > 0) {
        latestBcsByAnimal.set(log.animalId, {
          score: log.bodyConditionScore,
          dateIso: logDate,
        });
      }
    }

    if (log.type === 'Grooming & Hoof') {
      const prevTrim = latestTrimByAnimal.get(log.animalId);
      if (!prevTrim || logDate.localeCompare(prevTrim) > 0) {
        latestTrimByAnimal.set(log.animalId, logDate);
      }
    }
  }

  const rows: BarnBenchRowItem[] = [];

  for (const animal of animals) {
    if (!isSameSpecies(animal.species, speciesName)) continue;
    if (!isCageOccupyingAnimal(animal)) continue;
    if (statusFilter === 'active_only' && animal.status !== 'Active') continue;
    if (statusFilter === 'junior_only' && animal.status !== 'Junior') continue;

    const rawCageLabel = (animal.cageLocation || '').trim();
    const matchedCage = rawCageLabel
      ? cageByLabelKey.get(normalizeCageLabelKey(rawCageLabel)) ?? null
      : null;

    const hasAssignedCage = Boolean(rawCageLabel);
    const sectionLabel = matchedCage?.section?.trim()
      ? matchedCage.section.trim()
      : hasAssignedCage
        ? 'Other Cages'
        : 'Unassigned';

    if (sectionFilter === BARN_BENCH_SECTION_UNASSIGNED) {
      if (hasAssignedCage) continue;
    } else if (sectionFilter !== BARN_BENCH_SECTION_ALL) {
      if (sectionLabel.toLowerCase() !== sectionFilter.trim().toLowerCase()) {
        continue;
      }
    }

    if (query) {
      const matches =
        animal.name.toLowerCase().includes(query) ||
        animal.tattoo.toLowerCase().includes(query) ||
        rawCageLabel.toLowerCase().includes(query) ||
        sectionLabel.toLowerCase().includes(query) ||
        animal.breed.toLowerCase().includes(query) ||
        animal.variety.toLowerCase().includes(query);
      if (!matches) continue;
    }

    const latestBcs = latestBcsByAnimal.get(animal.id);
    const latestTrim = latestTrimByAnimal.get(animal.id) || '';

    rows.push({
      animal,
      cage: matchedCage,
      cageLabel: rawCageLabel,
      sectionLabel,
      hasAssignedCage,
      latestBcs: latestBcs?.score ?? 0,
      latestBcsDateIso: latestBcs?.dateIso ?? '',
      latestNailTrimDateIso: latestTrim,
    });
  }

  rows.sort((a, b) => {
    // 1. Assigned cages before Unassigned
    if (a.hasAssignedCage !== b.hasAssignedCage) {
      return a.hasAssignedCage ? -1 : 1;
    }
    // 2. Section natural order (with "Other Cages" after named sections)
    if (a.sectionLabel !== b.sectionLabel) {
      if (a.sectionLabel === 'Other Cages') return 1;
      if (b.sectionLabel === 'Other Cages') return -1;
      const secCmp = a.sectionLabel.localeCompare(b.sectionLabel, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      if (secCmp !== 0) return secCmp;
    }
    // 3. Natural numeric cage label order (Hutch R-2 before Hutch R-10)
    if (a.cageLabel !== b.cageLabel) {
      const cageCmp = a.cageLabel.localeCompare(b.cageLabel, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      if (cageCmp !== 0) return cageCmp;
    }
    // 4. Animal name & tattoo fallback
    return (
      a.animal.name.localeCompare(b.animal.name, undefined, {
        numeric: true,
        sensitivity: 'base',
      }) || a.animal.tattoo.localeCompare(b.animal.tattoo)
    );
  });

  return rows;
}

/**
 * Purely converts a single Barn Bench sequential chore draft into typed `CareLog` records
 * and a single `_rev`-bumped `Animal` patch when weight or cage location changed.
 */
export function buildBarnBenchCommitPlan(
  animal: Animal,
  draft: BarnBenchBatchEntryDraft,
  timestampIso: string = nowIsoUtc()
): BarnBenchCommitPlan {
  if (animal.offloadedArchiveKey) {
    return {
      careLogs: [],
      updatedAnimal: null,
      summaryParts: [],
      hasChanges: false,
    };
  }

  const dateIso =
    typeof draft.dateIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(draft.dateIso.trim())
      ? draft.dateIso.trim()
      : todayDateIso();
  const cleanNotes = typeof draft.notes === 'string' ? draft.notes.trim() : '';

  const rawWeight = Number(draft.weightGrams);
  const validWeightGrams =
    Number.isFinite(rawWeight) && rawWeight > 0 ? Math.round(rawWeight) : 0;

  const rawBcs = Number(draft.bodyConditionScore);
  const validBcs =
    Number.isFinite(rawBcs) && rawBcs > 0 ? Math.min(20, Math.round(rawBcs * 10) / 10) : 0;

  const nailTrimDone = Boolean(draft.nailTrimDone);
  const cleanTrimTitle =
    typeof draft.nailTrimTitle === 'string' && draft.nailTrimTitle.trim()
      ? draft.nailTrimTitle.trim()
      : 'Nail Trim & Grooming';

  const hasCageTarget = draft.targetCageLocation !== undefined;
  const normalizedNextCage = hasCageTarget ? draft.targetCageLocation!.trim() : animal.cageLocation.trim();
  const cageChanged = hasCageTarget && normalizedNextCage !== animal.cageLocation.trim();

  const careLogs: CareLog[] = [];
  const summaryParts: string[] = [];

  if (validWeightGrams > 0) {
    careLogs.push({
      id: generateUuid(),
      species: animal.species,
      animalId: animal.id,
      dateIso,
      type: 'Weight Check',
      title: 'Barn Bench Weight Check',
      weightGrams: validWeightGrams,
      showLegEarned: false,
      notes: cleanNotes,
      _rev: 1,
      createdAt: timestampIso,
      updatedAt: timestampIso,
    });
    summaryParts.push('Weight');
  }

  if (validBcs > 0) {
    careLogs.push({
      id: generateUuid(),
      species: animal.species,
      animalId: animal.id,
      dateIso,
      type: 'Health Score / BCS',
      title: `Body Condition Score (${validBcs})`,
      weightGrams: 0,
      showLegEarned: false,
      bodyConditionScore: validBcs,
      notes: cleanNotes,
      _rev: 1,
      createdAt: timestampIso,
      updatedAt: timestampIso,
    });
    summaryParts.push(`BCS ${validBcs}`);
  }

  if (nailTrimDone) {
    careLogs.push({
      id: generateUuid(),
      species: animal.species,
      animalId: animal.id,
      dateIso,
      type: 'Grooming & Hoof',
      title: cleanTrimTitle,
      weightGrams: 0,
      showLegEarned: false,
      notes: cleanNotes,
      _rev: 1,
      createdAt: timestampIso,
      updatedAt: timestampIso,
    });
    summaryParts.push('Nail Trim');
  }

  // Standalone note without numeric/action flags still records cleanly as a Journal Note
  if (!validWeightGrams && !validBcs && !nailTrimDone && !cageChanged && cleanNotes) {
    careLogs.push({
      id: generateUuid(),
      species: animal.species,
      animalId: animal.id,
      dateIso,
      type: 'Journal Note',
      title: 'Barn Bench Note',
      weightGrams: 0,
      showLegEarned: false,
      notes: cleanNotes,
      _rev: 1,
      createdAt: timestampIso,
      updatedAt: timestampIso,
    });
    summaryParts.push('Note');
  }

  const weightChangedOnAnimal = validWeightGrams > 0 && validWeightGrams !== animal.weightGrams;
  let updatedAnimal: Animal | null = null;
  if (weightChangedOnAnimal || cageChanged) {
    const nextRev = bumpRecordRevision(animal);
    updatedAnimal = {
      ...animal,
      weightGrams: validWeightGrams > 0 ? validWeightGrams : animal.weightGrams,
      cageLocation: cageChanged ? normalizedNextCage : animal.cageLocation,
      _rev: nextRev,
      updatedAt: timestampIso,
    };
  }

  if (cageChanged) {
    summaryParts.push(normalizedNextCage ? `Moved → ${normalizedNextCage}` : 'Unassigned Cage');
  }

  return {
    careLogs,
    updatedAnimal,
    summaryParts,
    hasChanges: careLogs.length > 0 || updatedAnimal !== null,
  };
}

/**
 * Picks the next row index in a Barn Bench queue after saving or skipping `currentIndex`.
 * Prefers the next unlogged row ahead (wrapping around only for unlogged items), falling back
 * to `currentIndex + 1` when auto-advancing sequentially.
 */
export function findNextBarnBenchIndex(params: {
  queue: readonly BarnBenchRowItem[];
  currentIndex: number;
  loggedAnimalIds: ReadonlySet<string>;
  preferUnlogged?: boolean;
}): number {
  const { queue, currentIndex, loggedAnimalIds, preferUnlogged = true } = params;
  if (queue.length === 0) return 0;

  const safeCurrent = Math.max(0, Math.min(queue.length - 1, currentIndex));

  if (preferUnlogged) {
    for (let i = safeCurrent + 1; i < queue.length; i++) {
      if (!loggedAnimalIds.has(queue[i].animal.id)) {
        return i;
      }
    }
    for (let i = 0; i < safeCurrent; i++) {
      if (!loggedAnimalIds.has(queue[i].animal.id)) {
        return i;
      }
    }
  }

  return Math.min(queue.length - 1, safeCurrent + 1);
}
