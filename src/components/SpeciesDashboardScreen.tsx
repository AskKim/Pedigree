/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Species-Isolated Barn Management Dashboard (`Dashboard`).
 *
 * Displays active gestations/litters, prioritized Master Task List barn chores,
 * cage/pen occupancy, show rosters, and a dedicated Species Settings section at
 * the bottom of the hub strictly scoped to `activeData.speciesProfile.name`.
 */

import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  ArrowUpToLine,
  BookOpen,
  CalendarPlus,
  CheckSquare,
  Download,
  GripVertical,
  Link2,
  Pin,
  Plus,
  Settings,
  SlidersHorizontal,
  Square,
  StickyNote,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useId, useMemo, useState } from 'react';
import { evaluateSpeciesNeedsAttentionAlert } from '../core/barnAlerts';
import { formatSystemTaskTitle } from '../core/calendarExport';
import {
  BarnDatabaseSnapshot,
  BarnSettings,
  BarnTask,
  CageLocation,
  formatBreedingStatusForSpecies,
  formatReadableDate,
  normalizeSpeciesHubBlockOrder,
  SHOW_SANCTIONS,
  ShowEvent,
  SpeciesHubBlockId,
  SpeciesProfile,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TaskCategory,
  TaskPriority,
  todayDateIso,
} from '../core/models';
import { countSpeciesNonTestingRecords } from '../core/sampleData';
import { SpeciesMigrationOptions } from '../core/speciesMigration';
import {
  BarnBinderOptions,
  buildBarnBinderFileName,
  buildDefaultBarnBinderOptions,
  generateSpeciesBarnBinderHtml,
  SpeciesBackupReason,
} from '../core/syncAndExports';
import { ActiveSpeciesData, WorkspaceRoute } from '../hooks/useBarnStore';
import { PrintPreviewModal } from './PrintPreviewModal';
import { SpeciesEditorModal } from './SpeciesEditorModal';
import { SpeciesMigrationModal } from './SpeciesMigrationModal';

