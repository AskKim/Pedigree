/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Browser Transport, Memory-Only OAuth Token Store & Sync Coordinator for
 * Optional Cloud App-Folder Sync (`src/storage/cloudAppFolderSync.ts`).
 *
 * Security & Offline-First Guarantees:
 * - Zero mandatory cloud dependencies; disabled by default.
 * - OAuth Bearer access tokens live STRICTLY in JavaScript memory (`memoryTokensByProvider`)
 *   and are NEVER written to `localStorage`, `sessionStorage`, `IndexedDB`, or `OPFS`.
 * - Cloud failures — including HTTP 403 / 507 quota errors — NEVER block, delay, or roll
 *   back local IndexedDB / SQLite writes.
 */

import {
  buildCloudRollingBackupEnvelope,
  buildRollingCloudBackupFileName,
  classifyCloudHttpResponse,
  CLOUD_SYNC_PROVIDER_DESCRIPTORS,
  CloudDeltaChunkBundle,
  CloudHttpClassification,
  CloudQuotaCircuitBreakerState,
  CloudRemoteFileEntry,
  CloudSyncPersistedState,
  CloudSyncProvider,
  CloudSyncSettings,
  createDefaultCloudSyncState,
  dismissCloudCircuitBreakerWarning,
  isCloudDeltaChunkFileName,
  isRollingCloudBackupFileName,
  MAX_PERSISTED_UPLOADED_OP_IDS,
  normalizeCloudSyncPersistedState,
  normalizeCloudSyncSettings,
  planIncrementalCloudDeltaChunks,
  resetCloudQuotaCircuitBreaker,
  selectRollingCloudBackupsToPrune,
  shouldRunAutomatedCloudSync,
  tripCloudQuotaCircuitBreaker,
} from '../core/cloudAppFolderSync';
import type { DeviceCapabilityTierNumber } from '../core/deviceCapability';
import { isValidSyncOperation } from '../core/inputSanitization';
import { BarnDatabaseSnapshot } from '../core/models';
import { SyncOperation } from '../core/syncOutbox';
import { isDocumentHidden } from './backgroundFreezeCoordinator';
import { emitAsyncErrorToast, logDiagnosticEvent } from './crashLogger';
import { detectCurrentDeviceCapability } from './deviceCapabilityDetector';
import { withCrossTabLock } from './localSyncChannels';
import { getSafeLocalStorage } from './storageProbes';
import {
  checkStorageStatus,
  getAdjustedNowIsoUtc,
  getEffectiveOnlineStatus,
  recordServerDateHeaderSkew,
  StorageProtectionStatus,
} from './storageProtection';

const CLOUD_SYNC_STATE_LS_KEY = 'pedigree.cloudSyncState.v1';
const CLOUD_PKCE_PENDING_SS_KEY = 'pedigree.cloudPkcePending.v1';
const CLOUD_SYNC_CROSS_TAB_LOCK = 'community_pedigree_cloud_appfolder_sync_v1';
const CLOUD_REQUEST_TIMEOUT_MS = 20_000;

/**
 * Strictly memory-only access tokens. Cleared on page reload, disconnect, 401, or factory reset.
 */
const memoryTokensByProvider: Partial<Record<CloudSyncProvider, string>> = {};
const seenRemoteChunkNamesByProvider: Record<CloudSyncProvider, Set<string>> = {
  google_drive: new Set<string>(),
  onedrive: new Set<string>(),
};
const MAX_SEEN_REMOTE_CHUNK_NAMES = 2000;

function rememberSeenRemoteChunkName(provider: CloudSyncProvider, fileName: string): void {
  const set = seenRemoteChunkNamesByProvider[provider];
  if (set.has(fileName)) return;
  if (set.size >= MAX_SEEN_REMOTE_CHUNK_NAMES) {
    const oldest = set.values().next().value;
    if (typeof oldest === 'string') {
      set.delete(oldest);
    }
  }
  set.add(fileName);
}

export interface CloudSyncClientState extends CloudSyncPersistedState {
  hasMemoryTokenByProvider: Record<CloudSyncProvider, boolean>;
}

export class CloudSyncTransportError extends Error {
  readonly classification: CloudHttpClassification;
  readonly provider: CloudSyncProvider;

  constructor(provider: CloudSyncProvider, classification: CloudHttpClassification) {
    super(classification.reason);
    this.name = 'CloudSyncTransportError';
    this.provider = provider;
    this.classification = classification;
  }
}

export interface CloudSyncTransport {
  readonly provider: CloudSyncProvider;
  listFiles(): Promise<CloudRemoteFileEntry[]>;
  downloadFileText(file: CloudRemoteFileEntry): Promise<string>;
  uploadJsonFile(
    fileName: string,
    jsonText: string,
    existingFileId?: string
  ): Promise<CloudRemoteFileEntry>;
  deleteFile(file: CloudRemoteFileEntry): Promise<void>;
}

