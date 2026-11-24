/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Web Browser File Download & Upload Wrappers.
 *
 * CROSS-PLATFORM MIGRATION NOTE:
 * Isolated from `src/core/` so React Native / Expo replaces only this file with
 * `expo-file-system` + `expo-sharing` + `expo-document-picker`.
 */

import { pedigreeBridge } from '../native/pedigreeBridge';
import { logDiagnosticEvent } from '../storage/crashLogger';
import {
  isOpfsSupported,
  markTempOpfsFileActive,
  readTempOpfsFileAsBlob,
  removeTempOpfsFile,
  unmarkTempOpfsFileActive,
  writeTempOpfsFile,
  writeTempOpfsFileStreamed,
} from '../storage/opfsStorage';
import { acquireForegroundTransferLease } from '../storage/storageProbes';
import { isIosBrowser, isStandalonePwa } from '../storage/storageProtection';
import { readBlobAsArrayBuffer } from './es2018Shims';

export type FileShareOutcome = 'shared' | 'downloaded' | 'cancelled';

export function isInstalledIosPwa(): boolean {
  if (!isIosBrowser()) return false;
  if (isStandalonePwa()) return true;
  if (typeof navigator !== 'undefined') {
    return (navigator as unknown as { standalone?: boolean }).standalone === true;
  }
  return false;
}

export function isFileShareAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return (err as { name?: unknown }).name === 'AbortError';
}

export const OPFS_SCRATCHPAD_THRESHOLD_BYTES = 512 * 1024;
const BLOB_DOWNLOAD_CLEANUP_DELAY_MS = 4000;

function estimatePayloadByteLength(payload: string | Uint8Array): number {
  if (typeof payload !== 'string') {
    return payload.byteLength;
  }
  return payload.length * 2;
}

export function shouldBypassOpfsForIosGesture(payload: string | Uint8Array): boolean {
  return isInstalledIosPwa() && estimatePayloadByteLength(payload) < OPFS_SCRATCHPAD_THRESHOLD_BYTES;
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const buffer = await readBlobAsArrayBuffer(blob);
  return new Uint8Array(buffer);
}

async function payloadToUint8Array(
  payload: string | Uint8Array,
  mimeType: string
): Promise<Uint8Array> {
  if (typeof payload !== 'string') {
    return payload;
  }
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(payload);
  }
  return blobToUint8Array(toDirectBlob(payload, mimeType));
}

function toBlobCompatibleUint8Array(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (
    typeof ArrayBuffer !== 'undefined' &&
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
  ) {
    return bytes as Uint8Array<ArrayBuffer>;
  }
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy;
}

function toDirectBlob(payload: string | Uint8Array, mimeType: string): Blob {
  if (typeof payload === 'string') {
    const typedMime = mimeType.toLowerCase().includes('charset')
      ? mimeType
      : `${mimeType};charset=utf-8`;
    return new Blob([payload], { type: typedMime });
  }
  return new Blob([toBlobCompatibleUint8Array(payload)], { type: mimeType });
}

function extractSafeExtension(filename: string): string {
  const parts = (filename || '').split('.');
  const raw = parts.length > 1 ? parts[parts.length - 1] : '';
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '') || 'tmp';
}

async function stagePayloadInOpfsTmp(
  prefix: string,
  filename: string,
  payload: string | Uint8Array
): Promise<{ fileName: string; blob: Blob } | null> {
  if (!isOpfsSupported()) return null;
  let stagedFileName: string | null = null;
  try {
    const ext = extractSafeExtension(filename);
    const staged = await writeTempOpfsFile(prefix, payload, ext, {
      keepActiveAfterWrite: true,
    });
    if (!staged) return null;
    stagedFileName = staged.fileName;
    const opfsFile = await readTempOpfsFileAsBlob(staged.fileName);
    if (!opfsFile) {
      unmarkTempOpfsFileActive(staged.fileName);
      await removeTempOpfsFile(staged.fileName);
      return null;
    }
    return { fileName: staged.fileName, blob: opfsFile };
  } catch {
    if (stagedFileName) {
      unmarkTempOpfsFileActive(stagedFileName);
      await removeTempOpfsFile(stagedFileName);
    }
    return null;
  }
}

