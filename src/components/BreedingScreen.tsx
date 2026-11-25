/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Species-Isolated Breeding Simulator, Coat Color Punnett Lab & Master Task List Logger (`Breeding`).
 *
 * Strictly filters Sire (`Male`) and Dam (`Female`) candidates to `activeData.speciesProfile.name`.
 * Logging a breeding automatically cascades downstream barn chores via the `Master Task List`.
 */

import { AlertTriangle, FileText, Loader2, Plus, RefreshCw, Search, Trash2, UserPlus, X } from 'lucide-react';
import React, { ComponentProps, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  findLitterOffspringTattooConflicts,
  isOverrideConfirmationValid,
  LitterOffspringDraft,
} from '../domain/animalConflicts';
import { formatSystemTaskTitle } from '../domain/calendarExport';
import { analyzePairingCarrierRisks } from '../domain/carrierGenetics';
import { analyzeAlleleProvenance, simulatePairingGenetics } from '../domain/geneticsEngine';
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
  formatWeight,
  formatWeightInputValue,
  getSpeciesIdentifierLabels,
  getWeightInputMeta,
  isAnimalArchived,
  LitterWeightMilestone,
  normalizeCurrencyCode,
  normalizeLitterWeightMilestones,
  normalizeServiceFeeDirection,
  normalizeUltrasoundResult,
  parseWeightInputToGrams,
  resolveSpeciesWeightUnit,
  ServiceFeeDirection,
  TargetWeightPoint,
  todayDateIso,
  ULTRASOUND_RESULTS,
  UltrasoundResult,
} from '../domain/models';
import { calculatePairingCoi, getPedigreeCompletenessSummary } from '../domain/pedigreeCalculator';
import {
  evaluateStalePostBirthTasksForBreeding,
  generateCascadedTasksForBreeding,
  getPendingBreedingCleanupTasks,
  resolveEffectiveSpeciesProfileForBreeding,
} from '../domain/taskMaster';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import { lazyNamedRoute, RouteErrorBoundary, RouteLoadingFallback } from '../utils/lazyRoute';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { useAsyncKeyedLock, useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import { useVirtualWindow } from '../utils/useVirtualWindow';
import {
  buildBreedingCertificateFileName,
  generateBreedingCertificateHtml,
} from '../domain/alternativeCertificates';
import { ColorGeneticsNotice } from './ColorGeneticsNotice';
import { CoatExplorerSandbox } from './CoatExplorerSandbox';
import { AlleleProvenanceLegend, ColoredGenotypeDisplay } from './ColoredGenotypeDisplay';
import { BreedingCalendarPanel } from './BreedingCalendarPanel';
import { GrowthAndSurvivalLab } from './GrowthAndSurvivalLab';
import { PairingComparisonMatrix } from './PairingComparisonMatrix';
import { PrintPreviewModal } from './PrintPreviewModal';
import { SearchableParentPicker } from './SearchableParentPicker';

const FounderAndHeritabilityPanel = lazyNamedRoute<
  ComponentProps<typeof import('./FounderAndHeritabilityPanel')['FounderAndHeritabilityPanel']>
>(
  () => import('./FounderAndHeritabilityPanel'),
  'FounderAndHeritabilityPanel',
  'Heritability & Founder Analytics'
);

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
  }) => Promise<boolean | void> | void;
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
      litterWeightMilestones?: LitterWeightMilestone[];
      notes: string;
      registerJuniorCount: number;
      offspringDrafts?: Array<Pick<LitterOffspringDraft, 'name' | 'tattoo' | 'sex'>>;
      shiftPostBirthTasksToActualDate?: boolean;
    }
  ) => Promise<boolean | void> | void;
  onRecalculatePostBirthTasks?: (breedingId: string) => Promise<boolean | void> | void;
  onDeleteBreeding: (id: string) => void;
  preselectedGrowthAnimalIds?: string[] | null;
  onConsumePreselectedGrowthAnimalIds?: () => void;
  onSaveTargetWeightCurve?: (
    speciesId: string,
    curve: TargetWeightPoint[]
  ) => Promise<boolean> | boolean;
  onUpdateSettings?: (
    patch: Partial<BarnSettings>,
    options?: { silent?: boolean }
  ) => Promise<void> | void;
}

