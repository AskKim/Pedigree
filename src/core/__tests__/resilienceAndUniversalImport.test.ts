import { describe, expect, it } from 'vitest';
import { analyzeBarnDataHealth, repairBarnDataHealth } from '../dataHealthCheck';
import {
  decodeTextBytes,
  normalizeFlexibleDateIso,
  parseDelimitedTable,
  parseFlexibleWeightToGrams,
} from '../importers/archiveAndCsvUtils';
import { resolveCsvColumnAssignments } from '../importers/csvColumnMapper';
import { buildStarterCsvTemplate } from '../importers/csvStarterTemplate';
import { UniversalPedigreeImporter } from '../importers/universalPedigreeImporter';
import { BarnDatabaseSnapshot } from '../models';
import { buildSpeciesHerdMap, calculateAnimalCoi } from '../pedigreeCalculator';
import { buildPdfReadyBarnSnapshot, parseBarnBackupJson } from '../syncAndExports';
import { makeAnimal, makeEmptySnapshot, makeSettings } from './testFixtures';

function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function encodeUtf16Le(str: string, withBom: boolean): Uint8Array {
  const offset = withBom ? 2 : 0;
  const buf = new Uint8Array(offset + str.length * 2);
  if (withBom) {
    buf[0] = 0xff;
    buf[1] = 0xfe;
  }
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    buf[offset + i * 2] = code & 0xff;
    buf[offset + i * 2 + 1] = (code >> 8) & 0xff;
  }
  return buf;
}

function encodeUtf16Be(str: string, withBom: boolean): Uint8Array {
  const offset = withBom ? 2 : 0;
  const buf = new Uint8Array(offset + str.length * 2);
  if (withBom) {
    buf[0] = 0xfe;
    buf[1] = 0xff;
  }
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    buf[offset + i * 2] = (code >> 8) & 0xff;
    buf[offset + i * 2 + 1] = code & 0xff;
  }
  return buf;
}

describe('Pedigree cycle termination & structural data health repair', () => {
  it('terminates calculateAnimalCoi cleanly on circular ancestry without stack overflow', () => {
    const buck = makeAnimal('buck-loop', {
      name: 'Loop Buck',
      sex: 'Male',
      sireId: 'doe-loop',
      damId: 'buck-loop',
    });
    const doe = makeAnimal('doe-loop', {
      name: 'Loop Doe',
      sex: 'Female',
      sireId: 'buck-loop',
      damId: 'doe-loop',
    });
    const child = makeAnimal('child-loop', {
      name: 'Child',
      sex: 'Male',
      sireId: 'buck-loop',
      damId: 'doe-loop',
    });

    const herdMap = buildSpeciesHerdMap([buck, doe, child], 'Rabbit');
    const result = calculateAnimalCoi(child, herdMap);

    expect(Number.isFinite(result.coiPercent)).toBe(true);
    expect(result.coiPercent).toBeGreaterThanOrEqual(0);
    expect(result.coiPercent).toBeLessThanOrEqual(100);
    expect(result.knownAncestorsIn3Gen).toBeLessThanOrEqual(14);
    expect(result.knownAncestorsIn4Gen).toBeLessThanOrEqual(30);
  });

  it('analyzes and repairs malformed snapshot entries (null rows, NaN/negative numbers, dangling/cyclic parent links)', () => {
    const buck = makeAnimal('b1', {
      name: 'Cyclone',
      sex: 'Male',
      weightGrams: -250,
      legsCount: Number.NaN,
      sireId: 'b1', // self-cycle
      damId: 'missing-dam-999', // dangling link
    });
    const doe = makeAnimal('d1', {
      name: 'Clover',
      sex: 'Female',
      weightGrams: Number.POSITIVE_INFINITY,
      salePriceCents: -100,
      purchaseCostCents: Number.NaN,
    });

    const malformedSnapshot = {
      ...makeEmptySnapshot(),
      animals: [null as unknown as typeof buck, buck, doe],
      animalPhotos: [null as any],
    } as BarnDatabaseSnapshot;

    const before = analyzeBarnDataHealth(malformedSnapshot);
    expect(before.healthy).toBe(false);
    expect(before.issues.some((i) => i.code === 'CYCLIC_PARENT_LINK')).toBe(true);
    expect(before.issues.some((i) => i.code === 'DANGLING_PARENT_LINK')).toBe(true);
    expect(before.issues.some((i) => i.code === 'NEGATIVE_NUMERIC_FIELD')).toBe(true);

    const repair = repairBarnDataHealth(malformedSnapshot);
    expect(repair.reportAfter.healthy).toBe(true);
    expect(repair.repairsApplied.length).toBeGreaterThan(0);

    const fixedBuck = repair.nextSnapshot.animals.find((a) => a.id === 'b1')!;
    expect(fixedBuck.weightGrams).toBe(0);
    expect(fixedBuck.legsCount).toBe(0);
    expect(fixedBuck.sireId).toBe('');
    expect(fixedBuck.damId).toBe('');
    expect(fixedBuck.notes).toContain('missing-dam-999');

    const fixedDoe = repair.nextSnapshot.animals.find((a) => a.id === 'd1')!;
    expect(fixedDoe.weightGrams).toBe(0);
    expect(fixedDoe.salePriceCents).toBe(0);
    expect(fixedDoe.purchaseCostCents).toBe(0);
  });
});

