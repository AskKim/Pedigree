import { describe, expect, it } from 'vitest';
import {
  buildBatchPrintFileName,
  buildDefaultBatchPrintOptions,
  computeBatchPrintPageCount,
  generateBatchPrintHtml,
  resolveBatchPrintAnimals,
} from '../batchPrint';
import { makeAnimal, makeSettings, makeSpeciesProfile } from './testFixtures';

const VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

describe('batchPrint — multi-select cage cards, 4-up mini sheets, 4x6 photo cards & stacked pedigrees', () => {
  const speciesProfiles = [makeSpeciesProfile('Rabbit'), makeSpeciesProfile('Sheep')];
  const settings = makeSettings({
    barnName: 'Oak Ridge Rabbitry',
    breederName: 'Breeder',
    defaultGenerations: 4,
  });

  const gSire = makeAnimal('gs1', { name: 'Grandpa Rex', tattoo: 'GS1', sex: 'Male', breed: 'Rex', variety: 'Castor' });
  const gDam = makeAnimal('gd1', { name: 'Grandma Velvet', tattoo: 'GD1', sex: 'Female', breed: 'Rex', variety: 'Black' });
  const sire = makeAnimal('s1', {
    name: 'King Clover',
    tattoo: 'KC1',
    sex: 'Male',
    breed: 'Rex',
    variety: 'Castor',
    sireId: 'gs1',
    damId: 'gd1',
    weightGrams: 3900,
    registrationNumber: 'R-991',
  });
  const dam = makeAnimal('d1', {
    name: 'Queen Hazel',
    tattoo: 'QH1',
    sex: 'Female',
    breed: 'Rex',
    variety: 'Red',
    weightGrams: 4100,
  });

  it('resolves multi-selected animals in visible sort order with strict species isolation and deduplication', () => {
    const a1 = makeAnimal('a1', { name: 'Alpha' });
    const a2 = makeAnimal('a2', { name: 'Bravo' });
    const a3 = makeAnimal('a3', { name: 'Charlie', status: 'Archived' });
    const sheep = makeAnimal('sh1', { name: 'Woolly', species: 'Sheep' });

    const resolved = resolveBatchPrintAnimals(
      ['a3', 'a2', 'a1', 'a2', 'sh1'],
      [a1, a2], // visible filtered order
      [a1, a2, a3, sheep],
      'Rabbit'
    );

    expect(resolved.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('computes accurate page counts and clean filenames across all four batch layouts', () => {
    expect(computeBatchPrintPageCount(0, { layout: 'cage_cards', photoCardPaperMode: 'letter_2up' })).toBe(0);
    expect(computeBatchPrintPageCount(9, { layout: 'cage_cards', photoCardPaperMode: 'letter_2up' })).toBe(2);
    expect(computeBatchPrintPageCount(5, { layout: 'mini_pedigree_4up', photoCardPaperMode: 'letter_2up' })).toBe(2);
    expect(computeBatchPrintPageCount(3, { layout: 'photo_cards_4x6', photoCardPaperMode: 'letter_2up' })).toBe(2);
    expect(computeBatchPrintPageCount(3, { layout: 'photo_cards_4x6', photoCardPaperMode: 'photo_4x6' })).toBe(3);
    expect(computeBatchPrintPageCount(4, { layout: 'stacked_pedigrees', photoCardPaperMode: 'letter_2up' })).toBe(4);

    expect(
      buildBatchPrintFileName('My Barn', 'Rabbit', 'cage_cards', 8, '2026-11-20')
    ).toBe('pedigree-rabbit-cage-cards-8-2026-11-20.htm');
    expect(
      buildBatchPrintFileName('Oak Ridge Rabbitry', 'Rabbit', 'mini_pedigree_4up', 6, '2026-11-20')
    ).toBe('oak-ridge-rabbitry-rabbit-mini-pedigrees-4up-6-2026-11-20.htm');
    expect(
      buildBatchPrintFileName('Oak Ridge Rabbitry', 'Rabbit', 'photo_cards_4x6', 4, '2026-11-20')
    ).toBe('oak-ridge-rabbitry-rabbit-photo-cards-4x6-4-2026-11-20.htm');
    expect(
      buildBatchPrintFileName('Oak Ridge Rabbitry', 'Rabbit', 'stacked_pedigrees', 3, '2026-11-20')
    ).toBe('oak-ridge-rabbitry-rabbit-stacked-pedigrees-3-2026-11-20.htm');
  });

  it('paginates 10 animals into 2 pages of 8-up cage cards with sire/dam, cage, and optional cut lines', () => {
    const batch = Array.from({ length: 10 }, (_, idx) =>
      makeAnimal(`kit-${idx + 1}`, {
        name: `Show Kit ${idx + 1}`,
        tattoo: `SK${idx + 1}`,
        sex: idx % 2 === 0 ? 'Male' : 'Female',
        cageLocation: `Row A-${idx + 1}`,
        sireId: 's1',
        damId: 'd1',
        genotypeRaw: 'Aa B_ C_ D_ ee',
      })
    );
    const allAnimals = [gSire, gDam, sire, dam, ...batch];

    const html = generateBatchPrintHtml({
      subjects: batch,
      allAnimals,
      speciesProfiles,
      settings,
      speciesName: 'Rabbit',
      options: {
        layout: 'cage_cards',
        includeCutLines: true,
        showGenotypes: true,
        showWeights: true,
      },
      photoDataUrlByAnimalId: { 'kit-1': VALID_PNG_DATA_URL },
    });

    expect(html.match(/class="batch-page cage-page"/g)?.length).toBe(2);
    expect(html.match(/class="cage-card with-cut-lines"/g)?.length).toBe(10);
    expect(html).toContain('Show Kit 1');
    expect(html).toContain('Show Kit 10');
    expect(html).toContain('Row A-1');
    expect(html).toContain('King Clover (KC1)');
    expect(html).toContain('Queen Hazel (QH1)');
    expect(html).toContain('Aa B_ C_ D_ ee (genetics in dev)');
    expect(html).toContain(VALID_PNG_DATA_URL);
  });

  it('renders stacked formal pedigrees with 1 landscape page per animal, depth controls, and footer options', () => {
    const k1 = makeAnimal('k1', {
      name: 'Bramble',
      tattoo: 'BR1',
      sex: 'Male',
      sireId: 's1',
      damId: 'd1',
      genotypeRaw: 'A_ B_ C_ D_ ee',
      legsCount: 2,
    });
    const k2 = makeAnimal('k2', {
      name: 'Thistle',
      tattoo: 'TH2',
      sex: 'Female',
      sireId: 's1',
      damId: 'd1',
    });

    const defaults = buildDefaultBatchPrintOptions(settings);
    expect(defaults.generations).toBe(4);

    const html = generateBatchPrintHtml({
      subjects: [k1, k2],
      allAnimals: [gSire, gDam, sire, dam, k1, k2],
      speciesProfiles,
      settings,
      speciesName: 'Rabbit',
      options: {
        layout: 'stacked_pedigrees',
        generations: 5,
        showWeights: false,
        showGenotypes: true,
        showBreederFooter: true,
        breederContactLine: 'oakridge.example · 555-0199',
      },
    });

    expect(html.match(/class="batch-page ped-page"/g)?.length).toBe(2);
    expect(html).toContain('Page 1 of 2');
    expect(html).toContain('Page 2 of 2');
    expect(html).toContain('5th Generation (Gen 5)');
    expect(html).toContain('Grandpa Rex');
    expect(html).toContain('oakridge.example');
    expect(html).toContain('under development and incomplete (unverified)');
    expect(html).not.toContain('<strong>Weight:</strong>');
  });

  it('paginates 5 animals into 2 pages of 4-up (1/4-page) mini pedigree sheets', () => {
    const subjects = Array.from({ length: 5 }, (_, idx) =>
      makeAnimal(`m-${idx + 1}`, {
        name: `Mini ${idx + 1}`,
        tattoo: `M${idx + 1}`,
        sex: 'Female',
        sireId: 's1',
        damId: 'd1',
      })
    );

    const html = generateBatchPrintHtml({
      subjects,
      allAnimals: [gSire, gDam, sire, dam, ...subjects],
      speciesProfiles,
      settings,
      speciesName: 'Rabbit',
      options: {
        layout: 'mini_pedigree_4up',
        includeCutLines: false,
      },
    });

    expect(html.match(/class="batch-page mini-page"/g)?.length).toBe(2);
    expect(html.match(/class="mini-card no-cut-lines"/g)?.length).toBe(5);
    expect(html).toContain('Grandpa Rex');
    expect(html).toContain('Great-Grandparents (G3)');
  });

  it('renders 3-gen 4x6 photo cards in both 2-up Letter and direct 4x6 modes while sanitizing unsafe images and XSS', () => {
    const xssAnimal = makeAnimal('x1', {
      name: '<script>alert(1)</script>Maple',
      tattoo: 'MP"1',
      sex: 'Female',
      sireId: 's1',
      damId: 'd1',
    });
    const cleanAnimal = makeAnimal('c2', {
      name: 'Cedar',
      tattoo: 'CD2',
      sex: 'Male',
      sireId: 's1',
      damId: 'd1',
    });

    const letterHtml = generateBatchPrintHtml({
      subjects: [xssAnimal, cleanAnimal],
      allAnimals: [gSire, gDam, sire, dam, xssAnimal, cleanAnimal],
      speciesProfiles,
      settings,
      speciesName: 'Rabbit',
      options: {
        layout: 'photo_cards_4x6',
        photoCardPaperMode: 'letter_2up',
        includePhotos: true,
        includeCutLines: true,
        breederContactLine: '<b>Unsafe</b>',
      },
      photoDataUrlByAnimalId: {
        x1: 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pjwvc2NyaXB0Pjwvc3ZnPg==',
        c2: VALID_PNG_DATA_URL,
      },
    });

    expect(letterHtml.match(/class="batch-page photo4x6-page"/g)?.length).toBe(1);
    expect(letterHtml).toContain('@page { size: letter portrait;');
    expect(letterHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;Maple');
    expect(letterHtml).not.toContain('<script>alert(1)</script>');
    expect(letterHtml).not.toContain('data:image/svg+xml');
    expect(letterHtml).toContain('photo4x6-placeholder'); // monogram fallback for rejected SVG / missing photo
    expect(letterHtml).toContain(VALID_PNG_DATA_URL);
    expect(letterHtml).toContain('&lt;b&gt;Unsafe&lt;/b&gt;');

    const directHtml = generateBatchPrintHtml({
      subjects: [xssAnimal, cleanAnimal],
      allAnimals: [gSire, gDam, sire, dam, xssAnimal, cleanAnimal],
      speciesProfiles,
      settings,
      speciesName: 'Rabbit',
      options: {
        layout: 'photo_cards_4x6',
        photoCardPaperMode: 'photo_4x6',
        includePhotos: false,
      },
    });

    expect(directHtml.match(/class="batch-page photo4x6-page"/g)?.length).toBe(2);
    expect(directHtml).toContain('@page { size: 6in 4in;');
    expect(directHtml).not.toContain('class="photo4x6-img"');
    expect(directHtml).not.toContain('class="photo4x6-placeholder"');
  });

  it('handles empty or cross-species selections safely without throwing', () => {
    const sheepOnly = makeAnimal('sh1', { species: 'Sheep', name: 'Ewe 1' });
    const html = generateBatchPrintHtml({
      subjects: [sheepOnly],
      allAnimals: [sheepOnly],
      speciesProfiles,
      settings,
      speciesName: 'Rabbit',
      options: { layout: 'cage_cards' },
    });

    expect(html).toContain('No Rabbit animals are selected');
    expect(html).not.toContain('Ewe 1');
  });

  it('embeds scannable vector QR codes on 8-up cage cards when includeQrCodes is enabled and omits them when disabled', () => {
    const k1 = makeAnimal('qr-1', {
      name: 'Hazel',
      tattoo: 'HZ1',
      sex: 'Female',
      cageLocation: 'Hutch R-01',
    });
    const k2 = makeAnimal('qr-2', {
      name: 'Bramble',
      tattoo: 'BR2',
      sex: 'Male',
      cageLocation: 'Hutch R-02',
    });

    const withQr = generateBatchPrintHtml({
      subjects: [k1, k2],
      allAnimals: [k1, k2],
      speciesProfiles,
      settings,
      speciesName: 'Rabbit',
      appBaseUrl: 'https://example.org/pedigree/',
      options: {
        layout: 'cage_cards',
        includeQrCodes: true,
      },
    });

    expect(withQr.match(/class="cage-qr"/g)?.length).toBe(2);
    expect(withQr).toContain('<svg ');
    expect(withQr).toContain('animalId=qr-1');
    expect(withQr).toContain('animalId=qr-2');

    const withoutQr = generateBatchPrintHtml({
      subjects: [k1, k2],
      allAnimals: [k1, k2],
      speciesProfiles,
      settings,
      speciesName: 'Rabbit',
      appBaseUrl: 'https://example.org/pedigree/',
      options: {
        layout: 'cage_cards',
        includeQrCodes: false,
      },
    });

    expect(withoutQr).not.toContain('class="cage-qr"');
    expect(withoutQr).not.toContain('<svg ');
  });
});