type WebShareFileAttempt =
  | { status: 'shared' }
  | { status: 'cancelled' }
  | { status: 'unavailable' | 'unsupported' }
  | { status: 'error'; error: unknown };

async function tryShareFileViaWebShare(
  filename: string,
  blob: Blob,
  fallbackMimeType?: string
): Promise<WebShareFileAttempt> {
  const releaseLease = acquireForegroundTransferLease();
  try {
    const hasShareApi =
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      typeof File !== 'undefined';

    if (!hasShareApi) {
      return { status: 'unavailable' };
    }

    const resolvedMime = blob.type || fallbackMimeType || 'application/octet-stream';
    const file =
      blob instanceof File && blob.name === filename
        ? blob
        : new File([blob], filename, { type: resolvedMime });

    let canShareFiles = false;
    try {
      canShareFiles = navigator.canShare({ files: [file] });
    } catch {
      canShareFiles = false;
    }

    if (!canShareFiles) {
      return { status: 'unsupported' };
    }

    try {
      // Pass only `{ files: [file] }` — iOS Share Sheet rejects or duplicates payloads with extra title/text/url fields
      await navigator.share({ files: [file] });
      return { status: 'shared' };
    } catch (err) {
      if (isFileShareAbortError(err)) {
        return { status: 'cancelled' };
      }
      return { status: 'error', error: err };
    }
  } finally {
    releaseLease();
  }
}

async function dispatchBlobDownloadAndCleanup(
  filename: string,
  blob: Blob,
  stagedFileName: string | null,
  fallbackMimeType?: string
): Promise<void> {
  const releaseLease = acquireForegroundTransferLease();
  try {
    if (pedigreeBridge.isNativeWrapper()) {
      try {
        const bytes = await blobToUint8Array(blob);
        const mimeType = blob.type || fallbackMimeType || 'application/octet-stream';
        const res = await pedigreeBridge.exportOrShareBinary({
          filename,
          mimeType,
          mode: 'save',
          bytes,
        });
        if (!res.ok) {
          throw new Error(res.error || `Native export failed for "${filename}".`);
        }
        return;
      } finally {
        if (stagedFileName) {
          unmarkTempOpfsFileActive(stagedFileName);
          await removeTempOpfsFile(stagedFileName);
        }
      }
    }

    if (isInstalledIosPwa()) {
      try {
        const shareResult = await tryShareFileViaWebShare(filename, blob, fallbackMimeType);
        if (shareResult.status === 'shared' || shareResult.status === 'cancelled') {
          return;
        }
        if (shareResult.status === 'error') {
          const msg =
            shareResult.error instanceof Error && shareResult.error.message
              ? shareResult.error.message
              : 'Share sheet failed.';
          logDiagnosticEvent({
            level: 'error',
            category: 'storage',
            message: `iOS standalone PWA file export failed for "${filename}": ${msg}`,
            error: shareResult.error,
          });
          throw new Error(
            `Could not export "${filename}" from the iOS Home Screen app (${msg}). Try opening in Safari or freeing device storage.`
          );
        }
        throw new Error(
          `Could not save "${filename}" because iOS Home Screen file sharing is unavailable here. Open this page in Safari to download or share files.`
        );
      } finally {
        if (stagedFileName) {
          unmarkTempOpfsFileActive(stagedFileName);
          await removeTempOpfsFile(stagedFileName);
        }
      }
    }

    let url: string | null = null;
    let downloadDispatched = false;

    try {
      url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      try {
        anchor.click();
        downloadDispatched = true;
      } finally {
        if (anchor.parentNode) {
          anchor.parentNode.removeChild(anchor);
        }
      }

      const activeUrl = url;
      const activeTempFile = stagedFileName;
      setTimeout(() => {
        try {
          URL.revokeObjectURL(activeUrl);
        } finally {
          if (activeTempFile) {
            unmarkTempOpfsFileActive(activeTempFile);
            void removeTempOpfsFile(activeTempFile);
          }
        }
      }, BLOB_DOWNLOAD_CLEANUP_DELAY_MS);
    } finally {
      if (!downloadDispatched) {
        if (url) {
          URL.revokeObjectURL(url);
        }
        if (stagedFileName) {
          unmarkTempOpfsFileActive(stagedFileName);
          await removeTempOpfsFile(stagedFileName);
        }
      }
    }
  } finally {
    releaseLease();
  }
}

