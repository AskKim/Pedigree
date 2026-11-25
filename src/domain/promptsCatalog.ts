/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Prompt Directory Catalog & Parser (`src/domain/promptsCatalog.ts`).
 *
 * Maintenance Note:
 * If the `/prompts/` folder in the repository root is ever moved or renamed,
 * update `PROMPTS_FOLDER_PATH` and `PROMPTS_FILE_STRUCTURE_BREADCRUMB` here,
 * the `import.meta.glob` path in `src/components/PromptsDirectoryScreen.tsx`,
 * and the disk scanner in `vite.config.ts`.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) or Node imports.
 */

export const PROMPTS_FOLDER_PATH = '/prompts';

export const PROMPTS_FILE_STRUCTURE_BREADCRUMB: readonly string[] = [
  'Pedigree (Repo Root)',
  'prompts',
];

export const PROMPTS_MOVED_DOCUMENTATION_NOTE =
  'Documentation Note: All prompts are protected in /prompts/ (DO_NOT_REMOVE_WITHOUT_CONFIRMATION). If these prompt files are ever moved or renamed in the repository, this Prompts Directory page (src/components/PromptsDirectoryScreen.tsx), src/domain/promptsCatalog.ts, and the /prompts/ manifest scanner in vite.config.ts must be updated to match.';

export type PromptStatus = 'active' | 'archived';

export interface PromptCatalogEntry {
  filename: string;
  relativePath: string;
  title: string;
  summary: string;
  whenToUse: string;
  status: PromptStatus;
  protectedDoNotRemove: boolean;
  protectionFlag: string | null;
  lastEdited: string | null;
  lineCount: number;
  byteLength: number;
  rawContent?: string;
}

export interface PromptsCatalogManifest {
  folderPath: string;
  scannedAtIso: string;
  entries: PromptCatalogEntry[];
}

interface CuratedPromptDescription {
  title: string;
  summary: string;
  whenToUse: string;
  preferredOrder: number;
}

const CURATED_PROMPT_DESCRIPTIONS: Record<string, CuratedPromptDescription> = {
  'master_system_prompt.md': {
    title: 'Master System Prompt (Active)',
    summary:
      'Single source of truth for execution discipline, strict TypeScript safety, modular boundaries (core vs storage/hooks/components/utils), offline-first IndexedDB/SQLite/OPFS invariants, memory limits, and pure calendar date math.',
    whenToUse:
      'Load first at the start of any engineering session or automated prompt workflow before modifying application code.',
    preferredOrder: 1,
  },
  'start_new_backlog_prompt.md': {
    title: 'Start New Backlog Item Prompt',
    summary:
      '7-step workflow for picking the highest-priority item from docs/plans/suggestions-backlog.md, drafting docs/plans/active-backlog-plan.md, implementing end-to-end, auditing stability/memory/performance, and cleaning up completed items.',
    whenToUse:
      'Run when starting the next pending item from the suggestions backlog (automatically redirects to resume_backlog_plan_prompt.md if an active plan already exists).',
    preferredOrder: 2,
  },
  'resume_backlog_plan_prompt.md': {
    title: 'Resume Backlog Plan Prompt',
    summary:
      '4-phase continuation workflow that loads the active master system prompt, reads docs/plans/active-backlog-plan.md, executes the next pending task, runs tests/typechecks, and closes out the plan once all tasks pass.',
    whenToUse:
      'Run when resuming an in-progress implementation plan in docs/plans/ across sessions.',
    preferredOrder: 3,
  },
  'fix_error_log_prompt.md': {
    title: 'Automated Crash Diagnostic & Code Remediation Prompt',
    summary:
      '4-phase root-cause debugging workflow that ingests crash/support logs, inspects [ERROR]/[FATAL]/[WARN] traces and storage/memory warnings, implements defensive fixes with regression tests, and reports verified results.',
    whenToUse:
      'Run alongside an exported support-report.txt, error-logs.json, or stack trace to diagnose and fix application crashes.',
    preferredOrder: 4,
  },
  'master_system_prompt_old_v4.md': {
    title: 'Master System Prompt (Archived v4)',
    summary:
      'Superseded v4 edition of the Community Pedigree Master System Prompt preserved strictly for historical reference and diff comparison.',
    whenToUse:
      'Reference only — do not use as active instructions; use prompts/master_system_prompt.md instead.',
    preferredOrder: 100,
  },
  'master_system_prompt_old_v2.md': {
    title: 'Master System Prompt (Archived v2)',
    summary:
      'Superseded v2 edition of the Community Pedigree Master System Prompt preserved strictly for historical reference and diff comparison.',
    whenToUse:
      'Reference only — do not use as active instructions; use prompts/master_system_prompt.md instead.',
    preferredOrder: 101,
  },
  'master_system_prompt_old_v1.md': {
    title: 'Master System Prompt (Archived v1)',
    summary:
      'Original v1 edition of the Community Pedigree Master System Prompt retained strictly for historical audit and provenance.',
    whenToUse:
      'Reference only — do not use as active instructions; use prompts/master_system_prompt.md instead.',
    preferredOrder: 102,
  },
};

