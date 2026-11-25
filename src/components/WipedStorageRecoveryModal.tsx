/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Wiped Browser Storage Detection & Recovery Dialog (`WipedStorageRecoveryModal`).
 *
 * Displayed on startup when primary IndexedDB is empty while prior-use evidence
 * exists (priorUseSentinel or non-empty OPFS /backups or /archives), pausing
 * silent sample-herd re-seeding so the breeder can recover without data loss.
 */

import {
  AlertTriangle,
  HardDrive,
  RotateCcw,
  Upload,
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import { formatByteSizePure } from '../domain/imageOptimizationSpec';
import {
  MAX_JSON_BACKUP_BYTES,
  MAX_SQLITE_DB_BYTES,
  MAX_ZIP_ARCHIVE_BYTES,
  validateUploadFileSize,
} from '../domain/inputSanitization';
import { ArchivedHerdIndexEntry, VAULT_KIND_LABELS } from '../domain/backupVault';
import { WipedStorageRecoveryContext } from '../storage/opfsStorage';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { readBlobAsArrayBuffer, readBlobAsText } from '../utils/es2018Shims';

interface WipedStorageRecoveryModalProps {
  context: WipedStorageRecoveryContext | null;
  archivedHerdBundles?: ArchivedHerdIndexEntry[];
  onRestoreLatestOpfs: () => Promise<void>;
  onRestoreArchivedBundle?: (archiveKey: string) => Promise<void>;
  onImportJsonReplace: (jsonText: string) => Promise<void>;
  onImportArchiveReplace: (bytes: Uint8Array, fileName: string) => Promise<void>;
  onImportSqlite: (bytes: Uint8Array) => Promise<void>;
  onStartFresh: () => Promise<void>;
}

export function WipedStorageRecoveryModal({
  context,
  archivedHerdBundles = [],
  onRestoreLatestOpfs,
  onRestoreArchivedBundle,
  onImportJsonReplace,
  onImportArchiveReplace,
  onImportSqlite,
  onStartFresh,
}: WipedStorageRecoveryModalProps) {
  const isOpen = Boolean(context?.detected);
  const [busyAction, setBusyAction] = useState<'opfs' | 'upload' | 'fresh' | null>(null);
  const [confirmStartFresh, setConfirmStartFresh] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const dialogRef = useAccessibleDialog({
    isOpen,
    closeOnEscape: false,
    onClose: () => {},
  });

  if (!isOpen || !context) return null;

  const latest = context.latestOpfsBackup;
  const priorBarnName =
    context.sentinel?.barnName || latest?.barnName || 'Your Barn';
  const priorAnimalCount =
    context.sentinel?.animalCount ?? latest?.animalCount ?? 0;

  const handleRestoreOpfs = async () => {
    setErrorMsg(null);
    setBusyAction('opfs');
    try {
      await onRestoreLatestOpfs();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not restore OPFS backup.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRestoreArchive = async (archiveKey: string) => {
    if (!onRestoreArchivedBundle) return;
    setErrorMsg(null);
    setBusyAction('opfs');
    try {
      await onRestoreArchivedBundle(archiveKey);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not restore archived herd bundle.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleFileUpload = async (file: File | undefined) => {
    if (!file) return;
    setErrorMsg(null);
    setBusyAction('upload');
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.json')) {
        const check = validateUploadFileSize(file.name, file.size, MAX_JSON_BACKUP_BYTES, 'JSON backup');
        if (!check.ok) {
          setErrorMsg(check.error);
          return;
        }
        await onImportJsonReplace(await readBlobAsText(file));
      } else if (lower.endsWith('.zip')) {
        const check = validateUploadFileSize(file.name, file.size, MAX_ZIP_ARCHIVE_BYTES, 'ZIP backup');
        if (!check.ok) {
          setErrorMsg(check.error);
          return;
        }
        const buf = await readBlobAsArrayBuffer(file);
        await onImportArchiveReplace(new Uint8Array(buf), file.name);
      } else if (lower.endsWith('.sqlite') || lower.endsWith('.db') || lower.endsWith('.sqlite3')) {
        const check = validateUploadFileSize(file.name, file.size, MAX_SQLITE_DB_BYTES, 'SQLite database');
        if (!check.ok) {
          setErrorMsg(check.error);
          return;
        }
        const buf = await readBlobAsArrayBuffer(file);
        await onImportSqlite(new Uint8Array(buf));
      } else {
        setErrorMsg('Please choose a .JSON, .ZIP, or .SQLITE backup file.');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not restore selected backup file.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleStartFresh = async () => {
    setErrorMsg(null);
    setBusyAction('fresh');
    try {
      await onStartFresh();
      setConfirmStartFresh(false);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not initialize starter herds.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wiped-recovery-title"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-lg p-6 space-y-5 focus:outline-none">
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="w-5 h-5 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <h2 id="wiped-recovery-title" className="font-display text-lg font-semibold">
              Browser Storage Cleared — Restore Your Herd?
            </h2>
            <p className="text-xs text-[var(--barn-muted)]">
              The primary local database appears empty, but evidence of prior use was detected for{' '}
              <strong className="text-[var(--barn-ink)]">{priorBarnName}</strong>
              {priorAnimalCount > 0 ? ` (${priorAnimalCount} prior records)` : ''}. Sample herds
              were paused so nothing is overwritten.
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs space-y-1">
          {latest ? (
            <>
              <div className="font-semibold text-[var(--barn-ink)] flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                <span>Latest OPFS Vault Backup Available</span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                {VAULT_KIND_LABELS[latest.kind]} · {new Date(latest.createdAtIso).toLocaleString()} ·{' '}
                {latest.animalCount} animals · {latest.photoCount} photos ·{' '}
                {formatByteSizePure(latest.byteSize)}
              </div>
            </>
          ) : (
            <div className="text-[11px] text-[var(--barn-muted)]">
              {context.opfsArchivesCount > 0
                ? `Found ${context.opfsArchivesCount} archived bundle(s) in OPFS /archives, or upload an exported backup file below.`
                : 'No OPFS /backups snapshot was found in this browser origin. Upload an exported .JSON, .ZIP, or .SQLITE backup file below.'}
            </div>
          )}
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)]"
          >
            {errorMsg}
          </div>
        )}

        <div className="space-y-2.5">
          {latest && (
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void handleRestoreOpfs()}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              {busyAction === 'opfs'
                ? 'Restoring OPFS Backup...'
                : `Restore Latest OPFS Backup (${latest.animalCount} animals)`}
            </button>
          )}

          {!latest &&
            archivedHerdBundles.length > 0 &&
            onRestoreArchivedBundle &&
            archivedHerdBundles.slice(0, 3).map((bundle) => (
              <button
                key={bundle.archiveKey}
                type="button"
                disabled={busyAction !== null}
                onClick={() => void handleRestoreArchive(bundle.archiveKey)}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                {busyAction === 'opfs'
                  ? 'Restoring Archive Cohort...'
                  : `Restore Archive (${bundle.speciesSummary.join(', ') || 'Herd'} · ${bundle.animalCount} animals)`}
              </button>
            ))}

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.zip,.sqlite,.db,.sqlite3,application/json,application/zip"
            className="hidden"
            onChange={(e) => {
              void handleFileUpload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => fileInputRef.current?.click()}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-semibold hover:bg-[var(--barn-subtle)] disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            {busyAction === 'upload'
              ? 'Importing Backup File...'
              : 'Upload Backup File (.JSON / .ZIP / .SQLITE)'}
          </button>

          {confirmStartFresh ? (
            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-terracotta)] space-y-2">
              <div className="text-[11px] text-[var(--barn-ink)]">
                Starting fresh clears the prior-use flag and loads clean sample starter herds. Any
                existing OPFS backups/archives stay untouched until overwritten.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void handleStartFresh()}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-terracotta)] text-white text-xs font-semibold disabled:opacity-50"
                >
                  {busyAction === 'fresh' ? 'Initializing...' : 'Confirm Start Fresh'}
                </button>
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => setConfirmStartFresh(false)}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => setConfirmStartFresh(true)}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl text-xs font-medium text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)]"
            >
              Start Fresh (Load Sample Starter Herds)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
