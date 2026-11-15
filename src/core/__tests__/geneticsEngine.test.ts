import { describe, expect, it } from 'vitest';
import {
  formatGenotypeArray,
  inferHiddenAlleles,
  parseGenotypeString,
  simulatePairingGenetics,
} from '../geneticsEngine';
import { buildSpeciesHerdMap } from '../pedigreeCalculator';
import { makeAnimal } from './testFixtures';

describe('geneticsEngine — genotype parsing, allele inference & Punnett simulation', () => {
  it('parses multi-character alleles (chd, En, at) and formats back cleanly', () => {
    const parsed = parseGenotypeString('Aat Bb Cchd D_ ee Ww Enen');
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

  it('infers hidden recessive alleles from homozygous parent and homozygous offspring', () => {
    const rewSire = makeAnimal('sire', {
      sex: 'Male',
      name: 'Snowball',
      genotypeRaw: 'A_ B_ cc D_ E_',
      genotype: parseGenotypeString('A_ B_ cc D_ E_'),
    });
    const subject = makeAnimal('subj', {
      sex: 'Female',
      name: 'Ruby',
      sireId: 'sire',
      genotypeRaw: 'A_ B_ C_ D_ E_',
      genotype: parseGenotypeString('A_ B_ C_ D_ E_'),
    });
    const redKit = makeAnimal('kit', {
      sex: 'Male',
      name: 'Copper',
      damId: 'subj',
      genotypeRaw: 'A_ B_ C_ D_ ee',
      genotype: parseGenotypeString('A_ B_ C_ D_ ee'),
    });

    const all = [rewSire, subject, redKit];
    const herd = buildSpeciesHerdMap(all, 'Rabbit');
    const inferred = inferHiddenAlleles(subject, herd, all);

    expect(inferred.conflicts).toHaveLength(0);
    // Sire is cc -> subject C_ becomes Cc; Offspring is ee -> subject E_ becomes Ee
    expect(inferred.formatted).toBe('A_ B_ Cc D_ Ee');
    expect(inferred.notes.map((n) => n.locus)).toEqual(['C', 'E']);
  });

  it('flags biological impossibility conflicts when recorded genotypes contradict parents or kits', () => {
    const chocoSire = makeAnimal('sire', {
      sex: 'Male',
      name: 'Cocoa',
      genotypeRaw: 'aa bb C_ D_ E_',
      genotype: parseGenotypeString('aa bb C_ D_ E_'),
    });
    const impossibleKit = makeAnimal('kit', {
      sex: 'Female',
      name: 'Jet',
      sireId: 'sire',
      genotypeRaw: 'aa BB C_ D_ E_',
      genotype: parseGenotypeString('aa BB C_ D_ E_'),
    });

    const all = [chocoSire, impossibleKit];
    const herd = buildSpeciesHerdMap(all, 'Rabbit');
    const result = inferHiddenAlleles(impossibleKit, herd, all);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toContain('bb');
    expect(result.conflicts[0]).toContain('BB');
  });

  it('simulates Punnett locus outcomes and New Zealand Red vs Tortoise phenotypes', () => {
    const buck = makeAnimal('buck', {
      sex: 'Male',
      genotypeRaw: 'Aa BB CC DD ee ww Enen',
      genotype: parseGenotypeString('Aa BB CC DD ee ww Enen'),
    });
    const doe = makeAnimal('doe', {
      sex: 'Female',
      genotypeRaw: 'Aa BB CC DD ee ww enen',
      genotype: parseGenotypeString('Aa BB CC DD ee ww enen'),
    });

    const sim = simulatePairingGenetics(buck, doe);

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
    expect(sim.predictedPhenotypes.some((p) => p.label === 'New Zealand Red (Wide-Band)')).toBe(
      true
    );
    expect(sim.predictedPhenotypes.some((p) => p.label === 'Black Tortoise')).toBe(true);
  });
});
