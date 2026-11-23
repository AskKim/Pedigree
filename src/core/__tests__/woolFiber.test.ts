import { describe, expect, it } from 'vitest';
import {
  buildWoolHarvestSummaryByAnimalId,
  compute90DayEquivalentGrams,
  computeDaysBetweenDateIso,
  computeIagarbScoreTotal,
  evaluateIagarbEligibility,
  formatWoolWeightSummary,
  IAGARB_JUDGING_POSITIONS,
  IAGARB_MAX_POINTS,
  IAGARB_MIN_90_DAY_WOOL_GRAMS,
  IAGARB_REGISTRATION_MIN_POINTS,
  normalizeIagarbScorecard,
  normalizeWoolHarvest,
  summarizeAnimalWoolHarvests,
} from '../woolFiber';
import { WoolHarvest } from '../models';

function makeHarvest(overrides: Partial<WoolHarvest> = {}): WoolHarvest {
  return {
    id: overrides.id ?? 'wh-1',
    species: overrides.species ?? 'Rabbit',
    animalId: overrides.animalId ?? 'a1',
    harvestDateIso: overrides.harvestDateIso ?? '2026-06-01',
    shearingIntervalDays: overrides.shearingIntervalDays,
    primeWeightGrams: overrides.primeWeightGrams ?? 260,
    gradeWeightGrams: overrides.gradeWeightGrams ?? 90,
    harvestMethod: overrides.harvestMethod ?? 'Shear',
    stapleLengthMm: overrides.stapleLengthMm ?? 75,
    iagarbScore: overrides.iagarbScore,
    witnessedBy: overrides.witnessedBy,
    notes: overrides.notes ?? '',
    createdAt: overrides.createdAt ?? '2026-06-01T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-06-01T10:00:00.000Z',
  };
}

