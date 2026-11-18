/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Worker-Safe OPFS `/tmp` Scratchpad & Incremental Chunk Streamer (`src/storage/opfsTempStream.ts`).
 *
 * Intentionally free of React, DOM, `localSyncChannels`, and `offThreadWorkerClient` imports
 * so Dedicated Web Workers (`archiveAndImport.worker.ts`) can stream large `.ZIP` chunks
 * straight to OPFS `/tmp` without pulling UI dependencies into the worker bundle.
 */

import { generateUuid } from '../core/models';
import { readBlobAsArrayBuffer, readBlobAsText } from '../utils/es2018Shims';

export type OpfsNamespace = 'tmp' | 'backups' | 'archives';

export interface OpfsWritableStream {
  write(data: string | Uint8Array | ArrayBuffer | Blob): Promise<void>;
  close(): Promise<void>;
}

export interface OpfsFileHandle {
  kind?: 'file';
  name: string;
  getFile(): Promise<File | Blob>;
  createWritable(): Promise<OpfsWritableStream>;
}

export interface OpfsDirectoryHandle {
  kind?: 'directory';
  name?: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<OpfsDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  entries?: () => AsyncIterable<[string, OpfsFileHandle | OpfsDirectoryHandle]>;
  values?: () => AsyncIterable<OpfsFileHandle | OpfsDirectoryHandle>;
}

export interface StreamedOpfsTempFileResult<T = void> {
  fileName: string;
  byteSize: number;
  blob: Blob;
  meta: T;
}

export type OpfsDiagnosticLogger = (event: {
  level: 'info' | 'warn' | 'error';
  category: 'storage' | 'memory';
  message: string;
  error?: unknown;
}) => void;

const TEMP_WRITE_CHUNK_BYTES = 256 * 1024;
const TEMP_TEXT_SLICE_CHARS = 128 * 1024;

const activeTempFiles = new Set<string>();
let testRootResolver: (() => Promise<OpfsDirectoryHandle | null>) | null = null;
let diagnosticLogger: OpfsDiagnosticLogger | null = null;

export function registerOpfsDiagnosticLogger(logger: OpfsDiagnosticLogger | null): void {
  diagnosticLogger = logger;
}

function emitOpfsLog(event: {
  level: 'info' | 'warn' | 'error';
  category: 'storage' | 'memory';
  message: string;
  error?: unknown;
}): void {
  diagnosticLogger?.(event);
}

export function isOpfsQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number; message?: string };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    (typeof e.message === 'string' && /quota/i.test(e.message))
  );
}

export function markTempOpfsFileActive(fileName: string): void {
  if (fileName) activeTempFiles.add(fileName);
}

export function unmarkTempOpfsFileActive(fileName: string): void {
  if (fileName) activeTempFiles.delete(fileName);
}

export function isTempOpfsFileActive(fileName: string): boolean {
  return Boolean(fileName && activeTempFiles.has(fileName));
}

/**
 * Allows deterministic unit tests to inject an in-memory OPFS root handle mock.
 * Pass `null` to restore native browser `navigator.storage.getDirectory()`.
 */
export function setOpfsRootResolverForTest(
  resolver: (() => Promise<OpfsDirectoryHandle | null>) | null
): void {
  testRootResolver = resolver;
  if (!resolver) {
    activeTempFiles.clear();
  }
}

export function isOpfsSupported(): boolean {
  if (testRootResolver) return true;
  if (typeof navigator === 'undefined') return false;
  const storage = navigator.storage as (StorageManager & { getDirectory?: unknown }) | undefined;
  return Boolean(storage && typeof storage.getDirectory === 'function');
}

export async function getOpfsRoot(): Promise<OpfsDirectoryHandle | null> {
  if (testRootResolver) {
    return testRootResolver();
  }
  if (typeof navigator === 'undefined') return null;
  const storage = navigator.storage as
    | (StorageManager & { getDirectory?: () => Promise<OpfsDirectoryHandle> })
    | undefined;
  if (!storage || typeof storage.getDirectory !== 'function') {
    return null;
  }
  try {
    return (await storage.getDirectory()) as unknown as OpfsDirectoryHandle;
  } catch (err) {
    emitOpfsLog({
      level: 'warn',
      category: 'storage',
      message: 'Could not open Origin Private File System root directory — using fallback storage',
      error: err,
    });
    return null;
  }
}

export async function getOpfsSubdir(
  namespace: OpfsNamespace,
  create = true
): Promise<OpfsDirectoryHandle | null> {
  const root = await getOpfsRoot();
  if (!root) return null;
  try {
    return await root.getDirectoryHandle(namespace, { create });
  } catch {
    return null;
  }
}

export async function listDirEntries(
  dir: OpfsDirectoryHandle
): Promise<Array<{ name: string; handle: OpfsFileHandle | OpfsDirectoryHandle }>> {
  const results: Array<{ name: string; handle: OpfsFileHandle | OpfsDirectoryHandle }> = [];
  if (typeof dir.entries === 'function') {
    for await (const [name, handle] of dir.entries()) {
      results.push({ name, handle });
    }
    return results;
  }
  if (typeof dir.values === 'function') {
    for await (const handle of dir.values()) {
      if (handle && typeof handle.name === 'string') {
        results.push({ name: handle.name, handle });
      }
    }
  }
  return results;
}

