/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Typeable Multi-Select Combobox for Genetic Carrier Disclosures
 * (`Suspected Carrier Of` & `Confirmed Carrier Of`).
 *
 * Lets breeders search & multi-select species-specific genetic traits from the dropdown
 * OR type any custom trait name and add it with Enter or "+ Add".
 */

import { Check, ChevronDown, Plus, X } from 'lucide-react';
import React, { useId, useMemo, useRef, useState } from 'react';
import { normalizeCarrierTraitList } from '../core/carrierGenetics';

interface CarrierTraitComboboxProps {
  label: string;
  helperText?: string;
  selected: string[];
  suggestions: string[];
  disabledTraits?: string[];
  disabledReason?: string;
  placeholder?: string;
  tone?: 'confirmed' | 'suspected' | 'cleared';
  onChange: (next: string[]) => void;
}

export function CarrierTraitCombobox({
  label,
  helperText,
  selected,
  suggestions,
  disabledTraits = [],
  disabledReason,
  placeholder = 'Type to search or add custom genetic trait...',
  tone = 'suspected',
  onChange,
}: CarrierTraitComboboxProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedLower = useMemo(
    () => new Set(selected.map((item) => item.trim().toLowerCase())),
    [selected]
  );

  const disabledLower = useMemo(
    () => new Set(disabledTraits.map((item) => item.trim().toLowerCase())),
    [disabledTraits]
  );

  // Merge species suggestions + currently selected values cleanly without duplicates
  const allOptions = useMemo(
    () => normalizeCarrierTraitList([...suggestions, ...selected]),
    [suggestions, selected]
  );

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter((opt) => opt.toLowerCase().includes(q));
  }, [allOptions, query]);

  const trimmedQuery = query.replace(/\s+/g, ' ').trim();
  const queryLower = trimmedQuery.toLowerCase();
  const canAddCustom =
    trimmedQuery.length > 0 &&
    !selectedLower.has(queryLower) &&
    !disabledLower.has(queryLower) &&
    !allOptions.some((opt) => opt.toLowerCase() === queryLower);

  const toggleTrait = (trait: string) => {
    const clean = trait.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    const lower = clean.toLowerCase();
    if (disabledLower.has(lower)) return;

    if (selectedLower.has(lower)) {
      onChange(selected.filter((item) => item.trim().toLowerCase() !== lower));
    } else {
      onChange(normalizeCarrierTraitList([...selected, clean]));
    }
  };

  const addCustomOrExact = () => {
    if (!trimmedQuery) return;
    if (disabledLower.has(queryLower)) return;
    const exactPreset = allOptions.find((opt) => opt.toLowerCase() === queryLower);
    const valueToAdd = exactPreset || trimmedQuery;
    if (!selectedLower.has(valueToAdd.toLowerCase())) {
      onChange(normalizeCarrierTraitList([...selected, valueToAdd]));
    }
    setQuery('');
  };

  const removeTrait = (trait: string) => {
    const lower = trait.trim().toLowerCase();
    onChange(selected.filter((item) => item.trim().toLowerCase() !== lower));
  };

  const tagClass =
    tone === 'confirmed'
      ? 'border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] text-[var(--barn-ink)]'
      : tone === 'cleared'
      ? 'border-[var(--barn-slate)] bg-[var(--barn-canvas)] text-[var(--barn-ink)]'
      : 'border-[var(--barn-terracotta)]/70 bg-[var(--barn-terracotta-tint)]/75 text-[var(--barn-ink)]';

  return (
    <div className="relative space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="block text-xs font-medium text-[var(--barn-muted)]">
          {label}
        </label>
        {selected.length > 0 && (
          <span className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
            {selected.length} selected
          </span>
        )}
      </div>

      {/* Selected Multi-Select Entries */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((trait) => (
            <span
              key={trait}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium ${tagClass}`}
            >
              <span>{trait}</span>
              <button
                type="button"
                onClick={() => removeTrait(trait)}
                aria-label={`Remove ${trait} from ${label}`}
                className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Typeable Combobox Input + Dropdown Trigger */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          placeholder={placeholder}
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
            } else if (e.key === 'Enter' && trimmedQuery) {
              e.preventDefault();
              addCustomOrExact();
            } else if (e.key === 'ArrowDown' && !isOpen) {
              setIsOpen(true);
            }
          }}
          className="w-full min-h-[42px] pl-3 pr-10 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--barn-sage)]"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={isOpen ? `Close ${label} options` : `Open ${label} options`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (isOpen) {
              setIsOpen(false);
            } else {
              setIsOpen(true);
              inputRef.current?.focus();
            }
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[32px] min-w-[32px] rounded-md flex items-center justify-center text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)]"
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {helperText && <p className="text-[11px] text-[var(--barn-muted)]">{helperText}</p>}

      {/* Dropdown List */}
      {isOpen && (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label={`${label} options`}
          className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] shadow-lg divide-y divide-[var(--barn-border)]"
        >
          {canAddCustom && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={addCustomOrExact}
              className="w-full text-left px-3 py-2.5 text-xs font-medium text-[var(--barn-sage)] bg-[var(--barn-sage-tint)]/60 hover:bg-[var(--barn-sage-tint)] flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Add custom trait &ldquo;{trimmedQuery}&rdquo;</span>
            </button>
          )}

          {filteredOptions.length === 0 && !canAddCustom ? (
            <div className="px-3 py-3 text-xs text-[var(--barn-muted)]">
              No matching presets. Keep typing to add a custom entry.
            </div>
          ) : (
            filteredOptions.map((opt) => {
              const lower = opt.toLowerCase();
              const isSelected = selectedLower.has(lower);
              const isDisabled = disabledLower.has(lower);

              return (
                <button
                  key={opt}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={isDisabled}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggleTrait(opt)}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors ${
                    isDisabled
                      ? 'opacity-55 cursor-not-allowed bg-[var(--barn-canvas)]/50'
                      : isSelected
                      ? 'bg-[var(--barn-sage-tint)]/75 font-semibold hover:bg-[var(--barn-sage-tint)]'
                      : 'hover:bg-[var(--barn-subtle)]'
                  }`}
                >
                  <span className="min-w-0 truncate text-[var(--barn-ink)]">{opt}</span>
                  <span className="inline-flex items-center gap-1.5 shrink-0">
                    {isDisabled && disabledReason && (
                      <span className="text-[10px] font-mono text-[var(--barn-muted)]">
                        {disabledReason}
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
