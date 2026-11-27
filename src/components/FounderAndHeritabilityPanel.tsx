/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Founder Loss, Ancestor Genetic Contribution & Heritability (h²) Analytics Panel.
 *
 * Embedded in Pedigree Explorer (`mode="pedigree"`) and Breeding Lab (`mode="breeding"`).
 */

import { ArrowRight, BarChart3, Dna, GitBranch, ShieldAlert, TrendingUp } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import {
  Animal,
  BreedingRecord,
  CareLog,
  formatWeight,
  SpeciesProfile,
  WeightUnit,
} from '../domain/models';
import {
  analyzeAnimalFounderContributions,
  analyzePairingFounderShift,
  analyzeSpeciesFounderLoss,
  analyzeSpeciesHeritabilityTrends,
  FounderStatusCode,
} from '../domain/pedigreeAnalytics';

interface FounderAndHeritabilityPanelProps {
  mode: 'pedigree' | 'breeding';
  speciesProfile: SpeciesProfile;
  animals: Animal[];
  herdById: Map<string, Animal>;
  breedings: BreedingRecord[];
  careLogs: CareLog[];
  subject?: Animal | null;
  selectedSire?: Animal | null;
  selectedDam?: Animal | null;
  preferredUnit?: WeightUnit;
  onSelectAnimal?: (animalId: string) => void;
}

type FounderFilterTab = 'all' | FounderStatusCode;

