/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure TypeScript Self-Service Database Health Analyzer & Non-Destructive Auto-Repair Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`, `indexedDB`) dependencies.
 * Can run identically on Web PWA, Node.js, or React Native / Expo (`expo-sqlite`).
 *
 * ZERO-DATA-LOSS DESIGN:
 * - Never deletes user animals, photos, breedings, tasks, or care logs.
 * - Restores missing SpeciesProfile entries if imported/legacy records belong to an unconfigured species.
 * - Merges duplicate species profiles cleanly.
 * - Records cleared dangling/cross-species/cyclic parent IDs in `animal.notes` before unlinking
 *   so pedigree charts and Wright's COI math recover without destroying audit history.
 * - Ensures every animal with photos has exactly one `isPrimary` photo.
 */

import {
  Animal,
  AnimalPhoto,
  BarnDatabaseSnapshot,
  BarnSettings,
  isSameSpecies,
  nowIsoUtc,
  resolveSpeciesProfile,
  SpeciesProfile,
} from './models';
import { buildSpeciesHerdMap, wouldCreateCycle } from './pedigreeCalculator';

export type HealthIssueSeverity = 'warn' | 'error';

export type HealthIssueCode =
  | 'ORPHANED_SPECIES'
  | 'DUPLICATE_SPECIES_PROFILE'
  | 'DANGLING_PARENT_LINK'
  | 'CROSS_SPECIES_PARENT_LINK'
  | 'CYCLIC_PARENT_LINK'
  | 'PHOTO_PRIMARY_MISMATCH'
  | 'ORPHANED_PHOTO'
  | 'INVALID_SETTINGS_SPECIES'
  | 'NEGATIVE_NUMERIC_FIELD';

export interface BarnHealthIssue {
  code: HealthIssueCode;
  severity: HealthIssueSeverity;
  autoRepairable: boolean;
  count: number;
  title: string;
  detail: string;
}

export interface BarnHealthReport {
  scannedAtIso: string;
  healthy: boolean;
  autoRepairableCount: number;
  totalIssueCount: number;
  issues: BarnHealthIssue[];
}

export interface BarnHealthRepairResult {
  nextSnapshot: BarnDatabaseSnapshot;
  repairsApplied: string[];
  reportBefore: BarnHealthReport;
  reportAfter: BarnHealthReport;
}

function collectUsedSpeciesNames(snapshot: BarnDatabaseSnapshot): string[] {
  const seen = new Map<string, string>();
  const add = (raw?: string) => {
    const clean = (raw || '').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!seen.has(key)) seen.set(key, clean);
  };

  for (const a of snapshot.animals) add(a.species);
  for (const b of snapshot.breedings) add(b.species);
  for (const c of snapshot.cages) add(c.species);
  for (const t of snapshot.tasks) add(t.species);
  for (const l of snapshot.careLogs) add(l.species);
  for (const s of snapshot.shows) add(s.species);
  for (const p of snapshot.animalPhotos ?? []) add(p.species);

  return Array.from(seen.values());
}

/**
 * Scans the entire local database snapshot for hidden structural jams that could hide records
 * or break pedigree/COI rendering.
 */
export function analyzeBarnDataHealth(snapshot: BarnDatabaseSnapshot): BarnHealthReport {
  const issues: BarnHealthIssue[] = [];

  // 1. Duplicate species profiles (case-insensitive)
  const seenSpeciesKeys = new Map<string, SpeciesProfile[]>();
  for (const sp of snapshot.speciesProfiles) {
    const key = sp.name.trim().toLowerCase();
    const arr = seenSpeciesKeys.get(key) || [];
    arr.push(sp);
    seenSpeciesKeys.set(key, arr);
  }
  const duplicateSpeciesNames: string[] = [];
  for (const arr of seenSpeciesKeys.values()) {
    if (arr.length > 1) {
      duplicateSpeciesNames.push(arr[0].name);
    }
  }
  if (duplicateSpeciesNames.length > 0) {
    issues.push({
      code: 'DUPLICATE_SPECIES_PROFILE',
      severity: 'warn',
      autoRepairable: true,
      count: duplicateSpeciesNames.length,
      title: `Duplicate species profile(s): ${duplicateSpeciesNames.join(', ')}`,
      detail: 'Two species profiles share the same name; merging keeps records unified under one hub.',
    });
  }

  // 2. Records belonging to a species missing from speciesProfiles (hidden from Home / UI)
  const configuredKeys = new Set(snapshot.speciesProfiles.map((sp) => sp.name.trim().toLowerCase()));
  const usedSpecies = collectUsedSpeciesNames(snapshot);
  const missingSpecies = usedSpecies.filter((name) => !configuredKeys.has(name.toLowerCase()));
  if (missingSpecies.length > 0) {
    issues.push({
      code: 'ORPHANED_SPECIES',
      severity: 'error',
      autoRepairable: true,
      count: missingSpecies.length,
      title: `Records found for unconfigured species: ${missingSpecies.join(', ')}`,
      detail: 'Creating missing species hubs makes those hidden animals, breedings, and chores visible again.',
    });
  }

  // 3. Animal parent links (dangling, cross-species, or cyclic) + negative numeric values
  const allById = new Map(snapshot.animals.map((a) => [a.id, a]));
  const herdMapsBySpecies = new Map<string, Map<string, Animal>>();
  for (const a of snapshot.animals) {
    const key = a.species.trim().toLowerCase();
    if (!herdMapsBySpecies.has(key)) {
      herdMapsBySpecies.set(key, buildSpeciesHerdMap(snapshot.animals, a.species));
    }
  }

  let danglingCount = 0;
  let crossSpeciesCount = 0;
  let cyclicCount = 0;
  let negativeFieldCount = 0;

  for (const animal of snapshot.animals) {
    if (animal.weightGrams < 0 || animal.legsCount < 0) {
      negativeFieldCount++;
    }
    const herdMap = herdMapsBySpecies.get(animal.species.trim().toLowerCase()) || new Map();

    for (const parentId of [animal.sireId, animal.damId]) {
      if (!parentId) continue;
      const parent = allById.get(parentId);
      if (!parent) {
        danglingCount++;
      } else if (!isSameSpecies(parent.species, animal.species)) {
        crossSpeciesCount++;
      } else if (parent.id === animal.id || wouldCreateCycle(animal.id, parent.id, herdMap)) {
        // Wait: wouldCreateCycle checks if assigning parent.id as ancestor of animal.id creates a cycle.
        // Because animal already points to parent, if parent's ancestors reach animal.id, a cycle exists!
        cyclicCount++;
      }
    }
  }

  if (danglingCount > 0) {
    issues.push({
      code: 'DANGLING_PARENT_LINK',
      severity: 'warn',
      autoRepairable: true,
      count: danglingCount,
      title: `${danglingCount} dangling parent link(s) pointing to deleted/missing animals`,
      detail: 'Auto-repair saves the old ID into Barn Notes and clears the broken pointer cleanly.',
    });
  }
  if (crossSpeciesCount > 0) {
    issues.push({
      code: 'CROSS_SPECIES_PARENT_LINK',
      severity: 'error',
      autoRepairable: true,
      count: crossSpeciesCount,
      title: `${crossSpeciesCount} cross-species parent link(s)`,
      detail: 'Auto-repair documents the mismatched parent in Barn Notes and unlinks it safely.',
    });
  }
  if (cyclicCount > 0) {
    issues.push({
      code: 'CYCLIC_PARENT_LINK',
      severity: 'error',
      autoRepairable: true,
      count: cyclicCount,
      title: `${cyclicCount} circular ancestor loop(s) in pedigree links`,
      detail: 'Circular ancestry loops break tree rendering; auto-repair breaks the loop safely with a note.',
    });
  }
  if (negativeFieldCount > 0) {
    issues.push({
      code: 'NEGATIVE_NUMERIC_FIELD',
      severity: 'warn',
      autoRepairable: true,
      count: negativeFieldCount,
      title: `${negativeFieldCount} animal(s) with negative weight or leg count`,
      detail: 'Resets negative numbers to 0 so weight & leg summaries compute properly.',
    });
  }

  // 4. Photos primary flag & orphaned photos
  const photosByAnimal = new Map<string, AnimalPhoto[]>();
  let orphanedPhotoCount = 0;
  for (const photo of snapshot.animalPhotos ?? []) {
    if (!allById.has(photo.animalId)) {
      orphanedPhotoCount++;
      continue;
    }
    const list = photosByAnimal.get(photo.animalId) || [];
    list.push(photo);
    photosByAnimal.set(photo.animalId, list);
  }

  let primaryMismatchAnimals = 0;
  for (const list of photosByAnimal.values()) {
    const primaryCount = list.filter((p) => p.isPrimary).length;
    if (list.length > 0 && primaryCount !== 1) {
      primaryMismatchAnimals++;
    }
  }
  if (primaryMismatchAnimals > 0) {
    issues.push({
      code: 'PHOTO_PRIMARY_MISMATCH',
      severity: 'warn',
      autoRepairable: true,
      count: primaryMismatchAnimals,
      title: `${primaryMismatchAnimals} animal gallery/galleries missing a single Cover Photo`,
      detail: 'Assigns a deterministic primary photo so herd thumbnails and pedigrees display cleanly.',
    });
  }
  if (orphanedPhotoCount > 0) {
    issues.push({
      code: 'ORPHANED_PHOTO',
      severity: 'warn',
      autoRepairable: false,
      count: orphanedPhotoCount,
      title: `${orphanedPhotoCount} photo(s) whose parent animal record no longer exists`,
      detail: 'Kept untouched to guarantee zero data loss; export a Complete Archive (.ZIP) if you want raw files.',
    });
  }

  // 5. Settings species validity
  const effectiveConfigured = new Set([
    ...configuredKeys,
    ...missingSpecies.map((s) => s.toLowerCase()),
  ]);
  const defaultInvalid =
    effectiveConfigured.size > 0 &&
    (!snapshot.settings.defaultSpecies ||
      !effectiveConfigured.has(snapshot.settings.defaultSpecies.trim().toLowerCase()));
  const pinnedInvalid =
    Boolean((snapshot.settings.pinnedLandingSpecies || '').trim()) &&
    !effectiveConfigured.has(snapshot.settings.pinnedLandingSpecies.trim().toLowerCase());

  if (defaultInvalid || pinnedInvalid) {
    issues.push({
      code: 'INVALID_SETTINGS_SPECIES',
      severity: 'warn',
      autoRepairable: true,
      count: (defaultInvalid ? 1 : 0) + (pinnedInvalid ? 1 : 0),
      title: 'Startup or default species setting points to a missing species',
      detail: 'Resets default/pinned species to a valid configured livestock species.',
    });
  }

  const autoRepairableCount = issues
    .filter((i) => i.autoRepairable)
    .reduce((acc, i) => acc + i.count, 0);
  const totalIssueCount = issues.reduce((acc, i) => acc + i.count, 0);

  return {
    scannedAtIso: nowIsoUtc(),
    healthy: issues.length === 0,
    autoRepairableCount,
    totalIssueCount,
    issues,
  };
}

function appendRepairNote(existingNotes: string, noteLine: string): string {
  const cleanExisting = (existingNotes || '').trim();
  if (cleanExisting.includes(noteLine)) return existingNotes;
  return cleanExisting ? `${cleanExisting}\n${noteLine}` : noteLine;
}

/**
 * Safely repairs all structural database jams with ZERO record deletion.
 */
export function repairBarnDataHealth(snapshot: BarnDatabaseSnapshot): BarnHealthRepairResult {
  const reportBefore = analyzeBarnDataHealth(snapshot);
  const ts = nowIsoUtc();
  const repairsApplied: string[] = [];

  // 1. Deduplicate speciesProfiles
  const dedupedSpecies: SpeciesProfile[] = [];
  const speciesByKey = new Map<string, SpeciesProfile>();
  for (const sp of snapshot.speciesProfiles) {
    const key = sp.name.trim().toLowerCase();
    if (!key) continue;
    if (!speciesByKey.has(key)) {
      const normalized = { ...sp, name: sp.name.trim() };
      speciesByKey.set(key, normalized);
      dedupedSpecies.push(normalized);
    } else {
      repairsApplied.push(`Merged duplicate "${sp.name.trim()}" species profile.`);
    }
  }

  // 2. Restore missing speciesProfiles for orphaned records
  const usedSpecies = collectUsedSpeciesNames(snapshot);
  for (const spName of usedSpecies) {
    const key = spName.toLowerCase();
    if (!speciesByKey.has(key)) {
      const created = {
        ...resolveSpeciesProfile(spName, dedupedSpecies),
        sortOrder: dedupedSpecies.length,
        updatedAt: ts,
      };
      speciesByKey.set(key, created);
      dedupedSpecies.push(created);
      repairsApplied.push(`Created missing "${created.name}" species hub so existing records appear.`);
    }
  }

  // 3. Repair dangling, cross-species, and cyclic parent links + negative values
  const allById = new Map(snapshot.animals.map((a) => [a.id, a]));
  const workingAnimals: Animal[] = snapshot.animals.map((a) => ({ ...a }));
  const workingById = new Map(workingAnimals.map((a) => [a.id, a]));

  for (const animal of workingAnimals) {
    let changed = false;

    if (animal.weightGrams < 0) {
      animal.weightGrams = 0;
      changed = true;
      repairsApplied.push(`Reset negative weight on "${animal.name}" to 0.`);
    }
    if (animal.legsCount < 0) {
      animal.legsCount = 0;
      changed = true;
      repairsApplied.push(`Reset negative leg count on "${animal.name}" to 0.`);
    }

    // Check Sire
    if (animal.sireId) {
      const sire = workingById.get(animal.sireId);
      const herdMap = buildSpeciesHerdMap(workingAnimals, animal.species);
      if (!sire) {
        animal.notes = appendRepairNote(
          animal.notes,
          `[Health Repair: unlinked missing sire ID ${animal.sireId}]`
        );
        animal.sireId = '';
        changed = true;
        repairsApplied.push(`Unlinked missing sire ID on "${animal.name}" (saved ID in Barn Notes).`);
      } else if (!isSameSpecies(sire.species, animal.species)) {
        animal.notes = appendRepairNote(
          animal.notes,
          `[Health Repair: unlinked cross-species sire "${sire.name}" (${sire.species})]`
        );
        animal.sireId = '';
        changed = true;
        repairsApplied.push(`Unlinked cross-species sire "${sire.name}" on "${animal.name}".`);
      } else if (sire.id === animal.id || wouldCreateCycle(animal.id, sire.id, herdMap)) {
        animal.notes = appendRepairNote(
          animal.notes,
          `[Health Repair: broke circular sire loop with "${sire.name}"]`
        );
        animal.sireId = '';
        changed = true;
        repairsApplied.push(`Broke circular sire loop on "${animal.name}".`);
      }
    }

    // Check Dam
    if (animal.damId) {
      const dam = workingById.get(animal.damId);
      const herdMap = buildSpeciesHerdMap(workingAnimals, animal.species);
      if (!dam) {
        animal.notes = appendRepairNote(
          animal.notes,
          `[Health Repair: unlinked missing dam ID ${animal.damId}]`
        );
        animal.damId = '';
        changed = true;
        repairsApplied.push(`Unlinked missing dam ID on "${animal.name}" (saved ID in Barn Notes).`);
      } else if (!isSameSpecies(dam.species, animal.species)) {
        animal.notes = appendRepairNote(
          animal.notes,
          `[Health Repair: unlinked cross-species dam "${dam.name}" (${dam.species})]`
        );
        animal.damId = '';
        changed = true;
        repairsApplied.push(`Unlinked cross-species dam "${dam.name}" on "${animal.name}".`);
      } else if (dam.id === animal.id || wouldCreateCycle(animal.id, dam.id, herdMap)) {
        animal.notes = appendRepairNote(
          animal.notes,
          `[Health Repair: broke circular dam loop with "${dam.name}"]`
        );
        animal.damId = '';
        changed = true;
        repairsApplied.push(`Broke circular dam loop on "${animal.name}".`);
      }
    }

    if (changed) {
      animal.updatedAt = ts;
    }
  }

  // 4. Repair AnimalPhoto primary flags deterministically
  const workingPhotos: AnimalPhoto[] = (snapshot.animalPhotos ?? []).map((p) => ({ ...p }));
  const photosByAnimal = new Map<string, AnimalPhoto[]>();
  for (const photo of workingPhotos) {
    if (!allById.has(photo.animalId)) continue;
    const list = photosByAnimal.get(photo.animalId) || [];
    list.push(photo);
    photosByAnimal.set(photo.animalId, list);
  }
  for (const [animalId, list] of photosByAnimal.entries()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
    const primaries = list.filter((p) => p.isPrimary);
    if (primaries.length !== 1 && list.length > 0) {
      const winnerId = (primaries[0] || list[0]).id;
      for (const p of list) {
        const nextPrimary = p.id === winnerId;
        if (p.isPrimary !== nextPrimary) {
          p.isPrimary = nextPrimary;
          p.updatedAt = ts;
        }
      }
      const ownerName = allById.get(animalId)?.name || animalId;
      repairsApplied.push(`Normalized Cover Photo selection for "${ownerName}".`);
    }
  }

  // 5. Repair invalid default/pinned species in BarnSettings
  let nextSettings: BarnSettings = { ...snapshot.settings };
  let settingsChanged = false;
  if (dedupedSpecies.length > 0) {
    const validKeys = new Set(dedupedSpecies.map((s) => s.name.toLowerCase()));
    if (!nextSettings.defaultSpecies || !validKeys.has(nextSettings.defaultSpecies.trim().toLowerCase())) {
      nextSettings.defaultSpecies = dedupedSpecies[0].name;
      settingsChanged = true;
      repairsApplied.push(`Set default species to "${dedupedSpecies[0].name}".`);
    }
    if (
      (nextSettings.pinnedLandingSpecies || '').trim() &&
      !validKeys.has(nextSettings.pinnedLandingSpecies.trim().toLowerCase())
    ) {
      nextSettings.pinnedLandingSpecies = '';
      settingsChanged = true;
      repairsApplied.push('Cleared invalid startup pinned species (app will open safely on Home).');
    }
  }
  if (settingsChanged) {
    nextSettings = { ...nextSettings, updatedAt: ts };
  }

  const nextSnapshot: BarnDatabaseSnapshot = {
    ...snapshot,
    settings: nextSettings,
    speciesProfiles: dedupedSpecies,
    animals: workingAnimals,
    animalPhotos: workingPhotos,
  };

  const reportAfter = analyzeBarnDataHealth(nextSnapshot);

  return {
    nextSnapshot,
    repairsApplied,
    reportBefore,
    reportAfter,
  };
}
