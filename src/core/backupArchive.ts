/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Image-Inclusive Archive Packager & Restorer (.ZIP + .JSON).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript + `fflate` Uint8Array zip/unzip with ZERO browser DOM
 * (`window`, `document`, `<canvas>`) dependencies so full-barn and photo-folder
 * portability archives run identically on Web PWA and React Native / Expo.
 */

import { strFromU8, strToU8, unzipSync, zipSync, Zippable } from 'fflate';
import { generateSpeciesBarnBinderHtml } from './barnBinder';
import {
  Animal,
  AnimalPhoto,
  BarnDatabaseSnapshot,
  BarnSettings,
  generateUuid,
  isSameSpecies,
  nowIsoUtc,
} from './models';
import {
  exportBarnBackupJson,
  parseBarnBackupJson,
  SpeciesBackupReason,
} from './syncAndExports';

export interface BackupPhotoManifestEntry {
  id: string;
  species: string;
  animalId: string;
  animalName: string;
  animalTattoo: string;
  isPrimary: boolean;
  sortOrder: number;
  caption: string;
  originalFileName: string;
  mimeType: string;
  width: number;
  height: number;
  originalBytes: number;
  storedBytes: number;
  archivePath: string;
  thumbnailDataUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackupArchiveBuildResult {
  bytes: Uint8Array;
  photoCount: number;
  animalCount: number;
  binderCount: number;
  totalImageBinaryBytes: number;
}

export type ParsedBackupArchive =
  | {
      kind: 'full_snapshot';
      snapshot: BarnDatabaseSnapshot;
      photosReconstructed: number;
      sourceFormat: 'json' | 'zip';
    }
  | {
      kind: 'photos_only';
      photos: AnimalPhoto[];
      manifestEntries: BackupPhotoManifestEntry[];
      sourceFormat: 'zip';
    };

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const BASE64_LOOKUP = (() => {
  const table = new Uint8Array(256);
  table.fill(255);
  for (let i = 0; i < BASE64_ALPHABET.length; i++) {
    table[BASE64_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

/**
 * Pure TypeScript `Uint8Array` -> base64 string encoder (zero DOM `btoa` / Latin-1 limits).
 */
export function bytesToBase64Pure(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  const chunks: string[] = [];
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < len;
    const hasB2 = i + 2 < len;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;

    const triplet = (b0 << 16) | (b1 << 8) | b2;
    chunks.push(
      BASE64_ALPHABET[(triplet >> 18) & 0x3f] +
        BASE64_ALPHABET[(triplet >> 12) & 0x3f] +
        (hasB1 ? BASE64_ALPHABET[(triplet >> 6) & 0x3f] : '=') +
        (hasB2 ? BASE64_ALPHABET[triplet & 0x3f] : '=')
    );
  }
  return chunks.join('');
}

/**
 * Pure TypeScript base64 string -> `Uint8Array` decoder.
 */
export function base64ToBytesPure(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  if (!clean) return new Uint8Array(0);
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const outLen = Math.max(0, Math.floor((clean.length * 3) / 4) - pad);
  const out = new Uint8Array(outLen);

  let outIdx = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64_LOOKUP[clean.charCodeAt(i)] ?? 0;
    const c1 = BASE64_LOOKUP[clean.charCodeAt(i + 1)] ?? 0;
    const c2 = clean[i + 2] === '=' ? 0 : BASE64_LOOKUP[clean.charCodeAt(i + 2)] ?? 0;
    const c3 = clean[i + 3] === '=' ? 0 : BASE64_LOOKUP[clean.charCodeAt(i + 3)] ?? 0;

    const triplet = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (outIdx < outLen) out[outIdx++] = (triplet >> 16) & 0xff;
    if (outIdx < outLen) out[outIdx++] = (triplet >> 8) & 0xff;
    if (outIdx < outLen) out[outIdx++] = triplet & 0xff;
  }
  return out;
}

/**
 * Extracts raw binary bytes and MIME type from a `data:image/...;base64,...` URI.
 */
export function dataUrlToBinary(
  dataUrl: string,
  fallbackMime = 'image/webp'
): { mimeType: string; bytes: Uint8Array } | null {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;
  const header = dataUrl.slice(5, commaIdx);
  const mimeType = header.split(';')[0] || fallbackMime;
  const payload = dataUrl.slice(commaIdx + 1);
  if (!header.includes(';base64')) {
    return { mimeType, bytes: strToU8(decodeURIComponent(payload)) };
  }
  return { mimeType, bytes: base64ToBytesPure(payload) };
}

/**
 * Converts binary image bytes + MIME type back into a `data:image/...;base64,...` URI.
 */
export function binaryToDataUrl(mimeType: string, bytes: Uint8Array): string {
  const safeMime = mimeType && mimeType.startsWith('image/') ? mimeType : 'image/webp';
  return `data:${safeMime};base64,${bytesToBase64Pure(bytes)}`;
}

function extensionForMime(mimeType: string, fallbackName?: string): string {
  const m = (mimeType || '').toLowerCase();
  if (m === 'image/webp') return 'webp';
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/avif') return 'avif';
  if (m === 'image/gif') return 'gif';
  if (fallbackName) {
    const dot = fallbackName.lastIndexOf('.');
    if (dot !== -1 && dot < fallbackName.length - 1) {
      const ext = fallbackName
        .slice(dot + 1)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      if (ext) return ext;
    }
  }
  return 'webp';
}

function sanitizePathSegment(raw: string, fallback: string): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return cleaned || fallback;
}

function buildArchivePhotoEntries(
  snapshot: BarnDatabaseSnapshot,
  filterSpecies?: string
): {
  zipFiles: Zippable;
  manifest: BackupPhotoManifestEntry[];
  animalCount: number;
  totalImageBinaryBytes: number;
} {
  const animals = filterSpecies
    ? snapshot.animals.filter((a) => isSameSpecies(a.species, filterSpecies))
    : snapshot.animals;
  const animalById = new Map(animals.map((a) => [a.id, a]));

  const photos = (snapshot.animalPhotos ?? [])
    .filter((p) =>
      filterSpecies
        ? isSameSpecies(p.species, filterSpecies) || animalById.has(p.animalId)
        : true
    )
    .sort((a, b) => {
      if (a.species !== b.species) return a.species.localeCompare(b.species);
      if (a.animalId !== b.animalId) return a.animalId.localeCompare(b.animalId);
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    });

  const zipFiles: Zippable = {};
  const manifest: BackupPhotoManifestEntry[] = [];
  const usedPaths = new Set<string>();
  const countPerAnimal = new Map<string, number>();
  const uniqueAnimalsWithPhotos = new Set<string>();
  let totalImageBinaryBytes = 0;

  for (const photo of photos) {
    const decoded = dataUrlToBinary(photo.dataUrl, photo.mimeType);
    if (!decoded || decoded.bytes.byteLength === 0) continue;

    const animal = animalById.get(photo.animalId);
    const speciesFolder = sanitizePathSegment(
      animal?.species || photo.species || 'Livestock',
      'Livestock'
    );
    const animalFolderRaw = animal
      ? [animal.tattoo, animal.name].filter(Boolean).join('_') || animal.id.slice(0, 8)
      : `animal-${photo.animalId.slice(0, 8)}`;
    const animalFolder = sanitizePathSegment(animalFolderRaw, photo.animalId.slice(0, 8));

    const idx = (countPerAnimal.get(photo.animalId) || 0) + 1;
    countPerAnimal.set(photo.animalId, idx);
    const numPrefix = String(idx).padStart(2, '0');
    const roleTag = photo.isPrimary ? 'cover' : 'photo';

    const origBaseRaw = (photo.originalFileName || '').replace(/\.[^.]+$/, '');
    const origBase = origBaseRaw ? `-${sanitizePathSegment(origBaseRaw, 'img')}` : '';
    const ext = extensionForMime(decoded.mimeType, photo.originalFileName);

    let archivePath = `photos/${speciesFolder}/${animalFolder}/${numPrefix}-${roleTag}${origBase}.${ext}`;
    let collision = 2;
    while (usedPaths.has(archivePath)) {
      archivePath = `photos/${speciesFolder}/${animalFolder}/${numPrefix}-${roleTag}${origBase}-${collision}.${ext}`;
      collision++;
    }
    usedPaths.add(archivePath);

    // Store images uncompressed (level 0) inside the ZIP — WebP/JPEG are already compressed
    zipFiles[archivePath] = [decoded.bytes, { level: 0 }];
    totalImageBinaryBytes += decoded.bytes.byteLength;
    uniqueAnimalsWithPhotos.add(photo.animalId);

    manifest.push({
      id: photo.id,
      species: animal?.species || photo.species,
      animalId: photo.animalId,
      animalName: animal?.name || '',
      animalTattoo: animal?.tattoo || '',
      isPrimary: photo.isPrimary,
      sortOrder: photo.sortOrder,
      caption: photo.caption,
      originalFileName: photo.originalFileName || `${numPrefix}-${roleTag}.${ext}`,
      mimeType: decoded.mimeType,
      width: photo.width,
      height: photo.height,
      originalBytes: photo.originalBytes,
      storedBytes: decoded.bytes.byteLength,
      archivePath,
      thumbnailDataUrl: photo.thumbnailDataUrl || '',
      createdAt: photo.createdAt,
      updatedAt: photo.updatedAt,
    });
  }

  return {
    zipFiles,
    manifest,
    animalCount: uniqueAnimalsWithPhotos.size,
    totalImageBinaryBytes,
  };
}

/**
 * Builds a browsable, self-contained **Photos-Only `.ZIP`** archive containing organized
 * real image files (`photos/<Species>/<Tattoo_Name>/01-cover.webp`) + `photos/manifest.json`.
 */
export function buildPhotosOnlyZipArchive(
  snapshot: BarnDatabaseSnapshot,
  filterSpecies?: string
): BackupArchiveBuildResult {
  const { zipFiles, manifest, animalCount, totalImageBinaryBytes } = buildArchivePhotoEntries(
    snapshot,
    filterSpecies
  );

  const manifestPayload = {
    format: 'community-pedigree-photos-archive-v1',
    package: 'Pedigree',
    exportedAtIsoUtc: nowIsoUtc(),
    filterSpecies: filterSpecies || null,
    photoCount: manifest.length,
    photos: manifest,
  };

  zipFiles['photos/manifest.json'] = [
    strToU8(JSON.stringify(manifestPayload, null, 2)),
    { level: 6 },
  ];
  zipFiles['README.txt'] = [
    strToU8(
      [
        'Community Pedigree — Portable Animal Photos Archive',
        `Exported: ${nowIsoUtc()}`,
        `Photos Included: ${manifest.length} across ${animalCount} animal(s)`,
        '',
        'Folders inside photos/ hold standard viewable image files (.webp / .jpg / .png).',
        'Use "Merge Backup (.JSON / .ZIP)" in Barn Settings -> Open Data Portability & Backups',
        'to merge these photos back onto matching animals on any device.',
      ].join('\n')
    ),
    { level: 6 },
  ];

  return {
    bytes: zipSync(zipFiles),
    photoCount: manifest.length,
    animalCount,
    binderCount: 0,
    totalImageBinaryBytes,
  };
}

/**
 * Builds a **Complete Barn Archive + Photos (`.ZIP`)** containing:
 * - `pedigree-backup.json`: Full tabular database (settings, species, animals, cages, breedings, tasks, care logs, shows)
 * - `photos/manifest.json`: Full photo metadata + lightweight thumbnails
 * - `photos/<Species>/<Tattoo_Name>/...`: Every stored image as a real viewable binary file
 *
 * Avoids base64 bloat inside the ZIP while allowing 1-click full restore or merge.
 */
export function buildCompleteBackupZipFiles(
  snapshot: BarnDatabaseSnapshot,
  filterSpecies?: string,
  extraMeta?: {
    backupScope?: 'barn' | 'species';
    backupReason?: SpeciesBackupReason;
    targetSpecies?: string;
  }
): {
  zipFiles: Zippable;
  photoCount: number;
  animalCount: number;
  binderCount: number;
  totalImageBinaryBytes: number;
} {
  const { zipFiles, manifest, totalImageBinaryBytes } = buildArchivePhotoEntries(
    snapshot,
    filterSpecies
  );

  const scopedSnapshot: BarnDatabaseSnapshot = filterSpecies
    ? {
        settings: snapshot.settings,
        speciesProfiles: snapshot.speciesProfiles.filter((sp) =>
          isSameSpecies(sp.name, filterSpecies)
        ),
        animals: snapshot.animals.filter((a) => isSameSpecies(a.species, filterSpecies)),
        animalPhotos: [],
        cages: snapshot.cages.filter((c) => isSameSpecies(c.species, filterSpecies)),
        breedings: snapshot.breedings.filter((b) => isSameSpecies(b.species, filterSpecies)),
        tasks: snapshot.tasks.filter((t) => isSameSpecies(t.species, filterSpecies)),
        careLogs: snapshot.careLogs.filter((l) => isSameSpecies(l.species, filterSpecies)),
        shows: snapshot.shows.filter((s) => isSameSpecies(s.species, filterSpecies)),
      }
    : {
        ...snapshot,
        animalPhotos: [],
      };

  const resolvedMeta = extraMeta
    ? extraMeta
    : filterSpecies
    ? {
        backupScope: 'species' as const,
        backupReason: 'manual' as SpeciesBackupReason,
        targetSpecies: filterSpecies,
      }
    : undefined;

  const mainJsonText = exportBarnBackupJson(scopedSnapshot, resolvedMeta);
  zipFiles['pedigree-backup.json'] = [strToU8(mainJsonText), { level: 6 }];

  // Always auto-include human-readable Printable Barn Binder (.HTM) per species
  // with ALL records (including archived/sold/deceased), photos, and all dossier sections.
  const targetSpeciesNames: string[] = [];
  const seenSpecies = new Set<string>();
  const registerTargetSpecies = (rawName: string | undefined) => {
    const clean = (rawName || '').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seenSpecies.has(key)) return;
    seenSpecies.add(key);
    targetSpeciesNames.push(clean);
  };

  if (filterSpecies) {
    const matched = snapshot.speciesProfiles.find((sp) => isSameSpecies(sp.name, filterSpecies));
    registerTargetSpecies(matched?.name || filterSpecies);
  } else {
    for (const sp of snapshot.speciesProfiles) {
      registerTargetSpecies(sp.name);
    }
    for (const a of snapshot.animals) {
      registerTargetSpecies(a.species);
    }
  }

  let binderCount = 0;
  const usedBinderPaths = new Set<string>();
  for (const spName of targetSpeciesNames) {
    const spSlug = sanitizePathSegment(spName.toLowerCase(), 'species');
    let binderPath = `binder/${spSlug}-binder.htm`;
    let suffix = 2;
    while (usedBinderPaths.has(binderPath)) {
      binderPath = `binder/${spSlug}-${suffix}-binder.htm`;
      suffix++;
    }
    usedBinderPaths.add(binderPath);

    const binderHtml = generateSpeciesBarnBinderHtml(snapshot, spName, {
      colorMode: 'color',
      includeArchived: true,
      includePhotos: true,
      includeCoverAndSignature: true,
      includeSpeciesOverview: true,
      includeHealthAndLitters: true,
      includeShowsAndKinship: true,
    });
    zipFiles[binderPath] = [strToU8(binderHtml), { level: 6 }];
    binderCount++;
  }

  const manifestPayload = {
    format: 'community-pedigree-photos-archive-v1',
    package: 'Pedigree',
    exportedAtIsoUtc: nowIsoUtc(),
    filterSpecies: filterSpecies || null,
    photoCount: manifest.length,
    photos: manifest,
  };
  zipFiles['photos/manifest.json'] = [
    strToU8(JSON.stringify(manifestPayload, null, 2)),
    { level: 6 },
  ];

  zipFiles['README.txt'] = [
    strToU8(
      [
        'Community Pedigree — Complete Portable Backup Archive (.ZIP)',
        `Barn: ${snapshot.settings.barnName}`,
        `Exported: ${nowIsoUtc()}`,
        `Animals: ${scopedSnapshot.animals.length}`,
        `Photos: ${manifest.length}`,
        `Printable Barn Binders: ${binderCount}`,
        '',
        'Contents:',
        '- pedigree-backup.json: Complete herd, lineage, breeding, chore, care log, and species memo pad database.',
        '- binder/*.htm: Complete human-readable Printable Barn Binder per species (pedigrees, health, litters, shows, kinship, photos, and signature page).',
        '- photos/: Standard viewable image files organized by species and animal.',
        '- photos/manifest.json: Index linking every image file to its animal UUID, tattoo, cover flag, and caption.',
        '',
        'To restore or merge everything back into Community Pedigree on any phone or PC:',
        'Open Settings -> Open Data Portability & Backups -> Restore or Merge (.JSON / .ZIP).',
      ].join('\n')
    ),
    { level: 6 },
  ];

  return {
    zipFiles,
    photoCount: manifest.length,
    animalCount: scopedSnapshot.animals.length,
    binderCount,
    totalImageBinaryBytes,
  };
}

export function buildCompleteBackupZipArchive(
  snapshot: BarnDatabaseSnapshot,
  filterSpecies?: string,
  extraMeta?: {
    backupScope?: 'barn' | 'species';
    backupReason?: SpeciesBackupReason;
    targetSpecies?: string;
  }
): BackupArchiveBuildResult {
  const { zipFiles, photoCount, animalCount, binderCount, totalImageBinaryBytes } =
    buildCompleteBackupZipFiles(snapshot, filterSpecies, extraMeta);

  return {
    bytes: zipSync(zipFiles),
    photoCount,
    animalCount,
    binderCount,
    totalImageBinaryBytes,
  };
}

function isZipMagicBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function findEntryCaseInsensitive(
  unzipped: Record<string, Uint8Array>,
  expectedPath: string
): Uint8Array | undefined {
  if (unzipped[expectedPath]) return unzipped[expectedPath];
  const targetLower = expectedPath.replace(/\\/g, '/').toLowerCase();
  for (const [key, val] of Object.entries(unzipped)) {
    if (key.replace(/\\/g, '/').toLowerCase() === targetLower) {
      return val;
    }
  }
  return undefined;
}

/**
 * Parses either a standalone `.json` backup or a `.zip` archive (Complete Archive OR Photos-Only ZIP).
 */
export function parseBackupArchiveInput(
  bytes: Uint8Array,
  fileName: string,
  fallbackSettings: BarnSettings
): ParsedBackupArchive {
  const lowerName = (fileName || '').toLowerCase();
  const isZip = isZipMagicBytes(bytes) || lowerName.endsWith('.zip');

  if (!isZip) {
    const jsonText = strFromU8(bytes);
    const snapshot = parseBarnBackupJson(jsonText, fallbackSettings);
    return {
      kind: 'full_snapshot',
      snapshot,
      photosReconstructed: snapshot.animalPhotos.length,
      sourceFormat: 'json',
    };
  }

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch {
    throw new Error('Could not open ZIP backup archive. Ensure the file is a valid .zip archive.');
  }

  const ts = nowIsoUtc();
  const manifestBytes = findEntryCaseInsensitive(unzipped, 'photos/manifest.json');
  let manifestEntries: BackupPhotoManifestEntry[] = [];
  const reconstructedPhotos: AnimalPhoto[] = [];

  if (manifestBytes) {
    try {
      const parsedManifest = JSON.parse(strFromU8(manifestBytes));
      const rawList: any[] = Array.isArray(parsedManifest?.photos)
        ? parsedManifest.photos
        : Array.isArray(parsedManifest)
        ? parsedManifest
        : [];
      manifestEntries = rawList;

      for (let i = 0; i < rawList.length; i++) {
        const entry = rawList[i];
        const archivePath = String(entry?.archivePath || '');
        if (!archivePath || !entry?.animalId) continue;
        const imgBytes = findEntryCaseInsensitive(unzipped, archivePath);
        if (!imgBytes || imgBytes.byteLength === 0) continue;

        const mimeType = String(entry.mimeType || 'image/webp');
        const dataUrl = binaryToDataUrl(mimeType, imgBytes);
        reconstructedPhotos.push({
          id: String(entry.id || generateUuid()),
          species: String(entry.species || 'Rabbit'),
          animalId: String(entry.animalId),
          isPrimary: Boolean(entry.isPrimary),
          sortOrder: typeof entry.sortOrder === 'number' ? entry.sortOrder : i,
          caption: String(entry.caption || ''),
          originalFileName: String(entry.originalFileName || ''),
          mimeType,
          width: Number(entry.width) || 0,
          height: Number(entry.height) || 0,
          originalBytes: Number(entry.originalBytes) || imgBytes.byteLength,
          storedBytes: imgBytes.byteLength,
          thumbnailDataUrl: String(entry.thumbnailDataUrl || dataUrl),
          dataUrl,
          createdAt: String(entry.createdAt || ts),
          updatedAt: String(entry.updatedAt || ts),
        });
      }
    } catch {
      throw new Error('ZIP archive has a corrupted photos/manifest.json index.');
    }
  }

  // Locate main backup JSON inside ZIP
  let mainBackupBytes = findEntryCaseInsensitive(unzipped, 'pedigree-backup.json');
  if (!mainBackupBytes) {
    for (const [entryKey, entryVal] of Object.entries(unzipped)) {
      const normalized = entryKey.replace(/\\/g, '/').toLowerCase();
      if (
        normalized.endsWith('.json') &&
        !normalized.endsWith('photos/manifest.json') &&
        !normalized.startsWith('binder/') &&
        !normalized.includes('__macosx')
      ) {
        const txt = strFromU8(entryVal);
        if (txt.includes('"animals"') || txt.includes('"speciesProfiles"')) {
          mainBackupBytes = entryVal;
          break;
        }
      }
    }
  }

  if (mainBackupBytes) {
    const parsedSnap = parseBarnBackupJson(strFromU8(mainBackupBytes), fallbackSettings);
    const mergedPhotos =
      reconstructedPhotos.length > 0 ? reconstructedPhotos : parsedSnap.animalPhotos;
    return {
      kind: 'full_snapshot',
      snapshot: {
        ...parsedSnap,
        animalPhotos: mergedPhotos,
      },
      photosReconstructed: mergedPhotos.length,
      sourceFormat: 'zip',
    };
  }

  if (manifestBytes) {
    return {
      kind: 'photos_only',
      photos: reconstructedPhotos,
      manifestEntries,
      sourceFormat: 'zip',
    };
  }

  throw new Error(
    'This ZIP does not contain a Community Pedigree backup (pedigree-backup.json or photos/manifest.json). For third-party exports (HerdBoss / Evans), use the Multi-Platform Importer above.'
  );
}

/**
 * Merges reconstructed photos from a Photos-Only ZIP into the local snapshot,
 * matching by exact `animalId` first and falling back to `(species + tattoo)` or `(species + name)`.
 */
export function mergePhotosOnlyIntoSnapshot(
  local: BarnDatabaseSnapshot,
  incomingPhotos: AnimalPhoto[],
  manifestEntries: BackupPhotoManifestEntry[] = []
): {
  nextSnapshot: BarnDatabaseSnapshot;
  photosAdded: number;
  photosUpdated: number;
  unmatchedSkipped: number;
} {
  const animalById = new Map<string, Animal>(local.animals.map((a) => [a.id, a]));
  const manifestByPhotoId = new Map(manifestEntries.map((m) => [m.id, m]));

  const findMatchingAnimal = (photo: AnimalPhoto): Animal | undefined => {
    const direct = animalById.get(photo.animalId);
    if (direct) return direct;
    const meta = manifestByPhotoId.get(photo.id);
    if (!meta) return undefined;
    const targetSpecies = meta.species || photo.species;
    const targetTattoo = (meta.animalTattoo || '').trim().toLowerCase();
    const targetName = (meta.animalName || '').trim().toLowerCase();

    if (targetTattoo) {
      const byTattoo = local.animals.find(
        (a) =>
          isSameSpecies(a.species, targetSpecies) &&
          a.tattoo.trim().toLowerCase() === targetTattoo
      );
      if (byTattoo) return byTattoo;
    }
    if (targetName) {
      return local.animals.find(
        (a) =>
          isSameSpecies(a.species, targetSpecies) &&
          a.name.trim().toLowerCase() === targetName
      );
    }
    return undefined;
  };

  const photoMap = new Map<string, AnimalPhoto>();
  for (const p of local.animalPhotos ?? []) {
    photoMap.set(p.id, p);
  }

  let photosAdded = 0;
  let photosUpdated = 0;
  let unmatchedSkipped = 0;

  for (const inc of incomingPhotos) {
    const matchedAnimal = findMatchingAnimal(inc);
    if (!matchedAnimal) {
      unmatchedSkipped++;
      continue;
    }
    const normalizedInc: AnimalPhoto = {
      ...inc,
      animalId: matchedAnimal.id,
      species: matchedAnimal.species,
    };
    const existing = photoMap.get(normalizedInc.id);
    if (!existing) {
      photoMap.set(normalizedInc.id, normalizedInc);
      photosAdded++;
    } else if ((normalizedInc.updatedAt || '') > (existing.updatedAt || '')) {
      photoMap.set(normalizedInc.id, normalizedInc);
      photosUpdated++;
    }
  }

  // Ensure every animal with photos has at least one primary photo and not multiple primaries
  const mergedList = Array.from(photoMap.values());
  const byAnimal = new Map<string, AnimalPhoto[]>();
  for (const p of mergedList) {
    const arr = byAnimal.get(p.animalId) || [];
    arr.push(p);
    byAnimal.set(p.animalId, arr);
  }
  for (const arr of byAnimal.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
    const primaries = arr.filter((p) => p.isPrimary);
    if (primaries.length === 0 && arr.length > 0) {
      arr[0].isPrimary = true;
    } else if (primaries.length > 1) {
      let keptFirst = false;
      for (const p of arr) {
        if (p.isPrimary) {
          if (!keptFirst) keptFirst = true;
          else p.isPrimary = false;
        }
      }
    }
  }

  return {
    nextSnapshot: {
      ...local,
      animalPhotos: mergedList,
    },
    photosAdded,
    photosUpdated,
    unmatchedSkipped,
  };
}