/**
 * Triggers a browser download directly from an existing `Blob` or OPFS `File` handle
 * without copying the payload through JS strings, byte buffers, or `/tmp`.
 */
export async function downloadBlobDirect(filename: string, blob: Blob): Promise<void> {
  await dispatchBlobDownloadAndCleanup(filename, blob, null);
}

/**
 * Triggers a browser download from an already-staged OPFS `/tmp` file (or fallback `bytes`
 * if OPFS was unavailable) and cleans up the `/tmp` file right after dispatch.
 */
export async function downloadTempOpfsExport(
  filename: string,
  staged: { opfsTempFileName: string | null; blob?: Blob | null; bytes?: Uint8Array },
  mimeType: string = 'application/octet-stream'
): Promise<void> {
  if (staged.opfsTempFileName) {
    markTempOpfsFileActive(staged.opfsTempFileName);
    let blob = staged.blob ?? null;
    if (!blob) {
      blob = await readTempOpfsFileAsBlob(staged.opfsTempFileName);
    }
    if (blob) {
      await dispatchBlobDownloadAndCleanup(filename, blob, staged.opfsTempFileName, mimeType);
      return;
    }
    unmarkTempOpfsFileActive(staged.opfsTempFileName);
    await removeTempOpfsFile(staged.opfsTempFileName);
  }

  if (staged.bytes) {
    await downloadBinaryFile(filename, staged.bytes, mimeType);
    return;
  }

  throw new Error(`Could not read staged export file "${filename}" for download.`);
}

async function triggerBlobDownloadWithOpfsScratchpad(
  filename: string,
  payload: string | Uint8Array,
  mimeType: string
): Promise<void> {
  if (pedigreeBridge.isNativeWrapper()) {
    const bytes = await payloadToUint8Array(payload, mimeType);
    const res = await pedigreeBridge.exportOrShareBinary({
      filename,
      mimeType: mimeType || 'application/octet-stream',
      mode: 'save',
      bytes,
    });
    if (!res.ok) {
      throw new Error(res.error || `Native export failed for "${filename}".`);
    }
    return;
  }

  const staged = shouldBypassOpfsForIosGesture(payload)
    ? null
    : await stagePayloadInOpfsTmp('export', filename, payload);
  const blob = staged ? staged.blob : toDirectBlob(payload, mimeType);
  await dispatchBlobDownloadAndCleanup(filename, blob, staged ? staged.fileName : null, mimeType);
}

/**
 * Streams text/binary chunks incrementally into OPFS `/tmp` when OPFS is available
 * (never materializing a monolithic string or `Blob` in JS heap beforehand) and triggers download.
 */
export async function downloadTextChunks(
  filename: string,
  chunks: Iterable<string | Uint8Array> | AsyncIterable<string | Uint8Array>,
  mimeType: string
): Promise<void> {
  if (isOpfsSupported()) {
    const ext = extractSafeExtension(filename);
    try {
      const staged = await writeTempOpfsFileStreamed(
        'export',
        ext,
        async (writeChunk) => {
          for await (const chunk of chunks) {
            await writeChunk(chunk);
          }
        },
        { keepActiveAfterWrite: true }
      );
      if (staged) {
        await dispatchBlobDownloadAndCleanup(filename, staged.blob, staged.fileName, mimeType);
        return;
      }
    } catch {
      // Fall through to in-memory Blob fallback below if OPFS streaming fails
    }
  }

  const parts: BlobPart[] = [];
  for await (const chunk of chunks) {
    if (typeof chunk === 'string') {
      if (chunk.length > 0) parts.push(chunk);
    } else if (chunk.byteLength > 0) {
      parts.push(toBlobCompatibleUint8Array(chunk));
    }
  }
  const typedMime = mimeType.toLowerCase().includes('charset')
    ? mimeType
    : `${mimeType};charset=utf-8`;
  await downloadBlobDirect(filename, new Blob(parts, { type: typedMime }));
}

export async function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string
): Promise<void> {
  await triggerBlobDownloadWithOpfsScratchpad(filename, content, mimeType);
}

