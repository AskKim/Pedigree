/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Developer Suggestion Backlog Viewer & Offline Idea Capture Screen
 * (`src/components/SuggestionsBacklogScreen.tsx`).
 *
 * Reads the bundled `/docs/plans/suggestions-backlog.md` document completely offline,
 * parses sections & numbered items into clean readable cards, and isolates the
 * "New Idea" capture composer from the rendered backlog list so keystrokes never
 * trigger backlog re-parses or list re-renders.
 */

import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  FolderTree,
  Lightbulb,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BacklogSection,
  buildCapturedIdeasJsonExport,
  buildCapturedIdeasMarkdownExport,
  CapturedIdeaEntry,
  formatSanitizedIdeaForDisplay,
  getBacklogSectionSeverityDescription,
  MAX_CAPTURED_IDEA_LENGTH,
  MAX_CAPTURED_IDEAS_COUNT,
  MIN_CAPTURED_IDEA_LENGTH,
  ParsedSuggestionsBacklog,
  parseSuggestionsBacklogMarkdown,
  sanitizeIdeaInput,
  SUGGESTIONS_BACKLOG_PATH,
} from '../core/suggestionsBacklog';
import { formatTimestampedBackupSlug } from '../core/syncAndExports';
import {
  clearCapturedIdeas,
  deleteCapturedIdea,
  loadCapturedIdeas,
  saveCapturedIdea,
} from '../storage/capturedIdeasStore';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import { copyTextWithFallback, downloadTextFile } from '../utils/webFileActions';

const BUNDLED_BACKLOG_FILES = import.meta.glob('/docs/plans/suggestions-backlog.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function readBundledBacklogMarkdown(): string {
  for (const content of Object.values(BUNDLED_BACKLOG_FILES)) {
    if (typeof content === 'string') {
      return content;
    }
  }
  return '';
}

export interface SuggestionsBacklogScreenProps {
  onBackToTechyStuff: () => void;
}

interface IdeaCaptureComposerProps {
  isOpen: boolean;
  onClose: () => void;
  onIdeaSaved: (result: {
    entry: CapturedIdeaEntry;
    ideas: CapturedIdeaEntry[];
    truncated: boolean;
  }) => void;
}

/**
 * Isolated composer component so typing in the idea input never re-renders the
 * master suggestion backlog or pending ideas list.
 */
const IdeaCaptureComposer = memo(function IdeaCaptureComposer({
  isOpen,
  onClose,
  onIdeaSaved,
}: IdeaCaptureComposerProps) {
  const inputId = useId();
  const helpId = useId();
  const submitLock = useAsyncSubmitLock({ postSettleCooldownMs: 200 });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isMountedRef = useRef(true);

  const [draftText, setDraftText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const raf = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const trimmedLen = draftText.trim().length;
  const isOverLimit = draftText.length > MAX_CAPTURED_IDEA_LENGTH;

  const handleCancel = () => {
    setDraftText('');
    setFormError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const check = sanitizeIdeaInput(draftText, MAX_CAPTURED_IDEA_LENGTH);
    if (!check.ok) {
      setFormError(check.error);
      return;
    }

    await submitLock.runLocked(async () => {
      try {
        const result = await saveCapturedIdea(draftText);
        if (!isMountedRef.current) return;
        setDraftText('');
        setFormError(null);
        onIdeaSaved(result);
        onClose();
      } catch (err) {
        if (!isMountedRef.current) return;
        setFormError(
          err instanceof Error
            ? err.message
            : 'Could not save idea to offline storage. Try freeing space or exporting existing ideas.'
        );
      }
    });
  };

  return (
    <section
      aria-label="Capture New Suggestion Idea"
      className="bg-[var(--barn-surface)] border border-[var(--barn-sage)] rounded-2xl p-5 sm:p-6 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5 min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold text-[var(--barn-ink)] flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            <span>Capture New Idea</span>
          </h2>
          <p id={helpId} className="text-xs text-[var(--barn-muted)]">
            Entries are sanitized (HTML stripped/escaped, whitespace normalized, max{' '}
            {MAX_CAPTURED_IDEA_LENGTH.toLocaleString()} characters) and saved offline to your
            ongoing pending ideas list.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCancel}
          aria-label="Close new idea form"
          className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <div>
          <label htmlFor={inputId} className="sr-only">
            Describe your suggestion or feature idea
          </label>
          <textarea
            ref={textareaRef}
            id={inputId}
            rows={4}
            value={draftText}
            maxLength={MAX_CAPTURED_IDEA_LENGTH + 200}
            aria-describedby={helpId}
            onChange={(e) => {
              setDraftText(e.target.value);
              if (formError) setFormError(null);
            }}
            placeholder="Describe a workflow improvement, bug fix, or domain feature idea..."
            className="w-full rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] px-3.5 py-2.5 text-sm text-[var(--barn-ink)] placeholder:text-[var(--barn-muted)]/80 leading-relaxed"
          />
        </div>

        {formError && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)]"
          >
            {formError}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span
            className={`font-mono text-[11px] tabular-nums ${
              isOverLimit ? 'text-[var(--barn-terracotta)] font-semibold' : 'text-[var(--barn-muted)]'
            }`}
          >
            {draftText.length.toLocaleString()} / {MAX_CAPTURED_IDEA_LENGTH.toLocaleString()} chars
            {isOverLimit ? ' (will be trimmed cleanly on save)' : ''}
          </span>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCancel}
              disabled={submitLock.isSubmitting}
              className="min-h-[44px] sm:min-h-[38px] flex-1 sm:flex-initial px-4 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold text-[var(--barn-ink)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitLock.isSubmitting || trimmedLen < MIN_CAPTURED_IDEA_LENGTH}
              aria-busy={submitLock.isSubmitting}
              className="min-h-[44px] sm:min-h-[38px] flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{submitLock.isSubmitting ? 'Saving Offline...' : 'Submit Idea'}</span>
            </button>
          </div>
        </div>
      </form>
    </section>
  );
});

