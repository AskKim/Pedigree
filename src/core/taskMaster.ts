/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Automated Chore Cascading Engine (Master Task List).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM dependencies.
 *
 * Logging a single breeding event automatically calculates and generates downstream
 * barn chores (e.g., Day 14 Palpation, Day 28 Nestbox placement, Day 31 Kindling window,
 * Day 42 Weaning, and Rebreed readiness) using the user-configurable offsets on `SpeciesProfile`.
 */

import {
  addDaysIso,
  Animal,
  BarnTask,
  BreedScheduleOverride,
  BreedingRecord,
  generateUuid,
  MilestoneRelativeTo,
  normalizeBreedScheduleOverrides,
  nowIsoUtc,
  SpeciesMilestoneTemplate,
  SpeciesProfile,
} from './models';

export interface ResolvedBreedSchedule {
  profile: SpeciesProfile;
  matchedBreed?: string;
  matchedOverride?: BreedScheduleOverride;
}

/**
 * Overlays optional per-breed biological & milestone offset overrides onto a `SpeciesProfile`
 * without mutating the source species configuration. Matches breed names case-insensitively.
 */
export function resolveEffectiveSpeciesProfileForBreed(
  speciesProfile: SpeciesProfile,
  breedName?: string
): ResolvedBreedSchedule {
  const cleanBreed = (breedName || '').trim();
  const overrides = normalizeBreedScheduleOverrides(speciesProfile.breedOverrides);
  if (!cleanBreed || overrides.length === 0) {
    return { profile: speciesProfile };
  }

  const targetKey = cleanBreed.toLowerCase();
  const matched = overrides.find((ov) => ov.breed.trim().toLowerCase() === targetKey);
  if (!matched) {
    return { profile: speciesProfile };
  }

  const milestoneOffsetMap = new Map<string, number>();
  for (const mo of matched.milestoneOverrides ?? []) {
    const labelKey = mo.label.trim().toLowerCase();
    if (labelKey) {
      milestoneOffsetMap.set(labelKey, mo.daysOffset);
    }
  }

  const nextMilestones = speciesProfile.milestones.map((rule) => {
    const overrideOffset = milestoneOffsetMap.get(rule.label.trim().toLowerCase());
    if (overrideOffset === undefined) return rule;
    return {
      ...rule,
      daysOffset: overrideOffset,
    };
  });

  const effectiveProfile: SpeciesProfile = {
    ...speciesProfile,
    gestationDays:
      matched.gestationDays && matched.gestationDays > 0
        ? matched.gestationDays
        : speciesProfile.gestationDays,
    weanDaysAfterBirth:
      matched.weanDaysAfterBirth && matched.weanDaysAfterBirth > 0
        ? matched.weanDaysAfterBirth
        : speciesProfile.weanDaysAfterBirth,
    rebreedDaysAfterBirth:
      matched.rebreedDaysAfterBirth !== undefined && matched.rebreedDaysAfterBirth >= 0
        ? matched.rebreedDaysAfterBirth
        : speciesProfile.rebreedDaysAfterBirth,
    maturityDays:
      matched.maturityDays && matched.maturityDays > 0
        ? matched.maturityDays
        : speciesProfile.maturityDays,
    milestones: nextMilestones,
  };

  return {
    profile: effectiveProfile,
    matchedBreed: matched.breed,
    matchedOverride: matched,
  };
}

/**
 * Resolves the effective schedule for a breeding pairing, checking the Dam's breed first
 * (since gestation, birth prep, and weaning center on the dam), then falling back to Sire's breed.
 */
