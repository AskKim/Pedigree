import { describe, expect, it } from 'vitest';
import {
  buildPedigreeBranchViewport,
  buildPedigreeSlots,
  buildSpeciesHerdMap,
  calculateAnimalCoi,
  calculatePairingCoi,
  describeCoiRisk,
  getGen3BranchesWithKnownAncestors,
  getGen3BranchIndex,
  getPedigreeCompletenessSummary,
  wouldCreateCycle,
} from '../pedigreeCalculator';
import { makeAnimal, makeSpeciesProfile } from './testFixtures';

describe('pedigreeCalculator — Wright COI, cycles & 5/6-gen pedigree slots', () => {
  it('computes 0% Outcross COI for unrelated parents', () => {
    const sire = makeAnimal('sire', { sex: 'Male', name: 'Crimson King' });
    const dam = makeAnimal('dam', { sex: 'Female', name: 'Amber Rose' });
    const kit = makeAnimal('kit', { sireId: 'sire', damId: 'dam', name: 'Spark' });

    const herd = buildSpeciesHerdMap([sire, dam, kit], 'Rabbit');
    const analysis = calculateAnimalCoi(kit, herd);

    expect(analysis.coiPercent).toBe(0);
    expect(analysis.coiFraction).toBe(0);
    expect(analysis.risk.code).toBe('OUTCROSS');
    expect(analysis.sharedAncestors).toHaveLength(0);
    expect(analysis.knownAncestorsIn3Gen).toBe(2);
  });

  it('computes exact 25% COI for parent × offspring pairing', () => {
    const founderSire = makeAnimal('sire0', { sex: 'Male', name: 'Founder Buck' });
    const founderDam = makeAnimal('dam0', { sex: 'Female', name: 'Founder Doe' });
    const daughter = makeAnimal('d1', {
      sex: 'Female',
      sireId: 'sire0',
      damId: 'dam0',
      name: 'Daughter',
    });

    const herd = buildSpeciesHerdMap([founderSire, founderDam, daughter], 'Rabbit');
    const pairing = calculatePairingCoi('sire0', 'd1', herd);

    expect(pairing.coiPercent).toBeCloseTo(25, 5);
    expect(pairing.risk.code).toBe('HIGH');
    expect(pairing.sharedAncestors[0]?.ancestor.id).toBe('sire0');
    expect(pairing.sharedAncestors[0]?.coiContributionPercent).toBeCloseTo(25, 5);
  });

  it('computes exact 25% COI for full-sibling pairing and 12.5% for half-sibling pairing', () => {
    const s = makeAnimal('s', { sex: 'Male' });
    const d1 = makeAnimal('d1', { sex: 'Female' });
    const d2 = makeAnimal('d2', { sex: 'Female' });

    const fullBro = makeAnimal('fb', { sex: 'Male', sireId: 's', damId: 'd1' });
    const fullSis = makeAnimal('fs', { sex: 'Female', sireId: 's', damId: 'd1' });
    const halfSis = makeAnimal('hs', { sex: 'Female', sireId: 's', damId: 'd2' });

    const herd = buildSpeciesHerdMap([s, d1, d2, fullBro, fullSis, halfSis], 'Rabbit');

    const fullSibCoi = calculatePairingCoi('fb', 'fs', herd);
    expect(fullSibCoi.coiPercent).toBeCloseTo(25, 5);
    expect(fullSibCoi.sharedAncestors).toHaveLength(2);

    const halfSibCoi = calculatePairingCoi('fb', 'hs', herd);
    expect(halfSibCoi.coiPercent).toBeCloseTo(12.5, 5);
    expect(halfSibCoi.risk.code).toBe('LINEBRED');
    expect(halfSibCoi.sharedAncestors).toHaveLength(1);
    expect(halfSibCoi.sharedAncestors[0].ancestor.id).toBe('s');
  });

  it('accounts for (1 + F_A) when the shared common ancestor is itself inbred', () => {
    // Founder Buck mated to his daughter produces inbred common ancestor A with F(A) = 0.25
    const fBuck = makeAnimal('fbuck', { sex: 'Male' });
    const fDoe = makeAnimal('fdoe', { sex: 'Female' });
    const daughter = makeAnimal('dau', { sex: 'Female', sireId: 'fbuck', damId: 'fdoe' });
    const inbredA = makeAnimal('inbA', { sex: 'Male', sireId: 'fbuck', damId: 'dau' });

    const outDoe1 = makeAnimal('od1', { sex: 'Female' });
    const outDoe2 = makeAnimal('od2', { sex: 'Female' });
    const son = makeAnimal('son', { sex: 'Male', sireId: 'inbA', damId: 'od1' });
    const dau2 = makeAnimal('dau2', { sex: 'Female', sireId: 'inbA', damId: 'od2' });

    const herd = buildSpeciesHerdMap(
      [fBuck, fDoe, daughter, inbredA, outDoe1, outDoe2, son, dau2],
      'Rabbit'
    );

    // Half-sibs via inbredA: F = (0.5)^3 * (1 + 0.25) = 0.125 * 1.25 = 15.625%
    const halfSibThroughInbred = calculatePairingCoi('son', 'dau2', herd);
    expect(halfSibThroughInbred.coiPercent).toBeCloseTo(15.625, 5);
  });

  it('enforces strict species isolation in buildSpeciesHerdMap', () => {
    const rabbit = makeAnimal('r1', { species: 'Rabbit', sex: 'Male' });
    const sheep = makeAnimal('s1', { species: 'Sheep', sex: 'Female' });
    const crossKid = makeAnimal('r2', {
      species: 'Rabbit',
      sireId: 'r1',
      damId: 's1', // invalid cross-species ref must be ignored
    });

    const rabbitHerd = buildSpeciesHerdMap([rabbit, sheep, crossKid], 'Rabbit');
    expect(rabbitHerd.has('r1')).toBe(true);
    expect(rabbitHerd.has('s1')).toBe(false);

    const slots = buildPedigreeSlots(crossKid, rabbitHerd, 3);
    const gen1Dam = slots.find((sl) => sl.generation === 1 && sl.slotIndex === 1);
    expect(gen1Dam?.animal).toBeNull();
  });

  it('prevents direct self-links and multi-generation pedigree cycles via wouldCreateCycle', () => {
    const gp = makeAnimal('gp', { sex: 'Male' });
    const parent = makeAnimal('p', { sex: 'Female', sireId: 'gp' });
    const child = makeAnimal('c', { sex: 'Male', damId: 'p' });
    const unrelated = makeAnimal('u', { sex: 'Male' });
    const herd = buildSpeciesHerdMap([gp, parent, child, unrelated], 'Rabbit');

    // Direct self-parent
    expect(wouldCreateCycle('c', 'c', herd)).toBe(true);
    // Assigning grandchild `c` as parent of grandparent `gp` creates cycle gp -> p -> c -> gp
    expect(wouldCreateCycle('gp', 'c', herd)).toBe(true);
    // Assigning unrelated animal as parent of `gp` is safe
    expect(wouldCreateCycle('gp', 'u', herd)).toBe(false);
  });

  it('builds 5-gen (63 slots) and 6-gen (127 slots) pedigree trees with repeated-ancestor counts', () => {
    const animals = [];
    // Create a 6-generation chain on the top sire line, plus a shared ancestor on dam line
    const sharedG5 = makeAnimal('g5-shared', { sex: 'Male', name: 'Old Iron' });
    animals.push(sharedG5);

    let prevSireId = 'g5-shared';
    for (let g = 4; g >= 1; g--) {
      const id = `sire-gen-${g}`;
      animals.push(makeAnimal(id, { sex: 'Male', sireId: prevSireId }));
      prevSireId = id;
    }

    const damG1 = makeAnimal('dam-gen-1', { sex: 'Female', sireId: 'g5-shared' });
    const subject = makeAnimal('subj', {
      sex: 'Male',
      sireId: 'sire-gen-1',
      damId: 'dam-gen-1',
    });
    animals.push(damG1, subject);

    const herd = buildSpeciesHerdMap(animals, 'Rabbit');
    const rabbitProfile = makeSpeciesProfile('Rabbit');

    const slots5 = buildPedigreeSlots(subject, herd, 5, rabbitProfile);
    // 1 + 2 + 4 + 8 + 16 + 32 = 63
    expect(slots5).toHaveLength(63);
    expect(slots5.filter((s) => s.generation === 5)).toHaveLength(32);

    const slots6 = buildPedigreeSlots(subject, herd, 6, rabbitProfile);
    // 1 + 2 + 4 + 8 + 16 + 32 + 64 = 127
    expect(slots6).toHaveLength(127);
    expect(slots6.filter((s) => s.generation === 6)).toHaveLength(64);

    // Old Iron appears twice across generations 1..6 (once at gen5 sire line, once at gen2 maternal grandsire)
    const oldIronSlots = slots6.filter((s) => s.animal?.id === 'g5-shared');
    expect(oldIronSlots).toHaveLength(2);
    expect(oldIronSlots[0].occurrenceCount).toBe(2);
  });

  it('categorizes COI risk levels across thresholds cleanly', () => {
    expect(describeCoiRisk(0).code).toBe('OUTCROSS');
    expect(describeCoiRisk(3.125).code).toBe('LOW');
    expect(describeCoiRisk(6.25).code).toBe('MODERATE');
    expect(describeCoiRisk(12.5).code).toBe('LINEBRED');
    expect(describeCoiRisk(25).code).toBe('HIGH');
  });

  it('handles cyclic parent links safely without infinite recursion', () => {
    const a = makeAnimal('cyc-a', { sex: 'Male', sireId: 'cyc-b', damId: 'cyc-a' });
    const b = makeAnimal('cyc-b', { sex: 'Female', sireId: 'cyc-a', damId: 'cyc-b' });
    const herd = buildSpeciesHerdMap([a, b], 'Rabbit');

    const resA = calculateAnimalCoi(a, herd);
    const resPair = calculatePairingCoi('cyc-a', 'cyc-b', herd);

    expect(Number.isFinite(resA.coiPercent)).toBe(true);
    expect(Number.isFinite(resPair.coiPercent)).toBe(true);
  });

  it('flags 0% outcross results with fewer than 14 recorded 3-gen ancestors as incomplete pedigrees', () => {
    const summarySparse = getPedigreeCompletenessSummary({
      coiPercent: 0,
      knownAncestorsIn3Gen: 2,
      knownAncestorsIn4Gen: 2,
    });
    expect(summarySparse.percent3Gen).toBe(14);
    expect(summarySparse.isSparsePedigree).toBe(true);
    expect(summarySparse.isIncompleteZeroOutcross).toBe(true);

    const summaryComplete = getPedigreeCompletenessSummary({
      coiPercent: 0,
      knownAncestorsIn3Gen: 14,
      knownAncestorsIn4Gen: 26,
    });
    expect(summaryComplete.percent3Gen).toBe(100);
    expect(summaryComplete.isSparsePedigree).toBe(false);
    expect(summaryComplete.isIncompleteZeroOutcross).toBe(false);
  });

  it('bounds collapsed 5-gen and 6-gen charts to 15 Gen 0–3 slots and reveals branches on demand', () => {
    const animals = [];
    // Populate Gen 5 ancestor on Sire Branch 0 and Gen 4 ancestor on Dam Branch 4
    const gen5SireRoot = makeAnimal('g5-b0', { sex: 'Male', name: 'Branch 0 Founder' });
    const gen4SireRoot = makeAnimal('g4-b0', { sex: 'Male', sireId: 'g5-b0' });
    const gen3Sire = makeAnimal('g3-0', { sex: 'Male', sireId: 'g4-b0' });
    const gen2Sire = makeAnimal('g2-0', { sex: 'Male', sireId: 'g3-0' });
    const gen1Sire = makeAnimal('g1-0', { sex: 'Male', sireId: 'g2-0' });

    const gen4DamRoot = makeAnimal('g4-b4', { sex: 'Male', name: 'Branch 4 Sire' });
    const gen3Dam = makeAnimal('g3-4', { sex: 'Male', sireId: 'g4-b4' });
    const gen2Dam = makeAnimal('g2-2', { sex: 'Male', sireId: 'g3-4' });
    const gen1Dam = makeAnimal('g1-1', { sex: 'Female', sireId: 'g2-2' });

    const subject = makeAnimal('subj-vp', {
      sex: 'Female',
      sireId: 'g1-0',
      damId: 'g1-1',
    });
    animals.push(
      gen5SireRoot,
      gen4SireRoot,
      gen3Sire,
      gen2Sire,
      gen1Sire,
      gen4DamRoot,
      gen3Dam,
      gen2Dam,
      gen1Dam,
      subject
    );

    const herd = buildSpeciesHerdMap(animals, 'Rabbit');
    const slots6 = buildPedigreeSlots(subject, herd, 6, makeSpeciesProfile('Rabbit'));
    expect(slots6).toHaveLength(127);

    expect(getGen3BranchIndex(3, 2)).toBeNull();
    expect(getGen3BranchIndex(4, 0)).toBe(0);
    expect(getGen3BranchIndex(5, 16)).toBe(4);
    expect(getGen3BranchIndex(6, 63)).toBe(7);

    expect(getGen3BranchesWithKnownAncestors(slots6)).toEqual([0, 4]);

    const collapsed = buildPedigreeBranchViewport(slots6, 6, new Set());
    expect(collapsed.visibleSlots).toHaveLength(15);
    expect(collapsed.hiddenSlotsCount).toBe(112);
    expect(collapsed.hiddenKnownAncestorsCount).toBe(3); // g4-b0, g5-b0, g4-b4
    expect(collapsed.branchSummaries.get('3:0')?.hiddenKnownAncestors).toBe(2);
    expect(collapsed.branchSummaries.get('3:4')?.hiddenKnownAncestors).toBe(1);

    // Expanding Gen-3 Branch 0 adds its 2 + 4 + 8 = 14 descendant slots (15 + 14 = 29 visible)
    const branch0Expanded = buildPedigreeBranchViewport(slots6, 6, new Set([0]));
    expect(branch0Expanded.visibleSlots).toHaveLength(29);
    expect(branch0Expanded.hiddenKnownAncestorsCount).toBe(1);
    expect(branch0Expanded.branchSummaries.get('3:0')?.isExpanded).toBe(true);
    expect(branch0Expanded.branchSummaries.get('3:0')?.hiddenKnownAncestors).toBe(0);
    expect(branch0Expanded.branchSummaries.get('3:0')?.hasKnownAncestors).toBe(true);
  });

  it('surfaces hasKnownAncestors for externalKnownBranches even before Gen 4+ animals are loaded into memory', () => {
    const gen3Sire = makeAnimal('g3-0', { sex: 'Male', sireId: 'g4-lazy-unfetched' });
    const gen2Sire = makeAnimal('g2-0', { sex: 'Male', sireId: 'g3-0' });
    const gen1Sire = makeAnimal('g1-0', { sex: 'Male', sireId: 'g2-0' });
    const subject = makeAnimal('subj-lazy', { sex: 'Female', sireId: 'g1-0' });

    // Only Gen 0–3 exist in the base map initially
    const gen0To3Herd = buildSpeciesHerdMap([gen3Sire, gen2Sire, gen1Sire, subject], 'Rabbit');
    const slots = buildPedigreeSlots(subject, gen0To3Herd, 5, makeSpeciesProfile('Rabbit'));

    const withoutExternal = buildPedigreeBranchViewport(slots, 5, new Set());
    expect(withoutExternal.branchSummaries.get('3:0')?.hiddenKnownAncestors).toBe(0);
    expect(withoutExternal.branchSummaries.get('3:0')?.hasKnownAncestors).toBe(false);

    // SQLite/OPFS probe indicates Branch 0 (3:0) has deeper ancestors
    const withExternal = buildPedigreeBranchViewport(slots, 5, new Set(), new Set([0]));
    expect(withExternal.branchSummaries.get('3:0')?.hiddenKnownAncestors).toBe(0);
    expect(withExternal.branchSummaries.get('3:0')?.hasKnownAncestors).toBe(true);
    expect(withExternal.branchSummaries.get('3:1')?.hasKnownAncestors).toBe(false);
  });
});

