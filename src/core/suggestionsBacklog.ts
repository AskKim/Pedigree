/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Suggestion Backlog Parser, Idea Sanitizer & Export Formatter
 * (`src/core/suggestionsBacklog.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) or Node imports.
 */

import { escapeSafeHtml, sanitizePlainText } from './inputSanitization';

export const SUGGESTIONS_BACKLOG_PATH = '/docs/plans/suggestions-backlog.md';
export const MIN_CAPTURED_IDEA_LENGTH = 3;
export const MAX_CAPTURED_IDEA_LENGTH = 1000;
export const MAX_CAPTURED_IDEAS_COUNT = 500;

export interface BacklogSubBullet {
  lead: string | null;
  text: string;
}

export interface BacklogItem {
  number: number;
  title: string;
  codeTag: string | null;
  details: BacklogSubBullet[];
}

export interface BacklogSection {
  id: string;
  title: string;
  subtitle: string | null;
  items: BacklogItem[];
}

export interface ParsedSuggestionsBacklog {
  title: string;
  overviewHeading: string | null;
  auditNote: string | null;
  sections: BacklogSection[];
  totalItems: number;
  isEmpty: boolean;
}

export interface CapturedIdeaEntry {
  id: string;
  text: string;
  createdAtIso: string;
}

export type SanitizeIdeaResult =
  | {
      ok: true;
      sanitizedText: string;
      truncated: boolean;
    }
  | {
      ok: false;
      error: string;
    };

function stripInlineMarkdownFormatting(raw: string): string {
  return raw
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugifySectionId(title: string, index: number): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `section-${index + 1}`;
}

/**
 * Parses `docs/plans/suggestions-backlog.md` into structured sections, items, and sub-bullets
 * without raw markdown tokens so UI components can render clean human-readable cards.
 */
export function parseSuggestionsBacklogMarkdown(rawMarkdown: string): ParsedSuggestionsBacklog {
  if (typeof rawMarkdown !== 'string' || !rawMarkdown.trim()) {
    return {
      title: 'Pedigree — Saved Suggestions Backlog',
      overviewHeading: null,
      auditNote: null,
      sections: [],
      totalItems: 0,
      isEmpty: true,
    };
  }

  const lines = rawMarkdown.split(/\r?\n/);
  let title = 'Pedigree — Saved Suggestions Backlog';
  let overviewHeading: string | null = null;
  const auditLines: string[] = [];
  const sections: BacklogSection[] = [];

  let currentSection: BacklogSection | null = null;
  let currentItem: BacklogItem | null = null;
  let hasSeenSections = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed === '---') {
      continue;
    }

    // Top-level document title
    const h1Match = /^#\s+(.+)$/.exec(trimmed);
    if (h1Match && !hasSeenSections) {
      title = stripInlineMarkdownFormatting(h1Match[1]);
      continue;
    }

    // Overview H2 heading (e.g. "## Current App Suggestions & Remediation List (14 Remaining...)")
    const h2Match = /^##\s+(.+)$/.exec(trimmed);
    if (h2Match) {
      overviewHeading = stripInlineMarkdownFormatting(h2Match[1]);
      continue;
    }

    // Blockquote notes before sections
    if (trimmed.startsWith('>') && !hasSeenSections) {
      const quoteBody = stripInlineMarkdownFormatting(trimmed.replace(/^>\s*/, ''));
      if (quoteBody && !/^NOTE TO FUTURE SELF/i.test(quoteBody)) {
        auditLines.push(quoteBody);
      }
      continue;
    }

    // Priority / Category section heading (H3)
    const h3Match = /^###\s+(.+)$/.exec(trimmed);
    if (h3Match) {
      hasSeenSections = true;
      currentItem = null;
      const sectionTitle = stripInlineMarkdownFormatting(h3Match[1]);
      currentSection = {
        id: slugifySectionId(sectionTitle, sections.length),
        title: sectionTitle,
        subtitle: null,
        items: [],
      };
      sections.push(currentSection);
      continue;
    }

    // Italicized section subtitle directly below H3
    if (
      currentSection &&
      !currentItem &&
      currentSection.items.length === 0 &&
      trimmed.startsWith('*') &&
      trimmed.endsWith('*') &&
      !trimmed.startsWith('**')
    ) {
      currentSection.subtitle = stripInlineMarkdownFormatting(trimmed);
      continue;
    }

    // Numbered backlog item (e.g., "1. **Structured Show Placements... (`ShowEvent`)**")
    const numberedMatch = /^(\d+)\.\s+(.+)$/.exec(trimmed);
    if (numberedMatch) {
      if (!currentSection) {
        hasSeenSections = true;
        currentSection = {
          id: `section-${sections.length + 1}`,
          title: 'General Suggestions',
          subtitle: null,
          items: [],
        };
        sections.push(currentSection);
      }

      const itemNumber = Number(numberedMatch[1]) || currentSection.items.length + 1;
      const rawTitle = numberedMatch[2].trim();
      const codeTagMatch = /\(`([^`]+)`\)\s*\*?\*?\s*$/.exec(rawTitle);
      const codeTag = codeTagMatch ? codeTagMatch[1].trim() : null;
      const cleanedTitle = stripInlineMarkdownFormatting(
        codeTagMatch ? rawTitle.slice(0, codeTagMatch.index) : rawTitle
      );

      currentItem = {
        number: itemNumber,
        title: cleanedTitle,
        codeTag,
        details: [],
      };
      currentSection.items.push(currentItem);
      continue;
    }

    // Sub-bullet detail under a numbered backlog item
    const bulletMatch = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bulletMatch && currentItem) {
      const bulletBody = bulletMatch[1].trim();
      const leadMatch = /^\*\*([^*:]+):\*\*\s*(.+)$/.exec(bulletBody);
      if (leadMatch) {
        currentItem.details.push({
          lead: stripInlineMarkdownFormatting(leadMatch[1]),
          text: stripInlineMarkdownFormatting(leadMatch[2]),
        });
      } else {
        currentItem.details.push({
          lead: null,
          text: stripInlineMarkdownFormatting(bulletBody),
        });
      }
      continue;
    }

    // Continuation line for an active detail or standalone line
    if (currentItem && currentItem.details.length > 0) {
      const last = currentItem.details[currentItem.details.length - 1];
      last.text = `${last.text} ${stripInlineMarkdownFormatting(trimmed)}`.trim();
    } else if (currentItem) {
      currentItem.details.push({
        lead: null,
        text: stripInlineMarkdownFormatting(trimmed),
      });
    }
  }

  const nonEmptySections = sections.filter((section) => section.items.length > 0);
  const totalItems = nonEmptySections.reduce((sum, sec) => sum + sec.items.length, 0);

  return {
    title,
    overviewHeading,
    auditNote: auditLines.length > 0 ? auditLines.join(' ') : null,
    sections: nonEmptySections,
    totalItems,
    isEmpty: totalItems === 0,
  };
}

