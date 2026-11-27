import { describe, expect, it } from 'vitest';
import { Animal } from '../models';
import {
  buildPairingComparisonMatrix,
  MAX_MATRIX_CANDIDATES,
  selectDefaultMatrixCandidateIds,
} from '../pairingMatrix';
import { makeAnimal } from './testFixtures';

function toHerdMap(animals: Animal[]): Map<string, Animal> {
  return new Map(animals.map((a) => [a.id, a]));
}

function buildLineageFixture(): {
  dam: Animal;
  outcrossSire: Animal;
  halfSibSire: Animal;
  fullSibSire: Animal;
  charlieRiskSire: Animal;
  herdById: Map<string, Animal>;
} {
  const founderBuck = makeAnimal('founder-buck', {
    name: 'King Crimson',
    tattoo: 'KC-01',
    sex: 'Male',
    breed: 'New Zealand',
    variety: 'Red',
    genotypeRaw: 'AA BB CC DD ee ww enen',
    confirmedCarrierOf: ['REW / Ruby-Eyed White (cc)'],
  });

  const founderDoeA = makeAnimal('founder-doe-a', {
    name: 'Maple Queen',
    tattoo: 'MQ-01',
    sex: 'Female',
    breed: 'New Zealand',
    variety: 'Red',
    genotypeRaw: 'AA BB CC DD ee ww enen',
  });

  const founderDoeB = makeAnimal('founder-doe-b', {
    name: 'Clover Belle',
    tattoo: 'CB-01',
    sex: 'Female',
    breed: 'New Zealand',
    variety: 'Red',
    genotypeRaw: 'AA BB CC DD ee ww enen',
  });

  // Dam: daughter of King Crimson x Maple Queen, Confirmed Dilute carrier + Broken (Enen)
  const dam = makeAnimal('dam-1', {
    name: 'Amber Rose',
    tattoo: 'AR-10',
    sex: 'Female',
    breed: 'New Zealand',
    variety: 'Broken Red',
    sireId: founderBuck.id,
    damId: founderDoeA.id,
    genotypeRaw: 'AA BB Cc DD ee ww Enen',
    confirmedCarrierOf: ['Dilute / Blue-Lilac-Fawn (dd)'],
  });

  // Outcross Sire: unrelated, cleared of Dilute, solid black
  const outcrossSire = makeAnimal('sire-outcross', {
    name: 'Shadow Oak',
    tattoo: 'SO-02',
    sex: 'Male',
    breed: 'New Zealand',
    variety: 'Black',
    genotypeRaw: 'aa BB CC DD EE ww enen',
    clearedCarrierOf: [{ trait: 'Dilute / Blue-Lilac-Fawn (dd)', proofType: 'dna_tested' }],
  });

  // Half-sibling Sire: shares King Crimson (COI = 12.5%) and Suspected Dilute
  const halfSibSire = makeAnimal('sire-halfsib', {
    name: 'Copper Ridge',
    tattoo: 'CR-05',
    sex: 'Male',
    breed: 'New Zealand',
    variety: 'Red',
    sireId: founderBuck.id,
    damId: founderDoeB.id,
    genotypeRaw: 'AA BB CC DD ee ww enen',
    suspectedCarrierOf: ['Dilute / Blue-Lilac-Fawn (dd)'],
  });

  // Full-sibling Sire: shares King Crimson & Maple Queen (COI = 25%) + Confirmed Dilute (Danger!)
  const fullSibSire = makeAnimal('sire-fullsib', {
    name: 'Scarlet Blaze',
    tattoo: 'SB-09',
    sex: 'Male',
    breed: 'New Zealand',
    variety: 'Red',
    sireId: founderBuck.id,
    damId: founderDoeA.id,
    genotypeRaw: 'AA BB CC DD ee ww enen',
    confirmedCarrierOf: ['Dilute / Blue-Lilac-Fawn (dd)'],
  });

  // Unrelated Broken Sire: 0% COI, but Enen x Enen triggers 25% Charlie (EnEn) genetic danger
  const charlieRiskSire = makeAnimal('sire-charlie', {
    name: 'Spotty Jack',
    tattoo: 'SJ-07',
    sex: 'Male',
    breed: 'Rex',
    variety: 'Broken Red',
    genotypeRaw: 'AA BB CC DD ee ww Enen',
  });

  const herdById = toHerdMap([
    founderBuck,
    founderDoeA,
    founderDoeB,
    dam,
    outcrossSire,
    halfSibSire,
    fullSibSire,
    charlieRiskSire,
  ]);

  return { dam, outcrossSire, halfSibSire, fullSibSire, charlieRiskSire, herdById };
}