export function setCloudSyncMemoryToken(provider: CloudSyncProvider, token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) {
    delete memoryTokensByProvider[provider];
    return false;
  }
  memoryTokensByProvider[provider] = trimmed;
  return true;
}

export function getCloudSyncMemoryToken(provider: CloudSyncProvider): string | null {
  return memoryTokensByProvider[provider] ?? null;
}

export function hasCloudSyncMemoryToken(provider: CloudSyncProvider): boolean {
  return typeof memoryTokensByProvider[provider] === 'string' && memoryTokensByProvider[provider]!.length > 0;
}

export function clearCloudSyncMemoryToken(provider?: CloudSyncProvider): void {
  if (provider) {
    delete memoryTokensByProvider[provider];
    return;
  }
  delete memoryTokensByProvider.google_drive;
  delete memoryTokensByProvider.onedrive;
}

export function readPersistedCloudSyncState(): CloudSyncPersistedState {
  try {
    const ls = getSafeLocalStorage();
    if (!ls) return createDefaultCloudSyncState();
    const raw = ls.getItem(CLOUD_SYNC_STATE_LS_KEY);
    if (!raw) return createDefaultCloudSyncState();
    return normalizeCloudSyncPersistedState(JSON.parse(raw));
  } catch {
    return createDefaultCloudSyncState();
  }
}

export function writePersistedCloudSyncState(state: CloudSyncPersistedState): void {
  try {
    const ls = getSafeLocalStorage();
    if (!ls) return;
    ls.setItem(CLOUD_SYNC_STATE_LS_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage restriction in private mode / quota-full localStorage
  }
}

export function getCloudSyncClientState(): CloudSyncClientState {
  const persisted = readPersistedCloudSyncState();
  return {
    ...persisted,
    hasMemoryTokenByProvider: {
      google_drive: hasCloudSyncMemoryToken('google_drive'),
      onedrive: hasCloudSyncMemoryToken('onedrive'),
    },
  };
}

export function updatePersistedCloudSyncSettings(
  patch: Partial<CloudSyncSettings>
): CloudSyncClientState {
  const current = readPersistedCloudSyncState();
  const nextSettings = normalizeCloudSyncSettings({
    ...current.settings,
    ...patch,
  });
  const nextState: CloudSyncPersistedState = {
    ...current,
    settings: nextSettings,
  };
  writePersistedCloudSyncState(nextState);
  return getCloudSyncClientState();
}

export function acknowledgeCloudCircuitBreakerWarning(): CloudSyncClientState {
  const current = readPersistedCloudSyncState();
  const next: CloudSyncPersistedState = {
    ...current,
    circuitBreaker: dismissCloudCircuitBreakerWarning(
      current.circuitBreaker,
      getAdjustedNowIsoUtc()
    ),
  };
  writePersistedCloudSyncState(next);
  return getCloudSyncClientState();
}

export function resetPersistedCloudCircuitBreaker(): CloudSyncClientState {
  const current = readPersistedCloudSyncState();
  const next: CloudSyncPersistedState = {
    ...current,
    circuitBreaker: resetCloudQuotaCircuitBreaker(),
    status: {
      ...current.status,
      lastError: null,
    },
  };
  writePersistedCloudSyncState(next);
  return getCloudSyncClientState();
}

export function clearAllCloudSyncState(): void {
  clearCloudSyncMemoryToken();
  seenRemoteChunkNamesByProvider.google_drive.clear();
  seenRemoteChunkNamesByProvider.onedrive.clear();
  try {
    const ls = getSafeLocalStorage();
    ls?.removeItem(CLOUD_SYNC_STATE_LS_KEY);
  } catch {
    // Ignore storage cleanup error
  }
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(CLOUD_PKCE_PENDING_SS_KEY);
    }
  } catch {
    // Ignore sessionStorage cleanup error
  }
}

