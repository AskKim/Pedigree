# Codebase Export: AskKim/Pedigree (Part 6 of 16)

- **Branch:** `main`
- **Commit:** `847f8ec8a2fc88e92ecb94065d96cf1277189c07`
- **Generated (UTC):** 2026-11-21 17:00:43 UTC
- **Files in this part:** 9 (`src/components/PairingComparisonMatrix.tsx` -> `src/components/SettingsAndSyncScreen.tsx`)
- **Index:** [index.md](./index.md)

---
## `src/components/PairingComparisonMatrix.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Side-by-Side Multi-Candidate Pairing Comparison Matrix (`src/components/PairingComparisonMatrix.tsx`).
 *
 * Compares 1 anchor Dam against multiple candidate Sires (or 1 anchor Sire against multiple
 * candidate Dams) in a single responsive table displaying projected Wright COI %, shared
 * bottleneck ancestors, carrier & genetic health risk flags, and predicted coat varieties.
 */

import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import React, { useEffect, useId, useMemo, useState } from 'react';
import { Animal, isAnimalArchived, SpeciesProfile } from '../core/models';
import {
  buildPairingComparisonMatrix,
  DEFAULT_MATRIX_INITIAL_SELECTION,
  MAX_MATRIX_CANDIDATES,
  PairingAnchorRole,
  PairingMatrixRow,
  PairingMatrixSortBy,
  selectDefaultMatrixCandidateIds,
} from '../core/pairingMatrix';
import { ColorGeneticsNotice } from './ColorGeneticsNotice';

const UI_MAX_SELECTABLE_CANDIDATES = Math.min(24, MAX_MATRIX_CANDIDATES);

interface PairingComparisonMatrixProps {
  speciesProfile: SpeciesProfile;
  males: Animal[];
  females: Animal[];
  herdById: Map<string, Animal>;
  activeSireId?: string;
  activeDamId?: string;
  onLoadPairingInLogger: (sireId: string, damId: string) => void;
}

