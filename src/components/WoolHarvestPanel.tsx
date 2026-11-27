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
} from '../domain/models';
import {
  compute90DayEquivalentGrams,
  computeDaysBetweenDateIso,
  computeIagarbScoreTotal,
  evaluateIagarbEligibility,
  IAGARB_JUDGING_POSITIONS,
  summarizeAnimalWoolHarvests,
} from '../domain/woolFiber';
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
