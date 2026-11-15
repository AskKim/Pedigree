/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reusable Cross-Species Migration Modal (`src/components/SpeciesMigrationModal.tsx`).
 *
 * Supports:
 * - Single animal migration (`Move Species`)
 * - Multi-select pedigree-family migration (moves selected animals + parents/ancestors +
 *   offspring/descendants + linked co-parents & their pedigree parents)
 * - Full-species bulk migration (`Migrate All` across ALL statuses and ALL species records)
 *
 * Always includes a dedicated Step 2 Confirmation screen clarifying exact counts and
 * workspace impact before modifying any records.
 */

import { AlertTriangle, ArrowLeft, ArrowRightLeft, CheckCircle2, Info, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import {
  ANIMAL_STATUSES,
  BarnDatabaseSnapshot,
  isSameSpecies,
  PREDEFINED_SPECIES_PRESETS,
} from '../core/models';
import {
  expandPedigreeFamilyInSpecies,
  migrateAnimalsToSpecies,
  SpeciesMigrationOptions,
} from '../core/speciesMigration';

interface SpeciesMigrationModalProps {
  snapshot: BarnDatabaseSnapshot;
  sourceSpecies: string;
  directAnimalIds: string[];
  mode: 'single' | 'multi-select' | 'bulk-all';
  onConfirmMigrate: (
    animalIds: string[],
    targetSpecies: string,
    options?: SpeciesMigrationOptions
  ) => Promise<void> | void;
  onClose: () => void;
}

export function SpeciesMigrationModal({
  snapshot,
  sourceSpecies,
  directAnimalIds,
  mode,
  onConfirmMigrate,
  onClose,
}: SpeciesMigrationModalProps) {
  const isBulkAll = mode === 'bulk-all';
  const isMultiSelect = mode === 'multi-select';

  const sourceAnimalsAll = useMemo(
    () =>
      snapshot.animals
        .filter((a) => isSameSpecies(a.species, sourceSpecies))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [snapshot.animals, sourceSpecies]
  );

  const familyExpansion = useMemo(
    () => expandPedigreeFamilyInSpecies(snapshot.animals, directAnimalIds, sourceSpecies),
    [snapshot.animals, directAnimalIds, sourceSpecies]
  );

  // Default ON for multi-select (moves selected + parents + offspring + linked co-parents)
  // Default OFF for single-animal `Move Species` (toggleable if user wants family too)
  const [includeConnectedPedigree, setIncludeConnectedPedigree] = useState<boolean>(isMultiSelect);
  const [showFullAnimalList, setShowFullAnimalList] = useState<boolean>(false);
  const [step, setStep] = useState<'configure' | 'confirm'>('configure');

  const animalsToMove = useMemo(() => {
    if (isBulkAll) return sourceAnimalsAll;
    if (includeConnectedPedigree) return familyExpansion.expandedAnimals;
    const directSet = new Set(familyExpansion.directIds);
    return sourceAnimalsAll.filter((a) => directSet.has(a.id));
  }, [isBulkAll, includeConnectedPedigree, sourceAnimalsAll, familyExpansion]);

  const effectiveAnimalIds = useMemo(() => animalsToMove.map((a) => a.id), [animalsToMove]);

  const statusBreakdown = useMemo(() => {
    const counts: Array<{ status: string; count: number }> = [];
    for (const st of ANIMAL_STATUSES) {
      const c = animalsToMove.filter((a) => a.status === st).length;
      if (c > 0) counts.push({ status: st, count: c });
    }
    return counts;
  }, [animalsToMove]);

  const targetOptions = useMemo(() => {
    const list: Array<{ name: string; subtitle: string; isConfigured: boolean }> = [];
    const seen = new Set<string>();

    for (const sp of snapshot.speciesProfiles) {
      if (isSameSpecies(sp.name, sourceSpecies)) continue;
      const key = sp.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({
        name: sp.name,
        subtitle: `${sp.maleLabel} · ${sp.femaleLabel} · ${sp.gestationDays}d gestation`,
        isConfigured: true,
      });
    }

    for (const preset of PREDEFINED_SPECIES_PRESETS) {
      if (isSameSpecies(preset.name, sourceSpecies)) continue;
      const key = preset.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({
        name: preset.name,
        subtitle: `${preset.maleLabel} · ${preset.femaleLabel} · ${preset.gestationDays}d gestation (auto-creates hub)`,
        isConfigured: false,
      });
    }

    return list;
  }, [snapshot.speciesProfiles, sourceSpecies]);

  const [selectedTarget, setSelectedTarget] = useState<string>(
    () => targetOptions[0]?.name || ''
  );
  const [customTarget, setCustomTarget] = useState<string>('');
  const [useCustomInput, setUseCustomInput] = useState<boolean>(false);
  const [isMigrating, setIsMigrating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const effectiveTarget = (useCustomInput ? customTarget : selectedTarget).trim();
  const isSameAsSource = effectiveTarget ? isSameSpecies(effectiveTarget, sourceSpecies) : false;

  const migrationOptions: SpeciesMigrationOptions = useMemo(
    () => ({
      migrateEntireSpecies: isBulkAll,
      sourceSpeciesName: sourceSpecies,
    }),
    [isBulkAll, sourceSpecies]
  );

  // Pure dry-run preview so Confirmation Step shows exact counts of what will happen
  const previewResult = useMemo(() => {
    if (!effectiveTarget || isSameAsSource) return null;
    try {
      return migrateAnimalsToSpecies(
        snapshot,
        effectiveAnimalIds,
        effectiveTarget,
        migrationOptions
      );
    } catch {
      return null;
    }
  }, [snapshot, effectiveAnimalIds, effectiveTarget, isSameAsSource, migrationOptions]);

  const canProceed =
    Boolean(effectiveTarget) &&
    !isSameAsSource &&
    Boolean(previewResult) &&
    !isMigrating;

  const handleConfirmExecute = async () => {
    if (!canProceed) return;
    setErrorMsg(null);
    setIsMigrating(true);
    try {
      await onConfirmMigrate(effectiveAnimalIds, effectiveTarget, migrationOptions);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not migrate selected records.');
    } finally {
      setIsMigrating(false);
    }
  };

  const extraFamilyCount =
    familyExpansion.ancestorIds.length +
    familyExpansion.descendantIds.length +
    familyExpansion.linkedCoParentAndRelativeIds.length;

  const heading = isBulkAll
    ? `Migrate All ${sourceSpecies} (${sourceAnimalsAll.length} Animals + All Records)`
    : mode === 'single' && animalsToMove.length === 1
      ? `Move ${animalsToMove[0].name} to Another Species`
      : `Migrate ${animalsToMove.length} ${animalsToMove.length === 1 ? 'Animal' : 'Animals'}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[var(--barn-surface)] border-b border-[var(--barn-border)] px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ArrowRightLeft className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold truncate">
              {step === 'confirm' ? 'Confirm Cross-Species Migration' : heading}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close migration modal"
            className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 'configure' ? (
          <div className="p-6 space-y-4 text-xs">
            {/* Scope & Breakdown Card */}
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-[var(--barn-ink)]">
                  {isBulkAll
                    ? `Moving ALL ${animalsToMove.length} ${sourceSpecies} animals & all ${sourceSpecies} species records`
                    : `Moving ${animalsToMove.length} ${animalsToMove.length === 1 ? 'animal' : 'animals'} out of ${sourceSpecies}`}
                </div>
                {animalsToMove.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowFullAnimalList((v) => !v)}
                    className="text-[11px] font-medium text-[var(--barn-sage)] underline"
                  >
                    {showFullAnimalList ? 'Hide list' : `View all (${animalsToMove.length})`}
                  </button>
                )}
              </div>

              {statusBreakdown.length > 0 && (
                <div className="text-[11px] text-[var(--barn-muted)] font-mono">
                  Statuses included:{' '}
                  {statusBreakdown.map((s) => `${s.count} ${s.status}`).join(' · ')}
                </div>
              )}

              {showFullAnimalList ? (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] p-2 space-y-1 text-[11px]">
                  {animalsToMove.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-[var(--barn-ink)]">
                        {a.name}
                        {a.tattoo ? ` (${a.tattoo})` : ''}
                      </span>
                      <span className="text-[var(--barn-muted)] font-mono shrink-0">
                        {a.sex} · {a.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                animalsToMove.length > 0 && (
                  <div className="text-[var(--barn-muted)] leading-relaxed">
                    {animalsToMove
                      .slice(0, 6)
                      .map((a) => `${a.name}${a.tattoo ? ` (${a.tattoo})` : ''}`)
                      .join(', ')}
                    {animalsToMove.length > 6 ? `, and ${animalsToMove.length - 6} more` : ''}
                  </div>
                )
              )}
            </div>

            {/* Connected Pedigree Family Option for Multi-Select & Single Animal */}
            {!isBulkAll && (
              <label className="p-3.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeConnectedPedigree}
                  onChange={(e) => setIncludeConnectedPedigree(e.target.checked)}
                  className="mt-0.5 shrink-0"
                />
                <div className="space-y-1 leading-relaxed">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    Include connected pedigree family (parents, offspring &amp; linked co-parents)
                    {extraFamilyCount > 0 ? ` (+${extraFamilyCount} animals)` : ''}
                  </div>
                  <div className="text-[11px] text-[var(--barn-muted)]">
                    {extraFamilyCount > 0 ? (
                      <>
                        Selected: {familyExpansion.directIds.length}
                        {familyExpansion.ancestorIds.length > 0
                          ? ` · Parents/ancestors: +${familyExpansion.ancestorIds.length}`
                          : ''}
                        {familyExpansion.descendantIds.length > 0
                          ? ` · Offspring/descendants: +${familyExpansion.descendantIds.length}`
                          : ''}
                        {familyExpansion.linkedCoParentAndRelativeIds.length > 0
                          ? ` · Linked co-parents & their ancestors: +${familyExpansion.linkedCoParentAndRelativeIds.length}`
                          : ''}
                      </>
                    ) : (
                      'No additional parents, offspring, or co-parents found for this selection in this species.'
                    )}
                  </div>
                </div>
              </label>
            )}

            {/* Target Species Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="migration-target-species-select"
                  className="font-medium text-[var(--barn-ink)]"
                >
                  Target Livestock Species
                </label>
                <button
                  type="button"
                  onClick={() => setUseCustomInput((v) => !v)}
                  className="text-[11px] font-medium text-[var(--barn-sage)] underline"
                >
                  {useCustomInput ? 'Pick from species list' : 'Or type a custom species'}
                </button>
              </div>

              {useCustomInput ? (
                <input
                  id="migration-target-species-select"
                  type="text"
                  required
                  placeholder="e.g. Swine / Pig, Kunekune, Goat..."
                  value={customTarget}
                  onChange={(e) => setCustomTarget(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                />
              ) : (
                <select
                  id="migration-target-species-select"
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-medium"
                >
                  {targetOptions.map((opt) => (
                    <option key={opt.name} value={opt.name}>
                      {opt.name} — {opt.subtitle}
                    </option>
                  ))}
                </select>
              )}

              {isSameAsSource && (
                <p className="text-[var(--barn-danger)] font-medium">
                  Target species must be different from {sourceSpecies}.
                </p>
              )}
            </div>

            {previewResult && (
              <div className="p-3.5 rounded-xl bg-[var(--barn-sage-tint)]/45 border border-[var(--barn-sage)]/40 flex items-start gap-2.5 text-[var(--barn-muted)]">
                <Info className="w-4 h-4 text-[var(--barn-sage)] shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1 leading-relaxed">
                  <p>
                    Ready to review migration to{' '}
                    <strong className="text-[var(--barn-ink)]">{previewResult.targetSpecies}</strong>:
                    {' '}
                    {previewResult.animalsMigrated} animals
                    {previewResult.photosMigrated > 0
                      ? `, ${previewResult.photosMigrated} photos`
                      : ''}
                    {previewResult.careLogsMigrated > 0
                      ? `, ${previewResult.careLogsMigrated} logs`
                      : ''}
                    {previewResult.tasksMigrated > 0
                      ? `, ${previewResult.tasksMigrated} chores`
                      : ''}
                    {previewResult.breedingsMigrated > 0
                      ? `, ${previewResult.breedingsMigrated} breedings`
                      : ''}
                    {previewResult.cagesMigratedOrAdded > 0
                      ? `, ${previewResult.cagesMigratedOrAdded} cages`
                      : ''}
                    {previewResult.showsUpdated > 0
                      ? `, ${previewResult.showsUpdated} shows`
                      : ''}
                    .
                  </p>
                  <p className="text-[11px]">
                    Click <strong>Review &amp; Confirm</strong> next to verify everything that will
                    happen before any data changes.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--barn-border)]">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] px-4 py-2 rounded-lg border border-[var(--barn-border)] font-medium hover:bg-[var(--barn-subtle)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canProceed}
                onClick={() => {
                  setErrorMsg(null);
                  setStep('confirm');
                }}
                className="min-h-[40px] px-5 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold hover:opacity-95 disabled:opacity-45 disabled:pointer-events-none inline-flex items-center gap-1.5"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
                Review &amp; Confirm Migration
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-4 text-xs">
            {previewResult && (
              <>
                <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-sage)] space-y-2.5">
                  <div className="flex items-center gap-2 font-semibold text-sm text-[var(--barn-ink)]">
                    <CheckCircle2 className="w-4 h-4 text-[var(--barn-sage)] shrink-0" />
                    <span>
                      What will happen when migrating {sourceSpecies} → {previewResult.targetSpecies}
                    </span>
                  </div>

                  <ul className="space-y-1.5 text-[var(--barn-muted)] list-disc pl-5 leading-relaxed">
                    <li>
                      <strong className="text-[var(--barn-ink)]">
                        {previewResult.animalsMigrated} animal
                        {previewResult.animalsMigrated === 1 ? '' : 's'}
                      </strong>{' '}
                      {isBulkAll
                        ? `(100% of ${sourceSpecies} animals across ALL statuses: ${
                            statusBreakdown.map((s) => `${s.count} ${s.status}`).join(', ') || 'all'
                          })`
                        : includeConnectedPedigree && extraFamilyCount > 0
                          ? `(${familyExpansion.directIds.length} selected + ${extraFamilyCount} connected pedigree relatives: parents, offspring & linked co-parents)`
                          : ''}
                      {' '}will move from <strong className="text-[var(--barn-ink)]">{sourceSpecies}</strong> to{' '}
                      <strong className="text-[var(--barn-ink)]">{previewResult.targetSpecies}</strong>.
                    </li>

                    <li>
                      <strong className="text-[var(--barn-ink)]">Linked records moving:</strong>{' '}
                      {previewResult.photosMigrated} photos, {previewResult.careLogsMigrated} care/weight logs,{' '}
                      {previewResult.tasksMigrated} barn chores, {previewResult.breedingsMigrated} breeding
                      records, {previewResult.cagesMigratedOrAdded} cage/pen locations, and{' '}
                      {previewResult.showsUpdated} show entries.
                    </li>

                    {previewResult.createdTargetProfile ? (
                      <li>
                        A new <strong className="text-[var(--barn-ink)]">{previewResult.targetSpecies}</strong>{' '}
                        species hub &amp; breeding schedule will be created automatically.
                      </li>
                    ) : (
                      <li>
                        All migrated records will merge into your existing{' '}
                        <strong className="text-[var(--barn-ink)]">{previewResult.targetSpecies}</strong>{' '}
                        workspace (no duplicate animals created).
                      </li>
                    )}

                    <li>
                      <strong className="text-[var(--barn-ink)]">
                        After migration, {sourceSpecies} will have:
                      </strong>{' '}
                      {previewResult.remainingSourceAnimalsCount} remaining animal
                      {previewResult.remainingSourceAnimalsCount === 1 ? '' : 's'} and{' '}
                      {previewResult.remainingSourceRecordsCount} total remaining record
                      {previewResult.remainingSourceRecordsCount === 1 ? '' : 's'} (the{' '}
                      {sourceSpecies} species card &amp; schedule stay configured unless deleted).
                    </li>
                  </ul>
                </div>

                {(previewResult.splitParentLinksCount > 0 ||
                  previewResult.splitBreedingsCount > 0) && (
                  <div className="p-3.5 rounded-xl bg-[var(--barn-terracotta-tint)]/55 border border-[var(--barn-terracotta)]/50 flex items-start gap-2.5 text-[var(--barn-ink)]">
                    <AlertTriangle
                      className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="space-y-1 leading-relaxed text-[11px]">
                      {previewResult.splitParentLinksCount > 0 && (
                        <p>
                          <strong>{previewResult.splitParentLinksCount}</strong> moved animal(s) still
                          have a parent staying in {sourceSpecies}. Sire/Dam IDs stay preserved so
                          pedigrees reconnect if those parents are moved later.
                        </p>
                      )}
                      {previewResult.splitBreedingsCount > 0 && (
                        <p>
                          <strong>{previewResult.splitBreedingsCount}</strong> breeding record(s)
                          will stay in {sourceSpecies} because one parent is not included in this
                          migration.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {animalsToMove.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="font-medium text-[var(--barn-muted)]">
                      Animals included in this migration ({animalsToMove.length}):
                    </div>
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-2.5 space-y-1 text-[11px]">
                      {animalsToMove.map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium text-[var(--barn-ink)]">
                            {a.name}
                            {a.tattoo ? ` (${a.tattoo})` : ''}
                          </span>
                          <span className="text-[var(--barn-muted)] font-mono shrink-0">
                            {a.sex} · {a.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {errorMsg && (
              <div className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs font-medium">
                {errorMsg}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--barn-border)]">
              <button
                type="button"
                disabled={isMigrating}
                onClick={() => setStep('configure')}
                className="min-h-[40px] px-4 py-2 rounded-lg border border-[var(--barn-border)] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                Back
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isMigrating}
                  onClick={onClose}
                  className="min-h-[40px] px-4 py-2 rounded-lg border border-[var(--barn-border)] font-medium hover:bg-[var(--barn-subtle)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canProceed}
                  onClick={() => void handleConfirmExecute()}
                  className="min-h-[40px] px-5 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold hover:opacity-95 disabled:opacity-45 disabled:pointer-events-none inline-flex items-center gap-1.5"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  {isMigrating
                    ? 'Migrating...'
                    : `Confirm & Migrate to ${previewResult?.targetSpecies || effectiveTarget}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
