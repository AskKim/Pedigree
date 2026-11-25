/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Visual Hutch-by-Hutch / Cage Row & Pasture Board (`src/components/FacilityPenBoard.tsx`).
 *
 * Groups physical pens by barn section/row, displays live capacity warnings (`IMP-028`),
 * links pens to feedlot inventories with quick stock adjustments, tracks recurring maintenance
 * schedules with 1-click completion + Master Task List scheduling, and launches QR-coded
 * cage card printing (`IMP-035` / `IMP-036`) for single pens or entire barn rows.
 */

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Edit3,
  Package,
  Plus,
  QrCode,
  Trash2,
  UserPlus,
  Wrench,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CageAssignmentCapacityWarning,
  evaluateCageAssignmentCapacityWarning,
  normalizeCageLabelKey,
} from '../domain/barnAlerts';
import {
  buildCageMaintenanceTaskDraft,
  FacilityBoardFilter,
  FacilityBoardModel,
  FacilityPenCardModel,
  formatHousingUnitTypeLabel,
  matchesFacilityBoardFilter,
} from '../domain/facilityBoard';
import {
  Animal,
  BarnTask,
  CageLocation,
  FeedBatch,
  HOUSING_UNIT_TYPES,
  HousingUnitType,
  SpeciesProfile,
  todayDateIso,
} from '../domain/models';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { useAsyncKeyedLock } from '../utils/useAsyncSubmitLock';

