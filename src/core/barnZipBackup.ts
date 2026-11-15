/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure TypeScript Unified Barn Backup ZIP Packager & Importer (`src/core/barnZipBackup.ts`).
 *
 * Combines all barn exports AND every stored animal image into a single organized `.zip` archive:
 *   README.txt
 *   manifest.json
 *   data/barn-backup.json
 *   data/barn-database.sqlite   (when SQLite bytes are available)
 *   data/herd-all-species.csv
 *   reports/barn-report-all-species.json
 *   reports/species/<species>-report.json
 *   images/<species>/<animal>-<tattoo>-<n>-<shortId>.<ext>
 *
 * Also parses and rehydrates `.zip` archives on import (supporting both UUID+timestamp Sync Merge
 * and Full Replace Restore, even if `dataUrl` was omitted from JSON and only binary `images/` remain).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript + `fflate` with zero browser DOM (`window`, `document`, `atob`, `btoa`).
 */

import { strFromU8, strToU8, unzipSync, zipSync, Zippable } from 'fflate';
import {
  AnimalPhoto,
  BarnDatabaseSnapshot,
  BarnSettings,
  isSameSpecies,
  nowIsoUtc,
} from './models';
import {
  buildPdfReadyBarnSnapshot,
  exportAnimalsCsv,
  exportBarnBackupJson,
  parseBarnBackupJson,
} from './syncAndExports';

export interface BarnZipPhotoManifestEntry {
  photoId: string;
  animalId: string;
  animalName: string;
  animalTattoo: string;
  species: string;
  isPrimary: boolean;
  sortOrder: number;
  caption: string;
  originalFileName: string;
  mimeType: string;
  width: number;
  height: number;
  zipPath: string;
}

export interface BarnZipManifest {
  format: 'pedigree-zip-backup';
  version: 1;
  exportedAtIsoUtc: string;
  exportedAtLocal: string;
  barnName: string;
  breederName: string;
  engineName?: string;
  includesJson: boolean;
  includesSqlite: boolean;
  includesCsv: boolean;
  includesReports: boolean;
  counts: {
    speciesProfiles: number;
    animals: number;
    animalPhotos: number;
    imageFilesExported: number;
    cages: number;
    breedings: number;
    tasks: number;
    careLogs: number;
    shows: number;
  };
  photoFiles: BarnZipPhotoManifestEntry[];
}

export interface BuildBarnBackupZipResult {
  zipBytes: Uint8Array;
  fileName: string;
  manifest: BarnZipManifest;
}

export interface InspectedBarnZipSummary {
  barnName: string;
  exportedAtLabel: string;
  animalCount: number;
  photoCount: number;
  speciesCount: number;
  imageFilesFound: number;
  includesJson: boolean;
  includesSqlite: boolean;
  includesCsv: boolean;
  includesReports: boolean;
}

export interface ParsedBarnZipBackup {
  kind: 'snapshot' | 'sqlite';
  snapshot?: BarnDatabaseSnapshot;
  sqliteBytes?: Uint8Array;
  manifest: BarnZipManifest | null;
  summary: InspectedBarnZipSummary;
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const b1 = has1 ? bytes[i + 1] : 0;
    const b2 = has2 ? bytes[i + 2] : 0;

    const triplet = (b0 << 16) | (b1 << 8) | b2;
    out += B64_ALPHABET[(triplet >> 18) & 0x3f];
    out += B64_ALPHABET[(triplet >> 12) & 0x3f];
    out += has1 ? B64_ALPHABET[(triplet >> 6) & 0x3f] : '=';
    out += has2 ? B64_ALPHABET[triplet & 0x3f] : '=';
  }
  return out;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  if (!clean) return new Uint8Array(0);
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const outLen = Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
  const out = new Uint8Array(outLen);

  let outIdx = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_ALPHABET.indexOf(clean[i]);
    const c1 = B64_ALPHABET.indexOf(clean[i + 1]);
    const c2 = clean[i + 2] === '=' ? 0 : B64_ALPHABET.indexOf(clean[i + 2]);
    const c3 = clean[i + 3] === '=' ? 0 : B64_ALPHABET.indexOf(clean[i + 3]);

    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) continue;
    const triplet = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (outIdx < outLen) out[outIdx++] = (triplet >> 16) & 0xff;
    if (outIdx < outLen) out[outIdx++] = (triplet >> 8) & 0xff;
    if (outIdx < outLen) out[outIdx++] = triplet & 0xff;
  }
  return out;
}