/**
 * Returns a brief, human-readable explanation of the severity/scope represented
 * by a backlog priority section tab.
 */
export function getBacklogSectionSeverityDescription(
  section: Pick<BacklogSection, 'title' | 'subtitle'>
): string {
  const titleLower = section.title.toLowerCase();
  if (/priority\s*1\b|critical|high[- ]severity/i.test(titleLower)) {
    return 'Critical offline safety, data integrity, or crash fixes';
  }
  if (/priority\s*2\b|medium[- ]severity/i.test(titleLower)) {
    return 'Core workflow gaps, performance, and resilience upgrades';
  }
  if (/priority\s*3\b|low[- ]severity/i.test(titleLower)) {
    return 'Low-severity UX polish, pedigree, show & weight analytics';
  }
  if (/priority\s*4\b|specialized\s+operations/i.test(titleLower)) {
    return 'Larger domain tools, OCR, CRM, ledger & optional cloud';
  }
  if (section.subtitle && section.subtitle.trim().length > 0) {
    return section.subtitle.trim();
  }
  const colonIdx = section.title.indexOf(':');
  if (colonIdx !== -1) {
    const afterColon = section.title.slice(colonIdx + 1).trim();
    if (afterColon) return afterColon;
  }
  return 'Backlog items grouped under this priority tier';
}

/**
 * Pure sanitization utility for captured idea text before React state update or storage write.
 * - Strips `<script>` / `<style>` blocks and inline HTML tags
 * - Strips NUL, C0/C1 control characters, and Unicode bidi overrides
 * - Normalizes whitespace into a single clean line (preventing markdown heading/list injection)
 * - Escapes HTML entities (`&`, `<`, `>`, `"`, `'`)
 * - Enforces minimum & maximum character limits
 */