export function BreedingScreen({
  activeData,
  settings,
  onLogBreeding,
  onUpdateOutcome,
  onRecalculatePostBirthTasks,
  onDeleteBreeding,
  preselectedGrowthAnimalIds,
  onConsumePreselectedGrowthAnimalIds,
  onSaveTargetWeightCurve,
  onUpdateSettings,
}: BreedingScreenProps) {
  const { speciesProfile, animals, herdById, breedings, tasks, shows } = activeData;
  const baseId = useId();
  const loggerSectionRef = useRef<HTMLElement | null>(null);
  const [includeArchivedParents, setIncludeArchivedParents] = useState(false);
  const [ledgerQuery, setLedgerQuery] = useState('');
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<'all' | BreedingStatus>('all');
  const [breedingCertPreview, setBreedingCertPreview] = useState<{
    breeding: BreedingRecord;
    customNotes: string;
  } | null>(null);

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
    setLedgerQuery('');
    setLedgerStatusFilter('all');
  }, [speciesProfile.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredBreedings = useMemo(() => {
    const q = ledgerQuery.trim().toLowerCase();
    return breedings.filter((b) => {
      if (ledgerStatusFilter !== 'all' && b.status !== ledgerStatusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        b.damName.toLowerCase().includes(q) ||
        b.sireName.toLowerCase().includes(q) ||
        b.status.toLowerCase().includes(q) ||
        b.bredDateIso.toLowerCase().includes(q) ||
        (b.notes || '').toLowerCase().includes(q)
      );
    });
  }, [breedings, ledgerStatusFilter, ledgerQuery]);

  const breedingVirtual = useVirtualWindow({
    itemCount: filteredBreedings.length,
    estimateSize: 96,
    overscan: 6,
    initialFallbackCount: 25,
    resetKey: `${speciesProfile.name}::${ledgerStatusFilter}::${ledgerQuery}`,
  });
  const windowedBreedings = useMemo(
    () =>
      filteredBreedings.length > 0 &&
      breedingVirtual.windowRange.endIndex >= breedingVirtual.windowRange.startIndex
        ? filteredBreedings.slice(
            breedingVirtual.windowRange.startIndex,
            breedingVirtual.windowRange.endIndex + 1
          )
        : [],
    [
      filteredBreedings,
      breedingVirtual.windowRange.startIndex,
      breedingVirtual.windowRange.endIndex,
    ]
  );

  // Outcome modal state
  const [editingRecord, setEditingRecord] = useState<BreedingRecord | null>(null);
  const outcomeSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const { isLockedNow: isOutcomeLockedNow } = outcomeSubmitLock;
  const closeOutcomeModal = useCallback(() => {
    if (!isOutcomeLockedNow()) {
      setEditingRecord(null);
    }
  }, [isOutcomeLockedNow]);
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
  const [outMilestones, setOutMilestones] = useState<
    Array<{
      id: string;
      ageDaysInput: string;
      label: string;
      liveCountInput: string;
      weightInput: string;
      entryMode: 'total' | 'avg';
    }>
  >([]);
  const [outOffspringDrafts, setOutOffspringDrafts] = useState<LitterOffspringDraft[]>([]);
  const [outOverrideInput, setOutOverrideInput] = useState('');
  const [outConflictError, setOutConflictError] = useState<string | null>(null);
  const [outShiftPostBirthTasks, setOutShiftPostBirthTasks] = useState(true);
  const breedingSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 300 });
  const recalcTasksLock = useAsyncKeyedLock();

  const effectiveWeightUnit = useMemo(
    () =>
      resolveSpeciesWeightUnit(
        speciesProfile,
        settings ?? { preferredUnit: speciesProfile.preferredUnit || 'lbs_oz' }
      ),
    [speciesProfile, settings]
  );
  const weightInputMeta = useMemo(
    () => getWeightInputMeta(effectiveWeightUnit),
    [effectiveWeightUnit]
  );

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

  const sireProvenance = useMemo(() => {
    if (!selectedSire) return null;
    return analyzeAlleleProvenance(selectedSire, herdById, animals, speciesProfile.name);
  }, [selectedSire, herdById, animals, speciesProfile.name]);

  const damProvenance = useMemo(() => {
    if (!selectedDam) return null;
    return analyzeAlleleProvenance(selectedDam, herdById, animals, speciesProfile.name);
  }, [selectedDam, herdById, animals, speciesProfile.name]);

  const pairingCarrierRisks = useMemo(() => {
    if (!selectedSire || !selectedDam) return [];
    return analyzePairingCarrierRisks(selectedSire, selectedDam, herdById);
  }, [selectedSire, selectedDam, herdById]);

  const resolvedSchedule = useMemo(
    () => resolveEffectiveSpeciesProfileForBreeding(speciesProfile, effectiveDam, effectiveSire),
    [speciesProfile, effectiveDam, effectiveSire]
  );

  const previewTasks = useMemo(() => {
    if (!effectiveSire || !effectiveDam || !bredDateIso) return [];
    const effectiveProfile = resolvedSchedule.profile;
    const mockBreeding: BreedingRecord = {
      id: 'preview',
      species: speciesProfile.name,
      sireId: effectiveSire.id,
      damId: effectiveDam.id,
      sireName: effectiveSire.name,
      damName: effectiveDam.name,
      bredDateIso,
      expectedDueDateIso: addDaysIso(bredDateIso, effectiveProfile.gestationDays),
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
    const rawTasks = generateCascadedTasksForBreeding(mockBreeding, effectiveProfile);
    return rawTasks.map((pt) => ({
      ...pt,
      displayTitle: formatSystemTaskTitle(pt, settings?.calendarSync, {
        animals: [effectiveSire, effectiveDam],
        breedings: [mockBreeding],
        speciesProfiles: [effectiveProfile],
      }),
    }));
  }, [
    effectiveSire,
    effectiveDam,
    bredDateIso,
    speciesProfile.name,
    resolvedSchedule.profile,
    coiAnalysis,
    status,
    settings,
  ]);

  const stalePostBirthByBreedingId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of breedings) {
      if (!b.actualBirthDateIso || b.status === 'Missed') continue;
      const dam = herdById.get(b.damId);
      const sire = herdById.get(b.sireId);
      const effectiveSp = resolveEffectiveSpeciesProfileForBreeding(
        speciesProfile,
        dam,
        sire
      ).profile;
      const { staleEntries } = evaluateStalePostBirthTasksForBreeding(tasks, b, effectiveSp);
      if (staleEntries.length > 0) {
        counts.set(b.id, staleEntries.length);
      }
    }
    return counts;
  }, [breedings, herdById, speciesProfile, tasks]);

  const editingEffectiveProfile = useMemo(() => {
    if (!editingRecord) return speciesProfile;
    const dam = herdById.get(editingRecord.damId);
    const sire = herdById.get(editingRecord.sireId);
    return resolveEffectiveSpeciesProfileForBreeding(speciesProfile, dam, sire).profile;
  }, [editingRecord, herdById, speciesProfile]);

  const outcomeStalePostBirth = useMemo(() => {
    if (!editingRecord || (outStatus !== 'Born' && outStatus !== 'Weaned') || !outBirthIso) {
      return { anchorDateIso: '', staleEntries: [] };
    }
    return evaluateStalePostBirthTasksForBreeding(
      tasks,
      editingRecord,
      editingEffectiveProfile,
      outBirthIso
    );
  }, [editingRecord, outStatus, outBirthIso, tasks, editingEffectiveProfile]);

  const outcomeMissedCleanupCount = useMemo(() => {
    if (!editingRecord || outStatus !== 'Missed') return 0;
    return getPendingBreedingCleanupTasks(
      tasks,
      editingRecord.id,
      editingEffectiveProfile
    ).length;
  }, [editingRecord, outStatus, tasks, editingEffectiveProfile]);

  const canSubmitBreeding =
    (usingQuickSire ? Boolean(quickSireName.trim()) : Boolean(selectedSire)) &&
    (usingQuickDam ? Boolean(quickDamName.trim()) : Boolean(selectedDam)) &&
    Boolean(bredDateIso);

  const parseMoneyToCents = (raw: string): number => {
    const parsed = Number.parseFloat(raw.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.round(parsed * 100);
  };

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitBreeding) return;
    await breedingSubmitLock.runLocked(async () => {
      const ok = await onLogBreeding({
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
      if (ok === false) return;
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
    });
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
    const existingMilestones = normalizeLitterWeightMilestones(rec.litterWeightMilestones);
    setOutMilestones(
      existingMilestones.map((m) => ({
        id: m.id,
        ageDaysInput: String(m.ageDays),
        label: m.label,
        liveCountInput:
          m.liveCount !== undefined ? String(m.liveCount) : String(rec.liveCount || ''),
        weightInput: formatWeightInputValue(m.totalWeightGrams, effectiveWeightUnit),
        entryMode: 'total',
      }))
    );
    setOutNotes(rec.notes || '');
    setOutOffspringDrafts([]);
    setOutOverrideInput('');
    setOutConflictError(null);
    setOutShiftPostBirthTasks(true);
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

  const submitOutcome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    if (hasLitterTattooConflict && !isLitterOverrideConfirmed) {
      setOutConflictError(
        `One or more ${speciesProfile.offspringLabel.toLowerCase()} records reuse an existing ${idLabels.shortLabel.toLowerCase()} for the same sex within ${speciesProfile.name}. Type "override" below or change the duplicate ID(s) before saving.`
      );
      return;
    }
    await outcomeSubmitLock.runLocked(async () => {
      const regCount = Math.min(16, Math.max(0, Math.round(Number(outRegisterCount) || 0)));
      const normalizedOutMilestones: LitterWeightMilestone[] = outMilestones
        .map((row): LitterWeightMilestone | null => {
          const ageDays = Number(row.ageDaysInput);
          const grams = parseWeightInputToGrams(row.weightInput, effectiveWeightUnit);
          if (!Number.isFinite(ageDays) || ageDays < 0 || grams <= 0) return null;
          const liveNum = Number(row.liveCountInput);
          const liveCount =
            Number.isFinite(liveNum) && liveNum > 0
              ? Math.round(liveNum)
              : Math.max(1, Number(outLive) || 0);
          const totalWeightGrams =
            row.entryMode === 'avg' ? Math.round(grams * liveCount) : grams;
          const avgWeightGrams =
            row.entryMode === 'avg' ? grams : Math.round(totalWeightGrams / Math.max(1, liveCount));
          const roundedAge = Math.round(ageDays);
          return {
            id: row.id,
            ageDays: roundedAge,
            ...(outBirthIso ? { dateIso: addDaysIso(outBirthIso, roundedAge) } : {}),
            label: row.label.trim() || `${roundedAge}-Day Weigh-In`,
            liveCount,
            totalWeightGrams,
            avgWeightGrams,
          };
        })
        .filter((x): x is LitterWeightMilestone => x !== null);
      const ok = await onUpdateOutcome(editingRecord, {
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
        litterWeightMilestones: normalizedOutMilestones,
        notes: outNotes,
        registerJuniorCount: regCount,
        offspringDrafts:
          regCount > 0 && outOffspringDrafts.length > 0
            ? outOffspringDrafts.map(({ name, tattoo, sex }) => ({ name, tattoo, sex }))
            : undefined,
        shiftPostBirthTasksToActualDate:
          outShiftPostBirthTasks && outcomeStalePostBirth.staleEntries.length > 0,
      });
      if (ok === false) {
        setOutConflictError(
          'Could not save outcome to local storage — your entries have been kept intact. Check storage space and retry.'
        );
        return;
      }
      setEditingRecord(null);
    });
  };

  const handleLoadPairingFromMatrix = useCallback(
    (nextSireId: string, nextDamId: string) => {
      setQuickAddSire(false);
      setQuickAddDam(false);
      setSireId(nextSireId);
      setDamId(nextDamId);
      if (loggerSectionRef.current && typeof loggerSectionRef.current.scrollIntoView === 'function') {
        loggerSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    []
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 6 Columns: Cage-Side Pairing Logger & Master Task List Preview */}
        <section
          ref={loggerSectionRef}
          className="lg:col-span-6 bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-5"
        >
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
                {formatReadableDate(addDaysIso(bredDateIso, resolvedSchedule.profile.gestationDays))})
                {resolvedSchedule.matchedBreed && (
                  <span className="block text-[11px] text-[var(--barn-sage)] font-medium mt-0.5">
                    Using {resolvedSchedule.matchedBreed} schedule override (
                    {resolvedSchedule.profile.gestationDays}d gestation, +
                    {resolvedSchedule.profile.weanDaysAfterBirth}d wean)
                  </span>
                )}
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
              disabled={!canSubmitBreeding || breedingSubmitLock.isSubmitting}
              aria-busy={breedingSubmitLock.isSubmitting}
              className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-sm font-semibold hover:opacity-95 disabled:opacity-45 disabled:pointer-events-none transition-opacity inline-flex items-center justify-center gap-2"
            >
              {breedingSubmitLock.isSubmitting && (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              )}
              {breedingSubmitLock.isSubmitting
                ? `Saving ${speciesProfile.name} Breeding...`
                : `Log ${speciesProfile.name} Breeding`}
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

                  {((sireProvenance && !sireProvenance.isCustomSpeciesFallback && sireProvenance.loci.length > 0) ||
                    (damProvenance && !damProvenance.isCustomSpeciesFallback && damProvenance.loci.length > 0)) && (
                    <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <div className="text-[11px] font-medium text-[var(--barn-slate)]">
                            Sire: {selectedSire?.name}
                          </div>
                          <div className="mt-0.5 break-words">
                            <ColoredGenotypeDisplay
                              provenance={sireProvenance}
                              fallbackText={selectedSire?.genotypeRaw || 'Not recorded'}
                              compact
                            />
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-medium text-[var(--barn-terracotta)]">
                            Dam: {selectedDam?.name}
                          </div>
                          <div className="mt-0.5 break-words">
                            <ColoredGenotypeDisplay
                              provenance={damProvenance}
                              fallbackText={selectedDam?.genotypeRaw || 'Not recorded'}
                              compact
                            />
                          </div>
                        </div>
                      </div>
                      <AlleleProvenanceLegend compact />
                    </div>
                  )}

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
                    {geneticsPreview.locusBreakdowns.map((lb) => {
                      const sireLocus = sireProvenance?.loci.find((l) => l.locus === lb.locus);
                      const damLocus = damProvenance?.loci.find((l) => l.locus === lb.locus);
                      return (
                      <div
                        key={lb.locus}
                        className="p-2.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-1.5"
                      >
                        <div className="font-semibold">
                          {lb.locusName}{' '}
                          <span className="font-mono text-[var(--barn-muted)]">
                            (
                            {sireLocus && sireProvenance ? (
                              <ColoredGenotypeDisplay
                                provenance={{ ...sireProvenance, loci: [sireLocus] }}
                                fallbackText={lb.sirePair}
                                compact
                              />
                            ) : (
                              lb.sirePair
                            )}
                            ×
                            {damLocus && damProvenance ? (
                              <ColoredGenotypeDisplay
                                provenance={{ ...damProvenance, loci: [damLocus] }}
                                fallbackText={lb.damPair}
                                compact
                              />
                            ) : (
                              lb.damPair
                            )}
                            )
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
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            );
          })()}
        </section>
      </div>

      {/* Genetic Variety / Coat Explorer Sandbox */}
      <CoatExplorerSandbox
        speciesProfile={speciesProfile}
        males={males}
        females={females}
        activeSire={selectedSire}
        activeDam={selectedDam}
      />

      {/* Side-by-Side Multi-Candidate Pairing Comparison Matrix */}
      <PairingComparisonMatrix
        speciesProfile={speciesProfile}
        males={males}
        females={females}
        herdById={herdById}
        activeSireId={selectedSire?.id}
        activeDamId={selectedDam?.id}
        onLoadPairingInLogger={handleLoadPairingFromMatrix}
      />

      {/* Comparative Rate of Gain, Target Curve & Litter Survival Lab */}
      <GrowthAndSurvivalLab
        activeData={activeData}
        settings={settings}
        preselectedAnimalIds={preselectedGrowthAnimalIds}
        onConsumePreselectedAnimalIds={onConsumePreselectedGrowthAnimalIds}
        onSaveTargetWeightCurve={onSaveTargetWeightCurve}
        onOpenBreedingOutcome={openOutcomeModal}
      />

      {/* Heritability (h²) Trends & Founder-Loss Analytics */}
      <RouteErrorBoundary
        routeKey={`breeding-founder:${speciesProfile.name}`}
        routeLabel="Heritability & Founder Analytics"
      >
        <Suspense fallback={<RouteLoadingFallback label="Heritability & Founder Analytics" />}>
          <FounderAndHeritabilityPanel
            mode="breeding"
            speciesProfile={speciesProfile}
            animals={animals}
            herdById={herdById}
            breedings={breedings}
            careLogs={activeData.careLogs}
            selectedSire={selectedSire ?? null}
            selectedDam={selectedDam ?? null}
            preferredUnit={effectiveWeightUnit}
          />
        </Suspense>
      </RouteErrorBoundary>

      {/* Monthly Breeding Calendar with Moon Phases, Holidays & Opt-In Weather */}
      <BreedingCalendarPanel
        speciesProfile={speciesProfile}
        breedings={breedings}
        tasks={tasks}
        shows={shows}
        animals={animals}
        settings={settings}
        onUpdateSettings={onUpdateSettings}
      />

      {/* Species Breeding & Litter History Ledger */}
      <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">
            {speciesProfile.name} Breeding &amp; {speciesProfile.birthEventLabel} Ledger (
            {filteredBreedings.length}
            {filteredBreedings.length !== breedings.length ? ` of ${breedings.length}` : ''})
          </h2>
          {breedings.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search
                  className="w-3.5 h-3.5 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={ledgerQuery}
                  onChange={(e) => setLedgerQuery(e.target.value)}
                  placeholder="Search parent, date, notes..."
                  aria-label="Filter breeding ledger"
                  className="w-full min-h-[38px] pl-8 pr-8 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                />
                {ledgerQuery && (
                  <button
                    type="button"
                    onClick={() => setLedgerQuery('')}
                    aria-label="Clear breeding search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[28px] min-w-[28px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-ink)] flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              <select
                aria-label="Filter breeding status"
                value={ledgerStatusFilter}
                onChange={(e) => setLedgerStatusFilter(e.target.value as 'all' | BreedingStatus)}
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
              >
                <option value="all">All Statuses</option>
                {BREEDING_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {formatBreedingStatusForSpecies(st, speciesProfile)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {breedings.length === 0 ? (
          <p className="text-sm text-[var(--barn-muted)]">
            No {speciesProfile.name.toLowerCase()} pairings recorded yet.
          </p>
        ) : filteredBreedings.length === 0 ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm text-[var(--barn-muted)]">
              No {speciesProfile.name.toLowerCase()} pairings matched your filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setLedgerQuery('');
                setLedgerStatusFilter('all');
              }}
              className="min-h-[36px] px-3 py-1 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)]"
            >
              Reset Ledger Filter
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div
              ref={breedingVirtual.scrollContainerRef}
              className="max-h-[70vh] overflow-y-auto pr-1"
            >
              {breedingVirtual.windowRange.paddingTop > 0 && (
                <div
                  aria-hidden="true"
                  style={{ height: `${breedingVirtual.windowRange.paddingTop}px` }}
                />
              )}
              <div className="divide-y divide-[var(--barn-border)]">
                {windowedBreedings.map((b, localIdx) => {
                  const rowIndex = breedingVirtual.windowRange.startIndex + localIdx;
                  return (
                    <div
                      key={b.id}
                      ref={breedingVirtual.measureRowRef(rowIndex)}
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
                          {(b.serviceFeeCents ?? 0) > 0 &&
                          b.serviceFeeDirection &&
                          b.serviceFeeDirection !== 'none'
                            ? ` · Fee ${b.serviceFeeDirection}: ${formatCurrencyCents(b.serviceFeeCents, resolvedCurrency)}`
                            : ''}
                        </div>
                        {b.notes && <div className="text-xs text-[var(--barn-muted)]">{b.notes}</div>}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 max-w-full">
                        {onRecalculatePostBirthTasks &&
                          (stalePostBirthByBreedingId.get(b.id) ?? 0) > 0 && (
                            <button
                              type="button"
                              disabled={recalcTasksLock.isKeyLocked(b.id)}
                              onClick={() =>
                                void recalcTasksLock.runKeyLocked(b.id, () =>
                                  onRecalculatePostBirthTasks(b.id)
                                )
                              }
                              className="min-h-[44px] sm:min-h-[38px] max-w-full px-3 py-1.5 rounded-lg border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] text-xs font-semibold text-[var(--barn-ink)] hover:brightness-95 inline-flex items-center gap-1.5 disabled:opacity-55"
                            >
                              {recalcTasksLock.isKeyLocked(b.id) ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                              ) : (
                                <RefreshCw className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                              )}
                              Shift {stalePostBirthByBreedingId.get(b.id)} Post-Birth Chore
                              {stalePostBirthByBreedingId.get(b.id) === 1 ? '' : 's'}
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() => openOutcomeModal(b)}
                          className="min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap"
                        >
                          Log {speciesProfile.birthEventLabel} / Counts
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setBreedingCertPreview({ breeding: b, customNotes: '' })
                          }
                          title="Generate printable Breeding Certificate"
                          className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <FileText className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                          Breeding Cert
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteBreeding(b.id)}
                          aria-label="Delete breeding record"
                          className="min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {breedingVirtual.windowRange.paddingBottom > 0 && (
                <div
                  aria-hidden="true"
                  style={{ height: `${breedingVirtual.windowRange.paddingBottom}px` }}
                />
              )}
            </div>
            {filteredBreedings.length > 0 && (
              <div className="pt-2 border-t border-[var(--barn-border)] flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--barn-muted)]">
                <span className="font-mono tabular-nums">
                  Showing {breedingVirtual.windowRange.startIndex + 1}–
                  {breedingVirtual.windowRange.endIndex + 1} of {filteredBreedings.length} pairings
                </span>
                {breedingVirtual.windowRange.startIndex > 0 && (
                  <button
                    type="button"
                    onClick={breedingVirtual.scrollToTop}
                    className="min-h-[36px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-medium hover:bg-[var(--barn-subtle)]"
                  >
                    Back to Top
                  </button>
                )}
              </div>
            )}
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
          onClick={(e) => {
            if (e.target === e.currentTarget) closeOutcomeModal();
          }}
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={submitOutcome}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-[var(--barn-border)] shrink-0">
              <h3 className="font-display text-lg font-semibold">
                Update {speciesProfile.birthEventLabel}: {editingRecord.damName} ×{' '}
                {editingRecord.sireName}
              </h3>
              <button
                type="button"
                disabled={outcomeSubmitLock.isSubmitting}
                onClick={closeOutcomeModal}
                aria-label="Close Update Litter Outcome dialog"
                className="min-h-[40px] min-w-[40px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0 disabled:opacity-55"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">

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

            {outcomeStalePostBirth.staleEntries.length > 0 && (
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/50 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={outShiftPostBirthTasks}
                  onChange={(e) => setOutShiftPostBirthTasks(e.target.checked)}
                  className="mt-0.5 accent-[var(--barn-sage)]"
                />
                <span>
                  <strong>
                    Shift {outcomeStalePostBirth.staleEntries.length} uncompleted post-birth chore
                    {outcomeStalePostBirth.staleEntries.length === 1 ? '' : 's'}
                  </strong>{' '}
                  (weaning, rebreed &amp; post-birth milestones) to{' '}
                  <span className="font-mono font-semibold">
                    {formatReadableDate(outBirthIso)}
                  </span>
                </span>
              </label>
            )}

            {outStatus === 'Missed' && outcomeMissedCleanupCount > 0 && (
              <div className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)]/70 text-xs text-[var(--barn-ink)]">
                Saving as <strong>Missed</strong> will automatically clear{' '}
                <strong className="font-mono">{outcomeMissedCleanupCount}</strong> pending
                nestbox, {speciesProfile.birthEventLabel.toLowerCase()}, weaning, and rebreed
                chore{outcomeMissedCleanupCount === 1 ? '' : 's'} linked to this pairing.
              </div>
            )}

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

            {/* Litter Weight-Gain Milestones (3-week, 6-week, 8-week / Weaning) */}
            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-[var(--barn-ink)]">
                  Litter Weight-Gain Milestones ({weightInputMeta.shortUnit})
                </div>
                <div className="flex flex-wrap gap-1">
                  {[
                    { age: 21, label: '3-Week (21d)' },
                    { age: 42, label: '6-Week (42d)' },
                    { age: 56, label: '8-Week Weaning' },
                  ].map((preset) => (
                    <button
                      key={preset.age}
                      type="button"
                      onClick={() =>
                        setOutMilestones((prev) => [
                          ...prev,
                          {
                            id: `lwm-${preset.age}-${Date.now()}`,
                            ageDaysInput: String(preset.age),
                            label: preset.label,
                            liveCountInput: outLive || '1',
                            weightInput: '',
                            entryMode: 'total',
                          },
                        ])
                      }
                      className="min-h-[28px] px-2 py-0.5 rounded-md border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] hover:bg-[var(--barn-subtle)]"
                    >
                      +{preset.age}d
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setOutMilestones((prev) => [
                        ...prev,
                        {
                          id: `lwm-custom-${Date.now()}`,
                          ageDaysInput: '',
                          label: 'Custom Check',
                          liveCountInput: outLive || '1',
                          weightInput: '',
                          entryMode: 'total',
                        },
                      ])
                    }
                    className="min-h-[28px] px-2 py-0.5 rounded-md border border-[var(--barn-sage)]/60 bg-[var(--barn-sage-tint)] text-[11px] font-medium inline-flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" aria-hidden="true" />
                    Custom
                  </button>
                </div>
              </div>

              {outMilestones.length === 0 ? (
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Track litter totals at 21d, 42d, or 56d weaning to chart maternal milking &amp;
                  sire growth curves across seasons.
                </p>
              ) : (
                <div className="space-y-2">
                  {outMilestones.map((row, idx) => {
                    const parsedGrams = parseWeightInputToGrams(
                      row.weightInput,
                      effectiveWeightUnit
                    );
                    const countNum = Math.max(1, Number(row.liveCountInput) || Number(outLive) || 1);
                    const avgGrams =
                      parsedGrams > 0
                        ? row.entryMode === 'avg'
                          ? parsedGrams
                          : Math.round(parsedGrams / countNum)
                        : 0;
                    return (
                      <div
                        key={row.id}
                        className="p-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-1.5"
                      >
                        <div className="grid grid-cols-12 gap-1.5 items-center">
                          <input
                            type="number"
                            min={0}
                            max={365}
                            placeholder="Days"
                            aria-label={`Milestone ${idx + 1} age in days`}
                            value={row.ageDaysInput}
                            onChange={(e) => {
                              const val = e.target.value;
                              setOutMilestones((prev) =>
                                prev.map((m) =>
                                  m.id === row.id ? { ...m, ageDaysInput: val } : m
                                )
                              );
                            }}
                            className="col-span-2 min-h-[34px] px-2 py-1 rounded-md bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                          />
                          <input
                            type="text"
                            placeholder="Label"
                            aria-label={`Milestone ${idx + 1} label`}
                            value={row.label}
                            onChange={(e) => {
                              const val = e.target.value;
                              setOutMilestones((prev) =>
                                prev.map((m) => (m.id === row.id ? { ...m, label: val } : m))
                              );
                            }}
                            className="col-span-4 min-h-[34px] px-2 py-1 rounded-md bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                          />
                          <input
                            type="number"
                            min={1}
                            max={50}
                            placeholder="Count"
                            aria-label={`Milestone ${idx + 1} live offspring weighed`}
                            value={row.liveCountInput}
                            onChange={(e) => {
                              const val = e.target.value;
                              setOutMilestones((prev) =>
                                prev.map((m) =>
                                  m.id === row.id ? { ...m, liveCountInput: val } : m
                                )
                              );
                            }}
                            className="col-span-2 min-h-[34px] px-2 py-1 rounded-md bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                          />
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder={weightInputMeta.shortUnit}
                            aria-label={`Milestone ${idx + 1} weight in ${weightInputMeta.shortUnit}`}
                            value={row.weightInput}
                            onChange={(e) => {
                              const val = e.target.value;
                              setOutMilestones((prev) =>
                                prev.map((m) =>
                                  m.id === row.id ? { ...m, weightInput: val } : m
                                )
                              );
                            }}
                            className="col-span-3 min-h-[34px] px-2 py-1 rounded-md bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setOutMilestones((prev) => prev.filter((m) => m.id !== row.id))
                            }
                            aria-label={`Remove milestone ${idx + 1}`}
                            className="col-span-1 min-h-[34px] flex items-center justify-center rounded-md text-[var(--barn-muted)] hover:text-[var(--barn-danger)]"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--barn-muted)]">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setOutMilestones((prev) =>
                                  prev.map((m) =>
                                    m.id === row.id
                                      ? {
                                          ...m,
                                          entryMode: m.entryMode === 'total' ? 'avg' : 'total',
                                        }
                                      : m
                                  )
                                )
                              }
                              className="underline hover:text-[var(--barn-ink)]"
                            >
                              Input: {row.entryMode === 'total' ? 'Total Litter' : 'Avg per Offspring'}
                            </button>
                          </div>
                          {avgGrams > 0 && (
                            <span className="font-mono tabular-nums">
                              Avg/{speciesProfile.offspringLabel}:{' '}
                              {formatWeight(avgGrams, effectiveWeightUnit)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
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

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              {editingRecord ? (
                <button
                  type="button"
                  onClick={() =>
                    setBreedingCertPreview({ breeding: editingRecord, customNotes: outNotes })
                  }
                  className="min-h-[40px] px-3.5 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                  Breeding Cert
                </button>
              ) : (
                <span />
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={outcomeSubmitLock.isSubmitting}
                  onClick={closeOutcomeModal}
                  className="min-h-[40px] px-4 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium disabled:opacity-55"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={outcomeSubmitLock.isSubmitting}
                  aria-busy={outcomeSubmitLock.isSubmitting}
                  className="min-h-[40px] px-5 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
                >
                  {outcomeSubmitLock.isSubmitting && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  )}
                  {outcomeSubmitLock.isSubmitting ? 'Saving Outcome...' : 'Save Outcome'}
                </button>
              </div>
            </div>
            </div>
          </form>
        </div>
      )}

      {breedingCertPreview && (
        <PrintPreviewModal
          title={`Breeding Certificate — ${breedingCertPreview.breeding.sireName} × ${breedingCertPreview.breeding.damName}`}
          filename={buildBreedingCertificateFileName(breedingCertPreview.breeding)}
          htmlContent={generateBreedingCertificateHtml(
            breedingCertPreview.breeding,
            herdById.get(breedingCertPreview.breeding.sireId),
            herdById.get(breedingCertPreview.breeding.damId),
            speciesProfile,
            settings ?? {
              id: 'default',
              barnName: 'Barn Registry',
              breederName: '',
              preferredUnit: 'lbs_oz',
              defaultSpecies: speciesProfile.name,
              pinnedLandingSpecies: '',
              defaultGenerations: 3,
              themeMode: 'light',
              updatedAt: '',
            },
            { serviceNotes: breedingCertPreview.customNotes }
          )}
          extraToolbarContent={
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium text-[var(--barn-muted)]">
                Certificate Note:
              </span>
              <input
                type="text"
                value={breedingCertPreview.customNotes}
                onChange={(e) =>
                  setBreedingCertPreview((prev) =>
                    prev ? { ...prev, customNotes: e.target.value } : null
                  )
                }
                placeholder="Optional stud service / pedigree note for recipient..."
                aria-label="Optional breeding certificate note"
                className="flex-1 min-w-[240px] min-h-[30px] px-2.5 py-0.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
              />
            </div>
          }
          onClose={() => setBreedingCertPreview(null)}
        />
      )}
    </div>
  );
}
