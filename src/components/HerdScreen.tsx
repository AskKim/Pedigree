/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Species-Isolated Herd Registry & Animal Detail / Coat Genetics Screen (`Herd`).
 *
 * Strictly displays ONLY animals where `animal.species === activeData.speciesProfile.name`.
 * Includes cage-side search, sex/status filtering, weight trend SVG sparkline, care/leg logs,
 * hidden recessive allele inference (`inferHiddenAlleles`), thermal cage card preview, and
 * Evans-compatible `.HTM` / PDF pedigree generation.
 */

import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRightLeft,
  CheckSquare,
  Edit3,
  FileText,
  GitFork,
  Plus,
  Printer,
  Search,
  Square,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { formatGenotypeArray, inferHiddenAlleles } from '../core/geneticsEngine';
import {
  Animal,
  AnimalPhoto,
  BarnDatabaseSnapshot,
  BarnSettings,
  CARE_LOG_TYPES,
  CareLog,
  CareLogType,
  formatReadableDate,
  formatSexForSpecies,
  formatWeight,
  isAnimalActive,
  isAnimalArchived,
  isSameSpecies,
  parseWeightInputToGrams,
  pluralizeSpeciesLabel,
  SpeciesProfile,
  todayDateIso,
} from '../core/models';
import { OptimizedImagePayload } from '../core/imageOptimizationSpec';
import {
  expandPedigreeFamilyInSpecies,
  SpeciesMigrationOptions,
} from '../core/speciesMigration';
import {
  generateEvansHtmPedigree,
  generateThermalCageCardHtml,
} from '../core/syncAndExports';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import { AnimalEditorModal } from './AnimalEditorModal';
import { AnimalPhotoGallery } from './AnimalPhotoGallery';
import { PrintPreviewModal } from './PrintPreviewModal';
import { SpeciesMigrationModal } from './SpeciesMigrationModal';