function computeUtf8ByteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  return text.length;
}

function humanizeFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  return base
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function extractFilenameFromPath(rawKey: string): string {
  const normalized = rawKey.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/');
  return segments[segments.length - 1] || normalized;
}

function extractMarkdownTitle(filename: string, content: string): string {
  const curated = CURATED_PROMPT_DESCRIPTIONS[filename];
  if (curated) return curated.title;

  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('<!--')) continue;
    const h1Match = /^#\s+(.+)$/.exec(trimmed);
    if (h1Match && h1Match[1]) {
      return h1Match[1].trim();
    }
    const commentHeading = /^(?:\/\/|#)\s*([A-Za-z0-9].+)$/.exec(trimmed);
    if (commentHeading && commentHeading[1] && !commentHeading[1].startsWith('!')) {
      return commentHeading[1].trim();
    }
  }
  return humanizeFilename(filename);
}

function extractLastEdited(content: string): string | null {
  const match = /\*\*Last-Edited(?:\s+Timestamp)?:\*\*\s*(.+)/i.exec(content);
  return match && match[1] ? match[1].trim() : null;
}

function detectArchivedStatus(filename: string, content: string): PromptStatus {
  const lowerName = filename.toLowerCase();
  if (
    lowerName.includes('_old_') ||
    lowerName.includes('old_v') ||
    lowerName.includes('archived') ||
    lowerName.includes('deprecated')
  ) {
    return 'archived';
  }
  if (
    /ARCHIVED\s*[—-]\s*STRICTLY FOR REFERENCE ONLY/i.test(content) ||
    /older v\d+ version of the master system prompt/i.test(content) ||
    /<!--\s*PROMPT_STATUS\s*:\s*archived\s*-->/i.test(content)
  ) {
    return 'archived';
  }
  return 'active';
}

function detectProtectionFlag(content: string): {
  protectedDoNotRemove: boolean;
  protectionFlag: string | null;
} {
  if (/DO_NOT_REMOVE_WITHOUT_CONFIRMATION/i.test(content)) {
    return {
      protectedDoNotRemove: true,
      protectionFlag: 'DO_NOT_REMOVE_WITHOUT_CONFIRMATION',
    };
  }
  if (
    /Never delete,\s*overwrite,\s*(?:remove|or remove)/i.test(content) ||
    /Do not delete,\s*move,\s*(?:overwrite,\s*)?or remove/i.test(content)
  ) {
    return {
      protectedDoNotRemove: true,
      protectionFlag: 'PROTECTED_PROMPT_FILE',
    };
  }
  return {
    protectedDoNotRemove: false,
    protectionFlag: null,
  };
}

