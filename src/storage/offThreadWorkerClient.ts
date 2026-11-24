/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Client Bridge for Off-Thread `.ZIP` Archive Compression/Extraction & Large Imports.
 *
 * Uses `archiveAndImport.worker.ts` in capable browsers so multi-megabyte `.ZIP`
 * builds and external pedigree parses never block the UI thread on mobile devices,
 * while gracefully falling back to yielded async main-thread execution in Node/Vitest
 * or restricted environments where `Worker` is unavailable.
 */

import type { PreRestoreArchiveInspection } from '../core/archiveInspector';
import type {
  BackupArchiveBuildResult,
  ParsedBackupArchive,
  StreamingZipArchiveSummary,
} from '../core/backupArchive';
import type {
  ImporterRunOptions,
  PlatformImportPreview,
  RawArchiveInput,
} from '../core/importers/importerTypes';
import {
  type BarnDatabaseSnapshot,
  type BarnSettings,
  getCoreClockSkewMs,
} from '../core/models';
import type {
  SupportBundleBuildParams,
  SupportBundleBuildResult,
} from '../core/supportBundle';
import type { SpeciesBackupReason } from '../core/syncAndExports';
import type {
  ArchiveWorkerRequest,
  ArchiveWorkerResponse,
  OpfsTempZipBuildResult,
} from './archiveAndImport.worker';
import { registerFreezeLifecycleListener } from './backgroundFreezeCoordinator';
import { logDiagnosticEvent } from './crashLogger';
import {
  isOpfsSupported,
  markTempOpfsFileActive,
  writeTempOpfsFileStreamed,
} from './opfsTempStream';

export type { OpfsTempZipBuildResult };

const WORKER_TIMEOUT_MS = 90_000;
const WORKER_IDLE_TERMINATE_MS = 60_000;
const MAX_TRANSIENT_WORKER_FAILURES = 3;

