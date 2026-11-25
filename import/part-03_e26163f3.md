# Codebase Export: AskKim/Pedigree (Part 3 of 16)

- **Branch:** `main`
- **Commit:** `847f8ec8a2fc88e92ecb94065d96cf1277189c07`
- **Generated (UTC):** 2026-11-21 17:00:43 UTC
- **Files in this part:** 10 (`src/components/BreedingScreen.tsx` -> `src/components/DiagnosticsAndSupportPanel.tsx`)
- **Index:** [index.md](./index.md)

---
## `src/components/BreedingScreen.tsx`

```tsx
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
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  findLitterOffspringTattooConflicts,
  isOverrideConfirmationValid,
  LitterOffspringDraft,
} from '../core/animalConflicts';
import { formatSystemTaskTitle } from '../core/calendarExport';
import { analyzePairingCarrierRisks } from '../core/carrierGenetics';
import { analyzeAlleleProvenance, simulatePairingGenetics } from '../core/geneticsEngine';
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
} from '../core/models';
import { calculatePairingCoi, getPedigreeCompletenessSummary } from '../core/pedigreeCalculator';
import {
  evaluateStalePostBirthTasksForBreeding,
  generateCascadedTasksForBreeding,
  getPendingBreedingCleanupTasks,
  resolveEffectiveSpeciesProfileForBreeding,
} from '../core/taskMaster';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { useAsyncKeyedLock, useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import { useVirtualWindow } from '../utils/useVirtualWindow';
import {
  buildBreedingCertificateFileName,
  generateBreedingCertificateHtml,
} from '../core/alternativeCertificates';
import { ColorGeneticsNotice } from './ColorGeneticsNotice';
import { CoatExplorerSandbox } from './CoatExplorerSandbox';
import { AlleleProvenanceLegend, ColoredGenotypeDisplay } from './ColoredGenotypeDisplay';
import { GrowthAndSurvivalLab } from './GrowthAndSurvivalLab';
import { PairingComparisonMatrix } from './PairingComparisonMatrix';
import { PrintPreviewModal } from './PrintPreviewModal';
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
}: BreedingScreenProps) {
  const { speciesProfile, animals, herdById, breedings, tasks } = activeData;
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
```

## `src/components/CalendarIntegrationModals.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Official "Sign in with Google" button + Explicit Confirmation & Offline Fallback
 * Modal for syncing barn tasks to Google Calendar or handing off to desktop/offline
 * calendar apps (.ICS).
 */

import { AlertTriangle, CalendarPlus, CheckCircle2, Download, ExternalLink, X } from 'lucide-react';
import React from 'react';
import {
  buildExternalCalendarWebUrls,
  CalendarExportContext,
  formatExternalCalendarTaskSummary,
} from '../core/calendarExport';
import { BarnTask, CalendarSyncSettings, formatReadableDate } from '../core/models';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';

