/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Searchable Parent Picker (`SearchableParentPicker`).
 *
 * Replaces a static `<select>` dropdown whenever "Include Archived" is enabled
 * during parent selection in Breedings, Pairings, or Animal Pedigree editing.
 */

import { Check, Search, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Animal, doesAnimalNeedAttention, isAnimalArchived } from '../core/models';

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
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

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

  const handleSelect = (nextId: string) => {
    onChange(nextId);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div className="relative space-y-1.5">
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
          aria-label={`Search ${label}`}
          placeholder={placeholder || `Search ${label} by name, tattoo, or breed...`}
          value={query}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setIsOpen(false)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsOpen(false);
            } else if (e.key === 'Enter' && isOpen && filteredCandidates.length === 1) {
              e.preventDefault();
              handleSelect(filteredCandidates[0].id);
            }
          }}
          className="w-full min-h-[42px] pl-9 pr-8 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--barn-sage)]"
        />
        {query && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery('');
              setIsOpen(true);
            }}
            aria-label="Clear search query"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
          >
            <X className="w-3.5 h-3.5" />
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
          role="listbox"
          aria-label={`${label} search results`}
          className="absolute left-0 right-0 z-30 mt-1 max-h-52 overflow-y-auto rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] shadow-lg divide-y divide-[var(--barn-border)]"
        >
          {unknownLabel && (
            <button
              type="button"
              role="option"
              aria-selected={value === ''}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect('')}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--barn-subtle)] flex items-center justify-between gap-2 ${
                value === '' ? 'bg-[var(--barn-sage-tint)] font-semibold' : ''
              }`}
            >
              <span>{unknownLabel}</span>
              {value === '' && <Check className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" />}
            </button>
          )}

          {filteredCandidates.length === 0 ? (
            <div className="px-3 py-3 text-xs text-[var(--barn-muted)]">
              No matching {label.toLowerCase()} found for &ldquo;{query.trim()}&rdquo;.
            </div>
          ) : (
            filteredCandidates.map((cand) => {
              const isSelected = cand.id === value;
              const archived = isAnimalArchived(cand);
              const needsAttn = doesAnimalNeedAttention(cand);
              return (
                <button
                  key={cand.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(cand.id)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--barn-subtle)] flex items-center justify-between gap-2 ${
                    isSelected ? 'bg-[var(--barn-sage-tint)] font-semibold' : ''
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
            })
          )}
        </div>
      )}
    </div>
  );
}
