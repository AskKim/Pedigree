/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Archived Herds Management Dialog (`ArchivedHerdsModal`).
 *
 * Lists compressed `.archive.zip` bundles stored in OPFS `/archives` for retired,
 * sold, or deceased livestock. Supports searching, species filtering, 1-click full
 * restore (with original status or back to Active), `.ZIP` download, permanent
 * deletion, and toggling `autoOffloadRetiredToOpfs`.
 */

import {
  Archive,
  ArchiveRestore,
  Download,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { ArchivedHerdIndexEntry } from '../core/backupVault';
import { formatByteSizePure } from '../core/imageOptimizationSpec';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';

interface ArchivedHerdsModalProps {
  isOpen: boolean;
  opfsSupported: boolean;
  archives: ArchivedHerdIndexEntry[];
  autoOffloadEnabled: boolean;
  onToggleAutoOffload: (enabled: boolean) => void;
  onRestoreArchive: (
    archiveKey: string,
    options?: { restoreToActiveStatus?: boolean; deleteArchiveAfterRestore?: boolean }
  ) => Promise<void>;
  onDownloadArchive: (archiveKey: string) => Promise<void>;
  onDeleteArchive: (archiveKey: string) => Promise<void>;
  onClose: () => void;
}

export function ArchivedHerdsModal({
  isOpen,
  opfsSupported,
  archives,
  autoOffloadEnabled,
  onToggleAutoOffload,
  onRestoreArchive,
  onDownloadArchive,
  onDeleteArchive,
  onClose,
}: ArchivedHerdsModalProps) {
  const [query, setQuery] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('all');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const dialogRef = useAccessibleDialog({ isOpen, onClose });

  const availableSpecies = useMemo(() => {
    const set = new Set<string>();
    for (const entry of archives) {
      for (const sp of entry.speciesSummary) {
        if (sp) set.add(sp);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [archives]);

  const filteredArchives = useMemo(() => {
    const q = query.trim().toLowerCase();
    return archives.filter((entry) => {
      if (
        speciesFilter !== 'all' &&
        !entry.speciesSummary.some((sp) => sp.toLowerCase() === speciesFilter.toLowerCase())
      ) {
        return false;
      }
      if (!q) return true;
      return (
        entry.speciesSummary.some((sp) => sp.toLowerCase().includes(q)) ||
        entry.animals.some(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.tattoo.toLowerCase().includes(q) ||
            a.breed.toLowerCase().includes(q) ||
            a.status.toLowerCase().includes(q) ||
            (a.buyerName || '').toLowerCase().includes(q)
        )
      );
    });
  }, [archives, query, speciesFilter]);

  if (!isOpen) return null;

  const handleRestore = async (archiveKey: string, restoreToActiveStatus: boolean) => {
    setActionError(null);
    setBusyKey(archiveKey);
    try {
      await onRestoreArchive(archiveKey, {
        restoreToActiveStatus,
        deleteArchiveAfterRestore: true,
      });
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not restore archived herd.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="archived-herds-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden focus:outline-none">
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-[var(--barn-border)]">
          <div className="space-y-0.5">
            <h2
              id="archived-herds-modal-title"
              className="font-display text-lg font-semibold flex items-center gap-2"
            >
              <Archive className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
              <span>Archived Herds (OPFS /archives)</span>
            </h2>
            <p className="text-xs text-[var(--barn-muted)]">
              Full animal records, high-resolution photos, and care logs offloaded from active
              SQLite memory. Ancestor-linked records keep lightweight Pedigree Reference stubs.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Archived Herds dialog"
            className="min-h-[40px] min-w-[40px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <label className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={autoOffloadEnabled}
              disabled={!opfsSupported}
              onChange={(e) => onToggleAutoOffload(e.target.checked)}
              className="mt-0.5 rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
            />
            <span>
              <strong className="text-[var(--barn-ink)]">
                Automatically offload Sold &amp; Deceased animals to OPFS /archives on save
              </strong>
              <span className="block text-[11px] text-[var(--barn-muted)] mt-0.5">
                Moves heavy photos and care logs into compressed `.archive.zip` bundles cleanly
                without breaking sire/dam ancestry trees.
              </span>
            </span>
          </label>

          {archives.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1">
                <Search
                  className="w-4 h-4 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="Search archived herds"
                  placeholder="Search by animal name, tattoo, breed, buyer, or status..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                />
              </div>

              <select
                aria-label="Filter archives by species"
                value={speciesFilter}
                onChange={(e) => setSpeciesFilter(e.target.value)}
                className="min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
              >
                <option value="all">All Species ({archives.length})</option>
                {availableSpecies.map((sp) => (
                  <option key={sp} value={sp}>
                    {sp}
                  </option>
                ))}
              </select>
            </div>
          )}

          {actionError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)]"
            >
              {actionError}
            </div>
          )}

          {!opfsSupported ? (
            <div className="p-5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-muted)]">
              Origin Private File System (OPFS) directory access is not supported in this browser.
              Sold and Deceased records remain stored in your local Herd Archived tab.
            </div>
          ) : filteredArchives.length === 0 ? (
            <div className="p-6 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-center text-xs text-[var(--barn-muted)]">
              {archives.length === 0
                ? 'No animals have been offloaded to OPFS /archives yet. Mark an animal Sold or Deceased, or select animals in Herd Registry -> Offload to OPFS /archives.'
                : 'No archived bundles match your current filter.'}
            </div>
          ) : (
            <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl bg-[var(--barn-canvas)] overflow-hidden">
              {filteredArchives.map((bundle) => {
                const isBusy = busyKey === bundle.archiveKey;
                const isConfirmDelete = confirmDeleteKey === bundle.archiveKey;
                const stubCount = bundle.animals.filter((a) => a.hasPedigreeStubInDb).length;

                return (
                  <div key={bundle.archiveKey} className="p-4 space-y-2.5 text-xs">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-semibold text-[var(--barn-ink)]">
                          {bundle.speciesSummary.join(', ')} · {bundle.animalCount} animal
                          {bundle.animalCount === 1 ? '' : 's'}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                          Archived {new Date(bundle.createdAtIso).toLocaleString()} ·{' '}
                          {bundle.photoCount} photo{bundle.photoCount === 1 ? '' : 's'} ·{' '}
                          {bundle.careLogCount} care log{bundle.careLogCount === 1 ? '' : 's'} ·{' '}
                          {formatByteSizePure(bundle.byteSize)}
                          {stubCount > 0 ? ` · ${stubCount} pedigree stub(s) linked` : ''}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {isConfirmDelete ? (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                setConfirmDeleteKey(null);
                                void onDeleteArchive(bundle.archiveKey);
                              }}
                              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold whitespace-nowrap"
                            >
                              Confirm Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteKey(null)}
                              className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleRestore(bundle.archiveKey, true)}
                              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                            >
                              <ArchiveRestore className="w-3.5 h-3.5" aria-hidden="true" />
                              {isBusy ? 'Restoring...' : 'Restore to Active'}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleRestore(bundle.archiveKey, false)}
                              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap disabled:opacity-50"
                            >
                              Restore as Archived
                            </button>
                            <button
                              type="button"
                              onClick={() => void onDownloadArchive(bundle.archiveKey)}
                              aria-label={`Download ${bundle.fileName}`}
                              className="min-h-[38px] min-w-[38px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center"
                            >
                              <Download className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteKey(bundle.archiveKey)}
                              aria-label={`Delete archive ${bundle.fileName}`}
                              className="min-h-[38px] min-w-[38px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 pl-2 border-l border-[var(--barn-border)]">
                      {bundle.animals.map((a) => (
                        <div
                          key={a.id}
                          className="text-[11px] text-[var(--barn-muted)] flex flex-wrap items-center gap-x-1.5"
                        >
                          <strong className="text-[var(--barn-ink)] font-medium">{a.name}</strong>
                          <span className="font-mono">({a.tattoo || 'No ID'})</span>
                          <span>·</span>
                          <span>{a.status}</span>
                          {a.breed && (
                            <>
                              <span>·</span>
                              <span>
                                {a.breed} {a.variety}
                              </span>
                            </>
                          )}
                          {a.buyerName && (
                            <>
                              <span>·</span>
                              <span>Buyer: {a.buyerName}</span>
                            </>
                          )}
                          {a.deathCause && (
                            <>
                              <span>·</span>
                              <span>Cause: {a.deathCause}</span>
                            </>
                          )}
                          {a.hasPedigreeStubInDb && (
                            <>
                              <span>·</span>
                              <span className="text-[var(--barn-sage)] font-medium">
                                Pedigree Reference stub retained
                              </span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