describe('Backup JSON parser & PDF DTO snapshot resilience', () => {
  it('handles array settings, null records, NaN numbers, and __proto__ keys safely', () => {
    const fallbackSettings = makeSettings();
    const maliciousJson = JSON.stringify({
      settings: ['not', 'an', 'object'],
      animals: [
        null,
        {
          id: '__proto__',
          name: 'Prototype Attempt',
          species: 'Rabbit',
          weightGrams: 'not-a-number',
          legsCount: 'NaN',
          salePriceCents: -500,
        },
        {
          id: 'valid-1',
          name: 'Valid Rabbit',
          species: 'Rabbit',
          weightGrams: 3500,
          legsCount: 3,
        },
      ],
      speciesProfiles: [null],
      breedings: [null],
      cages: [null],
      tasks: [null],
      careLogs: [null],
      shows: [null],
    });

    const parsed = parseBarnBackupJson(maliciousJson, fallbackSettings);
    expect(parsed.settings.barnName).toBe(fallbackSettings.barnName);
    expect(parsed.animals).toHaveLength(2);

    const protoReplacement = parsed.animals.find((a) => a.name === 'Prototype Attempt')!;
    expect(protoReplacement.id).not.toBe('__proto__');
    expect(protoReplacement.weightGrams).toBe(0);
    expect(protoReplacement.legsCount).toBe(0);
    expect(protoReplacement.salePriceCents).toBe(0);

    const valid = parsed.animals.find((a) => a.id === 'valid-1')!;
    expect(valid.weightGrams).toBe(3500);
    expect(valid.legsCount).toBe(3);

    // Ensure buildPdfReadyBarnSnapshot runs cleanly with valid COI evaluation
    const report = buildPdfReadyBarnSnapshot(parsed, 'Rabbit');
    expect(report.totalAnimals).toBe(2);
    expect(report.animals[0].coiPercent).toMatch(/%$/);
  });
});

