/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Personal Barn Journal Engine (`src/core/barnJournal.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) dependencies.
 * Reuses safe plain-text AST hygiene (`sanitizeSpeciesMemo`) so formatted journal notes
 * never evaluate HTML or scripts, and organizes entries cleanly by month & calendar date.
 */

import { escapeCsvCell, UTF8_BOM } from './csvExport';
import { escapeSafeHtml, sanitizeSingleLineText } from './inputSanitization';
import {
  Animal,
  BarnJournalEntry,
  formatReadableDate,
  generateUuid,
  JOURNAL_COLOR_CATEGORIES,
  JournalColorCategory,
  JournalStarRating,
  normalizeJournalColorCategory,
  normalizeJournalStarRating,
  nowIsoUtc,
  todayDateIso,
} from './models';
import { MAX_SPECIES_MEMO_CHARS, sanitizeSpeciesMemo } from './speciesMemo';

export interface JournalFilterCriteria {
  query?: string;
  colorCategory?: 'all' | JournalColorCategory;
  minStars?: JournalStarRating;
  pinnedOnly?: boolean;
  dateFromIso?: string;
  dateToIso?: string;
}

export interface JournalDateGroup {
  dateIso: string;
  dateLabel: string;
  entries: BarnJournalEntry[];
}

export interface JournalMonthGroup {
  monthKey: string; // YYYY-MM
  monthLabel: string;
  entryCount: number;
  dates: JournalDateGroup[];
}

export interface JournalStatsSummary {
  totalEntries: number;
  pinnedCount: number;
  ratedCount: number;
  averageRating: number;
  fiveStarCount: number;
  byCategory: Record<JournalColorCategory, number>;
  monthKeys: string[];
}

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatJournalMonthLabel(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec((monthKey || '').trim());
  if (!m) return monthKey || 'Undated';
  const monthIdx = Math.max(0, Math.min(11, Number(m[2]) - 1));
  return `${MONTH_LABELS[monthIdx]} ${m[1]}`;
}

export function getJournalCategoryMeta(category: JournalColorCategory) {
  return (
    JOURNAL_COLOR_CATEGORIES.find((c) => c.id === category) ||
    JOURNAL_COLOR_CATEGORIES[0]
  );
}

export function normalizeJournalTags(raw: unknown): string[] {
  const items = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
    ? raw.split(',')
    : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (typeof item !== 'string') continue;
    const clean = sanitizeSingleLineText(item, 40).replace(/^#+/, '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= 20) break;
  }
  return out;
}

export function normalizeBarnJournalEntry(raw: unknown): BarnJournalEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim().slice(0, 120) : '';
  if (!id) return null;

  const species =
    typeof obj.species === 'string' && obj.species.trim() ? obj.species.trim().slice(0, 80) : 'Rabbit';
  const entryDateIso =
    typeof obj.entryDateIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.entryDateIso.trim())
      ? obj.entryDateIso.trim()
      : todayDateIso();
  const title = sanitizeSingleLineText(obj.title || '', 160) || 'Barn Journal Entry';
  const body = sanitizeSpeciesMemo(obj.body || '', MAX_SPECIES_MEMO_CHARS);
  const linkedAnimalIds = Array.isArray(obj.linkedAnimalIds)
    ? Array.from(
        new Set(
          obj.linkedAnimalIds
            .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
            .map((x) => x.trim())
        )
      )
    : undefined;

  const ts = nowIsoUtc();
  return {
    id,
    species,
    entryDateIso,
    title,
    body,
    colorCategory: normalizeJournalColorCategory(obj.colorCategory),
    starRating: normalizeJournalStarRating(obj.starRating),
    tags: normalizeJournalTags(obj.tags),
    pinned: Boolean(obj.pinned),
    ...(linkedAnimalIds && linkedAnimalIds.length > 0 ? { linkedAnimalIds } : {}),
    ...(typeof obj._rev === 'number' && Number.isFinite(obj._rev) && obj._rev >= 0
      ? { _rev: Math.floor(obj._rev) }
      : {}),
    createdAt: typeof obj.createdAt === 'string' && obj.createdAt ? obj.createdAt : ts,
    updatedAt: typeof obj.updatedAt === 'string' && obj.updatedAt ? obj.updatedAt : ts,
  };
}

export function createBarnJournalEntryDraft(
  species: string,
  overrides?: Partial<BarnJournalEntry>
): BarnJournalEntry {
  const ts = nowIsoUtc();
  return {
    id: generateUuid(),
    species: species || 'Rabbit',
    entryDateIso: todayDateIso(),
    title: '',
    body: '',
    colorCategory: 'sage',
    starRating: 0,
    tags: [],
    pinned: false,
    linkedAnimalIds: [],
    _rev: 1,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

/**
 * Performs multi-token full-text search across title, rich-text body, tags, category label,
 * entry date, and linked animal names/tattoos, combined with category/star/pinned/date filters.
 */
export function filterAndSearchJournalEntries(
  entries: BarnJournalEntry[],
  filters: JournalFilterCriteria,
  animals: Animal[] = []
): BarnJournalEntry[] {
  const animalById = new Map(animals.map((a) => [a.id, a]));
  const tokens = (filters.query || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return entries
    .filter((entry) => {
      if (
        filters.colorCategory &&
        filters.colorCategory !== 'all' &&
        entry.colorCategory !== filters.colorCategory
      ) {
        return false;
      }
      if (filters.minStars && entry.starRating < filters.minStars) {
        return false;
      }
      if (filters.pinnedOnly && !entry.pinned) {
        return false;
      }
      if (filters.dateFromIso && entry.entryDateIso < filters.dateFromIso) {
        return false;
      }
      if (filters.dateToIso && entry.entryDateIso > filters.dateToIso) {
        return false;
      }
      if (tokens.length > 0) {
        const catMeta = getJournalCategoryMeta(entry.colorCategory);
        const linkedLabels = (entry.linkedAnimalIds ?? [])
          .map((id) => {
            const a = animalById.get(id);
            return a ? `${a.name} ${a.tattoo} ${a.breed}` : '';
          })
          .join(' ');
        const haystack = [
          entry.title,
          entry.body,
          entry.entryDateIso,
          entry.tags.join(' '),
          catMeta.label,
          entry.colorCategory,
          linkedLabels,
        ]
          .join(' ')
          .toLowerCase();

        for (const tok of tokens) {
          if (!haystack.includes(tok)) return false;
        }
      }
      return true;
    })
    .slice()
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const dateDiff = b.entryDateIso.localeCompare(a.entryDateIso);
      if (dateDiff !== 0) return dateDiff;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}

export function groupJournalEntriesByMonthAndDate(
  entries: BarnJournalEntry[]
): JournalMonthGroup[] {
  const sorted = [...entries].sort((a, b) => {
    const dateDiff = b.entryDateIso.localeCompare(a.entryDateIso);
    if (dateDiff !== 0) return dateDiff;
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  const monthsMap = new Map<string, Map<string, BarnJournalEntry[]>>();

  for (const entry of sorted) {
    const dateIso = entry.entryDateIso || 'Undated';
    const monthKey = dateIso.length >= 7 ? dateIso.slice(0, 7) : 'Undated';
    let dateMap = monthsMap.get(monthKey);
    if (!dateMap) {
      dateMap = new Map<string, BarnJournalEntry[]>();
      monthsMap.set(monthKey, dateMap);
    }
    const list = dateMap.get(dateIso) || [];
    list.push(entry);
    dateMap.set(dateIso, list);
  }

  const result: JournalMonthGroup[] = [];
  for (const [monthKey, dateMap] of monthsMap.entries()) {
    const dates: JournalDateGroup[] = [];
    let entryCount = 0;
    for (const [dateIso, list] of dateMap.entries()) {
      entryCount += list.length;
      dates.push({
        dateIso,
        dateLabel: dateIso === 'Undated' ? 'Undated' : formatReadableDate(dateIso),
        entries: list,
      });
    }
    result.push({
      monthKey,
      monthLabel: formatJournalMonthLabel(monthKey),
      entryCount,
      dates,
    });
  }

  return result;
}

export function summarizeJournalStats(entries: BarnJournalEntry[]): JournalStatsSummary {
  const byCategory: Record<JournalColorCategory, number> = {
    sage: 0,
    terracotta: 0,
    amber: 0,
    sky: 0,
    plum: 0,
    slate: 0,
  };
  let pinnedCount = 0;
  let ratedCount = 0;
  let ratingSum = 0;
  let fiveStarCount = 0;
  const months = new Set<string>();

  for (const e of entries) {
    byCategory[e.colorCategory] = (byCategory[e.colorCategory] || 0) + 1;
    if (e.pinned) pinnedCount += 1;
    if (e.starRating > 0) {
      ratedCount += 1;
      ratingSum += e.starRating;
      if (e.starRating === 5) fiveStarCount += 1;
    }
    if (e.entryDateIso && e.entryDateIso.length >= 7) {
      months.add(e.entryDateIso.slice(0, 7));
    }
  }

  return {
    totalEntries: entries.length,
    pinnedCount,
    ratedCount,
    averageRating: ratedCount > 0 ? Number((ratingSum / ratedCount).toFixed(1)) : 0,
    fiveStarCount,
    byCategory,
    monthKeys: Array.from(months).sort((a, b) => b.localeCompare(a)),
  };
}

export function exportBarnJournalMarkdown(
  entries: BarnJournalEntry[],
  barnName: string,
  speciesName: string,
  animals: Animal[] = []
): string {
  const animalById = new Map(animals.map((a) => [a.id, a]));
  const sorted = [...entries].sort((a, b) => b.entryDateIso.localeCompare(a.entryDateIso));
  const lines: string[] = [
    `# ${barnName || 'Barn'} — ${speciesName} Personal Journal`,
    '',
    `Exported: ${formatReadableDate(todayDateIso())} (${sorted.length} entries)`,
    '',
  ];

  for (const e of sorted) {
    const cat = getJournalCategoryMeta(e.colorCategory);
    const stars = e.starRating > 0 ? `${'★'.repeat(e.starRating)}${'☆'.repeat(5 - e.starRating)}` : 'Unrated';
    const linked = (e.linkedAnimalIds ?? [])
      .map((id) => animalById.get(id))
      .filter((a): a is Animal => Boolean(a))
      .map((a) => `${a.name}${a.tattoo ? ` (${a.tattoo})` : ''}`);

    lines.push(`## ${e.entryDateIso} — ${e.title}${e.pinned ? ' [Pinned]' : ''}`);
    lines.push(`- Category: ${cat.label} | Rating: ${stars}`);
    if (e.tags.length > 0) {
      lines.push(`- Tags: ${e.tags.map((t) => `#${t}`).join(' ')}`);
    }
    if (linked.length > 0) {
      lines.push(`- Animals: ${linked.join(', ')}`);
    }
    lines.push('');
    lines.push(e.body || '_No body text._');
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

export function exportBarnJournalCsv(
  entries: BarnJournalEntry[],
  animals: Animal[] = []
): string {
  const animalById = new Map(animals.map((a) => [a.id, a]));
  const header = [
    'Date',
    'Species',
    'Title',
    'Category',
    'Star Rating',
    'Pinned',
    'Tags',
    'Linked Animals',
    'Notes',
  ];
  const lines = [header.map(escapeCsvCell).join(',')];
  const sorted = [...entries].sort((a, b) => b.entryDateIso.localeCompare(a.entryDateIso));

  for (const e of sorted) {
    const cat = getJournalCategoryMeta(e.colorCategory);
    const linked = (e.linkedAnimalIds ?? [])
      .map((id) => animalById.get(id))
      .filter((a): a is Animal => Boolean(a))
      .map((a) => `${a.name}${a.tattoo ? ` (${a.tattoo})` : ''}`)
      .join('; ');
    lines.push(
      [
        e.entryDateIso,
        e.species,
        e.title,
        cat.label,
        String(e.starRating),
        e.pinned ? 'Yes' : 'No',
        e.tags.join(', '),
        linked,
        e.body,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }
  return UTF8_BOM + lines.join('\r\n');
}

export function generateBarnJournalHtml(params: {
  entries: BarnJournalEntry[];
  barnName: string;
  breederName: string;
  speciesName: string;
  animals?: Animal[];
}): string {
  const animalById = new Map((params.animals ?? []).map((a) => [a.id, a]));
  const sorted = [...params.entries].sort((a, b) => b.entryDateIso.localeCompare(a.entryDateIso));

  const cards = sorted
    .map((e) => {
      const cat = getJournalCategoryMeta(e.colorCategory);
      const stars =
        e.starRating > 0 ? `${'★'.repeat(e.starRating)}${'☆'.repeat(5 - e.starRating)}` : '';
      const linked = (e.linkedAnimalIds ?? [])
        .map((id) => animalById.get(id))
        .filter((a): a is Animal => Boolean(a))
        .map((a) => `${a.name}${a.tattoo ? ` (${a.tattoo})` : ''}`);

      return `<article class="entry" style="border-left: 5px solid ${escapeSafeHtml(cat.hexAccent)}">
        <div class="entry-head">
          <div>
            <span class="badge">${escapeSafeHtml(cat.label)}</span>
            ${e.pinned ? '<span class="badge">Pinned</span>' : ''}
            ${stars ? `<span class="stars">${escapeSafeHtml(stars)}</span>` : ''}
          </div>
          <div class="date">${escapeSafeHtml(formatReadableDate(e.entryDateIso))}</div>
        </div>
        <h3>${escapeSafeHtml(e.title)}</h3>
        ${
          e.tags.length > 0 || linked.length > 0
            ? `<div class="submeta">${escapeSafeHtml(
                [...e.tags.map((t) => `#${t}`), ...linked].join(' · ')
              )}</div>`
            : ''
        }
        <pre class="body">${escapeSafeHtml(e.body || '')}</pre>
      </article>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeSafeHtml(params.barnName)} — ${escapeSafeHtml(params.speciesName)} Personal Journal</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #1c1917; margin: 28px; line-height: 1.5; }
  h1 { font-size: 22px; margin: 0 0 4px 0; }
  .meta { font-size: 12px; color: #57534e; margin-bottom: 18px; }
  .entry { border: 1px solid #d6d3d1; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; background: #fff; page-break-inside: avoid; }
  .entry-head { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; color: #57534e; margin-bottom: 4px; }
  .badge { display: inline-block; border: 1px solid #d6d3d1; border-radius: 4px; padding: 1px 6px; margin-right: 4px; font-size: 10px; font-weight: bold; }
  .stars { color: #b45309; font-weight: bold; }
  h3 { font-size: 15px; margin: 4px 0; }
  .submeta { font-size: 11px; color: #57534e; margin-bottom: 6px; }
  pre.body { font-family: inherit; white-space: pre-wrap; margin: 0; font-size: 12px; }
  @media print { body { margin: 14mm; } }
</style>
</head>
<body>
  <h1>${escapeSafeHtml(params.barnName || 'Barn')} — ${escapeSafeHtml(params.speciesName)} Personal Journal</h1>
  <div class="meta">
    Entries: <strong>${sorted.length}</strong> ·
    Keeper: <strong>${escapeSafeHtml(params.breederName || '—')}</strong> ·
    Printed: <strong>${escapeSafeHtml(formatReadableDate(todayDateIso()))}</strong>
  </div>
  ${cards || '<p>No journal entries recorded.</p>'}
</body>
</html>`;
}
