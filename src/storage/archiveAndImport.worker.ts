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
} from '../core/archiveInspector';
import {
  buildCompleteBackupZipArchive,
  buildPhotosOnlyZipArchive,
  parseBackupArchiveInput,
} from '../core/backupArchive';
import type { ImporterRunOptions, RawArchiveInput } from '../core/importers/importerTypes';
import { getPlatformImporterById } from '../core/importers/registry';
import {
  type BarnDatabaseSnapshot,
  type BarnSettings,
  setCoreClockSkewMs,
} from '../core/models';
import {
  buildSupportBundleZipArchive,
  type SupportBundleBuildParams,
} from '../core/supportBundle';
import type { SpeciesBackupReason } from '../core/syncAndExports';

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
      kind: 'buildPhotosOnlyZip';
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

workerScope.onmessage = (event: MessageEvent<ArchiveWorkerRequest>) => {
  const req = event.data;
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

    if (req.kind === 'buildPhotosOnlyZip') {
      const result = buildPhotosOnlyZipArchive(req.snapshot, req.filterSpecies);
      workerScope.postMessage(
        { id: req.id, ok: true, result },
        [result.bytes.buffer]
      );
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
};
