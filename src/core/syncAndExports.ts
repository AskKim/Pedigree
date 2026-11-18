/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Multi-Device Conflict-Free Merge Engine & Open Export Serializers
 * (.json, .csv, Evans .HTM Pedigrees, Thermal Labels, and PDF-Ready Snapshots).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript string/JSON/HTML builders with zero browser DOM (`window`, `document`)
 * calls so the exact same serializers run in React Native / Expo (`expo-file-system` / `expo-print`).
 */

import {
  formatCompactCarrierDisclosure,
  reconcileCarrierTraitLists,
} from './carrierGenetics';
import { formatGenotypeArray, parseGenotypeString } from './geneticsEngine';
import {
  Animal,
  AnimalPhoto,
  BarnDatabaseSnapshot,
  BarnSettings,
  BarnTask,
  BreedingRecord,
  BreedingStatus,
  CageLocation,
  CareLog,
  CareLogType,
  formatReadableDate,
  formatSexForSpecies,
  formatWeight,
  generateUuid,
  isAnimalArchived,
  isSameSpecies,
  millisToDateIso,
  normalizeAnimalStatus,
  normalizeBiologicalSex,
  normalizeCalendarSyncSettings,
  normalizeCurrencyCode,
  normalizeIgnoredConflicts,
  normalizeOwnershipType,
  normalizeRufusLevel,
  normalizeServiceFeeDirection,
  normalizeUltrasoundResult,
  normalizeWeightUnit,
  nowEpochMs,
  nowIsoUtc,
  PREDEFINED_SPECIES_PRESETS,
  resolveSpeciesProfile,
  resolveSpeciesWeightUnit,
  ShowEvent,
  SpeciesProfile,
  TaskCategory,
  TaskPriority,
  todayDateIso,
} from './models';
import {
  buildPedigreeSlots,
  buildSpeciesHerdMap,
  calculateAnimalCoi,
  createSpeciesCoiEvaluator,
  PedigreeSlot,
} from './pedigreeCalculator';
import { sanitizeSpeciesMemo } from './speciesMemo';
import {
  escapeSafeHtml,
  isSafeRecordKey,
  MAX_JSON_BACKUP_BYTES,
  sanitizeCustomColors,
  sanitizePlainDictionary,
  sanitizePlainText,
  sanitizeSafeRasterImageDataUrl,
  sanitizeSingleLineText,
  validateUploadFileSize,
} from './inputSanitization';

/**
 * Deterministic UUID + ISO-8601 `updatedAt` record merge helper.
 * When two devices edit records offline (e.g. via Google Drive, OneDrive, or SyncThing),
 * unique UUID records union cleanly and matching UUIDs keep whichever copy has the newer `updatedAt`.
 */
function mergeByIdAndTimestamp<T extends { id: string; updatedAt: string }>(
  localList: T[],
  incomingList: T[]
): { merged: T[]; added: number; updated: number } {
  const map = new Map<string, T>();
  for (const item of localList) {
    map.set(item.id, item);
  }

  let added = 0;
  let updated = 0;

  for (const inc of incomingList) {
    if (!inc.id) continue;
    const existing = map.get(inc.id);
    if (!existing) {
      map.set(inc.id, inc);
      added++;
    } else if ((inc.updatedAt || '') > (existing.updatedAt || '')) {
      map.set(inc.id, inc);
      updated++;
    }
  }

  return { merged: Array.from(map.values()), added, updated };
}

function mergeAnimalPhotosWithBlobPreservation(
  localPhotos: AnimalPhoto[],
  incomingPhotos: AnimalPhoto[]
): { merged: AnimalPhoto[]; added: number; updated: number } {
  const map = new Map<string, AnimalPhoto>();
  for (const item of localPhotos) {
    map.set(item.id, item);
  }

  let added = 0;
  let updated = 0;

  for (const inc of incomingPhotos) {
    if (!inc.id) continue;
    const existing = map.get(inc.id);
    if (!existing) {
      map.set(inc.id, inc);
      added++;
      continue;
    }
    const existingHasBlob = Boolean(existing.dataUrl || existing.thumbnailDataUrl);
    const incHasBlob = Boolean(inc.dataUrl || inc.thumbnailDataUrl);
    const incIsNewer = (inc.updatedAt || '') > (existing.updatedAt || '');

    if (!existingHasBlob && incHasBlob) {
      map.set(inc.id, {
        ...(incIsNewer ? inc : existing),
        dataUrl: inc.dataUrl,
        thumbnailDataUrl: inc.thumbnailDataUrl,
        mimeType: inc.mimeType || existing.mimeType,
        width: inc.width || existing.width,
        height: inc.height || existing.height,
        originalBytes: inc.originalBytes || existing.originalBytes,
        storedBytes: inc.storedBytes || existing.storedBytes,
      });
      updated++;
    } else if (incIsNewer) {
      map.set(
        inc.id,
        !incHasBlob && existingHasBlob
          ? {
              ...inc,
              dataUrl: existing.dataUrl,
              thumbnailDataUrl: existing.thumbnailDataUrl,
            }
          : inc
      );
      updated++;
    }
  }

  return { merged: Array.from(map.values()), added, updated };
}

export interface SyncMergeReport {
  snapshot: BarnDatabaseSnapshot;
  animalsAdded: number;
  animalsUpdated: number;
  photosMerged: number;
  breedingsMerged: number;
  tasksMerged: number;
}

/**
 * Merges an incoming `BarnDatabaseSnapshot` (from a shared cloud folder or peer device)
 * into the local snapshot using deterministic UUID + ISO-8601 `updatedAt` resolution.
 */
export function mergeBarnSnapshots(
  local: BarnDatabaseSnapshot,
  incoming: BarnDatabaseSnapshot
): SyncMergeReport {
  const settings =
    (incoming.settings?.updatedAt || '') > (local.settings?.updatedAt || '')
      ? incoming.settings
      : local.settings;

  // Merge species profiles by case-insensitive species name first, then ID,
  // while preserving whichever side has the newest memo pad edit.
  const speciesByName = new Map<string, SpeciesProfile>();
  for (const sp of local.speciesProfiles) {
    speciesByName.set(sp.name.trim().toLowerCase(), {
      ...sp,
      memoText: sanitizeSpeciesMemo(sp.memoText),
      memoUpdatedAt: typeof sp.memoUpdatedAt === 'string' ? sp.memoUpdatedAt : '',
    });
  }
  for (const incSp of incoming.speciesProfiles) {
    const key = incSp.name.trim().toLowerCase();
    const prev = speciesByName.get(key);
    const cleanIncText = sanitizeSpeciesMemo(incSp.memoText);
    const cleanIncMemoTs = typeof incSp.memoUpdatedAt === 'string' ? incSp.memoUpdatedAt : '';

    if (!prev) {
      speciesByName.set(key, {
        ...incSp,
        memoText: cleanIncText,
        memoUpdatedAt: cleanIncMemoTs,
      });
      continue;
    }

    const prevText = sanitizeSpeciesMemo(prev.memoText);
    const prevMemoTs = typeof prev.memoUpdatedAt === 'string' ? prev.memoUpdatedAt : '';
    const pickIncomingMemo =
      (cleanIncMemoTs && (!prevMemoTs || cleanIncMemoTs > prevMemoTs)) ||
      (!prevMemoTs && !cleanIncMemoTs && !prevText && Boolean(cleanIncText));

    const winnerMemo = pickIncomingMemo
      ? { memoText: cleanIncText, memoUpdatedAt: cleanIncMemoTs }
      : { memoText: prevText, memoUpdatedAt: prevMemoTs };

    if ((incSp.updatedAt || '') > (prev.updatedAt || '')) {
      speciesByName.set(key, { ...incSp, id: prev.id, ...winnerMemo });
    } else {
      speciesByName.set(key, { ...prev, ...winnerMemo });
    }
  }

  const animalsRes = mergeByIdAndTimestamp(local.animals, incoming.animals);
  const animalPhotosRes = mergeAnimalPhotosWithBlobPreservation(
    local.animalPhotos ?? [],
    incoming.animalPhotos ?? []
  );
  const cagesRes = mergeByIdAndTimestamp(local.cages, incoming.cages);
  const breedingsRes = mergeByIdAndTimestamp(local.breedings, incoming.breedings);
  const tasksRes = mergeByIdAndTimestamp(local.tasks, incoming.tasks);
  const careLogsRes = mergeByIdAndTimestamp(local.careLogs, incoming.careLogs);
  const showsRes = mergeByIdAndTimestamp(local.shows, incoming.shows);

  const sortedSpecies = Array.from(speciesByName.values())
    .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || a.name.localeCompare(b.name))
    .map((sp, idx) => ({ ...sp, sortOrder: idx }));

  return {
    snapshot: {
      settings,
      speciesProfiles: sortedSpecies,
      animals: animalsRes.merged,
      animalPhotos: animalPhotosRes.merged,
      cages: cagesRes.merged,
      breedings: breedingsRes.merged,
      tasks: tasksRes.merged,
      careLogs: careLogsRes.merged,
      shows: showsRes.merged,
    },
    animalsAdded: animalsRes.added,
    animalsUpdated: animalsRes.updated,
    photosMerged: animalPhotosRes.added + animalPhotosRes.updated,
    breedingsMerged: breedingsRes.added + breedingsRes.updated,
    tasksMerged: tasksRes.added + tasksRes.updated,
  };
}