export interface FacilityPenBoardProps {
  speciesProfile: SpeciesProfile;
  cages: CageLocation[];
  animals: Animal[];
  assignableAnimals: Animal[];
  boardModel: FacilityBoardModel;
  highlightedCageId?: string | null;
  onClearHighlightedCage?: () => void;
  onOpenAnimal: (animalId: string) => void;
  onSaveCage: (
    draft: Omit<CageLocation, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<boolean | void> | void;
  onDeleteCage: (id: string) => void;
  onAssignAnimalToCage?: (animalId: string, nextCageLabel: string) => Promise<boolean | void> | void;
  onSaveTask: (
    draft: Omit<BarnTask, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<boolean | void> | void;
  onPrintCageCardsForAnimals: (animals: Animal[], titleContext: string) => void;
  feedBatches?: FeedBatch[];
  onOpenFeedLedger?: () => void;
  fullScreen?: boolean;
  onCloseFullScreen?: () => void;
}

interface CageEditDraft {
  label: string;
  section: string;
  capacity: string;
  unitType: HousingUnitType | '';
  feedLotName: string;
  feedStockRemaining: string;
  feedStockUnit: string;
  feedLowThreshold: string;
  dailyRationNote: string;
  maintenanceTaskLabel: string;
  maintenanceIntervalDays: string;
  lastMaintenanceDateIso: string;
  notes: string;
}

function buildEditDraftFromCage(cage: CageLocation): CageEditDraft {
  return {
    label: cage.label,
    section: cage.section || '',
    capacity: String(Math.max(1, Number(cage.capacity) || 1)),
    unitType: cage.unitType || '',
    feedLotName: cage.feedLotName || '',
    feedStockRemaining:
      cage.feedStockRemaining && cage.feedStockRemaining > 0
        ? String(cage.feedStockRemaining)
        : '',
    feedStockUnit: cage.feedStockUnit || 'lbs',
    feedLowThreshold:
      cage.feedLowThreshold && cage.feedLowThreshold > 0 ? String(cage.feedLowThreshold) : '',
    dailyRationNote: cage.dailyRationNote || '',
    maintenanceTaskLabel: cage.maintenanceTaskLabel || '',
    maintenanceIntervalDays:
      cage.maintenanceIntervalDays && cage.maintenanceIntervalDays > 0
        ? String(cage.maintenanceIntervalDays)
        : '',
    lastMaintenanceDateIso: cage.lastMaintenanceDateIso || '',
    notes: cage.notes || '',
  };
}

function parseOptionalPosNum(raw: string): number | undefined {
  const n = Number(raw.trim());
  if (!raw.trim() || !Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n * 100) / 100;
}

function parseOptionalPosInt(raw: string): number | undefined {
  const n = Number(raw.trim());
  if (!raw.trim() || !Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(3650, Math.max(1, Math.round(n)));
}

export function FacilityPenBoard({
  speciesProfile,
  cages,
  animals,
  assignableAnimals,
  boardModel,
  highlightedCageId,
  onClearHighlightedCage,
  onOpenAnimal,
  onSaveCage,
  onDeleteCage,
  onAssignAnimalToCage,
  onSaveTask,
  onPrintCageCardsForAnimals,
  feedBatches = [],
  onOpenFeedLedger,
  fullScreen = false,
  onCloseFullScreen,
}: FacilityPenBoardProps) {
  const [filter, setFilter] = useState<FacilityBoardFilter>('all');
  const [selectedSectionKey, setSelectedSectionKey] = useState<string>('all');
  const [editingCageId, setEditingCageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<CageEditDraft | null>(null);
  const [scheduleNextTaskOnMaint, setScheduleNextTaskOnMaint] = useState(true);
  const [pendingCageAssignConfirm, setPendingCageAssignConfirm] = useState<{
    cageId: string;
    cageLabel: string;
    animalId: string;
    animalName: string;
    warning: CageAssignmentCapacityWarning;
  } | null>(null);

  const actionLock = useAsyncKeyedLock();
  const highlightScrolledRef = useRef<string | null>(null);

  useEffect(() => {
    setFilter('all');
    setSelectedSectionKey('all');
    setEditingCageId(null);
    setEditDraft(null);
    setPendingCageAssignConfirm(null);
  }, [speciesProfile.name]);

  useEffect(() => {
    if (!highlightedCageId || highlightScrolledRef.current === highlightedCageId) return;
    const pen = boardModel.byCageId.get(highlightedCageId);
    if (!pen) return;
    highlightScrolledRef.current = highlightedCageId;
    setFilter('all');
    setSelectedSectionKey('all');
    const el = document.getElementById(`facility-pen-${highlightedCageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedCageId, boardModel.byCageId]);

  const visibleSections = useMemo(() => {
    return boardModel.sections
      .filter((sec) => selectedSectionKey === 'all' || sec.sectionKey === selectedSectionKey)
      .map((sec) => {
        const filteredPens = sec.pens.filter((pen) => matchesFacilityBoardFilter(pen, filter));
        return {
          ...sec,
          pens: filteredPens,
        };
      })
      .filter((sec) => sec.pens.length > 0);
  }, [boardModel.sections, selectedSectionKey, filter]);

  const allOccupiedAnimals = useMemo(() => {
    const seen = new Set<string>();
    const out: Animal[] = [];
    for (const sec of boardModel.sections) {
      for (const a of sec.occupantAnimals) {
        if (!seen.has(a.id)) {
          seen.add(a.id);
          out.push(a);
        }
      }
    }
    return out;
  }, [boardModel.sections]);

  const handleSaveEditedCage = async (cage: CageLocation) => {
    if (!editDraft || !editDraft.label.trim()) return;
    await actionLock.runKeyLocked(`edit:${cage.id}`, async () => {
      const feedStockRemaining = parseOptionalPosNum(editDraft.feedStockRemaining);
      const feedLowThreshold = parseOptionalPosNum(editDraft.feedLowThreshold);
      const maintenanceIntervalDays = parseOptionalPosInt(editDraft.maintenanceIntervalDays);
      const saved = await onSaveCage({
        id: cage.id,
        species: cage.species,
        label: editDraft.label.trim(),
        section: editDraft.section.trim(),
        capacity: Math.max(1, Math.round(Number(editDraft.capacity) || 1)),
        notes: editDraft.notes.trim(),
        unitType: editDraft.unitType || undefined,
        feedLotName: editDraft.feedLotName.trim() || undefined,
        feedStockRemaining,
        feedStockUnit: editDraft.feedLotName.trim() || feedStockRemaining
          ? editDraft.feedStockUnit.trim() || 'lbs'
          : undefined,
        feedLowThreshold,
        dailyRationNote: editDraft.dailyRationNote.trim() || undefined,
        maintenanceIntervalDays,
        maintenanceTaskLabel: editDraft.maintenanceTaskLabel.trim() || undefined,
        lastMaintenanceDateIso: editDraft.lastMaintenanceDateIso.trim() || undefined,
      });
      if (saved !== false) {
        setEditingCageId(null);
        setEditDraft(null);
        if (pendingCageAssignConfirm?.cageId === cage.id) {
          setPendingCageAssignConfirm(null);
        }
      }
    });
  };

  const handleQuickAssign = async (cage: CageLocation, animalId: string) => {
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
    await actionLock.runKeyLocked(`assign:${cage.id}`, async () => {
      await onAssignAnimalToCage(animal.id, cage.label);
    });
  };

  const handleConfirmOverCapacityAssign = async () => {
    if (!pendingCageAssignConfirm || !onAssignAnimalToCage) return;
    const { cageId, cageLabel: targetLabel, animalId } = pendingCageAssignConfirm;
    await actionLock.runKeyLocked(`assign:${cageId}`, async () => {
      await onAssignAnimalToCage(animalId, targetLabel);
      setPendingCageAssignConfirm(null);
    });
  };

  const handleUnassign = async (cageId: string, animalId: string) => {
    if (!onAssignAnimalToCage) return;
    if (pendingCageAssignConfirm?.cageId === cageId) {
      setPendingCageAssignConfirm(null);
    }
    await actionLock.runKeyLocked(`unassign:${animalId}`, async () => {
      await onAssignAnimalToCage(animalId, '');
    });
  };

  const handleLogMaintenanceDone = async (cage: CageLocation) => {
    const today = todayDateIso();
    await actionLock.runKeyLocked(`maint:${cage.id}`, async () => {
      const saved = await onSaveCage({
        ...cage,
        lastMaintenanceDateIso: today,
      });
      if (saved !== false && scheduleNextTaskOnMaint) {
        const nextTask = buildCageMaintenanceTaskDraft(cage, today);
        if (nextTask) {
          await onSaveTask(nextTask);
        }
      }
    });
  };

  const handleAdjustFeedStock = async (cage: CageLocation, delta: number) => {
    await actionLock.runKeyLocked(`feed:${cage.id}`, async () => {
      const current = Number(cage.feedStockRemaining) || 0;
      const nextVal = Math.max(0, Math.round((current + delta) * 100) / 100);
      await onSaveCage({
        ...cage,
        feedStockRemaining: nextVal > 0 ? nextVal : undefined,
      });
    });
  };

  const handleRegisterUnregisteredCage = async (label: string, animalCount: number) => {
    await actionLock.runKeyLocked(`register:${label.toLowerCase()}`, async () => {
      await onSaveCage({
        species: speciesProfile.name,
        label,
        section: '',
        capacity: Math.max(1, animalCount),
        notes: '',
      });
    });
  };

  const renderPenCard = (pen: FacilityPenCardModel) => {
    const { cage, occupancy, maintenance, feed, unitType, openLinkedTasks } = pen;
    const isHighlighted = highlightedCageId === cage.id;
    const isEditing = editingCageId === cage.id && editDraft !== null;
    const cageKey = normalizeCageLabelKey(cage.label);
    const candidateAnimals = assignableAnimals.filter(
      (a) => normalizeCageLabelKey(a.cageLocation) !== cageKey
    );
    const unassignedCandidates = candidateAnimals.filter((a) => !a.cageLocation.trim());
    const otherCageCandidates = candidateAnimals.filter((a) => Boolean(a.cageLocation.trim()));
    const pendingConfirm =
      pendingCageAssignConfirm?.cageId === cage.id ? pendingCageAssignConfirm : null;

    const accentBorder = occupancy.isOverCapacity
      ? 'border-l-[var(--barn-danger)]'
      : occupancy.isAtCapacity
        ? 'border-l-[var(--barn-terracotta)]'
        : occupancy.occupantCount > 0
          ? 'border-l-[var(--barn-sage)]'
          : 'border-l-[var(--barn-border)]';

    return (
      <article
        key={cage.id}
        id={`facility-pen-${cage.id}`}
        className={`rounded-xl border border-l-4 ${accentBorder} ${
          isHighlighted
            ? 'border-[var(--barn-sage)] ring-2 ring-[var(--barn-sage)]/40 bg-[var(--barn-sage-tint)]/35'
            : 'border-[var(--barn-border)] bg-[var(--barn-canvas)]'
        } p-3 space-y-2 text-xs transition-colors`}
      >
        {/* Top Row: Pen label, unit type, capacity, actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono font-semibold text-sm text-[var(--barn-ink)]">
                {cage.label}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[10px] font-medium text-[var(--barn-muted)]">
                {formatHousingUnitTypeLabel(unitType)}
              </span>
              <span
                className={`font-mono tabular-nums inline-flex items-center gap-1 ${
                  occupancy.isOverCapacity
                    ? 'font-semibold text-[var(--barn-danger)]'
                    : occupancy.isAtCapacity
                      ? 'font-semibold text-[var(--barn-terracotta)]'
                      : 'text-[var(--barn-muted)]'
                }`}
              >
                {occupancy.isOverCapacity && (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                )}
                {occupancy.ratioLabel}
              </span>
            </div>

            {isHighlighted && onClearHighlightedCage && (
              <div className="flex items-center gap-2 text-[11px] text-[var(--barn-sage)] font-medium">
                <span>Opened via scanned pen link</span>
                <button
                  type="button"
                  onClick={onClearHighlightedCage}
                  className="underline hover:opacity-80"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {occupancy.occupants.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  onPrintCageCardsForAnimals(
                    occupancy.occupants,
                    `${cage.label} (${occupancy.occupants.length})`
                  )
                }
                aria-label={`Print QR cage cards for ${cage.label}`}
                title={`Print QR cage card${occupancy.occupants.length === 1 ? '' : 's'} for ${cage.label}`}
                className="min-h-[32px] min-w-[32px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (isEditing) {
                  setEditingCageId(null);
                  setEditDraft(null);
                } else {
                  setEditingCageId(cage.id);
                  setEditDraft(buildEditDraftFromCage(cage));
                }
              }}
              aria-label={`Edit ${cage.label} pen details`}
              title="Edit pen, feedlot & maintenance"
              className="min-h-[32px] min-w-[32px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
            >
              <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (editingCageId === cage.id) {
                  setEditingCageId(null);
                  setEditDraft(null);
                }
                if (pendingCageAssignConfirm?.cageId === cage.id) {
                  setPendingCageAssignConfirm(null);
                }
                onDeleteCage(cage.id);
              }}
              aria-label={`Remove location ${cage.label}`}
              title={`Remove ${cage.label}`}
              className="min-h-[32px] min-w-[32px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Occupant chips */}
        {occupancy.occupants.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {occupancy.occupants.map((occ) => {
              const unassignBusy = actionLock.isKeyLocked(`unassign:${occ.id}`);
              return (
                <span
                  key={occ.id}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--barn-border)] bg-[var(--barn-surface)] px-2 py-0.5"
                >
                  <button
                    type="button"
                    onClick={() => onOpenAnimal(occ.id)}
                    className="font-medium hover:text-[var(--barn-sage)] hover:underline text-left"
                  >
                    {occ.name}
                    {occ.tattoo ? (
                      <span className="font-mono text-[10.5px] text-[var(--barn-muted)] ml-1">
                        ({occ.tattoo})
                      </span>
                    ) : null}
                  </button>
                  {onAssignAnimalToCage && (
                    <button
                      type="button"
                      disabled={unassignBusy}
                      onClick={() => void handleUnassign(cage.id, occ.id)}
                      aria-label={`Remove ${occ.name} from ${cage.label}`}
                      title={`Remove ${occ.name} from ${cage.label}`}
                      className="min-h-[20px] min-w-[20px] rounded text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center disabled:opacity-45"
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        ) : (
          <div className="text-[11px] text-[var(--barn-muted)] italic">Open / Unassigned</div>
        )}

        {/* Feedlot Inventory Link */}
        {feed.hasFeedLink && (
          <div
            className={`rounded-lg border px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] ${
              feed.isLowStock
                ? 'border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)]/60'
                : 'border-[var(--barn-border)] bg-[var(--barn-surface)]'
            }`}
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-1.5 font-medium text-[var(--barn-ink)]">
                <Package className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                <span className="truncate">{feed.feedLotName || 'Linked Feed'}</span>
                {feed.isLowStock && (
                  <span className="font-semibold text-[var(--barn-danger)] shrink-0">
                    {feed.isDepleted ? 'Out of stock' : 'Low stock'}
                  </span>
                )}
              </div>
              <div className="text-[10.5px] text-[var(--barn-muted)] flex flex-wrap gap-x-2">
                {(feed.stockRemaining > 0 || feed.lowThreshold > 0) && (
                  <span className="font-mono tabular-nums">{feed.stockSummaryLabel}</span>
                )}
                {feed.dailyRationNote && <span>Ration: {feed.dailyRationNote}</span>}
              </div>
            </div>
            {(feed.stockRemaining > 0 || feed.lowThreshold > 0) && (
              <div className="inline-flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={actionLock.isKeyLocked(`feed:${cage.id}`) || feed.stockRemaining <= 0}
                  onClick={() => void handleAdjustFeedStock(cage, -1)}
                  aria-label={`Decrease feed stock for ${cage.label}`}
                  className="min-h-[26px] min-w-[26px] rounded border border-[var(--barn-border)] bg-[var(--barn-canvas)] font-mono font-semibold hover:bg-[var(--barn-subtle)] disabled:opacity-40"
                >
                  −1
                </button>
                <button
                  type="button"
                  disabled={actionLock.isKeyLocked(`feed:${cage.id}`)}
                  onClick={() => void handleAdjustFeedStock(cage, 1)}
                  aria-label={`Increase feed stock for ${cage.label}`}
                  className="min-h-[26px] min-w-[26px] rounded border border-[var(--barn-border)] bg-[var(--barn-canvas)] font-mono font-semibold hover:bg-[var(--barn-subtle)] disabled:opacity-40"
                >
                  +1
                </button>
              </div>
            )}
          </div>
        )}

        {/* Recurring Maintenance Schedule */}
        {maintenance.hasSchedule && (
          <div
            className={`rounded-lg border px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] ${
              maintenance.state === 'overdue'
                ? 'border-[var(--barn-danger)] bg-[var(--barn-terracotta-tint)]/75'
                : maintenance.state === 'due_today' || maintenance.state === 'unlogged'
                  ? 'border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)]/45'
                  : 'border-[var(--barn-border)] bg-[var(--barn-surface)]'
            }`}
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-1.5 font-medium text-[var(--barn-ink)]">
                <Wrench className="w-3.5 h-3.5 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
                <span className="truncate">{maintenance.taskLabel}</span>
              </div>
              <div
                className={`text-[10.5px] font-mono tabular-nums ${
                  maintenance.state === 'overdue'
                    ? 'text-[var(--barn-danger)] font-semibold'
                    : maintenance.needsAttention
                      ? 'text-[var(--barn-terracotta)] font-semibold'
                      : 'text-[var(--barn-muted)]'
                }`}
              >
                {maintenance.statusText}
              </div>
            </div>
            <button
              type="button"
              disabled={actionLock.isKeyLocked(`maint:${cage.id}`)}
              onClick={() => void handleLogMaintenanceDone(cage)}
              className="min-h-[28px] px-2.5 py-1 rounded-md bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold inline-flex items-center gap-1 hover:opacity-95 disabled:opacity-55 shrink-0"
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              Log Done
            </button>
          </div>
        )}

        {/* Open Linked Tasks Summary */}
        {openLinkedTasks.length > 0 && (
          <div className="text-[11px] text-[var(--barn-muted)] flex items-center gap-1.5">
            <span className="font-mono font-semibold text-[var(--barn-ink)]">
              {openLinkedTasks.length} open task{openLinkedTasks.length === 1 ? '' : 's'}:
            </span>
            <span className="truncate">{openLinkedTasks[0].title}</span>
          </div>
        )}

        {/* Inline Pen / Feedlot / Maintenance Editor */}
        {isEditing && editDraft && (
          <div className="p-2.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="space-y-0.5">
                <span className="text-[10.5px] text-[var(--barn-muted)]">Label *</span>
                <input
                  type="text"
                  value={editDraft.label}
                  onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })}
                  placeholder="Hutch R-09"
                  className="w-full min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
                />
              </label>
              <label className="space-y-0.5">
                <span className="text-[10.5px] text-[var(--barn-muted)]">Barn Section / Row</span>
                <input
                  type="text"
                  value={editDraft.section}
                  onChange={(e) => setEditDraft({ ...editDraft, section: e.target.value })}
                  placeholder="Row A / North Pasture"
                  className="w-full min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                />
              </label>
              <label className="space-y-0.5">
                <span className="text-[10.5px] text-[var(--barn-muted)]">Housing Type</span>
                <select
                  value={editDraft.unitType}
                  onChange={(e) =>
                    setEditDraft({
                      ...editDraft,
                      unitType: e.target.value as HousingUnitType | '',
                    })
                  }
                  className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                >
                  <option value="">Auto-detect</option>
                  {HOUSING_UNIT_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-0.5">
                <span className="text-[10.5px] text-[var(--barn-muted)]">Capacity</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={editDraft.capacity}
                  onChange={(e) => setEditDraft({ ...editDraft, capacity: e.target.value })}
                  className="w-full min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                />
              </label>
            </div>

            <div className="pt-1.5 border-t border-[var(--barn-border)] space-y-2">
              <div className="text-[11px] font-semibold text-[var(--barn-ink)]">
                Feedlot Inventory Link (Optional)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="min-w-0">
                  <input
                    type="text"
                    aria-label="Feed lot or bin name"
                    list={
                      feedBatches.length > 0 ? `facility-feed-lot-list-${cage.id}` : undefined
                    }
                    value={editDraft.feedLotName}
                    onChange={(e) => setEditDraft({ ...editDraft, feedLotName: e.target.value })}
                    placeholder="Feed lot (e.g. 18% Show Pellet - Bin A)"
                    className="w-full min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                  />
                  {feedBatches.length > 0 && (
                    <datalist id={`facility-feed-lot-list-${cage.id}`}>
                      {feedBatches.map((b) => {
                        const lotLabel = b.lotNumber
                          ? `${[b.brand, b.productName].filter(Boolean).join(' ')} (Lot ${b.lotNumber})`
                          : [b.brand, b.productName].filter(Boolean).join(' ');
                        return lotLabel ? <option key={b.id} value={lotLabel} /> : null;
                      })}
                    </datalist>
                  )}
                </div>
                <input
                  type="text"
                  aria-label="Daily ration note"
                  value={editDraft.dailyRationNote}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, dailyRationNote: e.target.value })
                  }
                  placeholder="Daily ration (e.g. 6 oz/day)"
                  className="w-full min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  aria-label="Remaining feed stock"
                  value={editDraft.feedStockRemaining}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, feedStockRemaining: e.target.value })
                  }
                  placeholder="Stock qty"
                  className="min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                />
                <input
                  type="text"
                  aria-label="Feed stock unit"
                  value={editDraft.feedStockUnit}
                  onChange={(e) => setEditDraft({ ...editDraft, feedStockUnit: e.target.value })}
                  placeholder="Unit (lbs/bags)"
                  className="min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                />
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  aria-label="Low stock alert threshold"
                  value={editDraft.feedLowThreshold}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, feedLowThreshold: e.target.value })
                  }
                  placeholder="Low alert ≤"
                  className="min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="pt-1.5 border-t border-[var(--barn-border)] space-y-2">
              <div className="text-[11px] font-semibold text-[var(--barn-ink)]">
                Recurring Maintenance Schedule (Optional)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  aria-label="Maintenance task label"
                  value={editDraft.maintenanceTaskLabel}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, maintenanceTaskLabel: e.target.value })
                  }
                  placeholder="Sanitize tray & waterer"
                  className="sm:col-span-2 min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                />
                <input
                  type="number"
                  min={0}
                  max={365}
                  aria-label="Maintenance interval in days"
                  value={editDraft.maintenanceIntervalDays}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, maintenanceIntervalDays: e.target.value })
                  }
                  placeholder="Every N days"
                  className="min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                />
              </div>
              <label className="flex items-center gap-2 text-[11px] text-[var(--barn-muted)]">
                <span>Last done:</span>
                <input
                  type="date"
                  value={editDraft.lastMaintenanceDateIso}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, lastMaintenanceDateIso: e.target.value })
                  }
                  className="min-h-[32px] px-2 py-0.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono text-[var(--barn-ink)]"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={actionLock.isKeyLocked(`edit:${cage.id}`)}
                onClick={() => {
                  setEditingCageId(null);
                  setEditDraft(null);
                }}
                className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLock.isKeyLocked(`edit:${cage.id}`) || !editDraft.label.trim()}
                onClick={() => void handleSaveEditedCage(cage)}
                className="min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-55"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                {actionLock.isKeyLocked(`edit:${cage.id}`) ? 'Saving...' : 'Save Pen'}
              </button>
            </div>
          </div>
        )}

        {/* Quick Occupant Assignment Dropdown */}
        {onAssignAnimalToCage && candidateAnimals.length > 0 && (
          <div className="relative">
            <UserPlus
              className="w-3.5 h-3.5 text-[var(--barn-muted)] pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <select
              value=""
              disabled={actionLock.isKeyLocked(`assign:${cage.id}`)}
              aria-label={`Assign animal to ${cage.label}`}
              onChange={(e) => {
                const picked = e.target.value;
                if (picked) {
                  void handleQuickAssign(cage, picked);
                }
              }}
              className="w-full min-h-[32px] pl-8 pr-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[11px] text-[var(--barn-ink)] disabled:opacity-55"
            >
              <option value="">
                {actionLock.isKeyLocked(`assign:${cage.id}`)
                  ? 'Assigning...'
                  : `+ Assign ${speciesProfile.name} to ${cage.label}...`}
              </option>
              {unassignedCandidates.length > 0 && (
                <optgroup label="Unassigned">
                  {unassignedCandidates.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.tattoo ? ` (${a.tattoo})` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {otherCageCandidates.length > 0 && (
                <optgroup label="Move from another pen">
                  {otherCageCandidates.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.tattoo ? ` (${a.tattoo})` : ''} · in {a.cageLocation}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        )}

        {/* IMP-028 Soft Over-Capacity Confirmation */}
        {pendingConfirm && (
          <div
            role="alert"
            className="rounded-lg border border-[var(--barn-danger)] bg-[var(--barn-terracotta-tint)] px-2.5 py-2 space-y-1.5 text-[11px]"
          >
            <div className="font-semibold text-[var(--barn-danger)] flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{pendingConfirm.warning.headline}</span>
            </div>
            <p className="text-[var(--barn-ink)]">{pendingConfirm.warning.detail}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={actionLock.isKeyLocked(`assign:${cage.id}`)}
                onClick={() => void handleConfirmOverCapacityAssign()}
                className="min-h-[28px] px-2.5 py-1 rounded-md bg-[var(--barn-danger)] text-white font-semibold disabled:opacity-55"
              >
                Assign Anyway
              </button>
              <button
                type="button"
                onClick={() => setPendingCageAssignConfirm(null)}
                className="min-h-[28px] px-2.5 py-1 rounded-md border border-[var(--barn-border)] bg-[var(--barn-surface)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </article>
    );
  };

  const boardContent = (
    <div className="space-y-3">
      {/* Compact KPI / Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div
          role="group"
          aria-label="Filter pens on Facility Board"
          className="flex flex-wrap items-center gap-1"
        >
          {(
            [
              { id: 'all', label: 'All', count: boardModel.totals.totalPens, warn: false },
              {
                id: 'over_capacity',
                label: 'Over Cap',
                count: boardModel.totals.overCapacityPens,
                warn: boardModel.totals.overCapacityPens > 0,
              },
              {
                id: 'maintenance_due',
                label: 'Maint Due',
                count: boardModel.totals.maintenanceDueOrOverdue,
                warn: boardModel.totals.maintenanceDueOrOverdue > 0,
              },
              {
                id: 'low_feed',
                label: 'Low Feed',
                count: boardModel.totals.lowFeedPens,
                warn: boardModel.totals.lowFeedPens > 0,
              },
              { id: 'open', label: 'Open Spots', count: boardModel.totals.emptyPens, warn: false },
            ] as const
          ).map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(item.id)}
                className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 transition-colors ${
                  active
                    ? 'bg-[var(--barn-sage)] border-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold'
                    : item.warn
                      ? 'border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)]/55 text-[var(--barn-ink)]'
                      : 'border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                }`}
              >
                <span>{item.label}</span>
                <span className="font-mono tabular-nums opacity-85">({item.count})</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {boardModel.sections.length > 1 && (
            <select
              aria-label="Filter by barn section"
              value={selectedSectionKey}
              onChange={(e) => setSelectedSectionKey(e.target.value)}
              className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
            >
              <option value="all">All Sections ({boardModel.sections.length})</option>
              {boardModel.sections.map((sec) => (
                <option key={sec.sectionKey} value={sec.sectionKey}>
                  {sec.sectionName} ({sec.totalPens})
                </option>
              ))}
            </select>
          )}

          {allOccupiedAnimals.length > 0 && (
            <button
              type="button"
              onClick={() =>
                onPrintCageCardsForAnimals(
                  allOccupiedAnimals,
                  `${speciesProfile.name} Facility (${allOccupiedAnimals.length})`
                )
              }
              className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <QrCode className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
              Print All QR Cards
            </button>
          )}
        </div>
      </div>

      {/* Auto-schedule next reminder toggle when any pen has recurring maintenance */}
      {boardModel.allPens.some((p) => p.maintenance.hasSchedule) && (
        <label className="inline-flex items-center gap-2 text-[11px] text-[var(--barn-muted)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={scheduleNextTaskOnMaint}
            onChange={(e) => setScheduleNextTaskOnMaint(e.target.checked)}
            className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
          />
          <span>
            When logging maintenance done, automatically schedule the next reminder in Master Task List
          </span>
        </label>
      )}

      {/* Feedlot Inventory Rollup Strip */}
      {boardModel.feedLots.length > 0 && (
        <div className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-2.5 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-[var(--barn-ink)]">
            <div className="flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
              <span>Linked Feedlot Inventories ({boardModel.feedLots.length})</span>
            </div>
            {onOpenFeedLedger && (
              <button
                type="button"
                onClick={onOpenFeedLedger}
                className="text-[11px] font-semibold text-[var(--barn-sage)] hover:underline"
              >
                Open Feed Ledger
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {boardModel.feedLots.map((lot) => (
              <div
                key={lot.lotKey}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] space-y-0.5 ${
                  lot.hasLowStock
                    ? 'border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)]/55'
                    : 'border-[var(--barn-border)] bg-[var(--barn-surface)]'
                }`}
              >
                <div className="font-semibold text-[var(--barn-ink)] flex items-center gap-1.5">
                  <span>{lot.feedLotName}</span>
                  {lot.hasLowStock && (
                    <span className="text-[10px] font-mono text-[var(--barn-danger)]">
                      LOW ({lot.lowStockPenCount})
                    </span>
                  )}
                </div>
                <div className="text-[10.5px] font-mono tabular-nums text-[var(--barn-muted)]">
                  {lot.penCount} pen{lot.penCount === 1 ? '' : 's'} · {lot.animalCount} head
                  {lot.totalStockRemaining > 0
                    ? ` · ${lot.totalStockRemaining} ${lot.stockUnit}`
                    : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unregistered Housing Labels & Unassigned Stock Bar */}
      {(boardModel.unregisteredCages.length > 0 || boardModel.totals.unassignedCount > 0) && (
        <div className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] px-3 py-2 space-y-1.5 text-[11px]">
          {boardModel.unregisteredCages.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-[var(--barn-ink)]">
                Unregistered pen labels on animals:
              </span>
              {boardModel.unregisteredCages.map((u) => (
                <button
                  key={u.labelKey}
                  type="button"
                  disabled={actionLock.isKeyLocked(`register:${u.labelKey}`)}
                  onClick={() => void handleRegisterUnregisteredCage(u.label, u.animals.length)}
                  className="min-h-[26px] px-2 py-0.5 rounded-md border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] text-[var(--barn-ink)] font-medium inline-flex items-center gap-1 hover:opacity-90 disabled:opacity-50"
                >
                  <Plus className="w-3 h-3" aria-hidden="true" />
                  <span className="font-mono">{u.label}</span>
                  <span className="text-[var(--barn-muted)]">({u.animals.length})</span>
                </button>
              ))}
            </div>
          )}
          {boardModel.totals.unassignedCount > 0 && (
            <div className="text-[var(--barn-muted)]">
              <span className="font-mono font-semibold text-[var(--barn-ink)]">
                {boardModel.totals.unassignedCount}
              </span>{' '}
              active {speciesProfile.name.toLowerCase()} record
              {boardModel.totals.unassignedCount === 1 ? ' has' : 's have'} no cage/pen assigned yet
              — use any pen&apos;s <strong className="text-[var(--barn-ink)]">+ Assign</strong> menu
              below.
            </div>
          )}
        </div>
      )}

      {/* Visual Section-Grouped Hutch / Pen Board */}
      {boardModel.totals.totalPens === 0 ? (
        <p className="text-sm text-[var(--barn-muted)]">
          No cages, hutches, or pastures added yet. Use <strong>Add Location</strong> to start your
          visual facility board.
        </p>
      ) : visibleSections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--barn-border)] p-4 text-center text-xs text-[var(--barn-muted)] space-y-1">
          <div>No pens match the active board filter.</div>
          <button
            type="button"
            onClick={() => {
              setFilter('all');
              setSelectedSectionKey('all');
            }}
            className="text-[var(--barn-sage)] font-semibold underline"
          >
            Reset board filters
          </button>
        </div>
      ) : (
        <div
          className={`space-y-4 ${
            fullScreen ? '' : 'max-h-[34rem] overflow-y-auto pr-1'
          }`}
        >
          {visibleSections.map((sec) => (
            <section
              key={sec.sectionKey}
              aria-label={`Barn section ${sec.sectionName}`}
              className="space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[var(--barn-border)]">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--barn-ink)]">
                    {sec.sectionName}
                  </h3>
                  <span className="font-mono text-[11px] tabular-nums text-[var(--barn-muted)]">
                    {sec.occupiedPens}/{sec.totalPens} occupied · {sec.totalOccupants}/
                    {sec.totalCapacity} head
                  </span>
                  {sec.overCapacityCount > 0 && (
                    <span className="text-[11px] font-semibold text-[var(--barn-danger)]">
                      · {sec.overCapacityCount} over cap
                    </span>
                  )}
                  {sec.maintenanceAttentionCount > 0 && (
                    <span className="text-[11px] font-semibold text-[var(--barn-terracotta)]">
                      · {sec.maintenanceAttentionCount} maint due
                    </span>
                  )}
                </div>
                {sec.occupantAnimals.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      onPrintCageCardsForAnimals(
                        sec.occupantAnimals,
                        `${sec.sectionName} (${sec.occupantAnimals.length})`
                      )
                    }
                    className="min-h-[28px] px-2 py-0.5 rounded-md border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <QrCode className="w-3 h-3 text-[var(--barn-sage)]" aria-hidden="true" />
                    Print Row QR Cards ({sec.occupantAnimals.length})
                  </button>
                )}
              </div>

              <div
                className={
                  fullScreen
                    ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'
                    : 'grid grid-cols-1 sm:grid-cols-2 gap-2.5'
                }
              >
                {sec.pens.map(renderPenCard)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );

  if (!fullScreen) {
    return boardContent;
  }

  return (
    <FullScreenFacilityBoardShell
      title={`${speciesProfile.name} Facility Pen & Hutch-Row Board`}
      subtitle={`${boardModel.totals.totalPens} pens across ${boardModel.sections.length} section${
        boardModel.sections.length === 1 ? '' : 's'
      } · ${boardModel.totals.totalOccupants}/${boardModel.totals.totalCapacity} total occupancy`}
      onClose={onCloseFullScreen ?? (() => {})}
    >
      {boardContent}
    </FullScreenFacilityBoardShell>
  );
}

function FullScreenFacilityBoardShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useAccessibleDialog({ isOpen: true, onClose });
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
    >
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-6xl h-[92dvh] max-h-full flex flex-col overflow-hidden shadow-2xl">
        <div className="px-4 sm:px-6 py-3.5 border-b border-[var(--barn-border)] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg sm:text-xl font-semibold truncate">{title}</h2>
            <p className="text-xs text-[var(--barn-muted)] font-mono tabular-nums mt-0.5">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close full-screen facility board"
            className="min-h-[38px] min-w-[38px] rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
