/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Species-Isolated Personal Barn Journal Screen (`src/components/BarnJournalScreen.tsx`).
 *
 * Date-organized private journal featuring:
 * - Rich-text notes reusing safe plain-text AST rendering (`parseMemoBlocks`) & formatting toolbar
 * - Interactive checklists toggleable directly inside timeline cards
 * - Color categories, 0–5 star ratings, pinning & #tag normalization
 * - Multi-token full-text search across titles, bodies, tags, categories, and linked animals
 * - Markdown, CSV & printable journal book exports (`PrintPreviewModal`)
 */

import {
  ArrowLeft,
  Bold,
  BookOpen,
  Calendar,
  CheckSquare,
  Download,
  Edit3,
  Eye,
  Heading2,
  Italic,
  List,
  Pencil,
  Pin,
  Plus,
  Printer,
  Search,
  Smile,
  Square,
  Star,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import React, { FormEvent, useCallback, useId, useMemo, useRef, useState } from 'react';
import {
  createBarnJournalEntryDraft,
  exportBarnJournalCsv,
  exportBarnJournalMarkdown,
  filterAndSearchJournalEntries,
  formatJournalMonthLabel,
  generateBarnJournalHtml,
  getJournalCategoryMeta,
  groupJournalEntriesByMonthAndDate,
  normalizeJournalTags,
  summarizeJournalStats,
} from '../core/barnJournal';
import {
  BarnJournalEntry,
  BarnSettings,
  formatReadableDate,
  JOURNAL_COLOR_CATEGORIES,
  JournalColorCategory,
  JournalStarRating,
  todayDateIso,
} from '../core/models';
import {
  applyMemoFormatAction,
  MAX_SPECIES_MEMO_CHARS,
  MEMO_EMOJI_PALETTE,
  MemoFormatAction,
  MemoInlineToken,
  parseMemoBlocks,
  sanitizeSpeciesMemo,
  toggleMemoChecklistLine,
} from '../core/speciesMemo';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { useAsyncKeyedLock, useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import { downloadTextFile } from '../utils/webFileActions';
import { PrintPreviewModal } from './PrintPreviewModal';

export interface BarnJournalScreenProps {
  activeData: ActiveSpeciesData;
  settings: BarnSettings;
  onBackToHub: () => void;
  onOpenMemo?: () => void;
  onOpenAnimal: (animalId: string) => void;
  onSaveJournalEntry: (
    draft: Omit<BarnJournalEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<string | null> | Promise<boolean> | void;
  onDeleteJournalEntry: (id: string) => Promise<void> | void;
}

interface JournalEditorState {
  id?: string;
  entryDateIso: string;
  title: string;
  body: string;
  colorCategory: JournalColorCategory;
  starRating: JournalStarRating;
  tagsInput: string;
  pinned: boolean;
  linkedAnimalIds: string[];
}

function makeEmptyEditorState(): JournalEditorState {
  const draft = createBarnJournalEntryDraft('Rabbit');
  return {
    entryDateIso: draft.entryDateIso,
    title: '',
    body: '',
    colorCategory: draft.colorCategory,
    starRating: 0,
    tagsInput: '',
    pinned: false,
    linkedAnimalIds: [],
  };
}

function entryToEditorState(entry: BarnJournalEntry): JournalEditorState {
  return {
    id: entry.id,
    entryDateIso: entry.entryDateIso,
    title: entry.title,
    body: entry.body,
    colorCategory: entry.colorCategory,
    starRating: entry.starRating,
    tagsInput: entry.tags.join(', '),
    pinned: entry.pinned,
    linkedAnimalIds: entry.linkedAnimalIds ?? [],
  };
}

function renderInlineTokens(tokens: MemoInlineToken[]) {
  return tokens.map((tok, i) => {
    if (tok.type === 'bold') {
      return (
        <strong key={i} className="font-semibold text-[var(--barn-ink)]">
          {tok.text}
        </strong>
      );
    }
    if (tok.type === 'italic') {
      return (
        <em key={i} className="italic">
          {tok.text}
        </em>
      );
    }
    return <React.Fragment key={i}>{tok.text}</React.Fragment>;
  });
}

function JournalRichTextBody({
  body,
  onToggleChecklist,
}: {
  body: string;
  onToggleChecklist?: (lineIndex: number) => void;
}) {
  const blocks = useMemo(() => parseMemoBlocks(body), [body]);
  if (blocks.length === 0) {
    return <p className="text-xs text-[var(--barn-muted)] italic">No body text recorded.</p>;
  }
  return (
    <div className="space-y-1.5 text-xs sm:text-sm leading-relaxed text-[var(--barn-ink)] break-words">
      {blocks.map((block) => {
        if (block.type === 'blank') {
          return <div key={block.lineIndex} className="h-1.5" aria-hidden="true" />;
        }
        if (block.type === 'heading') {
          return (
            <h4
              key={block.lineIndex}
              className="font-display text-sm sm:text-base font-semibold pt-1 first:pt-0"
            >
              {renderInlineTokens(block.tokens)}
            </h4>
          );
        }
        if (block.type === 'checklist') {
          return (
            <div key={block.lineIndex} className="flex items-start gap-2">
              <button
                type="button"
                disabled={!onToggleChecklist}
                onClick={() => onToggleChecklist?.(block.lineIndex)}
                aria-label={
                  block.checked ? 'Mark checklist item incomplete' : 'Mark checklist item done'
                }
                className="mt-0.5 text-[var(--barn-sage)] hover:opacity-80 shrink-0 disabled:opacity-60"
              >
                {block.checked ? (
                  <CheckSquare className="w-4 h-4" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>
              <span className={block.checked ? 'line-through text-[var(--barn-muted)]' : undefined}>
                {renderInlineTokens(block.tokens)}
              </span>
            </div>
          );
        }
        if (block.type === 'bullet') {
          return (
            <div key={block.lineIndex} className="flex items-start gap-2 pl-1">
              <span aria-hidden="true" className="text-[var(--barn-sage)] font-bold">
                •
              </span>
              <span>{renderInlineTokens(block.tokens)}</span>
            </div>
          );
        }
        return <p key={block.lineIndex}>{renderInlineTokens(block.tokens)}</p>;
      })}
    </div>
  );
}

export function BarnJournalScreen({
  activeData,
  settings,
  onBackToHub,
  onOpenMemo,
  onOpenAnimal,
  onSaveJournalEntry,
  onDeleteJournalEntry,
}: BarnJournalScreenProps) {
  const { speciesProfile, journalEntries, animals, herdById } = activeData;
  const baseId = useId();

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | JournalColorCategory>('all');
  const [minStarsFilter, setMinStarsFilter] = useState<JournalStarRating>(0);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [activeMonthFilter, setActiveMonthFilter] = useState<string>('all');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<JournalEditorState>(() => makeEmptyEditorState());
  const [editorViewMode, setEditorViewMode] = useState<'write' | 'preview'>('write');
  const [showEmojiBar, setShowEmojiBar] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);

  const submitLock = useAsyncSubmitLock({ postSettleCooldownMs: 200 });
  const entryActionLock = useAsyncKeyedLock();

  const closeEditor = useCallback(() => {
    setFormError(null);
    setEditorOpen(false);
  }, []);

  const dialogRef = useAccessibleDialog({
    isOpen: editorOpen,
    onClose: closeEditor,
  });

  const stats = useMemo(() => summarizeJournalStats(journalEntries), [journalEntries]);

  const filteredEntries = useMemo(() => {
    const base = filterAndSearchJournalEntries(
      journalEntries,
      {
        query,
        colorCategory: categoryFilter,
        minStars: minStarsFilter,
        pinnedOnly,
      },
      animals
    );
    if (activeMonthFilter === 'all') return base;
    return base.filter((e) => e.entryDateIso.startsWith(activeMonthFilter));
  }, [journalEntries, query, categoryFilter, minStarsFilter, pinnedOnly, activeMonthFilter, animals]);

  const monthGroups = useMemo(
    () => groupJournalEntriesByMonthAndDate(filteredEntries),
    [filteredEntries]
  );

  const printableHtml = useMemo(() => {
    if (!printOpen) return '';
    return generateBarnJournalHtml({
      entries: filteredEntries,
      barnName: settings.barnName || 'Pedigree Barn',
      breederName: settings.breederName || '',
      speciesName: speciesProfile.name,
      animals,
    });
  }, [
    printOpen,
    filteredEntries,
    settings.barnName,
    settings.breederName,
    speciesProfile.name,
    animals,
  ]);

  const applyFormat = (action: MemoFormatAction) => {
    if (editorViewMode !== 'write') {
      setEditorViewMode('write');
    }
    const el = bodyTextareaRef.current;
    const selStart = el ? el.selectionStart : editor.body.length;
    const selEnd = el ? el.selectionEnd : editor.body.length;
    const res = applyMemoFormatAction(editor.body, selStart, selEnd, action);
    pendingSelectionRef.current = {
      start: res.nextSelectionStart,
      end: res.nextSelectionEnd,
    };
    setEditor((prev) => ({ ...prev, body: res.nextText }));
    window.requestAnimationFrame(() => {
      const pending = pendingSelectionRef.current;
      if (pending && bodyTextareaRef.current) {
        pendingSelectionRef.current = null;
        bodyTextareaRef.current.focus();
        bodyTextareaRef.current.setSelectionRange(pending.start, pending.end);
      }
    });
  };

  const handleOpenCreate = () => {
    setEditor(makeEmptyEditorState());
    setEditorViewMode('write');
    setFormError(null);
    setEditorOpen(true);
  };

  const handleOpenEdit = (entry: BarnJournalEntry) => {
    setEditor(entryToEditorState(entry));
    setEditorViewMode('write');
    setFormError(null);
    setEditorOpen(true);
  };

  const handleSaveEditor = async (e: FormEvent) => {
    e.preventDefault();
    const cleanTitle = editor.title.trim();
    const cleanBody = sanitizeSpeciesMemo(editor.body, MAX_SPECIES_MEMO_CHARS);
    if (!cleanTitle && !cleanBody.trim()) {
      setFormError('Please enter a title or journal note.');
      return;
    }
    setFormError(null);
    const res = await submitLock.runLocked(async () => {
      const saved = await onSaveJournalEntry({
        ...(editor.id ? { id: editor.id } : {}),
        species: speciesProfile.name,
        entryDateIso: editor.entryDateIso || todayDateIso(),
        title: cleanTitle || 'Barn Journal Entry',
        body: cleanBody,
        colorCategory: editor.colorCategory,
        starRating: editor.starRating,
        tags: normalizeJournalTags(editor.tagsInput),
        pinned: editor.pinned,
        ...(editor.linkedAnimalIds.length > 0
          ? { linkedAnimalIds: editor.linkedAnimalIds }
          : {}),
      });
      if (saved === false || saved === null) return null;
      return typeof saved === 'string' ? saved : 'saved';
    });
    if (!res.skipped && res.value !== null) {
      setEditorOpen(false);
    }
  };

  const handleQuickUpdateEntry = async (
    entry: BarnJournalEntry,
    patch: Partial<BarnJournalEntry>,
    lockKey: string
  ) => {
    await entryActionLock.runKeyLocked(lockKey, async () => {
      const saved = await onSaveJournalEntry({
        ...entry,
        ...patch,
      });
      if (saved === false || saved === null) return null;
      return typeof saved === 'string' ? saved : 'saved';
    });
  };

  const handleExportMarkdown = async () => {
    const md = exportBarnJournalMarkdown(
      filteredEntries,
      settings.barnName || 'Barn',
      speciesProfile.name,
      animals
    );
    const slug = speciesProfile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await downloadTextFile(`${slug}-journal-${todayDateIso()}.md`, md, 'text/markdown;charset=utf-8');
  };

  const handleExportCsv = async () => {
    const csv = exportBarnJournalCsv(filteredEntries, animals);
    const slug = speciesProfile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await downloadTextFile(`${slug}-journal-${todayDateIso()}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const previewTags = useMemo(() => normalizeJournalTags(editor.tagsInput), [editor.tagsInput]);

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBackToHub}
              className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Back to {speciesProfile.name} Hub
            </button>
            {onOpenMemo && (
              <button
                type="button"
                onClick={onOpenMemo}
                className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
              >
                <StickyNote className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                Open Scratch Memo Pad
              </button>
            )}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            {speciesProfile.name} Personal Barn Journal
          </h1>
          <p className="text-xs text-[var(--barn-muted)]">
            Date-organized breeding diary, show prep notes, color categories, star ratings, tags,
            and full-text search.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleExportMarkdown()}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Markdown
          </button>
          <button
            type="button"
            onClick={() => void handleExportCsv()}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => setPrintOpen(true)}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            Print Journal
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            New Journal Entry
          </button>
        </div>
      </section>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--barn-muted)]">
            Journal Entries
          </div>
          <div className="text-xl font-bold font-mono tabular-nums">{stats.totalEntries}</div>
          <div className="text-[11px] text-[var(--barn-muted)]">
            {stats.monthKeys.length} active month{stats.monthKeys.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--barn-muted)]">
            Pinned Entries
          </div>
          <div className="text-xl font-bold font-mono tabular-nums">{stats.pinnedCount}</div>
          <div className="text-[11px] text-[var(--barn-muted)]">Quick top-of-journal access</div>
        </div>
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--barn-muted)]">
            Average Rating
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
            {stats.ratedCount > 0 ? `${stats.averageRating} ★` : '—'}
          </div>
          <div className="text-[11px] text-[var(--barn-muted)]">
            {stats.ratedCount} rated entries
          </div>
        </div>
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--barn-muted)]">
            5-Star Highlights
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-[var(--barn-sage)]">
            {stats.fiveStarCount}
          </div>
          <div className="text-[11px] text-[var(--barn-muted)]">Top barn milestones</div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Full-text search across titles, notes, #tags, category, dates & linked animals..."
              aria-label="Full-text search journal entries"
              className="w-full min-h-[40px] pl-9 pr-9 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear journal search"
                className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[28px] min-w-[28px] flex items-center justify-center text-[var(--barn-muted)]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Minimum star rating filter"
              value={minStarsFilter}
              onChange={(e) => setMinStarsFilter(Number(e.target.value) as JournalStarRating)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
            >
              <option value={0}>All Ratings</option>
              <option value={1}>1★ &amp; Up</option>
              <option value={2}>2★ &amp; Up</option>
              <option value={3}>3★ &amp; Up</option>
              <option value={4}>4★ &amp; Up</option>
              <option value={5}>5★ Only</option>
            </select>

            <button
              type="button"
              aria-pressed={pinnedOnly}
              onClick={() => setPinnedOnly((v) => !v)}
              className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 ${
                pinnedOnly
                  ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] border-transparent'
                  : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
              }`}
            >
              <Pin className="w-3.5 h-3.5" aria-hidden="true" />
              Pinned Only
            </button>
          </div>
        </div>

        {/* Color Categories & Month Jump */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-pressed={categoryFilter === 'all'}
              onClick={() => setCategoryFilter('all')}
              className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                categoryFilter === 'all'
                  ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] border-transparent'
                  : 'border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[var(--barn-muted)]'
              }`}
            >
              All Categories ({journalEntries.length})
            </button>
            {JOURNAL_COLOR_CATEGORIES.map((cat) => {
              const active = categoryFilter === cat.id;
              const count = stats.byCategory[cat.id] || 0;
              return (
                <button
                  key={cat.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategoryFilter(active ? 'all' : cat.id)}
                  className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1.5 ${
                    active
                      ? 'border-[var(--barn-ink)] bg-[var(--barn-subtle)] font-semibold'
                      : 'border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)]'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: cat.hexAccent }}
                    aria-hidden="true"
                  />
                  <span>{cat.label}</span>
                  <span className="font-mono text-[10px] text-[var(--barn-muted)]">({count})</span>
                </button>
              );
            })}
          </div>

          {stats.monthKeys.length > 0 && (
            <select
              aria-label="Filter by month"
              value={activeMonthFilter}
              onChange={(e) => setActiveMonthFilter(e.target.value)}
              className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[11px] font-medium"
            >
              <option value="all">All Months</option>
              {stats.monthKeys.map((mk) => (
                <option key={mk} value={mk}>
                  {formatJournalMonthLabel(mk)}
                </option>
              ))}
            </select>
          )}
        </div>
      </section>

      {/* Date-Organized Timeline */}
      {monthGroups.length === 0 ? (
        <section className="bg-[var(--barn-surface)] border border-dashed border-[var(--barn-border)] rounded-2xl p-8 text-center space-y-3">
          <BookOpen className="w-7 h-7 text-[var(--barn-muted)] mx-auto" aria-hidden="true" />
          <p className="text-sm text-[var(--barn-muted)]">
            {journalEntries.length === 0
              ? `No ${speciesProfile.name.toLowerCase()} personal journal entries yet. Start a date-organized log of herd observations, show reflections, or breeding notes.`
              : 'No journal entries matched your search or filter criteria.'}
          </p>
          {journalEntries.length === 0 ? (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Write First Journal Entry
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setCategoryFilter('all');
                setMinStarsFilter(0);
                setPinnedOnly(false);
                setActiveMonthFilter('all');
              }}
              className="min-h-[36px] px-3 py-1 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)]"
            >
              Reset All Filters
            </button>
          )}
        </section>
      ) : (
        <div className="space-y-6">
          {monthGroups.map((month) => (
            <section key={month.monthKey} className="space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--barn-border)] pb-1.5">
                <h2 className="font-display text-lg font-semibold text-[var(--barn-ink)]">
                  {month.monthLabel}
                </h2>
                <span className="text-xs font-mono text-[var(--barn-muted)]">
                  {month.entryCount} entr{month.entryCount === 1 ? 'y' : 'ies'}
                </span>
              </div>

              <div className="space-y-4">
                {month.dates.map((dateGroup) => (
                  <div key={dateGroup.dateIso} className="space-y-2.5">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[var(--barn-muted)] flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{dateGroup.dateLabel}</span>
                    </div>

                    <div className="space-y-3">
                      {dateGroup.entries.map((entry) => {
                        const catMeta = getJournalCategoryMeta(entry.colorCategory);
                        const linkedAnimals = (entry.linkedAnimalIds ?? [])
                          .map((id) => herdById.get(id))
                          .filter((a): a is NonNullable<typeof a> => Boolean(a));
                        const busy =
                          entryActionLock.isKeyLocked(`pin:${entry.id}`) ||
                          entryActionLock.isKeyLocked(`del:${entry.id}`);

                        return (
                          <article
                            key={entry.id}
                            style={{ borderLeftWidth: '5px', borderLeftColor: catMeta.hexAccent }}
                            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-3"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                              <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className="px-2 py-0.5 rounded-md text-[10px] font-semibold border border-[var(--barn-border)] bg-[var(--barn-canvas)] inline-flex items-center gap-1"
                                  >
                                    <span
                                      className="w-2 h-2 rounded-full"
                                      style={{ backgroundColor: catMeta.hexAccent }}
                                      aria-hidden="true"
                                    />
                                    {catMeta.label}
                                  </span>
                                  {entry.pinned && (
                                    <span className="px-2 py-0.5 rounded-md bg-[var(--barn-sage-tint)] text-[var(--barn-sage)] text-[10px] font-semibold inline-flex items-center gap-1">
                                      <Pin className="w-3 h-3" aria-hidden="true" />
                                      Pinned
                                    </span>
                                  )}
                                  <div
                                    role="group"
                                    aria-label={`Star rating for ${entry.title}`}
                                    className="inline-flex items-center gap-0.5"
                                  >
                                    {([1, 2, 3, 4, 5] as const).map((star) => {
                                      const filled = entry.starRating >= star;
                                      return (
                                        <button
                                          key={star}
                                          type="button"
                                          disabled={busy}
                                          onClick={() =>
                                            void handleQuickUpdateEntry(
                                              entry,
                                              {
                                                starRating:
                                                  entry.starRating === star ? 0 : star,
                                              },
                                              `star:${entry.id}`
                                            )
                                          }
                                          aria-label={`Set ${star} star rating`}
                                          className="p-0.5 rounded hover:bg-[var(--barn-subtle)]"
                                        >
                                          <Star
                                            className={`w-3.5 h-3.5 ${
                                              filled
                                                ? 'fill-amber-500 text-amber-500'
                                                : 'text-[var(--barn-muted)]/50'
                                            }`}
                                            aria-hidden="true"
                                          />
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                <h3 className="font-display text-base sm:text-lg font-semibold text-[var(--barn-ink)]">
                                  {entry.title}
                                </h3>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void handleQuickUpdateEntry(
                                      entry,
                                      { pinned: !entry.pinned },
                                      `pin:${entry.id}`
                                    )
                                  }
                                  aria-label={entry.pinned ? 'Unpin entry' : 'Pin entry'}
                                  className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-xs inline-flex items-center gap-1 ${
                                    entry.pinned
                                      ? 'border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] text-[var(--barn-sage)]'
                                      : 'border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-[var(--barn-muted)]'
                                  }`}
                                >
                                  <Pin className="w-3.5 h-3.5" aria-hidden="true" />
                                  {entry.pinned ? 'Pinned' : 'Pin'}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(entry)}
                                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs inline-flex items-center gap-1"
                                >
                                  <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                                  Edit
                                </button>

                                {confirmDeleteId === entry.id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      disabled={entryActionLock.isKeyLocked(`del:${entry.id}`)}
                                      onClick={() =>
                                        void entryActionLock.runKeyLocked(
                                          `del:${entry.id}`,
                                          async () => {
                                            await onDeleteJournalEntry(entry.id);
                                            setConfirmDeleteId(null);
                                          }
                                        )
                                      }
                                      className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-terracotta)] text-white text-xs font-semibold"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="min-h-[32px] px-2 py-1 rounded-lg border border-[var(--barn-border)] text-xs"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(entry.id)}
                                    aria-label={`Delete ${entry.title}`}
                                    className="min-h-[32px] min-w-[32px] rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-[var(--barn-terracotta)] flex items-center justify-center"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <JournalRichTextBody
                              body={entry.body}
                              onToggleChecklist={(lineIdx) => {
                                const nextBody = toggleMemoChecklistLine(entry.body, lineIdx);
                                void handleQuickUpdateEntry(
                                  entry,
                                  { body: nextBody },
                                  `chk:${entry.id}:${lineIdx}`
                                );
                              }}
                            />

                            {(entry.tags.length > 0 || linkedAnimals.length > 0) && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[var(--barn-border)]/70">
                                {entry.tags.map((tag) => (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => setQuery(tag)}
                                    className="px-2 py-0.5 rounded-md bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[11px] font-mono text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
                                  >
                                    #{tag}
                                  </button>
                                ))}
                                {linkedAnimals.map((a) => (
                                  <button
                                    key={a.id}
                                    type="button"
                                    onClick={() => onOpenAnimal(a.id)}
                                    className="px-2 py-0.5 rounded-md bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/40 text-[11px] font-medium text-[var(--barn-sage)] hover:underline"
                                  >
                                    {a.name}
                                    {a.tattoo ? ` (${a.tattoo})` : ''}
                                  </button>
                                ))}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Add / Edit Journal Entry Modal */}
      {editorOpen && (
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${baseId}-modal-title`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEditor();
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <form
            onSubmit={(e) => void handleSaveEditor(e)}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id={`${baseId}-modal-title`} className="font-display text-lg font-bold">
                  {editor.id ? 'Edit Journal Entry' : `New ${speciesProfile.name} Journal Entry`}
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  Rich formatting is stored safely as plain text (no scripts or raw HTML).
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                aria-label="Close journal editor"
                className="min-h-[36px] min-w-[36px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {formError && (
              <div
                role="alert"
                className="p-2.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs font-semibold text-[var(--barn-danger)]"
              >
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label
                  htmlFor={`${baseId}-title`}
                  className="block font-medium text-[var(--barn-muted)] mb-1"
                >
                  Entry Title *
                </label>
                <input
                  id={`${baseId}-title`}
                  type="text"
                  required
                  placeholder="e.g. Spring Show Coat Evaluations"
                  value={editor.title}
                  onChange={(e) => setEditor((p) => ({ ...p, title: e.target.value }))}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-medium"
                />
              </div>
              <div>
                <label
                  htmlFor={`${baseId}-date`}
                  className="block font-medium text-[var(--barn-muted)] mb-1"
                >
                  Entry Date *
                </label>
                <input
                  id={`${baseId}-date`}
                  type="date"
                  required
                  value={editor.entryDateIso}
                  onChange={(e) => setEditor((p) => ({ ...p, entryDateIso: e.target.value }))}
                  className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </div>
            </div>

            {/* Color Category, Star Rating, Pin */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs items-start">
              <div className="md:col-span-6 space-y-1">
                <div className="font-medium text-[var(--barn-muted)]">Color Category</div>
                <div className="flex flex-wrap gap-1.5">
                  {JOURNAL_COLOR_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      aria-pressed={editor.colorCategory === cat.id}
                      onClick={() => setEditor((p) => ({ ...p, colorCategory: cat.id }))}
                      className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-[11px] inline-flex items-center gap-1.5 ${
                        editor.colorCategory === cat.id
                          ? 'border-[var(--barn-ink)] bg-[var(--barn-subtle)] font-semibold'
                          : 'border-[var(--barn-border)] bg-[var(--barn-canvas)]'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: cat.hexAccent }}
                        aria-hidden="true"
                      />
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-4 space-y-1">
                <div className="font-medium text-[var(--barn-muted)]">Star Rating</div>
                <div className="flex items-center gap-1">
                  {([1, 2, 3, 4, 5] as const).map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() =>
                        setEditor((p) => ({
                          ...p,
                          starRating: p.starRating === star ? 0 : star,
                        }))
                      }
                      aria-label={`Rate ${star} stars`}
                      className="min-h-[32px] min-w-[32px] rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] flex items-center justify-center hover:bg-[var(--barn-subtle)]"
                    >
                      <Star
                        className={`w-4 h-4 ${
                          editor.starRating >= star
                            ? 'fill-amber-500 text-amber-500'
                            : 'text-[var(--barn-muted)]/50'
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-2 space-y-1">
                <div className="font-medium text-[var(--barn-muted)]">Pin</div>
                <button
                  type="button"
                  aria-pressed={editor.pinned}
                  onClick={() => setEditor((p) => ({ ...p, pinned: !p.pinned }))}
                  className={`w-full min-h-[32px] px-2.5 py-1 rounded-lg border text-xs font-medium inline-flex items-center justify-center gap-1 ${
                    editor.pinned
                      ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] border-transparent'
                      : 'border-[var(--barn-border)] bg-[var(--barn-canvas)]'
                  }`}
                >
                  <Pin className="w-3.5 h-3.5" aria-hidden="true" />
                  {editor.pinned ? 'Pinned' : 'Pin'}
                </button>
              </div>
            </div>

            {/* Rich-Text Toolbar & Editor */}
            <div className="rounded-xl border border-[var(--barn-border)] overflow-hidden">
              <div className="px-3 py-2 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)] space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => applyFormat({ type: 'bold' })}
                      aria-label="Bold"
                      className="min-h-[30px] px-2 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs inline-flex items-center gap-1"
                    >
                      <Bold className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat({ type: 'italic' })}
                      aria-label="Italic"
                      className="min-h-[30px] px-2 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs inline-flex items-center gap-1"
                    >
                      <Italic className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat({ type: 'heading' })}
                      aria-label="Heading"
                      className="min-h-[30px] px-2 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs inline-flex items-center gap-1"
                    >
                      <Heading2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat({ type: 'bullet' })}
                      aria-label="Bullet List"
                      className="min-h-[30px] px-2 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs inline-flex items-center gap-1"
                    >
                      <List className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFormat({ type: 'checklist' })}
                      aria-label="Checklist Item"
                      className="min-h-[30px] px-2 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs inline-flex items-center gap-1"
                    >
                      <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        applyFormat({
                          type: 'date',
                          dateLabel: formatReadableDate(todayDateIso()),
                        })
                      }
                      aria-label="Insert Date Stamp"
                      className="min-h-[30px] px-2 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs inline-flex items-center gap-1"
                    >
                      <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEmojiBar((v) => !v)}
                      aria-label="Toggle emoji bar"
                      className="min-h-[30px] px-2 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs inline-flex items-center gap-1"
                    >
                      <Smile className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="inline-flex rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] p-0.5">
                    <button
                      type="button"
                      onClick={() => setEditorViewMode('write')}
                      className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 ${
                        editorViewMode === 'write'
                          ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                          : 'text-[var(--barn-muted)]'
                      }`}
                    >
                      <Pencil className="w-3 h-3" aria-hidden="true" />
                      Write
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorViewMode('preview')}
                      className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 ${
                        editorViewMode === 'preview'
                          ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                          : 'text-[var(--barn-muted)]'
                      }`}
                    >
                      <Eye className="w-3 h-3" aria-hidden="true" />
                      Preview
                    </button>
                  </div>
                </div>

                {showEmojiBar && (
                  <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-[var(--barn-border)]/70">
                    {MEMO_EMOJI_PALETTE.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => applyFormat({ type: 'emoji', emoji: item.emoji })}
                        aria-label={`Insert ${item.label}`}
                        className="min-h-[28px] min-w-[28px] rounded hover:bg-[var(--barn-subtle)] text-sm flex items-center justify-center"
                      >
                        {item.emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {editorViewMode === 'write' ? (
                <div className="p-3 bg-[var(--barn-surface)]">
                  <textarea
                    ref={bodyTextareaRef}
                    rows={8}
                    maxLength={MAX_SPECIES_MEMO_CHARS}
                    placeholder="Write formatted barn notes using **bold**, *italic*, ## headings, - bullets, or - [ ] checklists..."
                    value={editor.body}
                    onChange={(e) => setEditor((p) => ({ ...p, body: e.target.value }))}
                    className="w-full p-3 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm leading-relaxed resize-y"
                  />
                </div>
              ) : (
                <div className="p-4 min-h-[180px] bg-[var(--barn-surface)]">
                  <JournalRichTextBody
                    body={sanitizeSpeciesMemo(editor.body)}
                    onToggleChecklist={(lineIdx) =>
                      setEditor((p) => ({
                        ...p,
                        body: toggleMemoChecklistLine(p.body, lineIdx),
                      }))
                    }
                  />
                </div>
              )}
            </div>

            {/* Tags & Linked Animals */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1.5">
                <label
                  htmlFor={`${baseId}-tags`}
                  className="block font-medium text-[var(--barn-muted)]"
                >
                  Tags (comma-separated)
                </label>
                <input
                  id={`${baseId}-tags`}
                  type="text"
                  placeholder="molt, Nationals, kindling"
                  value={editor.tagsInput}
                  onChange={(e) => setEditor((p) => ({ ...p, tagsInput: e.target.value }))}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
                {previewTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {previewTags.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-[10px]"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="font-medium text-[var(--barn-muted)]">
                  Linked {speciesProfile.name} Animals ({editor.linkedAnimalIds.length})
                </div>
                {animals.length === 0 ? (
                  <p className="text-[11px] text-[var(--barn-muted)] italic">
                    No {speciesProfile.name.toLowerCase()} animals recorded yet.
                  </p>
                ) : (
                  <div className="max-h-28 overflow-y-auto rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-2 space-y-1">
                    {animals.map((a) => {
                      const checked = editor.linkedAnimalIds.includes(a.id);
                      return (
                        <label
                          key={a.id}
                          className="flex items-center gap-2 text-[11px] cursor-pointer hover:bg-[var(--barn-subtle)]/60 px-1.5 py-0.5 rounded"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setEditor((p) => ({
                                ...p,
                                linkedAnimalIds: checked
                                  ? p.linkedAnimalIds.filter((id) => id !== a.id)
                                  : [...p.linkedAnimalIds, a.id],
                              }))
                            }
                          />
                          <span className="truncate">
                            {a.name}
                            {a.tattoo ? ` (${a.tattoo})` : ''}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeEditor}
                className="min-h-[38px] px-4 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitLock.isSubmitting}
                className="min-h-[38px] px-5 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60"
              >
                {submitLock.isSubmitting
                  ? 'Saving...'
                  : editor.id
                  ? 'Save Journal Entry'
                  : 'Create Journal Entry'}
              </button>
            </div>
          </form>
        </div>
      )}

      {printOpen && (
        <PrintPreviewModal
          title={`${speciesProfile.name} Personal Barn Journal (${filteredEntries.length} entries)`}
          htmlContent={printableHtml}
          filename={`${speciesProfile.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')}-personal-journal.html`}
          onClose={() => setPrintOpen(false)}
        />
      )}
    </div>
  );
}