describe('Encoding decoder, delimited parser, flexible date & weight normalization', () => {
  it('decodes UTF-16LE (BOM), UTF-16BE (BOM), un-BOMmed UTF-16LE, and Windows-1252 bytes', () => {
    const sample = 'Name,Variety\nBriar,Café Red';
    expect(decodeTextBytes(encodeUtf16Le(sample, true))).toBe(sample);
    expect(decodeTextBytes(encodeUtf16Be(sample, true))).toBe(sample);
    expect(decodeTextBytes(encodeUtf16Le('Name,Sex\nBuck,Male', false))).toBe('Name,Sex\nBuck,Male');

    // Invalid UTF-8 byte sequence 0xE9 ('é' in Windows-1252) falls back to Windows-1252
    const win1252Bytes = new Uint8Array([
      ...encodeUtf8('Name\nCaf'),
      0xe9,
    ]);
    expect(decodeTextBytes(win1252Bytes)).toBe('Name\nCafé');
  });

  it('parses semicolon/pipe tables, title preamble rows, and unclosed quotes gracefully', () => {
    const semiWithPreamble = [
      'Evans Rabbit Export - Spring 2026',
      'Name;Tattoo;Sex;Breed',
      'Copper;CC-01;Buck;New Zealand',
      '"Willow; Jr.";CC-02;Doe;"Unclosed quote note',
    ].join('\n');

    const semiResult = parseDelimitedTable(semiWithPreamble);
    expect(semiResult.headers).toEqual(['Name', 'Tattoo', 'Sex', 'Breed']);
    expect(semiResult.rows).toHaveLength(2);
    expect(semiResult.rows[0].Name).toBe('Copper');
    expect(semiResult.rows[1].Name).toBe('Willow; Jr.');
    expect(semiResult.rows[1].Breed).toContain('Unclosed quote note');

    const pipeTable = 'ID|Name|Sire|Dam\nR1|Pip|Buck A|Doe B';
    const pipeResult = parseDelimitedTable(pipeTable);
    expect(pipeResult.headers).toEqual(['ID', 'Name', 'Sire', 'Dam']);
    expect(pipeResult.rows[0].Sire).toBe('Buck A');
  });

  it('normalizes Excel serial dates, European dot dates, historical 1895 dates, and rejects invalid calendar dates', () => {
    // 45123 -> 2023-07-16 in Excel serial epoch (1899-12-30)
    expect(normalizeFlexibleDateIso('45123')).toBe('2023-07-16');
    expect(normalizeFlexibleDateIso('14.02.2025')).toBe('2025-02-14');
    expect(normalizeFlexibleDateIso('05.11.2024')).toBe('2024-11-05');
    expect(normalizeFlexibleDateIso('1895-05-01')).toBe('1895-05-01');
    expect(normalizeFlexibleDateIso('2025-02-30')).toBe('');
    expect(normalizeFlexibleDateIso('2025-13-01')).toBe('');
  });

  it('parses flexible pound, pound-ounce, and metric weight formats', () => {
    expect(parseFlexibleWeightToGrams('8.5#')).toBe(Math.round(8.5 * 453.59237));
    expect(parseFlexibleWeightToGrams('4 lbs. 8 oz.')).toBe(Math.round(4.5 * 453.59237));
    expect(parseFlexibleWeightToGrams('3200 g')).toBe(3200);
    expect(parseFlexibleWeightToGrams('4.2 kg')).toBe(4200);
  });
});

