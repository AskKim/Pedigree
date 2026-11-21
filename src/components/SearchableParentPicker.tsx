/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Searchable Parent Picker (`SearchableParentPicker`).
 *
 * Replaces a static `<select>` dropdown whenever "Include Archived" is enabled
 * during parent selection in Breedings, Pairings, or Animal Pedigree editing.
 */

import { Check, Search, X } from 'lucide-react';
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animal, doesAnimalNeedAttention, isAnimalArchived } from '../core/models';
import { clampComboboxIndex, stepEnabledComboboxIndex } from '../utils/comboboxNav';
import { useVirtualWindow } from '../utils/useVirtualWindow';

const PICKER_OPTION_ESTIMATE_PX = 38;
const PICKER_FALLBACK_VIEWPORT_PX = 208;

function matchesParentCandidateQuery(candidate: Animal, q: string): boolean {
  return (
    candidate.name.toLowerCase().includes(q) ||
    candidate.tattoo.toLowerCase().includes(q) ||
    candidate.breed.toLowerCase().includes(q) ||
    candidate.variety.toLowerCase().includes(q) ||
    candidate.registrationNumber.toLowerCase().includes(q)
  );
}

interface SearchableParentPickerProps {
  id?: string;
  label: string;
  value: string;
  candidates: Animal[];
  unknownLabel?: string;
  placeholder?: string;
  isConstrained?: boolean;
  onChange: (animalId: string) => void;
}

