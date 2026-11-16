/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Species-Isolated Breeding Simulator, Coat Color Punnett Lab & Master Task List Logger (`Breeding`).
 *
 * Strictly filters Sire (`Male`) and Dam (`Female`) candidates to `activeData.speciesProfile.name`.
 * Logging a breeding automatically cascades downstream barn chores via the `Master Task List`.
 */

import { Trash2, UserPlus } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { formatSystemTaskTitle } from '../core/calendarExport';
import { simulatePairingGenetics } from '../core/geneticsEngine';
import {
  addDaysIso,
  Animal,
  BarnSettings,
  BREEDING_STATUSES,
  BreedingRecord,
  BreedingStatus,
  formatBreedingStatusForSpecies,
  formatReadableDate,
  isAnimalArchived,
  todayDateIso,
} from '../core/models';
import { calculatePairingCoi, getPedigreeCompletenessSummary } from '../core/pedigreeCalculator';
import { generateCascadedTasksForBreeding } from '../core/taskMaster';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import { ColorGeneticsNotice } from './ColorGeneticsNotice';
import { SearchableParentPicker } from './SearchableParentPicker';

interface BreedingScreenProps {
  activeData: ActiveSpeciesData;
  settings?: BarnSettings;
  onLogBreeding: (params: {
    sire?: Animal;
    quickSireName?: string;
    dam?: Animal;
    quickDamName?: string;
    bredDateIso: string;
    status: BreedingStatus;
    notes: string;
    autoScheduleChores: boolean;
  }) => void;
  onUpdateOutcome: (
    existing: BreedingRecord,
    patch: {
      status: BreedingStatus;
      actualBirthDateIso: string;
      liveCount: number;
      stillbornCount: number;
      fosteredCount: number;
      weanedCount: number;
      notes: string;
      registerJuniorCount: number;
    }
  ) => void;
  onDeleteBreeding: (id: string) => void;
}

