/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Developer Prompts Directory Screen (`src/components/PromptsDirectoryScreen.tsx`).
 *
 * Documentation & Maintenance Note:
 * If the prompt files in `/prompts/` are ever moved or renamed in the repository,
 * update the `import.meta.glob('/prompts/*', ...)` glob below, the constants in
 * `src/domain/promptsCatalog.ts`, and the `/prompts/` disk scanner in `vite.config.ts`.
 */

import {
  Archive,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FolderTree,
  Info,
  Lock,
  RefreshCw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { useCallback, useId, useMemo, useState } from 'react';
import { formatByteSizePure } from '../domain/imageOptimizationSpec';
import {
  buildPromptsCatalogManifest,
  isValidPromptsManifest,
  partitionPromptsByStatus,
  PROMPTS_FILE_STRUCTURE_BREADCRUMB,
  PROMPTS_FOLDER_PATH,
  PROMPTS_MOVED_DOCUMENTATION_NOTE,
  PromptCatalogEntry,
  PromptsCatalogManifest,
} from '../domain/promptsCatalog';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';

const BUNDLED_PROMPT_FILES = import.meta.glob('/prompts/*', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function buildBundledSnapshot(): PromptsCatalogManifest {
  return buildPromptsCatalogManifest(BUNDLED_PROMPT_FILES, new Date().toISOString(), true);
}

export interface PromptsDirectoryScreenProps {
  onBackToTechyStuff: () => void;
}

export function PromptsDirectoryScreen({ onBackToTechyStuff }: PromptsDirectoryScreenProps) {
  const searchId = useId();
  const refreshLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });

  const [manifest, setManifest] = useState<PromptsCatalogManifest>(() => buildBundledSnapshot());
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [refreshStatus, setRefreshStatus] = useState<{
    tone: 'ok' | 'info' | 'warn';
    message: string;
  } | null>(null);
  const [sourceOrigin, setSourceOrigin] = useState<'bundled' | 'live_scan'>('bundled');

  const handleForceRefresh = useCallback(async () => {
    await refreshLock.runLocked(async () => {
      const previousFilenames = new Set(manifest.entries.map((e) => e.filename));
      const bundled = buildBundledSnapshot();

      try {
        const cacheBust = Date.now();
        const response = await fetch(`./prompts-manifest.json?ts=${cacheBust}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const parsed: unknown = await response.json();
        if (!isValidPromptsManifest(parsed)) {
          throw new Error('Manifest response format was invalid.');
        }

        const nextFilenames = new Set(parsed.entries.map((e) => e.filename));
        const added = parsed.entries
          .filter((e) => !previousFilenames.has(e.filename))
          .map((e) => e.filename);
        const removed = Array.from(previousFilenames).filter((name) => !nextFilenames.has(name));

        setManifest(parsed);
        setSourceOrigin('live_scan');

        const { active, archived } = partitionPromptsByStatus(parsed.entries);
        if (added.length > 0) {
          setRefreshStatus({
            tone: 'ok',
            message: `Folder scan complete: ${parsed.entries.length} file(s) in ${PROMPTS_FOLDER_PATH} (${active.length} active, ${archived.length} archived). Newly detected: ${added.join(', ')}.`,
          });
        } else if (removed.length > 0) {
          setRefreshStatus({
            tone: 'warn',
            message: `Folder scan complete: ${parsed.entries.length} file(s) remaining in ${PROMPTS_FOLDER_PATH}. No longer present: ${removed.join(', ')}.`,
          });
        } else {
          setRefreshStatus({
            tone: 'ok',
            message: `Refreshed ${PROMPTS_FOLDER_PATH} — ${parsed.entries.length} file(s) verified (${active.length} active, ${archived.length} archived). No new scripts found.`,
          });
        }
      } catch {
        setManifest(bundled);
        setSourceOrigin('bundled');
        const { active, archived } = partitionPromptsByStatus(bundled.entries);
        setRefreshStatus({
          tone: 'info',
          message: `Live folder endpoint unavailable (offline or static preview). Re-evaluated ${bundled.entries.length} bundled file(s) from ${PROMPTS_FOLDER_PATH} (${active.length} active, ${archived.length} archived).`,
        });
      }
    });
  }, [manifest.entries, refreshLock]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return manifest.entries;
    return manifest.entries.filter(
      (entry) =>
        entry.filename.toLowerCase().includes(q) ||
        entry.title.toLowerCase().includes(q) ||
        entry.summary.toLowerCase().includes(q) ||
        entry.whenToUse.toLowerCase().includes(q)
    );
  }, [manifest.entries, searchQuery]);

  const { active: activePrompts, archived: archivedPrompts } = useMemo(
    () => partitionPromptsByStatus(filteredEntries),
    [filteredEntries]
  );

  const totalCounts = useMemo(
    () => partitionPromptsByStatus(manifest.entries),
    [manifest.entries]
  );

  const toggleSourcePreview = (filename: string) => {
    setExpandedFiles((prev) => ({
      ...prev,
      [filename]: !prev[filename],
    }));
  };

  const renderPromptCard = (entry: PromptCatalogEntry) => {
    const isExpanded = Boolean(expandedFiles[entry.filename]);
    const isArchived = entry.status === 'archived';

    return (
      <article
        key={entry.filename}
        className={`p-4 sm:p-5 rounded-xl border space-y-2.5 ${
          isArchived
            ? 'bg-[var(--barn-canvas)]/70 border-[var(--barn-border)] opacity-90'
            : 'bg-[var(--barn-canvas)] border-[var(--barn-border)]'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <h3 className="font-display text-base sm:text-lg font-semibold text-[var(--barn-ink)] break-words">
              {entry.title}
            </h3>

            {/* Unboxed Metadata Line (Zero-Pill Discipline) */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono text-[var(--barn-muted)] tabular-nums">
              <span className="inline-flex items-center gap-1 text-[var(--barn-ink)] font-semibold">
                <FileCode2 className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                {entry.relativePath}
              </span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  isArchived
                    ? 'text-[var(--barn-muted)] font-medium'
                    : 'text-[var(--barn-sage)] font-semibold'
                }
              >
                {isArchived ? 'Archived (Reference Only)' : 'Active Prompt'}
              </span>
              <span aria-hidden="true">·</span>
              {entry.protectedDoNotRemove ? (
                <span className="inline-flex items-center gap-1 text-[var(--barn-ink)]">
                  <Lock className="w-3 h-3 text-[var(--barn-sage)]" aria-hidden="true" />
                  <span>{entry.protectionFlag ?? 'DO_NOT_REMOVE_WITHOUT_CONFIRMATION'}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[var(--barn-terracotta)] font-semibold">
                  <ShieldAlert className="w-3 h-3" aria-hidden="true" />
                  <span>Missing confirmation-lock flag</span>
                </span>
              )}
              {entry.lastEdited && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Edited {entry.lastEdited}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>{entry.lineCount.toLocaleString()} lines</span>
              <span aria-hidden="true">·</span>
              <span>{formatByteSizePure(entry.byteLength)}</span>
            </div>
          </div>

          {typeof entry.rawContent === 'string' && (
            <button
              type="button"
              onClick={() => toggleSourcePreview(entry.filename)}
              aria-expanded={isExpanded}
              className="min-h-[36px] max-w-full px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold inline-flex items-center gap-1.5"
            >
              {isExpanded ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Hide Source</span>
                </>
              ) : (
                <>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>View Source</span>
                </>
              )}
            </button>
          )}
        </div>

        <p className="text-xs text-[var(--barn-ink)] leading-relaxed">{entry.summary}</p>
        <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed">
          <strong className="text-[var(--barn-ink)]">When to use:</strong> {entry.whenToUse}
        </p>

        {isExpanded && typeof entry.rawContent === 'string' && (
          <pre className="mt-2 p-3.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[11px] font-mono text-[var(--barn-ink)] overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap break-words leading-relaxed">
            {entry.rawContent}
          </pre>
        )}
      </article>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header, Breadcrumb & Refresh Action */}
      <header className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0 flex-1">
            {/* Workspace & Repository File-Structure Breadcrumb Tidbit */}
            <nav
              aria-label="Prompt folder file structure breadcrumb"
              className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-[var(--barn-muted)]"
            >
              <FolderTree className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>The Techy Stuff</span>
              <span aria-hidden="true">/</span>
              <span className="text-[var(--barn-ink)] font-semibold">Prompts Directory</span>
              <span aria-hidden="true">·</span>
              <span>File Location:</span>
              {PROMPTS_FILE_STRUCTURE_BREADCRUMB.map((segment, idx) => (
                <span key={segment} className="inline-flex items-center gap-1.5">
                  {idx > 0 && <span aria-hidden="true">/</span>}
                  <code className="text-[var(--barn-ink)] font-semibold">{segment}</code>
                </span>
              ))}
              <span aria-hidden="true">/</span>
              <code className="text-[var(--barn-sage)] font-semibold">*.md</code>
            </nav>

            <h1 className="font-display text-2xl font-semibold text-[var(--barn-ink)]">
              Repository Prompts Directory
            </h1>
            <p className="text-xs text-[var(--barn-muted)] max-w-3xl leading-relaxed">
              Central catalog of system and workflow prompts stored in root{' '}
              <code className="font-mono text-[var(--barn-ink)]">{PROMPTS_FOLDER_PATH}/</code>.
              Active prompts are separated from archived historical versions, and every protected
              file carries a{' '}
              <code className="font-mono text-[var(--barn-ink)]">
                DO_NOT_REMOVE_WITHOUT_CONFIRMATION
              </code>{' '}
              guard flag.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto max-w-full">
            <button
              type="button"
              onClick={onBackToTechyStuff}
              className="min-h-[40px] max-w-full px-3.5 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Back to The Techy Stuff</span>
            </button>

            <button
              type="button"
              disabled={refreshLock.isSubmitting}
              aria-busy={refreshLock.isSubmitting}
              onClick={() => void handleForceRefresh()}
              className="min-h-[40px] max-w-full px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 shrink-0 ${refreshLock.isSubmitting ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>
                {refreshLock.isSubmitting ? 'Scanning /prompts/...' : 'Refresh / Check for New Prompts'}
              </span>
            </button>
          </div>
        </div>

        {/* Summary Telemetry Strip & Filter Input */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--barn-border)]/70">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--barn-muted)] tabular-nums">
            <span>
              <strong className="text-[var(--barn-ink)]">{manifest.entries.length}</strong> total
              files
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-[var(--barn-sage)]">{totalCounts.active.length}</strong> active
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-[var(--barn-ink)]">{totalCounts.archived.length}</strong>{' '}
              archived
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-[11px]">
              Source: {sourceOrigin === 'live_scan' ? 'Live /prompts/ scan' : 'Bundled snapshot'} ·
              Checked {new Date(manifest.scannedAtIso).toLocaleTimeString()}
            </span>
          </div>

          <div className="relative w-full sm:w-72">
            <label htmlFor={searchId} className="sr-only">
              Filter prompts by filename or description
            </label>
            <Search
              className="w-3.5 h-3.5 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id={searchId}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter prompts or scripts..."
              className="w-full min-h-[36px] pl-8 pr-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-ink)]"
            />
          </div>
        </div>

        {refreshStatus && (
          <div
            role="status"
            aria-live="polite"
            className={`p-3 rounded-xl border text-xs ${
              refreshStatus.tone === 'ok'
                ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)] text-[var(--barn-ink)]'
                : refreshStatus.tone === 'warn'
                  ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)] text-[var(--barn-ink)]'
                  : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] text-[var(--barn-ink)]'
            }`}
          >
            {refreshStatus.message}
          </div>
        )}
      </header>

      {/* Section 1: Active Prompts */}
      <section
        aria-label="Active Prompts"
        className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-semibold text-[var(--barn-ink)]">
              Active Prompts
            </h2>
            <p className="text-xs text-[var(--barn-muted)] mt-0.5">
              Current operational instructions and automated task workflows living in{' '}
              <code className="font-mono text-[var(--barn-ink)]">{PROMPTS_FOLDER_PATH}/</code>.
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-[var(--barn-sage)] font-semibold">
            {activePrompts.length} shown
          </span>
        </div>

        {activePrompts.length === 0 ? (
          <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-muted)]">
            {searchQuery.trim()
              ? `No active prompts match "${searchQuery.trim()}".`
              : `No active prompt files were found in ${PROMPTS_FOLDER_PATH}/.`}
          </div>
        ) : (
          <div className="space-y-3">{activePrompts.map(renderPromptCard)}</div>
        )}
      </section>

      {/* Section 2: Old / Archived Prompts */}
      <section
        aria-label="Archived and Old Prompts"
        className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-semibold text-[var(--barn-ink)] flex items-center gap-2">
              <Archive className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
              <span>Old &amp; Archived Prompts (Reference Only)</span>
            </h2>
            <p className="text-xs text-[var(--barn-muted)] mt-0.5">
              Superseded Master System Prompt versions retained in{' '}
              <code className="font-mono text-[var(--barn-ink)]">{PROMPTS_FOLDER_PATH}/</code>{' '}
              strictly for historical audit and comparison. Do not use these as active rules.
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-[var(--barn-muted)]">
            {archivedPrompts.length} shown
          </span>
        </div>

        {archivedPrompts.length === 0 ? (
          <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-muted)]">
            {searchQuery.trim()
              ? `No archived prompts match "${searchQuery.trim()}".`
              : `No archived prompts detected in ${PROMPTS_FOLDER_PATH}/.`}
          </div>
        ) : (
          <div className="space-y-3">{archivedPrompts.map(renderPromptCard)}</div>
        )}
      </section>

      {/* Maintenance & Relocation Documentation Note */}
      <section
        aria-label="Prompts Relocation Documentation Note"
        className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 space-y-2 text-xs"
      >
        <div className="flex items-center gap-2 font-semibold text-[var(--barn-ink)]">
          <Info className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
          <span>Repository Path &amp; Update Documentation Note</span>
        </div>
        <p className="text-[var(--barn-muted)] leading-relaxed">
          {PROMPTS_MOVED_DOCUMENTATION_NOTE}
        </p>
      </section>
    </div>
  );
}