export function parseDataUrlToBytes(
  dataUrl: string | undefined
): { mimeType: string; bytes: Uint8Array } | null {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/i);
  if (!match) return null;
  const mimeType = match[1].trim().toLowerCase();
  const bytes = base64ToUint8Array(match[2]);
  if (bytes.byteLength === 0) return null;
  return { mimeType, bytes };
}

export function mimeTypeToImageExtension(mimeType: string | undefined): string {
  const m = (mimeType || '').toLowerCase();
  if (m.includes('webp')) return 'webp';
  if (m.includes('png')) return 'png';
  if (m.includes('gif')) return 'gif';
  if (m.includes('avif')) return 'avif';
  if (m.includes('bmp')) return 'bmp';
  return 'jpg';
}

export function extensionToImageMimeType(path: string): string {
  const clean = path.split('?')[0].toLowerCase();
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.gif')) return 'image/gif';
  if (clean.endsWith('.avif')) return 'image/avif';
  if (clean.endsWith('.bmp')) return 'image/bmp';
  return 'image/jpeg';
}

function slugifySegment(value: string | undefined, fallback: string, maxLen: number = 36): string {
  const clean = (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen);
  return clean || fallback;
}

export function buildCleanZipBackupFileName(
  barnName: string | undefined,
  dateIso: string = nowIsoUtc().slice(0, 10)
): string {
  const cleanBarn = (barnName || '').trim();
  const slug =
    cleanBarn && cleanBarn.toLowerCase() !== 'my barn'
      ? slugifySegment(cleanBarn, 'pedigree', 40)
      : 'pedigree';
  return `${slug}-full-backup-${dateIso}.zip`;
}

function buildArchiveReadmeText(
  snapshot: BarnDatabaseSnapshot,
  manifest: BarnZipManifest
): string {
  const lines: string[] = [
    'Community Pedigree — Complete Barn Backup Archive',
    '=================================================',
    `Barn Name      : ${manifest.barnName}`,
    ...(manifest.breederName ? [`Breeder        : ${manifest.breederName}`] : []),
    `Exported       : ${manifest.exportedAtLocal} (${manifest.exportedAtIsoUtc})`,
    `Animals        : ${manifest.counts.animals} across ${manifest.counts.speciesProfiles} species`,
    `Images Exported: ${manifest.counts.imageFilesExported} animal photo(s)`,
    `Breedings      : ${manifest.counts.breedings}`,
    `Tasks          : ${manifest.counts.tasks}`,
    `Care Logs      : ${manifest.counts.careLogs}`,
    `Cages          : ${manifest.counts.cages}`,
    `Shows          : ${manifest.counts.shows}`,
    '',
    'Archive Contents:',
    '  README.txt                      This overview and restore instructions',
    '  manifest.json                   Archive inventory & photo file mapping',
    '  data/barn-backup.json           Human-readable full JSON backup (v5)',
    ...(manifest.includesSqlite
      ? ['  data/barn-database.sqlite       Raw unencrypted SQLite database file']
      : []),
    '  data/herd-all-species.csv       Spreadsheet CSV export of all animals',
    '  reports/barn-report-all-species.json   Barn summary & structured report JSON',
    '  reports/species/<species>-report.json  Per-species structured report JSON',
    '  images/<species>/<animal>.<ext> All animal photos organized by species',
    '',
    'How to Restore or Merge:',
    '  1. Open Community Pedigree -> Import & Settings -> Backups & Import.',
    '  2. Upload this .ZIP file using the Backup Importer.',
    '  3. Choose "Sync Merge" to combine records/photos by UUID & timestamp,',
    '     or "Replace Entire Barn" for a clean full restore.',
    '',
    `Configured Species (${snapshot.speciesProfiles.length}): ${snapshot.speciesProfiles
      .map((sp) => sp.name)
      .join(', ')}`,
  ];
  return lines.join('\n') + '\n';
}

