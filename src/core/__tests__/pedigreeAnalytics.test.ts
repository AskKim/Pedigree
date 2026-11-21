import { describe, expect, it } from 'vitest';
import {
  analyzeAnimalFounderContributions,
  analyzePairingFounderShift,
  analyzeSpeciesFounderLoss,
  analyzeSpeciesHeritabilityTrends,
} from '../pedigreeAnalytics';
import { buildSpeciesHerdMap } from '../pedigreeCalculator';
import { BreedingRecord, CareLog } from '../models';
import { makeAnimal } from './testFixtures';

const TS = '2026-01-15T12:00:00.000Z';

function makeCareLog(
  id: string,
  animalId: string,
  dateIso: string,
  weightGrams: number
): CareLog {
  return {
    id,
    species: 'Rabbit',
    animalId,
    dateIso,
    type: 'Weight Check',
    title: 'Scale Check',
    weightGrams,
    showLegEarned: false,
    notes: '',
    createdAt: TS,
    updatedAt: TS,
  };
}

describe('pedigreeAnalytics — Founder Loss, Effective Founders & Heritability h²', () => {
  it('computes exact path-summed founder contributions (0.5^depth), fe, and sire/dam splits', () => {
    const f1 = makeAnimal('f1', { sex: 'Male', name: 'Founder Buck A' });
    const f2 = makeAnimal('f2', { sex: 'Female', name: 'Founder Doe B' });
    const f3 = makeAnimal('f3', { sex: 'Male', name: 'Founder Buck C' });
    const f4 = makeAnimal('f4', { sex: 'Female', name: 'Founder Doe D' });

    const sire = makeAnimal('s1', { sex: 'Male', sireId: 'f1', damId: 'f2' });
    const dam = makeAnimal('d1', { sex: 'Female', sireId: 'f3', damId: 'f4' });
    const kid = makeAnimal('k1', { sex: 'Male', sireId: 's1', damId: 'd1' });

    const herd = buildSpeciesHerdMap([f1, f2, f3, f4, sire, dam, kid], 'Rabbit');
    const analysis = analyzeAnimalFounderContributions(kid, herd);

    expect(analysis.knownFounderCount).toBe(4);
    expect(analysis.knownLineagePercent).toBeCloseTo(100, 5);
    expect(analysis.unknownOriginPercent).toBeCloseTo(0, 5);
    expect(analysis.effectiveFoundersFe).toBeCloseTo(4, 5);
    expect(analysis.founderBalanceRatio).toBeCloseTo(1, 5);

    const byId = new Map(analysis.founders.map((f) => [f.animal.id, f]));
    expect(byId.get('f1')?.contributionPercent).toBeCloseTo(25, 5);
    expect(byId.get('f1')?.sireLinePercent).toBeCloseTo(25, 5);
    expect(byId.get('f1')?.damLinePercent).toBeCloseTo(0, 5);
    expect(byId.get('f4')?.damLinePercent).toBeCloseTo(25, 5);
  });

  it('tracks incomplete pedigree unknown-origin percentage and avoids cycles safely', () => {
    const f1 = makeAnimal('f1', { sex: 'Male' });
    const sire = makeAnimal('s1', { sex: 'Male', sireId: 'f1', damId: 'missing-dam' });
    const dam = makeAnimal('d1', { sex: 'Female', sireId: 'cycle-s', damId: '' });
    // Deliberate corrupt cycle edge back to kid
    dam.sireId = 'kid';
    const kid = makeAnimal('kid', { sireId: 's1', damId: 'd1' });

    const herd = buildSpeciesHerdMap([f1, sire, dam, kid], 'Rabbit');
    const analysis = analyzeAnimalFounderContributions(kid, herd);

    expect(analysis.knownFounderCount).toBe(1);
    expect(analysis.knownLineagePercent).toBeCloseTo(25, 5);
    expect(analysis.unknownOriginPercent).toBeCloseTo(75, 5);
  });

  it('evaluates pairing founder shift and shared vs unique founders', () => {
    const fShared = makeAnimal('fShared', { sex: 'Male', name: 'Shared Buck' });
    const fSireMaternal = makeAnimal('fSM', { sex: 'Female', name: 'Sire Maternal' });
    const fDamMaternal = makeAnimal('fDM', { sex: 'Female', name: 'Dam Maternal' });

    const sire = makeAnimal('sire', { sex: 'Male', sireId: 'fShared', damId: 'fSM' });
    const dam = makeAnimal('dam', { sex: 'Female', sireId: 'fShared', damId: 'fDM' });

    const herd = buildSpeciesHerdMap([fShared, fSireMaternal, fDamMaternal, sire, dam], 'Rabbit');
    const shift = analyzePairingFounderShift(sire, dam, herd);

    expect(shift.sharedFounderIds).toEqual(['fShared']);
    expect(shift.uniqueSireFounderIds).toEqual(['fSM']);
    expect(shift.uniqueDamFounderIds).toEqual(['fDM']);
    expect(shift.projectedCoiPercent).toBeCloseTo(12.5, 5);
    const sharedContrib = shift.projectedOffspring.founders.find(
      (f) => f.animal.id === 'fShared'
    );
    expect(sharedContrib?.contributionPercent).toBeCloseTo(50, 5);
    expect(shift.projectedOffspring.effectiveFoundersFe).toBeCloseTo(1 / (0.5 ** 2 + 0.25 ** 2 + 0.25 ** 2), 4);
  });

  it('detects Lost, Endangered, and Active Core founders in species founder-loss ledger', () => {
    const fLost = makeAnimal('fLost', { sex: 'Male', status: 'Deceased', name: 'Lost Founder' });
    const fLostKit = makeAnimal('fLostKit', { sex: 'Female', sireId: 'fLost', status: 'Sold' });

    const fCore = makeAnimal('fCore', { sex: 'Male', status: 'Deceased', name: 'Core Founder' });
    const fEndangered = makeAnimal('fEnd', {
      sex: 'Female',
      status: 'Deceased',
      name: 'Endangered Founder',
    });

    const act1 = makeAnimal('a1', { sex: 'Male', sireId: 'fCore', damId: '' });
    const act2 = makeAnimal('a2', { sex: 'Female', sireId: 'fCore', damId: 'fEnd' });

    const report = analyzeSpeciesFounderLoss(
      [fLost, fLostKit, fCore, fEndangered, act1, act2],
      'Rabbit'
    );

    expect(report.totalFoundersCount).toBe(3);
    expect(report.lostFoundersCount).toBe(1);
    expect(report.endangeredFoundersCount).toBe(1);
    expect(report.activeFoundersCount).toBe(2);
    expect(report.founderLossPercent).toBeCloseTo((1 / 3) * 100, 4);

    const statusById = new Map(report.founderLedger.map((r) => [r.founder.id, r.status]));
    expect(statusById.get('fLost')).toBe('Lost');
    expect(statusById.get('fEnd')).toBe('Endangered');
    expect(statusById.get('fCore')).toBe('Active Core');
  });

  it('estimates mid-parent OLS heritability h², guards insufficient < 3 pairs, and builds birth-year cohorts', () => {
    // Construct 4 families whose offspring weight follows ~0.8 * midParentWeight + intercept
    const s1 = makeAnimal('s1', { sex: 'Male', birthDateIso: '2024-01-10', weightGrams: 3000 });
    const d1 = makeAnimal('d1', { sex: 'Female', birthDateIso: '2024-01-15', weightGrams: 3000 });
    const s2 = makeAnimal('s2', { sex: 'Male', birthDateIso: '2024-02-10', weightGrams: 3500 });
    const d2 = makeAnimal('d2', { sex: 'Female', birthDateIso: '2024-02-15', weightGrams: 3500 });
    const s3 = makeAnimal('s3', { sex: 'Male', birthDateIso: '2024-03-10', weightGrams: 4000 });
    const d3 = makeAnimal('d3', { sex: 'Female', birthDateIso: '2024-03-15', weightGrams: 4000 });
    const s4 = makeAnimal('s4', { sex: 'Male', birthDateIso: '2024-04-10', weightGrams: 4500 });
    const d4 = makeAnimal('d4', { sex: 'Female', birthDateIso: '2024-04-15', weightGrams: 4500 });

    const k1 = makeAnimal('k1', { birthDateIso: '2025-03-01', sireId: 's1', damId: 'd1', weightGrams: 3150 });
    const k2 = makeAnimal('k2', { birthDateIso: '2025-04-01', sireId: 's2', damId: 'd2', weightGrams: 3550 });
    const k3 = makeAnimal('k3', { birthDateIso: '2025-05-01', sireId: 's3', damId: 'd3', weightGrams: 3950 });
    const k4 = makeAnimal('k4', { birthDateIso: '2026-01-20', sireId: 's4', damId: 'd4', weightGrams: 4350 });

    // Only 1 animal has >=2 care logs -> ADG remains insufficient (< 3 pairs), while s1 latest weight stays 3000g
    const careLogs: CareLog[] = [
      makeCareLog('cl1', 's1', '2024-02-01', 1200),
      makeCareLog('cl2', 's1', '2024-03-02', 3000),
    ];
    const breedings: BreedingRecord[] = [];

    const report = analyzeSpeciesHeritabilityTrends({
      animals: [s1, d1, s2, d2, s3, d3, s4, d4, k1, k2, k3, k4],
      breedings,
      careLogs,
      speciesName: 'Rabbit',
    });

    const weightEst = report.traits.find((t) => t.traitKey === 'weight_grams')!;
    const adgEst = report.traits.find((t) => t.traitKey === 'adg_grams_per_day')!;

    expect(weightEst.method).toBe('mid_parent');
    expect(weightEst.pairCount).toBe(4);
    expect(weightEst.heritabilityH2).toBeCloseTo(0.8, 5);
    expect(weightEst.rSquared).toBeCloseTo(1, 5);

    expect(adgEst.method).toBe('insufficient');
    expect(adgEst.heritabilityH2).toBeNull();

    expect(report.cohorts.map((c) => c.year)).toEqual([2024, 2025, 2026]);
    expect(report.cohorts[0].cumulativeWeightH2).toBeNull();
    expect(report.cohorts[1].weightPairCount).toBe(3);
    expect(report.cohorts[1].cumulativeWeightH2).toBeCloseTo(0.8, 5);
  });
});
