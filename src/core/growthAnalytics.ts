/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Growth, Rate of Gain, Comparative Weight & Litter Survival Analytics Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) or framework dependencies.
 * Computes litter survival rates, seasonal maternal/sire milestone curves (3w/6w/8w),
 * multi-animal Rate of Gain (ADG) age-in-days series, and cohort/goal curve comparisons.
 */

import {
  Animal,
  BreedingRecord,
  CareLog,
  formatWeight,
  isSameSpecies,
  LitterWeightMilestone,
  normalizeLitterWeightMilestones,
  normalizeTargetWeightCurve,
  SpeciesProfile,
  TargetWeightPoint,
  todayDateIso,
  WeightUnit,
} from './models';

export interface SeasonBucket {
  seasonKey: string;
  seasonName: 'Winter' | 'Spring' | 'Summer' | 'Fall';
  year: number;
  sortOrder: number;
}

export interface ResolvedLitterMilestone {
  id: string;
  ageDays: number;
  dateIso?: string;
  label: string;
  liveCount?: number;
  totalWeightGrams: number;
  avgWeightGrams: number;
  source: 'litter_milestone' | 'offspring_logs';
  offspringSampleCount?: number;
}

export interface LitterSurvivalMetrics {
  breeding: BreedingRecord;
  birthDateIso: string;
  season: SeasonBucket | null;
  totalBorn: number;
  liveCount: number;
  stillbornCount: number;
  fosteredCount: number;
  rearingBase: number;
  weanedCount: number;
  liveBirthRatePct: number | null;
  weaningSurvivalRatePct: number | null;
  milestones: ResolvedLitterMilestone[];
  avg3WeekGrams: number | null;
  avg6WeekGrams: number | null;
  avg8WeekGrams: number | null;
  avgWeanGrams: number | null;
  litterAdgGramsPerDay: number | null;
}

export interface ParentSurvivalPerformanceSummary {
  parentId: string;
  parentName: string;
  parentTattoo: string;
  role: 'dam' | 'sire';
  totalBreedings: number;
  settledBreedings: number;
  missedCount: number;
  conceptionRatePct: number | null;
  littersBornCount: number;
  littersWeanedCount: number;
  totalLiveBorn: number;
  totalStillborn: number;
  totalFostered: number;
  totalWeaned: number;
  avgLivePerLitter: number | null;
  avgWeanedPerLitter: number | null;
  liveBirthRatePct: number | null;
  weaningSurvivalRatePct: number | null;
  avg3WeekGrams: number | null;
  avg6WeekGrams: number | null;
  avg8WeekGrams: number | null;
  avgWeanGrams: number | null;
  meanLitterAdgGramsPerDay: number | null;
  litters: LitterSurvivalMetrics[];
}

export interface SeasonalSurvivalSummary {
  seasonKey: string;
  seasonName: SeasonBucket['seasonName'];
  year: number;
  sortOrder: number;
  littersBornCount: number;
  missedCount: number;
  totalLiveBorn: number;
  totalStillborn: number;
  totalFostered: number;
  totalWeaned: number;
  liveBirthRatePct: number | null;
  weaningSurvivalRatePct: number | null;
  avg3WeekGrams: number | null;
  avg6WeekGrams: number | null;
  avg8WeekGrams: number | null;
  avgWeanGrams: number | null;
}

export interface LitterSurvivalEvaluationResult {
  speciesName: string;
  litters: LitterSurvivalMetrics[];
  damSummaries: ParentSurvivalPerformanceSummary[];
  sireSummaries: ParentSurvivalPerformanceSummary[];
  seasonalSummaries: SeasonalSurvivalSummary[];
  overallSummary: {
    littersBornCount: number;
    missedCount: number;
    totalLiveBorn: number;
    totalStillborn: number;
    totalWeaned: number;
    liveBirthRatePct: number | null;
    weaningSurvivalRatePct: number | null;
    avg3WeekGrams: number | null;
    avg6WeekGrams: number | null;
    avg8WeekGrams: number | null;
  };
}

export interface AnimalGrowthPoint {
  ageDays: number;
  dateIso: string;
  weightGrams: number;
  segmentAdgGramsPerDay: number | null;
  label: string;
  source: 'care_log' | 'profile_weight';
}

export interface AnimalGrowthSeries {
  animal: Animal;
  hasBirthDate: boolean;
  points: AnimalGrowthPoint[];
  startAgeDays: number | null;
  startWeightGrams: number | null;
  latestAgeDays: number | null;
  latestWeightGrams: number | null;
  totalGainGrams: number | null;
  spanDays: number | null;
  overallAdgGramsPerDay: number | null;
  peakAdgGramsPerDay: number | null;
  targetDeltaGrams: number | null;
  targetDeltaPct: number | null;
}

export interface CohortBenchmarkPoint {
  ageDays: number;
  meanWeightGrams: number;
  minWeightGrams: number;
  maxWeightGrams: number;
  sampleCount: number;
}

