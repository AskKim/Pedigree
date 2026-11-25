/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Barn Alerts Engine (`src/domain/barnAlerts.ts`).
 *
 * Evaluates per-species:
 * 1. Due / overdue tasks alert (filtering permanently ignored task IDs and
 *    group-cleared alert signatures so clearing an alert hides the current
 *    task group without ignoring the tasks themselves).
 * 2. Babies about to arrive alert (gestation nearly complete).
 */

import {
  addDaysIso,
  Animal,
  BarnTask,
  BreedingRecord,
  CageLocation,
  CareLog,
  doesAnimalNeedAttention,
  formatReadableDate,
  isAnimalArchived,
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

export interface SpeciesMemoAlertEvaluation {
  hasMemo: boolean;
  signature: string;
  previewText: string;
  shouldShow: boolean;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function extractMemoPreviewLine(memoText: string): string {
  const lines = memoText.split(/\r?\n/);
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const cleaned = trimmed
      .replace(/^#{1,3}\s+/, '')
      .replace(/^[-*]\s+\[[ xX]\]\s+/, '')
      .replace(/^[-*]\s+/, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .trim();
    if (cleaned) return cleaned;
  }
  return 'You have saved notes in this memo pad.';
}

/**
 * Builds a deterministic signature for a species memo pad's contents and update timestamp.
 * Any edit to the memo text or its updated timestamp alters this signature so a closed
 * reminder automatically reappears when the user edits the memo pad.
 */
export function buildSpeciesMemoSignature(
  memoText?: string,
  memoUpdatedAt?: string
): string {
  const raw = typeof memoText === 'string' ? memoText : '';
  if (raw.trim().length === 0) return '';
  const stamp = typeof memoUpdatedAt === 'string' ? memoUpdatedAt.trim() : '';
  const contentSig = `${raw.length}:${fnv1aHex(raw)}`;
  return stamp ? `${stamp}|${contentSig}` : contentSig;
}

/**
 * Evaluates whether a subtle memo pad reminder notice should appear on a species home card.
 */
export function evaluateSpeciesMemoReminderAlert(
  speciesProfile: Pick<SpeciesProfile, 'memoText' | 'memoUpdatedAt'>,
  options?: {
    dismissedSignature?: string;
  }
): SpeciesMemoAlertEvaluation {
  const raw = typeof speciesProfile.memoText === 'string' ? speciesProfile.memoText : '';
  const hasMemo = raw.trim().length > 0;
  if (!hasMemo) {
    return {
      hasMemo: false,
      signature: '',
      previewText: '',
      shouldShow: false,
    };
  }

  const signature = buildSpeciesMemoSignature(raw, speciesProfile.memoUpdatedAt);
  const isDismissed =
    Boolean(options?.dismissedSignature) && options?.dismissedSignature === signature;

  return {
    hasMemo: true,
    signature,
    previewText: extractMemoPreviewLine(raw),
    shouldShow: !isDismissed,
  };
}

// ============================================================================
// Active Medication Withdrawal Countdowns & Livestock Safety Alerts
// ============================================================================

const ISO_CALENDAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ActiveWithdrawalLogItem {
  log: CareLog;
  medicationLabel: string;
  clearDateIso: string;
  daysRemaining: number;
}

export interface AnimalWithdrawalEvaluation {
  animalId: string;
  isActive: boolean;
  clearDateIso: string;
  daysRemaining: number;
  countdownLabel: string;
  shortCountdownLabel: string;
  activeLogs: ActiveWithdrawalLogItem[];
  medicationSummary: string;
}

export interface SpeciesWithdrawalAnimalItem {
  animal: Animal;
  evaluation: AnimalWithdrawalEvaluation;
}

export interface SpeciesWithdrawalAlertEvaluation {
  items: SpeciesWithdrawalAnimalItem[];
  shouldShow: boolean;
}

export interface WithdrawalDispositionWarning {
  animalName: string;
  clearDateIso: string;
  daysRemaining: number;
  medicationSummary: string;
  reasons: Array<'Sold' | 'Flagged for Cull'>;
  headline: string;
  detail: string;
}

export interface ShowWithdrawalConflictItem {
  animal: Animal;
  evaluation: AnimalWithdrawalEvaluation;
}

export interface ShowWithdrawalConflictEvaluation {
  showDateIso: string;
  conflicts: ShowWithdrawalConflictItem[];
  hasConflict: boolean;
}

/**
 * Resolves the effective withdrawal clear date (`YYYY-MM-DD`) for a care log.
 * Uses explicit `withdrawalClearDateIso` first, falling back to `dateIso + withdrawalDays`.
 */
export function resolveCareLogWithdrawalClearDateIso(
  log: Pick<CareLog, 'dateIso' | 'withdrawalDays' | 'withdrawalClearDateIso'>
): string {
  const explicit =
    typeof log.withdrawalClearDateIso === 'string' ? log.withdrawalClearDateIso.trim() : '';
  if (ISO_CALENDAR_DATE_RE.test(explicit)) {
    return explicit;
  }
  const wDays = Number(log.withdrawalDays) || 0;
  const dateIso = typeof log.dateIso === 'string' ? log.dateIso.trim() : '';
  if (wDays > 0 && ISO_CALENDAR_DATE_RE.test(dateIso)) {
    return addDaysIso(dateIso, Math.round(wDays));
  }
  return '';
}

function buildMedicationLabel(log: CareLog): string {
  const med = typeof log.medicationName === 'string' ? log.medicationName.trim() : '';
  if (med) return med;
  const title = typeof log.title === 'string' ? log.title.trim() : '';
  if (title && title !== 'Health / Vet') return title;
  return 'Medication';
}

function finalizeAnimalWithdrawalEvaluation(
  animalId: string,
  activeLogs: ActiveWithdrawalLogItem[]
): AnimalWithdrawalEvaluation {
  if (activeLogs.length === 0) {
    return {
      animalId,
      isActive: false,
      clearDateIso: '',
      daysRemaining: 0,
      countdownLabel: '',
      shortCountdownLabel: '',
      activeLogs: [],
      medicationSummary: '',
    };
  }

  const sorted = [...activeLogs].sort(
    (a, b) =>
      b.clearDateIso.localeCompare(a.clearDateIso) ||
      (b.log.dateIso || '').localeCompare(a.log.dateIso || '')
  );
  const longest = sorted[0];
  const days = longest.daysRemaining;

  const seenMeds = new Set<string>();
  const medNames: string[] = [];
  for (const item of sorted) {
    const key = item.medicationLabel.toLowerCase();
    if (!seenMeds.has(key)) {
      seenMeds.add(key);
      medNames.push(item.medicationLabel);
    }
  }

  return {
    animalId,
    isActive: true,
    clearDateIso: longest.clearDateIso,
    daysRemaining: days,
    countdownLabel: `${days} day${days === 1 ? '' : 's'} remaining`,
    shortCountdownLabel: `${days}d left`,
    activeLogs: sorted,
    medicationSummary: medNames.join(', '),
  };
}

/**
 * Builds an O(L) lookup map of animals currently under an active medication withdrawal
 * relative to `options.todayIso` (defaulting to local today).
 *
 * Clear-date boundary rule: animals are considered **cleared on `withdrawalClearDateIso` itself**
 * (`daysRemaining = diffCalendarDaysIso(todayIso, clearDateIso) > 0` means still in withdrawal).
 */
export function buildWithdrawalByAnimalMap(
  careLogs: readonly CareLog[],
  options?: {
    todayIso?: string;
  }
): Map<string, AnimalWithdrawalEvaluation> {
  const referenceIso = options?.todayIso || todayDateIso();
  const grouped = new Map<string, ActiveWithdrawalLogItem[]>();

  for (const log of careLogs) {
    if (!log.animalId) continue;
    const clearDateIso = resolveCareLogWithdrawalClearDateIso(log);
    if (!clearDateIso) continue;

    const daysRemaining = diffCalendarDaysIso(referenceIso, clearDateIso);
    if (!Number.isFinite(daysRemaining) || daysRemaining <= 0) continue;

    let bucket = grouped.get(log.animalId);
    if (!bucket) {
      bucket = [];
      grouped.set(log.animalId, bucket);
    }
    bucket.push({
      log,
      medicationLabel: buildMedicationLabel(log),
      clearDateIso,
      daysRemaining,
    });
  }

  const result = new Map<string, AnimalWithdrawalEvaluation>();
  for (const [animalId, items] of grouped.entries()) {
    result.set(animalId, finalizeAnimalWithdrawalEvaluation(animalId, items));
  }
  return result;
}

/**
 * Evaluates active medication withdrawal status for a single animal.
 */
export function evaluateAnimalActiveWithdrawal(
  careLogs: readonly CareLog[],
  animalId: string,
  options?: {
    todayIso?: string;
  }
): AnimalWithdrawalEvaluation {
  if (!animalId) {
    return finalizeAnimalWithdrawalEvaluation('', []);
  }
  const referenceIso = options?.todayIso || todayDateIso();
  const activeItems: ActiveWithdrawalLogItem[] = [];

  for (const log of careLogs) {
    if (log.animalId !== animalId) continue;
    const clearDateIso = resolveCareLogWithdrawalClearDateIso(log);
    if (!clearDateIso) continue;
    const daysRemaining = diffCalendarDaysIso(referenceIso, clearDateIso);
    if (!Number.isFinite(daysRemaining) || daysRemaining <= 0) continue;
    activeItems.push({
      log,
      medicationLabel: buildMedicationLabel(log),
      clearDateIso,
      daysRemaining,
    });
  }

  return finalizeAnimalWithdrawalEvaluation(animalId, activeItems);
}

/**
 * Evaluates active medication withdrawal safety alerts for a species card on the Home screen.
 * Excludes Deceased, Sold, and Archived stock from Home barn alerts (Active, Junior, Retired,
 * and Flagged-for-Cull animals remain surfaced), and respects session-dismissed species keys.
 */
export function evaluateSpeciesActiveWithdrawalsAlert(
  animals: readonly Animal[],
  careLogs: readonly CareLog[],
  speciesName: string,
  options?: {
    todayIso?: string;
    withdrawalByAnimalId?: ReadonlyMap<string, AnimalWithdrawalEvaluation>;
    dismissedSpeciesKeys?: ReadonlySet<string>;
  }
): SpeciesWithdrawalAlertEvaluation {
  const byAnimal =
    options?.withdrawalByAnimalId ??
    buildWithdrawalByAnimalMap(careLogs, { todayIso: options?.todayIso });

  const items: SpeciesWithdrawalAnimalItem[] = [];
  for (const animal of animals) {
    if (!isSameSpecies(animal.species, speciesName)) continue;
    if (animal.status === 'Deceased' || animal.status === 'Sold' || isAnimalArchived(animal)) {
      continue;
    }
    const evaluation = byAnimal.get(animal.id);
    if (evaluation?.isActive) {
      items.push({ animal, evaluation });
    }
  }

  items.sort(
    (a, b) =>
      a.evaluation.daysRemaining - b.evaluation.daysRemaining ||
      (a.animal.name || '').localeCompare(b.animal.name || '')
  );

  const speciesKey = speciesName.trim().toLowerCase();
  const isDismissed = Boolean(options?.dismissedSpeciesKeys?.has(speciesKey));

  return {
    items,
    shouldShow: items.length > 0 && !isDismissed,
  };
}

/**
 * Evaluates whether saving an animal as `Sold` or `Flagged for Cull` triggers a soft
 * medication withdrawal confirmation warning. (Does not trigger for `Deceased` status.)
 */
export function evaluateWithdrawalDispositionWarning(
  evaluation: AnimalWithdrawalEvaluation | null | undefined,
  params: {
    animalName: string;
    isNewlySold: boolean;
    isNewlyCulled: boolean;
  }
): WithdrawalDispositionWarning | null {
  if (!evaluation?.isActive) return null;
  if (!params.isNewlySold && !params.isNewlyCulled) return null;

  const reasons: Array<'Sold' | 'Flagged for Cull'> = [];
  if (params.isNewlySold) reasons.push('Sold');
  if (params.isNewlyCulled) reasons.push('Flagged for Cull');

  const safeName = params.animalName.trim() || 'This animal';
  const clearReadable = formatReadableDate(evaluation.clearDateIso);
  const headline =
    reasons.length === 2
      ? `Active Withdrawal Hold — Confirm Sale & Cull`
      : reasons[0] === 'Sold'
      ? `Active Withdrawal Hold — Confirm Sale`
      : `Active Withdrawal Hold — Confirm Cull / Processing`;

  const actionPhrase =
    reasons.length === 2
      ? 'marking it Sold and Flagged for Cull'
      : reasons[0] === 'Sold'
      ? 'marking it Sold'
      : 'flagging it for Cull / processing';

  const detail = `${safeName} is still under medication withdrawal (${evaluation.medicationSummary}) until ${clearReadable} (${evaluation.countdownLabel}). Please verify food/sale disclosures before ${actionPhrase}.`;

  return {
    animalName: safeName,
    clearDateIso: evaluation.clearDateIso,
    daysRemaining: evaluation.daysRemaining,
    medicationSummary: evaluation.medicationSummary,
    reasons,
    headline,
    detail,
  };
}

/**
 * Checks whether any animal selected for a ShowEvent has an active medication withdrawal
 * overlapping the show's `eventDateIso` (cleared on `withdrawalClearDateIso` itself).
 */
export function evaluateShowWithdrawalConflicts(
  animals: readonly Animal[],
  selectedAnimalIds: readonly string[],
  careLogs: readonly CareLog[],
  showDateIso: string,
  options?: {
    withdrawalByAnimalIdOnShowDate?: ReadonlyMap<string, AnimalWithdrawalEvaluation>;
  }
): ShowWithdrawalConflictEvaluation {
  const cleanDate = typeof showDateIso === 'string' ? showDateIso.trim() : '';
  if (!ISO_CALENDAR_DATE_RE.test(cleanDate) || selectedAnimalIds.length === 0) {
    return { showDateIso: cleanDate, conflicts: [], hasConflict: false };
  }

  const byAnimal =
    options?.withdrawalByAnimalIdOnShowDate ??
    buildWithdrawalByAnimalMap(careLogs, { todayIso: cleanDate });

  const selectedSet = new Set(selectedAnimalIds);
  const conflicts: ShowWithdrawalConflictItem[] = [];

  for (const animal of animals) {
    if (!selectedSet.has(animal.id)) continue;
    const evaluation = byAnimal.get(animal.id);
    if (evaluation?.isActive) {
      conflicts.push({ animal, evaluation });
    }
  }

  conflicts.sort(
    (a, b) =>
      b.evaluation.daysRemaining - a.evaluation.daysRemaining ||
      (a.animal.name || '').localeCompare(b.animal.name || '')
  );

  return {
    showDateIso: cleanDate,
    conflicts,
    hasConflict: conflicts.length > 0,
  };
}

// ============================================================================
// Cage / Pen Occupancy & Welfare Capacity Alerts
// ============================================================================

export type CageOccupancyStatus = 'empty' | 'available' | 'full' | 'over_capacity';

export interface CageOccupancyEvaluation {
  cage: CageLocation;
  capacity: number;
  occupants: Animal[];
  occupantCount: number;
  status: CageOccupancyStatus;
  isOverCapacity: boolean;
  isAtCapacity: boolean;
  overBy: number;
  availableSpots: number;
  ratioLabel: string;
}

export interface SpeciesCagesOccupancySummary {
  evaluations: CageOccupancyEvaluation[];
  overCapacityCages: CageOccupancyEvaluation[];
  totalOverCapacityCount: number;
  overCapacityExtraAnimalsCount: number;
  byCageId: Map<string, CageOccupancyEvaluation>;
  byLabelKey: Map<string, CageOccupancyEvaluation>;
  shouldShowOverCapacityAlert: boolean;
}

export interface CageAssignmentCapacityWarning {
  cage: CageLocation;
  capacity: number;
  currentOccupantCount: number;
  projectedOccupantCount: number;
  overBy: number;
  wouldExceed: boolean;
  alreadyInTargetCage: boolean;
  alreadyOverCapacity: boolean;
  headline: string;
  detail: string;
}

/**
 * Normalizes a cage/pen label for case-insensitive trimmed matching.
 */
export function normalizeCageLabelKey(label?: string | null): string {
  return typeof label === 'string' ? label.trim().toLowerCase() : '';
}

/**
 * Returns true when an animal currently occupies physical housing space
 * (Active, Junior, or unarchived/non-offloaded Retired stock; excludes Sold, Deceased, Archived, and OPFS stubs).
 */
export function isCageOccupyingAnimal(
  animal: Partial<Pick<Animal, 'status' | 'archived' | 'offloadedArchiveKey'>> | null | undefined
): boolean {
  if (!animal) return false;
  if (animal.archived || animal.offloadedArchiveKey) return false;
  return animal.status === 'Active' || animal.status === 'Junior' || animal.status === 'Retired';
}

function buildCageOccupancyEvaluation(
  cage: CageLocation,
  occupants: Animal[]
): CageOccupancyEvaluation {
  const capacity = Math.max(1, Math.round(Number(cage.capacity) || 1));
  const sortedOccupants = [...occupants].sort(
    (a, b) =>
      (a.name || '').localeCompare(b.name || '') ||
      (a.tattoo || '').localeCompare(b.tattoo || '')
  );
  const occupantCount = sortedOccupants.length;
  const isOverCapacity = occupantCount > capacity;
  const isAtCapacity = occupantCount === capacity;
  const overBy = Math.max(0, occupantCount - capacity);
  const availableSpots = Math.max(0, capacity - occupantCount);
  const status: CageOccupancyStatus = isOverCapacity
    ? 'over_capacity'
    : isAtCapacity
      ? 'full'
      : occupantCount === 0
        ? 'empty'
        : 'available';
  const ratioLabel = isOverCapacity
    ? `${occupantCount}/${capacity} over capacity`
    : isAtCapacity
      ? `${occupantCount}/${capacity} full`
      : `${occupantCount}/${capacity}`;

  return {
    cage,
    capacity,
    occupants: sortedOccupants,
    occupantCount,
    status,
    isOverCapacity,
    isAtCapacity,
    overBy,
    availableSpots,
    ratioLabel,
  };
}

/**
 * Evaluates current occupancy vs configured `capacity` for a single `CageLocation`.
 */
export function evaluateCageOccupancy(
  cage: CageLocation,
  animals: readonly Animal[]
): CageOccupancyEvaluation {
  const labelKey = normalizeCageLabelKey(cage.label);
  const occupants = labelKey
    ? animals.filter(
        (a) =>
          isSameSpecies(a.species, cage.species) &&
          isCageOccupyingAnimal(a) &&
          normalizeCageLabelKey(a.cageLocation) === labelKey
      )
    : [];
  return buildCageOccupancyEvaluation(cage, occupants);
}

/**
 * Evaluates occupancy and capacity compliance across all `CageLocation` records for one species in O(C + A).
 */
export function evaluateSpeciesCagesOccupancy(
  cages: readonly CageLocation[],
  animals: readonly Animal[],
  speciesName: string
): SpeciesCagesOccupancySummary {
  const occupantsByLabelKey = new Map<string, Animal[]>();
  for (const animal of animals) {
    if (!isSameSpecies(animal.species, speciesName)) continue;
    if (!isCageOccupyingAnimal(animal)) continue;
    const key = normalizeCageLabelKey(animal.cageLocation);
    if (!key) continue;
    let bucket = occupantsByLabelKey.get(key);
    if (!bucket) {
      bucket = [];
      occupantsByLabelKey.set(key, bucket);
    }
    bucket.push(animal);
  }

  const evaluations: CageOccupancyEvaluation[] = [];
  const overCapacityCages: CageOccupancyEvaluation[] = [];
  const byCageId = new Map<string, CageOccupancyEvaluation>();
  const byLabelKey = new Map<string, CageOccupancyEvaluation>();
  let overCapacityExtraAnimalsCount = 0;

  for (const cage of cages) {
    if (!isSameSpecies(cage.species, speciesName)) continue;
    const key = normalizeCageLabelKey(cage.label);
    const occupants = key ? occupantsByLabelKey.get(key) ?? [] : [];
    const evalItem = buildCageOccupancyEvaluation(cage, occupants);
    evaluations.push(evalItem);
    byCageId.set(cage.id, evalItem);
    if (key && !byLabelKey.has(key)) {
      byLabelKey.set(key, evalItem);
    }
    if (evalItem.isOverCapacity) {
      overCapacityCages.push(evalItem);
      overCapacityExtraAnimalsCount += evalItem.overBy;
    }
  }

  return {
    evaluations,
    overCapacityCages,
    totalOverCapacityCount: overCapacityCages.length,
    overCapacityExtraAnimalsCount,
    byCageId,
    byLabelKey,
    shouldShowOverCapacityAlert: overCapacityCages.length > 0,
  };
}

/**
 * Evaluates whether assigning, moving, or reactivating an animal into `targetCageLabel`
 * will exceed the matching `CageLocation.capacity`.
 */
export function evaluateCageAssignmentCapacityWarning(params: {
  targetCageLabel: string;
  cages: readonly CageLocation[];
  animals: readonly Animal[];
  speciesName: string;
  animalId?: string;
  animalName?: string;
  wasAlreadyOccupyingTargetCage?: boolean;
  willOccupyAfterSave?: boolean;
}): CageAssignmentCapacityWarning | null {
  if (params.willOccupyAfterSave === false) return null;

  const targetKey = normalizeCageLabelKey(params.targetCageLabel);
  if (!targetKey) return null;

  const matchedCage = params.cages.find(
    (c) =>
      isSameSpecies(c.species, params.speciesName) &&
      normalizeCageLabelKey(c.label) === targetKey
  );
  if (!matchedCage) return null;

  const evaluation = evaluateCageOccupancy(matchedCage, params.animals);
  const otherOccupants = params.animalId
    ? evaluation.occupants.filter((o) => o.id !== params.animalId)
    : evaluation.occupants;

  const alreadyInTargetCage =
    params.wasAlreadyOccupyingTargetCage ??
    Boolean(params.animalId && evaluation.occupants.some((o) => o.id === params.animalId));

  const projectedOccupantCount = otherOccupants.length + 1;
  const overBy = Math.max(0, projectedOccupantCount - evaluation.capacity);
  if (overBy <= 0) return null;

  const wouldExceed = !alreadyInTargetCage;
  const safeName = (params.animalName || '').trim() || 'This animal';

  const headline = wouldExceed
    ? `Cage Capacity Warning — ${matchedCage.label} (${projectedOccupantCount}/${evaluation.capacity} over capacity)`
    : `${matchedCage.label} Over Capacity (${evaluation.ratioLabel})`;

  const detail = wouldExceed
    ? `Assigning ${safeName} to ${matchedCage.label} puts ${matchedCage.label} over its configured capacity of ${evaluation.capacity} (${projectedOccupantCount}/${evaluation.capacity}).`
    : `${matchedCage.label} currently holds ${evaluation.occupantCount} animals against a capacity of ${evaluation.capacity}.`;

  return {
    cage: matchedCage,
    capacity: evaluation.capacity,
    currentOccupantCount: evaluation.occupantCount,
    projectedOccupantCount,
    overBy,
    wouldExceed,
    alreadyInTargetCage,
    alreadyOverCapacity: evaluation.isOverCapacity,
    headline,
    detail,
  };
}