describe('pairingMatrix — multi-candidate side-by-side breeding comparison', () => {
  it('compares 1 dam against multiple candidate sires with exact COI, bottleneck ancestors, carrier/genetic risks, and coat varieties', () => {
    const { dam, outcrossSire, halfSibSire, fullSibSire, charlieRiskSire, herdById } =
      buildLineageFixture();

    const result = buildPairingComparisonMatrix({
      anchor: dam,
      anchorRole: 'dam',
      candidates: [fullSibSire, halfSibSire, charlieRiskSire, outcrossSire],
      herdById,
      speciesName: 'Rabbit',
      sortBy: 'best_match',
    });

    expect(result.anchorRole).toBe('dam');
    expect(result.anchor.id).toBe(dam.id);
    expect(result.rows).toHaveLength(4);

    // Best match puts 0-danger outcross first, then 0-danger half-sib (12.5% COI), then danger rows
    expect(result.rows[0].candidate.id).toBe(outcrossSire.id);
    expect(result.rows[0].coiPercent).toBeCloseTo(0, 4);
    expect(result.rows[0].isRecommendedLowestRisk).toBe(true);
    expect(result.rows[0].topBottlenecks).toHaveLength(0);
    expect(result.rows[0].riskSummary.totalDangerCount).toBe(0);
    expect(result.rows[0].topVarieties.length).toBeGreaterThan(0);

    // Half-sib row: 12.5% COI via King Crimson bottleneck + Dilute warning (Confirmed x Suspected)
    const halfSibRow = result.rows.find((r) => r.candidate.id === halfSibSire.id)!;
    expect(halfSibRow.coiPercent).toBeCloseTo(12.5, 2);
    expect(halfSibRow.topBottlenecks).toHaveLength(1);
    expect(halfSibRow.topBottlenecks[0].name).toBe('King Crimson');
    expect(halfSibRow.topBottlenecks[0].coiContributionPercent).toBeCloseTo(12.5, 2);
    expect(halfSibRow.riskSummary.carrierDangerCount).toBe(0);
    expect(halfSibRow.riskSummary.carrierWarningCount).toBeGreaterThanOrEqual(1);

    // Full-sib row: 25% COI via 2 shared bottlenecks + Confirmed x Confirmed Dilute danger
    const fullSibRow = result.rows.find((r) => r.candidate.id === fullSibSire.id)!;
    expect(fullSibRow.coiPercent).toBeCloseTo(25.0, 2);
    expect(fullSibRow.topBottlenecks).toHaveLength(2);
    expect(fullSibRow.riskSummary.carrierDangerCount).toBe(1);
    expect(fullSibRow.riskSummary.totalDangerCount).toBe(1);

    // Charlie risk row: 0% COI but 25% EnEn genetic danger alert
    const charlieRow = result.rows.find((r) => r.candidate.id === charlieRiskSire.id)!;
    expect(charlieRow.coiPercent).toBeCloseTo(0, 4);
    expect(charlieRow.riskSummary.geneticDangerCount).toBe(1);
    expect(charlieRow.riskSummary.totalDangerCount).toBe(1);
    expect(charlieRow.sameBreed).toBe(false);
    expect(
      charlieRow.riskSummary.geneticAlerts.some((a) => a.title.includes('Charlie'))
    ).toBe(true);

    // Summary stats
    expect(result.summary.totalEvaluated).toBe(4);
    expect(result.summary.dangerRiskCount).toBe(2);
    expect(result.summary.lowCoiCount).toBe(1);
    expect(result.summary.lowestCoiPercent).toBeCloseTo(0, 4);
    expect(result.summary.highestCoiPercent).toBeCloseTo(25, 2);
  });

  it('supports reverse mode (1 anchor sire vs. multiple candidate dams)', () => {
    const { dam, halfSibSire, herdById } = buildLineageFixture();
    const unrelatedDam = makeAnimal('dam-unrelated', {
      name: 'Willow Snow',
      tattoo: 'WS-04',
      sex: 'Female',
      breed: 'New Zealand',
      variety: 'Red',
      genotypeRaw: 'AA BB CC DD ee ww enen',
    });
    herdById.set(unrelatedDam.id, unrelatedDam);

    const result = buildPairingComparisonMatrix({
      anchor: halfSibSire,
      anchorRole: 'sire',
      candidates: [dam, unrelatedDam],
      herdById,
      speciesName: 'Rabbit',
    });

    expect(result.anchorRole).toBe('sire');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].sire.id).toBe(halfSibSire.id);
    expect(result.rows[0].dam.id).toBe(unrelatedDam.id);
    expect(result.rows[0].coiPercent).toBeCloseTo(0, 4);
    expect(result.rows[1].dam.id).toBe(dam.id);
    expect(result.rows[1].coiPercent).toBeCloseTo(12.5, 2);
  });

  it('supports sorting modes and hideDangerRisks / maxCoiPercent filters', () => {
    const { dam, outcrossSire, halfSibSire, fullSibSire, charlieRiskSire, herdById } =
      buildLineageFixture();

    const byCoiDesc = buildPairingComparisonMatrix({
      anchor: dam,
      anchorRole: 'dam',
      candidates: [outcrossSire, halfSibSire, fullSibSire, charlieRiskSire],
      herdById,
      sortBy: 'coi_desc',
    });
    expect(byCoiDesc.rows[0].candidate.id).toBe(fullSibSire.id);
    expect(byCoiDesc.rows[1].candidate.id).toBe(halfSibSire.id);

    const filteredSafeLowCoi = buildPairingComparisonMatrix({
      anchor: dam,
      anchorRole: 'dam',
      candidates: [outcrossSire, halfSibSire, fullSibSire, charlieRiskSire],
      herdById,
      hideDangerRisks: true,
      maxCoiPercent: 10,
    });
    expect(filteredSafeLowCoi.rows.map((r) => r.candidate.id)).toEqual([outcrossSire.id]);
    expect(filteredSafeLowCoi.summary.totalEvaluated).toBe(4);
    expect(filteredSafeLowCoi.summary.totalMatchingFilters).toBe(1);
  });

  it('isolates custom species without bleeding Rabbit coat color formulas and enforces species boundary / deduplication / cap', () => {
    const customDam = makeAnimal('yak-dam', {
      name: 'Tibetan Star',
      tattoo: 'YS-1',
      species: 'Yak',
      sex: 'Female',
      genotypeRaw: 'Trim-White / Polled',
    });
    const customSire = makeAnimal('yak-sire', {
      name: 'Summit Bull',
      tattoo: 'YS-2',
      species: 'Yak',
      sex: 'Male',
      genotypeRaw: 'Royal Black',
    });
    const wrongSpeciesSire = makeAnimal('rabbit-intruder', {
      name: 'Rabbit Intruder',
      tattoo: 'RB-9',
      species: 'Rabbit',
      sex: 'Male',
      genotypeRaw: 'AA BB CC DD ee',
    });

    const herdById = toHerdMap([customDam, customSire, wrongSpeciesSire]);
    const result = buildPairingComparisonMatrix({
      anchor: customDam,
      anchorRole: 'dam',
      candidates: [customDam, customSire, customSire, wrongSpeciesSire],
      herdById,
      speciesName: 'Yak',
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].candidate.id).toBe(customSire.id);
    expect(result.rows[0].genetics.isCustomSpeciesFallback).toBe(true);
    expect(result.rows[0].topVarieties).toHaveLength(0);

    // Cap enforcement test
    const manySires: Animal[] = Array.from({ length: MAX_MATRIX_CANDIDATES + 5 }, (_, i) =>
      makeAnimal(`yak-s-${i}`, {
        name: `Bull ${i}`,
        tattoo: `B-${i}`,
        species: 'Yak',
        sex: 'Male',
      })
    );
    const cappedResult = buildPairingComparisonMatrix({
      anchor: customDam,
      anchorRole: 'dam',
      candidates: manySires,
      herdById: toHerdMap([customDam, ...manySires]),
      speciesName: 'Yak',
    });
    expect(cappedResult.summary.totalRequested).toBe(MAX_MATRIX_CANDIDATES + 5);
    expect(cappedResult.summary.totalEvaluated).toBe(MAX_MATRIX_CANDIDATES);
    expect(cappedResult.summary.truncatedCount).toBe(5);
  });

  it('selects default candidates prioritizing active same-breed animals before different breeds and archived stock', () => {
    const anchor = makeAnimal('d-1', {
      name: 'Anchor',
      sex: 'Female',
      breed: 'Holland Lop',
    });
    const archivedSame = makeAnimal('s-arch', {
      name: 'Alpha Archived',
      sex: 'Male',
      breed: 'Holland Lop',
      status: 'Archived',
      archived: true,
    });
    const diffBreed = makeAnimal('s-diff', {
      name: 'Beta Rex',
      sex: 'Male',
      breed: 'Mini Rex',
    });
    const sameBreedActive = makeAnimal('s-same', {
      name: 'Zeta Lop',
      sex: 'Male',
      breed: 'Holland Lop',
    });

    const ids = selectDefaultMatrixCandidateIds(
      anchor,
      [archivedSame, diffBreed, sameBreedActive],
      2
    );
    expect(ids).toEqual(['s-same', 's-diff']);
  });
});
