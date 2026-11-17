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
  readTempOpfsFileAsBlob,
  removeTempOpfsFile,
  unmarkTempOpfsFileActive,
  writeTempOpfsFile,
} from '../storage/opfsStorage';

export const OPFS_SCRATCHPAD_THRESHOLD_BYTES = 512 * 1024;

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
    return new Blob([payload], { type: `${mimeType};charset=utf-8` });
  }
  return new Blob([toBlobCompatibleUint8Array(payload)], { type: mimeType });
}

function estimatePayloadBytes(payload: string | Uint8Array): number {
  if (typeof payload !== 'string') return payload.byteLength;
  if (typeof Blob !== 'undefined') {
    return new Blob([payload]).size;
  }
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(payload).byteLength;
  }
  return payload.length * 2;
}

/**
 * Triggers a browser download directly from an existing `Blob` or OPFS `File` handle
 * without copying the payload through JS strings, byte buffers, or `/tmp`.
 */
export async function downloadBlobDirect(filename: string, blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    if (anchor.parentNode) {
      anchor.parentNode.removeChild(anchor);
    }
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 2000);
  }
}

async function triggerBlobDownloadWithOpfsScratchpad(
  filename: string,
  payload: string | Uint8Array,
  mimeType: string
): Promise<void> {
  const byteSize = estimatePayloadBytes(payload);
  let stagedFileName: string | null = null;
  let url: string | null = null;
  let downloadDispatched = false;

  try {
    let blob: Blob;
    if (byteSize >= OPFS_SCRATCHPAD_THRESHOLD_BYTES && isOpfsSupported()) {
      try {
        const ext = filename.split('.').pop() || 'tmp';
        const stagedPayload =
          typeof payload === 'string' ? payload : toBlobCompatibleUint8Array(payload);
        const staged = await writeTempOpfsFile('export', stagedPayload, ext, {
          keepActiveAfterWrite: true,
        });
        if (staged) {
          stagedFileName = staged.fileName;
          const opfsFile = await readTempOpfsFileAsBlob(staged.fileName);
          blob = opfsFile ?? toDirectBlob(payload, mimeType);
        } else {
          blob = toDirectBlob(payload, mimeType);
        }
      } catch {
        blob = toDirectBlob(payload, mimeType);
      }
    } else {
      blob = toDirectBlob(payload, mimeType);
    }

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
    }, 2000);
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

export async function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string
): Promise<void> {
  await triggerBlobDownloadWithOpfsScratchpad(filename, content, mimeType);
}

export async function shareTextFileOrDownload(params: {
  filename: string;
  content: string;
  mimeType: string;
  title: string;
  text?: string;
}): Promise<'shared' | 'downloaded'> {
  const { filename, content, mimeType, title, text } = params;
  const file = new File([content], filename, { type: mimeType });

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        title,
        text,
        files: [file],
      });
      return 'shared';
    } catch {
      // Share sheet cancelled or unsupported by target — fall back to standard download
    }
  }

  await downloadTextFile(filename, content, mimeType);
  return 'downloaded';
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
  const { filename, bytes, mimeType, title, text } = params;
  const file = new File([toBlobCompatibleUint8Array(bytes)], filename, { type: mimeType });

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        title,
        text,
        files: [file],
      });
      return 'shared';
    } catch {
      // User cancelled or share target rejected — fall back to clean file download
    }
  }

  await downloadBinaryFile(filename, bytes, mimeType);
  return 'downloaded';
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

