import { describe, expect, it } from 'vitest';
import { generateSpeciesBarnBinderHtml } from '../barnBinder';
import { ShowEvent } from '../models';
import { buildPedigreePdfBytes } from '../pdfExporter';
import { generateSpeciesReport } from '../reportGenerators';
import { generateShareablePedigreeCardHtml } from '../shareablePedigreeCard';
import {
  MAX_SHOW_ELEG_ATTACHMENTS_PER_RESULT,
  computeAnimalShowSummary,
  computeShowLegDeltas,
  mergeEnteredAnimalIdsWithResults,
  normalizeShowAwards,
  normalizeShowResults,
  sanitizeShowELegAttachment,
} from '../showResults';
import { migrateAnimalsToSpecies } from '../speciesMigration';
import {
  exportBarnBackupJson,
  generateEvansHtmPedigree,
  parseBarnBackupJson,
} from '../syncAndExports';
import { makeAnimal, makeEmptySnapshot, makeSettings, makeSpeciesProfile } from './testFixtures';

const SAMPLE_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('showResults — structured placements, awards, GC progress & E-Leg vault', () => {
  it('normalizes awards, sanitizes E-Leg attachments against SVG/XSS payloads, and enforces attachment limits', () => {
    expect(normalizeShowAwards(['bob', 'GCH', 'BOB', 'invalid', 'bis'])).toEqual([
      'BIS',
      'GCH',
      'BOB',
    ]);

    expect(
      sanitizeShowELegAttachment({
        dataUrl: 'javascript:alert(1)',
        fileName: 'evil.png',
      })
    ).toBeNull();

    expect(
      sanitizeShowELegAttachment({
        dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
        fileName: 'vector.svg',
      })
    ).toBeNull();

    const validAtt = sanitizeShowELegAttachment({
      id: 'att-1',
      fileName: 'leg-cert.png',
      mimeType: 'image/png',
      width: 640,
      height: 480,
      storedBytes: 12000,
      dataUrl: SAMPLE_PNG_DATA_URL,
      caption: 'BOB Leg #1',
    });
    expect(validAtt).not.toBeNull();
    expect(validAtt?.dataUrl).toBe(SAMPLE_PNG_DATA_URL);
    expect(validAtt?.caption).toBe('BOB Leg #1');

    const manyAttachments = Array.from({ length: 10 }, (_, idx) => ({
      id: `att-${idx}`,
      fileName: `cert-${idx}.png`,
      dataUrl: SAMPLE_PNG_DATA_URL,
    }));

    const normalized = normalizeShowResults(
      [
        {
          animalId: 'a-empty',
          classPlacement: '',
          awards: [],
          judgeNotes: '',
          legsEarned: 0,
          eLegAttachments: [],
        },
        {
          animalId: 'a-1',
          classPlacement: '1st Sr. Buck',
          awards: ['BOB', 'bov'],
          judgeName: 'J. Miller',
          judgeNotes: 'Great crown and hindquarters',
          legsEarned: 1,
          pointsEarned: 12.5,
          legCertificateNumber: 'E-9001',
          eLegAttachments: manyAttachments,
        },
      ],
      { dropEmpty: true }
    );

    expect(normalized).toHaveLength(1);
    expect(normalized[0].animalId).toBe('a-1');
    expect(normalized[0].awards).toEqual(['BOB', 'BOV']);
    expect(normalized[0].eLegAttachments).toHaveLength(MAX_SHOW_ELEG_ATTACHMENTS_PER_RESULT);

    expect(mergeEnteredAnimalIdsWithResults(['a-1', 'a-2'], normalized)).toEqual(['a-1', 'a-2']);
    expect(mergeEnteredAnimalIdsWithResults(['a-2'], normalized)).toEqual(['a-2', 'a-1']);
  });

  it('computes leg deltas for creates, edits, and deletions cleanly', () => {
    const prev = normalizeShowResults([
      { animalId: 'a-1', classPlacement: '1st', awards: ['BOB'], judgeNotes: '', legsEarned: 1, eLegAttachments: [] },
      { animalId: 'a-2', classPlacement: '1st', awards: ['BOS'], judgeNotes: '', legsEarned: 1, eLegAttachments: [] },
    ]);
    const next = normalizeShowResults([
      { animalId: 'a-1', classPlacement: '1st', awards: ['BOB', 'BIS'], judgeNotes: '', legsEarned: 2, eLegAttachments: [] },
      { animalId: 'a-3', classPlacement: '1st', awards: ['BOV'], judgeNotes: '', legsEarned: 1, eLegAttachments: [] },
    ]);

    const editDeltas = computeShowLegDeltas(prev, next);
    expect(editDeltas.get('a-1')).toBe(1);
    expect(editDeltas.get('a-2')).toBe(-1);
    expect(editDeltas.get('a-3')).toBe(1);

    const deleteDeltas = computeShowLegDeltas(next, undefined);
    expect(deleteDeltas.get('a-1')).toBe(-2);
    expect(deleteDeltas.get('a-3')).toBe(-1);
  });

  it('computes GC progress, distinct judges, awards summary, points, and E-Leg vault summary', () => {
    const sire = makeAnimal('sire-1', {
      name: 'Copper King',
      tattoo: 'CK1',
      sex: 'Male',
      legsCount: 3,
      grandChampionNumber: 'GC-4421',
    });
    const buck = makeAnimal('buck-1', {
      name: 'Red Baron',
      tattoo: 'RB1',
      sex: 'Male',
      sireId: sire.id,
      legsCount: 2,
    });
    const shows: ShowEvent[] = [
      {
        id: 'show-1',
        species: 'Rabbit',
        name: 'Spring Classic Show A',
        location: 'Columbus, OH',
        sanctioningBody: 'ARBA',
        eventDateIso: '2026-04-12',
        entryDeadlineIso: '2026-04-01',
        enteredAnimalIds: [buck.id, sire.id],
        results: [
          {
            animalId: buck.id,
            classPlacement: '1st Sr. Buck (of 7)',
            awards: ['BOB'],
            judgeName: 'A. Alvarez',
            judgeNotes: 'Deep hindquarters and dense fur',
            legsEarned: 1,
            pointsEarned: 14,
            legCertificateNumber: 'ARBA-L101',
            eLegAttachments: [
              {
                id: 'att-a',
                fileName: 'spring-bob.png',
                mimeType: 'image/png',
                width: 400,
                height: 300,
                storedBytes: 5000,
                thumbnailDataUrl: SAMPLE_PNG_DATA_URL,
                dataUrl: SAMPLE_PNG_DATA_URL,
                caption: 'Spring Classic BOB',
                addedAtIso: '2026-04-12T18:00:00.000Z',
              },
            ],
          },
          {
            animalId: sire.id,
            classPlacement: '1st Sr. Buck',
            awards: ['GCH'],
            judgeName: 'A. Alvarez',
            judgeNotes: 'Finished Grand Champion',
            legsEarned: 1,
            pointsEarned: 20,
            eLegAttachments: [],
          },
        ],
        notes: '',
        createdAt: '2026-04-12T18:00:00.000Z',
        updatedAt: '2026-04-12T18:00:00.000Z',
      },
      {
        id: 'show-2',
        species: 'Rabbit',
        name: 'Midwest Open Show B',
        location: 'Indianapolis, IN',
        sanctioningBody: 'ARBA',
        eventDateIso: '2026-06-02',
        entryDeadlineIso: '',
        enteredAnimalIds: [buck.id],
        results: [
          {
            animalId: buck.id,
            classPlacement: '1st Sr. Buck (of 9)',
            awards: ['BOB', 'BIS'],
            judgeName: 'B. Bennett',
            judgeNotes: 'Best In Show winner under Judge Bennett',
            legsEarned: 2,
            pointsEarned: 35.5,
            legCertificateNumber: 'ARBA-L202',
            eLegAttachments: [],
          },
        ],
        notes: '',
        createdAt: '2026-06-02T18:00:00.000Z',
        updatedAt: '2026-06-02T18:00:00.000Z',
      },
    ];

    const summary = computeAnimalShowSummary(buck, shows, []);
    expect(summary.showsEntered).toBe(2);
    expect(summary.placementsRecorded).toBe(2);
    expect(summary.totalShowEventLegs).toBe(3);
    expect(summary.effectiveLegs).toBe(3);
    expect(summary.totalPoints).toBe(49.5);
    expect(summary.distinctJudgesWithLegs).toBe(2);
    expect(summary.awardsSummaryText).toBe('BIS · 2x BOB');
    expect(summary.gcProgress.isEligible).toBe(true);
    expect(summary.gcProgress.statusLabel).toContain('GC Eligible');
    expect(summary.eLegAttachments).toHaveLength(1);
    expect(summary.pedigreeHonorLine).toContain('GC Eligible');
    expect(summary.pedigreeHonorLine).toContain('BIS · 2x BOB');

    const sireSummary = computeAnimalShowSummary(sire, shows, []);
    expect(sireSummary.gcProgress.isGrandChampion).toBe(true);
    expect(sireSummary.gcProgress.shortLabel).toBe('GC #GC-4421');
  });

  it('feeds show results into Evans .HTM, Shareable Card, Offline PDF, Barn Binder, and Male/Female reports', () => {
    const sire = makeAnimal('sire-1', {
      name: 'Apollo',
      tattoo: 'AP1',
      sex: 'Male',
      grandChampionNumber: 'G-901',
      legsCount: 3,
    });
    const doe = makeAnimal('doe-1', {
      name: 'Clover',
      tattoo: 'CL1',
      sex: 'Female',
      legsCount: 2,
    });
    const kit = makeAnimal('kit-1', {
      name: 'Maple Star',
      tattoo: 'MS1',
      sex: 'Female',
      sireId: sire.id,
      damId: doe.id,
      legsCount: 1,
    });

    const show: ShowEvent = {
      id: 'show-main',
      species: 'Rabbit',
      name: 'Heartland Nationals',
      location: 'Des Moines, IA',
      sanctioningBody: 'ARBA',
      eventDateIso: '2026-09-10',
      entryDeadlineIso: '2026-09-01',
      enteredAnimalIds: [sire.id, doe.id, kit.id],
      results: [
        {
          animalId: sire.id,
          classPlacement: '1st Sr. Buck',
          awards: ['BOB', 'GCH'],
          judgeName: 'R. Vance',
          judgeNotes: 'Strong loin and shoulder balance',
          legsEarned: 1,
          pointsEarned: 22,
          eLegAttachments: [],
        },
        {
          animalId: doe.id,
          classPlacement: '1st Sr. Doe',
          awards: ['BOS'],
          judgeName: 'R. Vance',
          judgeNotes: 'Clean ear carriage',
          legsEarned: 2,
          pointsEarned: 18,
          eLegAttachments: [
            {
              id: 'att-doe',
              fileName: 'clover-leg.png',
              mimeType: 'image/png',
              width: 300,
              height: 200,
              storedBytes: 3200,
              thumbnailDataUrl: SAMPLE_PNG_DATA_URL,
              dataUrl: SAMPLE_PNG_DATA_URL,
              caption: 'BOS E-Leg Certificate',
              addedAtIso: '2026-09-10T15:00:00.000Z',
            },
          ],
        },
        {
          animalId: kit.id,
          classPlacement: '1st Jr. Doe',
          awards: ['BOV', 'RIS'],
          judgeName: 'M. Hayes',
          judgeNotes: 'Promising junior frame',
          legsEarned: 1,
          pointsEarned: 15,
          legCertificateNumber: 'E-7712',
          eLegAttachments: [],
        },
      ],
      notes: 'Double open',
      createdAt: '2026-09-10T15:00:00.000Z',
      updatedAt: '2026-09-10T15:00:00.000Z',
    };

    const settings = makeSettings();
    const profiles = [makeSpeciesProfile('Rabbit')];
    const snap = makeEmptySnapshot({
      settings,
      speciesProfiles: profiles,
      animals: [sire, doe, kit],
      shows: [show],
    });

    // 1. Evans .HTM Pedigree
    const evansHtml = generateEvansHtmPedigree(kit, [sire, doe, kit], profiles, settings, 3, undefined, {
      shows: [show],
      careLogs: [],
    });
    expect(evansHtml).toContain('1/3 legs');
    expect(evansHtml).toContain('RIS · BOV');
    expect(evansHtml).toContain('GC: G-901');
    expect(evansHtml).toContain('Legs: 2');

    // 2. Shareable Pedigree Card
    const cardHtml = generateShareablePedigreeCardHtml(kit, [sire, doe, kit], profiles, settings, 3, undefined, {
      shows: [show],
      careLogs: [],
    });
    expect(cardHtml).toContain('RIS · BOV');
    expect(cardHtml).toContain('GC G-901');

    // 3. Offline PDF 1.4 Pedigree
    const pdfBytes = buildPedigreePdfBytes({
      subject: kit,
      allAnimals: [sire, doe, kit],
      speciesProfiles: profiles,
      settings,
      generations: 3,
      printOptions: { shows: [show], careLogs: [] },
    });
    const pdfAscii = new TextDecoder('latin1').decode(pdfBytes);
    expect(pdfAscii.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfAscii).toContain('RIS');

    // 4. Barn Binder (with photos enabled so E-Leg vault thumbnail renders)
    const binderHtml = generateSpeciesBarnBinderHtml(snap, 'Rabbit', { includePhotos: true });
    expect(binderHtml).toContain('Heartland Nationals');
    expect(binderHtml).toContain('E-7712');
    expect(binderHtml).toContain('BOS E-Leg Certificate');
    expect(binderHtml).toContain(SAMPLE_PNG_DATA_URL);

    // 5. Male & Female Reports
    const maleReport = generateSpeciesReport(snap, 'Rabbit', 'male-report');
    const apolloRow = maleReport.rows.find((r) => r.cells.name === 'Apollo');
    expect(apolloRow?.cells.showWins).toContain('BOB');
    expect(apolloRow?.cells.showPoints).toBe(22);
    expect(apolloRow?.cells.gcProgress).toBe('GC #G-901');
    expect(apolloRow?.highlightTone).toBe('success');

    const femaleReport = generateSpeciesReport(snap, 'Rabbit', 'female-report');
    const cloverRow = femaleReport.rows.find((r) => r.cells.name === 'Clover');
    expect(cloverRow?.cells.showWins).toContain('BOS');
    expect(cloverRow?.cells.showPoints).toBe(18);
    expect(cloverRow?.cells.gcProgress).toBe('2/3 legs');
  });

  it('preserves structured show results through JSON backup round-trip and species migration splits', () => {
    const rabbit = makeAnimal('r-1', { species: 'Rabbit', name: 'Pip' });
    const cavy = makeAnimal('c-1', { species: 'Rabbit', name: 'Nutmeg' });
    const show: ShowEvent = {
      id: 'show-x',
      species: 'Rabbit',
      name: 'County Fair',
      location: 'Fairgrounds',
      sanctioningBody: 'ARBA',
      eventDateIso: '2026-08-01',
      entryDeadlineIso: '',
      enteredAnimalIds: ['r-1', 'c-1'],
      results: [
        {
          animalId: 'r-1',
          classPlacement: '1st Jr.',
          awards: ['BOB'],
          judgeName: 'J. Doe',
          judgeNotes: 'Nice coat',
          legsEarned: 1,
          pointsEarned: 10,
          eLegAttachments: [],
        },
        {
          animalId: 'c-1',
          classPlacement: '2nd Jr.',
          awards: ['BOS'],
          judgeName: 'J. Doe',
          judgeNotes: '',
          legsEarned: 0,
          eLegAttachments: [],
        },
      ],
      notes: '',
      createdAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-01T12:00:00.000Z',
    };

    const snap = makeEmptySnapshot({
      speciesProfiles: [makeSpeciesProfile('Rabbit'), makeSpeciesProfile('Cavy')],
      animals: [rabbit, cavy],
      shows: [show],
    });

    const json = exportBarnBackupJson(snap);
    const reimported = parseBarnBackupJson(json, makeSettings());
    expect(reimported.shows[0].results).toHaveLength(2);
    expect(reimported.shows[0].results?.[0].awards).toEqual(['BOB']);

    const migrated = migrateAnimalsToSpecies(snap, ['c-1'], 'Cavy');
    expect(migrated.snapshot.shows).toHaveLength(2);
    const rabbitShow = migrated.snapshot.shows.find((s) => s.species === 'Rabbit');
    const cavyShow = migrated.snapshot.shows.find((s) => s.species === 'Cavy');
    expect(rabbitShow?.enteredAnimalIds).toEqual(['r-1']);
    expect(rabbitShow?.results?.map((r) => r.animalId)).toEqual(['r-1']);
    expect(cavyShow?.enteredAnimalIds).toEqual(['c-1']);
    expect(cavyShow?.results?.map((r) => r.animalId)).toEqual(['c-1']);
  });
});
