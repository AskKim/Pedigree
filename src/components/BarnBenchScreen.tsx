/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * "Barn Bench" Fast Sequential Batch Entry Screen (`src/components/BarnBenchScreen.tsx`).
 *
 * Tap-friendly, cage-row-walkable chore sheet strictly isolated to the active species.
 * Lets breeders walk down a physical barn row logging weights, body condition scores (BCS),
 * nail trims / hoof grooming, cage moves (with live capacity checks), and quick notes
 * with automatic advance and zero modal switching.
 */

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  Loader2,
  MapPin,
  RotateCcw,
  Scale,
  Scissors,
  Search,
  ShieldAlert,
  SkipForward,
  Sparkles,
} from 'lucide-react';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  buildWithdrawalByAnimalMap,
  evaluateCageAssignmentCapacityWarning,
  evaluateSpeciesCagesOccupancy,
} from '../domain/barnAlerts';
import {
  BARN_BENCH_BCS_PRESETS,
  BARN_BENCH_SECTION_ALL,
  BARN_BENCH_SECTION_UNASSIGNED,
  BarnBenchBatchEntryDraft,
  BarnBenchFocusMode,
  BarnBenchStatusFilter,
  buildBarnBenchQueue,
  extractSpeciesCageSections,
  findNextBarnBenchIndex,
} from '../domain/barnBench';
import {
  BarnSettings,
  formatReadableDate,
  formatSexForSpecies,
  formatWeight,
  formatWeightInputValue,
  getSpeciesIdentifierLabels,
  getWeightInputMeta,
  parseWeightInputToGrams,
  resolveSpeciesWeightUnit,
  todayDateIso,
} from '../domain/models';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';

interface BarnBenchScreenProps {
  activeData: ActiveSpeciesData;
  settings: BarnSettings;
  onCommitEntry: (
    draft: BarnBenchBatchEntryDraft
  ) => Promise<{ ok: boolean; animalId: string; summary: string[] }>;
  onOpenAnimal: (animalId: string) => void;
  onBackToHub: () => void;
}

const FOCUS_MODES: ReadonlyArray<{ id: BarnBenchFocusMode; label: string }> = [
  { id: 'all', label: 'All Fields' },
  { id: 'weight', label: 'Weights' },
  { id: 'bcs', label: 'BCS' },
  { id: 'nail_trim', label: 'Nail Trim' },
  { id: 'cage_move', label: 'Cage Move' },
];

