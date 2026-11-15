/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
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
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRightLeft,
  Edit3,
  FileText,
  GitFork,
  Plus,
  Printer,
  Search,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { formatGenotypeArray, inferHiddenAlleles } from '../core/geneticsEngine';
import { OptimizedImagePayload } from '../core/imageOptimizationSpec';
import {
  Animal,
  BarnSettings,
  CARE_LOG_TYPES,
  CareLog,
  CareLogType,
  formatReadableDate,
  formatSexForSpecies,
  formatWeight,
  isAnimalArchived,
  parseWeightInputToGrams,
  SpeciesProfile,
  todayDateIso,
} from '../core/models';
import {
  generateEvansHtmPedigree,
  generateThermalCageCardHtml,
} from '../core/syncAndExports';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import { AnimalEditorModal } from './AnimalEditorModal';
import { AnimalPhotoGallery } from './AnimalPhotoGallery';
import { PrintPreviewModal } from './PrintPreviewModal';

interface HerdScreenProps {
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
  onMigrateAnimalsSpecies: (animalIds: string[], targetSpecies: string) => void;
  onToggleIncludePhotoOnPedigree: (include: boolean) => void;
  onAddCareLog: (draft: Omit<CareLog, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteCareLog: (id: string) => void;
}

type HerdFilterTab = 'all' | 'Male' | 'Female' | 'Junior' | 'Active' | 'Archived';

export function HerdScreen({
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

  const [query, setQuery] = useState('');
  const [filterKey, setFilterKey] = useState<HerdFilterTab>('all');
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);

  const otherSpecies = useMemo(
    () =>
      speciesProfiles.filter(
        (sp) => sp.name.toLowerCase() !== speciesProfile.name.toLowerCase()
      ),
    [speciesProfiles, speciesProfile.name]
  );
  const [bulkMoveTarget, setBulkMoveTarget] = useState<string>(otherSpecies[0]?.name || '');
  const [singleMoveTarget, setSingleMoveTarget] = useState<string>(otherSpecies[0]?.name || '');

  useEffect(() => {
    setCheckedIds([]);
    setConfirmBatchDelete(false);
    setBulkMoveTarget(otherSpecies[0]?.name || '');
    setSingleMoveTarget(otherSpecies[0]?.name || '');
  }, [speciesProfile.name, otherSpecies]);

  const [editingAnimal, setEditingAnimal] = useState<Animal | null>(null);
  const [showAnimalModal, setShowAnimalModal] = useState(false);

  // Print preview state
  const [previewDoc, setPreviewDoc] = useState<{
    title: string;
    filename: string;
    html: string;
  } | null>(null);

  // Quick Cage-Side Care/Weight Log state
  const [showLogForm, setShowLogForm] = useState(false);
  const [logType, setLogType] = useState<CareLogType>('Weight Check');
  const [logTitle, setLogTitle] = useState('');
  const [logDateIso, setLogDateIso] = useState(todayDateIso());
  const [logWeightInput, setLogWeightInput] = useState('');
  const [logShowLeg, setLogShowLeg] = useState(false);
  const [logNotes, setLogNotes] = useState('');

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

  const filteredAnimals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return animals.filter((a) => {
      const archived = isAnimalArchived(a);
      if (filterKey === 'Male' && a.sex !== 'Male') return false;
      if (filterKey === 'Female' && a.sex !== 'Female') return false;
      if (filterKey === 'Junior' && a.status !== 'Junior') return false;
      if (filterKey === 'Active' && archived) return false;
      if (filterKey === 'Archived' && !archived) return false;

      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.tattoo.toLowerCase().includes(q) ||
        a.breed.toLowerCase().includes(q) ||
        a.variety.toLowerCase().includes(q) ||
        a.cageLocation.toLowerCase().includes(q)
      );
    });
  }, [animals, query, filterKey]);

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
    () => (activeAnimal ? inferHiddenAlleles(activeAnimal, herdById, animals) : null),
    [activeAnimal, herdById, animals]
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

  const submitCareLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAnimal) return;
    onAddCareLog({
      species: speciesProfile.name,
      animalId: activeAnimal.id,
      dateIso: logDateIso || todayDateIso(),
      type: logType,
      title: logTitle.trim() || logType,
      weightGrams: parseWeightInputToGrams(logWeightInput, settings.preferredUnit),
      showLegEarned: logShowLeg,
      notes: logNotes.trim(),
    });
    setLogTitle('');
    setLogWeightInput('');
    setLogShowLeg(false);
    setLogNotes('');
    setShowLogForm(false);
  };

  const openFormalPedigreePreview = (subject: Animal) => {
    const primaryPhoto = settings.includePhotoOnPedigree
      ? primaryPhotoByAnimalId.get(subject.id)?.dataUrl
      : undefined;
    setPreviewDoc({
      title: `Formal Pedigree (.HTM / PDF) — ${subject.name}`,
      filename: `pedigree-${subject.tattoo || subject.id}.htm`,
      html: generateEvansHtmPedigree(
        subject,
        allAnimals,
        speciesProfiles,
        settings,
        settings.defaultGenerations,
        primaryPhoto
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

              {otherSpecies.length > 0 && (
                <div className="inline-flex items-center gap-1.5 bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-xl px-2 py-1">
                  <select
                    aria-label="Target species for move"
                    value={singleMoveTarget}
                    onChange={(e) => setSingleMoveTarget(e.target.value)}
                    className="min-h-[30px] px-1.5 bg-transparent text-xs"
                  >
                    {otherSpecies.map((sp) => (
                      <option key={sp.id} value={sp.name}>
                        {sp.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (singleMoveTarget) {
                        onMigrateAnimalsSpecies([activeAnimal.id], singleMoveTarget);
                      }
                    }}
                    className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <ArrowRightLeft className="w-3 h-3" aria-hidden="true" />
                    Move Species
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-6">
            {/* Header & Cage-Side Print/Tree Actions */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-[var(--barn-border)] pb-5">
              <div className="space-y-1">
                <div className="text-xs text-[var(--barn-muted)] font-mono">
                  {activeAnimal.tattoo || 'UNMARKED'} · {activeAnimal.species} ·{' '}
                  {activeAnimal.status}
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

                {primaryPhotoByAnimalId.has(activeAnimal.id) && (
                  <label className="flex items-center justify-end gap-2 text-xs text-[var(--barn-muted)] cursor-pointer">
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

            {/* Key Metrics Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs border-b border-[var(--barn-border)] pb-5">
              <div>
                <div className="text-[var(--barn-muted)]">Weight</div>
                <div className="font-mono text-sm font-semibold tabular-nums mt-0.5">
                  {formatWeight(activeAnimal.weightGrams, settings.preferredUnit)}
                </div>
              </div>
              <div>
                <div className="text-[var(--barn-muted)]">Wright COI</div>
                <div className="font-mono text-sm font-semibold tabular-nums mt-0.5">
                  {(coiByAnimalId.get(activeAnimal.id)?.coiPercent ?? 0).toFixed(2)}% (
                  {coiByAnimalId.get(activeAnimal.id)?.risk.label || 'Outcross'})
                </div>
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

            {/* Coat Color Genotype & Allele Inference Panel */}
            {(activeAnimal.genotypeRaw ||
              activeAnimal.genotype.length > 0 ||
              activeAnimal.species === 'Rabbit') && (
              <div className="space-y-2.5 border-b border-[var(--barn-border)] pb-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    Coat Color Genotype &amp; Allele Inference
                  </h3>
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

                <div className="font-mono text-sm px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                  {activeAnimal.genotypeRaw ||
                    formatGenotypeArray(activeAnimal.genotype) ||
                    'No loci entered yet'}
                </div>

                {alleleInference && alleleInference.notes.length > 0 && (
                  <div className="space-y-1 text-xs text-[var(--barn-sage)]">
                    {alleleInference.notes.map((n, i) => (
                      <div key={i}>
                        Inferred {n.locus}: <span className="font-mono">{n.before}</span> →{' '}
                        <span className="font-mono font-semibold">{n.after}</span> — {n.reason}
                      </div>
                    ))}
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
                <WeightTrendSvg points={weightPoints} unit={settings.preferredUnit} />
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
                      placeholder={`Weight (${settings.preferredUnit === 'grams' ? 'g' : 'lbs'})`}
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
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowLogForm(false)}
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
                  {activeAnimalLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between gap-2 py-2.5 text-xs"
                    >
                      <div>
                        <div className="font-medium">
                          {log.title || log.type}
                          {log.weightGrams > 0 && (
                            <span className="font-mono tabular-nums text-[var(--barn-sage)] ml-2">
                              {formatWeight(log.weightGrams, settings.preferredUnit)}
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
                          {log.notes ? ` · ${log.notes}` : ''}
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
                  ))}
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
                  type="search"
                  placeholder={`Search ${speciesProfile.name} name, tattoo, cage, variety...`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full min-h-[42px] pl-10 pr-3 py-2 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-sm"
                />
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
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilterKey(key)}
                    className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                      filterKey === key
                        ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
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

                  {otherSpecies.length > 0 && (
                    <div className="inline-flex items-center gap-1.5 bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-xl px-2 py-1">
                      <select
                        aria-label="Target species for selected animals"
                        value={bulkMoveTarget}
                        onChange={(e) => setBulkMoveTarget(e.target.value)}
                        className="min-h-[28px] px-1 bg-transparent text-xs"
                      >
                        {otherSpecies.map((sp) => (
                          <option key={sp.id} value={sp.name}>
                            {sp.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (bulkMoveTarget) {
                            onMigrateAnimalsSpecies(checkedIds, bulkMoveTarget);
                            setCheckedIds([]);
                          }
                        }}
                        className="min-h-[28px] px-2.5 py-0.5 rounded-lg border border-[var(--barn-border)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap"
                      >
                        Move to Species
                      </button>
                    </div>
                  )}

                  {confirmBatchDelete ? (
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteAnimalsBatch(checkedIds);
                          setCheckedIds([]);
                          setConfirmBatchDelete(false);
                        }}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-danger)] text-white text-xs font-semibold whitespace-nowrap"
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
                <div className="px-4 py-2.5 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/50 flex items-center justify-between gap-2 text-xs text-[var(--barn-muted)]">
                  <label className="inline-flex items-center gap-2.5 cursor-pointer font-medium text-[var(--barn-ink)]">
                    <input
                      type="checkbox"
                      checked={allShownChecked}
                      onChange={toggleSelectAllShown}
                      className="w-4 h-4 accent-[var(--barn-sage)]"
                    />
                    <span>Select All Shown ({filteredAnimals.length})</span>
                  </label>
                  <span>Tap any animal row to open its full page</span>
                </div>

                <div className="divide-y divide-[var(--barn-border)]">
                  {filteredAnimals.map((a) => {
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
                              </div>
                              <div className="text-xs text-[var(--barn-muted)] mt-0.5 truncate">
                                <span className={`font-medium ${sexColor}`}>
                                  {formatSexForSpecies(a.sex, speciesProfile)}
                                </span>{' '}
                                · {a.breed} {a.variety} · {a.status}
                                {a.cageLocation ? ` · ${a.cageLocation}` : ''}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0 font-mono tabular-nums">
                            <div className="text-xs font-medium">
                              {formatWeight(a.weightGrams, settings.preferredUnit)}
                            </div>
                            <div className="text-[11px] text-[var(--barn-muted)]">
                              COI {(coi?.coiPercent ?? 0).toFixed(1)}%
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
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
          preferredUnit={settings.preferredUnit}
          optimizationPresetId={settings.imageOptimizationPreset}
          defaultBreederName={settings.breederName}
          defaultOwnerName={settings.barnName}
          onSave={onSaveAnimal}
          onDelete={onDeleteAnimal}
          onClose={() => setShowAnimalModal(false)}
        />
      )}

      {previewDoc && (
        <PrintPreviewModal
          title={previewDoc.title}
          filename={previewDoc.filename}
          htmlContent={previewDoc.html}
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
