/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Pedigree Linebred Convergence & ARBA Registration Readiness Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) dependencies so the exact
 * same convergence spotlight and ARBA registration checks run offline on Web PWA and native mobile.
 */

import { Animal } from './models';
import { PedigreeSlot } from './pedigreeCalculator';

export type RegistrationDeficiencyCode =
  | 'missing_tattoo'
  | 'missing_breed'
  | 'missing_variety'
  | 'missing_weight'
  | 'missing_dob'
  | 'unknown_sex'
  | 'incomplete_3gen_lineage'
  | 'breed_mismatch'
  | 'missing_ancestor_slot';

export interface RegistrationDeficiency {
  code: RegistrationDeficiencyCode;
  label: string;
  shortLabel: string;
}

export interface PedigreeNodeRegistrationStatus {
  slotKey: string;
  generation: number;
  isApplicable: boolean;
  isBlocking: boolean;
  deficiencies: RegistrationDeficiency[];
  summaryText: string;
}

export interface PedigreeTreeAnalysis {
  isArbaSpecies: boolean;
  convergentAnimalIds: Set<string>;
  convergentSlotKeys: Set<string>;
  hasConvergentAncestors: boolean;
  registrationBySlotKey: Map<string, PedigreeNodeRegistrationStatus>;
  blockingNodeCount: number;
  blockingAnimalNodeCount: number;
  missingAncestorSlotCount: number;
  subjectRegistration: PedigreeNodeRegistrationStatus | null;
  subjectKnown3Gen: number;
}

/**
 * Returns `true` when the active species falls under ARBA (American Rabbit Breeders Association)
 * pedigree registration standards (Rabbits and Cavies / Guinea Pigs).
 */
export function isArbaRegistrationSpecies(speciesName?: string): boolean {
  const clean = (speciesName || '').trim().toLowerCase();
  return (
    clean === 'rabbit' ||
    clean === 'rabbits' ||
    clean === 'guinea pig' ||
    clean === 'guinea pigs' ||
    clean === 'cavy' ||
    clean === 'cavies'
  );
}

/**
 * Evaluates objective ARBA registration field readiness for a single animal node within a
 * 3-generation pedigree (without inventing breed-specific weight cutoffs or unverified SOP rules).
 */
export function evaluateAnimalArbaRegistration(
  animal: Animal,
  options: {
    isSubject: boolean;
    subjectBreed?: string;
    knownAncestorsIn3Gen?: number;
    speciesName?: string;
  }
): Omit<PedigreeNodeRegistrationStatus, 'slotKey' | 'generation'> {
  const effectiveSpecies = options.speciesName || animal.species;
  if (!isArbaRegistrationSpecies(effectiveSpecies)) {
    return {
      isApplicable: false,
      isBlocking: false,
      deficiencies: [],
      summaryText: '',
    };
  }

  const isRabbit = (effectiveSpecies || '').trim().toLowerCase().startsWith('rabbit');
  const deficiencies: RegistrationDeficiency[] = [];

  if (!(animal.tattoo || '').trim()) {
    deficiencies.push({
      code: 'missing_tattoo',
      label: isRabbit ? 'Missing ear tattoo' : 'Missing ear tag / ID',
      shortLabel: isRabbit ? 'Tattoo' : 'Ear ID',
    });
  }

  if (!(animal.breed || '').trim()) {
    deficiencies.push({
      code: 'missing_breed',
      label: 'Missing breed',
      shortLabel: 'Breed',
    });
  }

  if (!(animal.variety || '').trim()) {
    deficiencies.push({
      code: 'missing_variety',
      label: 'Missing variety / color',
      shortLabel: 'Variety',
    });
  }

  if (!Number.isFinite(animal.weightGrams) || animal.weightGrams <= 0) {
    deficiencies.push({
      code: 'missing_weight',
      label: 'Missing weight',
      shortLabel: 'Weight',
    });
  }

  if (options.isSubject) {
    if (!(animal.birthDateIso || '').trim()) {
      deficiencies.push({
        code: 'missing_dob',
        label: 'Missing date of birth',
        shortLabel: 'DOB',
      });
    }
    if (animal.sex === 'Unknown') {
      deficiencies.push({
        code: 'unknown_sex',
        label: 'Unknown sex',
        shortLabel: 'Sex',
      });
    }
    if (
      typeof options.knownAncestorsIn3Gen === 'number' &&
      options.knownAncestorsIn3Gen < 14
    ) {
      const known = Math.max(0, Math.min(14, Math.round(options.knownAncestorsIn3Gen)));
      deficiencies.push({
        code: 'incomplete_3gen_lineage',
        label: `Incomplete 3-gen lineage (${known}/14 ancestors)`,
        shortLabel: `3-Gen ${known}/14`,
      });
    }
  } else if (options.subjectBreed && animal.breed) {
    const subjNorm = options.subjectBreed.trim().toLowerCase();
    const ancNorm = animal.breed.trim().toLowerCase();
    if (subjNorm && ancNorm && subjNorm !== ancNorm) {
      deficiencies.push({
        code: 'breed_mismatch',
        label: `Breed mismatch (${animal.breed.trim()} vs ${options.subjectBreed.trim()})`,
        shortLabel: 'Breed Mismatch',
      });
    }
  }

  const summaryText =
    deficiencies.length > 0
      ? `ARBA registration blocked: ${deficiencies.map((d) => d.label).join(', ')}`
      : '';

  return {
    isApplicable: true,
    isBlocking: deficiencies.length > 0,
    deficiencies,
    summaryText,
  };
}

