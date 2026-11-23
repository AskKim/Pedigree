/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Optional Cloud App-Folder Sync & Quota Circuit Breaker Engine
 * (`src/core/cloudAppFolderSync.ts`).
 *
 * Scope & Boundaries:
 * - Zero mandatory cloud dependencies. Opt-in only (`enabled: false` by default).
 * - Targets isolated app-specific folders only:
 *     - Google Drive AppFolder (`spaces=appDataFolder`, scope `drive.appdata`)
 *     - Microsoft OneDrive AppRoot (`/me/drive/special/approot`, scope `Files.ReadWrite.AppFolder`)
 * - Storage-threshold-aware incremental delta chunking shrinks batch sizes when local browser
 *   storage is tight (`storagePercentUsed >= threshold` or constrained device Tier <= 2).
 * - Immediate HTTP 403 / 507 quota circuit breaker pauses failing automated cloud syncs, surfaces
 *   persistent warnings, and selects oldest rolling cloud backups for pruning without ever
 *   blocking or rolling back local IndexedDB writes.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`, `fetch`, `localStorage`,
 * `navigator`) or Node dependencies.
 */

import { sanitizeSingleLineText } from './inputSanitization';
import type { DeviceCapabilityTierNumber } from './deviceCapability';
import {
  BarnDatabaseSnapshot,
  nowIsoUtc,
} from './models';
import { SyncOperation } from './syncOutbox';

export type CloudSyncProvider = 'google_drive' | 'onedrive';

export const CLOUD_DELTA_FILE_PREFIX = 'cp-delta-';
export const CLOUD_ROLLING_BACKUP_PREFIX = 'cp-rolling-';

export const DEFAULT_CLOUD_STORAGE_TIGHT_THRESHOLD_PERCENT = 75;
export const DEFAULT_CLOUD_ROLLING_RETENTION_COUNT = 3;
export const MAX_CLOUD_ROLLING_RETENTION_COUNT = 10;
export const MAX_PERSISTED_UPLOADED_OP_IDS = 2500;

export const NORMAL_DELTA_CHUNK_MAX_OPS = 150;
export const NORMAL_DELTA_CHUNK_MAX_BYTES = 256 * 1024;
export const TIGHT_STORAGE_DELTA_CHUNK_MAX_OPS = 25;
export const TIGHT_STORAGE_DELTA_CHUNK_MAX_BYTES = 48 * 1024;

export interface CloudSyncProviderDescriptor {
  id: CloudSyncProvider;
  label: string;
  folderName: string;
  scope: string;
  shortNote: string;
}

export const CLOUD_SYNC_PROVIDER_DESCRIPTORS: Record<
  CloudSyncProvider,
  CloudSyncProviderDescriptor
> = {
  google_drive: {
    id: 'google_drive',
    label: 'Google Drive AppFolder',
    folderName: 'appDataFolder',
    scope: 'https://www.googleapis.com/auth/drive.appdata',
    shortNote:
      'Stores deltas and rolling snapshots only inside this app’s hidden Google Drive AppFolder.',
  },
  onedrive: {
    id: 'onedrive',
    label: 'OneDrive AppRoot',
    folderName: 'special/approot',
    scope: 'Files.ReadWrite.AppFolder',
    shortNote:
      'Stores deltas and rolling snapshots only inside your isolated Apps/Community Pedigree folder on OneDrive.',
  },
};

export interface CloudSyncSettings {
  enabled: boolean;
  provider: CloudSyncProvider;
  autoBackgroundSync: boolean;
  rollingBackupRetentionCount: number;
  storageTightThresholdPercent: number;
  customOAuthClientId: string;
}

export const DEFAULT_CLOUD_SYNC_SETTINGS: CloudSyncSettings = {
  enabled: false,
  provider: 'google_drive',
  autoBackgroundSync: false,
  rollingBackupRetentionCount: DEFAULT_CLOUD_ROLLING_RETENTION_COUNT,
  storageTightThresholdPercent: DEFAULT_CLOUD_STORAGE_TIGHT_THRESHOLD_PERCENT,
  customOAuthClientId: '',
};

export interface CloudQuotaCircuitBreakerState {
  tripped: boolean;
  trippedAtIso: string | null;
  statusCode: 403 | 507 | null;
  provider: CloudSyncProvider | null;
  reason: string | null;
  pausedAutomatedSync: boolean;
  lastPrunedCount: number;
  warningDismissedAtIso: string | null;
}

export interface CloudSyncRuntimeStatus {
  lastSyncAttemptAtIso: string | null;
  lastSuccessfulSyncAtIso: string | null;
  lastChunkStrategy: 'normal' | 'tight_storage_incremental';
  lastUploadedOpsCount: number;
  lastPulledOpsCount: number;
  lastUploadedChunksCount: number;
  lastUploadedRollingBackupName: string | null;
  lastError: string | null;
}

export interface CloudSyncPersistedState {
  version: 1;
  settings: CloudSyncSettings;
  circuitBreaker: CloudQuotaCircuitBreakerState;
  status: CloudSyncRuntimeStatus;
  uploadedOpIdsByProvider: Record<CloudSyncProvider, string[]>;
}

export interface CloudRemoteFileEntry {
  id: string;
  name: string;
  sizeBytes?: number;
  modifiedAtIso?: string;
  etag?: string;
}

export interface CloudDeltaChunkBundle {
  format: 'community-pedigree-cloud-delta-chunk-v1';
  deviceId: string;
  chunkIndex: number;
  totalChunks: number;
  createdAtIso: string;
  strategy: 'normal' | 'tight_storage_incremental';
  operations: SyncOperation[];
}

export interface CloudDeltaChunkPlanItem {
  fileName: string;
  bundle: CloudDeltaChunkBundle;
  estimatedBytes: number;
}

export interface CloudSyncChunkPlan {
  strategy: 'normal' | 'tight_storage_incremental';
  tightReasons: string[];
  maxOpsPerChunk: number;
  maxBytesPerChunk: number;
  pendingOpsCount: number;
  chunks: CloudDeltaChunkPlanItem[];
}

export interface CloudRollingBackupEnvelope {
  format: 'community-pedigree-cloud-rolling-backup-v1';
  createdAtIso: string;
  deviceId: string;
  barnName: string;
  animalCount: number;
  speciesCount: number;
  photoMetadataCount: number;
  snapshot: BarnDatabaseSnapshot;
}

export type CloudHttpFailureKind =
  | 'ok'
  | 'insufficient_storage_507'
  | 'quota_exceeded_403'
  | 'auth_expired_401'
  | 'forbidden_403_other'
  | 'network_or_server';

export interface CloudHttpClassification {
  status: number;
  kind: CloudHttpFailureKind;
  isQuotaBreakerTrigger: boolean;
  isAuthExpired: boolean;
  breakerStatusCode: 403 | 507 | null;
  reason: string;
}

export function isValidCloudSyncProvider(val: unknown): val is CloudSyncProvider {
  return val === 'google_drive' || val === 'onedrive';
}

export function normalizeCloudSyncSettings(raw: unknown): CloudSyncSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_CLOUD_SYNC_SETTINGS };
  }
  const obj = raw as Record<string, unknown>;
  const retentionRaw = Number(obj.rollingBackupRetentionCount);
  const retentionCount = Number.isFinite(retentionRaw)
    ? Math.min(MAX_CLOUD_ROLLING_RETENTION_COUNT, Math.max(1, Math.round(retentionRaw)))
    : DEFAULT_CLOUD_ROLLING_RETENTION_COUNT;

  const thresholdRaw = Number(obj.storageTightThresholdPercent);
  const threshold = Number.isFinite(thresholdRaw)
    ? Math.min(98, Math.max(50, Math.round(thresholdRaw)))
    : DEFAULT_CLOUD_STORAGE_TIGHT_THRESHOLD_PERCENT;

  return {
    enabled: obj.enabled === true,
    provider: isValidCloudSyncProvider(obj.provider) ? obj.provider : 'google_drive',
    autoBackgroundSync: obj.autoBackgroundSync === true,
    rollingBackupRetentionCount: retentionCount,
    storageTightThresholdPercent: threshold,
    customOAuthClientId:
      typeof obj.customOAuthClientId === 'string'
        ? sanitizeSingleLineText(obj.customOAuthClientId, 200)
        : '',
  };
}

export function createDefaultCloudQuotaCircuitBreaker(): CloudQuotaCircuitBreakerState {
  return {
    tripped: false,
    trippedAtIso: null,
    statusCode: null,
    provider: null,
    reason: null,
    pausedAutomatedSync: false,
    lastPrunedCount: 0,
    warningDismissedAtIso: null,
  };
}

export function normalizeCloudQuotaCircuitBreakerState(
  raw: unknown
): CloudQuotaCircuitBreakerState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createDefaultCloudQuotaCircuitBreaker();
  }
  const obj = raw as Record<string, unknown>;
  const tripped = obj.tripped === true;
  const statusCode = obj.statusCode === 403 || obj.statusCode === 507 ? obj.statusCode : null;
  const prunedNum = Number(obj.lastPrunedCount);

  return {
    tripped,
    trippedAtIso: typeof obj.trippedAtIso === 'string' && obj.trippedAtIso ? obj.trippedAtIso : null,
    statusCode,
    provider: isValidCloudSyncProvider(obj.provider) ? obj.provider : null,
    reason:
      typeof obj.reason === 'string' && obj.reason.trim().length > 0
        ? sanitizeSingleLineText(obj.reason, 400)
        : null,
    pausedAutomatedSync: obj.pausedAutomatedSync === true || tripped,
    lastPrunedCount: Number.isFinite(prunedNum) && prunedNum >= 0 ? Math.round(prunedNum) : 0,
    warningDismissedAtIso:
      typeof obj.warningDismissedAtIso === 'string' && obj.warningDismissedAtIso
        ? obj.warningDismissedAtIso
        : null,
  };
}

export function createDefaultCloudSyncRuntimeStatus(): CloudSyncRuntimeStatus {
  return {
    lastSyncAttemptAtIso: null,
    lastSuccessfulSyncAtIso: null,
    lastChunkStrategy: 'normal',
    lastUploadedOpsCount: 0,
    lastPulledOpsCount: 0,
    lastUploadedChunksCount: 0,
    lastUploadedRollingBackupName: null,
    lastError: null,
  };
}

export function normalizeCloudSyncRuntimeStatus(raw: unknown): CloudSyncRuntimeStatus {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createDefaultCloudSyncRuntimeStatus();
  }
  const obj = raw as Record<string, unknown>;
  const cleanCount = (val: unknown) => {
    const n = Number(val);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
  };
  return {
    lastSyncAttemptAtIso:
      typeof obj.lastSyncAttemptAtIso === 'string' ? obj.lastSyncAttemptAtIso : null,
    lastSuccessfulSyncAtIso:
      typeof obj.lastSuccessfulSyncAtIso === 'string' ? obj.lastSuccessfulSyncAtIso : null,
    lastChunkStrategy:
      obj.lastChunkStrategy === 'tight_storage_incremental'
        ? 'tight_storage_incremental'
        : 'normal',
    lastUploadedOpsCount: cleanCount(obj.lastUploadedOpsCount),
    lastPulledOpsCount: cleanCount(obj.lastPulledOpsCount),
    lastUploadedChunksCount: cleanCount(obj.lastUploadedChunksCount),
    lastUploadedRollingBackupName:
      typeof obj.lastUploadedRollingBackupName === 'string'
        ? sanitizeSingleLineText(obj.lastUploadedRollingBackupName, 160)
        : null,
    lastError:
      typeof obj.lastError === 'string' && obj.lastError.trim().length > 0
        ? sanitizeSingleLineText(obj.lastError, 400)
        : null,
  };
}

export function createDefaultCloudSyncState(): CloudSyncPersistedState {
  return {
    version: 1,
    settings: { ...DEFAULT_CLOUD_SYNC_SETTINGS },
    circuitBreaker: createDefaultCloudQuotaCircuitBreaker(),
    status: createDefaultCloudSyncRuntimeStatus(),
    uploadedOpIdsByProvider: {
      google_drive: [],
      onedrive: [],
    },
  };
}

export function normalizeCloudSyncPersistedState(raw: unknown): CloudSyncPersistedState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createDefaultCloudSyncState();
  }
  const obj = raw as Record<string, unknown>;
  const rawUploaded =
    obj.uploadedOpIdsByProvider && typeof obj.uploadedOpIdsByProvider === 'object'
      ? (obj.uploadedOpIdsByProvider as Record<string, unknown>)
      : {};
  const cleanIds = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of arr) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
    return out.length > MAX_PERSISTED_UPLOADED_OP_IDS
      ? out.slice(out.length - MAX_PERSISTED_UPLOADED_OP_IDS)
      : out;
  };

  return {
    version: 1,
    settings: normalizeCloudSyncSettings(obj.settings),
    circuitBreaker: normalizeCloudQuotaCircuitBreakerState(obj.circuitBreaker),
    status: normalizeCloudSyncRuntimeStatus(obj.status),
    uploadedOpIdsByProvider: {
      google_drive: cleanIds(rawUploaded.google_drive),
      onedrive: cleanIds(rawUploaded.onedrive),
    },
  };
}

/**
 * Classifies HTTP responses from Google Drive / OneDrive REST APIs so HTTP 507
 * (`Insufficient Storage`) and HTTP 403 quota/limit failures immediately trip
 * the circuit breaker while 401 token expiry triggers auth refresh handling cleanly.
 */
export function classifyCloudHttpResponse(params: {
  status: number;
  bodyText?: string;
  isWriteOperation?: boolean;
}): CloudHttpClassification {
  const status = Math.round(params.status);
  const body = typeof params.bodyText === 'string' ? params.bodyText : '';
  const bodyLower = body.toLowerCase();

  if (status >= 200 && status < 300) {
    return {
      status,
      kind: 'ok',
      isQuotaBreakerTrigger: false,
      isAuthExpired: false,
      breakerStatusCode: null,
      reason: 'OK',
    };
  }

  if (status === 507) {
    return {
      status: 507,
      kind: 'insufficient_storage_507',
      isQuotaBreakerTrigger: true,
      isAuthExpired: false,
      breakerStatusCode: 507,
      reason:
        'Cloud app folder returned HTTP 507 Insufficient Storage. Automated cloud sync paused and older cloud backups scheduled for pruning.',
    };
  }

  if (status === 401) {
    return {
      status: 401,
      kind: 'auth_expired_401',
      isQuotaBreakerTrigger: false,
      isAuthExpired: true,
      breakerStatusCode: null,
      reason: 'Cloud access token expired or was revoked (HTTP 401). Reconnect to resume cloud sync.',
    };
  }

  if (status === 403) {
    const explicitPermissionDeny =
      bodyLower.includes('accessnotconfigured') ||
      bodyLower.includes('insufficientpermissions') ||
      bodyLower.includes('insufficient_scope') ||
      bodyLower.includes('invalid_scope');

    const explicitQuotaHint =
      bodyLower.includes('quota') ||
      bodyLower.includes('storagequotaexceeded') ||
      bodyLower.includes('insufficientstorage') ||
      bodyLower.includes('limitexceeded') ||
      bodyLower.includes('ratelimitexceeded') ||
      bodyLower.includes('dailylimitexceeded') ||
      bodyLower.includes('space') ||
      bodyLower.includes('storage full') ||
      bodyLower.includes('exceeded');

    if (explicitQuotaHint || (params.isWriteOperation === true && !explicitPermissionDeny)) {
      return {
        status: 403,
        kind: 'quota_exceeded_403',
        isQuotaBreakerTrigger: true,
        isAuthExpired: false,
        breakerStatusCode: 403,
        reason:
          'Cloud provider returned HTTP 403 Quota / Rate Limit Exceeded. Automated cloud sync paused immediately to protect local edits and prune old cloud backups.',
      };
    }

    return {
      status: 403,
      kind: 'forbidden_403_other',
      isQuotaBreakerTrigger: false,
      isAuthExpired: false,
      breakerStatusCode: null,
      reason:
        'Cloud provider rejected access (HTTP 403 Forbidden — check app-folder OAuth scope and permissions).',
    };
  }

  return {
    status,
    kind: 'network_or_server',
    isQuotaBreakerTrigger: false,
    isAuthExpired: false,
    breakerStatusCode: null,
    reason: `Cloud sync HTTP ${status} response.`,
  };
}

export function tripCloudQuotaCircuitBreaker(
  prev: CloudQuotaCircuitBreakerState,
  params: {
    provider: CloudSyncProvider;
    statusCode: 403 | 507;
    reason?: string;
    nowIso?: string;
    prunedCount?: number;
  }
): CloudQuotaCircuitBreakerState {
  const now = params.nowIso || nowIsoUtc();
  const cleanReason =
    params.reason && params.reason.trim().length > 0
      ? sanitizeSingleLineText(params.reason, 400)
      : `Cloud storage or quota ceiling reached (HTTP ${params.statusCode}). Automated cloud sync is paused.`;
  const prunedCount =
    typeof params.prunedCount === 'number' && Number.isFinite(params.prunedCount)
      ? Math.max(0, Math.round(params.prunedCount))
      : prev.lastPrunedCount;

  return {
    tripped: true,
    trippedAtIso: now,
    statusCode: params.statusCode,
    provider: params.provider,
    reason: cleanReason,
    pausedAutomatedSync: true,
    lastPrunedCount: prunedCount,
    warningDismissedAtIso: null,
  };
}

export function resetCloudQuotaCircuitBreaker(): CloudQuotaCircuitBreakerState {
  return createDefaultCloudQuotaCircuitBreaker();
}

export function dismissCloudCircuitBreakerWarning(
  prev: CloudQuotaCircuitBreakerState,
  nowIso?: string
): CloudQuotaCircuitBreakerState {
  if (!prev.tripped) return prev;
  return {
    ...prev,
    warningDismissedAtIso: nowIso || nowIsoUtc(),
  };
}

export function shouldRunAutomatedCloudSync(params: {
  settings: CloudSyncSettings;
  circuitBreaker: CloudQuotaCircuitBreakerState;
  isOnline: boolean;
  hasToken: boolean;
}): { allowed: boolean; skipReason?: string } {
  if (!params.settings.enabled) {
    return { allowed: false, skipReason: 'Cloud App-Folder Sync is disabled.' };
  }
  if (!params.settings.autoBackgroundSync) {
    return { allowed: false, skipReason: 'Background auto-sync is turned off.' };
  }
  if (params.circuitBreaker.tripped || params.circuitBreaker.pausedAutomatedSync) {
    return {
      allowed: false,
      skipReason: `Quota circuit breaker is open (HTTP ${params.circuitBreaker.statusCode ?? '403/507'}). Reset breaker after freeing cloud space.`,
    };
  }
  if (!params.isOnline) {
    return { allowed: false, skipReason: 'Device is currently offline.' };
  }
  if (!params.hasToken) {
    return { allowed: false, skipReason: 'No active in-memory OAuth token is connected.' };
  }
  return { allowed: true };
}

function formatUtcSlugCompact(isoUtc: string): string {
  return isoUtc.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace(/[^0-9TZ]/gi, '');
}

function sanitizeFilenameSegment(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return cleaned || fallback;
}

export function buildCloudDeltaChunkFileName(params: {
  deviceId: string;
  createdAtIso: string;
  chunkIndex: number;
}): string {
  const safeDevice = sanitizeFilenameSegment(params.deviceId, 'device');
  const slug = formatUtcSlugCompact(params.createdAtIso);
  const idx = String(Math.max(1, params.chunkIndex)).padStart(3, '0');
  return `${CLOUD_DELTA_FILE_PREFIX}${safeDevice}-${slug}-c${idx}.json`;
}

export function isCloudDeltaChunkFileName(name: string): boolean {
  return name.startsWith(CLOUD_DELTA_FILE_PREFIX) && name.toLowerCase().endsWith('.json');
}

export function buildRollingCloudBackupFileName(params: {
  deviceId: string;
  createdAtIso: string;
}): string {
  const safeDevice = sanitizeFilenameSegment(params.deviceId, 'device');
  const slug = formatUtcSlugCompact(params.createdAtIso);
  return `${CLOUD_ROLLING_BACKUP_PREFIX}${slug}-${safeDevice}.json`;
}

export function parseRollingCloudBackupTimestampMs(name: string): number {
  if (!name.startsWith(CLOUD_ROLLING_BACKUP_PREFIX) || !name.toLowerCase().endsWith('.json')) {
    return 0;
  }
  const rest = name.slice(CLOUD_ROLLING_BACKUP_PREFIX.length);
  const match = rest.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/);
  if (!match) return 0;
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export function isRollingCloudBackupFileName(name: string): boolean {
  return name.startsWith(CLOUD_ROLLING_BACKUP_PREFIX) && name.toLowerCase().endsWith('.json');
}

/**
 * Selects oldest rolling cloud backup files to delete so at most `keepNewestCount`
 * remain on the remote cloud app folder. Non-rolling files and delta chunks are untouched.
 */
export function selectRollingCloudBackupsToPrune(
  remoteFiles: CloudRemoteFileEntry[],
  keepNewestCount: number
): CloudRemoteFileEntry[] {
  const rollingOnly = remoteFiles.filter((f) => isRollingCloudBackupFileName(f.name));
  if (rollingOnly.length === 0) return [];

  const keep = Math.max(0, Math.round(keepNewestCount));
  if (rollingOnly.length <= keep) return [];

  const sortedNewestFirst = [...rollingOnly].sort((a, b) => {
    const tsA = parseRollingCloudBackupTimestampMs(a.name);
    const tsB = parseRollingCloudBackupTimestampMs(b.name);
    if (tsA !== tsB) return tsB - tsA;

    const modA = a.modifiedAtIso ? Date.parse(a.modifiedAtIso) : 0;
    const modB = b.modifiedAtIso ? Date.parse(b.modifiedAtIso) : 0;
    if (Number.isFinite(modA) && Number.isFinite(modB) && modA !== modB) {
      return modB - modA;
    }
    return b.name.localeCompare(a.name);
  });

  return sortedNewestFirst.slice(keep);
}

function estimateJsonUtf8ByteLength(value: unknown): number {
  const json = JSON.stringify(value);
  // Pure byte length estimation for UTF-8 without DOM TextEncoder dependency
  let bytes = 0;
  for (let i = 0; i < json.length; i += 1) {
    const code = json.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * Plans incremental cloud delta chunks for operations not yet acknowledged on the
 * selected provider. Automatically switches to tight-storage incremental chunking
 * (smaller operation count & byte ceiling per request) when device storage usage meets
 * or exceeds the threshold or when device memory tier is Tier 1–2.
 */
export function planIncrementalCloudDeltaChunks(params: {
  deviceId: string;
  operations: SyncOperation[];
  alreadyUploadedOpIds: Iterable<string>;
  storagePercentUsed?: number | null;
  storageTightThresholdPercent?: number;
  deviceTier?: DeviceCapabilityTierNumber;
  createdAtIso?: string;
}): CloudSyncChunkPlan {
  const threshold = Math.min(
    98,
    Math.max(
      50,
      Math.round(
        params.storageTightThresholdPercent ?? DEFAULT_CLOUD_STORAGE_TIGHT_THRESHOLD_PERCENT
      )
    )
  );
  const tightReasons: string[] = [];
  if (
    typeof params.storagePercentUsed === 'number' &&
    Number.isFinite(params.storagePercentUsed) &&
    params.storagePercentUsed >= threshold
  ) {
    tightReasons.push(
      `Local storage usage is ${Math.round(params.storagePercentUsed)}% (>= ${threshold}% threshold)`
    );
  }
  if (typeof params.deviceTier === 'number' && params.deviceTier <= 2) {
    tightReasons.push(`Constrained Device Tier ${params.deviceTier}`);
  }

  const strategy: 'normal' | 'tight_storage_incremental' =
    tightReasons.length > 0 ? 'tight_storage_incremental' : 'normal';
  const maxOpsPerChunk =
    strategy === 'tight_storage_incremental'
      ? TIGHT_STORAGE_DELTA_CHUNK_MAX_OPS
      : NORMAL_DELTA_CHUNK_MAX_OPS;
  const maxBytesPerChunk =
    strategy === 'tight_storage_incremental'
      ? TIGHT_STORAGE_DELTA_CHUNK_MAX_BYTES
      : NORMAL_DELTA_CHUNK_MAX_BYTES;

  const uploadedSet = new Set<string>(params.alreadyUploadedOpIds);
  const pending = params.operations
    .filter((op) => op && typeof op.op_id === 'string' && !uploadedSet.has(op.op_id))
    .sort((a, b) => {
      if (a.logical_counter !== b.logical_counter) {
        return a.logical_counter - b.logical_counter;
      }
      if (a.timestamp !== b.timestamp) {
        return a.timestamp.localeCompare(b.timestamp);
      }
      return a.op_id.localeCompare(b.op_id);
    });

  if (pending.length === 0) {
    return {
      strategy,
      tightReasons,
      maxOpsPerChunk,
      maxBytesPerChunk,
      pendingOpsCount: 0,
      chunks: [],
    };
  }

  const rawBuckets: Array<{ ops: SyncOperation[]; bytes: number }> = [];
  let currentOps: SyncOperation[] = [];
  let currentBytes = 280; // JSON envelope overhead

  for (const op of pending) {
    const opBytes = estimateJsonUtf8ByteLength(op) + 2;
    const wouldExceedOps = currentOps.length >= maxOpsPerChunk;
    const wouldExceedBytes =
      currentOps.length > 0 && currentBytes + opBytes > maxBytesPerChunk;

    if (wouldExceedOps || wouldExceedBytes) {
      rawBuckets.push({ ops: currentOps, bytes: currentBytes });
      currentOps = [op];
      currentBytes = 280 + opBytes;
    } else {
      currentOps.push(op);
      currentBytes += opBytes;
    }
  }
  if (currentOps.length > 0) {
    rawBuckets.push({ ops: currentOps, bytes: currentBytes });
  }

  const nowIso = params.createdAtIso || nowIsoUtc();
  const totalChunks = rawBuckets.length;
  const chunks: CloudDeltaChunkPlanItem[] = rawBuckets.map((bucket, idx) => {
    const chunkNumber = idx + 1;
    const fileName = buildCloudDeltaChunkFileName({
      deviceId: params.deviceId,
      createdAtIso: nowIso,
      chunkIndex: chunkNumber,
    });
    const bundle: CloudDeltaChunkBundle = {
      format: 'community-pedigree-cloud-delta-chunk-v1',
      deviceId: params.deviceId,
      chunkIndex: chunkNumber,
      totalChunks,
      createdAtIso: nowIso,
      strategy,
      operations: bucket.ops,
    };
    return {
      fileName,
      bundle,
      estimatedBytes: bucket.bytes,
    };
  });

  return {
    strategy,
    tightReasons,
    maxOpsPerChunk,
    maxBytesPerChunk,
    pendingOpsCount: pending.length,
    chunks,
  };
}

export function buildCloudRollingBackupEnvelope(params: {
  snapshot: BarnDatabaseSnapshot;
  deviceId: string;
  createdAtIso?: string;
}): CloudRollingBackupEnvelope {
  const createdAtIso = params.createdAtIso || nowIsoUtc();
  // Strip raw inline dataUrls from animal photos so cloud rolling backups stay compact & fast
  const sanitizedPhotos = (params.snapshot.animalPhotos ?? []).map((photo) => ({
    ...photo,
    dataUrl: '',
    thumbnailDataUrl: '',
  }));
  const compactSnapshot: BarnDatabaseSnapshot = {
    ...params.snapshot,
    animalPhotos: sanitizedPhotos,
  };
  return {
    format: 'community-pedigree-cloud-rolling-backup-v1',
    createdAtIso,
    deviceId: params.deviceId,
    barnName: compactSnapshot.settings.barnName || 'Community Pedigree Barn',
    animalCount: compactSnapshot.animals.length,
    speciesCount: compactSnapshot.speciesProfiles.length,
    photoMetadataCount: sanitizedPhotos.length,
    snapshot: compactSnapshot,
  };
}
