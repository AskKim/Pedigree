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
