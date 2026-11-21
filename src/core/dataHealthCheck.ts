/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
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

import { analyzeBarnAnimalConflicts } from './animalConflicts';
import {
  Animal,
  AnimalPhoto,
  BarnDatabaseSnapshot,
  BarnSettings,
  FeedAllocation,
  FeedBatch,
  isSameSpecies,
  LedgerEntry,
  normalizeYouthProjectFeedLogs,
  nowIsoUtc,
  ProcessingLog,
  resolveSpeciesProfile,
  SpeciesProfile,
  YouthProjectBook,
} from './models';
import { buildSpeciesHerdMap, wouldCreateCycle } from './pedigreeCalculator';

export type HealthIssueSeverity = 'warn' | 'error';

export type HealthIssueCode =
  | 'ORPHANED_SPECIES'
  | 'DUPLICATE_SPECIES_PROFILE'
  | 'DANGLING_PARENT_LINK'
  | 'CROSS_SPECIES_PARENT_LINK'
  | 'CYCLIC_PARENT_LINK'
  | 'PARENT_SEX_MISMATCH'
  | 'DUPLICATE_SPECIES_TATTOO'
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

function isPlainObject(v: unknown): v is Record<string, any> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function safeStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : v === null || v === undefined ? fallback : String(v);
}

function collectUsedSpeciesNames(snapshot: BarnDatabaseSnapshot): string[] {
  const seen = new Map<string, string>();
  const add = (raw?: unknown) => {
    const clean = safeStr(raw).trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!seen.has(key)) seen.set(key, clean);
  };

  for (const a of Array.isArray(snapshot.animals) ? snapshot.animals : []) {
    if (isPlainObject(a)) add(a.species);
  }
  for (const b of Array.isArray(snapshot.breedings) ? snapshot.breedings : []) {
    if (isPlainObject(b)) add(b.species);
  }
  for (const c of Array.isArray(snapshot.cages) ? snapshot.cages : []) {
    if (isPlainObject(c)) add(c.species);
  }
  for (const t of Array.isArray(snapshot.tasks) ? snapshot.tasks : []) {
    if (isPlainObject(t)) add(t.species);
  }
  for (const l of Array.isArray(snapshot.careLogs) ? snapshot.careLogs : []) {
    if (isPlainObject(l)) add(l.species);
  }
  for (const s of Array.isArray(snapshot.shows) ? snapshot.shows : []) {
    if (isPlainObject(s)) add(s.species);
  }
  for (const p of Array.isArray(snapshot.animalPhotos) ? snapshot.animalPhotos : []) {
    if (isPlainObject(p)) add(p.species);
  }
  for (const f of Array.isArray(snapshot.feedBatches) ? snapshot.feedBatches : []) {
    if (isPlainObject(f)) add(f.species);
  }
  for (const fa of Array.isArray(snapshot.feedAllocations) ? snapshot.feedAllocations : []) {
    if (isPlainObject(fa)) add(fa.species);
  }
  for (const le of Array.isArray(snapshot.ledgerEntries) ? snapshot.ledgerEntries : []) {
    if (isPlainObject(le)) add(le.species);
  }
  for (const pl of Array.isArray(snapshot.processingLogs) ? snapshot.processingLogs : []) {
    if (isPlainObject(pl)) add(pl.species);
  }
  for (const yp of Array.isArray(snapshot.youthProjectBooks) ? snapshot.youthProjectBooks : []) {
    if (isPlainObject(yp)) add(yp.species);
  }

  return Array.from(seen.values());
}

/**
 * Scans the entire local database snapshot for hidden structural jams that could hide records
 * or break pedigree/COI rendering.
 */