export async function readOpfsFileText(
  dir: OpfsDirectoryHandle,
  fileName: string
): Promise<string | null> {
  try {
    const fh = await dir.getFileHandle(fileName, { create: false });
    const file = await fh.getFile();
    return await readBlobAsText(file);
  } catch {
    return null;
  }
}

export async function readOpfsFileBytes(
  dir: OpfsDirectoryHandle,
  fileName: string
): Promise<Uint8Array | null> {
  try {
    const fh = await dir.getFileHandle(fileName, { create: false });
    const file = await fh.getFile();
    const buf = await readBlobAsArrayBuffer(file);
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

export async function removeOpfsEntrySafe(dir: OpfsDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.removeEntry(name);
    return true;
  } catch {
    return false;
  }
}

function sliceUtf16Safe(
  text: string,
  start: number,
  maxChars: number
): { slice: string; nextOffset: number } {
  let end = Math.min(text.length, start + maxChars);
  if (end < text.length && end > start) {
    const lastCode = text.charCodeAt(end - 1);
    if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
      end = Math.min(text.length, end + 1);
    }
  }
  return { slice: text.slice(start, end), nextOffset: end };
}

async function writeChunkedDataToWritable(
  writable: OpfsWritableStream,
  data: string | Uint8Array | Blob
): Promise<void> {
  if (typeof data === 'string') {
    if (data.length <= TEMP_TEXT_SLICE_CHARS) {
      await writable.write(data);
      return;
    }
    let offset = 0;
    while (offset < data.length) {
      const { slice, nextOffset } = sliceUtf16Safe(data, offset, TEMP_TEXT_SLICE_CHARS);
      if (slice.length > 0) {
        await writable.write(slice);
      }
      offset = nextOffset;
    }
    return;
  }

  if (data instanceof Uint8Array) {
    if (data.byteLength <= TEMP_WRITE_CHUNK_BYTES) {
      await writable.write(data);
      return;
    }
    for (let offset = 0; offset < data.byteLength; offset += TEMP_WRITE_CHUNK_BYTES) {
      const slice = data.subarray(offset, Math.min(data.byteLength, offset + TEMP_WRITE_CHUNK_BYTES));
      await writable.write(slice);
    }
    return;
  }

  await writable.write(data);
}

/**
 * Writes payload to a file inside `dir`, guaranteeing `writable.close()` inside `try / finally`.
 * If `QuotaExceededError` occurs, purges `/tmp` and retries the write once cleanly.
 */
export async function writeFileToOpfsDir(
  dir: OpfsDirectoryHandle,
  fileName: string,
  data: string | Uint8Array | Blob
): Promise<void> {
  const runWrite = async () => {
    const fh = await dir.getFileHandle(fileName, { create: true });
    const writable = await fh.createWritable();
    let bodySucceeded = false;
    try {
      await writeChunkedDataToWritable(writable, data);
      bodySucceeded = true;
    } finally {
      if (bodySucceeded) {
        await writable.close();
      } else {
        try {
          await writable.close();
        } catch {
          // Preserve primary write error so QuotaExceededError recovery runs cleanly
        }
      }
    }
  };

  try {
    await runWrite();
  } catch (err) {
    if (isOpfsQuotaError(err)) {
      const purged = await purgeOpfsTmp();
      emitOpfsLog({
        level: 'warn',
        category: 'memory',
        message: `Corrective action: QuotaExceededError during OPFS write "${fileName}" — purged ${purged.filesRemoved} /tmp file(s) and retrying once`,
        error: err,
      });
      await runWrite();
      return;
    }
    throw err;
  }
}

export async function purgeOpfsTmp(options: { includeActive?: boolean } = {}): Promise<{
  filesRemoved: number;
  bytesFreed: number;
}> {
  const includeActive = Boolean(options.includeActive);
  const tmpDir = await getOpfsSubdir('tmp', false);
  if (!tmpDir) return { filesRemoved: 0, bytesFreed: 0 };

  let filesRemoved = 0;
  let bytesFreed = 0;
  try {
    const entries = await listDirEntries(tmpDir);
    for (const item of entries) {
      if (item.handle.kind === 'directory') continue;
      if (!includeActive && activeTempFiles.has(item.name)) continue;
      try {
        const file = await (item.handle as OpfsFileHandle).getFile();
        bytesFreed += Number(file.size) || 0;
      } catch {
        // Ignore size inspect failure
      }
      if (await removeOpfsEntrySafe(tmpDir, item.name)) {
        filesRemoved++;
      }
    }
  } catch {
    // Non-fatal purge failure
  }
  return { filesRemoved, bytesFreed };
}

