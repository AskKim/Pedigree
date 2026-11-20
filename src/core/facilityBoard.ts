/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Facility Pen Board & Hutch-Row Domain Engine (`src/core/facilityBoard.ts`).
 *
 * Groups physical housing units (`CageLocation`) by barn section / row / pasture,
 * links each pen to its active occupants (`IMP-028`), feedlot inventory stock/thresholds,
 * recurring maintenance schedules (pure UTC calendar math via `Date.UTC`), open linked tasks,
 * unassigned active animals, and unregistered housing labels.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) or Node imports.
 */

import {
  CageOccupancyEvaluation,
  evaluateSpeciesCagesOccupancy,
  isCageOccupyingAnimal,
  normalizeCageLabelKey,
  SpeciesCagesOccupancySummary,
} from './barnAlerts';
import {
  addDaysIso,
  Animal,
  BarnTask,
  CageLocation,
  HousingUnitType,
  isSameSpecies,
  todayDateIso,
} from './models';

export type MaintenanceDueState =
  | 'none'
  | 'unlogged'
  | 'ok'
  | 'due_soon'
  | 'due_today'
  | 'overdue';

export interface CageMaintenanceEvaluation {
  hasSchedule: boolean;
  intervalDays: number;
  taskLabel: string;
  lastCompletedDateIso: string;
  nextDueDateIso: string;
  daysUntilDue: number | null;
  state: MaintenanceDueState;
  needsAttention: boolean;
  statusText: string;
}

export interface CageFeedEvaluation {
  hasFeedLink: boolean;
  feedLotName: string;
  stockRemaining: number;
  stockUnit: string;
  dailyRationNote: string;
  lowThreshold: number;
  isLowStock: boolean;
  isDepleted: boolean;
  stockSummaryLabel: string;
}

export interface FacilityPenCardModel {
  cage: CageLocation;
  unitType: HousingUnitType;
  sectionName: string;
  occupancy: CageOccupancyEvaluation;
  maintenance: CageMaintenanceEvaluation;
  feed: CageFeedEvaluation;
  openLinkedTasks: BarnTask[];
}

export interface FacilitySectionGroup {
  sectionKey: string;
  sectionName: string;
  pens: FacilityPenCardModel[];
  totalPens: number;
  occupiedPens: number;
  totalOccupants: number;
  totalCapacity: number;
  overCapacityCount: number;
  maintenanceAttentionCount: number;
  lowFeedCount: number;
  occupantAnimals: Animal[];
}

export interface FacilityFeedLotRollup {
  lotKey: string;
  feedLotName: string;
  penIds: string[];
  penLabels: string[];
  penCount: number;
  animalCount: number;
  totalStockRemaining: number;
  stockUnit: string;
  lowStockPenCount: number;
  hasLowStock: boolean;
}

export interface UnregisteredCageGroup {
  labelKey: string;
  label: string;
  animals: Animal[];
}

export interface FacilityBoardModel {
  speciesName: string;
  todayIso: string;
  occupancySummary: SpeciesCagesOccupancySummary;
  sections: FacilitySectionGroup[];
  allPens: FacilityPenCardModel[];
  byCageId: Map<string, FacilityPenCardModel>;
  feedLots: FacilityFeedLotRollup[];
  unassignedActiveAnimals: Animal[];
  unregisteredCages: UnregisteredCageGroup[];
  totals: {
    totalPens: number;
    occupiedPens: number;
    emptyPens: number;
    totalOccupants: number;
    totalCapacity: number;
    overCapacityPens: number;
    maintenanceDueOrOverdue: number;
    lowFeedPens: number;
    unassignedCount: number;
    unregisteredLabelsCount: number;
  };
}

