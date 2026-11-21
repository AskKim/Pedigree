# Codebase Export: AskKim/Pedigree (Part 13 of 16)

- **Branch:** `main`
- **Commit:** `847f8ec8a2fc88e92ecb94065d96cf1277189c07`
- **Generated (UTC):** 2026-11-21 17:00:43 UTC
- **Files in this part:** 25 (`src/core/__tests__/showDocuments.test.ts` -> `src/core/importers/universalPedigreeImporter.ts`)
- **Index:** [index.md](./index.md)

---
## `src/core/__tests__/showDocuments.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildShowDocumentFileName,
  buildShowEntryMailtoUrl,
  buildShowEntryPlainTextSummary,
  generateShowEntryFormHtml,
  generateShowRemarkCardsHtml,
  resolveShowRosterAnimals,
  suggestShowClassLabel,
} from '../showDocuments';
import { ShowEvent } from '../models';
import { makeAnimal, makeSettings, makeSpeciesProfile } from './testFixtures';

describe('showDocuments — ARBA Show Entry Form & Remark Cards', () => {
  const rabbitProfile = makeSpeciesProfile('Rabbit');
  const settings = makeSettings({
    barnName: 'Hilltop Rabbitry',
    breederName: 'Kim Breeder',
  });

  const animals = [
    makeAnimal('r1', {
      name: 'Apollo',
      tattoo: 'A1',
      breed: 'Holland Lop',
      variety: 'Solid Tort',
      sex: 'Male',
      birthDateIso: '2025-01-01', // > 8 months -> Senior
      registrationNumber: 'R100',
    }),
    makeAnimal('r2', {
      name: 'Clover',
      tattoo: 'C2',
      breed: 'German Angora',
      variety: 'REW',
      sex: 'Female',
      birthDateIso: '2026-01-01', // ~4 months -> Junior on 2026-05-01
    }),
    makeAnimal('r3', {
      name: 'Breeze',
      tattoo: 'B3',
      breed: 'Mini Rex',
      variety: 'Castor',
      sex: 'Female',
      birthDateIso: '2025-10-15', // ~6.5 months -> Intermediate on 2026-05-01
    }),
  ];

  const show: ShowEvent = {
    id: 'show-1',
    species: 'Rabbit',
    name: 'Spring Valley Classic',
    location: 'Fairgrounds Hall B',
    sanctioningBody: 'ARBA',
    eventDateIso: '2026-05-01',
    entryDeadlineIso: '2026-04-24',
    enteredAnimalIds: ['r1', 'r2', 'missing-id'],
    results: [
      {
        animalId: 'r3',
        classPlacement: '1st / 8',
        awards: ['BOB'],
        judgeName: 'J. Judge',
        judgeNotes: 'Great crown and dense coat',
        legsEarned: 1,
        eLegAttachments: [],
      },
    ],
    notes: 'Check-in 7:30 AM',
    createdAt: '2026-04-01T10:00:00.000Z',
    updatedAt: '2026-04-01T10:00:00.000Z',
  };

  it('resolves combined entered and result roster animals and classifies Senior/Intermediate/Junior ages', () => {
    const roster = resolveShowRosterAnimals(show, animals);
    expect(roster.map((a) => a.id)).toEqual(['r2', 'r1', 'r3']); // sorted alphabetically by breed
    expect(suggestShowClassLabel(animals[0], '2026-05-01')).toBe('Senior');
    expect(suggestShowClassLabel(animals[2], '2026-05-01')).toBe('Intermediate');
    expect(suggestShowClassLabel(animals[1], '2026-05-01')).toBe('Junior');

    expect(buildShowDocumentFileName(show, 'entry-form')).toBe(
      'entry-form-spring-valley-classic-2026-05-01.htm'
    );
    expect(buildShowDocumentFileName(show, 'remark-cards')).toBe(
      'remark-cards-spring-valley-classic-2026-05-01.htm'
    );
  });

  it('builds ARBA Show Entry Form HTML, plain text summary, and mailto URL with fee math', () => {
    const html = generateShowEntryFormHtml(show, animals, rabbitProfile, settings, {
      division: 'Youth',
      entryFeePerAnimal: '4.50',
      furWoolFeePerAnimal: '2.00',
      defaultEnterFurWool: true,
      exhibitorArbaNumber: 'Y-9988',
    });

    expect(html).toContain('Official ARBA Show Entry Form');
    expect(html).toContain('Youth Division');
    expect(html).toContain('Total Entries: <strong>3</strong>');
    expect(html).toContain('Fur / Wool Entries: <strong>3</strong>');
    // 3 * (4.50 + 2.00) = $19.50
    expect(html).toContain('$19.50');
    expect(html).toContain('R100');

    const text = buildShowEntryPlainTextSummary(show, animals, rabbitProfile, settings, {
      division: 'Open',
      entryFeePerAnimal: '5',
      defaultEnterFurWool: false,
    });
    expect(text).toContain('ARBA SHOW ENTRY - Spring Valley Classic');
    expect(text).toContain('Division: Open');
    expect(text).toContain('ENTRIES (3):');
    expect(text).toContain('Est. Fees: $15.00');

    const mailto = buildShowEntryMailtoUrl(show, animals, rabbitProfile, settings, {
      secretaryEmail: 'secretary@club.org',
      division: 'Open',
    });
    expect(mailto.startsWith('mailto:secretary%40club.org?subject=')).toBe(true);
    expect(mailto).toContain('&body=');
  });

  it('renders 4-up and 1-up Show Remark Cards with judge placements and coop numbers', () => {
    const html4up = generateShowRemarkCardsHtml(show, animals, rabbitProfile, settings, {
      layoutMode: '4up',
      coopByAnimalId: { r1: '104' },
    });
    expect(html4up).toContain('class="page grid-4up"');
    expect(html4up).toContain('Coop 104');
    expect(html4up).toContain('Great crown and dense coat');
    expect(html4up).toContain('1 Leg(s)');

    const html1up = generateShowRemarkCardsHtml(show, animals, rabbitProfile, settings, {
      layoutMode: '1up',
      includeExistingJudgeNotes: false,
    });
    expect(html1up).toContain('size: 6in 4in');
    expect(html1up).toContain('class="page single-page"');
    expect(html1up).not.toContain('Great crown and dense coat');
  });
});
```

## `src/core/__tests__/showResults.test.ts`

```typescript
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
```

## `src/core/__tests__/speciesMemo.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildCompleteBackupZipArchive,
  parseBackupArchiveInput,
} from '../backupArchive';
import { buildFullPredefinedSampleSnapshot } from '../sampleData';
import {
  applyMemoFormatAction,
  parseMemoBlocks,
  sanitizeSpeciesMemo,
  toggleMemoChecklistLine,
} from '../speciesMemo';
import {
  exportBarnBackupJson,
  exportSpeciesBackupJson,
  mergeBarnSnapshots,
  parseBarnBackupJson,
} from '../syncAndExports';

describe('speciesMemo — data hygiene, emoji preservation, and safe formatting', () => {
  it('preserves keyboard emoji, ZWJ sequences, variation selectors, and skin tones intact', () => {
    const keyboardInput =
      'Rabbit herd 🐇 check ❤️ feed 🌾 weight ⚖️\r\nFarmer 🧑🏽‍🌾 flag 🇺🇸 list 1️⃣';
    const clean = sanitizeSpeciesMemo(keyboardInput);
    expect(clean).toBe(
      'Rabbit herd 🐇 check ❤️ feed 🌾 weight ⚖️\nFarmer 🧑🏽‍🌾 flag 🇺🇸 list 1️⃣'
    );
  });

  it('rejects non-string erroneous entries and strips control chars, bidi overrides, and lone surrogates', () => {
    expect(sanitizeSpeciesMemo(null)).toBe('');
    expect(sanitizeSpeciesMemo(undefined)).toBe('');
    expect(sanitizeSpeciesMemo(12345)).toBe('');
    expect(sanitizeSpeciesMemo({ injected: true })).toBe('');
    expect(sanitizeSpeciesMemo(['a', 'b'])).toBe('');

    // Strip NUL, C0/C1 control chars, bidi overrides (\u202E), and broken lone high/low surrogates
    const dirty =
      'Safe\u0000Text\u0007 \u202Eoverride\u2069 \uD83Dbroken\uDC07 valid🐇\tindented';
    expect(sanitizeSpeciesMemo(dirty)).toBe('SafeText override broken valid🐇\tindented');

    // Truncating at a max limit never splits a surrogate pair
    const emojis = '🐇🐐🐑'; // 6 UTF-16 code units
    expect(sanitizeSpeciesMemo(emojis, 3)).toBe('🐇'); // steps back from split 🐐 high surrogate
    expect(sanitizeSpeciesMemo(emojis, 4)).toBe('🐇🐐');
  });

  it('applies basic formatting bar actions and checklist toggling cleanly', () => {
    const step1 = applyMemoFormatAction('Check buck weight', 6, 10, { type: 'bold' });
    expect(step1.nextText).toBe('Check **buck** weight');

    const step2 = applyMemoFormatAction('Morning Feed', 0, 0, { type: 'heading' });
    expect(step2.nextText).toBe('## Morning Feed');

    const step3 = applyMemoFormatAction('Trim nails', 0, 0, { type: 'checklist' });
    expect(step3.nextText).toBe('- [ ] Trim nails');
    expect(toggleMemoChecklistLine(step3.nextText, 0)).toBe('- [x] Trim nails');
    expect(toggleMemoChecklistLine('- [x] Trim nails', 0)).toBe('- [ ] Trim nails');

    const step4 = applyMemoFormatAction('Hay ', 4, 4, { type: 'emoji', emoji: '🌾' });
    expect(step4.nextText).toBe('Hay 🌾');

    const step5 = applyMemoFormatAction('', 0, 0, { type: 'date', dateLabel: 'Nov 15, 2026' });
    expect(step5.nextText).toBe('[Nov 15, 2026] ');
  });

  it('parses scripts/HTML strings strictly as plain text tokens without code execution', () => {
    const payload = [
      '## Herd Notes 🐇',
      '**Important** <script>alert("xss")</script>',
      '- *Check* <img src=x onerror=alert(1)>',
      '- [ ] [link](javascript:alert(1))',
      "- [x] '; DROP TABLE animals; --",
    ].join('\n');

    const blocks = parseMemoBlocks(payload);
    expect(blocks).toHaveLength(5);
    expect(blocks[0].type).toBe('heading');
    expect(blocks[1]).toEqual({
      type: 'paragraph',
      lineIndex: 1,
      tokens: [
        { type: 'bold', text: 'Important' },
        { type: 'text', text: ' <script>alert("xss")</script>' },
      ],
    });
    expect(blocks[3]).toEqual({
      type: 'checklist',
      lineIndex: 3,
      checked: false,
      tokens: [{ type: 'text', text: '[link](javascript:alert(1))' }],
    });
    expect(blocks[4]).toEqual({
      type: 'checklist',
      lineIndex: 4,
      checked: true,
      tokens: [{ type: 'text', text: "'; DROP TABLE animals; --" }],
    });
  });

  it('persists and sanitizes per-species memos cleanly across JSON backup export and import', () => {
    const snap = buildFullPredefinedSampleSnapshot();
    const rabbit = snap.speciesProfiles.find((s) => s.name === 'Rabbit')!;
    rabbit.memoText = '## Copper Creek Notes 🐇\n- [ ] Weigh kits ✅';
    rabbit.memoUpdatedAt = '2026-11-15T18:00:00.000Z';

    const exported = exportBarnBackupJson(snap);
    const parsedObj = JSON.parse(exported);
    // Inject an erroneous non-string memoText into Goat in backup JSON to test hygiene on restore
    const goatRow = parsedObj.speciesProfiles.find((s: { name: string }) => s.name === 'Goat');
    goatRow.memoText = { badPayload: 42 };

    const restored = parseBarnBackupJson(JSON.stringify(parsedObj), snap.settings);
    const restoredRabbit = restored.speciesProfiles.find((s) => s.name === 'Rabbit')!;
    const restoredGoat = restored.speciesProfiles.find((s) => s.name === 'Goat')!;

    expect(restoredRabbit.memoText).toBe('## Copper Creek Notes 🐇\n- [ ] Weigh kits ✅');
    expect(restoredRabbit.memoUpdatedAt).toBe('2026-11-15T18:00:00.000Z');
    expect(restoredGoat.memoText).toBe('');
  });

  it('includes and restores per-species memos in Complete .ZIP archives, single-species backups, and snapshot merges', () => {
    const snap = buildFullPredefinedSampleSnapshot();
    const rabbit = snap.speciesProfiles.find((s) => s.name === 'Rabbit')!;
    const goat = snap.speciesProfiles.find((s) => s.name === 'Goat')!;
    rabbit.memoText = '## Winter Feed Mix 🐇🌾\n- [x] Double check heat lamps';
    rabbit.memoUpdatedAt = '2026-11-15T19:00:00.000Z';
    goat.memoText = 'Hoof trim notes 🐐';
    goat.memoUpdatedAt = '2026-11-15T18:30:00.000Z';

    // 1. Complete .ZIP backup + restore
    const zipArchive = buildCompleteBackupZipArchive(snap);
    const parsedZip = parseBackupArchiveInput(zipArchive.bytes, 'backup.zip', snap.settings);
    expect(parsedZip.kind).toBe('full_snapshot');
    if (parsedZip.kind === 'full_snapshot') {
      const zipRabbit = parsedZip.snapshot.speciesProfiles.find((s) => s.name === 'Rabbit')!;
      const zipGoat = parsedZip.snapshot.speciesProfiles.find((s) => s.name === 'Goat')!;
      expect(zipRabbit.memoText).toBe('## Winter Feed Mix 🐇🌾\n- [x] Double check heat lamps');
      expect(zipRabbit.memoUpdatedAt).toBe('2026-11-15T19:00:00.000Z');
      expect(zipGoat.memoText).toBe('Hoof trim notes 🐐');
    }

    // 2. Targeted single-species backup + restore
    const rabbitOnlyJson = exportSpeciesBackupJson(snap, 'Rabbit');
    const restoredSpeciesSnap = parseBarnBackupJson(rabbitOnlyJson, snap.settings);
    const restoredRabbitOnly = restoredSpeciesSnap.speciesProfiles.find((s) => s.name === 'Rabbit')!;
    expect(restoredRabbitOnly.memoText).toBe('## Winter Feed Mix 🐇🌾\n- [x] Double check heat lamps');

    // 3. Merging a peer snapshot whose species gestation changed later does not clobber newer memo
    const peerSnap = buildFullPredefinedSampleSnapshot();
    const peerRabbit = peerSnap.speciesProfiles.find((s) => s.name === 'Rabbit')!;
    peerRabbit.gestationDays = 32;
    peerRabbit.memoText = '';
    peerRabbit.memoUpdatedAt = '';
    peerRabbit.updatedAt = '2099-01-01T00:00:00.000Z';

    const merged = mergeBarnSnapshots(snap, peerSnap);
    const mergedRabbit = merged.snapshot.speciesProfiles.find((s) => s.name === 'Rabbit')!;
    expect(mergedRabbit.gestationDays).toBe(32);
    expect(mergedRabbit.memoText).toBe('## Winter Feed Mix 🐇🌾\n- [x] Double check heat lamps');
    expect(mergedRabbit.memoUpdatedAt).toBe('2026-11-15T19:00:00.000Z');
  }, 15000);
});
```

## `src/core/__tests__/speciesMigration.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { buildSpeciesHerdMap } from '../pedigreeCalculator';
import {
  expandPedigreeFamilyInSpecies,
  migrateAnimalsToSpecies,
} from '../speciesMigration';
import { makeAnimal, makeEmptySnapshot, makeSpeciesProfile } from './testFixtures';

describe('speciesMigration — family expansion & cross-species migrations', () => {
  it('expands pedigree family upward, downward, and across co-parents within the source species only', () => {
    const gSire = makeAnimal('gs', { species: 'Sheep', sex: 'Male' });
    const sire = makeAnimal('s', { species: 'Sheep', sex: 'Male', sireId: 'gs' });
    const dam = makeAnimal('d', { species: 'Sheep', sex: 'Female' });
    const kid = makeAnimal('k', { species: 'Sheep', sex: 'Male', sireId: 's', damId: 'd' });
    const otherMate = makeAnimal('m2', { species: 'Sheep', sex: 'Female' });
    const grandKid = makeAnimal('gk', { species: 'Sheep', sex: 'Female', sireId: 'k', damId: 'm2' });
    const unrelatedSheep = makeAnimal('u', { species: 'Sheep', sex: 'Male' });
    const rabbit = makeAnimal('r1', { species: 'Rabbit', sex: 'Male' });

    const all = [gSire, sire, dam, kid, otherMate, grandKid, unrelatedSheep, rabbit];
    const expansion = expandPedigreeFamilyInSpecies(all, ['k'], 'Sheep');

    expect(expansion.directIds).toEqual(['k']);
    expect(expansion.ancestorIds.sort()).toEqual(['d', 'gs', 's']);
    expect(expansion.descendantIds).toEqual(['gk']);
    expect(expansion.linkedCoParentAndRelativeIds).toEqual(['m2']);
    expect(expansion.allExpandedIds.sort()).toEqual(['d', 'gk', 'gs', 'k', 'm2', 's']);
  });

  it('migrates partial selections while reconnecting pedigree links once parents follow', () => {
    const sire = makeAnimal('s', { species: 'Rabbit', sex: 'Male' });
    const dam = makeAnimal('d', { species: 'Rabbit', sex: 'Female' });
    const kid = makeAnimal('k', { species: 'Rabbit', sex: 'Male', sireId: 's', damId: 'd' });

    const snap1 = makeEmptySnapshot({
      speciesProfiles: [makeSpeciesProfile('Rabbit'), makeSpeciesProfile('Goat')],
      animals: [sire, dam, kid],
    });

    // Step 1: move only `k` to Goat -> parent UUIDs preserved, flagged as splitParentLinksCount = 1
    const pass1 = migrateAnimalsToSpecies(snap1, ['k'], 'Goat');
    expect(pass1.animalsMigrated).toBe(1);
    expect(pass1.splitParentLinksCount).toBe(1);
    expect(pass1.remainingSourceAnimalsCount).toBe(2);

    // Step 2: move `s` and `d` to Goat -> Goat pedigree tree automatically reconnects
    const pass2 = migrateAnimalsToSpecies(pass1.snapshot, ['s', 'd'], 'Goat');
    expect(pass2.animalsMigrated).toBe(2);
    expect(pass2.splitParentLinksCount).toBe(0);
    expect(pass2.remainingSourceAnimalsCount).toBe(0);

    const goatHerd = buildSpeciesHerdMap(pass2.snapshot.animals, 'Goat');
    expect(goatHerd.get('k')?.sireId).toBe('s');
    expect(goatHerd.get('k')?.damId).toBe('d');
  });

  it('migrates an entire species including Archived stock, photos, breedings, tasks, cages & shows', () => {
    const activeBuck = makeAnimal('ab', { species: 'Rabbit', sex: 'Male', status: 'Active' });
    const archivedDoe = makeAnimal('ad', { species: 'Rabbit', sex: 'Female', status: 'Archived' });
    const sheepBuck = makeAnimal('sb', { species: 'Sheep', sex: 'Male', status: 'Active' });

    const snap = makeEmptySnapshot({
      speciesProfiles: [makeSpeciesProfile('Rabbit'), makeSpeciesProfile('Sheep')],
      animals: [activeBuck, archivedDoe, sheepBuck],
      animalPhotos: [
        {
          id: 'ph1',
          species: 'Rabbit',
          animalId: 'ab',
          isPrimary: true,
          sortOrder: 0,
          caption: 'Front',
          originalFileName: 'a.jpg',
          mimeType: 'image/webp',
          width: 100,
          height: 100,
          originalBytes: 1000,
          storedBytes: 400,
          thumbnailDataUrl: 'data:image/webp;base64,AA==',
          dataUrl: 'data:image/webp;base64,AA==',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      breedings: [
        {
          id: 'br1',
          species: 'Rabbit',
          sireId: 'ab',
          damId: 'ad',
          sireName: activeBuck.name,
          damName: archivedDoe.name,
          bredDateIso: '2026-01-10',
          expectedDueDateIso: '2026-02-10',
          actualBirthDateIso: '',
          projectedCoiPercent: 0,
          liveCount: 0,
          stillbornCount: 0,
          fosteredCount: 0,
          weanedCount: 0,
          offspringCreated: false,
          status: 'Bred',
          notes: '',
          createdAt: '2026-01-10T00:00:00.000Z',
          updatedAt: '2026-01-10T00:00:00.000Z',
        },
      ],
      tasks: [
        {
          id: 't1',
          species: 'Rabbit',
          title: 'Palpate Doe',
          category: 'Palpation',
          priority: 'High',
          dueDateIso: '2026-01-24',
          linkedAnimalId: 'ad',
          linkedAnimalName: archivedDoe.name,
          linkedBreedingId: 'br1',
          completed: false,
          createdAt: '2026-01-10T00:00:00.000Z',
          updatedAt: '2026-01-10T00:00:00.000Z',
        },
      ],
      cages: [
        {
          id: 'cg1',
          species: 'Rabbit',
          label: 'R-1',
          section: 'Main',
          capacity: 1,
          notes: '',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      shows: [
        {
          id: 'sh1',
          species: 'Rabbit',
          name: 'Spring Fair',
          location: 'Fairgrounds',
          sanctioningBody: 'ARBA',
          eventDateIso: '2026-04-01',
          entryDeadlineIso: '2026-03-15',
          enteredAnimalIds: ['ab'],
          notes: '',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    // Migrate Rabbit -> Angora (creates custom target profile)
    const result = migrateAnimalsToSpecies(snap, [], 'Angora', {
      migrateEntireSpecies: true,
      sourceSpeciesName: 'Rabbit',
    });

    expect(result.createdTargetProfile).toBe(true);
    expect(result.animalsMigrated).toBe(2);
    expect(result.photosMigrated).toBe(1);
    expect(result.breedingsMigrated).toBe(1);
    expect(result.tasksMigrated).toBe(1);
    expect(result.cagesMigratedOrAdded).toBe(1);
    expect(result.showsUpdated).toBe(1);
    expect(result.remainingSourceRecordsCount).toBe(0);
    // Unrelated Sheep remains untouched
    expect(result.snapshot.animals.find((a) => a.id === 'sb')?.species).toBe('Sheep');
  });
});
```

## `src/core/__tests__/stageBResilience.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { makeAnimal, makeEmptySnapshot } from './testFixtures';
import {
  analyzePhotoStorageFootprintPure,
  OVERSIZED_PHOTO_BYTES_THRESHOLD,
  pruneFullResPayloadsFromSnapshotPure,
  removeOrphanPhotosFromSnapshotPure,
} from '../photoMaintenance';
import {
  inspectParsedArchiveBeforeRestorePure,
  inspectSnapshotBeforeRestorePure,
} from '../archiveInspector';
import {
  buildCompleteBackupZipArchive,
  mergePhotosOnlyIntoSnapshot,
  parseBackupArchiveInput,
} from '../backupArchive';
import {
  ENCRYPTED_ENVELOPE_FORMAT,
  EncryptedPayloadEnvelope,
  tryExtractEncryptedEnvelopeFromZip,
  tryParseEncryptedEnvelopeJson,
  wrapEncryptedZipContainer,
} from '../encryptedExport';
import {
  buildDeterministicGoogleCalendarEventId,
  buildGoogleCalendarEventPayload,
} from '../calendarExport';
import {
  bumpRecordRevision,
  compareSameEntitySyncOperations,
  createOutboxOperation,
  diffEntityFieldsToOperations,
  diffSnapshotsToSyncOperations,
  mergeDeltaOperations,
  stripPhotoBlobsForSync,
} from '../syncOutbox';
import { migrateAnimalsToSpecies } from '../speciesMigration';
import { mergeBarnSnapshots } from '../syncAndExports';
import { AnimalPhoto, BarnTask } from '../models';

function makeFakeBase64DataUrl(byteSize: number, mime = 'image/jpeg'): string {
  const b64Len = Math.ceil((byteSize * 4) / 3);
  return `data:${mime};base64,${'A'.repeat(b64Len)}`;
}

describe('Stage B pure domain features (IMP-023)', () => {
  describe('photoMaintenance — footprint analyzer, orphan cleanup, and full-res compaction', () => {
    it('audits per-species photo storage, removes orphan photos safely, and compacts full-res payloads to thumbnails', () => {
      const buck = makeAnimal('buck-1', { species: 'Rabbit', tattoo: 'BR1', sex: 'Male' });
      const ewe = makeAnimal('ewe-1', { species: 'Sheep', tattoo: 'SH1', sex: 'Female' });

      const thumbUrl = makeFakeBase64DataUrl(4 * 1024);
      const normalFullUrl = makeFakeBase64DataUrl(90 * 1024);
      const oversizedUrl = makeFakeBase64DataUrl(OVERSIZED_PHOTO_BYTES_THRESHOLD + 60 * 1024);

      const photos: AnimalPhoto[] = [
        {
          id: 'ph-rabbit',
          species: 'Rabbit',
          animalId: buck.id,
          isPrimary: true,
          sortOrder: 0,
          caption: 'Show pose',
          originalFileName: 'buck.jpg',
          mimeType: 'image/jpeg',
          width: 1200,
          height: 900,
          originalBytes: 900_000,
          storedBytes: 90 * 1024,
          thumbnailDataUrl: thumbUrl,
          dataUrl: normalFullUrl,
          _rev: 1,
          createdAt: '2026-02-01T10:00:00.000Z',
          updatedAt: '2026-02-01T10:00:00.000Z',
        },
        {
          id: 'ph-sheep-big',
          species: 'Sheep',
          animalId: ewe.id,
          isPrimary: true,
          sortOrder: 0,
          caption: 'Fleece check',
          originalFileName: 'ewe.jpg',
          mimeType: 'image/jpeg',
          width: 3200,
          height: 2400,
          originalBytes: 2_500_000,
          storedBytes: OVERSIZED_PHOTO_BYTES_THRESHOLD + 60 * 1024,
          thumbnailDataUrl: thumbUrl,
          dataUrl: oversizedUrl,
          _rev: 2,
          createdAt: '2026-02-01T10:00:00.000Z',
          updatedAt: '2026-02-01T10:00:00.000Z',
        },
        {
          id: 'ph-orphan',
          species: 'Rabbit',
          animalId: 'deleted-animal-xyz',
          isPrimary: false,
          sortOrder: 1,
          caption: 'Orphan pic',
          originalFileName: 'orphan.jpg',
          mimeType: 'image/jpeg',
          width: 800,
          height: 600,
          originalBytes: 300_000,
          storedBytes: 50 * 1024,
          thumbnailDataUrl: thumbUrl,
          dataUrl: makeFakeBase64DataUrl(50 * 1024),
          _rev: 1,
          createdAt: '2026-02-01T10:00:00.000Z',
          updatedAt: '2026-02-01T10:00:00.000Z',
        },
      ];

      const snap = makeEmptySnapshot({
        animals: [buck, ewe],
        animalPhotos: photos,
      });

      const report = analyzePhotoStorageFootprintPure(snap, 'balanced');
      expect(report.totalPhotoCount).toBe(3);
      expect(report.orphanPhotoIds).toEqual(['ph-orphan']);
      expect(report.oversizedPhotoIds).toEqual(['ph-sheep-big']);
      expect(report.fullResPrunableIds).toEqual(['ph-rabbit', 'ph-sheep-big']);
      expect(report.speciesBreakdown.map((s) => s.species)).toEqual(['Sheep', 'Rabbit']);
      expect(report.estimatedReclaimableFullResBytes).toBeGreaterThan(500 * 1024);

      const orphanClean = removeOrphanPhotosFromSnapshotPure(snap);
      expect(orphanClean.removedCount).toBe(1);
      expect(orphanClean.removedPhotoIds).toEqual(['ph-orphan']);
      expect(orphanClean.reclaimedBytes).toBeGreaterThanOrEqual(50 * 1024);
      expect(orphanClean.nextSnapshot.animalPhotos?.map((p) => p.id)).toEqual([
        'ph-rabbit',
        'ph-sheep-big',
      ]);

      const pruned = pruneFullResPayloadsFromSnapshotPure(orphanClean.nextSnapshot);
      expect(pruned.prunedCount).toBe(2);
      expect(pruned.reclaimedBytes).toBeGreaterThan(500 * 1024);
      for (const p of pruned.nextSnapshot.animalPhotos ?? []) {
        expect(p.dataUrl).toBe(p.thumbnailDataUrl);
        expect(p._rev).toBeGreaterThan(1);
      }

      // Re-running compaction is a clean no-op
      const secondRun = pruneFullResPayloadsFromSnapshotPure(pruned.nextSnapshot);
      expect(secondRun.prunedCount).toBe(0);
    });
  });

  describe('archiveInspector — dry-run species breakdown, conflict preview, and replace/merge impact', () => {
    it('inspects ZIP backups without mutating current barn state and computes replace vs merge deltas', () => {
      const sharedBuck = makeAnimal('buck-shared', {
        name: 'Shared Buck',
        tattoo: 'DUP1',
        sex: 'Male',
        status: 'Active',
      });
      const localOnlyDoe = makeAnimal('doe-local', {
        name: 'Local Only Doe',
        tattoo: 'LOC1',
        sex: 'Female',
      });
      const incomingDupBuck = makeAnimal('buck-dup', {
        name: 'Duplicate Tattoo Buck',
        tattoo: 'DUP1',
        sex: 'Male',
      });
      const incomingArchived = makeAnimal('ewe-arch', {
        species: 'Sheep',
        name: 'Archived Ewe',
        tattoo: 'SH9',
        sex: 'Female',
        status: 'Sold',
        archived: true,
      });

      const current = makeEmptySnapshot({
        animals: [sharedBuck, localOnlyDoe],
      });
      const incoming = makeEmptySnapshot({
        animals: [sharedBuck, incomingDupBuck, incomingArchived],
      });

      const zipArchive = buildCompleteBackupZipArchive(incoming);
      const parsed = parseBackupArchiveInput(zipArchive.bytes, 'barn-backup.zip', current.settings);
      const inspection = inspectParsedArchiveBeforeRestorePure(parsed, current, {
        fileName: 'barn-backup.zip',
        encrypted: false,
      });

      expect(inspection.sourceFormat).toBe('zip');
      expect(inspection.animalCount).toBe(3);
      expect(inspection.activeAnimalCount).toBe(2);
      expect(inspection.archivedAnimalCount).toBe(1);
      expect(inspection.duplicateTattooCount).toBe(2);
      expect(inspection.speciesBreakdown.find((s) => s.species === 'Rabbit')?.animalCount).toBe(2);
      expect(inspection.speciesBreakdown.find((s) => s.species === 'Sheep')?.animalCount).toBe(1);

      expect(inspection.replaceImpact).toEqual({
        currentAnimalCount: 2,
        currentPhotoCount: 0,
        netAnimalDelta: 1,
        currentAnimalsNotInIncoming: 1,
      });
      expect(inspection.mergeImpact).toEqual({
        newAnimalsToAdd: 2,
        existingAnimalsMatched: 1,
        newPhotosToAdd: 0,
        existingPhotosMatched: 0,
      });
    });

    it('summarizes snapshots directly for SQLite pre-restore dry-run inspection', () => {
      const a1 = makeAnimal('a1', { tattoo: 'T1', sex: 'Male' });
      const snap = makeEmptySnapshot({ animals: [a1] });
      const insp = inspectSnapshotBeforeRestorePure(snap, null, {
        fileName: 'barn.sqlite',
        sourceFormat: 'sqlite',
      });
      expect(insp.sourceFormat).toBe('sqlite');
      expect(insp.animalCount).toBe(1);
      expect(insp.replaceImpact).toBeNull();
      expect(insp.mergeImpact).toBeNull();
    });
  });

  describe('syncOutbox monotonic _rev counters & clock-rewind safety', () => {
    it('lets higher record_rev beat an earlier wall-clock timestamp when comparing ops on the same entity', () => {
      const olderRevOp = createOutboxOperation({
        entityType: 'animal',
        entityUuid: 'ani-1',
        deviceId: 'dev-a',
        logicalCounter: 5,
        fieldName: 'weightGrams',
        newValue: 3800,
        timestamp: '2026-06-10T15:00:00.000Z',
        recordRev: 2,
      });
      const newerRevRewoundClockOp = createOutboxOperation({
        entityType: 'animal',
        entityUuid: 'ani-1',
        deviceId: 'dev-b',
        logicalCounter: 6,
        fieldName: 'weightGrams',
        newValue: 4100,
        // Device B's wall clock was rewound to 2025, yet record_rev advanced to 3!
        timestamp: '2025-01-01T08:00:00.000Z',
        recordRev: 3,
      });

      expect(compareSameEntitySyncOperations(olderRevOp, newerRevRewoundClockOp)).toBeLessThan(0);

      const startAnimal = makeAnimal('ani-1', { weightGrams: 3800, _rev: 2 });
      const localSnap = makeEmptySnapshot({ animals: [startAnimal] });

      const mergeResult = mergeDeltaOperations(
        localSnap,
        [olderRevOp],
        [newerRevRewoundClockOp],
        'dev-a'
      );

      const updated = mergeResult.nextSnapshot.animals.find((a) => a.id === 'ani-1');
      expect(updated?.weightGrams).toBe(4100);
      expect(updated?._rev).toBe(3);
      expect(mergeResult.newConflicts).toHaveLength(1);
      expect(mergeResult.newConflicts[0]?.winning_value).toBe(4100);
    });

    it('bumps _rev cleanly and propagates record_rev on field diffs', () => {
      const prev = makeAnimal('ani-2', { weightGrams: 3000, _rev: 4 });
      const rev = bumpRecordRevision(prev);
      expect(rev).toBe(5);
      const next = { ...prev, weightGrams: 3250, _rev: rev };

      let counter = 10;
      const ops = diffEntityFieldsToOperations({
        entityType: 'animal',
        previous: prev,
        next,
        deviceId: 'dev-a',
        nextCounter: () => ++counter,
        timestamp: '2026-06-01T12:00:00.000Z',
        recordRev: rev,
      });

      expect(ops).toHaveLength(1);
      expect(ops[0]?.field_name).toBe('weightGrams');
      expect(ops[0]?.record_rev).toBe(5);
    });

    it('propagates __delete__ outbox ops across cages, breedings, tasks, careLogs, shows, photos, and species', () => {
      const snap = makeEmptySnapshot({
        cages: [
          {
            id: 'c-1',
            species: 'Rabbit',
            label: 'R-1',
            section: 'Main',
            capacity: 1,
            notes: '',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        breedings: [
          {
            id: 'b-1',
            species: 'Rabbit',
            sireId: 's-1',
            damId: 'd-1',
            sireName: 'S',
            damName: 'D',
            bredDateIso: '2026-01-01',
            expectedDueDateIso: '2026-02-01',
            actualBirthDateIso: '',
            projectedCoiPercent: 0,
            liveCount: 0,
            stillbornCount: 0,
            fosteredCount: 0,
            weanedCount: 0,
            offspringCreated: false,
            status: 'Bred',
            notes: '',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        tasks: [
          {
            id: 't-1',
            species: 'Rabbit',
            title: 'Place Nestbox',
            dueDateIso: '2026-01-28',
            priority: 'High',
            category: 'Nestbox',
            linkedAnimalId: '',
            linkedAnimalName: '',
            linkedBreedingId: 'b-1',
            completed: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        careLogs: [
          {
            id: 'l-1',
            species: 'Rabbit',
            animalId: 'a-1',
            dateIso: '2026-01-02',
            type: 'Weight Check',
            title: 'Monthly weigh-in',
            weightGrams: 1800,
            showLegEarned: false,
            notes: '',
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
        shows: [
          {
            id: 'sh-1',
            species: 'Rabbit',
            name: 'Spring Classic',
            location: 'Barn',
            sanctioningBody: 'ARBA',
            eventDateIso: '2026-04-01',
            entryDeadlineIso: '2026-03-25',
            enteredAnimalIds: [],
            notes: '',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        animalPhotos: [
          {
            id: 'ph-1',
            species: 'Rabbit',
            animalId: 'a-1',
            isPrimary: true,
            sortOrder: 0,
            caption: 'Profile',
            originalFileName: 'clover.webp',
            mimeType: 'image/webp',
            width: 800,
            height: 600,
            originalBytes: 120000,
            storedBytes: 32000,
            thumbnailDataUrl: 'data:image/webp;base64,AAA=',
            dataUrl: 'data:image/webp;base64,BBBB',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        speciesProfiles: [
          {
            id: 'sp-1',
            name: 'Rabbit',
            gestationDays: 31,
            rebreedDaysAfterBirth: 28,
            weanDaysAfterBirth: 42,
            birthEventLabel: 'Kindling',
            maleLabel: 'Buck',
            femaleLabel: 'Doe',
            offspringLabel: 'Kit',
            exampleBreeds: ['Holland Lop'],
            milestones: [],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

      const ts = '2026-02-01T12:00:00.000Z';
      const deleteOps = [
        createOutboxOperation({
          entityType: 'cage',
          entityUuid: 'c-1',
          deviceId: 'dev-b',
          logicalCounter: 1,
          fieldName: '__delete__',
          newValue: true,
          timestamp: ts,
          recordRev: 2,
        }),
        createOutboxOperation({
          entityType: 'breeding',
          entityUuid: 'b-1',
          deviceId: 'dev-b',
          logicalCounter: 2,
          fieldName: '__delete__',
          newValue: true,
          timestamp: ts,
          recordRev: 2,
        }),
        createOutboxOperation({
          entityType: 'task',
          entityUuid: 't-1',
          deviceId: 'dev-b',
          logicalCounter: 3,
          fieldName: '__delete__',
          newValue: true,
          timestamp: ts,
          recordRev: 2,
        }),
        createOutboxOperation({
          entityType: 'careLog',
          entityUuid: 'l-1',
          deviceId: 'dev-b',
          logicalCounter: 4,
          fieldName: '__delete__',
          newValue: true,
          timestamp: ts,
          recordRev: 2,
        }),
        createOutboxOperation({
          entityType: 'show',
          entityUuid: 'sh-1',
          deviceId: 'dev-b',
          logicalCounter: 5,
          fieldName: '__delete__',
          newValue: true,
          timestamp: ts,
          recordRev: 2,
        }),
        createOutboxOperation({
          entityType: 'photo',
          entityUuid: 'ph-1',
          deviceId: 'dev-b',
          logicalCounter: 6,
          fieldName: '__delete__',
          newValue: true,
          timestamp: ts,
          recordRev: 2,
        }),
        createOutboxOperation({
          entityType: 'species',
          entityUuid: 'sp-1',
          deviceId: 'dev-b',
          logicalCounter: 7,
          fieldName: '__delete__',
          newValue: true,
          timestamp: ts,
          recordRev: 2,
        }),
      ];

      const merged = mergeDeltaOperations(snap, [], deleteOps, 'dev-a');
      expect(merged.appliedOpCount).toBe(7);
      expect(merged.nextSnapshot.cages).toHaveLength(0);
      expect(merged.nextSnapshot.breedings).toHaveLength(0);
      expect(merged.nextSnapshot.tasks).toHaveLength(0);
      expect(merged.nextSnapshot.careLogs).toHaveLength(0);
      expect(merged.nextSnapshot.shows).toHaveLength(0);
      expect(merged.nextSnapshot.animalPhotos).toHaveLength(0);
      expect(merged.nextSnapshot.speciesProfiles).toHaveLength(0);
    });

    it('syncs metadata-only photo ops cleanly without binary blobs and hydrates blobs from ZIP/JSON restores', () => {
      const fullPhoto: AnimalPhoto = {
        id: 'ph-meta-1',
        species: 'Rabbit',
        animalId: 'ani-1',
        isPrimary: true,
        sortOrder: 0,
        caption: 'Initial pose',
        originalFileName: 'buck.webp',
        mimeType: 'image/webp',
        width: 1280,
        height: 960,
        originalBytes: 1_200_000,
        storedBytes: 88_000,
        thumbnailDataUrl: 'data:image/webp;base64,AAAA',
        dataUrl: 'data:image/webp;base64,BBBBBBBB',
        _rev: 1,
        createdAt: '2026-06-01T10:00:00.000Z',
        updatedAt: '2026-06-01T10:00:00.000Z',
      };

      const stripped = stripPhotoBlobsForSync(fullPhoto);
      expect(stripped.dataUrl).toBe('');
      expect(stripped.thumbnailDataUrl).toBe('');

      const createOp = createOutboxOperation({
        entityType: 'photo',
        entityUuid: stripped.id,
        deviceId: 'dev-a',
        logicalCounter: 1,
        fieldName: '__create__',
        newValue: stripped,
        timestamp: '2026-06-01T10:00:00.000Z',
        recordRev: 1,
      });

      const unsafeSvgOp = createOutboxOperation({
        entityType: 'photo',
        entityUuid: 'ph-xss',
        deviceId: 'dev-a',
        logicalCounter: 2,
        fieldName: '__create__',
        newValue: {
          ...stripped,
          id: 'ph-xss',
          dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
        },
        timestamp: '2026-06-01T10:00:00.000Z',
        recordRev: 1,
      });

      const peerBase = makeEmptySnapshot({
        animals: [makeAnimal('ani-1', { name: 'Clover', species: 'Rabbit' })],
      });
      const afterDelta = mergeDeltaOperations(peerBase, [], [createOp, unsafeSvgOp], 'dev-b');
      expect(afterDelta.nextSnapshot.animalPhotos).toHaveLength(1);
      const syncedPhoto = afterDelta.nextSnapshot.animalPhotos![0];
      expect(syncedPhoto.id).toBe('ph-meta-1');
      expect(syncedPhoto.dataUrl).toBe('');
      expect(syncedPhoto.caption).toBe('Initial pose');

      // Peer updates caption locally at a later timestamp before ZIP blob restore arrives
      const peerEditedSnap = {
        ...afterDelta.nextSnapshot,
        animalPhotos: [
          {
            ...syncedPhoto,
            caption: 'Renamed on Device B',
            _rev: 2,
            updatedAt: '2026-06-01T12:00:00.000Z',
          },
        ],
      };

      const rehydrated = mergePhotosOnlyIntoSnapshot(peerEditedSnap, [fullPhoto]);
      expect(rehydrated.photosUpdated).toBe(1);
      expect(rehydrated.nextSnapshot.animalPhotos?.[0]?.dataUrl).toBe('data:image/webp;base64,BBBBBBBB');
      expect(rehydrated.nextSnapshot.animalPhotos?.[0]?.caption).toBe('Renamed on Device B');

      const mergedJson = mergeBarnSnapshots(peerEditedSnap, makeEmptySnapshot({
        animals: peerEditedSnap.animals,
        animalPhotos: [fullPhoto],
      }));
      expect(mergedJson.snapshot.animalPhotos?.[0]?.dataUrl).toBe('data:image/webp;base64,BBBBBBBB');
      expect(mergedJson.snapshot.animalPhotos?.[0]?.caption).toBe('Renamed on Device B');
    });

    it('emits zero-blob outbox operations with bumped _rev values for cross-species migrations', () => {
      const rabbit = makeAnimal('r-1', { species: 'Rabbit', name: 'Hop', _rev: 2 });
      const photo: AnimalPhoto = {
        id: 'ph-r1',
        species: 'Rabbit',
        animalId: 'r-1',
        isPrimary: true,
        sortOrder: 0,
        caption: 'Profile',
        originalFileName: 'hop.webp',
        mimeType: 'image/webp',
        width: 800,
        height: 600,
        originalBytes: 100_000,
        storedBytes: 30_000,
        thumbnailDataUrl: 'data:image/webp;base64,THUMB',
        dataUrl: 'data:image/webp;base64,FULLDATA',
        _rev: 1,
        createdAt: '2026-06-01T10:00:00.000Z',
        updatedAt: '2026-06-01T10:00:00.000Z',
      };
      const baseSnap = makeEmptySnapshot({
        animals: [rabbit],
        animalPhotos: [photo],
      });

      const migrated = migrateAnimalsToSpecies(baseSnap, ['r-1'], 'Guinea Pig');
      expect(migrated.snapshot.animals[0]?._rev).toBe(3);
      expect(migrated.snapshot.animalPhotos?.[0]?._rev).toBe(2);

      let counter = 100;
      const ops = diffSnapshotsToSyncOperations({
        previous: baseSnap,
        next: migrated.snapshot,
        deviceId: 'dev-a',
        nextCounter: () => ++counter,
        timestamp: '2026-06-02T09:00:00.000Z',
      });

      expect(ops.some((op) => op.entity_type === 'animal' && op.field_name === 'species' && op.new_value === 'Guinea Pig' && op.record_rev === 3)).toBe(true);
      expect(ops.some((op) => op.entity_type === 'photo' && op.field_name === 'species' && op.new_value === 'Guinea Pig' && op.record_rev === 2)).toBe(true);
      expect(JSON.stringify(ops)).not.toContain('FULLDATA');
      expect(JSON.stringify(ops)).not.toContain('THUMB');

      const peerMerged = mergeDeltaOperations(baseSnap, [], ops, 'dev-b');
      expect(peerMerged.nextSnapshot.animals[0]?.species).toBe('Guinea Pig');
      expect(peerMerged.nextSnapshot.animalPhotos?.[0]?.species).toBe('Guinea Pig');
      // Peer keeps its existing binary image payload intact!
      expect(peerMerged.nextSnapshot.animalPhotos?.[0]?.dataUrl).toBe('data:image/webp;base64,FULLDATA');
    });
  });

  describe('calendarExport deterministic Google Calendar event IDs', () => {
    it('generates Google Calendar compliant [a-v0-9] deterministic IDs per task UUID', () => {
      const idA1 = buildDeterministicGoogleCalendarEventId('task-uuid-abc-123');
      const idA2 = buildDeterministicGoogleCalendarEventId('task-uuid-abc-123');
      const idB = buildDeterministicGoogleCalendarEventId('task-uuid-xyz-999');

      expect(idA1).toBe(idA2);
      expect(idA1).not.toBe(idB);
      expect(idA1).toMatch(/^[a-v0-9]{10,64}$/);

      const task: BarnTask = {
        id: 'task-uuid-abc-123',
        species: 'Rabbit',
        title: 'Place Nestbox',
        dueDateIso: '2026-05-12',
        priority: 'High',
        category: 'Nestbox',
        linkedAnimalId: '',
        linkedAnimalName: '',
        linkedBreedingId: '',
        completed: false,
        createdAt: '2026-05-01T10:00:00.000Z',
        updatedAt: '2026-05-01T10:00:00.000Z',
      };
      const payload = buildGoogleCalendarEventPayload(task);
      expect(payload?.id).toBe(idA1);
    });
  });

  describe('encryptedExport — envelope validation & ZIP wrapper round-trip', () => {
    it('wraps and extracts encrypted payload envelopes cleanly inside standard ZIP archives', () => {
      const sampleEnvelope: EncryptedPayloadEnvelope = {
        format: ENCRYPTED_ENVELOPE_FORMAT,
        cipher: 'AES-256-GCM',
        kdf: 'PBKDF2-SHA256',
        iterations: 210_000,
        saltBase64: 'AAAAAAAAAAAAAAAAAAAAAA==',
        ivBase64: 'AAAAAAAAAAAAAAAA',
        payloadKind: 'zip_archive',
        originalFileName: 'barn.zip',
        createdAtIso: '2026-05-01T00:00:00.000Z',
        ciphertextBase64: 'BBBBBBBB',
      };

      const rawJson = JSON.stringify(sampleEnvelope);
      expect(tryParseEncryptedEnvelopeJson(rawJson)?.format).toBe(ENCRYPTED_ENVELOPE_FORMAT);
      expect(tryParseEncryptedEnvelopeJson('{"plain":true}')).toBeNull();

      const zipBytes = wrapEncryptedZipContainer(sampleEnvelope, 'barn.zip');
      const extracted = tryExtractEncryptedEnvelopeFromZip(zipBytes, 'barn-encrypted.zip');
      expect(extracted).toEqual(sampleEnvelope);

      const plainZip = buildCompleteBackupZipArchive(makeEmptySnapshot());
      expect(tryExtractEncryptedEnvelopeFromZip(plainZip.bytes, 'plain.zip')).toBeNull();
    });
  });
});
```

## `src/core/__tests__/suggestionsBacklog.test.ts`

````typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCapturedIdeasJsonExport,
  buildCapturedIdeasMarkdownExport,
  formatSanitizedIdeaForDisplay,
  getBacklogSectionSeverityDescription,
  isValidCapturedIdeaEntry,
  MAX_CAPTURED_IDEA_LENGTH,
  parseSuggestionsBacklogMarkdown,
  sanitizeIdeaInput,
  SUGGESTIONS_BACKLOG_PATH,
} from '../suggestionsBacklog';

describe('suggestionsBacklog — markdown parser, idea sanitization & exports', () => {
  it('parses the repository /docs/plans/suggestions-backlog.md cleanly without raw markdown clutter', () => {
    const backlogPath = path.resolve(process.cwd(), 'docs/plans/suggestions-backlog.md');
    const rawMarkdown = fs.readFileSync(backlogPath, 'utf8');
    const parsed = parseSuggestionsBacklogMarkdown(rawMarkdown);

    expect(SUGGESTIONS_BACKLOG_PATH).toBe('/docs/plans/suggestions-backlog.md');
    expect(parsed.isEmpty).toBe(false);
    expect(parsed.totalItems).toBe(6);
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].title).toContain('Priority 4');
    expect(parsed.sections[0].items).toHaveLength(6);

    const firstItem = parsed.sections[0].items[0];
    expect(firstItem.number).toBe(1);
    expect(firstItem.title).toBe(
      'Founder Loss / Heritability Analytics & Interactive Barn Scheduler Gantt'
    );
    expect(firstItem.codeTag).toBeNull();
    expect(firstItem.details.length).toBeGreaterThan(0);

    for (const section of parsed.sections) {
      expect(section.title).not.toContain('**');
      for (const item of section.items) {
        expect(item.title).not.toContain('**');
        for (const detail of item.details) {
          expect(detail.text).not.toContain('**');
        }
      }
    }
  });

  it('handles empty or whitespace-only backlog files gracefully', () => {
    const emptyParsed = parseSuggestionsBacklogMarkdown('');
    expect(emptyParsed.isEmpty).toBe(true);
    expect(emptyParsed.totalItems).toBe(0);
    expect(emptyParsed.sections).toEqual([]);

    const blankParsed = parseSuggestionsBacklogMarkdown('   \n\n  ');
    expect(blankParsed.isEmpty).toBe(true);
    expect(blankParsed.sections).toEqual([]);
  });

  it('sanitizes idea inputs by stripping scripts/tags, control chars, normalizing whitespace, escaping entities, and enforcing caps', () => {
    const dirty =
      '  # <script>alert(1)</script><b>Track</b>   feed\u0000\u202E  costs & "yields"\n\n### Inject\t```code```  ';
    const result = sanitizeIdeaInput(dirty);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.truncated).toBe(false);
    expect(result.sanitizedText).not.toContain('<script>');
    expect(result.sanitizedText).not.toContain('<b>');
    expect(result.sanitizedText).not.toContain('\u0000');
    expect(result.sanitizedText).not.toContain('\u202E');
    expect(result.sanitizedText).not.toContain('\n');
    expect(result.sanitizedText).toContain('&amp;');
    expect(result.sanitizedText).toContain('&quot;yields&quot;');
    expect(formatSanitizedIdeaForDisplay(result.sanitizedText)).toBe(
      'Track feed costs & "yields" ### Inject code'
    );

    const angleInput = sanitizeIdeaInput('Keep weights < 12 lbs & > 2 oz');
    expect(angleInput.ok).toBe(true);
    if (angleInput.ok) {
      expect(angleInput.sanitizedText).toBe('Keep weights &lt; 12 lbs &amp; &gt; 2 oz');
      expect(formatSanitizedIdeaForDisplay(angleInput.sanitizedText)).toBe(
        'Keep weights < 12 lbs & > 2 oz'
      );
    }
  });

  it('rejects empty/too-short idea inputs and truncates over-limit entries cleanly', () => {
    expect(sanitizeIdeaInput('').ok).toBe(false);
    expect(sanitizeIdeaInput('  ab  ').ok).toBe(false);
    expect(sanitizeIdeaInput('<script>evil()</script>').ok).toBe(false);

    const longText = 'a'.repeat(MAX_CAPTURED_IDEA_LENGTH + 150);
    const capped = sanitizeIdeaInput(longText);
    expect(capped.ok).toBe(true);
    if (capped.ok) {
      expect(capped.truncated).toBe(true);
      expect(capped.sanitizedText.length).toBe(MAX_CAPTURED_IDEA_LENGTH);
    }
  });

  it('builds valid Markdown and JSON exports for captured ideas', () => {
    const entries = [
      {
        id: 'idea-1',
        text: 'Add show carrier ledger &amp; print tag',
        createdAtIso: '2026-11-20T16:00:00.000Z',
      },
    ];
    expect(isValidCapturedIdeaEntry(entries[0])).toBe(true);
    expect(isValidCapturedIdeaEntry({ id: '', text: 'x', createdAtIso: '' })).toBe(false);

    const md = buildCapturedIdeasMarkdownExport(entries, '2026-11-20T16:30:00.000Z');
    expect(md).toContain('# Community Pedigree — Pending Captured Ideas');
    expect(md).toContain('1. [2026-11-20T16:00:00.000Z] Add show carrier ledger &amp; print tag');

    const json = JSON.parse(buildCapturedIdeasJsonExport(entries, '2026-11-20T16:30:00.000Z'));
    expect(json.format).toBe('community-pedigree-captured-ideas');
    expect(json.count).toBe(1);
    expect(json.ideas[0].id).toBe('idea-1');
  });

  it('returns brief severity explanations for each backlog priority tier', () => {
    expect(
      getBacklogSectionSeverityDescription({
        title: 'Priority 1: Critical Reliability',
        subtitle: null,
      })
    ).toContain('Critical');
    expect(
      getBacklogSectionSeverityDescription({
        title: 'Priority 3: Low-Severity Polish, UX Resilience & Pedigree/Analytics Upgrades',
        subtitle: null,
      })
    ).toContain('Low-severity');
    expect(
      getBacklogSectionSeverityDescription({
        title: 'Priority 4: Specialized Operations, OCR Pipelines, Economics, CRM & Optional Cloud',
        subtitle: null,
      })
    ).toContain('OCR');
    expect(
      getBacklogSectionSeverityDescription({
        title: 'Custom Section',
        subtitle: 'Custom brief scope',
      })
    ).toBe('Custom brief scope');
  });
});
````

## `src/core/__tests__/supportBundle.test.ts`

```typescript
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFullPredefinedSampleSnapshot } from '../sampleData';
import {
  buildErrorLogsJson,
  buildSupportBundleZipArchive,
  buildSupportMailtoHref,
  DiagnosticLogEntry,
  DiagnosticSummary,
  formatSupportReportText,
} from '../supportBundle';

function collectCoreTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...collectCoreTsFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('src/core/ isolation & supportBundle', () => {
  it('enforces zero upward imports from src/core/ into storage/, hooks/, components/, or utils/', () => {
    const coreDir = resolve(process.cwd(), 'src/core');
    const files = collectCoreTsFiles(coreDir);
    expect(files.length).toBeGreaterThan(10);

    const forbiddenImportPattern =
      /(?:from|import)\s+['"][^'"]*(?:\/storage\/|\/hooks\/|\/components\/|\/utils\/)['"]/g;
    const violations: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const matches = content.match(forbiddenImportPattern);
      if (matches && matches.length > 0) {
        violations.push(`${file}: ${matches.join(', ')}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('builds diagnostic text report, JSON log payload, mailto link, and ZIP archive purely in core', () => {
    const snapshot = buildFullPredefinedSampleSnapshot();
    const summary: DiagnosticSummary = {
      totalEntries: 1,
      errorCount: 1,
      memoryWarningCount: 0,
      crashCount: 0,
      oldestEntryIso: '2026-11-18T12:00:00.000Z',
      newestEntryIso: '2026-11-18T12:00:00.000Z',
      currentMemory: {
        usedHeapBytes: 12 * 1024 * 1024,
        totalHeapBytes: 24 * 1024 * 1024,
        heapLimitBytes: 1024 * 1024 * 1024,
        heapPercent: 1.2,
        deviceMemoryGb: 8,
      },
      config: {
        verboseEnabled: true,
        retentionDays: 7,
        supportEmail: '',
      },
      sessionId: 'sess-test',
      userAgent: 'Vitest',
      platformInfo: '1280x800 @1x · 8 cores',
    };
    const entries: DiagnosticLogEntry[] = [
      {
        id: 'log-1',
        timestampIso: '2026-11-18T12:00:00.000Z',
        timestampMs: 1795003200000,
        sessionId: 'sess-test',
        level: 'error',
        category: 'storage',
        route: 'settings',
        message: 'Sample diagnostic event',
      },
    ];

    const reportText = formatSupportReportText(entries, summary, snapshot);
    expect(reportText).toContain('Sample diagnostic event');
    expect(reportText).toContain('Errors/Fatal: 1');

    const logsJson = JSON.parse(buildErrorLogsJson(entries, summary, snapshot)) as {
      format: string;
      entries: DiagnosticLogEntry[];
    };
    expect(logsJson.format).toBe('community-pedigree-diagnostics-v1');
    expect(logsJson.entries).toHaveLength(1);

    const zipResult = buildSupportBundleZipArchive({
      entries,
      summary,
      snapshot,
      includeData: true,
      includePhotos: false,
    });
    expect(zipResult.bytes.byteLength).toBeGreaterThan(100);
    expect(zipResult.includedData).toBe(true);
    expect(zipResult.includedPhotos).toBe(false);

    const mailto = buildSupportMailtoHref({
      recipientEmail: 'support@example.com',
      filename: zipResult.filename,
      summary,
      includedData: true,
      includedPhotos: false,
    });
    expect(mailto).toContain('mailto:support%40example.com');
  });
});
```

## `src/core/__tests__/syncAndExports.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  applyAnimalNamePrefix,
  formatWeight,
  getSpeciesIdentifierLabels,
  parseWeightInputToGrams,
  resolveSpeciesWeightUnit,
} from '../models';
import {
  countSpeciesNonTestingRecords,
  countSpeciesTestingRecords,
  purgeSpeciesNonTestingDataPure,
} from '../sampleData';
import {
  buildCleanBackupFileName,
  buildSpeciesSafetyBackupFileName,
  exportAnimalsCsv,
  exportBarnBackupJson,
  exportSpeciesBackupJson,
  generateBarnBackupJsonChunks,
  generateEvansHtmPedigree,
  generateThermalCageCardHtml,
  mergeBarnSnapshots,
  parseBarnBackupJson,
} from '../syncAndExports';
import { resolvePedigreePrintTheme } from '../pedigreePrintStyles';
import {
  buildShareablePedigreeCardFileName,
  generateShareablePedigreeCardHtml,
} from '../shareablePedigreeCard';
import { makeAnimal, makeEmptySnapshot, makeSettings, makeSpeciesProfile } from './testFixtures';

describe('syncAndExports — multi-device snapshot merge, JSON backup & 5/6-gen HTM exports', () => {
  it('merges snapshots deterministically by UUID and ISO updatedAt timestamp', () => {
    const sharedOld = makeAnimal('a1', {
      name: 'Old Name',
      updatedAt: '2026-01-01T10:00:00.000Z',
    });
    const localNewer = makeAnimal('a2', {
      name: 'Local Winner',
      updatedAt: '2026-02-10T10:00:00.000Z',
    });

    const local = makeEmptySnapshot({
      settings: makeSettings({ updatedAt: '2026-01-01T10:00:00.000Z', barnName: 'Old Barn' }),
      animals: [sharedOld, localNewer],
    });

    const incoming = makeEmptySnapshot({
      settings: makeSettings({
        updatedAt: '2026-03-01T10:00:00.000Z',
        barnName: 'Updated Barn',
        defaultGenerations: 5,
      }),
      animals: [
        makeAnimal('a1', { name: 'Remote Winner', updatedAt: '2026-02-15T10:00:00.000Z' }),
        makeAnimal('a2', { name: 'Stale Remote', updatedAt: '2026-01-05T10:00:00.000Z' }),
        makeAnimal('a3', { name: 'Brand New', updatedAt: '2026-02-20T10:00:00.000Z' }),
      ],
    });

    const report = mergeBarnSnapshots(local, incoming);
    const mergedById = new Map(report.snapshot.animals.map((a) => [a.id, a]));

    expect(report.animalsAdded).toBe(1);
    expect(report.animalsUpdated).toBe(1);
    expect(report.snapshot.animals).toHaveLength(3);
    expect(mergedById.get('a1')?.name).toBe('Remote Winner');
    expect(mergedById.get('a2')?.name).toBe('Local Winner');
    expect(mergedById.get('a3')?.name).toBe('Brand New');
    expect(report.snapshot.settings.barnName).toBe('Updated Barn');
    expect(report.snapshot.settings.defaultGenerations).toBe(5);
  });

  it('builds clean, descriptive filenames for JSON and SQLite backups', () => {
    expect(buildCleanBackupFileName('Meadowbrook Rabbitry', 'json', '2026-11-14')).toBe(
      'meadowbrook-rabbitry-backup-2026-11-14.json'
    );
    expect(buildCleanBackupFileName('Meadowbrook Rabbitry', 'sqlite', '2026-11-14')).toBe(
      'meadowbrook-rabbitry-2026-11-14.sqlite'
    );
    expect(buildCleanBackupFileName('My Barn', 'json', '2026-11-14')).toBe(
      'pedigree-backup-2026-11-14.json'
    );
  });

  it('exports clean human-readable JSON v5 backups with barnSummary and deterministic sorting, and round-trips cleanly', () => {
    const snap = makeEmptySnapshot({
      settings: makeSettings({
        barnName: 'Sunny Slope Barn',
        breederName: 'Kim',
        defaultGenerations: 6,
        pinnedLandingSpecies: 'Rabbit',
      }),
      animals: [
        makeAnimal('b2', {
          name: 'Retired Lady',
          status: 'Archived',
          sex: 'Female',
          species: 'Rabbit',
        }),
        makeAnimal('b1', {
          name: 'Red Baron',
          status: 'Active',
          sex: 'Male',
          species: 'Rabbit',
          needsAttention: true,
        }),
        makeAnimal('s1', { name: 'Ewe One', status: 'Active', sex: 'Female', species: 'Sheep' }),
      ],
    });

    const json = exportBarnBackupJson(snap);
    const parsedRaw = JSON.parse(json);

    expect(parsedRaw.exportedAtLocal).toBeTruthy();
    expect(parsedRaw.barnSummary.barnName).toBe('Sunny Slope Barn');
    expect(parsedRaw.barnSummary.breederName).toBe('Kim');
    expect(parsedRaw.barnSummary.counts.animals).toBe(3);
    expect(parsedRaw.barnSummary.counts.activeAnimals).toBe(2);
    expect(parsedRaw.barnSummary.counts.archivedAnimals).toBe(1);
    expect(parsedRaw.barnSummary.bySpecies.find((s: { species: string }) => s.species === 'Rabbit')?.totalAnimals).toBe(2);
    // Active Rabbit appears before Archived Rabbit; Rabbit precedes Sheep alphabetically
    expect(parsedRaw.animals.map((a: { id: string }) => a.id)).toEqual(['b1', 'b2', 's1']);

    const restored = parseBarnBackupJson(json, makeSettings());
    expect(restored.settings.defaultGenerations).toBe(6);
    expect(restored.settings.pinnedLandingSpecies).toBe('Rabbit');
    expect(restored.animals).toHaveLength(3);
    expect(restored.animals.find((a) => a.id === 'b2')?.status).toBe('Archived');
    expect(restored.animals.find((a) => a.id === 'b1')?.needsAttention).toBe(true);
    expect(restored.animals.find((a) => a.id === 'b2')?.needsAttention).toBe(false);
  });

  it('generates valid Evans .HTM pedigrees for 5-gen (32 rows) and 6-gen (64 rows)', () => {
    const sire = makeAnimal('s1', { name: 'Sire Alpha', sex: 'Male', tattoo: 'S1' });
    const dam = makeAnimal('d1', { name: 'Dam Beta', sex: 'Female', tattoo: 'D1' });
    const subj = makeAnimal('sub', {
      name: 'Champion <Red>',
      sex: 'Male',
      sireId: 's1',
      damId: 'd1',
    });
    const snap = makeEmptySnapshot({ animals: [sire, dam, subj] });

    const html5 = generateEvansHtmPedigree(
      subj,
      snap.animals,
      snap.speciesProfiles,
      snap.settings,
      5
    );
    expect(html5).toContain('Official 5-Generation Rabbit Pedigree Certificate');
    expect(html5).toContain('5th Generation (Gen 5)');
    expect(html5).not.toContain('6th Generation (Gen 6)');
    expect(html5).toContain('Champion &lt;Red&gt;');
    expect(html5).toContain('rowspan="16"');

    const html6 = generateEvansHtmPedigree(
      subj,
      snap.animals,
      snap.speciesProfiles,
      snap.settings,
      6
    );
    expect(html6).toContain('Official 6-Generation Rabbit Pedigree Certificate');
    expect(html6).toContain('6th Generation (Gen 6)');
    expect(html6).toContain('rowspan="32"');
  });

  it('escapes commas and quotes properly when exporting RFC-4180 CSV', () => {
    const snap = makeEmptySnapshot({
      animals: [
        makeAnimal('c1', {
          name: 'Lady "Duchess", Jr.',
          species: 'Rabbit',
          sex: 'Female',
          needsAttention: true,
          notes: 'Line 1\nLine 2',
        }),
        makeAnimal('c2', {
          name: 'Ewe One',
          species: 'Sheep',
          sex: 'Female',
        }),
      ],
    });

    const rabbitCsv = exportAnimalsCsv(snap.animals, snap.speciesProfiles, snap.settings, 'Rabbit');
    expect(rabbitCsv).toContain('"Lady ""Duchess"", Jr."');
    expect(rabbitCsv).toContain('"Line 1\nLine 2"');
    expect(rabbitCsv).toContain('Needs_Attention');
    expect(rabbitCsv).toContain('Yes');
    expect(rabbitCsv).not.toContain('Ewe One');
  });

  it('builds collision-free timestamped species safety backup filenames & isolated species JSON backups', () => {
    const dailyFile = buildCleanBackupFileName('Sunny Slope', 'json', '2026-11-15');
    const safetyFile = buildSpeciesSafetyBackupFileName(
      'Sunny Slope',
      'Rabbit',
      'pre-remove-non-testing',
      '2026-11-15_06-05-19'
    );
    expect(safetyFile).toBe('sunny-slope-rabbit-pre-clear-non-testing-2026-11-15_06-05-19.json');
    expect(safetyFile).not.toBe(dailyFile);

    const snap = makeEmptySnapshot({
      animals: [
        makeAnimal('r1', { name: 'Rabbit One', species: 'Rabbit' }),
        makeAnimal('s1', { name: 'Sheep One', species: 'Sheep' }),
      ],
    });

    const speciesJson = exportSpeciesBackupJson(snap, 'Rabbit', {
      reason: 'pre-remove-species',
    });
    const parsedRaw = JSON.parse(speciesJson);
    expect(parsedRaw.backupScope).toBe('species');
    expect(parsedRaw.backupReason).toBe('pre-remove-species');
    expect(parsedRaw.targetSpecies).toBe('Rabbit');
    expect(parsedRaw.animals.map((a: { id: string }) => a.id)).toEqual(['r1']);

    // Restoring or merging a species-only backup leaves other species untouched
    const emptyRabbitSnapshot = makeEmptySnapshot({
      speciesProfiles: [makeSpeciesProfile('Sheep')],
      animals: [makeAnimal('s1', { name: 'Sheep One', species: 'Sheep' })],
    });
    const parsedSpecies = parseBarnBackupJson(speciesJson, emptyRabbitSnapshot.settings);
    const merged = mergeBarnSnapshots(emptyRabbitSnapshot, parsedSpecies);
    expect(merged.snapshot.animals.map((a) => a.id).sort()).toEqual(['r1', 's1']);
  });

  it('purges non-testing species records while keeping sample testing records and other species intact', () => {
    const snap = makeEmptySnapshot({
      animals: [
        makeAnimal('seed-rabbit-sire', { name: 'Sample Buck', species: 'Rabbit' }),
        makeAnimal('real-rabbit-1', {
          name: 'Real Kit',
          species: 'Rabbit',
          sireId: 'seed-rabbit-sire',
        }),
        makeAnimal('real-sheep-1', { name: 'Real Ewe', species: 'Sheep' }),
      ],
    });

    expect(countSpeciesTestingRecords(snap, 'Rabbit')).toBe(1);
    expect(countSpeciesNonTestingRecords(snap, 'Rabbit')).toBe(1);

    const purged = purgeSpeciesNonTestingDataPure(snap, 'Rabbit');
    expect(purged.removedAnimals).toBe(1);
    expect(purged.nextSnapshot.animals.map((a) => a.id)).toEqual([
      'seed-rabbit-sire',
      'real-sheep-1',
    ]);
  });

  it('applies optional default species naming prefix only when animal name does not already have it', () => {
    expect(applyAnimalNamePrefix('Ruby Rose', 'Oak Ridge')).toBe('Oak Ridge Ruby Rose');
    expect(applyAnimalNamePrefix('Oak Ridge Ruby Rose', 'Oak Ridge')).toBe('Oak Ridge Ruby Rose');
    expect(applyAnimalNamePrefix('oak ridge Ruby Rose', 'Oak Ridge')).toBe('oak ridge Ruby Rose');
    expect(applyAnimalNamePrefix('Ruby', 'OR-')).toBe('OR-Ruby');
    expect(applyAnimalNamePrefix('Ruby', '')).toBe('Ruby');
  });

  it('supports kg units, per-species weight overrides across backups/CSV, and species-aware identifier labels', () => {
    expect(formatWeight(18500, 'kg')).toBe('18.50 kg');
    expect(parseWeightInputToGrams('18.5', 'kg')).toBe(18500);

    const dogProfile = { ...makeSpeciesProfile('Dog'), preferredUnit: 'kg' as const };
    const rabbitProfile = makeSpeciesProfile('Rabbit');
    const settings = makeSettings({ preferredUnit: 'lbs_oz' });

    expect(resolveSpeciesWeightUnit(dogProfile, settings)).toBe('kg');
    expect(resolveSpeciesWeightUnit(rabbitProfile, settings)).toBe('lbs_oz');

    const snap = makeEmptySnapshot({
      settings,
      speciesProfiles: [dogProfile, rabbitProfile],
      animals: [
        makeAnimal('d1', { species: 'Dog', name: 'Scout', weightGrams: 22500 }),
        makeAnimal('r1', { species: 'Rabbit', name: 'Ruby', weightGrams: 4536 }),
      ],
    });

    const csv = exportAnimalsCsv(snap.animals, snap.speciesProfiles, settings);
    expect(csv).toContain('22.50 kg');
    expect(csv).toContain('10 lb 0 oz');

    const restored = parseBarnBackupJson(exportBarnBackupJson(snap), makeSettings());
    expect(restored.speciesProfiles.find((s) => s.name === 'Dog')?.preferredUnit).toBe('kg');
    expect(restored.speciesProfiles.find((s) => s.name === 'Rabbit')?.preferredUnit).toBeUndefined();

    expect(getSpeciesIdentifierLabels('Dog').fieldLabel).toContain('Microchip');
    expect(getSpeciesIdentifierLabels('Cattle').fieldLabel).toContain('Ear Tag');
    expect(getSpeciesIdentifierLabels('Rabbit').fieldLabel).toContain('Ear Tattoo');
  });

  it('respects PedigreePrintOptions for hiding weights, hiding genotypes, and printing breeder contact footer', () => {
    const subj = makeAnimal('p1', {
      name: 'Customer Doe',
      species: 'Rabbit',
      sex: 'Female',
      weightGrams: 4082,
      genotypeRaw: 'A_ B_ C_ D_ E_',
    });
    const snap = makeEmptySnapshot({ animals: [subj] });

    const customerHtml = generateEvansHtmPedigree(
      subj,
      snap.animals,
      snap.speciesProfiles,
      snap.settings,
      3,
      undefined,
      {
        showWeights: false,
        showGenotypes: false,
        showBreederFooter: true,
        breederContactLine: 'https://oakridge-example.test · (555) 010-2000',
      }
    );

    expect(customerHtml).not.toContain('<strong>Weight:</strong>');
    expect(customerHtml).not.toContain('<strong>Genotype:</strong>');
    expect(customerHtml).toContain('https://oakridge-example.test · (555) 010-2000');
    expect(customerHtml).toContain('Breeder Signature:');

    const noFooterHtml = generateEvansHtmPedigree(
      subj,
      snap.animals,
      snap.speciesProfiles,
      snap.settings,
      3,
      undefined,
      {
        showWeights: true,
        showGenotypes: true,
        showBreederFooter: false,
      }
    );
    expect(noFooterHtml).toContain('<strong>Weight:</strong>');
    expect(noFooterHtml).toContain('<strong>Genotype:</strong>');
    expect(noFooterHtml).not.toContain('Breeder Signature:');
  });

  it('forces light-only color-scheme and white #ffffff print backgrounds with zero dark background fills in .HTM exports', () => {
    const subj = makeAnimal('p-ink', {
      name: 'Ink Saver',
      tattoo: 'INK-1',
      species: 'Rabbit',
    });
    const darkThemeSettings = makeSettings({ themeMode: 'dark' });
    const snap = makeEmptySnapshot({ settings: darkThemeSettings, animals: [subj] });

    const pedigreeHtml = generateEvansHtmPedigree(
      subj,
      snap.animals,
      snap.speciesProfiles,
      darkThemeSettings,
      3
    );
    expect(pedigreeHtml).toContain('<meta name="color-scheme" content="light only" />');
    expect(pedigreeHtml).toContain('@media print');
    expect(pedigreeHtml).toContain('background: #ffffff !important;');
    expect(pedigreeHtml).not.toContain('background: #2d5a3d');
    expect(pedigreeHtml).not.toContain('#0f1611');

    const cardHtml = generateThermalCageCardHtml(
      subj,
      snap.animals,
      snap.speciesProfiles,
      darkThemeSettings
    );
    expect(cardHtml).toContain('<meta name="color-scheme" content="light only" />');
    expect(cardHtml).toContain('@media print');
    expect(cardHtml).toContain('#ffffff !important;');
    expect(cardHtml).not.toContain('#0f1611');
  });

  it('includes confirmed, cleared, and ancestral carrier disclosures in buildPdfReadyBarnSnapshot', async () => {
    const { buildPdfReadyBarnSnapshot } = await import('../syncAndExports');
    const sire = makeAnimal('sire-car', {
      name: 'Carrier Buck',
      species: 'Rabbit',
      sex: 'Male',
      confirmedCarrierOf: ['Vienna (Blue-Eyed White)'],
    });
    const kit = makeAnimal('kit-car', {
      name: 'Kit Prospect',
      species: 'Rabbit',
      sex: 'Female',
      sireId: 'sire-car',
      clearedCarrierOf: [{ trait: 'Rex Fur', proofType: 'dna_tested' }],
    });
    const snap = makeEmptySnapshot({ animals: [sire, kit] });
    const dto = buildPdfReadyBarnSnapshot(snap, 'Rabbit');
    const kitDto = dto.animals.find((a) => a.id === 'kit-car');

    expect(kitDto).toBeTruthy();
    expect(kitDto?.carrierDisclosures).toContain('Lineage Potential: Vienna (Blue-Eyed White) (Sire)');
    expect(kitDto?.carrierDisclosures).toContain('Cleared: Rex Fur (DNA Clear)');
  });

  it('streams backup JSON chunks via generateBarnBackupJsonChunks with exact parity to exportBarnBackupJson', () => {
    const animals = Array.from({ length: 10 }, (_, idx) =>
      makeAnimal(`a-${idx + 1}`, {
        name: `Animal ${idx + 1}`,
        species: 'Rabbit',
        sex: idx % 2 === 0 ? 'Male' : 'Female',
        notes: `Detailed breeding & show record #${idx + 1}: ` + 'pedigree-note-'.repeat(40),
      })
    );
    const snap = makeEmptySnapshot({
      settings: makeSettings({ barnName: 'Chunked Barn', breederName: 'Alex' }),
      animals,
      animalPhotos: [
        {
          id: 'p1',
          species: 'Rabbit',
          animalId: 'a-1',
          isPrimary: true,
          sortOrder: 0,
          caption: 'Cover',
          originalFileName: 'a1.png',
          mimeType: 'image/png',
          width: 1,
          height: 1,
          originalBytes: 120,
          storedBytes: 68,
          thumbnailDataUrl: 'data:image/png;base64,AAAA',
          dataUrl: 'data:image/png;base64,BBBB',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const chunks = Array.from(
      generateBarnBackupJsonChunks(snap, { backupScope: 'species', targetSpecies: 'Rabbit' }, 4096)
    );
    expect(chunks.length).toBeGreaterThan(2);

    const streamedJoined = chunks.join('');
    const monolithic = exportBarnBackupJson(snap, {
      backupScope: 'species',
      targetSpecies: 'Rabbit',
    });

    const streamedParsed = JSON.parse(streamedJoined);
    const monolithicParsed = JSON.parse(monolithic);
    // Normalize millisecond timestamps in case clock ticked between calls
    streamedParsed.exportedAtIsoUtc = monolithicParsed.exportedAtIsoUtc;
    streamedParsed.exportedAtLocal = monolithicParsed.exportedAtLocal;
    expect(streamedParsed).toEqual(monolithicParsed);

    const restored = parseBarnBackupJson(streamedJoined, makeSettings());
    expect(restored.animals).toHaveLength(10);
    expect(restored.animalPhotos).toHaveLength(1);
  });

  it('renders 7-gen and 8-gen Evans .HTM pedigrees with custom print presets locked to #FFFFFF paper', () => {
    const gen8Sire = makeAnimal('g8-root', {
      sex: 'Male',
      name: 'Foundation Eighth',
      tattoo: 'G8-1',
    });
    const gen7Sire = makeAnimal('g7-root', {
      sex: 'Male',
      name: 'Seventh Sire',
      sireId: 'g8-root',
    });
    const gen6Sire = makeAnimal('g6-root', { sex: 'Male', name: 'Sixth Sire', sireId: 'g7-root' });
    const gen5Sire = makeAnimal('g5-root', { sex: 'Male', name: 'Fifth Sire', sireId: 'g6-root' });
    const gen4Sire = makeAnimal('g4-root', { sex: 'Male', name: 'Fourth Sire', sireId: 'g5-root' });
    const gen3Sire = makeAnimal('g3-root', { sex: 'Male', name: 'Third Sire', sireId: 'g4-root' });
    const gen2Sire = makeAnimal('g2-root', { sex: 'Male', name: 'Second Sire', sireId: 'g3-root' });
    const gen1Sire = makeAnimal('g1-root', { sex: 'Male', name: 'First Sire', sireId: 'g2-root' });
    const subject = makeAnimal('subj-ev8', {
      sex: 'Female',
      name: 'Eighth Gen Prospect',
      tattoo: 'EGP8',
      sireId: 'g1-root',
    });
    const animals = [
      gen8Sire,
      gen7Sire,
      gen6Sire,
      gen5Sire,
      gen4Sire,
      gen3Sire,
      gen2Sire,
      gen1Sire,
      subject,
    ];
    const profiles = [makeSpeciesProfile('Rabbit')];
    const settings = makeSettings({ barnName: 'Heritage Hutch' });

    const html8 = generateEvansHtmPedigree(subject, animals, profiles, settings, 8, undefined, {
      colorPreset: 'royal_navy',
      borderStyle: 'double_frame',
      layoutPreset: 'show_certificate',
    });

    expect(html8).toContain('Official 8-Generation Rabbit Pedigree Certificate');
    expect(html8).toContain('Gen 7');
    expect(html8).toContain('Gen 8');
    expect(html8).toContain('Foundation Eighth');
    expect(html8).toContain('class="cell leaf sire"');
    expect(html8).toContain('border: 4px double #1B365D');
    expect(html8).toContain('flex-direction: column; align-items: center; text-align: center;');
    expect(html8).toContain('<meta name="barn-preserve-accent-ink" content="true" />');
    expect(html8).toContain('#1B365D'); // Royal Navy primary ink
    expect(html8).toContain('background: #ffffff !important;');

    const barnTheme = resolvePedigreePrintTheme(
      { colorPreset: 'barn_palette', borderStyle: 'modern_rounded', layoutPreset: 'compact_ledger' },
      {
        lightPrimary: '#E5E7EB', // very bright color should darken automatically for white-paper contrast
        lightAccent: '#7C2D12',
        lightMale: '#1D4ED8',
        darkPrimary: '#22C55E',
        darkAccent: '#F97316',
        darkMale: '#60A5FA',
      }
    );
    expect(barnTheme.paperBg).toBe('#FFFFFF');
    expect(barnTheme.primaryHex).not.toBe('#E5E7EB');
  });

  it('builds lightweight standalone shareable pedigree cards with QR link, XSS escaping & collapsible Gen 4-8 details', () => {
    const g5 = makeAnimal('g5-c', { sex: 'Male', name: 'Anchor G5', tattoo: 'A5', variety: 'Black' });
    const g4 = makeAnimal('g4-c', { sex: 'Male', name: 'Anchor G4', sireId: 'g5-c' });
    const g3 = makeAnimal('g3-c', { sex: 'Male', name: 'Anchor G3', sireId: 'g4-c' });
    const g2 = makeAnimal('g2-c', { sex: 'Male', name: 'Anchor G2', sireId: 'g3-c' });
    const g1 = makeAnimal('g1-c', { sex: 'Male', name: 'Anchor G1', sireId: 'g2-c' });
    const subject = makeAnimal('subj-card', {
      sex: 'Female',
      name: 'Daisy <script>alert(1)</script>',
      tattoo: 'DZY-42',
      breed: 'Holland Lop',
      variety: 'Broken Tort',
      weightGrams: Math.round(62 * 28.349523125),
      registrationNumber: 'R-9910',
      legsCount: 3,
      sireId: 'g1-c',
    });

    expect(buildShareablePedigreeCardFileName(subject)).toBe('pedigree-card-dzy-42.html');

    const cardHtml = generateShareablePedigreeCardHtml(
      subject,
      [g5, g4, g3, g2, g1, subject],
      [makeSpeciesProfile('Rabbit')],
      makeSettings({ barnName: 'Meadowbrook Rabbitry' }),
      6,
      undefined,
      {
        colorPreset: 'heritage_burgundy',
        borderStyle: 'modern_rounded',
        arbaLbsOzDotNotation: true,
        includeQrCode: true,
        appBaseUrl: 'https://pedigree.example.org/',
      }
    );

    expect(cardHtml).toContain('<!DOCTYPE html>');
    expect(cardHtml).toContain('3-Generation Lineage Summary');
    expect(cardHtml).toContain('Extended Ancestry (Gen 4&ndash;6: 2 recorded ancestors)');
    expect(cardHtml).toContain('Anchor G5');
    expect(cardHtml).toContain('3.14'); // 62 oz = 3 lb 14 oz
    expect(cardHtml).toContain('Reg: R-9910');
    expect(cardHtml).toContain('3 Legs');
    expect(cardHtml).toContain('class="qr-svg"');
    expect(cardHtml).not.toContain('<script>alert(1)</script>');
    expect(cardHtml).toContain('Daisy &lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('preserves SpeciesProfile.targetWeightCurve and BreedingRecord.litterWeightMilestones across JSON backup & merge', () => {
    const profileWithCurve = {
      ...makeSpeciesProfile('Rabbit'),
      targetWeightCurve: [
        { ageDays: 21, weightGrams: 540, label: '3w Goal' },
        { ageDays: 56, weightGrams: 2041, label: '8w Wean Goal' },
      ],
      updatedAt: '2026-06-15T12:00:00.000Z',
    };
    const snap = makeEmptySnapshot({
      speciesProfiles: [profileWithCurve, makeSpeciesProfile('Sheep')],
      breedings: [
        {
          id: 'b-curve-1',
          species: 'Rabbit',
          sireId: 's1',
          damId: 'd1',
          sireName: 'Buck A',
          damName: 'Doe B',
          bredDateIso: '2026-05-01',
          expectedDueDateIso: '2026-06-01',
          actualBirthDateIso: '2026-06-01',
          projectedCoiPercent: 0,
          liveCount: 6,
          stillbornCount: 0,
          fosteredCount: 0,
          weanedCount: 6,
          offspringCreated: false,
          status: 'Weaned',
          litterWeightMilestones: [
            {
              id: 'lwm-21',
              ageDays: 21,
              label: '3-Week Check',
              liveCount: 6,
              totalWeightGrams: 3180,
              avgWeightGrams: 530,
            },
          ],
          notes: '',
          createdAt: '2026-06-01T12:00:00.000Z',
          updatedAt: '2026-06-22T12:00:00.000Z',
        },
      ],
    });

    const parsed = parseBarnBackupJson(exportBarnBackupJson(snap), makeSettings());
    const parsedRabbit = parsed.speciesProfiles.find((s) => s.name === 'Rabbit');
    expect(parsedRabbit?.targetWeightCurve).toEqual([
      { ageDays: 21, weightGrams: 540, label: '3w Goal' },
      { ageDays: 56, weightGrams: 2041, label: '8w Wean Goal' },
    ]);
    expect(parsed.breedings[0].litterWeightMilestones).toHaveLength(1);
    expect(parsed.breedings[0].litterWeightMilestones?.[0].avgWeightGrams).toBe(530);

    const localOld = makeEmptySnapshot();
    const merged = mergeBarnSnapshots(localOld, parsed);
    const mergedRabbit = merged.snapshot.speciesProfiles.find((s) => s.name === 'Rabbit');
    expect(mergedRabbit?.targetWeightCurve).toHaveLength(2);
    expect(merged.snapshot.breedings[0].litterWeightMilestones?.[0].totalWeightGrams).toBe(3180);
  });

  it('renders family_portrait multi-photo pedigrees, iagarb_angora 7-position scorecards, and persists woolHarvests in backups', () => {
    const sire = makeAnimal('s1', {
      name: 'Boreal King',
      sex: 'Male',
      breed: 'German Angora',
      variety: 'White',
    });
    const dam = makeAnimal('d1', {
      name: 'Cloud Silk',
      sex: 'Female',
      breed: 'German Angora',
      variety: 'White',
    });
    const subject = makeAnimal('a1', {
      name: 'Snowdrift',
      tattoo: 'ANG01',
      sex: 'Female',
      breed: 'German Angora',
      variety: 'White',
      sireId: 's1',
      damId: 'd1',
    });
    const harvest = {
      id: 'wh-test-1',
      species: 'Rabbit',
      animalId: 'a1',
      harvestDateIso: '2026-06-01',
      shearingIntervalDays: 90,
      primeWeightGrams: 280,
      gradeWeightGrams: 80,
      harvestMethod: 'Shear' as const,
      stapleLengthMm: 78,
      iagarbScore: {
        weightPts: 19,
        bodyTypePts: 18,
        densityLengthPts: 13.5,
        uniformityPts: 13,
        texturePts: 14,
        furnishingsPts: 8.5,
        conditionPts: 4.5,
        totalPts: 90.5,
        evaluatorName: 'E. Registrar',
        evaluationDateIso: '2026-06-01',
      },
      notes: 'Clean uniform staple',
      createdAt: '2026-06-01T10:00:00.000Z',
      updatedAt: '2026-06-01T10:00:00.000Z',
    };

    const samplePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    const familyHtml = generateEvansHtmPedigree(
      subject,
      [subject, sire, dam],
      [makeSpeciesProfile('Rabbit')],
      makeSettings(),
      3,
      samplePng,
      {
        layoutPreset: 'family_portrait',
        ancestorPhotosByAnimalId: {
          s1: samplePng,
          d1: samplePng,
        },
        woolHarvests: [harvest],
      }
    );
    expect(familyHtml).toContain('Boreal King');
    expect(familyHtml).toContain('360g total');
    expect(familyHtml).toContain('family-strip');
    expect(familyHtml).toContain('anc-photo');

    const iagarbHtml = generateEvansHtmPedigree(
      subject,
      [subject, sire, dam],
      [makeSpeciesProfile('Rabbit')],
      makeSettings(),
      3,
      samplePng,
      {
        layoutPreset: 'iagarb_angora',
        woolHarvests: [harvest],
      }
    );
    expect(iagarbHtml).toContain('IAGARB German Angora Wool &amp; Evaluation Standard');
    expect(iagarbHtml).toContain('90.5 / 100 pts');
    expect(iagarbHtml).toContain('360g/90d');
    expect(iagarbHtml).toContain('90.5/100');

    const snap = makeEmptySnapshot({
      animals: [subject, sire, dam],
      woolHarvests: [harvest],
    });
    const parsed = parseBarnBackupJson(exportBarnBackupJson(snap), makeSettings());
    expect(parsed.woolHarvests).toHaveLength(1);
    expect(parsed.woolHarvests?.[0].primeWeightGrams).toBe(280);
    expect(parsed.woolHarvests?.[0].iagarbScore?.totalPts).toBe(90.5);
  });
});
```

## `src/core/__tests__/taskMaster.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  BarnTask,
  BreedScheduleOverride,
  BreedingRecord,
  normalizeBreedScheduleOverrides,
  SpeciesProfile,
} from '../models';
import {
  evaluateStalePostBirthTasksForBreeding,
  generateCascadedTasksForBreeding,
  getPendingBreedingCleanupTasks,
  identifyPostBirthTaskOffset,
  isBirthCheckTask,
  isPalpationTask,
  recalculatePostBirthTasksForBreeding,
  resolveEffectiveSpeciesProfileForBreed,
  resolveEffectiveSpeciesProfileForBreeding,
} from '../taskMaster';
import { makeAnimal, makeSpeciesProfile } from './testFixtures';

function makeRichRabbitProfile(overrides: Partial<SpeciesProfile> = {}): SpeciesProfile {
  const base = makeSpeciesProfile('Rabbit');
  return {
    ...base,
    gestationDays: 31,
    weanDaysAfterBirth: 42,
    rebreedDaysAfterBirth: 21,
    maturityDays: 180,
    milestones: [
      {
        label: 'Palpation Check',
        relativeTo: 'AFTER_BRED',
        daysOffset: 14,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'Place Nestbox',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 3,
        category: 'Nestbox',
        priority: 'High',
      },
      {
        label: 'Check Nestbox for Kits',
        relativeTo: 'AFTER_BIRTH',
        daysOffset: 1,
        category: 'Birth Check',
        priority: 'High',
      },
      {
        label: 'Remove Nestbox',
        relativeTo: 'AFTER_BIRTH',
        daysOffset: 21,
        category: 'Care',
        priority: 'Normal',
      },
    ],
    ...overrides,
  };
}

function makeBreedingRecord(overrides: Partial<BreedingRecord> = {}): BreedingRecord {
  return {
    id: 'breed-1',
    species: 'Rabbit',
    damId: 'doe-1',
    damName: 'Daisy',
    sireId: 'buck-1',
    sireName: 'Thumper',
    bredDateIso: '2026-04-01',
    expectedDueDateIso: '2026-05-02',
    actualBirthDateIso: '',
    projectedCoiPercent: 0,
    liveCount: 0,
    stillbornCount: 0,
    fosteredCount: 0,
    weanedCount: 0,
    offspringCreated: false,
    status: 'Bred',
    notes: '',
    createdAt: '2026-04-01T10:00:00.000Z',
    updatedAt: '2026-04-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeManualTask(id: string, overrides: Partial<BarnTask> = {}): BarnTask {
  return {
    id,
    species: 'Rabbit',
    title: `Task ${id}`,
    category: 'Care',
    priority: 'Normal',
    dueDateIso: '2026-05-10',
    linkedAnimalId: 'doe-1',
    linkedAnimalName: 'Daisy',
    linkedBreedingId: '',
    completed: false,
    createdAt: '2026-04-01T10:00:00.000Z',
    updatedAt: '2026-04-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('taskMaster — Per-Breed Overrides, Post-Birth Recalculation & Checkoff Cleanup', () => {
  it('normalizes breed overrides safely by trimming, deduplicating, clamping, and dropping empty rows', () => {
    const raw: BreedScheduleOverride[] = [
      { breed: '   ', gestationDays: 30 },
      { breed: 'Empty Line' }, // no numeric overrides -> dropped
      {
        breed: 'Holland Lop',
        gestationDays: 30,
        weanDaysAfterBirth: 56,
        rebreedDaysAfterBirth: 0,
        maturityDays: 2000, // clamped to 1500
        milestoneOverrides: [
          { label: 'Remove Nestbox', daysOffset: 24 },
          { label: 'remove nestbox', daysOffset: 25 }, // case-insensitive dedupe (last wins)
          { label: 'Bad', daysOffset: -5 }, // negative skipped
        ],
      },
      {
        breed: 'holland lop',
        gestationDays: 29,
        weanDaysAfterBirth: 49,
      },
      {
        breed: 'Flemish Giant',
        gestationDays: 32,
        weanDaysAfterBirth: 60,
        maturityDays: 240,
      },
    ];

    const normalized = normalizeBreedScheduleOverrides(raw);
    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toEqual({
      breed: 'Flemish Giant',
      gestationDays: 32,
      weanDaysAfterBirth: 60,
      maturityDays: 240,
    });
    expect(normalized[1]).toEqual({
      breed: 'holland lop',
      gestationDays: 29,
      weanDaysAfterBirth: 49,
    });

    const singleWithMilestones = normalizeBreedScheduleOverrides([
      {
        breed: 'Netherland Dwarf',
        gestationDays: 30,
        rebreedDaysAfterBirth: 0,
        maturityDays: 2000,
        milestoneOverrides: [
          { label: 'Remove Nestbox', daysOffset: 24 },
          { label: 'remove nestbox', daysOffset: 25 },
          { label: 'Invalid', daysOffset: -1 },
        ],
      },
    ]);
    expect(singleWithMilestones).toEqual([
      {
        breed: 'Netherland Dwarf',
        gestationDays: 30,
        rebreedDaysAfterBirth: 0,
        maturityDays: 1500,
        milestoneOverrides: [{ label: 'remove nestbox', daysOffset: 25 }],
      },
    ]);
  });

  it('resolves dam breed overrides first, falls back to sire breed, and never mutates the base SpeciesProfile', () => {
    const profile = makeRichRabbitProfile({
      breedOverrides: [
        {
          breed: 'Holland Lop',
          gestationDays: 30,
          weanDaysAfterBirth: 56,
          rebreedDaysAfterBirth: 28,
          milestoneOverrides: [{ label: 'Remove Nestbox', daysOffset: 24 }],
        },
        {
          breed: 'Flemish Giant',
          gestationDays: 32,
          weanDaysAfterBirth: 60,
        },
      ],
    });
    const originalSnapshot = JSON.stringify(profile);

    const damLop = makeAnimal('doe-1', { breed: 'holland lop', sex: 'Female' });
    const sireGiant = makeAnimal('buck-1', { breed: 'Flemish Giant', sex: 'Male' });
    const damRex = makeAnimal('doe-2', { breed: 'Rex', sex: 'Female' });

    // Dam wins over sire when both have overrides
    const resolvedDam = resolveEffectiveSpeciesProfileForBreeding(profile, damLop, sireGiant);
    expect(resolvedDam.matchedBreed).toBe('Holland Lop');
    expect(resolvedDam.profile.gestationDays).toBe(30);
    expect(resolvedDam.profile.weanDaysAfterBirth).toBe(56);
    expect(resolvedDam.profile.rebreedDaysAfterBirth).toBe(28);
    expect(
      resolvedDam.profile.milestones.find((m) => m.label === 'Remove Nestbox')?.daysOffset
    ).toBe(24);
    expect(
      resolvedDam.profile.milestones.find((m) => m.label === 'Place Nestbox')?.daysOffset
    ).toBe(3);

    // Falls back to sire when dam breed has no override
    const resolvedSireFallback = resolveEffectiveSpeciesProfileForBreeding(
      profile,
      damRex,
      sireGiant
    );
    expect(resolvedSireFallback.matchedBreed).toBe('Flemish Giant');
    expect(resolvedSireFallback.profile.gestationDays).toBe(32);
    expect(resolvedSireFallback.profile.weanDaysAfterBirth).toBe(60);

    // Falls back cleanly to base profile when neither matches
    const resolvedDefault = resolveEffectiveSpeciesProfileForBreed(profile, 'Californian');
    expect(resolvedDefault.matchedBreed).toBeUndefined();
    expect(resolvedDefault.profile).toBe(profile);

    // Source profile unchanged
    expect(JSON.stringify(profile)).toBe(originalSnapshot);
  });

  it('cascades breeding tasks using breed-specific gestation/weaning/milestone offsets and skips Missed', () => {
    const baseProfile = makeRichRabbitProfile({
      breedOverrides: [
        {
          breed: 'Holland Lop',
          gestationDays: 30,
          weanDaysAfterBirth: 50,
          rebreedDaysAfterBirth: 28,
          milestoneOverrides: [{ label: 'Remove Nestbox', daysOffset: 25 }],
        },
      ],
    });
    const effective = resolveEffectiveSpeciesProfileForBreed(baseProfile, 'Holland Lop').profile;
    const breeding = makeBreedingRecord({
      bredDateIso: '2026-04-01',
      expectedDueDateIso: '2026-05-01', // 30 days
    });

    const tasks = generateCascadedTasksForBreeding(breeding, effective);
    const byPrefix = (prefix: string) => tasks.find((t) => t.title.startsWith(prefix));

    expect(byPrefix('Palpation Check:')?.dueDateIso).toBe('2026-04-15');
    expect(byPrefix('Place Nestbox:')?.dueDateIso).toBe('2026-04-28');
    expect(byPrefix('Check Nestbox for Kits:')?.dueDateIso).toBe('2026-05-02');
    expect(byPrefix('Remove Nestbox:')?.dueDateIso).toBe('2026-05-26'); // +25 instead of +21
    expect(byPrefix('Rebreed Readiness Check:')?.dueDateIso).toBe('2026-05-29'); // +28 instead of +21
    expect(byPrefix('Wean Kits:')?.dueDateIso).toBe('2026-06-20'); // +50 instead of +42

    expect(
      generateCascadedTasksForBreeding(makeBreedingRecord({ status: 'Missed' }), effective)
    ).toEqual([]);
  });

  it('evaluates and recalculates uncompleted AFTER_BIRTH chores to early/late actual birth date without touching completed or unrelated tasks', () => {
    const profile = makeRichRabbitProfile();
    // Bred 2026-04-01, expected 2026-05-02
    const breeding = makeBreedingRecord({
      id: 'b-shift',
      bredDateIso: '2026-04-01',
      expectedDueDateIso: '2026-05-02',
    });
    const generated = generateCascadedTasksForBreeding(breeding, profile);

    // Mark "Check Nestbox for Kits" (+1) completed & keep others open, plus add an unrelated chore
    const tasks: BarnTask[] = generated.map((t, idx) =>
      t.category === 'Birth Check'
        ? { ...t, completed: true, _rev: 2 }
        : { ...t, _rev: idx }
    );
    const unrelatedTask = makeManualTask('manual-1', {
      dueDateIso: '2026-05-20',
      title: 'Trim Nails: Daisy',
      category: 'Care',
      linkedBreedingId: 'b-shift',
    });
    tasks.push(unrelatedTask);

    // Doe kindled 2 days early on 2026-04-30
    const bornBreeding: BreedingRecord = {
      ...breeding,
      status: 'Born',
      actualBirthDateIso: '2026-04-30',
    };

    expect(identifyPostBirthTaskOffset(tasks.find((t) => t.category === 'Weaning')!, profile)).toBe(42);
    expect(identifyPostBirthTaskOffset(tasks.find((t) => t.category === 'Palpation')!, profile)).toBeNull();
    expect(identifyPostBirthTaskOffset(unrelatedTask, profile)).toBeNull();

    const preview = evaluateStalePostBirthTasksForBreeding(tasks, bornBreeding, profile);
    // Should include Remove Nestbox (+21 -> 2026-05-21), Rebreed (+21 -> 2026-05-21), Wean Kits (+42 -> 2026-06-11)
    // Excluded: Palpation (AFTER_BRED), Place Nestbox (BEFORE_BIRTH), completed Birth Check, unrelated Care chore
    expect(preview.staleEntries).toHaveLength(3);

    const { updatedTasks, shiftedCount } = recalculatePostBirthTasksForBreeding(
      tasks,
      bornBreeding,
      profile,
      '2026-04-30T15:00:00.000Z'
    );

    expect(shiftedCount).toBe(3);
    const updatedWean = updatedTasks.find((t) => t.category === 'Weaning');
    const updatedRebreed = updatedTasks.find((t) => t.category === 'Rebreed');
    const updatedRemove = updatedTasks.find((t) => t.title.startsWith('Remove Nestbox:'));
    expect(updatedWean?.dueDateIso).toBe('2026-06-11');
    expect(updatedRebreed?.dueDateIso).toBe('2026-05-21');
    expect(updatedRemove?.dueDateIso).toBe('2026-05-21');
    expect(updatedWean?.updatedAt).toBe('2026-04-30T15:00:00.000Z');
    const prevWeanRev = tasks.find((t) => t.category === 'Weaning')!._rev!;
    expect(updatedWean?._rev).toBe(prevWeanRev + 1);

    // Re-running after applying shifts yields zero stale tasks
    const mergedTasks = tasks.map((t) => updatedTasks.find((u) => u.id === t.id) ?? t);
    const recheck = evaluateStalePostBirthTasksForBreeding(mergedTasks, bornBreeding, profile);
    expect(recheck.staleEntries).toHaveLength(0);
  });

  it('identifies Palpation/Birth Check tasks and returns only pending downstream tasks for Missed cleanup', () => {
    const profile = makeRichRabbitProfile();
    const breeding = makeBreedingRecord({ id: 'b-missed' });
    const generated = generateCascadedTasksForBreeding(breeding, profile);

    const palpTask = generated.find((t) => t.category === 'Palpation')!;
    const birthTask = generated.find((t) => t.category === 'Birth Check')!;
    const nestTask = generated.find((t) => t.category === 'Nestbox')!;
    const weanTask = generated.find((t) => t.category === 'Weaning')!;
    const rebreedTask = generated.find((t) => t.category === 'Rebreed')!;
    const removeNestTask = generated.find((t) => t.title.startsWith('Remove Nestbox:'))!;

    expect(isPalpationTask(palpTask)).toBe(true);
    expect(isPalpationTask({ ...palpTask, linkedBreedingId: '' })).toBe(false);
    expect(isBirthCheckTask(birthTask)).toBe(true);
    expect(isBirthCheckTask(palpTask)).toBe(false);

    // Mark Place Nestbox already completed + add another breeding's task + manual unrelated chore
    const otherBreedingTask = makeManualTask('other-b-task', {
      linkedBreedingId: 'b-other',
      category: 'Birth Check',
      title: 'Check Nestbox for Kits: Other',
    });
    const manualLinkedTask = makeManualTask('manual-linked', {
      linkedBreedingId: 'b-missed',
      category: 'Care',
      title: 'Extra Vitamin Drop',
    });
    const allTasks = [
      ...generated.map((t) => (t.id === nestTask.id ? { ...t, completed: true } : t)),
      otherBreedingTask,
      manualLinkedTask,
    ];

    const cleanup = getPendingBreedingCleanupTasks(allTasks, 'b-missed', profile, [palpTask.id]);
    const cleanupIds = new Set(cleanup.map((t) => t.id));

    expect(cleanupIds.has(birthTask.id)).toBe(true);
    expect(cleanupIds.has(weanTask.id)).toBe(true);
    expect(cleanupIds.has(rebreedTask.id)).toBe(true);
    expect(cleanupIds.has(removeNestTask.id)).toBe(true);
    // Excluded: completed Nestbox task, excluded Palpation task, AFTER_BRED milestone, other breeding task, unrelated Care chore
    expect(cleanupIds.has(nestTask.id)).toBe(false);
    expect(cleanupIds.has(palpTask.id)).toBe(false);
    expect(cleanupIds.has(otherBreedingTask.id)).toBe(false);
    expect(cleanupIds.has(manualLinkedTask.id)).toBe(false);
  });
});
```

## `src/core/__tests__/techyStuffGuardrails.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  DESTRUCTIVE_CONFIRM_PHRASES,
  evaluateStorageQuotaForOperation,
  isDestructiveActionConfirmationValid,
  validateDiagnosticTriggerInput,
  validateLogRetentionDaysOverride,
  validatePwaUpdatePolicyOverride,
  validateSupportRecipientEmail,
} from '../techyStuffGuardrails';

describe('techyStuffGuardrails — quota preflight, strict sanitization & destructive safeguards', () => {
  it('allows healthy storage budgets, warns above 80%, and blocks critical quota writes', () => {
    const healthy = evaluateStorageQuotaForOperation({
      operation: 'support_bundle_zip',
      operationLabel: 'Support ZIP Export',
      estimatedRequiredBytes: 1_500_000,
      opfsSupported: true,
      storageStatus: {
        supported: true,
        persisted: true,
        usageBytes: 10_000_000,
        quotaBytes: 200_000_000,
        percentUsed: 5,
      },
    });
    expect(healthy.level).toBe('ok');
    expect(healthy.allowed).toBe(true);
    expect(healthy.requiresConfirmation).toBe(false);

    const lowHeadroom = evaluateStorageQuotaForOperation({
      operation: 'photo_reoptimize',
      operationLabel: 'Re-optimize Photos',
      estimatedRequiredBytes: 2_000_000,
      opfsSupported: true,
      storageStatus: {
        supported: true,
        persisted: false,
        usageBytes: 84_000_000,
        quotaBytes: 100_000_000,
        percentUsed: 84,
      },
    });
    expect(lowHeadroom.level).toBe('warn');
    expect(lowHeadroom.allowed).toBe(true);
    expect(lowHeadroom.requiresConfirmation).toBe(true);

    const critical = evaluateStorageQuotaForOperation({
      operation: 'support_bundle_zip',
      operationLabel: 'Support ZIP Export',
      estimatedRequiredBytes: 4_000_000,
      opfsSupported: false,
      storageStatus: {
        supported: true,
        persisted: false,
        usageBytes: 97_000_000,
        quotaBytes: 100_000_000,
        percentUsed: 97,
      },
    });
    expect(critical.level).toBe('blocked');
    expect(critical.allowed).toBe(false);
    expect(critical.requiresConfirmation).toBe(false);
  });

  it('never blocks space-freeing OPFS /tmp or cache purges even at 99% usage', () => {
    const tmpPurge = evaluateStorageQuotaForOperation({
      operation: 'opfs_tmp_purge',
      operationLabel: 'Purge OPFS /tmp',
      estimatedRequiredBytes: 0,
      opfsSupported: true,
      storageStatus: {
        supported: true,
        persisted: false,
        usageBytes: 99_500_000,
        quotaBytes: 100_000_000,
        percentUsed: 99.5,
      },
    });
    expect(tmpPurge.allowed).toBe(true);
    expect(tmpPurge.level).toBe('ok');

    const cachePurge = evaluateStorageQuotaForOperation({
      operation: 'cache_purge_rebuild',
      operationLabel: 'Purge Stale Caches',
      estimatedRequiredBytes: 0,
      opfsSupported: false,
      storageStatus: {
        supported: true,
        persisted: false,
        usageBytes: 99_500_000,
        quotaBytes: 100_000_000,
        percentUsed: 99.5,
      },
    });
    expect(cachePurge.allowed).toBe(true);
  });

  it('handles missing StorageManager quota telemetry gracefully with OPFS hint', () => {
    const fallback = evaluateStorageQuotaForOperation({
      operation: 'pre_upgrade_backup',
      operationLabel: 'Pre-Upgrade Backup',
      estimatedRequiredBytes: 512_000,
      opfsSupported: false,
      requiresOpfsPreferred: true,
      storageStatus: null,
    });
    expect(fallback.allowed).toBe(true);
    expect(fallback.level).toBe('warn');
    expect(fallback.storageApiSupported).toBe(false);
  });

  it('validates and sanitizes manual diagnostic trigger payloads strictly', () => {
    const valid = validateDiagnosticTriggerInput({
      level: 'WARN',
      category: 'memory',
      message: '  Heap\nprobe\tcheck\u0000  ',
      note: 'Manual field note\u0007',
    });
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.value.level).toBe('warn');
      expect(valid.value.category).toBe('memory');
      expect(valid.value.message).toBe('Heap probe check');
      expect(valid.value.note).toBe('Manual field note');
    }

    expect(
      validateDiagnosticTriggerInput({ level: 'fatal', category: 'storage', message: 'abc' }).ok
    ).toBe(false);
    expect(
      validateDiagnosticTriggerInput({ level: 'info', category: 'network', message: 'abc' }).ok
    ).toBe(false);
    expect(
      validateDiagnosticTriggerInput({ level: 'info', category: 'lifecycle', message: 'ab' }).ok
    ).toBe(false);
    expect(validateDiagnosticTriggerInput(null).ok).toBe(false);
  });

  it('validates log retention days, PWA update policies, and support email inputs', () => {
    expect(validateLogRetentionDaysOverride(7)).toEqual({ ok: true, days: 7 });
    expect(validateLogRetentionDaysOverride('14')).toEqual({ ok: true, days: 14 });
    expect(validateLogRetentionDaysOverride(30).ok).toBe(false);

    expect(validatePwaUpdatePolicyOverride('pinned')).toEqual({ ok: true, policy: 'pinned' });
    expect(validatePwaUpdatePolicyOverride('force').ok).toBe(false);

    expect(validateSupportRecipientEmail('')).toEqual({ ok: true, email: '' });
    expect(validateSupportRecipientEmail('  help@barnproject.org  ')).toEqual({
      ok: true,
      email: 'help@barnproject.org',
    });
    expect(validateSupportRecipientEmail('bad\nheader@evil.com').ok).toBe(false);
    expect(validateSupportRecipientEmail('not-an-email').ok).toBe(false);
  });

  it('requires exact confirmation phrases (case/whitespace normalized) for destructive developer actions', () => {
    expect(
      isDestructiveActionConfirmationValid(
        'factory_restore',
        `  ${DESTRUCTIVE_CONFIRM_PHRASES.factory_restore.toLowerCase()}  `
      )
    ).toBe(true);
    expect(isDestructiveActionConfirmationValid('factory_restore', 'FACTORY')).toBe(false);
    expect(isDestructiveActionConfirmationValid('wipe_all_animals', 'WIPE RECORDS')).toBe(true);
    expect(isDestructiveActionConfirmationValid('rebuild_local_db', 'REBUILD DB')).toBe(true);
    expect(isDestructiveActionConfirmationValid('clear_sync_outbox', 'RESET SYNC')).toBe(true);
    expect(isDestructiveActionConfirmationValid('purge_opfs_tmp', 'PURGE TMP')).toBe(true);
    expect(isDestructiveActionConfirmationValid('clear_diagnostic_logs', 'CLEAR LOGS')).toBe(true);
  });
});
```

## `src/core/__tests__/testFixtures.ts`

```typescript
import {
  Animal,
  BarnDatabaseSnapshot,
  BarnSettings,
  PREDEFINED_SPECIES_PRESETS,
  SpeciesProfile,
} from '../models';

const TS = '2026-01-15T12:00:00.000Z';

export function makeSpeciesProfile(name: string): SpeciesProfile {
  const preset = PREDEFINED_SPECIES_PRESETS.find(
    (p) => p.name.toLowerCase() === name.toLowerCase()
  );
  if (preset) {
    return { ...preset, createdAt: TS, updatedAt: TS };
  }
  return {
    id: `species-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    gestationDays: 31,
    rebreedDaysAfterBirth: 21,
    weanDaysAfterBirth: 42,
    birthEventLabel: 'Kindling',
    maleLabel: 'Buck',
    femaleLabel: 'Doe',
    offspringLabel: 'Kit',
    exampleBreeds: ['New Zealand'],
    milestones: [],
    createdAt: TS,
    updatedAt: TS,
  };
}

export function makeSettings(overrides: Partial<BarnSettings> = {}): BarnSettings {
  return {
    id: 'default',
    barnName: 'Meadowbrook Rabbitry',
    breederName: 'Kim',
    preferredUnit: 'lbs_oz',
    defaultSpecies: 'Rabbit',
    pinnedLandingSpecies: '',
    defaultGenerations: 3,
    themeMode: 'light',
    updatedAt: TS,
    ...overrides,
  };
}

export function makeAnimal(
  id: string,
  overrides: Partial<Animal> = {}
): Animal {
  return {
    id,
    tattoo: id.toUpperCase(),
    name: overrides.name ?? `Animal ${id}`,
    species: 'Rabbit',
    breed: 'New Zealand',
    variety: 'Red',
    sex: 'Unknown',
    status: 'Active',
    birthDateIso: '2025-01-01',
    weightGrams: 4000,
    genotype: [],
    genotypeRaw: '',
    registrationNumber: '',
    grandChampionNumber: '',
    legsCount: 0,
    cageLocation: 'R-1',
    breederName: 'Kim',
    ownerName: 'Kim',
    sireId: '',
    damId: '',
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

export function makeEmptySnapshot(overrides: Partial<BarnDatabaseSnapshot> = {}): BarnDatabaseSnapshot {
  return {
    settings: makeSettings(),
    speciesProfiles: [makeSpeciesProfile('Rabbit'), makeSpeciesProfile('Sheep')],
    animals: [],
    animalPhotos: [],
    cages: [],
    breedings: [],
    tasks: [],
    careLogs: [],
    shows: [],
    feedBatches: [],
    feedAllocations: [],
    ledgerEntries: [],
    processingLogs: [],
    youthProjectBooks: [],
    clientContacts: [],
    waitlistEntries: [],
    animalReservations: [],
    woolHarvests: [],
    ...overrides,
  };
}
```

## `src/core/__tests__/upgradeGate.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildVerifiedPreUpgradeJsonBackup,
  CURRENT_BACKUP_SCHEMA_VERSION,
  verifyPreUpgradeJsonBackup,
} from '../backupVault';
import { buildFullPredefinedSampleSnapshot } from '../sampleData';
import {
  computeHttpDateClockSkewMs,
  CURRENT_APP_VERSION,
  evaluateUpgradeGate,
  parseStatusManifestJson,
  parseVersionManifestJson,
} from '../upgradeGate';

describe('upgradeGate — release manifests, safe-harbor floor & schema gates', () => {
  it('parses version.json and status.json manifests safely and rejects invalid roots', () => {
    expect(parseVersionManifestJson(null)).toBeNull();
    expect(parseVersionManifestJson([])).toBeNull();
    expect(parseVersionManifestJson({ schemaVersion: 6 })).toBeNull();

    const parsedVer = parseVersionManifestJson({
      appVersion: '0.2.0',
      schemaVersion: 8,
      minDirectUpgradeSchema: 5,
      releaseNotes: '  Major pedigree release  ',
    });
    expect(parsedVer).toEqual({
      appVersion: '0.2.0',
      schemaVersion: 8,
      minDirectUpgradeSchema: 5,
      releaseNotes: 'Major pedigree release',
    });

    expect(parseStatusManifestJson('bad')).toBeNull();
    const parsedStatus = parseStatusManifestJson({
      allowUpdates: false,
      revokedVersions: [' 0.1.0-bad ', '', 123],
      advisoryMessage: 'Maintenance window active',
    });
    expect(parsedStatus).toEqual({
      allowUpdates: false,
      revokedVersions: ['0.1.0-bad'],
      advisoryMessage: 'Maintenance window active',
    });
  });

  it('evaluates all 5 UpgradeGateDecision states including schemaDelta>=2 verified bypass', () => {
    // 1. Paused via allowUpdates=false
    const paused = evaluateUpgradeGate({
      currentAppVersion: CURRENT_APP_VERSION,
      currentSchemaVersion: 6,
      remoteVersion: { appVersion: '0.2.0', schemaVersion: 6, minDirectUpgradeSchema: 4 },
      remoteStatus: { allowUpdates: false, revokedVersions: [] },
    });
    expect(paused.status).toBe('blocked_paused');
    expect(paused.canProceedWithDirectSwSwap).toBe(false);

    // 2. Revoked release block (matches either target or current)
    const revokedTarget = evaluateUpgradeGate({
      currentAppVersion: CURRENT_APP_VERSION,
      currentSchemaVersion: 6,
      remoteVersion: { appVersion: '0.1.5-bad', schemaVersion: 6, minDirectUpgradeSchema: 4 },
      remoteStatus: { allowUpdates: true, revokedVersions: ['0.1.5-bad'] },
    });
    expect(revokedTarget.status).toBe('blocked_revoked');
    expect(revokedTarget.canProceedWithDirectSwSwap).toBe(false);

    const revokedCurrent = evaluateUpgradeGate({
      currentAppVersion: '0.0.9-recalled',
      currentSchemaVersion: 6,
      remoteVersion: { appVersion: '0.2.0', schemaVersion: 6, minDirectUpgradeSchema: 4 },
      remoteStatus: { allowUpdates: true, revokedVersions: ['0.0.9-recalled'] },
    });
    expect(revokedCurrent.status).toBe('blocked_revoked');
    expect(revokedCurrent.canProceedWithDirectSwSwap).toBe(false);

    // 3. Safe-Harbor Archive & Re-Import required when local schema < minDirectUpgradeSchema
    const safeHarbor = evaluateUpgradeGate({
      currentAppVersion: CURRENT_APP_VERSION,
      currentSchemaVersion: 4,
      remoteVersion: { appVersion: '0.3.0', schemaVersion: 8, minDirectUpgradeSchema: 6 },
      remoteStatus: { allowUpdates: true, revokedVersions: [] },
    });
    expect(safeHarbor.status).toBe('requires_safe_harbor_reset');
    expect(safeHarbor.requiresSafeHarborReset).toBe(true);
    expect(safeHarbor.canProceedWithDirectSwSwap).toBe(false);

    // 4. schemaDelta >= 2 without verified backup blocks until verified
    const unverifiedDelta = evaluateUpgradeGate({
      currentAppVersion: CURRENT_APP_VERSION,
      currentSchemaVersion: 6,
      remoteVersion: { appVersion: '0.4.0', schemaVersion: 8, minDirectUpgradeSchema: 4 },
      remoteStatus: { allowUpdates: true, revokedVersions: [] },
      backupVerifiedForTarget: false,
    });
    expect(unverifiedDelta.status).toBe('requires_verified_backup');
    expect(unverifiedDelta.schemaDelta).toBe(2);
    expect(unverifiedDelta.requiresVerifiedBackup).toBe(true);
    expect(unverifiedDelta.canProceedWithDirectSwSwap).toBe(false);

    // 5. Same delta with verified pre-upgrade backup proceeds safely
    const verifiedDelta = evaluateUpgradeGate({
      currentAppVersion: CURRENT_APP_VERSION,
      currentSchemaVersion: 6,
      remoteVersion: { appVersion: '0.4.0', schemaVersion: 8, minDirectUpgradeSchema: 4 },
      remoteStatus: { allowUpdates: true, revokedVersions: [] },
      backupVerifiedForTarget: true,
    });
    expect(verifiedDelta.status).toBe('allowed');
    expect(verifiedDelta.canProceedWithDirectSwSwap).toBe(true);
  });

  it('computes signed HTTP Date clock skew in ms cleanly', () => {
    const localNow = Date.UTC(2026, 4, 10, 12, 0, 0);
    const serverHeader = new Date(localNow + 420_000).toUTCString();
    expect(computeHttpDateClockSkewMs(serverHeader, localNow)).toBe(420_000);
    expect(computeHttpDateClockSkewMs('not-a-date', localNow)).toBeNull();
    expect(computeHttpDateClockSkewMs(null, localNow)).toBeNull();
  });
});

describe('pre-upgrade SHA-256 JSON backup creation & tamper verification', () => {
  it('builds a _schemaVersion-stamped pre_upgrade backup and detects checksum tampering', () => {
    const snapshot = buildFullPredefinedSampleSnapshot();
    const { envelope, jsonText, verification } = buildVerifiedPreUpgradeJsonBackup(
      snapshot,
      CURRENT_APP_VERSION,
      'Stage A test backup'
    );

    expect(envelope.vaultKind).toBe('pre_upgrade');
    expect(envelope._schemaVersion).toBe(CURRENT_BACKUP_SCHEMA_VERSION);
    expect(verification.ok).toBe(true);
    expect(verification.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(verification.animalCount).toBe(snapshot.animals.length);

    expect(verifyPreUpgradeJsonBackup(jsonText, envelope.checksumSha256).ok).toBe(true);

    // Tamper snapshot payload after signing
    const tampered = JSON.parse(jsonText);
    tampered.snapshot.settings.barnName = 'Tampered Name';
    const tamperedCheck = verifyPreUpgradeJsonBackup(
      JSON.stringify(tampered),
      envelope.checksumSha256
    );
    expect(tamperedCheck.ok).toBe(false);
    expect(tamperedCheck.reason).toMatch(/checksum/i);
  });
});
```

## `src/core/__tests__/woolFiber.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildWoolHarvestSummaryByAnimalId,
  compute90DayEquivalentGrams,
  computeDaysBetweenDateIso,
  computeIagarbScoreTotal,
  evaluateIagarbEligibility,
  formatWoolWeightSummary,
  IAGARB_JUDGING_POSITIONS,
  IAGARB_MAX_POINTS,
  IAGARB_MIN_90_DAY_WOOL_GRAMS,
  IAGARB_REGISTRATION_MIN_POINTS,
  normalizeIagarbScorecard,
  normalizeWoolHarvest,
  summarizeAnimalWoolHarvests,
} from '../woolFiber';
import { WoolHarvest } from '../models';

function makeHarvest(overrides: Partial<WoolHarvest> = {}): WoolHarvest {
  return {
    id: overrides.id ?? 'wh-1',
    species: overrides.species ?? 'Rabbit',
    animalId: overrides.animalId ?? 'a1',
    harvestDateIso: overrides.harvestDateIso ?? '2026-06-01',
    shearingIntervalDays: overrides.shearingIntervalDays,
    primeWeightGrams: overrides.primeWeightGrams ?? 260,
    gradeWeightGrams: overrides.gradeWeightGrams ?? 90,
    harvestMethod: overrides.harvestMethod ?? 'Shear',
    stapleLengthMm: overrides.stapleLengthMm ?? 75,
    iagarbScore: overrides.iagarbScore,
    witnessedBy: overrides.witnessedBy,
    notes: overrides.notes ?? '',
    createdAt: overrides.createdAt ?? '2026-06-01T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-06-01T10:00:00.000Z',
  };
}

describe('woolFiber — fiber harvests, 90-day yield conversion & IAGARB scorecard', () => {
  it('defines the 7 official IAGARB judging positions summing exactly to 100 points', () => {
    expect(IAGARB_JUDGING_POSITIONS).toHaveLength(7);
    const totalMax = IAGARB_JUDGING_POSITIONS.reduce((acc, pos) => acc + pos.maxPoints, 0);
    expect(totalMax).toBe(IAGARB_MAX_POINTS);
    expect(IAGARB_REGISTRATION_MIN_POINTS).toBe(80);
    expect(IAGARB_MIN_90_DAY_WOOL_GRAMS).toBe(325);
  });

  it('computes and clamps IAGARB category weights accurately', () => {
    const clampedTotal = computeIagarbScoreTotal({
      weightPts: 25, // max 20
      bodyTypePts: 18,
      densityLengthPts: 14,
      uniformityPts: 15,
      texturePts: 12.5,
      furnishingsPts: 9,
      conditionPts: 4.5,
    });
    expect(clampedTotal).toBe(93);

    const normalized = normalizeIagarbScorecard({
      weightPts: 19,
      bodyTypePts: 17,
      densityLengthPts: 13,
      uniformityPts: 12,
      texturePts: 13,
      furnishingsPts: 8,
      conditionPts: 4,
      evaluatorName: '  Pat Judge  ',
      evaluationDateIso: '2026-05-10',
    });
    expect(normalized?.totalPts).toBe(86);
    expect(normalized?.evaluatorName).toBe('Pat Judge');
    expect(normalized?.evaluationDateIso).toBe('2026-05-10');

    expect(
      normalizeIagarbScorecard({
        weightPts: 0,
        bodyTypePts: 0,
        densityLengthPts: 0,
        uniformityPts: 0,
        texturePts: 0,
        furnishingsPts: 0,
        conditionPts: 0,
      })
    ).toBeUndefined();
  });

  it('evaluates IAGARB registration and 325g/90-day performance yield thresholds', () => {
    const qualified = evaluateIagarbEligibility(84.5, 340);
    expect(qualified.meetsPointsThreshold).toBe(true);
    expect(qualified.meets90DayYieldThreshold).toBe(true);
    expect(qualified.overallEligible).toBe(true);
    expect(qualified.statusLabel).toContain('Qualified');

    const lowYield = evaluateIagarbEligibility(88, 290);
    expect(lowYield.meetsPointsThreshold).toBe(true);
    expect(lowYield.meets90DayYieldThreshold).toBe(false);
    expect(lowYield.overallEligible).toBe(false);
    expect(lowYield.statusLabel).toContain('Below 325g/90d Yield');

    const lowScore = evaluateIagarbEligibility(76, 400);
    expect(lowScore.meetsPointsThreshold).toBe(false);
    expect(lowScore.overallEligible).toBe(false);
    expect(lowScore.statusLabel).toContain('Below IAGARB Reg Threshold');

    const scoreOnly = evaluateIagarbEligibility(82, null);
    expect(scoreOnly.meetsPointsThreshold).toBe(true);
    expect(scoreOnly.meets90DayYieldThreshold).toBeNull();
    expect(scoreOnly.overallEligible).toBe(true);
  });

  it('computes exact calendar day intervals via Date.UTC and normalizes weights to a 90-day cycle', () => {
    expect(computeDaysBetweenDateIso('2026-01-01', '2026-04-01')).toBe(90);
    expect(computeDaysBetweenDateIso('invalid', '2026-04-01')).toBeNull();

    expect(compute90DayEquivalentGrams(360, 90)).toBe(360);
    expect(compute90DayEquivalentGrams(220, 60)).toBe(330);
    expect(compute90DayEquivalentGrams(0, 90)).toBeNull();
    expect(compute90DayEquivalentGrams(300, 0)).toBeNull();
  });

  it('normalizes malformed wool harvests cleanly and summarizes multi-harvest timelines', () => {
    expect(normalizeWoolHarvest({ animalId: '' })).toBeNull();
    const cleaned = normalizeWoolHarvest({
      animalId: 'angora-1',
      species: 'Rabbit',
      harvestDateIso: '2026-07-15',
      primeWeightGrams: -10,
      gradeWeightGrams: 120.44,
      harvestMethod: 'pluck',
      stapleLengthMm: 82,
    });
    expect(cleaned).not.toBeNull();
    expect(cleaned?.primeWeightGrams).toBe(0);
    expect(cleaned?.gradeWeightGrams).toBe(120.4);
    expect(cleaned?.harvestMethod).toBe('Pluck');

    const scorecard1 = normalizeIagarbScorecard({
      weightPts: 17,
      bodyTypePts: 16,
      densityLengthPts: 12,
      uniformityPts: 12,
      texturePts: 12,
      furnishingsPts: 8,
      conditionPts: 4,
    });
    const scorecard2 = normalizeIagarbScorecard({
      weightPts: 19,
      bodyTypePts: 18,
      densityLengthPts: 13,
      uniformityPts: 13,
      texturePts: 13,
      furnishingsPts: 8.5,
      conditionPts: 4.5,
    });

    const harvests: WoolHarvest[] = [
      makeHarvest({
        id: 'wh-1',
        animalId: 'angora-1',
        harvestDateIso: '2026-01-01',
        shearingIntervalDays: 90,
        primeWeightGrams: 250,
        gradeWeightGrams: 90,
        iagarbScore: scorecard1,
      }),
      makeHarvest({
        id: 'wh-2',
        animalId: 'angora-1',
        harvestDateIso: '2026-04-01',
        // Derived 90-day interval from previous harvest date 2026-01-01 -> 2026-04-01
        shearingIntervalDays: undefined,
        primeWeightGrams: 270,
        gradeWeightGrams: 90,
        iagarbScore: scorecard2,
      }),
      makeHarvest({
        id: 'wh-other',
        animalId: 'angora-2',
        harvestDateIso: '2026-04-01',
        shearingIntervalDays: 90,
        primeWeightGrams: 180,
        gradeWeightGrams: 60,
      }),
    ];

    const summary = summarizeAnimalWoolHarvests(harvests, 'angora-1');
    expect(summary.harvestCount).toBe(2);
    expect(summary.primeGrams).toBe(520);
    expect(summary.gradeGrams).toBe(180);
    expect(summary.totalGrams).toBe(700);
    expect(summary.primePercent).toBe(74);
    expect(summary.averagePerHarvestGrams).toBe(350);
    expect(summary.average90DayRateGrams).toBe(350);
    expect(summary.latest90DayRateGrams).toBe(360);
    expect(summary.highestIagarbScore?.totalPts).toBe(89);
    expect(summary.eligibility.overallEligible).toBe(true);

    const byAnimal = buildWoolHarvestSummaryByAnimalId(harvests);
    expect(byAnimal.size).toBe(2);
    expect(formatWoolWeightSummary(summary, { compact: true })).toContain('700g wool');
    expect(formatWoolWeightSummary(summary)).toContain('IAGARB 89/100');
  });
});
```

## `src/core/exporters/exporterTypes.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Modular Non-Native & External Format Exporter Interfaces (`src/core/exporters/exporterTypes.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`, `File`, `Blob`) dependencies
 * so the exact same exporter definitions and output serializers run identically in Web/PWA,
 * automated tests, and React Native / Expo.
 */

import type { BarnDatabaseSnapshot, PedigreeGenerationDepth } from '../models';

export type ExporterCategory =
  | 'spreadsheet'
  | 'pedigree_document'
  | 'calendar'
  | 'report_dto'
  | 'external_schema';

export type ExporterScopeMode =
  | 'all_or_species'
  | 'species_required'
  | 'single_animal'
  | 'open_tasks';

export type ExporterReadinessStatus = 'ready' | 'planned';

export interface ExporterExecutionContext {
  snapshot: BarnDatabaseSnapshot;
  /** Optional species filter (`undefined` or empty string means all species when supported). */
  speciesName?: string;
  /** Required when `scopeMode === 'single_animal'`. */
  animalId?: string;
  /** Pedigree chart depth override (3..8). Defaults to `snapshot.settings.defaultGenerations`. */
  generations?: PedigreeGenerationDepth;
  /** Optional toggle for binder/report exporters that filter archived stock. */
  includeArchived?: boolean;
  /** Optional base URL for `.ICS` deep links back into the app. */
  appBaseUrl?: string;
}

export interface ExportedArtifactPayload {
  exporterId: string;
  filename: string;
  mimeType: string;
  content: string;
  recordCount: number;
  summary: string;
  warnings: string[];
}

export interface ExternalExporterDescriptor {
  readonly id: string;
  readonly name: string;
  readonly formatExtension: string;
  readonly category: ExporterCategory;
  readonly targetPlatform: string;
  readonly scopeMode: ExporterScopeMode;
  readonly supportsSpeciesFilter: boolean;
  readonly description: string;
  readonly compatibilityNote: string;
  readonly status: ExporterReadinessStatus;
  readonly schemaFields?: readonly string[];
  exportPayload?: (context: ExporterExecutionContext) => ExportedArtifactPayload;
}
```

## `src/core/exporters/registry.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Central Non-Native & Extensible External Exporter Registry (`src/core/exporters/registry.ts`).
 *
 * Mirrors `src/core/importers/registry.ts` so every non-native format or future external platform
 * schema (CSV spreadsheets, Evans .HTM, Printable Barn Binders, Report DTO JSON, .ICS calendars,
 * and future HerdBoss / Kintracs / Registry CSV schemas) registers in one declarative structure
 * with zero UI rewrite.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`, `File`, `Blob`) dependencies.
 */

import {
  buildBarnBinderFileName,
  buildDefaultBarnBinderOptions,
  generateSpeciesBarnBinderHtml,
} from '../barnBinder';
import { buildIcsCalendarForTasks } from '../calendarExport';
import { buildCleanCsvExportFileName, exportAnimalsCsv } from '../csvExport';
import {
  isSameSpecies,
  normalizeDefaultPedigreeGenerations,
  normalizePedigreeGenerationDepth,
  nowIsoUtc,
} from '../models';
import {
  buildShareablePedigreeCardFileName,
  generateShareablePedigreeCardHtml,
} from '../shareablePedigreeCard';
import {
  buildPdfReadyBarnSnapshot,
  generateEvansHtmPedigree,
} from '../syncAndExports';
import type {
  ExportedArtifactPayload,
  ExporterExecutionContext,
  ExternalExporterDescriptor,
} from './exporterTypes';

function sanitizeFileSlug(raw: string | undefined, fallback: string): string {
  const cleaned = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function getLocalDateSlug(): string {
  return nowIsoUtc().slice(0, 10);
}

export const BUILTIN_NON_NATIVE_EXPORTERS: readonly ExternalExporterDescriptor[] = [
  {
    id: 'clean-csv',
    name: 'Herd Roster Spreadsheet',
    formatExtension: '.CSV',
    category: 'spreadsheet',
    targetPlatform: 'Excel / Google Sheets / LibreOffice',
    scopeMode: 'all_or_species',
    supportsSpeciesFilter: true,
    status: 'ready',
    description:
      'RFC-4180 UTF-8 BOM spreadsheet with human-readable sire/dam names, tattoos, weights, COI, genotypes, and carrier disclosures.',
    compatibilityNote:
      'Sanitizes spreadsheet formula prefixes (=, +, -, @) while preserving numeric signs and photo filenames.',
    schemaFields: [
      'Species',
      'Tattoo / ID',
      'Name',
      'Breed & Variety',
      'Sire / Dam Resolved Refs',
      'Genotype & Carriers',
      'Lifecycle & Financials',
    ],
    exportPayload(context: ExporterExecutionContext): ExportedArtifactPayload {
      const { snapshot, speciesName } = context;
      const scopedSpecies = speciesName?.trim() || undefined;
      const scopedAnimals = scopedSpecies
        ? snapshot.animals.filter((a) => isSameSpecies(a.species, scopedSpecies))
        : snapshot.animals;
      const filename = buildCleanCsvExportFileName(
        snapshot.settings.barnName,
        scopedSpecies,
        getLocalDateSlug()
      );
      const content = exportAnimalsCsv(
        snapshot.animals,
        snapshot.speciesProfiles,
        snapshot.settings,
        scopedSpecies,
        snapshot.animalPhotos ?? []
      );
      return {
        exporterId: 'clean-csv',
        filename,
        mimeType: 'text/csv;charset=utf-8',
        content,
        recordCount: scopedAnimals.length,
        summary: `Exported ${scopedAnimals.length} ${
          scopedSpecies ? `${scopedSpecies} ` : ''
        }animal record(s) to ${filename} with resolved parent names & tattoos.`,
        warnings:
          scopedAnimals.length === 0
            ? ['Header row exported cleanly, though zero animals matched the current scope.']
            : [],
      };
    },
  },
  {
    id: 'evans-htm',
    name: 'Evans Pedigree Certificate',
    formatExtension: '.HTM',
    category: 'pedigree_document',
    targetPlatform: 'Evans Software / Browser / Print PDF',
    scopeMode: 'single_animal',
    supportsSpeciesFilter: true,
    status: 'ready',
    description:
      'Standalone multi-generation .HTM pedigree certificate formatted for external sharing, registry submission, and archival printing.',
    compatibilityNote:
      'Embeds optional subject photo and Breeder Certification signature block on clean light paper CSS.',
    schemaFields: [
      '3–8 Gen Ancestor Matrix',
      'Wright COI %',
      'Genotype & Carriers',
      'Reg / GC / Legs',
      'Certification Block',
    ],
    exportPayload(context: ExporterExecutionContext): ExportedArtifactPayload {
      const { snapshot, animalId, generations } = context;
      const subject =
        snapshot.animals.find((a) => a.id === animalId) ||
        (context.speciesName
          ? snapshot.animals.find((a) => isSameSpecies(a.species, context.speciesName!))
          : snapshot.animals[0]);

      if (!subject) {
        throw new Error('Select an animal to export an Evans-compatible .HTM pedigree.');
      }

      const depth = normalizePedigreeGenerationDepth(
        generations ?? snapshot.settings.defaultGenerations,
        3
      );

      const primaryPhoto = (snapshot.animalPhotos ?? [])
        .filter((p) => p.animalId === subject.id)
        .sort((a, b) => (a.isPrimary === b.isPrimary ? a.sortOrder - b.sortOrder : a.isPrimary ? -1 : 1))[0];

      const html = generateEvansHtmPedigree(
        subject,
        snapshot.animals,
        snapshot.speciesProfiles,
        snapshot.settings,
        depth,
        snapshot.settings.includePhotoOnPedigree !== false
          ? primaryPhoto?.dataUrl || primaryPhoto?.thumbnailDataUrl
          : undefined,
        {
          shows: snapshot.shows,
          careLogs: snapshot.careLogs,
        }
      );

      const slug = sanitizeFileSlug(subject.tattoo || subject.name, 'animal');
      const filename = `pedigree-${slug}-${depth}gen-${getLocalDateSlug()}.htm`;
      return {
        exporterId: 'evans-htm',
        filename,
        mimeType: 'text/html;charset=utf-8',
        content: html,
        recordCount: 1,
        summary: `Exported ${depth}-generation Evans-compatible .HTM pedigree for ${subject.name}${
          subject.tattoo ? ` (${subject.tattoo})` : ''
        }.`,
        warnings: [],
      };
    },
  },
  {
    id: 'shareable-pedigree-card',
    name: 'Shareable Pedigree Card',
    formatExtension: '.HTML',
    category: 'pedigree_document',
    targetPlatform: 'Mobile Browser / Messaging / Buyer Packet',
    scopeMode: 'single_animal',
    supportsSpeciesFilter: true,
    status: 'ready',
    description:
      'Lightweight standalone mobile-first HTML summary card with COI badge, honors, 3-generation tree, and optional collapsible Gen 4–8 lineage.',
    compatibilityNote:
      'Zero external scripts or fonts; embeds optional portrait, barn logo, and scannable QR profile badge.',
    schemaFields: [
      'Hero Portrait & Honors',
      'Wright COI Badge',
      '3-Gen Visual Grid',
      'Collapsible Gen 4–8 Ancestry',
      'Optional Profile QR',
    ],
    exportPayload(context: ExporterExecutionContext): ExportedArtifactPayload {
      const { snapshot, animalId, generations, appBaseUrl } = context;
      const subject =
        snapshot.animals.find((a) => a.id === animalId) ||
        (context.speciesName
          ? snapshot.animals.find((a) => isSameSpecies(a.species, context.speciesName!))
          : snapshot.animals[0]);

      if (!subject) {
        throw new Error('Select an animal to export a Shareable Pedigree Card.');
      }

      const depth = normalizePedigreeGenerationDepth(
        generations ?? snapshot.settings.defaultGenerations,
        3
      );

      const primaryPhoto = (snapshot.animalPhotos ?? [])
        .filter((p) => p.animalId === subject.id)
        .sort((a, b) => (a.isPrimary === b.isPrimary ? a.sortOrder - b.sortOrder : a.isPrimary ? -1 : 1))[0];

      const html = generateShareablePedigreeCardHtml(
        subject,
        snapshot.animals,
        snapshot.speciesProfiles,
        snapshot.settings,
        depth,
        snapshot.settings.includePhotoOnPedigree !== false
          ? primaryPhoto?.dataUrl || primaryPhoto?.thumbnailDataUrl
          : undefined,
        {
          shows: snapshot.shows,
          careLogs: snapshot.careLogs,
          appBaseUrl,
          includeQrCode: Boolean(appBaseUrl),
        }
      );

      const filename = buildShareablePedigreeCardFileName(subject);
      return {
        exporterId: 'shareable-pedigree-card',
        filename,
        mimeType: 'text/html;charset=utf-8',
        content: html,
        recordCount: 1,
        summary: `Exported lightweight ${depth}-gen Shareable Pedigree Card (${filename}) for ${subject.name}.`,
        warnings: [],
      };
    },
  },
  {
    id: 'barn-binder-htm',
    name: 'Printable Herd & Barn Binder',
    formatExtension: '.HTM',
    category: 'pedigree_document',
    targetPlatform: 'Offline Browser / Print-to-PDF Herd Book',
    scopeMode: 'species_required',
    supportsSpeciesFilter: true,
    status: 'ready',
    description:
      'Complete per-species offline HTML reference book with TOC, herd sheets, embedded pedigrees, breedings, cages, shows, and memo.',
    compatibilityNote:
      'Strictly scoped to one livestock species so terminology, gestation schedules, and weight units stay consistent.',
    schemaFields: [
      'Cover & TOC',
      'Species Schedule & Memo',
      'Animal Profile Cards & Photos',
      'Pedigrees & Kinship',
      'Medical & Breeding Logs',
    ],
    exportPayload(context: ExporterExecutionContext): ExportedArtifactPayload {
      const { snapshot, speciesName, includeArchived, generations } = context;
      const targetSpecies =
        speciesName?.trim() ||
        snapshot.settings.defaultSpecies ||
        snapshot.speciesProfiles[0]?.name ||
        'Rabbit';

      const binderGenerations = normalizeDefaultPedigreeGenerations(
        generations ?? snapshot.settings.defaultGenerations,
        3
      );
      const options = buildDefaultBarnBinderOptions(snapshot.settings, {
        includeArchived: Boolean(includeArchived),
        generations: binderGenerations,
      });
      const html = generateSpeciesBarnBinderHtml(snapshot, targetSpecies, options);
      const filename = buildBarnBinderFileName(
        snapshot.settings.barnName,
        targetSpecies,
        getLocalDateSlug()
      );
      const speciesAnimalCount = snapshot.animals.filter((a) =>
        isSameSpecies(a.species, targetSpecies)
      ).length;

      return {
        exporterId: 'barn-binder-htm',
        filename,
        mimeType: 'text/html;charset=utf-8',
        content: html,
        recordCount: speciesAnimalCount,
        summary: `Exported ${targetSpecies} Barn Binder (${filename}) covering ${speciesAnimalCount} ${targetSpecies} record(s).`,
        warnings:
          speciesAnimalCount === 0
            ? [`No ${targetSpecies} animals found yet — exported an empty species binder shell.`]
            : [],
      };
    },
  },
  {
    id: 'pdf-report-dto-json',
    name: 'Normalized Species Report DTO',
    formatExtension: '.JSON',
    category: 'report_dto',
    targetPlatform: 'Custom Report Pipelines / Audit Spreadsheets / Print Tools',
    scopeMode: 'all_or_species',
    supportsSpeciesFilter: true,
    status: 'ready',
    description:
      'Clean flat JSON projection resolving formatted weights, Wright COI %, carrier disclosures, sire/dam summaries, and disposition dates.',
    compatibilityNote:
      'Built for external reporting scripts or downstream print pipelines—distinct from native system restore backups.',
    schemaFields: [
      'barnName / breederName',
      'openTasksCount / activeBreedingsCount',
      'Resolved Animal DTO Rows',
      'COI % & Carrier Disclosures',
    ],
    exportPayload(context: ExporterExecutionContext): ExportedArtifactPayload {
      const { snapshot, speciesName } = context;
      const scopedSpecies = speciesName?.trim() || undefined;
      const dto = buildPdfReadyBarnSnapshot(snapshot, scopedSpecies);
      const slug = scopedSpecies
        ? `barn-report-${sanitizeFileSlug(scopedSpecies, 'species')}-${getLocalDateSlug()}.json`
        : `barn-report-all-species-${getLocalDateSlug()}.json`;

      return {
        exporterId: 'pdf-report-dto-json',
        filename: slug,
        mimeType: 'application/json;charset=utf-8',
        content: JSON.stringify(dto, null, 2),
        recordCount: dto.totalAnimals,
        summary: `Exported ${dto.totalAnimals} normalized report DTO record(s) to ${slug}.`,
        warnings: [],
      };
    },
  },
  {
    id: 'calendar-ics',
    name: 'Barn Chores & Breeding Calendar',
    formatExtension: '.ICS',
    category: 'calendar',
    targetPlatform: 'Apple Calendar / Outlook / Thunderbird / Google Import',
    scopeMode: 'open_tasks',
    supportsSpeciesFilter: true,
    status: 'ready',
    description:
      'Standard RFC-5545 .ics calendar feed exporting all open dated chores, palpations, kindling/birth due dates, and weaning reminders.',
    compatibilityNote:
      'Works 100% offline with VALARM reminders and stable UIDs so re-importing into external calendars updates cleanly.',
    schemaFields: ['VCALENDAR 2.0', 'VEVENT DTSTART/DTEND', 'VALARM Trigger', 'App Deep Links'],
    exportPayload(context: ExporterExecutionContext): ExportedArtifactPayload {
      const { snapshot, speciesName, appBaseUrl } = context;
      const scopedSpecies = speciesName?.trim() || undefined;
      const openTasks = snapshot.tasks.filter(
        (t) =>
          !t.completed &&
          (!scopedSpecies || isSameSpecies(t.species, scopedSpecies))
      );

      const generated = buildIcsCalendarForTasks(
        openTasks,
        snapshot.settings.calendarSync,
        snapshot.settings.barnName || 'Community Pedigree',
        scopedSpecies ? `${sanitizeFileSlug(scopedSpecies, 'barn')}-chores` : 'all-barn-chores',
        {
          animals: snapshot.animals,
          breedings: snapshot.breedings,
          speciesProfiles: snapshot.speciesProfiles,
          appBaseUrl,
        }
      );

      if (!generated) {
        throw new Error(
          `No open tasks with valid due dates found${
            scopedSpecies ? ` for ${scopedSpecies}` : ''
          }.`
        );
      }

      return {
        exporterId: 'calendar-ics',
        filename: generated.filename,
        mimeType: 'text/calendar;charset=utf-8',
        content: generated.icsContent,
        recordCount: generated.eventCount,
        summary: `Exported ${generated.eventCount} open scheduled chore(s) to ${generated.filename}.`,
        warnings: [],
      };
    },
  },
];

export const PLANNED_EXTERNAL_SCHEMA_TARGETS: readonly ExternalExporterDescriptor[] = [
  {
    id: 'herdboss-transfer-bundle',
    name: 'HerdBoss Transfer Tables',
    formatExtension: '.CSV / .ZIP',
    category: 'external_schema',
    targetPlatform: 'HerdBoss Schema Target',
    scopeMode: 'all_or_species',
    supportsSpeciesFilter: true,
    status: 'planned',
    description:
      'Relational CSV bundle mapping animals, breedings, litters, and weight logs back into HerdBoss column conventions.',
    compatibilityNote:
      'Extensible schema slot reserved; HerdBoss multi-ZIP/CSV import is already active in Section 2.',
    schemaFields: ['animals.csv', 'breedings.csv', 'weights.csv', 'pedigree_links.csv'],
  },
  {
    id: 'registry-worksheet-csv',
    name: 'Breed Registry & Show Worksheets',
    formatExtension: '.CSV',
    category: 'external_schema',
    targetPlatform: 'ARBA / ADGA / Custom Registry Forms',
    scopeMode: 'species_required',
    supportsSpeciesFilter: true,
    status: 'planned',
    description:
      'Targeted per-species worksheet columns tailored for registration applications, show entry secretaries, and external pedigree transfers.',
    compatibilityNote:
      'Use Herd Roster Spreadsheet (.CSV) or Printable Barn Binder (.HTM) today for full registration details.',
    schemaFields: ['Reg #', 'Ear Tattoo', '3-Gen Ancestor Reg #s', 'Legs / GC', 'Breeder Contact'],
  },
];

export function buildExporterCatalog(
  additionalExporters: readonly ExternalExporterDescriptor[] = []
): ExternalExporterDescriptor[] {
  const byId = new Map<string, ExternalExporterDescriptor>();
  for (const exp of BUILTIN_NON_NATIVE_EXPORTERS) {
    byId.set(exp.id, exp);
  }
  for (const exp of additionalExporters) {
    byId.set(exp.id, exp);
  }
  for (const exp of PLANNED_EXTERNAL_SCHEMA_TARGETS) {
    if (!byId.has(exp.id)) {
      byId.set(exp.id, exp);
    }
  }
  return Array.from(byId.values());
}

export const EXTERNAL_EXPORTERS: readonly ExternalExporterDescriptor[] = buildExporterCatalog();

export function getExternalExporterById(
  id: string,
  catalog: readonly ExternalExporterDescriptor[] = EXTERNAL_EXPORTERS
): ExternalExporterDescriptor | undefined {
  return catalog.find((exp) => exp.id === id);
}

export function runExternalExporter(
  id: string,
  context: ExporterExecutionContext,
  catalog: readonly ExternalExporterDescriptor[] = EXTERNAL_EXPORTERS
): ExportedArtifactPayload {
  const exporter = getExternalExporterById(id, catalog);
  if (!exporter) {
    throw new Error(`Unknown exporter "${id}".`);
  }
  if (exporter.status !== 'ready' || typeof exporter.exportPayload !== 'function') {
    throw new Error(
      `Exporter "${exporter.name}" is registered as a planned external schema target and is not yet active.`
    );
  }
  return exporter.exportPayload(context);
}
```

## `src/core/importers/archiveAndCsvUtils.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Multi-ZIP Unpacker, RFC-4180 CSV/TSV Parser & Unit Normalizers.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * Uses `fflate` (pure JS `Uint8Array` unzip) and standard `TextDecoder` with zero browser DOM
 * dependencies so multi-ZIP imports run identically on Web and React Native / Expo.
 */

import {
  isSafeRecordKey,
  MAX_CSV_ROWS,
  MAX_CSV_TEXT_BYTES,
  MAX_ZIP_ARCHIVE_BYTES,
  MAX_ZIP_ENTRY_BYTES,
  MAX_ZIP_ENTRY_COUNT,
  MAX_ZIP_UNCOMPRESSED_TOTAL_BYTES,
  safeUnzipArchive,
  sanitizePlainText,
  sanitizeSingleLineText,
  validateUploadFileSize,
} from '../inputSanitization';
import { RawArchiveInput, VirtualArchiveEntry } from './importerTypes';

const TEXT_EXTENSIONS = new Set([
  'csv',
  'tsv',
  'txt',
  'json',
  'xml',
  'htm',
  'html',
  'ped',
]);

const IMPORTABLE_IMAGE_MIMES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
};

const MEDIA_OR_BINARY_EXTENSIONS = new Set([
  ...Object.keys(IMPORTABLE_IMAGE_MIMES),
  'tif',
  'tiff',
  'dng',
  'raw',
  'svg',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'sqlite',
  'sqlite3',
  'db',
  'mp4',
  'mov',
]);

function getExtension(path: string): string {
  const clean = path.split('?')[0];
  const dotIdx = clean.lastIndexOf('.');
  if (dotIdx === -1 || dotIdx === clean.length - 1) return '';
  return clean.slice(dotIdx + 1).toLowerCase();
}

function getBaseName(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || normalized;
}

function isSystemJunkPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  if (normalized.endsWith('/')) return true;
  if (normalized.includes('__MACOSX/')) return true;
  const base = getBaseName(normalized);
  if (!base || base === '.DS_Store' || base.startsWith('._')) return true;
  return false;
}

function stripBom(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

function detectUnbommedUtf16(bytes: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  const sampleLen = Math.min(bytes.length, 512);
  if (sampleLen < 6) return null;
  let evenNulls = 0;
  let oddNulls = 0;
  let evenPrintable = 0;
  let oddPrintable = 0;
  for (let i = 0; i < sampleLen; i++) {
    const b = bytes[i];
    if (i % 2 === 0) {
      if (b === 0) evenNulls++;
      else if (b >= 0x20 && b <= 0x7e) evenPrintable++;
    } else {
      if (b === 0) oddNulls++;
      else if (b >= 0x20 && b <= 0x7e) oddPrintable++;
    }
  }
  const pairs = sampleLen / 2;
  if (oddNulls >= pairs * 0.6 && evenPrintable >= pairs * 0.5 && evenNulls < pairs * 0.1) {
    return 'utf-16le';
  }
  if (evenNulls >= pairs * 0.6 && oddPrintable >= pairs * 0.5 && oddNulls < pairs * 0.1) {
    return 'utf-16be';
  }
  return null;
}

/**
 * Decodes raw file bytes cleanly across UTF-8 (with or without BOM), UTF-16LE/BE (BOM or heuristic),
 * and legacy Windows-1252 / Latin-1 exports from desktop pedigree programs (e.g. Evans / Excel CSV).
 */
export function decodeTextBytes(bytes: Uint8Array): string {
  if (bytes.byteLength === 0) return '';

  // UTF-8 BOM: EF BB BF
  if (bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return stripBom(new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(3)));
  }

  // UTF-16LE BOM: FF FE
  if (bytes.byteLength >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    try {
      return stripBom(new TextDecoder('utf-16le', { fatal: false }).decode(bytes.subarray(2)));
    } catch {
      // Fall through
    }
  }

  // UTF-16BE BOM: FE FF
  if (bytes.byteLength >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    try {
      return stripBom(new TextDecoder('utf-16be', { fatal: false }).decode(bytes.subarray(2)));
    } catch {
      // Manual byte-swap fallback to utf-16le if runtime lacks utf-16be
      const aligned = bytes.subarray(2, bytes.byteLength - ((bytes.byteLength - 2) % 2));
      const swapped = new Uint8Array(aligned.length);
      for (let i = 0; i < aligned.length; i += 2) {
        swapped[i] = aligned[i + 1];
        swapped[i + 1] = aligned[i];
      }
      return stripBom(new TextDecoder('utf-16le', { fatal: false }).decode(swapped));
    }
  }

  // Un-BOMmed UTF-16 heuristic
  const utf16Hint = detectUnbommedUtf16(bytes);
  if (utf16Hint) {
    try {
      return stripBom(new TextDecoder(utf16Hint, { fatal: false }).decode(bytes));
    } catch {
      if (utf16Hint === 'utf-16be') {
        const len = bytes.byteLength - (bytes.byteLength % 2);
        const swapped = new Uint8Array(len);
        for (let i = 0; i < len; i += 2) {
          swapped[i] = bytes[i + 1];
          swapped[i + 1] = bytes[i];
        }
        return stripBom(new TextDecoder('utf-16le', { fatal: false }).decode(swapped));
      }
    }
  }

  // Strict UTF-8 first, falling back to Windows-1252 when invalid multibyte sequences appear
  try {
    return stripBom(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    try {
      return stripBom(new TextDecoder('windows-1252', { fatal: false }).decode(bytes));
    } catch {
      return stripBom(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
    }
  }
}

function hasBinaryMagicHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength >= 4) {
    // PDF: %PDF
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return true;
    }
    // PNG: 89 50 4E 47
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return true;
    }
    // ZIP/XLSX/DOCX: PK 03 04
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      return true;
    }
    // OLE2 (.xls / .doc): D0 CF 11 E0
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
      return true;
    }
  }
  // SQLite 3
  if (
    bytes.byteLength >= 16 &&
    bytes[0] === 0x53 &&
    bytes[1] === 0x51 &&
    bytes[2] === 0x4c &&
    bytes[3] === 0x69
  ) {
    return true;
  }
  return false;
}

function looksMostlyText(bytes: Uint8Array): boolean {
  if (bytes.byteLength === 0) return true;
  if (hasBinaryMagicHeader(bytes)) return false;

  // UTF-16 BOM or alternating NUL UTF-16 pattern
  if (
    bytes.byteLength >= 2 &&
    ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))
  ) {
    return true;
  }
  if (detectUnbommedUtf16(bytes)) return true;

  const sampleLen = Math.min(bytes.length, 512);
  let controlCount = 0;
  for (let i = 0; i < sampleLen; i++) {
    const b = bytes[i];
    if (b === 0) return false;
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) {
      controlCount++;
    }
  }
  return controlCount / sampleLen < 0.05;
}

/**
 * Unpacks one, two, or N uploaded `.zip` archives (including nested `.zip` archives if present)
 * alongside standalone `.csv`/`.json`/`.htm` files into a flat list of `VirtualArchiveEntry` items.
 * Binary photos/documents are flagged as `isMediaOrBinary: true` without wasting memory decoding them.
 */
export function extractVirtualEntries(
  inputs: RawArchiveInput[],
  maxDepth = 2
): VirtualArchiveEntry[] {
  const entries: VirtualArchiveEntry[] = [];
  let cumulativeEntries = 0;
  let cumulativeBytes = 0;

  const processBuffer = (archiveName: string, entryPath: string, bytes: Uint8Array, depth: number) => {
    if (isSystemJunkPath(entryPath)) return;
    cumulativeEntries++;
    if (cumulativeEntries > MAX_ZIP_ENTRY_COUNT) {
      throw new Error(
        `Import archives contain more than ${MAX_ZIP_ENTRY_COUNT.toLocaleString()} files and were rejected to protect memory.`
      );
    }

    const ext = getExtension(entryPath);
    const baseName = getBaseName(entryPath);

    // Unpack ZIP archives (and nested ZIPs up to maxDepth)
    if (ext === 'zip' && depth <= maxDepth) {
      const remainingBytes = Math.max(1024, MAX_ZIP_UNCOMPRESSED_TOTAL_BYTES - cumulativeBytes);
      const unzipped = safeUnzipArchive(bytes, {
        archiveName: entryPath || archiveName,
        maxArchiveBytes: MAX_ZIP_ARCHIVE_BYTES,
        maxEntries: MAX_ZIP_ENTRY_COUNT - cumulativeEntries + 1,
        maxEntryBytes: MAX_ZIP_ENTRY_BYTES,
        maxTotalUncompressedBytes: remainingBytes,
      });
      for (const [innerPath, innerBytes] of Object.entries(unzipped)) {
        processBuffer(archiveName, innerPath, innerBytes, depth + 1);
      }
      return;
    }

    cumulativeBytes += bytes.byteLength;
    if (cumulativeBytes > MAX_ZIP_UNCOMPRESSED_TOTAL_BYTES) {
      throw new Error(
        `Total extracted import data exceeded the rational ${Math.round(MAX_ZIP_UNCOMPRESSED_TOTAL_BYTES / (1024 * 1024))} MB limit.`
      );
    }

    if (MEDIA_OR_BINARY_EXTENSIONS.has(ext) || hasBinaryMagicHeader(bytes)) {
      const mimeHint = IMPORTABLE_IMAGE_MIMES[ext];
      entries.push({
        archiveName,
        entryPath,
        baseName,
        extension: ext,
        sizeBytes: bytes.byteLength,
        imageBytes: mimeHint ? bytes : undefined,
        mimeHint,
        isMediaOrBinary: true,
      });
      return;
    }

    if (TEXT_EXTENSIONS.has(ext) || looksMostlyText(bytes)) {
      const textLimitCheck = validateUploadFileSize(
        entryPath || archiveName,
        bytes.byteLength,
        MAX_CSV_TEXT_BYTES,
        'a tabular text / JSON import file'
      );
      if (!textLimitCheck.ok) {
        throw new Error(textLimitCheck.error);
      }
      entries.push({
        archiveName,
        entryPath,
        baseName,
        extension: ext || 'txt',
        sizeBytes: bytes.byteLength,
        textContent: decodeTextBytes(bytes),
        isMediaOrBinary: false,
      });
      return;
    }

    entries.push({
      archiveName,
      entryPath,
      baseName,
      extension: ext,
      sizeBytes: bytes.byteLength,
      isMediaOrBinary: true,
    });
  };

  for (const input of inputs) {
    processBuffer(input.fileName, input.fileName, input.bytes, 0);
  }

  return entries;
}

export interface ParsedDelimitedTable {
  headers: string[];
  rows: Array<Record<string, string>>;
}

/**
 * Detects whether the sample text uses `,`, `;`, `\t`, or `|`, inspecting the first few lines
 * so a single-line title preamble doesn't skew delimiter detection.
 */
function detectDelimiter(sampleText: string): string {
  const lines = sampleText.split('\n').slice(0, 6);
  const scoreLine = (line: string) => {
    let inQuotes = false;
    let commas = 0;
    let semis = 0;
    let tabs = 0;
    let pipes = 0;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes) {
        if (ch === ',') commas++;
        else if (ch === ';') semis++;
        else if (ch === '\t') tabs++;
        else if (ch === '|') pipes++;
      }
    }
    return { commas, semis, tabs, pipes };
  };

  // Prefer first line containing multiple delimiter candidates (skipping single-cell title lines)
  let best = { commas: 0, semis: 0, tabs: 0, pipes: 0 };
  for (const line of lines) {
    if (!line.trim()) continue;
    const s = scoreLine(line);
    if (s.tabs + s.semis + s.pipes + s.commas >= 2) {
      best = s;
      break;
    }
    if (s.tabs + s.semis + s.pipes + s.commas > best.tabs + best.semis + best.pipes + best.commas) {
      best = s;
    }
  }

  const { commas, semis, tabs, pipes } = best;
  if (tabs > commas && tabs >= semis && tabs >= pipes) return '\t';
  if (pipes > commas && pipes >= semis && pipes >= tabs) return '|';
  if (semis > commas && semis >= tabs) return ';';
  return ',';
}

/**
 * Single-pass RFC-4180 compliant CSV / TSV / pipe parser supporting quoted multi-line notes,
 * escaped `""`, optional Excel `sep=,` first line, title preamble skipping, prototype-key defense,
 * and EOF row-limit enforcement.
 */
export function parseDelimitedTable(rawText: string): ParsedDelimitedTable {
  if (rawText.length > MAX_CSV_TEXT_BYTES) {
    throw new Error(
      `Text table exceeds the rational ${Math.round(MAX_CSV_TEXT_BYTES / (1024 * 1024))} MB limit and was rejected.`
    );
  }
  let text = stripBom(rawText).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) return { headers: [], rows: [] };

  let forcedDelimiter: string | null = null;
  if (/^sep=.\n/i.test(text)) {
    forcedDelimiter = text[4];
    text = text.slice(6);
  }

  const delimiter = forcedDelimiter || detectDelimiter(text.slice(0, 4096));

  let headers: string[] | null = null;
  let preambleCandidate: string[] | null = null;
  let preambleCheckCount = 0;
  const rows: Array<Record<string, string>> = [];

  const finalizeHeaders = (cells: string[]): string[] => {
    const seenCounts = new Map<string, number>();
    return cells.map((h, idx) => {
      const clean = sanitizeSingleLineText(h, 200) || `column_${idx + 1}`;
      const base = isSafeRecordKey(clean) ? clean : `column_${idx + 1}`;
      const count = seenCounts.get(base) || 0;
      seenCounts.set(base, count + 1);
      return count === 0 ? base : `${base} (${count + 1})`;
    });
  };

  const pushRowObject = (hdrs: string[], values: string[]) => {
    if (rows.length >= MAX_CSV_ROWS) {
      throw new Error(
        `Spreadsheet table exceeds the ${MAX_CSV_ROWS.toLocaleString()}-row safety limit.`
      );
    }
    const obj: Record<string, string> = Object.create(null);
    let hasValue = false;
    for (let c = 0; c < hdrs.length; c++) {
      const key = hdrs[c];
      if (!isSafeRecordKey(key)) continue;
      const val = sanitizePlainText(values[c] ?? '', 20_000).trim();
      if (val !== '') hasValue = true;
      obj[key] = val;
    }
    if (hasValue) rows.push(obj);
  };

  const commitParsedRow = (rowCells: string[]) => {
    if (!rowCells.some((cell) => cell.length > 0)) return;

    if (!headers) {
      const nonEmptyCount = rowCells.filter((c) => c.length > 0).length;
      // If line 1 looks like a single-cell report title ("Evans Rabbit Export - 2025"), hold it briefly
      // to see if one of the next 3 rows is the actual multi-column header line.
      if (!preambleCandidate && nonEmptyCount === 1 && rowCells.length === 1 && preambleCheckCount < 3) {
        preambleCandidate = rowCells;
        preambleCheckCount++;
        return;
      }
      if (preambleCandidate) {
        if (nonEmptyCount >= 2) {
          headers = finalizeHeaders(rowCells);
          preambleCandidate = null;
          return;
        }
        if (preambleCheckCount < 3) {
          preambleCandidate = rowCells;
          preambleCheckCount++;
          return;
        }
        headers = finalizeHeaders(preambleCandidate);
        preambleCandidate = null;
        pushRowObject(headers, rowCells);
        return;
      }
      headers = finalizeHeaders(rowCells);
      return;
    }

    pushRowObject(headers, rowCells);
  };

  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (ch === '\n') {
        currentRow.push(currentCell.trim());
        currentCell = '';
        commitParsedRow(currentRow);
        currentRow = [];
      } else {
        currentCell += ch;
      }
    }
  }
  currentRow.push(currentCell.trim());
  commitParsedRow(currentRow);

  if (!headers) {
    if (preambleCandidate) {
      return { headers: finalizeHeaders(preambleCandidate), rows: [] };
    }
    return { headers: [], rows: [] };
  }

  return { headers, rows };
}

/**
 * Normalizes a column header for resilient matching (`"Primary Tag #"` -> `"primarytag"`).
 */
export function normalizeColumnKey(header: string): string {
  return header
    .toLowerCase()
    .replace(/#/g, 'number')
    .replace(/[^a-z0-9]+/g, '');
}

function validateAndFormatYmd(year: number, month: number, day: number): string {
  if (year < 1850 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return '';
  }
  const verify = new Date(Date.UTC(year, month - 1, day));
  if (
    verify.getUTCFullYear() === year &&
    verify.getUTCMonth() === month - 1 &&
    verify.getUTCDate() === day
  ) {
    return `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return '';
}

/**
 * Normalizes diverse date strings (`YYYY-MM-DD`, `MM/DD/YYYY`, `DD.MM.YYYY`, `M/D/YY`,
 * `DD-MMM-YYYY`, Excel serial dates like `45123`, ISO-8601) into canonical `YYYY-MM-DD`
 * (or `""` if empty/invalid).
 */
export function normalizeFlexibleDateIso(raw: string | undefined): string {
  const s = (raw || '').trim();
  if (!s) return '';

  // Already YYYY-MM-DD or ISO-8601 timestamp (validate real calendar month/day!)
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T|\s)/);
  if (isoMatch) {
    return validateAndFormatYmd(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  // Excel serial date numbers (days since 1899-12-30, typical livestock dates 1954..2099 => ~20000..73050)
  if (/^\d{5}(?:\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial >= 10000 && serial <= 80000) {
      const utcMs = Date.UTC(1899, 11, 30) + serial * 86_400_000;
      const d = new Date(utcMs);
      return validateAndFormatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
  }

  // Slash, dash, or dot numeric dates: M/D/YYYY, M/D/YY, DD.MM.YYYY, YYYY/M/D, YYYY.M.D
  const numericMatch = s.match(/^(\d{1,4})[/. -](\d{1,2})[/. -](\d{1,4})(?:\s.*)?$/);
  if (numericMatch) {
    const [, p1, p2, p3] = numericMatch;
    if (/^\d{4}$/.test(p1)) {
      const formatted = validateAndFormatYmd(Number(p1), Number(p2), Number(p3));
      if (formatted) return formatted;
    }
    if (/^\d{2,4}$/.test(p3)) {
      let year = Number(p3);
      if (p3.length === 2) {
        year += year > 40 ? 1900 : 2000;
      }
      let month = Number(p1);
      let day = Number(p2);
      // Dot-notation (DD.MM.YYYY) defaults European day-first unless middle > 12; slash defaults US unless first > 12
      const isDotStyle = s.includes('.');
      if (isDotStyle && day <= 12 && month <= 31 && Number(p2) <= 12 && Number(p1) > 12) {
        const tmp = month;
        month = day;
        day = tmp;
      } else if (isDotStyle && Number(p2) <= 12 && Number(p1) <= 12 && p3.length === 4) {
        const tmp = month;
        month = day;
        day = tmp;
      } else if (month > 12 && day <= 12) {
        const tmp = month;
        month = day;
        day = tmp;
      }
      const formatted = validateAndFormatYmd(year, month, day);
      if (formatted) return formatted;
    }
  }

  // Named month dates like "14 Nov 2025" or "Nov 14, 2025"
  const parsedMs = Date.parse(s);
  if (!Number.isNaN(parsedMs)) {
    const d = new Date(parsedMs);
    const hasExplicitTz = /(?:GMT|UTC|Z|[+-]\d{2}:?\d{2})\s*$/i.test(s);
    const yyyy = hasExplicitTz ? d.getUTCFullYear() : d.getFullYear();
    if (yyyy >= 1850 && yyyy <= 2100) {
      const mm = (hasExplicitTz ? d.getUTCMonth() : d.getMonth()) + 1;
      const dd = hasExplicitTz ? d.getUTCDate() : d.getDate();
      return validateAndFormatYmd(yyyy, mm, dd);
    }
  }

  return '';
}

/**
 * Parses weights like `"8.5"`, `"8#"`, `"8 lbs 4 oz"`, `"42 kg"`, `"3850 g"` + optional unit column into integer grams.
 */
export function parseFlexibleWeightToGrams(
  rawWeight: string | undefined,
  rawUnit?: string
): number {
  const s = (rawWeight || '').trim().toLowerCase();
  if (!s) return 0;

  // Check compound "8 lb 4 oz" or "8 lbs. 4 oz."
  const lbOz = s.match(
    /(\d+(?:\.\d+)?)\s*(?:lb\.?|lbs\.?|pound|pounds|#)\s*(\d+(?:\.\d+)?)\s*(?:oz\.?|ounce|ounces)/
  );
  if (lbOz) {
    const lbs = Number(lbOz[1]);
    const oz = Number(lbOz[2]);
    if (Number.isFinite(lbs) && Number.isFinite(oz) && lbs >= 0 && oz >= 0) {
      return Math.round((lbs + oz / 16) * 453.59237);
    }
  }

  const numMatch = s.match(/-?\d+(?:\.\d+)?/);
  if (!numMatch) return 0;
  const val = Number(numMatch[0]);
  if (!Number.isFinite(val) || val <= 0) return 0;

  const unitHint = `${s} ${(rawUnit || '').toLowerCase()}`;
  if (/\bkg\b|kilogram/.test(unitHint)) {
    return Math.round(val * 1000);
  }
  if (/\b(?:g|gm|gram|grams|gramme|grammes)\b/.test(unitHint) && !/\bkg/.test(unitHint)) {
    return Math.round(val);
  }
  if (/\b(?:oz|ounce|ounces)\b/.test(unitHint) && !/\b(?:lb|lbs)\b/.test(unitHint)) {
    return Math.round(val * 28.3495231);
  }
  // Default livestock/US HerdBoss convention is pounds (`lbs` / `#`) unless explicitly metric
  return Math.round(val * 453.59237);
}

```

## `src/core/importers/conflictResolver.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Preexisting Animal Match & Contradiction Resolution Engine
 * (`src/core/importers/conflictResolver.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) dependencies.
 *
 * Responsibilities:
 * 1. Matches incoming imported animal rows against preexisting barn animals within the SAME species
 *    (by exact ID, Registration #, Tag/Tattoo, or Name + Birth Date).
 * 2. Distinguishes harmless blank-field enrichments from genuine data contradictions.
 * 3. Applies user-selected per-field resolutions (`'existing' | 'incoming' | 'combine'`) while
 *    keeping parsed genotypes and pedigree cycle guards strictly valid.
 */

import { reconcileCarrierTraitLists } from '../carrierGenetics';
import { parseGenotypeString } from '../geneticsEngine';
import {
  Animal,
  BarnDatabaseSnapshot,
  formatReadableDate,
  formatSexForSpecies,
  formatWeight,
  isSameSpecies,
  normalizeRufusLevel,
  nowIsoUtc,
  resolveSpeciesProfile,
  resolveSpeciesWeightUnit,
  SpeciesProfile,
  WeightUnit,
} from '../models';
import { buildSpeciesHerdMap, wouldCreateCycle } from '../pedigreeCalculator';
import { isSampleTestingId } from '../sampleData';

export type AnimalConflictFieldKey =
  | 'name'
  | 'tattoo'
  | 'sex'
  | 'status'
  | 'archived'
  | 'birthDateIso'
  | 'breed'
  | 'variety'
  | 'weightGrams'
  | 'registrationNumber'
  | 'grandChampionNumber'
  | 'genotypeRaw'
  | 'rufusLevel'
  | 'cageLocation'
  | 'breederName'
  | 'ownerName'
  | 'sireId'
  | 'damId'
  | 'notes';

export type FieldResolutionChoice = 'existing' | 'incoming' | 'combine';

export interface AnimalFieldContradiction {
  field: AnimalConflictFieldKey;
  label: string;
  existingDisplay: string;
  incomingDisplay: string;
  supportsCombine: boolean;
  defaultChoice: FieldResolutionChoice;
}

export interface AnimalImportConflict {
  animalId: string;
  species: string;
  displayName: string;
  displayTag: string;
  matchedBy: 'ID' | 'Registration #' | 'Tag / Tattoo' | 'Name & Birth Date' | 'Name';
  existingAnimal: Animal;
  incomingAnimal: Animal;
  contradictions: AnimalFieldContradiction[];
}

/**
 * Keyed by `${animalId}::${field}` -> `'existing' | 'incoming' | 'combine'`.
 */
export type ConflictSelectionMap = Record<string, FieldResolutionChoice>;

export function makeConflictSelectionKey(
  animalId: string,
  field: AnimalConflictFieldKey
): string {
  return `${animalId}::${field}`;
}

export interface PreexistingAnimalMatch {
  animal: Animal;
  matchedBy: AnimalImportConflict['matchedBy'];
}

function normStr(val: string | undefined | null): string {
  return (val || '').trim().toLowerCase();
}

/**
 * Finds a preexisting animal in `existingAnimals` within `speciesName` that represents
 * the same real-world animal as the incoming row.
 *
 * Note: Sample seed animals (`seed-...`) only match if their exact ID or exact Tag/Registration
 * matches, avoiding accidental collisions with unrelated real imports.
 */
export function findPreexistingAnimalMatch(
  existingAnimals: Animal[],
  params: {
    species: string;
    candidateDeterministicId: string;
    externalId?: string;
    tattoo?: string;
    registrationNumber?: string;
    name?: string;
    birthDateIso?: string;
  }
): PreexistingAnimalMatch | null {
  const candidates = existingAnimals.filter((a) => isSameSpecies(a.species, params.species));
  if (candidates.length === 0) return null;

  const extIdNorm = normStr(params.externalId);
  const candDetNorm = normStr(params.candidateDeterministicId);
  const regNorm = normStr(params.registrationNumber);
  const tattooNorm = normStr(params.tattoo);
  const nameNorm = normStr(params.name);
  const dobNorm = normStr(params.birthDateIso);

  // 1. Exact ID match (e.g. re-importing an updated HerdBoss export or matching UUID)
  for (const ex of candidates) {
    const exId = normStr(ex.id);
    if (exId === candDetNorm || (extIdNorm && exId === extIdNorm)) {
      return { animal: ex, matchedBy: 'ID' };
    }
  }

  // 2. Non-empty Registration Number match within the same species
  if (regNorm) {
    const byReg = candidates.find((ex) => normStr(ex.registrationNumber) === regNorm);
    if (byReg) {
      return { animal: byReg, matchedBy: 'Registration #' };
    }
  }

  // 3. Non-empty Tag / Tattoo match within the same species
  if (tattooNorm) {
    const byTag = candidates.find((ex) => normStr(ex.tattoo) === tattooNorm);
    if (byTag) {
      return { animal: byTag, matchedBy: 'Tag / Tattoo' };
    }
  }

  // 4. Exact Name + Birth Date match (when tags don't explicitly contradict two distinct tagged animals)
  if (nameNorm && dobNorm) {
    const byNameDob = candidates.find((ex) => {
      if (isSampleTestingId(ex.id)) return false;
      if (normStr(ex.name) !== nameNorm || normStr(ex.birthDateIso) !== dobNorm) return false;
      // If both records carry non-empty, different tags, treat them as distinct littermates/animals
      if (tattooNorm && normStr(ex.tattoo) && normStr(ex.tattoo) !== tattooNorm) return false;
      return true;
    });
    if (byNameDob) {
      return { animal: byNameDob, matchedBy: 'Name & Birth Date' };
    }
  }

  // 5. Unique Name match when at least one side has no tag and birth dates don't conflict
  if (nameNorm && !/^animal #\d+$/i.test(nameNorm)) {
    const nameMatches = candidates.filter((ex) => {
      if (isSampleTestingId(ex.id)) return false;
      if (normStr(ex.name) !== nameNorm) return false;
      if (tattooNorm && normStr(ex.tattoo) && normStr(ex.tattoo) !== tattooNorm) return false;
      if (dobNorm && normStr(ex.birthDateIso) && normStr(ex.birthDateIso) !== dobNorm) {
        return false;
      }
      return true;
    });
    if (nameMatches.length === 1) {
      return { animal: nameMatches[0], matchedBy: 'Name' };
    }
  }

  return null;
}

function formatParentLabel(
  parentId: string,
  allKnownAnimalsById: Map<string, Animal>
): string {
  if (!parentId) return 'Unlinked';
  const found = allKnownAnimalsById.get(parentId);
  if (!found) return parentId;
  return found.tattoo ? `${found.name} (${found.tattoo})` : found.name;
}

function isSameParentAnimal(
  existingParentId: string,
  incomingParentId: string,
  allKnownAnimalsById: Map<string, Animal>
): boolean {
  if (existingParentId === incomingParentId) return true;
  const ex = allKnownAnimalsById.get(existingParentId);
  const inc = allKnownAnimalsById.get(incomingParentId);
  if (!ex || !inc) return false;
  if (ex.tattoo && inc.tattoo && normStr(ex.tattoo) === normStr(inc.tattoo)) return true;
  if (
    ex.registrationNumber &&
    inc.registrationNumber &&
    normStr(ex.registrationNumber) === normStr(inc.registrationNumber)
  ) {
    return true;
  }
  return normStr(ex.name) === normStr(inc.name) && normStr(ex.name) !== '';
}

/**
 * Compares an existing barn `Animal` and an incoming imported `Animal` (with the same `id`),
 * returning all fields where BOTH sides have non-empty values that genuinely contradict.
 */
export function buildAnimalContradictions(
  existing: Animal,
  incoming: Animal,
  options: {
    preferredUnit: WeightUnit;
    speciesProfiles: SpeciesProfile[];
    allKnownAnimalsById: Map<string, Animal>;
  }
): AnimalFieldContradiction[] {
  const contradictions: AnimalFieldContradiction[] = [];
  const sp = resolveSpeciesProfile(existing.species, options.speciesProfiles);

  const checkText = (
    field: AnimalConflictFieldKey,
    label: string,
    exVal: string,
    incVal: string,
    caseInsensitive = false,
    supportsCombine = false
  ) => {
    const exClean = (exVal || '').trim();
    const incClean = (incVal || '').trim();
    if (!exClean || !incClean) return;
    const equal = caseInsensitive
      ? exClean.toLowerCase() === incClean.toLowerCase()
      : exClean === incClean;
    if (equal) return;
    // For notes, if one already contains the other substring, no contradiction
    if (
      supportsCombine &&
      (exClean.toLowerCase().includes(incClean.toLowerCase()) ||
        incClean.toLowerCase().includes(exClean.toLowerCase()))
    ) {
      return;
    }

    contradictions.push({
      field,
      label,
      existingDisplay: exClean,
      incomingDisplay: incClean,
      supportsCombine,
      defaultChoice: supportsCombine ? 'combine' : 'existing',
    });
  };

  checkText('name', 'Name', existing.name, incoming.name);
  checkText('tattoo', 'Tag / Tattoo', existing.tattoo, incoming.tattoo, true);

  if (
    existing.sex !== 'Unknown' &&
    incoming.sex !== 'Unknown' &&
    existing.sex !== incoming.sex
  ) {
    contradictions.push({
      field: 'sex',
      label: 'Biological Sex',
      existingDisplay: `${formatSexForSpecies(existing.sex, sp)} (${existing.sex})`,
      incomingDisplay: `${formatSexForSpecies(incoming.sex, sp)} (${incoming.sex})`,
      supportsCombine: false,
      defaultChoice: 'existing',
    });
  }

  if (existing.status && incoming.status && existing.status !== incoming.status) {
    contradictions.push({
      field: 'status',
      label: 'Herd Status',
      existingDisplay: existing.status,
      incomingDisplay: incoming.status,
      supportsCombine: false,
      defaultChoice: 'existing',
    });
  }

  if (Boolean(existing.archived) !== Boolean(incoming.archived)) {
    contradictions.push({
      field: 'archived',
      label: 'Active vs. Archived',
      existingDisplay: existing.archived ? 'Archived (Non-Active)' : 'Active Herd',
      incomingDisplay: incoming.archived ? 'Archived (Non-Active)' : 'Active Herd',
      supportsCombine: false,
      defaultChoice: incoming.archived ? 'incoming' : 'existing',
    });
  }

  if (
    existing.birthDateIso &&
    incoming.birthDateIso &&
    existing.birthDateIso !== incoming.birthDateIso
  ) {
    contradictions.push({
      field: 'birthDateIso',
      label: 'Birth Date',
      existingDisplay: `${formatReadableDate(existing.birthDateIso)} (${existing.birthDateIso})`,
      incomingDisplay: `${formatReadableDate(incoming.birthDateIso)} (${incoming.birthDateIso})`,
      supportsCombine: false,
      defaultChoice: 'existing',
    });
  }

  checkText('breed', 'Breed', existing.breed, incoming.breed, true);
  checkText('variety', 'Color / Variety', existing.variety, incoming.variety, true);

  // Weight: treat > 5g difference when both > 0 as a contradiction
  const effectiveUnit = resolveSpeciesWeightUnit(sp, { preferredUnit: options.preferredUnit });
  if (
    existing.weightGrams > 0 &&
    incoming.weightGrams > 0 &&
    Math.abs(existing.weightGrams - incoming.weightGrams) > 5
  ) {
    contradictions.push({
      field: 'weightGrams',
      label: 'Current Weight',
      existingDisplay: formatWeight(existing.weightGrams, effectiveUnit),
      incomingDisplay: formatWeight(incoming.weightGrams, effectiveUnit),
      supportsCombine: false,
      defaultChoice: 'incoming',
    });
  }

  checkText(
    'registrationNumber',
    'Registration #',
    existing.registrationNumber,
    incoming.registrationNumber,
    true
  );
  checkText(
    'grandChampionNumber',
    'Grand Champion #',
    existing.grandChampionNumber,
    incoming.grandChampionNumber,
    true
  );
  checkText('genotypeRaw', 'Genotype / DNA', existing.genotypeRaw, incoming.genotypeRaw);
  checkText(
    'rufusLevel',
    'Rufus Intensity',
    existing.rufusLevel || '',
    incoming.rufusLevel || '',
    true
  );
  checkText('cageLocation', 'Cage / Group Location', existing.cageLocation, incoming.cageLocation, true);
  checkText('breederName', 'Breeder', existing.breederName, incoming.breederName, true);
  checkText('ownerName', 'Owner', existing.ownerName, incoming.ownerName, true);

  if (
    existing.sireId &&
    incoming.sireId &&
    !isSameParentAnimal(existing.sireId, incoming.sireId, options.allKnownAnimalsById)
  ) {
    contradictions.push({
      field: 'sireId',
      label: `${sp.maleLabel} / Sire`,
      existingDisplay: formatParentLabel(existing.sireId, options.allKnownAnimalsById),
      incomingDisplay: formatParentLabel(incoming.sireId, options.allKnownAnimalsById),
      supportsCombine: false,
      defaultChoice: 'existing',
    });
  }

  if (
    existing.damId &&
    incoming.damId &&
    !isSameParentAnimal(existing.damId, incoming.damId, options.allKnownAnimalsById)
  ) {
    contradictions.push({
      field: 'damId',
      label: `${sp.femaleLabel} / Dam`,
      existingDisplay: formatParentLabel(existing.damId, options.allKnownAnimalsById),
      incomingDisplay: formatParentLabel(incoming.damId, options.allKnownAnimalsById),
      supportsCombine: false,
      defaultChoice: 'existing',
    });
  }

  checkText('notes', 'Notes', existing.notes, incoming.notes, false, true);

  return contradictions;
}

/**
 * Builds the default `ConflictSelectionMap` for a list of `AnimalImportConflict` items.
 */
export function buildInitialConflictSelections(
  conflicts: AnimalImportConflict[]
): ConflictSelectionMap {
  const map: ConflictSelectionMap = {};
  for (const c of conflicts) {
    for (const item of c.contradictions) {
      map[makeConflictSelectionKey(c.animalId, item.field)] = item.defaultChoice;
    }
  }
  return map;
}

/**
 * Merges a preexisting `existing` animal with an `incoming` animal:
 * - Blank fields on either side automatically enrich from the non-blank side.
 * - Any contradicting field uses the user's explicit selection in `selections` (falling back to `'existing'`).
 * - Validates Sire/Dam cycle safety and re-parses `genotype` from `genotypeRaw`.
 */
export function resolveAnimalsWithConflictChoices(
  importedAnimals: Animal[],
  existingSnapshot: BarnDatabaseSnapshot,
  selections: ConflictSelectionMap
): Animal[] {
  const ts = nowIsoUtc();
  const existingById = new Map<string, Animal>();
  for (const a of existingSnapshot.animals) {
    existingById.set(a.id, a);
  }

  const pickNonEmptyText = (
    animalId: string,
    field: AnimalConflictFieldKey,
    exVal: string,
    incVal: string
  ): string => {
    const exClean = (exVal || '').trim();
    const incClean = (incVal || '').trim();
    if (!exClean) return incClean;
    if (!incClean) return exClean;
    if (exClean === incClean) return exClean;

    const choice = selections[makeConflictSelectionKey(animalId, field)] || 'existing';
    if (choice === 'combine') {
      if (exClean.toLowerCase().includes(incClean.toLowerCase())) return exClean;
      if (incClean.toLowerCase().includes(exClean.toLowerCase())) return incClean;
      return `${exClean} · ${incClean}`;
    }
    return choice === 'incoming' ? incClean : exClean;
  };

  const resolvedList: Animal[] = importedAnimals.map((inc) => {
    const ex = existingById.get(inc.id);
    if (!ex) {
      return { ...inc, updatedAt: ts };
    }

    const sexChoice = selections[makeConflictSelectionKey(ex.id, 'sex')] || 'existing';
    const resolvedSex =
      ex.sex === 'Unknown'
        ? inc.sex
        : inc.sex === 'Unknown'
          ? ex.sex
          : sexChoice === 'incoming'
            ? inc.sex
            : ex.sex;

    const statusChoice = selections[makeConflictSelectionKey(ex.id, 'status')] || 'existing';
    const resolvedStatus = !ex.status
      ? inc.status
      : !inc.status
        ? ex.status
        : statusChoice === 'incoming'
          ? inc.status
          : ex.status;

    const weightChoice = selections[makeConflictSelectionKey(ex.id, 'weightGrams')] || 'incoming';
    const resolvedWeight =
      ex.weightGrams <= 0
        ? inc.weightGrams
        : inc.weightGrams <= 0
          ? ex.weightGrams
          : weightChoice === 'incoming'
            ? inc.weightGrams
            : ex.weightGrams;

    const resolvedGenotypeRaw = pickNonEmptyText(
      ex.id,
      'genotypeRaw',
      ex.genotypeRaw,
      inc.genotypeRaw
    );

    const sireChoice = selections[makeConflictSelectionKey(ex.id, 'sireId')] || 'existing';
    const resolvedSireId = !ex.sireId
      ? inc.sireId
      : !inc.sireId
        ? ex.sireId
        : sireChoice === 'incoming'
          ? inc.sireId
          : ex.sireId;

    const damChoice = selections[makeConflictSelectionKey(ex.id, 'damId')] || 'existing';
    const resolvedDamId = !ex.damId
      ? inc.damId
      : !inc.damId
        ? ex.damId
        : damChoice === 'incoming'
          ? inc.damId
          : ex.damId;

    const archivedChoice = selections[makeConflictSelectionKey(ex.id, 'archived')] || 'incoming';
    const resolvedArchived =
      Boolean(ex.archived) === Boolean(inc.archived)
        ? Boolean(ex.archived)
        : archivedChoice === 'incoming'
          ? Boolean(inc.archived)
          : Boolean(ex.archived);

    const resolvedRufusLevel = normalizeRufusLevel(
      pickNonEmptyText(ex.id, 'rufusLevel', ex.rufusLevel || '', inc.rufusLevel || '')
    );

    return {
      id: ex.id,
      species: ex.species,
      name: pickNonEmptyText(ex.id, 'name', ex.name, inc.name) || ex.name,
      tattoo: pickNonEmptyText(ex.id, 'tattoo', ex.tattoo, inc.tattoo),
      sex: resolvedSex,
      status: resolvedStatus,
      archived: resolvedArchived,
      needsAttention: Boolean(ex.needsAttention || inc.needsAttention),
      ignoredConflicts: ex.ignoredConflicts || inc.ignoredConflicts,
      birthDateIso: pickNonEmptyText(ex.id, 'birthDateIso', ex.birthDateIso, inc.birthDateIso),
      breed: pickNonEmptyText(ex.id, 'breed', ex.breed, inc.breed),
      variety: pickNonEmptyText(ex.id, 'variety', ex.variety, inc.variety),
      weightGrams: resolvedWeight,
      genotypeRaw: resolvedGenotypeRaw,
      genotype: resolvedGenotypeRaw
        ? parseGenotypeString(resolvedGenotypeRaw, ex.species)
        : ex.genotype,
      rufusLevel: resolvedRufusLevel,
      ...reconcileCarrierTraitLists(
        [...(ex.suspectedCarrierOf || []), ...(inc.suspectedCarrierOf || [])],
        [...(ex.confirmedCarrierOf || []), ...(inc.confirmedCarrierOf || [])],
        [...(ex.clearedCarrierOf || []), ...(inc.clearedCarrierOf || [])]
      ),
      registrationNumber: pickNonEmptyText(
        ex.id,
        'registrationNumber',
        ex.registrationNumber,
        inc.registrationNumber
      ),
      grandChampionNumber: pickNonEmptyText(
        ex.id,
        'grandChampionNumber',
        ex.grandChampionNumber,
        inc.grandChampionNumber
      ),
      legsCount: Math.max(ex.legsCount || 0, inc.legsCount || 0),
      cageLocation: pickNonEmptyText(ex.id, 'cageLocation', ex.cageLocation, inc.cageLocation),
      breederName: pickNonEmptyText(ex.id, 'breederName', ex.breederName, inc.breederName),
      ownerName: pickNonEmptyText(ex.id, 'ownerName', ex.ownerName, inc.ownerName),
      ownershipType: ex.ownershipType || inc.ownershipType,
      culled: Boolean(ex.culled || inc.culled),
      cullDateIso: ex.cullDateIso || inc.cullDateIso || '',
      cullReason: ex.cullReason || inc.cullReason || '',
      deceasedDateIso: ex.deceasedDateIso || inc.deceasedDateIso || '',
      deathCause: ex.deathCause || inc.deathCause || '',
      soldDateIso: ex.soldDateIso || inc.soldDateIso || '',
      salePriceCents:
        ex.salePriceCents && ex.salePriceCents > 0
          ? ex.salePriceCents
          : inc.salePriceCents && inc.salePriceCents > 0
          ? inc.salePriceCents
          : 0,
      purchaseCostCents:
        ex.purchaseCostCents && ex.purchaseCostCents > 0
          ? ex.purchaseCostCents
          : inc.purchaseCostCents && inc.purchaseCostCents > 0
          ? inc.purchaseCostCents
          : 0,
      buyerName: ex.buyerName || inc.buyerName || '',
      sireId: resolvedSireId === ex.id ? '' : resolvedSireId,
      damId: resolvedDamId === ex.id ? '' : resolvedDamId,
      notes: pickNonEmptyText(ex.id, 'notes', ex.notes, inc.notes),
      createdAt: ex.createdAt || inc.createdAt || ts,
      updatedAt: ts,
    };
  });

  // Final cycle-safety pass across combined barn + imported herd per species
  const combinedAnimals = new Map<string, Animal>();
  for (const a of existingSnapshot.animals) combinedAnimals.set(a.id, a);
  for (const a of resolvedList) combinedAnimals.set(a.id, a);

  const allCombined = Array.from(combinedAnimals.values());
  const speciesSet = new Set(resolvedList.map((a) => a.species));
  for (const spName of speciesSet) {
    const herdMap = buildSpeciesHerdMap(allCombined, spName);
    for (const animal of resolvedList) {
      if (!isSameSpecies(animal.species, spName)) continue;
      if (animal.sireId && wouldCreateCycle(animal.id, animal.sireId, herdMap)) {
        animal.sireId = '';
      }
      if (animal.damId && wouldCreateCycle(animal.id, animal.damId, herdMap)) {
        animal.damId = '';
      }
    }
  }

  return resolvedList;
}
```

## `src/core/importers/csvColumnMapper.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Interactive CSV Column Mapper (`src/core/importers/csvColumnMapper.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM dependencies.
 */

import { isSafeRecordKey, sanitizeSingleLineText } from '../inputSanitization';
import { normalizeColumnKey } from './archiveAndCsvUtils';
import type {
  CsvColumnMappingSelection,
  CsvColumnPreviewItem,
  CsvTargetFieldKey,
} from './importerTypes';

export interface CsvTargetFieldOption {
  key: CsvTargetFieldKey;
  label: string;
  group: 'identity' | 'pedigree' | 'details';
  aliases: string[];
}

export const CSV_TARGET_FIELD_OPTIONS: readonly CsvTargetFieldOption[] = [
  {
    key: 'name',
    label: 'Animal Name',
    group: 'identity',
    aliases: ['name', 'animalname', 'registeredname', 'callname', 'rabbitname', 'goatname', 'animal'],
  },
  {
    key: 'tattoo',
    label: 'Ear ID / Tattoo / Tag',
    group: 'identity',
    aliases: [
      'earid',
      'earnumber',
      'tattoo',
      'tattooid',
      'eartattoo',
      'eartag',
      'primarytag',
      'tag',
      'tagnumber',
      'id',
      'animalid',
      'eid',
    ],
  },
  {
    key: 'sex',
    label: 'Sex / Gender',
    group: 'identity',
    aliases: ['sex', 'gender'],
  },
  {
    key: 'birthDateIso',
    label: 'Birth Date (DOB)',
    group: 'identity',
    aliases: ['dob', 'birthdate', 'dateofbirth', 'born', 'whelped', 'kindled'],
  },
  {
    key: 'species',
    label: 'Species',
    group: 'identity',
    aliases: ['species', 'animaltype', 'type', 'livestock'],
  },
  {
    key: 'breed',
    label: 'Breed',
    group: 'identity',
    aliases: ['breed', 'primarybreed'],
  },
  {
    key: 'variety',
    label: 'Variety / Color',
    group: 'identity',
    aliases: ['variety', 'color', 'coatcolor', 'coat', 'markings'],
  },
  {
    key: 'weight',
    label: 'Weight',
    group: 'details',
    aliases: ['weight', 'wt', 'weightlbs', 'weightkg', 'currentweight', 'lbs'],
  },
  {
    key: 'weightUnit',
    label: 'Weight Unit',
    group: 'details',
    aliases: ['weightunit', 'wtunit', 'unit'],
  },
  {
    key: 'sire',
    label: 'Sire (Father / Buck)',
    group: 'pedigree',
    aliases: [
      'sireid',
      'siretattooid',
      'sire',
      'sirename',
      'siretag',
      'father',
      'fatherid',
      'fathername',
      'buck',
      'ram',
      'bull',
      'stallion',
      'stud',
    ],
  },
  {
    key: 'dam',
    label: 'Dam (Mother / Doe)',
    group: 'pedigree',
    aliases: [
      'damid',
      'damtattooid',
      'dam',
      'damname',
      'damtag',
      'mother',
      'motherid',
      'mothername',
      'doe',
      'ewe',
      'cow',
      'mare',
    ],
  },
  {
    key: 'pgs',
    label: 'Paternal Grandsire (PGS)',
    group: 'pedigree',
    aliases: ['pgs', 'siresire', 'siressire', 'paternalgrandsire', 'fatherfather', 'fathersfather', 'ss', 'ff', 'g2s1'],
  },
  {
    key: 'pgd',
    label: 'Paternal Granddam (PGD)',
    group: 'pedigree',
    aliases: ['pgd', 'siredam', 'siresdam', 'paternalgranddam', 'fathermother', 'fathersmother', 'sd', 'fm', 'g2d1'],
  },
  {
    key: 'mgs',
    label: 'Maternal Grandsire (MGS)',
    group: 'pedigree',
    aliases: ['mgs', 'damsire', 'damssire', 'maternalgrandsire', 'motherfather', 'mothersfather', 'ds', 'mf', 'g2s2'],
  },
  {
    key: 'mgd',
    label: 'Maternal Granddam (MGD)',
    group: 'pedigree',
    aliases: ['mgd', 'damdam', 'damsdam', 'maternalgranddam', 'mothermother', 'mothersmother', 'dd', 'mm', 'g2d2'],
  },
  {
    key: 'sss',
    label: "Sire's Paternal Grandsire (SSS)",
    group: 'pedigree',
    aliases: ['sss', 'fff', 'pgssire', 'siresiresire'],
  },
  {
    key: 'ssd',
    label: "Sire's Paternal Granddam (SSD)",
    group: 'pedigree',
    aliases: ['ssd', 'ffm', 'pgsdam', 'siresiredam'],
  },
  {
    key: 'sds',
    label: "Sire's Maternal Grandsire (SDS)",
    group: 'pedigree',
    aliases: ['sds', 'fmf', 'pgdsire', 'siredamsire'],
  },
  {
    key: 'sdd',
    label: "Sire's Maternal Granddam (SDD)",
    group: 'pedigree',
    aliases: ['sdd', 'fmm', 'pgddam', 'siredamdam'],
  },
  {
    key: 'dss',
    label: "Dam's Paternal Grandsire (DSS)",
    group: 'pedigree',
    aliases: ['dss', 'mff', 'mgssire', 'damsiresire'],
  },
  {
    key: 'dsd',
    label: "Dam's Paternal Granddam (DSD)",
    group: 'pedigree',
    aliases: ['dsd', 'mfm', 'mgsdam', 'damsiredam'],
  },
  {
    key: 'dds',
    label: "Dam's Maternal Grandsire (DDS)",
    group: 'pedigree',
    aliases: ['dds', 'mmf', 'mgdsire', 'damdamsire'],
  },
  {
    key: 'ddd',
    label: "Dam's Maternal Granddam (DDD)",
    group: 'pedigree',
    aliases: ['ddd', 'mmm', 'mgddam', 'damdamdam'],
  },
  {
    key: 'registrationNumber',
    label: 'Registration No.',
    group: 'details',
    aliases: ['registrationnumber', 'regnumber', 'regno', 'reg', 'arbareg'],
  },
  {
    key: 'grandChampionNumber',
    label: 'Grand Champion No.',
    group: 'details',
    aliases: ['grandchampionnumber', 'grandchampionno', 'gcnumber', 'gcno', 'gc'],
  },
  {
    key: 'legsCount',
    label: 'Show Legs',
    group: 'details',
    aliases: ['legs', 'legscount', 'showlegs'],
  },
  {
    key: 'genotypeRaw',
    label: 'Genotype / Color Code',
    group: 'details',
    aliases: ['genotype', 'genotyperaw', 'colorcode'],
  },
  {
    key: 'status',
    label: 'Status (Active / Archived / Sold)',
    group: 'details',
    aliases: ['status', 'animalstatus', 'state'],
  },
  {
    key: 'cageLocation',
    label: 'Cage / Pen Location',
    group: 'details',
    aliases: ['cagelocation', 'cage', 'pen', 'hutch', 'location', 'stall'],
  },
  {
    key: 'breederName',
    label: 'Breeder Name',
    group: 'details',
    aliases: ['breeder', 'breedername'],
  },
  {
    key: 'ownerName',
    label: 'Owner Name',
    group: 'details',
    aliases: ['owner', 'ownername'],
  },
  {
    key: 'notes',
    label: 'Notes / Comments',
    group: 'details',
    aliases: ['notes', 'comments', 'remarks', 'memo'],
  },
];

const ALIAS_TO_FIELD_MAP: Map<string, { field: CsvTargetFieldKey; priority: number }> = (() => {
  const map = new Map<string, { field: CsvTargetFieldKey; priority: number }>();
  for (const spec of CSV_TARGET_FIELD_OPTIONS) {
    spec.aliases.forEach((alias, idx) => {
      if (!map.has(alias)) {
        map.set(alias, { field: spec.key, priority: idx });
      }
    });
  }
  return map;
})();

export function makeCsvColumnOverrideKey(entryPath: string, header: string): string {
  return `${entryPath}::${header}`;
}

export function autoMatchCsvHeader(header: string): CsvTargetFieldKey | '' {
  const nk = normalizeColumnKey(header);
  if (!nk) return '';
  return ALIAS_TO_FIELD_MAP.get(nk)?.field || '';
}

export interface CsvTableColumnResolution {
  columns: CsvColumnPreviewItem[];
  headersByField: Map<CsvTargetFieldKey, string[]>;
  matchedColumns: string[];
  unmappedColumns: string[];
}

export function resolveCsvColumnAssignments(
  headers: string[],
  rows: Array<Record<string, string>>,
  customMapping?: Record<string, CsvColumnMappingSelection>,
  entryPath?: string
): CsvTableColumnResolution {
  const columns: CsvColumnPreviewItem[] = [];
  const headersByField = new Map<CsvTargetFieldKey, string[]>();

  for (const header of headers) {
    const normalizedKey = normalizeColumnKey(header);
    const autoMatchedField = autoMatchCsvHeader(header);

    const scopedKey = entryPath ? makeCsvColumnOverrideKey(entryPath, header) : '';
    const override =
      (scopedKey && customMapping?.[scopedKey]) || customMapping?.[header] || undefined;

    let assignedField: CsvTargetFieldKey | '' = autoMatchedField;
    let isUserOverride = false;
    if (override === '__ignore__') {
      assignedField = '';
      isUserOverride = true;
    } else if (override) {
      assignedField = override;
      isUserOverride = override !== autoMatchedField;
    }

    const sampleValues: string[] = [];
    if (isSafeRecordKey(header)) {
      for (let i = 0; i < rows.length && sampleValues.length < 3; i++) {
        const raw = (rows[i]?.[header] || '').trim();
        if (!raw) continue;
        const cleanSample = sanitizeSingleLineText(raw, 48);
        if (cleanSample && !sampleValues.includes(cleanSample)) {
          sampleValues.push(cleanSample);
        }
      }
    }

    columns.push({
      header,
      normalizedKey,
      assignedField,
      autoMatchedField,
      isUserOverride,
      sampleValues,
    });

    if (assignedField) {
      const existing = headersByField.get(assignedField) || [];
      existing.push(header);
      headersByField.set(assignedField, existing);
    }
  }

  // Sort headers per field so user overrides come first, then earlier alias priority
  for (const [field, fieldHeaders] of headersByField.entries()) {
    if (fieldHeaders.length <= 1) continue;
    const spec = CSV_TARGET_FIELD_OPTIONS.find((opt) => opt.key === field);
    const aliasOrder = spec?.aliases || [];
    fieldHeaders.sort((a, b) => {
      const colA = columns.find((c) => c.header === a);
      const colB = columns.find((c) => c.header === b);
      const ovA = colA?.isUserOverride ? 0 : 1;
      const ovB = colB?.isUserOverride ? 0 : 1;
      if (ovA !== ovB) return ovA - ovB;
      const idxA = aliasOrder.indexOf(normalizeColumnKey(a));
      const idxB = aliasOrder.indexOf(normalizeColumnKey(b));
      const rankA = idxA === -1 ? 999 : idxA;
      const rankB = idxB === -1 ? 999 : idxB;
      return rankA - rankB;
    });
  }

  const matchedColumns = columns.filter((c) => c.assignedField !== '').map((c) => c.header);
  const unmappedColumns = columns.filter((c) => c.assignedField === '').map((c) => c.header);

  return {
    columns,
    headersByField,
    matchedColumns,
    unmappedColumns,
  };
}
```

## `src/core/importers/csvStarterTemplate.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Starter CSV Template Generator (`src/core/importers/csvStarterTemplate.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM dependencies.
 */

import { escapeCsvCell, UTF8_BOM } from '../csvExport';
import { resolveSpeciesProfile, SpeciesProfile } from '../models';

export const STARTER_CSV_TEMPLATE_HEADERS = [
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
  'Species',
  'Genotype',
  'Legs',
  'Notes',
] as const;

export interface StarterCsvTemplateResult {
  filename: string;
  content: string;
  headers: readonly string[];
}

function slugifyTemplatePart(raw: string): string {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'livestock'
  );
}

/**
 * Generates an RFC-4180 UTF-8 BOM starter CSV template with standard pedigree headers
 * (`Name, Ear_ID, Sex, DOB, Breed, Variety, Weight, Sire_ID, Dam_ID, Reg_No, GC_No`, plus
 * `Species, Genotype, Legs, Notes`) and 3 linked example rows ready for Excel or Google Sheets.
 */
export function buildStarterCsvTemplate(
  speciesName?: string,
  speciesProfiles: SpeciesProfile[] = []
): StarterCsvTemplateResult {
  const cleanSpecies = (speciesName || '').trim() || 'Rabbit';
  const profile = resolveSpeciesProfile(cleanSpecies, speciesProfiles);
  const sampleBreed = profile.exampleBreeds[0] || 'Heritage Line';
  const maleSex = profile.maleLabel || 'Male';
  const femaleSex = profile.femaleLabel || 'Female';

  const isRabbit = profile.name.toLowerCase() === 'rabbit';
  const isCavy = profile.name.toLowerCase() === 'guinea pig';
  const sampleWeightSire = isRabbit ? '9 lb 4 oz' : isCavy ? '2.4 lbs' : '145 lbs';
  const sampleWeightDam = isRabbit ? '8 lb 12 oz' : isCavy ? '2.1 lbs' : '128 lbs';
  const sampleWeightOffspring = isRabbit ? '6 lb 8 oz' : isCavy ? '1.6 lbs' : '64 lbs';
  const sampleGeno = isRabbit ? 'Aa B_ C_ Dd Ee' : '';

  const rows: string[][] = [
    [
      'Oakridge Thunder',
      'OR-101',
      maleSex,
      '2023-04-12',
      sampleBreed,
      'Chestnut',
      sampleWeightSire,
      '',
      '',
      'REG-1042',
      'GC-881',
      profile.name,
      sampleGeno,
      '3',
      'Example sire row (overwrite or delete before final import)',
    ],
    [
      'Oakridge Clover',
      'OR-102',
      femaleSex,
      '2023-06-05',
      sampleBreed,
      'Broken Black',
      sampleWeightDam,
      '',
      '',
      'REG-1098',
      '',
      profile.name,
      sampleGeno,
      '1',
      'Example dam row (overwrite or delete before final import)',
    ],
    [
      'Oakridge Willow',
      'OR-205',
      femaleSex,
      '2025-02-18',
      sampleBreed,
      'Chestnut',
      sampleWeightOffspring,
      'OR-101',
      'OR-102',
      '',
      '',
      profile.name,
      sampleGeno,
      '0',
      'Example offspring referencing Sire_ID OR-101 and Dam_ID OR-102',
    ],
  ];

  const lines = [
    STARTER_CSV_TEMPLATE_HEADERS.join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];

  const filename =
    cleanSpecies.toLowerCase() === 'rabbit'
      ? 'community-pedigree-starter-template.csv'
      : `community-pedigree-${slugifyTemplatePart(cleanSpecies)}-template.csv`;

  return {
    filename,
    content: `${UTF8_BOM}${lines.join('\r\n')}`,
    headers: STARTER_CSV_TEMPLATE_HEADERS,
  };
}
```

## `src/core/importers/herdBossImporter.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * HerdBoss Two-Zip / Multi-Archive Importer (`src/core/importers/herdBossImporter.ts`).
 *
 * Unpacks 1, 2, or more HerdBoss `.zip` (or `.csv`/`.json`) export files simultaneously into a
 * unified workspace, resolves cross-archive Animal / Pedigree / Breeding / Weight / Treatment /
 * Group relationships, auto-creates missing custom `SpeciesProfile` schedules, skips binary
 * photos per Phase 1 guardrails, and generates a privacy-safe QA column diagnostic report.
 */

import { parseGenotypeString } from '../geneticsEngine';
import { isSafeRecordKey } from '../inputSanitization';
import {
  addDaysIso,
  Animal,
  AnimalStatus,
  BarnDatabaseSnapshot,
  BarnTask,
  BiologicalSex,
  BreedingRecord,
  BreedingStatus,
  CageLocation,
  CareLog,
  CareLogType,
  isSameSpecies,
  normalizeRufusLevel,
  nowIsoUtc,
  PREDEFINED_SPECIES_PRESETS,
  resolveSpeciesProfile,
  ShowEvent,
  SpeciesProfile,
  todayDateIso,
} from '../models';
import {
  extractVirtualEntries,
  normalizeColumnKey,
  normalizeFlexibleDateIso,
  parseDelimitedTable,
  parseFlexibleWeightToGrams,
} from './archiveAndCsvUtils';
import {
  AnimalImportConflict,
  buildAnimalContradictions,
  findPreexistingAnimalMatch,
  PreexistingAnimalMatch,
} from './conflictResolver';
import {
  CustomSpeciesImportOverride,
  DetectedTableDiagnostic,
  ImportedTableClassification,
  ImporterRunOptions,
  PlatformImporter,
  PlatformImportPreview,
  RawArchiveInput,
  StagedImportedPhoto,
  VirtualArchiveEntry,
} from './importerTypes';

interface NormalizedTable {
  archiveName: string;
  entryPath: string;
  baseName: string;
  headers: string[];
  normHeaderMap: Map<string, string>; // normalizedKey -> actualHeader
  rows: Array<Record<string, string>>;
}

interface PendingLineageRef {
  animalId: string;
  species: string;
  breed: string;
  sireRef: string;
  damRef: string;
  paternalGrandsireRef: string;
  paternalGranddamRef: string;
  maternalGrandsireRef: string;
  maternalGranddamRef: string;
}

const SPECIES_SYNONYMS: Record<string, string> = {
  rabbit: 'Rabbit',
  rabbits: 'Rabbit',
  goat: 'Goat',
  goats: 'Goat',
  caprine: 'Goat',
  sheep: 'Sheep',
  ovine: 'Sheep',
  lamb: 'Sheep',
  lambs: 'Sheep',
  cattle: 'Cattle',
  cow: 'Cattle',
  cows: 'Cattle',
  bovine: 'Cattle',
  beef: 'Cattle',
  dairy: 'Cattle',
  pig: 'Swine / Pig',
  pigs: 'Swine / Pig',
  swine: 'Swine / Pig',
  hog: 'Swine / Pig',
  hogs: 'Swine / Pig',
  porcine: 'Swine / Pig',
  guineapig: 'Guinea Pig',
  guineapigs: 'Guinea Pig',
  cavy: 'Guinea Pig',
  cavies: 'Guinea Pig',
  chinchilla: 'Chinchilla',
  chinchillas: 'Chinchilla',
  ferret: 'Ferret',
  ferrets: 'Ferret',
  alpaca: 'Alpaca',
  alpacas: 'Alpaca',
  llama: 'Llama',
  llamas: 'Llama',
  dog: 'Dog',
  dogs: 'Dog',
  canine: 'Dog',
  horse: 'Horse',
  horses: 'Horse',
  equine: 'Horse',
  donkey: 'Donkey',
  donkeys: 'Donkey',
  chicken: 'Chicken',
  chickens: 'Chicken',
  poultry: 'Chicken',
  duck: 'Duck',
  ducks: 'Duck',
  waterfowl: 'Duck',
  goose: 'Goose',
  geese: 'Goose',
  turkey: 'Turkey',
  turkeys: 'Turkey',
  quail: 'Quail',
  quails: 'Quail',
  yak: 'Yak',
  yaks: 'Yak',
  bison: 'Bison',
  buffalo: 'Water Buffalo',
  waterbuffalo: 'Water Buffalo',
  deer: 'Deer',
  cervid: 'Deer',
  elk: 'Elk',
  camel: 'Camel',
  camels: 'Camel',
  cat: 'Cat',
  cats: 'Cat',
  feline: 'Cat',
  hedgehog: 'Hedgehog',
  hedgehogs: 'Hedgehog',
  emu: 'Emu',
  emus: 'Emu',
};

const CUSTOM_SPECIES_DEFAULTS: Record<
  string,
  {
    gestationDays: number;
    weanDays: number;
    rebreedDays: number;
    birthLabel: string;
    maleLabel: string;
    femaleLabel: string;
    offspringLabel: string;
  }
> = {
  Dog: {
    gestationDays: 63,
    weanDays: 56,
    rebreedDays: 180,
    birthLabel: 'Whelping',
    maleLabel: 'Sire / Dog',
    femaleLabel: 'Dam / Bitch',
    offspringLabel: 'Puppy',
  },
  Cat: {
    gestationDays: 65,
    weanDays: 56,
    rebreedDays: 120,
    birthLabel: 'Queening',
    maleLabel: 'Tom / Sire',
    femaleLabel: 'Queen / Dam',
    offspringLabel: 'Kitten',
  },
  Horse: {
    gestationDays: 340,
    weanDays: 150,
    rebreedDays: 30,
    birthLabel: 'Foaling',
    maleLabel: 'Stallion',
    femaleLabel: 'Mare',
    offspringLabel: 'Foal',
  },
  Donkey: {
    gestationDays: 365,
    weanDays: 150,
    rebreedDays: 45,
    birthLabel: 'Foaling',
    maleLabel: 'Jack',
    femaleLabel: 'Jenny',
    offspringLabel: 'Foal',
  },
  Llama: {
    gestationDays: 350,
    weanDays: 180,
    rebreedDays: 21,
    birthLabel: 'Unpacking',
    maleLabel: 'Male',
    femaleLabel: 'Female',
    offspringLabel: 'Cria',
  },
  Yak: {
    gestationDays: 258,
    weanDays: 180,
    rebreedDays: 60,
    birthLabel: 'Calving',
    maleLabel: 'Bull',
    femaleLabel: 'Cow',
    offspringLabel: 'Calf',
  },
  Bison: {
    gestationDays: 283,
    weanDays: 210,
    rebreedDays: 60,
    birthLabel: 'Calving',
    maleLabel: 'Bull',
    femaleLabel: 'Cow',
    offspringLabel: 'Calf',
  },
  'Water Buffalo': {
    gestationDays: 310,
    weanDays: 210,
    rebreedDays: 60,
    birthLabel: 'Calving',
    maleLabel: 'Bull',
    femaleLabel: 'Cow',
    offspringLabel: 'Calf',
  },
  Deer: {
    gestationDays: 201,
    weanDays: 100,
    rebreedDays: 140,
    birthLabel: 'Fawning',
    maleLabel: 'Buck / Stag',
    femaleLabel: 'Doe / Hind',
    offspringLabel: 'Fawn',
  },
  Elk: {
    gestationDays: 250,
    weanDays: 120,
    rebreedDays: 115,
    birthLabel: 'Calving',
    maleLabel: 'Bull',
    femaleLabel: 'Cow',
    offspringLabel: 'Calf',
  },
  Camel: {
    gestationDays: 390,
    weanDays: 270,
    rebreedDays: 90,
    birthLabel: 'Calving',
    maleLabel: 'Bull',
    femaleLabel: 'Cow',
    offspringLabel: 'Calf',
  },
  Chicken: {
    gestationDays: 21,
    weanDays: 42,
    rebreedDays: 14,
    birthLabel: 'Hatching',
    maleLabel: 'Rooster / Cock',
    femaleLabel: 'Hen',
    offspringLabel: 'Chick',
  },
  Duck: {
    gestationDays: 28,
    weanDays: 49,
    rebreedDays: 14,
    birthLabel: 'Hatching',
    maleLabel: 'Drake',
    femaleLabel: 'Hen / Duck',
    offspringLabel: 'Duckling',
  },
  Goose: {
    gestationDays: 30,
    weanDays: 56,
    rebreedDays: 21,
    birthLabel: 'Hatching',
    maleLabel: 'Gander',
    femaleLabel: 'Goose',
    offspringLabel: 'Gosling',
  },
  Turkey: {
    gestationDays: 28,
    weanDays: 56,
    rebreedDays: 14,
    birthLabel: 'Hatching',
    maleLabel: 'Tom',
    femaleLabel: 'Hen',
    offspringLabel: 'Poult',
  },
  Quail: {
    gestationDays: 18,
    weanDays: 28,
    rebreedDays: 7,
    birthLabel: 'Hatching',
    maleLabel: 'Cock / Male',
    femaleLabel: 'Hen',
    offspringLabel: 'Chick',
  },
  Emu: {
    gestationDays: 52,
    weanDays: 90,
    rebreedDays: 30,
    birthLabel: 'Hatching',
    maleLabel: 'Male',
    femaleLabel: 'Female',
    offspringLabel: 'Chick',
  },
  Hedgehog: {
    gestationDays: 35,
    weanDays: 42,
    rebreedDays: 60,
    birthLabel: 'Birth',
    maleLabel: 'Boar',
    femaleLabel: 'Sow',
    offspringLabel: 'Hoglet',
  },
};

function slugifyKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function deterministicEntityId(prefix: string, species: string, rawKey: string): string {
  return `hb-${prefix}-${slugifyKey(species)}-${slugifyKey(rawKey)}`;
}

function formatCustomSpeciesDisplayName(raw: string): string {
  const clean = raw.trim().replace(/\s+/g, ' ');
  if (!clean) return 'Rabbit';
  // If user already typed mixed capitalization (e.g. "McNab Dog"), preserve it; otherwise Title Case words
  const isAllLowerOrAllUpper =
    clean === clean.toLowerCase() || (clean.length > 3 && clean === clean.toUpperCase());
  if (!isAllLowerOrAllUpper) {
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  return clean
    .toLowerCase()
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
    .join(' ');
}

function normalizeSpeciesName(
  rawSpecies: string | undefined,
  fileBaseName: string,
  existingProfiles: SpeciesProfile[],
  fallbackSpecies: string
): string {
  const tryMatch = (candidate: string): string | null => {
    const trimmed = candidate.trim();
    if (!trimmed) return null;
    const existingDirect = existingProfiles.find((p) => isSameSpecies(p.name, trimmed));
    if (existingDirect) return existingDirect.name;

    const presetDirect = PREDEFINED_SPECIES_PRESETS.find((p) => isSameSpecies(p.name, trimmed));
    if (presetDirect) return presetDirect.name;

    const key = trimmed.toLowerCase().replace(/[^a-z]/g, '');
    if (SPECIES_SYNONYMS[key]) {
      const mapped = SPECIES_SYNONYMS[key];
      const existing = existingProfiles.find((p) => isSameSpecies(p.name, mapped));
      return existing ? existing.name : mapped;
    }
    return formatCustomSpeciesDisplayName(trimmed);
  };

  if (rawSpecies && rawSpecies.trim()) {
    const direct = tryMatch(rawSpecies);
    if (direct) return direct;
  }

  // Check filename tokens (e.g. "goats.csv", "sheep_animals.csv", "cattle_export.csv")
  const fileTokens = fileBaseName
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .split(/[^a-z]+/);
  for (const tok of fileTokens) {
    if (SPECIES_SYNONYMS[tok]) {
      const mapped = SPECIES_SYNONYMS[tok];
      const existing = existingProfiles.find((p) => isSameSpecies(p.name, mapped));
      return existing ? existing.name : mapped;
    }
  }

  const resolvedFallback = tryMatch(fallbackSpecies);
  return resolvedFallback || 'Rabbit';
}

function parseHerdBossSex(raw: string | undefined): { sex: BiologicalSex; castratedNote?: string } {
  const s = (raw || '').trim().toLowerCase();
  if (!s) return { sex: 'Unknown' };

  if (/\b(?:steer|wether|barrow|gelding|neuter|neutered|castrated)\b/.test(s)) {
    return { sex: 'Male', castratedNote: `Recorded sex/status in HerdBoss: ${raw!.trim()}` };
  }
  if (/\b(?:spayed|freemartin)\b/.test(s)) {
    return { sex: 'Female', castratedNote: `Recorded sex/status in HerdBoss: ${raw!.trim()}` };
  }
  if (
    s === 'm' ||
    s === 'male' ||
    /\b(?:bull|buck|buckling|ram|boar|sire|stallion|jack|cock|rooster|macho|hob|dog|intact male)\b/.test(
      s
    )
  ) {
    return { sex: 'Male' };
  }
  if (
    s === 'f' ||
    s === 'female' ||
    /\b(?:cow|heifer|doe|doeling|ewe|ewes|sow|gilt|dam|mare|jenny|hen|hembra|jill|bitch|intact female)\b/.test(
      s
    )
  ) {
    return { sex: 'Female' };
  }
  return { sex: 'Unknown' };
}

function parseHerdBossAnimalStatus(
  rawStatus: string | undefined,
  rawSoldDate?: string,
  rawDeathDate?: string,
  rawReferenceFlag?: string,
  rawArchivedFlag?: string,
  rawActiveFlag?: string
): AnimalStatus {
  if (rawDeathDate && rawDeathDate.trim()) return 'Deceased';
  if (rawSoldDate && rawSoldDate.trim()) return 'Sold';

  const ref = (rawReferenceFlag || '').trim().toLowerCase();
  if (ref === 'true' || ref === '1' || ref === 'yes' || ref === 'reference') {
    return 'Retired';
  }

  const arch = (rawArchivedFlag || '').trim().toLowerCase();
  if (arch === 'true' || arch === '1' || arch === 'yes' || arch === 'y' || arch === 'archived') {
    return 'Archived';
  }

  const act = (rawActiveFlag || '').trim().toLowerCase();
  if (act === 'false' || act === '0' || act === 'no' || act === 'n' || act === 'inactive') {
    return 'Archived';
  }

  const s = (rawStatus || '').trim().toLowerCase();
  if (!s) return 'Active';
  if (/\b(?:dead|deceased|died|culled|cull|butchered|harvested|euthanized|lost)\b/.test(s)) {
    return 'Deceased';
  }
  if (/\b(?:sold|sale|transferred|marketed)\b/.test(s)) {
    return 'Sold';
  }
  if (/\b(?:ref|reference|ancestor|pedigree|retired|historical|external)\b/.test(s)) {
    return 'Retired';
  }
  if (/\b(?:archived|inactive|not active|non-active)\b/.test(s)) {
    return 'Archived';
  }
  if (/\b(?:junior|weanling|nursing|kid|calf|lamb|kit|cria|foal|puppy|chick|feeder)\b/.test(s)) {
    return 'Junior';
  }
  return 'Active';
}

function buildNormalizedTablesFromEntry(entry: VirtualArchiveEntry): NormalizedTable[] {
  if (entry.isMediaOrBinary || !entry.textContent) return [];

  if (entry.extension === 'json') {
    try {
      const parsed = JSON.parse(entry.textContent);
      const out: NormalizedTable[] = [];

      const convertObjArray = (nameSuffix: string, arr: unknown[]) => {
        const validObjs = arr.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) as Array<
          Record<string, unknown>
        >;
        if (validObjs.length === 0) return;
        const headerSet = new Set<string>();
        for (const item of validObjs) {
          for (const k of Object.keys(item)) headerSet.add(k);
        }
        const headers = Array.from(headerSet).filter((h) => isSafeRecordKey(h));
        const normHeaderMap = new Map<string, string>();
        for (const h of headers) normHeaderMap.set(normalizeColumnKey(h), h);
        const rows = validObjs.map((item) => {
          const r: Record<string, string> = Object.create(null);
          for (const h of headers) {
            if (!isSafeRecordKey(h)) continue;
            const v = item[h];
            r[h] =
              v === null || v === undefined
                ? ''
                : typeof v === 'object'
                ? JSON.stringify(v)
                : String(v).trim();
          }
          return r;
        });
        out.push({
          archiveName: entry.archiveName,
          entryPath: nameSuffix ? `${entry.entryPath}#${nameSuffix}` : entry.entryPath,
          baseName: nameSuffix || entry.baseName,
          headers,
          normHeaderMap,
          rows,
        });
      };

      if (Array.isArray(parsed)) {
        convertObjArray('', parsed);
      } else if (parsed && typeof parsed === 'object') {
        for (const [key, val] of Object.entries(parsed)) {
          if (Array.isArray(val)) {
            convertObjArray(key, val);
          }
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  if (entry.extension === 'csv' || entry.extension === 'tsv' || entry.extension === 'txt') {
    const { headers, rows } = parseDelimitedTable(entry.textContent);
    if (headers.length === 0) return [];
    const normHeaderMap = new Map<string, string>();
    for (const h of headers) {
      const nk = normalizeColumnKey(h);
      if (nk && !normHeaderMap.has(nk)) normHeaderMap.set(nk, h);
    }
    return [
      {
        archiveName: entry.archiveName,
        entryPath: entry.entryPath,
        baseName: entry.baseName,
        headers,
        normHeaderMap,
        rows,
      },
    ];
  }

  return [];
}

function pickCell(
  row: Record<string, string>,
  normHeaderMap: Map<string, string>,
  usedCols: Set<string>,
  candidates: string[]
): string {
  for (const cand of candidates) {
    const actual = normHeaderMap.get(cand);
    if (actual !== undefined) {
      usedCols.add(actual);
      const val = row[actual];
      if (val !== undefined && val !== '') return val;
    }
  }
  return '';
}

function hasAnyColumn(normHeaderMap: Map<string, string>, candidates: string[]): boolean {
  return candidates.some((c) => normHeaderMap.has(c));
}

function classifyHerdBossTable(table: NormalizedTable): ImportedTableClassification {
  const fname = table.baseName.toLowerCase();
  const h = table.normHeaderMap;

  // 0. Photo / Image / Attachment Manifest tables (often 1-to-many rows per animal with captions/notes)
  // Must run BEFORE `notes_tasks` so multi-photo manifests aren't misclassified as CareLogs!
  if (
    (/\b(?:photo|photos|image|images|picture|pictures|media|attachment|attachments|gallery)\b/.test(
      fname
    ) &&
      !hasAnyColumn(h, ['sex', 'gender', 'birthdate', 'dob', 'sire', 'dam'])) ||
    (hasAnyColumn(h, [
      'filename',
      'filepath',
      'photofile',
      'imagefile',
      'photourl',
      'imageurl',
      'mimetype',
      'contenttype',
    ]) &&
      !hasAnyColumn(h, ['sex', 'gender', 'birthdate', 'dob', 'sire', 'dam']))
  ) {
    return 'media_manifest';
  }

  // 1. Weight logs
  if (
    /\b(?:weight|weights|weigh|weighin|weighins)\b/.test(fname) ||
    (hasAnyColumn(h, ['weight', 'weightlbs', 'weightkg', 'weightvalue']) &&
      hasAnyColumn(h, ['weighdate', 'weightdate', 'date', 'recordedat']) &&
      !hasAnyColumn(h, ['sex', 'gender', 'birthdate', 'dob']))
  ) {
    return 'weights';
  }

  // 2. Treatments / Medications / Health / Hoof / Breeding Soundness
  if (
    /\b(?:treatment|treatments|medication|medications|medicine|health|vaccine|vaccination|vaccinations|deworm|parasite|hoof|shearing|vet|medical)\b/.test(
      fname
    ) ||
    hasAnyColumn(h, [
      'medication',
      'medicine',
      'drug',
      'dosage',
      'dose',
      'withdrawaldate',
      'meatwithdrawal',
      'milkwithdrawal',
      'treatment',
      'treatmenttype',
      'vaccine',
      'famacha',
    ])
  ) {
    return 'treatments_care';
  }

  // 3. Breedings / Matings / Exposures / Pregnancies / Birthing
  if (
    /\b(?:breeding|breedings|mating|matings|exposure|exposures|pregnancy|pregnancies|kidding|lambing|calving|kindling|farrowing|whelping|litter|litters|birth|births)\b/.test(
      fname
    ) ||
    (hasAnyColumn(h, [
      'breddate',
      'breedingdate',
      'matingdate',
      'exposurestart',
      'startdate',
      'duedate',
      'expectedduedate',
      'kiddingdate',
      'lambingdate',
      'calvingdate',
      'kindlingdate',
    ]) &&
      hasAnyColumn(h, [
        'sire',
        'sireid',
        'siretag',
        'sirename',
        'male',
        'buck',
        'ram',
        'bull',
        'dam',
        'damid',
        'damtag',
        'damname',
        'female',
        'doe',
        'ewe',
        'cow',
      ]))
  ) {
    return 'breedings';
  }

  // 4. Dedicated Pedigree / Parent Link table (without full animal demographics)
  if (
    /\b(?:pedigree|pedigrees|lineage|parents|ancestors)\b/.test(fname) &&
    !hasAnyColumn(h, ['sex', 'gender', 'birthdate', 'dob'])
  ) {
    return 'pedigree_links';
  }

  // 5. Groups / Herds / Pastures / Pens / Locations
  if (
    /\b(?:group|groups|pasture|pastures|pen|pens|paddock|location|locations|cage|cages)\b/.test(
      fname
    ) &&
    !hasAnyColumn(h, ['sex', 'gender', 'birthdate', 'dob', 'sire', 'dam'])
  ) {
    return 'cages_groups';
  }

  // 6. Shows / Exhibitions
  if (
    /\b(?:show|shows|exhibition|fair|award|awards|leg|legs)\b/.test(fname) &&
    hasAnyColumn(h, ['showdate', 'eventdate', 'showname', 'judge', 'placing', 'class'])
  ) {
    return 'shows';
  }

  // 7. Animals / Herd / Stock / Reference Ancestors
  if (
    /\b(?:animal|animals|herd|flock|livestock|stock|goat|goats|sheep|cattle|cow|cows|rabbit|rabbits|pig|pigs|swine|dog|dogs|alpaca|alpacas|reference)\b/.test(
      fname
    ) ||
    (hasAnyColumn(h, [
      'name',
      'animalname',
      'tag',
      'primarytag',
      'visualtag',
      'eartag',
      'tattoo',
      'eid',
      'registrationnumber',
    ]) &&
      hasAnyColumn(h, [
        'sex',
        'gender',
        'birthdate',
        'dob',
        'breed',
        'sire',
        'dam',
        'sireid',
        'damid',
      ]))
  ) {
    return 'animals';
  }

  // 8. Notes / Tasks / Reminders
  if (
    /\b(?:note|notes|journal|task|tasks|reminder|reminders|todo|chore|observation)\b/.test(
      fname
    ) ||
    hasAnyColumn(h, ['note', 'notes', 'comment', 'comments', 'duedate', 'task', 'title'])
  ) {
    return 'notes_tasks';
  }

  return 'metadata_other';
}

function createMissingSpeciesProfile(
  speciesName: string,
  sortOrder: number,
  ts: string,
  override?: CustomSpeciesImportOverride
): SpeciesProfile {
  const preset = PREDEFINED_SPECIES_PRESETS.find((p) => isSameSpecies(p.name, speciesName));
  if (preset && !override) {
    return {
      ...preset,
      sortOrder,
      createdAt: ts,
      updatedAt: ts,
    };
  }
  const customBase = preset
    ? {
        gestationDays: preset.gestationDays,
        weanDays: preset.weanDaysAfterBirth,
        rebreedDays: preset.rebreedDaysAfterBirth,
        birthLabel: preset.birthEventLabel,
        maleLabel: preset.maleLabel,
        femaleLabel: preset.femaleLabel,
        offspringLabel: preset.offspringLabel,
      }
    : CUSTOM_SPECIES_DEFAULTS[speciesName] || {
        gestationDays: 145,
        weanDays: 60,
        rebreedDays: 45,
        birthLabel: 'Birth',
        maleLabel: 'Sire',
        femaleLabel: 'Dam',
        offspringLabel: 'Offspring',
      };

  const gestationDays = Math.max(
    1,
    Math.round(override?.gestationDays ?? customBase.gestationDays)
  );
  const weanDays = Math.max(1, Math.round(override?.weanDaysAfterBirth ?? customBase.weanDays));
  const rebreedDays = Math.max(
    1,
    Math.round(override?.rebreedDaysAfterBirth ?? customBase.rebreedDays)
  );
  const birthLabel = (override?.birthEventLabel || '').trim() || customBase.birthLabel;
  const maleLabel = (override?.maleLabel || '').trim() || customBase.maleLabel;
  const femaleLabel = (override?.femaleLabel || '').trim() || customBase.femaleLabel;
  const offspringLabel = (override?.offspringLabel || '').trim() || customBase.offspringLabel;

  return {
    id: preset?.id || `species-${slugifyKey(speciesName)}`,
    name: speciesName,
    sortOrder,
    gestationDays,
    rebreedDaysAfterBirth: rebreedDays,
    weanDaysAfterBirth: weanDays,
    birthEventLabel: birthLabel,
    maleLabel,
    femaleLabel,
    offspringLabel,
    exampleBreeds: preset?.exampleBreeds || [],
    milestones: preset?.milestones || [
      {
        label: 'Pregnancy / Fertility Check',
        relativeTo: 'AFTER_BRED',
        daysOffset: Math.max(5, Math.round(gestationDays * 0.25)),
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: `Prepare ${birthLabel} Pen`,
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: Math.min(7, Math.max(2, Math.round(gestationDays * 0.08))),
        category: 'Nestbox',
        priority: 'High',
      },
      {
        label: `Wean ${offspringLabel}s`,
        relativeTo: 'AFTER_BIRTH',
        daysOffset: weanDays,
        category: 'Weaning',
        priority: 'High',
      },
    ],
    createdAt: ts,
    updatedAt: ts,
  };
}

export const HerdBossImporter: PlatformImporter = {
  id: 'herdboss',
  name: 'HerdBoss (2-ZIP / CSV Export)',
  badge: 'Multi-ZIP Supported',
  supportsMultiZip: true,
  acceptedExtensions: ['.zip', '.csv', '.tsv', '.json'],
  summary:
    'Imports HerdBoss multi-ZIP exports (animals, multi-generation Sire/Dam pedigrees, tags/EID/tattoos, breedings, weights, treatments, herd locations, and multi-photo animal galleries with automatic storage optimization).',
  instructions:
    'Stage both HerdBoss export .ZIP files together (either select both at once or click "+ Add Companion .ZIP" for Part 1 and Part 2), review the detected records & auto-optimized photo preview below, then click Merge Into Barn.',

  parse(
    inputs: RawArchiveInput[],
    existingSnapshot: BarnDatabaseSnapshot,
    options: ImporterRunOptions
  ): PlatformImportPreview {
    const ts = nowIsoUtc();
    const warnings: string[] = [];
    const archiveNames = inputs.map((i) => i.fileName);

    const entries = extractVirtualEntries(inputs);
    let deferredMediaCount = 0;
    let deferredMediaBytes = 0;
    const deferredMediaSampleNames: string[] = [];
    const imageArchiveEntries: VirtualArchiveEntry[] = [];
    const imageByNormPath = new Map<string, VirtualArchiveEntry>();
    const imagesByBaseName = new Map<string, VirtualArchiveEntry[]>();
    let deferredManifestRowCount = 0;
    let missingPhotoZipRefsCount = 0;
    const perAnimalImages = new Map<string, Set<string>>();

    interface QueuedAnimalImage {
      entry: VirtualArchiveEntry;
      caption: string;
      preferPrimary: boolean;
    }
    const queuedImagesByAnimal = new Map<string, QueuedAnimalImage[]>();
    const claimedImagePaths = new Set<string>();
    const inlinePhotoRefs: Array<{
      animalId: string;
      tokens: string[];
      rawPhotoRef: string;
      preferPrimary: boolean;
    }> = [];

    const recordDeferredImageForAnimal = (animalId: string, imageLabel: string) => {
      const clean = imageLabel.trim();
      if (!animalId || !clean) return;
      let set = perAnimalImages.get(animalId);
      if (!set) {
        set = new Set<string>();
        perAnimalImages.set(animalId, set);
      }
      set.add(clean);
    };

    const queueBinaryImageForAnimal = (
      animalId: string,
      entry: VirtualArchiveEntry,
      caption = '',
      preferPrimary = false
    ) => {
      if (!animalId || !entry.imageBytes) return;
      let list = queuedImagesByAnimal.get(animalId);
      if (!list) {
        list = [];
        queuedImagesByAnimal.set(animalId, list);
      }
      const existing = list.find((q) => q.entry.entryPath === entry.entryPath);
      if (existing) {
        if (caption && !existing.caption) existing.caption = caption;
        if (preferPrimary) existing.preferPrimary = true;
        return;
      }
      list.push({ entry, caption, preferPrimary });
      claimedImagePaths.add(`${entry.archiveName}::${entry.entryPath}`);
      recordDeferredImageForAnimal(animalId, entry.baseName);
    };

    const resolveImageEntry = (
      rawRef: string,
      animalHintTokens: string[]
    ): VirtualArchiveEntry | undefined => {
      const cleaned = rawRef
        .trim()
        .split('?')[0]
        .replace(/\\/g, '/')
        .replace(/^\.?\/+/, '');
      if (!cleaned) return undefined;
      const lower = cleaned.toLowerCase();

      const exact = imageByNormPath.get(lower);
      if (exact) return exact;

      // Suffix match (e.g. CSV says `1042/front.jpg`, ZIP has `export/photos/1042/front.jpg`)
      for (const [pathKey, ent] of imageByNormPath.entries()) {
        if (pathKey.endsWith(`/${lower}`)) return ent;
      }

      const base = lower.split('/').pop() || lower;
      const baseMatches = imagesByBaseName.get(base);
      if (!baseMatches || baseMatches.length === 0) return undefined;
      if (baseMatches.length === 1) return baseMatches[0];

      // Disambiguate shared filenames (`photo1.jpg`) using animal ID/tag folder tokens
      const cleanHints = animalHintTokens
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0);
      for (const ent of baseMatches) {
        const pLower = ent.entryPath.toLowerCase();
        if (cleanHints.some((tok) => pLower.includes(`/${tok}/`) || pLower.includes(tok))) {
          return ent;
        }
      }
      return baseMatches[0];
    };

    const diagnostics: DetectedTableDiagnostic[] = [];
    const classifiedTables: Array<{
      table: NormalizedTable;
      classification: ImportedTableClassification;
      usedCols: Set<string>;
    }> = [];

    for (const entry of entries) {
      if (entry.isMediaOrBinary) {
        if (entry.imageBytes && entry.mimeHint) {
          imageArchiveEntries.push(entry);
          const normPath = entry.entryPath.replace(/\\/g, '/').replace(/^\.?\/+/, '').toLowerCase();
          if (!imageByNormPath.has(normPath)) {
            imageByNormPath.set(normPath, entry);
          }
          const baseLower = entry.baseName.toLowerCase();
          const bucket = imagesByBaseName.get(baseLower) || [];
          bucket.push(entry);
          imagesByBaseName.set(baseLower, bucket);
        } else {
          // Non-image binary attachments (.pdf, .doc, .mp4, etc.)
          deferredMediaCount++;
          deferredMediaBytes += entry.sizeBytes;
          if (deferredMediaSampleNames.length < 6) {
            deferredMediaSampleNames.push(entry.entryPath);
          }
        }
        continue;
      }
      const tables = buildNormalizedTablesFromEntry(entry);
      for (const table of tables) {
        const classification = classifyHerdBossTable(table);
        classifiedTables.push({
          table,
          classification,
          usedCols: new Set<string>(),
        });
      }
    }

    // Track known + newly discovered species profiles
    const workingSpeciesProfiles: SpeciesProfile[] = [...existingSnapshot.speciesProfiles];
    const newSpeciesProfiles: SpeciesProfile[] = [];
    const speciesDetectedSet = new Set<string>();

    const ensureSpecies = (rawSpecies: string | undefined, fileBaseName: string): SpeciesProfile => {
      const resolvedName = normalizeSpeciesName(
        rawSpecies,
        fileBaseName,
        workingSpeciesProfiles,
        options.fallbackSpeciesName
      );
      speciesDetectedSet.add(resolvedName);
      const found = workingSpeciesProfiles.find((p) => isSameSpecies(p.name, resolvedName));
      if (found) return found;

      const override = options.customSpeciesOverrides?.[resolvedName.trim().toLowerCase()];
      const created = createMissingSpeciesProfile(
        resolvedName,
        workingSpeciesProfiles.length,
        ts,
        override
      );
      workingSpeciesProfiles.push(created);
      newSpeciesProfiles.push(created);
      return created;
    };

    // Entity accumulators
    const animalsById = new Map<string, Animal>();
    const matchedExistingByAnimalId = new Map<string, PreexistingAnimalMatch>();
    // Per-species lookup index: key = `${species.toLowerCase()}::${lookupToken.toLowerCase()}` -> animal.id
    const animalLookup = new Map<string, string>();
    const pendingLineage: PendingLineageRef[] = [];
    const cagesByKey = new Map<string, CageLocation>();
    const breedings: BreedingRecord[] = [];
    const careLogs: CareLog[] = [];
    const tasks: BarnTask[] = [];
    const shows: ShowEvent[] = [];

    const registerLookupToken = (
      species: string,
      token: string | undefined,
      animalId: string,
      overwrite = false
    ) => {
      const clean = (token || '').trim().toLowerCase();
      if (!clean) return;
      const key = `${species.trim().toLowerCase()}::${clean}`;
      if (overwrite || !animalLookup.has(key)) {
        animalLookup.set(key, animalId);
      }
    };

    // Also index existing barn animals so cross-archive or incremental imports can link to existing stock!
    for (const existingAnimal of existingSnapshot.animals) {
      registerLookupToken(existingAnimal.species, existingAnimal.id, existingAnimal.id);
      registerLookupToken(existingAnimal.species, existingAnimal.tattoo, existingAnimal.id);
      registerLookupToken(existingAnimal.species, existingAnimal.name, existingAnimal.id);
      registerLookupToken(
        existingAnimal.species,
        existingAnimal.registrationNumber,
        existingAnimal.id
      );
    }

    const ensureCageLocation = (species: string, labelRaw: string, sectionRaw = 'Imported Group') => {
      const label = labelRaw.trim();
      if (!label) return;
      const key = `${species.toLowerCase()}::${label.toLowerCase()}`;
      if (cagesByKey.has(key)) return;
      const existingCage = existingSnapshot.cages.find(
        (c) => isSameSpecies(c.species, species) && c.label.toLowerCase() === label.toLowerCase()
      );
      if (existingCage) return;
      cagesByKey.set(key, {
        id: deterministicEntityId('cage', species, label),
        species,
        label,
        section: sectionRaw,
        capacity: 10,
        notes: 'Imported from HerdBoss',
        createdAt: ts,
        updatedAt: ts,
      });
    };

    // PASS 1: Process `cages_groups` and `animals` tables first so all primary animals are indexed
    for (const item of classifiedTables) {
      if (item.classification !== 'cages_groups') continue;
      const { table, usedCols } = item;
      for (const row of table.rows) {
        const rawSpecies = pickCell(row, table.normHeaderMap, usedCols, [
          'species',
          'animaltype',
          'livestocktype',
        ]);
        const sp = ensureSpecies(rawSpecies, table.baseName);
        const label = pickCell(row, table.normHeaderMap, usedCols, [
          'name',
          'groupname',
          'group',
          'pasture',
          'pasturename',
          'pen',
          'location',
          'label',
        ]);
        const section =
          pickCell(row, table.normHeaderMap, usedCols, ['section', 'barn', 'type', 'category']) ||
          'HerdBoss Group';
        const notes = pickCell(row, table.normHeaderMap, usedCols, [
          'notes',
          'description',
          'comments',
        ]);
        if (label) {
          ensureCageLocation(sp.name, label, section);
          const created = cagesByKey.get(`${sp.name.toLowerCase()}::${label.toLowerCase()}`);
          if (created && notes) created.notes = notes;
        }
      }
    }

    for (const item of classifiedTables) {
      if (item.classification !== 'animals') continue;
      const { table, usedCols } = item;

      table.rows.forEach((row, rowIdx) => {
        const rawSpecies = pickCell(row, table.normHeaderMap, usedCols, [
          'species',
          'animaltype',
          'livestocktype',
          'speciestype',
        ]);
        const sp = ensureSpecies(rawSpecies, table.baseName);

        const extId = pickCell(row, table.normHeaderMap, usedCols, [
          'id',
          'animalid',
          'herdbossid',
          'uuid',
          'recordid',
          'guid',
        ]);
        const primaryTag = pickCell(row, table.normHeaderMap, usedCols, [
          'primarytag',
          'visualtag',
          'tag',
          'tagnumber',
          'eartag',
          'animaltag',
          'number',
        ]);
        const tattooField = pickCell(row, table.normHeaderMap, usedCols, [
          'tattoo',
          'eartattoo',
          'lefttattoo',
          'lefteartattoo',
          'righttattoo',
          'righteartattoo',
          'herdmark',
          'brand',
        ]);
        const rightTattoo = pickCell(row, table.normHeaderMap, usedCols, [
          'righttattoo',
          'righteartattoo',
        ]);
        const eid = pickCell(row, table.normHeaderMap, usedCols, [
          'eid',
          'rfid',
          'rfidtag',
          'electronicid',
          'microchip',
        ]);
        const scrapie = pickCell(row, table.normHeaderMap, usedCols, [
          'scrapietag',
          'scrapie',
          'scrapieid',
          'flockid',
        ]);

        const combinedTattoo =
          tattooField && rightTattoo && tattooField !== rightTattoo
            ? `${tattooField} / ${rightTattoo}`
            : primaryTag || tattooField || scrapie || eid;

        const rawName = pickCell(row, table.normHeaderMap, usedCols, [
          'name',
          'animalname',
          'registeredname',
          'callname',
          'barnname',
        ]);
        const displayName = rawName || combinedTattoo || `Animal #${rowIdx + 1}`;

        const breed = pickCell(row, table.normHeaderMap, usedCols, [
          'breed',
          'primarybreed',
          'breedname',
          'breedcomposition',
          'crossbreed',
        ]);
        const variety = pickCell(row, table.normHeaderMap, usedCols, [
          'color',
          'variety',
          'coatcolor',
          'markings',
          'pattern',
          'coloration',
        ]);
        const rawSex = pickCell(row, table.normHeaderMap, usedCols, [
          'sex',
          'gender',
          'biologicalsex',
        ]);
        const { sex, castratedNote } = parseHerdBossSex(rawSex);

        const rawStatus = pickCell(row, table.normHeaderMap, usedCols, [
          'status',
          'herdstatus',
          'animalstatus',
          'state',
          'disposition',
        ]);
        const soldDate = pickCell(row, table.normHeaderMap, usedCols, ['solddate', 'datesold']);
        const deathDate = pickCell(row, table.normHeaderMap, usedCols, [
          'deathdate',
          'deceaseddate',
          'dieddate',
          'culldate',
        ]);
        const refFlag = pickCell(row, table.normHeaderMap, usedCols, [
          'isreference',
          'reference',
          'pedigreeonly',
        ]);
        const archivedFlag = pickCell(row, table.normHeaderMap, usedCols, ['archived', 'isarchived']);
        const activeFlag = pickCell(row, table.normHeaderMap, usedCols, ['active', 'isactive']);
        const status = parseHerdBossAnimalStatus(
          rawStatus,
          soldDate,
          deathDate,
          refFlag,
          archivedFlag,
          activeFlag
        );

        const birthDateIso = normalizeFlexibleDateIso(
          pickCell(row, table.normHeaderMap, usedCols, [
            'birthdate',
            'dob',
            'dateofbirth',
            'born',
            'borndate',
          ])
        );

        const weightUnitCol = pickCell(row, table.normHeaderMap, usedCols, [
          'weightunit',
          'unit',
          'units',
        ]);
        const currentWeightRaw = pickCell(row, table.normHeaderMap, usedCols, [
          'currentweight',
          'weight',
          'lastweight',
          'weightlbs',
          'weightkg',
        ]);
        const birthWeightRaw = pickCell(row, table.normHeaderMap, usedCols, [
          'birthweight',
          'bornweight',
        ]);
        const weanWeightRaw = pickCell(row, table.normHeaderMap, usedCols, [
          'weaningweight',
          'weanweight',
        ]);

        const currentGrams = parseFlexibleWeightToGrams(currentWeightRaw, weightUnitCol);
        const weanGrams = parseFlexibleWeightToGrams(weanWeightRaw, weightUnitCol);
        const birthGrams = parseFlexibleWeightToGrams(birthWeightRaw, weightUnitCol);
        const bestWeightGrams = currentGrams || weanGrams || birthGrams || 0;

        const regNum = pickCell(row, table.normHeaderMap, usedCols, [
          'registrationnumber',
          'registration',
          'regnumber',
          'regno',
          'registrynumber',
          'associationnumber',
        ]);
        const gcNum = pickCell(row, table.normHeaderMap, usedCols, [
          'grandchampionnumber',
          'gcnumber',
          'championnumber',
        ]);
        const genotypeRaw = pickCell(row, table.normHeaderMap, usedCols, [
          'genotype',
          'dna',
          'dnamarkers',
          'colorgenetics',
          'codon171',
          'scrapiegenotype',
        ]);
        const rufusRaw = pickCell(row, table.normHeaderMap, usedCols, [
          'rufus',
          'rufuslevel',
          'rufusintensity',
          'rufusfactor',
        ]);
        const rufusLevel = normalizeRufusLevel(rufusRaw);

        const location = pickCell(row, table.normHeaderMap, usedCols, [
          'group',
          'groupname',
          'subherd',
          'pasture',
          'pen',
          'cage',
          'cagelocation',
          'location',
          'barn',
        ]);
        if (location) {
          ensureCageLocation(sp.name, location);
        }

        const breederName = pickCell(row, table.normHeaderMap, usedCols, [
          'breeder',
          'breedername',
          'bredby',
          'origin',
          'purchasedfrom',
          'seller',
        ]);
        const rawOwner = pickCell(row, table.normHeaderMap, usedCols, ['owner', 'ownername']);

        const baseNotes = pickCell(row, table.normHeaderMap, usedCols, [
          'notes',
          'note',
          'comments',
          'comment',
          'description',
          'remarks',
        ]);

        const extraMetaParts: string[] = [];
        if (castratedNote) extraMetaParts.push(castratedNote);
        if (primaryTag && tattooField && primaryTag !== tattooField) {
          extraMetaParts.push(`Tag: ${primaryTag}, Tattoo: ${tattooField}`);
        }
        if (eid && eid !== combinedTattoo) extraMetaParts.push(`EID/RFID: ${eid}`);
        if (scrapie && scrapie !== combinedTattoo) extraMetaParts.push(`Scrapie: ${scrapie}`);
        if (baseNotes) extraMetaParts.push(baseNotes);

        const stableSeed = extId || combinedTattoo || regNum || `${displayName}-${birthDateIso || rowIdx}`;
        const candidateDeterministicId = deterministicEntityId('animal', sp.name, stableSeed);

        // Check if this animal already exists in the barn within the same species!
        const preexistingMatch = findPreexistingAnimalMatch(existingSnapshot.animals, {
          species: sp.name,
          candidateDeterministicId,
          externalId: extId,
          tattoo: combinedTattoo,
          registrationNumber: regNum,
          name: rawName || combinedTattoo,
          birthDateIso,
        });

        const animalId = preexistingMatch ? preexistingMatch.animal.id : candidateDeterministicId;
        if (preexistingMatch) {
          matchedExistingByAnimalId.set(animalId, preexistingMatch);
        }

        const ownerName =
          rawOwner || (preexistingMatch ? '' : existingSnapshot.settings.barnName);

        const hasExplicitStatusSignal = Boolean(
          rawStatus || soldDate || deathDate || refFlag || archivedFlag || activeFlag
        );
        const resolvedStatus = hasExplicitStatusSignal
          ? status
          : preexistingMatch?.animal.status || status;
        const detectedArchived =
          resolvedStatus === 'Archived' ||
          resolvedStatus === 'Deceased' ||
          resolvedStatus === 'Sold' ||
          resolvedStatus === 'Retired' ||
          /^(?:1|true|yes|y|archived|inactive|ref|reference)$/i.test(refFlag) ||
          /^(?:1|true|yes|y|archived)$/i.test(archivedFlag) ||
          /^(?:0|false|no|n|inactive)$/i.test(activeFlag) ||
          /^(?:archived|inactive|culled|harvested|butchered|dead|died|sold|pet|gone|retired|reference)$/i.test(
            rawStatus
          );

        const animal: Animal = {
          id: animalId,
          tattoo: combinedTattoo,
          name: displayName,
          species: sp.name,
          breed,
          variety,
          sex,
          status: resolvedStatus,
          archived: hasExplicitStatusSignal
            ? detectedArchived
            : Boolean(preexistingMatch?.animal.archived),
          birthDateIso,
          weightGrams: bestWeightGrams,
          genotype: parseGenotypeString(genotypeRaw, sp.name),
          genotypeRaw,
          ...(rufusLevel ? { rufusLevel } : {}),
          registrationNumber: regNum,
          grandChampionNumber: gcNum,
          legsCount: preexistingMatch?.animal.legsCount || 0,
          cageLocation: location,
          breederName,
          ownerName,
          sireId: '',
          damId: '',
          notes: extraMetaParts.join(' · '),
          createdAt: preexistingMatch?.animal.createdAt || ts,
          updatedAt: ts,
        };

        animalsById.set(animalId, animal);

        // Index every identifier so Sire/Dam, Breeding, Weight, Treatment, and Photo rows resolve cleanly
        registerLookupToken(sp.name, extId, animalId, true);
        registerLookupToken(sp.name, primaryTag, animalId, true);
        registerLookupToken(sp.name, tattooField, animalId, true);
        registerLookupToken(sp.name, combinedTattoo, animalId, true);
        registerLookupToken(sp.name, eid, animalId, true);
        registerLookupToken(sp.name, scrapie, animalId, true);
        registerLookupToken(sp.name, regNum, animalId, true);
        registerLookupToken(sp.name, rawName, animalId, true);
        registerLookupToken(sp.name, displayName, animalId, true);

        // Detect inline single or multi-image columns (e.g. Photo, Photos, Image1, Image2, Attachments)
        const animalHintTokens = [extId, primaryTag, tattooField, combinedTattoo, rawName].filter(
          Boolean
        );
        for (const [normKey, actualHeader] of table.normHeaderMap.entries()) {
          if (
            /^(?:photo|photos|image|images|picture|pictures|pic|pics|avatar|profilephoto|primaryphoto|attachment|attachments)\d*(?:url|file|path|name)?$/.test(
              normKey
            )
          ) {
            usedCols.add(actualHeader);
            const rawCell = (row[actualHeader] || '').trim();
            if (rawCell && !/^(?:none|null|false|0|n\/a)$/i.test(rawCell)) {
              const isPrimaryCol = /^(?:avatar|profilephoto|primaryphoto|photo1|image1)$/.test(
                normKey
              );
              const refs = rawCell
                .split(/[;|\n]+|,\s*(?=(?:https?:\/\/|[\w./-]+\.[a-z0-9]{2,5}\b))/i)
                .map((t) => t.trim())
                .filter(Boolean);
              refs.forEach((refItem, refIdx) => {
                inlinePhotoRefs.push({
                  animalId,
                  tokens: animalHintTokens,
                  rawPhotoRef: refItem,
                  preferPrimary: isPrimaryCol && refIdx === 0,
                });
              });
            }
          }
        }

        // Record inline birth/weaning weights as CareLogs if present
        if (birthGrams > 0) {
          careLogs.push({
            id: deterministicEntityId('care', sp.name, `${stableSeed}-birth-wt`),
            species: sp.name,
            animalId,
            dateIso: birthDateIso || todayDateIso(),
            type: 'Weight Check',
            title: 'Birth Weight (HerdBoss)',
            weightGrams: birthGrams,
            showLegEarned: false,
            notes: '',
            createdAt: ts,
            updatedAt: ts,
          });
        }
        if (weanGrams > 0) {
          careLogs.push({
            id: deterministicEntityId('care', sp.name, `${stableSeed}-wean-wt`),
            species: sp.name,
            animalId,
            dateIso: birthDateIso ? addDaysIso(birthDateIso, sp.weanDaysAfterBirth) : todayDateIso(),
            type: 'Weight Check',
            title: 'Weaning Weight (HerdBoss)',
            weightGrams: weanGrams,
            showLegEarned: false,
            notes: '',
            createdAt: ts,
            updatedAt: ts,
          });
        }

        // Capture Sire & Dam + optional Grandsire/Granddam columns for Pass 2 resolution
        const sireRef = pickCell(row, table.normHeaderMap, usedCols, [
          'sireid',
          'sire',
          'siretag',
          'sirevisualtag',
          'sirename',
          'sireregistrationnumber',
          'father',
          'fatherid',
        ]);
        const damRef = pickCell(row, table.normHeaderMap, usedCols, [
          'damid',
          'dam',
          'damtag',
          'damvisualtag',
          'damname',
          'damregistrationnumber',
          'geneticdam',
          'birthdam',
          'mother',
          'motherid',
        ]);
        const patGrandsire = pickCell(row, table.normHeaderMap, usedCols, [
          'siresire',
          'siressire',
          'paternalgrandsire',
          'siresireid',
        ]);
        const patGranddam = pickCell(row, table.normHeaderMap, usedCols, [
          'siredam',
          'siresdam',
          'paternalgranddam',
          'siredamid',
        ]);
        const matGrandsire = pickCell(row, table.normHeaderMap, usedCols, [
          'damsire',
          'damssire',
          'maternalgrandsire',
          'damsireid',
        ]);
        const matGranddam = pickCell(row, table.normHeaderMap, usedCols, [
          'damdam',
          'damsdam',
          'maternalgranddam',
          'damdamid',
        ]);

        if (sireRef || damRef) {
          pendingLineage.push({
            animalId,
            species: sp.name,
            breed,
            sireRef,
            damRef,
            paternalGrandsireRef: patGrandsire,
            paternalGranddamRef: patGranddam,
            maternalGrandsireRef: matGrandsire,
            maternalGranddamRef: matGranddam,
          });
        }
      });
    }

    // Also process standalone `pedigree_links` tables if HerdBoss exported one separately
    for (const item of classifiedTables) {
      if (item.classification !== 'pedigree_links') continue;
      const { table, usedCols } = item;
      for (const row of table.rows) {
        const rawSpecies = pickCell(row, table.normHeaderMap, usedCols, ['species', 'animaltype']);
        const sp = ensureSpecies(rawSpecies, table.baseName);
        const childRef = pickCell(row, table.normHeaderMap, usedCols, [
          'animalid',
          'id',
          'animal',
          'tag',
          'primarytag',
          'name',
        ]);
        const sireRef = pickCell(row, table.normHeaderMap, usedCols, [
          'sireid',
          'sire',
          'siretag',
          'sirename',
        ]);
        const damRef = pickCell(row, table.normHeaderMap, usedCols, [
          'damid',
          'dam',
          'damtag',
          'damname',
        ]);
        const childId = animalLookup.get(`${sp.name.toLowerCase()}::${childRef.trim().toLowerCase()}`);
        if (childId && (sireRef || damRef)) {
          const child = animalsById.get(childId);
          pendingLineage.push({
            animalId: childId,
            species: sp.name,
            breed: child?.breed || '',
            sireRef,
            damRef,
            paternalGrandsireRef: '',
            paternalGranddamRef: '',
            maternalGrandsireRef: '',
            maternalGranddamRef: '',
          });
        }
      }
    }

    // PASS 2: Resolve all Sire/Dam references (synthesizing foundation/reference ancestors when external)
    let parentLinksResolved = 0;
    let placeholderAncestorsCreated = 0;

    const resolveOrCreateAncestor = (
      species: string,
      refRaw: string,
      expectedSex: 'Male' | 'Female',
      defaultBreed: string,
      disallowSelfId: string
    ): string => {
      const cleanRef = refRaw.trim();
      if (!cleanRef || /^(?:unknown|none|n\/a|na|null|-|0)$/i.test(cleanRef)) return '';

      const existingId = animalLookup.get(`${species.toLowerCase()}::${cleanRef.toLowerCase()}`);
      if (existingId && existingId !== disallowSelfId) {
        return existingId;
      }

      // Synthesize a clean Reference / Foundation Ancestor so zero pedigree history is lost
      const ancId = deterministicEntityId('ancestor', species, `${expectedSex}-${cleanRef}`);
      if (ancId === disallowSelfId) return '';

      if (!animalsById.has(ancId)) {
        const looksLikeCode = /^[A-Z0-9#-]{1,12}$/i.test(cleanRef) && /\d/.test(cleanRef);
        const anc: Animal = {
          id: ancId,
          tattoo: looksLikeCode ? cleanRef : '',
          name: cleanRef,
          species,
          breed: defaultBreed,
          variety: '',
          sex: expectedSex,
          status: 'Retired',
          archived: true,
          birthDateIso: '',
          weightGrams: 0,
          genotype: [],
          genotypeRaw: '',
          registrationNumber: '',
          grandChampionNumber: '',
          legsCount: 0,
          cageLocation: '',
          breederName: '',
          ownerName: '',
          sireId: '',
          damId: '',
          notes: 'Reference ancestor synthesized from HerdBoss pedigree link.',
          createdAt: ts,
          updatedAt: ts,
        };
        animalsById.set(ancId, anc);
        registerLookupToken(species, cleanRef, ancId);
        placeholderAncestorsCreated++;
      }
      return ancId;
    };

    for (const link of pendingLineage) {
      const subject = animalsById.get(link.animalId);
      if (!subject) continue;

      if (link.sireRef) {
        const resolvedSireId = resolveOrCreateAncestor(
          link.species,
          link.sireRef,
          'Male',
          link.breed,
          subject.id
        );
        if (resolvedSireId) {
          subject.sireId = resolvedSireId;
          parentLinksResolved++;

          const sireRecord = animalsById.get(resolvedSireId);
          if (sireRecord) {
            if (link.paternalGrandsireRef && !sireRecord.sireId) {
              const pgs = resolveOrCreateAncestor(
                link.species,
                link.paternalGrandsireRef,
                'Male',
                link.breed,
                sireRecord.id
              );
              if (pgs) {
                sireRecord.sireId = pgs;
                parentLinksResolved++;
              }
            }
            if (link.paternalGranddamRef && !sireRecord.damId) {
              const pgd = resolveOrCreateAncestor(
                link.species,
                link.paternalGranddamRef,
                'Female',
                link.breed,
                sireRecord.id
              );
              if (pgd) {
                sireRecord.damId = pgd;
                parentLinksResolved++;
              }
            }
          }
        }
      }

      if (link.damRef) {
        const resolvedDamId = resolveOrCreateAncestor(
          link.species,
          link.damRef,
          'Female',
          link.breed,
          subject.id
        );
        if (resolvedDamId) {
          subject.damId = resolvedDamId;
          parentLinksResolved++;

          const damRecord = animalsById.get(resolvedDamId);
          if (damRecord) {
            if (link.maternalGrandsireRef && !damRecord.sireId) {
              const mgs = resolveOrCreateAncestor(
                link.species,
                link.maternalGrandsireRef,
                'Male',
                link.breed,
                damRecord.id
              );
              if (mgs) {
                damRecord.sireId = mgs;
                parentLinksResolved++;
              }
            }
            if (link.maternalGranddamRef && !damRecord.damId) {
              const mgd = resolveOrCreateAncestor(
                link.species,
                link.maternalGranddamRef,
                'Female',
                link.breed,
                damRecord.id
              );
              if (mgd) {
                damRecord.damId = mgd;
                parentLinksResolved++;
              }
            }
          }
        }
      }
    }

    // Helper to resolve an animal across imported + existing barn animals
    const findAnimalByAnyToken = (rawToken: string, preferredSpecies?: string): Animal | undefined => {
      const clean = rawToken.trim().toLowerCase();
      if (!clean) return undefined;

      if (preferredSpecies) {
        const id = animalLookup.get(`${preferredSpecies.toLowerCase()}::${clean}`);
        if (id) {
          return (
            animalsById.get(id) || existingSnapshot.animals.find((a) => a.id === id)
          );
        }
      }

      for (const [key, id] of animalLookup.entries()) {
        if (key.endsWith(`::${clean}`)) {
          return (
            animalsById.get(id) || existingSnapshot.animals.find((a) => a.id === id)
          );
        }
      }
      return undefined;
    };

    // PASS 3: Process Breedings, Weights, Treatments/Care, Notes/Tasks, and Shows across both ZIPs
    for (const item of classifiedTables) {
      const { table, classification, usedCols } = item;

      if (classification === 'weights') {
        table.rows.forEach((row, idx) => {
          const rawSpecies = pickCell(row, table.normHeaderMap, usedCols, ['species', 'animaltype']);
          const animalToken = pickCell(row, table.normHeaderMap, usedCols, [
            'animalid',
            'animal',
            'tag',
            'primarytag',
            'visualtag',
            'eartag',
            'tattoo',
            'name',
            'animalname',
          ]);
          const matchedAnimal = findAnimalByAnyToken(animalToken, rawSpecies);
          if (!matchedAnimal) return;

          const dateIso =
            normalizeFlexibleDateIso(
              pickCell(row, table.normHeaderMap, usedCols, [
                'weighdate',
                'weightdate',
                'date',
                'recordedat',
                'createdat',
              ])
            ) || todayDateIso();
          const unitCol = pickCell(row, table.normHeaderMap, usedCols, ['unit', 'units', 'weightunit']);
          const weightVal = pickCell(row, table.normHeaderMap, usedCols, [
            'weight',
            'weightlbs',
            'weightkg',
            'value',
            'amount',
          ]);
          const grams = parseFlexibleWeightToGrams(weightVal, unitCol);
          if (grams <= 0) return;

          const label =
            pickCell(row, table.normHeaderMap, usedCols, ['type', 'stage', 'label', 'title']) ||
            'Weight Check';
          const notes = pickCell(row, table.normHeaderMap, usedCols, [
            'notes',
            'note',
            'comments',
            'adg',
          ]);

          careLogs.push({
            id: deterministicEntityId(
              'weight',
              matchedAnimal.species,
              `${matchedAnimal.id}-${dateIso}-${grams}-${idx}`
            ),
            species: matchedAnimal.species,
            animalId: matchedAnimal.id,
            dateIso,
            type: 'Weight Check',
            title: label,
            weightGrams: grams,
            showLegEarned: false,
            notes,
            createdAt: ts,
            updatedAt: ts,
          });

          // Keep the animal's primary weightGrams synced with latest weigh-in
          const mutableAnimal = animalsById.get(matchedAnimal.id);
          if (mutableAnimal) {
            mutableAnimal.weightGrams = grams;
          }
        });
      } else if (classification === 'treatments_care') {
        table.rows.forEach((row, idx) => {
          const rawSpecies = pickCell(row, table.normHeaderMap, usedCols, ['species', 'animaltype']);
          const animalToken = pickCell(row, table.normHeaderMap, usedCols, [
            'animalid',
            'animal',
            'tag',
            'primarytag',
            'visualtag',
            'eartag',
            'tattoo',
            'name',
            'animalname',
          ]);
          const matchedAnimal = findAnimalByAnyToken(animalToken, rawSpecies);
          if (!matchedAnimal) return;

          const dateIso =
            normalizeFlexibleDateIso(
              pickCell(row, table.normHeaderMap, usedCols, [
                'treatmentdate',
                'date',
                'administereddate',
                'givenon',
                'recordedat',
              ])
            ) || todayDateIso();

          const medName = pickCell(row, table.normHeaderMap, usedCols, [
            'medication',
            'medicine',
            'product',
            'drug',
            'vaccine',
            'treatment',
            'treatmenttype',
            'procedure',
            'title',
          ]);
          const dosage = pickCell(row, table.normHeaderMap, usedCols, [
            'dosage',
            'dose',
            'amount',
          ]);
          const route = pickCell(row, table.normHeaderMap, usedCols, ['route', 'method', 'site']);
          const withdrawal = pickCell(row, table.normHeaderMap, usedCols, [
            'withdrawaldate',
            'meatwithdrawal',
            'milkwithdrawal',
            'withdrawal',
          ]);
          const famacha = pickCell(row, table.normHeaderMap, usedCols, ['famacha', 'bcs', 'score']);
          const notes = pickCell(row, table.normHeaderMap, usedCols, [
            'notes',
            'note',
            'comments',
            'reason',
          ]);

          const detailParts: string[] = [];
          if (dosage) detailParts.push(`Dose: ${dosage}`);
          if (route) detailParts.push(`Route: ${route}`);
          if (withdrawal) detailParts.push(`Withdrawal: ${withdrawal}`);
          if (famacha) detailParts.push(`Score: ${famacha}`);
          if (notes) detailParts.push(notes);

          const isHoofOrShear = /hoof|trim|shear|groom/i.test(`${table.baseName} ${medName}`);
          const logType: CareLogType = isHoofOrShear ? 'Grooming & Hoof' : 'Health / Vet';

          careLogs.push({
            id: deterministicEntityId(
              'treat',
              matchedAnimal.species,
              `${matchedAnimal.id}-${dateIso}-${medName || idx}`
            ),
            species: matchedAnimal.species,
            animalId: matchedAnimal.id,
            dateIso,
            type: logType,
            title: medName || 'Health / Treatment',
            weightGrams: 0,
            showLegEarned: false,
            notes: detailParts.join(' · '),
            createdAt: ts,
            updatedAt: ts,
          });
        });
      } else if (classification === 'breedings') {
        table.rows.forEach((row, idx) => {
          const rawSpecies = pickCell(row, table.normHeaderMap, usedCols, ['species', 'animaltype']);
          const sireToken = pickCell(row, table.normHeaderMap, usedCols, [
            'sireid',
            'sire',
            'siretag',
            'sirename',
            'male',
            'buck',
            'ram',
            'bull',
            'boar',
          ]);
          const damToken = pickCell(row, table.normHeaderMap, usedCols, [
            'damid',
            'dam',
            'damtag',
            'damname',
            'female',
            'doe',
            'ewe',
            'cow',
            'sow',
          ]);

          const matchedDam = findAnimalByAnyToken(damToken, rawSpecies);
          const matchedSire = findAnimalByAnyToken(
            sireToken,
            matchedDam?.species || rawSpecies
          );

          const spName =
            matchedDam?.species ||
            matchedSire?.species ||
            ensureSpecies(rawSpecies, table.baseName).name;
          const spProfile = resolveSpeciesProfile(spName, workingSpeciesProfiles);

          const bredDateIso = normalizeFlexibleDateIso(
            pickCell(row, table.normHeaderMap, usedCols, [
              'breddate',
              'breedingdate',
              'matingdate',
              'exposurestart',
              'startdate',
              'aidate',
              'servicedate',
              'date',
            ])
          );
          const actualBirthIso = normalizeFlexibleDateIso(
            pickCell(row, table.normHeaderMap, usedCols, [
              'birthdate',
              'actualbirthdate',
              'kiddingdate',
              'lambingdate',
              'calvingdate',
              'kindlingdate',
              'farrowingdate',
              'whelpingdate',
              'deliverydate',
            ])
          );
          const dueDateRaw = normalizeFlexibleDateIso(
            pickCell(row, table.normHeaderMap, usedCols, [
              'duedate',
              'expectedduedate',
              'estimatedduedate',
            ])
          );

          const effectiveBredIso =
            bredDateIso ||
            (actualBirthIso ? addDaysIso(actualBirthIso, -spProfile.gestationDays) : todayDateIso());
          const effectiveDueIso =
            dueDateRaw || addDaysIso(effectiveBredIso, spProfile.gestationDays);

          const liveCount =
            Number(
              pickCell(row, table.normHeaderMap, usedCols, [
                'livecount',
                'bornalive',
                'liveborn',
                'live',
                'offspringcount',
                'kidcount',
                'lambcount',
                'kitcount',
              ])
            ) || 0;
          const stillbornCount =
            Number(
              pickCell(row, table.normHeaderMap, usedCols, [
                'stillborncount',
                'stillborn',
                'borndead',
                'dead',
              ])
            ) || 0;
          const weanedCount =
            Number(pickCell(row, table.normHeaderMap, usedCols, ['weanedcount', 'weaned'])) || 0;

          const rawStatus = pickCell(row, table.normHeaderMap, usedCols, [
            'status',
            'outcome',
            'result',
            'pregnancycheck',
          ]).toLowerCase();

          let bStatus: BreedingStatus = 'Bred';
          if (weanedCount > 0 || /wean/.test(rawStatus)) bStatus = 'Weaned';
          else if (actualBirthIso || liveCount > 0 || /born|kid|lamb|calv|kindl|deliver/.test(rawStatus))
            bStatus = 'Born';
          else if (/open|miss|fail|aborted|empty/.test(rawStatus)) bStatus = 'Missed';
          else if (/preg|confirm|positive/.test(rawStatus)) bStatus = 'Palpated Positive';
          else if (/plan/.test(rawStatus)) bStatus = 'Planned';

          const notes = pickCell(row, table.normHeaderMap, usedCols, [
            'notes',
            'note',
            'comments',
            'method',
            'breedingtype',
          ]);

          if (!matchedDam && !matchedSire && !damToken && !sireToken) return;

          const damId =
            matchedDam?.id ||
            (damToken
              ? resolveOrCreateAncestor(spName, damToken, 'Female', '', '')
              : '');
          const sireId =
            matchedSire?.id ||
            (sireToken
              ? resolveOrCreateAncestor(spName, sireToken, 'Male', '', damId)
              : '');

          breedings.push({
            id: deterministicEntityId(
              'breeding',
              spName,
              `${sireId || sireToken}-${damId || damToken}-${effectiveBredIso}-${idx}`
            ),
            species: spName,
            sireId,
            damId,
            sireName: matchedSire?.name || sireToken || 'Unknown Sire',
            damName: matchedDam?.name || damToken || 'Unknown Dam',
            bredDateIso: effectiveBredIso,
            expectedDueDateIso: effectiveDueIso,
            actualBirthDateIso: actualBirthIso,
            projectedCoiPercent: 0,
            liveCount,
            stillbornCount,
            fosteredCount: 0,
            weanedCount,
            offspringCreated: false,
            status: bStatus,
            notes,
            createdAt: ts,
            updatedAt: ts,
          });
        });
      } else if (classification === 'notes_tasks') {
        table.rows.forEach((row, idx) => {
          const rawSpecies = pickCell(row, table.normHeaderMap, usedCols, ['species', 'animaltype']);
          const animalToken = pickCell(row, table.normHeaderMap, usedCols, [
            'animalid',
            'animal',
            'tag',
            'primarytag',
            'name',
          ]);
          const matchedAnimal = findAnimalByAnyToken(animalToken, rawSpecies);
          const dateIso =
            normalizeFlexibleDateIso(
              pickCell(row, table.normHeaderMap, usedCols, ['duedate', 'date', 'createdat'])
            ) || todayDateIso();
          const title = pickCell(row, table.normHeaderMap, usedCols, [
            'title',
            'task',
            'subject',
            'summary',
          ]);
          const body = pickCell(row, table.normHeaderMap, usedCols, [
            'notes',
            'note',
            'comment',
            'comments',
            'description',
            'body',
          ]);

          if (matchedAnimal && (body || title)) {
            careLogs.push({
              id: deterministicEntityId(
                'note',
                matchedAnimal.species,
                `${matchedAnimal.id}-${dateIso}-${idx}`
              ),
              species: matchedAnimal.species,
              animalId: matchedAnimal.id,
              dateIso,
              type: 'Journal Note',
              title: title || 'Imported HerdBoss Note',
              weightGrams: 0,
              showLegEarned: false,
              notes: body,
              createdAt: ts,
              updatedAt: ts,
            });
          } else if (title || body) {
            const sp = ensureSpecies(rawSpecies, table.baseName);
            const completedRaw = pickCell(row, table.normHeaderMap, usedCols, [
              'completed',
              'done',
              'status',
            ]).toLowerCase();
            tasks.push({
              id: deterministicEntityId('task', sp.name, `${title || body}-${dateIso}-${idx}`),
              species: sp.name,
              title: title || body.slice(0, 80),
              category: 'Other',
              priority: 'Normal',
              dueDateIso: dateIso,
              linkedAnimalId: '',
              linkedAnimalName: '',
              linkedBreedingId: '',
              completed: completedRaw === 'true' || completedRaw === '1' || completedRaw === 'done',
              createdAt: ts,
              updatedAt: ts,
            });
          }
        });
      } else if (classification === 'shows') {
        table.rows.forEach((row, idx) => {
          const rawSpecies = pickCell(row, table.normHeaderMap, usedCols, ['species', 'animaltype']);
          const sp = ensureSpecies(rawSpecies, table.baseName);
          const showName =
            pickCell(row, table.normHeaderMap, usedCols, ['showname', 'name', 'event', 'fair']) ||
            'Imported Show';
          const eventDateIso =
            normalizeFlexibleDateIso(
              pickCell(row, table.normHeaderMap, usedCols, ['showdate', 'eventdate', 'date'])
            ) || todayDateIso();
          const location = pickCell(row, table.normHeaderMap, usedCols, ['location', 'city', 'venue']);
          const notes = pickCell(row, table.normHeaderMap, usedCols, [
            'placing',
            'award',
            'judge',
            'notes',
          ]);
          shows.push({
            id: deterministicEntityId('show', sp.name, `${showName}-${eventDateIso}-${idx}`),
            species: sp.name,
            name: showName,
            location,
            sanctioningBody: 'Imported',
            eventDateIso,
            entryDeadlineIso: '',
            enteredAnimalIds: [],
            notes,
            createdAt: ts,
            updatedAt: ts,
          });
        });
      } else if (classification === 'media_manifest') {
        table.rows.forEach((row, idx) => {
          deferredManifestRowCount++;
          const rawSpecies = pickCell(row, table.normHeaderMap, usedCols, ['species', 'animaltype']);
          const animalToken = pickCell(row, table.normHeaderMap, usedCols, [
            'animalid',
            'animal',
            'tag',
            'primarytag',
            'visualtag',
            'eartag',
            'tattoo',
            'name',
            'animalname',
            'recordid',
          ]);
          const fileLabel = pickCell(row, table.normHeaderMap, usedCols, [
            'filename',
            'filepath',
            'photofile',
            'imagefile',
            'file',
            'path',
            'photo',
            'image',
            'photourl',
            'imageurl',
            'url',
            'title',
          ]);
          const caption = pickCell(row, table.normHeaderMap, usedCols, [
            'caption',
            'notes',
            'note',
            'description',
          ]);
          const primaryRaw = pickCell(row, table.normHeaderMap, usedCols, [
            'isprimary',
            'primary',
            'default',
            'cover',
          ]).toLowerCase();
          const preferPrimary =
            primaryRaw === 'true' || primaryRaw === '1' || primaryRaw === 'yes';

          // Mark remaining metadata columns as recognized so QA unmapped list stays clean
          pickCell(row, table.normHeaderMap, usedCols, [
            'id',
            'photoid',
            'imageid',
            'sortorder',
            'position',
            'mimetype',
            'contenttype',
            'filesize',
            'createdat',
            'date',
          ]);

          const matchedAnimal = findAnimalByAnyToken(animalToken, rawSpecies);
          if (matchedAnimal) {
            const matchedEntry = fileLabel
              ? resolveImageEntry(fileLabel, [animalToken, matchedAnimal.tattoo, matchedAnimal.name])
              : undefined;
            if (matchedEntry) {
              queueBinaryImageForAnimal(matchedAnimal.id, matchedEntry, caption, preferPrimary);
            } else {
              missingPhotoZipRefsCount++;
              recordDeferredImageForAnimal(matchedAnimal.id, fileLabel || `photo-${idx + 1}`);
            }
          }
        });
      }
    }

    // Resolve inline photo columns collected during Pass 1
    for (const inlineRef of inlinePhotoRefs) {
      const matchedEntry = resolveImageEntry(inlineRef.rawPhotoRef, inlineRef.tokens);
      if (matchedEntry) {
        queueBinaryImageForAnimal(
          inlineRef.animalId,
          matchedEntry,
          '',
          inlineRef.preferPrimary
        );
      } else {
        missingPhotoZipRefsCount++;
        recordDeferredImageForAnimal(inlineRef.animalId, inlineRef.rawPhotoRef);
      }
    }

    // Match any remaining binary ZIP image entries (e.g. `photos/1042/side.jpg` or `OR-101_2.jpg`)
    // directly to animals so multi-image folders/prefixes import even without a CSV manifest.
    for (const imgEntry of imageArchiveEntries) {
      const entryKey = `${imgEntry.archiveName}::${imgEntry.entryPath}`;
      if (claimedImagePaths.has(entryKey)) continue;

      const segments = imgEntry.entryPath.replace(/\\/g, '/').split('/').filter(Boolean);
      let matched: Animal | undefined;

      // 1. Check parent folder names (`photos/<animalId>/img1.jpg`)
      for (let i = segments.length - 2; i >= 0; i--) {
        const folderToken = segments[i];
        if (
          folderToken &&
          !/^(?:photo|photos|image|images|media|attachment|attachments|files|export|animals|herd)$/i.test(
            folderToken
          )
        ) {
          matched = findAnimalByAnyToken(folderToken);
          if (matched) break;
        }
      }

      // 2. Check filename stem or prefix before `_` / `-` sequence index (`OR-101_2.jpg`, `OR-101-front.jpg`)
      if (!matched) {
        const stem = imgEntry.baseName.replace(/\.[^.]+$/, '');
        matched = findAnimalByAnyToken(stem);
        if (!matched) {
          const strippedIndex = stem.replace(
            /[_\-\s]+(?:\d+|front|side|rear|left|right|head|profile|ear|tattoo)$/i,
            ''
          );
          if (strippedIndex && strippedIndex !== stem) {
            matched = findAnimalByAnyToken(strippedIndex);
          }
        }
      }

      if (matched) {
        queueBinaryImageForAnimal(matched.id, imgEntry, '', false);
      } else {
        // Unmatched orphan image in ZIP
        deferredMediaCount++;
        deferredMediaBytes += imgEntry.sizeBytes;
        if (deferredMediaSampleNames.length < 6) {
          deferredMediaSampleNames.push(imgEntry.entryPath);
        }
      }
    }

    // Materialize `stagedPhotos` ordered per animal with deterministic IDs
    const stagedPhotos: StagedImportedPhoto[] = [];
    let stagedPhotosRawBytes = 0;
    const existingPhotosList = existingSnapshot.animalPhotos ?? [];

    for (const [animalId, queuedList] of queuedImagesByAnimal.entries()) {
      const ownerAnimal =
        animalsById.get(animalId) || existingSnapshot.animals.find((a) => a.id === animalId);
      if (!ownerAnimal || queuedList.length === 0) continue;

      const existingForAnimal = existingPhotosList.filter((p) => p.animalId === ownerAnimal.id);
      const alreadyHasPrimary = existingForAnimal.some((p) => p.isPrimary);

      const ordered = [...queuedList].sort((a, b) => {
        if (a.preferPrimary !== b.preferPrimary) return a.preferPrimary ? -1 : 1;
        return 0;
      });

      ordered.forEach((q, idx) => {
        if (!q.entry.imageBytes) return;
        const photoId = deterministicEntityId(
          'photo',
          ownerAnimal.species,
          `${ownerAnimal.id}-${idx}-${q.entry.baseName}`
        );
        const existingSamePhoto = existingForAnimal.find((p) => p.id === photoId);
        stagedPhotosRawBytes += q.entry.sizeBytes;
        stagedPhotos.push({
          id: photoId,
          species: ownerAnimal.species,
          animalId: ownerAnimal.id,
          animalName: ownerAnimal.name,
          isPrimary: existingSamePhoto
            ? existingSamePhoto.isPrimary
            : !alreadyHasPrimary && idx === 0,
          sortOrder: existingSamePhoto ? existingSamePhoto.sortOrder : existingForAnimal.length + idx,
          caption: q.caption,
          originalFileName: q.entry.baseName,
          entryPath: q.entry.entryPath,
          mimeHint: q.entry.mimeHint || 'image/jpeg',
          bytes: q.entry.imageBytes,
        });
      });
    }

    let animalsWithMultipleImagesCount = 0;
    for (const [animalId, imgSet] of perAnimalImages.entries()) {
      if (imgSet.size >= 2) {
        animalsWithMultipleImagesCount++;
      }
      if (options.appendDeferredImageFilenamesToNotes && imgSet.size > 0) {
        const target = animalsById.get(animalId);
        if (target) {
          const allNames = Array.from(imgSet);
          const shown = allNames.slice(0, 5).join(', ');
          const overflow = allNames.length > 5 ? ` (+${allNames.length - 5} more)` : '';
          const noteSuffix = `Original HerdBoss photo files (${allNames.length}): ${shown}${overflow}`;
          target.notes = target.notes ? `${target.notes} · ${noteSuffix}` : noteSuffix;
        }
      }
    }

    // Build preexisting animal contradiction items now that all Sire/Dam, Weight, and Note fields are resolved!
    const allKnownAnimalsById = new Map<string, Animal>();
    for (const ex of existingSnapshot.animals) {
      allKnownAnimalsById.set(ex.id, ex);
    }
    for (const inc of animalsById.values()) {
      if (!allKnownAnimalsById.has(inc.id)) {
        allKnownAnimalsById.set(inc.id, inc);
      }
    }

    const conflicts: AnimalImportConflict[] = [];
    for (const [animalId, match] of matchedExistingByAnimalId.entries()) {
      const incomingAnimal = animalsById.get(animalId);
      if (!incomingAnimal) continue;
      const contradictions = buildAnimalContradictions(match.animal, incomingAnimal, {
        preferredUnit: existingSnapshot.settings.preferredUnit,
        speciesProfiles: workingSpeciesProfiles,
        allKnownAnimalsById,
      });
      if (contradictions.length > 0) {
        conflicts.push({
          animalId,
          species: match.animal.species,
          displayName: match.animal.name || incomingAnimal.name,
          displayTag: match.animal.tattoo || incomingAnimal.tattoo,
          matchedBy: match.matchedBy,
          existingAnimal: match.animal,
          incomingAnimal,
          contradictions,
        });
      }
    }

    // Build table diagnostics & QA schema report (privacy-safe: filenames, row counts, and column headers only!)
    for (const { table, classification, usedCols } of classifiedTables) {
      const matchedColumns = table.headers.filter((h) => usedCols.has(h));
      const unmappedColumns = table.headers.filter((h) => !usedCols.has(h));
      diagnostics.push({
        archiveName: table.archiveName,
        entryPath: table.entryPath,
        classification,
        rowCount: table.rows.length,
        headers: table.headers,
        matchedColumns,
        unmappedColumns,
      });
    }

    if (animalsById.size === 0 && breedings.length === 0 && careLogs.length === 0 && stagedPhotos.length === 0) {
      if (deferredMediaSampleNames.some((n) => /\.(?:xlsx?|docx?|pdf|sqlite3?|db)$/i.test(n))) {
        warnings.push(
          'Detected binary spreadsheet, document, or database files (.xlsx, .xls, .pdf, .docx, or .sqlite) with no CSV/JSON animal tables. Export your herd as CSV/UTF-8 CSV or switch to the "Universal Pedigree / Evans .HTM / Spreadsheets" importer.'
        );
      } else if (imageArchiveEntries.length > 0 || deferredMediaCount > 0 || deferredManifestRowCount > 0) {
        warnings.push(
          `Found ${imageArchiveEntries.length + deferredMediaCount} photo/media files in the staged archive(s), but the animal CSV spreadsheet hasn't been staged yet. Click "+ Add Companion .ZIP" above to add the HerdBoss data .ZIP so photos can link to each animal!`
        );
      } else {
        warnings.push(
          'No animal, breeding, or care rows matched yet. Expand "Inspect ZIP Manifest & Columns" below and copy the schema report if your HerdBoss export uses custom filenames or try "Universal Pedigree / Evans .HTM / Spreadsheets".'
        );
      }
    } else if (missingPhotoZipRefsCount > 0 && imageArchiveEntries.length === 0) {
      warnings.push(
        `Detected ${missingPhotoZipRefsCount} animal photo reference(s) in your CSV data, but no image files are staged yet. Add the companion HerdBoss Photos .ZIP above if you'd like to import & optimize those photos automatically.`
      );
    }

    const reportLines: string[] = [
      `Importer: ${this.name}`,
      `Archives (${archiveNames.length}): ${archiveNames.join(', ')}`,
      `Preexisting Barn Animals Matched: ${matchedExistingByAnimalId.size} (${conflicts.length} with data contradictions)`,
      `Matched Animal Photos Staged for Optimization: ${stagedPhotos.length} (${stagedPhotosRawBytes} raw bytes)`,
      `Animals With Detected Photos: ${perAnimalImages.size} (${animalsWithMultipleImagesCount} with 2+ photos)`,
      `Missing Companion Photo ZIP References: ${missingPhotoZipRefsCount}`,
      `Unmatched/Non-Image Media Skipped: ${deferredMediaCount} (${deferredMediaBytes} bytes)`,
      `Tables Detected (${diagnostics.length}):`,
      ...diagnostics.map(
        (d) =>
          `- [${d.classification}] ${d.archiveName} :: ${d.entryPath} (${d.rowCount} rows)\n  Headers: ${d.headers.join(', ')}${
            d.unmappedColumns.length > 0 ? `\n  Unmapped: ${d.unmappedColumns.join(', ')}` : ''
          }`
      ),
    ];

    return {
      platformId: this.id,
      platformName: this.name,
      archiveNames,
      diagnostics,
      stagedPhotos,
      stagedPhotosRawBytes,
      missingPhotoZipRefsCount,
      deferredMediaCount,
      deferredMediaBytes,
      deferredMediaSampleNames,
      deferredManifestRowCount,
      animalsWithMultipleImagesCount,
      warnings,
      speciesDetected: Array.from(speciesDetectedSet),
      newSpeciesProfiles,
      animals: Array.from(animalsById.values()),
      matchedExistingAnimalsCount: matchedExistingByAnimalId.size,
      conflicts,
      parentLinksResolved,
      placeholderAncestorsCreated,
      cages: Array.from(cagesByKey.values()),
      breedings,
      tasks,
      careLogs,
      shows,
      schemaDiagnosticReport: reportLines.join('\n'),
    };
  },
};
```

## `src/core/importers/importerTypes.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Modular External Platform Importer Interfaces (`src/core/importers/importerTypes.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`, `File`, `Blob`) dependencies.
 * Accepts raw `Uint8Array` archive buffers so the exact same importer modules run in Web/PWA
 * and React Native / Expo (`expo-document-picker` + `expo-file-system`).
 */

import {
  Animal,
  BarnDatabaseSnapshot,
  BarnTask,
  BreedingRecord,
  CageLocation,
  CareLog,
  ShowEvent,
  SpeciesProfile,
} from '../models';
import type { AnimalImportConflict } from './conflictResolver';

export interface RawArchiveInput {
  fileName: string;
  bytes: Uint8Array;
}

export interface VirtualArchiveEntry {
  archiveName: string;
  entryPath: string;
  baseName: string;
  extension: string;
  sizeBytes: number;
  textContent?: string;
  imageBytes?: Uint8Array;
  mimeHint?: string;
  isMediaOrBinary: boolean;
}

export interface StagedImportedPhoto {
  id: string;
  species: string;
  animalId: string;
  animalName: string;
  isPrimary: boolean;
  sortOrder: number;
  caption: string;
  originalFileName: string;
  entryPath: string;
  mimeHint: string;
  bytes: Uint8Array;
}

export type ImportedTableClassification =
  | 'animals'
  | 'pedigree_links'
  | 'breedings'
  | 'weights'
  | 'treatments_care'
  | 'notes_tasks'
  | 'cages_groups'
  | 'shows'
  | 'media_manifest'
  | 'media_deferred'
  | 'metadata_other';

export interface DetectedTableDiagnostic {
  archiveName: string;
  entryPath: string;
  classification: ImportedTableClassification;
  rowCount: number;
  headers: string[];
  matchedColumns: string[];
  unmappedColumns: string[];
}

export interface CustomSpeciesImportOverride {
  gestationDays?: number;
  weanDaysAfterBirth?: number;
  rebreedDaysAfterBirth?: number;
  maleLabel?: string;
  femaleLabel?: string;
  offspringLabel?: string;
  birthEventLabel?: string;
}

export type CsvTargetFieldKey =
  | 'name'
  | 'tattoo'
  | 'species'
  | 'sex'
  | 'birthDateIso'
  | 'breed'
  | 'variety'
  | 'weight'
  | 'weightUnit'
  | 'sire'
  | 'dam'
  | 'pgs'
  | 'pgd'
  | 'mgs'
  | 'mgd'
  | 'sss'
  | 'ssd'
  | 'sds'
  | 'sdd'
  | 'dss'
  | 'dsd'
  | 'dds'
  | 'ddd'
  | 'registrationNumber'
  | 'grandChampionNumber'
  | 'legsCount'
  | 'genotypeRaw'
  | 'status'
  | 'cageLocation'
  | 'breederName'
  | 'ownerName'
  | 'notes';

export type CsvColumnMappingSelection = CsvTargetFieldKey | '__ignore__';

export interface CsvColumnPreviewItem {
  header: string;
  normalizedKey: string;
  assignedField: CsvTargetFieldKey | '';
  autoMatchedField: CsvTargetFieldKey | '';
  isUserOverride: boolean;
  sampleValues: string[];
}

export interface CsvTableMappingSummary {
  archiveName: string;
  entryPath: string;
  rowCount: number;
  columns: CsvColumnPreviewItem[];
}

export interface UnresolvedParentLink {
  entryPath: string;
  rowNumber: number;
  childAnimalId: string;
  childName: string;
  childTattoo: string;
  species: string;
  role: 'sire' | 'dam';
  rawReference: string;
  placeholderCreated: boolean;
  placeholderAnimalId?: string;
}

export interface ImporterRunOptions {
  /**
   * Used when an external platform exports single-species CSVs that omit an explicit `Species` column.
   */
  fallbackSpeciesName: string;
  /**
   * Optional user-customized schedule overrides for non-predefined species brought in during import,
   * keyed by lowercase species name.
   */
  customSpeciesOverrides?: Record<string, CustomSpeciesImportOverride>;
  /**
   * Optional plain-text breadcrumb: when true, appends detected photo filenames to `animal.notes`
   * without storing binary images or adding photo schema fields.
   */
  appendDeferredImageFilenamesToNotes?: boolean;
  /**
   * Optional interactive spreadsheet column mapping overrides keyed by `${entryPath}::${header}`
   * or `${header}`. Set value to `'__ignore__'` to explicitly leave an auto-matched column unmapped.
   */
  csvColumnMapping?: Record<string, CsvColumnMappingSelection>;
  /**
   * When true (default), unresolved Gen 1 Sire/Dam links in non-HerdBoss CSVs synthesize a
   * placeholder ancestor animal record; when false, those parent IDs remain unlinked.
   */
  createPlaceholderAncestorsForUnlinked?: boolean;
}

export interface PlatformImportPreview {
  platformId: string;
  platformName: string;
  archiveNames: string[];
  diagnostics: DetectedTableDiagnostic[];
  stagedPhotos: StagedImportedPhoto[];
  stagedPhotosRawBytes: number;
  missingPhotoZipRefsCount: number;
  deferredMediaCount: number;
  deferredMediaBytes: number;
  deferredMediaSampleNames: string[];
  deferredManifestRowCount: number;
  animalsWithMultipleImagesCount: number;
  warnings: string[];
  speciesDetected: string[];
  newSpeciesProfiles: SpeciesProfile[];
  animals: Animal[];
  matchedExistingAnimalsCount: number;
  conflicts: AnimalImportConflict[];
  parentLinksResolved: number;
  placeholderAncestorsCreated: number;
  cages: CageLocation[];
  breedings: BreedingRecord[];
  tasks: BarnTask[];
  careLogs: CareLog[];
  shows: ShowEvent[];
  /**
   * Per-table CSV/TSV column mapping breakdown (headers, matched vs unmapped, sample values)
   * for interactive spreadsheet column mapping previews.
   */
  csvTables?: CsvTableMappingSummary[];
  /**
   * Pre-import highlight list of Gen 1 Sire/Dam references on non-HerdBoss CSV imports
   * that did not match any animal row in the spreadsheet or preexisting barn herd.
   */
  unresolvedParentLinks?: UnresolvedParentLink[];
  /**
   * Privacy-safe manifest of filenames, row counts, and column headers (zero breeder PII)
   * so Kimberly can inspect or share exact export structure for QA tuning.
   */
  schemaDiagnosticReport: string;
}

export interface PlatformImporter {
  readonly id: string;
  readonly name: string;
  readonly badge: string;
  readonly supportsMultiZip: boolean;
  readonly acceptedExtensions: string[];
  readonly summary: string;
  readonly instructions: string;
  parse(
    inputs: RawArchiveInput[],
    existingSnapshot: BarnDatabaseSnapshot,
    options: ImporterRunOptions
  ): PlatformImportPreview;
}
```

## `src/core/importers/pdfScanExtractor.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Offline PDF Scan & Vector Pedigree Extractor
 * (`src/core/importers/pdfScanExtractor.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript + `fflate` with zero browser DOM (`window`, `document`) dependencies.
 *
 * Supports two common paper-pedigree PDF workflows 100% offline:
 * 1. Searchable / Digital PDFs (e.g., Evans "Print to PDF", Community Pedigree PDF exports):
 *    Decompresses `/FlateDecode` content streams and extracts `BT ... ET` text operators
 *    with normalized top-down `(x0, y0, x1, y1)` coordinates for 2D tree layout parsing.
 * 2. Scanned Image PDFs (scanner apps, printer "Scan to PDF", phone PDF scanners):
 *    Extracts embedded `/DCTDecode` JPEG page images (`FF D8 ... FF D9`) so the browser
 *    OCR pipeline (`TextDetector` / `Tesseract.js`) can read them offline.
 */

import { inflateSync, unzlibSync } from 'fflate';
import { sanitizePlainText } from '../inputSanitization';

export const MAX_PDF_SCAN_BYTES = 40 * 1024 * 1024; // 40 MB PDF cap for mobile RAM
export const MAX_PDF_SCAN_PAGES = 6;
const MAX_PDF_STREAM_UNCOMPRESSED_BYTES = 8 * 1024 * 1024;

export interface PdfExtractedTextWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PdfExtractedPage {
  pageIndex: number;
  kind: 'vector_text' | 'raster_jpeg';
  width: number;
  height: number;
  rawText?: string;
  words?: PdfExtractedTextWord[];
  jpegBytes?: Uint8Array;
}

export interface PdfExtractionResult {
  ok: boolean;
  pages: PdfExtractedPage[];
  isEncrypted: boolean;
  warnings: string[];
  errorMessage?: string;
}

function bytesToLatin1(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let out = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + CHUNK));
    out += String.fromCharCode(...slice);
  }
  return out;
}

function latin1ToBytes(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    out[i] = str.charCodeAt(i) & 0xff;
  }
  return out;
}

function tryDecompressFlate(rawStream: Uint8Array): Uint8Array | null {
  if (rawStream.byteLength === 0 || rawStream.byteLength > MAX_PDF_STREAM_UNCOMPRESSED_BYTES) {
    return null;
  }
  try {
    const out = unzlibSync(rawStream);
    if (out.byteLength <= MAX_PDF_STREAM_UNCOMPRESSED_BYTES) return out;
    return null;
  } catch {
    try {
      const out = inflateSync(rawStream);
      if (out.byteLength <= MAX_PDF_STREAM_UNCOMPRESSED_BYTES) return out;
      return null;
    } catch {
      return null;
    }
  }
}

function unescapePdfLiteralString(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    i++;
    if (i >= raw.length) break;
    const esc = raw[i];
    if (esc === 'n') out += '\n';
    else if (esc === 'r') out += '\r';
    else if (esc === 't') out += '\t';
    else if (esc === 'b') out += '\b';
    else if (esc === 'f') out += '\f';
    else if (esc === '(' || esc === ')' || esc === '\\') out += esc;
    else if (esc === '\r') {
      if (raw[i + 1] === '\n') i++;
    } else if (esc === '\n') {
      // Line continuation
    } else if (esc >= '0' && esc <= '7') {
      let oct = esc;
      for (let k = 0; k < 2 && i + 1 < raw.length; k++) {
        const next = raw[i + 1];
        if (next >= '0' && next <= '7') {
          oct += next;
          i++;
        } else {
          break;
        }
      }
      const code = parseInt(oct, 8);
      if (Number.isFinite(code) && code >= 32) {
        out += String.fromCharCode(code);
      }
    } else {
      out += esc;
    }
  }
  return out;
}

function decodePdfHexString(hexRaw: string): string {
  const clean = hexRaw.replace(/[^0-9a-fA-F]/g, '');
  if (!clean) return '';
  const padded = clean.length % 2 === 1 ? `${clean}0` : clean;
  const bytes = new Uint8Array(padded.length / 2);
  for (let i = 0; i < padded.length; i += 2) {
    bytes[i / 2] = parseInt(padded.slice(i, i + 2), 16) & 0xff;
  }
  // UTF-16BE BOM: FE FF
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1];
      if (code >= 32) text += String.fromCharCode(code);
    }
    return text;
  }
  let ascii = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 32 && b !== 127) ascii += String.fromCharCode(b);
  }
  return ascii;
}

interface RawTextPlacement {
  text: string;
  x: number;
  yPdf: number;
  fontSize: number;
}

function extractTextPlacementsFromContentStream(streamText: string): RawTextPlacement[] {
  const placements: RawTextPlacement[] = [];
  const btRegex = /\bBT\b([\s\S]*?)\bET\b/g;
  let btMatch: RegExpExecArray | null;

  while ((btMatch = btRegex.exec(streamText)) !== null) {
    const block = btMatch[1];
    let x = 0;
    let y = 0;
    let leading = 12;
    let fontSize = 10;

    // Scan tokens inside BT ... ET in order
    let i = 0;
    const numStack: number[] = [];
    const strStack: string[] = [];

    const readLiteral = (): string => {
      i++; // skip '('
      let depth = 1;
      let buf = '';
      while (i < block.length && depth > 0) {
        const c = block[i];
        if (c === '\\') {
          buf += c;
          if (i + 1 < block.length) {
            buf += block[i + 1];
            i += 2;
          } else {
            i++;
          }
          continue;
        }
        if (c === '(') {
          depth++;
          buf += c;
        } else if (c === ')') {
          depth--;
          if (depth > 0) buf += c;
        } else {
          buf += c;
        }
        i++;
      }
      return unescapePdfLiteralString(buf);
    };

    const readHex = (): string => {
      i++; // skip '<'
      let buf = '';
      while (i < block.length && block[i] !== '>') {
        buf += block[i];
        i++;
      }
      if (block[i] === '>') i++;
      return decodePdfHexString(buf);
    };

    const pushText = (txt: string) => {
      const cleaned = sanitizePlainText(txt, 500).replace(/\s+/g, ' ').trim();
      if (!cleaned) return;
      placements.push({
        text: cleaned,
        x,
        yPdf: y,
        fontSize: Math.max(6, Math.min(48, fontSize)),
      });
    };

    while (i < block.length) {
      const ch = block[i];

      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (ch === '%') {
        while (i < block.length && block[i] !== '\n' && block[i] !== '\r') i++;
        continue;
      }
      if (ch === '(') {
        strStack.push(readLiteral());
        continue;
      }
      if (ch === '<') {
        if (block[i + 1] === '<') {
          i += 2;
          continue;
        }
        strStack.push(readHex());
        continue;
      }
      if (ch === '[') {
        i++;
        let combined = '';
        while (i < block.length && block[i] !== ']') {
          if (block[i] === '(') {
            combined += readLiteral();
          } else if (block[i] === '<') {
            combined += readHex();
          } else if (block[i] === '-' || (block[i] >= '0' && block[i] <= '9')) {
            let numStr = '';
            while (i < block.length && /[0-9.+-]/.test(block[i])) {
              numStr += block[i];
              i++;
            }
            const kerning = Number(numStr);
            if (Number.isFinite(kerning) && kerning < -180 && combined && !combined.endsWith(' ')) {
              combined += ' ';
            }
          } else {
            i++;
          }
        }
        if (block[i] === ']') i++;
        strStack.push(combined);
        continue;
      }

      if (ch === '/' || ch === '>' || ch === ']') {
        i++;
        while (i < block.length && !/[\s()<>[\]{}/%]/.test(block[i])) i++;
        continue;
      }

      if (ch === '-' || ch === '+' || ch === '.' || (ch >= '0' && ch <= '9')) {
        let numTok = '';
        while (i < block.length && /[0-9.+-]/.test(block[i])) {
          numTok += block[i];
          i++;
        }
        const n = Number(numTok);
        if (Number.isFinite(n)) {
          numStack.push(n);
        }
        continue;
      }

      // Operator word
      let op = '';
      while (i < block.length && !/[\s()<>[\]{}/%]/.test(block[i])) {
        op += block[i];
        i++;
      }

      if (op === 'Tf') {
        if (numStack.length >= 1) {
          fontSize = Math.abs(numStack[numStack.length - 1]) || 10;
        }
        numStack.length = 0;
      } else if (op === 'Tm') {
        if (numStack.length >= 6) {
          x = numStack[numStack.length - 2];
          y = numStack[numStack.length - 1];
        }
        numStack.length = 0;
      } else if (op === 'Td') {
        if (numStack.length >= 2) {
          x += numStack[numStack.length - 2];
          y += numStack[numStack.length - 1];
        }
        numStack.length = 0;
      } else if (op === 'TD') {
        if (numStack.length >= 2) {
          const tx = numStack[numStack.length - 2];
          const ty = numStack[numStack.length - 1];
          leading = -ty;
          x += tx;
          y += ty;
        }
        numStack.length = 0;
      } else if (op === 'TL') {
        if (numStack.length >= 1) leading = numStack[numStack.length - 1];
        numStack.length = 0;
      } else if (op === 'T*') {
        y -= leading;
        numStack.length = 0;
      } else if (op === 'Tj' || op === 'TJ') {
        const txt = strStack.pop();
        if (txt) pushText(txt);
        strStack.length = 0;
      } else if (op === "'") {
        y -= leading;
        const txt = strStack.pop();
        if (txt) pushText(txt);
        strStack.length = 0;
      } else if (op === '"') {
        y -= leading;
        const txt = strStack.pop();
        if (txt) pushText(txt);
        strStack.length = 0;
        numStack.length = 0;
      } else {
        numStack.length = 0;
        strStack.length = 0;
      }
    }
  }

  return placements;
}

interface ParsedPdfObjectStream {
  objId: number;
  dictText: string;
  rawStreamBytes: Uint8Array;
}

function parsePdfObjectsAndMediaBoxes(latin1: string): {
  streams: ParsedPdfObjectStream[];
  objectDictsById: Map<number, string>;
  pageBounds: Array<{ width: number; height: number; contentObjIds: number[] }>;
  isEncrypted: boolean;
} {
  const isEncrypted = /\/Encrypt\b/.test(latin1.slice(0, Math.min(latin1.length, 200_000)));
  const objectDictsById = new Map<number, string>();
  const streams: ParsedPdfObjectStream[] = [];
  const pageBounds: Array<{ width: number; height: number; contentObjIds: number[] }> = [];

  const objRegex = /(?:^|\r|\n)\s*(\d+)\s+\d+\s+obj\b/g;
  let objMatch: RegExpExecArray | null;

  while ((objMatch = objRegex.exec(latin1)) !== null) {
    const objId = Number(objMatch[1]);
    const bodyStart = objMatch.index + objMatch[0].length;
    const endObjIdx = latin1.indexOf('endobj', bodyStart);
    if (endObjIdx < 0) continue;

    const body = latin1.slice(bodyStart, endObjIdx);
    const streamKwIdx = body.search(/>>\s*stream\r?\n/);

    if (streamKwIdx >= 0) {
      const dictText = body.slice(0, streamKwIdx + 2);
      objectDictsById.set(objId, dictText);

      const streamMarkerMatch = />>\s*stream\r?\n/.exec(body.slice(streamKwIdx));
      if (streamMarkerMatch) {
        const dataStart = streamKwIdx + streamMarkerMatch[0].length;
        let dataEnd = body.lastIndexOf('endstream');
        if (dataEnd > dataStart) {
          if (body[dataEnd - 1] === '\n') dataEnd--;
          if (body[dataEnd - 1] === '\r') dataEnd--;
          streams.push({
            objId,
            dictText,
            rawStreamBytes: latin1ToBytes(body.slice(dataStart, dataEnd)),
          });
        }
      }
    } else {
      objectDictsById.set(objId, body);
      if (/\/Type\s*\/Page\b(?!s)/.test(body)) {
        let width = 792;
        let height = 612;
        const mbMatch = /\/MediaBox\s*\[\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\]/.exec(
          body
        );
        if (mbMatch) {
          const w = Math.abs(Number(mbMatch[3]) - Number(mbMatch[1]));
          const h = Math.abs(Number(mbMatch[4]) - Number(mbMatch[2]));
          if (Number.isFinite(w) && w > 50 && Number.isFinite(h) && h > 50) {
            width = w;
            height = h;
          }
        }
        const contentObjIds: number[] = [];
        const arrMatch = /\/Contents\s*\[([^\]]+)\]/.exec(body);
        if (arrMatch) {
          const refRe = /(\d+)\s+\d+\s+R/g;
          let rMatch: RegExpExecArray | null;
          while ((rMatch = refRe.exec(arrMatch[1])) !== null) {
            contentObjIds.push(Number(rMatch[1]));
          }
        } else {
          const singleMatch = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(body);
          if (singleMatch) {
            contentObjIds.push(Number(singleMatch[1]));
          }
        }
        pageBounds.push({ width, height, contentObjIds });
      }
    }

    objRegex.lastIndex = endObjIdx + 6;
  }

  return { streams, objectDictsById, pageBounds, isEncrypted };
}

function buildTextPageFromPlacements(
  pageIndex: number,
  width: number,
  height: number,
  placements: RawTextPlacement[]
): PdfExtractedPage | null {
  if (placements.length === 0) return null;
  const maxY = Math.max(height, ...placements.map((p) => p.yPdf + p.fontSize + 8));
  const maxX = Math.max(width, ...placements.map((p) => p.x + p.text.length * (p.fontSize * 0.55) + 8));

  const words: PdfExtractedTextWord[] = [];
  for (const p of placements) {
    const yTop = Math.max(0, maxY - p.yPdf - p.fontSize);
    const yBot = yTop + p.fontSize * 1.15;
    const charW = Math.max(3.5, p.fontSize * 0.48);
    const parts = p.text.split(/\s+/).filter(Boolean);
    let cursorX = p.x;
    for (const part of parts) {
      const w = part.length * charW;
      words.push({
        text: part,
        x0: Math.max(0, cursorX),
        y0: yTop,
        x1: Math.max(cursorX + 4, cursorX + w),
        y1: yBot,
      });
      cursorX += w + charW;
    }
  }

  // Group into visual reading lines (top-to-bottom, left-to-right)
  const sorted = [...placements].sort((a, b) => {
    const dy = b.yPdf - a.yPdf;
    if (Math.abs(dy) > 4) return dy;
    return a.x - b.x;
  });

  const lineBuckets: RawTextPlacement[][] = [];
  for (const item of sorted) {
    const lastBucket = lineBuckets[lineBuckets.length - 1];
    if (lastBucket && Math.abs(lastBucket[0].yPdf - item.yPdf) <= 4.5) {
      lastBucket.push(item);
    } else {
      lineBuckets.push([item]);
    }
  }

  const rawText = lineBuckets
    .map((bucket) =>
      bucket
        .sort((a, b) => a.x - b.x)
        .map((b) => b.text)
        .join(' ')
    )
    .join('\n');

  return {
    pageIndex,
    kind: 'vector_text',
    width: Math.round(maxX),
    height: Math.round(maxY),
    rawText,
    words,
  };
}

function trimJpegMarkers(bytes: Uint8Array): Uint8Array | null {
  let start = -1;
  for (let i = 0; i + 1 < Math.min(bytes.length, 64); i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  let end = bytes.length;
  for (let i = bytes.length - 2; i > start + 2; i--) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) {
      end = i + 2;
      break;
    }
  }
  const sliced = bytes.subarray(start, end);
  return sliced.byteLength >= 1024 ? sliced : null;
}

/**
 * Extracts searchable vector text streams (with coordinates) and/or embedded scanned JPEG
 * page images from a PDF binary (`Uint8Array`) 100% offline.
 */
export function extractPedigreePdfPages(pdfBytes: Uint8Array): PdfExtractionResult {
  if (pdfBytes.byteLength === 0) {
    return {
      ok: false,
      pages: [],
      isEncrypted: false,
      warnings: [],
      errorMessage: 'Selected PDF file is empty (0 bytes).',
    };
  }
  if (pdfBytes.byteLength > MAX_PDF_SCAN_BYTES) {
    return {
      ok: false,
      pages: [],
      isEncrypted: false,
      warnings: [],
      errorMessage: `PDF exceeds the ${Math.round(MAX_PDF_SCAN_BYTES / (1024 * 1024))} MB mobile scan limit. Scan or export individual pages as JPG/PNG images instead.`,
    };
  }

  // Verify %PDF header within first 1024 bytes
  const headText = bytesToLatin1(pdfBytes.subarray(0, Math.min(1024, pdfBytes.byteLength)));
  if (!headText.includes('%PDF-')) {
    return {
      ok: false,
      pages: [],
      isEncrypted: false,
      warnings: [],
      errorMessage: 'File does not start with a valid %PDF header.',
    };
  }

  const latin1 = bytesToLatin1(pdfBytes);
  const { streams, pageBounds, isEncrypted } = parsePdfObjectsAndMediaBoxes(latin1);

  if (isEncrypted) {
    return {
      ok: false,
      pages: [],
      isEncrypted: true,
      warnings: [],
      errorMessage:
        'This PDF is password-protected or encrypted. Export or screenshot the pedigree page as a JPG/PNG image and scan it here.',
    };
  }

  const warnings: string[] = [];
  const streamById = new Map<number, ParsedPdfObjectStream>();
  const jpegPages: PdfExtractedPage[] = [];

  for (const st of streams) {
    streamById.set(st.objId, st);

    const isImage = /\/Subtype\s*\/Image\b/.test(st.dictText);
    const hasDct = /\/DCTDecode\b/.test(st.dictText);
    if (isImage && hasDct && jpegPages.length < MAX_PDF_SCAN_PAGES) {
      const widthMatch = /\/Width\s+(\d+)/.exec(st.dictText);
      const heightMatch = /\/Height\s+(\d+)/.exec(st.dictText);
      const w = Number(widthMatch?.[1] || 0);
      const h = Number(heightMatch?.[1] || 0);
      // Skip tiny logos/avatars (< 180px wide or < 180px tall when dimensions are present)
      const isTinyAsset = (w > 0 && w < 180) || (h > 0 && h < 180);
      if (!isTinyAsset) {
        const cleanJpeg = trimJpegMarkers(st.rawStreamBytes);
        if (cleanJpeg) {
          jpegPages.push({
            pageIndex: jpegPages.length,
            kind: 'raster_jpeg',
            width: w || 1200,
            height: h || 900,
            jpegBytes: cleanJpeg,
          });
        }
      }
    }
  }

  // Try extracting searchable vector text per page first
  const textPages: PdfExtractedPage[] = [];
  if (pageBounds.length > 0) {
    for (let pIdx = 0; pIdx < Math.min(pageBounds.length, MAX_PDF_SCAN_PAGES); pIdx++) {
      const pb = pageBounds[pIdx];
      const placements: RawTextPlacement[] = [];
      for (const contentId of pb.contentObjIds) {
        const st = streamById.get(contentId);
        if (!st) continue;
        const decodedBytes = /\/FlateDecode\b/.test(st.dictText)
          ? tryDecompressFlate(st.rawStreamBytes)
          : st.rawStreamBytes;
        if (!decodedBytes) continue;
        const contentText = bytesToLatin1(decodedBytes);
        placements.push(...extractTextPlacementsFromContentStream(contentText));
      }
      const textPage = buildTextPageFromPlacements(pIdx, pb.width, pb.height, placements);
      if (textPage && (textPage.rawText || '').length >= 24) {
        textPages.push(textPage);
      }
    }
  } else {
    // Fallback: scan non-image streams directly for BT...ET blocks
    const placements: RawTextPlacement[] = [];
    for (const st of streams) {
      if (/\/Subtype\s*\/Image\b/.test(st.dictText)) continue;
      const decodedBytes = /\/FlateDecode\b/.test(st.dictText)
        ? tryDecompressFlate(st.rawStreamBytes)
        : st.rawStreamBytes;
      if (!decodedBytes) continue;
      const contentText = bytesToLatin1(decodedBytes);
      if (contentText.includes('BT') && contentText.includes('ET')) {
        placements.push(...extractTextPlacementsFromContentStream(contentText));
      }
    }
    const textPage = buildTextPageFromPlacements(0, 792, 612, placements);
    if (textPage && (textPage.rawText || '').length >= 24) {
      textPages.push(textPage);
    }
  }

  if (pageBounds.length > MAX_PDF_SCAN_PAGES) {
    warnings.push(
      `PDF has ${pageBounds.length} pages; scanned the first ${MAX_PDF_SCAN_PAGES} pages to protect mobile memory.`
    );
  }

  // Prefer vector text pages when meaningful text exists, otherwise return embedded scanned JPEG pages
  if (textPages.length > 0) {
    return {
      ok: true,
      pages: textPages,
      isEncrypted: false,
      warnings,
    };
  }

  if (jpegPages.length > 0) {
    return {
      ok: true,
      pages: jpegPages,
      isEncrypted: false,
      warnings,
    };
  }

  return {
    ok: false,
    pages: [],
    isEncrypted: false,
    warnings,
    errorMessage:
      'No searchable text or embedded JPEG page scans were found in this PDF (it may use CCITT/JBIG2 fax compression or vector outlines). Take a screenshot or export the page as JPG/PNG and scan it here.',
  };
}
```

## `src/core/importers/pedigreeOcrParser.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Paper Pedigree OCR Parser & Import Review Queue Bridge
 * (`src/core/importers/pedigreeOcrParser.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`, `File`, `Blob`) dependencies.
 *
 * Parses raw OCR text + optional 2D word bounding boxes (from Tesseract.js, Chromium
 * `TextDetector`, or extracted searchable PDF text operators) into an editable 15-slot
 * 3-generation pedigree draft (`Subject` + `Sire`/`Dam` + `PGS`/`PGD`/`MGS`/`MGD` +
 * `SSS`..`DDD`), extracting ancestor names, ear tattoos/IDs, weights, birth dates,
 * varieties/breeds, and ARBA registration / Grand Champion numbers directly into
 * `PlatformImportPreview` for the Import Review Queue.
 */

import { parseGenotypeString } from '../geneticsEngine';
import { sanitizePlainText, sanitizeSingleLineText } from '../inputSanitization';
import {
  Animal,
  BarnDatabaseSnapshot,
  BiologicalSex,
  formatWeight,
  isSameSpecies,
  nowIsoUtc,
  PREDEFINED_SPECIES_PRESETS,
  resolveSpeciesProfile,
  SpeciesProfile,
  WeightUnit,
} from '../models';
import { normalizeFlexibleDateIso, parseFlexibleWeightToGrams } from './archiveAndCsvUtils';
import {
  AnimalImportConflict,
  buildAnimalContradictions,
  findPreexistingAnimalMatch,
  PreexistingAnimalMatch,
} from './conflictResolver';
import {
  PlatformImportPreview,
  StagedImportedPhoto,
} from './importerTypes';

export type PedigreeOcrSlotKey =
  | 'subject'
  | 'sire'
  | 'dam'
  | 'pgs'
  | 'pgd'
  | 'mgs'
  | 'mgd'
  | 'sss'
  | 'ssd'
  | 'sds'
  | 'sdd'
  | 'dss'
  | 'dsd'
  | 'dds'
  | 'ddd';

export interface PedigreeOcrSlotDescriptor {
  key: PedigreeOcrSlotKey;
  label: string;
  shortLabel: string;
  generation: 0 | 1 | 2 | 3;
  slotIndex: number;
  defaultSex: BiologicalSex;
  childKey: PedigreeOcrSlotKey | null;
  linkSide: 'sire' | 'dam' | null;
}

export const PEDIGREE_OCR_SLOT_DESCRIPTORS: readonly PedigreeOcrSlotDescriptor[] = [
  {
    key: 'subject',
    label: 'Subject Animal',
    shortLabel: 'Subject',
    generation: 0,
    slotIndex: 0,
    defaultSex: 'Unknown',
    childKey: null,
    linkSide: null,
  },
  {
    key: 'sire',
    label: 'Sire (Father · Gen 1)',
    shortLabel: 'Sire',
    generation: 1,
    slotIndex: 0,
    defaultSex: 'Male',
    childKey: 'subject',
    linkSide: 'sire',
  },
  {
    key: 'dam',
    label: 'Dam (Mother · Gen 1)',
    shortLabel: 'Dam',
    generation: 1,
    slotIndex: 1,
    defaultSex: 'Female',
    childKey: 'subject',
    linkSide: 'dam',
  },
  {
    key: 'pgs',
    label: "Paternal Grandsire (Sire's Sire · Gen 2)",
    shortLabel: 'PGS',
    generation: 2,
    slotIndex: 0,
    defaultSex: 'Male',
    childKey: 'sire',
    linkSide: 'sire',
  },
  {
    key: 'pgd',
    label: "Paternal Granddam (Sire's Dam · Gen 2)",
    shortLabel: 'PGD',
    generation: 2,
    slotIndex: 1,
    defaultSex: 'Female',
    childKey: 'sire',
    linkSide: 'dam',
  },
  {
    key: 'mgs',
    label: "Maternal Grandsire (Dam's Sire · Gen 2)",
    shortLabel: 'MGS',
    generation: 2,
    slotIndex: 2,
    defaultSex: 'Male',
    childKey: 'dam',
    linkSide: 'sire',
  },
  {
    key: 'mgd',
    label: "Maternal Granddam (Dam's Dam · Gen 2)",
    shortLabel: 'MGD',
    generation: 2,
    slotIndex: 3,
    defaultSex: 'Female',
    childKey: 'dam',
    linkSide: 'dam',
  },
  {
    key: 'sss',
    label: "Sire's Sire's Sire (Gen 3)",
    shortLabel: 'SSS',
    generation: 3,
    slotIndex: 0,
    defaultSex: 'Male',
    childKey: 'pgs',
    linkSide: 'sire',
  },
  {
    key: 'ssd',
    label: "Sire's Sire's Dam (Gen 3)",
    shortLabel: 'SSD',
    generation: 3,
    slotIndex: 1,
    defaultSex: 'Female',
    childKey: 'pgs',
    linkSide: 'dam',
  },
  {
    key: 'sds',
    label: "Sire's Dam's Sire (Gen 3)",
    shortLabel: 'SDS',
    generation: 3,
    slotIndex: 2,
    defaultSex: 'Male',
    childKey: 'pgd',
    linkSide: 'sire',
  },
  {
    key: 'sdd',
    label: "Sire's Dam's Dam (Gen 3)",
    shortLabel: 'SDD',
    generation: 3,
    slotIndex: 3,
    defaultSex: 'Female',
    childKey: 'pgd',
    linkSide: 'dam',
  },
  {
    key: 'dss',
    label: "Dam's Sire's Sire (Gen 3)",
    shortLabel: 'DSS',
    generation: 3,
    slotIndex: 4,
    defaultSex: 'Male',
    childKey: 'mgs',
    linkSide: 'sire',
  },
  {
    key: 'dsd',
    label: "Dam's Sire's Dam (Gen 3)",
    shortLabel: 'DSD',
    generation: 3,
    slotIndex: 5,
    defaultSex: 'Female',
    childKey: 'mgs',
    linkSide: 'dam',
  },
  {
    key: 'dds',
    label: "Dam's Dam's Sire (Gen 3)",
    shortLabel: 'DDS',
    generation: 3,
    slotIndex: 6,
    defaultSex: 'Male',
    childKey: 'mgd',
    linkSide: 'sire',
  },
  {
    key: 'ddd',
    label: "Dam's Dam's Dam (Gen 3)",
    shortLabel: 'DDD',
    generation: 3,
    slotIndex: 7,
    defaultSex: 'Female',
    childKey: 'mgd',
    linkSide: 'dam',
  },
];

export interface OcrWordBox {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence?: number;
}

export interface OcrScannedPageInput {
  pageIndex?: number;
  sourceFileName: string;
  rawText: string;
  imageWidth?: number;
  imageHeight?: number;
  words?: OcrWordBox[];
  confidence?: number;
  engine?: string;
}

export interface PedigreeOcrSlotDraft {
  slotKey: PedigreeOcrSlotKey;
  label: string;
  shortLabel: string;
  generation: 0 | 1 | 2 | 3;
  name: string;
  tattoo: string;
  registrationNumber: string;
  grandChampionNumber: string;
  legsCount: number;
  weightText: string;
  weightGrams: number;
  breed: string;
  variety: string;
  birthDateIso: string;
  genotypeRaw: string;
  sex: BiologicalSex;
  notes: string;
  confidence: number;
  rawSnippet: string;
  included: boolean;
}

export interface PedigreeOcrParseResult {
  slots: PedigreeOcrSlotDraft[];
  detectedSpecies: string;
  detectedBreed: string;
  sanitizedRawText: string;
  layoutMode: 'bounding_box_tree' | 'line_heuristic' | 'manual_empty';
  populatedSlotCount: number;
  warnings: string[];
}

function slugifyKey(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'
  );
}

function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(36);
}

function deterministicOcrEntityId(species: string, seed: string): string {
  return `ocr-${slugifyKey(species)}-${stableHash(seed.trim().toLowerCase())}`;
}

export function createEmptyPedigreeOcrSlots(defaultBreed = ''): PedigreeOcrSlotDraft[] {
  return PEDIGREE_OCR_SLOT_DESCRIPTORS.map((desc) => ({
    slotKey: desc.key,
    label: desc.label,
    shortLabel: desc.shortLabel,
    generation: desc.generation,
    name: '',
    tattoo: '',
    registrationNumber: '',
    grandChampionNumber: '',
    legsCount: 0,
    weightText: '',
    weightGrams: 0,
    breed: defaultBreed,
    variety: '',
    birthDateIso: '',
    genotypeRaw: '',
    sex: desc.defaultSex,
    notes: '',
    confidence: 0,
    rawSnippet: '',
    included: false,
  }));
}

function normalizeSexLoose(
  raw: string | undefined,
  fallback: BiologicalSex = 'Unknown'
): BiologicalSex {
  const s = (raw || '').trim().toLowerCase();
  if (!s) return fallback;
  if (
    /^(?:m|male|buck|ram|bull|boar|stallion|stud|rooster|cock|drake|gander|tom|billy|jack|hob|dog|sire)$/.test(
      s
    ) ||
    /\b(?:male|buck|ram|bull|boar|stallion|sire)\b/.test(s)
  ) {
    return 'Male';
  }
  if (
    /^(?:f|female|doe|ewe|cow|heifer|sow|gilt|mare|hen|duck|goose|queen|nanny|jenny|jill|bitch|dam)$/.test(
      s
    ) ||
    /\b(?:female|doe|ewe|cow|heifer|sow|mare|dam)\b/.test(s)
  ) {
    return 'Female';
  }
  return fallback;
}

function detectSpeciesFromOcrText(
  rawText: string,
  fileName: string,
  fallbackSpecies = 'Rabbit'
): string {
  const combined = `${fileName} ${rawText.slice(0, 2500)}`.toLowerCase();
  for (const preset of PREDEFINED_SPECIES_PRESETS) {
    if (combined.includes(preset.name.toLowerCase())) {
      return preset.name;
    }
  }
  if (
    /\b(?:arba|kindling|hutch|holland lop|mini rex|netherland dwarf|lionhead|new zealand|californian|flemish giant|english angora|french angora|satin)\b/.test(
      combined
    )
  ) {
    return 'Rabbit';
  }
  if (/\b(?:cavy|cavies|guinea pig|abyssinian|american cavy|peruvian|silkie|teddy)\b/.test(combined)) {
    return 'Guinea Pig';
  }
  if (/\b(?:kidding|adga|nigerian dwarf|boer|nubian|lamancha|alpine|saanen|wether)\b/.test(combined)) {
    return 'Goat';
  }
  if (/\b(?:lambing|ewe|ram|suffolk|dorper|katahdin|hampshire)\b/.test(combined)) {
    return 'Sheep';
  }
  if (/\b(?:calving|heifer|bull|steer|angus|hereford|holstein|simmental)\b/.test(combined)) {
    return 'Cattle';
  }
  if (/\b(?:farrowing|boar|sow|gilt|berkshire|duroc|yorkshire|kunekune)\b/.test(combined)) {
    return 'Swine / Pig';
  }
  return fallbackSpecies || 'Rabbit';
}

function parseOcrWeightSegment(
  raw: string,
  preferredUnit: WeightUnit = 'lbs_oz'
): { weightGrams: number; weightText: string } {
  const clean = raw.trim();
  if (!clean) return { weightGrams: 0, weightText: '' };

  // Handle ARBA lbs-oz shorthand like "4# 8oz", "4 lb 8 oz", "4 lbs. 8 oz.", "4 lb 8"
  const lbOzBare = clean.match(
    /^(\d+(?:\.\d+)?)\s*(?:#|lbs?\.?|pounds?)\s*(\d+(?:\.\d+)?)\s*(?:oz\.?|ounces?)?$/i
  );
  if (lbOzBare) {
    const lbs = Number(lbOzBare[1]);
    const oz = Number(lbOzBare[2]);
    if (Number.isFinite(lbs) && Number.isFinite(oz) && lbs >= 0 && oz >= 0 && oz < 16) {
      const grams = Math.round((lbs + oz / 16) * 453.59237);
      return { weightGrams: grams, weightText: formatWeight(grams, preferredUnit) };
    }
  }

  // Handle ARBA dot/dash notation like "4.08#" or "4-8#"
  const dotPound = clean.match(/^(\d{1,2})[-.](\d{1,2})\s*(?:#|lbs?\.?)$/i);
  if (dotPound) {
    const lbs = Number(dotPound[1]);
    const oz = Number(dotPound[2]);
    if (Number.isFinite(lbs) && Number.isFinite(oz) && oz >= 0 && oz < 16) {
      const grams = Math.round((lbs + oz / 16) * 453.59237);
      return { weightGrams: grams, weightText: formatWeight(grams, preferredUnit) };
    }
  }

  const grams = parseFlexibleWeightToGrams(clean);
  if (grams > 0) {
    return { weightGrams: grams, weightText: formatWeight(grams, preferredUnit) };
  }
  return { weightGrams: 0, weightText: '' };
}

function isUnknownPlaceholderLine(line: string): boolean {
  return /^(?:unknown|none|n\/a|na|-|—|\?|(?:buck|doe|sire|dam|ram|ewe|bull|cow|boar|sow|stallion|mare|male|female)\s*(?:-|—|:)?\s*unknown)$/i.test(
    line.trim()
  );
}

function isBoilerplatePedigreeLine(line: string): boolean {
  const s = line.trim();
  if (!s) return true;
  if (/^[_=\-|*•·.]{2,}$/.test(s)) return true;
  if (
    /^(?:pedigree(?:\s+certificate)?|certificate\s+of\s+pedigree|official\s+(?:\d+-generation\s+)?pedigree(?:\s*\(.*\))?|parents\s*(?:\(gen\s*1\))?|grandparents\s*(?:\(gen\s*2\))?|great[- ]?grandparents\s*(?:\(gen\s*3\))?|gen(?:eration)?\s*[1-8]|page\s*\d+(?:\s*of\s*\d+)?|community\s+pedigree|arba\s+pedigree|i\s+hereby\s+certify\b.*|breeder\s+signature\s*:.*|notice\s*:\s*color\s+genetics\b.*|printed\s+\d{4}.*|wright\s+coi\s*:.*)$/i.test(
      s
    )
  ) {
    return true;
  }
  return false;
}

const ROLE_PREFIX_REGEX =
  /^(?:subject(?:\s+animal)?|animal|sire'?s\s+sire'?s\s+sire|sire'?s\s+sire'?s\s+dam|sire'?s\s+dam'?s\s+sire|sire'?s\s+dam'?s\s+dam|dam'?s\s+sire'?s\s+sire|dam'?s\s+sire'?s\s+dam|dam'?s\s+dam'?s\s+sire|dam'?s\s+dam'?s\s+dam|sire'?s\s+sire|sire'?s\s+dam|dam'?s\s+sire|dam'?s\s+dam|paternal\s+grand(?:sire|dam)|maternal\s+grand(?:sire|dam)|sire|dam|pgs|pgd|mgs|mgd|sss|ssd|sds|sdd|dss|dsd|dds|ddd)\s*(?:\([^)]*\))?\s*[:\-–—]\s*/i;

/**
 * Extracts structured animal fields (name, ear tattoo/ID, ARBA registration #, GC #,
 * legs, weight, variety, breed, DOB, genotype, sex) from an OCR block's text lines.
 */
export function parsePedigreeSlotLines(
  lines: string[],
  defaultSex: BiologicalSex,
  preferredUnit: WeightUnit = 'lbs_oz'
): {
  name: string;
  tattoo: string;
  registrationNumber: string;
  grandChampionNumber: string;
  legsCount: number;
  weightText: string;
  weightGrams: number;
  breed: string;
  variety: string;
  birthDateIso: string;
  genotypeRaw: string;
  sex: BiologicalSex;
  notes: string;
  isUnknown: boolean;
} {
  const cleanedLines = lines
    .map((l) => sanitizeSingleLineText(l, 260))
    .filter((l) => l.length > 0 && !isBoilerplatePedigreeLine(l));

  if (cleanedLines.length === 0 || cleanedLines.every(isUnknownPlaceholderLine)) {
    return {
      name: '',
      tattoo: '',
      registrationNumber: '',
      grandChampionNumber: '',
      legsCount: 0,
      weightText: '',
      weightGrams: 0,
      breed: '',
      variety: '',
      birthDateIso: '',
      genotypeRaw: '',
      sex: defaultSex,
      notes: '',
      isUnknown: true,
    };
  }

  let name = '';
  let tattoo = '';
  let registrationNumber = '';
  let grandChampionNumber = '';
  let legsCount = 0;
  let weightGrams = 0;
  let weightText = '';
  let breed = '';
  let variety = '';
  let birthDateIso = '';
  let genotypeRaw = '';
  let sex: BiologicalSex = defaultSex;
  const extraParts: string[] = [];

  for (let lineIdx = 0; lineIdx < cleanedLines.length; lineIdx++) {
    let line = cleanedLines[lineIdx];
    if (lineIdx === 0) {
      line = line.replace(ROLE_PREFIX_REGEX, '').trim();
    }

    // Split inline metadata separators (·, |, •, ;) OR multi-label spacing
    const segments = line
      .split(/\s*[·|•;]\s*/)
      .map((t) => t.trim())
      .filter(Boolean);

    for (let segIdx = 0; segIdx < segments.length; segIdx++) {
      let tok = segments[segIdx];

      // Extract inline labeled fields from compound lines like "Ear: OR-101 Reg: 4412A Wt: 4# 8oz"
      const inlineMatches: Array<{ end: number }> = [];
      const inlineFieldRegex =
        /\b(name|animal|ear(?:\s*tag|\s*no\.?|\s*#)?|tattoo\s*(?:\/|\s+)?id|tattoo|tat\.?|id|arba\s*reg(?:\.|istration)?(?:\s*no\.?|\s*#)?|reg(?:\.|istration)?(?:\s*no\.?|\s*#)?|gc(?:\s*no\.?|\s*#)?|grand\s*champ(?:ion)?(?:\s*no\.?|\s*#)?|legs?|wt\.?|weight|dob|born|kindled|whelped|birth\s*date|breed\s*(?:&|and)\s*var(?:iety)?|breed|var(?:iety)?|color|coat|geno(?:type)?|sex)(?:\s*[:#=]\s*|\s+(?=\S))/gi;

      const labelHits: Array<{ key: string; start: number; valStart: number }> = [];
      let m: RegExpExecArray | null;
      while ((m = inlineFieldRegex.exec(tok)) !== null) {
        // Avoid matching short tokens mid-sentence without explicit ':'/'#'/'=' punctuation
        const keyLower = m[1].toLowerCase().trim();
        const hasPunct = /[:#=]/.test(m[0].slice(m[1].length));
        if (m.index > 0 && !hasPunct && /^(?:name|animal|id|ear|gc|color|coat|var|legs?)$/i.test(keyLower)) {
          continue;
        }
        // Avoid splitting "GC: GC-88" inside its own value
        const prevSlice = tok.slice(Math.max(0, m.index - 6), m.index);
        if (/[:#=]\s*$/.test(prevSlice)) {
          continue;
        }
        labelHits.push({
          key: keyLower,
          start: m.index,
          valStart: m.index + m[0].length,
        });
      }
      void inlineMatches;

      if (labelHits.length >= 2) {
        // Leading unlabelled portion before first label is likely the name
        const leadingText = tok.slice(0, labelHits[0].start).trim();
        if (leadingText && !name && lineIdx === 0 && segIdx === 0) {
          name = leadingText.replace(/^(?:name|animal)\s*[:\-]\s*/i, '').trim();
        }
        const subTokens: string[] = [];
        for (let k = 0; k < labelHits.length; k++) {
          const end = k + 1 < labelHits.length ? labelHits[k + 1].start : tok.length;
          const chunk = tok.slice(labelHits[k].start, end).trim();
          if (chunk) subTokens.push(chunk);
        }
        segments.splice(segIdx, 1, ...subTokens);
        tok = segments[segIdx];
      }

      // Explicit "Name:" or "Animal:" label overrides any banner header line
      const explicitNameMatch = tok.match(/^(?:name|animal)\s*[:=\-]\s*(.+)$/i);
      if (explicitNameMatch) {
        const val = sanitizeSingleLineText(explicitNameMatch[1], 140);
        if (val && !isUnknownPlaceholderLine(val)) {
          name = val;
        }
        continue;
      }

      if (
        lineIdx === 0 &&
        segIdx === 0 &&
        !name &&
        !/^(?:name|animal|id|ear(?:\s*tag|\s*no\.?|\s*#)?|tattoo|tat\.?|dob|born|kindled|birth|reg|arba\s*reg|gc|grand\s*champ|legs?|wt|weight|breed|var|variety|color|sex|geno|wright|printed)\b/i.test(
          tok
        )
      ) {
        name = tok.trim();
        continue;
      }

      // Ear tattoo / ID (supports "Tattoo/ID: OC-99" and "ID: OS-10")
      const idMatch = tok.match(
        /^(?:tattoo\s*(?:\/|\s+)?id|ear(?:\s*tag|\s*no\.?|\s*#)?|tattoo|tat\.?|id)(?:\s*[:#=\-]+\s*|\s+)(.+)$/i
      );
      if (idMatch && !tattoo) {
        const val = sanitizeSingleLineText(idMatch[1], 60);
        if (val && !isUnknownPlaceholderLine(val)) tattoo = val;
        continue;
      }

      // ARBA Registration #
      const regMatch = tok.match(
        /^(?:arba\s*)?(?:reg(?:istration)?(?:\s*no\.?|\s*#)?)(?:\s*[:#=\-]+\s*|\s+)(.+)$/i
      );
      if (regMatch && !registrationNumber) {
        const val = sanitizeSingleLineText(regMatch[1], 60);
        if (val && !isUnknownPlaceholderLine(val)) registrationNumber = val;
        continue;
      }

      // Grand Champion #
      const gcMatch = tok.match(
        /^(?:g\.?\s*c\.?|grand\s*champ(?:ion)?(?:\s*no\.?|\s*#)?)(?:\s*[:#=\-]+\s*|\s+)(.+)$/i
      );
      if (gcMatch && !grandChampionNumber) {
        const val = sanitizeSingleLineText(gcMatch[1], 60);
        if (val && !isUnknownPlaceholderLine(val)) grandChampionNumber = val;
        continue;
      }

      // Legs
      const legsLabelMatch = tok.match(/^legs?(?:\s*[:#=\-]+\s*|\s+)(\d{1,2})\b/i);
      const legsTrailingMatch = tok.match(/^(\d{1,2})\s*(?:arba\s*)?legs?\b/i);
      if (legsLabelMatch || legsTrailingMatch) {
        const count = Number((legsLabelMatch || legsTrailingMatch)![1]);
        if (Number.isFinite(count) && count >= 0 && count <= 50) {
          legsCount = Math.max(legsCount, count);
        }
        continue;
      }

      // Birth date
      const dobMatch = tok.match(
        /^(?:dob|born|kindled|whelped|birth(?:\s*date)?)(?:\s*[:=\-]+\s*|\s+)(.+)$/i
      );
      if (dobMatch && !birthDateIso) {
        birthDateIso = normalizeFlexibleDateIso(dobMatch[1]);
        continue;
      }

      // Weight (explicit label)
      const wtMatch = tok.match(/^(?:wt\.?|weight)(?:\s*[:=\-]+\s*|\s+)(.+)$/i);
      if (wtMatch && weightGrams === 0) {
        const parsedWt = parseOcrWeightSegment(wtMatch[1], preferredUnit);
        if (parsedWt.weightGrams > 0) {
          weightGrams = parsedWt.weightGrams;
          weightText = parsedWt.weightText;
          continue;
        }
      }

      // Inline unlabeled weight (e.g. "4# 8oz", "4 lbs 8 oz", "8.5 lbs", "3.2 kg")
      if (
        weightGrams === 0 &&
        /^\d+(?:\.\d+)?\s*(?:#|lbs?\.?|pounds?|oz\.?|ounces?|kg|grams?|gm?)\b/i.test(tok)
      ) {
        const parsedWt = parseOcrWeightSegment(tok, preferredUnit);
        if (parsedWt.weightGrams > 0) {
          weightGrams = parsedWt.weightGrams;
          weightText = parsedWt.weightText;
          continue;
        }
      }

      // Breed & Variety combined (e.g. "Breed & Variety: Holland Lop Broken Tort")
      const breedVarMatch = tok.match(/^breed\s*(?:&|and)\s*var(?:iety)?\s*[:=\-]+\s*(.+)$/i);
      if (breedVarMatch) {
        const val = sanitizeSingleLineText(breedVarMatch[1], 120);
        if (val && !variety) variety = val;
        continue;
      }

      // Breed
      const breedMatch = tok.match(/^breed(?:\s*[:=\-]+\s*|\s+)(.+)$/i);
      if (breedMatch && !breed) {
        breed = sanitizeSingleLineText(breedMatch[1], 100);
        continue;
      }

      // Variety / Color
      const varMatch = tok.match(/^(?:var(?:iety)?|color|coat)(?:\s*[:=\-]+\s*|\s+)(.+)$/i);
      if (varMatch && !variety) {
        variety = sanitizeSingleLineText(varMatch[1], 100);
        continue;
      }

      // Genotype
      const genoMatch = tok.match(/^geno(?:type)?(?:\s*[:=\-]+\s*|\s+)(.+)$/i);
      if (genoMatch && !genotypeRaw) {
        genotypeRaw = sanitizeSingleLineText(genoMatch[1], 120);
        continue;
      }

      // Sex
      const sexMatch = tok.match(/^sex(?:\s*[:=\-]+\s*|\s+)(.+)$/i);
      if (sexMatch) {
        sex = normalizeSexLoose(sexMatch[1], defaultSex);
        continue;
      }

      // Inline unlabeled ARBA date like "03/14/2024" or "2024-03-14"
      if (!birthDateIso && /^(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/. -]\d{1,2}[/. -]\d{2,4})$/.test(tok)) {
        const iso = normalizeFlexibleDateIso(tok);
        if (iso) {
          birthDateIso = iso;
          continue;
        }
      }

      // Heuristic unlabelled variety on line >= 1 (alphabetic color words like "Broken Tort", "Chestnut Agouti")
      if (
        !variety &&
        lineIdx > 0 &&
        tok.length >= 3 &&
        tok.length <= 42 &&
        !/\d/.test(tok) &&
        !isUnknownPlaceholderLine(tok)
      ) {
        variety = tok;
        continue;
      }

      if (tok && tok !== name) {
        extraParts.push(tok);
      }
    }
  }

  // Extract trailing parenthetical tattoo if embedded in name, e.g. "Oakridge Barnaby (OR-101)"
  const parenTag = name.match(/^(.+?)\s*\(([A-Za-z0-9#-]{2,20})\)\s*$/);
  if (parenTag) {
    const tagInsideParens = parenTag[2].trim();
    if (!tattoo) {
      name = parenTag[1].trim();
      tattoo = tagInsideParens;
    } else if (tattoo.toLowerCase() === tagInsideParens.toLowerCase()) {
      name = parenTag[1].trim();
    }
  }

  // Extract inline "Reg # ..." or "Wt ..." appended onto the name line without delimiter
  const inlineRegOnName = name.match(/\b(?:arba\s*)?reg\.?\s*#?\s*([A-Z0-9\-]{3,16})\b/i);
  if (inlineRegOnName && !registrationNumber) {
    registrationNumber = inlineRegOnName[1].trim();
    name = name.replace(inlineRegOnName[0], '').trim();
  }

  const finalName = sanitizeSingleLineText(name || tattoo || '', 140);
  const hasAnyUsefulData = Boolean(
    finalName || tattoo || registrationNumber || grandChampionNumber || weightGrams > 0 || variety
  );

  return {
    name: finalName,
    tattoo,
    registrationNumber,
    grandChampionNumber,
    legsCount,
    weightText,
    weightGrams,
    breed,
    variety,
    birthDateIso,
    genotypeRaw,
    sex,
    notes: extraParts.length > 0 ? sanitizePlainText(extraParts.join(' · '), 500) : '',
    isUnknown: !hasAnyUsefulData,
  };
}

interface TextFragment {
  text: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  xCenter: number;
  yCenter: number;
  confidence: number;
}

function buildLineFragmentsFromWords(
  words: OcrWordBox[],
  pageWidth: number
): TextFragment[] {
  const valid = words
    .map((w) => ({
      text: sanitizeSingleLineText(w.text, 120),
      x0: Number(w.x0) || 0,
      y0: Number(w.y0) || 0,
      x1: Number(w.x1) || 0,
      y1: Number(w.y1) || 0,
      confidence: typeof w.confidence === 'number' ? w.confidence : 75,
    }))
    .filter((w) => w.text.length > 0 && w.x1 >= w.x0 && w.y1 >= w.y0);

  if (valid.length === 0) return [];

  const heights = valid
    .map((w) => Math.max(4, w.y1 - w.y0))
    .sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 14;
  const rowTol = Math.max(5, medianH * 0.65);

  const sortedByY = [...valid].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const rowBuckets: typeof valid[] = [];
  for (const w of sortedByY) {
    const wy = (w.y0 + w.y1) / 2;
    const bucket = rowBuckets[rowBuckets.length - 1];
    if (bucket) {
      const by =
        bucket.reduce((acc, item) => acc + (item.y0 + item.y1) / 2, 0) / bucket.length;
      if (Math.abs(wy - by) <= rowTol) {
        bucket.push(w);
        continue;
      }
    }
    rowBuckets.push([w]);
  }

  const xGapThreshold = Math.max(medianH * 2.4, pageWidth * 0.038);
  const fragments: TextFragment[] = [];

  for (const row of rowBuckets) {
    row.sort((a, b) => a.x0 - b.x0);
    let currentWords = [row[0]];
    for (let i = 1; i < row.length; i++) {
      const prev = row[i - 1];
      const curr = row[i];
      if (curr.x0 - prev.x1 > xGapThreshold) {
        fragments.push(mergeFragmentWords(currentWords));
        currentWords = [curr];
      } else {
        currentWords.push(curr);
      }
    }
    fragments.push(mergeFragmentWords(currentWords));
  }

  return fragments.filter((f) => !isBoilerplatePedigreeLine(f.text));
}

function mergeFragmentWords(words: Array<{
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence: number;
}>): TextFragment {
  const x0 = Math.min(...words.map((w) => w.x0));
  const y0 = Math.min(...words.map((w) => w.y0));
  const x1 = Math.max(...words.map((w) => w.x1));
  const y1 = Math.max(...words.map((w) => w.y1));
  const avgConf =
    words.reduce((sum, w) => sum + w.confidence, 0) / Math.max(1, words.length);
  return {
    text: words.map((w) => w.text).join(' '),
    x0,
    y0,
    x1,
    y1,
    xCenter: (x0 + x1) / 2,
    yCenter: (y0 + y1) / 2,
    confidence: Math.round(avgConf),
  };
}

function clusterSortedXValues(xs: number[], k: number): { centers: number[]; variance: number } {
  if (xs.length === 0) return { centers: [], variance: 0 };
  const minX = xs[0];
  const maxX = xs[xs.length - 1];
  if (maxX - minX < 20) {
    return { centers: [minX], variance: 0 };
  }
  let centers = Array.from({ length: k }, (_, i) => minX + ((i + 0.5) / k) * (maxX - minX));
  for (let iter = 0; iter < 12; iter++) {
    const groups: number[][] = Array.from({ length: k }, () => []);
    for (const x of xs) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const d = Math.abs(x - centers[c]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = c;
        }
      }
      groups[bestIdx].push(x);
    }
    const nextCenters = centers.map((c, idx) =>
      groups[idx].length > 0
        ? groups[idx].reduce((a, b) => a + b, 0) / groups[idx].length
        : c
    );
    centers = nextCenters;
  }
  centers.sort((a, b) => a - b);
  let variance = 0;
  for (const x of xs) {
    let bestDist = Infinity;
    for (const c of centers) {
      bestDist = Math.min(bestDist, Math.abs(x - c));
    }
    variance += bestDist * bestDist;
  }
  return { centers, variance };
}

function tryParse2dBoundingBoxTree(
  words: OcrWordBox[],
  imageWidth: number,
  imageHeight: number,
  preferredUnit: WeightUnit
): {
  slots: PedigreeOcrSlotDraft[];
  populatedCount: number;
  headerLines: string[];
} | null {
  const inferredW = Math.max(imageWidth || 0, ...words.map((w) => w.x1), 1000);
  const inferredH = Math.max(imageHeight || 0, ...words.map((w) => w.y1), 800);
  const fragments = buildLineFragmentsFromWords(words, inferredW);
  if (fragments.length < 3) return null;

  // Separate potential top header lines (above tree) vs tree columns by testing 3-col vs 4-col fit
  const allMinY = Math.min(...fragments.map((f) => f.y0));
  const allMaxY = Math.max(...fragments.map((f) => f.y1));
  const spanY = Math.max(1, allMaxY - allMinY);

  // Look for multi-column tree fragments (either full height or lower 78% if header subject sits on top)
  const lowerFragments = fragments.filter((f) => f.yCenter >= allMinY + spanY * 0.18);
  const candidatePool = lowerFragments.length >= 4 ? lowerFragments : fragments;
  const xs = candidatePool.map((f) => f.x0).sort((a, b) => a - b);
  if (xs[xs.length - 1] - xs[0] < inferredW * 0.25) {
    return null; // Single-column layout; let line heuristic handle it
  }

  const fit3 = clusterSortedXValues(xs, 3);
  const fit4 = clusterSortedXValues(xs, 4);

  // Check if 4 columns are genuinely distinct (min gap >= 12% of page width and meaningfully lower variance)
  const minGap4 = fit4.centers
    .slice(1)
    .reduce((min, c, i) => Math.min(min, c - fit4.centers[i]), Infinity);
  const minGap3 = fit3.centers
    .slice(1)
    .reduce((min, c, i) => Math.min(min, c - fit3.centers[i]), Infinity);

  // Count how many fragments fall near col 0 in 4-col clustering and whether they span a compact single region
  const col0FragsIn4 = candidatePool.filter(
    (f) => Math.abs(f.x0 - fit4.centers[0]) <= Math.abs(f.x0 - fit4.centers[1])
  );
  const use4Cols =
    minGap4 >= inferredW * 0.12 &&
    fit4.variance < fit3.variance * 0.55 &&
    col0FragsIn4.length >= 1 &&
    col0FragsIn4.length <= 8;

  const colCenters = use4Cols ? fit4.centers : fit3.centers;
  if (!use4Cols && minGap3 < inferredW * 0.12) {
    return null;
  }

  // Decide tree top Y: separate top Subject box / banner lines from 3-column ancestor tree rows
  const isSubjectBannerFragment = (f: TextFragment) =>
    /\b(?:name\s*:|tattoo\s*(?:\/|\s+)?id\s*:|breed\s*(?:&|and)\s*var(?:iety)?\s*:|wright\s+coi\s*:|official\s+\d+-generation)/i.test(
      f.text
    );

  const topMultiRowY = (() => {
    const sorted = [...fragments].sort((a, b) => a.yCenter - b.yCenter);
    // Start after any explicit Subject summary / PDF header banner fragments
    const lastBannerIdx = sorted.reduce(
      (last, f, idx) => (isSubjectBannerFragment(f) ? idx : last),
      -1
    );
    const searchStart = lastBannerIdx >= 0 ? lastBannerIdx + 1 : 0;

    for (let i = searchStart; i < sorted.length; i++) {
      const f = sorted[i];
      // Tree row begins where fragments sit across distinct pedigree columns without spanning across columns
      const hasRightPeer = sorted.some(
        (other, j) =>
          j >= searchStart &&
          other !== f &&
          !isSubjectBannerFragment(other) &&
          Math.abs(other.yCenter - f.yCenter) < spanY * 0.14 &&
          other.x0 - f.x0 > inferredW * 0.22
      );
      if (hasRightPeer) return f.y0;
    }
    return sorted[searchStart]?.y0 ?? allMinY;
  })();

  const headerFrags = use4Cols
    ? []
    : fragments.filter((f) => f.y1 < topMultiRowY - 2 || isSubjectBannerFragment(f));
  const treeFrags = use4Cols
    ? fragments
    : fragments.filter((f) => f.y1 >= topMultiRowY - 2 && !isSubjectBannerFragment(f));

  if (treeFrags.length < 2) return null;

  const treeTopY = Math.min(...treeFrags.map((f) => f.y0));
  const treeBottomY = Math.max(...treeFrags.map((f) => f.y1));
  const treeHeight = Math.max(10, treeBottomY - treeTopY);

  // Assign each tree fragment to nearest column center
  const slotFragments = new Map<PedigreeOcrSlotKey, TextFragment[]>();
  const pushSlotFrag = (key: PedigreeOcrSlotKey, frag: TextFragment) => {
    const arr = slotFragments.get(key) ?? [];
    arr.push(frag);
    slotFragments.set(key, arr);
  };

  if (!use4Cols && headerFrags.length > 0) {
    for (const hf of headerFrags) {
      pushSlotFrag('subject', hf);
    }
  }

  const genKeysByDepth: Record<1 | 2 | 3, PedigreeOcrSlotKey[]> = {
    1: ['sire', 'dam'],
    2: ['pgs', 'pgd', 'mgs', 'mgd'],
    3: ['sss', 'ssd', 'sds', 'sdd', 'dss', 'dsd', 'dds', 'ddd'],
  };

  for (const frag of treeFrags) {
    let colIdx = 0;
    let bestDist = Infinity;
    for (let c = 0; c < colCenters.length; c++) {
      const d = Math.abs(frag.x0 - colCenters[c]);
      if (d < bestDist) {
        bestDist = d;
        colIdx = c;
      }
    }

    if (use4Cols && colIdx === 0) {
      pushSlotFrag('subject', frag);
      continue;
    }

    const genNum = (use4Cols ? colIdx : colIdx + 1) as 1 | 2 | 3;
    const keys = genKeysByDepth[genNum];
    if (!keys) continue;

    const normY = Math.max(0, Math.min(0.9999, (frag.yCenter - treeTopY) / treeHeight));
    const bucketIdx = Math.min(keys.length - 1, Math.floor(normY * keys.length));
    pushSlotFrag(keys[bucketIdx], frag);
  }

  const slots = createEmptyPedigreeOcrSlots('');
  let populatedCount = 0;

  for (const slot of slots) {
    const frags = slotFragments.get(slot.slotKey);
    if (!frags || frags.length === 0) continue;
    frags.sort((a, b) => a.yCenter - b.yCenter || a.x0 - b.x0);
    const lines = frags.map((f) => f.text);
    const desc = PEDIGREE_OCR_SLOT_DESCRIPTORS.find((d) => d.key === slot.slotKey)!;
    const parsed = parsePedigreeSlotLines(lines, desc.defaultSex, preferredUnit);
    if (parsed.isUnknown) continue;

    const avgConf = Math.round(
      frags.reduce((s, f) => s + f.confidence, 0) / Math.max(1, frags.length)
    );
    slot.name = parsed.name;
    slot.tattoo = parsed.tattoo;
    slot.registrationNumber = parsed.registrationNumber;
    slot.grandChampionNumber = parsed.grandChampionNumber;
    slot.legsCount = parsed.legsCount;
    slot.weightText = parsed.weightText;
    slot.weightGrams = parsed.weightGrams;
    slot.breed = parsed.breed;
    slot.variety = parsed.variety;
    slot.birthDateIso = parsed.birthDateIso;
    slot.genotypeRaw = parsed.genotypeRaw;
    slot.sex = parsed.sex;
    slot.notes = parsed.notes;
    slot.confidence = avgConf;
    slot.rawSnippet = lines.join('\n');
    slot.included = true;
    populatedCount++;
  }

  if (populatedCount === 0) return null;

  return {
    slots,
    populatedCount,
    headerLines: headerFrags.map((f) => f.text),
  };
}

const SLOT_LABEL_PATTERNS: Array<{ key: PedigreeOcrSlotKey; pattern: RegExp }> = [
  { key: 'sss', pattern: /^(?:sss|sire'?s\s+sire'?s\s+sire)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'ssd', pattern: /^(?:ssd|sire'?s\s+sire'?s\s+dam)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'sds', pattern: /^(?:sds|sire'?s\s+dam'?s\s+sire)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'sdd', pattern: /^(?:sdd|sire'?s\s+dam'?s\s+dam)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'dss', pattern: /^(?:dss|dam'?s\s+sire'?s\s+sire)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'dsd', pattern: /^(?:dsd|dam'?s\s+sire'?s\s+dam)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'dds', pattern: /^(?:dds|dam'?s\s+dam'?s\s+sire)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'ddd', pattern: /^(?:ddd|dam'?s\s+dam'?s\s+dam)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'pgs', pattern: /^(?:pgs|sire'?s\s+sire|paternal\s+grandsire)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'pgd', pattern: /^(?:pgd|sire'?s\s+dam|paternal\s+granddam)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'mgs', pattern: /^(?:mgs|dam'?s\s+sire|maternal\s+grandsire)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'mgd', pattern: /^(?:mgd|dam'?s\s+dam|maternal\s+granddam)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'sire', pattern: /^(?:sire(?:\s*\(gen\s*1\))?|father)\b\s*[:\-–—]\s*(.*)$/i },
  { key: 'dam', pattern: /^(?:dam(?:\s*\(gen\s*1\))?|mother)\b\s*[:\-–—]\s*(.*)$/i },
  { key: 'subject', pattern: /^(?:subject(?:\s+animal)?|animal)\b\s*[:\-–—]\s*(.*)$/i },
];

function parseLinesHeuristic(
  rawText: string,
  baseConfidence: number,
  preferredUnit: WeightUnit
): { slots: PedigreeOcrSlotDraft[]; populatedCount: number } {
  const slots = createEmptyPedigreeOcrSlots('');
  const byKey = new Map<PedigreeOcrSlotKey, string[]>();

  const rawLines = rawText.replace(/\r\n/g, '\n').split('\n');
  let activeKey: PedigreeOcrSlotKey | null = null;
  let foundExplicitLabels = false;

  for (const rawLine of rawLines) {
    const clean = sanitizeSingleLineText(rawLine, 260);
    if (!clean || isBoilerplatePedigreeLine(clean)) continue;

    let matchedLabel = false;
    for (const spec of SLOT_LABEL_PATTERNS) {
      const m = spec.pattern.exec(clean);
      if (m) {
        foundExplicitLabels = true;
        activeKey = spec.key;
        matchedLabel = true;
        const remainder = (m[1] || '').trim();
        const arr = byKey.get(activeKey) ?? [];
        if (remainder) arr.push(remainder);
        byKey.set(activeKey, arr);
        break;
      }
    }
    if (matchedLabel) continue;

    if (activeKey) {
      const arr = byKey.get(activeKey) ?? [];
      arr.push(clean);
      byKey.set(activeKey, arr);
    }
  }

  // If no explicit Sire/Dam/PGS labels existed, fall back to blank-line-separated blocks in tree order
  if (!foundExplicitLabels) {
    const blocks = rawText
      .replace(/\r\n/g, '\n')
      .split(/\n\s*\n+/)
      .map((blk) =>
        blk
          .split('\n')
          .map((l) => sanitizeSingleLineText(l, 260))
          .filter((l) => l.length > 0 && !isBoilerplatePedigreeLine(l))
      )
      .filter((lines) => lines.length > 0);

    const order: PedigreeOcrSlotKey[] = PEDIGREE_OCR_SLOT_DESCRIPTORS.map((d) => d.key);
    blocks.slice(0, order.length).forEach((lines, idx) => {
      byKey.set(order[idx], lines);
    });
  }

  let populatedCount = 0;
  for (const slot of slots) {
    const lines = byKey.get(slot.slotKey);
    if (!lines || lines.length === 0) continue;
    const desc = PEDIGREE_OCR_SLOT_DESCRIPTORS.find((d) => d.key === slot.slotKey)!;
    const parsed = parsePedigreeSlotLines(lines, desc.defaultSex, preferredUnit);
    if (parsed.isUnknown) continue;

    slot.name = parsed.name;
    slot.tattoo = parsed.tattoo;
    slot.registrationNumber = parsed.registrationNumber;
    slot.grandChampionNumber = parsed.grandChampionNumber;
    slot.legsCount = parsed.legsCount;
    slot.weightText = parsed.weightText;
    slot.weightGrams = parsed.weightGrams;
    slot.breed = parsed.breed;
    slot.variety = parsed.variety;
    slot.birthDateIso = parsed.birthDateIso;
    slot.genotypeRaw = parsed.genotypeRaw;
    slot.sex = parsed.sex;
    slot.notes = parsed.notes;
    slot.confidence = baseConfidence;
    slot.rawSnippet = lines.join('\n');
    slot.included = true;
    populatedCount++;
  }

  return { slots, populatedCount };
}

/**
 * Parses a scanned pedigree page (raw OCR text + optional 2D word bounding boxes) into an
 * editable 15-slot 3-generation pedigree draft ready for the Import Review Queue.
 */
export function parsePedigreeOcrResult(
  input: OcrScannedPageInput,
  options?: {
    fallbackSpecies?: string;
    preferredUnit?: WeightUnit;
  }
): PedigreeOcrParseResult {
  const preferredUnit = options?.preferredUnit ?? 'lbs_oz';
  const sanitizedRawText = sanitizePlainText(input.rawText || '', 30_000)
    .replace(/\r\n/g, '\n')
    .trim();
  const detectedSpecies = detectSpeciesFromOcrText(
    sanitizedRawText,
    input.sourceFileName,
    options?.fallbackSpecies || 'Rabbit'
  );
  const warnings: string[] = [];
  const baseConf =
    typeof input.confidence === 'number' && Number.isFinite(input.confidence)
      ? Math.max(0, Math.min(100, Math.round(input.confidence)))
      : 75;

  const lineRes = sanitizedRawText
    ? parseLinesHeuristic(sanitizedRawText, baseConf, preferredUnit)
    : { slots: createEmptyPedigreeOcrSlots(''), populatedCount: 0 };

  let chosenSlots = lineRes.slots;
  let populatedSlotCount = lineRes.populatedCount;
  let layoutMode: PedigreeOcrParseResult['layoutMode'] =
    populatedSlotCount > 0 ? 'line_heuristic' : 'manual_empty';

  if (input.words && input.words.length >= 4) {
    const treeRes = tryParse2dBoundingBoxTree(
      input.words,
      input.imageWidth || 1000,
      input.imageHeight || 800,
      preferredUnit
    );
    // Prefer 2D tree layout whenever it extracts >= line heuristic (or >= 2 ancestors)
    if (treeRes && treeRes.populatedCount >= Math.max(2, lineRes.populatedCount)) {
      chosenSlots = treeRes.slots;
      populatedSlotCount = treeRes.populatedCount;
      layoutMode = 'bounding_box_tree';
    }
  }

  // Propagate subject/detected breed down to slots missing an explicit breed
  const detectedBreed =
    chosenSlots.find((s) => s.slotKey === 'subject' && s.breed)?.breed ||
    chosenSlots.find((s) => s.breed)?.breed ||
    '';
  if (detectedBreed) {
    for (const s of chosenSlots) {
      if (s.included && !s.breed) s.breed = detectedBreed;
    }
  }

  if (populatedSlotCount === 0) {
    warnings.push(
      'No pedigree entries could be parsed automatically from this scan. Fill in or edit any slots below before staging into the Import Review Queue.'
    );
  } else if (populatedSlotCount <= 2) {
    warnings.push(
      'Only partial pedigree text was recognized (creases, handwriting, or low contrast). Review and correct any ancestor fields below before merging.'
    );
  }

  return {
    slots: chosenSlots,
    detectedSpecies,
    detectedBreed,
    sanitizedRawText,
    layoutMode,
    populatedSlotCount,
    warnings,
  };
}

/**
 * Converts reviewed/edited OCR pedigree slot drafts directly into a standard `PlatformImportPreview`
 * with deterministic IDs, 3-generation parent linking, preexisting barn animal matching,
 * and per-field contradiction checks for the Import Review Queue.
 */
export function buildPlatformImportPreviewFromOcrDrafts(params: {
  slots: PedigreeOcrSlotDraft[];
  speciesName: string;
  sourceFileName: string;
  existingSnapshot: BarnDatabaseSnapshot;
  attachedScanPhoto?: {
    fileName: string;
    mimeHint: string;
    bytes: Uint8Array;
  };
}): PlatformImportPreview {
  const ts = nowIsoUtc();
  const species = sanitizeSingleLineText(params.speciesName || 'Rabbit', 80) || 'Rabbit';
  const cleanSourceName = sanitizeSingleLineText(params.sourceFileName || 'pedigree-scan.jpg', 140);
  const warnings: string[] = [];

  const workingSpeciesProfiles: SpeciesProfile[] = [...params.existingSnapshot.speciesProfiles];
  const newSpeciesProfiles: SpeciesProfile[] = [];
  const existingSp = workingSpeciesProfiles.find((p) => isSameSpecies(p.name, species));
  if (!existingSp) {
    const preset = PREDEFINED_SPECIES_PRESETS.find((p) => isSameSpecies(p.name, species));
    const base = resolveSpeciesProfile(species, []);
    const created: SpeciesProfile = preset
      ? { ...preset, sortOrder: workingSpeciesProfiles.length, createdAt: ts, updatedAt: ts }
      : {
          ...base,
          id: `species-${slugifyKey(species)}`,
          name: species,
          sortOrder: workingSpeciesProfiles.length,
          createdAt: ts,
          updatedAt: ts,
        };
    workingSpeciesProfiles.push(created);
    newSpeciesProfiles.push(created);
  }

  const activeDrafts = params.slots.filter(
    (s) =>
      s.included &&
      Boolean(
        s.name.trim() ||
          s.tattoo.trim() ||
          s.registrationNumber.trim() ||
          s.grandChampionNumber.trim()
      )
  );

  const animalsById = new Map<string, Animal>();
  const slotToAnimalId = new Map<PedigreeOcrSlotKey, string>();
  const matchedExistingByAnimalId = new Map<string, PreexistingAnimalMatch>();

  for (const draft of activeDrafts) {
    const cleanName = sanitizeSingleLineText(draft.name, 140);
    const cleanTag = sanitizeSingleLineText(draft.tattoo, 60);
    const cleanReg = sanitizeSingleLineText(draft.registrationNumber, 60);
    const cleanGc = sanitizeSingleLineText(draft.grandChampionNumber, 60);
    const cleanVariety = sanitizeSingleLineText(draft.variety, 100);
    const cleanBreed = sanitizeSingleLineText(draft.breed, 100);
    const cleanGeno = sanitizeSingleLineText(draft.genotypeRaw, 120);
    const cleanDob = normalizeFlexibleDateIso(draft.birthDateIso);
    const parsedWt =
      draft.weightGrams > 0
        ? draft.weightGrams
        : parseOcrWeightSegment(draft.weightText).weightGrams;

    const detId = deterministicOcrEntityId(
      species,
      `${cleanTag}|${cleanReg}|${cleanName}|${draft.slotKey}`
    );

    const preexisting = findPreexistingAnimalMatch(params.existingSnapshot.animals, {
      species,
      candidateDeterministicId: detId,
      tattoo: cleanTag,
      registrationNumber: cleanReg,
      name: cleanName,
      birthDateIso: cleanDob,
    });

    const finalId = preexisting ? preexisting.animal.id : detId;
    if (preexisting && !matchedExistingByAnimalId.has(finalId)) {
      matchedExistingByAnimalId.set(finalId, preexisting);
    }

    const existingInBatch = animalsById.get(finalId);
    if (existingInBatch) {
      if (!existingInBatch.tattoo && cleanTag) existingInBatch.tattoo = cleanTag;
      if (!existingInBatch.registrationNumber && cleanReg) existingInBatch.registrationNumber = cleanReg;
      if (!existingInBatch.grandChampionNumber && cleanGc) existingInBatch.grandChampionNumber = cleanGc;
      if (!existingInBatch.variety && cleanVariety) existingInBatch.variety = cleanVariety;
      if (!existingInBatch.breed && cleanBreed) existingInBatch.breed = cleanBreed;
      if (!existingInBatch.birthDateIso && cleanDob) existingInBatch.birthDateIso = cleanDob;
      if (!existingInBatch.weightGrams && parsedWt) existingInBatch.weightGrams = parsedWt;
      slotToAnimalId.set(draft.slotKey, finalId);
      continue;
    }

    const animal: Animal = {
      id: finalId,
      tattoo: cleanTag,
      name: cleanName || cleanTag || cleanReg || `${draft.shortLabel} (Scanned)`,
      species,
      breed: cleanBreed,
      variety: cleanVariety,
      sex: draft.sex,
      status: 'Active',
      archived: false,
      birthDateIso: cleanDob,
      weightGrams: parsedWt,
      genotype: cleanGeno ? parseGenotypeString(cleanGeno, species) : [],
      genotypeRaw: cleanGeno,
      registrationNumber: cleanReg,
      grandChampionNumber: cleanGc,
      legsCount: Math.max(0, Math.round(Number(draft.legsCount) || 0)),
      cageLocation: '',
      breederName: '',
      ownerName: '',
      sireId: '',
      damId: '',
      notes: sanitizePlainText(draft.notes, 2000),
      createdAt: preexisting?.animal.createdAt || ts,
      updatedAt: ts,
    };

    animalsById.set(finalId, animal);
    slotToAnimalId.set(draft.slotKey, finalId);
  }

  let parentLinksResolved = 0;
  for (const desc of PEDIGREE_OCR_SLOT_DESCRIPTORS) {
    if (!desc.childKey || !desc.linkSide) continue;
    const childId = slotToAnimalId.get(desc.childKey);
    const parentId = slotToAnimalId.get(desc.key);
    if (!childId || !parentId || childId === parentId) continue;
    const childAnimal = animalsById.get(childId);
    if (!childAnimal) continue;
    if (desc.linkSide === 'sire' && childAnimal.sireId !== parentId) {
      childAnimal.sireId = parentId;
      parentLinksResolved++;
    } else if (desc.linkSide === 'dam' && childAnimal.damId !== parentId) {
      childAnimal.damId = parentId;
      parentLinksResolved++;
    }
  }

  const allKnownAnimalsById = new Map<string, Animal>();
  for (const ex of params.existingSnapshot.animals) allKnownAnimalsById.set(ex.id, ex);
  for (const inc of animalsById.values()) {
    if (!allKnownAnimalsById.has(inc.id)) allKnownAnimalsById.set(inc.id, inc);
  }

  const conflicts: AnimalImportConflict[] = [];
  for (const [animalId, match] of matchedExistingByAnimalId.entries()) {
    const inc = animalsById.get(animalId);
    if (!inc) continue;
    const contradictions = buildAnimalContradictions(match.animal, inc, {
      preferredUnit: params.existingSnapshot.settings.preferredUnit,
      speciesProfiles: workingSpeciesProfiles,
      allKnownAnimalsById,
    });
    if (contradictions.length > 0) {
      conflicts.push({
        animalId,
        species: match.animal.species,
        displayName: match.animal.name || inc.name,
        displayTag: match.animal.tattoo || inc.tattoo,
        matchedBy: match.matchedBy,
        existingAnimal: match.animal,
        incomingAnimal: inc,
        contradictions,
      });
    }
  }

  const stagedPhotos: StagedImportedPhoto[] = [];
  const subjectId = slotToAnimalId.get('subject');
  const subjectAnimal = subjectId ? animalsById.get(subjectId) : undefined;
  if (params.attachedScanPhoto && subjectAnimal && params.attachedScanPhoto.bytes.byteLength > 0) {
    stagedPhotos.push({
      id: `ocr-scan-${stableHash(`${subjectAnimal.id}:${params.attachedScanPhoto.fileName}`)}`,
      species,
      animalId: subjectAnimal.id,
      animalName: subjectAnimal.name,
      isPrimary: false,
      sortOrder: 99,
      caption: `Scanned Paper Pedigree (${cleanSourceName})`,
      originalFileName: params.attachedScanPhoto.fileName,
      entryPath: params.attachedScanPhoto.fileName,
      mimeHint: params.attachedScanPhoto.mimeHint,
      bytes: params.attachedScanPhoto.bytes,
    });
  }

  const stagedPhotosRawBytes = stagedPhotos.reduce((acc, p) => acc + p.bytes.byteLength, 0);

  return {
    platformId: 'ocr-pedigree-scanner',
    platformName: 'Offline Pedigree OCR Scan',
    archiveNames: [cleanSourceName],
    diagnostics: [
      {
        archiveName: cleanSourceName,
        entryPath: cleanSourceName,
        classification: 'animals',
        rowCount: animalsById.size,
        headers: ['Pedigree OCR Review Slots'],
        matchedColumns: ['Name', 'Tattoo / Ear #', 'ARBA Reg #', 'Weight', 'Variety'],
        unmappedColumns: [],
      },
    ],
    stagedPhotos,
    stagedPhotosRawBytes,
    missingPhotoZipRefsCount: 0,
    deferredMediaCount: 0,
    deferredMediaBytes: 0,
    deferredMediaSampleNames: [],
    deferredManifestRowCount: 0,
    animalsWithMultipleImagesCount: 0,
    warnings,
    speciesDetected: animalsById.size > 0 ? [species] : [],
    newSpeciesProfiles,
    animals: Array.from(animalsById.values()),
    matchedExistingAnimalsCount: matchedExistingByAnimalId.size,
    conflicts,
    parentLinksResolved,
    placeholderAncestorsCreated: 0,
    cages: [],
    breedings: [],
    tasks: [],
    careLogs: [],
    shows: [],
    schemaDiagnosticReport: [
      'Importer: Offline Pedigree OCR Scan',
      `Source: ${cleanSourceName}`,
      `Parsed Slots: ${animalsById.size} (${parentLinksResolved} parent links)`,
    ].join('\n'),
  };
}
```

## `src/core/importers/registry.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Central External Platform Importer Registry (`src/core/importers/registry.ts`).
 *
 * Designed so every additional livestock/pedigree platform we add (Evans Software, Kintracs,
 * Hutch, Livestocked, CattleMax, etc.) registers cleanly in one array with zero UI rewrite.
 */

import { HerdBossImporter } from './herdBossImporter';
import { PlatformImporter } from './importerTypes';
import { UniversalPedigreeImporter } from './universalPedigreeImporter';

export const PLATFORM_IMPORTERS: PlatformImporter[] = [
  HerdBossImporter,
  UniversalPedigreeImporter,
];

export function getPlatformImporterById(id: string): PlatformImporter {
  return PLATFORM_IMPORTERS.find((imp) => imp.id === id) || PLATFORM_IMPORTERS[0];
}
```

## `src/core/importers/universalPedigreeImporter.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Universal Pedigree, Evans `.HTM` & Multi-System Spreadsheet Importer
 * (`src/core/importers/universalPedigreeImporter.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`, `DOMParser`) dependencies.
 * Runs identically in Web PWA, Node tests, and React Native / Expo.
 *
 * Designed to ingest wildly varying pedigree exports gracefully:
 * - Evans Software / ARBA `.HTM` & `.HTML` multi-generation pedigree trees (`rowspan` grids)
 * - Kintracs, ZooEasy, Hutch, Everbreed, CattleMax & custom multi-generation CSV/TSV/pipe sheets
 *   with parent & grandparent/great-grandparent columns (`Sire`, `Dam`, `PGS`, `PGD`, `MGS`, `MGD`, `SSS`..)
 * - Generic JSON animal arrays & nested `{ sire: {...}, dam: {...} }` pedigree trees
 * - Clear, non-crashing actionable warnings for wrong/corrupt/unsupported binary formats (.pdf/.xlsx/.sqlite)
 */

import { parseGenotypeString } from '../geneticsEngine';
import { sanitizePlainText, sanitizeSingleLineText } from '../inputSanitization';
import {
  Animal,
  BarnDatabaseSnapshot,
  BiologicalSex,
  isAnimalArchived,
  isSameSpecies,
  normalizeAnimalStatus,
  nowIsoUtc,
  PREDEFINED_SPECIES_PRESETS,
  resolveSpeciesProfile,
  SpeciesProfile,
} from '../models';
import {
  extractVirtualEntries,
  normalizeFlexibleDateIso,
  parseDelimitedTable,
  parseFlexibleWeightToGrams,
} from './archiveAndCsvUtils';
import {
  AnimalImportConflict,
  buildAnimalContradictions,
  findPreexistingAnimalMatch,
  PreexistingAnimalMatch,
} from './conflictResolver';
import {
  CsvTableColumnResolution,
  resolveCsvColumnAssignments,
} from './csvColumnMapper';
import {
  CsvTableMappingSummary,
  CsvTargetFieldKey,
  CustomSpeciesImportOverride,
  DetectedTableDiagnostic,
  ImporterRunOptions,
  PlatformImporter,
  PlatformImportPreview,
  RawArchiveInput,
  UnresolvedParentLink,
  VirtualArchiveEntry,
} from './importerTypes';

function slugifyKey(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'
  );
}

function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(36);
}

function deterministicEntityId(prefix: string, species: string, seed: string): string {
  const sSlug = slugifyKey(species);
  const cleanSeed = seed.trim().toLowerCase();
  return `${prefix}-${sSlug}-${stableHash(cleanSeed)}`;
}

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&mdash;|&ndash;/gi, '-')
    .replace(/&middot;|&bull;/gi, '·')
    .replace(/&#(\d+);/g, (_, num) => {
      const code = Number(num);
      return Number.isFinite(code) && code >= 32 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code >= 32 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    });
}

function htmlFragmentToLines(fragment: string): string[] {
  const withBreaks = fragment
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(?:br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(withBreaks)
    .split('\n')
    .map((line) => sanitizeSingleLineText(line.replace(/\s+/g, ' ').trim(), 400))
    .filter(Boolean);
}

interface ParsedCellMeta {
  name: string;
  tattoo: string;
  variety: string;
  breed: string;
  weightGrams: number;
  birthDateIso: string;
  registrationNumber: string;
  grandChampionNumber: string;
  legsCount: number;
  genotypeRaw: string;
  sex: BiologicalSex;
  notes: string;
  isUnknown: boolean;
}

function parseAncestorTextLines(
  lines: string[],
  defaultSex: BiologicalSex,
  weightHintUnit?: string
): ParsedCellMeta {
  const joined = lines.join(' · ');
  const isEmptyOrUnknown =
    lines.length === 0 ||
    lines.every((l) =>
      /^(?:unknown|none|n\/a|na|-|—|\?|(?:buck|doe|sire|dam|ram|ewe|bull|cow|boar|sow|stallion|mare|male|female)\s*(?:-|—|:)?\s*unknown)$/i.test(
        l.trim()
      )
    );

  if (isEmptyOrUnknown) {
    return {
      name: '',
      tattoo: '',
      variety: '',
      breed: '',
      weightGrams: 0,
      birthDateIso: '',
      registrationNumber: '',
      grandChampionNumber: '',
      legsCount: 0,
      genotypeRaw: '',
      sex: defaultSex,
      notes: '',
      isUnknown: true,
    };
  }

  let name = lines[0] || '';
  name = name.replace(/^(?:name|animal|sire|dam)\s*:\s*/i, '').trim();
  let tattoo = '';
  let variety = '';
  let breed = '';
  let weightGrams = 0;
  let birthDateIso = '';
  let registrationNumber = '';
  let grandChampionNumber = '';
  let legsCount = 0;
  let genotypeRaw = '';
  let sex: BiologicalSex = defaultSex;
  const extraParts: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const tokens = lines[i].split(/\s*[·|•;]\s*/).map((t) => t.trim()).filter(Boolean);
    for (let tIdx = 0; tIdx < tokens.length; tIdx++) {
      const tok = tokens[tIdx];
      if (i === 0 && tIdx === 0 && !/^(?:id|ear|tattoo|dob|born|reg|gc|legs|wt|weight)\s*:/i.test(tok)) {
        name = tok.replace(/^(?:name|animal)\s*:\s*/i, '').trim();
        continue;
      }

      const idMatch = tok.match(/^(?:id|ear(?:\s*tag|\s*#)?|tattoo|tat\.?)\s*:?\s*(.+)$/i);
      if (idMatch && !tattoo) {
        tattoo = sanitizeSingleLineText(idMatch[1], 60);
        continue;
      }

      const dobMatch = tok.match(/^(?:dob|born|birth(?:\s*date)?)\s*:?\s*(.+)$/i);
      if (dobMatch && !birthDateIso) {
        birthDateIso = normalizeFlexibleDateIso(dobMatch[1]);
        continue;
      }

      const regMatch = tok.match(/^(?:reg(?:istration)?(?:\s*#|\s*no\.?)?)\s*:?\s*(.+)$/i);
      if (regMatch && !registrationNumber) {
        registrationNumber = sanitizeSingleLineText(regMatch[1], 60);
        continue;
      }

      const gcMatch = tok.match(/^(?:gc|grand\s*champ(?:ion)?(?:\s*#)?)\s*:?\s*(.+)$/i);
      if (gcMatch && !grandChampionNumber) {
        grandChampionNumber = sanitizeSingleLineText(gcMatch[1], 60);
        continue;
      }

      const legsMatch = tok.match(/^legs?\s*:?\s*(\d+)$/i);
      if (legsMatch) {
        legsCount = Math.max(0, Number(legsMatch[1]) || 0);
        continue;
      }

      const wtMatch = tok.match(/^(?:wt|weight)\s*:?\s*(.+)$/i);
      if (wtMatch && weightGrams === 0) {
        weightGrams = parseFlexibleWeightToGrams(wtMatch[1], weightHintUnit);
        continue;
      }

      if (
        !weightGrams &&
        /^\d+(?:\.\d+)?\s*(?:lbs?|#|oz|g|gm|grams?|kg)\b/i.test(tok)
      ) {
        weightGrams = parseFlexibleWeightToGrams(tok, weightHintUnit);
        continue;
      }

      const varMatch = tok.match(/^(?:var(?:iety)?|color|coat)\s*:?\s*(.+)$/i);
      if (varMatch && !variety) {
        variety = sanitizeSingleLineText(varMatch[1], 100);
        continue;
      }

      const breedMatch = tok.match(/^breed\s*:?\s*(.+)$/i);
      if (breedMatch && !breed) {
        breed = sanitizeSingleLineText(breedMatch[1], 100);
        continue;
      }

      const sexMatch = tok.match(/^sex\s*:?\s*(.+)$/i);
      if (sexMatch) {
        sex = normalizeSexLoose(sexMatch[1], defaultSex);
        continue;
      }

      const genoMatch = tok.match(/^(?:geno(?:type)?)\s*:?\s*(.+)$/i);
      if (genoMatch && !genotypeRaw) {
        genotypeRaw = sanitizeSingleLineText(genoMatch[1], 120);
        continue;
      }

      // Heuristic variety/color if no label and on line >= 1
      if (
        !variety &&
        i > 0 &&
        tok.length >= 3 &&
        tok.length <= 40 &&
        !/\d/.test(tok) &&
        !/^(?:unknown|none)$/i.test(tok)
      ) {
        variety = tok;
        continue;
      }

      if (tok && tok !== name) {
        extraParts.push(tok);
      }
    }
  }

  // Extract parenthetical tattoo if embedded in name e.g. "Oakridge Barnaby (OR-101)"
  const parenTag = name.match(/^(.+?)\s*\(([A-Za-z0-9#-]{2,20})\)\s*$/);
  if (parenTag && !tattoo) {
    name = parenTag[1].trim();
    tattoo = parenTag[2].trim();
  }

  return {
    name: sanitizeSingleLineText(name || tattoo || 'Imported Ancestor', 140),
    tattoo,
    variety,
    breed,
    weightGrams,
    birthDateIso,
    registrationNumber,
    grandChampionNumber,
    legsCount,
    genotypeRaw,
    sex,
    notes: extraParts.length > 0 && joined.length <= 300 ? '' : sanitizePlainText(extraParts.join(' · '), 500),
    isUnknown: false,
  };
}

function normalizeSexLoose(raw: string | undefined, fallback: BiologicalSex = 'Unknown'): BiologicalSex {
  const s = (raw || '').trim().toLowerCase();
  if (!s) return fallback;
  if (
    /^(?:m|male|buck|ram|bull|boar|stallion|stud|rooster|cock|drake|gander|tom|billy|jack|hob|dog|sire)$/.test(
      s
    ) ||
    /\b(?:male|buck|ram|bull|boar|stallion|sire)\b/.test(s)
  ) {
    return 'Male';
  }
  if (
    /^(?:f|female|doe|ewe|cow|heifer|sow|gilt|mare|hen|duck|goose|queen|nanny|jenny|jill|bitch|dam)$/.test(
      s
    ) ||
    /\b(?:female|doe|ewe|cow|heifer|sow|mare|dam)\b/.test(s)
  ) {
    return 'Female';
  }
  return fallback;
}

function detectSpeciesFromText(
  rawText: string,
  fileName: string,
  fallbackSpecies: string
): string {
  const combined = `${fileName} ${rawText.slice(0, 2500)}`.toLowerCase();
  for (const preset of PREDEFINED_SPECIES_PRESETS) {
    const pLower = preset.name.toLowerCase();
    if (combined.includes(pLower)) return preset.name;
  }
  if (/\b(?:arba|kindling|hutch|holland lop|mini rex|netherland dwarf|lionhead|new zealand)\b/.test(combined)) {
    return 'Rabbit';
  }
  if (/\b(?:kidding|adga|nigerian dwarf|boer|nubian|lamancha|alpine|saanen|wether)\b/.test(combined)) {
    return 'Goat';
  }
  if (/\b(?:lambing|ewe|ram|suffolk|dorper|katahdin|hampshire)\b/.test(combined)) {
    return 'Sheep';
  }
  if (/\b(?:calving|heifer|bull|steer|angus|hereford|holstein|simmental)\b/.test(combined)) {
    return 'Cattle';
  }
  if (/\b(?:farrowing|boar|sow|gilt|berkshire|duroc|yorkshire|kunekune)\b/.test(combined)) {
    return 'Swine / Pig';
  }
  if (/\b(?:cavy|cavies|guinea pig|abyssinian|american cavy|peruvian|silkie|teddy)\b/.test(combined)) {
    return 'Guinea Pig';
  }
  return fallbackSpecies || 'Rabbit';
}

interface HtmlTableCell {
  textLines: string[];
  rowspan: number;
  colspan: number;
}

function parseHtmlTables(html: string): HtmlTableCell[][][] {
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  const tables: HtmlTableCell[][][] = [];
  const tableRegex = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch: RegExpExecArray | null;

  while ((tableMatch = tableRegex.exec(clean)) !== null) {
    const tableBody = tableMatch[1];
    const rows: HtmlTableCell[][] = [];
    const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch: RegExpExecArray | null;

    while ((trMatch = trRegex.exec(tableBody)) !== null) {
      const rowHtml = trMatch[1];
      const cells: HtmlTableCell[] = [];
      const tdRegex = /<(t[dh])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
      let tdMatch: RegExpExecArray | null;

      while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
        const attrs = tdMatch[2] || '';
        const inner = tdMatch[3] || '';
        const rsMatch = attrs.match(/rowspan\s*=\s*["']?(\d+)/i);
        const csMatch = attrs.match(/colspan\s*=\s*["']?(\d+)/i);
        const rowspan = Math.max(1, Math.min(256, Number(rsMatch?.[1] || 1) || 1));
        const colspan = Math.max(1, Math.min(32, Number(csMatch?.[1] || 1) || 1));
        cells.push({
          textLines: htmlFragmentToLines(inner),
          rowspan,
          colspan,
        });
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length > 0) tables.push(rows);
  }

  return tables;
}

function parseEvansHtmlEntry(
  entry: VirtualArchiveEntry,
  speciesName: string,
  createAnimalRecord: (
    meta: ParsedCellMeta,
    seedHint: string,
    defaultBreed?: string
  ) => Animal,
  linkParent: (child: Animal, role: 'sire' | 'dam', parent: Animal) => void
): { animalsImported: number; ancestorLinks: number } {
  const html = entry.textContent || '';
  if (!html.trim()) return { animalsImported: 0, ancestorLinks: 0 };

  let animalsImported = 0;
  let ancestorLinks = 0;

  // Extract subject header lines outside pedigree table
  const withoutTables = html.replace(/<table\b[\s\S]*?<\/table>/gi, '\n');
  const bodyLines = htmlFragmentToLines(withoutTables);

  // Extract title hint
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const titleText = titleMatch ? decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : '';

  const subjectMeta = parseAncestorTextLines(bodyLines, 'Unknown');
  if (!subjectMeta.name || subjectMeta.name === 'Imported Ancestor') {
    const titleNameMatch = titleText.match(/pedigree\s*(?:-|for|:)\s*([^(]+?)(?:\s*\(([^)]+)\))?$/i);
    if (titleNameMatch) {
      subjectMeta.name = sanitizeSingleLineText(titleNameMatch[1].trim(), 140);
      if (!subjectMeta.tattoo && titleNameMatch[2]) {
        subjectMeta.tattoo = sanitizeSingleLineText(titleNameMatch[2].trim(), 60);
      }
    }
  }

  // Try parsing breed & variety from combined "Breed & Variety:" line
  for (const line of bodyLines) {
    const bvMatch = line.match(/breed\s*(?:&|and)?\s*variety\s*:\s*(.+)$/i);
    if (bvMatch) {
      const val = bvMatch[1].trim();
      if (!subjectMeta.breed && val) {
        const parts = val.split(/\s+-\s+|\s*,\s*/);
        subjectMeta.breed = parts[0].trim();
        if (parts[1] && !subjectMeta.variety) subjectMeta.variety = parts[1].trim();
      }
    }
  }

  const parsedTables = parseHtmlTables(html);
  // Select largest table with >= 4 rows (the pedigree tree table)
  const treeTable = parsedTables
    .filter((t) => t.length >= 4)
    .sort((a, b) => b.length - a.length)[0];

  if (!treeTable) {
    // No multi-row pedigree table, but if subject block has usable fields, import subject alone
    if (!subjectMeta.isUnknown && subjectMeta.name) {
      createAnimalRecord(subjectMeta, `${entry.entryPath}-subject`);
      animalsImported++;
    }
    return { animalsImported, ancestorLinks };
  }

  // Drop pure <th> header rows if row 0 is headers ("Parents (Gen 1)", etc.)
  let dataRows = treeTable;
  if (
    dataRows.length > 4 &&
    dataRows[0].every((c) => c.rowspan === 1) &&
    dataRows[0].some((c) => /gen\s*1|parents|sire|grandparents/i.test(c.textLines.join(' ')))
  ) {
    dataRows = dataRows.slice(1);
  }

  // Reconstruct 2D rowspan/colspan occupancy matrix
  interface GridSlot {
    cell: HtmlTableCell;
    originRow: number;
    originCol: number;
  }
  const numRows = dataRows.length;
  const occupied: Array<Array<GridSlot | undefined>> = Array.from({ length: numRows }, () => []);
  let maxCols = 0;

  for (let r = 0; r < numRows; r++) {
    let colCursor = 0;
    for (const cell of dataRows[r]) {
      while (occupied[r][colCursor]) colCursor++;
      const slot: GridSlot = { cell, originRow: r, originCol: colCursor };
      for (let dr = 0; dr < cell.rowspan && r + dr < numRows; dr++) {
        for (let dc = 0; dc < cell.colspan; dc++) {
          occupied[r + dr][colCursor + dc] = slot;
        }
      }
      colCursor += cell.colspan;
      if (colCursor > maxCols) maxCols = colCursor;
    }
  }

  // Detect whether column 0 is Subject (rowspan == numRows, single origin) or Gen 1 (Parents: 2 origins in col 0)
  const col0Origins = new Set<number>();
  for (let r = 0; r < numRows; r++) {
    const s = occupied[r][0];
    if (s && s.originCol === 0) col0Origins.add(s.originRow);
  }
  const hasSubjectCol = col0Origins.size === 1 && maxCols >= 3;

  let subjectAnimal: Animal | null = null;
  const cellAnimals = new Map<string, Animal>(); // `${originRow}:${originCol}` -> Animal

  if (hasSubjectCol) {
    const subSlot = occupied[0][0];
    const parsedCol0 = subSlot ? parseAncestorTextLines(subSlot.cell.textLines, 'Unknown') : null;
    const chosenMeta =
      parsedCol0 && !parsedCol0.isUnknown ? parsedCol0 : subjectMeta;
    if (!chosenMeta.isUnknown && chosenMeta.name) {
      subjectAnimal = createAnimalRecord(chosenMeta, `${entry.entryPath}-subject`);
      cellAnimals.set('0:0', subjectAnimal);
      animalsImported++;
    }
  } else if (!subjectMeta.isUnknown && subjectMeta.name) {
    subjectAnimal = createAnimalRecord(subjectMeta, `${entry.entryPath}-subject`);
    animalsImported++;
  } else {
    const fallbackName = sanitizeSingleLineText(
      titleText.replace(/^pedigree\s*[-:]?\s*/i, '') || entry.baseName.replace(/\.[^.]+$/, ''),
      120
    );
    subjectAnimal = createAnimalRecord(
      {
        ...subjectMeta,
        name: fallbackName || 'Imported Subject',
        isUnknown: false,
      },
      `${entry.entryPath}-subject`
    );
    animalsImported++;
  }

  const startGenCol = hasSubjectCol ? 1 : 0;
  for (let col = startGenCol; col < maxCols; col++) {
    const genDepth = col - startGenCol + 1;
    const expectedSlotSpan = Math.max(1, Math.floor(numRows / (1 << genDepth)));

    for (let r = 0; r < numRows; r++) {
      const slot = occupied[r][col];
      if (!slot || slot.originRow !== r || slot.originCol !== col) continue;

      const slotIndex =
        expectedSlotSpan > 0 ? Math.floor(r / expectedSlotSpan) : Math.floor(r);
      const defaultSex: BiologicalSex = slotIndex % 2 === 0 ? 'Male' : 'Female';
      const meta = parseAncestorTextLines(slot.cell.textLines, defaultSex);
      if (meta.isUnknown || !meta.name) continue;

      const ancAnimal = createAnimalRecord(
        meta,
        `${entry.entryPath}-g${genDepth}-s${slotIndex}`,
        subjectAnimal?.breed || ''
      );
      cellAnimals.set(`${r}:${col}`, ancAnimal);
      animalsImported++;
    }
  }

  // Link Gen 1 -> Subject
  if (subjectAnimal) {
    const half = Math.floor(numRows / 2);
    const sireSlot = occupied[0]?.[startGenCol];
    const damSlot = occupied[half]?.[startGenCol];
    const sireAnimal = sireSlot
      ? cellAnimals.get(`${sireSlot.originRow}:${sireSlot.originCol}`)
      : undefined;
    const damAnimal = damSlot
      ? cellAnimals.get(`${damSlot.originRow}:${damSlot.originCol}`)
      : undefined;
    if (sireAnimal) {
      linkParent(subjectAnimal, 'sire', sireAnimal);
      ancestorLinks++;
    }
    if (damAnimal) {
      linkParent(subjectAnimal, 'dam', damAnimal);
      ancestorLinks++;
    }
  }

  // Link Gen g -> Gen g+1
  for (let col = startGenCol; col < maxCols - 1; col++) {
    for (let r = 0; r < numRows; r++) {
      const slot = occupied[r][col];
      if (!slot || slot.originRow !== r || slot.originCol !== col) continue;
      const childAnimal = cellAnimals.get(`${r}:${col}`);
      if (!childAnimal) continue;

      const span = Math.max(2, slot.cell.rowspan);
      const nextCol = col + 1;
      const sireRow = r;
      const damRow = r + Math.floor(span / 2);

      const sireSlot = occupied[sireRow]?.[nextCol];
      const damSlot = occupied[damRow]?.[nextCol];

      const sireAnimal = sireSlot
        ? cellAnimals.get(`${sireSlot.originRow}:${sireSlot.originCol}`)
        : undefined;
      const damAnimal = damSlot
        ? cellAnimals.get(`${damSlot.originRow}:${damSlot.originCol}`)
        : undefined;

      if (sireAnimal) {
        linkParent(childAnimal, 'sire', sireAnimal);
        ancestorLinks++;
      }
      if (damAnimal) {
        linkParent(childAnimal, 'dam', damAnimal);
        ancestorLinks++;
      }
    }
  }

  // Species check reference unused variable
  void speciesName;

  return { animalsImported, ancestorLinks };
}

interface MultiGenColumnSpec {
  targetField: CsvTargetFieldKey;
  childRole: 'subject' | 'sire' | 'dam' | 'pgs' | 'pgd' | 'mgs' | 'mgd';
  linkSide: 'sire' | 'dam';
  sex: BiologicalSex;
  aliases: string[];
}

const MULTI_GEN_COLUMN_SPECS: MultiGenColumnSpec[] = [
  {
    targetField: 'sire',
    childRole: 'subject',
    linkSide: 'sire',
    sex: 'Male',
    aliases: ['sireid', 'siretattooid', 'sire', 'sirename', 'siretag', 'father', 'fatherid', 'fathername', 'buck', 'ram', 'bull', 'stallion', 'stud'],
  },
  {
    targetField: 'dam',
    childRole: 'subject',
    linkSide: 'dam',
    sex: 'Female',
    aliases: ['damid', 'damtattooid', 'dam', 'damname', 'damtag', 'mother', 'motherid', 'mothername', 'doe', 'ewe', 'cow', 'mare'],
  },
  // Gen 2
  {
    targetField: 'pgs',
    childRole: 'sire',
    linkSide: 'sire',
    sex: 'Male',
    aliases: ['pgs', 'siresire', 'siressire', 'paternalgrandsire', 'fatherfather', 'fathersfather', 'ss', 'ff', 'g2s1'],
  },
  {
    targetField: 'pgd',
    childRole: 'sire',
    linkSide: 'dam',
    sex: 'Female',
    aliases: ['pgd', 'siredam', 'siresdam', 'paternalgranddam', 'fathermother', 'fathersmother', 'sd', 'fm', 'g2d1'],
  },
  {
    targetField: 'mgs',
    childRole: 'dam',
    linkSide: 'sire',
    sex: 'Male',
    aliases: ['mgs', 'damsire', 'damssire', 'maternalgrandsire', 'motherfather', 'mothersfather', 'ds', 'mf', 'g2s2'],
  },
  {
    targetField: 'mgd',
    childRole: 'dam',
    linkSide: 'dam',
    sex: 'Female',
    aliases: ['mgd', 'damdam', 'damsdam', 'maternalgranddam', 'mothermother', 'mothersmother', 'dd', 'mm', 'g2d2'],
  },
  // Gen 3 (great-grandparents)
  { targetField: 'sss', childRole: 'pgs', linkSide: 'sire', sex: 'Male', aliases: ['sss', 'fff', 'pgssire', 'siresiresire'] },
  { targetField: 'ssd', childRole: 'pgs', linkSide: 'dam', sex: 'Female', aliases: ['ssd', 'ffm', 'pgsdam', 'siresiredam'] },
  { targetField: 'sds', childRole: 'pgd', linkSide: 'sire', sex: 'Male', aliases: ['sds', 'fmf', 'pgdsire', 'siredamsire'] },
  { targetField: 'sdd', childRole: 'pgd', linkSide: 'dam', sex: 'Female', aliases: ['sdd', 'fmm', 'pgddam', 'siredamdam'] },
  { targetField: 'dss', childRole: 'mgs', linkSide: 'sire', sex: 'Male', aliases: ['dss', 'mff', 'mgssire', 'damsiresire'] },
  { targetField: 'dsd', childRole: 'mgs', linkSide: 'dam', sex: 'Female', aliases: ['dsd', 'mfm', 'mgsdam', 'damsiredam'] },
  { targetField: 'dds', childRole: 'mgd', linkSide: 'sire', sex: 'Male', aliases: ['dds', 'mmf', 'mgdsire', 'damdamsire'] },
  { targetField: 'ddd', childRole: 'mgd', linkSide: 'dam', sex: 'Female', aliases: ['ddd', 'mmm', 'mgddam', 'damdamdam'] },
];

function createMissingSpeciesProfile(
  speciesName: string,
  sortOrder: number,
  ts: string,
  override?: CustomSpeciesImportOverride
): SpeciesProfile {
  const preset = PREDEFINED_SPECIES_PRESETS.find((p) => isSameSpecies(p.name, speciesName));
  if (preset && !override) {
    return { ...preset, sortOrder, createdAt: ts, updatedAt: ts };
  }
  const base = resolveSpeciesProfile(speciesName, []);
  return {
    ...base,
    id: preset?.id || `species-${slugifyKey(speciesName)}`,
    name: speciesName,
    sortOrder,
    gestationDays: Math.max(1, Math.round(override?.gestationDays ?? base.gestationDays)),
    weanDaysAfterBirth: Math.max(1, Math.round(override?.weanDaysAfterBirth ?? base.weanDaysAfterBirth)),
    rebreedDaysAfterBirth: Math.max(1, Math.round(override?.rebreedDaysAfterBirth ?? base.rebreedDaysAfterBirth)),
    maleLabel: (override?.maleLabel || '').trim() || base.maleLabel,
    femaleLabel: (override?.femaleLabel || '').trim() || base.femaleLabel,
    offspringLabel: (override?.offspringLabel || '').trim() || base.offspringLabel,
    birthEventLabel: (override?.birthEventLabel || '').trim() || base.birthEventLabel,
    createdAt: ts,
    updatedAt: ts,
  };
}

export const UniversalPedigreeImporter: PlatformImporter = {
  id: 'universal-pedigree',
  name: 'Universal Pedigree / Evans .HTM / Spreadsheets',
  badge: 'Evans · Kintracs · CSV · JSON',
  supportsMultiZip: true,
  acceptedExtensions: ['.htm', '.html', '.csv', '.tsv', '.txt', '.json', '.zip'],
  summary:
    'Imports Evans Software `.HTM`/`.HTML` 3-to-6-generation pedigree charts, Kintracs / ZooEasy / Hutch / Everbreed multi-generation CSV/TSV/pipe spreadsheets (UTF-8, UTF-16, or Windows-1252), and generic JSON pedigrees.',
  instructions:
    'Drop one or more Evans `.HTM`/`.HTML` pedigree files, CSV/TSV spreadsheets (even wide sheets with Sire/Dam/Grandparents columns), `.JSON` files, or `.ZIP` bundles. Binary `.PDF` or `.XLSX` files will display safe export instructions instead of crashing.',

  parse(
    inputs: RawArchiveInput[],
    existingSnapshot: BarnDatabaseSnapshot,
    options: ImporterRunOptions
  ): PlatformImportPreview {
    const ts = nowIsoUtc();
    const warnings: string[] = [];
    const archiveNames = inputs.map((i) => i.fileName);
    const diagnostics: DetectedTableDiagnostic[] = [];

    const entries = extractVirtualEntries(inputs);
    const workingSpeciesProfiles: SpeciesProfile[] = [...existingSnapshot.speciesProfiles];
    const newSpeciesProfiles: SpeciesProfile[] = [];
    const speciesDetectedSet = new Set<string>();

    const ensureSpecies = (rawSpecies: string | undefined, hintText: string, fileName: string): SpeciesProfile => {
      const candidate =
        (rawSpecies || '').trim() ||
        detectSpeciesFromText(hintText, fileName, options.fallbackSpeciesName || 'Rabbit');
      speciesDetectedSet.add(candidate);
      const existing = workingSpeciesProfiles.find((p) => isSameSpecies(p.name, candidate));
      if (existing) return existing;
      const override = options.customSpeciesOverrides?.[candidate.trim().toLowerCase()];
      const created = createMissingSpeciesProfile(
        candidate,
        workingSpeciesProfiles.length,
        ts,
        override
      );
      workingSpeciesProfiles.push(created);
      newSpeciesProfiles.push(created);
      return created;
    };

    const animalsById = new Map<string, Animal>();
    const matchedExistingByAnimalId = new Map<string, PreexistingAnimalMatch>();
    const animalLookup = new Map<string, string>();
    const resolvedRealAnimalIds = new Set<string>();
    const csvTables: CsvTableMappingSummary[] = [];
    const unresolvedParentLinks: UnresolvedParentLink[] = [];
    let parentLinksResolved = 0;
    let placeholderAncestorsCreated = 0;

    interface PendingCsvParentRow {
      entryPath: string;
      rowNumber: number;
      row: Record<string, string>;
      resolution: CsvTableColumnResolution;
      subject: Animal;
      species: string;
      breed: string;
    }
    const pendingCsvParentRows: PendingCsvParentRow[] = [];

    const existingBarnById = new Map<string, Animal>();
    const existingBarnLookup = new Map<string, Animal>();
    const existingBarnNameCounts = new Map<string, number>();
    for (const ex of existingSnapshot.animals) {
      existingBarnById.set(ex.id, ex);
      const spKey = ex.species.trim().toLowerCase();
      const nameClean = (ex.name || '').trim().toLowerCase();
      if (nameClean) {
        const nk = `${spKey}::${nameClean}`;
        existingBarnNameCounts.set(nk, (existingBarnNameCounts.get(nk) || 0) + 1);
      }
    }
    for (const ex of existingSnapshot.animals) {
      const spKey = ex.species.trim().toLowerCase();
      const regClean = (ex.registrationNumber || '').trim().toLowerCase();
      const tatClean = (ex.tattoo || '').trim().toLowerCase();
      const idClean = (ex.id || '').trim().toLowerCase();
      const nameClean = (ex.name || '').trim().toLowerCase();
      if (idClean && !existingBarnLookup.has(`${spKey}::id::${idClean}`)) {
        existingBarnLookup.set(`${spKey}::id::${idClean}`, ex);
      }
      if (regClean && !existingBarnLookup.has(`${spKey}::reg::${regClean}`)) {
        existingBarnLookup.set(`${spKey}::reg::${regClean}`, ex);
      }
      if (tatClean && !existingBarnLookup.has(`${spKey}::tat::${tatClean}`)) {
        existingBarnLookup.set(`${spKey}::tat::${tatClean}`, ex);
      }
      if (
        nameClean &&
        (existingBarnNameCounts.get(`${spKey}::${nameClean}`) || 0) === 1 &&
        !existingBarnLookup.has(`${spKey}::name::${nameClean}`)
      ) {
        existingBarnLookup.set(`${spKey}::name::${nameClean}`, ex);
      }
    }

    const findExistingBarnParent = (
      species: string,
      tokens: Array<string | undefined>
    ): Animal | undefined => {
      const spKey = species.trim().toLowerCase();
      for (const rawTok of tokens) {
        const clean = (rawTok || '').trim().toLowerCase();
        if (!clean) continue;
        const hit =
          existingBarnLookup.get(`${spKey}::id::${clean}`) ||
          existingBarnLookup.get(`${spKey}::reg::${clean}`) ||
          existingBarnLookup.get(`${spKey}::tat::${clean}`) ||
          existingBarnLookup.get(`${spKey}::name::${clean}`);
        if (hit) return hit;
      }
      return undefined;
    };

    const registerToken = (species: string, token: string | undefined, id: string) => {
      const clean = (token || '').trim().toLowerCase();
      if (!clean) return;
      const key = `${species.trim().toLowerCase()}::${clean}`;
      if (!animalLookup.has(key)) animalLookup.set(key, id);
    };

    const resolveOrInsertAnimal = (
      species: string,
      meta: ParsedCellMeta & {
        status?: Animal['status'];
        archived?: boolean;
        cageLocation?: string;
        breederName?: string;
        ownerName?: string;
      },
      seedHint: string,
      defaultBreed = '',
      markAsRealSubject = false
    ): Animal => {
      const spLower = species.trim().toLowerCase();
      const lookupCandidates = [meta.tattoo, meta.registrationNumber, meta.name]
        .map((t) => (t || '').trim().toLowerCase())
        .filter((t) => t.length > 0 && t !== 'imported ancestor');

      for (const tok of lookupCandidates) {
        const hitId = animalLookup.get(`${spLower}::${tok}`);
        if (hitId) {
          const existing = animalsById.get(hitId);
          if (existing) {
            if (!existing.tattoo && meta.tattoo) existing.tattoo = meta.tattoo;
            if (!existing.variety && meta.variety) existing.variety = meta.variety;
            if (!existing.breed && (meta.breed || defaultBreed)) existing.breed = meta.breed || defaultBreed;
            if (!existing.birthDateIso && meta.birthDateIso) existing.birthDateIso = meta.birthDateIso;
            if (!existing.weightGrams && meta.weightGrams) existing.weightGrams = meta.weightGrams;
            if (!existing.registrationNumber && meta.registrationNumber) existing.registrationNumber = meta.registrationNumber;
            if (!existing.grandChampionNumber && meta.grandChampionNumber) existing.grandChampionNumber = meta.grandChampionNumber;
            if (!existing.legsCount && meta.legsCount) existing.legsCount = meta.legsCount;
            if (!existing.cageLocation && meta.cageLocation) existing.cageLocation = meta.cageLocation;
            if (!existing.breederName && meta.breederName) existing.breederName = meta.breederName;
            if (!existing.ownerName && meta.ownerName) existing.ownerName = meta.ownerName;
            if (!existing.genotypeRaw && meta.genotypeRaw) {
              existing.genotypeRaw = meta.genotypeRaw;
              existing.genotype = parseGenotypeString(meta.genotypeRaw, species);
            }
            if (existing.sex === 'Unknown' && meta.sex !== 'Unknown') existing.sex = meta.sex;
            if (markAsRealSubject) resolvedRealAnimalIds.add(existing.id);
            return existing;
          }
        }
      }

      const detId = deterministicEntityId(
        'univ',
        species,
        meta.tattoo || meta.registrationNumber || meta.name || seedHint
      );
      const preexisting = findPreexistingAnimalMatch(existingSnapshot.animals, {
        species,
        candidateDeterministicId: detId,
        tattoo: meta.tattoo,
        registrationNumber: meta.registrationNumber,
        name: meta.name,
        birthDateIso: meta.birthDateIso,
      });

      const finalId = preexisting ? preexisting.animal.id : detId;
      if (preexisting && !matchedExistingByAnimalId.has(finalId)) {
        matchedExistingByAnimalId.set(finalId, preexisting);
      }

      const resolvedStatus = meta.status ?? 'Active';
      const resolvedArchived =
        meta.archived !== undefined ? meta.archived : isAnimalArchived({ status: resolvedStatus });

      const created: Animal = {
        id: finalId,
        tattoo: meta.tattoo,
        name: meta.name || meta.tattoo || 'Imported Animal',
        species,
        breed: meta.breed || defaultBreed,
        variety: meta.variety,
        sex: meta.sex,
        status: resolvedStatus,
        archived: resolvedArchived,
        birthDateIso: meta.birthDateIso,
        weightGrams: meta.weightGrams,
        genotype: meta.genotypeRaw ? parseGenotypeString(meta.genotypeRaw, species) : [],
        genotypeRaw: meta.genotypeRaw,
        registrationNumber: meta.registrationNumber,
        grandChampionNumber: meta.grandChampionNumber,
        legsCount: meta.legsCount,
        cageLocation: meta.cageLocation || '',
        breederName: meta.breederName || '',
        ownerName: meta.ownerName || '',
        sireId: '',
        damId: '',
        notes: meta.notes,
        createdAt: preexisting?.animal.createdAt || ts,
        updatedAt: ts,
      };
      animalsById.set(finalId, created);
      if (markAsRealSubject || preexisting) {
        resolvedRealAnimalIds.add(finalId);
      }
      registerToken(species, meta.tattoo, finalId);
      registerToken(species, meta.registrationNumber, finalId);
      registerToken(species, meta.name, finalId);
      return created;
    };

    const linkParentSafe = (
      child: Animal,
      role: 'sire' | 'dam',
      parent: Pick<Animal, 'id'>
    ) => {
      if (child.id === parent.id) return;
      if (role === 'sire' && child.sireId !== parent.id) {
        child.sireId = parent.id;
        parentLinksResolved++;
      } else if (role === 'dam' && child.damId !== parent.id) {
        child.damId = parent.id;
        parentLinksResolved++;
      }
    };

    const binaryUnsupportedNames: string[] = [];

    for (const entry of entries) {
      if (entry.isMediaOrBinary) {
        if (!entry.imageBytes) {
          binaryUnsupportedNames.push(entry.baseName);
        }
        continue;
      }

      const text = entry.textContent || '';
      const trimmed = text.trim();
      if (!trimmed) {
        warnings.push(`Skipped empty file "${entry.baseName}".`);
        continue;
      }

      // 1. HTML / Evans `.HTM` pedigree
      if (
        entry.extension === 'htm' ||
        entry.extension === 'html' ||
        /<(?:html|table|tr|td)\b/i.test(trimmed.slice(0, 1200))
      ) {
        const sp = ensureSpecies(undefined, text, entry.baseName);
        const res = parseEvansHtmlEntry(
          entry,
          sp.name,
          (meta, seedHint, defaultBreed) =>
            resolveOrInsertAnimal(sp.name, meta, seedHint, defaultBreed),
          linkParentSafe
        );
        diagnostics.push({
          archiveName: entry.archiveName,
          entryPath: entry.entryPath,
          classification: 'animals',
          rowCount: res.animalsImported,
          headers: ['Evans / HTML Pedigree Tree'],
          matchedColumns: ['Evans / HTML Pedigree Tree'],
          unmappedColumns: [],
        });
        if (res.animalsImported === 0) {
          warnings.push(
            `Could not locate an animal or pedigree table inside "${entry.baseName}". Verify it is an exported pedigree HTML page rather than a login/redirect page.`
          );
        }
        continue;
      }

      // 2. JSON (flat arrays or nested pedigree tree `{ name, sire: {...}, dam: {...} }`)
      if (entry.extension === 'json' || trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          const sp = ensureSpecies(undefined, trimmed, entry.baseName);

          const ingestTreeNode = (
            node: unknown,
            fallbackSex: BiologicalSex,
            depth: number,
            seed: string
          ): Animal | null => {
            if (depth > 8 || !node || typeof node !== 'object' || Array.isArray(node)) return null;
            const obj = node as Record<string, unknown>;
            const rawName = sanitizeSingleLineText(
              obj.name ?? obj.animalName ?? obj.registeredName ?? obj.callName ?? '',
              140
            );
            const rawTag = sanitizeSingleLineText(
              obj.tattoo ?? obj.earTag ?? obj.tag ?? obj.id ?? '',
              60
            );
            if (!rawName && !rawTag) return null;
            const nodeSpecies = ensureSpecies(
              typeof obj.species === 'string' ? obj.species : undefined,
              rawName,
              entry.baseName
            ).name;
            const animal = resolveOrInsertAnimal(
              nodeSpecies,
              {
                name: rawName || rawTag,
                tattoo: rawTag,
                variety: sanitizeSingleLineText(obj.variety ?? obj.color ?? '', 100),
                breed: sanitizeSingleLineText(obj.breed ?? '', 100),
                weightGrams: parseFlexibleWeightToGrams(
                  obj.weight !== undefined ? String(obj.weight) : undefined,
                  typeof obj.weightUnit === 'string' ? obj.weightUnit : undefined
                ),
                birthDateIso: normalizeFlexibleDateIso(
                  String(obj.birthDateIso ?? obj.birthDate ?? obj.dob ?? '')
                ),
                registrationNumber: sanitizeSingleLineText(
                  obj.registrationNumber ?? obj.regNumber ?? obj.reg ?? '',
                  60
                ),
                grandChampionNumber: sanitizeSingleLineText(obj.grandChampionNumber ?? obj.gc ?? '', 60),
                legsCount: Math.max(0, Number(obj.legsCount ?? obj.legs) || 0),
                genotypeRaw: sanitizeSingleLineText(obj.genotypeRaw ?? obj.genotype ?? '', 120),
                sex: normalizeSexLoose(
                  typeof obj.sex === 'string' ? obj.sex : typeof obj.gender === 'string' ? obj.gender : '',
                  fallbackSex
                ),
                notes: sanitizePlainText(obj.notes ?? '', 10_000),
                isUnknown: false,
              },
              seed
            );

            if (obj.sire && typeof obj.sire === 'object') {
              const sireNode = ingestTreeNode(obj.sire, 'Male', depth + 1, `${seed}-s`);
              if (sireNode) linkParentSafe(animal, 'sire', sireNode);
            }
            if (obj.dam && typeof obj.dam === 'object') {
              const damNode = ingestTreeNode(obj.dam, 'Female', depth + 1, `${seed}-d`);
              if (damNode) linkParentSafe(animal, 'dam', damNode);
            }
            return animal;
          };

          const rootNodes: unknown[] = Array.isArray(parsed)
            ? parsed
            : Array.isArray((parsed as Record<string, unknown>).animals)
            ? ((parsed as Record<string, unknown>).animals as unknown[])
            : [parsed];

          let jsonCount = 0;
          rootNodes.forEach((n, idx) => {
            if (ingestTreeNode(n, 'Unknown', 0, `${entry.entryPath}-${idx}`)) {
              jsonCount++;
            }
          });
          diagnostics.push({
            archiveName: entry.archiveName,
            entryPath: entry.entryPath,
            classification: 'animals',
            rowCount: jsonCount,
            headers: ['JSON Pedigree'],
            matchedColumns: ['JSON Pedigree'],
            unmappedColumns: [],
          });
          if (jsonCount === 0) {
            warnings.push(
              `JSON file "${entry.baseName}" contained no recognizable animal or pedigree objects.`
            );
          }
          void sp;
          continue;
        } catch {
          warnings.push(
            `File "${entry.baseName}" could not be parsed as valid JSON (check for truncated download or stray text).`
          );
          continue;
        }
      }

      // 3. Delimited spreadsheet (CSV / TSV / Pipe / Semicolon) — Pass 1: subject rows + column mapping
      try {
        const { headers, rows } = parseDelimitedTable(text);
        if (headers.length === 0 || rows.length === 0) {
          warnings.push(`Spreadsheet "${entry.baseName}" contained no data rows.`);
          continue;
        }

        const resolution = resolveCsvColumnAssignments(
          headers,
          rows,
          options.csvColumnMapping,
          entry.entryPath
        );
        csvTables.push({
          archiveName: entry.archiveName,
          entryPath: entry.entryPath,
          rowCount: rows.length,
          columns: resolution.columns,
        });

        const pickField = (row: Record<string, string>, field: CsvTargetFieldKey): string => {
          const matchedHeaders = resolution.headersByField.get(field);
          if (!matchedHeaders || matchedHeaders.length === 0) return '';
          for (const hdr of matchedHeaders) {
            const val = (row[hdr] || '').trim();
            if (val) return val;
          }
          return '';
        };

        rows.forEach((row, rIdx) => {
          const spRaw = pickField(row, 'species');
          const sp = ensureSpecies(spRaw, headers.join(' '), entry.baseName);

          const name = pickField(row, 'name');
          const tattoo = pickField(row, 'tattoo');
          if (!name && !tattoo) return;

          const breed = pickField(row, 'breed');
          const variety = pickField(row, 'variety');
          const sex = normalizeSexLoose(pickField(row, 'sex'));
          const birthDateIso = normalizeFlexibleDateIso(pickField(row, 'birthDateIso'));
          const wtUnit = pickField(row, 'weightUnit');
          const weightGrams = parseFlexibleWeightToGrams(pickField(row, 'weight'), wtUnit);
          const regNum = pickField(row, 'registrationNumber');
          const gcNum = pickField(row, 'grandChampionNumber');
          const legs = Math.max(0, Number(pickField(row, 'legsCount')) || 0);
          const genotypeRaw = pickField(row, 'genotypeRaw');
          const rawStatus = pickField(row, 'status');
          const status = rawStatus ? normalizeAnimalStatus(rawStatus) : 'Active';
          const cageLocation = sanitizeSingleLineText(pickField(row, 'cageLocation'), 100);
          const breederName = sanitizeSingleLineText(pickField(row, 'breederName'), 140);
          const ownerName = sanitizeSingleLineText(pickField(row, 'ownerName'), 140);
          const notes = pickField(row, 'notes');

          const subject = resolveOrInsertAnimal(
            sp.name,
            {
              name: name || tattoo,
              tattoo,
              variety,
              breed,
              weightGrams,
              birthDateIso,
              registrationNumber: regNum,
              grandChampionNumber: gcNum,
              legsCount: legs,
              genotypeRaw,
              sex,
              status,
              archived: isAnimalArchived({ status }),
              cageLocation,
              breederName,
              ownerName,
              notes,
              isUnknown: false,
            },
            `${entry.entryPath}-r${rIdx}`,
            '',
            true
          );

          pendingCsvParentRows.push({
            entryPath: entry.entryPath,
            rowNumber: rIdx + 1,
            row,
            resolution,
            subject,
            species: sp.name,
            breed,
          });
        });

        diagnostics.push({
          archiveName: entry.archiveName,
          entryPath: entry.entryPath,
          classification: 'animals',
          rowCount: rows.length,
          headers,
          matchedColumns: resolution.matchedColumns,
          unmappedColumns: resolution.unmappedColumns,
        });
      } catch (tableErr) {
        warnings.push(
          `Could not parse "${entry.baseName}": ${tableErr instanceof Error ? tableErr.message : 'Invalid file format.'}`
        );
      }
    }

    // Pass 2: Resolve CSV Sire/Dam & multi-gen ancestor links after all subject rows are indexed
    const createPlaceholdersForUnlinked = options.createPlaceholderAncestorsForUnlinked !== false;
    for (const item of pendingCsvParentRows) {
      const pickItemField = (field: CsvTargetFieldKey): string => {
        const matchedHeaders = item.resolution.headersByField.get(field);
        if (!matchedHeaders || matchedHeaders.length === 0) return '';
        for (const hdr of matchedHeaders) {
          const val = (item.row[hdr] || '').trim();
          if (val) return val;
        }
        return '';
      };

      const roleAnimals: Record<
        'subject' | 'sire' | 'dam' | 'pgs' | 'pgd' | 'mgs' | 'mgd',
        Pick<Animal, 'id'> | undefined
      > = {
        subject: item.subject,
        sire: undefined,
        dam: undefined,
        pgs: undefined,
        pgd: undefined,
        mgs: undefined,
        mgd: undefined,
      };

      for (const spec of MULTI_GEN_COLUMN_SPECS) {
        const rawAncRef = pickItemField(spec.targetField);
        if (!rawAncRef || /^(?:unknown|none|n\/a|na|-|0)$/i.test(rawAncRef)) continue;
        const childTarget = roleAnimals[spec.childRole];
        if (!childTarget) continue;

        const childAnimal = animalsById.get(childTarget.id);
        if (!childAnimal) continue;

        const ancMeta = parseAncestorTextLines([rawAncRef], spec.sex);
        if (ancMeta.isUnknown || !ancMeta.name) continue;

        const spLower = item.species.trim().toLowerCase();
        const candidateTokens = [
          ancMeta.tattoo,
          ancMeta.registrationNumber,
          ancMeta.name,
          rawAncRef,
        ]
          .map((t) => (t || '').trim().toLowerCase())
          .filter((t) => t.length > 0 && t !== 'imported ancestor');

        let matchedRealAnimal: Animal | undefined;
        let matchedPlaceholderId: string | undefined;

        for (const tok of candidateTokens) {
          const hitId = animalLookup.get(`${spLower}::${tok}`);
          if (hitId) {
            if (resolvedRealAnimalIds.has(hitId)) {
              matchedRealAnimal = animalsById.get(hitId);
              break;
            }
            if (!matchedPlaceholderId) {
              matchedPlaceholderId = hitId;
            }
          }
        }

        if (!matchedRealAnimal) {
          matchedRealAnimal = findExistingBarnParent(item.species, [
            ancMeta.tattoo,
            ancMeta.registrationNumber,
            ancMeta.name,
            rawAncRef,
          ]);
        }

        let resolvedParentTarget: Pick<Animal, 'id'> | undefined = matchedRealAnimal;

        if (!resolvedParentTarget) {
          if (createPlaceholdersForUnlinked) {
            const alreadyCount = animalsById.size;
            const placeholderAnimal = matchedPlaceholderId
              ? animalsById.get(matchedPlaceholderId)
              : resolveOrInsertAnimal(
                  item.species,
                  ancMeta,
                  `${item.entryPath}-r${item.rowNumber}-${spec.childRole}-${spec.linkSide}`,
                  item.breed,
                  false
                );
            if (animalsById.size > alreadyCount) {
              placeholderAncestorsCreated++;
            }
            if (placeholderAnimal) {
              registerToken(item.species, rawAncRef, placeholderAnimal.id);
              resolvedParentTarget = placeholderAnimal;
            }
          }

          if (spec.childRole === 'subject') {
            unresolvedParentLinks.push({
              entryPath: item.entryPath,
              rowNumber: item.rowNumber,
              childAnimalId: item.subject.id,
              childName: item.subject.name,
              childTattoo: item.subject.tattoo,
              species: item.species,
              role: spec.linkSide,
              rawReference: rawAncRef,
              placeholderCreated: Boolean(resolvedParentTarget),
              placeholderAnimalId: resolvedParentTarget?.id,
            });
          }
        }

        if (!resolvedParentTarget) continue;

        linkParentSafe(childAnimal, spec.linkSide, resolvedParentTarget);

        if (spec.childRole === 'subject' && spec.linkSide === 'sire') roleAnimals.sire = resolvedParentTarget;
        else if (spec.childRole === 'subject' && spec.linkSide === 'dam') roleAnimals.dam = resolvedParentTarget;
        else if (spec.childRole === 'sire' && spec.linkSide === 'sire') roleAnimals.pgs = resolvedParentTarget;
        else if (spec.childRole === 'sire' && spec.linkSide === 'dam') roleAnimals.pgd = resolvedParentTarget;
        else if (spec.childRole === 'dam' && spec.linkSide === 'sire') roleAnimals.mgs = resolvedParentTarget;
        else if (spec.childRole === 'dam' && spec.linkSide === 'dam') roleAnimals.mgd = resolvedParentTarget;
      }
    }

    if (binaryUnsupportedNames.length > 0) {
      const sample = binaryUnsupportedNames.slice(0, 4).join(', ');
      warnings.push(
        `Skipped unsupported binary file(s) (${sample}). For Excel (.XLSX/.XLS), save as CSV or UTF-8 CSV; for desktop programs (Evans/Kintracs/ZooEasy), export .HTM/.HTML pedigrees or CSV/TSV tables.`
      );
    }

    const allKnownAnimalsById = new Map<string, Animal>();
    for (const ex of existingSnapshot.animals) allKnownAnimalsById.set(ex.id, ex);
    for (const inc of animalsById.values()) {
      if (!allKnownAnimalsById.has(inc.id)) allKnownAnimalsById.set(inc.id, inc);
    }

    const conflicts: AnimalImportConflict[] = [];
    for (const [animalId, match] of matchedExistingByAnimalId.entries()) {
      const inc = animalsById.get(animalId);
      if (!inc) continue;
      const contradictions = buildAnimalContradictions(match.animal, inc, {
        preferredUnit: existingSnapshot.settings.preferredUnit,
        speciesProfiles: workingSpeciesProfiles,
        allKnownAnimalsById,
      });
      if (contradictions.length > 0) {
        conflicts.push({
          animalId,
          species: match.animal.species,
          displayName: match.animal.name || inc.name,
          displayTag: match.animal.tattoo || inc.tattoo,
          matchedBy: match.matchedBy,
          existingAnimal: match.animal,
          incomingAnimal: inc,
          contradictions,
        });
      }
    }

    const reportLines: string[] = [
      `Importer: ${this.name}`,
      `Files (${archiveNames.length}): ${archiveNames.join(', ')}`,
      `Animals & Ancestors Parsed: ${animalsById.size} (${parentLinksResolved} parent links resolved)`,
      ...diagnostics.map(
        (d) =>
          `- [${d.classification}] ${d.entryPath} (${d.rowCount} items) | Matched: ${d.matchedColumns.join(', ')}`
      ),
    ];

    return {
      platformId: this.id,
      platformName: this.name,
      archiveNames,
      diagnostics,
      stagedPhotos: [],
      stagedPhotosRawBytes: 0,
      missingPhotoZipRefsCount: 0,
      deferredMediaCount: 0,
      deferredMediaBytes: 0,
      deferredMediaSampleNames: [],
      deferredManifestRowCount: 0,
      animalsWithMultipleImagesCount: 0,
      warnings,
      speciesDetected: Array.from(speciesDetectedSet),
      newSpeciesProfiles,
      animals: Array.from(animalsById.values()),
      matchedExistingAnimalsCount: matchedExistingByAnimalId.size,
      conflicts,
      parentLinksResolved,
      placeholderAncestorsCreated,
      cages: [],
      breedings: [],
      tasks: [],
      careLogs: [],
      shows: [],
      csvTables,
      unresolvedParentLinks,
      schemaDiagnosticReport: reportLines.join('\n'),
    };
  },
};
```

<!-- END OF PART 13 OF 16 (25 files) -->