async function sharePayloadOrDownload(params: {
  filename: string;
  payload: string | Uint8Array;
  mimeType: string;
  title: string;
  text?: string;
}): Promise<FileShareOutcome> {
  const { filename, payload, mimeType } = params;
  if (pedigreeBridge.isNativeWrapper()) {
    const bytes = await payloadToUint8Array(payload, mimeType);
    const resolvedMime = mimeType || 'application/octet-stream';
    const res = await pedigreeBridge.exportOrShareBinary({
      filename,
      mimeType: resolvedMime,
      mode: 'share',
      bytes,
    });
    if (res.ok) {
      return 'shared';
    }
    const saveRes = await pedigreeBridge.exportOrShareBinary({
      filename,
      mimeType: resolvedMime,
      mode: 'save',
      bytes,
    });
    if (!saveRes.ok) {
      throw new Error(saveRes.error || `Native export failed for "${filename}".`);
    }
    return 'downloaded';
  }

  const iosPwa = isInstalledIosPwa();
  const hasShareApi =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function';

  if (!hasShareApi) {
    if (iosPwa) {
      throw new Error(
        `Native file sharing is unavailable in this iOS Home Screen context for "${filename}". Open this page in Safari to save or share files.`
      );
    }
    await triggerBlobDownloadWithOpfsScratchpad(filename, payload, mimeType);
    return 'downloaded';
  }

  const staged = shouldBypassOpfsForIosGesture(payload)
    ? null
    : await stagePayloadInOpfsTmp('share', filename, payload);
  let handedOffToDownload = false;

  try {
    const shareBlob =
      staged && typeof Blob !== 'undefined' && staged.blob instanceof Blob
        ? staged.blob
        : toDirectBlob(payload, mimeType);
    const shareResult = await tryShareFileViaWebShare(filename, shareBlob, mimeType);

    if (shareResult.status === 'shared') {
      return 'shared';
    }
    if (shareResult.status === 'cancelled') {
      return 'cancelled';
    }
    if (shareResult.status === 'error') {
      const msg =
        shareResult.error instanceof Error && shareResult.error.message
          ? shareResult.error.message
          : 'Web Share request failed.';
      logDiagnosticEvent({
        level: 'warn',
        category: 'storage',
        message: `Web Share failed for "${filename}": ${msg}`,
        error: shareResult.error,
      });
      if (iosPwa) {
        throw new Error(
          `Could not share "${filename}" from the iOS Home Screen app (${msg}). Open in Safari or try again.`
        );
      }
    } else if (iosPwa) {
      throw new Error(
        `This iOS Home Screen app context cannot share "${filename}" directly. Open this page in Safari to download or share.`
      );
    }

    const downloadBlob = staged ? staged.blob : toDirectBlob(payload, mimeType);
    const stagedName = staged ? staged.fileName : null;
    handedOffToDownload = true;
    await dispatchBlobDownloadAndCleanup(filename, downloadBlob, stagedName, mimeType);
    return 'downloaded';
  } finally {
    if (staged && !handedOffToDownload) {
      unmarkTempOpfsFileActive(staged.fileName);
      await removeTempOpfsFile(staged.fileName);
    }
  }
}

export async function shareTextFileOrDownload(params: {
  filename: string;
  content: string;
  mimeType: string;
  title: string;
  text?: string;
}): Promise<FileShareOutcome> {
  return sharePayloadOrDownload({
    filename: params.filename,
    payload: params.content,
    mimeType: params.mimeType,
    title: params.title,
    text: params.text,
  });
}

export async function downloadBinaryFile(
  filename: string,
  bytes: Uint8Array,
  mimeType: string = 'application/octet-stream'
): Promise<void> {
  await triggerBlobDownloadWithOpfsScratchpad(filename, bytes, mimeType);
}

export async function shareBinaryFileOrDownload(params: {
  filename: string;
  bytes: Uint8Array;
  mimeType: string;
  title: string;
  text?: string;
}): Promise<FileShareOutcome> {
  return sharePayloadOrDownload({
    filename: params.filename,
    payload: params.bytes,
    mimeType: params.mimeType,
    title: params.title,
    text: params.text,
  });
}

export async function copyTextWithFallback(
  text: string
): Promise<'clipboard' | 'execCommand' | 'unsupported'> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return 'clipboard';
    } catch {
      // Fall through to legacy textarea copy attempt
    }
  }

  if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (copied) {
        return 'execCommand';
      }
    } catch {
      // Ignore execCommand rejection
    }
  }

  return 'unsupported';
}

