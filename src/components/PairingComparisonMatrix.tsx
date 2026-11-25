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
import { Animal, isAnimalArchived, SpeciesProfile } from '../domain/models';
import {
  buildPairingComparisonMatrix,
  DEFAULT_MATRIX_INITIAL_SELECTION,
  MAX_MATRIX_CANDIDATES,
  PairingAnchorRole,
  PairingMatrixRow,
  PairingMatrixSortBy,
  selectDefaultMatrixCandidateIds,
} from '../domain/pairingMatrix';
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