export function SignInWithGoogleButton({
  onClick,
  disabled,
  label = 'Sign in with Google',
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-3 min-h-[42px] px-4 py-2 rounded-xl border border-[#747775] bg-white text-[#1f1f1f] hover:bg-[#f8f9fa] active:bg-[#f1f3f4] text-sm font-medium shadow-xs transition-colors disabled:opacity-50"
    >
      <span className="w-[18px] h-[18px] shrink-0 block" aria-hidden="true">
        <svg
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 48 48"
          style={{ display: 'block' }}
        >
          <path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
          />
          <path
            fill="#FBBC05"
            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
          />
          <path fill="none" d="M0 0h48v48H0z" />
        </svg>
      </span>
      <span>{label}</span>
    </button>
  );
}

export interface PendingGoogleCalendarSync {
  tasks: BarnTask[];
  filenameHint?: string;
}

interface CalendarSyncConfirmModalProps {
  pending: PendingGoogleCalendarSync | null;
  config: CalendarSyncSettings;
  barnName: string;
  context: CalendarExportContext;
  isSignedIn: boolean;
  userEmail?: string | null;
  isBusy: boolean;
  isOnline: boolean;
  onSignIn: () => Promise<boolean>;
  onConfirmGoogleSync: () => Promise<void>;
  onFallbackOfflineIcs: () => void;
  onCancel: () => void;
}

export function CalendarSyncConfirmModal({
  pending,
  config,
  barnName,
  context,
  isSignedIn,
  userEmail,
  isBusy,
  isOnline,
  onSignIn,
  onConfirmGoogleSync,
  onFallbackOfflineIcs,
  onCancel,
}: CalendarSyncConfirmModalProps) {
  const datedTasks =
    pending && pending.tasks.length > 0
      ? pending.tasks.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.dueDateIso || ''))
      : [];
  const isModalOpen = datedTasks.length > 0;
  const dialogRef = useAccessibleDialog({
    isOpen: isModalOpen,
    onClose: () => {
      if (!isBusy) onCancel();
    },
    closeOnEscape: !isBusy,
  });

  if (!isModalOpen) return null;

  const singleTaskUrls =
    datedTasks.length === 1 && isOnline
      ? buildExternalCalendarWebUrls(datedTasks[0], config, barnName, context)
      : null;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm Online Calendar Sync"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-lg max-h-[88dvh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--barn-border)]">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <CalendarPlus className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>
                Add {datedTasks.length} {datedTasks.length === 1 ? 'Task' : 'Tasks'} to Calendar
              </span>
            </h2>
            <p className="text-xs text-[var(--barn-muted)] mt-0.5">
              Target calendar:{' '}
              <span className="font-semibold text-[var(--barn-ink)]">
                {config.googleCalendarName || 'Primary Google Calendar'}
              </span>{' '}
              · {config.reminderTimeLocal} local
              {config.alarmEnabled ? ` · Alarm ${config.alarmMinutesBefore}m before` : ' · No alarm'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            aria-label="Close calendar confirmation"
            className="min-h-[38px] min-w-[38px] rounded-lg border border-[var(--barn-border)] flex items-center justify-center text-[var(--barn-muted)] hover:text-[var(--barn-ink)] shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {!isOnline && (
            <div className="p-3 rounded-xl bg-[var(--barn-terracotta)]/10 border border-[var(--barn-terracotta)]/40 flex items-start gap-2.5 text-[var(--barn-ink)]">
              <AlertTriangle
                className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div>
                <div className="font-semibold">Device appears offline</div>
                <p className="text-[var(--barn-muted)] mt-0.5">
                  Online Google Calendar sync cannot connect right now. Use{' '}
                  <strong>Download Offline .ICS</strong> below to import directly into desktop
                  Outlook, Apple Calendar, or your device&apos;s local calendar app.
                </p>
              </div>
            </div>
          )}

          <div className="rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] divide-y divide-[var(--barn-border)] max-h-48 overflow-y-auto">
            {datedTasks.map((t) => {
              const title = formatExternalCalendarTaskSummary(t, config, context);
              return (
                <div key={t.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <span className="font-medium text-[var(--barn-ink)] min-w-0 truncate">
                    {title}
                  </span>
                  <span className="font-mono tabular-nums text-[var(--barn-muted)] shrink-0">
                    {formatReadableDate(t.dueDateIso)}
                  </span>
                </div>
              );
            })}
          </div>

          {isOnline && !isSignedIn && (
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5">
              <div className="font-semibold text-[var(--barn-ink)]">
                Connect your Google account to add events directly
              </div>
              <p className="text-[var(--barn-muted)]">
                Sign in with Google to save these {datedTasks.length === 1 ? 'event' : 'events'}{' '}
                straight to your online calendar, or choose the offline .ICS file below (which also
                works with desktop Outlook and Apple Calendar).
              </p>
              <SignInWithGoogleButton
                onClick={() => {
                  void onSignIn();
                }}
                disabled={isBusy}
              />
            </div>
          )}

          {isOnline && isSignedIn && userEmail && (
            <div className="flex items-center gap-2 text-[11px] text-[var(--barn-sage)] font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Connected to Google Calendar as {userEmail}</span>
            </div>
          )}

          {singleTaskUrls && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--barn-muted)]">
              <span>Quick browser templates:</span>
              <a
                href={singleTaskUrls.googleWebUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline hover:text-[var(--barn-ink)]"
              >
                Google Calendar Web
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
              <span aria-hidden="true">·</span>
              <a
                href={singleTaskUrls.outlookWebUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline hover:text-[var(--barn-ink)]"
              >
                Outlook Web
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-[var(--barn-border)] bg-[var(--barn-canvas)]/50 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-semibold hover:bg-[var(--barn-subtle)]"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onFallbackOfflineIcs}
            disabled={isBusy}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Download Offline .ICS
          </button>

          {isOnline && isSignedIn && (
            <button
              type="button"
              onClick={() => {
                void onConfirmGoogleSync();
              }}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 disabled:opacity-50"
            >
              <CalendarPlus className="w-3.5 h-3.5" aria-hidden="true" />
              {isBusy
                ? 'Adding to Google Calendar...'
                : `Add ${datedTasks.length} to Google Calendar`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

## `src/components/CarrierTraitCombobox.tsx`

```tsx
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
```

## `src/components/ClientCrmScreen.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Client CRM, Buyer Waitlist, Reservations & Deposit Reminders (`src/components/ClientCrmScreen.tsx`).
 *
 * Strictly species-isolated local-first breeder CRM powered by `src/core/clientCrm.ts`
 * and persisted offline via SQLite/IndexedDB + delta outbox sync.
 */

import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  Check,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Download,
  Edit3,
  ExternalLink,
  FileBarChart2,
  ListChecks,
  Mail,
  MapPin,
  Phone,
  Plus,
  Printer,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { evaluateAnimalActiveWithdrawal } from '../core/barnAlerts';
import {
  buildSuggestedAgreementNumber,
  CrmFollowUpReminder,
  evaluateCrmFollowUpReminders,
  evaluateReservationFinancials,
  findWaitlistMatches,
  formatClientKindLabel,
  formatClientsCsv,
  formatPreferredContactLabel,
  formatReservationsCsv,
  formatWaitlistCsv,
  generateSalesAgreementHtml,
  WaitlistMatchCandidate,
} from '../core/clientCrm';
import {
  AnimalReservation,
  BarnSettings,
  CLIENT_KINDS,
  ClientContact,
  ClientKind,
  formatCurrencyCents,
  formatReadableDate,
  isAnimalArchived,
  normalizeCurrencyCode,
  PREFERRED_CONTACT_METHODS,
  PreferredContactMethod,
  RESERVATION_STATUSES,
  ReservationStatus,
  todayDateIso,
  WAITLIST_INTENTS,
  WAITLIST_STATUSES,
  WaitlistEntry,
  WaitlistIntent,
  WaitlistStatus,
} from '../core/models';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { useAsyncKeyedLock, useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import { downloadTextFile } from '../utils/webFileActions';
import { PrintPreviewModal } from './PrintPreviewModal';

export interface ClientCrmScreenProps {
  activeData: ActiveSpeciesData;
  settings: BarnSettings;
  onBackToHub: () => void;
  onOpenAnimal: (animalId: string) => void;
  onOpenReports: () => void;
  onSaveClient: (
    draft: Omit<ClientContact, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<string | null>;
  onDeleteClient: (id: string) => Promise<void> | void;
  onSaveWaitlistEntry: (
    draft: Omit<WaitlistEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<string | null>;
  onDeleteWaitlistEntry: (id: string) => Promise<void> | void;
  onSaveReservation: (
    draft: Omit<AnimalReservation, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<string | null>;
  onDeleteReservation: (id: string) => Promise<void> | void;
  onCompleteReservationSale: (params: {
    reservationId: string;
    completedDateIso?: string;
    markAnimalSold?: boolean;
    recordLedgerIncome?: boolean;
  }) => Promise<boolean>;
  onCreateReminderTask: (speciesName: string, reminder: CrmFollowUpReminder) => Promise<boolean>;
}

type CrmTab = 'reservations' | 'waitlist' | 'clients';
type ReservationFilter = 'all' | 'active' | 'pending_deposit' | 'paid_ready' | 'completed' | 'cancelled';
type WaitlistFilter = 'all' | 'active_matched' | 'deposited' | 'fulfilled' | 'paused_cancelled';

interface ClientFormDraft {
  id?: string;
  fullName: string;
  ranchOrHerdName: string;
  email: string;
  phone: string;
  preferredContact: PreferredContactMethod;
  clientKind: ClientKind;
  cityState: string;
  shippingAddress: string;
  tagsText: string;
  notes: string;
}

interface WaitlistFormDraft {
  id?: string;
  clientId: string;
  clientName: string;
  priorityRank: string;
  status: WaitlistStatus;
  intent: WaitlistIntent;
  desiredBreed: string;
  desiredVariety: string;
  preferredSex: 'Any' | 'Male' | 'Female';
  preferredBreedingId: string;
  requestedByDateIso: string;
  inquiryDateIso: string;
  followUpDateIso: string;
  lastContactedDateIso: string;
  maxBudget: string;
  notes: string;
}

interface ReservationFormDraft {
  id?: string;
  agreementNumber: string;
  clientId: string;
  clientName: string;
  waitlistEntryId: string;
  animalId: string;
  breedingId: string;
  pickOrder: string;
  itemLabel: string;
  status: ReservationStatus;
  reservedDateIso: string;
  holdExpiresDateIso: string;
  totalPrice: string;
  depositRequired: string;
  depositPaid: string;
  depositDueDateIso: string;
  depositPaidDateIso: string;
  pickupScheduledDateIso: string;
  balanceReminderDateIso: string;
  paymentMethod: string;
  termsSummary: string;
  healthGuaranteeNotes: string;
  notes: string;
}

function centsToInputString(cents: number | undefined): string {
  if (!cents || !Number.isFinite(cents) || cents <= 0) return '';
  return (cents / 100).toFixed(2);
}

function parseInputToCents(raw: string): number {
  const clean = raw.replace(/[^0-9.-]/g, '').trim();
  if (!clean) return 0;
  const num = Number(clean);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100);
}

function buildEmptyClientDraft(): ClientFormDraft {
  return {
    fullName: '',
    ranchOrHerdName: '',
    email: '',
    phone: '',
    preferredContact: 'sms',
    clientKind: 'pet_buyer',
    cityState: '',
    shippingAddress: '',
    tagsText: '',
    notes: '',
  };
}

export function ClientCrmScreen({
  activeData,
  settings,
  onBackToHub,
  onOpenAnimal,
  onOpenReports,
  onSaveClient,
  onDeleteClient,
  onSaveWaitlistEntry,
  onDeleteWaitlistEntry,
  onSaveReservation,
  onDeleteReservation,
  onCompleteReservationSale,
  onCreateReminderTask,
}: ClientCrmScreenProps) {
  const {
    speciesProfile,
    animals,
    breedings,
    careLogs,
    herdById,
    clientContacts,
    waitlistEntries,
    animalReservations,
  } = activeData;
  const speciesName = speciesProfile.name;
  const currencyCode = normalizeCurrencyCode(settings.currencyCode, 'USD');
  const todayIso = todayDateIso();

  const [activeTab, setActiveTab] = useState<CrmTab>('reservations');
  const [searchQuery, setSearchQuery] = useState('');
  const [reservationFilter, setReservationFilter] = useState<ReservationFilter>('all');
  const [waitlistFilter, setWaitlistFilter] = useState<WaitlistFilter>('all');
  const [clientKindFilter, setClientKindFilter] = useState<'all' | ClientKind>('all');
  const [expandedMatchWaitlistId, setExpandedMatchWaitlistId] = useState<string | null>(null);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);

  // Modal state
  const [clientDraft, setClientDraft] = useState<ClientFormDraft | null>(null);
  const [waitlistDraft, setWaitlistDraft] = useState<WaitlistFormDraft | null>(null);
  const [reservationDraft, setReservationDraft] = useState<ReservationFormDraft | null>(null);
  const [paymentModalRes, setPaymentModalRes] = useState<AnimalReservation | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState('');
  const [paymentDateInput, setPaymentDateInput] = useState(todayIso);
  const [paymentMethodInput, setPaymentMethodInput] = useState('');

  const [completeSaleRes, setCompleteSaleRes] = useState<AnimalReservation | null>(null);
  const [completeSaleDate, setCompleteSaleDate] = useState(todayIso);
  const [completeMarkAnimalSold, setCompleteMarkAnimalSold] = useState(true);
  const [completeRecordLedger, setCompleteRecordLedger] = useState(true);

  const [printAgreementRes, setPrintAgreementRes] = useState<AnimalReservation | null>(null);

  // Submit & action locks
  const clientSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const waitlistSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const reservationSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const paymentSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const completeSaleSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const reminderActionLock = useAsyncKeyedLock();
  const quickActionLock = useAsyncKeyedLock();

  // Accessible dialogs
  const clientDialogRef = useAccessibleDialog({
    isOpen: Boolean(clientDraft),
    onClose: () => {
      if (!clientSubmitLock.isSubmitting) setClientDraft(null);
    },
  });
  const waitlistDialogRef = useAccessibleDialog({
    isOpen: Boolean(waitlistDraft),
    onClose: () => {
      if (!waitlistSubmitLock.isSubmitting) setWaitlistDraft(null);
    },
  });
  const reservationDialogRef = useAccessibleDialog({
    isOpen: Boolean(reservationDraft),
    onClose: () => {
      if (!reservationSubmitLock.isSubmitting) setReservationDraft(null);
    },
  });
  const paymentDialogRef = useAccessibleDialog({
    isOpen: Boolean(paymentModalRes),
    onClose: () => {
      if (!paymentSubmitLock.isSubmitting) setPaymentModalRes(null);
    },
  });
  const completeSaleDialogRef = useAccessibleDialog({
    isOpen: Boolean(completeSaleRes),
    onClose: () => {
      if (!completeSaleSubmitLock.isSubmitting) setCompleteSaleRes(null);
    },
  });

  const clientById = useMemo(
    () => new Map(clientContacts.map((c) => [c.id, c])),
    [clientContacts]
  );

  const crmSummary = useMemo(
    () =>
      evaluateCrmFollowUpReminders({
        clients: clientContacts,
        waitlistEntries,
        reservations: animalReservations,
        currencyCode,
        todayIso,
      }),
    [clientContacts, waitlistEntries, animalReservations, currencyCode, todayIso]
  );

  const availableAnimals = useMemo(
    () =>
      animals.filter(
        (a) => !isAnimalArchived(a) && a.status !== 'Sold' && a.status !== 'Deceased' && !a.culled
      ),
    [animals]
  );

  const activeBreedings = useMemo(
    () => breedings.filter((b) => b.status !== 'Missed' && b.status !== 'Weaned'),
    [breedings]
  );

  const queryLower = searchQuery.trim().toLowerCase();

  const filteredReservations = useMemo(() => {
    return animalReservations.filter((res) => {
      if (reservationFilter === 'active') {
        if (res.status === 'Picked Up / Completed' || res.status === 'Cancelled') return false;
      } else if (reservationFilter === 'pending_deposit') {
        if (res.status !== 'Inquiry Hold' && res.status !== 'Pending Deposit') return false;
      } else if (reservationFilter === 'paid_ready') {
        if (
          res.status !== 'Deposit Paid' &&
          res.status !== 'Paid in Full' &&
          res.status !== 'Ready for Pickup'
        ) {
          return false;
        }
      } else if (reservationFilter === 'completed') {
        if (res.status !== 'Picked Up / Completed') return false;
      } else if (reservationFilter === 'cancelled') {
        if (res.status !== 'Cancelled') return false;
      }

      if (!queryLower) return true;
      const client = clientById.get(res.clientId);
      const haystack = [
        res.agreementNumber,
        res.clientName,
        client?.fullName,
        client?.phone,
        client?.email,
        res.itemLabel,
        res.status,
        res.paymentMethod,
        res.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(queryLower);
    });
  }, [animalReservations, reservationFilter, queryLower, clientById]);

  const filteredWaitlist = useMemo(() => {
    return waitlistEntries.filter((w) => {
      if (waitlistFilter === 'active_matched') {
        if (w.status !== 'Active' && w.status !== 'Matched') return false;
      } else if (waitlistFilter === 'deposited') {
        if (w.status !== 'Deposited') return false;
      } else if (waitlistFilter === 'fulfilled') {
        if (w.status !== 'Fulfilled') return false;
      } else if (waitlistFilter === 'paused_cancelled') {
        if (w.status !== 'Paused' && w.status !== 'Cancelled') return false;
      }

      if (!queryLower) return true;
      const client = clientById.get(w.clientId);
      const haystack = [
        w.clientName,
        client?.fullName,
        client?.phone,
        client?.email,
        w.desiredBreed,
        w.desiredVariety,
        w.intent,
        w.status,
        w.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(queryLower);
    });
  }, [waitlistEntries, waitlistFilter, queryLower, clientById]);

  const filteredClients = useMemo(() => {
    return clientContacts.filter((c) => {
      if (clientKindFilter !== 'all' && c.clientKind !== clientKindFilter) return false;
      if (!queryLower) return true;
      const haystack = [
        c.fullName,
        c.ranchOrHerdName,
        c.email,
        c.phone,
        c.cityState,
        ...(c.tags ?? []),
        c.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(queryLower);
    });
  }, [clientContacts, clientKindFilter, queryLower]);

  const nextWaitlistRank = useMemo(() => {
    let maxRank = 0;
    for (const w of waitlistEntries) {
      if (w.priorityRank > maxRank) maxRank = w.priorityRank;
    }
    return String(maxRank + 1);
  }, [waitlistEntries]);

  const openNewClientModal = () => {
    setClientDraft(buildEmptyClientDraft());
  };

  const openEditClientModal = (c: ClientContact) => {
    setClientDraft({
      id: c.id,
      fullName: c.fullName,
      ranchOrHerdName: c.ranchOrHerdName,
      email: c.email,
      phone: c.phone,
      preferredContact: c.preferredContact,
      clientKind: c.clientKind,
      cityState: c.cityState,
      shippingAddress: c.shippingAddress,
      tagsText: (c.tags ?? []).join(', '),
      notes: c.notes,
    });
  };

  const openNewWaitlistModal = (prefillClient?: ClientContact) => {
    setWaitlistDraft({
      clientId: prefillClient?.id || '',
      clientName: prefillClient?.fullName || '',
      priorityRank: nextWaitlistRank,
      status: 'Active',
      intent: prefillClient?.clientKind === 'show_breeder'
        ? 'Show / Breeding'
        : prefillClient?.clientKind === 'youth_4h_ffa'
          ? '4-H / FFA Youth'
          : prefillClient?.clientKind === 'commercial_meat'
            ? 'Meat / Commercial'
            : 'Pet / Companion',
      desiredBreed: '',
      desiredVariety: '',
      preferredSex: 'Any',
      preferredBreedingId: '',
      requestedByDateIso: '',
      inquiryDateIso: todayIso,
      followUpDateIso: '',
      lastContactedDateIso: todayIso,
      maxBudget: '',
      notes: '',
    });
  };

  const openEditWaitlistModal = (w: WaitlistEntry) => {
    setWaitlistDraft({
      id: w.id,
      clientId: w.clientId,
      clientName: w.clientName,
      priorityRank: String(w.priorityRank || 1),
      status: w.status,
      intent: w.intent,
      desiredBreed: w.desiredBreed,
      desiredVariety: w.desiredVariety,
      preferredSex: w.preferredSex,
      preferredBreedingId: w.preferredBreedingId || '',
      requestedByDateIso: w.requestedByDateIso,
      inquiryDateIso: w.inquiryDateIso,
      followUpDateIso: w.followUpDateIso,
      lastContactedDateIso: w.lastContactedDateIso,
      maxBudget: centsToInputString(w.maxBudgetCents),
      notes: w.notes,
    });
  };

  const openNewReservationModal = (opts?: {
    client?: ClientContact;
    waitlistEntry?: WaitlistEntry;
    matchCandidate?: WaitlistMatchCandidate;
  }) => {
    const clientId = opts?.client?.id || opts?.waitlistEntry?.clientId || '';
    const clientName =
      opts?.client?.fullName ||
      opts?.waitlistEntry?.clientName ||
      (clientId ? clientById.get(clientId)?.fullName || '' : '');
    const animalId = opts?.matchCandidate?.kind === 'animal' ? opts.matchCandidate.id : '';
    const breedingId =
      opts?.matchCandidate?.kind === 'breeding'
        ? opts.matchCandidate.id
        : opts?.waitlistEntry?.preferredBreedingId || '';
    const linkedAnimal = animalId ? herdById.get(animalId) : undefined;
    const itemLabel = opts?.matchCandidate
      ? opts.matchCandidate.label
      : linkedAnimal
        ? `${linkedAnimal.name}${linkedAnimal.tattoo ? ` (#${linkedAnimal.tattoo})` : ''}`
        : opts?.waitlistEntry
          ? [
              opts.waitlistEntry.desiredBreed,
              opts.waitlistEntry.desiredVariety,
              opts.waitlistEntry.preferredSex !== 'Any' ? opts.waitlistEntry.preferredSex : '',
              'Pick',
            ]
              .filter(Boolean)
              .join(' ')
          : '';

    setReservationDraft({
      agreementNumber: buildSuggestedAgreementNumber(animalReservations),
      clientId,
      clientName,
      waitlistEntryId: opts?.waitlistEntry?.id || '',
      animalId,
      breedingId,
      pickOrder: '',
      itemLabel,
      status: 'Pending Deposit',
      reservedDateIso: todayIso,
      holdExpiresDateIso: '',
      totalPrice: opts?.waitlistEntry?.maxBudgetCents
        ? centsToInputString(opts.waitlistEntry.maxBudgetCents)
        : '',
      depositRequired: '',
      depositPaid: '',
      depositDueDateIso: '',
      depositPaidDateIso: '',
      pickupScheduledDateIso: '',
      balanceReminderDateIso: '',
      paymentMethod: '',
      termsSummary: '',
      healthGuaranteeNotes: '',
      notes: opts?.waitlistEntry?.notes || '',
    });
  };

  const openEditReservationModal = (r: AnimalReservation) => {
    setReservationDraft({
      id: r.id,
      agreementNumber: r.agreementNumber,
      clientId: r.clientId,
      clientName: r.clientName,
      waitlistEntryId: r.waitlistEntryId || '',
      animalId: r.animalId || '',
      breedingId: r.breedingId || '',
      pickOrder: r.pickOrder ? String(r.pickOrder) : '',
      itemLabel: r.itemLabel,
      status: r.status,
      reservedDateIso: r.reservedDateIso,
      holdExpiresDateIso: r.holdExpiresDateIso,
      totalPrice: centsToInputString(r.totalPriceCents),
      depositRequired: centsToInputString(r.depositRequiredCents),
      depositPaid: centsToInputString(r.depositPaidCents),
      depositDueDateIso: r.depositDueDateIso,
      depositPaidDateIso: r.depositPaidDateIso,
      pickupScheduledDateIso: r.pickupScheduledDateIso,
      balanceReminderDateIso: r.balanceReminderDateIso,
      paymentMethod: r.paymentMethod,
      termsSummary: r.termsSummary,
      healthGuaranteeNotes: r.healthGuaranteeNotes,
      notes: r.notes,
    });
  };

  const handleSaveClientForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!clientDraft) return;
    await clientSubmitLock.runLocked(async () => {
      const tags = clientDraft.tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const savedId = await onSaveClient({
        id: clientDraft.id,
        species: speciesName,
        fullName: clientDraft.fullName,
        ranchOrHerdName: clientDraft.ranchOrHerdName,
        email: clientDraft.email,
        phone: clientDraft.phone,
        preferredContact: clientDraft.preferredContact,
        clientKind: clientDraft.clientKind,
        cityState: clientDraft.cityState,
        shippingAddress: clientDraft.shippingAddress,
        tags,
        notes: clientDraft.notes,
      });
      if (savedId) {
        setClientDraft(null);
      }
    });
  };

  const handleSaveWaitlistForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!waitlistDraft) return;
    await waitlistSubmitLock.runLocked(async () => {
      const maxBudgetCents = parseInputToCents(waitlistDraft.maxBudget);
      const savedId = await onSaveWaitlistEntry({
        id: waitlistDraft.id,
        species: speciesName,
        clientId: waitlistDraft.clientId,
        clientName: waitlistDraft.clientName,
        priorityRank: Math.max(1, Math.round(Number(waitlistDraft.priorityRank) || 1)),
        status: waitlistDraft.status,
        intent: waitlistDraft.intent,
        desiredBreed: waitlistDraft.desiredBreed,
        desiredVariety: waitlistDraft.desiredVariety,
        preferredSex: waitlistDraft.preferredSex,
        preferredBreedingId: waitlistDraft.preferredBreedingId || undefined,
        requestedByDateIso: waitlistDraft.requestedByDateIso,
        inquiryDateIso: waitlistDraft.inquiryDateIso || todayIso,
        followUpDateIso: waitlistDraft.followUpDateIso,
        lastContactedDateIso: waitlistDraft.lastContactedDateIso,
        maxBudgetCents: maxBudgetCents > 0 ? maxBudgetCents : undefined,
        notes: waitlistDraft.notes,
      });
      if (savedId) {
        setWaitlistDraft(null);
      }
    });
  };

  const handleSaveReservationForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!reservationDraft) return;
    await reservationSubmitLock.runLocked(async () => {
      const savedId = await onSaveReservation({
        id: reservationDraft.id,
        species: speciesName,
        agreementNumber: reservationDraft.agreementNumber,
        clientId: reservationDraft.clientId,
        clientName: reservationDraft.clientName,
        waitlistEntryId: reservationDraft.waitlistEntryId || undefined,
        animalId: reservationDraft.animalId || undefined,
        breedingId: reservationDraft.breedingId || undefined,
        pickOrder: reservationDraft.pickOrder
          ? Math.max(1, Math.round(Number(reservationDraft.pickOrder)))
          : undefined,
        itemLabel: reservationDraft.itemLabel,
        status: reservationDraft.status,
        reservedDateIso: reservationDraft.reservedDateIso || todayIso,
        holdExpiresDateIso: reservationDraft.holdExpiresDateIso,
        totalPriceCents: parseInputToCents(reservationDraft.totalPrice),
        depositRequiredCents: parseInputToCents(reservationDraft.depositRequired),
        depositPaidCents: parseInputToCents(reservationDraft.depositPaid),
        depositDueDateIso: reservationDraft.depositDueDateIso,
        depositPaidDateIso: reservationDraft.depositPaidDateIso,
        pickupScheduledDateIso: reservationDraft.pickupScheduledDateIso,
        completedDateIso:
          reservationDraft.status === 'Picked Up / Completed' ? todayIso : '',
        balanceReminderDateIso: reservationDraft.balanceReminderDateIso,
        paymentMethod: reservationDraft.paymentMethod,
        termsSummary: reservationDraft.termsSummary,
        healthGuaranteeNotes: reservationDraft.healthGuaranteeNotes,
        notes: reservationDraft.notes,
      });
      if (savedId) {
        setReservationDraft(null);
      }
    });
  };

  const openRecordPaymentModal = (res: AnimalReservation) => {
    const fin = evaluateReservationFinancials(res);
    const defaultPaymentCents =
      fin.depositRemainingCents > 0
        ? fin.depositRemainingCents
        : fin.balanceRemainingCents > 0
          ? fin.balanceRemainingCents
          : 0;
    setPaymentModalRes(res);
    setPaymentAmountInput(centsToInputString(defaultPaymentCents));
    setPaymentDateInput(todayIso);
    setPaymentMethodInput(res.paymentMethod || '');
  };

  const handleRecordPaymentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!paymentModalRes) return;
    const addCents = parseInputToCents(paymentAmountInput);
    if (addCents <= 0) return;

    await paymentSubmitLock.runLocked(async () => {
      const nextPaidCents = paymentModalRes.depositPaidCents + addCents;
      const fin = evaluateReservationFinancials({
        status: paymentModalRes.status,
        totalPriceCents: paymentModalRes.totalPriceCents,
        depositRequiredCents: paymentModalRes.depositRequiredCents,
        depositPaidCents: nextPaidCents,
      });
      const savedId = await onSaveReservation({
        ...paymentModalRes,
        depositPaidCents: nextPaidCents,
        depositPaidDateIso: paymentDateInput || todayIso,
        paymentMethod: paymentMethodInput.trim() || paymentModalRes.paymentMethod,
        status: fin.suggestedStatus,
      });
      if (savedId) {
        setPaymentModalRes(null);
      }
    });
  };

  const openCompleteSaleModal = (res: AnimalReservation) => {
    setCompleteSaleRes(res);
    setCompleteSaleDate(todayIso);
    setCompleteMarkAnimalSold(Boolean(res.animalId));
    setCompleteRecordLedger(true);
  };

  const handleCompleteSaleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!completeSaleRes) return;
    await completeSaleSubmitLock.runLocked(async () => {
      const ok = await onCompleteReservationSale({
        reservationId: completeSaleRes.id,
        completedDateIso: completeSaleDate || todayIso,
        markAnimalSold: completeMarkAnimalSold,
        recordLedgerIncome: completeRecordLedger,
      });
      if (ok) {
        setCompleteSaleRes(null);
      }
    });
  };

  const handleDeleteWithConfirm = (key: string, onConfirm: () => Promise<void> | void) => {
    if (pendingDeleteKey !== key) {
      setPendingDeleteKey(key);
      return;
    }
    setPendingDeleteKey(null);
    void quickActionLock.runKeyLocked(key, async () => {
      await onConfirm();
    });
  };

  const printAgreementHtml = useMemo(() => {
    if (!printAgreementRes) return '';
    const client = clientById.get(printAgreementRes.clientId) ?? null;
    const animal = printAgreementRes.animalId ? herdById.get(printAgreementRes.animalId) ?? null : null;
    const breeding = printAgreementRes.breedingId
      ? breedings.find((b) => b.id === printAgreementRes.breedingId) ?? null
      : null;
    const sire = animal?.sireId
      ? herdById.get(animal.sireId) ?? null
      : breeding?.sireId
        ? herdById.get(breeding.sireId) ?? null
        : null;
    const dam = animal?.damId
      ? herdById.get(animal.damId) ?? null
      : breeding?.damId
        ? herdById.get(breeding.damId) ?? null
        : null;
    const activeWithdrawal = animal
      ? evaluateAnimalActiveWithdrawal(careLogs, animal.id, { todayIso })
      : null;

    return generateSalesAgreementHtml({
      reservation: printAgreementRes,
      client,
      animal,
      breeding,
      sire,
      dam,
      settings,
      speciesProfile,
      activeWithdrawal,
      generatedDateIso: todayIso,
    });
  }, [printAgreementRes, clientById, herdById, breedings, careLogs, settings, speciesProfile, todayIso]);

  const completeSaleWithdrawal = useMemo(() => {
    if (!completeSaleRes?.animalId) return null;
    const ev = evaluateAnimalActiveWithdrawal(careLogs, completeSaleRes.animalId, { todayIso });
    return ev.isActive ? ev : null;
  }, [completeSaleRes, careLogs, todayIso]);

  const handleExportCsv = () => {
    const slug = speciesName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (activeTab === 'clients') {
      downloadTextFile(
        `${slug}-clients-${todayIso}.csv`,
        formatClientsCsv(filteredClients),
        'text/csv;charset=utf-8'
      );
      return;
    }
    if (activeTab === 'waitlist') {
      downloadTextFile(
        `${slug}-waitlist-${todayIso}.csv`,
        formatWaitlistCsv(filteredWaitlist, currencyCode),
        'text/csv;charset=utf-8'
      );
      return;
    }
    downloadTextFile(
      `${slug}-reservations-${todayIso}.csv`,
      formatReservationsCsv(filteredReservations, currencyCode),
      'text/csv;charset=utf-8'
    );
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBackToHub}
              className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Back to {speciesName}
            </button>
            <span className="px-2.5 py-1 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/40 text-[11px] font-semibold text-[var(--barn-sage)]">
              {speciesName} Buyer CRM
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Client CRM, Waitlist &amp; Deposits
          </h1>
          <p className="text-xs text-[var(--barn-muted)]">
            Track buyer inquiries, ranked waitlist matches, animal/litter holds, deposit reminders, and printable sales agreements strictly inside {speciesName}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenReports}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
          >
            <FileBarChart2 className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            CRM Reports
          </button>
          <button
            type="button"
            onClick={openNewClientModal}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            New Client
          </button>
          <button
            type="button"
            onClick={() => openNewWaitlistModal()}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <ListChecks className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            Add Waitlist
          </button>
          <button
            type="button"
            onClick={() => openNewReservationModal()}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] hover:brightness-105 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            New Reservation
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <section aria-label="CRM KPI summary" className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-medium text-[var(--barn-muted)]">Clients</div>
          <div className="text-xl font-bold font-mono tabular-nums">{crmSummary.totalClients}</div>
          <div className="text-[11px] text-[var(--barn-muted)]">Saved buyer profiles</div>
        </div>
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-medium text-[var(--barn-muted)]">Active Waitlist</div>
          <div className="text-xl font-bold font-mono tabular-nums">{crmSummary.activeWaitlistCount}</div>
          <div className="text-[11px] text-[var(--barn-muted)]">
            {crmSummary.matchedWaitlistCount} matched to stock
          </div>
        </div>
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-medium text-[var(--barn-muted)]">Reservations</div>
          <div className="text-xl font-bold font-mono tabular-nums">{crmSummary.activeReservationsCount}</div>
          <div className="text-[11px] text-[var(--barn-muted)]">
            {crmSummary.completedReservationsCount} completed
          </div>
        </div>
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-medium text-[var(--barn-muted)]">Collected Deposits</div>
          <div className="text-xl font-bold font-mono tabular-nums text-[var(--barn-sage)]">
            {formatCurrencyCents(crmSummary.collectedDepositsCents, currencyCode)}
          </div>
          <div className="text-[11px] text-[var(--barn-muted)]">
            of {formatCurrencyCents(crmSummary.reservedRevenueCents, currencyCode)} reserved
          </div>
        </div>
        <div className="col-span-2 lg:col-span-1 bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-medium text-[var(--barn-muted)]">Balances Due</div>
          <div className="text-xl font-bold font-mono tabular-nums">
            {formatCurrencyCents(crmSummary.outstandingBalancesCents, currencyCode)}
          </div>
          <div className="text-[11px] text-[var(--barn-muted)]">
            {formatCurrencyCents(crmSummary.outstandingDepositsCents, currencyCode)} deposits pending
          </div>
        </div>
      </section>

      {/* Automated Deposit, Hold & Waitlist Follow-Up Reminders */}
      {crmSummary.reminders.length > 0 && (
        <section
          aria-label="CRM Follow-Up and Deposit Reminders"
          className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BellRing className="w-4 h-4 text-[var(--barn-terracotta)]" aria-hidden="true" />
              <h2 className="text-sm font-semibold">
                Follow-Up &amp; Deposit Reminders ({crmSummary.reminders.length})
              </h2>
              {crmSummary.overdueReminderCount > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)]/50 text-[11px] font-semibold text-[var(--barn-terracotta)]">
                  {crmSummary.overdueReminderCount} overdue
                </span>
              )}
              {crmSummary.dueSoonReminderCount > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/40 text-[11px] font-semibold text-[var(--barn-sage)]">
                  {crmSummary.dueSoonReminderCount} due now
                </span>
              )}
            </div>
            <span className="text-[11px] text-[var(--barn-muted)]">
              Auto-evaluated from deposit due dates, temporary holds, pickups, and waitlist check-ins
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {crmSummary.reminders.map((rem) => {
              const targetReservation =
                rem.entityType === 'reservation'
                  ? animalReservations.find((r) => r.id === rem.entityId)
                  : undefined;
              const targetWaitlist =
                rem.entityType === 'waitlist'
                  ? waitlistEntries.find((w) => w.id === rem.entityId)
                  : undefined;
              const isBusyTask = reminderActionLock.isKeyLocked(rem.id);

              return (
                <div
                  key={rem.id}
                  className={`rounded-xl border p-3 flex flex-col justify-between gap-2.5 ${
                    rem.urgency === 'overdue'
                      ? 'bg-[var(--barn-terracotta-tint)]/70 border-[var(--barn-terracotta)]/60'
                      : rem.urgency === 'due_soon'
                        ? 'bg-[var(--barn-sage-tint)]/70 border-[var(--barn-sage)]/50'
                        : 'bg-[var(--barn-canvas)] border-[var(--barn-border)]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-semibold text-[var(--barn-ink)]">
                        {rem.title}
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)] shrink-0">
                        {formatReadableDate(rem.targetDateIso)}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--barn-muted)]">{rem.detail}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isBusyTask}
                      onClick={() =>
                        void reminderActionLock.runKeyLocked(rem.id, () =>
                          onCreateReminderTask(speciesName, rem)
                        )
                      }
                      className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-60"
                    >
                      <ClipboardList className="w-3 h-3 text-[var(--barn-sage)]" aria-hidden="true" />
                      {isBusyTask ? 'Adding...' : 'Add Barn Task'}
                    </button>

                    {targetReservation &&
                      (rem.kind === 'deposit_overdue' ||
                        rem.kind === 'deposit_due_soon' ||
                        rem.kind === 'balance_due' ||
                        rem.kind === 'hold_expiring') && (
                        <button
                          type="button"
                          onClick={() => openRecordPaymentModal(targetReservation)}
                          className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold inline-flex items-center gap-1"
                        >
                          <DollarSign className="w-3 h-3" aria-hidden="true" />
                          Record Payment
                        </button>
                      )}

                    {targetWaitlist && (
                      <button
                        type="button"
                        disabled={quickActionLock.isKeyLocked(`contacted-${targetWaitlist.id}`)}
                        onClick={() =>
                          void quickActionLock.runKeyLocked(`contacted-${targetWaitlist.id}`, async () => {
                            await onSaveWaitlistEntry({
                              ...targetWaitlist,
                              lastContactedDateIso: todayIso,
                            });
                          })
                        }
                        className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold inline-flex items-center gap-1"
                      >
                        <Check className="w-3 h-3 text-[var(--barn-sage)]" aria-hidden="true" />
                        Contacted Today
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Workspace Navigation Tabs & Filters */}
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--barn-border)] pb-3">
          <div role="tablist" aria-label="CRM Workspace Tabs" className="flex flex-wrap gap-2">
            {(
              [
                {
                  id: 'reservations',
                  label: `Reservations & Deposits (${animalReservations.length})`,
                },
                {
                  id: 'waitlist',
                  label: `Buyer Waitlist (${waitlistEntries.length})`,
                },
                {
                  id: 'clients',
                  label: `Client Directory (${clientContacts.length})`,
                },
              ] as const
            ).map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setPendingDeleteKey(null);
                  }}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    selected
                      ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                      : 'border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            Export {activeTab === 'clients' ? 'Clients' : activeTab === 'waitlist' ? 'Waitlist' : 'Reservations'} (.CSV)
          </button>
        </div>

        {/* Search & Tab Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="w-4 h-4 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeTab} by buyer, animal, breed, or notes...`}
              aria-label="Search CRM records"
              className="w-full min-h-[38px] pl-9 pr-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
            />
          </div>

          {activeTab === 'reservations' && (
            <select
              aria-label="Filter reservations by status"
              value={reservationFilter}
              onChange={(e) => setReservationFilter(e.target.value as ReservationFilter)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
            >
              <option value="all">All Reservations</option>
              <option value="active">Active Holds &amp; Deposits</option>
              <option value="pending_deposit">Pending Deposit / Hold</option>
              <option value="paid_ready">Deposited / Paid / Ready</option>
              <option value="completed">Picked Up / Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          )}

          {activeTab === 'waitlist' && (
            <select
              aria-label="Filter waitlist by status"
              value={waitlistFilter}
              onChange={(e) => setWaitlistFilter(e.target.value as WaitlistFilter)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
            >
              <option value="all">All Waitlist Entries</option>
              <option value="active_matched">Active &amp; Matched</option>
              <option value="deposited">Deposited</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="paused_cancelled">Paused / Cancelled</option>
            </select>
          )}

          {activeTab === 'clients' && (
            <select
              aria-label="Filter clients by type"
              value={clientKindFilter}
              onChange={(e) => setClientKindFilter(e.target.value as 'all' | ClientKind)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
            >
              <option value="all">All Client Types</option>
              {CLIENT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* TAB 1: RESERVATIONS & DEPOSITS */}
        {activeTab === 'reservations' && (
          <div className="space-y-3">
            {filteredReservations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--barn-border)] p-8 text-center space-y-2">
                <p className="text-sm font-medium">No reservations match the current filter.</p>
                <p className="text-xs text-[var(--barn-muted)]">
                  Create a reservation for an animal or upcoming litter pick to track deposits, pickup dates, and printable sales agreements.
                </p>
                <button
                  type="button"
                  onClick={() => openNewReservationModal()}
                  className="min-h-[38px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Create First Reservation
                </button>
              </div>
            ) : (
              filteredReservations.map((res) => {
                const fin = evaluateReservationFinancials(res);
                const client = clientById.get(res.clientId);
                const linkedAnimal = res.animalId ? herdById.get(res.animalId) : undefined;
                const deleteKey = `res-${res.id}`;
                const isTerminal =
                  res.status === 'Picked Up / Completed' || res.status === 'Cancelled';

                return (
                  <article
                    key={res.id}
                    className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-[11px] font-bold">
                            {res.agreementNumber || 'RES'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                              res.status === 'Picked Up / Completed' || res.status === 'Paid in Full'
                                ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)]/50 text-[var(--barn-sage)]'
                                : res.status === 'Cancelled'
                                  ? 'bg-[var(--barn-subtle)] border-[var(--barn-border)] text-[var(--barn-muted)]'
                                  : 'bg-[var(--barn-surface)] border-[var(--barn-border)] text-[var(--barn-ink)]'
                            }`}
                          >
                            {res.status}
                          </span>
                          <h3 className="text-sm font-semibold text-[var(--barn-ink)]">
                            {res.itemLabel}
                          </h3>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--barn-muted)]">
                          <span>
                            Buyer: <strong className="text-[var(--barn-ink)]">{client?.fullName || res.clientName}</strong>
                          </span>
                          {client?.phone && <span>{client.phone}</span>}
                          <span>Reserved {formatReadableDate(res.reservedDateIso)}</span>
                          {res.pickupScheduledDateIso && (
                            <span>Pickup: {formatReadableDate(res.pickupScheduledDateIso)}</span>
                          )}
                          {res.holdExpiresDateIso && !fin.isDepositSatisfied && (
                            <span>Hold expires: {formatReadableDate(res.holdExpiresDateIso)}</span>
                          )}
                          {linkedAnimal && (
                            <button
                              type="button"
                              onClick={() => onOpenAnimal(linkedAnimal.id)}
                              className="inline-flex items-center gap-1 text-[var(--barn-sage)] hover:underline font-medium"
                            >
                              {linkedAnimal.name}
                              <ExternalLink className="w-3 h-3" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="text-right font-mono tabular-nums space-y-0.5">
                        <div className="text-sm font-bold">
                          {formatCurrencyCents(fin.totalPriceCents, currencyCode)}
                        </div>
                        <div className="text-[11px] text-[var(--barn-muted)]">
                          Paid {formatCurrencyCents(fin.depositPaidCents, currencyCode)} · Bal{' '}
                          <strong className="text-[var(--barn-ink)]">
                            {formatCurrencyCents(fin.balanceRemainingCents, currencyCode)}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Deposit & Balance Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-[var(--barn-muted)]">
                        <span>
                          Deposit {formatCurrencyCents(fin.depositPaidCents, currencyCode)} /{' '}
                          {formatCurrencyCents(fin.depositRequiredCents, currencyCode)} required (
                          {fin.depositCoveragePercent}%)
                        </span>
                        <span>{fin.totalPaidPercent}% of total price paid</span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--barn-surface)] border border-[var(--barn-border)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--barn-sage)] transition-all"
                          style={{ width: `${fin.totalPaidPercent}%` }}
                        />
                      </div>
                    </div>

                    {res.notes && (
                      <p className="text-xs text-[var(--barn-muted)] bg-[var(--barn-surface)] rounded-lg px-3 py-2 border border-[var(--barn-border)]/70">
                        {res.notes}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {!isTerminal && (
                          <button
                            type="button"
                            onClick={() => openRecordPaymentModal(res)}
                            className="min-h-[34px] px-3 py-1 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <DollarSign className="w-3.5 h-3.5" aria-hidden="true" />
                            Record Payment
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setPrintAgreementRes(res)}
                          className="min-h-[34px] px-3 py-1 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <Printer className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                          Sales Agreement
                        </button>
                        {!isTerminal && (
                          <button
                            type="button"
                            onClick={() => openCompleteSaleModal(res)}
                            className="min-h-[34px] px-3 py-1 rounded-xl border border-[var(--barn-sage)]/60 bg-[var(--barn-sage-tint)] hover:brightness-105 text-xs font-semibold text-[var(--barn-ink)] inline-flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                            Complete Sale
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditReservationModal(res)}
                          className="min-h-[34px] px-2.5 py-1 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteWithConfirm(deleteKey, () => onDeleteReservation(res.id))
                          }
                          className={`min-h-[34px] px-2.5 py-1 rounded-xl border text-xs font-medium inline-flex items-center gap-1 ${
                            pendingDeleteKey === deleteKey
                              ? 'border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)] text-[var(--barn-terracotta)] font-semibold'
                              : 'border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[var(--barn-muted)]'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          {pendingDeleteKey === deleteKey ? 'Confirm Delete' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: BUYER WAITLIST */}
        {activeTab === 'waitlist' && (
          <div className="space-y-3">
            {filteredWaitlist.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--barn-border)] p-8 text-center space-y-2">
                <p className="text-sm font-medium">No waitlist inquiries match the current filter.</p>
                <p className="text-xs text-[var(--barn-muted)]">
                  Track ranked buyer requests by breed, variety, sex, and target pairing — then match available stock in one click.
                </p>
                <button
                  type="button"
                  onClick={() => openNewWaitlistModal()}
                  className="min-h-[38px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Add First Waitlist Inquiry
                </button>
              </div>
            ) : (
              filteredWaitlist.map((entry) => {
                const client = clientById.get(entry.clientId);
                const deleteKey = `wait-${entry.id}`;
                const isMatchExpanded = expandedMatchWaitlistId === entry.id;
                const matches = isMatchExpanded
                  ? findWaitlistMatches(entry, animals, breedings, animalReservations)
                  : [];

                return (
                  <article
                    key={entry.id}
                    className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/40 font-mono text-[11px] font-bold text-[var(--barn-sage)]">
                            Queue #{entry.priorityRank}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[11px] font-semibold">
                            {entry.status}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[11px] text-[var(--barn-muted)]">
                            {entry.intent}
                          </span>
                          <h3 className="text-sm font-semibold text-[var(--barn-ink)]">
                            {client?.fullName || entry.clientName}
                          </h3>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--barn-muted)]">
                          <span>
                            Seeking:{' '}
                            <strong className="text-[var(--barn-ink)]">
                              {[
                                entry.desiredBreed || 'Any breed',
                                entry.desiredVariety,
                                entry.preferredSex !== 'Any' ? entry.preferredSex : '',
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </strong>
                          </span>
                          <span>Inquired {formatReadableDate(entry.inquiryDateIso)}</span>
                          {entry.followUpDateIso && (
                            <span>Follow-up: {formatReadableDate(entry.followUpDateIso)}</span>
                          )}
                          {entry.maxBudgetCents && entry.maxBudgetCents > 0 && (
                            <span>
                              Budget: {formatCurrencyCents(entry.maxBudgetCents, currencyCode)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedMatchWaitlistId(isMatchExpanded ? null : entry.id)
                          }
                          className="min-h-[34px] px-3 py-1 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/50 hover:brightness-105 text-xs font-semibold text-[var(--barn-ink)] inline-flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                          {isMatchExpanded ? 'Hide Matches' : 'Match Stock'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openNewReservationModal({ client, waitlistEntry: entry })}
                          className="min-h-[34px] px-3 py-1 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1"
                        >
                          Reserve
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditWaitlistModal(entry)}
                          className="min-h-[34px] px-2.5 py-1 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteWithConfirm(deleteKey, () => onDeleteWaitlistEntry(entry.id))
                          }
                          className={`min-h-[34px] px-2.5 py-1 rounded-xl border text-xs font-medium inline-flex items-center gap-1 ${
                            pendingDeleteKey === deleteKey
                              ? 'border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)] text-[var(--barn-terracotta)] font-semibold'
                              : 'border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[var(--barn-muted)]'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          {pendingDeleteKey === deleteKey ? 'Confirm Delete' : 'Delete'}
                        </button>
                      </div>
                    </div>

                    {entry.notes && (
                      <p className="text-xs text-[var(--barn-muted)] bg-[var(--barn-surface)] rounded-lg px-3 py-2 border border-[var(--barn-border)]/70">
                        {entry.notes}
                      </p>
                    )}

                    {isMatchExpanded && (
                      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-xl p-3 space-y-2">
                        <div className="text-xs font-semibold">
                          Unreserved Herd &amp; Pairing Matches ({matches.length})
                        </div>
                        {matches.length === 0 ? (
                          <p className="text-xs text-[var(--barn-muted)]">
                            No unreserved animals or active breedings matched these criteria yet.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {matches.map((m) => (
                              <div
                                key={`${m.kind}-${m.id}`}
                                className="rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-2.5 flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold truncate">
                                    {m.kind === 'animal' ? 'Animal: ' : 'Litter: '}
                                    {m.label}
                                  </div>
                                  <div className="text-[11px] text-[var(--barn-muted)] truncate">
                                    {m.sublabel} · {m.reasons.join(' · ')}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openNewReservationModal({
                                      client,
                                      waitlistEntry: entry,
                                      matchCandidate: m,
                                    })
                                  }
                                  className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold shrink-0"
                                >
                                  Promote to Hold
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        )}

        {/* TAB 3: CLIENT DIRECTORY */}
        {activeTab === 'clients' && (
          <div className="space-y-3">
            {filteredClients.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--barn-border)] p-8 text-center space-y-2">
                <p className="text-sm font-medium">No buyer contacts match the current filter.</p>
                <p className="text-xs text-[var(--barn-muted)]">
                  Save repeat show homes, 4-H/FFA families, homestead buyers, and preferred contact details here.
                </p>
                <button
                  type="button"
                  onClick={openNewClientModal}
                  className="min-h-[38px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" aria-hidden="true" />
                  Add First Client
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredClients.map((client) => {
                  const resCount = animalReservations.filter((r) => r.clientId === client.id).length;
                  const waitCount = waitlistEntries.filter((w) => w.clientId === client.id).length;
                  const deleteKey = `cli-${client.id}`;

                  return (
                    <article
                      key={client.id}
                      className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-4 flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold truncate">{client.fullName}</h3>
                            {client.ranchOrHerdName && (
                              <div className="text-xs text-[var(--barn-muted)] truncate">
                                {client.ranchOrHerdName}
                              </div>
                            )}
                          </div>
                          <span className="px-2 py-0.5 rounded-md bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[11px] font-medium shrink-0">
                            {formatClientKindLabel(client.clientKind)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--barn-muted)]">
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" aria-hidden="true" />
                            Prefers {formatPreferredContactLabel(client.preferredContact)}
                          </span>
                          {client.phone && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                              {client.phone}
                            </span>
                          )}
                          {client.email && (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                              {client.email}
                            </span>
                          )}
                          {client.cityState && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                              {client.cityState}
                            </span>
                          )}
                        </div>

                        {client.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {client.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 rounded-md bg-[var(--barn-sage-tint)] text-[11px] font-medium text-[var(--barn-sage)]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {client.notes && (
                          <p className="text-xs text-[var(--barn-muted)]">{client.notes}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--barn-border)]/70">
                        <span className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
                          {resCount} reservation{resCount === 1 ? '' : 's'} · {waitCount} waitlist
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openNewWaitlistModal(client)}
                            className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold"
                          >
                            + Waitlist
                          </button>
                          <button
                            type="button"
                            onClick={() => openNewReservationModal({ client })}
                            className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold"
                          >
                            + Reserve
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditClientModal(client)}
                            aria-label={`Edit ${client.fullName}`}
                            className="min-h-[30px] px-2 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px]"
                          >
                            <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteWithConfirm(deleteKey, () => onDeleteClient(client.id))
                            }
                            className={`min-h-[30px] px-2 py-1 rounded-lg border text-[11px] ${
                              pendingDeleteKey === deleteKey
                                ? 'border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)] text-[var(--barn-terracotta)] font-semibold'
                                : 'border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[var(--barn-muted)]'
                            }`}
                          >
                            {pendingDeleteKey === deleteKey ? 'Confirm' : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* CLIENT MODAL */}
      {clientDraft && (
        <div
          ref={clientDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="crm-client-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !clientSubmitLock.isSubmitting) setClientDraft(null);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => void handleSaveClientForm(e)}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4 focus:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="crm-client-modal-title" className="font-display text-lg font-semibold">
                {clientDraft.id ? 'Edit Client Contact' : 'New Client Contact'}
              </h2>
              <button
                type="button"
                onClick={() => setClientDraft(null)}
                aria-label="Close client modal"
                className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="space-y-1 sm:col-span-2">
                <span className="font-semibold">Full Name *</span>
                <input
                  type="text"
                  required
                  value={clientDraft.fullName}
                  onChange={(e) =>
                    setClientDraft((prev) => (prev ? { ...prev, fullName: e.target.value } : prev))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Ranch / Herd Name</span>
                <input
                  type="text"
                  value={clientDraft.ranchOrHerdName}
                  onChange={(e) =>
                    setClientDraft((prev) =>
                      prev ? { ...prev, ranchOrHerdName: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Client Type</span>
                <select
                  value={clientDraft.clientKind}
                  onChange={(e) =>
                    setClientDraft((prev) =>
                      prev ? { ...prev, clientKind: e.target.value as ClientKind } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  {CLIENT_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Phone</span>
                <input
                  type="tel"
                  value={clientDraft.phone}
                  onChange={(e) =>
                    setClientDraft((prev) => (prev ? { ...prev, phone: e.target.value } : prev))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Email</span>
                <input
                  type="email"
                  value={clientDraft.email}
                  onChange={(e) =>
                    setClientDraft((prev) => (prev ? { ...prev, email: e.target.value } : prev))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Preferred Contact</span>
                <select
                  value={clientDraft.preferredContact}
                  onChange={(e) =>
                    setClientDraft((prev) =>
                      prev
                        ? { ...prev, preferredContact: e.target.value as PreferredContactMethod }
                        : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  {PREFERRED_CONTACT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">City / State</span>
                <input
                  type="text"
                  value={clientDraft.cityState}
                  onChange={(e) =>
                    setClientDraft((prev) => (prev ? { ...prev, cityState: e.target.value } : prev))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="font-semibold">Pickup / Shipping Address</span>
                <input
                  type="text"
                  value={clientDraft.shippingAddress}
                  onChange={(e) =>
                    setClientDraft((prev) =>
                      prev ? { ...prev, shippingAddress: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="font-semibold">Tags (comma-separated)</span>
                <input
                  type="text"
                  placeholder="Repeat buyer, Show home, Transport"
                  value={clientDraft.tagsText}
                  onChange={(e) =>
                    setClientDraft((prev) => (prev ? { ...prev, tagsText: e.target.value } : prev))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="font-semibold">Notes</span>
                <textarea
                  rows={2}
                  value={clientDraft.notes}
                  onChange={(e) =>
                    setClientDraft((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setClientDraft(null)}
                className="min-h-[38px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={clientSubmitLock.isSubmitting}
                className="min-h-[38px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60"
              >
                {clientSubmitLock.isSubmitting ? 'Saving...' : 'Save Client'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* WAITLIST MODAL */}
      {waitlistDraft && (
        <div
          ref={waitlistDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="crm-waitlist-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !waitlistSubmitLock.isSubmitting) {
              setWaitlistDraft(null);
            }
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => void handleSaveWaitlistForm(e)}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4 focus:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="crm-waitlist-modal-title" className="font-display text-lg font-semibold">
                {waitlistDraft.id ? 'Edit Waitlist Inquiry' : 'New Buyer Waitlist Inquiry'}
              </h2>
              <button
                type="button"
                onClick={() => setWaitlistDraft(null)}
                aria-label="Close waitlist modal"
                className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="font-semibold">Saved Client</span>
                <select
                  value={waitlistDraft.clientId}
                  onChange={(e) => {
                    const selected = clientById.get(e.target.value);
                    setWaitlistDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            clientId: e.target.value,
                            clientName: selected?.fullName || prev.clientName,
                          }
                        : prev
                    );
                  }}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">-- Enter name directly --</option>
                  {clientContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Buyer Name *</span>
                <input
                  type="text"
                  required
                  value={waitlistDraft.clientName}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, clientName: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Queue Rank</span>
                <input
                  type="number"
                  min={1}
                  value={waitlistDraft.priorityRank}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, priorityRank: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Status</span>
                <select
                  value={waitlistDraft.status}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, status: e.target.value as WaitlistStatus } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  {WAITLIST_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Buyer Intent</span>
                <select
                  value={waitlistDraft.intent}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, intent: e.target.value as WaitlistIntent } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  {WAITLIST_INTENTS.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Preferred Sex</span>
                <select
                  value={waitlistDraft.preferredSex}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev
                        ? { ...prev, preferredSex: e.target.value as 'Any' | 'Male' | 'Female' }
                        : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="Any">Any Sex</option>
                  <option value="Male">{speciesProfile.maleLabel} (Male)</option>
                  <option value="Female">{speciesProfile.femaleLabel} (Female)</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Desired Breed</span>
                <input
                  type="text"
                  value={waitlistDraft.desiredBreed}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, desiredBreed: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Desired Variety / Color</span>
                <input
                  type="text"
                  value={waitlistDraft.desiredVariety}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, desiredVariety: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="font-semibold">Preferred Pairing / Litter</span>
                <select
                  value={waitlistDraft.preferredBreedingId}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, preferredBreedingId: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">-- Any pairing --</option>
                  {activeBreedings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.sireName || 'Sire'} × {b.damName || 'Dam'} ({b.status})
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Inquiry Date</span>
                <input
                  type="date"
                  value={waitlistDraft.inquiryDateIso}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, inquiryDateIso: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Follow-Up Reminder Date</span>
                <input
                  type="date"
                  value={waitlistDraft.followUpDateIso}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, followUpDateIso: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Needed By Date</span>
                <input
                  type="date"
                  value={waitlistDraft.requestedByDateIso}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, requestedByDateIso: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Max Budget ({currencyCode})</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={waitlistDraft.maxBudget}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, maxBudget: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="font-semibold">Notes</span>
                <textarea
                  rows={2}
                  value={waitlistDraft.notes}
                  onChange={(e) =>
                    setWaitlistDraft((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setWaitlistDraft(null)}
                className="min-h-[38px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={waitlistSubmitLock.isSubmitting}
                className="min-h-[38px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60"
              >
                {waitlistSubmitLock.isSubmitting ? 'Saving...' : 'Save Waitlist'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* RESERVATION MODAL */}
      {reservationDraft && (
        <div
          ref={reservationDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="crm-reservation-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !reservationSubmitLock.isSubmitting) {
              setReservationDraft(null);
            }
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => void handleSaveReservationForm(e)}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4 focus:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="crm-reservation-modal-title" className="font-display text-lg font-semibold">
                {reservationDraft.id ? 'Edit Reservation & Deposit' : 'New Animal / Litter Reservation'}
              </h2>
              <button
                type="button"
                onClick={() => setReservationDraft(null)}
                aria-label="Close reservation modal"
                className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="font-semibold">Agreement #</span>
                <input
                  type="text"
                  value={reservationDraft.agreementNumber}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, agreementNumber: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Status</span>
                <select
                  value={reservationDraft.status}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, status: e.target.value as ReservationStatus } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  {RESERVATION_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Saved Client</span>
                <select
                  value={reservationDraft.clientId}
                  onChange={(e) => {
                    const selected = clientById.get(e.target.value);
                    setReservationDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            clientId: e.target.value,
                            clientName: selected?.fullName || prev.clientName,
                          }
                        : prev
                    );
                  }}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">-- Enter buyer name directly --</option>
                  {clientContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Buyer Name *</span>
                <input
                  type="text"
                  required
                  value={reservationDraft.clientName}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, clientName: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Linked Animal</span>
                <select
                  value={reservationDraft.animalId}
                  onChange={(e) => {
                    const linked = herdById.get(e.target.value);
                    setReservationDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            animalId: e.target.value,
                            itemLabel:
                              linked && !prev.itemLabel
                                ? `${linked.name}${linked.tattoo ? ` (#${linked.tattoo})` : ''}`
                                : prev.itemLabel,
                          }
                        : prev
                    );
                  }}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">-- Optional specific animal --</option>
                  {availableAnimals.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} {a.tattoo ? `(#${a.tattoo})` : ''} · {a.sex}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Linked Pairing / Litter</span>
                <select
                  value={reservationDraft.breedingId}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, breedingId: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">-- Optional litter pick pairing --</option>
                  {breedings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.sireName || 'Sire'} × {b.damName || 'Dam'} ({b.status})
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="font-semibold">Reserved Animal / Litter Pick Description *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Black Doe #B14 or 1st Pick Buck from Fall Litter"
                  value={reservationDraft.itemLabel}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, itemLabel: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Total Price ({currencyCode})</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={reservationDraft.totalPrice}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, totalPrice: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Deposit Required ({currencyCode})</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={reservationDraft.depositRequired}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, depositRequired: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Deposit / Payments Paid ({currencyCode})</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={reservationDraft.depositPaid}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, depositPaid: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Payment Method</span>
                <input
                  type="text"
                  placeholder="Cash, Venmo, Zelle, Check..."
                  value={reservationDraft.paymentMethod}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, paymentMethod: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Deposit Due Date</span>
                <input
                  type="date"
                  value={reservationDraft.depositDueDateIso}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, depositDueDateIso: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Hold Expires Date</span>
                <input
                  type="date"
                  value={reservationDraft.holdExpiresDateIso}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, holdExpiresDateIso: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Balance Reminder Date</span>
                <input
                  type="date"
                  value={reservationDraft.balanceReminderDateIso}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, balanceReminderDateIso: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Scheduled Pickup Date</span>
                <input
                  type="date"
                  value={reservationDraft.pickupScheduledDateIso}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, pickupScheduledDateIso: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="font-semibold">Custom Deposit Terms (Optional)</span>
                <textarea
                  rows={2}
                  placeholder="Leave blank for standard non-refundable deposit & pedigree transfer clause."
                  value={reservationDraft.termsSummary}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, termsSummary: e.target.value } : prev
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="font-semibold">Notes</span>
                <textarea
                  rows={2}
                  value={reservationDraft.notes}
                  onChange={(e) =>
                    setReservationDraft((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReservationDraft(null)}
                className="min-h-[38px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reservationSubmitLock.isSubmitting}
                className="min-h-[38px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60"
              >
                {reservationSubmitLock.isSubmitting ? 'Saving...' : 'Save Reservation'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {paymentModalRes && (
        <div
          ref={paymentDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="crm-payment-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !paymentSubmitLock.isSubmitting) {
              setPaymentModalRes(null);
            }
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => void handleRecordPaymentSubmit(e)}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-md p-5 space-y-4 focus:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="crm-payment-modal-title" className="font-display text-lg font-semibold">
                  Record Payment — {paymentModalRes.agreementNumber}
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  {paymentModalRes.clientName} · {paymentModalRes.itemLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentModalRes(null)}
                aria-label="Close payment modal"
                className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block space-y-1">
                <span className="font-semibold">Payment Received ({currencyCode}) *</span>
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  required
                  value={paymentAmountInput}
                  onChange={(e) => setPaymentAmountInput(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Payment Date</span>
                <input
                  type="date"
                  value={paymentDateInput}
                  onChange={(e) => setPaymentDateInput(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Payment Method</span>
                <input
                  type="text"
                  placeholder="Venmo, Zelle, Cash, Check..."
                  value={paymentMethodInput}
                  onChange={(e) => setPaymentMethodInput(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPaymentModalRes(null)}
                className="min-h-[38px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={paymentSubmitLock.isSubmitting}
                className="min-h-[38px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60"
              >
                {paymentSubmitLock.isSubmitting ? 'Saving...' : 'Apply Payment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* COMPLETE SALE MODAL */}
      {completeSaleRes && (
        <div
          ref={completeSaleDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="crm-complete-sale-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !completeSaleSubmitLock.isSubmitting) {
              setCompleteSaleRes(null);
            }
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => void handleCompleteSaleSubmit(e)}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-md p-5 space-y-4 focus:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="crm-complete-sale-title" className="font-display text-lg font-semibold">
                  Complete Handoff &amp; Sale
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  {completeSaleRes.agreementNumber} · {completeSaleRes.clientName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompleteSaleRes(null)}
                aria-label="Close complete sale modal"
                className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {completeSaleWithdrawal && (
              <div className="rounded-xl border border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)] p-3 text-xs flex items-start gap-2">
                <AlertTriangle
                  className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <div className="font-semibold">Active Medication Withdrawal</div>
                  <div className="text-[11px] text-[var(--barn-muted)]">
                    {completeSaleWithdrawal.medicationSummary} clears{' '}
                    {formatReadableDate(completeSaleWithdrawal.clearDateIso)}. Ensure buyer receives disclosure on the printable Sales Agreement.
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <label className="block space-y-1">
                <span className="font-semibold">Pickup / Completion Date</span>
                <input
                  type="date"
                  value={completeSaleDate}
                  onChange={(e) => setCompleteSaleDate(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              {completeSaleRes.animalId && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={completeMarkAnimalSold}
                    onChange={(e) => setCompleteMarkAnimalSold(e.target.checked)}
                    className="rounded border-[var(--barn-border)]"
                  />
                  <span>Mark linked animal status as Sold &amp; record buyer</span>
                </label>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={completeRecordLedger}
                  onChange={(e) => setCompleteRecordLedger(e.target.checked)}
                  className="rounded border-[var(--barn-border)]"
                />
                <span>
                  Record {formatCurrencyCents(Math.max(completeSaleRes.totalPriceCents, completeSaleRes.depositPaidCents), currencyCode)} income entry in Economics Ledger
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCompleteSaleRes(null)}
                className="min-h-[38px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={completeSaleSubmitLock.isSubmitting}
                className="min-h-[38px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60"
              >
                {completeSaleSubmitLock.isSubmitting ? 'Completing...' : 'Complete Sale'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SALES AGREEMENT PRINT PREVIEW MODAL */}
      {printAgreementRes && (
        <PrintPreviewModal
          title={`Sales Agreement — ${printAgreementRes.agreementNumber || printAgreementRes.clientName}`}
          filename={`${(printAgreementRes.agreementNumber || 'sales-agreement').toLowerCase()}.htm`}
          htmlContent={printAgreementHtml}
          onClose={() => setPrintAgreementRes(null)}
        />
      )}
    </div>
  );
}
```

## `src/components/CoatExplorerSandbox.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Interactive "What-If" Genetic Variety & Coat Explorer Sandbox (`src/components/CoatExplorerSandbox.tsx`).
 *
 * Lets breeders experiment with hypothetical loci combinations, variety presets, and What-If
 * Sire × Dam Punnett crosses inside Breeding Lab without creating temporary animal records.
 * Strictly ephemeral React state — never writes to IndexedDB/SQLite or `useBarnStore`.
 */

import {
  AlertTriangle,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  Dna,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  buildPresetGenotypeWithConfirmations,
  buildSandboxHypotheticalAnimal,
  evaluateSingleGenotypeSandbox,
  getGeneticsSpecForSpecies,
  getSpeciesVarietyPresets,
  parseGenotypeString,
  setLocusInGenotypeString,
  simulatePairingGenetics,
  SingleGenotypeEvaluation,
  SpeciesGeneticsSpec,
  VarietyPresetDefinition,
} from '../core/geneticsEngine';
import { Animal, BiologicalSex, SpeciesProfile } from '../core/models';
import { ColorGeneticsNotice } from './ColorGeneticsNotice';

type SandboxMode = 'single' | 'cross';

interface CoatExplorerSandboxProps {
  speciesProfile: SpeciesProfile;
  males: Animal[];
  females: Animal[];
  activeSire?: Animal;
  activeDam?: Animal;
}

interface SandboxGenotypeEditorProps {
  idPrefix: string;
  title: string;
  accentTone: 'neutral' | 'sire' | 'dam';
  speciesProfile: SpeciesProfile;
  spec: SpeciesGeneticsSpec;
  varietyPresets: VarietyPresetDefinition[];
  herdPool: Animal[];
  genotypeRaw: string;
  sex: BiologicalSex;
  onChangeGenotype: (next: string) => void;
  evaluation: SingleGenotypeEvaluation;
  compactGrid?: boolean;
}

function SandboxGenotypeEditor({
  idPrefix,
  title,
  accentTone,
  speciesProfile,
  spec,
  varietyPresets,
  herdPool,
  genotypeRaw,
  sex,
  onChangeGenotype,
  evaluation,
  compactGrid = false,
}: SandboxGenotypeEditorProps) {
  const [stagedPreset, setStagedPreset] = useState<VarietyPresetDefinition | null>(null);
  const [stagedChecks, setStagedChecks] = useState<Record<string, boolean>>({});
  const [showLocusGrid, setShowLocusGrid] = useState(true);

  useEffect(() => {
    setStagedPreset(null);
    setStagedChecks({});
  }, [speciesProfile.name]);

  const parsedByLocus = useMemo(() => {
    const map = new Map<string, { allele1: string; allele2: string }>();
    for (const pair of parseGenotypeString(genotypeRaw, speciesProfile.name)) {
      map.set(pair.locus, { allele1: pair.allele1 || '_', allele2: pair.allele2 || '_' });
    }
    return map;
  }, [genotypeRaw, speciesProfile.name]);

  const handleSelectPreset = (varietyName: string) => {
    if (!varietyName) return;
    const preset = varietyPresets.find((p) => p.variety === varietyName);
    if (!preset) return;
    if (preset.optionalConfirmations && preset.optionalConfirmations.length > 0) {
      setStagedPreset(preset);
      setStagedChecks({});
    } else {
      setStagedPreset(null);
      setStagedChecks({});
      onChangeGenotype(preset.conservativeGenotype);
    }
  };

  const handleApplyStagedPreset = () => {
    if (!stagedPreset) return;
    const confirmedLoci = Object.entries(stagedChecks)
      .filter(([, checked]) => checked)
      .map(([locus]) => locus);
    onChangeGenotype(
      buildPresetGenotypeWithConfirmations(stagedPreset, confirmedLoci, speciesProfile.name)
    );
    setStagedPreset(null);
    setStagedChecks({});
  };

  const handleSeedFromHerd = (animalId: string) => {
    if (!animalId) return;
    const picked = herdPool.find((a) => a.id === animalId);
    if (!picked) return;
    setStagedPreset(null);
    onChangeGenotype(picked.genotypeRaw || '');
  };

  const borderClass =
    accentTone === 'sire'
      ? 'border-[var(--barn-slate)]/50'
      : accentTone === 'dam'
      ? 'border-[var(--barn-terracotta)]/50'
      : 'border-[var(--barn-border)]';

  const titleColorClass =
    accentTone === 'sire'
      ? 'text-[var(--barn-slate)]'
      : accentTone === 'dam'
      ? 'text-[var(--barn-terracotta)]'
      : 'text-[var(--barn-ink)]';

  return (
    <div className={`p-4 rounded-xl bg-[var(--barn-canvas)] border ${borderClass} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={`text-xs font-semibold ${titleColorClass}`}>{title}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {herdPool.length > 0 && (
            <select
              aria-label={`Copy genotype from ${speciesProfile.name} herd for ${title}`}
              value=""
              onChange={(e) => handleSeedFromHerd(e.target.value)}
              className="min-h-[32px] max-w-[190px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[11px]"
            >
              <option value="">Seed from herd...</option>
              {herdPool.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.tattoo || 'No ID'})
                  {a.genotypeRaw ? ` · ${a.genotypeRaw}` : ' · no genotype'}
                </option>
              ))}
            </select>
          )}
          {varietyPresets.length > 0 && (
            <select
              aria-label={`Load variety preset for ${title}`}
              value=""
              onChange={(e) => handleSelectPreset(e.target.value)}
              className="min-h-[32px] max-w-[200px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[11px]"
            >
              <option value="">Variety preset...</option>
              {varietyPresets.map((preset) => (
                <option key={preset.variety} value={preset.variety}>
                  {preset.variety} ({preset.conservativeGenotype})
                </option>
              ))}
            </select>
          )}
          {genotypeRaw.trim() && (
            <button
              type="button"
              onClick={() => {
                setStagedPreset(null);
                onChangeGenotype('');
              }}
              className="min-h-[32px] px-2 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium text-[var(--barn-muted)] hover:text-[var(--barn-ink)] inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              Clear
            </button>
          )}
        </div>
      </div>

      {stagedPreset && (
        <div className="p-3 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-sage)] space-y-2 text-xs">
          <div className="font-semibold text-[var(--barn-ink)]">
            Verify Optional Modifiers for &ldquo;{stagedPreset.variety}&rdquo;
          </div>
          <div className="text-[11px] text-[var(--barn-muted)]">
            Preview:{' '}
            <code className="font-mono text-[var(--barn-ink)]">
              {buildPresetGenotypeWithConfirmations(
                stagedPreset,
                Object.entries(stagedChecks)
                  .filter(([, checked]) => checked)
                  .map(([locus]) => locus),
                speciesProfile.name
              )}
            </code>
          </div>
          {(stagedPreset.optionalConfirmations || []).map((opt) => (
            <label
              key={opt.locus}
              className="flex items-start gap-2 p-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] cursor-pointer"
            >
              <input
                type="checkbox"
                checked={Boolean(stagedChecks[opt.locus])}
                onChange={(e) =>
                  setStagedChecks((prev) => ({
                    ...prev,
                    [opt.locus]: e.target.checked,
                  }))
                }
                className="mt-0.5 rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
              />
              <span>
                <strong className="text-[var(--barn-ink)]">{opt.label}</strong>
                <span className="block text-[11px] text-[var(--barn-muted)] mt-0.5">
                  {opt.explanation}
                </span>
              </span>
            </label>
          ))}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setStagedPreset(null);
                setStagedChecks({});
              }}
              className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyStagedPreset}
              className="min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
            >
              Apply Preset
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <label htmlFor={`${idPrefix}-raw`} className="sr-only">
            {title} shorthand genotype
          </label>
          <input
            id={`${idPrefix}-raw`}
            type="text"
            placeholder={
              varietyPresets[0]?.conservativeGenotype ||
              spec.loci.map(() => '__').join(' ')
            }
            value={genotypeRaw}
            onChange={(e) => onChangeGenotype(e.target.value)}
            className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowLocusGrid((v) => !v)}
          aria-expanded={showLocusGrid}
          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium whitespace-nowrap"
        >
          {showLocusGrid ? 'Hide Loci' : `Edit ${spec.loci.length} Loci`}
        </button>
      </div>

      {/* Live Single-Genotype Prediction Readout */}
      <div className="p-3 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-2 text-xs">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <span className="text-[11px] text-[var(--barn-muted)] mr-1.5">Predicted Coat:</span>
            <span
              className={`font-semibold ${
                evaluation.hasInsufficientLoci
                  ? 'text-[var(--barn-muted)]'
                  : 'text-[var(--barn-ink)]'
              }`}
            >
              {evaluation.predictedVariety}
            </span>
          </div>
          {!evaluation.hasInsufficientLoci && evaluation.normalizedGenotype && (
            <span className="font-mono text-[11px] text-[var(--barn-muted)]">
              {evaluation.normalizedGenotype}
            </span>
          )}
        </div>

        {!evaluation.hasInsufficientLoci && evaluation.unverifiedCoreLoci.length > 0 && (
          <div className="text-[11px] text-[var(--barn-terracotta)]">
            Unverified core loci ({evaluation.unverifiedCoreLoci.join(', ')}) — prediction assumes
            dominant/default expression where blank.
          </div>
        )}

        {evaluation.recessiveCarriers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[10px] font-medium text-[var(--barn-muted)]">
              Hidden / Heterozygous Carriers:
            </span>
            {evaluation.recessiveCarriers.map((c) => (
              <span
                key={`${c.locus}-${c.allele}`}
                title={`${c.locusName} (${c.pair}): ${c.description}`}
                className="px-1.5 py-0.5 rounded bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/40 font-mono text-[10px] text-[var(--barn-ink)]"
              >
                {c.locus}: carries {c.allele} ({c.pair})
              </span>
            ))}
          </div>
        )}

        {evaluation.healthAlerts.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {evaluation.healthAlerts.map((alert, idx) => (
              <div
                key={`${alert.title}-${idx}`}
                className={`p-2 rounded-lg border text-[11px] ${
                  alert.severity === 'danger'
                    ? 'bg-[var(--barn-danger)]/10 border-[var(--barn-danger)] text-[var(--barn-ink)]'
                    : alert.severity === 'warning'
                    ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)] text-[var(--barn-ink)]'
                    : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] text-[var(--barn-muted)]'
                }`}
              >
                <div className="font-semibold flex items-center gap-1.5">
                  {alert.severity !== 'info' && (
                    <AlertTriangle
                      className={`w-3.5 h-3.5 shrink-0 ${
                        alert.severity === 'danger'
                          ? 'text-[var(--barn-danger)]'
                          : 'text-[var(--barn-terracotta)]'
                      }`}
                      aria-hidden="true"
                    />
                  )}
                  <span>{alert.title}</span>
                </div>
                <p className="text-[10px] text-[var(--barn-muted)] mt-0.5">{alert.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Locus Allele Picker Grid */}
      {showLocusGrid && (
        <div
          className={`grid gap-2 ${
            compactGrid
              ? 'grid-cols-2 sm:grid-cols-3'
              : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
          }`}
        >
          {spec.loci.map((locusDef) => {
            const pair = parsedByLocus.get(locusDef.locus);
            const isXLinkedMale = locusDef.inheritanceMode === 'x_linked' && sex === 'Male';
            const a1 = pair?.allele1 || '_';
            const a2 = isXLinkedMale ? 'Y' : pair?.allele2 || '_';

            return (
              <div
                key={locusDef.locus}
                title={locusDef.description}
                className="p-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-1"
              >
                <div className="flex items-center justify-between gap-1 text-[11px]">
                  <span className="font-semibold text-[var(--barn-ink)] truncate">
                    <span className="font-mono">{locusDef.locus}</span> · {locusDef.name}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <select
                    aria-label={`${title} ${locusDef.name} allele 1`}
                    value={a1}
                    onChange={(e) =>
                      onChangeGenotype(
                        setLocusInGenotypeString(
                          genotypeRaw,
                          locusDef.locus,
                          e.target.value,
                          a2,
                          speciesProfile.name,
                          sex
                        )
                      )
                    }
                    className="flex-1 min-w-0 min-h-[32px] px-1.5 py-0.5 rounded bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
                  >
                    <option value="_">_</option>
                    {locusDef.alleles.map((al) => (
                      <option key={al} value={al}>
                        {al}
                      </option>
                    ))}
                  </select>
                  {isXLinkedMale ? (
                    <span className="min-h-[32px] px-2 py-0.5 rounded bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono text-[var(--barn-muted)] inline-flex items-center">
                      Y
                    </span>
                  ) : (
                    <select
                      aria-label={`${title} ${locusDef.name} allele 2`}
                      value={a2}
                      onChange={(e) =>
                        onChangeGenotype(
                          setLocusInGenotypeString(
                            genotypeRaw,
                            locusDef.locus,
                            a1,
                            e.target.value,
                            speciesProfile.name,
                            sex
                          )
                        )
                      }
                      className="flex-1 min-w-0 min-h-[32px] px-1.5 py-0.5 rounded bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
                    >
                      <option value="_">_</option>
                      {locusDef.alleles.map((al) => (
                        <option key={al} value={al}>
                          {al}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CoatExplorerSandbox({
  speciesProfile,
  males,
  females,
  activeSire,
  activeDam,
}: CoatExplorerSandboxProps) {
  const baseId = useId();
  const [isExpanded, setIsExpanded] = useState(true);
  const [mode, setMode] = useState<SandboxMode>('single');
  const [singleSex, setSingleSex] = useState<BiologicalSex>('Female');

  const spec = useMemo(
    () => getGeneticsSpecForSpecies(speciesProfile.name),
    [speciesProfile.name]
  );
  const varietyPresets = useMemo(
    () => getSpeciesVarietyPresets(speciesProfile.name),
    [speciesProfile.name]
  );

  const defaultSingleRaw = varietyPresets[0]?.conservativeGenotype || '';
  const defaultSireRaw = varietyPresets[0]?.conservativeGenotype || '';
  const defaultDamRaw =
    varietyPresets[1]?.conservativeGenotype || varietyPresets[0]?.conservativeGenotype || '';

  const [singleRaw, setSingleRaw] = useState<string>(defaultSingleRaw);
  const [sireRaw, setSireRaw] = useState<string>(defaultSireRaw);
  const [damRaw, setDamRaw] = useState<string>(defaultDamRaw);
  const [customNotesRaw, setCustomNotesRaw] = useState<string>('');

  // Reset sandbox cleanly whenever species changes
  useEffect(() => {
    const nextPresets = getSpeciesVarietyPresets(speciesProfile.name);
    setSingleRaw(nextPresets[0]?.conservativeGenotype || '');
    setSireRaw(nextPresets[0]?.conservativeGenotype || '');
    setDamRaw(nextPresets[1]?.conservativeGenotype || nextPresets[0]?.conservativeGenotype || '');
    setCustomNotesRaw('');
  }, [speciesProfile.name]);

  const allHerdPool = useMemo(() => [...females, ...males], [females, males]);

  const singleEval = useMemo(
    () => evaluateSingleGenotypeSandbox(singleRaw, speciesProfile.name, singleSex),
    [singleRaw, speciesProfile.name, singleSex]
  );

  const sireEval = useMemo(
    () => evaluateSingleGenotypeSandbox(sireRaw, speciesProfile.name, 'Male'),
    [sireRaw, speciesProfile.name]
  );

  const damEval = useMemo(
    () => evaluateSingleGenotypeSandbox(damRaw, speciesProfile.name, 'Female'),
    [damRaw, speciesProfile.name]
  );

  const hasXLinkedLocus = useMemo(
    () => Boolean(spec?.loci.some((l) => l.inheritanceMode === 'x_linked')),
    [spec]
  );

  const crossSimulation = useMemo(() => {
    if (!spec || mode !== 'cross') return null;
    const hypoSire = buildSandboxHypotheticalAnimal({
      id: '__sandbox_sire__',
      name: `Hypothetical ${speciesProfile.maleLabel}`,
      speciesName: speciesProfile.name,
      sex: 'Male',
      genotypeRaw: sireRaw,
    });
    const hypoDam = buildSandboxHypotheticalAnimal({
      id: '__sandbox_dam__',
      name: `Hypothetical ${speciesProfile.femaleLabel}`,
      speciesName: speciesProfile.name,
      sex: 'Female',
      genotypeRaw: damRaw,
    });
    return simulatePairingGenetics(hypoSire, hypoDam, speciesProfile.name);
  }, [spec, mode, speciesProfile.name, speciesProfile.maleLabel, speciesProfile.femaleLabel, sireRaw, damRaw]);

  const canSeedFromActiveLogger = Boolean(activeSire?.genotypeRaw || activeDam?.genotypeRaw);

  const handleSeedBothFromLogger = () => {
    if (activeSire) setSireRaw(activeSire.genotypeRaw || '');
    if (activeDam) setDamRaw(activeDam.genotypeRaw || '');
    setMode('cross');
    setIsExpanded(true);
  };

  const handleSwapParents = () => {
    const prevSire = sireRaw;
    const prevDam = damRaw;
    setSireRaw(prevDam);
    setDamRaw(prevSire);
  };

  return (
    <section
      aria-label="Genetic Variety and Coat Explorer Sandbox"
      className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-semibold inline-flex items-center gap-2">
              <Dna className="w-5 h-5 text-[var(--barn-sage)]" aria-hidden="true" />
              Genetic Variety &amp; Coat Explorer Sandbox
            </h2>
            <ColorGeneticsNotice compact />
          </div>
          <p className="text-xs text-[var(--barn-muted)]">
            What-If genotype playground for {speciesProfile.name} — experiment with hypothetical
            loci, presets, and test crosses with zero database writes or temporary animal records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {spec && (
            <div
              role="group"
              aria-label="Coat Explorer Sandbox Mode"
              className="inline-flex rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] p-1"
            >
              <button
                type="button"
                aria-pressed={mode === 'single'}
                onClick={() => {
                  setMode('single');
                  setIsExpanded(true);
                }}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${
                  mode === 'single'
                    ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                    : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                Single Genotype
              </button>
              <button
                type="button"
                aria-pressed={mode === 'cross'}
                onClick={() => {
                  setMode('cross');
                  setIsExpanded(true);
                }}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${
                  mode === 'cross'
                    ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                    : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                }`}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
                What-If Cross
              </button>
            </div>
          )}

          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((v) => !v)}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
          >
            {isExpanded ? (
              <>
                Collapse <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              </>
            ) : (
              <>
                Open Sandbox <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </div>

      {isExpanded && !spec && (
        <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3 text-xs">
          <p className="text-[var(--barn-muted)]">
            <strong className="text-[var(--barn-ink)]">{speciesProfile.name}</strong> uses custom
            species rules — built-in coat color locus presets and Rabbit Punnett rules are not
            applied. You can still jot temporary DNA or color notes below without saving an animal
            record.
          </p>
          <div>
            <label htmlFor={`${baseId}-custom-notes`} className="sr-only">
              Custom species scratchpad genotype notes
            </label>
            <input
              id={`${baseId}-custom-notes`}
              type="text"
              value={customNotesRaw}
              onChange={(e) => setCustomNotesRaw(e.target.value)}
              placeholder={`Temporary ${speciesProfile.name} color / DNA scratchpad (not saved)...`}
              className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono"
            />
          </div>
        </div>
      )}

      {isExpanded && spec && mode === 'single' && (
        <div className="space-y-3">
          {hasXLinkedLocus && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[var(--barn-muted)] font-medium">
                Simulated Sex (for X-linked loci):
              </span>
              <div
                role="group"
                aria-label="Simulated animal sex"
                className="inline-flex rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] p-0.5"
              >
                {(['Female', 'Male'] as const).map((sexOpt) => (
                  <button
                    key={sexOpt}
                    type="button"
                    aria-pressed={singleSex === sexOpt}
                    onClick={() => setSingleSex(sexOpt)}
                    className={`min-h-[30px] px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      singleSex === sexOpt
                        ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                        : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                    }`}
                  >
                    {sexOpt === 'Male' ? speciesProfile.maleLabel : speciesProfile.femaleLabel}
                  </button>
                ))}
              </div>
            </div>
          )}

          <SandboxGenotypeEditor
            idPrefix={`${baseId}-single`}
            title={`Hypothetical ${speciesProfile.name} Genotype`}
            accentTone="neutral"
            speciesProfile={speciesProfile}
            spec={spec}
            varietyPresets={varietyPresets}
            herdPool={allHerdPool}
            genotypeRaw={singleRaw}
            sex={singleSex}
            onChangeGenotype={setSingleRaw}
            evaluation={singleEval}
          />
        </div>
      )}

      {isExpanded && spec && mode === 'cross' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-[var(--barn-muted)]">
              Tweak either parent&apos;s loci or seed from your herd to preview hypothetical Punnett
              ratios.
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {canSeedFromActiveLogger && (
                <button
                  type="button"
                  onClick={handleSeedBothFromLogger}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] text-[11px] font-semibold text-[var(--barn-ink)] hover:brightness-95"
                >
                  Copy Active Logger Parents
                </button>
              )}
              <button
                type="button"
                onClick={handleSwapParents}
                className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium inline-flex items-center gap-1"
              >
                <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
                Swap Sire &amp; Dam
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <SandboxGenotypeEditor
              idPrefix={`${baseId}-sire`}
              title={`Hypothetical Sire (${speciesProfile.maleLabel})`}
              accentTone="sire"
              speciesProfile={speciesProfile}
              spec={spec}
              varietyPresets={varietyPresets}
              herdPool={males}
              genotypeRaw={sireRaw}
              sex="Male"
              onChangeGenotype={setSireRaw}
              evaluation={sireEval}
              compactGrid
            />
            <SandboxGenotypeEditor
              idPrefix={`${baseId}-dam`}
              title={`Hypothetical Dam (${speciesProfile.femaleLabel})`}
              accentTone="dam"
              speciesProfile={speciesProfile}
              spec={spec}
              varietyPresets={varietyPresets}
              herdPool={females}
              genotypeRaw={damRaw}
              sex="Female"
              onChangeGenotype={setDamRaw}
              evaluation={damEval}
              compactGrid
            />
          </div>

          {/* What-If Pairing Cross Output */}
          {crossSimulation && (
            <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--barn-ink)]">
                  What-If {crossSimulation.speciesName} Offspring Projections
                </h3>
                {crossSimulation.hasUnknownAlleles && (
                  <span className="text-[11px] text-[var(--barn-terracotta)] font-medium">
                    Contains unverified &lsquo;_&rsquo; allele slots
                  </span>
                )}
              </div>

              {crossSimulation.lethalOrHealthAlerts.length > 0 && (
                <div className="space-y-2 text-xs">
                  {crossSimulation.lethalOrHealthAlerts.map((alert, idx) => (
                    <div
                      key={`${alert.title}-${idx}`}
                      className={`p-3 rounded-xl border ${
                        alert.severity === 'danger'
                          ? 'bg-[var(--barn-danger)]/10 border-[var(--barn-danger)]'
                          : alert.severity === 'warning'
                          ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)]'
                          : 'bg-[var(--barn-surface)] border-[var(--barn-border)]'
                      }`}
                    >
                      <div className="font-semibold text-[var(--barn-ink)]">{alert.title}</div>
                      <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">{alert.detail}</p>
                    </div>
                  ))}
                </div>
              )}

              {crossSimulation.uncertainLociNotes.length > 0 && (
                <div className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)]/55 border border-[var(--barn-terracotta)]/60 space-y-1 text-xs">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    Provisional &lsquo;_&rsquo; Loci Uncertainty ({crossSimulation.uncertainLociNotes.length})
                  </div>
                  <ul className="space-y-0.5 text-[11px] text-[var(--barn-muted)] list-disc pl-4">
                    {crossSimulation.uncertainLociNotes.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}

              {crossSimulation.locusBreakdowns.length === 0 ? (
                <p className="text-xs text-[var(--barn-muted)]">
                  Enter at least one shared locus on both the hypothetical Sire and Dam above to
                  compute Punnett percentages.
                </p>
              ) : (
                <>
                  {crossSimulation.predictedPhenotypes.length > 0 && (
                    <div className="space-y-1.5 text-xs">
                      {crossSimulation.predictedPhenotypes.map((ph, idx) => (
                        <div
                          key={`${ph.sexGroup || 'all'}-${ph.label}-${idx}`}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]"
                        >
                          <div className="min-w-0">
                            {ph.sexGroup && (
                              <span className="font-mono text-[11px] text-[var(--barn-slate)] mr-1.5">
                                [{ph.sexGroup}]
                              </span>
                            )}
                            <span className="font-medium text-[var(--barn-ink)]">{ph.label}</span>
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
                    {crossSimulation.locusBreakdowns.map((lb) => (
                      <div
                        key={lb.locus}
                        className="p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-1.5"
                      >
                        <div className="font-semibold text-[var(--barn-ink)]">
                          {lb.locusName}{' '}
                          <span className="font-mono text-[var(--barn-muted)]">
                            ({lb.sirePair} × {lb.damPair})
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
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
```

## `src/components/ColorGeneticsNotice.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Compact inline notice displayed wherever color genetics / genotype readouts or inputs appear.
 */

import { AlertTriangle } from 'lucide-react';

interface ColorGeneticsNoticeProps {
  compact?: boolean;
  className?: string;
}

export function ColorGeneticsNotice({
  compact = false,
  className = '',
}: ColorGeneticsNoticeProps) {
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
        <span>Color genetics is under development (incomplete).</span>
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
        <strong>Notice:</strong> Color genetics &amp; genotype calculation is under development and
        incomplete.
      </span>
    </div>
  );
}
```

## `src/components/ColoredGenotypeDisplay.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Reusable Color-Coded Allele Provenance Renderer & Legend.
 *
 * Visually distinguishes each allele's provenance using theme-aware tokens:
 * - Sire-inherited: Slate (`--barn-slate`)
 * - Dam-inherited: Terracotta (`--barn-terracotta`)
 * - Inferred from offspring: Sage (`--barn-sage`, dotted underline)
 * - Manually entered: Ink (`--barn-ink`)
 * - Unverified slot (`_`): Muted (`--barn-muted`)
 */

import React from 'react';
import {
  AlleleProvenanceSource,
  AnimalAlleleProvenanceResult,
  AnnotatedAllele,
} from '../core/geneticsEngine';

const SOURCE_CLASS_MAP: Record<AlleleProvenanceSource, string> = {
  sire: 'text-[var(--barn-slate)] font-semibold',
  dam: 'text-[var(--barn-terracotta)] font-semibold',
  offspring:
    'text-[var(--barn-sage)] font-semibold underline decoration-dotted underline-offset-2',
  manual: 'text-[var(--barn-ink)]',
  unknown: 'text-[var(--barn-muted)]',
};

const SOURCE_SHORT_LABEL: Record<AlleleProvenanceSource, string> = {
  sire: 'From Sire',
  dam: 'From Dam',
  offspring: 'Inferred from Offspring',
  manual: 'Manually Entered',
  unknown: 'Unverified (_)',
};

export interface AlleleProvenanceLegendProps {
  compact?: boolean;
  className?: string;
}

export function AlleleProvenanceLegend({
  compact = false,
  className = '',
}: AlleleProvenanceLegendProps) {
  return (
    <div
      aria-label="Allele provenance color key"
      className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 ${
        compact ? 'text-[10px]' : 'text-[11px]'
      } text-[var(--barn-muted)] ${className}`.trim()}
    >
      <span className="font-medium text-[var(--barn-muted)]">Alleles:</span>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className="w-2 h-2 rounded-full bg-[var(--barn-slate)] shrink-0"
        />
        <span className="text-[var(--barn-slate)] font-semibold">Sire</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className="w-2 h-2 rounded-full bg-[var(--barn-terracotta)] shrink-0"
        />
        <span className="text-[var(--barn-terracotta)] font-semibold">Dam</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className="w-2 h-2 rounded-full bg-[var(--barn-sage)] shrink-0"
        />
        <span className="text-[var(--barn-sage)] font-semibold underline decoration-dotted underline-offset-2">
          Offspring
        </span>
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className="w-2 h-2 rounded-full bg-[var(--barn-ink)] shrink-0"
        />
        <span className="text-[var(--barn-ink)] font-medium">Manual</span>
      </span>
    </div>
  );
}

export interface ColoredGenotypeDisplayProps {
  provenance: AnimalAlleleProvenanceResult | null | undefined;
  fallbackText?: string;
  compact?: boolean;
  showLegend?: boolean;
  className?: string;
}

function renderAlleleSpan(
  allele: AnnotatedAllele,
  locus: string,
  locusName: string,
  slotKey: string
) {
  const baseClass = SOURCE_CLASS_MAP[allele.source];
  const uncommittedClass = allele.isInferredUncommitted ? ' italic' : '';
  const tooltip = `${locusName} (${locus}): ${allele.allele} — ${allele.detail}${
    allele.isInferredUncommitted ? ' (uncommitted inference)' : ''
  }`;
  return (
    <span
      key={slotKey}
      title={tooltip}
      data-provenance={allele.source}
      className={`${baseClass}${uncommittedClass}`}
    >
      {allele.allele}
    </span>
  );
}

export function ColoredGenotypeDisplay({
  provenance,
  fallbackText = '',
  compact = false,
  showLegend = false,
  className = '',
}: ColoredGenotypeDisplayProps) {
  if (!provenance || provenance.isCustomSpeciesFallback || provenance.loci.length === 0) {
    const text = provenance?.rawFallback || fallbackText;
    if (!text) return null;
    return <span className={`font-mono ${className}`.trim()}>{text}</span>;
  }

  const ariaSummary = provenance.loci
    .map(
      (pair) =>
        `${pair.locus}: ${pair.allele1.allele} (${SOURCE_SHORT_LABEL[pair.allele1.source]}), ${
          pair.allele2.allele
        } (${SOURCE_SHORT_LABEL[pair.allele2.source]})`
    )
    .join('; ');

  const content = (
    <span
      aria-label={`Genotype with allele provenance: ${ariaSummary}`}
      className={`font-mono ${compact ? '' : 'tracking-tight'} ${className}`.trim()}
    >
      {provenance.loci.map((pair, idx) => (
        <React.Fragment key={`${pair.locus}-${idx}`}>
          {idx > 0 && ' '}
          <span className="inline-block">
            {renderAlleleSpan(pair.allele1, pair.locus, pair.locusName, `${pair.locus}-1`)}
            {renderAlleleSpan(pair.allele2, pair.locus, pair.locusName, `${pair.locus}-2`)}
          </span>
        </React.Fragment>
      ))}
    </span>
  );

  if (!showLegend) {
    return content;
  }

  return (
    <div className="space-y-1.5 min-w-0">
      <div className="break-words">{content}</div>
      <AlleleProvenanceLegend compact={compact} />
    </div>
  );
}
```

## `src/components/CrashErrorBoundary.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * React Top-Level Crash Error Boundary & Emergency Recovery / Support Export UI.
 *
 * If an unexpected render crash happens, records full diagnostics & component stack
 * synchronously, reassures the user their offline herd database is safe, and allows
 * direct recovery, reloading, or exporting logs + a copy of their data to support.
 */

import {
  AlertTriangle,
  Archive,
  Download,
  Mail,
  RefreshCw,
  RotateCcw,
  Share2,
} from 'lucide-react';
import React from 'react';
import { BarnDatabaseSnapshot } from '../core/models';
import {
  buildSupportMailtoHref,
  formatSupportReportText,
} from '../core/supportBundle';
import { formatTimestampedBackupSlug } from '../core/syncAndExports';
import {
  DiagnosticSummary,
  getDiagnosticSummary,
  isMemoryLikeError,
  listDiagnosticLogs,
  markCleanSessionExit,
  recordReactCrash,
} from '../storage/crashLogger';
import { buildSupportBundleZipOffThread } from '../storage/offThreadWorkerClient';
import {
  listRollingSnapshotBackups,
  loadRollingSnapshotBackup,
} from '../storage/storageProtection';
import { purgeStaleBrowserCaches, WebSqliteAdapter } from '../storage/webSqliteAdapter';
import {
  downloadTextFile,
  shareBinaryFileOrDownload,
} from '../utils/webFileActions';

interface CrashErrorBoundaryProps {
  children: React.ReactNode;
}

interface CrashErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
  showDetails: boolean;
  busy: boolean;
  includeData: boolean;
  includePhotos: boolean;
  recipientEmail: string;
  feedback: string | null;
  lastBuiltMailMeta: {
    filename: string;
    summary: DiagnosticSummary;
    includedData: boolean;
    includedPhotos: boolean;
  } | null;
}

async function loadBestAvailableSnapshotForSupport(
  includePhotos: boolean
): Promise<BarnDatabaseSnapshot | null> {
  try {
    const adapter = new WebSqliteAdapter();
    const initPromise = adapter.initialize({ lightweightPhotos: !includePhotos });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Support snapshot adapter init timeout')), 8000)
    );
    return await Promise.race([initPromise, timeoutPromise]);
  } catch {
    try {
      const rolling = await listRollingSnapshotBackups();
      if (rolling.length > 0) {
        return await loadRollingSnapshotBackup(rolling[0].key);
      }
    } catch {
      // Ignore fallback error
    }
    return null;
  }
}

export class CrashErrorBoundary extends React.Component<
  CrashErrorBoundaryProps,
  CrashErrorBoundaryState
> {
  constructor(props: CrashErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      componentStack: '',
      showDetails: false,
      busy: false,
      includeData: true,
      includePhotos: true,
      recipientEmail: '',
      feedback: null,
      lastBuiltMailMeta: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<CrashErrorBoundaryState> {
    const memoryFault = isMemoryLikeError(error);
    return {
      hasError: true,
      error,
      includePhotos: !memoryFault,
      feedback: null,
      lastBuiltMailMeta: null,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const compStack = info.componentStack || '';
    recordReactCrash(error, compStack);
    if (typeof window !== 'undefined') {
      window.__PEDIGREE_RECORD_BOOT_CRASH__?.();
    }
    this.setState({ componentStack: compStack });
  }

  private handleDownloadLogsTxt = async () => {
    this.setState({ busy: true, feedback: null });
    try {
      const entries = await listDiagnosticLogs();
      const summary = await getDiagnosticSummary(entries);
      const snapshot = await loadBestAvailableSnapshotForSupport(false);
      const report = formatSupportReportText(entries, summary, snapshot);
      const filename = `pedigree-crash-logs-${formatTimestampedBackupSlug()}.txt`;
      await downloadTextFile(filename, report, 'text/plain');
      this.setState({
        busy: false,
        feedback: `Downloaded ${filename} (${entries.length} log entries + current app state).`,
      });
    } catch (err) {
      this.setState({
        busy: false,
        feedback: err instanceof Error ? err.message : 'Could not export text logs.',
      });
    }
  };

  private handleExportOrSendBundle = async (sendViaShare: boolean) => {
    this.setState({ busy: true, feedback: null, lastBuiltMailMeta: null });
    try {
      const entries = await listDiagnosticLogs();
      const summary = await getDiagnosticSummary(entries);
      const snapshot = this.state.includeData
        ? await loadBestAvailableSnapshotForSupport(this.state.includePhotos)
        : null;

      const built = await buildSupportBundleZipOffThread({
        entries,
        summary,
        snapshot,
        includeData: this.state.includeData,
        includePhotos: this.state.includePhotos,
      });

      const recipient = this.state.recipientEmail.trim();
      const lastBuiltMailMeta = {
        filename: built.filename,
        summary,
        includedData: built.includedData,
        includedPhotos: built.includedPhotos,
      };

      if (sendViaShare) {
        const mode = await shareBinaryFileOrDownload({
          filename: built.filename,
          bytes: built.bytes,
          mimeType: 'application/zip',
          title: 'Community Pedigree Bug Report Bundle',
          text: `${
            recipient ? `Bug report logs & data bundle for ${recipient}` : 'Bug report logs & data bundle'
          }`,
        });
        this.setState({
          busy: false,
          lastBuiltMailMeta,
          feedback:
            mode === 'cancelled'
              ? 'Share sheet cancelled — no file was saved.'
              : mode === 'shared'
                ? `Opened share sheet with ${built.filename}.${recipient ? ` You can send the bug report directly to ${recipient}.` : ''}`
                : `Saved ${built.filename}. Tap "Open Email Draft" below and attach the downloaded .ZIP${recipient ? ` to send to ${recipient}` : ''}.`,
        });
      } else {
        const mode = await shareBinaryFileOrDownload({
          filename: built.filename,
          bytes: built.bytes,
          mimeType: 'application/zip',
          title: 'Community Pedigree Bug Report Bundle',
        });
        this.setState({
          busy: false,
          lastBuiltMailMeta,
          feedback:
            mode === 'cancelled'
              ? 'Share sheet cancelled — no file was saved.'
              : `Exported ${built.filename} (${built.logCount} logs${
                  built.includedData ? `, ${built.animalCount} animals` : ''
                }).`,
        });
      }
    } catch (err) {
      this.setState({
        busy: false,
        feedback: err instanceof Error ? err.message : 'Could not package bug report bundle.',
      });
    }
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, componentStack, showDetails, busy, includeData, includePhotos, recipientEmail, feedback, lastBuiltMailMeta } =
      this.state;
    const mailtoHref = lastBuiltMailMeta
      ? buildSupportMailtoHref({
          recipientEmail,
          ...lastBuiltMailMeta,
        })
      : null;
    const memoryFault = error ? isMemoryLikeError(error) : false;

    return (
      <main className="min-h-screen bg-[var(--barn-canvas,#f2e9da)] text-[var(--barn-ink,#241e18)] flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-xl w-full bg-[var(--barn-surface,#faf5eb)] border border-[var(--barn-border,#cfc0a8)] rounded-2xl p-6 space-y-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--barn-terracotta-tint,#f5e1d5)] border border-[var(--barn-terracotta,#a84b28)] flex items-center justify-center shrink-0">
              <AlertTriangle
                className="w-5 h-5 text-[var(--barn-terracotta,#a84b28)]"
                aria-hidden="true"
              />
            </div>
            <div className="space-y-1 min-w-0">
              <h1 className="font-display text-xl font-semibold">
                Something interrupted this screen
              </h1>
              <p className="text-xs text-[var(--barn-muted,#63584a)]">
                The error was logged locally with device &amp; memory diagnostics. Your saved offline
                herd database and photos remain safe in browser storage.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--barn-canvas,#f2e9da)] border border-[var(--barn-border,#cfc0a8)] space-y-2 text-xs">
            <div className="font-mono font-semibold text-[var(--barn-danger,#b5382b)] break-words">
              {error ? `${error.name}: ${error.message}` : 'Unexpected application error'}
            </div>
            {memoryFault && (
              <p className="text-[11px] text-[var(--barn-muted,#63584a)]">
                Memory pressure detected — photo inclusion defaults to unchecked below so the
                diagnostic export stays lightweight.
              </p>
            )}
            <button
              type="button"
              aria-expanded={showDetails}
              aria-controls="crash-technical-details"
              onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
              className="min-h-[44px] sm:min-h-[28px] py-1 underline text-[11px] text-[var(--barn-muted,#63584a)] inline-flex items-center"
            >
              {showDetails ? 'Hide technical details' : 'Show stack trace & component details'}
            </button>
            {showDetails && (
              <pre
                id="crash-technical-details"
                className="mt-2 p-2.5 rounded-lg bg-black/5 text-[10px] font-mono overflow-x-auto max-h-44 whitespace-pre-wrap break-words"
              >
                {[error?.stack, componentStack].filter(Boolean).join('\n\n')}
              </pre>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                this.setState({
                  hasError: false,
                  error: null,
                  componentStack: '',
                  feedback: null,
                })
              }
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--barn-sage,#2d5e3f)] text-[var(--barn-on-sage,#fff8f0)] text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Try Recovering Screen
            </button>
            <button
              type="button"
              onClick={() => {
                markCleanSessionExit();
                window.location.reload();
              }}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-[var(--barn-border,#cfc0a8)] text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Reload App
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                this.setState({ busy: true });
                try {
                  await purgeStaleBrowserCaches();
                } finally {
                  markCleanSessionExit();
                  window.location.href = `${window.location.pathname}?emergency_reset=true`;
                }
              }}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border,#cfc0a8)] text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              Purge Caches &amp; Safe Reset
            </button>
          </div>

          <div className="border-t border-[var(--barn-border,#cfc0a8)] pt-4 space-y-3">
            <div className="text-xs font-semibold">
              Export Crash Logs &amp; Send Bug Report
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
              <label htmlFor="crash-recipient-email" className="text-[var(--barn-muted,#63584a)] shrink-0">
                Recipient Email:
              </label>
              <input
                id="crash-recipient-email"
                name="crash-recipient-manual"
                type="email"
                inputMode="email"
                autoComplete="off"
                spellCheck={false}
                value={recipientEmail}
                onChange={(e) => {
                  this.setState({ recipientEmail: e.target.value });
                }}
                placeholder="Type recipient email address"
                className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas,#f2e9da)] border border-[var(--barn-border,#cfc0a8)] font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeData}
                  onChange={(e) => this.setState({ includeData: e.target.checked })}
                />
                <span>Include a copy of my offline herd &amp; breeding data</span>
              </label>
              {includeData && (
                <label className="flex items-center gap-2 cursor-pointer pl-5 text-[var(--barn-muted,#63584a)]">
                  <input
                    type="checkbox"
                    checked={includePhotos}
                    onChange={(e) => this.setState({ includePhotos: e.target.checked })}
                  />
                  <span>Include animal photos (uncheck for smaller email attachment)</span>
                </label>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void this.handleExportOrSendBundle(true)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--barn-sage,#2d5e3f)] text-[var(--barn-on-sage,#fff8f0)] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                {includeData ? 'Send Bug Report + Data (.ZIP)' : 'Send Bug Report (.ZIP)'}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => void this.handleExportOrSendBundle(false)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border,#cfc0a8)] text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                Download .ZIP
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => void this.handleDownloadLogsTxt()}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border,#cfc0a8)] text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Logs Only (.TXT)
              </button>
            </div>

            {feedback && (
              <div
                role="status"
                aria-live="polite"
                className="p-2.5 rounded-xl bg-[var(--barn-sage-tint,#dcebd9)] border border-[var(--barn-sage,#2d5e3f)] text-xs space-y-2"
              >
                <div>{feedback}</div>
                {mailtoHref && (
                  <a
                    href={mailtoHref}
                    className="inline-flex items-center gap-1.5 font-semibold underline text-[var(--barn-sage,#2d5e3f)]"
                  >
                    <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                    {recipientEmail.trim()
                      ? `Open Email Draft to ${recipientEmail.trim()}`
                      : 'Open Email Draft'}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }
}
```

## `src/components/DeviceCapabilityCard.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Device Capability Detection & Memory Handling Banner/Section (`DeviceCapabilityCard`).
 *
 * Placement & Persistence Rules:
 * - Tier 1 (Critical Memory Limit): Locked visible in BOTH Home onboarding and Settings (not closable).
 * - Tier 2 (Survival Mode): Closable on Home screen; persistent (not closable) in Settings.
 * - Tiers 3–5 (Mid-Tier & Better): Closable in both locations and reopenable anytime from Settings.
 */

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Monitor,
  ShieldAlert,
  SlidersHorizontal,
  Smartphone,
  Tablet,
  X,
} from 'lucide-react';
import { useId, useState } from 'react';
import {
  buildLowMemorySettingsPatch,
  DEVICE_CAPABILITY_TIER_LIST,
  evaluateBarnWorkloadForTier,
  getTierStoragePolicy,
} from '../core/deviceCapability';
import { BarnSettings } from '../core/models';
import { DeviceCapabilityController } from '../storage/deviceCapabilityDetector';

interface DeviceCapabilityCardProps {
  location: 'home' | 'settings';
  controller: DeviceCapabilityController;
  settings: BarnSettings;
  totalBarnRecords: number;
  isOnboardingActive?: boolean;
  onApplyLowMemorySettings?: (patch: Partial<BarnSettings>) => void;
  onOpenSettings?: () => void;
}

export function DeviceCapabilityCard({
  location,
  controller,
  settings,
  totalBarnRecords,
  isOnboardingActive = false,
  onApplyLowMemorySettings,
  onOpenSettings,
}: DeviceCapabilityCardProps) {
  const [showTierMatrix, setShowTierMatrix] = useState(false);
  const tierMatrixId = useId();

  const { assessment, browserCompatibility } = controller;
  const { definition, tier, formFactor, signalSummary, confidence } = assessment;

  const isVisible = location === 'home' ? controller.homeVisible : controller.settingsVisible;
  const canCloseHere =
    location === 'home' ? controller.canCloseOnHome : controller.canCloseInSettings;

  // On Home: if dismissed (Tiers 2–5), render nothing. (Tier 1 can never be dismissed.)
  if (location === 'home' && !isVisible) {
    return null;
  }

  // On Settings: if closed on Tiers 3–5, render a compact reopen strip so it can be reopened anytime.
  if (location === 'settings' && !isVisible) {
    return (
      <section
        aria-label="Device Capability Profile"
        className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Cpu className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <span className="font-semibold text-[var(--barn-ink)]">
              Device Capability: {definition.shortLabel}
            </span>
            <span className="text-[var(--barn-muted)] ml-2 hidden sm:inline">
              {definition.title} ({signalSummary})
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={controller.reopenInSettings}
          className="min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold text-[var(--barn-ink)] whitespace-nowrap"
        >
          Reopen Device Capability Details
        </button>
      </section>
    );
  }

  const workload = evaluateBarnWorkloadForTier(totalBarnRecords, assessment);
  const lowMemPatch = buildLowMemorySettingsPatch(settings, assessment);
  const tierPolicy = getTierStoragePolicy(tier);

  const cardSurfaceClass =
    definition.severity === 'danger'
      ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-danger)]'
      : definition.severity === 'warn'
        ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)]'
        : definition.severity === 'good'
          ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)]'
          : 'bg-[var(--barn-surface)] border-[var(--barn-border)]';

  const DeviceIcon =
    formFactor === 'desktop' ? Monitor : formFactor === 'tablet' ? Tablet : Smartphone;

  const StatusIcon =
    definition.severity === 'danger'
      ? ShieldAlert
      : definition.severity === 'warn'
        ? AlertTriangle
        : definition.severity === 'good'
          ? CheckCircle2
          : Cpu;

  const iconColorClass =
    definition.severity === 'danger'
      ? 'text-[var(--barn-danger)]'
      : definition.severity === 'warn'
        ? 'text-[var(--barn-terracotta)]'
        : 'text-[var(--barn-sage)]';

  return (
    <section
      aria-label="Device Capability & Memory Profile"
      className={`border rounded-2xl p-4 sm:p-5 space-y-3 text-xs ${cardSurfaceClass}`}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <StatusIcon className={`w-5 h-5 mt-0.5 shrink-0 ${iconColorClass}`} aria-hidden="true" />
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[var(--barn-ink)]">
                {definition.badgeLabel}
              </span>
              {isOnboardingActive && location === 'home' && (
                <span className="text-[11px] font-medium text-[var(--barn-muted)]">
                  Device Setup Check
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[var(--barn-muted)]">
                <DeviceIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {signalSummary}
                {confidence === 'estimated' ? ' (estimated)' : ''}
              </span>
            </div>

            <h2 className="font-display text-base sm:text-lg font-semibold text-[var(--barn-ink)]">
              {definition.title}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canCloseHere ? (
            <button
              type="button"
              onClick={location === 'home' ? controller.dismissOnHome : controller.dismissInSettings}
              aria-label="Close device capability notice"
              title={
                location === 'home'
                  ? 'Close notice on Home (reopen anytime in Settings)'
                  : 'Close notice (reopen anytime in Settings)'
              }
              className="min-h-[44px] sm:min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium text-[var(--barn-ink)] inline-flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              Close
            </button>
          ) : (
            <span className="text-[10px] font-mono font-medium px-2 py-1 rounded-lg bg-[var(--barn-surface)]/80 border border-[var(--barn-border)] text-[var(--barn-muted)] whitespace-nowrap">
              {tier === 1 ? 'Required Notice' : 'Persistent in Settings'}
            </span>
          )}
        </div>
      </div>

      {/* Main Cleaned Caution / Capability Message */}
      <p className="text-xs leading-relaxed text-[var(--barn-ink)]">{definition.cautionNotice}</p>

      {/* Practical Browser & Pedigree Capacity Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        <div className="p-3 rounded-xl bg-[var(--barn-surface)]/85 border border-[var(--barn-border)] space-y-1">
          <div className="text-[11px] font-semibold text-[var(--barn-ink)]">
            Pedigree &amp; Archive Headroom
          </div>
          <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed">
            {definition.workloadProfile}
          </p>
          <p className="text-[10px] font-mono text-[var(--barn-muted)]">
            Vault caps: {tierPolicy.monthlyCap} monthly · {tierPolicy.manualCap} manual ·{' '}
            {tierPolicy.rollingIdbCap} rolling IDB
            {tierPolicy.dehydrateMirrorPhotos ? ' · thumbnail-light mirror' : ''}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-[var(--barn-surface)]/85 border border-[var(--barn-border)] space-y-1">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="font-semibold text-[var(--barn-ink)]">Your Current Local Barn</span>
            <span className="font-mono tabular-nums text-[var(--barn-muted)]">
              {workload.totalRecords.toLocaleString()}
              {workload.maxRecommendedRecords
                ? ` / ~${workload.maxRecommendedRecords.toLocaleString()} rec. max`
                : ' records'}
            </span>
          </div>
          <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed">
            {workload.guidance || definition.browserReality}
          </p>
        </div>
      </div>

      {/* Older Browser / Fallback Compatibility Summary */}
      {(browserCompatibility.isOutdatedBrowser ||
        browserCompatibility.wasmFallbackActive ||
        (location === 'settings' && browserCompatibility.unavailableFeatures.length > 0)) && (
        <div className="p-3 rounded-xl bg-[var(--barn-surface)]/90 border border-[var(--barn-border)] space-y-1.5 text-[11px]">
          <div className="font-semibold text-[var(--barn-ink)] flex flex-wrap items-center gap-2">
            <span>
              {browserCompatibility.isOutdatedBrowser
                ? 'Older Browser Compatibility Mode Active'
                : 'Browser Feature Fallbacks Active'}
            </span>
            {browserCompatibility.wasmFallbackActive && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[var(--barn-ink)]">
                IndexedDB JSON Mode (No WASM)
              </span>
            )}
          </div>
          {browserCompatibility.outdatedReasons.length > 0 && (
            <p className="text-[var(--barn-muted)] leading-snug">
              {browserCompatibility.outdatedReasons.join(' · ')}. Heavy .ZIP exports show a memory
              caution prompt and recommend Timestamped Backup (.JSON) if they fail.
            </p>
          )}
          {location === 'settings' && browserCompatibility.unavailableFeatures.length > 0 && (
            <ul className="space-y-1 pt-0.5 text-[var(--barn-muted)]">
              {browserCompatibility.unavailableFeatures.slice(0, 5).map((feat) => (
                <li key={feat.key} className="leading-snug">
                  <strong className="text-[var(--barn-ink)]">{feat.label}:</strong> {feat.reason}{' '}
                  <span>{feat.fallback}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Adaptive Memory Handling Controls + Tier Comparison Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="flex flex-wrap items-center gap-2">
          {assessment.shouldApplyLowMemoryHandling && lowMemPatch && onApplyLowMemorySettings && (
            <button
              type="button"
              onClick={() => onApplyLowMemorySettings(lowMemPatch)}
              className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              Apply Recommended Low-Memory Settings
            </button>
          )}

          {assessment.shouldApplyLowMemoryHandling && !lowMemPatch && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/60 text-[11px] font-semibold text-[var(--barn-ink)]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              Low-memory protection active (Compact photos · 3-Gen default)
            </span>
          )}

          {location === 'home' && onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium whitespace-nowrap"
            >
              Image &amp; Backup Settings
            </button>
          )}

          {location === 'settings' && controller.canCloseOnHome && controller.homeDismissed && (
            <button
              type="button"
              onClick={controller.reopenOnHome}
              className="min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium whitespace-nowrap"
            >
              Show Notice on Home Screen Again
            </button>
          )}
        </div>

        <button
          type="button"
          aria-expanded={showTierMatrix}
          aria-controls={tierMatrixId}
          onClick={() => setShowTierMatrix((prev) => !prev)}
          className="min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap"
        >
          {showTierMatrix ? 'Hide All 5 Tiers' : 'See All 5 Tiers'}
          {showTierMatrix ? (
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Expandable 5-Tier Reference Matrix */}
      {showTierMatrix && (
        <div id={tierMatrixId} className="pt-2 border-t border-[var(--barn-border)] space-y-2">
          <div className="text-[11px] font-semibold text-[var(--barn-ink)]">
            Device Capability Tiers (Phones, Tablets &amp; Desktops)
          </div>
          <div className="grid grid-cols-1 gap-2">
            {DEVICE_CAPABILITY_TIER_LIST.map((item) => {
              const isCurrent = item.tier === tier;
              return (
                <div
                  key={item.tier}
                  className={`p-2.5 rounded-xl border text-[11px] space-y-1 ${
                    isCurrent
                      ? 'bg-[var(--barn-surface)] border-[var(--barn-sage)] ring-1 ring-[var(--barn-sage)]'
                      : 'bg-[var(--barn-surface)]/75 border-[var(--barn-border)]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--barn-ink)]">
                      Tier {item.tier}: {item.title}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {isCurrent && (
                        <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--barn-sage)] text-[var(--barn-on-sage)]">
                          This Device
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-[var(--barn-muted)]">
                        {item.maxRecommendedRecords
                          ? `≤~${item.maxRecommendedRecords.toLocaleString()} rec.`
                          : 'Commercial scale'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[var(--barn-muted)] leading-snug">
                    <strong className="text-[var(--barn-ink)]">Specs:</strong>{' '}
                    {item.targetHardware}
                  </p>
                  <p className="text-[var(--barn-muted)] leading-snug">
                    <strong className="text-[var(--barn-ink)]">Capacity:</strong>{' '}
                    {item.workloadProfile}
                  </p>
                  <p className="text-[10px] font-mono text-[var(--barn-muted)] leading-snug">
                    {(() => {
                      const p = getTierStoragePolicy(item.tier);
                      return `Vault caps: ${p.monthlyCap} monthly · ${p.manualCap} manual · ${p.rollingIdbCap} rolling IDB${p.dehydrateMirrorPhotos ? ' · thumbnail-light mirror' : ''}`;
                    })()}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
```

## `src/components/DiagnosticsAndSupportPanel.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Crash Handling, Verbose Error & Memory Diagnostics Panel, and Support Bundle Exporter.
 *
 * Features:
 * - Toggle verbose logging & choose rolling log retention window (3 / 7 / 14 days)
 * - Live JS Heap memory usage, storage quota, and error/memory-warning counters
 * - Filterable in-app log inspector (All, Errors & Crashes, Memory)
 * - 1-click export of Error Logs Only (.TXT / .JSON) or Full Support Bundle (.ZIP with
 *   diagnostics + optional copy of barn data and photos)
 * - Mobile native Share Sheet OR Download + pre-filled mailto compose to support
 */

import {
  Activity,
  Archive,
  Bug,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  HardDrive,
  Image as ImageIcon,
  Mail,
  RefreshCw,
  RotateCcw,
  Share2,
  ShieldAlert,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BarnHealthRepairResult,
  BarnHealthReport,
} from '../core/dataHealthCheck';
import {
  formatByteSizePure,
  ImageOptimizationPresetId,
} from '../core/imageOptimizationSpec';
import type { PhotoStorageFootprintReport } from '../core/photoMaintenance';
import {
  buildImprovementsRecoveryJson,
  formatImprovementsMarkdown,
  IMPROVEMENT_CATEGORY_LABELS,
  IMPROVEMENTS_REGISTRY,
} from '../core/improvementRegistry';
import { BarnDatabaseSnapshot } from '../core/models';
import {
  buildErrorLogsJson,
  buildSupportMailtoHref,
  formatSupportReportText,
} from '../core/supportBundle';
import { buildSupportBundleZipOffThread } from '../storage/offThreadWorkerClient';
import { formatTimestampedBackupSlug } from '../core/syncAndExports';
import {
  clearAllDiagnosticLogs,
  DiagnosticLogEntry,
  DiagnosticSummary,
  getDiagnosticConfig,
  getDiagnosticSummary,
  listDiagnosticLogs,
  logDiagnosticEvent,
  LogRetentionDays,
  readEmergencySessionTrace,
  subscribeDiagnosticLogs,
  updateDiagnosticConfig,
} from '../storage/crashLogger';
import { getHeavyZipExportGate } from '../core/deviceCapability';
import {
  DESTRUCTIVE_CONFIRM_PHRASES,
  isDestructiveActionConfirmationValid,
  validateLogRetentionDaysOverride,
  validateSupportRecipientEmail,
} from '../core/techyStuffGuardrails';
import { pedigreeBridge } from '../native/pedigreeBridge';
import {
  checkStorageStatus,
  DiagnosticQuotaPreflightResult,
  isQuotaExceededError,
  StorageProtectionStatus,
  verifyStorageQuotaForDiagnosticAction,
} from '../storage/storageProtection';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import {
  copyTextWithFallback,
  downloadBinaryFile,
  downloadTextFile,
  shareBinaryFileOrDownload,
} from '../utils/webFileActions';
import type { DeviceCapabilityController } from '../storage/deviceCapabilityDetector';

interface DiagnosticsAndSupportPanelProps {
  snapshot: BarnDatabaseSnapshot;
  deviceCapability?: DeviceCapabilityController;
  storageStatus?: StorageProtectionStatus | null;
  onRefreshStorageStatus?: () => Promise<unknown> | void;
  onScanDatabaseHealth: () => BarnHealthReport | null;
  onRepairDatabaseHealth: () => Promise<BarnHealthRepairResult | null>;
  onResetDatabaseConnection: () => Promise<void>;
  onPurgeCorruptedCaches: (options: {
    downloadBackupFirst: boolean;
    rebuildLocalDb: boolean;
  }) => Promise<{
    cachesCleared: number;
    serviceWorkersUnregistered: number;
    backupFilename: string | null;
  }>;
  onLocateConflicts?: () => void;
  onHydrateSnapshotForExport?: (
    targetSnapshot?: BarnDatabaseSnapshot,
    filterSpecies?: string
  ) => Promise<BarnDatabaseSnapshot>;
  onAnalyzePhotoFootprint?: (
    presetId?: ImageOptimizationPresetId
  ) => Promise<PhotoStorageFootprintReport | null>;
  onPruneOrphanPhotos?: () => Promise<{ removedCount: number; reclaimedBytes: number }>;
  onReoptimizeOversizedPhotos?: (
    presetId?: ImageOptimizationPresetId
  ) => Promise<{ updatedCount: number; oversizedFound: number; reclaimedBytes: number }>;
  onPruneFullResPhotoPayloads?: () => Promise<{ prunedCount: number; reclaimedBytes: number }>;
}

type LogFilterTab = 'all' | 'errors' | 'memory';

export function DiagnosticsAndSupportPanel({
  snapshot,
  deviceCapability,
  storageStatus: storageStatusProp,
  onRefreshStorageStatus,
  onScanDatabaseHealth,
  onRepairDatabaseHealth,
  onResetDatabaseConnection,
  onPurgeCorruptedCaches,
  onLocateConflicts,
  onHydrateSnapshotForExport,
  onAnalyzePhotoFootprint,
  onPruneOrphanPhotos,
  onReoptimizeOversizedPhotos,
  onPruneFullResPhotoPayloads,
}: DiagnosticsAndSupportPanelProps) {
  const [config, setConfig] = useState(() => getDiagnosticConfig());
  const [entries, setEntries] = useState<DiagnosticLogEntry[]>([]);
  const [summary, setSummary] = useState<DiagnosticSummary | null>(null);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [logFilter, setLogFilter] = useState<LogFilterTab>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const basePanelId = useId();
  const logViewerId = `${basePanelId}-log-viewer`;
  const improvementsLogId = `${basePanelId}-improvements-log`;
  const nativeDiagDescId = `${basePanelId}-native-wrapper-diagnostics-desc`;

  const [includeDataInBundle, setIncludeDataInBundle] = useState(true);
  const [includePhotosInBundle, setIncludePhotosInBundle] = useState(true);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientEmailError, setRecipientEmailError] = useState<string | null>(null);
  const actionLock = useAsyncSubmitLock();
  const busyAction = actionLock.isSubmitting;
  const [emergencyTraceCount, setEmergencyTraceCount] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [quotaWarningGate, setQuotaWarningGate] = useState<{
    preflight: DiagnosticQuotaPreflightResult;
    attemptShare: boolean;
  } | null>(null);
  const [showImprovementsLog, setShowImprovementsLog] = useState(false);
  const [improvementsFeedback, setImprovementsFeedback] = useState<string | null>(null);
  const [lastBuiltMailMeta, setLastBuiltMailMeta] = useState<{
    filename: string;
    summary: DiagnosticSummary;
    includedData: boolean;
    includedPhotos: boolean;
  } | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [manualCopyBox, setManualCopyBox] = useState<{
    target: 'support' | 'improvements';
    label: string;
    text: string;
  } | null>(null);
  const [confirmRebuildDb, setConfirmRebuildDb] = useState(false);
  const [rebuildConfirmPhrase, setRebuildConfirmPhrase] = useState('');
  const [confirmClearLogs, setConfirmClearLogs] = useState(false);
  const [pendingHeavyBundleAttemptShare, setPendingHeavyBundleAttemptShare] = useState<
    boolean | null
  >(null);
  const [recoveryFeedback, setRecoveryFeedback] = useState<string | null>(null);
  const [healthReport, setHealthReport] = useState<BarnHealthReport | null>(null);
  const [healthRepairsList, setHealthRepairsList] = useState<string[] | null>(null);
  const [photoFootprint, setPhotoFootprint] = useState<PhotoStorageFootprintReport | null>(null);
  const [confirmPruneFullRes, setConfirmPruneFullRes] = useState(false);
  const [photoMaintenanceFeedback, setPhotoMaintenanceFeedback] = useState<string | null>(null);
  const [localStorageStatus, setLocalStorageStatus] = useState<StorageProtectionStatus | null>(null);
  const resolvedStorageStatus = storageStatusProp ?? localStorageStatus;

  const heavyBundleGate = deviceCapability
    ? getHeavyZipExportGate(deviceCapability.assessment, deviceCapability.browserCompatibility)
    : { requiresConfirmation: false, title: '', body: '', advice: '' };

  const refreshDiagnostics = useCallback(async () => {
    const list = await listDiagnosticLogs();
    const sum = await getDiagnosticSummary(list);
    setEntries(list);
    setEmergencyTraceCount(readEmergencySessionTrace().length);
    setSummary(sum);
    setConfig(sum.config);
  }, []);

  useEffect(() => {
    if (storageStatusProp !== undefined && storageStatusProp !== null) {
      return;
    }
    let cancelled = false;
    void checkStorageStatus()
      .then((status) => {
        if (!cancelled) {
          setLocalStorageStatus(status);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storageStatusProp]);

  useEffect(() => {
    void refreshDiagnostics();
    const unsub = subscribeDiagnosticLogs(() => {
      void refreshDiagnostics();
    });
    const timer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
        void refreshDiagnostics();
      }
    }, 15_000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [refreshDiagnostics]);

  const errorEntriesCount = useMemo(
    () =>
      entries.filter(
        (e) => e.level === 'error' || e.level === 'fatal' || e.category === 'react'
      ).length,
    [entries]
  );

  const memoryEntriesCount = useMemo(
    () => entries.filter((e) => e.category === 'memory').length,
    [entries]
  );

  const filteredEntries = useMemo(() => {
    if (logFilter === 'errors') {
      return entries.filter(
        (e) => e.level === 'error' || e.level === 'fatal' || e.category === 'react'
      );
    }
    if (logFilter === 'memory') {
      return entries.filter((e) => e.category === 'memory');
    }
    return entries;
  }, [entries, logFilter]);

  const totalPhotoBytes = useMemo(
    () => (snapshot.animalPhotos ?? []).reduce((sum, p) => sum + (p.storedBytes || 0), 0),
    [snapshot.animalPhotos]
  );

  const handleToggleVerbose = (enabled: boolean) => {
    const next = updateDiagnosticConfig({ verboseEnabled: enabled });
    setConfig(next);
    logDiagnosticEvent({
      level: 'info',
      category: 'lifecycle',
      message: `Verbose diagnostic logging ${enabled ? 'enabled' : 'paused (errors/crashes still recorded)'}`,
    });
  };

  const handleRetentionChange = (days: LogRetentionDays) => {
    const validated = validateLogRetentionDaysOverride(days);
    if (!validated.ok) return;
    const next = updateDiagnosticConfig({ retentionDays: validated.days });
    setConfig(next);
    void refreshDiagnostics();
  };

  const handleSupportEmailChange = (email: string) => {
    setRecipientEmail(email);
    const check = validateSupportRecipientEmail(email);
    setRecipientEmailError(check.ok ? null : check.error);
  };

  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const handleDownloadLogsTxt = async () => {
    await actionLock.runLocked(async () => {
      const list = await listDiagnosticLogs();
      const sum = await getDiagnosticSummary(list);
      const filename = `pedigree-error-logs-${formatTimestampedBackupSlug()}.txt`;
      await downloadTextFile(filename, formatSupportReportText(list, sum, snapshot), 'text/plain');
      setLastBuiltMailMeta(null);
      setFeedback(`Downloaded ${filename} (${list.length} log entries + current app state).`);
    });
  };

  const handleDownloadLogsJson = async () => {
    await actionLock.runLocked(async () => {
      const list = await listDiagnosticLogs();
      const sum = await getDiagnosticSummary(list);
      const filename = `pedigree-error-logs-${formatTimestampedBackupSlug()}.json`;
      await downloadTextFile(
        filename,
        buildErrorLogsJson(list, sum, snapshot),
        'application/json'
      );
      setLastBuiltMailMeta(null);
      setFeedback(`Downloaded ${filename} (${list.length} log entries + current app state).`);
    });
  };

  const handleBuildBundle = async (
    attemptShare: boolean,
    skipCaution = false,
    skipQuotaWarning = false
  ) => {
    const emailValidation = validateSupportRecipientEmail(recipientEmail);
    if (!emailValidation.ok) {
      setRecipientEmailError(emailValidation.error);
      setFeedback(emailValidation.error);
      return;
    }
    setRecipientEmailError(null);
    const hasEmbeddedPhotos =
      includeDataInBundle && includePhotosInBundle && (snapshot.animalPhotos ?? []).length > 0;
    if (!skipCaution && hasEmbeddedPhotos && heavyBundleGate.requiresConfirmation) {
      setPendingHeavyBundleAttemptShare(attemptShare);
      return;
    }
    setPendingHeavyBundleAttemptShare(null);
    await actionLock.runLocked(async () => {
      setFeedback(null);
      setLastBuiltMailMeta(null);
      setQuotaWarningGate(null);
      try {
        const estimatedBundleBytes =
          256 * 1024 +
          (includeDataInBundle ? snapshot.animals.length * 1024 : 0) +
          (hasEmbeddedPhotos ? totalPhotoBytes : 0);

        const quotaPreflight = await verifyStorageQuotaForDiagnosticAction({
          operation: 'support_bundle_zip',
          operationLabel: hasEmbeddedPhotos
            ? 'Support Bundle + Photos (.ZIP)'
            : includeDataInBundle
              ? 'Support Bundle + Barn Data (.ZIP)'
              : 'Support Bundle Logs (.ZIP)',
          estimatedRequiredBytes: estimatedBundleBytes,
          requiresOpfsPreferred: true,
        });

        if (!quotaPreflight.allowed) {
          setFeedback(`${quotaPreflight.headline} — ${quotaPreflight.detail}`);
          return;
        }
        if (quotaPreflight.requiresConfirmation && !skipQuotaWarning) {
          setQuotaWarningGate({ preflight: quotaPreflight, attemptShare });
          return;
        }

        const list = await listDiagnosticLogs();
        const sum = await getDiagnosticSummary(list);
        const bundleSnapshot =
          includeDataInBundle && includePhotosInBundle && onHydrateSnapshotForExport
            ? await onHydrateSnapshotForExport(snapshot)
            : snapshot;
        const built = await buildSupportBundleZipOffThread({
          entries: list,
          summary: sum,
          snapshot: bundleSnapshot,
          includeData: includeDataInBundle,
          includePhotos: includePhotosInBundle,
        });

        const recipient = emailValidation.email;
        setLastBuiltMailMeta({
        filename: built.filename,
        summary: sum,
        includedData: built.includedData,
        includedPhotos: built.includedPhotos,
      });

      if (attemptShare) {
        const mode = await shareBinaryFileOrDownload({
          filename: built.filename,
          bytes: built.bytes,
          mimeType: 'application/zip',
          title: 'Community Pedigree Bug Report Bundle',
          text: `${
            recipient ? `Bug report for ${recipient}. ` : ''
          }Includes ${built.logCount} diagnostic logs${
            built.includedData
              ? ` and ${built.animalCount} animal records${
                  built.includedPhotos ? ` (${built.photoCount} photos)` : ' (photos omitted)'
                }`
              : ''
          }.`,
        });

        setFeedback(
          mode === 'cancelled'
            ? 'Share sheet cancelled — no file was saved.'
            : mode === 'shared'
              ? `Opened Share Sheet with ${built.filename} (${formatByteSizePure(
                  built.bytes.byteLength
                )}). Choose your email app to send${recipient ? ` to ${recipient}` : ''}.`
              : `Downloaded ${built.filename} (${formatByteSizePure(
                  built.bytes.byteLength
                )}).${
                  recipient
                    ? ` Tap "Open Email Draft" below and attach the downloaded .ZIP to email ${recipient}.`
                    : ' Type a recipient email above or tap "Open Email Draft" below and attach the downloaded .ZIP.'
                }`
        );
      } else {
        await downloadBinaryFile(built.filename, built.bytes, 'application/zip');
        setFeedback(
          `Downloaded ${built.filename} (${formatByteSizePure(built.bytes.byteLength)} — ${
            built.logCount
          } logs${built.includedData ? `, ${built.animalCount} animals` : ''}).`
        );
      }
    } catch (err) {
      logDiagnosticEvent({
        level: 'error',
        category: isQuotaExceededError(err) ? 'storage' : 'storage',
        message: isQuotaExceededError(err)
          ? 'Browser storage quota exceeded while building bug report archive'
          : 'Failed to create bug report bundle archive',
        error: err,
      });
      setFeedback(
        isQuotaExceededError(err)
          ? 'Browser storage quota exceeded while staging .ZIP bundle. Uncheck photos or use lightweight .TXT / .JSON exports.'
          : err instanceof Error
            ? err.message
            : 'Could not build bug report bundle. Try unchecking photos if memory is low.'
      );
    }
    });
  };

  const handleCopySupportText = async () => {
    const list = await listDiagnosticLogs();
    const sum = await getDiagnosticSummary(list);
    const report = formatSupportReportText(list.slice(0, 60), sum);
    const copyMode = await copyTextWithFallback(report);
    if (copyMode !== 'unsupported') {
      setManualCopyBox(null);
      setCopiedSummary(true);
      if (copiedTimerRef.current !== null) {
        clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = setTimeout(() => {
        copiedTimerRef.current = null;
        setCopiedSummary(false);
      }, 2500);
    } else {
      setManualCopyBox({
        target: 'support',
        label: 'Selectable Support Text Report',
        text: report,
      });
      setFeedback(
        'Clipboard access is blocked here — copy from the text box below or use Download Error Logs (.TXT).'
      );
    }
  };

  const currentHeapPct = summary?.currentMemory.heapPercent;
  const currentHeapUsed = summary?.currentMemory.usedHeapBytes;
  const currentHeapLimit = summary?.currentMemory.heapLimitBytes;
  const mailtoHref = lastBuiltMailMeta
    ? buildSupportMailtoHref({
        recipientEmail,
        ...lastBuiltMailMeta,
      })
    : null;

  return (
    <section
      id="crash-diagnostics"
      className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">
            Diagnostic &amp; Crash Logs · Send Bug Report
          </h2>
          <p className="text-xs text-[var(--barn-muted)] mt-0.5">
            Automatically captures runtime crashes, unhandled promises, and memory pressure for{' '}
            {config.retentionDays} days
          </p>
        </div>
        <Bug className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
      </div>

      {/* Live Metrics & Retention Controls */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
          <div className="text-[11px] text-[var(--barn-muted)]">Stored Logs</div>
          <div className="font-mono font-semibold tabular-nums mt-0.5">{entries.length}</div>
        </div>
        <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
          <div className="text-[11px] text-[var(--barn-muted)]">Errors / Crashes</div>
          <div
            className={`font-mono font-semibold tabular-nums mt-0.5 ${
              errorEntriesCount > 0 ? 'text-[var(--barn-danger)]' : ''
            }`}
          >
            {errorEntriesCount}
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
          <div className="text-[11px] text-[var(--barn-muted)]">Memory Alerts</div>
          <div
            className={`font-mono font-semibold tabular-nums mt-0.5 ${
              (summary?.memoryWarningCount || 0) > 0 ? 'text-[var(--barn-terracotta)]' : ''
            }`}
          >
            {summary?.memoryWarningCount ?? 0}
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
          <div className="text-[11px] text-[var(--barn-muted)]">JS Heap RAM</div>
          <div className="font-mono font-semibold tabular-nums mt-0.5 truncate">
            {currentHeapUsed !== null && currentHeapUsed !== undefined
              ? `${formatByteSizePure(currentHeapUsed)}${
                  currentHeapPct !== null && currentHeapPct !== undefined
                    ? ` (${currentHeapPct}%)`
                    : ''
                }`
              : 'OS Managed'}
          </div>
          {currentHeapLimit !== null && currentHeapLimit !== undefined && (
            <div className="text-[10px] font-mono text-[var(--barn-muted)] truncate">
              Limit: {formatByteSizePure(currentHeapLimit)}
            </div>
          )}
        </div>
      </div>

      {/* Honest Storage Persistence & Native Container Isolation Truth Card */}
      {resolvedStorageStatus && (
        <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-[var(--barn-ink)]">
              Storage Persistence &amp; Container Status
            </span>
            <span className="font-mono text-[11px] text-[var(--barn-muted)]">
              navigator.storage.persisted() = {String(resolvedStorageStatus.persisted)}
            </span>
          </div>

          {resolvedStorageStatus.isNativeWrapper ? (
            <div className="space-y-1 text-[11px] text-[var(--barn-muted)]">
              <p>
                Running inside native wrapper container ({pedigreeBridge.getPlatform()}). Browser{' '}
                <span className="font-mono">navigator.storage.persisted()</span> honestly reports{' '}
                <span className="font-mono">{String(resolvedStorageStatus.persisted)}</span> in WebView;
                data stays isolated inside the app&apos;s private sandbox.
              </p>
              {resolvedStorageStatus.nativeContainerInfo ? (
                <div className="space-y-0.5 font-mono text-[11px] text-[var(--barn-ink)]">
                  <div>
                    WebView:{' '}
                    {resolvedStorageStatus.nativeContainerInfo.webViewPackage || 'System WebView'}{' '}
                    {resolvedStorageStatus.nativeContainerInfo.webViewVersion || 'unknown'}
                  </div>
                  {(resolvedStorageStatus.nativeContainerInfo.opfsSupportedInWebView === false ||
                    (typeof resolvedStorageStatus.nativeContainerInfo.webViewMajorVersion ===
                      'number' &&
                      resolvedStorageStatus.nativeContainerInfo.webViewMajorVersion < 109)) && (
                    <div className="font-sans text-[11px] text-[var(--barn-terracotta)] font-medium">
                      WebView &lt;109 detected: OPFS is unavailable in this WebView; using
                      IndexedDB/SQLite fallback safely.
                    </div>
                  )}
                  {typeof resolvedStorageStatus.nativeContainerInfo.vaultSnapshotCount ===
                    'number' && (
                    <div>
                      Native Backup Vault:{' '}
                      {resolvedStorageStatus.nativeContainerInfo.vaultSnapshotCount} snapshot(s)
                      {typeof resolvedStorageStatus.nativeContainerInfo.vaultTotalBytes ===
                      'number'
                        ? ` (${formatByteSizePure(
                            resolvedStorageStatus.nativeContainerInfo.vaultTotalBytes
                          )})`
                        : ''}
                      {resolvedStorageStatus.nativeContainerInfo.lastVaultBackupAt
                        ? ` · last ${resolvedStorageStatus.nativeContainerInfo.lastVaultBackupAt}`
                        : ''}
                    </div>
                  )}
                </div>
              ) : (
                <div>Native container metadata unavailable or timed out (400ms).</div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-[var(--barn-muted)]">
              Standard browser session · persistent lock:{' '}
              {resolvedStorageStatus.persisted ? 'granted' : 'best-effort'}.
            </p>
          )}
        </div>
      )}

      {pedigreeBridge.isNativeWrapper() && (
        <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5 min-w-0 flex-1">
            <div className="font-semibold text-[var(--barn-ink)]">
              Native Wrapper Diagnostics &amp; Vault Inspector
            </div>
            <p id={nativeDiagDescId} className="text-[11px] text-[var(--barn-muted)]">
              Open the native Android wrapper diagnostics dialog to inspect WebView runtime info,
              storage truth metrics, native backup vault snapshots, and ring-buffer events.
            </p>
          </div>
          <button
            type="button"
            aria-describedby={nativeDiagDescId}
            onClick={() => {
              pedigreeBridge.openDevPanel();
            }}
            className="min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0"
          >
            <Wrench className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Android Wrapper Diagnostics</span>
          </button>
        </div>
      )}

      {emergencyTraceCount > 0 && (
        <div
          role="status"
          className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)]"
        >
          <strong>Emergency Session Trace Active ({emergencyTraceCount}):</strong> Primary browser storage
          could not accept one or more crash entries, so compact traces were preserved in{' '}
          <span className="font-mono">sessionStorage</span> and merged into the log viewer below.
        </div>
      )}

      {/* Retention Window & Verbose Mode */}
      <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 cursor-pointer font-medium">
            <input
              type="checkbox"
              checked={config.verboseEnabled}
              onChange={(e) => handleToggleVerbose(e.target.checked)}
              className="w-4 h-4 accent-[var(--barn-sage)]"
            />
            <span>Verbose logging &amp; 30s memory watchdog (crashes always log)</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--barn-border)]">
          <span className="text-[var(--barn-muted)]">Keep logs automatically for:</span>
          <div className="flex items-center gap-1.5">
            {([3, 7, 14] as const).map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={config.retentionDays === days}
                onClick={() => handleRetentionChange(days)}
                className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                  config.retentionDays === days
                    ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                    : 'bg-[var(--barn-surface)] border-[var(--barn-border)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                }`}
              >
                {days} Days
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Support Export & Send Controls */}
      <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
        <div className="space-y-1.5 text-xs">
          <div className="font-semibold">Bug Report Bundle Options &amp; Recipient</div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDataInBundle}
              onChange={(e) => setIncludeDataInBundle(e.target.checked)}
              className="w-4 h-4 accent-[var(--barn-sage)]"
            />
            <span>
              Include a copy of my barn data ({snapshot.animals.length} animals) so crashes can be
              reproduced
            </span>
          </label>
          {includeDataInBundle && (
            <label className="flex items-center gap-2 cursor-pointer pl-6 text-[var(--barn-muted)]">
              <input
                type="checkbox"
                checked={includePhotosInBundle}
                onChange={(e) => setIncludePhotosInBundle(e.target.checked)}
                className="w-4 h-4 accent-[var(--barn-sage)]"
              />
              <span>
                Include photos ({(snapshot.animalPhotos ?? []).length} photos ·{' '}
                {formatByteSizePure(totalPhotoBytes)}) — uncheck if emailing crashes or is too large
              </span>
            </label>
          )}
        </div>

        <div className="space-y-1 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label htmlFor="support-recipient-email" className="text-[var(--barn-muted)] shrink-0">
              Recipient Email:
            </label>
            <input
              id="support-recipient-email"
              name="support-recipient-manual"
              type="email"
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              value={recipientEmail}
              onChange={(e) => handleSupportEmailChange(e.target.value)}
              placeholder="Type recipient email address"
              aria-invalid={Boolean(recipientEmailError)}
              className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-xs"
            />
          </div>
          {recipientEmailError && (
            <p role="alert" className="text-[11px] text-[var(--barn-danger)] font-medium">
              {recipientEmailError}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busyAction}
            onClick={() => void handleBuildBundle(true)}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Share2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            {includeDataInBundle
              ? 'Send Bug Report + Data (.ZIP)'
              : 'Send Bug Report (.ZIP)'}
          </button>

          <button
            type="button"
            disabled={busyAction}
            onClick={() => void handleBuildBundle(false)}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Archive className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            {includeDataInBundle
              ? 'Download Bug Report + Data (.ZIP)'
              : 'Download Bug Report (.ZIP)'}
          </button>

          <button
            type="button"
            disabled={busyAction}
            onClick={() => void handleDownloadLogsTxt()}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            Download Error Logs (.TXT)
          </button>

          <button
            type="button"
            disabled={busyAction}
            onClick={() => void handleDownloadLogsJson()}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            Download Error Logs (.JSON)
          </button>
        </div>

        {quotaWarningGate && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs space-y-2"
          >
            <div className="font-semibold text-[var(--barn-ink)]">
              {quotaWarningGate.preflight.headline}
            </div>
            <p className="text-[11px] text-[var(--barn-ink)] leading-relaxed">
              {quotaWarningGate.preflight.detail}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const share = quotaWarningGate.attemptShare;
                  setQuotaWarningGate(null);
                  void handleBuildBundle(share, true, true);
                }}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-terracotta)] text-white text-[11px] font-semibold"
              >
                Continue Despite Low Quota
              </button>
              <button
                type="button"
                onClick={() => {
                  setIncludePhotosInBundle(false);
                  setQuotaWarningGate(null);
                }}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
              >
                Uncheck Photos to Save Quota
              </button>
              <button
                type="button"
                onClick={() => setQuotaWarningGate(null)}
                className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {pendingHeavyBundleAttemptShare !== null && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs space-y-2"
          >
            <div className="font-semibold text-[var(--barn-ink)]">{heavyBundleGate.title}</div>
            <p className="text-[11px] text-[var(--barn-ink)] leading-relaxed">
              {heavyBundleGate.body} Unchecking photos or using Timestamped Backup (.JSON) +
              Download Error Logs (.TXT) avoids .ZIP memory spikes on older or Tier 1 devices.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const share = pendingHeavyBundleAttemptShare;
                  setPendingHeavyBundleAttemptShare(null);
                  void handleBuildBundle(share, true);
                }}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-terracotta)] text-white text-[11px] font-semibold"
              >
                Try .ZIP Bundle Anyway
              </button>
              <button
                type="button"
                onClick={() => {
                  setIncludePhotosInBundle(false);
                  setPendingHeavyBundleAttemptShare(null);
                }}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
              >
                Uncheck Photos (Safer .ZIP)
              </button>
              <button
                type="button"
                onClick={() => setPendingHeavyBundleAttemptShare(null)}
                className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {feedback && (
          <div
            role="status"
            aria-live="polite"
            className="p-3 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs space-y-2"
          >
            <div>{feedback}</div>
            <div className="flex flex-wrap items-center gap-3">
              {mailtoHref && (
                <a
                  href={mailtoHref}
                  onClick={(e) => {
                    if (pedigreeBridge.isNativeWrapper()) {
                      e.preventDefault();
                      pedigreeBridge.openExternalUrl(mailtoHref, 'support_email');
                    }
                  }}
                  className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold inline-flex items-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                  {recipientEmail.trim()
                    ? `Open Email Draft (${recipientEmail.trim()})`
                    : 'Open Email Draft'}
                </a>
              )}
              <button
                type="button"
                onClick={() => void handleCopySupportText()}
                className="min-h-[34px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] font-medium inline-flex items-center gap-1.5"
              >
                {copiedSummary ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                    Copied Report
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    Copy Text Report
                  </>
                )}
              </button>
            </div>
            {manualCopyBox?.target === 'support' && (
              <div className="pt-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-[var(--barn-ink)]">
                    {manualCopyBox.label} (tap to select all)
                  </span>
                  <button
                    type="button"
                    onClick={() => setManualCopyBox(null)}
                    className="text-[11px] underline text-[var(--barn-muted)]"
                  >
                    Hide box
                  </button>
                </div>
                <textarea
                  readOnly
                  aria-label={manualCopyBox.label}
                  value={manualCopyBox.text}
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={(e) => e.currentTarget.select()}
                  rows={6}
                  className="w-full p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-[11px]"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expandable Live Diagnostic Log Viewer */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            aria-expanded={showLogViewer}
            aria-controls={logViewerId}
            onClick={() => setShowLogViewer((v) => !v)}
            className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5"
          >
            <Activity className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            {showLogViewer ? 'Hide Live Diagnostic Logs' : `Inspect Captured Logs (${entries.length})`}
            {showLogViewer ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                logDiagnosticEvent({
                  level: 'info',
                  category: 'lifecycle',
                  message: 'Manual diagnostic test log recorded from The Techy Stuff',
                  details: { route: 'techyStuff', animalCount: snapshot.animals.length },
                });
                void refreshDiagnostics();
              }}
              className="min-h-[44px] sm:min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px] font-medium hover:bg-[var(--barn-subtle)]"
            >
              Test Log
            </button>
            {!confirmClearLogs ? (
              <button
                type="button"
                disabled={entries.length === 0}
                onClick={() => setConfirmClearLogs(true)}
                className="min-h-[44px] sm:min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px] text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] disabled:opacity-40 inline-flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" aria-hidden="true" />
                Clear Logs
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    void clearAllDiagnosticLogs().then(() => {
                      setConfirmClearLogs(false);
                      return refreshDiagnostics();
                    })
                  }
                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold"
                >
                  Confirm Clear ({entries.length})
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearLogs(false)}
                  className="min-h-[34px] px-2 py-1 rounded-lg border border-[var(--barn-border)] text-[11px]"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {showLogViewer && (
          <div
            id={logViewerId}
            className="space-y-2.5 border border-[var(--barn-border)] rounded-xl p-3 bg-[var(--barn-canvas)]"
          >
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(
                [
                  ['all', `All (${entries.length})`],
                  ['errors', `Errors & Crashes (${errorEntriesCount})`],
                  ['memory', `Memory (${memoryEntriesCount})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={logFilter === key}
                  onClick={() => setLogFilter(key)}
                  className={`min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                    logFilter === key
                      ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                      : 'bg-[var(--barn-surface)] text-[var(--barn-muted)] border border-[var(--barn-border)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {filteredEntries.length === 0 ? (
              <p className="text-xs text-[var(--barn-muted)] py-3 text-center">
                No diagnostic entries match this filter yet.
              </p>
            ) : (
              <div className="divide-y divide-[var(--barn-border)] max-h-72 overflow-y-auto bg-[var(--barn-surface)] rounded-lg border border-[var(--barn-border)]">
                {filteredEntries.slice(0, 80).map((entry) => {
                  const isExpanded = expandedLogId === entry.id;
                  const levelColor =
                    entry.level === 'fatal' || entry.level === 'error'
                      ? 'text-[var(--barn-danger)]'
                      : entry.level === 'warn'
                      ? 'text-[var(--barn-terracotta)]'
                      : 'text-[var(--barn-sage)]';

                  return (
                    <div key={entry.id} className="p-2.5 text-[11px] space-y-1">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={`${basePanelId}-log-${entry.id}`}
                        onClick={() => setExpandedLogId(isExpanded ? null : entry.id)}
                        className="w-full min-h-[44px] sm:min-h-0 py-1 text-left flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="font-mono flex flex-wrap items-center gap-1.5">
                            <span className={`font-bold uppercase ${levelColor}`}>
                              {entry.level}
                            </span>
                            <span className="text-[var(--barn-muted)]">
                              [{entry.category}] · {entry.route}
                            </span>
                            {entry.memory?.heapPercent !== null &&
                              entry.memory?.heapPercent !== undefined && (
                                <span className="text-[var(--barn-muted)]">
                                  · heap {entry.memory.heapPercent}%
                                </span>
                              )}
                          </div>
                          <div className="font-medium text-[var(--barn-ink)] break-words">
                            {entry.message}
                          </div>
                        </div>
                        <span className="font-mono text-[10px] text-[var(--barn-muted)] shrink-0">
                          {new Date(entry.timestampMs).toLocaleTimeString()}
                        </span>
                      </button>

                      {isExpanded && (
                        <div
                          id={`${basePanelId}-log-${entry.id}`}
                          className="pt-1.5 border-t border-[var(--barn-border)]/60 space-y-1 font-mono text-[10px] text-[var(--barn-muted)]"
                        >
                          <div>UTC: {entry.timestampIso}</div>
                          {entry.details && (
                            <pre className="whitespace-pre-wrap break-words bg-[var(--barn-canvas)] p-2 rounded">
                              {entry.details}
                            </pre>
                          )}
                          {entry.stack && (
                            <pre className="whitespace-pre-wrap break-words bg-[var(--barn-canvas)] p-2 rounded text-[var(--barn-danger)]">
                              {entry.stack}
                            </pre>
                          )}
                          {entry.componentStack && (
                            <pre className="whitespace-pre-wrap break-words bg-[var(--barn-canvas)] p-2 rounded">
                              {entry.componentStack}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Photo Storage & Orphan Attachment Pruner (IMP-023) */}
      {onAnalyzePhotoFootprint && (
        <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-[var(--barn-ink)] flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                <span>Photo Storage &amp; Orphan Attachment Pruner</span>
              </div>
              <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
                Audits per-species photo byte usage, cleans orphan images left by deleted animals,
                re-compresses oversized photos under your active preset, or compacts full-res
                copies down to crisp thumbnails.
              </p>
            </div>
            <button
              type="button"
              disabled={busyAction}
              onClick={() =>
                void actionLock.runLocked(async () => {
                  setPhotoMaintenanceFeedback(null);
                  setConfirmPruneFullRes(false);
                  const rep = await onAnalyzePhotoFootprint();
                  setPhotoFootprint(rep);
                  if (rep) {
                    setPhotoMaintenanceFeedback(
                      `Scanned ${rep.totalPhotoCount} photo(s) (${formatByteSizePure(rep.totalStoredBytes)}): ${rep.orphanPhotoIds.length} orphan(s), ${rep.oversizedPhotoIds.length} oversized, ${rep.fullResPrunableIds.length} compactable.`
                    );
                  }
                })
              }
              className="min-h-[36px] max-w-full px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 disabled:opacity-55"
            >
              <ImageIcon className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>Analyze Photo Storage</span>
            </button>
          </div>

          {photoFootprint && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                <div className="p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]">
                  <div className="text-[var(--barn-muted)]">Total Stored</div>
                  <div className="font-mono font-semibold text-[var(--barn-ink)] mt-0.5">
                    {photoFootprint.totalPhotoCount} photo
                    {photoFootprint.totalPhotoCount === 1 ? '' : 's'} ·{' '}
                    {formatByteSizePure(photoFootprint.totalStoredBytes)}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]">
                  <div className="text-[var(--barn-muted)]">Orphan Attachments</div>
                  <div className="font-mono font-semibold text-[var(--barn-ink)] mt-0.5">
                    {photoFootprint.orphanPhotoIds.length} ·{' '}
                    {formatByteSizePure(photoFootprint.orphanBytes)}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]">
                  <div className="text-[var(--barn-muted)]">
                    Oversized (&gt;{photoFootprint.activePresetMaxDimension}px)
                  </div>
                  <div className="font-mono font-semibold text-[var(--barn-ink)] mt-0.5">
                    {photoFootprint.oversizedPhotoIds.length} ·{' '}
                    {formatByteSizePure(photoFootprint.oversizedBytes)}
                  </div>
                </div>
              </div>

              {photoFootprint.speciesBreakdown.length > 0 && (
                <div className="rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-[var(--barn-border)] text-[11px] font-semibold text-[var(--barn-muted)]">
                    Per-Species Photo Breakdown
                  </div>
                  <div className="divide-y divide-[var(--barn-border)] max-h-40 overflow-y-auto text-[11px]">
                    {photoFootprint.speciesBreakdown.map((sp) => (
                      <div
                        key={sp.species}
                        className="px-3 py-1.5 flex flex-wrap items-center justify-between gap-2"
                      >
                        <span className="font-medium text-[var(--barn-ink)]">{sp.species}</span>
                        <span className="font-mono text-[var(--barn-muted)] tabular-nums">
                          {sp.photoCount} photo{sp.photoCount === 1 ? '' : 's'} ·{' '}
                          {formatByteSizePure(sp.storedBytes)}
                          {sp.orphanCount > 0 ? ` · ${sp.orphanCount} orphan` : ''}
                          {sp.oversizedCount > 0 ? ` · ${sp.oversizedCount} oversized` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {onPruneOrphanPhotos && (
                  <button
                    type="button"
                    disabled={busyAction || photoFootprint.orphanPhotoIds.length === 0}
                    onClick={() =>
                      void actionLock.runLocked(async () => {
                        const res = await onPruneOrphanPhotos();
                        const refreshed = await onAnalyzePhotoFootprint();
                        if (refreshed) setPhotoFootprint(refreshed);
                        if (onRefreshStorageStatus) void onRefreshStorageStatus();
                        setPhotoMaintenanceFeedback(
                          res.removedCount > 0
                            ? `Removed ${res.removedCount} orphan photo(s), reclaiming ${formatByteSizePure(res.reclaimedBytes)}.`
                            : 'No orphan photo attachments needed removal.'
                        );
                      })
                    }
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-[var(--barn-terracotta)]" aria-hidden="true" />
                    Remove Orphan Photos ({photoFootprint.orphanPhotoIds.length})
                  </button>
                )}

                {onReoptimizeOversizedPhotos && (
                  <button
                    type="button"
                    disabled={busyAction || photoFootprint.oversizedPhotoIds.length === 0}
                    onClick={() =>
                      void actionLock.runLocked(async () => {
                        const preflight = await verifyStorageQuotaForDiagnosticAction({
                          operation: 'photo_reoptimize',
                          operationLabel: 'Photo Re-Optimization',
                          estimatedRequiredBytes: Math.min(
                            photoFootprint.oversizedBytes,
                            5 * 1024 * 1024
                          ),
                        });
                        if (!preflight.allowed) {
                          setPhotoMaintenanceFeedback(`${preflight.headline} — ${preflight.detail}`);
                          return;
                        }
                        const res = await onReoptimizeOversizedPhotos();
                        const refreshed = await onAnalyzePhotoFootprint();
                        if (refreshed) setPhotoFootprint(refreshed);
                        if (onRefreshStorageStatus) void onRefreshStorageStatus();
                        setPhotoMaintenanceFeedback(
                          res.updatedCount > 0
                            ? `Re-optimized ${res.updatedCount} of ${res.oversizedFound} oversized photo(s), reclaiming ${formatByteSizePure(res.reclaimedBytes)}.`
                            : `Checked ${res.oversizedFound} oversized photo(s) — existing files were already as compact as possible.`
                        );
                      })
                    }
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    Re-Optimize Oversized ({photoFootprint.oversizedPhotoIds.length})
                  </button>
                )}

                {onPruneFullResPhotoPayloads && !confirmPruneFullRes && (
                  <button
                    type="button"
                    disabled={busyAction || photoFootprint.fullResPrunableIds.length === 0}
                    onClick={() => setConfirmPruneFullRes(true)}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-semibold text-[var(--barn-terracotta)] hover:bg-[var(--barn-subtle)] disabled:opacity-50"
                  >
                    Compact Full-Res to Thumbnails ({photoFootprint.fullResPrunableIds.length} · ~
                    {formatByteSizePure(photoFootprint.estimatedReclaimableFullResBytes)})
                  </button>
                )}
              </div>

              {confirmPruneFullRes && onPruneFullResPhotoPayloads && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] space-y-2 text-[11px]"
                >
                  <p className="font-medium text-[var(--barn-ink)]">
                    A safety snapshot will be saved automatically first. Full-resolution image
                    payloads will be replaced with their crisp thumbnails while keeping every animal
                    photo entry and caption intact (~
                    {formatByteSizePure(photoFootprint.estimatedReclaimableFullResBytes)}{' '}
                    reclaimable).
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() =>
                        void actionLock.runLocked(async () => {
                          const res = await onPruneFullResPhotoPayloads();
                          setConfirmPruneFullRes(false);
                          const refreshed = await onAnalyzePhotoFootprint();
                          if (refreshed) setPhotoFootprint(refreshed);
                          setPhotoMaintenanceFeedback(
                            res.prunedCount > 0
                              ? `Compacted ${res.prunedCount} full-res photo(s) to thumbnails, reclaiming ${formatByteSizePure(res.reclaimedBytes)}.`
                              : 'No full-resolution photo payloads needed compacting.'
                          );
                        })
                      }
                      className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-terracotta)] text-white font-semibold disabled:opacity-60"
                    >
                      Confirm Compact to Thumbnails
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmPruneFullRes(false)}
                      className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {photoMaintenanceFeedback && (
            <div
              role="status"
              aria-live="polite"
              className="p-2.5 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-[11px]"
            >
              {photoMaintenanceFeedback}
            </div>
          )}
        </div>
      )}

      {/* Self-Service Database Health Check & Non-Destructive Auto-Repair */}
      <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-[var(--barn-ink)]">
              Self-Service Database Health Check &amp; Auto-Repair
            </div>
            <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
              Scans for hidden species records, broken/circular parent links, or missing cover
              photos and fixes them safely without deleting any records.
            </p>
          </div>
          <button
            type="button"
            disabled={busyAction}
            onClick={() => {
              setHealthRepairsList(null);
              const report = onScanDatabaseHealth();
              setHealthReport(report);
            }}
            className="min-h-[36px] max-w-full px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5"
          >
            <Wrench className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            <span>Scan Herd &amp; DB Health</span>
          </button>
        </div>

        {healthReport && (
          <div
            className={`p-3 rounded-xl border text-xs space-y-2 ${
              healthReport.healthy
                ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)]'
                : 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold flex items-center gap-1.5">
                {healthReport.healthy ? (
                  <>
                    <Check className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                    All Clear — {snapshot.animals.length} animals,{' '}
                    {(snapshot.animalPhotos ?? []).length} photos, and{' '}
                    {snapshot.speciesProfiles.length} species hubs passed all integrity checks.
                  </>
                ) : (
                  <>
                    <ShieldAlert
                      className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0"
                      aria-hidden="true"
                    />
                    Found {healthReport.totalIssueCount} structural issue(s) across{' '}
                    {healthReport.issues.length} check(s)
                  </>
                )}
              </div>

              {healthReport.autoRepairableCount > 0 && (
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={() =>
                    void actionLock.runLocked(async () => {
                      const res = await onRepairDatabaseHealth();
                      if (res) {
                        setHealthReport(res.reportAfter);
                        setHealthRepairsList(res.repairsApplied);
                      }
                    })
                  }
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap disabled:opacity-60"
                >
                  Save Snapshot &amp; Auto-Repair (Zero Data Loss)
                </button>
              )}
            </div>

            {!healthReport.healthy && (
              <ul className="space-y-1.5 text-[11px]">
                {healthReport.issues.map((issue) => (
                  <li
                    key={issue.code}
                    className="p-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] flex flex-wrap items-start justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[var(--barn-ink)]">{issue.title}</div>
                      <div className="text-[var(--barn-muted)]">{issue.detail}</div>
                    </div>
                    {onLocateConflicts &&
                      (issue.code === 'DUPLICATE_SPECIES_TATTOO' ||
                        issue.code === 'PARENT_SEX_MISMATCH') && (
                        <button
                          type="button"
                          onClick={onLocateConflicts}
                          className="min-h-[30px] max-w-full px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
                        >
                          Locate Conflicts in Herd
                        </button>
                      )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {healthRepairsList && healthRepairsList.length > 0 && (
          <div className="p-3 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs space-y-1">
            <div className="font-semibold">
              Applied {healthRepairsList.length} safe repair(s) (safety snapshot saved first):
            </div>
            <ul className="list-disc pl-4 text-[11px] space-y-0.5">
              {healthRepairsList.slice(0, 10).map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Database Connection & Corrupted Cache Recovery (Backup-First) */}
      <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
        <div>
          <div className="text-xs font-semibold text-[var(--barn-ink)]">
            Database Connection &amp; Corrupted Cache Recovery
          </div>
          <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
            Fixes wedged SQLite/IndexedDB handles or stale PWA caches while keeping your saved
            records safe and retaining a timestamped backup file on your device.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busyAction}
            onClick={() =>
              void actionLock.runLocked(async () => {
                setRecoveryFeedback(null);
                try {
                  await onResetDatabaseConnection();
                  setRecoveryFeedback(
                    'Database connection cleanly closed & re-opened with all animals and photos intact.'
                  );
                  await refreshDiagnostics();
                } catch (err) {
                  setRecoveryFeedback(
                    err instanceof Error ? err.message : 'Database connection reset failed.'
                  );
                }
              })
            }
            className="min-h-[40px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            Reset DB Connection (Keep Data)
          </button>

          <button
            type="button"
            disabled={busyAction}
            onClick={() =>
              void actionLock.runLocked(async () => {
                setRecoveryFeedback(null);
                try {
                  const quotaCheck = await verifyStorageQuotaForDiagnosticAction({
                    operation: 'cache_purge_rebuild',
                    operationLabel: 'Purge Stale Caches + Retain Backup',
                    estimatedRequiredBytes: totalPhotoBytes + snapshot.animals.length * 1024 + 256 * 1024,
                    requiresOpfsPreferred: true,
                  });
                  const shouldDownloadFirst = quotaCheck.allowed;
                  const res = await onPurgeCorruptedCaches({
                    downloadBackupFirst: shouldDownloadFirst,
                    rebuildLocalDb: false,
                  });
                  if (onRefreshStorageStatus) void onRefreshStorageStatus();
                  setRecoveryFeedback(
                    `Cleared ${res.cachesCleared} app cache(s) & ${res.serviceWorkersUnregistered} service worker(s), kept all herd records${
                      res.backupFilename
                        ? `, and retained backup ${res.backupFilename}.`
                        : shouldDownloadFirst
                          ? '.'
                          : ' (skipped pre-purge ZIP staging due to tight browser quota).'
                    }`
                  );
                  await refreshDiagnostics();
                } catch (err) {
                  setRecoveryFeedback(
                    err instanceof Error ? err.message : 'Cache purge failed.'
                  );
                }
              })
            }
            className="min-h-[40px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            Purge Stale Caches + Retain Backup
          </button>
        </div>

        <div className="pt-2 border-t border-[var(--barn-border)]/70">
          {!confirmRebuildDb ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-[var(--barn-muted)]">
                Only if IndexedDB itself is corrupted:
              </span>
              <button
                type="button"
                disabled={busyAction}
                onClick={() => {
                  setRebuildConfirmPhrase('');
                  setConfirmRebuildDb(true);
                }}
                className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)]"
              >
                Purge &amp; Rebuild Local DB (Auto-Backup First)
              </button>
            </div>
          ) : (
            <div className="p-2.5 rounded-lg bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] space-y-2 text-xs">
              <p className="text-[11px] font-medium text-[var(--barn-ink)]">
                This will check OPFS/IDB quota, export &amp; download a complete timestamped `.ZIP`
                backup file to your device first, then purge &amp; rebuild local IndexedDB cleanly.
                Type <span className="font-mono font-bold">{DESTRUCTIVE_CONFIRM_PHRASES.rebuild_local_db}</span>{' '}
                below to arm this action:
              </p>
              <input
                type="text"
                aria-label="Type confirmation phrase to rebuild local database"
                value={rebuildConfirmPhrase}
                onChange={(e) => setRebuildConfirmPhrase(e.target.value)}
                placeholder={DESTRUCTIVE_CONFIRM_PHRASES.rebuild_local_db}
                className="w-full sm:w-56 min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-xs"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={
                    busyAction ||
                    !isDestructiveActionConfirmationValid('rebuild_local_db', rebuildConfirmPhrase)
                  }
                  onClick={() =>
                    void actionLock.runLocked(async () => {
                      setRecoveryFeedback(null);
                      const quotaCheck = await verifyStorageQuotaForDiagnosticAction({
                        operation: 'cache_purge_rebuild',
                        operationLabel: 'Purge & Rebuild Local DB',
                        estimatedRequiredBytes: totalPhotoBytes + snapshot.animals.length * 1024 + 256 * 1024,
                        requiresOpfsPreferred: true,
                      });
                      const res = await onPurgeCorruptedCaches({
                        downloadBackupFirst: quotaCheck.allowed,
                        rebuildLocalDb: true,
                      });
                      setConfirmRebuildDb(false);
                      setRebuildConfirmPhrase('');
                      if (onRefreshStorageStatus) void onRefreshStorageStatus();
                      setRecoveryFeedback(
                        `Retained ${
                          res.backupFilename || 'timestamped backup'
                        }, purged ${res.cachesCleared} cache(s), and rebuilt local IndexedDB cleanly. Use "Restore (.JSON / .ZIP)" in Import / Export Hub whenever ready.`
                      );
                      await refreshDiagnostics();
                    })
                  }
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold disabled:opacity-45"
                >
                  Download Backup &amp; Rebuild DB
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmRebuildDb(false);
                    setRebuildConfirmPhrase('');
                  }}
                  className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {recoveryFeedback && (
          <div
            role="status"
            aria-live="polite"
            className="p-2.5 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs"
          >
            {recoveryFeedback}
          </div>
        )}
      </div>

      {/* App Improvements & GitHub-Overwrite Recovery Log (IMP-011) */}
      <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-[var(--barn-ink)]">
              App Improvements &amp; Recovery Log ({IMPROVEMENTS_REGISTRY.length})
            </div>
            <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
              Download or copy the tracked improvements manifest &amp; restoration playbooks.
            </p>
          </div>
          <button
            type="button"
            aria-expanded={showImprovementsLog}
            aria-controls={improvementsLogId}
            onClick={() => setShowImprovementsLog((v) => !v)}
            className="min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
          >
            {showImprovementsLog ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                Hide Log
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                View Tracked Improvements
              </>
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              try {
                await downloadTextFile('IMPROVEMENTS.md', formatImprovementsMarkdown(), 'text/markdown');
                setImprovementsFeedback('Downloaded IMPROVEMENTS.md recovery manual.');
              } catch (err) {
                setImprovementsFeedback(
                  err instanceof Error ? err.message : 'Could not download IMPROVEMENTS.md.'
                );
              }
            }}
            className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Download IMPROVEMENTS.md
          </button>

          <button
            type="button"
            onClick={async () => {
              try {
                await downloadTextFile(
                  'pedigree-improvements-log.json',
                  buildImprovementsRecoveryJson(),
                  'application/json'
                );
                setImprovementsFeedback('Downloaded pedigree-improvements-log.json.');
              } catch (err) {
                setImprovementsFeedback(
                  err instanceof Error
                    ? err.message
                    : 'Could not download pedigree-improvements-log.json.'
                );
              }
            }}
            className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Download Recovery .JSON
          </button>

          <button
            type="button"
            onClick={async () => {
              const markdown = formatImprovementsMarkdown();
              const mode = await copyTextWithFallback(markdown);
              if (mode !== 'unsupported') {
                setManualCopyBox(null);
                setImprovementsFeedback('Copied Markdown recovery log to clipboard.');
              } else {
                setManualCopyBox({
                  target: 'improvements',
                  label: 'Selectable Markdown Recovery Log',
                  text: markdown,
                });
                setImprovementsFeedback(
                  'Clipboard unavailable in this browser — copy from the text box below or use Download Recovery .JSON.'
                );
              }
            }}
            className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
            Copy Markdown Log
          </button>
        </div>

        {improvementsFeedback && (
          <div
            role="status"
            aria-live="polite"
            className="p-2 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-[11px] space-y-2"
          >
            <div>{improvementsFeedback}</div>
            {manualCopyBox?.target === 'improvements' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[var(--barn-ink)]">
                    {manualCopyBox.label} (tap to select all)
                  </span>
                  <button
                    type="button"
                    onClick={() => setManualCopyBox(null)}
                    className="underline text-[var(--barn-muted)]"
                  >
                    Hide box
                  </button>
                </div>
                <textarea
                  readOnly
                  aria-label={manualCopyBox.label}
                  value={manualCopyBox.text}
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={(e) => e.currentTarget.select()}
                  rows={6}
                  className="w-full p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-[11px]"
                />
              </div>
            )}
          </div>
        )}

        {showImprovementsLog && (
          <div id={improvementsLogId} className="space-y-2 max-h-72 overflow-y-auto pt-1">
            {IMPROVEMENTS_REGISTRY.map((entry) => (
              <div
                key={entry.id}
                className="p-3 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-1 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--barn-ink)]">
                    <span className="font-mono text-[var(--barn-sage)]">{entry.id}</span> ·{' '}
                    {entry.title}
                  </span>
                  <span className="text-[11px] font-mono text-[var(--barn-muted)]">
                    {IMPROVEMENT_CATEGORY_LABELS[entry.category]}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--barn-muted)]">{entry.summary}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
```

<!-- END OF PART 03 OF 16 (10 files) -->
