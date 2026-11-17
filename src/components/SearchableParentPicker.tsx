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
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animal, doesAnimalNeedAttention, isAnimalArchived } from '../core/models';
import { clampComboboxIndex, stepEnabledComboboxIndex } from '../utils/comboboxNav';

interface SearchableParentPickerProps {
  id?: string;
  label: string;
  value: string;
  candidates: Animal[];
  unknownLabel?: string;
  placeholder?: string;
  onChange: (animalId: string) => void;
}

export function SearchableParentPicker({
  id,
  label,
  value,
  candidates,
  unknownLabel,
  placeholder,
  onChange,
}: SearchableParentPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
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
    return candidates.filter((c) =>
      [c.name, c.tattoo, c.breed, c.variety, c.registrationNumber]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
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

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((prev) => clampComboboxIndex(prev, selectableOptions.length));
  }, [isOpen, selectableOptions.length]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: 'nearest' });
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

      {/* Searchable Results Dropdown List */}
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`${label} search results`}
          className="absolute left-0 right-0 z-30 mt-1 max-h-52 overflow-y-auto rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] shadow-lg divide-y divide-[var(--barn-border)]"
        >
          {selectableOptions.map((item, idx) => {
            const optionId = `${listboxId}-opt-${idx}`;
            const isHighlighted = idx === activeIndex;

            if (item.kind === 'unknown') {
              return (
                <button
                  key="__unknown__"
                  id={optionId}
                  ref={(el) => {
                    optionRefs.current[idx] = el;
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
                  optionRefs.current[idx] = el;
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