export function analyzeBarnDataHealth(snapshot: BarnDatabaseSnapshot): BarnHealthReport {
  const issues: BarnHealthIssue[] = [];
  const rawSpeciesProfiles = (Array.isArray(snapshot.speciesProfiles) ? snapshot.speciesProfiles : []).filter(
    (sp): sp is SpeciesProfile => isPlainObject(sp)
  );
  const rawAnimals = (Array.isArray(snapshot.animals) ? snapshot.animals : []).filter(
    (a): a is Animal => isPlainObject(a) && typeof a.id === 'string' && a.id.trim().length > 0
  );

  // 1. Duplicate species profiles (case-insensitive)
  const seenSpeciesKeys = new Map<string, SpeciesProfile[]>();
  for (const sp of rawSpeciesProfiles) {
    const key = safeStr(sp.name).trim().toLowerCase();
    if (!key) continue;
    const arr = seenSpeciesKeys.get(key) || [];
    arr.push(sp);
    seenSpeciesKeys.set(key, arr);
  }
  const duplicateSpeciesNames: string[] = [];
  for (const arr of seenSpeciesKeys.values()) {
    if (arr.length > 1) {
      duplicateSpeciesNames.push(safeStr(arr[0].name).trim());
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
  const configuredKeys = new Set(
    rawSpeciesProfiles.map((sp) => safeStr(sp.name).trim().toLowerCase()).filter(Boolean)
  );
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

  // 3. Animal parent links (dangling, cross-species, or cyclic) + negative/non-finite numeric values
  const allById = new Map(rawAnimals.map((a) => [a.id, a]));
  const herdMapsBySpecies = new Map<string, Map<string, Animal>>();
  for (const a of rawAnimals) {
    const spName = safeStr(a.species);
    const key = spName.trim().toLowerCase();
    if (!herdMapsBySpecies.has(key)) {
      herdMapsBySpecies.set(key, buildSpeciesHerdMap(rawAnimals, spName));
    }
  }

  let danglingCount = 0;
  let crossSpeciesCount = 0;
  let cyclicCount = 0;
  let negativeFieldCount = 0;

  for (const animal of rawAnimals) {
    const w = Number(animal.weightGrams);
    const l = Number(animal.legsCount);
    const s = Number(animal.salePriceCents ?? 0);
    const p = Number(animal.purchaseCostCents ?? 0);
    if (
      !Number.isFinite(w) ||
      w < 0 ||
      !Number.isFinite(l) ||
      l < 0 ||
      !Number.isFinite(s) ||
      s < 0 ||
      !Number.isFinite(p) ||
      p < 0
    ) {
      negativeFieldCount++;
    }
    const herdMap = herdMapsBySpecies.get(safeStr(animal.species).trim().toLowerCase()) || new Map();

    for (const parentId of [animal.sireId, animal.damId]) {
      if (!parentId || typeof parentId !== 'string') continue;
      const parent = allById.get(parentId);
      if (!parent) {
        danglingCount++;
      } else if (!isSameSpecies(safeStr(parent.species), safeStr(animal.species))) {
        crossSpeciesCount++;
      } else if (parent.id === animal.id || wouldCreateCycle(animal.id, parent.id, herdMap)) {
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

  // 3b. Warning-only checks: Duplicate within-species IDs/tattoos & parent sex mismatches
  const conflictSummaries = analyzeBarnAnimalConflicts(rawAnimals);
  const dupGroups = new Map<string, { species: string; tattoo: string; count: number; sameSexCollision: boolean }>();
  let duplicateTattooAnimalsCount = 0;
  let parentSexMismatchCount = 0;
  let femaleSireCount = 0;
  let maleDamCount = 0;
  let unknownParentSexCount = 0;

  for (const animal of rawAnimals) {
    const summary = conflictSummaries.get(animal.id);
    if (!summary) continue;

    if (summary.duplicateTattooPeers.length > 0) {
      duplicateTattooAnimalsCount++;
      const cleanTat = safeStr(animal.tattoo).trim();
      const groupKey = `${safeStr(animal.species).trim().toLowerCase()}::${cleanTat.toLowerCase()}`;
      const existingGroup = dupGroups.get(groupKey);
      const hasSameSex = summary.duplicateTattooPeers.some((p) => p.sameSex);
      if (existingGroup) {
        existingGroup.count++;
        if (hasSameSex) existingGroup.sameSexCollision = true;
      } else {
        dupGroups.set(groupKey, {
          species: safeStr(animal.species).trim() || 'Unknown',
          tattoo: cleanTat,
          count: 1,
          sameSexCollision: hasSameSex,
        });
      }
    }

    if (summary.sireSexMismatch) {
      parentSexMismatchCount++;
      if (summary.sireSexMismatch.actualSex === 'Female') femaleSireCount++;
      else unknownParentSexCount++;
    }
    if (summary.damSexMismatch) {
      parentSexMismatchCount++;
      if (summary.damSexMismatch.actualSex === 'Male') maleDamCount++;
      else unknownParentSexCount++;
    }
  }

  if (duplicateTattooAnimalsCount > 0) {
    const sampleGroups = Array.from(dupGroups.values())
      .slice(0, 3)
      .map((g) => `${g.species}: "${g.tattoo}" (${g.count}x)`)
      .join(', ');
    issues.push({
      code: 'DUPLICATE_SPECIES_TATTOO',
      severity: 'warn',
      autoRepairable: false,
      count: dupGroups.size,
      title: `${dupGroups.size} duplicate ID/tattoo group(s) across ${duplicateTattooAnimalsCount} animal(s) within the same species`,
      detail: `Left untouched for zero data loss (${sampleGroups}${dupGroups.size > 3 ? ', ...' : ''}). Review or filter by Conflicts in Herd to verify or ignore.`,
    });
  }

  if (parentSexMismatchCount > 0) {
    const mismatchParts: string[] = [];
    if (femaleSireCount > 0) mismatchParts.push(`${femaleSireCount} female recorded as Sire`);
    if (maleDamCount > 0) mismatchParts.push(`${maleDamCount} male recorded as Dam`);
    if (unknownParentSexCount > 0) mismatchParts.push(`${unknownParentSexCount} Unknown-sex parent link(s)`);
    issues.push({
      code: 'PARENT_SEX_MISMATCH',
      severity: 'warn',
      autoRepairable: false,
      count: parentSexMismatchCount,
      title: `${parentSexMismatchCount} parent sex mismatch(es) (${mismatchParts.join(', ')})`,
      detail:
        'Left untouched so imported pedigrees stay intact. Open Herd -> Conflicts to correct parent sex or unlink mismatched parents.',
    });
  }

  // 4. Photos primary flag & orphaned photos
  const photosByAnimal = new Map<string, AnimalPhoto[]>();
  let orphanedPhotoCount = 0;
  for (const photo of Array.isArray(snapshot.animalPhotos) ? snapshot.animalPhotos : []) {
    if (!isPlainObject(photo)) continue;
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
  const defaultSpeciesNorm = safeStr(snapshot.settings?.defaultSpecies).trim().toLowerCase();
  const pinnedSpeciesNorm = safeStr(snapshot.settings?.pinnedLandingSpecies).trim().toLowerCase();
  const defaultInvalid =
    effectiveConfigured.size > 0 &&
    (!defaultSpeciesNorm || !effectiveConfigured.has(defaultSpeciesNorm));
  const pinnedInvalid =
    Boolean(pinnedSpeciesNorm) && !effectiveConfigured.has(pinnedSpeciesNorm);

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
  for (const sp of Array.isArray(snapshot.speciesProfiles) ? snapshot.speciesProfiles : []) {
    if (!isPlainObject(sp)) continue;
    const cleanName = safeStr(sp.name).trim();
    const key = cleanName.toLowerCase();
    if (!key) continue;
    if (!speciesByKey.has(key)) {
      const normalized = { ...sp, name: cleanName };
      speciesByKey.set(key, normalized);
      dedupedSpecies.push(normalized);
    } else {
      repairsApplied.push(`Merged duplicate "${cleanName}" species profile.`);
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

  // 3. Repair dangling, cross-species, and cyclic parent links + negative/non-finite numeric values
  const workingAnimals: Animal[] = (Array.isArray(snapshot.animals) ? snapshot.animals : [])
    .filter((a): a is Animal => isPlainObject(a) && typeof a.id === 'string' && a.id.trim().length > 0)
    .map((a) => ({
      ...a,
      name: safeStr(a.name, 'Unnamed'),
      species: safeStr(a.species, 'Rabbit'),
      notes: safeStr(a.notes, ''),
      sireId: typeof a.sireId === 'string' ? a.sireId : '',
      damId: typeof a.damId === 'string' ? a.damId : '',
    }));
  const workingById = new Map(workingAnimals.map((a) => [a.id, a]));
  // Prebuild per-species maps once (O(N)); animal objects mutate in place so maps stay current!
  const herdMapsBySpecies = new Map<string, Map<string, Animal>>();
  for (const a of workingAnimals) {
    const key = a.species.trim().toLowerCase();
    if (!herdMapsBySpecies.has(key)) {
      herdMapsBySpecies.set(key, buildSpeciesHerdMap(workingAnimals, a.species));
    }
  }

  for (const animal of workingAnimals) {
    let changed = false;

    const w = Number(animal.weightGrams);
    if (!Number.isFinite(w) || w < 0) {
      animal.weightGrams = 0;
      changed = true;
      repairsApplied.push(`Reset invalid/negative weight on "${animal.name}" to 0.`);
    }
    const legs = Number(animal.legsCount);
    if (!Number.isFinite(legs) || legs < 0) {
      animal.legsCount = 0;
      changed = true;
      repairsApplied.push(`Reset invalid/negative leg count on "${animal.name}" to 0.`);
    }
    if (
      animal.salePriceCents !== undefined &&
      (!Number.isFinite(Number(animal.salePriceCents)) || Number(animal.salePriceCents) < 0)
    ) {
      animal.salePriceCents = 0;
      changed = true;
    }
    if (
      animal.purchaseCostCents !== undefined &&
      (!Number.isFinite(Number(animal.purchaseCostCents)) || Number(animal.purchaseCostCents) < 0)
    ) {
      animal.purchaseCostCents = 0;
      changed = true;
    }

    const herdMap = herdMapsBySpecies.get(animal.species.trim().toLowerCase()) || new Map<string, Animal>();

    // Check Sire
    if (animal.sireId) {
      const sire = workingById.get(animal.sireId);
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
  const workingPhotos: AnimalPhoto[] = (Array.isArray(snapshot.animalPhotos) ? snapshot.animalPhotos : [])
    .filter((p): p is AnimalPhoto => isPlainObject(p) && typeof p.id === 'string')
    .map((p) => ({ ...p }));
  const photosByAnimal = new Map<string, AnimalPhoto[]>();
  for (const photo of workingPhotos) {
    if (!workingById.has(photo.animalId)) continue;
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
      const ownerName = workingById.get(animalId)?.name || animalId;
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

  // 6. Sanitize FeedBatch & FeedAllocation numeric fields without deleting user ledger records
  const workingFeedBatches: FeedBatch[] = (Array.isArray(snapshot.feedBatches) ? snapshot.feedBatches : [])
    .filter((f): f is FeedBatch => isPlainObject(f) && typeof f.id === 'string' && f.id.trim().length > 0)
    .map((f) => {
      const next = { ...f };
      let changed = false;
      for (const key of ['bagCount', 'bagWeightValue', 'totalQuantity', 'remainingQuantity', 'lowStockThreshold'] as const) {
        const val = Number(next[key]);
        if (!Number.isFinite(val) || val < 0) {
          next[key] = 0;
          changed = true;
        }
      }
      if (next.totalCostCents !== undefined && (!Number.isFinite(Number(next.totalCostCents)) || Number(next.totalCostCents) < 0)) {
        next.totalCostCents = 0;
        changed = true;
      }
      if (changed) {
        next.updatedAt = ts;
        repairsApplied.push(`Normalized negative/invalid numeric quantity on feed batch "${next.productName || next.lotNumber || next.id}".`);
      }
      return next;
    });

  const workingFeedAllocations: FeedAllocation[] = (Array.isArray(snapshot.feedAllocations) ? snapshot.feedAllocations : [])
    .filter((fa): fa is FeedAllocation => isPlainObject(fa) && typeof fa.id === 'string' && fa.id.trim().length > 0)
    .map((fa) => {
      const val = Number(fa.quantity);
      if (!Number.isFinite(val) || val < 0) {
        repairsApplied.push(`Reset negative/invalid feed allocation quantity for "${fa.targetLabel || fa.id}" to 0.`);
        return { ...fa, quantity: 0, updatedAt: ts };
      }
      return { ...fa };
    });

  const workingLedgerEntries: LedgerEntry[] = (Array.isArray(snapshot.ledgerEntries) ? snapshot.ledgerEntries : [])
    .filter((le): le is LedgerEntry => isPlainObject(le) && typeof le.id === 'string' && le.id.trim().length > 0)
    .map((le) => {
      const amt = Number(le.amountCents);
      if (!Number.isFinite(amt) || amt < 0) {
        repairsApplied.push(`Reset negative/invalid amount on ledger entry "${le.title || le.id}" to 0.`);
        return { ...le, amountCents: 0, updatedAt: ts };
      }
      return { ...le };
    });

  const workingProcessingLogs: ProcessingLog[] = (Array.isArray(snapshot.processingLogs) ? snapshot.processingLogs : [])
    .filter((pl): pl is ProcessingLog => isPlainObject(pl) && typeof pl.id === 'string' && pl.id.trim().length > 0)
    .map((pl) => {
      const next = { ...pl };
      let changed = false;
      for (const key of ['animalCount', 'liveWeightGrams', 'dressedWeightGrams', 'peltCount'] as const) {
        const val = Number(next[key]);
        if (!Number.isFinite(val) || val < 0) {
          next[key] = key === 'animalCount' ? 1 : 0;
          changed = true;
        }
      }
      if (changed) {
        next.updatedAt = ts;
        repairsApplied.push(`Normalized negative/invalid numeric weight or count on processing log "${next.title || next.id}".`);
      }
      return next;
    });

  const workingYouthBooks: YouthProjectBook[] = (Array.isArray(snapshot.youthProjectBooks) ? snapshot.youthProjectBooks : [])
    .filter((yp): yp is YouthProjectBook => isPlainObject(yp) && typeof yp.id === 'string' && yp.id.trim().length > 0)
    .map((yp) => ({
      ...yp,
      linkedAnimalIds: Array.isArray(yp.linkedAnimalIds) ? yp.linkedAnimalIds.filter((id) => typeof id === 'string') : [],
      linkedBreedingIds: Array.isArray(yp.linkedBreedingIds) ? yp.linkedBreedingIds.filter((id) => typeof id === 'string') : [],
      feedLogs: normalizeYouthProjectFeedLogs(yp.feedLogs),
    }));

  const nextSnapshot: BarnDatabaseSnapshot = {
    ...snapshot,
    settings: nextSettings,
    speciesProfiles: dedupedSpecies,
    animals: workingAnimals,
    animalPhotos: workingPhotos,
    feedBatches: workingFeedBatches,
    feedAllocations: workingFeedAllocations,
    ledgerEntries: workingLedgerEntries,
    processingLogs: workingProcessingLogs,
    youthProjectBooks: workingYouthBooks,
  };

  const reportAfter = analyzeBarnDataHealth(nextSnapshot);

  return {
    nextSnapshot,
    repairsApplied,
    reportBefore,
    reportAfter,
  };
}
