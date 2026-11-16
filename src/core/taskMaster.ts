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
  BarnTask,
  BreedingRecord,
  generateUuid,
  MilestoneRelativeTo,
  nowIsoUtc,
  SpeciesMilestoneTemplate,
  SpeciesProfile,
} from './models';

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
