/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Barn Alerts Engine (`src/core/barnAlerts.ts`).
 *
 * Evaluates per-species:
 * 1. Due / overdue tasks alert (filtering permanently ignored task IDs and
 *    group-cleared alert signatures so clearing an alert hides the current
 *    task group without ignoring the tasks themselves).
 * 2. Babies about to arrive alert (gestation nearly complete).
 */

import {
  Animal,
  BarnTask,
  BreedingRecord,
  doesAnimalNeedAttention,
  isSameSpecies,
  pluralizeSpeciesLabel,
  SpeciesProfile,
  todayDateIso,
} from './models';

export interface DueTaskAlertEvaluation {
  tasks: BarnTask[];
  overdueCount: number;
  dueTodayCount: number;
  groupSignature: string;
  shouldShow: boolean;
}

export interface ArrivingBabiesItem {
  breeding: BreedingRecord;
  daysUntilDue: number;
  timingLabel: string;
}

export interface ArrivingBabiesAlertEvaluation {
  items: ArrivingBabiesItem[];
  windowDays: number;
  offspringPluralLabel: string;
  shouldShow: boolean;
}

/**
 * Computes signed whole calendar days from `fromIso` to `toIso` (`YYYY-MM-DD`).
 * Positive means `toIso` is in the future; `0` means same day; negative means past.
 */
export function diffCalendarDaysIso(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return Number.NaN;
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

/**
 * Computes a deterministic group signature for a set of tasks.
 * When tasks are completed, permanently ignored, or new tasks become due/overdue,
 * this signature changes so a previously cleared group alert will reappear for the new group.
 */
export function buildTaskAlertGroupSignature(tasks: BarnTask[]): string {
  if (tasks.length === 0) return '';
  return tasks
    .map((t) => `${t.id}:${t.dueDateIso}`)
    .sort()
    .join('|');
}

/**
 * Evaluates due and overdue tasks for a single livestock species.
 */
export function evaluateSpeciesDueTasksAlert(
  tasks: BarnTask[],
  speciesName: string,
  options?: {
    todayIso?: string;
    ignoredTaskIds?: ReadonlySet<string>;
    clearedGroupSignature?: string;
  }
): DueTaskAlertEvaluation {
  const todayIso = options?.todayIso || todayDateIso();
  const ignored = options?.ignoredTaskIds;

  const dueOrOverdue = tasks
    .filter(
      (t) =>
        isSameSpecies(t.species, speciesName) &&
        !t.completed &&
        Boolean(t.dueDateIso) &&
        t.dueDateIso <= todayIso &&
        (!ignored || !ignored.has(t.id))
    )
    .sort((a, b) => a.dueDateIso.localeCompare(b.dueDateIso) || a.title.localeCompare(b.title));

  const overdueCount = dueOrOverdue.filter((t) => t.dueDateIso < todayIso).length;
  const dueTodayCount = dueOrOverdue.length - overdueCount;
  const groupSignature = buildTaskAlertGroupSignature(dueOrOverdue);
  const isGroupCleared =
    Boolean(options?.clearedGroupSignature) && options?.clearedGroupSignature === groupSignature;

  return {
    tasks: dueOrOverdue,
    overdueCount,
    dueTodayCount,
    groupSignature,
    shouldShow: dueOrOverdue.length > 0 && !isGroupCleared,
  };
}

/**
 * Computes how many days before expected birth counts as "gestation nearly complete"
 * for a given species gestation length (3 days minimum, 7 days maximum).
 */
export function getGestationSoonWindowDays(gestationDays: number): number {
  const safeDays = Math.max(1, gestationDays || 30);
  return Math.max(3, Math.min(7, Math.ceil(safeDays * 0.15)));
}

/**
 * Formats human-readable arrival timing for a nearly-complete gestation.
 */
export function formatArrivalTimingLabel(daysUntilDue: number): string {
  if (daysUntilDue === 0) return 'Due today';
  if (daysUntilDue === 1) return 'Due tomorrow';
  if (daysUntilDue > 1) return `Due in ${daysUntilDue} days`;
  const overdue = Math.abs(daysUntilDue);
  return `${overdue} day${overdue === 1 ? '' : 's'} past due date`;
}

const ACTIVE_PREBIRTH_STATUSES = new Set(['Planned', 'Bred', 'Palpated Positive']);

/**
 * Evaluates active breedings where gestation is nearly complete (babies about to arrive)
 * for a single livestock species.
 */
export function evaluateSpeciesArrivingBabiesAlert(
  breedings: BreedingRecord[],
  speciesProfile: SpeciesProfile,
  options?: {
    todayIso?: string;
    maxPastDueDays?: number;
  }
): ArrivingBabiesAlertEvaluation {
  const todayIso = options?.todayIso || todayDateIso();
  const maxPastDueDays = options?.maxPastDueDays ?? 7;
  const windowDays = getGestationSoonWindowDays(speciesProfile.gestationDays);

  const items: ArrivingBabiesItem[] = [];

  for (const b of breedings) {
    if (!isSameSpecies(b.species, speciesProfile.name)) continue;
    if (!ACTIVE_PREBIRTH_STATUSES.has(b.status)) continue;
    if (!b.expectedDueDateIso) continue;

    const daysUntilDue = diffCalendarDaysIso(todayIso, b.expectedDueDateIso);
    if (Number.isNaN(daysUntilDue)) continue;

    if (daysUntilDue <= windowDays && daysUntilDue >= -maxPastDueDays) {
      items.push({
        breeding: b,
        daysUntilDue,
        timingLabel: formatArrivalTimingLabel(daysUntilDue),
      });
    }
  }

  items.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  return {
    items,
    windowDays,
    offspringPluralLabel: pluralizeSpeciesLabel(speciesProfile.offspringLabel || 'Baby'),
    shouldShow: items.length > 0,
  };
}

export interface NeedsAttentionAlertEvaluation {
  animals: Animal[];
  shouldShow: boolean;
}

/**
 * Evaluates animals flagged with `needsAttention` (e.g. quick-added outside parents)
 * for a single livestock species.
 */
export function evaluateSpeciesNeedsAttentionAlert(
  animals: Animal[],
  speciesName: string
): NeedsAttentionAlertEvaluation {
  const flagged = animals
    .filter((a) => isSameSpecies(a.species, speciesName) && doesAnimalNeedAttention(a))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return {
    animals: flagged,
    shouldShow: flagged.length > 0,
  };
}