export function BreedingScreen({
  activeData,
  settings,
  onLogBreeding,
  onUpdateOutcome,
  onDeleteBreeding,
}: BreedingScreenProps) {
  const { speciesProfile, animals, herdById, breedings } = activeData;
  const [includeArchivedParents, setIncludeArchivedParents] = useState(false);

  const archivedCount = useMemo(
    () => animals.filter((a) => isAnimalArchived(a)).length,
    [animals]
  );

  const males = useMemo(
    () =>
      animals.filter(
        (a) =>
          a.sex === 'Male' &&
          (!isAnimalArchived(a) || includeArchivedParents)
      ),
    [animals, includeArchivedParents]
  );
  const females = useMemo(
    () =>
      animals.filter(
        (a) =>
          a.sex === 'Female' &&
          (!isAnimalArchived(a) || includeArchivedParents)
      ),
    [animals, includeArchivedParents]
  );

  const [sireId, setSireId] = useState<string>(males[0]?.id || '');
  const [damId, setDamId] = useState<string>(females[0]?.id || '');
  const [quickAddSire, setQuickAddSire] = useState<boolean>(males.length === 0);
  const [quickSireName, setQuickSireName] = useState<string>('');
  const [quickAddDam, setQuickAddDam] = useState<boolean>(females.length === 0);
  const [quickDamName, setQuickDamName] = useState<string>('');
  const [bredDateIso, setBredDateIso] = useState<string>(todayDateIso());
  const [status, setStatus] = useState<BreedingStatus>('Bred');
  const [autoCascade, setAutoCascade] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('');

  // Keep selected Sire & Dam synchronized whenever user switches active species or toggles Include Archived
  useEffect(() => {
    if (!males.some((m) => m.id === sireId)) {
      setSireId(males[0]?.id || '');
    }
    if (males.length === 0) {
      setQuickAddSire(true);
    }
    if (!females.some((f) => f.id === damId)) {
      setDamId(females[0]?.id || '');
    }
    if (females.length === 0) {
      setQuickAddDam(true);
    }
  }, [males, females, sireId, damId]);

  useEffect(() => {
    setQuickAddSire(males.length === 0);
    setQuickSireName('');
    setQuickAddDam(females.length === 0);
    setQuickDamName('');
  }, [speciesProfile.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Outcome modal state
  const [editingRecord, setEditingRecord] = useState<BreedingRecord | null>(null);
  const [outStatus, setOutStatus] = useState<BreedingStatus>('Born');
  const [outBirthIso, setOutBirthIso] = useState('');
  const [outLive, setOutLive] = useState('0');
  const [outStillborn, setOutStillborn] = useState('0');
  const [outFostered, setOutFostered] = useState('0');
  const [outWeaned, setOutWeaned] = useState('0');
  const [outRegisterCount, setOutRegisterCount] = useState('0');
  const [outNotes, setOutNotes] = useState('');

  const usingQuickSire = quickAddSire || males.length === 0;
  const usingQuickDam = quickAddDam || females.length === 0;

  const selectedSire = !usingQuickSire && sireId ? herdById.get(sireId) : undefined;
  const selectedDam = !usingQuickDam && damId ? herdById.get(damId) : undefined;

  const effectiveSire = useMemo<Animal | undefined>(() => {
    if (!usingQuickSire) return selectedSire;
    const trimmed = quickSireName.trim();
    if (!trimmed) return undefined;
    return {
      id: '__quick_sire__',
      tattoo: '',
      name: trimmed,
      species: speciesProfile.name,
      breed: '',
      variety: '',
      sex: 'Male',
      status: 'Active',
      archived: false,
      needsAttention: true,
      birthDateIso: '',
      weightGrams: 0,
      genotype: [],
      genotypeRaw: '',
      registrationNumber: '',
      grandChampionNumber: '',
      legsCount: 0,
      cageLocation: '',
      breederName: '',
      ownerName: '',
      sireId: '',
      damId: '',
      notes: '',
      createdAt: '',
      updatedAt: '',
    };
  }, [usingQuickSire, selectedSire, quickSireName, speciesProfile.name]);

  const effectiveDam = useMemo<Animal | undefined>(() => {
    if (!usingQuickDam) return selectedDam;
    const trimmed = quickDamName.trim();
    if (!trimmed) return undefined;
    return {
      id: '__quick_dam__',
      tattoo: '',
      name: trimmed,
      species: speciesProfile.name,
      breed: '',
      variety: '',
      sex: 'Female',
      status: 'Active',
      archived: false,
      needsAttention: true,
      birthDateIso: '',
      weightGrams: 0,
      genotype: [],
      genotypeRaw: '',
      registrationNumber: '',
      grandChampionNumber: '',
      legsCount: 0,
      cageLocation: '',
      breederName: '',
      ownerName: '',
      sireId: '',
      damId: '',
      notes: '',
      createdAt: '',
      updatedAt: '',
    };
  }, [usingQuickDam, selectedDam, quickDamName, speciesProfile.name]);

  const coiAnalysis = useMemo(() => {
    if (!selectedSire || !selectedDam) return null;
    return calculatePairingCoi(selectedSire.id, selectedDam.id, herdById);
  }, [selectedSire, selectedDam, herdById]);

  const geneticsPreview = useMemo(() => {
    if (!selectedSire || !selectedDam) return null;
    return simulatePairingGenetics(selectedSire, selectedDam);
  }, [selectedSire, selectedDam]);

  const previewTasks = useMemo(() => {
    if (!effectiveSire || !effectiveDam || !bredDateIso) return [];
    const mockBreeding: BreedingRecord = {
      id: 'preview',
      species: speciesProfile.name,
      sireId: effectiveSire.id,
      damId: effectiveDam.id,
      sireName: effectiveSire.name,
      damName: effectiveDam.name,
      bredDateIso,
      expectedDueDateIso: addDaysIso(bredDateIso, speciesProfile.gestationDays),
      actualBirthDateIso: '',
      projectedCoiPercent: coiAnalysis?.coiPercent ?? 0,
      liveCount: 0,
      stillbornCount: 0,
      fosteredCount: 0,
      weanedCount: 0,
      offspringCreated: false,
      status,
      notes: '',
      createdAt: '',
      updatedAt: '',
    };
    const rawTasks = generateCascadedTasksForBreeding(mockBreeding, speciesProfile);
    return rawTasks.map((pt) => ({
      ...pt,
      displayTitle: formatSystemTaskTitle(pt, settings?.calendarSync, {
        animals: [effectiveSire, effectiveDam],
        breedings: [mockBreeding],
        speciesProfiles: [speciesProfile],
      }),
    }));
  }, [effectiveSire, effectiveDam, bredDateIso, speciesProfile, coiAnalysis, status, settings]);

  const canSubmitBreeding =
    (usingQuickSire ? Boolean(quickSireName.trim()) : Boolean(selectedSire)) &&
    (usingQuickDam ? Boolean(quickDamName.trim()) : Boolean(selectedDam)) &&
    Boolean(bredDateIso);

  const handleLogSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitBreeding) return;
    onLogBreeding({
      sire: usingQuickSire ? undefined : selectedSire,
      quickSireName: usingQuickSire ? quickSireName.trim() : undefined,
      dam: usingQuickDam ? undefined : selectedDam,
      quickDamName: usingQuickDam ? quickDamName.trim() : undefined,
      bredDateIso,
      status,
      notes,
      autoScheduleChores: autoCascade,
    });
    setNotes('');
    if (usingQuickSire) {
      setQuickSireName('');
      if (males.length > 0) setQuickAddSire(false);
    }
    if (usingQuickDam) {
      setQuickDamName('');
      if (females.length > 0) setQuickAddDam(false);
    }
  };

  const openOutcomeModal = (rec: BreedingRecord) => {
    setEditingRecord(rec);
    setOutStatus(rec.status === 'Bred' || rec.status === 'Palpated Positive' ? 'Born' : rec.status);
    setOutBirthIso(rec.actualBirthDateIso || rec.expectedDueDateIso || todayDateIso());
    setOutLive(String(rec.liveCount || 0));
    setOutStillborn(String(rec.stillbornCount || 0));
    setOutFostered(String(rec.fosteredCount || 0));
    setOutWeaned(String(rec.weanedCount || 0));
    setOutRegisterCount('0');
    setOutNotes(rec.notes || '');
  };

  const submitOutcome = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    onUpdateOutcome(editingRecord, {
      status: outStatus,
      actualBirthDateIso: outBirthIso,
      liveCount: Math.max(0, Number(outLive) || 0),
      stillbornCount: Math.max(0, Number(outStillborn) || 0),
      fosteredCount: Number(outFostered) || 0,
      weanedCount: Math.max(0, Number(outWeaned) || 0),
      notes: outNotes,
      registerJuniorCount: Math.max(0, Number(outRegisterCount) || 0),
    });
    setEditingRecord(null);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 6 Columns: Cage-Side Pairing Logger & Master Task List Preview */}
        <section className="lg:col-span-6 bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-semibold">
                {speciesProfile.name} Pairing &amp; Cage-Side Logger
              </h2>
              <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                Select or quick-type a {speciesProfile.maleLabel} and {speciesProfile.femaleLabel} to
                test Wright COI, coat color Punnett ratios, and auto-schedule barn tasks.
              </p>
            </div>
            {archivedCount > 0 && (
              <label className="inline-flex items-center gap-1.5 text-xs text-[var(--barn-ink)] cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={includeArchivedParents}
                  onChange={(e) => setIncludeArchivedParents(e.target.checked)}
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                Include Archived ({archivedCount})
              </label>
            )}
          </div>

          <form onSubmit={handleLogSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-[var(--barn-muted)]">
                    Sire ({speciesProfile.maleLabel})
                  </label>
                  {males.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setQuickAddSire((v) => !v)}
                      className="text-[11px] font-medium text-[var(--barn-sage)] hover:underline inline-flex items-center gap-1"
                    >
                      <UserPlus className="w-3 h-3" aria-hidden="true" />
                      {usingQuickSire ? 'Pick from herd' : 'Or type new'}
                    </button>
                  )}
                </div>

                {usingQuickSire ? (
                  <div className="space-y-1">
                    <input
                      type="text"
                      required
                      placeholder={`Type unlisted ${speciesProfile.maleLabel} name...`}
                      value={quickSireName}
                      onChange={(e) => setQuickSireName(e.target.value)}
                      className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-terracotta)]/70 text-sm"
                    />
                    <p className="text-[11px] text-[var(--barn-terracotta)]">
                      Auto-adds to {speciesProfile.name} Herd as {speciesProfile.maleLabel} (Needs
                      Attention)
                    </p>
                  </div>
                ) : includeArchivedParents ? (
                  <SearchableParentPicker
                    label={`Sire (${speciesProfile.maleLabel})`}
                    value={sireId}
                    candidates={males}
                    placeholder={`Search ${speciesProfile.maleLabel}s (incl. archived)...`}
                    onChange={(id) => setSireId(id)}
                  />
                ) : (
                  <select
                    value={sireId}
                    onChange={(e) => setSireId(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                  >
                    {males.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.tattoo})
                        {isAnimalArchived(m) ? ' [Archived]' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-[var(--barn-muted)]">
                    Dam ({speciesProfile.femaleLabel})
                  </label>
                  {females.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setQuickAddDam((v) => !v)}
                      className="text-[11px] font-medium text-[var(--barn-sage)] hover:underline inline-flex items-center gap-1"
                    >
                      <UserPlus className="w-3 h-3" aria-hidden="true" />
                      {usingQuickDam ? 'Pick from herd' : 'Or type new'}
                    </button>
                  )}
                </div>

                {usingQuickDam ? (
                  <div className="space-y-1">
                    <input
                      type="text"
                      required
                      placeholder={`Type unlisted ${speciesProfile.femaleLabel} name...`}
                      value={quickDamName}
                      onChange={(e) => setQuickDamName(e.target.value)}
                      className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-terracotta)]/70 text-sm"
                    />
                    <p className="text-[11px] text-[var(--barn-terracotta)]">
                      Auto-adds to {speciesProfile.name} Herd as {speciesProfile.femaleLabel}{' '}
                      (Needs Attention)
                    </p>
                  </div>
                ) : includeArchivedParents ? (
                  <SearchableParentPicker
                    label={`Dam (${speciesProfile.femaleLabel})`}
                    value={damId}
                    candidates={females}
                    placeholder={`Search ${speciesProfile.femaleLabel}s (incl. archived)...`}
                    onChange={(id) => setDamId(id)}
                  />
                ) : (
                  <select
                    value={damId}
                    onChange={(e) => setDamId(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                  >
                    {females.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.tattoo})
                        {isAnimalArchived(f) ? ' [Archived]' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                  Breeding Date
                </label>
                <input
                  type="date"
                  required
                  value={bredDateIso}
                  onChange={(e) => setBredDateIso(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                  Initial Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as BreedingStatus)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                >
                  <option value="Bred">Bred Today / Confirmed Fall-Offs</option>
                  <option value="Planned">Planned Pairing</option>
                  <option value="Palpated Positive">Palpated / Confirmed Pregnant</option>
                </select>
              </div>
            </div>

            <input
              type="text"
              placeholder="Cage-side notes (e.g. 2 fall-offs at 7:15 AM)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
            />

            <label className="flex items-start gap-2.5 text-xs cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={autoCascade}
                onChange={(e) => setAutoCascade(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <strong>Auto-cascade {previewTasks.length} Master Task List chores</strong> (Expected{' '}
                {speciesProfile.birthEventLabel}:{' '}
                {formatReadableDate(addDaysIso(bredDateIso, speciesProfile.gestationDays))})
              </span>
            </label>

            {autoCascade && previewTasks.length > 0 && (
              <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-1 text-xs">
                {previewTasks.map((pt, i) => (
                  <div
                    key={i}
                    className="flex justify-between gap-3 text-[var(--barn-muted)] font-mono tabular-nums"
                  >
                    <span className="font-sans truncate text-[var(--barn-ink)]">
                      {pt.displayTitle}
                    </span>
                    <span className="shrink-0">{formatReadableDate(pt.dueDateIso)}</span>
                  </div>
                ))}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmitBreeding}
              className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-sm font-semibold hover:opacity-95 disabled:opacity-45 disabled:pointer-events-none transition-opacity"
            >
              Log {speciesProfile.name} Breeding
            </button>
          </form>
        </section>

        {/* Right 6 Columns: Live Wright COI & Coat Color Punnett Breakdown */}
        <section className="lg:col-span-6 bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-5">
          <div className="space-y-2">
            <h2 className="font-display text-xl font-semibold">
              Projected Kinship (Wright COI) &amp; Punnett Analysis
            </h2>
            <ColorGeneticsNotice />
          </div>

          {!coiAnalysis ? (
            <p className="text-sm text-[var(--barn-muted)]">
              {usingQuickSire || usingQuickDam
                ? 'Quick-added parent records start with unknown lineage and genotype. Task scheduling still runs immediately — update the flagged record in Herd later to unlock COI and Punnett analysis.'
                : `Pick a ${speciesProfile.maleLabel} and ${speciesProfile.femaleLabel} on the left to view genetic projections.`}
            </p>
          ) : (() => {
            const completeness = getPedigreeCompletenessSummary(coiAnalysis);
            return (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-xs text-[var(--barn-muted)]">
                      Projected Offspring Inbreeding Coefficient
                    </div>
                    <div className="font-mono text-3xl font-semibold tabular-nums mt-0.5">
                      {coiAnalysis.coiPercent.toFixed(2)}%
                    </div>
                    <div className="text-xs text-[var(--barn-muted)] mt-1">
                      {coiAnalysis.risk.label} — {coiAnalysis.risk.guidance}
                    </div>
                  </div>
                  <div className="text-right text-xs font-mono tabular-nums text-[var(--barn-muted)]">
                    <div>
                      3-Gen Known: {completeness.known3Gen} / {completeness.max3Gen} ({completeness.percent3Gen}%)
                    </div>
                    <div>
                      4-Gen Known: {completeness.known4Gen} / {completeness.max4Gen}
                    </div>
                  </div>
                </div>
                {completeness.isIncompleteZeroOutcross && (
                  <p className="text-[11px] text-[var(--barn-muted)] border-t border-[var(--barn-border)]/70 pt-2">
                    Incomplete pedigree ({completeness.known3Gen}/{completeness.max3Gen} 3-gen ancestors recorded) — 0.00% reflects missing lineage records, not necessarily a full outcross.
                  </p>
                )}
              </div>

              {coiAnalysis.sharedAncestors.length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-xs font-semibold text-[var(--barn-muted)]">
                      Shared Ancestor Path Contributions
                    </h3>
                    <span className="text-[11px] text-[var(--barn-muted)]">
                      Evaluated to depth of 8 generations
                    </span>
                  </div>
                  <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl text-xs">
                    {coiAnalysis.sharedAncestors.map((sa) => (
                      <div
                        key={sa.ancestor.id}
                        className="flex items-center justify-between px-3.5 py-2.5"
                      >
                        <div>
                          <span className="font-medium">{sa.ancestor.name}</span>{' '}
                          <span className="font-mono text-[var(--barn-muted)]">
                            ({sa.ancestor.tattoo})
                          </span>
                          <div className="text-[var(--barn-muted)]">
                            {sa.sireAppearances}× on Sire line · {sa.damAppearances}× on Dam line
                          </div>
                        </div>
                        <span className="font-mono font-semibold tabular-nums">
                          +{sa.coiContributionPercent.toFixed(2)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {geneticsPreview && geneticsPreview.locusBreakdowns.length > 0 && (
                <div className="space-y-3 border-t border-[var(--barn-border)] pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">Coat Color Punnett Predictions</h3>
                      <ColorGeneticsNotice compact />
                    </div>
                    {geneticsPreview.hasUnknownAlleles && (
                      <span className="text-[11px] text-[var(--barn-muted)]">
                        Includes unknown &lsquo;_&rsquo; carrier slots
                      </span>
                    )}
                  </div>

                  {geneticsPreview.predictedPhenotypes.length > 0 && (
                    <div className="space-y-1.5 text-xs">
                      {geneticsPreview.predictedPhenotypes.map((ph) => (
                        <div
                          key={ph.label}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                        >
                          <div>
                            <span className="font-medium">{ph.label}</span>
                            <span className="font-mono text-[var(--barn-muted)] ml-2">
                              {ph.genotypeSummary}
                            </span>
                          </div>
                          <span className="font-mono font-semibold tabular-nums">
                            {ph.probabilityPercent.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    {geneticsPreview.locusBreakdowns.map((lb) => (
                      <div
                        key={lb.locus}
                        className="p-2.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                      >
                        <div className="font-semibold">
                          {lb.locusName}{' '}
                          <span className="font-mono text-[var(--barn-muted)]">
                            ({lb.sirePair}×{lb.damPair})
                          </span>
                        </div>
                        <div className="font-mono text-[11px] text-[var(--barn-muted)] mt-1 space-y-0.5 tabular-nums">
                          {lb.outcomes.map((o) => (
                            <div key={o.genotype} className="flex justify-between">
                              <span>{o.genotype}</span>
                              <span>{o.probabilityPercent}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            );
          })()}
        </section>
      </div>

      {/* Species Breeding & Litter History Ledger */}
      <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4">
        <div className="space-y-2">
          <h2 className="font-display text-lg font-semibold">
            {speciesProfile.name} Breeding &amp; {speciesProfile.birthEventLabel} Ledger (
            {breedings.length})
          </h2>
        </div>

        {breedings.length === 0 ? (
          <p className="text-sm text-[var(--barn-muted)]">
            No {speciesProfile.name.toLowerCase()} pairings recorded yet.
          </p>
        ) : (
          <div className="divide-y divide-[var(--barn-border)]">
            {breedings.map((b) => (
              <div
                key={b.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="text-sm font-semibold">
                    {b.damName} × {b.sireName}{' '}
                    <span className="text-xs font-normal text-[var(--barn-muted)]">
                      · {formatBreedingStatusForSpecies(b.status, speciesProfile)} · COI{' '}
                      {b.projectedCoiPercent.toFixed(2)}%
                    </span>
                  </div>
                  <div className="text-xs text-[var(--barn-muted)] font-mono tabular-nums">
                    Bred {formatReadableDate(b.bredDateIso)} · Due{' '}
                    {formatReadableDate(b.expectedDueDateIso)}
                    {b.actualBirthDateIso
                      ? ` · ${speciesProfile.birthEventLabel}: ${formatReadableDate(b.actualBirthDateIso)}`
                      : ''}
                    {b.liveCount > 0 || b.stillbornCount > 0
                      ? ` · ${b.liveCount} live / ${b.stillbornCount} stillborn / ${b.weanedCount} weaned`
                      : ''}
                  </div>
                  {b.notes && <div className="text-xs text-[var(--barn-muted)]">{b.notes}</div>}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openOutcomeModal(b)}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap"
                  >
                    Log {speciesProfile.birthEventLabel} / Counts
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteBreeding(b.id)}
                    aria-label="Delete breeding record"
                    className="min-h-[38px] min-w-[38px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Litter / Birth Outcome Modal */}
      {editingRecord && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Update Litter Outcome"
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={submitOutcome}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-lg p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-semibold">
              Update {speciesProfile.birthEventLabel}: {editingRecord.damName} ×{' '}
              {editingRecord.sireName}
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[var(--barn-muted)] mb-1">Status</label>
                <select
                  value={outStatus}
                  onChange={(e) => setOutStatus(e.target.value as BreedingStatus)}
                  className="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  {BREEDING_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {formatBreedingStatusForSpecies(st, speciesProfile)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[var(--barn-muted)] mb-1">
                  Actual {speciesProfile.birthEventLabel} Date
                </label>
                <input
                  type="date"
                  value={outBirthIso}
                  onChange={(e) => setOutBirthIso(e.target.value)}
                  className="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-xs">
              <div>
                <label className="block text-[var(--barn-muted)] mb-1">Live Born</label>
                <input
                  type="number"
                  min={0}
                  value={outLive}
                  onChange={(e) => setOutLive(e.target.value)}
                  className="w-full min-h-[40px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[var(--barn-muted)] mb-1">Stillborn</label>
                <input
                  type="number"
                  min={0}
                  value={outStillborn}
                  onChange={(e) => setOutStillborn(e.target.value)}
                  className="w-full min-h-[40px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[var(--barn-muted)] mb-1">Fostered +/-</label>
                <input
                  type="number"
                  value={outFostered}
                  onChange={(e) => setOutFostered(e.target.value)}
                  className="w-full min-h-[40px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[var(--barn-muted)] mb-1">Weaned</label>
                <input
                  type="number"
                  min={0}
                  value={outWeaned}
                  onChange={(e) => setOutWeaned(e.target.value)}
                  className="w-full min-h-[40px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="text-xs">
              <label className="block text-[var(--barn-muted)] mb-1">
                Auto-Create Junior {speciesProfile.offspringLabel} Records in Herd (0 – 16)
              </label>
              <input
                type="number"
                min={0}
                max={16}
                value={outRegisterCount}
                onChange={(e) => setOutRegisterCount(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
              />
            </div>

            <input
              type="text"
              placeholder="Litter notes (fostering details, nest quality, weights)"
              value={outNotes}
              onChange={(e) => setOutNotes(e.target.value)}
              className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="min-h-[40px] px-4 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[40px] px-5 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold"
              >
                Save Outcome
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