function appendUploadedOpIds(
  state: CloudSyncPersistedState,
  provider: CloudSyncProvider,
  newOpIds: string[]
): CloudSyncPersistedState {
  if (newOpIds.length === 0) return state;
  const existing = state.uploadedOpIdsByProvider[provider] ?? [];
  const seen = new Set(existing);
  const merged = [...existing];
  for (const id of newOpIds) {
    if (id && !seen.has(id)) {
      seen.add(id);
      merged.push(id);
    }
  }
  const capped =
    merged.length > MAX_PERSISTED_UPLOADED_OP_IDS
      ? merged.slice(merged.length - MAX_PERSISTED_UPLOADED_OP_IDS)
      : merged;
  return {
    ...state,
    uploadedOpIdsByProvider: {
      ...state.uploadedOpIdsByProvider,
      [provider]: capped,
    },
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = CLOUD_REQUEST_TIMEOUT_MS
): Promise<Response> {
  if (typeof fetch !== 'function') {
    throw new Error('Fetch API is unavailable in this runtime.');
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer =
    controller !== null
      ? setTimeout(() => {
          try {
            controller.abort();
          } catch {
            // Ignore abort error
          }
        }, timeoutMs)
      : null;

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller?.signal,
    });
    const dateHeader = res.headers?.get?.('date');
    if (dateHeader) {
      recordServerDateHeaderSkew(dateHeader);
    }
    return res;
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

async function assertCloudResponseOk(
  provider: CloudSyncProvider,
  res: Response,
  isWriteOperation: boolean
): Promise<void> {
  if (res.ok) return;
  let bodyText = '';
  try {
    bodyText = await res.text();
  } catch {
    bodyText = '';
  }
  const classification = classifyCloudHttpResponse({
    status: res.status,
    bodyText,
    isWriteOperation,
  });
  throw new CloudSyncTransportError(provider, classification);
}

export function createGoogleDriveAppFolderTransport(
  getAccessToken: () => string | null = () => getCloudSyncMemoryToken('google_drive')
): CloudSyncTransport {
  const requireToken = () => {
    const token = getAccessToken();
    if (!token) {
      throw new CloudSyncTransportError('google_drive', {
        status: 401,
        kind: 'auth_expired_401',
        isQuotaBreakerTrigger: false,
        isAuthExpired: true,
        breakerStatusCode: null,
        reason: 'Google Drive AppFolder access token is missing.',
      });
    }
    return token;
  };

  return {
    provider: 'google_drive',
    async listFiles(): Promise<CloudRemoteFileEntry[]> {
      const token = requireToken();
      const url =
        'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name,size,modifiedTime)&pageSize=200&orderBy=modifiedTime%20desc';
      const res = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      await assertCloudResponseOk('google_drive', res, false);
      const data = (await res.json()) as {
        files?: Array<{ id?: string; name?: string; size?: string; modifiedTime?: string }>;
      };
      return (data.files ?? [])
        .filter((f): f is { id: string; name: string; size?: string; modifiedTime?: string } =>
          Boolean(f.id && f.name)
        )
        .map((f) => ({
          id: f.id,
          name: f.name,
          sizeBytes: f.size ? Number(f.size) || undefined : undefined,
          modifiedAtIso: f.modifiedTime,
        }));
    },

    async downloadFileText(file: CloudRemoteFileEntry): Promise<string> {
      const token = requireToken();
      const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`;
      const res = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      await assertCloudResponseOk('google_drive', res, false);
      return res.text();
    },

    async uploadJsonFile(
      fileName: string,
      jsonText: string,
      existingFileId?: string
    ): Promise<CloudRemoteFileEntry> {
      const token = requireToken();
      if (existingFileId) {
        const url = `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
          existingFileId
        )}?uploadType=media&fields=id,name,size,modifiedTime`;
        const res = await fetchWithTimeout(url, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: jsonText,
        });
        await assertCloudResponseOk('google_drive', res, true);
        const created = (await res.json()) as {
          id?: string;
          name?: string;
          size?: string;
          modifiedTime?: string;
        };
        return {
          id: created.id || existingFileId,
          name: created.name || fileName,
          sizeBytes: created.size ? Number(created.size) || undefined : undefined,
          modifiedAtIso: created.modifiedTime,
        };
      }

      const boundary = `cp_drive_boundary_${Date.now().toString(36)}`;
      const metadata = JSON.stringify({
        name: fileName,
        parents: ['appDataFolder'],
        mimeType: 'application/json',
      });
      const multipartBody = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        metadata,
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        jsonText,
        `--${boundary}--`,
      ].join('\r\n');

      const res = await fetchWithTimeout(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,modifiedTime',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody,
        }
      );
      await assertCloudResponseOk('google_drive', res, true);
      const created = (await res.json()) as {
        id?: string;
        name?: string;
        size?: string;
        modifiedTime?: string;
      };
      return {
        id: created.id || fileName,
        name: created.name || fileName,
        sizeBytes: created.size ? Number(created.size) || undefined : undefined,
        modifiedAtIso: created.modifiedTime,
      };
    },

    async deleteFile(file: CloudRemoteFileEntry): Promise<void> {
      const token = requireToken();
      const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`;
      const res = await fetchWithTimeout(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      await assertCloudResponseOk('google_drive', res, false);
    },
  };
}

