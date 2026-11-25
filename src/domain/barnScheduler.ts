/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Barn Scheduler Gantt Timeline & Smart Priority Escalation Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) or framework dependencies.
 * All date arithmetic uses explicit `Date.UTC` / `addDaysIso` calendar strings (`YYYY-MM-DD`).
 */

import {
  addDaysIso,
  BarnTask,
  BreedingRecord,
  SpeciesProfile,
  TaskCategory,
  TaskPriority,
  todayDateIso,
} from './models';
import { bumpRecordRevision } from './syncOutbox';

export type GanttGroupingMode = 'breeding_or_animal' | 'category';
export type GanttWindowDays = 14 | 21 | 30;

export interface TaskEscalationEvaluation {
  taskId: string;
  storedPriority: TaskPriority;
  effectivePriority: TaskPriority;
  isEscalated: boolean;
  isOverdue: boolean;
  daysUntilDue: number | null; // negative = overdue
  isCriticalTimeWindow: boolean;
  reason: string;
  urgencyScore: number; // higher = more urgent
}

export interface BarnSchedulerSummary {
  totalOpenCount: number;
  overdueCount: number;
  escalatedCount: number;
  criticalNestboxOrBirthCount: number;
  unscheduledCount: number;
}

export interface GanttDayColumn {
  dateIso: string;
  dayOfMonth: string;
  weekdayShort: string;
  monthShort: string;
  isToday: boolean;
  isWeekend: boolean;
}

export interface BarnGanttBarItem {
  task: BarnTask;
  escalation: TaskEscalationEvaluation;
  effectiveStartIso: string;
  effectiveDueIso: string;
  durationDays: number;
  startColIndex: number; // 0-based within window
  spanCols: number; // >= 1
  overdueTailCols: number; // extra columns extending from due date up to today when overdue
  clippedLeft: boolean;
  clippedRight: boolean;
  isInWindow: boolean;
}

export interface BarnGanttLane {
  laneId: string;
  label: string;
  subtitle: string;
  linkedAnimalId?: string;
  linkedBreedingId?: string;
  category?: TaskCategory;
  bars: BarnGanttBarItem[];
  hasEscalatedTask: boolean;
  hasOverdueTask: boolean;
}

export interface BarnGanttTimelineModel {
  windowStartIso: string;
  windowEndIso: string;
  windowDays: GanttWindowDays;
  todayIso: string;
  days: GanttDayColumn[];
  lanes: BarnGanttLane[];
  unscheduledTasks: Array<{ task: BarnTask; escalation: TaskEscalationEvaluation }>;
  summary: BarnSchedulerSummary;
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  Low: 1,
  Normal: 2,
  High: 3,
};

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function isValidYmdIso(iso: string | undefined): iso is string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return false;
  const [y, m, d] = iso.trim().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Computes exact signed calendar days (`toIso - fromIso`) using `Date.UTC`.
 */
export function diffYmdDays(fromIso: string, toIso: string): number | null {
  if (!isValidYmdIso(fromIso) || !isValidYmdIso(toIso)) return null;
  const [y1, m1, d1] = fromIso.split('-').map(Number);
  const [y2, m2, d2] = toIso.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / 86_400_000);
}

/**
 * Evaluates smart priority escalation rules for a single `BarnTask` relative to `todayIso`.
 * Time-critical biological tasks (such as overdue or due-today `Nestbox` and `Birth Check` tasks)
 * automatically escalate to `High` priority with an explicit explanation.
 */