export function FounderAndHeritabilityPanel({
  mode,
  speciesProfile,
  animals,
  herdById,
  breedings,
  careLogs,
  subject,
  selectedSire,
  selectedDam,
  preferredUnit = 'lbs_oz',
  onSelectAnimal,
}: FounderAndHeritabilityPanelProps) {
  const [founderFilter, setFounderFilter] = useState<FounderFilterTab>('all');
  const [ancestorScope, setAncestorScope] = useState<'founders' | 'all_ancestors'>('founders');
  const [breedingTab, setBreedingTab] = useState<'heritability' | 'founder_loss'>('heritability');

  const founderLossReport = useMemo(
    () => analyzeSpeciesFounderLoss(animals, speciesProfile.name),
    [animals, speciesProfile.name]
  );

  const heritabilityReport = useMemo(
    () =>
      analyzeSpeciesHeritabilityTrends({
        animals,
        breedings,
        careLogs,
        speciesName: speciesProfile.name,
      }),
    [animals, breedings, careLogs, speciesProfile.name]
  );

  const subjectAnalysis = useMemo(() => {
    if (mode !== 'pedigree' || !subject) return null;
    return analyzeAnimalFounderContributions(subject, herdById);
  }, [mode, subject, herdById]);

  const pairingShift = useMemo(() => {
    if (mode !== 'breeding' || !selectedSire || !selectedDam) return null;
    return analyzePairingFounderShift(selectedSire, selectedDam, herdById);
  }, [mode, selectedSire, selectedDam, herdById]);

  const filteredLedger = useMemo(() => {
    if (founderFilter === 'all') return founderLossReport.founderLedger;
    return founderLossReport.founderLedger.filter((row) => row.status === founderFilter);
  }, [founderLossReport.founderLedger, founderFilter]);

  const statusTextColor = (status: FounderStatusCode): string => {
    if (status === 'Lost') return 'text-[var(--barn-danger)] font-semibold';
    if (status === 'Endangered') return 'text-[var(--barn-terracotta)] font-semibold';
    return 'text-[var(--barn-sage)] font-semibold';
  };

  const renderCohortSvgChart = () => {
    const cohorts = heritabilityReport.cohorts;
    if (cohorts.length < 2) {
      return (
        <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-muted)]">
          Record birth dates (`YYYY-MM-DD`) across at least 2 birth years to plot chronological
          Effective Founders (<span className="font-mono">fe</span>), Mean COI, and Weight{' '}
          <span className="font-mono">h²</span> trends.
        </div>
      );
    }

    const width = 640;
    const height = 190;
    const padL = 42;
    const padR = 42;
    const padT = 18;
    const padB = 30;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const maxFe = Math.max(
      4,
      ...cohorts.map((c) => c.meanEffectiveFoundersFe || 0)
    );
    const maxCoi = Math.max(
      12.5,
      ...cohorts.map((c) => c.meanCoiPercent || 0)
    );

    const xAt = (idx: number) =>
      cohorts.length === 1 ? padL + plotW / 2 : padL + (idx / (cohorts.length - 1)) * plotW;
    const yFe = (val: number) => padT + plotH - (Math.min(maxFe, val) / maxFe) * plotH;
    const yCoi = (val: number) => padT + plotH - (Math.min(maxCoi, val) / maxCoi) * plotH;
    const yH2 = (val: number) => padT + plotH - Math.min(1, Math.max(0, val)) * plotH;

    const fePoints = cohorts.map((c, i) => `${xAt(i).toFixed(1)},${yFe(c.meanEffectiveFoundersFe).toFixed(1)}`).join(' ');
    const coiPoints = cohorts.map((c, i) => `${xAt(i).toFixed(1)},${yCoi(c.meanCoiPercent).toFixed(1)}`).join(' ');
    const h2Coords = cohorts
      .map((c, i) =>
        c.cumulativeWeightH2 !== null
          ? `${xAt(i).toFixed(1)},${yH2(c.cumulativeWeightH2).toFixed(1)}`
          : null
      )
      .filter((pt): pt is string => pt !== null);

    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] p-3 overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`${speciesProfile.name} birth-year cohort trend chart for Effective Founders fe, Mean COI percent, and Cumulative Weight h-squared`}
            className="w-full min-w-[440px] h-[185px]"
          >
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const y = padT + plotH * (1 - frac);
              return (
                <g key={frac}>
                  <line
                    x1={padL}
                    x2={width - padR}
                    y1={y}
                    y2={y}
                    stroke="var(--barn-border)"
                    strokeWidth="1"
                    strokeDasharray={frac === 0 ? undefined : '3 3'}
                  />
                  <text
                    x={padL - 6}
                    y={y + 3}
                    textAnchor="end"
                    fontSize="10"
                    fill="var(--barn-muted)"
                    className="font-mono"
                  >
                    {(maxFe * frac).toFixed(1)}
                  </text>
                  <text
                    x={width - padR + 6}
                    y={y + 3}
                    textAnchor="start"
                    fontSize="10"
                    fill="var(--barn-muted)"
                    className="font-mono"
                  >
                    {(maxCoi * frac).toFixed(0)}%
                  </text>
                </g>
              );
            })}

            <polyline
              fill="none"
              stroke="var(--barn-sage)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={fePoints}
            />
            <polyline
              fill="none"
              stroke="var(--barn-terracotta)"
              strokeWidth="2"
              strokeDasharray="5 3"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={coiPoints}
            />
            {h2Coords.length >= 2 && (
              <polyline
                fill="none"
                stroke="var(--barn-slate)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={h2Coords.join(' ')}
              />
            )}

            {cohorts.map((c, i) => {
              const x = xAt(i);
              return (
                <g key={c.year}>
                  <circle cx={x} cy={yFe(c.meanEffectiveFoundersFe)} r="3.5" fill="var(--barn-sage)" />
                  <circle cx={x} cy={yCoi(c.meanCoiPercent)} r="3" fill="var(--barn-terracotta)" />
                  {c.cumulativeWeightH2 !== null && (
                    <rect
                      x={x - 3}
                      y={yH2(c.cumulativeWeightH2) - 3}
                      width="6"
                      height="6"
                      rx="1"
                      fill="var(--barn-slate)"
                    />
                  )}
                  <text
                    x={x}
                    y={height - 8}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--barn-muted)"
                    className="font-mono"
                  >
                    {c.year}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-[var(--barn-border)]/70 text-[11px] text-[var(--barn-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[var(--barn-sage)] inline-block" />
              Mean Effective Founders (<span className="font-mono">fe</span>, left axis)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[var(--barn-terracotta)] border-b border-dashed inline-block" />
              Mean Wright COI % (right axis)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[var(--barn-slate)] inline-block" />
              Cumulative Weight <span className="font-mono">h²</span> (0.00–1.00 normalized)
            </span>
          </div>
        </div>

        <div className="overflow-x-auto border border-[var(--barn-border)] rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--barn-subtle)] text-[var(--barn-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Birth Year</th>
                <th className="px-3 py-2 font-medium text-right">Stock</th>
                <th className="px-3 py-2 font-medium text-right">Mean fe</th>
                <th className="px-3 py-2 font-medium text-right">Mean COI</th>
                <th className="px-3 py-2 font-medium text-right">3-Gen Known</th>
                <th className="px-3 py-2 font-medium text-right">Cumulative Weight h²</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--barn-border)] font-mono tabular-nums">
              {cohorts.map((c) => (
                <tr key={c.year} className="hover:bg-[var(--barn-subtle)]/50">
                  <td className="px-3 py-2 font-semibold text-[var(--barn-ink)]">{c.year}</td>
                  <td className="px-3 py-2 text-right">{c.animalCount}</td>
                  <td className="px-3 py-2 text-right">
                    {c.meanEffectiveFoundersFe > 0 ? c.meanEffectiveFoundersFe.toFixed(2) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">{c.meanCoiPercent.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-right">{Math.round(c.meanKnownLineagePercent)}%</td>
                  <td className="px-3 py-2 text-right">
                    {c.cumulativeWeightH2 !== null
                      ? `${c.cumulativeWeightH2.toFixed(2)} (n=${c.weightPairCount})`
                      : 'Insufficient'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (mode === 'pedigree' && subject && subjectAnalysis) {
    const rows =
      ancestorScope === 'founders'
        ? subjectAnalysis.founders
        : subjectAnalysis.topAncestors.slice(0, 16);

    return (
      <section
        aria-label={`${subject.name} Founder Contributions & Species Diversity`}
        className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
              Founder Contributions &amp; Genetic Bottleneck Analysis
            </h2>
            <p className="text-xs text-[var(--barn-muted)] mt-0.5">
              Exact path-summed ancestor fractions (0.5^depth) and Lacy effective founders (
              <span className="font-mono">fe = 1 / Σpᵢ²</span>) for{' '}
              <strong className="text-[var(--barn-ink)]">{subject.name}</strong>
            </p>
          </div>

          <div className="inline-flex p-0.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
            <button
              type="button"
              aria-pressed={ancestorScope === 'founders'}
              onClick={() => setAncestorScope('founders')}
              className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                ancestorScope === 'founders'
                  ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                  : 'text-[var(--barn-muted)]'
              }`}
            >
              Founders ({subjectAnalysis.founders.length})
            </button>
            <button
              type="button"
              aria-pressed={ancestorScope === 'all_ancestors'}
              onClick={() => setAncestorScope('all_ancestors')}
              className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                ancestorScope === 'all_ancestors'
                  ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                  : 'text-[var(--barn-muted)]'
              }`}
            >
              Top Ancestors ({subjectAnalysis.topAncestors.length})
            </button>
          </div>
        </div>

        {/* 4-Metric Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
            <div className="text-[11px] text-[var(--barn-muted)]">Effective Founders (fe)</div>
            <div className="font-mono text-xl font-semibold tabular-nums mt-0.5">
              {subjectAnalysis.effectiveFoundersFe > 0
                ? subjectAnalysis.effectiveFoundersFe.toFixed(2)
                : '0.00'}
            </div>
            <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
              of {subjectAnalysis.knownFounderCount} known founders
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
            <div className="text-[11px] text-[var(--barn-muted)]">Founder Balance (fe / Nf)</div>
            <div className="font-mono text-xl font-semibold tabular-nums mt-0.5">
              {Math.round(subjectAnalysis.founderBalanceRatio * 100)}%
            </div>
            <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
              Top share: {subjectAnalysis.dominantFounderSharePercent.toFixed(1)}%
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
            <div className="text-[11px] text-[var(--barn-muted)]">Known vs Unknown Lineage</div>
            <div className="font-mono text-xl font-semibold tabular-nums mt-0.5">
              {subjectAnalysis.knownLineagePercent.toFixed(1)}%
            </div>
            <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
              {subjectAnalysis.unknownOriginPercent.toFixed(1)}% unrecorded branches
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
            <div className="text-[11px] text-[var(--barn-muted)]">
              {speciesProfile.name} Founder Loss
            </div>
            <div className="font-mono text-xl font-semibold tabular-nums mt-0.5">
              {founderLossReport.founderLossPercent.toFixed(0)}%
            </div>
            <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
              {founderLossReport.lostFoundersCount} lost · {founderLossReport.endangeredFoundersCount} endangered
            </div>
          </div>
        </div>

        {/* Ranked Ancestor Contribution Table */}
        {rows.length === 0 ? (
          <p className="text-xs text-[var(--barn-muted)]">
            {subject.name} has no recorded ancestors in the current {speciesProfile.name} herd map,
            so it registers as a base founder (100% own line). Link parents in the tree above to trace
            founder contributions.
          </p>
        ) : (
          <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl bg-[var(--barn-canvas)]/50">
            {rows.map((entry) => {
              const barWidth = Math.min(100, Math.max(2, entry.contributionPercent));
              return (
                <div
                  key={entry.animal.id}
                  className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="min-w-0 space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {onSelectAnimal ? (
                        <button
                          type="button"
                          onClick={() => onSelectAnimal(entry.animal.id)}
                          className="font-semibold text-[var(--barn-ink)] hover:text-[var(--barn-sage)] underline decoration-dotted underline-offset-2 truncate"
                        >
                          {entry.animal.name}
                        </button>
                      ) : (
                        <span className="font-semibold text-[var(--barn-ink)] truncate">
                          {entry.animal.name}
                        </span>
                      )}
                      {entry.animal.tattoo && (
                        <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                          {entry.animal.tattoo}
                        </span>
                      )}
                      <span className="text-[11px] text-[var(--barn-muted)]">
                        {entry.isFounder ? 'Founder' : `Gen ${entry.minDepth}`} ·{' '}
                        {entry.appearances} path{entry.appearances === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--barn-subtle)] overflow-hidden flex">
                      {entry.sireLinePercent > 0 && (
                        <div
                          className="h-full bg-[var(--barn-sage)]"
                          style={{
                            width: `${Math.min(100, (entry.sireLinePercent / Math.max(0.01, entry.contributionPercent)) * barWidth)}%`,
                          }}
                          title={`Sire line: ${entry.sireLinePercent.toFixed(1)}%`}
                        />
                      )}
                      {entry.damLinePercent > 0 && (
                        <div
                          className="h-full bg-[var(--barn-terracotta)]"
                          style={{
                            width: `${Math.min(100, (entry.damLinePercent / Math.max(0.01, entry.contributionPercent)) * barWidth)}%`,
                          }}
                          title={`Dam line: ${entry.damLinePercent.toFixed(1)}%`}
                        />
                      )}
                    </div>
                  </div>

                  <div className="text-right font-mono text-xs tabular-nums shrink-0 space-y-0.5">
                    <div className="font-semibold text-[var(--barn-ink)]">
                      {entry.contributionPercent.toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-[var(--barn-muted)]">
                      ♂ {entry.sireLinePercent.toFixed(1)}% · ♀ {entry.damLinePercent.toFixed(1)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label={`${speciesProfile.name} Heritability & Founder Loss Analytics`}
      className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
            Heritability (<span className="font-mono">h²</span>) Trends &amp; Founder-Loss Analytics
          </h2>
          <p className="text-xs text-[var(--barn-muted)] mt-0.5">
            Parent–offspring regression <span className="font-mono">h²</span> across recorded weights,
            ADG &amp; litter size, plus {speciesProfile.name.toLowerCase()} founder genome retention.
          </p>
        </div>

        <div className="inline-flex p-0.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] shrink-0">
          <button
            type="button"
            aria-pressed={breedingTab === 'heritability'}
            onClick={() => setBreedingTab('heritability')}
            className={`min-h-[34px] px-3 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              breedingTab === 'heritability'
                ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                : 'text-[var(--barn-muted)]'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
            Heritability (h²) Trends
          </button>
          <button
            type="button"
            aria-pressed={breedingTab === 'founder_loss'}
            onClick={() => setBreedingTab('founder_loss')}
            className={`min-h-[34px] px-3 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              breedingTab === 'founder_loss'
                ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                : 'text-[var(--barn-muted)]'
            }`}
          >
            <Dna className="w-3.5 h-3.5" aria-hidden="true" />
            Founder-Loss Ledger ({founderLossReport.totalFoundersCount})
          </button>
        </div>
      </div>

      {/* Projected Pairing Founder Shift Strip when Sire & Dam selected */}
      {pairingShift && (
        <div className="p-4 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/45 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-[var(--barn-ink)]">
              Projected Pairing Founder Diversity: {selectedSire?.name} × {selectedDam?.name}
            </div>
            <div className="font-mono text-xs tabular-nums text-[var(--barn-ink)]">
              Offspring fe:{' '}
              <strong>
                {pairingShift.projectedOffspring.effectiveFoundersFe.toFixed(2)}
              </strong>{' '}
              <span
                className={
                  pairingShift.feGainVsMeanParent >= 0
                    ? 'text-[var(--barn-sage)]'
                    : 'text-[var(--barn-terracotta)]'
                }
              >
                ({pairingShift.feGainVsMeanParent >= 0 ? '+' : ''}
                {pairingShift.feGainVsMeanParent.toFixed(2)} vs parent avg)
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
            <span>
              Shared founders: <strong className="text-[var(--barn-ink)]">{pairingShift.sharedFounderIds.length}</strong>
            </span>
            <span>
              Unique Sire founders: <strong className="text-[var(--barn-ink)]">{pairingShift.uniqueSireFounderIds.length}</strong>
            </span>
            <span>
              Unique Dam founders: <strong className="text-[var(--barn-ink)]">{pairingShift.uniqueDamFounderIds.length}</strong>
            </span>
            <span>
              Projected known lineage:{' '}
              <strong className="text-[var(--barn-ink)]">
                {pairingShift.projectedOffspring.knownLineagePercent.toFixed(1)}%
              </strong>
            </span>
          </div>
        </div>
      )}

      {breedingTab === 'heritability' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {heritabilityReport.traits.map((trait) => {
              const isWeight = trait.traitKey === 'weight_grams';
              const formatStat = (val: number | null) => {
                if (val === null) return '—';
                if (isWeight) return formatWeight(Math.round(val), preferredUnit);
                return `${val.toFixed(2)} ${trait.unitLabel}`;
              };
              return (
                <div
                  key={trait.traitKey}
                  className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-semibold text-[var(--barn-ink)]">{trait.label}</div>
                    <span className="font-mono text-[11px] text-[var(--barn-muted)] tabular-nums">
                      n={trait.pairCount}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-mono text-2xl font-semibold tabular-nums text-[var(--barn-ink)]">
                      {trait.heritabilityH2 !== null
                        ? `h² = ${trait.heritabilityH2.toFixed(2)}`
                        : 'Insufficient'}
                    </div>
                    {trait.rSquared !== null && (
                      <span className="font-mono text-[11px] text-[var(--barn-muted)] tabular-nums">
                        R²={trait.rSquared.toFixed(2)}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-[var(--barn-muted)] leading-snug">
                    {trait.confidenceNote}
                  </p>

                  {trait.meanOffspringValue !== null && trait.meanParentValue !== null && (
                    <div className="pt-2 border-t border-[var(--barn-border)]/70 flex justify-between gap-2 text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                      <span>Parent μ: {formatStat(trait.meanParentValue)}</span>
                      <span>Offspring μ: {formatStat(trait.meanOffspringValue)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {renderCohortSvgChart()}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <div className="text-[11px] text-[var(--barn-muted)]">Founder Loss Rate</div>
              <div className="font-mono text-xl font-semibold tabular-nums mt-0.5 text-[var(--barn-ink)]">
                {founderLossReport.founderLossPercent.toFixed(1)}%
              </div>
              <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
                {founderLossReport.lostFoundersCount} of {founderLossReport.totalFoundersCount} lost
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <div className="text-[11px] text-[var(--barn-muted)]">Pooled Active fe</div>
              <div className="font-mono text-xl font-semibold tabular-nums mt-0.5">
                {founderLossReport.pooledEffectiveFoundersFe.toFixed(2)}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
                {founderLossReport.activeAnimalsCount} active breeding stock
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <div className="text-[11px] text-[var(--barn-muted)]">Endangered Lines</div>
              <div className="font-mono text-xl font-semibold tabular-nums mt-0.5 text-[var(--barn-terracotta)]">
                {founderLossReport.endangeredFoundersCount}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)]">
                ≤1 active descendant or &lt;2% pool
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <div className="text-[11px] text-[var(--barn-muted)]">Top Bottleneck Line</div>
              <div className="text-sm font-semibold truncate mt-1">
                {founderLossReport.topBottleneckFounder?.founder.name || 'None'}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
                {founderLossReport.topBottleneckFounder
                  ? `${founderLossReport.topBottleneckFounder.meanActiveContributionPercent.toFixed(1)}% active pool share`
                  : 'No active contributions'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex p-0.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              {(
                [
                  ['all', `All (${founderLossReport.totalFoundersCount})`],
                  ['Lost', `Lost (${founderLossReport.lostFoundersCount})`],
                  ['Endangered', `Endangered (${founderLossReport.endangeredFoundersCount})`],
                  [
                    'Active Core',
                    `Active Core (${Math.max(
                      0,
                      founderLossReport.activeFoundersCount - founderLossReport.endangeredFoundersCount
                    )})`,
                  ],
                ] as const
              ).map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  type="button"
                  aria-pressed={founderFilter === tabKey}
                  onClick={() => setFounderFilter(tabKey)}
                  className={`min-h-[30px] px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    founderFilter === tabKey
                      ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                      : 'text-[var(--barn-muted)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {founderLossReport.endangeredFoundersCount > 0 && (
              <span className="text-[11px] text-[var(--barn-terracotta)] inline-flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
                Outcross endangered lines to avoid permanent founder loss
              </span>
            )}
          </div>

          {filteredLedger.length === 0 ? (
            <p className="text-xs text-[var(--barn-muted)] py-2">
              No {speciesProfile.name.toLowerCase()} founders match the selected status filter.
            </p>
          ) : (
            <div className="overflow-x-auto border border-[var(--barn-border)] rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--barn-subtle)] text-[var(--barn-muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Founder</th>
                    <th className="px-3 py-2 font-medium">Pool Status</th>
                    <th className="px-3 py-2 font-medium text-right">Active Desc.</th>
                    <th className="px-3 py-2 font-medium text-right">Mean Active Share</th>
                    <th className="px-3 py-2 font-medium text-right">Max Individual</th>
                    <th className="px-3 py-2 font-medium text-right">Historical</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--barn-border)]">
                  {filteredLedger.map((row) => (
                    <tr key={row.founder.id} className="hover:bg-[var(--barn-subtle)]/50">
                      <td className="px-3 py-2 font-medium">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-[180px] text-[var(--barn-ink)]">
                            {row.founder.name}
                          </span>
                          {row.founder.tattoo && (
                            <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                              {row.founder.tattoo}
                            </span>
                          )}
                          {onSelectAnimal && (
                            <button
                              type="button"
                              onClick={() => onSelectAnimal(row.founder.id)}
                              title={`Inspect ${row.founder.name}`}
                              aria-label={`Inspect ${row.founder.name}`}
                              className="text-[var(--barn-sage)] hover:opacity-80 inline-flex items-center"
                            >
                              <ArrowRight className="w-3 h-3" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className={`px-3 py-2 whitespace-nowrap ${statusTextColor(row.status)}`}>
                        {row.status}
                        {row.isActiveAnimalItself ? ' · Living' : ''}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {row.activeDescendantsCount}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {row.meanActiveContributionPercent.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {row.maxActiveContributionPercent.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--barn-muted)]">
                        {row.historicalDescendantsCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
