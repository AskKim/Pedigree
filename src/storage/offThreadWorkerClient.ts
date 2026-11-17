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

import {
  inspectParsedArchiveBeforeRestorePure,
  PreRestoreArchiveInspection,
} from '../core/archiveInspector';
import {
  BackupArchiveBuildResult,
  buildCompleteBackupZipArchive,
  buildPhotosOnlyZipArchive,
  parseBackupArchiveInput,
  ParsedBackupArchive,
} from '../core/backupArchive';
import type {
  ImporterRunOptions,
  PlatformImportPreview,
  RawArchiveInput,
} from '../core/importers/importerTypes';
import { getPlatformImporterById } from '../core/importers/registry';
import type { BarnDatabaseSnapshot, BarnSettings } from '../core/models';
import {
  buildSupportBundleZipArchive,
  SupportBundleBuildParams,
  SupportBundleBuildResult,
} from '../core/supportBundle';
import type { SpeciesBackupReason } from '../core/syncAndExports';
import type { ArchiveWorkerRequest, ArchiveWorkerResponse } from './archiveAndImport.worker';
import { logDiagnosticEvent } from './crashLogger';

const WORKER_TIMEOUT_MS = 90_000;
const WORKER_IDLE_TERMINATE_MS = 60_000;
const MAX_TRANSIENT_WORKER_FAILURES = 3;

interface PendingWorkerJob {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let activeWorker: Worker | null = null;
let workerDisabled = false;
let consecutiveWorkerFailures = 0;
let idleTerminateTimer: ReturnType<typeof setTimeout> | null = null;
let jobCounter = 0;
const pendingJobs = new Map<string, PendingWorkerJob>();

function clearIdleTerminateTimer(): void {
  if (idleTerminateTimer !== null) {
    clearTimeout(idleTerminateTimer);
    idleTerminateTimer = null;
  }
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
  const payload = buildPayload(id);

  return new Promise<TResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingJobs.delete(id);
      rejectAndResetWorker(
        'Archive operation timed out in background worker. Try a smaller batch or ZIP.'
      );
    }, WORKER_TIMEOUT_MS);

    pendingJobs.set(id, { resolve, reject, timer });
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
  rejectAndResetWorker('Archive worker reset.');
}
