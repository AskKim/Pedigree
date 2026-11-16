import { describe, expect, it } from 'vitest';
import {
  buildPresetGenotypeWithConfirmations,
  formatGenotypeArray,
  getGeneticsSpecForSpecies,
  getSpeciesVarietyPresets,
  inferHiddenAlleles,
  parseGenotypeString,
  simulatePairingGenetics,
} from '../geneticsEngine';
import { PREDEFINED_SPECIES_PRESETS } from '../models';
import { buildSpeciesHerdMap } from '../pedigreeCalculator';
import { makeAnimal } from './testFixtures';

describe('geneticsEngine — genotype parsing, allele inference & Punnett simulation', () => {
  it('parses multi-character alleles (chd, En, at) and formats back cleanly', () => {
    const parsed = parseGenotypeString('Aat Bb Cchd D_ ee Ww Enen', 'Rabbit');
    expect(parsed).toEqual([
      { locus: 'A', allele1: 'A', allele2: 'at' },
      { locus: 'B', allele1: 'B', allele2: 'b' },
      { locus: 'C', allele1: 'C', allele2: 'chd' },
      { locus: 'D', allele1: 'D', allele2: '_' },
      { locus: 'E', allele1: 'e', allele2: 'e' },
      { locus: 'W', allele1: 'W', allele2: 'w' },
      { locus: 'En', allele1: 'En', allele2: 'en' },
    ]);

    expect(formatGenotypeArray(parsed)).toBe('Aat Bb Cchd D_ ee Ww Enen');
  });

  it('normalizes leading blanks (_a -> a_) during parsing and inference', () => {
    const parsed = parseGenotypeString('_a _b CC D_ E_', 'Rabbit');
    expect(formatGenotypeArray(parsed)).toBe('a_ b_ CC D_ E_');
  });

  it('keeps New Zealand Red / Red variety presets conservative (__ for Wide-Band) unless explicitly confirmed ww', () => {
    const presets = getSpeciesVarietyPresets('Rabbit');
    const nzRed = presets.find((p) => p.variety === 'New Zealand Red');
    expect(nzRed).toBeDefined();
    expect(nzRed!.conservativeGenotype).toBe('A_ B_ C_ D_ ee __');
    expect(nzRed!.optionalConfirmations?.some((o) => o.locus === 'W' && o.suggestedAlleles === 'ww')).toBe(
      true
    );

    expect(buildPresetGenotypeWithConfirmations(nzRed!, [], 'Rabbit')).toBe('A_ B_ C_ D_ ee __');
    expect(buildPresetGenotypeWithConfirmations(nzRed!, ['W'], 'Rabbit')).toBe('A_ B_ C_ D_ ee ww');
  });

  it('never fabricates fake __ homozygous certainty in Punnett outcomes and notes Wide-Band unverified Red', () => {
    const redSire = makeAnimal('sire', {
      sex: 'Male',
      genotypeRaw: 'AA BB CC DD ee Ww enen',
      genotype: parseGenotypeString('AA BB CC DD ee Ww enen', 'Rabbit'),
    });
    const redDam = makeAnimal('dam', {
      sex: 'Female',
      genotypeRaw: 'AA BB CC DD ee __ enen',
      genotype: parseGenotypeString('AA BB CC DD ee __ enen', 'Rabbit'),
    });

    const sim = simulatePairingGenetics(redSire, redDam, 'Rabbit');
    expect(sim.hasUnknownAlleles).toBe(true);
    expect(sim.uncertainLociNotes.length).toBeGreaterThan(0);

    const wOutcome = sim.locusBreakdowns.find((l) => l.locus === 'W');
    expect(wOutcome).toBeDefined();
    expect(wOutcome!.outcomes.some((o) => o.genotype === '__')).toBe(false);
    expect(wOutcome!.outcomes.every((o) => o.hasUnknownCarrier)).toBe(true);
    expect(
      sim.lethalOrHealthAlerts.some((a) => a.locus === 'W' && a.title.includes('Wide-Band'))
    ).toBe(true);
  });

  it('infers hidden recessive alleles and homozygous dominant parental pairs cleanly', () => {
    const rewSire = makeAnimal('sire', {
      sex: 'Male',
      name: 'Snowball',
      genotypeRaw: 'AA BB cc D_ E_',
      genotype: parseGenotypeString('AA BB cc D_ E_', 'Rabbit'),
    });
    const agoutiDam = makeAnimal('dam', {
      sex: 'Female',
      name: 'Lady',
      genotypeRaw: 'AA BB C_ D_ E_',
      genotype: parseGenotypeString('AA BB C_ D_ E_', 'Rabbit'),
    });
    const subject = makeAnimal('subj', {
      sex: 'Female',
      name: 'Ruby',
      sireId: 'sire',
      damId: 'dam',
      genotypeRaw: 'A_ B_ C_ D_ E_',
      genotype: parseGenotypeString('A_ B_ C_ D_ E_', 'Rabbit'),
    });
    const redKit = makeAnimal('kit', {
      sex: 'Male',
      name: 'Copper',
      damId: 'subj',
      genotypeRaw: 'A_ B_ cc D_ ee',
      genotype: parseGenotypeString('A_ B_ cc D_ ee', 'Rabbit'),
    });

    const all = [rewSire, agoutiDam, subject, redKit];
    const herd = buildSpeciesHerdMap(all, 'Rabbit');
    const inferred = inferHiddenAlleles(subject, herd, all, 'Rabbit');

    expect(inferred.conflicts).toHaveLength(0);
    expect(inferred.updatedPairs.find((p) => p.locus === 'A')).toEqual({
      locus: 'A',
      allele1: 'A',
      allele2: 'A',
    });
    expect(inferred.updatedPairs.find((p) => p.locus === 'B')).toEqual({
      locus: 'B',
      allele1: 'B',
      allele2: 'B',
    });
    expect(inferred.updatedPairs.find((p) => p.locus === 'C')).toEqual({
      locus: 'C',
      allele1: 'C',
      allele2: 'c',
    });
    expect(inferred.updatedPairs.find((p) => p.locus === 'E')).toEqual({
      locus: 'E',
      allele1: 'E',
      allele2: 'e',
    });
  });

  it('infers intermediate otter (at) and dark chinchilla (chd) carrier status from homozygous offspring', () => {
    const buck = makeAnimal('buck', {
      sex: 'Male',
      name: 'Ches',
      genotypeRaw: 'A_ BB C_ DD E_',
      genotype: parseGenotypeString('A_ BB C_ DD E_', 'Rabbit'),
    });
    const kit = makeAnimal('kit', {
      sex: 'Female',
      name: 'Otter Chin Kit',
      sireId: 'buck',
      genotypeRaw: 'atat BB chdchd DD E_',
      genotype: parseGenotypeString('atat BB chdchd DD E_', 'Rabbit'),
    });
    const all = [buck, kit];
    const herd = buildSpeciesHerdMap(all, 'Rabbit');
    const inferred = inferHiddenAlleles(buck, herd, all, 'Rabbit');

    expect(inferred.conflicts).toHaveLength(0);
    expect(inferred.formatted).toBe('Aat BB Cchd DD E_');
  });

  it('flags biological impossibility conflicts when recorded genotypes contradict parents or kits', () => {
    const chocoSire = makeAnimal('sire', {
      sex: 'Male',
      name: 'Cocoa',
      genotypeRaw: 'aa bb C_ D_ E_',
      genotype: parseGenotypeString('aa bb C_ D_ E_', 'Rabbit'),
    });
    const impossibleKit = makeAnimal('kit', {
      sex: 'Female',
      name: 'Jet',
      sireId: 'sire',
      genotypeRaw: 'aa BB C_ D_ E_',
      genotype: parseGenotypeString('aa BB C_ D_ E_', 'Rabbit'),
    });

    const all = [chocoSire, impossibleKit];
    const herd = buildSpeciesHerdMap(all, 'Rabbit');
    const result = inferHiddenAlleles(impossibleKit, herd, all, 'Rabbit');

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toContain('bb');
    expect(result.conflicts[0]).toContain('BB');
  });

  it('simulates Punnett locus outcomes and New Zealand Red vs Tortoise phenotypes', () => {
    const buck = makeAnimal('buck', {
      sex: 'Male',
      genotypeRaw: 'Aa BB CC DD ee ww Enen',
      genotype: parseGenotypeString('Aa BB CC DD ee ww Enen', 'Rabbit'),
    });
    const doe = makeAnimal('doe', {
      sex: 'Female',
      genotypeRaw: 'Aa BB CC DD ee ww enen',
      genotype: parseGenotypeString('Aa BB CC DD ee ww enen', 'Rabbit'),
    });

    const sim = simulatePairingGenetics(buck, doe, 'Rabbit');

    expect(sim.hasUnknownAlleles).toBe(false);
    const aLocus = sim.locusBreakdowns.find((l) => l.locus === 'A');
    expect(aLocus?.outcomes).toEqual([
      { genotype: 'Aa', probabilityPercent: 50, hasUnknownCarrier: false },
      { genotype: 'AA', probabilityPercent: 25, hasUnknownCarrier: false },
      { genotype: 'aa', probabilityPercent: 25, hasUnknownCarrier: false },
    ]);

    const enLocus = sim.locusBreakdowns.find((l) => l.locus === 'En');
    expect(enLocus?.outcomes).toEqual([
      { genotype: 'Enen', probabilityPercent: 50, hasUnknownCarrier: false },
      { genotype: 'enen', probabilityPercent: 50, hasUnknownCarrier: false },
    ]);

    const totalPhenoProb = sim.predictedPhenotypes.reduce(
      (sum, p) => sum + p.probabilityPercent,
      0
    );
    expect(totalPhenoProb).toBeCloseTo(100, 1);
    expect(sim.predictedPhenotypes.some((p) => p.label === 'New Zealand Red (Wide-Band ww)')).toBe(
      true
    );
    expect(sim.predictedPhenotypes.some((p) => p.label === 'Black Tortoise')).toBe(true);
  });

  it('computes X-linked sex-stratified Punnett outcomes for Cat O/o crossings', () => {
    const tom = makeAnimal('tom', {
      species: 'Cat',
      sex: 'Male',
      genotypeRaw: 'aa BB CC DD OY ww ii',
      genotype: parseGenotypeString('aa BB CC DD OY ww ii', 'Cat'),
    });
    const queen = makeAnimal('queen', {
      species: 'Cat',
      sex: 'Female',
      genotypeRaw: 'aa BB CC DD oo ww ii',
      genotype: parseGenotypeString('aa BB CC DD oo ww ii', 'Cat'),
    });

    const sim = simulatePairingGenetics(tom, queen, 'Cat');
    const oLocus = sim.locusBreakdowns.find((l) => l.locus === 'O');
    expect(oLocus?.inheritanceMode).toBe('x_linked');
    expect(oLocus?.sexSplitOutcomes?.male).toEqual([
      { genotype: 'oY', probabilityPercent: 100, hasUnknownCarrier: false },
    ]);
    expect(oLocus?.sexSplitOutcomes?.female).toEqual([
      { genotype: 'Oo', probabilityPercent: 100, hasUnknownCarrier: false },
    ]);
    expect(
      sim.predictedPhenotypes.some((p) => p.sexGroup === 'Female' && p.label.includes('Tortoiseshell'))
    ).toBe(true);
    expect(sim.predictedPhenotypes.some((p) => p.sexGroup === 'Male' && p.label.includes('Black'))).toBe(
      true
    );
  });

  it('provides species specs for all 11 predefined species and isolates custom species to null fallback', () => {
    for (const preset of PREDEFINED_SPECIES_PRESETS) {
      const spec = getGeneticsSpecForSpecies(preset.name);
      expect(spec, `Expected spec for ${preset.name}`).not.toBeNull();
      expect(spec!.loci.length).toBeGreaterThanOrEqual(3);
      expect(spec!.varietyPresets.length).toBeGreaterThan(0);

      // Smoke-test conservative preset round-trip parsing + Punnett simulation
      const g = spec!.varietyPresets[0].conservativeGenotype;
      const parsed = parseGenotypeString(g, preset.name);
      expect(parsed.length).toBeGreaterThan(0);

      const s = makeAnimal('s', { species: preset.name, sex: 'Male', genotypeRaw: g, genotype: parsed });
      const d = makeAnimal('d', { species: preset.name, sex: 'Female', genotypeRaw: g, genotype: parsed });
      const sim = simulatePairingGenetics(s, d, preset.name);
      expect(sim.isCustomSpeciesFallback).toBe(false);
    }

    // Custom species MUST return null so Rabbit rules never leak into Emu / Duck / Custom
    expect(getGeneticsSpecForSpecies('Heritage Duck')).toBeNull();
    expect(parseGenotypeString('Aa Bb cc', 'Heritage Duck')).toEqual([]);

    const customSire = makeAnimal('cs', {
      species: 'Heritage Duck',
      sex: 'Male',
      genotypeRaw: 'M+m Li+li',
    });
    const customDam = makeAnimal('cd', {
      species: 'Heritage Duck',
      sex: 'Female',
      genotypeRaw: 'M+M+ lili',
    });
    const customSim = simulatePairingGenetics(customSire, customDam, 'Heritage Duck');
    expect(customSim.isCustomSpeciesFallback).toBe(true);
    expect(customSim.locusBreakdowns).toHaveLength(0);
    expect(customSim.sireRaw).toBe('M+m Li+li');
  });

  it('triggers lethal & health alerts for Dog MM, Rabbit EnEn, Guinea Pig RnRn, Chinchilla WhWh, and Ferret Blaze/Panda', () => {
    const rabbitSim = simulatePairingGenetics(
      makeAnimal('rs', { species: 'Rabbit', sex: 'Male', genotypeRaw: 'A_ B_ C_ D_ E_ W_ Enen' }),
      makeAnimal('rd', { species: 'Rabbit', sex: 'Female', genotypeRaw: 'A_ B_ C_ D_ E_ W_ Enen' }),
      'Rabbit'
    );
    expect(rabbitSim.lethalOrHealthAlerts.some((a) => a.locus === 'En' && a.severity === 'danger')).toBe(
      true
    );

    const dogSim = simulatePairingGenetics(
      makeAnimal('ds', { species: 'Dog', sex: 'Male', genotypeRaw: 'ayat BB DD EE kyky Mm hh SS' }),
      makeAnimal('dd', { species: 'Dog', sex: 'Female', genotypeRaw: 'ayat BB DD EE kyky Mm hh SS' }),
      'Dog'
    );
    expect(dogSim.lethalOrHealthAlerts.some((a) => a.locus === 'M' && a.severity === 'danger')).toBe(
      true
    );

    const gpSim = simulatePairingGenetics(
      makeAnimal('gs', { species: 'Guinea Pig', sex: 'Male', genotypeRaw: 'aa BB CC EE PP SS Rnrn' }),
      makeAnimal('gd', { species: 'Guinea Pig', sex: 'Female', genotypeRaw: 'aa BB CC EE PP SS Rnrn' }),
      'Guinea Pig'
    );
    expect(gpSim.lethalOrHealthAlerts.some((a) => a.locus === 'Rn' && a.severity === 'danger')).toBe(
      true
    );

    const chinSim = simulatePairingGenetics(
      makeAnimal('cs', { species: 'Chinchilla', sex: 'Male', genotypeRaw: 'Whwh TOto bgbg VV SS ebeb' }),
      makeAnimal('cd', { species: 'Chinchilla', sex: 'Female', genotypeRaw: 'Whwh TOto bgbg VV SS ebeb' }),
      'Chinchilla'
    );
    expect(chinSim.lethalOrHealthAlerts.some((a) => a.locus === 'Wh')).toBe(true);
    expect(chinSim.lethalOrHealthAlerts.some((a) => a.locus === 'TO')).toBe(true);

    const ferretSim = simulatePairingGenetics(
      makeAnimal('fs', { species: 'Ferret', sex: 'Male', genotypeRaw: 'BB CC papa Blbl roro mtmt' }),
      makeAnimal('fd', { species: 'Ferret', sex: 'Female', genotypeRaw: 'BB CC Papa blbl roro mtmt' }),
      'Ferret'
    );
    expect(ferretSim.lethalOrHealthAlerts.some((a) => a.title.includes('Waardenburg'))).toBe(true);
  });
});

