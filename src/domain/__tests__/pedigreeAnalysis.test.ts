import { describe, expect, it } from 'vitest';
import {
  analyzeAlleleProvenance,
  parseGenotypeString,
} from '../geneticsEngine';
import {
  analyzePedigreeTree,
  evaluateAnimalArbaRegistration,
  isArbaRegistrationSpecies,
} from '../pedigreeAnalysis';
import { buildPedigreeSlots, buildSpeciesHerdMap } from '../pedigreeCalculator';
import { makeAnimal } from './testFixtures';

describe('pedigreeAnalysis — convergence, ARBA registration flags & allele provenance', () => {
  it('scopes ARBA registration species strictly to Rabbit and Guinea Pig / Cavy', () => {
    expect(isArbaRegistrationSpecies('Rabbit')).toBe(true);
    expect(isArbaRegistrationSpecies('Rabbits')).toBe(true);
    expect(isArbaRegistrationSpecies('Guinea Pig')).toBe(true);
    expect(isArbaRegistrationSpecies('Cavy')).toBe(true);
    expect(isArbaRegistrationSpecies('Cavies')).toBe(true);

    expect(isArbaRegistrationSpecies('Cat')).toBe(false);
    expect(isArbaRegistrationSpecies('Dog')).toBe(false);
    expect(isArbaRegistrationSpecies('Goat')).toBe(false);
    expect(isArbaRegistrationSpecies('Custom Reptile')).toBe(false);
    expect(isArbaRegistrationSpecies('')).toBe(false);
  });

  it('flags missing ARBA subject and ancestor fields and breed mismatches accurately', () => {
    const incompleteSubject = makeAnimal('subj', {
      species: 'Rabbit',
      tattoo: '',
      breed: 'Holland Lop',
      variety: '',
      weightGrams: 0,
      birthDateIso: '',
      sex: 'Unknown',
    });
    const subjectEval = evaluateAnimalArbaRegistration(incompleteSubject, {
      isSubject: true,
      knownAncestorsIn3Gen: 10,
      speciesName: 'Rabbit',
    });

    expect(subjectEval.isApplicable).toBe(true);
    expect(subjectEval.isBlocking).toBe(true);
    expect(subjectEval.deficiencies.map((d) => d.code)).toEqual([
      'missing_tattoo',
      'missing_variety',
      'missing_weight',
      'missing_dob',
      'unknown_sex',
      'incomplete_3gen_lineage',
    ]);
    expect(subjectEval.summaryText).toContain('Incomplete 3-gen lineage (10/14 ancestors)');

    const mismatchedAncestor = makeAnimal('anc', {
      species: 'Rabbit',
      tattoo: 'R1',
      breed: 'Mini Rex',
      variety: 'Castor',
      weightGrams: 1800,
    });
    const ancEval = evaluateAnimalArbaRegistration(mismatchedAncestor, {
      isSubject: false,
      subjectBreed: 'Holland Lop',
      speciesName: 'Rabbit',
    });
    expect(ancEval.isBlocking).toBe(true);
    expect(ancEval.deficiencies.map((d) => d.code)).toEqual(['breed_mismatch']);
  });

  it('classifies convergent vs unique ancestors and excludes Gen 4–6 from ARBA blocking checks', () => {
    // Build a 4-gen tree where one Gen-2 buck ('shared-gg') appears on both Sire and Dam sides,
    // and Gen 4 has an incomplete ancestor that must NOT trigger ARBA blocking flags.
    const gen4Incomplete = makeAnimal('g4-inc', {
      species: 'Rabbit',
      tattoo: '',
      breed: '',
      variety: '',
      weightGrams: 0,
      sex: 'Male',
    });
    const sharedGrandSire = makeAnimal('shared-gs', {
      species: 'Rabbit',
      tattoo: 'GS1',
      breed: 'Holland Lop',
      variety: 'Chestnut',
      weightGrams: 1650,
      sex: 'Male',
      sireId: 'g4-inc',
    });
    const uniqueGrandDam = makeAnimal('unique-gd', {
      species: 'Rabbit',
      tattoo: 'GD1',
      breed: 'Holland Lop',
      variety: 'Chestnut',
      weightGrams: 1700,
      sex: 'Female',
    });
    const sire = makeAnimal('sire', {
      species: 'Rabbit',
      tattoo: 'S1',
      breed: 'Holland Lop',
      variety: 'Chestnut',
      weightGrams: 1600,
      sex: 'Male',
      sireId: 'shared-gs',
      damId: 'unique-gd',
    });
    const dam = makeAnimal('dam', {
      species: 'Rabbit',
      tattoo: 'D1',
      breed: 'Holland Lop',
      variety: 'Chestnut',
      weightGrams: 1680,
      sex: 'Female',
      sireId: 'shared-gs',
    });
    const subject = makeAnimal('subj', {
      species: 'Rabbit',
      tattoo: 'SUBJ1',
      breed: 'Holland Lop',
      variety: 'Chestnut',
      weightGrams: 1620,
      birthDateIso: '2026-01-15',
      sex: 'Female',
      sireId: 'sire',
      damId: 'dam',
    });

    const all = [gen4Incomplete, sharedGrandSire, uniqueGrandDam, sire, dam, subject];
    const herd = buildSpeciesHerdMap(all, 'Rabbit');
    const slots = buildPedigreeSlots(subject, herd, 4);
    const analysis = analyzePedigreeTree(subject, slots, 'Rabbit');

    expect(analysis.isArbaSpecies).toBe(true);
    expect(analysis.hasConvergentAncestors).toBe(true);
    expect(analysis.convergentAnimalIds.has('shared-gs')).toBe(true);
    expect(analysis.convergentAnimalIds.has('unique-gd')).toBe(false);
    expect(analysis.convergentSlotKeys.has('2:0')).toBe(true);
    expect(analysis.convergentSlotKeys.has('2:2')).toBe(true);
    expect(analysis.convergentSlotKeys.has('2:1')).toBe(false);

    // Gen 4 incomplete ancestor is excluded from ARBA checks
    const gen4Status = analysis.registrationBySlotKey.get('4:0');
    expect(gen4Status?.isApplicable).toBe(false);
    expect(gen4Status?.isBlocking).toBe(false);

    // Missing Gen 1-3 ancestor slots block subject 3-gen ARBA pedigree
    expect(analysis.missingAncestorSlotCount).toBeGreaterThan(0);
    expect(analysis.subjectRegistration?.isBlocking).toBe(true);
    expect(
      analysis.subjectRegistration?.deficiencies.some((d) => d.code === 'incomplete_3gen_lineage')
    ).toBe(true);

    // Non-ARBA species disables ARBA blocking while still identifying convergent ancestors
    const catAnalysis = analyzePedigreeTree(subject, slots, 'Cat');
    expect(catAnalysis.isArbaSpecies).toBe(false);
    expect(catAnalysis.blockingNodeCount).toBe(0);
    expect(catAnalysis.hasConvergentAncestors).toBe(true);
  });

  it('infers autosomal allele provenance across sire, dam, offspring, manual, and uncommitted inference', () => {
    const sire = makeAnimal('sire', {
      sex: 'Male',
      name: 'Buck',
      genotypeRaw: 'AA Bb cc D_ E_',
      genotype: parseGenotypeString('AA Bb cc D_ E_', 'Rabbit'),
    });
    const dam = makeAnimal('dam', {
      sex: 'Female',
      name: 'Doe',
      genotypeRaw: 'aa BB CC D_ ee',
      genotype: parseGenotypeString('aa BB CC D_ ee', 'Rabbit'),
    });
    const subject = makeAnimal('subj', {
      sex: 'Female',
      name: 'Hazel',
      sireId: 'sire',
      damId: 'dam',
      genotypeRaw: 'Aa Bb Cc D_ E_',
      genotype: parseGenotypeString('Aa Bb Cc D_ E_', 'Rabbit'),
    });
    const diluteKit = makeAnimal('kit', {
      sex: 'Male',
      name: 'BlueKit',
      damId: 'subj',
      genotypeRaw: 'aa BB CC dd ee',
      genotype: parseGenotypeString('aa BB CC dd ee', 'Rabbit'),
    });

    const all = [sire, dam, subject, diluteKit];
    const herd = buildSpeciesHerdMap(all, 'Rabbit');

    // Saved provenance
    const savedProv = analyzeAlleleProvenance(subject, herd, all, 'Rabbit');
    expect(savedProv.isCustomSpeciesFallback).toBe(false);
    expect(savedProv.hasAnyProvenance).toBe(true);

    const aLocus = savedProv.loci.find((l) => l.locus === 'A');
    expect(aLocus?.allele1).toMatchObject({ allele: 'A', source: 'sire' });
    expect(aLocus?.allele2).toMatchObject({ allele: 'a', source: 'dam' });

    const bLocus = savedProv.loci.find((l) => l.locus === 'B');
    expect(bLocus?.allele1).toMatchObject({ allele: 'B', source: 'dam' });
    expect(bLocus?.allele2).toMatchObject({ allele: 'b', source: 'sire' });

    const cLocus = savedProv.loci.find((l) => l.locus === 'C');
    expect(cLocus?.allele1).toMatchObject({ allele: 'C', source: 'dam' });
    expect(cLocus?.allele2).toMatchObject({ allele: 'c', source: 'sire' });

    const dLocus = savedProv.loci.find((l) => l.locus === 'D');
    expect(dLocus?.allele1).toMatchObject({ allele: 'D', source: 'manual' });
    expect(dLocus?.allele2).toMatchObject({ allele: '_', source: 'unknown' });

    const eLocus = savedProv.loci.find((l) => l.locus === 'E');
    expect(eLocus?.allele1).toMatchObject({ allele: 'E', source: 'sire' });
    expect(eLocus?.allele2).toMatchObject({ allele: '_', source: 'unknown' });

    // Uncommitted inference preview fills Dd (d from diluteKit) and Ee (e from homozygous ee dam)
    const inferredProv = analyzeAlleleProvenance(subject, herd, all, 'Rabbit', {
      includeInferred: true,
    });
    const dInferred = inferredProv.loci.find((l) => l.locus === 'D');
    expect(dInferred?.allele2).toMatchObject({
      allele: 'd',
      source: 'offspring',
      isInferredUncommitted: true,
    });

    const eInferred = inferredProv.loci.find((l) => l.locus === 'E');
    expect(eInferred?.allele2).toMatchObject({
      allele: 'e',
      source: 'dam',
      isInferredUncommitted: true,
    });
  });

  it('tracks X-linked Cat O/o provenance and isolates custom species safely', () => {
    const tomSire = makeAnimal('tom', {
      species: 'Cat',
      sex: 'Male',
      name: 'Marmalade',
      genotypeRaw: 'aa BB CC DD OY',
      genotype: parseGenotypeString('aa BB CC DD OY', 'Cat'),
    });
    const queenDam = makeAnimal('queen', {
      species: 'Cat',
      sex: 'Female',
      name: 'Shadow',
      genotypeRaw: 'aa BB CC DD oo',
      genotype: parseGenotypeString('aa BB CC DD oo', 'Cat'),
    });
    const tortieDaughter = makeAnimal('daughter', {
      species: 'Cat',
      sex: 'Female',
      name: 'Patches',
      sireId: 'tom',
      damId: 'queen',
      genotypeRaw: 'aa BB CC DD Oo',
      genotype: parseGenotypeString('aa BB CC DD Oo', 'Cat'),
    });
    const redSon = makeAnimal('son', {
      species: 'Cat',
      sex: 'Male',
      name: 'Rusty',
      sireId: 'tom',
      damId: 'queen',
      genotypeRaw: 'aa BB CC DD oY',
      genotype: parseGenotypeString('aa BB CC DD oY', 'Cat'),
    });

    const cats = [tomSire, queenDam, tortieDaughter, redSon];
    const catHerd = buildSpeciesHerdMap(cats, 'Cat');

    const daughterProv = analyzeAlleleProvenance(tortieDaughter, catHerd, cats, 'Cat');
    const daughterO = daughterProv.loci.find((l) => l.locus === 'O');
    expect(daughterO?.allele1).toMatchObject({ allele: 'O', source: 'sire' });
    expect(daughterO?.allele2).toMatchObject({ allele: 'o', source: 'dam' });

    const sonProv = analyzeAlleleProvenance(redSon, catHerd, cats, 'Cat');
    const sonO = sonProv.loci.find((l) => l.locus === 'O');
    expect(sonO?.allele1).toMatchObject({ allele: 'o', source: 'dam' });
    expect(sonO?.allele2).toMatchObject({ allele: 'Y', source: 'sire' });

    const gecko = makeAnimal('gecko', {
      species: 'Crested Gecko',
      sex: 'Female',
      genotypeRaw: 'Lilly White het Axanthic',
    });
    const customProv = analyzeAlleleProvenance(
      gecko,
      new Map([[gecko.id, gecko]]),
      [gecko],
      'Crested Gecko'
    );
    expect(customProv.isCustomSpeciesFallback).toBe(true);
    expect(customProv.rawFallback).toBe('Lilly White het Axanthic');
    expect(customProv.loci).toHaveLength(0);
  });
});
