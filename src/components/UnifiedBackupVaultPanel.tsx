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
  Archive,
  Download,
  HardDrive,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import React, { useState } from 'react';
import { VAULT_KIND_LABELS, VaultBackupMetadata } from '../core/backupVault';
import { formatByteSizePure } from '../core/imageOptimizationSpec';
import { RollingBackupMeta } from '../storage/storageProtection';

interface UnifiedBackupVaultPanelProps {
  opfsSupported: boolean;
  opfsBackups: VaultBackupMetadata[];
  rollingBackups: RollingBackupMeta[];
  archivedBundlesCount: number;
  archivedAnimalsCount: number;
  onSaveManualVaultBackup: (note?: string) => Promise<unknown> | void;
  onRestoreOpfsBackup: (key: string) => Promise<void>;
  onDownloadOpfsBackup: (key: string) => Promise<void>;
  onDeleteOpfsBackup: (key: string) => Promise<void>;
  onRestoreRollingBackup: (key: string) => Promise<void>;
  onDeleteRollingBackup: (key: string) => Promise<void>;
  onOpenArchivedHerdsModal: () => void;
}

export function UnifiedBackupVaultPanel({
  opfsSupported,
  opfsBackups,
  rollingBackups,
  archivedBundlesCount,
  archivedAnimalsCount,
  onSaveManualVaultBackup,
  onRestoreOpfsBackup,
  onDownloadOpfsBackup,
  onDeleteOpfsBackup,
  onRestoreRollingBackup,
  onDeleteRollingBackup,
  onOpenArchivedHerdsModal,
}: UnifiedBackupVaultPanelProps) {
  const [noteInput, setNoteInput] = useState('');
  const [savingVault, setSavingVault] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmRestoreKey, setConfirmRestoreKey] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);

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
              ? 'Combines OPFS /backups (6 monthly auto · 3 pre-upgrade · pre-reset · manual) and IndexedDB rolling fallback snapshots.'
              : 'OPFS directory storage is unavailable in this browser; showing IndexedDB rolling fallback snapshots.'}
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
                        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-terracotta)] text-white text-[11px] font-semibold whitespace-nowrap disabled:opacity-50"
                      >
                        {isBusy ? 'Restoring...' : 'Confirm Restore'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRestoreKey(null)}
                        className="min-h-[40px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
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
                        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold whitespace-nowrap"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteKey(null)}
                        className="min-h-[40px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
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
                        className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
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
                        className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
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
                        className="min-h-[40px] min-w-[40px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center"
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
                        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-terracotta)] text-white text-[11px] font-semibold whitespace-nowrap disabled:opacity-50"
                      >
                        {isBusy ? 'Restoring...' : 'Confirm Restore'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRestoreKey(null)}
                        className="min-h-[40px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
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
                        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold whitespace-nowrap"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteKey(null)}
                        className="min-h-[40px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
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
                        className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
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
                        className="min-h-[40px] min-w-[40px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center"
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