export function evaluateTaskPriorityEscalation(
  task: BarnTask,
  todayIso: string = todayDateIso()
): TaskEscalationEvaluation {
  const storedPriority: TaskPriority = task.priority || 'Normal';

  if (task.completed || !isValidYmdIso(task.dueDateIso)) {
    return {
      taskId: task.id,
      storedPriority,
      effectivePriority: storedPriority,
      isEscalated: false,
      isOverdue: false,
      daysUntilDue: isValidYmdIso(task.dueDateIso) ? diffYmdDays(todayIso, task.dueDateIso) : null,
      isCriticalTimeWindow: false,
      reason: '',
      urgencyScore: PRIORITY_RANK[storedPriority] * 10,
    };
  }

  const daysUntilDue = diffYmdDays(todayIso, task.dueDateIso)!;
  const isOverdue = daysUntilDue < 0;
  const overdueDays = isOverdue ? Math.abs(daysUntilDue) : 0;

  let effectivePriority: TaskPriority = storedPriority;
  let reason = '';
  let isCriticalTimeWindow = false;

  if (task.category === 'Nestbox' || task.category === 'Birth Check') {
    if (isOverdue) {
      effectivePriority = 'High';
      isCriticalTimeWindow = true;
      reason = `Overdue ${task.category.toLowerCase()} (${overdueDays}d late)`;
    } else if (daysUntilDue === 0) {
      effectivePriority = 'High';
      isCriticalTimeWindow = true;
      reason = `${task.category} due today`;
    } else if (daysUntilDue === 1) {
      effectivePriority = 'High';
      isCriticalTimeWindow = true;
      reason = `${task.category} due tomorrow`;
    }
  } else if (task.category === 'Health' || task.category === 'Palpation') {
    if (isOverdue) {
      effectivePriority = 'High';
      isCriticalTimeWindow = true;
      reason = `Overdue ${task.category.toLowerCase()} (${overdueDays}d late)`;
    } else if (daysUntilDue === 0 && PRIORITY_RANK[storedPriority] < PRIORITY_RANK.Normal) {
      effectivePriority = 'Normal';
      reason = `${task.category} due today`;
    }
  } else {
    if (daysUntilDue <= -3) {
      effectivePriority = 'High';
      isCriticalTimeWindow = true;
      reason = `Overdue by ${overdueDays} days`;
    } else if (isOverdue && PRIORITY_RANK[storedPriority] < PRIORITY_RANK.Normal) {
      effectivePriority = 'Normal';
      reason = `Overdue by ${overdueDays}d`;
    } else if (daysUntilDue === 0 && storedPriority === 'Low') {
      effectivePriority = 'Normal';
      reason = 'Due today';
    }
  }

  const isEscalated = PRIORITY_RANK[effectivePriority] > PRIORITY_RANK[storedPriority];
  const dueUrgencyBoost = isOverdue
    ? 100 + Math.min(60, overdueDays * 5)
    : daysUntilDue === 0
    ? 60
    : daysUntilDue <= 2
    ? 30
    : 0;
  const urgencyScore =
    PRIORITY_RANK[effectivePriority] * 25 +
    dueUrgencyBoost +
    (isCriticalTimeWindow ? 40 : 0);

  return {
    taskId: task.id,
    storedPriority,
    effectivePriority,
    isEscalated,
    isOverdue,
    daysUntilDue,
    isCriticalTimeWindow,
    reason,
    urgencyScore,
  };
}

/**
 * Builds updated `BarnTask` objects for every open task whose stored priority is lower than
 * its smart-escalated `effectivePriority`. Bumps `_rev` for deterministic sync reconciliation.
 */
export function buildPriorityEscalationUpdates(
  tasks: BarnTask[],
  todayIso: string,
  timestampIso: string
): BarnTask[] {
  const updates: BarnTask[] = [];
  for (const task of tasks) {
    if (task.completed) continue;
    const evalRes = evaluateTaskPriorityEscalation(task, todayIso);
    if (evalRes.isEscalated) {
      updates.push({
        ...task,
        priority: evalRes.effectivePriority,
        _rev: bumpRecordRevision(task),
        updatedAt: timestampIso,
      });
    }
  }
  return updates;
}

/**
 * Resolves the effective `[startDateIso, dueDateIso]` pair for a `BarnTask`.
 */
export function resolveTaskSpanDates(task: Pick<BarnTask, 'startDateIso' | 'dueDateIso'>): {
  startDateIso: string;
  dueDateIso: string;
  durationDays: number;
} | null {
  if (!isValidYmdIso(task.dueDateIso)) return null;
  const due = task.dueDateIso.trim();
  let start = isValidYmdIso(task.startDateIso) ? task.startDateIso.trim() : due;
  if (start > due) start = due;
  const diff = diffYmdDays(start, due) ?? 0;
  return {
    startDateIso: start,
    dueDateIso: due,
    durationDays: Math.max(1, diff + 1),
  };
}

/**
 * Shifts a task's scheduled `dueDateIso` (and `startDateIso` if set) by `deltaDays`
 * using pure UTC calendar math.
 */
export function shiftTaskDatesByDays(
  task: BarnTask,
  deltaDays: number,
  timestampIso: string
): BarnTask | null {
  if (!Number.isFinite(deltaDays) || Math.round(deltaDays) === 0) return null;
  const span = resolveTaskSpanDates(task);
  if (!span) return null;
  const cleanDelta = Math.round(deltaDays);
  const nextDue = addDaysIso(span.dueDateIso, cleanDelta);
  const nextStart = isValidYmdIso(task.startDateIso)
    ? addDaysIso(span.startDateIso, cleanDelta)
    : undefined;

  return {
    ...task,
    ...(nextStart ? { startDateIso: nextStart } : {}),
    dueDateIso: nextDue,
    _rev: bumpRecordRevision(task),
    updatedAt: timestampIso,
  };
}