export async function sweepOrphanedOpfsTmpOnBoot(): Promise<{
  filesRemoved: number;
  bytesFreed: number;
}> {
  const res = await purgeOpfsTmp({ includeActive: false });
  if (res.filesRemoved > 0) {
    emitOpfsLog({
      level: 'info',
      category: 'storage',
      message: `Corrective action: Boot orphan sweep removed ${res.filesRemoved} stale /tmp OPFS file(s) (${res.bytesFreed} bytes reclaimed)`,
    });
  }
  return res;
}

function buildTempOpfsFileName(prefix: string, extension: string): string {
  const cleanPrefix = (prefix || 'export')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .slice(0, 32);
  const cleanExt = (extension || 'tmp').replace(/[^a-z0-9]/gi, '') || 'tmp';
  return `${cleanPrefix}-${Date.now().toString(36)}-${generateUuid().slice(0, 8)}.${cleanExt}`;
}

/**
 * Streams incremental chunks directly into an OPFS `/tmp` file handle without materializing
 * full-export string or `Uint8Array` buffers in JS heap beforehand. Guarantees `writable.close()`
 * inside `try/finally`, cleans up partial files on abort, and recovers from `QuotaExceededError` once.
 */
export async function writeTempOpfsFileStreamed<T = void>(
  prefix: string,
  extension: string,
  produceChunks: (
    writeChunk: (chunk: string | Uint8Array | Blob) => Promise<void>
  ) => Promise<T>,
  options?: { keepActiveAfterWrite?: boolean }
): Promise<StreamedOpfsTempFileResult<T> | null> {
  const tmpDir = await getOpfsSubdir('tmp', true);
  if (!tmpDir) return null;

  const fileName = buildTempOpfsFileName(prefix, extension);
  markTempOpfsFileActive(fileName);
  let writeSucceeded = false;

  const runAttempt = async (): Promise<StreamedOpfsTempFileResult<T>> => {
    const fh = await tmpDir.getFileHandle(fileName, { create: true });
    const writable = await fh.createWritable();
    let bodySucceeded = false;
    let meta: T;
    try {
      meta = await produceChunks(async (chunk) => {
        if (typeof chunk === 'string' && chunk.length === 0) return;
        if (chunk instanceof Uint8Array && chunk.byteLength === 0) return;
        await writeChunkedDataToWritable(writable, chunk);
      });
      bodySucceeded = true;
    } finally {
      if (bodySucceeded) {
        await writable.close();
      } else {
        try {
          await writable.close();
        } catch {
          // Preserve primary write error so QuotaExceededError recovery triggers cleanly
        }
      }
    }
    const file = await fh.getFile();
    return {
      fileName,
      byteSize: Number(file.size) || 0,
      blob: file,
      meta,
    };
  };

  try {
    let result: StreamedOpfsTempFileResult<T>;
    try {
      result = await runAttempt();
    } catch (err) {
      if (isOpfsQuotaError(err)) {
        await removeOpfsEntrySafe(tmpDir, fileName);
        const purged = await purgeOpfsTmp({ includeActive: false });
        emitOpfsLog({
          level: 'warn',
          category: 'memory',
          message: `Corrective action: QuotaExceededError during streamed OPFS export "${fileName}" — purged ${purged.filesRemoved} /tmp file(s) and retrying once`,
          error: err,
        });
        result = await runAttempt();
      } else {
        throw err;
      }
    }
    writeSucceeded = true;
    return result;
  } finally {
    if (!writeSucceeded) {
      unmarkTempOpfsFileActive(fileName);
      await removeOpfsEntrySafe(tmpDir, fileName);
    } else if (!options?.keepActiveAfterWrite) {
      unmarkTempOpfsFileActive(fileName);
    }
  }
}

export async function writeTempOpfsFile(
  prefix: string,
  data: string | Uint8Array | Blob,
  extension = 'tmp',
  options?: { keepActiveAfterWrite?: boolean }
): Promise<{ fileName: string } | null> {
  const tmpDir = await getOpfsSubdir('tmp', true);
  if (!tmpDir) return null;
  const fileName = buildTempOpfsFileName(prefix, extension);
  markTempOpfsFileActive(fileName);
  let writeSucceeded = false;
  try {
    await writeFileToOpfsDir(tmpDir, fileName, data);
    writeSucceeded = true;
    return { fileName };
  } finally {
    if (!writeSucceeded || !options?.keepActiveAfterWrite) {
      unmarkTempOpfsFileActive(fileName);
    }
  }
}

export async function readTempOpfsFileAsBlob(fileName: string): Promise<Blob | null> {
  const tmpDir = await getOpfsSubdir('tmp', false);
  if (!tmpDir) return null;
  try {
    const fh = await tmpDir.getFileHandle(fileName, { create: false });
    return await fh.getFile();
  } catch {
    return null;
  }
}

export async function removeTempOpfsFile(fileName: string): Promise<void> {
  unmarkTempOpfsFileActive(fileName);
  const tmpDir = await getOpfsSubdir('tmp', false);
  if (!tmpDir) return;
  await removeOpfsEntrySafe(tmpDir, fileName);
}