export function resolveEffectiveSpeciesProfileForBreeding(
  speciesProfile: SpeciesProfile,
  dam?: Pick<Animal, 'breed'> | null,
  sire?: Pick<Animal, 'breed'> | null
): ResolvedBreedSchedule {
  if (dam?.breed) {
    const damResolved = resolveEffectiveSpeciesProfileForBreed(speciesProfile, dam.breed);
    if (damResolved.matchedOverride) return damResolved;
  }
  if (sire?.breed) {
    const sireResolved = resolveEffectiveSpeciesProfileForBreed(speciesProfile, sire.breed);
    if (sireResolved.matchedOverride) return sireResolved;
  }
  return { profile: speciesProfile };
}

/**
 * Computes the ISO `YYYY-MM-DD` due date for a single `SpeciesMilestoneTemplate`
 * given a breeding record's bred, expected due, and actual birth dates.
 */
export function computeMilestoneDueDateIso(
  milestone: SpeciesMilestoneTemplate,
  bredDateIso: string,
  expectedDueDateIso: string,
  actualBirthDateIso: string = ''
): string {
  const effectiveBirthIso = actualBirthDateIso || expectedDueDateIso;
  switch (milestone.relativeTo) {
    case 'AFTER_BRED':
      return bredDateIso ? addDaysIso(bredDateIso, milestone.daysOffset) : '';
    case 'BEFORE_BIRTH':
      return expectedDueDateIso ? addDaysIso(expectedDueDateIso, -milestone.daysOffset) : '';
    case 'AFTER_BIRTH':
      return effectiveBirthIso ? addDaysIso(effectiveBirthIso, milestone.daysOffset) : '';
    default:
      return '';
  }
}

/**
 * Formats a human-readable rule description (e.g. `"3 days before Kindling"` or `"14 days after breeding"`).
 */
export function describeMilestoneOffset(
  relativeTo: MilestoneRelativeTo,
  daysOffset: number,
  birthEventLabel: string
): string {
  if (relativeTo === 'AFTER_BRED') {
    return `Day ${daysOffset} after breeding`;
  }
  if (relativeTo === 'BEFORE_BIRTH') {
    if (daysOffset === 0) return `On expected ${birthEventLabel} date`;
    return `${daysOffset} day${daysOffset === 1 ? '' : 's'} before ${birthEventLabel}`;
  }
  return `${daysOffset} day${daysOffset === 1 ? '' : 's'} after ${birthEventLabel}`;
}

/**
 * Generates the complete set of cascaded `BarnTask` items for a newly logged or updated `BreedingRecord`.
 * Strictly tags every generated task with `breeding.species` so chores never leak across species.
 */
export function generateCascadedTasksForBreeding(
  breeding: BreedingRecord,
  speciesProfile: SpeciesProfile
): BarnTask[] {
  if (!breeding.bredDateIso || breeding.status === 'Missed') {
    return [];
  }

  const ts = nowIsoUtc();
  const tasks: BarnTask[] = [];
  const pairingTitle = `${breeding.damName} (× ${breeding.sireName})`;

  // 1. Species-specific configured milestones (Palpation, Nestbox/Prep, Birth Check, etc.)
  for (const rule of speciesProfile.milestones) {
    const dueIso = computeMilestoneDueDateIso(
      rule,
      breeding.bredDateIso,
      breeding.expectedDueDateIso,
      breeding.actualBirthDateIso
    );
    if (!dueIso) continue;

    tasks.push({
      id: generateUuid(),
      species: breeding.species,
      title: `${rule.label}: ${pairingTitle}`,
      category: rule.category,
      priority: rule.priority,
      dueDateIso: dueIso,
      linkedAnimalId: breeding.damId,
      linkedAnimalName: breeding.damName,
      linkedBreedingId: breeding.id,
      completed: false,
      createdAt: ts,
      updatedAt: ts,
    });
  }

  const birthAnchor = breeding.actualBirthDateIso || breeding.expectedDueDateIso;

  // 2. Target Weaning Chore
  if (birthAnchor && speciesProfile.weanDaysAfterBirth > 0) {
    tasks.push({
      id: generateUuid(),
      species: breeding.species,
      title: `Wean ${speciesProfile.offspringLabel}s: ${pairingTitle}`,
      category: 'Weaning',
      priority: 'Normal',
      dueDateIso: addDaysIso(birthAnchor, speciesProfile.weanDaysAfterBirth),
      linkedAnimalId: breeding.damId,
      linkedAnimalName: breeding.damName,
      linkedBreedingId: breeding.id,
      completed: false,
      createdAt: ts,
      updatedAt: ts,
    });
  }

  // 3. Rebreeding Readiness Evaluation
  if (birthAnchor && speciesProfile.rebreedDaysAfterBirth > 0) {
    tasks.push({
      id: generateUuid(),
      species: breeding.species,
      title: `Rebreed Readiness Check: ${breeding.damName}`,
      category: 'Rebreed',
      priority: 'Low',
      dueDateIso: addDaysIso(birthAnchor, speciesProfile.rebreedDaysAfterBirth),
      linkedAnimalId: breeding.damId,
      linkedAnimalName: breeding.damName,
      linkedBreedingId: breeding.id,
      completed: false,
      createdAt: ts,
      updatedAt: ts,
    });
  }

  return tasks.sort((a, b) => a.dueDateIso.localeCompare(b.dueDateIso));
}