export interface ComparativeGrowthChartModel {
  series: AnimalGrowthSeries[];
  targetCurve: TargetWeightPoint[];
  cohortCurve: CohortBenchmarkPoint[];
  minAgeDays: number;
  maxAgeDays: number;
  maxWeightGrams: number;
  maxAdgGramsPerDay: number;
  minAdgGramsPerDay: number;
}

export const GROWTH_CHART_COLORS: ReadonlyArray<string> = [
  '#2d5a3d', // Barn sage
  '#b85d3b', // Terracotta
  '#2e5c78', // Slate blue
  '#8c6239', // Warm chestnut
  '#6a4c93', // Plum
  '#198276', // Deep teal
  '#a63d40', // Crimson
  '#526a40', // Olive
];

function parseIsoUtcMs(iso: string | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return null;
  const [yStr, mStr, dStr] = iso.trim().split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  const ms = dt.getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Computes exact signed UTC calendar day difference (`toIso - fromIso`), or `null` if invalid.
 */
export function diffCalendarDaysSigned(
  fromIso: string | undefined,
  toIso: string | undefined
): number | null {
  const a = parseIsoUtcMs(fromIso);
  const b = parseIsoUtcMs(toIso);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Computes non-negative calendar day difference (`toIso - fromIso`), returning `null` if `toIso < fromIso`.
 */
export function diffCalendarDaysNonNeg(
  fromIso: string | undefined,
  toIso: string | undefined
): number | null {
  const diff = diffCalendarDaysSigned(fromIso, toIso);
  if (diff === null || diff < 0) return null;
  return diff;
}

/**
 * Classifies a `YYYY-MM-DD` date into a chronological meteorological season bucket.
 */
export function resolveMeteorologicalSeason(dateIso: string | undefined): SeasonBucket | null {
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso.trim())) return null;
  const parts = dateIso.trim().split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }

  let seasonName: SeasonBucket['seasonName'];
  let intraYearRank: number;
  if (month >= 3 && month <= 5) {
    seasonName = 'Spring';
    intraYearRank = 1;
  } else if (month >= 6 && month <= 8) {
    seasonName = 'Summer';
    intraYearRank = 2;
  } else if (month >= 9 && month <= 11) {
    seasonName = 'Fall';
    intraYearRank = 3;
  } else {
    seasonName = 'Winter';
    intraYearRank = month === 12 ? 4 : 0;
  }

  return {
    seasonKey: `${seasonName} ${year}`,
    seasonName,
    year,
    sortOrder: year * 10 + intraYearRank,
  };
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function meanNullable(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

function pickClosestMilestoneAvg(
  milestones: ResolvedLitterMilestone[],
  targetDays: number,
  toleranceDays: number
): number | null {
  let best: ResolvedLitterMilestone | null = null;
  let bestDist = Infinity;
  for (const m of milestones) {
    if (m.avgWeightGrams <= 0) continue;
    const dist = Math.abs(m.ageDays - targetDays);
    if (dist <= toleranceDays && dist < bestDist) {
      best = m;
      bestDist = dist;
    }
  }
  return best ? best.avgWeightGrams : null;
}

/**
 * Evaluates litter survival rates, 3/6/8-week & weaning litter weight milestones,
 * per-dam/per-sire performance tables, and seasonal maternal curves for one species.
 */
export function evaluateLitterSurvivalAndMilestones(params: {
  speciesProfile: SpeciesProfile;
  breedings: BreedingRecord[];
  animals: Animal[];
  careLogs: CareLog[];
  seasonFilter?: string;
}): LitterSurvivalEvaluationResult {
  const { speciesProfile, breedings, animals, careLogs, seasonFilter } = params;
  const spName = speciesProfile.name;
  const weanTargetDays = Math.max(7, speciesProfile.weanDaysAfterBirth || 42);

  const speciesBreedings = breedings.filter((b) => isSameSpecies(b.species, spName));
  const speciesAnimals = animals.filter((a) => isSameSpecies(a.species, spName));
  const animalById = new Map<string, Animal>();
  for (const a of speciesAnimals) {
    animalById.set(a.id, a);
  }

  // Index weight checks per animal for offspring fallback milestones
  const weightLogsByAnimalId = new Map<string, CareLog[]>();
  for (const l of careLogs) {
    if (l.weightGrams <= 0) continue;
    if (l.species && !isSameSpecies(l.species, spName)) continue;
    const arr = weightLogsByAnimalId.get(l.animalId) || [];
    arr.push(l);
    weightLogsByAnimalId.set(l.animalId, arr);
  }

  // Index offspring by parent-pair + birthDate key for fast lookup
  const offspringByLitterKey = new Map<string, Animal[]>();
  for (const a of speciesAnimals) {
    if (!a.birthDateIso || (!a.sireId && !a.damId)) continue;
    const key = `${a.sireId || ''}::${a.damId || ''}::${a.birthDateIso}`;
    const arr = offspringByLitterKey.get(key) || [];
    arr.push(a);
    offspringByLitterKey.set(key, arr);
  }

  const allLitters: LitterSurvivalMetrics[] = [];
  const missedBreedings: BreedingRecord[] = [];

  for (const b of speciesBreedings) {
    const isBornOrWeaned =
      b.status === 'Born' ||
      b.status === 'Weaned' ||
      Boolean(b.actualBirthDateIso) ||
      b.liveCount > 0 ||
      b.stillbornCount > 0 ||
      (b.litterWeightMilestones?.length ?? 0) > 0;

    if (b.status === 'Missed') {
      missedBreedings.push(b);
      continue;
    }
    if (!isBornOrWeaned) continue;

    const birthDateIso = b.actualBirthDateIso || b.expectedDueDateIso || b.bredDateIso;
    const season = resolveMeteorologicalSeason(birthDateIso || b.bredDateIso);
    if (seasonFilter && seasonFilter !== 'all' && season?.seasonKey !== seasonFilter) {
      continue;
    }

    const liveCount = Math.max(0, b.liveCount || 0);
    const stillbornCount = Math.max(0, b.stillbornCount || 0);
    const fosteredCount = b.fosteredCount || 0;
    const weanedCount = Math.max(0, b.weanedCount || 0);
    const totalBorn = liveCount + stillbornCount;
    const rearingBase = Math.max(0, liveCount + fosteredCount);

    const liveBirthRatePct =
      totalBorn > 0 ? round1((liveCount / totalBorn) * 100) : null;
    const weaningSurvivalRatePct =
      (b.status === 'Weaned' || weanedCount > 0) && rearingBase > 0
        ? Math.min(100, round1((weanedCount / rearingBase) * 100))
        : null;

    const explicitMilestones: LitterWeightMilestone[] = normalizeLitterWeightMilestones(
      b.litterWeightMilestones
    );
    const resolvedMilestones: ResolvedLitterMilestone[] = [];

    for (const m of explicitMilestones) {
      const denomCount =
        m.liveCount !== undefined && m.liveCount > 0
          ? m.liveCount
          : rearingBase > 0
          ? rearingBase
          : liveCount > 0
          ? liveCount
          : 1;
      const avgWeightGrams =
        m.avgWeightGrams && m.avgWeightGrams > 0
          ? m.avgWeightGrams
          : m.totalWeightGrams > 0
          ? Math.round(m.totalWeightGrams / denomCount)
          : 0;
      const totalWeightGrams =
        m.totalWeightGrams > 0
          ? m.totalWeightGrams
          : avgWeightGrams > 0
          ? Math.round(avgWeightGrams * denomCount)
          : 0;
      resolvedMilestones.push({
        id: m.id,
        ageDays: m.ageDays,
        dateIso: m.dateIso,
        label: m.label,
        liveCount: m.liveCount,
        totalWeightGrams,
        avgWeightGrams,
        source: 'litter_milestone',
      });
    }

    // Supplement with linked offspring CareLog weights when no explicit milestone covers that age
    if (b.actualBirthDateIso) {
      const litterKey = `${b.sireId || ''}::${b.damId || ''}::${b.actualBirthDateIso}`;
      const linkedOffspring = offspringByLitterKey.get(litterKey) || [];
      if (linkedOffspring.length > 0) {
        const byAgeBucket = new Map<number, number[]>();
        for (const kit of linkedOffspring) {
          const logs = weightLogsByAnimalId.get(kit.id) || [];
          for (const log of logs) {
            const age = diffCalendarDaysNonNeg(b.actualBirthDateIso, log.dateIso);
            if (age === null || age > 365) continue;
            const list = byAgeBucket.get(age) || [];
            list.push(log.weightGrams);
            byAgeBucket.set(age, list);
          }
        }
        for (const [ageDays, weights] of byAgeBucket.entries()) {
          const alreadyCovered = resolvedMilestones.some(
            (em) => Math.abs(em.ageDays - ageDays) <= 2
          );
          if (alreadyCovered || weights.length === 0) continue;
          const totalWeightGrams = Math.round(weights.reduce((s, w) => s + w, 0));
          const avgWeightGrams = Math.round(totalWeightGrams / weights.length);
          resolvedMilestones.push({
            id: `auto-${b.id}-${ageDays}`,
            ageDays,
            label: `${ageDays}-Day Offspring Logs`,
            liveCount: weights.length,
            totalWeightGrams,
            avgWeightGrams,
            source: 'offspring_logs',
            offspringSampleCount: weights.length,
          });
        }
      }
    }

    resolvedMilestones.sort((x, y) => x.ageDays - y.ageDays);

    const avg3WeekGrams = pickClosestMilestoneAvg(resolvedMilestones, 21, 4);
    const avg6WeekGrams = pickClosestMilestoneAvg(resolvedMilestones, 42, 4);
    const avg8WeekGrams = pickClosestMilestoneAvg(resolvedMilestones, 56, 4);
    const avgWeanGrams = pickClosestMilestoneAvg(resolvedMilestones, weanTargetDays, 7);

    const weighedPoints = resolvedMilestones.filter((m) => m.avgWeightGrams > 0);
    let litterAdgGramsPerDay: number | null = null;
    if (weighedPoints.length >= 2) {
      const first = weighedPoints[0];
      const last = weighedPoints[weighedPoints.length - 1];
      const span = last.ageDays - first.ageDays;
      if (span > 0) {
        litterAdgGramsPerDay = round1((last.avgWeightGrams - first.avgWeightGrams) / span);
      }
    } else if (weighedPoints.length === 1 && weighedPoints[0].ageDays > 0) {
      litterAdgGramsPerDay = round1(weighedPoints[0].avgWeightGrams / weighedPoints[0].ageDays);
    }

    allLitters.push({
      breeding: b,
      birthDateIso,
      season,
      totalBorn,
      liveCount,
      stillbornCount,
      fosteredCount,
      rearingBase,
      weanedCount,
      liveBirthRatePct,
      weaningSurvivalRatePct,
      milestones: resolvedMilestones,
      avg3WeekGrams,
      avg6WeekGrams,
      avg8WeekGrams,
      avgWeanGrams,
      litterAdgGramsPerDay,
    });
  }

  allLitters.sort((a, b) => (b.birthDateIso || '').localeCompare(a.birthDateIso || ''));

  const buildParentSummaries = (role: 'dam' | 'sire'): ParentSurvivalPerformanceSummary[] => {
    const grouped = new Map<
      string,
      {
        parentId: string;
        parentName: string;
        parentTattoo: string;
        litters: LitterSurvivalMetrics[];
        missedCount: number;
        totalBreedings: number;
        settledBreedings: number;
        positiveBreedings: number;
      }
    >();

    const ensureBucket = (id: string, fallbackName: string) => {
      const key = id || `name:${fallbackName.trim().toLowerCase()}`;
      let bucket = grouped.get(key);
      if (!bucket) {
        const animal = id ? animalById.get(id) : undefined;
        bucket = {
          parentId: id,
          parentName: animal?.name || fallbackName || 'Unknown',
          parentTattoo: animal?.tattoo || '',
          litters: [],
          missedCount: 0,
          totalBreedings: 0,
          settledBreedings: 0,
          positiveBreedings: 0,
        };
        grouped.set(key, bucket);
      }
      return bucket;
    };

    for (const b of speciesBreedings) {
      const bSeason = resolveMeteorologicalSeason(b.actualBirthDateIso || b.expectedDueDateIso || b.bredDateIso);
      if (seasonFilter && seasonFilter !== 'all' && bSeason?.seasonKey !== seasonFilter) {
        continue;
      }
      const pId = role === 'dam' ? b.damId : b.sireId;
      const pName = role === 'dam' ? b.damName : b.sireName;
      if (!pId && !pName) continue;
      const bucket = ensureBucket(pId, pName);
      bucket.totalBreedings += 1;
      if (b.status !== 'Planned') {
        bucket.settledBreedings += 1;
      }
      if (b.status === 'Missed') {
        bucket.missedCount += 1;
      } else if (b.status === 'Born' || b.status === 'Weaned' || b.status === 'Palpated Positive') {
        bucket.positiveBreedings += 1;
      }
    }

    for (const litter of allLitters) {
      const pId = role === 'dam' ? litter.breeding.damId : litter.breeding.sireId;
      const pName = role === 'dam' ? litter.breeding.damName : litter.breeding.sireName;
      if (!pId && !pName) continue;
      const bucket = ensureBucket(pId, pName);
      bucket.litters.push(litter);
    }

    const out: ParentSurvivalPerformanceSummary[] = [];
    for (const bucket of grouped.values()) {
      if (bucket.litters.length === 0 && bucket.missedCount === 0) continue;

      const totalLiveBorn = bucket.litters.reduce((s, l) => s + l.liveCount, 0);
      const totalStillborn = bucket.litters.reduce((s, l) => s + l.stillbornCount, 0);
      const totalFostered = bucket.litters.reduce((s, l) => s + l.fosteredCount, 0);
      const totalWeaned = bucket.litters.reduce((s, l) => s + l.weanedCount, 0);
      const totalBornAll = totalLiveBorn + totalStillborn;

      const weanedLitters = bucket.litters.filter(
        (l) => l.breeding.status === 'Weaned' || l.weanedCount > 0
      );
      const weanedRearingBase = weanedLitters.reduce((s, l) => s + l.rearingBase, 0);
      const weanedInWeanedLitters = weanedLitters.reduce((s, l) => s + l.weanedCount, 0);

      const liveBirthRatePct =
        totalBornAll > 0 ? round1((totalLiveBorn / totalBornAll) * 100) : null;
      const weaningSurvivalRatePct =
        weanedRearingBase > 0
          ? Math.min(100, round1((weanedInWeanedLitters / weanedRearingBase) * 100))
          : null;
      const conceptionRatePct =
        bucket.settledBreedings > 0
          ? round1((bucket.positiveBreedings / bucket.settledBreedings) * 100)
          : null;

      const avg3 = meanNullable(bucket.litters.map((l) => l.avg3WeekGrams));
      const avg6 = meanNullable(bucket.litters.map((l) => l.avg6WeekGrams));
      const avg8 = meanNullable(bucket.litters.map((l) => l.avg8WeekGrams));
      const avgW = meanNullable(bucket.litters.map((l) => l.avgWeanGrams));
      const avgAdg = meanNullable(bucket.litters.map((l) => l.litterAdgGramsPerDay));

      out.push({
        parentId: bucket.parentId,
        parentName: bucket.parentName,
        parentTattoo: bucket.parentTattoo,
        role,
        totalBreedings: bucket.totalBreedings,
        settledBreedings: bucket.settledBreedings,
        missedCount: bucket.missedCount,
        conceptionRatePct,
        littersBornCount: bucket.litters.length,
        littersWeanedCount: weanedLitters.length,
        totalLiveBorn,
        totalStillborn,
        totalFostered,
        totalWeaned,
        avgLivePerLitter:
          bucket.litters.length > 0 ? round1(totalLiveBorn / bucket.litters.length) : null,
        avgWeanedPerLitter:
          weanedLitters.length > 0 ? round1(weanedInWeanedLitters / weanedLitters.length) : null,
        liveBirthRatePct,
        weaningSurvivalRatePct,
        avg3WeekGrams: avg3 !== null ? Math.round(avg3) : null,
        avg6WeekGrams: avg6 !== null ? Math.round(avg6) : null,
        avg8WeekGrams: avg8 !== null ? Math.round(avg8) : null,
        avgWeanGrams: avgW !== null ? Math.round(avgW) : null,
        meanLitterAdgGramsPerDay: avgAdg !== null ? round1(avgAdg) : null,
        litters: bucket.litters,
      });
    }

    return out.sort(
      (a, b) =>
        b.littersBornCount - a.littersBornCount ||
        (b.weaningSurvivalRatePct ?? -1) - (a.weaningSurvivalRatePct ?? -1) ||
        a.parentName.localeCompare(b.parentName)
    );
  };

  // Seasonal aggregation
  const seasonMap = new Map<
    string,
    {
      bucket: SeasonBucket;
      litters: LitterSurvivalMetrics[];
      missedCount: number;
    }
  >();

  for (const l of allLitters) {
    if (!l.season) continue;
    let entry = seasonMap.get(l.season.seasonKey);
    if (!entry) {
      entry = { bucket: l.season, litters: [], missedCount: 0 };
      seasonMap.set(l.season.seasonKey, entry);
    }
    entry.litters.push(l);
  }
  for (const mb of missedBreedings) {
    const s = resolveMeteorologicalSeason(mb.expectedDueDateIso || mb.bredDateIso);
    if (!s) continue;
    if (seasonFilter && seasonFilter !== 'all' && s.seasonKey !== seasonFilter) continue;
    let entry = seasonMap.get(s.seasonKey);
    if (!entry) {
      entry = { bucket: s, litters: [], missedCount: 0 };
      seasonMap.set(s.seasonKey, entry);
    }
    entry.missedCount += 1;
  }

  const seasonalSummaries: SeasonalSurvivalSummary[] = Array.from(seasonMap.values())
    .sort((a, b) => a.bucket.sortOrder - b.bucket.sortOrder)
    .map(({ bucket, litters, missedCount }) => {
      const totalLiveBorn = litters.reduce((s, l) => s + l.liveCount, 0);
      const totalStillborn = litters.reduce((s, l) => s + l.stillbornCount, 0);
      const totalFostered = litters.reduce((s, l) => s + l.fosteredCount, 0);
      const totalWeaned = litters.reduce((s, l) => s + l.weanedCount, 0);
      const totalBornAll = totalLiveBorn + totalStillborn;
      const weanedLitters = litters.filter(
        (l) => l.breeding.status === 'Weaned' || l.weanedCount > 0
      );
      const weanedBase = weanedLitters.reduce((s, l) => s + l.rearingBase, 0);
      const weanedSum = weanedLitters.reduce((s, l) => s + l.weanedCount, 0);
      const avg3 = meanNullable(litters.map((l) => l.avg3WeekGrams));
      const avg6 = meanNullable(litters.map((l) => l.avg6WeekGrams));
      const avg8 = meanNullable(litters.map((l) => l.avg8WeekGrams));
      const avgW = meanNullable(litters.map((l) => l.avgWeanGrams));
      return {
        seasonKey: bucket.seasonKey,
        seasonName: bucket.seasonName,
        year: bucket.year,
        sortOrder: bucket.sortOrder,
        littersBornCount: litters.length,
        missedCount,
        totalLiveBorn,
        totalStillborn,
        totalFostered,
        totalWeaned,
        liveBirthRatePct:
          totalBornAll > 0 ? round1((totalLiveBorn / totalBornAll) * 100) : null,
        weaningSurvivalRatePct:
          weanedBase > 0 ? Math.min(100, round1((weanedSum / weanedBase) * 100)) : null,
        avg3WeekGrams: avg3 !== null ? Math.round(avg3) : null,
        avg6WeekGrams: avg6 !== null ? Math.round(avg6) : null,
        avg8WeekGrams: avg8 !== null ? Math.round(avg8) : null,
        avgWeanGrams: avgW !== null ? Math.round(avgW) : null,
      };
    });

  const overallLive = allLitters.reduce((s, l) => s + l.liveCount, 0);
  const overallStillborn = allLitters.reduce((s, l) => s + l.stillbornCount, 0);
  const overallBornAll = overallLive + overallStillborn;
  const overallWeanedLitters = allLitters.filter(
    (l) => l.breeding.status === 'Weaned' || l.weanedCount > 0
  );
  const overallWeanedBase = overallWeanedLitters.reduce((s, l) => s + l.rearingBase, 0);
  const overallWeanedSum = overallWeanedLitters.reduce((s, l) => s + l.weanedCount, 0);
  const overallAvg3 = meanNullable(allLitters.map((l) => l.avg3WeekGrams));
  const overallAvg6 = meanNullable(allLitters.map((l) => l.avg6WeekGrams));
  const overallAvg8 = meanNullable(allLitters.map((l) => l.avg8WeekGrams));

  return {
    speciesName: spName,
    litters: allLitters,
    damSummaries: buildParentSummaries('dam'),
    sireSummaries: buildParentSummaries('sire'),
    seasonalSummaries,
    overallSummary: {
      littersBornCount: allLitters.length,
      missedCount: missedBreedings.filter((mb) => {
        if (!seasonFilter || seasonFilter === 'all') return true;
        const s = resolveMeteorologicalSeason(mb.expectedDueDateIso || mb.bredDateIso);
        return s?.seasonKey === seasonFilter;
      }).length,
      totalLiveBorn: overallLive,
      totalStillborn: overallStillborn,
      totalWeaned: allLitters.reduce((s, l) => s + l.weanedCount, 0),
      liveBirthRatePct:
        overallBornAll > 0 ? round1((overallLive / overallBornAll) * 100) : null,
      weaningSurvivalRatePct:
        overallWeanedBase > 0
          ? Math.min(100, round1((overallWeanedSum / overallWeanedBase) * 100))
          : null,
      avg3WeekGrams: overallAvg3 !== null ? Math.round(overallAvg3) : null,
      avg6WeekGrams: overallAvg6 !== null ? Math.round(overallAvg6) : null,
      avg8WeekGrams: overallAvg8 !== null ? Math.round(overallAvg8) : null,
    },
  };
}

/**
 * Linearly interpolates a target weight curve at a given `ageDays`, or `null` if outside range.
 */
export function interpolateTargetWeightAtAge(
  curve: TargetWeightPoint[],
  ageDays: number
): number | null {
  if (!curve || curve.length === 0 || !Number.isFinite(ageDays)) return null;
  const sorted = normalizeTargetWeightCurve(curve);
  if (sorted.length === 0) return null;
  if (sorted.length === 1) {
    return ageDays === sorted[0].ageDays ? sorted[0].weightGrams : null;
  }
  if (ageDays < sorted[0].ageDays || ageDays > sorted[sorted.length - 1].ageDays) {
    return null;
  }
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i].ageDays === ageDays) return sorted[i].weightGrams;
    if (i < sorted.length - 1 && ageDays > sorted[i].ageDays && ageDays < sorted[i + 1].ageDays) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const t = (ageDays - a.ageDays) / Math.max(1, b.ageDays - a.ageDays);
      return Math.round(a.weightGrams + t * (b.weightGrams - a.weightGrams));
    }
  }
  return null;
}