/**
 * Adjusts a task's `startDateIso` edge by `deltaStartDays` (clamped so `startDateIso <= dueDateIso`),
 * allowing Gantt bar duration resizing without altering `dueDateIso`.
 */
export function resizeTaskStartDateByDays(
  task: BarnTask,
  deltaStartDays: number,
  timestampIso: string
): BarnTask | null {
  if (!Number.isFinite(deltaStartDays) || Math.round(deltaStartDays) === 0) return null;
  const span = resolveTaskSpanDates(task);
  if (!span) return null;
  const cleanDelta = Math.round(deltaStartDays);
  let nextStart = addDaysIso(span.startDateIso, cleanDelta);
  if (nextStart > span.dueDateIso) {
    nextStart = span.dueDateIso;
  }
  if (nextStart === span.startDateIso && isValidYmdIso(task.startDateIso)) {
    return null;
  }
  return {
    ...task,
    startDateIso: nextStart === span.dueDateIso ? '' : nextStart,
    _rev: bumpRecordRevision(task),
    updatedAt: timestampIso,
  };
}

/**
 * Builds the complete Barn Scheduler Gantt timeline model for the active species.
 */
export function buildBarnGanttTimeline(params: {
  tasks: BarnTask[];
  breedings: BreedingRecord[];
  speciesProfile: SpeciesProfile;
  windowStartIso: string;
  windowDays: GanttWindowDays;
  grouping: GanttGroupingMode;
  includeCompleted?: boolean;
  todayIso?: string;
}): BarnGanttTimelineModel {
  const todayIso = isValidYmdIso(params.todayIso) ? params.todayIso : todayDateIso();
  const windowStartIso = isValidYmdIso(params.windowStartIso)
    ? params.windowStartIso
    : addDaysIso(todayIso, -3);
  const windowEndIso = addDaysIso(windowStartIso, params.windowDays - 1);

  const days: GanttDayColumn[] = [];
  for (let i = 0; i < params.windowDays; i++) {
    const dateIso = addDaysIso(windowStartIso, i);
    const [y, m, d] = dateIso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dow = dt.getUTCDay();
    days.push({
      dateIso,
      dayOfMonth: String(d),
      weekdayShort: WEEKDAY_NAMES[dow],
      monthShort: MONTH_NAMES[m - 1],
      isToday: dateIso === todayIso,
      isWeekend: dow === 0 || dow === 6,
    });
  }

  const breedingById = new Map<string, BreedingRecord>(
    params.breedings.map((b) => [b.id, b])
  );

  const evaluations = new Map<string, TaskEscalationEvaluation>();
  let totalOpenCount = 0;
  let overdueCount = 0;
  let escalatedCount = 0;
  let criticalNestboxOrBirthCount = 0;
  let unscheduledCount = 0;

  for (const task of params.tasks) {
    const ev = evaluateTaskPriorityEscalation(task, todayIso);
    evaluations.set(task.id, ev);
    if (!task.completed) {
      totalOpenCount += 1;
      if (ev.isOverdue) overdueCount += 1;
      if (ev.isEscalated) escalatedCount += 1;
      if (
        ev.isCriticalTimeWindow &&
        (task.category === 'Nestbox' || task.category === 'Birth Check')
      ) {
        criticalNestboxOrBirthCount += 1;
      }
      if (!isValidYmdIso(task.dueDateIso)) {
        unscheduledCount += 1;
      }
    }
  }

  const filteredTasks = params.tasks.filter(
    (t) => params.includeCompleted || !t.completed
  );

  const unscheduledTasks: Array<{ task: BarnTask; escalation: TaskEscalationEvaluation }> = [];
  const laneMap = new Map<string, BarnGanttLane>();

  const ensureLane = (
    laneId: string,
    meta: Omit<BarnGanttLane, 'laneId' | 'bars' | 'hasEscalatedTask' | 'hasOverdueTask'>
  ): BarnGanttLane => {
    let existing = laneMap.get(laneId);
    if (!existing) {
      existing = {
        laneId,
        ...meta,
        bars: [],
        hasEscalatedTask: false,
        hasOverdueTask: false,
      };
      laneMap.set(laneId, existing);
    }
    return existing;
  };

  for (const task of filteredTasks) {
    const escalation = evaluations.get(task.id)!;
    const span = resolveTaskSpanDates(task);
    if (!span) {
      unscheduledTasks.push({ task, escalation });
      continue;
    }

    let lane: BarnGanttLane;
    if (params.grouping === 'category') {
      lane = ensureLane(`cat:${task.category}`, {
        label: task.category,
        subtitle: `${params.speciesProfile.name} chores`,
        category: task.category,
      });
    } else if (task.linkedBreedingId && breedingById.has(task.linkedBreedingId)) {
      const b = breedingById.get(task.linkedBreedingId)!;
      lane = ensureLane(`breed:${b.id}`, {
        label: `${b.damName} × ${b.sireName}`,
        subtitle: `Bred ${b.bredDateIso} · Due ${b.actualBirthDateIso || b.expectedDueDateIso || 'TBD'}`,
        linkedBreedingId: b.id,
        linkedAnimalId: b.damId || task.linkedAnimalId || undefined,
      });
    } else if (task.linkedAnimalId) {
      lane = ensureLane(`animal:${task.linkedAnimalId}`, {
        label: task.linkedAnimalName || 'Linked Animal',
        subtitle: `${params.speciesProfile.name} individual care`,
        linkedAnimalId: task.linkedAnimalId,
      });
    } else {
      lane = ensureLane('general:barn', {
        label: 'General Barn Chores',
        subtitle: `${params.speciesProfile.name} facility & routine tasks`,
      });
    }

    const rawStartOffset = diffYmdDays(windowStartIso, span.startDateIso)!;
    const rawDueOffset = diffYmdDays(windowStartIso, span.dueDateIso)!;
    const todayOffset = diffYmdDays(windowStartIso, todayIso)!;

    // Visual overdue tail extends from due date toward today if uncompleted & overdue
    const effectiveVisualEndOffset =
      !task.completed && escalation.isOverdue && todayOffset > rawDueOffset
        ? todayOffset
        : rawDueOffset;

    const isInWindow =
      effectiveVisualEndOffset >= 0 && rawStartOffset <= params.windowDays - 1;
    const clippedLeft = rawStartOffset < 0;
    const clippedRight = rawDueOffset > params.windowDays - 1;
    const startColIndex = Math.max(0, Math.min(params.windowDays - 1, rawStartOffset));
    const clampedDueCol = Math.max(startColIndex, Math.min(params.windowDays - 1, rawDueOffset));
    const spanCols = Math.max(1, clampedDueCol - startColIndex + 1);

    let overdueTailCols = 0;
    if (!task.completed && escalation.isOverdue && todayOffset > rawDueOffset) {
      const tailStart = Math.max(0, rawDueOffset + 1);
      const tailEnd = Math.min(params.windowDays - 1, todayOffset);
      if (tailEnd >= tailStart && rawDueOffset < params.windowDays - 1) {
        overdueTailCols = tailEnd - tailStart + 1;
      }
    }

    if (escalation.isEscalated) lane.hasEscalatedTask = true;
    if (escalation.isOverdue && !task.completed) lane.hasOverdueTask = true;

    lane.bars.push({
      task,
      escalation,
      effectiveStartIso: span.startDateIso,
      effectiveDueIso: span.dueDateIso,
      durationDays: span.durationDays,
      startColIndex,
      spanCols,
      overdueTailCols,
      clippedLeft,
      clippedRight,
      isInWindow,
    });
  }

  for (const lane of laneMap.values()) {
    lane.bars.sort(
      (a, b) =>
        a.effectiveStartIso.localeCompare(b.effectiveStartIso) ||
        b.escalation.urgencyScore - a.escalation.urgencyScore
    );
  }

  const lanes = Array.from(laneMap.values()).sort((a, b) => {
    if (a.hasOverdueTask !== b.hasOverdueTask) return a.hasOverdueTask ? -1 : 1;
    if (a.hasEscalatedTask !== b.hasEscalatedTask) return a.hasEscalatedTask ? -1 : 1;
    const aEarliest = a.bars[0]?.effectiveDueIso || '9999-99-99';
    const bEarliest = b.bars[0]?.effectiveDueIso || '9999-99-99';
    return aEarliest.localeCompare(bEarliest) || a.label.localeCompare(b.label);
  });

  return {
    windowStartIso,
    windowEndIso,
    windowDays: params.windowDays,
    todayIso,
    days,
    lanes,
    unscheduledTasks,
    summary: {
      totalOpenCount,
      overdueCount,
      escalatedCount,
      criticalNestboxOrBirthCount,
      unscheduledCount,
    },
  };
}