const EMPTY_PHOTOS: AnimalPhoto[] = [];

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
  ) => Promise<void> | void;
  onSetPrimaryAnimalPhoto: (animalId: string, photoId: string) => Promise<void> | void;
  onUpdateAnimalPhotoCaption: (photoId: string, caption: string) => Promise<void> | void;
  onDeleteAnimalPhoto: (photoId: string) => Promise<void> | void;
  onDeleteAnimal: (animal: Animal) => void;
  onDeleteAnimalsBatch: (animalIds: string[]) => Promise<void>;
  onSetAnimalsArchiveState: (animalIds: string[], archived: boolean) => Promise<void> | void;
  onMigrateAnimals: (
    animalIds: string[],
    targetSpecies: string,
    options?: SpeciesMigrationOptions
  ) => Promise<void>;
  onAddCareLog: (draft: Omit<CareLog, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteCareLog: (id: string) => void;
}

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
  onDeleteAnimalsBatch,
  onSetAnimalsArchiveState,
  onMigrateAnimals,
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
  const [filterKey, setFilterKey] = useState<
    'activeFemale' | 'activeMale' | 'inactive' | 'activeUnknown'
  >('activeFemale');
  const [editingAnimal, setEditingAnimal] = useState<Animal | null>(null);
  const [showAnimalModal, setShowAnimalModal] = useState(false);

  // Multi-select & Cross-Species Migration state
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [migrationDialog, setMigrationDialog] = useState<{
    directAnimalIds: string[];
    mode: 'single' | 'multi-select' | 'bulk-all';
  } | null>(null);

  const selectedFamilyExpansion = useMemo(
    () =>
      expandPedigreeFamilyInSpecies(
        animals,
        Array.from(selectedIds),
        speciesProfile.name
      ),
    [animals, selectedIds, speciesProfile.name]
  );

  useEffect(() => {
    setMultiSelectMode(false);
    setSelectedIds(new Set());
    setConfirmBatchDelete(false);
    setMigrationDialog(null);
    setFilterKey('activeFemale');
  }, [speciesProfile.name]);

  // Print preview state
  const [previewDoc, setPreviewDoc] = useState<{
    kind: 'cage-card' | 'pedigree';
    animal: Animal;
    includePrimaryPhoto: boolean;
  } | null>(null);

  // Quick Cage-Side Care/Weight Log state
  const [showLogForm, setShowLogForm] = useState(false);
  const [logType, setLogType] = useState<CareLogType>('Weight Check');
  const [logTitle, setLogTitle] = useState('');
  const [logDateIso, setLogDateIso] = useState(todayDateIso());
  const [logWeightInput, setLogWeightInput] = useState('');
  const [logShowLeg, setLogShowLeg] = useState(false);
  const [logNotes, setLogNotes] = useState('');

  const herdTabCounts = useMemo(() => {
    let activeFemale = 0;
    let activeMale = 0;
    let activeUnknown = 0;
    let inactive = 0;
    for (const a of animals) {
      if (isAnimalArchived(a)) {
        inactive++;
      } else if (a.sex === 'Female') {
        activeFemale++;
      } else if (a.sex === 'Male') {
        activeMale++;
      } else {
        activeUnknown++;
      }
    }
    return { activeFemale, activeMale, activeUnknown, inactive };
  }, [animals]);

  const filteredAnimals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return animals.filter((a) => {
      if (filterKey === 'activeFemale' && !(isAnimalActive(a) && a.sex === 'Female')) {
        return false;
      }
      if (filterKey === 'activeMale' && !(isAnimalActive(a) && a.sex === 'Male')) {
        return false;
      }
      if (filterKey === 'activeUnknown' && !(isAnimalActive(a) && a.sex === 'Unknown')) {
        return false;
      }
      if (filterKey === 'inactive' && !isAnimalArchived(a)) {
        return false;
      }

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

  const activeAnimal = useMemo(() => {
    if (selectedAnimalId && herdById.has(selectedAnimalId)) {
      return herdById.get(selectedAnimalId)!;
    }
    return null;
  }, [selectedAnimalId, herdById]);

  const selectedActiveCount = useMemo(() => {
    let count = 0;
    for (const id of selectedIds) {
      const found = herdById.get(id);
      if (found && isAnimalActive(found)) count++;
    }
    return count;
  }, [selectedIds, herdById]);

  const selectedArchivedCount = useMemo(() => {
    let count = 0;
    for (const id of selectedIds) {
      const found = herdById.get(id);
      if (found && isAnimalArchived(found)) count++;
    }
    return count;
  }, [selectedIds, herdById]);

  useEffect(() => {
    setShowLogForm(false);
    setLogTitle('');
    setLogWeightInput('');
    setLogShowLeg(false);
    setLogNotes('');
  }, [activeAnimal?.id]);

  const openAnimalPage = (animalId: string) => {
    onSelectAnimal(animalId);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

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

  return (
    <div className="space-y-5">
      {/* Search, Species-Specific Filters & Register Action */}
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
                [
                  'activeFemale',
                  `Active ${pluralizeSpeciesLabel(speciesProfile.femaleLabel)} (${herdTabCounts.activeFemale})`,
                ],
                [
                  'activeMale',
                  `Active ${pluralizeSpeciesLabel(speciesProfile.maleLabel)} (${herdTabCounts.activeMale})`,
                ],
                ['inactive', `Inactive (${herdTabCounts.inactive})`],
                ...(herdTabCounts.activeUnknown > 0
                  ? ([['activeUnknown', `Unsexed Active (${herdTabCounts.activeUnknown})`]] as const)
                  : []),
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilterKey(key)}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
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

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {animals.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => {
                  setMultiSelectMode((prev) => {
                    if (prev) {
                      setSelectedIds(new Set());
                      setConfirmBatchDelete(false);
                    }
                    return !prev;
                  });
                }}
                className={`min-h-[42px] px-3.5 py-2 rounded-xl border text-xs font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
                  multiSelectMode
                    ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                    : 'bg-[var(--barn-surface)] border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                }`}
              >
                <CheckSquare className="w-4 h-4" aria-hidden="true" />
                {multiSelectMode ? 'Done Selecting' : 'Multi-Select'}
              </button>

              <button
                type="button"
                onClick={() =>
                  setMigrationDialog({
                    directAnimalIds: animals.map((a) => a.id),
                    mode: 'bulk-all',
                  })
                }
                className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
                Bulk Migrate All ({animals.length})
              </button>
            </>
          )}

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
      </div>

      {/* Multi-Select Batch Action Toolbar */}
      {multiSelectMode && (
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-sage)] rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[var(--barn-ink)] font-mono tabular-nums">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set(filteredAnimals.map((a) => a.id)))}
              className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] font-medium"
            >
              Select All Filtered ({filteredAnimals.length})
            </button>
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedIds(new Set());
                  setConfirmBatchDelete(false);
                }}
                className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-[var(--barn-muted)]"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedActiveCount > 0 && (
              <button
                type="button"
                onClick={async () => {
                  const ids = Array.from(selectedIds).filter((id) => {
                    const a = herdById.get(id);
                    return a ? isAnimalActive(a) : false;
                  });
                  await onSetAnimalsArchiveState(ids, true);
                  setSelectedIds(new Set());
                  setMultiSelectMode(false);
                }}
                className="min-h-[36px] px-3.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] font-semibold inline-flex items-center gap-1.5"
              >
                <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                Move to Archived ({selectedActiveCount})
              </button>
            )}

            {selectedArchivedCount > 0 && (
              <button
                type="button"
                onClick={async () => {
                  const ids = Array.from(selectedIds).filter((id) => {
                    const a = herdById.get(id);
                    return a ? isAnimalArchived(a) : false;
                  });
                  await onSetAnimalsArchiveState(ids, false);
                  setSelectedIds(new Set());
                  setMultiSelectMode(false);
                }}
                className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold inline-flex items-center gap-1.5"
              >
                <ArchiveRestore className="w-3.5 h-3.5" aria-hidden="true" />
                Move Back to Active ({selectedArchivedCount})
              </button>
            )}

            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => {
                if (selectedIds.size > 0) {
                  setMigrationDialog({
                    directAnimalIds: Array.from(selectedIds),
                    mode: 'multi-select',
                  });
                }
              }}
              className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold disabled:opacity-45 disabled:pointer-events-none inline-flex items-center gap-1.5"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
              {selectedFamilyExpansion.allExpandedIds.length > selectedIds.size
                ? `Migrate Selected (${selectedIds.size} · ${selectedFamilyExpansion.allExpandedIds.length} w/ pedigree)`
                : `Migrate Selected (${selectedIds.size})`}
            </button>

            {confirmBatchDelete ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={async () => {
                    const ids = Array.from(selectedIds);
                    await onDeleteAnimalsBatch(ids);
                    setSelectedIds(new Set());
                    setConfirmBatchDelete(false);
                    setMultiSelectMode(false);
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-danger)] text-white font-semibold"
                >
                  Confirm Delete ({selectedIds.size})
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmBatchDelete(false)}
                  className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={() => setConfirmBatchDelete(true)}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] disabled:opacity-45 disabled:pointer-events-none inline-flex items-center gap-1.5 font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                Delete Selected
              </button>
            )}
          </div>
        </div>
      )}

      {/* Herd List OR Dedicated Single-Animal Page */}
      {!activeAnimal ? (
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl overflow-hidden">
          {filteredAnimals.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm text-[var(--barn-muted)]">
                {filterKey === 'inactive'
                  ? `No inactive or archived ${speciesProfile.name.toLowerCase()} records match this search.`
                  : `No active ${
                      filterKey === 'activeFemale'
                        ? pluralizeSpeciesLabel(speciesProfile.femaleLabel).toLowerCase()
                        : filterKey === 'activeMale'
                          ? pluralizeSpeciesLabel(speciesProfile.maleLabel).toLowerCase()
                          : speciesProfile.name.toLowerCase()
                    } match this filter.`}
              </p>
              {filterKey !== 'inactive' && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingAnimal(null);
                    setShowAnimalModal(true);
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold"
                >
                  Add {speciesProfile.name}
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[var(--barn-border)]">
              {filteredAnimals.map((a) => {
                const isChecked = selectedIds.has(a.id);
                const coi = coiByAnimalId.get(a.id);
                const coverPhoto = primaryPhotoByAnimalId.get(a.id);
                const photoCount = photosByAnimalId.get(a.id)?.length || 0;
                const archived = isAnimalArchived(a);
                const sexColor =
                  a.sex === 'Male'
                    ? 'text-[var(--barn-slate)]'
                    : a.sex === 'Female'
                    ? 'text-[var(--barn-terracotta)]'
                    : 'text-[var(--barn-muted)]';

                return (
                  <div
                    key={a.id}
                    className={`w-full px-4 py-3.5 transition-colors flex items-center justify-between gap-3 ${
                      multiSelectMode && isChecked
                        ? 'bg-[var(--barn-sage-tint)]/65'
                        : 'hover:bg-[var(--barn-subtle)]/40'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (multiSelectMode) {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(a.id)) next.delete(a.id);
                            else next.add(a.id);
                            return next;
                          });
                        } else {
                          openAnimalPage(a.id);
                        }
                      }}
                      className="flex-1 min-w-0 text-left flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {multiSelectMode && (
                          <span className="text-[var(--barn-sage)] shrink-0" aria-hidden="true">
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4" />
                            ) : (
                              <Square className="w-4 h-4 text-[var(--barn-muted)]" />
                            )}
                          </span>
                        )}
                        <div className="relative w-11 h-11 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] overflow-hidden flex items-center justify-center shrink-0">
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

                    {!multiSelectMode && (
                      <button
                        type="button"
                        onClick={() => void onSetAnimalsArchiveState([a.id], !archived)}
                        title={
                          archived
                            ? `Move ${a.name} back to Active herd`
                            : `Move ${a.name} to Archived`
                        }
                        className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] font-medium text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
                      >
                        {archived ? (
                          <>
                            <ArchiveRestore className="w-3.5 h-3.5" aria-hidden="true" />
                            <span className="hidden sm:inline">Restore</span>
                          </>
                        ) : (
                          <>
                            <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                            <span className="hidden sm:inline">Archive</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onSelectAnimal(null)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Back to {speciesProfile.name} Herd
            </button>

            {isAnimalArchived(activeAnimal) && (
              <div className="text-xs px-3 py-1.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)]/50 text-[var(--barn-ink)] font-medium">
                Inactive ({activeAnimal.status}) — kept in storage for pedigrees &amp; history
              </div>
            )}
          </div>

          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-6">
              {/* Header & Cage-Side Print/Tree/Archive Actions */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[var(--barn-border)] pb-5">
                <div className="space-y-1">
                  <div className="text-xs text-[var(--barn-muted)] font-mono">
                    {activeAnimal.tattoo || 'UNMARKED'} · {activeAnimal.species} ·{' '}
                    {activeAnimal.status}
                    {activeAnimal.cageLocation ? ` · ${activeAnimal.cageLocation}` : ''}
                  </div>
                  <h2 className="font-display text-2xl font-semibold">{activeAnimal.name}</h2>
                  <p className="text-sm text-[var(--barn-muted)]">
                    {formatSexForSpecies(activeAnimal.sex, speciesProfile)} · {activeAnimal.breed}{' '}
                    {activeAnimal.variety} · DOB {formatReadableDate(activeAnimal.birthDateIso)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      void onSetAnimalsArchiveState(
                        [activeAnimal.id],
                        isAnimalActive(activeAnimal)
                      )
                    }
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                      isAnimalArchived(activeAnimal)
                        ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)] text-[var(--barn-ink)] hover:opacity-90'
                        : 'border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                    }`}
                  >
                    {isAnimalArchived(activeAnimal) ? (
                      <>
                        <ArchiveRestore className="w-3.5 h-3.5" aria-hidden="true" />
                        Move Back to Active
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
                    onClick={() => onOpenPedigreeForAnimal(activeAnimal.id)}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <GitFork className="w-3.5 h-3.5" aria-hidden="true" />
                    Pedigree Tree
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewDoc({
                        kind: 'cage-card',
                        animal: activeAnimal,
                        includePrimaryPhoto: false,
                      })
                    }
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                    Cage Card
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewDoc({
                        kind: 'pedigree',
                        animal: activeAnimal,
                        includePrimaryPhoto: false,
                      })
                    }
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                    .HTM / PDF
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setMigrationDialog({
                        directAnimalIds: [activeAnimal.id],
                        mode: 'single',
                      })
                    }
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
                    Move Species
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAnimal(activeAnimal);
                      setShowAnimalModal(true);
                    }}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                    Edit
                  </button>
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
                photos={photosByAnimalId.get(activeAnimal.id) ?? EMPTY_PHOTOS}
                optimizationPresetId={settings.imageOptimizationPreset}
                onAddPhotos={(payloads) => onAddAnimalPhotos(activeAnimal, payloads)}
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
                              onClick={() => openAnimalPage(parent.id)}
                              className="font-medium text-sm underline hover:text-[var(--barn-sage)] truncate block mt-0.5"
                            >
                              {parent.name} ({parent.tattoo})
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
                          onClick={() => openAnimalPage(kid.id)}
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
                isSameSpecies(activeAnimal.species, 'Rabbit')) && (
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

      {previewDoc &&
        (() => {
          const previewPrimaryPhoto = primaryPhotoByAnimalId.get(previewDoc.animal.id);
          const isPedigree = previewDoc.kind === 'pedigree';
          return (
            <PrintPreviewModal
              title={
                isPedigree
                  ? `Formal Pedigree (.HTM / PDF) — ${previewDoc.animal.name}`
                  : `Cage Card — ${previewDoc.animal.name}`
              }
              filename={
                isPedigree
                  ? `pedigree-${previewDoc.animal.tattoo || previewDoc.animal.id}.htm`
                  : `cage-card-${previewDoc.animal.tattoo || previewDoc.animal.id}.htm`
              }
              htmlContent={
                isPedigree
                  ? generateEvansHtmPedigree(
                      previewDoc.animal,
                      allAnimals,
                      speciesProfiles,
                      settings,
                      settings.defaultGenerations,
                      {
                        includePrimaryPhoto: previewDoc.includePrimaryPhoto,
                        primaryPhotoDataUrl: previewPrimaryPhoto?.dataUrl,
                        primaryPhotoCaption: previewPrimaryPhoto?.caption,
                      }
                    )
                  : generateThermalCageCardHtml(
                      previewDoc.animal,
                      allAnimals,
                      speciesProfiles,
                      settings
                    )
              }
              includePrimaryPhoto={isPedigree ? previewDoc.includePrimaryPhoto : undefined}
              onToggleIncludePrimaryPhoto={
                isPedigree && previewPrimaryPhoto
                  ? (include) =>
                      setPreviewDoc((prev) =>
                        prev ? { ...prev, includePrimaryPhoto: include } : null
                      )
                  : undefined
              }
              onClose={() => setPreviewDoc(null)}
            />
          );
        })()}

      {migrationDialog && (
        <SpeciesMigrationModal
          snapshot={snapshot}
          sourceSpecies={speciesProfile.name}
          directAnimalIds={migrationDialog.directAnimalIds}
          mode={migrationDialog.mode}
          onConfirmMigrate={async (ids, targetSpecies, options) => {
            await onMigrateAnimals(ids, targetSpecies, options);
            setSelectedIds(new Set());
            setMultiSelectMode(false);
          }}
          onClose={() => setMigrationDialog(null)}
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
          <circle
            key={c.log.id}
            cx={c.x}
            cy={c.y}
            r="3.5"
            fill="var(--barn-sage)"
          />
        ))}
      </svg>
    </div>
  );
}