export function SearchableParentPicker({
  id,
  label,
  value,
  candidates,
  unknownLabel,
  placeholder,
  isConstrained = false,
  onChange,
}: SearchableParentPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listboxElRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const listboxId = useId();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectedAnimal = useMemo(
    () => (value ? candidates.find((c) => c.id === value) : undefined),
    [candidates, value]
  );

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => matchesParentCandidateQuery(c, q));
  }, [candidates, query]);

  const selectableOptions = useMemo(() => {
    const items: Array<
      | { kind: 'unknown'; id: ''; label: string }
      | { kind: 'animal'; id: string; candidate: Animal }
    > = [];
    if (unknownLabel) {
      items.push({ kind: 'unknown', id: '', label: unknownLabel });
    }
    for (const cand of filteredCandidates) {
      items.push({ kind: 'animal', id: cand.id, candidate: cand });
    }
    return items;
  }, [unknownLabel, filteredCandidates]);

  const pickerVirtual = useVirtualWindow({
    itemCount: isOpen ? selectableOptions.length : 0,
    estimateSize: PICKER_OPTION_ESTIMATE_PX,
    overscan: isConstrained ? 2 : 4,
    initialFallbackCount: isConstrained ? 10 : 16,
    resetKey: `${isOpen}::${query}::${selectableOptions.length}`,
  });

  const { scrollContainerRef: virtualScrollContainerRef, measureRowRef } = pickerVirtual;

  const setListboxRef = useCallback(
    (node: HTMLDivElement | null) => {
      listboxElRef.current = node;
      virtualScrollContainerRef(node);
    },
    [virtualScrollContainerRef]
  );

  const visibleOptions = useMemo(() => {
    if (!isOpen || selectableOptions.length === 0) return [];
    const { startIndex, endIndex } = pickerVirtual.windowRange;
    if (endIndex < startIndex) return [];
    return selectableOptions.slice(startIndex, endIndex + 1);
  }, [
    isOpen,
    selectableOptions,
    pickerVirtual.windowRange.startIndex,
    pickerVirtual.windowRange.endIndex,
  ]);

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(-1);
      optionRefs.current.clear();
      return;
    }
    setActiveIndex((prev) => clampComboboxIndex(prev, selectableOptions.length));
  }, [isOpen, selectableOptions.length]);

  useEffect(() => {
    const refs = optionRefs.current;
    return () => {
      refs.clear();
    };
  }, []);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    const mountedEl = optionRefs.current.get(activeIndex);
    if (mountedEl) {
      mountedEl.scrollIntoView?.({ block: 'nearest' });
      return;
    }
    const container = listboxElRef.current;
    if (!container) return;
    const viewportHeight = container.clientHeight || PICKER_FALLBACK_VIEWPORT_PX;
    const approxTop = activeIndex * PICKER_OPTION_ESTIMATE_PX;
    const approxBottom = approxTop + PICKER_OPTION_ESTIMATE_PX;
    if (approxTop < container.scrollTop) {
      container.scrollTop = approxTop;
    } else if (approxBottom > container.scrollTop + viewportHeight) {
      container.scrollTop = Math.max(0, approxBottom - viewportHeight);
    }
  }, [isOpen, activeIndex]);

  const handleSelect = (nextId: string) => {
    onChange(nextId);
    setQuery('');
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const activeOptionId =
    isOpen && activeIndex >= 0 && selectableOptions[activeIndex]
      ? `${listboxId}-opt-${activeIndex}`
      : undefined;

  return (
    <div
      ref={containerRef}
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node | null)) {
          setIsOpen(false);
          setActiveIndex(-1);
        }
      }}
      className="relative space-y-1.5"
    >
      <div className="relative">
        <Search
          className="w-4 h-4 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden="true"
        />
        <input
          id={id}
          type="search"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          aria-label={`Search ${label}`}
          placeholder={placeholder || `Search ${label} by name, ID, or breed...`}
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && isOpen) {
              e.preventDefault();
              e.stopPropagation();
              setIsOpen(false);
              setActiveIndex(-1);
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const next = stepEnabledComboboxIndex(
                isOpen ? activeIndex : -1,
                selectableOptions.length,
                e.key
              );
              if (!isOpen) setIsOpen(true);
              setActiveIndex(next);
            } else if ((e.key === 'Home' || e.key === 'End') && isOpen && selectableOptions.length > 0) {
              e.preventDefault();
              setActiveIndex(stepEnabledComboboxIndex(activeIndex, selectableOptions.length, e.key));
            } else if (e.key === 'Enter' && isOpen) {
              const highlighted = activeIndex >= 0 ? selectableOptions[activeIndex] : undefined;
              if (highlighted) {
                e.preventDefault();
                handleSelect(highlighted.id);
              } else if (filteredCandidates.length === 1) {
                e.preventDefault();
                handleSelect(filteredCandidates[0].id);
              }
            }
          }}
          className="w-full min-h-[42px] pl-9 pr-8 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--barn-sage)]"
        />
        {query && (
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery('');
              setActiveIndex(-1);
              setIsOpen(true);
            }}
            aria-label="Clear search query"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Currently Selected Summary Chip */}
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--barn-canvas)]/70 border border-[var(--barn-border)] text-xs min-w-0">
        {selectedAnimal ? (
          <>
            <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
              <Check className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span className="font-medium text-[var(--barn-ink)] truncate">
                {selectedAnimal.name}
                {selectedAnimal.tattoo ? ` (${selectedAnimal.tattoo})` : ''}
              </span>
              {isAnimalArchived(selectedAnimal) && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--barn-subtle)] text-[var(--barn-muted)] shrink-0">
                  Archived
                </span>
              )}
              {doesAnimalNeedAttention(selectedAnimal) && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--barn-terracotta-tint)] text-[var(--barn-terracotta)] shrink-0">
                  Needs Attention
                </span>
              )}
            </span>
            {unknownLabel && (
              <button
                type="button"
                onClick={() => handleSelect('')}
                className="text-[11px] text-[var(--barn-muted)] hover:text-[var(--barn-ink)] underline shrink-0"
              >
                Clear
              </button>
            )}
          </>
        ) : value ? (
          <span className="text-[var(--barn-muted)] truncate">
            Unlisted ID: {value.slice(0, 8)} — search above to change
          </span>
        ) : (
          <span className="text-[var(--barn-muted)] truncate">
            {unknownLabel || `None selected (${candidates.length} available)`}
          </span>
        )}
      </div>

      {/* Searchable Results Dropdown List (Virtualized) */}
      {isOpen && (
        <div
          ref={setListboxRef}
          id={listboxId}
          role="listbox"
          aria-label={`${label} search results`}
          className="absolute left-0 right-0 z-30 mt-1 max-h-52 overflow-y-auto rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] shadow-lg"
        >
          {pickerVirtual.windowRange.paddingTop > 0 && (
            <div
              aria-hidden="true"
              style={{ height: `${pickerVirtual.windowRange.paddingTop}px` }}
            />
          )}
          <div className="divide-y divide-[var(--barn-border)]">
            {visibleOptions.map((item, localIdx) => {
              const idx = pickerVirtual.windowRange.startIndex + localIdx;
              const optionId = `${listboxId}-opt-${idx}`;
              const isHighlighted = idx === activeIndex;
              const rowMeasure = measureRowRef(idx);

              if (item.kind === 'unknown') {
                return (
                  <button
                    key="__unknown__"
                    id={optionId}
                    ref={(el) => {
                      rowMeasure(el);
                      if (el) optionRefs.current.set(idx, el);
                      else optionRefs.current.delete(idx);
                    }}
                    type="button"
                    role="option"
                    aria-selected={value === ''}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => handleSelect('')}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--barn-subtle)] flex items-center justify-between gap-2 ${
                      value === '' ? 'bg-[var(--barn-sage-tint)] font-semibold' : ''
                    } ${
                      isHighlighted ? 'ring-2 ring-inset ring-[var(--barn-sage)] bg-[var(--barn-subtle)]' : ''
                    }`}
                  >
                    <span>{item.label}</span>
                    {value === '' && (
                      <Check className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                    )}
                  </button>
                );
              }

              const cand = item.candidate;
              const isSelected = cand.id === value;
              const archived = isAnimalArchived(cand);
              const needsAttn = doesAnimalNeedAttention(cand);
              return (
                <button
                  key={cand.id}
                  id={optionId}
                  ref={(el) => {
                    rowMeasure(el);
                    if (el) optionRefs.current.set(idx, el);
                    else optionRefs.current.delete(idx);
                  }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => handleSelect(cand.id)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--barn-subtle)] flex items-center justify-between gap-2 ${
                    isSelected ? 'bg-[var(--barn-sage-tint)] font-semibold' : ''
                  } ${
                    isHighlighted ? 'ring-2 ring-inset ring-[var(--barn-sage)] bg-[var(--barn-subtle)]' : ''
                  }`}
                >
                  <span className="min-w-0 truncate">
                    <span className="text-[var(--barn-ink)]">{cand.name}</span>
                    {cand.tattoo && (
                      <span className="font-mono text-[var(--barn-muted)] ml-1.5">
                        ({cand.tattoo})
                      </span>
                    )}
                    {cand.breed && (
                      <span className="text-[11px] text-[var(--barn-muted)] ml-1.5">
                        · {cand.breed}
                      </span>
                    )}
                  </span>
                  <span className="inline-flex items-center gap-1 shrink-0">
                    {archived && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--barn-subtle)] text-[var(--barn-muted)]">
                        Archived
                      </span>
                    )}
                    {needsAttn && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--barn-terracotta-tint)] text-[var(--barn-terracotta)]">
                        Needs Attention
                      </span>
                    )}
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          {pickerVirtual.windowRange.paddingBottom > 0 && (
            <div
              aria-hidden="true"
              style={{ height: `${pickerVirtual.windowRange.paddingBottom}px` }}
            />
          )}

          {filteredCandidates.length === 0 && (
            <div className="px-3 py-3 text-xs text-[var(--barn-muted)]">
              No matching {label.toLowerCase()} found for &ldquo;{query.trim()}&rdquo;.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