/**
 * Returns the `AFTER_BIRTH` days offset if `task` corresponds to an `AFTER_BIRTH` milestone
 * rule, Weaning chore, or Rebreed readiness check on `effectiveProfile`, otherwise `null`.
 */
export function identifyPostBirthTaskOffset(
  task: Pick<BarnTask, 'title' | 'category'>,
  effectiveProfile: SpeciesProfile
): number | null {
  const cleanTitle = (task.title || '').trim();
  const titleLower = cleanTitle.toLowerCase();

  if (
    task.category === 'Weaning' &&
    effectiveProfile.weanDaysAfterBirth > 0 &&
    (titleLower.startsWith(`wean ${effectiveProfile.offspringLabel.toLowerCase()}s:`) ||
      titleLower.startsWith('wean '))
  ) {
    return effectiveProfile.weanDaysAfterBirth;
  }

  if (
    task.category === 'Rebreed' &&
    effectiveProfile.rebreedDaysAfterBirth > 0 &&
    titleLower.startsWith('rebreed readiness check:')
  ) {
    return effectiveProfile.rebreedDaysAfterBirth;
  }

  for (const rule of effectiveProfile.milestones) {
    if (rule.relativeTo !== 'AFTER_BIRTH') continue;
    const rulePrefix = `${rule.label.trim().toLowerCase()}:`;
    if (task.category === rule.category && titleLower.startsWith(rulePrefix)) {
      return rule.daysOffset;
    }
  }

  return null;
}

export interface StalePostBirthTaskEntry {
  task: BarnTask;
  offsetDays: number;
  expectedDueDateIso: string;
}

/**
 * Identifies uncompleted `AFTER_BIRTH` tasks linked to `breeding.id` whose due dates do not
 * match `actualBirthDateIso + offsetDays`.
 */
export function evaluateStalePostBirthTasksForBreeding(
  tasks: BarnTask[],
  breeding: Pick<BreedingRecord, 'id' | 'actualBirthDateIso' | 'status'>,
  effectiveProfile: SpeciesProfile,
  candidateBirthDateIso?: string
): {
  anchorDateIso: string;
  staleEntries: StalePostBirthTaskEntry[];
} {
  const anchorDateIso = (candidateBirthDateIso ?? breeding.actualBirthDateIso ?? '').trim();
  if (!anchorDateIso || breeding.status === 'Missed') {
    return { anchorDateIso: '', staleEntries: [] };
  }

  const staleEntries: StalePostBirthTaskEntry[] = [];
  for (const task of tasks) {
    if (task.completed || task.linkedBreedingId !== breeding.id) continue;
    const offsetDays = identifyPostBirthTaskOffset(task, effectiveProfile);
    if (offsetDays === null) continue;
    const targetDueDateIso = addDaysIso(anchorDateIso, offsetDays);
    if (!targetDueDateIso) continue;
    if (task.dueDateIso !== targetDueDateIso) {
      staleEntries.push({
        task,
        offsetDays,
        expectedDueDateIso: targetDueDateIso,
      });
    }
  }
  return { anchorDateIso, staleEntries };
}