/**
 * Builds chronological age-in-days growth and Rate of Gain (ADG) points for a single animal.
 */
export function buildAnimalGrowthSeries(params: {
  animal: Animal;
  careLogs: CareLog[];
  targetCurve?: TargetWeightPoint[];
  referenceDateIso?: string;
}): AnimalGrowthSeries {
  const { animal, careLogs, targetCurve = [], referenceDateIso = todayDateIso() } = params;
  const hasBirthDate = Boolean(parseIsoUtcMs(animal.birthDateIso));

  const animalLogs = careLogs
    .filter((l) => l.animalId === animal.id && l.weightGrams > 0)
    .sort((a, b) => (a.dateIso || '').localeCompare(b.dateIso || ''));

  // Deduplicate logs on the exact same dateIso (keep latest entry in array)
  const byDate = new Map<
    string,
    { dateIso: string; weightGrams: number; label: string; source: 'care_log' | 'profile_weight' }
  >();
  for (const l of animalLogs) {
    if (!parseIsoUtcMs(l.dateIso)) continue;
    byDate.set(l.dateIso, {
      dateIso: l.dateIso,
      weightGrams: Math.round(l.weightGrams),
      label: l.title || 'Weight Check',
      source: 'care_log',
    });
  }

  // If animal has a current profile weight > 0 and either no logs or a different weight than the last log,
  // include current profile weight at referenceDateIso (when no log exists on/after it or when 0 logs exist)
  if (animal.weightGrams > 0 && byDate.size === 0 && parseIsoUtcMs(referenceDateIso)) {
    byDate.set(referenceDateIso, {
      dateIso: referenceDateIso,
      weightGrams: Math.round(animal.weightGrams),
      label: 'Current Weight',
      source: 'profile_weight',
    });
  }

  const rawPoints = Array.from(byDate.values()).sort((a, b) =>
    a.dateIso.localeCompare(b.dateIso)
  );

  const points: AnimalGrowthPoint[] = [];
  if (hasBirthDate) {
    for (const p of rawPoints) {
      const ageDays = diffCalendarDaysNonNeg(animal.birthDateIso, p.dateIso);
      if (ageDays === null) continue;
      const prev = points.length > 0 ? points[points.length - 1] : null;
      const segmentSpan = prev ? ageDays - prev.ageDays : 0;
      const segmentAdgGramsPerDay =
        prev && segmentSpan > 0
          ? round1((p.weightGrams - prev.weightGrams) / segmentSpan)
          : null;
      points.push({
        ageDays,
        dateIso: p.dateIso,
        weightGrams: p.weightGrams,
        segmentAdgGramsPerDay,
        label: p.label,
        source: p.source,
      });
    }
  }

  if (points.length === 0) {
    return {
      animal,
      hasBirthDate,
      points: [],
      startAgeDays: null,
      startWeightGrams: null,
      latestAgeDays: null,
      latestWeightGrams: null,
      totalGainGrams: null,
      spanDays: null,
      overallAdgGramsPerDay: null,
      peakAdgGramsPerDay: null,
      targetDeltaGrams: null,
      targetDeltaPct: null,
    };
  }

  const first = points[0];
  const last = points[points.length - 1];
  const spanDays = last.ageDays - first.ageDays;
  const totalGainGrams = points.length >= 2 ? last.weightGrams - first.weightGrams : null;
  const overallAdgGramsPerDay =
    spanDays > 0 && totalGainGrams !== null ? round1(totalGainGrams / spanDays) : null;
  const segmentAdgs = points
    .map((p) => p.segmentAdgGramsPerDay)
    .filter((v): v is number => v !== null);
  const peakAdgGramsPerDay =
    segmentAdgs.length > 0 ? Math.max(...segmentAdgs) : overallAdgGramsPerDay;

  const targetAtLatest = interpolateTargetWeightAtAge(targetCurve, last.ageDays);
  const targetDeltaGrams =
    targetAtLatest !== null ? last.weightGrams - targetAtLatest : null;
  const targetDeltaPct =
    targetAtLatest !== null && targetAtLatest > 0 && targetDeltaGrams !== null
      ? round1((targetDeltaGrams / targetAtLatest) * 100)
      : null;

  return {
    animal,
    hasBirthDate,
    points,
    startAgeDays: first.ageDays,
    startWeightGrams: first.weightGrams,
    latestAgeDays: last.ageDays,
    latestWeightGrams: last.weightGrams,
    totalGainGrams,
    spanDays: spanDays > 0 ? spanDays : null,
    overallAdgGramsPerDay,
    peakAdgGramsPerDay,
    targetDeltaGrams,
    targetDeltaPct,
  };
}