export function sanitizeIdeaInput(
  rawInput: unknown,
  maxLen: number = MAX_CAPTURED_IDEA_LENGTH
): SanitizeIdeaResult {
  if (typeof rawInput !== 'string') {
    return { ok: false, error: 'Idea text must be a non-empty string.' };
  }

  const effectiveMax =
    Number.isFinite(maxLen) && maxLen >= MIN_CAPTURED_IDEA_LENGTH
      ? Math.floor(maxLen)
      : MAX_CAPTURED_IDEA_LENGTH;

  // 1. Strip NUL bytes, unsafe control chars, bidi overrides, and unpaired surrogates
  let cleaned = sanitizePlainText(rawInput, effectiveMax * 4);

  // 2. Strip executable/style tag blocks and any residual HTML tags
  cleaned = cleaned
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/?[a-zA-Z][^>]*>/g, ' ');

  // 3. Neutralize fenced code blocks / backtick clutter and collapse whitespace/newlines
  cleaned = cleaned
    .replace(/```+/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 4. Strip leading markdown structural tokens (# headings, > blockquotes, list markers)
  cleaned = cleaned.replace(/^(?:#{1,6}\s+|>\s+|[-*+]\s+|\d+\.\s+)+/, '').trim();

  if (cleaned.length < MIN_CAPTURED_IDEA_LENGTH) {
    return {
      ok: false,
      error: `Please enter at least ${MIN_CAPTURED_IDEA_LENGTH} characters for your idea.`,
    };
  }

  let truncated = false;
  if (cleaned.length > effectiveMax) {
    cleaned = cleaned.slice(0, effectiveMax).trimEnd();
    truncated = true;
  }

  // 5. Escape HTML entities before state update or storage write
  const escaped = escapeSafeHtml(cleaned);

  return {
    ok: true,
    sanitizedText: escaped,
    truncated,
  };
}

/**
 * Converts HTML-entity-escaped sanitized text back into plain display characters for
 * safe React JSX text-node interpolation (`{formatSanitizedIdeaForDisplay(idea.text)}`).
 * Never pass the return value into `dangerouslySetInnerHTML`.
 */
export function formatSanitizedIdeaForDisplay(sanitizedText: string): string {
  return String(sanitizedText ?? '')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

export function isValidCapturedIdeaEntry(raw: unknown): raw is CapturedIdeaEntry {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const candidate = raw as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.text === 'string' &&
    candidate.text.trim().length >= MIN_CAPTURED_IDEA_LENGTH &&
    typeof candidate.createdAtIso === 'string' &&
    candidate.createdAtIso.trim().length > 0
  );
}

/**
 * Formats captured ideas into a clean, intake-ready Markdown list using already-sanitized
 * text so copied or exported content cannot inject headings or raw HTML into the master backlog.
 */
export function buildCapturedIdeasMarkdownExport(
  ideas: readonly CapturedIdeaEntry[],
  exportedAtIso: string = new Date().toISOString()
): string {
  const lines: string[] = [
    '# Pedigree — Pending Captured Ideas',
    '',
    `Exported: ${exportedAtIso}`,
    `Total Ideas: ${ideas.length}`,
    '',
  ];

  if (ideas.length === 0) {
    lines.push('_No pending ideas captured._');
    return lines.join('\n');
  }

  ideas.forEach((idea, index) => {
    const safeLine = sanitizePlainText(idea.text, MAX_CAPTURED_IDEA_LENGTH * 2)
      .replace(/[\r\n\t]+/g, ' ')
      .trim();
    lines.push(`${index + 1}. [${idea.createdAtIso}] ${safeLine}`);
  });

  lines.push('');
  return lines.join('\n');
}

export function buildCapturedIdeasJsonExport(
  ideas: readonly CapturedIdeaEntry[],
  exportedAtIso: string = new Date().toISOString()
): string {
  return JSON.stringify(
    {
      format: 'community-pedigree-captured-ideas',
      version: 1,
      exportedAtIso,
      count: ideas.length,
      ideas: ideas.map((idea) => ({
        id: idea.id,
        createdAtIso: idea.createdAtIso,
        text: idea.text,
      })),
    },
    null,
    2
  );
}
