/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Species-Isolated Permanent Memo Pad (`SpeciesMemoScreen`).
 *
 * Provides each livestock species with its own permanent, user-alterable local scratch pad:
 * - Preserves native keyboard emoji and includes a basic formatting & emoji toolbar.
 * - Enforces strict data hygiene (`sanitizeSpeciesMemo`) and safe plain-text AST rendering
 *   with zero HTML interpretation or code execution.
 */

import {
  ArrowLeft,
  Bold,
  Calendar,
  Check,
  CheckSquare,
  Eye,
  Heading2,
  Info,
  Italic,
  List,
  Pencil,
  Save,
  Smile,
  Square,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { formatReadableDate, SpeciesProfile, todayDateIso } from '../core/models';
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

interface SpeciesMemoScreenProps {
  speciesProfile: SpeciesProfile;
  onSaveMemo: (
    speciesId: string,
    memoText: string,
    options?: { silent?: boolean }
  ) => Promise<void> | void;
  onBackToHub: () => void;
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

export function SpeciesMemoScreen({
  speciesProfile,
  onSaveMemo,
  onBackToHub,
}: SpeciesMemoScreenProps) {
  const persistedMemo = sanitizeSpeciesMemo(speciesProfile.memoText ?? '');
  const [draft, setDraft] = useState<string>(persistedMemo);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [showEmojiBar, setShowEmojiBar] = useState<boolean>(true);
  const [confirmClear, setConfirmClear] = useState<boolean>(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const activeSpeciesIdRef = useRef<string>(speciesProfile.id);
  const draftRef = useRef<string>(draft);
  const lastSavedRef = useRef<string>(persistedMemo);
  const onSaveMemoRef = useRef(onSaveMemo);

  draftRef.current = draft;
  onSaveMemoRef.current = onSaveMemo;

  // Reset local editor cleanly when switching species
  useEffect(() => {
    const prevId = activeSpeciesIdRef.current;
    if (prevId !== speciesProfile.id && draftRef.current !== lastSavedRef.current) {
      void onSaveMemoRef.current(prevId, sanitizeSpeciesMemo(draftRef.current), { silent: true });
    }
    activeSpeciesIdRef.current = speciesProfile.id;
    const clean = sanitizeSpeciesMemo(speciesProfile.memoText ?? '');
    lastSavedRef.current = clean;
    setDraft(clean);
    setConfirmClear(false);
  }, [speciesProfile.id, speciesProfile.memoText]);

  // Flush any pending unsaved text when navigating away (e.g. straight to Settings & Backups)
  useEffect(() => {
    return () => {
      const clean = sanitizeSpeciesMemo(draftRef.current);
      if (clean !== lastSavedRef.current) {
        lastSavedRef.current = clean;
        void onSaveMemoRef.current(activeSpeciesIdRef.current, clean, { silent: true });
      }
    };
  }, []);

  // Debounced local autosave while typing
  useEffect(() => {
    if (draft === lastSavedRef.current) return;
    const targetId = speciesProfile.id;
    const nextValue = sanitizeSpeciesMemo(draft);
    const timer = window.setTimeout(() => {
      lastSavedRef.current = nextValue;
      void onSaveMemoRef.current(targetId, nextValue, { silent: true });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, speciesProfile.id]);

  // Restore cursor/selection cleanly after formatting bar action
  useEffect(() => {
    const pending = pendingSelectionRef.current;
    if (!pending || !textareaRef.current) return;
    pendingSelectionRef.current = null;
    const el = textareaRef.current;
    el.focus();
    el.setSelectionRange(pending.start, pending.end);
  }, [draft]);

  const flushSaveNow = (silent: boolean) => {
    const clean = sanitizeSpeciesMemo(draftRef.current);
    if (clean !== draftRef.current) {
      setDraft(clean);
    }
    lastSavedRef.current = clean;
    void onSaveMemo(speciesProfile.id, clean, { silent });
  };

  const handleDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const clean = sanitizeSpeciesMemo(e.target.value);
    setDraft(clean);
  };

  const handleFormat = (action: MemoFormatAction) => {
    if (viewMode !== 'edit') {
      setViewMode('edit');
    }
    const el = textareaRef.current;
    const selStart = el ? el.selectionStart : draft.length;
    const selEnd = el ? el.selectionEnd : draft.length;
    const res = applyMemoFormatAction(draft, selStart, selEnd, action);
    pendingSelectionRef.current = {
      start: res.nextSelectionStart,
      end: res.nextSelectionEnd,
    };
    setDraft(res.nextText);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === 'b') {
        e.preventDefault();
        handleFormat({ type: 'bold' });
      } else if (key === 'i') {
        e.preventDefault();
        handleFormat({ type: 'italic' });
      } else if (key === 's') {
        e.preventDefault();
        flushSaveNow(false);
      }
    }
  };

  const handleTogglePreviewChecklist = (lineIndex: number) => {
    const next = toggleMemoChecklistLine(draft, lineIndex);
    setDraft(next);
    lastSavedRef.current = next;
    void onSaveMemo(speciesProfile.id, next, { silent: true });
  };

  const handleClearMemo = () => {
    setDraft('');
    lastSavedRef.current = '';
    setConfirmClear(false);
    void onSaveMemo(speciesProfile.id, '', { silent: false });
  };

  const hasUnsavedChanges = draft !== lastSavedRef.current;
  const blocks = parseMemoBlocks(draft);
  const todayLabel = formatReadableDate(todayDateIso());

  return (
    <div className="space-y-4">
      {/* Page Header & Back Link */}
      <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <button
              type="button"
              onClick={() => {
                flushSaveNow(true);
                onBackToHub();
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--barn-muted)] hover:text-[var(--barn-ink)] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Back to {speciesProfile.name} Hub
            </button>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
              {speciesProfile.name} Memo Pad
            </h1>
            <p className="text-xs text-[var(--barn-muted)]">
              Permanent local scratch pad for {speciesProfile.name.toLowerCase()} notes, feed ratios,
              show reminders, and quick checklists. Saved automatically on this device.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center p-0.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <button
                type="button"
                onClick={() => setViewMode('edit')}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                  viewMode === 'edit'
                    ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                    : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                }`}
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                Write
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                  viewMode === 'preview'
                    ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                    : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                }`}
              >
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                Formatted View
              </button>
            </div>

            <button
              type="button"
              onClick={() => flushSaveNow(false)}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              {hasUnsavedChanges ? (
                <>
                  <Save className="w-3.5 h-3.5" aria-hidden="true" />
                  Save Memo
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  Saved
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Formatting Bar + Emoji Strip + Scratchpad Surface */}
      <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl overflow-hidden">
        {/* Basic Formatting Toolbar */}
        <div
          role="toolbar"
          aria-label={`${speciesProfile.name} memo formatting toolbar`}
          className="px-3 sm:px-4 py-2.5 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/60 space-y-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => handleFormat({ type: 'bold' })}
                title="Bold (**text**)"
                aria-label="Bold"
                className="min-h-[34px] min-w-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1"
              >
                <Bold className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Bold</span>
              </button>
              <button
                type="button"
                onClick={() => handleFormat({ type: 'italic' })}
                title="Italic (*text*)"
                aria-label="Italic"
                className="min-h-[34px] min-w-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1"
              >
                <Italic className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Italic</span>
              </button>
              <button
                type="button"
                onClick={() => handleFormat({ type: 'heading' })}
                title="Heading (## )"
                aria-label="Heading"
                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1"
              >
                <Heading2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Heading</span>
              </button>
              <button
                type="button"
                onClick={() => handleFormat({ type: 'bullet' })}
                title="Bullet list (- )"
                aria-label="Bullet List"
                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1"
              >
                <List className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">List</span>
              </button>
              <button
                type="button"
                onClick={() => handleFormat({ type: 'checklist' })}
                title="Checklist item (- [ ] )"
                aria-label="Checklist Item"
                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1"
              >
                <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Checklist</span>
              </button>
              <button
                type="button"
                onClick={() => handleFormat({ type: 'date', dateLabel: todayLabel })}
                title="Insert today's date stamp"
                aria-label="Insert Date"
                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1"
              >
                <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Date</span>
              </button>
              <button
                type="button"
                onClick={() => setShowEmojiBar((v) => !v)}
                aria-expanded={showEmojiBar}
                aria-label="Toggle emoji buttons"
                className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors ${
                  showEmojiBar
                    ? 'border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] text-[var(--barn-ink)]'
                    : 'border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)]'
                }`}
              >
                <Smile className="w-3.5 h-3.5" aria-hidden="true" />
                Emoji
              </button>
            </div>

            {draft.length > 0 && !confirmClear && (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-xs text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                Clear Pad
              </button>
            )}
          </div>

          {showEmojiBar && (
            <div
              aria-label="Quick emoji insert bar"
              className="flex flex-wrap items-center gap-1 pt-1 border-t border-[var(--barn-border)]/70"
            >
              {MEMO_EMOJI_PALETTE.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => handleFormat({ type: 'emoji', emoji: item.emoji })}
                  title={`Insert ${item.label} emoji`}
                  aria-label={`Insert ${item.label} emoji`}
                  className="min-h-[32px] min-w-[32px] px-1.5 rounded-lg hover:bg-[var(--barn-subtle)] text-base leading-none flex items-center justify-center transition-colors"
                >
                  {item.emoji}
                </button>
              ))}
              <span className="text-[11px] text-[var(--barn-muted)] ml-1">
                Keyboard emojis also supported
              </span>
            </div>
          )}

          {confirmClear && (
            <div className="p-2.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-danger)]/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-[var(--barn-ink)] font-medium">
                Clear all notes in the {speciesProfile.name} Memo Pad?
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClearMemo}
                  className="min-h-[30px] px-3 py-1 rounded-lg bg-[var(--barn-danger)] text-white font-semibold"
                >
                  Confirm Clear
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Editor or Safe Formatted View */}
        {viewMode === 'edit' ? (
          <div className="p-3 sm:p-4 space-y-2">
            <label htmlFor="species-memo-textarea" className="sr-only">
              {speciesProfile.name} Memo Pad Notes
            </label>
            <textarea
              id="species-memo-textarea"
              ref={textareaRef}
              value={draft}
              onChange={handleDraftChange}
              onKeyDown={handleKeyDown}
              onBlur={() => flushSaveNow(true)}
              rows={14}
              maxLength={MAX_SPECIES_MEMO_CHARS}
              placeholder={`Write permanent ${speciesProfile.name.toLowerCase()} scratch notes here...\n\nTips:\n## Section Heading\n**Bold** or *italic* text\n- Bullet item\n- [ ] Checklist item\nType any emoji from your keyboard or tap the bar above.`}
              className="w-full min-h-[320px] p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] focus:outline-none focus:ring-2 focus:ring-[var(--barn-sage)] text-sm leading-relaxed resize-y"
            />
          </div>
        ) : (
          <div className="p-4 sm:p-6 min-h-[340px]">
            {blocks.length === 0 ? (
              <p className="text-sm text-[var(--barn-muted)] italic">
                Nothing written in {speciesProfile.name} Memo Pad yet. Switch to Write to add notes.
              </p>
            ) : (
              <div className="space-y-2 text-sm leading-relaxed text-[var(--barn-ink)] break-words">
                {blocks.map((block) => {
                  if (block.type === 'blank') {
                    return <div key={block.lineIndex} className="h-2" aria-hidden="true" />;
                  }
                  if (block.type === 'heading') {
                    return (
                      <h2
                        key={block.lineIndex}
                        className="font-display text-lg font-semibold pt-2 first:pt-0 text-[var(--barn-ink)]"
                      >
                        {renderInlineTokens(block.tokens)}
                      </h2>
                    );
                  }
                  if (block.type === 'checklist') {
                    return (
                      <div key={block.lineIndex} className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => handleTogglePreviewChecklist(block.lineIndex)}
                          aria-label={
                            block.checked ? 'Mark checklist item incomplete' : 'Mark checklist item done'
                          }
                          className="mt-0.5 text-[var(--barn-sage)] hover:opacity-80 shrink-0"
                        >
                          {block.checked ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                        <span
                          className={
                            block.checked ? 'line-through text-[var(--barn-muted)]' : undefined
                          }
                        >
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
            )}
          </div>
        )}

        {/* Footer Metadata */}
        <div className="px-4 py-2.5 border-t border-[var(--barn-border)] bg-[var(--barn-canvas)]/40 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
          <span>
            {draft.length.toLocaleString()} / {MAX_SPECIES_MEMO_CHARS.toLocaleString()} chars · Plain
            text only (scripts disabled)
          </span>
          <span>
            {speciesProfile.memoUpdatedAt
              ? `Last saved ${formatReadableDate(speciesProfile.memoUpdatedAt.slice(0, 10))}`
              : 'Stored locally on device'}
          </span>
        </div>
      </section>

      <aside className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)]/70 px-4 py-3 flex items-start gap-2.5 text-xs text-[var(--barn-muted)]">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-[var(--barn-muted)]" aria-hidden="true" />
        <p className="leading-relaxed">
          <span className="font-medium text-[var(--barn-ink)]">Backups &amp; Portability:</span>{' '}
          Your {speciesProfile.name} Memo Pad contents are automatically included whenever you
          create a backup here (.ZIP, .JSON, or .SQLITE). Because per-species scratch pads are a
          feature specific to this app, most other pedigree or livestock apps will not import or
          display these memo notes if you load a backup into another program.
        </p>
      </aside>
    </div>
  );
}
