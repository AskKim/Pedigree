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

import {
  isOpfsSupported,
  markTempOpfsFileActive,
  readTempOpfsFileAsBlob,
  removeTempOpfsFile,
  unmarkTempOpfsFileActive,
  writeTempOpfsFile,
  writeTempOpfsFileStreamed,
} from '../storage/opfsStorage';

export const OPFS_SCRATCHPAD_THRESHOLD_BYTES = 512 * 1024;
const BLOB_DOWNLOAD_CLEANUP_DELAY_MS = 4000;

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

async function dispatchBlobDownloadAndCleanup(
  filename: string,
  blob: Blob,
  stagedFileName: string | null
): Promise<void> {
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
      await dispatchBlobDownloadAndCleanup(filename, blob, staged.opfsTempFileName);
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
  const staged = await stagePayloadInOpfsTmp('export', filename, payload);
  const blob = staged ? staged.blob : toDirectBlob(payload, mimeType);
  await dispatchBlobDownloadAndCleanup(filename, blob, staged ? staged.fileName : null);
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
        await dispatchBlobDownloadAndCleanup(filename, staged.blob, staged.fileName);
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
}): Promise<'shared' | 'downloaded'> {
  const { filename, payload, mimeType, title, text } = params;
  const hasShareApi =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function';

  if (!hasShareApi) {
    await triggerBlobDownloadWithOpfsScratchpad(filename, payload, mimeType);
    return 'downloaded';
  }

  const staged = await stagePayloadInOpfsTmp('share', filename, payload);
  let handedOffToDownload = false;

  try {
    const sharePart: BlobPart =
      staged && typeof Blob !== 'undefined' && staged.blob instanceof Blob
        ? staged.blob
        : typeof payload === 'string'
        ? payload
        : toBlobCompatibleUint8Array(payload);
    const file = new File([sharePart], filename, { type: mimeType });

    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title,
          text,
          files: [file],
        });
        return 'shared';
      } catch {
        // Share sheet cancelled or unsupported by target — fall back to clean download
      }
    }

    const downloadBlob = staged ? staged.blob : toDirectBlob(payload, mimeType);
    const stagedName = staged ? staged.fileName : null;
    handedOffToDownload = true;
    await dispatchBlobDownloadAndCleanup(filename, downloadBlob, stagedName);
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
}): Promise<'shared' | 'downloaded'> {
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
}): Promise<'shared' | 'downloaded'> {
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

