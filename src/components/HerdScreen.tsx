/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Species-Isolated Herd Registry & Dedicated Single-Animal Profile Screen (`Herd`).
 *
 * Strictly displays ONLY animals where `animal.species === activeData.speciesProfile.name`.
 * Features:
 * - Multi-select checkboxes + Bulk actions (Move to Archived, Restore to Active, Move Species, Delete)
 * - Live (N) counts on all 6 filter tabs (All, Males, Females, Juniors, Active, Archived)
 * - Dedicated full-width Animal Page when inspecting/editing a specific animal
 * - Option to embed primary animal photo on printed .HTM / PDF pedigrees
 */

import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  Edit3,
  FileText,
  GitFork,
  Plus,
  Printer,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import {
  analyzeAnimalCarrierLineage,
  AnimalCarrierLineageAnalysis,
  doesAnimalMatchCarrierFilter,
  formatClearedProofBadge,
  getAnimalCarrierDisclosures,
  getCarrierTraitSuggestionsForSpecies,
  HerdCarrierFilterMode,
} from '../core/carrierGenetics';
import {
  formatGenotypeArray,
  getGeneticsSpecForSpecies,
  inferHiddenAlleles,
} from '../core/geneticsEngine';
import { OptimizedImagePayload } from '../core/imageOptimizationSpec';
import {
  addDaysIso,
  Animal,
  BarnDatabaseSnapshot,
  BarnSettings,
  CARE_LOG_TYPES,
  CareLog,
  CareLogType,
  doesAnimalNeedAttention,
  formatCurrencyCents,
  formatReadableDate,
  formatSexForSpecies,
  formatWeight,
  getSpeciesIdentifierLabels,
  getWeightInputMeta,
  isAnimalArchived,
  normalizeOwnershipType,
  parseWeightInputToGrams,
  resolveSpeciesWeightUnit,
  SpeciesProfile,
  todayDateIso,
  ULTRASOUND_RESULTS,
  UltrasoundResult,
} from '../core/models';
import { getPedigreeCompletenessSummary } from '../core/pedigreeCalculator';
import { SpeciesMigrationOptions } from '../core/speciesMigration';
import {
  generateEvansHtmPedigree,
  generateThermalCageCardHtml,
  PedigreePrintOptions,
} from '../core/syncAndExports';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import { AnimalEditorModal } from './AnimalEditorModal';
import { AnimalPhotoGallery } from './AnimalPhotoGallery';
import { ColorGeneticsNotice } from './ColorGeneticsNotice';
import { PedigreePrintNotice } from './PedigreePrintNotice';
import { PrintPreviewModal } from './PrintPreviewModal';
import { SpeciesMigrationModal } from './SpeciesMigrationModal';

export const HERD_PAGE_SIZE = 50;

interface HerdScreenProps {
  snapshot: BarnDatabaseSnapshot;
  activeData: ActiveSpeciesData;
  allAnimals: Animal[];
  speciesProfiles: SpeciesProfile[];
  settings: BarnSettings;
  selectedAnimalId: string | null;
  onSelectAnimal: (id: string | null) => void;
  onOpenPedigreeForAnimal: (id: string) => void;
  onSaveAnimal: (
    draft: Omit<Animal, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string },
    pendingPhotos?: Array<OptimizedImagePayload & { caption?: string }>
  ) => void;
  onAddAnimalPhotos: (
    animal: Animal,
    payloads: Array<OptimizedImagePayload & { caption?: string }>
  ) => Promise<number> | Promise<void> | void;
  onSetPrimaryAnimalPhoto: (animalId: string, photoId: string) => Promise<void> | void;
  onUpdateAnimalPhotoCaption: (photoId: string, caption: string) => Promise<void> | void;
  onDeleteAnimalPhoto: (photoId: string) => Promise<void> | void;
  onDeleteAnimal: (animal: Animal) => void;
  onArchiveAnimals: (animalIds: string[], archived: boolean) => void;
  onDeleteAnimalsBatch: (animalIds: string[]) => void;
  onMigrateAnimalsSpecies: (
    animalIds: string[],
    targetSpecies: string,
    options?: SpeciesMigrationOptions
  ) => Promise<void> | void;
  onToggleIncludePhotoOnPedigree: (include: boolean) => void;
  onAddCareLog: (draft: Omit<CareLog, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteCareLog: (id: string) => void;
}

type HerdFilterTab =
  | 'all'
  | 'Male'
  | 'Female'
  | 'Junior'
  | 'Active'
  | 'Archived'
  | 'NeedsAttention';

