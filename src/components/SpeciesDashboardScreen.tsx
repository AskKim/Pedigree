/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Species-Isolated Barn Management Dashboard (`Dashboard`).
 *
 * Displays active gestations/litters, prioritized Master Task List barn chores, cage/pen occupancy,
 * and show rosters strictly filtered to `activeData.speciesProfile.name`.
 */

import { CheckSquare, Plus, Square, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
  BarnSettings,
  BarnTask,
  CageLocation,
  formatBreedingStatusForSpecies,
  formatReadableDate,
  SHOW_SANCTIONS,
  ShowEvent,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TaskCategory,
  TaskPriority,
  todayDateIso,
} from '../core/models';
import { ActiveSpeciesData, WorkspaceRoute } from '../hooks/useBarnStore';

interface SpeciesDashboardScreenProps {
  activeData: ActiveSpeciesData;
  settings: BarnSettings;
  onNavigate: (route: WorkspaceRoute) => void;
  onOpenAnimal: (animalId: string) => void;
  onToggleTask: (task: BarnTask) => void;
  onSetTasksCompletedBatch: (taskIds: string[], completed: boolean) => Promise<void>;
  onSaveTask: (draft: Omit<BarnTask, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteTask: (id: string) => void;
  onDeleteTasksBatch: (taskIds: string[]) => Promise<void>;
  onSaveCage: (draft: Omit<CageLocation, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteCage: (id: string) => void;
  onSaveShow: (draft: Omit<ShowEvent, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteShow: (id: string) => void;
  onSeedSpeciesSample: (speciesName: string) => void;
}

export function SpeciesDashboardScreen({
  activeData,
  onNavigate,
  onOpenAnimal,
  onToggleTask,
  onSetTasksCompletedBatch,
  onSaveTask,
  onDeleteTask,
  onDeleteTasksBatch,
  onSaveCage,
  onDeleteCage,
  onSaveShow,
  onDeleteShow,
  onSeedSpeciesSample,
}: SpeciesDashboardScreenProps) {
  const { speciesProfile, animals, breedings, tasks, cages, shows, herdById } = activeData;
  const today = todayDateIso();

  const [taskFilter, setTaskFilter] = useState<'open' | 'completed'>('open');
  const [multiSelectTasksMode, setMultiSelectTasksMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [confirmBatchDeleteTasks, setConfirmBatchDeleteTasks] = useState(false);
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [showNewCageForm, setShowNewCageForm] = useState(false);
  const [showNewShowForm, setShowNewShowForm] = useState(false);

  useEffect(() => {
    setMultiSelectTasksMode(false);
    setSelectedTaskIds(new Set());
    setConfirmBatchDeleteTasks(false);
  }, [speciesProfile.name, taskFilter]);

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

  const activeBreedingStock = animals.filter((a) => a.status === 'Active').length;
  const activeGestations = breedings.filter((b) =>
    ['Planned', 'Bred', 'Palpated Positive', 'Born'].includes(b.status)
  );
  const openTasksCount = tasks.filter((t) => !t.completed).length;
  const upcomingShows = shows.filter((s) => !s.eventDateIso || s.eventDateIso >= today);

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
      enteredAnimalIds: showAnimalIds,
      notes: '',
    });
    setShowName('');
    setShowLocation('');
    setShowAnimalIds([]);
    setShowNewShowForm(false);
  };

  if (animals.length === 0 && breedings.length === 0 && tasks.length === 0) {
    return (
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-8 text-center space-y-4">
        <h2 className="font-display text-2xl font-semibold">
          {speciesProfile.name} Barn Hub is Ready
        </h2>
        <p className="text-sm text-[var(--barn-muted)] max-w-lg mx-auto">
          No {speciesProfile.name.toLowerCase()} records are logged yet. Register your first{' '}
          {speciesProfile.maleLabel.toLowerCase()} or {speciesProfile.femaleLabel.toLowerCase()}, or
          load a 3-generation sample {speciesProfile.name.toLowerCase()} herd to test pedigrees and
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
            Load Sample {speciesProfile.name} Herd
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 4-Column Species Pulse Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => onNavigate('herd')}
          className="text-left bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 hover:bg-[var(--barn-subtle)]/50 transition-colors"
        >
          <div className="text-xs text-[var(--barn-muted)]">{speciesProfile.name} Herd</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{animals.length}</div>
          <div className="mt-1 text-xs text-[var(--barn-muted)]">
            {activeBreedingStock} active breeding stock
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('breeding')}
          className="text-left bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 hover:bg-[var(--barn-subtle)]/50 transition-colors"
        >
          <div className="text-xs text-[var(--barn-muted)]">
            Active {speciesProfile.birthEventLabel}s
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
            {activeGestations.length}
          </div>
          <div className="mt-1 text-xs text-[var(--barn-muted)]">
            {speciesProfile.gestationDays}d gestation · +{speciesProfile.weanDaysAfterBirth}d wean
          </div>
        </button>

        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4">
          <div className="text-xs text-[var(--barn-muted)]">Open {speciesProfile.name} Chores</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{openTasksCount}</div>
          <div className="mt-1 text-xs text-[var(--barn-muted)]">
            Cascaded &amp; cage-side tasks
          </div>
        </div>

        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4">
          <div className="text-xs text-[var(--barn-muted)]">Cages &amp; Upcoming Shows</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
            {cages.length} / {upcomingShows.length}
          </div>
          <div className="mt-1 text-xs text-[var(--barn-muted)]">
            {cages.length} locations · {upcomingShows.length} show
            {upcomingShows.length === 1 ? '' : 's'}
          </div>
        </div>
      </section>

      {/* Main 2-Column Barn Operations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: Barn To-Do List + Active Litters */}
        <div className="lg:col-span-7 space-y-6">
          {/* Barn Chores / Master Task List Panel */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">
                  {speciesProfile.name} Barn To-Do List
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  Tap any checkbox cage-side to mark completed
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center p-0.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                  <button
                    type="button"
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

                {visibleTasks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setMultiSelectTasksMode((prev) => !prev);
                      setSelectedTaskIds(new Set());
                      setConfirmBatchDeleteTasks(false);
                    }}
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap transition-colors ${
                      multiSelectTasksMode
                        ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                        : 'border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                    }`}
                  >
                    <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />
                    {multiSelectTasksMode ? 'Done Selecting' : 'Multi-Select'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowNewTaskForm((v) => !v)}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  Add Chore
                </button>
              </div>
            </div>

            {multiSelectTasksMode && visibleTasks.length > 0 && (
              <div className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold tabular-nums">
                    {selectedTaskIds.size} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedTaskIds(new Set(visibleTasks.map((t) => t.id)))}
                    className="px-2 py-1 rounded-md border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]"
                  >
                    Select All ({visibleTasks.length})
                  </button>
                  {selectedTaskIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTaskIds(new Set());
                        setConfirmBatchDeleteTasks(false);
                      }}
                      className="px-2 py-1 rounded-md border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {selectedTaskIds.size > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const ids = Array.from(selectedTaskIds);
                        void onSetTasksCompletedBatch(ids, taskFilter === 'open');
                        setSelectedTaskIds(new Set());
                        setConfirmBatchDeleteTasks(false);
                      }}
                      className="min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold"
                    >
                      {taskFilter === 'open'
                        ? `Complete Selected (${selectedTaskIds.size})`
                        : `Reopen Selected (${selectedTaskIds.size})`}
                    </button>