export function BarnBenchScreen({
  activeData,
  settings,
  onCommitEntry,
  onOpenAnimal,
  onBackToHub,
}: BarnBenchScreenProps) {
  const { speciesProfile, animals, cages, careLogs, primaryPhotoByAnimalId } = activeData;
  const baseId = useId();
  const weightInputRef = useRef<HTMLInputElement | null>(null);
  const submitLock = useAsyncSubmitLock({ postSettleCooldownMs: 200 });

  const weightUnit = useMemo(
    () => resolveSpeciesWeightUnit(speciesProfile, settings),
    [speciesProfile, settings]
  );
  const weightMeta = useMemo(() => getWeightInputMeta(weightUnit), [weightUnit]);
  const idLabels = useMemo(
    () => getSpeciesIdentifierLabels(speciesProfile.name),
    [speciesProfile.name]
  );

  // Queue filter & session preferences
  const [sectionFilter, setSectionFilter] = useState<string>(BARN_BENCH_SECTION_ALL);
  const [statusFilter, setStatusFilter] = useState<BarnBenchStatusFilter>('housing');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [focusMode, setFocusMode] = useState<BarnBenchFocusMode>('all');
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);
  const [entryDateIso, setEntryDateIso] = useState<string>(() => todayDateIso());

  // Session progress & active bench cursor
  const [activeAnimalId, setActiveAnimalId] = useState<string | null>(null);
  const [loggedSessionMap, setLoggedSessionMap] = useState<Record<string, string[]>>({});
  const [lastSavedBanner, setLastSavedBanner] = useState<{
    animalName: string;
    summary: string[];
  } | null>(null);

  // Per-animal bench input draft
  const [weightInput, setWeightInput] = useState<string>('');
  const [selectedBcs, setSelectedBcs] = useState<number | null>(null);
  const [customBcsInput, setCustomBcsInput] = useState<string>('');
  const [nailTrimDone, setNailTrimDone] = useState<boolean>(false);
  const [targetCageLocation, setTargetCageLocation] = useState<string>('');
  const [customCageMode, setCustomCageMode] = useState<boolean>(false);
  const [notesInput, setNotesInput] = useState<string>('');
  const [confirmOverCapacity, setConfirmOverCapacity] = useState<boolean>(false);

  // Reset species-specific session filters when switching active species
  useEffect(() => {
    setSectionFilter(BARN_BENCH_SECTION_ALL);
    setStatusFilter('housing');
    setSearchQuery('');
    setActiveAnimalId(null);
    setLoggedSessionMap({});
    setLastSavedBanner(null);
  }, [speciesProfile.name]);

  const sections = useMemo(
    () => extractSpeciesCageSections(cages, speciesProfile.name),
    [cages, speciesProfile.name]
  );

  const sortedCages = useMemo(
    () =>
      [...cages].sort(
        (a, b) =>
          (a.section || '').localeCompare(b.section || '', undefined, {
            numeric: true,
            sensitivity: 'base',
          }) ||
          a.label.localeCompare(b.label, undefined, {
            numeric: true,
            sensitivity: 'base',
          })
      ),
    [cages]
  );

  const cagesOccupancy = useMemo(
    () => evaluateSpeciesCagesOccupancy(cages, animals, speciesProfile.name),
    [cages, animals, speciesProfile.name]
  );

  const withdrawalByAnimalId = useMemo(() => buildWithdrawalByAnimalMap(careLogs), [careLogs]);

  const queue = useMemo(
    () =>
      buildBarnBenchQueue({
        animals,
        cages,
        careLogs,
        options: {
          speciesName: speciesProfile.name,
          sectionFilter,
          statusFilter,
          searchQuery,
        },
      }),
    [animals, cages, careLogs, speciesProfile.name, sectionFilter, statusFilter, searchQuery]
  );

  const currentIndex = useMemo(() => {
    if (queue.length === 0) return 0;
    if (activeAnimalId) {
      const idx = queue.findIndex((row) => row.animal.id === activeAnimalId);
      if (idx >= 0) return idx;
    }
    return 0;
  }, [queue, activeAnimalId]);

  const activeRow = queue[currentIndex] ?? null;
  const activeAnimal = activeRow?.animal ?? null;

  // Reset per-row draft whenever the active animal switches
  useEffect(() => {
    if (!activeRow) {
      setWeightInput('');
      setSelectedBcs(null);
      setCustomBcsInput('');
      setNailTrimDone(false);
      setTargetCageLocation('');
      setCustomCageMode(false);
      setNotesInput('');
      setConfirmOverCapacity(false);
      return;
    }
    const existingCageLabel = activeRow.cageLabel;
    const isKnownCage =
      !existingCageLabel ||
      sortedCages.some((c) => c.label.trim().toLowerCase() === existingCageLabel.toLowerCase());
    setWeightInput('');
    setSelectedBcs(null);
    setCustomBcsInput('');
    setNailTrimDone(false);
    setTargetCageLocation(existingCageLabel);
    setCustomCageMode(!isKnownCage);
    setNotesInput('');
    setConfirmOverCapacity(false);
  }, [activeRow?.animal.id]);

  // Reset over-capacity confirmation whenever target cage changes
  useEffect(() => {
    setConfirmOverCapacity(false);
  }, [targetCageLocation]);

  const parsedWeightGrams = useMemo(
    () => parseWeightInputToGrams(weightInput, weightUnit),
    [weightInput, weightUnit]
  );

  const effectiveBcs = useMemo(() => {
    const customTrimmed = customBcsInput.trim();
    if (customTrimmed) {
      const parsed = Number(customTrimmed);
      return Number.isFinite(parsed) && parsed > 0 ? Math.min(20, Math.round(parsed * 10) / 10) : 0;
    }
    return selectedBcs && selectedBcs > 0 ? selectedBcs : 0;
  }, [customBcsInput, selectedBcs]);

  const cageChanged = useMemo(() => {
    if (!activeRow) return false;
    return targetCageLocation.trim() !== activeRow.cageLabel.trim();
  }, [activeRow, targetCageLocation]);

  const cageCapacityWarning = useMemo(() => {
    if (!activeRow || !cageChanged || !targetCageLocation.trim()) return null;
    return evaluateCageAssignmentCapacityWarning({
      targetCageLabel: targetCageLocation,
      cages,
      animals,
      speciesName: speciesProfile.name,
      animalId: activeRow.animal.id,
      animalName: activeRow.animal.name,
      wasAlreadyOccupyingTargetCage: false,
      willOccupyAfterSave: true,
    });
  }, [activeRow, cageChanged, targetCageLocation, cages, animals, speciesProfile.name]);

  const hasDraftChanges = Boolean(
    activeRow &&
      (parsedWeightGrams > 0 ||
        effectiveBcs > 0 ||
        nailTrimDone ||
        cageChanged ||
        notesInput.trim().length > 0)
  );

  const needsCapacityConfirm = Boolean(cageCapacityWarning?.wouldExceed && !confirmOverCapacity);

  const loggedInQueueCount = useMemo(() => {
    let count = 0;
    for (const row of queue) {
      if (loggedSessionMap[row.animal.id]?.length) {
        count++;
      }
    }
    return count;
  }, [queue, loggedSessionMap]);

  const progressPercent =
    queue.length > 0 ? Math.min(100, Math.round((loggedInQueueCount / queue.length) * 100)) : 0;

  const activeWithdrawal = activeAnimal ? withdrawalByAnimalId.get(activeAnimal.id) : undefined;
  const activeThumb = activeAnimal
    ? primaryPhotoByAnimalId.get(activeAnimal.id)?.thumbnailDataUrl
    : undefined;

  const handleSelectIndex = (nextIdx: number) => {
    if (queue.length === 0) return;
    const clamped = Math.max(0, Math.min(queue.length - 1, nextIdx));
    setActiveAnimalId(queue[clamped].animal.id);
  };

  const handleSkipNext = () => {
    if (queue.length <= 1) return;
    const nextIdx = (currentIndex + 1) % queue.length;
    setActiveAnimalId(queue[nextIdx].animal.id);
  };

  const handleStepPrev = () => {
    if (queue.length <= 1) return;
    const prevIdx = (currentIndex - 1 + queue.length) % queue.length;
    setActiveAnimalId(queue[prevIdx].animal.id);
  };

  const handleCommit = async (advanceAfter: boolean) => {
    if (!activeRow || !hasDraftChanges || needsCapacityConfirm) return;

    const currentAnimalId = activeRow.animal.id;
    const currentAnimalName = activeRow.animal.name;

    // Precompute next target animal BEFORE commit so a cage move re-sorting the queue
    // still advances smoothly to the next expected animal in the barn row.
    const projectedLoggedIds = new Set<string>(Object.keys(loggedSessionMap));
    projectedLoggedIds.add(currentAnimalId);
    const nextIndex = findNextBarnBenchIndex({
      queue,
      currentIndex,
      loggedAnimalIds: projectedLoggedIds,
      preferUnlogged: true,
    });
    const nextTargetAnimalId =
      queue.length > 1 && nextIndex !== currentIndex ? queue[nextIndex]?.animal.id ?? null : null;

    const draft: BarnBenchBatchEntryDraft = {
      animalId: currentAnimalId,
      dateIso: entryDateIso || todayDateIso(),
      weightGrams: parsedWeightGrams > 0 ? parsedWeightGrams : undefined,
      bodyConditionScore: effectiveBcs > 0 ? effectiveBcs : undefined,
      nailTrimDone: nailTrimDone || undefined,
      targetCageLocation: cageChanged ? targetCageLocation.trim() : undefined,
      notes: notesInput.trim() || undefined,
    };

    const locked = await submitLock.runLocked(() => onCommitEntry(draft));
    const result = locked.skipped ? null : locked.value;
    if (!result || !result.ok) return;

    setLoggedSessionMap((prev) => {
      const existing = prev[currentAnimalId] || [];
      const merged = Array.from(new Set([...existing, ...result.summary]));
      return { ...prev, [currentAnimalId]: merged };
    });
    setLastSavedBanner({
      animalName: currentAnimalName,
      summary: result.summary,
    });

    if (advanceAfter && nextTargetAnimalId) {
      setActiveAnimalId(nextTargetAnimalId);
      if (focusMode === 'weight' && weightInputRef.current) {
        weightInputRef.current.focus();
      }
    } else {
      // Clear active draft fields while remaining on the same animal
      setWeightInput('');
      setSelectedBcs(null);
      setCustomBcsInput('');
      setNailTrimDone(false);
      setNotesInput('');
      setConfirmOverCapacity(false);
    }
  };

  const showWeightBlock = focusMode === 'all' || focusMode === 'weight';
  const showBcsBlock = focusMode === 'all' || focusMode === 'bcs';
  const showTrimBlock = focusMode === 'all' || focusMode === 'nail_trim';
  const showCageBlock = focusMode === 'all' || focusMode === 'cage_move';

  return (
    <div className="space-y-5">
      {/* Header & Session Progress */}
      <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onBackToHub}
                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{speciesProfile.name} Hub</span>
              </button>
              <span className="text-[11px] font-mono uppercase tracking-wide px-2 py-0.5 rounded-md bg-[var(--barn-sage-tint)] text-[var(--barn-sage)] font-semibold">
                Fast Sequential Entry
              </span>
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-semibold flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>{speciesProfile.name} Barn Bench</span>
            </h1>
            <p className="text-xs text-[var(--barn-muted)]">
              Walk down each cage row and log weights, body condition scores, nail trims, or cage moves with auto-advance.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor={`${baseId}-entry-date`}
              className="text-[11px] text-[var(--barn-muted)] font-medium"
            >
              Chore Date
            </label>
            <input
              id={`${baseId}-entry-date`}
              type="date"
              value={entryDateIso}
              onChange={(e) => setEntryDateIso(e.target.value || todayDateIso())}
              className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
            />
            {Object.keys(loggedSessionMap).length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setLoggedSessionMap({});
                  setLastSavedBanner(null);
                }}
                title="Clear green session checkmarks (saved records remain untouched)"
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Reset Sheet</span>
              </button>
            )}
          </div>
        </div>

        {/* Row / Section Filter Bar + Status + Search */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
          <div className="md:col-span-4">
            <label
              htmlFor={`${baseId}-section-filter`}
              className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
            >
              Barn Row / Section
            </label>
            <select
              id={`${baseId}-section-filter`}
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
            >
              <option value={BARN_BENCH_SECTION_ALL}>All Rows &amp; Cages</option>
              {sections.map((sec) => (
                <option key={sec} value={sec}>
                  Row / Section: {sec}
                </option>
              ))}
              <option value={BARN_BENCH_SECTION_UNASSIGNED}>Unassigned Animals Only</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label
              htmlFor={`${baseId}-status-filter`}
              className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
            >
              Herd Group
            </label>
            <select
              id={`${baseId}-status-filter`}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as BarnBenchStatusFilter)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
            >
              <option value="housing">All Housed Stock (Active, Junior, Retired)</option>
              <option value="active_only">Active Breeding Stock Only</option>
              <option value="junior_only">Juniors / Growouts Only</option>
            </select>
          </div>

          <div className="md:col-span-5">
            <label
              htmlFor={`${baseId}-search`}
              className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
            >
              Quick Jump / Filter
            </label>
            <div className="relative">
              <Search
                className="w-4 h-4 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id={`${baseId}-search`}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Filter by cage, name, or ${idLabels.shortLabel.toLowerCase()}...`}
                className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              />
            </div>
          </div>
        </div>

        {/* Focus Mode Strip + Auto-Advance Toggle + Progress Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Entry focus mode">
            {FOCUS_MODES.map((mode) => {
              const active = focusMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFocusMode(mode.id)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                      : 'bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={(e) => setAutoAdvance(e.target.checked)}
              className="w-4 h-4 accent-[var(--barn-sage)] rounded"
            />
            <span>Auto-advance to next unlogged cage</span>
          </label>
        </div>

        {/* Session Progress Indicator */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-[var(--barn-muted)]">
            <span>
              Bench Queue: <strong className="text-[var(--barn-ink)] tabular-nums">{queue.length}</strong>{' '}
              animal{queue.length === 1 ? '' : 's'}
            </span>
            <span className="tabular-nums font-medium">
              <strong className="text-[var(--barn-sage)]">{loggedInQueueCount}</strong> / {queue.length} logged this session ({progressPercent}%)
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Barn Bench session completion"
            className="h-2 w-full rounded-full bg-[var(--barn-canvas)] border border-[var(--barn-border)] overflow-hidden"
          >
            <div
              className="h-full bg-[var(--barn-sage)] transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </section>

      {/* Brief Last-Saved Confirmation Strip */}
      {lastSavedBanner && (
        <div
          role="status"
          aria-live="polite"
          className="bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] rounded-xl px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2"
        >
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            <span>
              Logged <strong>{lastSavedBanner.animalName}</strong>: {lastSavedBanner.summary.join(' · ')}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setLastSavedBanner(null)}
            className="text-[11px] underline text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Empty Queue State */}
      {!activeRow || !activeAnimal ? (
        <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-8 text-center space-y-3">
          <h2 className="font-display text-lg font-semibold">
            No {speciesProfile.name} Animals Match This Bench Filter
          </h2>
          <p className="text-xs text-[var(--barn-muted)] max-w-md mx-auto">
            {sectionFilter !== BARN_BENCH_SECTION_ALL || statusFilter !== 'housing' || searchQuery.trim()
              ? 'Try switching back to All Rows & Cages or clearing your search filter.'
              : `Add active or junior ${speciesProfile.name.toLowerCase()} records in the Herd Registry to start sequential cage-side entry.`}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {(sectionFilter !== BARN_BENCH_SECTION_ALL ||
              statusFilter !== 'housing' ||
              searchQuery.trim()) && (
              <button
                type="button"
                onClick={() => {
                  setSectionFilter(BARN_BENCH_SECTION_ALL);
                  setStatusFilter('housing');
                  setSearchQuery('');
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold"
              >
                Reset Bench Filters
              </button>
            )}
            <button
              type="button"
              onClick={onBackToHub}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)]"
            >
              Back to {speciesProfile.name} Hub
            </button>
          </div>
        </section>
      ) : (
        /* Active Cage-Side Bench Card */
        <section className="bg-[var(--barn-surface)] border-2 border-[var(--barn-sage)]/70 rounded-2xl p-4 sm:p-6 space-y-5 shadow-sm">
          {/* Active Animal Identity Banner */}
          <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[var(--barn-border)]">
            <div className="flex items-start gap-3 min-w-0">
              {activeThumb ? (
                <img
                  src={activeThumb}
                  alt={activeAnimal.name}
                  className="w-14 h-14 rounded-xl object-cover border border-[var(--barn-border)] shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] flex items-center justify-center text-xs font-mono font-bold text-[var(--barn-muted)] shrink-0">
                  {activeRow.cageLabel ? activeRow.cageLabel.slice(0, 6) : '—'}
                </div>
              )}

              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/40 text-xs font-mono font-bold text-[var(--barn-sage)]">
                    {activeRow.hasAssignedCage ? activeRow.cageLabel : 'Unassigned Cage'}
                  </span>
                  <span className="text-[11px] text-[var(--barn-muted)] font-medium">
                    {activeRow.sectionLabel}
                  </span>
                  <span className="text-[11px] font-mono text-[var(--barn-muted)] tabular-nums">
                    #{currentIndex + 1} of {queue.length}
                  </span>
                  {loggedSessionMap[activeAnimal.id]?.length ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold">
                      <Check className="w-3 h-3" aria-hidden="true" />
                      Logged
                    </span>
                  ) : null}
                </div>

                <h2 className="font-display text-xl sm:text-2xl font-bold truncate">
                  {activeAnimal.name}
                </h2>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--barn-muted)]">
                  <span className="font-mono font-semibold text-[var(--barn-ink)]">
                    {activeAnimal.tattoo || 'No ID'}
                  </span>
                  <span>{formatSexForSpecies(activeAnimal.sex, speciesProfile)}</span>
                  <span>{activeAnimal.status}</span>
                  {(activeAnimal.breed || activeAnimal.variety) && (
                    <span>
                      {[activeAnimal.breed, activeAnimal.variety].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeWithdrawal?.isActive && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[11px] font-semibold text-[var(--barn-terracotta)]">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    Withdrawal Hold: {activeWithdrawal.shortCountdownLabel} (clear{' '}
                    {formatReadableDate(activeWithdrawal.clearDateIso)})
                  </span>
                </span>
              )}
              <button
                type="button"
                onClick={() => onOpenAnimal(activeAnimal.id)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
              >
                <span>Open Profile</span>
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Focused / All Entry Blocks */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleCommit(autoAdvance);
            }}
            className="space-y-4"
          >
            <div
              className={`grid grid-cols-1 ${
                focusMode === 'all' ? 'lg:grid-cols-2' : ''
              } gap-4`}
            >
              {/* 1. Weight Check */}
              {showWeightBlock && (
                <div className="bg-[var(--barn-canvas)] border border-[var(--barn-border)] rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor={`${baseId}-weight`}
                      className="text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Scale className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                      <span>Weight Check ({weightMeta.shortUnit})</span>
                    </label>
                    <span className="text-[11px] text-[var(--barn-muted)] font-mono">
                      Current: {formatWeight(activeAnimal.weightGrams, weightUnit)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      ref={weightInputRef}
                      id={`${baseId}-weight`}
                      type="text"
                      inputMode="decimal"
                      value={weightInput}
                      onChange={(e) => setWeightInput(e.target.value)}
                      placeholder={weightMeta.placeholder}
                      className="flex-1 min-h-[46px] px-3.5 py-2 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-base font-mono font-semibold"
                    />
                    {activeAnimal.weightGrams > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setWeightInput(formatWeightInputValue(activeAnimal.weightGrams, weightUnit))
                        }
                        className="min-h-[46px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium whitespace-nowrap"
                      >
                        Same Wt
                      </button>
                    )}
                  </div>
                  {parsedWeightGrams > 0 && (
                    <div className="text-[11px] text-[var(--barn-sage)] font-medium">
                      Will save: {formatWeight(parsedWeightGrams, weightUnit)} ({parsedWeightGrams.toLocaleString()} g)
                    </div>
                  )}
                </div>
              )}

              {/* 2. Body Condition Score (BCS) */}
              {showBcsBlock && (
                <div className="bg-[var(--barn-canvas)] border border-[var(--barn-border)] rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                      <span>Body Condition Score (BCS)</span>
                    </span>
                    <span className="text-[11px] text-[var(--barn-muted)] font-mono">
                      Latest:{' '}
                      {activeRow.latestBcs > 0
                        ? `${activeRow.latestBcs} (${formatReadableDate(activeRow.latestBcsDateIso)})`
                        : 'None'}
                    </span>
                  </div>

                  <div className="grid grid-cols-5 sm:grid-cols-9 gap-1.5" role="group" aria-label="BCS quick presets">
                    {BARN_BENCH_BCS_PRESETS.map((score) => {
                      const active = !customBcsInput.trim() && selectedBcs === score;
                      return (
                        <button
                          key={score}
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            setCustomBcsInput('');
                            setSelectedBcs((prev) => (prev === score ? null : score));
                          }}
                          className={`min-h-[42px] rounded-xl text-xs font-mono font-bold transition-colors ${
                            active
                              ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                              : 'bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)]'
                          }`}
                        >
                          {score}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 pt-0.5">
                    <label
                      htmlFor={`${baseId}-custom-bcs`}
                      className="text-[11px] text-[var(--barn-muted)] whitespace-nowrap"
                    >
                      Custom (e.g. 1–9):
                    </label>
                    <input
                      id={`${baseId}-custom-bcs`}
                      type="text"
                      inputMode="decimal"
                      value={customBcsInput}
                      onChange={(e) => {
                        setCustomBcsInput(e.target.value);
                        if (e.target.value.trim()) setSelectedBcs(null);
                      }}
                      placeholder="Optional"
                      className="w-28 min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono"
                    />
                  </div>
                </div>
              )}

              {/* 3. Nail Trim / Grooming & Hoof */}
              {showTrimBlock && (
                <div className="bg-[var(--barn-canvas)] border border-[var(--barn-border)] rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold flex items-center gap-1.5">
                      <Scissors className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                      <span>Nail Trim / Hoof Grooming</span>
                    </span>
                    <span className="text-[11px] text-[var(--barn-muted)] font-mono">
                      Last:{' '}
                      {activeRow.latestNailTrimDateIso
                        ? formatReadableDate(activeRow.latestNailTrimDateIso)
                        : 'Never logged'}
                    </span>
                  </div>

                  <button
                    type="button"
                    aria-pressed={nailTrimDone}
                    onClick={() => setNailTrimDone((prev) => !prev)}
                    className={`w-full min-h-[50px] px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                      nailTrimDone
                        ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                        : 'bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)]'
                    }`}
                  >
                    {nailTrimDone ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                        <span>Nail Trim / Grooming Done</span>
                      </>
                    ) : (
                      <>
                        <Scissors className="w-4 h-4" aria-hidden="true" />
                        <span>Tap to Mark Nail Trim Done</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* 4. Cage / Pen Move */}
              {showCageBlock && (
                <div className="bg-[var(--barn-canvas)] border border-[var(--barn-border)] rounded-xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor={`${baseId}-cage-move`}
                      className="text-xs font-semibold flex items-center gap-1.5"
                    >
                      <MapPin className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                      <span>Cage / Pen Move</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setCustomCageMode((prev) => !prev)}
                      className="text-[11px] underline text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
                    >
                      {customCageMode ? 'Pick Registered Cage' : 'Type Custom Label'}
                    </button>
                  </div>

                  {customCageMode ? (
                    <input
                      id={`${baseId}-cage-move`}
                      type="text"
                      value={targetCageLocation}
                      onChange={(e) => setTargetCageLocation(e.target.value)}
                      placeholder="Enter cage/pen label or leave blank to unassign"
                      className="w-full min-h-[46px] px-3 py-2 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium"
                    />
                  ) : (
                    <select
                      id={`${baseId}-cage-move`}
                      value={targetCageLocation}
                      onChange={(e) => setTargetCageLocation(e.target.value)}
                      className="w-full min-h-[46px] px-3 py-2 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium"
                    >
                      <option value="">Unassigned (No Cage)</option>
                      {sortedCages.map((c) => {
                        const occ = cagesOccupancy.byCageId.get(c.id);
                        const ratio = occ ? ` (${occ.ratioLabel})` : '';
                        const sec = c.section ? `${c.section} · ` : '';
                        return (
                          <option key={c.id} value={c.label}>
                            {sec}
                            {c.label}
                            {ratio}
                          </option>
                        );
                      })}
                    </select>
                  )}

                  {cageCapacityWarning && (
                    <div
                      role="alert"
                      className="bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] rounded-xl p-3 space-y-2 text-xs"
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle
                          className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <div className="space-y-0.5">
                          <div className="font-semibold">{cageCapacityWarning.headline}</div>
                          <div className="text-[11px] text-[var(--barn-muted)]">
                            {cageCapacityWarning.detail}
                          </div>
                        </div>
                      </div>
                      {cageCapacityWarning.wouldExceed && (
                        <label className="inline-flex items-center gap-2 text-[11px] font-semibold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={confirmOverCapacity}
                            onChange={(e) => setConfirmOverCapacity(e.target.checked)}
                            className="w-4 h-4 accent-[var(--barn-terracotta)] rounded"
                          />
                          <span>Confirm moving over configured cage capacity</span>
                        </label>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {focusMode !== 'all' && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setFocusMode('all')}
                  className="text-[11px] underline text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
                >
                  Show all 4 entry fields for this animal
                </button>
              </div>
            )}

            {/* Quick Note Input */}
            <div>
              <label
                htmlFor={`${baseId}-notes`}
                className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
              >
                Quick Bench Note (optional — attaches to logged entries or saves as a Journal Note)
              </label>
              <input
                id={`${baseId}-notes`}
                type="text"
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                placeholder="e.g. Slight molt on rump, trimmed dewclaws, clean hocks..."
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              />
            </div>

            {/* Tap-Friendly Sequential Action Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-[var(--barn-border)]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={queue.length <= 1 || submitLock.isSubmitting}
                  onClick={handleStepPrev}
                  className="min-h-[46px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                  <span>Prev</span>
                </button>
                <button
                  type="button"
                  disabled={queue.length <= 1 || submitLock.isSubmitting}
                  onClick={handleSkipNext}
                  className="min-h-[46px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40"
                >
                  <span>Skip</span>
                  <SkipForward className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {autoAdvance && queue.length > 1 && (
                  <button
                    type="button"
                    disabled={!hasDraftChanges || needsCapacityConfirm || submitLock.isSubmitting}
                    onClick={() => void handleCommit(false)}
                    className="min-h-[46px] px-4 py-2 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-semibold disabled:opacity-40"
                  >
                    Save &amp; Stay
                  </button>
                )}

                <button
                  type="submit"
                  disabled={!hasDraftChanges || needsCapacityConfirm || submitLock.isSubmitting}
                  aria-busy={submitLock.isSubmitting}
                  className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-45"
                >
                  {submitLock.isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" aria-hidden="true" />
                      <span>
                        {autoAdvance && queue.length > 1 ? 'Save & Next Cage' : 'Save Entry'}
                      </span>
                      {autoAdvance && queue.length > 1 && (
                        <ChevronRight className="w-4 h-4" aria-hidden="true" />
                      )}
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {/* Clickable Walkthrough Queue */}
      {queue.length > 0 && (
        <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold">
              Cage Walkthrough Queue ({queue.length})
            </h2>
            <span className="text-[11px] text-[var(--barn-muted)]">
              Tap any row to jump directly to that cage
            </span>
          </div>

          <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl overflow-hidden bg-[var(--barn-canvas)]">
            {queue.map((row, idx) => {
              const isSelected = activeAnimal?.id === row.animal.id;
              const sessionSummaries = loggedSessionMap[row.animal.id];
              const isLogged = Boolean(sessionSummaries && sessionSummaries.length > 0);
              return (
                <button
                  key={row.animal.id}
                  type="button"
                  onClick={() => handleSelectIndex(idx)}
                  aria-current={isSelected ? 'true' : undefined}
                  className={`w-full text-left px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 transition-colors ${
                    isSelected
                      ? 'bg-[var(--barn-sage-tint)] border-l-4 border-l-[var(--barn-sage)]'
                      : 'hover:bg-[var(--barn-subtle)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-lg text-[11px] font-mono font-bold inline-flex items-center justify-center shrink-0 ${
                        isLogged
                          ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                          : 'bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[var(--barn-muted)]'
                      }`}
                    >
                      {isLogged ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : idx + 1}
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-[var(--barn-sage)]">
                          {row.hasAssignedCage ? row.cageLabel : 'Unassigned'}
                        </span>
                        <span className="text-xs font-semibold truncate">{row.animal.name}</span>
                        {row.animal.tattoo && (
                          <span className="text-[11px] font-mono text-[var(--barn-muted)]">
                            ({row.animal.tattoo})
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--barn-muted)]">
                        {row.sectionLabel} · {formatSexForSpecies(row.animal.sex, speciesProfile)} ·{' '}
                        {formatWeight(row.animal.weightGrams, weightUnit)}
                        {row.latestBcs > 0 ? ` · BCS ${row.latestBcs}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[11px]">
                    {isLogged ? (
                      <span className="px-2 py-0.5 rounded-md bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/40 text-[var(--barn-sage)] font-semibold">
                        {sessionSummaries.join(' · ')}
                      </span>
                    ) : (
                      <span className="text-[var(--barn-muted)]">Pending</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
