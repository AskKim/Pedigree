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
  GanttChart,
  Gavel,
  GripVertical,
  HeartPulse,
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
import React, { ComponentProps, Suspense, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { lazyNamedRoute, RouteErrorBoundary, RouteLoadingFallback } from '../utils/lazyRoute';
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
import { P2pReconciliationSummary } from '../core/p2pSyncProtocol';
import { SyncConflictEntry, SyncOperation } from '../core/syncOutbox';
import { BackupSyncStatus } from '../storage/localSyncChannels';
import { FacilityPenBoard } from './FacilityPenBoard';
import { PrintPreviewModal } from './PrintPreviewModal';
import { SpeciesEditorModal } from './SpeciesEditorModal';
import { SpeciesMigrationModal } from './SpeciesMigrationModal';
import type { ImportExportHubSection } from './ImportExportHubScreen';

const BarnSchedulerGantt = lazyNamedRoute<
  ComponentProps<typeof import('./BarnSchedulerGantt')['BarnSchedulerGantt']>
>(() => import('./BarnSchedulerGantt'), 'BarnSchedulerGantt', 'Barn Scheduler Gantt');

const EMPTY_WITHDRAWAL_MAP = new Map<string, AnimalWithdrawalEvaluation>();
const EMPTY_SYNC_OPERATIONS: SyncOperation[] = [];
const EMPTY_SYNC_CONFLICTS: SyncConflictEntry[] = [];

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
  deviceId?: string;
  syncOperations?: SyncOperation[];
  syncConflicts?: SyncConflictEntry[];
  backupSyncStatus?: BackupSyncStatus | null;
  onRescheduleTask?: (
    task: BarnTask,
    nextDates: { startDateIso?: string; dueDateIso: string }
  ) => Promise<boolean>;
  onApplySmartEscalations?: (tasksToEscalate?: BarnTask[]) => Promise<number>;
  onReconcileOutboxOps?: (
    incomingOps: SyncOperation[],
    peerDeviceId?: string
  ) => Promise<P2pReconciliationSummary>;
  onResolveSyncConflict?: (conflictId: string, useSide: 'winning' | 'losing') => Promise<void>;
  onDismissSyncConflict?: (conflictId: string) => Promise<void>;
  onBuildLocalDeltaJson?: () => { filename: string; content: string };
  onOpenHealthReference?: (section?: 'all' | 'wikis' | 'pdfs') => void;
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
  deviceId = 'local-device',
  syncOperations = EMPTY_SYNC_OPERATIONS,
  syncConflicts = EMPTY_SYNC_CONFLICTS,
  backupSyncStatus = null,
  onRescheduleTask,
  onApplySmartEscalations,
  onReconcileOutboxOps,
  onResolveSyncConflict,
  onDismissSyncConflict,
  onBuildLocalDeltaJson,
  onOpenHealthReference,
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
  const [taskViewMode, setTaskViewMode] = useState<'list' | 'gantt'>('list');
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
              White-paper ink-safe layout &middot; Unset species preferences automatically inherit global Barn Settings ({settings.barnName || 'Pedigree'}).
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
              onClick={() => onNavigate('journal')}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-2"
            >
              <BookOpen className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
              <span>Personal Journal ({activeData.journalEntries.length})</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('economics')}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-2"
            >
              <DollarSign className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
              <span>Economics, Yields &amp; 4-H Books</span>
            </button>
            {(settings.enableJudgeNotebook ||
              activeData.judgeAssignments.length +
                activeData.judgeClubs.length +
                activeData.judgeExpenses.length >
                0) && (
              <button
                type="button"
                onClick={() => onNavigate('judge')}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-2"
              >
                <Gavel className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                <span>
                  Judge&apos;s Notebook ({activeData.judgeAssignments.length})
                </span>
              </button>
            )}
            {onOpenHealthReference && (
              <button
                type="button"
                onClick={() => onOpenHealthReference('all')}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-2"
              >
                <HeartPulse className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                <span>Health Wikis &amp; Vet PDFs</span>
              </button>
            )}
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
              onClick={() => onNavigate('journal')}
              className="bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 max-w-full transition-colors"
            >
              <span className="inline-flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-sage)] inline-flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-[var(--barn-ink)] leading-tight">
                    Personal Journal
                  </span>
                  <span className="block text-[11px] text-[var(--barn-muted)] leading-tight font-mono tabular-nums">
                    {activeData.journalEntries.length} entr{activeData.journalEntries.length === 1 ? 'y' : 'ies'}
                  </span>
                </span>
              </span>
              <ArrowRight className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
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

            {(settings.enableJudgeNotebook ||
              activeData.judgeAssignments.length +
                activeData.judgeClubs.length +
                activeData.judgeExpenses.length >
                0) && (
              <button
                type="button"
                onClick={() => onNavigate('judge')}
                className="bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 max-w-full transition-colors"
              >
                <span className="inline-flex items-center gap-2.5 min-w-0">
                  <span className="w-7 h-7 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-sage)] inline-flex items-center justify-center shrink-0">
                    <Gavel className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-[var(--barn-ink)] leading-tight">
                      Judge&apos;s Notebook
                    </span>
                    <span className="block text-[11px] text-[var(--barn-muted)] leading-tight font-mono tabular-nums">
                      {activeData.judgeAssignments.length} show{activeData.judgeAssignments.length === 1 ? '' : 's'} · {activeData.judgeClubs.length} club{activeData.judgeClubs.length === 1 ? '' : 's'}
                    </span>
                  </span>
                </span>
                <ArrowRight className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
              </button>
            )}

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

            {onOpenHealthReference && (
              <button
                type="button"
                onClick={() => onOpenHealthReference('all')}
                className="bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 max-w-full transition-colors"
              >
                <span className="inline-flex items-center gap-2.5 min-w-0">
                  <span className="w-7 h-7 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-sage)] inline-flex items-center justify-center shrink-0">
                    <HeartPulse className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-[var(--barn-ink)] leading-tight">
                      Health Wikis &amp; Vet PDFs
                    </span>
                    <span className="block text-[11px] text-[var(--barn-muted)] leading-tight">
                      Care guides &amp; local PDF folder
                    </span>
                  </span>
                </span>
                <ArrowRight className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
              </button>
            )}
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

          <button
            type="button"
            onClick={() => onNavigate('journal')}
            className="w-full sm:w-auto max-w-full bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 transition-colors"
          >
            <span className="inline-flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-sage)] inline-flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold text-[var(--barn-ink)] leading-tight">
                  Personal Journal
                </span>
                <span className="block text-[11px] text-[var(--barn-muted)] leading-tight font-mono tabular-nums">
                  {activeData.journalEntries.length} entr{activeData.journalEntries.length === 1 ? 'y' : 'ies'}
                </span>
              </span>
            </span>
            <ArrowRight className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
          </button>

          {(settings.enableJudgeNotebook ||
            activeData.judgeAssignments.length +
              activeData.judgeClubs.length +
              activeData.judgeExpenses.length >
              0) && (
            <button
              type="button"
              onClick={() => onNavigate('judge')}
              className="w-full sm:w-auto max-w-full bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 transition-colors"
            >
              <span className="inline-flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-sage)] inline-flex items-center justify-center shrink-0">
                  <Gavel className="w-4 h-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-[var(--barn-ink)] leading-tight">
                    Judge&apos;s Notebook
                  </span>
                  <span className="block text-[11px] text-[var(--barn-muted)] leading-tight font-mono tabular-nums">
                    {activeData.judgeAssignments.length} show{activeData.judgeAssignments.length === 1 ? '' : 's'}
                  </span>
                </span>
              </span>
              <ArrowRight className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
            </button>
          )}

          {onOpenHealthReference && (
            <button
              type="button"
              onClick={() => onOpenHealthReference('all')}
              className="w-full sm:w-auto max-w-full bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] rounded-xl px-4 py-2.5 text-left inline-flex items-center justify-between gap-3 transition-colors"
            >
              <span className="inline-flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-sage)] inline-flex items-center justify-center shrink-0">
                  <HeartPulse className="w-4 h-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-[var(--barn-ink)] leading-tight">
                    Health Wikis &amp; Vet PDFs
                  </span>
                  <span className="block text-[11px] text-[var(--barn-muted)] leading-tight">
                    Care guides &amp; local PDF folder
                  </span>
                </span>
              </span>
              <ArrowRight className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
            </button>
          )}
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
                      <div
                        role="group"
                        aria-label="Chore view mode"
                        className="inline-flex rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-0.5"
                      >
                        <button
                          type="button"
                          onClick={() => setTaskViewMode('list')}
                          aria-pressed={taskViewMode === 'list'}
                          title="Compact Chore Checklist"
                          className={`min-h-[30px] px-2 py-0.5 rounded-md text-[11px] font-medium inline-flex items-center gap-1 whitespace-nowrap ${
                            taskViewMode === 'list'
                              ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold'
                              : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                          }`}
                        >
                          <List className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>List</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setTaskViewMode('gantt')}
                          aria-pressed={taskViewMode === 'gantt'}
                          title="Interactive Barn Scheduler Gantt & LAN P2P Sync"
                          className={`min-h-[30px] px-2 py-0.5 rounded-md text-[11px] font-medium inline-flex items-center gap-1 whitespace-nowrap ${
                            taskViewMode === 'gantt'
                              ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold'
                              : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                          }`}
                        >
                          <GanttChart className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Gantt</span>
                        </button>
                      </div>
                      {taskViewMode === 'list' && (
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
                      )}

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

                  {taskViewMode === 'gantt' ? (
                    <RouteErrorBoundary
                      routeKey={`tasks-gantt:${speciesProfile.name}`}
                      routeLabel="Barn Scheduler Gantt"
                      onNavigateHome={() => onNavigate('home')}
                    >
                      <Suspense fallback={<RouteLoadingFallback label="Barn Scheduler Gantt" />}>
                        <BarnSchedulerGantt
                          speciesProfile={speciesProfile}
                          animals={animals}
                          tasks={tasks}
                          breedings={breedings}
                          settings={settings}
                          deviceId={deviceId}
                          syncOperations={syncOperations}
                          syncConflicts={syncConflicts}
                          backupSyncStatus={backupSyncStatus}
                          onToggleTask={onToggleTask}
                          onRescheduleTask={
                            onRescheduleTask ??
                            (async (task, nextDates) => {
                              const res = await onSaveTask({
                                ...task,
                                startDateIso: nextDates.startDateIso ?? '',
                                dueDateIso: nextDates.dueDateIso,
                              });
                              return res !== false;
                            })
                          }
                          onApplySmartEscalations={
                            onApplySmartEscalations ?? (async () => 0)
                          }
                          onDeleteTask={onDeleteTask}
                          onOpenAnimal={onOpenAnimal}
                          onReconcileOutboxOps={
                            onReconcileOutboxOps ??
                            (async (ops, peerId) => ({
                              peerDeviceId: peerId || 'peer',
                              receivedOpsCount: ops.length,
                              appliedOpCount: 0,
                              taskOpsReceivedCount: ops.filter((o) => o.entity_type === 'task').length,
                              newConflictCount: 0,
                              newTaskConflictCount: 0,
                              reconciledAtIso: new Date().toISOString(),
                            }))
                          }
                          onResolveSyncConflict={
                            onResolveSyncConflict ?? (async () => {})
                          }
                          onDismissSyncConflict={
                            onDismissSyncConflict ?? (async () => {})
                          }
                          onBuildLocalDeltaJson={
                            onBuildLocalDeltaJson ??
                            (() => ({ filename: `delta_${deviceId}.json`, content: '{}' }))
                          }
                        />
                      </Suspense>
                    </RouteErrorBoundary>
                  ) : visibleTasks.length === 0 ? (
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
                                            Record {speciesProfile.birthEventLabel}
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
                                            Missed / False
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
