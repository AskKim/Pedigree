/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  buildAnimalGrowthSeries,
  buildBarnCohortBenchmarkCurve,
  buildComparativeGrowthChartModel,
  diffCalendarDaysNonNeg,
  diffCalendarDaysSigned,
  evaluateLitterSurvivalAndMilestones,
  formatCompactWeightAxisTick,
  formatRateOfGain,
  gramsToAxisNumeric,
  interpolateTargetWeightAtAge,
  resolveMeteorologicalSeason,
} from '../growthAnalytics';
import {
  BreedingRecord,
  CareLog,
  normalizeLitterWeightMilestones,
  normalizeTargetWeightCurve,
} from '../models';
import { makeAnimal, makeSpeciesProfile } from './testFixtures';

const TS = '2026-06-01T12:00:00.000Z';

function makeBreeding(id: string, overrides: Partial<BreedingRecord> = {}): BreedingRecord {
  return {
    id,
    species: 'Rabbit',
    sireId: 'sire-1',
    damId: 'dam-1',
    sireName: 'Apollo',
    damName: 'Clover',
    bredDateIso: '2026-01-01',
    expectedDueDateIso: '2026-02-01',
    actualBirthDateIso: '2026-02-01',
    projectedCoiPercent: 0,
    liveCount: 8,
    stillbornCount: 0,
    fosteredCount: 0,
    weanedCount: 7,
    offspringCreated: false,
    status: 'Weaned',
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function makeWeightLog(
  id: string,
  animalId: string,
  dateIso: string,
  weightGrams: number,
  species = 'Rabbit'
): CareLog {
  return {
    id,
    species,
    animalId,
    dateIso,
    type: 'Weight Check',
    title: `Weight check ${dateIso}`,
    weightGrams,
    showLegEarned: false,
    notes: '',
    createdAt: TS,
    updatedAt: TS,
  };
}

describe('growthAnalytics — date, season, litter survival, milestones & comparative ADG engine', () => {
  it('computes UTC calendar day diffs safely across DST and rejects invalid dates', () => {
    // US DST spring-forward boundary (2026-03-08) must still equal exact calendar days
    expect(diffCalendarDaysSigned('2026-03-01', '2026-03-15')).toBe(14);
    expect(diffCalendarDaysSigned('2026-03-15', '2026-03-01')).toBe(-14);
    expect(diffCalendarDaysNonNeg('2026-03-15', '2026-03-01')).toBeNull();
    expect(diffCalendarDaysNonNeg('2026-02-30', '2026-03-05')).toBeNull();
  });

  it('classifies meteorological seasons in chronological order (including Jan/Feb vs Dec)', () => {
    const jan = resolveMeteorologicalSeason('2026-01-15');
    const mar = resolveMeteorologicalSeason('2026-03-01');
    const jul = resolveMeteorologicalSeason('2026-07-04');
    const oct = resolveMeteorologicalSeason('2026-10-20');
    const dec = resolveMeteorologicalSeason('2026-12-10');

    expect(jan?.seasonKey).toBe('Winter 2026');
    expect(mar?.seasonKey).toBe('Spring 2026');
    expect(jul?.seasonKey).toBe('Summer 2026');
    expect(oct?.seasonKey).toBe('Fall 2026');
    expect(dec?.seasonKey).toBe('Winter 2026');
    expect(resolveMeteorologicalSeason('bad-date')).toBeNull();

    // Jan/Feb rank 0 < Spring 1 < Summer 2 < Fall 3 < Dec 4 within the same year
    expect((jan?.sortOrder ?? 0) < (mar?.sortOrder ?? 0)).toBe(true);
    expect((mar?.sortOrder ?? 0) < (jul?.sortOrder ?? 0)).toBe(true);
    expect((jul?.sortOrder ?? 0) < (oct?.sortOrder ?? 0)).toBe(true);
    expect((oct?.sortOrder ?? 0) < (dec?.sortOrder ?? 0)).toBe(true);
  });

  it('normalizes target curves and litter milestones safely', () => {
    const curve = normalizeTargetWeightCurve([
      { ageDays: 56, weightGrams: 2040, label: '8w' },
      { ageDays: 21, weightGrams: 540 },
      { ageDays: -5, weightGrams: 100 }, // invalid age ignored
      { ageDays: 42, weightGrams: 0 }, // invalid zero weight ignored
      { ageDays: 56, weightGrams: 2100, label: 'Updated 8w' }, // deduplicates by age
    ]);
    expect(curve).toEqual([
      { ageDays: 21, weightGrams: 540 },
      { ageDays: 56, weightGrams: 2100, label: 'Updated 8w' },
    ]);

    const milestones = normalizeLitterWeightMilestones([
      { id: 'm-8w', ageDays: 56, label: '8-Week', totalWeightGrams: 16000, liveCount: 8 },
      { id: 'm-3w', ageDays: 21, label: '3-Week', avgWeightGrams: 520, liveCount: 8, totalWeightGrams: 0 },
      { id: 'bad', ageDays: -1, label: 'Bad', totalWeightGrams: 500 },
    ]);
    expect(milestones).toHaveLength(2);
    expect(milestones[0].ageDays).toBe(21);
    expect(milestones[0].totalWeightGrams).toBe(4160);
    expect(milestones[1].ageDays).toBe(56);
    expect(milestones[1].avgWeightGrams).toBe(2000);
  });

  it('evaluates litter survival rates (including fostering), parent summaries, seasonal curves & offspring CareLog fallback milestones', () => {
    const rabbitProfile = makeSpeciesProfile('Rabbit');
    const damClover = makeAnimal('dam-1', { name: 'Clover', tattoo: 'CLV1', sex: 'Female' });
    const damWillow = makeAnimal('dam-2', { name: 'Willow', tattoo: 'WLW2', sex: 'Female' });
    const sireApollo = makeAnimal('sire-1', { name: 'Apollo', tattoo: 'APL1', sex: 'Male' });

    // Offspring from Willow's Summer litter weighed individually via CareLogs (no explicit litter milestone at 21d)
    const kitA = makeAnimal('kit-a', {
      name: 'Kit A',
      sex: 'Female',
      sireId: 'sire-1',
      damId: 'dam-2',
      birthDateIso: '2026-07-01',
      weightGrams: 500,
    });
    const kitB = makeAnimal('kit-b', {
      name: 'Kit B',
      sex: 'Male',
      sireId: 'sire-1',
      damId: 'dam-2',
      birthDateIso: '2026-07-01',
      weightGrams: 540,
    });

    const breedings: BreedingRecord[] = [
      // Clover Winter litter: 8 live, 2 stillborn (80% live birth), +1 fostered (rearing base = 9), 9 weaned (100% weaning survival)
      makeBreeding('b-1', {
        damId: 'dam-1',
        damName: 'Clover',
        sireId: 'sire-1',
        sireName: 'Apollo',
        bredDateIso: '2026-01-01',
        actualBirthDateIso: '2026-02-01',
        liveCount: 8,
        stillbornCount: 2,
        fosteredCount: 1,
        weanedCount: 9,
        status: 'Weaned',
        litterWeightMilestones: [
          { id: 'm1', ageDays: 21, label: '3w', liveCount: 9, totalWeightGrams: 4950, avgWeightGrams: 550 },
          { id: 'm2', ageDays: 42, label: '6w', liveCount: 9, totalWeightGrams: 13050, avgWeightGrams: 1450 },
          { id: 'm3', ageDays: 56, label: '8w', liveCount: 9, totalWeightGrams: 19350, avgWeightGrams: 2150 },
        ],
      }),
      // Clover Spring miss
      makeBreeding('b-2', {
        damId: 'dam-1',
        damName: 'Clover',
        sireId: 'sire-1',
        sireName: 'Apollo',
        bredDateIso: '2026-03-10',
        expectedDueDateIso: '2026-04-10',
        actualBirthDateIso: '',
        liveCount: 0,
        stillbornCount: 0,
        fosteredCount: 0,
        weanedCount: 0,
        status: 'Missed',
      }),
      // Willow Summer litter: 6 live, 0 stillborn, -2 fostered out (rearing base = 4), 3 weaned (75% weaning survival)
      makeBreeding('b-3', {
        damId: 'dam-2',
        damName: 'Willow',
        sireId: 'sire-1',
        sireName: 'Apollo',
        bredDateIso: '2026-06-01',
        expectedDueDateIso: '2026-07-02',
        actualBirthDateIso: '2026-07-01',
        liveCount: 6,
        stillbornCount: 0,
        fosteredCount: -2,
        weanedCount: 3,
        status: 'Weaned',
        litterWeightMilestones: [
          { id: 'w-8w', ageDays: 56, label: '8w', liveCount: 3, totalWeightGrams: 5400, avgWeightGrams: 1800 },
        ],
      }),
      // Different species (must stay strictly isolated)
      makeBreeding('b-goat', {
        species: 'Goat',
        damId: 'g-dam',
        damName: 'Nanny',
        sireId: 'g-sire',
        sireName: 'Billy',
        liveCount: 2,
        weanedCount: 2,
        status: 'Weaned',
      }),
    ];

    const careLogs: CareLog[] = [
      // Linked kit logs at day 21 (2026-07-22) should auto-supplement Willow's litter 3w milestone
      makeWeightLog('cl-ka', 'kit-a', '2026-07-22', 460),
      makeWeightLog('cl-kb', 'kit-b', '2026-07-22', 500),
    ];

    const res = evaluateLitterSurvivalAndMilestones({
      speciesProfile: rabbitProfile,
      breedings,
      animals: [damClover, damWillow, sireApollo, kitA, kitB],
      careLogs,
    });

    expect(res.speciesName).toBe('Rabbit');
    expect(res.litters).toHaveLength(2);
    expect(res.overallSummary.littersBornCount).toBe(2);
    expect(res.overallSummary.missedCount).toBe(1);
    expect(res.overallSummary.totalLiveBorn).toBe(14);
    expect(res.overallSummary.totalStillborn).toBe(2);
    expect(res.overallSummary.totalWeaned).toBe(12);
    // Live birth: 14 / 16 = 87.5%
    expect(res.overallSummary.liveBirthRatePct).toBe(87.5);
    // Weaning survival: 12 / (9 + 4) = 92.3%
    expect(res.overallSummary.weaningSurvivalRatePct).toBe(92.3);

    const clover = res.damSummaries.find((d) => d.parentId === 'dam-1');
    expect(clover?.totalBreedings).toBe(2);
    expect(clover?.conceptionRatePct).toBe(50);
    expect(clover?.liveBirthRatePct).toBe(80);
    expect(clover?.weaningSurvivalRatePct).toBe(100);
    expect(clover?.avg3WeekGrams).toBe(550);
    expect(clover?.avg6WeekGrams).toBe(1450);
    expect(clover?.avg8WeekGrams).toBe(2150);
    // ADG from 550g at 21d to 2150g at 56d = 1600 / 35 = 45.7 g/day
    expect(clover?.meanLitterAdgGramsPerDay).toBe(45.7);

    const willow = res.damSummaries.find((d) => d.parentId === 'dam-2');
    expect(willow?.weaningSurvivalRatePct).toBe(75);
    // Fallback offspring CareLog mean (460 + 500) / 2 = 480g
    expect(willow?.avg3WeekGrams).toBe(480);
    expect(willow?.litters[0].milestones[0].source).toBe('offspring_logs');

    // Sire summary rolls up Apollo across all 3 Rabbit breedings
    expect(res.sireSummaries).toHaveLength(1);
    expect(res.sireSummaries[0].totalBreedings).toBe(3);
    expect(res.sireSummaries[0].littersBornCount).toBe(2);

    // Season filter isolates Winter 2026 cleanly
    const winterOnly = evaluateLitterSurvivalAndMilestones({
      speciesProfile: rabbitProfile,
      breedings,
      animals: [damClover, damWillow, sireApollo, kitA, kitB],
      careLogs,
      seasonFilter: 'Winter 2026',
    });
    expect(winterOnly.litters).toHaveLength(1);
    expect(winterOnly.litters[0].breeding.id).toBe('b-1');
    expect(winterOnly.seasonalSummaries.map((s) => s.seasonKey)).toEqual(['Winter 2026']);
  });

  it('computes interpolated goal weights, multi-animal ADG series, and 7-day Barn Cohort Benchmarks', () => {
    const targetCurve = [
      { ageDays: 21, weightGrams: 500, label: '3w' },
      { ageDays: 56, weightGrams: 1900, label: '8w' },
    ];
    expect(interpolateTargetWeightAtAge(targetCurve, 21)).toBe(500);
    // Midpoint at 38.5d? Test exact age 35d -> 500 + (14/35)*1400 = 1060g
    expect(interpolateTargetWeightAtAge(targetCurve, 35)).toBe(1060);
    expect(interpolateTargetWeightAtAge(targetCurve, 10)).toBeNull();

    const rabbitProfile = {
      ...makeSpeciesProfile('Rabbit'),
      targetWeightCurve: targetCurve,
    };

    const fastKit = makeAnimal('k-fast', {
      name: 'Rocket',
      sex: 'Male',
      birthDateIso: '2026-04-01',
      weightGrams: 2200,
    });
    const slowKit = makeAnimal('k-slow', {
      name: 'Pebble',
      sex: 'Female',
      birthDateIso: '2026-04-01',
      weightGrams: 1650,
    });
    const noDobAnimal = makeAnimal('k-nodob', {
      name: 'Mystery',
      birthDateIso: '',
      weightGrams: 3000,
    });
    const goatAnimal = makeAnimal('g-kid', {
      species: 'Goat',
      name: 'Goat Kid',
      birthDateIso: '2026-04-01',
      weightGrams: 8000,
    });

    const careLogs: CareLog[] = [
      // Same-day log deduplication keeps latest log entry (560g)
      makeWeightLog('l1a', 'k-fast', '2026-04-22', 520),
      makeWeightLog('l1b', 'k-fast', '2026-04-22', 560),
      makeWeightLog('l2', 'k-fast', '2026-05-27', 2200), // 56d, +1640g over 35d = 46.9 g/d
      makeWeightLog('l3', 'k-slow', '2026-04-22', 440), // 21d
      makeWeightLog('l4', 'k-slow', '2026-05-27', 1650), // 56d
      makeWeightLog('lg', 'g-kid', '2026-05-27', 10000, 'Goat'),
    ];

    const fastSeries = buildAnimalGrowthSeries({
      animal: fastKit,
      careLogs,
      targetCurve,
      referenceDateIso: '2026-06-01',
    });
    expect(fastSeries.hasBirthDate).toBe(true);
    expect(fastSeries.points).toHaveLength(2);
    expect(fastSeries.startAgeDays).toBe(21);
    expect(fastSeries.startWeightGrams).toBe(560);
    expect(fastSeries.latestAgeDays).toBe(56);
    expect(fastSeries.totalGainGrams).toBe(1640);
    expect(fastSeries.overallAdgGramsPerDay).toBe(46.9);
    // Latest 2200g vs target 1900g = +300g (+15.8%)
    expect(fastSeries.targetDeltaGrams).toBe(300);
    expect(fastSeries.targetDeltaPct).toBe(15.8);

    const noDobSeries = buildAnimalGrowthSeries({
      animal: noDobAnimal,
      careLogs,
      referenceDateIso: '2026-06-01',
    });
    expect(noDobSeries.hasBirthDate).toBe(false);
    expect(noDobSeries.points).toEqual([]);

    // Barn cohort curve must group only Rabbit observations into 7-day buckets
    const cohort = buildBarnCohortBenchmarkCurve({
      animals: [fastKit, slowKit, noDobAnimal, goatAnimal],
      careLogs,
      speciesName: 'Rabbit',
      referenceDateIso: '2026-06-01',
    });
    expect(cohort.map((c) => c.ageDays)).toEqual([21, 56]);
    expect(cohort[0].meanWeightGrams).toBe(500); // (560 + 440) / 2
    expect(cohort[1].meanWeightGrams).toBe(1925); // (2200 + 1650) / 2
    expect(cohort[1].sampleCount).toBe(2);

    const chartModel = buildComparativeGrowthChartModel({
      animals: [fastKit, slowKit, goatAnimal],
      selectedAnimalIds: ['k-fast', 'k-slow'],
      careLogs,
      speciesProfile: rabbitProfile,
      includeCohortBenchmark: true,
      referenceDateIso: '2026-06-01',
    });
    expect(chartModel.series).toHaveLength(2);
    expect(chartModel.targetCurve).toEqual(targetCurve);
    expect(chartModel.cohortCurve).toHaveLength(2);
    expect(chartModel.maxAgeDays).toBe(56);
    expect(chartModel.maxWeightGrams).toBe(2200);
  });

  it('formats Rate of Gain and axis ticks across all WeightUnits cleanly', () => {
    expect(formatRateOfGain(null, 'grams')).toBe('—');
    expect(formatRateOfGain(42.5, 'grams')).toBe('+42.5 g/d');
    expect(formatRateOfGain(-100, 'kg')).toBe('-0.100 kg/d');
    expect(formatRateOfGain(453.59237, 'lbs')).toBe('+1.000 lb/d');
    expect(formatRateOfGain(28.349523125, 'lbs_oz')).toBe('+1.00 oz/d (+28.3 g/d)');

    expect(gramsToAxisNumeric(2500, 'kg')).toBe(2.5);
    expect(formatCompactWeightAxisTick(1500, 'grams')).toBe('1500g');
    expect(formatCompactWeightAxisTick(1500, 'kg')).toBe('1.5kg');
    expect(formatCompactWeightAxisTick(2268, 'lbs')).toBe('5.0lb');
    expect(formatCompactWeightAxisTick(2268, 'lbs_oz')).toContain('.');
  });
});