/**
 * Packages the full barn database, raw SQLite binary (if available), CSV herd export,
 * per-species structured JSON reports, and every user photo into a single organized `.zip`.
 */
export function buildBarnBackupZip(
  snapshot: BarnDatabaseSnapshot,
  options?: {
    sqliteBytes?: Uint8Array | null;
    engineName?: string;
    exportedAt?: Date;
  }
): BuildBarnBackupZipResult {
  const exportedDate = options?.exportedAt || new Date();
  const exportedAtIsoUtc = exportedDate.toISOString();
  const exportedAtLocal = exportedDate.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const fileName = buildCleanZipBackupFileName(
    snapshot.settings.barnName,
    exportedAtIsoUtc.slice(0, 10)
  );

  const zipTree: Zippable = {};
  const animalById = new Map(snapshot.animals.map((a) => [a.id, a]));
  const usedPaths = new Set<string>();

  // 1. Core human-readable JSON backup
  const fullJsonText = exportBarnBackupJson(snapshot);
  zipTree['data/barn-backup.json'] = [strToU8(fullJsonText), { level: 6 }];

  // 2. Raw SQLite binary (if provided)
  const hasSqlite = Boolean(options?.sqliteBytes && options.sqliteBytes.byteLength > 0);
  if (options?.sqliteBytes && options.sqliteBytes.byteLength > 0) {
    zipTree['data/barn-database.sqlite'] = [options.sqliteBytes, { level: 6 }];
  }

  // 3. All-animals RFC-4180 CSV spreadsheet
  const csvText = exportAnimalsCsv(snapshot.animals, snapshot.speciesProfiles, snapshot.settings);
  zipTree['data/herd-all-species.csv'] = [strToU8(csvText), { level: 6 }];

  // 4. Structured PDF-ready JSON reports (overall + per configured species)
  const allReportJson = JSON.stringify(buildPdfReadyBarnSnapshot(snapshot), null, 2);
  zipTree['reports/barn-report-all-species.json'] = [strToU8(allReportJson), { level: 6 }];

  for (const sp of snapshot.speciesProfiles) {
    const spSlug = slugifySegment(sp.name, 'species', 28);
    let reportPath = `reports/species/${spSlug}-report.json`;
    let suffix = 2;
    while (usedPaths.has(reportPath)) {
      reportPath = `reports/species/${spSlug}-${suffix++}-report.json`;
    }
    usedPaths.add(reportPath);
    const spReportJson = JSON.stringify(buildPdfReadyBarnSnapshot(snapshot, sp.name), null, 2);
    zipTree[reportPath] = [strToU8(spReportJson), { level: 6 }];
  }

  // 5. Export user's stored animal photos as real organized image files
  const sortedPhotos = [...(snapshot.animalPhotos ?? [])].sort(
    (a, b) =>
      a.species.localeCompare(b.species) ||
      a.animalId.localeCompare(b.animalId) ||
      a.sortOrder - b.sortOrder
  );

  const photoFiles: BarnZipPhotoManifestEntry[] = [];
  const animalPhotoCounters = new Map<string, number>();

  for (const photo of sortedPhotos) {
    const decoded =
      parseDataUrlToBytes(photo.dataUrl) || parseDataUrlToBytes(photo.thumbnailDataUrl);
    if (!decoded) continue;

    const animal = animalById.get(photo.animalId);
    const speciesLabel = photo.species || animal?.species || 'Unknown';
    const speciesSlug = slugifySegment(speciesLabel, 'livestock', 24);
    const animalSlug = slugifySegment(animal?.name || 'animal', 'animal', 28);
    const tattooSlug = animal?.tattoo ? `-${slugifySegment(animal.tattoo, '', 16)}` : '';

    const nextIdx = (animalPhotoCounters.get(photo.animalId) ?? 0) + 1;
    animalPhotoCounters.set(photo.animalId, nextIdx);

    const ext = mimeTypeToImageExtension(decoded.mimeType || photo.mimeType);
    const shortPhotoId = slugifySegment(photo.id, String(nextIdx), 8);
    let zipPath = `images/${speciesSlug}/${animalSlug}${tattooSlug}-${nextIdx}-${shortPhotoId}.${ext}`;
    let dedupe = 2;
    while (usedPaths.has(zipPath)) {
      zipPath = `images/${speciesSlug}/${animalSlug}${tattooSlug}-${nextIdx}-${shortPhotoId}-${dedupe++}.${ext}`;
    }
    usedPaths.add(zipPath);

    // Already-compressed WebP/JPEG/PNG: level 0 keeps ZIP creation fast with zero bloat
    zipTree[zipPath] = [decoded.bytes, { level: 0 }];

    photoFiles.push({
      photoId: photo.id,
      animalId: photo.animalId,
      animalName: animal?.name || '',
      animalTattoo: animal?.tattoo || '',
      species: speciesLabel,
      isPrimary: Boolean(photo.isPrimary),
      sortOrder: photo.sortOrder,
      caption: photo.caption || '',
      originalFileName: photo.originalFileName || '',
      mimeType: decoded.mimeType || photo.mimeType || `image/${ext}`,
      width: photo.width || 0,
      height: photo.height || 0,
      zipPath,
    });
  }

  const manifest: BarnZipManifest = {
    format: 'pedigree-zip-backup',
    version: 1,
    exportedAtIsoUtc,
    exportedAtLocal,
    barnName: snapshot.settings.barnName || 'My Barn',
    breederName: snapshot.settings.breederName || '',
    engineName: options?.engineName,
    includesJson: true,
    includesSqlite: hasSqlite,
    includesCsv: true,
    includesReports: true,
    counts: {
      speciesProfiles: snapshot.speciesProfiles.length,
      animals: snapshot.animals.length,
      animalPhotos: sortedPhotos.length,
      imageFilesExported: photoFiles.length,
      cages: snapshot.cages.length,
      breedings: snapshot.breedings.length,
      tasks: snapshot.tasks.length,
      careLogs: snapshot.careLogs.length,
      shows: snapshot.shows.length,
    },
    photoFiles,
  };

  zipTree['manifest.json'] = [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }];
  zipTree['README.txt'] = [strToU8(buildArchiveReadmeText(snapshot, manifest)), { level: 6 }];

  const zipBytes = zipSync(zipTree);
  return { zipBytes, fileName, manifest };
}