describe('UniversalPedigreeImporter — heterogeneous system imports & graceful failure', () => {
  it('imports an Evans Software .HTM rowspan pedigree chart with Sire/Dam/Grandparent links', () => {
    const evansHtml = `
      <!doctype html>
      <html>
        <head><title>Pedigree - Meadowbrook Apollo (MA-10)</title></head>
        <body>
          <div>Breed &amp; Variety: New Zealand, Broken Red</div>
          <table>
            <tr>
              <td rowspan="4">Meadowbrook Apollo<br/>Ear: MA-10<br/>DOB: 2024-03-15<br/>Wt: 9 lb 4 oz</td>
              <td rowspan="2">Oak King<br/>Tattoo: OK-01<br/>Red</td>
              <td>Senior Sire<br/>Tattoo: SS-01</td>
            </tr>
            <tr>
              <td>Senior Dam<br/>Tattoo: SD-01</td>
            </tr>
            <tr>
              <td rowspan="2">Valley Queen<br/>Tattoo: VQ-02<br/>White</td>
              <td>Maternal Grandsire<br/>Tattoo: MS-01</td>
            </tr>
            <tr>
              <td>Maternal Granddam<br/>Tattoo: MD-01</td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const snapshot = makeEmptySnapshot();
    const preview = UniversalPedigreeImporter.parse(
      [{ fileName: 'apollo-evans-pedigree.htm', bytes: encodeUtf8(evansHtml) }],
      snapshot,
      { fallbackSpeciesName: 'Rabbit' }
    );

    expect(preview.animals.length).toBeGreaterThanOrEqual(7);
    expect(preview.parentLinksResolved).toBeGreaterThanOrEqual(6);

    const apollo = preview.animals.find((a) => a.tattoo === 'MA-10');
    const oak = preview.animals.find((a) => a.tattoo === 'OK-01');
    const queen = preview.animals.find((a) => a.tattoo === 'VQ-02');
    expect(apollo).toBeDefined();
    expect(apollo?.sireId).toBe(oak?.id);
    expect(apollo?.damId).toBe(queen?.id);
    expect(oak?.sireId).toBeDefined();
    expect(oak?.damId).toBeDefined();
  });

  it('imports a flat multi-generation CSV spreadsheet with Gen 1-3 ancestor columns', () => {
    const csv = [
      'Name,Ear Tag,Sex,Breed,DOB,Weight,Sire,Dam,PGS,PGD,MGS,MGD',
      'Alpine Comet,AC-09,Doe,French Angora,45123,7 lbs. 8 oz.,Thunder (TH-1),Dawn (DN-2),Storm (ST-3),Breeze (BR-4),Sun (SN-5),Moon (MN-6)',
    ].join('\n');

    const preview = UniversalPedigreeImporter.parse(
      [{ fileName: 'kintracs-export.csv', bytes: encodeUtf8(csv) }],
      makeEmptySnapshot(),
      { fallbackSpeciesName: 'Rabbit' }
    );

    expect(preview.animals).toHaveLength(7);
    expect(preview.parentLinksResolved).toBe(6);

    const comet = preview.animals.find((a) => a.tattoo === 'AC-09')!;
    const thunder = preview.animals.find((a) => a.tattoo === 'TH-1')!;
    const storm = preview.animals.find((a) => a.tattoo === 'ST-3')!;
    expect(comet.birthDateIso).toBe('2023-07-16');
    expect(comet.sex).toBe('Female');
    expect(comet.sireId).toBe(thunder.id);
    expect(thunder.sireId).toBe(storm.id);
  });

  it('imports a nested JSON { sire, dam } tree', () => {
    const nested = {
      name: 'Cedar Star',
      tattoo: 'CS-77',
      species: 'Goat',
      sex: 'Doe',
      dob: '04/12/2024',
      sire: {
        name: 'Cedar Buck',
        tattoo: 'CB-10',
        sire: { name: 'Grandpa Buck', tattoo: 'GB-01' },
      },
      dam: {
        name: 'Cedar Doe',
        tattoo: 'CD-20',
      },
    };

    const preview = UniversalPedigreeImporter.parse(
      [{ fileName: 'goat-tree.json', bytes: encodeUtf8(JSON.stringify(nested)) }],
      makeEmptySnapshot(),
      { fallbackSpeciesName: 'Goat' }
    );

    expect(preview.animals).toHaveLength(4);
    expect(preview.parentLinksResolved).toBe(3);

    const star = preview.animals.find((a) => a.tattoo === 'CS-77')!;
    const cb = preview.animals.find((a) => a.tattoo === 'CB-10')!;
    const gb = preview.animals.find((a) => a.tattoo === 'GB-01')!;
    expect(star.species).toBe('Goat');
    expect(star.sireId).toBe(cb.id);
    expect(cb.sireId).toBe(gb.id);
  });

  it('produces graceful actionable warnings for unsupported binary files and corrupt JSON/HTML without throwing', () => {
    const pdfMagic = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    const xlsxMagic = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    const brokenJson = encodeUtf8('{ "animals": [ { "name": "truncated" ');

    const preview = UniversalPedigreeImporter.parse(
      [
        { fileName: 'pedigree.pdf', bytes: pdfMagic },
        { fileName: 'herd.xlsx', bytes: xlsxMagic },
        { fileName: 'corrupt.json', bytes: brokenJson },
      ],
      makeEmptySnapshot(),
      { fallbackSpeciesName: 'Rabbit' }
    );

    expect(preview.animals).toHaveLength(0);
    expect(preview.warnings.some((w) => w.includes('pedigree.pdf'))).toBe(true);
    expect(preview.warnings.some((w) => w.includes('herd.xlsx'))).toBe(true);
    expect(preview.warnings.some((w) => w.includes('corrupt.json'))).toBe(true);
  });

  it('generates a Starter CSV Template with standard headers that round-trips cleanly with zero unresolved links', () => {
    const template = buildStarterCsvTemplate('Rabbit');
    expect(template.headers.slice(0, 11)).toEqual([
      'Name',
      'Ear_ID',
      'Sex',
      'DOB',
      'Breed',
      'Variety',
      'Weight',
      'Sire_ID',
      'Dam_ID',
      'Reg_No',
      'GC_No',
    ]);
    expect(template.content.startsWith('\uFEFF')).toBe(true);

    const preview = UniversalPedigreeImporter.parse(
      [{ fileName: template.filename, bytes: encodeUtf8(template.content) }],
      makeEmptySnapshot(),
      { fallbackSpeciesName: 'Rabbit' }
    );

    expect(preview.animals).toHaveLength(3);
    expect(preview.unresolvedParentLinks).toHaveLength(0);
    expect(preview.parentLinksResolved).toBe(2);
    expect(preview.csvTables).toHaveLength(1);
    expect(preview.csvTables![0].columns.every((c) => c.assignedField !== '')).toBe(true);

    const sire = preview.animals.find((a) => a.tattoo === 'OR-101')!;
    const dam = preview.animals.find((a) => a.tattoo === 'OR-102')!;
    const offspring = preview.animals.find((a) => a.tattoo === 'OR-205')!;
    expect(offspring.sireId).toBe(sire.id);
    expect(offspring.damId).toBe(dam.id);
    expect(sire.registrationNumber).toBe('REG-1042');
    expect(sire.grandChampionNumber).toBe('GC-881');
  });

  it('supports interactive CSV column mapping overrides and __ignore__ exclusions with sample previews', () => {
    const csv = [
      'Barn_Call_Name,Custom_Ear,Gender_Code,Papa_Ref,Mama_Ref,Internal_Row_Num',
      'Maple Star,MS-11,Doe,MS-01,MS-02,999',
      'Maple King,MS-01,Buck,,,1000',
    ].join('\n');

    const { headers, rows } = parseDelimitedTable(csv);
    const initial = resolveCsvColumnAssignments(headers, rows, undefined, 'custom.csv');
    expect(initial.unmappedColumns).toContain('Barn_Call_Name');
    expect(initial.unmappedColumns).toContain('Custom_Ear');
    expect(initial.unmappedColumns).toContain('Papa_Ref');

    const preview = UniversalPedigreeImporter.parse(
      [{ fileName: 'custom.csv', bytes: encodeUtf8(csv) }],
      makeEmptySnapshot(),
      {
        fallbackSpeciesName: 'Rabbit',
        csvColumnMapping: {
          'custom.csv::Barn_Call_Name': 'name',
          'custom.csv::Custom_Ear': 'tattoo',
          'custom.csv::Gender_Code': 'sex',
          'custom.csv::Papa_Ref': 'sire',
          'custom.csv::Mama_Ref': 'dam',
          'custom.csv::Internal_Row_Num': '__ignore__',
        },
      }
    );

    const star = preview.animals.find((a) => a.tattoo === 'MS-11')!;
    const king = preview.animals.find((a) => a.tattoo === 'MS-01')!;
    expect(star).toBeDefined();
    expect(star.name).toBe('Maple Star');
    expect(star.sex).toBe('Female');
    expect(star.sireId).toBe(king.id); // Resolved out-of-order to row 2!

    // Mama_Ref 'MS-02' was not in CSV or barn -> flagged in unresolvedParentLinks
    expect(preview.unresolvedParentLinks).toHaveLength(1);
    expect(preview.unresolvedParentLinks![0]).toMatchObject({
      rowNumber: 1,
      childName: 'Maple Star',
      role: 'dam',
      rawReference: 'MS-02',
      placeholderCreated: true,
    });
  });

  it('resolves existing barn parents cleanly and leaves unresolved Sire/Dam unlinked when placeholder creation is disabled', () => {
    const existingBuck = makeAnimal('existing-buck-1', {
      name: 'Barn Champion',
      tattoo: 'BC-10',
      sex: 'Male',
      species: 'Rabbit',
    });
    const snapshot = {
      ...makeEmptySnapshot(),
      animals: [existingBuck],
    };

    const csv = [
      'Name,Ear_ID,Sex,Sire_ID,Dam_ID',
      'Clover Kit,CK-77,Doe,BC-10,MISSING-DOE-9',
    ].join('\n');

    const preview = UniversalPedigreeImporter.parse(
      [{ fileName: 'kits.csv', bytes: encodeUtf8(csv) }],
      snapshot,
      {
        fallbackSpeciesName: 'Rabbit',
        createPlaceholderAncestorsForUnlinked: false,
      }
    );

    expect(preview.animals).toHaveLength(1);
    const kit = preview.animals[0];
    expect(kit.sireId).toBe(existingBuck.id);
    expect(kit.damId).toBe('');
    expect(preview.unresolvedParentLinks).toHaveLength(1);
    expect(preview.unresolvedParentLinks![0]).toMatchObject({
      role: 'dam',
      rawReference: 'MISSING-DOE-9',
      placeholderCreated: false,
    });
  });
});
