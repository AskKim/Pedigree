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
  writeTempOpfsFile,
} from '../storage/opfsStorage';

export const OPFS_SCRATCHPAD_THRESHOLD_BYTES = 512 * 1024;

function toDirectBlob(payload: string | Uint8Array, mimeType: string): Blob {
  if (typeof payload === 'string') {
    return new Blob([payload], { type: `${mimeType};charset=utf-8` });
  }
  const copy = new Uint8Array(payload.byteLength);
  copy.set(payload);
  return new Blob([copy], { type: mimeType });
}

function estimatePayloadBytes(payload: string | Uint8Array): number {
  if (typeof payload !== 'string') return payload.byteLength;
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(payload).byteLength;
  }
  return payload.length * 2;
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
          typeof payload === 'string'
            ? payload
            : (() => {
                const copy = new Uint8Array(payload.byteLength);
                copy.set(payload);
                return copy;
              })();
        const staged = await writeTempOpfsFile('export', stagedPayload, ext);
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
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const file = new File([copy], filename, { type: mimeType });

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