/**
 * Computes a native Barn Cohort Benchmark curve by grouping actual weighed species observations
 * into 7-day age buckets (zero invented weights).
 */
export function buildBarnCohortBenchmarkCurve(params: {
  animals: Animal[];
  careLogs: CareLog[];
  speciesName: string;
  bucketSizeDays?: number;
  maxAgeDays?: number;
  referenceDateIso?: string;
}): CohortBenchmarkPoint[] {
  const {
    animals,
    careLogs,
    speciesName,
    bucketSizeDays = 7,
    maxAgeDays = 365,
    referenceDateIso = todayDateIso(),
  } = params;
  const spAnimals = animals.filter((a) => isSameSpecies(a.species, speciesName));
  const buckets = new Map<number, number[]>();

  for (const a of spAnimals) {
    const series = buildAnimalGrowthSeries({ animal: a, careLogs, referenceDateIso });
    if (!series.hasBirthDate) continue;
    for (const pt of series.points) {
      if (pt.ageDays < 0 || pt.ageDays > maxAgeDays) continue;
      const bucketAge = Math.round(pt.ageDays / bucketSizeDays) * bucketSizeDays;
      const arr = buckets.get(bucketAge) || [];
      arr.push(pt.weightGrams);
      buckets.set(bucketAge, arr);
    }
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ageDays, weights]) => ({
      ageDays,
      meanWeightGrams: Math.round(weights.reduce((s, w) => s + w, 0) / weights.length),
      minWeightGrams: Math.min(...weights),
      maxWeightGrams: Math.max(...weights),
      sampleCount: weights.length,
    }));
}