                    {!confirmBatchDeleteTasks ? (
                      <button
                        type="button"
                        onClick={() => setConfirmBatchDeleteTasks(true)}
                        className="min-h-[32px] px-3 py-1 rounded-lg border border-[var(--barn-border)] text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] font-medium"
                      >
                        Delete Selected
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            const ids = Array.from(selectedTaskIds);
                            void onDeleteTasksBatch(ids);
                            setSelectedTaskIds(new Set());
                            setConfirmBatchDeleteTasks(false);
                          }}
                          className="min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-danger)] text-white font-semibold"
                        >
                          Confirm Delete ({selectedTaskIds.size})
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmBatchDeleteTasks(false)}
                          className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)]"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {showNewTaskForm && (
              <form
                onSubmit={submitTask}
                className="border-t border-b border-[var(--barn-border)] py-4 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder={`e.g. Check water line or ${speciesProfile.femaleLabel.toLowerCase()} condition`}
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                  />
                  <input
                    type="date"
                    value={taskDueIso}
                    onChange={(e) => setTaskDueIso(e.target.value)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <select
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
                    value={taskAnimalId}
                    onChange={(e) => setTaskAnimalId(e.target.value)}
                    className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                  >
                    <option value="">No linked animal</option>
                    {animals.map((a) => (
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
                  const isSelected = selectedTaskIds.has(t.id);
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (multiSelectTasksMode) {
                              setSelectedTaskIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(t.id)) next.delete(t.id);
                                else next.add(t.id);
                                return next;
                              });
                            } else {
                              onToggleTask(t);
                            }
                          }}
                          aria-label={
                            multiSelectTasksMode
                              ? isSelected
                                ? `Deselect ${t.title}`
                                : `Select ${t.title}`
                              : t.completed
                              ? `Mark ${t.title} open`
                              : `Complete ${t.title}`
                          }
                          className={`min-h-[40px] min-w-[40px] -ml-2 rounded-lg flex items-center justify-center hover:bg-[var(--barn-subtle)] shrink-0 ${
                            multiSelectTasksMode && !isSelected
                              ? 'text-[var(--barn-muted)]'
                              : 'text-[var(--barn-sage)]'
                          }`}
                        >
                          {(multiSelectTasksMode ? isSelected : t.completed) ? (
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
                            {t.title}
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
                                ? `${isOverdue ? 'Overdue: ' : 'Due '}${formatReadableDate(t.dueDateIso)}`
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
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onDeleteTask(t.id)}
                        aria-label={`Delete chore ${t.title}`}
                        className="min-h-[38px] min-w-[38px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Active Gestations & Litters */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold">
                  Upcoming {speciesProfile.birthEventLabel}s &amp; Active Pairings
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  Calculated from {speciesProfile.gestationDays}-day {speciesProfile.name} gestation
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('breeding')}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap"
              >
                Open Breeding Lab
              </button>
            </div>

            {activeGestations.length === 0 ? (
              <p className="text-sm text-[var(--barn-muted)] py-2">
                No active {speciesProfile.name.toLowerCase()} pairings right now.
              </p>
            ) : (
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
                      {speciesProfile.birthEventLabel}: {formatReadableDate(b.expectedDueDateIso)}
                      {b.liveCount > 0 ? ` · ${b.liveCount} live ${speciesProfile.offspringLabel}s` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right 5 Columns: Cages/Locations + Shows */}
        <div className="lg:col-span-5 space-y-6">
          {/* Cages / Pens Directory */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">
                  {speciesProfile.name} Cages &amp; Pens ({cages.length})
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  Live cage occupancy from {speciesProfile.name.toLowerCase()} records
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewCageForm((v) => !v)}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Add Location
              </button>
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
                      a.cageLocation.trim().toLowerCase() === c.label.trim().toLowerCase() &&
                      (a.status === 'Active' || a.status === 'Junior' || a.status === 'Retired')
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

          {/* Shows & Events */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">Shows &amp; Events</h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  Show strings &amp; entry deadlines for {speciesProfile.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewShowForm((v) => !v)}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Add Show
              </button>
            </div>

            {showNewShowForm && (
              <form
                onSubmit={submitShow}
                className="border-t border-b border-[var(--barn-border)] py-3 space-y-2.5 text-xs"
              >
                <input
                  type="text"
                  required
                  placeholder="Show Name *"
                  value={showName}
                  onChange={(e) => setShowName(e.target.value)}
                  className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Location"
                    value={showLocation}
                    onChange={(e) => setShowLocation(e.target.value)}
                    className="min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                  />
                  <select
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
                    <span className="block text-[var(--barn-muted)] mb-0.5">Event Date *</span>
                    <input
                      type="date"
                      required
                      value={showDateIso}
                      onChange={(e) => setShowDateIso(e.target.value)}
                      className="w-full min-h-[38px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                    />
                  </div>
                  <div>
                    <span className="block text-[var(--barn-muted)] mb-0.5">Entry Deadline</span>
                    <input
                      type="date"
                      value={showDeadlineIso}
                      onChange={(e) => setShowDeadlineIso(e.target.value)}
                      className="w-full min-h-[38px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                    />
                  </div>
                </div>
                {animals.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[var(--barn-muted)]">
                        Select Show String ({showAnimalIds.length} selected):
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setShowAnimalIds(animals.map((a) => a.id))}
                          className="px-2 py-0.5 rounded border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]"
                        >
                          Select All ({animals.length})
                        </button>
                        {showAnimalIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowAnimalIds([])}
                            className="px-2 py-0.5 rounded border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="max-h-28 overflow-y-auto space-y-1 border border-[var(--barn-border)] rounded-lg p-2 bg-[var(--barn-canvas)]">
                      {animals.map((a) => {
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
        </div>
      </div>
    </div>
  );
}
