import { describe, expect, it } from 'vitest';
import {
  exportBarnJournalCsv,
  exportBarnJournalMarkdown,
  filterAndSearchJournalEntries,
  generateBarnJournalHtml,
  groupJournalEntriesByMonthAndDate,
  normalizeBarnJournalEntry,
  normalizeJournalTags,
  summarizeJournalStats,
} from '../barnJournal';
import { BarnJournalEntry } from '../models';
import { makeAnimal } from './testFixtures';

describe('barnJournal — tag hygiene, rich notes, full-text search, grouping & exports', () => {
  const doe = makeAnimal('a-doe', { name: 'Clover', tattoo: 'CLV-9', breed: 'Holland Lop' });

  const entries: BarnJournalEntry[] = [
    {
      id: 'j-1',
      species: 'Rabbit',
      entryDateIso: '2026-11-20',
      title: 'Winter Coat & Nestbox Prep',
      body: '## Checklist\n- [x] Deep clean **nestbox**\n- [ ] Weigh kits on Day 14',
      colorCategory: 'sage',
      starRating: 5,
      tags: ['winter', 'kindling'],
      pinned: true,
      linkedAnimalIds: [doe.id],
      createdAt: '2026-11-20T10:00:00Z',
      updatedAt: '2026-11-20T11:00:00Z',
    },
    {
      id: 'j-2',
      species: 'Rabbit',
      entryDateIso: '2026-11-20',
      title: 'Feed Lot Observation',
      body: 'Switched pelleted ration to fresh November mill batch.',
      colorCategory: 'amber',
      starRating: 3,
      tags: ['nutrition'],
      pinned: false,
      createdAt: '2026-11-20T15:00:00Z',
      updatedAt: '2026-11-20T15:00:00Z',
    },
    {
      id: 'j-3',
      species: 'Rabbit',
      entryDateIso: '2026-10-08',
      title: 'District Show Grooming Notes',
      body: 'Focus on crown density & clean <script>alert(1)</script> hocks.',
      colorCategory: 'sky',
      starRating: 4,
      tags: ['show-prep'],
      pinned: false,
      createdAt: '2026-10-08T09:00:00Z',
      updatedAt: '2026-10-08T09:00:00Z',
    },
  ];

  it('normalizes tags without # prefixes, deduplicates case-insensitively, and sanitizes journal entries safely', () => {
    expect(normalizeJournalTags('#Winter, winter,  #ShowPrep , , #Nutrition')).toEqual([
      'Winter',
      'ShowPrep',
      'Nutrition',
    ]);

    expect(normalizeBarnJournalEntry({ id: '' })).toBeNull();
    const cleaned = normalizeBarnJournalEntry({
      id: 'j-norm',
      species: 'Goat',
      entryDateIso: '2026-11-15',
      title: '<b>Morning</b>\nCheck',
      body: 'Line 1\u0000\n- [ ] Check water',
      colorCategory: 'unknown-color',
      starRating: 9,
      tags: ['#Hoof', 'hoof'],
      pinned: true,
      linkedAnimalIds: ['a-1', 'a-1', ' '],
    });
    expect(cleaned).not.toBeNull();
    expect(cleaned?.colorCategory).toBe('sage');
    expect(cleaned?.starRating).toBe(5);
    expect(cleaned?.tags).toEqual(['Hoof']);
    expect(cleaned?.linkedAnimalIds).toEqual(['a-1']);
    expect(cleaned?.body).not.toContain('\u0000');
  });

  it('filters by multi-token full-text search (title, body, tags, linked animal, category) and sorts pinned first', () => {
    // Search matching linked animal tattoo + body token
    const linkedHit = filterAndSearchJournalEntries(
      entries,
      { query: 'clv-9 nestbox' },
      [doe]
    );
    expect(linkedHit).toHaveLength(1);
    expect(linkedHit[0].id).toBe('j-1');

    // Category + minStars + pinned filter
    const filtered = filterAndSearchJournalEntries(entries, {
      colorCategory: 'sage',
      minStars: 4,
      pinnedOnly: true,
    });
    expect(filtered.map((e) => e.id)).toEqual(['j-1']);

    // Multi-month grouping collapses entries by month and date
    const grouped = groupJournalEntriesByMonthAndDate(entries);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].monthKey).toBe('2026-11');
    expect(grouped[0].monthLabel).toBe('November 2026');
    expect(grouped[0].dates).toHaveLength(1);
    expect(grouped[0].dates[0].entries).toHaveLength(2);
    expect(grouped[1].monthKey).toBe('2026-10');

    const stats = summarizeJournalStats(entries);
    expect(stats.totalEntries).toBe(3);
    expect(stats.pinnedCount).toBe(1);
    expect(stats.averageRating).toBe(4);
    expect(stats.fiveStarCount).toBe(1);
  });

  it('exports Markdown, UTF-8 CSV, and HTML-escaped printable journal books', () => {
    const md = exportBarnJournalMarkdown(entries, 'Meadowbrook Barn', 'Rabbit', [doe]);
    expect(md).toContain('# Meadowbrook Barn — Rabbit Personal Journal');
    expect(md).toContain('#winter #kindling');
    expect(md).toContain('Clover (CLV-9)');

    const csv = exportBarnJournalCsv(entries, [doe]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Winter Coat & Nestbox Prep');
    expect(csv).toContain('Clover (CLV-9)');

    const html = generateBarnJournalHtml({
      entries,
      barnName: 'Meadowbrook <Barn>',
      breederName: 'Kim',
      speciesName: 'Rabbit',
      animals: [doe],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Meadowbrook &lt;Barn&gt;');
  });
});
