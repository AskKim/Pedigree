/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Species-Isolated Breeding Simulator, Coat Color Punnett Lab & Master Task List Logger (`Breeding`).
 *
 * Strictly filters Sire (`Male`) and Dam (`Female`) candidates to `activeData.speciesProfile.name`.
 * Logging a breeding automatically cascades downstream barn chores via the `Master Task List`.
 */

import { AlertTriangle, Trash2, UserPlus } from 'lucide-react';
import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  findLitterOffspringTattooConflicts,
  isOverrideConfirmationValid,
  LitterOffspringDraft,
} from '../core/animalConflicts';
import { formatSystemTaskTitle } from '../core/calendarExport';
import { analyzePairingCarrierRisks } from '../core/carrierGenetics';
import { simulatePairingGenetics } from '../core/geneticsEngine';
import {
  addDaysIso,
  Animal,
  applyAnimalNamePrefix,
  BarnSettings,
  BiologicalSex,
  BREEDING_STATUSES,
  BreedingRecord,
  BreedingStatus,
  formatBreedingStatusForSpecies,
  formatCurrencyCents,
  formatReadableDate,
  formatSexForSpecies,
  getSpeciesIdentifierLabels,
  isAnimalArchived,
  normalizeCurrencyCode,
  normalizeServiceFeeDirection,
  normalizeUltrasoundResult,
  ServiceFeeDirection,
  todayDateIso,
  ULTRASOUND_RESULTS,
  UltrasoundResult,
} from '../core/models';
import { calculatePairingCoi, getPedigreeCompletenessSummary } from '../core/pedigreeCalculator';
import { generateCascadedTasksForBreeding } from '../core/taskMaster';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
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
    serviceFeeCents?: number;
    serviceFeeDirection?: ServiceFeeDirection;
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
      serviceFeeCents?: number;
      serviceFeeDirection?: ServiceFeeDirection;
      ultrasoundDateIso?: string;
      ultrasoundResult?: UltrasoundResult;
      ultrasoundFetalCount?: number;
      ultrasoundProjectedDueIso?: string;
      notes: string;
      registerJuniorCount: number;
      offspringDrafts?: Array<Pick<LitterOffspringDraft, 'name' | 'tattoo' | 'sex'>>;
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
  const baseId = useId();
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
  const [serviceFeeDirection, setServiceFeeDirection] = useState<ServiceFeeDirection>('none');
  const [serviceFeeInput, setServiceFeeInput] = useState<string>('');
  const [autoCascade, setAutoCascade] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('');
  const resolvedCurrency = normalizeCurrencyCode(settings?.currencyCode, 'USD');

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
  const closeOutcomeModal = useCallback(() => setEditingRecord(null), []);
  const outcomeDialogRef = useAccessibleDialog({
    isOpen: Boolean(editingRecord),
    onClose: closeOutcomeModal,
  });
  const [outStatus, setOutStatus] = useState<BreedingStatus>('Born');
  const [outBirthIso, setOutBirthIso] = useState('');
  const [outLive, setOutLive] = useState('0');
  const [outStillborn, setOutStillborn] = useState('0');
  const [outFostered, setOutFostered] = useState('0');
  const [outWeaned, setOutWeaned] = useState('0');
  const [outRegisterCount, setOutRegisterCount] = useState('0');
  const [outFeeDirection, setOutFeeDirection] = useState<ServiceFeeDirection>('none');
  const [outFeeInput, setOutFeeInput] = useState('');
  const [outUltrasoundDateIso, setOutUltrasoundDateIso] = useState('');
  const [outUltrasoundResult, setOutUltrasoundResult] = useState<UltrasoundResult>('');
  const [outUltrasoundFetalCount, setOutUltrasoundFetalCount] = useState('');
  const [outUltrasoundProjectedDueIso, setOutUltrasoundProjectedDueIso] = useState('');
  const [outNotes, setOutNotes] = useState('');
  const [outOffspringDrafts, setOutOffspringDrafts] = useState<LitterOffspringDraft[]>([]);
  const [outOverrideInput, setOutOverrideInput] = useState('');
  const [outConflictError, setOutConflictError] = useState<string | null>(null);

  const idLabels = useMemo(
    () => getSpeciesIdentifierLabels(speciesProfile.name),
    [speciesProfile.name]
  );

  const litterTattooConflicts = useMemo(() => {
    if (outOffspringDrafts.length === 0) return [];
    return findLitterOffspringTattooConflicts(
      outOffspringDrafts,
      speciesProfile.name,
      animals
    );
  }, [outOffspringDrafts, speciesProfile.name, animals]);

  const hasLitterTattooConflict = litterTattooConflicts.length > 0;
  const isLitterOverrideConfirmed = isOverrideConfirmationValid(outOverrideInput);

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
    return simulatePairingGenetics(selectedSire, selectedDam, speciesProfile.name);
  }, [selectedSire, selectedDam, speciesProfile.name]);

  const pairingCarrierRisks = useMemo(() => {
    if (!selectedSire || !selectedDam) return [];
    return analyzePairingCarrierRisks(selectedSire, selectedDam, herdById);
  }, [selectedSire, selectedDam, herdById]);

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

  const parseMoneyToCents = (raw: string): number => {
    const parsed = Number.parseFloat(raw.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.round(parsed * 100);
  };

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
      serviceFeeDirection,
      serviceFeeCents: serviceFeeDirection === 'none' ? 0 : parseMoneyToCents(serviceFeeInput),
      notes,
      autoScheduleChores: autoCascade,
    });
    setNotes('');
    setServiceFeeDirection('none');
    setServiceFeeInput('');
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
    const feeDir = normalizeServiceFeeDirection(rec.serviceFeeDirection);
    setOutFeeDirection(feeDir);
    setOutFeeInput(
      rec.serviceFeeCents && rec.serviceFeeCents > 0 ? (rec.serviceFeeCents / 100).toFixed(2) : ''
    );
    setOutUltrasoundDateIso(rec.ultrasoundDateIso || '');
    setOutUltrasoundResult(normalizeUltrasoundResult(rec.ultrasoundResult));
    setOutUltrasoundFetalCount(
      rec.ultrasoundFetalCount && rec.ultrasoundFetalCount > 0
        ? String(rec.ultrasoundFetalCount)
        : ''
    );
    setOutUltrasoundProjectedDueIso(rec.ultrasoundProjectedDueIso || '');
    setOutNotes(rec.notes || '');
    setOutOffspringDrafts([]);
    setOutOverrideInput('');
    setOutConflictError(null);
  };

  const syncOffspringDraftCount = (rawValue: string) => {
    setOutRegisterCount(rawValue);
    setOutConflictError(null);
    const parsed = Math.min(16, Math.max(0, Math.round(Number(rawValue) || 0)));
    if (!editingRecord || parsed === 0) {
      setOutOffspringDrafts([]);
      setOutOverrideInput('');
      return;
    }
    const dam = herdById.get(editingRecord.damId);
    const tatPrefix = (dam?.tattoo || speciesProfile.name.slice(0, 3).toUpperCase()).slice(0, 6);
    setOutOffspringDrafts((prev) => {
      const next: LitterOffspringDraft[] = [];
      for (let i = 1; i <= parsed; i++) {
        const existingRow = prev[i - 1];
        if (existingRow) {
          next.push({ ...existingRow, index: i - 1 });
        } else {
          next.push({
            index: i - 1,
            name: applyAnimalNamePrefix(
              `${editingRecord.damName} ${speciesProfile.offspringLabel} #${i}`,
              speciesProfile.defaultAnimalPrefix
            ),
            tattoo: `${tatPrefix}-K${i}`,
            sex: i % 2 === 0 ? 'Male' : 'Female',
          });
        }
      }
      return next;
    });
  };

  const submitOutcome = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    if (hasLitterTattooConflict && !isLitterOverrideConfirmed) {
      setOutConflictError(
        `One or more ${speciesProfile.offspringLabel.toLowerCase()} records reuse an existing ${idLabels.shortLabel.toLowerCase()} for the same sex within ${speciesProfile.name}. Type "override" below or change the duplicate ID(s) before saving.`
      );
      return;
    }
    const regCount = Math.min(16, Math.max(0, Math.round(Number(outRegisterCount) || 0)));
    onUpdateOutcome(editingRecord, {
      status: outStatus,
      actualBirthDateIso:
        outStatus === 'Born' || outStatus === 'Weaned' || editingRecord.actualBirthDateIso
          ? outBirthIso
          : '',
      liveCount: Math.max(0, Number(outLive) || 0),
      stillbornCount: Math.max(0, Number(outStillborn) || 0),
      fosteredCount: Number(outFostered) || 0,
      weanedCount: Math.max(0, Number(outWeaned) || 0),
      serviceFeeDirection: outFeeDirection,
      serviceFeeCents: outFeeDirection === 'none' ? 0 : parseMoneyToCents(outFeeInput),
      ultrasoundDateIso: outUltrasoundDateIso,
      ultrasoundResult: outUltrasoundResult,
      ultrasoundFetalCount: Math.max(0, Math.round(Number(outUltrasoundFetalCount) || 0)),
      ultrasoundProjectedDueIso: outUltrasoundProjectedDueIso,
      notes: outNotes,
      registerJuniorCount: regCount,
      offspringDrafts:
        regCount > 0 && outOffspringDrafts.length > 0
          ? outOffspringDrafts.map(({ name, tattoo, sex }) => ({ name, tattoo, sex }))
          : undefined,
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
                  <label
                    htmlFor={`${baseId}-sire`}
                    className="block text-xs font-medium text-[var(--barn-muted)]"
                  >
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
                      id={`${baseId}-sire`}
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
                    id={`${baseId}-sire`}
                    label={`Sire (${speciesProfile.maleLabel})`}
                    value={sireId}
                    candidates={males}
                    placeholder={`Search ${speciesProfile.maleLabel}s (incl. archived)...`}
                    onChange={(id) => setSireId(id)}
                  />
                ) : (
                  <select
                    id={`${baseId}-sire`}
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
                  <label
                    htmlFor={`${baseId}-dam`}
                    className="block text-xs font-medium text-[var(--barn-muted)]"
                  >
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
                      id={`${baseId}-dam`}
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
                    id={`${baseId}-dam`}
                    label={`Dam (${speciesProfile.femaleLabel})`}
                    value={damId}
                    candidates={females}
                    placeholder={`Search ${speciesProfile.femaleLabel}s (incl. archived)...`}
                    onChange={(id) => setDamId(id)}
                  />
                ) : (
                  <select
                    id={`${baseId}-dam`}
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
                <label
                  htmlFor={`${baseId}-bred-date`}
                  className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                >
                  Breeding Date
                </label>
                <input
                  id={`${baseId}-bred-date`}
                  type="date"
                  required
                  value={bredDateIso}
                  onChange={(e) => setBredDateIso(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
                />
              </div>

              <div>
                <label
                  htmlFor={`${baseId}-status`}
                  className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                >
                  Initial Status
                </label>
                <select
                  id={`${baseId}-status`}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor={`${baseId}-fee-direction`}
                  className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                >
                  Stud / Service Fee (Optional)
                </label>
                <select
                  id={`${baseId}-fee-direction`}
                  aria-label="Stud or service fee direction"
                  value={serviceFeeDirection}
                  onChange={(e) => setServiceFeeDirection(e.target.value as ServiceFeeDirection)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                >
                  <option value="none">No Stud / Service Fee</option>
                  <option value="earned">Stud Fee Earned (My {speciesProfile.maleLabel})</option>
                  <option value="paid">Service Fee Paid (Outside {speciesProfile.maleLabel})</option>
                </select>
              </div>

              {serviceFeeDirection !== 'none' && (
                <div>
                  <label
                    htmlFor={`${baseId}-fee-amount`}
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Fee Amount ({resolvedCurrency})
                  </label>
                  <input
                    id={`${baseId}-fee-amount`}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={serviceFeeInput}
                    onChange={(e) => setServiceFeeInput(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
                  />
                </div>
              )}
            </div>

            <input
              type="text"
              aria-label="Cage-side breeding notes"
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

              {pairingCarrierRisks.length > 0 && (
                <div className="space-y-2 border-t border-[var(--barn-border)] pt-4">
                  <h3 className="text-xs font-semibold text-[var(--barn-muted)]">
                    Shared Carrier &amp; Lineage Risk Check ({pairingCarrierRisks.length})
                  </h3>
                  <div className="space-y-2 text-xs">
                    {pairingCarrierRisks.map((risk) => (
                      <div
                        key={risk.trait}
                        className={`p-3 rounded-xl border ${
                          risk.severity === 'danger'
                            ? 'bg-[var(--barn-danger)]/10 border-[var(--barn-danger)]/70'
                            : risk.severity === 'warning'
                            ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)]/80'
                            : 'bg-[var(--barn-canvas)] border-[var(--barn-border)]'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 font-semibold">
                          <span>{risk.trait}</span>
                          <span className="font-mono text-[11px] font-normal text-[var(--barn-muted)]">
                            {risk.sireStatus} × {risk.damStatus}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--barn-muted)] mt-1">{risk.summary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {geneticsPreview && geneticsPreview.isCustomSpeciesFallback && (
                <div className="space-y-2 border-t border-[var(--barn-border)] pt-4 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">Genotype &amp; DNA Notes</h3>
                    <ColorGeneticsNotice compact />
                  </div>
                  <p className="text-[var(--barn-muted)]">
                    {speciesProfile.name} uses custom species rules — Rabbit Punnett formulas are not applied.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono">
                    <div className="p-2.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                      <div className="font-sans text-[11px] text-[var(--barn-muted)]">Sire</div>
                      <div className="mt-0.5">{geneticsPreview.sireRaw || 'Not recorded'}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                      <div className="font-sans text-[11px] text-[var(--barn-muted)]">Dam</div>
                      <div className="mt-0.5">{geneticsPreview.damRaw || 'Not recorded'}</div>
                    </div>
                  </div>
                </div>
              )}

              {geneticsPreview &&
                !geneticsPreview.isCustomSpeciesFallback &&
                geneticsPreview.locusBreakdowns.length === 0 &&
                geneticsPreview.lethalOrHealthAlerts.length === 0 &&
                geneticsPreview.uncertainLociNotes.length === 0 && (
                <div className="border-t border-[var(--barn-border)] pt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--barn-muted)]">
                  <span>
                    Record coat color genotype loci on both parents in Herd to preview{' '}
                    {geneticsPreview.speciesName} Punnett predictions.
                  </span>
                  <ColorGeneticsNotice compact />
                </div>
              )}

              {geneticsPreview &&
                !geneticsPreview.isCustomSpeciesFallback &&
                (geneticsPreview.locusBreakdowns.length > 0 ||
                  geneticsPreview.lethalOrHealthAlerts.length > 0 ||
                  geneticsPreview.uncertainLociNotes.length > 0) && (
                <div className="space-y-3 border-t border-[var(--barn-border)] pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">
                        {geneticsPreview.speciesName} Coat Color Punnett Predictions
                      </h3>
                      <ColorGeneticsNotice compact />
                    </div>
                    {geneticsPreview.hasUnknownAlleles && (
                      <span className="text-[11px] text-[var(--barn-terracotta)] font-medium">
                        Contains unverified &lsquo;_&rsquo; allele slots
                      </span>
                    )}
                  </div>

                  {geneticsPreview.lethalOrHealthAlerts.length > 0 && (
                    <div className="space-y-2 text-xs">
                      {geneticsPreview.lethalOrHealthAlerts.map((alert, idx) => (
                        <div
                          key={`${alert.title}-${idx}`}
                          className={`p-3 rounded-xl border ${
                            alert.severity === 'danger'
                              ? 'bg-[var(--barn-danger)]/10 border-[var(--barn-danger)]'
                              : alert.severity === 'warning'
                              ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)]'
                              : 'bg-[var(--barn-canvas)] border-[var(--barn-border)]'
                          }`}
                        >
                          <div className="font-semibold text-[var(--barn-ink)]">{alert.title}</div>
                          <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
                            {alert.detail}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {geneticsPreview.uncertainLociNotes.length > 0 && (
                    <div className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)]/55 border border-[var(--barn-terracotta)]/60 space-y-1 text-xs">
                      <div className="font-semibold text-[var(--barn-ink)]">
                        Provisional &lsquo;_&rsquo; Loci Uncertainty ({geneticsPreview.uncertainLociNotes.length})
                      </div>
                      <ul className="space-y-0.5 text-[11px] text-[var(--barn-muted)] list-disc pl-4">
                        {geneticsPreview.uncertainLociNotes.map((note, idx) => (
                          <li key={idx}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {geneticsPreview.predictedPhenotypes.length > 0 && (
                    <div className="space-y-1.5 text-xs">
                      {geneticsPreview.predictedPhenotypes.map((ph, idx) => (
                        <div
                          key={`${ph.sexGroup || 'all'}-${ph.label}-${idx}`}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                        >
                          <div className="min-w-0">
                            {ph.sexGroup && (
                              <span className="font-mono text-[11px] text-[var(--barn-slate)] mr-1.5">
                                [{ph.sexGroup}]
                              </span>
                            )}
                            <span className="font-medium">{ph.label}</span>
                            <span className="font-mono text-[var(--barn-muted)] ml-2">
                              {ph.genotypeSummary}
                            </span>
                            {ph.hasUnknownCarrier && (
                              <span className="text-[11px] text-[var(--barn-terracotta)] ml-2">
                                (provisional &lsquo;_&rsquo;)
                              </span>
                            )}
                          </div>
                          <span className="font-mono font-semibold tabular-nums shrink-0">
                            {ph.probabilityPercent.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                    {geneticsPreview.locusBreakdowns.map((lb) => (
                      <div
                        key={lb.locus}
                        className="p-2.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-1.5"
                      >
                        <div className="font-semibold">
                          {lb.locusName}{' '}
                          <span className="font-mono text-[var(--barn-muted)]">
                            ({lb.sirePair}×{lb.damPair})
                          </span>
                        </div>
                        {lb.sexSplitOutcomes ? (
                          <div className="font-mono text-[11px] text-[var(--barn-muted)] space-y-1 tabular-nums">
                            <div>
                              <span className="font-sans font-medium text-[var(--barn-slate)]">
                                Male (XY):
                              </span>
                              {lb.sexSplitOutcomes.male.map((o) => (
                                <div key={`m-${o.genotype}`} className="flex justify-between gap-2">
                                  <span className="truncate">{o.displayLabel || o.genotype}</span>
                                  <span>{o.probabilityPercent}%</span>
                                </div>
                              ))}
                            </div>
                            <div className="border-t border-[var(--barn-border)]/60 pt-1">
                              <span className="font-sans font-medium text-[var(--barn-terracotta)]">
                                Female (XX):
                              </span>
                              {lb.sexSplitOutcomes.female.map((o) => (
                                <div key={`f-${o.genotype}`} className="flex justify-between gap-2">
                                  <span className="truncate">{o.displayLabel || o.genotype}</span>
                                  <span>{o.probabilityPercent}%</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="font-mono text-[11px] text-[var(--barn-muted)] space-y-0.5 tabular-nums">
                            {lb.outcomes.map((o) => (
                              <div key={o.genotype} className="flex justify-between gap-2">
                                <span className="truncate" title={o.displayLabel || o.genotype}>
                                  {o.displayLabel || o.genotype}
                                </span>
                                <span className="shrink-0">{o.probabilityPercent}%</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {lb.uncertaintyNote && (
                          <div className="text-[10px] text-[var(--barn-muted)] leading-snug">
                            {lb.uncertaintyNote}
                          </div>
                        )}
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
                    {formatReadableDate(b.ultrasoundProjectedDueIso || b.expectedDueDateIso)}
                    {b.ultrasoundProjectedDueIso ? ' (US est.)' : ''}
                    {b.ultrasoundResult
                      ? ` · Scan: ${b.ultrasoundResult}${b.ultrasoundFetalCount ? ` (${b.ultrasoundFetalCount})` : ''}`
                      : ''}
                    {b.actualBirthDateIso
                      ? ` · ${speciesProfile.birthEventLabel}: ${formatReadableDate(b.actualBirthDateIso)}`
                      : ''}
                    {b.liveCount > 0 || b.stillbornCount > 0
                      ? ` · ${b.liveCount} live / ${b.stillbornCount} stillborn / ${b.weanedCount} weaned`
                      : ''}
                    {(b.serviceFeeCents ?? 0) > 0 && b.serviceFeeDirection && b.serviceFeeDirection !== 'none'
                      ? ` · Fee ${b.serviceFeeDirection}: ${formatCurrencyCents(b.serviceFeeCents, resolvedCurrency)}`
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
          ref={outcomeDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Update Litter Outcome"
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={submitOutcome}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-semibold">
              Update {speciesProfile.birthEventLabel}: {editingRecord.damName} ×{' '}
              {editingRecord.sireName}
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label
                  htmlFor={`${baseId}-out-status`}
                  className="block text-[var(--barn-muted)] mb-1"
                >
                  Status
                </label>
                <select
                  id={`${baseId}-out-status`}
                  value={outStatus}
                  onChange={(e) => {
                    const next = e.target.value as BreedingStatus;
                    setOutStatus(next);
                    if ((next === 'Born' || next === 'Weaned') && !outBirthIso) {
                      setOutBirthIso(
                        editingRecord.actualBirthDateIso ||
                          editingRecord.expectedDueDateIso ||
                          todayDateIso()
                      );
                    }
                  }}
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
                <label
                  htmlFor={`${baseId}-out-birth`}
                  className="block text-[var(--barn-muted)] mb-1"
                >
                  Actual {speciesProfile.birthEventLabel} Date
                </label>
                <input
                  id={`${baseId}-out-birth`}
                  type="date"
                  value={outBirthIso}
                  onChange={(e) => setOutBirthIso(e.target.value)}
                  className="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-xs">
              <div>
                <label
                  htmlFor={`${baseId}-out-live`}
                  className="block text-[var(--barn-muted)] mb-1"
                >
                  Live Born
                </label>
                <input
                  id={`${baseId}-out-live`}
                  type="number"
                  min={0}
                  value={outLive}
                  onChange={(e) => setOutLive(e.target.value)}
                  className="w-full min-h-[40px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor={`${baseId}-out-stillborn`}
                  className="block text-[var(--barn-muted)] mb-1"
                >
                  Stillborn
                </label>
                <input
                  id={`${baseId}-out-stillborn`}
                  type="number"
                  min={0}
                  value={outStillborn}
                  onChange={(e) => setOutStillborn(e.target.value)}
                  className="w-full min-h-[40px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor={`${baseId}-out-fostered`}
                  className="block text-[var(--barn-muted)] mb-1"
                >
                  Fostered +/-
                </label>
                <input
                  id={`${baseId}-out-fostered`}
                  type="number"
                  value={outFostered}
                  onChange={(e) => setOutFostered(e.target.value)}
                  className="w-full min-h-[40px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor={`${baseId}-out-weaned`}
                  className="block text-[var(--barn-muted)] mb-1"
                >
                  Weaned
                </label>
                <input
                  id={`${baseId}-out-weaned`}
                  type="number"
                  min={0}
                  value={outWeaned}
                  onChange={(e) => setOutWeaned(e.target.value)}
                  className="w-full min-h-[40px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
              <div className="font-semibold text-[var(--barn-ink)]">
                Ultrasound Confirmation (Optional)
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor={`${baseId}-out-us-date`}
                    className="block text-[var(--barn-muted)] mb-1"
                  >
                    Scan Date
                  </label>
                  <input
                    id={`${baseId}-out-us-date`}
                    type="date"
                    value={outUltrasoundDateIso}
                    onChange={(e) => setOutUltrasoundDateIso(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-out-us-result`}
                    className="block text-[var(--barn-muted)] mb-1"
                  >
                    Scan Result
                  </label>
                  <select
                    id={`${baseId}-out-us-result`}
                    value={outUltrasoundResult}
                    onChange={(e) => setOutUltrasoundResult(e.target.value as UltrasoundResult)}
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]"
                  >
                    {ULTRASOUND_RESULTS.map((opt) => (
                      <option key={opt.value || 'none'} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-out-us-fetal`}
                    className="block text-[var(--barn-muted)] mb-1"
                  >
                    Est. Fetal Count
                  </label>
                  <input
                    id={`${baseId}-out-us-fetal`}
                    type="number"
                    min={0}
                    max={30}
                    placeholder="Optional"
                    value={outUltrasoundFetalCount}
                    onChange={(e) => setOutUltrasoundFetalCount(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-out-us-due`}
                    className="block text-[var(--barn-muted)] mb-1"
                  >
                    Ultrasound Due Date Override
                  </label>
                  <input
                    id={`${baseId}-out-us-due`}
                    type="date"
                    value={outUltrasoundProjectedDueIso}
                    onChange={(e) => setOutUltrasoundProjectedDueIso(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div>
                <label
                  htmlFor={`${baseId}-out-fee-dir`}
                  className="block text-[var(--barn-muted)] mb-1"
                >
                  Stud / Service Fee
                </label>
                <select
                  id={`${baseId}-out-fee-dir`}
                  value={outFeeDirection}
                  onChange={(e) => setOutFeeDirection(e.target.value as ServiceFeeDirection)}
                  className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="none">No Service Fee</option>
                  <option value="earned">Earned (Stud Income)</option>
                  <option value="paid">Paid (Outside Service)</option>
                </select>
              </div>
              {outFeeDirection !== 'none' && (
                <div>
                  <label
                    htmlFor={`${baseId}-out-fee-amount`}
                    className="block text-[var(--barn-muted)] mb-1"
                  >
                    Amount ({resolvedCurrency})
                  </label>
                  <input
                    id={`${baseId}-out-fee-amount`}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={outFeeInput}
                    onChange={(e) => setOutFeeInput(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label
                  htmlFor={`${baseId}-out-register-count`}
                  className="block text-[var(--barn-muted)] mb-1"
                >
                  Auto-Create Junior {speciesProfile.offspringLabel} Records in Herd (0 – 16)
                </label>
                <input
                  id={`${baseId}-out-register-count`}
                  type="number"
                  min={0}
                  max={16}
                  value={outRegisterCount}
                  onChange={(e) => syncOffspringDraftCount(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                />
              </div>

              {outOffspringDrafts.length > 0 && (
                <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    Review {speciesProfile.offspringLabel} Names, {idLabels.shortLabel}s &amp; Sex
                  </div>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                    {outOffspringDrafts.map((row, idx) => {
                      const rowConflict = litterTattooConflicts.find((c) => c.rowIndex === idx);
                      return (
                        <div
                          key={idx}
                          className={`grid grid-cols-1 sm:grid-cols-12 gap-1.5 items-center p-2 rounded-lg border ${
                            rowConflict
                              ? 'bg-[var(--barn-terracotta-tint)]/70 border-[var(--barn-terracotta)]'
                              : 'bg-[var(--barn-surface)] border-[var(--barn-border)]'
                          }`}
                        >
                          <input
                            type="text"
                            aria-label={`${speciesProfile.offspringLabel} #${idx + 1} name`}
                            placeholder="Name"
                            value={row.name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setOutOffspringDrafts((prev) =>
                                prev.map((r, rIdx) => (rIdx === idx ? { ...r, name: val } : r))
                              );
                            }}
                            className="sm:col-span-5 min-h-[34px] px-2 py-1 rounded-md bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                          />
                          <input
                            type="text"
                            aria-label={`${speciesProfile.offspringLabel} #${idx + 1} ${idLabels.shortLabel}`}
                            placeholder={idLabels.shortLabel}
                            value={row.tattoo}
                            onChange={(e) => {
                              const val = e.target.value;
                              setOutConflictError(null);
                              setOutOffspringDrafts((prev) =>
                                prev.map((r, rIdx) => (rIdx === idx ? { ...r, tattoo: val } : r))
                              );
                            }}
                            className={`sm:col-span-4 min-h-[34px] px-2 py-1 rounded-md bg-[var(--barn-canvas)] border font-mono text-xs ${
                              rowConflict
                                ? 'border-[var(--barn-terracotta)]'
                                : 'border-[var(--barn-border)]'
                            }`}
                          />
                          <select
                            aria-label={`${speciesProfile.offspringLabel} #${idx + 1} sex`}
                            value={row.sex}
                            onChange={(e) => {
                              const val = e.target.value as BiologicalSex;
                              setOutConflictError(null);
                              setOutOffspringDrafts((prev) =>
                                prev.map((r, rIdx) => (rIdx === idx ? { ...r, sex: val } : r))
                              );
                            }}
                            className="sm:col-span-3 min-h-[34px] px-2 py-1 rounded-md bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                          >
                            <option value="Female">
                              {formatSexForSpecies('Female', speciesProfile)}
                            </option>
                            <option value="Male">
                              {formatSexForSpecies('Male', speciesProfile)}
                            </option>
                            <option value="Unknown">Unknown</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>

                  {hasLitterTattooConflict && (
                    <div
                      role="alert"
                      className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] space-y-2"
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle
                          className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <div className="space-y-1 text-[11px]">
                          <div className="font-semibold text-[var(--barn-ink)]">
                            Duplicate {idLabels.shortLabel} detected for same sex within{' '}
                            {speciesProfile.name}
                          </div>
                          <ul className="list-disc pl-4 space-y-0.5 text-[var(--barn-muted)]">
                            {litterTattooConflicts.map((c) => {
                              const existingNames = c.existingMatches
                                .map((m) => `${m.name} (${m.tattoo})`)
                                .join(', ');
                              const peerNums = c.batchPeerIndices.map((pi) => `#${pi + 1}`).join(', ');
                              return (
                                <li key={c.rowIndex}>
                                  Row #{c.rowIndex + 1} (
                                  <span className="font-mono font-semibold text-[var(--barn-ink)]">
                                    {c.tattoo}
                                  </span>
                                  , {formatSexForSpecies(c.sex, speciesProfile)}):
                                  {existingNames ? ` matches existing ${existingNames}` : ''}
                                  {existingNames && peerNums ? ' and' : ''}
                                  {peerNums ? ` duplicates litter row ${peerNums}` : ''}.
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>

                      <div className="space-y-1 pt-1">
                        <label
                          htmlFor={`${baseId}-litter-override`}
                          className="block text-[11px] font-medium text-[var(--barn-ink)]"
                        >
                          Type <span className="font-mono font-bold">override</span> to allow
                          duplicate {idLabels.shortLabel}(s), or change the IDs above:
                        </label>
                        <input
                          id={`${baseId}-litter-override`}
                          type="text"
                          value={outOverrideInput}
                          onChange={(e) => {
                            setOutOverrideInput(e.target.value);
                            setOutConflictError(null);
                          }}
                          placeholder="Type override to confirm"
                          className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {outConflictError && (
                    <div
                      role="alert"
                      className="text-[11px] font-semibold text-[var(--barn-danger)]"
                    >
                      {outConflictError}
                    </div>
                  )}
                </div>
              )}
            </div>

            <input
              type="text"
              aria-label="Litter outcome notes"
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