export function createOneDriveAppRootTransport(
  getAccessToken: () => string | null = () => getCloudSyncMemoryToken('onedrive')
): CloudSyncTransport {
  const requireToken = () => {
    const token = getAccessToken();
    if (!token) {
      throw new CloudSyncTransportError('onedrive', {
        status: 401,
        kind: 'auth_expired_401',
        isQuotaBreakerTrigger: false,
        isAuthExpired: true,
        breakerStatusCode: null,
        reason: 'OneDrive AppRoot access token is missing.',
      });
    }
    return token;
  };

  return {
    provider: 'onedrive',
    async listFiles(): Promise<CloudRemoteFileEntry[]> {
      const token = requireToken();
      const url =
        'https://graph.microsoft.com/v1.0/me/drive/special/approot/children?$select=id,name,size,lastModifiedDateTime&$top=200';
      const res = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      await assertCloudResponseOk('onedrive', res, false);
      const data = (await res.json()) as {
        value?: Array<{
          id?: string;
          name?: string;
          size?: number;
          lastModifiedDateTime?: string;
        }>;
      };
      return (data.value ?? [])
        .filter((f): f is { id: string; name: string; size?: number; lastModifiedDateTime?: string } =>
          Boolean(f.id && f.name)
        )
        .map((f) => ({
          id: f.id,
          name: f.name,
          sizeBytes: typeof f.size === 'number' ? f.size : undefined,
          modifiedAtIso: f.lastModifiedDateTime,
        }));
    },

    async downloadFileText(file: CloudRemoteFileEntry): Promise<string> {
      const token = requireToken();
      const url = `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(
        file.id
      )}/content`;
      const res = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      await assertCloudResponseOk('onedrive', res, false);
      return res.text();
    },

    async uploadJsonFile(
      fileName: string,
      jsonText: string
    ): Promise<CloudRemoteFileEntry> {
      const token = requireToken();
      const url = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${encodeURIComponent(
        fileName
      )}:/content`;
      const res = await fetchWithTimeout(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: jsonText,
      });
      await assertCloudResponseOk('onedrive', res, true);
      const created = (await res.json()) as {
        id?: string;
        name?: string;
        size?: number;
        lastModifiedDateTime?: string;
      };
      return {
        id: created.id || fileName,
        name: created.name || fileName,
        sizeBytes: typeof created.size === 'number' ? created.size : undefined,
        modifiedAtIso: created.lastModifiedDateTime,
      };
    },

    async deleteFile(file: CloudRemoteFileEntry): Promise<void> {
      const token = requireToken();
      const url = `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(file.id)}`;
      const res = await fetchWithTimeout(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      await assertCloudResponseOk('onedrive', res, false);
    },
  };
}

export function createCloudSyncTransport(provider: CloudSyncProvider): CloudSyncTransport {
  return provider === 'onedrive'
    ? createOneDriveAppRootTransport()
    : createGoogleDriveAppFolderTransport();
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Initiates optional client-side OAuth2 PKCE redirect (no popups / window.open,
 * no Firebase, no embedded client secret) using user-supplied OAuth Client ID.
 */
export async function startCloudOAuthPkceRedirect(
  provider: CloudSyncProvider,
  clientId: string
): Promise<void> {
  const cleanClientId = clientId.trim();
  if (!cleanClientId) {
    throw new Error('Enter your OAuth Client ID first, or paste a memory-only access token.');
  }
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error('Browser WebCrypto PKCE is unavailable; paste a memory-only access token instead.');
  }

  const verifierBytes = new Uint8Array(32);
  window.crypto.getRandomValues(verifierBytes);
  const codeVerifier = toBase64Url(verifierBytes);
  const digest = await window.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(codeVerifier)
  );
  const codeChallenge = toBase64Url(new Uint8Array(digest));
  const stateBytes = new Uint8Array(16);
  window.crypto.getRandomValues(stateBytes);
  const state = `cpcloud_${toBase64Url(stateBytes)}`;
  const redirectUri = `${window.location.origin}${window.location.pathname}`;

  try {
    sessionStorage.setItem(
      CLOUD_PKCE_PENDING_SS_KEY,
      JSON.stringify({ provider, clientId: cleanClientId, codeVerifier, state, redirectUri })
    );
  } catch {
    throw new Error('Session storage is blocked in this browser; paste a memory-only access token instead.');
  }

  const scope = CLOUD_SYNC_PROVIDER_DESCRIPTORS[provider].scope;
  const authBase =
    provider === 'onedrive'
      ? 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
      : 'https://accounts.google.com/o/oauth2/v2/auth';
  const params = new URLSearchParams({
    client_id: cleanClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  window.location.assign(`${authBase}?${params.toString()}`);
}

export async function consumeCloudOAuthPkceCallback(): Promise<{
  handled: boolean;
  provider?: CloudSyncProvider;
  error?: string;
}> {
  if (typeof window === 'undefined') return { handled: false };
  let rawPending: string | null = null;
  try {
    rawPending = sessionStorage.getItem(CLOUD_PKCE_PENDING_SS_KEY);
  } catch {
    return { handled: false };
  }
  if (!rawPending) return { handled: false };

  const url = new URL(window.location.href);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const oauthError = url.searchParams.get('error');

  if (!state || !state.startsWith('cpcloud_')) {
    return { handled: false };
  }

  try {
    sessionStorage.removeItem(CLOUD_PKCE_PENDING_SS_KEY);
  } catch {
    // Ignore
  }

  // Clean URL immediately
  try {
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    url.searchParams.delete('scope');
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Ignore history cleanup errors
  }

  let parsed: {
    provider?: CloudSyncProvider;
    clientId?: string;
    codeVerifier?: string;
    state?: string;
    redirectUri?: string;
  } = {};
  try {
    parsed = JSON.parse(rawPending);
  } catch {
    return { handled: true, error: 'Corrupted pending OAuth PKCE state.' };
  }

  if (parsed.state !== state || !parsed.provider || !parsed.clientId || !parsed.codeVerifier) {
    return { handled: true, error: 'OAuth PKCE state mismatch.' };
  }

  if (oauthError) {
    return { handled: true, provider: parsed.provider, error: `OAuth authorization declined (${oauthError}).` };
  }
  if (!code) {
    return { handled: true, provider: parsed.provider, error: 'OAuth callback missing authorization code.' };
  }

  try {
    const tokenEndpoint =
      parsed.provider === 'onedrive'
        ? 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
        : 'https://oauth2.googleapis.com/token';
    const body = new URLSearchParams({
      client_id: parsed.clientId,
      code,
      code_verifier: parsed.codeVerifier,
      redirect_uri: parsed.redirectUri || `${window.location.origin}${window.location.pathname}`,
      grant_type: 'authorization_code',
    });
    const res = await fetchWithTimeout(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      return {
        handled: true,
        provider: parsed.provider,
        error: `OAuth token exchange failed (HTTP ${res.status}).`,
      };
    }
    const tokenJson = (await res.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      return {
        handled: true,
        provider: parsed.provider,
        error: 'OAuth token exchange succeeded without access_token.',
      };
    }
    setCloudSyncMemoryToken(parsed.provider, tokenJson.access_token);
    updatePersistedCloudSyncSettings({ enabled: true, provider: parsed.provider });
    return { handled: true, provider: parsed.provider };
  } catch (err) {
    return {
      handled: true,
      provider: parsed.provider,
      error: err instanceof Error ? err.message : 'OAuth token exchange failed.',
    };
  }
}

export interface RunCloudAppFolderSyncParams {
  trigger: 'auto_background' | 'manual';
  deviceId: string;
  loadLocalSyncOperations: () => Promise<SyncOperation[]>;
  getSnapshotForRollingBackup: () => Promise<BarnDatabaseSnapshot | null>;
  onMergeRemoteOperations: (ops: SyncOperation[]) => Promise<void>;
  uploadRollingBackup?: boolean;
  transport?: CloudSyncTransport;
  getStorageStatus?: () => Promise<StorageProtectionStatus>;
  getDeviceTier?: () => DeviceCapabilityTierNumber;
  isOnline?: () => boolean;
  isHidden?: () => boolean;
  nowIso?: () => string;
}

export interface RunCloudAppFolderSyncResult {
  ok: boolean;
  skipped: boolean;
  skipReason?: string;
  circuitBreakerTripped: boolean;
  prunedRollingCount: number;
  pulledOpsCount: number;
  uploadedOpsCount: number;
  uploadedChunksCount: number;
  uploadedRollingBackupName: string | null;
  chunkStrategy: 'normal' | 'tight_storage_incremental';
  error?: string;
  state: CloudSyncClientState;
}

async function pruneOldestRollingBackupsBestEffort(
  transport: CloudSyncTransport,
  remoteFiles: CloudRemoteFileEntry[],
  keepCount: number
): Promise<number> {
  const toDelete = selectRollingCloudBackupsToPrune(remoteFiles, keepCount);
  let deleted = 0;
  for (const file of toDelete) {
    try {
      await transport.deleteFile(file);
      deleted += 1;
    } catch {
      // Best-effort pruning; continue trying remaining older backups
    }
  }
  return deleted;
}

/**
 * Executes an isolated AppFolder / AppRoot cloud sync cycle inside a cross-tab lock.
 * Always protects local IndexedDB state: cloud failures or HTTP 403/507 quota errors
 * immediately trip the circuit breaker and prune oldest rolling cloud backups without
 * blocking or rolling back local IndexedDB writes.
 */
export async function runCloudAppFolderSync(
  params: RunCloudAppFolderSyncParams
): Promise<RunCloudAppFolderSyncResult> {
  const initialState = readPersistedCloudSyncState();
  const provider = initialState.settings.provider;
  const nowFn = params.nowIso ?? getAdjustedNowIsoUtc;
  const isOnline = params.isOnline ?? getEffectiveOnlineStatus;
  const isHidden = params.isHidden ?? isDocumentHidden;

  if (params.trigger === 'auto_background') {
    if (isHidden()) {
      return {
        ok: false,
        skipped: true,
        skipReason: 'Document is hidden/backgrounded.',
        circuitBreakerTripped: initialState.circuitBreaker.tripped,
        prunedRollingCount: 0,
        pulledOpsCount: 0,
        uploadedOpsCount: 0,
        uploadedChunksCount: 0,
        uploadedRollingBackupName: null,
        chunkStrategy: initialState.status.lastChunkStrategy,
        state: getCloudSyncClientState(),
      };
    }
    const autoCheck = shouldRunAutomatedCloudSync({
      settings: initialState.settings,
      circuitBreaker: initialState.circuitBreaker,
      isOnline: isOnline(),
      hasToken: Boolean(params.transport) || hasCloudSyncMemoryToken(provider),
    });
    if (!autoCheck.allowed) {
      return {
        ok: false,
        skipped: true,
        skipReason: autoCheck.skipReason,
        circuitBreakerTripped: initialState.circuitBreaker.tripped,
        prunedRollingCount: 0,
        pulledOpsCount: 0,
        uploadedOpsCount: 0,
        uploadedChunksCount: 0,
        uploadedRollingBackupName: null,
        chunkStrategy: initialState.status.lastChunkStrategy,
        state: getCloudSyncClientState(),
      };
    }
  } else {
    // Manual sync check
    if (!initialState.settings.enabled) {
      return {
        ok: false,
        skipped: true,
        skipReason: 'Enable Optional Cloud App-Folder Sync first.',
        circuitBreakerTripped: initialState.circuitBreaker.tripped,
        prunedRollingCount: 0,
        pulledOpsCount: 0,
        uploadedOpsCount: 0,
        uploadedChunksCount: 0,
        uploadedRollingBackupName: null,
        chunkStrategy: initialState.status.lastChunkStrategy,
        state: getCloudSyncClientState(),
      };
    }
    if (initialState.circuitBreaker.tripped || initialState.circuitBreaker.pausedAutomatedSync) {
      return {
        ok: false,
        skipped: true,
        skipReason: `Quota circuit breaker is active (HTTP ${
          initialState.circuitBreaker.statusCode ?? '403/507'
        }). Reset the circuit breaker before retrying.`,
        circuitBreakerTripped: true,
        prunedRollingCount: 0,
        pulledOpsCount: 0,
        uploadedOpsCount: 0,
        uploadedChunksCount: 0,
        uploadedRollingBackupName: null,
        chunkStrategy: initialState.status.lastChunkStrategy,
        state: getCloudSyncClientState(),
      };
    }
    if (!isOnline()) {
      return {
        ok: false,
        skipped: true,
        skipReason: 'Device appears offline — local barn edits remain safely queued.',
        circuitBreakerTripped: false,
        prunedRollingCount: 0,
        pulledOpsCount: 0,
        uploadedOpsCount: 0,
        uploadedChunksCount: 0,
        uploadedRollingBackupName: null,
        chunkStrategy: initialState.status.lastChunkStrategy,
        state: getCloudSyncClientState(),
      };
    }
    if (!params.transport && !hasCloudSyncMemoryToken(provider)) {
      return {
        ok: false,
        skipped: true,
        skipReason: 'Connect an in-memory cloud access token first.',
        circuitBreakerTripped: false,
        prunedRollingCount: 0,
        pulledOpsCount: 0,
        uploadedOpsCount: 0,
        uploadedChunksCount: 0,
        uploadedRollingBackupName: null,
        chunkStrategy: initialState.status.lastChunkStrategy,
        state: getCloudSyncClientState(),
      };
    }
  }

  return withCrossTabLock(CLOUD_SYNC_CROSS_TAB_LOCK, async () => {
    let workingState = readPersistedCloudSyncState();
    const activeProvider = workingState.settings.provider;
    const transport = params.transport ?? createCloudSyncTransport(activeProvider);
    const attemptIso = nowFn();

    const getStorage = params.getStorageStatus ?? checkStorageStatus;
    const getTier: () => DeviceCapabilityTierNumber =
      params.getDeviceTier ?? (() => detectCurrentDeviceCapability().tier);

    let storagePercentUsed: number | null = null;
    try {
      const storageStatus = await getStorage();
      if (storageStatus.supported && storageStatus.quotaBytes > 0) {
        storagePercentUsed = storageStatus.percentUsed;
      }
    } catch {
      storagePercentUsed = null;
    }

    const deviceTier = getTier();
    let pulledOpsCount = 0;
    let uploadedOpsCount = 0;
    let uploadedChunksCount = 0;
    let uploadedRollingBackupName: string | null = null;
    let prunedRollingCount = 0;
    let lastStrategy: 'normal' | 'tight_storage_incremental' =
      workingState.status.lastChunkStrategy;
    let remoteFilesSnapshot: CloudRemoteFileEntry[] = [];

    try {
      // Phase 1: List remote app-folder files & pull unseen remote delta chunks
      remoteFilesSnapshot = await transport.listFiles();
      const localOps = await params.loadLocalSyncOperations();
      const localOpIds = new Set(localOps.map((op) => op.op_id));

      const seenNames = seenRemoteChunkNamesByProvider[activeProvider];
      const safeLocalDeviceSlug = params.deviceId
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);

      const remoteDeltaFiles = remoteFilesSnapshot.filter((f) => isCloudDeltaChunkFileName(f.name));
      const collectedRemoteOps: SyncOperation[] = [];

      for (const file of remoteDeltaFiles) {
        const isOwnChunk =
          safeLocalDeviceSlug.length > 0 &&
          file.name.startsWith(`cp-delta-${safeLocalDeviceSlug}-`);
        if (isOwnChunk && localOps.length > 0) {
          continue;
        }
        if (seenNames.has(file.name)) {
          continue;
        }
        const rawText = await transport.downloadFileText(file);
        try {
          const parsed = JSON.parse(rawText) as Partial<CloudDeltaChunkBundle>;
          if (Array.isArray(parsed.operations)) {
            for (const op of parsed.operations) {
              if (isValidSyncOperation(op) && !localOpIds.has(op.op_id)) {
                collectedRemoteOps.push(op);
              }
            }
          }
          rememberSeenRemoteChunkName(activeProvider, file.name);
        } catch {
          // Skip malformed remote JSON without crashing local DB or remaining chunks
        }
      }

      if (collectedRemoteOps.length > 0) {
        pulledOpsCount = collectedRemoteOps.length;
        await params.onMergeRemoteOperations(collectedRemoteOps);
        workingState = appendUploadedOpIds(
          workingState,
          activeProvider,
          collectedRemoteOps.map((op) => op.op_id)
        );
        writePersistedCloudSyncState(workingState);
      }

      // Phase 2: Plan & upload unseen incremental delta chunks (shrinks on tight storage)
      const latestOpsAfterMerge =
        collectedRemoteOps.length > 0 ? await params.loadLocalSyncOperations() : localOps;
      const chunkPlan = planIncrementalCloudDeltaChunks({
        deviceId: params.deviceId,
        operations: latestOpsAfterMerge,
        alreadyUploadedOpIds: workingState.uploadedOpIdsByProvider[activeProvider] ?? [],
        storagePercentUsed,
        storageTightThresholdPercent: workingState.settings.storageTightThresholdPercent,
        deviceTier,
        createdAtIso: attemptIso,
      });
      lastStrategy = chunkPlan.strategy;

      for (const item of chunkPlan.chunks) {
        const uploadedEntry = await transport.uploadJsonFile(
          item.fileName,
          JSON.stringify(item.bundle)
        );
        remoteFilesSnapshot = [uploadedEntry, ...remoteFilesSnapshot];
        rememberSeenRemoteChunkName(activeProvider, uploadedEntry.name);
        uploadedChunksCount += 1;
        uploadedOpsCount += item.bundle.operations.length;

        // Checkpoint uploaded op_ids immediately after each chunk so tight storage / quota errors retain progress
        workingState = appendUploadedOpIds(
          workingState,
          activeProvider,
          item.bundle.operations.map((op) => op.op_id)
        );
        writePersistedCloudSyncState(workingState);
      }

      // Phase 3: Upload compact rolling cloud backup (if requested / snapshot present) and prune excess
      const shouldUploadRolling =
        params.uploadRollingBackup !== false &&
        (params.trigger === 'manual' ||
          uploadedChunksCount > 0 ||
          !remoteFilesSnapshot.some((f) => isRollingCloudBackupFileName(f.name)));

      if (shouldUploadRolling) {
        const snap = await params.getSnapshotForRollingBackup();
        if (snap) {
          const envelope = buildCloudRollingBackupEnvelope({
            snapshot: snap,
            deviceId: params.deviceId,
            createdAtIso: attemptIso,
          });
          const rollingName = buildRollingCloudBackupFileName({
            deviceId: params.deviceId,
            createdAtIso: attemptIso,
          });
          const uploadedRolling = await transport.uploadJsonFile(
            rollingName,
            JSON.stringify(envelope)
          );
          uploadedRollingBackupName = uploadedRolling.name;
          remoteFilesSnapshot = [uploadedRolling, ...remoteFilesSnapshot];
          prunedRollingCount = await pruneOldestRollingBackupsBestEffort(
            transport,
            remoteFilesSnapshot,
            workingState.settings.rollingBackupRetentionCount
          );
        }
      }

      const doneIso = nowFn();
      workingState = {
        ...workingState,
        status: {
          lastSyncAttemptAtIso: attemptIso,
          lastSuccessfulSyncAtIso: doneIso,
          lastChunkStrategy: lastStrategy,
          lastUploadedOpsCount: uploadedOpsCount,
          lastPulledOpsCount: pulledOpsCount,
          lastUploadedChunksCount: uploadedChunksCount,
          lastUploadedRollingBackupName:
            uploadedRollingBackupName ?? workingState.status.lastUploadedRollingBackupName,
          lastError: null,
        },
      };
      writePersistedCloudSyncState(workingState);

      return {
        ok: true,
        skipped: false,
        circuitBreakerTripped: workingState.circuitBreaker.tripped,
        prunedRollingCount,
        pulledOpsCount,
        uploadedOpsCount,
        uploadedChunksCount,
        uploadedRollingBackupName,
        chunkStrategy: lastStrategy,
        state: getCloudSyncClientState(),
      };
    } catch (err) {
      const transportErr = err instanceof CloudSyncTransportError ? err : null;

      if (transportErr?.classification.isAuthExpired) {
        clearCloudSyncMemoryToken(activeProvider);
      }

      if (transportErr?.classification.isQuotaBreakerTrigger && transportErr.classification.breakerStatusCode) {
        const statusCode = transportErr.classification.breakerStatusCode;
        // Refresh remote listing if needed so we prune stale rolling backups aggressively
        if (remoteFilesSnapshot.length === 0) {
          try {
            remoteFilesSnapshot = await transport.listFiles();
          } catch {
            // Best-effort only
          }
        }
        const existingRollingCount = remoteFilesSnapshot.filter((f) =>
          isRollingCloudBackupFileName(f.name)
        ).length;
        const keepAfterQuota = existingRollingCount > 1 ? 1 : 0;
        prunedRollingCount = await pruneOldestRollingBackupsBestEffort(
          transport,
          remoteFilesSnapshot,
          keepAfterQuota
        );

        const nextBreaker: CloudQuotaCircuitBreakerState = tripCloudQuotaCircuitBreaker(
          workingState.circuitBreaker,
          {
            provider: activeProvider,
            statusCode,
            reason: transportErr.classification.reason,
            nowIso: attemptIso,
            prunedCount: prunedRollingCount,
          }
        );

        workingState = {
          ...workingState,
          circuitBreaker: nextBreaker,
          status: {
            ...workingState.status,
            lastSyncAttemptAtIso: attemptIso,
            lastChunkStrategy: lastStrategy,
            lastError: nextBreaker.reason,
          },
        };
        writePersistedCloudSyncState(workingState);

        logDiagnosticEvent({
          level: 'error',
          category: 'storage',
          message: `Cloud sync HTTP ${statusCode} quota circuit breaker tripped (${activeProvider}, prunedRollingBackups=${prunedRollingCount})`,
          error: transportErr,
        });
        emitAsyncErrorToast({
          title: `Cloud Sync Paused (HTTP ${statusCode} Quota Exceeded)`,
          detail: `Automated cloud sync paused${
            prunedRollingCount > 0
              ? ` and pruned ${prunedRollingCount} old cloud backup(s)`
              : ''
          }. Local IndexedDB saves continue uninterrupted.`,
          severity: 'error',
          sticky: true,
          category: 'storage',
        });

        return {
          ok: false,
          skipped: false,
          circuitBreakerTripped: true,
          prunedRollingCount,
          pulledOpsCount,
          uploadedOpsCount,
          uploadedChunksCount,
          uploadedRollingBackupName,
          chunkStrategy: lastStrategy,
          error: nextBreaker.reason ?? transportErr.message,
          state: getCloudSyncClientState(),
        };
      }

      const errorMessage = err instanceof Error ? err.message : 'Cloud sync failed.';
      workingState = {
        ...workingState,
        status: {
          ...workingState.status,
          lastSyncAttemptAtIso: attemptIso,
          lastChunkStrategy: lastStrategy,
          lastError: errorMessage,
        },
      };
      writePersistedCloudSyncState(workingState);

      logDiagnosticEvent({
        level: 'warn',
        category: 'runtime',
        message: `Optional cloud app-folder sync warning (${activeProvider}): ${errorMessage}`,
        error: err,
      });

      return {
        ok: false,
        skipped: false,
        circuitBreakerTripped: workingState.circuitBreaker.tripped,
        prunedRollingCount: 0,
        pulledOpsCount,
        uploadedOpsCount,
        uploadedChunksCount,
        uploadedRollingBackupName,
        chunkStrategy: lastStrategy,
        error: errorMessage,
        state: getCloudSyncClientState(),
      };
    }
  });
}
