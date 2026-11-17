/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Unified Backup Vault & Archived Herds Summary Panel (`UnifiedBackupVaultPanel`).
 *
 * Consolidates OPFS `/backups` snapshots (monthly auto, pre-upgrade, pre-reset,
 * manual vault saves, and migration recovery dumps) alongside local IndexedDB
 * rolling snapshots as an automatic fallback tier. Zero pill badges.
 */

import {
  AlertTriangle,
  Archive,
  Download,
  FolderSync,
  HardDrive,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import React, { useState } from 'react';
import { VAULT_KIND_LABELS, VaultBackupMetadata } from '../core/backupVault';
import {
  DeviceCapabilityTierNumber,
  getTierStoragePolicy,
} from '../core/deviceCapability';
import { formatByteSizePure } from '../core/imageOptimizationSpec';
import { BackupSinkStatus } from '../storage/localSyncChannels';
import { OpfsPruneSinkWarning } from '../storage/opfsStorage';
import { RollingBackupMeta } from '../storage/storageProtection';

interface UnifiedBackupVaultPanelProps {
  opfsSupported: boolean;
  opfsBackups: VaultBackupMetadata[];
  rollingBackups: RollingBackupMeta[];
  archivedBundlesCount: number;
  archivedAnimalsCount: number;
  deviceTier?: DeviceCapabilityTierNumber;
  backupSinkStatus?: BackupSinkStatus | null;
  pruneSinkWarning?: OpfsPruneSinkWarning | null;
  onSaveManualVaultBackup: (note?: string) => Promise<unknown> | void;
  onRestoreOpfsBackup: (key: string) => Promise<void>;
  onDownloadOpfsBackup: (key: string) => Promise<void>;
  onDeleteOpfsBackup: (key: string) => Promise<void>;
  onRestoreRollingBackup: (key: string) => Promise<void>;
  onDeleteRollingBackup: (key: string) => Promise<void>;
  onOpenArchivedHerdsModal: () => void;
  onConnectBackupSink?: () => Promise<unknown>;
  onReauthorizeBackupSink?: () => Promise<unknown>;
  onDisconnectBackupSink?: () => Promise<unknown>;
  onSyncVaultToSinkNow?: () => Promise<unknown>;
  onDismissPruneWarning?: () => void;
}

export function UnifiedBackupVaultPanel({
  opfsSupported,
  opfsBackups,
  rollingBackups,
  archivedBundlesCount,
  archivedAnimalsCount,
  deviceTier = 5,
  backupSinkStatus = null,
  pruneSinkWarning = null,
  onSaveManualVaultBackup,
  onRestoreOpfsBackup,
  onDownloadOpfsBackup,
  onDeleteOpfsBackup,
  onRestoreRollingBackup,
  onDeleteRollingBackup,
  onOpenArchivedHerdsModal,
  onConnectBackupSink,
  onReauthorizeBackupSink,
  onDisconnectBackupSink,
  onSyncVaultToSinkNow,
  onDismissPruneWarning,
}: UnifiedBackupVaultPanelProps) {
  const [noteInput, setNoteInput] = useState('');
  const [savingVault, setSavingVault] = useState(false);
  const [sinkBusy, setSinkBusy] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmRestoreKey, setConfirmRestoreKey] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const tierPolicy = getTierStoragePolicy(deviceTier);

  const handleSaveSnapshot = async () => {
    setVaultError(null);
    setSavingVault(true);
    try {
      await onSaveManualVaultBackup(noteInput.trim() || undefined);
      setNoteInput('');
    } catch (err: unknown) {
      setVaultError(err instanceof Error ? err.message : 'Could not save vault snapshot.');
    } finally {
      setSavingVault(false);
    }
  };

  const handleRestoreOpfs = async (key: string) => {
    setVaultError(null);
    setBusyKey(key);
    try {
      await onRestoreOpfsBackup(key);
      setConfirmRestoreKey(null);
    } catch (err: unknown) {
      setVaultError(err instanceof Error ? err.message : 'Could not restore OPFS snapshot.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleRestoreRolling = async (key: string) => {
    setVaultError(null);
    setBusyKey(key);
    try {
      await onRestoreRollingBackup(key);
      setConfirmRestoreKey(null);
    } catch (err: unknown) {
      setVaultError(err instanceof Error ? err.message : 'Could not restore IndexedDB snapshot.');
    } finally {
      setBusyKey(null);
    }
  };

  const totalEntries = opfsBackups.length + rollingBackups.length;

  return (
    <div className="space-y-4 border-t border-[var(--barn-border)] pt-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--barn-ink)] flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            <span>Unified Local Backup Vault ({totalEntries})</span>
          </h3>
          <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
            {opfsSupported
              ? `Tier ${deviceTier} caps: ${tierPolicy.monthlyCap} monthly · ${tierPolicy.preUpgradeCap} pre-upgrade · ${tierPolicy.manualCap} manual (compressed .vault.zip) + ${tierPolicy.rollingIdbCap} rolling IndexedDB fallback${tierPolicy.dehydrateMirrorPhotos ? ' (thumbnail-light mirror)' : ''}.`
              : `OPFS directory storage is unavailable in this browser; retaining up to ${tierPolicy.rollingIdbCap} IndexedDB rolling fallback snapshot(s).`}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenArchivedHerdsModal}
          className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <Archive className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
          <span>
            Archived Herds ({archivedBundlesCount}
            {archivedAnimalsCount > 0 ? ` · ${archivedAnimalsCount} animals` : ''})
          </span>
        </button>
      </div>

      {/* Unbacked Prune Warning Alert */}
      {pruneSinkWarning && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs flex items-start justify-between gap-2.5"
        >
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle
              className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <div className="font-semibold text-[var(--barn-ink)]">
                Aging Local Backups Pruned Without Sync Copy
              </div>
              <p className="text-[11px] text-[var(--barn-muted)]">{pruneSinkWarning.message}</p>
            </div>
          </div>
          {onDismissPruneWarning && (
            <button
              type="button"
              onClick={onDismissPruneWarning}
              aria-label="Dismiss prune warning"
              className="min-h-[44px] min-w-[44px] sm:min-h-[30px] sm:min-w-[30px] rounded-lg hover:bg-[var(--barn-surface)]/70 flex items-center justify-center shrink-0"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* Pre-Prune External Backup Sink Folder */}
      <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2 text-xs">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-0.5 min-w-0 flex-1">
            <div className="font-semibold text-[var(--barn-ink)] flex items-center gap-1.5">
              <FolderSync className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>Pre-Prune Off-App Backup Sink Folder</span>
            </div>
            <p id="vault-sink-availability-reason" className="text-[11px] text-[var(--barn-muted)]">
              {!opfsSupported
                ? 'Disabled: OPFS local vault directory storage is unavailable in this browser version. Rolling backups remain saved in IndexedDB; download Timestamped Backup (.JSON) copies manually.'
                : backupSinkStatus?.supported
                  ? backupSinkStatus.configured
                    ? `Connected: "${backupSinkStatus.folderName}/pedigree-vault-archive" · Expiring vault backups copy here automatically before local cleanup.`
                    : 'Choose a local Drive / OneDrive / SyncThing / iCloud-Desktop folder so expiring vault copies offload before local pruning.'
                  : 'Disabled: Persistent folder access (showDirectoryPicker) is unsupported in this browser (e.g., iOS Safari or older Firefox). Export manual .JSON backups off-device regularly.'}
            </p>
            {opfsSupported && backupSinkStatus?.configured && (
              <div
                aria-live="polite"
                className="text-[11px] font-mono text-[var(--barn-muted)] pt-0.5"
              >
                Permission:{' '}
                <span className="text-[var(--barn-ink)] font-semibold">
                  {backupSinkStatus.permissionState === 'granted'
                    ? 'Ready (auto-offload active)'
                    : backupSinkStatus.permissionState === 'prompt'
                      ? 'Needs re-authorization'
                      : backupSinkStatus.permissionState}
                </span>
                {backupSinkStatus.lastPushFileName && backupSinkStatus.lastPushAtIso
                  ? ` · Last synced ${backupSinkStatus.lastPushFileName} (${new Date(backupSinkStatus.lastPushAtIso).toLocaleDateString()})`
                  : ''}
                {backupSinkStatus.lastPushError ? ` · ${backupSinkStatus.lastPushError}` : ''}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {opfsSupported && backupSinkStatus?.supported ? (
              backupSinkStatus.configured ? (
                <>
                  {backupSinkStatus.permissionState !== 'granted' && onReauthorizeBackupSink && (
                    <button
                      type="button"
                      disabled={sinkBusy}
                      onClick={async () => {
                        setSinkBusy(true);
                        try {
                          await onReauthorizeBackupSink();
                        } finally {
                          setSinkBusy(false);
                        }
                      }}
                      className="min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap disabled:opacity-50"
                    >
                      Re-authorize Folder
                    </button>
                  )}
                  {onSyncVaultToSinkNow && (
                    <button
                      type="button"
                      disabled={sinkBusy || opfsBackups.length === 0}
                      onClick={async () => {
                        setSinkBusy(true);
                        try {
                          await onSyncVaultToSinkNow();
                        } finally {
                          setSinkBusy(false);
                        }
                      }}
                      className="min-h-[44px] sm:min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                    >
                      <RefreshCw className="w-3 h-3" aria-hidden="true" />
                      Sync Vault Now
                    </button>
                  )}
                  {onDisconnectBackupSink && (
                    <button
                      type="button"
                      disabled={sinkBusy}
                      onClick={async () => {
                        setSinkBusy(true);
                        try {
                          await onDisconnectBackupSink();
                        } finally {
                          setSinkBusy(false);
                        }
                      }}
                      className="min-h-[44px] sm:min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] text-[var(--barn-muted)] hover:text-[var(--barn-ink)] whitespace-nowrap disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  )}
                </>
              ) : (
                onConnectBackupSink && (
                  <button
                    type="button"
                    disabled={sinkBusy}
                    onClick={async () => {
                      setSinkBusy(true);
                      try {
                        await onConnectBackupSink();
                      } finally {
                        setSinkBusy(false);
                      }
                    }}
                    className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                  >
                    <FolderSync className="w-3.5 h-3.5" aria-hidden="true" />
                    Connect Backup Sink Folder
                  </button>
                )
              )
            ) : (
              <button
                type="button"
                disabled
                aria-describedby="vault-sink-availability-reason"
                className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[var(--barn-muted)] text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap opacity-55 cursor-not-allowed"
              >
                <FolderSync className="w-3.5 h-3.5" aria-hidden="true" />
                Connect Backup Sink Folder
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Manual Snapshot Creation Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <input
          type="text"
          aria-label="Optional backup snapshot note"
          placeholder="Optional snapshot label (e.g. Pre-show weekend check)"
          value={noteInput}
          maxLength={120}
          onChange={(e) => setNoteInput(e.target.value)}
          className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
        />
        <button
          type="button"
          disabled={savingVault}
          onClick={() => void handleSaveSnapshot()}
          className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          {savingVault ? 'Saving Snapshot...' : 'Save Snapshot to Vault Now'}
        </button>
      </div>

      {vaultError && (
        <div
          role="alert"
          aria-live="polite"
          className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)]"
        >
          {vaultError}
        </div>
      )}

      {totalEntries === 0 ? (
        <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-muted)]">
          No local vault snapshots recorded yet. Save a manual snapshot anytime or edit records to
          trigger automatic rolling &amp; monthly snapshots.
        </div>
      ) : (
        <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl bg-[var(--barn-canvas)] overflow-hidden">
          {opfsBackups.map((item) => {
            const isConfirmRestore = confirmRestoreKey === `opfs:${item.key}`;
            const isConfirmDelete = confirmDeleteKey === `opfs:${item.key}`;
            const isBusy = busyKey === item.key;

            return (
              <div
                key={`opfs:${item.key}`}
                className="px-3.5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="font-medium text-[var(--barn-ink)] flex flex-wrap items-center gap-x-1.5">
                    <span>{VAULT_KIND_LABELS[item.kind]}</span>
                    <span className="text-[var(--barn-muted)]">·</span>
                    <span className="font-mono text-[11px] text-[var(--barn-muted)] tabular-nums">
                      {new Date(item.createdAtIso).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)] truncate">
                    OPFS /backups · v{item.schemaVersion} · {item.animalCount} animals ·{' '}
                    {item.photoCount} photos · {formatByteSizePure(item.byteSize)}
                    {item.note ? ` · ${item.note}` : ''}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {isConfirmRestore ? (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleRestoreOpfs(item.key)}
                        className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-terracotta)] text-white text-[11px] font-semibold whitespace-nowrap disabled:opacity-50"
                      >
                        {isBusy ? 'Restoring...' : 'Confirm Restore'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRestoreKey(null)}
                        className="min-h-[44px] sm:min-h-[40px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
                      >
                        Cancel
                      </button>
                    </>
                  ) : isConfirmDelete ? (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setConfirmDeleteKey(null);
                          void onDeleteOpfsBackup(item.key);
                        }}
                        className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold whitespace-nowrap"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteKey(null)}
                        className="min-h-[44px] sm:min-h-[40px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => void onDownloadOpfsBackup(item.key)}
                        aria-label={`Download ${item.fileName}`}
                        className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDeleteKey(null);
                          setConfirmRestoreKey(`opfs:${item.key}`);
                        }}
                        className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmRestoreKey(null);
                          setConfirmDeleteKey(`opfs:${item.key}`);
                        }}
                        aria-label={`Delete backup ${item.fileName}`}
                        className="min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {rollingBackups.map((rb) => {
            const isConfirmRestore = confirmRestoreKey === `idb:${rb.key}`;
            const isConfirmDelete = confirmDeleteKey === `idb:${rb.key}`;
            const isBusy = busyKey === rb.key;

            return (
              <div
                key={`idb:${rb.key}`}
                className="px-3.5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="font-medium text-[var(--barn-ink)] flex flex-wrap items-center gap-x-1.5">
                    <span>Rolling IndexedDB Snapshot (Fallback)</span>
                    <span className="text-[var(--barn-muted)]">·</span>
                    <span className="font-mono text-[11px] text-[var(--barn-muted)] tabular-nums">
                      {new Date(rb.savedAtIso).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                    IndexedDB Fallback · {rb.animalCount} animals · {rb.photoCount ?? 0} photos ·{' '}
                    {rb.speciesCount} species · {formatByteSizePure(rb.byteSize)}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {isConfirmRestore ? (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleRestoreRolling(rb.key)}
                        className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-terracotta)] text-white text-[11px] font-semibold whitespace-nowrap disabled:opacity-50"
                      >
                        {isBusy ? 'Restoring...' : 'Confirm Restore'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRestoreKey(null)}
                        className="min-h-[44px] sm:min-h-[40px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
                      >
                        Cancel
                      </button>
                    </>
                  ) : isConfirmDelete ? (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setConfirmDeleteKey(null);
                          void onDeleteRollingBackup(rb.key);
                        }}
                        className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold whitespace-nowrap"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteKey(null)}
                        className="min-h-[44px] sm:min-h-[40px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDeleteKey(null);
                          setConfirmRestoreKey(`idb:${rb.key}`);
                        }}
                        className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmRestoreKey(null);
                          setConfirmDeleteKey(`idb:${rb.key}`);
                        }}
                        aria-label={`Delete IndexedDB rolling backup ${rb.savedAtIso}`}
                        className="min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