function isIgnoredZipEntry(path: string): boolean {
  const norm = path.replace(/\\/g, '/');
  if (!norm || norm.endsWith('/')) return true;
  if (norm.includes('__MACOSX/')) return true;
  const base = norm.split('/').pop() || '';
  return base === '.DS_Store' || base.startsWith('._');
}

function parseManifestJson(entries: Record<string, Uint8Array>): BarnZipManifest | null {
  const manifestKey = Object.keys(entries).find((k) => {
    const norm = k.replace(/\\/g, '/').toLowerCase();
    return norm === 'manifest.json' || norm.endsWith('/manifest.json');
  });
  if (!manifestKey) return null;
  try {
    const parsed = JSON.parse(strFromU8(entries[manifestKey]));
    if (parsed && parsed.format === 'pedigree-zip-backup') {
      return parsed as BarnZipManifest;
    }
    return null;
  } catch {
    return null;
  }
}

function findPrimaryBackupJsonKey(entries: Record<string, Uint8Array>): string | null {
  const keys = Object.keys(entries);
  const exact = keys.find((k) => k.replace(/\\/g, '/').toLowerCase() === 'data/barn-backup.json');
  if (exact) return exact;

  // Fallback: inspect any JSON file that isn't manifest.json or under reports/
  const candidateKeys = keys.filter((k) => {
    const norm = k.replace(/\\/g, '/').toLowerCase();
    return (
      norm.endsWith('.json') &&
      !norm.endsWith('manifest.json') &&
      !norm.startsWith('reports/') &&
      !norm.includes('/reports/')
    );
  });

  for (const key of candidateKeys) {
    try {
      const parsed = JSON.parse(strFromU8(entries[key]));
      if (parsed && (parsed.format === 'pedigree-backup' || Array.isArray(parsed.animals))) {
        return key;
      }
    } catch {
      // Skip unparseable JSON
    }
  }
  return null;
}