export function PairingComparisonMatrix({
  speciesProfile,
  males,
  females,
  herdById,
  activeSireId,
  activeDamId,
  onLoadPairingInLogger,
}: PairingComparisonMatrixProps) {
  const baseId = useId();
  const [anchorRole, setAnchorRole] = useState<PairingAnchorRole>('dam');
  const [anchorId, setAnchorId] = useState<string>('');
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [candidateSearch, setCandidateSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<PairingMatrixSortBy>('best_match');
  const [hideDangerRisks, setHideDangerRisks] = useState<boolean>(false);
  const [maxCoiFilter, setMaxCoiFilter] = useState<string>('all');
  const [isPickerOpen, setIsPickerOpen] = useState<boolean>(true);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  const anchorPool = anchorRole === 'dam' ? females : males;
  const candidatePool = anchorRole === 'dam' ? males : females;

  // Reset cleanly on species change
  useEffect(() => {
    setCandidateSearch('');
    setHideDangerRisks(false);
    setMaxCoiFilter('all');
    setExpandedRowKey(null);
    const defaultAnchor =
      anchorRole === 'dam'
        ? females.find((f) => f.id === activeDamId) ?? females[0]
        : males.find((m) => m.id === activeSireId) ?? males[0];
    setAnchorId(defaultAnchor?.id || '');
    setSelectedCandidateIds(
      selectDefaultMatrixCandidateIds(
        defaultAnchor,
        anchorRole === 'dam' ? males : females,
        DEFAULT_MATRIX_INITIAL_SELECTION
      )
    );
  }, [speciesProfile.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep anchor valid whenever pool changes (role switch, archive toggle, herd edit)
  useEffect(() => {
    if (anchorPool.length === 0) {
      if (anchorId !== '') setAnchorId('');
      return;
    }
    if (!anchorPool.some((a) => a.id === anchorId)) {
      const preferredId = anchorRole === 'dam' ? activeDamId : activeSireId;
      const nextAnchor = anchorPool.find((a) => a.id === preferredId) ?? anchorPool[0];
      setAnchorId(nextAnchor.id);
      setSelectedCandidateIds(
        selectDefaultMatrixCandidateIds(nextAnchor, candidatePool, DEFAULT_MATRIX_INITIAL_SELECTION)
      );
    }
  }, [anchorPool, anchorId, anchorRole, activeDamId, activeSireId, candidatePool]);

  // Prune removed/unavailable candidate IDs while keeping user's active selection intact
  useEffect(() => {
    const validIds = new Set(candidatePool.map((c) => c.id));
    setSelectedCandidateIds((prev) => {
      const next = prev.filter((id) => validIds.has(id) && id !== anchorId);
      if (next.length === prev.length) return prev;
      return next;
    });
  }, [candidatePool, anchorId]);

  const anchorAnimal = useMemo(
    () => anchorPool.find((a) => a.id === anchorId) ?? null,
    [anchorPool, anchorId]
  );

  const selectedIdSet = useMemo(() => new Set(selectedCandidateIds), [selectedCandidateIds]);

  const filteredCandidatePickerList = useMemo(() => {
    const q = candidateSearch.trim().toLowerCase();
    return candidatePool.filter((c) => {
      if (c.id === anchorId) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.tattoo.toLowerCase().includes(q) ||
        (c.breed || '').toLowerCase().includes(q) ||
        (c.variety || '').toLowerCase().includes(q)
      );
    });
  }, [candidatePool, anchorId, candidateSearch]);

  const selectedCandidates = useMemo(
    () => candidatePool.filter((c) => selectedIdSet.has(c.id)),
    [candidatePool, selectedIdSet]
  );

  const parsedMaxCoi: number | null = useMemo(() => {
    if (maxCoiFilter === 'all') return null;
    const val = Number(maxCoiFilter);
    return Number.isFinite(val) ? val : null;
  }, [maxCoiFilter]);

  const matrixResult = useMemo(() => {
    if (!anchorAnimal || selectedCandidates.length === 0) return null;
    return buildPairingComparisonMatrix({
      anchor: anchorAnimal,
      anchorRole,
      candidates: selectedCandidates,
      herdById,
      speciesName: speciesProfile.name,
      sortBy,
      hideDangerRisks,
      maxCoiPercent: parsedMaxCoi,
      maxCandidates: MAX_MATRIX_CANDIDATES,
    });
  }, [
    anchorAnimal,
    anchorRole,
    selectedCandidates,
    herdById,
    speciesProfile.name,
    sortBy,
    hideDangerRisks,
    parsedMaxCoi,
  ]);

  const handleSwitchAnchorRole = (nextRole: PairingAnchorRole) => {
    if (nextRole === anchorRole) return;
    setAnchorRole(nextRole);
    setExpandedRowKey(null);
    const nextAnchorPool = nextRole === 'dam' ? females : males;
    const nextCandidatePool = nextRole === 'dam' ? males : females;
    const preferredId = nextRole === 'dam' ? activeDamId : activeSireId;
    const nextAnchor = nextAnchorPool.find((a) => a.id === preferredId) ?? nextAnchorPool[0];
    setAnchorId(nextAnchor?.id || '');
    setSelectedCandidateIds(
      selectDefaultMatrixCandidateIds(nextAnchor, nextCandidatePool, DEFAULT_MATRIX_INITIAL_SELECTION)
    );
  };

  const handleAnchorChange = (nextAnchorId: string) => {
    setAnchorId(nextAnchorId);
    setExpandedRowKey(null);
    if (selectedCandidateIds.length === 0) {
      const nextAnchor = anchorPool.find((a) => a.id === nextAnchorId);
      setSelectedCandidateIds(
        selectDefaultMatrixCandidateIds(nextAnchor, candidatePool, DEFAULT_MATRIX_INITIAL_SELECTION)
      );
    }
  };

  const toggleCandidate = (id: string) => {
    setSelectedCandidateIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= UI_MAX_SELECTABLE_CANDIDATES) {
        return prev;
      }
      return [...prev, id];
    });
  };

  const selectSameBreedCandidates = () => {
    if (!anchorAnimal) return;
    const targetBreed = (anchorAnimal.breed || '').trim().toLowerCase();
    if (!targetBreed) {
      setSelectedCandidateIds(
        selectDefaultMatrixCandidateIds(anchorAnimal, candidatePool, UI_MAX_SELECTABLE_CANDIDATES)
      );
      return;
    }
    const matches = candidatePool
      .filter(
        (c) =>
          c.id !== anchorAnimal.id && (c.breed || '').trim().toLowerCase() === targetBreed
      )
      .slice(0, UI_MAX_SELECTABLE_CANDIDATES)
      .map((c) => c.id);
    setSelectedCandidateIds(matches);
  };

  const selectAllVisibleCandidates = () => {
    const ids = filteredCandidatePickerList
      .slice(0, UI_MAX_SELECTABLE_CANDIDATES)
      .map((c) => c.id);
    setSelectedCandidateIds(ids);
  };

  const syncFromActiveLogger = () => {
    const targetId = anchorRole === 'dam' ? activeDamId : activeSireId;
    if (targetId && anchorPool.some((a) => a.id === targetId)) {
      setAnchorId(targetId);
    }
  };

  const anchorLabel =
    anchorRole === 'dam'
      ? `Dam (${speciesProfile.femaleLabel})`
      : `Sire (${speciesProfile.maleLabel})`;
  const candidatePluralLabel =
    anchorRole === 'dam'
      ? `${speciesProfile.maleLabel}s`
      : `${speciesProfile.femaleLabel}s`;

  const canSyncFromLogger = Boolean(
    (anchorRole === 'dam' && activeDamId && activeDamId !== anchorId && females.some((f) => f.id === activeDamId)) ||
      (anchorRole === 'sire' && activeSireId && activeSireId !== anchorId && males.some((m) => m.id === activeSireId))
  );

  const renderCoiBadgeClass = (row: PairingMatrixRow): string => {
    if (row.coiRisk.code === 'HIGH') {
      return 'bg-[var(--barn-danger)]/15 text-[var(--barn-danger)] border-[var(--barn-danger)]/60';
    }
    if (row.coiRisk.code === 'LINEBRED' || row.coiRisk.code === 'MODERATE') {
      return 'bg-[var(--barn-terracotta-tint)] text-[var(--barn-terracotta)] border-[var(--barn-terracotta)]/60';
    }
    return 'bg-[var(--barn-sage-tint)] text-[var(--barn-sage)] border-[var(--barn-sage)]/50';
  };

  return (
    <section
      aria-label="Multi-Candidate Pairing Comparison Matrix"
      className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-5"
    >
      {/* Header & Role Mode Toggle */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-semibold">
              Multi-Candidate Pairing Comparison Matrix
            </h2>
            <ColorGeneticsNotice compact />
          </div>
          <p className="text-xs text-[var(--barn-muted)]">
            Compare one {anchorRole === 'dam' ? speciesProfile.femaleLabel : speciesProfile.maleLabel}{' '}
            against multiple candidate {candidatePluralLabel.toLowerCase()} side by side for COI %,
            shared bottleneck ancestors, carrier/health risk flags, and predicted coat varieties.
          </p>
        </div>

        <div
          role="group"
          aria-label="Comparison anchor direction"
          className="inline-flex rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] p-1 shrink-0 self-start"
        >
          <button
            type="button"
            onClick={() => handleSwitchAnchorRole('dam')}
            aria-pressed={anchorRole === 'dam'}
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${
              anchorRole === 'dam'
                ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
            }`}
          >
            1 {speciesProfile.femaleLabel} vs. {speciesProfile.maleLabel}s
          </button>
          <button
            type="button"
            onClick={() => handleSwitchAnchorRole('sire')}
            aria-pressed={anchorRole === 'sire'}
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${
              anchorRole === 'sire'
                ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
            1 {speciesProfile.maleLabel} vs. {speciesProfile.femaleLabel}s
          </button>
        </div>
      </div>

      {males.length === 0 || females.length === 0 ? (
        <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-muted)]">
          Add at least one {speciesProfile.maleLabel} and one {speciesProfile.femaleLabel} in your{' '}
          {speciesProfile.name} Herd (or enable &ldquo;Include Archived&rdquo; above) to compare
          pairings side by side.
        </div>
      ) : (
        <>
          {/* Controls Row: Anchor Selection, Sort, Filters */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={`${baseId}-anchor`}
                  className="block text-xs font-medium text-[var(--barn-muted)]"
                >
                  Anchor {anchorLabel}
                </label>
                {canSyncFromLogger && (
                  <button
                    type="button"
                    onClick={syncFromActiveLogger}
                    className="text-[11px] font-medium text-[var(--barn-sage)] hover:underline"
                  >
                    Use active logger {anchorRole === 'dam' ? 'dam' : 'sire'}
                  </button>
                )}
              </div>
              <select
                id={`${baseId}-anchor`}
                value={anchorId}
                onChange={(e) => handleAnchorChange(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
              >
                {anchorPool.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.tattoo || 'No ID'})
                    {a.breed ? ` · ${a.breed}` : ''}
                    {isAnimalArchived(a) ? ' [Archived]' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3 space-y-1">
              <label
                htmlFor={`${baseId}-sort`}
                className="block text-xs font-medium text-[var(--barn-muted)]"
              >
                Sort Candidates
              </label>
              <select
                id={`${baseId}-sort`}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as PairingMatrixSortBy)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
              >
                <option value="best_match">Best Match (Lowest Risk + COI)</option>
                <option value="coi_asc">Lowest COI % First</option>
                <option value="coi_desc">Highest COI % First</option>
                <option value="risk_asc">Lowest Carrier / Health Risk</option>
                <option value="name_asc">Candidate Name (A–Z)</option>
              </select>
            </div>

            <div className="md:col-span-2 space-y-1">
              <label
                htmlFor={`${baseId}-max-coi`}
                className="block text-xs font-medium text-[var(--barn-muted)]"
              >
                Max COI %
              </label>
              <select
                id={`${baseId}-max-coi`}
                value={maxCoiFilter}
                onChange={(e) => setMaxCoiFilter(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
              >
                <option value="all">Any COI</option>
                <option value="0">0% (Outcross)</option>
                <option value="6.25">&le; 6.25% (Low)</option>
                <option value="12.5">&le; 12.5% (Mild)</option>
                <option value="25">&le; 25% (Linebred)</option>
              </select>
            </div>

            <div className="md:col-span-3 flex flex-wrap items-center justify-between md:justify-end gap-2 min-h-[40px]">
              <label className="inline-flex items-center gap-1.5 text-xs text-[var(--barn-ink)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideDangerRisks}
                  onChange={(e) => setHideDangerRisks(e.target.checked)}
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                Hide High-Risk Alerts
              </label>
            </div>
          </div>

          {/* Candidate Multi-Selector Panel */}
          <div className="rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsPickerOpen((v) => !v)}
                aria-expanded={isPickerOpen}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--barn-ink)] hover:text-[var(--barn-sage)]"
              >
                {isPickerOpen ? (
                  <ChevronUp className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-4 h-4" aria-hidden="true" />
                )}
                Candidate {candidatePluralLabel} Selected ({selectedCandidateIds.length} /{' '}
                {Math.min(candidatePool.length, UI_MAX_SELECTABLE_CANDIDATES)})
              </button>

              <div className="flex flex-wrap items-center gap-1.5">
                {anchorAnimal?.breed && (
                  <button
                    type="button"
                    onClick={selectSameBreedCandidates}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)]"
                  >
                    Same Breed ({anchorAnimal.breed})
                  </button>
                )}
                <button
                  type="button"
                  onClick={selectAllVisibleCandidates}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)]"
                >
                  Select{' '}
                  {filteredCandidatePickerList.length > UI_MAX_SELECTABLE_CANDIDATES
                    ? `Top ${UI_MAX_SELECTABLE_CANDIDATES}`
                    : `All (${filteredCandidatePickerList.length})`}
                </button>
                {selectedCandidateIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedCandidateIds([])}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {isPickerOpen && (
              <div className="space-y-2.5">
                {candidatePool.length > 6 && (
                  <div className="relative max-w-sm">
                    <Search
                      className="w-3.5 h-3.5 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={candidateSearch}
                      onChange={(e) => setCandidateSearch(e.target.value)}
                      placeholder={`Filter candidate ${candidatePluralLabel.toLowerCase()} by name, ID, breed...`}
                      aria-label={`Filter candidate ${candidatePluralLabel.toLowerCase()}`}
                      className="w-full min-h-[36px] pl-8 pr-8 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                    />
                    {candidateSearch && (
                      <button
                        type="button"
                        onClick={() => setCandidateSearch('')}
                        aria-label="Clear candidate search"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[26px] min-w-[26px] rounded text-[var(--barn-muted)] hover:text-[var(--barn-ink)] flex items-center justify-center"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}

                {filteredCandidatePickerList.length === 0 ? (
                  <p className="text-xs text-[var(--barn-muted)]">
                    No candidate {candidatePluralLabel.toLowerCase()} matched your filter.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                    {filteredCandidatePickerList.map((cand) => {
                      const isSelected = selectedIdSet.has(cand.id);
                      const atCap =
                        !isSelected && selectedCandidateIds.length >= UI_MAX_SELECTABLE_CANDIDATES;
                      return (
                        <button
                          key={cand.id}
                          type="button"
                          disabled={atCap}
                          aria-pressed={isSelected}
                          onClick={() => toggleCandidate(cand.id)}
                          className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-xs transition-colors inline-flex items-center gap-1.5 disabled:opacity-45 ${
                            isSelected
                              ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)] text-[var(--barn-ink)] font-semibold'
                              : 'bg-[var(--barn-surface)] border-[var(--barn-border)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)]'
                          }`}
                        >
                          <span
                            className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                              isSelected
                                ? 'bg-[var(--barn-sage)] border-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                                : 'border-[var(--barn-border)] bg-[var(--barn-canvas)]'
                            }`}
                            aria-hidden="true"
                          >
                            {isSelected && <Check className="w-2.5 h-2.5" />}
                          </span>
                          <span>{cand.name}</span>
                          {cand.tattoo && (
                            <span className="font-mono text-[10px] opacity-80">({cand.tattoo})</span>
                          )}
                          {isAnimalArchived(cand) && (
                            <span className="text-[10px] text-[var(--barn-terracotta)]">[Arch]</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Summary Strip */}
          {matrixResult && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--barn-muted)]">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>
                  Showing{' '}
                  <strong className="text-[var(--barn-ink)] font-mono tabular-nums">
                    {matrixResult.summary.totalMatchingFilters}
                  </strong>{' '}
                  of{' '}
                  <span className="font-mono tabular-nums">
                    {matrixResult.summary.totalEvaluated}
                  </span>{' '}
                  compared pairings for{' '}
                  <strong className="text-[var(--barn-ink)]">{matrixResult.anchor.name}</strong>
                </span>
                {matrixResult.summary.lowestCoiPercent !== null &&
                  matrixResult.summary.highestCoiPercent !== null && (
                    <span className="font-mono tabular-nums">
                      COI range: {matrixResult.summary.lowestCoiPercent.toFixed(2)}% –{' '}
                      {matrixResult.summary.highestCoiPercent.toFixed(2)}%
                    </span>
                  )}
                <span className="text-[var(--barn-sage)] font-medium">
                  {matrixResult.summary.lowCoiCount} low-COI / no-danger
                </span>
                {matrixResult.summary.dangerRiskCount > 0 && (
                  <span className="text-[var(--barn-danger)] font-medium">
                    {matrixResult.summary.dangerRiskCount} high-risk flagged
                  </span>
                )}
              </div>
              {matrixResult.summary.truncatedCount > 0 && (
                <span className="text-[11px] text-[var(--barn-terracotta)]">
                  Capped at {MAX_MATRIX_CANDIDATES} candidates for fast mobile calculation.
                </span>
              )}
            </div>
          )}

          {/* Comparison Table */}
          {selectedCandidateIds.length === 0 ? (
            <div className="p-5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-center text-xs text-[var(--barn-muted)]">
              Select two or more candidate {candidatePluralLabel.toLowerCase()} above to compare
              COI %, bottleneck ancestors, carrier risk flags, and predicted varieties side by side.
            </div>
          ) : matrixResult && matrixResult.rows.length === 0 ? (
            <div className="p-5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-center space-y-2">
              <p className="text-xs text-[var(--barn-muted)]">
                All {matrixResult.summary.totalEvaluated} selected candidates were filtered out by
                your current COI or High-Risk filter.
              </p>
              <button
                type="button"
                onClick={() => {
                  setHideDangerRisks(false);
                  setMaxCoiFilter('all');
                }}
                className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)]"
              >
                Reset Matrix Filters
              </button>
            </div>
          ) : matrixResult ? (
            <div className="overflow-x-auto rounded-xl border border-[var(--barn-border)]">
              <table className="w-full text-left border-collapse text-xs min-w-[780px]">
                <thead>
                  <tr className="bg-[var(--barn-canvas)] border-b border-[var(--barn-border)] text-[11px] font-semibold text-[var(--barn-muted)]">
                    <th scope="col" className="py-2.5 px-3">
                      Candidate {anchorRole === 'dam' ? speciesProfile.maleLabel : speciesProfile.femaleLabel}
                    </th>
                    <th scope="col" className="py-2.5 px-3">
                      Projected COI %
                    </th>
                    <th scope="col" className="py-2.5 px-3">
                      Shared Bottleneck Ancestors
                    </th>
                    <th scope="col" className="py-2.5 px-3">
                      Carrier &amp; Genetic Risk Flags
                    </th>
                    <th scope="col" className="py-2.5 px-3">
                      Predicted Coat Varieties
                    </th>
                    <th scope="col" className="py-2.5 px-3 text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--barn-border)] bg-[var(--barn-surface)]">
                  {matrixResult.rows.map((row) => {
                    const isExpanded = expandedRowKey === row.pairKey;
                    const isCurrentlyLoaded =
                      activeSireId === row.sire.id && activeDamId === row.dam.id;
                    const hasExpandableDetails =
                      row.totalSharedAncestorCount > row.topBottlenecks.length ||
                      row.riskSummary.carrierRisks.length > 0 ||
                      row.riskSummary.geneticAlerts.length > 0;

                    return (
                      <React.Fragment key={row.pairKey}>
                        <tr
                          className={`align-top transition-colors ${
                            row.riskSummary.totalDangerCount > 0
                              ? 'bg-[var(--barn-danger)]/[0.04]'
                              : row.isRecommendedLowestRisk
                              ? 'bg-[var(--barn-sage-tint)]/35'
                              : 'hover:bg-[var(--barn-canvas)]/60'
                          }`}
                        >
                          {/* Candidate */}
                          <td className="py-3 px-3 space-y-1 max-w-[190px]">
                            <div className="font-semibold text-[var(--barn-ink)] flex flex-wrap items-center gap-1.5">
                              <span>{row.candidate.name}</span>
                              {row.isRecommendedLowestRisk && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--barn-sage)] text-[var(--barn-on-sage)]">
                                  Lowest Risk
                                </span>
                              )}
                              {isCurrentlyLoaded && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-[var(--barn-slate)] text-[var(--barn-slate)]">
                                  In Logger
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[11px] text-[var(--barn-muted)]">
                              {row.candidate.tattoo || 'No ID'}
                              {row.candidate.breed ? ` · ${row.candidate.breed}` : ''}
                            </div>
                            <div className="flex flex-wrap items-center gap-1 text-[10px] text-[var(--barn-muted)]">
                              {row.candidate.variety && <span>{row.candidate.variety}</span>}
                              {row.sameBreed && (
                                <span className="px-1.5 py-0.5 rounded bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-ink)]">
                                  Same breed
                                </span>
                              )}
                              {isAnimalArchived(row.candidate) && (
                                <span className="px-1.5 py-0.5 rounded bg-[var(--barn-terracotta-tint)] text-[var(--barn-terracotta)]">
                                  Archived
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Projected COI % */}
                          <td className="py-3 px-3 space-y-1 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-base font-semibold tabular-nums text-[var(--barn-ink)]">
                                {row.coiPercent.toFixed(2)}%
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${renderCoiBadgeClass(
                                  row
                                )}`}
                              >
                                {row.coiRisk.label}
                              </span>
                            </div>
                            <div className="font-mono text-[10px] text-[var(--barn-muted)] tabular-nums">
                              3-Gen: {row.completeness.known3Gen}/{row.completeness.max3Gen} (
                              {row.completeness.percent3Gen}%)
                            </div>
                            {row.completeness.isIncompleteZeroOutcross && (
                              <div className="text-[10px] text-[var(--barn-terracotta)] whitespace-normal max-w-[160px] leading-snug">
                                Incomplete lineage — 0% reflects unrecorded ancestors
                              </div>
                            )}
                          </td>

                          {/* Shared Bottleneck Ancestors */}
                          <td className="py-3 px-3 space-y-1 max-w-[230px]">
                            {row.topBottlenecks.length === 0 ? (
                              <span className="text-[var(--barn-muted)]">
                                None (0 shared in 8 gen)
                              </span>
                            ) : (
                              <div className="space-y-1">
                                {row.topBottlenecks.map((bn) => (
                                  <div
                                    key={bn.ancestorId}
                                    className="flex items-baseline justify-between gap-2 text-[11px]"
                                  >
                                    <span className="truncate text-[var(--barn-ink)]" title={`${bn.name} (${bn.tattoo})`}>
                                      <span className="font-medium">{bn.name}</span>
                                      {bn.tattoo ? (
                                        <span className="font-mono text-[10px] text-[var(--barn-muted)] ml-1">
                                          ({bn.tattoo})
                                        </span>
                                      ) : null}
                                      <span className="text-[10px] text-[var(--barn-muted)] ml-1">
                                        {bn.sireAppearances}S/{bn.damAppearances}D
                                      </span>
                                    </span>
                                    <span className="font-mono font-semibold tabular-nums shrink-0 text-[var(--barn-terracotta)]">
                                      +{bn.coiContributionPercent.toFixed(2)}%
                                    </span>
                                  </div>
                                ))}
                                {row.totalSharedAncestorCount > row.topBottlenecks.length && (
                                  <div className="text-[10px] text-[var(--barn-muted)]">
                                    +{row.totalSharedAncestorCount - row.topBottlenecks.length} more
                                    shared ancestor
                                    {row.totalSharedAncestorCount - row.topBottlenecks.length === 1
                                      ? ''
                                      : 's'}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Carrier & Genetic Risk Flags */}
                          <td className="py-3 px-3 space-y-1.5 max-w-[240px]">
                            {row.riskSummary.carrierRisks.length === 0 &&
                            row.riskSummary.geneticAlerts.length === 0 ? (
                              <span className="text-[var(--barn-sage)] font-medium">
                                No risks flagged
                              </span>
                            ) : (
                              <div className="space-y-1">
                                {row.riskSummary.geneticAlerts.map((alert, idx) => (
                                  <div
                                    key={`gen-${idx}-${alert.title}`}
                                    className={`px-2 py-1 rounded-md border text-[11px] leading-snug ${
                                      alert.severity === 'danger'
                                        ? 'bg-[var(--barn-danger)]/10 border-[var(--barn-danger)]/70 text-[var(--barn-danger)] font-semibold'
                                        : alert.severity === 'warning'
                                        ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)]/70 text-[var(--barn-ink)]'
                                        : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] text-[var(--barn-muted)]'
                                    }`}
                                  >
                                    <span className="inline-flex items-center gap-1">
                                      {alert.severity === 'danger' && (
                                        <ShieldAlert className="w-3 h-3 shrink-0" aria-hidden="true" />
                                      )}
                                      {alert.severity === 'warning' && (
                                        <AlertTriangle className="w-3 h-3 shrink-0 text-[var(--barn-terracotta)]" aria-hidden="true" />
                                      )}
                                      <span>{alert.title}</span>
                                    </span>
                                  </div>
                                ))}
                                {row.riskSummary.carrierRisks.slice(0, 3).map((risk) => (
                                  <div
                                    key={`car-${risk.trait}`}
                                    className={`px-2 py-1 rounded-md border text-[11px] leading-snug ${
                                      risk.severity === 'danger'
                                        ? 'bg-[var(--barn-danger)]/10 border-[var(--barn-danger)]/70 text-[var(--barn-danger)] font-semibold'
                                        : risk.severity === 'warning'
                                        ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)]/70 text-[var(--barn-ink)]'
                                        : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] text-[var(--barn-muted)]'
                                    }`}
                                  >
                                    <span>{risk.trait}</span>{' '}
                                    <span className="font-mono text-[10px] opacity-80">
                                      ({risk.severity === 'danger' ? 'Both Confirmed' : risk.severity === 'warning' ? 'Shared' : '1-Side'})
                                    </span>
                                  </div>
                                ))}
                                {row.riskSummary.carrierRisks.length > 3 && (
                                  <div className="text-[10px] text-[var(--barn-muted)]">
                                    +{row.riskSummary.carrierRisks.length - 3} more carrier flag
                                    {row.riskSummary.carrierRisks.length - 3 === 1 ? '' : 's'}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Predicted Coat Varieties */}
                          <td className="py-3 px-3 space-y-1 max-w-[230px]">
                            {row.genetics.isCustomSpeciesFallback ? (
                              <div className="text-[11px] text-[var(--barn-muted)] space-y-0.5">
                                <div>Custom species DNA notes:</div>
                                <div className="font-mono text-[10px] text-[var(--barn-ink)] truncate">
                                  {row.candidate.genotypeRaw || 'Not recorded'}
                                </div>
                              </div>
                            ) : row.topVarieties.length === 0 ? (
                              <span className="text-[11px] text-[var(--barn-muted)]">
                                Record genotype on both parents
                              </span>
                            ) : (
                              <div className="space-y-1">
                                {row.topVarieties.map((v, idx) => (
                                  <div
                                    key={`${v.sexGroup || 'all'}-${v.label}-${idx}`}
                                    className="flex items-baseline justify-between gap-2 text-[11px]"
                                  >
                                    <span className="truncate text-[var(--barn-ink)]" title={`${v.label} (${v.genotypeSummary})`}>
                                      {v.sexGroup ? `[${v.sexGroup[0]}] ` : ''}
                                      {v.label}
                                      {v.hasUnknownCarrier ? ' *' : ''}
                                    </span>
                                    <span className="font-mono font-semibold tabular-nums shrink-0 text-[var(--barn-muted)]">
                                      {v.probabilityPercent.toFixed(1)}%
                                    </span>
                                  </div>
                                ))}
                                {row.genetics.predictedPhenotypes.length > row.topVarieties.length && (
                                  <div className="text-[10px] text-[var(--barn-muted)]">
                                    +{row.genetics.predictedPhenotypes.length - row.topVarieties.length}{' '}
                                    more varieties
                                  </div>
                                )}
                                {row.genetics.hasUnknownAlleles && (
                                  <div className="text-[10px] text-[var(--barn-terracotta)]">
                                    * Provisional (&lsquo;_&rsquo; loci)
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <div className="flex flex-col items-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => onLoadPairingInLogger(row.sire.id, row.dam.id)}
                                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold hover:opacity-95 inline-flex items-center gap-1"
                              >
                                Load in Logger
                                <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                              {hasExpandableDetails && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedRowKey(isExpanded ? null : row.pairKey)
                                  }
                                  aria-expanded={isExpanded}
                                  className="text-[11px] font-medium text-[var(--barn-slate)] hover:underline inline-flex items-center gap-0.5"
                                >
                                  {isExpanded ? 'Hide details' : 'Details'}
                                  {isExpanded ? (
                                    <ChevronUp className="w-3 h-3" aria-hidden="true" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3" aria-hidden="true" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-[var(--barn-canvas)]/70">
                            <td colSpan={6} className="px-4 py-3">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px]">
                                <div className="space-y-1.5">
                                  <div className="font-semibold text-[var(--barn-ink)]">
                                    All Shared Bottleneck Ancestors ({row.sharedAncestors.length})
                                  </div>
                                  {row.sharedAncestors.length === 0 ? (
                                    <p className="text-[var(--barn-muted)]">
                                      No shared ancestors detected across 8 evaluated generations.
                                    </p>
                                  ) : (
                                    <ul className="space-y-1">
                                      {row.sharedAncestors.map((sa) => (
                                        <li
                                          key={sa.ancestor.id}
                                          className="flex items-center justify-between gap-2 text-[var(--barn-muted)]"
                                        >
                                          <span>
                                            <strong className="text-[var(--barn-ink)]">
                                              {sa.ancestor.name}
                                            </strong>{' '}
                                            ({sa.ancestor.tattoo || 'No ID'}) — {sa.sireAppearances}×
                                            Sire · {sa.damAppearances}× Dam
                                          </span>
                                          <span className="font-mono font-semibold text-[var(--barn-ink)] tabular-nums">
                                            +{sa.coiContributionPercent.toFixed(2)}%
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>

                                <div className="space-y-1.5">
                                  <div className="font-semibold text-[var(--barn-ink)]">
                                    Full Risk Breakdown (
                                    {row.riskSummary.carrierRisks.length +
                                      row.riskSummary.geneticAlerts.length}
                                    )
                                  </div>
                                  {row.riskSummary.geneticAlerts.map((alert, idx) => (
                                    <div
                                      key={`exp-gen-${idx}`}
                                      className="p-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]"
                                    >
                                      <div className="font-semibold text-[var(--barn-ink)]">
                                        {alert.title}
                                      </div>
                                      <div className="text-[var(--barn-muted)] mt-0.5">
                                        {alert.detail}
                                      </div>
                                    </div>
                                  ))}
                                  {row.riskSummary.carrierRisks.map((risk) => (
                                    <div
                                      key={`exp-car-${risk.trait}`}
                                      className="p-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-[var(--barn-ink)]">
                                        <span>{risk.trait}</span>
                                        <span className="font-mono text-[10px] font-normal text-[var(--barn-muted)]">
                                          {risk.sireStatus} × {risk.damStatus}
                                        </span>
                                      </div>
                                      <div className="text-[var(--barn-muted)] mt-0.5">
                                        {risk.summary}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
```

## `src/components/PedigreeOcrScannerPanel.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Offline Paper Pedigree OCR & Scanned PDF Review Queue Panel
 * (`src/components/PedigreeOcrScannerPanel.tsx`).
 *
 * Lets breeders snap a photo of a paper pedigree or upload JPG/PNG/WebP/PDF scans,
 * runs 100% client-side offline OCR / PDF vector extraction, provides an editable
 * 15-slot 3-generation pedigree draft grid, and stages the reviewed animals cleanly
 * into `ExternalImporterPanel`'s standard Import Review Queue (`PlatformImportPreview`).
 */

import {
  Camera,
  ChevronDown,
  ChevronUp,
  FileText,
  FileUp,
  Layers,
  Loader2,
  RotateCcw,
  ScanText,
  Sparkles,
} from 'lucide-react';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  buildPlatformImportPreviewFromOcrDrafts,
  createEmptyPedigreeOcrSlots,
  PedigreeOcrSlotDraft,
  PedigreeOcrSlotKey,
} from '../core/importers/pedigreeOcrParser';
import type { PlatformImportPreview } from '../core/importers/importerTypes';
import {
  BarnDatabaseSnapshot,
  BiologicalSex,
  formatWeight,
  PREDEFINED_SPECIES_PRESETS,
} from '../core/models';
import {
  PedigreeScanSessionResult,
  scanPedigreeDocumentFile,
} from '../storage/pedigreeOcrScanner';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';

interface PedigreeOcrScannerPanelProps {
  snapshot: BarnDatabaseSnapshot;
  activeSpeciesName: string;
  constrainedDevice?: boolean;
  onStagePreviewToImportQueue: (staged: {
    key: string;
    preview: PlatformImportPreview;
  }) => void;
}

const GENERATION_GROUPS: ReadonlyArray<{
  gen: 0 | 1 | 2 | 3;
  title: string;
  subtitle: string;
}> = [
  { gen: 0, title: 'Subject Animal', subtitle: 'Primary animal at root of scanned pedigree' },
  { gen: 1, title: 'Gen 1 · Parents', subtitle: 'Sire & Dam' },
  { gen: 2, title: 'Gen 2 · Grandparents', subtitle: 'Paternal & Maternal Grandparents' },
  { gen: 3, title: 'Gen 3 · Great-Grandparents', subtitle: '8 Great-Grandparent Ancestors' },
];

export function PedigreeOcrScannerPanel({
  snapshot,
  activeSpeciesName,
  constrainedDevice = false,
  onStagePreviewToImportQueue,
}: PedigreeOcrScannerPanelProps) {
  const baseId = useId();
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const defaultFallbackSpecies =
    activeSpeciesName || snapshot.settings.defaultSpecies || 'Rabbit';
  const preferredUnit = snapshot.settings.preferredUnit || 'lbs_oz';

  const scanLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const [scanProgress, setScanProgress] = useState<{
    label: string;
    pct: number;
  } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [stagedSuccessMessage, setStagedSuccessMessage] = useState<string | null>(null);

  const [session, setSession] = useState<PedigreeScanSessionResult | null>(null);
  const [activePageArrayIdx, setActivePageArrayIdx] = useState<number>(0);
  const [slotsByPageIdx, setSlotsByPageIdx] = useState<
    Record<number, PedigreeOcrSlotDraft[]>
  >({});
  const [targetSpecies, setTargetSpecies] = useState<string>(defaultFallbackSpecies);
  const [attachScanPhotoToSubject, setAttachScanPhotoToSubject] = useState<boolean>(true);
  const [showRawOcrText, setShowRawOcrText] = useState<boolean>(false);
  const [expandedSlotKeys, setExpandedSlotKeys] = useState<Record<string, boolean>>({
    subject: true,
    sire: true,
    dam: true,
  });
  const [openGenerations, setOpenGenerations] = useState<Record<number, boolean>>({
    0: true,
    1: true,
    2: false,
    3: false,
  });

  const activePage = session?.pages[activePageArrayIdx] ?? null;
  const activeSlots = slotsByPageIdx[activePageArrayIdx] ?? [];

  // Safely manage temporary preview Object URL for the scanned image/page
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    const blob = activePage?.previewBlob ?? null;
    if (!blob) {
      setPreviewObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setPreviewObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [activePage]);

  const speciesSuggestions = useMemo(() => {
    const names = new Set<string>();
    for (const sp of snapshot.speciesProfiles) {
      if (sp.name.trim()) names.add(sp.name.trim());
    }
    for (const preset of PREDEFINED_SPECIES_PRESETS) {
      if (preset.name.trim()) names.add(preset.name.trim());
    }
    return Array.from(names);
  }, [snapshot.speciesProfiles]);

  const includedSlots = useMemo(
    () =>
      activeSlots.filter(
        (s) =>
          s.included &&
          Boolean(
            s.name.trim() ||
              s.tattoo.trim() ||
              s.registrationNumber.trim() ||
              s.grandChampionNumber.trim()
          )
      ),
    [activeSlots]
  );

  const initializeEditorStateFromSession = (res: PedigreeScanSessionResult) => {
    const initialByPage: Record<number, PedigreeOcrSlotDraft[]> = {};
    res.pages.forEach((p, idx) => {
      initialByPage[idx] = p.parseResult.slots.map((slot) => ({
        ...slot,
        weightText:
          slot.weightGrams > 0 && !slot.weightText
            ? formatWeight(slot.weightGrams, preferredUnit)
            : slot.weightText,
      }));
    });

    const recIdx = Math.max(
      0,
      Math.min(res.pages.length - 1, res.recommendedPageIndex || 0)
    );
    const recPage = res.pages[recIdx];
    const recSlots = initialByPage[recIdx] ?? [];

    const hasGen2 = recSlots.some((s) => s.generation === 2 && s.included);
    const hasGen3 = recSlots.some((s) => s.generation === 3 && s.included);
    const nextExpanded: Record<string, boolean> = {
      subject: true,
      sire: true,
      dam: true,
    };
    for (const s of recSlots) {
      if (
        s.included &&
        (s.weightText ||
          s.birthDateIso ||
          s.variety ||
          s.breed ||
          s.grandChampionNumber ||
          s.legsCount > 0 ||
          s.genotypeRaw)
      ) {
        nextExpanded[s.slotKey] = true;
      }
    }

    setSession(res);
    setActivePageArrayIdx(recIdx);
    setSlotsByPageIdx(initialByPage);
    setTargetSpecies(recPage?.parseResult.detectedSpecies || defaultFallbackSpecies);
    setAttachScanPhotoToSubject(Boolean(recPage?.attachablePhoto));
    setOpenGenerations({
      0: true,
      1: true,
      2: hasGen2,
      3: hasGen3,
    });
    setExpandedSlotKeys(nextExpanded);
    setShowRawOcrText(false);
    setStagedSuccessMessage(null);
  };

  const handleSelectedFile = async (file: File | undefined) => {
    if (!file) return;
    await scanLock.runLocked(async () => {
      setScanError(null);
      setStagedSuccessMessage(null);
      setScanProgress({ label: 'Preparing pedigree scan...', pct: 5 });
      try {
        const res = await scanPedigreeDocumentFile(file, {
          fallbackSpecies: defaultFallbackSpecies,
          preferredUnit,
          constrainedDevice,
          onProgress: (label, pct) => {
            setScanProgress({
              label,
              pct: typeof pct === 'number' ? pct : 50,
            });
          },
        });

        if (res.status === 'invalid_file') {
          setScanError(res.errorMessage || 'Selected file could not be scanned.');
          return;
        }

        if (res.status === 'pdf_unsupported' && res.errorMessage) {
          setScanError(res.errorMessage);
        }

        if (res.pages.length > 0) {
          initializeEditorStateFromSession(res);
        }
      } catch (err: unknown) {
        setScanError(
          err instanceof Error
            ? err.message
            : 'Could not scan pedigree document. Try a clearer photo or enter slots manually.'
        );
      } finally {
        setScanProgress(null);
      }
    });
  };

  const handleOpenManualTemplate = () => {
    setScanError(null);
    setStagedSuccessMessage(null);
    const blankSlots = createEmptyPedigreeOcrSlots('');
    blankSlots[0].included = true;
    const manualSession: PedigreeScanSessionResult = {
      status: 'no_text_found',
      sourceFileName: 'manual-paper-pedigree.txt',
      isPdf: false,
      pages: [
        {
          pageIndex: 0,
          sourceLabel: 'Blank 3-Generation Manual Entry',
          engine: 'none',
          confidence: 0,
          rawText: '',
          imageWidth: 0,
          imageHeight: 0,
          parseResult: {
            slots: blankSlots,
            detectedSpecies: defaultFallbackSpecies,
            detectedBreed: '',
            sanitizedRawText: '',
            layoutMode: 'manual_empty',
            populatedSlotCount: 0,
            warnings: [],
          },
          previewBlob: null,
        },
      ],
      recommendedPageIndex: 0,
      warnings: [],
    };
    initializeEditorStateFromSession(manualSession);
    setOpenGenerations({ 0: true, 1: true, 2: true, 3: false });
  };

  const handleReset = () => {
    setSession(null);
    setSlotsByPageIdx({});
    setScanError(null);
    setStagedSuccessMessage(null);
    setScanProgress(null);
    setShowRawOcrText(false);
  };

  const updateSlot = (
    slotKey: PedigreeOcrSlotKey,
    patch: Partial<PedigreeOcrSlotDraft>
  ) => {
    setSlotsByPageIdx((prev) => {
      const current = prev[activePageArrayIdx] ?? [];
      return {
        ...prev,
        [activePageArrayIdx]: current.map((s) =>
          s.slotKey === slotKey ? { ...s, ...patch } : s
        ),
      };
    });
  };

  const handleStageToImportQueue = () => {
    if (!session || !activePage || includedSlots.length === 0) return;
    setScanError(null);
    const preview = buildPlatformImportPreviewFromOcrDrafts({
      slots: activeSlots,
      speciesName: targetSpecies.trim() || defaultFallbackSpecies,
      sourceFileName: session.sourceFileName,
      existingSnapshot: snapshot,
      attachedScanPhoto:
        attachScanPhotoToSubject && activePage.attachablePhoto
          ? activePage.attachablePhoto
          : undefined,
    });
    const stagedKey = `ocr-${Date.now()}-${session.sourceFileName}`;
    onStagePreviewToImportQueue({ key: stagedKey, preview });
    setStagedSuccessMessage(
      `Staged ${preview.animals.length} pedigree animal${preview.animals.length === 1 ? '' : 's'} (${preview.parentLinksResolved} parent link${preview.parentLinksResolved === 1 ? '' : 's'}) to the Import Review Queue below.`
    );
  };

  const engineLabel =
    activePage?.engine === 'pdf-vector-text'
      ? 'Searchable PDF Vector Text'
      : activePage?.engine === 'native-text-detector'
        ? 'On-Device Chromium TextDetector'
        : activePage?.engine === 'tesseract-js'
          ? 'Tesseract.js Local OCR Worker'
          : 'Manual 3-Generation Entry';

  return (
    <div
      id="pedigree-ocr-scanner"
      className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--barn-sage)]">
            Offline Paper &amp; PDF Pedigree Scanner
          </div>
          <h3 className="font-display text-lg sm:text-xl font-semibold text-[var(--barn-ink)]">
            Snap Pedigree Photo or Scan PDF
          </h3>
          <p className="text-xs text-[var(--barn-muted)] leading-relaxed">
            Runs 100% locally in your browser (PDF vector extractor + native{' '}
            <code className="font-mono">TextDetector</code> / Tesseract.js worker) to extract
            up to 3 generations into an editable draft before merging into your barn.
          </p>
        </div>
        <ScanText className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
      </div>

      {/* File & Camera Triggers */}
      <div className="flex flex-wrap items-center gap-2.5">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void handleSelectedFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            void handleSelectedFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <button
          type="button"
          disabled={scanLock.isSubmitting}
          aria-busy={scanLock.isSubmitting}
          onClick={() => cameraInputRef.current?.click()}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 disabled:opacity-60 inline-flex items-center gap-2"
        >
          <Camera className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Take Pedigree Photo</span>
        </button>

        <button
          type="button"
          disabled={scanLock.isSubmitting}
          onClick={() => fileInputRef.current?.click()}
          className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-semibold text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] disabled:opacity-60 inline-flex items-center gap-2"
        >
          <FileUp className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
          <span>Upload Photo or PDF Scan</span>
        </button>

        <button
          type="button"
          disabled={scanLock.isSubmitting}
          onClick={handleOpenManualTemplate}
          className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-medium text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] disabled:opacity-60 inline-flex items-center gap-1.5"
        >
          <Layers className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
          <span>Blank 3-Gen Entry</span>
        </button>

        {session && (
          <button
            type="button"
            disabled={scanLock.isSubmitting}
            onClick={handleReset}
            className="min-h-[44px] px-3 py-2.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Clear Scan</span>
          </button>
        )}
      </div>

      {/* Live OCR Progress */}
      {scanProgress && (
        <div
          role="status"
          aria-live="polite"
          className="p-3.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs space-y-2"
        >
          <div className="flex items-center justify-between gap-2 font-semibold text-[var(--barn-ink)]">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--barn-sage)]" aria-hidden="true" />
              <span>{scanProgress.label}</span>
            </span>
            <span className="font-mono tabular-nums text-[var(--barn-muted)]">
              {scanProgress.pct}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--barn-canvas)] overflow-hidden">
            <div
              className="h-full bg-[var(--barn-sage)] transition-all duration-150"
              style={{ width: `${Math.max(4, Math.min(100, scanProgress.pct))}%` }}
            />
          </div>
        </div>
      )}

      {scanError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)] font-medium"
        >
          {scanError}
        </div>
      )}

      {stagedSuccessMessage && (
        <div
          role="status"
          aria-live="polite"
          className="p-3.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs text-[var(--barn-ink)] font-medium"
        >
          {stagedSuccessMessage}
        </div>
      )}

      {/* Active Scanned Pedigree Draft Review Queue */}
      {session && activePage && (
        <div className="border-t border-[var(--barn-border)] pt-4 space-y-4">
          {/* Page Switcher for Multi-Page PDFs */}
          {session.pages.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-[var(--barn-muted)]">PDF Pages:</span>
              {session.pages.map((p, idx) => (
                <button
                  key={`${p.pageIndex}-${idx}`}
                  type="button"
                  onClick={() => setActivePageArrayIdx(idx)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    idx === activePageArrayIdx
                      ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] border-[var(--barn-sage)] font-semibold'
                      : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                  }`}
                >
                  Page {p.pageIndex + 1} ({p.parseResult.populatedSlotCount} slots)
                </button>
              ))}
            </div>
          )}

          {/* Scan Warnings */}
          {session.warnings.map((w, i) => (
            <div
              key={i}
              className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)]"
            >
              {w}
            </div>
          ))}

          {/* Scan Summary, Thumbnail Preview & Target Species */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {previewObjectUrl && (
              <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] flex flex-col gap-2">
                <img
                  src={previewObjectUrl}
                  alt={`Preview of ${session.sourceFileName}`}
                  className="w-full max-h-44 object-contain rounded-lg bg-white border border-[var(--barn-border)]"
                />
                <span className="text-[11px] font-mono text-[var(--barn-muted)] truncate">
                  {session.sourceFileName}
                </span>
              </div>
            )}

            <div
              className={`${
                previewObjectUrl ? 'md:col-span-2' : 'md:col-span-3'
              } p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3 text-xs`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    {activePage.sourceLabel}
                  </div>
                  <div className="text-[11px] text-[var(--barn-muted)] font-mono">
                    {engineLabel}
                    {activePage.confidence > 0 ? ` · ${activePage.confidence}% conf.` : ''} ·{' '}
                    {activePage.parseResult.layoutMode === 'bounding_box_tree'
                      ? '2D Pedigree Tree Detected'
                      : activePage.parseResult.layoutMode === 'line_heuristic'
                        ? 'Text Label Mapping'
                        : 'Manual Draft'}{' '}
                    · {includedSlots.length}/15 active slots
                  </div>
                </div>

                {activePage.rawText && (
                  <button
                    type="button"
                    aria-expanded={showRawOcrText}
                    onClick={() => setShowRawOcrText((v) => !v)}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                    <span>{showRawOcrText ? 'Hide Raw OCR Text' : 'Inspect Raw OCR Text'}</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`${baseId}-target-species`}
                    className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Target Livestock Species
                  </label>
                  <input
                    id={`${baseId}-target-species`}
                    type="text"
                    list={`${baseId}-species-datalist`}
                    value={targetSpecies}
                    onChange={(e) => setTargetSpecies(e.target.value)}
                    placeholder="e.g. Rabbit, Goat, Sheep..."
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-semibold"
                  />
                  <datalist id={`${baseId}-species-datalist`}>
                    {speciesSuggestions.map((sp) => (
                      <option key={sp} value={sp} />
                    ))}
                  </datalist>
                </div>

                {activePage.attachablePhoto && (
                  <div className="flex items-end">
                    <label className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={attachScanPhotoToSubject}
                        onChange={(e) => setAttachScanPhotoToSubject(e.target.checked)}
                        className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                      />
                      <span>Attach scanned pedigree photo to Subject animal (WebP)</span>
                    </label>
                  </div>
                )}
              </div>

              {showRawOcrText && activePage.rawText && (
                <pre className="max-h-44 overflow-auto p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-[11px] whitespace-pre-wrap text-[var(--barn-ink)]">
                  {activePage.rawText}
                </pre>
              )}
            </div>
          </div>

          {/* 3-Generation Editable Slot Review Queue */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="font-semibold text-[var(--barn-ink)]">
                Review &amp; Edit Parsed Pedigree Slots (3 Generations · 15 Slots)
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpenGenerations({ 0: true, 1: true, 2: true, 3: true })}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] font-medium hover:bg-[var(--barn-subtle)]"
                >
                  Expand All Generations
                </button>
              </div>
            </div>

            {GENERATION_GROUPS.map((group) => {
              const groupSlots = activeSlots.filter((s) => s.generation === group.gen);
              const groupActiveCount = groupSlots.filter((s) => s.included && s.name.trim()).length;
              const isOpen = Boolean(openGenerations[group.gen]);

              return (
                <div
                  key={group.gen}
                  className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] overflow-hidden"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() =>
                      setOpenGenerations((prev) => ({ ...prev, [group.gen]: !prev[group.gen] }))
                    }
                    className="w-full px-3.5 py-3 flex items-center justify-between gap-2 text-left hover:bg-[var(--barn-subtle)]/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--barn-ink)]">
                        {group.title}{' '}
                        <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                          ({groupActiveCount}/{groupSlots.length} ready)
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--barn-muted)]">{group.subtitle}</div>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="p-3 border-t border-[var(--barn-border)] space-y-2.5">
                      {groupSlots.map((slot) => {
                        const detailsOpen = Boolean(expandedSlotKeys[slot.slotKey]);
                        return (
                          <div
                            key={slot.slotKey}
                            className={`p-3 rounded-xl border text-xs space-y-2.5 ${
                              slot.included
                                ? 'bg-[var(--barn-surface)] border-[var(--barn-sage)]/50'
                                : 'bg-[var(--barn-surface)]/50 border-[var(--barn-border)] opacity-85'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label className="flex items-center gap-2 font-semibold text-[var(--barn-ink)] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={slot.included}
                                  onChange={(e) =>
                                    updateSlot(slot.slotKey, { included: e.target.checked })
                                  }
                                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                                />
                                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                                  {slot.shortLabel}
                                </span>
                                <span>{slot.label}</span>
                              </label>

                              <div className="flex items-center gap-2">
                                {slot.confidence > 0 && (
                                  <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                                    {slot.confidence}% OCR
                                  </span>
                                )}
                                <button
                                  type="button"
                                  aria-expanded={detailsOpen}
                                  onClick={() =>
                                    setExpandedSlotKeys((prev) => ({
                                      ...prev,
                                      [slot.slotKey]: !prev[slot.slotKey],
                                    }))
                                  }
                                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] font-medium hover:bg-[var(--barn-subtle)]"
                                >
                                  {detailsOpen ? 'Compact' : 'More Fields'}
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div>
                                <label
                                  htmlFor={`${baseId}-${slot.slotKey}-name`}
                                  className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                >
                                  Name
                                </label>
                                <input
                                  id={`${baseId}-${slot.slotKey}-name`}
                                  type="text"
                                  value={slot.name}
                                  onChange={(e) =>
                                    updateSlot(slot.slotKey, {
                                      name: e.target.value,
                                      included: Boolean(e.target.value.trim()) || slot.included,
                                    })
                                  }
                                  placeholder="Animal name..."
                                  className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
                                />
                              </div>

                              <div>
                                <label
                                  htmlFor={`${baseId}-${slot.slotKey}-tattoo`}
                                  className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                >
                                  Ear / Tattoo / Tag
                                </label>
                                <input
                                  id={`${baseId}-${slot.slotKey}-tattoo`}
                                  type="text"
                                  value={slot.tattoo}
                                  onChange={(e) =>
                                    updateSlot(slot.slotKey, {
                                      tattoo: e.target.value,
                                      included: Boolean(e.target.value.trim()) || slot.included,
                                    })
                                  }
                                  placeholder="e.g. OR-101"
                                  className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-xs"
                                />
                              </div>

                              <div>
                                <label
                                  htmlFor={`${baseId}-${slot.slotKey}-reg`}
                                  className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                >
                                  ARBA Reg #
                                </label>
                                <input
                                  id={`${baseId}-${slot.slotKey}-reg`}
                                  type="text"
                                  value={slot.registrationNumber}
                                  onChange={(e) =>
                                    updateSlot(slot.slotKey, {
                                      registrationNumber: e.target.value,
                                      included: Boolean(e.target.value.trim()) || slot.included,
                                    })
                                  }
                                  placeholder="e.g. 4412A"
                                  className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-xs"
                                />
                              </div>
                            </div>

                            {detailsOpen && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1 border-t border-[var(--barn-border)]/70">
                                <div>
                                  <label
                                    htmlFor={`${baseId}-${slot.slotKey}-var`}
                                    className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                  >
                                    Variety / Color
                                  </label>
                                  <input
                                    id={`${baseId}-${slot.slotKey}-var`}
                                    type="text"
                                    value={slot.variety}
                                    onChange={(e) =>
                                      updateSlot(slot.slotKey, { variety: e.target.value })
                                    }
                                    placeholder="e.g. Broken Tort"
                                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                                  />
                                </div>

                                <div>
                                  <label
                                    htmlFor={`${baseId}-${slot.slotKey}-breed`}
                                    className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                  >
                                    Breed
                                  </label>
                                  <input
                                    id={`${baseId}-${slot.slotKey}-breed`}
                                    type="text"
                                    value={slot.breed}
                                    onChange={(e) =>
                                      updateSlot(slot.slotKey, { breed: e.target.value })
                                    }
                                    placeholder="e.g. Holland Lop"
                                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                                  />
                                </div>

                                <div>
                                  <label
                                    htmlFor={`${baseId}-${slot.slotKey}-wt`}
                                    className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                  >
                                    Weight (e.g. 4# 8oz)
                                  </label>
                                  <input
                                    id={`${baseId}-${slot.slotKey}-wt`}
                                    type="text"
                                    value={slot.weightText}
                                    onChange={(e) =>
                                      updateSlot(slot.slotKey, {
                                        weightText: e.target.value,
                                        weightGrams: 0,
                                      })
                                    }
                                    placeholder="4 lbs 8 oz"
                                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-xs"
                                  />
                                </div>

                                <div>
                                  <label
                                    htmlFor={`${baseId}-${slot.slotKey}-dob`}
                                    className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                  >
                                    Birth Date
                                  </label>
                                  <input
                                    id={`${baseId}-${slot.slotKey}-dob`}
                                    type="text"
                                    value={slot.birthDateIso}
                                    onChange={(e) =>
                                      updateSlot(slot.slotKey, { birthDateIso: e.target.value })
                                    }
                                    placeholder="YYYY-MM-DD"
                                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-xs"
                                  />
                                </div>

                                <div>
                                  <label
                                    htmlFor={`${baseId}-${slot.slotKey}-sex`}
                                    className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                  >
                                    Sex
                                  </label>
                                  <select
                                    id={`${baseId}-${slot.slotKey}-sex`}
                                    value={slot.sex}
                                    onChange={(e) =>
                                      updateSlot(slot.slotKey, {
                                        sex: e.target.value as BiologicalSex,
                                      })
                                    }
                                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                                  >
                                    <option value="Male">Male / Sire</option>
                                    <option value="Female">Female / Dam</option>
                                    <option value="Unknown">Unknown</option>
                                  </select>
                                </div>

                                <div>
                                  <label
                                    htmlFor={`${baseId}-${slot.slotKey}-gc`}
                                    className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                  >
                                    GC #
                                  </label>
                                  <input
                                    id={`${baseId}-${slot.slotKey}-gc`}
                                    type="text"
                                    value={slot.grandChampionNumber}
                                    onChange={(e) =>
                                      updateSlot(slot.slotKey, {
                                        grandChampionNumber: e.target.value,
                                      })
                                    }
                                    placeholder="e.g. GC-901"
                                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-xs"
                                  />
                                </div>

                                <div>
                                  <label
                                    htmlFor={`${baseId}-${slot.slotKey}-legs`}
                                    className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                  >
                                    Legs
                                  </label>
                                  <input
                                    id={`${baseId}-${slot.slotKey}-legs`}
                                    type="number"
                                    min={0}
                                    max={50}
                                    value={slot.legsCount}
                                    onChange={(e) =>
                                      updateSlot(slot.slotKey, {
                                        legsCount: Math.max(0, Number(e.target.value) || 0),
                                      })
                                    }
                                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-xs tabular-nums"
                                  />
                                </div>

                                <div>
                                  <label
                                    htmlFor={`${baseId}-${slot.slotKey}-geno`}
                                    className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                  >
                                    Genotype
                                  </label>
                                  <input
                                    id={`${baseId}-${slot.slotKey}-geno`}
                                    type="text"
                                    value={slot.genotypeRaw}
                                    onChange={(e) =>
                                      updateSlot(slot.slotKey, { genotypeRaw: e.target.value })
                                    }
                                    placeholder="e.g. aa B_ C_ dd E_"
                                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-xs"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            disabled={includedSlots.length === 0 || scanLock.isSubmitting}
            onClick={handleStageToImportQueue}
            className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 disabled:opacity-45 disabled:pointer-events-none inline-flex items-center justify-center gap-2 transition-opacity"
          >
            <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>
              {includedSlots.length === 0
                ? 'Enter or Check At Least 1 Pedigree Slot to Stage'
                : `Stage ${includedSlots.length} Scanned Animal${includedSlots.length === 1 ? '' : 's'} to Import Review Queue`}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
```

## `src/components/PedigreePrintNotice.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Compact inline notice displayed alongside pedigree print / export controls.
 */

import { AlertTriangle } from 'lucide-react';

interface PedigreePrintNoticeProps {
  compact?: boolean;
  className?: string;
}

export function PedigreePrintNotice({
  compact = false,
  className = '',
}: PedigreePrintNoticeProps) {
  if (compact) {
    return (
      <div
        role="note"
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)]/60 text-[11px] font-medium text-[var(--barn-ink)] ${className}`}
      >
        <AlertTriangle
          className="w-3 h-3 text-[var(--barn-terracotta)] shrink-0"
          aria-hidden="true"
        />
        <span>Pedigree print / export is not yet working.</span>
      </div>
    );
  }

  return (
    <div
      role="note"
      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)]/70 text-xs text-[var(--barn-ink)] ${className}`}
    >
      <AlertTriangle
        className="w-3.5 h-3.5 text-[var(--barn-terracotta)] shrink-0"
        aria-hidden="true"
      />
      <span>
        <strong>Notice:</strong> Pedigree print / export is not yet working.
      </span>
    </div>
  );
}
```

## `src/components/PedigreeScreen.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Interactive 3-, 4-, 5-, & 6-Generation Pedigree Tree Explorer (`Pedigree`).
 *
 * Strictly scoped to `activeData.speciesProfile.name`. Features:
 * - 3/4/5/6-gen depth selector
 * - Native two-finger pinch-to-zoom (`touch-action: none`) + pan & +/- zoom controls (25%–200%)
 * - Active-first parent linking with optional "Include Archived" toggle
 * - Optional primary animal photo embedding in exported Evans `.HTM` / PDF pedigrees
 */

import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  FileText,
  Plus,
  RotateCcw,
  Search,
  Share2,
  ShieldAlert,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatCompactCarrierDisclosure } from '../core/carrierGenetics';
import {
  analyzeAlleleProvenance,
  AnimalAlleleProvenanceResult,
  formatGenotypeArray,
} from '../core/geneticsEngine';
import { OptimizedImagePayload } from '../core/imageOptimizationSpec';
import {
  Animal,
  AnimalConflictKind,
  BarnSettings,
  doesAnimalNeedAttention,
  formatSexForSpecies,
  formatWeight,
  getSpeciesIdentifierLabels,
  isAnimalArchived,
  PedigreeGenerationDepth,
  resolveSpeciesWeightUnit,
  SpeciesProfile,
} from '../core/models';
import { analyzePedigreeTree } from '../core/pedigreeAnalysis';
import {
  buildPedigreeBranchViewport,
  buildPedigreeSlots,
  getGen3BranchesWithKnownAncestors,
  getPedigreeCompletenessSummary,
  PedigreeSlot,
  wouldCreateCycle,
} from '../core/pedigreeCalculator';
import {
  buildShareablePedigreeCardFileName,
  generateShareablePedigreeCardHtml,
} from '../core/shareablePedigreeCard';
import { computeAnimalShowSummary } from '../core/showResults';
import { generateEvansHtmPedigree, PedigreePrintOptions } from '../core/syncAndExports';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { buildAndDownloadPedigreePdf } from '../utils/webPdfActions';
import { AnimalEditorModal } from './AnimalEditorModal';
import { AlleleProvenanceLegend, ColoredGenotypeDisplay } from './ColoredGenotypeDisplay';
import { ColorGeneticsNotice } from './ColorGeneticsNotice';
import { PedigreePrintNotice } from './PedigreePrintNotice';
import { PrintPreviewModal } from './PrintPreviewModal';

interface PedigreeScreenProps {
  activeData: ActiveSpeciesData;
  allAnimals: Animal[];
  speciesProfiles: SpeciesProfile[];
  settings: BarnSettings;
  selectedSubjectId: string | null;
  generations: PedigreeGenerationDepth;
  onSelectSubject: (id: string) => void;
  onChangeGenerations: (gens: PedigreeGenerationDepth) => void;
  onOpenAnimalInHerd: (id: string) => void;
  onToggleIncludePhotoOnPedigree: (include: boolean) => void;
  onSaveAnimal: (
    draft: Omit<Animal, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string },
    linkParentTarget?: { childId: string; asSire: boolean },
    pendingPhotos?: Array<OptimizedImagePayload & { caption?: string }>
  ) => void;
  onIgnoreConflicts?: (animalId: string, kinds: AnimalConflictKind[]) => void;
  onRestoreConflictAlert?: (animalId: string, kinds?: AnimalConflictKind[]) => void;
  onLoadFullPhoto?: (photoId: string) => Promise<string | null>;
  onLoadFullPhotosBatch?: (photoIds: string[]) => Promise<Record<string, string>>;
  onLoadPedigreeNeighborhood?: (rootIds: string[], maxDepth: number) => Promise<Animal[]>;
  onCheckPedigreeBranchesHaveAncestors?: (
    animalIds: string[]
  ) => Promise<Record<string, boolean>>;
  onUpdateBreederLogo?: (dataUrl: string | undefined) => void;
}

const MIN_TREE_ZOOM = 0.2;
const MAX_TREE_ZOOM = 2.0;

function clampTreeZoom(value: number): number {
  return Math.min(MAX_TREE_ZOOM, Math.max(MIN_TREE_ZOOM, value));
}

export function PedigreeScreen({
  activeData,
  allAnimals,
  speciesProfiles,
  settings,
  selectedSubjectId,
  generations,
  onSelectSubject,
  onChangeGenerations,
  onOpenAnimalInHerd,
  onToggleIncludePhotoOnPedigree,
  onSaveAnimal,
  onIgnoreConflicts,
  onRestoreConflictAlert,
  onLoadFullPhoto,
  onLoadFullPhotosBatch,
  onLoadPedigreeNeighborhood,
  onCheckPedigreeBranchesHaveAncestors,
  onUpdateBreederLogo,
}: PedigreeScreenProps) {
  const {
    speciesProfile,
    animals,
    primaryPhotoByAnimalId,
    herdById,
    conflictsByAnimalId,
    coiByAnimalId,
    cages,
    shows,
    careLogs,
    woolHarvests = [],
  } = activeData;

  const [zoom, setZoom] = useState<number>(1);
  const [dimUniqueAncestors, setDimUniqueAncestors] = useState<boolean>(true);
  const [showRegistrationFlags, setShowRegistrationFlags] = useState<boolean>(true);
  const [expandedGen3Branches, setExpandedGen3Branches] = useState<Set<number>>(() => new Set());
  const [lazyAncestorsById, setLazyAncestorsById] = useState<Map<string, Animal>>(() => new Map());
  const [externalKnownGen4Branches, setExternalKnownGen4Branches] = useState<Set<number>>(
    () => new Set()
  );
  const [loadingGen3Branches, setLoadingGen3Branches] = useState<Set<number>>(() => new Set());
  const [printHydrating, setPrintHydrating] = useState<boolean>(false);
  const [linkingSlot, setLinkingSlot] = useState<PedigreeSlot | null>(null);
  const [includeArchivedInLink, setIncludeArchivedInLink] = useState(false);
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [creatingParentSlot, setCreatingParentSlot] = useState<PedigreeSlot | null>(null);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [pedigreeDocMode, setPedigreeDocMode] = useState<'formal_certificate' | 'shareable_card'>('formal_certificate');
  const [hydratedSubjectPhoto, setHydratedSubjectPhoto] = useState<{
    photoId: string;
    dataUrl: string;
  } | null>(null);
  const [familyPortraitPhotosByAnimalId, setFamilyPortraitPhotosByAnimalId] = useState<
    Record<string, string>
  >({});
  const [pedigreePrintOptions, setPedigreePrintOptions] = useState<PedigreePrintOptions>({
    orientation: 'landscape',
    showWeights: true,
    arbaLbsOzDotNotation: false,
    showGenotypes: false,
    showBreederFooter: true,
    breederContactLine: '',
    showBreederLogo: true,
    colorPreset: 'classic_sage',
    borderStyle: 'classic_rule',
    layoutPreset: 'evans_standard',
  });

  const closeLinkingDialog = useCallback(() => setLinkingSlot(null), []);
  const linkingDialogRef = useAccessibleDialog({
    isOpen: Boolean(linkingSlot),
    onClose: closeLinkingDialog,
  });

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sizerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const zoomLabelRef = useRef<HTMLButtonElement | null>(null);
  const zoomRef = useRef<number>(zoom);
  const canvasDimsRef = useRef<{ width: number; height: number }>({ width: 960, height: 640 });
  const wheelSyncTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (wheelSyncTimerRef.current !== null) {
        window.clearTimeout(wheelSyncTimerRef.current);
      }
    };
  }, []);

  const subject = useMemo(() => {
    if (selectedSubjectId && herdById.has(selectedSubjectId)) {
      return herdById.get(selectedSubjectId)!;
    }
    return animals[0] ?? null;
  }, [selectedSubjectId, herdById, animals]);

  const subjectPrimaryPhoto = subject ? primaryPhotoByAnimalId.get(subject.id) : undefined;
  const subjectShowSummary = useMemo(
    () => (subject ? computeAnimalShowSummary(subject, shows, careLogs) : null),
    [subject, shows, careLogs]
  );

  useEffect(() => {
    if (
      !showPrintModal ||
      !settings.includePhotoOnPedigree ||
      !subjectPrimaryPhoto ||
      subjectPrimaryPhoto.dataUrl ||
      !onLoadFullPhoto
    ) {
      if (!showPrintModal || (hydratedSubjectPhoto && hydratedSubjectPhoto.photoId !== subjectPrimaryPhoto?.id)) {
        setHydratedSubjectPhoto(null);
      }
      return;
    }
    if (hydratedSubjectPhoto?.photoId === subjectPrimaryPhoto.id) return;
    let cancelled = false;
    void onLoadFullPhoto(subjectPrimaryPhoto.id).then((resolved) => {
      if (!cancelled && resolved) {
        setHydratedSubjectPhoto({ photoId: subjectPrimaryPhoto.id, dataUrl: resolved });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    showPrintModal,
    settings.includePhotoOnPedigree,
    subjectPrimaryPhoto,
    onLoadFullPhoto,
    hydratedSubjectPhoto,
  ]);

  useEffect(() => {
    if (
      !showPrintModal ||
      !subject ||
      pedigreePrintOptions.layoutPreset !== 'family_portrait'
    ) {
      setFamilyPortraitPhotosByAnimalId((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    const animalById = new Map<string, Animal>();
    for (const a of lazyAncestorsById.values()) animalById.set(a.id, a);
    for (const a of allAnimals) animalById.set(a.id, a);

    const sire = subject.sireId ? animalById.get(subject.sireId) : undefined;
    const dam = subject.damId ? animalById.get(subject.damId) : undefined;
    const familyIds = [
      subject.id,
      sire?.id,
      dam?.id,
      sire?.sireId,
      sire?.damId,
      dam?.sireId,
      dam?.damId,
    ].filter((id): id is string => Boolean(id));

    const nextImmediate: Record<string, string> = {};
    const photoIdsToHydrate: Array<{ animalId: string; photoId: string }> = [];
    for (const animalId of familyIds) {
      const rec = primaryPhotoByAnimalId.get(animalId);
      if (!rec) continue;
      if (rec.dataUrl) {
        nextImmediate[animalId] = rec.dataUrl;
      } else {
        if (rec.thumbnailDataUrl) nextImmediate[animalId] = rec.thumbnailDataUrl;
        if (onLoadFullPhotosBatch) {
          photoIdsToHydrate.push({ animalId, photoId: rec.id });
        }
      }
    }
    setFamilyPortraitPhotosByAnimalId(nextImmediate);

    if (photoIdsToHydrate.length === 0 || !onLoadFullPhotosBatch) return;
    let cancelled = false;
    void onLoadFullPhotosBatch(photoIdsToHydrate.map((x) => x.photoId)).then((loadedMap) => {
      if (cancelled) return;
      setFamilyPortraitPhotosByAnimalId((prev) => {
        const merged = { ...prev };
        for (const item of photoIdsToHydrate) {
          if (loadedMap[item.photoId]) {
            merged[item.animalId] = loadedMap[item.photoId];
          }
        }
        return merged;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    showPrintModal,
    subject,
    pedigreePrintOptions.layoutPreset,
    lazyAncestorsById,
    allAnimals,
    primaryPhotoByAnimalId,
    onLoadFullPhotosBatch,
  ]);

  const [historyIds, setHistoryIds] = useState<string[]>(() =>
    selectedSubjectId ? [selectedSubjectId] : []
  );
  const internalNavIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!subject) {
      setHistoryIds([]);
      return;
    }
    if (internalNavIdRef.current === subject.id) {
      internalNavIdRef.current = null;
      return;
    }
    setHistoryIds([subject.id]);
  }, [subject?.id, speciesProfile.name]);

  const historyAnimals = useMemo(() => {
    const resolved = historyIds
      .map((id) => herdById.get(id))
      .filter((a): a is Animal => Boolean(a));
    if (subject && (resolved.length === 0 || resolved[resolved.length - 1].id !== subject.id)) {
      return [...resolved, subject];
    }
    return resolved;
  }, [historyIds, herdById, subject]);

  const handleSelectRootFromDropdown = (id: string) => {
    internalNavIdRef.current = id;
    setHistoryIds([id]);
    onSelectSubject(id);
    if (viewportRef.current) {
      viewportRef.current.scrollLeft = 0;
    }
  };

  const handleDrillToAnimal = (id: string) => {
    if (subject && id === subject.id) return;
    const base = historyIds.filter((entry) => herdById.has(entry));
    const currentTrail =
      subject && base[base.length - 1] !== subject.id ? [...base, subject.id] : base;
    const nextHistory =
      currentTrail.length > 0 && id === currentTrail[0] ? [id] : [...currentTrail, id];
    internalNavIdRef.current = id;
    setHistoryIds(nextHistory);
    onSelectSubject(id);
    if (viewportRef.current) {
      viewportRef.current.scrollLeft = 0;
    }
  };

  const handleJumpToHistoryIndex = (index: number) => {
    const validIds = historyAnimals.map((a) => a.id);
    if (index < 0 || index >= validIds.length) return;
    const nextHistory = validIds.slice(0, index + 1);
    const targetId = nextHistory[nextHistory.length - 1];
    setHistoryIds(nextHistory);
    if (targetId && targetId !== subject?.id) {
      internalNavIdRef.current = targetId;
      onSelectSubject(targetId);
      if (viewportRef.current) {
        viewportRef.current.scrollLeft = 0;
      }
    }
  };

  // Build an immediate 0..3 generation map so unexpanded Gen 4+ ancestors are never traversed eagerly
  const gen0To3BaseMap = useMemo(() => {
    if (!subject) return herdById;
    if (!onLoadPedigreeNeighborhood) return herdById;
    const map = new Map<string, Animal>();
    const frontier: string[] = [subject.id];
    const visited = new Set<string>();
    for (let depth = 0; depth <= 3 && frontier.length > 0; depth++) {
      const next: string[] = [];
      for (let i = 0; i < frontier.length; i++) {
        const id = frontier[i];
        if (!id || visited.has(id)) continue;
        visited.add(id);
        const rec = herdById.get(id) ?? lazyAncestorsById.get(id);
        if (!rec) continue;
        map.set(rec.id, rec);
        if (depth < 3) {
          if (rec.sireId && !visited.has(rec.sireId)) next.push(rec.sireId);
          if (rec.damId && !visited.has(rec.damId)) next.push(rec.damId);
        }
      }
      frontier.length = 0;
      for (let i = 0; i < next.length; i++) frontier.push(next[i]);
    }
    return map;
  }, [subject, herdById, lazyAncestorsById, onLoadPedigreeNeighborhood]);

  // Scoped pedigree lookup merges Gen 0..3 neighborhood with lazily fetched Gen 4+ / archived records
  const activePedigreeMap = useMemo(() => {
    if (!onLoadPedigreeNeighborhood) return herdById;
    if (lazyAncestorsById.size === 0) return gen0To3BaseMap;
    const merged = new Map<string, Animal>(gen0To3BaseMap);
    lazyAncestorsById.forEach((animal, id) => {
      merged.set(id, herdById.get(id) ?? animal);
    });
    return merged;
  }, [gen0To3BaseMap, lazyAncestorsById, herdById, onLoadPedigreeNeighborhood]);

  // Fetch immediate Gen 0..3 neighborhood & probe whether Gen-3 nodes have deeper SQLite/OPFS ancestors
  useEffect(() => {
    if (!subject) {
      setLazyAncestorsById(new Map());
      setExternalKnownGen4Branches(new Set());
      return;
    }
    let cancelled = false;

    const hydrateImmediateAndProbe = async () => {
      if (onLoadPedigreeNeighborhood) {
        try {
          const rows = await onLoadPedigreeNeighborhood([subject.id], 3);
          if (cancelled) return;
          setLazyAncestorsById((prev) => {
            const next = new Map(prev);
            for (const a of rows) {
              next.set(a.id, a);
            }
            return next;
          });
        } catch {
          // Safe fallback to gen0To3BaseMap
        }
      }

      if (generations >= 4 && onCheckPedigreeBranchesHaveAncestors) {
        const g3Slots = buildPedigreeSlots(subject, gen0To3BaseMap, 3, speciesProfile).filter(
          (sl) => sl.generation === 3 && sl.animal
        );
        const g3Ids = g3Slots.map((sl) => sl.animal!.id);
        if (g3Ids.length === 0) {
          if (!cancelled) setExternalKnownGen4Branches(new Set());
          return;
        }
        try {
          const existsMap = await onCheckPedigreeBranchesHaveAncestors(g3Ids);
          if (cancelled) return;
          const knownSet = new Set<number>();
          for (const sl of g3Slots) {
            if (sl.animal && existsMap[sl.animal.id]) {
              knownSet.add(sl.slotIndex);
            }
          }
          setExternalKnownGen4Branches(knownSet);
        } catch {
          if (!cancelled) setExternalKnownGen4Branches(new Set());
        }
      } else if (!cancelled) {
        setExternalKnownGen4Branches(new Set());
      }
    };

    void hydrateImmediateAndProbe();
    return () => {
      cancelled = true;
    };
  }, [
    subject?.id,
    generations,
    speciesProfile.name,
    animals.length,
    onLoadPedigreeNeighborhood,
    onCheckPedigreeBranchesHaveAncestors,
  ]);

  const slots = useMemo(() => {
    if (!subject) return [];
    return buildPedigreeSlots(subject, activePedigreeMap, generations, speciesProfile);
  }, [subject, activePedigreeMap, generations, speciesProfile]);

  useEffect(() => {
    setExpandedGen3Branches(new Set());
    setLazyAncestorsById(new Map());
    setLoadingGen3Branches(new Set());
  }, [subject?.id, generations, speciesProfile.name]);

  const branchViewport = useMemo(
    () =>
      buildPedigreeBranchViewport(
        slots,
        generations,
        expandedGen3Branches,
        externalKnownGen4Branches
      ),
    [slots, generations, expandedGen3Branches, externalKnownGen4Branches]
  );

  const treeAnalysis = useMemo(() => {
    if (!subject) return null;
    return analyzePedigreeTree(subject, slots, speciesProfile.name);
  }, [subject, slots, speciesProfile.name]);

  const isConvergenceDimmingActive = Boolean(
    dimUniqueAncestors && treeAnalysis?.hasConvergentAncestors
  );
  const isArbaFlagOverlayActive = Boolean(
    showRegistrationFlags && treeAnalysis?.isArbaSpecies
  );

  const { provenanceByAnimalId, hasVisibleGenotypes } = useMemo(() => {
    const map = new Map<string, AnimalAlleleProvenanceResult>();
    let anyGeno = false;
    for (const sl of branchViewport.visibleSlots) {
      const a = sl.animal;
      if (!a || map.has(a.id)) continue;
      const prov = analyzeAlleleProvenance(a, activePedigreeMap, animals, speciesProfile.name);
      map.set(a.id, prov);
      if (!prov.isCustomSpeciesFallback && prov.loci.length > 0) {
        anyGeno = true;
      }
    }
    return { provenanceByAnimalId: map, hasVisibleGenotypes: anyGeno };
  }, [branchViewport.visibleSlots, activePedigreeMap, animals, speciesProfile.name]);

  const fetchAndMergeBranchAncestors = useCallback(
    async (branchIndices: number[]) => {
      if (!subject || !onLoadPedigreeNeighborhood || generations < 4 || branchIndices.length === 0) {
        return;
      }
      const targetRoots: string[] = [];
      for (const bIdx of branchIndices) {
        const g3Slot = slots.find((sl) => sl.generation === 3 && sl.slotIndex === bIdx);
        if (g3Slot?.animal?.id) {
          targetRoots.push(g3Slot.animal.id);
        }
      }
      if (targetRoots.length === 0) return;
      setLoadingGen3Branches((prev) => {
        const next = new Set(prev);
        for (const b of branchIndices) next.add(b);
        return next;
      });
      try {
        const fetched = await onLoadPedigreeNeighborhood(
          targetRoots,
          Math.max(1, generations - 3)
        );
        setLazyAncestorsById((prev) => {
          const next = new Map(prev);
          for (const a of fetched) next.set(a.id, a);
          return next;
        });
      } finally {
        setLoadingGen3Branches((prev) => {
          const next = new Set(prev);
          for (const b of branchIndices) next.delete(b);
          return next;
        });
      }
    },
    [subject, onLoadPedigreeNeighborhood, generations, slots]
  );

  const toggleGen3Branch = useCallback(
    (branchIndex: number) => {
      const willExpand = !expandedGen3Branches.has(branchIndex);
      setExpandedGen3Branches((prev) => {
        const next = new Set(prev);
        if (next.has(branchIndex)) {
          next.delete(branchIndex);
        } else {
          next.add(branchIndex);
        }
        return next;
      });
      if (willExpand) {
        void fetchAndMergeBranchAncestors([branchIndex]);
      }
    },
    [expandedGen3Branches, fetchAndMergeBranchAncestors]
  );

  const branchesWithKnownGen4 = useMemo(() => {
    if (generations < 4) return [];
    const combined = new Set<number>(getGen3BranchesWithKnownAncestors(slots));
    externalKnownGen4Branches.forEach((b) => combined.add(b));
    return Array.from(combined).sort((a, b) => a - b);
  }, [slots, generations, externalKnownGen4Branches]);

  const handleExpandBranchesBatch = useCallback(
    (branchIndices: number[]) => {
      setExpandedGen3Branches(new Set(branchIndices));
      void fetchAndMergeBranchAncestors(branchIndices);
    },
    [fetchAndMergeBranchAncestors]
  );

  const handleOpenPrintModal = useCallback(
    async (docMode: 'formal_certificate' | 'shareable_card' = 'formal_certificate') => {
      if (!subject) return;
      setPedigreeDocMode(docMode);
      if (onLoadPedigreeNeighborhood && generations >= 4) {
        setPrintHydrating(true);
        try {
          const fullRows = await onLoadPedigreeNeighborhood([subject.id], generations);
          setLazyAncestorsById((prev) => {
            const next = new Map(prev);
            for (const a of fullRows) next.set(a.id, a);
            return next;
          });
        } finally {
          setPrintHydrating(false);
        }
      }
      setShowPrintModal(true);
    },
    [subject, onLoadPedigreeNeighborhood, generations]
  );

  const coi = subject ? coiByAnimalId.get(subject.id) : null;

  const offspring = useMemo(
    () =>
      subject ? animals.filter((a) => a.sireId === subject.id || a.damId === subject.id) : [],
    [animals, subject]
  );

  // Strictly species-isolated and sex-matching candidate parents when filling an empty slot
  const allSafeLinkCandidates = useMemo(() => {
    if (!linkingSlot || !linkingSlot.childAnimalId) return [];
    const childId = linkingSlot.childAnimalId;
    const wantMale = linkingSlot.expectedSex === 'Male';
    return animals.filter((c) => {
      const sexOk = wantMale ? c.sex === 'Male' : c.sex === 'Female';
      return sexOk && c.id !== childId && !wouldCreateCycle(childId, c.id, herdById);
    });
  }, [linkingSlot, animals, herdById]);

  const archivedLinkCount = useMemo(
    () => allSafeLinkCandidates.filter((c) => isAnimalArchived(c)).length,
    [allSafeLinkCandidates]
  );

  const visibleLinkCandidates = useMemo(() => {
    const base = includeArchivedInLink
      ? allSafeLinkCandidates
      : allSafeLinkCandidates.filter((c) => !isAnimalArchived(c));
    if (!includeArchivedInLink) return base;
    const q = linkSearchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((c) =>
      [c.name, c.tattoo, c.breed, c.variety, c.registrationNumber]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [allSafeLinkCandidates, includeArchivedInLink, linkSearchQuery]);

  const applyVisualZoomFrame = useCallback(
    (nextZoomRaw: number, scrollLeft: number, scrollTop: number) => {
      const nextZoom = clampTreeZoom(nextZoomRaw);
      zoomRef.current = nextZoom;

      const dims = canvasDimsRef.current;
      if (sizerRef.current) {
        sizerRef.current.style.width = `${dims.width * nextZoom}px`;
        sizerRef.current.style.height = `${dims.height * nextZoom}px`;
      }
      if (stageRef.current) {
        stageRef.current.style.transform = `scale(${nextZoom})`;
      }
      if (viewportRef.current) {
        viewportRef.current.scrollLeft = Math.max(0, scrollLeft);
        viewportRef.current.scrollTop = Math.max(0, scrollTop);
      }
      if (zoomLabelRef.current) {
        zoomLabelRef.current.textContent = `${Math.round(nextZoom * 100)}%`;
      }
      return nextZoom;
    },
    []
  );

  const commitZoomToReact = useCallback(() => {
    setZoom(Math.round(zoomRef.current * 1000) / 1000);
  }, []);

  const applyZoomCentered = useCallback(
    (nextZoomRaw: number, clientX?: number, clientY?: number, deferReactSync = false) => {
      const viewport = viewportRef.current;
      const prevZoom = zoomRef.current;
      const nextZoom = clampTreeZoom(nextZoomRaw);
      if (Math.abs(nextZoom - prevZoom) < 0.0005) return;

      if (!viewport) {
        zoomRef.current = nextZoom;
        setZoom(nextZoom);
        return;
      }

      const vpRect = viewport.getBoundingClientRect();
      const sizerRect = sizerRef.current?.getBoundingClientRect();
      const originLeft = sizerRect ? sizerRect.left - vpRect.left + viewport.scrollLeft : 12;
      const originTop = sizerRect ? sizerRect.top - vpRect.top + viewport.scrollTop : 12;

      const focalVpX = clientX !== undefined ? clientX - vpRect.left : viewport.clientWidth / 2;
      const focalVpY = clientY !== undefined ? clientY - vpRect.top : viewport.clientHeight / 2;

      const contentX = (viewport.scrollLeft + focalVpX - originLeft) / prevZoom;
      const contentY = (viewport.scrollTop + focalVpY - originTop) / prevZoom;

      const targetScrollLeft = originLeft + contentX * nextZoom - focalVpX;
      const targetScrollTop = originTop + contentY * nextZoom - focalVpY;

      applyVisualZoomFrame(nextZoom, targetScrollLeft, targetScrollTop);

      if (deferReactSync) {
        if (wheelSyncTimerRef.current !== null) {
          window.clearTimeout(wheelSyncTimerRef.current);
        }
        wheelSyncTimerRef.current = window.setTimeout(() => {
          wheelSyncTimerRef.current = null;
          commitZoomToReact();
        }, 120);
      } else {
        commitZoomToReact();
      }
    },
    [applyVisualZoomFrame, commitZoomToReact]
  );

  const hasSubject = Boolean(subject);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !hasSubject) return;

    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let pinchOriginLeft = 12;
    let pinchOriginTop = 12;
    let pinchContentX = 0;
    let pinchContentY = 0;
    let isPinching = false;
    let pendingPinchFrame: number | null = null;
    let latestTouchMetrics: { dist: number; midClientX: number; midClientY: number } | null = null;

    const getTouchMetrics = (touches: TouchList) => {
      const t0 = touches[0];
      const t1 = touches[1];
      return {
        dist: Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY),
        midClientX: (t0.clientX + t1.clientX) / 2,
        midClientY: (t0.clientY + t1.clientY) / 2,
      };
    };

    const flushPinchFrame = () => {
      pendingPinchFrame = null;
      if (!isPinching || !latestTouchMetrics || pinchStartDist <= 0) return;

      const { dist, midClientX, midClientY } = latestTouchMetrics;
      const vpRect = viewport.getBoundingClientRect();
      const midVpX = midClientX - vpRect.left;
      const midVpY = midClientY - vpRect.top;

      const nextZoom = clampTreeZoom(pinchStartZoom * (dist / pinchStartDist));
      const targetScrollLeft = pinchOriginLeft + pinchContentX * nextZoom - midVpX;
      const targetScrollTop = pinchOriginTop + pinchContentY * nextZoom - midVpY;

      applyVisualZoomFrame(nextZoom, targetScrollLeft, targetScrollTop);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        if (e.cancelable) e.preventDefault();
        const metrics = getTouchMetrics(e.touches);
        if (metrics.dist <= 4) return;

        const vpRect = viewport.getBoundingClientRect();
        const sizerRect = sizerRef.current?.getBoundingClientRect();
        pinchOriginLeft = sizerRect ? sizerRect.left - vpRect.left + viewport.scrollLeft : 12;
        pinchOriginTop = sizerRect ? sizerRect.top - vpRect.top + viewport.scrollTop : 12;

        isPinching = true;
        pinchStartDist = metrics.dist;
        pinchStartZoom = zoomRef.current;

        const midVpX = metrics.midClientX - vpRect.left;
        const midVpY = metrics.midClientY - vpRect.top;
        pinchContentX = (viewport.scrollLeft + midVpX - pinchOriginLeft) / pinchStartZoom;
        pinchContentY = (viewport.scrollTop + midVpY - pinchOriginTop) / pinchStartZoom;
        latestTouchMetrics = metrics;

        if (stageRef.current) {
          stageRef.current.style.willChange = 'transform';
        }
      } else {
        isPinching = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isPinching || e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      latestTouchMetrics = getTouchMetrics(e.touches);
      if (pendingPinchFrame === null) {
        pendingPinchFrame = window.requestAnimationFrame(flushPinchFrame);
      }
    };

    const finishPinch = (e: TouchEvent) => {
      if (e.touches.length < 2 && isPinching) {
        if (pendingPinchFrame !== null) {
          window.cancelAnimationFrame(pendingPinchFrame);
          flushPinchFrame();
        }
        isPinching = false;
        latestTouchMetrics = null;
        if (stageRef.current) {
          stageRef.current.style.willChange = 'auto';
        }
        commitZoomToReact();
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const clampedDelta = Math.max(-60, Math.min(60, e.deltaY));
      const scaleFactor = Math.exp(-clampedDelta * 0.008);
      applyZoomCentered(zoomRef.current * scaleFactor, e.clientX, e.clientY, true);
    };

    viewport.addEventListener('touchstart', onTouchStart, { passive: false });
    viewport.addEventListener('touchmove', onTouchMove, { passive: false });
    viewport.addEventListener('touchend', finishPinch, { passive: true });
    viewport.addEventListener('touchcancel', finishPinch, { passive: true });
    viewport.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      if (pendingPinchFrame !== null) {
        window.cancelAnimationFrame(pendingPinchFrame);
      }
      viewport.removeEventListener('touchstart', onTouchStart);
      viewport.removeEventListener('touchmove', onTouchMove);
      viewport.removeEventListener('touchend', finishPinch);
      viewport.removeEventListener('touchcancel', finishPinch);
      viewport.removeEventListener('wheel', onWheel);
    };
  }, [hasSubject, applyVisualZoomFrame, applyZoomCentered, commitZoomToReact]);

  const prevSubjectIdRef = useRef<string | null>(subject?.id ?? null);
  useEffect(() => {
    const nextId = subject?.id ?? null;
    if (prevSubjectIdRef.current !== nextId) {
      prevSubjectIdRef.current = nextId;
      applyVisualZoomFrame(1, 0, 0);
      setZoom(1);
    }
  }, [subject?.id, applyVisualZoomFrame]);

  const handleFitTreeWidth = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const availableWidth = Math.max(240, viewport.clientWidth - 24);
    const fit = clampTreeZoom(Math.min(1, availableWidth / canvasDimsRef.current.width));
    applyVisualZoomFrame(fit, 0, 0);
    setZoom(Math.round(fit * 1000) / 1000);
  };

  // Dynamic card dimensions across 3 through 8 generations (memoized before early return)
  const layoutConfig = useMemo(
    () =>
      generations >= 7
        ? { colWidth: 158, cardWidth: 138, cardHeight: 38, rowPitch: 44, compact: true }
        : generations === 6
        ? { colWidth: 174, cardWidth: 150, cardHeight: 44, rowPitch: 50, compact: true }
        : generations === 5
        ? { colWidth: 198, cardWidth: 170, cardHeight: 56, rowPitch: 64, compact: true }
        : generations === 4
        ? {
            colWidth: 235,
            cardWidth: 198,
            cardHeight: isArbaFlagOverlayActive ? 88 : 78,
            rowPitch: isArbaFlagOverlayActive ? 98 : 88,
            compact: false,
          }
        : {
            colWidth: 265,
            cardWidth: 222,
            cardHeight: isArbaFlagOverlayActive ? 104 : 90,
            rowPitch: isArbaFlagOverlayActive ? 118 : 108,
            compact: false,
          },
    [generations, isArbaFlagOverlayActive]
  );

  const { colWidth, cardWidth, cardHeight, rowPitch, compact } = layoutConfig;
  const branchToggleGutter = generations >= 4 ? 78 : 0;
  const hasAnyExpandedGen4 = generations >= 4 && expandedGen3Branches.size > 0;

  const { nodeCoords, connectorPaths, canvasWidth, canvasHeight } = useMemo(() => {
    const coords = new Map<string, { x: number; y: number; slot: PedigreeSlot }>();
    const paths: Array<{ d: string; isSire: boolean; isKnown: boolean; targetIsUnique: boolean }> = [];
    if (branchViewport.visibleSlots.length === 0) {
      return {
        nodeCoords: coords,
        connectorPaths: paths,
        canvasWidth: 960,
        canvasHeight: 640,
      };
    }

    const slotByKey = new Map<string, PedigreeSlot>();
    for (const sl of branchViewport.visibleSlots) {
      slotByKey.set(`${sl.generation}:${sl.slotIndex}`, sl);
    }

    let computedHeight: number;
    let computedWidth: number;

    if (generations <= 3) {
      const leafCount = 1 << generations;
      computedHeight = Math.max(460, leafCount * rowPitch + 40);
      computedWidth = (generations + 1) * colWidth + 24;

      for (const sl of branchViewport.visibleSlots) {
        const slotsInGen = 1 << sl.generation;
        const x = 16 + sl.generation * colWidth;
        const bandHeight = (computedHeight - 32) / slotsInGen;
        const y = 16 + bandHeight * (sl.slotIndex + 0.5) - cardHeight / 2;
        coords.set(`${sl.generation}:${sl.slotIndex}`, { x, y, slot: sl });
      }
    } else {
      computedWidth = hasAnyExpandedGen4
        ? (generations + 1) * colWidth + branchToggleGutter + 24
        : 4 * colWidth + branchToggleGutter + 32;

      const xForGen = (gen: number) =>
        16 + gen * colWidth + (gen >= 4 ? branchToggleGutter : 0);

      let yCursor = 16;
      const gen3CenterY = new Array<number>(8);
      const subLeafCountPerBranch = 1 << (generations - 3);
      const collapsedBranchBandHeight = Math.max(cardHeight + 18, 68);

      for (let b = 0; b < 8; b++) {
        if (expandedGen3Branches.has(b)) {
          const bandHeight = Math.max(cardHeight + 18, subLeafCountPerBranch * rowPitch);
          for (let g = 4; g <= generations; g++) {
            const slotsPerBranchAtG = 1 << (g - 3);
            const slotBand = bandHeight / slotsPerBranchAtG;
            const baseIdx = b * slotsPerBranchAtG;
            for (let k = 0; k < slotsPerBranchAtG; k++) {
              const slotIdx = baseIdx + k;
              const sl = slotByKey.get(`${g}:${slotIdx}`);
              if (!sl) continue;
              const y = yCursor + slotBand * (k + 0.5) - cardHeight / 2;
              coords.set(`${g}:${slotIdx}`, { x: xForGen(g), y, slot: sl });
            }
          }
          gen3CenterY[b] = yCursor + bandHeight / 2;
          yCursor += bandHeight;
        } else {
          gen3CenterY[b] = yCursor + collapsedBranchBandHeight / 2;
          yCursor += collapsedBranchBandHeight;
        }

        const g3Slot = slotByKey.get(`3:${b}`);
        if (g3Slot) {
          coords.set(`3:${b}`, {
            x: xForGen(3),
            y: gen3CenterY[b] - cardHeight / 2,
            slot: g3Slot,
          });
        }
      }

      const gen2CenterY = new Array<number>(4);
      for (let i = 0; i < 4; i++) {
        gen2CenterY[i] = (gen3CenterY[i * 2] + gen3CenterY[i * 2 + 1]) / 2;
        const sl = slotByKey.get(`2:${i}`);
        if (sl) {
          coords.set(`2:${i}`, {
            x: xForGen(2),
            y: gen2CenterY[i] - cardHeight / 2,
            slot: sl,
          });
        }
      }

      const gen1CenterY = new Array<number>(2);
      for (let i = 0; i < 2; i++) {
        gen1CenterY[i] = (gen2CenterY[i * 2] + gen2CenterY[i * 2 + 1]) / 2;
        const sl = slotByKey.get(`1:${i}`);
        if (sl) {
          coords.set(`1:${i}`, {
            x: xForGen(1),
            y: gen1CenterY[i] - cardHeight / 2,
            slot: sl,
          });
        }
      }

      const rootCenterY = (gen1CenterY[0] + gen1CenterY[1]) / 2;
      const rootSlot = slotByKey.get('0:0');
      if (rootSlot) {
        coords.set('0:0', {
          x: xForGen(0),
          y: rootCenterY - cardHeight / 2,
          slot: rootSlot,
        });
      }

      computedHeight = Math.max(460, yCursor + 24);
    }

    for (let g = 0; g < generations; g++) {
      const count = 1 << g;
      for (let idx = 0; idx < count; idx++) {
        const parentBox = coords.get(`${g}:${idx}`);
        const sireBox = coords.get(`${g + 1}:${idx * 2}`);
        const damBox = coords.get(`${g + 1}:${idx * 2 + 1}`);
        if (!parentBox || !sireBox || !damBox) continue;

        const x1 = parentBox.x + cardWidth;
        const y1 = parentBox.y + cardHeight / 2;

        for (const [target, isSire] of [
          [sireBox, true],
          [damBox, false],
        ] as const) {
          const x2 = target.x;
          const y2 = target.y + cardHeight / 2;
          const cx = (x1 + x2) / 2;
          paths.push({
            d: `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`,
            isSire,
            isKnown: Boolean(target.slot.animal),
            targetIsUnique:
              target.slot.generation >= 1 &&
              Boolean(target.slot.animal) &&
              target.slot.occurrenceCount <= 1,
          });
        }
      }
    }

    return {
      nodeCoords: coords,
      connectorPaths: paths,
      canvasWidth: computedWidth,
      canvasHeight: computedHeight,
    };
  }, [
    branchViewport.visibleSlots,
    expandedGen3Branches,
    hasAnyExpandedGen4,
    branchToggleGutter,
    colWidth,
    cardWidth,
    cardHeight,
    rowPitch,
    generations,
  ]);

  canvasDimsRef.current = { width: canvasWidth, height: canvasHeight };

  useEffect(() => {
    zoomRef.current = zoom;
    if (sizerRef.current) {
      sizerRef.current.style.width = `${canvasWidth * zoom}px`;
      sizerRef.current.style.height = `${canvasHeight * zoom}px`;
    }
    if (stageRef.current) {
      stageRef.current.style.transform = `scale(${zoom})`;
    }
    if (zoomLabelRef.current) {
      zoomLabelRef.current.textContent = `${Math.round(zoom * 100)}%`;
    }
  }, [zoom, generations, canvasWidth, canvasHeight]);

  const handleViewportKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const vp = viewportRef.current;
    if (!vp) return;
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) {
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const panStep = 64;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      vp.scrollLeft += panStep;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      vp.scrollLeft = Math.max(0, vp.scrollLeft - panStep);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      vp.scrollTop += panStep;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      vp.scrollTop = Math.max(0, vp.scrollTop - panStep);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      applyZoomCentered(zoomRef.current + 0.15);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      applyZoomCentered(zoomRef.current - 0.15);
    } else if (e.key === '0') {
      e.preventDefault();
      applyZoomCentered(1);
    }
  };

  if (!subject) {
    return (
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-8 text-center text-sm text-[var(--barn-muted)]">
        Add a {speciesProfile.name.toLowerCase()} in the Herd tab to explore multi-generation
        pedigree charts.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pedigree Controls Toolbar */}
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="sr-only" htmlFor="pedigree-subject-select">
                Select {speciesProfile.name} Subject
              </label>
              <select
                id="pedigree-subject-select"
                value={subject.id}
                onChange={(e) => handleSelectRootFromDropdown(e.target.value)}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-medium"
              >
                {animals.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.tattoo || 'No ID'}) — {formatSexForSpecies(a.sex, speciesProfile)}
                    {isAnimalArchived(a) ? ' [Archived]' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              {(() => {
                const comp = coi ? getPedigreeCompletenessSummary(coi) : null;
                return (
                  <>
                    <div className="text-xs font-mono tabular-nums text-[var(--barn-muted)]">
                      Wright COI:{' '}
                      <strong className="text-[var(--barn-ink)]">
                        {(coi?.coiPercent ?? 0).toFixed(2)}%
                      </strong>{' '}
                      ({coi?.risk.label || 'Outcross'}) · Known 3-Gen: {coi?.knownAncestorsIn3Gen ?? 0}/14
                      {comp ? ` (${comp.percent3Gen}%)` : ''}
                    </div>
                    {comp?.isIncompleteZeroOutcross && (
                      <div className="text-[11px] text-[var(--barn-muted)]">
                        Incomplete pedigree ({comp.known3Gen}/{comp.max3Gen} 3-gen ancestors recorded) — 0.00% reflects missing ancestry.
                      </div>
                    )}
                    {(() => {
                      const subjCarriers = formatCompactCarrierDisclosure(subject, {
                        herdById,
                        includeLineage: true,
                        includeCleared: true,
                      });
                      if (!subjCarriers && !subject.rufusLevel) return null;
                      return (
                        <div className="text-[11px] font-medium text-[var(--barn-terracotta)]">
                          {subject.rufusLevel ? `Rufus: ${subject.rufusLevel}` : ''}
                          {subject.rufusLevel && subjCarriers ? ' · ' : ''}
                          {subjCarriers ? `Carrier Disclosures: ${subjCarriers}` : ''}
                        </div>
                      );
                    })()}
                    {subjectShowSummary &&
                      (subjectShowSummary.effectiveLegs > 0 ||
                        subjectShowSummary.showsEntered > 0 ||
                        Boolean(subjectShowSummary.awardsSummaryText) ||
                        subjectShowSummary.totalPoints > 0 ||
                        subjectShowSummary.eLegAttachments.length > 0) && (
                        <div className="text-[11px] font-mono text-[var(--barn-sage)] font-medium">
                          Show Honors: {subjectShowSummary.gcProgress.shortLabel}
                          {subjectShowSummary.awardsSummaryText
                            ? ` · ${subjectShowSummary.awardsSummaryText}`
                            : ''}
                          {subjectShowSummary.totalPoints > 0
                            ? ` · ${subjectShowSummary.totalPoints} pts`
                            : ''}
                          {subjectShowSummary.eLegAttachments.length > 0
                            ? ` · ${subjectShowSummary.eLegAttachments.length} E-Leg${
                                subjectShowSummary.eLegAttachments.length === 1 ? '' : 's'
                              }`
                            : ''}
                        </div>
                      )}
                  </>
                );
              })()}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center p-0.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              {([3, 4, 5, 6, 7, 8] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={generations === g}
                  onClick={() => onChangeGenerations(g)}
                  className={`min-h-[34px] px-2.5 sm:px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
                    generations === g
                      ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                      : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  {g} Gen
                </button>
              ))}
            </div>

            {generations >= 5 && (
              <button
                type="button"
                onClick={() => onChangeGenerations(3)}
                title="Switch back to compact 3-generation view to reduce mobile memory load"
                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium text-[var(--barn-muted)] whitespace-nowrap"
              >
                Use 3-Gen (Lighter)
              </button>
            )}

            <button
              type="button"
              disabled={printHydrating}
              aria-busy={printHydrating}
              onClick={() => void handleOpenPrintModal('formal_certificate')}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-65"
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              {printHydrating ? 'Loading Ancestors...' : 'Export .HTM / Print PDF'}
            </button>
            <button
              type="button"
              disabled={printHydrating}
              onClick={() => void handleOpenPrintModal('shareable_card')}
              title="Open lightweight mobile-ready standalone .HTML pedigree card for easy sharing"
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-65"
            >
              <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
              Share Card
            </button>
            <PedigreePrintNotice compact />
            <ColorGeneticsNotice compact />
          </div>
        </div>

        {generations >= 7 && (
          <div className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] px-3 py-2 text-[11px] text-[var(--barn-muted)]">
            <strong className="text-[var(--barn-ink)]">On-Demand {generations}-Gen Mode:</strong>{' '}
            Gen 4–{generations} branches expand lazily inside the tree to keep mobile memory light.
            Download .PDF builds a legible multi-page US Letter chart ({generations === 7 ? '2 sheets: Sire & Dam lines' : '4 sheets: one per Grandparent quadrant'}).
          </div>
        )}

        {/* Pedigree Subject / Tree Conflict Alert or Retained Soft Warning */}
        {(() => {
          const subjectConflict = conflictsByAnimalId.get(subject.id);
          const treeUniqueConflicts = Array.from(
            new Map(
              slots
                .map((sl) => sl.animal)
                .filter((an): an is Animal => Boolean(an))
                .map((an) => [an.id, conflictsByAnimalId.get(an.id)] as const)
                .filter(([, sum]) => Boolean(sum?.hasAnyConflict))
            ).entries()
          );

          if (!subjectConflict?.hasAnyConflict && treeUniqueConflicts.length === 0) {
            return null;
          }

          const hasUrgent =
            Boolean(subjectConflict?.hasActiveConflict) ||
            treeUniqueConflicts.some(([, sum]) => Boolean(sum?.hasActiveConflict));

          return (
            <div
              role={hasUrgent ? 'alert' : 'status'}
              className={`rounded-xl border px-3.5 py-2.5 text-xs flex flex-wrap items-start justify-between gap-2.5 ${
                hasUrgent
                  ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)] text-[var(--barn-ink)]'
                  : 'bg-[var(--barn-canvas)] border-[var(--barn-terracotta)]/55 text-[var(--barn-ink)]'
              }`}
            >
              <div className="flex items-start gap-2 min-w-0 flex-1">
                {hasUrgent ? (
                  <ShieldAlert
                    className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                ) : (
                  <AlertTriangle
                    className="w-4 h-4 text-[var(--barn-terracotta)]/85 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                )}
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold">
                    {subjectConflict?.hasActiveConflict
                      ? `Pedigree Conflict Alert for ${subject.name}`
                      : subjectConflict?.isIgnoredWithSoftWarning
                      ? `Soft Warning (Conflict Ignored) — ${subject.name}`
                      : `Pedigree Tree Notices (${treeUniqueConflicts.length} conflicted ancestor${treeUniqueConflicts.length === 1 ? '' : 's'})`}
                  </div>
                  {subjectConflict?.hasAnyConflict ? (
                    <div className="text-[11px] text-[var(--barn-muted)]">
                      {subjectConflict.headlineReasons.join(' · ')}
                      {subjectConflict.isIgnoredWithSoftWarning
                        ? ' (Alert ignored; soft warning stays visible until resolved.)'
                        : ''}
                    </div>
                  ) : (
                    <div className="text-[11px] text-[var(--barn-muted)]">
                      Highlighted cards in this chart have duplicate IDs/tattoos or parent sex mismatches.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 max-w-full">
                <button
                  type="button"
                  onClick={() => onOpenAnimalInHerd(subject.id)}
                  className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)]"
                >
                  Open Profile in Herd
                </button>
                {subjectConflict?.hasActiveConflict && onIgnoreConflicts && (
                  <button
                    type="button"
                    onClick={() => onIgnoreConflicts(subject.id, subjectConflict.activeKinds)}
                    className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)]"
                  >
                    Ignore Conflict
                  </button>
                )}
                {subjectConflict?.isIgnoredWithSoftWarning && onRestoreConflictAlert && (
                  <button
                    type="button"
                    onClick={() => onRestoreConflictAlert(subject.id)}
                    className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" aria-hidden="true" />
                    Re-enable Alert
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* ARBA Registration Readiness Summary Banner */}
        {isArbaFlagOverlayActive && treeAnalysis && treeAnalysis.blockingNodeCount > 0 && (
          <div
            role="status"
            className="rounded-xl border border-[var(--barn-danger)]/75 bg-[var(--barn-danger)]/8 px-3.5 py-2.5 text-xs flex flex-wrap items-start justify-between gap-2.5"
          >
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <AlertTriangle
                className="w-4 h-4 text-[var(--barn-danger)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="space-y-0.5 min-w-0">
                <div className="font-semibold text-[var(--barn-ink)]">
                  ARBA Registration Blockers Detected ({treeAnalysis.blockingNodeCount} 3-gen{' '}
                  {treeAnalysis.blockingNodeCount === 1 ? 'node' : 'nodes'})
                </div>
                {treeAnalysis.subjectRegistration?.isBlocking && (
                  <div className="text-[11px] text-[var(--barn-danger)] font-medium">
                    Subject ({subject.name}):{' '}
                    {treeAnalysis.subjectRegistration.deficiencies.map((d) => d.label).join(' · ')}
                  </div>
                )}
                <div className="text-[11px] text-[var(--barn-muted)]">
                  {treeAnalysis.blockingAnimalNodeCount >
                  (treeAnalysis.subjectRegistration?.isBlocking ? 1 : 0)
                    ? `${
                        treeAnalysis.blockingAnimalNodeCount -
                        (treeAnalysis.subjectRegistration?.isBlocking ? 1 : 0)
                      } recorded 3-gen ancestor${
                        treeAnalysis.blockingAnimalNodeCount -
                          (treeAnalysis.subjectRegistration?.isBlocking ? 1 : 0) ===
                        1
                          ? ''
                          : 's'
                      } missing required ARBA fields`
                    : ''}
                  {treeAnalysis.blockingAnimalNodeCount >
                    (treeAnalysis.subjectRegistration?.isBlocking ? 1 : 0) &&
                  treeAnalysis.missingAncestorSlotCount > 0
                    ? ' · '
                    : ''}
                  {treeAnalysis.missingAncestorSlotCount > 0
                    ? `${treeAnalysis.missingAncestorSlotCount} missing Gen 1–3 ancestor slot${
                        treeAnalysis.missingAncestorSlotCount === 1 ? '' : 's'
                      } highlighted in red below`
                    : ''}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenAnimalInHerd(subject.id)}
              className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-danger)]/60 bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] shrink-0"
            >
              Edit Subject Fields
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--barn-muted)] border-t border-[var(--barn-border)] pt-2.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              Pinch with two fingers to zoom (20%–200%), drag to pan, and swipe edges to scroll page
            </span>
            {hasVisibleGenotypes && <AlleleProvenanceLegend compact />}
          </div>
          {subjectPrimaryPhoto && (
            <label className="inline-flex items-center gap-2 cursor-pointer text-[var(--barn-ink)] font-medium">
              <input
                type="checkbox"
                checked={Boolean(settings.includePhotoOnPedigree)}
                onChange={(e) => onToggleIncludePhotoOnPedigree(e.target.checked)}
              />
              <span>Include primary photo on .HTM / PDF export</span>
            </label>
          )}
        </div>
      </div>

      {/* Scrollable Pinch-to-Zoom & Pan Bezier Pedigree Canvas */}
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl overflow-hidden">
        <div className="px-3 sm:px-4 py-2 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/55 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-[var(--barn-muted)] truncate">
              {subject.name} · {generations}-Gen
            </span>
            {generations >= 4 && (
              <>
                <span className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                  ({branchViewport.visibleSlotsCount}/{branchViewport.totalSlotsCount} cards rendered
                  {branchViewport.hiddenKnownAncestorsCount > 0
                    ? ` · ${branchViewport.hiddenKnownAncestorsCount} hidden known`
                    : ''}
                  )
                </span>
                {branchesWithKnownGen4.length > 0 && expandedGen3Branches.size < branchesWithKnownGen4.length && (
                  <button
                    type="button"
                    onClick={() => handleExpandBranchesBatch(branchesWithKnownGen4)}
                    className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-sage)]/55 bg-[var(--barn-sage-tint)] text-[11px] font-semibold text-[var(--barn-ink)] hover:opacity-90 whitespace-nowrap"
                  >
                    Expand Known Gen 4+ ({branchesWithKnownGen4.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (expandedGen3Branches.size === 8) {
                      setExpandedGen3Branches(new Set());
                    } else {
                      handleExpandBranchesBatch([0, 1, 2, 3, 4, 5, 6, 7]);
                    }
                  }}
                  className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium whitespace-nowrap"
                >
                  {expandedGen3Branches.size === 8 ? 'Collapse Gen 4+' : 'Expand All Gen 4+'}
                </button>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              aria-pressed={dimUniqueAncestors}
              onClick={() => setDimUniqueAncestors((v) => !v)}
              title={
                treeAnalysis?.hasConvergentAncestors
                  ? 'Gray out unique (non-convergent) ancestors to spotlight repeated linebred ancestors'
                  : 'No repeated linebred ancestors in this chart (will automatically dim unique ancestors when convergence exists)'
              }
              className={`min-h-[34px] px-2.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors ${
                isConvergenceDimmingActive
                  ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)] text-[var(--barn-ink)] font-semibold'
                  : 'border-[var(--barn-border)] bg-[var(--barn-surface)] text-[var(--barn-muted)] hover:bg-[var(--barn-subtle)]'
              }`}
            >
              {treeAnalysis?.hasConvergentAncestors
                ? `Dim Unique (${treeAnalysis.convergentAnimalIds.size} conv.)`
                : 'Dim Unique'}
            </button>

            {treeAnalysis?.isArbaSpecies && (
              <button
                type="button"
                aria-pressed={showRegistrationFlags}
                onClick={() => setShowRegistrationFlags((v) => !v)}
                title="Highlight Gen 0–3 nodes in red when missing ARBA registration fields (tattoo, breed, variety, weight, DOB, or 3-gen lineage)"
                className={`min-h-[34px] px-2.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors ${
                  showRegistrationFlags
                    ? treeAnalysis.blockingNodeCount > 0
                      ? 'bg-[var(--barn-danger)]/12 border-[var(--barn-danger)] text-[var(--barn-danger)] font-semibold'
                      : 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)] text-[var(--barn-ink)] font-semibold'
                    : 'border-[var(--barn-border)] bg-[var(--barn-surface)] text-[var(--barn-muted)] hover:bg-[var(--barn-subtle)]'
                }`}
              >
                ARBA Reg{showRegistrationFlags && treeAnalysis.blockingNodeCount > 0 ? ` (${treeAnalysis.blockingNodeCount})` : ''}
              </button>
            )}

            <button
              type="button"
              onClick={handleFitTreeWidth}
              className="min-h-[34px] px-2.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium"
            >
              Fit
            </button>
            <button
              type="button"
              onClick={() => applyZoomCentered(zoomRef.current - 0.15)}
              aria-label="Zoom out pedigree"
              className="min-h-[34px] min-w-[34px] rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              ref={zoomLabelRef}
              onClick={() => applyZoomCentered(1)}
              title="Reset zoom to 100%"
              className="min-h-[34px] px-2 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-mono tabular-nums hover:bg-[var(--barn-subtle)]"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => applyZoomCentered(zoomRef.current + 0.15)}
              aria-label="Zoom in pedigree"
              className="min-h-[34px] min-w-[34px] rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          ref={viewportRef}
          tabIndex={0}
          role="region"
          aria-label={`${subject.name} ${generations}-generation pedigree chart (use arrow keys to pan, +/- to zoom, 0 to reset)`}
          onKeyDown={handleViewportKeyDown}
          style={{
            touchAction: 'pan-x pan-y',
            overscrollBehavior: 'auto',
            overflowAnchor: 'none',
          }}
          className="h-[56dvh] min-h-[300px] sm:h-[66vh] sm:min-h-[420px] overflow-auto p-3 sm:p-4"
        >
          <div
            ref={sizerRef}
            style={{
              width: `${canvasWidth * zoom}px`,
              height: `${canvasHeight * zoom}px`,
            }}
            className="relative"
          >
            <div
              ref={stageRef}
              style={{
                width: `${canvasWidth}px`,
                height: `${canvasHeight}px`,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
              }}
              className="relative"
            >
            <svg
              width={canvasWidth}
              height={canvasHeight}
              className="absolute inset-0 pointer-events-none"
            >
              {connectorPaths.map((cp, idx) => {
                const isDimmedPath = isConvergenceDimmingActive && cp.targetIsUnique;
                return (
                  <path
                    key={idx}
                    d={cp.d}
                    fill="none"
                    stroke={
                      cp.isKnown && !isDimmedPath
                        ? cp.isSire
                          ? 'var(--barn-slate)'
                          : 'var(--barn-terracotta)'
                        : 'currentColor'
                    }
                    strokeOpacity={isDimmedPath ? 0.32 : 1}
                    className={
                      cp.isKnown && !isDimmedPath
                        ? undefined
                        : 'text-[var(--barn-border)] dark:text-[var(--barn-muted)]/70'
                    }
                    strokeDasharray={cp.isKnown ? undefined : '4 4'}
                    strokeWidth={cp.isKnown ? (compact ? '1.5' : '2') : '1.4'}
                  />
                );
              })}
            </svg>

            {Array.from(nodeCoords.values()).map(({ x, y, slot }) => {
              const slotKey = `${slot.generation}:${slot.slotIndex}`;
              const a = slot.animal;
              const isSubject = slot.generation === 0;
              const isLinebred = slot.occurrenceCount > 1;
              const isMaleSlot = slot.expectedSex === 'Male';
              const canLinkMissing = !a && Boolean(slot.childAnimalId);
              const nodeConflict = a ? conflictsByAnimalId.get(a.id) : undefined;
              const hasUrgentConflict = Boolean(nodeConflict?.hasActiveConflict);
              const hasSoftConflict = Boolean(nodeConflict?.isIgnoredWithSoftWarning);
              const regStatus = isArbaFlagOverlayActive
                ? treeAnalysis?.registrationBySlotKey.get(slotKey)
                : undefined;
              const hasRegBlocker = Boolean(regStatus?.isBlocking);
              const isDimmedUnique = Boolean(
                isConvergenceDimmingActive && a && !isSubject && !isLinebred
              );

              return (
                <div
                  key={slotKey}
                  data-dimmed-unique={isDimmedUnique ? 'true' : undefined}
                  data-arba-blocked={hasRegBlocker ? 'true' : undefined}
                  style={{
                    left: `${x}px`,
                    top: `${y}px`,
                    width: `${cardWidth}px`,
                    height: `${cardHeight}px`,
                  }}
                  className={`absolute rounded-xl border ${
                    compact ? 'px-2 py-1' : 'px-3 py-2'
                  } flex flex-col justify-between transition-all ${
                    a
                      ? hasRegBlocker
                        ? `bg-[var(--barn-danger)]/10 border-[var(--barn-danger)] border-[1.5px]${
                            isDimmedUnique ? ' opacity-85' : ''
                          }`
                        : hasUrgentConflict
                        ? 'bg-[var(--barn-terracotta-tint)]/75 border-[var(--barn-terracotta)] border-[1.5px]'
                        : hasSoftConflict
                        ? 'bg-[var(--barn-canvas)] border-[var(--barn-terracotta)]/70 border-dashed border-[1.5px]'
                        : isSubject || isLinebred
                        ? 'bg-[var(--barn-sage-tint)]/75 border-[var(--barn-sage)] border-[1.5px]'
                        : isDimmedUnique
                        ? 'bg-[var(--barn-subtle)]/55 border-[var(--barn-border)]/75 opacity-55 grayscale-[70%]'
                        : 'bg-[var(--barn-canvas)] border-[var(--barn-border)]'
                      : hasRegBlocker
                      ? 'bg-[var(--barn-danger)]/8 border-dashed border-[var(--barn-danger)] border-[1.5px]'
                      : 'bg-[var(--barn-canvas)]/65 dark:bg-[var(--barn-subtle)]/75 border-dashed border-[var(--barn-border)] dark:border-[var(--barn-muted)]/60'
                  }`}
                >
                  {a ? (() => {
                    const fullCarrier = formatCompactCarrierDisclosure(a, {
                      herdById,
                      includeCleared: true,
                    });
                    const cardCarrier = formatCompactCarrierDisclosure(a, {
                      herdById,
                      includeCleared: true,
                      ultraCompact: compact,
                      maxItemsPerGroup: compact ? 2 : 3,
                    });
                    const animalProvenance = provenanceByAnimalId.get(a.id);
                    const hasGenoText = Boolean(
                      a.genotypeRaw || formatGenotypeArray(a.genotype)
                    );
                    const regShortList =
                      hasRegBlocker && regStatus
                        ? regStatus.deficiencies.map((d) => d.shortLabel).join(', ')
                        : '';
                    return (
                      <>
                        <div className="flex items-center justify-between gap-1 min-w-0">
                          <button
                            type="button"
                            onClick={() =>
                              slot.generation === 0
                                ? onOpenAnimalInHerd(a.id)
                                : handleDrillToAnimal(a.id)
                            }
                            onFocus={(e) =>
                              e.currentTarget.scrollIntoView?.({
                                block: 'nearest',
                                inline: 'nearest',
                              })
                            }
                            className={`font-semibold text-left truncate hover:underline rounded focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--barn-sage)] ${
                              compact ? 'text-[10.5px] leading-tight' : 'text-xs'
                            }`}
                            title={
                              [
                                a.name,
                                hasRegBlocker && regStatus ? regStatus.summaryText : '',
                                nodeConflict?.hasAnyConflict
                                  ? nodeConflict.headlineReasons.join('; ')
                                  : '',
                                isDimmedUnique ? 'Unique (non-convergent) ancestor' : '',
                                !hasRegBlocker && !nodeConflict?.hasAnyConflict
                                  ? 'Click to focus'
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' — ')
                            }
                          >
                            {a.name}
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            {hasRegBlocker && regStatus && (
                              <span
                                title={regStatus.summaryText}
                                className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-[var(--barn-danger)]"
                              >
                                <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" />
                                {!compact ? 'ARBA' : 'Reg!'}
                              </span>
                            )}
                            {nodeConflict?.hasAnyConflict && (
                              <span
                                title={nodeConflict.headlineReasons.join('; ')}
                                className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-[var(--barn-terracotta)]"
                              >
                                <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" />
                                {!compact && (hasUrgentConflict ? 'Conflict' : 'Soft Warn')}
                              </span>
                            )}
                            {isLinebred && (
                              <span className="font-mono text-[9.5px] font-semibold text-[var(--barn-sage)]">
                                {slot.occurrenceCount}×
                              </span>
                            )}
                          </div>
                        </div>

                        {!compact ? (
                          <>
                            <div className="text-[11px] text-[var(--barn-muted)] font-mono truncate">
                              {a.tattoo || 'No ID'} · {a.variety || a.breed || 'No variety'}
                              {a.weightGrams > 0
                                ? ` · ${formatWeight(a.weightGrams, resolveSpeciesWeightUnit(speciesProfile, settings))}`
                                : ''}
                            </div>

                            {hasRegBlocker && regStatus && (
                              <div
                                title={regStatus.summaryText}
                                className="text-[9.5px] font-semibold text-[var(--barn-danger)] truncate leading-tight"
                              >
                                Missing: {regShortList}
                              </div>
                            )}

                            {cardCarrier && !hasRegBlocker && (
                              <div
                                title={fullCarrier}
                                className="text-[10px] font-medium text-[var(--barn-terracotta)] truncate leading-tight"
                              >
                                {cardCarrier}
                              </div>
                            )}

                            <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--barn-muted)] truncate">
                              <span
                                className={
                                  a.sex === 'Male'
                                    ? 'text-[var(--barn-slate)] font-medium shrink-0'
                                    : 'text-[var(--barn-terracotta)] font-medium shrink-0'
                                }
                              >
                                {formatSexForSpecies(a.sex, speciesProfile)}
                              </span>
                              <span className="font-mono truncate">
                                {hasGenoText ? (
                                  <ColoredGenotypeDisplay
                                    provenance={animalProvenance}
                                    fallbackText={a.genotypeRaw || formatGenotypeArray(a.genotype)}
                                    compact
                                  />
                                ) : (
                                  a.registrationNumber
                                )}
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-[9.5px] text-[var(--barn-muted)] font-mono truncate leading-tight">
                              {a.tattoo || formatSexForSpecies(a.sex, speciesProfile)}
                              {generations === 5 && (a.variety || a.breed)
                                ? ` · ${a.variety || a.breed}`
                                : ''}
                            </div>
                            {hasRegBlocker && regStatus ? (
                              <div
                                title={regStatus.summaryText}
                                className="text-[8.5px] font-semibold text-[var(--barn-danger)] truncate leading-none"
                              >
                                Missing: {regShortList}
                              </div>
                            ) : (
                              cardCarrier && (
                                <div
                                  title={fullCarrier}
                                  className="text-[8.5px] font-medium text-[var(--barn-terracotta)] truncate leading-none"
                                >
                                  {cardCarrier}
                                </div>
                              )
                            )}
                          </>
                        )}
                      </>
                    );
                  })() : (
                    <div
                      title={hasRegBlocker && regStatus ? regStatus.summaryText : undefined}
                      className={`h-full flex items-center justify-between gap-1.5 ${
                        hasRegBlocker
                          ? 'text-[var(--barn-danger)]'
                          : 'text-[var(--barn-muted)] dark:text-[var(--barn-ink)]/85'
                      } ${compact ? 'text-[10px]' : 'text-xs'}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {compact
                            ? 'Unknown'
                            : `Unknown ${isMaleSlot ? speciesProfile.maleLabel : speciesProfile.femaleLabel}`}
                        </div>
                        {!compact && hasRegBlocker && (
                          <div className="text-[9.5px] font-semibold text-[var(--barn-danger)] truncate">
                            Blocks 3-gen ARBA reg
                          </div>
                        )}
                      </div>
                      {canLinkMissing && (
                        <button
                          type="button"
                          onClick={() => {
                            setIncludeArchivedInLink(false);
                            setLinkSearchQuery('');
                            setLinkingSlot(slot);
                          }}
                          onFocus={(e) =>
                            e.currentTarget.scrollIntoView?.({
                              block: 'nearest',
                              inline: 'nearest',
                            })
                          }
                          aria-label={`Link missing ${
                            isMaleSlot ? speciesProfile.maleLabel : speciesProfile.femaleLabel
                          } for slot ${slot.generation}-${slot.slotIndex + 1}`}
                          className={`rounded-md border border-[var(--barn-border)] dark:border-[var(--barn-muted)]/60 bg-[var(--barn-surface)] dark:bg-[var(--barn-canvas)] font-medium text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--barn-sage)] inline-flex items-center gap-0.5 shrink-0 ${
                            compact ? 'px-1.5 py-0.5 text-[9.5px]' : 'min-h-[30px] px-2 py-1 text-[11px]'
                          }`}
                        >
                          <Plus className="w-2.5 h-2.5" aria-hidden="true" />
                          Link
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {generations >= 4 &&
              Array.from(branchViewport.branchSummaries.values()).map((summary) => {
                const g3Box = nodeCoords.get(summary.slotKey);
                if (!g3Box) return null;
                const btnLeft = g3Box.x + cardWidth + 8;
                const btnTop = g3Box.y + cardHeight / 2 - 14;
                const g3Name = g3Box.slot.animal?.name || g3Box.slot.roleLabel;
                const isBranchLoading = loadingGen3Branches.has(summary.branchIndex);
                return (
                  <button
                    key={`branch-toggle-${summary.branchIndex}`}
                    type="button"
                    aria-expanded={summary.isExpanded}
                    aria-busy={isBranchLoading}
                    onClick={() => toggleGen3Branch(summary.branchIndex)}
                    onFocus={(e) =>
                      e.currentTarget.scrollIntoView?.({
                        block: 'nearest',
                        inline: 'nearest',
                      })
                    }
                    title={
                      summary.isExpanded
                        ? `Collapse Gen 4–${generations} ancestors behind ${g3Name}`
                        : summary.hasKnownAncestors
                        ? `Expand Gen 4–${generations} ancestors behind ${g3Name}`
                        : `Expand Gen 4–${generations} slots behind ${g3Name} (${summary.hiddenTotalSlots} slots)`
                    }
                    aria-label={
                      summary.isExpanded
                        ? `Collapse generation 4 plus ancestors for ${g3Name}`
                        : `Expand generation 4 plus ancestors for ${g3Name}${
                            summary.hasKnownAncestors ? ': known ancestors' : ''
                          }`
                    }
                    style={{
                      left: `${btnLeft}px`,
                      top: `${btnTop}px`,
                    }}
                    className={`absolute h-[28px] px-2 rounded-lg border text-[10px] font-semibold font-mono whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--barn-sage)] ${
                      summary.isExpanded
                        ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] border-transparent'
                        : summary.hasKnownAncestors
                        ? 'bg-[var(--barn-sage-tint)] text-[var(--barn-ink)] border-[var(--barn-sage)] hover:opacity-90'
                        : 'bg-[var(--barn-surface)] text-[var(--barn-muted)] border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                    }`}
                  >
                    {isBranchLoading
                      ? 'Loading...'
                      : summary.isExpanded
                      ? 'Hide −'
                      : summary.hiddenKnownAncestors > 0
                      ? `+${summary.hiddenKnownAncestors} known`
                      : summary.hasKnownAncestors
                      ? '+ Gen 4+'
                      : `+${summary.hiddenTotalSlots}`}
                  </button>
                );
              })}
          </div>
        </div>
        </div>
      </div>

      {/* Pedigree Navigation Breadcrumb Below Preview */}
      {historyAnimals.length > 1 && (
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl px-4 py-3 flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => handleJumpToHistoryIndex(historyAnimals.length - 2)}
            className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back
          </button>

          <nav
            aria-label="Pedigree trail"
            className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--barn-muted)] min-w-0"
          >
            {historyAnimals.map((entry, idx) => {
              const isLast = idx === historyAnimals.length - 1;
              return (
                <React.Fragment key={`${entry.id}-${idx}`}>
                  {idx > 0 && (
                    <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" aria-hidden="true" />
                  )}
                  {isLast ? (
                    <span className="font-semibold text-[var(--barn-ink)] truncate max-w-[180px]">
                      {entry.name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleJumpToHistoryIndex(idx)}
                      className={`min-h-[30px] px-2.5 py-1 rounded-lg border transition-colors truncate max-w-[180px] ${
                        idx === 0
                          ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)]/50 text-[var(--barn-ink)] font-semibold hover:opacity-90'
                          : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] text-[var(--barn-ink)] font-medium hover:bg-[var(--barn-subtle)]'
                      }`}
                    >
                      {entry.name}
                    </button>
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        </div>
      )}

      {/* Quick Offspring Jump Strip */}
      {offspring.length > 0 && (
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl px-4 py-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[var(--barn-muted)]">
            {speciesProfile.offspringLabel} ({offspring.length}):
          </span>
          {offspring.map((kid) => (
            <button
              key={kid.id}
              type="button"
              onClick={() => handleDrillToAnimal(kid.id)}
              className="min-h-[34px] px-3 py-1 rounded-full bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] font-medium whitespace-nowrap hover:opacity-95 transition-opacity"
            >
              {kid.sex === 'Female' ? '♀ ' : kid.sex === 'Male' ? '♂ ' : ''}
              {kid.name} ({kid.tattoo})
            </button>
          ))}
        </div>
      )}

      {/* Link Existing or Create New Parent Modal */}
      {linkingSlot && (
        <div
          ref={linkingDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Assign Parent"
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold">
              Assign{' '}
              {linkingSlot.expectedSex === 'Male'
                ? `Sire (${speciesProfile.maleLabel})`
                : `Dam (${speciesProfile.femaleLabel})`}
            </h3>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--barn-muted)]">
              <span>Showing {speciesProfile.name} candidates (active by default)</span>
              {archivedLinkCount > 0 && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-[var(--barn-ink)] font-medium">
                  <input
                    type="checkbox"
                    checked={includeArchivedInLink}
                    onChange={(e) => {
                      setIncludeArchivedInLink(e.target.checked);
                      if (!e.target.checked) setLinkSearchQuery('');
                    }}
                  />
                  <span>Include Archived ({archivedLinkCount})</span>
                </label>
              )}
            </div>

            {includeArchivedInLink && (
              <div className="relative">
                <Search
                  className="w-4 h-4 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="Search parents"
                  autoFocus
                  placeholder={`Search ${speciesProfile.name} parents by name, ${getSpeciesIdentifierLabels(speciesProfile.name).shortLabel.toLowerCase()}, or breed...`}
                  value={linkSearchQuery}
                  onChange={(e) => setLinkSearchQuery(e.target.value)}
                  className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--barn-sage)]"
                />
              </div>
            )}

            {visibleLinkCandidates.length === 0 ? (
              <p className="text-sm text-[var(--barn-muted)]">
                {includeArchivedInLink && linkSearchQuery.trim()
                  ? `No matching ${speciesProfile.name.toLowerCase()} candidates for "${linkSearchQuery.trim()}".`
                  : `No ${includeArchivedInLink ? '' : 'active '}${speciesProfile.name.toLowerCase()} candidates available. ${
                      archivedLinkCount > 0 && !includeArchivedInLink
                        ? 'Toggle Include Archived above or create a new parent below.'
                        : 'Create a new parent record below.'
                    }`}
              </p>
            ) : (
              <div className="max-h-56 overflow-y-auto divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl">
                {visibleLinkCandidates.map((cand) => (
                  <button
                    key={cand.id}
                    type="button"
                    onClick={() => {
                      const child = herdById.get(linkingSlot.childAnimalId);
                      if (child) {
                        const asSire = linkingSlot.expectedSex === 'Male';
                        onSaveAnimal({
                          ...child,
                          sireId: asSire ? cand.id : child.sireId,
                          damId: !asSire ? cand.id : child.damId,
                        });
                      }
                      setLinkingSlot(null);
                    }}
                    className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-[var(--barn-subtle)] flex justify-between gap-2"
                  >
                    <span className="font-medium truncate">
                      {cand.name}
                      {isAnimalArchived(cand) ? ' [Archived]' : ''}
                      {doesAnimalNeedAttention(cand) ? ' [Needs Attention]' : ''}
                    </span>
                    <span className="font-mono text-[var(--barn-muted)] shrink-0">
                      {cand.tattoo}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  setCreatingParentSlot(linkingSlot);
                  setLinkingSlot(null);
                }}
                className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold"
              >
                + Create &amp; Link New{' '}
                {linkingSlot.expectedSex === 'Male'
                  ? speciesProfile.maleLabel
                  : speciesProfile.femaleLabel}
              </button>
              <button
                type="button"
                onClick={() => setLinkingSlot(null)}
                className="min-h-[40px] px-4 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {creatingParentSlot && (
        <AnimalEditorModal
          initialAnimal={null}
          speciesProfile={speciesProfile}
          speciesAnimals={animals}
          speciesCages={cages}
          preferredUnit={resolveSpeciesWeightUnit(speciesProfile, settings)}
          currencyCode={settings.currencyCode}
          optimizationPresetId={settings.imageOptimizationPreset}
          defaultBreederName={settings.breederName}
          defaultOwnerName={settings.barnName}
          forcedSex={creatingParentSlot.expectedSex}
          onSave={(draft, pendingPhotos) =>
            onSaveAnimal(
              draft,
              {
                childId: creatingParentSlot.childAnimalId,
                asSire: creatingParentSlot.expectedSex === 'Male',
              },
              pendingPhotos
            )
          }
          onClose={() => setCreatingParentSlot(null)}
        />
      )}

      {showPrintModal && (() => {
        const mergedPrintAnimals = Array.from(
          new Map<string, Animal>([
            ...Array.from(lazyAncestorsById.entries()),
            ...allAnimals.map((a): [string, Animal] => [a.id, a]),
          ]).values()
        );
        const resolvedSubjectPhotoForPrint = settings.includePhotoOnPedigree
          ? subjectPrimaryPhoto?.dataUrl ||
              (hydratedSubjectPhoto &&
              hydratedSubjectPhoto.photoId === subjectPrimaryPhoto?.id
                ? hydratedSubjectPhoto.dataUrl
                : subjectPrimaryPhoto?.thumbnailDataUrl)
          : undefined;
        const appBaseUrl =
          typeof window !== 'undefined'
            ? `${window.location.origin}${window.location.pathname}`
            : undefined;
        const isShareableCard = pedigreeDocMode === 'shareable_card';
        const effectivePrintOptions: PedigreePrintOptions = {
          ...pedigreePrintOptions,
          shows,
          careLogs,
          woolHarvests,
          ancestorPhotosByAnimalId:
            pedigreePrintOptions.layoutPreset === 'family_portrait'
              ? familyPortraitPhotosByAnimalId
              : undefined,
        };
        return (
          <PrintPreviewModal
            title={
              isShareableCard
                ? `Shareable Pedigree Card — ${subject.name}`
                : `${generations}-Generation Pedigree — ${subject.name}`
            }
            filename={
              isShareableCard
                ? buildShareablePedigreeCardFileName(subject)
                : `pedigree-${subject.tattoo || subject.id}-${generations}gen.htm`
            }
            htmlContent={
              isShareableCard
                ? generateShareablePedigreeCardHtml(
                    subject,
                    mergedPrintAnimals,
                    speciesProfiles,
                    settings,
                    generations,
                    resolvedSubjectPhotoForPrint,
                    {
                      ...effectivePrintOptions,
                      appBaseUrl,
                      includeQrCode: Boolean(appBaseUrl),
                    }
                  )
                : generateEvansHtmPedigree(
                    subject,
                    mergedPrintAnimals,
                    speciesProfiles,
                    settings,
                    generations,
                    resolvedSubjectPhotoForPrint,
                    effectivePrintOptions
                  )
            }
            includePrimaryPhoto={settings.includePhotoOnPedigree}
            onToggleIncludePrimaryPhoto={onToggleIncludePhotoOnPedigree}
            pedigreePrintOptions={pedigreePrintOptions}
            onChangePedigreePrintOptions={setPedigreePrintOptions}
            pedigreeDocMode={pedigreeDocMode}
            onChangePedigreeDocMode={setPedigreeDocMode}
            breederLogoDataUrl={settings.breederLogoDataUrl}
            onUpdateBreederLogo={onUpdateBreederLogo}
            onDownloadPdf={
              isShareableCard
                ? undefined
                : () =>
                    buildAndDownloadPedigreePdf({
                      subject,
                      allAnimals: mergedPrintAnimals,
                      speciesProfiles,
                      settings,
                      generations,
                      printOptions: effectivePrintOptions,
                      primaryPhotoDataUrl: resolvedSubjectPhotoForPrint,
                      pdfFilename: `pedigree-${subject.tattoo || subject.id}-${generations}gen.pdf`,
                    })
            }
            headerNotice={<PedigreePrintNotice />}
            onClose={() => {
              setShowPrintModal(false);
              setHydratedSubjectPhoto(null);
              setFamilyPortraitPhotosByAnimalId({});
            }}
          />
        );
      })()}
    </div>
  );
}
```

## `src/components/PrintPreviewModal.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * In-App Document & Thermal Label Print Preview Modal.
 *
 * Renders generated `.HTM` pedigrees and 4"x2" cage cards inside an isolated `<iframe srcDoc>`
 * with 60/120fps DOM-composited pinch-to-zoom, Ctrl+wheel zoom, and toolbar zoom controls so
 * multi-generation pedigrees can be inspected smoothly before PDF printing (`contentWindow.print()`)
 * or download.
 */

import {
  AlertCircle,
  Check,
  Copy,
  Download,
  FileDown,
  Loader2,
  Mail,
  Printer,
  Share2,
  ShieldAlert,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import React, { ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { BarnBinderOptions } from '../core/barnBinder';
import {
  BATCH_PRINT_LAYOUTS,
  BatchPrintOptions,
  getBatchPrintLayoutSpec,
} from '../core/batchPrint';
import { sanitizeSafeRasterImageDataUrl } from '../core/inputSanitization';
import {
  PEDIGREE_BORDER_STYLES,
  PEDIGREE_COLOR_PRESETS,
  PEDIGREE_LAYOUT_PRESETS,
  PEDIGREE_QUICK_STYLE_PRESETS,
  PedigreeBorderStyleId,
  PedigreeColorPresetId,
  PedigreeLayoutPresetId,
} from '../core/pedigreePrintStyles';
import type { PedigreePrintOptions } from '../core/syncAndExports';
import { pedigreeBridge } from '../native/pedigreeBridge';
import {
  dismissAsyncErrorToast,
  emitAsyncErrorToast,
  isMemoryLikeError,
  logDiagnosticEvent,
} from '../storage/crashLogger';
import { optimizeImageFile } from '../storage/webImageOptimizer';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { copyTextWithFallback, downloadTextFile, shareTextFileOrDownload } from '../utils/webFileActions';
import { ColorGeneticsNotice } from './ColorGeneticsNotice';

const MIN_PREVIEW_ZOOM = 0.2;
const MAX_PREVIEW_ZOOM = 2.5;

function clampPreviewZoom(value: number): number {
  return Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, value));
}

export type PrintPreviewFileActionKind = 'download' | 'share' | 'pdf';

export interface PrintPreviewFileError {
  action: PrintPreviewFileActionKind;
  title: string;
  detail: string;
}

export function isPrintPreviewAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return (err as { name?: unknown }).name === 'AbortError';
}

export function formatPrintPreviewFileError(
  action: PrintPreviewFileActionKind,
  filename: string,
  err: unknown
): PrintPreviewFileError {
  const rawDetail =
    err instanceof Error && err.message.trim()
      ? err.message.trim()
      : typeof err === 'string' && err.trim()
      ? err.trim()
      : 'An unexpected file export error occurred.';

  const safeName = filename.trim() || (action === 'pdf' ? 'document.pdf' : 'document.htm');
  const title =
    action === 'share'
      ? 'Could Not Share .HTM File'
      : action === 'pdf'
      ? 'Could Not Export .PDF File'
      : 'Could Not Download .HTM File';
  const detail =
    action === 'share'
      ? `Sharing "${safeName}" failed (${rawDetail}). Try Download .HTM or Print / Save PDF.`
      : action === 'pdf'
      ? `Exporting "${safeName}" as PDF failed (${rawDetail}). Try Print / Save PDF or Download .HTM.`
      : `Downloading "${safeName}" failed (${rawDetail}). Free device storage or try Print / Save PDF.`;

  return { action, title, detail };
}

export async function runPrintPreviewFileAction(params: {
  action: PrintPreviewFileActionKind;
  filename: string;
  task: () => Promise<unknown>;
  isMounted: () => boolean;
  onBeforeStart: () => void;
  onError: (err: PrintPreviewFileError, toastId: string | null) => void;
  onFinish: () => void;
}): Promise<boolean> {
  params.onBeforeStart();
  try {
    await params.task();
    return true;
  } catch (err: unknown) {
    if (isPrintPreviewAbortError(err)) {
      return false;
    }
    const formatted = formatPrintPreviewFileError(params.action, params.filename, err);
    const memoryLike = isMemoryLikeError(err);
    logDiagnosticEvent({
      level: 'error',
      category: memoryLike ? 'memory' : 'storage',
      message: `${formatted.title}: ${formatted.detail}`,
      error: err,
      details: { action: params.action, filename: params.filename },
    });
    const toast = emitAsyncErrorToast({
      title: formatted.title,
      detail: formatted.detail,
      severity: 'error',
      sticky: true,
      category: memoryLike ? 'memory' : 'storage',
      canOpenDiagnostics: true,
    });
    if (params.isMounted()) {
      params.onError(formatted, toast?.id ?? null);
    }
    return false;
  } finally {
    params.onFinish();
  }
}

interface PrintPreviewModalProps {
  title: string;
  filename: string;
  htmlContent: string;
  headerNotice?: ReactNode;
  includePrimaryPhoto?: boolean;
  onToggleIncludePrimaryPhoto?: (include: boolean) => void;
  includeCageCardQr?: boolean;
  onToggleIncludeCageCardQr?: (include: boolean) => void;
  pedigreePrintOptions?: PedigreePrintOptions;
  onChangePedigreePrintOptions?: (next: PedigreePrintOptions) => void;
  pedigreeDocMode?: 'formal_certificate' | 'shareable_card';
  onChangePedigreeDocMode?: (mode: 'formal_certificate' | 'shareable_card') => void;
  breederLogoDataUrl?: string;
  onUpdateBreederLogo?: (dataUrl: string | undefined) => void;
  onDownloadPdf?: () => Promise<void>;
  binderPrintOptions?: BarnBinderOptions;
  onChangeBinderPrintOptions?: (next: BarnBinderOptions) => void;
  binderArchivedCount?: number;
  batchPrintOptions?: BatchPrintOptions;
  onChangeBatchPrintOptions?: (next: BatchPrintOptions) => void;
  batchAnimalCount?: number;
  batchPageCount?: number;
  batchPhotoHydrating?: boolean;
  extraToolbarContent?: ReactNode;
  mailtoUrl?: string;
  plainTextSummary?: string;
  onClose: () => void;
}

export function PrintPreviewModal({
  title,
  filename,
  htmlContent,
  headerNotice,
  includePrimaryPhoto,
  onToggleIncludePrimaryPhoto,
  includeCageCardQr,
  onToggleIncludeCageCardQr,
  pedigreePrintOptions,
  onChangePedigreePrintOptions,
  pedigreeDocMode = 'formal_certificate',
  onChangePedigreeDocMode,
  breederLogoDataUrl,
  onUpdateBreederLogo,
  onDownloadPdf,
  binderPrintOptions,
  onChangeBinderPrintOptions,
  binderArchivedCount = 0,
  batchPrintOptions,
  onChangeBatchPrintOptions,
  batchAnimalCount = 0,
  batchPageCount = 0,
  batchPhotoHydrating = false,
  extraToolbarContent,
  mailtoUrl,
  plainTextSummary,
  onClose,
}: PrintPreviewModalProps) {
  const shareReasonId = useId();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const sizerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const zoomLabelRef = useRef<HTMLButtonElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [fitZoom, setFitZoom] = useState<number>(1);
  const [printBlockedMessage, setPrintBlockedMessage] = useState<string | null>(null);
  const [fileActionBusy, setFileActionBusy] = useState<PrintPreviewFileActionKind | null>(null);
  const [fileActionError, setFileActionError] = useState<PrintPreviewFileError | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [docSize, setDocSize] = useState<{ width: number; height: number }>({
    width: 980,
    height: 760,
  });

  const zoomRef = useRef<number>(zoom);
  const docSizeRef = useRef(docSize);
  docSizeRef.current = docSize;

  const isMountedRef = useRef(true);
  const fileActionInFlightRef = useRef(false);
  const lastFileToastIdRef = useRef<string | null>(null);
  const initializedContentRef = useRef<string | null>(null);
  const wheelSyncTimerRef = useRef<number | null>(null);
  const printFallbackTimerRef = useRef<number | null>(null);
  const printSafetyTimerRef = useRef<number | null>(null);
  const copiedSummaryTimerRef = useRef<number | null>(null);
  const cleanupPrintStageRef = useRef<(() => void) | null>(null);
  const cleanupDocListenersRef = useRef<(() => void) | null>(null);
  const dialogRef = useAccessibleDialog({ isOpen: true, onClose });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (wheelSyncTimerRef.current !== null) {
        window.clearTimeout(wheelSyncTimerRef.current);
      }
      if (printFallbackTimerRef.current !== null) {
        window.clearTimeout(printFallbackTimerRef.current);
      }
      if (printSafetyTimerRef.current !== null) {
        window.clearTimeout(printSafetyTimerRef.current);
      }
      if (copiedSummaryTimerRef.current !== null) {
        window.clearTimeout(copiedSummaryTimerRef.current);
      }
      cleanupPrintStageRef.current?.();
      cleanupPrintStageRef.current = null;
      cleanupDocListenersRef.current?.();
      cleanupDocListenersRef.current = null;
    };
  }, []);

  useEffect(() => {
    zoomRef.current = zoom;
    if (sizerRef.current) {
      sizerRef.current.style.width = `${docSize.width * zoom}px`;
      sizerRef.current.style.height = `${docSize.height * zoom}px`;
    }
    if (iframeRef.current) {
      iframeRef.current.style.transform = `scale(${zoom})`;
    }
    if (zoomLabelRef.current) {
      zoomLabelRef.current.textContent = `${Math.round(zoom * 100)}%`;
    }
  }, [zoom, docSize]);

  const applyVisualZoomFrame = useCallback(
    (nextZoomRaw: number, scrollLeft: number, scrollTop: number) => {
      const nextZoom = clampPreviewZoom(nextZoomRaw);
      zoomRef.current = nextZoom;

      const dims = docSizeRef.current;
      if (sizerRef.current) {
        sizerRef.current.style.width = `${dims.width * nextZoom}px`;
        sizerRef.current.style.height = `${dims.height * nextZoom}px`;
      }
      if (iframeRef.current) {
        iframeRef.current.style.transform = `scale(${nextZoom})`;
      }
      if (viewportRef.current) {
        viewportRef.current.scrollLeft = Math.max(0, scrollLeft);
        viewportRef.current.scrollTop = Math.max(0, scrollTop);
      }
      if (zoomLabelRef.current) {
        zoomLabelRef.current.textContent = `${Math.round(nextZoom * 100)}%`;
      }
      return nextZoom;
    },
    []
  );

  const commitZoomToReact = useCallback(() => {
    setZoom(Math.round(zoomRef.current * 1000) / 1000);
  }, []);

  const applyZoomCentered = useCallback(
    (nextZoomRaw: number, clientX?: number, clientY?: number, deferReactSync = false) => {
      const viewport = viewportRef.current;
      const prevZoom = zoomRef.current;
      const nextZoom = clampPreviewZoom(nextZoomRaw);
      if (Math.abs(nextZoom - prevZoom) < 0.0005) return;

      if (!viewport) {
        zoomRef.current = nextZoom;
        setZoom(nextZoom);
        return;
      }

      const vpRect = viewport.getBoundingClientRect();
      const sizerRect = sizerRef.current?.getBoundingClientRect();
      const originLeft = sizerRect ? sizerRect.left - vpRect.left + viewport.scrollLeft : 12;
      const originTop = sizerRect ? sizerRect.top - vpRect.top + viewport.scrollTop : 12;

      const focalVpX = clientX !== undefined ? clientX - vpRect.left : viewport.clientWidth / 2;
      const focalVpY = clientY !== undefined ? clientY - vpRect.top : viewport.clientHeight / 2;

      const contentX = (viewport.scrollLeft + focalVpX - originLeft) / prevZoom;
      const contentY = (viewport.scrollTop + focalVpY - originTop) / prevZoom;

      const targetScrollLeft = originLeft + contentX * nextZoom - focalVpX;
      const targetScrollTop = originTop + contentY * nextZoom - focalVpY;

      applyVisualZoomFrame(nextZoom, targetScrollLeft, targetScrollTop);

      if (deferReactSync) {
        if (wheelSyncTimerRef.current !== null) {
          window.clearTimeout(wheelSyncTimerRef.current);
        }
        wheelSyncTimerRef.current = window.setTimeout(() => {
          wheelSyncTimerRef.current = null;
          commitZoomToReact();
        }, 120);
      } else {
        commitZoomToReact();
      }
    },
    [applyVisualZoomFrame, commitZoomToReact]
  );

  const attachPinchAndWheelListeners = useCallback(
    (target: HTMLElement | Document, isInsideIframe: boolean) => {
      let pinchStartDist = 0;
      let pinchStartZoom = 1;
      let pinchOriginLeft = 12;
      let pinchOriginTop = 12;
      let pinchContentX = 0;
      let pinchContentY = 0;
      let isPinching = false;
      let pendingPinchFrame: number | null = null;
      let latestTouchMetrics: { dist: number; midClientX: number; midClientY: number } | null =
        null;

      const toViewportCoords = (clientX: number, clientY: number) => {
        if (!isInsideIframe || !iframeRef.current) {
          return { x: clientX, y: clientY };
        }
        const iframeRect = iframeRef.current.getBoundingClientRect();
        return {
          x: iframeRect.left + clientX * zoomRef.current,
          y: iframeRect.top + clientY * zoomRef.current,
        };
      };

      const getTouchMetrics = (touches: TouchList) => {
        const t0 = touches[0];
        const t1 = touches[1];
        const p0 = toViewportCoords(t0.clientX, t0.clientY);
        const p1 = toViewportCoords(t1.clientX, t1.clientY);
        return {
          dist: Math.hypot(p1.x - p0.x, p1.y - p0.y),
          midClientX: (p0.x + p1.x) / 2,
          midClientY: (p0.y + p1.y) / 2,
        };
      };

      const flushPinchFrame = () => {
        pendingPinchFrame = null;
        const viewport = viewportRef.current;
        if (!viewport || !isPinching || !latestTouchMetrics || pinchStartDist <= 0) return;

        const { dist, midClientX, midClientY } = latestTouchMetrics;
        const vpRect = viewport.getBoundingClientRect();
        const midVpX = midClientX - vpRect.left;
        const midVpY = midClientY - vpRect.top;

        const nextZoom = clampPreviewZoom(pinchStartZoom * (dist / pinchStartDist));
        const targetScrollLeft = pinchOriginLeft + pinchContentX * nextZoom - midVpX;
        const targetScrollTop = pinchOriginTop + pinchContentY * nextZoom - midVpY;

        applyVisualZoomFrame(nextZoom, targetScrollLeft, targetScrollTop);
      };

      const onTouchStart = (e: TouchEvent) => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        if (e.touches.length === 2) {
          if (e.cancelable) e.preventDefault();
          const metrics = getTouchMetrics(e.touches);
          if (metrics.dist <= 4) return;

          const vpRect = viewport.getBoundingClientRect();
          const sizerRect = sizerRef.current?.getBoundingClientRect();
          pinchOriginLeft = sizerRect ? sizerRect.left - vpRect.left + viewport.scrollLeft : 12;
          pinchOriginTop = sizerRect ? sizerRect.top - vpRect.top + viewport.scrollTop : 12;

          isPinching = true;
          pinchStartDist = metrics.dist;
          pinchStartZoom = zoomRef.current;

          const midVpX = metrics.midClientX - vpRect.left;
          const midVpY = metrics.midClientY - vpRect.top;
          pinchContentX = (viewport.scrollLeft + midVpX - pinchOriginLeft) / pinchStartZoom;
          pinchContentY = (viewport.scrollTop + midVpY - pinchOriginTop) / pinchStartZoom;
          latestTouchMetrics = metrics;

          if (iframeRef.current) {
            iframeRef.current.style.willChange = 'transform';
          }
        } else {
          isPinching = false;
        }
      };

      const onTouchMove = (e: TouchEvent) => {
        if (!isPinching || e.touches.length !== 2) return;
        if (e.cancelable) e.preventDefault();
        latestTouchMetrics = getTouchMetrics(e.touches);
        if (pendingPinchFrame === null) {
          pendingPinchFrame = window.requestAnimationFrame(flushPinchFrame);
        }
      };

      const finishPinch = (e: TouchEvent) => {
        if (e.touches.length < 2 && isPinching) {
          if (pendingPinchFrame !== null) {
            window.cancelAnimationFrame(pendingPinchFrame);
            flushPinchFrame();
          }
          isPinching = false;
          latestTouchMetrics = null;
          if (iframeRef.current) {
            iframeRef.current.style.willChange = 'auto';
          }
          commitZoomToReact();
        }
      };

      const onWheel = (e: WheelEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const pt = toViewportCoords(e.clientX, e.clientY);
        const clampedDelta = Math.max(-60, Math.min(60, e.deltaY));
        const scaleFactor = Math.exp(-clampedDelta * 0.008);
        applyZoomCentered(zoomRef.current * scaleFactor, pt.x, pt.y, true);
      };

      target.addEventListener('touchstart', onTouchStart as EventListener, { passive: false });
      target.addEventListener('touchmove', onTouchMove as EventListener, { passive: false });
      target.addEventListener('touchend', finishPinch as EventListener, { passive: true });
      target.addEventListener('touchcancel', finishPinch as EventListener, { passive: true });
      target.addEventListener('wheel', onWheel as EventListener, { passive: false });

      return () => {
        if (pendingPinchFrame !== null) {
          window.cancelAnimationFrame(pendingPinchFrame);
        }
        target.removeEventListener('touchstart', onTouchStart as EventListener);
        target.removeEventListener('touchmove', onTouchMove as EventListener);
        target.removeEventListener('touchend', finishPinch as EventListener);
        target.removeEventListener('touchcancel', finishPinch as EventListener);
        target.removeEventListener('wheel', onWheel as EventListener);
      };
    },
    [applyVisualZoomFrame, applyZoomCentered, commitZoomToReact]
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    return attachPinchAndWheelListeners(viewport, false);
  }, [attachPinchAndWheelListeners]);

  const handleIframeLoad = () => {
    cleanupDocListenersRef.current?.();
    cleanupDocListenersRef.current = null;

    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) return;

    const availableWidth = viewportRef.current
      ? Math.max(240, viewportRef.current.clientWidth - 28)
      : 960;
    const measuredWidth = Math.max(
      availableWidth,
      doc.documentElement?.scrollWidth || 0,
      doc.body?.scrollWidth || 0
    );
    const measuredHeight = Math.max(
      640,
      (doc.documentElement?.scrollHeight || doc.body?.scrollHeight || 720) + 24
    );
    setDocSize({ width: measuredWidth, height: measuredHeight });

    const computedFitZoom = clampPreviewZoom(Math.min(1, availableWidth / measuredWidth));
    setFitZoom(computedFitZoom);

    if (initializedContentRef.current !== htmlContent) {
      initializedContentRef.current = htmlContent;
      zoomRef.current = computedFitZoom;
      setZoom(computedFitZoom);
      if (viewportRef.current) {
        viewportRef.current.scrollLeft = 0;
        viewportRef.current.scrollTop = 0;
      }
    }

    if (doc.documentElement) {
      doc.documentElement.style.touchAction = 'pan-x pan-y';
    }
    cleanupDocListenersRef.current = attachPinchAndWheelListeners(doc, true);
  };

  const dismissFileActionError = useCallback(() => {
    setFileActionError(null);
    if (lastFileToastIdRef.current) {
      dismissAsyncErrorToast(lastFileToastIdRef.current);
      lastFileToastIdRef.current = null;
    }
  }, []);

  const executeFileAction = async (
    action: PrintPreviewFileActionKind,
    task: () => Promise<unknown>,
    overrideFilename?: string
  ) => {
    if (fileActionInFlightRef.current) return;
    fileActionInFlightRef.current = true;
    await runPrintPreviewFileAction({
      action,
      filename: overrideFilename || filename,
      task,
      isMounted: () => isMountedRef.current,
      onBeforeStart: () => {
        dismissFileActionError();
        setFileActionBusy(action);
      },
      onError: (formatted, toastId) => {
        lastFileToastIdRef.current = toastId;
        setFileActionError(formatted);
      },
      onFinish: () => {
        fileActionInFlightRef.current = false;
        if (isMountedRef.current) {
          setFileActionBusy(null);
        }
      },
    });
  };

  const handleDownloadHtm = () =>
    executeFileAction('download', () => downloadTextFile(filename, htmlContent, 'text/html'));

  const pdfFilename = useMemo(
    () =>
      filename.toLowerCase().endsWith('.pdf')
        ? filename
        : `${filename.replace(/\.html?$/i, '')}.pdf`,
    [filename]
  );

  const handleDownloadPdf = () => {
    if (!onDownloadPdf) return;
    return executeFileAction('pdf', onDownloadPdf, pdfFilename);
  };

  const effectiveBreederLogoUrl = useMemo(
    () =>
      sanitizeSafeRasterImageDataUrl(
        pedigreePrintOptions?.breederLogoDataUrl !== undefined
          ? pedigreePrintOptions.breederLogoDataUrl
          : breederLogoDataUrl
      ),
    [pedigreePrintOptions?.breederLogoDataUrl, breederLogoDataUrl]
  );

  const handleUploadPreviewLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onChangePedigreePrintOptions || !pedigreePrintOptions) return;
    dismissFileActionError();
    setLogoUploading(true);
    try {
      const optimized = await optimizeImageFile(file, 'compact');
      const nextUrl = sanitizeSafeRasterImageDataUrl(
        optimized.thumbnailDataUrl || optimized.dataUrl
      );
      if (!nextUrl) {
        throw new Error('Could not process the selected logo image.');
      }
      onUpdateBreederLogo?.(nextUrl);
      onChangePedigreePrintOptions({
        ...pedigreePrintOptions,
        showBreederLogo: true,
        breederLogoDataUrl: nextUrl,
      });
    } catch (err) {
      if (isMountedRef.current) {
        setFileActionError({
          action: 'download',
          title: 'Could Not Load Barn Logo',
          detail:
            err instanceof Error
              ? err.message
              : 'Please select a valid PNG, JPG, or WebP logo image.',
        });
      }
    } finally {
      if (isMountedRef.current) {
        setLogoUploading(false);
      }
    }
  };

  const canShareHtml = useMemo(() => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
    if (typeof navigator.canShare !== 'function') return false;
    try {
      const probe = new File(['<html></html>'], filename, { type: 'text/html' });
      return navigator.canShare({ files: [probe] });
    } catch {
      return false;
    }
  }, [filename]);

  const handleShareHtm = () =>
    executeFileAction('share', () =>
      shareTextFileOrDownload({
        filename,
        content: htmlContent,
        mimeType: 'text/html',
        title,
      })
    );

  const handlePrint = () => {
    setPrintBlockedMessage(null);
    cleanupPrintStageRef.current?.();
    cleanupPrintStageRef.current = null;
    if (printFallbackTimerRef.current !== null) {
      window.clearTimeout(printFallbackTimerRef.current);
      printFallbackTimerRef.current = null;
    }
    if (printSafetyTimerRef.current !== null) {
      window.clearTimeout(printSafetyTimerRef.current);
      printSafetyTimerRef.current = null;
    }

    const parsedFallback = new DOMParser().parseFromString(htmlContent, 'text/html');
    const sourceDoc = iframeRef.current?.contentDocument ?? parsedFallback;
    const bodyHtml = sourceDoc.body?.innerHTML || parsedFallback.body?.innerHTML || '';
    const docTitle = sourceDoc.title || parsedFallback.title || title;

    const pageRules: string[] = [];
    const scopedRules: string[] = [];

    const scopeSelectorList = (selectorText: string) =>
      selectorText
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((sel) => {
          if (/^(html|body)$/i.test(sel)) return '#barn-print-stage';
          if (/^(html|body)\s+/i.test(sel)) {
            return `#barn-print-stage ${sel.replace(/^(html|body)\s+/i, '')}`;
          }
          return `#barn-print-stage ${sel}`;
        })
        .join(', ');

    try {
      const sheets = Array.from(sourceDoc.styleSheets || []);
      for (const sheet of sheets) {
        const rules = Array.from(sheet.cssRules || []);
        for (const rule of rules) {
          if (rule.type === 6 || rule.cssText.trimStart().startsWith('@page')) {
            pageRules.push(rule.cssText);
          } else if (rule.type === 1) {
            const styleRule = rule as CSSStyleRule;
            const scoped = scopeSelectorList(styleRule.selectorText);
            if (scoped) {
              scopedRules.push(`${scoped} { ${styleRule.style.cssText} }`);
            }
          }
        }
      }
    } catch {
      // Fallback to raw <style> text below
    }

    if (scopedRules.length === 0) {
      const rawCss = Array.from(parsedFallback.querySelectorAll('style'))
        .map((el) => el.textContent || '')
        .join('\n');
      const extractedPages = rawCss.match(/@page\s*\{[^}]*\}/gi) || [];
      pageRules.push(...extractedPages);
      const withoutPage = rawCss.replace(/@page\s*\{[^}]*\}/gi, '');
      const rewritten = withoutPage.replace(/(^|[\s,}])(html|body)(?=[\s,{])/gi, '$1#barn-print-stage');
      scopedRules.push(rewritten);
    }

    const stageEl = document.createElement('div');
    stageEl.id = 'barn-print-stage';
    stageEl.setAttribute('aria-hidden', 'true');
    stageEl.innerHTML = bodyHtml;

    const preserveAccentInk = Boolean(
      sourceDoc.querySelector('meta[name="barn-preserve-accent-ink"][content="true"]') ??
        parsedFallback.querySelector('meta[name="barn-preserve-accent-ink"][content="true"]')
    );

    const styleEl = document.createElement('style');
    styleEl.id = 'barn-print-stage-style';
    styleEl.textContent = `
      ${pageRules.join('\n')}
      @media screen {
        #barn-print-stage { display: none !important; }
      }
      @media print {
        :root, .dark, html, body, #root, #barn-print-stage {
          color-scheme: light only !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          background-color: #ffffff !important;
          ${preserveAccentInk ? '' : 'color: #000000 !important;'}
          -webkit-print-color-adjust: ${preserveAccentInk ? 'exact' : 'economy'} !important;
          print-color-adjust: ${preserveAccentInk ? 'exact' : 'economy'} !important;
        }
        body > *:not(#barn-print-stage) {
          display: none !important;
        }
        #barn-print-stage {
          display: block !important;
          width: auto !important;
          box-sizing: border-box !important;
        }
        ${scopedRules.join('\n')}
        #barn-print-stage,
        #barn-print-stage div,
        #barn-print-stage section,
        #barn-print-stage article,
        #barn-print-stage figure,
        #barn-print-stage table,
        #barn-print-stage thead,
        #barn-print-stage tbody,
        #barn-print-stage tr,
        #barn-print-stage th,
        #barn-print-stage td {
          background: #ffffff !important;
          background-color: #ffffff !important;
          ${preserveAccentInk ? '' : 'color: #000000 !important;'}
          box-shadow: none !important;
        }
      }
    `;

    const prevTitle = document.title;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (printSafetyTimerRef.current !== null) {
        window.clearTimeout(printSafetyTimerRef.current);
        printSafetyTimerRef.current = null;
      }
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', cleanup);
      styleEl.remove();
      stageEl.remove();
      if (docTitle && document.title === docTitle) {
        document.title = prevTitle;
      }
      if (cleanupPrintStageRef.current === cleanup) {
        cleanupPrintStageRef.current = null;
      }
    };

    let printEventFired = false;
    const onBeforePrint = () => {
      printEventFired = true;
      if (printFallbackTimerRef.current !== null) {
        window.clearTimeout(printFallbackTimerRef.current);
        printFallbackTimerRef.current = null;
      }
    };

    cleanupPrintStageRef.current = cleanup;
    window.addEventListener('beforeprint', onBeforePrint, { once: true });
    window.addEventListener('afterprint', cleanup, { once: true });

    document.head.appendChild(styleEl);
    document.body.appendChild(stageEl);
    if (docTitle) {
      document.title = docTitle;
    }

    if (pedigreeBridge.isNativeWrapper()) {
      const dispatched = pedigreeBridge.requestPrint();
      if (!dispatched) {
        cleanup();
        setPrintBlockedMessage(
          'Native print could not be started on this device. Use Download .HTM (or Share) below to save or export as PDF.'
        );
        return;
      }
      // Keep #barn-print-stage mounted while Android PrintManager snapshots the WebView DOM.
      printSafetyTimerRef.current = window.setTimeout(cleanup, 120000);
      return;
    }

    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let printThrew = false;
    try {
      window.focus();
      window.print();
    } catch {
      printThrew = true;
    }
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;

    if (printThrew) {
      cleanup();
      setPrintBlockedMessage(
        'This browser or embedded preview blocked the print dialog. Use Download .HTM below to save and print or export to PDF from your browser.'
      );
      return;
    }

    if (!printEventFired && elapsed < 120) {
      printFallbackTimerRef.current = window.setTimeout(() => {
        printFallbackTimerRef.current = null;
        if (!printEventFired) {
          cleanup();
          setPrintBlockedMessage(
            'This embedded preview frame blocked the system print dialog. Use Download .HTM (or Share) to open the file in Chrome/Safari and print or save as PDF.'
          );
        }
      }, 450);
    } else {
      // Safety net in case afterprint does not fire in some WebViews
      printSafetyTimerRef.current = window.setTimeout(cleanup, 120000);
    }
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
    >
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-5xl h-[92dvh] sm:h-[88vh] max-h-full flex flex-col overflow-hidden shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 px-3 sm:px-5 py-3 border-b border-[var(--barn-border)] min-w-0">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <h2 className="text-sm sm:text-base font-semibold truncate min-w-0">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="lg:hidden shrink-0 min-h-[38px] min-w-[38px] rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 min-w-0 w-full lg:w-auto lg:justify-end">
            {onToggleIncludePrimaryPhoto && (
              <label className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-medium inline-flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={Boolean(includePrimaryPhoto)}
                  onChange={(e) => onToggleIncludePrimaryPhoto(e.target.checked)}
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>Include Primary Photo</span>
              </label>
            )}

            {onToggleIncludeCageCardQr && (
              <label className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-medium inline-flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={Boolean(includeCageCardQr)}
                  onChange={(e) => onToggleIncludeCageCardQr(e.target.checked)}
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>QR Profile Code</span>
              </label>
            )}

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => applyZoomCentered(zoom - 0.15)}
                aria-label="Zoom out preview"
                className="min-h-[38px] min-w-[38px] rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                ref={zoomLabelRef}
                onClick={() => {
                  const target = Math.abs(zoom - 1) < 0.02 && fitZoom < 0.99 ? fitZoom : 1;
                  applyZoomCentered(target);
                }}
                title={fitZoom < 0.99 ? 'Toggle fit width / 100%' : 'Reset preview zoom to 100%'}
                className="min-h-[38px] px-2.5 rounded-lg border border-[var(--barn-border)] text-xs font-mono tabular-nums hover:bg-[var(--barn-subtle)]"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => applyZoomCentered(zoom + 0.15)}
                aria-label="Zoom in preview"
                className="min-h-[38px] min-w-[38px] rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleShareHtm}
              disabled={!canShareHtml || fileActionBusy !== null}
              aria-busy={fileActionBusy === 'share'}
              aria-describedby={!canShareHtml ? shareReasonId : undefined}
              title={
                canShareHtml
                  ? 'Share .HTM file using your device share sheet'
                  : 'Native file sharing is unavailable in this browser — use Download .HTM instead.'
              }
              className={`min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                canShareHtml && fileActionBusy === null
                  ? 'hover:bg-[var(--barn-subtle)]'
                  : 'bg-[var(--barn-canvas)] text-[var(--barn-muted)] opacity-55 cursor-not-allowed'
              }`}
            >
              {fileActionBusy === 'share' ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Share2 className="w-4 h-4" aria-hidden="true" />
              )}
              {fileActionBusy === 'share' ? 'Sharing...' : 'Share .HTM'}
            </button>
            {!canShareHtml && (
              <span id={shareReasonId} className="sr-only">
                Native file sharing is unavailable in this browser — use Download .HTM instead.
              </span>
            )}
            <button
              type="button"
              onClick={handleDownloadHtm}
              disabled={fileActionBusy !== null}
              aria-busy={fileActionBusy === 'download'}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                fileActionBusy === null
                  ? 'hover:bg-[var(--barn-subtle)]'
                  : 'opacity-60 cursor-not-allowed'
              }`}
            >
              {fileActionBusy === 'download' ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="w-4 h-4" aria-hidden="true" />
              )}
              {fileActionBusy === 'download' ? 'Saving...' : 'Download .HTM'}
            </button>
            {onDownloadPdf && (
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={fileActionBusy !== null}
                aria-busy={fileActionBusy === 'pdf'}
                title="Generate and download a 100% offline .PDF file directly"
                className={`min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                  fileActionBusy === null
                    ? 'hover:bg-[var(--barn-subtle)]'
                    : 'opacity-60 cursor-not-allowed'
                }`}
              >
                {fileActionBusy === 'pdf' ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <FileDown className="w-4 h-4" aria-hidden="true" />
                )}
                {fileActionBusy === 'pdf' ? 'Building PDF...' : 'Download .PDF'}
              </button>
            )}
            {plainTextSummary && (
              <button
                type="button"
                onClick={async () => {
                  dismissFileActionError();
                  try {
                    const copyMode = await copyTextWithFallback(plainTextSummary);
                    if (copyMode === 'unsupported') {
                      if (isMountedRef.current) {
                        setFileActionError({
                          action: 'share',
                          title: 'Could Not Copy Summary',
                          detail:
                            'Clipboard access is blocked or unavailable in this browser. Use Download .HTM or Print / Save PDF instead.',
                        });
                      }
                      return;
                    }
                    if (isMountedRef.current) {
                      setCopiedSummary(true);
                      if (copiedSummaryTimerRef.current !== null) {
                        window.clearTimeout(copiedSummaryTimerRef.current);
                      }
                      copiedSummaryTimerRef.current = window.setTimeout(() => {
                        copiedSummaryTimerRef.current = null;
                        if (isMountedRef.current) setCopiedSummary(false);
                      }, 1800);
                    }
                  } catch (err: unknown) {
                    const detail =
                      err instanceof Error && err.message.trim()
                        ? err.message.trim()
                        : 'Clipboard permission denied.';
                    logDiagnosticEvent({
                      level: 'warn',
                      category: 'storage',
                      message: `Could not copy print preview summary: ${detail}`,
                      error: err,
                    });
                    if (isMountedRef.current) {
                      setFileActionError({
                        action: 'share',
                        title: 'Could Not Copy Summary',
                        detail: `${detail} Use Download .HTM or Print / Save PDF instead.`,
                      });
                    }
                  }
                }}
                title="Copy plain-text summary for email or messaging"
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                {copiedSummary ? (
                  <Check className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                ) : (
                  <Copy className="w-4 h-4" aria-hidden="true" />
                )}
                {copiedSummary ? 'Copied Summary' : 'Copy Text'}
              </button>
            )}
            {mailtoUrl && (
              <a
                href={mailtoUrl}
                title="Compose email with pre-filled show entry summary"
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Mail className="w-4 h-4" aria-hidden="true" />
                Email Entry
              </a>
            )}
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 transition-opacity inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Printer className="w-4 h-4" aria-hidden="true" />
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="hidden lg:flex shrink-0 min-h-[38px] min-w-[38px] rounded-lg hover:bg-[var(--barn-subtle)] items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {pedigreePrintOptions && onChangePedigreePrintOptions && (
          <div className="px-3 sm:px-5 py-2 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/75 flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs">
            {onChangePedigreeDocMode && (
              <div
                role="group"
                aria-label="Pedigree export format"
                className="inline-flex items-center p-0.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)]"
              >
                <button
                  type="button"
                  aria-pressed={pedigreeDocMode === 'formal_certificate'}
                  onClick={() => onChangePedigreeDocMode('formal_certificate')}
                  className={`min-h-[28px] px-2.5 py-0.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                    pedigreeDocMode === 'formal_certificate'
                      ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold'
                      : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  Formal Certificate
                </button>
                <button
                  type="button"
                  aria-pressed={pedigreeDocMode === 'shareable_card'}
                  onClick={() => onChangePedigreeDocMode('shareable_card')}
                  className={`min-h-[28px] px-2.5 py-0.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                    pedigreeDocMode === 'shareable_card'
                      ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold'
                      : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  Shareable Card (.HTML)
                </button>
              </div>
            )}

            {pedigreeDocMode !== 'shareable_card' && (
              <div
                role="group"
                aria-label="Page orientation"
                className="inline-flex items-center p-0.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)]"
              >
                <button
                  type="button"
                  aria-pressed={(pedigreePrintOptions.orientation ?? 'landscape') === 'landscape'}
                  onClick={() =>
                    onChangePedigreePrintOptions({
                      ...pedigreePrintOptions,
                      orientation: 'landscape',
                    })
                  }
                  className={`min-h-[28px] px-2.5 py-0.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                    (pedigreePrintOptions.orientation ?? 'landscape') === 'landscape'
                      ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold'
                      : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  Landscape (11&times;8.5)
                </button>
                <button
                  type="button"
                  aria-pressed={pedigreePrintOptions.orientation === 'portrait'}
                  onClick={() =>
                    onChangePedigreePrintOptions({
                      ...pedigreePrintOptions,
                      orientation: 'portrait',
                    })
                  }
                  className={`min-h-[28px] px-2.5 py-0.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                    pedigreePrintOptions.orientation === 'portrait'
                      ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold'
                      : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  Portrait (8.5&times;11)
                </button>
              </div>
            )}

            <label className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-[11px] font-medium text-[var(--barn-muted)]">Colors:</span>
              <select
                aria-label="Pedigree print color preset"
                value={pedigreePrintOptions.colorPreset ?? 'classic_sage'}
                onChange={(e) =>
                  onChangePedigreePrintOptions({
                    ...pedigreePrintOptions,
                    colorPreset: e.target.value as PedigreeColorPresetId,
                  })
                }
                className="min-h-[28px] px-2 py-0.5 rounded-md border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium"
              >
                {PEDIGREE_COLOR_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-[11px] font-medium text-[var(--barn-muted)]">Border:</span>
              <select
                aria-label="Pedigree border style"
                value={pedigreePrintOptions.borderStyle ?? 'classic_rule'}
                onChange={(e) =>
                  onChangePedigreePrintOptions({
                    ...pedigreePrintOptions,
                    borderStyle: e.target.value as PedigreeBorderStyleId,
                  })
                }
                className="min-h-[28px] px-2 py-0.5 rounded-md border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium"
              >
                {PEDIGREE_BORDER_STYLES.map((styleSpec) => (
                  <option key={styleSpec.id} value={styleSpec.id}>
                    {styleSpec.label}
                  </option>
                ))}
              </select>
            </label>

            {pedigreeDocMode !== 'shareable_card' && (
              <label className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-[11px] font-medium text-[var(--barn-muted)]">Layout:</span>
                <select
                  aria-label="Pedigree layout preset"
                  value={pedigreePrintOptions.layoutPreset ?? 'evans_standard'}
                  onChange={(e) =>
                    onChangePedigreePrintOptions({
                      ...pedigreePrintOptions,
                      layoutPreset: e.target.value as PedigreeLayoutPresetId,
                    })
                  }
                  className="min-h-[28px] px-2 py-0.5 rounded-md border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium"
                >
                  {PEDIGREE_LAYOUT_PRESETS.map((layoutSpec) => (
                    <option key={layoutSpec.id} value={layoutSpec.id}>
                      {layoutSpec.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="inline-flex flex-wrap items-center gap-1">
              {PEDIGREE_QUICK_STYLE_PRESETS.map((qp) => {
                const isActive =
                  (pedigreePrintOptions.colorPreset ?? 'classic_sage') === qp.colorPreset &&
                  (pedigreePrintOptions.borderStyle ?? 'classic_rule') === qp.borderStyle &&
                  (pedigreePrintOptions.layoutPreset ?? 'evans_standard') === qp.layoutPreset;
                return (
                  <button
                    key={qp.id}
                    type="button"
                    title={qp.description}
                    onClick={() =>
                      onChangePedigreePrintOptions({
                        ...pedigreePrintOptions,
                        colorPreset: qp.colorPreset,
                        borderStyle: qp.borderStyle,
                        layoutPreset: qp.layoutPreset,
                      })
                    }
                    className={`min-h-[26px] px-2 py-0.5 rounded-md border text-[10.5px] font-medium whitespace-nowrap transition-colors ${
                      isActive
                        ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)] text-[var(--barn-ink)] font-semibold'
                        : 'border-[var(--barn-border)] bg-[var(--barn-surface)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                    }`}
                  >
                    {qp.label}
                  </button>
                );
              })}
            </div>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={pedigreePrintOptions.showWeights ?? true}
                onChange={(e) =>
                  onChangePedigreePrintOptions({
                    ...pedigreePrintOptions,
                    showWeights: e.target.checked,
                  })
                }
                className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
              />
              <span>Show Weights</span>
            </label>

            {(pedigreePrintOptions.showWeights ?? true) && (
              <label
                title="Display weights in traditional ARBA lbs.oz dot format (e.g., 10.04)"
                className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap"
              >
                <input
                  type="checkbox"
                  checked={Boolean(pedigreePrintOptions.arbaLbsOzDotNotation)}
                  onChange={(e) =>
                    onChangePedigreePrintOptions({
                      ...pedigreePrintOptions,
                      arbaLbsOzDotNotation: e.target.checked,
                    })
                  }
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>ARBA lbs.oz (10.04)</span>
              </label>
            )}

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={pedigreePrintOptions.showGenotypes ?? false}
                onChange={(e) =>
                  onChangePedigreePrintOptions({
                    ...pedigreePrintOptions,
                    showGenotypes: e.target.checked,
                  })
                }
                className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
              />
              <span>Include Coat Genotypes (Unverified · Under Dev)</span>
            </label>

            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleUploadPreviewLogo}
              className="sr-only"
              aria-label="Upload breeder logo for pedigree header"
            />
            {effectiveBreederLogoUrl ? (
              <div className="inline-flex items-center gap-1.5">
                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={pedigreePrintOptions.showBreederLogo ?? true}
                    onChange={(e) =>
                      onChangePedigreePrintOptions({
                        ...pedigreePrintOptions,
                        showBreederLogo: e.target.checked,
                      })
                    }
                    className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                  />
                  <span>Show Barn Logo</span>
                </label>
                {onUpdateBreederLogo && (
                  <>
                    <button
                      type="button"
                      disabled={logoUploading}
                      onClick={() => logoInputRef.current?.click()}
                      className="min-h-[28px] px-2 py-0.5 rounded-md border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium whitespace-nowrap"
                    >
                      {logoUploading ? 'Loading...' : 'Change Logo'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateBreederLogo(undefined);
                        onChangePedigreePrintOptions({
                          ...pedigreePrintOptions,
                          showBreederLogo: false,
                          breederLogoDataUrl: '',
                        });
                      }}
                      aria-label="Remove barn logo"
                      className="min-h-[28px] px-2 py-0.5 rounded-md border border-[var(--barn-border)] hover:bg-[var(--barn-danger)]/10 text-[11px] font-medium text-[var(--barn-danger)] whitespace-nowrap"
                    >
                      Clear Logo
                    </button>
                  </>
                )}
              </div>
            ) : (
              onUpdateBreederLogo && (
                <button
                  type="button"
                  disabled={logoUploading}
                  onClick={() => logoInputRef.current?.click()}
                  className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  {logoUploading ? 'Loading Logo...' : 'Upload Barn Logo'}
                </button>
              )
            )}

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={pedigreePrintOptions.showBreederFooter ?? true}
                onChange={(e) =>
                  onChangePedigreePrintOptions({
                    ...pedigreePrintOptions,
                    showBreederFooter: e.target.checked,
                  })
                }
                className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
              />
              <span>Breeder Signature Footer</span>
            </label>

            {(pedigreePrintOptions.showBreederFooter ?? true) && (
              <input
                type="text"
                value={pedigreePrintOptions.breederContactLine ?? ''}
                onChange={(e) =>
                  onChangePedigreePrintOptions({
                    ...pedigreePrintOptions,
                    breederContactLine: e.target.value,
                  })
                }
                placeholder="Optional breeder website or contact footer line..."
                aria-label="Optional breeder website or contact footer line"
                className="flex-1 min-w-[200px] min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs text-[var(--barn-ink)] placeholder:text-[var(--barn-muted)]"
              />
            )}
          </div>
        )}

        {binderPrintOptions && onChangeBinderPrintOptions && (
          <div className="px-3 sm:px-5 py-2.5 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/80 space-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Color vs Ink Saver Mode (Paper is always locked #FFFFFF) */}
              <div
                role="group"
                aria-label="Binder color mode"
                className="inline-flex items-center p-0.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)]"
              >
                <button
                  type="button"
                  aria-pressed={binderPrintOptions.colorMode === 'color'}
                  onClick={() =>
                    onChangeBinderPrintOptions({ ...binderPrintOptions, colorMode: 'color' })
                  }
                  className={`min-h-[30px] px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                    binderPrintOptions.colorMode === 'color'
                      ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold'
                      : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  Barn Colors (White Paper)
                </button>
                <button
                  type="button"
                  aria-pressed={binderPrintOptions.colorMode === 'ink_saver'}
                  onClick={() =>
                    onChangeBinderPrintOptions({ ...binderPrintOptions, colorMode: 'ink_saver' })
                  }
                  className={`min-h-[30px] px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                    binderPrintOptions.colorMode === 'ink_saver'
                      ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold'
                      : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  Ink Saver (B&amp;W)
                </button>
              </div>

              {/* Active Default vs Full Archive Toggle */}
              <label className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={binderPrintOptions.includeArchived}
                  onChange={(e) =>
                    onChangeBinderPrintOptions({
                      ...binderPrintOptions,
                      includeArchived: e.target.checked,
                    })
                  }
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>
                  Include Archived / Sold / Deceased
                  {binderArchivedCount > 0 ? ` (${binderArchivedCount})` : ''}
                </span>
              </label>

              {/* Pedigree Depth */}
              <div
                role="group"
                aria-label="Binder pedigree depth"
                className="inline-flex items-center gap-1 p-0.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)]"
              >
                <span className="px-1.5 text-[11px] text-[var(--barn-muted)]">Pedigree:</span>
                {([3, 4, 5, 6] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={binderPrintOptions.generations === g}
                    onClick={() =>
                      onChangeBinderPrintOptions({ ...binderPrintOptions, generations: g })
                    }
                    className={`min-h-[28px] px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold transition-colors ${
                      binderPrintOptions.generations === g
                        ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                        : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                    }`}
                  >
                    {g}G
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={binderPrintOptions.includeCoverAndSignature}
                  onChange={(e) =>
                    onChangeBinderPrintOptions({
                      ...binderPrintOptions,
                      includeCoverAndSignature: e.target.checked,
                    })
                  }
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>Cover &amp; Signature Page</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={binderPrintOptions.includeSpeciesOverview}
                  onChange={(e) =>
                    onChangeBinderPrintOptions({
                      ...binderPrintOptions,
                      includeSpeciesOverview: e.target.checked,
                    })
                  }
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>Index, Schedule, Cages &amp; Memo</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={binderPrintOptions.includePhotos}
                  onChange={(e) =>
                    onChangeBinderPrintOptions({
                      ...binderPrintOptions,
                      includePhotos: e.target.checked,
                    })
                  }
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>Photos &amp; Captions</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={binderPrintOptions.includeHealthAndLitters}
                  onChange={(e) =>
                    onChangeBinderPrintOptions({
                      ...binderPrintOptions,
                      includeHealthAndLitters: e.target.checked,
                    })
                  }
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>Medical &amp; Litters</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={binderPrintOptions.includeShowsAndKinship}
                  onChange={(e) =>
                    onChangeBinderPrintOptions({
                      ...binderPrintOptions,
                      includeShowsAndKinship: e.target.checked,
                    })
                  }
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>Shows, Reg # &amp; Relatives</span>
              </label>

              {binderPrintOptions.includeCoverAndSignature && (
                <input
                  type="text"
                  value={binderPrintOptions.breederTransferNote ?? ''}
                  onChange={(e) =>
                    onChangeBinderPrintOptions({
                      ...binderPrintOptions,
                      breederTransferNote: e.target.value,
                    })
                  }
                  placeholder="Optional breeder contact / sale transfer note..."
                  aria-label="Optional breeder contact or sale transfer note"
                  className="flex-1 min-w-[210px] min-h-[30px] px-2.5 py-0.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs text-[var(--barn-ink)] placeholder:text-[var(--barn-muted)]"
                />
              )}
            </div>
          </div>
        )}

        {batchPrintOptions && onChangeBatchPrintOptions && (() => {
          const activeSpec = getBatchPrintLayoutSpec(batchPrintOptions.layout);
          const showCutLinesToggle =
            activeSpec.supportsCutLines &&
            !(
              batchPrintOptions.layout === 'photo_cards_4x6' &&
              batchPrintOptions.photoCardPaperMode === 'photo_4x6'
            );

          return (
            <div className="px-3 sm:px-5 py-2.5 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/80 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  role="group"
                  aria-label="Batch print layout"
                  className="inline-flex flex-wrap items-center p-0.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] gap-0.5"
                >
                  {BATCH_PRINT_LAYOUTS.map((spec) => (
                    <button
                      key={spec.id}
                      type="button"
                      aria-pressed={batchPrintOptions.layout === spec.id}
                      title={spec.description}
                      onClick={() =>
                        onChangeBatchPrintOptions({
                          ...batchPrintOptions,
                          layout: spec.id,
                        })
                      }
                      className={`min-h-[30px] px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                        batchPrintOptions.layout === spec.id
                          ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold'
                          : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                      }`}
                    >
                      {spec.shortLabel}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 font-mono tabular-nums text-[11px] text-[var(--barn-muted)]">
                  <span>
                    {batchAnimalCount} animal{batchAnimalCount === 1 ? '' : 's'} &middot;{' '}
                    {batchPageCount} page{batchPageCount === 1 ? '' : 's'}
                  </span>
                  {batchPhotoHydrating && (
                    <span className="inline-flex items-center gap-1 text-[var(--barn-sage)] font-sans">
                      <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                      Loading photos...
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
                {activeSpec.supportsGenerations && (
                  <div
                    role="group"
                    aria-label="Batch pedigree depth"
                    className="inline-flex items-center gap-1 p-0.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)]"
                  >
                    <span className="px-1.5 text-[11px] text-[var(--barn-muted)]">Depth:</span>
                    {([3, 4, 5, 6] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        aria-pressed={batchPrintOptions.generations === g}
                        onClick={() =>
                          onChangeBatchPrintOptions({
                            ...batchPrintOptions,
                            generations: g,
                          })
                        }
                        className={`min-h-[26px] px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold transition-colors ${
                          batchPrintOptions.generations === g
                            ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                            : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                        }`}
                      >
                        {g}G
                      </button>
                    ))}
                  </div>
                )}

                {activeSpec.supportsPaperMode && (
                  <div
                    role="group"
                    aria-label="4x6 photo card paper layout"
                    className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)]"
                  >
                    <button
                      type="button"
                      aria-pressed={batchPrintOptions.photoCardPaperMode === 'letter_2up'}
                      onClick={() =>
                        onChangeBatchPrintOptions({
                          ...batchPrintOptions,
                          photoCardPaperMode: 'letter_2up',
                        })
                      }
                      className={`min-h-[26px] px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                        batchPrintOptions.photoCardPaperMode === 'letter_2up'
                          ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] font-semibold'
                          : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                      }`}
                    >
                      2-Up Letter Sheet
                    </button>
                    <button
                      type="button"
                      aria-pressed={batchPrintOptions.photoCardPaperMode === 'photo_4x6'}
                      onClick={() =>
                        onChangeBatchPrintOptions({
                          ...batchPrintOptions,
                          photoCardPaperMode: 'photo_4x6',
                        })
                      }
                      className={`min-h-[26px] px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                        batchPrintOptions.photoCardPaperMode === 'photo_4x6'
                          ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] font-semibold'
                          : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                      }`}
                    >
                      Direct 4×6 Paper
                    </button>
                  </div>
                )}

                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={batchPrintOptions.includePhotos}
                    onChange={(e) =>
                      onChangeBatchPrintOptions({
                        ...batchPrintOptions,
                        includePhotos: e.target.checked,
                      })
                    }
                    className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                  />
                  <span>Include Photos</span>
                </label>

                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={batchPrintOptions.showWeights}
                    onChange={(e) =>
                      onChangeBatchPrintOptions({
                        ...batchPrintOptions,
                        showWeights: e.target.checked,
                      })
                    }
                    className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                  />
                  <span>Show Weights</span>
                </label>

                {activeSpec.supportsQrCode && (
                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={batchPrintOptions.includeQrCodes}
                      onChange={(e) =>
                        onChangeBatchPrintOptions({
                          ...batchPrintOptions,
                          includeQrCodes: e.target.checked,
                        })
                      }
                      className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                    />
                    <span>QR Profile Codes</span>
                  </label>
                )}

                {showCutLinesToggle && (
                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={batchPrintOptions.includeCutLines}
                      onChange={(e) =>
                        onChangeBatchPrintOptions({
                          ...batchPrintOptions,
                          includeCutLines: e.target.checked,
                        })
                      }
                      className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                    />
                    <span>Cut Guides</span>
                  </label>
                )}

                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={batchPrintOptions.showGenotypes}
                    onChange={(e) =>
                      onChangeBatchPrintOptions({
                        ...batchPrintOptions,
                        showGenotypes: e.target.checked,
                      })
                    }
                    className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                  />
                  <span>Include Coat Genotypes (Unverified · Under Dev)</span>
                </label>

                {activeSpec.supportsBreederFooter && (
                  <>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={batchPrintOptions.showBreederFooter}
                        onChange={(e) =>
                          onChangeBatchPrintOptions({
                            ...batchPrintOptions,
                            showBreederFooter: e.target.checked,
                          })
                        }
                        className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                      />
                      <span>Breeder Footer</span>
                    </label>

                    {batchPrintOptions.showBreederFooter && (
                      <input
                        type="text"
                        value={batchPrintOptions.breederContactLine}
                        onChange={(e) =>
                          onChangeBatchPrintOptions({
                            ...batchPrintOptions,
                            breederContactLine: e.target.value,
                          })
                        }
                        placeholder="Optional breeder website or contact footer line..."
                        aria-label="Optional breeder website or contact footer line"
                        className="flex-1 min-w-[200px] min-h-[30px] px-2.5 py-0.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs text-[var(--barn-ink)] placeholder:text-[var(--barn-muted)]"
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {extraToolbarContent && (
          <div className="px-3 sm:px-5 py-2.5 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/75 text-xs">
            {extraToolbarContent}
          </div>
        )}

        {(headerNotice ||
          pedigreePrintOptions?.showGenotypes ||
          binderPrintOptions ||
          batchPrintOptions?.showGenotypes) && (
          <div className="px-3 sm:px-5 py-2 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/60 flex flex-wrap items-center gap-2">
            {headerNotice}
            {(pedigreePrintOptions?.showGenotypes ||
              binderPrintOptions ||
              batchPrintOptions?.showGenotypes) && <ColorGeneticsNotice compact />}
          </div>
        )}

        {fileActionError && (
          <div
            role="alert"
            aria-live="assertive"
            className="px-3 sm:px-5 py-2.5 bg-[var(--barn-danger)]/10 border-b border-[var(--barn-danger)]/40 flex items-start justify-between gap-2 text-xs text-[var(--barn-ink)]"
          >
            <div className="flex items-start gap-2 min-w-0">
              <ShieldAlert
                className="w-4 h-4 shrink-0 mt-0.5 text-[var(--barn-danger)]"
                aria-hidden="true"
              />
              <div className="min-w-0 space-y-0.5">
                <div className="font-semibold">{fileActionError.title}</div>
                <p className="leading-snug text-[var(--barn-muted)] break-words">
                  {fileActionError.detail}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={dismissFileActionError}
              aria-label="Dismiss file export error"
              className="shrink-0 min-h-[32px] min-w-[32px] rounded-md hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {printBlockedMessage && (
          <div
            role="status"
            className="px-3 sm:px-5 py-2.5 bg-[var(--barn-terracotta-tint)] border-b border-[var(--barn-border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-[var(--barn-ink)]"
          >
            <div className="flex items-start justify-between gap-2 min-w-0 flex-1">
              <div className="flex items-start gap-2 min-w-0">
                <AlertCircle
                  className="w-4 h-4 shrink-0 mt-0.5 text-[var(--barn-terracotta)]"
                  aria-hidden="true"
                />
                <span className="leading-snug">{printBlockedMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setPrintBlockedMessage(null)}
                aria-label="Dismiss print notice"
                className="sm:hidden shrink-0 min-h-[28px] min-w-[28px] rounded-md hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0 pl-6 sm:pl-0">
              <button
                type="button"
                disabled={!canShareHtml || fileActionBusy !== null}
                aria-busy={fileActionBusy === 'share'}
                onClick={handleShareHtm}
                title={
                  canShareHtml
                    ? 'Share .HTM file using native share sheet'
                    : 'Native file sharing is unavailable in this browser — use Download .HTM instead.'
                }
                className={`min-h-[34px] px-3 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap ${
                  canShareHtml && fileActionBusy === null
                    ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                    : 'border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[var(--barn-muted)] opacity-55 cursor-not-allowed'
                }`}
              >
                {fileActionBusy === 'share' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                {fileActionBusy === 'share' ? 'Sharing...' : 'Share .HTM'}
              </button>
              <button
                type="button"
                disabled={fileActionBusy !== null}
                aria-busy={fileActionBusy === 'download'}
                onClick={handleDownloadHtm}
                className={`min-h-[34px] px-3 py-1 rounded-md border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap ${
                  fileActionBusy !== null ? 'opacity-60 cursor-not-allowed' : ''
                }`}
              >
                {fileActionBusy === 'download' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                {fileActionBusy === 'download' ? 'Saving...' : 'Download .HTM'}
              </button>
              {!canShareHtml && (
                <span className="text-[11px] text-[var(--barn-muted)]">
                  (Share unavailable here — use Download .HTM)
                </span>
              )}
              <button
                type="button"
                onClick={() => setPrintBlockedMessage(null)}
                aria-label="Dismiss print notice"
                className="hidden sm:flex min-h-[32px] min-w-[32px] rounded-md hover:bg-black/10 dark:hover:bg-white/10 items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div
          ref={viewportRef}
          style={{
            touchAction: 'pan-x pan-y',
            overscrollBehavior: 'contain',
            overflowAnchor: 'none',
          }}
          className="flex-1 min-h-0 bg-neutral-200 dark:bg-neutral-900 p-3 sm:p-4 overflow-auto"
        >
          <div
            ref={sizerRef}
            style={{
              width: `${docSize.width * zoom}px`,
              height: `${docSize.height * zoom}px`,
            }}
            className="relative"
          >
            <iframe
              ref={iframeRef}
              title={title}
              srcDoc={htmlContent}
              onLoad={handleIframeLoad}
              style={{
                width: `${docSize.width}px`,
                height: `${docSize.height}px`,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                colorScheme: 'light',
                backgroundColor: '#ffffff',
              }}
              className="bg-white rounded-lg border border-neutral-300 shadow-sm block"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

## `src/components/PromptsDirectoryScreen.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Developer Prompts Directory Screen (`src/components/PromptsDirectoryScreen.tsx`).
 *
 * Documentation & Maintenance Note:
 * If the prompt files in `/prompts/` are ever moved or renamed in the repository,
 * update the `import.meta.glob('/prompts/*', ...)` glob below, the constants in
 * `src/core/promptsCatalog.ts`, and the `/prompts/` disk scanner in `vite.config.ts`.
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
import { formatByteSizePure } from '../core/imageOptimizationSpec';
import {
  buildPromptsCatalogManifest,
  isValidPromptsManifest,
  partitionPromptsByStatus,
  PROMPTS_FILE_STRUCTURE_BREADCRUMB,
  PROMPTS_FOLDER_PATH,
  PROMPTS_MOVED_DOCUMENTATION_NOTE,
  PromptCatalogEntry,
  PromptsCatalogManifest,
} from '../core/promptsCatalog';
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
```

## `src/components/ReportsScreen.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Interactive Per-Species Reports Screen (`ReportsScreen`).
 *
 * Strictly scoped to livestock species added in `snapshot.speciesProfiles`.
 * Supports live catalog search, category & audience filtering (`All`, `Male`,
 * `Female`, `Non-Adult Male`, `Non-Adult Female`), optional date windows,
 * interactive tabular previews, animal deep-links, UTF-8 CSV download, and
 * white-paper PDF printing via `PrintPreviewModal`.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Baby,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Download,
  FileSpreadsheet,
  HeartPulse,
  Printer,
  RotateCcw,
  Scale,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Tag,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  BarnDatabaseSnapshot,
  isAnimalActive,
  isSameSpecies,
  SpeciesProfile,
} from '../core/models';
import { buildReportCatalogForSpecies, ReportIconKey } from '../core/reportCatalog';
import {
  buildPrintableReportHtml,
  buildReportFileName,
  exportReportToCsv,
  generateSpeciesReport,
  REPORT_AUDIENCE_FILTERS,
  ReportAudienceFilter,
} from '../core/reportGenerators';
import { useVirtualWindow } from '../utils/useVirtualWindow';
import { downloadTextFile } from '../utils/webFileActions';
import { PrintPreviewModal } from './PrintPreviewModal';

const REPORT_ICON_MAP: Record<ReportIconKey, LucideIcon> = {
  calendar: CalendarDays,
  roster: ClipboardList,
  tag: Tag,
  income: DollarSign,
  weight: Scale,
  breeding: Sparkles,
  medicine: Stethoscope,
  health: HeartPulse,
  ultrasound: FileSpreadsheet,
  alert: ShieldAlert,
  offspring: Baby,
  users: Users,
  ownership: Settings,
};

interface ReportsScreenProps {
  snapshot: BarnDatabaseSnapshot;
  activeSpeciesName: string;
  speciesProfiles: SpeciesProfile[];
  onSelectSpecies?: (speciesName: string) => void;
  onOpenAnimal?: (animalId: string) => void;
}

export function ReportsScreen({
  snapshot,
  activeSpeciesName,
  speciesProfiles,
  onSelectSpecies,
  onOpenAnimal,
}: ReportsScreenProps) {
  const [selectedSpeciesName, setSelectedSpeciesName] = useState<string>(activeSpeciesName);
  const [selectedReportId, setSelectedReportId] = useState<string>('roster-report');
  const [mobileView, setMobileView] = useState<'catalog' | 'preview'>('catalog');
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [audienceFilter, setAudienceFilter] = useState<ReportAudienceFilter>('All');
  const [dateFromIso, setDateFromIso] = useState<string>('');
  const [dateToIso, setDateToIso] = useState<string>('');
  const [subjectAnimalId, setSubjectAnimalId] = useState<string>('');
  const [tableSearch, setTableSearch] = useState<string>('');
  const [printPreview, setPrintPreview] = useState<{
    title: string;
    filename: string;
    html: string;
  } | null>(null);

  useEffect(() => {
    const matchesActive = speciesProfiles.some((sp) => sp.name === activeSpeciesName);
    if (matchesActive) {
      setSelectedSpeciesName(activeSpeciesName);
    } else if (speciesProfiles.length > 0) {
      setSelectedSpeciesName((prev) =>
        speciesProfiles.some((sp) => sp.name === prev) ? prev : speciesProfiles[0].name
      );
    }
  }, [activeSpeciesName, speciesProfiles]);

  // Clear animal-specific focus when switching species
  useEffect(() => {
    setSubjectAnimalId('');
    setTableSearch('');
  }, [selectedSpeciesName]);

  const selectedSpeciesProfile = useMemo(() => {
    if (speciesProfiles.length === 0) return null;
    return (
      speciesProfiles.find((sp) => sp.name === selectedSpeciesName) ||
      speciesProfiles.find((sp) => sp.name === activeSpeciesName) ||
      speciesProfiles[0]
    );
  }, [speciesProfiles, selectedSpeciesName, activeSpeciesName]);

  const catalogEntries = useMemo(() => {
    if (!selectedSpeciesProfile) return [];
    return buildReportCatalogForSpecies(selectedSpeciesProfile);
  }, [selectedSpeciesProfile]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const entry of catalogEntries) {
      set.add(entry.category);
    }
    return ['All', ...Array.from(set)];
  }, [catalogEntries]);

  const filteredCatalogEntries = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return catalogEntries.filter((entry) => {
      if (selectedCategory !== 'All' && entry.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      return (
        entry.title.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q) ||
        entry.category.toLowerCase().includes(q)
      );
    });
  }, [catalogEntries, catalogSearch, selectedCategory]);

  // Ensure selectedReportId remains valid when switching species
  useEffect(() => {
    if (catalogEntries.length === 0) return;
    if (!catalogEntries.some((e) => e.id === selectedReportId)) {
      setSelectedReportId(catalogEntries[0].id);
    }
  }, [catalogEntries, selectedReportId]);

  const eligibleBreedWithSubjects = useMemo(() => {
    if (!selectedSpeciesProfile) return [];
    return snapshot.animals
      .filter(
        (a) =>
          isSameSpecies(a.species, selectedSpeciesProfile.name) &&
          isAnimalActive(a) &&
          !a.culled &&
          (a.sex === 'Male' || a.sex === 'Female')
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [snapshot.animals, selectedSpeciesProfile]);

  const activeReport = useMemo(() => {
    if (!selectedSpeciesProfile) return null;
    return generateSpeciesReport(snapshot, selectedSpeciesProfile.name, selectedReportId, {
      filter: audienceFilter,
      dateFromIso: dateFromIso || undefined,
      dateToIso: dateToIso || undefined,
      subjectAnimalId: selectedReportId === 'breed-with-report' ? subjectAnimalId || undefined : undefined,
    });
  }, [
    snapshot,
    selectedSpeciesProfile,
    selectedReportId,
    audienceFilter,
    dateFromIso,
    dateToIso,
    subjectAnimalId,
  ]);

  const displayedRows = useMemo(() => {
    if (!activeReport) return [];
    const q = tableSearch.trim().toLowerCase();
    if (!q) return activeReport.rows;
    return activeReport.rows.filter((row) =>
      activeReport.columns.some((col) =>
        String(row.cells[col.key] ?? '')
          .toLowerCase()
          .includes(q)
      )
    );
  }, [activeReport, tableSearch]);

  const reportVirtual = useVirtualWindow({
    itemCount: displayedRows.length,
    estimateSize: 44,
    overscan: 10,
    initialFallbackCount: 40,
    resetKey: `${selectedSpeciesName}::${selectedReportId}::${tableSearch}::${dateFromIso}::${dateToIso}::${audienceFilter}::${subjectAnimalId}`,
  });

  const windowedRows = useMemo(
    () =>
      displayedRows.length > 0 &&
      reportVirtual.windowRange.endIndex >= reportVirtual.windowRange.startIndex
        ? displayedRows.slice(
            reportVirtual.windowRange.startIndex,
            reportVirtual.windowRange.endIndex + 1
          )
        : [],
    [
      displayedRows,
      reportVirtual.windowRange.startIndex,
      reportVirtual.windowRange.endIndex,
    ]
  );

  const reportTableColCount =
    (activeReport?.columns.length ?? 0) + (onOpenAnimal ? 1 : 0);

  const handleSelectSpecies = (name: string) => {
    setSelectedSpeciesName(name);
    onSelectSpecies?.(name);
  };

  const handleSelectReport = (reportId: string) => {
    setSelectedReportId(reportId);
    setTableSearch('');
    setMobileView('preview');
  };

  const handleDownloadCsv = async () => {
    if (!activeReport) return;
    const reportForExport =
      tableSearch.trim() && displayedRows.length !== activeReport.rows.length
        ? { ...activeReport, rows: displayedRows }
        : activeReport;
    const csv = exportReportToCsv(reportForExport);
    const filename = buildReportFileName(reportForExport, 'csv', snapshot.settings.barnName);
    try {
      await downloadTextFile(filename, csv, 'text/csv');
    } catch {
      // Error surfaced cleanly without unhandled rejection
    }
  };

  const handleOpenPrintPreview = () => {
    if (!activeReport) return;
    const reportForPrint =
      tableSearch.trim() && displayedRows.length !== activeReport.rows.length
        ? { ...activeReport, rows: displayedRows }
        : activeReport;
    const html = buildPrintableReportHtml(reportForPrint, snapshot.settings);
    const filename = buildReportFileName(reportForPrint, 'htm', snapshot.settings.barnName);
    setPrintPreview({
      title: `${reportForPrint.speciesName} — ${reportForPrint.title}`,
      filename,
      html,
    });
  };

  const isInvertedDateRange = Boolean(
    dateFromIso && dateToIso && dateFromIso > dateToIso
  );

  const hasActiveFilters =
    audienceFilter !== 'All' ||
    Boolean(dateFromIso) ||
    Boolean(dateToIso) ||
    Boolean(tableSearch.trim()) ||
    Boolean(subjectAnimalId);

  const handleResetFilters = () => {
    setAudienceFilter('All');
    setDateFromIso('');
    setDateToIso('');
    setSubjectAnimalId('');
    setTableSearch('');
  };

  const handleSwapDates = () => {
    setDateFromIso(dateToIso);
    setDateToIso(dateFromIso);
  };

  return (
    <div className="space-y-4">
      {/* Screen Header & Added Species Switcher */}
      <header className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div className="space-y-1">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
              Reports
            </h1>
            <p className="text-xs sm:text-sm text-[var(--barn-muted)]">
              {selectedSpeciesProfile ? (
                <>
                  <span>{selectedSpeciesProfile.name} Only</span>
                  <span aria-hidden="true"> &middot; </span>
                  <span className="font-mono tabular-nums">{catalogEntries.length}</span>{' '}
                  <span>reports</span>
                  <span aria-hidden="true"> &middot; </span>
                  <span>Unit: {activeReport?.weightUnit || 'lbs_oz'}</span>
                </>
              ) : (
                <>No species added yet &middot; Add a species in Settings to run reports</>
              )}
            </p>
          </div>

          {speciesProfiles.length > 0 && (
            <div
              aria-label="Added Species Reports Filter"
              className="flex flex-wrap items-center gap-1.5"
            >
              {speciesProfiles.map((sp) => {
                const isSelected = selectedSpeciesProfile?.name === sp.name;
                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => handleSelectSpecies(sp.name)}
                    aria-pressed={isSelected}
                    className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                      isSelected
                        ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] border-[var(--barn-sage)]'
                        : 'bg-[var(--barn-surface)] text-[var(--barn-ink)] border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                    }`}
                  >
                    {sp.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Global Audience, Category & Date Range Filter Strip */}
        {selectedSpeciesProfile && (
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-3 flex flex-wrap items-end gap-2.5">
            <div className="flex-1 min-w-[180px]">
              <label
                htmlFor="report-audience-filter"
                className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
              >
                Sex &amp; Age Filter
              </label>
              <select
                id="report-audience-filter"
                value={audienceFilter}
                onChange={(e) => setAudienceFilter(e.target.value as ReportAudienceFilter)}
                className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
              >
                {REPORT_AUDIENCE_FILTERS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[150px]">
              <label
                htmlFor="report-category-filter"
                className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
              >
                Category
              </label>
              <select
                id="report-category-filter"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[140px]">
              <label
                htmlFor="report-date-from"
                className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
              >
                From Date
              </label>
              <input
                id="report-date-from"
                type="date"
                value={dateFromIso}
                onChange={(e) => setDateFromIso(e.target.value)}
                className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
              />
            </div>

            <div className="min-w-[140px]">
              <label
                htmlFor="report-date-to"
                className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
              >
                To Date
              </label>
              <input
                id="report-date-to"
                type="date"
                value={dateToIso}
                onChange={(e) => setDateToIso(e.target.value)}
                className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
              />
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                Reset
              </button>
            )}
          </div>
        )}

        {isInvertedDateRange && (
          <div
            role="status"
            className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs flex flex-wrap items-center justify-between gap-2"
          >
            <span>
              <strong>From Date</strong> (<span className="font-mono">{dateFromIso}</span>) is after{' '}
              <strong>To Date</strong> (<span className="font-mono">{dateToIso}</span>), so no dated
              records can match.
            </span>
            <div className="flex flex-wrap items-center gap-2 max-w-full">
              <button
                type="button"
                onClick={handleSwapDates}
                className="min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-semibold hover:bg-[var(--barn-subtle)]"
              >
                Swap Dates
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateFromIso('');
                  setDateToIso('');
                }}
                className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Split Workspace (Desktop) / Switchable Catalog <-> Preview (Mobile) */}
      {selectedSpeciesProfile && activeReport ? (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-4 items-start">
          {/* Left Column: Searchable Report Directory */}
          <section
            aria-label={`${selectedSpeciesProfile.name} Reports Directory`}
            className={`${
              mobileView === 'preview' ? 'hidden lg:block' : 'block'
            } bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl overflow-hidden`}
          >
            <div className="p-3 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/50">
              <div className="relative">
                <Search
                  className="w-3.5 h-3.5 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder={`Filter ${selectedSpeciesProfile.name} reports...`}
                  aria-label="Filter report templates"
                  className="w-full min-h-[38px] pl-8 pr-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs placeholder:text-[var(--barn-muted)]"
                />
              </div>
            </div>

            {filteredCatalogEntries.length > 0 ? (
              <ul className="divide-y divide-[var(--barn-border)]/70 lg:max-h-[68vh] lg:overflow-y-auto">
                {filteredCatalogEntries.map((entry) => {
                  const Icon = REPORT_ICON_MAP[entry.iconKey] || ClipboardList;
                  const isActive = entry.id === selectedReportId;
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectReport(entry.id)}
                        aria-current={isActive ? 'true' : undefined}
                        className={`w-full text-left px-3.5 py-3 flex items-center justify-between gap-3 transition-colors ${
                          isActive
                            ? 'bg-[var(--barn-sage-tint)] text-[var(--barn-ink)]'
                            : 'hover:bg-[var(--barn-canvas)]/70'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <span
                            className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${
                              isActive
                                ? 'border-[var(--barn-sage)] bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                                : 'border-[var(--barn-border)]/80 bg-[var(--barn-canvas)] text-[var(--barn-slate)]'
                            }`}
                            aria-hidden="true"
                          >
                            <Icon className="w-4 h-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs sm:text-sm font-semibold text-[var(--barn-ink)] truncate">
                              {entry.title}
                            </div>
                            <div className="text-[11px] text-[var(--barn-muted)] truncate">
                              {entry.category} &middot; {entry.description}
                            </div>
                          </div>
                        </div>
                        <ChevronRight
                          className={`w-4 h-4 shrink-0 ${
                            isActive ? 'text-[var(--barn-sage)]' : 'text-[var(--barn-muted)]'
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-6 text-center text-xs text-[var(--barn-muted)] space-y-2">
                <p>No report templates matched &ldquo;{catalogSearch}&rdquo;.</p>
                <button
                  type="button"
                  onClick={() => {
                    setCatalogSearch('');
                    setSelectedCategory('All');
                  }}
                  className="text-xs font-medium underline text-[var(--barn-ink)]"
                >
                  Show all {catalogEntries.length} reports
                </button>
              </div>
            )}
          </section>

          {/* Right Column: Live Report Table & Export Toolbar */}
          <section
            aria-label={`${activeReport.title} Preview`}
            className={`${
              mobileView === 'catalog' ? 'hidden lg:block' : 'block'
            } bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl overflow-hidden min-w-0`}
          >
            {/* Mobile Back-to-Catalog Bar */}
            <div className="lg:hidden px-3.5 py-2.5 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/70 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setMobileView('catalog')}
                className="min-h-[36px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                All {selectedSpeciesProfile.name} Reports
              </button>
              <span className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                {displayedRows.length} rows
              </span>
            </div>

            {/* Active Report Header + Export Controls */}
            <div className="p-4 border-b border-[var(--barn-border)] flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="text-[11px] text-[var(--barn-muted)]">
                  <span>{activeReport.speciesName} Only</span>
                  <span aria-hidden="true"> &middot; </span>
                  <span>{activeReport.category}</span>
                  <span aria-hidden="true"> &middot; </span>
                  <span>Filter: {activeReport.audienceFilter}</span>
                  <span aria-hidden="true"> &middot; </span>
                  <span className="font-mono tabular-nums">
                    {displayedRows.length} row{displayedRows.length === 1 ? '' : 's'}
                  </span>
                </div>
                <h2 className="font-display text-lg sm:text-xl font-semibold text-[var(--barn-ink)] text-balance">
                  {activeReport.title}
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">{activeReport.description}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 max-w-full">
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="min-h-[40px] max-w-full px-3.5 py-2 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Download CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenPrintPreview}
                  className="min-h-[40px] max-w-full px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] hover:opacity-95 text-xs font-semibold inline-flex items-center gap-1.5 transition-opacity"
                >
                  <Printer className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Print / Save PDF</span>
                </button>
              </div>
            </div>

            {/* Inline Summary Metrics Strip (Flat Hairline Dividers, Zero Nested Cards) */}
            {activeReport.summaryMetrics.length > 0 && (
              <div className="px-4 py-3 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/45 grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-x-6 gap-y-2">
                {activeReport.summaryMetrics.map((metric) => (
                  <div key={metric.label} className="min-w-0">
                    <div className="text-[11px] text-[var(--barn-muted)] truncate">
                      {metric.label}
                    </div>
                    <div
                      className={`text-sm sm:text-base font-semibold font-mono tabular-nums ${
                        metric.tone === 'danger'
                          ? 'text-red-700 dark:text-red-400'
                          : metric.tone === 'warning'
                          ? 'text-[var(--barn-terracotta)]'
                          : metric.tone === 'positive'
                          ? 'text-[var(--barn-sage)]'
                          : 'text-[var(--barn-ink)]'
                      }`}
                    >
                      {metric.value}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Report-Specific Controls (Breed With Subject Focus + In-Table Search) */}
            {(activeReport.reportId === 'breed-with-report' || activeReport.rows.length > 0) && (
              <div className="px-4 py-2.5 border-b border-[var(--barn-border)] flex flex-wrap items-center justify-between gap-2.5">
                {activeReport.reportId === 'breed-with-report' ? (
                  <div className="flex items-center gap-2 min-w-[220px] flex-1 max-w-sm">
                    <label
                      htmlFor="breed-with-subject"
                      className="text-xs text-[var(--barn-muted)] whitespace-nowrap"
                    >
                      Focus Animal:
                    </label>
                    <select
                      id="breed-with-subject"
                      value={subjectAnimalId}
                      onChange={(e) => setSubjectAnimalId(e.target.value)}
                      className="flex-1 min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                    >
                      <option value="">All Active Males &times; Females</option>
                      {eligibleBreedWithSubjects.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                          {a.tattoo ? ` (${a.tattoo})` : ''} &middot; {a.sex}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="text-[11px] text-[var(--barn-muted)]">
                    Showing{' '}
                    <span className="font-mono tabular-nums font-medium text-[var(--barn-ink)]">
                      {displayedRows.length}
                    </span>{' '}
                    of{' '}
                    <span className="font-mono tabular-nums">{activeReport.rows.length}</span>{' '}
                    entries
                  </span>
                )}

                {activeReport.rows.length > 0 && (
                  <div className="relative w-full sm:w-64">
                    <Search
                      className="w-3.5 h-3.5 text-[var(--barn-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      placeholder="Search rows in this report..."
                      aria-label="Search report rows"
                      className="w-full min-h-[36px] pl-8 pr-3 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs placeholder:text-[var(--barn-muted)]"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Interactive Tabular Output */}
            {displayedRows.length > 0 ? (
              <div>
                <div
                  ref={reportVirtual.scrollContainerRef}
                  className="max-h-[65vh] overflow-auto"
                >
                  <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-[var(--barn-surface)] shadow-[0_1px_0_var(--barn-border)]">
                      <tr className="border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/90">
                        {activeReport.columns.map((col) => (
                          <th
                            key={col.key}
                            scope="col"
                            className={`px-3 py-2.5 font-semibold text-[var(--barn-muted)] whitespace-nowrap ${
                              col.align === 'right' ? 'text-right' : 'text-left'
                            }`}
                          >
                            {col.label}
                          </th>
                        ))}
                        {onOpenAnimal && (
                          <th
                            scope="col"
                            className="px-3 py-2.5 font-semibold text-[var(--barn-muted)] text-right whitespace-nowrap"
                          >
                            Record
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--barn-border)]/70">
                      {reportVirtual.windowRange.paddingTop > 0 && (
                        <tr aria-hidden="true">
                          <td
                            colSpan={reportTableColCount}
                            style={{
                              height: `${reportVirtual.windowRange.paddingTop}px`,
                              padding: 0,
                              border: 0,
                            }}
                          />
                        </tr>
                      )}
                      {windowedRows.map((row, localIdx) => {
                        const rowIndex = reportVirtual.windowRange.startIndex + localIdx;
                        const rowBg =
                          row.highlightTone === 'danger'
                            ? 'bg-red-500/5 hover:bg-red-500/10'
                            : row.highlightTone === 'warning'
                            ? 'bg-[var(--barn-terracotta-tint)]/35 hover:bg-[var(--barn-terracotta-tint)]/55'
                            : row.highlightTone === 'success'
                            ? 'bg-[var(--barn-sage-tint)]/25 hover:bg-[var(--barn-sage-tint)]/45'
                            : 'hover:bg-[var(--barn-canvas)]/60';
                        return (
                          <tr
                            key={row.id}
                            ref={reportVirtual.measureRowRef(rowIndex)}
                            className={`${rowBg} transition-colors`}
                          >
                            {activeReport.columns.map((col) => {
                              const val = row.cells[col.key] ?? '';
                              return (
                                <td
                                  key={col.key}
                                  className={`px-3 py-2.5 align-top ${
                                    col.align === 'right'
                                      ? 'text-right font-mono tabular-nums whitespace-nowrap'
                                      : 'text-left'
                                  }`}
                                >
                                  {String(val)}
                                </td>
                              );
                            })}
                            {onOpenAnimal && (
                              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                {row.animalId ? (
                                  <button
                                    type="button"
                                    onClick={() => onOpenAnimal(row.animalId!)}
                                    className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--barn-sage)] hover:underline"
                                  >
                                    Open
                                    <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                                  </button>
                                ) : (
                                  <span className="text-[var(--barn-muted)]">&mdash;</span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      {reportVirtual.windowRange.paddingBottom > 0 && (
                        <tr aria-hidden="true">
                          <td
                            colSpan={reportTableColCount}
                            style={{
                              height: `${reportVirtual.windowRange.paddingBottom}px`,
                              padding: 0,
                              border: 0,
                            }}
                          />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2.5 border-t border-[var(--barn-border)] bg-[var(--barn-canvas)]/45 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--barn-muted)]">
                    Viewing{' '}
                    <span className="font-mono tabular-nums font-medium">
                      {reportVirtual.windowRange.startIndex + 1}–
                      {reportVirtual.windowRange.endIndex + 1}
                    </span>{' '}
                    of{' '}
                    <span className="font-mono tabular-nums font-medium">
                      {displayedRows.length}
                    </span>{' '}
                    rows (CSV &amp; Print include all rows)
                  </span>
                  {reportVirtual.windowRange.startIndex > 0 && (
                    <button
                      type="button"
                      onClick={reportVirtual.scrollToTop}
                      className="min-h-[36px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] font-medium"
                    >
                      Back to Top
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm text-[var(--barn-muted)]">
                  {tableSearch.trim()
                    ? `No rows in ${activeReport.title} matched "${tableSearch}".`
                    : activeReport.emptyMessage}
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="min-h-[38px] px-4 py-1.5 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    Reset Filters
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      ) : (
        <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 text-center text-sm text-[var(--barn-muted)]">
          No species have been added yet. Add a species in Settings to view and export its
          per-species reports.
        </section>
      )}

      {printPreview && (
        <PrintPreviewModal
          title={printPreview.title}
          filename={printPreview.filename}
          htmlContent={printPreview.html}
          onClose={() => setPrintPreview(null)}
        />
      )}
    </div>
  );
}
```

## `src/components/SearchableParentPicker.tsx`

```tsx
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
```

## `src/components/SettingsAndSyncScreen.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Barn Preferences, Calendar Integration, Appearance Studio & Backup/Tool Launchers (`Settings`).
 * Links directly to the consolidated Import/Export Hub (`ImportExportHubScreen`) and the
 * lazy-loaded Developer & Troubleshooting console ("The Techy Stuff").
 */

import {
  ArrowLeftRight,
  Bell,
  CalendarPlus,
  CheckCircle2,
  Database,
  Download,
  FolderSync,
  HardDrive,
  HelpCircle,
  Image as ImageIcon,
  LogOut,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Sun,
  Terminal,
  Upload,
  X,
} from 'lucide-react';
import React, { useEffect, useId, useRef, useState } from 'react';
import { BackupStatusEvaluation } from '../core/backupStatus';
import { VaultBackupMetadata } from '../core/backupVault';
import { CALENDAR_ALARM_LEAD_OPTIONS } from '../core/calendarExport';
import {
  calculateSavingsPercent,
  formatByteSizePure,
  IMAGE_OPTIMIZATION_PRESETS,
  ImageOptimizationPresetId,
} from '../core/imageOptimizationSpec';
import {
  BarnDatabaseSnapshot,
  BarnSettings,
  BarnTask,
  CalendarDeliveryMode,
  CalendarSyncSettings,
  normalizeCalendarSyncSettings,
  normalizeCurrencyCode,
  SpeciesProfile,
  WeightUnit,
} from '../core/models';
import {
  formatTimestampedBackupSlug,
  generateBarnBackupJsonChunks,
} from '../core/syncAndExports';
import {
  CustomThemeColors,
  DEFAULT_WARM_THEME_COLORS,
  WARM_THEME_PRESETS,
} from '../core/themePalette';
import { sanitizeSafeRasterImageDataUrl } from '../core/inputSanitization';
import { DeviceCapabilityController } from '../storage/deviceCapabilityDetector';
import { optimizeImageFile } from '../storage/webImageOptimizer';
import {
  RollingBackupMeta,
  StorageProtectionStatus,
  usePWAInstall,
} from '../storage/storageProtection';
import type { GoogleCalendarOption } from '../utils/googleCalendarClient';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import { downloadTextChunks } from '../utils/webFileActions';
import { SignInWithGoogleButton } from './CalendarIntegrationModals';
import { DeviceCapabilityCard } from './DeviceCapabilityCard';
import { ImageCompressionNotice } from './ImageCompressionNotice';
import type { ImportExportHubSection } from './ImportExportHubScreen';
import { SpeciesEditorModal } from './SpeciesEditorModal';

interface SettingsAndSyncScreenProps {
  snapshot: BarnDatabaseSnapshot;
  activeSpeciesName: string;
  storageStatus: StorageProtectionStatus | null;
  backupStatus: BackupStatusEvaluation | null;
  openAddSpeciesOnMount: boolean;
  onConsumedOpenAddSpecies: () => void;
  recordBackupExport: (
    format: 'zip' | 'sqlite' | 'json',
    fileName?: string
  ) => Promise<void> | void;
  onUpdateSettings: (patch: Partial<BarnSettings>, options?: { silent?: boolean }) => void;
  onSaveSpecies: (profile: SpeciesProfile) => Promise<boolean | void> | void;
  onDeleteSpecies: (profile: SpeciesProfile) => void;
  onDownloadTimestampedSpeciesBackup: (speciesName: string) => Promise<void> | void;
  onExportTasksToCalendar?: (tasks: BarnTask[], filenameHint?: string) => number;
  googleAuthConnected?: boolean;
  googleUserEmail?: string | null;
  googleCalendars?: GoogleCalendarOption[];
  googleSyncBusy?: boolean;
  onConnectGoogleCalendar?: () => Promise<boolean>;
  onDisconnectGoogleCalendar?: () => Promise<void>;
  onRefreshGoogleCalendars?: () => Promise<void>;
  deviceCapability?: DeviceCapabilityController;
  onHydrateSnapshotForExport?: (
    targetSnapshot?: BarnDatabaseSnapshot,
    filterSpecies?: string
  ) => Promise<BarnDatabaseSnapshot>;
  opfsSupported?: boolean;
  opfsVaultBackups?: VaultBackupMetadata[];
  rollingBackups?: RollingBackupMeta[];
  onOpenImportExportHub?: (section?: ImportExportHubSection) => void;
  onOpenTechyStuff?: () => void;
}

export function SettingsAndSyncScreen({
  snapshot,
  activeSpeciesName,
  storageStatus,
  backupStatus,
  openAddSpeciesOnMount,
  onConsumedOpenAddSpecies,
  recordBackupExport,
  onUpdateSettings,
  onSaveSpecies,
  onDeleteSpecies,
  onDownloadTimestampedSpeciesBackup,
  onExportTasksToCalendar,
  googleAuthConnected = false,
  googleUserEmail = null,
  googleCalendars = [],
  googleSyncBusy = false,
  onConnectGoogleCalendar,
  onDisconnectGoogleCalendar,
  onRefreshGoogleCalendars,
  deviceCapability,
  onHydrateSnapshotForExport,
  opfsSupported = false,
  opfsVaultBackups = [],
  rollingBackups = [],
  onOpenImportExportHub,
  onOpenTechyStuff,
}: SettingsAndSyncScreenProps) {
  const baseId = useId();
  const { settings, speciesProfiles } = snapshot;
  const calendarSync = normalizeCalendarSyncSettings(settings.calendarSync);
  const updateCalendarSync = (patch: Partial<CalendarSyncSettings>) => {
    onUpdateSettings(
      { calendarSync: { ...calendarSync, ...patch } },
      { silent: true }
    );
  };
  const openDatedTasks = snapshot.tasks.filter((t) => !t.completed && Boolean(t.dueDateIso));

  const [barnName, setBarnName] = useState(settings.barnName);
  const [breederName, setBreederName] = useState(settings.breederName);
  const [preferredUnit, setPreferredUnit] = useState<WeightUnit>(settings.preferredUnit);
  const [currencyCode, setCurrencyCode] = useState<string>(() =>
    normalizeCurrencyCode(settings.currencyCode, 'USD')
  );
  const [defaultSpecies, setDefaultSpecies] = useState(settings.defaultSpecies);
  const [pinnedLandingSpecies, setPinnedLandingSpecies] = useState(settings.pinnedLandingSpecies);
  const [defaultGenerations, setDefaultGenerations] = useState<3 | 4 | 5 | 6>(
    settings.defaultGenerations
  );
  const [imageOptimizationPreset, setImageOptimizationPreset] =
    useState<ImageOptimizationPresetId>(settings.imageOptimizationPreset || 'balanced');
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [showHomeSummaryGrid, setShowHomeSummaryGrid] = useState<boolean>(
    settings.showHomeSummaryGrid !== false
  );
  const [includePhotoOnPedigree, setIncludePhotoOnPedigree] = useState<boolean>(
    Boolean(settings.includePhotoOnPedigree)
  );
  const [breederLogoDataUrl, setBreederLogoDataUrl] = useState<string>(
    sanitizeSafeRasterImageDataUrl(settings.breederLogoDataUrl)
  );
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [autoOffloadRetiredToOpfs, setAutoOffloadRetiredToOpfs] = useState<boolean>(
    Boolean(settings.autoOffloadRetiredToOpfs)
  );

  const [quickBackupFeedback, setQuickBackupFeedback] = useState<string | null>(null);
  const [quickBackupError, setQuickBackupError] = useState<string | null>(null);
  const [showCustomSpeciesModal, setShowCustomSpeciesModal] = useState(false);
  const [zipExportBusy, setZipExportBusy] = useState<'json' | null>(null);

  const archiveExportLock = useAsyncSubmitLock();
  const { canPromptInstall, isInstalled, isIos, promptInstall } = usePWAInstall();

  useEffect(() => {
    if (openAddSpeciesOnMount) {
      setShowCustomSpeciesModal(true);
      onConsumedOpenAddSpecies();
    }
  }, [openAddSpeciesOnMount, onConsumedOpenAddSpecies]);

  useEffect(() => {
    setBarnName(settings.barnName);
    setBreederName(settings.breederName);
    setPreferredUnit(settings.preferredUnit);
    setCurrencyCode(normalizeCurrencyCode(settings.currencyCode, 'USD'));
    setDefaultSpecies(settings.defaultSpecies);
    setPinnedLandingSpecies(settings.pinnedLandingSpecies);
    setDefaultGenerations(settings.defaultGenerations);
    setImageOptimizationPreset(settings.imageOptimizationPreset || 'balanced');
    setShowHomeSummaryGrid(settings.showHomeSummaryGrid !== false);
    setIncludePhotoOnPedigree(Boolean(settings.includePhotoOnPedigree));
    setBreederLogoDataUrl(sanitizeSafeRasterImageDataUrl(settings.breederLogoDataUrl));
    setAutoOffloadRetiredToOpfs(Boolean(settings.autoOffloadRetiredToOpfs));
  }, [settings]);

  const isDark = settings.themeMode === 'dark';
  const customColors: CustomThemeColors = settings.customColors || {};

  const allPhotos = snapshot.animalPhotos ?? [];
  const totalStoredPhotoBytes = allPhotos.reduce((acc, p) => acc + p.storedBytes, 0);
  const totalOriginalPhotoBytes = allPhotos.reduce((acc, p) => acc + p.originalBytes, 0);
  const totalPhotoSavingsPct = calculateSavingsPercent(
    totalOriginalPhotoBytes,
    totalStoredPhotoBytes
  );

  const activeColorValue = (key: keyof CustomThemeColors): string => {
    const val = customColors[key];
    if (val && /^#[0-9a-fA-F]{6}$/.test(val)) return val.toUpperCase();
    return DEFAULT_WARM_THEME_COLORS[key];
  };

  const handleColorPick = (key: keyof CustomThemeColors, hex: string) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    onUpdateSettings(
      {
        customColors: {
          ...customColors,
          [key]: hex.toUpperCase(),
        },
      },
      { silent: true }
    );
  };

  const handleApplyPreset = (colors: CustomThemeColors) => {
    onUpdateSettings({
      customColors: { ...colors },
    });
  };

  const handleResetColors = () => {
    onUpdateSettings({
      customColors: {},
    });
  };

  const handleSavePreferences = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      barnName: barnName.trim() || 'My Barn',
      barnNameOnboarded: true,
      breederName: breederName.trim(),
      preferredUnit,
      currencyCode: normalizeCurrencyCode(currencyCode, 'USD'),
      defaultSpecies,
      pinnedLandingSpecies,
      defaultGenerations,
      imageOptimizationPreset,
      showHomeSummaryGrid,
      includePhotoOnPedigree,
      breederLogoDataUrl: breederLogoDataUrl || undefined,
      autoOffloadRetiredToOpfs,
    });
  };

  const handleUploadBreederLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoError(null);
    setLogoUploading(true);
    try {
      const optimized = await optimizeImageFile(file, 'compact');
      const nextUrl = sanitizeSafeRasterImageDataUrl(
        optimized.thumbnailDataUrl || optimized.dataUrl
      );
      if (!nextUrl) {
        throw new Error('Could not process the selected logo image.');
      }
      setBreederLogoDataUrl(nextUrl);
      onUpdateSettings({ breederLogoDataUrl: nextUrl }, { silent: true });
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Could not optimize logo image.');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleClearBreederLogo = () => {
    setLogoError(null);
    setBreederLogoDataUrl('');
    onUpdateSettings({ breederLogoDataUrl: undefined }, { silent: true });
  };

  const handleDownloadTimestampedFullBackup = async () => {
    await archiveExportLock.runLocked(async () => {
      setQuickBackupError(null);
      setQuickBackupFeedback(null);
      setZipExportBusy('json');
      try {
        const exportSnapshot = onHydrateSnapshotForExport
          ? await onHydrateSnapshotForExport(snapshot)
          : snapshot;
        const stampSlug = formatTimestampedBackupSlug();
        const filename = `community-pedigree-full-backup-${stampSlug}.json`;
        await downloadTextChunks(
          filename,
          generateBarnBackupJsonChunks(exportSnapshot),
          'application/json'
        );
        void recordBackupExport('json', filename);
        setQuickBackupFeedback(
          `Saved timestamped JSON backup ${filename} (${exportSnapshot.animals.length} animals).`
        );
      } catch (err) {
        setQuickBackupError(
          err instanceof Error ? err.message : 'Could not prepare JSON backup.'
        );
      } finally {
        setZipExportBusy(null);
      }
    });
  };

  const colorPickersForMode: Array<{
    key: keyof CustomThemeColors;
    label: string;
    hint: string;
  }> = isDark
    ? [
        {
          key: 'darkPrimary',
          label: 'Primary Action Fill',
          hint: 'Main buttons & active lineage outlines',
        },
        {
          key: 'darkAccent',
          label: 'Warm Copper / Dam Chip',
          hint: 'Selected filter chips, nav tabs & Dam line',
        },
        {
          key: 'darkMale',
          label: 'Sire / Male Accent',
          hint: 'Sire pedigree Bezier curves & male tags',
        },
        {
          key: 'darkCanvas',
          label: 'Barn Background',
          hint: 'Deep outer page background',
        },
        {
          key: 'darkSurface',
          label: 'Card & Panel Surface',
          hint: 'Elevated cards, header & modals',
        },
      ]
    : [
        {
          key: 'lightPrimary',
          label: 'Primary Action Fill',
          hint: 'Main buttons & active lineage outlines',
        },
        {
          key: 'lightAccent',
          label: 'Warm Copper / Dam Chip',
          hint: 'Selected filter chips, nav tabs & Dam line',
        },
        {
          key: 'lightMale',
          label: 'Sire / Male Accent',
          hint: 'Sire pedigree Bezier curves & male tags',
        },
        {
          key: 'lightCanvas',
          label: 'Parchment Background',
          hint: 'Warm outer page background',
        },
        {
          key: 'lightSurface',
          label: 'Card & Panel Surface',
          hint: 'Elevated cards, header & modals',
        },
      ];

  const totalBarnRecords =
    snapshot.animals.length +
    allPhotos.length +
    snapshot.breedings.length +
    snapshot.cages.length +
    snapshot.tasks.length +
    snapshot.careLogs.length +
    snapshot.shows.length;

  return (
    <div className="space-y-6">
      {/* Upper Settings Section: Device Capability & Memory Handling */}
      {deviceCapability && (
        <DeviceCapabilityCard
          location="settings"
          controller={deviceCapability}
          settings={settings}
          totalBarnRecords={totalBarnRecords}
          onApplyLowMemorySettings={(patch) => onUpdateSettings(patch)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 6 Columns: Preferences, Theme Studio & Offline PWA Protection */}
        <div className="lg:col-span-6 space-y-6">
          {/* Barn Preferences, Custom Species & Pedigree Defaults */}
          <form
            onSubmit={handleSavePreferences}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  Barn Preferences &amp; Species Setup
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Configure barn headers, weight units, pedigree depth, and custom species prefixes
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowCustomSpeciesModal(true)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Add Custom Livestock
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor={`${baseId}-barnName`}
                  className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                >
                  Barn / Rabbitry / Farm Name
                </label>
                <input
                  id={`${baseId}-barnName`}
                  type="text"
                  value={barnName}
                  onChange={(e) => setBarnName(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor={`${baseId}-breederName`}
                  className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                >
                  Breeder Name (for Pedigrees)
                </label>
                <input
                  id={`${baseId}-breederName`}
                  type="text"
                  value={breederName}
                  onChange={(e) => setBreederName(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                />
              </div>
            </div>

            {/* Optional Barn / Rabbitry Logo for Printed Pedigrees */}
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {breederLogoDataUrl ? (
                    <img
                      src={breederLogoDataUrl}
                      alt={`${barnName || 'Barn'} logo`}
                      className="h-11 max-w-[110px] w-auto object-contain rounded-lg border border-[var(--barn-border)] bg-white p-1 shrink-0"
                    />
                  ) : (
                    <div className="h-11 w-11 rounded-lg border border-dashed border-[var(--barn-border)] bg-[var(--barn-surface)] flex items-center justify-center shrink-0 text-[var(--barn-muted)]">
                      <ImageIcon className="w-5 h-5" aria-hidden="true" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--barn-ink)]">
                      Barn / Rabbitry Logo (Pedigree Header)
                    </div>
                    <p className="text-[11px] text-[var(--barn-muted)]">
                      Optional raster logo (PNG/JPG/WebP) printed next to your barn title on formal pedigrees &amp; PDFs.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleUploadBreederLogo}
                    className="sr-only"
                    aria-label="Upload barn or rabbitry logo"
                  />
                  <button
                    type="button"
                    disabled={logoUploading}
                    onClick={() => logoInputRef.current?.click()}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    {logoUploading ? 'Optimizing...' : breederLogoDataUrl ? 'Change Logo' : 'Upload Logo'}
                  </button>
                  {breederLogoDataUrl && (
                    <button
                      type="button"
                      onClick={handleClearBreederLogo}
                      aria-label="Remove barn logo"
                      className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-danger)]/10 text-xs font-medium text-[var(--barn-danger)] inline-flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                      Remove
                    </button>
                  )}
                </div>
              </div>
              {logoError && (
                <p role="alert" className="text-[11px] text-[var(--barn-danger)]">
                  {logoError}
                </p>
              )}
            </div>

            {/* Image Storage Optimization Profile */}
            <div className="space-y-2 border-t border-b border-[var(--barn-border)] py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--barn-muted)]">
                  Incoming Image Optimization Profile (Direct Uploads &amp; Importers)
                </span>
                <span className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                  {allPhotos.length} photo{allPhotos.length === 1 ? '' : 's'} ·{' '}
                  {formatByteSizePure(totalStoredPhotoBytes)}
                  {totalPhotoSavingsPct > 0 ? ` (-${totalPhotoSavingsPct}% saved)` : ''}
                </span>
              </div>

              {/* Browser Storage Quota Meter */}
              {storageStatus && storageStatus.supported && (
                <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--barn-ink)]">
                      <HardDrive className="w-3.5 h-3.5 text-[var(--barn-slate)]" aria-hidden="true" />
                      On-Device Storage Quota
                      {storageStatus.persisted ? (
                        <span className="text-[10px] font-medium text-[var(--barn-sage)]">
                          (Locked)
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-[var(--barn-muted)]">
                          (Standard)
                        </span>
                      )}
                    </span>
                    <span className="font-mono tabular-nums text-[var(--barn-muted)]">
                      {storageStatus.quotaBytes > 0
                        ? `${formatByteSizePure(storageStatus.usageBytes)} / ${formatByteSizePure(storageStatus.quotaBytes)} (${storageStatus.percentUsed}%)`
                        : `${formatByteSizePure(storageStatus.usageBytes)} used`}
                    </span>
                  </div>

                  {storageStatus.quotaBytes > 0 && (
                    <div
                      className="h-2 rounded-full bg-[var(--barn-subtle)] overflow-hidden"
                      role="progressbar"
                      aria-label="Browser storage quota usage"
                      aria-valuenow={Math.round(storageStatus.percentUsed)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        style={{ width: `${Math.max(1, Math.min(100, storageStatus.percentUsed))}%` }}
                        className={`h-full rounded-full transition-all ${
                          storageStatus.percentUsed >= 90
                            ? 'bg-[var(--barn-danger)]'
                            : storageStatus.percentUsed >= 75
                              ? 'bg-[var(--barn-terracotta)]'
                              : 'bg-[var(--barn-sage)]'
                        }`}
                      />
                    </div>
                  )}

                  {storageStatus.percentUsed >= 75 && (
                    <p className="text-[11px] text-[var(--barn-terracotta)] font-medium">
                      Storage is above {Math.round(storageStatus.percentUsed)}% of this browser&rsquo;s
                      quota. Consider exporting a Complete .ZIP backup or choosing a smaller photo
                      optimization preset.
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {Object.values(IMAGE_OPTIMIZATION_PRESETS).map((preset) => {
                  const active = imageOptimizationPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setImageOptimizationPreset(preset.id)}
                      className={`text-left p-2.5 rounded-xl border transition-colors space-y-1 ${
                        active
                          ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                          : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] hover:border-[var(--barn-sage)]'
                      }`}
                    >
                      <div className="text-xs font-semibold">{preset.shortBadge}</div>
                      <div
                        className={`text-[11px] font-mono ${
                          active ? 'opacity-90' : 'text-[var(--barn-muted)]'
                        }`}
                      >
                        {preset.typicalSizeHint}
                      </div>
                    </button>
                  );
                })}
              </div>
              <ImageCompressionNotice />
            </div>

            <div>
              <label
                htmlFor={`${baseId}-pinnedLandingSpecies`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Pinned Startup Landing Page
              </label>
              <select
                id={`${baseId}-pinnedLandingSpecies`}
                value={pinnedLandingSpecies}
                onChange={(e) => setPinnedLandingSpecies(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              >
                <option value="">All-Species Barn Home Page (Show All Species Cards)</option>
                {speciesProfiles.map((sp) => (
                  <option key={sp.id} value={sp.name}>
                    Open Directly Inside {sp.name} Barn Hub
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              <div>
                <span className="block text-xs font-medium text-[var(--barn-muted)] mb-1.5">
                  Default Weight Display Unit
                </span>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['lbs_oz', 'Pounds & Oz'],
                      ['lbs', 'Decimal Pounds'],
                      ['kg', 'Kilograms (Metric)'],
                      ['grams', 'Grams (Metric)'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      aria-pressed={preferredUnit === val}
                      onClick={() => setPreferredUnit(val)}
                      className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                        preferredUnit === val
                          ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                          : 'border-[var(--barn-border)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--barn-muted)] mt-1">
                  Applies across the barn unless overridden per species in Edit Species Schedule.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                <div>
                  <label
                    htmlFor={`${baseId}-defaultSpecies`}
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Default Species
                  </label>
                  <select
                    id={`${baseId}-defaultSpecies`}
                    value={defaultSpecies}
                    onChange={(e) => setDefaultSpecies(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                  >
                    {speciesProfiles.map((sp) => (
                      <option key={sp.id} value={sp.name}>
                        {sp.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={`${baseId}-currencyCode`}
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Report Currency
                  </label>
                  <select
                    id={`${baseId}-currencyCode`}
                    value={currencyCode}
                    onChange={(e) => setCurrencyCode(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="CAD">CAD (CA$)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="AUD">AUD (A$)</option>
                    <option value="NZD">NZD (NZ$)</option>
                  </select>
                </div>

                <div>
                  <span className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                    Default Pedigree Depth
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {([3, 4, 5, 6] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        aria-pressed={defaultGenerations === g}
                        onClick={() => setDefaultGenerations(g)}
                        className={`min-h-[42px] px-2 py-2 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
                          defaultGenerations === g
                            ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                            : 'border-[var(--barn-border)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                        }`}
                      >
                        {g} Gen
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-[var(--barn-border)] text-xs">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showHomeSummaryGrid}
                    onChange={(e) => setShowHomeSummaryGrid(e.target.checked)}
                    className="w-4 h-4 accent-[var(--barn-sage)]"
                  />
                  <span>Show condensed 4-square summary strip on Home and Species pages</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includePhotoOnPedigree}
                    onChange={(e) => setIncludePhotoOnPedigree(e.target.checked)}
                    className="w-4 h-4 accent-[var(--barn-sage)]"
                  />
                  <span>Include animal&apos;s primary photo on printed .HTM / PDF pedigrees</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoOffloadRetiredToOpfs}
                    disabled={!opfsSupported}
                    onChange={(e) => setAutoOffloadRetiredToOpfs(e.target.checked)}
                    className="w-4 h-4 accent-[var(--barn-sage)]"
                  />
                  <span>
                    Auto-offload Sold &amp; Deceased animals&apos; heavy photos &amp; logs to OPFS{' '}
                    <code className="font-mono">/archives</code> to improve device memory while
                    preserving all data
                  </span>
                </label>
              </div>
            </div>

            <button
              type="submit"
              className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95"
            >
              Save Barn Preferences
            </button>
          </form>

          {/* System Calendar & Task Alarms (.ICS + Online Calendar) */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  System Calendar &amp; Task Alarms (.ICS / Online)
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Link an online Google Calendar, hand off to a local/desktop calendar app (like
                  desktop Outlook or Apple Calendar), or download offline .ICS files—with automatic
                  offline fallback whenever a connection isn&apos;t available.
                </p>
              </div>
              <CalendarPlus
                className="w-5 h-5 text-[var(--barn-sage)] shrink-0"
                aria-hidden="true"
              />
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
              <div className="font-semibold text-[var(--barn-ink)]">
                Calendar Destination Mode
              </div>

              <div className="space-y-2">
                {(
                  [
                    {
                      id: 'google_calendar' as CalendarDeliveryMode,
                      title: 'Link Online Google Calendar (auto-fallback to .ICS)',
                      desc: 'Add chores straight to your Google Calendar when online. Automatically falls back to offline .ICS files & links if offline or disconnected.',
                    },
                    {
                      id: 'external_app_or_ics' as CalendarDeliveryMode,
                      title: 'External / Desktop Calendar App (Outlook, Apple Calendar, Android)',
                      desc: 'Hands off .ICS directly to your device or desktop calendar app—even when that app is offline (such as desktop-hosted Outlook).',
                    },
                    {
                      id: 'offline_ics' as CalendarDeliveryMode,
                      title: 'Offline .ICS File Download Only',
                      desc: 'Always download standard .ICS calendar files locally without linking an online account.',
                    },
                  ] as const
                ).map((mode) => (
                  <label
                    key={mode.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      calendarSync.deliveryMode === mode.id
                        ? 'border-[var(--barn-sage)] bg-[var(--barn-sage)]/5'
                        : 'border-[var(--barn-border)] bg-[var(--barn-surface)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="calendar-delivery-mode"
                      checked={calendarSync.deliveryMode === mode.id}
                      onChange={() => updateCalendarSync({ deliveryMode: mode.id })}
                      className="w-4 h-4 mt-0.5 accent-[var(--barn-sage)] shrink-0"
                    />
                    <span>
                      <span className="font-semibold text-[var(--barn-ink)] block">
                        {mode.title}
                      </span>
                      <span className="text-[11px] text-[var(--barn-muted)] block mt-0.5">
                        {mode.desc}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              {calendarSync.deliveryMode === 'google_calendar' && (
                <div className="mt-2 p-3 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-3">
                  {!googleAuthConnected ? (
                    <div className="space-y-2">
                      <div className="text-[11px] text-[var(--barn-muted)]">
                        Connect your own Google account to grant Community Pedigree permission to
                        view your calendar list and add barn chore events. If you stay signed out or
                        go offline, the app automatically falls back to offline .ICS downloads.
                      </div>
                      {onConnectGoogleCalendar && (
                        <SignInWithGoogleButton
                          onClick={() => {
                            void onConnectGoogleCalendar();
                          }}
                          disabled={googleSyncBusy}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--barn-sage)]">
                          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span>
                            Connected{googleUserEmail ? ` as ${googleUserEmail}` : ' to Google Calendar'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {onRefreshGoogleCalendars && (
                            <button
                              type="button"
                              onClick={() => {
                                void onRefreshGoogleCalendars();
                              }}
                              disabled={googleSyncBusy}
                              className="inline-flex items-center gap-1 min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px] font-medium hover:bg-[var(--barn-subtle)]"
                            >
                              <RefreshCw className="w-3 h-3" aria-hidden="true" />
                              Refresh
                            </button>
                          )}
                          {onDisconnectGoogleCalendar && (
                            <button
                              type="button"
                              onClick={() => {
                                void onDisconnectGoogleCalendar();
                              }}
                              disabled={googleSyncBusy}
                              className="inline-flex items-center gap-1 min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px] font-medium hover:bg-[var(--barn-subtle)]"
                            >
                              <LogOut className="w-3 h-3" aria-hidden="true" />
                              Sign out
                            </button>
                          )}
                        </div>
                      </div>

                      {googleCalendars.length > 0 && (
                        <div className="space-y-1">
                          <label
                            htmlFor="google-target-calendar"
                            className="text-[11px] font-semibold text-[var(--barn-ink)] block"
                          >
                            Target Google Calendar
                          </label>
                          <select
                            id="google-target-calendar"
                            value={calendarSync.googleCalendarId}
                            onChange={(e) => {
                              const picked = googleCalendars.find((c) => c.id === e.target.value);
                              updateCalendarSync({
                                googleCalendarId: e.target.value,
                                googleCalendarName: picked?.summary || 'Google Calendar',
                              });
                            }}
                            className="w-full min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs"
                          >
                            {googleCalendars.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.summary}
                                {c.primary ? ' (Primary)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3 text-xs">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={calendarSync.autoAddNewTasks}
                  onChange={(e) => updateCalendarSync({ autoAddNewTasks: e.target.checked })}
                  className="w-4 h-4 mt-0.5 accent-[var(--barn-sage)] shrink-0"
                />
                <span>
                  <span className="font-semibold text-[var(--barn-ink)] block">
                    Automatically send newly added tasks to calendar
                  </span>
                  <span className="text-[11px] text-[var(--barn-muted)] block mt-0.5">
                    When enabled, new dated chores use your selected calendar mode above (and fall
                    back to offline .ICS if unable to connect).
                  </span>
                </span>
              </label>

              <div className="pl-6 space-y-2.5 border-l-2 border-[var(--barn-border)]">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={calendarSync.includeBreedingTasks}
                    onChange={(e) =>
                      updateCalendarSync({ includeBreedingTasks: e.target.checked })
                    }
                    className="w-4 h-4 accent-[var(--barn-sage)]"
                  />
                  <span>Include chores auto-generated from new breeding events</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={calendarSync.includeManualTasks}
                    onChange={(e) =>
                      updateCalendarSync({ includeManualTasks: e.target.checked })
                    }
                    className="w-4 h-4 accent-[var(--barn-sage)]"
                  />
                  <span>Include manually created barn chores</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-1.5">
                <label
                  htmlFor="calendar-reminder-time"
                  className="font-semibold text-[var(--barn-ink)] block"
                >
                  Scheduled local time on due date
                </label>
                <input
                  id="calendar-reminder-time"
                  type="time"
                  value={calendarSync.reminderTimeLocal}
                  onChange={(e) =>
                    updateCalendarSync({
                      reminderTimeLocal: e.target.value || '08:00',
                    })
                  }
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-sm font-mono"
                />
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Uses your device&apos;s local clock (30-minute chore block).
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-[var(--barn-ink)]">
                  <input
                    type="checkbox"
                    checked={calendarSync.alarmEnabled}
                    onChange={(e) => updateCalendarSync({ alarmEnabled: e.target.checked })}
                    className="w-4 h-4 accent-[var(--barn-sage)]"
                  />
                  <Bell className="w-3.5 h-3.5 text-[var(--barn-terracotta)]" aria-hidden="true" />
                  <span>Include alarm / notification</span>
                </label>

                <select
                  aria-label="Alarm lead time before scheduled task"
                  value={calendarSync.alarmMinutesBefore}
                  disabled={!calendarSync.alarmEnabled}
                  onChange={(e) =>
                    updateCalendarSync({ alarmMinutesBefore: Number(e.target.value) })
                  }
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs disabled:opacity-50"
                >
                  {CALENDAR_ALARM_LEAD_OPTIONS.map((opt) => (
                    <option key={opt.minutes} value={opt.minutes}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
              <div className="font-semibold text-[var(--barn-ink)]">
                Task Naming (App &amp; External Calendars)
              </div>
              <p className="text-[11px] text-[var(--barn-muted)]">
                Controls how animal identifiers appear in task titles across the app and in
                exported external calendar events. Species is appended to external calendar titles,
                and exported events include a direct link back into the app task entry.
              </p>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={calendarSync.includeAnimalName}
                  onChange={(e) => updateCalendarSync({ includeAnimalName: e.target.checked })}
                  className="w-4 h-4 mt-0.5 accent-[var(--barn-sage)] shrink-0"
                />
                <span>
                  <span className="font-medium text-[var(--barn-ink)] block">
                    Include animal name in task titles
                  </span>
                  <span className="text-[11px] text-[var(--barn-muted)] block">
                    Uncheck to exclude animal names completely and show Animal ID (Tattoo / Tag / Microchip) instead.
                  </span>
                </span>
              </label>

              <div className="pl-6 border-l-2 border-[var(--barn-border)]">
                <label
                  className={`flex items-start gap-2.5 ${
                    calendarSync.includeAnimalName
                      ? 'cursor-pointer'
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={calendarSync.includeAnimalPrefix}
                    disabled={!calendarSync.includeAnimalName}
                    onChange={(e) =>
                      updateCalendarSync({ includeAnimalPrefix: e.target.checked })
                    }
                    className="w-4 h-4 mt-0.5 accent-[var(--barn-sage)] shrink-0"
                  />
                  <span>
                    <span className="font-medium text-[var(--barn-ink)] block">
                      Include species / herd name prefix
                    </span>
                    <span className="text-[11px] text-[var(--barn-muted)] block">
                      Uncheck to strip your configured species prefix (e.g. show{' '}
                      <span className="font-mono">Briar</span> instead of{' '}
                      <span className="font-mono">Copper Creek Briar</span>).
                    </span>
                  </span>
                </label>
              </div>

              <div className="p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[11px] space-y-1">
                {(() => {
                  const activeSp = speciesProfiles.find(
                    (sp) => sp.name.toLowerCase() === activeSpeciesName.toLowerCase()
                  );
                  const spLabel = activeSp?.name || activeSpeciesName || 'Rabbit';
                  const samplePrefix = (activeSp?.defaultAnimalPrefix || '').trim() || 'Copper Creek';
                  const sampleDam = !calendarSync.includeAnimalName
                    ? 'NZR-102'
                    : calendarSync.includeAnimalPrefix
                      ? `${samplePrefix} Briar`
                      : 'Briar';
                  const sampleSire = !calendarSync.includeAnimalName
                    ? 'NZR-051'
                    : calendarSync.includeAnimalPrefix
                      ? `${samplePrefix} Marshal`
                      : 'Marshal';
                  const appSample = `Palpation Check: ${sampleDam} (× ${sampleSire})`;
                  return (
                    <>
                      <div>
                        <span className="text-[var(--barn-muted)] mr-1.5">App task preview:</span>
                        <span className="font-mono text-[var(--barn-ink)] font-medium">
                          {appSample}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--barn-muted)] mr-1.5">Calendar preview:</span>
                        <span className="font-mono text-[var(--barn-ink)] font-medium">
                          {`${appSample} [${spLabel}]`}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {onExportTasksToCalendar && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-[var(--barn-muted)]">
                  {openDatedTasks.length} open dated{' '}
                  {openDatedTasks.length === 1 ? 'task' : 'tasks'} ready across all species
                </span>
                <button
                  type="button"
                  disabled={openDatedTasks.length === 0}
                  onClick={() => onExportTasksToCalendar(openDatedTasks, 'open-barn-tasks')}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold disabled:opacity-50"
                >
                  <CalendarPlus className="w-3.5 h-3.5" aria-hidden="true" />
                  Export {openDatedTasks.length} Open Dated{' '}
                  {openDatedTasks.length === 1 ? 'Task' : 'Tasks'} (.ICS)
                </button>
              </div>
            )}
          </section>

          {/* Routine Home Screen Install CTA */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold">
                <Smartphone className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                <span>
                  {isInstalled
                    ? 'Installed as Standalone Offline App'
                    : 'Install App to Home Screen (Offline Barn Mode)'}
                </span>
              </div>
              {canPromptInstall && (
                <button
                  type="button"
                  onClick={() => void promptInstall()}
                  className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap"
                >
                  Install App Now
                </button>
              )}
            </div>
            {isIos && !isInstalled ? (
              <p className="text-[11px] text-[var(--barn-muted)]">
                On iPhone/iPad Safari: tap the <strong>Share</strong> icon and choose{' '}
                <strong>Add to Home Screen</strong> so iOS elevates storage priority and prevents
                7-day unvisited-tab cleanup.
              </p>
            ) : !isInstalled ? (
              <p className="text-[11px] text-[var(--barn-muted)]">
                Use your browser menu &rarr; <strong>Install App</strong> /{' '}
                <strong>Add to Home Screen</strong> so the app shell loads identically in Airplane
                Mode or dead-zone barns.
              </p>
            ) : (
              <p className="text-[11px] text-[var(--barn-muted)]">
                Running in standalone offline PWA mode. Advanced storage locks, connectivity tests,
                and release gates live inside <strong>The Techy Stuff</strong>.
              </p>
            )}
          </section>

          {/* Appearance, Light/Dark Switcher & Custom Color Picker */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  Appearance &amp; Custom Color Studio
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Switch between Warm Light and Original Woodland Dark, or customize your barn
                  palette
                </p>
              </div>
              <Palette className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            </div>

            <div>
              <span className="block text-xs font-medium text-[var(--barn-muted)] mb-1.5">
                Theme Mode
              </span>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                <button
                  type="button"
                  aria-pressed={!isDark}
                  onClick={() => onUpdateSettings({ themeMode: 'light' })}
                  className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
                    !isDark
                      ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                      : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  <Sun className="w-4 h-4" aria-hidden="true" />
                  Light · Warm Parchment
                </button>
                <button
                  type="button"
                  aria-pressed={isDark}
                  onClick={() => onUpdateSettings({ themeMode: 'dark' })}
                  className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
                    isDark
                      ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                      : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  <Moon className="w-4 h-4" aria-hidden="true" />
                  Dark · Original Woodland
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--barn-muted)]">
                  Warm Barn Palette Presets
                </span>
                <button
                  type="button"
                  onClick={handleResetColors}
                  className="text-xs text-[var(--barn-muted)] hover:text-[var(--barn-ink)] inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  Reset Default Warmth
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {WARM_THEME_PRESETS.map((preset) => {
                  const pBg = isDark ? preset.colors.darkSurface : preset.colors.lightSurface;
                  const pPrimary = isDark ? preset.colors.darkPrimary : preset.colors.lightPrimary;
                  const pAccent = isDark ? preset.colors.darkAccent : preset.colors.lightAccent;
                  const pMale = isDark ? preset.colors.darkMale : preset.colors.lightMale;

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyPreset(preset.colors)}
                      className="text-left p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] transition-colors space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold truncate">{preset.name}</span>
                        <span className="flex items-center gap-1 shrink-0" aria-hidden="true">
                          {[pBg, pPrimary, pAccent, pMale].map((hex, i) => (
                            <span
                              key={i}
                              style={{ backgroundColor: hex }}
                              className="w-3.5 h-3.5 rounded-full border border-black/20"
                            />
                          ))}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--barn-muted)] line-clamp-1">
                        {preset.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-[var(--barn-border)] pt-4 space-y-3">
              <div className="text-xs font-medium text-[var(--barn-muted)]">
                Custom {isDark ? 'Dark' : 'Light'} Mode Color Picker
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {colorPickersForMode.map(({ key, label, hint }) => {
                  const val = activeColorValue(key);
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] cursor-pointer hover:border-[var(--barn-sage)] transition-colors"
                    >
                      <input
                        type="color"
                        value={val}
                        onChange={(e) => handleColorPick(key, e.target.value)}
                        aria-label={label}
                        className="w-9 h-9 rounded-lg border border-[var(--barn-border)] bg-transparent cursor-pointer shrink-0 p-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium truncate">{label}</span>
                          <span className="text-[11px] font-mono text-[var(--barn-muted)]">
                            {val}
                          </span>
                        </div>
                        <div className="text-[10px] text-[var(--barn-muted)] truncate">{hint}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        {/* Right 6 Columns: Import/Export Hub Launcher, Diagnostics & Reset Controls */}
        <div className="lg:col-span-6 space-y-6">
          {/* Consolidated Import/Export Hub Summary & Direct Section Launchers */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  Import, Export &amp; Backup Hub
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  All system backups, native restores, zero-cloud peer sync, external importers
                  (HerdBoss, Evans .HTM, CSV), and non-native exporters live in one dedicated workspace.
                </p>
              </div>
              <ArrowLeftRight
                className="w-5 h-5 text-[var(--barn-sage)] shrink-0"
                aria-hidden="true"
              />
            </div>

            {backupStatus && (
              <div
                className={`p-3 rounded-xl border text-xs space-y-1 ${
                  backupStatus.level === 'up_to_date'
                    ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)]'
                    : 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-[var(--barn-ink)]">
                  <span>{backupStatus.headline}</span>
                  <span className="font-mono tabular-nums text-[11px] text-[var(--barn-muted)]">
                    {opfsVaultBackups.length + rollingBackups.length} local vault snapshot
                    {opfsVaultBackups.length + rollingBackups.length === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Last export: {backupStatus.lastExportLabel} · Latest change:{' '}
                  {backupStatus.latestChangeLabel}
                </p>
              </div>
            )}

            {quickBackupError && (
              <div
                role="alert"
                className="p-2.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)] font-medium"
              >
                {quickBackupError}
              </div>
            )}

            {quickBackupFeedback && !quickBackupError && (
              <div
                role="status"
                aria-live="polite"
                className="p-2.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs"
              >
                {quickBackupFeedback}
              </div>
            )}

            {onOpenImportExportHub && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenImportExportHub('all')}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-2 hover:opacity-95"
                  >
                    <ArrowLeftRight className="w-4 h-4" aria-hidden="true" />
                    Open Import / Export Hub
                  </button>

                  <button
                    type="button"
                    disabled={zipExportBusy !== null || archiveExportLock.isSubmitting}
                    onClick={handleDownloadTimestampedFullBackup}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    <Download className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                    {zipExportBusy === 'json' ? 'Preparing JSON...' : 'Download Quick JSON Backup'}
                  </button>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenImportExportHub('sync')}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-[var(--barn-sage)]/45 bg-[var(--barn-sage-tint)]/35 hover:bg-[var(--barn-sage-tint)]/60 text-xs font-medium inline-flex items-center justify-center gap-1.5"
                  >
                    <FolderSync className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                    <span className="truncate">Sync / Multi-Device</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenImportExportHub('backup')}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center justify-center gap-1.5"
                  >
                    <Database className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                    <span className="truncate">System Backup</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenImportExportHub('imports')}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center justify-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                    <span className="truncate">Imports</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenImportExportHub('exporters')}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                    <span className="truncate">Exporters</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Developer & Troubleshooting Page Launcher ("The Techy Stuff") */}
          {onOpenTechyStuff && (
            <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-semibold">
                    The Techy Stuff (Developer &amp; Troubleshooting)
                  </h2>
                  <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                    Isolated troubleshooting workspace for advanced diagnostics, memory/tier
                    hierarchy guidelines, OPFS &amp; IndexedDB quota checks, connectivity probes,
                    release gates, and safeguarded resets.
                  </p>
                </div>
                <Terminal className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              </div>

              <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[11px] text-[var(--barn-muted)] leading-relaxed">
                Includes permanent Tier/Memory Hierarchy documentation, Crash &amp; Heap Logs,
                Bug Report .ZIP Bundler, DB Health Auto-Repair, Photo Footprint Pruner, Cache Purge,
                and Factory/Sync Reset safeguards.
              </div>

              <button
                type="button"
                onClick={onOpenTechyStuff}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)]/55 hover:bg-[var(--barn-sage-tint)] text-xs font-semibold text-[var(--barn-ink)] inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Terminal className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                Open &ldquo;The Techy Stuff&rdquo; Developer Console
              </button>
            </section>
          )}

          {/* Non-intrusive Help & Keyboard Shortcuts Footer */}
          <footer className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl px-5 py-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-[var(--barn-muted)]">
                Need quick screen navigation or modal keyboard controls?
              </div>
              <button
                type="button"
                onClick={() => setShowShortcutHelp((prev) => !prev)}
                aria-expanded={showShortcutHelp}
                aria-controls="settings-keyboard-shortcuts-panel"
                className="min-h-[34px] px-3 py-1 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium text-[var(--barn-ink)] inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <HelpCircle className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                {showShortcutHelp ? 'Hide Help & Shortcuts' : 'Help · Keyboard Shortcuts'}
              </button>
            </div>

            {showShortcutHelp && (
              <div
                id="settings-keyboard-shortcuts-panel"
                className="border-t border-[var(--barn-border)] pt-3 space-y-2 text-xs"
              >
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Active navigation keys (active when not typing in a field or dialog):
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {[
                    { key: 'H', label: 'All Species Home' },
                    { key: 'D', label: 'Species Dashboard' },
                    { key: 'R', label: 'Herd Registry (or Picker on Home)' },
                    { key: 'B', label: 'Breeding Lab' },
                    { key: 'P', label: 'Pedigree Explorer' },
                    { key: 'O', label: 'Reports' },
                    { key: 'I', label: 'Import / Export Hub' },
                    { key: 'S', label: 'Settings' },
                    { key: '?', label: 'Quick Shortcuts Help Dialog' },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                    >
                      <span className="text-[var(--barn-ink)] font-medium">{item.label}</span>
                      <kbd className="px-2 py-0.5 rounded bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-[11px] font-semibold shrink-0">
                        {item.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </footer>
        </div>
      </div>

      {showCustomSpeciesModal && (
        <SpeciesEditorModal
          initialProfile={null}
          existingNames={speciesProfiles.map((sp) => sp.name)}
          onSave={onSaveSpecies}
          onDelete={onDeleteSpecies}
          onDownloadTimestampedBackup={onDownloadTimestampedSpeciesBackup}
          onClose={() => setShowCustomSpeciesModal(false)}
        />
      )}
    </div>
  );
}
```

<!-- END OF PART 06 OF 16 (9 files) -->