interface SpeciesDashboardScreenProps {
  snapshot: BarnDatabaseSnapshot;
  activeData: ActiveSpeciesData;
  settings: BarnSettings;
  isPinned: boolean;
  existingSpeciesNames: string[];
  onNavigate: (route: WorkspaceRoute) => void;
  onOpenAnimal: (animalId: string) => void;
  onToggleTask: (task: BarnTask) => void;
  onSaveTask: (draft: Omit<BarnTask, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteTask: (id: string) => void;
  onSaveCage: (draft: Omit<CageLocation, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteCage: (id: string) => void;
  onSaveShow: (draft: Omit<ShowEvent, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteShow: (id: string) => void;
  onSeedSpeciesSample: (speciesName: string) => void;
  onTogglePinSpecies: (speciesName: string) => void;
  onSaveSpecies: (profile: SpeciesProfile) => void;
  onDeleteSpecies: (profile: SpeciesProfile) => void;
  onDeleteSpeciesTestingData: (speciesName: string) => void;
  onDeleteSpeciesNonTestingData: (speciesName: string) => void;
  onDeleteAllSpeciesRecords: (speciesName: string) => void;
  onDownloadTimestampedSpeciesBackup: (
    speciesName: string,
    reason?: SpeciesBackupReason
  ) => Promise<void> | void;
  onMigrateAnimalsSpecies: (
    animalIds: string[],
    targetSpecies: string,
    options?: SpeciesMigrationOptions
  ) => Promise<void> | void;
  onMoveHubBlock?: (blockId: SpeciesHubBlockId, direction: 'up' | 'down' | 'top') => void;
  onReorderHubBlocks?: (orderedIds: SpeciesHubBlockId[]) => void;
  onExportTaskToCalendar?: (task: BarnTask) => void;
  onCopyTaskAppLink?: (task: BarnTask) => void;
  highlightedTaskId?: string | null;
  onClearHighlightedTask?: () => void;
  onHideSummaryGrid?: () => void;
  onLocateConflicts?: () => void;
  onOpenSettings: () => void;
  onHydrateSnapshotForExport?: (
    targetSnapshot?: BarnDatabaseSnapshot,
    filterSpecies?: string
  ) => Promise<BarnDatabaseSnapshot>;
}

export function SpeciesDashboardScreen({
  snapshot,
  activeData,
  settings,
  isPinned,
  existingSpeciesNames,
  onNavigate,
  onOpenAnimal,
  onToggleTask,
  onSaveTask,
  onDeleteTask,
  onSaveCage,
  onDeleteCage,
  onSaveShow,
  onDeleteShow,
  onSeedSpeciesSample,
  onTogglePinSpecies,
  onSaveSpecies,
  onDeleteSpecies,
  onDeleteSpeciesTestingData,
  onDeleteSpeciesNonTestingData,
  onDeleteAllSpeciesRecords,
  onDownloadTimestampedSpeciesBackup,
  onMigrateAnimalsSpecies,
  onMoveHubBlock,
  onReorderHubBlocks,
  onExportTaskToCalendar,
  onCopyTaskAppLink,
  highlightedTaskId,
  onClearHighlightedTask,
  onHideSummaryGrid,
  onLocateConflicts,
  onOpenSettings,
  onHydrateSnapshotForExport,
}: SpeciesDashboardScreenProps) {
  const {
    speciesProfile,
    animals,
    breedings,
    tasks,
    cages,
    shows,
    herdById,
    conflictedAnimalCount,
    activeConflictAnimalCount,
    testingRecordCount,
    totalRecordCount,
  } = activeData;
  const today = todayDateIso();
  const baseId = useId();
  const showSummaryGrid = settings.showHomeSummaryGrid !== false;

  const [taskFilter, setTaskFilter] = useState<'open' | 'completed'>('open');
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);

  useEffect(() => {
    if (!highlightedTaskId) return;
    const target = tasks.find((t) => t.id === highlightedTaskId);
    if (!target) return;
    const neededFilter = target.completed ? 'completed' : 'open';
    if (taskFilter !== neededFilter) {
      setTaskFilter(neededFilter);
      return;
    }
    const el = document.getElementById(`barn-task-${target.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedTaskId, tasks, taskFilter]);
  const [showNewCageForm, setShowNewCageForm] = useState(false);
  const [showNewShowForm, setShowNewShowForm] = useState(false);

  // Species Settings section modals / 2-step confirmations
  const [showSpeciesConfigModal, setShowSpeciesConfigModal] = useState(false);
  const [showBulkMigrateModal, setShowBulkMigrateModal] = useState(false);
  const [showBinderPreview, setShowBinderPreview] = useState(false);
  const [binderOptions, setBinderOptions] = useState<BarnBinderOptions>(() =>
    buildDefaultBarnBinderOptions(settings)
  );
  const [hydratedBinderSnapshot, setHydratedBinderSnapshot] =
    useState<BarnDatabaseSnapshot | null>(null);
  const [hubDeleteConfirm, setHubDeleteConfirm] = useState<
    'testing' | 'non-testing' | 'all' | 'remove-species' | null
  >(null);

  const openBinderPreview = () => {
    setBinderOptions(buildDefaultBarnBinderOptions(settings));
    setShowBinderPreview(true);
  };

  useEffect(() => {
    if (!showBinderPreview || !binderOptions.includePhotos || !onHydrateSnapshotForExport) {
      setHydratedBinderSnapshot(null);
      return;
    }
    let cancelled = false;
    void onHydrateSnapshotForExport(snapshot, speciesProfile.name).then((hydrated) => {
      if (!cancelled) {
        setHydratedBinderSnapshot(hydrated);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [showBinderPreview, binderOptions.includePhotos, snapshot, speciesProfile.name, onHydrateSnapshotForExport]);

  const binderPreviewHtml = useMemo(() => {
    if (!showBinderPreview) return '';
    const effectiveSnapshot = binderOptions.includePhotos
      ? hydratedBinderSnapshot ?? snapshot
      : snapshot;
    return generateSpeciesBarnBinderHtml(effectiveSnapshot, speciesProfile.name, binderOptions);
  }, [showBinderPreview, snapshot, hydratedBinderSnapshot, speciesProfile.name, binderOptions]);

  const binderFileName = useMemo(
    () => buildBarnBinderFileName(settings.barnName, speciesProfile.name),
    [settings.barnName, speciesProfile.name]
  );

  const nonTestingCount = countSpeciesNonTestingRecords(snapshot, speciesProfile.name);
  const canRemoveEmptySpecies = totalRecordCount === 0 && existingSpeciesNames.length > 1;
  const [draggedBlockId, setDraggedBlockId] = useState<SpeciesHubBlockId | null>(null);
  const [dragOverBlockId, setDragOverBlockId] = useState<SpeciesHubBlockId | null>(null);

  const spKey = speciesProfile.name.trim().toLowerCase();
  const orderedBlockIds = normalizeSpeciesHubBlockOrder(
    settings.speciesHubBlockOrder?.[spKey]
  );

  const handleDropOnBlock = (targetId: SpeciesHubBlockId) => {
    if (!draggedBlockId || draggedBlockId === targetId) {
      setDraggedBlockId(null);
      setDragOverBlockId(null);
      return;
    }
    const fromIdx = orderedBlockIds.indexOf(draggedBlockId);
    const toIdx = orderedBlockIds.indexOf(targetId);
    if (fromIdx !== -1 && toIdx !== -1) {
      const nextIds = [...orderedBlockIds];
      const [moved] = nextIds.splice(fromIdx, 1);
      nextIds.splice(toIdx, 0, moved);
      onReorderHubBlocks?.(nextIds);
    }
    setDraggedBlockId(null);
    setDragOverBlockId(null);
  };

  // Task form state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCategory, setTaskCategory] = useState<TaskCategory>('Care');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('Normal');
  const [taskDueIso, setTaskDueIso] = useState(today);
  const [taskAnimalId, setTaskAnimalId] = useState('');

  // Cage form state
  const [cageLabel, setCageLabel] = useState('');
  const [cageSection, setCageSection] = useState('Main Row');
  const [cageCapacity, setCageCapacity] = useState('1');

  // Show form state
  const [showName, setShowName] = useState('');
  const [showLocation, setShowLocation] = useState('');
  const [showSanction, setShowSanction] = useState(SHOW_SANCTIONS[0]);
  const [showDateIso, setShowDateIso] = useState('');
  const [showDeadlineIso, setShowDeadlineIso] = useState('');
  const [showAnimalIds, setShowAnimalIds] = useState<string[]>([]);

  const activeBreedingStock = animals.filter((a) => a.status === 'Active' && !a.archived).length;
  const activeGestations = breedings.filter((b) =>
    ['Planned', 'Bred', 'Palpated Positive', 'Born'].includes(b.status)
  );
  const openTasksCount = tasks.filter((t) => !t.completed).length;
  const upcomingShows = shows.filter((s) => !s.eventDateIso || s.eventDateIso >= today);
  const attentionAlert = evaluateSpeciesNeedsAttentionAlert(animals, speciesProfile.name);

  const visibleTasks = tasks.filter((t) => (taskFilter === 'open' ? !t.completed : t.completed));

  const submitTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    const linked = taskAnimalId ? herdById.get(taskAnimalId) : undefined;
    onSaveTask({
      species: speciesProfile.name,
      title: taskTitle.trim(),
      category: taskCategory,
      priority: taskPriority,
      dueDateIso: taskDueIso,
      linkedAnimalId: linked?.id || '',
      linkedAnimalName: linked?.name || '',
      linkedBreedingId: '',
      completed: false,
    });
    setTaskTitle('');
    setShowNewTaskForm(false);
  };

  const submitCage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cageLabel.trim()) return;
    onSaveCage({
      species: speciesProfile.name,
      label: cageLabel.trim(),
      section: cageSection.trim(),
      capacity: Math.max(1, Number(cageCapacity) || 1),
      notes: '',
    });
    setCageLabel('');
    setShowNewCageForm(false);
  };

  const submitShow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showName.trim() || !showDateIso) return;
    onSaveShow({
      species: speciesProfile.name,
      name: showName.trim(),
      location: showLocation.trim(),
      sanctioningBody: showSanction,
      eventDateIso: showDateIso,
      entryDeadlineIso: showDeadlineIso,
      enteredAnimalIds: showAnimalIds.slice(0, 25),
      notes: '',
    });
    setShowName('');
    setShowLocation('');
    setShowAnimalIds([]);
    setShowNewShowForm(false);
  };

  const speciesSettingsSection = (
    <section
      aria-label={`${speciesProfile.name} Settings`}
      className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">
            {speciesProfile.name} Hub Settings
          </h2>
          <p className="text-xs text-[var(--barn-muted)] mt-0.5">
            Startup pin, testing dataset toggles, schedule configuration, and safe per-species
            backups
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <Settings className="w-3.5 h-3.5" aria-hidden="true" />
          Barn Settings &amp; Importers
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          aria-pressed={isPinned}
          onClick={() => onTogglePinSpecies(speciesProfile.name)}
          className={`min-h-[40px] px-3.5 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            isPinned
              ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
              : 'border-[var(--barn-border)] text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)]'
          }`}
        >
          <Pin className="w-3.5 h-3.5" aria-hidden="true" />
          {isPinned
            ? `Pinned as Startup Page`
            : `Pin ${speciesProfile.name} as Startup Page`}
        </button>

        <button
          type="button"
          onClick={() => setShowSpeciesConfigModal(true)}
          className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
          Edit {speciesProfile.name} Schedule, Weight Unit &amp; Milestones
        </button>

        {testingRecordCount > 0 ? (
          <button
            type="button"
            onClick={() => setHubDeleteConfirm('testing')}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            Delete Testing Data ({testingRecordCount})
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSeedSpeciesSample(speciesProfile.name)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Add Testing Data
          </button>
        )}

        <button
          type="button"
          onClick={openBinderPreview}
          className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
          Printable {speciesProfile.name} Barn Binder
        </button>

        {totalRecordCount > 0 && (
          <button
            type="button"
            onClick={() => onDownloadTimestampedSpeciesBackup(speciesProfile.name, 'manual')}
            title="Downloads timestamped .ZIP with species JSON, organized photos, and Printable Barn Binder (.HTM)"
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            Backup {speciesProfile.name} (.ZIP + Binder)
          </button>
        )}

        {animals.length > 0 && (
          <button
            type="button"
            onClick={() => setShowBulkMigrateModal(true)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            Migrate All {speciesProfile.name} Stock
          </button>
        )}

        {nonTestingCount > 0 && (
          <button
            type="button"
            onClick={() => setHubDeleteConfirm('non-testing')}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium text-[var(--barn-terracotta)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            Clear Non-Testing Data ({nonTestingCount})
          </button>
        )}

        {totalRecordCount > 0 ? (
          <button
            type="button"
            onClick={() => setHubDeleteConfirm('all')}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-semibold text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            Delete All {speciesProfile.name} Records ({totalRecordCount})
          </button>
        ) : (
          <button
            type="button"
            disabled={!canRemoveEmptySpecies}
            onClick={() => setHubDeleteConfirm('remove-species')}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-semibold text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] disabled:opacity-45 disabled:pointer-events-none inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            Remove Empty {speciesProfile.name} Species
          </button>
        )}
      </div>

      <p className="text-xs text-[var(--barn-muted)]">
        {totalRecordCount > 0
          ? `Note: Only empty species can be fully removed. Delete or migrate all ${totalRecordCount} ${speciesProfile.name} record${totalRecordCount === 1 ? '' : 's'} first if you want to remove this species.`
          : existingSpeciesNames.length <= 1
          ? `Note: Only empty species can be fully removed, and at least one species must remain in your barn.`
          : `Note: Only empty species can be fully removed. ${speciesProfile.name} currently has 0 records, so you can remove it now (and add it back anytime).`}
      </p>

      {hubDeleteConfirm && (
        <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-danger)]/60 space-y-3 text-xs">
          <div className="font-semibold text-[var(--barn-ink)]">
            {hubDeleteConfirm === 'testing'
              ? `Delete ${testingRecordCount} sample/testing records in ${speciesProfile.name}?`
              : hubDeleteConfirm === 'non-testing'
              ? `Recommend Backing Up Before Clearing ${nonTestingCount} Non-Testing ${speciesProfile.name} Records`
              : hubDeleteConfirm === 'remove-species'
              ? `Remove empty ${speciesProfile.name} species from your barn?`
              : `Recommend Backing Up Before Deleting All ${totalRecordCount} ${speciesProfile.name} Records`}
          </div>
          <p className="text-[var(--barn-muted)]">
            {hubDeleteConfirm === 'testing'
              ? `Real and imported ${speciesProfile.name} animals, breedings, and photos stay intact.`
              : hubDeleteConfirm === 'non-testing'
              ? `Removes your real/imported ${speciesProfile.name} animals, breedings, chores, and photos while keeping starter sample data intact. Download a timestamped safety backup first so prior daily backups are never overwritten.`
              : hubDeleteConfirm === 'remove-species'
              ? `${speciesProfile.name} has 0 records left. Removing it deletes this empty species hub and its schedule settings from your barn list.`
              : `Download a timestamped safety backup first so prior backups are not overwritten if something needs recovery later. Other species stay untouched.`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {(hubDeleteConfirm === 'all' || hubDeleteConfirm === 'non-testing') && (
              <button
                type="button"
                onClick={() =>
                  onDownloadTimestampedSpeciesBackup(
                    speciesProfile.name,
                    hubDeleteConfirm === 'non-testing'
                      ? 'pre-remove-non-testing'
                      : 'pre-remove-species'
                  )
                }
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Download Timestamped {speciesProfile.name} Safety Backup
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (hubDeleteConfirm === 'testing') {
                  onDeleteSpeciesTestingData(speciesProfile.name);
                } else if (hubDeleteConfirm === 'non-testing') {
                  onDeleteSpeciesNonTestingData(speciesProfile.name);
                } else if (hubDeleteConfirm === 'remove-species') {
                  onDeleteSpecies(speciesProfile);
                } else {
                  onDeleteAllSpeciesRecords(speciesProfile.name);
                }
                setHubDeleteConfirm(null);
              }}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-xs font-semibold whitespace-nowrap"
            >
              {hubDeleteConfirm === 'testing'
                ? `Confirm Delete ${speciesProfile.name} Testing Data`
                : hubDeleteConfirm === 'non-testing'
                ? `Confirm Clear ${speciesProfile.name} Non-Testing Data`
                : hubDeleteConfirm === 'remove-species'
                ? `Confirm Remove ${speciesProfile.name}`
                : `Confirm Delete All ${speciesProfile.name} Records`}
            </button>
            <button
              type="button"
              onClick={() => setHubDeleteConfirm(null)}
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showSpeciesConfigModal && (
        <SpeciesEditorModal
          initialProfile={speciesProfile}
          existingNames={existingSpeciesNames}
          recordCount={totalRecordCount}
          onSave={onSaveSpecies}
          onDelete={onDeleteSpecies}
          onDownloadTimestampedBackup={(name) =>
            onDownloadTimestampedSpeciesBackup(name, 'pre-remove-species')
          }
          onClose={() => setShowSpeciesConfigModal(false)}
        />
      )}

      {showBulkMigrateModal && (
        <SpeciesMigrationModal
          snapshot={snapshot}
          sourceSpecies={speciesProfile.name}
          directAnimalIds={animals.map((a) => a.id)}
          mode="bulk-all"
          onConfirmMigrate={onMigrateAnimalsSpecies}
          onClose={() => setShowBulkMigrateModal(false)}
        />
      )}

      {showBinderPreview && (
        <PrintPreviewModal
          title={`${speciesProfile.name} Barn & Herd Binder`}
          filename={binderFileName}
          htmlContent={binderPreviewHtml}
          binderPrintOptions={binderOptions}
          onChangeBinderPrintOptions={setBinderOptions}
          binderArchivedCount={activeData.archivedAnimals.length}
          headerNotice={
            <p className="text-[11px] text-[var(--barn-muted)]">
              White-paper ink-safe layout &middot; Unset species preferences automatically inherit global Barn Settings ({settings.barnName || 'Community Pedigree'}).
            </p>
          }
          onClose={() => setShowBinderPreview(false)}
        />
      )}
    </section>
  );

  if (animals.length === 0 && breedings.length === 0 && tasks.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-8 text-center space-y-4">
          <h2 className="font-display text-2xl font-semibold">
            {speciesProfile.name} Barn Hub is Ready
          </h2>
          <p className="text-sm text-[var(--barn-muted)] max-w-lg mx-auto">
            No {speciesProfile.name.toLowerCase()} records are logged yet. Register your first{' '}
            {speciesProfile.maleLabel.toLowerCase()} or{' '}
            {speciesProfile.femaleLabel.toLowerCase()}, or load testing records to try pedestals and
            Master Task List cascading.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigate('herd')}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold"
            >
              Open {speciesProfile.name} Herd
            </button>
            <button
              type="button"
              onClick={() => onSeedSpeciesSample(speciesProfile.name)}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)]"
            >
              Add Testing Data
            </button>
            <button
              type="button"
              onClick={() => onNavigate('memo')}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border-2 border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] text-[var(--barn-ink)] text-xs font-semibold hover:brightness-105 transition-all inline-flex items-center gap-2"
            >
              <span className="p-1 rounded-md bg-[var(--barn-sage)] text-[var(--barn-on-sage)] inline-flex items-center justify-center">
                <StickyNote className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
              <span>Open {speciesProfile.name} Note / Memo Pad</span>
              <ArrowRight className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            </button>
          </div>
        </div>

        {speciesSettingsSection}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Compact 4-Metric Species Pulse Strip + Memo Pad Link */}
      {showSummaryGrid ? (
        <div className="flex flex-col lg:flex-row lg:items-stretch gap-2">
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <section className="flex-1 bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-xl p-1.5 grid grid-cols-2 sm:grid-cols-4 gap-1">
              <button
                type="button"
                onClick={() => onNavigate('herd')}
                className="text-left px-3 py-1.5 rounded-lg hover:bg-[var(--barn-subtle)] transition-colors flex items-center justify-between gap-2"
              >
                <span className="text-xs text-[var(--barn-muted)] truncate">
                  {speciesProfile.name} Herd
                </span>
                <span className="font-mono text-xs font-semibold tabular-nums whitespace-nowrap">
                  {animals.length} ({activeBreedingStock} active)
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('breeding')}
                className="text-left px-3 py-1.5 rounded-lg hover:bg-[var(--barn-subtle)] transition-colors flex items-center justify-between gap-2"
              >
                <span className="text-xs text-[var(--barn-muted)] truncate">
                  {speciesProfile.birthEventLabel}s
                </span>
                <span className="font-mono text-xs font-semibold tabular-nums whitespace-nowrap">
                  {activeGestations.length} active
                </span>
              </button>

              <div className="px-3 py-1.5 rounded-lg flex items-center justify-between gap-2">
                <span className="text-xs text-[var(--barn-muted)] truncate">Open Chores</span>
                <span className="font-mono text-xs font-semibold tabular-nums">
                  {openTasksCount}
                </span>
              </div>

              <div className="px-3 py-1.5 rounded-lg flex items-center justify-between gap-2">
                <span className="text-xs text-[var(--barn-muted)] truncate">Cages / Shows</span>
                <span className="font-mono text-xs font-semibold tabular-nums">
                  {cages.length} / {upcomingShows.length}
                </span>
              </div>
            </section>

            {onHideSummaryGrid && (
              <button
                type="button"
                onClick={onHideSummaryGrid}
                className="self-end sm:self-center text-[11px] text-[var(--barn-muted)] hover:text-[var(--barn-ink)] underline whitespace-nowrap shrink-0"
              >
                Hide strip
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-stretch gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('memo')}
              className="bg-[var(--barn-sage-tint)] border-2 border-[var(--barn-sage)] hover:brightness-105 rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 whitespace-nowrap transition-all shrink-0 shadow-sm"
            >
              <span className="inline-flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] inline-flex items-center justify-center shrink-0">
                  <StickyNote className="w-4 h-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-xs font-bold text-[var(--barn-ink)] leading-tight">
                    {speciesProfile.name} Note Pad
                  </span>
                  <span className="block text-[11px] text-[var(--barn-muted)] leading-tight">
                    Open permanent scratch pad
                  </span>
                </span>
              </span>
              <ArrowRight className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={openBinderPreview}
              className="bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 whitespace-nowrap transition-colors shrink-0"
            >
              <span className="inline-flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-sage)] inline-flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-xs font-bold text-[var(--barn-ink)] leading-tight">
                    Printable Barn Binder
                  </span>
                  <span className="block text-[11px] text-[var(--barn-muted)] leading-tight">
                    Print, PDF or .HTM book
                  </span>
                </span>
              </span>
              <ArrowRight className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={openBinderPreview}
            className="w-full sm:w-auto bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 whitespace-nowrap transition-colors shrink-0"
          >
            <span className="inline-flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-sage)] inline-flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-xs font-bold text-[var(--barn-ink)] leading-tight">
                  Printable Barn Binder
                </span>
                <span className="block text-[11px] text-[var(--barn-muted)] leading-tight">
                  Print, PDF or .HTM book
                </span>
              </span>
            </span>
            <ArrowRight className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('memo')}
            className="w-full sm:w-auto bg-[var(--barn-sage-tint)] border-2 border-[var(--barn-sage)] hover:brightness-105 rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 whitespace-nowrap transition-all shrink-0 shadow-sm"
          >
            <span className="inline-flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] inline-flex items-center justify-center shrink-0">
                <StickyNote className="w-4 h-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-xs font-bold text-[var(--barn-ink)] leading-tight">
                  {speciesProfile.name} Note Pad
                </span>
                <span className="block text-[11px] text-[var(--barn-muted)] leading-tight">
                  Open permanent scratch pad
                </span>
              </span>
            </span>
            <ArrowRight className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Needs Attention Animals Notice */}
      {(attentionAlert.shouldShow || conflictedAnimalCount > 0) && (
        <section
          aria-label={`${speciesProfile.name} records needing attention`}
          className="bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] rounded-2xl p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <AlertCircle
                className="w-5 h-5 text-[var(--barn-terracotta)] mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <div className="space-y-0.5">
                <h2 className="text-sm font-semibold text-[var(--barn-ink)]">
                  {attentionAlert.shouldShow ? (
                    <>
                      {attentionAlert.animals.length} {speciesProfile.name}{' '}
                      {attentionAlert.animals.length === 1 ? 'Record Needs' : 'Records Need'}{' '}
                      Attention
                    </>
                  ) : (
                    <>
                      {conflictedAnimalCount} {speciesProfile.name}{' '}
                      {conflictedAnimalCount === 1 ? 'Record Has' : 'Records Have'} ID / Sex
                      Conflicts
                    </>
                  )}
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  {attentionAlert.shouldShow
                    ? 'Review and complete details (such as ID/tag, breed, or pedigree) or clear the flag once finished.'
                    : 'Soft conflict warnings remain active until duplicate tattoos or parent sex mismatches are resolved.'}
                  {attentionAlert.shouldShow && conflictedAnimalCount > 0
                    ? ` (${activeConflictAnimalCount} active conflict${
                        activeConflictAnimalCount === 1 ? '' : 's'
                      }, ${conflictedAnimalCount} total conflicted)`
                    : ''}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {conflictedAnimalCount > 0 && onLocateConflicts && (
                <button
                  type="button"
                  onClick={onLocateConflicts}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  Locate Conflicts ({conflictedAnimalCount})
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigate('herd')}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-terracotta)]/50 text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                Open {speciesProfile.name} Herd
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {attentionAlert.animals.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {attentionAlert.animals.slice(0, 8).map((flagged) => (
                <button
                  key={flagged.id}
                  type="button"
                  onClick={() => onOpenAnimal(flagged.id)}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-terracotta)] text-xs font-medium text-[var(--barn-ink)] inline-flex items-center gap-1.5"
                >
                  <span>{flagged.name}</span>
                  {flagged.tattoo && (
                    <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                      ({flagged.tattoo})
                    </span>
                  )}
                  <ArrowRight className="w-3 h-3 text-[var(--barn-terracotta)]" aria-hidden="true" />
                </button>
              ))}
              {attentionAlert.animals.length > 8 && (
                <span className="text-xs text-[var(--barn-muted)] px-1">
                  +{attentionAlert.animals.length - 8} more in Herd
                </span>
              )}
            </div>
          )}
        </section>
      )}

      {/* Main Reorderable Subunit Blocks */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base sm:text-lg font-semibold">
            {speciesProfile.name} Barn Modules
          </h2>
          <span className="text-xs text-[var(--barn-muted)]">
            Use ↑ ↓ / ⤒ arrows (or drag blocks) to sort
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {orderedBlockIds.map((blockId, index) => {
            const isFirst = index === 0;
            const isLast = index === orderedBlockIds.length - 1;
            const isDragTarget =
              dragOverBlockId === blockId &&
              draggedBlockId !== null &&
              draggedBlockId !== blockId;

            const blockLabelMap: Record<SpeciesHubBlockId, string> = {
              tasks: `${speciesProfile.name} Master Task List`,
              breedings: `Upcoming ${speciesProfile.birthEventLabel}s & Active Pairings`,
              cages: `${speciesProfile.name} Cages & Pens`,
              shows: 'Shows & Events',
            };

            const renderReorderControls = () => (
              <div
                role="group"
                aria-label={`Reorder ${blockLabelMap[blockId]} block`}
                className="inline-flex items-center rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-0.5 shrink-0"
              >
                {index > 1 && (
                  <button
                    type="button"
                    onClick={() => onMoveHubBlock?.(blockId, 'top')}
                    title={`Move ${blockLabelMap[blockId]} to top (#1)`}
                    aria-label={`Move ${blockLabelMap[blockId]} to top`}
                    className="min-h-[30px] min-w-[26px] rounded-md text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] flex items-center justify-center transition-colors"
                  >
                    <ArrowUpToLine className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  disabled={isFirst}
                  onClick={() => onMoveHubBlock?.(blockId, 'up')}
                  title={`Move ${blockLabelMap[blockId]} up`}
                  aria-label={`Move ${blockLabelMap[blockId]} up`}
                  className="min-h-[30px] min-w-[26px] rounded-md text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={isLast}
                  onClick={() => onMoveHubBlock?.(blockId, 'down')}
                  title={`Move ${blockLabelMap[blockId]} down`}
                  aria-label={`Move ${blockLabelMap[blockId]} down`}
                  className="min-h-[30px] min-w-[26px] rounded-md text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>
            );

            const dragProps = {
              draggable: true,
              onDragStart: (e: React.DragEvent<HTMLElement>) => {
                setDraggedBlockId(blockId);
                e.dataTransfer.effectAllowed = 'move';
              },
              onDragOver: (e: React.DragEvent<HTMLElement>) => {
                e.preventDefault();
                if (dragOverBlockId !== blockId) {
                  setDragOverBlockId(blockId);
                }
              },
              onDragLeave: () => {
                if (dragOverBlockId === blockId) {
                  setDragOverBlockId(null);
                }
              },
              onDrop: (e: React.DragEvent<HTMLElement>) => {
                e.preventDefault();
                handleDropOnBlock(blockId);
              },
              onDragEnd: () => {
                setDraggedBlockId(null);
                setDragOverBlockId(null);
              },
            };

            const cardClass = `bg-[var(--barn-surface)] border rounded-2xl p-5 space-y-4 transition-colors ${
              isDragTarget
                ? 'border-[var(--barn-sage)] ring-2 ring-[var(--barn-sage)]/40'
                : 'border-[var(--barn-border)]'
            }`;

            if (blockId === 'tasks') {
              return (
                <section key={blockId} {...dragProps} className={cardClass}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-start gap-1.5 min-w-0">
                      <span
                        title="Drag block to reorder"
                        className="text-[var(--barn-muted)] cursor-grab active:cursor-grabbing hidden sm:inline-flex mt-1 shrink-0"
                        aria-hidden="true"
                      >
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h2 className="font-display text-lg font-semibold truncate">
                            {speciesProfile.name} Master Task List
                          </h2>
                          <span className="text-[11px] font-mono text-[var(--barn-muted)] tabular-nums shrink-0">
                            #{index + 1}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--barn-muted)]">
                          Tap any checkbox cage-side to mark completed
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {renderReorderControls()}
                      <div className="flex items-center p-0.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                        <button
                          type="button"
                          aria-pressed={taskFilter === 'open'}
                          onClick={() => setTaskFilter('open')}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            taskFilter === 'open'
                              ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                              : 'text-[var(--barn-muted)]'
                          }`}
                        >
                          Open ({openTasksCount})
                        </button>
                        <button
                          type="button"
                          aria-pressed={taskFilter === 'completed'}
                          onClick={() => setTaskFilter('completed')}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            taskFilter === 'completed'
                              ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                              : 'text-[var(--barn-muted)]'
                          }`}
                        >
                          Done ({tasks.length - openTasksCount})
                        </button>
                      </div>

                      <button
                        type="button"
                        aria-expanded={showNewTaskForm}
                        onClick={() => setShowNewTaskForm((v) => !v)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        Add Chore
                      </button>
                    </div>
                  </div>

                  {showNewTaskForm && (
                    <form
                      onSubmit={submitTask}
                      className="border-t border-b border-[var(--barn-border)] py-4 space-y-3"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          required
                          aria-label="Chore title"
                          placeholder={`e.g. Check water line or ${speciesProfile.femaleLabel.toLowerCase()} condition`}
                          value={taskTitle}
                          onChange={(e) => setTaskTitle(e.target.value)}
                          className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                        />
                        <input
                          type="date"
                          aria-label="Chore due date"
                          value={taskDueIso}
                          onChange={(e) => setTaskDueIso(e.target.value)}
                          className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <select
                          aria-label="Chore category"
                          value={taskCategory}
                          onChange={(e) => setTaskCategory(e.target.value as TaskCategory)}
                          className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                        >
                          {TASK_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="Chore priority"
                          value={taskPriority}
                          onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                          className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                        >
                          {TASK_PRIORITIES.map((p) => (
                            <option key={p} value={p}>
                              {p} Priority
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="Linked animal"
                          value={taskAnimalId}
                          onChange={(e) => setTaskAnimalId(e.target.value)}
                          className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                        >
                          <option value="">No linked animal</option>
                          {activeData.activeAnimals.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.tattoo})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowNewTaskForm(false)}
                          className="min-h-[36px] px-3 py-1 rounded-lg border border-[var(--barn-border)] text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="min-h-[36px] px-4 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold"
                        >
                          Save Chore
                        </button>
                      </div>
                    </form>
                  )}

                  {visibleTasks.length === 0 ? (
                    <p className="text-sm text-[var(--barn-muted)] py-3">
                      {taskFilter === 'open'
                        ? `All ${speciesProfile.name.toLowerCase()} barn chores are caught up.`
                        : 'No completed chores yet.'}
                    </p>
                  ) : (
                    <div className="divide-y divide-[var(--barn-border)]">
                      {visibleTasks.map((t) => {
                        const isOverdue = !t.completed && t.dueDateIso && t.dueDateIso < today;
                        const isHighlighted = highlightedTaskId === t.id;
                        const displayTitle = formatSystemTaskTitle(t, settings.calendarSync, {
                          animals,
                          breedings,
                          speciesProfiles: [speciesProfile],
                        });
                        return (
                          <div
                            key={t.id}
                            id={`barn-task-${t.id}`}
                            className={`flex items-center justify-between gap-2 sm:gap-3 py-3 first:pt-1 last:pb-1 transition-colors ${
                              isHighlighted
                                ? 'rounded-xl px-2.5 -mx-2.5 bg-[var(--barn-sage)]/10 ring-2 ring-[var(--barn-sage)]'
                                : ''
                            }`}
                          >
                            <div className="flex items-start gap-2.5 min-w-0">
                              <button
                                type="button"
                                onClick={() => {
                                  if (isHighlighted) onClearHighlightedTask?.();
                                  onToggleTask(t);
                                }}
                                aria-label={
                                  t.completed
                                    ? `Mark ${displayTitle} open`
                                    : `Complete ${displayTitle}`
                                }
                                className="min-h-[40px] min-w-[40px] -ml-2 rounded-lg flex items-center justify-center text-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] shrink-0"
                              >
                                {t.completed ? (
                                  <CheckSquare className="w-5 h-5" />
                                ) : (
                                  <Square className="w-5 h-5" />
                                )}
                              </button>
                              <div className="min-w-0 pt-1">
                                <div
                                  className={`text-sm font-medium ${
                                    t.completed ? 'line-through text-[var(--barn-muted)]' : ''
                                  }`}
                                >
                                  {displayTitle}
                                </div>
                                <div className="text-xs text-[var(--barn-muted)] mt-0.5 flex flex-wrap items-center gap-1.5">
                                  <span>{t.category}</span>
                                  <span aria-hidden="true">·</span>
                                  <span
                                    className={
                                      isOverdue
                                        ? 'text-[var(--barn-danger)] font-medium font-mono tabular-nums'
                                        : 'font-mono tabular-nums'
                                    }
                                  >
                                    {t.dueDateIso
                                      ? `${isOverdue ? 'Overdue: ' : 'Due '}${formatReadableDate(
                                          t.dueDateIso
                                        )}`
                                      : 'No due date'}
                                  </span>
                                  {t.priority === 'High' && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="text-[var(--barn-terracotta)] font-medium">
                                        High priority
                                      </span>
                                    </>
                                  )}
                                  {t.linkedAnimalId && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <button
                                        type="button"
                                        onClick={() => onOpenAnimal(t.linkedAnimalId)}
                                        className="underline hover:text-[var(--barn-ink)]"
                                      >
                                        {t.linkedAnimalName || 'View animal'}
                                      </button>
                                    </>
                                  )}
                                  {isHighlighted && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <button
                                        type="button"
                                        onClick={() => onClearHighlightedTask?.()}
                                        className="text-[var(--barn-sage)] font-semibold underline"
                                      >
                                        Opened from calendar (dismiss)
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                              {t.dueDateIso && onExportTaskToCalendar && (
                                <button
                                  type="button"
                                  onClick={() => onExportTaskToCalendar(t)}
                                  title="Add chore to system calendar (.ICS)"
                                  aria-label={`Add ${displayTitle} to system calendar`}
                                  className="min-h-[36px] min-w-[36px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
                                >
                                  <CalendarPlus className="w-4 h-4" />
                                </button>
                              )}
                              {onCopyTaskAppLink && (
                                <button
                                  type="button"
                                  onClick={() => onCopyTaskAppLink(t)}
                                  title="Copy direct app link for calendar event"
                                  aria-label={`Copy app link for ${displayTitle}`}
                                  className="min-h-[36px] min-w-[36px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
                                >
                                  <Link2 className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onDeleteTask(t.id)}
                                aria-label={`Delete chore ${displayTitle}`}
                                className="min-h-[36px] min-w-[36px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            }

            if (blockId === 'breedings') {
              return (
                <section key={blockId} {...dragProps} className={cardClass}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-start gap-1.5 min-w-0">
                      <span
                        title="Drag block to reorder"
                        className="text-[var(--barn-muted)] cursor-grab active:cursor-grabbing hidden sm:inline-flex mt-1 shrink-0"
                        aria-hidden="true"
                      >
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h2 className="font-display text-lg font-semibold truncate">
                            Upcoming {speciesProfile.birthEventLabel}s &amp; Active Pairings
                          </h2>
                          <span className="text-[11px] font-mono text-[var(--barn-muted)] tabular-nums shrink-0">
                            #{index + 1}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--barn-muted)]">
                          Calculated from {speciesProfile.gestationDays}-day {speciesProfile.name}{' '}
                          gestation
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {renderReorderControls()}
                      <button
                        type="button"
                        onClick={() => onNavigate('breeding')}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap"
                      >
                        Open Breeding Lab
                      </button>
                    </div>
                  </div>

                  {activeGestations.length === 0 ? (
                    <p className="text-sm text-[var(--barn-muted)] py-2">
                      No active {speciesProfile.name.toLowerCase()} pairings right now.
                    </p>
                  ) : (
                    <>
                      <div className="divide-y divide-[var(--barn-border)]">
                      {activeGestations.map((b) => (
                        <div key={b.id} className="py-3.5 first:pt-1 last:pb-1 space-y-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium text-sm">
                              {b.damName} × {b.sireName}
                            </div>
                            <span className="text-xs font-mono tabular-nums text-[var(--barn-sage)] font-medium">
                              {formatBreedingStatusForSpecies(b.status, speciesProfile)} · COI{' '}
                              {b.projectedCoiPercent.toFixed(2)}%
                            </span>
                          </div>
                          <div className="text-xs text-[var(--barn-muted)] font-mono tabular-nums">
                            Bred {formatReadableDate(b.bredDateIso)} · Expected{' '}
                            {speciesProfile.birthEventLabel}:{' '}
                            {formatReadableDate(b.expectedDueDateIso)}
                            {b.liveCount > 0
                              ? ` · ${b.liveCount} live ${speciesProfile.offspringLabel}s`
                              : ''}
                          </div>
                        </div>
                      ))}
                      </div>
                    </>
                  )}
                </section>
              );
            }

            if (blockId === 'cages') {
              return (
                <section key={blockId} {...dragProps} className={cardClass}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-start gap-1.5 min-w-0">
                      <span
                        title="Drag block to reorder"
                        className="text-[var(--barn-muted)] cursor-grab active:cursor-grabbing hidden sm:inline-flex mt-1 shrink-0"
                        aria-hidden="true"
                      >
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h2 className="font-display text-lg font-semibold truncate">
                            {speciesProfile.name} Cages &amp; Pens ({cages.length})
                          </h2>
                          <span className="text-[11px] font-mono text-[var(--barn-muted)] tabular-nums shrink-0">
                            #{index + 1}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--barn-muted)]">
                          Live cage occupancy from {speciesProfile.name.toLowerCase()} records
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {renderReorderControls()}
                      <button
                        type="button"
                        aria-expanded={showNewCageForm}
                        onClick={() => setShowNewCageForm((v) => !v)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        Add Location
                      </button>
                    </div>
                  </div>

                  {showNewCageForm && (
                    <form
                      onSubmit={submitCage}
                      className="border-t border-b border-[var(--barn-border)] py-3 space-y-2.5"
                    >
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          required
                          aria-label="Cage or pen label"
                          placeholder="Label (Hutch R-09)"
                          value={cageLabel}
                          onChange={(e) => setCageLabel(e.target.value)}
                          className="col-span-2 min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
                        />
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={cageCapacity}
                          onChange={(e) => setCageCapacity(e.target.value)}
                          aria-label="Cage capacity"
                          className="min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                        />
                      </div>
                      <input
                        type="text"
                        aria-label="Row or barn section"
                        placeholder="Row / Barn Section"
                        value={cageSection}
                        onChange={(e) => setCageSection(e.target.value)}
                        className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowNewCageForm(false)}
                          className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="min-h-[34px] px-3.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold"
                        >
                          Save Location
                        </button>
                      </div>
                    </form>
                  )}

                  {cages.length === 0 ? (
                    <p className="text-sm text-[var(--barn-muted)]">No locations added yet.</p>
                  ) : (
                    <div className="divide-y divide-[var(--barn-border)] max-h-72 overflow-y-auto">
                      {cages.map((c) => {
                        const occupants = animals.filter(
                          (a) =>
                            !a.archived &&
                            a.cageLocation.trim().toLowerCase() === c.label.trim().toLowerCase() &&
                            (a.status === 'Active' ||
                              a.status === 'Junior' ||
                              a.status === 'Retired')
                        );
                        return (
                          <div
                            key={c.id}
                            className="flex items-center justify-between gap-2 py-2.5 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="font-mono font-semibold text-sm">{c.label}</div>
                              <div className="text-[var(--barn-muted)] truncate">
                                {c.section || 'Barn'} ·{' '}
                                {occupants.length > 0
                                  ? occupants.map((o) => `${o.name} (${o.tattoo})`).join(', ')
                                  : 'Open / Unassigned'}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => onDeleteCage(c.id)}
                              aria-label={`Remove location ${c.label}`}
                              className="min-h-[36px] min-w-[36px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            }

            return (
              <section key={blockId} {...dragProps} className={cardClass}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-start gap-1.5 min-w-0">
                    <span
                      title="Drag block to reorder"
                      className="text-[var(--barn-muted)] cursor-grab active:cursor-grabbing hidden sm:inline-flex mt-1 shrink-0"
                      aria-hidden="true"
                    >
                      <GripVertical className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h2 className="font-display text-lg font-semibold truncate">
                          Shows &amp; Events
                        </h2>
                        <span className="text-[11px] font-mono text-[var(--barn-muted)] tabular-nums shrink-0">
                          #{index + 1}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--barn-muted)]">
                        Show strings &amp; entry deadlines for {speciesProfile.name}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {renderReorderControls()}
                    <button
                      type="button"
                      aria-expanded={showNewShowForm}
                      onClick={() => setShowNewShowForm((v) => !v)}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      Add Show
                    </button>
                  </div>
                </div>

                {showNewShowForm && (
                  <form
                    onSubmit={submitShow}
                    className="border-t border-b border-[var(--barn-border)] py-3 space-y-2.5 text-xs"
                  >
                    <input
                      type="text"
                      required
                      aria-label="Show name"
                      placeholder="Show Name *"
                      value={showName}
                      onChange={(e) => setShowName(e.target.value)}
                      className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        aria-label="Show location"
                        placeholder="Location"
                        value={showLocation}
                        onChange={(e) => setShowLocation(e.target.value)}
                        className="min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                      />
                      <select
                        aria-label="Sanctioning body"
                        value={showSanction}
                        onChange={(e) => setShowSanction(e.target.value)}
                        className="min-h-[38px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                      >
                        {SHOW_SANCTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label
                          htmlFor={`${baseId}-show-date`}
                          className="block text-[var(--barn-muted)] mb-0.5"
                        >
                          Event Date *
                        </label>
                        <input
                          id={`${baseId}-show-date`}
                          type="date"
                          required
                          value={showDateIso}
                          onChange={(e) => setShowDateIso(e.target.value)}
                          className="w-full min-h-[38px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`${baseId}-show-deadline`}
                          className="block text-[var(--barn-muted)] mb-0.5"
                        >
                          Entry Deadline
                        </label>
                        <input
                          id={`${baseId}-show-deadline`}
                          type="date"
                          value={showDeadlineIso}
                          onChange={(e) => setShowDeadlineIso(e.target.value)}
                          className="w-full min-h-[38px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                        />
                      </div>
                    </div>
                    {activeData.activeAnimals.length > 0 && (
                      <div className="space-y-1">
                        <span className="block text-[var(--barn-muted)]">Select Show String:</span>
                        <div className="max-h-28 overflow-y-auto space-y-1 border border-[var(--barn-border)] rounded-lg p-2 bg-[var(--barn-canvas)]">
                          {activeData.activeAnimals.map((a) => {
                            const checked = showAnimalIds.includes(a.id);
                            return (
                              <label key={a.id} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setShowAnimalIds((prev) =>
                                      checked ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                                    )
                                  }
                                />
                                <span>
                                  {a.name} ({a.tattoo})
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowNewShowForm(false)}
                        className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)]"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="min-h-[34px] px-3.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold"
                      >
                        Save Show
                      </button>
                    </div>
                  </form>
                )}

                {shows.length === 0 ? (
                  <p className="text-sm text-[var(--barn-muted)]">No shows scheduled.</p>
                ) : (
                  <div className="divide-y divide-[var(--barn-border)]">
                    {shows.map((s) => {
                      const enteredNames = s.enteredAnimalIds
                        .map((id) => herdById.get(id))
                        .filter(Boolean)
                        .map((a) => `${a!.name} (${a!.tattoo})`);
                      return (
                        <div key={s.id} className="py-3 first:pt-1 last:pb-1 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-medium">{s.name}</div>
                              <div className="text-xs text-[var(--barn-muted)]">
                                {s.sanctioningBody} · {formatReadableDate(s.eventDateIso)}
                                {s.location ? ` · ${s.location}` : ''}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => onDeleteShow(s.id)}
                              aria-label={`Remove ${s.name}`}
                              className="min-h-[36px] min-w-[36px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {enteredNames.length > 0 && (
                            <div className="text-xs text-[var(--barn-muted)]">
                              Entered ({enteredNames.length}): {enteredNames.join(', ')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {/* Dedicated Per-Species Hub Settings at Bottom */}
      {speciesSettingsSection}
    </div>
  );
}
