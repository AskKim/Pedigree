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
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { normalizeCarrierTraitList } from '../core/carrierGenetics';
import { clampComboboxIndex, stepEnabledComboboxIndex } from '../utils/comboboxNav';

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
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

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

  const displayOptions = useMemo(() => {
    const items: Array<{ kind: 'custom' | 'preset'; value: string; disabled: boolean }> = [];
    if (canAddCustom) {
      items.push({ kind: 'custom', value: trimmedQuery, disabled: false });
    }
    for (const opt of filteredOptions) {
      items.push({
        kind: 'preset',
        value: opt,
        disabled: disabledLower.has(opt.toLowerCase()),
      });
    }
    return items;
  }, [canAddCustom, trimmedQuery, filteredOptions, disabledLower]);

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((prev) => clampComboboxIndex(prev, displayOptions.length));
  }, [isOpen, displayOptions.length]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [isOpen, activeIndex]);

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
    setActiveIndex(-1);
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

  const activeOptionId =
    isOpen && activeIndex >= 0 && displayOptions[activeIndex]
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
          aria-controls={isOpen ? listboxId : undefined}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          placeholder={placeholder}
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
                displayOptions.length,
                e.key,
                (idx) => Boolean(displayOptions[idx]?.disabled)
              );
              if (!isOpen) setIsOpen(true);
              setActiveIndex(next);
            } else if ((e.key === 'Home' || e.key === 'End') && isOpen && displayOptions.length > 0) {
              e.preventDefault();
              const next = stepEnabledComboboxIndex(
                activeIndex,
                displayOptions.length,
                e.key,
                (idx) => Boolean(displayOptions[idx]?.disabled)
              );
              setActiveIndex(next);
            } else if (e.key === 'Enter') {
              const highlighted = isOpen && activeIndex >= 0 ? displayOptions[activeIndex] : undefined;
              if (highlighted && !highlighted.disabled) {
                e.preventDefault();
                if (highlighted.kind === 'custom') {
                  addCustomOrExact();
                } else {
                  toggleTrait(highlighted.value);
                }
              } else if (trimmedQuery) {
                e.preventDefault();
                addCustomOrExact();
              }
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
              setActiveIndex(-1);
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
          id={listboxId}
          role="listbox"
          aria-multiselectable="true"
          aria-label={`${label} options`}
          className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] shadow-lg divide-y divide-[var(--barn-border)]"
        >
          {displayOptions.length === 0 ? (
            <div className="px-3 py-3 text-xs text-[var(--barn-muted)]">
              No matching presets. Keep typing to add a custom entry.
            </div>
          ) : (
            displayOptions.map((item, idx) => {
              const optionId = `${listboxId}-opt-${idx}`;
              const isHighlighted = idx === activeIndex;

              if (item.kind === 'custom') {
                return (
                  <button
                    key={`__custom__:${item.value}`}
                    id={optionId}
                    ref={(el) => {
                      optionRefs.current[idx] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={addCustomOrExact}
                    className={`w-full text-left px-3 py-2.5 text-xs font-medium text-[var(--barn-sage)] bg-[var(--barn-sage-tint)]/60 hover:bg-[var(--barn-sage-tint)] flex items-center gap-1.5 ${
                      isHighlighted ? 'ring-2 ring-inset ring-[var(--barn-sage)] bg-[var(--barn-sage-tint)]' : ''
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>Add custom trait &ldquo;{item.value}&rdquo;</span>
                  </button>
                );
              }

              const lower = item.value.toLowerCase();
              const isSelected = selectedLower.has(lower);
              const isDisabled = item.disabled;

              return (
                <button
                  key={item.value}
                  id={optionId}
                  ref={(el) => {
                    optionRefs.current[idx] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={isDisabled}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => {
                    if (!isDisabled) setActiveIndex(idx);
                  }}
                  onClick={() => toggleTrait(item.value)}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors ${
                    isDisabled
                      ? 'opacity-55 cursor-not-allowed bg-[var(--barn-canvas)]/50'
                      : isSelected
                      ? 'bg-[var(--barn-sage-tint)]/75 font-semibold hover:bg-[var(--barn-sage-tint)]'
                      : 'hover:bg-[var(--barn-subtle)]'
                  } ${
                    isHighlighted && !isDisabled
                      ? 'ring-2 ring-inset ring-[var(--barn-sage)] bg-[var(--barn-subtle)]'
                      : ''
                  }`}
                >
                  <span className="min-w-0 truncate text-[var(--barn-ink)]">{item.value}</span>
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
