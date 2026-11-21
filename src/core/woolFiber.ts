/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Wool / Fiber Harvest Analytics & IAGARB German Angora Judging Standard
 * (`src/core/woolFiber.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) dependencies so the exact
 * same fiber yield totals, 90-day shearing rate conversions, and IAGARB 100-point scorecard
 * calculations run identically in unit tests, browser UI, printable pedigrees, and native builds.
 */

import { isSafeRecordKey, sanitizePlainText, sanitizeSingleLineText } from './inputSanitization';
import {
  computeDaysBetweenDateIso,
  generateUuid,
  IagarbScorecard,
  normalizeWoolHarvestMethod,
  nowIsoUtc,
  todayDateIso,
  WoolHarvest,
} from './models';

export { computeDaysBetweenDateIso };

export const IAGARB_MAX_POINTS = 100;
export const IAGARB_REGISTRATION_MIN_POINTS = 80;
export const IAGARB_MIN_90_DAY_WOOL_GRAMS = 325;
export const IAGARB_STANDARD_SHEARING_CYCLE_DAYS = 90;

export interface IagarbJudgingPositionSpec {
  key: keyof Pick<
    IagarbScorecard,
    | 'weightPts'
    | 'bodyTypePts'
    | 'densityLengthPts'
    | 'uniformityPts'
    | 'texturePts'
    | 'furnishingsPts'
    | 'conditionPts'
  >;
  label: string;
  maxPoints: number;
  guidance: string;
}

/**
 * Verified 7-position 100-point IAGARB German Angora evaluation breakdown.
 */
export const IAGARB_JUDGING_POSITIONS: readonly IagarbJudgingPositionSpec[] = [
  {
    key: 'weightPts',
    label: 'Weight',
    maxPoints: 20,
    guidance: 'Min 2.5 kg (5.5 lbs) = 15 pts; ~3.5 kg avg; 5.0–5.5 kg top = 20 pts',
  },
  {
    key: 'bodyTypePts',
    label: 'Body Type',
    maxPoints: 20,
    guidance: 'Balanced length-to-depth-to-width ratio with firm flesh under wool',
  },
  {
    key: 'densityLengthPts',
    label: 'Wool Density & Length',
    maxPoints: 15,
    guidance: 'Dense, full-coat fiber growth and consistent staple length',
  },
  {
    key: 'uniformityPts',
    label: 'Wool Uniformity',
    maxPoints: 15,
    guidance: 'Consistent length & quality across back, flanks, and chest',
  },
  {
    key: 'texturePts',
    label: 'Wool Texture',
    maxPoints: 15,
    guidance: 'Distinctive crimp, healthy substance, and silky elasticity',
  },
  {
    key: 'furnishingsPts',
    label: 'Furnishings',
    maxPoints: 10,
    guidance: 'Head, forehead, cheeks, ear trim, and feet furnishings',
  },
  {
    key: 'conditionPts',
    label: 'Condition',
    maxPoints: 5,
    guidance: 'Health, cleanliness, and freedom from webbing or matting',
  },
];

function clampPoints(raw: unknown, max: number): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return 0;
  const clamped = Math.min(max, num);
  return Math.round(clamped * 10) / 10;
}

function finiteNonNeg(raw: unknown, max = 100_000): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.min(max, Math.round(num * 10) / 10);
}

export function computeIagarbScoreTotal(
  score: Omit<IagarbScorecard, 'totalPts' | 'evaluatorName' | 'evaluationDateIso'>
): number {
  const sum =
    clampPoints(score.weightPts, 20) +
    clampPoints(score.bodyTypePts, 20) +
    clampPoints(score.densityLengthPts, 15) +
    clampPoints(score.uniformityPts, 15) +
    clampPoints(score.texturePts, 15) +
    clampPoints(score.furnishingsPts, 10) +
    clampPoints(score.conditionPts, 5);
  return Math.min(IAGARB_MAX_POINTS, Math.round(sum * 10) / 10);
}

export function normalizeIagarbScorecard(raw: unknown): IagarbScorecard | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const weightPts = clampPoints(obj.weightPts, 20);
  const bodyTypePts = clampPoints(obj.bodyTypePts, 20);
  const densityLengthPts = clampPoints(obj.densityLengthPts, 15);
  const uniformityPts = clampPoints(obj.uniformityPts, 15);
  const texturePts = clampPoints(obj.texturePts, 15);
  const furnishingsPts = clampPoints(obj.furnishingsPts, 10);
  const conditionPts = clampPoints(obj.conditionPts, 5);
  const totalPts = computeIagarbScoreTotal({
    weightPts,
    bodyTypePts,
    densityLengthPts,
    uniformityPts,
    texturePts,
    furnishingsPts,
    conditionPts,
  });
  const evaluatorName = sanitizeSingleLineText(obj.evaluatorName || '', 120);
  const rawDate = typeof obj.evaluationDateIso === 'string' ? obj.evaluationDateIso.trim() : '';
  const evaluationDateIso = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';
  if (totalPts <= 0 && !evaluatorName && !evaluationDateIso) {
    return undefined;
  }
  return {
    weightPts,
    bodyTypePts,
    densityLengthPts,
    uniformityPts,
    texturePts,
    furnishingsPts,
    conditionPts,
    totalPts,
    evaluatorName,
    evaluationDateIso,
  };
}

export interface IagarbEligibilityResult {
  pointsTotal: number;
  meetsPointsThreshold: boolean;
  yield90DayGrams: number | null;
  meets90DayYieldThreshold: boolean | null;
  overallEligible: boolean;
  statusLabel: string;
}

export function evaluateIagarbEligibility(
  scoreTotal: number,
  yield90DayGrams?: number | null
): IagarbEligibilityResult {
  const cleanScore = Math.min(IAGARB_MAX_POINTS, Math.max(0, Math.round(scoreTotal * 10) / 10));
  const meetsPointsThreshold = cleanScore >= IAGARB_REGISTRATION_MIN_POINTS;
  const validYield =
    typeof yield90DayGrams === 'number' && Number.isFinite(yield90DayGrams) && yield90DayGrams > 0
      ? Math.round(yield90DayGrams * 10) / 10
      : null;
  const meets90DayYieldThreshold =
    validYield !== null ? validYield >= IAGARB_MIN_90_DAY_WOOL_GRAMS : null;
  const overallEligible =
    meetsPointsThreshold && (meets90DayYieldThreshold === null || meets90DayYieldThreshold);

  let statusLabel = 'Needs Evaluation (min 80 pts)';
  if (cleanScore > 0) {
    if (!meetsPointsThreshold) {
      statusLabel = `Below IAGARB Reg Threshold (${cleanScore}/80 pts)`;
    } else if (meets90DayYieldThreshold === false) {
      statusLabel = `Score Eligible (${cleanScore} pts) · Below 325g/90d Yield`;
    } else if (meets90DayYieldThreshold === true) {
      statusLabel = `IAGARB Reg & 90d Yield Qualified (${cleanScore} pts · ${validYield}g/90d)`;
    } else {
      statusLabel = `IAGARB Score Qualified (${cleanScore}/100 pts)`;
    }
  } else if (meets90DayYieldThreshold === true) {
    statusLabel = `Meets 325g/90d Yield (${validYield}g) · Needs Judging Score`;
  } else if (meets90DayYieldThreshold === false) {
    statusLabel = `90d Yield ${validYield}g (< 325g minimum)`;
  }

  return {
    pointsTotal: cleanScore,
    meetsPointsThreshold,
    yield90DayGrams: validYield,
    meets90DayYieldThreshold,
    overallEligible,
    statusLabel,
  };
}

/**
 * Normalizes any shearing harvest total to a 90-day standard cycle rate.
 */
export function compute90DayEquivalentGrams(
  totalGrams: number,
  intervalDays?: number
): number | null {
  if (!Number.isFinite(totalGrams) || totalGrams <= 0) return null;
  if (!intervalDays || !Number.isFinite(intervalDays) || intervalDays <= 0) return null;
  return Math.round(((totalGrams / intervalDays) * IAGARB_STANDARD_SHEARING_CYCLE_DAYS) * 10) / 10;
}

export function normalizeWoolHarvest(raw: unknown, fallbackSpecies = 'Rabbit'): WoolHarvest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const animalId = typeof obj.animalId === 'string' ? obj.animalId.trim() : '';
  if (!animalId) return null;

  const rawId = typeof obj.id === 'string' ? obj.id.trim() : '';
  const id = rawId && isSafeRecordKey(rawId) ? rawId : generateUuid();
  const species =
    typeof obj.species === 'string' && obj.species.trim()
      ? sanitizeSingleLineText(obj.species, 60)
      : fallbackSpecies;
  const rawDate = typeof obj.harvestDateIso === 'string' ? obj.harvestDateIso.trim() : '';
  const harvestDateIso = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayDateIso();
  const intervalRaw = Math.round(finiteNonNeg(obj.shearingIntervalDays, 1000));
  const stapleRaw = finiteNonNeg(obj.stapleLengthMm, 500);
  const iagarbScore = normalizeIagarbScorecard(obj.iagarbScore);
  const now = nowIsoUtc();

  return {
    id,
    species,
    animalId,
    harvestDateIso,
    ...(intervalRaw > 0 ? { shearingIntervalDays: intervalRaw } : {}),
    primeWeightGrams: finiteNonNeg(obj.primeWeightGrams, 100_000),
    gradeWeightGrams: finiteNonNeg(obj.gradeWeightGrams, 100_000),
    harvestMethod: normalizeWoolHarvestMethod(obj.harvestMethod, 'Shear'),
    ...(stapleRaw > 0 ? { stapleLengthMm: stapleRaw } : {}),
    ...(iagarbScore ? { iagarbScore } : {}),
    ...(typeof obj.witnessedBy === 'string' && obj.witnessedBy.trim()
      ? { witnessedBy: sanitizeSingleLineText(obj.witnessedBy, 120) }
      : {}),
    notes: sanitizePlainText(obj.notes || '', 1000),
    ...(typeof obj._rev === 'number' && Number.isFinite(obj._rev) && obj._rev > 0
      ? { _rev: Math.round(obj._rev) }
      : {}),
    createdAt: typeof obj.createdAt === 'string' && obj.createdAt.trim() ? obj.createdAt : now,
    updatedAt: typeof obj.updatedAt === 'string' && obj.updatedAt.trim() ? obj.updatedAt : now,
  };
}

export interface AnimalWoolSummary {
  animalId: string;
  harvestCount: number;
  primeGrams: number;
  gradeGrams: number;
  totalGrams: number;
  primePercent: number;
  averagePerHarvestGrams: number;
  average90DayRateGrams: number | null;
  latest90DayRateGrams: number | null;
  latestHarvestDateIso: string;
  latestHarvestMethod: WoolHarvest['harvestMethod'] | '';
  latestIagarbScore: IagarbScorecard | null;
  highestIagarbScore: IagarbScorecard | null;
  eligibility: IagarbEligibilityResult;
}

export function summarizeAnimalWoolHarvests(
  harvests: readonly WoolHarvest[],
  animalId: string
): AnimalWoolSummary {
  const relevant = harvests
    .filter((h) => h.animalId === animalId)
    .slice()
    .sort(
      (a, b) =>
        (b.harvestDateIso || '').localeCompare(a.harvestDateIso || '') ||
        (b.createdAt || '').localeCompare(a.createdAt || '')
    );

  let primeGrams = 0;
  let gradeGrams = 0;
  let latestIagarbScore: IagarbScorecard | null = null;
  let highestIagarbScore: IagarbScorecard | null = null;
  const cycleRates: number[] = [];

  for (let i = 0; i < relevant.length; i += 1) {
    const h = relevant[i];
    const prime = Math.max(0, Number(h.primeWeightGrams) || 0);
    const grade = Math.max(0, Number(h.gradeWeightGrams) || 0);
    primeGrams += prime;
    gradeGrams += grade;

    if (h.iagarbScore && h.iagarbScore.totalPts > 0) {
      if (!latestIagarbScore) latestIagarbScore = h.iagarbScore;
      if (!highestIagarbScore || h.iagarbScore.totalPts > highestIagarbScore.totalPts) {
        highestIagarbScore = h.iagarbScore;
      }
    }

    let cycleDays =
      h.shearingIntervalDays && h.shearingIntervalDays > 0 ? h.shearingIntervalDays : 0;
    if (!cycleDays && i + 1 < relevant.length) {
      const derived = computeDaysBetweenDateIso(relevant[i + 1].harvestDateIso, h.harvestDateIso);
      if (derived && derived >= 20 && derived <= 365) {
        cycleDays = derived;
      }
    }
    const rate = compute90DayEquivalentGrams(prime + grade, cycleDays);
    if (rate !== null) {
      cycleRates.push(rate);
    }
  }

  primeGrams = Math.round(primeGrams * 10) / 10;
  gradeGrams = Math.round(gradeGrams * 10) / 10;
  const totalGrams = Math.round((primeGrams + gradeGrams) * 10) / 10;
  const harvestCount = relevant.length;
  const primePercent = totalGrams > 0 ? Math.round((primeGrams / totalGrams) * 100) : 0;
  const averagePerHarvestGrams =
    harvestCount > 0 ? Math.round((totalGrams / harvestCount) * 10) / 10 : 0;
  const average90DayRateGrams =
    cycleRates.length > 0
      ? Math.round((cycleRates.reduce((acc, v) => acc + v, 0) / cycleRates.length) * 10) / 10
      : null;
  const latest90DayRateGrams = cycleRates.length > 0 ? cycleRates[0] : null;
  const bestScorePts = highestIagarbScore?.totalPts ?? latestIagarbScore?.totalPts ?? 0;

  return {
    animalId,
    harvestCount,
    primeGrams,
    gradeGrams,
    totalGrams,
    primePercent,
    averagePerHarvestGrams,
    average90DayRateGrams,
    latest90DayRateGrams,
    latestHarvestDateIso: relevant[0]?.harvestDateIso || '',
    latestHarvestMethod: relevant[0]?.harvestMethod || '',
    latestIagarbScore,
    highestIagarbScore,
    eligibility: evaluateIagarbEligibility(bestScorePts, average90DayRateGrams),
  };
}

export function buildWoolHarvestSummaryByAnimalId(
  harvests: readonly WoolHarvest[]
): Map<string, AnimalWoolSummary> {
  const ids = new Set<string>();
  for (const h of harvests) {
    if (h.animalId) ids.add(h.animalId);
  }
  const map = new Map<string, AnimalWoolSummary>();
  for (const id of ids) {
    map.set(id, summarizeAnimalWoolHarvests(harvests, id));
  }
  return map;
}

export function formatWoolWeightSummary(
  summary: AnimalWoolSummary,
  options?: { compact?: boolean }
): string {
  if (summary.harvestCount === 0 && !summary.highestIagarbScore) {
    return '';
  }
  const parts: string[] = [];
  if (summary.totalGrams > 0) {
    if (options?.compact) {
      parts.push(
        `${summary.totalGrams}g wool (${summary.primeGrams}g prime / ${summary.gradeGrams}g grade)`
      );
    } else {
      parts.push(
        `${summary.totalGrams}g total (${summary.primeGrams}g prime · ${summary.gradeGrams}g grade · ${summary.harvestCount} harvest${summary.harvestCount === 1 ? '' : 's'})`
      );
    }
  }
  if (summary.average90DayRateGrams !== null) {
    parts.push(`${summary.average90DayRateGrams}g/90d`);
  }
  if (summary.highestIagarbScore) {
    parts.push(`IAGARB ${summary.highestIagarbScore.totalPts}/100`);
  }
  return parts.join(' · ');
}
