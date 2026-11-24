# Codebase Export: AskKim/Pedigree (Part 8 of 16)

- **Branch:** `main`
- **Commit:** `847f8ec8a2fc88e92ecb94065d96cf1277189c07`
- **Generated (UTC):** 2026-11-21 17:00:43 UTC
- **Files in this part:** 15 (`src/components/WipedStorageRecoveryModal.tsx` -> `src/core/carrierGenetics.ts`)
- **Index:** [index.md](./index.md)

---
## `src/components/WipedStorageRecoveryModal.tsx`

```tsx
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
import { formatByteSizePure } from '../core/imageOptimizationSpec';
import {
  MAX_JSON_BACKUP_BYTES,
  MAX_SQLITE_DB_BYTES,
  MAX_ZIP_ARCHIVE_BYTES,
  validateUploadFileSize,
} from '../core/inputSanitization';
import { ArchivedHerdIndexEntry, VAULT_KIND_LABELS } from '../core/backupVault';
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
```

## `src/components/WoolHarvestPanel.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Lazy-loaded Wool / Fiber Harvests & IAGARB 100-Point Judging Scorecard Panel.
 *
 * Strictly isolated from initial Herd Registry / Species Hub bundles and mounted ONLY
 * when `isWoolModuleEnabledForSpecies(speciesProfile)` is true.
 */

import { Loader2, Plus, Scissors, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import {
  formatReadableDate,
  IagarbScorecard,
  SpeciesProfile,
  todayDateIso,
  WOOL_HARVEST_METHODS,
  WoolHarvest,
  WoolHarvestMethod,
} from '../core/models';
import {
  compute90DayEquivalentGrams,
  computeDaysBetweenDateIso,
  computeIagarbScoreTotal,
  evaluateIagarbEligibility,
  IAGARB_JUDGING_POSITIONS,
  summarizeAnimalWoolHarvests,
} from '../core/woolFiber';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';

export interface WoolHarvestPanelProps {
  speciesProfile: SpeciesProfile;
  animalId: string;
  animalWoolHarvests: WoolHarvest[];
  onSaveWoolHarvest?: (
    draft: Omit<WoolHarvest, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<string | null> | void;
  onDeleteWoolHarvest?: (id: string) => Promise<void> | void;
}

function safeNonNegNumber(
  raw: string,
  roundInt = false,
  max = Number.MAX_SAFE_INTEGER
): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return 0;
  const bounded = Math.min(max, num);
  return roundInt ? Math.round(bounded) : bounded;
}

function makeEmptyIagarbScorecard(): IagarbScorecard {
  return {
    weightPts: 0,
    bodyTypePts: 0,
    densityLengthPts: 0,
    uniformityPts: 0,
    texturePts: 0,
    furnishingsPts: 0,
    conditionPts: 0,
    totalPts: 0,
    evaluatorName: '',
    evaluationDateIso: '',
  };
}

export function WoolHarvestPanel({
  speciesProfile,
  animalId,
  animalWoolHarvests,
  onSaveWoolHarvest,
  onDeleteWoolHarvest,
}: WoolHarvestPanelProps) {
  const woolSummary = useMemo(
    () => summarizeAnimalWoolHarvests(animalWoolHarvests, animalId),
    [animalWoolHarvests, animalId]
  );

  const [showWoolForm, setShowWoolForm] = useState(false);
  const [woolDateIso, setWoolDateIso] = useState(() => todayDateIso());
  const [woolIntervalDays, setWoolIntervalDays] = useState('90');
  const [woolPrimeGrams, setWoolPrimeGrams] = useState('');
  const [woolGradeGrams, setWoolGradeGrams] = useState('');
  const [woolMethod, setWoolMethod] = useState<WoolHarvestMethod>('Shear');
  const [woolStapleMm, setWoolStapleMm] = useState('');
  const [woolWitnessedBy, setWoolWitnessedBy] = useState('');
  const [woolNotes, setWoolNotes] = useState('');
  const [showIagarbScorecard, setShowIagarbScorecard] = useState(false);
  const [woolIagarbScore, setWoolIagarbScore] = useState<IagarbScorecard>(
    makeEmptyIagarbScorecard
  );
  const woolSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });

  const resetWoolFields = () => {
    setWoolDateIso(todayDateIso());
    setWoolIntervalDays('90');
    setWoolPrimeGrams('');
    setWoolGradeGrams('');
    setWoolMethod('Shear');
    setWoolStapleMm('');
    setWoolWitnessedBy('');
    setWoolNotes('');
    setShowIagarbScorecard(false);
    setWoolIagarbScore(makeEmptyIagarbScorecard());
  };

  useEffect(() => {
    setShowWoolForm(false);
    resetWoolFields();
  }, [speciesProfile.id, animalId]);

  const submitWoolHarvest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveWoolHarvest) return;
    await woolSubmitLock.runLocked(async () => {
      const prime = safeNonNegNumber(woolPrimeGrams, true, 100_000);
      const grade = safeNonNegNumber(woolGradeGrams, true, 100_000);
      const interval = safeNonNegNumber(woolIntervalDays, true, 1825);
      const staple = safeNonNegNumber(woolStapleMm, false, 1000);
      const hasIagarbFields = Object.values(woolIagarbScore).some(
        (v) => typeof v === 'number' && Number.isFinite(v) && v > 0
      );
      await onSaveWoolHarvest({
        species: speciesProfile.name,
        animalId,
        harvestDateIso: woolDateIso || todayDateIso(),
        shearingIntervalDays: interval > 0 ? interval : undefined,
        primeWeightGrams: prime,
        gradeWeightGrams: grade,
        harvestMethod: woolMethod,
        stapleLengthMm: staple > 0 ? staple : undefined,
        iagarbScore:
          showIagarbScorecard && hasIagarbFields
            ? {
                ...woolIagarbScore,
                totalPts: computeIagarbScoreTotal(woolIagarbScore),
                evaluatorName: woolWitnessedBy.trim(),
                evaluationDateIso: woolDateIso || todayDateIso(),
              }
            : undefined,
        witnessedBy: woolWitnessedBy.trim(),
        notes: woolNotes.trim(),
      });
      resetWoolFields();
      setShowWoolForm(false);
    });
  };

  return (
    <div className="border-t border-[var(--barn-border)] pt-5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold inline-flex items-center gap-1.5">
            <Scissors className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
            <span>Wool / Fiber Harvests &amp; IAGARB Scoring</span>
          </h3>
          <p className="text-xs text-[var(--barn-muted)]">
            Track prime &amp; grade fleece weights (g), 90-day shearing yield vs. 325g benchmark, and IAGARB 7-position scores.
          </p>
        </div>
        {onSaveWoolHarvest && (
          <button
            type="button"
            aria-expanded={showWoolForm}
            onClick={() => setShowWoolForm((v) => !v)}
            className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Log Wool Harvest
          </button>
        )}
      </div>

      {woolSummary.harvestCount > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs">
          <div>
            <div className="text-[11px] text-[var(--barn-muted)]">Lifetime Total</div>
            <div className="font-mono font-semibold tabular-nums mt-0.5">
              {woolSummary.totalGrams} g ({woolSummary.harvestCount} clip{woolSummary.harvestCount === 1 ? '' : 's'})
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--barn-muted)]">Prime vs Grade</div>
            <div className="font-mono font-semibold tabular-nums mt-0.5">
              {woolSummary.primeGrams}g Prime / {woolSummary.gradeGrams}g Grade
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--barn-muted)]">Latest 90-Day Rate</div>
            <div className="font-mono font-semibold tabular-nums mt-0.5">
              {woolSummary.latest90DayRateGrams !== null
                ? `${woolSummary.latest90DayRateGrams} g/90d`
                : '—'}
              {woolSummary.eligibility.meets90DayYieldThreshold && (
                <span className="ml-1.5 text-[11px] font-medium text-[var(--barn-sage)]">
                  · ≥325g Pass
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--barn-muted)]">Best IAGARB Score</div>
            <div className="font-mono font-semibold tabular-nums mt-0.5">
              {woolSummary.highestIagarbScore !== null
                ? `${woolSummary.highestIagarbScore.totalPts}/100`
                : '—'}
              {woolSummary.eligibility.meetsPointsThreshold && (
                <span className="ml-1.5 text-[11px] font-medium text-[var(--barn-sage)]">
                  · Reg Eligible
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {showWoolForm && onSaveWoolHarvest && (
        <form
          onSubmit={submitWoolHarvest}
          className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3 text-xs"
        >
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <label className="space-y-1">
              <span className="text-[11px] text-[var(--barn-muted)]">Harvest Date</span>
              <input
                type="date"
                required
                value={woolDateIso}
                onChange={(e) => {
                  const nextDate = e.target.value;
                  setWoolDateIso(nextDate);
                  const lastDate = animalWoolHarvests[0]?.harvestDateIso;
                  if (lastDate && nextDate) {
                    const diff = computeDaysBetweenDateIso(lastDate, nextDate);
                    if (diff !== null && diff > 0) setWoolIntervalDays(String(diff));
                  }
                }}
                className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-[var(--barn-muted)]">Interval (Days)</span>
              <input
                type="number"
                min="0"
                max="1825"
                placeholder="90"
                value={woolIntervalDays}
                onChange={(e) => setWoolIntervalDays(e.target.value)}
                className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono tabular-nums"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-[var(--barn-muted)]">Prime Weight (g)</span>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 285"
                value={woolPrimeGrams}
                onChange={(e) => setWoolPrimeGrams(e.target.value)}
                className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono tabular-nums"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-[var(--barn-muted)]">Grade / Seconds (g)</span>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 60"
                value={woolGradeGrams}
                onChange={(e) => setWoolGradeGrams(e.target.value)}
                className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono tabular-nums"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <label className="space-y-1">
              <span className="text-[11px] text-[var(--barn-muted)]">Method</span>
              <select
                value={woolMethod}
                onChange={(e) => setWoolMethod(e.target.value as WoolHarvestMethod)}
                className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]"
              >
                {WOOL_HARVEST_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-[var(--barn-muted)]">Staple Length (mm)</span>
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="e.g. 75"
                value={woolStapleMm}
                onChange={(e) => setWoolStapleMm(e.target.value)}
                className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono tabular-nums"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-[var(--barn-muted)]">Witnessed By / Judge</span>
              <input
                type="text"
                placeholder="Registrar / judge name (optional)"
                value={woolWitnessedBy}
                onChange={(e) => setWoolWitnessedBy(e.target.value)}
                className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]"
              />
            </label>
          </div>

          {(() => {
            const p = Number(woolPrimeGrams) || 0;
            const g = Number(woolGradeGrams) || 0;
            const d = Number(woolIntervalDays) || 0;
            const eq90 = compute90DayEquivalentGrams(p + g, d);
            const totalPts = computeIagarbScoreTotal(woolIagarbScore);
            const elig = evaluateIagarbEligibility(
              showIagarbScorecard ? totalPts : 0,
              eq90
            );
            return (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]">
                <span className="font-mono text-[11px] tabular-nums">
                  Total Clip: <strong>{Math.round(p + g)} g</strong>
                  {eq90 !== null ? ` · 90-Day Est: ${eq90} g` : ''}
                </span>
                <span className="text-[11px] font-medium text-[var(--barn-sage)]">
                  {elig.statusLabel}
                </span>
              </div>
            );
          })()}

          <div>
            <button
              type="button"
              onClick={() => setShowIagarbScorecard((v) => !v)}
              className="text-xs font-medium text-[var(--barn-sage)] hover:underline"
            >
              {showIagarbScorecard
                ? '− Hide IAGARB 7-Position Judging Scorecard'
                : '+ Add IAGARB 7-Position Judging Scorecard (100-Pt Scale)'}
            </button>
          </div>

          {showIagarbScorecard && (
            <div className="p-3 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">IAGARB 7-Position Scorecard</span>
                <span className="font-mono font-semibold tabular-nums">
                  Total: {computeIagarbScoreTotal(woolIagarbScore)} / 100 (Min 80 for Reg)
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {IAGARB_JUDGING_POSITIONS.map((pos) => (
                  <label key={pos.key} className="space-y-0.5">
                    <span
                      className="text-[11px] text-[var(--barn-muted)] block truncate"
                      title={pos.guidance}
                    >
                      {pos.label} (/{pos.maxPoints})
                    </span>
                    <input
                      type="number"
                      min="0"
                      max={pos.maxPoints}
                      step="0.5"
                      value={woolIagarbScore[pos.key] || ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const val =
                          raw === ''
                            ? 0
                            : Math.min(pos.maxPoints, Math.max(0, Number(raw) || 0));
                        setWoolIagarbScore((prev) => ({
                          ...prev,
                          [pos.key]: val,
                        }));
                      }}
                      className="w-full min-h-[34px] px-2 py-1 rounded-md bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          <input
            type="text"
            aria-label="Wool harvest notes"
            placeholder="Optional fleece quality notes (crimps, web density, matting)..."
            value={woolNotes}
            onChange={(e) => setWoolNotes(e.target.value)}
            className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowWoolForm(false)}
              className="min-h-[36px] px-3 py-1 rounded-lg border border-[var(--barn-border)] font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={woolSubmitLock.isSubmitting}
              aria-busy={woolSubmitLock.isSubmitting}
              className="min-h-[36px] px-4 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold disabled:opacity-55 inline-flex items-center gap-1.5"
            >
              {woolSubmitLock.isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Harvest
            </button>
          </div>
        </form>
      )}

      {animalWoolHarvests.length > 0 && (
        <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl bg-[var(--barn-surface)]">
          {animalWoolHarvests.map((wh) => {
            const total = wh.primeWeightGrams + wh.gradeWeightGrams;
            const eq90 = compute90DayEquivalentGrams(total, wh.shearingIntervalDays);
            const pts = wh.iagarbScore ? computeIagarbScoreTotal(wh.iagarbScore) : null;
            return (
              <div
                key={wh.id}
                className="px-3 py-2.5 flex items-start justify-between gap-2 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5 font-medium">
                    <span className="font-mono">{formatReadableDate(wh.harvestDateIso)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{wh.harvestMethod}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums font-semibold">
                      {total} g total ({wh.primeWeightGrams}g Prime / {wh.gradeWeightGrams}g Grade)
                    </span>
                    {eq90 !== null && (
                      <span className="font-mono text-[11px] text-[var(--barn-muted)] tabular-nums">
                        · {eq90} g/90d
                      </span>
                    )}
                    {pts !== null && (
                      <span
                        className={`font-mono text-[11px] font-semibold tabular-nums ${
                          pts >= 80 ? 'text-[var(--barn-sage)]' : 'text-[var(--barn-muted)]'
                        }`}
                      >
                        · IAGARB {pts}/100
                      </span>
                    )}
                  </div>
                  {(wh.stapleLengthMm || wh.witnessedBy || wh.notes) && (
                    <div className="text-[11px] text-[var(--barn-muted)]">
                      {wh.stapleLengthMm ? `Staple ${wh.stapleLengthMm} mm` : ''}
                      {wh.stapleLengthMm && wh.witnessedBy ? ' · ' : ''}
                      {wh.witnessedBy ? `Witnessed by ${wh.witnessedBy}` : ''}
                      {(wh.stapleLengthMm || wh.witnessedBy) && wh.notes ? ' · ' : ''}
                      {wh.notes}
                    </div>
                  )}
                </div>
                {onDeleteWoolHarvest && (
                  <button
                    type="button"
                    onClick={() => onDeleteWoolHarvest(wh.id)}
                    aria-label="Delete wool harvest"
                    className="min-h-[36px] min-w-[36px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default WoolHarvestPanel;
```

## `src/core/alternativeCertificates.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Alternative Certificate Generators (`src/core/alternativeCertificates.ts`).
 *
 * Produces printable self-contained `.HTM` documents for:
 * 1. Pet-Sale Birth Certificate — strictly omits breeder contact info, pricing, stud terms,
 *    and breeder certification/contact footers so pet homes get a warm keepsake birth record.
 * 2. Breeding / Service Certificate — documents Sire, Dam, service dates, projected due date,
 *    litter outcomes (if born), service fee info, COI, and owner certification signatures.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) dependencies.
 */

import { escapeSafeHtml, sanitizeSafeRasterImageDataUrl } from './inputSanitization';
import {
  Animal,
  BarnSettings,
  BreedingRecord,
  formatBreedingStatusForSpecies,
  formatCurrencyCents,
  formatReadableDate,
  formatSexForSpecies,
  formatWeight,
  normalizeCurrencyCode,
  nowIsoUtc,
  resolveSpeciesProfile,
  resolveSpeciesWeightUnit,
  SpeciesProfile,
} from './models';
import { PedigreeColorPresetId, resolvePedigreePrintTheme } from './pedigreePrintStyles';

export interface PetBirthCertificateOptions {
  /** Optional companion family / adopter name printed on the certificate. */
  companionFamilyName?: string;
  /** Optional keepsake message (falls back to a gentle companion blessing). */
  keepsakeMessage?: string;
  /** Optional photo data URL for the animal's portrait. */
  primaryPhotoDataUrl?: string;
  /** Color theme preset (all backgrounds remain crisp #FFFFFF). */
  colorPreset?: PedigreeColorPresetId;
}

export function buildPetBirthCertificateFileName(animal: Animal): string {
  const slug = (animal.name || animal.tattoo || animal.id || 'pet')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `birth-certificate-${slug || 'pet'}.htm`;
}

/**
 * Generates a pet-sale Birth Certificate `.HTM` document.
 * Intentionally omits all breeder contact info, phone/email/website footers, and commercial pricing.
 */
export function generatePetBirthCertificateHtml(
  animal: Animal,
  allAnimals: Animal[],
  speciesProfiles: SpeciesProfile[],
  settings: BarnSettings,
  options?: PetBirthCertificateOptions
): string {
  const sp = resolveSpeciesProfile(animal.species, speciesProfiles);
  const theme = resolvePedigreePrintTheme(
    { colorPreset: options?.colorPreset ?? 'classic_sage' },
    settings.customColors
  );
  const safePhoto = sanitizeSafeRasterImageDataUrl(options?.primaryPhotoDataUrl);
  const sire = animal.sireId
    ? allAnimals.find((a) => a.id === animal.sireId && a.species.toLowerCase() === animal.species.toLowerCase())
    : undefined;
  const dam = animal.damId
    ? allAnimals.find((a) => a.id === animal.damId && a.species.toLowerCase() === animal.species.toLowerCase())
    : undefined;

  const companionHome = (options?.companionFamilyName || animal.buyerName || '').trim();
  const keepsakeMessage = (
    options?.keepsakeMessage ||
    `Presented as a keepsake companion birth record for ${animal.name || 'your new companion'}. May you share many happy, healthy years together.`
  ).trim();
  const sexDisplay = formatSexForSpecies(animal.sex, sp);
  const effectiveWeightUnit = resolveSpeciesWeightUnit(sp, settings);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light only" />
<meta name="barn-page-orientation" content="landscape" />
<title>Birth Certificate - ${escapeSafeHtml(animal.name)}</title>
<style>
  @page { size: letter landscape; margin: 12mm; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: ${theme.inkHex}; margin: 0; padding: 0; }
  body { font-family: Georgia, "Times New Roman", serif; padding: 18px; max-width: 10.2in; margin: 0 auto; }
  .cert-outer { border: 4px double ${theme.borderHex}; border-radius: 12px; padding: 22px 28px; background: #ffffff; box-sizing: border-box; }
  .cert-inner { border: 1px solid ${theme.cellBorderHex}; border-radius: 8px; padding: 22px 26px; background: #ffffff; }
  .banner { text-align: center; border-bottom: 1.5px solid ${theme.borderHex}; padding-bottom: 14px; margin-bottom: 18px; }
  .eyebrow { font-family: Arial, Helvetica, sans-serif; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: ${theme.accentHex}; margin-bottom: 6px; font-weight: bold; }
  .title { font-size: 30px; font-weight: bold; color: ${theme.primaryHex}; margin: 0; letter-spacing: 0.03em; }
  .subtitle { font-size: 13px; color: ${theme.mutedInkHex}; margin-top: 4px; font-style: italic; }
  .hero { display: flex; align-items: center; gap: 22px; margin-bottom: 18px; flex-wrap: wrap; }
  .portrait { width: 132px; height: 132px; object-fit: cover; border-radius: 14px; border: 2px solid ${theme.borderHex}; flex-shrink: 0; }
  .pet-focus { flex: 1; min-width: 240px; }
  .pet-name { font-size: 28px; font-weight: bold; color: ${theme.primaryHex}; margin: 0 0 6px 0; }
  .pet-tagline { font-size: 14px; color: ${theme.inkHex}; line-height: 1.45; }
  .details-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 16px; border: 1px solid ${theme.cellBorderHex}; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; background: #ffffff; }
  .field-label { font-family: Arial, Helvetica, sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: ${theme.mutedInkHex}; margin-bottom: 2px; }
  .field-value { font-size: 13.5px; font-weight: bold; color: ${theme.inkHex}; }
  .parents-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
  .parent-box { border: 1px solid ${theme.cellBorderHex}; border-radius: 8px; padding: 10px 14px; }
  .parent-box.sire { border-left: 4px solid ${theme.sireHex}; }
  .parent-box.dam { border-left: 4px solid ${theme.damHex}; }
  .keepsake { text-align: center; font-style: italic; font-size: 13px; line-height: 1.55; color: ${theme.mutedInkHex}; border-top: 1px solid ${theme.cellBorderHex}; padding-top: 14px; margin-top: 6px; }
  .companion-line { text-align: center; font-size: 13.5px; color: ${theme.primaryHex}; font-weight: bold; margin-bottom: 10px; }
  .issued-note { text-align: center; font-family: Arial, Helvetica, sans-serif; font-size: 10.5px; color: ${theme.mutedInkHex}; margin-top: 12px; }
  @media print {
    body { padding: 0; max-width: none; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style>
</head>
<body>
  <div class="cert-outer">
    <div class="cert-inner">
      <div class="banner">
        <div class="eyebrow">Companion Livestock Keepsake</div>
        <h1 class="title">Certificate of Birth</h1>
        <div class="subtitle">Official Companion ${escapeSafeHtml(sp.name)} Birth Record</div>
      </div>

      <div class="hero">
        ${safePhoto ? `<img class="portrait" src="${safePhoto}" alt="${escapeSafeHtml(animal.name)}" />` : ''}
        <div class="pet-focus">
          <h2 class="pet-name">${escapeSafeHtml(animal.name || 'Unnamed Companion')}</h2>
          <div class="pet-tagline">
            This certifies the birth of <strong>${escapeSafeHtml(animal.name || 'this companion')}</strong>, a
            <strong>${escapeSafeHtml(animal.variety ? `${animal.variety} ` : '')}${escapeSafeHtml(animal.breed || sp.name)}</strong>
            (${escapeSafeHtml(sexDisplay)}), born on
            <strong>${escapeSafeHtml(formatReadableDate(animal.birthDateIso))}</strong>.
          </div>
        </div>
      </div>

      <div class="details-grid">
        <div>
          <div class="field-label">Birth Date</div>
          <div class="field-value">${escapeSafeHtml(formatReadableDate(animal.birthDateIso))}</div>
        </div>
        <div>
          <div class="field-label">Breed &amp; Coat Variety</div>
          <div class="field-value">${escapeSafeHtml([animal.breed, animal.variety].filter(Boolean).join(' · ') || sp.name)}</div>
        </div>
        <div>
          <div class="field-label">Sex</div>
          <div class="field-value">${escapeSafeHtml(sexDisplay)}</div>
        </div>
        <div>
          <div class="field-label">Identification / Ear ID</div>
          <div class="field-value">${escapeSafeHtml(animal.tattoo || 'Companion Pet (Unmarked)')}</div>
        </div>
        <div>
          <div class="field-label">Species</div>
          <div class="field-value">${escapeSafeHtml(sp.name)}</div>
        </div>
        <div>
          <div class="field-label">Recorded Weight</div>
          <div class="field-value">${animal.weightGrams > 0 ? escapeSafeHtml(formatWeight(animal.weightGrams, effectiveWeightUnit)) : 'Not Recorded'}</div>
        </div>
      </div>

      <div class="parents-row">
        <div class="parent-box sire">
          <div class="field-label">Father (${escapeSafeHtml(sp.maleLabel)})</div>
          <div class="field-value">${escapeSafeHtml(sire ? `${sire.name}${sire.variety ? ` (${sire.variety})` : ''}` : 'Not Listed')}</div>
        </div>
        <div class="parent-box dam">
          <div class="field-label">Mother (${escapeSafeHtml(sp.femaleLabel)})</div>
          <div class="field-value">${escapeSafeHtml(dam ? `${dam.name}${dam.variety ? ` (${dam.variety})` : ''}` : 'Not Listed')}</div>
        </div>
      </div>

      ${
        companionHome
          ? `<div class="companion-line">Welcomed Home By: ${escapeSafeHtml(companionHome)}</div>`
          : ''
      }

      <div class="keepsake">${escapeSafeHtml(keepsakeMessage)}</div>
      <div class="issued-note">Companion Birth Record Issued ${escapeSafeHtml(formatReadableDate(nowIsoUtc().slice(0, 10)))}</div>
    </div>
  </div>
</body>
</html>`;
}

export interface BreedingCertificateOptions {
  breederContactLine?: string;
  showBreederLogo?: boolean;
  breederLogoDataUrl?: string;
  studOwnerName?: string;
  damOwnerName?: string;
  serviceNotes?: string;
  colorPreset?: PedigreeColorPresetId;
}

export function buildBreedingCertificateFileName(breeding: BreedingRecord): string {
  const slug = `${breeding.sireName || 'sire'}-x-${breeding.damName || 'dam'}-${breeding.bredDateIso || 'service'}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `breeding-certificate-${slug || breeding.id}.htm`;
}

/**
 * Generates an official printable `.HTM` Breeding / Service Certificate directly from a `BreedingRecord`.
 */
export function generateBreedingCertificateHtml(
  breeding: BreedingRecord,
  sire: Animal | undefined,
  dam: Animal | undefined,
  speciesProfile: SpeciesProfile,
  settings: BarnSettings,
  options?: BreedingCertificateOptions
): string {
  const theme = resolvePedigreePrintTheme(
    { colorPreset: options?.colorPreset ?? 'classic_sage' },
    settings.customColors
  );
  const showLogo = options?.showBreederLogo ?? true;
  const rawLogo =
    options?.breederLogoDataUrl !== undefined
      ? options.breederLogoDataUrl
      : settings.breederLogoDataUrl;
  const safeLogo = showLogo ? sanitizeSafeRasterImageDataUrl(rawLogo) : '';
  const contactLine = (options?.breederContactLine || '').trim();
  const studOwner = (options?.studOwnerName || sire?.ownerName || settings.breederName || settings.barnName || '').trim();
  const damOwner = (options?.damOwnerName || dam?.ownerName || settings.breederName || settings.barnName || '').trim();
  const statusDisplay = formatBreedingStatusForSpecies(breeding.status, speciesProfile);
  const currency = normalizeCurrencyCode(settings.currencyCode, 'USD');
  const serviceFeeDisplay =
    breeding.serviceFeeCents && breeding.serviceFeeCents > 0
      ? `${formatCurrencyCents(breeding.serviceFeeCents, currency)}${
          breeding.serviceFeeDirection === 'earned'
            ? ' (Stud Fee Received)'
            : breeding.serviceFeeDirection === 'paid'
            ? ' (Stud Fee Paid)'
            : ''
        }`
      : 'None / In-Barn Pairing';
  const notesDisplay = (options?.serviceNotes ?? breeding.notes ?? '').trim();

  const renderAnimalCard = (
    roleTitle: string,
    roleClass: 'sire' | 'dam',
    animal: Animal | undefined,
    fallbackName: string,
    ownerLabel: string
  ): string => `<div class="animal-card ${roleClass}">
    <div class="card-role">${escapeSafeHtml(roleTitle)}</div>
    <div class="card-name">${escapeSafeHtml(animal?.name || fallbackName || 'Unknown')}</div>
    <div class="card-meta"><strong>Tattoo / ID:</strong> ${escapeSafeHtml(animal?.tattoo || 'Unmarked')}</div>
    <div class="card-meta"><strong>Breed &amp; Variety:</strong> ${escapeSafeHtml([animal?.breed, animal?.variety].filter(Boolean).join(' · ') || '—')}</div>
    <div class="card-meta"><strong>Reg # / GC #:</strong> ${escapeSafeHtml([animal?.registrationNumber ? `Reg ${animal.registrationNumber}` : '', animal?.grandChampionNumber ? `GC ${animal.grandChampionNumber}` : ''].filter(Boolean).join(' · ') || 'Unregistered')}</div>
    <div class="card-meta"><strong>Breeder:</strong> ${escapeSafeHtml(animal?.breederName || '—')}</div>
    <div class="card-meta"><strong>Owner:</strong> ${escapeSafeHtml(ownerLabel || animal?.ownerName || '—')}</div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light only" />
<meta name="barn-page-orientation" content="portrait" />
<title>Breeding Certificate - ${escapeSafeHtml(breeding.sireName)} x ${escapeSafeHtml(breeding.damName)}</title>
<style>
  @page { size: letter portrait; margin: 12mm; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: ${theme.inkHex}; margin: 0; padding: 0; }
  body { font-family: Georgia, "Times New Roman", serif; padding: 16px; max-width: 8.2in; margin: 0 auto; }
  .frame { border: 3px double ${theme.borderHex}; padding: 20px 24px; background: #ffffff; }
  .header { display: flex; justify-content: space-between; align-items: center; gap: 14px; border-bottom: 2px solid ${theme.borderHex}; padding-bottom: 12px; margin-bottom: 16px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .logo { max-height: 48px; max-width: 120px; object-fit: contain; border-radius: 4px; }
  .title { font-size: 22px; font-weight: bold; color: ${theme.primaryHex}; margin: 0; }
  .subtitle { font-size: 12px; color: ${theme.mutedInkHex}; margin-top: 2px; }
  .animals-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-bottom: 16px; }
  .animal-card { border: 1px solid ${theme.cellBorderHex}; border-radius: 6px; padding: 12px 14px; background: #ffffff; }
  .animal-card.sire { border-left: 4px solid ${theme.sireHex}; }
  .animal-card.dam { border-left: 4px solid ${theme.damHex}; }
  .card-role { font-family: Arial, Helvetica, sans-serif; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; color: ${theme.mutedInkHex}; margin-bottom: 4px; }
  .card-name { font-size: 17px; font-weight: bold; color: ${theme.primaryHex}; margin-bottom: 6px; }
  .card-meta { font-size: 12px; line-height: 1.45; color: ${theme.inkHex}; }
  .facts-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 14px; border: 1px solid ${theme.cellBorderHex}; border-radius: 6px; padding: 12px 14px; margin-bottom: 16px; }
  .fact-label { font-family: Arial, Helvetica, sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: ${theme.mutedInkHex}; margin-bottom: 2px; }
  .fact-val { font-size: 13px; font-weight: bold; color: ${theme.inkHex}; }
  .notes-box { border: 1px solid ${theme.cellBorderHex}; border-radius: 6px; padding: 10px 14px; margin-bottom: 18px; font-size: 12px; line-height: 1.45; }
  .cert-clause { font-size: 12px; line-height: 1.5; color: ${theme.inkHex}; margin-bottom: 20px; }
  .sigs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin-top: 22px; }
  .sig-block { border-top: 1px solid ${theme.inkHex}; padding-top: 6px; font-size: 11px; color: ${theme.mutedInkHex}; }
  .footer-meta { margin-top: 16px; border-top: 1px solid ${theme.cellBorderHex}; padding-top: 8px; display: flex; justify-content: space-between; font-size: 10.5px; color: ${theme.mutedInkHex}; flex-wrap: wrap; gap: 8px; }
  @media print {
    body { padding: 0; max-width: none; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style>
</head>
<body>
  <div class="frame">
    <div class="header">
      <div class="brand">
        ${safeLogo ? `<img class="logo" src="${safeLogo}" alt="${escapeSafeHtml(settings.barnName || 'Barn Logo')}" />` : ''}
        <div>
          <h1 class="title">Official Breeding Certificate</h1>
          <div class="subtitle">${escapeSafeHtml(settings.barnName || 'Community Pedigree')} &middot; ${escapeSafeHtml(speciesProfile.name)} Service Record</div>
        </div>
      </div>
      <div class="subtitle">Record ID: ${escapeSafeHtml(breeding.id.slice(0, 12))}</div>
    </div>

    <div class="animals-grid">
      ${renderAnimalCard(
        `Sire (${speciesProfile.maleLabel})`,
        'sire',
        sire,
        breeding.sireName,
        studOwner
      )}
      ${renderAnimalCard(
        `Dam (${speciesProfile.femaleLabel})`,
        'dam',
        dam,
        breeding.damName,
        damOwner
      )}
    </div>

    <div class="facts-grid">
      <div>
        <div class="fact-label">Service / Bred Date</div>
        <div class="fact-val">${escapeSafeHtml(formatReadableDate(breeding.bredDateIso))}</div>
      </div>
      <div>
        <div class="fact-label">Expected Due Date</div>
        <div class="fact-val">${escapeSafeHtml(formatReadableDate(breeding.expectedDueDateIso))}</div>
      </div>
      <div>
        <div class="fact-label">Actual ${escapeSafeHtml(speciesProfile.birthEventLabel)} Date</div>
        <div class="fact-val">${breeding.actualBirthDateIso ? escapeSafeHtml(formatReadableDate(breeding.actualBirthDateIso)) : 'Pending / Not Recorded'}</div>
      </div>
      <div>
        <div class="fact-label">Breeding Status</div>
        <div class="fact-val">${escapeSafeHtml(statusDisplay)}</div>
      </div>
      <div>
        <div class="fact-label">Projected Pairing COI</div>
        <div class="fact-val">${(breeding.projectedCoiPercent || 0).toFixed(2)}%</div>
      </div>
      <div>
        <div class="fact-label">Stud / Service Fee</div>
        <div class="fact-val">${escapeSafeHtml(serviceFeeDisplay)}</div>
      </div>
      <div>
        <div class="fact-label">Offspring Outcome</div>
        <div class="fact-val">${
          breeding.actualBirthDateIso || breeding.liveCount > 0 || breeding.stillbornCount > 0
            ? `${breeding.liveCount} Live · ${breeding.stillbornCount} Stillborn · ${breeding.weanedCount} Weaned`
            : 'Awaiting Litter Outcome'
        }</div>
      </div>
      <div>
        <div class="fact-label">Gestation Window</div>
        <div class="fact-val">${speciesProfile.gestationDays} days</div>
      </div>
      <div>
        <div class="fact-label">Wean Target</div>
        <div class="fact-val">${speciesProfile.weanDaysAfterBirth} days post-${escapeSafeHtml(speciesProfile.birthEventLabel.toLowerCase())}</div>
      </div>
    </div>

    ${
      notesDisplay
        ? `<div class="notes-box"><strong>Service &amp; Pairing Notes:</strong> ${escapeSafeHtml(notesDisplay)}</div>`
        : ''
    }

    <div class="cert-clause">
      I hereby certify that the ${escapeSafeHtml(speciesProfile.femaleLabel.toLowerCase())} identified above was bred to the
      ${escapeSafeHtml(speciesProfile.maleLabel.toLowerCase())} listed above on
      <strong>${escapeSafeHtml(formatReadableDate(breeding.bredDateIso))}</strong>, and that the registration, tattoo, and parentage details recorded on this certificate are accurate to the best of my knowledge.
    </div>

    <div class="sigs">
      <div class="sig-block">
        ${escapeSafeHtml(speciesProfile.maleLabel)} / Stud Owner Signature (${escapeSafeHtml(studOwner || 'Authorized Breeder')}) &nbsp;&nbsp; Date: _____________
      </div>
      <div class="sig-block">
        ${escapeSafeHtml(speciesProfile.femaleLabel)} Owner / Witness Signature (${escapeSafeHtml(damOwner || 'Owner')}) &nbsp;&nbsp; Date: _____________
      </div>
    </div>

    <div class="footer-meta">
      <div>${contactLine ? escapeSafeHtml(contactLine) : escapeSafeHtml(settings.barnName || 'Community Pedigree')}</div>
      <div>Issued ${escapeSafeHtml(formatReadableDate(nowIsoUtc().slice(0, 10)))}</div>
    </div>
  </div>
</body>
</html>`;
}
```

## `src/core/animalConflicts.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Animal Conflict Detection, Duplicate-Tattoo Override Guard &
 * Import Attention Engine (`src/core/animalConflicts.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) or Node dependencies.
 * Runs identically in Web PWA, Node.js tests, and React Native / Expo.
 *
 * Covers:
 * - Same-species duplicate ear # / tattoo detection (with same-sex collision emphasis on creation)
 * - Explicit `"override"` confirmation verification
 * - Parent sex mismatch detection (Sire != Male, Dam != Female)
 * - Non-blocking import conflict alerting & `needsAttention` flagging
 * - Per-animal conflict ignore state that clears urgent attention while retaining soft warnings
 */

import {
  Animal,
  AnimalConflictKind,
  BiologicalSex,
  isSameSpecies,
  normalizeIgnoredConflicts,
  nowIsoUtc,
} from './models';

export interface DuplicateTattooPeer {
  peer: Animal;
  sameSex: boolean;
}

export interface ParentSexMismatchDetail {
  role: 'sire' | 'dam';
  expectedSex: 'Male' | 'Female';
  parent: Animal;
  actualSex: BiologicalSex;
}

export interface AnimalConflictSummary {
  animalId: string;
  species: string;
  duplicateTattooPeers: DuplicateTattooPeer[];
  sireSexMismatch: ParentSexMismatchDetail | null;
  damSexMismatch: ParentSexMismatchDetail | null;
  conflictKinds: AnimalConflictKind[];
  ignoredKinds: AnimalConflictKind[];
  activeKinds: AnimalConflictKind[];
  hasAnyConflict: boolean;
  hasActiveConflict: boolean;
  isIgnoredWithSoftWarning: boolean;
  headlineReasons: string[];
}

export interface LitterOffspringDraft {
  index: number;
  name: string;
  tattoo: string;
  sex: BiologicalSex;
}

export interface LitterTattooConflictDetail {
  rowIndex: number;
  tattoo: string;
  sex: BiologicalSex;
  existingMatches: Animal[];
  batchPeerIndices: number[];
}

export interface ImportConflictFlagResult {
  animals: Animal[];
  newlyFlaggedIds: string[];
  conflictedAnimalIds: string[];
  duplicateTattooAnimalCount: number;
  parentSexMismatchAnimalCount: number;
  alertMessage: string | null;
}

export function normalizeTattooKey(raw: string | undefined | null): string {
  return (raw || '').trim().toLowerCase();
}

export function isOverrideConfirmationValid(raw: string | undefined | null): boolean {
  return (raw || '').trim().toLowerCase() === 'override';
}

/**
 * Finds preexisting animals in the SAME species with the SAME sex and normalized tattoo/ear #.
 * Used during animal creation and bulk litter creation to discourage accidental duplicate IDs
 * unless the user explicitly types `override`.
 */
export function findSameSexDuplicateTattooCollisions(params: {
  tattoo: string;
  sex: BiologicalSex;
  species: string;
  animals: Animal[];
  excludeAnimalIds?: string[];
}): Animal[] {
  const tatKey = normalizeTattooKey(params.tattoo);
  if (!tatKey) return [];
  const excluded = new Set(params.excludeAnimalIds || []);
  return params.animals.filter(
    (a) =>
      !excluded.has(a.id) &&
      isSameSpecies(a.species, params.species) &&
      normalizeTattooKey(a.tattoo) === tatKey &&
      a.sex === params.sex
  );
}

/**
 * Finds all same-species duplicate tattoo peers (any sex) for informational/editing checks.
 */
export function findAllSpeciesDuplicateTattooPeers(params: {
  tattoo: string;
  species: string;
  animals: Animal[];
  excludeAnimalIds?: string[];
}): Animal[] {
  const tatKey = normalizeTattooKey(params.tattoo);
  if (!tatKey) return [];
  const excluded = new Set(params.excludeAnimalIds || []);
  return params.animals.filter(
    (a) =>
      !excluded.has(a.id) &&
      isSameSpecies(a.species, params.species) &&
      normalizeTattooKey(a.tattoo) === tatKey
  );
}

/**
 * Validates bulk litter offspring drafts against existing animals of the same species/sex
 * AND against other babies in the same litter batch.
 */
export function findLitterOffspringTattooConflicts(
  drafts: LitterOffspringDraft[],
  species: string,
  existingAnimals: Animal[]
): LitterTattooConflictDetail[] {
  const results: LitterTattooConflictDetail[] = [];

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i];
    const tatKey = normalizeTattooKey(draft.tattoo);
    if (!tatKey) continue;

    const existingMatches = findSameSexDuplicateTattooCollisions({
      tattoo: draft.tattoo,
      sex: draft.sex,
      species,
      animals: existingAnimals,
    });

    const batchPeerIndices: number[] = [];
    for (let j = 0; j < drafts.length; j++) {
      if (i === j) continue;
      const other = drafts[j];
      if (normalizeTattooKey(other.tattoo) === tatKey && other.sex === draft.sex) {
        batchPeerIndices.push(j);
      }
    }

    if (existingMatches.length > 0 || batchPeerIndices.length > 0) {
      results.push({
        rowIndex: draft.index,
        tattoo: draft.tattoo.trim(),
        sex: draft.sex,
        existingMatches,
        batchPeerIndices,
      });
    }
  }

  return results;
}

/**
 * Finds existing offspring within the same species that currently reference `parentId`
 * as their Sire or Dam so sex changes can be prevented before creating a mismatch.
 */
export function findOffspringRequiringParentSex(
  parentId: string,
  species: string,
  animals: Animal[]
): { asSireOf: Animal[]; asDamOf: Animal[] } {
  if (!parentId) return { asSireOf: [], asDamOf: [] };
  const asSireOf: Animal[] = [];
  const asDamOf: Animal[] = [];
  for (const a of animals) {
    if (!isSameSpecies(a.species, species) || a.id === parentId) continue;
    if (a.sireId === parentId) asSireOf.push(a);
    if (a.damId === parentId) asDamOf.push(a);
  }
  return { asSireOf, asDamOf };
}

/**
 * Computes live per-animal conflict summaries across all animals (strictly species-isolated).
 */
export function analyzeBarnAnimalConflicts(
  animals: Animal[]
): Map<string, AnimalConflictSummary> {
  const result = new Map<string, AnimalConflictSummary>();

  const bySpecies = new Map<string, Animal[]>();
  for (const a of animals) {
    const spKey = (a.species || '').trim().toLowerCase();
    const list = bySpecies.get(spKey) || [];
    list.push(a);
    bySpecies.set(spKey, list);
  }

  for (const speciesGroup of bySpecies.values()) {
    const byId = new Map<string, Animal>();
    const byTattoo = new Map<string, Animal[]>();

    for (const a of speciesGroup) {
      byId.set(a.id, a);
      const tatKey = normalizeTattooKey(a.tattoo);
      if (tatKey) {
        const list = byTattoo.get(tatKey) || [];
        list.push(a);
        byTattoo.set(tatKey, list);
      }
    }

    for (const a of speciesGroup) {
      const tatKey = normalizeTattooKey(a.tattoo);
      const duplicateTattooPeers: DuplicateTattooPeer[] = tatKey
        ? (byTattoo.get(tatKey) || [])
            .filter((peer) => peer.id !== a.id)
            .map((peer) => ({
              peer,
              sameSex: peer.sex === a.sex,
            }))
        : [];

      let sireSexMismatch: ParentSexMismatchDetail | null = null;
      if (a.sireId) {
        const sire = byId.get(a.sireId);
        if (sire && sire.id !== a.id && sire.sex !== 'Male') {
          sireSexMismatch = {
            role: 'sire',
            expectedSex: 'Male',
            parent: sire,
            actualSex: sire.sex,
          };
        }
      }

      let damSexMismatch: ParentSexMismatchDetail | null = null;
      if (a.damId) {
        const dam = byId.get(a.damId);
        if (dam && dam.id !== a.id && dam.sex !== 'Female') {
          damSexMismatch = {
            role: 'dam',
            expectedSex: 'Female',
            parent: dam,
            actualSex: dam.sex,
          };
        }
      }

      const conflictKinds: AnimalConflictKind[] = [];
      if (duplicateTattooPeers.length > 0) {
        conflictKinds.push('duplicate_tattoo');
      }
      if (sireSexMismatch || damSexMismatch) {
        conflictKinds.push('parent_sex_mismatch');
      }

      const rawIgnored = normalizeIgnoredConflicts(a.ignoredConflicts);
      const ignoredKinds = conflictKinds.filter((k) => rawIgnored.includes(k));
      const activeKinds = conflictKinds.filter((k) => !ignoredKinds.includes(k));

      const headlineReasons: string[] = [];
      if (duplicateTattooPeers.length > 0) {
        const sameSexCount = duplicateTattooPeers.filter((p) => p.sameSex).length;
        headlineReasons.push(
          sameSexCount > 0
            ? `Duplicate tattoo "${a.tattoo.trim()}" (${sameSexCount} same-sex match${sameSexCount === 1 ? '' : 'es'})`
            : `Duplicate tattoo "${a.tattoo.trim()}" (${duplicateTattooPeers.length} match${duplicateTattooPeers.length === 1 ? '' : 'es'} in species)`
        );
      }
      if (sireSexMismatch) {
        headlineReasons.push(
          `Sire "${sireSexMismatch.parent.name}" is recorded as ${sireSexMismatch.actualSex}`
        );
      }
      if (damSexMismatch) {
        headlineReasons.push(
          `Dam "${damSexMismatch.parent.name}" is recorded as ${damSexMismatch.actualSex}`
        );
      }

      result.set(a.id, {
        animalId: a.id,
        species: a.species,
        duplicateTattooPeers,
        sireSexMismatch,
        damSexMismatch,
        conflictKinds,
        ignoredKinds,
        activeKinds,
        hasAnyConflict: conflictKinds.length > 0,
        hasActiveConflict: activeKinds.length > 0,
        isIgnoredWithSoftWarning: conflictKinds.length > 0 && activeKinds.length === 0,
        headlineReasons,
      });
    }
  }

  return result;
}

/**
 * Flags animals involved in active duplicate-tattoo or parent-sex-mismatch conflicts
 * after an import WITHOUT blocking the import.
 *
 * - If `importedAnimalIds` is provided (merge / platform import), flags imported animals AND any
 *   existing herd peers newly colliding with those imported animals (unless ignored).
 * - If `importedAnimalIds` is omitted (full backup replace), evaluates the entire imported herd.
 */
export function applyImportConflictAttentionFlags(
  animals: Animal[],
  importedAnimalIds?: Set<string>
): ImportConflictFlagResult {
  const summaries = analyzeBarnAnimalConflicts(animals);
  const ts = nowIsoUtc();

  const touchedIds = new Set<string>();
  const newlyFlaggedIds: string[] = [];
  const dupAnimals = new Set<string>();
  const mismatchAnimals = new Set<string>();

  const nextAnimals = animals.map((animal) => {
    const summary = summaries.get(animal.id);
    if (!summary || !summary.hasActiveConflict) {
      return animal;
    }

    const involvesImport =
      !importedAnimalIds ||
      importedAnimalIds.has(animal.id) ||
      summary.duplicateTattooPeers.some((p) => importedAnimalIds.has(p.peer.id)) ||
      (summary.sireSexMismatch ? importedAnimalIds.has(summary.sireSexMismatch.parent.id) : false) ||
      (summary.damSexMismatch ? importedAnimalIds.has(summary.damSexMismatch.parent.id) : false);

    if (!involvesImport) {
      return animal;
    }

    touchedIds.add(animal.id);
    if (summary.activeKinds.includes('duplicate_tattoo')) {
      dupAnimals.add(animal.id);
    }
    if (summary.activeKinds.includes('parent_sex_mismatch')) {
      mismatchAnimals.add(animal.id);
    }

    if (animal.needsAttention) {
      return animal;
    }
    newlyFlaggedIds.push(animal.id);
    return {
      ...animal,
      needsAttention: true,
      updatedAt: animal.updatedAt || ts,
    };
  });

  const conflictedAnimalIds = Array.from(touchedIds);
  const parts: string[] = [];
  if (dupAnimals.size > 0) {
    parts.push(`${dupAnimals.size} with duplicate ID/tattoo`);
  }
  if (mismatchAnimals.size > 0) {
    parts.push(`${mismatchAnimals.size} with parent sex mismatch`);
  }

  const alertMessage =
    conflictedAnimalIds.length > 0
      ? `Import completed with ${conflictedAnimalIds.length} record(s) needing review (${parts.join(', ')}). Profiles & pedigrees were flagged for attention.`
      : null;

  return {
    animals: nextAnimals,
    newlyFlaggedIds,
    conflictedAnimalIds,
    duplicateTattooAnimalCount: dupAnimals.size,
    parentSexMismatchAnimalCount: mismatchAnimals.size,
    alertMessage,
  };
}

/**
 * Ranks animals so Active Conflicts come first, Ignored Soft Warnings second, and clean animals third.
 */
export function getConflictSortPriority(summary: AnimalConflictSummary | undefined): number {
  if (!summary || !summary.hasAnyConflict) return 2;
  if (summary.hasActiveConflict) return 0;
  return 1;
}
```

## `src/core/archiveInspector.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Pre-Restore Archive Inspector (`src/core/archiveInspector.ts`).
 *
 * Dry-run parses backup `.ZIP`, `.JSON`, or decoded `.SQLITE` snapshots BEFORE committing
 * any database writes so breeders can verify exact species counts, photo byte sizes,
 * detected tattoo/sex conflicts, and replace-vs-merge impact first.
 */

import { analyzeBarnAnimalConflicts } from './animalConflicts';
import { ParsedBackupArchive } from './backupArchive';
import { CURRENT_BACKUP_SCHEMA_VERSION } from './backupVault';
import { analyzeBarnDataHealth } from './dataHealthCheck';
import { estimateDataUrlByteLength } from './imageOptimizationSpec';
import {
  BarnDatabaseSnapshot,
  isAnimalArchived,
  isSameSpecies,
} from './models';

export interface ArchiveSpeciesSummaryItem {
  species: string;
  animalCount: number;
  photoCount: number;
  photoBytes: number;
}

export interface PreRestoreArchiveInspection {
  fileName: string;
  sourceFormat: 'json' | 'zip' | 'sqlite';
  isPhotosOnly: boolean;
  encrypted: boolean;
  schemaVersion: number;
  barnName: string;
  updatedAtIso: string;
  animalCount: number;
  activeAnimalCount: number;
  archivedAnimalCount: number;
  breedingCount: number;
  taskCount: number;
  cageCount: number;
  careLogCount: number;
  showCount: number;
  photoCount: number;
  photoBytes: number;
  speciesBreakdown: ArchiveSpeciesSummaryItem[];
  duplicateTattooCount: number;
  parentSexMismatchCount: number;
  healthIssueCount: number;
  replaceImpact: {
    currentAnimalCount: number;
    currentPhotoCount: number;
    netAnimalDelta: number;
    currentAnimalsNotInIncoming: number;
  } | null;
  mergeImpact: {
    newAnimalsToAdd: number;
    existingAnimalsMatched: number;
    newPhotosToAdd: number;
    existingPhotosMatched: number;
  } | null;
}

function computePhotoPayloadBytes(
  photos: BarnDatabaseSnapshot['animalPhotos']
): number {
  let sum = 0;
  for (const p of photos ?? []) {
    sum +=
      p.storedBytes > 0
        ? p.storedBytes
        : p.dataUrl
        ? estimateDataUrlByteLength(p.dataUrl)
        : 0;
  }
  return sum;
}

export function inspectSnapshotBeforeRestorePure(
  incoming: BarnDatabaseSnapshot,
  current?: BarnDatabaseSnapshot | null,
  options?: {
    fileName?: string;
    sourceFormat?: 'json' | 'zip' | 'sqlite';
    schemaVersion?: number;
    encrypted?: boolean;
  }
): PreRestoreArchiveInspection {
  const photos = incoming.animalPhotos ?? [];
  const photoBytes = computePhotoPayloadBytes(photos);

  const speciesMap = new Map<string, ArchiveSpeciesSummaryItem>();
  const touchSpecies = (rawName: string | undefined): ArchiveSpeciesSummaryItem => {
    const clean = (rawName || 'Unspecified').trim() || 'Unspecified';
    const key = clean.toLowerCase();
    const existing = speciesMap.get(key);
    if (existing) return existing;
    const item: ArchiveSpeciesSummaryItem = {
      species: clean,
      animalCount: 0,
      photoCount: 0,
      photoBytes: 0,
    };
    speciesMap.set(key, item);
    return item;
  };

  for (const sp of incoming.speciesProfiles) {
    touchSpecies(sp.name);
  }
  let archivedAnimalCount = 0;
  for (const animal of incoming.animals) {
    const bucket = touchSpecies(animal.species);
    bucket.animalCount += 1;
    if (isAnimalArchived(animal)) archivedAnimalCount += 1;
  }
  for (const photo of photos) {
    const bucket = touchSpecies(photo.species);
    bucket.photoCount += 1;
    bucket.photoBytes +=
      photo.storedBytes > 0
        ? photo.storedBytes
        : photo.dataUrl
        ? estimateDataUrlByteLength(photo.dataUrl)
        : 0;
  }

  const speciesBreakdown = Array.from(speciesMap.values())
    .filter((item) => item.animalCount > 0 || item.photoCount > 0)
    .sort(
      (a, b) =>
        b.animalCount - a.animalCount ||
        b.photoCount - a.photoCount ||
        a.species.localeCompare(b.species)
    );

  const conflictMap = analyzeBarnAnimalConflicts(incoming.animals);
  let duplicateTattooCount = 0;
  let parentSexMismatchCount = 0;
  for (const summary of conflictMap.values()) {
    if (!summary.hasActiveConflict) continue;
    if (summary.activeKinds.includes('duplicate_tattoo')) duplicateTattooCount += 1;
    if (summary.activeKinds.includes('parent_sex_mismatch')) parentSexMismatchCount += 1;
  }

  const healthReport = analyzeBarnDataHealth(incoming);

  let replaceImpact: PreRestoreArchiveInspection['replaceImpact'] = null;
  let mergeImpact: PreRestoreArchiveInspection['mergeImpact'] = null;

  if (current) {
    const incomingIds = new Set(incoming.animals.map((a) => a.id));
    const currentIds = new Set(current.animals.map((a) => a.id));
    const incomingPhotoIds = new Set(photos.map((p) => p.id));
    const currentPhotoIds = new Set((current.animalPhotos ?? []).map((p) => p.id));

    let currentAnimalsNotInIncoming = 0;
    for (const id of currentIds) {
      if (!incomingIds.has(id)) currentAnimalsNotInIncoming += 1;
    }

    let newAnimalsToAdd = 0;
    let existingAnimalsMatched = 0;
    for (const id of incomingIds) {
      if (currentIds.has(id)) existingAnimalsMatched += 1;
      else newAnimalsToAdd += 1;
    }

    let newPhotosToAdd = 0;
    let existingPhotosMatched = 0;
    for (const id of incomingPhotoIds) {
      if (currentPhotoIds.has(id)) existingPhotosMatched += 1;
      else newPhotosToAdd += 1;
    }

    replaceImpact = {
      currentAnimalCount: current.animals.length,
      currentPhotoCount: (current.animalPhotos ?? []).length,
      netAnimalDelta: incoming.animals.length - current.animals.length,
      currentAnimalsNotInIncoming,
    };

    mergeImpact = {
      newAnimalsToAdd,
      existingAnimalsMatched,
      newPhotosToAdd,
      existingPhotosMatched,
    };
  }

  return {
    fileName: options?.fileName || 'backup',
    sourceFormat: options?.sourceFormat || 'json',
    isPhotosOnly: false,
    encrypted: Boolean(options?.encrypted),
    schemaVersion: options?.schemaVersion ?? CURRENT_BACKUP_SCHEMA_VERSION,
    barnName: incoming.settings.barnName || 'Community Pedigree',
    updatedAtIso: incoming.settings.updatedAt || '',
    animalCount: incoming.animals.length,
    activeAnimalCount: Math.max(0, incoming.animals.length - archivedAnimalCount),
    archivedAnimalCount,
    breedingCount: incoming.breedings.length,
    taskCount: incoming.tasks.length,
    cageCount: incoming.cages.length,
    careLogCount: incoming.careLogs.length,
    showCount: incoming.shows.length,
    photoCount: photos.length,
    photoBytes,
    speciesBreakdown,
    duplicateTattooCount,
    parentSexMismatchCount,
    healthIssueCount: healthReport.totalIssueCount,
    replaceImpact,
    mergeImpact,
  };
}

export function inspectParsedArchiveBeforeRestorePure(
  parsed: ParsedBackupArchive,
  current?: BarnDatabaseSnapshot | null,
  options?: {
    fileName?: string;
    encrypted?: boolean;
  }
): PreRestoreArchiveInspection {
  if (parsed.kind === 'full_snapshot') {
    return inspectSnapshotBeforeRestorePure(parsed.snapshot, current, {
      fileName: options?.fileName,
      sourceFormat: parsed.sourceFormat,
      encrypted: options?.encrypted,
    });
  }

  const photos = parsed.photos;
  const photoBytes = computePhotoPayloadBytes(photos);
  const speciesMap = new Map<string, ArchiveSpeciesSummaryItem>();
  for (const photo of photos) {
    const clean = (photo.species || 'Unspecified').trim() || 'Unspecified';
    const key = clean.toLowerCase();
    const bucket = speciesMap.get(key) || {
      species: clean,
      animalCount: 0,
      photoCount: 0,
      photoBytes: 0,
    };
    bucket.photoCount += 1;
    bucket.photoBytes +=
      photo.storedBytes > 0
        ? photo.storedBytes
        : photo.dataUrl
        ? estimateDataUrlByteLength(photo.dataUrl)
        : 0;
    speciesMap.set(key, bucket);
  }

  const currentPhotoIds = new Set((current?.animalPhotos ?? []).map((p) => p.id));
  let matchedByAnimal = 0;
  let newPhotosToAdd = 0;
  let existingPhotosMatched = 0;
  for (const photo of photos) {
    if (currentPhotoIds.has(photo.id)) existingPhotosMatched += 1;
    else newPhotosToAdd += 1;
    if (
      current?.animals.some(
        (a) =>
          a.id === photo.animalId ||
          isSameSpecies(a.species, photo.species)
      )
    ) {
      matchedByAnimal += 1;
    }
  }

  return {
    fileName: options?.fileName || 'photos.zip',
    sourceFormat: 'zip',
    isPhotosOnly: true,
    encrypted: Boolean(options?.encrypted),
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    barnName: current?.settings.barnName || 'Photos-Only Archive',
    updatedAtIso: '',
    animalCount: matchedByAnimal,
    activeAnimalCount: 0,
    archivedAnimalCount: 0,
    breedingCount: 0,
    taskCount: 0,
    cageCount: 0,
    careLogCount: 0,
    showCount: 0,
    photoCount: photos.length,
    photoBytes,
    speciesBreakdown: Array.from(speciesMap.values()).sort(
      (a, b) => b.photoCount - a.photoCount || a.species.localeCompare(b.species)
    ),
    duplicateTattooCount: 0,
    parentSexMismatchCount: 0,
    healthIssueCount: 0,
    replaceImpact: null,
    mergeImpact: current
      ? {
          newAnimalsToAdd: 0,
          existingAnimalsMatched: 0,
          newPhotosToAdd,
          existingPhotosMatched,
        }
      : null,
  };
}
```

## `src/core/backupArchive.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Image-Inclusive Archive Packager & Restorer (.ZIP + .JSON).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript + `fflate` Uint8Array zip/unzip with ZERO browser DOM
 * (`window`, `document`, `<canvas>`) dependencies so full-barn and photo-folder
 * portability archives run identically on Web PWA and React Native / Expo.
 */

import {
  strFromU8,
  strToU8,
  Zip,
  ZipDeflate,
  ZipPassThrough,
  zipSync,
  Zippable,
} from 'fflate';
import { generateSpeciesBarnBinderHtml } from './barnBinder';
import {
  isSvgImageInput,
  MAX_JSON_BACKUP_BYTES,
  MAX_ZIP_ARCHIVE_BYTES,
  safeUnzipArchive,
  sanitizePlainText,
  sanitizeSafeRasterImageDataUrl,
  sanitizeSingleLineText,
  validateUploadFileSize,
} from './inputSanitization';
import {
  Animal,
  AnimalPhoto,
  BarnDatabaseSnapshot,
  BarnSettings,
  generateUuid,
  isSameSpecies,
  nowIsoUtc,
} from './models';
import {
  exportBarnBackupJson,
  generateBarnBackupJsonChunks,
  parseBarnBackupJson,
  SpeciesBackupReason,
} from './syncAndExports';

export interface BackupPhotoManifestEntry {
  id: string;
  species: string;
  animalId: string;
  animalName: string;
  animalTattoo: string;
  isPrimary: boolean;
  sortOrder: number;
  caption: string;
  originalFileName: string;
  mimeType: string;
  width: number;
  height: number;
  originalBytes: number;
  storedBytes: number;
  archivePath: string;
  thumbnailDataUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackupArchiveBuildResult {
  bytes: Uint8Array;
  photoCount: number;
  animalCount: number;
  binderCount: number;
  totalImageBinaryBytes: number;
}

export interface StreamingZipArchiveSummary {
  totalZipBytes: number;
  photoCount: number;
  animalCount: number;
  binderCount: number;
  totalImageBinaryBytes: number;
}

export type ParsedBackupArchive =
  | {
      kind: 'full_snapshot';
      snapshot: BarnDatabaseSnapshot;
      photosReconstructed: number;
      sourceFormat: 'json' | 'zip';
    }
  | {
      kind: 'photos_only';
      photos: AnimalPhoto[];
      manifestEntries: BackupPhotoManifestEntry[];
      sourceFormat: 'zip';
    };

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const BASE64_LOOKUP = (() => {
  const table = new Uint8Array(256);
  table.fill(255);
  for (let i = 0; i < BASE64_ALPHABET.length; i++) {
    table[BASE64_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

/**
 * Pure TypeScript `Uint8Array` -> base64 string encoder (zero DOM `btoa` / Latin-1 limits).
 */
export function bytesToBase64Pure(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  const chunks: string[] = [];
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < len;
    const hasB2 = i + 2 < len;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;

    const triplet = (b0 << 16) | (b1 << 8) | b2;
    chunks.push(
      BASE64_ALPHABET[(triplet >> 18) & 0x3f] +
        BASE64_ALPHABET[(triplet >> 12) & 0x3f] +
        (hasB1 ? BASE64_ALPHABET[(triplet >> 6) & 0x3f] : '=') +
        (hasB2 ? BASE64_ALPHABET[triplet & 0x3f] : '=')
    );
  }
  return chunks.join('');
}

/**
 * Pure TypeScript base64 string -> `Uint8Array` decoder.
 */
export function base64ToBytesPure(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  if (!clean) return new Uint8Array(0);
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const outLen = Math.max(0, Math.floor((clean.length * 3) / 4) - pad);
  const out = new Uint8Array(outLen);

  let outIdx = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64_LOOKUP[clean.charCodeAt(i)] ?? 0;
    const c1 = BASE64_LOOKUP[clean.charCodeAt(i + 1)] ?? 0;
    const c2 = clean[i + 2] === '=' ? 0 : BASE64_LOOKUP[clean.charCodeAt(i + 2)] ?? 0;
    const c3 = clean[i + 3] === '=' ? 0 : BASE64_LOOKUP[clean.charCodeAt(i + 3)] ?? 0;

    const triplet = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (outIdx < outLen) out[outIdx++] = (triplet >> 16) & 0xff;
    if (outIdx < outLen) out[outIdx++] = (triplet >> 8) & 0xff;
    if (outIdx < outLen) out[outIdx++] = triplet & 0xff;
  }
  return out;
}

/**
 * Extracts raw binary bytes and MIME type from a `data:image/...;base64,...` URI.
 */
export function dataUrlToBinary(
  dataUrl: string,
  fallbackMime = 'image/webp'
): { mimeType: string; bytes: Uint8Array } | null {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;
  const header = dataUrl.slice(5, commaIdx);
  const mimeType = header.split(';')[0] || fallbackMime;
  const payload = dataUrl.slice(commaIdx + 1);
  if (!header.includes(';base64')) {
    try {
      return { mimeType, bytes: strToU8(decodeURIComponent(payload)) };
    } catch {
      return null;
    }
  }
  return { mimeType, bytes: base64ToBytesPure(payload) };
}

/**
 * Converts binary image bytes + MIME type back into a safe `data:image/...;base64,...` URI.
 * Blocks `image/svg+xml` payloads to avoid embedded script smuggling.
 */
export function binaryToDataUrl(mimeType: string, bytes: Uint8Array): string {
  const normalizedMime = (mimeType || '').split(';')[0].trim().toLowerCase();
  const isAllowedRaster =
    /^image\/(webp|jpeg|jpg|png|gif|avif|bmp)$/i.test(normalizedMime);
  const safeMime = isAllowedRaster ? normalizedMime : 'image/webp';
  return `data:${safeMime};base64,${bytesToBase64Pure(bytes)}`;
}

function extensionForMime(mimeType: string, fallbackName?: string): string {
  const m = (mimeType || '').toLowerCase();
  if (m === 'image/webp') return 'webp';
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/avif') return 'avif';
  if (m === 'image/gif') return 'gif';
  if (fallbackName) {
    const dot = fallbackName.lastIndexOf('.');
    if (dot !== -1 && dot < fallbackName.length - 1) {
      const ext = fallbackName
        .slice(dot + 1)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      if (ext) return ext;
    }
  }
  return 'webp';
}

function sanitizePathSegment(raw: string, fallback: string): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return cleaned || fallback;
}

function buildArchivePhotoEntries(
  snapshot: BarnDatabaseSnapshot,
  filterSpecies?: string
): {
  zipFiles: Zippable;
  manifest: BackupPhotoManifestEntry[];
  animalCount: number;
  totalImageBinaryBytes: number;
} {
  const animals = filterSpecies
    ? snapshot.animals.filter((a) => isSameSpecies(a.species, filterSpecies))
    : snapshot.animals;
  const animalById = new Map(animals.map((a) => [a.id, a]));

  const photos = (snapshot.animalPhotos ?? [])
    .filter((p) =>
      filterSpecies
        ? isSameSpecies(p.species, filterSpecies) || animalById.has(p.animalId)
        : true
    )
    .sort((a, b) => {
      if (a.species !== b.species) return a.species.localeCompare(b.species);
      if (a.animalId !== b.animalId) return a.animalId.localeCompare(b.animalId);
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    });

  const zipFiles: Zippable = {};
  const manifest: BackupPhotoManifestEntry[] = [];
  const usedPaths = new Set<string>();
  const countPerAnimal = new Map<string, number>();
  const uniqueAnimalsWithPhotos = new Set<string>();
  let totalImageBinaryBytes = 0;

  for (const photo of photos) {
    const decoded = dataUrlToBinary(photo.dataUrl, photo.mimeType);
    if (!decoded || decoded.bytes.byteLength === 0) continue;

    const animal = animalById.get(photo.animalId);
    const speciesFolder = sanitizePathSegment(
      animal?.species || photo.species || 'Livestock',
      'Livestock'
    );
    const animalFolderRaw = animal
      ? [animal.tattoo, animal.name].filter(Boolean).join('_') || animal.id.slice(0, 8)
      : `animal-${photo.animalId.slice(0, 8)}`;
    const animalFolder = sanitizePathSegment(animalFolderRaw, photo.animalId.slice(0, 8));

    const idx = (countPerAnimal.get(photo.animalId) || 0) + 1;
    countPerAnimal.set(photo.animalId, idx);
    const numPrefix = String(idx).padStart(2, '0');
    const roleTag = photo.isPrimary ? 'cover' : 'photo';

    const origBaseRaw = (photo.originalFileName || '').replace(/\.[^.]+$/, '');
    const origBase = origBaseRaw ? `-${sanitizePathSegment(origBaseRaw, 'img')}` : '';
    const ext = extensionForMime(decoded.mimeType, photo.originalFileName);

    let archivePath = `photos/${speciesFolder}/${animalFolder}/${numPrefix}-${roleTag}${origBase}.${ext}`;
    let collision = 2;
    while (usedPaths.has(archivePath)) {
      archivePath = `photos/${speciesFolder}/${animalFolder}/${numPrefix}-${roleTag}${origBase}-${collision}.${ext}`;
      collision++;
    }
    usedPaths.add(archivePath);

    // Store images uncompressed (level 0) inside the ZIP — WebP/JPEG are already compressed
    zipFiles[archivePath] = [decoded.bytes, { level: 0 }];
    totalImageBinaryBytes += decoded.bytes.byteLength;
    uniqueAnimalsWithPhotos.add(photo.animalId);

    manifest.push({
      id: photo.id,
      species: animal?.species || photo.species,
      animalId: photo.animalId,
      animalName: animal?.name || '',
      animalTattoo: animal?.tattoo || '',
      isPrimary: photo.isPrimary,
      sortOrder: photo.sortOrder,
      caption: photo.caption,
      originalFileName: photo.originalFileName || `${numPrefix}-${roleTag}.${ext}`,
      mimeType: decoded.mimeType,
      width: photo.width,
      height: photo.height,
      originalBytes: photo.originalBytes,
      storedBytes: decoded.bytes.byteLength,
      archivePath,
      thumbnailDataUrl: photo.thumbnailDataUrl || '',
      createdAt: photo.createdAt,
      updatedAt: photo.updatedAt,
    });
  }

  return {
    zipFiles,
    manifest,
    animalCount: uniqueAnimalsWithPhotos.size,
    totalImageBinaryBytes,
  };
}

/**
 * Builds a browsable, self-contained **Photos-Only `.ZIP`** archive containing organized
 * real image files (`photos/<Species>/<Tattoo_Name>/01-cover.webp`) + `photos/manifest.json`.
 */
export function buildPhotosOnlyZipArchive(
  snapshot: BarnDatabaseSnapshot,
  filterSpecies?: string
): BackupArchiveBuildResult {
  const { zipFiles, manifest, animalCount, totalImageBinaryBytes } = buildArchivePhotoEntries(
    snapshot,
    filterSpecies
  );

  const manifestPayload = {
    format: 'community-pedigree-photos-archive-v1',
    package: 'Pedigree',
    exportedAtIsoUtc: nowIsoUtc(),
    filterSpecies: filterSpecies || null,
    photoCount: manifest.length,
    photos: manifest,
  };

  zipFiles['photos/manifest.json'] = [
    strToU8(JSON.stringify(manifestPayload, null, 2)),
    { level: 6 },
  ];
  zipFiles['README.txt'] = [
    strToU8(
      [
        'Community Pedigree — Portable Animal Photos Archive',
        `Exported: ${nowIsoUtc()}`,
        `Photos Included: ${manifest.length} across ${animalCount} animal(s)`,
        '',
        'Folders inside photos/ hold standard viewable image files (.webp / .jpg / .png).',
        'Use "Merge Backup (.JSON / .ZIP)" in Barn Settings -> Open Data Portability & Backups',
        'to merge these photos back onto matching animals on any device.',
      ].join('\n')
    ),
    { level: 6 },
  ];

  return {
    bytes: zipSync(zipFiles),
    photoCount: manifest.length,
    animalCount,
    binderCount: 0,
    totalImageBinaryBytes,
  };
}

/**
 * Builds a **Complete Barn Archive + Photos (`.ZIP`)** containing:
 * - `pedigree-backup.json`: Full tabular database (settings, species, animals, cages, breedings, tasks, care logs, shows)
 * - `photos/manifest.json`: Full photo metadata + lightweight thumbnails
 * - `photos/<Species>/<Tattoo_Name>/...`: Every stored image as a real viewable binary file
 *
 * Avoids base64 bloat inside the ZIP while allowing 1-click full restore or merge.
 */
export function buildCompleteBackupZipFiles(
  snapshot: BarnDatabaseSnapshot,
  filterSpecies?: string,
  extraMeta?: {
    backupScope?: 'barn' | 'species';
    backupReason?: SpeciesBackupReason;
    targetSpecies?: string;
  }
): {
  zipFiles: Zippable;
  photoCount: number;
  animalCount: number;
  binderCount: number;
  totalImageBinaryBytes: number;
} {
  const { zipFiles, manifest, totalImageBinaryBytes } = buildArchivePhotoEntries(
    snapshot,
    filterSpecies
  );

  const scopedSnapshot: BarnDatabaseSnapshot = filterSpecies
    ? {
        settings: snapshot.settings,
        speciesProfiles: snapshot.speciesProfiles.filter((sp) =>
          isSameSpecies(sp.name, filterSpecies)
        ),
        animals: snapshot.animals.filter((a) => isSameSpecies(a.species, filterSpecies)),
        animalPhotos: [],
        cages: snapshot.cages.filter((c) => isSameSpecies(c.species, filterSpecies)),
        breedings: snapshot.breedings.filter((b) => isSameSpecies(b.species, filterSpecies)),
        tasks: snapshot.tasks.filter((t) => isSameSpecies(t.species, filterSpecies)),
        careLogs: snapshot.careLogs.filter((l) => isSameSpecies(l.species, filterSpecies)),
        shows: snapshot.shows.filter((s) => isSameSpecies(s.species, filterSpecies)),
        feedBatches: (snapshot.feedBatches ?? []).filter((f) => isSameSpecies(f.species, filterSpecies)),
        feedAllocations: (snapshot.feedAllocations ?? []).filter((a) =>
          isSameSpecies(a.species, filterSpecies)
        ),
        ledgerEntries: (snapshot.ledgerEntries ?? []).filter((e) =>
          isSameSpecies(e.species, filterSpecies)
        ),
        processingLogs: (snapshot.processingLogs ?? []).filter((p) =>
          isSameSpecies(p.species, filterSpecies)
        ),
        youthProjectBooks: (snapshot.youthProjectBooks ?? []).filter((y) =>
          isSameSpecies(y.species, filterSpecies)
        ),
        clientContacts: (snapshot.clientContacts ?? []).filter((c) =>
          isSameSpecies(c.species, filterSpecies)
        ),
        waitlistEntries: (snapshot.waitlistEntries ?? []).filter((w) =>
          isSameSpecies(w.species, filterSpecies)
        ),
        animalReservations: (snapshot.animalReservations ?? []).filter((r) =>
          isSameSpecies(r.species, filterSpecies)
        ),
        woolHarvests: (snapshot.woolHarvests ?? []).filter((w) =>
          isSameSpecies(w.species, filterSpecies)
        ),
      }
    : {
        ...snapshot,
        animalPhotos: [],
      };

  const resolvedMeta = extraMeta
    ? extraMeta
    : filterSpecies
    ? {
        backupScope: 'species' as const,
        backupReason: 'manual' as SpeciesBackupReason,
        targetSpecies: filterSpecies,
      }
    : undefined;

  const mainJsonText = exportBarnBackupJson(scopedSnapshot, resolvedMeta);
  zipFiles['pedigree-backup.json'] = [strToU8(mainJsonText), { level: 6 }];

  // Always auto-include human-readable Printable Barn Binder (.HTM) per species
  // with ALL records (including archived/sold/deceased), photos, and all dossier sections.
  const targetSpeciesNames: string[] = [];
  const seenSpecies = new Set<string>();
  const registerTargetSpecies = (rawName: string | undefined) => {
    const clean = (rawName || '').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seenSpecies.has(key)) return;
    seenSpecies.add(key);
    targetSpeciesNames.push(clean);
  };

  if (filterSpecies) {
    const matched = snapshot.speciesProfiles.find((sp) => isSameSpecies(sp.name, filterSpecies));
    registerTargetSpecies(matched?.name || filterSpecies);
  } else {
    for (const sp of snapshot.speciesProfiles) {
      registerTargetSpecies(sp.name);
    }
    for (const a of snapshot.animals) {
      registerTargetSpecies(a.species);
    }
  }

  let binderCount = 0;
  const usedBinderPaths = new Set<string>();
  for (const spName of targetSpeciesNames) {
    const spSlug = sanitizePathSegment(spName.toLowerCase(), 'species');
    let binderPath = `binder/${spSlug}-binder.htm`;
    let suffix = 2;
    while (usedBinderPaths.has(binderPath)) {
      binderPath = `binder/${spSlug}-${suffix}-binder.htm`;
      suffix++;
    }
    usedBinderPaths.add(binderPath);

    const binderHtml = generateSpeciesBarnBinderHtml(snapshot, spName, {
      colorMode: 'color',
      includeArchived: true,
      includePhotos: true,
      includeCoverAndSignature: true,
      includeSpeciesOverview: true,
      includeHealthAndLitters: true,
      includeShowsAndKinship: true,
    });
    zipFiles[binderPath] = [strToU8(binderHtml), { level: 6 }];
    binderCount++;
  }

  const manifestPayload = {
    format: 'community-pedigree-photos-archive-v1',
    package: 'Pedigree',
    exportedAtIsoUtc: nowIsoUtc(),
    filterSpecies: filterSpecies || null,
    photoCount: manifest.length,
    photos: manifest,
  };
  zipFiles['photos/manifest.json'] = [
    strToU8(JSON.stringify(manifestPayload, null, 2)),
    { level: 6 },
  ];

  zipFiles['README.txt'] = [
    strToU8(
      [
        'Community Pedigree — Complete Portable Backup Archive (.ZIP)',
        `Barn: ${snapshot.settings.barnName}`,
        `Exported: ${nowIsoUtc()}`,
        `Animals: ${scopedSnapshot.animals.length}`,
        `Photos: ${manifest.length}`,
        `Printable Barn Binders: ${binderCount}`,
        '',
        'Contents:',
        '- pedigree-backup.json: Complete herd, lineage, breeding, chore, care log, and species memo pad database.',
        '- binder/*.htm: Complete human-readable Printable Barn Binder per species (pedigrees, health, litters, shows, kinship, photos, and signature page).',
        '- photos/: Standard viewable image files organized by species and animal.',
        '- photos/manifest.json: Index linking every image file to its animal UUID, tattoo, cover flag, and caption.',
        '',
        'To restore or merge everything back into Community Pedigree on any phone or PC:',
        'Open Settings -> Open Data Portability & Backups -> Restore or Merge (.JSON / .ZIP).',
      ].join('\n')
    ),
    { level: 6 },
  ];

  return {
    zipFiles,
    photoCount: manifest.length,
    animalCount: scopedSnapshot.animals.length,
    binderCount,
    totalImageBinaryBytes,
  };
}

export function buildCompleteBackupZipArchive(
  snapshot: BarnDatabaseSnapshot,
  filterSpecies?: string,
  extraMeta?: {
    backupScope?: 'barn' | 'species';
    backupReason?: SpeciesBackupReason;
    targetSpecies?: string;
  }
): BackupArchiveBuildResult {
  const { zipFiles, photoCount, animalCount, binderCount, totalImageBinaryBytes } =
    buildCompleteBackupZipFiles(snapshot, filterSpecies, extraMeta);

  return {
    bytes: zipSync(zipFiles),
    photoCount,
    animalCount,
    binderCount,
    totalImageBinaryBytes,
  };
}

const ZIP_TEXT_SLICE_CHARS = 64 * 1024;

function sliceUtf16Safe(
  text: string,
  start: number,
  maxChars: number
): { slice: string; nextOffset: number } {
  let end = Math.min(text.length, start + maxChars);
  if (end < text.length && end > start) {
    const lastCode = text.charCodeAt(end - 1);
    if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
      end = Math.min(text.length, end + 1);
    }
  }
  return { slice: text.slice(start, end), nextOffset: end };
}

async function pushTextToZipDeflate(
  zip: Zip,
  entryPath: string,
  text: string,
  flushChunks: () => Promise<void>
): Promise<void> {
  const def = new ZipDeflate(entryPath, { level: 6 });
  zip.add(def);
  if (text.length <= ZIP_TEXT_SLICE_CHARS) {
    def.push(strToU8(text), true);
    await flushChunks();
    return;
  }
  let offset = 0;
  while (offset < text.length) {
    const { slice, nextOffset } = sliceUtf16Safe(text, offset, ZIP_TEXT_SLICE_CHARS);
    const isFinal = nextOffset >= text.length;
    def.push(strToU8(slice), isFinal);
    await flushChunks();
    offset = nextOffset;
  }
}

async function pushJsonGeneratorToZipDeflate(
  zip: Zip,
  entryPath: string,
  chunks: Generator<string, void, unknown>,
  flushChunks: () => Promise<void>
): Promise<void> {
  const def = new ZipDeflate(entryPath, { level: 6 });
  zip.add(def);
  let curr = chunks.next();
  if (curr.done) {
    def.push(new Uint8Array(0), true);
    await flushChunks();
    return;
  }
  while (!curr.done) {
    const next = chunks.next();
    const isFinal = Boolean(next.done);
    def.push(strToU8(curr.value), isFinal);
    await flushChunks();
    curr = next;
  }
}

async function pushPhotoManifestToZipDeflate(
  zip: Zip,
  manifest: BackupPhotoManifestEntry[],
  filterSpecies: string | undefined,
  flushChunks: () => Promise<void>
): Promise<void> {
  const def = new ZipDeflate('photos/manifest.json', { level: 6 });
  zip.add(def);

  const headerObj = {
    format: 'community-pedigree-photos-archive-v1',
    package: 'Pedigree',
    exportedAtIsoUtc: nowIsoUtc(),
    filterSpecies: filterSpecies || null,
    photoCount: manifest.length,
  };
  const headerJson = JSON.stringify(headerObj, null, 2);
  let buffer = headerJson.slice(0, -1).trimEnd() + ',\n';

  if (manifest.length === 0) {
    buffer += '  "photos": []\n}';
    def.push(strToU8(buffer), true);
    await flushChunks();
    return;
  }

  buffer += '  "photos": [\n';
  for (let i = 0; i < manifest.length; i++) {
    const itemJson = JSON.stringify(manifest[i], null, 2);
    buffer += `    ${itemJson.replace(/\n/g, '\n    ')}`;
    buffer += i < manifest.length - 1 ? ',\n' : '\n';
    if (buffer.length >= ZIP_TEXT_SLICE_CHARS) {
      def.push(strToU8(buffer), false);
      await flushChunks();
      buffer = '';
    }
  }
  buffer += '  ]\n}';
  def.push(strToU8(buffer), true);
  await flushChunks();
}

async function streamArchivePhotoEntries(
  zip: Zip,
  snapshot: BarnDatabaseSnapshot,
  filterSpecies: string | undefined,
  flushChunks: () => Promise<void>
): Promise<{
  manifest: BackupPhotoManifestEntry[];
  animalCount: number;
  totalImageBinaryBytes: number;
}> {
  const animals = filterSpecies
    ? snapshot.animals.filter((a) => isSameSpecies(a.species, filterSpecies))
    : snapshot.animals;
  const animalById = new Map(animals.map((a) => [a.id, a]));

  const photos = (snapshot.animalPhotos ?? [])
    .filter((p) =>
      filterSpecies
        ? isSameSpecies(p.species, filterSpecies) || animalById.has(p.animalId)
        : true
    )
    .sort((a, b) => {
      if (a.species !== b.species) return a.species.localeCompare(b.species);
      if (a.animalId !== b.animalId) return a.animalId.localeCompare(b.animalId);
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    });

  const manifest: BackupPhotoManifestEntry[] = [];
  const usedPaths = new Set<string>();
  const countPerAnimal = new Map<string, number>();
  const uniqueAnimalsWithPhotos = new Set<string>();
  let totalImageBinaryBytes = 0;

  for (const photo of photos) {
    const decoded = dataUrlToBinary(photo.dataUrl, photo.mimeType);
    if (!decoded || decoded.bytes.byteLength === 0) continue;

    const animal = animalById.get(photo.animalId);
    const speciesFolder = sanitizePathSegment(
      animal?.species || photo.species || 'Livestock',
      'Livestock'
    );
    const animalFolderRaw = animal
      ? [animal.tattoo, animal.name].filter(Boolean).join('_') || animal.id.slice(0, 8)
      : `animal-${photo.animalId.slice(0, 8)}`;
    const animalFolder = sanitizePathSegment(animalFolderRaw, photo.animalId.slice(0, 8));

    const idx = (countPerAnimal.get(photo.animalId) || 0) + 1;
    countPerAnimal.set(photo.animalId, idx);
    const numPrefix = String(idx).padStart(2, '0');
    const roleTag = photo.isPrimary ? 'cover' : 'photo';

    const origBaseRaw = (photo.originalFileName || '').replace(/\.[^.]+$/, '');
    const origBase = origBaseRaw ? `-${sanitizePathSegment(origBaseRaw, 'img')}` : '';
    const ext = extensionForMime(decoded.mimeType, photo.originalFileName);

    let archivePath = `photos/${speciesFolder}/${animalFolder}/${numPrefix}-${roleTag}${origBase}.${ext}`;
    let collision = 2;
    while (usedPaths.has(archivePath)) {
      archivePath = `photos/${speciesFolder}/${animalFolder}/${numPrefix}-${roleTag}${origBase}-${collision}.${ext}`;
      collision++;
    }
    usedPaths.add(archivePath);

    const storedBytesLen = decoded.bytes.byteLength;
    const pass = new ZipPassThrough(archivePath);
    zip.add(pass);
    pass.push(decoded.bytes, true);
    await flushChunks();

    totalImageBinaryBytes += storedBytesLen;
    uniqueAnimalsWithPhotos.add(photo.animalId);

    manifest.push({
      id: photo.id,
      species: animal?.species || photo.species,
      animalId: photo.animalId,
      animalName: animal?.name || '',
      animalTattoo: animal?.tattoo || '',
      isPrimary: photo.isPrimary,
      sortOrder: photo.sortOrder,
      caption: photo.caption,
      originalFileName: photo.originalFileName || `${numPrefix}-${roleTag}.${ext}`,
      mimeType: decoded.mimeType,
      width: photo.width,
      height: photo.height,
      originalBytes: photo.originalBytes,
      storedBytes: storedBytesLen,
      archivePath,
      thumbnailDataUrl: photo.thumbnailDataUrl || '',
      createdAt: photo.createdAt,
      updatedAt: photo.updatedAt,
    });
  }

  return {
    manifest,
    animalCount: uniqueAnimalsWithPhotos.size,
    totalImageBinaryBytes,
  };
}

function createStreamingZipDriver(onChunk: (chunk: Uint8Array) => Promise<void> | void) {
  const pendingChunks: Uint8Array[] = [];
  let streamError: Error | null = null;
  let totalZipBytes = 0;

  const zip = new Zip((err, chunk) => {
    if (err) {
      streamError = err instanceof Error ? err : new Error(String(err));
      return;
    }
    if (chunk && chunk.byteLength > 0) {
      pendingChunks.push(chunk);
    }
  });

  const flushChunks = async (): Promise<void> => {
    if (streamError) {
      throw streamError;
    }
    while (pendingChunks.length > 0) {
      const batch = pendingChunks.splice(0, pendingChunks.length);
      for (const chunk of batch) {
        totalZipBytes += chunk.byteLength;
        await onChunk(chunk);
      }
    }
    if (streamError) {
      throw streamError;
    }
  };

  return {
    zip,
    flushChunks,
    getTotalZipBytes: () => totalZipBytes,
  };
}

/**
 * Streams a **Photos-Only `.ZIP`** archive incrementally chunk-by-chunk (one decoded photo at a time)
 * so large photo libraries never materialize the full archive in JS heap beforehand.
 */
export async function streamPhotosOnlyZipArchive(
  snapshot: BarnDatabaseSnapshot,
  onChunk: (chunk: Uint8Array) => Promise<void> | void,
  filterSpecies?: string
): Promise<StreamingZipArchiveSummary> {
  const { zip, flushChunks, getTotalZipBytes } = createStreamingZipDriver(onChunk);

  try {
    const { manifest, animalCount, totalImageBinaryBytes } = await streamArchivePhotoEntries(
      zip,
      snapshot,
      filterSpecies,
      flushChunks
    );

    await pushPhotoManifestToZipDeflate(zip, manifest, filterSpecies, flushChunks);

    const readme = [
      'Community Pedigree — Portable Animal Photos Archive',
      `Exported: ${nowIsoUtc()}`,
      `Photos Included: ${manifest.length} across ${animalCount} animal(s)`,
      '',
      'Folders inside photos/ hold standard viewable image files (.webp / .jpg / .png).',
      'Use "Merge Backup (.JSON / .ZIP)" in Barn Settings -> Open Data Portability & Backups',
      'to merge these photos back onto matching animals on any device.',
    ].join('\n');
    await pushTextToZipDeflate(zip, 'README.txt', readme, flushChunks);

    zip.end();
    await flushChunks();

    return {
      totalZipBytes: getTotalZipBytes(),
      photoCount: manifest.length,
      animalCount,
      binderCount: 0,
      totalImageBinaryBytes,
    };
  } catch (err) {
    try {
      zip.terminate();
    } catch {
      // Ignore terminate cleanup errors
    }
    throw err;
  }
}

/**
 * Streams a **Complete Barn Archive + Photos (`.ZIP`)** incrementally chunk-by-chunk
 * (`pedigree-backup.json` JSON chunks, one species `binder/*.htm` at a time, and one
 * decoded photo binary at a time) so large archives write directly to OPFS `/tmp` in low RAM.
 */
export async function streamCompleteBackupZipArchive(
  snapshot: BarnDatabaseSnapshot,
  onChunk: (chunk: Uint8Array) => Promise<void> | void,
  filterSpecies?: string,
  extraMeta?: {
    backupScope?: 'barn' | 'species';
    backupReason?: SpeciesBackupReason;
    targetSpecies?: string;
  }
): Promise<StreamingZipArchiveSummary> {
  const { zip, flushChunks, getTotalZipBytes } = createStreamingZipDriver(onChunk);

  try {
    const { manifest, totalImageBinaryBytes } = await streamArchivePhotoEntries(
      zip,
      snapshot,
      filterSpecies,
      flushChunks
    );

    const scopedSnapshot: BarnDatabaseSnapshot = filterSpecies
      ? {
          settings: snapshot.settings,
          speciesProfiles: snapshot.speciesProfiles.filter((sp) =>
            isSameSpecies(sp.name, filterSpecies)
          ),
          animals: snapshot.animals.filter((a) => isSameSpecies(a.species, filterSpecies)),
          animalPhotos: [],
          cages: snapshot.cages.filter((c) => isSameSpecies(c.species, filterSpecies)),
          breedings: snapshot.breedings.filter((b) => isSameSpecies(b.species, filterSpecies)),
          tasks: snapshot.tasks.filter((t) => isSameSpecies(t.species, filterSpecies)),
          careLogs: snapshot.careLogs.filter((l) => isSameSpecies(l.species, filterSpecies)),
          shows: snapshot.shows.filter((s) => isSameSpecies(s.species, filterSpecies)),
          feedBatches: (snapshot.feedBatches ?? []).filter((f) =>
            isSameSpecies(f.species, filterSpecies)
          ),
          feedAllocations: (snapshot.feedAllocations ?? []).filter((a) =>
            isSameSpecies(a.species, filterSpecies)
          ),
          ledgerEntries: (snapshot.ledgerEntries ?? []).filter((e) =>
            isSameSpecies(e.species, filterSpecies)
          ),
          processingLogs: (snapshot.processingLogs ?? []).filter((p) =>
            isSameSpecies(p.species, filterSpecies)
          ),
          youthProjectBooks: (snapshot.youthProjectBooks ?? []).filter((y) =>
            isSameSpecies(y.species, filterSpecies)
          ),
          clientContacts: (snapshot.clientContacts ?? []).filter((c) =>
            isSameSpecies(c.species, filterSpecies)
          ),
          waitlistEntries: (snapshot.waitlistEntries ?? []).filter((w) =>
            isSameSpecies(w.species, filterSpecies)
          ),
          animalReservations: (snapshot.animalReservations ?? []).filter((r) =>
            isSameSpecies(r.species, filterSpecies)
          ),
          woolHarvests: (snapshot.woolHarvests ?? []).filter((w) =>
            isSameSpecies(w.species, filterSpecies)
          ),
        }
      : {
          ...snapshot,
          animalPhotos: [],
        };

    const resolvedMeta = extraMeta
      ? extraMeta
      : filterSpecies
      ? {
          backupScope: 'species' as const,
          backupReason: 'manual' as SpeciesBackupReason,
          targetSpecies: filterSpecies,
        }
      : undefined;

    await pushJsonGeneratorToZipDeflate(
      zip,
      'pedigree-backup.json',
      generateBarnBackupJsonChunks(scopedSnapshot, resolvedMeta),
      flushChunks
    );

    const targetSpeciesNames: string[] = [];
    const seenSpecies = new Set<string>();
    const registerTargetSpecies = (rawName: string | undefined) => {
      const clean = (rawName || '').trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      if (seenSpecies.has(key)) return;
      seenSpecies.add(key);
      targetSpeciesNames.push(clean);
    };

    if (filterSpecies) {
      const matched = snapshot.speciesProfiles.find((sp) =>
        isSameSpecies(sp.name, filterSpecies)
      );
      registerTargetSpecies(matched?.name || filterSpecies);
    } else {
      for (const sp of snapshot.speciesProfiles) {
        registerTargetSpecies(sp.name);
      }
      for (const a of snapshot.animals) {
        registerTargetSpecies(a.species);
      }
    }

    let binderCount = 0;
    const usedBinderPaths = new Set<string>();
    for (const spName of targetSpeciesNames) {
      const spSlug = sanitizePathSegment(spName.toLowerCase(), 'species');
      let binderPath = `binder/${spSlug}-binder.htm`;
      let suffix = 2;
      while (usedBinderPaths.has(binderPath)) {
        binderPath = `binder/${spSlug}-${suffix}-binder.htm`;
        suffix++;
      }
      usedBinderPaths.add(binderPath);

      const binderHtml = generateSpeciesBarnBinderHtml(snapshot, spName, {
        colorMode: 'color',
        includeArchived: true,
        includePhotos: true,
        includeCoverAndSignature: true,
        includeSpeciesOverview: true,
        includeHealthAndLitters: true,
        includeShowsAndKinship: true,
      });
      await pushTextToZipDeflate(zip, binderPath, binderHtml, flushChunks);
      binderCount++;
    }

    await pushPhotoManifestToZipDeflate(zip, manifest, filterSpecies, flushChunks);

    const readme = [
      'Community Pedigree — Complete Portable Backup Archive (.ZIP)',
      `Barn: ${snapshot.settings.barnName}`,
      `Exported: ${nowIsoUtc()}`,
      `Animals: ${scopedSnapshot.animals.length}`,
      `Photos: ${manifest.length}`,
      `Printable Barn Binders: ${binderCount}`,
      '',
      'Contents:',
      '- pedigree-backup.json: Complete herd, lineage, breeding, chore, care log, and species memo pad database.',
      '- binder/*.htm: Complete human-readable Printable Barn Binder per species (pedigrees, health, litters, shows, kinship, photos, and signature page).',
      '- photos/: Standard viewable image files organized by species and animal.',
      '- photos/manifest.json: Index linking every image file to its animal UUID, tattoo, cover flag, and caption.',
      '',
      'To restore or merge everything back into Community Pedigree on any phone or PC:',
      'Open Settings -> Open Data Portability & Backups -> Restore or Merge (.JSON / .ZIP).',
    ].join('\n');
    await pushTextToZipDeflate(zip, 'README.txt', readme, flushChunks);

    zip.end();
    await flushChunks();

    return {
      totalZipBytes: getTotalZipBytes(),
      photoCount: manifest.length,
      animalCount: scopedSnapshot.animals.length,
      binderCount,
      totalImageBinaryBytes,
    };
  } catch (err) {
    try {
      zip.terminate();
    } catch {
      // Ignore terminate cleanup errors
    }
    throw err;
  }
}

function isZipMagicBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function findEntryCaseInsensitive(
  unzipped: Record<string, Uint8Array>,
  expectedPath: string
): Uint8Array | undefined {
  if (unzipped[expectedPath]) return unzipped[expectedPath];
  const targetLower = expectedPath.replace(/\\/g, '/').toLowerCase();
  for (const [key, val] of Object.entries(unzipped)) {
    if (key.replace(/\\/g, '/').toLowerCase() === targetLower) {
      return val;
    }
  }
  return undefined;
}

/**
 * Parses either a standalone `.json` backup or a `.zip` archive (Complete Archive OR Photos-Only ZIP).
 */
export function parseBackupArchiveInput(
  bytes: Uint8Array,
  fileName: string,
  fallbackSettings: BarnSettings
): ParsedBackupArchive {
  const lowerName = (fileName || '').toLowerCase();
  const isZip = isZipMagicBytes(bytes) || lowerName.endsWith('.zip');

  const sizeCheck = validateUploadFileSize(
    fileName || 'backup',
    bytes.byteLength,
    isZip ? MAX_ZIP_ARCHIVE_BYTES : MAX_JSON_BACKUP_BYTES,
    isZip ? 'a backup .ZIP archive' : 'a JSON backup file'
  );
  if (!sizeCheck.ok) {
    throw new Error(sizeCheck.error);
  }

  if (!isZip) {
    const jsonText = strFromU8(bytes);
    const snapshot = parseBarnBackupJson(jsonText, fallbackSettings);
    return {
      kind: 'full_snapshot',
      snapshot,
      photosReconstructed: snapshot.animalPhotos.length,
      sourceFormat: 'json',
    };
  }

  const unzipped = safeUnzipArchive(bytes, { archiveName: fileName || 'backup.zip' });

  const ts = nowIsoUtc();
  const manifestBytes = findEntryCaseInsensitive(unzipped, 'photos/manifest.json');
  let manifestEntries: BackupPhotoManifestEntry[] = [];
  const reconstructedPhotos: AnimalPhoto[] = [];

  if (manifestBytes) {
    if (manifestBytes.byteLength > MAX_JSON_BACKUP_BYTES) {
      throw new Error('ZIP archive photos/manifest.json exceeds the maximum safe JSON size limit.');
    }
    try {
      const parsedManifest = JSON.parse(strFromU8(manifestBytes));
      const rawList: any[] = Array.isArray(parsedManifest?.photos)
        ? parsedManifest.photos
        : Array.isArray(parsedManifest)
        ? parsedManifest
        : [];
      manifestEntries = rawList;

      for (let i = 0; i < rawList.length; i++) {
        const entry = rawList[i];
        const archivePath = sanitizeSingleLineText(entry?.archivePath || '', 400);
        if (!archivePath || !entry?.animalId) continue;
        const imgBytes = findEntryCaseInsensitive(unzipped, archivePath);
        if (!imgBytes || imgBytes.byteLength === 0) continue;

        const mimeType = sanitizeSingleLineText(entry.mimeType || 'image/webp', 80) || 'image/webp';
        if (isSvgImageInput(mimeType, archivePath, imgBytes)) {
          continue;
        }
        const dataUrl = sanitizeSafeRasterImageDataUrl(binaryToDataUrl(mimeType, imgBytes));
        if (!dataUrl) continue;
        const safeThumb = sanitizeSafeRasterImageDataUrl(entry.thumbnailDataUrl) || dataUrl;
        reconstructedPhotos.push({
          id: sanitizeSingleLineText(entry.id, 120) || generateUuid(),
          species: sanitizeSingleLineText(entry.species || 'Rabbit', 100) || 'Rabbit',
          animalId: sanitizeSingleLineText(entry.animalId, 120),
          isPrimary: Boolean(entry.isPrimary),
          sortOrder: typeof entry.sortOrder === 'number' && Number.isFinite(entry.sortOrder) ? entry.sortOrder : i,
          caption: sanitizePlainText(entry.caption || '', 2000),
          originalFileName: sanitizeSingleLineText(entry.originalFileName || '', 260),
          mimeType,
          width: Math.max(0, Number(entry.width) || 0),
          height: Math.max(0, Number(entry.height) || 0),
          originalBytes: Math.max(0, Number(entry.originalBytes) || imgBytes.byteLength),
          storedBytes: imgBytes.byteLength,
          thumbnailDataUrl: safeThumb,
          dataUrl,
          createdAt: sanitizeSingleLineText(entry.createdAt || ts, 64) || ts,
          updatedAt: sanitizeSingleLineText(entry.updatedAt || ts, 64) || ts,
        });
      }
    } catch {
      throw new Error('ZIP archive has a corrupted photos/manifest.json index.');
    }
  }

  // Locate main backup JSON inside ZIP
  let mainBackupBytes = findEntryCaseInsensitive(unzipped, 'pedigree-backup.json');
  if (!mainBackupBytes) {
    for (const [entryKey, entryVal] of Object.entries(unzipped)) {
      const normalized = entryKey.replace(/\\/g, '/').toLowerCase();
      if (
        normalized.endsWith('.json') &&
        !normalized.endsWith('photos/manifest.json') &&
        !normalized.startsWith('binder/') &&
        !normalized.includes('__macosx') &&
        entryVal.byteLength <= MAX_JSON_BACKUP_BYTES
      ) {
        const txt = strFromU8(entryVal);
        if (txt.includes('"animals"') || txt.includes('"speciesProfiles"')) {
          mainBackupBytes = entryVal;
          break;
        }
      }
    }
  }

  if (mainBackupBytes) {
    if (mainBackupBytes.byteLength > MAX_JSON_BACKUP_BYTES) {
      throw new Error('Backup JSON inside ZIP archive exceeds the rational 150 MB size limit.');
    }
    const parsedSnap = parseBarnBackupJson(strFromU8(mainBackupBytes), fallbackSettings);
    const mergedPhotos =
      reconstructedPhotos.length > 0 ? reconstructedPhotos : parsedSnap.animalPhotos;
    return {
      kind: 'full_snapshot',
      snapshot: {
        ...parsedSnap,
        animalPhotos: mergedPhotos,
      },
      photosReconstructed: mergedPhotos.length,
      sourceFormat: 'zip',
    };
  }

  if (manifestBytes) {
    return {
      kind: 'photos_only',
      photos: reconstructedPhotos,
      manifestEntries,
      sourceFormat: 'zip',
    };
  }

  throw new Error(
    'This ZIP does not contain a Community Pedigree backup (pedigree-backup.json or photos/manifest.json). For third-party exports (HerdBoss / Evans), use the Multi-Platform Importer above.'
  );
}

/**
 * Merges reconstructed photos from a Photos-Only ZIP into the local snapshot,
 * matching by exact `animalId` first and falling back to `(species + tattoo)` or `(species + name)`.
 */
export function mergePhotosOnlyIntoSnapshot(
  local: BarnDatabaseSnapshot,
  incomingPhotos: AnimalPhoto[],
  manifestEntries: BackupPhotoManifestEntry[] = []
): {
  nextSnapshot: BarnDatabaseSnapshot;
  photosAdded: number;
  photosUpdated: number;
  unmatchedSkipped: number;
} {
  const animalById = new Map<string, Animal>(local.animals.map((a) => [a.id, a]));
  const manifestByPhotoId = new Map(manifestEntries.map((m) => [m.id, m]));

  const findMatchingAnimal = (photo: AnimalPhoto): Animal | undefined => {
    const direct = animalById.get(photo.animalId);
    if (direct) return direct;
    const meta = manifestByPhotoId.get(photo.id);
    if (!meta) return undefined;
    const targetSpecies = meta.species || photo.species;
    const targetTattoo = (meta.animalTattoo || '').trim().toLowerCase();
    const targetName = (meta.animalName || '').trim().toLowerCase();

    if (targetTattoo) {
      const byTattoo = local.animals.find(
        (a) =>
          isSameSpecies(a.species, targetSpecies) &&
          a.tattoo.trim().toLowerCase() === targetTattoo
      );
      if (byTattoo) return byTattoo;
    }
    if (targetName) {
      return local.animals.find(
        (a) =>
          isSameSpecies(a.species, targetSpecies) &&
          a.name.trim().toLowerCase() === targetName
      );
    }
    return undefined;
  };

  const photoMap = new Map<string, AnimalPhoto>();
  for (const p of local.animalPhotos ?? []) {
    photoMap.set(p.id, p);
  }

  let photosAdded = 0;
  let photosUpdated = 0;
  let unmatchedSkipped = 0;

  for (const inc of incomingPhotos) {
    const matchedAnimal = findMatchingAnimal(inc);
    if (!matchedAnimal) {
      unmatchedSkipped++;
      continue;
    }
    const normalizedInc: AnimalPhoto = {
      ...inc,
      animalId: matchedAnimal.id,
      species: matchedAnimal.species,
    };
    const existing = photoMap.get(normalizedInc.id);
    const existingHasBlob = Boolean(existing?.dataUrl || existing?.thumbnailDataUrl);
    const incHasBlob = Boolean(normalizedInc.dataUrl || normalizedInc.thumbnailDataUrl);
    if (!existing) {
      photoMap.set(normalizedInc.id, normalizedInc);
      photosAdded++;
    } else if (!existingHasBlob && incHasBlob) {
      const incIsNewer = (normalizedInc.updatedAt || '') > (existing.updatedAt || '');
      photoMap.set(normalizedInc.id, {
        ...(incIsNewer ? normalizedInc : existing),
        dataUrl: normalizedInc.dataUrl,
        thumbnailDataUrl: normalizedInc.thumbnailDataUrl,
        mimeType: normalizedInc.mimeType || existing.mimeType,
        width: normalizedInc.width || existing.width,
        height: normalizedInc.height || existing.height,
        originalBytes: normalizedInc.originalBytes || existing.originalBytes,
        storedBytes: normalizedInc.storedBytes || existing.storedBytes,
      });
      photosUpdated++;
    } else if ((normalizedInc.updatedAt || '') > (existing.updatedAt || '')) {
      photoMap.set(
        normalizedInc.id,
        !incHasBlob && existingHasBlob
          ? {
              ...normalizedInc,
              dataUrl: existing.dataUrl,
              thumbnailDataUrl: existing.thumbnailDataUrl,
            }
          : normalizedInc
      );
      photosUpdated++;
    }
  }

  // Ensure every animal with photos has at least one primary photo and not multiple primaries
  const mergedList = Array.from(photoMap.values());
  const byAnimal = new Map<string, AnimalPhoto[]>();
  for (const p of mergedList) {
    const arr = byAnimal.get(p.animalId) || [];
    arr.push(p);
    byAnimal.set(p.animalId, arr);
  }
  for (const arr of byAnimal.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
    const primaries = arr.filter((p) => p.isPrimary);
    if (primaries.length === 0 && arr.length > 0) {
      arr[0].isPrimary = true;
    } else if (primaries.length > 1) {
      let keptFirst = false;
      for (const p of arr) {
        if (p.isPrimary) {
          if (!keptFirst) keptFirst = true;
          else p.isPrimary = false;
        }
      }
    }
  }

  return {
    nextSnapshot: {
      ...local,
      animalPhotos: mergedList,
    },
    photosAdded,
    photosUpdated,
    unmatchedSkipped,
  };
}
```

## `src/core/backupStatus.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Backup Status, Timestamps & Reminder Policy Engine (`src/core/backupStatus.ts`).
 *
 * Zero DOM dependencies so backup freshness rules are unit-testable and portable.
 */

import { BarnDatabaseSnapshot, nowEpochMs, PREDEFINED_SPECIES_PRESETS } from './models';
import { isSampleTestingId } from './sampleData';

export interface LastBackupMeta {
  exportedAtIso: string;
  format: 'zip' | 'sqlite' | 'json';
  fileName?: string;
}

export type BackupHealthLevel =
  | 'up_to_date'
  | 'changes_pending'
  | 'overdue'
  | 'never_backed_up';

export interface BackupStatusEvaluation {
  level: BackupHealthLevel;
  hasRealData: boolean;
  hasChangesSinceBackup: boolean;
  ageDays: number | null;
  latestRecordUpdatedAt: string;
  needsReminder: boolean;
  showDismissibleBanner: boolean;
  headline: string;
  detail: string;
  lastExportLabel: string;
  lastExportRelative: string;
  latestChangeLabel: string;
}

const PREDEFINED_SPECIES_LOWER = new Set(
  PREDEFINED_SPECIES_PRESETS.map((p) => p.name.trim().toLowerCase())
);

/**
 * Formats an ISO-8601 timestamp into a clean human-readable local date & time string.
 */
export function formatLocalDateTimeReadable(iso: string | undefined | null): string {
  if (!iso) return 'Not recorded';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Formats a concise relative age label (e.g. "just now", "2h ago", "5d ago").
 */
export function formatRelativeBackupAge(
  iso: string | undefined | null,
  nowMs: number = nowEpochMs()
): string {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Scans all barn collections and settings to find the newest ISO-8601 `updatedAt` timestamp.
 */
export function getLatestSnapshotTimestamp(snapshot: BarnDatabaseSnapshot): string {
  let latest = snapshot.settings.updatedAt || '';
  const checkItems = (items: Array<{ updatedAt?: string }> | undefined) => {
    if (!items) return;
    for (const item of items) {
      if (item.updatedAt && item.updatedAt > latest) {
        latest = item.updatedAt;
      }
    }
  };
  checkItems(snapshot.speciesProfiles);
  checkItems(snapshot.animals);
  checkItems(snapshot.animalPhotos);
  checkItems(snapshot.cages);
  checkItems(snapshot.breedings);
  checkItems(snapshot.tasks);
  checkItems(snapshot.careLogs);
  checkItems(snapshot.shows);
  checkItems(snapshot.feedBatches);
  checkItems(snapshot.feedAllocations);
  checkItems(snapshot.ledgerEntries);
  checkItems(snapshot.processingLogs);
  checkItems(snapshot.youthProjectBooks);
  checkItems(snapshot.clientContacts);
  checkItems(snapshot.waitlistEntries);
  checkItems(snapshot.animalReservations);
  checkItems(snapshot.woolHarvests);
  return latest;
}

/**
 * Returns `true` when the user has non-sample livestock records, photos, custom species,
 * or a personalized barn/breeder setup worth backing up proactively.
 */
export function hasNonTestingBarnData(snapshot: BarnDatabaseSnapshot): boolean {
  const hasRealAnimals = snapshot.animals.some((a) => !isSampleTestingId(a.id));
  const hasPhotos = (snapshot.animalPhotos ?? []).length > 0;
  const hasRealBreedings = snapshot.breedings.some((b) => !isSampleTestingId(b.id));
  const hasRealCages = snapshot.cages.some((c) => !isSampleTestingId(c.id));
  const hasRealTasks = snapshot.tasks.some((t) => !isSampleTestingId(t.id));
  const hasRealLogs = snapshot.careLogs.some((l) => !isSampleTestingId(l.id));
  const hasRealShows = snapshot.shows.some((s) => !isSampleTestingId(s.id));
  const hasRealFeedBatches = (snapshot.feedBatches ?? []).some((f) => !isSampleTestingId(f.id));
  const hasRealFeedAllocs = (snapshot.feedAllocations ?? []).some((a) => !isSampleTestingId(a.id));
  const hasRealLedgerEntries = (snapshot.ledgerEntries ?? []).some((e) => !isSampleTestingId(e.id));
  const hasRealProcessingLogs = (snapshot.processingLogs ?? []).some((p) => !isSampleTestingId(p.id));
  const hasRealYouthBooks = (snapshot.youthProjectBooks ?? []).some((y) => !isSampleTestingId(y.id));
  const hasRealClients = (snapshot.clientContacts ?? []).some((c) => !isSampleTestingId(c.id));
  const hasRealWaitlist = (snapshot.waitlistEntries ?? []).some((w) => !isSampleTestingId(w.id));
  const hasRealReservations = (snapshot.animalReservations ?? []).some((r) => !isSampleTestingId(r.id));
  const hasRealWoolHarvests = (snapshot.woolHarvests ?? []).some((w) => !isSampleTestingId(w.id));
  const hasCustomSpecies = snapshot.speciesProfiles.some(
    (sp) => !PREDEFINED_SPECIES_LOWER.has(sp.name.trim().toLowerCase())
  );
  const hasSpeciesMemo = snapshot.speciesProfiles.some(
    (sp) => (sp.memoText || '').trim().length > 0
  );

  return (
    hasRealAnimals ||
    hasPhotos ||
    hasRealBreedings ||
    hasRealCages ||
    hasRealTasks ||
    hasRealLogs ||
    hasRealShows ||
    hasRealFeedBatches ||
    hasRealFeedAllocs ||
    hasRealLedgerEntries ||
    hasRealProcessingLogs ||
    hasRealYouthBooks ||
    hasRealClients ||
    hasRealWaitlist ||
    hasRealReservations ||
    hasRealWoolHarvests ||
    hasCustomSpecies ||
    hasSpeciesMemo
  );
}

/**
 * Evaluates backup freshness, pending changes, readable timestamps, and whether a proactive
 * reminder banner should be surfaced outside Settings.
 */
export function evaluateBackupStatus(
  snapshot: BarnDatabaseSnapshot,
  lastBackup: LastBackupMeta | null,
  nowMs: number = nowEpochMs(),
  snoozedUntilMs: number = 0,
  overdueDaysThreshold: number = 7
): BackupStatusEvaluation {
  const latestRecordUpdatedAt = getLatestSnapshotTimestamp(snapshot);
  const latestChangeLabel = formatLocalDateTimeReadable(latestRecordUpdatedAt);
  const hasRealData = hasNonTestingBarnData(snapshot);

  const exportMs = lastBackup ? new Date(lastBackup.exportedAtIso).getTime() : NaN;
  const hasValidLastBackup = Boolean(lastBackup && !Number.isNaN(exportMs));

  const ageDays = hasValidLastBackup
    ? Math.max(0, (nowMs - exportMs) / (1000 * 60 * 60 * 24))
    : null;

  const hasChangesSinceBackup = Boolean(
    hasValidLastBackup &&
      latestRecordUpdatedAt &&
      latestRecordUpdatedAt > lastBackup!.exportedAtIso
  );

  const lastExportLabel = hasValidLastBackup
    ? `${formatLocalDateTimeReadable(lastBackup!.exportedAtIso)} (.${lastBackup!.format.toUpperCase()})`
    : 'Never exported';
  const lastExportRelative = hasValidLastBackup
    ? formatRelativeBackupAge(lastBackup!.exportedAtIso, nowMs)
    : '';

  let level: BackupHealthLevel = 'up_to_date';
  let headline = 'Barn data backed up externally';
  let detail = hasValidLastBackup
    ? `Your latest barn edits are covered by your ${lastExportLabel} export.`
    : 'No local backup file has been saved yet.';

  if (!hasValidLastBackup) {
    level = 'never_backed_up';
    headline = 'No external backup exported yet';
    detail =
      'Download a complete .ZIP backup (Settings → Backups & Import) to safeguard your records, SQLite database, and images.';
  } else if (hasChangesSinceBackup && ageDays !== null && ageDays >= overdueDaysThreshold) {
    level = 'overdue';
    const wholeDays = Math.floor(ageDays);
    headline = `Backup is ${wholeDays} day${wholeDays === 1 ? '' : 's'} old with new edits`;
    detail = `Last export was ${lastExportLabel}, and records were updated ${latestChangeLabel}.`;
  } else if (hasChangesSinceBackup) {
    level = 'changes_pending';
    headline = 'New changes since your last backup';
    detail = `Records updated ${latestChangeLabel} after your ${lastExportLabel} export.`;
  } else if (ageDays !== null && ageDays >= overdueDaysThreshold) {
    level = 'overdue';
    const wholeDays = Math.floor(ageDays);
    headline = `Last backup was ${wholeDays} day${wholeDays === 1 ? '' : 's'} ago`;
    detail = 'Download a fresh .ZIP snapshot periodically for extra peace of mind.';
  }

  const needsReminder = level !== 'up_to_date';
  const isSnoozed = snoozedUntilMs > nowMs;
  const showDismissibleBanner = hasRealData && needsReminder && !isSnoozed;

  return {
    level,
    hasRealData,
    hasChangesSinceBackup,
    ageDays,
    latestRecordUpdatedAt,
    needsReminder,
    showDismissibleBanner,
    headline,
    detail,
    lastExportLabel,
    lastExportRelative,
    latestChangeLabel,
  };
}
```

## `src/core/backupVault.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Hybrid Backup Vault, `_schemaVersion` Migrator, Export Canary,
 * and Archived Herds Bundle Packager (`src/core/backupVault.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript + `fflate` Uint8Array zip/unzip with ZERO browser DOM
 * (`window`, `document`, `navigator`, `indexedDB`) or Node dependencies.
 */

import { strFromU8, strToU8, zipSync, Zippable } from 'fflate';
import {
  BackupPhotoManifestEntry,
  binaryToDataUrl,
  dataUrlToBinary,
} from './backupArchive';
import {
  isSvgImageInput,
  MAX_JSON_BACKUP_BYTES,
  MAX_ZIP_ARCHIVE_BYTES,
  safeUnzipArchive,
  sanitizePlainText,
  sanitizeSafeRasterImageDataUrl,
  sanitizeSingleLineText,
  validateUploadFileSize,
} from './inputSanitization';
import {
  Animal,
  AnimalPhoto,
  AnimalStatus,
  BarnDatabaseSnapshot,
  BarnSettings,
  BiologicalSex,
  CareLog,
  DEFAULT_CALENDAR_SYNC_SETTINGS,
  generateUuid,
  isSameSpecies,
  nowIsoUtc,
  PREDEFINED_SPECIES_PRESETS,
} from './models';
import { parseBarnBackupJson } from './syncAndExports';

export const CURRENT_BACKUP_SCHEMA_VERSION = 6;
export const APP_SCHEMA_BUILD_TAG = 'pedigree-pwa-v6';

export type VaultBackupKind =
  | 'monthly'
  | 'pre_upgrade'
  | 'manual'
  | 'pre_reset'
  | 'recovery_dump';

export const VAULT_KIND_LABELS: Record<VaultBackupKind, string> = {
  monthly: 'Monthly Auto',
  pre_upgrade: 'Pre-Upgrade Safety',
  manual: 'Manual Vault Save',
  pre_reset: 'Pre-Reset Safety',
  recovery_dump: 'Recovery Dump',
};

export interface VaultBackupMetadata {
  key: string;
  fileName: string;
  kind: VaultBackupKind;
  schemaVersion: number;
  createdAtIso: string;
  createdByAppVersion: string;
  barnName: string;
  animalCount: number;
  photoCount: number;
  speciesCount: number;
  byteSize: number;
  checksumSha256: string;
  source: 'opfs' | 'idb';
  note?: string;
  compressed?: boolean;
}

export interface VaultBackupEnvelope {
  format: 'community-pedigree-vault-backup';
  package: 'Pedigree';
  version: 5;
  _schemaVersion: number;
  createdAtIso: string;
  createdByAppVersion: string;
  vaultKind: VaultBackupKind;
  checksumSha256: string;
  note?: string;
  snapshot: BarnDatabaseSnapshot;
}

export interface MigratedBackupResult {
  snapshot: BarnDatabaseSnapshot;
  schemaVersion: number;
  migratedFromVersion: number;
  vaultKind: VaultBackupKind;
  createdAtIso: string;
  checksumValid: boolean | null;
  note?: string;
}

export interface ExportCanaryProbe {
  format: 'community-pedigree-canary-v1';
  _schemaVersion: number;
  createdAtIso: string;
  barnName: string;
  animalCount: number;
  speciesCount: number;
  sampleAnimalIds: string[];
  sampleAnimalNames: string[];
  checksumSha256: string;
}

export interface ExportCanaryVerificationResult {
  ok: boolean;
  reason?: string;
}

export interface ArchivedAnimalSummary {
  id: string;
  name: string;
  tattoo: string;
  species: string;
  breed: string;
  variety: string;
  sex: BiologicalSex;
  status: AnimalStatus;
  birthDateIso: string;
  soldDateIso?: string;
  deceasedDateIso?: string;
  buyerName?: string;
  deathCause?: string;
  hasPedigreeStubInDb: boolean;
}

export interface ArchivedHerdIndexEntry {
  archiveKey: string;
  fileName: string;
  createdAtIso: string;
  schemaVersion: number;
  byteSize: number;
  checksumSha256: string;
  speciesSummary: string[];
  animalCount: number;
  photoCount: number;
  careLogCount: number;
  animals: ArchivedAnimalSummary[];
}

export interface UnpackedArchivedHerdBundle {
  archiveKey: string;
  createdAtIso: string;
  schemaVersion: number;
  checksumSha256: string;
  animals: Animal[];
  animalPhotos: AnimalPhoto[];
  careLogs: CareLog[];
}

export interface BuiltArchivedBundleResult {
  archiveKey: string;
  fileName: string;
  zipBytes: Uint8Array;
  indexEntry: ArchivedHerdIndexEntry;
  nextActiveSnapshot: BarnDatabaseSnapshot;
  stubAnimalIds: string[];
  removedAnimalIds: string[];
}

// ---------------------------------------------------------------------------
// Pure TypeScript FIPS 180-4 SHA-256 Digest (zero WebCrypto/DOM dependencies)
// ---------------------------------------------------------------------------

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const SHA256_INIT = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

export function sha256HexPure(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? strToU8(input) : input;
  const len = bytes.length;
  const bitLenHi = Math.floor((len * 8) / 0x100000000);
  const bitLenLo = (len * 8) >>> 0;

  const fullBlocksEnd = Math.floor(len / 64) * 64;
  const rem = len - fullBlocksEnd;
  const tailBlocks = rem < 56 ? 1 : 2;
  const tail = new Uint8Array(tailBlocks * 64);
  if (rem > 0) {
    tail.set(bytes.subarray(fullBlocksEnd));
  }
  tail[rem] = 0x80;

  const tailView = new DataView(tail.buffer);
  tailView.setUint32(tail.length - 8, bitLenHi, false);
  tailView.setUint32(tail.length - 4, bitLenLo, false);

  const srcView =
    fullBlocksEnd > 0
      ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : null;

  const h = new Uint32Array(SHA256_INIT);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  const processBlock = (view: DataView, offset: number) => {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  };

  if (srcView) {
    for (let offset = 0; offset < fullBlocksEnd; offset += 64) {
      processBlock(srcView, offset);
    }
  }
  for (let offset = 0; offset < tail.length; offset += 64) {
    processBlock(tailView, offset);
  }

  let hex = '';
  for (let i = 0; i < 8; i++) {
    hex += h[i].toString(16).padStart(8, '0');
  }
  return hex;
}

// ---------------------------------------------------------------------------
// Minimal Empty Fallback Settings & Snapshot Shell
// ---------------------------------------------------------------------------

export function buildEmptyFallbackSettings(): BarnSettings {
  const ts = nowIsoUtc();
  return {
    id: 'barn_settings',
    barnName: 'My Barn',
    breederName: '',
    preferredUnit: 'lbs_oz',
    currencyCode: 'USD',
    defaultSpecies: 'Rabbit',
    pinnedLandingSpecies: '',
    defaultGenerations: 3,
    themeMode: 'dark',
    imageOptimizationPreset: 'balanced',
    showHomeSummaryGrid: true,
    barnNameOnboarded: false,
    ignoredTaskIds: [],
    dismissedTaskGroupKeys: {},
    dismissedMemoAlertSignatures: {},
    speciesHubBlockOrder: {},
    includePhotoOnPedigree: false,
    calendarSync: { ...DEFAULT_CALENDAR_SYNC_SETTINGS },
    autoOffloadRetiredToOpfs: false,
    updatedAt: ts,
  };
}

export function buildEmptyShellSnapshot(): BarnDatabaseSnapshot {
  const ts = nowIsoUtc();
  return {
    settings: buildEmptyFallbackSettings(),
    speciesProfiles: PREDEFINED_SPECIES_PRESETS.map((p, idx) => ({
      ...p,
      sortOrder: idx,
      createdAt: ts,
      updatedAt: ts,
    })),
    animals: [],
    animalPhotos: [],
    cages: [],
    breedings: [],
    tasks: [],
    careLogs: [],
    shows: [],
    feedBatches: [],
    feedAllocations: [],
    ledgerEntries: [],
    processingLogs: [],
    youthProjectBooks: [],
    clientContacts: [],
    waitlistEntries: [],
    animalReservations: [],
    woolHarvests: [],
  };
}

// ---------------------------------------------------------------------------
// Unified Backup Vault Envelope, Schema Migration & Root Validation
// ---------------------------------------------------------------------------

function buildVaultEnvelopeParts(
  snapshot: BarnDatabaseSnapshot,
  options: {
    kind: VaultBackupKind;
    createdAtIso?: string;
    createdByAppVersion?: string;
    note?: string;
  }
): {
  envelope: VaultBackupEnvelope;
  headerJson: string;
  snapshotJson: string;
} {
  const createdAtIso = options.createdAtIso || nowIsoUtc();
  const snapshotJson = JSON.stringify(snapshot);
  const checksumSha256 = sha256HexPure(snapshotJson);
  const sanitizedNote = options.note ? sanitizeSingleLineText(options.note, 220) : undefined;
  const headerFields: Omit<VaultBackupEnvelope, 'snapshot'> = {
    format: 'community-pedigree-vault-backup',
    package: 'Pedigree',
    version: 5,
    _schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    createdAtIso,
    createdByAppVersion: options.createdByAppVersion || APP_SCHEMA_BUILD_TAG,
    vaultKind: options.kind,
    checksumSha256,
    note: sanitizedNote,
  };
  return {
    envelope: {
      ...headerFields,
      snapshot,
    },
    headerJson: JSON.stringify(headerFields),
    snapshotJson,
  };
}

export function buildVaultBackupEnvelope(
  snapshot: BarnDatabaseSnapshot,
  options: {
    kind: VaultBackupKind;
    createdAtIso?: string;
    createdByAppVersion?: string;
    note?: string;
  }
): VaultBackupEnvelope {
  return buildVaultEnvelopeParts(snapshot, options).envelope;
}

export function serializeVaultBackupEnvelope(
  snapshot: BarnDatabaseSnapshot,
  options: {
    kind: VaultBackupKind;
    createdAtIso?: string;
    createdByAppVersion?: string;
    note?: string;
  }
): { envelope: VaultBackupEnvelope; jsonText: string } {
  const envelope = buildVaultBackupEnvelope(snapshot, options);
  const jsonText = JSON.stringify(envelope, null, 2);
  return { envelope, jsonText };
}

export interface PreUpgradeBackupVerificationResult {
  ok: boolean;
  checksumSha256: string;
  schemaVersion: number;
  animalCount: number;
  reason?: string;
}

/**
 * Generates a `_schemaVersion`-stamped, SHA-256-checksummed `pre_upgrade` JSON backup
 * and validates its round-trip parse & checksum in memory before returning.
 */
export function buildVerifiedPreUpgradeJsonBackup(
  snapshot: BarnDatabaseSnapshot,
  createdByAppVersion: string = APP_SCHEMA_BUILD_TAG,
  note = 'Automated pre-upgrade SHA-256 verified backup'
): {
  envelope: VaultBackupEnvelope;
  jsonText: string;
  verification: PreUpgradeBackupVerificationResult;
} {
  const { envelope, jsonText } = serializeVaultBackupEnvelope(snapshot, {
    kind: 'pre_upgrade',
    createdByAppVersion,
    note,
  });
  const verification = verifyPreUpgradeJsonBackup(jsonText, envelope.checksumSha256);
  if (!verification.ok) {
    throw new Error(verification.reason || 'Pre-upgrade backup checksum verification failed.');
  }
  return { envelope, jsonText, verification };
}

export function verifyPreUpgradeJsonBackup(
  jsonText: string,
  expectedChecksumSha256?: string
): PreUpgradeBackupVerificationResult {
  try {
    const parsedRaw = JSON.parse(jsonText) as Record<string, unknown>;
    const declaredChecksum =
      typeof parsedRaw?.checksumSha256 === 'string'
        ? parsedRaw.checksumSha256.trim().toLowerCase()
        : '';
    if (!declaredChecksum) {
      return {
        ok: false,
        checksumSha256: '',
        schemaVersion: Number(parsedRaw?._schemaVersion) || 0,
        animalCount: 0,
        reason: 'Pre-upgrade backup is missing a SHA-256 checksum.',
      };
    }
    if (expectedChecksumSha256 && declaredChecksum !== expectedChecksumSha256.trim().toLowerCase()) {
      return {
        ok: false,
        checksumSha256: declaredChecksum,
        schemaVersion: Number(parsedRaw?._schemaVersion) || 0,
        animalCount: 0,
        reason: 'Pre-upgrade backup SHA-256 checksum mismatch.',
      };
    }
    const migrated = migrateAndValidateBackupEnvelope(parsedRaw);
    return {
      ok: migrated.checksumValid === true,
      checksumSha256: declaredChecksum,
      schemaVersion: migrated.schemaVersion,
      animalCount: migrated.snapshot.animals.length,
    };
  } catch (err) {
    return {
      ok: false,
      checksumSha256: '',
      schemaVersion: 0,
      animalCount: 0,
      reason: err instanceof Error ? err.message : 'Pre-upgrade backup verification failed.',
    };
  }
}

export const VAULT_ZIP_ENTRY_NAME = 'vault-backup.json';

export function isZipMagicBytes(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  );
}

/**
 * Serializes a schema-v6 vault backup envelope into a compact deflate-compressed `.vault.zip` archive,
 * avoiding pretty-print whitespace bloat and reducing OPFS quota footprint by ~70–90% on text/records.
 * Reuses `snapshotJson` once instead of stringifying the entire snapshot tree twice in memory.
 */
export function serializeCompressedVaultBackupZip(
  snapshot: BarnDatabaseSnapshot,
  options: {
    kind: VaultBackupKind;
    createdAtIso?: string;
    createdByAppVersion?: string;
    note?: string;
  }
): { envelope: VaultBackupEnvelope; zipBytes: Uint8Array } {
  const { envelope, headerJson, snapshotJson } = buildVaultEnvelopeParts(snapshot, options);
  const compactJson = `${headerJson.slice(0, -1)},"snapshot":${snapshotJson}}`;
  const zipBytes = zipSync({
    [VAULT_ZIP_ENTRY_NAME]: [strToU8(compactJson), { level: 6 }],
  });
  return { envelope, zipBytes };
}

/**
 * Extracts raw JSON string from either a plain `.json` vault file or a compressed `.vault.zip` archive.
 */
export function extractVaultJsonTextFromPayload(
  payload: string | Uint8Array,
  fileName = 'vault-backup'
): string {
  if (typeof payload === 'string') {
    return payload;
  }
  if (isZipMagicBytes(payload) || fileName.toLowerCase().endsWith('.zip')) {
    const sizeCheck = validateUploadFileSize(
      fileName || 'vault-backup.zip',
      payload.byteLength,
      MAX_ZIP_ARCHIVE_BYTES,
      'a compressed vault backup'
    );
    if (!sizeCheck.ok) {
      throw new Error(sizeCheck.error);
    }
    const unzipped = safeUnzipArchive(payload, {
      archiveName: fileName || 'vault-backup.zip',
      entryFilter: (entryPath) =>
        entryPath === VAULT_ZIP_ENTRY_NAME || entryPath.toLowerCase().endsWith('.json'),
    });
    const inner =
      unzipped[VAULT_ZIP_ENTRY_NAME] ??
      Object.entries(unzipped).find(([p]) => p.toLowerCase().endsWith('.json'))?.[1];
    if (!inner || inner.byteLength === 0) {
      throw new Error('Compressed vault backup archive does not contain vault-backup.json.');
    }
    return strFromU8(inner);
  }
  return strFromU8(payload);
}

/**
 * Validates root JSON shape, verifies optional SHA-256 vault checksums, and transforms
 * legacy `v3`/`v4`/`v5` or nested Vault `_schemaVersion` payloads in memory BEFORE committing
 * anything to SQLite/IndexedDB.
 */
export function migrateAndValidateBackupEnvelope(
  rawInput: string | Record<string, unknown>,
  fallbackSettings: BarnSettings = buildEmptyFallbackSettings()
): MigratedBackupResult {
  let rawObj: unknown;
  if (typeof rawInput === 'string') {
    const sizeCheck = validateUploadFileSize(
      'vault-backup.json',
      rawInput.length,
      MAX_JSON_BACKUP_BYTES,
      'a JSON backup file'
    );
    if (!sizeCheck.ok) {
      throw new Error(sizeCheck.error);
    }
    rawObj = JSON.parse(rawInput);
  } else {
    rawObj = rawInput;
  }

  if (!rawObj || typeof rawObj !== 'object' || Array.isArray(rawObj)) {
    throw new Error('Backup JSON root must be a non-empty JSON object.');
  }

  const record = rawObj as Record<string, unknown>;
  const isVaultEnvelope =
    record.format === 'community-pedigree-vault-backup' &&
    record.snapshot &&
    typeof record.snapshot === 'object' &&
    !Array.isArray(record.snapshot);

  const schemaVersionRaw = Number(record._schemaVersion ?? record.version ?? 0);
  const migratedFromVersion =
    Number.isFinite(schemaVersionRaw) && schemaVersionRaw > 0 ? Math.round(schemaVersionRaw) : 5;

  const vaultKind: VaultBackupKind =
    record.vaultKind === 'monthly' ||
    record.vaultKind === 'pre_upgrade' ||
    record.vaultKind === 'manual' ||
    record.vaultKind === 'pre_reset' ||
    record.vaultKind === 'recovery_dump'
      ? record.vaultKind
      : 'manual';

  const createdAtIso =
    typeof record.createdAtIso === 'string' && record.createdAtIso
      ? record.createdAtIso
      : typeof record.exportedAtIsoUtc === 'string' && record.exportedAtIsoUtc
      ? record.exportedAtIsoUtc
      : nowIsoUtc();

  const note =
    typeof record.note === 'string' && record.note.trim()
      ? sanitizeSingleLineText(record.note, 220)
      : undefined;

  if (isVaultEnvelope) {
    const rawSnapshotObj = record.snapshot as Record<string, unknown>;
    if (!Array.isArray(rawSnapshotObj.animals) || !Array.isArray(rawSnapshotObj.speciesProfiles)) {
      throw new Error('Vault backup envelope is missing required animals or speciesProfiles collections.');
    }

    const rawSnapshotJson = JSON.stringify(rawSnapshotObj);
    let checksumValid: boolean | null = null;
    if (typeof record.checksumSha256 === 'string' && record.checksumSha256.trim()) {
      const computed = sha256HexPure(rawSnapshotJson);
      checksumValid = computed === record.checksumSha256.trim().toLowerCase();
      if (!checksumValid) {
        throw new Error(
          'Vault backup checksum verification failed — the file may be truncated or corrupted.'
        );
      }
    }

    const migratedSnapshot = parseBarnBackupJson(rawSnapshotJson, fallbackSettings);
    return {
      snapshot: migratedSnapshot,
      schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
      migratedFromVersion,
      vaultKind,
      createdAtIso,
      checksumValid,
      note,
    };
  }

  // Legacy or direct `community-pedigree-backup` / raw `BarnDatabaseSnapshot` JSON
  const snapshotJson = typeof rawInput === 'string' ? rawInput : JSON.stringify(record);
  const migratedSnapshot = parseBarnBackupJson(snapshotJson, fallbackSettings);

  return {
    snapshot: migratedSnapshot,
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    migratedFromVersion,
    vaultKind,
    createdAtIso,
    checksumValid: null,
    note,
  };
}

/**
 * Accepts either plain `.json` vault text or compressed `.vault.zip` bytes and migrates/validates cleanly.
 */
export function deserializeVaultBackupPayload(
  payload: string | Uint8Array,
  fallbackSettings: BarnSettings = buildEmptyFallbackSettings(),
  fileName = 'vault-backup'
): MigratedBackupResult {
  const jsonText = extractVaultJsonTextFromPayload(payload, fileName);
  return migrateAndValidateBackupEnvelope(jsonText, fallbackSettings);
}

// ---------------------------------------------------------------------------
// Export Canary Probe & Round-Trip Checksum Verifier
// ---------------------------------------------------------------------------

export function buildExportCanaryProbe(snapshot: BarnDatabaseSnapshot): ExportCanaryProbe {
  const sample = (snapshot.animals || []).slice(0, 12);
  const sampleAnimalIds = sample.map((a) => a.id);
  const sampleAnimalNames = sample.map((a) => a.name);
  const barnName = snapshot.settings?.barnName || 'My Barn';
  const animalCount = (snapshot.animals || []).length;
  const speciesCount = (snapshot.speciesProfiles || []).length;
  const bodyToHash = JSON.stringify({
    barnName,
    animalCount,
    speciesCount,
    sampleAnimalIds,
    sampleAnimalNames,
  });
  return {
    format: 'community-pedigree-canary-v1',
    _schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    createdAtIso: nowIsoUtc(),
    barnName,
    animalCount,
    speciesCount,
    sampleAnimalIds,
    sampleAnimalNames,
    checksumSha256: sha256HexPure(bodyToHash),
  };
}

export function verifyExportCanaryRoundTrip(
  expected: ExportCanaryProbe,
  roundTrippedJson: string
): ExportCanaryVerificationResult {
  try {
    const parsed = JSON.parse(roundTrippedJson) as Partial<ExportCanaryProbe>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, reason: 'Canary file did not parse into an object.' };
    }
    if (parsed.format !== 'community-pedigree-canary-v1') {
      return { ok: false, reason: 'Canary format header mismatch after OPFS read-back.' };
    }
    if (parsed._schemaVersion !== expected._schemaVersion) {
      return { ok: false, reason: 'Canary schema version drifted on OPFS read-back.' };
    }
    if (!Array.isArray(parsed.sampleAnimalIds) || !Array.isArray(parsed.sampleAnimalNames)) {
      return { ok: false, reason: 'Canary collections missing after OPFS read-back.' };
    }
    const recomputed = sha256HexPure(
      JSON.stringify({
        barnName: parsed.barnName || '',
        animalCount: Number(parsed.animalCount) || 0,
        speciesCount: Number(parsed.speciesCount) || 0,
        sampleAnimalIds: parsed.sampleAnimalIds,
        sampleAnimalNames: parsed.sampleAnimalNames,
      })
    );
    if (
      recomputed !== expected.checksumSha256 ||
      parsed.checksumSha256 !== expected.checksumSha256 ||
      parsed.animalCount !== expected.animalCount ||
      parsed.speciesCount !== expected.speciesCount ||
      parsed.sampleAnimalIds.length !== expected.sampleAnimalIds.length ||
      parsed.sampleAnimalIds.some((id, idx) => id !== expected.sampleAnimalIds[idx]) ||
      parsed.sampleAnimalNames.some((n, idx) => n !== expected.sampleAnimalNames[idx])
    ) {
      return { ok: false, reason: 'Canary checksum or record payload mismatch on OPFS read-back.' };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'Canary probe verification threw unexpectedly.',
    };
  }
}

// ---------------------------------------------------------------------------
// Archived Herds Packager (`/archives` Offload & Pedigree-Stub-Safe Restore)
// ---------------------------------------------------------------------------

function sanitizeArchiveSegment(raw: string, fallback: string): string {
  const cleaned = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 44);
  return cleaned || fallback;
}

/**
 * Walks pedigree ancestor links from all remaining (non-offloaded) animals so any target animal
 * appearing anywhere in an active pedigree ancestor chain retains a lightweight Pedigree Reference stub
 * in SQLite/IndexedDB (keeping multi-generation COI & pedigrees 100% unbroken).
 */
export function computePedigreeReferencedIds(
  allAnimals: Animal[],
  offloadingIds: Set<string>
): Set<string> {
  const byId = new Map(allAnimals.map((a) => [a.id, a]));
  const needed = new Set<string>();
  const queue: string[] = [];

  for (const a of allAnimals) {
    if (!offloadingIds.has(a.id)) {
      if (a.sireId) queue.push(a.sireId);
      if (a.damId) queue.push(a.damId);
    }
  }

  const visited = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (!id || visited.has(id)) continue;
    visited.add(id);
    if (offloadingIds.has(id)) {
      needed.add(id);
    }
    const node = byId.get(id);
    if (node) {
      if (node.sireId) queue.push(node.sireId);
      if (node.damId) queue.push(node.damId);
    }
  }

  return needed;
}

export function buildArchivedAnimalsBundle(
  snapshot: BarnDatabaseSnapshot,
  targetAnimalIds: string[],
  createdAtIso: string = nowIsoUtc()
): BuiltArchivedBundleResult {
  const requestedSet = new Set(targetAnimalIds);
  const targets = snapshot.animals.filter((a) => requestedSet.has(a.id));
  if (targets.length === 0) {
    throw new Error('Select at least one animal to offload into OPFS /archives.');
  }

  const targetIdSet = new Set(targets.map((a) => a.id));
  const referencedAncestors = computePedigreeReferencedIds(snapshot.animals, targetIdSet);

  const stamp = createdAtIso.replace(/[-:T.Z]/g, '').slice(0, 14);
  const firstAnimal = targets[0];
  const baseSlug =
    targets.length === 1
      ? sanitizeArchiveSegment(`${firstAnimal.species}-${firstAnimal.tattoo || firstAnimal.name}`, 'animal')
      : sanitizeArchiveSegment(`${firstAnimal.species}-cohort-${targets.length}`, 'cohort');
  const archiveKey = `arch-${stamp}-${baseSlug}-${generateUuid().slice(0, 6)}`;
  const fileName = `${archiveKey}.archive.zip`;

  const offloadedPhotos = (snapshot.animalPhotos ?? []).filter((p) => targetIdSet.has(p.animalId));
  const offloadedLogs = snapshot.careLogs.filter((l) => targetIdSet.has(l.animalId));

  const zipFiles: Zippable = {};
  const photoManifest: BackupPhotoManifestEntry[] = [];
  const usedPaths = new Set<string>();
  const storedAnimals: Animal[] = targets.map((a) => ({
    ...a,
    offloadedArchiveKey: undefined,
    offloadedAtIso: undefined,
  }));

  const targetById = new Map(targets.map((a) => [a.id, a]));
  for (let i = 0; i < offloadedPhotos.length; i++) {
    const p = offloadedPhotos[i];
    const srcUrl = p.dataUrl || p.thumbnailDataUrl;
    const decoded = srcUrl ? dataUrlToBinary(srcUrl, p.mimeType) : null;
    if (!decoded || decoded.bytes.byteLength === 0) continue;

    const ext = decoded.mimeType.includes('png')
      ? 'png'
      : decoded.mimeType.includes('jpeg') || decoded.mimeType.includes('jpg')
      ? 'jpg'
      : 'webp';
    let photoPath = `photos/${sanitizeArchiveSegment(p.animalId, 'animal')}/${String(i + 1).padStart(2, '0')}.${ext}`;
    while (usedPaths.has(photoPath)) {
      photoPath = `photos/${sanitizeArchiveSegment(p.animalId, 'animal')}/${String(i + 1).padStart(2, '0')}-${generateUuid().slice(0, 4)}.${ext}`;
    }
    usedPaths.add(photoPath);

    zipFiles[photoPath] = [decoded.bytes, { level: 0 }];
    const parentAnimal = targetById.get(p.animalId);
    photoManifest.push({
      id: p.id,
      species: p.species,
      animalId: p.animalId,
      animalName: parentAnimal?.name || '',
      animalTattoo: parentAnimal?.tattoo || '',
      isPrimary: p.isPrimary,
      sortOrder: p.sortOrder,
      caption: p.caption,
      originalFileName: p.originalFileName || `${i + 1}.${ext}`,
      mimeType: decoded.mimeType,
      width: p.width,
      height: p.height,
      originalBytes: p.originalBytes,
      storedBytes: decoded.bytes.byteLength,
      archivePath: photoPath,
      thumbnailDataUrl: p.thumbnailDataUrl || '',
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });
  }

  const corePayload = {
    format: 'community-pedigree-archived-cohort-v1',
    package: 'Pedigree',
    _schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    archiveKey,
    createdAtIso,
    animals: storedAnimals,
    careLogs: offloadedLogs,
    photoManifest,
  };
  const corePayloadStr = JSON.stringify(corePayload, null, 2);
  const checksumSha256 = sha256HexPure(corePayloadStr);

  const bundleEnvelopeStr = JSON.stringify(
    {
      ...corePayload,
      checksumSha256,
    },
    null,
    2
  );
  zipFiles['archive-bundle.json'] = [strToU8(bundleEnvelopeStr), { level: 6 }];
  zipFiles['README.txt'] = [
    strToU8(
      [
        'Community Pedigree — OPFS Archived Animal / Cohort Bundle',
        `Archive Key: ${archiveKey}`,
        `Archived At: ${createdAtIso}`,
        `Animals: ${storedAnimals.map((a) => `${a.name} (${a.tattoo || a.status})`).join(', ')}`,
        `Photos: ${photoManifest.length} · Care Logs: ${offloadedLogs.length}`,
      ].join('\n')
    ),
    { level: 6 },
  ];

  const zipBytes = zipSync(zipFiles);

  const stubAnimalIds: string[] = [];
  const removedAnimalIds: string[] = [];
  const nextAnimals: Animal[] = [];

  for (const animal of snapshot.animals) {
    if (!targetIdSet.has(animal.id)) {
      nextAnimals.push(animal);
      continue;
    }
    if (referencedAncestors.has(animal.id)) {
      stubAnimalIds.push(animal.id);
      nextAnimals.push({
        id: animal.id,
        tattoo: animal.tattoo,
        name: animal.name,
        species: animal.species,
        breed: animal.breed,
        variety: animal.variety,
        sex: animal.sex,
        status: animal.status === 'Active' || animal.status === 'Junior' ? 'Archived' : animal.status,
        archived: true,
        needsAttention: false,
        ignoredConflicts: [],
        birthDateIso: animal.birthDateIso,
        weightGrams: animal.weightGrams,
        genotype: animal.genotype,
        genotypeRaw: animal.genotypeRaw,
        rufusLevel: animal.rufusLevel,
        registrationNumber: animal.registrationNumber,
        grandChampionNumber: animal.grandChampionNumber,
        legsCount: animal.legsCount,
        cageLocation: '',
        breederName: animal.breederName,
        ownerName: animal.ownerName,
        ownershipType: animal.ownershipType,
        deceasedDateIso: animal.deceasedDateIso,
        deathCause: animal.deathCause,
        soldDateIso: animal.soldDateIso,
        buyerName: animal.buyerName,
        sireId: animal.sireId,
        damId: animal.damId,
        notes: `[Offloaded to OPFS /archives (${archiveKey})]`,
        offloadedArchiveKey: archiveKey,
        offloadedAtIso: createdAtIso,
        createdAt: animal.createdAt,
        updatedAt: createdAtIso,
      });
    } else {
      removedAnimalIds.push(animal.id);
    }
  }

  const stubSet = new Set(stubAnimalIds);
  const nextSnapshot: BarnDatabaseSnapshot = {
    ...snapshot,
    animals: nextAnimals,
    animalPhotos: (snapshot.animalPhotos ?? []).filter((p) => !targetIdSet.has(p.animalId)),
    careLogs: snapshot.careLogs.filter((l) => !targetIdSet.has(l.animalId)),
  };

  const speciesSummary = Array.from(new Set(storedAnimals.map((a) => a.species).filter(Boolean)));
  const indexEntry: ArchivedHerdIndexEntry = {
    archiveKey,
    fileName,
    createdAtIso,
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    byteSize: zipBytes.byteLength,
    checksumSha256,
    speciesSummary,
    animalCount: storedAnimals.length,
    photoCount: photoManifest.length,
    careLogCount: offloadedLogs.length,
    animals: storedAnimals.map((a) => ({
      id: a.id,
      name: a.name,
      tattoo: a.tattoo,
      species: a.species,
      breed: a.breed,
      variety: a.variety,
      sex: a.sex,
      status: a.status,
      birthDateIso: a.birthDateIso,
      soldDateIso: a.soldDateIso,
      deceasedDateIso: a.deceasedDateIso,
      buyerName: a.buyerName,
      deathCause: a.deathCause,
      hasPedigreeStubInDb: stubSet.has(a.id),
    })),
  };

  return {
    archiveKey,
    fileName,
    zipBytes,
    indexEntry,
    nextActiveSnapshot: nextSnapshot,
    stubAnimalIds,
    removedAnimalIds,
  };
}

/**
 * Lightweight metadata-only extractor for `.archive.zip` files used during OPFS
 * `/archives` index self-healing so rebuilding the directory manifest never inflates
 * or base64-encodes binary photos.
 */
export function extractArchiveIndexMetadataOnly(
  zipBytes: Uint8Array,
  fileName: string
): ArchivedHerdIndexEntry {
  const sizeCheck = validateUploadFileSize(
    fileName || 'herd.archive.zip',
    zipBytes.byteLength,
    MAX_ZIP_ARCHIVE_BYTES,
    'an archived animal bundle'
  );
  if (!sizeCheck.ok) {
    throw new Error(sizeCheck.error);
  }

  const unzipped = safeUnzipArchive(zipBytes, {
    archiveName: fileName || 'herd.archive.zip',
    entryFilter: (entryPath) => entryPath === 'archive-bundle.json',
  });
  const bundleEntry = unzipped['archive-bundle.json'];
  if (!bundleEntry) {
    throw new Error('Archive ZIP is missing archive-bundle.json metadata.');
  }
  if (bundleEntry.byteLength > MAX_JSON_BACKUP_BYTES) {
    throw new Error('Archive bundle metadata exceeds the maximum safe JSON limit.');
  }

  const parsed = JSON.parse(strFromU8(bundleEntry)) as Record<string, unknown>;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    parsed.format !== 'community-pedigree-archived-cohort-v1' ||
    !Array.isArray(parsed.animals)
  ) {
    throw new Error('Archive bundle metadata has an invalid root structure.');
  }

  if (typeof parsed.checksumSha256 === 'string' && parsed.checksumSha256) {
    const verificationBody = JSON.stringify(
      {
        format: parsed.format,
        package: parsed.package,
        _schemaVersion: parsed._schemaVersion,
        archiveKey: parsed.archiveKey,
        createdAtIso: parsed.createdAtIso,
        animals: parsed.animals,
        careLogs: parsed.careLogs ?? [],
        photoManifest: parsed.photoManifest ?? [],
      },
      null,
      2
    );
    const computed = sha256HexPure(verificationBody);
    if (computed !== parsed.checksumSha256) {
      throw new Error('Archive bundle checksum verification failed.');
    }
  }

  const ts = nowIsoUtc();
  const fallback = buildEmptyFallbackSettings();
  const normalizedSnap = parseBarnBackupJson(
    JSON.stringify({
      format: 'community-pedigree-backup',
      version: 5,
      settings: fallback,
      speciesProfiles: [],
      animals: parsed.animals,
      careLogs: Array.isArray(parsed.careLogs) ? parsed.careLogs : [],
      cages: [],
      breedings: [],
      tasks: [],
      shows: [],
      animalPhotos: [],
      feedBatches: [],
      feedAllocations: [],
      ledgerEntries: [],
      processingLogs: [],
      youthProjectBooks: [],
      clientContacts: [],
      waitlistEntries: [],
      animalReservations: [],
      woolHarvests: [],
    }),
    fallback
  );
  const rawManifest = Array.isArray(parsed.photoManifest) ? parsed.photoManifest : [];

  return {
    archiveKey: sanitizeSingleLineText(String(parsed.archiveKey || ''), 160) || 'archive',
    fileName: sanitizeSingleLineText(fileName, 180) || 'herd.archive.zip',
    createdAtIso: sanitizeSingleLineText(String(parsed.createdAtIso || ts), 64) || ts,
    schemaVersion: Number(parsed._schemaVersion) || CURRENT_BACKUP_SCHEMA_VERSION,
    byteSize: zipBytes.byteLength,
    checksumSha256: String(parsed.checksumSha256 || ''),
    speciesSummary: Array.from(new Set(normalizedSnap.animals.map((a) => a.species).filter(Boolean))),
    animalCount: normalizedSnap.animals.length,
    photoCount: rawManifest.length,
    careLogCount: normalizedSnap.careLogs.length,
    animals: normalizedSnap.animals.map((a) => ({
      id: a.id,
      name: a.name,
      tattoo: a.tattoo,
      species: a.species,
      breed: a.breed,
      variety: a.variety,
      sex: a.sex,
      status: a.status,
      birthDateIso: a.birthDateIso,
      soldDateIso: a.soldDateIso,
      deceasedDateIso: a.deceasedDateIso,
      buyerName: a.buyerName,
      deathCause: a.deathCause,
      hasPedigreeStubInDb: false,
    })),
  };
}

export function unpackArchivedAnimalBundle(
  zipBytes: Uint8Array,
  fallbackSettings: BarnSettings = buildEmptyFallbackSettings()
): UnpackedArchivedHerdBundle {
  const sizeCheck = validateUploadFileSize(
    'herd.archive.zip',
    zipBytes.byteLength,
    MAX_ZIP_ARCHIVE_BYTES,
    'an archived animal bundle'
  );
  if (!sizeCheck.ok) {
    throw new Error(sizeCheck.error);
  }

  const unzipped = safeUnzipArchive(zipBytes, { archiveName: 'herd.archive.zip' });
  const bundleEntry = unzipped['archive-bundle.json'];
  if (!bundleEntry) {
    throw new Error('Archive ZIP is missing archive-bundle.json metadata.');
  }
  if (bundleEntry.byteLength > MAX_JSON_BACKUP_BYTES) {
    throw new Error('Archive bundle metadata exceeds the maximum safe JSON limit.');
  }

  const parsed = JSON.parse(strFromU8(bundleEntry)) as Record<string, unknown>;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    parsed.format !== 'community-pedigree-archived-cohort-v1' ||
    !Array.isArray(parsed.animals)
  ) {
    throw new Error('Archive bundle metadata has an invalid root structure.');
  }

  if (typeof parsed.checksumSha256 === 'string' && parsed.checksumSha256) {
    const verificationBody = JSON.stringify(
      {
        format: parsed.format,
        package: parsed.package,
        _schemaVersion: parsed._schemaVersion,
        archiveKey: parsed.archiveKey,
        createdAtIso: parsed.createdAtIso,
        animals: parsed.animals,
        careLogs: parsed.careLogs ?? [],
        photoManifest: parsed.photoManifest ?? [],
      },
      null,
      2
    );
    const computed = sha256HexPure(verificationBody);
    if (computed !== parsed.checksumSha256) {
      throw new Error('Archive bundle checksum verification failed.');
    }
  }

  // Re-normalize animals & care logs through existing pure parser
  const normalizedSnap = parseBarnBackupJson(
    JSON.stringify({
      format: 'community-pedigree-backup',
      version: 5,
      settings: fallbackSettings,
      speciesProfiles: [],
      animals: parsed.animals,
      careLogs: Array.isArray(parsed.careLogs) ? parsed.careLogs : [],
      cages: [],
      breedings: [],
      tasks: [],
      shows: [],
      animalPhotos: [],
      feedBatches: [],
      feedAllocations: [],
      ledgerEntries: [],
      processingLogs: [],
      youthProjectBooks: [],
      clientContacts: [],
      waitlistEntries: [],
      animalReservations: [],
      woolHarvests: [],
    }),
    fallbackSettings
  );

  const ts = nowIsoUtc();
  const reconstructedPhotos: AnimalPhoto[] = [];
  const rawManifest = Array.isArray(parsed.photoManifest) ? parsed.photoManifest : [];
  for (let i = 0; i < rawManifest.length; i++) {
    const entry = rawManifest[i] as Record<string, any>;
    const archivePath = sanitizeSingleLineText(String(entry?.archivePath || ''), 300);
    if (!archivePath || !entry?.animalId) continue;
    const imgBytes = unzipped[archivePath];
    if (!imgBytes || imgBytes.byteLength === 0) continue;
    const mimeType = sanitizeSingleLineText(String(entry.mimeType || 'image/webp'), 80) || 'image/webp';
    if (isSvgImageInput(mimeType, archivePath, imgBytes)) continue;
    const dataUrl = sanitizeSafeRasterImageDataUrl(binaryToDataUrl(mimeType, imgBytes));
    if (!dataUrl) continue;
    const safeThumb = sanitizeSafeRasterImageDataUrl(entry.thumbnailDataUrl) || dataUrl;
    reconstructedPhotos.push({
      id: sanitizeSingleLineText(String(entry.id || ''), 120) || generateUuid(),
      species: sanitizeSingleLineText(String(entry.species || 'Rabbit'), 100) || 'Rabbit',
      animalId: sanitizeSingleLineText(String(entry.animalId), 120),
      isPrimary: Boolean(entry.isPrimary),
      sortOrder: typeof entry.sortOrder === 'number' && Number.isFinite(entry.sortOrder) ? entry.sortOrder : i,
      caption: sanitizePlainText(String(entry.caption || ''), 2000),
      originalFileName: sanitizeSingleLineText(String(entry.originalFileName || ''), 260),
      mimeType,
      width: Math.max(0, Number(entry.width) || 0),
      height: Math.max(0, Number(entry.height) || 0),
      originalBytes: Math.max(0, Number(entry.originalBytes) || imgBytes.byteLength),
      storedBytes: imgBytes.byteLength,
      thumbnailDataUrl: safeThumb,
      dataUrl,
      createdAt: sanitizeSingleLineText(String(entry.createdAt || ts), 64) || ts,
      updatedAt: sanitizeSingleLineText(String(entry.updatedAt || ts), 64) || ts,
    });
  }

  return {
    archiveKey: sanitizeSingleLineText(String(parsed.archiveKey || ''), 160) || 'archive',
    createdAtIso: sanitizeSingleLineText(String(parsed.createdAtIso || ts), 64) || ts,
    schemaVersion: Number(parsed._schemaVersion) || CURRENT_BACKUP_SCHEMA_VERSION,
    checksumSha256: String(parsed.checksumSha256 || ''),
    animals: normalizedSnap.animals,
    animalPhotos: reconstructedPhotos,
    careLogs: normalizedSnap.careLogs,
  };
}

export function mergeRestoredArchiveIntoSnapshot(
  current: BarnDatabaseSnapshot,
  bundle: UnpackedArchivedHerdBundle,
  options: { restoreToActiveStatus?: boolean } = {}
): {
  nextSnapshot: BarnDatabaseSnapshot;
  restoredAnimalCount: number;
  restoredPhotoCount: number;
  restoredCareLogCount: number;
} {
  const ts = nowIsoUtc();
  const animalMap = new Map<string, Animal>(current.animals.map((a) => [a.id, a]));
  let restoredAnimalCount = 0;

  for (const rawAnimal of bundle.animals) {
    const restored: Animal = {
      ...rawAnimal,
      status: options.restoreToActiveStatus ? 'Active' : rawAnimal.status,
      archived: options.restoreToActiveStatus ? false : rawAnimal.archived,
      offloadedArchiveKey: undefined,
      offloadedAtIso: undefined,
      updatedAt: ts,
    };
    // Ensure a missing species profile doesn't orphan the restored animal
    animalMap.set(restored.id, restored);
    restoredAnimalCount++;
  }

  const photoMap = new Map<string, AnimalPhoto>(
    (current.animalPhotos ?? []).map((p) => [p.id, p])
  );
  let restoredPhotoCount = 0;
  for (const p of bundle.animalPhotos) {
    photoMap.set(p.id, p);
    restoredPhotoCount++;
  }

  const logMap = new Map<string, CareLog>(current.careLogs.map((l) => [l.id, l]));
  let restoredCareLogCount = 0;
  for (const l of bundle.careLogs) {
    logMap.set(l.id, l);
    restoredCareLogCount++;
  }

  // Reconcile speciesProfiles if an archived animal's species was previously deleted
  const nextSpecies = [...current.speciesProfiles];
  for (const a of bundle.animals) {
    if (!nextSpecies.some((sp) => isSameSpecies(sp.name, a.species))) {
      const preset = PREDEFINED_SPECIES_PRESETS.find((p) => isSameSpecies(p.name, a.species));
      if (preset) {
        nextSpecies.push({
          ...preset,
          sortOrder: nextSpecies.length,
          createdAt: ts,
          updatedAt: ts,
        });
      }
    }
  }

  return {
    nextSnapshot: {
      ...current,
      speciesProfiles: nextSpecies,
      animals: Array.from(animalMap.values()),
      animalPhotos: Array.from(photoMap.values()),
      careLogs: Array.from(logMap.values()),
    },
    restoredAnimalCount,
    restoredPhotoCount,
    restoredCareLogCount,
  };
}
```

## `src/core/barnAlerts.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Barn Alerts Engine (`src/core/barnAlerts.ts`).
 *
 * Evaluates per-species:
 * 1. Due / overdue tasks alert (filtering permanently ignored task IDs and
 *    group-cleared alert signatures so clearing an alert hides the current
 *    task group without ignoring the tasks themselves).
 * 2. Babies about to arrive alert (gestation nearly complete).
 */

import {
  addDaysIso,
  Animal,
  BarnTask,
  BreedingRecord,
  CageLocation,
  CareLog,
  doesAnimalNeedAttention,
  formatReadableDate,
  isAnimalArchived,
  isSameSpecies,
  pluralizeSpeciesLabel,
  SpeciesProfile,
  todayDateIso,
} from './models';

export interface DueTaskAlertEvaluation {
  tasks: BarnTask[];
  overdueCount: number;
  dueTodayCount: number;
  groupSignature: string;
  shouldShow: boolean;
}

export interface ArrivingBabiesItem {
  breeding: BreedingRecord;
  daysUntilDue: number;
  timingLabel: string;
}

export interface ArrivingBabiesAlertEvaluation {
  items: ArrivingBabiesItem[];
  windowDays: number;
  offspringPluralLabel: string;
  shouldShow: boolean;
}

/**
 * Computes signed whole calendar days from `fromIso` to `toIso` (`YYYY-MM-DD`).
 * Positive means `toIso` is in the future; `0` means same day; negative means past.
 */
export function diffCalendarDaysIso(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  if (!fy || !fm || !fd || !ty || !tm || !td) return Number.NaN;
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

/**
 * Computes a deterministic group signature for a set of tasks.
 * When tasks are completed, permanently ignored, or new tasks become due/overdue,
 * this signature changes so a previously cleared group alert will reappear for the new group.
 */
export function buildTaskAlertGroupSignature(tasks: BarnTask[]): string {
  if (tasks.length === 0) return '';
  return tasks
    .map((t) => `${t.id}:${t.dueDateIso}`)
    .sort()
    .join('|');
}

/**
 * Evaluates due and overdue tasks for a single livestock species.
 */
export function evaluateSpeciesDueTasksAlert(
  tasks: BarnTask[],
  speciesName: string,
  options?: {
    todayIso?: string;
    ignoredTaskIds?: ReadonlySet<string>;
    clearedGroupSignature?: string;
  }
): DueTaskAlertEvaluation {
  const todayIso = options?.todayIso || todayDateIso();
  const ignored = options?.ignoredTaskIds;

  const dueOrOverdue = tasks
    .filter(
      (t) =>
        isSameSpecies(t.species, speciesName) &&
        !t.completed &&
        Boolean(t.dueDateIso) &&
        t.dueDateIso <= todayIso &&
        (!ignored || !ignored.has(t.id))
    )
    .sort((a, b) => a.dueDateIso.localeCompare(b.dueDateIso) || a.title.localeCompare(b.title));

  const overdueCount = dueOrOverdue.filter((t) => t.dueDateIso < todayIso).length;
  const dueTodayCount = dueOrOverdue.length - overdueCount;
  const groupSignature = buildTaskAlertGroupSignature(dueOrOverdue);
  const isGroupCleared =
    Boolean(options?.clearedGroupSignature) && options?.clearedGroupSignature === groupSignature;

  return {
    tasks: dueOrOverdue,
    overdueCount,
    dueTodayCount,
    groupSignature,
    shouldShow: dueOrOverdue.length > 0 && !isGroupCleared,
  };
}

/**
 * Computes how many days before expected birth counts as "gestation nearly complete"
 * for a given species gestation length (3 days minimum, 7 days maximum).
 */
export function getGestationSoonWindowDays(gestationDays: number): number {
  const safeDays = Math.max(1, gestationDays || 30);
  return Math.max(3, Math.min(7, Math.ceil(safeDays * 0.15)));
}

/**
 * Formats human-readable arrival timing for a nearly-complete gestation.
 */
export function formatArrivalTimingLabel(daysUntilDue: number): string {
  if (daysUntilDue === 0) return 'Due today';
  if (daysUntilDue === 1) return 'Due tomorrow';
  if (daysUntilDue > 1) return `Due in ${daysUntilDue} days`;
  const overdue = Math.abs(daysUntilDue);
  return `${overdue} day${overdue === 1 ? '' : 's'} past due date`;
}

const ACTIVE_PREBIRTH_STATUSES = new Set(['Planned', 'Bred', 'Palpated Positive']);

/**
 * Evaluates active breedings where gestation is nearly complete (babies about to arrive)
 * for a single livestock species.
 */
export function evaluateSpeciesArrivingBabiesAlert(
  breedings: BreedingRecord[],
  speciesProfile: SpeciesProfile,
  options?: {
    todayIso?: string;
    maxPastDueDays?: number;
  }
): ArrivingBabiesAlertEvaluation {
  const todayIso = options?.todayIso || todayDateIso();
  const maxPastDueDays = options?.maxPastDueDays ?? 7;
  const windowDays = getGestationSoonWindowDays(speciesProfile.gestationDays);

  const items: ArrivingBabiesItem[] = [];

  for (const b of breedings) {
    if (!isSameSpecies(b.species, speciesProfile.name)) continue;
    if (!ACTIVE_PREBIRTH_STATUSES.has(b.status)) continue;
    if (!b.expectedDueDateIso) continue;

    const daysUntilDue = diffCalendarDaysIso(todayIso, b.expectedDueDateIso);
    if (Number.isNaN(daysUntilDue)) continue;

    if (daysUntilDue <= windowDays && daysUntilDue >= -maxPastDueDays) {
      items.push({
        breeding: b,
        daysUntilDue,
        timingLabel: formatArrivalTimingLabel(daysUntilDue),
      });
    }
  }

  items.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  return {
    items,
    windowDays,
    offspringPluralLabel: pluralizeSpeciesLabel(speciesProfile.offspringLabel || 'Baby'),
    shouldShow: items.length > 0,
  };
}

export interface NeedsAttentionAlertEvaluation {
  animals: Animal[];
  shouldShow: boolean;
}

/**
 * Evaluates animals flagged with `needsAttention` (e.g. quick-added outside parents)
 * for a single livestock species.
 */
export function evaluateSpeciesNeedsAttentionAlert(
  animals: Animal[],
  speciesName: string
): NeedsAttentionAlertEvaluation {
  const flagged = animals
    .filter((a) => isSameSpecies(a.species, speciesName) && doesAnimalNeedAttention(a))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return {
    animals: flagged,
    shouldShow: flagged.length > 0,
  };
}

export interface SpeciesMemoAlertEvaluation {
  hasMemo: boolean;
  signature: string;
  previewText: string;
  shouldShow: boolean;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function extractMemoPreviewLine(memoText: string): string {
  const lines = memoText.split(/\r?\n/);
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const cleaned = trimmed
      .replace(/^#{1,3}\s+/, '')
      .replace(/^[-*]\s+\[[ xX]\]\s+/, '')
      .replace(/^[-*]\s+/, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .trim();
    if (cleaned) return cleaned;
  }
  return 'You have saved notes in this memo pad.';
}

/**
 * Builds a deterministic signature for a species memo pad's contents and update timestamp.
 * Any edit to the memo text or its updated timestamp alters this signature so a closed
 * reminder automatically reappears when the user edits the memo pad.
 */
export function buildSpeciesMemoSignature(
  memoText?: string,
  memoUpdatedAt?: string
): string {
  const raw = typeof memoText === 'string' ? memoText : '';
  if (raw.trim().length === 0) return '';
  const stamp = typeof memoUpdatedAt === 'string' ? memoUpdatedAt.trim() : '';
  const contentSig = `${raw.length}:${fnv1aHex(raw)}`;
  return stamp ? `${stamp}|${contentSig}` : contentSig;
}

/**
 * Evaluates whether a subtle memo pad reminder notice should appear on a species home card.
 */
export function evaluateSpeciesMemoReminderAlert(
  speciesProfile: Pick<SpeciesProfile, 'memoText' | 'memoUpdatedAt'>,
  options?: {
    dismissedSignature?: string;
  }
): SpeciesMemoAlertEvaluation {
  const raw = typeof speciesProfile.memoText === 'string' ? speciesProfile.memoText : '';
  const hasMemo = raw.trim().length > 0;
  if (!hasMemo) {
    return {
      hasMemo: false,
      signature: '',
      previewText: '',
      shouldShow: false,
    };
  }

  const signature = buildSpeciesMemoSignature(raw, speciesProfile.memoUpdatedAt);
  const isDismissed =
    Boolean(options?.dismissedSignature) && options?.dismissedSignature === signature;

  return {
    hasMemo: true,
    signature,
    previewText: extractMemoPreviewLine(raw),
    shouldShow: !isDismissed,
  };
}

// ============================================================================
// Active Medication Withdrawal Countdowns & Livestock Safety Alerts
// ============================================================================

const ISO_CALENDAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ActiveWithdrawalLogItem {
  log: CareLog;
  medicationLabel: string;
  clearDateIso: string;
  daysRemaining: number;
}

export interface AnimalWithdrawalEvaluation {
  animalId: string;
  isActive: boolean;
  clearDateIso: string;
  daysRemaining: number;
  countdownLabel: string;
  shortCountdownLabel: string;
  activeLogs: ActiveWithdrawalLogItem[];
  medicationSummary: string;
}

export interface SpeciesWithdrawalAnimalItem {
  animal: Animal;
  evaluation: AnimalWithdrawalEvaluation;
}

export interface SpeciesWithdrawalAlertEvaluation {
  items: SpeciesWithdrawalAnimalItem[];
  shouldShow: boolean;
}

export interface WithdrawalDispositionWarning {
  animalName: string;
  clearDateIso: string;
  daysRemaining: number;
  medicationSummary: string;
  reasons: Array<'Sold' | 'Flagged for Cull'>;
  headline: string;
  detail: string;
}

export interface ShowWithdrawalConflictItem {
  animal: Animal;
  evaluation: AnimalWithdrawalEvaluation;
}

export interface ShowWithdrawalConflictEvaluation {
  showDateIso: string;
  conflicts: ShowWithdrawalConflictItem[];
  hasConflict: boolean;
}

/**
 * Resolves the effective withdrawal clear date (`YYYY-MM-DD`) for a care log.
 * Uses explicit `withdrawalClearDateIso` first, falling back to `dateIso + withdrawalDays`.
 */
export function resolveCareLogWithdrawalClearDateIso(
  log: Pick<CareLog, 'dateIso' | 'withdrawalDays' | 'withdrawalClearDateIso'>
): string {
  const explicit =
    typeof log.withdrawalClearDateIso === 'string' ? log.withdrawalClearDateIso.trim() : '';
  if (ISO_CALENDAR_DATE_RE.test(explicit)) {
    return explicit;
  }
  const wDays = Number(log.withdrawalDays) || 0;
  const dateIso = typeof log.dateIso === 'string' ? log.dateIso.trim() : '';
  if (wDays > 0 && ISO_CALENDAR_DATE_RE.test(dateIso)) {
    return addDaysIso(dateIso, Math.round(wDays));
  }
  return '';
}

function buildMedicationLabel(log: CareLog): string {
  const med = typeof log.medicationName === 'string' ? log.medicationName.trim() : '';
  if (med) return med;
  const title = typeof log.title === 'string' ? log.title.trim() : '';
  if (title && title !== 'Health / Vet') return title;
  return 'Medication';
}

function finalizeAnimalWithdrawalEvaluation(
  animalId: string,
  activeLogs: ActiveWithdrawalLogItem[]
): AnimalWithdrawalEvaluation {
  if (activeLogs.length === 0) {
    return {
      animalId,
      isActive: false,
      clearDateIso: '',
      daysRemaining: 0,
      countdownLabel: '',
      shortCountdownLabel: '',
      activeLogs: [],
      medicationSummary: '',
    };
  }

  const sorted = [...activeLogs].sort(
    (a, b) =>
      b.clearDateIso.localeCompare(a.clearDateIso) ||
      (b.log.dateIso || '').localeCompare(a.log.dateIso || '')
  );
  const longest = sorted[0];
  const days = longest.daysRemaining;

  const seenMeds = new Set<string>();
  const medNames: string[] = [];
  for (const item of sorted) {
    const key = item.medicationLabel.toLowerCase();
    if (!seenMeds.has(key)) {
      seenMeds.add(key);
      medNames.push(item.medicationLabel);
    }
  }

  return {
    animalId,
    isActive: true,
    clearDateIso: longest.clearDateIso,
    daysRemaining: days,
    countdownLabel: `${days} day${days === 1 ? '' : 's'} remaining`,
    shortCountdownLabel: `${days}d left`,
    activeLogs: sorted,
    medicationSummary: medNames.join(', '),
  };
}

/**
 * Builds an O(L) lookup map of animals currently under an active medication withdrawal
 * relative to `options.todayIso` (defaulting to local today).
 *
 * Clear-date boundary rule: animals are considered **cleared on `withdrawalClearDateIso` itself**
 * (`daysRemaining = diffCalendarDaysIso(todayIso, clearDateIso) > 0` means still in withdrawal).
 */
export function buildWithdrawalByAnimalMap(
  careLogs: readonly CareLog[],
  options?: {
    todayIso?: string;
  }
): Map<string, AnimalWithdrawalEvaluation> {
  const referenceIso = options?.todayIso || todayDateIso();
  const grouped = new Map<string, ActiveWithdrawalLogItem[]>();

  for (const log of careLogs) {
    if (!log.animalId) continue;
    const clearDateIso = resolveCareLogWithdrawalClearDateIso(log);
    if (!clearDateIso) continue;

    const daysRemaining = diffCalendarDaysIso(referenceIso, clearDateIso);
    if (!Number.isFinite(daysRemaining) || daysRemaining <= 0) continue;

    let bucket = grouped.get(log.animalId);
    if (!bucket) {
      bucket = [];
      grouped.set(log.animalId, bucket);
    }
    bucket.push({
      log,
      medicationLabel: buildMedicationLabel(log),
      clearDateIso,
      daysRemaining,
    });
  }

  const result = new Map<string, AnimalWithdrawalEvaluation>();
  for (const [animalId, items] of grouped.entries()) {
    result.set(animalId, finalizeAnimalWithdrawalEvaluation(animalId, items));
  }
  return result;
}

/**
 * Evaluates active medication withdrawal status for a single animal.
 */
export function evaluateAnimalActiveWithdrawal(
  careLogs: readonly CareLog[],
  animalId: string,
  options?: {
    todayIso?: string;
  }
): AnimalWithdrawalEvaluation {
  if (!animalId) {
    return finalizeAnimalWithdrawalEvaluation('', []);
  }
  const referenceIso = options?.todayIso || todayDateIso();
  const activeItems: ActiveWithdrawalLogItem[] = [];

  for (const log of careLogs) {
    if (log.animalId !== animalId) continue;
    const clearDateIso = resolveCareLogWithdrawalClearDateIso(log);
    if (!clearDateIso) continue;
    const daysRemaining = diffCalendarDaysIso(referenceIso, clearDateIso);
    if (!Number.isFinite(daysRemaining) || daysRemaining <= 0) continue;
    activeItems.push({
      log,
      medicationLabel: buildMedicationLabel(log),
      clearDateIso,
      daysRemaining,
    });
  }

  return finalizeAnimalWithdrawalEvaluation(animalId, activeItems);
}

/**
 * Evaluates active medication withdrawal safety alerts for a species card on the Home screen.
 * Excludes Deceased, Sold, and Archived stock from Home barn alerts (Active, Junior, Retired,
 * and Flagged-for-Cull animals remain surfaced), and respects session-dismissed species keys.
 */
export function evaluateSpeciesActiveWithdrawalsAlert(
  animals: readonly Animal[],
  careLogs: readonly CareLog[],
  speciesName: string,
  options?: {
    todayIso?: string;
    withdrawalByAnimalId?: ReadonlyMap<string, AnimalWithdrawalEvaluation>;
    dismissedSpeciesKeys?: ReadonlySet<string>;
  }
): SpeciesWithdrawalAlertEvaluation {
  const byAnimal =
    options?.withdrawalByAnimalId ??
    buildWithdrawalByAnimalMap(careLogs, { todayIso: options?.todayIso });

  const items: SpeciesWithdrawalAnimalItem[] = [];
  for (const animal of animals) {
    if (!isSameSpecies(animal.species, speciesName)) continue;
    if (animal.status === 'Deceased' || animal.status === 'Sold' || isAnimalArchived(animal)) {
      continue;
    }
    const evaluation = byAnimal.get(animal.id);
    if (evaluation?.isActive) {
      items.push({ animal, evaluation });
    }
  }

  items.sort(
    (a, b) =>
      a.evaluation.daysRemaining - b.evaluation.daysRemaining ||
      (a.animal.name || '').localeCompare(b.animal.name || '')
  );

  const speciesKey = speciesName.trim().toLowerCase();
  const isDismissed = Boolean(options?.dismissedSpeciesKeys?.has(speciesKey));

  return {
    items,
    shouldShow: items.length > 0 && !isDismissed,
  };
}

/**
 * Evaluates whether saving an animal as `Sold` or `Flagged for Cull` triggers a soft
 * medication withdrawal confirmation warning. (Does not trigger for `Deceased` status.)
 */
export function evaluateWithdrawalDispositionWarning(
  evaluation: AnimalWithdrawalEvaluation | null | undefined,
  params: {
    animalName: string;
    isNewlySold: boolean;
    isNewlyCulled: boolean;
  }
): WithdrawalDispositionWarning | null {
  if (!evaluation?.isActive) return null;
  if (!params.isNewlySold && !params.isNewlyCulled) return null;

  const reasons: Array<'Sold' | 'Flagged for Cull'> = [];
  if (params.isNewlySold) reasons.push('Sold');
  if (params.isNewlyCulled) reasons.push('Flagged for Cull');

  const safeName = params.animalName.trim() || 'This animal';
  const clearReadable = formatReadableDate(evaluation.clearDateIso);
  const headline =
    reasons.length === 2
      ? `Active Withdrawal Hold — Confirm Sale & Cull`
      : reasons[0] === 'Sold'
      ? `Active Withdrawal Hold — Confirm Sale`
      : `Active Withdrawal Hold — Confirm Cull / Processing`;

  const actionPhrase =
    reasons.length === 2
      ? 'marking it Sold and Flagged for Cull'
      : reasons[0] === 'Sold'
      ? 'marking it Sold'
      : 'flagging it for Cull / processing';

  const detail = `${safeName} is still under medication withdrawal (${evaluation.medicationSummary}) until ${clearReadable} (${evaluation.countdownLabel}). Please verify food/sale disclosures before ${actionPhrase}.`;

  return {
    animalName: safeName,
    clearDateIso: evaluation.clearDateIso,
    daysRemaining: evaluation.daysRemaining,
    medicationSummary: evaluation.medicationSummary,
    reasons,
    headline,
    detail,
  };
}

/**
 * Checks whether any animal selected for a ShowEvent has an active medication withdrawal
 * overlapping the show's `eventDateIso` (cleared on `withdrawalClearDateIso` itself).
 */
export function evaluateShowWithdrawalConflicts(
  animals: readonly Animal[],
  selectedAnimalIds: readonly string[],
  careLogs: readonly CareLog[],
  showDateIso: string,
  options?: {
    withdrawalByAnimalIdOnShowDate?: ReadonlyMap<string, AnimalWithdrawalEvaluation>;
  }
): ShowWithdrawalConflictEvaluation {
  const cleanDate = typeof showDateIso === 'string' ? showDateIso.trim() : '';
  if (!ISO_CALENDAR_DATE_RE.test(cleanDate) || selectedAnimalIds.length === 0) {
    return { showDateIso: cleanDate, conflicts: [], hasConflict: false };
  }

  const byAnimal =
    options?.withdrawalByAnimalIdOnShowDate ??
    buildWithdrawalByAnimalMap(careLogs, { todayIso: cleanDate });

  const selectedSet = new Set(selectedAnimalIds);
  const conflicts: ShowWithdrawalConflictItem[] = [];

  for (const animal of animals) {
    if (!selectedSet.has(animal.id)) continue;
    const evaluation = byAnimal.get(animal.id);
    if (evaluation?.isActive) {
      conflicts.push({ animal, evaluation });
    }
  }

  conflicts.sort(
    (a, b) =>
      b.evaluation.daysRemaining - a.evaluation.daysRemaining ||
      (a.animal.name || '').localeCompare(b.animal.name || '')
  );

  return {
    showDateIso: cleanDate,
    conflicts,
    hasConflict: conflicts.length > 0,
  };
}

// ============================================================================
// Cage / Pen Occupancy & Welfare Capacity Alerts
// ============================================================================

export type CageOccupancyStatus = 'empty' | 'available' | 'full' | 'over_capacity';

export interface CageOccupancyEvaluation {
  cage: CageLocation;
  capacity: number;
  occupants: Animal[];
  occupantCount: number;
  status: CageOccupancyStatus;
  isOverCapacity: boolean;
  isAtCapacity: boolean;
  overBy: number;
  availableSpots: number;
  ratioLabel: string;
}

export interface SpeciesCagesOccupancySummary {
  evaluations: CageOccupancyEvaluation[];
  overCapacityCages: CageOccupancyEvaluation[];
  totalOverCapacityCount: number;
  overCapacityExtraAnimalsCount: number;
  byCageId: Map<string, CageOccupancyEvaluation>;
  byLabelKey: Map<string, CageOccupancyEvaluation>;
  shouldShowOverCapacityAlert: boolean;
}

export interface CageAssignmentCapacityWarning {
  cage: CageLocation;
  capacity: number;
  currentOccupantCount: number;
  projectedOccupantCount: number;
  overBy: number;
  wouldExceed: boolean;
  alreadyInTargetCage: boolean;
  alreadyOverCapacity: boolean;
  headline: string;
  detail: string;
}

/**
 * Normalizes a cage/pen label for case-insensitive trimmed matching.
 */
export function normalizeCageLabelKey(label?: string | null): string {
  return typeof label === 'string' ? label.trim().toLowerCase() : '';
}

/**
 * Returns true when an animal currently occupies physical housing space
 * (Active, Junior, or unarchived/non-offloaded Retired stock; excludes Sold, Deceased, Archived, and OPFS stubs).
 */
export function isCageOccupyingAnimal(
  animal: Partial<Pick<Animal, 'status' | 'archived' | 'offloadedArchiveKey'>> | null | undefined
): boolean {
  if (!animal) return false;
  if (animal.archived || animal.offloadedArchiveKey) return false;
  return animal.status === 'Active' || animal.status === 'Junior' || animal.status === 'Retired';
}

function buildCageOccupancyEvaluation(
  cage: CageLocation,
  occupants: Animal[]
): CageOccupancyEvaluation {
  const capacity = Math.max(1, Math.round(Number(cage.capacity) || 1));
  const sortedOccupants = [...occupants].sort(
    (a, b) =>
      (a.name || '').localeCompare(b.name || '') ||
      (a.tattoo || '').localeCompare(b.tattoo || '')
  );
  const occupantCount = sortedOccupants.length;
  const isOverCapacity = occupantCount > capacity;
  const isAtCapacity = occupantCount === capacity;
  const overBy = Math.max(0, occupantCount - capacity);
  const availableSpots = Math.max(0, capacity - occupantCount);
  const status: CageOccupancyStatus = isOverCapacity
    ? 'over_capacity'
    : isAtCapacity
      ? 'full'
      : occupantCount === 0
        ? 'empty'
        : 'available';
  const ratioLabel = isOverCapacity
    ? `${occupantCount}/${capacity} over capacity`
    : isAtCapacity
      ? `${occupantCount}/${capacity} full`
      : `${occupantCount}/${capacity}`;

  return {
    cage,
    capacity,
    occupants: sortedOccupants,
    occupantCount,
    status,
    isOverCapacity,
    isAtCapacity,
    overBy,
    availableSpots,
    ratioLabel,
  };
}

/**
 * Evaluates current occupancy vs configured `capacity` for a single `CageLocation`.
 */
export function evaluateCageOccupancy(
  cage: CageLocation,
  animals: readonly Animal[]
): CageOccupancyEvaluation {
  const labelKey = normalizeCageLabelKey(cage.label);
  const occupants = labelKey
    ? animals.filter(
        (a) =>
          isSameSpecies(a.species, cage.species) &&
          isCageOccupyingAnimal(a) &&
          normalizeCageLabelKey(a.cageLocation) === labelKey
      )
    : [];
  return buildCageOccupancyEvaluation(cage, occupants);
}

/**
 * Evaluates occupancy and capacity compliance across all `CageLocation` records for one species in O(C + A).
 */
export function evaluateSpeciesCagesOccupancy(
  cages: readonly CageLocation[],
  animals: readonly Animal[],
  speciesName: string
): SpeciesCagesOccupancySummary {
  const occupantsByLabelKey = new Map<string, Animal[]>();
  for (const animal of animals) {
    if (!isSameSpecies(animal.species, speciesName)) continue;
    if (!isCageOccupyingAnimal(animal)) continue;
    const key = normalizeCageLabelKey(animal.cageLocation);
    if (!key) continue;
    let bucket = occupantsByLabelKey.get(key);
    if (!bucket) {
      bucket = [];
      occupantsByLabelKey.set(key, bucket);
    }
    bucket.push(animal);
  }

  const evaluations: CageOccupancyEvaluation[] = [];
  const overCapacityCages: CageOccupancyEvaluation[] = [];
  const byCageId = new Map<string, CageOccupancyEvaluation>();
  const byLabelKey = new Map<string, CageOccupancyEvaluation>();
  let overCapacityExtraAnimalsCount = 0;

  for (const cage of cages) {
    if (!isSameSpecies(cage.species, speciesName)) continue;
    const key = normalizeCageLabelKey(cage.label);
    const occupants = key ? occupantsByLabelKey.get(key) ?? [] : [];
    const evalItem = buildCageOccupancyEvaluation(cage, occupants);
    evaluations.push(evalItem);
    byCageId.set(cage.id, evalItem);
    if (key && !byLabelKey.has(key)) {
      byLabelKey.set(key, evalItem);
    }
    if (evalItem.isOverCapacity) {
      overCapacityCages.push(evalItem);
      overCapacityExtraAnimalsCount += evalItem.overBy;
    }
  }

  return {
    evaluations,
    overCapacityCages,
    totalOverCapacityCount: overCapacityCages.length,
    overCapacityExtraAnimalsCount,
    byCageId,
    byLabelKey,
    shouldShowOverCapacityAlert: overCapacityCages.length > 0,
  };
}

/**
 * Evaluates whether assigning, moving, or reactivating an animal into `targetCageLabel`
 * will exceed the matching `CageLocation.capacity`.
 */
export function evaluateCageAssignmentCapacityWarning(params: {
  targetCageLabel: string;
  cages: readonly CageLocation[];
  animals: readonly Animal[];
  speciesName: string;
  animalId?: string;
  animalName?: string;
  wasAlreadyOccupyingTargetCage?: boolean;
  willOccupyAfterSave?: boolean;
}): CageAssignmentCapacityWarning | null {
  if (params.willOccupyAfterSave === false) return null;

  const targetKey = normalizeCageLabelKey(params.targetCageLabel);
  if (!targetKey) return null;

  const matchedCage = params.cages.find(
    (c) =>
      isSameSpecies(c.species, params.speciesName) &&
      normalizeCageLabelKey(c.label) === targetKey
  );
  if (!matchedCage) return null;

  const evaluation = evaluateCageOccupancy(matchedCage, params.animals);
  const otherOccupants = params.animalId
    ? evaluation.occupants.filter((o) => o.id !== params.animalId)
    : evaluation.occupants;

  const alreadyInTargetCage =
    params.wasAlreadyOccupyingTargetCage ??
    Boolean(params.animalId && evaluation.occupants.some((o) => o.id === params.animalId));

  const projectedOccupantCount = otherOccupants.length + 1;
  const overBy = Math.max(0, projectedOccupantCount - evaluation.capacity);
  if (overBy <= 0) return null;

  const wouldExceed = !alreadyInTargetCage;
  const safeName = (params.animalName || '').trim() || 'This animal';

  const headline = wouldExceed
    ? `Cage Capacity Warning — ${matchedCage.label} (${projectedOccupantCount}/${evaluation.capacity} over capacity)`
    : `${matchedCage.label} Over Capacity (${evaluation.ratioLabel})`;

  const detail = wouldExceed
    ? `Assigning ${safeName} to ${matchedCage.label} puts ${matchedCage.label} over its configured capacity of ${evaluation.capacity} (${projectedOccupantCount}/${evaluation.capacity}).`
    : `${matchedCage.label} currently holds ${evaluation.occupantCount} animals against a capacity of ${evaluation.capacity}.`;

  return {
    cage: matchedCage,
    capacity: evaluation.capacity,
    currentOccupantCount: evaluation.occupantCount,
    projectedOccupantCount,
    overBy,
    wouldExceed,
    alreadyInTargetCage,
    alreadyOverCapacity: evaluation.isOverCapacity,
    headline,
    detail,
  };
}



```

## `src/core/barnBench.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript "Barn Bench" Fast Sequential Batch Entry Engine (`src/core/barnBench.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) calls.
 *
 * Builds species-isolated, cage-row-walkable sequential chore queues and converts
 * rapid cage-side inputs (weights, body condition scores, nail trims, cage moves)
 * into clean `CareLog` records and `Animal` updates ready for atomic persistence.
 */

import { isCageOccupyingAnimal, normalizeCageLabelKey } from './barnAlerts';
import {
  Animal,
  CageLocation,
  CareLog,
  generateUuid,
  isSameSpecies,
  nowIsoUtc,
  todayDateIso,
} from './models';
import { bumpRecordRevision } from './syncOutbox';

export type BarnBenchFocusMode = 'all' | 'weight' | 'bcs' | 'nail_trim' | 'cage_move';

export type BarnBenchStatusFilter = 'housing' | 'active_only' | 'junior_only';

export const BARN_BENCH_SECTION_ALL = '__ALL__';
export const BARN_BENCH_SECTION_UNASSIGNED = '__UNASSIGNED__';

/**
 * Standard 1–5 livestock & rabbit Body Condition Score quick-tap presets.
 */
export const BARN_BENCH_BCS_PRESETS: readonly number[] = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

export interface BarnBenchRowItem {
  animal: Animal;
  cage: CageLocation | null;
  cageLabel: string;
  sectionLabel: string;
  hasAssignedCage: boolean;
  latestBcs: number;
  latestBcsDateIso: string;
  latestNailTrimDateIso: string;
}

export interface BarnBenchFilterOptions {
  speciesName: string;
  sectionFilter?: string;
  statusFilter?: BarnBenchStatusFilter;
  searchQuery?: string;
}

export interface BarnBenchBatchEntryDraft {
  animalId: string;
  dateIso?: string;
  /** Weight measurement in integer grams; omit or <= 0 to skip logging weight. */
  weightGrams?: number;
  /** Body Condition Score (e.g. 1-5 or 1-9); omit or <= 0 to skip logging BCS. */
  bodyConditionScore?: number;
  /** True when nail trim / hoof grooming was performed. */
  nailTrimDone?: boolean;
  /** Optional custom title override for nail trim log. */
  nailTrimTitle?: string;
  /** Target cage/pen label (`""` unassigns); undefined leaves cage unchanged. */
  targetCageLocation?: string;
  /** Optional note attached to logged care entries. */
  notes?: string;
}

export interface BarnBenchCommitPlan {
  careLogs: CareLog[];
  updatedAnimal: Animal | null;
  summaryParts: string[];
  hasChanges: boolean;
}

/**
 * Extracts distinct non-empty physical cage row / section names for a single species,
 * sorted naturally so row buttons match barn layout (`Row A`, `Row B`, `Pasture 1`, etc.).
 */
export function extractSpeciesCageSections(
  cages: readonly CageLocation[],
  speciesName: string
): string[] {
  const seen = new Map<string, string>();
  for (const cage of cages) {
    if (!isSameSpecies(cage.species, speciesName)) continue;
    const clean = (cage.section || '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, clean);
    }
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );
}

/**
 * Builds the sequential Barn Bench walkthrough queue for a species, filtered by
 * cage row/section, housing status, and search text, and sorted naturally down the row.
 */
export function buildBarnBenchQueue(params: {
  animals: readonly Animal[];
  cages: readonly CageLocation[];
  careLogs: readonly CareLog[];
  options: BarnBenchFilterOptions;
}): BarnBenchRowItem[] {
  const { animals, cages, careLogs, options } = params;
  const speciesName = options.speciesName;
  const sectionFilter = options.sectionFilter || BARN_BENCH_SECTION_ALL;
  const statusFilter = options.statusFilter || 'housing';
  const query = (options.searchQuery || '').trim().toLowerCase();

  // Map species cages by normalized label
  const cageByLabelKey = new Map<string, CageLocation>();
  for (const cage of cages) {
    if (!isSameSpecies(cage.species, speciesName)) continue;
    const key = normalizeCageLabelKey(cage.label);
    if (key && !cageByLabelKey.has(key)) {
      cageByLabelKey.set(key, cage);
    }
  }

  // Single O(L) pass to gather latest BCS & latest Grooming & Hoof date per animal
  const latestBcsByAnimal = new Map<string, { score: number; dateIso: string }>();
  const latestTrimByAnimal = new Map<string, string>();

  for (const log of careLogs) {
    if (!isSameSpecies(log.species, speciesName) || !log.animalId) continue;
    const logDate = (log.dateIso || '').trim();

    if (typeof log.bodyConditionScore === 'number' && log.bodyConditionScore > 0) {
      const prev = latestBcsByAnimal.get(log.animalId);
      if (!prev || logDate.localeCompare(prev.dateIso) > 0) {
        latestBcsByAnimal.set(log.animalId, {
          score: log.bodyConditionScore,
          dateIso: logDate,
        });
      }
    }

    if (log.type === 'Grooming & Hoof') {
      const prevTrim = latestTrimByAnimal.get(log.animalId);
      if (!prevTrim || logDate.localeCompare(prevTrim) > 0) {
        latestTrimByAnimal.set(log.animalId, logDate);
      }
    }
  }

  const rows: BarnBenchRowItem[] = [];

  for (const animal of animals) {
    if (!isSameSpecies(animal.species, speciesName)) continue;
    if (!isCageOccupyingAnimal(animal)) continue;
    if (statusFilter === 'active_only' && animal.status !== 'Active') continue;
    if (statusFilter === 'junior_only' && animal.status !== 'Junior') continue;

    const rawCageLabel = (animal.cageLocation || '').trim();
    const matchedCage = rawCageLabel
      ? cageByLabelKey.get(normalizeCageLabelKey(rawCageLabel)) ?? null
      : null;

    const hasAssignedCage = Boolean(rawCageLabel);
    const sectionLabel = matchedCage?.section?.trim()
      ? matchedCage.section.trim()
      : hasAssignedCage
        ? 'Other Cages'
        : 'Unassigned';

    if (sectionFilter === BARN_BENCH_SECTION_UNASSIGNED) {
      if (hasAssignedCage) continue;
    } else if (sectionFilter !== BARN_BENCH_SECTION_ALL) {
      if (sectionLabel.toLowerCase() !== sectionFilter.trim().toLowerCase()) {
        continue;
      }
    }

    if (query) {
      const matches =
        animal.name.toLowerCase().includes(query) ||
        animal.tattoo.toLowerCase().includes(query) ||
        rawCageLabel.toLowerCase().includes(query) ||
        sectionLabel.toLowerCase().includes(query) ||
        animal.breed.toLowerCase().includes(query) ||
        animal.variety.toLowerCase().includes(query);
      if (!matches) continue;
    }

    const latestBcs = latestBcsByAnimal.get(animal.id);
    const latestTrim = latestTrimByAnimal.get(animal.id) || '';

    rows.push({
      animal,
      cage: matchedCage,
      cageLabel: rawCageLabel,
      sectionLabel,
      hasAssignedCage,
      latestBcs: latestBcs?.score ?? 0,
      latestBcsDateIso: latestBcs?.dateIso ?? '',
      latestNailTrimDateIso: latestTrim,
    });
  }

  rows.sort((a, b) => {
    // 1. Assigned cages before Unassigned
    if (a.hasAssignedCage !== b.hasAssignedCage) {
      return a.hasAssignedCage ? -1 : 1;
    }
    // 2. Section natural order (with "Other Cages" after named sections)
    if (a.sectionLabel !== b.sectionLabel) {
      if (a.sectionLabel === 'Other Cages') return 1;
      if (b.sectionLabel === 'Other Cages') return -1;
      const secCmp = a.sectionLabel.localeCompare(b.sectionLabel, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      if (secCmp !== 0) return secCmp;
    }
    // 3. Natural numeric cage label order (Hutch R-2 before Hutch R-10)
    if (a.cageLabel !== b.cageLabel) {
      const cageCmp = a.cageLabel.localeCompare(b.cageLabel, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      if (cageCmp !== 0) return cageCmp;
    }
    // 4. Animal name & tattoo fallback
    return (
      a.animal.name.localeCompare(b.animal.name, undefined, {
        numeric: true,
        sensitivity: 'base',
      }) || a.animal.tattoo.localeCompare(b.animal.tattoo)
    );
  });

  return rows;
}

/**
 * Purely converts a single Barn Bench sequential chore draft into typed `CareLog` records
 * and a single `_rev`-bumped `Animal` patch when weight or cage location changed.
 */
export function buildBarnBenchCommitPlan(
  animal: Animal,
  draft: BarnBenchBatchEntryDraft,
  timestampIso: string = nowIsoUtc()
): BarnBenchCommitPlan {
  if (animal.offloadedArchiveKey) {
    return {
      careLogs: [],
      updatedAnimal: null,
      summaryParts: [],
      hasChanges: false,
    };
  }

  const dateIso =
    typeof draft.dateIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(draft.dateIso.trim())
      ? draft.dateIso.trim()
      : todayDateIso();
  const cleanNotes = typeof draft.notes === 'string' ? draft.notes.trim() : '';

  const rawWeight = Number(draft.weightGrams);
  const validWeightGrams =
    Number.isFinite(rawWeight) && rawWeight > 0 ? Math.round(rawWeight) : 0;

  const rawBcs = Number(draft.bodyConditionScore);
  const validBcs =
    Number.isFinite(rawBcs) && rawBcs > 0 ? Math.min(20, Math.round(rawBcs * 10) / 10) : 0;

  const nailTrimDone = Boolean(draft.nailTrimDone);
  const cleanTrimTitle =
    typeof draft.nailTrimTitle === 'string' && draft.nailTrimTitle.trim()
      ? draft.nailTrimTitle.trim()
      : 'Nail Trim & Grooming';

  const hasCageTarget = draft.targetCageLocation !== undefined;
  const normalizedNextCage = hasCageTarget ? draft.targetCageLocation!.trim() : animal.cageLocation.trim();
  const cageChanged = hasCageTarget && normalizedNextCage !== animal.cageLocation.trim();

  const careLogs: CareLog[] = [];
  const summaryParts: string[] = [];

  if (validWeightGrams > 0) {
    careLogs.push({
      id: generateUuid(),
      species: animal.species,
      animalId: animal.id,
      dateIso,
      type: 'Weight Check',
      title: 'Barn Bench Weight Check',
      weightGrams: validWeightGrams,
      showLegEarned: false,
      notes: cleanNotes,
      _rev: 1,
      createdAt: timestampIso,
      updatedAt: timestampIso,
    });
    summaryParts.push('Weight');
  }

  if (validBcs > 0) {
    careLogs.push({
      id: generateUuid(),
      species: animal.species,
      animalId: animal.id,
      dateIso,
      type: 'Health Score / BCS',
      title: `Body Condition Score (${validBcs})`,
      weightGrams: 0,
      showLegEarned: false,
      bodyConditionScore: validBcs,
      notes: cleanNotes,
      _rev: 1,
      createdAt: timestampIso,
      updatedAt: timestampIso,
    });
    summaryParts.push(`BCS ${validBcs}`);
  }

  if (nailTrimDone) {
    careLogs.push({
      id: generateUuid(),
      species: animal.species,
      animalId: animal.id,
      dateIso,
      type: 'Grooming & Hoof',
      title: cleanTrimTitle,
      weightGrams: 0,
      showLegEarned: false,
      notes: cleanNotes,
      _rev: 1,
      createdAt: timestampIso,
      updatedAt: timestampIso,
    });
    summaryParts.push('Nail Trim');
  }

  // Standalone note without numeric/action flags still records cleanly as a Journal Note
  if (!validWeightGrams && !validBcs && !nailTrimDone && !cageChanged && cleanNotes) {
    careLogs.push({
      id: generateUuid(),
      species: animal.species,
      animalId: animal.id,
      dateIso,
      type: 'Journal Note',
      title: 'Barn Bench Note',
      weightGrams: 0,
      showLegEarned: false,
      notes: cleanNotes,
      _rev: 1,
      createdAt: timestampIso,
      updatedAt: timestampIso,
    });
    summaryParts.push('Note');
  }

  const weightChangedOnAnimal = validWeightGrams > 0 && validWeightGrams !== animal.weightGrams;
  let updatedAnimal: Animal | null = null;
  if (weightChangedOnAnimal || cageChanged) {
    const nextRev = bumpRecordRevision(animal);
    updatedAnimal = {
      ...animal,
      weightGrams: validWeightGrams > 0 ? validWeightGrams : animal.weightGrams,
      cageLocation: cageChanged ? normalizedNextCage : animal.cageLocation,
      _rev: nextRev,
      updatedAt: timestampIso,
    };
  }

  if (cageChanged) {
    summaryParts.push(normalizedNextCage ? `Moved → ${normalizedNextCage}` : 'Unassigned Cage');
  }

  return {
    careLogs,
    updatedAnimal,
    summaryParts,
    hasChanges: careLogs.length > 0 || updatedAnimal !== null,
  };
}

/**
 * Picks the next row index in a Barn Bench queue after saving or skipping `currentIndex`.
 * Prefers the next unlogged row ahead (wrapping around only for unlogged items), falling back
 * to `currentIndex + 1` when auto-advancing sequentially.
 */
export function findNextBarnBenchIndex(params: {
  queue: readonly BarnBenchRowItem[];
  currentIndex: number;
  loggedAnimalIds: ReadonlySet<string>;
  preferUnlogged?: boolean;
}): number {
  const { queue, currentIndex, loggedAnimalIds, preferUnlogged = true } = params;
  if (queue.length === 0) return 0;

  const safeCurrent = Math.max(0, Math.min(queue.length - 1, currentIndex));

  if (preferUnlogged) {
    for (let i = safeCurrent + 1; i < queue.length; i++) {
      if (!loggedAnimalIds.has(queue[i].animal.id)) {
        return i;
      }
    }
    for (let i = 0; i < safeCurrent; i++) {
      if (!loggedAnimalIds.has(queue[i].animal.id)) {
        return i;
      }
    }
  }

  return Math.min(queue.length - 1, safeCurrent + 1);
}
```

## `src/core/barnBinder.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Per-Species Printable Barn & Herd Binder Generator (.HTM).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript HTML5 + CSS string builder with zero browser DOM (`window`, `document`)
 * calls so identical human-readable binder books render on Web PWA, mobile Print/PDF,
 * standalone `.HTM` files, automatic `.ZIP` backups, and React Native / Expo.
 */

import { isCageOccupyingAnimal, normalizeCageLabelKey } from './barnAlerts';
import {
  analyzeAnimalCarrierLineage,
  formatClearedProofBadge,
  formatCompactCarrierDisclosure,
  getAnimalCarrierDisclosures,
} from './carrierGenetics';
import { formatGenotypeArray } from './geneticsEngine';
import {
  Animal,
  AnimalPhoto,
  BarnDatabaseSnapshot,
  BarnSettings,
  BreedingRecord,
  CageLocation,
  CareLog,
  formatBreedingStatusForSpecies,
  formatReadableDate,
  formatSexForSpecies,
  formatWeight,
  getSpeciesIdentifierLabels,
  isAnimalArchived,
  isSameSpecies,
  nowIsoUtc,
  resolveSpeciesProfile,
  resolveSpeciesWeightUnit,
  ShowEvent,
  SpeciesProfile,
  todayDateIso,
  WeightUnit,
} from './models';
import {
  buildPedigreeSlots,
  buildSpeciesHerdMap,
  calculateAnimalCoi,
  getPedigreeCompletenessSummary,
  PedigreeSlot,
} from './pedigreeCalculator';
import {
  computeAnimalShowSummary,
  mergeEnteredAnimalIdsWithResults,
} from './showResults';
import { sanitizeSpeciesMemo } from './speciesMemo';
import {
  escapeSafeHtml,
  sanitizeSafeRasterImageDataUrl,
} from './inputSanitization';
import {
  CustomThemeColors,
  DEFAULT_WARM_THEME_COLORS,
  mixHex,
  relativeLuminance,
} from './themePalette';

export type BarnBinderColorMode = 'color' | 'ink_saver';

export interface BarnBinderOptions {
  /** Uses Barn Color Picker accents on pure `#FFFFFF` paper (`'color'`) or pure black ink (`'ink_saver'`). */
  colorMode: BarnBinderColorMode;
  /** Default `false` (Active & Current stock) for interactive printable preview; `true` includes Archived, Sold & Deceased. */
  includeArchived: boolean;
  /** Pedigree chart depth; inherits `BarnSettings.defaultGenerations` by default. */
  generations: 3 | 4 | 5 | 6;
  /** Include animal portrait & uploaded gallery photos with captions/notes. */
  includePhotos: boolean;
  /** Include Cover Page, inherited Barn/Species overview metadata, and Breeder Certification Signature block. */
  includeCoverAndSignature: boolean;
  /** Include Herd Index (TOC), Species Schedule & Milestones, Species Memo, Cage Directory & Shows Overview. */
  includeSpeciesOverview: boolean;
  /** Include per-animal Medical/Care History & Litters/Birthings sections. */
  includeHealthAndLitters: boolean;
  /** Include per-animal Shows, Registration #, Related In-Herd Animals, Offspring, Noteworthy Relatives & Notes. */
  includeShowsAndKinship: boolean;
  /** Optional breeder contact or herd-transfer line shown on the cover certification & footer. */
  breederTransferNote?: string;
}

export interface ResolvedBinderPalette {
  mode: BarnBinderColorMode;
  paperBg: '#FFFFFF';
  ink: string;
  mutedInk: string;
  primary: string;
  accent: string;
  male: string;
  female: string;
  border: string;
  hairline: string;
}

export interface BinderRelatedAnimalEntry {
  animal: Animal;
  relationLabel: string;
  inHerd: boolean;
  otherParentLabel?: string;
  achievementBadge?: string;
}

export interface AnimalKinshipSummary {
  directOffspring: BinderRelatedAnimalEntry[];
  inHerdRelatives: BinderRelatedAnimalEntry[];
  noteworthyRelatives: BinderRelatedAnimalEntry[];
}

function escapeHtml(raw: string | undefined | null): string {
  return escapeSafeHtml(raw);
}

function escapeMultilineHtml(raw: string | undefined | null): string {
  return escapeHtml(raw).replace(/\r\n|\r|\n/g, '<br />');
}

function slugifyBinderSegment(value: string, fallback: string): string {
  const clean = (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || fallback;
}

/**
 * Normalizes a `#RRGGBB` hex string and automatically ensures dark, high-contrast legibility
 * against pure `#FFFFFF` white paper so light/neon Color Picker choices remain crisp in print.
 */
function ensurePrintSafeInkHex(rawHex: string | undefined, fallbackHex: string): string {
  const trimmed = (rawHex || '').trim();
  const valid = /^#[0-9a-fA-F]{6}$/.test(trimmed)
    ? trimmed.toUpperCase()
    : fallbackHex.toUpperCase();
  const lum = relativeLuminance(valid);
  if (lum > 0.34) {
    return mixHex(valid, '#141B15', 0.56);
  }
  if (lum > 0.22) {
    return mixHex(valid, '#141B15', 0.3);
  }
  return valid;
}

/**
 * Resolves printable Color vs. Ink Saver palette tokens strictly on `#FFFFFF` paper.
 * Never outputs dark or full-colored document backgrounds regardless of UI dark mode.
 */
export function resolveBinderPalette(
  colorMode: BarnBinderColorMode,
  customColors?: CustomThemeColors
): ResolvedBinderPalette {
  if (colorMode === 'ink_saver') {
    return {
      mode: 'ink_saver',
      paperBg: '#FFFFFF',
      ink: '#000000',
      mutedInk: '#3F3F46',
      primary: '#000000',
      accent: '#18181B',
      male: '#18181B',
      female: '#3F3F46',
      border: '#27272A',
      hairline: '#D4D4D8',
    };
  }

  const primary = ensurePrintSafeInkHex(
    customColors?.lightPrimary,
    DEFAULT_WARM_THEME_COLORS.lightPrimary
  );
  const accent = ensurePrintSafeInkHex(
    customColors?.lightAccent,
    DEFAULT_WARM_THEME_COLORS.lightAccent
  );
  const male = ensurePrintSafeInkHex(
    customColors?.lightMale,
    DEFAULT_WARM_THEME_COLORS.lightMale
  );

  return {
    mode: 'color',
    paperBg: '#FFFFFF',
    ink: '#171C17',
    mutedInk: '#4A524A',
    primary,
    accent,
    male,
    female: accent,
    border: primary,
    hairline: '#D1D5D1',
  };
}

/**
 * Builds default binder options inheriting Barn-level settings cleanly.
 */
export function buildDefaultBarnBinderOptions(
  settings: BarnSettings,
  overrides?: Partial<BarnBinderOptions>
): BarnBinderOptions {
  const inheritedGen =
    settings.defaultGenerations === 4 ||
    settings.defaultGenerations === 5 ||
    settings.defaultGenerations === 6
      ? settings.defaultGenerations
      : 3;

  return {
    colorMode: overrides?.colorMode ?? 'color',
    includeArchived: overrides?.includeArchived ?? false,
    generations: overrides?.generations ?? inheritedGen,
    includePhotos: overrides?.includePhotos ?? true,
    includeCoverAndSignature: overrides?.includeCoverAndSignature ?? true,
    includeSpeciesOverview: overrides?.includeSpeciesOverview ?? true,
    includeHealthAndLitters: overrides?.includeHealthAndLitters ?? true,
    includeShowsAndKinship: overrides?.includeShowsAndKinship ?? true,
    breederTransferNote: overrides?.breederTransferNote ?? '',
  };
}

export function buildBarnBinderFileName(
  barnName: string | undefined,
  speciesName: string,
  dateSlug?: string
): string {
  const trimmed = (barnName || '').trim();
  const isDefault = !trimmed || trimmed.toLowerCase() === 'my barn';
  const barnPrefix = isDefault ? 'pedigree' : slugifyBinderSegment(trimmed, 'pedigree');
  const spSlug = slugifyBinderSegment(speciesName, 'species');
  const stamp = dateSlug || todayDateIso();
  return `${barnPrefix}-${spSlug}-binder-${stamp}.htm`;
}

function formatUnitLabel(unit: WeightUnit): string {
  switch (unit) {
    case 'lbs_oz':
      return 'Pounds & Oz';
    case 'lbs':
      return 'Decimal Pounds (lbs)';
    case 'kg':
      return 'Kilograms (kg)';
    case 'grams':
      return 'Grams (g)';
  }
}

function formatAchievementBadge(
  animal: Animal,
  showLegCountFromLogs: number
): string | undefined {
  const parts: string[] = [];
  if (animal.grandChampionNumber.trim()) {
    parts.push(`GC #${animal.grandChampionNumber.trim()}`);
  }
  const effectiveLegs = Math.max(animal.legsCount || 0, showLegCountFromLogs);
  if (effectiveLegs >= 3 && !animal.grandChampionNumber.trim()) {
    parts.push(`Grand Champion Eligible (${effectiveLegs} Legs)`);
  } else if (effectiveLegs > 0) {
    parts.push(`${effectiveLegs} Show Leg${effectiveLegs === 1 ? '' : 's'}`);
  }
  if (parts.length === 0) return undefined;
  return parts.join(' · ');
}

function isAnimalNoteworthy(animal: Animal, showLegCountFromLogs: number): boolean {
  if (animal.grandChampionNumber.trim().length > 0) return true;
  if ((animal.legsCount || 0) >= 1) return true;
  if (showLegCountFromLogs >= 1) return true;
  return false;
}

/**
 * Computes direct offspring, currently in-herd relatives, and noteworthy titled relatives
 * (including titled ancestors, siblings, and descendants even if sold/archived/deceased).
 */
export function computeAnimalKinshipSummary(
  subject: Animal,
  speciesAnimals: Animal[],
  careLogs: CareLog[],
  speciesProfile: SpeciesProfile
): AnimalKinshipSummary {
  const herdById = new Map<string, Animal>(speciesAnimals.map((a) => [a.id, a]));
  const showLegsByAnimalId = new Map<string, number>();
  for (const log of careLogs) {
    if (log.type === 'Show / Leg' || log.showLegEarned) {
      showLegsByAnimalId.set(log.animalId, (showLegsByAnimalId.get(log.animalId) || 0) + 1);
    }
  }

  const sortRelatives = (list: BinderRelatedAnimalEntry[]): BinderRelatedAnimalEntry[] =>
    [...list].sort((a, b) => {
      if (a.inHerd !== b.inHerd) return a.inHerd ? -1 : 1;
      return (
        (b.animal.birthDateIso || '').localeCompare(a.animal.birthDateIso || '') ||
        a.animal.name.localeCompare(b.animal.name)
      );
    });

  // 1. Direct Offspring (all children referencing subject as sireId or damId)
  const directOffspringRaw: BinderRelatedAnimalEntry[] = [];
  const directChildIds = new Set<string>();
  for (const cand of speciesAnimals) {
    if (cand.id === subject.id) continue;
    const isSire = cand.sireId === subject.id;
    const isDam = cand.damId === subject.id;
    if (!isSire && !isDam) continue;
    directChildIds.add(cand.id);
    const otherParentId = isSire ? cand.damId : cand.sireId;
    const otherParent = otherParentId ? herdById.get(otherParentId) : undefined;
    const otherLabel = otherParent
      ? `with ${otherParent.name}${otherParent.tattoo ? ` (${otherParent.tattoo})` : ''}`
      : undefined;
    directOffspringRaw.push({
      animal: cand,
      relationLabel: `${speciesProfile.offspringLabel} (${isSire ? `by ${speciesProfile.maleLabel}` : `out of ${speciesProfile.femaleLabel}`})`,
      inHerd: !isAnimalArchived(cand),
      otherParentLabel: otherLabel,
      achievementBadge: formatAchievementBadge(cand, showLegsByAnimalId.get(cand.id) || 0),
    });
  }
  const directOffspring = sortRelatives(directOffspringRaw);

  // Build ancestor map (up to 4 gens) & 2nd-gen descendant set for broader kinship
  const relationById = new Map<string, { label: string; priority: number }>();
  const registerRel = (id: string, label: string, priority: number) => {
    if (!id || id === subject.id) return;
    const existing = relationById.get(id);
    if (!existing || priority < existing.priority) {
      relationById.set(id, { label, priority });
    }
  };

  if (subject.sireId && herdById.has(subject.sireId)) {
    registerRel(subject.sireId, `Sire (${speciesProfile.maleLabel})`, 1);
  }
  if (subject.damId && herdById.has(subject.damId)) {
    registerRel(subject.damId, `Dam (${speciesProfile.femaleLabel})`, 1);
  }

  // Grandparents + Great-Grandparents + 4th-gen Ancestors (BFS with cycle protection)
  const visitedAnc = new Set<string>([subject.id]);
  const ancQueue: Array<{ id: string; depth: number; side: string }> = [];
  if (subject.sireId && herdById.has(subject.sireId)) {
    ancQueue.push({ id: subject.sireId, depth: 1, side: 'Paternal' });
  }
  if (subject.damId && herdById.has(subject.damId)) {
    ancQueue.push({ id: subject.damId, depth: 1, side: 'Maternal' });
  }
  while (ancQueue.length > 0) {
    const curr = ancQueue.shift()!;
    if (visitedAnc.has(curr.id)) continue;
    visitedAnc.add(curr.id);
    const ancAnimal = herdById.get(curr.id);
    if (!ancAnimal) continue;

    if (curr.depth === 2) {
      registerRel(curr.id, `${curr.side} Grandparent`, 3);
    } else if (curr.depth === 3) {
      registerRel(curr.id, `${curr.side} Great-Grandparent`, 5);
    } else if (curr.depth === 4) {
      registerRel(curr.id, `${curr.side} 2nd Great-Grandparent`, 6);
    }

    if (curr.depth < 4) {
      if (ancAnimal.sireId && herdById.has(ancAnimal.sireId)) {
        ancQueue.push({ id: ancAnimal.sireId, depth: curr.depth + 1, side: curr.side });
      }
      if (ancAnimal.damId && herdById.has(ancAnimal.damId)) {
        ancQueue.push({ id: ancAnimal.damId, depth: curr.depth + 1, side: curr.side });
      }
    }
  }

  // Siblings & Grandchildren
  for (const cand of speciesAnimals) {
    if (cand.id === subject.id) continue;
    const sameSire = Boolean(subject.sireId && cand.sireId && cand.sireId === subject.sireId);
    const sameDam = Boolean(subject.damId && cand.damId && cand.damId === subject.damId);
    if (sameSire && sameDam) {
      registerRel(cand.id, 'Full Sibling', 2);
    } else if (sameSire) {
      registerRel(cand.id, `Half Sibling (Shared ${speciesProfile.maleLabel})`, 4);
    } else if (sameDam) {
      registerRel(cand.id, `Half Sibling (Shared ${speciesProfile.femaleLabel})`, 4);
    }

    if (
      (cand.sireId && directChildIds.has(cand.sireId)) ||
      (cand.damId && directChildIds.has(cand.damId))
    ) {
      registerRel(cand.id, 'Grand-Offspring', 4);
    }
  }

  // 2. Related Animals Still Within the Herd (excluding direct offspring shown separately)
  const inHerdRelativesRaw: BinderRelatedAnimalEntry[] = [];
  for (const [relId, meta] of relationById.entries()) {
    if (directChildIds.has(relId)) continue;
    const relAnimal = herdById.get(relId);
    if (!relAnimal || isAnimalArchived(relAnimal)) continue;
    inHerdRelativesRaw.push({
      animal: relAnimal,
      relationLabel: meta.label,
      inHerd: true,
      achievementBadge: formatAchievementBadge(
        relAnimal,
        showLegsByAnimalId.get(relAnimal.id) || 0
      ),
    });
  }
  const inHerdRelatives = inHerdRelativesRaw.sort((a, b) => {
    const pA = relationById.get(a.animal.id)?.priority ?? 99;
    const pB = relationById.get(b.animal.id)?.priority ?? 99;
    return pA - pB || a.animal.name.localeCompare(b.animal.name);
  });

  // 3. Noteworthy / Titled Relatives (across offspring + ancestors + siblings, IN HERD or DEPARTED)
  const noteworthyMap = new Map<string, BinderRelatedAnimalEntry>();
  for (const off of directOffspring) {
    const legLogs = showLegsByAnimalId.get(off.animal.id) || 0;
    if (isAnimalNoteworthy(off.animal, legLogs)) {
      noteworthyMap.set(off.animal.id, {
        animal: off.animal,
        relationLabel: 'Direct Offspring',
        inHerd: off.inHerd,
        achievementBadge: formatAchievementBadge(off.animal, legLogs),
      });
    }
  }
  for (const [relId, meta] of relationById.entries()) {
    const relAnimal = herdById.get(relId);
    if (!relAnimal) continue;
    const legLogs = showLegsByAnimalId.get(relAnimal.id) || 0;
    if (isAnimalNoteworthy(relAnimal, legLogs)) {
      noteworthyMap.set(relAnimal.id, {
        animal: relAnimal,
        relationLabel: meta.label,
        inHerd: !isAnimalArchived(relAnimal),
        achievementBadge: formatAchievementBadge(relAnimal, legLogs),
      });
    }
  }
  const noteworthyRelatives = Array.from(noteworthyMap.values()).sort((a, b) => {
    const gcA = a.animal.grandChampionNumber.trim() ? 1 : 0;
    const gcB = b.animal.grandChampionNumber.trim() ? 1 : 0;
    if (gcA !== gcB) return gcB - gcA;
    const legsDiff = (b.animal.legsCount || 0) - (a.animal.legsCount || 0);
    if (legsDiff !== 0) return legsDiff;
    return a.animal.name.localeCompare(b.animal.name);
  });

  return {
    directOffspring,
    inHerdRelatives,
    noteworthyRelatives,
  };
}

function renderPedigreeTableHtml(
  subject: Animal,
  herdById: Map<string, Animal>,
  sp: SpeciesProfile,
  settings: BarnSettings,
  effectiveUnit: WeightUnit,
  generations: 3 | 4 | 5 | 6,
  showPhotos: boolean,
  primaryPhoto?: AnimalPhoto
): string {
  const slots = buildPedigreeSlots(subject, herdById, generations, sp);
  const coi = calculateAnimalCoi(subject, herdById);
  const completeness = getPedigreeCompletenessSummary(coi);
  const slotMap = new Map<string, PedigreeSlot>();
  for (const sl of slots) {
    slotMap.set(`${sl.generation}:${sl.slotIndex}`, sl);
  }
  const compactMode = generations >= 5;

  let anyAncestorGeno = false;
  const renderAncestorCell = (gen: number, idx: number, rowspan: number): string => {
    const slot = slotMap.get(`${gen}:${idx}`);
    const a = slot?.animal;
    const roleTag = idx % 2 === 0 ? sp.maleLabel : sp.femaleLabel;
    if (!a) {
      return `<td rowspan="${rowspan}" class="ped-cell ped-empty">
        <div class="ped-role">${escapeHtml(roleTag)} &mdash; Unknown</div>
      </td>`;
    }
    const geno = a.genotypeRaw || formatGenotypeArray(a.genotype);
    if (!compactMode && geno) {
      anyAncestorGeno = true;
    }
    const carrierSummary = formatCompactCarrierDisclosure(a, {
      herdById,
      includeCleared: true,
      ultraCompact: compactMode,
      maxItemsPerGroup: compactMode ? 2 : 4,
    });
    const metaParts = [
      a.tattoo ? `ID: ${escapeHtml(a.tattoo)}` : '',
      !compactMode && a.variety ? escapeHtml(a.variety) : '',
      !compactMode && a.weightGrams > 0 ? escapeHtml(formatWeight(a.weightGrams, effectiveUnit)) : '',
    ].filter(Boolean);
    const regParts = [
      a.registrationNumber ? `Reg: ${escapeHtml(a.registrationNumber)}` : '',
      a.grandChampionNumber ? `GC: ${escapeHtml(a.grandChampionNumber)}` : '',
      a.legsCount > 0 ? `Legs: ${a.legsCount}` : '',
    ].filter(Boolean);

    return `<td rowspan="${rowspan}" class="ped-cell ${idx % 2 === 0 ? 'ped-sire' : 'ped-dam'}">
      <div class="ped-name">${escapeHtml(a.name)}</div>
      ${metaParts.length ? `<div class="ped-meta">${metaParts.join(' &middot; ')}</div>` : ''}
      ${!compactMode && a.birthDateIso ? `<div class="ped-meta">DOB: ${escapeHtml(formatReadableDate(a.birthDateIso))}</div>` : ''}
      ${regParts.length ? `<div class="ped-meta ped-reg">${regParts.join(' &middot; ')}</div>` : ''}
      ${!compactMode && geno ? `<div class="ped-geno">${escapeHtml(geno)}</div>` : ''}
      ${carrierSummary ? `<div class="ped-carrier">${escapeHtml(carrierSummary)}</div>` : ''}
    </td>`;
  };

  const totalRows = 1 << generations;
  const rows: string[] = [];
  for (let r = 0; r < totalRows; r++) {
    const cells: string[] = [];
    for (let g = 1; g <= generations; g++) {
      const span = 1 << (generations - g);
      if (r % span === 0) {
        const slotIdx = Math.floor(r / span);
        cells.push(renderAncestorCell(g, slotIdx, span));
      }
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }

  const genHeaders = [
    '<th>Parents (Gen 1)</th>',
    '<th>Grandparents (Gen 2)</th>',
    '<th>Great-Grandparents (Gen 3)</th>',
  ];
  if (generations >= 4) genHeaders.push('<th>Gen 4</th>');
  if (generations >= 5) genHeaders.push('<th>Gen 5</th>');
  if (generations >= 6) genHeaders.push('<th>Gen 6</th>');

  const safePrimary =
    showPhotos && primaryPhoto?.dataUrl
      ? sanitizeSafeRasterImageDataUrl(primaryPhoto.dataUrl)
      : '';
  const subjectGeno = subject.genotypeRaw || formatGenotypeArray(subject.genotype);
  const subjectCarriers = formatCompactCarrierDisclosure(subject, {
    herdById,
    includeLineage: true,
    includeCleared: true,
  });

  const sharedAncestorsHtml =
    coi.sharedAncestors.length > 0
      ? `<div class="sub-card">
          <div class="sub-card-title">Linebreeding &amp; Shared Ancestor Contributions</div>
          <table class="data-table compact">
            <thead>
              <tr>
                <th>Common Ancestor</th>
                <th>ID / Tattoo</th>
                <th>Sire Line</th>
                <th>Dam Line</th>
                <th>COI Contribution</th>
              </tr>
            </thead>
            <tbody>
              ${coi.sharedAncestors
                .slice(0, 8)
                .map(
                  (item) => `<tr>
                    <td><strong>${escapeHtml(item.ancestor.name)}</strong></td>
                    <td class="mono">${escapeHtml(item.ancestor.tattoo || '—')}</td>
                    <td class="mono">${item.sireAppearances}x</td>
                    <td class="mono">${item.damAppearances}x</td>
                    <td class="mono">${item.coiContributionPercent.toFixed(2)}%</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>`
      : '';

  return `<div class="binder-sheet">
    <div class="sheet-banner">
      <div>
        <div class="sheet-kicker">PEDIGREE SHEET &middot; ${generations}-GENERATION LINEAGE</div>
        <h3 class="sheet-title">${escapeHtml(subject.name)}${subject.tattoo ? ` <span class="mono muted">(${escapeHtml(subject.tattoo)})</span>` : ''}</h3>
      </div>
      <div class="sheet-meta-right">
        <div><strong>Wright COI:</strong> <span class="mono">${coi.coiPercent.toFixed(2)}%</span> (${escapeHtml(coi.risk.label)})</div>
        <div><strong>3-Gen Completeness:</strong> <span class="mono">${completeness.known3Gen}/${completeness.max3Gen} (${completeness.percent3Gen}%)</span></div>
      </div>
    </div>

    <div class="subject-strip">
      ${safePrimary ? `<img class="subject-thumb" src="${safePrimary}" alt="${escapeHtml(subject.name)}" />` : ''}
      <div class="subject-facts">
        <div><strong>Breed &amp; Variety:</strong> ${escapeHtml([subject.breed, subject.variety].filter(Boolean).join(' — ') || 'Not specified')}</div>
        <div><strong>Sex:</strong> ${escapeHtml(formatSexForSpecies(subject.sex, sp))}</div>
        <div><strong>DOB:</strong> ${escapeHtml(formatReadableDate(subject.birthDateIso))}</div>
        <div><strong>Weight:</strong> ${escapeHtml(formatWeight(subject.weightGrams, effectiveUnit))}</div>
        <div><strong>Reg #:</strong> <span class="mono">${escapeHtml(subject.registrationNumber || 'Unregistered')}</span></div>
        ${subject.grandChampionNumber ? `<div><strong>GC #:</strong> <span class="mono">${escapeHtml(subject.grandChampionNumber)}</span></div>` : ''}
        ${subject.legsCount > 0 ? `<div><strong>Legs:</strong> <span class="mono">${subject.legsCount}</span></div>` : ''}
        ${subject.rufusLevel ? `<div><strong>Rufus Intensity:</strong> ${escapeHtml(subject.rufusLevel)}</div>` : ''}
        ${subjectGeno ? `<div><strong>Genotype:</strong> <code class="mono">${escapeHtml(subjectGeno)}</code></div>` : ''}
        ${subjectCarriers ? `<div><strong>Carrier Disclosures:</strong> ${escapeHtml(subjectCarriers)}</div>` : ''}
      </div>
    </div>

    <table class="ped-table ${compactMode ? 'ped-compact' : ''}">
      <thead><tr>${genHeaders.join('')}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>

    ${
      subjectGeno || anyAncestorGeno || subject.rufusLevel
        ? `<p class="small muted" style="margin-top:6px;">Notice: Color genetics, Rufus intensity &amp; genotype calculation is under development and incomplete (unverified).</p>`
        : ''
    }

    ${sharedAncestorsHtml}
  </div>`;
}

/**
 * Generates a complete, self-contained, human-readable Printable Barn / Herd Binder `.HTM` document
 * strictly scoped to a single livestock species, inheriting missing Barn-level defaults seamlessly.
 */
export function generateSpeciesBarnBinderHtml(
  snapshot: BarnDatabaseSnapshot,
  speciesName: string,
  rawOptions?: Partial<BarnBinderOptions>
): string {
  const settings = snapshot.settings;
  const options = buildDefaultBarnBinderOptions(settings, rawOptions);
  const sp = resolveSpeciesProfile(speciesName, snapshot.speciesProfiles);
  const effectiveUnit = resolveSpeciesWeightUnit(sp, settings, snapshot.speciesProfiles);
  const unitInherited = !sp.preferredUnit;
  const palette = resolveBinderPalette(options.colorMode, settings.customColors);
  const idLabels = getSpeciesIdentifierLabels(sp.name);
  const generatedIso = nowIsoUtc();
  const generatedDateLabel = formatReadableDate(generatedIso.slice(0, 10));
  const barnTitle = (settings.barnName || '').trim() || 'Community Pedigree Barn';
  const breederTitle = (settings.breederName || '').trim() || 'Recorded Breeder';

  // Full species data for lineage lookups (always keep archived ancestors visible in kinship/pedigree lookups)
  const allSpeciesAnimals = snapshot.animals.filter((a) => isSameSpecies(a.species, sp.name));
  const herdById = buildSpeciesHerdMap(allSpeciesAnimals, sp.name);
  const allSpeciesAnimalIds = new Set(allSpeciesAnimals.map((a) => a.id));

  const speciesPhotos = (snapshot.animalPhotos ?? []).filter(
    (p) => isSameSpecies(p.species, sp.name) || allSpeciesAnimalIds.has(p.animalId)
  );
  const photosByAnimalId = new Map<string, AnimalPhoto[]>();
  for (const photo of speciesPhotos) {
    const arr = photosByAnimalId.get(photo.animalId) || [];
    arr.push(photo);
    photosByAnimalId.set(photo.animalId, arr);
  }
  for (const arr of photosByAnimalId.values()) {
    arr.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);
    });
  }

  const speciesCareLogs = snapshot.careLogs.filter(
    (l) => isSameSpecies(l.species, sp.name) || allSpeciesAnimalIds.has(l.animalId)
  );
  const speciesBreedings = snapshot.breedings.filter((b) => isSameSpecies(b.species, sp.name));
  const speciesShows = snapshot.shows.filter((s) => isSameSpecies(s.species, sp.name));
  const speciesCages: CageLocation[] = snapshot.cages
    .filter((c) => isSameSpecies(c.species, sp.name))
    .sort((a, b) => a.label.localeCompare(b.label));

  const activeAnimals = allSpeciesAnimals.filter((a) => !isAnimalArchived(a));
  const archivedAnimals = allSpeciesAnimals.filter((a) => isAnimalArchived(a));

  const includedAnimals = (
    options.includeArchived ? [...activeAnimals, ...archivedAnimals] : [...activeAnimals]
  ).sort((a, b) => {
    const archDiff = (isAnimalArchived(a) ? 1 : 0) - (isAnimalArchived(b) ? 1 : 0);
    if (archDiff !== 0) return archDiff;
    return a.name.localeCompare(b.name) || a.tattoo.localeCompare(b.tattoo);
  });

  // Group Care Logs, Breedings, and Shows by animal ID
  const careLogsByAnimal = new Map<string, CareLog[]>();
  for (const log of speciesCareLogs) {
    const arr = careLogsByAnimal.get(log.animalId) || [];
    arr.push(log);
    careLogsByAnimal.set(log.animalId, arr);
  }
  for (const arr of careLogsByAnimal.values()) {
    arr.sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''));
  }

  const breedingsByAnimal = new Map<string, BreedingRecord[]>();
  for (const br of speciesBreedings) {
    if (br.sireId) {
      const arr = breedingsByAnimal.get(br.sireId) || [];
      arr.push(br);
      breedingsByAnimal.set(br.sireId, arr);
    }
    if (br.damId && br.damId !== br.sireId) {
      const arr = breedingsByAnimal.get(br.damId) || [];
      arr.push(br);
      breedingsByAnimal.set(br.damId, arr);
    }
  }
  for (const arr of breedingsByAnimal.values()) {
    arr.sort((a, b) => (b.bredDateIso || '').localeCompare(a.bredDateIso || ''));
  }

  const showsByAnimal = new Map<string, ShowEvent[]>();
  for (const sh of speciesShows) {
    const ids = mergeEnteredAnimalIdsWithResults(sh.enteredAnimalIds || [], sh.results);
    for (const aid of ids) {
      const arr = showsByAnimal.get(aid) || [];
      arr.push(sh);
      showsByAnimal.set(aid, arr);
    }
  }
  for (const arr of showsByAnimal.values()) {
    arr.sort((a, b) => (b.eventDateIso || '').localeCompare(a.eventDateIso || ''));
  }

  const transferNote = (options.breederTransferNote || '').trim();

  // ── 1. COVER PAGE & BREEDER CERTIFICATION ───────────────────────────────────
  const coverPageHtml = options.includeCoverAndSignature
    ? `<section class="binder-page cover-page">
        <div class="cover-top">
          <div class="cover-eyebrow">${escapeHtml(barnTitle)} &middot; OFFICIAL ARCHIVAL HERD RECORD</div>
          <h1 class="cover-title">${escapeHtml(sp.name)} Barn &amp; Herd Binder</h1>
          <p class="cover-subtitle">
            Complete human-readable livestock registry, multi-generation pedigrees, genetics, health &amp; medical logs,
            ${escapeHtml(sp.birthEventLabel.toLowerCase())} records, show honors, kinship directory, and photograph archive.
          </p>
        </div>

        <div class="cover-grid">
          <div class="info-box">
            <div class="box-title">Binder Scope &amp; Herd Totals</div>
            <dl class="kv-list">
              <div><dt>Document Date</dt><dd>${escapeHtml(generatedDateLabel)}</dd></div>
              <div><dt>Included Stock Scope</dt><dd>${options.includeArchived ? 'Complete Species Archive (Active + Archived / Sold / Deceased)' : 'Active &amp; Current Breeding Stock Only'}</dd></div>
              <div><dt>Animals in Binder</dt><dd class="mono">${includedAnimals.length} (${activeAnimals.length} Active &middot; ${archivedAnimals.length} Archived/Historical)</dd></div>
              <div><dt>Breedings &amp; Litters</dt><dd class="mono">${speciesBreedings.length}</dd></div>
              <div><dt>Medical &amp; Care Logs</dt><dd class="mono">${speciesCareLogs.length}</dd></div>
              <div><dt>Shows &amp; Events</dt><dd class="mono">${speciesShows.length}</dd></div>
              <div><dt>Uploaded Photos</dt><dd class="mono">${options.includePhotos ? speciesPhotos.length : `Omitted by preview setting (${speciesPhotos.length} stored)`}</dd></div>
            </dl>
          </div>

          <div class="info-box">
            <div class="box-title">Barn Standards &amp; Species Inheritance</div>
            <dl class="kv-list">
              <div><dt>Barn / Rabbitry Name</dt><dd>${escapeHtml(barnTitle)}</dd></div>
              <div><dt>Owner / Breeder</dt><dd>${escapeHtml(breederTitle)}</dd></div>
              <div><dt>Weight Display Unit</dt><dd>${escapeHtml(formatUnitLabel(effectiveUnit))} <span class="muted">(${unitInherited ? 'inherited from Barn Settings' : `${escapeHtml(sp.name)} override`})</span></dd></div>
              <div><dt>Pedigree Chart Depth</dt><dd class="mono">${options.generations} Generations${options.generations === settings.defaultGenerations ? ' (inherited default)' : ''}</dd></div>
              <div><dt>Terminology</dt><dd>${escapeHtml(sp.maleLabel)} / ${escapeHtml(sp.femaleLabel)} / ${escapeHtml(sp.offspringLabel)} (${escapeHtml(sp.birthEventLabel)})</dd></div>
              <div><dt>Cycle Defaults</dt><dd class="mono">${sp.gestationDays}d gestation &middot; ${sp.weanDaysAfterBirth}d wean &middot; ${sp.rebreedDaysAfterBirth}d rebreed</dd></div>
              <div><dt>Print Style</dt><dd>${palette.mode === 'color' ? 'Barn Color Picker Accents (White Paper Lock)' : 'Ink Saver Monochrome'}</dd></div>
            </dl>
          </div>
        </div>

        <div class="certification-box">
          <div class="box-title">Breeder Truthfulness Acknowledgment &amp; Herd Transfer Certification</div>
          <p class="cert-statement">
            I hereby certify and acknowledge that the pedigrees, registration numbers, health and medical logs,
            ${escapeHtml(sp.birthEventLabel.toLowerCase())} dates, show awards, and lineage records contained in this binder are
            true, complete, and accurate to the best of my knowledge and belief as of ${escapeHtml(generatedDateLabel)}.
          </p>
          ${transferNote ? `<p class="cert-contact"><strong>Breeder / Transfer Contact:</strong> ${escapeHtml(transferNote)}</p>` : ''}
          <div class="sig-grid">
            <div class="sig-field"><span class="sig-line"></span><span class="sig-label">Breeder Printed Name (${escapeHtml(breederTitle)})</span></div>
            <div class="sig-field"><span class="sig-line"></span><span class="sig-label">Breeder Authorized Signature</span></div>
            <div class="sig-field"><span class="sig-line"></span><span class="sig-label">Certification Date</span></div>
          </div>
          <div class="sig-grid sig-buyer">
            <div class="sig-field"><span class="sig-line"></span><span class="sig-label">Buyer / Transferee Name (Optional — Complete upon Sale/Transfer)</span></div>
            <div class="sig-field"><span class="sig-line"></span><span class="sig-label">Buyer / Transferee Signature</span></div>
            <div class="sig-field"><span class="sig-line"></span><span class="sig-label">Transfer Date</span></div>
          </div>
        </div>

        <div class="page-foot">
          <span>${escapeHtml(barnTitle)} &middot; ${escapeHtml(sp.name)} Barn Binder</span>
          <span>Generated ${escapeHtml(generatedIso.slice(0, 10))}</span>
        </div>
      </section>`
    : '';

  // ── 2. SPECIES OVERVIEW, HERD INDEX, MEMO PAD & HOUSING DIRECTORY ──────────
  const cleanMemo = sanitizeSpeciesMemo(sp.memoText);
  const speciesOverviewHtml = options.includeSpeciesOverview
    ? `<section class="binder-page overview-page">
        <div class="sheet-banner">
          <div>
            <div class="sheet-kicker">SECTION 01 &middot; ${escapeHtml(sp.name.toUpperCase())} INDEX &amp; OPERATIONS</div>
            <h2 class="sheet-title">Herd Index, Biological Schedule &amp; Facility Directory</h2>
          </div>
          <div class="sheet-meta-right">
            <div class="mono">${includedAnimals.length} Included Animal${includedAnimals.length === 1 ? '' : 's'}</div>
          </div>
        </div>

        <div class="sub-card">
          <div class="sub-card-title">Herd Index (Table of Contents)</div>
          ${
            includedAnimals.length === 0
              ? '<p class="empty-msg">No animals match the selected herd scope for this species.</p>'
              : `<table class="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Animal Name</th>
                      <th>${escapeHtml(idLabels.shortLabel)}</th>
                      <th>Breed / Variety</th>
                      <th>Sex</th>
                      <th>Reg #</th>
                      <th>Cage / Pen</th>
                      <th>Status</th>
                      <th>COI</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${includedAnimals
                      .map((a, idx) => {
                        const aCoi = calculateAnimalCoi(a, herdById);
                        return `<tr>
                          <td class="mono">${idx + 1}</td>
                          <td><strong>${escapeHtml(a.name)}</strong></td>
                          <td class="mono">${escapeHtml(a.tattoo || '—')}</td>
                          <td>${escapeHtml([a.breed, a.variety].filter(Boolean).join(' · ') || '—')}</td>
                          <td>${escapeHtml(formatSexForSpecies(a.sex, sp))}</td>
                          <td class="mono">${escapeHtml(a.registrationNumber || '—')}</td>
                          <td>${escapeHtml(a.cageLocation || '—')}</td>
                          <td>${escapeHtml(a.status)}</td>
                          <td class="mono">${aCoi.coiPercent.toFixed(2)}%</td>
                        </tr>`;
                      })
                      .join('')}
                  </tbody>
                </table>`
          }
        </div>

        ${
          sp.milestones.length > 0
            ? `<div class="sub-card">
                <div class="sub-card-title">${escapeHtml(sp.name)} Automated Care Milestones</div>
                <table class="data-table compact">
                  <thead>
                    <tr>
                      <th>Milestone Task</th>
                      <th>Timing Rule</th>
                      <th>Category</th>
                      <th>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${sp.milestones
                      .map((m) => {
                        const timingLabel =
                          m.relativeTo === 'AFTER_BRED'
                            ? `${m.daysOffset} days after breeding`
                            : m.relativeTo === 'BEFORE_BIRTH'
                            ? m.daysOffset === 0
                              ? `On expected ${sp.birthEventLabel.toLowerCase()} date`
                              : `${m.daysOffset} days before ${sp.birthEventLabel.toLowerCase()}`
                            : `${m.daysOffset} days after birth`;
                        return `<tr>
                          <td><strong>${escapeHtml(m.label)}</strong></td>
                          <td>${escapeHtml(timingLabel)}</td>
                          <td>${escapeHtml(m.category)}</td>
                          <td>${escapeHtml(m.priority)}</td>
                        </tr>`;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>`
            : ''
        }

        ${
          cleanMemo
            ? `<div class="sub-card">
                <div class="sub-card-title">${escapeHtml(sp.name)} Note / Memo Pad${sp.memoUpdatedAt ? ` <span class="muted mono">(Updated ${escapeHtml(formatReadableDate(sp.memoUpdatedAt.slice(0, 10)))})</span>` : ''}</div>
                <div class="prose-note">${escapeMultilineHtml(cleanMemo)}</div>
              </div>`
            : ''
        }

        ${
          speciesCages.length > 0
            ? `<div class="sub-card">
                <div class="sub-card-title">Cages, Hutches &amp; Pens Directory (${speciesCages.length})</div>
                <table class="data-table compact">
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>Barn Section</th>
                      <th>Capacity</th>
                      <th>Current Occupants</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${speciesCages
                      .map((cage) => {
                        const cageKey = normalizeCageLabelKey(cage.label);
                        const occupants = cageKey
                          ? activeAnimals.filter(
                              (a) =>
                                isCageOccupyingAnimal(a) &&
                                normalizeCageLabelKey(a.cageLocation) === cageKey
                            )
                          : [];
                        const capacity = Math.max(1, Number(cage.capacity) || 1);
                        const ratioText = `${occupants.length}/${capacity}`;
                        const isOver = occupants.length > capacity;
                        return `<tr>
                          <td><strong>${escapeHtml(cage.label)}</strong></td>
                          <td>${escapeHtml(cage.section || 'Main')}</td>
                          <td class="mono">${escapeHtml(ratioText)}${isOver ? ' <strong>(over capacity)</strong>' : ''}</td>
                          <td>${occupants.length > 0 ? escapeHtml(occupants.map((o) => `${o.name}${o.tattoo ? ` (${o.tattoo})` : ''}`).join(', ')) : '<span class="muted">Vacant</span>'}</td>
                          <td>${escapeHtml(cage.notes || '—')}</td>
                        </tr>`;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>`
            : ''
        }

        ${
          speciesShows.length > 0
            ? `<div class="sub-card">
                <div class="sub-card-title">Recorded ${escapeHtml(sp.name)} Shows &amp; Events (${speciesShows.length})</div>
                <table class="data-table compact">
                  <thead>
                    <tr>
                      <th>Event Date</th>
                      <th>Show Name</th>
                      <th>Sanction</th>
                      <th>Location</th>
                      <th>Entered Animals</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${speciesShows
                      .map((sh) => {
                        const enteredNames = (sh.enteredAnimalIds || [])
                          .map((id) => herdById.get(id))
                          .filter((a): a is Animal => Boolean(a))
                          .map((a) => `${a.name}${a.tattoo ? ` (${a.tattoo})` : ''}`);
                        return `<tr>
                          <td class="mono">${escapeHtml(formatReadableDate(sh.eventDateIso))}</td>
                          <td><strong>${escapeHtml(sh.name)}</strong></td>
                          <td>${escapeHtml(sh.sanctioningBody || '—')}</td>
                          <td>${escapeHtml(sh.location || '—')}</td>
                          <td>${enteredNames.length > 0 ? escapeHtml(enteredNames.join(', ')) : '—'}</td>
                        </tr>`;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>`
            : ''
        }
      </section>`
    : '';

  // ── 3. PER-ANIMAL MULTI-PAGE DOSSIERS ──────────────────────────────────────
  const animalDossiersHtml = includedAnimals
    .map((animal, idx) => {
      const dossierNumber = idx + 1;
      const animalPhotos = photosByAnimalId.get(animal.id) || [];
      const primaryPhoto = animalPhotos.find((p) => p.isPrimary) || animalPhotos[0];
      const animalCareLogs = careLogsByAnimal.get(animal.id) || [];
      const animalBreedings = breedingsByAnimal.get(animal.id) || [];
      const animalShows = showsByAnimal.get(animal.id) || [];
      const coi = calculateAnimalCoi(animal, herdById);
      const kinship = computeAnimalKinshipSummary(animal, allSpeciesAnimals, speciesCareLogs, sp);
      const sire = animal.sireId ? herdById.get(animal.sireId) : undefined;
      const dam = animal.damId ? herdById.get(animal.damId) : undefined;
      const subjectGeno = animal.genotypeRaw || formatGenotypeArray(animal.genotype);
      const animalCarriers = getAnimalCarrierDisclosures(animal);
      const lineageAnalysis = analyzeAnimalCarrierLineage(animal, herdById);
      const showLegLogs = animalCareLogs.filter((l) => l.type === 'Show / Leg' || l.showLegEarned);
      const animalShowSummary = computeAnimalShowSummary(animal, animalShows, animalCareLogs);

      // Sheet 1: Pedigree
      const sheet1Html = renderPedigreeTableHtml(
        animal,
        herdById,
        sp,
        settings,
        effectiveUnit,
        options.generations,
        options.includePhotos,
        primaryPhoto
      );

      // Sheet 2: Supplemental Profile, Genetics & Kinship Network
      const renderRelRows = (entries: BinderRelatedAnimalEntry[], includeMateCol: boolean) =>
        entries
          .map((e) => {
            const stText = e.inHerd ? `In Herd (${e.animal.status})` : `Historical (${e.animal.status})`;
            return `<tr>
              <td><strong>${escapeHtml(e.animal.name)}</strong></td>
              <td class="mono">${escapeHtml(e.animal.tattoo || '—')}</td>
              <td>${escapeHtml(e.relationLabel)}${includeMateCol && e.otherParentLabel ? `<div class="muted small">${escapeHtml(e.otherParentLabel)}</div>` : ''}</td>
              <td class="mono">${escapeHtml(formatReadableDate(e.animal.birthDateIso))}</td>
              <td>${escapeHtml(stText)}</td>
              <td>${escapeHtml(e.achievementBadge || (e.animal.registrationNumber ? `Reg: ${e.animal.registrationNumber}` : '—'))}</td>
            </tr>`;
          })
          .join('');

      const sheet2Html = `<div class="binder-sheet">
        <div class="sheet-banner">
          <div>
            <div class="sheet-kicker">DOSSIER #${dossierNumber} &middot; PROFILE, GENETICS &amp; KINSHIP</div>
            <h3 class="sheet-title">${escapeHtml(animal.name)}${animal.tattoo ? ` <span class="mono muted">(${escapeHtml(animal.tattoo)})</span>` : ''}</h3>
          </div>
          <div class="sheet-meta-right">
            <div><strong>Reg #:</strong> <span class="mono">${escapeHtml(animal.registrationNumber || 'Unregistered')}</span></div>
            <div><strong>Status:</strong> ${escapeHtml(animal.status)}</div>
          </div>
        </div>

        <div class="two-col-grid">
          <div class="sub-card">
            <div class="sub-card-title">Supplemental Identification &amp; Registry Profile</div>
            <dl class="kv-list">
              <div><dt>Registered Name</dt><dd><strong>${escapeHtml(animal.name)}</strong></dd></div>
              <div><dt>${escapeHtml(idLabels.fieldLabel)}</dt><dd class="mono">${escapeHtml(animal.tattoo || 'Unmarked')}</dd></div>
              <div><dt>Registration Number</dt><dd class="mono">${escapeHtml(animal.registrationNumber || 'Unregistered')}</dd></div>
              <div><dt>Grand Champion (GC) #</dt><dd class="mono">${escapeHtml(animal.grandChampionNumber || 'None')}</dd></div>
              <div><dt>Show Legs / GC Progress</dt><dd class="mono">${escapeHtml(animalShowSummary.gcProgress.statusLabel)}</dd></div>
              <div><dt>Species &amp; Breed</dt><dd>${escapeHtml(sp.name)} &mdash; ${escapeHtml(animal.breed || 'Unspecified')}</dd></div>
              <div><dt>Variety / Color</dt><dd>${escapeHtml(animal.variety || 'Unspecified')}</dd></div>
              <div><dt>Biological Sex</dt><dd>${escapeHtml(formatSexForSpecies(animal.sex, sp))}</dd></div>
              <div><dt>Date of Birth</dt><dd>${escapeHtml(formatReadableDate(animal.birthDateIso))}</dd></div>
              <div><dt>Recorded Weight</dt><dd class="mono">${escapeHtml(formatWeight(animal.weightGrams, effectiveUnit))}</dd></div>
              <div><dt>Cage / Pen Location</dt><dd>${escapeHtml(animal.cageLocation || 'Unassigned')}</dd></div>
              <div><dt>Breeder</dt><dd>${escapeHtml(animal.breederName || breederTitle)}</dd></div>
              <div><dt>Current Owner</dt><dd>${escapeHtml(animal.ownerName || breederTitle)}</dd></div>
              <div><dt>Sire / Dam</dt><dd>${escapeHtml(sire ? `${sire.name} (${sire.tattoo || 'No ID'})` : 'Unknown')} &times; ${escapeHtml(dam ? `${dam.name} (${dam.tattoo || 'No ID'})` : 'Unknown')}</dd></div>
            </dl>
          </div>

          <div class="sub-card">
            <div class="sub-card-title">Coat Color Genetics, Carriers &amp; COI Summary</div>
            <dl class="kv-list">
              <div><dt>Genotype String</dt><dd><code class="mono">${escapeHtml(subjectGeno || 'Not recorded')}</code></dd></div>
              ${animal.rufusLevel ? `<div><dt>Rufus Intensity</dt><dd>${escapeHtml(animal.rufusLevel)}</dd></div>` : ''}
              <div><dt>Confirmed Carrier Of</dt><dd>${escapeHtml(animalCarriers.confirmed.length > 0 ? animalCarriers.confirmed.join(', ') : 'None recorded')}</dd></div>
              <div><dt>Suspected Carrier Of</dt><dd>${escapeHtml(animalCarriers.suspected.length > 0 ? animalCarriers.suspected.join(', ') : 'None recorded')}</dd></div>
              <div><dt>Cleared (Non-Carrier Of)</dt><dd>${escapeHtml(
                lineageAnalysis.cleared.length > 0 || lineageAnalysis.genotypeCleared.length > 0
                  ? [
                      ...lineageAnalysis.cleared.map(
                        (c) => `${c.trait} (${formatClearedProofBadge(c)})`
                      ),
                      ...lineageAnalysis.genotypeCleared.map(
                        (g) => `${g.trait} (Homozygous ${g.pair})`
                      ),
                    ].join('; ')
                  : 'None recorded'
              )}</dd></div>
              <div><dt>Lineage Potential Carriers</dt><dd>${escapeHtml(
                lineageAnalysis.lineagePotential.length > 0
                  ? lineageAnalysis.lineagePotential
                      .map((l) => `${l.trait} (via ${l.viaBranches.join('/')})`)
                      .join('; ')
                  : lineageAnalysis.blockedBranches.length > 0
                  ? `None open (${lineageAnalysis.blockedBranches
                      .map((b) => `${b.trait} cleared on ${b.branch} line by ${b.clearedByName}`)
                      .join('; ')})`
                  : 'None from known pedigree'
              )}</dd></div>
              <div><dt>Wright COI</dt><dd class="mono">${coi.coiPercent.toFixed(2)}% &mdash; ${escapeHtml(coi.risk.label)}</dd></div>
              <div><dt>COI Guidance</dt><dd>${escapeHtml(coi.risk.guidance)}</dd></div>
            </dl>
            ${
              animal.genotype.length > 0
                ? `<table class="data-table compact" style="margin-top:8px;">
                    <thead><tr><th>Locus</th><th>Allele 1</th><th>Allele 2</th></tr></thead>
                    <tbody>
                      ${animal.genotype
                        .map(
                          (g) => `<tr>
                            <td class="mono"><strong>${escapeHtml(g.locus)}</strong></td>
                            <td class="mono">${escapeHtml(g.allele1)}</td>
                            <td class="mono">${escapeHtml(g.allele2)}</td>
                          </tr>`
                        )
                        .join('')}
                    </tbody>
                  </table>`
                : ''
            }
            <p class="small muted" style="margin-top:8px;">Notice: Color genetics, Rufus intensity &amp; genotype calculation is under development and incomplete (unverified &mdash; recorded values reflect breeder notes rather than verified formulas).</p>
          </div>
        </div>

        ${
          options.includeShowsAndKinship
            ? `<div class="sub-card">
                <div class="sub-card-title">Direct Offspring (${kinship.directOffspring.length})</div>
                ${
                  kinship.directOffspring.length === 0
                    ? '<p class="empty-msg">No recorded offspring in this species herd.</p>'
                    : `<table class="data-table compact">
                        <thead>
                          <tr>
                            <th>Offspring Name</th>
                            <th>ID</th>
                            <th>Relationship / Mate</th>
                            <th>DOB</th>
                            <th>Herd Status</th>
                            <th>Titles / Reg #</th>
                          </tr>
                        </thead>
                        <tbody>${renderRelRows(kinship.directOffspring, true)}</tbody>
                      </table>`
                }
              </div>

              <div class="sub-card">
                <div class="sub-card-title">Related Animals Still Within the Herd (${kinship.inHerdRelatives.length})</div>
                ${
                  kinship.inHerdRelatives.length === 0
                    ? '<p class="empty-msg">No active/in-herd parents, siblings, or extended relatives recorded.</p>'
                    : `<table class="data-table compact">
                        <thead>
                          <tr>
                            <th>Relative Name</th>
                            <th>ID</th>
                            <th>Relationship</th>
                            <th>DOB</th>
                            <th>Herd Status</th>
                            <th>Titles / Reg #</th>
                          </tr>
                        </thead>
                        <tbody>${renderRelRows(kinship.inHerdRelatives, false)}</tbody>
                      </table>`
                }
              </div>

              <div class="sub-card">
                <div class="sub-card-title">Noteworthy &amp; Titled Relatives Across Lineage (${kinship.noteworthyRelatives.length})</div>
                ${
                  kinship.noteworthyRelatives.length === 0
                    ? '<p class="empty-msg">No Grand Champions or Show Leg winners recorded among ancestors, siblings, or offspring.</p>'
                    : `<table class="data-table compact">
                        <thead>
                          <tr>
                            <th>Titled Relative</th>
                            <th>ID</th>
                            <th>Relationship</th>
                            <th>DOB</th>
                            <th>Current / Historical Status</th>
                            <th>Accomplishments</th>
                          </tr>
                        </thead>
                        <tbody>${renderRelRows(kinship.noteworthyRelatives, false)}</tbody>
                      </table>`
                }
              </div>`
            : ''
        }
      </div>`;

      // Sheet 3: Medical / Health History & Litters / Birthings
      const sheet3Html = options.includeHealthAndLitters
        ? `<div class="binder-sheet">
            <div class="sheet-banner">
              <div>
                <div class="sheet-kicker">DOSSIER #${dossierNumber} &middot; HEALTH, WEIGHTS &amp; ${escapeHtml(sp.birthEventLabel.toUpperCase())} HISTORY</div>
                <h3 class="sheet-title">${escapeHtml(animal.name)}${animal.tattoo ? ` <span class="mono muted">(${escapeHtml(animal.tattoo)})</span>` : ''}</h3>
              </div>
              <div class="sheet-meta-right">
                <div><strong>Care Logs:</strong> <span class="mono">${animalCareLogs.length}</span> &middot; <strong>Litters:</strong> <span class="mono">${animalBreedings.length}</span></div>
              </div>
            </div>

            <div class="sub-card">
              <div class="sub-card-title">Medical, Health, Weight &amp; Care History (${animalCareLogs.length})</div>
              ${
                animalCareLogs.length === 0
                  ? '<p class="empty-msg">No medical, weight, palpation, or care history entries logged for this animal.</p>'
                  : `<table class="data-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Log Type</th>
                          <th>Title / Treatment</th>
                          <th>Weight</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${animalCareLogs
                          .map(
                            (l) => `<tr>
                              <td class="mono">${escapeHtml(formatReadableDate(l.dateIso))}</td>
                              <td><strong>${escapeHtml(l.type)}</strong>${l.showLegEarned ? ' (Leg)' : ''}</td>
                              <td>${escapeHtml(l.title || '—')}</td>
                              <td class="mono">${l.weightGrams > 0 ? escapeHtml(formatWeight(l.weightGrams, effectiveUnit)) : '—'}</td>
                              <td>${l.notes ? escapeMultilineHtml(l.notes) : '—'}</td>
                            </tr>`
                          )
                          .join('')}
                      </tbody>
                    </table>`
              }
            </div>

            <div class="sub-card">
              <div class="sub-card-title">${escapeHtml(sp.birthEventLabel)}s, Pairings &amp; Litter Records (${animalBreedings.length})</div>
              ${
                animalBreedings.length === 0
                  ? `<p class="empty-msg">No ${escapeHtml(sp.birthEventLabel.toLowerCase())} or breeding pairings recorded as ${escapeHtml(sp.maleLabel)} or ${escapeHtml(sp.femaleLabel)}.</p>`
                  : `<table class="data-table">
                      <thead>
                        <tr>
                          <th>Role &amp; Mate</th>
                          <th>Bred Date</th>
                          <th>Due / Actual Birth</th>
                          <th>Status</th>
                          <th>Outcome Counts</th>
                          <th>Proj. COI</th>
                          <th>Breeding Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${animalBreedings
                          .map((b) => {
                            const asSire = b.sireId === animal.id;
                            const mate = asSire
                              ? b.damId ? herdById.get(b.damId) : undefined
                              : b.sireId ? herdById.get(b.sireId) : undefined;
                            const mateLabel = mate
                              ? `${mate.name}${mate.tattoo ? ` (${mate.tattoo})` : ''}`
                              : asSire
                              ? b.damName || 'Unknown Dam'
                              : b.sireName || 'Unknown Sire';
                            const rolePrefix = asSire ? `As ${sp.maleLabel} × ` : `As ${sp.femaleLabel} × `;
                            const countsStr = [
                              `Live: ${b.liveCount}`,
                              `Still: ${b.stillbornCount}`,
                              b.fosteredCount ? `Fost: ${b.fosteredCount}` : '',
                              `Weaned: ${b.weanedCount}`,
                            ]
                              .filter(Boolean)
                              .join(' · ');
                            return `<tr>
                              <td><strong>${escapeHtml(rolePrefix + mateLabel)}</strong></td>
                              <td class="mono">${escapeHtml(formatReadableDate(b.bredDateIso))}</td>
                              <td class="mono">Due ${escapeHtml(formatReadableDate(b.expectedDueDateIso))}${b.actualBirthDateIso ? `<br />Born ${escapeHtml(formatReadableDate(b.actualBirthDateIso))}` : ''}</td>
                              <td>${escapeHtml(formatBreedingStatusForSpecies(b.status, sp))}</td>
                              <td class="mono">${escapeHtml(countsStr)}</td>
                              <td class="mono">${b.projectedCoiPercent.toFixed(2)}%</td>
                              <td>${b.notes ? escapeMultilineHtml(b.notes) : '—'}</td>
                            </tr>`;
                          })
                          .join('')}
                      </tbody>
                    </table>`
              }
            </div>
          </div>`
        : '';

      // Sheet 4: Shows, Uploaded Photos + Captions, & Remaining Animal Notes
      const sheet4Html =
        options.includeShowsAndKinship || options.includePhotos || Boolean(animal.notes?.trim())
          ? `<div class="binder-sheet">
              <div class="sheet-banner">
                <div>
                  <div class="sheet-kicker">DOSSIER #${dossierNumber} &middot; SHOWS, PHOTOS &amp; SUPPLEMENTAL NOTES</div>
                  <h3 class="sheet-title">${escapeHtml(animal.name)}${animal.tattoo ? ` <span class="mono muted">(${escapeHtml(animal.tattoo)})</span>` : ''}</h3>
                </div>
                <div class="sheet-meta-right">
                  <div><strong>Reg #:</strong> <span class="mono">${escapeHtml(animal.registrationNumber || 'Unregistered')}</span></div>
                  <div><strong>GC #:</strong> <span class="mono">${escapeHtml(animal.grandChampionNumber || '—')}</span> &middot; <strong>Legs:</strong> <span class="mono">${animalShowSummary.effectiveLegs}</span></div>
                </div>
              </div>

              ${
                options.includeShowsAndKinship
                  ? `<div class="sub-card">
                      <div class="sub-card-title">Show Winnings, Show Legs &amp; E-Leg Vault</div>
                      <div class="reg-summary-bar">
                        <span><strong>Registration #:</strong> <span class="mono">${escapeHtml(animal.registrationNumber || 'Unregistered')}</span></span>
                        <span><strong>GC Progress:</strong> <span class="mono">${escapeHtml(animalShowSummary.gcProgress.statusLabel)}</span></span>
                        ${animalShowSummary.awardsSummaryText ? `<span><strong>Awards:</strong> <span class="mono">${escapeHtml(animalShowSummary.awardsSummaryText)}</span></span>` : ''}
                        ${animalShowSummary.totalPoints > 0 ? `<span><strong>Points:</strong> <span class="mono">${animalShowSummary.totalPoints}</span></span>` : ''}
                      </div>
                      ${
                        showLegLogs.length === 0 && animalShows.length === 0
                          ? '<p class="empty-msg">No show events or show leg winnings recorded yet.</p>'
                          : `<table class="data-table compact">
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th>Show / Event</th>
                                  <th>Placement &amp; Awards</th>
                                  <th>Legs / Pts</th>
                                  <th>Judge &amp; Notes</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${animalShows
                                  .map((sh) => {
                                    const res = (sh.results ?? []).find((r) => r.animalId === animal.id);
                                    const placementParts = [
                                      res?.classPlacement ? escapeHtml(res.classPlacement) : '',
                                      res && res.awards.length > 0 ? `<strong>${escapeHtml(res.awards.join(', '))}</strong>` : '',
                                    ].filter(Boolean);
                                    const legsPtsParts = [
                                      res && res.legsEarned > 0 ? `${res.legsEarned} Leg${res.legsEarned === 1 ? '' : 's'}` : '',
                                      res?.pointsEarned && res.pointsEarned > 0 ? `${res.pointsEarned} pts` : '',
                                      res?.legCertificateNumber ? `Cert #${res.legCertificateNumber}` : '',
                                    ].filter(Boolean);
                                    const judgeNoteParts = [
                                      res?.judgeName ? `Judge: ${escapeHtml(res.judgeName)}` : '',
                                      res?.judgeNotes ? escapeMultilineHtml(res.judgeNotes) : '',
                                      !res?.judgeNotes && sh.notes ? escapeMultilineHtml(sh.notes) : '',
                                    ].filter(Boolean);
                                    return `<tr>
                                      <td class="mono">${escapeHtml(formatReadableDate(sh.eventDateIso))}</td>
                                      <td><strong>${escapeHtml(sh.name)}</strong><div class="muted small">${escapeHtml([sh.sanctioningBody, sh.location].filter(Boolean).join(' · ') || '—')}</div></td>
                                      <td>${placementParts.length > 0 ? placementParts.join(' &middot; ') : 'Entered on roster'}</td>
                                      <td class="mono">${legsPtsParts.length > 0 ? escapeHtml(legsPtsParts.join(' · ')) : '—'}</td>
                                      <td>${judgeNoteParts.length > 0 ? judgeNoteParts.join('<br />') : '—'}</td>
                                    </tr>`;
                                  })
                                  .join('')}
                                ${showLegLogs
                                  .map(
                                    (l) => `<tr>
                                      <td class="mono">${escapeHtml(formatReadableDate(l.dateIso))}</td>
                                      <td><strong>${escapeHtml(l.title || 'Show / Leg Log')}</strong><div class="muted small">Care Log Entry</div></td>
                                      <td>${l.showLegEarned ? '<strong>Leg Earned</strong>' : 'Show Log'}</td>
                                      <td class="mono">${l.showLegEarned ? '1 Leg' : '—'}</td>
                                      <td>${l.notes ? escapeMultilineHtml(l.notes) : '—'}</td>
                                    </tr>`
                                  )
                                  .join('')}
                              </tbody>
                            </table>`
                      }
                      ${
                        animalShowSummary.eLegAttachments.length > 0
                          ? options.includePhotos
                            ? `<div class="photo-grid" style="margin-top:8px;">
                                ${animalShowSummary.eLegAttachments
                                  .map((att, idx) => {
                                    const safeUrl = sanitizeSafeRasterImageDataUrl(att.dataUrl || att.thumbnailDataUrl);
                                    return `<figure class="photo-card">
                                      ${safeUrl ? `<img src="${safeUrl}" alt="${escapeHtml(att.caption || `${animal.name} E-Leg ${idx + 1}`)}" />` : ''}
                                      <figcaption>
                                        <div class="photo-label">E-Leg #${idx + 1} &middot; ${escapeHtml(att.showName)} (${escapeHtml(formatReadableDate(att.eventDateIso))})</div>
                                        <div class="photo-caption">${att.legCertificateNumber ? `Cert #${escapeHtml(att.legCertificateNumber)} &middot; ` : ''}${att.caption ? escapeHtml(att.caption) : escapeHtml(att.fileName)}</div>
                                      </figcaption>
                                    </figure>`;
                                  })
                                  .join('')}
                              </div>`
                            : `<p class="empty-msg" style="margin-top:6px;">${animalShowSummary.eLegAttachments.length} E-Leg certificate photo(s) attached (image rendering disabled by preview setting).</p>`
                          : ''
                      }
                    </div>`
                  : ''
              }

              <div class="sub-card">
                <div class="sub-card-title">Uploaded Photographs &amp; Photo Notes (${animalPhotos.length})</div>
                ${
                  animalPhotos.length === 0
                    ? '<p class="empty-msg">No uploaded photographs attached to this animal.</p>'
                    : !options.includePhotos
                    ? `<p class="empty-msg">Image rendering disabled by preview setting (${animalPhotos.length} photo caption${animalPhotos.length === 1 ? '' : 's'} summarized): ${escapeHtml(
                        animalPhotos
                          .map((p, pIdx) => `#${pIdx + 1}${p.caption ? `: ${p.caption}` : ''}`)
                          .join(' | ')
                      )}</p>`
                    : `<div class="photo-grid">
                        ${animalPhotos
                          .map((p, pIdx) => {
                            const safeUrl = sanitizeSafeRasterImageDataUrl(p.dataUrl);
                            return `<figure class="photo-card">
                              ${safeUrl ? `<img src="${safeUrl}" alt="${escapeHtml(p.caption || `${animal.name} photo ${pIdx + 1}`)}" />` : ''}
                              <figcaption>
                                <div class="photo-label">Photo #${pIdx + 1}${p.isPrimary ? ' (Primary Cover)' : ''}${p.originalFileName ? ` &middot; <span class="mono">${escapeHtml(p.originalFileName)}</span>` : ''}</div>
                                <div class="photo-caption">${p.caption ? escapeMultilineHtml(p.caption) : '<span class="muted">No photo notes entered.</span>'}</div>
                              </figcaption>
                            </figure>`;
                          })
                          .join('')}
                      </div>`
                }
              </div>

              <div class="sub-card">
                <div class="sub-card-title">Additional / General Profile Notes</div>
                <div class="prose-note">${
                  animal.notes && animal.notes.trim()
                    ? escapeMultilineHtml(animal.notes.trim())
                    : '<span class="muted">No additional general notes recorded on this animal&rsquo;s profile.</span>'
                }</div>
              </div>
            </div>`
          : '';

      return `<article class="animal-dossier">
        ${sheet1Html}
        ${sheet2Html}
        ${sheet3Html}
        ${sheet4Html}
      </article>`;
    })
    .join('\n');

  const emptyDossierFallback =
    includedAnimals.length === 0
      ? `<section class="binder-page">
          <div class="sub-card">
            <div class="sub-card-title">No Animal Dossiers Selected</div>
            <p class="empty-msg">
              There are currently no ${options.includeArchived ? '' : 'active '}${escapeHtml(sp.name)} animals in the selected binder scope.
              ${!options.includeArchived && archivedAnimals.length > 0 ? `Enable <strong>Include Archived / Sold / Deceased</strong> in the Binder toolbar to print ${archivedAnimals.length} historical animal record${archivedAnimals.length === 1 ? '' : 's'}.` : ''}
            </p>
          </div>
        </section>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
${palette.mode === 'color' ? '<meta name="barn-preserve-accent-ink" content="true" />' : ''}
<title>${escapeHtml(barnTitle)} - ${escapeHtml(sp.name)} Barn Binder</title>
<style>
  @page { size: letter portrait; margin: 12mm; }
  :root, html, body {
    color-scheme: light only;
    background: #ffffff;
    background-color: #ffffff;
    color: ${palette.ink};
    margin: 0;
    padding: 0;
  }
  body {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 11.5px;
    line-height: 1.42;
    padding: 16px;
  }
  * { box-sizing: border-box; }
  .mono { font-family: "Courier New", Courier, monospace; font-variant-numeric: tabular-nums; }
  .muted { color: ${palette.mutedInk}; }
  .small { font-size: 10px; }

  .binder-page, .binder-sheet {
    background: #ffffff;
    background-color: #ffffff;
    page-break-after: always;
    break-after: page;
    padding-bottom: 10px;
  }
  .binder-sheet:last-child, .animal-dossier:last-child .binder-sheet:last-child {
    page-break-after: auto;
    break-after: auto;
  }

  /* Cover Page */
  .cover-page {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 9.3in;
    border: 2px solid ${palette.border};
    padding: 24px 26px;
    background: #ffffff;
  }
  .cover-eyebrow {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.14em;
    font-weight: bold;
    color: ${palette.accent};
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .cover-title {
    font-size: 30px;
    line-height: 1.15;
    margin: 0 0 8px 0;
    color: ${palette.primary};
    border-bottom: 2.5px solid ${palette.primary};
    padding-bottom: 10px;
  }
  .cover-subtitle {
    font-size: 12.5px;
    color: ${palette.mutedInk};
    margin: 10px 0 0 0;
    max-width: 660px;
  }
  .cover-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin: 18px 0;
  }
  .info-box, .sub-card, .certification-box {
    background: #ffffff;
    background-color: #ffffff;
    border: 1px solid ${palette.hairline};
    border-top: 2.5px solid ${palette.primary};
    padding: 10px 12px;
    margin-bottom: 10px;
    break-inside: avoid;
  }
  .certification-box {
    border-top: 2.5px solid ${palette.accent};
    margin-top: 8px;
  }
  .box-title, .sub-card-title {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    font-weight: bold;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: ${palette.primary};
    border-bottom: 1px solid ${palette.hairline};
    padding-bottom: 4px;
    margin-bottom: 8px;
  }
  .kv-list {
    margin: 0;
    padding: 0;
  }
  .kv-list > div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 3px 0;
    border-bottom: 1px dotted ${palette.hairline};
    font-size: 11px;
  }
  .kv-list > div:last-child { border-bottom: none; }
  .kv-list dt { font-weight: bold; color: ${palette.mutedInk}; min-width: 130px; }
  .kv-list dd { margin: 0; text-align: right; color: ${palette.ink}; }

  .cert-statement { font-size: 11.5px; margin: 4px 0 10px 0; font-style: italic; }
  .cert-contact { font-size: 11px; margin: 0 0 10px 0; color: ${palette.primary}; }
  .sig-grid {
    display: grid;
    grid-template-columns: 1.2fr 1.4fr 0.9fr;
    gap: 16px;
    margin-top: 18px;
  }
  .sig-buyer { margin-top: 22px; }
  .sig-field { display: flex; flex-direction: column; }
  .sig-line {
    border-bottom: 1px solid ${palette.ink};
    height: 22px;
    margin-bottom: 4px;
  }
  .sig-label {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9.5px;
    color: ${palette.mutedInk};
  }
  .page-foot {
    display: flex;
    justify-content: space-between;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9.5px;
    color: ${palette.mutedInk};
    border-top: 1px solid ${palette.hairline};
    padding-top: 6px;
    margin-top: 10px;
  }

  /* Sheet Headers & Layout */
  .sheet-banner {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 12px;
    border-bottom: 2px solid ${palette.primary};
    padding-bottom: 6px;
    margin-bottom: 10px;
  }
  .sheet-kicker {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9.5px;
    letter-spacing: 0.1em;
    font-weight: bold;
    color: ${palette.accent};
    text-transform: uppercase;
  }
  .sheet-title {
    font-size: 19px;
    margin: 2px 0 0 0;
    color: ${palette.primary};
  }
  .sheet-meta-right {
    text-align: right;
    font-size: 10.5px;
    color: ${palette.mutedInk};
    white-space: nowrap;
  }
  .two-col-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  /* Subject Strip & Pedigree Table */
  .subject-strip {
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid ${palette.hairline};
    border-left: 3.5px solid ${palette.primary};
    background: #ffffff;
    padding: 8px 10px;
    margin-bottom: 10px;
  }
  .subject-thumb {
    width: 68px;
    height: 68px;
    object-fit: cover;
    border: 1px solid ${palette.hairline};
    border-radius: 4px;
    flex-shrink: 0;
  }
  .subject-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    font-size: 11px;
    flex: 1;
  }
  table.ped-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    background: #ffffff;
    margin-bottom: 10px;
  }
  table.ped-table th {
    background: #ffffff;
    color: ${palette.primary};
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    text-align: left;
    padding: 4px 6px;
    border: 1px solid ${palette.hairline};
    border-bottom: 2px solid ${palette.primary};
  }
  td.ped-cell {
    background: #ffffff;
    border: 1px solid ${palette.hairline};
    padding: 4px 6px;
    vertical-align: middle;
    font-size: 10px;
    line-height: 1.25;
    word-break: break-word;
  }
  td.ped-sire { border-left: 3px solid ${palette.male}; }
  td.ped-dam { border-left: 3px solid ${palette.female}; }
  td.ped-empty { color: ${palette.mutedInk}; font-style: italic; }
  table.ped-compact td.ped-cell { padding: 2px 4px; font-size: 8.5px; line-height: 1.15; }
  .ped-name { font-weight: bold; color: ${palette.ink}; }
  .ped-meta { font-family: "Courier New", monospace; font-size: 9px; color: ${palette.mutedInk}; }
  .ped-reg { color: ${palette.accent}; }
  .ped-geno { font-family: "Courier New", monospace; font-size: 8.5px; color: ${palette.primary}; }
  .ped-carrier { font-family: Arial, Helvetica, sans-serif; font-size: 8.2px; font-weight: bold; color: ${palette.accent}; margin-top: 1.5px; line-height: 1.15; }

  /* Data Tables */
  table.data-table {
    width: 100%;
    border-collapse: collapse;
    background: #ffffff;
    font-size: 10.5px;
  }
  table.data-table.compact { font-size: 10px; }
  table.data-table th {
    background: #ffffff;
    color: ${palette.primary};
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    text-align: left;
    padding: 5px 6px;
    border-bottom: 1.5px solid ${palette.primary};
    border-top: 1px solid ${palette.hairline};
  }
  table.data-table td {
    background: #ffffff;
    padding: 5px 6px;
    border-bottom: 1px solid ${palette.hairline};
    vertical-align: top;
  }
  .reg-summary-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 20px;
    font-size: 11px;
    padding-bottom: 6px;
    margin-bottom: 6px;
    border-bottom: 1px solid ${palette.hairline};
  }
  .prose-note {
    font-size: 11px;
    line-height: 1.5;
    padding: 4px 2px;
    white-space: normal;
    word-break: break-word;
  }
  .empty-msg {
    font-size: 10.5px;
    color: ${palette.mutedInk};
    font-style: italic;
    margin: 2px 0;
  }

  /* Photo Gallery Grid */
  .photo-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .photo-card {
    margin: 0;
    border: 1px solid ${palette.hairline};
    background: #ffffff;
    padding: 6px;
    break-inside: avoid;
  }
  .photo-card img {
    width: 100%;
    height: 165px;
    object-fit: contain;
    background: #ffffff;
    border-bottom: 1px solid ${palette.hairline};
    margin-bottom: 5px;
  }
  .photo-label {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9.5px;
    font-weight: bold;
    color: ${palette.primary};
    margin-bottom: 2px;
  }
  .photo-caption {
    font-size: 10.5px;
    color: ${palette.ink};
    word-break: break-word;
  }

  @media print {
    :root, html, body, .binder-page, .binder-sheet, .cover-page, .info-box, .sub-card, .certification-box, .subject-strip, table.ped-table, table.ped-table th, td.ped-cell, table.data-table, table.data-table th, table.data-table td, .photo-card, .photo-card img {
      color-scheme: light only !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      box-shadow: none !important;
    }
    ${
      palette.mode === 'ink_saver'
        ? `:root, html, body, * {
             color: #000000 !important;
             -webkit-print-color-adjust: economy !important;
             print-color-adjust: economy !important;
           }`
        : `* {
             -webkit-print-color-adjust: exact;
             print-color-adjust: exact;
           }`
    }
  }
</style>
</head>
<body>
  ${coverPageHtml}
  ${speciesOverviewHtml}
  ${animalDossiersHtml || emptyDossierFallback}
</body>
</html>`;
}
```

## `src/core/barnScheduler.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Barn Scheduler Gantt Timeline & Smart Priority Escalation Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) or framework dependencies.
 * All date arithmetic uses explicit `Date.UTC` / `addDaysIso` calendar strings (`YYYY-MM-DD`).
 */

import {
  addDaysIso,
  BarnTask,
  BreedingRecord,
  SpeciesProfile,
  TaskCategory,
  TaskPriority,
  todayDateIso,
} from './models';
import { bumpRecordRevision } from './syncOutbox';

export type GanttGroupingMode = 'breeding_or_animal' | 'category';
export type GanttWindowDays = 14 | 21 | 30;

export interface TaskEscalationEvaluation {
  taskId: string;
  storedPriority: TaskPriority;
  effectivePriority: TaskPriority;
  isEscalated: boolean;
  isOverdue: boolean;
  daysUntilDue: number | null; // negative = overdue
  isCriticalTimeWindow: boolean;
  reason: string;
  urgencyScore: number; // higher = more urgent
}

export interface BarnSchedulerSummary {
  totalOpenCount: number;
  overdueCount: number;
  escalatedCount: number;
  criticalNestboxOrBirthCount: number;
  unscheduledCount: number;
}

export interface GanttDayColumn {
  dateIso: string;
  dayOfMonth: string;
  weekdayShort: string;
  monthShort: string;
  isToday: boolean;
  isWeekend: boolean;
}

export interface BarnGanttBarItem {
  task: BarnTask;
  escalation: TaskEscalationEvaluation;
  effectiveStartIso: string;
  effectiveDueIso: string;
  durationDays: number;
  startColIndex: number; // 0-based within window
  spanCols: number; // >= 1
  overdueTailCols: number; // extra columns extending from due date up to today when overdue
  clippedLeft: boolean;
  clippedRight: boolean;
  isInWindow: boolean;
}

export interface BarnGanttLane {
  laneId: string;
  label: string;
  subtitle: string;
  linkedAnimalId?: string;
  linkedBreedingId?: string;
  category?: TaskCategory;
  bars: BarnGanttBarItem[];
  hasEscalatedTask: boolean;
  hasOverdueTask: boolean;
}

export interface BarnGanttTimelineModel {
  windowStartIso: string;
  windowEndIso: string;
  windowDays: GanttWindowDays;
  todayIso: string;
  days: GanttDayColumn[];
  lanes: BarnGanttLane[];
  unscheduledTasks: Array<{ task: BarnTask; escalation: TaskEscalationEvaluation }>;
  summary: BarnSchedulerSummary;
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  Low: 1,
  Normal: 2,
  High: 3,
};

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function isValidYmdIso(iso: string | undefined): iso is string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return false;
  const [y, m, d] = iso.trim().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Computes exact signed calendar days (`toIso - fromIso`) using `Date.UTC`.
 */
export function diffYmdDays(fromIso: string, toIso: string): number | null {
  if (!isValidYmdIso(fromIso) || !isValidYmdIso(toIso)) return null;
  const [y1, m1, d1] = fromIso.split('-').map(Number);
  const [y2, m2, d2] = toIso.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / 86_400_000);
}

/**
 * Evaluates smart priority escalation rules for a single `BarnTask` relative to `todayIso`.
 * Time-critical biological tasks (such as overdue or due-today `Nestbox` and `Birth Check` tasks)
 * automatically escalate to `High` priority with an explicit explanation.
 */
export function evaluateTaskPriorityEscalation(
  task: BarnTask,
  todayIso: string = todayDateIso()
): TaskEscalationEvaluation {
  const storedPriority: TaskPriority = task.priority || 'Normal';

  if (task.completed || !isValidYmdIso(task.dueDateIso)) {
    return {
      taskId: task.id,
      storedPriority,
      effectivePriority: storedPriority,
      isEscalated: false,
      isOverdue: false,
      daysUntilDue: isValidYmdIso(task.dueDateIso) ? diffYmdDays(todayIso, task.dueDateIso) : null,
      isCriticalTimeWindow: false,
      reason: '',
      urgencyScore: PRIORITY_RANK[storedPriority] * 10,
    };
  }

  const daysUntilDue = diffYmdDays(todayIso, task.dueDateIso)!;
  const isOverdue = daysUntilDue < 0;
  const overdueDays = isOverdue ? Math.abs(daysUntilDue) : 0;

  let effectivePriority: TaskPriority = storedPriority;
  let reason = '';
  let isCriticalTimeWindow = false;

  if (task.category === 'Nestbox' || task.category === 'Birth Check') {
    if (isOverdue) {
      effectivePriority = 'High';
      isCriticalTimeWindow = true;
      reason = `Overdue ${task.category.toLowerCase()} (${overdueDays}d late)`;
    } else if (daysUntilDue === 0) {
      effectivePriority = 'High';
      isCriticalTimeWindow = true;
      reason = `${task.category} due today`;
    } else if (daysUntilDue === 1) {
      effectivePriority = 'High';
      isCriticalTimeWindow = true;
      reason = `${task.category} due tomorrow`;
    }
  } else if (task.category === 'Health' || task.category === 'Palpation') {
    if (isOverdue) {
      effectivePriority = 'High';
      isCriticalTimeWindow = true;
      reason = `Overdue ${task.category.toLowerCase()} (${overdueDays}d late)`;
    } else if (daysUntilDue === 0 && PRIORITY_RANK[storedPriority] < PRIORITY_RANK.Normal) {
      effectivePriority = 'Normal';
      reason = `${task.category} due today`;
    }
  } else {
    if (daysUntilDue <= -3) {
      effectivePriority = 'High';
      isCriticalTimeWindow = true;
      reason = `Overdue by ${overdueDays} days`;
    } else if (isOverdue && PRIORITY_RANK[storedPriority] < PRIORITY_RANK.Normal) {
      effectivePriority = 'Normal';
      reason = `Overdue by ${overdueDays}d`;
    } else if (daysUntilDue === 0 && storedPriority === 'Low') {
      effectivePriority = 'Normal';
      reason = 'Due today';
    }
  }

  const isEscalated = PRIORITY_RANK[effectivePriority] > PRIORITY_RANK[storedPriority];
  const dueUrgencyBoost = isOverdue
    ? 100 + Math.min(60, overdueDays * 5)
    : daysUntilDue === 0
    ? 60
    : daysUntilDue <= 2
    ? 30
    : 0;
  const urgencyScore =
    PRIORITY_RANK[effectivePriority] * 25 +
    dueUrgencyBoost +
    (isCriticalTimeWindow ? 40 : 0);

  return {
    taskId: task.id,
    storedPriority,
    effectivePriority,
    isEscalated,
    isOverdue,
    daysUntilDue,
    isCriticalTimeWindow,
    reason,
    urgencyScore,
  };
}

/**
 * Builds updated `BarnTask` objects for every open task whose stored priority is lower than
 * its smart-escalated `effectivePriority`. Bumps `_rev` for deterministic sync reconciliation.
 */
export function buildPriorityEscalationUpdates(
  tasks: BarnTask[],
  todayIso: string,
  timestampIso: string
): BarnTask[] {
  const updates: BarnTask[] = [];
  for (const task of tasks) {
    if (task.completed) continue;
    const evalRes = evaluateTaskPriorityEscalation(task, todayIso);
    if (evalRes.isEscalated) {
      updates.push({
        ...task,
        priority: evalRes.effectivePriority,
        _rev: bumpRecordRevision(task),
        updatedAt: timestampIso,
      });
    }
  }
  return updates;
}

/**
 * Resolves the effective `[startDateIso, dueDateIso]` pair for a `BarnTask`.
 */
export function resolveTaskSpanDates(task: Pick<BarnTask, 'startDateIso' | 'dueDateIso'>): {
  startDateIso: string;
  dueDateIso: string;
  durationDays: number;
} | null {
  if (!isValidYmdIso(task.dueDateIso)) return null;
  const due = task.dueDateIso.trim();
  let start = isValidYmdIso(task.startDateIso) ? task.startDateIso.trim() : due;
  if (start > due) start = due;
  const diff = diffYmdDays(start, due) ?? 0;
  return {
    startDateIso: start,
    dueDateIso: due,
    durationDays: Math.max(1, diff + 1),
  };
}

/**
 * Shifts a task's scheduled `dueDateIso` (and `startDateIso` if set) by `deltaDays`
 * using pure UTC calendar math.
 */
export function shiftTaskDatesByDays(
  task: BarnTask,
  deltaDays: number,
  timestampIso: string
): BarnTask | null {
  if (!Number.isFinite(deltaDays) || Math.round(deltaDays) === 0) return null;
  const span = resolveTaskSpanDates(task);
  if (!span) return null;
  const cleanDelta = Math.round(deltaDays);
  const nextDue = addDaysIso(span.dueDateIso, cleanDelta);
  const nextStart = isValidYmdIso(task.startDateIso)
    ? addDaysIso(span.startDateIso, cleanDelta)
    : undefined;

  return {
    ...task,
    ...(nextStart ? { startDateIso: nextStart } : {}),
    dueDateIso: nextDue,
    _rev: bumpRecordRevision(task),
    updatedAt: timestampIso,
  };
}

/**
 * Adjusts a task's `startDateIso` edge by `deltaStartDays` (clamped so `startDateIso <= dueDateIso`),
 * allowing Gantt bar duration resizing without altering `dueDateIso`.
 */
export function resizeTaskStartDateByDays(
  task: BarnTask,
  deltaStartDays: number,
  timestampIso: string
): BarnTask | null {
  if (!Number.isFinite(deltaStartDays) || Math.round(deltaStartDays) === 0) return null;
  const span = resolveTaskSpanDates(task);
  if (!span) return null;
  const cleanDelta = Math.round(deltaStartDays);
  let nextStart = addDaysIso(span.startDateIso, cleanDelta);
  if (nextStart > span.dueDateIso) {
    nextStart = span.dueDateIso;
  }
  if (nextStart === span.startDateIso && isValidYmdIso(task.startDateIso)) {
    return null;
  }
  return {
    ...task,
    startDateIso: nextStart === span.dueDateIso ? '' : nextStart,
    _rev: bumpRecordRevision(task),
    updatedAt: timestampIso,
  };
}

/**
 * Builds the complete Barn Scheduler Gantt timeline model for the active species.
 */
export function buildBarnGanttTimeline(params: {
  tasks: BarnTask[];
  breedings: BreedingRecord[];
  speciesProfile: SpeciesProfile;
  windowStartIso: string;
  windowDays: GanttWindowDays;
  grouping: GanttGroupingMode;
  includeCompleted?: boolean;
  todayIso?: string;
}): BarnGanttTimelineModel {
  const todayIso = isValidYmdIso(params.todayIso) ? params.todayIso : todayDateIso();
  const windowStartIso = isValidYmdIso(params.windowStartIso)
    ? params.windowStartIso
    : addDaysIso(todayIso, -3);
  const windowEndIso = addDaysIso(windowStartIso, params.windowDays - 1);

  const days: GanttDayColumn[] = [];
  for (let i = 0; i < params.windowDays; i++) {
    const dateIso = addDaysIso(windowStartIso, i);
    const [y, m, d] = dateIso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dow = dt.getUTCDay();
    days.push({
      dateIso,
      dayOfMonth: String(d),
      weekdayShort: WEEKDAY_NAMES[dow],
      monthShort: MONTH_NAMES[m - 1],
      isToday: dateIso === todayIso,
      isWeekend: dow === 0 || dow === 6,
    });
  }

  const breedingById = new Map<string, BreedingRecord>(
    params.breedings.map((b) => [b.id, b])
  );

  const evaluations = new Map<string, TaskEscalationEvaluation>();
  let totalOpenCount = 0;
  let overdueCount = 0;
  let escalatedCount = 0;
  let criticalNestboxOrBirthCount = 0;
  let unscheduledCount = 0;

  for (const task of params.tasks) {
    const ev = evaluateTaskPriorityEscalation(task, todayIso);
    evaluations.set(task.id, ev);
    if (!task.completed) {
      totalOpenCount += 1;
      if (ev.isOverdue) overdueCount += 1;
      if (ev.isEscalated) escalatedCount += 1;
      if (
        ev.isCriticalTimeWindow &&
        (task.category === 'Nestbox' || task.category === 'Birth Check')
      ) {
        criticalNestboxOrBirthCount += 1;
      }
      if (!isValidYmdIso(task.dueDateIso)) {
        unscheduledCount += 1;
      }
    }
  }

  const filteredTasks = params.tasks.filter(
    (t) => params.includeCompleted || !t.completed
  );

  const unscheduledTasks: Array<{ task: BarnTask; escalation: TaskEscalationEvaluation }> = [];
  const laneMap = new Map<string, BarnGanttLane>();

  const ensureLane = (
    laneId: string,
    meta: Omit<BarnGanttLane, 'laneId' | 'bars' | 'hasEscalatedTask' | 'hasOverdueTask'>
  ): BarnGanttLane => {
    let existing = laneMap.get(laneId);
    if (!existing) {
      existing = {
        laneId,
        ...meta,
        bars: [],
        hasEscalatedTask: false,
        hasOverdueTask: false,
      };
      laneMap.set(laneId, existing);
    }
    return existing;
  };

  for (const task of filteredTasks) {
    const escalation = evaluations.get(task.id)!;
    const span = resolveTaskSpanDates(task);
    if (!span) {
      unscheduledTasks.push({ task, escalation });
      continue;
    }

    let lane: BarnGanttLane;
    if (params.grouping === 'category') {
      lane = ensureLane(`cat:${task.category}`, {
        label: task.category,
        subtitle: `${params.speciesProfile.name} chores`,
        category: task.category,
      });
    } else if (task.linkedBreedingId && breedingById.has(task.linkedBreedingId)) {
      const b = breedingById.get(task.linkedBreedingId)!;
      lane = ensureLane(`breed:${b.id}`, {
        label: `${b.damName} × ${b.sireName}`,
        subtitle: `Bred ${b.bredDateIso} · Due ${b.actualBirthDateIso || b.expectedDueDateIso || 'TBD'}`,
        linkedBreedingId: b.id,
        linkedAnimalId: b.damId || task.linkedAnimalId || undefined,
      });
    } else if (task.linkedAnimalId) {
      lane = ensureLane(`animal:${task.linkedAnimalId}`, {
        label: task.linkedAnimalName || 'Linked Animal',
        subtitle: `${params.speciesProfile.name} individual care`,
        linkedAnimalId: task.linkedAnimalId,
      });
    } else {
      lane = ensureLane('general:barn', {
        label: 'General Barn Chores',
        subtitle: `${params.speciesProfile.name} facility & routine tasks`,
      });
    }

    const rawStartOffset = diffYmdDays(windowStartIso, span.startDateIso)!;
    const rawDueOffset = diffYmdDays(windowStartIso, span.dueDateIso)!;
    const todayOffset = diffYmdDays(windowStartIso, todayIso)!;

    // Visual overdue tail extends from due date toward today if uncompleted & overdue
    const effectiveVisualEndOffset =
      !task.completed && escalation.isOverdue && todayOffset > rawDueOffset
        ? todayOffset
        : rawDueOffset;

    const isInWindow =
      effectiveVisualEndOffset >= 0 && rawStartOffset <= params.windowDays - 1;
    const clippedLeft = rawStartOffset < 0;
    const clippedRight = rawDueOffset > params.windowDays - 1;
    const startColIndex = Math.max(0, Math.min(params.windowDays - 1, rawStartOffset));
    const clampedDueCol = Math.max(startColIndex, Math.min(params.windowDays - 1, rawDueOffset));
    const spanCols = Math.max(1, clampedDueCol - startColIndex + 1);

    let overdueTailCols = 0;
    if (!task.completed && escalation.isOverdue && todayOffset > rawDueOffset) {
      const tailStart = Math.max(0, rawDueOffset + 1);
      const tailEnd = Math.min(params.windowDays - 1, todayOffset);
      if (tailEnd >= tailStart && rawDueOffset < params.windowDays - 1) {
        overdueTailCols = tailEnd - tailStart + 1;
      }
    }

    if (escalation.isEscalated) lane.hasEscalatedTask = true;
    if (escalation.isOverdue && !task.completed) lane.hasOverdueTask = true;

    lane.bars.push({
      task,
      escalation,
      effectiveStartIso: span.startDateIso,
      effectiveDueIso: span.dueDateIso,
      durationDays: span.durationDays,
      startColIndex,
      spanCols,
      overdueTailCols,
      clippedLeft,
      clippedRight,
      isInWindow,
    });
  }

  for (const lane of laneMap.values()) {
    lane.bars.sort(
      (a, b) =>
        a.effectiveStartIso.localeCompare(b.effectiveStartIso) ||
        b.escalation.urgencyScore - a.escalation.urgencyScore
    );
  }

  const lanes = Array.from(laneMap.values()).sort((a, b) => {
    if (a.hasOverdueTask !== b.hasOverdueTask) return a.hasOverdueTask ? -1 : 1;
    if (a.hasEscalatedTask !== b.hasEscalatedTask) return a.hasEscalatedTask ? -1 : 1;
    const aEarliest = a.bars[0]?.effectiveDueIso || '9999-99-99';
    const bEarliest = b.bars[0]?.effectiveDueIso || '9999-99-99';
    return aEarliest.localeCompare(bEarliest) || a.label.localeCompare(b.label);
  });

  return {
    windowStartIso,
    windowEndIso,
    windowDays: params.windowDays,
    todayIso,
    days,
    lanes,
    unscheduledTasks,
    summary: {
      totalOpenCount,
      overdueCount,
      escalatedCount,
      criticalNestboxOrBirthCount,
      unscheduledCount,
    },
  };
}
```

## `src/core/batchPrint.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Batch Print Engine (`src/core/batchPrint.ts`).
 *
 * Generates single-pass, self-contained printable `.HTM` / Print-to-PDF documents from
 * multi-selected herd animals across four breeder-ready formats:
 *   1. `cage_cards`        — 8-Up US Letter Kennel / Cage Cards (2x4 grid, optional cut guides)
 *   2. `stacked_pedigrees` — Stacked Formal Evans-Style Pedigrees (1 per landscape page, 3–6G)
 *   3. `mini_pedigree_4up` — 1/4-Page (4-Up) Compact 3-Generation Mini Pedigree Sheets (2x2)
 *   4. `photo_cards_4x6`   — 3-Generation 4x6 Photo Cards (2-Up Letter cardstock or Direct 4x6)
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript string builder with zero browser DOM (`window`, `document`) calls
 * so identical printable HTML documents run on Web PWA, Android WebView, and React Native / Expo.
 */

import { formatCompactCarrierDisclosure } from './carrierGenetics';
import { formatGenotypeArray } from './geneticsEngine';
import {
  escapeSafeHtml,
  sanitizeSafeRasterImageDataUrl,
} from './inputSanitization';
import {
  Animal,
  BarnSettings,
  formatReadableDate,
  formatSexForSpecies,
  formatWeight,
  getSpeciesIdentifierLabels,
  isSameSpecies,
  nowIsoUtc,
  resolveSpeciesProfile,
  resolveSpeciesWeightUnit,
  SpeciesProfile,
  todayDateIso,
  WeightUnit,
} from './models';
import {
  buildPedigreeSlots,
  buildSpeciesHerdMap,
  createSpeciesCoiEvaluator,
  PedigreeSlot,
} from './pedigreeCalculator';
import { buildAnimalProfileDeepLink, renderQrSvg } from './qrCode';

export type BatchPrintLayout =
  | 'cage_cards'
  | 'stacked_pedigrees'
  | 'mini_pedigree_4up'
  | 'photo_cards_4x6';

export type PhotoCardPaperMode = 'letter_2up' | 'photo_4x6';

export interface BatchPrintLayoutSpec {
  id: BatchPrintLayout;
  label: string;
  shortLabel: string;
  description: string;
  itemsPerPage: number;
  supportsGenerations: boolean;
  supportsCutLines: boolean;
  supportsPaperMode: boolean;
  supportsBreederFooter: boolean;
  supportsQrCode: boolean;
  prefersFullResPhotos: boolean;
}

export const BATCH_PRINT_LAYOUTS: ReadonlyArray<BatchPrintLayoutSpec> = [
  {
    id: 'cage_cards',
    label: 'Cage / Kennel Cards (8-Up)',
    shortLabel: 'Cage Cards (8-Up)',
    description: '8 kennel/hutch cards per Letter page (2×4 grid) with optional scannable QR profile codes.',
    itemsPerPage: 8,
    supportsGenerations: false,
    supportsCutLines: true,
    supportsPaperMode: false,
    supportsBreederFooter: false,
    supportsQrCode: true,
    prefersFullResPhotos: false,
  },
  {
    id: 'mini_pedigree_4up',
    label: '1/4-Page Mini Pedigrees (4-Up)',
    shortLabel: '4-Up Mini Sheets',
    description: '4 compact 3-generation pedigrees per landscape sheet for auctions & sale folders.',
    itemsPerPage: 4,
    supportsGenerations: false,
    supportsCutLines: true,
    supportsPaperMode: false,
    supportsBreederFooter: true,
    supportsQrCode: false,
    prefersFullResPhotos: false,
  },
  {
    id: 'photo_cards_4x6',
    label: '3-Gen 4×6 Photo Cards',
    shortLabel: '4×6 Photo Cards',
    description: 'Portrait + 3-generation pedigree cards sized 6"×4" (2-up Letter or direct 4×6).',
    itemsPerPage: 2,
    supportsGenerations: false,
    supportsCutLines: true,
    supportsPaperMode: true,
    supportsBreederFooter: true,
    supportsQrCode: false,
    prefersFullResPhotos: true,
  },
  {
    id: 'stacked_pedigrees',
    label: 'Stacked Formal Pedigrees (1-Up)',
    shortLabel: 'Stacked Pedigrees',
    description: 'Full formal multi-generation pedigrees (3–6G), one landscape page per animal.',
    itemsPerPage: 1,
    supportsGenerations: true,
    supportsCutLines: false,
    supportsPaperMode: false,
    supportsBreederFooter: true,
    supportsQrCode: false,
    prefersFullResPhotos: true,
  },
];

export interface BatchPrintOptions {
  layout: BatchPrintLayout;
  /** Pedigree depth for `stacked_pedigrees` (compact formats always use 3 generations). */
  generations: 3 | 4 | 5 | 6;
  /** Embed animal primary photos when available. */
  includePhotos: boolean;
  /** Display animal and ancestor weights in species weight unit. */
  showWeights: boolean;
  /** Display coat color genotypes (triggers unverified / in-dev notice). */
  showGenotypes: boolean;
  /** Display breeder signature / contact footer on pedigree formats. */
  showBreederFooter: boolean;
  /** Optional breeder phone, email, or website line. */
  breederContactLine: string;
  /** Draw dashed cut / trim guides around cards on multi-up sheets. */
  includeCutLines: boolean;
  /** Embed scannable QR profile links on printed cage cards. */
  includeQrCodes: boolean;
  /** Paper layout for 4x6 photo cards: 2 cards on US Letter portrait or 1 card per 6"x4" sheet. */
  photoCardPaperMode: PhotoCardPaperMode;
}

export function getBatchPrintLayoutSpec(layout: BatchPrintLayout): BatchPrintLayoutSpec {
  return BATCH_PRINT_LAYOUTS.find((item) => item.id === layout) ?? BATCH_PRINT_LAYOUTS[0];
}

export function buildDefaultBatchPrintOptions(
  settings: BarnSettings,
  overrides?: Partial<BatchPrintOptions>
): BatchPrintOptions {
  const inheritedGen =
    settings.defaultGenerations === 4 ||
    settings.defaultGenerations === 5 ||
    settings.defaultGenerations === 6
      ? settings.defaultGenerations
      : 3;

  return {
    layout: overrides?.layout ?? 'cage_cards',
    generations: overrides?.generations ?? inheritedGen,
    includePhotos: overrides?.includePhotos ?? true,
    showWeights: overrides?.showWeights ?? true,
    showGenotypes: overrides?.showGenotypes ?? false,
    showBreederFooter: overrides?.showBreederFooter ?? true,
    breederContactLine: overrides?.breederContactLine ?? '',
    includeCutLines: overrides?.includeCutLines ?? true,
    includeQrCodes: overrides?.includeQrCodes ?? true,
    photoCardPaperMode: overrides?.photoCardPaperMode ?? 'letter_2up',
  };
}

export function computeBatchPrintPageCount(
  animalCount: number,
  options: Pick<BatchPrintOptions, 'layout' | 'photoCardPaperMode'>
): number {
  const safeCount = Math.max(0, Math.floor(animalCount));
  if (safeCount === 0) return 0;
  if (options.layout === 'cage_cards') return Math.ceil(safeCount / 8);
  if (options.layout === 'mini_pedigree_4up') return Math.ceil(safeCount / 4);
  if (options.layout === 'photo_cards_4x6') {
    return options.photoCardPaperMode === 'photo_4x6'
      ? safeCount
      : Math.ceil(safeCount / 2);
  }
  return safeCount;
}

/**
 * Resolves checked animal IDs into a deduplicated, strictly species-scoped ordered array.
 * Preserves the caller's visible/sorted list order first, then appends any additional
 * checked IDs that still belong to the active species (e.g., if a filter narrowed the view).
 */
export function resolveBatchPrintAnimals(
  checkedIds: readonly string[],
  visibleAnimals: readonly Animal[],
  allSpeciesAnimals: readonly Animal[],
  speciesName: string
): Animal[] {
  if (checkedIds.length === 0) return [];
  const checkedSet = new Set(checkedIds);
  const seen = new Set<string>();
  const ordered: Animal[] = [];

  for (const animal of visibleAnimals) {
    if (
      checkedSet.has(animal.id) &&
      !seen.has(animal.id) &&
      isSameSpecies(animal.species, speciesName)
    ) {
      seen.add(animal.id);
      ordered.push(animal);
    }
  }

  if (ordered.length < checkedSet.size) {
    const byId = new Map<string, Animal>();
    for (const animal of allSpeciesAnimals) {
      if (isSameSpecies(animal.species, speciesName)) {
        byId.set(animal.id, animal);
      }
    }
    for (const id of checkedIds) {
      if (seen.has(id)) continue;
      const found = byId.get(id);
      if (found) {
        seen.add(id);
        ordered.push(found);
      }
    }
  }

  return ordered;
}

function slugifySegment(value: string, fallback: string): string {
  const clean = (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || fallback;
}

export function buildBatchPrintFileName(
  barnName: string | undefined,
  speciesName: string,
  layout: BatchPrintLayout,
  animalCount: number,
  dateSlug?: string
): string {
  const trimmed = (barnName || '').trim();
  const isDefault = !trimmed || trimmed.toLowerCase() === 'my barn';
  const prefix = isDefault ? 'pedigree' : slugifySegment(trimmed, 'pedigree');
  const spSlug = slugifySegment(speciesName, 'species');
  const layoutSlug =
    layout === 'cage_cards'
      ? 'cage-cards'
      : layout === 'mini_pedigree_4up'
      ? 'mini-pedigrees-4up'
      : layout === 'photo_cards_4x6'
      ? 'photo-cards-4x6'
      : 'stacked-pedigrees';
  const stamp = dateSlug || todayDateIso();
  const count = Math.max(0, Math.floor(animalCount));
  return `${prefix}-${spSlug}-${layoutSlug}-${count}-${stamp}.htm`;
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const safeSize = Math.max(1, size);
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += safeSize) {
    chunks.push(items.slice(i, i + safeSize));
  }
  return chunks;
}

function escapeHtml(raw: string | undefined | null): string {
  return escapeSafeHtml(raw);
}

function resolveSafePhoto(
  animalId: string,
  includePhotos: boolean,
  photoDataUrlByAnimalId?: Readonly<Record<string, string | undefined>>
): string {
  if (!includePhotos || !photoDataUrlByAnimalId) return '';
  return sanitizeSafeRasterImageDataUrl(photoDataUrlByAnimalId[animalId]);
}

function formatWeightIfEnabled(
  weightGrams: number,
  unit: WeightUnit,
  showWeights: boolean
): string {
  if (!showWeights || !weightGrams || weightGrams <= 0) return '';
  return formatWeight(weightGrams, unit);
}

function buildCompact3GenTableHtml(params: {
  subject: Animal;
  herdById: Map<string, Animal>;
  sp: SpeciesProfile;
  weightUnit: WeightUnit;
  showWeights: boolean;
  showGenotypes: boolean;
  density: 'mini' | 'photo4x6';
}): { tableHtml: string; hasGenotypeOrRufus: boolean } {
  const { subject, herdById, sp, weightUnit, showWeights, showGenotypes, density } = params;
  const slots = buildPedigreeSlots(subject, herdById, 3, sp);
  const slotMap = new Map<string, PedigreeSlot>();
  for (const sl of slots) {
    slotMap.set(`${sl.generation}:${sl.slotIndex}`, sl);
  }

  let hasGenotypeOrRufus = Boolean(subject.rufusLevel);
  const subjectGeno = showGenotypes
    ? subject.genotypeRaw || formatGenotypeArray(subject.genotype)
    : '';
  if (showGenotypes && subjectGeno) {
    hasGenotypeOrRufus = true;
  }

  const renderCell = (gen: number, idx: number, rowspan: number): string => {
    const slot = slotMap.get(`${gen}:${idx}`);
    const a = slot?.animal;
    const roleTag = idx % 2 === 0 ? sp.maleLabel : sp.femaleLabel;
    if (!a) {
      return `<td rowspan="${rowspan}" class="ped-cell ped-empty"><span class="ped-unk">${escapeHtml(roleTag)} &mdash; Unknown</span></td>`;
    }

    const geno = showGenotypes ? a.genotypeRaw || formatGenotypeArray(a.genotype) : '';
    if (showGenotypes && geno && gen <= 2) {
      hasGenotypeOrRufus = true;
    }

    const detailBits: string[] = [];
    if (a.tattoo) detailBits.push(escapeHtml(a.tattoo));
    if (a.variety && (density === 'photo4x6' || gen <= 2)) {
      detailBits.push(escapeHtml(a.variety));
    }
    const wt = formatWeightIfEnabled(a.weightGrams, weightUnit, showWeights);
    if (wt && gen <= 2) {
      detailBits.push(escapeHtml(wt));
    }
    if (a.registrationNumber && gen <= 2) {
      detailBits.push(`Reg ${escapeHtml(a.registrationNumber)}`);
    } else if (a.grandChampionNumber && gen <= 2) {
      detailBits.push(`GC ${escapeHtml(a.grandChampionNumber)}`);
    }

    const carrierLine =
      gen <= 2
        ? formatCompactCarrierDisclosure(a, {
            herdById,
            includeCleared: false,
            ultraCompact: true,
            maxItemsPerGroup: 2,
          })
        : '';

    return `<td rowspan="${rowspan}" class="ped-cell ${idx % 2 === 0 ? 'ped-sire' : 'ped-dam'}">
      <div class="ped-name">${escapeHtml(a.name)}</div>
      ${detailBits.length > 0 ? `<div class="ped-meta">${detailBits.join(' &middot; ')}</div>` : ''}
      ${showGenotypes && gen <= 2 && geno ? `<div class="ped-geno">${escapeHtml(geno)}</div>` : ''}
      ${carrierLine ? `<div class="ped-carrier">${escapeHtml(carrierLine)}</div>` : ''}
    </td>`;
  };

  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    const cells: string[] = [];
    for (let g = 1; g <= 3; g++) {
      const span = 1 << (3 - g);
      if (r % span === 0) {
        cells.push(renderCell(g, Math.floor(r / span), span));
      }
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }

  const tableHtml = `<table class="ped-table ped-${density}">
    <thead>
      <tr>
        <th>Parents (G1)</th>
        <th>Grandparents (G2)</th>
        <th>Great-Grandparents (G3)</th>
      </tr>
    </thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;

  return { tableHtml, hasGenotypeOrRufus };
}

function buildCageCardsDocument(params: {
  subjects: Animal[];
  herdById: Map<string, Animal>;
  sp: SpeciesProfile;
  settings: BarnSettings;
  weightUnit: WeightUnit;
  options: BatchPrintOptions;
  photoDataUrlByAnimalId?: Readonly<Record<string, string | undefined>>;
  appBaseUrl?: string;
}): string {
  const {
    subjects,
    herdById,
    sp,
    settings,
    weightUnit,
    options,
    photoDataUrlByAnimalId,
    appBaseUrl,
  } = params;
  const idLabels = getSpeciesIdentifierLabels(sp.name);
  const pages = chunkArray(subjects, 8);
  const cutClass = options.includeCutLines ? 'with-cut-lines' : 'no-cut-lines';

  const pagesHtml = pages
    .map((pageAnimals, pageIdx) => {
      const cardsHtml = pageAnimals
        .map((animal) => {
          const sire = animal.sireId ? herdById.get(animal.sireId) : undefined;
          const dam = animal.damId ? herdById.get(animal.damId) : undefined;
          const safePhoto = resolveSafePhoto(
            animal.id,
            options.includePhotos,
            photoDataUrlByAnimalId
          );
          const profileUrl =
            options.includeQrCodes && appBaseUrl
              ? buildAnimalProfileDeepLink(appBaseUrl, animal)
              : '';
          const qrSvg = profileUrl
            ? renderQrSvg(profileUrl, {
                sizePx: 66,
                quietZone: 2,
                ariaLabel: `QR code to open ${animal.name || animal.tattoo || 'animal'} profile`,
                className: 'cage-qr-svg',
              })
            : '';
          const geno = options.showGenotypes
            ? animal.genotypeRaw || formatGenotypeArray(animal.genotype)
            : '';
          const carrierText = formatCompactCarrierDisclosure(animal, {
            herdById,
            includeCleared: false,
            ultraCompact: true,
            maxItemsPerGroup: 2,
          });
          const weightText = formatWeightIfEnabled(
            animal.weightGrams,
            weightUnit,
            options.showWeights
          );

          const regBits = [
            animal.registrationNumber ? `Reg: ${escapeHtml(animal.registrationNumber)}` : '',
            animal.grandChampionNumber ? `GC: ${escapeHtml(animal.grandChampionNumber)}` : '',
            animal.legsCount > 0 ? `Legs: ${animal.legsCount}` : '',
          ].filter(Boolean);

          const bottomMonoBits = [
            weightText ? `Wt: ${escapeHtml(weightText)}` : '',
            ...regBits,
            geno ? `${escapeHtml(geno)} (genetics in dev)` : '',
          ].filter(Boolean);

          return `<article class="cage-card ${cutClass}">
            <div class="cage-top">
              <span class="cage-tattoo">${escapeHtml(animal.tattoo || 'NO-ID')}</span>
              <span class="cage-loc">${escapeHtml(animal.cageLocation || settings.barnName || sp.name)}</span>
            </div>
            <div class="cage-body">
              ${
                safePhoto
                  ? `<img class="cage-photo" src="${safePhoto}" alt="${escapeHtml(animal.name)}" />`
                  : ''
              }
              <div class="cage-info">
                <div class="cage-name">${escapeHtml(animal.name)}</div>
                <div class="cage-row">
                  <span>${escapeHtml([animal.breed, animal.variety].filter(Boolean).join(' ') || sp.name)}</span>
                  <span><strong>${escapeHtml(formatSexForSpecies(animal.sex, sp))}</strong></span>
                </div>
                <div class="cage-row cage-sub">
                  <span>DOB: ${escapeHtml(formatReadableDate(animal.birthDateIso))}</span>
                  <span>${escapeHtml(idLabels.shortLabel)}: ${escapeHtml(animal.tattoo || 'Unmarked')}</span>
                </div>
                <div class="cage-parent"><strong>Sire:</strong> ${escapeHtml(sire ? `${sire.name}${sire.tattoo ? ` (${sire.tattoo})` : ''}` : 'Unknown')}</div>
                <div class="cage-parent"><strong>Dam:</strong> ${escapeHtml(dam ? `${dam.name}${dam.tattoo ? ` (${dam.tattoo})` : ''}` : 'Unknown')}</div>
              </div>
              ${
                qrSvg
                  ? `<div class="cage-qr" data-qr-url="${escapeHtml(profileUrl)}">
                      ${qrSvg}
                      <span class="cage-qr-cap">Scan</span>
                    </div>`
                  : ''
              }
            </div>
            ${
              bottomMonoBits.length > 0
                ? `<div class="cage-mono">${bottomMonoBits.join(' &middot; ')}</div>`
                : ''
            }
            ${
              carrierText
                ? `<div class="cage-carrier">${escapeHtml(carrierText)}</div>`
                : ''
            }
          </article>`;
        })
        .join('\n');

      return `<section class="batch-page cage-page" data-page="${pageIdx + 1}">
        <div class="cage-grid">
          ${cardsHtml}
        </div>
      </section>`;
    })
    .join('\n');

  const docTitle = `Batch Cage Cards (${subjects.length} ${sp.name}) - ${settings.barnName || 'Community Pedigree'}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
<title>${escapeHtml(docTitle)}</title>
<style>
  @page { size: letter portrait; margin: 0.35in; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: #000000; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 10px; }
  .batch-page { width: 7.8in; margin: 0 auto 14px auto; box-sizing: border-box; background: #ffffff; }
  .batch-page:not(:last-child) { break-after: page; page-break-after: always; }
  .cage-grid { display: grid; grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(4, 2.4in); gap: 0.14in; width: 100%; }
  .cage-card { box-sizing: border-box; border: 2px solid #000000; padding: 7px 9px; background: #ffffff; color: #000000; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .cage-card.with-cut-lines { outline: 1px dashed #777777; outline-offset: 4px; }
  .cage-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; border-bottom: 1.5px solid #000000; padding-bottom: 3px; margin-bottom: 4px; }
  .cage-tattoo { font-family: "Courier New", monospace; font-size: 16px; font-weight: bold; line-height: 1.1; }
  .cage-loc { font-family: "Courier New", monospace; font-size: 10.5px; font-weight: bold; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cage-body { display: flex; align-items: flex-start; gap: 7px; flex: 1; min-height: 0; }
  .cage-photo { width: 54px; height: 54px; object-fit: cover; border: 1px solid #444444; border-radius: 4px; flex-shrink: 0; }
  .cage-info { flex: 1; min-width: 0; }
  .cage-name { font-size: 13px; font-weight: bold; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cage-row { font-size: 9.8px; margin-top: 2px; display: flex; justify-content: space-between; gap: 6px; }
  .cage-sub { color: #333333; font-family: "Courier New", monospace; font-size: 9px; }
  .cage-parent { font-size: 9.2px; margin-top: 2px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cage-qr { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 1px; border: 1px solid #cccccc; padding: 2px; background: #ffffff; }
  .cage-qr-svg { display: block; width: 64px; height: 64px; }
  .cage-qr-cap { font-family: "Courier New", monospace; font-size: 6.5px; font-weight: bold; letter-spacing: 0.05em; text-transform: uppercase; color: #111111; }
  .cage-mono { font-family: "Courier New", monospace; font-size: 9.2px; margin-top: 4px; border-top: 1px solid #cccccc; padding-top: 3px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cage-carrier { font-size: 8.5px; font-weight: bold; color: #5c2d13; margin-top: 2px; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media print {
    body { padding: 0 !important; }
    .batch-page { margin: 0 !important; }
    :root, html, body, .batch-page, .cage-card, .cage-qr {
      color-scheme: light only !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #000000 !important;
    }
    * { -webkit-print-color-adjust: economy !important; print-color-adjust: economy !important; }
  }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}

function buildStackedPedigreesDocument(params: {
  subjects: Animal[];
  herdById: Map<string, Animal>;
  sp: SpeciesProfile;
  settings: BarnSettings;
  weightUnit: WeightUnit;
  options: BatchPrintOptions;
  photoDataUrlByAnimalId?: Readonly<Record<string, string | undefined>>;
}): string {
  const { subjects, herdById, sp, settings, weightUnit, options, photoDataUrlByAnimalId } = params;
  const generations = options.generations;
  const compactMode = generations >= 5;
  const coiEval = createSpeciesCoiEvaluator(herdById);
  const generatedLabel = formatReadableDate(nowIsoUtc().slice(0, 10));
  const contactLine = (options.breederContactLine || '').trim();

  const genHeaders: string[] = [
    '<th>Parents (Gen 1)</th>',
    '<th>Grandparents (Gen 2)</th>',
    '<th>Great-Grandparents (Gen 3)</th>',
  ];
  if (generations >= 4) genHeaders.push('<th>4th Generation (Gen 4)</th>');
  if (generations >= 5) genHeaders.push('<th>5th Generation (Gen 5)</th>');
  if (generations >= 6) genHeaders.push('<th>6th Generation (Gen 6)</th>');

  const totalRows = 1 << generations;

  const pagesHtml = subjects
    .map((subject, idx) => {
      const slots = buildPedigreeSlots(subject, herdById, generations, sp);
      const coi = coiEval.calculateAnimalCoi(subject);
      const slotMap = new Map<string, PedigreeSlot>();
      for (const sl of slots) {
        slotMap.set(`${sl.generation}:${sl.slotIndex}`, sl);
      }

      let anyAncestorGeno = false;
      const renderAncestorCell = (gen: number, slotIdx: number, rowspan: number): string => {
        const slot = slotMap.get(`${gen}:${slotIdx}`);
        const a = slot?.animal;
        const roleTag = slotIdx % 2 === 0 ? sp.maleLabel : sp.femaleLabel;
        if (!a) {
          return `<td rowspan="${rowspan}" class="cell empty">
            <div class="role">${escapeHtml(roleTag)} &mdash; Unknown</div>
          </td>`;
        }
        const geno = options.showGenotypes
          ? a.genotypeRaw || formatGenotypeArray(a.genotype)
          : '';
        if (options.showGenotypes && !compactMode && geno) {
          anyAncestorGeno = true;
        }
        const carrierText = formatCompactCarrierDisclosure(a, {
          herdById,
          includeCleared: true,
          ultraCompact: compactMode,
          maxItemsPerGroup: compactMode ? 2 : 4,
        });
        const metaParts = [
          a.tattoo ? `ID: ${escapeHtml(a.tattoo)}` : '',
          !compactMode && a.variety ? escapeHtml(a.variety) : '',
          options.showWeights && !compactMode && a.weightGrams > 0
            ? escapeHtml(formatWeight(a.weightGrams, weightUnit))
            : '',
        ].filter(Boolean);
        const regParts = [
          a.registrationNumber ? `Reg: ${escapeHtml(a.registrationNumber)}` : '',
          a.grandChampionNumber ? `GC: ${escapeHtml(a.grandChampionNumber)}` : '',
          a.legsCount > 0 ? `Legs: ${a.legsCount}` : '',
        ].filter(Boolean);

        return `<td rowspan="${rowspan}" class="cell ${slotIdx % 2 === 0 ? 'sire' : 'dam'}">
          <div class="name">${escapeHtml(a.name)}</div>
          ${metaParts.length ? `<div class="meta">${metaParts.join(' &middot; ')}</div>` : ''}
          ${!compactMode && a.birthDateIso ? `<div class="meta">DOB: ${escapeHtml(formatReadableDate(a.birthDateIso))}</div>` : ''}
          ${!compactMode && regParts.length ? `<div class="meta">${regParts.join(' &middot; ')}</div>` : ''}
          ${options.showGenotypes && !compactMode && geno ? `<div class="geno">${escapeHtml(geno)}</div>` : ''}
          ${carrierText ? `<div class="carrier">${escapeHtml(carrierText)}</div>` : ''}
        </td>`;
      };

      const rowsHtml: string[] = [];
      for (let r = 0; r < totalRows; r++) {
        const cells: string[] = [];
        for (let g = 1; g <= generations; g++) {
          const span = 1 << (generations - g);
          if (r % span === 0) {
            cells.push(renderAncestorCell(g, Math.floor(r / span), span));
          }
        }
        rowsHtml.push(`<tr>${cells.join('')}</tr>`);
      }

      const subjectGeno = options.showGenotypes
        ? subject.genotypeRaw || formatGenotypeArray(subject.genotype)
        : '';
      const subjectCarriers = formatCompactCarrierDisclosure(subject, {
        herdById,
        includeLineage: true,
        includeCleared: true,
      });
      const safePhoto = resolveSafePhoto(
        subject.id,
        options.includePhotos,
        photoDataUrlByAnimalId
      );
      const showGeneticsNotice =
        (options.showGenotypes && (Boolean(subjectGeno) || anyAncestorGeno)) ||
        Boolean(subject.rufusLevel);

      return `<section class="batch-page ped-page" data-page="${idx + 1}">
        <div class="header">
          <div>
            <div class="barn-title">${escapeHtml(settings.barnName || 'Community Pedigree')}</div>
            <div class="sub-title">Official ${generations}-Generation ${escapeHtml(subject.species)} Pedigree Certificate${settings.breederName ? ` &middot; Breeder: ${escapeHtml(settings.breederName)}` : ''}</div>
          </div>
          <div class="sub-title">Page ${idx + 1} of ${subjects.length} &middot; Generated ${escapeHtml(generatedLabel)} &middot; Wright COI: ${coi.coiPercent.toFixed(2)}% (${escapeHtml(coi.risk.label)})</div>
        </div>

        <div class="subject-wrap">
          ${safePhoto ? `<img class="subject-photo" src="${safePhoto}" alt="${escapeHtml(subject.name)}" />` : ''}
          <div class="subject-box">
            <div><strong>Name:</strong> ${escapeHtml(subject.name)}</div>
            <div><strong>Tattoo / ID:</strong> ${escapeHtml(subject.tattoo || 'Unmarked')}</div>
            <div><strong>Breed &amp; Variety:</strong> ${escapeHtml(subject.breed)} ${escapeHtml(subject.variety)}</div>
            <div><strong>Sex:</strong> ${escapeHtml(formatSexForSpecies(subject.sex, sp))}</div>
            <div><strong>DOB:</strong> ${escapeHtml(formatReadableDate(subject.birthDateIso))}</div>
            ${options.showWeights ? `<div><strong>Weight:</strong> ${escapeHtml(formatWeight(subject.weightGrams, weightUnit))}</div>` : ''}
            ${subject.registrationNumber ? `<div><strong>Reg #:</strong> ${escapeHtml(subject.registrationNumber)}</div>` : ''}
            ${subject.grandChampionNumber ? `<div><strong>GC #:</strong> ${escapeHtml(subject.grandChampionNumber)}</div>` : ''}
            ${subject.legsCount > 0 ? `<div><strong>Legs:</strong> ${subject.legsCount}</div>` : ''}
            ${subject.rufusLevel ? `<div><strong>Rufus Intensity:</strong> ${escapeHtml(subject.rufusLevel)}</div>` : ''}
            ${options.showGenotypes && subjectGeno ? `<div><strong>Genotype:</strong> <code>${escapeHtml(subjectGeno)}</code></div>` : ''}
            ${subjectCarriers ? `<div><strong>Carrier Disclosures:</strong> ${escapeHtml(subjectCarriers)}</div>` : ''}
          </div>
        </div>

        <table class="pedigree">
          <thead><tr>${genHeaders.join('')}</tr></thead>
          <tbody>${rowsHtml.join('')}</tbody>
        </table>

        ${
          showGeneticsNotice
            ? `<div class="genetics-notice"><strong>Notice:</strong> Color genetics, Rufus intensity &amp; genotype calculation is under development and incomplete (unverified).</div>`
            : ''
        }

        ${
          options.showBreederFooter
            ? `<div class="footer">
                ${contactLine ? `<div class="footer-contact">${escapeHtml(contactLine)}</div>` : ''}
                <div>I hereby certify that this pedigree is correct to the best of my knowledge and belief.</div>
                <div>Breeder Signature: ___________________________ &nbsp;&nbsp; Date: _______________</div>
              </div>`
            : ''
        }
      </section>`;
    })
    .join('\n');

  const docTitle = `Stacked Pedigrees (${subjects.length} ${sp.name}, ${generations}G) - ${settings.barnName || 'Community Pedigree'}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
<title>${escapeHtml(docTitle)}</title>
<style>
  @page { size: letter landscape; margin: ${compactMode ? '8mm' : '10mm'}; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: #1e241e; }
  body { font-family: Georgia, "Times New Roman", serif; margin: 0; padding: ${compactMode ? '8px' : '14px'}; }
  .batch-page { background: #ffffff; margin: 0 auto 20px auto; max-width: 10.2in; box-sizing: border-box; }
  .batch-page:not(:last-child) { break-after: page; page-break-after: always; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; border-bottom: 2px solid #2d5a3d; padding-bottom: 6px; margin-bottom: 8px; }
  .barn-title { font-size: 19px; font-weight: bold; color: #1e3f2a; }
  .sub-title { font-size: 11px; color: #434d42; }
  .subject-wrap { border: 1px solid #999999; padding: 8px 12px; margin-bottom: 8px; background: #ffffff; display: flex; align-items: center; gap: 14px; }
  .subject-photo { width: 76px; height: 76px; object-fit: cover; border-radius: 6px; border: 1px solid #8c8678; flex-shrink: 0; }
  .subject-box { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; flex: 1; }
  table.pedigree { width: 100%; border-collapse: collapse; table-layout: fixed; background: #ffffff; }
  table.pedigree th { background: #ffffff; color: #1e3f2a; font-size: ${compactMode ? '9.5px' : '11.5px'}; padding: ${compactMode ? '3px 4px' : '5px 6px'}; text-align: left; border: 1px solid #2d5a3d; border-bottom: 2px solid #2d5a3d; }
  td.cell { border: 1px solid #b8b3a8; padding: ${compactMode ? '2px 4px' : '5px 7px'}; vertical-align: middle; font-size: ${compactMode ? '8.5px' : '11px'}; line-height: ${compactMode ? '1.15' : '1.3'}; word-break: break-word; background: #ffffff; }
  td.sire { border-left: 3px solid #366685; }
  td.dam { border-left: 3px solid #8c3f20; }
  td.empty { color: #555555; font-style: italic; }
  .name { font-weight: bold; font-size: ${compactMode ? '9px' : '12px'}; color: #111111; }
  .meta { color: #333333; font-family: "Courier New", monospace; font-size: ${compactMode ? '8px' : '10px'}; }
  .geno { color: #1e3f2a; font-family: "Courier New", monospace; font-size: 9.5px; margin-top: 2px; }
  .carrier { color: #6e3b1b; font-family: Arial, Helvetica, sans-serif; font-size: ${compactMode ? '7.5px' : '9px'}; font-weight: 600; margin-top: 2px; line-height: 1.15; }
  .genetics-notice { margin-top: 6px; font-size: 9.5px; color: #434d42; font-family: Arial, Helvetica, sans-serif; }
  .footer { margin-top: 10px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 5px 14px; font-size: 10.5px; color: #333333; border-top: 1px solid #cccccc; padding-top: 6px; }
  .footer-contact { width: 100%; font-size: 10px; color: #1e3f2a; font-weight: bold; }
  @media print {
    body { padding: 0 !important; }
    .batch-page { margin: 0 !important; max-width: none !important; }
    :root, html, body, .batch-page, .header, .subject-wrap, table.pedigree, table.pedigree th, td.cell, .genetics-notice, .footer {
      color-scheme: light only !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #000000 !important;
    }
    * { -webkit-print-color-adjust: economy !important; print-color-adjust: economy !important; }
  }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}

function buildMiniPedigree4UpDocument(params: {
  subjects: Animal[];
  herdById: Map<string, Animal>;
  sp: SpeciesProfile;
  settings: BarnSettings;
  weightUnit: WeightUnit;
  options: BatchPrintOptions;
  photoDataUrlByAnimalId?: Readonly<Record<string, string | undefined>>;
}): string {
  const { subjects, herdById, sp, settings, weightUnit, options, photoDataUrlByAnimalId } = params;
  const coiEval = createSpeciesCoiEvaluator(herdById);
  const pages = chunkArray(subjects, 4);
  const cutClass = options.includeCutLines ? 'with-cut-lines' : 'no-cut-lines';
  const contactLine = (options.breederContactLine || '').trim();
  const barnTitle = settings.barnName || 'Community Pedigree';

  const pagesHtml = pages
    .map((pageAnimals, pageIdx) => {
      const cardsHtml = pageAnimals
        .map((subject) => {
          const coi = coiEval.calculateAnimalCoi(subject);
          const safePhoto = resolveSafePhoto(
            subject.id,
            options.includePhotos,
            photoDataUrlByAnimalId
          );
          const { tableHtml, hasGenotypeOrRufus } = buildCompact3GenTableHtml({
            subject,
            herdById,
            sp,
            weightUnit,
            showWeights: options.showWeights,
            showGenotypes: options.showGenotypes,
            density: 'mini',
          });
          const weightText = formatWeightIfEnabled(
            subject.weightGrams,
            weightUnit,
            options.showWeights
          );
          const facts = [
            subject.tattoo ? `ID: ${escapeHtml(subject.tattoo)}` : 'Unmarked',
            escapeHtml(formatSexForSpecies(subject.sex, sp)),
            escapeHtml([subject.breed, subject.variety].filter(Boolean).join(' ') || sp.name),
            subject.birthDateIso ? `DOB ${escapeHtml(formatReadableDate(subject.birthDateIso))}` : '',
            weightText ? escapeHtml(weightText) : '',
            subject.registrationNumber ? `Reg ${escapeHtml(subject.registrationNumber)}` : '',
            subject.grandChampionNumber ? `GC ${escapeHtml(subject.grandChampionNumber)}` : '',
            subject.legsCount > 0 ? `${subject.legsCount} Leg${subject.legsCount === 1 ? '' : 's'}` : '',
          ].filter(Boolean);

          const subjectGeno = options.showGenotypes
            ? subject.genotypeRaw || formatGenotypeArray(subject.genotype)
            : '';

          return `<article class="mini-card ${cutClass}">
            <div class="mini-head">
              <div class="mini-head-left">
                <span class="mini-barn">${escapeHtml(barnTitle)}</span>
                <span class="mini-kicker">&middot; 3G Mini Pedigree</span>
              </div>
              <span class="mini-coi">COI ${coi.coiPercent.toFixed(1)}%</span>
            </div>

            <div class="mini-subject">
              ${safePhoto ? `<img class="mini-photo" src="${safePhoto}" alt="${escapeHtml(subject.name)}" />` : ''}
              <div class="mini-subject-text">
                <div class="mini-name">${escapeHtml(subject.name)}</div>
                <div class="mini-facts">${facts.join(' &middot; ')}</div>
                ${options.showGenotypes && subjectGeno ? `<div class="mini-geno">Geno: ${escapeHtml(subjectGeno)}</div>` : ''}
              </div>
            </div>

            <div class="mini-table-wrap">
              ${tableHtml}
            </div>

            <div class="mini-foot">
              <span>${
                options.showBreederFooter
                  ? escapeHtml(contactLine || settings.breederName || barnTitle)
                  : ''
              }</span>
              <span>${
                hasGenotypeOrRufus
                  ? 'Genetics in dev (unverified)'
                  : escapeHtml(formatReadableDate(nowIsoUtc().slice(0, 10)))
              }</span>
            </div>
          </article>`;
        })
        .join('\n');

      return `<section class="batch-page mini-page" data-page="${pageIdx + 1}">
        <div class="mini-grid">
          ${cardsHtml}
        </div>
      </section>`;
    })
    .join('\n');

  const docTitle = `4-Up Mini Pedigrees (${subjects.length} ${sp.name}) - ${barnTitle}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
<title>${escapeHtml(docTitle)}</title>
<style>
  @page { size: letter landscape; margin: 0.25in; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: #111111; }
  body { font-family: Georgia, "Times New Roman", serif; margin: 0; padding: 8px; }
  .batch-page { width: 10.5in; margin: 0 auto 14px auto; box-sizing: border-box; background: #ffffff; }
  .batch-page:not(:last-child) { break-after: page; page-break-after: always; }
  .mini-grid { display: grid; grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, 3.84in); gap: 0.16in; width: 100%; }
  .mini-card { box-sizing: border-box; border: 1.5px solid #2d5a3d; padding: 6px 7px; background: #ffffff; display: flex; flex-direction: column; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .mini-card.with-cut-lines { outline: 1px dashed #888888; outline-offset: 4px; }
  .mini-head { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; border-bottom: 1.5px solid #2d5a3d; padding-bottom: 2px; margin-bottom: 4px; }
  .mini-head-left { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mini-barn { font-size: 10px; font-weight: bold; color: #1e3f2a; }
  .mini-kicker { font-size: 8px; color: #434d42; font-family: Arial, Helvetica, sans-serif; }
  .mini-coi { font-family: "Courier New", monospace; font-size: 8.5px; font-weight: bold; flex-shrink: 0; }
  .mini-subject { display: flex; align-items: center; gap: 7px; margin-bottom: 4px; padding: 3px 5px; border: 1px solid #bbbbbb; background: #ffffff; }
  .mini-photo { width: 38px; height: 38px; object-fit: cover; border-radius: 3px; border: 1px solid #777777; flex-shrink: 0; }
  .mini-subject-text { min-width: 0; flex: 1; }
  .mini-name { font-size: 11px; font-weight: bold; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mini-facts { font-family: Arial, Helvetica, sans-serif; font-size: 8px; color: #333333; line-height: 1.2; margin-top: 1px; }
  .mini-geno { font-family: "Courier New", monospace; font-size: 7.5px; color: #1e3f2a; margin-top: 1px; }
  .mini-table-wrap { flex: 1; min-height: 0; overflow: hidden; }
  table.ped-table { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; background: #ffffff; }
  table.ped-table th { font-size: 7.5px; padding: 2px 4px; text-align: left; border: 1px solid #2d5a3d; color: #1e3f2a; font-family: Arial, Helvetica, sans-serif; background: #ffffff; }
  td.ped-cell { border: 1px solid #c2bdb2; padding: 1.5px 3.5px; vertical-align: middle; line-height: 1.12; word-break: break-word; overflow: hidden; background: #ffffff; }
  td.ped-sire { border-left: 2.5px solid #366685; }
  td.ped-dam { border-left: 2.5px solid #8c3f20; }
  td.ped-empty { color: #666666; font-style: italic; }
  .ped-unk { font-size: 7px; }
  .ped-name { font-weight: bold; font-size: 8px; color: #111111; }
  .ped-meta { font-family: "Courier New", monospace; font-size: 7px; color: #333333; }
  .ped-geno { font-family: "Courier New", monospace; font-size: 6.8px; color: #1e3f2a; }
  .ped-carrier { font-family: Arial, Helvetica, sans-serif; font-size: 6.5px; color: #6e3b1b; font-weight: bold; }
  .mini-foot { display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-top: 3px; padding-top: 2px; border-top: 1px solid #cccccc; font-family: Arial, Helvetica, sans-serif; font-size: 7.5px; color: #444444; }
  @media print {
    body { padding: 0 !important; }
    .batch-page { margin: 0 !important; }
    :root, html, body, .batch-page, .mini-card, .mini-subject, table.ped-table, table.ped-table th, td.ped-cell {
      color-scheme: light only !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #000000 !important;
    }
    * { -webkit-print-color-adjust: economy !important; print-color-adjust: economy !important; }
  }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}

function buildPhotoCards4x6Document(params: {
  subjects: Animal[];
  herdById: Map<string, Animal>;
  sp: SpeciesProfile;
  settings: BarnSettings;
  weightUnit: WeightUnit;
  options: BatchPrintOptions;
  photoDataUrlByAnimalId?: Readonly<Record<string, string | undefined>>;
}): string {
  const { subjects, herdById, sp, settings, weightUnit, options, photoDataUrlByAnimalId } = params;
  const coiEval = createSpeciesCoiEvaluator(herdById);
  const isDirect4x6 = options.photoCardPaperMode === 'photo_4x6';
  const pages = chunkArray(subjects, isDirect4x6 ? 1 : 2);
  const cutClass = !isDirect4x6 && options.includeCutLines ? 'with-cut-lines' : 'no-cut-lines';
  const contactLine = (options.breederContactLine || '').trim();
  const barnTitle = settings.barnName || 'Community Pedigree';

  const pagesHtml = pages
    .map((pageAnimals, pageIdx) => {
      const cardsHtml = pageAnimals
        .map((subject) => {
          const coi = coiEval.calculateAnimalCoi(subject);
          const safePhoto = resolveSafePhoto(
            subject.id,
            options.includePhotos,
            photoDataUrlByAnimalId
          );
          const { tableHtml, hasGenotypeOrRufus } = buildCompact3GenTableHtml({
            subject,
            herdById,
            sp,
            weightUnit,
            showWeights: options.showWeights,
            showGenotypes: options.showGenotypes,
            density: 'photo4x6',
          });

          const weightText = formatWeightIfEnabled(
            subject.weightGrams,
            weightUnit,
            options.showWeights
          );
          const subjectGeno = options.showGenotypes
            ? subject.genotypeRaw || formatGenotypeArray(subject.genotype)
            : '';
          const carrierText = formatCompactCarrierDisclosure(subject, {
            herdById,
            includeLineage: false,
            includeCleared: true,
            ultraCompact: true,
            maxItemsPerGroup: 3,
          });
          const initialChar = (subject.name || sp.name || '?').trim().charAt(0).toUpperCase() || '?';

          const photoSlotHtml = options.includePhotos
            ? safePhoto
              ? `<img class="photo4x6-img" src="${safePhoto}" alt="${escapeHtml(subject.name)}" />`
              : `<div class="photo4x6-placeholder" aria-label="No primary photo">
                  <span class="photo4x6-monogram">${escapeHtml(initialChar)}</span>
                  <span class="photo4x6-ph-label">No Photo</span>
                </div>`
            : '';

          return `<article class="photo4x6-card ${cutClass}">
            <div class="photo4x6-top">
              ${photoSlotHtml}
              <div class="photo4x6-summary">
                <div class="photo4x6-kicker-row">
                  <span class="photo4x6-barn">${escapeHtml(barnTitle)} &middot; ${escapeHtml(sp.name)} 3-Gen Card</span>
                  <span class="photo4x6-coi">COI ${coi.coiPercent.toFixed(2)}%</span>
                </div>
                <div class="photo4x6-title-row">
                  <span class="photo4x6-name">${escapeHtml(subject.name)}</span>
                  <span class="photo4x6-tattoo">${escapeHtml(subject.tattoo || 'UNMARKED')}</span>
                </div>
                <div class="photo4x6-grid">
                  <div><strong>Breed/Var:</strong> ${escapeHtml([subject.breed, subject.variety].filter(Boolean).join(' ') || '—')}</div>
                  <div><strong>Sex:</strong> ${escapeHtml(formatSexForSpecies(subject.sex, sp))}</div>
                  <div><strong>DOB:</strong> ${escapeHtml(formatReadableDate(subject.birthDateIso))}</div>
                  ${weightText ? `<div><strong>Weight:</strong> ${escapeHtml(weightText)}</div>` : ''}
                  ${subject.cageLocation ? `<div><strong>Cage/Pen:</strong> ${escapeHtml(subject.cageLocation)}</div>` : ''}
                  ${subject.registrationNumber ? `<div><strong>Reg #:</strong> ${escapeHtml(subject.registrationNumber)}</div>` : ''}
                  ${subject.grandChampionNumber ? `<div><strong>GC #:</strong> ${escapeHtml(subject.grandChampionNumber)}</div>` : ''}
                  ${subject.legsCount > 0 ? `<div><strong>Show Legs:</strong> ${subject.legsCount}</div>` : ''}
                </div>
                ${options.showGenotypes && subjectGeno ? `<div class="photo4x6-geno"><strong>Genotype:</strong> ${escapeHtml(subjectGeno)}</div>` : ''}
                ${carrierText ? `<div class="photo4x6-carrier">${escapeHtml(carrierText)}</div>` : ''}
              </div>
            </div>

            <div class="photo4x6-ped">
              ${tableHtml}
            </div>

            <div class="photo4x6-foot">
              <span>${
                options.showBreederFooter
                  ? escapeHtml(
                      contactLine ||
                        (settings.breederName ? `Breeder: ${settings.breederName}` : barnTitle)
                    )
                  : ''
              }</span>
              <span>${
                hasGenotypeOrRufus
                  ? 'Color genetics under dev (unverified)'
                  : `4×6 Pedigree Card · ${escapeHtml(formatReadableDate(nowIsoUtc().slice(0, 10)))}`
              }</span>
            </div>
          </article>`;
        })
        .join('\n');

      return `<section class="batch-page photo4x6-page" data-page="${pageIdx + 1}">
        <div class="photo4x6-stack">
          ${cardsHtml}
        </div>
      </section>`;
    })
    .join('\n');

  const docTitle = `4x6 Photo Pedigree Cards (${subjects.length} ${sp.name}) - ${barnTitle}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
<title>${escapeHtml(docTitle)}</title>
<style>
  @page { size: ${isDirect4x6 ? '6in 4in' : 'letter portrait'}; margin: ${isDirect4x6 ? '0.12in' : '0.35in'}; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: #111111; }
  body { font-family: Georgia, "Times New Roman", serif; margin: 0; padding: ${isDirect4x6 ? '4px' : '10px'}; }
  .batch-page { width: ${isDirect4x6 ? '5.76in' : '7.8in'}; margin: 0 auto 14px auto; box-sizing: border-box; background: #ffffff; }
  .batch-page:not(:last-child) { break-after: page; page-break-after: always; }
  .photo4x6-stack { display: flex; flex-direction: column; align-items: center; gap: ${isDirect4x6 ? '0' : '0.36in'}; }
  .photo4x6-card { box-sizing: border-box; width: ${isDirect4x6 ? '5.76in' : '6in'}; height: ${isDirect4x6 ? '3.76in' : '4in'}; border: 1.5px solid #2d5a3d; padding: 8px 10px; background: #ffffff; display: flex; flex-direction: column; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .photo4x6-card.with-cut-lines { outline: 1px dashed #888888; outline-offset: 6px; }
  .photo4x6-top { display: flex; align-items: stretch; gap: 10px; border-bottom: 1.5px solid #2d5a3d; padding-bottom: 6px; margin-bottom: 6px; }
  .photo4x6-img { width: 1.22in; height: 1.22in; object-fit: cover; border-radius: 5px; border: 1px solid #777777; flex-shrink: 0; }
  .photo4x6-placeholder { width: 1.22in; height: 1.22in; border-radius: 5px; border: 1px dashed #888888; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #ffffff; color: #555555; }
  .photo4x6-monogram { font-size: 28px; font-weight: bold; line-height: 1; }
  .photo4x6-ph-label { font-family: Arial, Helvetica, sans-serif; font-size: 8px; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.05em; }
  .photo4x6-summary { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; }
  .photo4x6-kicker-row { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; font-family: Arial, Helvetica, sans-serif; font-size: 8.5px; color: #434d42; }
  .photo4x6-barn { font-weight: bold; color: #1e3f2a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .photo4x6-coi { font-family: "Courier New", monospace; font-weight: bold; flex-shrink: 0; }
  .photo4x6-title-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-top: 2px; }
  .photo4x6-name { font-size: 14.5px; font-weight: bold; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .photo4x6-tattoo { font-family: "Courier New", monospace; font-size: 12px; font-weight: bold; flex-shrink: 0; }
  .photo4x6-grid { display: flex; flex-wrap: wrap; gap: 2px 10px; font-family: Arial, Helvetica, sans-serif; font-size: 8.8px; color: #222222; margin-top: 3px; line-height: 1.25; }
  .photo4x6-geno { font-family: "Courier New", monospace; font-size: 8.2px; color: #1e3f2a; margin-top: 2px; }
  .photo4x6-carrier { font-family: Arial, Helvetica, sans-serif; font-size: 8px; font-weight: bold; color: #6e3b1b; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .photo4x6-ped { flex: 1; min-height: 0; overflow: hidden; }
  table.ped-table { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; background: #ffffff; }
  table.ped-table th { font-size: 8px; padding: 2px 4px; text-align: left; border: 1px solid #2d5a3d; color: #1e3f2a; font-family: Arial, Helvetica, sans-serif; background: #ffffff; }
  td.ped-cell { border: 1px solid #c2bdb2; padding: 1.5px 4px; vertical-align: middle; line-height: 1.12; word-break: break-word; overflow: hidden; background: #ffffff; }
  td.ped-sire { border-left: 2.5px solid #366685; }
  td.ped-dam { border-left: 2.5px solid #8c3f20; }
  td.ped-empty { color: #666666; font-style: italic; }
  .ped-unk { font-size: 7.5px; }
  .ped-name { font-weight: bold; font-size: 8.5px; color: #111111; }
  .ped-meta { font-family: "Courier New", monospace; font-size: 7.2px; color: #333333; }
  .ped-geno { font-family: "Courier New", monospace; font-size: 7px; color: #1e3f2a; }
  .ped-carrier { font-family: Arial, Helvetica, sans-serif; font-size: 6.8px; color: #6e3b1b; font-weight: bold; }
  .photo4x6-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 4px; padding-top: 3px; border-top: 1px solid #cccccc; font-family: Arial, Helvetica, sans-serif; font-size: 8px; color: #444444; }
  @media print {
    body { padding: 0 !important; }
    .batch-page { margin: 0 auto !important; }
    :root, html, body, .batch-page, .photo4x6-card, .photo4x6-placeholder, table.ped-table, table.ped-table th, td.ped-cell {
      color-scheme: light only !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #000000 !important;
    }
    * { -webkit-print-color-adjust: economy !important; print-color-adjust: economy !important; }
  }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}

/**
 * Generates a single self-contained printable `.HTM` document for a multi-selected batch
 * of animals within one species using the requested layout and print options.
 */
export function generateBatchPrintHtml(params: {
  subjects: readonly Animal[];
  allAnimals: Animal[];
  speciesProfiles: SpeciesProfile[];
  settings: BarnSettings;
  speciesName: string;
  options?: Partial<BatchPrintOptions>;
  photoDataUrlByAnimalId?: Readonly<Record<string, string | undefined>>;
  appBaseUrl?: string;
}): string {
  const {
    subjects,
    allAnimals,
    speciesProfiles,
    settings,
    speciesName,
    photoDataUrlByAnimalId,
    appBaseUrl,
  } = params;
  const resolvedOptions = buildDefaultBatchPrintOptions(settings, params.options);
  const sp = resolveSpeciesProfile(speciesName, speciesProfiles);
  const weightUnit = resolveSpeciesWeightUnit(sp, settings, speciesProfiles);
  const herdById = buildSpeciesHerdMap(allAnimals, sp.name);

  // Deduplicate & strictly enforce active species isolation
  const seen = new Set<string>();
  const scopedSubjects: Animal[] = [];
  for (const animal of subjects) {
    if (!animal || !animal.id || seen.has(animal.id)) continue;
    if (!isSameSpecies(animal.species, sp.name)) continue;
    seen.add(animal.id);
    scopedSubjects.push(animal);
    if (!herdById.has(animal.id)) {
      herdById.set(animal.id, animal);
    }
  }

  if (scopedSubjects.length === 0) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
<title>Batch Print - No Animals Selected</title>
<style>
  :root, html, body { color-scheme: light only; background: #ffffff; color: #111111; font-family: Arial, Helvetica, sans-serif; padding: 24px; }
</style>
</head>
<body>
  <p>No ${escapeHtml(sp.name)} animals are selected for batch printing.</p>
</body>
</html>`;
  }

  const shared = {
    subjects: scopedSubjects,
    herdById,
    sp,
    settings,
    weightUnit,
    options: resolvedOptions,
    photoDataUrlByAnimalId,
    appBaseUrl,
  };

  switch (resolvedOptions.layout) {
    case 'cage_cards':
      return buildCageCardsDocument(shared);
    case 'stacked_pedigrees':
      return buildStackedPedigreesDocument(shared);
    case 'mini_pedigree_4up':
      return buildMiniPedigree4UpDocument(shared);
    case 'photo_cards_4x6':
      return buildPhotoCards4x6Document(shared);
  }
}
```

## `src/core/calendarExport.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * RFC 5545 iCalendar (`.ics`) Task & Breeding Milestone Export Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM dependencies.
 * Generates standards-compliant `.ics` files with optional `VALARM` notifications,
 * configurable animal name / prefix / ear-number formatting, appended species tags,
 * and direct deep links back into the app's task entry.
 */

import { sha256HexPure } from './backupVault';
import {
  addDaysIso,
  Animal,
  BarnTask,
  BreedingRecord,
  CalendarSyncSettings,
  isSameSpecies,
  normalizeCalendarSyncSettings,
  nowIsoUtc,
  SpeciesProfile,
  stripAnimalNamePrefix,
} from './models';

export const CALENDAR_ALARM_LEAD_OPTIONS: Array<{ minutes: number; label: string }> = [
  { minutes: 0, label: 'At scheduled task time' },
  { minutes: 15, label: '15 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 120, label: '2 hours before' },
  { minutes: 1440, label: '1 day before' },
  { minutes: 2880, label: '2 days before' },
];

export interface CalendarExportContext {
  animals?: Animal[];
  breedings?: BreedingRecord[];
  speciesProfiles?: SpeciesProfile[];
  appBaseUrl?: string;
}

function escapeIcsText(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'barn-task'
  );
}

/**
 * Formats an RFC 5545 `VALARM` `TRIGGER` duration for `minutesBefore` >= 0.
 */
export function formatIcsAlarmTrigger(minutesBefore: number): string {
  const safeMinutes = Math.max(0, Math.round(Number(minutesBefore) || 0));
  if (safeMinutes === 0) return 'PT0S';
  if (safeMinutes % 1440 === 0) {
    return `-P${safeMinutes / 1440}D`;
  }
  if (safeMinutes % 60 === 0) {
    return `-PT${safeMinutes / 60}H`;
  }
  return `-PT${safeMinutes}M`;
}

function formatLocalFloatingDateTime(
  dateIso: string,
  hour: number,
  minute: number
): string {
  const compact = dateIso.replace(/-/g, '');
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${compact}T${hh}${mm}00`;
}

function formatUtcStamp(isoUtc: string): string {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) {
    return '20260101T000000Z';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/**
 * Builds a deep link URL pointing directly to the task entry inside the app's Species Dashboard.
 */
export function buildTaskAppDeepLink(
  appBaseUrl: string | undefined,
  task: Pick<BarnTask, 'id' | 'species'>
): string {
  const cleanBase = (appBaseUrl || '').trim().split(/[?#]/)[0];
  if (!cleanBase) return '';
  return `${cleanBase}?route=dashboard&species=${encodeURIComponent(
    task.species
  )}&taskId=${encodeURIComponent(task.id)}`;
}

function resolveAnimalDisplayToken(
  rawName: string,
  animal: Animal | undefined,
  config: CalendarSyncSettings,
  prefix: string
): string {
  const cleanName = (rawName || animal?.name || '').trim();
  const ear = (animal?.tattoo || '').trim();
  if (!config.includeAnimalName) {
    if (ear) return ear;
    return config.includeAnimalPrefix
      ? cleanName
      : stripAnimalNamePrefix(cleanName, prefix);
  }
  if (!config.includeAnimalPrefix) {
    return stripAnimalNamePrefix(cleanName, prefix);
  }
  return cleanName;
}

interface FormattedTaskTitleResult {
  title: string;
  matchedAnyInTitle: boolean;
  dam: Animal | undefined;
  prefix: string;
  config: CalendarSyncSettings;
}

function formatTaskTitleCore(
  task: BarnTask,
  rawConfig?: Partial<CalendarSyncSettings>,
  context?: CalendarExportContext
): FormattedTaskTitleResult {
  const config = normalizeCalendarSyncSettings(rawConfig);
  const speciesProfile = context?.speciesProfiles?.find((sp) =>
    isSameSpecies(sp.name, task.species)
  );
  const prefix = (speciesProfile?.defaultAnimalPrefix || '').trim();

  const animalById = new Map<string, Animal>();
  for (const a of context?.animals || []) {
    animalById.set(a.id, a);
  }

  const breeding = task.linkedBreedingId
    ? context?.breedings?.find((b) => b.id === task.linkedBreedingId)
    : undefined;

  const dam =
    (breeding?.damId ? animalById.get(breeding.damId) : undefined) ||
    (task.linkedAnimalId ? animalById.get(task.linkedAnimalId) : undefined);
  const sire = breeding?.sireId ? animalById.get(breeding.sireId) : undefined;

  const replacementMap = new Map<string, string>();
  const registerReplacement = (rawName: string, animal: Animal | undefined) => {
    const key = (rawName || '').trim();
    if (!key) return;
    const token = resolveAnimalDisplayToken(key, animal, config, prefix);
    if (token) {
      replacementMap.set(key.toLowerCase(), token);
    }
  };

  if (dam) {
    registerReplacement(dam.name, dam);
  }
  if (breeding?.damName) {
    registerReplacement(breeding.damName, dam);
  }
  if (task.linkedAnimalName) {
    registerReplacement(task.linkedAnimalName, dam);
  }
  if (sire) {
    registerReplacement(sire.name, sire);
  }
  if (breeding?.sireName) {
    registerReplacement(breeding.sireName, sire);
  }

  let formattedTitle = (task.title || '').trim();
  const rawNames = new Set<string>();
  for (const candidate of [
    dam?.name,
    breeding?.damName,
    task.linkedAnimalName,
    sire?.name,
    breeding?.sireName,
  ]) {
    const clean = (candidate || '').trim();
    if (clean) rawNames.add(clean);
  }

  let matchedAnyInTitle = false;
  if (rawNames.size > 0 && formattedTitle) {
    const sortedNames = Array.from(rawNames).sort((a, b) => b.length - a.length);
    const pattern = new RegExp(
      sortedNames.map((n) => escapeRegExp(n)).join('|'),
      'gi'
    );
    formattedTitle = formattedTitle.replace(pattern, (match) => {
      matchedAnyInTitle = true;
      return replacementMap.get(match.toLowerCase()) || match;
    });
  }

  return {
    title: formattedTitle,
    matchedAnyInTitle,
    dam,
    prefix,
    config,
  };
}

/**
 * Formats an in-app `BarnTask.title` according to user preferences across the system:
 * - Optionally excludes the animal's name prefix (`includeAnimalPrefix: false`)
 * - Optionally excludes the animal's name entirely and uses its ear number/tattoo (`includeAnimalName: false`)
 * Note: Canonical stored `BarnTask.title` values stay intact so toggling preferences updates
 * existing and future tasks non-destructively.
 */
export function formatSystemTaskTitle(
  task: BarnTask,
  rawConfig?: Partial<CalendarSyncSettings>,
  context?: CalendarExportContext
): string {
  return formatTaskTitleCore(task, rawConfig, context).title;
}

/**
 * Formats an external calendar task summary according to user preferences:
 * - Optionally excludes the animal's name prefix (`includeAnimalPrefix: false`)
 * - Optionally excludes the animal's name entirely and uses its ear number/tattoo (`includeAnimalName: false`)
 * - Always appends `[Species]` at the end of the external calendar task title
 */
export function formatExternalCalendarTaskSummary(
  task: BarnTask,
  rawConfig?: Partial<CalendarSyncSettings>,
  context?: CalendarExportContext
): string {
  const {
    title,
    matchedAnyInTitle,
    dam,
    prefix,
    config,
  } = formatTaskTitleCore(task, rawConfig, context);

  let formattedTitle = title;

  // If a manual chore is linked to an animal whose name wasn't typed in the chore title,
  // append the configured animal identifier (name, unprefixed name, or ear number).
  if (!matchedAnyInTitle && (dam || task.linkedAnimalName)) {
    const fallbackRaw = dam?.name || task.linkedAnimalName || '';
    const refToken = resolveAnimalDisplayToken(fallbackRaw, dam, config, prefix);
    if (refToken && !formattedTitle.toLowerCase().includes(refToken.toLowerCase())) {
      formattedTitle = formattedTitle ? `${formattedTitle} — ${refToken}` : refToken;
    }
  }

  const speciesLower = (task.species || '').trim().toLowerCase();
  if (speciesLower) {
    const endsWithBracketSpecies = formattedTitle
      .toLowerCase()
      .endsWith(`[${speciesLower}]`);
    const endsWithParenSpecies = formattedTitle
      .toLowerCase()
      .endsWith(`(${speciesLower})`);
    if (!endsWithBracketSpecies && !endsWithParenSpecies) {
      formattedTitle = formattedTitle
        ? `${formattedTitle} [${task.species}]`
        : `[${task.species}]`;
    }
  }

  return formattedTitle;
}

export interface GeneratedCalendarIcs {
  icsContent: string;
  eventCount: number;
  filename: string;
}

/**
 * Builds an RFC 5545 `.ics` calendar payload containing one `VEVENT` per dated `BarnTask`
 * plus optional `VALARM` display notification/alarm triggers and deep links back into the app.
 * Returns `null` if none of the provided tasks have a valid `YYYY-MM-DD` `dueDateIso`.
 */
export function buildIcsCalendarForTasks(
  tasks: BarnTask[],
  rawConfig?: Partial<CalendarSyncSettings>,
  barnName: string = 'Community Pedigree',
  filenameHint?: string,
  context?: CalendarExportContext
): GeneratedCalendarIcs | null {
  const datedTasks = tasks.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.dueDateIso || ''));
  if (datedTasks.length === 0) return null;

  const config = normalizeCalendarSyncSettings(rawConfig);
  const [hourStr, minStr] = config.reminderTimeLocal.split(':');
  const startHour = Number(hourStr);
  const startMin = Number(minStr);
  const durationMinutes = 30;

  const totalEndMins = startHour * 60 + startMin + durationMinutes;
  const endDayRollover = Math.floor(totalEndMins / 1440);
  const endHour = Math.floor((totalEndMins % 1440) / 60);
  const endMin = totalEndMins % 60;

  const dtStamp = formatUtcStamp(nowIsoUtc());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Community Pedigree Project//Pedigree//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(`${barnName || 'Community Pedigree'} Barn Chores`)}`,
  ];

  const animalById = new Map<string, Animal>();
  for (const a of context?.animals || []) {
    animalById.set(a.id, a);
  }

  for (const task of datedTasks) {
    const dtStart = formatLocalFloatingDateTime(task.dueDateIso, startHour, startMin);
    const endDateIso =
      endDayRollover > 0 ? addDaysIso(task.dueDateIso, endDayRollover) : task.dueDateIso;
    const dtEnd = formatLocalFloatingDateTime(endDateIso, endHour, endMin);

    const summaryText = formatExternalCalendarTaskSummary(task, config, context);
    const speciesProfile = context?.speciesProfiles?.find((sp) =>
      isSameSpecies(sp.name, task.species)
    );
    const prefix = (speciesProfile?.defaultAnimalPrefix || '').trim();
    const linkedAnimal = task.linkedAnimalId ? animalById.get(task.linkedAnimalId) : undefined;
    const animalLine = (() => {
      if (!linkedAnimal && !task.linkedAnimalName) return '';
      const resolved = resolveAnimalDisplayToken(
        task.linkedAnimalName || linkedAnimal?.name || '',
        linkedAnimal,
        config,
        prefix
      );
      if (!config.includeAnimalName && linkedAnimal?.tattoo?.trim()) {
        return `Animal Ear #: ${resolved}`;
      }
      return resolved ? `Animal: ${resolved}` : '';
    })();

    const taskDeepLink = buildTaskAppDeepLink(context?.appBaseUrl, task);

    const descParts = [
      barnName ? `Barn: ${barnName}` : '',
      `Species: ${task.species}`,
      `Category: ${task.category}`,
      `Priority: ${task.priority}`,
      animalLine,
      task.linkedBreedingId ? 'Source: Breeding milestone cascade' : 'Source: Manual barn chore',
      taskDeepLink ? `Open Task in App: ${taskDeepLink}` : '',
    ].filter(Boolean);

    const icsPriority = task.priority === 'High' ? 1 : task.priority === 'Low' ? 9 : 5;

    lines.push(
      'BEGIN:VEVENT',
      `UID:barn-task-${task.id}@community-pedigree.local`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${escapeIcsText(summaryText)}`,
      `DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`,
      ...(taskDeepLink ? [`URL;VALUE=URI:${taskDeepLink}`] : []),
      `CATEGORIES:${escapeIcsText(task.species)},${escapeIcsText(task.category)}`,
      `PRIORITY:${icsPriority}`,
      `STATUS:${task.completed ? 'COMPLETED' : 'CONFIRMED'}`
    );

    if (config.alarmEnabled) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeIcsText(`Barn Reminder: ${summaryText}`)}`,
        `TRIGGER:${formatIcsAlarmTrigger(config.alarmMinutesBefore)}`,
        'END:VALARM'
      );
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  const stamp = nowIsoUtc().slice(0, 10);
  const filename =
    datedTasks.length === 1
      ? `${formatSlug(
          filenameHint || formatSystemTaskTitle(datedTasks[0], config, context)
        )}-${datedTasks[0].dueDateIso}.ics`
      : `${formatSlug(filenameHint || `${datedTasks[0].species}-barn-tasks`)}-${stamp}.ics`;

  return {
    icsContent: `${lines.join('\r\n')}\r\n`,
    eventCount: datedTasks.length,
    filename,
  };
}

export interface GoogleCalendarEventPayload {
  /** Deterministic Google Calendar base32hex event ID (`[a-v0-9]`, 5–1024 chars) to deduplicate retries/updates. */
  id?: string;
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  reminders: {
    useDefault: boolean;
    overrides?: Array<{ method: 'popup'; minutes: number }>;
  };
  source?: { title: string; url: string };
}

/**
 * Generates a deterministic Google Calendar API v3 compatible event `id` strictly using
 * lowercase base32hex characters (`[a-v0-9]`, 36 chars long) derived from `task.id`.
 */
export function buildDeterministicGoogleCalendarEventId(taskId: string): string {
  const hashHex = sha256HexPure(`community-pedigree-task:${String(taskId || '').trim()}`);
  return `cped${hashHex.slice(0, 32).toLowerCase()}`;
}

function buildTaskCalendarMetadata(
  task: BarnTask,
  config: CalendarSyncSettings,
  barnName: string,
  context?: CalendarExportContext
): {
  summaryText: string;
  descriptionText: string;
  taskDeepLink: string;
  startDateIso: string;
  startTimeHm: string;
  endDateIso: string;
  endTimeHm: string;
} {
  const [hourStr, minStr] = config.reminderTimeLocal.split(':');
  const startHour = Number(hourStr);
  const startMin = Number(minStr);
  const totalEndMins = startHour * 60 + startMin + 30;
  const endDayRollover = Math.floor(totalEndMins / 1440);
  const endHour = Math.floor((totalEndMins % 1440) / 60);
  const endMin = totalEndMins % 60;

  const endDateIso =
    endDayRollover > 0 ? addDaysIso(task.dueDateIso, endDayRollover) : task.dueDateIso;
  const startTimeHm = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;
  const endTimeHm = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;

  const summaryText = formatExternalCalendarTaskSummary(task, config, context);
  const speciesProfile = context?.speciesProfiles?.find((sp) =>
    isSameSpecies(sp.name, task.species)
  );
  const prefix = (speciesProfile?.defaultAnimalPrefix || '').trim();
  const linkedAnimal = context?.animals?.find((a) => a.id === task.linkedAnimalId);

  const animalLine = (() => {
    if (!linkedAnimal && !task.linkedAnimalName) return '';
    const resolved = resolveAnimalDisplayToken(
      task.linkedAnimalName || linkedAnimal?.name || '',
      linkedAnimal,
      config,
      prefix
    );
    if (!config.includeAnimalName && linkedAnimal?.tattoo?.trim()) {
      return `Animal Ear #: ${resolved}`;
    }
    return resolved ? `Animal: ${resolved}` : '';
  })();

  const taskDeepLink = buildTaskAppDeepLink(context?.appBaseUrl, task);
  const descParts = [
    barnName ? `Barn: ${barnName}` : '',
    `Species: ${task.species}`,
    `Category: ${task.category}`,
    `Priority: ${task.priority}`,
    animalLine,
    task.linkedBreedingId ? 'Source: Breeding milestone cascade' : 'Source: Manual barn chore',
    taskDeepLink ? `Open Task in App: ${taskDeepLink}` : '',
  ].filter(Boolean);

  return {
    summaryText,
    descriptionText: descParts.join('\n'),
    taskDeepLink,
    startDateIso: task.dueDateIso,
    startTimeHm,
    endDateIso,
    endTimeHm,
  };
}

/**
 * Builds a Google Calendar v3 event payload for a dated `BarnTask`.
 * Returns `null` if the task does not have a valid `YYYY-MM-DD` due date.
 */
export function buildGoogleCalendarEventPayload(
  task: BarnTask,
  rawConfig?: Partial<CalendarSyncSettings>,
  barnName: string = 'Community Pedigree',
  timeZone: string = 'UTC',
  context?: CalendarExportContext
): GoogleCalendarEventPayload | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(task.dueDateIso || '')) return null;
  const config = normalizeCalendarSyncSettings(rawConfig);
  const meta = buildTaskCalendarMetadata(task, config, barnName, context);
  const safeTz = (timeZone || '').trim() || 'UTC';
  const alarmMins = Math.min(40320, Math.max(0, Math.round(config.alarmMinutesBefore)));

  return {
    id: buildDeterministicGoogleCalendarEventId(task.id),
    summary: meta.summaryText,
    description: meta.descriptionText,
    start: {
      dateTime: `${meta.startDateIso}T${meta.startTimeHm}:00`,
      timeZone: safeTz,
    },
    end: {
      dateTime: `${meta.endDateIso}T${meta.endTimeHm}:00`,
      timeZone: safeTz,
    },
    reminders: config.alarmEnabled
      ? {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: alarmMins }],
        }
      : {
          useDefault: false,
          overrides: [],
        },
    ...(meta.taskDeepLink
      ? {
          source: {
            title: 'Open Task in Community Pedigree',
            url: meta.taskDeepLink,
          },
        }
      : {}),
  };
}

/**
 * Builds prefilled external web calendar URLs (Google Calendar web + Outlook web)
 * for quick browser open when online, complementing `.ics` offline/desktop app handoff.
 */
export function buildExternalCalendarWebUrls(
  task: BarnTask,
  rawConfig?: Partial<CalendarSyncSettings>,
  barnName: string = 'Community Pedigree',
  context?: CalendarExportContext
): { googleWebUrl: string; outlookWebUrl: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(task.dueDateIso || '')) return null;
  const config = normalizeCalendarSyncSettings(rawConfig);
  const meta = buildTaskCalendarMetadata(task, config, barnName, context);

  const gStart = `${meta.startDateIso.replace(/-/g, '')}T${meta.startTimeHm.replace(':', '')}00`;
  const gEnd = `${meta.endDateIso.replace(/-/g, '')}T${meta.endTimeHm.replace(':', '')}00`;
  const googleWebUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
    meta.summaryText
  )}&dates=${gStart}/${gEnd}&details=${encodeURIComponent(meta.descriptionText)}`;

  const outlookWebUrl = `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${encodeURIComponent(
    meta.summaryText
  )}&startdt=${encodeURIComponent(
    `${meta.startDateIso}T${meta.startTimeHm}:00`
  )}&enddt=${encodeURIComponent(
    `${meta.endDateIso}T${meta.endTimeHm}:00`
  )}&body=${encodeURIComponent(meta.descriptionText)}`;

  return { googleWebUrl, outlookWebUrl };
}

export interface MultiSpeciesAgendaItem {
  id: string;
  kind: 'task' | 'birth';
  species: string;
  dueDateIso: string;
  title: string;
  subtitle: string;
  isOverdue: boolean;
  isDueToday: boolean;
  task?: BarnTask;
  breeding?: BreedingRecord;
}

export interface MultiSpeciesAgendaSummary {
  horizonDays: 7 | 14;
  cutoffIso: string;
  items: MultiSpeciesAgendaItem[];
  overdueCount: number;
  todayCount: number;
  upcomingCount: number;
  exportableTasks: BarnTask[];
}

/**
 * Builds a chronologically sorted multi-species agenda covering open dated tasks
 * and active projected births across ONLY configured `speciesProfiles` within the
 * next `horizonDays` (7 or 14 days), plus any overdue open chores.
 */
export function buildMultiSpeciesAgenda(params: {
  tasks: BarnTask[];
  animals: Animal[];
  breedings: BreedingRecord[];
  speciesProfiles: SpeciesProfile[];
  calendarSync?: Partial<CalendarSyncSettings>;
  todayIso: string;
  horizonDays?: 7 | 14;
  speciesFilter?: string;
}): MultiSpeciesAgendaSummary {
  const horizonDays: 7 | 14 = params.horizonDays === 14 ? 14 : 7;
  const cutoffIso = addDaysIso(params.todayIso, horizonDays);
  const filterClean = (params.speciesFilter || '').trim();

  const addedProfiles = params.speciesProfiles.filter((sp) =>
    filterClean ? isSameSpecies(sp.name, filterClean) : true
  );
  const addedSpeciesKeys = new Set(addedProfiles.map((sp) => sp.name.trim().toLowerCase()));
  const profileByKey = new Map<string, SpeciesProfile>();
  for (const sp of addedProfiles) {
    profileByKey.set(sp.name.trim().toLowerCase(), sp);
  }

  const archivedIds = new Set(
    params.animals
      .filter((a) => a.archived || a.status === 'Archived' || a.status === 'Sold' || a.status === 'Deceased')
      .map((a) => a.id)
  );

  const context: CalendarExportContext = {
    animals: params.animals,
    breedings: params.breedings,
    speciesProfiles: params.speciesProfiles,
  };

  const items: MultiSpeciesAgendaItem[] = [];
  const exportableTasks: BarnTask[] = [];
  const linkedBirthBreedingIds = new Set<string>();

  for (const task of params.tasks) {
    if (task.completed) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(task.dueDateIso || '')) continue;
    const spKey = (task.species || '').trim().toLowerCase();
    if (!addedSpeciesKeys.has(spKey)) continue;
    if (task.linkedAnimalId && archivedIds.has(task.linkedAnimalId)) continue;
    if (task.dueDateIso > cutoffIso) continue;

    exportableTasks.push(task);
    if (task.linkedBreedingId && task.category === 'Birth Check') {
      linkedBirthBreedingIds.add(task.linkedBreedingId);
    }

    const formattedTitle = formatSystemTaskTitle(task, params.calendarSync, context);
    const spName = profileByKey.get(spKey)?.name || task.species;
    items.push({
      id: `agenda-task-${task.id}`,
      kind: 'task',
      species: spName,
      dueDateIso: task.dueDateIso,
      title: formattedTitle || task.title,
      subtitle: `${spName} · ${task.category} · ${task.priority} priority`,
      isOverdue: task.dueDateIso < params.todayIso,
      isDueToday: task.dueDateIso === params.todayIso,
      task,
    });
  }

  for (const b of params.breedings) {
    if (!['Planned', 'Bred', 'Palpated Positive'].includes(b.status)) continue;
    if (linkedBirthBreedingIds.has(b.id)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.expectedDueDateIso || '')) continue;
    const spKey = (b.species || '').trim().toLowerCase();
    if (!addedSpeciesKeys.has(spKey)) continue;
    if (b.damId && archivedIds.has(b.damId)) continue;
    if (b.expectedDueDateIso > cutoffIso) continue;

    const spProfile = profileByKey.get(spKey);
    const spName = spProfile?.name || b.species;
    const birthEvent = spProfile?.birthEventLabel || 'Due Date';
    items.push({
      id: `agenda-birth-${b.id}`,
      kind: 'birth',
      species: spName,
      dueDateIso: b.expectedDueDateIso,
      title: `Expected ${birthEvent}: ${b.damName || 'Unknown Dam'} (× ${b.sireName || 'Unknown Sire'})`,
      subtitle: `${spName} · Breeding (${b.status})`,
      isOverdue: b.expectedDueDateIso < params.todayIso,
      isDueToday: b.expectedDueDateIso === params.todayIso,
      breeding: b,
    });
  }

  items.sort((a, b) => {
    const dCmp = a.dueDateIso.localeCompare(b.dueDateIso);
    if (dCmp !== 0) return dCmp;
    if (a.kind !== b.kind) return a.kind === 'task' ? -1 : 1;
    return a.species.localeCompare(b.species);
  });

  exportableTasks.sort((a, b) => a.dueDateIso.localeCompare(b.dueDateIso));

  let overdueCount = 0;
  let todayCount = 0;
  let upcomingCount = 0;
  for (const item of items) {
    if (item.isOverdue) overdueCount++;
    else if (item.isDueToday) todayCount++;
    else upcomingCount++;
  }

  return {
    horizonDays,
    cutoffIso,
    items,
    overdueCount,
    todayCount,
    upcomingCount,
    exportableTasks,
  };
}


```

## `src/core/carrierGenetics.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Genetic Carrier Trait Presets, Normalization, Cleared Branch Firewall
 * & Pedigree Lineage Propagation Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) calls so the exact
 * same presets, normalization, lineage firewall traversal, and compact pedigree summaries
 * run offline on Web PWA and React Native / Expo.
 *
 * Framing Note:
 * Entries represent hidden/recessive or lineage genetic traits cleanly without assuming
 * every trait is a defect (e.g., breeders intentionally work with Dilute, REW, Satin, or Wide Band
 * alongside health disclosures such as Megacolon / Charlie Risk or G6S).
 */

import { getGeneticsSpecForSpecies, parseGenotypeString } from './geneticsEngine';
import {
  Animal,
  CLEARED_CARRIER_PROOF_LABELS,
  ClearedCarrierProofType,
  ClearedCarrierRecord,
} from './models';

/**
 * Curated per-species suggested recessive & hidden genetic carrier traits for quick
 * typeable multi-select autocomplete while allowing unrestricted custom breeder entries.
 */
export const SPECIES_CARRIER_TRAIT_PRESETS: Record<string, readonly string[]> = {
  rabbit: [
    'REW / Ruby-Eyed White (cc)',
    'BEW / Vienna (vv)',
    'Dilute / Blue-Lilac-Fawn (dd)',
    'Chocolate / Brown (bb)',
    'Self (aa)',
    'Non-Extension / Red-Tort (ee)',
    'Wide Band (ww)',
    'Satin Coat (sa)',
    'Rex Coat (r)',
    'Angora / Wool (l)',
    'Chinchilla (chd)',
    'Sable / Pointed (chl / ch)',
    'Tan / Otter Pattern (at)',
    'Harlequin / Tricolor (ej)',
    'Dutch Pattern (du)',
    'Megacolon / Charlie Risk (EnEn)',
    'Dwarf Gene (dw)',
    'Max Factor',
    'Moon Eye / Glaucoma',
    'Splay Leg',
  ],
  goat: [
    'Polled (P)',
    'Wattles',
    'Blue Eyes',
    'Moonspots',
    'Recessive Black / Red',
    'Alpha-s1 Casein Variant',
    'G6S Deficiency',
    'Myotonia Congenita',
    'Spider / Hernia History',
  ],
  sheep: [
    'Scrapie Resistance (RR / QR)',
    'Spider Lamb Syndrome (SLS)',
    'Black / Moorit Recessive',
    'Spotted / Piebald',
    'Polled / Horns',
    'Double Muscling (Myostatin)',
    'Entropion Eyelid',
  ],
  'swine / pig': [
    'Stress Gene / Halothane (HAL)',
    'Rendement Napole (RN-)',
    'Wattles',
    'Red / Duroc Recessive',
    'Umbilical / Scrotal Hernia',
    'Atresia Ani Risk',
  ],
  cattle: [
    'Polled / Horned',
    'Red Factor (e)',
    'Dilute (Dc)',
    'Chondrodysplasia (Bulldog Dwarf)',
    'PHA (Pulmonary Hypoplasia)',
    'Tibial Hemimelia (TH)',
    'Arthrogryposis Multiplex (AM)',
    'Alpha-Mannosidosis',
  ],
  'guinea pig': [
    'Lethal White / Roan (Wh)',
    'Satin (sa)',
    'Skinny / Hairless',
    'Self / PEW (cc)',
    'Dilute / Lilac (pp / dd)',
    'Chocolate (bb)',
    'Dalmatian Pattern',
  ],
  chinchilla: [
    'Lethal White Factor',
    'Violet (vv)',
    'Sapphire (ss)',
    'Ebony Factor',
    'Charcoal',
    'Beige (Bb)',
    'Tooth / Malocclusion Line',
  ],
  ferret: [
    'Waardenburg / Blaze Deafness Risk',
    'Albino (cc)',
    'Angora Coat',
    'DEW / Black-Eyed White',
    'Cinnamon / Chocolate',
  ],
  alpaca: [
    'Blue-Eyed White (BEW)',
    'Roan / Grey Classic',
    'Suri Fleece',
    'Choanal Atresia Risk',
  ],
  dog: [
    'Dilute (dd)',
    'Chocolate / Liver (bb)',
    'Recessive Red / Cream (ee)',
    'Merle (M)',
    'MDR1 Drug Sensitivity',
    'DM (Degenerative Myelopathy)',
    'vWD (von Willebrand Disease)',
    'PRA (Progressive Retinal Atrophy)',
    'CEA (Collie Eye Anomaly)',
  ],
  cat: [
    'Dilute (dd)',
    'Chocolate / Cinnamon (b / bl)',
    'Colorpoint / Siamese (cs)',
    'Longhair Recessive (l)',
    'White Spotting / Deafness Risk',
    'PKD (Polycystic Kidney Disease)',
    'HCM Marker',
    'PRA (rdAc / Cep290)',
  ],
};

const GENERAL_FALLBACK_TRAITS: readonly string[] = [
  'Albino / White Recessive',
  'Dilute Coat Color',
  'Chocolate / Brown Recessive',
  'Long Coat / Wool',
  'Satin / Coat Variant',
  'Polled / Hornless',
];

/**
 * Returns suggested carrier trait labels tailored to a livestock species (case-insensitive).
 */
export function getCarrierTraitSuggestionsForSpecies(speciesName?: string): string[] {
  const key = (speciesName || '').trim().toLowerCase();
  const preset = SPECIES_CARRIER_TRAIT_PRESETS[key];
  if (preset) return [...preset];
  return [...GENERAL_FALLBACK_TRAITS];
}

/**
 * Cleans and case-insensitively deduplicates a list of genetic carrier trait strings
 * while preserving the user's original capitalization on the first occurrence.
 */
export function normalizeCarrierTraitList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    if (typeof raw === 'string' && raw.trim()) {
      raw = raw.split(/[;,]+/);
    } else {
      return [];
    }
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== 'string') continue;
    const clean = item.replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    const lower = clean.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(clean);
  }
  return result;
}

function normalizeProofType(raw: unknown): ClearedCarrierProofType {
  if (
    raw === 'test_bred' ||
    raw === 'dna_tested' ||
    raw === 'homozygous_locus' ||
    raw === 'breeder_verified'
  ) {
    return raw;
  }
  return 'test_bred';
}

/**
 * Normalizes and case-insensitively deduplicates `clearedCarrierOf` proof records.
 */
export function normalizeClearedCarrierList(raw: unknown): ClearedCarrierRecord[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ClearedCarrierRecord[] = [];
  for (const entry of raw) {
    let trait = '';
    let proofType: ClearedCarrierProofType = 'breeder_verified';
    let testBreedingCount: number | undefined;
    let note: string | undefined;
    let recordedAt: string | undefined;

    if (typeof entry === 'string') {
      trait = entry.replace(/\s+/g, ' ').trim();
    } else if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      trait = typeof obj.trait === 'string' ? obj.trait.replace(/\s+/g, ' ').trim() : '';
      proofType = normalizeProofType(obj.proofType);
      const countNum = Number(obj.testBreedingCount);
      if (Number.isFinite(countNum) && countNum > 0) {
        testBreedingCount = Math.round(countNum);
      }
      if (typeof obj.note === 'string' && obj.note.trim()) {
        note = obj.note.replace(/\s+/g, ' ').trim();
      }
      if (typeof obj.recordedAt === 'string' && obj.recordedAt.trim()) {
        recordedAt = obj.recordedAt.trim();
      }
    }

    if (!trait) continue;
    const key = trait.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      trait,
      proofType,
      ...(testBreedingCount ? { testBreedingCount } : {}),
      ...(note ? { note } : {}),
      ...(recordedAt ? { recordedAt } : {}),
    });
  }
  return out;
}

/**
 * Formats a concise proof description for a Cleared carrier record (e.g., `"Test Bred 4x"` or `"DNA Tested"`).
 */
export function formatClearedProofBadge(record: ClearedCarrierRecord): string {
  if (record.proofType === 'test_bred') {
    return record.testBreedingCount && record.testBreedingCount > 0
      ? `Test Bred ${record.testBreedingCount}x`
      : 'Test Bred';
  }
  if (record.proofType === 'dna_tested') return 'DNA Clear';
  if (record.proofType === 'homozygous_locus') return 'Homozygous Locus';
  return 'Verified Clear';
}

export function getClearedProofLongLabel(record: ClearedCarrierRecord): string {
  const base = CLEARED_CARRIER_PROOF_LABELS[record.proofType] || 'Verified Clear';
  if (record.proofType === 'test_bred' && record.testBreedingCount && record.testBreedingCount > 0) {
    return `${base} (${record.testBreedingCount} test mating${record.testBreedingCount === 1 ? '' : 's'})`;
  }
  return base;
}

/**
 * Normalizes `suspectedCarrierOf`, `confirmedCarrierOf`, and `clearedCarrierOf` together:
 * - Confirmed and Cleared always supersede Suspected.
 * - By default (`priority: 'confirmed'`), Confirmed supersedes Cleared; when `priority: 'cleared'`,
 *   moving a trait into Cleared cleanly strips it from both Confirmed and Suspected.
 */
export function reconcileCarrierTraitLists(
  suspectedRaw: unknown,
  confirmedRaw: unknown,
  clearedRaw?: unknown,
  priority: 'confirmed' | 'cleared' = 'confirmed'
): {
  suspectedCarrierOf: string[];
  confirmedCarrierOf: string[];
  clearedCarrierOf: ClearedCarrierRecord[];
} {
  let confirmedCarrierOf = normalizeCarrierTraitList(confirmedRaw);
  let clearedCarrierOf = normalizeClearedCarrierList(clearedRaw);

  if (priority === 'cleared') {
    const clearedKeys = new Set(clearedCarrierOf.map((c) => c.trait.toLowerCase()));
    confirmedCarrierOf = confirmedCarrierOf.filter((t) => !clearedKeys.has(t.toLowerCase()));
  } else {
    const confirmedKeys = new Set(confirmedCarrierOf.map((t) => t.toLowerCase()));
    clearedCarrierOf = clearedCarrierOf.filter((c) => !confirmedKeys.has(c.trait.toLowerCase()));
  }

  const blockingLower = new Set<string>([
    ...confirmedCarrierOf.map((t) => t.toLowerCase()),
    ...clearedCarrierOf.map((c) => c.trait.toLowerCase()),
  ]);

  const suspectedCarrierOf = normalizeCarrierTraitList(suspectedRaw).filter(
    (t) => !blockingLower.has(t.toLowerCase())
  );

  return { suspectedCarrierOf, confirmedCarrierOf, clearedCarrierOf };
}

export interface CarrierDisclosureParts {
  confirmed: string[];
  suspected: string[];
  cleared: ClearedCarrierRecord[];
  hasAny: boolean;
}

/**
 * Extracts normalized `confirmed`, `suspected`, and `cleared` carrier lists for any `Animal` record.
 */
export function getAnimalCarrierDisclosures(
  animal:
    | Partial<Pick<Animal, 'confirmedCarrierOf' | 'suspectedCarrierOf' | 'clearedCarrierOf'>>
    | null
    | undefined
): CarrierDisclosureParts {
  if (!animal) {
    return { confirmed: [], suspected: [], cleared: [], hasAny: false };
  }
  const { suspectedCarrierOf, confirmedCarrierOf, clearedCarrierOf } =
    reconcileCarrierTraitLists(
      animal.suspectedCarrierOf,
      animal.confirmedCarrierOf,
      animal.clearedCarrierOf
    );
  return {
    confirmed: confirmedCarrierOf,
    suspected: suspectedCarrierOf,
    cleared: clearedCarrierOf,
    hasAny:
      confirmedCarrierOf.length > 0 ||
      suspectedCarrierOf.length > 0 ||
      clearedCarrierOf.length > 0,
  };
}

// ─── Coat-Locus Homozygous Clearance Detection ─────────────────────────────────

interface CoatLocusClearRule {
  speciesKey: string;
  traitLabel: string;
  locus: string;
  excludedAlleles: string[];
  matchKeywords: string[];
}

const COAT_LOCUS_CLEAR_RULES: CoatLocusClearRule[] = [
  // Rabbit
  {
    speciesKey: 'rabbit',
    traitLabel: 'Wide Band (ww)',
    locus: 'W',
    excludedAlleles: ['w'],
    matchKeywords: ['(ww)', 'wide band', 'wideband', 'wide-band'],
  },
  {
    speciesKey: 'rabbit',
    traitLabel: 'Dilute / Blue-Lilac-Fawn (dd)',
    locus: 'D',
    excludedAlleles: ['d'],
    matchKeywords: ['(dd)', 'dilute'],
  },
  {
    speciesKey: 'rabbit',
    traitLabel: 'REW / Ruby-Eyed White (cc)',
    locus: 'C',
    excludedAlleles: ['c'],
    matchKeywords: ['(cc)', 'rew', 'ruby-eyed white', 'albino'],
  },
  {
    speciesKey: 'rabbit',
    traitLabel: 'Chocolate / Brown (bb)',
    locus: 'B',
    excludedAlleles: ['b'],
    matchKeywords: ['(bb)', 'chocolate'],
  },
  {
    speciesKey: 'rabbit',
    traitLabel: 'BEW / Vienna (vv)',
    locus: 'V',
    excludedAlleles: ['v'],
    matchKeywords: ['(vv)', 'vienna', 'bew'],
  },
  {
    speciesKey: 'rabbit',
    traitLabel: 'Self (aa)',
    locus: 'A',
    excludedAlleles: ['a'],
    matchKeywords: ['(aa)', 'self (aa)', 'recessive black'],
  },
  {
    speciesKey: 'rabbit',
    traitLabel: 'Non-Extension / Red-Tort (ee)',
    locus: 'E',
    excludedAlleles: ['e'],
    matchKeywords: ['(ee)', 'non-extension', 'red factor'],
  },
  {
    speciesKey: 'rabbit',
    traitLabel: 'Dutch Pattern (du)',
    locus: 'Du',
    excludedAlleles: ['du'],
    matchKeywords: ['(du)', '(dudu)', 'dutch pattern'],
  },
  // Cat
  {
    speciesKey: 'cat',
    traitLabel: 'Dilute (dd)',
    locus: 'D',
    excludedAlleles: ['d'],
    matchKeywords: ['(dd)', 'dilute'],
  },
  {
    speciesKey: 'cat',
    traitLabel: 'Chocolate / Cinnamon (b / bl)',
    locus: 'B',
    excludedAlleles: ['b', 'b1'],
    matchKeywords: ['(bb)', 'chocolate', 'cinnamon'],
  },
  {
    speciesKey: 'cat',
    traitLabel: 'Colorpoint / Siamese (cs)',
    locus: 'C',
    excludedAlleles: ['cb', 'cs', 'c'],
    matchKeywords: ['(cs)', 'colorpoint', 'siamese', 'burmese', 'albino', '(cc)'],
  },
  // Dog
  {
    speciesKey: 'dog',
    traitLabel: 'Dilute (dd)',
    locus: 'D',
    excludedAlleles: ['d'],
    matchKeywords: ['(dd)', 'dilute'],
  },
  {
    speciesKey: 'dog',
    traitLabel: 'Chocolate / Liver (bb)',
    locus: 'B',
    excludedAlleles: ['b'],
    matchKeywords: ['(bb)', 'chocolate', 'liver'],
  },
  {
    speciesKey: 'dog',
    traitLabel: 'Recessive Red / Cream (ee)',
    locus: 'E',
    excludedAlleles: ['e'],
    matchKeywords: ['(ee)', 'recessive red'],
  },
  {
    speciesKey: 'dog',
    traitLabel: 'Merle (M)',
    locus: 'M',
    excludedAlleles: ['M'],
    matchKeywords: ['merle'],
  },
  // Guinea Pig
  {
    speciesKey: 'guinea pig',
    traitLabel: 'Chocolate (bb)',
    locus: 'B',
    excludedAlleles: ['b'],
    matchKeywords: ['(bb)', 'chocolate'],
  },
  {
    speciesKey: 'guinea pig',
    traitLabel: 'Self / PEW (cc)',
    locus: 'C',
    excludedAlleles: ['cr', 'ca'],
    matchKeywords: ['(cc)', 'pew', 'albino', 'himalayan'],
  },
  {
    speciesKey: 'guinea pig',
    traitLabel: 'Dilute / Lilac (pp / dd)',
    locus: 'P',
    excludedAlleles: ['p'],
    matchKeywords: ['lilac', '(pp', 'dilute'],
  },
  {
    speciesKey: 'guinea pig',
    traitLabel: 'Lethal White / Roan (Wh)',
    locus: 'Rn',
    excludedAlleles: ['Rn'],
    matchKeywords: ['roan', 'dalmatian', 'lethal white'],
  },
  // Chinchilla
  {
    speciesKey: 'chinchilla',
    traitLabel: 'Violet (vv)',
    locus: 'V',
    excludedAlleles: ['v'],
    matchKeywords: ['(vv)', 'violet'],
  },
  {
    speciesKey: 'chinchilla',
    traitLabel: 'Sapphire (ss)',
    locus: 'S',
    excludedAlleles: ['s'],
    matchKeywords: ['(ss)', 'sapphire'],
  },
  {
    speciesKey: 'chinchilla',
    traitLabel: 'Lethal White Factor',
    locus: 'Wh',
    excludedAlleles: ['Wh'],
    matchKeywords: ['lethal white', 'wilson white'],
  },
  // Ferret
  {
    speciesKey: 'ferret',
    traitLabel: 'Albino (cc)',
    locus: 'C',
    excludedAlleles: ['c'],
    matchKeywords: ['(cc)', 'albino'],
  },
  {
    speciesKey: 'ferret',
    traitLabel: 'Cinnamon / Chocolate',
    locus: 'B',
    excludedAlleles: ['b'],
    matchKeywords: ['chocolate', 'cinnamon'],
  },
  // Cattle
  {
    speciesKey: 'cattle',
    traitLabel: 'Red Factor (e)',
    locus: 'E',
    excludedAlleles: ['e'],
    matchKeywords: ['red factor', '(e)'],
  },
  // Sheep
  {
    speciesKey: 'sheep',
    traitLabel: 'Black / Moorit Recessive',
    locus: 'B',
    excludedAlleles: ['b'],
    matchKeywords: ['moorit'],
  },
  // Swine / Pig
  {
    speciesKey: 'swine / pig',
    traitLabel: 'Red / Duroc Recessive',
    locus: 'E',
    excludedAlleles: ['e'],
    matchKeywords: ['duroc', 'red / duroc'],
  },
];

/**
 * Inspects an animal's explicitly entered genotype pairs (strictly ignoring any pair containing `'_'`)
 * to identify species-specific coat-color loci proven homozygous non-carrier (e.g., `WW` cannot pass `w`, `DD` cannot pass `d`).
 * Returns `[]` for custom/unrecognized species to prevent Rabbit rule leakage.
 */
export function extractHomozygousCoatClearances(
  animal: Partial<Animal> | null | undefined
): Array<{ trait: string; locus: string; pair: string }> {
  if (!animal) return [];
  const speciesName = animal.species || 'Rabbit';
  const spec = getGeneticsSpecForSpecies(speciesName);
  if (!spec) return [];

  const parsed =
    animal.genotype && animal.genotype.length > 0 && !animal.genotypeRaw
      ? animal.genotype
      : animal.genotypeRaw
      ? parseGenotypeString(animal.genotypeRaw, speciesName)
      : animal.genotype || [];

  if (parsed.length === 0) return [];
  const byLocus = new Map(parsed.map((p) => [p.locus, p]));
  const direct = getAnimalCarrierDisclosures(animal);
  const directRiskKeys = new Set([
    ...direct.confirmed.map((t) => t.toLowerCase()),
    ...direct.suspected.map((t) => t.toLowerCase()),
  ]);

  const specKeyLower = spec.speciesKey.toLowerCase();
  const speciesRules = COAT_LOCUS_CLEAR_RULES.filter((r) => r.speciesKey === specKeyLower);

  const cleared: Array<{ trait: string; locus: string; pair: string }> = [];
  for (const rule of speciesRules) {
    const pair = byLocus.get(rule.locus);
    if (!pair) continue;
    // CRITICAL: '_' or empty NEVER qualifies as homozygous non-carrier!
    if (!pair.allele1 || !pair.allele2 || pair.allele1 === '_' || pair.allele2 === '_') continue;
    if (
      rule.excludedAlleles.includes(pair.allele1) ||
      rule.excludedAlleles.includes(pair.allele2)
    ) {
      continue;
    }
    // Never auto-clear if user directly marked Confirmed or Suspected for this trait
    if (
      Array.from(directRiskKeys).some((k) =>
        rule.matchKeywords.some((kw) => k === kw || k.includes(kw))
      )
    ) {
      continue;
    }

    cleared.push({
      trait: rule.traitLabel,
      locus: rule.locus,
      pair: `${pair.allele1}${pair.allele2}`,
    });
  }
  return cleared;
}

function matchesTraitOrRule(traitA: string, traitB: string, speciesKey?: string): boolean {
  const a = traitA.trim().toLowerCase();
  const b = traitB.trim().toLowerCase();
  if (a === b) return true;
  const rules = speciesKey
    ? COAT_LOCUS_CLEAR_RULES.filter((r) => r.speciesKey === speciesKey.toLowerCase())
    : COAT_LOCUS_CLEAR_RULES;
  for (const rule of rules) {
    const aHits = rule.matchKeywords.some((kw) => a.includes(kw));
    const bHits = rule.matchKeywords.some((kw) => b.includes(kw));
    if (aHits && bHits) return true;
  }
  return false;
}

// ─── Independent Sire/Dam Branch Firewall Traversal ────────────────────────────

export interface LineageSourceAncestor {
  id: string;
  name: string;
  tattoo: string;
  branch: 'Sire' | 'Dam';
  generation: number;
  status: 'Confirmed' | 'Suspected';
}

export interface LineagePotentialCarrierEntry {
  trait: string;
  viaBranches: Array<'Sire' | 'Dam'>;
  sourceAncestors: LineageSourceAncestor[];
}

export interface BlockedLineageBranchEntry {
  trait: string;
  branch: 'Sire' | 'Dam';
  clearedById: string;
  clearedByName: string;
  clearedByTattoo: string;
  proofLabel: string;
  generation: number;
}

export interface AnimalCarrierLineageAnalysis {
  confirmed: string[];
  suspected: string[];
  cleared: ClearedCarrierRecord[];
  genotypeCleared: Array<{ trait: string; locus: string; pair: string }>;
  lineagePotential: LineagePotentialCarrierEntry[];
  blockedBranches: BlockedLineageBranchEntry[];
  hasAnyDirect: boolean;
  hasAnyLineagePotential: boolean;
}

interface BranchHit {
  trait: string;
  source: LineageSourceAncestor;
}

function getClearedProofForTrait(
  anc: Animal,
  traitName: string
): { isCleared: boolean; proofLabel: string } {
  const ancSpeciesKey = getGeneticsSpecForSpecies(anc.species)?.speciesKey;
  const direct = getAnimalCarrierDisclosures(anc);
  // Direct Confirmed/Suspected on the ancestor prevents self-bypass
  if (
    direct.confirmed.some((t) => matchesTraitOrRule(t, traitName, ancSpeciesKey)) ||
    direct.suspected.some((t) => matchesTraitOrRule(t, traitName, ancSpeciesKey))
  ) {
    return { isCleared: false, proofLabel: '' };
  }

  const explicitCleared = direct.cleared.find((c) =>
    matchesTraitOrRule(c.trait, traitName, ancSpeciesKey)
  );
  if (explicitCleared) {
    return { isCleared: true, proofLabel: formatClearedProofBadge(explicitCleared) };
  }

  const genoCleared = extractHomozygousCoatClearances(anc).find((g) =>
    matchesTraitOrRule(g.trait, traitName, ancSpeciesKey)
  );
  if (genoCleared) {
    return { isCleared: true, proofLabel: `Homozygous ${genoCleared.pair}` };
  }

  return { isCleared: false, proofLabel: '' };
}

/**
 * Evaluates an animal's direct carrier state AND walks both Sire-side and Dam-side pedigree
 * branches independently (stopping upward propagation along any branch where an ancestor is Cleared
 * or carries a verified homozygous dominant coat locus such as `DD` or `WW`).
 */
export function analyzeAnimalCarrierLineage(
  subject: Animal | null | undefined,
  herdById: Map<string, Animal>,
  maxDepth = 6
): AnimalCarrierLineageAnalysis {
  if (!subject) {
    return {
      confirmed: [],
      suspected: [],
      cleared: [],
      genotypeCleared: [],
      lineagePotential: [],
      blockedBranches: [],
      hasAnyDirect: false,
      hasAnyLineagePotential: false,
    };
  }

  const direct = getAnimalCarrierDisclosures(subject);
  const genotypeCleared = extractHomozygousCoatClearances(subject);
  const potentialMap = new Map<
    string,
    { trait: string; branches: Set<'Sire' | 'Dam'>; sources: LineageSourceAncestor[] }
  >();
  const blockedBranches: BlockedLineageBranchEntry[] = [];
  const seenBlockedKey = new Set<string>();

  const walkAncestorBranch = (
    ancestorId: string | undefined,
    branch: 'Sire' | 'Dam',
    depth: number,
    visitedPath: Set<string>
  ): BranchHit[] => {
    if (!ancestorId || depth > maxDepth || visitedPath.has(ancestorId)) return [];
    const anc = herdById.get(ancestorId);
    if (!anc) return [];

    const nextVisited = new Set(visitedPath);
    nextVisited.add(ancestorId);

    const upstreamHits = [
      ...walkAncestorBranch(anc.sireId, branch, depth + 1, nextVisited),
      ...walkAncestorBranch(anc.damId, branch, depth + 1, nextVisited),
    ];

    const survivingHits: BranchHit[] = [];

    // Filter upstream ancestral risks against this ancestor's Cleared firewall
    for (const hit of upstreamHits) {
      const clearCheck = getClearedProofForTrait(anc, hit.trait);
      if (clearCheck.isCleared) {
        const blockKey = `${branch}::${hit.trait.toLowerCase()}::${anc.id}`;
        if (!seenBlockedKey.has(blockKey)) {
          seenBlockedKey.add(blockKey);
          blockedBranches.push({
            trait: hit.trait,
            branch,
            clearedById: anc.id,
            clearedByName: anc.name,
            clearedByTattoo: anc.tattoo,
            proofLabel: clearCheck.proofLabel,
            generation: depth,
          });
        }
        continue; // Branch firewall stops upward trait from passing through `anc`!
      }
      survivingHits.push(hit);
    }

    // Direct traits on `anc` itself originate below `anc`'s firewall and pass forward to descendants
    const ancDirect = getAnimalCarrierDisclosures(anc);
    for (const t of ancDirect.confirmed) {
      survivingHits.push({
        trait: t,
        source: {
          id: anc.id,
          name: anc.name,
          tattoo: anc.tattoo,
          branch,
          generation: depth,
          status: 'Confirmed',
        },
      });
    }
    for (const t of ancDirect.suspected) {
      survivingHits.push({
        trait: t,
        source: {
          id: anc.id,
          name: anc.name,
          tattoo: anc.tattoo,
          branch,
          generation: depth,
          status: 'Suspected',
        },
      });
    }

    return survivingHits;
  };

  const rootVisited = new Set<string>([subject.id]);
  const allBranchHits = [
    ...walkAncestorBranch(subject.sireId, 'Sire', 1, rootVisited),
    ...walkAncestorBranch(subject.damId, 'Dam', 1, rootVisited),
  ];

  for (const hit of allBranchHits) {
    // Subject itself clears this trait via direct Cleared record or homozygous dominant coat locus
    const subjectCleared = getClearedProofForTrait(subject, hit.trait);
    if (subjectCleared.isCleared) {
      const blockKey = `${hit.source.branch}::${hit.trait.toLowerCase()}::${subject.id}`;
      if (!seenBlockedKey.has(blockKey)) {
        seenBlockedKey.add(blockKey);
        blockedBranches.push({
          trait: hit.trait,
          branch: hit.source.branch,
          clearedById: subject.id,
          clearedByName: subject.name,
          clearedByTattoo: subject.tattoo,
          proofLabel: subjectCleared.proofLabel,
          generation: 0,
        });
      }
      continue;
    }

    // Subject already discloses this trait directly as Confirmed or Suspected -> don't duplicate as "Potential"
    if (
      direct.confirmed.some((t) => matchesTraitOrRule(t, hit.trait)) ||
      direct.suspected.some((t) => matchesTraitOrRule(t, hit.trait))
    ) {
      continue;
    }

    const key = hit.trait.toLowerCase();
    const bucket = potentialMap.get(key) || {
      trait: hit.trait,
      branches: new Set<'Sire' | 'Dam'>(),
      sources: [],
    };
    bucket.branches.add(hit.source.branch);
    if (
      !bucket.sources.some(
        (s) => s.id === hit.source.id && s.branch === hit.source.branch
      )
    ) {
      bucket.sources.push(hit.source);
    }
    potentialMap.set(key, bucket);
  }

  const lineagePotential: LineagePotentialCarrierEntry[] = Array.from(potentialMap.values())
    .map((entry) => ({
      trait: entry.trait,
      viaBranches: Array.from(entry.branches).sort(),
      sourceAncestors: entry.sources.sort((a, b) => a.generation - b.generation),
    }))
    .sort((a, b) => a.trait.localeCompare(b.trait));

  return {
    confirmed: direct.confirmed,
    suspected: direct.suspected,
    cleared: direct.cleared,
    genotypeCleared,
    lineagePotential,
    blockedBranches,
    hasAnyDirect: direct.hasAny,
    hasAnyLineagePotential: lineagePotential.length > 0,
  };
}

// ─── Breeding Pairing Shared Carrier Analysis ──────────────────────────────────

export interface PairingCarrierRisk {
  trait: string;
  severity: 'danger' | 'warning' | 'info';
  sireStatus: string;
  damStatus: string;
  summary: string;
}

function getTraitStatusForParent(
  analysis: AnimalCarrierLineageAnalysis,
  trait: string
): { level: 'confirmed' | 'suspected' | 'lineage' | 'cleared' | 'none'; label: string } {
  if (analysis.confirmed.some((t) => matchesTraitOrRule(t, trait))) {
    return { level: 'confirmed', label: 'Confirmed Carrier' };
  }
  if (analysis.suspected.some((t) => matchesTraitOrRule(t, trait))) {
    return { level: 'suspected', label: 'Suspected Carrier' };
  }
  const lin = analysis.lineagePotential.find((l) => matchesTraitOrRule(l.trait, trait));
  if (lin) {
    return {
      level: 'lineage',
      label: `Lineage Potential (${lin.viaBranches.join(' & ')})`,
    };
  }
  const clr = analysis.cleared.find((c) => matchesTraitOrRule(c.trait, trait));
  if (clr) {
    return { level: 'cleared', label: `Cleared (${formatClearedProofBadge(clr)})` };
  }
  const genoClr = analysis.genotypeCleared.find((g) => matchesTraitOrRule(g.trait, trait));
  if (genoClr) {
    return { level: 'cleared', label: `Cleared (${genoClr.pair})` };
  }
  return { level: 'none', label: 'Not recorded' };
}

/**
 * Evaluates shared Confirmed, Suspected, and Lineage-Potential carrier risks from
 * pre-computed Sire and Dam lineage analyses (O(1) pedigree walk for batch matrices).
 */
export function analyzePairingCarrierRisksFromAnalyses(
  sAnalysis: AnimalCarrierLineageAnalysis,
  dAnalysis: AnimalCarrierLineageAnalysis
): PairingCarrierRisk[] {
  const candidateTraits: string[] = normalizeCarrierTraitList([
    ...sAnalysis.confirmed,
    ...sAnalysis.suspected,
    ...sAnalysis.lineagePotential.map((l) => l.trait),
    ...dAnalysis.confirmed,
    ...dAnalysis.suspected,
    ...dAnalysis.lineagePotential.map((l) => l.trait),
  ]);

  const seenRules: string[] = [];
  const risks: PairingCarrierRisk[] = [];

  for (const trait of candidateTraits) {
    if (seenRules.some((prev) => matchesTraitOrRule(prev, trait))) continue;
    seenRules.push(trait);

    const sSt = getTraitStatusForParent(sAnalysis, trait);
    const dSt = getTraitStatusForParent(dAnalysis, trait);
    const sRisky = sSt.level === 'confirmed' || sSt.level === 'suspected' || sSt.level === 'lineage';
    const dRisky = dSt.level === 'confirmed' || dSt.level === 'suspected' || dSt.level === 'lineage';

    if (!sRisky && !dRisky) continue;

    if (sSt.level === 'confirmed' && dSt.level === 'confirmed') {
      risks.push({
        trait,
        severity: 'danger',
        sireStatus: sSt.label,
        damStatus: dSt.label,
        summary: `Both parents are Confirmed Carriers (~25%+ chance offspring express homozygous ${trait}).`,
      });
    } else if (sRisky && dRisky) {
      risks.push({
        trait,
        severity: 'warning',
        sireStatus: sSt.label,
        damStatus: dSt.label,
        summary: `Shared trait on both sides (${sSt.label} × ${dSt.label}) — offspring may express or carry ${trait}.`,
      });
    } else {
      risks.push({
        trait,
        severity: 'info',
        sireStatus: sSt.label,
        damStatus: dSt.label,
        summary: `Single-side disclosure (${sRisky ? `Sire: ${sSt.label}` : `Dam: ${dSt.label}`}). Offspring may carry ${trait} hidden.`,
      });
    }
  }

  return risks.sort((a, b) => {
    const rank = { danger: 0, warning: 1, info: 2 };
    return rank[a.severity] - rank[b.severity] || a.trait.localeCompare(b.trait);
  });
}

/**
 * Evaluates shared Confirmed, Suspected, and Lineage-Potential carrier risks between Sire and Dam.
 */
export function analyzePairingCarrierRisks(
  sire: Animal,
  dam: Animal,
  herdById: Map<string, Animal>
): PairingCarrierRisk[] {
  const sAnalysis = analyzeAnimalCarrierLineage(sire, herdById);
  const dAnalysis = analyzeAnimalCarrierLineage(dam, herdById);
  return analyzePairingCarrierRisksFromAnalyses(sAnalysis, dAnalysis);
}

// ─── Herd Carrier Filter / Finder Helper ───────────────────────────────────────

export type HerdCarrierFilterMode =
  | 'all'
  | 'any_risk'
  | 'confirmed'
  | 'suspected'
  | 'lineage_potential'
  | 'cleared';

export function doesAnimalMatchCarrierFilter(
  analysis: AnimalCarrierLineageAnalysis,
  mode: HerdCarrierFilterMode,
  traitQuery = ''
): boolean {
  const q = traitQuery.trim().toLowerCase();

  const matchesQ = (list: string[]): boolean =>
    !q || list.some((item) => item.toLowerCase().includes(q));

  if (mode === 'all') {
    if (!q) return true;
    return (
      matchesQ(analysis.confirmed) ||
      matchesQ(analysis.suspected) ||
      matchesQ(analysis.lineagePotential.map((l) => l.trait)) ||
      matchesQ(analysis.cleared.map((c) => c.trait)) ||
      matchesQ(analysis.genotypeCleared.map((g) => g.trait))
    );
  }
  if (mode === 'confirmed') {
    return analysis.confirmed.length > 0 && matchesQ(analysis.confirmed);
  }
  if (mode === 'suspected') {
    return analysis.suspected.length > 0 && matchesQ(analysis.suspected);
  }
  if (mode === 'lineage_potential') {
    return (
      analysis.lineagePotential.length > 0 &&
      matchesQ(analysis.lineagePotential.map((l) => l.trait))
    );
  }
  if (mode === 'cleared') {
    const allCleared = [
      ...analysis.cleared.map((c) => c.trait),
      ...analysis.genotypeCleared.map((g) => g.trait),
    ];
    return allCleared.length > 0 && matchesQ(allCleared);
  }
  // any_risk = Confirmed OR Suspected OR Lineage Potential
  const allRisk = [
    ...analysis.confirmed,
    ...analysis.suspected,
    ...analysis.lineagePotential.map((l) => l.trait),
  ];
  return allRisk.length > 0 && matchesQ(allRisk);
}

// ─── Compact Pedigree & Export Formatter ───────────────────────────────────────

/**
 * Strips parenthetical allele hints (e.g. `"REW / Ruby-Eyed White (cc)"` -> `"REW (cc)"`)
 * ONLY when ultra-compact pedigree cells need to fit tight 5-gen/6-gen columns.
 */
function shortenTraitForTightCell(label: string): string {
  const parenMatch = label.match(/^([^(]{2,34}?)\s*\(([^)]+)\)$/);
  if (parenMatch) {
    const base = parenMatch[1].trim();
    const slashIdx = base.indexOf('/');
    const shortBase = slashIdx > 0 ? base.slice(0, slashIdx).trim() : base;
    return `${shortBase} (${parenMatch[2].trim()})`;
  }
  return label.length > 26 ? `${label.slice(0, 24).trimEnd()}…` : label;
}

export interface CompactCarrierFormatOptions {
  /** Use ultra-short prefix (`Conf:` / `Susp:` vs `Confirmed:` / `Suspected:`) and trim long labels. */
  ultraCompact?: boolean;
  /** Cap how many items render inline before `+N` summary (default: show all). */
  maxItemsPerGroup?: number;
  /** Optional herd map to automatically compute Lineage Potential (respecting Cleared firewalls). */
  herdById?: Map<string, Animal>;
  /** Include explicit `Cleared:` items cleanly (default true when `clearedCarrierOf` is present). */
  includeCleared?: boolean;
  /** Include `Lineage:` potential risks (requires `herdById`). */
  includeLineage?: boolean;
}

/**
 * Formats a concise single-line carrier disclosure string suitable for pedigree subject banners
 * and ancestor cells. Returns `""` when no traits or lineage risks apply.
 */
export function formatCompactCarrierDisclosure(
  animal:
    | Partial<
        Pick<
          Animal,
          | 'id'
          | 'sireId'
          | 'damId'
          | 'genotype'
          | 'genotypeRaw'
          | 'species'
          | 'confirmedCarrierOf'
          | 'suspectedCarrierOf'
          | 'clearedCarrierOf'
        >
      >
    | null
    | undefined,
  options?: CompactCarrierFormatOptions
): string {
  if (!animal) return '';
  const ultra = Boolean(options?.ultraCompact);
  const maxItems = options?.maxItemsPerGroup ?? Infinity;
  const includeCleared = options?.includeCleared ?? true;
  const includeLineage = Boolean(options?.includeLineage && options?.herdById);

  const direct = getAnimalCarrierDisclosures(animal);
  const lineage =
    includeLineage && options?.herdById && animal.id
      ? analyzeAnimalCarrierLineage(animal as Animal, options.herdById)
      : null;

  const clearedStrings = includeCleared
    ? direct.cleared.map((c) => `${c.trait} (${formatClearedProofBadge(c)})`)
    : [];
  const lineageStrings = lineage
    ? lineage.lineagePotential.map((l) =>
        ultra ? l.trait : `${l.trait} (${l.viaBranches.join('/')})`
      )
    : [];

  if (
    direct.confirmed.length === 0 &&
    direct.suspected.length === 0 &&
    clearedStrings.length === 0 &&
    lineageStrings.length === 0
  ) {
    return '';
  }

  const formatGroup = (prefixFull: string, prefixShort: string, items: string[]): string => {
    if (items.length === 0) return '';
    const mapped = ultra ? items.map(shortenTraitForTightCell) : items;
    const visible = mapped.slice(0, maxItems);
    const hiddenCount = mapped.length - visible.length;
    const suffix = hiddenCount > 0 ? ` +${hiddenCount}` : '';
    return `${ultra ? prefixShort : prefixFull}: ${visible.join(', ')}${suffix}`;
  };

  const parts = [
    formatGroup('Confirmed', 'Conf', direct.confirmed),
    formatGroup('Suspected', 'Susp', direct.suspected),
    formatGroup('Lineage Potential', 'Lin', lineageStrings),
    formatGroup('Cleared', 'Clr', clearedStrings),
  ].filter(Boolean);

  return parts.join(' · ');
}
```

<!-- END OF PART 08 OF 16 (15 files) -->