/**
 * Analyzes an entire pedigree slot array for:
 * 1. Linebred convergence (ancestors appearing > 1x in generations >= 1) so unique ancestors can be dimmed.
 * 2. ARBA 3-generation registration readiness flags (Generations 0..3 only; Gen 4–6 excluded).
 */
export function analyzePedigreeTree(
  subject: Animal,
  slots: PedigreeSlot[],
  speciesName?: string
): PedigreeTreeAnalysis {
  const effectiveSpecies = speciesName || subject.species;
  const isArbaSpecies = isArbaRegistrationSpecies(effectiveSpecies);

  const convergentAnimalIds = new Set<string>();
  const convergentSlotKeys = new Set<string>();

  let subjectKnown3Gen = 0;

  for (const slot of slots) {
    const key = `${slot.generation}:${slot.slotIndex}`;
    if (slot.generation >= 1 && slot.generation <= 3 && slot.animal) {
      subjectKnown3Gen += 1;
    }
    if (slot.generation >= 1 && slot.animal && slot.occurrenceCount > 1) {
      convergentAnimalIds.add(slot.animal.id);
      convergentSlotKeys.add(key);
    }
  }

  const registrationBySlotKey = new Map<string, PedigreeNodeRegistrationStatus>();
  let blockingNodeCount = 0;
  let blockingAnimalNodeCount = 0;
  let missingAncestorSlotCount = 0;
  let subjectRegistration: PedigreeNodeRegistrationStatus | null = null;

  for (const slot of slots) {
    const slotKey = `${slot.generation}:${slot.slotIndex}`;

    if (!isArbaSpecies || slot.generation > 3) {
      registrationBySlotKey.set(slotKey, {
        slotKey,
        generation: slot.generation,
        isApplicable: false,
        isBlocking: false,
        deficiencies: [],
        summaryText: '',
      });
      continue;
    }

    if (slot.animal) {
      const evaluated = evaluateAnimalArbaRegistration(slot.animal, {
        isSubject: slot.generation === 0,
        subjectBreed: subject.breed,
        knownAncestorsIn3Gen: slot.generation === 0 ? subjectKnown3Gen : undefined,
        speciesName: effectiveSpecies,
      });
      const status: PedigreeNodeRegistrationStatus = {
        slotKey,
        generation: slot.generation,
        ...evaluated,
      };
      registrationBySlotKey.set(slotKey, status);
      if (slot.generation === 0) {
        subjectRegistration = status;
      }
      if (status.isBlocking) {
        blockingNodeCount += 1;
        blockingAnimalNodeCount += 1;
      }
    } else {
      const deficiency: RegistrationDeficiency = {
        code: 'missing_ancestor_slot',
        label: `Missing ${slot.roleLabel} (blocks 3-gen ARBA pedigree)`,
        shortLabel: 'Missing Ancestor',
      };
      const status: PedigreeNodeRegistrationStatus = {
        slotKey,
        generation: slot.generation,
        isApplicable: true,
        isBlocking: true,
        deficiencies: [deficiency],
        summaryText: deficiency.label,
      };
      registrationBySlotKey.set(slotKey, status);
      blockingNodeCount += 1;
      missingAncestorSlotCount += 1;
    }
  }

  return {
    isArbaSpecies,
    convergentAnimalIds,
    convergentSlotKeys,
    hasConvergentAncestors: convergentAnimalIds.size > 0,
    registrationBySlotKey,
    blockingNodeCount,
    blockingAnimalNodeCount,
    missingAncestorSlotCount,
    subjectRegistration,
    subjectKnown3Gen,
  };
}