function findSqliteKey(entries: Record<string, Uint8Array>): string | null {
  const keys = Object.keys(entries);
  const exact = keys.find(
    (k) => k.replace(/\\/g, '/').toLowerCase() === 'data/barn-database.sqlite'
  );
  if (exact) return exact;
  return (
    keys.find((k) => /\.(sqlite|sqlite3|db)$/i.test(k.trim())) || null
  );
}

/**
 * Parses and inspects an uploaded `.zip` backup archive, rehydrating animal photos from `images/`
 * if needed (or falling back to embedded `.sqlite` if no JSON backup is present).
 */
export function parseBarnBackupZip(
  zipBytes: Uint8Array,
  fallbackSettings: BarnSettings
): ParsedBarnZipBackup {
  let rawEntries: Record<string, Uint8Array>;
  try {
    rawEntries = unzipSync(zipBytes);
  } catch {
    throw new Error('Selected file is not a valid or readable .zip backup archive.');
  }

  const entries: Record<string, Uint8Array> = {};
  const normalizedKeyMap = new Map<string, string>();
  for (const [key, val] of Object.entries(rawEntries)) {
    if (isIgnoredZipEntry(key)) continue;
    const norm = key.replace(/\\/g, '/').replace(/^\/+/, '');
    entries[norm] = val;
    normalizedKeyMap.set(norm.toLowerCase(), norm);
  }

  const manifest = parseManifestJson(entries);
  const jsonKey = findPrimaryBackupJsonKey(entries);
  const sqliteKey = findSqliteKey(entries);

  const imageEntryKeys = Object.keys(entries).filter((k) =>
    /\.(webp|jpg|jpeg|png|gif|avif|bmp)$/i.test(k)
  );
  const csvPresent = Object.keys(entries).some((k) => k.toLowerCase().endsWith('.csv'));
  const reportsPresent = Object.keys(entries).some((k) =>
    k.toLowerCase().startsWith('reports/')
  );

  if (jsonKey) {
    const jsonText = strFromU8(entries[jsonKey]);
    const rawParsed = JSON.parse(jsonText);

    // If any photo in JSON had its dataUrl omitted OR images/ binary exists via manifest, rehydrate!
    if (Array.isArray(rawParsed?.animalPhotos) && manifest?.photoFiles?.length) {
      const manifestByPhotoId = new Map(manifest.photoFiles.map((m) => [m.photoId, m]));
      rawParsed.animalPhotos = rawParsed.animalPhotos.map((p: any) => {
        if (!p || !p.id) return p;
        const mEntry = manifestByPhotoId.get(String(p.id));
        if (!mEntry) return p;
        const exactKey =
          entries[mEntry.zipPath]
            ? mEntry.zipPath
            : normalizedKeyMap.get(mEntry.zipPath.toLowerCase());
        if (!exactKey || !entries[exactKey]) return p;

        const bytes = entries[exactKey];
        const mime = mEntry.mimeType || p.mimeType || extensionToImageMimeType(exactKey);
        const rehydratedDataUrl = `data:${mime};base64,${uint8ArrayToBase64(bytes)}`;
        return {
          ...p,
          mimeType: mime,
          storedBytes: p.storedBytes || bytes.byteLength,
          dataUrl:
            typeof p.dataUrl === 'string' && p.dataUrl.startsWith('data:image/')
              ? p.dataUrl
              : rehydratedDataUrl,
          thumbnailDataUrl:
            typeof p.thumbnailDataUrl === 'string' && p.thumbnailDataUrl.startsWith('data:image/')
              ? p.thumbnailDataUrl
              : rehydratedDataUrl,
        };
      });
    } else if (
      (!Array.isArray(rawParsed?.animalPhotos) || rawParsed.animalPhotos.length === 0) &&
      manifest?.photoFiles?.length
    ) {
      // Rebuild animalPhotos purely from manifest.json + images/ if JSON had none
      const ts = nowIsoUtc();
      const rebuiltPhotos: AnimalPhoto[] = [];
      for (const mEntry of manifest.photoFiles) {
        const exactKey =
          entries[mEntry.zipPath]
            ? mEntry.zipPath
            : normalizedKeyMap.get(mEntry.zipPath.toLowerCase());
        if (!exactKey || !entries[exactKey]) continue;
        const bytes = entries[exactKey];
        const mime = mEntry.mimeType || extensionToImageMimeType(exactKey);
        const dataUrl = `data:${mime};base64,${uint8ArrayToBase64(bytes)}`;
        rebuiltPhotos.push({
          id: mEntry.photoId,
          species: mEntry.species,
          animalId: mEntry.animalId,
          isPrimary: mEntry.isPrimary,
          sortOrder: mEntry.sortOrder,
          caption: mEntry.caption,
          originalFileName: mEntry.originalFileName,
          mimeType: mime,
          width: mEntry.width,
          height: mEntry.height,
          originalBytes: bytes.byteLength,
          storedBytes: bytes.byteLength,
          thumbnailDataUrl: dataUrl,
          dataUrl,
          createdAt: ts,
          updatedAt: ts,
        });
      }
      rawParsed.animalPhotos = rebuiltPhotos;
    }

    const snapshot = parseBarnBackupJson(JSON.stringify(rawParsed), fallbackSettings);
    const exportedLabel =
      manifest?.exportedAtLocal ||
      (typeof rawParsed?.exportedAtLocal === 'string' ? rawParsed.exportedAtLocal : '') ||
      snapshot.settings.updatedAt;

    return {
      kind: 'snapshot',
      snapshot,
      sqliteBytes: sqliteKey ? entries[sqliteKey] : undefined,
      manifest,
      summary: {
        barnName: snapshot.settings.barnName || manifest?.barnName || 'My Barn',
        exportedAtLabel: exportedLabel || 'Not recorded',
        animalCount: snapshot.animals.length,
        photoCount: snapshot.animalPhotos?.length ?? 0,
        speciesCount: snapshot.speciesProfiles.length,
        imageFilesFound: imageEntryKeys.length,
        includesJson: true,
        includesSqlite: Boolean(sqliteKey),
        includesCsv: csvPresent,
        includesReports: reportsPresent,
      },
    };
  }

  if (sqliteKey) {
    return {
      kind: 'sqlite',
      sqliteBytes: entries[sqliteKey],
      manifest,
      summary: {
        barnName: manifest?.barnName || 'SQLite Backup',
        exportedAtLabel: manifest?.exportedAtLocal || 'Not recorded',
        animalCount: manifest?.counts?.animals ?? 0,
        photoCount: manifest?.counts?.animalPhotos ?? imageEntryKeys.length,
        speciesCount: manifest?.counts?.speciesProfiles ?? 0,
        imageFilesFound: imageEntryKeys.length,
        includesJson: false,
        includesSqlite: true,
        includesCsv: csvPresent,
        includesReports: reportsPresent,
      },
    };
  }

  throw new Error(
    'This .zip archive does not contain a Community Pedigree backup JSON or SQLite database.'
  );
}