export type SpeciesBackupReason =
  | 'manual'
  | 'pre-remove-species'
  | 'pre-remove-non-testing'
  | 'pre-delete-all';

function slugifyFileSegment(value: string, fallback: string): string {
  const clean = (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || fallback;
}

/**
 * Builds clean, human-readable filenames for external backups and exports.
 * Default `"My Barn"` normalizes to `"pedigree"` so downloads look tidy.
 */
export function buildCleanBackupFileName(
  barnName: string | undefined,
  format: 'json' | 'sqlite' | 'csv',
  dateSlug?: string
): string {
  const trimmed = (barnName || '').trim();
  const isDefault = !trimmed || trimmed.toLowerCase() === 'my barn';
  const prefix = isDefault ? 'pedigree' : slugifyFileSegment(trimmed, 'pedigree');
  const stamp = dateSlug || todayDateIso();
  if (format === 'sqlite') {
    return `${prefix}-${stamp}.sqlite`;
  }
  if (format === 'csv') {
    return `${prefix}-export-${stamp}.csv`;
  }
  return `${prefix}-backup-${stamp}.json`;
}

/**
 * Builds a collision-free timestamped safety backup filename for targeted species operations.
 */
export function buildSpeciesSafetyBackupFileName(
  barnName: string | undefined,
  speciesName: string,
  reason: SpeciesBackupReason = 'manual',
  timestampSlug?: string
): string {
  const trimmed = (barnName || '').trim();
  const isDefault = !trimmed || trimmed.toLowerCase() === 'my barn';
  const prefix = isDefault ? 'pedigree' : slugifyFileSegment(trimmed, 'pedigree');
  const spSlug = slugifyFileSegment(speciesName, 'species');
  const reasonSlug =
    reason === 'pre-remove-non-testing'
      ? 'pre-clear-non-testing'
      : reason === 'pre-remove-species'
      ? 'pre-remove-species'
      : reason === 'pre-delete-all'
      ? 'pre-delete-all'
      : 'backup';
  const stamp = timestampSlug || formatTimestampedBackupSlug();
  return `${prefix}-${spSlug}-${reasonSlug}-${stamp}.json`;
}

/**
 * Builds a collision-free timestamped Species `.ZIP` backup filename (JSON + Photos + Printable Barn Binder `.HTM`).
 */
export function buildSpeciesZipBackupFileName(
  barnName: string | undefined,
  speciesName: string,
  reason: SpeciesBackupReason = 'manual',
  timestampSlug?: string
): string {
  return buildSpeciesSafetyBackupFileName(barnName, speciesName, reason, timestampSlug).replace(
    /\.json$/i,
    '.zip'
  );
}

/**
 * Serializes the entire database into an open, human-readable JSON backup (`version: 5`)
 * with summary metadata and deterministic sorting.
 */
export function exportBarnBackupJson(
  snapshot: BarnDatabaseSnapshot,
  extraMeta?: {
    backupScope?: 'barn' | 'species';
    backupReason?: SpeciesBackupReason;
    targetSpecies?: string;
  }
): string {
  const sortedAnimals = [...snapshot.animals].sort((a, b) => {
    const spCmp = (a.species || '').localeCompare(b.species || '');
    if (spCmp !== 0) return spCmp;
    const archDiff = (isAnimalArchived(a) ? 1 : 0) - (isAnimalArchived(b) ? 1 : 0);
    if (archDiff !== 0) return archDiff;
    return (a.name || '').localeCompare(b.name || '');
  });

  const activeAnimalsCount = sortedAnimals.filter((a) => !isAnimalArchived(a)).length;
  const archivedAnimalsCount = sortedAnimals.length - activeAnimalsCount;

  const bySpeciesMap = new Map<
    string,
    { species: string; totalAnimals: number; activeAnimals: number; archivedAnimals: number }
  >();
  for (const sp of snapshot.speciesProfiles) {
    bySpeciesMap.set(sp.name.trim().toLowerCase(), {
      species: sp.name,
      totalAnimals: 0,
      activeAnimals: 0,
      archivedAnimals: 0,
    });
  }
  for (const a of sortedAnimals) {
    const key = (a.species || 'Other').trim().toLowerCase();
    const bucket = bySpeciesMap.get(key) || {
      species: a.species || 'Other',
      totalAnimals: 0,
      activeAnimals: 0,
      archivedAnimals: 0,
    };
    bucket.totalAnimals += 1;
    if (isAnimalArchived(a)) {
      bucket.archivedAnimals += 1;
    } else {
      bucket.activeAnimals += 1;
    }
    bySpeciesMap.set(key, bucket);
  }

  const exportedSpeciesProfiles: SpeciesProfile[] = snapshot.speciesProfiles.map((sp) => ({
    ...sp,
    memoText: sanitizeSpeciesMemo(sp.memoText),
    memoUpdatedAt: typeof sp.memoUpdatedAt === 'string' ? sp.memoUpdatedAt : '',
  }));

  const exportedAtIsoUtc = nowIsoUtc();
  const payload = {
    format: 'community-pedigree-backup',
    package: 'Pedigree',
    version: 5,
    _schemaVersion: 6,
    exportedAtIsoUtc,
    exportedAtLocal: new Date(exportedAtIsoUtc).toLocaleString(),
    ...(extraMeta ?? {}),
    barnSummary: {
      barnName: snapshot.settings.barnName,
      breederName: snapshot.settings.breederName,
      counts: {
        animals: sortedAnimals.length,
        activeAnimals: activeAnimalsCount,
        archivedAnimals: archivedAnimalsCount,
        speciesProfiles: exportedSpeciesProfiles.length,
        animalPhotos: (snapshot.animalPhotos ?? []).length,
        breedings: snapshot.breedings.length,
        tasks: snapshot.tasks.length,
      },
      bySpecies: Array.from(bySpeciesMap.values()),
    },
    settings: snapshot.settings,
    speciesProfiles: exportedSpeciesProfiles,
    animals: sortedAnimals,
    animalPhotos: snapshot.animalPhotos ?? [],
    cages: snapshot.cages,
    breedings: snapshot.breedings,
    tasks: snapshot.tasks,
    careLogs: snapshot.careLogs,
    shows: snapshot.shows,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Parses both current (`v5`) and legacy Kotlin demo (`v3`/`v4`) JSON backups into a normalized
 * `BarnDatabaseSnapshot`, automatically upgrading `earTag` -> `tattoo`, epoch millis -> ISO dates,
 * and `Buck`/`Doe` -> canonical biological sex + strict `species` scoping.
 */
export function parseBarnBackupJson(
  jsonText: string,
  fallbackSettings: BarnSettings
): BarnDatabaseSnapshot {
  const sizeCheck = validateUploadFileSize(
    'backup.json',
    jsonText.length,
    MAX_JSON_BACKUP_BYTES,
    'a JSON backup file'
  );
  if (!sizeCheck.ok) {
    throw new Error(sizeCheck.error);
  }
  const raw = JSON.parse(jsonText);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Backup file is not a valid JSON object.');
  }
  const hasKnownRootCollection =
    Array.isArray(raw.animals) ||
    Array.isArray(raw.speciesProfiles) ||
    Array.isArray(raw.speciesConfigs) ||
    (raw.settings && typeof raw.settings === 'object') ||
    (raw.profile && typeof raw.profile === 'object') ||
    raw.format === 'community-pedigree-backup' ||
    raw.format === 'community-pedigree-vault-backup';
  if (!hasKnownRootCollection) {
    throw new Error(
      'Backup JSON root structure is invalid (missing animals, speciesProfiles, or settings collections).'
    );
  }

  const ts = nowIsoUtc();
  const isObj = (v: unknown): v is Record<string, any> =>
    Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const finiteNum = (v: unknown, fb = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  };
  const finiteNonNeg = (v: unknown, fb = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fb;
  };
  const safeId = (v: unknown): string => {
    if (typeof v !== 'string') return generateUuid();
    const clean = sanitizeSingleLineText(v, 140);
    return clean && isSafeRecordKey(clean) ? clean : generateUuid();
  };

  const rawSettingsCand = raw.settings ?? raw.profile;
  const rawSettings = isObj(rawSettingsCand) ? rawSettingsCand : {};
  const settings: BarnSettings = {
    id: 'barn_settings',
    barnName:
      sanitizeSingleLineText(rawSettings.barnName || rawSettings.warrenName, 160) ||
      fallbackSettings.barnName ||
      'My Barn',
    breederName: sanitizeSingleLineText(rawSettings.breederName, 160) || fallbackSettings.breederName || '',
    preferredUnit: normalizeWeightUnit(rawSettings.preferredUnit, fallbackSettings.preferredUnit || 'lbs_oz'),
    currencyCode: normalizeCurrencyCode(rawSettings.currencyCode, fallbackSettings.currencyCode || 'USD'),
    defaultSpecies:
      sanitizeSingleLineText(rawSettings.defaultSpecies, 100) || fallbackSettings.defaultSpecies || 'Rabbit',
    pinnedLandingSpecies:
      rawSettings.pinnedLandingSpecies !== undefined
        ? sanitizeSingleLineText(rawSettings.pinnedLandingSpecies, 100)
        : fallbackSettings.pinnedLandingSpecies ?? '',
    defaultGenerations:
      rawSettings.defaultGenerations === 4 ||
      rawSettings.defaultGenerations === 5 ||
      rawSettings.defaultGenerations === 6
        ? rawSettings.defaultGenerations
        : 3,
    themeMode:
      rawSettings.themeMode === 'dark' || rawSettings.themeMode === 'light'
        ? rawSettings.themeMode
        : fallbackSettings.themeMode,
    customColors:
      rawSettings.customColors && typeof rawSettings.customColors === 'object'
        ? sanitizeCustomColors(rawSettings.customColors) ?? fallbackSettings.customColors
        : fallbackSettings.customColors,
    imageOptimizationPreset:
      rawSettings.imageOptimizationPreset === 'compact' ||
      rawSettings.imageOptimizationPreset === 'balanced' ||
      rawSettings.imageOptimizationPreset === 'high_detail'
        ? rawSettings.imageOptimizationPreset
        : fallbackSettings.imageOptimizationPreset || 'balanced',
    showHomeSummaryGrid:
      typeof rawSettings.showHomeSummaryGrid === 'boolean'
        ? rawSettings.showHomeSummaryGrid
        : fallbackSettings.showHomeSummaryGrid ?? true,
    barnNameOnboarded:
      typeof rawSettings.barnNameOnboarded === 'boolean'
        ? rawSettings.barnNameOnboarded
        : fallbackSettings.barnNameOnboarded ?? true,
    ignoredTaskIds: Array.isArray(rawSettings.ignoredTaskIds)
      ? rawSettings.ignoredTaskIds
          .filter((x: unknown): x is string => typeof x === 'string')
          .map((x: string) => sanitizeSingleLineText(x, 120))
          .filter(Boolean)
      : fallbackSettings.ignoredTaskIds ?? [],
    dismissedTaskGroupKeys:
      rawSettings.dismissedTaskGroupKeys &&
      typeof rawSettings.dismissedTaskGroupKeys === 'object'
        ? sanitizePlainDictionary<string | string[]>(rawSettings.dismissedTaskGroupKeys, (val) => {
            if (typeof val === 'string') return sanitizeSingleLineText(val, 200);
            if (Array.isArray(val)) {
              return val
                .filter((x): x is string => typeof x === 'string')
                .map((x) => sanitizeSingleLineText(x, 200))
                .filter(Boolean);
            }
            return undefined;
          })
        : fallbackSettings.dismissedTaskGroupKeys ?? {},
    dismissedMemoAlertSignatures:
      rawSettings.dismissedMemoAlertSignatures &&
      typeof rawSettings.dismissedMemoAlertSignatures === 'object'
        ? sanitizePlainDictionary<string>(rawSettings.dismissedMemoAlertSignatures, (val) =>
            typeof val === 'string' ? sanitizeSingleLineText(val, 200) : undefined
          )
        : fallbackSettings.dismissedMemoAlertSignatures ?? {},
    speciesHubBlockOrder:
      rawSettings.speciesHubBlockOrder &&
      typeof rawSettings.speciesHubBlockOrder === 'object'
        ? sanitizePlainDictionary(rawSettings.speciesHubBlockOrder, (val) =>
            Array.isArray(val) ? val : undefined
          )
        : fallbackSettings.speciesHubBlockOrder ?? {},
    includePhotoOnPedigree:
      typeof rawSettings.includePhotoOnPedigree === 'boolean'
        ? rawSettings.includePhotoOnPedigree
        : fallbackSettings.includePhotoOnPedigree ?? false,
    calendarSync: normalizeCalendarSyncSettings(
      rawSettings.calendarSync ?? fallbackSettings.calendarSync
    ),
    autoOffloadRetiredToOpfs:
      typeof rawSettings.autoOffloadRetiredToOpfs === 'boolean'
        ? rawSettings.autoOffloadRetiredToOpfs
        : fallbackSettings.autoOffloadRetiredToOpfs ?? false,
    updatedAt: sanitizeSingleLineText(rawSettings.updatedAt || ts, 64) || ts,
  };

  const rawSpeciesList: Record<string, any>[] = (Array.isArray(raw.speciesProfiles)
    ? raw.speciesProfiles
    : Array.isArray(raw.speciesConfigs)
    ? raw.speciesConfigs
    : []
  ).filter(isObj);

  const speciesProfiles: SpeciesProfile[] =
    rawSpeciesList.length > 0
      ? rawSpeciesList
          .map((item: any, idx: number) => {
            const maturity = finiteNonNeg(item.maturityDays, 0);
            return {
              id: safeId(item.id),
              name: sanitizeSingleLineText(item.name, 100) || 'Rabbit',
              sortOrder: finiteNum(item.sortOrder, idx),
              defaultAnimalPrefix: sanitizeSingleLineText(item.defaultAnimalPrefix || '', 40),
              preferredUnit:
                item.preferredUnit === 'lbs_oz' ||
                item.preferredUnit === 'lbs' ||
                item.preferredUnit === 'grams' ||
                item.preferredUnit === 'kg'
                  ? item.preferredUnit
                  : undefined,
              memoText: sanitizeSpeciesMemo(item.memoText),
              memoUpdatedAt: typeof item.memoUpdatedAt === 'string' ? item.memoUpdatedAt : '',
              gestationDays: finiteNonNeg(item.gestationDays, 31) || 31,
              rebreedDaysAfterBirth: finiteNonNeg(item.rebreedDaysAfterBirth, 28),
              weanDaysAfterBirth: finiteNonNeg(item.weanDaysAfterBirth, 42),
              maturityDays: maturity > 0 ? maturity : undefined,
              birthEventLabel: sanitizeSingleLineText(item.birthEventLabel, 80) || 'Kindling',
              maleLabel: sanitizeSingleLineText(item.maleLabel, 80) || 'Buck',
              femaleLabel: sanitizeSingleLineText(item.femaleLabel, 80) || 'Doe',
              offspringLabel: sanitizeSingleLineText(item.offspringLabel, 80) || 'Kit',
              exampleBreeds: Array.isArray(item.exampleBreeds)
                ? item.exampleBreeds
                    .filter((b: unknown): b is string => typeof b === 'string')
                    .map((b: string) => sanitizeSingleLineText(b, 120))
                    .filter(Boolean)
                : [],
              milestones: Array.isArray(item.milestones)
                ? item.milestones.filter(isObj).map((m: any) => ({
                    label: sanitizeSingleLineText(m.label, 120) || 'Care Check',
                    relativeTo: m.relativeTo || 'BEFORE_BIRTH',
                    daysOffset: finiteNum(m.daysOffset, 0),
                    category: (m.category as TaskCategory) || 'Care',
                    priority: (m.priority as TaskPriority) || 'Normal',
                  }))
                : [],
              createdAt: typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : ts,
              updatedAt: typeof item.updatedAt === 'string' && item.updatedAt ? item.updatedAt : ts,
            };
          })
          .sort(
            (a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || a.name.localeCompare(b.name)
          )
      : PREDEFINED_SPECIES_PRESETS.map((p, idx) => ({
          ...p,
          sortOrder: idx,
          createdAt: ts,
          updatedAt: ts,
        }));

  const animals: Animal[] = (Array.isArray(raw.animals) ? raw.animals : [])
    .filter(isObj)
    .map((a: any) => {
      const speciesName = sanitizeSingleLineText(a.species, 100) || 'Rabbit';
      const genoArray = Array.isArray(a.genotype)
        ? a.genotype.filter(isObj)
        : parseGenotypeString(
            typeof a.genotype === 'string' ? a.genotype : typeof a.genotypeRaw === 'string' ? a.genotypeRaw : '',
            speciesName
          );
      const genoStr =
        typeof a.genotypeRaw === 'string' && a.genotypeRaw
          ? sanitizeSingleLineText(a.genotypeRaw, 200)
          : typeof a.genotype === 'string'
          ? sanitizeSingleLineText(a.genotype, 200)
          : formatGenotypeArray(genoArray);

      const carriers = reconcileCarrierTraitLists(
        a.suspectedCarrierOf,
        a.confirmedCarrierOf,
        a.clearedCarrierOf
      );

      const status = normalizeAnimalStatus(a.status, a.archived);
      const birthMillis = finiteNonNeg(a.birthDateMillis, 0);

      return {
        id: safeId(a.id),
        tattoo: sanitizeSingleLineText(a.tattoo ?? a.earTag ?? '', 80),
        name: sanitizeSingleLineText(a.name, 140) || 'Unnamed',
        species: speciesName,
        breed: sanitizeSingleLineText(a.breed || '', 120),
        variety: sanitizeSingleLineText(a.variety || '', 120),
        sex: normalizeBiologicalSex(a.sex || 'Unknown'),
        status,
        archived:
          typeof a.archived === 'boolean' ? a.archived : isAnimalArchived({ status }),
        needsAttention: Boolean(a.needsAttention),
        ignoredConflicts: normalizeIgnoredConflicts(a.ignoredConflicts),
        birthDateIso:
          typeof a.birthDateIso === 'string' && a.birthDateIso
            ? a.birthDateIso
            : millisToDateIso(birthMillis),
        weightGrams: finiteNonNeg(a.weightGrams, 0),
        genotype: genoArray,
        genotypeRaw: genoStr,
        rufusLevel: normalizeRufusLevel(a.rufusLevel),
        suspectedCarrierOf: carriers.suspectedCarrierOf,
        confirmedCarrierOf: carriers.confirmedCarrierOf,
        clearedCarrierOf: carriers.clearedCarrierOf,
        registrationNumber: sanitizeSingleLineText(a.registrationNumber || '', 100),
        grandChampionNumber: sanitizeSingleLineText(a.grandChampionNumber || '', 100),
        legsCount: Math.round(finiteNonNeg(a.legsCount, 0)),
        cageLocation: sanitizeSingleLineText(a.cageLocation || '', 120),
        breederName: sanitizeSingleLineText(a.breederName || '', 140),
        ownerName: sanitizeSingleLineText(a.ownerName || '', 140),
        ownershipType: normalizeOwnershipType(a.ownershipType, 'Owned'),
        culled: Boolean(a.culled),
        cullDateIso: sanitizeSingleLineText(a.cullDateIso || '', 32),
        cullReason: sanitizeSingleLineText(a.cullReason || '', 300),
        deceasedDateIso: sanitizeSingleLineText(a.deceasedDateIso || '', 32),
        deathCause: sanitizeSingleLineText(a.deathCause || '', 300),
        soldDateIso: sanitizeSingleLineText(a.soldDateIso || '', 32),
        salePriceCents: Math.round(finiteNonNeg(a.salePriceCents, 0)),
        purchaseCostCents: Math.round(finiteNonNeg(a.purchaseCostCents, 0)),
        buyerName: sanitizeSingleLineText(a.buyerName || '', 140),
        sireId: typeof a.sireId === 'string' && isSafeRecordKey(a.sireId) ? a.sireId : '',
        damId: typeof a.damId === 'string' && isSafeRecordKey(a.damId) ? a.damId : '',
        notes: sanitizePlainText(a.notes || '', 20_000),
        offloadedArchiveKey: sanitizeSingleLineText(a.offloadedArchiveKey || '', 160) || undefined,
        offloadedAtIso: sanitizeSingleLineText(a.offloadedAtIso || '', 64) || undefined,
        createdAt: typeof a.createdAt === 'string' && a.createdAt ? a.createdAt : ts,
        updatedAt: typeof a.updatedAt === 'string' && a.updatedAt ? a.updatedAt : ts,
      };
    });

  const animalById = new Map(animals.map((a) => [a.id, a]));

  const cages: CageLocation[] = (Array.isArray(raw.cages) ? raw.cages : [])
    .filter(isObj)
    .map((c: any) => ({
      id: safeId(c.id),
      species: sanitizeSingleLineText(c.species, 100) || 'Rabbit',
      label: sanitizeSingleLineText(c.label || '', 120),
      section: sanitizeSingleLineText(c.section || '', 120),
      capacity: Math.max(1, Math.round(finiteNonNeg(c.capacity, 1))),
      notes: sanitizePlainText(c.notes || '', 10_000),
      createdAt: typeof c.createdAt === 'string' && c.createdAt ? c.createdAt : ts,
      updatedAt: typeof c.updatedAt === 'string' && c.updatedAt ? c.updatedAt : ts,
    }));

  const mapLegacyBreedingStatus = (st: string): BreedingStatus => {
    if (st === 'Confirmed Pregnant' || st === 'Palpated Positive') return 'Palpated Positive';
    if (['Kindled', 'Kidded', 'Lambed', 'Farrowed', 'Calved', 'Born'].includes(st)) return 'Born';
    if (st === 'Planned' || st === 'Weaned' || st === 'Missed') return st;
    return 'Bred';
  };

  const breedings: BreedingRecord[] = (Array.isArray(raw.breedings) ? raw.breedings : [])
    .filter(isObj)
    .map((b: any) => {
      const sireId = typeof b.sireId === 'string' && isSafeRecordKey(b.sireId) ? b.sireId : '';
      const damId = typeof b.damId === 'string' && isSafeRecordKey(b.damId) ? b.damId : '';
      const inferredSpecies =
        sanitizeSingleLineText(b.species, 100) ||
        animalById.get(damId)?.species ||
        animalById.get(sireId)?.species ||
        'Rabbit';
      return {
        id: safeId(b.id),
        species: inferredSpecies,
        sireId,
        damId,
        sireName: sanitizeSingleLineText(b.sireName, 140) || animalById.get(sireId)?.name || '',
        damName: sanitizeSingleLineText(b.damName, 140) || animalById.get(damId)?.name || '',
        bredDateIso:
          (typeof b.bredDateIso === 'string' && b.bredDateIso) ||
          millisToDateIso(finiteNonNeg(b.bredDateMillis, 0)),
        expectedDueDateIso:
          (typeof b.expectedDueDateIso === 'string' && b.expectedDueDateIso) ||
          millisToDateIso(finiteNonNeg(b.expectedDueDateMillis, 0)),
        actualBirthDateIso:
          (typeof b.actualBirthDateIso === 'string' && b.actualBirthDateIso) ||
          millisToDateIso(finiteNonNeg(b.actualKindleDateMillis, 0)),
        projectedCoiPercent: finiteNonNeg(b.projectedCoiPercent, 0),
        liveCount: Math.round(finiteNonNeg(b.liveCount, 0)),
        stillbornCount: Math.round(finiteNonNeg(b.stillbornCount, 0)),
        fosteredCount: Math.round(finiteNonNeg(b.fosteredCount, 0)),
        weanedCount: Math.round(finiteNonNeg(b.weanedCount, 0)),
        offspringCreated: Boolean(b.offspringCreated),
        status: mapLegacyBreedingStatus(String(b.status || 'Bred')),
        serviceFeeCents: Math.round(finiteNonNeg(b.serviceFeeCents, 0)),
        serviceFeeDirection: normalizeServiceFeeDirection(b.serviceFeeDirection),
        ultrasoundDateIso: sanitizeSingleLineText(b.ultrasoundDateIso || '', 32),
        ultrasoundResult: normalizeUltrasoundResult(b.ultrasoundResult),
        ultrasoundFetalCount: Math.round(finiteNonNeg(b.ultrasoundFetalCount, 0)),
        ultrasoundProjectedDueIso: sanitizeSingleLineText(b.ultrasoundProjectedDueIso || '', 32),
        notes: sanitizePlainText(b.notes || '', 20_000),
        createdAt: typeof b.createdAt === 'string' && b.createdAt ? b.createdAt : ts,
        updatedAt: typeof b.updatedAt === 'string' && b.updatedAt ? b.updatedAt : ts,
      };
    });

  const tasks: BarnTask[] = (Array.isArray(raw.tasks) ? raw.tasks : [])
    .filter(isObj)
    .map((t: any) => {
      const linkedAnimalId =
        typeof t.linkedAnimalId === 'string' && isSafeRecordKey(t.linkedAnimalId)
          ? t.linkedAnimalId
          : '';
      const inferredSpecies =
        sanitizeSingleLineText(t.species, 100) ||
        animalById.get(linkedAnimalId)?.species ||
        settings.defaultSpecies ||
        'Rabbit';
      return {
        id: safeId(t.id),
        species: inferredSpecies,
        title: sanitizeSingleLineText(t.title, 200) || 'Barn Chore',
        category: (t.category as TaskCategory) || 'Care',
        priority: (t.priority as TaskPriority) || 'Normal',
        dueDateIso:
          (typeof t.dueDateIso === 'string' && t.dueDateIso) ||
          millisToDateIso(finiteNonNeg(t.dueDateMillis, 0)),
        linkedAnimalId,
        linkedAnimalName: sanitizeSingleLineText(t.linkedAnimalName || '', 140),
        linkedBreedingId:
          typeof t.linkedBreedingId === 'string' && isSafeRecordKey(t.linkedBreedingId)
            ? t.linkedBreedingId
            : '',
        completed: Boolean(t.completed),
        createdAt: typeof t.createdAt === 'string' && t.createdAt ? t.createdAt : ts,
        updatedAt: typeof t.updatedAt === 'string' && t.updatedAt ? t.updatedAt : ts,
      };
    });

  const careLogs: CareLog[] = (Array.isArray(raw.careLogs) ? raw.careLogs : [])
    .filter(isObj)
    .map((l: any) => {
      const animalId =
        typeof l.animalId === 'string' && isSafeRecordKey(l.animalId) ? l.animalId : '';
      return {
        id: safeId(l.id),
        species:
          sanitizeSingleLineText(l.species, 100) || animalById.get(animalId)?.species || 'Rabbit',
        animalId,
        dateIso:
          (typeof l.dateIso === 'string' && l.dateIso) ||
          millisToDateIso(finiteNonNeg(l.dateMillis, 0)),
        type: (l.type as CareLogType) || 'Weight Check',
        title: sanitizeSingleLineText(l.title || '', 160),
        weightGrams: Math.round(finiteNonNeg(l.weightGrams, 0)),
        showLegEarned: Boolean(l.showLegEarned),
        medicationName: sanitizeSingleLineText(l.medicationName || '', 140),
        dosage: sanitizeSingleLineText(l.dosage || '', 100),
        administrationRoute: sanitizeSingleLineText(l.administrationRoute || '', 100),
        withdrawalDays: Math.round(finiteNonNeg(l.withdrawalDays, 0)),
        withdrawalClearDateIso: sanitizeSingleLineText(l.withdrawalClearDateIso || '', 32),
        bodyConditionScore: finiteNonNeg(l.bodyConditionScore, 0),
        famachaScore: Math.round(finiteNonNeg(l.famachaScore, 0)),
        fecalEggCount: Math.round(finiteNonNeg(l.fecalEggCount, 0)),
        ultrasoundResult: normalizeUltrasoundResult(l.ultrasoundResult),
        ultrasoundFetalCount: Math.round(finiteNonNeg(l.ultrasoundFetalCount, 0)),
        notes: sanitizePlainText(l.notes || '', 20_000),
        createdAt: typeof l.createdAt === 'string' && l.createdAt ? l.createdAt : ts,
        updatedAt: typeof l.updatedAt === 'string' && l.updatedAt ? l.updatedAt : ts,
      };
    });

  const shows: ShowEvent[] = (Array.isArray(raw.shows) ? raw.shows : [])
    .filter(isObj)
    .map((s: any) => {
      const enteredIds = Array.isArray(s.enteredAnimalIds)
        ? s.enteredAnimalIds
            .filter((x: unknown): x is string => typeof x === 'string' && isSafeRecordKey(x))
            .map((x: string) => sanitizeSingleLineText(x, 140))
            .filter(Boolean)
        : [];
      const firstEntered = enteredIds[0];
      return {
        id: safeId(s.id),
        species:
          sanitizeSingleLineText(s.species, 100) ||
          (firstEntered ? animalById.get(firstEntered)?.species : '') ||
          'Rabbit',
        name: sanitizeSingleLineText(s.name, 160) || 'Show Event',
        location: sanitizeSingleLineText(s.location || '', 160),
        sanctioningBody: sanitizeSingleLineText(s.sanctioningBody || 'ARBA', 80) || 'ARBA',
        eventDateIso:
          (typeof s.eventDateIso === 'string' && s.eventDateIso) ||
          millisToDateIso(finiteNonNeg(s.eventDateMillis, 0)),
        entryDeadlineIso:
          (typeof s.entryDeadlineIso === 'string' && s.entryDeadlineIso) ||
          millisToDateIso(finiteNonNeg(s.entryDeadlineMillis, 0)),
        enteredAnimalIds: enteredIds,
        notes: sanitizePlainText(s.notes || '', 20_000),
        createdAt: typeof s.createdAt === 'string' && s.createdAt ? s.createdAt : ts,
        updatedAt: typeof s.updatedAt === 'string' && s.updatedAt ? s.updatedAt : ts,
      };
    });

  const animalPhotos: AnimalPhoto[] = (
    Array.isArray(raw.animalPhotos) ? raw.animalPhotos : []
  )
    .map((p: any, idx: number) => {
      if (!p || typeof p !== 'object' || !p.animalId) return null;
      const safeDataUrl = sanitizeSafeRasterImageDataUrl(p.dataUrl);
      if (!safeDataUrl) return null;
      const safeThumbUrl = sanitizeSafeRasterImageDataUrl(p.thumbnailDataUrl) || safeDataUrl;
      return {
        id: sanitizeSingleLineText(p.id, 120) || generateUuid(),
        species: sanitizeSingleLineText(p.species || animalById.get(p.animalId)?.species || 'Rabbit', 100) || 'Rabbit',
        animalId: sanitizeSingleLineText(p.animalId, 120),
        isPrimary: Boolean(p.isPrimary),
        sortOrder: typeof p.sortOrder === 'number' && Number.isFinite(p.sortOrder) ? p.sortOrder : idx,
        caption: sanitizePlainText(p.caption || '', 2000),
        originalFileName: sanitizeSingleLineText(p.originalFileName || '', 260),
        mimeType: sanitizeSingleLineText(p.mimeType || 'image/webp', 80) || 'image/webp',
        width: Math.max(0, Number(p.width) || 0),
        height: Math.max(0, Number(p.height) || 0),
        originalBytes: Math.max(0, Number(p.originalBytes) || 0),
        storedBytes: Math.max(0, Number(p.storedBytes) || 0),
        thumbnailDataUrl: safeThumbUrl,
        dataUrl: safeDataUrl,
        createdAt: sanitizeSingleLineText(p.createdAt || ts, 64) || ts,
        updatedAt: sanitizeSingleLineText(p.updatedAt || ts, 64) || ts,
      } satisfies AnimalPhoto;
    })
    .filter((p: AnimalPhoto | null): p is AnimalPhoto => Boolean(p));

  return {
    settings,
    speciesProfiles,
    animals,
    animalPhotos,
    cages,
    breedings,
    tasks,
    careLogs,
    shows,
  };
}

export {
  buildCleanCsvExportFileName,
  escapeCsvCell,
  exportAnimalsCsv,
  formatParentReferenceForCsv,
  UTF8_BOM,
} from './csvExport';

export {
  buildBarnBinderFileName,
  buildDefaultBarnBinderOptions,
  computeAnimalKinshipSummary,
  generateSpeciesBarnBinderHtml,
  resolveBinderPalette,
} from './barnBinder';
export type {
  AnimalKinshipSummary,
  BarnBinderColorMode,
  BarnBinderOptions,
  BinderRelatedAnimalEntry,
  ResolvedBinderPalette,
} from './barnBinder';

function escapeHtml(raw: string): string {
  return escapeSafeHtml(raw);
}

export interface PedigreePrintOptions {
  /** Include animal & ancestor weights (default: true). */
  showWeights?: boolean;
  /** Include coat color genotype strings (default: true when omitted for API compatibility). */
  showGenotypes?: boolean;
  /** Include bottom breeder certification & signature footer (default: true). */
  showBreederFooter?: boolean;
  /** Optional breeder phone, email, or website line shown in footer when enabled. */
  breederContactLine?: string;
}

/**
 * Generates a standardized, self-contained `.HTM` multi-generation pedigree file compatible
 * with Evans Rabbit Register / ARBA breeder sharing conventions and direct PDF printing.
 * Supports 3, 4, 5, and 6 generations plus optional embedded primary portrait photo
 * and customer pedigree print customization options.
 */
export function generateEvansHtmPedigree(
  subject: Animal,
  allAnimals: Animal[],
  speciesProfiles: SpeciesProfile[],
  settings: BarnSettings,
  generations: 3 | 4 | 5 | 6 = 3,
  primaryPhotoDataUrl?: string,
  printOptions?: PedigreePrintOptions
): string {
  const sp = resolveSpeciesProfile(subject.species, speciesProfiles);
  const herdById = buildSpeciesHerdMap(allAnimals, subject.species);
  const slots = buildPedigreeSlots(subject, herdById, generations, sp);
  const coi = calculateAnimalCoi(subject, herdById);

  const showWeights = printOptions?.showWeights ?? true;
  const showGenotypes = printOptions?.showGenotypes ?? true;
  const showBreederFooter = printOptions?.showBreederFooter ?? true;
  const breederContactLine = (printOptions?.breederContactLine || '').trim();

  const slotMap = new Map<string, PedigreeSlot>();
  for (const sl of slots) {
    slotMap.set(`${sl.generation}:${sl.slotIndex}`, sl);
  }

  const compactMode = generations >= 5;

  let anyAncestorGeno = false;
  const renderAncestorCell = (gen: number, idx: number, rowspan: number): string => {
    const slot = slotMap.get(`${gen}:${idx}`);
    const a = slot?.animal;
    const roleTag = idx % 2 === 0 ? sp.maleLabel : sp.femaleLabel;
    if (!a) {
      return `<td rowspan="${rowspan}" class="cell empty">
        <div class="role">${escapeHtml(roleTag)} &mdash; Unknown</div>
      </td>`;
    }
    const geno = showGenotypes ? a.genotypeRaw || formatGenotypeArray(a.genotype) : '';
    if (showGenotypes && !compactMode && geno) {
      anyAncestorGeno = true;
    }
    const fullCarrierText = formatCompactCarrierDisclosure(a, {
      herdById,
      includeCleared: true,
    });
    const carrierText = formatCompactCarrierDisclosure(a, {
      herdById,
      includeCleared: true,
      ultraCompact: compactMode,
      maxItemsPerGroup: compactMode ? 2 : 4,
    });
    const metaParts = [
      a.tattoo ? `ID: ${escapeHtml(a.tattoo)}` : '',
      !compactMode && a.variety ? escapeHtml(a.variety) : '',
      showWeights && !compactMode && a.weightGrams > 0
        ? escapeHtml(formatWeight(a.weightGrams, resolveSpeciesWeightUnit(sp, settings)))
        : '',
    ].filter(Boolean);

    const regParts = [
      a.registrationNumber ? `Reg: ${escapeHtml(a.registrationNumber)}` : '',
      a.grandChampionNumber ? `GC: ${escapeHtml(a.grandChampionNumber)}` : '',
      a.legsCount > 0 ? `Legs: ${a.legsCount}` : '',
    ].filter(Boolean);

    return `<td rowspan="${rowspan}" class="cell ${idx % 2 === 0 ? 'sire' : 'dam'}">
      <div class="name">${escapeHtml(a.name)}</div>
      ${metaParts.length ? `<div class="meta">${metaParts.join(' &middot; ')}</div>` : ''}
      ${!compactMode && a.birthDateIso ? `<div class="meta">DOB: ${escapeHtml(formatReadableDate(a.birthDateIso))}</div>` : ''}
      ${!compactMode && regParts.length ? `<div class="meta">${regParts.join(' &middot; ')}</div>` : ''}
      ${showGenotypes && !compactMode && geno ? `<div class="geno">${escapeHtml(geno)}</div>` : ''}
      ${carrierText ? `<div class="carrier" title="${escapeHtml(fullCarrierText)}">${escapeHtml(carrierText)}</div>` : ''}
    </td>`;
  };

  const totalRows = 1 << generations;
  const tableRowsHtml: string[] = [];

  for (let r = 0; r < totalRows; r++) {
    const cells: string[] = [];
    for (let g = 1; g <= generations; g++) {
      const span = 1 << (generations - g);
      if (r % span === 0) {
        const slotIdx = Math.floor(r / span);
        cells.push(renderAncestorCell(g, slotIdx, span));
      }
    }
    tableRowsHtml.push(`<tr>${cells.join('')}</tr>`);
  }

  const subjectGeno = showGenotypes
    ? subject.genotypeRaw || formatGenotypeArray(subject.genotype)
    : '';
  const subjectCarriers = formatCompactCarrierDisclosure(subject, {
    herdById,
    includeLineage: true,
    includeCleared: true,
  });
  const safePhoto = sanitizeSafeRasterImageDataUrl(primaryPhotoDataUrl);

  const genHeaders: string[] = [
    '<th>Parents (Gen 1)</th>',
    '<th>Grandparents (Gen 2)</th>',
    '<th>Great-Grandparents (Gen 3)</th>',
  ];
  if (generations >= 4) genHeaders.push('<th>4th Generation (Gen 4)</th>');
  if (generations >= 5) genHeaders.push('<th>5th Generation (Gen 5)</th>');
  if (generations >= 6) genHeaders.push('<th>6th Generation (Gen 6)</th>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
<title>Pedigree - ${escapeHtml(subject.name)} (${escapeHtml(subject.tattoo || subject.id)})</title>
<style>
  @page { size: landscape; margin: ${compactMode ? '8mm' : '12mm'}; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: #1e241e; }
  body { font-family: Georgia, "Times New Roman", serif; margin: ${compactMode ? '8px' : '16px'}; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #2d5a3d; padding-bottom: 8px; margin-bottom: 10px; }
  .barn-title { font-size: 20px; font-weight: bold; color: #1e3f2a; }
  .sub-title { font-size: 11.5px; color: #434d42; }
  .subject-wrap { border: 1px solid #999; padding: 10px 14px; margin-bottom: 10px; background: #ffffff; display: flex; align-items: center; gap: 16px; }
  .subject-photo { width: 84px; height: 84px; object-fit: cover; border-radius: 6px; border: 1px solid #8c8678; flex-shrink: 0; }
  .subject-box { display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 12.5px; flex: 1; }
  table.pedigree { width: 100%; border-collapse: collapse; table-layout: fixed; background: #ffffff; }
  table.pedigree th { background: #ffffff; color: #1e3f2a; font-size: ${compactMode ? '10px' : '12px'}; padding: ${compactMode ? '4px' : '6px'}; text-align: left; border: 1px solid #2d5a3d; border-bottom: 2px solid #2d5a3d; }
  td.cell { border: 1px solid #b8b3a8; padding: ${compactMode ? '2px 4px' : '6px 8px'}; vertical-align: middle; font-size: ${compactMode ? '9px' : '11.5px'}; line-height: ${compactMode ? '1.15' : '1.35'}; word-break: break-word; background: #ffffff; }
  td.sire { background: #ffffff; border-left: 3px solid #366685; }
  td.dam { background: #ffffff; border-left: 3px solid #8c3f20; }
  td.empty { color: #555555; font-style: italic; background: #ffffff; }
  .name { font-weight: bold; font-size: ${compactMode ? '9.5px' : '12.5px'}; color: #111; }
  .meta { color: #333; font-family: "Courier New", monospace; font-size: ${compactMode ? '8.5px' : '10.5px'}; }
  .geno { color: #1e3f2a; font-family: "Courier New", monospace; font-size: 10px; margin-top: 2px; }
  .carrier { color: #6e3b1b; font-family: Arial, Helvetica, sans-serif; font-size: ${compactMode ? '8px' : '9.5px'}; font-weight: 600; margin-top: 2px; line-height: 1.2; }
  .genetics-notice { margin-top: 8px; font-size: 10px; color: #434d42; font-family: Arial, Helvetica, sans-serif; background: #ffffff; }
  .footer { margin-top: 12px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 16px; font-size: 11px; color: #333; border-top: 1px solid #ccc; padding-top: 8px; }
  .footer-contact { width: 100%; font-size: 10.5px; color: #1e3f2a; font-weight: bold; }
  @media print {
    :root, html, body, .header, .subject-wrap, table.pedigree, table.pedigree th, td.cell, td.sire, td.dam, td.empty, .genetics-notice, .footer {
      color-scheme: light only !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #000000 !important;
    }
    * {
      -webkit-print-color-adjust: economy !important;
      print-color-adjust: economy !important;
    }
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="barn-title">${escapeHtml(settings.barnName || 'Community Pedigree')}</div>
      <div class="sub-title">Official ${generations}-Generation ${escapeHtml(subject.species)} Pedigree Certificate${settings.breederName ? ` &middot; Breeder: ${escapeHtml(settings.breederName)}` : ''}</div>
    </div>
    <div class="sub-title">Generated ${escapeHtml(formatReadableDate(nowIsoUtc().slice(0, 10)))} &middot; Wright COI: ${coi.coiPercent.toFixed(2)}% (${escapeHtml(coi.risk.label)})</div>
  </div>

  <div class="subject-wrap">
    ${safePhoto ? `<img class="subject-photo" src="${safePhoto}" alt="${escapeHtml(subject.name)}" />` : ''}
    <div class="subject-box">
      <div><strong>Name:</strong> ${escapeHtml(subject.name)}</div>
      <div><strong>Tattoo / ID:</strong> ${escapeHtml(subject.tattoo || 'Unmarked')}</div>
      <div><strong>Breed &amp; Variety:</strong> ${escapeHtml(subject.breed)} ${escapeHtml(subject.variety)}</div>
      <div><strong>Sex:</strong> ${escapeHtml(formatSexForSpecies(subject.sex, sp))}</div>
      <div><strong>DOB:</strong> ${escapeHtml(formatReadableDate(subject.birthDateIso))}</div>
      ${showWeights ? `<div><strong>Weight:</strong> ${escapeHtml(formatWeight(subject.weightGrams, resolveSpeciesWeightUnit(sp, settings)))}</div>` : ''}
      ${subject.registrationNumber ? `<div><strong>Reg #:</strong> ${escapeHtml(subject.registrationNumber)}</div>` : ''}
      ${subject.grandChampionNumber ? `<div><strong>GC #:</strong> ${escapeHtml(subject.grandChampionNumber)}</div>` : ''}
      ${subject.legsCount > 0 ? `<div><strong>Legs:</strong> ${subject.legsCount}</div>` : ''}
      ${subject.rufusLevel ? `<div><strong>Rufus Intensity:</strong> ${escapeHtml(subject.rufusLevel)}</div>` : ''}
      ${showGenotypes && subjectGeno ? `<div><strong>Genotype:</strong> <code>${escapeHtml(subjectGeno)}</code></div>` : ''}
      ${subjectCarriers ? `<div><strong>Carrier Disclosures:</strong> ${escapeHtml(subjectCarriers)}</div>` : ''}
    </div>
  </div>

  <table class="pedigree">
    <thead>
      <tr>
        ${genHeaders.join('\n        ')}
      </tr>
    </thead>
    <tbody>
      ${tableRowsHtml.join('\n      ')}
    </tbody>
  </table>

  ${
    (showGenotypes && (Boolean(subjectGeno) || anyAncestorGeno)) || Boolean(subject.rufusLevel)
      ? `<div class="genetics-notice"><strong>Notice:</strong> Color genetics, Rufus intensity &amp; genotype calculation is under development and incomplete (unverified).</div>`
      : ''
  }

  ${
    showBreederFooter
      ? `<div class="footer">
    ${breederContactLine ? `<div class="footer-contact">${escapeHtml(breederContactLine)}</div>` : ''}
    <div>I hereby certify that this pedigree is correct to the best of my knowledge and belief.</div>
    <div>Breeder Signature: ___________________________ &nbsp;&nbsp; Date: _______________</div>
  </div>`
      : ''
  }
</body>
</html>`;
}

/**
 * Generates a timestamp suffix (`YYYY-MM-DD-HHmmss`) so emergency/pre-delete backups never overwrite prior files.
 */
export function formatTimestampedBackupSlug(date: Date = new Date(nowEpochMs())): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * Exports a single species subset as a valid `BarnDatabaseSnapshot` JSON string for targeted backups.
 */
export function exportSpeciesBackupJson(
  snapshot: BarnDatabaseSnapshot,
  speciesName: string,
  options?: { reason?: SpeciesBackupReason }
): string {
  const speciesProfile = snapshot.speciesProfiles.find((sp) =>
    isSameSpecies(sp.name, speciesName)
  );
  const animals = snapshot.animals.filter((a) => isSameSpecies(a.species, speciesName));
  const animalIds = new Set(animals.map((a) => a.id));
  const animalPhotos = (snapshot.animalPhotos ?? []).filter(
    (p) => isSameSpecies(p.species, speciesName) || animalIds.has(p.animalId)
  );
  const cages = snapshot.cages.filter((c) => isSameSpecies(c.species, speciesName));
  const breedings = snapshot.breedings.filter((b) => isSameSpecies(b.species, speciesName));
  const tasks = snapshot.tasks.filter((t) => isSameSpecies(t.species, speciesName));
  const careLogs = snapshot.careLogs.filter(
    (l) => isSameSpecies(l.species, speciesName) || animalIds.has(l.animalId)
  );
  const shows = snapshot.shows.filter((s) => isSameSpecies(s.species, speciesName));

  return exportBarnBackupJson(
    {
      settings: snapshot.settings,
      speciesProfiles: speciesProfile ? [speciesProfile] : [],
      animals,
      animalPhotos,
      cages,
      breedings,
      tasks,
      careLogs,
      shows,
    },
    {
      backupScope: 'species',
      backupReason: options?.reason || 'manual',
      targetSpecies: speciesProfile?.name || speciesName,
    }
  );
}

/**
 * Generates a compact printable Cage Card / Bluetooth Thermal Label HTML layout (e.g. 4" x 2" label).
 */
export function generateThermalCageCardHtml(
  animal: Animal,
  allAnimals: Animal[],
  speciesProfiles: SpeciesProfile[],
  settings: BarnSettings
): string {
  const sp = resolveSpeciesProfile(animal.species, speciesProfiles);
  const herdById = buildSpeciesHerdMap(allAnimals, animal.species);
  const sire = animal.sireId ? herdById.get(animal.sireId) : undefined;
  const dam = animal.damId ? herdById.get(animal.damId) : undefined;
  const geno = animal.genotypeRaw || formatGenotypeArray(animal.genotype);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
<title>Cage Card - ${escapeHtml(animal.tattoo || animal.name)}</title>
<style>
  @page { size: 4in 2.25in; margin: 0.12in; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: #000000; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 8px; }
  .card { border: 2px solid #000; padding: 8px 10px; max-width: 3.75in; background: #ffffff; color: #000000; }
  .top { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1.5px solid #000; padding-bottom: 4px; }
  .tattoo { font-family: "Courier New", monospace; font-size: 18px; font-weight: bold; }
  .cage { font-family: "Courier New", monospace; font-size: 12px; font-weight: bold; }
  .name { font-size: 15px; font-weight: bold; margin-top: 4px; }
  .row { font-size: 11px; margin-top: 3px; display: flex; justify-content: space-between; gap: 8px; }
  .mono { font-family: "Courier New", monospace; font-size: 10.5px; margin-top: 4px; }
  @media print {
    :root, html, body, .card {
      color-scheme: light only !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #000000 !important;
    }
    * {
      -webkit-print-color-adjust: economy !important;
      print-color-adjust: economy !important;
    }
  }
</style>
</head>
<body>
  <div class="card">
    <div class="top">
      <span class="tattoo">${escapeHtml(animal.tattoo || 'NO-ID')}</span>
      <span class="cage">${escapeHtml(animal.cageLocation || settings.barnName)}</span>
    </div>
    <div class="name">${escapeHtml(animal.name)}</div>
    <div class="row">
      <span>${escapeHtml(animal.breed)} ${escapeHtml(animal.variety)}</span>
      <span><strong>${escapeHtml(formatSexForSpecies(animal.sex, sp))}</strong> &middot; DOB: ${escapeHtml(animal.birthDateIso || 'N/A')}</span>
    </div>
    <div class="row">
      <span>Sire: ${escapeHtml(sire ? `${sire.name} (${sire.tattoo})` : 'Unknown')}</span>
    </div>
    <div class="row">
      <span>Dam: ${escapeHtml(dam ? `${dam.name} (${dam.tattoo})` : 'Unknown')}</span>
    </div>
    <div class="mono">
      Wt: ${escapeHtml(formatWeight(animal.weightGrams, resolveSpeciesWeightUnit(sp, settings)))}
      ${animal.registrationNumber ? ` | Reg: ${escapeHtml(animal.registrationNumber)}` : ''}
      ${geno ? ` | ${escapeHtml(geno)} (genetics in dev)` : ''}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Canonical normalized DTO projection preparing 100% of user-entered records for
 * structured JSON reporting and PDF document generation.
 */
export interface PdfReadyBarnReport {
  barnName: string;
  breederName: string;
  exportedAtIsoUtc: string;
  filterSpecies: string | null;
  totalAnimals: number;
  openTasksCount: number;
  activeBreedingsCount: number;
  animals: Array<{
    id: string;
    species: string;
    tattoo: string;
    name: string;
    sexLabel: string;
    breedAndVariety: string;
    birthDateFormatted: string;
    weightFormatted: string;
    coiPercent: string;
    genotype: string;
    carrierDisclosures: string;
    cageLocation: string;
    ownershipType: string;
    culled: boolean;
    soldDateIso: string;
    salePriceCents: number;
    deceasedDateIso: string;
    deathCause: string;
    sireSummary: string;
    damSummary: string;
  }>;
}

export function buildPdfReadyBarnSnapshot(
  snapshot: BarnDatabaseSnapshot,
  filterSpecies?: string
): PdfReadyBarnReport {
  const scopedAnimals = filterSpecies
    ? snapshot.animals.filter((a) => isSameSpecies(a.species, filterSpecies))
    : snapshot.animals;
  const scopedTasks = filterSpecies
    ? snapshot.tasks.filter((t) => isSameSpecies(t.species, filterSpecies))
    : snapshot.tasks;
  const scopedBreedings = filterSpecies
    ? snapshot.breedings.filter((b) => isSameSpecies(b.species, filterSpecies))
    : snapshot.breedings;

  const speciesCache = new Map<
    string,
    {
      sp: SpeciesProfile;
      herdMap: Map<string, Animal>;
      evalCoi: ReturnType<typeof createSpeciesCoiEvaluator>;
    }
  >();
  const getSpeciesCtx = (speciesName: string) => {
    const key = (speciesName || '').trim().toLowerCase();
    let cached = speciesCache.get(key);
    if (!cached) {
      const sp = resolveSpeciesProfile(speciesName, snapshot.speciesProfiles);
      const herdMap = buildSpeciesHerdMap(snapshot.animals, speciesName);
      const evalCoi = createSpeciesCoiEvaluator(herdMap);
      cached = { sp, herdMap, evalCoi };
      speciesCache.set(key, cached);
    }
    return cached;
  };

  return {
    barnName: snapshot.settings.barnName,
    breederName: snapshot.settings.breederName,
    exportedAtIsoUtc: nowIsoUtc(),
    filterSpecies: filterSpecies || null,
    totalAnimals: scopedAnimals.length,
    openTasksCount: scopedTasks.filter((t) => !t.completed).length,
    activeBreedingsCount: scopedBreedings.filter((b) =>
      ['Planned', 'Bred', 'Palpated Positive', 'Born'].includes(b.status)
    ).length,
    animals: scopedAnimals.map((a) => {
      const { sp, herdMap, evalCoi } = getSpeciesCtx(a.species);
      const coi = evalCoi.calculateAnimalCoi(a);
      const sire = a.sireId ? herdMap.get(a.sireId) : undefined;
      const dam = a.damId ? herdMap.get(a.damId) : undefined;
      return {
        id: a.id,
        species: a.species,
        tattoo: a.tattoo,
        name: a.name,
        sexLabel: formatSexForSpecies(a.sex, sp),
        breedAndVariety: `${a.breed} ${a.variety}`.trim(),
        birthDateFormatted: formatReadableDate(a.birthDateIso),
        weightFormatted: formatWeight(a.weightGrams, resolveSpeciesWeightUnit(sp, snapshot.settings)),
        coiPercent: `${coi.coiPercent.toFixed(2)}%`,
        genotype: a.genotypeRaw || formatGenotypeArray(a.genotype),
        carrierDisclosures: formatCompactCarrierDisclosure(a, {
          herdById: herdMap,
          includeCleared: true,
          includeLineage: true,
        }),
        cageLocation: a.cageLocation,
        ownershipType: normalizeOwnershipType(a.ownershipType, 'Owned'),
        culled: Boolean(a.culled),
        soldDateIso: a.soldDateIso || '',
        salePriceCents: a.salePriceCents || 0,
        deceasedDateIso: a.deceasedDateIso || '',
        deathCause: a.deathCause || '',
        sireSummary: sire ? `${sire.name} (${sire.tattoo})` : 'Unknown',
        damSummary: dam ? `${dam.name} (${dam.tattoo})` : 'Unknown',
      };
    }),
  };
}
