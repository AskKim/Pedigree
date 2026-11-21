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
  FeedAllocation,
  FeedAllocationTargetType,
  FeedBatch,
  formatPedigreeWeight,
  formatReadableDate,
  formatSexForSpecies,
  formatWeight,
  generateUuid,
  isAnimalArchived,
  isSameSpecies,
  millisToDateIso,
  normalizeAnimalStatus,
  normalizeBiologicalSex,
  normalizeBreedScheduleOverrides,
  normalizeCalendarSyncSettings,
  normalizeCurrencyCode,
  normalizeFeedPurgeWindowDays,
  normalizeHousingUnitType,
  normalizeIgnoredConflicts,
  normalizeLitterWeightMilestones,
  normalizeOwnershipType,
  normalizePedigreeGenerationDepth,
  normalizeRufusLevel,
  normalizeServiceFeeDirection,
  normalizeTargetWeightCurve,
  normalizeUltrasoundResult,
  normalizeWeightUnit,
  nowEpochMs,
  nowIsoUtc,
  PedigreeGenerationDepth,
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
import {
  PedigreeBorderStyleId,
  PedigreeColorPresetId,
  PedigreeLayoutPresetId,
  resolvePedigreePrintTheme,
} from './pedigreePrintStyles';
import { buildAnimalProfileDeepLink, renderQrSvg } from './qrCode';
import {
  computeAnimalShowSummary,
  mergeEnteredAnimalIdsWithResults,
  normalizeShowResults,
} from './showResults';
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
      breedOverrides: normalizeBreedScheduleOverrides(sp.breedOverrides),
      targetWeightCurve: normalizeTargetWeightCurve(sp.targetWeightCurve),
    });
  }
  for (const incSp of incoming.speciesProfiles) {
    const key = incSp.name.trim().toLowerCase();
    const prev = speciesByName.get(key);
    const cleanIncText = sanitizeSpeciesMemo(incSp.memoText);
    const cleanIncMemoTs = typeof incSp.memoUpdatedAt === 'string' ? incSp.memoUpdatedAt : '';
    const cleanIncOverrides = normalizeBreedScheduleOverrides(incSp.breedOverrides);
    const cleanIncTargetCurve = normalizeTargetWeightCurve(incSp.targetWeightCurve);

    if (!prev) {
      speciesByName.set(key, {
        ...incSp,
        memoText: cleanIncText,
        memoUpdatedAt: cleanIncMemoTs,
        breedOverrides: cleanIncOverrides,
        targetWeightCurve: cleanIncTargetCurve,
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
      speciesByName.set(key, {
        ...incSp,
        id: prev.id,
        ...winnerMemo,
        breedOverrides: cleanIncOverrides,
        targetWeightCurve:
          cleanIncTargetCurve.length > 0
            ? cleanIncTargetCurve
            : normalizeTargetWeightCurve(prev.targetWeightCurve),
      });
    } else {
      speciesByName.set(key, {
        ...prev,
        ...winnerMemo,
        targetWeightCurve:
          normalizeTargetWeightCurve(prev.targetWeightCurve).length > 0
            ? normalizeTargetWeightCurve(prev.targetWeightCurve)
            : cleanIncTargetCurve,
      });
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
  const feedBatchesRes = mergeByIdAndTimestamp(
    local.feedBatches ?? [],
    incoming.feedBatches ?? []
  );
  const feedAllocationsRes = mergeByIdAndTimestamp(
    local.feedAllocations ?? [],
    incoming.feedAllocations ?? []
  );

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
      feedBatches: feedBatchesRes.merged,
      feedAllocations: feedAllocationsRes.merged,
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

const JSON_STREAM_CHUNK_TARGET_CHARS = 64 * 1024;

function buildBarnBackupEnvelopeContext(
  snapshot: BarnDatabaseSnapshot,
  extraMeta?: {
    backupScope?: 'barn' | 'species';
    backupReason?: SpeciesBackupReason;
    targetSpecies?: string;
  }
) {
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
  const headerPayload = {
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
        feedBatches: (snapshot.feedBatches ?? []).length,
        feedAllocations: (snapshot.feedAllocations ?? []).length,
      },
      bySpecies: Array.from(bySpeciesMap.values()),
    },
    settings: snapshot.settings,
  };

  return {
    headerPayload,
    exportedSpeciesProfiles,
    sortedAnimals,
  };
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
  const { headerPayload, exportedSpeciesProfiles, sortedAnimals } =
    buildBarnBackupEnvelopeContext(snapshot, extraMeta);

  const payload = {
    ...headerPayload,
    speciesProfiles: exportedSpeciesProfiles,
    animals: sortedAnimals,
    animalPhotos: snapshot.animalPhotos ?? [],
    cages: snapshot.cages,
    breedings: snapshot.breedings,
    tasks: snapshot.tasks,
    careLogs: snapshot.careLogs,
    shows: snapshot.shows,
    feedBatches: snapshot.feedBatches ?? [],
    feedAllocations: snapshot.feedAllocations ?? [],
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Streams a full JSON v5 backup incrementally in bounded (~64 KB) string chunks so large
 * photo-inclusive backups never materialize a monolithic string in JS heap beforehand.
 */
export function* generateBarnBackupJsonChunks(
  snapshot: BarnDatabaseSnapshot,
  extraMeta?: {
    backupScope?: 'barn' | 'species';
    backupReason?: SpeciesBackupReason;
    targetSpecies?: string;
  },
  chunkTargetChars: number = JSON_STREAM_CHUNK_TARGET_CHARS
): Generator<string, void, unknown> {
  const targetChars = Math.max(4096, chunkTargetChars);
  const { headerPayload, exportedSpeciesProfiles, sortedAnimals } =
    buildBarnBackupEnvelopeContext(snapshot, extraMeta);

  const headerJson = JSON.stringify(headerPayload, null, 2);
  let buffer = headerJson.slice(0, -1).trimEnd() + ',\n';

  const sections: ReadonlyArray<{ key: string; items: readonly unknown[] }> = [
    { key: 'speciesProfiles', items: exportedSpeciesProfiles },
    { key: 'animals', items: sortedAnimals },
    { key: 'animalPhotos', items: snapshot.animalPhotos ?? [] },
    { key: 'cages', items: snapshot.cages },
    { key: 'breedings', items: snapshot.breedings },
    { key: 'tasks', items: snapshot.tasks },
    { key: 'careLogs', items: snapshot.careLogs },
    { key: 'shows', items: snapshot.shows },
    { key: 'feedBatches', items: snapshot.feedBatches ?? [] },
    { key: 'feedAllocations', items: snapshot.feedAllocations ?? [] },
  ];

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const { key, items } = sections[sIdx];
    const isLastSection = sIdx === sections.length - 1;
    const sectionTrailer = isLastSection ? '\n' : ',\n';

    if (items.length === 0) {
      buffer += `  ${JSON.stringify(key)}: []${sectionTrailer}`;
      if (buffer.length >= targetChars) {
        yield buffer;
        buffer = '';
      }
      continue;
    }

    buffer += `  ${JSON.stringify(key)}: [\n`;
    for (let i = 0; i < items.length; i++) {
      const rawItem = JSON.stringify(items[i], null, 2) ?? 'null';
      const indentedItem = `    ${rawItem.replace(/\n/g, '\n    ')}`;
      buffer += indentedItem;
      buffer += i < items.length - 1 ? ',\n' : '\n';
      if (buffer.length >= targetChars) {
        yield buffer;
        buffer = '';
      }
    }
    buffer += `  ]${sectionTrailer}`;
    if (buffer.length >= targetChars) {
      yield buffer;
      buffer = '';
    }
  }

  buffer += '}';
  if (buffer.length > 0) {
    yield buffer;
  }
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
    breederLogoDataUrl:
      rawSettings.breederLogoDataUrl === ''
        ? undefined
        : sanitizeSafeRasterImageDataUrl(rawSettings.breederLogoDataUrl) ||
          fallbackSettings.breederLogoDataUrl,
    calendarSync: normalizeCalendarSyncSettings(
      rawSettings.calendarSync ?? fallbackSettings.calendarSync
    ),
    autoOffloadRetiredToOpfs:
      typeof rawSettings.autoOffloadRetiredToOpfs === 'boolean'
        ? rawSettings.autoOffloadRetiredToOpfs
        : fallbackSettings.autoOffloadRetiredToOpfs ?? false,
    feedTagPurgeWindowDays: normalizeFeedPurgeWindowDays(
      rawSettings.feedTagPurgeWindowDays,
      fallbackSettings.feedTagPurgeWindowDays ?? 60
    ),
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
              breedOverrides: normalizeBreedScheduleOverrides(
                Array.isArray(item.breedOverrides)
                  ? item.breedOverrides.filter(isObj).map((ov: any) => ({
                      ...ov,
                      breed: sanitizeSingleLineText(ov.breed, 120),
                      milestoneOverrides: Array.isArray(ov.milestoneOverrides)
                        ? ov.milestoneOverrides.filter(isObj).map((mo: any) => ({
                            label: sanitizeSingleLineText(mo.label, 120),
                            daysOffset: mo.daysOffset,
                          }))
                        : undefined,
                    }))
                  : []
              ),
              targetWeightCurve: normalizeTargetWeightCurve(item.targetWeightCurve),
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
    .map((c: any) => {
      const unitType = normalizeHousingUnitType(c.unitType);
      const feedLotName = sanitizeSingleLineText(c.feedLotName || '', 120);
      const feedStockRemaining = finiteNonNeg(c.feedStockRemaining, 0);
      const feedStockUnit = sanitizeSingleLineText(c.feedStockUnit || '', 30);
      const dailyRationNote = sanitizeSingleLineText(c.dailyRationNote || '', 120);
      const feedLowThreshold = finiteNonNeg(c.feedLowThreshold, 0);
      const maintenanceIntervalDays = Math.min(
        3650,
        Math.round(finiteNonNeg(c.maintenanceIntervalDays, 0))
      );
      const maintenanceTaskLabel = sanitizeSingleLineText(c.maintenanceTaskLabel || '', 120);
      const rawLastMaint =
        typeof c.lastMaintenanceDateIso === 'string' ? c.lastMaintenanceDateIso.trim() : '';
      const lastMaintenanceDateIso = /^\d{4}-\d{2}-\d{2}$/.test(rawLastMaint) ? rawLastMaint : '';

      return {
        id: safeId(c.id),
        species: sanitizeSingleLineText(c.species, 100) || 'Rabbit',
        label: sanitizeSingleLineText(c.label || '', 120),
        section: sanitizeSingleLineText(c.section || '', 120),
        capacity: Math.max(1, Math.round(finiteNonNeg(c.capacity, 1))),
        notes: sanitizePlainText(c.notes || '', 10_000),
        ...(unitType ? { unitType } : {}),
        ...(feedLotName ? { feedLotName } : {}),
        ...(feedStockRemaining > 0 ? { feedStockRemaining } : {}),
        ...(feedStockUnit ? { feedStockUnit } : {}),
        ...(dailyRationNote ? { dailyRationNote } : {}),
        ...(feedLowThreshold > 0 ? { feedLowThreshold } : {}),
        ...(maintenanceIntervalDays > 0 ? { maintenanceIntervalDays } : {}),
        ...(maintenanceTaskLabel ? { maintenanceTaskLabel } : {}),
        ...(lastMaintenanceDateIso ? { lastMaintenanceDateIso } : {}),
        createdAt: typeof c.createdAt === 'string' && c.createdAt ? c.createdAt : ts,
        updatedAt: typeof c.updatedAt === 'string' && c.updatedAt ? c.updatedAt : ts,
      };
    });

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
        litterWeightMilestones: normalizeLitterWeightMilestones(b.litterWeightMilestones),
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
      const cleanResults = normalizeShowResults(s.results, { dropEmpty: false });
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
        enteredAnimalIds: mergeEnteredAnimalIdsWithResults(enteredIds, cleanResults),
        results: cleanResults.length > 0 ? cleanResults : undefined,
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

  const feedBatches: FeedBatch[] = (Array.isArray(raw.feedBatches) ? raw.feedBatches : [])
    .filter(isObj)
    .map((f: any) => {
      const safeTagPhoto = sanitizeSafeRasterImageDataUrl(f.tagPhotoDataUrl) || undefined;
      const safeTagThumb =
        sanitizeSafeRasterImageDataUrl(f.tagPhotoThumbnailDataUrl) || safeTagPhoto || undefined;
      const rawCapDate =
        typeof f.tagPhotoCapturedDateIso === 'string' ? f.tagPhotoCapturedDateIso.trim() : '';
      const rawMfgDate =
        typeof f.manufactureDateIso === 'string' ? f.manufactureDateIso.trim() : '';
      const rawPurchaseDate =
        typeof f.purchaseDateIso === 'string' ? f.purchaseDateIso.trim() : '';
      return {
        id: safeId(f.id),
        species: sanitizeSingleLineText(f.species, 100) || 'Rabbit',
        brand: sanitizeSingleLineText(f.brand || '', 140),
        productName: sanitizeSingleLineText(f.productName || '', 180) || 'Feed Batch',
        lotNumber: sanitizeSingleLineText(f.lotNumber || '', 80),
        millCode: sanitizeSingleLineText(f.millCode || '', 80),
        manufactureDateIso: /^\d{4}-\d{2}-\d{2}$/.test(rawMfgDate) ? rawMfgDate : '',
        purchaseDateIso: /^\d{4}-\d{2}-\d{2}$/.test(rawPurchaseDate)
          ? rawPurchaseDate
          : todayDateIso(),
        bagCount: finiteNonNeg(f.bagCount, 0),
        bagWeightValue: finiteNonNeg(f.bagWeightValue, 0),
        bagWeightUnit: sanitizeSingleLineText(f.bagWeightUnit || 'lbs', 30) || 'lbs',
        totalQuantity: finiteNonNeg(f.totalQuantity, 0),
        remainingQuantity: finiteNonNeg(f.remainingQuantity, 0),
        lowStockThreshold: finiteNonNeg(f.lowStockThreshold, 0),
        totalCostCents:
          f.totalCostCents !== undefined ? Math.round(finiteNonNeg(f.totalCostCents, 0)) : undefined,
        supplierName: sanitizeSingleLineText(f.supplierName || '', 160),
        proteinPercent:
          f.proteinPercent !== undefined && finiteNonNeg(f.proteinPercent, 0) > 0
            ? finiteNonNeg(f.proteinPercent, 0)
            : undefined,
        notes: sanitizePlainText(f.notes || '', 20_000),
        ...(safeTagPhoto ? { tagPhotoDataUrl: safeTagPhoto } : {}),
        ...(safeTagThumb ? { tagPhotoThumbnailDataUrl: safeTagThumb } : {}),
        ...(f.tagPhotoMimeType ? { tagPhotoMimeType: sanitizeSingleLineText(f.tagPhotoMimeType, 80) } : {}),
        ...(finiteNonNeg(f.tagPhotoBytes, 0) > 0 ? { tagPhotoBytes: finiteNonNeg(f.tagPhotoBytes, 0) } : {}),
        ...( /^\d{4}-\d{2}-\d{2}$/.test(rawCapDate) ? { tagPhotoCapturedDateIso: rawCapDate } : {}),
        ...(typeof f.tagPhotoPurgedAtIso === 'string' && f.tagPhotoPurgedAtIso
          ? { tagPhotoPurgedAtIso: sanitizeSingleLineText(f.tagPhotoPurgedAtIso, 64) }
          : {}),
        ...(finiteNonNeg(f.tagPhotoBytesReclaimed, 0) > 0
          ? { tagPhotoBytesReclaimed: finiteNonNeg(f.tagPhotoBytesReclaimed, 0) }
          : {}),
        ...(typeof f.ocrRawText === 'string' && f.ocrRawText
          ? { ocrRawText: sanitizePlainText(f.ocrRawText, 6000) }
          : {}),
        ...(f.ocrConfidence !== undefined && Number.isFinite(Number(f.ocrConfidence))
          ? { ocrConfidence: Math.max(0, Math.min(100, Number(f.ocrConfidence))) }
          : {}),
        ...(f.ocrManualOverride ? { ocrManualOverride: true } : {}),
        ...(f.recallFlagged ? { recallFlagged: true } : {}),
        ...(f.recallNote ? { recallNote: sanitizePlainText(f.recallNote, 1000) } : {}),
        ...(typeof f._rev === 'number' && Number.isFinite(f._rev) ? { _rev: Math.floor(f._rev) } : {}),
        createdAt: typeof f.createdAt === 'string' && f.createdAt ? f.createdAt : ts,
        updatedAt: typeof f.updatedAt === 'string' && f.updatedAt ? f.updatedAt : ts,
      } satisfies FeedBatch;
    });

  const feedAllocations: FeedAllocation[] = (
    Array.isArray(raw.feedAllocations) ? raw.feedAllocations : []
  )
    .filter(isObj)
    .map((fa: any) => {
      const targetType: FeedAllocationTargetType =
        fa.targetType === 'cage' ||
        fa.targetType === 'litter' ||
        fa.targetType === 'animal'
          ? fa.targetType
          : 'general';
      const rawDate = typeof fa.dateIso === 'string' ? fa.dateIso.trim() : '';
      return {
        id: safeId(fa.id),
        species: sanitizeSingleLineText(fa.species, 100) || 'Rabbit',
        feedBatchId: typeof fa.feedBatchId === 'string' && isSafeRecordKey(fa.feedBatchId) ? fa.feedBatchId : '',
        targetType,
        targetId: typeof fa.targetId === 'string' && isSafeRecordKey(fa.targetId) ? fa.targetId : '',
        targetLabel: sanitizeSingleLineText(fa.targetLabel || '', 160),
        dateIso: /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayDateIso(),
        quantity: finiteNonNeg(fa.quantity, 0),
        unit: sanitizeSingleLineText(fa.unit || 'lbs', 30) || 'lbs',
        notes: sanitizePlainText(fa.notes || '', 5000),
        ...(typeof fa._rev === 'number' && Number.isFinite(fa._rev) ? { _rev: Math.floor(fa._rev) } : {}),
        createdAt: typeof fa.createdAt === 'string' && fa.createdAt ? fa.createdAt : ts,
        updatedAt: typeof fa.updatedAt === 'string' && fa.updatedAt ? fa.updatedAt : ts,
      } satisfies FeedAllocation;
    });

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
    feedBatches,
    feedAllocations,
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

export type PedigreePrintOrientation = 'landscape' | 'portrait';

export interface PedigreePrintOptions {
  /** Page orientation for 8.5" x 11" printing & PDF export (default: 'landscape'). */
  orientation?: PedigreePrintOrientation;
  /** Include animal & ancestor weights (default: true). */
  showWeights?: boolean;
  /** Format weights using traditional ARBA `lbs.oz` decimal dot notation (e.g., `10.04`). */
  arbaLbsOzDotNotation?: boolean;
  /** Include coat color genotype strings (default: true when omitted for API compatibility). */
  showGenotypes?: boolean;
  /** Include bottom breeder certification & signature footer (default: true). */
  showBreederFooter?: boolean;
  /** Optional breeder phone, email, or website line shown in footer when enabled. */
  breederContactLine?: string;
  /** Include breeder/rabbitry logo in header block when available (default: true). */
  showBreederLogo?: boolean;
  /** Optional per-preview override logo raster data URL (defaults to `settings.breederLogoDataUrl`). */
  breederLogoDataUrl?: string;
  /** Print accent palette preset (all paper backgrounds remain strict `#FFFFFF`). */
  colorPreset?: PedigreeColorPresetId;
  /** Pedigree framing and border style preset. */
  borderStyle?: PedigreeBorderStyleId;
  /** Pedigree header & density layout preset. */
  layoutPreset?: PedigreeLayoutPresetId;
  /** Optional species shows & careLogs so pedigree certificates auto-surface show honors & GC progress. */
  shows?: ShowEvent[];
  careLogs?: CareLog[];
}

/**
 * Generates a standardized, self-contained `.HTM` multi-generation pedigree file compatible
 * with Evans Rabbit Register / ARBA breeder sharing conventions and direct PDF printing.
 * Supports 3 through 8 generations, Landscape/Portrait 8.5"x11" sizing, customizable print
 * border/color/layout presets, optional breeder logo, ARBA `lbs.oz` dot weight notation,
 * and embedded primary portrait photo.
 */
export function generateEvansHtmPedigree(
  subject: Animal,
  allAnimals: Animal[],
  speciesProfiles: SpeciesProfile[],
  settings: BarnSettings,
  generations: PedigreeGenerationDepth = 3,
  primaryPhotoDataUrl?: string,
  printOptions?: PedigreePrintOptions
): string {
  const depth = normalizePedigreeGenerationDepth(generations, 3);
  const sp = resolveSpeciesProfile(subject.species, speciesProfiles);
  const herdById = buildSpeciesHerdMap(allAnimals, subject.species);
  const slots = buildPedigreeSlots(subject, herdById, depth, sp);
  const coi = calculateAnimalCoi(subject, herdById);
  const theme = resolvePedigreePrintTheme(printOptions, settings.customColors);

  const orientation: PedigreePrintOrientation =
    printOptions?.orientation === 'portrait' ? 'portrait' : 'landscape';
  const isPortrait = orientation === 'portrait';
  const showWeights = printOptions?.showWeights ?? true;
  const arbaLbsOzDotNotation = Boolean(printOptions?.arbaLbsOzDotNotation);
  const showGenotypes = printOptions?.showGenotypes ?? true;
  const showBreederFooter = printOptions?.showBreederFooter ?? true;
  const breederContactLine = (printOptions?.breederContactLine || '').trim();
  const showBreederLogo = printOptions?.showBreederLogo ?? true;
  const rawLogoUrl =
    printOptions?.breederLogoDataUrl !== undefined
      ? printOptions.breederLogoDataUrl
      : settings.breederLogoDataUrl;
  const safeLogo = showBreederLogo ? sanitizeSafeRasterImageDataUrl(rawLogoUrl) : '';
  const effectiveWeightUnit = resolveSpeciesWeightUnit(sp, settings);

  const slotMap = new Map<string, PedigreeSlot>();
  for (const sl of slots) {
    slotMap.set(`${sl.generation}:${sl.slotIndex}`, sl);
  }

  const ultraCompactMode = depth >= 7;
  const compactMode = depth >= 5 || theme.layoutPreset === 'compact_ledger';
  const tightMode = compactMode || (isPortrait && depth >= 4);
  const isShowCert = theme.layoutPreset === 'show_certificate';
  const preserveColorInk =
    theme.colorPreset !== 'classic_sage' && !theme.isMonochrome;

  let anyAncestorGeno = false;
  const renderAncestorCell = (gen: number, idx: number, rowspan: number): string => {
    const slot = slotMap.get(`${gen}:${idx}`);
    const a = slot?.animal;
    const roleTag = idx % 2 === 0 ? sp.maleLabel : sp.femaleLabel;
    const isTinyLeaf = ultraCompactMode && rowspan <= 2;
    if (!a) {
      return `<td rowspan="${rowspan}" class="cell empty${isTinyLeaf ? ' leaf' : ''}">
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
    const carrierText = isTinyLeaf
      ? ''
      : formatCompactCarrierDisclosure(a, {
          herdById,
          includeCleared: true,
          ultraCompact: compactMode,
          maxItemsPerGroup: compactMode ? 2 : 4,
        });
    const metaParts = [
      a.tattoo ? `ID: ${escapeHtml(a.tattoo)}` : '',
      !compactMode && a.variety ? escapeHtml(a.variety) : '',
      showWeights && !compactMode && a.weightGrams > 0
        ? escapeHtml(formatPedigreeWeight(a.weightGrams, effectiveWeightUnit, arbaLbsOzDotNotation))
        : '',
    ].filter(Boolean);

    const ancShowSummary =
      (printOptions?.shows?.length || 0) > 0 || (printOptions?.careLogs?.length || 0) > 0
        ? computeAnimalShowSummary(a, printOptions?.shows ?? [], printOptions?.careLogs ?? [])
        : null;
    const ancLegs = ancShowSummary ? ancShowSummary.effectiveLegs : a.legsCount;
    const regParts = [
      a.registrationNumber ? `Reg: ${escapeHtml(a.registrationNumber)}` : '',
      a.grandChampionNumber ? `GC: ${escapeHtml(a.grandChampionNumber)}` : '',
      ancLegs > 0 ? `Legs: ${ancLegs}` : '',
      ancShowSummary?.awardsSummaryText ? escapeHtml(ancShowSummary.awardsSummaryText) : '',
    ].filter(Boolean);

    if (isTinyLeaf) {
      return `<td rowspan="${rowspan}" class="cell leaf ${idx % 2 === 0 ? 'sire' : 'dam'}">
      <div class="name">${escapeHtml(a.name)}${a.tattoo ? ` <span class="meta">(${escapeHtml(a.tattoo)})</span>` : ''}</div>
    </td>`;
    }

    return `<td rowspan="${rowspan}" class="cell ${idx % 2 === 0 ? 'sire' : 'dam'}">
      <div class="name">${escapeHtml(a.name)}</div>
      ${metaParts.length ? `<div class="meta">${metaParts.join(' &middot; ')}</div>` : ''}
      ${!compactMode && a.birthDateIso ? `<div class="meta">DOB: ${escapeHtml(formatReadableDate(a.birthDateIso))}</div>` : ''}
      ${!compactMode && regParts.length ? `<div class="meta">${regParts.join(' &middot; ')}</div>` : ''}
      ${showGenotypes && !compactMode && geno ? `<div class="geno">${escapeHtml(geno)}</div>` : ''}
      ${carrierText ? `<div class="carrier" title="${escapeHtml(fullCarrierText)}">${escapeHtml(carrierText)}</div>` : ''}
    </td>`;
  };

  const totalRows = 1 << depth;
  const tableRowsHtml: string[] = [];

  for (let r = 0; r < totalRows; r++) {
    const cells: string[] = [];
    for (let g = 1; g <= depth; g++) {
      const span = 1 << (depth - g);
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
  if (depth >= 4) genHeaders.push('<th>4th Generation (Gen 4)</th>');
  if (depth >= 5) genHeaders.push('<th>5th Generation (Gen 5)</th>');
  if (depth >= 6) genHeaders.push('<th>6th Generation (Gen 6)</th>');
  if (depth >= 7) genHeaders.push('<th>7th Generation (Gen 7)</th>');
  if (depth >= 8) genHeaders.push('<th>8th Generation (Gen 8)</th>');

  const pageWidthCss = isPortrait ? '8.5in' : '11in';
  const frameCss =
    theme.borderStyle === 'double_frame'
      ? `border: 4px double ${theme.borderHex}; padding: ${ultraCompactMode ? '8px' : '12px'}; background: #ffffff;`
      : theme.borderStyle === 'modern_rounded'
      ? `border: 1.5px solid ${theme.borderHex}; border-radius: 12px; padding: ${ultraCompactMode ? '8px' : '12px'}; background: #ffffff;`
      : 'background: #ffffff;';
  const subjectBorderCss =
    theme.borderStyle === 'modern_rounded'
      ? `border: 1.5px solid ${theme.borderHex}; border-radius: 8px;`
      : theme.borderStyle === 'minimal_lines'
      ? `border: 1px solid ${theme.cellBorderHex};`
      : `border: 1px solid ${theme.borderHex};`;
  const cellBorderCss =
    theme.borderStyle === 'minimal_lines'
      ? `0.75px solid ${theme.cellBorderHex}`
      : `1px solid ${theme.cellBorderHex}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
<meta name="barn-page-orientation" content="${orientation}" />
<meta name="barn-preserve-accent-ink" content="${preserveColorInk ? 'true' : 'false'}" />
<title>Pedigree - ${escapeHtml(subject.name)} (${escapeHtml(subject.tattoo || subject.id)})</title>
<style>
  @page { size: letter ${orientation}; margin: ${ultraCompactMode ? '6mm' : compactMode ? '8mm' : isPortrait ? '10mm' : '12mm'}; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: ${theme.inkHex}; }
  body { font-family: Georgia, "Times New Roman", serif; margin: ${ultraCompactMode ? '6px' : compactMode ? '8px' : '16px'}; max-width: ${pageWidthCss}; }
  .pedigree-frame { ${frameCss} }
  .header { display: flex; ${isShowCert ? 'flex-direction: column; align-items: center; text-align: center;' : 'justify-content: space-between; align-items: flex-end;'} gap: ${isShowCert ? '4px' : '12px'}; border-bottom: ${theme.borderStyle === 'minimal_lines' ? '1px' : '2px'} solid ${theme.borderHex}; padding-bottom: ${theme.layoutPreset === 'compact_ledger' ? '5px' : '8px'}; margin-bottom: ${theme.layoutPreset === 'compact_ledger' ? '6px' : '10px'}; }
  .header-brand { display: flex; align-items: center; gap: 10px; min-width: 0; ${isShowCert ? 'justify-content: center;' : ''} }
  .barn-logo { max-height: ${compactMode ? '36px' : '52px'}; max-width: ${compactMode ? '96px' : '140px'}; width: auto; height: auto; object-fit: contain; border-radius: 4px; flex-shrink: 0; }
  .barn-title { font-size: ${isShowCert ? (isPortrait ? '20px' : '22px') : theme.layoutPreset === 'compact_ledger' ? '16px' : isPortrait ? '18px' : '20px'}; font-weight: bold; color: ${theme.primaryHex}; letter-spacing: ${isShowCert ? '0.02em' : 'normal'}; }
  .sub-title { font-size: ${ultraCompactMode || theme.layoutPreset === 'compact_ledger' ? '10px' : isPortrait ? '10.5px' : '11.5px'}; color: ${theme.mutedInkHex}; }
  .subject-wrap { ${subjectBorderCss} padding: ${theme.layoutPreset === 'compact_ledger' ? '5px 9px' : isPortrait ? '8px 11px' : '10px 14px'}; margin-bottom: ${theme.layoutPreset === 'compact_ledger' ? '6px' : '10px'}; background: #ffffff; display: flex; align-items: center; gap: ${isPortrait ? '12px' : '16px'}; }
  .subject-photo { width: ${theme.layoutPreset === 'compact_ledger' ? '58px' : isPortrait ? '72px' : '84px'}; height: ${theme.layoutPreset === 'compact_ledger' ? '58px' : isPortrait ? '72px' : '84px'}; object-fit: cover; border-radius: 6px; border: 1px solid ${theme.cellBorderHex}; flex-shrink: 0; }
  .subject-box { display: flex; flex-wrap: wrap; gap: ${theme.layoutPreset === 'compact_ledger' ? '4px 12px' : isPortrait ? '6px 14px' : '8px 18px'}; font-size: ${theme.layoutPreset === 'compact_ledger' ? '10.5px' : isPortrait ? '11.5px' : '12.5px'}; flex: 1; }
  table.pedigree { width: 100%; border-collapse: collapse; table-layout: fixed; background: #ffffff; }
  table.pedigree thead { display: table-header-group; }
  table.pedigree tr { break-inside: avoid; page-break-inside: avoid; }
  table.pedigree th { background: #ffffff; color: ${theme.primaryHex}; font-size: ${ultraCompactMode ? '8px' : tightMode ? '9.5px' : '12px'}; padding: ${ultraCompactMode ? '3px' : tightMode ? '4px' : '6px'}; text-align: left; border: ${cellBorderCss}; border-bottom: ${theme.borderStyle === 'minimal_lines' ? '1.5px' : '2px'} solid ${theme.borderHex}; }
  td.cell { border: ${cellBorderCss}; padding: ${ultraCompactMode ? '1px 3px' : compactMode ? '2px 4px' : tightMode ? '4px 5px' : '6px 8px'}; vertical-align: middle; font-size: ${ultraCompactMode ? '7.2px' : compactMode ? '8.5px' : tightMode ? '10px' : '11.5px'}; line-height: ${ultraCompactMode ? '1.08' : compactMode ? '1.15' : '1.3'}; word-break: break-word; background: #ffffff; break-inside: avoid; page-break-inside: avoid; }
  td.cell.leaf { padding: 1px 3px; font-size: 6.8px; line-height: 1.05; }
  td.sire { background: #ffffff; border-left: ${ultraCompactMode ? '2px' : '3px'} solid ${theme.sireHex}; }
  td.dam { background: #ffffff; border-left: ${ultraCompactMode ? '2px' : '3px'} solid ${theme.damHex}; }
  td.empty { color: #555555; font-style: italic; background: #ffffff; }
  .name { font-weight: bold; font-size: ${ultraCompactMode ? '7.5px' : compactMode ? '9px' : tightMode ? '11px' : '12.5px'}; color: #111; }
  td.cell.leaf .name { font-size: 7px; }
  .meta { color: #333; font-family: "Courier New", monospace; font-size: ${ultraCompactMode ? '6.8px' : compactMode ? '8px' : tightMode ? '9.5px' : '10.5px'}; }
  .geno { color: ${theme.primaryHex}; font-family: "Courier New", monospace; font-size: ${tightMode ? '9px' : '10px'}; margin-top: 2px; }
  .carrier { color: ${theme.accentHex}; font-family: Arial, Helvetica, sans-serif; font-size: ${compactMode ? '8px' : '9.5px'}; font-weight: 600; margin-top: 2px; line-height: 1.2; }
  .genetics-notice { margin-top: 8px; font-size: 10px; color: ${theme.mutedInkHex}; font-family: Arial, Helvetica, sans-serif; background: #ffffff; }
  .footer { margin-top: 10px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 16px; font-size: 11px; color: #333; border-top: 1px solid ${theme.cellBorderHex}; padding-top: 8px; background: #ffffff; }
  .footer-contact { width: 100%; font-size: 10.5px; color: ${theme.primaryHex}; font-weight: bold; }
  @media print {
    body { max-width: none; margin: 0; }
    :root, html, body, .pedigree-frame, .header, .subject-wrap, table.pedigree, table.pedigree th, td.cell, td.sire, td.dam, td.empty, .genetics-notice, .footer {
      color-scheme: light only !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      ${preserveColorInk ? '' : 'color: #000000 !important;'}
    }
    * {
      -webkit-print-color-adjust: ${preserveColorInk ? 'exact' : 'economy'} !important;
      print-color-adjust: ${preserveColorInk ? 'exact' : 'economy'} !important;
    }
  }
</style>
</head>
<body>
  <div class="pedigree-frame">
    <div class="header">
      <div class="header-brand">
        ${safeLogo ? `<img class="barn-logo" src="${safeLogo}" alt="${escapeHtml(settings.barnName || 'Barn Logo')}" />` : ''}
        <div>
          <div class="barn-title">${escapeHtml(settings.barnName || 'Community Pedigree')}</div>
          <div class="sub-title">Official ${depth}-Generation ${escapeHtml(subject.species)} Pedigree Certificate${settings.breederName ? ` &middot; Breeder: ${escapeHtml(settings.breederName)}` : ''}</div>
        </div>
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
        ${showWeights ? `<div><strong>Weight:</strong> ${escapeHtml(formatPedigreeWeight(subject.weightGrams, effectiveWeightUnit, arbaLbsOzDotNotation))}</div>` : ''}
        ${subject.registrationNumber ? `<div><strong>Reg #:</strong> ${escapeHtml(subject.registrationNumber)}</div>` : ''}
        ${subject.grandChampionNumber ? `<div><strong>GC #:</strong> ${escapeHtml(subject.grandChampionNumber)}</div>` : ''}
        ${(() => {
          const subjShow = computeAnimalShowSummary(
            subject,
            printOptions?.shows ?? [],
            printOptions?.careLogs ?? []
          );
          const legDisplay = subjShow.effectiveLegs;
          const parts: string[] = [];
          if (legDisplay > 0 || subjShow.showsEntered > 0) {
            parts.push(`<div><strong>Legs / GC:</strong> ${escapeHtml(subjShow.gcProgress.shortLabel)}</div>`);
          }
          if (subjShow.awardsSummaryText) {
            parts.push(`<div><strong>Show Wins:</strong> ${escapeHtml(subjShow.awardsSummaryText)}</div>`);
          }
          if (subjShow.totalPoints > 0) {
            parts.push(`<div><strong>Show Points:</strong> ${subjShow.totalPoints}</div>`);
          }
          return parts.join('\n        ');
        })()}
        ${subject.rufusLevel ? `<div><strong>Rufus Intensity:</strong> ${escapeHtml(subject.rufusLevel)}</div>` : ''}
        ${showGenotypes && subjectGeno ? `<div><strong>Genotype:</strong> <code>${escapeHtml(subjectGeno)}</code></div>` : ''}
        ${subjectCarriers ? `<div><strong>Carrier Disclosures:</strong> ${escapeHtml(subjectCarriers)}</div>` : ''}
      </div>
    </div>

    <table class="pedigree">
      <thead>
        <tr>
          ${genHeaders.join('\n          ')}
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml.join('\n        ')}
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
  </div>
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
  const feedBatches = (snapshot.feedBatches ?? []).filter((f) =>
    isSameSpecies(f.species, speciesName)
  );
  const feedAllocations = (snapshot.feedAllocations ?? []).filter((fa) =>
    isSameSpecies(fa.species, speciesName)
  );

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
      feedBatches,
      feedAllocations,
    },
    {
      backupScope: 'species',
      backupReason: options?.reason || 'manual',
      targetSpecies: speciesProfile?.name || speciesName,
    }
  );
}

export interface ThermalCageCardOptions {
  /** Embed a scannable QR code jumping straight to the animal's local PWA profile. */
  includeQrCode?: boolean;
  /** Origin + pathname of the PWA (e.g. `https://example.github.io/Pedigree/`). */
  appBaseUrl?: string;
}

/**
 * Generates a compact printable Cage Card / Bluetooth Thermal Label HTML layout (e.g. 4" x 2.25" label)
 * with an optional scannable QR code pointing straight to the animal's local PWA profile.
 */
export function generateThermalCageCardHtml(
  animal: Animal,
  allAnimals: Animal[],
  speciesProfiles: SpeciesProfile[],
  settings: BarnSettings,
  options?: ThermalCageCardOptions
): string {
  const sp = resolveSpeciesProfile(animal.species, speciesProfiles);
  const herdById = buildSpeciesHerdMap(allAnimals, animal.species);
  const sire = animal.sireId ? herdById.get(animal.sireId) : undefined;
  const dam = animal.damId ? herdById.get(animal.damId) : undefined;
  const geno = animal.genotypeRaw || formatGenotypeArray(animal.genotype);
  const shouldIncludeQr = options?.includeQrCode !== false && Boolean(options?.appBaseUrl);
  const profileUrl = shouldIncludeQr
    ? buildAnimalProfileDeepLink(options?.appBaseUrl, animal)
    : '';
  const qrSvg = profileUrl
    ? renderQrSvg(profileUrl, {
        sizePx: 74,
        quietZone: 2,
        ariaLabel: `QR code to open ${animal.name || animal.tattoo || 'animal'} profile`,
        className: 'qr-svg',
      })
    : '';

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
  .top { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1.5px solid #000; padding-bottom: 4px; gap: 8px; }
  .tattoo { font-family: "Courier New", monospace; font-size: 18px; font-weight: bold; }
  .cage { font-family: "Courier New", monospace; font-size: 12px; font-weight: bold; text-align: right; }
  .content { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-top: 4px; }
  .details { flex: 1; min-width: 0; }
  .name { font-size: 14.5px; font-weight: bold; line-height: 1.15; }
  .row { font-size: 10.5px; margin-top: 3px; display: flex; justify-content: space-between; gap: 6px; flex-wrap: wrap; }
  .mono { font-family: "Courier New", monospace; font-size: 10px; margin-top: 4px; border-top: 1px solid #cccccc; padding-top: 3px; }
  .qr-box { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 2px; border: 1px solid #cccccc; padding: 2px; background: #ffffff; }
  .qr-svg { display: block; width: 72px; height: 72px; }
  .qr-cap { font-family: "Courier New", monospace; font-size: 7px; font-weight: bold; letter-spacing: 0.04em; text-transform: uppercase; color: #111111; }
  @media print {
    :root, html, body, .card, .qr-box {
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
    <div class="content">
      <div class="details">
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
      </div>
      ${
        qrSvg
          ? `<div class="qr-box" data-qr-url="${escapeHtml(profileUrl)}">
              ${qrSvg}
              <span class="qr-cap">Scan Profile</span>
            </div>`
          : ''
      }
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