function extractFallbackSummary(content: string): string {
  const lines = content.split(/\r?\n/);
  const proseLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed === '---' ||
      trimmed.startsWith('<!--') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('>') ||
      /^\*\*Last-Edited/i.test(trimmed)
    ) {
      if (proseLines.length > 0) break;
      continue;
    }
    const cleaned = trimmed
      .replace(/^[-*]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/\*\*/g, '')
      .replace(/`/g, '');
    if (cleaned.length > 0) {
      proseLines.push(cleaned);
    }
    if (proseLines.join(' ').length >= 220) break;
  }

  const joined = proseLines.join(' ').trim();
  if (!joined) {
    return 'Custom prompt or script detected in /prompts/. Click View Source to inspect its instructions.';
  }
  return joined.length > 260 ? `${joined.slice(0, 257).trimEnd()}...` : joined;
}

export function parsePromptEntry(
  rawFilenameOrPath: string,
  rawContent: string,
  includeContent = true
): PromptCatalogEntry {
  const filename = extractFilenameFromPath(rawFilenameOrPath);
  const curated = CURATED_PROMPT_DESCRIPTIONS[filename];
  const status = detectArchivedStatus(filename, rawContent);
  const protection = detectProtectionFlag(rawContent);
  const title = extractMarkdownTitle(filename, rawContent);
  const summary = curated ? curated.summary : extractFallbackSummary(rawContent);
  const whenToUse = curated
    ? curated.whenToUse
    : status === 'archived'
      ? 'Archived for historical reference only; check active prompts before executing.'
      : 'Added to /prompts/ — review the source instructions before invoking.';
  const lastEdited = extractLastEdited(rawContent);
  const lineCount = rawContent.length === 0 ? 0 : rawContent.split(/\r?\n/).length;
  const byteLength = computeUtf8ByteLength(rawContent);

  return {
    filename,
    relativePath: `prompts/${filename}`,
    title,
    summary,
    whenToUse,
    status,
    protectedDoNotRemove: protection.protectedDoNotRemove,
    protectionFlag: protection.protectionFlag,
    lastEdited,
    lineCount,
    byteLength,
    ...(includeContent ? { rawContent } : {}),
  };
}

export function buildPromptsCatalogManifest(
  filesByPath: Record<string, string>,
  scannedAtIso: string = new Date().toISOString(),
  includeContent = true
): PromptsCatalogManifest {
  const dedupedByName = new Map<string, PromptCatalogEntry>();

  for (const [key, content] of Object.entries(filesByPath)) {
    if (typeof content !== 'string') continue;
    const filename = extractFilenameFromPath(key);
    if (!filename || filename.startsWith('.')) continue;
    dedupedByName.set(filename, parsePromptEntry(filename, content, includeContent));
  }

  const entries = Array.from(dedupedByName.values()).sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'active' ? -1 : 1;
    }
    const orderA = CURATED_PROMPT_DESCRIPTIONS[a.filename]?.preferredOrder ?? 50;
    const orderB = CURATED_PROMPT_DESCRIPTIONS[b.filename]?.preferredOrder ?? 50;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.filename.localeCompare(b.filename);
  });

  return {
    folderPath: PROMPTS_FOLDER_PATH,
    scannedAtIso,
    entries,
  };
}

export function partitionPromptsByStatus(entries: readonly PromptCatalogEntry[]): {
  active: PromptCatalogEntry[];
  archived: PromptCatalogEntry[];
} {
  const active: PromptCatalogEntry[] = [];
  const archived: PromptCatalogEntry[] = [];

  for (const entry of entries) {
    if (entry.status === 'archived') {
      archived.push(entry);
    } else {
      active.push(entry);
    }
  }

  return { active, archived };
}

export function isValidPromptsManifest(raw: unknown): raw is PromptsCatalogManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.folderPath !== 'string' || typeof obj.scannedAtIso !== 'string') return false;
  if (!Array.isArray(obj.entries)) return false;

  return obj.entries.every((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const entry = item as Record<string, unknown>;
    return (
      typeof entry.filename === 'string' &&
      typeof entry.relativePath === 'string' &&
      typeof entry.title === 'string' &&
      typeof entry.summary === 'string' &&
      (entry.status === 'active' || entry.status === 'archived') &&
      typeof entry.protectedDoNotRemove === 'boolean' &&
      typeof entry.lineCount === 'number' &&
      typeof entry.byteLength === 'number'
    );
  });
}