/**
 * Recalculates due dates for uncompleted `AFTER_BIRTH` tasks linked to `breeding.id`
 * anchored to `breeding.actualBirthDateIso` (or optional override birth date).
 * Leaves completed tasks, `AFTER_BRED`, `BEFORE_BIRTH`, and unrelated chores untouched.
 */
export function recalculatePostBirthTasksForBreeding(
  tasks: BarnTask[],
  breeding: BreedingRecord,
  effectiveProfile: SpeciesProfile,
  timestampIso: string = nowIsoUtc(),
  overrideActualBirthDateIso?: string
): {
  updatedTasks: BarnTask[];
  shiftedCount: number;
} {
  const { staleEntries } = evaluateStalePostBirthTasksForBreeding(
    tasks,
    breeding,
    effectiveProfile,
    overrideActualBirthDateIso
  );
  if (staleEntries.length === 0) {
    return { updatedTasks: [], shiftedCount: 0 };
  }

  const updatedTasks: BarnTask[] = staleEntries.map(({ task, expectedDueDateIso }) => {
    const prevRev =
      typeof task._rev === 'number' && Number.isFinite(task._rev) && task._rev >= 0
        ? Math.floor(task._rev)
        : 0;
    return {
      ...task,
      dueDateIso: expectedDueDateIso,
      _rev: prevRev + 1,
      updatedAt: timestampIso,
    };
  });

  return {
    updatedTasks,
    shiftedCount: updatedTasks.length,
  };
}

/** Returns true when a task is a breeding-linked Palpation checkoff task. */
export function isPalpationTask(task: Pick<BarnTask, 'category' | 'linkedBreedingId'>): boolean {
  return Boolean(task.linkedBreedingId) && task.category === 'Palpation';
}

/** Returns true when a task is a breeding-linked Birth Check checkoff task. */
export function isBirthCheckTask(task: Pick<BarnTask, 'category' | 'linkedBreedingId'>): boolean {
  return Boolean(task.linkedBreedingId) && task.category === 'Birth Check';
}

/**
 * Returns uncompleted downstream nestbox, birth-check, weaning, rebreed, and before/after-birth
 * milestone tasks linked to `breedingId` that should be cleared when a breeding is marked `Missed`/Open.
 * Preserves already completed tasks and any excluded task IDs.
 */
export function getPendingBreedingCleanupTasks(
  tasks: BarnTask[],
  breedingId: string,
  effectiveProfile: SpeciesProfile,
  excludeTaskIds: string[] = []
): BarnTask[] {
  if (!breedingId) return [];
  const excluded = new Set(excludeTaskIds);
  const cleanupMilestonePrefixes = new Set(
    effectiveProfile.milestones
      .filter((m) => m.relativeTo === 'BEFORE_BIRTH' || m.relativeTo === 'AFTER_BIRTH')
      .map((m) => `${m.label.trim().toLowerCase()}:`)
  );

  return tasks.filter((t) => {
    if (t.completed || t.linkedBreedingId !== breedingId || excluded.has(t.id)) {
      return false;
    }
    if (
      t.category === 'Nestbox' ||
      t.category === 'Birth Check' ||
      t.category === 'Weaning' ||
      t.category === 'Rebreed'
    ) {
      return true;
    }
    const lowerTitle = (t.title || '').trim().toLowerCase();
    for (const prefix of cleanupMilestonePrefixes) {
      if (lowerTitle.startsWith(prefix)) return true;
    }
    return false;
  });
}
