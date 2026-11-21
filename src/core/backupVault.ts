/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Hybrid Backup Vault, `_schemaVersion` Migrator, Export Canary,
 * and Archived Herds Bundle Packager (`src/core/backupVault.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript + `fflate` Uint8Array zip/unzip with ZERO browser DOM
 * (`window`, `document`, `navigator`, `indexedDB`) or Node dependencies.
 */

import { strFromU8, strToU8, zipSync, Zippable } from 'fflate';
import {
  BackupPhotoManifestEntry,
  binaryToDataUrl,
  dataUrlToBinary,
} from './backupArchive';
import {
  isSvgImageInput,
  MAX_JSON_BACKUP_BYTES,
  MAX_ZIP_ARCHIVE_BYTES,
  safeUnzipArchive,
  sanitizePlainText,
  sanitizeSafeRasterImageDataUrl,
  sanitizeSingleLineText,
  validateUploadFileSize,
} from './inputSanitization';
import {
  Animal,
  AnimalPhoto,
  AnimalStatus,
  BarnDatabaseSnapshot,
  BarnSettings,
  BiologicalSex,
  CareLog,
  DEFAULT_CALENDAR_SYNC_SETTINGS,
  generateUuid,
  isSameSpecies,
  nowIsoUtc,
  PREDEFINED_SPECIES_PRESETS,
} from './models';
import { parseBarnBackupJson } from './syncAndExports';

export const CURRENT_BACKUP_SCHEMA_VERSION = 6;
export const APP_SCHEMA_BUILD_TAG = 'pedigree-pwa-v6';

export type VaultBackupKind =
  | 'monthly'
  | 'pre_upgrade'
  | 'manual'
  | 'pre_reset'
  | 'recovery_dump';

export const VAULT_KIND_LABELS: Record<VaultBackupKind, string> = {
  monthly: 'Monthly Auto',
  pre_upgrade: 'Pre-Upgrade Safety',
  manual: 'Manual Vault Save',
  pre_reset: 'Pre-Reset Safety',
  recovery_dump: 'Recovery Dump',
};

export interface VaultBackupMetadata {
  key: string;
  fileName: string;
  kind: VaultBackupKind;
  schemaVersion: number;
  createdAtIso: string;
  createdByAppVersion: string;
  barnName: string;
  animalCount: number;
  photoCount: number;
  speciesCount: number;
  byteSize: number;
  checksumSha256: string;
  source: 'opfs' | 'idb';
  note?: string;
  compressed?: boolean;
}

export interface VaultBackupEnvelope {
  format: 'community-pedigree-vault-backup';
  package: 'Pedigree';
  version: 5;
  _schemaVersion: number;
  createdAtIso: string;
  createdByAppVersion: string;
  vaultKind: VaultBackupKind;
  checksumSha256: string;
  note?: string;
  snapshot: BarnDatabaseSnapshot;
}

export interface MigratedBackupResult {
  snapshot: BarnDatabaseSnapshot;
  schemaVersion: number;
  migratedFromVersion: number;
  vaultKind: VaultBackupKind;
  createdAtIso: string;
  checksumValid: boolean | null;
  note?: string;
}

export interface ExportCanaryProbe {
  format: 'community-pedigree-canary-v1';
  _schemaVersion: number;
  createdAtIso: string;
  barnName: string;
  animalCount: number;
  speciesCount: number;
  sampleAnimalIds: string[];
  sampleAnimalNames: string[];
  checksumSha256: string;
}

export interface ExportCanaryVerificationResult {
  ok: boolean;
  reason?: string;
}

export interface ArchivedAnimalSummary {
  id: string;
  name: string;
  tattoo: string;
  species: string;
  breed: string;
  variety: string;
  sex: BiologicalSex;
  status: AnimalStatus;
  birthDateIso: string;
  soldDateIso?: string;
  deceasedDateIso?: string;
  buyerName?: string;
  deathCause?: string;
  hasPedigreeStubInDb: boolean;
}

export interface ArchivedHerdIndexEntry {
  archiveKey: string;
  fileName: string;
  createdAtIso: string;
  schemaVersion: number;
  byteSize: number;
  checksumSha256: string;
  speciesSummary: string[];
  animalCount: number;
  photoCount: number;
  careLogCount: number;
  animals: ArchivedAnimalSummary[];
}

export interface UnpackedArchivedHerdBundle {
  archiveKey: string;
  createdAtIso: string;
  schemaVersion: number;
  checksumSha256: string;
  animals: Animal[];
  animalPhotos: AnimalPhoto[];
  careLogs: CareLog[];
}

export interface BuiltArchivedBundleResult {
  archiveKey: string;
  fileName: string;
  zipBytes: Uint8Array;
  indexEntry: ArchivedHerdIndexEntry;
  nextActiveSnapshot: BarnDatabaseSnapshot;
  stubAnimalIds: string[];
  removedAnimalIds: string[];
}

// ---------------------------------------------------------------------------
// Pure TypeScript FIPS 180-4 SHA-256 Digest (zero WebCrypto/DOM dependencies)
// ---------------------------------------------------------------------------

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const SHA256_INIT = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

export function sha256HexPure(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? strToU8(input) : input;
  const len = bytes.length;
  const bitLenHi = Math.floor((len * 8) / 0x100000000);
  const bitLenLo = (len * 8) >>> 0;

  const fullBlocksEnd = Math.floor(len / 64) * 64;
  const rem = len - fullBlocksEnd;
  const tailBlocks = rem < 56 ? 1 : 2;
  const tail = new Uint8Array(tailBlocks * 64);
  if (rem > 0) {
    tail.set(bytes.subarray(fullBlocksEnd));
  }
  tail[rem] = 0x80;

  const tailView = new DataView(tail.buffer);
  tailView.setUint32(tail.length - 8, bitLenHi, false);
  tailView.setUint32(tail.length - 4, bitLenLo, false);

  const srcView =
    fullBlocksEnd > 0
      ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : null;

  const h = new Uint32Array(SHA256_INIT);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  const processBlock = (view: DataView, offset: number) => {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  };

  if (srcView) {
    for (let offset = 0; offset < fullBlocksEnd; offset += 64) {
      processBlock(srcView, offset);
    }
  }
  for (let offset = 0; offset < tail.length; offset += 64) {
    processBlock(tailView, offset);
  }

  let hex = '';
  for (let i = 0; i < 8; i++) {
    hex += h[i].toString(16).padStart(8, '0');
  }
  return hex;
}

// ---------------------------------------------------------------------------
// Minimal Empty Fallback Settings & Snapshot Shell
// ---------------------------------------------------------------------------

export function buildEmptyFallbackSettings(): BarnSettings {
  const ts = nowIsoUtc();
  return {
    id: 'barn_settings',
    barnName: 'My Barn',
    breederName: '',
    preferredUnit: 'lbs_oz',
    currencyCode: 'USD',
    defaultSpecies: 'Rabbit',
    pinnedLandingSpecies: '',
    defaultGenerations: 3,
    themeMode: 'dark',
    imageOptimizationPreset: 'balanced',
    showHomeSummaryGrid: true,
    barnNameOnboarded: false,
    ignoredTaskIds: [],
    dismissedTaskGroupKeys: {},
    dismissedMemoAlertSignatures: {},
    speciesHubBlockOrder: {},
    includePhotoOnPedigree: false,
    calendarSync: { ...DEFAULT_CALENDAR_SYNC_SETTINGS },
    autoOffloadRetiredToOpfs: false,
    updatedAt: ts,
  };
}

export function buildEmptyShellSnapshot(): BarnDatabaseSnapshot {
  const ts = nowIsoUtc();
  return {
    settings: buildEmptyFallbackSettings(),
    speciesProfiles: PREDEFINED_SPECIES_PRESETS.map((p, idx) => ({
      ...p,
      sortOrder: idx,
      createdAt: ts,
      updatedAt: ts,
    })),
    animals: [],
    animalPhotos: [],
    cages: [],
    breedings: [],
    tasks: [],
    careLogs: [],
    shows: [],
    feedBatches: [],
    feedAllocations: [],
    ledgerEntries: [],
    processingLogs: [],
    youthProjectBooks: [],
  };
}

// ---------------------------------------------------------------------------
// Unified Backup Vault Envelope, Schema Migration & Root Validation
// ---------------------------------------------------------------------------

function buildVaultEnvelopeParts(
  snapshot: BarnDatabaseSnapshot,
  options: {
    kind: VaultBackupKind;
    createdAtIso?: string;
    createdByAppVersion?: string;
    note?: string;
  }
): {
  envelope: VaultBackupEnvelope;
  headerJson: string;
  snapshotJson: string;
} {
  const createdAtIso = options.createdAtIso || nowIsoUtc();
  const snapshotJson = JSON.stringify(snapshot);
  const checksumSha256 = sha256HexPure(snapshotJson);
  const sanitizedNote = options.note ? sanitizeSingleLineText(options.note, 220) : undefined;
  const headerFields: Omit<VaultBackupEnvelope, 'snapshot'> = {
    format: 'community-pedigree-vault-backup',
    package: 'Pedigree',
    version: 5,
    _schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    createdAtIso,
    createdByAppVersion: options.createdByAppVersion || APP_SCHEMA_BUILD_TAG,
    vaultKind: options.kind,
    checksumSha256,
    note: sanitizedNote,
  };
  return {
    envelope: {
      ...headerFields,
      snapshot,
    },
    headerJson: JSON.stringify(headerFields),
    snapshotJson,
  };
}

export function buildVaultBackupEnvelope(
  snapshot: BarnDatabaseSnapshot,
  options: {
    kind: VaultBackupKind;
    createdAtIso?: string;
    createdByAppVersion?: string;
    note?: string;
  }
): VaultBackupEnvelope {
  return buildVaultEnvelopeParts(snapshot, options).envelope;
}

export function serializeVaultBackupEnvelope(
  snapshot: BarnDatabaseSnapshot,
  options: {
    kind: VaultBackupKind;
    createdAtIso?: string;
    createdByAppVersion?: string;
    note?: string;
  }
): { envelope: VaultBackupEnvelope; jsonText: string } {
  const envelope = buildVaultBackupEnvelope(snapshot, options);
  const jsonText = JSON.stringify(envelope, null, 2);
  return { envelope, jsonText };
}

export interface PreUpgradeBackupVerificationResult {
  ok: boolean;
  checksumSha256: string;
  schemaVersion: number;
  animalCount: number;
  reason?: string;
}

/**
 * Generates a `_schemaVersion`-stamped, SHA-256-checksummed `pre_upgrade` JSON backup
 * and validates its round-trip parse & checksum in memory before returning.
 */
export function buildVerifiedPreUpgradeJsonBackup(
  snapshot: BarnDatabaseSnapshot,
  createdByAppVersion: string = APP_SCHEMA_BUILD_TAG,
  note = 'Automated pre-upgrade SHA-256 verified backup'
): {
  envelope: VaultBackupEnvelope;
  jsonText: string;
  verification: PreUpgradeBackupVerificationResult;
} {
  const { envelope, jsonText } = serializeVaultBackupEnvelope(snapshot, {
    kind: 'pre_upgrade',
    createdByAppVersion,
    note,
  });
  const verification = verifyPreUpgradeJsonBackup(jsonText, envelope.checksumSha256);
  if (!verification.ok) {
    throw new Error(verification.reason || 'Pre-upgrade backup checksum verification failed.');
  }
  return { envelope, jsonText, verification };
}

export function verifyPreUpgradeJsonBackup(
  jsonText: string,
  expectedChecksumSha256?: string
): PreUpgradeBackupVerificationResult {
  try {
    const parsedRaw = JSON.parse(jsonText) as Record<string, unknown>;
    const declaredChecksum =
      typeof parsedRaw?.checksumSha256 === 'string'
        ? parsedRaw.checksumSha256.trim().toLowerCase()
        : '';
    if (!declaredChecksum) {
      return {
        ok: false,
        checksumSha256: '',
        schemaVersion: Number(parsedRaw?._schemaVersion) || 0,
        animalCount: 0,
        reason: 'Pre-upgrade backup is missing a SHA-256 checksum.',
      };
    }
    if (expectedChecksumSha256 && declaredChecksum !== expectedChecksumSha256.trim().toLowerCase()) {
      return {
        ok: false,
        checksumSha256: declaredChecksum,
        schemaVersion: Number(parsedRaw?._schemaVersion) || 0,
        animalCount: 0,
        reason: 'Pre-upgrade backup SHA-256 checksum mismatch.',
      };
    }
    const migrated = migrateAndValidateBackupEnvelope(parsedRaw);
    return {
      ok: migrated.checksumValid === true,
      checksumSha256: declaredChecksum,
      schemaVersion: migrated.schemaVersion,
      animalCount: migrated.snapshot.animals.length,
    };
  } catch (err) {
    return {
      ok: false,
      checksumSha256: '',
      schemaVersion: 0,
      animalCount: 0,
      reason: err instanceof Error ? err.message : 'Pre-upgrade backup verification failed.',
    };
  }
}

export const VAULT_ZIP_ENTRY_NAME = 'vault-backup.json';

export function isZipMagicBytes(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  );
}

/**
 * Serializes a schema-v6 vault backup envelope into a compact deflate-compressed `.vault.zip` archive,
 * avoiding pretty-print whitespace bloat and reducing OPFS quota footprint by ~70–90% on text/records.
 * Reuses `snapshotJson` once instead of stringifying the entire snapshot tree twice in memory.
 */
export function serializeCompressedVaultBackupZip(
  snapshot: BarnDatabaseSnapshot,
  options: {
    kind: VaultBackupKind;
    createdAtIso?: string;
    createdByAppVersion?: string;
    note?: string;
  }
): { envelope: VaultBackupEnvelope; zipBytes: Uint8Array } {
  const { envelope, headerJson, snapshotJson } = buildVaultEnvelopeParts(snapshot, options);
  const compactJson = `${headerJson.slice(0, -1)},"snapshot":${snapshotJson}}`;
  const zipBytes = zipSync({
    [VAULT_ZIP_ENTRY_NAME]: [strToU8(compactJson), { level: 6 }],
  });
  return { envelope, zipBytes };
}

/**
 * Extracts raw JSON string from either a plain `.json` vault file or a compressed `.vault.zip` archive.
 */
export function extractVaultJsonTextFromPayload(
  payload: string | Uint8Array,
  fileName = 'vault-backup'
): string {
  if (typeof payload === 'string') {
    return payload;
  }
  if (isZipMagicBytes(payload) || fileName.toLowerCase().endsWith('.zip')) {
    const sizeCheck = validateUploadFileSize(
      fileName || 'vault-backup.zip',
      payload.byteLength,
      MAX_ZIP_ARCHIVE_BYTES,
      'a compressed vault backup'
    );
    if (!sizeCheck.ok) {
      throw new Error(sizeCheck.error);
    }
    const unzipped = safeUnzipArchive(payload, {
      archiveName: fileName || 'vault-backup.zip',
      entryFilter: (entryPath) =>
        entryPath === VAULT_ZIP_ENTRY_NAME || entryPath.toLowerCase().endsWith('.json'),
    });
    const inner =
      unzipped[VAULT_ZIP_ENTRY_NAME] ??
      Object.entries(unzipped).find(([p]) => p.toLowerCase().endsWith('.json'))?.[1];
    if (!inner || inner.byteLength === 0) {
      throw new Error('Compressed vault backup archive does not contain vault-backup.json.');
    }
    return strFromU8(inner);
  }
  return strFromU8(payload);
}

/**
 * Validates root JSON shape, verifies optional SHA-256 vault checksums, and transforms
 * legacy `v3`/`v4`/`v5` or nested Vault `_schemaVersion` payloads in memory BEFORE committing
 * anything to SQLite/IndexedDB.
 */
export function migrateAndValidateBackupEnvelope(
  rawInput: string | Record<string, unknown>,
  fallbackSettings: BarnSettings = buildEmptyFallbackSettings()
): MigratedBackupResult {
  let rawObj: unknown;
  if (typeof rawInput === 'string') {
    const sizeCheck = validateUploadFileSize(
      'vault-backup.json',
      rawInput.length,
      MAX_JSON_BACKUP_BYTES,
      'a JSON backup file'
    );
    if (!sizeCheck.ok) {
      throw new Error(sizeCheck.error);
    }
    rawObj = JSON.parse(rawInput);
  } else {
    rawObj = rawInput;
  }

  if (!rawObj || typeof rawObj !== 'object' || Array.isArray(rawObj)) {
    throw new Error('Backup JSON root must be a non-empty JSON object.');
  }

  const record = rawObj as Record<string, unknown>;
  const isVaultEnvelope =
    record.format === 'community-pedigree-vault-backup' &&
    record.snapshot &&
    typeof record.snapshot === 'object' &&
    !Array.isArray(record.snapshot);

  const schemaVersionRaw = Number(record._schemaVersion ?? record.version ?? 0);
  const migratedFromVersion =
    Number.isFinite(schemaVersionRaw) && schemaVersionRaw > 0 ? Math.round(schemaVersionRaw) : 5;

  const vaultKind: VaultBackupKind =
    record.vaultKind === 'monthly' ||
    record.vaultKind === 'pre_upgrade' ||
    record.vaultKind === 'manual' ||
    record.vaultKind === 'pre_reset' ||
    record.vaultKind === 'recovery_dump'
      ? record.vaultKind
      : 'manual';

  const createdAtIso =
    typeof record.createdAtIso === 'string' && record.createdAtIso
      ? record.createdAtIso
      : typeof record.exportedAtIsoUtc === 'string' && record.exportedAtIsoUtc
      ? record.exportedAtIsoUtc
      : nowIsoUtc();

  const note =
    typeof record.note === 'string' && record.note.trim()
      ? sanitizeSingleLineText(record.note, 220)
      : undefined;

  if (isVaultEnvelope) {
    const rawSnapshotObj = record.snapshot as Record<string, unknown>;
    if (!Array.isArray(rawSnapshotObj.animals) || !Array.isArray(rawSnapshotObj.speciesProfiles)) {
      throw new Error('Vault backup envelope is missing required animals or speciesProfiles collections.');
    }

    const rawSnapshotJson = JSON.stringify(rawSnapshotObj);
    let checksumValid: boolean | null = null;
    if (typeof record.checksumSha256 === 'string' && record.checksumSha256.trim()) {
      const computed = sha256HexPure(rawSnapshotJson);
      checksumValid = computed === record.checksumSha256.trim().toLowerCase();
      if (!checksumValid) {
        throw new Error(
          'Vault backup checksum verification failed — the file may be truncated or corrupted.'
        );
      }
    }

    const migratedSnapshot = parseBarnBackupJson(rawSnapshotJson, fallbackSettings);
    return {
      snapshot: migratedSnapshot,
      schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
      migratedFromVersion,
      vaultKind,
      createdAtIso,
      checksumValid,
      note,
    };
  }

  // Legacy or direct `community-pedigree-backup` / raw `BarnDatabaseSnapshot` JSON
  const snapshotJson = typeof rawInput === 'string' ? rawInput : JSON.stringify(record);
  const migratedSnapshot = parseBarnBackupJson(snapshotJson, fallbackSettings);

  return {
    snapshot: migratedSnapshot,
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    migratedFromVersion,
    vaultKind,
    createdAtIso,
    checksumValid: null,
    note,
  };
}

/**
 * Accepts either plain `.json` vault text or compressed `.vault.zip` bytes and migrates/validates cleanly.
 */
export function deserializeVaultBackupPayload(
  payload: string | Uint8Array,
  fallbackSettings: BarnSettings = buildEmptyFallbackSettings(),
  fileName = 'vault-backup'
): MigratedBackupResult {
  const jsonText = extractVaultJsonTextFromPayload(payload, fileName);
  return migrateAndValidateBackupEnvelope(jsonText, fallbackSettings);
}

// ---------------------------------------------------------------------------
// Export Canary Probe & Round-Trip Checksum Verifier
// ---------------------------------------------------------------------------

export function buildExportCanaryProbe(snapshot: BarnDatabaseSnapshot): ExportCanaryProbe {
  const sample = (snapshot.animals || []).slice(0, 12);
  const sampleAnimalIds = sample.map((a) => a.id);
  const sampleAnimalNames = sample.map((a) => a.name);
  const barnName = snapshot.settings?.barnName || 'My Barn';
  const animalCount = (snapshot.animals || []).length;
  const speciesCount = (snapshot.speciesProfiles || []).length;
  const bodyToHash = JSON.stringify({
    barnName,
    animalCount,
    speciesCount,
    sampleAnimalIds,
    sampleAnimalNames,
  });
  return {
    format: 'community-pedigree-canary-v1',
    _schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    createdAtIso: nowIsoUtc(),
    barnName,
    animalCount,
    speciesCount,
    sampleAnimalIds,
    sampleAnimalNames,
    checksumSha256: sha256HexPure(bodyToHash),
  };
}

export function verifyExportCanaryRoundTrip(
  expected: ExportCanaryProbe,
  roundTrippedJson: string
): ExportCanaryVerificationResult {
  try {
    const parsed = JSON.parse(roundTrippedJson) as Partial<ExportCanaryProbe>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, reason: 'Canary file did not parse into an object.' };
    }
    if (parsed.format !== 'community-pedigree-canary-v1') {
      return { ok: false, reason: 'Canary format header mismatch after OPFS read-back.' };
    }
    if (parsed._schemaVersion !== expected._schemaVersion) {
      return { ok: false, reason: 'Canary schema version drifted on OPFS read-back.' };
    }
    if (!Array.isArray(parsed.sampleAnimalIds) || !Array.isArray(parsed.sampleAnimalNames)) {
      return { ok: false, reason: 'Canary collections missing after OPFS read-back.' };
    }
    const recomputed = sha256HexPure(
      JSON.stringify({
        barnName: parsed.barnName || '',
        animalCount: Number(parsed.animalCount) || 0,
        speciesCount: Number(parsed.speciesCount) || 0,
        sampleAnimalIds: parsed.sampleAnimalIds,
        sampleAnimalNames: parsed.sampleAnimalNames,
      })
    );
    if (
      recomputed !== expected.checksumSha256 ||
      parsed.checksumSha256 !== expected.checksumSha256 ||
      parsed.animalCount !== expected.animalCount ||
      parsed.speciesCount !== expected.speciesCount ||
      parsed.sampleAnimalIds.length !== expected.sampleAnimalIds.length ||
      parsed.sampleAnimalIds.some((id, idx) => id !== expected.sampleAnimalIds[idx]) ||
      parsed.sampleAnimalNames.some((n, idx) => n !== expected.sampleAnimalNames[idx])
    ) {
      return { ok: false, reason: 'Canary checksum or record payload mismatch on OPFS read-back.' };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'Canary probe verification threw unexpectedly.',
    };
  }
}

// ---------------------------------------------------------------------------
// Archived Herds Packager (`/archives` Offload & Pedigree-Stub-Safe Restore)
// ---------------------------------------------------------------------------

function sanitizeArchiveSegment(raw: string, fallback: string): string {
  const cleaned = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 44);
  return cleaned || fallback;
}

/**
 * Walks pedigree ancestor links from all remaining (non-offloaded) animals so any target animal
 * appearing anywhere in an active pedigree ancestor chain retains a lightweight Pedigree Reference stub
 * in SQLite/IndexedDB (keeping multi-generation COI & pedigrees 100% unbroken).
 */
export function computePedigreeReferencedIds(
  allAnimals: Animal[],
  offloadingIds: Set<string>
): Set<string> {
  const byId = new Map(allAnimals.map((a) => [a.id, a]));
  const needed = new Set<string>();
  const queue: string[] = [];

  for (const a of allAnimals) {
    if (!offloadingIds.has(a.id)) {
      if (a.sireId) queue.push(a.sireId);
      if (a.damId) queue.push(a.damId);
    }
  }

  const visited = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (!id || visited.has(id)) continue;
    visited.add(id);
    if (offloadingIds.has(id)) {
      needed.add(id);
    }
    const node = byId.get(id);
    if (node) {
      if (node.sireId) queue.push(node.sireId);
      if (node.damId) queue.push(node.damId);
    }
  }

  return needed;
}

export function buildArchivedAnimalsBundle(
  snapshot: BarnDatabaseSnapshot,
  targetAnimalIds: string[],
  createdAtIso: string = nowIsoUtc()
): BuiltArchivedBundleResult {
  const requestedSet = new Set(targetAnimalIds);
  const targets = snapshot.animals.filter((a) => requestedSet.has(a.id));
  if (targets.length === 0) {
    throw new Error('Select at least one animal to offload into OPFS /archives.');
  }

  const targetIdSet = new Set(targets.map((a) => a.id));
  const referencedAncestors = computePedigreeReferencedIds(snapshot.animals, targetIdSet);

  const stamp = createdAtIso.replace(/[-:T.Z]/g, '').slice(0, 14);
  const firstAnimal = targets[0];
  const baseSlug =
    targets.length === 1
      ? sanitizeArchiveSegment(`${firstAnimal.species}-${firstAnimal.tattoo || firstAnimal.name}`, 'animal')
      : sanitizeArchiveSegment(`${firstAnimal.species}-cohort-${targets.length}`, 'cohort');
  const archiveKey = `arch-${stamp}-${baseSlug}-${generateUuid().slice(0, 6)}`;
  const fileName = `${archiveKey}.archive.zip`;

  const offloadedPhotos = (snapshot.animalPhotos ?? []).filter((p) => targetIdSet.has(p.animalId));
  const offloadedLogs = snapshot.careLogs.filter((l) => targetIdSet.has(l.animalId));

  const zipFiles: Zippable = {};
  const photoManifest: BackupPhotoManifestEntry[] = [];
  const usedPaths = new Set<string>();
  const storedAnimals: Animal[] = targets.map((a) => ({
    ...a,
    offloadedArchiveKey: undefined,
    offloadedAtIso: undefined,
  }));

  const targetById = new Map(targets.map((a) => [a.id, a]));
  for (let i = 0; i < offloadedPhotos.length; i++) {
    const p = offloadedPhotos[i];
    const srcUrl = p.dataUrl || p.thumbnailDataUrl;
    const decoded = srcUrl ? dataUrlToBinary(srcUrl, p.mimeType) : null;
    if (!decoded || decoded.bytes.byteLength === 0) continue;

    const ext = decoded.mimeType.includes('png')
      ? 'png'
      : decoded.mimeType.includes('jpeg') || decoded.mimeType.includes('jpg')
      ? 'jpg'
      : 'webp';
    let photoPath = `photos/${sanitizeArchiveSegment(p.animalId, 'animal')}/${String(i + 1).padStart(2, '0')}.${ext}`;
    while (usedPaths.has(photoPath)) {
      photoPath = `photos/${sanitizeArchiveSegment(p.animalId, 'animal')}/${String(i + 1).padStart(2, '0')}-${generateUuid().slice(0, 4)}.${ext}`;
    }
    usedPaths.add(photoPath);

    zipFiles[photoPath] = [decoded.bytes, { level: 0 }];
    const parentAnimal = targetById.get(p.animalId);
    photoManifest.push({
      id: p.id,
      species: p.species,
      animalId: p.animalId,
      animalName: parentAnimal?.name || '',
      animalTattoo: parentAnimal?.tattoo || '',
      isPrimary: p.isPrimary,
      sortOrder: p.sortOrder,
      caption: p.caption,
      originalFileName: p.originalFileName || `${i + 1}.${ext}`,
      mimeType: decoded.mimeType,
      width: p.width,
      height: p.height,
      originalBytes: p.originalBytes,
      storedBytes: decoded.bytes.byteLength,
      archivePath: photoPath,
      thumbnailDataUrl: p.thumbnailDataUrl || '',
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });
  }

  const corePayload = {
    format: 'community-pedigree-archived-cohort-v1',
    package: 'Pedigree',
    _schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    archiveKey,
    createdAtIso,
    animals: storedAnimals,
    careLogs: offloadedLogs,
    photoManifest,
  };
  const corePayloadStr = JSON.stringify(corePayload, null, 2);
  const checksumSha256 = sha256HexPure(corePayloadStr);

  const bundleEnvelopeStr = JSON.stringify(
    {
      ...corePayload,
      checksumSha256,
    },
    null,
    2
  );
  zipFiles['archive-bundle.json'] = [strToU8(bundleEnvelopeStr), { level: 6 }];
  zipFiles['README.txt'] = [
    strToU8(
      [
        'Community Pedigree — OPFS Archived Animal / Cohort Bundle',
        `Archive Key: ${archiveKey}`,
        `Archived At: ${createdAtIso}`,
        `Animals: ${storedAnimals.map((a) => `${a.name} (${a.tattoo || a.status})`).join(', ')}`,
        `Photos: ${photoManifest.length} · Care Logs: ${offloadedLogs.length}`,
      ].join('\n')
    ),
    { level: 6 },
  ];

  const zipBytes = zipSync(zipFiles);

  const stubAnimalIds: string[] = [];
  const removedAnimalIds: string[] = [];
  const nextAnimals: Animal[] = [];

  for (const animal of snapshot.animals) {
    if (!targetIdSet.has(animal.id)) {
      nextAnimals.push(animal);
      continue;
    }
    if (referencedAncestors.has(animal.id)) {
      stubAnimalIds.push(animal.id);
      nextAnimals.push({
        id: animal.id,
        tattoo: animal.tattoo,
        name: animal.name,
        species: animal.species,
        breed: animal.breed,
        variety: animal.variety,
        sex: animal.sex,
        status: animal.status === 'Active' || animal.status === 'Junior' ? 'Archived' : animal.status,
        archived: true,
        needsAttention: false,
        ignoredConflicts: [],
        birthDateIso: animal.birthDateIso,
        weightGrams: animal.weightGrams,
        genotype: animal.genotype,
        genotypeRaw: animal.genotypeRaw,
        rufusLevel: animal.rufusLevel,
        registrationNumber: animal.registrationNumber,
        grandChampionNumber: animal.grandChampionNumber,
        legsCount: animal.legsCount,
        cageLocation: '',
        breederName: animal.breederName,
        ownerName: animal.ownerName,
        ownershipType: animal.ownershipType,
        deceasedDateIso: animal.deceasedDateIso,
        deathCause: animal.deathCause,
        soldDateIso: animal.soldDateIso,
        buyerName: animal.buyerName,
        sireId: animal.sireId,
        damId: animal.damId,
        notes: `[Offloaded to OPFS /archives (${archiveKey})]`,
        offloadedArchiveKey: archiveKey,
        offloadedAtIso: createdAtIso,
        createdAt: animal.createdAt,
        updatedAt: createdAtIso,
      });
    } else {
      removedAnimalIds.push(animal.id);
    }
  }

  const stubSet = new Set(stubAnimalIds);
  const nextSnapshot: BarnDatabaseSnapshot = {
    ...snapshot,
    animals: nextAnimals,
    animalPhotos: (snapshot.animalPhotos ?? []).filter((p) => !targetIdSet.has(p.animalId)),
    careLogs: snapshot.careLogs.filter((l) => !targetIdSet.has(l.animalId)),
  };

  const speciesSummary = Array.from(new Set(storedAnimals.map((a) => a.species).filter(Boolean)));
  const indexEntry: ArchivedHerdIndexEntry = {
    archiveKey,
    fileName,
    createdAtIso,
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    byteSize: zipBytes.byteLength,
    checksumSha256,
    speciesSummary,
    animalCount: storedAnimals.length,
    photoCount: photoManifest.length,
    careLogCount: offloadedLogs.length,
    animals: storedAnimals.map((a) => ({
      id: a.id,
      name: a.name,
      tattoo: a.tattoo,
      species: a.species,
      breed: a.breed,
      variety: a.variety,
      sex: a.sex,
      status: a.status,
      birthDateIso: a.birthDateIso,
      soldDateIso: a.soldDateIso,
      deceasedDateIso: a.deceasedDateIso,
      buyerName: a.buyerName,
      deathCause: a.deathCause,
      hasPedigreeStubInDb: stubSet.has(a.id),
    })),
  };

  return {
    archiveKey,
    fileName,
    zipBytes,
    indexEntry,
    nextActiveSnapshot: nextSnapshot,
    stubAnimalIds,
    removedAnimalIds,
  };
}

/**
 * Lightweight metadata-only extractor for `.archive.zip` files used during OPFS
 * `/archives` index self-healing so rebuilding the directory manifest never inflates
 * or base64-encodes binary photos.
 */
export function extractArchiveIndexMetadataOnly(
  zipBytes: Uint8Array,
  fileName: string
): ArchivedHerdIndexEntry {
  const sizeCheck = validateUploadFileSize(
    fileName || 'herd.archive.zip',
    zipBytes.byteLength,
    MAX_ZIP_ARCHIVE_BYTES,
    'an archived animal bundle'
  );
  if (!sizeCheck.ok) {
    throw new Error(sizeCheck.error);
  }

  const unzipped = safeUnzipArchive(zipBytes, {
    archiveName: fileName || 'herd.archive.zip',
    entryFilter: (entryPath) => entryPath === 'archive-bundle.json',
  });
  const bundleEntry = unzipped['archive-bundle.json'];
  if (!bundleEntry) {
    throw new Error('Archive ZIP is missing archive-bundle.json metadata.');
  }
  if (bundleEntry.byteLength > MAX_JSON_BACKUP_BYTES) {
    throw new Error('Archive bundle metadata exceeds the maximum safe JSON limit.');
  }

  const parsed = JSON.parse(strFromU8(bundleEntry)) as Record<string, unknown>;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    parsed.format !== 'community-pedigree-archived-cohort-v1' ||
    !Array.isArray(parsed.animals)
  ) {
    throw new Error('Archive bundle metadata has an invalid root structure.');
  }

  if (typeof parsed.checksumSha256 === 'string' && parsed.checksumSha256) {
    const verificationBody = JSON.stringify(
      {
        format: parsed.format,
        package: parsed.package,
        _schemaVersion: parsed._schemaVersion,
        archiveKey: parsed.archiveKey,
        createdAtIso: parsed.createdAtIso,
        animals: parsed.animals,
        careLogs: parsed.careLogs ?? [],
        photoManifest: parsed.photoManifest ?? [],
      },
      null,
      2
    );
    const computed = sha256HexPure(verificationBody);
    if (computed !== parsed.checksumSha256) {
      throw new Error('Archive bundle checksum verification failed.');
    }
  }

  const ts = nowIsoUtc();
  const fallback = buildEmptyFallbackSettings();
  const normalizedSnap = parseBarnBackupJson(
    JSON.stringify({
      format: 'community-pedigree-backup',
      version: 5,
      settings: fallback,
      speciesProfiles: [],
      animals: parsed.animals,
      careLogs: Array.isArray(parsed.careLogs) ? parsed.careLogs : [],
      cages: [],
      breedings: [],
      tasks: [],
      shows: [],
      animalPhotos: [],
      feedBatches: [],
      feedAllocations: [],
      ledgerEntries: [],
      processingLogs: [],
      youthProjectBooks: [],
    }),
    fallback
  );
  const rawManifest = Array.isArray(parsed.photoManifest) ? parsed.photoManifest : [];

  return {
    archiveKey: sanitizeSingleLineText(String(parsed.archiveKey || ''), 160) || 'archive',
    fileName: sanitizeSingleLineText(fileName, 180) || 'herd.archive.zip',
    createdAtIso: sanitizeSingleLineText(String(parsed.createdAtIso || ts), 64) || ts,
    schemaVersion: Number(parsed._schemaVersion) || CURRENT_BACKUP_SCHEMA_VERSION,
    byteSize: zipBytes.byteLength,
    checksumSha256: String(parsed.checksumSha256 || ''),
    speciesSummary: Array.from(new Set(normalizedSnap.animals.map((a) => a.species).filter(Boolean))),
    animalCount: normalizedSnap.animals.length,
    photoCount: rawManifest.length,
    careLogCount: normalizedSnap.careLogs.length,
    animals: normalizedSnap.animals.map((a) => ({
      id: a.id,
      name: a.name,
      tattoo: a.tattoo,
      species: a.species,
      breed: a.breed,
      variety: a.variety,
      sex: a.sex,
      status: a.status,
      birthDateIso: a.birthDateIso,
      soldDateIso: a.soldDateIso,
      deceasedDateIso: a.deceasedDateIso,
      buyerName: a.buyerName,
      deathCause: a.deathCause,
      hasPedigreeStubInDb: false,
    })),
  };
}

export function unpackArchivedAnimalBundle(
  zipBytes: Uint8Array,
  fallbackSettings: BarnSettings = buildEmptyFallbackSettings()
): UnpackedArchivedHerdBundle {
  const sizeCheck = validateUploadFileSize(
    'herd.archive.zip',
    zipBytes.byteLength,
    MAX_ZIP_ARCHIVE_BYTES,
    'an archived animal bundle'
  );
  if (!sizeCheck.ok) {
    throw new Error(sizeCheck.error);
  }

  const unzipped = safeUnzipArchive(zipBytes, { archiveName: 'herd.archive.zip' });
  const bundleEntry = unzipped['archive-bundle.json'];
  if (!bundleEntry) {
    throw new Error('Archive ZIP is missing archive-bundle.json metadata.');
  }
  if (bundleEntry.byteLength > MAX_JSON_BACKUP_BYTES) {
    throw new Error('Archive bundle metadata exceeds the maximum safe JSON limit.');
  }

  const parsed = JSON.parse(strFromU8(bundleEntry)) as Record<string, unknown>;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    parsed.format !== 'community-pedigree-archived-cohort-v1' ||
    !Array.isArray(parsed.animals)
  ) {
    throw new Error('Archive bundle metadata has an invalid root structure.');
  }

  if (typeof parsed.checksumSha256 === 'string' && parsed.checksumSha256) {
    const verificationBody = JSON.stringify(
      {
        format: parsed.format,
        package: parsed.package,
        _schemaVersion: parsed._schemaVersion,
        archiveKey: parsed.archiveKey,
        createdAtIso: parsed.createdAtIso,
        animals: parsed.animals,
        careLogs: parsed.careLogs ?? [],
        photoManifest: parsed.photoManifest ?? [],
      },
      null,
      2
    );
    const computed = sha256HexPure(verificationBody);
    if (computed !== parsed.checksumSha256) {
      throw new Error('Archive bundle checksum verification failed.');
    }
  }

  // Re-normalize animals & care logs through existing pure parser
  const normalizedSnap = parseBarnBackupJson(
    JSON.stringify({
      format: 'community-pedigree-backup',
      version: 5,
      settings: fallbackSettings,
      speciesProfiles: [],
      animals: parsed.animals,
      careLogs: Array.isArray(parsed.careLogs) ? parsed.careLogs : [],
      cages: [],
      breedings: [],
      tasks: [],
      shows: [],
      animalPhotos: [],
      feedBatches: [],
      feedAllocations: [],
      ledgerEntries: [],
      processingLogs: [],
      youthProjectBooks: [],
    }),
    fallbackSettings
  );

  const ts = nowIsoUtc();
  const reconstructedPhotos: AnimalPhoto[] = [];
  const rawManifest = Array.isArray(parsed.photoManifest) ? parsed.photoManifest : [];
  for (let i = 0; i < rawManifest.length; i++) {
    const entry = rawManifest[i] as Record<string, any>;
    const archivePath = sanitizeSingleLineText(String(entry?.archivePath || ''), 300);
    if (!archivePath || !entry?.animalId) continue;
    const imgBytes = unzipped[archivePath];
    if (!imgBytes || imgBytes.byteLength === 0) continue;
    const mimeType = sanitizeSingleLineText(String(entry.mimeType || 'image/webp'), 80) || 'image/webp';
    if (isSvgImageInput(mimeType, archivePath, imgBytes)) continue;
    const dataUrl = sanitizeSafeRasterImageDataUrl(binaryToDataUrl(mimeType, imgBytes));
    if (!dataUrl) continue;
    const safeThumb = sanitizeSafeRasterImageDataUrl(entry.thumbnailDataUrl) || dataUrl;
    reconstructedPhotos.push({
      id: sanitizeSingleLineText(String(entry.id || ''), 120) || generateUuid(),
      species: sanitizeSingleLineText(String(entry.species || 'Rabbit'), 100) || 'Rabbit',
      animalId: sanitizeSingleLineText(String(entry.animalId), 120),
      isPrimary: Boolean(entry.isPrimary),
      sortOrder: typeof entry.sortOrder === 'number' && Number.isFinite(entry.sortOrder) ? entry.sortOrder : i,
      caption: sanitizePlainText(String(entry.caption || ''), 2000),
      originalFileName: sanitizeSingleLineText(String(entry.originalFileName || ''), 260),
      mimeType,
      width: Math.max(0, Number(entry.width) || 0),
      height: Math.max(0, Number(entry.height) || 0),
      originalBytes: Math.max(0, Number(entry.originalBytes) || imgBytes.byteLength),
      storedBytes: imgBytes.byteLength,
      thumbnailDataUrl: safeThumb,
      dataUrl,
      createdAt: sanitizeSingleLineText(String(entry.createdAt || ts), 64) || ts,
      updatedAt: sanitizeSingleLineText(String(entry.updatedAt || ts), 64) || ts,
    });
  }

  return {
    archiveKey: sanitizeSingleLineText(String(parsed.archiveKey || ''), 160) || 'archive',
    createdAtIso: sanitizeSingleLineText(String(parsed.createdAtIso || ts), 64) || ts,
    schemaVersion: Number(parsed._schemaVersion) || CURRENT_BACKUP_SCHEMA_VERSION,
    checksumSha256: String(parsed.checksumSha256 || ''),
    animals: normalizedSnap.animals,
    animalPhotos: reconstructedPhotos,
    careLogs: normalizedSnap.careLogs,
  };
}

export function mergeRestoredArchiveIntoSnapshot(
  current: BarnDatabaseSnapshot,
  bundle: UnpackedArchivedHerdBundle,
  options: { restoreToActiveStatus?: boolean } = {}
): {
  nextSnapshot: BarnDatabaseSnapshot;
  restoredAnimalCount: number;
  restoredPhotoCount: number;
  restoredCareLogCount: number;
} {
  const ts = nowIsoUtc();
  const animalMap = new Map<string, Animal>(current.animals.map((a) => [a.id, a]));
  let restoredAnimalCount = 0;

  for (const rawAnimal of bundle.animals) {
    const restored: Animal = {
      ...rawAnimal,
      status: options.restoreToActiveStatus ? 'Active' : rawAnimal.status,
      archived: options.restoreToActiveStatus ? false : rawAnimal.archived,
      offloadedArchiveKey: undefined,
      offloadedAtIso: undefined,
      updatedAt: ts,
    };
    // Ensure a missing species profile doesn't orphan the restored animal
    animalMap.set(restored.id, restored);
    restoredAnimalCount++;
  }

  const photoMap = new Map<string, AnimalPhoto>(
    (current.animalPhotos ?? []).map((p) => [p.id, p])
  );
  let restoredPhotoCount = 0;
  for (const p of bundle.animalPhotos) {
    photoMap.set(p.id, p);
    restoredPhotoCount++;
  }

  const logMap = new Map<string, CareLog>(current.careLogs.map((l) => [l.id, l]));
  let restoredCareLogCount = 0;
  for (const l of bundle.careLogs) {
    logMap.set(l.id, l);
    restoredCareLogCount++;
  }

  // Reconcile speciesProfiles if an archived animal's species was previously deleted
  const nextSpecies = [...current.speciesProfiles];
  for (const a of bundle.animals) {
    if (!nextSpecies.some((sp) => isSameSpecies(sp.name, a.species))) {
      const preset = PREDEFINED_SPECIES_PRESETS.find((p) => isSameSpecies(p.name, a.species));
      if (preset) {
        nextSpecies.push({
          ...preset,
          sortOrder: nextSpecies.length,
          createdAt: ts,
          updatedAt: ts,
        });
      }
    }
  }

  return {
    nextSnapshot: {
      ...current,
      speciesProfiles: nextSpecies,
      animals: Array.from(animalMap.values()),
      animalPhotos: Array.from(photoMap.values()),
      careLogs: Array.from(logMap.values()),
    },
    restoredAnimalCount,
    restoredPhotoCount,
    restoredCareLogCount,
  };
}
