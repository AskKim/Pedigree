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
