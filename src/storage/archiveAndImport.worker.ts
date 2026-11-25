/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Dedicated Web Worker for Off-Thread `.ZIP` Archive Compression/Extraction,
 * Large External Pedigree Parsing, and Diagnostic Support Bundle Packaging.
 *
 * Keeps mobile Chrome/Safari UI threads responsive when compressing hundreds of
 * photos or unpacking multi-thousand-record CSV/HTM/JSON pedigree archives.
 */

import '../utils/es2018Shims';
import {
  inspectParsedArchiveBeforeRestorePure,
} from '../domain/archiveInspector';
import {
  buildCompleteBackupZipArchive,
  buildPhotosOnlyZipArchive,
  parseBackupArchiveInput,
  streamCompleteBackupZipArchive,
  streamPhotosOnlyZipArchive,
  StreamingZipArchiveSummary,
} from '../domain/backupArchive';
import type { ImporterRunOptions, RawArchiveInput } from '../domain/importers/importerTypes';
import { getPlatformImporterById } from '../domain/importers/registry';
import {
  type BarnDatabaseSnapshot,
  type BarnSettings,
  setCoreClockSkewMs,
} from '../domain/models';
import {
  buildSupportBundleZipArchive,
  type SupportBundleBuildParams,
} from '../domain/supportBundle';
import type { SpeciesBackupReason } from '../domain/syncAndExports';
import { isOpfsSupported, writeTempOpfsFileStreamed } from './opfsTempStream';

export interface OpfsTempZipBuildResult {
  opfsTempFileName: string | null;
  bytes?: Uint8Array;
  blob?: Blob;
  byteSize: number;
  photoCount: number;
  animalCount: number;
  binderCount: number;
  totalImageBinaryBytes: number;
}

export type ArchiveWorkerRequest = (
  | {
      id: string;
      kind: 'buildCompleteBackupZip';
      snapshot: BarnDatabaseSnapshot;
      filterSpecies?: string;
      extraMeta?: {
        backupScope?: 'barn' | 'species';
        backupReason?: SpeciesBackupReason;
        targetSpecies?: string;
      };
    }
  | {
      id: string;
      kind: 'buildCompleteBackupZipToOpfsTmp';
      snapshot: BarnDatabaseSnapshot;
      filterSpecies?: string;
      extraMeta?: {
        backupScope?: 'barn' | 'species';
        backupReason?: SpeciesBackupReason;
        targetSpecies?: string;
      };
    }
  | {
      id: string;
      kind: 'buildPhotosOnlyZip';
      snapshot: BarnDatabaseSnapshot;
      filterSpecies?: string;
    }
  | {
      id: string;
      kind: 'buildPhotosOnlyZipToOpfsTmp';
      snapshot: BarnDatabaseSnapshot;
      filterSpecies?: string;
    }
  | {
      id: string;
      kind: 'parseBackupArchive';
      bytes: Uint8Array;
      fileName: string;
      fallbackSettings: BarnSettings;
    }
  | {
      id: string;
      kind: 'parseExternalImport';
      platformId: string;
      inputs: RawArchiveInput[];
      existingSnapshot: BarnDatabaseSnapshot;
      options: ImporterRunOptions;
    }
  | {
      id: string;
      kind: 'buildSupportBundleZip';
      params: SupportBundleBuildParams;
    }
  | {
      id: string;
      kind: 'inspectBackupArchive';
      bytes: Uint8Array;
      fileName: string;
      currentSnapshot: BarnDatabaseSnapshot;
      encrypted?: boolean;
    }
) & { clockSkewMs?: number };

export type ArchiveWorkerResponse =
  | {
      id: string;
      ok: true;
      result: unknown;
    }
  | {
      id: string;
      ok: false;
      error: string;
    };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ArchiveWorkerRequest>) => void) | null;
  postMessage: (message: ArchiveWorkerResponse, transfer?: Transferable[]) => void;
};

function concatChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const out = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function runStreamedZipInWorker(
  prefix: string,
  streamFn: (onChunk: (chunk: Uint8Array) => Promise<void>) => Promise<StreamingZipArchiveSummary>
): Promise<{ result: OpfsTempZipBuildResult; transfer: Transferable[] }> {
  if (isOpfsSupported()) {
    const staged = await writeTempOpfsFileStreamed(
      prefix,
      'zip',
      async (writeChunk) => streamFn((chunk) => writeChunk(chunk)),
      { keepActiveAfterWrite: true }
    );
    if (staged) {
      return {
        result: {
          opfsTempFileName: staged.fileName,
          byteSize: staged.byteSize,
          photoCount: staged.meta.photoCount,
          animalCount: staged.meta.animalCount,
          binderCount: staged.meta.binderCount,
          totalImageBinaryBytes: staged.meta.totalImageBinaryBytes,
        },
        transfer: [],
      };
    }
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const meta = await streamFn(async (chunk) => {
    chunks.push(chunk);
    total += chunk.byteLength;
  });
  const bytes = concatChunks(chunks, total);
  return {
    result: {
      opfsTempFileName: null,
      bytes,
      byteSize: bytes.byteLength,
      photoCount: meta.photoCount,
      animalCount: meta.animalCount,
      binderCount: meta.binderCount,
      totalImageBinaryBytes: meta.totalImageBinaryBytes,
    },
    transfer: [bytes.buffer],
  };
}

async function handleWorkerRequest(req: ArchiveWorkerRequest): Promise<void> {
  if (!req || !req.id) return;
  setCoreClockSkewMs(req.clockSkewMs ?? 0);

  try {
    if (req.kind === 'buildCompleteBackupZip') {
      const result = buildCompleteBackupZipArchive(
        req.snapshot,
        req.filterSpecies,
        req.extraMeta
      );
      workerScope.postMessage(
        { id: req.id, ok: true, result },
        [result.bytes.buffer]
      );
      return;
    }

    if (req.kind === 'buildCompleteBackupZipToOpfsTmp') {
      const { result, transfer } = await runStreamedZipInWorker('archive', (onChunk) =>
        streamCompleteBackupZipArchive(req.snapshot, onChunk, req.filterSpecies, req.extraMeta)
      );
      workerScope.postMessage({ id: req.id, ok: true, result }, transfer);
      return;
    }

    if (req.kind === 'buildPhotosOnlyZip') {
      const result = buildPhotosOnlyZipArchive(req.snapshot, req.filterSpecies);
      workerScope.postMessage(
        { id: req.id, ok: true, result },
        [result.bytes.buffer]
      );
      return;
    }

    if (req.kind === 'buildPhotosOnlyZipToOpfsTmp') {
      const { result, transfer } = await runStreamedZipInWorker('photos-archive', (onChunk) =>
        streamPhotosOnlyZipArchive(req.snapshot, onChunk, req.filterSpecies)
      );
      workerScope.postMessage({ id: req.id, ok: true, result }, transfer);
      return;
    }

    if (req.kind === 'parseBackupArchive') {
      const result = parseBackupArchiveInput(
        req.bytes,
        req.fileName,
        req.fallbackSettings
      );
      workerScope.postMessage({ id: req.id, ok: true, result });
      return;
    }

    if (req.kind === 'parseExternalImport') {
      const importer = getPlatformImporterById(req.platformId);
      const result = importer.parse(
        req.inputs,
        req.existingSnapshot,
        req.options
      );
      workerScope.postMessage({ id: req.id, ok: true, result });
      return;
    }

    if (req.kind === 'buildSupportBundleZip') {
      const result = buildSupportBundleZipArchive(req.params);
      workerScope.postMessage(
        { id: req.id, ok: true, result },
        [result.bytes.buffer]
      );
      return;
    }

    if (req.kind === 'inspectBackupArchive') {
      const parsed = parseBackupArchiveInput(
        req.bytes,
        req.fileName,
        req.currentSnapshot.settings
      );
      const inspection = inspectParsedArchiveBeforeRestorePure(
        parsed,
        req.currentSnapshot,
        {
          fileName: req.fileName,
          encrypted: Boolean(req.encrypted),
        }
      );
      workerScope.postMessage({
        id: req.id,
        ok: true,
        result: { parsed, inspection },
      });
      return;
    }

    workerScope.postMessage({
      id: (req as { id: string }).id,
      ok: false,
      error: 'Unsupported archive worker operation.',
    });
  } catch (err) {
    workerScope.postMessage({
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

workerScope.onmessage = (event: MessageEvent<ArchiveWorkerRequest>) => {
  void handleWorkerRequest(event.data);
};
