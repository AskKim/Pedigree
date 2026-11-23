import { describe, expect, it } from 'vitest';
import {
  buildPresetGenotypeWithConfirmations,
  buildSandboxHypotheticalAnimal,
  evaluateSingleGenotypeSandbox,
  formatGenotypeArray,
  getGeneticsSpecForSpecies,
  getSpeciesVarietyPresets,
  inferHiddenAlleles,
  parseGenotypeString,
  setLocusInGenotypeString,
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

  it('updates individual loci interactively via setLocusInGenotypeString without corrupting positional slots', () => {
    const step1 = setLocusInGenotypeString('', 'En', 'En', 'en', 'Rabbit');
    expect(step1).toBe('__ __ __ __ __ __ Enen');
    const step2 = setLocusInGenotypeString(step1, 'E', 'e', 'e', 'Rabbit');
    expect(step2).toBe('__ __ __ __ ee __ Enen');
    const cleared = setLocusInGenotypeString(step2, 'En', '_', '_', 'Rabbit');
    expect(cleared).toBe('__ __ __ __ ee');
    expect(setLocusInGenotypeString(cleared, 'E', '_', '_', 'Rabbit')).toBe('');

    // Cat X-linked Male OY formatting & Female pairing normalization
    expect(setLocusInGenotypeString('aa BB', 'O', 'O', '_', 'Cat', 'Male')).toBe(
      'aa BB __ __ OY'
    );
    expect(setLocusInGenotypeString('aa BB', 'O', 'o', 'O', 'Cat', 'Female')).toBe(
      'aa BB __ __ Oo'
    );
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

  it('classifies Rabbit ARBA varieties (at, chl, chc, vv, dudu, ej, Es) and keeps Fawn Wide-Band conservative', () => {
    const fawn = getSpeciesVarietyPresets('Rabbit').find((p) => p.variety === 'Fawn');
    expect(fawn?.conservativeGenotype).toBe('A_ B_ C_ dd ee __');

    const hima = simulatePairingGenetics(
      makeAnimal('hs', { species: 'Rabbit', sex: 'Male', genotypeRaw: 'aa BB chc DD EE WW enen VV DuDu' }),
      makeAnimal('hd', { species: 'Rabbit', sex: 'Female', genotypeRaw: 'aa BB cc DD EE WW enen VV DuDu' }),
      'Rabbit'
    );
    expect(hima.predictedPhenotypes.some((p) => p.label.includes('Himalayan'))).toBe(true);

    const bew = simulatePairingGenetics(
      makeAnimal('bs', { species: 'Rabbit', sex: 'Male', genotypeRaw: 'AA BB CC DD EE WW enen vv DuDu' }),
      makeAnimal('bd', { species: 'Rabbit', sex: 'Female', genotypeRaw: 'AA BB CC DD EE WW enen vv DuDu' }),
      'Rabbit'
    );
    expect(bew.predictedPhenotypes[0].label).toBe('Blue-Eyed White (BEW)');

    const dutchSteel = simulatePairingGenetics(
      makeAnimal('ds', { species: 'Rabbit', sex: 'Male', genotypeRaw: 'at_ BB chl_ DD EsEs WW enen VV dudu' }),
      makeAnimal('dd', { species: 'Rabbit', sex: 'Female', genotypeRaw: 'at_ BB chl_ DD EsEs WW enen VV dudu' }),
      'Rabbit'
    );
    expect(dutchSteel.predictedPhenotypes.some((p) => p.label.includes('Dutch'))).toBe(true);
  });

  it('covers species-specific genetics across Cat, Dog, Goat, Sheep, Cattle, Swine, Alpaca, Guinea Pig, Chinchilla, and Ferret', () => {
    // Cat csc Point & cbc Sepia & cbcs Mink heterozygote dominance
    const catPoint = simulatePairingGenetics(
      makeAnimal('c1', { species: 'Cat', sex: 'Male', genotypeRaw: 'aa BB csc DD oY ww ii' }),
      makeAnimal('c2', { species: 'Cat', sex: 'Female', genotypeRaw: 'aa BB cbc DD oo ww ii' }),
      'Cat'
    );
    expect(catPoint.predictedPhenotypes.some((p) => p.label.includes('Mink'))).toBe(true);
    expect(catPoint.predictedPhenotypes.some((p) => p.label.includes('Point'))).toBe(true);
    expect(catPoint.predictedPhenotypes.some((p) => p.label.includes('Sepia'))).toBe(true);

    // Dog epistatic ee Cream vs KB Black
    const dogSim = simulatePairingGenetics(
      makeAnimal('dg1', { species: 'Dog', sex: 'Male', genotypeRaw: 'atat kyky ee BB DD mm SS ii' }),
      makeAnimal('dg2', { species: 'Dog', sex: 'Female', genotypeRaw: 'atat kyky ee BB DD mm SS ii' }),
      'Dog'
    );
    expect(dogSim.predictedPhenotypes[0].label).toBe('Cream');

    // Goat codominant Agouti (Ab + As)
    const goatSim = simulatePairingGenetics(
      makeAnimal('gt1', { species: 'Goat', sex: 'Male', genotypeRaw: 'AbAb BB E+E+ spsp msms rnrn' }),
      makeAnimal('gt2', { species: 'Goat', sex: 'Female', genotypeRaw: 'AsAs BB E+E+ spsp msms rnrn' }),
      'Goat'
    );
    expect(goatSim.predictedPhenotypes[0].label).toContain('Codominant Badgerface + Swiss Markings');

    // Sheep Moorit Brown (bb) & inference
    const sheepSim = simulatePairingGenetics(
      makeAnimal('sh1', { species: 'Sheep', sex: 'Male', genotypeRaw: 'AaAa bb E+E+ SS' }),
      makeAnimal('sh2', { species: 'Sheep', sex: 'Female', genotypeRaw: 'AaAa bb E+E+ SS' }),
      'Sheep'
    );
    expect(sheepSim.predictedPhenotypes[0].label).toBe('Solid Moorit Brown');

    // Cattle codominant Roan (Rr x Rr -> 25% RR Roan-White, 50% Roan, 25% Red/Black)
    const cattleSim = simulatePairingGenetics(
      makeAnimal('ct1', { species: 'Cattle', sex: 'Male', genotypeRaw: 'ee dd Rr SS' }),
      makeAnimal('ct2', { species: 'Cattle', sex: 'Female', genotypeRaw: 'ee dd Rr SS' }),
      'Cattle'
    );
    expect(cattleSim.predictedPhenotypes.some((p) => p.label === 'Roan-White' && p.probabilityPercent === 25)).toBe(
      true
    );
    expect(cattleSim.predictedPhenotypes.some((p) => p.label === 'Red Roan' && p.probabilityPercent === 50)).toBe(
      true
    );

    // Swine Hampshire Belted Red vs Dominant White
    const swineSim = simulatePairingGenetics(
      makeAnimal('sw1', { species: 'Swine / Pig', sex: 'Male', genotypeRaw: 'ee ii BeBe rnrn' }),
      makeAnimal('sw2', { species: 'Swine / Pig', sex: 'Female', genotypeRaw: 'ee ii bebe rnrn' }),
      'Swine / Pig'
    );
    expect(swineSim.predictedPhenotypes[0].label).toBe('Red Hampshire Belted');

    // Alpaca True Black with Grey & Pinto
    const alpacaSim = simulatePairingGenetics(
      makeAnimal('al1', { species: 'Alpaca', sex: 'Male', genotypeRaw: 'EE aa Gg ss' }),
      makeAnimal('al2', { species: 'Alpaca', sex: 'Female', genotypeRaw: 'EE aa gg ss' }),
      'Alpaca'
    );
    expect(alpacaSim.predictedPhenotypes.some((p) => p.label === 'True Black (Grey Pinto/Appaloosa)')).toBe(
      true
    );

    // Guinea Pig Himalayan crca + Pink-eyed Lilac pp
    const gpHima = simulatePairingGenetics(
      makeAnimal('gp1', { species: 'Guinea Pig', sex: 'Male', genotypeRaw: 'aa BB crca EE PP SS rnrn' }),
      makeAnimal('gp2', { species: 'Guinea Pig', sex: 'Female', genotypeRaw: 'aa BB caca EE PP SS rnrn' }),
      'Guinea Pig'
    );
    expect(gpHima.predictedPhenotypes.some((p) => p.label === 'Himalayan / California Pointed')).toBe(
      true
    );

    // Chinchilla Bgbg x Bgbg incomplete dominance
    const chinBeige = simulatePairingGenetics(
      makeAnimal('ch1', { species: 'Chinchilla', sex: 'Male', genotypeRaw: 'whwh toto Bgbg VV SS EbEb AlAl' }),
      makeAnimal('ch2', { species: 'Chinchilla', sex: 'Female', genotypeRaw: 'whwh toto Bgbg VV SS EbEb AlAl' }),
      'Chinchilla'
    );
    expect(chinBeige.predictedPhenotypes.some((p) => p.label === 'Homozygous Beige' && p.probabilityPercent === 25)).toBe(
      true
    );
    expect(chinBeige.predictedPhenotypes.some((p) => p.label === 'Beige' && p.probabilityPercent === 50)).toBe(
      true
    );

    // Ferret Chocolate Champagne bb
    const ferretChoc = simulatePairingGenetics(
      makeAnimal('fe1', { species: 'Ferret', sex: 'Male', genotypeRaw: 'bb CC papa blbl roro mtmt' }),
      makeAnimal('fe2', { species: 'Ferret', sex: 'Female', genotypeRaw: 'bb CC papa blbl roro mtmt' }),
      'Ferret'
    );
    expect(ferretChoc.predictedPhenotypes[0].label).toBe('Chocolate / Champagne');
  });

  it('infers Cat X-linked Female/Dam alleles symmetrically and notes one-sided loci in Punnett predictions', () => {
    const orangeTom = makeAnimal('ot', {
      species: 'Cat',
      name: 'Marmalade',
      sex: 'Male',
      genotypeRaw: 'aa BB CC DD OY ww ii',
    });
    const blackDam = makeAnimal('bd', {
      species: 'Cat',
      name: 'Shadow',
      sex: 'Female',
      genotypeRaw: 'aa BB CC DD O_ ww ii',
    });
    const tortieDaughter = makeAnimal('td', {
      species: 'Cat',
      name: 'Ember',
      sex: 'Female',
      sireId: orangeTom.id,
      damId: blackDam.id,
      genotypeRaw: 'aa BB CC DD o_ ww ii',
    });
    const nonRedSon = makeAnimal('nrs', {
      species: 'Cat',
      name: 'Coal',
      sex: 'Male',
      damId: blackDam.id,
      genotypeRaw: 'aa BB CC DD oY ww ii',
    });

    const catHerd = [orangeTom, blackDam, tortieDaughter, nonRedSon];
    const catMap = buildSpeciesHerdMap(catHerd, 'Cat');

    // Daughter o_ gets 'O' from OY Sire -> Oo
    const daughterInf = inferHiddenAlleles(tortieDaughter, catMap, catHerd, 'Cat');
    expect(daughterInf.conflicts).toHaveLength(0);
    expect(daughterInf.updatedPairs.find((p) => p.locus === 'O')).toEqual({
      locus: 'O',
      allele1: 'O',
      allele2: 'o',
    });

    // Dam O_ gets 'o' proven by non-red son oY -> Oo
    const damInf = inferHiddenAlleles(blackDam, catMap, catHerd, 'Cat');
    expect(damInf.conflicts).toHaveLength(0);
    expect(damInf.updatedPairs.find((p) => p.locus === 'O')).toEqual({
      locus: 'O',
      allele1: 'O',
      allele2: 'o',
    });

    // One-sided missing locus in simulatePairingGenetics surfaces an uncertainLociNote
    const partialBuck = makeAnimal('pb', {
      species: 'Rabbit',
      name: 'Partial Buck',
      sex: 'Male',
      genotypeRaw: 'AA BB CC DD ee ww',
    });
    const partialDoe = makeAnimal('pd', {
      species: 'Rabbit',
      name: 'Partial Doe',
      sex: 'Female',
      genotypeRaw: 'AA BB CC DD ee',
    });
    const sim = simulatePairingGenetics(partialBuck, partialDoe, 'Rabbit');
    expect(sim.uncertainLociNotes.some((n) => n.includes('(W)') && n.includes('Partial Doe'))).toBe(
      true
    );
  });

  it('evaluates single hypothetical genotypes, hidden carriers, health alerts, and What-If crosses for Coat Explorer Sandbox', () => {
    const emptyEval = evaluateSingleGenotypeSandbox('__ __', 'Rabbit');
    expect(emptyEval.hasInsufficientLoci).toBe(true);
    expect(emptyEval.recessiveCarriers).toHaveLength(0);

    const lilacEval = evaluateSingleGenotypeSandbox('aa bb CC dd EE', 'Rabbit');
    expect(lilacEval.hasInsufficientLoci).toBe(false);
    expect(lilacEval.predictedVariety).toBe('Lilac');
    expect(lilacEval.recessiveCarriers).toHaveLength(0);

    const chestnutCarrierEval = evaluateSingleGenotypeSandbox('Aa Bb Cc Dd Ee WW EnEn', 'Rabbit');
    expect(chestnutCarrierEval.predictedVariety).toBe('Charlie Chestnut Agouti');
    expect(chestnutCarrierEval.recessiveCarriers.map((c) => `${c.locus}:${c.allele}`)).toEqual([
      'A:a',
      'B:b',
      'C:c',
      'D:d',
      'E:e',
    ]);
    expect(chestnutCarrierEval.healthAlerts.some((a) => a.locus === 'En' && a.severity === 'danger')).toBe(
      true
    );

    const catMaleOrange = evaluateSingleGenotypeSandbox('aa BB CC DD OY ww ii', 'Cat', 'Male');
    expect(catMaleOrange.predictedVariety).toContain('Red / Orange Tabby');
    expect(catMaleOrange.unverifiedCoreLoci).toHaveLength(0);

    const dogDoubleMerle = evaluateSingleGenotypeSandbox('ayat kyky EE BB DD MM SS II', 'Dog');
    expect(dogDoubleMerle.predictedVariety).toContain('Double Merle');
    expect(dogDoubleMerle.healthAlerts.some((a) => a.locus === 'M' && a.severity === 'danger')).toBe(
      true
    );

    const customEval = evaluateSingleGenotypeSandbox('M+m Li+li', 'Heritage Duck');
    expect(customEval.isCustomSpeciesFallback).toBe(true);
    expect(customEval.predictedVariety).toBe('');

    const hypoSire = buildSandboxHypotheticalAnimal({
      id: '__sandbox_sire__',
      name: 'Hypo Buck',
      speciesName: 'Rabbit',
      sex: 'Male',
      genotypeRaw: 'Aa BB CC DD ee ww enen',
    });
    const hypoDam = buildSandboxHypotheticalAnimal({
      id: '__sandbox_dam__',
      name: 'Hypo Doe',
      speciesName: 'Rabbit',
      sex: 'Female',
      genotypeRaw: 'Aa BB CC DD ee ww Enen',
    });
    const hypoSim = simulatePairingGenetics(hypoSire, hypoDam, 'Rabbit');
    expect(hypoSim.predictedPhenotypes.some((p) => p.label.includes('Tortoise'))).toBe(true);
    expect(hypoSim.predictedPhenotypes.some((p) => p.label.includes('Broken'))).toBe(true);
  });
});