interface PendingWorkerJob {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let activeWorker: Worker | null = null;
let workerDisabled = false;
let consecutiveWorkerFailures = 0;
let idleTerminateTimer: ReturnType<typeof setTimeout> | null = null;
let freezeListenerUnregister: (() => void) | null = null;
let jobCounter = 0;
const pendingJobs = new Map<string, PendingWorkerJob>();

function clearIdleTerminateTimer(): void {
  if (idleTerminateTimer !== null) {
    clearTimeout(idleTerminateTimer);
    idleTerminateTimer = null;
  }
}

/**
 * Terminates the cached archive/import Web Worker immediately if no jobs are in flight.
 * Triggered on background hide / `pagehide` to release 15–30 MB of mobile worker heap promptly.
 */
export function terminateIdleArchiveWorker(): boolean {
  if (!activeWorker || pendingJobs.size > 0) {
    return false;
  }
  clearIdleTerminateTimer();
  try {
    activeWorker.terminate();
  } catch {
    // Ignore termination errors on already-closing workers
  }
  activeWorker = null;
  return true;
}

function ensureWorkerFreezeListenerInstalled(): void {
  if (freezeListenerUnregister) return;
  freezeListenerUnregister = registerFreezeLifecycleListener({
    id: 'archive-worker-freeze-trim',
    onReleaseResources: () => {
      terminateIdleArchiveWorker();
    },
  });
}

function scheduleIdleTerminateIfEmpty(): void {
  clearIdleTerminateTimer();
  if (!activeWorker || pendingJobs.size > 0) return;
  idleTerminateTimer = setTimeout(() => {
    idleTerminateTimer = null;
    if (activeWorker && pendingJobs.size === 0) {
      try {
        activeWorker.terminate();
      } catch {
        // Ignore
      }
      activeWorker = null;
    }
  }, WORKER_IDLE_TERMINATE_MS);
}

function rejectAndResetWorker(reason: string): void {
  clearIdleTerminateTimer();
  if (activeWorker) {
    try {
      activeWorker.terminate();
    } catch {
      // Ignore termination error
    }
    activeWorker = null;
  }
  const err = new Error(reason);
  for (const job of pendingJobs.values()) {
    clearTimeout(job.timer);
    job.reject(err);
  }
  pendingJobs.clear();
}

function getOrCreateWorker(): Worker | null {
  if (workerDisabled || typeof Worker === 'undefined') {
    return null;
  }
  ensureWorkerFreezeListenerInstalled();
  clearIdleTerminateTimer();
  if (activeWorker) {
    return activeWorker;
  }
  try {
    const worker = new Worker(new URL('./archiveAndImport.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<ArchiveWorkerResponse>) => {
      const msg = event.data;
      if (!msg || !msg.id) return;
      const pending = pendingJobs.get(msg.id);
      if (!pending) return;
      pendingJobs.delete(msg.id);
      clearTimeout(pending.timer);
      consecutiveWorkerFailures = 0;
      if (msg.ok) {
        pending.resolve(msg.result);
      } else {
        pending.reject(new Error(msg.error || 'Archive worker failed.'));
      }
      scheduleIdleTerminateIfEmpty();
    };
    worker.onerror = (ev) => {
      const message = ev?.message || 'Web Worker runtime failure';
      consecutiveWorkerFailures++;
      if (consecutiveWorkerFailures >= MAX_TRANSIENT_WORKER_FAILURES) {
        workerDisabled = true;
      }
      logDiagnosticEvent({
        level: 'warn',
        category: 'runtime',
        message: `Corrective action: Archive worker errored (${message}) — resetting worker pool${
          workerDisabled ? ' (switched to main-thread async fallback)' : ''
        }`,
      });
      rejectAndResetWorker(message);
    };
    activeWorker = worker;
    return worker;
  } catch (err) {
    workerDisabled = true;
    logDiagnosticEvent({
      level: 'warn',
      category: 'runtime',
      message:
        'Corrective action: Web Worker unavailable in this browser context — using async main-thread archive processing',
      error: err,
    });
    return null;
  }
}

async function yieldToUiFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function runInWorker<TResult>(
  buildPayload: (id: string) => ArchiveWorkerRequest
): Promise<TResult> | null {
  const worker = getOrCreateWorker();
  if (!worker) return null;

  const id = `job-${++jobCounter}-${Date.now().toString(36)}`;
  const payload: ArchiveWorkerRequest = {
    ...buildPayload(id),
    clockSkewMs: getCoreClockSkewMs(),
  };

  return new Promise<TResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingJobs.delete(id);
      rejectAndResetWorker(
        'Archive operation timed out in background worker. Try a smaller batch or ZIP.'
      );
    }, WORKER_TIMEOUT_MS);

    pendingJobs.set(id, {
      resolve: (value: unknown) => resolve(value as TResult),
      reject,
      timer,
    });
    try {
      worker.postMessage(payload);
    } catch (postErr) {
      pendingJobs.delete(id);
      clearTimeout(timer);
      scheduleIdleTerminateIfEmpty();
      reject(postErr instanceof Error ? postErr : new Error(String(postErr)));
    }
  });
}

/**
 * Strips heavy base64 image payloads from `existingSnapshot.animalPhotos` before sending
 * metadata to the external importer worker so `postMessage` structured cloning stays instant.
 */
export function buildImporterWorkerSnapshot(
  snapshot: BarnDatabaseSnapshot
): BarnDatabaseSnapshot {
  const photos = snapshot.animalPhotos ?? [];
  if (photos.length === 0) return snapshot;
  return {
    ...snapshot,
    animalPhotos: photos.map((p) => ({
      ...p,
      thumbnailDataUrl: '',
      dataUrl: '',
    })),
  };
}