export function HerdScreen({
  snapshot,
  activeData,
  allAnimals,
  speciesProfiles,
  settings,
  selectedAnimalId,
  onSelectAnimal,
  onOpenPedigreeForAnimal,
  onSaveAnimal,
  onAddAnimalPhotos,
  onSetPrimaryAnimalPhoto,
  onUpdateAnimalPhotoCaption,
  onDeleteAnimalPhoto,
  onDeleteAnimal,
  onArchiveAnimals,
  onDeleteAnimalsBatch,
  onMigrateAnimalsSpecies,
  onToggleIncludePhotoOnPedigree,
  onAddCareLog,
  onDeleteCareLog,
}: HerdScreenProps) {
  const {
    speciesProfile,
    animals,
    photosByAnimalId,
    primaryPhotoByAnimalId,
    herdById,
    coiByAnimalId,
    cages,
    careLogs,
  } = activeData;

  const effectiveWeightUnit = resolveSpeciesWeightUnit(speciesProfile, settings);
  const weightMeta = getWeightInputMeta(effectiveWeightUnit);
  const idLabels = getSpeciesIdentifierLabels(speciesProfile.name);

  const [query, setQuery] = useState('');
  const [filterKey, setFilterKey] = useState<HerdFilterTab>('all');
  const [carrierFilterMode, setCarrierFilterMode] = useState<HerdCarrierFilterMode>('all');
  const [carrierTraitQuery, setCarrierTraitQuery] = useState('');
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(HERD_PAGE_SIZE);
  const [migrationModalState, setMigrationModalState] = useState<{
    mode: 'single' | 'multi-select';
    animalIds: string[];
  } | null>(null);

  useEffect(() => {
    setCheckedIds([]);
    setConfirmBatchDelete(false);
    setMigrationModalState(null);
    setCarrierFilterMode('all');
    setCarrierTraitQuery('');
    setVisibleLimit(HERD_PAGE_SIZE);
  }, [speciesProfile.name]);

  useEffect(() => {
    setVisibleLimit(HERD_PAGE_SIZE);
  }, [filterKey, query, carrierFilterMode, carrierTraitQuery]);

  const [editingAnimal, setEditingAnimal] = useState<Animal | null>(null);
  const [showAnimalModal, setShowAnimalModal] = useState(false);

  // Print preview state
  const [pedigreePrintOptions, setPedigreePrintOptions] = useState<PedigreePrintOptions>({
    showWeights: true,
    showGenotypes: false,
    showBreederFooter: true,
    breederContactLine: '',
  });
  const [previewDoc, setPreviewDoc] = useState<{
    title: string;
    filename: string;
    html: string;
    isPedigree?: boolean;
    pedigreeSubject?: Animal;
  } | null>(null);

  // Quick Cage-Side Care/Weight Log state
  const [showLogForm, setShowLogForm] = useState(false);
  const [logType, setLogType] = useState<CareLogType>('Weight Check');
  const [logTitle, setLogTitle] = useState('');
  const [logDateIso, setLogDateIso] = useState(todayDateIso());
  const [logWeightInput, setLogWeightInput] = useState('');
  const [logShowLeg, setLogShowLeg] = useState(false);
  const [logNotes, setLogNotes] = useState('');
  const [logMedicationName, setLogMedicationName] = useState('');
  const [logDosage, setLogDosage] = useState('');
  const [logAdministrationRoute, setLogAdministrationRoute] = useState('');
  const [logWithdrawalDays, setLogWithdrawalDays] = useState('');
  const [logBodyConditionScore, setLogBodyConditionScore] = useState('');
  const [logFamachaScore, setLogFamachaScore] = useState('');
  const [logFecalEggCount, setLogFecalEggCount] = useState('');
  const [logUltrasoundResult, setLogUltrasoundResult] = useState<UltrasoundResult>('');
  const [logUltrasoundFetalCount, setLogUltrasoundFetalCount] = useState('');

  // Live filter tab counts
  const maleCount = useMemo(() => animals.filter((a) => a.sex === 'Male').length, [animals]);
  const femaleCount = useMemo(() => animals.filter((a) => a.sex === 'Female').length, [animals]);
  const juniorCount = useMemo(() => animals.filter((a) => a.status === 'Junior').length, [animals]);
  const activeCount = useMemo(
    () => animals.filter((a) => !isAnimalArchived(a)).length,
    [animals]
  );
  const archivedCount = useMemo(
    () => animals.filter((a) => isAnimalArchived(a)).length,
    [animals]
  );
  const needsAttentionCount = useMemo(
    () => animals.filter((a) => doesAnimalNeedAttention(a)).length,
    [animals]
  );

  const speciesGeneticsSpec = useMemo(
    () => getGeneticsSpecForSpecies(speciesProfile.name),
    [speciesProfile.name]
  );

  const carrierSuggestions = useMemo(
    () => getCarrierTraitSuggestionsForSpecies(speciesProfile.name),
    [speciesProfile.name]
  );

  const carrierAnalysisById = useMemo(() => {
    const map = new Map<string, AnimalCarrierLineageAnalysis>();
    for (const a of animals) {
      map.set(a.id, analyzeAnimalCarrierLineage(a, herdById));
    }
    return map;
  }, [animals, herdById]);

  const filteredAnimals = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hasCarrierFilter = carrierFilterMode !== 'all' || carrierTraitQuery.trim().length > 0;
    return animals.filter((a) => {
      const archived = isAnimalArchived(a);
      if (filterKey === 'Male' && a.sex !== 'Male') return false;
      if (filterKey === 'Female' && a.sex !== 'Female') return false;
      if (filterKey === 'Junior' && a.status !== 'Junior') return false;
      if (filterKey === 'Active' && archived) return false;
      if (filterKey === 'Archived' && !archived) return false;
      if (filterKey === 'NeedsAttention' && !doesAnimalNeedAttention(a)) return false;

      if (hasCarrierFilter) {
        const analysis = carrierAnalysisById.get(a.id);
        if (!analysis || !doesAnimalMatchCarrierFilter(analysis, carrierFilterMode, carrierTraitQuery)) {
          return false;
        }
      }

      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.tattoo.toLowerCase().includes(q) ||
        a.registrationNumber.toLowerCase().includes(q) ||
        a.grandChampionNumber.toLowerCase().includes(q) ||
        a.breed.toLowerCase().includes(q) ||
        a.variety.toLowerCase().includes(q) ||
        a.cageLocation.toLowerCase().includes(q)
      );
    });
  }, [animals, query, filterKey, carrierFilterMode, carrierTraitQuery, carrierAnalysisById]);

  // Only show dedicated Animal Page when user explicitly opened an animal (`selectedAnimalId`)
  const activeAnimal = useMemo(() => {
    if (selectedAnimalId && herdById.has(selectedAnimalId)) {
      return herdById.get(selectedAnimalId)!;
    }
    return null;
  }, [selectedAnimalId, herdById]);

  const activeAnimalLogs = useMemo(
    () => (activeAnimal ? careLogs.filter((l) => l.animalId === activeAnimal.id) : []),
    [careLogs, activeAnimal]
  );

  const weightPoints = useMemo(
    () =>
      [...activeAnimalLogs]
        .filter((l) => l.weightGrams > 0)
        .sort((a, b) => a.dateIso.localeCompare(b.dateIso)),
    [activeAnimalLogs]
  );

  const offspring = useMemo(
    () =>
      activeAnimal
        ? animals.filter((a) => a.sireId === activeAnimal.id || a.damId === activeAnimal.id)
        : [],
    [animals, activeAnimal]
  );

  const alleleInference = useMemo(
    () =>
      activeAnimal
        ? inferHiddenAlleles(activeAnimal, herdById, animals, speciesProfile.name)
        : null,
    [activeAnimal, herdById, animals, speciesProfile.name]
  );

  const activeCarriers = useMemo(
    () => getAnimalCarrierDisclosures(activeAnimal),
    [activeAnimal]
  );

  const activeLineageAnalysis = useMemo(
    () => (activeAnimal ? carrierAnalysisById.get(activeAnimal.id) ?? null : null),
    [activeAnimal, carrierAnalysisById]
  );

  const visibleAnimals = useMemo(
    () => filteredAnimals.slice(0, visibleLimit),
    [filteredAnimals, visibleLimit]
  );

  const filteredIds = filteredAnimals.map((a) => a.id);
  const allShownChecked =
    filteredIds.length > 0 && filteredIds.every((id) => checkedIds.includes(id));

  const toggleChecked = (id: string) => {
    setConfirmBatchDelete(false);
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllShown = () => {
    setConfirmBatchDelete(false);
    if (allShownChecked) {
      const shownSet = new Set(filteredIds);
      setCheckedIds((prev) => prev.filter((id) => !shownSet.has(id)));
    } else {
      setCheckedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const resetLogFields = () => {
    setLogType('Weight Check');
    setLogDateIso(todayDateIso());
    setLogTitle('');
    setLogWeightInput('');
    setLogShowLeg(false);
    setLogNotes('');
    setLogMedicationName('');
    setLogDosage('');
    setLogAdministrationRoute('');
    setLogWithdrawalDays('');
    setLogBodyConditionScore('');
    setLogFamachaScore('');
    setLogFecalEggCount('');
    setLogUltrasoundResult('');
    setLogUltrasoundFetalCount('');
  };

  useEffect(() => {
    setShowLogForm(false);
    resetLogFields();
  }, [speciesProfile.id, selectedAnimalId]);

  const safeNonNegNumber = (raw: string, roundInt = false, max = Number.MAX_SAFE_INTEGER): number => {
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) return 0;
    const bounded = Math.min(max, num);
    return roundInt ? Math.round(bounded) : bounded;
  };

  const submitCareLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAnimal) return;
    const effectiveDate = logDateIso || todayDateIso();
    const withdrawalDays =
      logType === 'Health / Vet' ? safeNonNegNumber(logWithdrawalDays, true, 3650) : 0;
    const withdrawalClearDateIso =
      withdrawalDays > 0 ? addDaysIso(effectiveDate, withdrawalDays) : '';
    const isHealthScore = logType === 'Health Score / BCS';
    const isScan = logType === 'Ultrasound' || logType === 'Palpation';
    const parsedWeight = parseWeightInputToGrams(logWeightInput, effectiveWeightUnit);

    onAddCareLog({
      species: speciesProfile.name,
      animalId: activeAnimal.id,
      dateIso: effectiveDate,
      type: logType,
      title: logTitle.trim() || logType,
      weightGrams: Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : 0,
      showLegEarned: logShowLeg,
      medicationName: logType === 'Health / Vet' ? logMedicationName.trim() : '',
      dosage: logType === 'Health / Vet' ? logDosage.trim() : '',
      administrationRoute: logType === 'Health / Vet' ? logAdministrationRoute.trim() : '',
      withdrawalDays,
      withdrawalClearDateIso,
      bodyConditionScore: isHealthScore ? safeNonNegNumber(logBodyConditionScore, false, 20) : 0,
      famachaScore: isHealthScore ? safeNonNegNumber(logFamachaScore, true, 5) : 0,
      fecalEggCount: isHealthScore ? safeNonNegNumber(logFecalEggCount, true, 1_000_000) : 0,
      ultrasoundResult: isScan ? logUltrasoundResult : '',
      ultrasoundFetalCount: isScan ? safeNonNegNumber(logUltrasoundFetalCount, true, 100) : 0,
      notes: logNotes.trim(),
    });
    resetLogFields();
    setShowLogForm(false);
  };

  const openFormalPedigreePreview = (subject: Animal) => {
    const primaryPhoto = settings.includePhotoOnPedigree
      ? primaryPhotoByAnimalId.get(subject.id)?.dataUrl
      : undefined;
    setPreviewDoc({
      title: `Formal Pedigree (.HTM / PDF) — ${subject.name}`,
      filename: `pedigree-${subject.tattoo || subject.id}.htm`,
      isPedigree: true,
      pedigreeSubject: subject,
      html: generateEvansHtmPedigree(
        subject,
        allAnimals,
        speciesProfiles,
        settings,
        settings.defaultGenerations,
        primaryPhoto,
        pedigreePrintOptions
      ),
    });
  };

  return (
    <div className="space-y-5">
      {/* Dedicated Single Animal Profile View */}
      {activeAnimal ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onSelectAnimal(null)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Back to {speciesProfile.name} Herd
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onArchiveAnimals([activeAnimal.id], !isAnimalArchived(activeAnimal))}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap ${
                  isAnimalArchived(activeAnimal)
                    ? 'border-[var(--barn-sage)] text-[var(--barn-sage)] bg-[var(--barn-sage-tint)]'
                    : 'border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)]'
                }`}
              >
                {isAnimalArchived(activeAnimal) ? (
                  <>
                    <ArchiveRestore className="w-3.5 h-3.5" aria-hidden="true" />
                    Restore to Active Herd
                  </>
                ) : (
                  <>
                    <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                    Move to Archived
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  setMigrationModalState({ mode: 'single', animalIds: [activeAnimal.id] })
                }
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
                Move Species
              </button>
            </div>
          </div>

          {doesAnimalNeedAttention(activeAnimal) && (
            <div className="bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <AlertCircle
                  className="w-5 h-5 text-[var(--barn-terracotta)] mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    This {speciesProfile.name.toLowerCase()} record is marked Needs Attention
                  </div>
                  <p className="text-[var(--barn-muted)]">
                    Complete any missing details ({idLabels.shortLabel.toLowerCase()}, breed, pedigree, or owner), then resolve
                    to clear the Home &amp; Hub reminders.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditingAnimal(activeAnimal);
                    setShowAnimalModal(true);
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                  Edit Details
                </button>
                <button
                  type="button"
                  onClick={() => onSaveAnimal({ ...activeAnimal, needsAttention: false })}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Mark Attention Resolved
                </button>
              </div>
            </div>
          )}

          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-6">
            {/* Header & Cage-Side Print/Tree Actions */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-[var(--barn-border)] pb-5">
              <div className="space-y-1">
                <div className="text-xs text-[var(--barn-muted)] font-mono">
                  {activeAnimal.tattoo || 'UNMARKED'} · {activeAnimal.species} ·{' '}
                  {activeAnimal.status}
                  {normalizeOwnershipType(activeAnimal.ownershipType) !== 'Owned'
                    ? ` · ${normalizeOwnershipType(activeAnimal.ownershipType)}`
                    : ''}
                  {activeAnimal.culled ? ' · Flagged for Cull' : ''}
                  {isAnimalArchived(activeAnimal) ? ' · Archived (Pedigree Retained)' : ''}
                  {activeAnimal.cageLocation ? ` · ${activeAnimal.cageLocation}` : ''}
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-semibold">
                  {activeAnimal.name}
                </h2>
                <p className="text-sm text-[var(--barn-muted)]">
                  {formatSexForSpecies(activeAnimal.sex, speciesProfile)} · {activeAnimal.breed}{' '}
                  {activeAnimal.variety} · DOB {formatReadableDate(activeAnimal.birthDateIso)}
                </p>
                {(activeAnimal.culled ||
                  activeAnimal.status === 'Sold' ||
                  activeAnimal.status === 'Deceased') && (
                  <p className="text-xs text-[var(--barn-muted)] font-mono tabular-nums pt-0.5">
                    {[
                      activeAnimal.culled
                        ? `Cull Flag${activeAnimal.cullDateIso ? ` (${formatReadableDate(activeAnimal.cullDateIso)})` : ''}${activeAnimal.cullReason ? `: ${activeAnimal.cullReason}` : ''}`
                        : '',
                      activeAnimal.status === 'Sold' &&
                      (activeAnimal.soldDateIso ||
                        (activeAnimal.salePriceCents ?? 0) > 0 ||
                        activeAnimal.buyerName)
                        ? `Sold${activeAnimal.soldDateIso ? ` ${formatReadableDate(activeAnimal.soldDateIso)}` : ''}${(activeAnimal.salePriceCents ?? 0) > 0 ? ` · ${formatCurrencyCents(activeAnimal.salePriceCents, settings.currencyCode)}` : ''}${activeAnimal.buyerName ? ` · Buyer: ${activeAnimal.buyerName}` : ''}`
                        : '',
                      activeAnimal.status === 'Deceased' &&
                      (activeAnimal.deceasedDateIso || activeAnimal.deathCause)
                        ? `Deceased${activeAnimal.deceasedDateIso ? ` ${formatReadableDate(activeAnimal.deceasedDateIso)}` : ''}${activeAnimal.deathCause ? ` · Cause: ${activeAnimal.deathCause}` : ''}`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>

              <div className="space-y-2 shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenPedigreeForAnimal(activeAnimal.id)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <GitFork className="w-3.5 h-3.5" aria-hidden="true" />
                    Pedigree Tree
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewDoc({
                        title: `Cage Card — ${activeAnimal.name}`,
                        filename: `cage-card-${activeAnimal.tattoo || activeAnimal.id}.htm`,
                        html: generateThermalCageCardHtml(
                          activeAnimal,
                          allAnimals,
                          speciesProfiles,
                          settings
                        ),
                      })
                    }
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                    Cage Card
                  </button>
                  <button
                    type="button"
                    onClick={() => openFormalPedigreePreview(activeAnimal)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                    .HTM / PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAnimal(activeAnimal);
                      setShowAnimalModal(true);
                    }}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                    Edit
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <PedigreePrintNotice compact />
                  {primaryPhotoByAnimalId.has(activeAnimal.id) && (
                    <label className="flex items-center gap-2 text-xs text-[var(--barn-muted)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(settings.includePhotoOnPedigree)}
                        onChange={(e) => onToggleIncludePhotoOnPedigree(e.target.checked)}
                      />
                      <span>Print primary photo on .HTM / PDF pedigree</span>
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Key Metrics Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs border-b border-[var(--barn-border)] pb-5">
              <div>
                <div className="text-[var(--barn-muted)]">Weight</div>
                <div className="font-mono text-sm font-semibold tabular-nums mt-0.5">
                  {formatWeight(activeAnimal.weightGrams, effectiveWeightUnit)}
                </div>
              </div>
              <div>
                <div className="text-[var(--barn-muted)]">Wright COI</div>
                {(() => {
                  const activeCoi = coiByAnimalId.get(activeAnimal.id);
                  const comp = activeCoi ? getPedigreeCompletenessSummary(activeCoi) : null;
                  return (
                    <div className="mt-0.5">
                      <div className="font-mono text-sm font-semibold tabular-nums">
                        {(activeCoi?.coiPercent ?? 0).toFixed(2)}% (
                        {activeCoi?.risk.label || 'Outcross'})
                      </div>
                      {comp && (
                        <div className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                          {comp.known3Gen}/{comp.max3Gen} 3-gen ({comp.percent3Gen}%)
                          {comp.isIncompleteZeroOutcross ? ' · incomplete pedigree' : ''}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div>
                <div className="text-[var(--barn-muted)]">Registration / GC</div>
                <div className="font-mono text-sm font-semibold mt-0.5 truncate">
                  {activeAnimal.registrationNumber || 'Unregistered'}
                  {activeAnimal.grandChampionNumber
                    ? ` · ${activeAnimal.grandChampionNumber}`
                    : ''}
                </div>
              </div>
              <div>
                <div className="text-[var(--barn-muted)]">Show Legs</div>
                <div className="font-mono text-sm font-semibold tabular-nums mt-0.5">
                  {activeAnimal.legsCount}
                </div>
              </div>
            </div>

            {/* Multi-Photo Optimized Animal Gallery */}
            <AnimalPhotoGallery
              animal={activeAnimal}
              photos={photosByAnimalId.get(activeAnimal.id) || []}
              optimizationPresetId={settings.imageOptimizationPreset}
              onAddPhotos={async (payloads) => {
                await onAddAnimalPhotos(activeAnimal, payloads);
              }}
              onSetPrimary={(photoId) => onSetPrimaryAnimalPhoto(activeAnimal.id, photoId)}
              onUpdateCaption={(photoId, caption) =>
                onUpdateAnimalPhotoCaption(photoId, caption)
              }
              onDeletePhoto={(photoId) => onDeleteAnimalPhoto(photoId)}
            />

            {/* Direct Lineage Links (Sire, Dam, Offspring) */}
            <div className="space-y-3 border-b border-[var(--barn-border)] pb-5">
              <h3 className="text-sm font-semibold">Direct Lineage</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {(['sireId', 'damId'] as const).map((field) => {
                  const isSire = field === 'sireId';
                  const parent = activeAnimal[field] ? herdById.get(activeAnimal[field]) : null;
                  return (
                    <div
                      key={field}
                      className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-[var(--barn-muted)]">
                          {isSire
                            ? `Sire (${speciesProfile.maleLabel})`
                            : `Dam (${speciesProfile.femaleLabel})`}
                        </div>
                        {parent ? (
                          <button
                            type="button"
                            onClick={() => onSelectAnimal(parent.id)}
                            className="font-medium text-sm underline hover:text-[var(--barn-sage)] truncate block mt-0.5"
                          >
                            {parent.name} ({parent.tattoo || 'No ID'})
                            {isAnimalArchived(parent) ? ' [Archived]' : ''}
                          </button>
                        ) : (
                          <div className="text-sm text-[var(--barn-muted)] italic mt-0.5">
                            Unknown / Foundation
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {offspring.length > 0 && (
                <div className="text-xs text-[var(--barn-muted)] pt-1">
                  Recorded {speciesProfile.offspringLabel}s ({offspring.length}):{' '}
                  {offspring.map((kid, idx) => (
                    <React.Fragment key={kid.id}>
                      {idx > 0 && ' · '}
                      <button
                        type="button"
                        onClick={() => onSelectAnimal(kid.id)}
                        className="underline text-[var(--barn-ink)] hover:text-[var(--barn-sage)]"
                      >
                        {kid.name} ({kid.tattoo})
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>

            {/* Coat Color Genotype, Carrier Disclosures & Allele Inference Panel */}
            {(activeAnimal.genotypeRaw ||
              activeAnimal.genotype.length > 0 ||
              speciesGeneticsSpec ||
              activeAnimal.rufusLevel ||
              activeCarriers.hasAny ||
              Boolean(activeLineageAnalysis?.hasAnyLineagePotential) ||
              (activeLineageAnalysis?.genotypeCleared.length ?? 0) > 0 ||
              (activeLineageAnalysis?.blockedBranches.length ?? 0) > 0) && (
              <div className="space-y-3 border-b border-[var(--barn-border)] pb-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">
                      Genetics, Carrier Disclosures &amp; Allele Inference
                    </h3>
                    <ColorGeneticsNotice compact />
                  </div>
                  {alleleInference && alleleInference.notes.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        onSaveAnimal({
                          ...activeAnimal,
                          genotype: alleleInference.updatedPairs,
                          genotypeRaw: alleleInference.formatted,
                        })
                      }
                      className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold whitespace-nowrap"
                    >
                      Save Inferred Alleles ({alleleInference.notes.length})
                    </button>
                  )}
                </div>

                {(activeAnimal.genotypeRaw ||
                  activeAnimal.genotype.length > 0 ||
                  speciesGeneticsSpec ||
                  activeAnimal.rufusLevel) && (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm">
                    <span className="font-mono">
                      {activeAnimal.genotypeRaw ||
                        formatGenotypeArray(activeAnimal.genotype) ||
                        'No loci entered yet'}
                    </span>
                    {activeAnimal.rufusLevel && (
                      <span className="text-xs font-medium text-[var(--barn-terracotta)]">
                        Rufus Intensity: {activeAnimal.rufusLevel}
                      </span>
                    )}
                  </div>
                )}

                {(activeCarriers.hasAny || (activeLineageAnalysis?.genotypeCleared.length ?? 0) > 0) && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                      <div className="text-[var(--barn-muted)] font-medium">Confirmed Carrier Of</div>
                      <div className="mt-1 font-medium text-[var(--barn-ink)]">
                        {activeCarriers.confirmed.length > 0
                          ? activeCarriers.confirmed.join(', ')
                          : 'None recorded'}
                      </div>
                    </div>
                    <div className="px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                      <div className="text-[var(--barn-muted)] font-medium">Suspected Carrier Of</div>
                      <div className="mt-1 font-medium text-[var(--barn-terracotta)]">
                        {activeCarriers.suspected.length > 0
                          ? activeCarriers.suspected.join(', ')
                          : 'None recorded'}
                      </div>
                    </div>
                    <div className="px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                      <div className="text-[var(--barn-muted)] font-medium">
                        Cleared / Verified Non-Carrier
                      </div>
                      <div className="mt-1 font-medium text-[var(--barn-sage)]">
                        {activeCarriers.cleared.length > 0 ||
                        (activeLineageAnalysis?.genotypeCleared.length ?? 0) > 0
                          ? [
                              ...activeCarriers.cleared.map(
                                (c) => `${c.trait} (${formatClearedProofBadge(c)})`
                              ),
                              ...(activeLineageAnalysis?.genotypeCleared || []).map(
                                (g) => `${g.trait} (${g.pair})`
                              ),
                            ].join(', ')
                          : 'None recorded'}
                      </div>
                    </div>
                  </div>
                )}

                {activeLineageAnalysis && activeLineageAnalysis.lineagePotential.length > 0 && (
                  <div className="px-3 py-2.5 rounded-xl bg-[var(--barn-terracotta-tint)]/60 border border-[var(--barn-terracotta)]/70 text-xs space-y-1">
                    <div className="font-semibold text-[var(--barn-ink)]">
                      Lineage Potential Carriers (Inherited from Uncleared Pedigree Branches)
                    </div>
                    {activeLineageAnalysis.lineagePotential.map((lp) => (
                      <div key={lp.trait} className="text-[var(--barn-ink)]">
                        <span className="font-medium">{lp.trait}</span>{' '}
                        <span className="text-[var(--barn-muted)]">
                          via {lp.viaBranches.join(' & ')} line (
                          {lp.sourceAncestors
                            .slice(0, 2)
                            .map((s) => `${s.name} [Gen ${s.generation}, ${s.status}]`)
                            .join(', ')}
                          )
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {activeLineageAnalysis && activeLineageAnalysis.blockedBranches.length > 0 && (
                  <div className="px-3 py-2 rounded-xl bg-[var(--barn-sage-tint)]/60 border border-[var(--barn-sage)]/70 text-xs space-y-0.5">
                    <div className="font-medium text-[var(--barn-ink)]">
                      Cleared Pedigree Branch Firewalls Active
                    </div>
                    {activeLineageAnalysis.blockedBranches.map((blk, i) => (
                      <div
                        key={`${blk.branch}-${blk.trait}-${i}`}
                        className="text-[11px] text-[var(--barn-muted)]"
                      >
                        {blk.trait} on {blk.branch} line stopped by{' '}
                        <strong className="text-[var(--barn-ink)]">{blk.clearedByName}</strong> (
                        {blk.proofLabel})
                      </div>
                    ))}
                  </div>
                )}

                {alleleInference && alleleInference.notes.length > 0 && (
                  <div className="space-y-1 text-xs text-[var(--barn-sage)]">
                    {alleleInference.notes.map((n, i) => {
                      const locusDef = speciesGeneticsSpec?.loci.find((l) => l.locus === n.locus);
                      return (
                        <div key={i}>
                          Inferred {locusDef ? `${locusDef.name} (${n.locus})` : n.locus}:{' '}
                          <span className="font-mono">{n.before}</span> →{' '}
                          <span className="font-mono font-semibold">{n.after}</span> — {n.reason}
                        </div>
                      );
                    })}
                  </div>
                )}

                {alleleInference && alleleInference.conflicts.length > 0 && (
                  <div className="space-y-1 text-xs text-[var(--barn-danger)] font-medium">
                    {alleleInference.conflicts.map((c, i) => (
                      <div key={i}>Genetic Conflict: {c}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Weight Sparkline & Cage-Side Care / Show Leg Journal */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">
                    Weights, Show Legs &amp; Care Journal ({activeAnimalLogs.length})
                  </h3>
                  <p className="text-xs text-[var(--barn-muted)]">
                    Logging a weight or show leg updates {activeAnimal.name}&apos;s record
                    automatically
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowLogForm((v) => !v)}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  Log Weight / Care
                </button>
              </div>

              {weightPoints.length >= 2 && (
                <WeightTrendSvg points={weightPoints} unit={effectiveWeightUnit} />
              )}

              {showLogForm && (
                <form
                  onSubmit={submitCareLog}
                  className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3 text-xs"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <select
                      value={logType}
                      onChange={(e) => setLogType(e.target.value as CareLogType)}
                      className="min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]"
                    >
                      {CARE_LOG_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={logDateIso}
                      onChange={(e) => setLogDateIso(e.target.value)}
                      className="min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={`Weight (${weightMeta.shortUnit})`}
                      value={logWeightInput}
                      onChange={(e) => setLogWeightInput(e.target.value)}
                      className="min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono tabular-nums"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      placeholder="Short summary (e.g. 12-week cage weight)"
                      value={logTitle}
                      onChange={(e) => setLogTitle(e.target.value)}
                      className="min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]"
                    />
                    <label className="flex items-center gap-2 px-2">
                      <input
                        type="checkbox"
                        checked={logShowLeg}
                        onChange={(e) => setLogShowLeg(e.target.checked)}
                      />
                      <span>Earned Official Show Leg (+1 leg)</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    placeholder="Optional notes"
                    value={logNotes}
                    onChange={(e) => setLogNotes(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]"
                  />

                  {logType === 'Health / Vet' && (
                    <div className="p-3 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-2">
                      <div className="font-semibold text-[var(--barn-ink)]">
                        Medication &amp; Withdrawal Details
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <input
                          type="text"
                          placeholder="Medication / vaccine name"
                          value={logMedicationName}
                          onChange={(e) => setLogMedicationName(e.target.value)}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                        />
                        <input
                          type="text"
                          placeholder="Dosage (e.g. 0.5 mL)"
                          value={logDosage}
                          onChange={(e) => setLogDosage(e.target.value)}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                        />
                        <div>
                          <input
                            type="text"
                            list="care-admin-route-suggestions"
                            placeholder="Route (e.g. Oral, SubQ)"
                            value={logAdministrationRoute}
                            onChange={(e) => setLogAdministrationRoute(e.target.value)}
                            className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                          />
                          <datalist id="care-admin-route-suggestions">
                            <option value="Oral" />
                            <option value="SubQ" />
                            <option value="IM" />
                            <option value="Topical" />
                            <option value="Ear / Drops" />
                          </datalist>
                        </div>
                        <input
                          type="number"
                          min="0"
                          max="365"
                          placeholder="Withdrawal days"
                          value={logWithdrawalDays}
                          onChange={(e) => setLogWithdrawalDays(e.target.value)}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                        />
                      </div>
                      {(Number(logWithdrawalDays) || 0) > 0 && (logDateIso || todayDateIso()) && (
                        <div className="text-[11px] font-mono text-[var(--barn-terracotta)]">
                          Withdrawal clears:{' '}
                          {formatReadableDate(
                            addDaysIso(
                              logDateIso || todayDateIso(),
                              Math.round(Number(logWithdrawalDays) || 0)
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {logType === 'Health Score / BCS' && (
                    <div className="p-3 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-2">
                      <div className="font-semibold text-[var(--barn-ink)]">
                        Body Condition &amp; Parasite Scores
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="9"
                          placeholder="BCS (e.g. 1–5 or 1–9)"
                          value={logBodyConditionScore}
                          onChange={(e) => setLogBodyConditionScore(e.target.value)}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                        />
                        <input
                          type="number"
                          step="1"
                          min="0"
                          max="5"
                          placeholder="FAMACHA eye score (1–5)"
                          value={logFamachaScore}
                          onChange={(e) => setLogFamachaScore(e.target.value)}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                        />
                        <input
                          type="number"
                          step="1"
                          min="0"
                          placeholder="Fecal Egg Count (EPG)"
                          value={logFecalEggCount}
                          onChange={(e) => setLogFecalEggCount(e.target.value)}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                        />
                      </div>
                    </div>
                  )}

                  {(logType === 'Ultrasound' || logType === 'Palpation') && (
                    <div className="p-3 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-2">
                      <div className="font-semibold text-[var(--barn-ink)]">
                        {logType === 'Ultrasound' ? 'Ultrasound Scan Result' : 'Palpation Finding'}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <select
                          aria-label="Scan or palpation result"
                          value={logUltrasoundResult}
                          onChange={(e) =>
                            setLogUltrasoundResult(e.target.value as UltrasoundResult)
                          }
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                        >
                          {ULTRASOUND_RESULTS.map((opt) => (
                            <option key={opt.value || 'none'} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="0"
                          max="30"
                          placeholder="Estimated offspring count (optional)"
                          value={logUltrasoundFetalCount}
                          onChange={(e) => setLogUltrasoundFetalCount(e.target.value)}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        resetLogFields();
                        setShowLogForm(false);
                      }}
                      className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="min-h-[34px] px-4 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold"
                    >
                      Save Entry
                    </button>
                  </div>
                </form>
              )}

              {activeAnimalLogs.length === 0 ? (
                <p className="text-xs text-[var(--barn-muted)]">No care or weight entries yet.</p>
              ) : (
                <div className="divide-y divide-[var(--barn-border)]">
                  {activeAnimalLogs.map((log) => {
                    const extraDetails = [
                      log.medicationName
                        ? `${log.medicationName}${log.dosage ? ` (${log.dosage})` : ''}${log.administrationRoute ? ` via ${log.administrationRoute}` : ''}`
                        : '',
                      (log.withdrawalDays ?? 0) > 0
                        ? `Withdrawal ${log.withdrawalDays}d${log.withdrawalClearDateIso ? ` (clears ${formatReadableDate(log.withdrawalClearDateIso)})` : ''}`
                        : '',
                      (log.bodyConditionScore ?? 0) > 0 ? `BCS ${log.bodyConditionScore}` : '',
                      (log.famachaScore ?? 0) > 0 ? `FAMACHA ${log.famachaScore}` : '',
                      (log.fecalEggCount ?? 0) > 0 ? `FEC ${log.fecalEggCount} EPG` : '',
                      log.ultrasoundResult
                        ? `Scan: ${log.ultrasoundResult}${(log.ultrasoundFetalCount ?? 0) > 0 ? ` (est. ${log.ultrasoundFetalCount})` : ''}`
                        : '',
                      log.notes || '',
                    ]
                      .filter(Boolean)
                      .join(' · ');

                    return (
                      <div
                        key={log.id}
                        className="flex items-center justify-between gap-2 py-2.5 text-xs"
                      >
                        <div>
                          <div className="font-medium">
                            {log.title || log.type}
                            {log.weightGrams > 0 && (
                              <span className="font-mono tabular-nums text-[var(--barn-sage)] ml-2">
                                {formatWeight(log.weightGrams, effectiveWeightUnit)}
                              </span>
                            )}
                            {log.showLegEarned && (
                              <span className="text-[var(--barn-terracotta)] ml-2 font-semibold">
                                +1 Leg
                              </span>
                            )}
                          </div>
                          <div className="text-[var(--barn-muted)]">
                            {formatReadableDate(log.dateIso)} · {log.type}
                            {extraDetails ? ` · ${extraDetails}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteCareLog(log.id)}
                          aria-label="Delete care log"
                          className="min-h-[34px] min-w-[34px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {activeAnimal.notes && (
              <div className="border-t border-[var(--barn-border)] pt-4 text-xs text-[var(--barn-muted)]">
                <strong className="text-[var(--barn-ink)]">Notes:</strong> {activeAnimal.notes}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Species-Isolated Herd List View with Multi-Select */
        <>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search
                  className="w-4 h-4 text-[var(--barn-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  aria-label={`Search ${speciesProfile.name} by name, ID, or tag`}
                  placeholder={`Search by name, ID, ${idLabels.shortLabel.toLowerCase()}, breed, variety, or cage...`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full min-h-[42px] pl-10 pr-9 py-2 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-sm"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Clear herd search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[30px] min-w-[30px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] overflow-x-auto">
                {(
                  [
                    ['all', `All (${animals.length})`],
                    ['Male', `${speciesProfile.maleLabel}s (${maleCount})`],
                    ['Female', `${speciesProfile.femaleLabel}s (${femaleCount})`],
                    ['Junior', `Juniors (${juniorCount})`],
                    ['Active', `Active (${activeCount})`],
                    ['Archived', `Archived (${archivedCount})`],
                    ...(needsAttentionCount > 0 || filterKey === 'NeedsAttention'
                      ? ([['NeedsAttention', `Needs Attention (${needsAttentionCount})`]] as const)
                      : []),
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilterKey(key)}
                    className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                      filterKey === key
                        ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                        : key === 'NeedsAttention'
                        ? 'text-[var(--barn-terracotta)] hover:bg-[var(--barn-terracotta-tint)]'
                        : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setEditingAnimal(null);
                setShowAnimalModal(true);
              }}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Add {speciesProfile.name}
            </button>
          </div>

          {/* Carrier Trait Screening & Finder Strip */}
          <div className="flex flex-wrap items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs">
            <span className="font-medium text-[var(--barn-muted)] shrink-0">
              Carrier Finder:
            </span>
            <select
              aria-label="Carrier disclosure filter mode"
              value={carrierFilterMode}
              onChange={(e) => setCarrierFilterMode(e.target.value as HerdCarrierFilterMode)}
              className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
            >
              <option value="all">All Carrier States</option>
              <option value="any_risk">Any Risk (Confirmed, Suspected, or Lineage)</option>
              <option value="confirmed">Confirmed Carriers Only</option>
              <option value="suspected">Suspected Carriers Only</option>
              <option value="lineage_potential">Lineage Potential Only</option>
              <option value="cleared">Cleared / Homozygous Non-Carrier</option>
            </select>
            <input
              type="search"
              list="herd-carrier-trait-list"
              aria-label="Filter by carrier trait"
              placeholder="Filter specific trait (e.g. Dilute, ww, cc)..."
              value={carrierTraitQuery}
              onChange={(e) => setCarrierTraitQuery(e.target.value)}
              className="flex-1 min-w-[200px] max-w-xs min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
            />
            <datalist id="herd-carrier-trait-list">
              {carrierSuggestions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            {(carrierFilterMode !== 'all' || carrierTraitQuery.trim()) && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="font-mono tabular-nums text-[var(--barn-muted)]">
                  {filteredAnimals.length} matching
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCarrierFilterMode('all');
                    setCarrierTraitQuery('');
                  }}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs"
                >
                  Clear Filter
                </button>
              </div>
            )}
          </div>

          {/* Multi-Select Bulk Action Bar */}
          {checkedIds.length > 0 && (
            <div className="bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] rounded-2xl px-4 py-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-semibold font-mono tabular-nums">
                  {checkedIds.length} {speciesProfile.name}
                  {checkedIds.length === 1 ? '' : 's'} selected
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onArchiveAnimals(checkedIds, true);
                      setCheckedIds([]);
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                    Move to Archived
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onArchiveAnimals(checkedIds, false);
                      setCheckedIds([]);
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" aria-hidden="true" />
                    Restore to Active
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setMigrationModalState({ mode: 'multi-select', animalIds: checkedIds })
                    }
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
                    Move to Species
                  </button>

                  {confirmBatchDelete ? (
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteAnimalsBatch(checkedIds);
                          setCheckedIds([]);
                          setConfirmBatchDelete(false);
                        }}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-xs font-semibold whitespace-nowrap"
                      >
                        Confirm Delete ({checkedIds.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmBatchDelete(false)}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmBatchDelete(true)}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Delete Selected
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setCheckedIds([]);
                      setConfirmBatchDelete(false);
                    }}
                    className="min-h-[36px] px-2.5 py-1.5 text-xs underline text-[var(--barn-muted)]"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Herd List Card */}
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl overflow-hidden">
            {filteredAnimals.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm text-[var(--barn-muted)]">
                  No {speciesProfile.name.toLowerCase()} records match this filter.
                </p>
                {animals.length > 0 && query.trim() && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="min-h-[38px] px-4 py-1.5 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium"
                  >
                    Clear Search &ldquo;{query.trim()}&rdquo;
                  </button>
                )}
                {animals.length === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAnimal(null);
                      setShowAnimalModal(true);
                    }}
                    className="min-h-[40px] px-4 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold"
                  >
                    Register First {speciesProfile.name}
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="px-4 py-2.5 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/50 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--barn-muted)]">
                  <label className="inline-flex items-center gap-2.5 cursor-pointer font-medium text-[var(--barn-ink)]">
                    <input
                      type="checkbox"
                      checked={allShownChecked}
                      onChange={toggleSelectAllShown}
                      className="w-4 h-4 accent-[var(--barn-sage)]"
                    />
                    <span>Select All Shown ({filteredAnimals.length})</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <span>Tap any animal row to open its full page</span>
                  </div>
                </div>

                <div className="divide-y divide-[var(--barn-border)]">
                  {visibleAnimals.map((a) => {
                    const isChecked = checkedIds.includes(a.id);
                    const isArch = isAnimalArchived(a);
                    const coi = coiByAnimalId.get(a.id);
                    const coverPhoto = primaryPhotoByAnimalId.get(a.id);
                    const photoCount = photosByAnimalId.get(a.id)?.length || 0;
                    const sexColor =
                      a.sex === 'Male'
                        ? 'text-[var(--barn-slate)]'
                        : a.sex === 'Female'
                        ? 'text-[var(--barn-terracotta)]'
                        : 'text-[var(--barn-muted)]';

                    return (
                      <div
                        key={a.id}
                        className={`flex items-center gap-2 px-4 py-3 transition-colors ${
                          isChecked
                            ? 'bg-[var(--barn-sage-tint)]/60'
                            : 'hover:bg-[var(--barn-subtle)]/40'
                        }`}
                      >
                        <label
                          className="min-h-[40px] min-w-[36px] flex items-center justify-center cursor-pointer shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleChecked(a.id)}
                            aria-label={`Select ${a.name}`}
                            className="w-4 h-4 accent-[var(--barn-sage)]"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => onSelectAnimal(a.id)}
                          className="flex-1 text-left flex items-center justify-between gap-3 min-w-0"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="relative w-10 h-10 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] overflow-hidden flex items-center justify-center shrink-0">
                              {coverPhoto ? (
                                <img
                                  src={coverPhoto.thumbnailDataUrl || coverPhoto.dataUrl}
                                  alt={a.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className={`font-display text-sm font-semibold ${sexColor}`}>
                                  {(a.name || '?').charAt(0).toUpperCase()}
                                </span>
                              )}
                              {photoCount > 1 && (
                                <span className="absolute bottom-0 right-0 px-1 rounded-tl-md bg-black/75 text-white font-mono text-[9px] leading-tight">
                                  {photoCount}
                                </span>
                              )}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm truncate">{a.name}</span>
                                {a.tattoo && (
                                  <span className="font-mono text-xs text-[var(--barn-muted)] shrink-0">
                                    {a.tattoo}
                                  </span>
                                )}
                                {isArch && (
                                  <span className="text-[11px] font-medium text-[var(--barn-muted)] shrink-0">
                                    · Archived
                                  </span>
                                )}
                                {doesAnimalNeedAttention(a) && (
                                  <span className="text-[11px] font-semibold text-[var(--barn-terracotta)] shrink-0">
                                    · Needs Attention
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-[var(--barn-muted)] mt-0.5 truncate">
                                <span className={`font-medium ${sexColor}`}>
                                  {formatSexForSpecies(a.sex, speciesProfile)}
                                </span>{' '}
                                · {a.breed} {a.variety} · {a.status}
                                {normalizeOwnershipType(a.ownershipType) !== 'Owned'
                                  ? ` · ${normalizeOwnershipType(a.ownershipType)}`
                                  : ''}
                                {a.culled ? ' · Flagged Cull' : ''}
                                {a.cageLocation ? ` · ${a.cageLocation}` : ''}
                              </div>
                              {(() => {
                                const rowAnalysis = carrierAnalysisById.get(a.id);
                                const parts: string[] = [];
                                if (a.rufusLevel) parts.push(`Rufus: ${a.rufusLevel}`);
                                if (rowAnalysis?.confirmed.length) {
                                  parts.push(`Conf: ${rowAnalysis.confirmed.join(', ')}`);
                                }
                                if (rowAnalysis?.suspected.length) {
                                  parts.push(`Susp: ${rowAnalysis.suspected.join(', ')}`);
                                }
                                if (rowAnalysis?.lineagePotential.length) {
                                  parts.push(
                                    `Lineage: ${rowAnalysis.lineagePotential
                                      .map((l) => l.trait)
                                      .join(', ')}`
                                  );
                                }
                                if (rowAnalysis?.cleared.length) {
                                  parts.push(
                                    `Cleared: ${rowAnalysis.cleared.map((c) => c.trait).join(', ')}`
                                  );
                                }
                                if (parts.length === 0) return null;
                                return (
                                  <div className="text-[11px] text-[var(--barn-terracotta)] mt-0.5 truncate">
                                    {parts.join(' · ')}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          <div className="text-right shrink-0 font-mono tabular-nums">
                            <div className="text-xs font-medium">
                              {formatWeight(a.weightGrams, effectiveWeightUnit)}
                            </div>
                            <div className="text-[11px] text-[var(--barn-muted)]">
                              COI {(coi?.coiPercent ?? 0).toFixed(1)}% ·{' '}
                              {coi?.knownAncestorsIn3Gen ?? 0}/14
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>

                {filteredAnimals.length > visibleAnimals.length && (
                  <div className="px-4 py-3 border-t border-[var(--barn-border)] bg-[var(--barn-canvas)]/50 flex items-center justify-between gap-3 text-xs">
                    <span className="text-[var(--barn-muted)] font-mono tabular-nums">
                      Showing {visibleAnimals.length} of {filteredAnimals.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setVisibleLimit((n) => n + HERD_PAGE_SIZE)}
                      className="min-h-[36px] px-3.5 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] whitespace-nowrap"
                    >
                      Show More ({Math.min(HERD_PAGE_SIZE, filteredAnimals.length - visibleAnimals.length)})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {showAnimalModal && (
        <AnimalEditorModal
          initialAnimal={editingAnimal}
          speciesProfile={speciesProfile}
          speciesAnimals={animals}
          speciesCages={cages}
          preferredUnit={effectiveWeightUnit}
          currencyCode={settings.currencyCode}
          optimizationPresetId={settings.imageOptimizationPreset}
          defaultBreederName={settings.breederName}
          defaultOwnerName={settings.barnName}
          onSave={onSaveAnimal}
          onDelete={onDeleteAnimal}
          onClose={() => setShowAnimalModal(false)}
        />
      )}

      {migrationModalState && (
        <SpeciesMigrationModal
          snapshot={snapshot}
          sourceSpecies={speciesProfile.name}
          directAnimalIds={migrationModalState.animalIds}
          mode={migrationModalState.mode}
          onConfirmMigrate={async (ids, target, options) => {
            await onMigrateAnimalsSpecies(ids, target, options);
            setCheckedIds([]);
          }}
          onClose={() => setMigrationModalState(null)}
        />
      )}

      {previewDoc && (
        <PrintPreviewModal
          title={previewDoc.title}
          filename={previewDoc.filename}
          htmlContent={
            previewDoc.pedigreeSubject
              ? generateEvansHtmPedigree(
                  previewDoc.pedigreeSubject,
                  allAnimals,
                  speciesProfiles,
                  settings,
                  settings.defaultGenerations,
                  settings.includePhotoOnPedigree
                    ? primaryPhotoByAnimalId.get(previewDoc.pedigreeSubject.id)?.dataUrl
                    : undefined,
                  pedigreePrintOptions
                )
              : previewDoc.html
          }
          includePrimaryPhoto={
            previewDoc.isPedigree ? settings.includePhotoOnPedigree : undefined
          }
          onToggleIncludePrimaryPhoto={
            previewDoc.isPedigree ? onToggleIncludePhotoOnPedigree : undefined
          }
          pedigreePrintOptions={previewDoc.isPedigree ? pedigreePrintOptions : undefined}
          onChangePedigreePrintOptions={
            previewDoc.isPedigree ? setPedigreePrintOptions : undefined
          }
          headerNotice={previewDoc.isPedigree ? <PedigreePrintNotice /> : undefined}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}

function WeightTrendSvg({
  points,
  unit,
}: {
  points: CareLog[];
  unit: BarnSettings['preferredUnit'];
}) {
  const width = 460;
  const height = 84;
  const padX = 14;
  const padY = 14;

  const weights = points.map((p) => p.weightGrams);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const span = Math.max(1, maxW - minW);

  const coords = points.map((p, idx) => {
    const x = padX + (idx / Math.max(1, points.length - 1)) * (width - padX * 2);
    const y = height - padY - ((p.weightGrams - minW) / span) * (height - padY * 2);
    return { x, y, log: p };
  });

  const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ');

  return (
    <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
      <div className="flex justify-between text-[11px] text-[var(--barn-muted)] font-mono tabular-nums mb-1">
        <span>
          Start: {formatWeight(points[0].weightGrams, unit)} ({points[0].dateIso})
        </span>
        <span>
          Latest: {formatWeight(points[points.length - 1].weightGrams, unit)} (
          {points[points.length - 1].dateIso})
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-20 overflow-visible">
        <polyline
          fill="none"
          stroke="var(--barn-sage)"
          strokeWidth="2.2"
          points={polyline}
        />
        {coords.map((c) => (
          <circle key={c.log.id} cx={c.x} cy={c.y} r="3.5" fill="var(--barn-sage)" />
        ))}
      </svg>
    </div>
  );
}
