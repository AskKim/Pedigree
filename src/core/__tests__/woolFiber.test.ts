import fs from 'node:fs';
import path from 'node:path';
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
import {
  isWoolApplicableSpecies,
  isWoolModuleEnabledForSpecies,
  WoolHarvest,
} from '../models';
import {
  generateEvansHtmPedigree,
  mergeBarnSnapshots,
  parseBarnBackupJson,
} from '../syncAndExports';
import { UniversalPedigreeImporter } from '../importers/universalPedigreeImporter';
import { makeAnimal, makeEmptySnapshot, makeSettings, makeSpeciesProfile } from './testFixtures';

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

  it('restricts wool eligibility to applicable fiber species and defaults display off until user-enabled', () => {
    expect(isWoolApplicableSpecies('Rabbit')).toBe(true);
    expect(isWoolApplicableSpecies('Sheep')).toBe(true);
    expect(isWoolApplicableSpecies('Angora Goat')).toBe(true);
    expect(isWoolApplicableSpecies('Alpaca')).toBe(true);
    expect(isWoolApplicableSpecies('Llama')).toBe(true);

    expect(isWoolApplicableSpecies('Ferret')).toBe(false);
    expect(isWoolApplicableSpecies('Dog')).toBe(false);
    expect(isWoolApplicableSpecies('Cat')).toBe(false);
    expect(isWoolApplicableSpecies('Cattle')).toBe(false);
    expect(isWoolApplicableSpecies('Swine / Pig')).toBe(false);
    expect(isWoolApplicableSpecies('Guinea Pig')).toBe(false);
    expect(isWoolApplicableSpecies('Chinchilla')).toBe(false);
    expect(isWoolApplicableSpecies('')).toBe(false);

    const rabbitDefault = makeSpeciesProfile('Rabbit');
    expect(isWoolModuleEnabledForSpecies(rabbitDefault)).toBe(false);
    expect(isWoolModuleEnabledForSpecies({ ...rabbitDefault, woolTrackingEnabled: true })).toBe(true);

    const ferretForced = { ...makeSpeciesProfile('Ferret'), woolTrackingEnabled: true };
    expect(isWoolModuleEnabledForSpecies(ferretForced)).toBe(false);
  });

  it('preserves woolTrackingEnabled across backup import & snapshot merge only on applicable species', () => {
    const rabbitOn = {
      ...makeSpeciesProfile('Rabbit'),
      woolTrackingEnabled: true,
      updatedAt: '2026-06-01T12:00:00.000Z',
    };
    const sheepOff = { ...makeSpeciesProfile('Sheep'), woolTrackingEnabled: false };
    const ferretInvalid = {
      ...makeSpeciesProfile('Ferret'),
      woolTrackingEnabled: true,
      updatedAt: '2026-06-01T12:00:00.000Z',
    };

    const snap = makeEmptySnapshot({
      speciesProfiles: [rabbitOn, sheepOff, ferretInvalid],
    });

    const parsedBackup = parseBarnBackupJson(JSON.stringify(snap), makeSettings());
    expect(parsedBackup.speciesProfiles.find((s) => s.name === 'Rabbit')?.woolTrackingEnabled).toBe(true);
    expect(parsedBackup.speciesProfiles.find((s) => s.name === 'Sheep')?.woolTrackingEnabled).toBeFalsy();
    expect(parsedBackup.speciesProfiles.find((s) => s.name === 'Ferret')?.woolTrackingEnabled).toBeFalsy();

    const base = makeEmptySnapshot({
      speciesProfiles: [makeSpeciesProfile('Rabbit'), makeSpeciesProfile('Ferret')],
    });
    const mergeRes = mergeBarnSnapshots(base, snap);
    expect(mergeRes.snapshot.speciesProfiles.find((s) => s.name === 'Rabbit')?.woolTrackingEnabled).toBe(true);
    expect(mergeRes.snapshot.speciesProfiles.find((s) => s.name === 'Ferret')?.woolTrackingEnabled).toBeFalsy();
  });

  it('keeps Herd Registry, Species Hub, Store, SQLite, and Universal Importer free of static woolFiber imports', () => {
    const root = process.cwd();
    const isolatedFiles = [
      'src/core/showDocuments.ts',
      'src/storage/webSqliteAdapter.ts',
      'src/hooks/useBarnStore.ts',
      'src/components/HerdScreen.tsx',
      'src/components/SpeciesDashboardScreen.tsx',
      'src/core/importers/universalPedigreeImporter.ts',
    ];
    for (const relPath of isolatedFiles) {
      const contents = fs.readFileSync(path.resolve(root, relPath), 'utf8');
      expect(contents, `${relPath} must not statically import woolFiber`).not.toMatch(
        /^\s*import\b[\s\S]*?\bfrom\s+['"][^'"]*woolFiber['"]/m
      );
    }
  });

  it('captures wool/fiber and IAGARB data during HTM, CSV, and JSON pedigree imports for fiber species even when UI display is off', () => {
    const encoder = new TextEncoder();
    const sire = makeAnimal('s1', {
      name: 'Snowflake Buck',
      tattoo: 'SB-10',
      species: 'Rabbit',
      breed: 'German Angora',
      sex: 'Male',
    });
    const subject = makeAnimal('a1', {
      name: 'Cloud Nine',
      tattoo: 'CN-01',
      species: 'Rabbit',
      breed: 'German Angora',
      sex: 'Female',
      sireId: sire.id,
    });
    const scorecard = normalizeIagarbScorecard({
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
        id: 'wh-sub-1',
        animalId: subject.id,
        primeWeightGrams: 520,
        gradeWeightGrams: 180,
        shearingIntervalDays: 90,
        iagarbScore: scorecard,
      }),
      makeHarvest({
        id: 'wh-sire-1',
        animalId: sire.id,
        primeWeightGrams: 300,
        gradeWeightGrams: 75,
        shearingIntervalDays: 90,
      }),
    ];

    const htm = generateEvansHtmPedigree(
      subject,
      [subject, sire],
      [makeSpeciesProfile('Rabbit')],
      makeSettings(),
      3,
      undefined,
      { layoutPreset: 'iagarb_angora', woolHarvests: harvests }
    );

    const existingEmpty = makeEmptySnapshot({
      speciesProfiles: [makeSpeciesProfile('Rabbit')], // woolTrackingEnabled omitted/false
    });

    const htmPreview = UniversalPedigreeImporter.parse(
      [{ fileName: 'cloud_nine.htm', bytes: encoder.encode(htm) }],
      existingEmpty,
      { fallbackSpeciesName: 'Rabbit' }
    );
    expect(htmPreview.woolHarvests?.length).toBeGreaterThanOrEqual(2);
    const importedSub = htmPreview.animals.find((a) => a.name === 'Cloud Nine');
    const importedSire = htmPreview.animals.find((a) => a.name === 'Snowflake Buck');
    expect(importedSub).toBeDefined();
    expect(importedSire).toBeDefined();
    const subWh = htmPreview.woolHarvests?.find((w) => w.animalId === importedSub?.id);
    expect(subWh?.primeWeightGrams).toBe(520);
    expect(subWh?.gradeWeightGrams).toBe(180);
    expect(subWh?.iagarbScore?.totalPts).toBe(89);
    const sireWh = htmPreview.woolHarvests?.find((w) => w.animalId === importedSire?.id);
    expect(sireWh?.primeWeightGrams).toBe(300);
    expect(sireWh?.gradeWeightGrams).toBe(75);
    expect(importedSire?.variety).not.toMatch(/wool|prime|grade/i);

    const sheepCsv = [
      'Name,Tattoo,Species,Sex,Wool Prime Grams,Wool Grade Grams,Shearing Date,Shearing Interval Days,Wool Harvest Method,Staple Length Mm,IAGARB Score',
      'Merino Star,MS-12,Sheep,Female,1850,420,2026-05-02,180,Shear,95,86',
    ].join('\n');
    const csvPreview = UniversalPedigreeImporter.parse(
      [{ fileName: 'sheep.csv', bytes: encoder.encode(sheepCsv) }],
      existingEmpty,
      { fallbackSpeciesName: 'Sheep' }
    );
    expect(csvPreview.woolHarvests).toHaveLength(1);
    const sheepWh = csvPreview.woolHarvests?.[0];
    expect(sheepWh?.species).toBe('Sheep');
    expect(sheepWh?.primeWeightGrams).toBe(1850);
    expect(sheepWh?.gradeWeightGrams).toBe(420);
    expect(sheepWh?.harvestDateIso).toBe('2026-05-02');
    expect(sheepWh?.shearingIntervalDays).toBe(180);
    expect(sheepWh?.harvestMethod).toBe('Shear');
    expect(sheepWh?.stapleLengthMm).toBe(95);
    expect(sheepWh?.iagarbScore?.totalPts).toBe(86);

    const ferretCsv = [
      'Name,Tattoo,Species,Sex,Wool Prime Grams,IAGARB Score',
      'Bandit,FR-01,Ferret,Male,200,85',
    ].join('\n');
    const ferretPreview = UniversalPedigreeImporter.parse(
      [{ fileName: 'ferret.csv', bytes: encoder.encode(ferretCsv) }],
      existingEmpty,
      { fallbackSpeciesName: 'Ferret' }
    );
    expect(ferretPreview.woolHarvests).toHaveLength(0);
  });
});