/**
 * Builds the complete multi-animal Comparative Rate of Gain chart model on an age-in-days axis
 * with optional Target/Goal curve and Barn Cohort Benchmark overlays.
 */
export function buildComparativeGrowthChartModel(params: {
  animals: Animal[];
  selectedAnimalIds: string[];
  careLogs: CareLog[];
  speciesProfile: SpeciesProfile;
  includeCohortBenchmark?: boolean;
  referenceDateIso?: string;
}): ComparativeGrowthChartModel {
  const {
    animals,
    selectedAnimalIds,
    careLogs,
    speciesProfile,
    includeCohortBenchmark = true,
    referenceDateIso = todayDateIso(),
  } = params;

  const targetCurve = normalizeTargetWeightCurve(speciesProfile.targetWeightCurve);
  const speciesAnimals = animals.filter((a) => isSameSpecies(a.species, speciesProfile.name));
  const byId = new Map(speciesAnimals.map((a) => [a.id, a]));

  const series: AnimalGrowthSeries[] = [];
  for (const id of selectedAnimalIds) {
    const animal = byId.get(id);
    if (!animal) continue;
    series.push(
      buildAnimalGrowthSeries({
        animal,
        careLogs,
        targetCurve,
        referenceDateIso,
      })
    );
  }

  const cohortCurve = includeCohortBenchmark
    ? buildBarnCohortBenchmarkCurve({
        animals: speciesAnimals,
        careLogs,
        speciesName: speciesProfile.name,
        referenceDateIso,
      })
    : [];

  const allAges: number[] = [];
  const allWeights: number[] = [];
  const allAdgs: number[] = [];

  for (const s of series) {
    for (const pt of s.points) {
      allAges.push(pt.ageDays);
      allWeights.push(pt.weightGrams);
      if (pt.segmentAdgGramsPerDay !== null) {
        allAdgs.push(pt.segmentAdgGramsPerDay);
      }
    }
  }
  for (const tp of targetCurve) {
    allAges.push(tp.ageDays);
    allWeights.push(tp.weightGrams);
  }
  for (const cp of cohortCurve) {
    allAges.push(cp.ageDays);
    allWeights.push(cp.meanWeightGrams);
  }

  const minAgeDays = allAges.length > 0 ? Math.min(0, ...allAges) : 0;
  const maxAgeDays = allAges.length > 0 ? Math.max(21, ...allAges) : 90;
  const maxWeightGrams = allWeights.length > 0 ? Math.max(500, ...allWeights) : 4536;
  const maxAdgGramsPerDay = allAdgs.length > 0 ? Math.max(10, ...allAdgs) : 50;
  const minAdgGramsPerDay = allAdgs.length > 0 ? Math.min(0, ...allAdgs) : 0;

  return {
    series,
    targetCurve,
    cohortCurve,
    minAgeDays,
    maxAgeDays,
    maxWeightGrams,
    maxAdgGramsPerDay,
    minAdgGramsPerDay,
  };
}

