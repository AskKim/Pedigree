/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Consolidated Import/Export Hub Screen (`ImportExportHubScreen`).
 *
 * Unifies backup, import, multi-worker local sync, and non-native export workflows
 * into three distinct, mobile-responsive workspaces:
 * 1. System Backup — redundant local OPFS/IDB vault snapshots, off-app sync folder,
 *    pre-upgrade verification, and downloadable full/records-only archives (.ZIP/.JSON/.SQLITE).
 * 2. Imports — Native system restore/merge and zero-cloud peer delta sync first,
 *    followed by external format importers (HerdBoss, Evans .HTM, CSV, JSON).
 * 3. Exporters — Extensible registry of non-native format exporters (.CSV, Evans .HTM,
 *    Printable Barn Binder .HTM, Normalized Report DTO .JSON, .ICS Calendar) ready
 *    for future external platform schemas.
 */

import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Database,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  FileSpreadsheet,
  FileText,
  FolderSync,
  HardDrive,
  Images,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  Settings,
  Share2,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PreRestoreArchiveInspection } from '../domain/archiveInspector';
import type { BackupStatusEvaluation } from '../domain/backupStatus';
import {
  ArchivedHerdIndexEntry,
  VaultBackupMetadata,
} from '../domain/backupVault';
import {
  getHeavyZipExportGate,
  getTierStoragePolicy,
} from '../domain/deviceCapability';
import {
  wrapEncryptedZipContainer,
  tryExtractEncryptedEnvelopeFromZip,
  tryParseEncryptedEnvelopeJson,
  EncryptedPayloadEnvelope,
} from '../domain/encryptedExport';
import type {
  ExporterCategory,
  ExternalExporterDescriptor,
} from '../domain/exporters/exporterTypes';
import {
  normalizePedigreeGenerationDepth,
  PedigreeGenerationDepth,
} from '../domain/models';
import {
  BUILTIN_NON_NATIVE_EXPORTERS,
  PLANNED_EXTERNAL_SCHEMA_TARGETS,
  runExternalExporter,
} from '../domain/exporters/registry';
import { formatByteSizePure } from '../domain/imageOptimizationSpec';
import type { ConflictSelectionMap } from '../domain/importers/conflictResolver';
import type { PlatformImportPreview } from '../domain/importers/importerTypes';
import {
  formatReadableByteLimit,
  MAX_DELTA_BATCH_FILES,
  MAX_DELTA_BATCH_TOTAL_BYTES,
  MAX_DELTA_JSON_BYTES,
  MAX_JSON_BACKUP_BYTES,
  MAX_SQLITE_DB_BYTES,
  MAX_ZIP_ARCHIVE_BYTES,
  validateUploadFileSize,
} from '../domain/inputSanitization';
import {
  AnimalPhoto,
  BarnDatabaseSnapshot,
  BarnSettings,
  isAnimalArchived,
  isSameSpecies,
} from '../domain/models';
import {
  exportBarnBackupJson,
  formatTimestampedBackupSlug,
  generateBarnBackupJsonChunks,
} from '../domain/syncAndExports';
import type { SyncConflictEntry, SyncOperation } from '../domain/syncOutbox';
import {
  BackgroundPausedError,
  clearPausedBackgroundJob,
  registerPausedBackgroundJob,
} from '../storage/backgroundFreezeCoordinator';
import { emitAsyncErrorToast } from '../storage/crashLogger';
import {
  detectCurrentBrowserCompatibility,
  DeviceCapabilityController,
} from '../storage/deviceCapabilityDetector';
import {
  BackupSyncStatus,
  EncryptedSyncPassphraseError,
  parseDeltaFileTextAsync,
  reauthorizeBackupSyncFolder,
  resumePersistedDirectorySyncIfGranted,
  shareOrDownloadFile,
  supportsDirectoryPicker,
  syncWithPickedDirectory,
} from '../storage/localSyncChannels';
import {
  buildCompleteBackupZipOffThread,
  buildCompleteBackupZipToOpfsTmpOffThread,
  buildPhotosOnlyZipOffThread,
  buildPhotosOnlyZipToOpfsTmpOffThread,
  inspectBackupArchiveOffThread,
} from '../storage/offThreadWorkerClient';
import type { OpfsPruneSyncWarning } from '../storage/opfsStorage';
import {
  decryptBytesWithPassphrase,
  decryptTextWithPassphrase,
  encryptBytesWithPassphrase,
  encryptTextWithPassphrase,
  supportsPassphraseCrypto,
} from '../storage/passphraseCrypto';
import { stripPhotoDataUrlsFromSnapshot } from '../storage/photoHydration';
import type { CloudSyncProvider, CloudSyncSettings } from '../domain/cloudAppFolderSync';
import type {
  CloudSyncClientState,
  RunCloudAppFolderSyncResult,
} from '../storage/cloudAppFolderSync';
import {
  getAdjustedNowMs,
  RollingBackupMeta,
  StorageProtectionStatus,
} from '../storage/storageProtection';
import { readBlobAsArrayBuffer, readBlobAsText } from '../utils/es2018Shims';
import { useAsyncKeyedLock, useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import {
  downloadBinaryFile,
  downloadTempOpfsExport,
  downloadTextChunks,
  downloadTextFile,
} from '../utils/webFileActions';
import { ArchivedHerdsModal } from './ArchivedHerdsModal';
import { CloudAppFolderSyncPanel } from './CloudAppFolderSyncPanel';
import { ExternalImporterPanel } from './ExternalImporterPanel';
import { PedigreeOcrScannerPanel } from './PedigreeOcrScannerPanel';
import { UnifiedBackupVaultPanel } from './UnifiedBackupVaultPanel';

export type ImportExportHubSection = 'all' | 'sync' | 'backup' | 'imports' | 'exporters';

interface ImportExportHubScreenProps {
  snapshot: BarnDatabaseSnapshot;
  engineName: string;
  activeSpeciesName: string;
  deviceId: string;
  backupStatus: BackupStatusEvaluation | null;
  syncOperations: SyncOperation[];
  syncConflicts: SyncConflictEntry[];
  initialSection?: ImportExportHubSection;
  onConsumedInitialSection?: () => void;
  onOpenSettings: () => void;
  onOpenReports?: () => void;
  recordBackupExport: (
    format: 'zip' | 'sqlite' | 'json',
    fileName?: string
  ) => Promise<void> | void;
  onUpdateSettings: (patch: Partial<BarnSettings>, options?: { silent?: boolean }) => void;
  onApplyPlatformImport: (
    preview: PlatformImportPreview,
    optimizedPhotos?: AnimalPhoto[],
    conflictSelections?: ConflictSelectionMap
  ) => Promise<void>;
  onImportJson: (jsonText: string, mode: 'merge' | 'replace') => Promise<void>;
  onImportBackupArchive: (
    bytes: Uint8Array,
    fileName: string,
    mode: 'merge' | 'replace'
  ) => Promise<void>;
  onImportDeltaOperations: (ops: SyncOperation[]) => Promise<void>;
  onResolveSyncConflict: (conflictId: string, side: 'winning' | 'losing') => Promise<void>;
  onDismissSyncConflict: (conflictId: string) => Promise<void>;
  onBuildLocalDeltaJson: () => { filename: string; content: string };
  onRestoreRollingBackup: (key: string) => Promise<void>;
  onExportSqliteBytes: () => Promise<Uint8Array | null>;
  onInspectSqliteRestoreBytes?: (
    bytes: Uint8Array,
    fileName?: string
  ) => Promise<PreRestoreArchiveInspection>;
  onImportSqliteBytes: (bytes: Uint8Array) => Promise<void>;
  deviceCapability?: DeviceCapabilityController;
  onHydrateSnapshotForExport?: (
    targetSnapshot?: BarnDatabaseSnapshot,
    filterSpecies?: string
  ) => Promise<BarnDatabaseSnapshot>;
  opfsSupported?: boolean;
  opfsVaultBackups?: VaultBackupMetadata[];
  rollingBackups?: RollingBackupMeta[];
  archivedHerdBundles?: ArchivedHerdIndexEntry[];
  onSaveManualOpfsVaultBackup?: (note?: string) => Promise<unknown> | void;
  onCreateVerifiedPreUpgradeBackup?: () => Promise<{
    verified: boolean;
    fileName: string;
    checksumSha256: string;
  } | null>;
  onRestoreOpfsVaultBackup?: (key: string) => Promise<void>;
  onDownloadOpfsVaultBackup?: (key: string) => Promise<void>;
  onDeleteOpfsVaultBackup?: (key: string) => Promise<void>;
  onDeleteRollingBackup?: (key: string) => Promise<void>;
  onRestoreArchivedHerdBundle?: (
    archiveKey: string,
    options?: { restoreToActiveStatus?: boolean; deleteArchiveAfterRestore?: boolean }
  ) => Promise<void>;
  onDownloadArchivedHerdBundle?: (archiveKey: string) => Promise<void>;
  onDeleteArchivedHerdBundle?: (archiveKey: string) => Promise<void>;
  backupSyncStatus?: BackupSyncStatus | null;
  pruneSyncWarning?: OpfsPruneSyncWarning | null;
  onConnectBackupSync?: () => Promise<unknown>;
  onReauthorizeBackupSync?: () => Promise<unknown>;
  onDisconnectBackupSync?: () => Promise<unknown>;
  onSyncVaultToSyncNow?: () => Promise<unknown>;
  onDismissPruneWarning?: () => void;
  storageStatus?: StorageProtectionStatus | null;
  cloudSyncState?: CloudSyncClientState | null;
  cloudSyncBusy?: boolean;
  onUpdateCloudSyncSettings?: (patch: Partial<CloudSyncSettings>) => void;
  onConnectCloudSyncToken?: (provider: CloudSyncProvider, accessToken: string) => boolean;
  onDisconnectCloudSync?: (provider?: CloudSyncProvider) => void;
  onStartCloudSyncPkce?: (provider: CloudSyncProvider, clientId: string) => Promise<void>;
  onRunManualCloudSyncNow?: () => Promise<RunCloudAppFolderSyncResult>;
  onResetAndRetryCloudSync?: () => Promise<RunCloudAppFolderSyncResult>;
  onDismissCloudCircuitBreakerWarning?: () => void;
}

function getExporterCategoryIcon(category: ExporterCategory) {
  switch (category) {
    case 'spreadsheet':
      return FileSpreadsheet;
    case 'pedigree_document':
      return FileText;
    case 'calendar':
      return Calendar;
    case 'report_dto':
      return FileCode2;
    case 'external_schema':
      return Layers;
  }
}

export function ImportExportHubScreen({
  snapshot,
  engineName,
  activeSpeciesName,
  deviceId,
  backupStatus,
  syncOperations,
  syncConflicts,
  initialSection = 'all',
  onConsumedInitialSection,
  onOpenSettings,
  onOpenReports,
  recordBackupExport,
  onUpdateSettings,
  onApplyPlatformImport,
  onImportJson,
  onImportBackupArchive,
  onImportDeltaOperations,
  onResolveSyncConflict,
  onDismissSyncConflict,
  onBuildLocalDeltaJson,
  onRestoreRollingBackup,
  onExportSqliteBytes,
  onInspectSqliteRestoreBytes,
  onImportSqliteBytes,
  deviceCapability,
  onHydrateSnapshotForExport,
  opfsSupported = false,
  opfsVaultBackups = [],
  rollingBackups = [],
  archivedHerdBundles = [],
  onSaveManualOpfsVaultBackup,
  onCreateVerifiedPreUpgradeBackup,
  onRestoreOpfsVaultBackup,
  onDownloadOpfsVaultBackup,
  onDeleteOpfsVaultBackup,
  onDeleteRollingBackup,
  onRestoreArchivedHerdBundle,
  onDownloadArchivedHerdBundle,
  onDeleteArchivedHerdBundle,
  backupSyncStatus = null,
  pruneSyncWarning = null,
  onConnectBackupSync,
  onReauthorizeBackupSync,
  onDisconnectBackupSync,
  onSyncVaultToSyncNow,
  onDismissPruneWarning,
  storageStatus = null,
  cloudSyncState = null,
  cloudSyncBusy = false,
  onUpdateCloudSyncSettings,
  onConnectCloudSyncToken,
  onDisconnectCloudSync,
  onStartCloudSyncPkce,
  onRunManualCloudSyncNow,
  onResetAndRetryCloudSync,
  onDismissCloudCircuitBreakerWarning,
}: ImportExportHubScreenProps) {
  const baseId = useId();
  const [sectionView, setSectionView] = useState<ImportExportHubSection>(initialSection);

  useEffect(() => {
    if (initialSection && initialSection !== 'all') {
      setSectionView(initialSection);
      onConsumedInitialSection?.();
    }
  }, [initialSection, onConsumedInitialSection]);

  // System Backup state
  const [encryptBackupExport, setEncryptBackupExport] = useState(false);
  const [backupExportPassphrase, setBackupExportPassphrase] = useState('');
  const [showBackupExportPassphrase, setShowBackupExportPassphrase] = useState(false);
  const [zipExportBusy, setZipExportBusy] = useState<
    'complete' | 'photos' | 'json' | 'json-light' | null
  >(null);
  const [pendingHeavyZipExport, setPendingHeavyZipExport] = useState<'complete' | 'photos' | null>(
    null
  );
  const [preUpgradeFeedback, setPreUpgradeFeedback] = useState<string | null>(null);
  const [backupFeedback, setBackupFeedback] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [showArchivedHerdsModal, setShowArchivedHerdsModal] = useState(false);

  // Native Imports & Sync state
  const [importError, setImportError] = useState<string | null>(null);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [folderSyncBusy, setFolderSyncBusy] = useState(false);
  const [encryptOutgoingSync, setEncryptOutgoingSync] = useState(false);
  const [syncPassphrase, setSyncPassphrase] = useState('');
  const [showSyncPassphrase, setShowSyncPassphrase] = useState(false);
  const [pendingLargeRestore, setPendingLargeRestore] = useState<{
    file: File;
    kind: 'archive' | 'sqlite';
    mode?: 'merge' | 'replace';
  } | null>(null);
  const [restoreInspectBusy, setRestoreInspectBusy] = useState(false);
  const [pendingRestorePassphrasePrompt, setPendingRestorePassphrasePrompt] = useState<{
    fileName: string;
    sourceFormat: 'json' | 'zip';
    mode: 'merge' | 'replace';
    envelope: EncryptedPayloadEnvelope;
    passphrase: string;
    error: string | null;
  } | null>(null);
  const [pendingRestoreInspection, setPendingRestoreInspection] = useState<{
    inspection: PreRestoreArchiveInspection;
    mode: 'merge' | 'replace';
    jsonText?: string;
    archiveBytes?: Uint8Array;
    sqliteBytes?: Uint8Array;
  } | null>(null);
  const [stagedOcrPreview, setStagedOcrPreview] = useState<{
    key: string;
    preview: PlatformImportPreview;
  } | null>(null);

  // Exporters state (Section 3)
  const [exporterSpeciesScope, setExporterSpeciesScope] = useState<string>(
    activeSpeciesName || snapshot.speciesProfiles[0]?.name || ''
  );
  const [exporterAnimalId, setExporterAnimalId] = useState<string>('');
  const [exporterGenerations, setExporterGenerations] = useState<PedigreeGenerationDepth>(
    normalizePedigreeGenerationDepth(snapshot.settings.defaultGenerations, 3)
  );
  const [binderIncludeArchived, setBinderIncludeArchived] = useState(false);
  const [exporterFeedback, setExporterFeedback] = useState<{
    message: string;
    warnings: string[];
  } | null>(null);
  const [exporterError, setExporterError] = useState<string | null>(null);

  // Async submit locks
  const archiveExportLock = useAsyncSubmitLock({ postSettleCooldownMs: 300 });
  const sqliteExportLock = useAsyncSubmitLock({ postSettleCooldownMs: 300 });
  const preUpgradeBackupLock = useAsyncSubmitLock({ postSettleCooldownMs: 300 });
  const restoreCommitLock = useAsyncSubmitLock({ postSettleCooldownMs: 300 });
  const deltaShareLock = useAsyncSubmitLock({ postSettleCooldownMs: 300 });
  const deltaUploadLock = useAsyncSubmitLock({ postSettleCooldownMs: 300 });
  const folderSyncLock = useAsyncSubmitLock({ postSettleCooldownMs: 300 });
  const conflictRowLock = useAsyncKeyedLock();
  const exporterActionLock = useAsyncKeyedLock();

  const mergeFileRef = useRef<HTMLInputElement | null>(null);
  const replaceFileRef = useRef<HTMLInputElement | null>(null);
  const sqliteFileRef = useRef<HTMLInputElement | null>(null);
  const deltaImportRef = useRef<HTMLInputElement | null>(null);

  const settings = snapshot.settings;
  const allPhotos = snapshot.animalPhotos ?? [];
  const totalStoredPhotoBytes = useMemo(
    () => allPhotos.reduce((acc, p) => acc + p.storedBytes, 0),
    [allPhotos]
  );

  const activeDeviceTier = deviceCapability?.assessment.tier ?? 5;
  const activeTierPolicy = getTierStoragePolicy(activeDeviceTier);
  const activeBrowserCompat =
    deviceCapability?.browserCompatibility ??
    detectCurrentBrowserCompatibility(deviceCapability?.assessment);
  const heavyZipGate = deviceCapability
    ? getHeavyZipExportGate(deviceCapability.assessment, activeBrowserCompat)
    : {
        requiresConfirmation:
          activeDeviceTier === 1 || activeBrowserCompat.shouldConfirmHeavyZipExport,
        title: 'Memory Caution for Older or Lower-Memory Device',
        body:
          activeBrowserCompat.heavyZipCautionReason ||
          'Your device or browser may have limited memory for compressed .ZIP archives.',
        advice:
          'You can still try creating the .ZIP archive below. If it fails or reloads the page, please use Timestamped Backup (.JSON) instead — it safely backs up your herd using much less memory because of your older device or browser.',
      };

  const cryptoSupported = supportsPassphraseCrypto();
  const isSqliteUnavailable =
    !activeBrowserCompat.signals.wasmSupported || /json fallback/i.test(engineName);
  const dirPickerSupported = supportsDirectoryPicker();
  const webShareSupported = activeBrowserCompat.signals.webShareFilesSupported;
  const unresolvedConflicts = syncConflicts.filter((c) => !c.resolved);
  const totalVaultEntries = opfsVaultBackups.length + rollingBackups.length;

  // Keep animal selector synced with exporter species scope
  const scopedExporterAnimals = useMemo(() => {
    const filtered = exporterSpeciesScope
      ? snapshot.animals.filter((a) => isSameSpecies(a.species, exporterSpeciesScope))
      : snapshot.animals;
    return [...filtered].sort((a, b) => {
      const archDiff = (isAnimalArchived(a) ? 1 : 0) - (isAnimalArchived(b) ? 1 : 0);
      if (archDiff !== 0) return archDiff;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [snapshot.animals, exporterSpeciesScope]);

  useEffect(() => {
    if (scopedExporterAnimals.length === 0) {
      if (exporterAnimalId !== '') setExporterAnimalId('');
      return;
    }
    const stillExists = scopedExporterAnimals.some((a) => a.id === exporterAnimalId);
    if (!stillExists) {
      setExporterAnimalId(scopedExporterAnimals[0].id);
    }
  }, [scopedExporterAnimals, exporterAnimalId]);

  const resolvedBinderSpecies =
    exporterSpeciesScope ||
    activeSpeciesName ||
    settings.defaultSpecies ||
    snapshot.speciesProfiles[0]?.name ||
    'Rabbit';

  // =========================================================================
  // Section 1: System Backup Handlers
  // =========================================================================

  const handleDownloadTimestampedFullBackup = async () => {
    await archiveExportLock.runLocked(async () => {
      setBackupError(null);
      if (encryptBackupExport && backupExportPassphrase.length < 4) {
        setBackupError(
          'Enter an encryption passphrase of at least 4 characters before exporting an encrypted backup.'
        );
        return;
      }
      setZipExportBusy('json');
      try {
        const exportSnapshot = onHydrateSnapshotForExport
          ? await onHydrateSnapshotForExport()
          : snapshot;
        if (snapshot.animals.length > 0 && exportSnapshot.animals.length === 0) {
          setBackupError(
            `Blocked empty backup export: serialized snapshot contained 0 animals while ${snapshot.animals.length} animal(s) are loaded in memory. Please wait for pending saves or reload the page.`
          );
          return;
        }
        const stampSlug = formatTimestampedBackupSlug();
        const baseFilename = `pedigree-full-backup-${stampSlug}.json`;
        if (encryptBackupExport) {
          const rawJson = exportBarnBackupJson(exportSnapshot);
          const filename = `pedigree-full-backup-${stampSlug}-encrypted.json`;
          const outputJson = JSON.stringify(
            await encryptTextWithPassphrase(rawJson, backupExportPassphrase, {
              payloadKind: 'json_backup',
              originalFileName: baseFilename,
            }),
            null,
            2
          );
          await downloadTextFile(filename, outputJson, 'application/json');
          void recordBackupExport('json', filename);
          setBackupFeedback(
            `Downloaded encrypted ${filename} (${exportSnapshot.animals.length} animals, ${(exportSnapshot.animalPhotos ?? []).length} embedded photos).`
          );
        } else {
          await downloadTextChunks(
            baseFilename,
            generateBarnBackupJsonChunks(exportSnapshot),
            'application/json'
          );
          void recordBackupExport('json', baseFilename);
          setBackupFeedback(
            `Downloaded ${baseFilename} (${exportSnapshot.animals.length} animals, ${(exportSnapshot.animalPhotos ?? []).length} embedded photos).`
          );
        }
      } catch (err: unknown) {
        setBackupError(err instanceof Error ? err.message : 'Could not prepare full JSON backup.');
      } finally {
        setZipExportBusy(null);
      }
    });
  };

  const handleDownloadDatabaseOnlyBackup = async () => {
    await archiveExportLock.runLocked(async () => {
      setBackupError(null);
      if (encryptBackupExport && backupExportPassphrase.length < 4) {
        setBackupError(
          'Enter an encryption passphrase of at least 4 characters before exporting an encrypted backup.'
        );
        return;
      }
      setZipExportBusy('json-light');
      try {
        const flushedSnapshot = onHydrateSnapshotForExport
          ? await onHydrateSnapshotForExport()
          : snapshot;
        const lightSnapshot = stripPhotoDataUrlsFromSnapshot(flushedSnapshot);
        if (snapshot.animals.length > 0 && lightSnapshot.animals.length === 0) {
          setBackupError(
            `Blocked empty backup export: records-only snapshot contained 0 animals while ${snapshot.animals.length} animal(s) are loaded in memory.`
          );
          return;
        }
        const stampSlug = formatTimestampedBackupSlug();
        const baseFilename = `pedigree-records-only-${stampSlug}.json`;
        if (encryptBackupExport) {
          const rawJson = exportBarnBackupJson(lightSnapshot);
          const filename = `pedigree-records-only-${stampSlug}-encrypted.json`;
          const outputJson = JSON.stringify(
            await encryptTextWithPassphrase(rawJson, backupExportPassphrase, {
              payloadKind: 'json_backup',
              originalFileName: baseFilename,
            }),
            null,
            2
          );
          await downloadTextFile(filename, outputJson, 'application/json');
          void recordBackupExport('json', filename);
          setBackupFeedback(
            `Downloaded encrypted lightweight records-only JSON (${lightSnapshot.animals.length} animals; full-res photos skipped to preserve tab memory).`
          );
        } else {
          await downloadTextChunks(
            baseFilename,
            generateBarnBackupJsonChunks(lightSnapshot),
            'application/json'
          );
          void recordBackupExport('json', baseFilename);
          setBackupFeedback(
            `Downloaded lightweight records-only JSON (${lightSnapshot.animals.length} animals; full-res photos skipped to preserve tab memory).`
          );
        }
      } catch (err: unknown) {
        setBackupError(
          err instanceof Error ? err.message : 'Could not prepare records-only JSON backup.'
        );
      } finally {
        setZipExportBusy(null);
      }
    });
  };

  const handleDownloadCompleteZip = async (skipCaution = false) => {
    if (archiveExportLock.isLockedNow()) return;
    setBackupError(null);
    if (encryptBackupExport && backupExportPassphrase.length < 4) {
      setBackupError(
        'Enter an encryption passphrase of at least 4 characters before exporting an encrypted backup.'
      );
      return;
    }
    if (!skipCaution && heavyZipGate.requiresConfirmation) {
      setPendingHeavyZipExport('complete');
      return;
    }
    await archiveExportLock.runLocked(async () => {
      setPendingHeavyZipExport(null);
      setZipExportBusy('complete');
      try {
        const exportSnapshot = onHydrateSnapshotForExport
          ? await onHydrateSnapshotForExport()
          : snapshot;
        if (snapshot.animals.length > 0 && exportSnapshot.animals.length === 0) {
          setBackupError(
            `Blocked empty archive export: snapshot contained 0 animals while ${snapshot.animals.length} animal(s) are loaded in memory.`
          );
          return;
        }
        const stampSlug = formatTimestampedBackupSlug();
        const baseFilename = `pedigree-archive-${stampSlug}.zip`;
        if (encryptBackupExport) {
          const archive = await buildCompleteBackupZipOffThread(exportSnapshot);
          const env = await encryptBytesWithPassphrase(archive.bytes, backupExportPassphrase, {
            payloadKind: 'zip_archive',
            originalFileName: baseFilename,
          });
          const finalBytes = wrapEncryptedZipContainer(env, baseFilename);
          const filename = `pedigree-archive-${stampSlug}-encrypted.zip`;
          await downloadBinaryFile(filename, finalBytes, 'application/zip');
          void recordBackupExport('zip', filename);
          setBackupFeedback(
            `Saved encrypted ${filename} (${archive.animalCount} animals · ${archive.photoCount} photo files · ${archive.binderCount} Barn Binder .HTM file${archive.binderCount === 1 ? '' : 's'} · ${formatByteSizePure(finalBytes.byteLength)}).`
          );
        } else {
          const archive = await buildCompleteBackupZipToOpfsTmpOffThread(exportSnapshot);
          await downloadTempOpfsExport(baseFilename, archive, 'application/zip');
          void recordBackupExport('zip', baseFilename);
          setBackupFeedback(
            `Saved ${baseFilename} (${archive.animalCount} animals · ${archive.photoCount} photo files · ${archive.binderCount} Barn Binder .HTM file${archive.binderCount === 1 ? '' : 's'} · ${formatByteSizePure(archive.byteSize)}).`
          );
        }
      } catch (err: unknown) {
        const baseMsg =
          err instanceof Error ? err.message : 'Could not build Complete Archive (.ZIP).';
        setBackupError(
          heavyZipGate.requiresConfirmation
            ? `${baseMsg} Because this device or browser is older or low-memory, please use Timestamped Backup (.JSON) instead.`
            : baseMsg
        );
      } finally {
        setZipExportBusy(null);
      }
    });
  };

  const handleDownloadPhotosOnlyZip = async (skipCaution = false) => {
    if (archiveExportLock.isLockedNow()) return;
    setBackupError(null);
    if (allPhotos.length === 0) {
      setBackupError('No animal photos stored yet to archive.');
      return;
    }
    if (encryptBackupExport && backupExportPassphrase.length < 4) {
      setBackupError(
        'Enter an encryption passphrase of at least 4 characters before exporting an encrypted backup.'
      );
      return;
    }
    if (!skipCaution && heavyZipGate.requiresConfirmation) {
      setPendingHeavyZipExport('photos');
      return;
    }
    await archiveExportLock.runLocked(async () => {
      setPendingHeavyZipExport(null);
      setZipExportBusy('photos');
      try {
        const exportSnapshot = onHydrateSnapshotForExport
          ? await onHydrateSnapshotForExport()
          : snapshot;
        const stampSlug = formatTimestampedBackupSlug();
        const baseFilename = `pedigree-photos-${stampSlug}.zip`;
        if (encryptBackupExport) {
          const archive = await buildPhotosOnlyZipOffThread(exportSnapshot);
          const env = await encryptBytesWithPassphrase(archive.bytes, backupExportPassphrase, {
            payloadKind: 'zip_archive',
            originalFileName: baseFilename,
          });
          const finalBytes = wrapEncryptedZipContainer(env, baseFilename);
          const filename = `pedigree-photos-${stampSlug}-encrypted.zip`;
          await downloadBinaryFile(filename, finalBytes, 'application/zip');
          setBackupFeedback(
            `Saved encrypted ${filename} (${archive.photoCount} organized image files across ${archive.animalCount} animals · ${formatByteSizePure(finalBytes.byteLength)}).`
          );
        } else {
          const archive = await buildPhotosOnlyZipToOpfsTmpOffThread(exportSnapshot);
          await downloadTempOpfsExport(baseFilename, archive, 'application/zip');
          setBackupFeedback(
            `Saved ${baseFilename} (${archive.photoCount} organized image files across ${archive.animalCount} animals · ${formatByteSizePure(archive.byteSize)}).`
          );
        }
      } catch (err: unknown) {
        const baseMsg =
          err instanceof Error ? err.message : 'Could not build Photos-Only (.ZIP) archive.';
        setBackupError(
          heavyZipGate.requiresConfirmation
            ? `${baseMsg} Because this device or browser is older or low-memory, please use Timestamped Backup (.JSON) instead.`
            : baseMsg
        );
      } finally {
        setZipExportBusy(null);
      }
    });
  };

  const handleDownloadSqlite = async () => {
    await sqliteExportLock.runLocked(async () => {
      setBackupError(null);
      try {
        const bytes = await onExportSqliteBytes();
        if (!bytes) {
          setBackupError('Raw SQLite binary export is unavailable in fallback mode.');
          return;
        }
        const stampSlug = formatTimestampedBackupSlug();
        const filename = `pedigree-${stampSlug}.sqlite`;
        await downloadBinaryFile(filename, bytes, 'application/x-sqlite3');
        void recordBackupExport('sqlite', filename);
        setBackupFeedback(`Downloaded raw SQLite database (${filename}).`);
      } catch (err: unknown) {
        setBackupError(err instanceof Error ? err.message : 'Could not export SQLite database.');
      }
    });
  };

  // =========================================================================
  // Section 2: Native Imports & Sync Handlers
  // =========================================================================

  const handleBackupArchiveUpload = async (
    file: File | undefined,
    mode: 'merge' | 'replace',
    skipTierCheck = false
  ) => {
    if (!file) return;
    setImportError(null);
    setImportFeedback(null);
    setPendingRestorePassphrasePrompt(null);
    setPendingRestoreInspection(null);
    try {
      const lower = file.name.toLowerCase();
      const isJson = lower.endsWith('.json') && !lower.endsWith('.zip');
      const sizeCheck = validateUploadFileSize(
        file.name,
        file.size,
        isJson ? MAX_JSON_BACKUP_BYTES : MAX_ZIP_ARCHIVE_BYTES,
        isJson ? 'a JSON backup file' : 'a backup .ZIP archive'
      );
      if (!sizeCheck.ok) {
        setImportError(sizeCheck.error);
        return;
      }
      if (
        !skipTierCheck &&
        activeDeviceTier <= 2 &&
        file.size > activeTierPolicy.maxSafeImportBytesHint
      ) {
        setPendingLargeRestore({ file, kind: 'archive', mode });
        return;
      }
      setPendingLargeRestore(null);
      if (isJson) {
        const text = await readBlobAsText(file);
        const encryptedEnvelope = tryParseEncryptedEnvelopeJson(text);
        if (encryptedEnvelope) {
          setPendingRestorePassphrasePrompt({
            fileName: file.name,
            sourceFormat: 'json',
            mode,
            envelope: encryptedEnvelope,
            passphrase: '',
            error: null,
          });
          return;
        }
        setRestoreInspectBusy(true);
        const bytes = new TextEncoder().encode(text);
        const { inspection } = await inspectBackupArchiveOffThread(
          bytes,
          file.name,
          snapshot,
          false
        );
        setPendingRestoreInspection({
          inspection,
          mode,
          jsonText: text,
        });
      } else {
        const buf = await readBlobAsArrayBuffer(file);
        const rawBytes = new Uint8Array(buf);
        const encryptedEnvelope = tryExtractEncryptedEnvelopeFromZip(rawBytes, file.name);
        if (encryptedEnvelope) {
          setPendingRestorePassphrasePrompt({
            fileName: file.name,
            sourceFormat: 'zip',
            mode,
            envelope: encryptedEnvelope,
            passphrase: '',
            error: null,
          });
          return;
        }
        setRestoreInspectBusy(true);
        const { inspection } = await inspectBackupArchiveOffThread(
          rawBytes,
          file.name,
          snapshot,
          false
        );
        setPendingRestoreInspection({
          inspection,
          mode,
          archiveBytes: rawBytes,
        });
      }
    } catch (err: unknown) {
      setImportError(
        err instanceof Error ? err.message : 'Could not parse backup (.JSON or .ZIP) file.'
      );
    } finally {
      setRestoreInspectBusy(false);
    }
  };

  const handleDecryptAndInspectBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingRestorePassphrasePrompt) return;
    const prompt = pendingRestorePassphrasePrompt;
    setRestoreInspectBusy(true);
    try {
      if (prompt.sourceFormat === 'json') {
        const plainText = await decryptTextWithPassphrase(prompt.envelope, prompt.passphrase);
        const plainBytes = new TextEncoder().encode(plainText);
        const { inspection } = await inspectBackupArchiveOffThread(
          plainBytes,
          prompt.fileName,
          snapshot,
          true
        );
        setPendingRestorePassphrasePrompt(null);
        setPendingRestoreInspection({
          inspection,
          mode: prompt.mode,
          jsonText: plainText,
        });
      } else {
        const plainBytes = await decryptBytesWithPassphrase(prompt.envelope, prompt.passphrase);
        const { inspection } = await inspectBackupArchiveOffThread(
          plainBytes,
          prompt.fileName,
          snapshot,
          true
        );
        setPendingRestorePassphrasePrompt(null);
        setPendingRestoreInspection({
          inspection,
          mode: prompt.mode,
          archiveBytes: plainBytes,
        });
      }
    } catch (err: unknown) {
      setPendingRestorePassphrasePrompt((prev) =>
        prev
          ? {
              ...prev,
              error:
                err instanceof Error
                  ? err.message
                  : 'Incorrect passphrase or corrupted encrypted archive. Try again.',
            }
          : null
      );
    } finally {
      setRestoreInspectBusy(false);
    }
  };

  const handleConfirmPendingRestore = async () => {
    if (!pendingRestoreInspection) return;
    await restoreCommitLock.runLocked(async () => {
      const pending = pendingRestoreInspection;
      setImportError(null);
      try {
        if (pending.sqliteBytes) {
          await onImportSqliteBytes(pending.sqliteBytes);
          setImportFeedback(`Restored SQLite database "${pending.inspection.fileName}".`);
        } else if (pending.jsonText !== undefined) {
          await onImportJson(pending.jsonText, pending.mode);
          setImportFeedback(
            `${pending.mode === 'replace' ? 'Restored' : 'Merged'} JSON backup "${pending.inspection.fileName}".`
          );
        } else if (pending.archiveBytes) {
          await onImportBackupArchive(
            pending.archiveBytes,
            pending.inspection.fileName,
            pending.mode
          );
          setImportFeedback(
            `${pending.mode === 'replace' ? 'Restored' : 'Merged'} archive "${pending.inspection.fileName}".`
          );
        }
        setPendingRestoreInspection(null);
      } catch (err: unknown) {
        setImportError(err instanceof Error ? err.message : 'Restore failed.');
      }
    });
  };

  const handleSqliteUpload = async (file: File | undefined, skipTierCheck = false) => {
    if (!file) return;
    setImportError(null);
    setImportFeedback(null);
    setPendingRestorePassphrasePrompt(null);
    setPendingRestoreInspection(null);
    try {
      const sizeCheck = validateUploadFileSize(
        file.name,
        file.size,
        MAX_SQLITE_DB_BYTES,
        'a SQLite database'
      );
      if (!sizeCheck.ok) {
        setImportError(sizeCheck.error);
        return;
      }
      if (
        !skipTierCheck &&
        activeDeviceTier <= 2 &&
        file.size > activeTierPolicy.maxSafeImportBytesHint
      ) {
        setPendingLargeRestore({ file, kind: 'sqlite' });
        return;
      }
      setPendingLargeRestore(null);
      const buf = await readBlobAsArrayBuffer(file);
      const sqliteBytes = new Uint8Array(buf);
      if (onInspectSqliteRestoreBytes) {
        setRestoreInspectBusy(true);
        const inspection = await onInspectSqliteRestoreBytes(sqliteBytes, file.name);
        setPendingRestoreInspection({
          inspection,
          mode: 'replace',
          sqliteBytes,
        });
      } else {
        await onImportSqliteBytes(sqliteBytes);
      }
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Could not load database file.');
    } finally {
      setRestoreInspectBusy(false);
    }
  };

  const handleDeltaFilesUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    await deltaUploadLock.runLocked(async () => {
      setSyncError(null);
      setSyncFeedback(null);
      try {
        const list = Array.from(files);
        if (list.length > MAX_DELTA_BATCH_FILES) {
          setSyncError(
            `Selected ${list.length} delta files; upload at most ${MAX_DELTA_BATCH_FILES} per batch to protect mobile memory.`
          );
          return;
        }
        let totalBytes = 0;
        for (const file of list) {
          const check = validateUploadFileSize(
            file.name,
            file.size,
            MAX_DELTA_JSON_BYTES,
            'a delta sync JSON file'
          );
          if (!check.ok) {
            setSyncError(check.error);
            return;
          }
          totalBytes += file.size;
          if (totalBytes > MAX_DELTA_BATCH_TOTAL_BYTES) {
            setSyncError(
              `Combined delta batch exceeds ${formatReadableByteLimit(MAX_DELTA_BATCH_TOTAL_BYTES)}.`
            );
            return;
          }
        }
        const combinedOps: SyncOperation[] = [];
        let decryptedFileCount = 0;
        for (const file of list) {
          const text = await readBlobAsText(file);
          const parsed = await parseDeltaFileTextAsync(text, syncPassphrase || undefined);
          if (parsed.wasEncrypted) decryptedFileCount += 1;
          combinedOps.push(...parsed.operations);
        }
        await onImportDeltaOperations(combinedOps);
        setSyncFeedback(
          `Processed ${combinedOps.length} operation(s) across ${list.length} delta file(s)${
            decryptedFileCount > 0 ? ` (${decryptedFileCount} encrypted)` : ''
          }.`
        );
      } catch (err: unknown) {
        if (err instanceof EncryptedSyncPassphraseError) {
          setSyncError(err.message);
        } else {
          setSyncError(
            err instanceof Error ? err.message : 'Could not parse delta sync JSON file.'
          );
        }
      }
    });
  };

  const syncContextRef = useRef({
    snapshot,
    syncOperations,
    deviceId,
    activeDeviceTier,
    encryptOutgoingSync,
    syncPassphrase,
    onHydrateSnapshotForExport,
    onImportDeltaOperations,
  });
  syncContextRef.current = {
    snapshot,
    syncOperations,
    deviceId,
    activeDeviceTier,
    encryptOutgoingSync,
    syncPassphrase,
    onHydrateSnapshotForExport,
    onImportDeltaOperations,
  };

  const executeResumeDirectorySync = async (triggerReauthorize: boolean) => {
    setSyncError(null);
    setFolderSyncBusy(true);
    try {
      if (triggerReauthorize) {
        await reauthorizeBackupSyncFolder();
      }
      const ctx = syncContextRef.current;
      const exportSnapshot =
        ctx.activeDeviceTier === 1
          ? stripPhotoDataUrlsFromSnapshot(ctx.snapshot)
          : ctx.onHydrateSnapshotForExport
          ? await ctx.onHydrateSnapshotForExport(ctx.snapshot)
          : ctx.snapshot;
      const activePass =
        ctx.encryptOutgoingSync && ctx.syncPassphrase.length >= 4
          ? ctx.syncPassphrase
          : undefined;
      const resumed = await resumePersistedDirectorySyncIfGranted({
        deviceId: ctx.deviceId,
        localOperations: ctx.syncOperations,
        masterBackupJson: exportBarnBackupJson(exportSnapshot),
        passphrase: activePass,
      });
      if (!resumed.resumed) {
        if (resumed.reason === 'permission_required') {
          const reasonMsg = `Folder write permission for "${resumed.folderName || 'Sync Folder'}" must be re-confirmed before finishing sync.`;
          registerPausedBackgroundJob({
            taskId: 'directory_sync',
            label: 'Folder Sync',
            pausedAtMs: getAdjustedNowMs(),
            severity: 'severity',
            severityReason: reasonMsg,
            resumeHandler: () => executeResumeDirectorySync(true),
          });
          emitAsyncErrorToast({
            title: 'Folder Sync Paused — Permission Needed',
            detail: reasonMsg,
            severity: 'error',
            sticky: true,
            category: 'storage',
            canOpenDiagnostics: false,
          });
        }
        return;
      }
      if (resumed.incomingOps.length > 0) {
        await ctx.onImportDeltaOperations(resumed.incomingOps);
      }
      clearPausedBackgroundJob('directory_sync');
      const encNote = resumed.wroteEncrypted ? ' (AES-GCM encrypted)' : '';
      const skipNote =
        resumed.encryptedPeersSkipped > 0
          ? ` Note: ${resumed.encryptedPeersSkipped} encrypted peer delta(s) skipped — enable Sync Encryption with matching passphrase.`
          : '';
      setSyncFeedback(
        `Resumed & synced folder "${resumed.folderName}"${encNote}: read ${resumed.peerFilesRead} peer delta file(s) and wrote delta_${ctx.deviceId}.json.${skipNote}`
      );
    } catch (err: unknown) {
      if (err instanceof BackgroundPausedError) {
        registerPausedBackgroundJob({
          taskId: 'directory_sync',
          label: 'Folder Sync',
          pausedAtMs: getAdjustedNowMs(),
          severity: err.severityIssue ? 'severity' : 'minor',
          severityReason: err.severityIssue ?? undefined,
          resumeHandler: () => executeResumeDirectorySync(Boolean(err.severityIssue)),
        });
        emitAsyncErrorToast({
          title: 'Folder Sync Paused',
          detail: err.checkpointSummary || err.message,
          severity: err.severityIssue ? 'error' : 'warning',
          sticky: Boolean(err.severityIssue),
          category: 'lifecycle',
          canOpenDiagnostics: Boolean(err.severityIssue),
        });
      } else {
        const msg = err instanceof Error ? err.message : 'Folder sync failed to resume.';
        registerPausedBackgroundJob({
          taskId: 'directory_sync',
          label: 'Folder Sync',
          pausedAtMs: getAdjustedNowMs(),
          severity: 'severity',
          severityReason: msg,
          resumeHandler: () => executeResumeDirectorySync(false),
        });
        emitAsyncErrorToast({
          title: 'Folder Sync Resume Failed',
          detail: msg,
          severity: 'error',
          sticky: true,
          category: 'storage',
        });
        setSyncError(msg);
      }
    } finally {
      setFolderSyncBusy(false);
    }
  };

  const handleDirectorySync = async () => {
    if (encryptOutgoingSync && syncPassphrase.length < 4) {
      setSyncError(
        'Enter a sync passphrase of at least 4 characters or turn off encrypted folder sync.'
      );
      return;
    }
    await folderSyncLock.runLocked(async () => {
      setSyncError(null);
      setSyncFeedback(null);
      setFolderSyncBusy(true);
      try {
        const exportSnapshot =
          activeDeviceTier === 1
            ? stripPhotoDataUrlsFromSnapshot(snapshot)
            : onHydrateSnapshotForExport
            ? await onHydrateSnapshotForExport(snapshot)
            : snapshot;
        const res = await syncWithPickedDirectory({
          deviceId,
          localOperations: syncOperations,
          masterBackupJson: exportBarnBackupJson(exportSnapshot),
          passphrase: encryptOutgoingSync ? syncPassphrase : undefined,
        });
        if (res.incomingOps.length > 0) {
          await onImportDeltaOperations(res.incomingOps);
        }
        clearPausedBackgroundJob('directory_sync');
        const encNote = res.wroteEncrypted ? ' (AES-GCM encrypted)' : '';
        const skipNote =
          res.encryptedPeersSkipped > 0
            ? ` Note: ${res.encryptedPeersSkipped} encrypted peer delta(s) skipped — enable Sync Encryption with matching passphrase.`
            : '';
        setSyncFeedback(
          `Synced folder "${res.folderName}"${encNote}: read ${res.peerFilesRead} peer delta file(s) and wrote delta_${deviceId}.json.${skipNote}`
        );
      } catch (err: unknown) {
        if (err instanceof BackgroundPausedError) {
          const hasSeverity = Boolean(err.severityIssue);
          registerPausedBackgroundJob({
            taskId: 'directory_sync',
            label: 'Folder Sync',
            pausedAtMs: getAdjustedNowMs(),
            severity: hasSeverity ? 'severity' : 'minor',
            severityReason: err.severityIssue ?? undefined,
            resumeHandler: () => executeResumeDirectorySync(hasSeverity),
          });
          setSyncFeedback(
            hasSeverity
              ? err.message
              : 'Folder sync paused cleanly when app moved to background and will auto-resume when you return.'
          );
          emitAsyncErrorToast({
            title: 'Folder Sync Paused',
            detail: err.checkpointSummary || err.message,
            severity: hasSeverity ? 'error' : 'warning',
            sticky: hasSeverity,
            category: 'lifecycle',
            canOpenDiagnostics: hasSeverity,
          });
        } else if ((err as { name?: string })?.name !== 'AbortError') {
          setSyncError(
            err instanceof Error ? err.message : 'Local folder sync could not complete.'
          );
        }
      } finally {
        setFolderSyncBusy(false);
      }
    });
  };

  // =========================================================================
  // Section 3: Extensible Non-Native Exporters Runner
  // =========================================================================

  const handleRunExporter = async (descriptor: ExternalExporterDescriptor) => {
    await exporterActionLock.runKeyLocked(descriptor.id, async () => {
      setExporterError(null);
      setExporterFeedback(null);
      try {
        let workingSnapshot = snapshot;
        if (
          descriptor.category === 'pedigree_document' &&
          (descriptor.id === 'breeder-showcase-html' || settings.includePhotoOnPedigree !== false) &&
          activeDeviceTier >= 2 &&
          onHydrateSnapshotForExport
        ) {
          const hydrateTarget =
            descriptor.scopeMode === 'species_required'
              ? resolvedBinderSpecies
              : exporterSpeciesScope || undefined;
          workingSnapshot = await onHydrateSnapshotForExport(snapshot, hydrateTarget);
        }

        const appBaseUrl =
          typeof window !== 'undefined'
            ? `${window.location.origin}${window.location.pathname}`
            : undefined;

        const targetSpecies =
          descriptor.scopeMode === 'species_required'
            ? resolvedBinderSpecies
            : exporterSpeciesScope || undefined;

        const artifact = runExternalExporter(descriptor.id, {
          snapshot: workingSnapshot,
          speciesName: targetSpecies,
          animalId: exporterAnimalId || undefined,
          generations: exporterGenerations,
          includeArchived: binderIncludeArchived,
          appBaseUrl,
        });

        if (artifact.binaryContent) {
          await downloadBinaryFile(artifact.filename, artifact.binaryContent, artifact.mimeType);
        } else {
          await downloadTextFile(artifact.filename, artifact.content, artifact.mimeType);
        }
        setExporterFeedback({
          message: artifact.summary,
          warnings: artifact.warnings,
        });
      } catch (err: unknown) {
        setExporterError(
          err instanceof Error ? err.message : `Could not export ${descriptor.name}.`
        );
      }
    });
  };

  const showSyncSection = sectionView === 'all' || sectionView === 'sync';
  const showBackupSection = sectionView === 'all' || sectionView === 'backup';
  const showImportsSection = sectionView === 'all' || sectionView === 'imports';
  const showExportersSection = sectionView === 'all' || sectionView === 'exporters';

  return (
    <div className="space-y-6">
      {/* Page Header & Quick Route Controls */}
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0 max-w-2xl">
            <p className="text-xs text-[var(--barn-muted)] font-mono">
              Offline-First Local Ownership · Engine: {engineName}
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
              Import / Export Hub
            </h1>
            <p className="text-xs sm:text-sm text-[var(--barn-muted)] leading-relaxed">
              Collaborate across multiple devices with zero-cloud sync, safeguard your barn with
              redundant system backups, restore or import pedigree files, and export open formats.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 max-w-full">
            {onOpenReports && (
              <button
                type="button"
                onClick={onOpenReports}
                className="min-h-[44px] sm:min-h-[38px] max-w-full px-3.5 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                <span>Printable Reports</span>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenSettings}
              className="min-h-[44px] sm:min-h-[38px] max-w-full px-3.5 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <Settings className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>Barn Settings</span>
            </button>
          </div>
        </div>

        {/* Live Telemetry Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
            <div className="text-[11px] text-[var(--barn-muted)]">Barn Records</div>
            <div className="font-mono font-semibold tabular-nums mt-0.5 truncate">
              {snapshot.animals.length} animals · {snapshot.breedings.length} breedings
            </div>
            <div className="text-[10px] font-mono tabular-nums text-[var(--barn-muted)] mt-0.5 truncate">
              {snapshot.speciesProfiles.length} species · {snapshot.tasks.length} chores
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
            <div className="text-[11px] text-[var(--barn-muted)]">Stored Photos</div>
            <div className="font-mono font-semibold tabular-nums mt-0.5 truncate">
              {allPhotos.length} photo{allPhotos.length === 1 ? '' : 's'} ·{' '}
              {formatByteSizePure(totalStoredPhotoBytes)}
            </div>
            <div className="text-[10px] font-mono text-[var(--barn-muted)] mt-0.5 truncate">
              Preserved in .ZIP &amp; full .JSON
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
            <div className="text-[11px] text-[var(--barn-muted)]">Local Backup Vault</div>
            <div className="font-mono font-semibold tabular-nums mt-0.5 truncate">
              {totalVaultEntries} snapshot{totalVaultEntries === 1 ? '' : 's'}
            </div>
            <div className="text-[10px] font-mono text-[var(--barn-muted)] mt-0.5 truncate">
              {opfsSupported
                ? `${opfsVaultBackups.length} OPFS · ${rollingBackups.length} IDB`
                : 'IndexedDB rolling mode'}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
            <div className="text-[11px] text-[var(--barn-muted)]">Backup Status</div>
            <div
              className={`font-semibold mt-0.5 truncate ${
                backupStatus?.level === 'up_to_date'
                  ? 'text-[var(--barn-sage)]'
                  : 'text-[var(--barn-terracotta)]'
              }`}
            >
              {backupStatus
                ? backupStatus.level === 'up_to_date'
                  ? 'Protected & Current'
                  : 'Backup Recommended'
                : 'Ready'}
            </div>
            <div className="text-[10px] font-mono text-[var(--barn-muted)] mt-0.5 truncate">
              {backupStatus ? `Last: ${backupStatus.lastExportLabel}` : 'No external export yet'}
            </div>
          </div>
        </div>

        {/* Workspace Section Filter / Jump Bar */}
        <div
          role="tablist"
          aria-label="Import and Export Hub Sections"
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-1"
        >
          {(
            [
              { id: 'all', label: 'All Sections', hint: 'Full unified view' },
              { id: 'sync', label: 'Sync / Multi-Device', hint: 'Workers & family' },
              { id: 'backup', label: '01 · System Backup', hint: 'Files & local vault' },
              { id: 'imports', label: '02 · Imports', hint: 'Native first, then external' },
              { id: 'exporters', label: '03 · Exporters', hint: 'Open non-native formats' },
            ] as Array<{ id: ImportExportHubSection; label: string; hint: string }>
          ).map((tab) => {
            const active = sectionView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSectionView(tab.id)}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-left transition-colors ${
                  active
                    ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                    : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)]'
                }`}
              >
                <div className="text-xs font-semibold truncate">{tab.label}</div>
                <div
                  className={`text-[11px] truncate ${
                    active ? 'opacity-90' : 'text-[var(--barn-muted)]'
                  }`}
                >
                  {tab.hint}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* =================================================================== */}
      {/* DEDICATED TOP SUB-UNIT — SYNC / MULTI-DEVICE                        */}
      {/* =================================================================== */}
      {showSyncSection && (
        <section
          id="hub-section-sync"
          aria-labelledby={`${baseId}-sync-heading`}
          className="rounded-2xl border border-[var(--barn-sage)]/55 ring-1 ring-[var(--barn-sage)]/20 bg-gradient-to-br from-[var(--barn-sage-tint)]/55 via-[var(--barn-surface)] to-[var(--barn-slate-tint)]/35 p-5 sm:p-6 space-y-5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--barn-sage)]/25 pb-4">
            <div className="space-y-2 min-w-0 max-w-3xl">
              <p className="text-xs font-medium text-[var(--barn-sage)]">
                Multi-Device Collaboration · Zero-Cloud Peer Sync
              </p>
              <h2
                id={`${baseId}-sync-heading`}
                className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-[var(--barn-ink)] text-balance"
              >
                Sync / Multi-Device
              </h2>
              <p className="text-sm leading-relaxed text-[var(--barn-ink)]/90">
                Keep your barn records up to date across multiple phones, tablets, and computers—built
                for both additional farm workers and family members helping with daily care. Field
                edits merge cleanly without overwriting another person&apos;s changes on a different
                field of the same animal.
              </p>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-0.5 text-xs font-mono tabular-nums text-[var(--barn-muted)]">
                <span>Device ID: {deviceId}</span>
                <span aria-hidden="true">·</span>
                <span>Pending sync changes: {syncOperations.length}</span>
                {unresolvedConflicts.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-[var(--barn-terracotta)]">
                      {unresolvedConflicts.length} field review needed
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-[var(--barn-surface)]/90 border border-[var(--barn-sage)]/30 shrink-0">
              <FolderSync className="w-5 h-5 text-[var(--barn-sage)]" aria-hidden="true" />
            </div>
          </div>

          {syncError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs sm:text-sm text-[var(--barn-ink)] font-medium leading-relaxed"
            >
              {syncError}
            </div>
          )}

          {syncFeedback && !syncError && (
            <div
              role="status"
              aria-live="polite"
              className="p-3.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs sm:text-sm text-[var(--barn-ink)] leading-relaxed"
            >
              {syncFeedback}
            </div>
          )}

          {cryptoSupported && (
            <div className="p-3.5 sm:p-4 rounded-xl bg-[var(--barn-surface)]/90 border border-[var(--barn-border)] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor={`${baseId}-sync-encrypt-toggle`}
                  className="flex items-center gap-2.5 text-xs sm:text-sm font-medium text-[var(--barn-ink)] cursor-pointer min-h-[28px]"
                >
                  <input
                    id={`${baseId}-sync-encrypt-toggle`}
                    type="checkbox"
                    checked={encryptOutgoingSync}
                    onChange={(e) => setEncryptOutgoingSync(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--barn-border)] accent-[var(--barn-sage)] shrink-0"
                  />
                  <KeyRound className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  <span>Protect shared sync files with a passphrase</span>
                </label>
                <span className="text-[11px] font-mono text-[var(--barn-muted)]">
                  AES-256-GCM · Memory-only key
                </span>
              </div>
              {(encryptOutgoingSync || syncPassphrase.length > 0) && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <label htmlFor={`${baseId}-sync-passphrase`} className="sr-only">
                      Shared Sync Passphrase
                    </label>
                    <input
                      id={`${baseId}-sync-passphrase`}
                      type={showSyncPassphrase ? 'text' : 'password'}
                      value={syncPassphrase}
                      onChange={(e) => setSyncPassphrase(e.target.value)}
                      placeholder="Shared barn passphrase (min 4 chars — never saved)"
                      autoComplete="off"
                      className="flex-1 min-w-0 min-h-[44px] sm:min-h-[40px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSyncPassphrase((v) => !v)}
                      aria-label={
                        showSyncPassphrase ? 'Hide sync passphrase' : 'Show sync passphrase'
                      }
                      className="min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px] px-2.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center shrink-0"
                    >
                      {showSyncPassphrase ? (
                        <EyeOff className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs leading-relaxed text-[var(--barn-muted)]">
                    Enter the same passphrase on each farm worker&apos;s or family member&apos;s
                    device. Keys remain in memory only and are never saved.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              ref={deltaImportRef}
              type="file"
              accept=".json,application/json"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleDeltaFilesUpload(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              disabled={deltaUploadLock.isSubmitting}
              aria-busy={deltaUploadLock.isSubmitting}
              onClick={() => deltaImportRef.current?.click()}
              className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-65 transition-opacity"
            >
              {deltaUploadLock.isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
              ) : (
                <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
              )}
              <span>
                {deltaUploadLock.isSubmitting
                  ? 'Merging Deltas...'
                  : 'Merge Peer Delta Files (.JSON)'}
              </span>
            </button>

            <button
              type="button"
              disabled={deltaShareLock.isSubmitting}
              aria-busy={deltaShareLock.isSubmitting}
              onClick={() =>
                void deltaShareLock.runLocked(async () => {
                  setSyncError(null);
                  if (encryptOutgoingSync && syncPassphrase.length < 4) {
                    setSyncError(
                      'Enter a sync passphrase of at least 4 characters before exporting an encrypted delta.'
                    );
                    return;
                  }
                  const delta = onBuildLocalDeltaJson();
                  const finalFilename = encryptOutgoingSync
                    ? delta.filename.replace(/\.json$/i, '-encrypted.json')
                    : delta.filename;
                  const content = encryptOutgoingSync
                    ? JSON.stringify(
                        await encryptTextWithPassphrase(delta.content, syncPassphrase, {
                          payloadKind: 'delta_log',
                          originalFileName: delta.filename,
                        }),
                        null,
                        2
                      )
                    : delta.content;
                  const mode = await shareOrDownloadFile({
                    filename: finalFilename,
                    content,
                    mimeType: 'application/json',
                    title: 'Pedigree Multi-Device Delta Log',
                  });
                  setSyncFeedback(
                    mode === 'cancelled'
                      ? 'Share sheet cancelled — no delta file was saved.'
                      : mode === 'shared'
                        ? `Shared ${encryptOutgoingSync ? 'encrypted ' : ''}${finalFilename} via native share sheet.`
                        : `Downloaded ${encryptOutgoingSync ? 'encrypted ' : ''}${finalFilename} for SyncThing or family sharing.`
                  );
                })
              }
              className="min-h-[46px] px-4 py-2.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs sm:text-sm font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-2 disabled:opacity-65 transition-colors"
            >
              {deltaShareLock.isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
              ) : (
                <Share2 className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              )}
              <span>
                {deltaShareLock.isSubmitting
                  ? 'Preparing Delta...'
                  : 'Share / Export Device Delta'}
              </span>
            </button>

            <button
              type="button"
              disabled={folderSyncBusy || folderSyncLock.isSubmitting || !dirPickerSupported}
              aria-busy={folderSyncBusy || folderSyncLock.isSubmitting}
              aria-describedby={!dirPickerSupported ? `${baseId}-dirpicker-reason` : undefined}
              onClick={() => void handleDirectorySync()}
              className={`min-h-[46px] px-4 py-2.5 rounded-xl border border-[var(--barn-border)] text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                dirPickerSupported
                  ? 'bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] disabled:opacity-50'
                  : 'bg-[var(--barn-surface)]/65 text-[var(--barn-muted)] opacity-65 cursor-not-allowed'
              }`}
            >
              {folderSyncBusy || folderSyncLock.isSubmitting ? (
                <Loader2
                  className="w-4 h-4 text-[var(--barn-sage)] animate-spin shrink-0"
                  aria-hidden="true"
                />
              ) : (
                <FolderSync className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              )}
              <span>
                {folderSyncBusy || folderSyncLock.isSubmitting
                  ? 'Syncing Local Folder...'
                  : 'Sync Local Shared Folder'}
              </span>
            </button>
          </div>

          {(!dirPickerSupported || !webShareSupported) && (
            <div className="space-y-1 text-xs leading-relaxed text-[var(--barn-muted)]">
              {!dirPickerSupported && (
                <p id={`${baseId}-dirpicker-reason`}>
                  Direct local folder picking isn&apos;t supported in this browser (e.g., Safari,
                  Firefox, or mobile browsers). Use{' '}
                  <strong className="text-[var(--barn-ink)]">
                    Merge Peer Delta Files (.JSON)
                  </strong>{' '}
                  and{' '}
                  <strong className="text-[var(--barn-ink)]">Share / Export Device Delta</strong>{' '}
                  instead.
                </p>
              )}
              {!webShareSupported && (
                <p>
                  Native Share Sheet is unavailable in this browser—
                  <strong className="text-[var(--barn-ink)]">Share / Export Device Delta</strong>{' '}
                  downloads a ready-to-share <span className="font-mono">.JSON</span> file you can
                  send via SyncThing, messaging, or email.
                </p>
              )}
            </div>
          )}

          {syncConflicts.length > 0 && (
            <div className="border-t border-[var(--barn-sage)]/25 pt-4 space-y-3">
              <div className="text-xs sm:text-sm font-semibold text-[var(--barn-ink)]">
                Field Collision Review Log ({unresolvedConflicts.length} unresolved)
              </div>
              <div className="space-y-2.5 max-h-64 overflow-y-auto">
                {syncConflicts.slice(0, 10).map((c) => (
                  <div
                    key={c.conflict_id}
                    className="p-3.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-2.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--barn-ink)]">
                        {c.entity_label} · <code className="font-mono">{c.field_name}</code>
                      </span>
                      <span className="text-[11px] font-mono text-[var(--barn-muted)]">
                        {c.resolved ? 'Resolved' : 'Needs Review'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                      <div className="p-2.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-sage)]/50 truncate">
                        Applied ({c.winning_device_id}): {String(c.winning_value)}
                      </div>
                      <div className="p-2.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] truncate">
                        Alternate ({c.losing_device_id}): {String(c.losing_value)}
                      </div>
                    </div>
                    {!c.resolved && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={conflictRowLock.isKeyLocked(c.conflict_id)}
                          onClick={() =>
                            void conflictRowLock.runKeyLocked(c.conflict_id, () =>
                              onResolveSyncConflict(c.conflict_id, 'winning')
                            )
                          }
                          className="min-h-[40px] sm:min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60"
                        >
                          Keep Applied
                        </button>
                        <button
                          type="button"
                          disabled={conflictRowLock.isKeyLocked(c.conflict_id)}
                          onClick={() =>
                            void conflictRowLock.runKeyLocked(c.conflict_id, () =>
                              onResolveSyncConflict(c.conflict_id, 'losing')
                            )
                          }
                          className="min-h-[40px] sm:min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-medium hover:bg-[var(--barn-subtle)] disabled:opacity-60"
                        >
                          Use Alternate
                        </button>
                        <button
                          type="button"
                          disabled={conflictRowLock.isKeyLocked(c.conflict_id)}
                          onClick={() =>
                            void conflictRowLock.runKeyLocked(c.conflict_id, () =>
                              onDismissSyncConflict(c.conflict_id)
                            )
                          }
                          className="min-h-[40px] sm:min-h-[36px] px-2.5 py-1.5 text-xs text-[var(--barn-muted)] underline disabled:opacity-60"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {cloudSyncState &&
            onUpdateCloudSyncSettings &&
            onConnectCloudSyncToken &&
            onDisconnectCloudSync &&
            onRunManualCloudSyncNow &&
            onResetAndRetryCloudSync && (
              <CloudAppFolderSyncPanel
                cloudSyncState={cloudSyncState}
                cloudSyncBusy={cloudSyncBusy}
                storageStatus={storageStatus}
                deviceTier={deviceCapability?.assessment.tier}
                onUpdateSettings={onUpdateCloudSyncSettings}
                onConnectToken={onConnectCloudSyncToken}
                onDisconnect={onDisconnectCloudSync}
                onStartPkce={onStartCloudSyncPkce}
                onSyncNow={onRunManualCloudSyncNow}
                onResetAndRetry={onResetAndRetryCloudSync}
                onDismissWarning={onDismissCloudCircuitBreakerWarning}
              />
            )}
        </section>
      )}

      {/* =================================================================== */}
      {/* SECTION 01 — SYSTEM BACKUP                                          */}
      {/* =================================================================== */}
      {showBackupSection && (
        <section
          id="hub-section-backup"
          aria-labelledby={`${baseId}-backup-heading`}
          className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--barn-border)] pb-4">
            <div className="space-y-1">
              <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--barn-sage)]">
                Section 01 · Redundant Disaster Protection
              </div>
              <h2 id={`${baseId}-backup-heading`} className="font-display text-xl sm:text-2xl font-semibold">
                System Backup
              </h2>
              <p className="text-xs text-[var(--barn-muted)]">
                Download self-contained system archives (.ZIP, .JSON, or raw .SQLITE) and manage
                redundant local snapshots across OPFS, IndexedDB, and connected backup folders.
              </p>
            </div>
            <ShieldCheck className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
          </div>

          {backupStatus && (
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                backupStatus.level === 'up_to_date'
                  ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)]'
                  : 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-[var(--barn-ink)]">
                <span>{backupStatus.headline}</span>
                {backupStatus.lastExportRelative && (
                  <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                    {backupStatus.lastExportRelative}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--barn-muted)]">{backupStatus.detail}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-[var(--barn-muted)] pt-0.5">
                <span>Last export: {backupStatus.lastExportLabel}</span>
                <span>Latest change: {backupStatus.latestChangeLabel}</span>
              </div>
            </div>
          )}

          {backupError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)] font-medium"
            >
              {backupError}
            </div>
          )}

          {backupFeedback && !backupError && (
            <div
              role="status"
              aria-live="polite"
              className="p-3 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs"
            >
              {backupFeedback}
            </div>
          )}

          {/* Optional Backup Encryption Toggle & Passphrase */}
          {cryptoSupported && (
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor={`${baseId}-backup-encrypt-toggle`}
                  className="flex items-center gap-2 font-medium text-[var(--barn-ink)] cursor-pointer"
                >
                  <input
                    id={`${baseId}-backup-encrypt-toggle`}
                    type="checkbox"
                    checked={encryptBackupExport}
                    onChange={(e) => setEncryptBackupExport(e.target.checked)}
                    className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                  />
                  <Lock className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                  <span>Passphrase-encrypt exported .ZIP &amp; .JSON system backups</span>
                </label>
                <span className="text-[10px] font-mono text-[var(--barn-muted)]">
                  PBKDF2 · AES-256-GCM
                </span>
              </div>
              {encryptBackupExport && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <label htmlFor={`${baseId}-backup-passphrase`} className="sr-only">
                      Backup Encryption Passphrase
                    </label>
                    <input
                      id={`${baseId}-backup-passphrase`}
                      type={showBackupExportPassphrase ? 'text' : 'password'}
                      value={backupExportPassphrase}
                      onChange={(e) => setBackupExportPassphrase(e.target.value)}
                      placeholder="Enter export passphrase (min 4 chars — kept in memory only)"
                      autoComplete="new-password"
                      className="flex-1 min-w-0 min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowBackupExportPassphrase((v) => !v)}
                      aria-label={
                        showBackupExportPassphrase
                          ? 'Hide backup passphrase'
                          : 'Show backup passphrase'
                      }
                      className="min-h-[40px] min-w-[40px] px-2.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center"
                    >
                      {showBackupExportPassphrase ? (
                        <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--barn-muted)]">
                    Write down this passphrase — it is never stored in browser memory or backups.
                    Leave unchecked for standard 1-click unencrypted exports.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Downloadable Redundant Full-System Archives */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-[var(--barn-muted)]">
              Downloadable System Archives (Off-Device Storage)
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              <button
                type="button"
                disabled={zipExportBusy !== null || archiveExportLock.isSubmitting}
                aria-busy={zipExportBusy === 'complete'}
                onClick={() => void handleDownloadCompleteZip()}
                title="Includes database JSON, organized animal photos, and printable Barn Binder .HTM per species"
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
              >
                <Archive className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  {zipExportBusy === 'complete'
                    ? 'Building Archive (.ZIP)...'
                    : 'Complete Archive + Binders (.ZIP)'}
                </span>
              </button>

              <button
                type="button"
                disabled={zipExportBusy !== null || archiveExportLock.isSubmitting}
                aria-busy={zipExportBusy === 'json'}
                onClick={() => void handleDownloadTimestampedFullBackup()}
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-semibold hover:bg-[var(--barn-subtle)] disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                <span>
                  {zipExportBusy === 'json'
                    ? 'Preparing Backup (.JSON)...'
                    : 'Timestamped Full Backup (.JSON)'}
                </span>
              </button>

              <button
                type="button"
                disabled={zipExportBusy !== null || archiveExportLock.isSubmitting}
                aria-busy={zipExportBusy === 'json-light'}
                onClick={() => void handleDownloadDatabaseOnlyBackup()}
                title="Saves all herd, pedigree, breeding, and care logs as compact .JSON without loading full-resolution photos into memory"
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-medium hover:bg-[var(--barn-subtle)] disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
              >
                <Database className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                <span>
                  {zipExportBusy === 'json-light'
                    ? 'Preparing Records (.JSON)...'
                    : 'Database Only (.JSON, Skip Photos)'}
                </span>
              </button>

              <button
                type="button"
                disabled={
                  allPhotos.length === 0 ||
                  zipExportBusy !== null ||
                  archiveExportLock.isSubmitting
                }
                aria-busy={zipExportBusy === 'photos'}
                onClick={() => void handleDownloadPhotosOnlyZip()}
                title={
                  allPhotos.length === 0
                    ? 'Add photos to any animal first to export a photo folder archive'
                    : 'Download all animal images organized into species & animal folders (.ZIP)'
                }
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-medium hover:bg-[var(--barn-subtle)] disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
              >
                <Images className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                <span>
                  {zipExportBusy === 'photos'
                    ? 'Packaging Photos (.ZIP)...'
                    : `Photos Folder Archive (${allPhotos.length}) (.ZIP)`}
                </span>
              </button>

              <button
                type="button"
                disabled={isSqliteUnavailable || sqliteExportLock.isSubmitting}
                aria-busy={sqliteExportLock.isSubmitting}
                aria-describedby={isSqliteUnavailable ? `${baseId}-sqlite-reason` : undefined}
                onClick={() => void handleDownloadSqlite()}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium inline-flex items-center justify-center gap-1.5 ${
                  isSqliteUnavailable
                    ? 'bg-[var(--barn-canvas)] text-[var(--barn-muted)] opacity-55 cursor-not-allowed'
                    : 'bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] disabled:opacity-60'
                }`}
              >
                {sqliteExportLock.isSubmitting ? (
                  <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
                )}
                <span>
                  {sqliteExportLock.isSubmitting ? 'Exporting .SQLITE...' : 'Download Raw .SQLITE DB'}
                </span>
              </button>

              {onCreateVerifiedPreUpgradeBackup && (
                <button
                  type="button"
                  disabled={preUpgradeBackupLock.isSubmitting}
                  onClick={() =>
                    void preUpgradeBackupLock.runLocked(async () => {
                      setPreUpgradeFeedback(null);
                      const res = await onCreateVerifiedPreUpgradeBackup();
                      if (res?.verified) {
                        setPreUpgradeFeedback(
                          `Verified Pre-Upgrade Backup saved (${res.fileName}, SHA-256 ${res.checksumSha256.slice(
                            0,
                            12
                          )}...).`
                        );
                      } else {
                        setPreUpgradeFeedback(
                          'Pre-upgrade backup verification failed — inspect Diagnostics in Settings.'
                        );
                      }
                    })
                  }
                  className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  <ShieldCheck className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  <span>
                    {preUpgradeBackupLock.isSubmitting
                      ? 'Verifying Backup...'
                      : 'Verified Pre-Upgrade Snapshot'}
                  </span>
                </button>
              )}
            </div>

            {preUpgradeFeedback && (
              <p
                role="status"
                className="text-[11px] text-[var(--barn-sage)] bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] rounded-xl px-3 py-2 font-medium"
              >
                {preUpgradeFeedback}
              </p>
            )}

            {pendingHeavyZipExport && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs space-y-2"
              >
                <div className="font-semibold text-[var(--barn-ink)]">{heavyZipGate.title}</div>
                <p className="text-[11px] text-[var(--barn-ink)] leading-relaxed">
                  {heavyZipGate.body}
                </p>
                <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed">
                  {heavyZipGate.advice}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    disabled={zipExportBusy !== null || archiveExportLock.isSubmitting}
                    onClick={() => {
                      const kind = pendingHeavyZipExport;
                      setPendingHeavyZipExport(null);
                      if (kind === 'complete') {
                        void handleDownloadCompleteZip(true);
                      } else {
                        void handleDownloadPhotosOnlyZip(true);
                      }
                    }}
                    className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-terracotta)] text-white text-[11px] font-semibold disabled:opacity-60"
                  >
                    Try .ZIP Export Anyway
                  </button>
                  <button
                    type="button"
                    disabled={zipExportBusy !== null || archiveExportLock.isSubmitting}
                    onClick={() => {
                      setPendingHeavyZipExport(null);
                      void handleDownloadDatabaseOnlyBackup();
                    }}
                    className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold disabled:opacity-60"
                  >
                    Database Only (.JSON, Skip Photos)
                  </button>
                  <button
                    type="button"
                    disabled={zipExportBusy !== null || archiveExportLock.isSubmitting}
                    onClick={() => {
                      setPendingHeavyZipExport(null);
                      void handleDownloadTimestampedFullBackup();
                    }}
                    className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-semibold disabled:opacity-60"
                  >
                    Full .JSON Backup (With Photos)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingHeavyZipExport(null)}
                    className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isSqliteUnavailable && (
              <p id={`${baseId}-sqlite-reason`} className="text-[11px] text-[var(--barn-muted)]">
                Raw <span className="font-mono">.SQLITE</span> export/load is disabled because
                WebAssembly SQLite isn&apos;t available in this browser (your records are safely
                stored in IndexedDB JSON mode). Use <strong>Timestamped Full Backup (.JSON)</strong>{' '}
                instead.
              </p>
            )}
          </div>

          {/* Unified OPFS Backup Vault + IndexedDB Rolling Fallback + Off-App Sync Folder */}
          <UnifiedBackupVaultPanel
            opfsSupported={opfsSupported}
            opfsBackups={opfsVaultBackups}
            rollingBackups={rollingBackups}
            archivedBundlesCount={archivedHerdBundles.length}
            archivedAnimalsCount={archivedHerdBundles.reduce(
              (acc, b) => acc + b.animalCount,
              0
            )}
            deviceTier={activeDeviceTier}
            backupSyncStatus={backupSyncStatus}
            pruneSyncWarning={pruneSyncWarning}
            onSaveManualVaultBackup={(note) => onSaveManualOpfsVaultBackup?.(note)}
            onRestoreOpfsBackup={async (key) => {
              if (onRestoreOpfsVaultBackup) await onRestoreOpfsVaultBackup(key);
            }}
            onDownloadOpfsBackup={async (key) => {
              if (onDownloadOpfsVaultBackup) await onDownloadOpfsVaultBackup(key);
            }}
            onDeleteOpfsBackup={async (key) => {
              if (onDeleteOpfsVaultBackup) await onDeleteOpfsVaultBackup(key);
            }}
            onRestoreRollingBackup={onRestoreRollingBackup}
            onDeleteRollingBackup={async (key) => {
              if (onDeleteRollingBackup) await onDeleteRollingBackup(key);
            }}
            onOpenArchivedHerdsModal={() => setShowArchivedHerdsModal(true)}
            onConnectBackupSync={onConnectBackupSync}
            onReauthorizeBackupSync={onReauthorizeBackupSync}
            onDisconnectBackupSync={onDisconnectBackupSync}
            onSyncVaultToSyncNow={onSyncVaultToSyncNow}
            onDismissPruneWarning={onDismissPruneWarning}
          />
        </section>
      )}

      {/* =================================================================== */}
      {/* SECTION 02 — IMPORTS (NATIVE SYSTEM FIRST, THEN EXTERNAL PLATFORMS) */}
      {/* =================================================================== */}
      {showImportsSection && (
        <section
          id="hub-section-imports"
          aria-labelledby={`${baseId}-imports-heading`}
          className="space-y-6"
        >
          {/* Section Header Banner */}
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--barn-border)] pb-4">
              <div className="space-y-1">
                <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--barn-sage)]">
                  Section 02 · Native First, Then External Formats
                </div>
                <h2 id={`${baseId}-imports-heading`} className="font-display text-xl sm:text-2xl font-semibold">
                  Imports
                </h2>
                <p className="text-xs text-[var(--barn-muted)] leading-relaxed">
                  Restore or merge native Pedigree backup files first, or import records
                  from external platforms like HerdBoss and Evans .HTM below.
                </p>
              </div>
              <Upload className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            </div>

            {importError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)] font-medium"
              >
                {importError}
              </div>
            )}

            {importFeedback && !importError && (
              <div
                role="status"
                aria-live="polite"
                className="p-3 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs"
              >
                {importFeedback}
              </div>
            )}

            {/* Part 2A: Native System Imports */}
            <div className="space-y-4">
              <div className="space-y-0.5">
                <h3 className="font-display text-lg font-semibold">
                  2A · Native System Restore &amp; Archive Merge
                </h3>
                <p className="text-xs text-[var(--barn-muted)]">
                  Inspect and restore native <span className="font-mono">.JSON</span>,{' '}
                  <span className="font-mono">.ZIP</span> (Complete or Photos-Only), or raw{' '}
                  <span className="font-mono">.SQLITE</span> backups before modifying local storage.
                </p>
              </div>

              {activeDeviceTier <= 2 && (
                <div className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[11px] text-[var(--barn-ink)] space-y-1">
                  <div className="font-semibold">
                    Tier {activeDeviceTier} Low-Memory Restore Caution (Recommended ≤{' '}
                    {formatByteSizePure(activeTierPolicy.maxSafeImportBytesHint)})
                  </div>
                  <p className="text-[var(--barn-muted)]">
                    Large raw .ZIP, .JSON, or .SQLITE restores decode photos and database buffers
                    simultaneously in browser RAM. Close other tabs before restoring files above{' '}
                    {formatByteSizePure(activeTierPolicy.maxSafeImportBytesHint)}.
                  </p>
                </div>
              )}

              {pendingLargeRestore && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-terracotta)] text-xs space-y-2"
                >
                  <div className="font-semibold text-[var(--barn-ink)]">
                    Large Restore Warning ({formatByteSizePure(pendingLargeRestore.file.size)})
                  </div>
                  <p className="text-[11px] text-[var(--barn-muted)]">
                    &ldquo;{pendingLargeRestore.file.name}&rdquo; exceeds this Tier{' '}
                    {activeDeviceTier} device&rsquo;s{' '}
                    {formatByteSizePure(activeTierPolicy.maxSafeImportBytesHint)} comfort ceiling.
                    Close other browser tabs first, or proceed anyway?
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const pending = pendingLargeRestore;
                        setPendingLargeRestore(null);
                        if (pending.kind === 'sqlite') {
                          void handleSqliteUpload(pending.file, true);
                        } else {
                          void handleBackupArchiveUpload(
                            pending.file,
                            pending.mode || 'replace',
                            true
                          );
                        }
                      }}
                      className="min-h-[40px] sm:min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-terracotta)] text-white text-[11px] font-semibold"
                    >
                      Proceed with Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingLargeRestore(null)}
                      className="min-h-[40px] sm:min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  ref={mergeFileRef}
                  type="file"
                  accept=".json,.zip,application/json,application/zip"
                  className="hidden"
                  onChange={(e) => {
                    void handleBackupArchiveUpload(e.target.files?.[0], 'merge');
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={restoreInspectBusy || restoreCommitLock.isSubmitting}
                  onClick={() => mergeFileRef.current?.click()}
                  className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-55 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                >
                  <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Merge (.JSON / .ZIP)</span>
                </button>

                <input
                  ref={replaceFileRef}
                  type="file"
                  accept=".json,.zip,application/json,application/zip"
                  className="hidden"
                  onChange={(e) => {
                    void handleBackupArchiveUpload(e.target.files?.[0], 'replace');
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={restoreInspectBusy || restoreCommitLock.isSubmitting}
                  onClick={() => replaceFileRef.current?.click()}
                  className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-semibold hover:bg-[var(--barn-subtle)] disabled:opacity-55 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                >
                  <Upload className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  <span>Restore / Replace (.JSON / .ZIP)</span>
                </button>

                <input
                  ref={sqliteFileRef}
                  type="file"
                  accept=".sqlite,.db,.sqlite3"
                  className="hidden"
                  onChange={(e) => {
                    void handleSqliteUpload(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={
                    isSqliteUnavailable || restoreInspectBusy || restoreCommitLock.isSubmitting
                  }
                  aria-describedby={isSqliteUnavailable ? `${baseId}-import-sqlite-reason` : undefined}
                  onClick={() => sqliteFileRef.current?.click()}
                  className={`min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium inline-flex items-center justify-center gap-1.5 ${
                    isSqliteUnavailable || restoreInspectBusy || restoreCommitLock.isSubmitting
                      ? 'bg-[var(--barn-canvas)] text-[var(--barn-muted)] opacity-55 cursor-not-allowed'
                      : 'bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)]'
                  }`}
                >
                  <Database className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Load .SQLITE File</span>
                </button>
              </div>

              {isSqliteUnavailable && (
                <p id={`${baseId}-import-sqlite-reason`} className="text-[11px] text-[var(--barn-muted)]">
                  Loading raw <span className="font-mono">.SQLITE</span> binaries is disabled in
                  IndexedDB JSON compatibility mode. Use <strong>Merge (.JSON / .ZIP)</strong> or{' '}
                  <strong>Restore / Replace (.JSON / .ZIP)</strong> above.
                </p>
              )}

              <p className="text-[11px] text-[var(--barn-muted)]">
                Photos-Only (<span className="font-mono">.ZIP</span>) archives hydrate cleanly onto
                matching animals in Merge mode without overwriting existing herd records. Full
                Replaces automatically create a local safety backup first.
              </p>

              {restoreInspectBusy && (
                <div
                  role="status"
                  className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs flex items-center gap-2"
                >
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--barn-sage)]" aria-hidden="true" />
                  <span>Inspecting backup contents before writing to database...</span>
                </div>
              )}

              {/* Encrypted Archive Passphrase Prompt */}
              {pendingRestorePassphrasePrompt && (
                <form
                  onSubmit={(e) => void handleDecryptAndInspectBackup(e)}
                  className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-sage)] text-xs space-y-2.5"
                >
                  <div className="flex items-center gap-2 font-semibold text-[var(--barn-ink)]">
                    <Lock className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                    <span>
                      Unlock Encrypted Backup &ldquo;{pendingRestorePassphrasePrompt.fileName}&rdquo;
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--barn-muted)]">
                    This {pendingRestorePassphrasePrompt.sourceFormat.toUpperCase()} archive is
                    encrypted ({pendingRestorePassphrasePrompt.envelope.cipher}). Enter its
                    passphrase to inspect records before restoring.
                  </p>
                  {pendingRestorePassphrasePrompt.error && (
                    <div
                      role="alert"
                      className="p-2 rounded-lg bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[11px] font-medium"
                    >
                      {pendingRestorePassphrasePrompt.error}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor={`${baseId}-unlock-restore-pass`} className="sr-only">
                      Encrypted Backup Passphrase
                    </label>
                    <input
                      id={`${baseId}-unlock-restore-pass`}
                      type="password"
                      autoFocus
                      value={pendingRestorePassphrasePrompt.passphrase}
                      onChange={(e) =>
                        setPendingRestorePassphrasePrompt((prev) =>
                          prev ? { ...prev, passphrase: e.target.value, error: null } : null
                        )
                      }
                      placeholder="Enter backup passphrase..."
                      className="flex-1 min-w-[180px] min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                    />
                    <button
                      type="submit"
                      disabled={restoreInspectBusy || !pendingRestorePassphrasePrompt.passphrase}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold disabled:opacity-55"
                    >
                      {restoreInspectBusy ? 'Unlocking...' : 'Decrypt & Inspect'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingRestorePassphrasePrompt(null)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Pre-Restore Archive Inspector Dry-Run Preview */}
              {pendingRestoreInspection && (
                <div
                  role="region"
                  aria-label="Pre-Restore Archive Inspector"
                  className="p-4 rounded-xl bg-[var(--barn-canvas)] border-2 border-[var(--barn-sage)] text-xs space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-[var(--barn-ink)] flex flex-wrap items-center gap-1.5">
                        <CheckCircle2
                          className="w-4 h-4 text-[var(--barn-sage)] shrink-0"
                          aria-hidden="true"
                        />
                        <span>
                          Pre-Restore Inspector: {pendingRestoreInspection.inspection.fileName}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-[10px] uppercase">
                          {pendingRestoreInspection.inspection.sourceFormat}
                        </span>
                        {pendingRestoreInspection.inspection.encrypted && (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] font-mono text-[10px]">
                            Encrypted
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
                        {pendingRestoreInspection.inspection.barnName} · Mode:{' '}
                        <strong className="text-[var(--barn-ink)]">
                          {pendingRestoreInspection.mode === 'replace'
                            ? 'Replace Current Barn'
                            : 'Merge Into Current Barn'}
                        </strong>
                        {pendingRestoreInspection.inspection.isPhotosOnly
                          ? ' · Photos-Only Archive'
                          : ''}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div className="p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]">
                      <div className="text-[var(--barn-muted)]">Animals</div>
                      <div className="font-mono font-semibold tabular-nums text-[var(--barn-ink)]">
                        {pendingRestoreInspection.inspection.animalCount} (
                        {pendingRestoreInspection.inspection.activeAnimalCount} active /{' '}
                        {pendingRestoreInspection.inspection.archivedAnimalCount} arch)
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]">
                      <div className="text-[var(--barn-muted)]">Photos</div>
                      <div className="font-mono font-semibold tabular-nums text-[var(--barn-ink)]">
                        {pendingRestoreInspection.inspection.photoCount} ·{' '}
                        {formatByteSizePure(pendingRestoreInspection.inspection.photoBytes)}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]">
                      <div className="text-[var(--barn-muted)]">Breedings / Chores</div>
                      <div className="font-mono font-semibold tabular-nums text-[var(--barn-ink)]">
                        {pendingRestoreInspection.inspection.breedingCount} /{' '}
                        {pendingRestoreInspection.inspection.taskCount}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]">
                      <div className="text-[var(--barn-muted)]">Integrity Checks</div>
                      <div className="font-mono font-semibold tabular-nums text-[var(--barn-ink)]">
                        {pendingRestoreInspection.inspection.duplicateTattooCount} dup ·{' '}
                        {pendingRestoreInspection.inspection.parentSexMismatchCount} sex ·{' '}
                        {pendingRestoreInspection.inspection.healthIssueCount} health
                      </div>
                    </div>
                  </div>

                  {(pendingRestoreInspection.inspection.feedBatchCount > 0 ||
                    pendingRestoreInspection.inspection.feedAllocationCount > 0 ||
                    pendingRestoreInspection.inspection.ledgerEntryCount > 0 ||
                    pendingRestoreInspection.inspection.processingLogCount > 0 ||
                    pendingRestoreInspection.inspection.youthProjectBookCount > 0) && (
                    <div className="rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] p-2.5 text-[11px] font-mono tabular-nums text-[var(--barn-muted)] flex flex-wrap gap-x-4 gap-y-1">
                      <span>Feed Lots: {pendingRestoreInspection.inspection.feedBatchCount}</span>
                      <span>Feed Logs: {pendingRestoreInspection.inspection.feedAllocationCount}</span>
                      <span>Ledger: {pendingRestoreInspection.inspection.ledgerEntryCount}</span>
                      <span>Processing: {pendingRestoreInspection.inspection.processingLogCount}</span>
                      <span>4-H / FFA: {pendingRestoreInspection.inspection.youthProjectBookCount}</span>
                    </div>
                  )}

                  {pendingRestoreInspection.inspection.speciesBreakdown.length > 0 && (
                    <div className="rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] p-2.5 space-y-1 text-[11px]">
                      <div className="font-semibold text-[var(--barn-muted)]">
                        Species Breakdown in Archive
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono tabular-nums">
                        {pendingRestoreInspection.inspection.speciesBreakdown.map((sp) => (
                          <span key={sp.species}>
                            {sp.species}: {sp.animalCount} animals, {sp.photoCount} photos (
                            {formatByteSizePure(sp.photoBytes)})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {pendingRestoreInspection.mode === 'replace' &&
                    pendingRestoreInspection.inspection.replaceImpact && (
                      <div className="p-2.5 rounded-lg bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[11px] space-y-0.5">
                        <div className="font-semibold text-[var(--barn-ink)]">
                          Replace Impact Summary
                        </div>
                        <p className="text-[var(--barn-muted)]">
                          Current barn (
                          {pendingRestoreInspection.inspection.replaceImpact.currentAnimalCount}{' '}
                          animals) &rarr; Incoming (
                          {pendingRestoreInspection.inspection.animalCount} animals, net{' '}
                          {pendingRestoreInspection.inspection.replaceImpact.netAnimalDelta >= 0
                            ? `+${pendingRestoreInspection.inspection.replaceImpact.netAnimalDelta}`
                            : pendingRestoreInspection.inspection.replaceImpact.netAnimalDelta}
                          ).{' '}
                          {pendingRestoreInspection.inspection.replaceImpact
                            .currentAnimalsNotInIncoming > 0 && (
                            <strong className="text-[var(--barn-ink)]">
                              {
                                pendingRestoreInspection.inspection.replaceImpact
                                  .currentAnimalsNotInIncoming
                              }{' '}
                              existing local animal(s) are not in this backup.
                            </strong>
                          )}{' '}
                          A safety backup of your current barn is saved first.
                        </p>
                      </div>
                    )}

                  {pendingRestoreInspection.mode === 'merge' &&
                    pendingRestoreInspection.inspection.mergeImpact && (
                      <div className="p-2.5 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-[11px] space-y-0.5">
                        <div className="font-semibold text-[var(--barn-ink)]">
                          Merge Impact Summary
                        </div>
                        <p className="text-[var(--barn-muted)]">
                          Will add{' '}
                          <strong className="text-[var(--barn-ink)]">
                            {pendingRestoreInspection.inspection.mergeImpact.newAnimalsToAdd}
                          </strong>{' '}
                          new animal(s) &amp;{' '}
                          <strong className="text-[var(--barn-ink)]">
                            {pendingRestoreInspection.inspection.mergeImpact.newPhotosToAdd}
                          </strong>{' '}
                          new photo(s), while matching{' '}
                          {pendingRestoreInspection.inspection.mergeImpact.existingAnimalsMatched}{' '}
                          existing animal(s) and{' '}
                          {pendingRestoreInspection.inspection.mergeImpact.existingPhotosMatched}{' '}
                          photo(s).
                        </p>
                      </div>
                    )}

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={restoreCommitLock.isSubmitting}
                      aria-busy={restoreCommitLock.isSubmitting}
                      onClick={() => void handleConfirmPendingRestore()}
                      className={`min-h-[42px] sm:min-h-[38px] px-4 py-1.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60 ${
                        pendingRestoreInspection.mode === 'replace'
                          ? 'bg-[var(--barn-terracotta)] text-white'
                          : 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                      }`}
                    >
                      {restoreCommitLock.isSubmitting && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      )}
                      {restoreCommitLock.isSubmitting
                        ? 'Applying Restore...'
                        : pendingRestoreInspection.mode === 'replace'
                        ? 'Confirm & Replace Barn Data'
                        : 'Confirm & Merge Into Barn'}
                    </button>
                    <button
                      type="button"
                      disabled={restoreCommitLock.isSubmitting}
                      onClick={() => setPendingRestoreInspection(null)}
                      className="min-h-[42px] sm:min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Part 2B: External Format Importers & Paper OCR Scanner */}
          <div className="space-y-4">
            <div className="px-1">
              <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--barn-terracotta)]">
                2B · Paper / PDF Pedigree Scanner &amp; External Format Importers
              </div>
            </div>
            <PedigreeOcrScannerPanel
              snapshot={snapshot}
              activeSpeciesName={activeSpeciesName}
              constrainedDevice={activeDeviceTier <= 2}
              onStagePreviewToImportQueue={(staged) => {
                setStagedOcrPreview(staged);
                if (typeof document !== 'undefined') {
                  setTimeout(() => {
                    document
                      .getElementById('external-platform-importer')
                      ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
                  }, 60);
                }
              }}
            />
            <ExternalImporterPanel
              snapshot={snapshot}
              activeSpeciesName={activeSpeciesName}
              deviceCapabilityAssessment={deviceCapability?.assessment}
              externalOcrPreview={stagedOcrPreview}
              onClearExternalOcrPreview={() => setStagedOcrPreview(null)}
              onCommitImport={onApplyPlatformImport}
            />
          </div>
        </section>
      )}

      {/* =================================================================== */}
      {/* SECTION 03 — EXPORTERS (EXTENSIBLE NON-NATIVE FORMATS)             */}
      {/* =================================================================== */}
      {showExportersSection && (
        <section
          id="hub-section-exporters"
          aria-labelledby={`${baseId}-exporters-heading`}
          className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--barn-border)] pb-4">
            <div className="space-y-1">
              <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--barn-sage)]">
                Section 03 · Open &amp; Extensible Output Registry
              </div>
              <h2 id={`${baseId}-exporters-heading`} className="font-display text-xl sm:text-2xl font-semibold">
                Exporters (Non-Native Formats)
              </h2>
              <p className="text-xs text-[var(--barn-muted)]">
                Generate spreadsheets, Evans-compatible pedigree sheets, printable herd binders,
                normalized report DTOs, and iCalendar task feeds. New external format schemas
                plug directly into the exporter registry.
              </p>
            </div>
            <FileSpreadsheet className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
          </div>

          {/* Scope Bar */}
          <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div>
              <label
                htmlFor={`${baseId}-exporter-species-scope`}
                className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
              >
                Export Species Scope
              </label>
              <select
                id={`${baseId}-exporter-species-scope`}
                value={exporterSpeciesScope}
                onChange={(e) => setExporterSpeciesScope(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-semibold"
              >
                <option value="">All Livestock Species ({snapshot.animals.length})</option>
                {snapshot.speciesProfiles.map((sp) => {
                  const count = snapshot.animals.filter((a) => isSameSpecies(a.species, sp.name)).length;
                  return (
                    <option key={sp.id} value={sp.name}>
                      {sp.name} ({count} animal{count === 1 ? '' : 's'})
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label
                htmlFor={`${baseId}-exporter-pedigree-depth`}
                className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
              >
                Pedigree Depth (Evans .HTM &amp; Binder)
              </label>
              <select
                id={`${baseId}-exporter-pedigree-depth`}
                value={exporterGenerations}
                onChange={(e) =>
                  setExporterGenerations(normalizePedigreeGenerationDepth(Number(e.target.value), 3))
                }
                className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium"
              >
                <option value={3}>3 Generations (Standard 1-Page)</option>
                <option value={4}>4 Generations</option>
                <option value={5}>5 Generations (Compact)</option>
                <option value={6}>6 Generations (Dense Archival)</option>
                <option value={7}>7 Generations (Evans .HTM / Share Card)</option>
                <option value={8}>8 Generations (Full Deep Ancestry)</option>
              </select>
            </div>

            <div className="flex items-end">
              <label className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={binderIncludeArchived}
                  onChange={(e) => setBinderIncludeArchived(e.target.checked)}
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>Include archived / sold in Barn Binder</span>
              </label>
            </div>
          </div>

          {exporterError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)] font-medium"
            >
              {exporterError}
            </div>
          )}

          {exporterFeedback && !exporterError && (
            <div
              role="status"
              aria-live="polite"
              className="p-3 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs space-y-1"
            >
              <div>{exporterFeedback.message}</div>
              {exporterFeedback.warnings.map((w, idx) => (
                <div key={idx} className="text-[11px] text-[var(--barn-muted)] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--barn-terracotta)] shrink-0" aria-hidden="true" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Active Non-Native Exporters Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {BUILTIN_NON_NATIVE_EXPORTERS.map((exp) => {
              const Icon = getExporterCategoryIcon(exp.category);
              const isBusy = exporterActionLock.isKeyLocked(exp.id);
              const isSingleAnimal = exp.scopeMode === 'single_animal';
              const isSpeciesRequired = exp.scopeMode === 'species_required';
              const disabledReason =
                isSingleAnimal && scopedExporterAnimals.length === 0
                  ? 'Add or select an animal first.'
                  : null;

              return (
                <article
                  key={exp.id}
                  className="p-4 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] flex flex-col justify-between gap-3.5"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <Icon
                          className="w-4 h-4 text-[var(--barn-sage)] shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-[var(--barn-ink)]">
                            {exp.name}
                          </h3>
                          <p className="text-[11px] text-[var(--barn-muted)]">
                            {exp.targetPlatform}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono text-[11px] font-semibold text-[var(--barn-ink)] px-2 py-0.5 rounded bg-[var(--barn-surface)] border border-[var(--barn-border)] shrink-0">
                        {exp.formatExtension}
                      </span>
                    </div>

                    <p className="text-xs text-[var(--barn-muted)] leading-relaxed">
                      {exp.description}
                    </p>

                    <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed">
                      {exp.compatibilityNote}
                    </p>

                    {exp.schemaFields && exp.schemaFields.length > 0 && (
                      <div className="text-[10px] font-mono text-[var(--barn-muted)] pt-0.5">
                        Schema: {exp.schemaFields.join(' · ')}
                      </div>
                    )}

                    {isSingleAnimal && (
                      <div className="pt-1">
                        <label
                          htmlFor={`${baseId}-evans-animal-select`}
                          className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                        >
                          Subject Animal
                        </label>
                        <select
                          id={`${baseId}-evans-animal-select`}
                          value={exporterAnimalId}
                          onChange={(e) => setExporterAnimalId(e.target.value)}
                          disabled={scopedExporterAnimals.length === 0}
                          className="w-full min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium"
                        >
                          {scopedExporterAnimals.length === 0 ? (
                            <option value="">No animals in scope</option>
                          ) : (
                            scopedExporterAnimals.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                                {a.tattoo ? ` (${a.tattoo})` : ''} · {a.species}
                                {isAnimalArchived(a) ? ` [${a.status}]` : ''}
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 pt-1 border-t border-[var(--barn-border)]/70">
                    <button
                      type="button"
                      disabled={isBusy || Boolean(disabledReason)}
                      aria-busy={isBusy}
                      onClick={() => void handleRunExporter(exp)}
                      className="w-full min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] text-xs font-semibold text-[var(--barn-ink)] inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--barn-sage)]" aria-hidden="true" />
                      ) : (
                        <Download className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                      )}
                      <span>
                        {isBusy
                          ? `Exporting ${exp.formatExtension}...`
                          : isSpeciesRequired
                          ? `Export ${resolvedBinderSpecies} ${exp.formatExtension}`
                          : `Export ${
                              exporterSpeciesScope && exp.scopeMode !== 'single_animal'
                                ? `${exporterSpeciesScope} `
                                : ''
                            }${exp.formatExtension}`}
                      </span>
                    </button>
                    {disabledReason && (
                      <p className="text-[11px] text-[var(--barn-muted)]">{disabledReason}</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Extensible External Schema Registry */}
          <div className="border-t border-[var(--barn-border)] pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-[var(--barn-ink)]">
                  Extensible External Schema Registry
                </h3>
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Pure TypeScript descriptors in{' '}
                  <code className="font-mono">src/domain/exporters/registry.ts</code> allow future
                  external platform templates to drop in with zero UI rewrites.
                </p>
              </div>
              <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                {BUILTIN_NON_NATIVE_EXPORTERS.length} active
                {PLANNED_EXTERNAL_SCHEMA_TARGETS.length > 0
                  ? ` · ${PLANNED_EXTERNAL_SCHEMA_TARGETS.length} reserved schemas`
                  : ' · All built-in schemas ready'}
              </span>
            </div>

            {PLANNED_EXTERNAL_SCHEMA_TARGETS.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                {PLANNED_EXTERNAL_SCHEMA_TARGETS.map((target) => (
                  <div
                    key={target.id}
                    className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-dashed border-[var(--barn-border)] space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--barn-ink)]">{target.name}</span>
                      <span className="font-mono text-[10px] text-[var(--barn-muted)]">
                        {target.formatExtension} · Registered Slot
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--barn-muted)]">{target.description}</p>
                    {target.schemaFields && (
                      <p className="text-[10px] font-mono text-[var(--barn-muted)]">
                        Columns: {target.schemaFields.join(' · ')}
                      </p>
                    )}
                    <p className="text-[11px] text-[var(--barn-sage)]">{target.compatibilityNote}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Archived Herds Management Modal */}
      <ArchivedHerdsModal
        isOpen={showArchivedHerdsModal}
        opfsSupported={opfsSupported}
        archives={archivedHerdBundles}
        autoOffloadEnabled={Boolean(settings.autoOffloadRetiredToOpfs)}
        onToggleAutoOffload={(enabled) =>
          onUpdateSettings({ autoOffloadRetiredToOpfs: enabled }, { silent: true })
        }
        onRestoreArchive={async (archiveKey, opts) => {
          if (onRestoreArchivedHerdBundle) {
            await onRestoreArchivedHerdBundle(archiveKey, opts);
          }
        }}
        onDownloadArchive={async (archiveKey) => {
          if (onDownloadArchivedHerdBundle) {
            await onDownloadArchivedHerdBundle(archiveKey);
          }
        }}
        onDeleteArchive={async (archiveKey) => {
          if (onDeleteArchivedHerdBundle) {
            await onDeleteArchivedHerdBundle(archiveKey);
          }
        }}
        onClose={() => setShowArchivedHerdsModal(false)}
      />
    </div>
  );
}