interface BacklogSectionsViewProps {
  sections: readonly BacklogSection[];
  isEmptyBacklog: boolean;
  searchQuery: string;
}

const BacklogSectionsView = memo(function BacklogSectionsView({
  sections,
  isEmptyBacklog,
  searchQuery,
}: BacklogSectionsViewProps) {
  if (isEmptyBacklog) {
    return (
      <div className="p-5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-muted)] space-y-1">
        <div className="font-semibold text-[var(--barn-ink)]">
          No Backlog Items Found in {SUGGESTIONS_BACKLOG_PATH}
        </div>
        <p>
          The bundled suggestion backlog file is currently empty or has no remaining items. Use the{' '}
          <strong className="text-[var(--barn-ink)]">New Idea</strong> button above to capture new
          ideas offline.
        </p>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="p-5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-muted)]">
        No backlog items match &ldquo;{searchQuery.trim()}&rdquo;.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <section
          key={section.id}
          aria-label={section.title}
          className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="space-y-0.5 min-w-0 flex-1">
              <h2 className="font-display text-xl font-semibold text-[var(--barn-ink)]">
                {section.title}
              </h2>
              {section.subtitle && (
                <p className="text-xs text-[var(--barn-muted)] leading-relaxed">
                  {section.subtitle}
                </p>
              )}
            </div>
            <span className="font-mono text-xs tabular-nums text-[var(--barn-sage)] font-semibold shrink-0">
              {section.items.length} {section.items.length === 1 ? 'item' : 'items'}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {section.items.map((item) => (
              <article
                key={`${section.id}-${item.number}`}
                className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 flex flex-col"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] font-mono text-[var(--barn-muted)] tabular-nums">
                    <span className="text-[var(--barn-sage)] font-semibold">
                      #{String(item.number).padStart(2, '0')}
                    </span>
                    {item.codeTag && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[var(--barn-ink)] font-medium">{item.codeTag}</span>
                      </>
                    )}
                  </div>
                  <h3 className="font-display text-base font-semibold text-[var(--barn-ink)] leading-snug">
                    {item.title}
                  </h3>
                </div>

                {item.details.length > 0 && (
                  <ul className="space-y-1.5 text-xs text-[var(--barn-muted)] leading-relaxed list-disc pl-4">
                    {item.details.map((detail, idx) => (
                      <li key={idx}>
                        {detail.lead && (
                          <strong className="text-[var(--barn-ink)]">{detail.lead}: </strong>
                        )}
                        <span>{detail.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
});

export function SuggestionsBacklogScreen({ onBackToTechyStuff }: SuggestionsBacklogScreenProps) {
  const searchId = useId();
  const exportLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const feedbackTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const [capturedIdeas, setCapturedIdeas] = useState<CapturedIdeaEntry[]>([]);
  const [ideasLoaded, setIdeasLoaded] = useState(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('all');

  const parsedBacklog: ParsedSuggestionsBacklog = useMemo(
    () => parseSuggestionsBacklogMarkdown(readBundledBacklogMarkdown()),
    []
  );

  const showTransientFeedback = useCallback((message: string) => {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    setActionFeedback(message);
    feedbackTimerRef.current = window.setTimeout(() => {
      if (isMountedRef.current) {
        setActionFeedback(null);
      }
      feedbackTimerRef.current = null;
    }, 4500);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void loadCapturedIdeas()
      .then((ideas) => {
        if (!isMountedRef.current) return;
        setCapturedIdeas(ideas);
        setIdeasLoaded(true);
      })
      .catch((err) => {
        if (!isMountedRef.current) return;
        setIdeasError(
          err instanceof Error ? err.message : 'Could not load offline captured ideas.'
        );
        setIdeasLoaded(true);
      });

    return () => {
      isMountedRef.current = false;
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = null;
      }
    };
  }, []);

  const handleIdeaSaved = useCallback(
    (result: { entry: CapturedIdeaEntry; ideas: CapturedIdeaEntry[]; truncated: boolean }) => {
      setCapturedIdeas(result.ideas);
      setIdeasError(null);
      showTransientFeedback(
        result.truncated
          ? `Idea saved offline (trimmed to ${MAX_CAPTURED_IDEA_LENGTH} characters).`
          : 'Idea sanitized and saved to your offline Pending Ideas list.'
      );
    },
    [showTransientFeedback]
  );

  const handleDeleteIdea = useCallback(
    async (id: string) => {
      try {
        const next = await deleteCapturedIdea(id);
        if (!isMountedRef.current) return;
        setCapturedIdeas(next);
        showTransientFeedback('Removed idea from offline pending list.');
      } catch (err) {
        if (!isMountedRef.current) return;
        setIdeasError(err instanceof Error ? err.message : 'Could not remove idea.');
      }
    },
    [showTransientFeedback]
  );

  const handleClearIdeas = useCallback(async () => {
    await exportLock.runLocked(async () => {
      try {
        const next = await clearCapturedIdeas();
        if (!isMountedRef.current) return;
        setCapturedIdeas(next);
        showTransientFeedback('Cleared all pending captured ideas from offline storage.');
      } catch (err) {
        if (!isMountedRef.current) return;
        setIdeasError(err instanceof Error ? err.message : 'Could not clear ideas.');
      }
    });
  }, [exportLock, showTransientFeedback]);

  const handleCopyIdeas = useCallback(async () => {
    await exportLock.runLocked(async () => {
      const markdown = buildCapturedIdeasMarkdownExport(capturedIdeas);
      const result = await copyTextWithFallback(markdown);
      if (!isMountedRef.current) return;
      if (result === 'clipboard' || result === 'execCommand') {
        showTransientFeedback(
          `Copied ${capturedIdeas.length} pending idea(s) as Markdown to clipboard.`
        );
      } else {
        setIdeasError('Clipboard access is restricted here. Use Export .MD or Export .JSON instead.');
      }
    });
  }, [capturedIdeas, exportLock, showTransientFeedback]);

  const handleExportMarkdown = useCallback(async () => {
    await exportLock.runLocked(async () => {
      const markdown = buildCapturedIdeasMarkdownExport(capturedIdeas);
      const filename = `pedigree-captured-ideas-${formatTimestampedBackupSlug()}.md`;
      await downloadTextFile(filename, markdown, 'text/markdown');
      if (!isMountedRef.current) return;
      showTransientFeedback(`Downloaded ${filename} (${capturedIdeas.length} idea(s)).`);
    });
  }, [capturedIdeas, exportLock, showTransientFeedback]);

  const handleExportJson = useCallback(async () => {
    await exportLock.runLocked(async () => {
      const jsonText = buildCapturedIdeasJsonExport(capturedIdeas);
      const filename = `pedigree-captured-ideas-${formatTimestampedBackupSlug()}.json`;
      await downloadTextFile(filename, jsonText, 'application/json');
      if (!isMountedRef.current) return;
      showTransientFeedback(`Downloaded ${filename} (${capturedIdeas.length} idea(s)).`);
    });
  }, [capturedIdeas, exportLock, showTransientFeedback]);

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return parsedBacklog.sections
      .filter((sec) => selectedSectionId === 'all' || sec.id === selectedSectionId)
      .map((sec) => {
        if (!q) return sec;
        const matchedItems = sec.items.filter((item) => {
          if (item.title.toLowerCase().includes(q)) return true;
          if (item.codeTag && item.codeTag.toLowerCase().includes(q)) return true;
          return item.details.some(
            (d) =>
              d.text.toLowerCase().includes(q) || (d.lead && d.lead.toLowerCase().includes(q))
          );
        });
        return { ...sec, items: matchedItems };
      })
      .filter((sec) => sec.items.length > 0);
  }, [parsedBacklog.sections, searchQuery, selectedSectionId]);

  const visibleItemCount = useMemo(
    () => filteredSections.reduce((sum, sec) => sum + sec.items.length, 0),
    [filteredSections]
  );

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      {/* Top Header, Breadcrumb & Primary Actions */}
      <header className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0 flex-1">
            <nav
              aria-label="Suggestion backlog breadcrumb"
              className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-[var(--barn-muted)]"
            >
              <FolderTree className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>The Techy Stuff</span>
              <span aria-hidden="true">/</span>
              <span className="text-[var(--barn-ink)] font-semibold">Suggestion Backlog</span>
              <span aria-hidden="true">·</span>
              <code className="text-[var(--barn-ink)]">{SUGGESTIONS_BACKLOG_PATH}</code>
            </nav>

            <h1 className="font-display text-2xl font-semibold text-[var(--barn-ink)]">
              Suggestion Backlog &amp; Idea Capture
            </h1>
            <p className="text-xs text-[var(--barn-muted)] max-w-3xl leading-relaxed">
              Offline-ready viewer for Pedigree&apos;s saved suggestions backlog, paired
              with a sanitized local idea capture inbox for recording new roadmap notes in the barn.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto max-w-full">
            <button
              type="button"
              onClick={onBackToTechyStuff}
              className="min-h-[44px] sm:min-h-[38px] max-w-full px-3.5 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Back to The Techy Stuff</span>
            </button>

            <button
              type="button"
              aria-expanded={isCaptureOpen}
              onClick={() => setIsCaptureOpen((prev) => !prev)}
              className="min-h-[44px] sm:min-h-[38px] max-w-full px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>New Idea</span>
            </button>
          </div>
        </div>

        {/* Summary Telemetry Strip & Search / Section Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--barn-border)]/70">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--barn-muted)] tabular-nums">
            <span>
              <strong className="text-[var(--barn-ink)]">{parsedBacklog.totalItems}</strong> backlog
              items
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-[var(--barn-sage)]">{capturedIdeas.length}</strong> pending
              captured {capturedIdeas.length === 1 ? 'idea' : 'ideas'}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Showing <strong className="text-[var(--barn-ink)]">{visibleItemCount}</strong>
            </span>
          </div>

          <div className="relative w-full sm:w-72">
            <label htmlFor={searchId} className="sr-only">
              Filter backlog suggestions
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
              placeholder="Filter backlog items..."
              className="w-full min-h-[40px] sm:min-h-[36px] pl-8 pr-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-ink)]"
            />
          </div>
        </div>

        {parsedBacklog.sections.length > 1 && (
          <div
            role="tablist"
            aria-label="Filter backlog by priority section"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedSectionId === 'all'}
              onClick={() => setSelectedSectionId('all')}
              className={`min-h-[48px] px-3.5 py-2.5 rounded-xl text-left transition-colors flex flex-col justify-center gap-0.5 ${
                selectedSectionId === 'all'
                  ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                  : 'bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)]'
              }`}
            >
              <span className="text-xs font-semibold tabular-nums">
                All Sections ({parsedBacklog.totalItems})
              </span>
              <span
                className={`text-[11px] leading-snug ${
                  selectedSectionId === 'all'
                    ? 'text-[var(--barn-on-sage)]/90'
                    : 'text-[var(--barn-muted)]'
                }`}
              >
                Show every remaining severity and priority level
              </span>
            </button>
            {parsedBacklog.sections.map((section) => {
              const active = selectedSectionId === section.id;
              const severityDesc = getBacklogSectionSeverityDescription(section);
              return (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedSectionId(section.id)}
                  className={`min-h-[48px] px-3.5 py-2.5 rounded-xl text-left transition-colors flex flex-col justify-center gap-0.5 ${
                    active
                      ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                      : 'bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)]'
                  }`}
                >
                  <span className="text-xs font-semibold tabular-nums">
                    {section.title.split(':')[0]} ({section.items.length})
                  </span>
                  <span
                    className={`text-[11px] leading-snug ${
                      active ? 'text-[var(--barn-on-sage)]/90' : 'text-[var(--barn-muted)]'
                    }`}
                  >
                    {severityDesc}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {actionFeedback && (
          <div
            role="status"
            aria-live="polite"
            className="p-3 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs text-[var(--barn-ink)]"
          >
            {actionFeedback}
          </div>
        )}

        {ideasError && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)]"
          >
            {ideasError}
          </div>
        )}
      </header>

      {/* Isolated New Idea Capture Composer */}
      <IdeaCaptureComposer
        isOpen={isCaptureOpen}
        onClose={() => setIsCaptureOpen(false)}
        onIdeaSaved={handleIdeaSaved}
      />

      {/* Pending / Captured Ideas Section */}
      <section
        aria-label="Pending and Captured Ideas"
        className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-0.5 min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold text-[var(--barn-ink)] flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>Pending / Captured Ideas</span>
            </h2>
            <p className="text-xs text-[var(--barn-muted)] leading-relaxed">
              Ongoing offline list stored locally (up to {MAX_CAPTURED_IDEAS_COUNT} entries). Copy
              or export when ready to merge into{' '}
              <code className="font-mono text-[var(--barn-ink)]">{SUGGESTIONS_BACKLOG_PATH}</code>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={capturedIdeas.length === 0 || exportLock.isSubmitting}
              onClick={() => void handleCopyIdeas()}
              className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-45"
            >
              <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Copy / Export Ideas</span>
            </button>

            <button
              type="button"
              disabled={capturedIdeas.length === 0 || exportLock.isSubmitting}
              onClick={() => void handleExportMarkdown()}
              className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-45"
            >
              <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Export .MD</span>
            </button>

            <button
              type="button"
              disabled={capturedIdeas.length === 0 || exportLock.isSubmitting}
              onClick={() => void handleExportJson()}
              className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-45"
            >
              <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Export .JSON</span>
            </button>

            {capturedIdeas.length > 0 && (
              <button
                type="button"
                disabled={exportLock.isSubmitting}
                onClick={() => void handleClearIdeas()}
                className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold text-[var(--barn-terracotta)] inline-flex items-center justify-center gap-1.5 disabled:opacity-45"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Clear All</span>
              </button>
            )}
          </div>
        </div>

        {!ideasLoaded ? (
          <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-muted)]">
            Loading offline captured ideas...
          </div>
        ) : capturedIdeas.length === 0 ? (
          <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-muted)]">
            No pending ideas captured yet. Tap <strong className="text-[var(--barn-ink)]">New Idea</strong>{' '}
            above to record a suggestion offline.
          </div>
        ) : (
          <ul className="space-y-2.5">
            {capturedIdeas.map((idea) => (
              <li
                key={idea.id}
                className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] flex flex-wrap items-start justify-between gap-3"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="font-mono text-[11px] text-[var(--barn-muted)] tabular-nums">
                    Captured {new Date(idea.createdAtIso).toLocaleString()}
                  </div>
                  <p className="text-xs sm:text-sm text-[var(--barn-ink)] leading-relaxed break-words">
                    {formatSanitizedIdeaForDisplay(idea.text)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleDeleteIdea(idea.id)}
                  aria-label="Remove captured idea"
                  className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] px-2.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium text-[var(--barn-muted)] hover:text-[var(--barn-terracotta)] inline-flex items-center justify-center gap-1 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="sm:hidden">Remove</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Master Suggestion Backlog Sections */}
      <BacklogSectionsView
        sections={filteredSections}
        isEmptyBacklog={parsedBacklog.isEmpty}
        searchQuery={searchQuery}
      />

      {parsedBacklog.auditNote && (
        <section
          aria-label="Backlog Audit History Note"
          className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 space-y-1.5 text-xs"
        >
          <div className="font-semibold text-[var(--barn-ink)]">Backlog Audit Note</div>
          <p className="text-[var(--barn-muted)] leading-relaxed">{parsedBacklog.auditNote}</p>
        </section>
      )}
    </div>
  );
}