async function runStreamedZipMainThreadFallback(
  prefix: string,
  streamFn: (onChunk: (chunk: Uint8Array) => Promise<void>) => Promise<StreamingZipArchiveSummary>
): Promise<OpfsTempZipBuildResult> {
  await yieldToUiFrame();
  if (isOpfsSupported()) {
    const staged = await writeTempOpfsFileStreamed(
      prefix,
      'zip',
      async (writeChunk) => streamFn((chunk) => writeChunk(chunk)),
      { keepActiveAfterWrite: true }
    );
    if (staged) {
      return {
        opfsTempFileName: staged.fileName,
        blob: staged.blob,
        byteSize: staged.byteSize,
        photoCount: staged.meta.photoCount,
        animalCount: staged.meta.animalCount,
        binderCount: staged.meta.binderCount,
        totalImageBinaryBytes: staged.meta.totalImageBinaryBytes,
      };
    }
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const meta = await streamFn(async (chunk) => {
    chunks.push(chunk);
    total += chunk.byteLength;
  });
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {
    opfsTempFileName: null,
    bytes,
    byteSize: bytes.byteLength,
    photoCount: meta.photoCount,
    animalCount: meta.animalCount,
    binderCount: meta.binderCount,
    totalImageBinaryBytes: meta.totalImageBinaryBytes,
  };
}

export async function buildCompleteBackupZipToOpfsTmpOffThread(
  snapshot: BarnDatabaseSnapshot,
  filterSpecies?: string,
  extraMeta?: {
    backupScope?: 'barn' | 'species';
    backupReason?: SpeciesBackupReason;
    targetSpecies?: string;
  }
): Promise<OpfsTempZipBuildResult> {
  const workerPromise = runInWorker<OpfsTempZipBuildResult>((id) => ({
    id,
    kind: 'buildCompleteBackupZipToOpfsTmp',
    snapshot,
    filterSpecies,
    extraMeta,
  }));
  if (workerPromise) {
    const res = await workerPromise;
    if (res.opfsTempFileName) {
      markTempOpfsFileActive(res.opfsTempFileName);
    }
    return res;
  }
  const { streamCompleteBackupZipArchive } = await import('../core/backupArchive');
  return runStreamedZipMainThreadFallback('archive', (onChunk) =>
    streamCompleteBackupZipArchive(snapshot, onChunk, filterSpecies, extraMeta)
  );
}

export async function buildPhotosOnlyZipToOpfsTmpOffThread(
  snapshot: BarnDatabaseSnapshot,
  filterSpecies?: string
): Promise<OpfsTempZipBuildResult> {
  const workerPromise = runInWorker<OpfsTempZipBuildResult>((id) => ({
    id,
    kind: 'buildPhotosOnlyZipToOpfsTmp',
    snapshot,
    filterSpecies,
  }));
  if (workerPromise) {
    const res = await workerPromise;
    if (res.opfsTempFileName) {
      markTempOpfsFileActive(res.opfsTempFileName);
    }
    return res;
  }
  const { streamPhotosOnlyZipArchive } = await import('../core/backupArchive');
  return runStreamedZipMainThreadFallback('photos-archive', (onChunk) =>
    streamPhotosOnlyZipArchive(snapshot, onChunk, filterSpecies)
  );
}

export async function buildCompleteBackupZipOffThread(
  snapshot: BarnDatabaseSnapshot,
  filterSpecies?: string,
  extraMeta?: {
    backupScope?: 'barn' | 'species';
    backupReason?: SpeciesBackupReason;
    targetSpecies?: string;
  }
): Promise<BackupArchiveBuildResult> {
  const workerPromise = runInWorker<BackupArchiveBuildResult>((id) => ({
    id,
    kind: 'buildCompleteBackupZip',
    snapshot,
    filterSpecies,
    extraMeta,
  }));
  if (workerPromise) {
    return workerPromise;
  }
  await yieldToUiFrame();
  const { buildCompleteBackupZipArchive } = await import('../core/backupArchive');
  return buildCompleteBackupZipArchive(snapshot, filterSpecies, extraMeta);
}

export async function buildPhotosOnlyZipOffThread(
  snapshot: BarnDatabaseSnapshot,
  filterSpecies?: string
): Promise<BackupArchiveBuildResult> {
  const workerPromise = runInWorker<BackupArchiveBuildResult>((id) => ({
    id,
    kind: 'buildPhotosOnlyZip',
    snapshot,
    filterSpecies,
  }));
  if (workerPromise) {
    return workerPromise;
  }
  await yieldToUiFrame();
  const { buildPhotosOnlyZipArchive } = await import('../core/backupArchive');
  return buildPhotosOnlyZipArchive(snapshot, filterSpecies);
}

export async function parseBackupArchiveOffThread(
  bytes: Uint8Array,
  fileName: string,
  fallbackSettings: BarnSettings
): Promise<ParsedBackupArchive> {
  const workerPromise = runInWorker<ParsedBackupArchive>((id) => ({
    id,
    kind: 'parseBackupArchive',
    bytes,
    fileName,
    fallbackSettings,
  }));
  if (workerPromise) {
    return workerPromise;
  }
  await yieldToUiFrame();
  const { parseBackupArchiveInput } = await import('../core/backupArchive');
  return parseBackupArchiveInput(bytes, fileName, fallbackSettings);
}

export async function parseExternalImportOffThread(
  platformId: string,
  inputs: RawArchiveInput[],
  existingSnapshot: BarnDatabaseSnapshot,
  options: ImporterRunOptions
): Promise<PlatformImportPreview> {
  const lightSnapshot = buildImporterWorkerSnapshot(existingSnapshot);
  const workerPromise = runInWorker<PlatformImportPreview>((id) => ({
    id,
    kind: 'parseExternalImport',
    platformId,
    inputs,
    existingSnapshot: lightSnapshot,
    options,
  }));
  if (workerPromise) {
    return workerPromise;
  }
  await yieldToUiFrame();
  const { getPlatformImporterById } = await import('../core/importers/registry');
  const importer = getPlatformImporterById(platformId);
  return importer.parse(inputs, lightSnapshot, options);
}

export async function buildSupportBundleZipOffThread(
  params: SupportBundleBuildParams
): Promise<SupportBundleBuildResult> {
  const workerPromise = runInWorker<SupportBundleBuildResult>((id) => ({
    id,
    kind: 'buildSupportBundleZip',
    params,
  }));
  if (workerPromise) {
    return workerPromise;
  }
  await yieldToUiFrame();
  const { buildSupportBundleZipArchive } = await import('../core/supportBundle');
  return buildSupportBundleZipArchive(params);
}

export async function inspectBackupArchiveOffThread(
  bytes: Uint8Array,
  fileName: string,
  currentSnapshot: BarnDatabaseSnapshot,
  encrypted = false
): Promise<{
  parsed: ParsedBackupArchive;
  inspection: PreRestoreArchiveInspection;
}> {
  const lightCurrent = buildImporterWorkerSnapshot(currentSnapshot);
  const workerPromise = runInWorker<{
    parsed: ParsedBackupArchive;
    inspection: PreRestoreArchiveInspection;
  }>((id) => ({
    id,
    kind: 'inspectBackupArchive',
    bytes,
    fileName,
    currentSnapshot: lightCurrent,
    encrypted,
  }));
  if (workerPromise) {
    return workerPromise;
  }
  await yieldToUiFrame();
  const [{ parseBackupArchiveInput }, { inspectParsedArchiveBeforeRestorePure }] =
    await Promise.all([
      import('../core/backupArchive'),
      import('../core/archiveInspector'),
    ]);
  const parsed = parseBackupArchiveInput(
    bytes,
    fileName,
    lightCurrent.settings
  );
  const inspection = inspectParsedArchiveBeforeRestorePure(parsed, lightCurrent, {
    fileName,
    encrypted,
  });
  return { parsed, inspection };
}

export function isArchiveWorkerDisabled(): boolean {
  return workerDisabled || typeof Worker === 'undefined';
}

export function resetArchiveWorkerForTests(): void {
  workerDisabled = false;
  consecutiveWorkerFailures = 0;
  if (freezeListenerUnregister) {
    freezeListenerUnregister();
    freezeListenerUnregister = null;
  }
  rejectAndResetWorker('Archive worker reset.');
}