/**
 * Formats Rate of Gain (`grams/day`) cleanly in the active `WeightUnit`.
 */
export function formatRateOfGain(
  gramsPerDay: number | null | undefined,
  unit: WeightUnit
): string {
  if (gramsPerDay === null || gramsPerDay === undefined || !Number.isFinite(gramsPerDay)) {
    return '—';
  }
  const sign = gramsPerDay < 0 ? '-' : gramsPerDay > 0 ? '+' : '';
  const abs = Math.abs(gramsPerDay);
  if (unit === 'grams') return `${sign}${abs.toFixed(1)} g/d`;
  if (unit === 'kg') return `${sign}${(abs / 1000).toFixed(3)} kg/d`;
  if (unit === 'lbs') return `${sign}${(abs / 453.59237).toFixed(3)} lb/d`;
  const ozPerDay = abs / 28.349523125;
  return `${sign}${ozPerDay.toFixed(2)} oz/d (${sign}${abs.toFixed(1)} g/d)`;
}

/**
 * Converts integer grams to a clean numeric axis value in the active `WeightUnit`.
 */
export function gramsToAxisNumeric(grams: number, unit: WeightUnit): number {
  if (unit === 'grams') return Math.round(grams);
  if (unit === 'kg') return Math.round((grams / 1000) * 100) / 100;
  return Math.round((grams / 453.59237) * 100) / 100;
}

/**
 * Formats a chart axis weight tick compactly in the active `WeightUnit`.
 */
export function formatCompactWeightAxisTick(grams: number, unit: WeightUnit): string {
  if (grams <= 0) return '0';
  if (unit === 'grams') return `${Math.round(grams)}g`;
  if (unit === 'kg') return `${(grams / 1000).toFixed(1)}kg`;
  if (unit === 'lbs') return `${(grams / 453.59237).toFixed(1)}lb`;
  return formatWeight(grams, 'lbs_oz').replace(' lb ', '.').replace(' oz', '');
}
