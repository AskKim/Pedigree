import { describe, expect, it } from 'vitest';
import { generateSpeciesBarnBinderHtml } from '../barnBinder';
import {
  analyzeAnimalCarrierLineage,
  analyzePairingCarrierRisks,
  doesAnimalMatchCarrierFilter,
  extractHomozygousCoatClearances,
  formatCompactCarrierDisclosure,
  getAnimalCarrierDisclosures,
  getCarrierTraitSuggestionsForSpecies,
  normalizeCarrierTraitList,
  reconcileCarrierTraitLists,
} from '../carrierGenetics';
import { exportAnimalsCsv } from '../csvExport';
import { getPlatformImporterById } from '../importers/registry';
import { buildSpeciesHerdMap } from '../pedigreeCalculator';
import {
  exportBarnBackupJson,
  generateEvansHtmPedigree,
  parseBarnBackupJson,
} from '../syncAndExports';
import {
  makeAnimal,
  makeEmptySnapshot,
  makeSettings,
  makeSpeciesProfile,
} from './testFixtures';

describe('carrierGenetics & pedigree disclosure outputs', () => {
  it('provides species-specific trait suggestions including neutral coat colors and health markers', () => {
    const rabbitSuggestions = getCarrierTraitSuggestionsForSpecies('Rabbit');
    expect(rabbitSuggestions).toEqual(
      expect.arrayContaining([
        'REW / Ruby-Eyed White (cc)',
        'Dilute / Blue-Lilac-Fawn (dd)',
        'Satin Coat (sa)',
        'Megacolon / Charlie Risk (EnEn)',
      ])
    );

    const goatSuggestions = getCarrierTraitSuggestionsForSpecies('Goat');
    expect(goatSuggestions).toContain('G6S Deficiency');
  });

  it('normalizes whitespace, deduplicates case-insensitively, and reconciles confirmed/suspected/cleared', () => {
    expect(
      normalizeCarrierTraitList(['  Dilute (dd) ', 'dilute (dd)', '', 'Satin Coat'])
    ).toEqual(['Dilute (dd)', 'Satin Coat']);

    const reconciled = reconcileCarrierTraitLists(
      ['Dilute (dd)', 'REW / Ruby-Eyed White (cc)', 'Wide Band (ww)'],
      ['dilute (dd)', 'Satin Coat'],
      [{ trait: 'Wide Band (ww)', proofType: 'test_bred', testBreedingCount: 4 }],
      'cleared'
    );
    expect(reconciled.confirmedCarrierOf).toEqual(['dilute (dd)', 'Satin Coat']);
    expect(reconciled.suspectedCarrierOf).toEqual(['REW / Ruby-Eyed White (cc)']);
    expect(reconciled.clearedCarrierOf).toHaveLength(1);
  });

  it('formats compact carrier disclosure strings and returns empty string when none recorded', () => {
    const plain = makeAnimal('plain');
    expect(formatCompactCarrierDisclosure(plain)).toBe('');
    expect(getAnimalCarrierDisclosures(plain).hasAny).toBe(false);

    const carrier = makeAnimal('carrier', {
      confirmedCarrierOf: ['Dilute / Blue-Lilac-Fawn (dd)', 'Satin Coat (sa)'],
      suspectedCarrierOf: ['Megacolon / Charlie Risk (EnEn)'],
    });
    expect(formatCompactCarrierDisclosure(carrier)).toBe(
      'Confirmed: Dilute / Blue-Lilac-Fawn (dd), Satin Coat (sa) · Suspected: Megacolon / Charlie Risk (EnEn)'
    );
    expect(
      formatCompactCarrierDisclosure(carrier, { ultraCompact: true, maxItemsPerGroup: 2 })
    ).toBe('Conf: Dilute (dd), Satin Coat (sa) · Susp: Megacolon (EnEn)');
  });

  it('enforces independent Sire/Dam Cleared Branch Firewalls and homozygous dominant coat clearance (never _)', () => {
    // 1. Paternal grandsire is Confirmed Dilute (dd)
    const pGrandsire = makeAnimal('pgs', {
      name: 'Blue Grandsire',
      sex: 'Male',
      confirmedCarrierOf: ['Dilute / Blue-Lilac-Fawn (dd)'],
    });
    // Sire was Test Bred Clear 4x against Dilute -> blocks paternal branch!
    const clearedSire = makeAnimal('sire', {
      name: 'Cleared Buck',
      sex: 'Male',
      sireId: pGrandsire.id,
      clearedCarrierOf: [
        { trait: 'Dilute / Blue-Lilac-Fawn (dd)', proofType: 'test_bred', testBreedingCount: 4 },
      ],
    });
    // Maternal granddam is Suspected Satin
    const mGranddam = makeAnimal('mgd', {
      name: 'Satin Line Grandmother',
      sex: 'Female',
      suspectedCarrierOf: ['Satin Coat (sa)'],
    });
    const unclearedDam = makeAnimal('dam', {
      name: 'Maternal Doe',
      sex: 'Female',
      damId: mGranddam.id,
    });
    const kit = makeAnimal('kit', {
      name: 'Junior Red',
      sex: 'Female',
      sireId: clearedSire.id,
      damId: unclearedDam.id,
    });

    const all = [pGrandsire, clearedSire, mGranddam, unclearedDam, kit];
    const herd = buildSpeciesHerdMap(all, 'Rabbit');
    const analysis = analyzeAnimalCarrierLineage(kit, herd);

    // Dilute was blocked by clearedSire; Satin from maternal line MUST still show as Lineage Potential!
    expect(analysis.lineagePotential.some((l) => l.trait.includes('Dilute'))).toBe(false);
    expect(analysis.lineagePotential.some((l) => l.trait === 'Satin Coat (sa)' && l.viaBranches.includes('Dam'))).toBe(
      true
    );
    expect(analysis.blockedBranches.some((b) => b.branch === 'Sire' && b.clearedById === clearedSire.id)).toBe(
      true
    );

    // 2. Now verify homozygous dominant coat locus DD ALSO stops Dilute, while D_ / __ NEVER clears
    const dBlankSire = makeAnimal('blank_sire', {
      name: 'Unknown W Buck',
      sex: 'Male',
      genotypeRaw: 'A_ B_ C_ D_ ee __',
    });
    expect(extractHomozygousCoatClearances(dBlankSire)).toEqual([]);

    const dHomozygousSire = makeAnimal('hom_sire', {
      name: 'Dense Homozygous Buck',
      sex: 'Male',
      sireId: pGrandsire.id,
      genotypeRaw: 'A_ B_ C_ DD ee WW',
    });
    const clearCheck = extractHomozygousCoatClearances(dHomozygousSire);
    expect(clearCheck.some((c) => c.locus === 'D' && c.pair === 'DD')).toBe(true);
    expect(clearCheck.some((c) => c.locus === 'W' && c.pair === 'WW')).toBe(true);

    const kitFromHomSire = makeAnimal('kit2', {
      name: 'Kit 2',
      sex: 'Male',
      sireId: dHomozygousSire.id,
    });
    const herd2 = buildSpeciesHerdMap([pGrandsire, dHomozygousSire, kitFromHomSire], 'Rabbit');
    const analysis2 = analyzeAnimalCarrierLineage(kitFromHomSire, herd2);
    expect(analysis2.lineagePotential).toHaveLength(0);
    expect(analysis2.blockedBranches[0].proofLabel).toBe('Homozygous DD');
  });

  it('evaluates Breeding Lab shared carrier risks and Herd Carrier Finder filters cleanly', () => {
    const buck = makeAnimal('buck', {
      sex: 'Male',
      confirmedCarrierOf: ['Dilute (dd)'],
    });
    const doe = makeAnimal('doe', {
      sex: 'Female',
      confirmedCarrierOf: ['Dilute (dd)'],
      suspectedCarrierOf: ['REW (cc)'],
    });
    const herd = buildSpeciesHerdMap([buck, doe], 'Rabbit');

    const risks = analyzePairingCarrierRisks(buck, doe, herd);
    expect(risks[0].severity).toBe('danger');
    expect(risks[0].trait).toBe('Dilute (dd)');

    const buckAnalysis = analyzeAnimalCarrierLineage(buck, herd);
    expect(doesAnimalMatchCarrierFilter(buckAnalysis, 'confirmed', 'dilute')).toBe(true);
    expect(doesAnimalMatchCarrierFilter(buckAnalysis, 'suspected', 'dilute')).toBe(false);
    expect(doesAnimalMatchCarrierFilter(buckAnalysis, 'any_risk', 'dilute')).toBe(true);
  });

  it('discloses carrier entries in Evans .HTM pedigrees for both subject and ancestors across 3-gen and 6-gen charts', () => {
    const settings = makeSettings();
    const profiles = [makeSpeciesProfile('Rabbit')];

    const grandsire = makeAnimal('gs', {
      name: 'Grandfather Buck',
      tattoo: 'GS1',
      sex: 'Male',
      confirmedCarrierOf: ['Dilute (dd)'],
      suspectedCarrierOf: ['Satin Coat'],
    });
    const sire = makeAnimal('sire', {
      name: 'Father Buck',
      tattoo: 'S1',
      sex: 'Male',
      sireId: grandsire.id,
    });
    const kit = makeAnimal('kit', {
      name: 'Junior Kit',
      tattoo: 'K1',
      sex: 'Female',
      rufusLevel: 'High',
      sireId: sire.id,
      suspectedCarrierOf: ['REW (cc)'],
    });

    const html3 = generateEvansHtmPedigree(kit, [kit, sire, grandsire], profiles, settings, 3);
    expect(html3).toContain('Suspected: REW (cc)');
    expect(html3).toContain('Lineage Potential: Dilute (dd) (Sire), Satin Coat (Sire)');
    expect(html3).toContain('Confirmed: Dilute (dd) · Suspected: Satin Coat');
    expect(html3).toContain('Rufus Intensity:');
    expect(html3).toContain('High');

    // Even in compact 6-gen mode, ancestor carrier disclosures remain visible
    const html6 = generateEvansHtmPedigree(kit, [kit, sire, grandsire], profiles, settings, 6);
    expect(html6).toContain('Suspected: REW (cc)');
    expect(html6).toContain('Conf: Dilute (dd)');
    expect(html6).toContain('Susp: Satin Coat');
  });

  it('includes compact carrier disclosures, Cleared proofs, Lineage Potential, and Rufus Intensity on Barn Binder', () => {
    const grandsire = makeAnimal('gs', {
      name: 'Atlas',
      tattoo: 'AT1',
      sex: 'Male',
      confirmedCarrierOf: ['BEW / Vienna (vv)'],
    });
    const kit = makeAnimal('kit', {
      name: 'Clover',
      tattoo: 'CL1',
      sex: 'Female',
      rufusLevel: 'Medium',
      sireId: grandsire.id,
      suspectedCarrierOf: ['Dilute (dd)'],
      clearedCarrierOf: [{ trait: 'Wide Band (ww)', proofType: 'test_bred', testBreedingCount: 3 }],
    });
    const snap = makeEmptySnapshot({
      animals: [grandsire, kit],
    });

    const binderHtml = generateSpeciesBarnBinderHtml(snap, 'Rabbit', { generations: 3 });
    expect(binderHtml).toContain('Confirmed Carrier Of');
    expect(binderHtml).toContain('Suspected Carrier Of');
    expect(binderHtml).toContain('Cleared (Non-Carrier Of)');
    expect(binderHtml).toContain('Test Bred 3x');
    expect(binderHtml).toContain('BEW / Vienna (vv)');
    expect(binderHtml).toContain('Suspected: Dilute (dd)');
    expect(binderHtml).toContain('Rufus Intensity');
    expect(binderHtml).toContain('Medium');
  });

  it('round-trips carrier disclosures, clearedCarrierOf, and rufusLevel cleanly through JSON and CSV exports', () => {
    const settings = makeSettings();
    const doe = makeAnimal('doe1', {
      name: 'Ruby Doe',
      rufusLevel: 'High',
      confirmedCarrierOf: ['Dilute (dd)'],
      suspectedCarrierOf: ['Satin Coat', 'dilute (dd)'],
      clearedCarrierOf: [{ trait: 'Wide Band (ww)', proofType: 'dna_tested' }],
    });
    const snap = makeEmptySnapshot({
      settings,
      animals: [doe],
    });

    const json = exportBarnBackupJson(snap);
    const parsed = parseBarnBackupJson(json, settings);
    expect(parsed.animals[0].confirmedCarrierOf).toEqual(['Dilute (dd)']);
    expect(parsed.animals[0].suspectedCarrierOf).toEqual(['Satin Coat']);
    expect(parsed.animals[0].rufusLevel).toBe('High');
    expect(parsed.animals[0].clearedCarrierOf).toEqual([
      { trait: 'Wide Band (ww)', proofType: 'dna_tested' },
    ]);

    const csv = exportAnimalsCsv(parsed.animals, parsed.speciesProfiles, parsed.settings);
    expect(csv).toContain('Rufus_Intensity');
    expect(csv).toContain('Confirmed_Carrier_Of');
    expect(csv).toContain('Suspected_Carrier_Of');
    expect(csv).toContain('Cleared_Carrier_Of');
    expect(csv).toContain('Lineage_Potential_Carriers');
    expect(csv).toContain('High');
    expect(csv).toContain('Dilute (dd)');
    expect(csv).toContain('Wide Band (ww) (DNA Clear)');
  });

  it('never silently assumes ww Wide-Band or Rufus level when importing a Red New Zealand Rabbit', async () => {
    const csvContent = [
      'Species,Name,Tattoo,Sex,Breed,Color,Notes',
      'Rabbit,Scarlet Queen,NZ1,Female,New Zealand,Red,Imported show doe',
    ].join('\n');

    const importer = getPlatformImporterById('herdboss');
    const preview = importer.parse(
      [{ fileName: 'rabbits.csv', bytes: new TextEncoder().encode(csvContent) }],
      makeEmptySnapshot(),
      { fallbackSpeciesName: 'Rabbit' }
    );

    expect(preview.animals).toHaveLength(1);
    const imported = preview.animals[0];
    expect(imported.variety).toBe('Red');
    expect(imported.genotypeRaw).toBe('');
    expect(imported.genotype).toEqual([]);
    expect(imported.rufusLevel).toBeUndefined();
  });

  it('scopes homozygous coat-locus clearances strictly by species and isolates custom species', () => {
    // Chinchilla VV must clear Violet (vv), NEVER Rabbit BEW / Vienna (vv)
    const chinSir = makeAnimal('ch_pgs', {
      species: 'Chinchilla',
      sex: 'Male',
      confirmedCarrierOf: ['Violet (vv)'],
    });
    const chinNonVioletDam = makeAnimal('ch_dam', {
      species: 'Chinchilla',
      sex: 'Female',
      sireId: chinSir.id,
      genotypeRaw: 'whwh toto bgbg VV SS EbEb AlAl',
    });
    const chinClear = extractHomozygousCoatClearances(chinNonVioletDam);
    expect(chinClear.some((c) => c.trait === 'Violet (vv)' && c.pair === 'VV')).toBe(true);
    expect(chinClear.some((c) => c.trait.includes('BEW'))).toBe(false);

    const chinKit = makeAnimal('ch_kit', {
      species: 'Chinchilla',
      sex: 'Male',
      damId: chinNonVioletDam.id,
    });
    const chinHerd = buildSpeciesHerdMap([chinSir, chinNonVioletDam, chinKit], 'Chinchilla');
    const chinLineage = analyzeAnimalCarrierLineage(chinKit, chinHerd);
    expect(chinLineage.lineagePotential).toHaveLength(0);
    expect(chinLineage.blockedBranches.some((b) => b.proofLabel === 'Homozygous VV')).toBe(true);

    // Cat: Bb1 carries cinnamon so must NOT clear Chocolate/Cinnamon; BB DOES clear it. Ccs must NOT clear Colorpoint; CC DOES.
    const catCarrierB1 = makeAnimal('cat_b1', {
      species: 'Cat',
      sex: 'Female',
      genotypeRaw: 'aa Bb1 Ccs DD oo ww ii',
    });
    const catCarrierClear = extractHomozygousCoatClearances(catCarrierB1);
    expect(catCarrierClear.some((c) => c.locus === 'B')).toBe(false);
    expect(catCarrierClear.some((c) => c.locus === 'C')).toBe(false);
    expect(catCarrierClear.some((c) => c.locus === 'D')).toBe(true);

    const catPure = makeAnimal('cat_pure', {
      species: 'Cat',
      sex: 'Female',
      genotypeRaw: 'aa BB CC DD oo ww ii',
    });
    const catPureClear = extractHomozygousCoatClearances(catPure);
    expect(catPureClear.some((c) => c.locus === 'B' && c.pair === 'BB')).toBe(true);
    expect(catPureClear.some((c) => c.locus === 'C' && c.pair === 'CC')).toBe(true);

    // Custom species with pre-populated genotype pairs MUST return []
    const customDuck = makeAnimal('duck1', {
      species: 'Heritage Duck',
      genotypeRaw: 'VV DD WW',
      genotype: [{ locus: 'V', allele1: 'V', allele2: 'V' }],
    });
    expect(extractHomozygousCoatClearances(customDuck)).toEqual([]);
  });
});

