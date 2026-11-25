# Codebase Export: AskKim/Pedigree (Part 7 of 16)

- **Branch:** `main`
- **Commit:** `847f8ec8a2fc88e92ecb94065d96cf1277189c07`
- **Generated (UTC):** 2026-11-21 17:00:43 UTC
- **Files in this part:** 8 (`src/components/SpeciesDashboardScreen.tsx` -> `src/components/UnifiedBackupVaultPanel.tsx`)
- **Index:** [index.md](./index.md)

---
## `src/components/SpeciesDashboardScreen.tsx`

```tsx
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
  AlertTriangle,
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  ArrowUpToLine,
  Award,
  BookOpen,
  CalendarPlus,
  Camera,
  Check,
  CheckSquare,
  ClipboardCheck,
  DollarSign,
  Download,
  Edit3,
  FileText,
  GripVertical,
  LayoutGrid,
  Link2,
  List,
  Loader2,
  Maximize2,
  Package,
  Pin,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  StickyNote,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { useAsyncKeyedLock, useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import {
  AnimalWithdrawalEvaluation,
  buildWithdrawalByAnimalMap,
  CageAssignmentCapacityWarning,
  evaluateCageAssignmentCapacityWarning,
  evaluateShowWithdrawalConflicts,
  evaluateSpeciesCagesOccupancy,
  evaluateSpeciesNeedsAttentionAlert,
  isCageOccupyingAnimal,
  normalizeCageLabelKey,
  ShowWithdrawalConflictEvaluation,
} from '../core/barnAlerts';
import {
  BatchPrintOptions,
  buildBatchPrintFileName,
  buildDefaultBatchPrintOptions,
  generateBatchPrintHtml,
} from '../core/batchPrint';
import { formatSystemTaskTitle } from '../core/calendarExport';
import { evaluateCrmFollowUpReminders } from '../core/clientCrm';
import { buildFacilityBoardModel } from '../core/facilityBoard';
import {
  evaluateFeedInventorySummary,
  isFeedBatchLowStock,
} from '../core/feedInventory';
import {
  Animal,
  BarnDatabaseSnapshot,
  BarnSettings,
  BarnTask,
  BreedingRecord,
  CageLocation,
  formatBreedingStatusForSpecies,
  formatReadableDate,
  HOUSING_UNIT_TYPES,
  HousingUnitType,
  normalizeFeedPurgeWindowDays,
  normalizeSpeciesHubBlockOrder,
  SHOW_AWARD_OPTIONS,
  SHOW_SANCTIONS,
  ShowAnimalResult,
  ShowAwardCode,
  ShowELegAttachment,
  ShowEvent,
  SpeciesHubBlockId,
  SpeciesProfile,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TaskCategory,
  TaskPriority,
  todayDateIso,
} from '../core/models';
import {
  MAX_SHOW_ELEG_ATTACHMENTS_PER_RESULT,
  mergeEnteredAnimalIdsWithResults,
  normalizeShowResults,
} from '../core/showResults';
import {
  buildShowDocumentFileName,
  buildShowEntryMailtoUrl,
  buildShowEntryPlainTextSummary,
  generateShowEntryFormHtml,
  generateShowRemarkCardsHtml,
  RemarkCardLayoutMode,
  ShowEntryDivision,
} from '../core/showDocuments';
import { optimizeImageFile } from '../storage/webImageOptimizer';
import { countSpeciesNonTestingRecords } from '../core/sampleData';
import { SpeciesMigrationOptions } from '../core/speciesMigration';
import {
  BarnBinderOptions,
  buildBarnBinderFileName,
  buildDefaultBarnBinderOptions,
  generateSpeciesBarnBinderHtml,
  generateThermalCageCardHtml,
  SpeciesBackupReason,
} from '../core/syncAndExports';
import {
  evaluateStalePostBirthTasksForBreeding,
  isBirthCheckTask,
  isPalpationTask,
  resolveEffectiveSpeciesProfileForBreeding,
} from '../core/taskMaster';
import {
  ActiveSpeciesData,
  BreedingTaskCheckoffAction,
  WorkspaceRoute,
} from '../hooks/useBarnStore';
import { FacilityPenBoard } from './FacilityPenBoard';
import { PrintPreviewModal } from './PrintPreviewModal';
import { SpeciesEditorModal } from './SpeciesEditorModal';
import { SpeciesMigrationModal } from './SpeciesMigrationModal';
import type { ImportExportHubSection } from './ImportExportHubScreen';

const EMPTY_WITHDRAWAL_MAP = new Map<string, AnimalWithdrawalEvaluation>();

interface SpeciesDashboardScreenProps {
  snapshot: BarnDatabaseSnapshot;
  activeData: ActiveSpeciesData;
  settings: BarnSettings;
  isPinned: boolean;
  existingSpeciesNames: string[];
  onNavigate: (route: WorkspaceRoute) => void;
  onOpenAnimal: (animalId: string) => void;
  onToggleTask: (task: BarnTask) => Promise<boolean | void> | void;
  onCompleteBreedingTask?: (
    task: BarnTask,
    outcome: BreedingTaskCheckoffAction
  ) => Promise<boolean | void> | void;
  onRecalculatePostBirthTasks?: (breedingId: string) => Promise<boolean | void> | void;
  onSaveTask: (draft: Omit<BarnTask, 'id' | 'createdAt' | 'updatedAt'>) => Promise<boolean | void> | void;
  onDeleteTask: (id: string) => void;
  onSaveCage: (
    draft: Omit<CageLocation, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<boolean | void> | void;
  onDeleteCage: (id: string) => void;
  onAssignAnimalToCage?: (animalId: string, nextCageLabel: string) => Promise<boolean | void> | void;
  onSaveShow: (
    draft: Omit<ShowEvent, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<boolean | void> | void;
  onDeleteShow: (id: string) => void;
  onSeedSpeciesSample: (speciesName: string) => void;
  onTogglePinSpecies: (speciesName: string) => void;
  onSaveSpecies: (profile: SpeciesProfile) => Promise<boolean | void> | void;
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
  highlightedCageId?: string | null;
  onClearHighlightedCage?: () => void;
  onHideSummaryGrid?: () => void;
  onLocateConflicts?: () => void;
  onOpenSettings: () => void;
  onOpenImportExportHub?: (section?: ImportExportHubSection) => void;
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
  onCompleteBreedingTask,
  onRecalculatePostBirthTasks,
  onSaveTask,
  onDeleteTask,
  onSaveCage,
  onDeleteCage,
  onAssignAnimalToCage,
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
  highlightedCageId,
  onClearHighlightedCage,
  onHideSummaryGrid,
  onLocateConflicts,
  onOpenSettings,
  onOpenImportExportHub,
  onHydrateSnapshotForExport,
}: SpeciesDashboardScreenProps) {
  const {
    speciesProfile,
    animals,
    breedings,
    tasks,
    cages,
    careLogs,
    shows,
    feedBatches,
    feedAllocations,
    herdById,
    conflictedAnimalCount,
    activeConflictAnimalCount,
    testingRecordCount,
    totalRecordCount,
  } = activeData;
  const today = todayDateIso();
  const baseId = useId();
  const showSummaryGrid = settings.showHomeSummaryGrid !== false;
  const feedSummary = useMemo(
    () =>
      evaluateFeedInventorySummary({
        batches: feedBatches,
        allocations: feedAllocations,
        speciesName: speciesProfile.name,
        purgeWindowDays: normalizeFeedPurgeWindowDays(settings.feedTagPurgeWindowDays),
        todayIso: today,
      }),
    [feedBatches, feedAllocations, speciesProfile.name, settings.feedTagPurgeWindowDays, today]
  );
  const crmSummary = useMemo(
    () =>
      evaluateCrmFollowUpReminders({
        clients: activeData.clientContacts,
        waitlistEntries: activeData.waitlistEntries,
        reservations: activeData.animalReservations,
        currencyCode: settings.currencyCode,
        todayIso: today,
      }),
    [
      activeData.clientContacts,
      activeData.waitlistEntries,
      activeData.animalReservations,
      settings.currencyCode,
      today,
    ]
  );

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
  const [showEditorOpen, setShowEditorOpen] = useState(false);
  const [editingShowId, setEditingShowId] = useState<string | null>(null);

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

  // Cage form, visual Facility Pen Board & quick-assignment state
  const [cageViewMode, setCageViewMode] = useState<'board' | 'list'>('board');
  const [showFullFacilityBoard, setShowFullFacilityBoard] = useState(false);
  const [showCageAdvancedFields, setShowCageAdvancedFields] = useState(false);
  const [cageLabel, setCageLabel] = useState('');
  const [cageSection, setCageSection] = useState('Main Row');
  const [cageCapacity, setCageCapacity] = useState('1');
  const [cageUnitType, setCageUnitType] = useState<HousingUnitType | ''>('');
  const [cageFeedLotName, setCageFeedLotName] = useState('');
  const [cageFeedStockRemaining, setCageFeedStockRemaining] = useState('');
  const [cageFeedStockUnit, setCageFeedStockUnit] = useState('lbs');
  const [cageFeedLowThreshold, setCageFeedLowThreshold] = useState('');
  const [cageDailyRationNote, setCageDailyRationNote] = useState('');
  const [cageMaintLabel, setCageMaintLabel] = useState('');
  const [cageMaintIntervalDays, setCageMaintIntervalDays] = useState('');
  const [editingCageId, setEditingCageId] = useState<string | null>(null);
  const [editingCageLabel, setEditingCageLabel] = useState('');
  const [editingCageSection, setEditingCageSection] = useState('');
  const [editingCageCapacity, setEditingCageCapacity] = useState('1');
  const [pendingCageAssignConfirm, setPendingCageAssignConfirm] = useState<{
    cageId: string;
    cageLabel: string;
    animalId: string;
    animalName: string;
    warning: CageAssignmentCapacityWarning;
  } | null>(null);

  // QR Cage Card Print Preview state (single pen or batch row/facility)
  const [cageQrPrintState, setCageQrPrintState] = useState<{
    animals: Animal[];
    titleContext: string;
  } | null>(null);
  const [includeSingleCardQr, setIncludeSingleCardQr] = useState(true);
  const [cageBatchPrintOptions, setCageBatchPrintOptions] = useState<BatchPrintOptions>(() => ({
    ...buildDefaultBatchPrintOptions(settings),
    layout: 'cage_cards',
    includeQrCodes: true,
  }));

  const appBaseUrl = useMemo(() => {
    if (typeof window === 'undefined' || !window.location) return '';
    return `${window.location.origin}${window.location.pathname}`;
  }, []);

  // Show & Results modal state
  const [showName, setShowName] = useState('');
  const [showLocation, setShowLocation] = useState('');
  const [showSanction, setShowSanction] = useState(SHOW_SANCTIONS[0]);
  const [showDateIso, setShowDateIso] = useState('');
  const [showDeadlineIso, setShowDeadlineIso] = useState('');
  const [showNotes, setShowNotes] = useState('');
  const [showAnimalIds, setShowAnimalIds] = useState<string[]>([]);
  const [showResultsByAnimalId, setShowResultsByAnimalId] = useState<
    Record<string, ShowAnimalResult>
  >({});
  const [showIncludeArchivedEntries, setShowIncludeArchivedEntries] = useState(false);
  const [showPhotoBusyAnimalId, setShowPhotoBusyAnimalId] = useState<string | null>(null);
  const [showPhotoError, setShowPhotoError] = useState<string | null>(null);
  const [eLegLightbox, setELegLightbox] = useState<{
    imageUrl: string;
    title: string;
    subtitle?: string;
  } | null>(null);
  const [pendingShowWithdrawalWarning, setPendingShowWithdrawalWarning] =
    useState<ShowWithdrawalConflictEvaluation | null>(null);
  const [showDocPreview, setShowDocPreview] = useState<{
    show: ShowEvent;
    kind: 'entry_form' | 'remark_cards';
    division: ShowEntryDivision;
    exhibitorName: string;
    exhibitorAddress: string;
    exhibitorPhone: string;
    exhibitorEmail: string;
    exhibitorArbaNumber: string;
    secretaryEmail: string;
    entryFeePerAnimal: string;
    remarkLayout: RemarkCardLayoutMode;
    includeFurWool: boolean;
  } | null>(null);

  const closeShowEditor = useCallback(() => {
    setPendingShowWithdrawalWarning(null);
    setShowPhotoError(null);
    setShowEditorOpen(false);
  }, []);

  const showEditorDialogRef = useAccessibleDialog({
    isOpen: showEditorOpen,
    onClose: closeShowEditor,
    closeOnEscape: !eLegLightbox,
  });

  const closeELegLightbox = useCallback(() => setELegLightbox(null), []);
  const eLegLightboxRef = useAccessibleDialog({
    isOpen: Boolean(eLegLightbox),
    onClose: closeELegLightbox,
  });

  const openNewShowEditor = () => {
    setEditingShowId(null);
    setShowName('');
    setShowLocation('');
    setShowSanction(SHOW_SANCTIONS[0]);
    setShowDateIso(today);
    setShowDeadlineIso('');
    setShowNotes('');
    setShowAnimalIds([]);
    setShowResultsByAnimalId({});
    setShowIncludeArchivedEntries(false);
    setShowPhotoError(null);
    setPendingShowWithdrawalWarning(null);
    setShowEditorOpen(true);
  };

  const openEditShowEditor = (show: ShowEvent) => {
    setEditingShowId(show.id);
    setShowName(show.name);
    setShowLocation(show.location || '');
    setShowSanction(show.sanctioningBody || SHOW_SANCTIONS[0]);
    setShowDateIso(show.eventDateIso || today);
    setShowDeadlineIso(show.entryDeadlineIso || '');
    setShowNotes(show.notes || '');
    const normalizedResults = normalizeShowResults(show.results ?? [], { dropEmpty: false });
    const resultMap: Record<string, ShowAnimalResult> = {};
    for (const r of normalizedResults) {
      resultMap[r.animalId] = r;
    }
    const mergedIds = mergeEnteredAnimalIdsWithResults(
      show.enteredAnimalIds ?? [],
      normalizedResults
    );
    const hasArchived = mergedIds.some((id) => {
      const a = herdById.get(id);
      return a ? !activeData.activeAnimals.some((act) => act.id === a.id) : false;
    });
    setShowAnimalIds(mergedIds);
    setShowResultsByAnimalId(resultMap);
    setShowIncludeArchivedEntries(hasArchived);
    setShowPhotoError(null);
    setPendingShowWithdrawalWarning(null);
    setShowEditorOpen(true);
  };

  const showDateWithdrawalByAnimalId = useMemo<Map<string, AnimalWithdrawalEvaluation>>(
    () =>
      showEditorOpen && showDateIso
        ? buildWithdrawalByAnimalMap(careLogs, { todayIso: showDateIso })
        : EMPTY_WITHDRAWAL_MAP,
    [showEditorOpen, showDateIso, careLogs]
  );

  const taskSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const cageSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const showSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const taskToggleLock = useAsyncKeyedLock();
  const breedingRecalcLock = useAsyncKeyedLock();
  const cageAssignLock = useAsyncKeyedLock();

  // Inline quick breeding checkoff state for Birth Check tasks
  const [activeBirthCheckoffTaskId, setActiveBirthCheckoffTaskId] = useState<string | null>(null);
  const [quickBirthDateIso, setQuickBirthDateIso] = useState(today);
  const [quickLiveCount, setQuickLiveCount] = useState('0');
  const [quickStillbornCount, setQuickStillbornCount] = useState('0');
  const [quickShiftPostBirth, setQuickShiftPostBirth] = useState(true);

  useEffect(() => {
    setActiveBirthCheckoffTaskId(null);
    setShowFullFacilityBoard(false);
    setCageQrPrintState(null);
    setShowDocPreview(null);
  }, [speciesProfile.name]);

  useEffect(() => {
    if (!highlightedCageId) return;
    setCageViewMode('board');
  }, [highlightedCageId]);

  const activeBreedingStock = animals.filter((a) => a.status === 'Active' && !a.archived).length;
  const activeGestations = useMemo(
    () =>
      breedings.filter((b) =>
        ['Planned', 'Bred', 'Palpated Positive', 'Born'].includes(b.status)
      ),
    [breedings]
  );
  const breedingById = useMemo(
    () => new Map<string, BreedingRecord>(breedings.map((b) => [b.id, b])),
    [breedings]
  );
  const stalePostBirthByBreedingId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of activeGestations) {
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
  }, [activeGestations, herdById, speciesProfile, tasks]);

  const openTasksCount = tasks.filter((t) => !t.completed).length;
  const upcomingShows = shows.filter((s) => !s.eventDateIso || s.eventDateIso >= today);
  const attentionAlert = evaluateSpeciesNeedsAttentionAlert(animals, speciesProfile.name);
  const cagesOccupancySummary = useMemo(
    () => evaluateSpeciesCagesOccupancy(cages, animals, speciesProfile.name),
    [cages, animals, speciesProfile.name]
  );
  const facilityBoardModel = useMemo(
    () =>
      buildFacilityBoardModel({
        cages,
        animals,
        tasks,
        speciesName: speciesProfile.name,
        todayIso: today,
      }),
    [cages, animals, tasks, speciesProfile.name, today]
  );
  const assignableAnimals = useMemo(
    () => animals.filter((a) => isCageOccupyingAnimal(a)),
    [animals]
  );

  const handlePrintCageCardsForAnimals = (targetAnimals: Animal[], titleContext: string) => {
    if (targetAnimals.length === 0) return;
    setIncludeSingleCardQr(true);
    setCageBatchPrintOptions({
      ...buildDefaultBatchPrintOptions(settings),
      layout: 'cage_cards',
      includeQrCodes: true,
    });
    setCageQrPrintState({ animals: targetAnimals, titleContext });
  };

  const photoDataUrlByAnimalId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const photo of snapshot.animalPhotos) {
      const url = photo.thumbnailDataUrl || photo.dataUrl || '';
      if (!url) continue;
      if (photo.isPrimary || !map[photo.animalId]) {
        map[photo.animalId] = url;
      }
    }
    return map;
  }, [snapshot.animalPhotos]);

  const cageQrPreviewDoc = useMemo(() => {
    if (!cageQrPrintState || cageQrPrintState.animals.length === 0) return null;
    if (cageQrPrintState.animals.length === 1) {
      const single = cageQrPrintState.animals[0];
      const safeName = (single.tattoo || single.name || 'animal')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
      return {
        mode: 'single' as const,
        title: `QR Cage Card — ${single.name}`,
        filename: `${safeName}-qr-cage-card.html`,
        html: generateThermalCageCardHtml(
          single,
          animals,
          snapshot.speciesProfiles,
          settings,
          {
            includeQrCode: includeSingleCardQr,
            appBaseUrl,
          }
        ),
      };
    }
    return {
      mode: 'batch' as const,
      title: `QR Cage Cards — ${cageQrPrintState.titleContext} (${cageQrPrintState.animals.length})`,
      filename: buildBatchPrintFileName(
        settings.barnName,
        speciesProfile.name,
        cageBatchPrintOptions.layout,
        cageQrPrintState.animals.length
      ),
      html: generateBatchPrintHtml({
        subjects: cageQrPrintState.animals,
        allAnimals: animals,
        speciesProfiles: snapshot.speciesProfiles,
        settings,
        speciesName: speciesProfile.name,
        options: cageBatchPrintOptions,
        photoDataUrlByAnimalId,
        appBaseUrl,
      }),
    };
  }, [
    cageQrPrintState,
    speciesProfile,
    settings,
    includeSingleCardQr,
    appBaseUrl,
    cageBatchPrintOptions,
    animals,
    snapshot.speciesProfiles,
    photoDataUrlByAnimalId,
  ]);

  const openShowDocumentPreview = (
    show: ShowEvent,
    kind: 'entry_form' | 'remark_cards'
  ) => {
    setShowDocPreview({
      show,
      kind,
      division: 'Open',
      exhibitorName: settings.breederName || '',
      exhibitorAddress: '',
      exhibitorPhone: '',
      exhibitorEmail: '',
      exhibitorArbaNumber: '',
      secretaryEmail: '',
      entryFeePerAnimal: '',
      remarkLayout: '4up',
      includeFurWool: false,
    });
  };

  const renderedShowDocument = useMemo(() => {
    if (!showDocPreview) return null;
    const entryOpts = {
      division: showDocPreview.division,
      exhibitorName: showDocPreview.exhibitorName,
      exhibitorBarn: settings.barnName,
      exhibitorAddress: showDocPreview.exhibitorAddress,
      exhibitorPhone: showDocPreview.exhibitorPhone,
      exhibitorEmail: showDocPreview.exhibitorEmail,
      exhibitorArbaNumber: showDocPreview.exhibitorArbaNumber,
      secretaryEmail: showDocPreview.secretaryEmail,
      entryFeePerAnimal: showDocPreview.entryFeePerAnimal,
      defaultEnterFurWool: showDocPreview.includeFurWool,
    };
    if (showDocPreview.kind === 'entry_form') {
      return {
        title: `Show Entry Form — ${showDocPreview.show.name}`,
        filename: buildShowDocumentFileName(showDocPreview.show, 'entry-form'),
        html: generateShowEntryFormHtml(
          showDocPreview.show,
          animals,
          speciesProfile,
          settings,
          entryOpts
        ),
        mailtoUrl: buildShowEntryMailtoUrl(
          showDocPreview.show,
          animals,
          speciesProfile,
          settings,
          entryOpts
        ),
        plainTextSummary: buildShowEntryPlainTextSummary(
          showDocPreview.show,
          animals,
          speciesProfile,
          settings,
          entryOpts
        ),
      };
    }
    return {
      title: `Show Remark Cards — ${showDocPreview.show.name}`,
      filename: buildShowDocumentFileName(showDocPreview.show, 'remark-cards'),
      html: generateShowRemarkCardsHtml(
        showDocPreview.show,
        animals,
        speciesProfile,
        settings,
        {
          layoutMode: showDocPreview.remarkLayout,
          division: showDocPreview.division,
          exhibitorName: showDocPreview.exhibitorName || settings.breederName || settings.barnName,
          includeExistingJudgeNotes: true,
        }
      ),
      mailtoUrl: undefined,
      plainTextSummary: buildShowEntryPlainTextSummary(
        showDocPreview.show,
        animals,
        speciesProfile,
        settings,
        entryOpts
      ),
    };
  }, [showDocPreview, animals, speciesProfile, settings]);

  const visibleTasks = tasks.filter((t) => (taskFilter === 'open' ? !t.completed : t.completed));

  const submitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    await taskSubmitLock.runLocked(async () => {
      const linked = taskAnimalId ? herdById.get(taskAnimalId) : undefined;
      const saved = await onSaveTask({
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
      if (saved !== false) {
        setTaskTitle('');
        setShowNewTaskForm(false);
      }
    });
  };

  const submitCage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cageLabel.trim()) return;
    await cageSubmitLock.runLocked(async () => {
      const parsedStock = Number(cageFeedStockRemaining.trim());
      const parsedLow = Number(cageFeedLowThreshold.trim());
      const parsedInterval = Number(cageMaintIntervalDays.trim());
      const saved = await onSaveCage({
        species: speciesProfile.name,
        label: cageLabel.trim(),
        section: cageSection.trim(),
        capacity: Math.max(1, Math.round(Number(cageCapacity) || 1)),
        notes: '',
        unitType: cageUnitType || undefined,
        feedLotName: cageFeedLotName.trim() || undefined,
        feedStockRemaining:
          cageFeedStockRemaining.trim() && Number.isFinite(parsedStock) && parsedStock > 0
            ? Math.round(parsedStock * 100) / 100
            : undefined,
        feedStockUnit: cageFeedLotName.trim() ? cageFeedStockUnit.trim() || 'lbs' : undefined,
        feedLowThreshold:
          cageFeedLowThreshold.trim() && Number.isFinite(parsedLow) && parsedLow > 0
            ? Math.round(parsedLow * 100) / 100
            : undefined,
        dailyRationNote: cageDailyRationNote.trim() || undefined,
        maintenanceTaskLabel: cageMaintLabel.trim() || undefined,
        maintenanceIntervalDays:
          cageMaintIntervalDays.trim() && Number.isFinite(parsedInterval) && parsedInterval > 0
            ? Math.min(365, Math.round(parsedInterval))
            : undefined,
      });
      if (saved !== false) {
        setCageLabel('');
        setCageUnitType('');
        setCageFeedLotName('');
        setCageFeedStockRemaining('');
        setCageFeedLowThreshold('');
        setCageDailyRationNote('');
        setCageMaintLabel('');
        setCageMaintIntervalDays('');
        setShowCageAdvancedFields(false);
        setShowNewCageForm(false);
      }
    });
  };

  const handleSaveEditedCage = async (cage: CageLocation) => {
    const cleanLabel = editingCageLabel.trim();
    if (!cleanLabel) return;
    await cageAssignLock.runKeyLocked(`edit:${cage.id}`, async () => {
      const saved = await onSaveCage({
        id: cage.id,
        species: cage.species,
        label: cleanLabel,
        section: editingCageSection.trim(),
        capacity: Math.max(1, Math.round(Number(editingCageCapacity) || 1)),
        notes: cage.notes || '',
        unitType: cage.unitType,
        feedLotName: cage.feedLotName,
        feedStockRemaining: cage.feedStockRemaining,
        feedStockUnit: cage.feedStockUnit,
        dailyRationNote: cage.dailyRationNote,
        feedLowThreshold: cage.feedLowThreshold,
        maintenanceIntervalDays: cage.maintenanceIntervalDays,
        maintenanceTaskLabel: cage.maintenanceTaskLabel,
        lastMaintenanceDateIso: cage.lastMaintenanceDateIso,
      });
      if (saved !== false) {
        setEditingCageId(null);
        if (pendingCageAssignConfirm?.cageId === cage.id) {
          setPendingCageAssignConfirm(null);
        }
      }
    });
  };

  const handleQuickAssignSelect = async (cage: CageLocation, animalId: string) => {
    if (!animalId || !onAssignAnimalToCage) return;
    const animal = assignableAnimals.find((a) => a.id === animalId);
    if (!animal) return;
    const warning = evaluateCageAssignmentCapacityWarning({
      targetCageLabel: cage.label,
      cages,
      animals,
      speciesName: speciesProfile.name,
      animalId: animal.id,
      animalName: animal.name,
      wasAlreadyOccupyingTargetCage: false,
      willOccupyAfterSave: true,
    });
    if (warning?.wouldExceed) {
      setPendingCageAssignConfirm({
        cageId: cage.id,
        cageLabel: cage.label,
        animalId: animal.id,
        animalName: animal.name,
        warning,
      });
      return;
    }
    setPendingCageAssignConfirm(null);
    await cageAssignLock.runKeyLocked(cage.id, async () => {
      await onAssignAnimalToCage(animal.id, cage.label);
    });
  };

  const handleConfirmOverCapacityAssign = async () => {
    if (!pendingCageAssignConfirm || !onAssignAnimalToCage) return;
    const { cageId, cageLabel: targetLabel, animalId } = pendingCageAssignConfirm;
    await cageAssignLock.runKeyLocked(cageId, async () => {
      await onAssignAnimalToCage(animalId, targetLabel);
      setPendingCageAssignConfirm(null);
    });
  };

  const handleUnassignFromCage = async (cageId: string, animalId: string) => {
    if (!onAssignAnimalToCage) return;
    if (pendingCageAssignConfirm?.cageId === cageId) {
      setPendingCageAssignConfirm(null);
    }
    await cageAssignLock.runKeyLocked(`unassign:${animalId}`, async () => {
      await onAssignAnimalToCage(animalId, '');
    });
  };

  const updateAnimalShowResult = (
    animalId: string,
    updater: (prev: ShowAnimalResult) => ShowAnimalResult
  ) => {
    setShowResultsByAnimalId((prev) => {
      const base: ShowAnimalResult = prev[animalId] ?? {
        animalId,
        classPlacement: '',
        awards: [],
        judgeName: '',
        judgeNotes: '',
        legsEarned: 0,
        pointsEarned: undefined,
        legCertificateNumber: '',
        eLegAttachments: [],
      };
      return {
        ...prev,
        [animalId]: updater(base),
      };
    });
  };

  const toggleAnimalShowAward = (animalId: string, award: ShowAwardCode) => {
    updateAnimalShowResult(animalId, (prev) => {
      const hasAward = prev.awards.includes(award);
      return {
        ...prev,
        awards: hasAward
          ? prev.awards.filter((code) => code !== award)
          : [...prev.awards, award],
      };
    });
  };

  const handleUploadELegFiles = async (animalId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const existingCount = showResultsByAnimalId[animalId]?.eLegAttachments.length ?? 0;
    const remainingSlots = Math.max(0, MAX_SHOW_ELEG_ATTACHMENTS_PER_RESULT - existingCount);
    if (remainingSlots <= 0) {
      setShowPhotoError(
        `Maximum ${MAX_SHOW_ELEG_ATTACHMENTS_PER_RESULT} e-leg certificates per animal per show reached.`
      );
      return;
    }

    setShowPhotoBusyAnimalId(animalId);
    setShowPhotoError(null);
    const addedAttachments: ShowELegAttachment[] = [];
    try {
      const selected = Array.from(files).slice(0, remainingSlots);
      for (const file of selected) {
        const optimized = await optimizeImageFile(file, settings.imageOptimizationPreset);
        addedAttachments.push({
          id: `eleg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          fileName: optimized.originalFileName || file.name || 'e-leg-certificate',
          mimeType: optimized.mimeType,
          width: optimized.width,
          height: optimized.height,
          storedBytes: optimized.storedBytes,
          thumbnailDataUrl: optimized.thumbnailDataUrl,
          dataUrl: optimized.dataUrl,
          addedAtIso: new Date().toISOString(),
        });
      }
      if (addedAttachments.length > 0) {
        updateAnimalShowResult(animalId, (prev) => ({
          ...prev,
          eLegAttachments: [
            ...prev.eLegAttachments,
            ...addedAttachments,
          ].slice(0, MAX_SHOW_ELEG_ATTACHMENTS_PER_RESULT),
        }));
      }
    } catch (err) {
      setShowPhotoError(err instanceof Error ? err.message : 'Unable to process certificate image.');
    } finally {
      setShowPhotoBusyAnimalId(null);
    }
  };

  const executeSaveShow = async () => {
    if (!showName.trim() || !showDateIso) return;
    setPendingShowWithdrawalWarning(null);
    await showSubmitLock.runLocked(async () => {
      const enteredIds = showAnimalIds.slice(0, 50);
      const rawResults = enteredIds
        .map((id) => showResultsByAnimalId[id])
        .filter((r): r is ShowAnimalResult => Boolean(r));
      const cleanResults = normalizeShowResults(rawResults, { dropEmpty: true });
      const saved = await onSaveShow({
        ...(editingShowId ? { id: editingShowId } : {}),
        species: speciesProfile.name,
        name: showName.trim(),
        location: showLocation.trim(),
        sanctioningBody: showSanction,
        eventDateIso: showDateIso,
        entryDeadlineIso: showDeadlineIso,
        enteredAnimalIds: enteredIds,
        results: cleanResults.length > 0 ? cleanResults : undefined,
        notes: showNotes.trim(),
      });
      if (saved !== false) {
        setEditingShowId(null);
        setShowName('');
        setShowLocation('');
        setShowNotes('');
        setShowAnimalIds([]);
        setShowResultsByAnimalId({});
        setPendingShowWithdrawalWarning(null);
        setShowEditorOpen(false);
      }
    });
  };

  const submitShow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showName.trim() || !showDateIso) return;
    const enteredAnimals = showAnimalIds
      .map((id) => herdById.get(id))
      .filter((a): a is Animal => Boolean(a));
    const conflictEval = evaluateShowWithdrawalConflicts(
      enteredAnimals,
      showAnimalIds,
      careLogs,
      showDateIso,
      { withdrawalByAnimalIdOnShowDate: showDateWithdrawalByAnimalId }
    );
    if (conflictEval.hasConflict) {
      setPendingShowWithdrawalWarning(conflictEval);
      return;
    }
    await executeSaveShow();
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

        <div className="flex flex-wrap items-center gap-2">
          {onOpenImportExportHub && (
            <button
              type="button"
              onClick={() => onOpenImportExportHub('all')}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
              Import / Export Hub
            </button>
          )}
          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Settings className="w-3.5 h-3.5" aria-hidden="true" />
            Barn Settings
          </button>
        </div>
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
            <button
              type="button"
              onClick={() => onNavigate('economics')}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-2"
            >
              <DollarSign className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
              <span>Economics, Yields &amp; 4-H Books</span>
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

          <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-stretch gap-2 max-w-full">
            <button
              type="button"
              onClick={() => onNavigate('bench')}
              className="bg-[var(--barn-surface)] border-2 border-[var(--barn-sage)] hover:bg-[var(--barn-sage-tint)] rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 max-w-full transition-colors shadow-sm"
            >
              <span className="inline-flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] inline-flex items-center justify-center shrink-0">
                  <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-[var(--barn-ink)] leading-tight">
                    Barn Bench Mode
                  </span>
                  <span className="block text-[11px] text-[var(--barn-muted)] leading-tight">
                    Fast row weights, BCS &amp; trims
                  </span>
                </span>
              </span>
              <ArrowRight className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('memo')}
              className="bg-[var(--barn-sage-tint)] border-2 border-[var(--barn-sage)] hover:brightness-105 rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 max-w-full transition-all shadow-sm"
            >
              <span className="inline-flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] inline-flex items-center justify-center shrink-0">
                  <StickyNote className="w-4 h-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
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
              onClick={() => onNavigate('feed')}
              className="bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 max-w-full transition-colors"
            >
              <span className="inline-flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-sage)] inline-flex items-center justify-center shrink-0">
                  <Package className="w-4 h-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-[var(--barn-ink)] leading-tight">
                    Feed &amp; Lot Ledger
                  </span>
                  <span className="block text-[11px] text-[var(--barn-muted)] leading-tight font-mono tabular-nums">
                    {feedSummary.activeBatches} active lot{feedSummary.activeBatches === 1 ? '' : 's'}
                    {feedSummary.recallFlaggedBatches.length > 0
                      ? ` · ${feedSummary.recallFlaggedBatches.length} flagged`
                      : ''}
                  </span>
                </span>
              </span>
              <ArrowRight className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('economics')}
              className="bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 max-w-full transition-colors"
            >
              <span className="inline-flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-sage)] inline-flex items-center justify-center shrink-0">
                  <DollarSign className="w-4 h-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-[var(--barn-ink)] leading-tight">
                    Economics &amp; 4-H Ledger
                  </span>
                  <span className="block text-[11px] text-[var(--barn-muted)] leading-tight font-mono tabular-nums">
                    {activeData.ledgerEntries.length} ledger · {activeData.processingLogs.length} yield · {activeData.youthProjectBooks.length} 4-H
                  </span>
                </span>
              </span>
              <ArrowRight className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('crm')}
              className="bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 max-w-full transition-colors"
            >
              <span className="inline-flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-sage)] inline-flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-[var(--barn-ink)] leading-tight">
                    Client CRM &amp; Deposits
                  </span>
                  <span className="block text-[11px] text-[var(--barn-muted)] leading-tight font-mono tabular-nums">
                    {crmSummary.activeWaitlistCount} waitlist · {crmSummary.activeReservationsCount} holds
                    {crmSummary.overdueReminderCount + crmSummary.dueSoonReminderCount > 0
                      ? ` · ${crmSummary.overdueReminderCount + crmSummary.dueSoonReminderCount} due`
                      : ''}
                  </span>
                </span>
              </span>
              <ArrowRight className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={openBinderPreview}
              className="bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 max-w-full transition-colors"
            >
              <span className="inline-flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-sage)] inline-flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
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
            onClick={() => onNavigate('bench')}
            className="w-full sm:w-auto max-w-full bg-[var(--barn-surface)] border-2 border-[var(--barn-sage)] hover:bg-[var(--barn-sage-tint)] rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 transition-colors shadow-sm"
          >
            <span className="inline-flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] inline-flex items-center justify-center shrink-0">
                <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold text-[var(--barn-ink)] leading-tight">
                  Barn Bench Mode
                </span>
                <span className="block text-[11px] text-[var(--barn-muted)] leading-tight">
                  Fast row weights, BCS &amp; trims
                </span>
              </span>
            </span>
            <ArrowRight className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('feed')}
            className="w-full sm:w-auto max-w-full bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 transition-colors"
          >
            <span className="inline-flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-sage)] inline-flex items-center justify-center shrink-0">
                <Package className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold text-[var(--barn-ink)] leading-tight">
                  Feed &amp; Lot Ledger
                </span>
                <span className="block text-[11px] text-[var(--barn-muted)] leading-tight font-mono tabular-nums">
                  {feedSummary.activeBatches} active lot{feedSummary.activeBatches === 1 ? '' : 's'}
                </span>
              </span>
            </span>
            <ArrowRight className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('economics')}
            className="w-full sm:w-auto max-w-full bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 transition-colors"
          >
            <span className="inline-flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-sage)] inline-flex items-center justify-center shrink-0">
                <DollarSign className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold text-[var(--barn-ink)] leading-tight">
                  Economics &amp; 4-H Ledger
                </span>
                <span className="block text-[11px] text-[var(--barn-muted)] leading-tight font-mono tabular-nums">
                  {activeData.ledgerEntries.length} ledger · {activeData.youthProjectBooks.length} 4-H
                </span>
              </span>
            </span>
            <ArrowRight className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('crm')}
            className="w-full sm:w-auto max-w-full bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 transition-colors"
          >
            <span className="inline-flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-sage)] inline-flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold text-[var(--barn-ink)] leading-tight">
                  Client CRM &amp; Deposits
                </span>
                <span className="block text-[11px] text-[var(--barn-muted)] leading-tight font-mono tabular-nums">
                  {crmSummary.activeWaitlistCount} waitlist · {crmSummary.activeReservationsCount} holds
                  {crmSummary.overdueReminderCount + crmSummary.dueSoonReminderCount > 0
                    ? ` · ${crmSummary.overdueReminderCount + crmSummary.dueSoonReminderCount} due`
                    : ''}
                </span>
              </span>
            </span>
            <ArrowRight className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={openBinderPreview}
            className="w-full sm:w-auto max-w-full bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 transition-colors"
          >
            <span className="inline-flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-sage)] inline-flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
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
            className="w-full sm:w-auto max-w-full bg-[var(--barn-sage-tint)] border-2 border-[var(--barn-sage)] hover:brightness-105 rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 transition-all shadow-sm"
          >
            <span className="inline-flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] inline-flex items-center justify-center shrink-0">
                <StickyNote className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
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
            <div className="flex flex-wrap items-center gap-2 max-w-full">
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

      {/* Over-Capacity Housing Welfare Alert */}
      {cagesOccupancySummary.shouldShowOverCapacityAlert && (
        <section
          role="status"
          aria-label={`${speciesProfile.name} cages over capacity`}
          className="bg-[var(--barn-terracotta-tint)] border border-[var(--barn-danger)] rounded-2xl p-4 sm:p-5 space-y-2.5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <AlertTriangle
                className="w-5 h-5 text-[var(--barn-danger)] mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <div className="space-y-0.5">
                <h2 className="text-sm font-semibold text-[var(--barn-ink)] font-mono tabular-nums">
                  {cagesOccupancySummary.totalOverCapacityCount}{' '}
                  {speciesProfile.name}{' '}
                  {cagesOccupancySummary.totalOverCapacityCount === 1 ? 'Cage / Pen' : 'Cages / Pens'}{' '}
                  Over Capacity
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  {cagesOccupancySummary.overCapacityCages
                    .slice(0, 4)
                    .map((ev) => `${ev.cage.label} (${ev.ratioLabel})`)
                    .join(' · ')}
                  {cagesOccupancySummary.overCapacityCages.length > 4
                    ? ` · +${cagesOccupancySummary.overCapacityCages.length - 4} more`
                    : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('species-cages-block');
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-danger)]/50 text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              Review Cages
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
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
              feed: `${speciesProfile.name} Feed & Lot Ledger`,
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

                    <div className="flex flex-wrap items-center gap-2 max-w-full">
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
                          disabled={taskSubmitLock.isSubmitting}
                          onClick={() => setShowNewTaskForm(false)}
                          className="min-h-[36px] px-3 py-1 rounded-lg border border-[var(--barn-border)] text-xs disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={taskSubmitLock.isSubmitting}
                          aria-busy={taskSubmitLock.isSubmitting}
                          className="min-h-[36px] px-4 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-65"
                        >
                          {taskSubmitLock.isSubmitting && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                          )}
                          {taskSubmitLock.isSubmitting ? 'Saving...' : 'Save Chore'}
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
                        const linkedBreeding = t.linkedBreedingId
                          ? breedingById.get(t.linkedBreedingId)
                          : undefined;
                        const canQuickCheckoff =
                          !t.completed &&
                          Boolean(onCompleteBreedingTask) &&
                          Boolean(linkedBreeding && linkedBreeding.status !== 'Missed') &&
                          (isPalpationTask(t) || isBirthCheckTask(t));
                        const isRowBusy = taskToggleLock.isKeyLocked(t.id);
                        const isBirthTrayOpen =
                          canQuickCheckoff &&
                          isBirthCheckTask(t) &&
                          activeBirthCheckoffTaskId === t.id;

                        return (
                          <div
                            key={t.id}
                            id={`barn-task-${t.id}`}
                            className={`py-3 first:pt-1 last:pb-1 space-y-2 transition-colors ${
                              isHighlighted
                                ? 'rounded-xl px-2.5 -mx-2.5 bg-[var(--barn-sage)]/10 ring-2 ring-[var(--barn-sage)]'
                                : ''
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 sm:gap-3">
                              <div className="flex items-start gap-2.5 min-w-0">
                                <button
                                  type="button"
                                  disabled={isRowBusy}
                                  onClick={() => {
                                    if (isHighlighted) onClearHighlightedTask?.();
                                    void taskToggleLock.runKeyLocked(t.id, () => onToggleTask(t));
                                  }}
                                  aria-label={
                                    t.completed
                                      ? `Mark ${displayTitle} open`
                                      : `Complete ${displayTitle}`
                                  }
                                  className="min-h-[40px] min-w-[40px] -ml-2 rounded-lg flex items-center justify-center text-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] shrink-0 disabled:opacity-60"
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

                                  {canQuickCheckoff && onCompleteBreedingTask && linkedBreeding && (
                                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                      {isPalpationTask(t) ? (
                                        <>
                                          <button
                                            type="button"
                                            disabled={isRowBusy}
                                            onClick={() =>
                                              void taskToggleLock.runKeyLocked(t.id, () =>
                                                onCompleteBreedingTask(t, {
                                                  kind: 'palpated_positive',
                                                })
                                              )
                                            }
                                            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/50 text-xs font-semibold text-[var(--barn-ink)] hover:brightness-95 inline-flex items-center gap-1 disabled:opacity-55 whitespace-nowrap"
                                          >
                                            <Check className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                                            Palpated +
                                          </button>
                                          <button
                                            type="button"
                                            disabled={isRowBusy}
                                            onClick={() =>
                                              void taskToggleLock.runKeyLocked(t.id, () =>
                                                onCompleteBreedingTask(t, { kind: 'missed' })
                                              )
                                            }
                                            className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-xs font-medium text-[var(--barn-terracotta)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 disabled:opacity-55 whitespace-nowrap"
                                          >
                                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                                            Missed / Open
                                          </button>
                                        </>
                                      ) : (
                                        <>
                                          <button
                                            type="button"
                                            disabled={isRowBusy}
                                            aria-expanded={isBirthTrayOpen}
                                            onClick={() => {
                                              if (isBirthTrayOpen) {
                                                setActiveBirthCheckoffTaskId(null);
                                              } else {
                                                setActiveBirthCheckoffTaskId(t.id);
                                                setQuickBirthDateIso(
                                                  linkedBreeding.actualBirthDateIso || today
                                                );
                                                setQuickLiveCount(
                                                  String(linkedBreeding.liveCount || 0)
                                                );
                                                setQuickStillbornCount(
                                                  String(linkedBreeding.stillbornCount || 0)
                                                );
                                                setQuickShiftPostBirth(true);
                                              }
                                            }}
                                            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/50 text-xs font-semibold text-[var(--barn-ink)] hover:brightness-95 inline-flex items-center gap-1 disabled:opacity-55 whitespace-nowrap"
                                          >
                                            <Check className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                                            Log {speciesProfile.birthEventLabel}
                                          </button>
                                          <button
                                            type="button"
                                            disabled={isRowBusy}
                                            onClick={() =>
                                              void taskToggleLock.runKeyLocked(t.id, () =>
                                                onCompleteBreedingTask(t, { kind: 'missed' })
                                              )
                                            }
                                            className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-xs font-medium text-[var(--barn-terracotta)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 disabled:opacity-55 whitespace-nowrap"
                                          >
                                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                                            Missed / Open
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  )}
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
                                  onClick={() => {
                                    if (activeBirthCheckoffTaskId === t.id) {
                                      setActiveBirthCheckoffTaskId(null);
                                    }
                                    onDeleteTask(t.id);
                                  }}
                                  aria-label={`Delete chore ${displayTitle}`}
                                  className="min-h-[36px] min-w-[36px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {isBirthTrayOpen && onCompleteBreedingTask && (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void taskToggleLock.runKeyLocked(t.id, async () => {
                                    const res = await onCompleteBreedingTask(t, {
                                      kind: 'birth_recorded',
                                      actualBirthDateIso: quickBirthDateIso || today,
                                      liveCount: Math.max(0, Math.round(Number(quickLiveCount) || 0)),
                                      stillbornCount: Math.max(
                                        0,
                                        Math.round(Number(quickStillbornCount) || 0)
                                      ),
                                      shiftPostBirthTasks: quickShiftPostBirth,
                                    });
                                    if (res !== false) {
                                      setActiveBirthCheckoffTaskId(null);
                                    }
                                  });
                                }}
                                className="ml-8 p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs"
                              >
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  <div>
                                    <label
                                      htmlFor={`${baseId}-qb-date-${t.id}`}
                                      className="block text-[11px] text-[var(--barn-muted)] mb-1"
                                    >
                                      {speciesProfile.birthEventLabel} Date
                                    </label>
                                    <input
                                      id={`${baseId}-qb-date-${t.id}`}
                                      type="date"
                                      required
                                      value={quickBirthDateIso}
                                      onChange={(e) => setQuickBirthDateIso(e.target.value)}
                                      className="w-full min-h-[36px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono"
                                    />
                                  </div>
                                  <div>
                                    <label
                                      htmlFor={`${baseId}-qb-live-${t.id}`}
                                      className="block text-[11px] text-[var(--barn-muted)] mb-1"
                                    >
                                      Live Born
                                    </label>
                                    <input
                                      id={`${baseId}-qb-live-${t.id}`}
                                      type="number"
                                      min={0}
                                      value={quickLiveCount}
                                      onChange={(e) => setQuickLiveCount(e.target.value)}
                                      className="w-full min-h-[36px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono tabular-nums"
                                    />
                                  </div>
                                  <div>
                                    <label
                                      htmlFor={`${baseId}-qb-still-${t.id}`}
                                      className="block text-[11px] text-[var(--barn-muted)] mb-1"
                                    >
                                      Stillborn
                                    </label>
                                    <input
                                      id={`${baseId}-qb-still-${t.id}`}
                                      type="number"
                                      min={0}
                                      value={quickStillbornCount}
                                      onChange={(e) => setQuickStillbornCount(e.target.value)}
                                      className="w-full min-h-[36px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono tabular-nums"
                                    />
                                  </div>
                                </div>
                                <label className="flex items-center gap-2 text-[11px] text-[var(--barn-muted)] cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={quickShiftPostBirth}
                                    onChange={(e) => setQuickShiftPostBirth(e.target.checked)}
                                    className="accent-[var(--barn-sage)]"
                                  />
                                  Shift pending weaning/rebreed chores to actual date
                                </label>
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    disabled={isRowBusy}
                                    onClick={() => setActiveBirthCheckoffTaskId(null)}
                                    className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] text-xs"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={isRowBusy}
                                    className="min-h-[34px] px-3.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
                                  >
                                    {isRowBusy && (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                                    )}
                                    Save &amp; Complete
                                  </button>
                                </div>
                              </form>
                            )}
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

                    <div className="flex flex-wrap items-center gap-2 max-w-full">
                      {renderReorderControls()}
                      <button
                        type="button"
                        onClick={() => onNavigate('breeding')}
                        className="min-h-[38px] max-w-full px-3.5 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)]"
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
                      {activeGestations.map((b) => {
                        const staleCount = stalePostBirthByBreedingId.get(b.id) ?? 0;
                        return (
                          <div key={b.id} className="py-3.5 first:pt-1 last:pb-1 space-y-1.5">
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-medium text-sm">
                                {b.damName} × {b.sireName}
                              </div>
                              <span className="text-xs font-mono tabular-nums text-[var(--barn-sage)] font-medium">
                                {formatBreedingStatusForSpecies(b.status, speciesProfile)} · COI{' '}
                                {b.projectedCoiPercent.toFixed(2)}%
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs text-[var(--barn-muted)] font-mono tabular-nums">
                                Bred {formatReadableDate(b.bredDateIso)} ·{' '}
                                {b.actualBirthDateIso
                                  ? `${speciesProfile.birthEventLabel}: ${formatReadableDate(
                                      b.actualBirthDateIso
                                    )}`
                                  : `Expected ${speciesProfile.birthEventLabel}: ${formatReadableDate(
                                      b.expectedDueDateIso
                                    )}`}
                                {b.liveCount > 0
                                  ? ` · ${b.liveCount} live ${speciesProfile.offspringLabel}s`
                                  : ''}
                              </div>
                              {staleCount > 0 && onRecalculatePostBirthTasks && (
                                <button
                                  type="button"
                                  disabled={breedingRecalcLock.isKeyLocked(b.id)}
                                  onClick={() =>
                                    void breedingRecalcLock.runKeyLocked(b.id, () =>
                                      onRecalculatePostBirthTasks(b.id)
                                    )
                                  }
                                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] text-xs font-semibold text-[var(--barn-ink)] hover:brightness-95 inline-flex items-center gap-1 disabled:opacity-55 whitespace-nowrap"
                                >
                                  {breedingRecalcLock.isKeyLocked(b.id) ? (
                                    <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                                  ) : (
                                    <RefreshCw className="w-3 h-3 text-[var(--barn-sage)]" aria-hidden="true" />
                                  )}
                                  Shift {staleCount} Post-Birth Chore{staleCount === 1 ? '' : 's'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      </div>
                    </>
                  )}
                </section>
              );
            }

            if (blockId === 'cages') {
              return (
                <section
                  id="species-cages-block"
                  key={blockId}
                  {...dragProps}
                  className={cardClass}
                >
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
                          Visual hutch-row board, feedlot links &amp; QR cage cards
                          {cagesOccupancySummary.shouldShowOverCapacityAlert && (
                            <span className="ml-1.5 font-semibold text-[var(--barn-danger)] font-mono tabular-nums">
                              · {cagesOccupancySummary.totalOverCapacityCount} over capacity
                            </span>
                          )}
                          {facilityBoardModel.totals.maintenanceDueOrOverdue > 0 && (
                            <span className="ml-1.5 font-semibold text-[var(--barn-terracotta)] font-mono tabular-nums">
                              · {facilityBoardModel.totals.maintenanceDueOrOverdue} maint due
                            </span>
                          )}
                          {facilityBoardModel.totals.lowFeedPens > 0 && (
                            <span className="ml-1.5 font-semibold text-[var(--barn-terracotta)] font-mono tabular-nums">
                              · {facilityBoardModel.totals.lowFeedPens} low feed
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 max-w-full">
                      {renderReorderControls()}
                      <div
                        role="group"
                        aria-label="Housing view mode"
                        className="inline-flex rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-0.5"
                      >
                        <button
                          type="button"
                          onClick={() => setCageViewMode('board')}
                          aria-pressed={cageViewMode === 'board'}
                          title="Visual Hutch-Row & Pen Board"
                          className={`min-h-[32px] px-2 py-1 rounded-md text-[11px] font-medium inline-flex items-center gap-1 ${
                            cageViewMode === 'board'
                              ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold'
                              : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                          }`}
                        >
                          <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Board</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCageViewMode('list')}
                          aria-pressed={cageViewMode === 'list'}
                          title="Compact Cage List"
                          className={`min-h-[32px] px-2 py-1 rounded-md text-[11px] font-medium inline-flex items-center gap-1 ${
                            cageViewMode === 'list'
                              ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold'
                              : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                          }`}
                        >
                          <List className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>List</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowFullFacilityBoard(true)}
                        title="Expand full-screen Hutch-Row & Pasture Board"
                        className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1"
                      >
                        <Maximize2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span className="hidden sm:inline">Expand</span>
                      </button>
                      {facilityBoardModel.totals.totalOccupants > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const allHoused = facilityBoardModel.sections.flatMap((s) =>
                              s.pens.flatMap((p) => p.occupancy.occupants)
                            );
                            handlePrintCageCardsForAnimals(
                              allHoused,
                              `${speciesProfile.name} Facility`
                            );
                          }}
                          title="Print QR-coded cage cards for all housed animals"
                          className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1"
                        >
                          <QrCode className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span className="hidden sm:inline">QR Cards</span>
                        </button>
                      )}
                      <button
                        type="button"
                        aria-expanded={showNewCageForm}
                        onClick={() => setShowNewCageForm((v) => !v)}
                        className="min-h-[38px] max-w-full px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>Add Location</span>
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
                          max={999}
                          value={cageCapacity}
                          onChange={(e) => setCageCapacity(e.target.value)}
                          aria-label="Cage capacity"
                          className="min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          aria-label="Row or barn section"
                          placeholder="Row / Barn Section (e.g., Row A, North Pasture)"
                          value={cageSection}
                          onChange={(e) => setCageSection(e.target.value)}
                          className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                        />
                        <select
                          aria-label="Housing unit type"
                          value={cageUnitType}
                          onChange={(e) =>
                            setCageUnitType(e.target.value as HousingUnitType | '')
                          }
                          className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                        >
                          <option value="">Unit Type (Auto-detect)</option>
                          {HOUSING_UNIT_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCageAdvancedFields((v) => !v)}
                        className="text-[11px] font-medium text-[var(--barn-sage)] hover:underline"
                      >
                        {showCageAdvancedFields
                          ? 'Hide Feedlot Inventory & Maintenance Schedule'
                          : '+ Link Feedlot Inventory & Recurring Maintenance (Optional)'}
                      </button>
                      {showCageAdvancedFields && (
                        <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="text"
                              aria-label="Feedlot or feed bin name"
                              placeholder="Feedlot / Bin (e.g., 16% Pellet Bin)"
                              value={cageFeedLotName}
                              onChange={(e) => setCageFeedLotName(e.target.value)}
                              className="sm:col-span-2 min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                            />
                            <input
                              type="text"
                              aria-label="Daily ration note"
                              placeholder="Daily ration (e.g., 4 oz/head)"
                              value={cageDailyRationNote}
                              onChange={(e) => setCageDailyRationNote(e.target.value)}
                              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <input
                              type="number"
                              min={0}
                              step="0.5"
                              aria-label="Feed stock remaining"
                              placeholder="Stock qty"
                              value={cageFeedStockRemaining}
                              onChange={(e) => setCageFeedStockRemaining(e.target.value)}
                              className="min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                            />
                            <input
                              type="text"
                              aria-label="Feed stock unit"
                              placeholder="Unit (lbs/bales)"
                              value={cageFeedStockUnit}
                              onChange={(e) => setCageFeedStockUnit(e.target.value)}
                              className="min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                            />
                            <input
                              type="number"
                              min={0}
                              step="0.5"
                              aria-label="Low feed warning threshold"
                              placeholder="Low alert at"
                              value={cageFeedLowThreshold}
                              onChange={(e) => setCageFeedLowThreshold(e.target.value)}
                              className="min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="text"
                              aria-label="Recurring maintenance task label"
                              placeholder="Maintenance task (e.g., Sanitize & bedding)"
                              value={cageMaintLabel}
                              onChange={(e) => setCageMaintLabel(e.target.value)}
                              className="sm:col-span-2 min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                            />
                            <input
                              type="number"
                              min={1}
                              max={365}
                              aria-label="Maintenance interval in days"
                              placeholder="Every N days"
                              value={cageMaintIntervalDays}
                              onChange={(e) => setCageMaintIntervalDays(e.target.value)}
                              className="min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                            />
                          </div>
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={cageSubmitLock.isSubmitting}
                          onClick={() => setShowNewCageForm(false)}
                          className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] text-xs disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={cageSubmitLock.isSubmitting}
                          aria-busy={cageSubmitLock.isSubmitting}
                          className="min-h-[34px] px-3.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-65"
                        >
                          {cageSubmitLock.isSubmitting && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                          )}
                          {cageSubmitLock.isSubmitting ? 'Saving...' : 'Save Location'}
                        </button>
                      </div>
                    </form>
                  )}

                  {cageViewMode === 'board' ? (
                    <FacilityPenBoard
                      speciesProfile={speciesProfile}
                      cages={cages}
                      animals={animals}
                      assignableAnimals={assignableAnimals}
                      boardModel={facilityBoardModel}
                      highlightedCageId={highlightedCageId}
                      onClearHighlightedCage={onClearHighlightedCage}
                      onOpenAnimal={onOpenAnimal}
                      onSaveCage={onSaveCage}
                      onDeleteCage={onDeleteCage}
                      onAssignAnimalToCage={onAssignAnimalToCage}
                      onSaveTask={onSaveTask}
                      onPrintCageCardsForAnimals={handlePrintCageCardsForAnimals}
                      feedBatches={feedBatches}
                      onOpenFeedLedger={() => onNavigate('feed')}
                    />
                  ) : cages.length === 0 ? (
                    <p className="text-sm text-[var(--barn-muted)]">No locations added yet.</p>
                  ) : (
                    <div className="divide-y divide-[var(--barn-border)] max-h-[28rem] overflow-y-auto">
                      {cages.map((c) => {
                        const evalItem = cagesOccupancySummary.byCageId.get(c.id);
                        const occupants = evalItem?.occupants ?? [];
                        const capacity = evalItem?.capacity ?? Math.max(1, Number(c.capacity) || 1);
                        const isOverCapacity = evalItem?.isOverCapacity ?? false;
                        const isAtCapacity = evalItem?.isAtCapacity ?? false;
                        const ratioLabel =
                          evalItem?.ratioLabel ?? `${occupants.length}/${capacity}`;

                        const cageKey = normalizeCageLabelKey(c.label);
                        const candidateAnimals = assignableAnimals.filter(
                          (a) => normalizeCageLabelKey(a.cageLocation) !== cageKey
                        );
                        const unassignedCandidates = candidateAnimals.filter(
                          (a) => !a.cageLocation.trim()
                        );
                        const otherCageCandidates = candidateAnimals.filter(
                          (a) => Boolean(a.cageLocation.trim())
                        );

                        const isEditingThisCage = editingCageId === c.id;
                        const isAssignBusy = cageAssignLock.isKeyLocked(c.id);
                        const isEditBusy = cageAssignLock.isKeyLocked(`edit:${c.id}`);
                        const pendingConfirmForCage =
                          pendingCageAssignConfirm?.cageId === c.id
                            ? pendingCageAssignConfirm
                            : null;

                        return (
                          <div key={c.id} className="py-3 space-y-2 text-xs">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span className="font-mono font-semibold text-sm text-[var(--barn-ink)]">
                                    {c.label}
                                  </span>
                                  <span className="text-[var(--barn-muted)]">
                                    · {c.section || 'Barn'} ·
                                  </span>
                                  <span
                                    className={`font-mono tabular-nums inline-flex items-center gap-1 ${
                                      isOverCapacity
                                        ? 'font-semibold text-[var(--barn-danger)]'
                                        : isAtCapacity
                                          ? 'font-semibold text-[var(--barn-terracotta)]'
                                          : 'text-[var(--barn-muted)]'
                                    }`}
                                  >
                                    {isOverCapacity && (
                                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                    )}
                                    {ratioLabel}
                                  </span>
                                </div>

                                {occupants.length > 0 ? (
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--barn-ink)]">
                                    {occupants.map((occ) => {
                                      const unassignBusy = cageAssignLock.isKeyLocked(
                                        `unassign:${occ.id}`
                                      );
                                      return (
                                        <span
                                          key={occ.id}
                                          className="inline-flex items-center gap-1 rounded-md border border-[var(--barn-border)] bg-[var(--barn-canvas)] px-2 py-0.5"
                                        >
                                          <button
                                            type="button"
                                            onClick={() => onOpenAnimal(occ.id)}
                                            className="font-medium hover:text-[var(--barn-sage)] hover:underline text-left"
                                          >
                                            {occ.name}
                                            {occ.tattoo ? (
                                              <span className="font-mono text-[11px] text-[var(--barn-muted)] ml-1">
                                                ({occ.tattoo})
                                              </span>
                                            ) : null}
                                          </button>
                                          {onAssignAnimalToCage && (
                                            <button
                                              type="button"
                                              disabled={unassignBusy}
                                              onClick={() => void handleUnassignFromCage(c.id, occ.id)}
                                              aria-label={`Remove ${occ.name} from ${c.label}`}
                                              title={`Remove ${occ.name} from ${c.label}`}
                                              className="min-h-[22px] min-w-[22px] rounded text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center disabled:opacity-45"
                                            >
                                              <X className="w-3 h-3" aria-hidden="true" />
                                            </button>
                                          )}
                                        </span>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="text-[var(--barn-muted)]">Open / Unassigned</div>
                                )}
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isEditingThisCage) {
                                      setEditingCageId(null);
                                    } else {
                                      setEditingCageId(c.id);
                                      setEditingCageLabel(c.label);
                                      setEditingCageSection(c.section || '');
                                      setEditingCageCapacity(String(capacity));
                                    }
                                  }}
                                  aria-label={`Edit ${c.label} capacity or section`}
                                  title="Edit capacity or section"
                                  className="min-h-[36px] min-w-[36px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
                                >
                                  <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (editingCageId === c.id) setEditingCageId(null);
                                    if (pendingCageAssignConfirm?.cageId === c.id) {
                                      setPendingCageAssignConfirm(null);
                                    }
                                    onDeleteCage(c.id);
                                  }}
                                  aria-label={`Remove location ${c.label}`}
                                  title={`Remove ${c.label}`}
                                  className="min-h-[36px] min-w-[36px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
                                >
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              </div>
                            </div>

                            {isEditingThisCage && (
                              <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  <input
                                    type="text"
                                    aria-label={`Edit label for ${c.label}`}
                                    value={editingCageLabel}
                                    onChange={(e) => setEditingCageLabel(e.target.value)}
                                    placeholder="Label"
                                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono"
                                  />
                                  <input
                                    type="text"
                                    aria-label={`Edit section for ${c.label}`}
                                    value={editingCageSection}
                                    onChange={(e) => setEditingCageSection(e.target.value)}
                                    placeholder="Section"
                                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                                  />
                                  <input
                                    type="number"
                                    min={1}
                                    max={999}
                                    aria-label={`Edit capacity for ${c.label}`}
                                    value={editingCageCapacity}
                                    onChange={(e) => setEditingCageCapacity(e.target.value)}
                                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                                  />
                                </div>
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    disabled={isEditBusy}
                                    onClick={() => setEditingCageId(null)}
                                    className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isEditBusy || !editingCageLabel.trim()}
                                    onClick={() => void handleSaveEditedCage(c)}
                                    className="min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-55"
                                  >
                                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                    {isEditBusy ? 'Saving...' : 'Save'}
                                  </button>
                                </div>
                              </div>
                            )}

                            {onAssignAnimalToCage && candidateAnimals.length > 0 && (
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="relative flex-1 min-w-[200px] max-w-sm">
                                  <UserPlus
                                    className="w-3.5 h-3.5 text-[var(--barn-muted)] pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
                                    aria-hidden="true"
                                  />
                                  <select
                                    aria-label={`Assign animal to ${c.label}`}
                                    disabled={isAssignBusy}
                                    value=""
                                    onChange={(e) => {
                                      const picked = e.target.value;
                                      if (picked) {
                                        void handleQuickAssignSelect(c, picked);
                                      }
                                    }}
                                    className="w-full min-h-[36px] pl-8 pr-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-ink)] disabled:opacity-55"
                                  >
                                    <option value="">
                                      {isAssignBusy
                                        ? 'Assigning...'
                                        : isOverCapacity || isAtCapacity
                                          ? `Quick assign to ${c.label} (at/over capacity)...`
                                          : `Quick assign animal to ${c.label}...`}
                                    </option>
                                    {unassignedCandidates.length > 0 && (
                                      <optgroup label="Unassigned Animals">
                                        {unassignedCandidates.map((a) => (
                                          <option key={a.id} value={a.id}>
                                            {a.name}
                                            {a.tattoo ? ` (${a.tattoo})` : ''}
                                          </option>
                                        ))}
                                      </optgroup>
                                    )}
                                    {otherCageCandidates.length > 0 && (
                                      <optgroup label="Move from Another Cage">
                                        {otherCageCandidates.map((a) => (
                                          <option key={a.id} value={a.id}>
                                            {a.name}
                                            {a.tattoo ? ` (${a.tattoo})` : ''} — in {a.cageLocation}
                                          </option>
                                        ))}
                                      </optgroup>
                                    )}
                                  </select>
                                </div>
                              </div>
                            )}

                            {pendingConfirmForCage && (
                              <div
                                role="alert"
                                className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-danger)] space-y-2 text-xs"
                              >
                                <div className="flex items-start gap-2">
                                  <AlertTriangle
                                    className="w-4 h-4 text-[var(--barn-danger)] mt-0.5 shrink-0"
                                    aria-hidden="true"
                                  />
                                  <div className="space-y-0.5">
                                    <div className="font-semibold text-[var(--barn-ink)]">
                                      {pendingConfirmForCage.warning.headline}
                                    </div>
                                    <p className="text-[var(--barn-muted)]">
                                      {pendingConfirmForCage.warning.detail}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex flex-wrap justify-end gap-2">
                                  <button
                                    type="button"
                                    disabled={isAssignBusy}
                                    onClick={() => setPendingCageAssignConfirm(null)}
                                    className="min-h-[32px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)]"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isAssignBusy}
                                    onClick={() => void handleConfirmOverCapacityAssign()}
                                    className="min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] text-xs font-semibold hover:opacity-95 disabled:opacity-55"
                                  >
                                    {isAssignBusy ? 'Assigning...' : 'Assign Anyway'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            }

            if (blockId === 'shows') {
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

                  <div className="flex flex-wrap items-center gap-2 max-w-full">
                    {renderReorderControls()}
                    <button
                      type="button"
                      aria-expanded={showEditorOpen}
                      onClick={openNewShowEditor}
                      className="min-h-[38px] max-w-full px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>Add Show</span>
                    </button>
                  </div>
                </div>

                {shows.length === 0 ? (
                  <p className="text-sm text-[var(--barn-muted)]">
                    No shows scheduled. Click &ldquo;Add Show&rdquo; to track entries, placements,
                    awards, judge notes, and E-Leg certificates.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--barn-border)]">
                    {shows.map((s) => {
                      const mergedIds = mergeEnteredAnimalIdsWithResults(
                        s.enteredAnimalIds ?? [],
                        s.results
                      );
                      const resultsByAnimal = new Map(
                        (s.results ?? []).map((r) => [r.animalId, r])
                      );
                      const totalLegsInShow = (s.results ?? []).reduce(
                        (acc, r) => acc + (r.legsEarned || 0),
                        0
                      );
                      const totalELegsInShow = (s.results ?? []).reduce(
                        (acc, r) => acc + (r.eLegAttachments?.length || 0),
                        0
                      );

                      return (
                        <div key={s.id} className="py-3.5 first:pt-1 last:pb-1 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-semibold">{s.name}</span>
                                {totalLegsInShow > 0 && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-[var(--barn-sage-tint)] text-[var(--barn-sage)] font-mono text-[10px] font-semibold">
                                    {totalLegsInShow} Leg{totalLegsInShow === 1 ? '' : 's'}
                                  </span>
                                )}
                                {totalELegsInShow > 0 && (
                                  <span className="px-1.5 py-0.5 rounded-md border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[var(--barn-ink)] font-mono text-[10px]">
                                    {totalELegsInShow} E-Leg Vault
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-[var(--barn-muted)]">
                                {s.sanctioningBody} · {formatReadableDate(s.eventDateIso)}
                                {s.location ? ` · ${s.location}` : ''}
                                {s.entryDeadlineIso
                                  ? ` · Deadline ${formatReadableDate(s.entryDeadlineIso)}`
                                  : ''}
                              </div>
                              {s.notes && (
                                <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
                                  {s.notes}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => openShowDocumentPreview(s, 'entry_form')}
                                title="Preview, print, or email ARBA Show Entry Form"
                                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap"
                              >
                                <FileText className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                                <span>Entry Form</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openShowDocumentPreview(s, 'remark_cards')}
                                title="Print 4-up or 1-up Show Remark Cards"
                                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap"
                              >
                                <Printer className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                                <span>Remark Cards</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditShowEditor(s)}
                                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap"
                              >
                                <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Results</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteShow(s.id)}
                                aria-label={`Remove ${s.name}`}
                                className="min-h-[34px] min-w-[34px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {mergedIds.length > 0 && (
                            <div className="space-y-1.5 pt-0.5">
                              {mergedIds.map((animalId) => {
                                const animal = herdById.get(animalId);
                                const res = resultsByAnimal.get(animalId);
                                if (!animal && !res) return null;
                                return (
                                  <div
                                    key={animalId}
                                    className="px-2.5 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs space-y-1"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <button
                                        type="button"
                                        onClick={() => onOpenAnimal(animalId)}
                                        className="font-semibold text-[var(--barn-ink)] hover:text-[var(--barn-sage)] underline text-left"
                                      >
                                        {animal
                                          ? `${animal.name}${animal.tattoo ? ` (${animal.tattoo})` : ''}`
                                          : 'Unknown Animal'}
                                      </button>
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        {res?.classPlacement && (
                                          <span className="px-1.5 py-0.5 rounded bg-[var(--barn-surface)] border border-[var(--barn-border)] font-medium text-[10.5px]">
                                            {res.classPlacement}
                                          </span>
                                        )}
                                        {res?.awards.map((code) => (
                                          <span
                                            key={code}
                                            className="px-1.5 py-0.5 rounded bg-[var(--barn-sage-tint)] text-[var(--barn-sage)] font-mono font-semibold text-[10px]"
                                          >
                                            {code}
                                          </span>
                                        ))}
                                        {(res?.legsEarned ?? 0) > 0 && (
                                          <span className="px-1.5 py-0.5 rounded bg-[var(--barn-terracotta-tint)] text-[var(--barn-terracotta)] font-mono font-semibold text-[10px]">
                                            +{res!.legsEarned} Leg{res!.legsEarned === 1 ? '' : 's'}
                                          </span>
                                        )}
                                        {(res?.pointsEarned ?? 0) > 0 && (
                                          <span className="font-mono text-[10.5px] text-[var(--barn-muted)]">
                                            {res!.pointsEarned} pts
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    {(res?.judgeName || res?.judgeNotes || res?.legCertificateNumber) && (
                                      <div className="text-[11px] text-[var(--barn-muted)]">
                                        {res.judgeName ? `Judge: ${res.judgeName}` : ''}
                                        {res.judgeName && res.legCertificateNumber ? ' · ' : ''}
                                        {res.legCertificateNumber
                                          ? `Cert #${res.legCertificateNumber}`
                                          : ''}
                                        {(res.judgeName || res.legCertificateNumber) && res.judgeNotes
                                          ? ' — '
                                          : ''}
                                        {res.judgeNotes}
                                      </div>
                                    )}
                                    {(res?.eLegAttachments?.length ?? 0) > 0 && (
                                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                        {res!.eLegAttachments.map((att) => (
                                          <button
                                            key={att.id}
                                            type="button"
                                            onClick={() =>
                                              setELegLightbox({
                                                imageUrl: att.dataUrl || att.thumbnailDataUrl,
                                                title: `${animal?.name || 'Animal'} — ${s.name}`,
                                                subtitle: [
                                                  att.caption || att.fileName,
                                                  res?.legCertificateNumber
                                                    ? `Cert #${res.legCertificateNumber}`
                                                    : '',
                                                  formatReadableDate(s.eventDateIso),
                                                ]
                                                  .filter(Boolean)
                                                  .join(' · '),
                                              })
                                            }
                                            className="group relative w-11 h-11 rounded-lg overflow-hidden border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:border-[var(--barn-sage)]"
                                            title={att.caption || att.fileName}
                                          >
                                            <img
                                              src={att.thumbnailDataUrl || att.dataUrl}
                                              alt={att.caption || att.fileName}
                                              className="w-full h-full object-cover"
                                            />
                                          </button>
                                        ))}
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
                )}
              </section>
            );
          }

          if (blockId === 'feed') {
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
                          Feed Inventory &amp; Lot Ledger ({feedBatches.length})
                        </h2>
                        <span className="text-[11px] font-mono text-[var(--barn-muted)] tabular-nums shrink-0">
                          #{index + 1}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--barn-muted)]">
                        Mill lot OCR stamps, intake allocations &amp; 30/60/90d tag biosecurity purge
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 max-w-full">
                    {renderReorderControls()}
                    <button
                      type="button"
                      onClick={() => onNavigate('feed')}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Package className="w-3.5 h-3.5" aria-hidden="true" />
                      Open Feed Ledger
                    </button>
                  </div>
                </div>

                {feedSummary.recallFlaggedBatches.length > 0 && (
                  <div className="rounded-xl border border-[var(--barn-danger)] bg-[var(--barn-terracotta-tint)] px-3 py-2 text-xs text-[var(--barn-ink)] flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {feedSummary.recallFlaggedBatches.length} lot(s) flagged for recall check
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigate('feed')}
                      className="text-xs font-semibold underline text-[var(--barn-danger)] shrink-0"
                    >
                      Trace Lots
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] p-3 text-xs">
                  <div>
                    <div className="text-[10.5px] text-[var(--barn-muted)]">Active Stock</div>
                    <div className="font-mono font-semibold tabular-nums truncate">
                      {feedSummary.totalsByUnit.length > 0
                        ? feedSummary.totalsByUnit.map((t) => `${t.remaining} ${t.unit}`).join(' · ')
                        : '0 lbs'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10.5px] text-[var(--barn-muted)]">Indexed Lots</div>
                    <div className="font-mono font-semibold tabular-nums">
                      {feedSummary.lotsIndexedCount} / {feedSummary.totalBatches}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10.5px] text-[var(--barn-muted)]">Tag Photos</div>
                    <div className="font-mono font-semibold tabular-nums inline-flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                      {feedSummary.retainedTagPhotosCount} kept
                    </div>
                  </div>
                </div>

                {feedBatches.length === 0 ? (
                  <p className="text-xs text-[var(--barn-muted)]">
                    No {speciesProfile.name} feed batches logged yet. Scan a sewn bag tag or record a
                    purchase to track mill lots and cage intake.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl bg-[var(--barn-canvas)]">
                    {feedBatches.slice(0, 3).map((b) => {
                      const low = isFeedBatchLowStock(b);
                      return (
                        <div
                          key={b.id}
                          className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-[var(--barn-ink)] truncate">
                              {[b.brand, b.productName].filter(Boolean).join(' · ')}
                            </div>
                            <div className="text-[11px] font-mono text-[var(--barn-muted)] truncate">
                              {b.lotNumber ? `Lot ${b.lotNumber}` : 'No lot indexed'} ·{' '}
                              {formatReadableDate(b.purchaseDateIso)}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div
                              className={`font-mono tabular-nums font-semibold ${
                                b.recallFlagged
                                  ? 'text-[var(--barn-danger)]'
                                  : low
                                    ? 'text-[var(--barn-terracotta)]'
                                    : 'text-[var(--barn-ink)]'
                              }`}
                            >
                              {b.remainingQuantity} {b.bagWeightUnit}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          }

          return null;
        })}
        </div>
      </div>

      {/* Dedicated Per-Species Hub Settings at Bottom */}
      {speciesSettingsSection}

      {/* Full-Screen Hutch-Row & Facility Pen Board Modal */}
      {showFullFacilityBoard && (
        <FacilityPenBoard
          fullScreen
          onCloseFullScreen={() => setShowFullFacilityBoard(false)}
          speciesProfile={speciesProfile}
          cages={cages}
          animals={animals}
          assignableAnimals={assignableAnimals}
          boardModel={facilityBoardModel}
          highlightedCageId={highlightedCageId}
          onClearHighlightedCage={onClearHighlightedCage}
          onOpenAnimal={(animalId) => {
            setShowFullFacilityBoard(false);
            onOpenAnimal(animalId);
          }}
          onSaveCage={onSaveCage}
          onDeleteCage={onDeleteCage}
          onAssignAnimalToCage={onAssignAnimalToCage}
          onSaveTask={onSaveTask}
          onPrintCageCardsForAnimals={handlePrintCageCardsForAnimals}
          feedBatches={feedBatches}
          onOpenFeedLedger={() => {
            setShowFullFacilityBoard(false);
            onNavigate('feed');
          }}
        />
      )}

      {/* QR-Coded Cage Cards Print Preview (Single Thermal Card or 8-Up Batch Sheet) */}
      {cageQrPreviewDoc && (
        <PrintPreviewModal
          title={cageQrPreviewDoc.title}
          filename={cageQrPreviewDoc.filename}
          htmlContent={cageQrPreviewDoc.html}
          includeCageCardQr={
            cageQrPreviewDoc.mode === 'single' ? includeSingleCardQr : undefined
          }
          onToggleIncludeCageCardQr={
            cageQrPreviewDoc.mode === 'single' ? setIncludeSingleCardQr : undefined
          }
          batchPrintOptions={
            cageQrPreviewDoc.mode === 'batch' ? cageBatchPrintOptions : undefined
          }
          onChangeBatchPrintOptions={
            cageQrPreviewDoc.mode === 'batch' ? setCageBatchPrintOptions : undefined
          }
          batchAnimalCount={
            cageQrPreviewDoc.mode === 'batch' ? cageQrPrintState?.animals.length : undefined
          }
          headerNotice={
            <p className="text-[11px] text-[var(--barn-muted)]">
              Scanning any printed QR code with a phone camera opens that animal&apos;s local
              profile directly in this PWA.
            </p>
          }
          onClose={() => setCageQrPrintState(null)}
        />
      )}

      {/* Show Entry Form & Remark Cards Print / Email Preview */}
      {showDocPreview && renderedShowDocument && (
        <PrintPreviewModal
          title={renderedShowDocument.title}
          filename={renderedShowDocument.filename}
          htmlContent={renderedShowDocument.html}
          mailtoUrl={renderedShowDocument.mailtoUrl}
          plainTextSummary={renderedShowDocument.plainTextSummary}
          onClose={() => setShowDocPreview(null)}
          extraToolbarContent={
            <div className="w-full flex flex-wrap items-end gap-2 pt-2 border-t border-[var(--barn-border)] text-xs">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--barn-muted)]">
                  Document
                </span>
                <select
                  value={showDocPreview.kind}
                  onChange={(e) =>
                    setShowDocPreview((prev) =>
                      prev
                        ? {
                            ...prev,
                            kind: e.target.value === 'remark_cards' ? 'remark_cards' : 'entry_form',
                          }
                        : prev
                    )
                  }
                  className="min-h-[32px] px-2 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs"
                >
                  <option value="entry_form">Show Entry Form</option>
                  <option value="remark_cards">Show Remark Cards</option>
                </select>
              </label>

              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--barn-muted)]">
                  Division
                </span>
                <select
                  value={showDocPreview.division}
                  onChange={(e) =>
                    setShowDocPreview((prev) =>
                      prev
                        ? { ...prev, division: e.target.value === 'Youth' ? 'Youth' : 'Open' }
                        : prev
                    )
                  }
                  className="min-h-[32px] px-2 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs"
                >
                  <option value="Open">Open</option>
                  <option value="Youth">Youth</option>
                </select>
              </label>

              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--barn-muted)]">
                  Exhibitor
                </span>
                <input
                  type="text"
                  value={showDocPreview.exhibitorName}
                  onChange={(e) =>
                    setShowDocPreview((prev) =>
                      prev ? { ...prev, exhibitorName: e.target.value } : prev
                    )
                  }
                  placeholder="Exhibitor Name"
                  className="min-h-[32px] px-2 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs w-36"
                />
              </label>

              {showDocPreview.kind === 'entry_form' ? (
                <>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--barn-muted)]">
                      Secretary Email
                    </span>
                    <input
                      type="email"
                      value={showDocPreview.secretaryEmail}
                      onChange={(e) =>
                        setShowDocPreview((prev) =>
                          prev ? { ...prev, secretaryEmail: e.target.value } : prev
                        )
                      }
                      placeholder="secretary@club.org"
                      className="min-h-[32px] px-2 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs w-40"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--barn-muted)]">
                      Fee / Animal ($)
                    </span>
                    <input
                      type="text"
                      value={showDocPreview.entryFeePerAnimal}
                      onChange={(e) =>
                        setShowDocPreview((prev) =>
                          prev ? { ...prev, entryFeePerAnimal: e.target.value } : prev
                        )
                      }
                      placeholder="e.g. 5.00"
                      className="min-h-[32px] px-2 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs w-20"
                    />
                  </label>
                  <label className="inline-flex items-center gap-1.5 min-h-[32px] px-2 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDocPreview.includeFurWool}
                      onChange={(e) =>
                        setShowDocPreview((prev) =>
                          prev ? { ...prev, includeFurWool: e.target.checked } : prev
                        )
                      }
                    />
                    <span>Enter Fur / Wool</span>
                  </label>
                </>
              ) : (
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--barn-muted)]">
                    Card Layout
                  </span>
                  <select
                    value={showDocPreview.remarkLayout}
                    onChange={(e) =>
                      setShowDocPreview((prev) =>
                        prev
                          ? { ...prev, remarkLayout: e.target.value === '1up' ? '1up' : '4up' }
                          : prev
                      )
                    }
                    className="min-h-[32px] px-2 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs"
                  >
                    <option value="4up">4-Up Letter Sheet</option>
                    <option value="1up">1-Up (4x6 Index / Thermal)</option>
                  </select>
                </label>
              )}
            </div>
          }
        />
      )}

      {/* Structured Show, Placements, Awards, Judge Notes & E-Leg Vault Editor Modal */}
      {showEditorOpen && (
        <div
          ref={showEditorDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={editingShowId ? 'Edit Show & Results' : 'Add Show & Results'}
          onClick={(e) => {
            if (e.target === e.currentTarget && !showSubmitLock.isSubmitting) {
              closeShowEditor();
            }
          }}
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <form
            onSubmit={submitShow}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-3xl max-h-[92dvh] flex flex-col overflow-hidden shadow-xl"
          >
            <div className="px-5 py-4 border-b border-[var(--barn-border)] flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                  <Award className="w-5 h-5 text-[var(--barn-sage)]" aria-hidden="true" />
                  <span>
                    {editingShowId
                      ? `Edit Show & Results — ${speciesProfile.name}`
                      : `Log ${speciesProfile.name} Show, Results & E-Legs`}
                  </span>
                </h3>
                <p className="text-xs text-[var(--barn-muted)]">
                  Record class placements, BOB/BOS/BIS/GCH awards, judge notes, earned legs/points,
                  and compressed E-Leg certificates.
                </p>
              </div>
              <button
                type="button"
                disabled={showSubmitLock.isSubmitting}
                onClick={closeShowEditor}
                aria-label="Close show editor"
                className="min-h-[36px] min-w-[36px] rounded-lg text-[var(--barn-muted)] hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label
                    htmlFor={`${baseId}-modal-show-name`}
                    className="block text-[var(--barn-muted)] font-medium mb-1"
                  >
                    Show Name *
                  </label>
                  <input
                    id={`${baseId}-modal-show-name`}
                    type="text"
                    required
                    placeholder="e.g. Heartland Fall Classic Double Open"
                    value={showName}
                    onChange={(e) => setShowName(e.target.value)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-modal-show-location`}
                    className="block text-[var(--barn-muted)] font-medium mb-1"
                  >
                    Location / Fairgrounds
                  </label>
                  <input
                    id={`${baseId}-modal-show-location`}
                    type="text"
                    placeholder="City, State"
                    value={showLocation}
                    onChange={(e) => setShowLocation(e.target.value)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-modal-show-sanction`}
                    className="block text-[var(--barn-muted)] font-medium mb-1"
                  >
                    Sanctioning Body
                  </label>
                  <select
                    id={`${baseId}-modal-show-sanction`}
                    value={showSanction}
                    onChange={(e) => setShowSanction(e.target.value)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                  >
                    {SHOW_SANCTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-modal-show-date`}
                    className="block text-[var(--barn-muted)] font-medium mb-1"
                  >
                    Event Date *
                  </label>
                  <input
                    id={`${baseId}-modal-show-date`}
                    type="date"
                    required
                    value={showDateIso}
                    onChange={(e) => {
                      setShowDateIso(e.target.value);
                      setPendingShowWithdrawalWarning(null);
                    }}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-modal-show-deadline`}
                    className="block text-[var(--barn-muted)] font-medium mb-1"
                  >
                    Entry Deadline
                  </label>
                  <input
                    id={`${baseId}-modal-show-deadline`}
                    type="date"
                    value={showDeadlineIso}
                    onChange={(e) => setShowDeadlineIso(e.target.value)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label
                    htmlFor={`${baseId}-modal-show-notes`}
                    className="block text-[var(--barn-muted)] font-medium mb-1"
                  >
                    General Show Notes
                  </label>
                  <input
                    id={`${baseId}-modal-show-notes`}
                    type="text"
                    placeholder="Coop numbers, travel logistics, or secretary contacts"
                    value={showNotes}
                    onChange={(e) => setShowNotes(e.target.value)}
                    className="w-full min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                  />
                </div>
              </div>

              {/* Show String Selector */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--barn-ink)]">
                    Show String ({showAnimalIds.length} entered)
                  </span>
                  {animals.length > activeData.activeAnimals.length && (
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--barn-muted)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showIncludeArchivedEntries}
                        onChange={(e) => setShowIncludeArchivedEntries(e.target.checked)}
                      />
                      <span>Include Sold / Deceased / Archived stock</span>
                    </label>
                  )}
                </div>
                {(showIncludeArchivedEntries ? animals : activeData.activeAnimals).length === 0 ? (
                  <p className="text-[var(--barn-muted)]">
                    No {speciesProfile.name.toLowerCase()} animals recorded yet.
                  </p>
                ) : (
                  <div className="max-h-36 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 border border-[var(--barn-border)] rounded-xl p-2.5 bg-[var(--barn-canvas)]">
                    {(showIncludeArchivedEntries ? animals : activeData.activeAnimals).map((a) => {
                      const checked = showAnimalIds.includes(a.id);
                      const wEval = showDateWithdrawalByAnimalId.get(a.id);
                      return (
                        <label
                          key={a.id}
                          className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-[var(--barn-subtle)] cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setPendingShowWithdrawalWarning(null);
                              setShowAnimalIds((prev) =>
                                checked ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                              );
                            }}
                          />
                          <span className="min-w-0 truncate">
                            <span className="font-medium">{a.name}</span>
                            {a.tattoo ? ` (${a.tattoo})` : ''}
                            {wEval?.isActive && (
                              <span className="text-[10.5px] font-medium text-[var(--barn-terracotta)] ml-1 font-mono">
                                · Hold {formatReadableDate(wEval.clearDateIso)}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {showPhotoError && (
                <div
                  role="alert"
                  className="p-2.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-danger)] text-[var(--barn-danger)] font-medium"
                >
                  {showPhotoError}
                </div>
              )}

              {/* Per-Animal Structured Placements, Awards, Judge Notes & E-Leg Vault */}
              {showAnimalIds.length > 0 && (
                <div className="space-y-3 pt-1">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    Entered Animal Placements, Awards &amp; E-Leg Vault
                  </div>
                  {showAnimalIds.map((animalId) => {
                    const animal = herdById.get(animalId);
                    const res: ShowAnimalResult = showResultsByAnimalId[animalId] ?? {
                      animalId,
                      classPlacement: '',
                      awards: [],
                      judgeName: '',
                      judgeNotes: '',
                      legsEarned: 0,
                      pointsEarned: undefined,
                      legCertificateNumber: '',
                      eLegAttachments: [],
                    };
                    const isUploading = showPhotoBusyAnimalId === animalId;
                    const wEval = showDateWithdrawalByAnimalId.get(animalId);

                    return (
                      <div
                        key={animalId}
                        className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-semibold text-sm text-[var(--barn-ink)]">
                              {animal ? `${animal.name} (${animal.tattoo || 'No ID'})` : animalId}
                            </span>
                            {animal && (
                              <span className="text-[11px] text-[var(--barn-muted)] ml-2">
                                {animal.variety || animal.breed} · Current legs: {animal.legsCount}
                              </span>
                            )}
                            {wEval?.isActive && (
                              <span className="text-[11px] font-semibold text-[var(--barn-terracotta)] ml-2">
                                Withdrawal Hold ({wEval.medicationSummary})
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setShowAnimalIds((prev) => prev.filter((id) => id !== animalId))
                            }
                            className="text-[11px] text-[var(--barn-muted)] hover:text-[var(--barn-danger)] underline"
                          >
                            Remove from Show
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            aria-label={`Class placement for ${animal?.name || animalId}`}
                            placeholder="Class Placement (e.g. 1st Sr. Buck of 8)"
                            value={res.classPlacement}
                            onChange={(e) =>
                              updateAnimalShowResult(animalId, (p) => ({
                                ...p,
                                classPlacement: e.target.value,
                              }))
                            }
                            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]"
                          />
                          <input
                            type="text"
                            aria-label={`Judge name for ${animal?.name || animalId}`}
                            placeholder="Judge Name"
                            value={res.judgeName || ''}
                            onChange={(e) =>
                              updateAnimalShowResult(animalId, (p) => ({
                                ...p,
                                judgeName: e.target.value,
                              }))
                            }
                            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]"
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-[var(--barn-muted)] mr-1">Awards:</span>
                          {SHOW_AWARD_OPTIONS.map((opt) => {
                            const selected = res.awards.includes(opt.code);
                            return (
                              <button
                                key={opt.code}
                                type="button"
                                aria-pressed={selected}
                                title={opt.label}
                                onClick={() => toggleAnimalShowAward(animalId, opt.code)}
                                className={`min-h-[28px] px-2 py-0.5 rounded-lg border font-mono text-[11px] font-semibold transition-colors ${
                                  selected
                                    ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] border-transparent'
                                    : 'bg-[var(--barn-surface)] border-[var(--barn-border)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                                }`}
                              >
                                {opt.code}
                              </button>
                            );
                          })}
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label
                              htmlFor={`${baseId}-legs-${animalId}`}
                              className="block text-[10.5px] text-[var(--barn-muted)] mb-0.5"
                            >
                              Legs Earned
                            </label>
                            <input
                              id={`${baseId}-legs-${animalId}`}
                              type="number"
                              min={0}
                              max={20}
                              value={res.legsEarned}
                              onChange={(e) =>
                                updateAnimalShowResult(animalId, (p) => ({
                                  ...p,
                                  legsEarned: Math.max(
                                    0,
                                    Math.min(20, Math.round(Number(e.target.value) || 0))
                                  ),
                                }))
                              }
                              className="w-full min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono tabular-nums"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`${baseId}-pts-${animalId}`}
                              className="block text-[10.5px] text-[var(--barn-muted)] mb-0.5"
                            >
                              Show Points
                            </label>
                            <input
                              id={`${baseId}-pts-${animalId}`}
                              type="number"
                              min={0}
                              step="0.5"
                              placeholder="0"
                              value={res.pointsEarned ?? ''}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                updateAnimalShowResult(animalId, (p) => ({
                                  ...p,
                                  pointsEarned:
                                    e.target.value && Number.isFinite(v) && v > 0
                                      ? Math.round(v * 100) / 100
                                      : undefined,
                                }));
                              }}
                              className="w-full min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono tabular-nums"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`${baseId}-cert-${animalId}`}
                              className="block text-[10.5px] text-[var(--barn-muted)] mb-0.5"
                            >
                              E-Leg Cert #
                            </label>
                            <input
                              id={`${baseId}-cert-${animalId}`}
                              type="text"
                              placeholder="e.g. E-48219"
                              value={res.legCertificateNumber || ''}
                              onChange={(e) =>
                                updateAnimalShowResult(animalId, (p) => ({
                                  ...p,
                                  legCertificateNumber: e.target.value,
                                }))
                              }
                              className="w-full min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono"
                            />
                          </div>
                        </div>

                        <textarea
                          rows={2}
                          aria-label={`Judge remarks for ${animal?.name || animalId}`}
                          placeholder="Judge remarks (type, fur/fleece, hindquarters, condition...)"
                          value={res.judgeNotes}
                          onChange={(e) =>
                            updateAnimalShowResult(animalId, (p) => ({
                              ...p,
                              judgeNotes: e.target.value,
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]"
                        />

                        {/* E-Leg Certificate Photo Vault */}
                        <div className="pt-1 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-medium text-[var(--barn-muted)]">
                              E-Leg Certificate Vault ({res.eLegAttachments.length}/
                              {MAX_SHOW_ELEG_ATTACHMENTS_PER_RESULT})
                            </span>
                            <label className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                              {isUploading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                              ) : (
                                <Camera className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                              )}
                              <span>
                                {isUploading ? 'Compressing...' : 'Attach E-Leg Photo'}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                disabled={
                                  isUploading ||
                                  res.eLegAttachments.length >= MAX_SHOW_ELEG_ATTACHMENTS_PER_RESULT
                                }
                                onChange={(e) => {
                                  const files = e.target.files;
                                  void handleUploadELegFiles(animalId, files);
                                  e.target.value = '';
                                }}
                                className="sr-only"
                              />
                            </label>
                          </div>

                          {res.eLegAttachments.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {res.eLegAttachments.map((att) => (
                                <div
                                  key={att.id}
                                  className="p-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] flex items-center gap-2"
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setELegLightbox({
                                        imageUrl: att.dataUrl || att.thumbnailDataUrl,
                                        title: `${animal?.name || 'Animal'} — ${showName || 'Show E-Leg'}`,
                                        subtitle: att.caption || att.fileName,
                                      })
                                    }
                                    className="w-12 h-12 rounded-md overflow-hidden border border-[var(--barn-border)] shrink-0"
                                    title="View full E-Leg certificate"
                                  >
                                    <img
                                      src={att.thumbnailDataUrl || att.dataUrl}
                                      alt={att.caption || att.fileName}
                                      className="w-full h-full object-cover"
                                    />
                                  </button>
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <input
                                      type="text"
                                      aria-label={`Caption for ${att.fileName}`}
                                      placeholder="Caption / Remark card note"
                                      value={att.caption || ''}
                                      onChange={(e) =>
                                        updateAnimalShowResult(animalId, (p) => ({
                                          ...p,
                                          eLegAttachments: p.eLegAttachments.map((item) =>
                                            item.id === att.id
                                              ? { ...item, caption: e.target.value }
                                              : item
                                          ),
                                        }))
                                      }
                                      className="w-full min-h-[28px] px-2 py-0.5 rounded bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[11px]"
                                    />
                                    <div className="text-[10px] text-[var(--barn-muted)] font-mono truncate">
                                      {att.width}×{att.height} ·{' '}
                                      {Math.max(1, Math.round(att.storedBytes / 1024))} KB
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    aria-label={`Remove ${att.fileName}`}
                                    onClick={() =>
                                      updateAnimalShowResult(animalId, (p) => ({
                                        ...p,
                                        eLegAttachments: p.eLegAttachments.filter(
                                          (item) => item.id !== att.id
                                        ),
                                      }))
                                    }
                                    className="min-h-[30px] min-w-[30px] rounded-md text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {pendingShowWithdrawalWarning?.hasConflict && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] space-y-2 text-xs"
                >
                  <div className="flex items-start gap-2">
                    <ShieldAlert
                      className="w-4 h-4 text-[var(--barn-terracotta)] mt-0.5 shrink-0"
                      aria-hidden="true"
                    />
                    <div className="space-y-1 min-w-0">
                      <div className="font-semibold text-[var(--barn-ink)]">
                        Medication Withdrawal Overlaps Show Date (
                        {formatReadableDate(pendingShowWithdrawalWarning.showDateIso)})
                      </div>
                      <p className="text-[var(--barn-muted)]">
                        {pendingShowWithdrawalWarning.conflicts
                          .map(
                            (c) =>
                              `${c.animal.name} (${c.evaluation.medicationSummary}, clears ${formatReadableDate(
                                c.evaluation.clearDateIso
                              )})`
                          )
                          .join(' · ')}
                        . Confirm show rules / health fitness before saving.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={showSubmitLock.isSubmitting}
                      onClick={() => setPendingShowWithdrawalWarning(null)}
                      className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] disabled:opacity-50"
                    >
                      Adjust Selection
                    </button>
                    <button
                      type="button"
                      disabled={showSubmitLock.isSubmitting}
                      onClick={() => void executeSaveShow()}
                      className="min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] text-xs font-semibold hover:opacity-95 disabled:opacity-65"
                    >
                      {showSubmitLock.isSubmitting ? 'Saving...' : 'Save Show Anyway'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-[var(--barn-border)] bg-[var(--barn-canvas)]/60 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {showAnimalIds.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        openShowDocumentPreview(
                          {
                            id: editingShowId || 'draft-show',
                            species: speciesProfile.name,
                            name: showName.trim() || `${speciesProfile.name} Show`,
                            location: showLocation.trim(),
                            sanctioningBody: showSanction,
                            eventDateIso: showDateIso || today,
                            entryDeadlineIso: showDeadlineIso || '',
                            enteredAnimalIds: showAnimalIds,
                            results: Object.values(showResultsByAnimalId),
                            notes: showNotes.trim(),
                            createdAt: today,
                            updatedAt: today,
                          },
                          'entry_form'
                        )
                      }
                      className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
                    >
                      <FileText className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                      Entry Form
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openShowDocumentPreview(
                          {
                            id: editingShowId || 'draft-show',
                            species: speciesProfile.name,
                            name: showName.trim() || `${speciesProfile.name} Show`,
                            location: showLocation.trim(),
                            sanctioningBody: showSanction,
                            eventDateIso: showDateIso || today,
                            entryDeadlineIso: showDeadlineIso || '',
                            enteredAnimalIds: showAnimalIds,
                            results: Object.values(showResultsByAnimalId),
                            notes: showNotes.trim(),
                            createdAt: today,
                            updatedAt: today,
                          },
                          'remark_cards'
                        )
                      }
                      className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
                    >
                      <Printer className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                      Remark Cards
                    </button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  disabled={showSubmitLock.isSubmitting}
                  onClick={closeShowEditor}
                  className="min-h-[38px] px-4 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={showSubmitLock.isSubmitting || Boolean(showPhotoBusyAnimalId)}
                  aria-busy={showSubmitLock.isSubmitting}
                  className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-65"
                >
                  {showSubmitLock.isSubmitting && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  )}
                  {showSubmitLock.isSubmitting
                    ? 'Saving...'
                    : editingShowId
                      ? 'Save Show & Results'
                      : 'Save Show'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* E-Leg Certificate Full-Screen Lightbox */}
      {eLegLightbox && (
        <div
          ref={eLegLightboxRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={eLegLightbox.title}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeELegLightbox();
          }}
          className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-[var(--barn-border)] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{eLegLightbox.title}</div>
                {eLegLightbox.subtitle && (
                  <div className="text-xs text-[var(--barn-muted)] truncate">
                    {eLegLightbox.subtitle}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={closeELegLightbox}
                aria-label="Close certificate preview"
                className="min-h-[36px] min-w-[36px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-black/15 flex items-center justify-center max-h-[76dvh]">
              <img
                src={eLegLightbox.imageUrl}
                alt={eLegLightbox.title}
                className="max-h-[70dvh] w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

## `src/components/SpeciesEditorModal.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Custom Livestock & Species Biological Schedule / Master Task List Milestone Editor Modal.
 *
 * Portable UI Note: Maps cleanly to React Native `Modal` + `ScrollView` + `TextInput` + `Pressable`.
 */

import { Download, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import React, { useId, useState } from 'react';
import {
  BreedMilestoneOffsetOverride,
  BreedScheduleOverride,
  generateUuid,
  isSameSpecies,
  MilestoneRelativeTo,
  normalizeBreedScheduleOverrides,
  nowIsoUtc,
  PREDEFINED_SPECIES_PRESETS,
  SpeciesMilestoneTemplate,
  SpeciesProfile,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TaskCategory,
  TaskPriority,
  WEIGHT_UNIT_OPTIONS,
  WeightUnit,
} from '../core/models';
import { describeMilestoneOffset } from '../core/taskMaster';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';

interface SpeciesEditorModalProps {
  initialProfile: SpeciesProfile | null;
  existingNames: string[];
  recordCount?: number;
  onSave: (profile: SpeciesProfile) => Promise<boolean | void> | boolean | void;
  onDelete?: (profile: SpeciesProfile) => void;
  onDownloadTimestampedBackup?: (speciesName: string) => void;
  onClose: () => void;
}

const DEFAULT_CUSTOM_MILESTONES: SpeciesMilestoneTemplate[] = [
  {
    label: 'Confirm Pregnancy / Fertility Check',
    relativeTo: 'AFTER_BRED',
    daysOffset: 21,
    category: 'Palpation',
    priority: 'Normal',
  },
  {
    label: 'Prepare Birthing Pen / Nest Area',
    relativeTo: 'BEFORE_BIRTH',
    daysOffset: 5,
    category: 'Nestbox',
    priority: 'High',
  },
  {
    label: 'Wean & Weigh Offspring',
    relativeTo: 'AFTER_BIRTH',
    daysOffset: 56,
    category: 'Weaning',
    priority: 'High',
  },
];

export function SpeciesEditorModal({
  initialProfile,
  existingNames,
  recordCount = 0,
  onSave,
  onDelete,
  onDownloadTimestampedBackup,
  onClose,
}: SpeciesEditorModalProps) {
  const baseId = useId();
  const submitLock = useAsyncSubmitLock();
  const dialogRef = useAccessibleDialog({
    isOpen: true,
    onClose: () => {
      if (!submitLock.isLockedNow()) onClose();
    },
  });
  const isEditing = Boolean(initialProfile);
  const canDeleteEmptySpecies =
    isEditing && Boolean(onDelete) && recordCount === 0 && existingNames.length > 1;

  const [creationMode, setCreationMode] = useState<'custom' | 'preset'>('custom');

  const [name, setName] = useState(initialProfile?.name || '');
  const [defaultAnimalPrefix, setDefaultAnimalPrefix] = useState(
    initialProfile?.defaultAnimalPrefix || ''
  );
  const [preferredUnit, setPreferredUnit] = useState<WeightUnit | ''>(
    initialProfile?.preferredUnit || ''
  );
  const [confirmRemoveSpecies, setConfirmRemoveSpecies] = useState(false);
  const [gestationDays, setGestationDays] = useState(
    String(initialProfile?.gestationDays ?? 114)
  );
  const [weanDays, setWeanDays] = useState(
    String(initialProfile?.weanDaysAfterBirth ?? 56)
  );
  const [rebreedDays, setRebreedDays] = useState(
    String(initialProfile?.rebreedDaysAfterBirth ?? 45)
  );
  const [maturityDays, setMaturityDays] = useState(
    initialProfile?.maturityDays && initialProfile.maturityDays > 0
      ? String(initialProfile.maturityDays)
      : ''
  );
  const [birthEventLabel, setBirthEventLabel] = useState(
    initialProfile?.birthEventLabel || 'Birth'
  );
  const [maleLabel, setMaleLabel] = useState(initialProfile?.maleLabel || 'Sire');
  const [femaleLabel, setFemaleLabel] = useState(initialProfile?.femaleLabel || 'Dam');
  const [offspringLabel, setOffspringLabel] = useState(
    initialProfile?.offspringLabel || 'Offspring'
  );
  const [breedsCsv, setBreedsCsv] = useState(
    initialProfile?.exampleBreeds?.join(', ') || ''
  );
  const [milestones, setMilestones] = useState<SpeciesMilestoneTemplate[]>(
    initialProfile?.milestones
      ? [...initialProfile.milestones]
      : DEFAULT_CUSTOM_MILESTONES.map((m) => ({ ...m }))
  );
  const [breedOverrides, setBreedOverrides] = useState<BreedScheduleOverride[]>(() =>
    normalizeBreedScheduleOverrides(initialProfile?.breedOverrides)
  );

  // Draft milestone rule inputs
  const [ruleLabel, setRuleLabel] = useState('');
  const [ruleRelativeTo, setRuleRelativeTo] = useState<MilestoneRelativeTo>('BEFORE_BIRTH');
  const [ruleDays, setRuleDays] = useState('3');
  const [ruleCategory, setRuleCategory] = useState<TaskCategory>('Care');
  const [rulePriority, setRulePriority] = useState<TaskPriority>('High');

  // Draft per-breed override inputs
  const [overrideBreed, setOverrideBreed] = useState('');
  const [overrideGestation, setOverrideGestation] = useState('');
  const [overrideWean, setOverrideWean] = useState('');
  const [overrideRebreed, setOverrideRebreed] = useState('');
  const [overrideMaturity, setOverrideMaturity] = useState('');
  const [overrideMilestoneOffsets, setOverrideMilestoneOffsets] = useState<Record<string, string>>(
    {}
  );
  const [overrideError, setOverrideError] = useState('');

  const [errorMsg, setErrorMsg] = useState('');

  const clearBreedOverrideDraft = () => {
    setOverrideBreed('');
    setOverrideGestation('');
    setOverrideWean('');
    setOverrideRebreed('');
    setOverrideMaturity('');
    setOverrideMilestoneOffsets({});
    setOverrideError('');
  };

  const resetToCustomBlank = () => {
    setCreationMode('custom');
    setErrorMsg('');
    setName('');
    setDefaultAnimalPrefix('');
    setPreferredUnit('');
    setGestationDays('114');
    setWeanDays('56');
    setRebreedDays('45');
    setMaturityDays('');
    setBirthEventLabel('Birth');
    setMaleLabel('Sire');
    setFemaleLabel('Dam');
    setOffspringLabel('Offspring');
    setBreedsCsv('');
    setMilestones(DEFAULT_CUSTOM_MILESTONES.map((m) => ({ ...m })));
    setBreedOverrides([]);
    clearBreedOverrideDraft();
  };

  const applyPreset = (presetName: string) => {
    const preset = PREDEFINED_SPECIES_PRESETS.find((p) => p.name === presetName);
    if (!preset) return;
    setErrorMsg('');
    const alreadyExists = existingNames.some((n) => isSameSpecies(n, preset.name));
    setName(alreadyExists ? `${preset.name} (Custom)` : preset.name);
    setPreferredUnit(preset.preferredUnit || '');
    setGestationDays(String(preset.gestationDays));
    setRebreedDays(String(preset.rebreedDaysAfterBirth));
    setWeanDays(String(preset.weanDaysAfterBirth));
    setMaturityDays(
      preset.maturityDays && preset.maturityDays > 0 ? String(preset.maturityDays) : ''
    );
    setBirthEventLabel(preset.birthEventLabel);
    setMaleLabel(preset.maleLabel);
    setFemaleLabel(preset.femaleLabel);
    setOffspringLabel(preset.offspringLabel);
    setBreedsCsv(preset.exampleBreeds.join(', '));
    setMilestones(preset.milestones.map((m) => ({ ...m })));
    setBreedOverrides(normalizeBreedScheduleOverrides(preset.breedOverrides));
    clearBreedOverrideDraft();
  };

  const handleAddMilestone = () => {
    if (!ruleLabel.trim()) return;
    if (milestones.length >= 15) return;
    setMilestones((prev) => [
      ...prev,
      {
        label: ruleLabel.trim(),
        relativeTo: ruleRelativeTo,
        daysOffset: Math.max(0, Number(ruleDays) || 0),
        category: ruleCategory,
        priority: rulePriority,
      },
    ]);
    setRuleLabel('');
  };

  const loadBreedOverrideIntoDraft = (ov: BreedScheduleOverride) => {
    setOverrideBreed(ov.breed);
    setOverrideGestation(ov.gestationDays ? String(ov.gestationDays) : '');
    setOverrideWean(ov.weanDaysAfterBirth ? String(ov.weanDaysAfterBirth) : '');
    setOverrideRebreed(
      ov.rebreedDaysAfterBirth !== undefined ? String(ov.rebreedDaysAfterBirth) : ''
    );
    setOverrideMaturity(ov.maturityDays ? String(ov.maturityDays) : '');
    const nextOffsets: Record<string, string> = {};
    for (const mo of ov.milestoneOverrides ?? []) {
      const matchingRule = milestones.find(
        (m) => m.label.trim().toLowerCase() === mo.label.trim().toLowerCase()
      );
      nextOffsets[matchingRule ? matchingRule.label : mo.label] = String(mo.daysOffset);
    }
    setOverrideMilestoneOffsets(nextOffsets);
    setOverrideError('');
  };

  const handleSaveBreedOverride = () => {
    const cleanBreed = overrideBreed.trim();
    if (!cleanBreed) {
      setOverrideError('Enter a breed name before saving a breed override.');
      return;
    }

    const milestoneOverrides: BreedMilestoneOffsetOverride[] = [];
    for (const rule of milestones) {
      const rawVal = (overrideMilestoneOffsets[rule.label] ?? '').trim();
      if (!rawVal) continue;
      const parsed = Number(rawVal);
      if (Number.isFinite(parsed) && parsed >= 0) {
        milestoneOverrides.push({
          label: rule.label,
          daysOffset: Math.min(700, Math.round(parsed)),
        });
      }
    }

    const candidate: BreedScheduleOverride = {
      breed: cleanBreed,
      gestationDays: overrideGestation.trim() ? Number(overrideGestation) : undefined,
      weanDaysAfterBirth: overrideWean.trim() ? Number(overrideWean) : undefined,
      rebreedDaysAfterBirth: overrideRebreed.trim() ? Number(overrideRebreed) : undefined,
      maturityDays: overrideMaturity.trim() ? Number(overrideMaturity) : undefined,
      milestoneOverrides: milestoneOverrides.length > 0 ? milestoneOverrides : undefined,
    };

    const validated = normalizeBreedScheduleOverrides([candidate]);
    if (validated.length === 0) {
      setOverrideError(
        'Enter at least one gestation, weaning, rebreed, maturity, or milestone day override.'
      );
      return;
    }

    const savedItem = validated[0];
    setBreedOverrides((prev) => {
      const key = savedItem.breed.toLowerCase();
      const filtered = prev.filter((item) => item.breed.trim().toLowerCase() !== key);
      return normalizeBreedScheduleOverrides([...filtered, savedItem]);
    });
    clearBreedOverrideDraft();
  };

  const breedSuggestions = breedsCsv
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setErrorMsg('Please enter a custom livestock name (e.g. Horse, Quail, Mini Donkey).');
      return;
    }
    const duplicate = existingNames.some(
      (existing) =>
        isSameSpecies(existing, cleanName) &&
        (!isEditing || !isSameSpecies(existing, initialProfile?.name))
    );
    if (duplicate) {
      setErrorMsg(`"${cleanName}" is already configured in your barn. Choose a distinct name.`);
      return;
    }

    await submitLock.runLocked(async () => {
      const parsedBreeds = breedsCsv
        .split(',')
        .map((b) => b.trim())
        .filter(Boolean);

      const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const ts = nowIsoUtc();

      const saved = await onSave({
        id: initialProfile?.id || `species-${slug || generateUuid()}`,
        sortOrder: initialProfile?.sortOrder,
        name: cleanName,
        defaultAnimalPrefix: defaultAnimalPrefix.trim(),
        preferredUnit: preferredUnit || undefined,
        memoText: initialProfile?.memoText ?? '',
        memoUpdatedAt: initialProfile?.memoUpdatedAt ?? '',
        gestationDays: Math.max(1, Number(gestationDays) || 31),
        rebreedDaysAfterBirth: Math.max(0, Number(rebreedDays) || 28),
        weanDaysAfterBirth: Math.max(1, Number(weanDays) || 42),
        maturityDays:
          Number(maturityDays) > 0 ? Math.max(1, Math.round(Number(maturityDays))) : undefined,
        birthEventLabel: birthEventLabel.trim() || 'Birth',
        maleLabel: maleLabel.trim() || 'Male',
        femaleLabel: femaleLabel.trim() || 'Female',
        offspringLabel: offspringLabel.trim() || 'Offspring',
        exampleBreeds: parsedBreeds,
        milestones,
        breedOverrides: normalizeBreedScheduleOverrides(breedOverrides),
        createdAt: initialProfile?.createdAt || ts,
        updatedAt: ts,
      });
      if (saved !== false) {
        onClose();
      }
    });
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? `Configure ${initialProfile?.name}` : 'Add Custom Livestock Species'}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--barn-border)]">
          <div>
            <h2 className="font-display text-lg font-semibold">
              {isEditing
                ? `Edit ${initialProfile?.name} Livestock Schedule`
                : 'Add Custom Livestock Species'}
            </h2>
            <p className="text-xs text-[var(--barn-muted)] mt-0.5">
              Define species name, prefix, gestation/weaning dates, sex terms, breeds, and Master Task List rules
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[40px] min-w-[40px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {!isEditing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                <button
                  type="button"
                  aria-pressed={creationMode === 'custom'}
                  onClick={resetToCustomBlank}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
                    creationMode === 'custom'
                      ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                      : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  Custom Livestock (Blank)
                </button>
                <button
                  type="button"
                  aria-pressed={creationMode === 'preset'}
                  onClick={() => setCreationMode('preset')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    creationMode === 'preset'
                      ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                      : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  Start From Preset Template
                </button>
              </div>

              {creationMode === 'preset' && (
                <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2">
                  <div className="text-xs text-[var(--barn-muted)]">
                    Tap any preset to pre-fill its gestation dates &amp; chores, then customize the
                    name or dates below:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PREDEFINED_SPECIES_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset.name)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                          name.toLowerCase().startsWith(preset.name.toLowerCase())
                            ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                            : 'border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                        }`}
                      >
                        {preset.name} ({preset.gestationDays}d)
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs font-medium text-[var(--barn-ink)]"
            >
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor={`${baseId}-name`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Livestock / Species Name *
              </label>
              <input
                id={`${baseId}-name`}
                type="text"
                placeholder="e.g. Horse, Quail, Mini Donkey, Yak, Poultry..."
                value={name}
                disabled={isEditing && isSameSpecies(initialProfile?.name, 'Rabbit')}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm disabled:opacity-60"
                required
              />
            </div>

            <div>
              <label
                htmlFor={`${baseId}-birth-event`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Birth / Hatch Event Term
              </label>
              <input
                id={`${baseId}-birth-event`}
                type="text"
                placeholder="e.g. Foaling, Hatching, Calving, Kindling"
                value={birthEventLabel}
                onChange={(e) => setBirthEventLabel(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label
                htmlFor={`${baseId}-gestation`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Gestation / Incubation (Days)
              </label>
              <input
                id={`${baseId}-gestation`}
                type="number"
                min={1}
                max={750}
                value={gestationDays}
                onChange={(e) => setGestationDays(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-wean`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Wean / Separate (+Days)
              </label>
              <input
                id={`${baseId}-wean`}
                type="number"
                min={1}
                max={600}
                value={weanDays}
                onChange={(e) => setWeanDays(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-rebreed`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Rebreed Check (+Days)
              </label>
              <input
                id={`${baseId}-rebreed`}
                type="number"
                min={0}
                max={600}
                value={rebreedDays}
                onChange={(e) => setRebreedDays(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-maturity`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Maturity Cutoff (Days, opt.)
              </label>
              <input
                id={`${baseId}-maturity`}
                type="number"
                min={14}
                max={1500}
                placeholder={`Auto (${Math.max(28, (Number(weanDays) || 42) * 2)}d)`}
                value={maturityDays}
                onChange={(e) => setMaturityDays(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor={`${baseId}-male`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Male Term
              </label>
              <input
                id={`${baseId}-male`}
                type="text"
                placeholder="e.g. Stallion, Cock, Buck, Bull"
                value={maleLabel}
                onChange={(e) => setMaleLabel(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-female`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Female Term
              </label>
              <input
                id={`${baseId}-female`}
                type="text"
                placeholder="e.g. Mare, Hen, Doe, Cow"
                value={femaleLabel}
                onChange={(e) => setFemaleLabel(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-offspring`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Offspring Term
              </label>
              <input
                id={`${baseId}-offspring`}
                type="text"
                placeholder="e.g. Foal, Chick, Kid, Calf"
                value={offspringLabel}
                onChange={(e) => setOffspringLabel(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor={`${baseId}-breeds`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Common Breeds / Varieties (comma-separated, optional)
              </label>
              <input
                id={`${baseId}-breeds`}
                type="text"
                placeholder="e.g. Quarter Horse, Morgan, Arabian"
                value={breedsCsv}
                onChange={(e) => setBreedsCsv(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>

            <div>
              <label
                htmlFor={`${baseId}-prefix`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Optional Default Animal Name Prefix
              </label>
              <input
                id={`${baseId}-prefix`}
                type="text"
                placeholder="e.g. Copper Creek or Farm Prefix (editable per animal)"
                value={defaultAnimalPrefix}
                onChange={(e) => setDefaultAnimalPrefix(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
              <p className="text-[11px] text-[var(--barn-muted)] mt-1">
                Pre-fills new animal names if omitted; breeders can clear or override it anytime.
              </p>
            </div>

            <div>
              <label
                htmlFor={`${baseId}-unit`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Species Weight Unit Override
              </label>
              <select
                id={`${baseId}-unit`}
                value={preferredUnit}
                onChange={(e) => setPreferredUnit(e.target.value as WeightUnit | '')}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              >
                <option value="">Use Barn Default</option>
                {WEIGHT_UNIT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-[var(--barn-muted)] mt-1">
                e.g. Decimal lbs or kg for Cattle/Dogs, lbs &amp; oz or grams for Rabbits.
              </p>
            </div>
          </div>

          <div className="border-t border-[var(--barn-border)] pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                Custom Master Task List Milestone Dates ({milestones.length})
              </h3>
              <span className="text-xs text-[var(--barn-muted)]">
                Auto-scheduled whenever a breeding is logged
              </span>
            </div>

            {milestones.length > 0 && (
              <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl">
                {milestones.map((m, idx) => (
                  <div
                    key={`${m.label}-${idx}`}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm"
                  >
                    <div>
                      <div className="font-medium">{m.label}</div>
                      <div className="text-xs text-[var(--barn-muted)]">
                        {describeMilestoneOffset(
                          m.relativeTo,
                          m.daysOffset,
                          birthEventLabel || 'Birth'
                        )}{' '}
                        · {m.category} · {m.priority} priority
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setMilestones((prev) => prev.filter((_, itemIdx) => itemIdx !== idx))
                      }
                      aria-label={`Remove ${m.label}`}
                      className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-[var(--barn-subtle)] text-[var(--barn-muted)] hover:text-[var(--barn-danger)] flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
              <input
                type="text"
                aria-label="New milestone label"
                placeholder="New milestone (e.g. Candling Eggs / Ultrasound)"
                value={ruleLabel}
                onChange={(e) => setRuleLabel(e.target.value)}
                className="sm:col-span-4 min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              />
              <input
                type="number"
                aria-label="Days offset"
                min={0}
                max={700}
                value={ruleDays}
                onChange={(e) => setRuleDays(e.target.value)}
                className="sm:col-span-2 min-h-[40px] px-2.5 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
              />
              <select
                aria-label="Milestone timing relative to event"
                value={ruleRelativeTo}
                onChange={(e) => setRuleRelativeTo(e.target.value as MilestoneRelativeTo)}
                className="sm:col-span-3 min-h-[40px] px-2.5 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              >
                <option value="AFTER_BRED">Days After Bred</option>
                <option value="BEFORE_BIRTH">Days Before {birthEventLabel || 'Birth'}</option>
                <option value="AFTER_BIRTH">Days After {birthEventLabel || 'Birth'}</option>
              </select>
              <select
                aria-label="Rule category"
                value={ruleCategory}
                onChange={(e) => setRuleCategory(e.target.value as TaskCategory)}
                className="sm:col-span-2 min-h-[40px] px-2 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              >
                {TASK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={rulePriority}
                onChange={(e) => setRulePriority(e.target.value as TaskPriority)}
                aria-label="Rule priority"
                className="sm:col-span-1 min-h-[40px] px-1.5 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleAddMilestone}
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Custom Date Rule
            </button>
          </div>

          <div className="border-t border-[var(--barn-border)] pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                Per-Breed Schedule Overrides ({breedOverrides.length})
              </h3>
              <span className="text-xs text-[var(--barn-muted)]">
                Optional day offsets by breed (e.g. dwarf vs. giant lines) — blank inherits species default
              </span>
            </div>

            {breedOverrides.length > 0 && (
              <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl">
                {breedOverrides.map((ov) => {
                  const summaryParts: string[] = [];
                  if (ov.gestationDays !== undefined) summaryParts.push(`Gestation ${ov.gestationDays}d`);
                  if (ov.weanDaysAfterBirth !== undefined) summaryParts.push(`Wean +${ov.weanDaysAfterBirth}d`);
                  if (ov.rebreedDaysAfterBirth !== undefined) summaryParts.push(`Rebreed +${ov.rebreedDaysAfterBirth}d`);
                  if (ov.maturityDays !== undefined) summaryParts.push(`Maturity ${ov.maturityDays}d`);
                  for (const mo of ov.milestoneOverrides ?? []) {
                    summaryParts.push(`${mo.label}: ${mo.daysOffset}d`);
                  }
                  return (
                    <div
                      key={ov.breed}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{ov.breed}</div>
                        <div className="text-xs text-[var(--barn-muted)] font-mono tabular-nums">
                          {summaryParts.join(' · ')}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => loadBreedOverrideIntoDraft(ov)}
                          className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setBreedOverrides((prev) =>
                              prev.filter(
                                (item) =>
                                  item.breed.trim().toLowerCase() !== ov.breed.trim().toLowerCase()
                              )
                            )
                          }
                          aria-label={`Remove ${ov.breed} override`}
                          className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-[var(--barn-subtle)] text-[var(--barn-muted)] hover:text-[var(--barn-danger)] flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
              {overrideError && (
                <div
                  role="alert"
                  className="text-xs font-medium text-[var(--barn-danger)]"
                >
                  {overrideError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                <div className="sm:col-span-2">
                  <label
                    htmlFor={`${baseId}-override-breed`}
                    className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Breed / Variety Name
                  </label>
                  <input
                    id={`${baseId}-override-breed`}
                    type="text"
                    list={`${baseId}-breed-suggestions`}
                    placeholder="e.g. Netherland Dwarf, Flemish Giant"
                    value={overrideBreed}
                    onChange={(e) => {
                      setOverrideBreed(e.target.value);
                      if (overrideError) setOverrideError('');
                    }}
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                  />
                  {breedSuggestions.length > 0 && (
                    <datalist id={`${baseId}-breed-suggestions`}>
                      {breedSuggestions.map((b) => (
                        <option key={b} value={b} />
                      ))}
                    </datalist>
                  )}
                </div>

                <div>
                  <label
                    htmlFor={`${baseId}-override-gestation`}
                    className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Gestation (d)
                  </label>
                  <input
                    id={`${baseId}-override-gestation`}
                    type="number"
                    min={1}
                    max={750}
                    placeholder={`${gestationDays || 31}d`}
                    value={overrideGestation}
                    onChange={(e) => setOverrideGestation(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`${baseId}-override-wean`}
                    className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Wean (+d)
                  </label>
                  <input
                    id={`${baseId}-override-wean`}
                    type="number"
                    min={1}
                    max={600}
                    placeholder={`${weanDays || 42}d`}
                    value={overrideWean}
                    onChange={(e) => setOverrideWean(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`${baseId}-override-rebreed`}
                    className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Rebreed (+d)
                  </label>
                  <input
                    id={`${baseId}-override-rebreed`}
                    type="number"
                    min={0}
                    max={600}
                    placeholder={`${rebreedDays || 28}d`}
                    value={overrideRebreed}
                    onChange={(e) => setOverrideRebreed(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label
                    htmlFor={`${baseId}-override-maturity`}
                    className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Maturity Cutoff (d, opt.)
                  </label>
                  <input
                    id={`${baseId}-override-maturity`}
                    type="number"
                    min={14}
                    max={1500}
                    placeholder={maturityDays ? `${maturityDays}d` : 'Inherit'}
                    value={overrideMaturity}
                    onChange={(e) => setOverrideMaturity(e.target.value)}
                    className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                  />
                </div>
              </div>

              {milestones.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-[var(--barn-border)]/70">
                  <div className="text-[11px] font-medium text-[var(--barn-muted)]">
                    Milestone Day Offsets (leave blank to inherit species default)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {milestones.map((rule, mIdx) => (
                      <div key={`${rule.label}-${mIdx}`} className="flex items-center justify-between gap-2">
                        <label
                          htmlFor={`${baseId}-override-ms-${mIdx}`}
                          className="text-xs text-[var(--barn-ink)] truncate"
                          title={`${rule.label} (${describeMilestoneOffset(rule.relativeTo, rule.daysOffset, birthEventLabel || 'Birth')})`}
                        >
                          {rule.label}
                        </label>
                        <input
                          id={`${baseId}-override-ms-${mIdx}`}
                          type="number"
                          min={0}
                          max={700}
                          placeholder={`${rule.daysOffset}d`}
                          value={overrideMilestoneOffsets[rule.label] ?? ''}
                          onChange={(e) =>
                            setOverrideMilestoneOffsets((prev) => ({
                              ...prev,
                              [rule.label]: e.target.value,
                            }))
                          }
                          className="w-20 shrink-0 min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono tabular-nums text-right"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveBreedOverride}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Save Breed Override
                </button>
                {(overrideBreed ||
                  overrideGestation ||
                  overrideWean ||
                  overrideRebreed ||
                  overrideMaturity ||
                  Object.values(overrideMilestoneOffsets).some(Boolean)) && (
                  <button
                    type="button"
                    onClick={clearBreedOverrideDraft}
                    className="min-h-[36px] px-2.5 py-1 text-xs text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
                  >
                    Clear Draft
                  </button>
                )}
              </div>
            </div>
          </div>

          {confirmRemoveSpecies && initialProfile && onDelete && (
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-danger)]/60 space-y-2.5 text-xs">
              <div className="font-semibold text-[var(--barn-ink)]">
                Recommend Backing Up Before Removing {initialProfile.name}
              </div>
              <p className="text-[var(--barn-muted)]">
                Save a timestamped backup first so prior snapshots are never overwritten if you ever
                want {initialProfile.name} records or settings back.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {onDownloadTimestampedBackup && (
                  <button
                    type="button"
                    onClick={() => onDownloadTimestampedBackup(initialProfile.name)}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    Download Timestamped {initialProfile.name} Backup
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onDelete(initialProfile);
                    onClose();
                  }}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-xs font-semibold"
                >
                  Confirm Remove {initialProfile.name}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemoveSpecies(false)}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-[var(--barn-border)]">
            {isEditing && onDelete ? (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  disabled={!canDeleteEmptySpecies}
                  onClick={() => setConfirmRemoveSpecies(true)}
                  className="min-h-[42px] px-4 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] disabled:opacity-45 disabled:pointer-events-none self-start"
                >
                  Remove Empty Species
                </button>
                {!canDeleteEmptySpecies && (
                  <span className="text-[11px] text-[var(--barn-muted)]">
                    {recordCount > 0
                      ? `Only empty species can be fully removed (${recordCount} record${recordCount === 1 ? '' : 's'} left).`
                      : 'At least one species must remain in your barn.'}
                  </span>
                )}
              </div>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={submitLock.isSubmitting}
                onClick={onClose}
                className="min-h-[42px] px-4 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitLock.isSubmitting}
                aria-busy={submitLock.isSubmitting}
                className="min-h-[42px] px-5 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 inline-flex items-center gap-1.5 disabled:opacity-65"
              >
                {submitLock.isSubmitting && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                )}
                {submitLock.isSubmitting
                  ? 'Saving...'
                  : isEditing
                  ? 'Save Livestock Schedule'
                  : 'Create Custom Livestock'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
```

## `src/components/SpeciesMemoScreen.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Species-Isolated Permanent Memo Pad (`SpeciesMemoScreen`).
 *
 * Provides each livestock species with its own permanent, user-alterable local scratch pad:
 * - Preserves native keyboard emoji and includes a basic formatting & emoji toolbar.
 * - Enforces strict data hygiene (`sanitizeSpeciesMemo`) and safe plain-text AST rendering
 *   with zero HTML interpretation or code execution.
 */

import {
  ArrowLeft,
  Bold,
  Calendar,
  Check,
  CheckSquare,
  Eye,
  Heading2,
  Info,
  Italic,
  List,
  Pencil,
  Save,
  Smile,
  Square,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { formatReadableDate, SpeciesProfile, todayDateIso } from '../core/models';
import {
  applyMemoFormatAction,
  MAX_SPECIES_MEMO_CHARS,
  MEMO_EMOJI_PALETTE,
  MemoFormatAction,
  MemoInlineToken,
  parseMemoBlocks,
  sanitizeSpeciesMemo,
  toggleMemoChecklistLine,
} from '../core/speciesMemo';

interface SpeciesMemoScreenProps {
  speciesProfile: SpeciesProfile;
  onSaveMemo: (
    speciesId: string,
    memoText: string,
    options?: { silent?: boolean }
  ) => Promise<void> | void;
  onBackToHub: () => void;
}

function renderInlineTokens(tokens: MemoInlineToken[]) {
  return tokens.map((tok, i) => {
    if (tok.type === 'bold') {
      return (
        <strong key={i} className="font-semibold text-[var(--barn-ink)]">
          {tok.text}
        </strong>
      );
    }
    if (tok.type === 'italic') {
      return (
        <em key={i} className="italic">
          {tok.text}
        </em>
      );
    }
    return <React.Fragment key={i}>{tok.text}</React.Fragment>;
  });
}

export function SpeciesMemoScreen({
  speciesProfile,
  onSaveMemo,
  onBackToHub,
}: SpeciesMemoScreenProps) {
  const persistedMemo = sanitizeSpeciesMemo(speciesProfile.memoText ?? '');
  const [draft, setDraft] = useState<string>(persistedMemo);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [showEmojiBar, setShowEmojiBar] = useState<boolean>(true);
  const [confirmClear, setConfirmClear] = useState<boolean>(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const activeSpeciesIdRef = useRef<string>(speciesProfile.id);
  const draftRef = useRef<string>(draft);
  const lastSavedRef = useRef<string>(persistedMemo);
  const onSaveMemoRef = useRef(onSaveMemo);

  draftRef.current = draft;
  onSaveMemoRef.current = onSaveMemo;

  // Reset local editor cleanly when switching species
  useEffect(() => {
    const prevId = activeSpeciesIdRef.current;
    if (prevId !== speciesProfile.id && draftRef.current !== lastSavedRef.current) {
      void onSaveMemoRef.current(prevId, sanitizeSpeciesMemo(draftRef.current), { silent: true });
    }
    activeSpeciesIdRef.current = speciesProfile.id;
    const clean = sanitizeSpeciesMemo(speciesProfile.memoText ?? '');
    lastSavedRef.current = clean;
    setDraft(clean);
    setConfirmClear(false);
  }, [speciesProfile.id, speciesProfile.memoText]);

  // Flush any pending unsaved text when navigating away (e.g. straight to Settings & Backups)
  useEffect(() => {
    return () => {
      const clean = sanitizeSpeciesMemo(draftRef.current);
      if (clean !== lastSavedRef.current) {
        lastSavedRef.current = clean;
        void onSaveMemoRef.current(activeSpeciesIdRef.current, clean, { silent: true });
      }
    };
  }, []);

  // Debounced local autosave while typing
  useEffect(() => {
    if (draft === lastSavedRef.current) return;
    const targetId = speciesProfile.id;
    const nextValue = sanitizeSpeciesMemo(draft);
    const timer = window.setTimeout(() => {
      lastSavedRef.current = nextValue;
      void onSaveMemoRef.current(targetId, nextValue, { silent: true });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, speciesProfile.id]);

  // Restore cursor/selection cleanly after formatting bar action
  useEffect(() => {
    const pending = pendingSelectionRef.current;
    if (!pending || !textareaRef.current) return;
    pendingSelectionRef.current = null;
    const el = textareaRef.current;
    el.focus();
    el.setSelectionRange(pending.start, pending.end);
  }, [draft]);

  const flushSaveNow = (silent: boolean) => {
    const clean = sanitizeSpeciesMemo(draftRef.current);
    if (clean !== draftRef.current) {
      setDraft(clean);
    }
    lastSavedRef.current = clean;
    void onSaveMemo(speciesProfile.id, clean, { silent });
  };

  const handleDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const clean = sanitizeSpeciesMemo(e.target.value);
    setDraft(clean);
  };

  const handleFormat = (action: MemoFormatAction) => {
    if (viewMode !== 'edit') {
      setViewMode('edit');
    }
    const el = textareaRef.current;
    const selStart = el ? el.selectionStart : draft.length;
    const selEnd = el ? el.selectionEnd : draft.length;
    const res = applyMemoFormatAction(draft, selStart, selEnd, action);
    pendingSelectionRef.current = {
      start: res.nextSelectionStart,
      end: res.nextSelectionEnd,
    };
    setDraft(res.nextText);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === 'b') {
        e.preventDefault();
        handleFormat({ type: 'bold' });
      } else if (key === 'i') {
        e.preventDefault();
        handleFormat({ type: 'italic' });
      } else if (key === 's') {
        e.preventDefault();
        flushSaveNow(false);
      }
    }
  };

  const handleTogglePreviewChecklist = (lineIndex: number) => {
    const next = toggleMemoChecklistLine(draft, lineIndex);
    setDraft(next);
    lastSavedRef.current = next;
    void onSaveMemo(speciesProfile.id, next, { silent: true });
  };

  const handleClearMemo = () => {
    setDraft('');
    lastSavedRef.current = '';
    setConfirmClear(false);
    void onSaveMemo(speciesProfile.id, '', { silent: false });
  };

  const hasUnsavedChanges = draft !== lastSavedRef.current;
  const blocks = parseMemoBlocks(draft);
  const todayLabel = formatReadableDate(todayDateIso());

  return (
    <div className="space-y-4">
      {/* Page Header & Back Link */}
      <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <button
              type="button"
              onClick={() => {
                flushSaveNow(true);
                onBackToHub();
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--barn-muted)] hover:text-[var(--barn-ink)] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Back to {speciesProfile.name} Hub
            </button>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
              {speciesProfile.name} Memo Pad
            </h1>
            <p className="text-xs text-[var(--barn-muted)]">
              Permanent local scratch pad for {speciesProfile.name.toLowerCase()} notes, feed ratios,
              show reminders, and quick checklists. Saved automatically on this device.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 max-w-full">
            <div
              role="group"
              aria-label="Memo view mode"
              className="flex items-center p-0.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
            >
              <button
                type="button"
                aria-pressed={viewMode === 'edit'}
                onClick={() => setViewMode('edit')}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                  viewMode === 'edit'
                    ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                    : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                }`}
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                Write
              </button>
              <button
                type="button"
                aria-pressed={viewMode === 'preview'}
                onClick={() => setViewMode('preview')}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                  viewMode === 'preview'
                    ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                    : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                }`}
              >
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                Formatted View
              </button>
            </div>

            <button
              type="button"
              onClick={() => flushSaveNow(false)}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              {hasUnsavedChanges ? (
                <>
                  <Save className="w-3.5 h-3.5" aria-hidden="true" />
                  Save Memo
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  Saved
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Formatting Bar + Emoji Strip + Scratchpad Surface */}
      <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl overflow-hidden">
        {/* Basic Formatting Toolbar */}
        <div
          role="toolbar"
          aria-label={`${speciesProfile.name} memo formatting toolbar`}
          className="px-3 sm:px-4 py-2.5 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/60 space-y-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => handleFormat({ type: 'bold' })}
                title="Bold (**text**)"
                aria-label="Bold"
                className="min-h-[34px] min-w-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1"
              >
                <Bold className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Bold</span>
              </button>
              <button
                type="button"
                onClick={() => handleFormat({ type: 'italic' })}
                title="Italic (*text*)"
                aria-label="Italic"
                className="min-h-[34px] min-w-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1"
              >
                <Italic className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Italic</span>
              </button>
              <button
                type="button"
                onClick={() => handleFormat({ type: 'heading' })}
                title="Heading (## )"
                aria-label="Heading"
                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1"
              >
                <Heading2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Heading</span>
              </button>
              <button
                type="button"
                onClick={() => handleFormat({ type: 'bullet' })}
                title="Bullet list (- )"
                aria-label="Bullet List"
                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1"
              >
                <List className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">List</span>
              </button>
              <button
                type="button"
                onClick={() => handleFormat({ type: 'checklist' })}
                title="Checklist item (- [ ] )"
                aria-label="Checklist Item"
                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1"
              >
                <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Checklist</span>
              </button>
              <button
                type="button"
                onClick={() => handleFormat({ type: 'date', dateLabel: todayLabel })}
                title="Insert today's date stamp"
                aria-label="Insert Date"
                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1"
              >
                <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Date</span>
              </button>
              <button
                type="button"
                onClick={() => setShowEmojiBar((v) => !v)}
                aria-expanded={showEmojiBar}
                aria-label="Toggle emoji buttons"
                className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors ${
                  showEmojiBar
                    ? 'border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] text-[var(--barn-ink)]'
                    : 'border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)]'
                }`}
              >
                <Smile className="w-3.5 h-3.5" aria-hidden="true" />
                Emoji
              </button>
            </div>

            {draft.length > 0 && !confirmClear && (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-xs text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                Clear Pad
              </button>
            )}
          </div>

          {showEmojiBar && (
            <div
              aria-label="Quick emoji insert bar"
              className="flex flex-wrap items-center gap-1 pt-1 border-t border-[var(--barn-border)]/70"
            >
              {MEMO_EMOJI_PALETTE.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => handleFormat({ type: 'emoji', emoji: item.emoji })}
                  title={`Insert ${item.label} emoji`}
                  aria-label={`Insert ${item.label} emoji`}
                  className="min-h-[32px] min-w-[32px] px-1.5 rounded-lg hover:bg-[var(--barn-subtle)] text-base leading-none flex items-center justify-center transition-colors"
                >
                  {item.emoji}
                </button>
              ))}
              <span className="text-[11px] text-[var(--barn-muted)] ml-1">
                Keyboard emojis also supported
              </span>
            </div>
          )}

          {confirmClear && (
            <div className="p-2.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-danger)]/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-[var(--barn-ink)] font-medium">
                Clear all notes in the {speciesProfile.name} Memo Pad?
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClearMemo}
                  className="min-h-[30px] px-3 py-1 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] font-semibold"
                >
                  Confirm Clear
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Editor or Safe Formatted View */}
        {viewMode === 'edit' ? (
          <div className="p-3 sm:p-4 space-y-2">
            <label htmlFor="species-memo-textarea" className="sr-only">
              {speciesProfile.name} Memo Pad Notes
            </label>
            <textarea
              id="species-memo-textarea"
              ref={textareaRef}
              value={draft}
              onChange={handleDraftChange}
              onKeyDown={handleKeyDown}
              onBlur={() => flushSaveNow(true)}
              rows={14}
              maxLength={MAX_SPECIES_MEMO_CHARS}
              placeholder={`Write permanent ${speciesProfile.name.toLowerCase()} scratch notes here...\n\nTips:\n## Section Heading\n**Bold** or *italic* text\n- Bullet item\n- [ ] Checklist item\nType any emoji from your keyboard or tap the bar above.`}
              className="w-full min-h-[320px] p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] focus:outline-none focus:ring-2 focus:ring-[var(--barn-sage)] text-sm leading-relaxed resize-y"
            />
          </div>
        ) : (
          <div className="p-4 sm:p-6 min-h-[340px]">
            {blocks.length === 0 ? (
              <p className="text-sm text-[var(--barn-muted)] italic">
                Nothing written in {speciesProfile.name} Memo Pad yet. Switch to Write to add notes.
              </p>
            ) : (
              <div className="space-y-2 text-sm leading-relaxed text-[var(--barn-ink)] break-words">
                {blocks.map((block) => {
                  if (block.type === 'blank') {
                    return <div key={block.lineIndex} className="h-2" aria-hidden="true" />;
                  }
                  if (block.type === 'heading') {
                    return (
                      <h2
                        key={block.lineIndex}
                        className="font-display text-lg font-semibold pt-2 first:pt-0 text-[var(--barn-ink)]"
                      >
                        {renderInlineTokens(block.tokens)}
                      </h2>
                    );
                  }
                  if (block.type === 'checklist') {
                    return (
                      <div key={block.lineIndex} className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => handleTogglePreviewChecklist(block.lineIndex)}
                          aria-label={
                            block.checked ? 'Mark checklist item incomplete' : 'Mark checklist item done'
                          }
                          className="mt-0.5 text-[var(--barn-sage)] hover:opacity-80 shrink-0"
                        >
                          {block.checked ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                        <span
                          className={
                            block.checked ? 'line-through text-[var(--barn-muted)]' : undefined
                          }
                        >
                          {renderInlineTokens(block.tokens)}
                        </span>
                      </div>
                    );
                  }
                  if (block.type === 'bullet') {
                    return (
                      <div key={block.lineIndex} className="flex items-start gap-2 pl-1">
                        <span aria-hidden="true" className="text-[var(--barn-sage)] font-bold">
                          •
                        </span>
                        <span>{renderInlineTokens(block.tokens)}</span>
                      </div>
                    );
                  }
                  return <p key={block.lineIndex}>{renderInlineTokens(block.tokens)}</p>;
                })}
              </div>
            )}
          </div>
        )}

        {/* Footer Metadata */}
        <div className="px-4 py-2.5 border-t border-[var(--barn-border)] bg-[var(--barn-canvas)]/40 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
          <span>
            {draft.length.toLocaleString()} / {MAX_SPECIES_MEMO_CHARS.toLocaleString()} chars · Plain
            text only (scripts disabled)
          </span>
          <span>
            {speciesProfile.memoUpdatedAt
              ? `Last saved ${formatReadableDate(speciesProfile.memoUpdatedAt.slice(0, 10))}`
              : 'Stored locally on device'}
          </span>
        </div>
      </section>

      <aside className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)]/70 px-4 py-3 flex items-start gap-2.5 text-xs text-[var(--barn-muted)]">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-[var(--barn-muted)]" aria-hidden="true" />
        <p className="leading-relaxed">
          <span className="font-medium text-[var(--barn-ink)]">Backups &amp; Portability:</span>{' '}
          Your {speciesProfile.name} Memo Pad contents are automatically included whenever you
          create a backup here (.ZIP, .JSON, or .SQLITE). Because per-species scratch pads are a
          feature specific to this app, most other pedigree or livestock apps will not import or
          display these memo notes if you load a backup into another program.
        </p>
      </aside>
    </div>
  );
}
```

## `src/components/SpeciesMigrationModal.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Reusable Cross-Species Migration Modal (`src/components/SpeciesMigrationModal.tsx`).
 *
 * Supports:
 * - Single animal migration (`Move Species`)
 * - Multi-select pedigree-family migration (moves selected animals + parents/ancestors +
 *   offspring/descendants + linked co-parents & their pedigree parents)
 * - Full-species bulk migration (`Migrate All` across ALL statuses and ALL species records)
 *
 * Always includes a dedicated Step 2 Confirmation screen clarifying exact counts and
 * workspace impact before modifying any records.
 */

import { AlertTriangle, ArrowLeft, ArrowRightLeft, CheckCircle2, Info, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import {
  ANIMAL_STATUSES,
  BarnDatabaseSnapshot,
  isSameSpecies,
  PREDEFINED_SPECIES_PRESETS,
} from '../core/models';
import {
  expandPedigreeFamilyInSpecies,
  migrateAnimalsToSpecies,
  SpeciesMigrationOptions,
} from '../core/speciesMigration';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';

interface SpeciesMigrationModalProps {
  snapshot: BarnDatabaseSnapshot;
  sourceSpecies: string;
  directAnimalIds: string[];
  mode: 'single' | 'multi-select' | 'bulk-all';
  onConfirmMigrate: (
    animalIds: string[],
    targetSpecies: string,
    options?: SpeciesMigrationOptions
  ) => Promise<void> | void;
  onClose: () => void;
}

export function SpeciesMigrationModal({
  snapshot,
  sourceSpecies,
  directAnimalIds,
  mode,
  onConfirmMigrate,
  onClose,
}: SpeciesMigrationModalProps) {
  const isBulkAll = mode === 'bulk-all';
  const isMultiSelect = mode === 'multi-select';

  const sourceAnimalsAll = useMemo(
    () =>
      snapshot.animals
        .filter((a) => isSameSpecies(a.species, sourceSpecies))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [snapshot.animals, sourceSpecies]
  );

  const familyExpansion = useMemo(
    () => expandPedigreeFamilyInSpecies(snapshot.animals, directAnimalIds, sourceSpecies),
    [snapshot.animals, directAnimalIds, sourceSpecies]
  );

  // Default ON for multi-select (moves selected + parents + offspring + linked co-parents)
  // Default OFF for single-animal `Move Species` (toggleable if user wants family too)
  const [includeConnectedPedigree, setIncludeConnectedPedigree] = useState<boolean>(isMultiSelect);
  const [showFullAnimalList, setShowFullAnimalList] = useState<boolean>(false);
  const [step, setStep] = useState<'configure' | 'confirm'>('configure');

  const animalsToMove = useMemo(() => {
    if (isBulkAll) return sourceAnimalsAll;
    if (includeConnectedPedigree) return familyExpansion.expandedAnimals;
    const directSet = new Set(familyExpansion.directIds);
    return sourceAnimalsAll.filter((a) => directSet.has(a.id));
  }, [isBulkAll, includeConnectedPedigree, sourceAnimalsAll, familyExpansion]);

  const effectiveAnimalIds = useMemo(() => animalsToMove.map((a) => a.id), [animalsToMove]);

  const statusBreakdown = useMemo(() => {
    const counts: Array<{ status: string; count: number }> = [];
    for (const st of ANIMAL_STATUSES) {
      const c = animalsToMove.filter((a) => a.status === st).length;
      if (c > 0) counts.push({ status: st, count: c });
    }
    return counts;
  }, [animalsToMove]);

  const targetOptions = useMemo(() => {
    const list: Array<{ name: string; subtitle: string; isConfigured: boolean }> = [];
    const seen = new Set<string>();

    for (const sp of snapshot.speciesProfiles) {
      if (isSameSpecies(sp.name, sourceSpecies)) continue;
      const key = sp.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({
        name: sp.name,
        subtitle: `${sp.maleLabel} · ${sp.femaleLabel} · ${sp.gestationDays}d gestation`,
        isConfigured: true,
      });
    }

    for (const preset of PREDEFINED_SPECIES_PRESETS) {
      if (isSameSpecies(preset.name, sourceSpecies)) continue;
      const key = preset.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({
        name: preset.name,
        subtitle: `${preset.maleLabel} · ${preset.femaleLabel} · ${preset.gestationDays}d gestation (auto-creates hub)`,
        isConfigured: false,
      });
    }

    return list;
  }, [snapshot.speciesProfiles, sourceSpecies]);

  const [selectedTarget, setSelectedTarget] = useState<string>(
    () => targetOptions[0]?.name || ''
  );
  const [customTarget, setCustomTarget] = useState<string>('');
  const [useCustomInput, setUseCustomInput] = useState<boolean>(false);
  const [isMigrating, setIsMigrating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const dialogRef = useAccessibleDialog({
    isOpen: true,
    onClose: () => {
      if (!isMigrating) onClose();
    },
    closeOnEscape: !isMigrating,
  });

  const effectiveTarget = (useCustomInput ? customTarget : selectedTarget).trim();
  const isSameAsSource = effectiveTarget ? isSameSpecies(effectiveTarget, sourceSpecies) : false;

  const migrationOptions: SpeciesMigrationOptions = useMemo(
    () => ({
      migrateEntireSpecies: isBulkAll,
      sourceSpeciesName: sourceSpecies,
    }),
    [isBulkAll, sourceSpecies]
  );

  // Pure dry-run preview so Confirmation Step shows exact counts of what will happen
  const previewResult = useMemo(() => {
    if (!effectiveTarget || isSameAsSource) return null;
    try {
      return migrateAnimalsToSpecies(
        snapshot,
        effectiveAnimalIds,
        effectiveTarget,
        migrationOptions
      );
    } catch {
      return null;
    }
  }, [snapshot, effectiveAnimalIds, effectiveTarget, isSameAsSource, migrationOptions]);

  const canProceed =
    Boolean(effectiveTarget) &&
    !isSameAsSource &&
    Boolean(previewResult) &&
    !isMigrating;

  const handleConfirmExecute = async () => {
    if (!canProceed) return;
    setErrorMsg(null);
    setIsMigrating(true);
    try {
      await onConfirmMigrate(effectiveAnimalIds, effectiveTarget, migrationOptions);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not migrate selected records.');
    } finally {
      setIsMigrating(false);
    }
  };

  const extraFamilyCount =
    familyExpansion.ancestorIds.length +
    familyExpansion.descendantIds.length +
    familyExpansion.linkedCoParentAndRelativeIds.length;

  const heading = isBulkAll
    ? `Migrate All ${sourceSpecies} (${sourceAnimalsAll.length} Animals + All Records)`
    : mode === 'single' && animalsToMove.length === 1
      ? `Move ${animalsToMove[0].name} to Another Species`
      : `Migrate ${animalsToMove.length} ${animalsToMove.length === 1 ? 'Animal' : 'Animals'}`;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[var(--barn-surface)] border-b border-[var(--barn-border)] px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ArrowRightLeft className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold truncate">
              {step === 'confirm' ? 'Confirm Cross-Species Migration' : heading}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close migration modal"
            className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 'configure' ? (
          <div className="p-6 space-y-4 text-xs">
            {/* Scope & Breakdown Card */}
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-[var(--barn-ink)]">
                  {isBulkAll
                    ? `Moving ALL ${animalsToMove.length} ${sourceSpecies} animals & all ${sourceSpecies} species records`
                    : `Moving ${animalsToMove.length} ${animalsToMove.length === 1 ? 'animal' : 'animals'} out of ${sourceSpecies}`}
                </div>
                {animalsToMove.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowFullAnimalList((v) => !v)}
                    className="text-[11px] font-medium text-[var(--barn-sage)] underline"
                  >
                    {showFullAnimalList ? 'Hide list' : `View all (${animalsToMove.length})`}
                  </button>
                )}
              </div>

              {statusBreakdown.length > 0 && (
                <div className="text-[11px] text-[var(--barn-muted)] font-mono">
                  Statuses included:{' '}
                  {statusBreakdown.map((s) => `${s.count} ${s.status}`).join(' · ')}
                </div>
              )}

              {showFullAnimalList ? (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] p-2 space-y-1 text-[11px]">
                  {animalsToMove.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-[var(--barn-ink)]">
                        {a.name}
                        {a.tattoo ? ` (${a.tattoo})` : ''}
                      </span>
                      <span className="text-[var(--barn-muted)] font-mono shrink-0">
                        {a.sex} · {a.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                animalsToMove.length > 0 && (
                  <div className="text-[var(--barn-muted)] leading-relaxed">
                    {animalsToMove
                      .slice(0, 6)
                      .map((a) => `${a.name}${a.tattoo ? ` (${a.tattoo})` : ''}`)
                      .join(', ')}
                    {animalsToMove.length > 6 ? `, and ${animalsToMove.length - 6} more` : ''}
                  </div>
                )
              )}
            </div>

            {/* Connected Pedigree Family Option for Multi-Select & Single Animal */}
            {!isBulkAll && (
              <label className="p-3.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeConnectedPedigree}
                  onChange={(e) => setIncludeConnectedPedigree(e.target.checked)}
                  className="mt-0.5 shrink-0"
                />
                <div className="space-y-1 leading-relaxed">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    Include connected pedigree family (parents, offspring &amp; linked co-parents)
                    {extraFamilyCount > 0 ? ` (+${extraFamilyCount} animals)` : ''}
                  </div>
                  <div className="text-[11px] text-[var(--barn-muted)]">
                    {extraFamilyCount > 0 ? (
                      <>
                        Selected: {familyExpansion.directIds.length}
                        {familyExpansion.ancestorIds.length > 0
                          ? ` · Parents/ancestors: +${familyExpansion.ancestorIds.length}`
                          : ''}
                        {familyExpansion.descendantIds.length > 0
                          ? ` · Offspring/descendants: +${familyExpansion.descendantIds.length}`
                          : ''}
                        {familyExpansion.linkedCoParentAndRelativeIds.length > 0
                          ? ` · Linked co-parents & their ancestors: +${familyExpansion.linkedCoParentAndRelativeIds.length}`
                          : ''}
                      </>
                    ) : (
                      'No additional parents, offspring, or co-parents found for this selection in this species.'
                    )}
                  </div>
                </div>
              </label>
            )}

            {/* Target Species Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="migration-target-species-select"
                  className="font-medium text-[var(--barn-ink)]"
                >
                  Target Livestock Species
                </label>
                <button
                  type="button"
                  onClick={() => setUseCustomInput((v) => !v)}
                  className="text-[11px] font-medium text-[var(--barn-sage)] underline"
                >
                  {useCustomInput ? 'Pick from species list' : 'Or type a custom species'}
                </button>
              </div>

              {useCustomInput ? (
                <input
                  id="migration-target-species-select"
                  type="text"
                  required
                  placeholder="e.g. Swine / Pig, Kunekune, Goat..."
                  value={customTarget}
                  onChange={(e) => setCustomTarget(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                />
              ) : (
                <select
                  id="migration-target-species-select"
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-medium"
                >
                  {targetOptions.map((opt) => (
                    <option key={opt.name} value={opt.name}>
                      {opt.name} — {opt.subtitle}
                    </option>
                  ))}
                </select>
              )}

              {isSameAsSource && (
                <p className="text-[var(--barn-danger)] font-medium">
                  Target species must be different from {sourceSpecies}.
                </p>
              )}
            </div>

            {previewResult && (
              <div className="p-3.5 rounded-xl bg-[var(--barn-sage-tint)]/45 border border-[var(--barn-sage)]/40 flex items-start gap-2.5 text-[var(--barn-muted)]">
                <Info className="w-4 h-4 text-[var(--barn-sage)] shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1 leading-relaxed">
                  <p>
                    Ready to review migration to{' '}
                    <strong className="text-[var(--barn-ink)]">{previewResult.targetSpecies}</strong>:
                    {' '}
                    {previewResult.animalsMigrated} animals
                    {previewResult.photosMigrated > 0
                      ? `, ${previewResult.photosMigrated} photos`
                      : ''}
                    {previewResult.careLogsMigrated > 0
                      ? `, ${previewResult.careLogsMigrated} logs`
                      : ''}
                    {previewResult.tasksMigrated > 0
                      ? `, ${previewResult.tasksMigrated} chores`
                      : ''}
                    {previewResult.breedingsMigrated > 0
                      ? `, ${previewResult.breedingsMigrated} breedings`
                      : ''}
                    {previewResult.cagesMigratedOrAdded > 0
                      ? `, ${previewResult.cagesMigratedOrAdded} cages`
                      : ''}
                    {previewResult.showsUpdated > 0
                      ? `, ${previewResult.showsUpdated} shows`
                      : ''}
                    .
                  </p>
                  <p className="text-[11px]">
                    Click <strong>Review &amp; Confirm</strong> next to verify everything that will
                    happen before any data changes.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--barn-border)]">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] px-4 py-2 rounded-lg border border-[var(--barn-border)] font-medium hover:bg-[var(--barn-subtle)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canProceed}
                onClick={() => {
                  setErrorMsg(null);
                  setStep('confirm');
                }}
                className="min-h-[40px] px-5 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold hover:opacity-95 disabled:opacity-45 disabled:pointer-events-none inline-flex items-center gap-1.5"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
                Review &amp; Confirm Migration
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-4 text-xs">
            {previewResult && (
              <>
                <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-sage)] space-y-2.5">
                  <div className="flex items-center gap-2 font-semibold text-sm text-[var(--barn-ink)]">
                    <CheckCircle2 className="w-4 h-4 text-[var(--barn-sage)] shrink-0" />
                    <span>
                      What will happen when migrating {sourceSpecies} → {previewResult.targetSpecies}
                    </span>
                  </div>

                  <ul className="space-y-1.5 text-[var(--barn-muted)] list-disc pl-5 leading-relaxed">
                    <li>
                      <strong className="text-[var(--barn-ink)]">
                        {previewResult.animalsMigrated} animal
                        {previewResult.animalsMigrated === 1 ? '' : 's'}
                      </strong>{' '}
                      {isBulkAll
                        ? `(100% of ${sourceSpecies} animals across ALL statuses: ${
                            statusBreakdown.map((s) => `${s.count} ${s.status}`).join(', ') || 'all'
                          })`
                        : includeConnectedPedigree && extraFamilyCount > 0
                          ? `(${familyExpansion.directIds.length} selected + ${extraFamilyCount} connected pedigree relatives: parents, offspring & linked co-parents)`
                          : ''}
                      {' '}will move from <strong className="text-[var(--barn-ink)]">{sourceSpecies}</strong> to{' '}
                      <strong className="text-[var(--barn-ink)]">{previewResult.targetSpecies}</strong>.
                    </li>

                    <li>
                      <strong className="text-[var(--barn-ink)]">Linked records moving:</strong>{' '}
                      {previewResult.photosMigrated} photos, {previewResult.careLogsMigrated} care/weight logs,{' '}
                      {previewResult.tasksMigrated} barn chores, {previewResult.breedingsMigrated} breeding
                      records, {previewResult.cagesMigratedOrAdded} cage/pen locations, and{' '}
                      {previewResult.showsUpdated} show entries.
                    </li>

                    {previewResult.createdTargetProfile ? (
                      <li>
                        A new <strong className="text-[var(--barn-ink)]">{previewResult.targetSpecies}</strong>{' '}
                        species hub &amp; breeding schedule will be created automatically.
                      </li>
                    ) : (
                      <li>
                        All migrated records will merge into your existing{' '}
                        <strong className="text-[var(--barn-ink)]">{previewResult.targetSpecies}</strong>{' '}
                        workspace (no duplicate animals created).
                      </li>
                    )}

                    <li>
                      <strong className="text-[var(--barn-ink)]">
                        After migration, {sourceSpecies} will have:
                      </strong>{' '}
                      {previewResult.remainingSourceAnimalsCount} remaining animal
                      {previewResult.remainingSourceAnimalsCount === 1 ? '' : 's'} and{' '}
                      {previewResult.remainingSourceRecordsCount} total remaining record
                      {previewResult.remainingSourceRecordsCount === 1 ? '' : 's'} (the{' '}
                      {sourceSpecies} species card &amp; schedule stay configured unless deleted).
                    </li>
                  </ul>
                </div>

                {(previewResult.splitParentLinksCount > 0 ||
                  previewResult.splitBreedingsCount > 0) && (
                  <div className="p-3.5 rounded-xl bg-[var(--barn-terracotta-tint)]/55 border border-[var(--barn-terracotta)]/50 flex items-start gap-2.5 text-[var(--barn-ink)]">
                    <AlertTriangle
                      className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="space-y-1 leading-relaxed text-[11px]">
                      {previewResult.splitParentLinksCount > 0 && (
                        <p>
                          <strong>{previewResult.splitParentLinksCount}</strong> moved animal(s) still
                          have a parent staying in {sourceSpecies}. Sire/Dam IDs stay preserved so
                          pedigrees reconnect if those parents are moved later.
                        </p>
                      )}
                      {previewResult.splitBreedingsCount > 0 && (
                        <p>
                          <strong>{previewResult.splitBreedingsCount}</strong> breeding record(s)
                          will stay in {sourceSpecies} because one parent is not included in this
                          migration.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {animalsToMove.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="font-medium text-[var(--barn-muted)]">
                      Animals included in this migration ({animalsToMove.length}):
                    </div>
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-2.5 space-y-1 text-[11px]">
                      {animalsToMove.map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium text-[var(--barn-ink)]">
                            {a.name}
                            {a.tattoo ? ` (${a.tattoo})` : ''}
                          </span>
                          <span className="text-[var(--barn-muted)] font-mono shrink-0">
                            {a.sex} · {a.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs font-medium"
              >
                {errorMsg}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--barn-border)]">
              <button
                type="button"
                disabled={isMigrating}
                onClick={() => setStep('configure')}
                className="min-h-[40px] px-4 py-2 rounded-lg border border-[var(--barn-border)] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                Back
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isMigrating}
                  onClick={onClose}
                  className="min-h-[40px] px-4 py-2 rounded-lg border border-[var(--barn-border)] font-medium hover:bg-[var(--barn-subtle)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canProceed}
                  onClick={() => void handleConfirmExecute()}
                  className="min-h-[40px] px-5 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold hover:opacity-95 disabled:opacity-45 disabled:pointer-events-none inline-flex items-center gap-1.5"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  {isMigrating
                    ? 'Migrating...'
                    : `Confirm & Migrate to ${previewResult?.targetSpecies || effectiveTarget}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

## `src/components/SuggestionsBacklogScreen.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Developer Suggestion Backlog Viewer & Offline Idea Capture Screen
 * (`src/components/SuggestionsBacklogScreen.tsx`).
 *
 * Reads the bundled `/docs/plans/suggestions-backlog.md` document completely offline,
 * parses sections & numbered items into clean readable cards, and isolates the
 * "New Idea" capture composer from the rendered backlog list so keystrokes never
 * trigger backlog re-parses or list re-renders.
 */

import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  FolderTree,
  Lightbulb,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BacklogSection,
  buildCapturedIdeasJsonExport,
  buildCapturedIdeasMarkdownExport,
  CapturedIdeaEntry,
  formatSanitizedIdeaForDisplay,
  getBacklogSectionSeverityDescription,
  MAX_CAPTURED_IDEA_LENGTH,
  MAX_CAPTURED_IDEAS_COUNT,
  MIN_CAPTURED_IDEA_LENGTH,
  ParsedSuggestionsBacklog,
  parseSuggestionsBacklogMarkdown,
  sanitizeIdeaInput,
  SUGGESTIONS_BACKLOG_PATH,
} from '../core/suggestionsBacklog';
import { formatTimestampedBackupSlug } from '../core/syncAndExports';
import {
  clearCapturedIdeas,
  deleteCapturedIdea,
  loadCapturedIdeas,
  saveCapturedIdea,
} from '../storage/capturedIdeasStore';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import { copyTextWithFallback, downloadTextFile } from '../utils/webFileActions';

const BUNDLED_BACKLOG_FILES = import.meta.glob('/docs/plans/suggestions-backlog.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function readBundledBacklogMarkdown(): string {
  for (const content of Object.values(BUNDLED_BACKLOG_FILES)) {
    if (typeof content === 'string') {
      return content;
    }
  }
  return '';
}

export interface SuggestionsBacklogScreenProps {
  onBackToTechyStuff: () => void;
}

interface IdeaCaptureComposerProps {
  isOpen: boolean;
  onClose: () => void;
  onIdeaSaved: (result: {
    entry: CapturedIdeaEntry;
    ideas: CapturedIdeaEntry[];
    truncated: boolean;
  }) => void;
}

/**
 * Isolated composer component so typing in the idea input never re-renders the
 * master suggestion backlog or pending ideas list.
 */
const IdeaCaptureComposer = memo(function IdeaCaptureComposer({
  isOpen,
  onClose,
  onIdeaSaved,
}: IdeaCaptureComposerProps) {
  const inputId = useId();
  const helpId = useId();
  const submitLock = useAsyncSubmitLock({ postSettleCooldownMs: 200 });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isMountedRef = useRef(true);

  const [draftText, setDraftText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const raf = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const trimmedLen = draftText.trim().length;
  const isOverLimit = draftText.length > MAX_CAPTURED_IDEA_LENGTH;

  const handleCancel = () => {
    setDraftText('');
    setFormError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const check = sanitizeIdeaInput(draftText, MAX_CAPTURED_IDEA_LENGTH);
    if (!check.ok) {
      setFormError(check.error);
      return;
    }

    await submitLock.runLocked(async () => {
      try {
        const result = await saveCapturedIdea(draftText);
        if (!isMountedRef.current) return;
        setDraftText('');
        setFormError(null);
        onIdeaSaved(result);
        onClose();
      } catch (err) {
        if (!isMountedRef.current) return;
        setFormError(
          err instanceof Error
            ? err.message
            : 'Could not save idea to offline storage. Try freeing space or exporting existing ideas.'
        );
      }
    });
  };

  return (
    <section
      aria-label="Capture New Suggestion Idea"
      className="bg-[var(--barn-surface)] border border-[var(--barn-sage)] rounded-2xl p-5 sm:p-6 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5 min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold text-[var(--barn-ink)] flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            <span>Capture New Idea</span>
          </h2>
          <p id={helpId} className="text-xs text-[var(--barn-muted)]">
            Entries are sanitized (HTML stripped/escaped, whitespace normalized, max{' '}
            {MAX_CAPTURED_IDEA_LENGTH.toLocaleString()} characters) and saved offline to your
            ongoing pending ideas list.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCancel}
          aria-label="Close new idea form"
          className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <div>
          <label htmlFor={inputId} className="sr-only">
            Describe your suggestion or feature idea
          </label>
          <textarea
            ref={textareaRef}
            id={inputId}
            rows={4}
            value={draftText}
            maxLength={MAX_CAPTURED_IDEA_LENGTH + 200}
            aria-describedby={helpId}
            onChange={(e) => {
              setDraftText(e.target.value);
              if (formError) setFormError(null);
            }}
            placeholder="Describe a workflow improvement, bug fix, or domain feature idea..."
            className="w-full rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] px-3.5 py-2.5 text-sm text-[var(--barn-ink)] placeholder:text-[var(--barn-muted)]/80 leading-relaxed"
          />
        </div>

        {formError && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)]"
          >
            {formError}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span
            className={`font-mono text-[11px] tabular-nums ${
              isOverLimit ? 'text-[var(--barn-terracotta)] font-semibold' : 'text-[var(--barn-muted)]'
            }`}
          >
            {draftText.length.toLocaleString()} / {MAX_CAPTURED_IDEA_LENGTH.toLocaleString()} chars
            {isOverLimit ? ' (will be trimmed cleanly on save)' : ''}
          </span>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCancel}
              disabled={submitLock.isSubmitting}
              className="min-h-[44px] sm:min-h-[38px] flex-1 sm:flex-initial px-4 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold text-[var(--barn-ink)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitLock.isSubmitting || trimmedLen < MIN_CAPTURED_IDEA_LENGTH}
              aria-busy={submitLock.isSubmitting}
              className="min-h-[44px] sm:min-h-[38px] flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{submitLock.isSubmitting ? 'Saving Offline...' : 'Submit Idea'}</span>
            </button>
          </div>
        </div>
      </form>
    </section>
  );
});

interface BacklogSectionsViewProps {
  sections: readonly BacklogSection[];
  isEmptyBacklog: boolean;
  searchQuery: string;
}

const BacklogSectionsView = memo(function BacklogSectionsView({
  sections,
  isEmptyBacklog,
  searchQuery,
}: BacklogSectionsViewProps) {
  if (isEmptyBacklog) {
    return (
      <div className="p-5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-muted)] space-y-1">
        <div className="font-semibold text-[var(--barn-ink)]">
          No Backlog Items Found in {SUGGESTIONS_BACKLOG_PATH}
        </div>
        <p>
          The bundled suggestion backlog file is currently empty or has no remaining items. Use the{' '}
          <strong className="text-[var(--barn-ink)]">New Idea</strong> button above to capture new
          ideas offline.
        </p>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="p-5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-muted)]">
        No backlog items match &ldquo;{searchQuery.trim()}&rdquo;.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <section
          key={section.id}
          aria-label={section.title}
          className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="space-y-0.5 min-w-0 flex-1">
              <h2 className="font-display text-xl font-semibold text-[var(--barn-ink)]">
                {section.title}
              </h2>
              {section.subtitle && (
                <p className="text-xs text-[var(--barn-muted)] leading-relaxed">
                  {section.subtitle}
                </p>
              )}
            </div>
            <span className="font-mono text-xs tabular-nums text-[var(--barn-sage)] font-semibold shrink-0">
              {section.items.length} {section.items.length === 1 ? 'item' : 'items'}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {section.items.map((item) => (
              <article
                key={`${section.id}-${item.number}`}
                className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 flex flex-col"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] font-mono text-[var(--barn-muted)] tabular-nums">
                    <span className="text-[var(--barn-sage)] font-semibold">
                      #{String(item.number).padStart(2, '0')}
                    </span>
                    {item.codeTag && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[var(--barn-ink)] font-medium">{item.codeTag}</span>
                      </>
                    )}
                  </div>
                  <h3 className="font-display text-base font-semibold text-[var(--barn-ink)] leading-snug">
                    {item.title}
                  </h3>
                </div>

                {item.details.length > 0 && (
                  <ul className="space-y-1.5 text-xs text-[var(--barn-muted)] leading-relaxed list-disc pl-4">
                    {item.details.map((detail, idx) => (
                      <li key={idx}>
                        {detail.lead && (
                          <strong className="text-[var(--barn-ink)]">{detail.lead}: </strong>
                        )}
                        <span>{detail.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
});

export function SuggestionsBacklogScreen({ onBackToTechyStuff }: SuggestionsBacklogScreenProps) {
  const searchId = useId();
  const exportLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const feedbackTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const [capturedIdeas, setCapturedIdeas] = useState<CapturedIdeaEntry[]>([]);
  const [ideasLoaded, setIdeasLoaded] = useState(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('all');

  const parsedBacklog: ParsedSuggestionsBacklog = useMemo(
    () => parseSuggestionsBacklogMarkdown(readBundledBacklogMarkdown()),
    []
  );

  const showTransientFeedback = useCallback((message: string) => {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    setActionFeedback(message);
    feedbackTimerRef.current = window.setTimeout(() => {
      if (isMountedRef.current) {
        setActionFeedback(null);
      }
      feedbackTimerRef.current = null;
    }, 4500);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void loadCapturedIdeas()
      .then((ideas) => {
        if (!isMountedRef.current) return;
        setCapturedIdeas(ideas);
        setIdeasLoaded(true);
      })
      .catch((err) => {
        if (!isMountedRef.current) return;
        setIdeasError(
          err instanceof Error ? err.message : 'Could not load offline captured ideas.'
        );
        setIdeasLoaded(true);
      });

    return () => {
      isMountedRef.current = false;
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = null;
      }
    };
  }, []);

  const handleIdeaSaved = useCallback(
    (result: { entry: CapturedIdeaEntry; ideas: CapturedIdeaEntry[]; truncated: boolean }) => {
      setCapturedIdeas(result.ideas);
      setIdeasError(null);
      showTransientFeedback(
        result.truncated
          ? `Idea saved offline (trimmed to ${MAX_CAPTURED_IDEA_LENGTH} characters).`
          : 'Idea sanitized and saved to your offline Pending Ideas list.'
      );
    },
    [showTransientFeedback]
  );

  const handleDeleteIdea = useCallback(
    async (id: string) => {
      try {
        const next = await deleteCapturedIdea(id);
        if (!isMountedRef.current) return;
        setCapturedIdeas(next);
        showTransientFeedback('Removed idea from offline pending list.');
      } catch (err) {
        if (!isMountedRef.current) return;
        setIdeasError(err instanceof Error ? err.message : 'Could not remove idea.');
      }
    },
    [showTransientFeedback]
  );

  const handleClearIdeas = useCallback(async () => {
    await exportLock.runLocked(async () => {
      try {
        const next = await clearCapturedIdeas();
        if (!isMountedRef.current) return;
        setCapturedIdeas(next);
        showTransientFeedback('Cleared all pending captured ideas from offline storage.');
      } catch (err) {
        if (!isMountedRef.current) return;
        setIdeasError(err instanceof Error ? err.message : 'Could not clear ideas.');
      }
    });
  }, [exportLock, showTransientFeedback]);

  const handleCopyIdeas = useCallback(async () => {
    await exportLock.runLocked(async () => {
      const markdown = buildCapturedIdeasMarkdownExport(capturedIdeas);
      const result = await copyTextWithFallback(markdown);
      if (!isMountedRef.current) return;
      if (result === 'clipboard' || result === 'execCommand') {
        showTransientFeedback(
          `Copied ${capturedIdeas.length} pending idea(s) as Markdown to clipboard.`
        );
      } else {
        setIdeasError('Clipboard access is restricted here. Use Export .MD or Export .JSON instead.');
      }
    });
  }, [capturedIdeas, exportLock, showTransientFeedback]);

  const handleExportMarkdown = useCallback(async () => {
    await exportLock.runLocked(async () => {
      const markdown = buildCapturedIdeasMarkdownExport(capturedIdeas);
      const filename = `community-pedigree-captured-ideas-${formatTimestampedBackupSlug()}.md`;
      await downloadTextFile(filename, markdown, 'text/markdown');
      if (!isMountedRef.current) return;
      showTransientFeedback(`Downloaded ${filename} (${capturedIdeas.length} idea(s)).`);
    });
  }, [capturedIdeas, exportLock, showTransientFeedback]);

  const handleExportJson = useCallback(async () => {
    await exportLock.runLocked(async () => {
      const jsonText = buildCapturedIdeasJsonExport(capturedIdeas);
      const filename = `community-pedigree-captured-ideas-${formatTimestampedBackupSlug()}.json`;
      await downloadTextFile(filename, jsonText, 'application/json');
      if (!isMountedRef.current) return;
      showTransientFeedback(`Downloaded ${filename} (${capturedIdeas.length} idea(s)).`);
    });
  }, [capturedIdeas, exportLock, showTransientFeedback]);

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return parsedBacklog.sections
      .filter((sec) => selectedSectionId === 'all' || sec.id === selectedSectionId)
      .map((sec) => {
        if (!q) return sec;
        const matchedItems = sec.items.filter((item) => {
          if (item.title.toLowerCase().includes(q)) return true;
          if (item.codeTag && item.codeTag.toLowerCase().includes(q)) return true;
          return item.details.some(
            (d) =>
              d.text.toLowerCase().includes(q) || (d.lead && d.lead.toLowerCase().includes(q))
          );
        });
        return { ...sec, items: matchedItems };
      })
      .filter((sec) => sec.items.length > 0);
  }, [parsedBacklog.sections, searchQuery, selectedSectionId]);

  const visibleItemCount = useMemo(
    () => filteredSections.reduce((sum, sec) => sum + sec.items.length, 0),
    [filteredSections]
  );

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      {/* Top Header, Breadcrumb & Primary Actions */}
      <header className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0 flex-1">
            <nav
              aria-label="Suggestion backlog breadcrumb"
              className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-[var(--barn-muted)]"
            >
              <FolderTree className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>The Techy Stuff</span>
              <span aria-hidden="true">/</span>
              <span className="text-[var(--barn-ink)] font-semibold">Suggestion Backlog</span>
              <span aria-hidden="true">·</span>
              <code className="text-[var(--barn-ink)]">{SUGGESTIONS_BACKLOG_PATH}</code>
            </nav>

            <h1 className="font-display text-2xl font-semibold text-[var(--barn-ink)]">
              Suggestion Backlog &amp; Idea Capture
            </h1>
            <p className="text-xs text-[var(--barn-muted)] max-w-3xl leading-relaxed">
              Offline-ready viewer for Community Pedigree&apos;s saved suggestions backlog, paired
              with a sanitized local idea capture inbox for recording new roadmap notes in the barn.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto max-w-full">
            <button
              type="button"
              onClick={onBackToTechyStuff}
              className="min-h-[44px] sm:min-h-[38px] max-w-full px-3.5 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Back to The Techy Stuff</span>
            </button>

            <button
              type="button"
              aria-expanded={isCaptureOpen}
              onClick={() => setIsCaptureOpen((prev) => !prev)}
              className="min-h-[44px] sm:min-h-[38px] max-w-full px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>New Idea</span>
            </button>
          </div>
        </div>

        {/* Summary Telemetry Strip & Search / Section Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--barn-border)]/70">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--barn-muted)] tabular-nums">
            <span>
              <strong className="text-[var(--barn-ink)]">{parsedBacklog.totalItems}</strong> backlog
              items
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-[var(--barn-sage)]">{capturedIdeas.length}</strong> pending
              captured {capturedIdeas.length === 1 ? 'idea' : 'ideas'}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Showing <strong className="text-[var(--barn-ink)]">{visibleItemCount}</strong>
            </span>
          </div>

          <div className="relative w-full sm:w-72">
            <label htmlFor={searchId} className="sr-only">
              Filter backlog suggestions
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
              placeholder="Filter backlog items..."
              className="w-full min-h-[40px] sm:min-h-[36px] pl-8 pr-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-ink)]"
            />
          </div>
        </div>

        {parsedBacklog.sections.length > 1 && (
          <div
            role="tablist"
            aria-label="Filter backlog by priority section"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedSectionId === 'all'}
              onClick={() => setSelectedSectionId('all')}
              className={`min-h-[48px] px-3.5 py-2.5 rounded-xl text-left transition-colors flex flex-col justify-center gap-0.5 ${
                selectedSectionId === 'all'
                  ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                  : 'bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)]'
              }`}
            >
              <span className="text-xs font-semibold tabular-nums">
                All Sections ({parsedBacklog.totalItems})
              </span>
              <span
                className={`text-[11px] leading-snug ${
                  selectedSectionId === 'all'
                    ? 'text-[var(--barn-on-sage)]/90'
                    : 'text-[var(--barn-muted)]'
                }`}
              >
                Show every remaining severity and priority level
              </span>
            </button>
            {parsedBacklog.sections.map((section) => {
              const active = selectedSectionId === section.id;
              const severityDesc = getBacklogSectionSeverityDescription(section);
              return (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedSectionId(section.id)}
                  className={`min-h-[48px] px-3.5 py-2.5 rounded-xl text-left transition-colors flex flex-col justify-center gap-0.5 ${
                    active
                      ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                      : 'bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)]'
                  }`}
                >
                  <span className="text-xs font-semibold tabular-nums">
                    {section.title.split(':')[0]} ({section.items.length})
                  </span>
                  <span
                    className={`text-[11px] leading-snug ${
                      active ? 'text-[var(--barn-on-sage)]/90' : 'text-[var(--barn-muted)]'
                    }`}
                  >
                    {severityDesc}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {actionFeedback && (
          <div
            role="status"
            aria-live="polite"
            className="p-3 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs text-[var(--barn-ink)]"
          >
            {actionFeedback}
          </div>
        )}

        {ideasError && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)]"
          >
            {ideasError}
          </div>
        )}
      </header>

      {/* Isolated New Idea Capture Composer */}
      <IdeaCaptureComposer
        isOpen={isCaptureOpen}
        onClose={() => setIsCaptureOpen(false)}
        onIdeaSaved={handleIdeaSaved}
      />

      {/* Pending / Captured Ideas Section */}
      <section
        aria-label="Pending and Captured Ideas"
        className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-0.5 min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold text-[var(--barn-ink)] flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>Pending / Captured Ideas</span>
            </h2>
            <p className="text-xs text-[var(--barn-muted)] leading-relaxed">
              Ongoing offline list stored locally (up to {MAX_CAPTURED_IDEAS_COUNT} entries). Copy
              or export when ready to merge into{' '}
              <code className="font-mono text-[var(--barn-ink)]">{SUGGESTIONS_BACKLOG_PATH}</code>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={capturedIdeas.length === 0 || exportLock.isSubmitting}
              onClick={() => void handleCopyIdeas()}
              className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-45"
            >
              <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Copy / Export Ideas</span>
            </button>

            <button
              type="button"
              disabled={capturedIdeas.length === 0 || exportLock.isSubmitting}
              onClick={() => void handleExportMarkdown()}
              className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-45"
            >
              <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Export .MD</span>
            </button>

            <button
              type="button"
              disabled={capturedIdeas.length === 0 || exportLock.isSubmitting}
              onClick={() => void handleExportJson()}
              className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-45"
            >
              <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Export .JSON</span>
            </button>

            {capturedIdeas.length > 0 && (
              <button
                type="button"
                disabled={exportLock.isSubmitting}
                onClick={() => void handleClearIdeas()}
                className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold text-[var(--barn-terracotta)] inline-flex items-center justify-center gap-1.5 disabled:opacity-45"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Clear All</span>
              </button>
            )}
          </div>
        </div>

        {!ideasLoaded ? (
          <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-muted)]">
            Loading offline captured ideas...
          </div>
        ) : capturedIdeas.length === 0 ? (
          <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-muted)]">
            No pending ideas captured yet. Tap <strong className="text-[var(--barn-ink)]">New Idea</strong>{' '}
            above to record a suggestion offline.
          </div>
        ) : (
          <ul className="space-y-2.5">
            {capturedIdeas.map((idea) => (
              <li
                key={idea.id}
                className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] flex flex-wrap items-start justify-between gap-3"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="font-mono text-[11px] text-[var(--barn-muted)] tabular-nums">
                    Captured {new Date(idea.createdAtIso).toLocaleString()}
                  </div>
                  <p className="text-xs sm:text-sm text-[var(--barn-ink)] leading-relaxed break-words">
                    {formatSanitizedIdeaForDisplay(idea.text)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleDeleteIdea(idea.id)}
                  aria-label="Remove captured idea"
                  className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] px-2.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium text-[var(--barn-muted)] hover:text-[var(--barn-terracotta)] inline-flex items-center justify-center gap-1 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="sm:hidden">Remove</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Master Suggestion Backlog Sections */}
      <BacklogSectionsView
        sections={filteredSections}
        isEmptyBacklog={parsedBacklog.isEmpty}
        searchQuery={searchQuery}
      />

      {parsedBacklog.auditNote && (
        <section
          aria-label="Backlog Audit History Note"
          className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 space-y-1.5 text-xs"
        >
          <div className="font-semibold text-[var(--barn-ink)]">Backlog Audit Note</div>
          <p className="text-[var(--barn-muted)] leading-relaxed">{parsedBacklog.auditNote}</p>
        </section>
      )}
    </div>
  );
}
```

## `src/components/TechyStuffErrorBoundary.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Isolated Error Boundary for "The Techy Stuff" Developer & Troubleshooting Screen.
 *
 * Ensures any fault inside diagnostic inspection, memory dump tooling, or developer
 * state tools stays strictly isolated from active breeding, herd, and pedigree views,
 * logging crash telemetry cleanly while letting users recover locally or exit safely.
 */

import { AlertTriangle, Download, Home, RefreshCw, Settings, ShieldAlert } from 'lucide-react';
import React from 'react';
import { formatSupportReportText } from '../core/supportBundle';
import { formatTimestampedBackupSlug } from '../core/syncAndExports';
import {
  getDiagnosticSummary,
  listDiagnosticLogs,
  recordReactCrash,
} from '../storage/crashLogger';
import { downloadTextFile } from '../utils/webFileActions';

interface TechyStuffErrorBoundaryProps {
  children: React.ReactNode;
  onExitToSettings: () => void;
  onExitToHome: () => void;
}

interface TechyStuffErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
  showDetails: boolean;
  exportBusy: boolean;
  exportFeedback: string | null;
}

export class TechyStuffErrorBoundary extends React.Component<
  TechyStuffErrorBoundaryProps,
  TechyStuffErrorBoundaryState
> {
  constructor(props: TechyStuffErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      componentStack: '',
      showDetails: false,
      exportBusy: false,
      exportFeedback: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<TechyStuffErrorBoundaryState> {
    return {
      hasError: true,
      error,
      exportFeedback: null,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const compStack = info.componentStack || '';
    recordReactCrash(error, compStack);
    this.setState({ componentStack: compStack });
  }

  private handleResetBoundary = () => {
    this.setState({
      hasError: false,
      error: null,
      componentStack: '',
      showDetails: false,
      exportFeedback: null,
    });
  };

  private handleDownloadCrashLogTxt = async () => {
    this.setState({ exportBusy: true, exportFeedback: null });
    try {
      const entries = await listDiagnosticLogs();
      const summary = await getDiagnosticSummary(entries);
      const report = formatSupportReportText(entries, summary, null);
      const filename = `pedigree-techy-stuff-fault-${formatTimestampedBackupSlug()}.txt`;
      await downloadTextFile(filename, report, 'text/plain');
      this.setState({
        exportBusy: false,
        exportFeedback: `Downloaded ${filename} (${entries.length} diagnostic entries).`,
      });
    } catch (err) {
      this.setState({
        exportBusy: false,
        exportFeedback:
          err instanceof Error ? err.message : 'Could not export diagnostic log report.',
      });
    }
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const message = this.state.error?.message || 'Unexpected error inside Developer & Troubleshooting panel.';

    return (
      <section
        role="alert"
        aria-live="assertive"
        className="bg-[var(--barn-surface)] border border-[var(--barn-danger)] rounded-2xl p-6 space-y-4 max-w-3xl mx-auto"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 text-[var(--barn-danger)] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1 min-w-0">
            <h1 className="font-display text-xl font-semibold text-[var(--barn-ink)]">
              &ldquo;The Techy Stuff&rdquo; Diagnostic Panel Hit an Isolated Error
            </h1>
            <p className="text-xs text-[var(--barn-muted)] leading-relaxed">
              This fault was trapped inside the Developer &amp; Troubleshooting boundary so your
              active herd records, breeding lab, and pedigrees remain completely safe and
              unaffected.
            </p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs font-mono text-[var(--barn-ink)] break-words">
          {message}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={this.handleResetBoundary}
            className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Retry Developer Panel
          </button>

          <button
            type="button"
            onClick={this.props.onExitToSettings}
            className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Settings className="w-4 h-4" aria-hidden="true" />
            Back to Settings
          </button>

          <button
            type="button"
            onClick={this.props.onExitToHome}
            className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            All Species Home
          </button>

          <button
            type="button"
            disabled={this.state.exportBusy}
            onClick={() => void this.handleDownloadCrashLogTxt()}
            className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            {this.state.exportBusy ? 'Exporting Logs...' : 'Download Crash Logs (.TXT)'}
          </button>
        </div>

        {this.state.exportFeedback && (
          <div
            role="status"
            aria-live="polite"
            className="p-2.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs"
          >
            {this.state.exportFeedback}
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
            aria-expanded={this.state.showDetails}
            className="text-xs underline text-[var(--barn-muted)] hover:text-[var(--barn-ink)] inline-flex items-center gap-1"
          >
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
            {this.state.showDetails ? 'Hide Technical Stack Trace' : 'Show Technical Stack Trace'}
          </button>

          {this.state.showDetails && (
            <pre className="mt-2 p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-[11px] overflow-x-auto max-h-60 whitespace-pre-wrap break-words text-[var(--barn-muted)]">
              {this.state.error?.stack || message}
              {this.state.componentStack ? `\n\nComponent Stack:\n${this.state.componentStack}` : ''}
            </pre>
          )}
        </div>
      </section>
    );
  }
}
```

## `src/components/TechyStuffScreen.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * "The Techy Stuff" Developer & Troubleshooting Screen (`src/components/TechyStuffScreen.tsx`).
 *
 * Houses all advanced, non-routine, and technical operational controls relocated out of
 * standard Barn Settings:
 * - Permanent, non-closeable copy of the 5-Tier Device Capability & Memory Hierarchy guidelines
 * - Storage Protection, OPFS namespaces & IndexedDB Quota Pre-Flight telemetry
 * - Connectivity Governor, Manual Offline Toggle & Timed Network Probe
 * - App Update Policy ('auto' / 'notify' / 'pinned') & Release Gate Inspector
 * - Crash Logs, Memory Watchdog, Photo Pruner, DB Health Repair & Cache Purge (`DiagnosticsAndSupportPanel`)
 * - Strictly validated Diagnostic Trigger tools & multi-step safeguarded Destructive Reset Lab
 */

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  BookOpen,
  CheckCircle2,
  Cpu,
  Database,
  Download,
  HardDrive,
  Lightbulb,
  Lock,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  Unlock,
  Wifi,
  WifiOff,
} from 'lucide-react';
import React, { useId, useState } from 'react';
import { VaultBackupMetadata } from '../core/backupVault';
import {
  BarnHealthRepairResult,
  BarnHealthReport,
} from '../core/dataHealthCheck';
import {
  DEVICE_CAPABILITY_TIER_LIST,
  evaluateBarnWorkloadForTier,
  getTierStoragePolicy,
} from '../core/deviceCapability';
import {
  formatByteSizePure,
  ImageOptimizationPresetId,
} from '../core/imageOptimizationSpec';
import { BarnDatabaseSnapshot } from '../core/models';
import type { PhotoStorageFootprintReport } from '../core/photoMaintenance';
import {
  formatTimestampedBackupSlug,
  generateBarnBackupJsonChunks,
} from '../core/syncAndExports';
import {
  DESTRUCTIVE_CONFIRM_PHRASES,
  DiagnosticEventCategoryOverride,
  DiagnosticEventLevelOverride,
  isDestructiveActionConfirmationValid,
  validateDiagnosticTriggerInput,
  validatePwaUpdatePolicyOverride,
} from '../core/techyStuffGuardrails';
import { CURRENT_APP_VERSION } from '../core/upgradeGate';
import { CURRENT_BACKUP_SCHEMA_VERSION } from '../core/backupVault';
import { logDiagnosticEvent } from '../storage/crashLogger';
import {
  detectCurrentBrowserCompatibility,
  DeviceCapabilityController,
} from '../storage/deviceCapabilityDetector';
import {
  PwaUpdatePolicy,
  usePwaUpdateStatus,
} from '../storage/pwaUpdateManager';
import {
  DiagnosticQuotaPreflightResult,
  StorageProtectionStatus,
  useConnectivityStatus,
  verifyStorageQuotaForDiagnosticAction,
} from '../storage/storageProtection';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import { downloadTextChunks } from '../utils/webFileActions';
import { DiagnosticsAndSupportPanel } from './DiagnosticsAndSupportPanel';
import type { ImportExportHubSection } from './ImportExportHubScreen';

export interface TechyStuffScreenProps {
  snapshot: BarnDatabaseSnapshot;
  engineName: string;
  storageStatus: StorageProtectionStatus | null;
  opfsSupported: boolean;
  opfsVaultBackups: VaultBackupMetadata[];
  deviceCapability: DeviceCapabilityController;
  onBackToSettings: () => void;
  onOpenImportExportHub?: (section?: ImportExportHubSection) => void;
  onOpenPromptsDirectory?: () => void;
  onOpenSuggestionsBacklog?: () => void;
  onRefreshStorageStatus: () => Promise<StorageProtectionStatus>;
  onRequestPersistentStorage: () => Promise<StorageProtectionStatus> | void;
  onPurgeOpfsTmp: () => Promise<{ filesRemoved: number; bytesFreed: number }>;
  onClearLocalSyncAndReminderState: () => Promise<void>;
  recordBackupExport: (
    format: 'zip' | 'sqlite' | 'json',
    fileName?: string
  ) => Promise<void> | void;
  onAnalyzePhotoFootprint?: (
    presetId?: ImageOptimizationPresetId
  ) => Promise<PhotoStorageFootprintReport | null>;
  onPruneOrphanPhotos?: () => Promise<{ removedCount: number; reclaimedBytes: number }>;
  onReoptimizeOversizedPhotos?: (
    presetId?: ImageOptimizationPresetId
  ) => Promise<{ updatedCount: number; oversizedFound: number; reclaimedBytes: number }>;
  onPruneFullResPhotoPayloads?: () => Promise<{ prunedCount: number; reclaimedBytes: number }>;
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
  onSaveManualOpfsVaultBackup?: (note?: string) => Promise<unknown> | void;
  onCreateVerifiedPreUpgradeBackup?: () => Promise<{
    verified: boolean;
    checksumSha256: string;
    fileName: string;
  } | null>;
  onSeedAllSpecies: () => Promise<void> | void;
  onClearAllRecords: () => Promise<void> | void;
  onRestoreFactoryDefaults: () => Promise<void> | void;
}

export function TechyStuffScreen({
  snapshot,
  engineName,
  storageStatus,
  opfsSupported,
  opfsVaultBackups,
  deviceCapability,
  onBackToSettings,
  onOpenImportExportHub,
  onOpenPromptsDirectory,
  onOpenSuggestionsBacklog,
  onRefreshStorageStatus,
  onRequestPersistentStorage,
  onPurgeOpfsTmp,
  onClearLocalSyncAndReminderState,
  recordBackupExport,
  onAnalyzePhotoFootprint,
  onPruneOrphanPhotos,
  onReoptimizeOversizedPhotos,
  onPruneFullResPhotoPayloads,
  onScanDatabaseHealth,
  onRepairDatabaseHealth,
  onResetDatabaseConnection,
  onPurgeCorruptedCaches,
  onLocateConflicts,
  onHydrateSnapshotForExport,
  onSaveManualOpfsVaultBackup,
  onCreateVerifiedPreUpgradeBackup,
  onSeedAllSpecies,
  onClearAllRecords,
  onRestoreFactoryDefaults,
}: TechyStuffScreenProps) {
  const baseId = useId();
  const connectivity = useConnectivityStatus();
  const pwaUpdate = usePwaUpdateStatus();

  const updateCheckLock = useAsyncSubmitLock();
  const preUpgradeBackupLock = useAsyncSubmitLock();
  const archiveExportLock = useAsyncSubmitLock();
  const destructiveLabLock = useAsyncSubmitLock();

  const [updateCheckFeedback, setUpdateCheckFeedback] = useState<string | null>(null);
  const [preUpgradeFeedback, setPreUpgradeFeedback] = useState<string | null>(null);
  const [quotaProbeReport, setQuotaProbeReport] = useState<DiagnosticQuotaPreflightResult | null>(
    null
  );

  // Safeguard toggle & multi-step phrase states for destructive developer actions
  const [destructiveArmed, setDestructiveArmed] = useState(false);
  const [tmpPurgePhrase, setTmpPurgePhrase] = useState('');
  const [syncResetPhrase, setSyncResetPhrase] = useState('');
  const [wipePhrase, setWipePhrase] = useState('');
  const [factoryResetPhrase, setFactoryResetPhrase] = useState('');
  const [labFeedback, setLabFeedback] = useState<string | null>(null);
  const [labError, setLabError] = useState<string | null>(null);

  // Validated diagnostic event trigger form state
  const [triggerLevel, setTriggerLevel] = useState<DiagnosticEventLevelOverride>('info');
  const [triggerCategory, setTriggerCategory] =
    useState<DiagnosticEventCategoryOverride>('lifecycle');
  const [triggerMessage, setTriggerMessage] = useState('');
  const [triggerNote, setTriggerNote] = useState('');
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [triggerFeedback, setTriggerFeedback] = useState<string | null>(null);

  const { assessment, browserCompatibility } = deviceCapability;
  const activeBrowserCompat =
    browserCompatibility ?? detectCurrentBrowserCompatibility(assessment);
  const persistStorageSupported = activeBrowserCompat.signals.persistStorageSupported;

  const allPhotos = snapshot.animalPhotos ?? [];
  const totalBarnRecords =
    snapshot.animals.length +
    allPhotos.length +
    snapshot.breedings.length +
    snapshot.cages.length +
    snapshot.tasks.length +
    snapshot.careLogs.length +
    snapshot.shows.length;

  const workload = evaluateBarnWorkloadForTier(totalBarnRecords, assessment);
  const activeTierPolicy = getTierStoragePolicy(assessment.tier);

  const handleRunQuotaProbe = async () => {
    const photoBytes = allPhotos.reduce((acc, p) => acc + (p.storedBytes || 0), 0);
    const estRequired = Math.max(512 * 1024, photoBytes + snapshot.animals.length * 1024);
    const res = await verifyStorageQuotaForDiagnosticAction({
      operation: 'support_bundle_zip',
      operationLabel: 'Full Diagnostic + Data Archive Probe',
      estimatedRequiredBytes: estRequired,
      requiresOpfsPreferred: true,
    });
    setQuotaProbeReport(res);
    await onRefreshStorageStatus();
  };

  const handleUpdatePolicySelect = (rawPolicy: string) => {
    const check = validatePwaUpdatePolicyOverride(rawPolicy);
    if (!check.ok) {
      setUpdateCheckFeedback(check.error);
      return;
    }
    pwaUpdate.setPolicy(check.policy);
    logDiagnosticEvent({
      level: 'info',
      category: 'lifecycle',
      message: `PWA update policy changed to "${check.policy}" via The Techy Stuff`,
    });
    setUpdateCheckFeedback(`Update policy set to "${check.policy}".`);
  };

  const handleInjectDiagnosticTrigger = (e: React.FormEvent) => {
    e.preventDefault();
    setTriggerError(null);
    setTriggerFeedback(null);
    const result = validateDiagnosticTriggerInput({
      level: triggerLevel,
      category: triggerCategory,
      message: triggerMessage,
      note: triggerNote,
    });
    if (!result.ok) {
      setTriggerError(result.error);
      return;
    }

    logDiagnosticEvent({
      level: result.value.level,
      category: result.value.category,
      message: result.value.message,
      details: {
        source: 'techyStuff_manual_trigger',
        tier: assessment.tier,
        opfsSupported,
        ...(result.value.note ? { note: result.value.note } : {}),
      },
    });
    setTriggerMessage('');
    setTriggerNote('');
    setTriggerFeedback(
      `Recorded validated [${result.value.level}/${result.value.category}] event into diagnostic log.`
    );
  };

  const handleDownloadPreResetJson = async () => {
    await archiveExportLock.runLocked(async () => {
      setLabError(null);
      setLabFeedback(null);
      try {
        const exportSnapshot = onHydrateSnapshotForExport
          ? await onHydrateSnapshotForExport(snapshot)
          : snapshot;
        const filename = `community-pedigree-full-backup-${formatTimestampedBackupSlug()}.json`;
        await downloadTextChunks(
          filename,
          generateBarnBackupJsonChunks(exportSnapshot),
          'application/json'
        );
        void recordBackupExport('json', filename);
        setLabFeedback(
          `Saved pre-reset JSON backup ${filename} (${exportSnapshot.animals.length} animals).`
        );
      } catch (err) {
        setLabError(
          err instanceof Error ? err.message : 'Could not prepare pre-reset JSON backup.'
        );
      }
    });
  };

  const handlePurgeTmpAction = async () => {
    if (!destructiveArmed || !isDestructiveActionConfirmationValid('purge_opfs_tmp', tmpPurgePhrase)) {
      return;
    }
    await destructiveLabLock.runLocked(async () => {
      setLabError(null);
      setLabFeedback(null);
      try {
        const quota = await verifyStorageQuotaForDiagnosticAction({
          operation: 'opfs_tmp_purge',
          operationLabel: 'Purge OPFS /tmp Scratchpad',
          estimatedRequiredBytes: 0,
        });
        const { filesRemoved, bytesFreed } = await onPurgeOpfsTmp();
        setTmpPurgePhrase('');
        await onRefreshStorageStatus();
        setLabFeedback(
          `Purged ${filesRemoved} stale file(s) (${formatByteSizePure(bytesFreed)}) from OPFS /tmp (${quota.opfsSupported ? 'OPFS active' : 'OPFS unavailable'}).`
        );
      } catch (err) {
        setLabError(err instanceof Error ? err.message : 'Failed to purge OPFS /tmp scratchpad.');
      }
    });
  };

  const handleClearSyncOutboxAction = async () => {
    if (
      !destructiveArmed ||
      !isDestructiveActionConfirmationValid('clear_sync_outbox', syncResetPhrase)
    ) {
      return;
    }
    await destructiveLabLock.runLocked(async () => {
      setLabError(null);
      setLabFeedback(null);
      try {
        await onClearLocalSyncAndReminderState();
        setSyncResetPhrase('');
        logDiagnosticEvent({
          level: 'warn',
          category: 'storage',
          message: 'Developer manually cleared local sync outbox & backup reminder metadata',
        });
        setLabFeedback(
          'Cleared local delta sync outbox queue, conflict log, and reminder snooze metadata (herd records intact).'
        );
      } catch (err) {
        setLabError(err instanceof Error ? err.message : 'Failed to clear sync outbox state.');
      }
    });
  };

  const handleWipeAllRecordsAction = async () => {
    if (
      !destructiveArmed ||
      !isDestructiveActionConfirmationValid('wipe_all_animals', wipePhrase)
    ) {
      return;
    }
    await destructiveLabLock.runLocked(async () => {
      setLabError(null);
      setLabFeedback(null);
      try {
        await onClearAllRecords();
        setWipePhrase('');
        await onRefreshStorageStatus();
        setLabFeedback('All animal, breeding, cage, task, care log, and show records cleared.');
      } catch (err) {
        setLabError(err instanceof Error ? err.message : 'Failed to clear barn records.');
      }
    });
  };

  const handleFactoryRestoreAction = async () => {
    if (
      !destructiveArmed ||
      !isDestructiveActionConfirmationValid('factory_restore', factoryResetPhrase)
    ) {
      return;
    }
    await destructiveLabLock.runLocked(async () => {
      setLabError(null);
      setLabFeedback(null);
      try {
        await onRestoreFactoryDefaults();
        setFactoryResetPhrase('');
        await onRefreshStorageStatus();
        setLabFeedback('App restored to factory defaults and sample herds reloaded.');
      } catch (err) {
        setLabError(err instanceof Error ? err.message : 'Failed to restore factory defaults.');
      }
    });
  };

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      {/* Top Breadcrumb / Action Bar */}
      <header className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 min-w-0 flex-1 basis-full lg:basis-72">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-[var(--barn-muted)]">
            <Terminal className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            <span>Developer &amp; Troubleshooting Console</span>
            <span>·</span>
            <span className="tabular-nums">
              v{CURRENT_APP_VERSION} · Schema v{CURRENT_BACKUP_SCHEMA_VERSION}
            </span>
          </div>
          <h1 className="font-display text-2xl font-semibold text-[var(--barn-ink)]">
            The Techy Stuff
          </h1>
          <p className="text-xs text-[var(--barn-muted)]">
            Isolated technical workspace for hardware/memory hierarchy rules, OPFS &amp; IndexedDB
            quota verification, release gate controls, crash diagnostics, and safeguarded resets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto max-w-full">
          <button
            type="button"
            onClick={onBackToSettings}
            className="min-h-[44px] sm:min-h-[38px] max-w-full px-3.5 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Back to Settings</span>
          </button>
          {onOpenPromptsDirectory && (
            <button
              type="button"
              onClick={onOpenPromptsDirectory}
              className="min-h-[44px] sm:min-h-[38px] max-w-full px-3.5 py-2 rounded-xl border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] hover:opacity-90 text-[var(--barn-ink)] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>Prompt Directory (/prompts)</span>
            </button>
          )}
          {onOpenSuggestionsBacklog && (
            <button
              type="button"
              onClick={onOpenSuggestionsBacklog}
              className="min-h-[44px] sm:min-h-[38px] max-w-full px-3.5 py-2 rounded-xl border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] hover:opacity-90 text-[var(--barn-ink)] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <Lightbulb className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>Suggestion Backlog</span>
            </button>
          )}
          {onOpenImportExportHub && (
            <button
              type="button"
              onClick={() => onOpenImportExportHub('backup')}
              className="min-h-[44px] sm:min-h-[38px] max-w-full px-3.5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Import / Export Hub</span>
            </button>
          )}
        </div>
      </header>

      {(onOpenPromptsDirectory || onOpenSuggestionsBacklog) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {onOpenPromptsDirectory && (
            <section
              aria-label="Repository Prompts Directory Link"
              className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="space-y-0.5 min-w-0 flex-1">
                <h2 className="font-display text-base font-semibold text-[var(--barn-ink)] flex flex-wrap items-center gap-2 min-w-0">
                  <BookOpen className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  <span>Repository Prompts Directory (/prompts/)</span>
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  Browse active and archived system/workflow prompts in root{' '}
                  <code className="font-mono text-[var(--barn-ink)]">/prompts/</code>, inspect
                  confirmation-lock flags, and force-refresh to detect newly added prompt scripts.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenPromptsDirectory}
                className="min-h-[44px] sm:min-h-[40px] w-full sm:w-auto max-w-full px-3.5 py-2 rounded-xl border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] hover:opacity-90 text-xs font-semibold text-[var(--barn-ink)] text-center sm:shrink-0"
              >
                Open Prompts Directory &rarr;
              </button>
            </section>
          )}

          {onOpenSuggestionsBacklog && (
            <section
              aria-label="Suggestion Backlog and Idea Capture Link"
              className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="space-y-0.5 min-w-0 flex-1">
                <h2 className="font-display text-base font-semibold text-[var(--barn-ink)] flex flex-wrap items-center gap-2 min-w-0">
                  <Lightbulb className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  <span>Suggestion Backlog &amp; Idea Capture</span>
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  View the prioritized roadmap in{' '}
                  <code className="font-mono text-[var(--barn-ink)]">
                    /docs/plans/suggestions-backlog.md
                  </code>{' '}
                  and capture new sanitized ideas offline for future export.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenSuggestionsBacklog}
                className="min-h-[44px] sm:min-h-[40px] w-full sm:w-auto max-w-full px-3.5 py-2 rounded-xl border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] hover:opacity-90 text-xs font-semibold text-[var(--barn-ink)] text-center sm:shrink-0"
              >
                Open Suggestion Backlog &rarr;
              </button>
            </section>
          )}
        </div>
      )}

      {/* PERMANENT & NON-CLOSEABLE: Copy of Tier / Memory Hierarchy Guidelines */}
      <section
        aria-label="Tier and Memory Hierarchy Guidelines (Permanent Reference)"
        data-permanent-tier-hierarchy="true"
        className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <h2 className="font-display text-xl font-semibold text-[var(--barn-ink)]">
                Device Tier &amp; Memory Hierarchy Guidelines
              </h2>
            </div>
            <p className="text-xs text-[var(--barn-muted)]">
              Permanent, non-closeable copy of the 5-tier capability &amp; memory storage hierarchy
              rules governing local SQLite/IndexedDB retention, OPFS vault caps, and low-RAM
              guardrails.
            </p>
          </div>
          <span className="font-mono text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-ink)] max-w-full">
            Permanent Reference · Tier {assessment.tier} Active
          </span>
        </div>

        {/* Live Host Telemetry Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-0.5">
            <div className="text-[11px] text-[var(--barn-muted)]">Detected Hardware Tier</div>
            <div className="font-mono font-semibold tabular-nums text-[var(--barn-ink)]">
              {assessment.definition.badgeLabel} ({assessment.confidence})
            </div>
            <div className="text-[11px] text-[var(--barn-muted)] truncate">
              {assessment.signalSummary}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-0.5">
            <div className="text-[11px] text-[var(--barn-muted)]">Database Engine</div>
            <div className="font-mono font-semibold text-[var(--barn-ink)] truncate">
              {engineName}
            </div>
            <div className="text-[11px] text-[var(--barn-muted)]">
              {activeBrowserCompat.wasmFallbackActive
                ? 'WASM fallback active'
                : 'SQLite WASM ready'}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-0.5">
            <div className="text-[11px] text-[var(--barn-muted)]">OPFS &amp; Persistent Lock</div>
            <div className="font-mono font-semibold text-[var(--barn-ink)]">
              {opfsSupported ? 'OPFS Active' : 'IDB Fallback'}
            </div>
            <div className="text-[11px] text-[var(--barn-muted)]">
              {storageStatus?.persisted ? 'Storage Lock Granted' : 'Standard Browser Quota'}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-0.5">
            <div className="text-[11px] text-[var(--barn-muted)]">Barn Scale vs Tier Budget</div>
            <div className="font-mono font-semibold tabular-nums text-[var(--barn-ink)]">
              {workload.totalRecords.toLocaleString()}
              {workload.maxRecommendedRecords
                ? ` / ${workload.maxRecommendedRecords.toLocaleString()}`
                : ' records'}
            </div>
            <div className="text-[11px] text-[var(--barn-muted)]">
              Vault: {activeTierPolicy.monthlyCap}M · {activeTierPolicy.manualCap}Man ·{' '}
              {activeTierPolicy.rollingIdbCap} IDB
            </div>
          </div>
        </div>

        {/* Memory & Storage Hierarchy Architecture */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2">
            <div className="font-semibold text-[var(--barn-ink)]">
              Memory &amp; Persistence Layer Hierarchy
            </div>
            <ol className="space-y-1.5 text-[11px] text-[var(--barn-muted)] list-decimal pl-4 leading-relaxed">
              <li>
                <strong className="text-[var(--barn-ink)]">Reactive JS Heap (L1 Working RAM):</strong>{' '}
                Holds thumbnail-light records and bounded LRU caches (`BoundedPhotoDataCache`:{' '}
                6–24 full-res images; `pedigreeAncestorCacheRef`: 256 Gen 4+ ancestor nodes).
              </li>
              <li>
                <strong className="text-[var(--barn-ink)]">Primary DB (`SQLite WASM` / IDB):</strong>{' '}
                Canonical herd, pedigree, breeding, and photo storage with lazy on-demand Gen 4+
                and full-resolution image hydration.
              </li>
              <li>
                <strong className="text-[var(--barn-ink)]">OPFS Vault (`/backups` &amp; `/archives`):</strong>{' '}
                Out-of-band monthly, pre-upgrade, recovery-dump, and archived-cohort snapshots
                capped per active device tier.
              </li>
              <li>
                <strong className="text-[var(--barn-ink)]">OPFS Scratchpad (`/tmp`):</strong>{' '}
                Streaming chunk staging for `.ZIP` and `.JSON` exports; swept on boot and cleaned
                immediately after file handoff.
              </li>
            </ol>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2">
            <div className="font-semibold text-[var(--barn-ink)]">
              Tier Dismissal &amp; Adaptive Policy Rules
            </div>
            <ul className="space-y-1.5 text-[11px] text-[var(--barn-muted)] list-disc pl-4 leading-relaxed">
              <li>
                <strong className="text-[var(--barn-ink)]">Tier 1 (Critical Memory Limit):</strong>{' '}
                Locked visible in both Home onboarding and Settings (cannot be closed anywhere).
                Heavy `.ZIP` exports require confirmation; mirror photos dehydrate to thumbnails.
              </li>
              <li>
                <strong className="text-[var(--barn-ink)]">Tier 2 (Survival Mode):</strong> Closable
                on Home screen; remains persistent (not closable) in Settings to prevent accidental
                silencing.
              </li>
              <li>
                <strong className="text-[var(--barn-ink)]">Tiers 3–5 (Mid-Tier to Desktop):</strong>{' '}
                Closable in Home &amp; Settings and reopenable anytime in Settings. Tier 5 allows
                highest vault retention and uncompressed heavy canary checks.
              </li>
              <li>
                <strong className="text-[var(--barn-ink)]">The Techy Stuff Reference:</strong>{' '}
                This reference matrix is permanently pinned and cannot be dismissed or collapsed on
                any hardware tier.
              </li>
            </ul>
          </div>
        </div>

        {/* Complete 5-Tier Capability & Storage Policy Matrix (Always Expanded) */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-[var(--barn-ink)]">
              Complete 5-Tier Capability &amp; Vault Retention Matrix
            </h3>
            <span className="font-mono text-[11px] text-[var(--barn-muted)]">
              Vault Snapshots Currently Stored: {opfsVaultBackups.length}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {DEVICE_CAPABILITY_TIER_LIST.map((item) => {
              const policy = getTierStoragePolicy(item.tier);
              const isCurrent = item.tier === assessment.tier;
              return (
                <div
                  key={item.tier}
                  className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                    isCurrent
                      ? 'bg-[var(--barn-sage-tint)]/45 border-[var(--barn-sage)] ring-1 ring-[var(--barn-sage)]'
                      : 'bg-[var(--barn-canvas)] border-[var(--barn-border)]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[var(--barn-ink)]">
                        Tier {item.tier}: {item.title}
                      </span>
                      {isCurrent && (
                        <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--barn-sage)] text-[var(--barn-on-sage)]">
                          Current Device
                        </span>
                      )}
                    </div>
                    <span className="font-mono tabular-nums text-[11px] text-[var(--barn-muted)]">
                      {item.maxRecommendedRecords
                        ? `≤~${item.maxRecommendedRecords.toLocaleString()} records`
                        : 'Commercial scale'}
                    </span>
                  </div>

                  <p className="text-[11px] text-[var(--barn-muted)] leading-snug">
                    <strong className="text-[var(--barn-ink)]">Target Hardware:</strong>{' '}
                    {item.targetHardware}
                  </p>
                  <p className="text-[11px] text-[var(--barn-muted)] leading-snug">
                    <strong className="text-[var(--barn-ink)]">Workload Policy:</strong>{' '}
                    {item.workloadProfile}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[10px] tabular-nums text-[var(--barn-muted)]">
                    <div>
                      Monthly/PreUp/PreRst:{' '}
                      <span className="text-[var(--barn-ink)] font-semibold">
                        {policy.monthlyCap}/{policy.preUpgradeCap}/{policy.preResetCap}
                      </span>
                    </div>
                    <div>
                      Manual/IDB Rolling:{' '}
                      <span className="text-[var(--barn-ink)] font-semibold">
                        {policy.manualCap}/{policy.rollingIdbCap}
                      </span>
                    </div>
                    <div>
                      Max Safe Import:{' '}
                      <span className="text-[var(--barn-ink)] font-semibold">
                        {formatByteSizePure(policy.maxSafeImportBytesHint)}
                      </span>
                    </div>
                    <div>
                      Flags:{' '}
                      <span className="text-[var(--barn-ink)] font-semibold">
                        {policy.compressVaultBackups ? 'ZIP' : 'JSON'}
                        {policy.dehydrateMirrorPhotos ? ' · ThumbMirror' : ' · FullMirror'}
                        {policy.skipHeavyCanaryZip ? ' · LightCanary' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 6 Columns: Storage Protection, Connectivity & Release Gate */}
        <div className="lg:col-span-6 space-y-6 min-w-0">
          {/* Storage Protection, OPFS & Quota Awareness */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  OPFS &amp; IndexedDB Quota Guardrails
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Verify browser persistence lock and quota headroom before heavy exports or
                  diagnostic dumps
                </p>
              </div>
              <ShieldCheck className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold">
                  {storageStatus?.persisted ? (
                    <>
                      <CheckCircle2
                        className="w-4 h-4 text-[var(--barn-sage)] shrink-0"
                        aria-hidden="true"
                      />
                      <span>Persistent Storage Lock Granted</span>
                    </>
                  ) : (
                    <>
                      <HardDrive
                        className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0"
                        aria-hidden="true"
                      />
                      <span>Standard Browser Storage (Lock Not Yet Elevated)</span>
                    </>
                  )}
                </div>

                {!storageStatus?.persisted && (
                  <button
                    type="button"
                    disabled={!persistStorageSupported}
                    aria-describedby={!persistStorageSupported ? `${baseId}-persist-reason` : undefined}
                    onClick={() => void onRequestPersistentStorage()}
                    className={`min-h-[36px] px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap ${
                      persistStorageSupported
                        ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                        : 'border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[var(--barn-muted)] opacity-55 cursor-not-allowed'
                    }`}
                  >
                    Lock Persistent Storage
                  </button>
                )}
              </div>

              {!storageStatus?.persisted && !persistStorageSupported && (
                <p id={`${baseId}-persist-reason`} className="text-[11px] text-[var(--barn-muted)]">
                  Disabled: This browser doesn&apos;t support manual Persistent Storage locking.
                </p>
              )}

              {storageStatus && storageStatus.quotaBytes > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                    <span>Used: {formatByteSizePure(storageStatus.usageBytes)}</span>
                    <span>
                      Quota: {formatByteSizePure(storageStatus.quotaBytes)} (
                      {storageStatus.percentUsed}%)
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label="Local browser storage used"
                    aria-valuenow={Math.round(storageStatus.percentUsed)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-2 rounded-full bg-[var(--barn-subtle)] overflow-hidden"
                  >
                    <div
                      style={{ width: `${Math.max(1, storageStatus.percentUsed)}%` }}
                      className={`h-full rounded-full ${
                        storageStatus.percentUsed >= 90
                          ? 'bg-[var(--barn-danger)]'
                          : storageStatus.percentUsed >= 75
                            ? 'bg-[var(--barn-terracotta)]'
                            : 'bg-[var(--barn-sage)]'
                      }`}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void handleRunQuotaProbe()}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold inline-flex items-center gap-1.5"
                >
                  <Database className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                  Run OPFS + IDB Quota Pre-Flight Check
                </button>
              </div>

              {quotaProbeReport && (
                <div
                  role="status"
                  aria-live="polite"
                  className={`p-2.5 rounded-lg border text-[11px] space-y-1 ${
                    quotaProbeReport.level === 'blocked'
                      ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-danger)] text-[var(--barn-ink)]'
                      : quotaProbeReport.level === 'warn'
                        ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)] text-[var(--barn-ink)]'
                        : 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)] text-[var(--barn-ink)]'
                  }`}
                >
                  <div className="font-semibold font-mono">{quotaProbeReport.headline}</div>
                  <div className="text-[var(--barn-muted)]">{quotaProbeReport.detail}</div>
                </div>
              )}
            </div>
          </section>

          {/* Connectivity Governor & Probe (Relocated from Settings) */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold">
                {connectivity.isEffectivelyOnline ? (
                  <Wifi className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                ) : (
                  <WifiOff className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0" aria-hidden="true" />
                )}
                <h2 className="font-display text-lg font-semibold">
                  Connectivity Governor:{' '}
                  {connectivity.manualOffline
                    ? 'Manual App Offline'
                    : connectivity.reason === 'captive_or_unreachable'
                      ? 'Captive Wi-Fi / Unreachable'
                      : connectivity.navigatorOnline
                        ? 'Online'
                        : 'Browser Offline'}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={connectivity.manualOffline}
                  onClick={() => connectivity.setManualOffline(!connectivity.manualOffline)}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap border transition-colors ${
                    connectivity.manualOffline
                      ? 'bg-[var(--barn-terracotta)] text-white border-[var(--barn-terracotta)]'
                      : 'bg-[var(--barn-canvas)] text-[var(--barn-ink)] border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                  }`}
                >
                  {connectivity.manualOffline ? 'App Offline: ON' : 'Go Offline in App'}
                </button>
                <button
                  type="button"
                  disabled={connectivity.probeStatus === 'probing' || connectivity.manualOffline}
                  onClick={() => void connectivity.probeNow()}
                  className="min-h-[36px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold whitespace-nowrap disabled:opacity-50"
                >
                  {connectivity.probeStatus === 'probing'
                    ? 'Probing...'
                    : 'Run Connectivity Probe'}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-[var(--barn-muted)]">
              Manual App Offline queues calendar uploads and outbound checks locally without enabling
              device Airplane Mode. The probe checks uncached{' '}
              <code className="font-mono">version.json</code> with a timeout to catch captive barn
              or fairground Wi-Fi portals.
            </p>
            {connectivity.probeDetail && (
              <p className="text-[11px] font-mono text-[var(--barn-ink)] bg-[var(--barn-canvas)] border border-[var(--barn-border)] rounded-lg px-2.5 py-1.5">
                {connectivity.probeDetail}
                {connectivity.lastProbeAtIso
                  ? ` (${new Date(connectivity.lastProbeAtIso).toLocaleTimeString()})`
                  : ''}
              </p>
            )}
          </section>

          {/* App Update Policy & Release Gate (Relocated from Settings) */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold">
                {pwaUpdate.state.policy === 'pinned' ? (
                  <Lock className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0" aria-hidden="true" />
                ) : (
                  <Unlock className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                )}
                <h2 className="font-display text-lg font-semibold">
                  App Update Policy &amp; Release Gate
                </h2>
              </div>
              <span className="font-mono text-[11px] text-[var(--barn-muted)] tabular-nums">
                v{CURRENT_APP_VERSION} · Schema v{CURRENT_BACKUP_SCHEMA_VERSION}
              </span>
            </div>

            <div
              role="radiogroup"
              aria-label="PWA update policy"
              className="grid grid-cols-1 sm:grid-cols-3 gap-2"
            >
              {(
                [
                  {
                    value: 'auto',
                    label: 'Auto Check & Prompt',
                    desc: 'Check on load/focus and show safe apply banner',
                  },
                  {
                    value: 'notify',
                    label: 'Notify Only',
                    desc: 'Passive banner when an update is already staged',
                  },
                  {
                    value: 'pinned',
                    label: 'Pinned (Hold Version)',
                    desc: 'Block update checks & swaps during busy kidding/show runs',
                  },
                ] as Array<{ value: PwaUpdatePolicy; label: string; desc: string }>
              ).map((opt) => {
                const selected = pwaUpdate.state.policy === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => handleUpdatePolicySelect(opt.value)}
                    className={`p-2.5 rounded-lg border text-left transition-colors ${
                      selected
                        ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)] text-[var(--barn-ink)]'
                        : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] text-[var(--barn-muted)] hover:bg-[var(--barn-subtle)]'
                    }`}
                  >
                    <div className="font-semibold text-[11px] text-[var(--barn-ink)]">
                      {opt.label}
                    </div>
                    <div className="text-[10px] mt-0.5 leading-snug">{opt.desc}</div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={updateCheckLock.isSubmitting || pwaUpdate.state.checking}
                onClick={() =>
                  void updateCheckLock.runLocked(async () => {
                    setUpdateCheckFeedback(null);
                    const result = await pwaUpdate.checkNow(true);
                    if (result === 'offline') {
                      setUpdateCheckFeedback(
                        'Skipped update check: device or app is currently in Offline mode.'
                      );
                    } else if (result === 'blocked') {
                      setUpdateCheckFeedback(
                        'Update blocked by remote status.json release gate.'
                      );
                    } else if (result === 'checked') {
                      setUpdateCheckFeedback(
                        'Checked uncached version.json / status.json release gate.'
                      );
                    } else {
                      setUpdateCheckFeedback(
                        'Release gate manifests unreachable right now; continuing on local cached shell.'
                      );
                    }
                  })
                }
                className="min-h-[36px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${pwaUpdate.state.checking ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>Check Release Gate Now</span>
              </button>

              {onCreateVerifiedPreUpgradeBackup && (
                <button
                  type="button"
                  disabled={preUpgradeBackupLock.isSubmitting}
                  onClick={() =>
                    void preUpgradeBackupLock.runLocked(async () => {
                      setPreUpgradeFeedback(null);
                      const res = await onCreateVerifiedPreUpgradeBackup();
                      if (res?.verified) {
                        setPreUpgradeFeedback(
                          `Verified Pre-Upgrade Backup saved (${res.fileName}, SHA-256 ${res.checksumSha256.slice(
                            0,
                            12
                          )}...).`
                        );
                      } else {
                        setPreUpgradeFeedback(
                          'Pre-upgrade backup verification failed — inspect Diagnostics.'
                        );
                      }
                    })
                  }
                  className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {preUpgradeBackupLock.isSubmitting
                      ? 'Verifying Backup...'
                      : 'Verify & Save Pre-Upgrade Backup'}
                  </span>
                </button>
              )}

              {pwaUpdate.state.updateAvailable && pwaUpdate.state.policy !== 'pinned' && (
                <button
                  type="button"
                  disabled={
                    pwaUpdate.state.applying ||
                    Boolean(
                      pwaUpdate.state.gateDecision &&
                        !pwaUpdate.state.gateDecision.canProceedWithDirectSwSwap
                    )
                  }
                  onClick={() => void pwaUpdate.applyUpdate()}
                  className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--barn-terracotta)] text-white text-[11px] font-semibold disabled:opacity-50"
                >
                  {pwaUpdate.state.applying ? 'Applying Update...' : 'Apply Staged Update'}
                </button>
              )}
            </div>

            {updateCheckFeedback && (
              <p className="text-[11px] text-[var(--barn-ink)] bg-[var(--barn-canvas)] border border-[var(--barn-border)] rounded-lg px-2.5 py-1.5">
                {updateCheckFeedback}
              </p>
            )}

            {preUpgradeFeedback && (
              <p className="text-[11px] text-[var(--barn-sage)] bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] rounded-lg px-2.5 py-1.5 font-medium">
                {preUpgradeFeedback}
              </p>
            )}

            {pwaUpdate.state.gateDecision &&
              (!pwaUpdate.state.gateDecision.canProceedWithDirectSwSwap ||
                pwaUpdate.state.updateAvailable) && (
                <div
                  role="status"
                  className={`rounded-lg border px-3 py-2 text-[11px] space-y-1 ${
                    pwaUpdate.state.gateDecision.canProceedWithDirectSwSwap
                      ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)] text-[var(--barn-ink)]'
                      : 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)] text-[var(--barn-ink)]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{pwaUpdate.state.gateDecision.headline}</span>
                  </div>
                  <p className="text-[var(--barn-muted)]">{pwaUpdate.state.gateDecision.detail}</p>
                </div>
              )}
          </section>

          {/* Validated Developer Diagnostic Event Trigger */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">
                  Validated Diagnostic Event Trigger
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Record sanitized manual markers into the diagnostic stream before reproducing a
                  field issue
                </p>
              </div>
              <Activity className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            </div>

            <form onSubmit={handleInjectDiagnosticTrigger} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`${baseId}-trig-level`}
                    className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Event Level
                  </label>
                  <select
                    id={`${baseId}-trig-level`}
                    value={triggerLevel}
                    onChange={(e) =>
                      setTriggerLevel(e.target.value as DiagnosticEventLevelOverride)
                    }
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-xs"
                  >
                    <option value="info">info</option>
                    <option value="warn">warn</option>
                    <option value="error">error</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={`${baseId}-trig-cat`}
                    className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Event Category
                  </label>
                  <select
                    id={`${baseId}-trig-cat`}
                    value={triggerCategory}
                    onChange={(e) =>
                      setTriggerCategory(e.target.value as DiagnosticEventCategoryOverride)
                    }
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-xs"
                  >
                    <option value="lifecycle">lifecycle</option>
                    <option value="storage">storage</option>
                    <option value="memory">memory</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor={`${baseId}-trig-msg`}
                  className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                >
                  Diagnostic Marker Summary (required, 3–200 chars)
                </label>
                <input
                  id={`${baseId}-trig-msg`}
                  type="text"
                  maxLength={200}
                  value={triggerMessage}
                  onChange={(e) => setTriggerMessage(e.target.value)}
                  placeholder="e.g. Before offline photo batch test on Tier 2 tablet"
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                />
              </div>

              <div>
                <label
                  htmlFor={`${baseId}-trig-note`}
                  className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                >
                  Optional Context Notes (sanitized plain text)
                </label>
                <textarea
                  id={`${baseId}-trig-note`}
                  rows={2}
                  maxLength={600}
                  value={triggerNote}
                  onChange={(e) => setTriggerNote(e.target.value)}
                  placeholder="Optional reproduction context"
                  className="w-full p-2.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                />
              </div>

              {triggerError && (
                <p role="alert" className="text-[11px] text-[var(--barn-danger)] font-medium">
                  {triggerError}
                </p>
              )}
              {triggerFeedback && !triggerError && (
                <p
                  role="status"
                  aria-live="polite"
                  className="text-[11px] text-[var(--barn-sage)] font-medium"
                >
                  {triggerFeedback}
                </p>
              )}

              <button
                type="submit"
                className="min-h-[38px] px-4 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold"
              >
                Record Sanitized Diagnostic Event
              </button>
            </form>
          </section>
        </div>

        {/* Right 6 Columns: Diagnostics Panel & Safeguarded Destructive Developer Lab */}
        <div className="lg:col-span-6 space-y-6 min-w-0">
          <DiagnosticsAndSupportPanel
            snapshot={snapshot}
            deviceCapability={deviceCapability}
            storageStatus={storageStatus}
            onRefreshStorageStatus={onRefreshStorageStatus}
            onScanDatabaseHealth={onScanDatabaseHealth}
            onRepairDatabaseHealth={onRepairDatabaseHealth}
            onResetDatabaseConnection={onResetDatabaseConnection}
            onPurgeCorruptedCaches={onPurgeCorruptedCaches}
            onLocateConflicts={onLocateConflicts}
            onHydrateSnapshotForExport={onHydrateSnapshotForExport}
            onAnalyzePhotoFootprint={onAnalyzePhotoFootprint}
            onPruneOrphanPhotos={onPruneOrphanPhotos}
            onReoptimizeOversizedPhotos={onReoptimizeOversizedPhotos}
            onPruneFullResPhotoPayloads={onPruneFullResPhotoPayloads}
          />

          {/* Environment Safeguards & Multi-Step Destructive Developer Lab */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                  <ShieldAlert
                    className="w-5 h-5 text-[var(--barn-danger)] shrink-0"
                    aria-hidden="true"
                  />
                  Destructive &amp; State Reset Safeguards
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  All cache wipes, sync outbox resets, global data wipes, and factory restores
                  require arming the safety lock AND typing an explicit confirmation phrase.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={destructiveArmed}
                onClick={() => {
                  const next = !destructiveArmed;
                  setDestructiveArmed(next);
                  if (!next) {
                    setTmpPurgePhrase('');
                    setSyncResetPhrase('');
                    setWipePhrase('');
                    setFactoryResetPhrase('');
                  }
                }}
                className={`min-h-[40px] max-w-full px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  destructiveArmed
                    ? 'bg-[var(--barn-danger)] text-[var(--barn-on-danger)] border-[var(--barn-danger)]'
                    : 'bg-[var(--barn-canvas)] text-[var(--barn-ink)] border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                }`}
              >
                {destructiveArmed ? 'Safety Lock: ARMED' : 'Arm Destructive Controls'}
              </button>
            </div>

            {/* Pre-reset Backup Quick Actions */}
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-[var(--barn-muted)]">
                Recommended before any reset: save an offline snapshot first.
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {onSaveManualOpfsVaultBackup && (
                  <button
                    type="button"
                    onClick={() =>
                      void onSaveManualOpfsVaultBackup('Pre-reset snapshot from The Techy Stuff')
                    }
                    className="min-h-[36px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold inline-flex items-center gap-1.5"
                  >
                    <HardDrive className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                    Save Vault Snapshot
                  </button>
                )}
                <button
                  type="button"
                  disabled={archiveExportLock.isSubmitting}
                  onClick={() => void handleDownloadPreResetJson()}
                  className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  Download Timestamped JSON Backup
                </button>
              </div>
            </div>

            {labError && (
              <div
                role="alert"
                className="p-2.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-danger)] text-xs font-medium"
              >
                {labError}
              </div>
            )}
            {labFeedback && !labError && (
              <div
                role="status"
                aria-live="polite"
                className="p-2.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs"
              >
                {labFeedback}
              </div>
            )}

            {/* Action 1: Purge OPFS /tmp Scratchpad */}
            <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
              <div>
                <div className="font-semibold text-[var(--barn-ink)]">
                  Purge OPFS /tmp Export Scratchpad
                </div>
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Clears orphaned temporary chunks in OPFS <code className="font-mono">/tmp</code>{' '}
                  without touching SQLite records or <code className="font-mono">/backups</code>.
                </p>
              </div>
              {destructiveArmed && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="text"
                    aria-label="Confirmation phrase to purge OPFS tmp"
                    value={tmpPurgePhrase}
                    onChange={(e) => setTmpPurgePhrase(e.target.value)}
                    placeholder={`Type ${DESTRUCTIVE_CONFIRM_PHRASES.purge_opfs_tmp}`}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-xs w-44"
                  />
                  <button
                    type="button"
                    disabled={
                      destructiveLabLock.isSubmitting ||
                      !opfsSupported ||
                      !isDestructiveActionConfirmationValid('purge_opfs_tmp', tmpPurgePhrase)
                    }
                    onClick={() => void handlePurgeTmpAction()}
                    className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold disabled:opacity-45"
                  >
                    Purge /tmp
                  </button>
                </div>
              )}
            </div>

            {/* Action 2: Reset Sync Outbox & Backup Reminder State */}
            <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
              <div>
                <div className="font-semibold text-[var(--barn-ink)]">
                  Force-Reset Local Sync Outbox &amp; Reminder Metadata
                </div>
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Clears pending delta sync queue entries and reminder snooze timers while leaving
                  animals and backups untouched.
                </p>
              </div>
              {destructiveArmed && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="text"
                    aria-label="Confirmation phrase to reset sync outbox"
                    value={syncResetPhrase}
                    onChange={(e) => setSyncResetPhrase(e.target.value)}
                    placeholder={`Type ${DESTRUCTIVE_CONFIRM_PHRASES.clear_sync_outbox}`}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-xs w-44"
                  />
                  <button
                    type="button"
                    disabled={
                      destructiveLabLock.isSubmitting ||
                      !isDestructiveActionConfirmationValid('clear_sync_outbox', syncResetPhrase)
                    }
                    onClick={() => void handleClearSyncOutboxAction()}
                    className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold disabled:opacity-45"
                  >
                    Reset Sync Outbox
                  </button>
                </div>
              )}
            </div>

            {/* Action 3: Wipe All Animal Data */}
            <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
              <div>
                <div className="font-semibold text-[var(--barn-ink)]">
                  Delete All Animal Data ({snapshot.animals.length} animals · {totalBarnRecords}{' '}
                  total records)
                </div>
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Wipes all animals, photos, breedings, cages, chores, care logs, and shows across
                  every species while keeping barn settings and species schedules.
                </p>
              </div>
              {destructiveArmed && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="text"
                    aria-label="Confirmation phrase to wipe all animal records"
                    value={wipePhrase}
                    onChange={(e) => setWipePhrase(e.target.value)}
                    placeholder={`Type ${DESTRUCTIVE_CONFIRM_PHRASES.wipe_all_animals}`}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-xs w-44"
                  />
                  <button
                    type="button"
                    disabled={
                      totalBarnRecords === 0 ||
                      destructiveLabLock.isSubmitting ||
                      !isDestructiveActionConfirmationValid('wipe_all_animals', wipePhrase)
                    }
                    onClick={() => void handleWipeAllRecordsAction()}
                    className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-45"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Confirm Delete All Animal Data
                  </button>
                </div>
              )}
            </div>

            {/* Action 4: Factory Restore */}
            <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
              <div>
                <div className="font-semibold text-[var(--barn-ink)]">
                  Restore App to Factory Settings &amp; Data
                </div>
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Resets barn name, preferences, custom colors, and species list back to factory
                  defaults and reloads starter sample herds.
                </p>
              </div>
              {destructiveArmed && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="text"
                    aria-label="Confirmation phrase for factory restore"
                    value={factoryResetPhrase}
                    onChange={(e) => setFactoryResetPhrase(e.target.value)}
                    placeholder={`Type ${DESTRUCTIVE_CONFIRM_PHRASES.factory_restore}`}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-xs w-44"
                  />
                  <button
                    type="button"
                    disabled={
                      destructiveLabLock.isSubmitting ||
                      !isDestructiveActionConfirmationValid('factory_restore', factoryResetPhrase)
                    }
                    onClick={() => void handleFactoryRestoreAction()}
                    className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-45"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    Confirm Factory Restore
                  </button>
                </div>
              )}
            </div>

            {/* Non-destructive Sample Seed Reload */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
              <span className="text-[var(--barn-muted)]">
                Need sample herds restored without wiping custom theme colors?
              </span>
              <button
                type="button"
                disabled={destructiveLabLock.isSubmitting}
                onClick={() =>
                  void destructiveLabLock.runLocked(async () => {
                    await onSeedAllSpecies();
                    setLabFeedback('Reloaded predefined sample herds alongside current settings.');
                  })
                }
                className="min-h-[36px] max-w-full px-3 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] disabled:opacity-55"
              >
                Reload 9 Sample Herds Only
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
```

## `src/components/UnifiedBackupVaultPanel.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Unified Backup Vault & Archived Herds Summary Panel (`UnifiedBackupVaultPanel`).
 *
 * Consolidates OPFS `/backups` snapshots (monthly auto, pre-upgrade, pre-reset,
 * manual vault saves, and migration recovery dumps) alongside local IndexedDB
 * rolling snapshots as an automatic fallback tier. Zero pill badges.
 */

import {
  AlertTriangle,
  Archive,
  Download,
  FolderSync,
  HardDrive,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import React, { useState } from 'react';
import { VAULT_KIND_LABELS, VaultBackupMetadata } from '../core/backupVault';
import {
  DeviceCapabilityTierNumber,
  getTierStoragePolicy,
} from '../core/deviceCapability';
import { formatByteSizePure } from '../core/imageOptimizationSpec';
import { BackupSyncStatus } from '../storage/localSyncChannels';
import { OpfsPruneSyncWarning } from '../storage/opfsStorage';
import { RollingBackupMeta } from '../storage/storageProtection';

interface UnifiedBackupVaultPanelProps {
  opfsSupported: boolean;
  opfsBackups: VaultBackupMetadata[];
  rollingBackups: RollingBackupMeta[];
  archivedBundlesCount: number;
  archivedAnimalsCount: number;
  deviceTier?: DeviceCapabilityTierNumber;
  backupSyncStatus?: BackupSyncStatus | null;
  pruneSyncWarning?: OpfsPruneSyncWarning | null;
  onSaveManualVaultBackup: (note?: string) => Promise<unknown> | void;
  onRestoreOpfsBackup: (key: string) => Promise<void>;
  onDownloadOpfsBackup: (key: string) => Promise<void>;
  onDeleteOpfsBackup: (key: string) => Promise<void>;
  onRestoreRollingBackup: (key: string) => Promise<void>;
  onDeleteRollingBackup: (key: string) => Promise<void>;
  onOpenArchivedHerdsModal: () => void;
  onConnectBackupSync?: () => Promise<unknown>;
  onReauthorizeBackupSync?: () => Promise<unknown>;
  onDisconnectBackupSync?: () => Promise<unknown>;
  onSyncVaultToSyncNow?: () => Promise<unknown>;
  onDismissPruneWarning?: () => void;
}

export function UnifiedBackupVaultPanel({
  opfsSupported,
  opfsBackups,
  rollingBackups,
  archivedBundlesCount,
  archivedAnimalsCount,
  deviceTier = 5,
  backupSyncStatus = null,
  pruneSyncWarning = null,
  onSaveManualVaultBackup,
  onRestoreOpfsBackup,
  onDownloadOpfsBackup,
  onDeleteOpfsBackup,
  onRestoreRollingBackup,
  onDeleteRollingBackup,
  onOpenArchivedHerdsModal,
  onConnectBackupSync,
  onReauthorizeBackupSync,
  onDisconnectBackupSync,
  onSyncVaultToSyncNow,
  onDismissPruneWarning,
}: UnifiedBackupVaultPanelProps) {
  const [noteInput, setNoteInput] = useState('');
  const [savingVault, setSavingVault] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmRestoreKey, setConfirmRestoreKey] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const tierPolicy = getTierStoragePolicy(deviceTier);

  const handleSaveSnapshot = async () => {
    setVaultError(null);
    setSavingVault(true);
    try {
      await onSaveManualVaultBackup(noteInput.trim() || undefined);
      setNoteInput('');
    } catch (err: unknown) {
      setVaultError(err instanceof Error ? err.message : 'Could not save vault snapshot.');
    } finally {
      setSavingVault(false);
    }
  };

  const handleRestoreOpfs = async (key: string) => {
    setVaultError(null);
    setBusyKey(key);
    try {
      await onRestoreOpfsBackup(key);
      setConfirmRestoreKey(null);
    } catch (err: unknown) {
      setVaultError(err instanceof Error ? err.message : 'Could not restore OPFS snapshot.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleRestoreRolling = async (key: string) => {
    setVaultError(null);
    setBusyKey(key);
    try {
      await onRestoreRollingBackup(key);
      setConfirmRestoreKey(null);
    } catch (err: unknown) {
      setVaultError(err instanceof Error ? err.message : 'Could not restore IndexedDB snapshot.');
    } finally {
      setBusyKey(null);
    }
  };

  const totalEntries = opfsBackups.length + rollingBackups.length;

  return (
    <div className="space-y-4 border-t border-[var(--barn-border)] pt-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--barn-ink)] flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            <span>Unified Local Backup Vault ({totalEntries})</span>
          </h3>
          <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
            {opfsSupported
              ? `Tier ${deviceTier} caps: ${tierPolicy.monthlyCap} monthly · ${tierPolicy.preUpgradeCap} pre-upgrade · ${tierPolicy.manualCap} manual (compressed .vault.zip) + ${tierPolicy.rollingIdbCap} rolling IndexedDB fallback${tierPolicy.dehydrateMirrorPhotos ? ' (thumbnail-light mirror)' : ''}.`
              : `OPFS directory storage is unavailable in this browser; retaining up to ${tierPolicy.rollingIdbCap} IndexedDB rolling fallback snapshot(s).`}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenArchivedHerdsModal}
          className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <Archive className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
          <span>
            Archived Herds ({archivedBundlesCount}
            {archivedAnimalsCount > 0 ? ` · ${archivedAnimalsCount} animals` : ''})
          </span>
        </button>
      </div>

      {/* Unbacked Prune / Sync-Retained Warning Alert */}
      {pruneSyncWarning && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs flex items-start justify-between gap-2.5"
        >
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle
              className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <div className="font-semibold text-[var(--barn-ink)]">
                {pruneSyncWarning.retained
                  ? 'Expiring Local Backups Retained Pending Sync'
                  : 'Aging Local Backups Pruned Without Sync Copy'}
              </div>
              <p className="text-[11px] text-[var(--barn-muted)]">{pruneSyncWarning.message}</p>
            </div>
          </div>
          {onDismissPruneWarning && (
            <button
              type="button"
              onClick={onDismissPruneWarning}
              aria-label="Dismiss prune warning"
              className="min-h-[44px] min-w-[44px] sm:min-h-[30px] sm:min-w-[30px] rounded-lg hover:bg-[var(--barn-surface)]/70 flex items-center justify-center shrink-0"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* Pre-Prune External Backup Sync Folder */}
      <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2 text-xs">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-0.5 min-w-0 flex-1">
            <div className="font-semibold text-[var(--barn-ink)] flex items-center gap-1.5">
              <FolderSync className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>Pre-Prune Off-App Backup Sync Folder</span>
            </div>
            <p id="vault-sync-availability-reason" className="text-[11px] text-[var(--barn-muted)]">
              {!opfsSupported
                ? 'Disabled: OPFS local vault directory storage is unavailable in this browser version. Rolling backups remain saved in IndexedDB; download Timestamped Backup (.JSON) copies manually.'
                : backupSyncStatus?.supported
                  ? backupSyncStatus.configured
                    ? `Connected: "${backupSyncStatus.folderName}/pedigree-vault-archive" · Expiring vault backups copy here automatically before local cleanup.`
                    : 'Choose a local Drive / OneDrive / SyncThing / iCloud-Desktop folder so expiring vault copies offload before local pruning.'
                  : 'Disabled: Persistent folder access (showDirectoryPicker) is unsupported in this browser (e.g., iOS Safari or older Firefox). Export manual .JSON backups off-device regularly.'}
            </p>
            {opfsSupported && backupSyncStatus?.configured && (
              <div
                aria-live="polite"
                className="text-[11px] font-mono text-[var(--barn-muted)] pt-0.5"
              >
                Permission:{' '}
                <span className="text-[var(--barn-ink)] font-semibold">
                  {backupSyncStatus.permissionState === 'granted'
                    ? 'Ready (auto-offload active)'
                    : backupSyncStatus.permissionState === 'prompt'
                      ? 'Needs re-authorization'
                      : backupSyncStatus.permissionState}
                </span>
                {backupSyncStatus.lastPushFileName && backupSyncStatus.lastPushAtIso
                  ? ` · Last synced ${backupSyncStatus.lastPushFileName} (${new Date(backupSyncStatus.lastPushAtIso).toLocaleDateString()})`
                  : ''}
                {backupSyncStatus.lastPushError ? ` · ${backupSyncStatus.lastPushError}` : ''}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 max-w-full">
            {opfsSupported && backupSyncStatus?.supported ? (
              backupSyncStatus.configured ? (
                <>
                  {backupSyncStatus.permissionState !== 'granted' && onReauthorizeBackupSync && (
                    <button
                      type="button"
                      disabled={syncBusy}
                      onClick={async () => {
                        setSyncBusy(true);
                        try {
                          await onReauthorizeBackupSync();
                        } finally {
                          setSyncBusy(false);
                        }
                      }}
                      className="min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap disabled:opacity-50"
                    >
                      Re-authorize Folder
                    </button>
                  )}
                  {onSyncVaultToSyncNow && (
                    <button
                      type="button"
                      disabled={syncBusy || opfsBackups.length === 0}
                      onClick={async () => {
                        setSyncBusy(true);
                        try {
                          await onSyncVaultToSyncNow();
                        } finally {
                          setSyncBusy(false);
                        }
                      }}
                      className="min-h-[44px] sm:min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                    >
                      <RefreshCw className="w-3 h-3" aria-hidden="true" />
                      Sync Vault Now
                    </button>
                  )}
                  {onDisconnectBackupSync && (
                    <button
                      type="button"
                      disabled={syncBusy}
                      onClick={async () => {
                        setSyncBusy(true);
                        try {
                          await onDisconnectBackupSync();
                        } finally {
                          setSyncBusy(false);
                        }
                      }}
                      className="min-h-[44px] sm:min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] text-[var(--barn-muted)] hover:text-[var(--barn-ink)] whitespace-nowrap disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  )}
                </>
              ) : (
                onConnectBackupSync && (
                  <button
                    type="button"
                    disabled={syncBusy}
                    onClick={async () => {
                      setSyncBusy(true);
                      try {
                        await onConnectBackupSync();
                      } finally {
                        setSyncBusy(false);
                      }
                    }}
                    className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                  >
                    <FolderSync className="w-3.5 h-3.5" aria-hidden="true" />
                    Connect Backup Sync Folder
                  </button>
                )
              )
            ) : (
              <button
                type="button"
                disabled
                aria-describedby="vault-sync-availability-reason"
                className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[var(--barn-muted)] text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap opacity-55 cursor-not-allowed"
              >
                <FolderSync className="w-3.5 h-3.5" aria-hidden="true" />
                Connect Backup Sync Folder
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Manual Snapshot Creation Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <input
          type="text"
          aria-label="Optional backup snapshot note"
          placeholder="Optional snapshot label (e.g. Pre-show weekend check)"
          value={noteInput}
          maxLength={120}
          onChange={(e) => setNoteInput(e.target.value)}
          className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
        />
        <button
          type="button"
          disabled={savingVault}
          onClick={() => void handleSaveSnapshot()}
          className="min-h-[42px] max-w-full px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 sm:shrink-0"
        >
          <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{savingVault ? 'Saving Snapshot...' : 'Save Snapshot to Vault Now'}</span>
        </button>
      </div>

      {vaultError && (
        <div
          role="alert"
          aria-live="polite"
          className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)]"
        >
          {vaultError}
        </div>
      )}

      {totalEntries === 0 ? (
        <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-muted)]">
          No local vault snapshots recorded yet. Save a manual snapshot anytime or edit records to
          trigger automatic rolling &amp; monthly snapshots.
        </div>
      ) : (
        <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl bg-[var(--barn-canvas)] overflow-hidden">
          {opfsBackups.map((item) => {
            const isConfirmRestore = confirmRestoreKey === `opfs:${item.key}`;
            const isConfirmDelete = confirmDeleteKey === `opfs:${item.key}`;
            const isBusy = busyKey === item.key;

            return (
              <div
                key={`opfs:${item.key}`}
                className="px-3.5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="font-medium text-[var(--barn-ink)] flex flex-wrap items-center gap-x-1.5">
                    <span>{VAULT_KIND_LABELS[item.kind]}</span>
                    <span className="text-[var(--barn-muted)]">·</span>
                    <span className="font-mono text-[11px] text-[var(--barn-muted)] tabular-nums">
                      {new Date(item.createdAtIso).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)] truncate">
                    OPFS /backups · v{item.schemaVersion} · {item.animalCount} animals ·{' '}
                    {item.photoCount} photos · {formatByteSizePure(item.byteSize)}
                    {item.note ? ` · ${item.note}` : ''}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 max-w-full">
                  {isConfirmRestore ? (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleRestoreOpfs(item.key)}
                        className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-terracotta)] text-white text-[11px] font-semibold whitespace-nowrap disabled:opacity-50"
                      >
                        {isBusy ? 'Restoring...' : 'Confirm Restore'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRestoreKey(null)}
                        className="min-h-[44px] sm:min-h-[40px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
                      >
                        Cancel
                      </button>
                    </>
                  ) : isConfirmDelete ? (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setConfirmDeleteKey(null);
                          void onDeleteOpfsBackup(item.key);
                        }}
                        className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold whitespace-nowrap"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteKey(null)}
                        className="min-h-[44px] sm:min-h-[40px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => void onDownloadOpfsBackup(item.key)}
                        aria-label={`Download ${item.fileName}`}
                        className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDeleteKey(null);
                          setConfirmRestoreKey(`opfs:${item.key}`);
                        }}
                        className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmRestoreKey(null);
                          setConfirmDeleteKey(`opfs:${item.key}`);
                        }}
                        aria-label={`Delete backup ${item.fileName}`}
                        className="min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {rollingBackups.map((rb) => {
            const isConfirmRestore = confirmRestoreKey === `idb:${rb.key}`;
            const isConfirmDelete = confirmDeleteKey === `idb:${rb.key}`;
            const isBusy = busyKey === rb.key;

            return (
              <div
                key={`idb:${rb.key}`}
                className="px-3.5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="font-medium text-[var(--barn-ink)] flex flex-wrap items-center gap-x-1.5">
                    <span>Rolling IndexedDB Snapshot (Fallback)</span>
                    <span className="text-[var(--barn-muted)]">·</span>
                    <span className="font-mono text-[11px] text-[var(--barn-muted)] tabular-nums">
                      {new Date(rb.savedAtIso).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                    IndexedDB Fallback · {rb.animalCount} animals · {rb.photoCount ?? 0} photos ·{' '}
                    {rb.speciesCount} species · {formatByteSizePure(rb.byteSize)}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 max-w-full">
                  {isConfirmRestore ? (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleRestoreRolling(rb.key)}
                        className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-terracotta)] text-white text-[11px] font-semibold whitespace-nowrap disabled:opacity-50"
                      >
                        {isBusy ? 'Restoring...' : 'Confirm Restore'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRestoreKey(null)}
                        className="min-h-[44px] sm:min-h-[40px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
                      >
                        Cancel
                      </button>
                    </>
                  ) : isConfirmDelete ? (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setConfirmDeleteKey(null);
                          void onDeleteRollingBackup(rb.key);
                        }}
                        className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold whitespace-nowrap"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteKey(null)}
                        className="min-h-[44px] sm:min-h-[40px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDeleteKey(null);
                          setConfirmRestoreKey(`idb:${rb.key}`);
                        }}
                        className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmRestoreKey(null);
                          setConfirmDeleteKey(`idb:${rb.key}`);
                        }}
                        aria-label={`Delete IndexedDB rolling backup ${rb.savedAtIso}`}
                        className="min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </>
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
```

<!-- END OF PART 07 OF 16 (8 files) -->