export type FacilityBoardFilter =
  | 'all'
  | 'over_capacity'
  | 'maintenance_due'
  | 'low_feed'
  | 'open'
  | 'occupied';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDateToUtcDayNumber(iso: string): number | null {
  if (!ISO_DATE_RE.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const dt = new Date(ms);
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return Math.floor(ms / 86_400_000);
}

/**
 * Pure calendar day difference (`targetIso - baseIso`) using `Date.UTC` (zero DST/timezone drift).
 */
export function diffCalendarDaysIso(baseIso: string, targetIso: string): number | null {
  const a = parseIsoDateToUtcDayNumber(baseIso);
  const b = parseIsoDateToUtcDayNumber(targetIso);
  if (a === null || b === null) return null;
  return b - a;
}

/**
 * Natural alphanumeric comparator (`Row 2` before `Row 10`, `Hutch R-02` before `Hutch R-10`).
 */
export function compareNaturalLabels(a: string, b: string): number {
  const tokensA = a.trim().split(/(\d+)/);
  const tokensB = b.trim().split(/(\d+)/);
  const len = Math.max(tokensA.length, tokensB.length);
  for (let i = 0; i < len; i++) {
    const ta = tokensA[i] ?? '';
    const tb = tokensB[i] ?? '';
    if (ta === tb) continue;
    const isNumA = /^\d+$/.test(ta);
    const isNumB = /^\d+$/.test(tb);
    if (isNumA && isNumB) {
      const diff = Number(ta) - Number(tb);
      if (diff !== 0) return diff;
    }
    const cmp = ta.localeCompare(tb, undefined, { sensitivity: 'base' });
    if (cmp !== 0) return cmp;
  }
  return a.localeCompare(b);
}

/**
 * Infers a clean default housing unit type when legacy `CageLocation` rows lack `unitType`.
 */
export function inferHousingUnitType(cage: Pick<CageLocation, 'unitType' | 'label' | 'section'>): HousingUnitType {
  if (cage.unitType) return cage.unitType;
  const combined = `${cage.label || ''} ${cage.section || ''}`.toLowerCase();
  if (/\b(?:pasture|paddock|field|grazing|lot)\b/.test(combined)) return 'pasture';
  if (/\b(?:stall|barn\s+bay|box\s+stall)\b/.test(combined)) return 'stall';
  if (/\b(?:colony|run|tractor)\b/.test(combined)) return 'colony';
  if (/\b(?:pen|kidding|lambing|farrowing|growout)\b/.test(combined)) return 'pen';
  if (/\b(?:hutch)\b/.test(combined)) return 'hutch';
  return 'cage';
}

export function formatHousingUnitTypeLabel(unitType: HousingUnitType): string {
  switch (unitType) {
    case 'hutch':
      return 'Hutch';
    case 'cage':
      return 'Cage';
    case 'pen':
      return 'Pen';
    case 'stall':
      return 'Stall';
    case 'pasture':
      return 'Pasture';
    case 'colony':
      return 'Colony';
    default:
      return 'Cage';
  }
}

/**
 * Evaluates recurring maintenance status for a single pen using pure calendar dates.
 */
export function evaluateCageMaintenanceStatus(
  cage: CageLocation,
  todayIso: string = todayDateIso()
): CageMaintenanceEvaluation {
  const intervalDays = Math.max(0, Math.round(Number(cage.maintenanceIntervalDays) || 0));
  const taskLabel = (cage.maintenanceTaskLabel || '').trim() || 'Sanitize & clean pen';
  const lastCompletedDateIso = (cage.lastMaintenanceDateIso || '').trim();

  if (intervalDays <= 0) {
    return {
      hasSchedule: false,
      intervalDays: 0,
      taskLabel: '',
      lastCompletedDateIso,
      nextDueDateIso: '',
      daysUntilDue: null,
      state: 'none',
      needsAttention: false,
      statusText: 'No recurring schedule',
    };
  }

  if (!ISO_DATE_RE.test(lastCompletedDateIso)) {
    return {
      hasSchedule: true,
      intervalDays,
      taskLabel,
      lastCompletedDateIso: '',
      nextDueDateIso: todayIso,
      daysUntilDue: 0,
      state: 'unlogged',
      needsAttention: true,
      statusText: `Every ${intervalDays}d · Never logged`,
    };
  }

  const nextDueDateIso = addDaysIso(lastCompletedDateIso, intervalDays);
  const daysUntilDue = diffCalendarDaysIso(todayIso, nextDueDateIso);

  if (daysUntilDue === null) {
    return {
      hasSchedule: true,
      intervalDays,
      taskLabel,
      lastCompletedDateIso,
      nextDueDateIso: '',
      daysUntilDue: null,
      state: 'unlogged',
      needsAttention: true,
      statusText: `Every ${intervalDays}d · Check date`,
    };
  }

  if (daysUntilDue < 0) {
    const overdueDays = Math.abs(daysUntilDue);
    return {
      hasSchedule: true,
      intervalDays,
      taskLabel,
      lastCompletedDateIso,
      nextDueDateIso,
      daysUntilDue,
      state: 'overdue',
      needsAttention: true,
      statusText: `Overdue by ${overdueDays}d (due ${nextDueDateIso})`,
    };
  }

  if (daysUntilDue === 0) {
    return {
      hasSchedule: true,
      intervalDays,
      taskLabel,
      lastCompletedDateIso,
      nextDueDateIso,
      daysUntilDue,
      state: 'due_today',
      needsAttention: true,
      statusText: `Due today (${nextDueDateIso})`,
    };
  }

  if (daysUntilDue <= 2) {
    return {
      hasSchedule: true,
      intervalDays,
      taskLabel,
      lastCompletedDateIso,
      nextDueDateIso,
      daysUntilDue,
      state: 'due_soon',
      needsAttention: false,
      statusText: `Due in ${daysUntilDue}d (${nextDueDateIso})`,
    };
  }

  return {
    hasSchedule: true,
    intervalDays,
    taskLabel,
    lastCompletedDateIso,
    nextDueDateIso,
    daysUntilDue,
    state: 'ok',
    needsAttention: false,
    statusText: `Next due ${nextDueDateIso} (in ${daysUntilDue}d)`,
  };
}

/**
 * Evaluates feedlot inventory linkage and low-stock status for a single pen.
 */
export function evaluateCageFeedStatus(cage: CageLocation): CageFeedEvaluation {
  const feedLotName = (cage.feedLotName || '').trim();
  const dailyRationNote = (cage.dailyRationNote || '').trim();
  const stockUnit = (cage.feedStockUnit || '').trim() || 'lbs';
  const stockRemaining =
    Number.isFinite(Number(cage.feedStockRemaining)) && Number(cage.feedStockRemaining) > 0
      ? Math.round(Number(cage.feedStockRemaining) * 100) / 100
      : 0;
  const lowThreshold =
    Number.isFinite(Number(cage.feedLowThreshold)) && Number(cage.feedLowThreshold) > 0
      ? Math.round(Number(cage.feedLowThreshold) * 100) / 100
      : 0;

  const hasFeedLink = Boolean(feedLotName || dailyRationNote || stockRemaining > 0 || lowThreshold > 0);
  const isDepleted = hasFeedLink && lowThreshold > 0 && stockRemaining <= 0;
  const isLowStock = hasFeedLink && lowThreshold > 0 && stockRemaining <= lowThreshold;

  let stockSummaryLabel = '';
  if (hasFeedLink) {
    if (stockRemaining > 0 || lowThreshold > 0) {
      stockSummaryLabel = `${stockRemaining} ${stockUnit} on hand`;
      if (isDepleted) {
        stockSummaryLabel += ' (Out)';
      } else if (isLowStock) {
        stockSummaryLabel += ` (Low ≤ ${lowThreshold})`;
      }
    } else if (dailyRationNote) {
      stockSummaryLabel = dailyRationNote;
    } else {
      stockSummaryLabel = feedLotName;
    }
  }

  return {
    hasFeedLink,
    feedLotName,
    stockRemaining,
    stockUnit,
    dailyRationNote,
    lowThreshold,
    isLowStock,
    isDepleted,
    stockSummaryLabel,
  };
}

/**
 * Builds a complete, single-pass visual Facility Pen Board model for a single species.
 */
export function buildFacilityBoardModel(params: {
  cages: readonly CageLocation[];
  animals: readonly Animal[];
  tasks: readonly BarnTask[];
  speciesName: string;
  todayIso?: string;
}): FacilityBoardModel {
  const todayIso = params.todayIso || todayDateIso();
  const speciesCages = params.cages.filter((c) => isSameSpecies(c.species, params.speciesName));
  const speciesAnimals = params.animals.filter((a) => isSameSpecies(a.species, params.speciesName));
  const openSpeciesTasks = params.tasks.filter(
    (t) => !t.completed && isSameSpecies(t.species, params.speciesName)
  );

  const occupancySummary = evaluateSpeciesCagesOccupancy(
    speciesCages,
    speciesAnimals,
    params.speciesName
  );

  // Index open tasks by linkedAnimalId for O(1) attachment to pens
  const openTasksByAnimalId = new Map<string, BarnTask[]>();
  for (const task of openSpeciesTasks) {
    if (!task.linkedAnimalId) continue;
    const bucket = openTasksByAnimalId.get(task.linkedAnimalId);
    if (bucket) bucket.push(task);
    else openTasksByAnimalId.set(task.linkedAnimalId, [task]);
  }

  const allPens: FacilityPenCardModel[] = [];
  const byCageId = new Map<string, FacilityPenCardModel>();
  const sectionBuckets = new Map<string, { name: string; pens: FacilityPenCardModel[] }>();
  const feedLotMap = new Map<
    string,
    {
      feedLotName: string;
      penIds: string[];
      penLabels: string[];
      animalCount: number;
      totalStockRemaining: number;
      stockUnit: string;
      lowStockPenCount: number;
    }
  >();

  let occupiedPens = 0;
  let emptyPens = 0;
  let totalOccupants = 0;
  let totalCapacity = 0;
  let overCapacityPens = 0;
  let maintenanceDueOrOverdue = 0;
  let lowFeedPens = 0;

  for (const cage of speciesCages) {
    const occupancy = occupancySummary.byCageId.get(cage.id);
    if (!occupancy) continue;

    const maintenance = evaluateCageMaintenanceStatus(cage, todayIso);
    const feed = evaluateCageFeedStatus(cage);
    const unitType = inferHousingUnitType(cage);
    const sectionName = (cage.section || '').trim() || 'General Barn';
    const sectionKey = sectionName.toLowerCase();

    // Collect open tasks tied to occupants OR referencing `[CageLabel]` in task title
    const seenTaskIds = new Set<string>();
    const openLinkedTasks: BarnTask[] = [];
    const cageBracketNeedle = `[${cage.label.trim().toLowerCase()}]`;
    for (const occ of occupancy.occupants) {
      const animalTasks = openTasksByAnimalId.get(occ.id);
      if (!animalTasks) continue;
      for (const t of animalTasks) {
        if (!seenTaskIds.has(t.id)) {
          seenTaskIds.add(t.id);
          openLinkedTasks.push(t);
        }
      }
    }
    if (cage.label.trim()) {
      for (const t of openSpeciesTasks) {
        if (seenTaskIds.has(t.id)) continue;
        if (t.title.toLowerCase().includes(cageBracketNeedle)) {
          seenTaskIds.add(t.id);
          openLinkedTasks.push(t);
        }
      }
    }
    openLinkedTasks.sort((a, b) => (a.dueDateIso || '9999').localeCompare(b.dueDateIso || '9999'));

    const card: FacilityPenCardModel = {
      cage,
      unitType,
      sectionName,
      occupancy,
      maintenance,
      feed,
      openLinkedTasks,
    };

    allPens.push(card);
    byCageId.set(cage.id, card);

    if (occupancy.occupantCount > 0) occupiedPens += 1;
    else emptyPens += 1;
    totalOccupants += occupancy.occupantCount;
    totalCapacity += occupancy.capacity;
    if (occupancy.isOverCapacity) overCapacityPens += 1;
    if (maintenance.needsAttention) maintenanceDueOrOverdue += 1;
    if (feed.isLowStock) lowFeedPens += 1;

    let sec = sectionBuckets.get(sectionKey);
    if (!sec) {
      sec = { name: sectionName, pens: [] };
      sectionBuckets.set(sectionKey, sec);
    }
    sec.pens.push(card);

    if (feed.feedLotName) {
      const lotKey = feed.feedLotName.toLowerCase();
      let lot = feedLotMap.get(lotKey);
      if (!lot) {
        lot = {
          feedLotName: feed.feedLotName,
          penIds: [],
          penLabels: [],
          animalCount: 0,
          totalStockRemaining: 0,
          stockUnit: feed.stockUnit,
          lowStockPenCount: 0,
        };
        feedLotMap.set(lotKey, lot);
      }
      lot.penIds.push(cage.id);
      lot.penLabels.push(cage.label);
      lot.animalCount += occupancy.occupantCount;
      lot.totalStockRemaining =
        Math.round((lot.totalStockRemaining + feed.stockRemaining) * 100) / 100;
      if (feed.isLowStock) {
        lot.lowStockPenCount += 1;
      }
    }
  }

  // Sort pens within each section naturally, and sort sections naturally with General Barn last
  const sections: FacilitySectionGroup[] = Array.from(sectionBuckets.entries())
    .map(([sectionKey, bucket]) => {
      const sortedPens = [...bucket.pens].sort((a, b) =>
        compareNaturalLabels(a.cage.label, b.cage.label)
      );
      const seenOcc = new Set<string>();
      const occupantAnimals: Animal[] = [];
      let secOccupied = 0;
      let secOccupants = 0;
      let secCap = 0;
      let secOver = 0;
      let secMaint = 0;
      let secLowFeed = 0;
      for (const pen of sortedPens) {
        if (pen.occupancy.occupantCount > 0) secOccupied += 1;
        secOccupants += pen.occupancy.occupantCount;
        secCap += pen.occupancy.capacity;
        if (pen.occupancy.isOverCapacity) secOver += 1;
        if (pen.maintenance.needsAttention) secMaint += 1;
        if (pen.feed.isLowStock) secLowFeed += 1;
        for (const a of pen.occupancy.occupants) {
          if (!seenOcc.has(a.id)) {
            seenOcc.add(a.id);
            occupantAnimals.push(a);
          }
        }
      }
      return {
        sectionKey,
        sectionName: bucket.name,
        pens: sortedPens,
        totalPens: sortedPens.length,
        occupiedPens: secOccupied,
        totalOccupants: secOccupants,
        totalCapacity: secCap,
        overCapacityCount: secOver,
        maintenanceAttentionCount: secMaint,
        lowFeedCount: secLowFeed,
        occupantAnimals,
      };
    })
    .sort((a, b) => {
      if (a.sectionKey === 'general barn' && b.sectionKey !== 'general barn') return 1;
      if (b.sectionKey === 'general barn' && a.sectionKey !== 'general barn') return -1;
      return compareNaturalLabels(a.sectionName, b.sectionName);
    });

  // Identify unassigned active animals & animals sitting in unregistered cageLocation strings
  const unassignedActiveAnimals: Animal[] = [];
  const unregisteredMap = new Map<string, { label: string; animals: Animal[] }>();

  for (const animal of speciesAnimals) {
    if (!isCageOccupyingAnimal(animal)) continue;
    const rawLabel = (animal.cageLocation || '').trim();
    if (!rawLabel) {
      unassignedActiveAnimals.push(animal);
      continue;
    }
    const key = normalizeCageLabelKey(rawLabel);
    if (!occupancySummary.byLabelKey.has(key)) {
      let bucket = unregisteredMap.get(key);
      if (!bucket) {
        bucket = { label: rawLabel, animals: [] };
        unregisteredMap.set(key, bucket);
      }
      bucket.animals.push(animal);
    }
  }

  unassignedActiveAnimals.sort((a, b) =>
    (a.name || '').localeCompare(b.name || '') || (a.tattoo || '').localeCompare(b.tattoo || '')
  );

  const unregisteredCages: UnregisteredCageGroup[] = Array.from(unregisteredMap.entries())
    .map(([labelKey, entry]) => ({
      labelKey,
      label: entry.label,
      animals: [...entry.animals].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    }))
    .sort((a, b) => compareNaturalLabels(a.label, b.label));

  const feedLots: FacilityFeedLotRollup[] = Array.from(feedLotMap.entries())
    .map(([lotKey, entry]) => ({
      lotKey,
      feedLotName: entry.feedLotName,
      penIds: entry.penIds,
      penLabels: [...entry.penLabels].sort(compareNaturalLabels),
      penCount: entry.penIds.length,
      animalCount: entry.animalCount,
      totalStockRemaining: entry.totalStockRemaining,
      stockUnit: entry.stockUnit,
      lowStockPenCount: entry.lowStockPenCount,
      hasLowStock: entry.lowStockPenCount > 0,
    }))
    .sort((a, b) => Number(b.hasLowStock) - Number(a.hasLowStock) || compareNaturalLabels(a.feedLotName, b.feedLotName));

  return {
    speciesName: params.speciesName,
    todayIso,
    occupancySummary,
    sections,
    allPens,
    byCageId,
    feedLots,
    unassignedActiveAnimals,
    unregisteredCages,
    totals: {
      totalPens: allPens.length,
      occupiedPens,
      emptyPens,
      totalOccupants,
      totalCapacity,
      overCapacityPens,
      maintenanceDueOrOverdue,
      lowFeedPens,
      unassignedCount: unassignedActiveAnimals.length,
      unregisteredLabelsCount: unregisteredCages.length,
    },
  };
}

/**
 * Filters a pen card against a Facility Board quick-filter pill.
 */
export function matchesFacilityBoardFilter(
  pen: FacilityPenCardModel,
  filter: FacilityBoardFilter
): boolean {
  switch (filter) {
    case 'over_capacity':
      return pen.occupancy.isOverCapacity;
    case 'maintenance_due':
      return pen.maintenance.needsAttention || pen.maintenance.state === 'due_soon';
    case 'low_feed':
      return pen.feed.isLowStock;
    case 'open':
      return pen.occupancy.occupantCount === 0 || pen.occupancy.availableSpots > 0;
    case 'occupied':
      return pen.occupancy.occupantCount > 0;
    case 'all':
    default:
      return true;
  }
}

/**
 * Builds a Master Task List recurring maintenance reminder draft for the next cycle
 * after logging maintenance on a pen.
 */
export function buildCageMaintenanceTaskDraft(
  cage: CageLocation,
  completedDateIso: string = todayDateIso()
): Omit<BarnTask, 'id' | 'createdAt' | 'updatedAt'> | null {
  const intervalDays = Math.max(0, Math.round(Number(cage.maintenanceIntervalDays) || 0));
  if (intervalDays <= 0) return null;
  const nextDue = addDaysIso(completedDateIso, intervalDays);
  if (!nextDue) return null;
  const label = (cage.maintenanceTaskLabel || '').trim() || 'Sanitize & clean pen';
  return {
    species: cage.species,
    title: `[${cage.label}] ${label}`,
    category: 'Care',
    priority: 'Normal',
    dueDateIso: nextDue,
    linkedAnimalId: '',
    linkedAnimalName: '',
    linkedBreedingId: '',
    completed: false,
  };
}