describe('woolFiber — fiber harvests, 90-day yield conversion & IAGARB scorecard', () => {
  it('defines the 7 official IAGARB judging positions summing exactly to 100 points', () => {
    expect(IAGARB_JUDGING_POSITIONS).toHaveLength(7);
    const totalMax = IAGARB_JUDGING_POSITIONS.reduce((acc, pos) => acc + pos.maxPoints, 0);
    expect(totalMax).toBe(IAGARB_MAX_POINTS);
    expect(IAGARB_REGISTRATION_MIN_POINTS).toBe(80);
    expect(IAGARB_MIN_90_DAY_WOOL_GRAMS).toBe(325);
  });

  it('computes and clamps IAGARB category weights accurately', () => {
    const clampedTotal = computeIagarbScoreTotal({
      weightPts: 25, // max 20
      bodyTypePts: 18,
      densityLengthPts: 14,
      uniformityPts: 15,
      texturePts: 12.5,
      furnishingsPts: 9,
      conditionPts: 4.5,
    });
    expect(clampedTotal).toBe(93);

    const normalized = normalizeIagarbScorecard({
      weightPts: 19,
      bodyTypePts: 17,
      densityLengthPts: 13,
      uniformityPts: 12,
      texturePts: 13,
      furnishingsPts: 8,
      conditionPts: 4,
      evaluatorName: '  Pat Judge  ',
      evaluationDateIso: '2026-05-10',
    });
    expect(normalized?.totalPts).toBe(86);
    expect(normalized?.evaluatorName).toBe('Pat Judge');
    expect(normalized?.evaluationDateIso).toBe('2026-05-10');

    expect(
      normalizeIagarbScorecard({
        weightPts: 0,
        bodyTypePts: 0,
        densityLengthPts: 0,
        uniformityPts: 0,
        texturePts: 0,
        furnishingsPts: 0,
        conditionPts: 0,
      })
    ).toBeUndefined();
  });

  it('evaluates IAGARB registration and 325g/90-day performance yield thresholds', () => {
    const qualified = evaluateIagarbEligibility(84.5, 340);
    expect(qualified.meetsPointsThreshold).toBe(true);
    expect(qualified.meets90DayYieldThreshold).toBe(true);
    expect(qualified.overallEligible).toBe(true);
    expect(qualified.statusLabel).toContain('Qualified');

    const lowYield = evaluateIagarbEligibility(88, 290);
    expect(lowYield.meetsPointsThreshold).toBe(true);
    expect(lowYield.meets90DayYieldThreshold).toBe(false);
    expect(lowYield.overallEligible).toBe(false);
    expect(lowYield.statusLabel).toContain('Below 325g/90d Yield');

    const lowScore = evaluateIagarbEligibility(76, 400);
    expect(lowScore.meetsPointsThreshold).toBe(false);
    expect(lowScore.overallEligible).toBe(false);
    expect(lowScore.statusLabel).toContain('Below IAGARB Reg Threshold');

    const scoreOnly = evaluateIagarbEligibility(82, null);
    expect(scoreOnly.meetsPointsThreshold).toBe(true);
    expect(scoreOnly.meets90DayYieldThreshold).toBeNull();
    expect(scoreOnly.overallEligible).toBe(true);
  });

  it('computes exact calendar day intervals via Date.UTC and normalizes weights to a 90-day cycle', () => {
    expect(computeDaysBetweenDateIso('2026-01-01', '2026-04-01')).toBe(90);
    expect(computeDaysBetweenDateIso('invalid', '2026-04-01')).toBeNull();

    expect(compute90DayEquivalentGrams(360, 90)).toBe(360);
    expect(compute90DayEquivalentGrams(220, 60)).toBe(330);
    expect(compute90DayEquivalentGrams(0, 90)).toBeNull();
    expect(compute90DayEquivalentGrams(300, 0)).toBeNull();
  });

  it('normalizes malformed wool harvests cleanly and summarizes multi-harvest timelines', () => {
    expect(normalizeWoolHarvest({ animalId: '' })).toBeNull();
    const cleaned = normalizeWoolHarvest({
      animalId: 'angora-1',
      species: 'Rabbit',
      harvestDateIso: '2026-07-15',
      primeWeightGrams: -10,
      gradeWeightGrams: 120.44,
      harvestMethod: 'pluck',
      stapleLengthMm: 82,
    });
    expect(cleaned).not.toBeNull();
    expect(cleaned?.primeWeightGrams).toBe(0);
    expect(cleaned?.gradeWeightGrams).toBe(120.4);
    expect(cleaned?.harvestMethod).toBe('Pluck');

    const scorecard1 = normalizeIagarbScorecard({
      weightPts: 17,
      bodyTypePts: 16,
      densityLengthPts: 12,
      uniformityPts: 12,
      texturePts: 12,
      furnishingsPts: 8,
      conditionPts: 4,
    });
    const scorecard2 = normalizeIagarbScorecard({
      weightPts: 19,
      bodyTypePts: 18,
      densityLengthPts: 13,
      uniformityPts: 13,
      texturePts: 13,
      furnishingsPts: 8.5,
      conditionPts: 4.5,
    });

    const harvests: WoolHarvest[] = [
      makeHarvest({
        id: 'wh-1',
        animalId: 'angora-1',
        harvestDateIso: '2026-01-01',
        shearingIntervalDays: 90,
        primeWeightGrams: 250,
        gradeWeightGrams: 90,
        iagarbScore: scorecard1,
      }),
      makeHarvest({
        id: 'wh-2',
        animalId: 'angora-1',
        harvestDateIso: '2026-04-01',
        // Derived 90-day interval from previous harvest date 2026-01-01 -> 2026-04-01
        shearingIntervalDays: undefined,
        primeWeightGrams: 270,
        gradeWeightGrams: 90,
        iagarbScore: scorecard2,
      }),
      makeHarvest({
        id: 'wh-other',
        animalId: 'angora-2',
        harvestDateIso: '2026-04-01',
        shearingIntervalDays: 90,
        primeWeightGrams: 180,
        gradeWeightGrams: 60,
      }),
    ];

    const summary = summarizeAnimalWoolHarvests(harvests, 'angora-1');
    expect(summary.harvestCount).toBe(2);
    expect(summary.primeGrams).toBe(520);
    expect(summary.gradeGrams).toBe(180);
    expect(summary.totalGrams).toBe(700);
    expect(summary.primePercent).toBe(74);
    expect(summary.averagePerHarvestGrams).toBe(350);
    expect(summary.average90DayRateGrams).toBe(350);
    expect(summary.latest90DayRateGrams).toBe(360);
    expect(summary.highestIagarbScore?.totalPts).toBe(89);
    expect(summary.eligibility.overallEligible).toBe(true);

    const byAnimal = buildWoolHarvestSummaryByAnimalId(harvests);
    expect(byAnimal.size).toBe(2);
    expect(formatWoolWeightSummary(summary, { compact: true })).toContain('700g wool');
    expect(formatWoolWeightSummary(summary)).toContain('IAGARB 89/100');
  });
});
