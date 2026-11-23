# Codebase Export: AskKim/Pedigree (Part 5 of 16)

- **Branch:** `main`
- **Commit:** `847f8ec8a2fc88e92ecb94065d96cf1277189c07`
- **Generated (UTC):** 2026-11-21 17:00:43 UTC
- **Files in this part:** 6 (`src/components/GrowthAndSurvivalLab.tsx` -> `src/components/PWAInstallButton.tsx`)
- **Index:** [index.md](./index.md)

---
## `src/components/GrowthAndSurvivalLab.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Species-Isolated Rate of Gain, Comparative Weight Charts & Litter Survival Curves Lab.
 *
 * Consumes pure domain math from `src/core/growthAnalytics.ts` to chart:
 * 1. Multi-select animal weight-at-age & Rate of Gain (ADG) on an age-in-days X-axis
 *    with user-configured target/goal weight overlays and native Barn Cohort Benchmarks.
 * 2. Maternal & sire litter survival rates (Live Birth %, Weaning Survival %) and seasonal
 *    3-week / 6-week / 8-week weight-gain milestones.
 */

import {
  Activity,
  Award,
  Check,
  Edit3,
  Plus,
  RotateCcw,
  Scale,
  Search,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  buildComparativeGrowthChartModel,
  evaluateLitterSurvivalAndMilestones,
  formatCompactWeightAxisTick,
  formatRateOfGain,
  GROWTH_CHART_COLORS,
  LitterSurvivalMetrics,
  ParentSurvivalPerformanceSummary,
} from '../core/growthAnalytics';
import {
  Animal,
  BarnSettings,
  BreedingRecord,
  formatReadableDate,
  formatSexForSpecies,
  formatWeight,
  formatWeightInputValue,
  getWeightInputMeta,
  isAnimalArchived,
  normalizeTargetWeightCurve,
  parseWeightInputToGrams,
  resolveSpeciesWeightUnit,
  TargetWeightPoint,
} from '../core/models';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';

interface GrowthAndSurvivalLabProps {
  activeData: ActiveSpeciesData;
  settings?: BarnSettings;
  preselectedAnimalIds?: string[] | null;
  onConsumePreselectedAnimalIds?: () => void;
  onSaveTargetWeightCurve?: (
    speciesId: string,
    curve: TargetWeightPoint[]
  ) => Promise<boolean> | boolean;
  onOpenBreedingOutcome?: (record: BreedingRecord) => void;
}

type LabTab = 'growth' | 'survival';
type ChartMetricMode = 'weight' | 'adg';
type SurvivalRole = 'dam' | 'sire';

interface InspectedChartPoint {
  animalId: string;
  animalName: string;
  color: string;
  ageDays: number;
  dateIso: string;
  weightGrams: number;
  segmentAdgGramsPerDay: number | null;
  label: string;
  source: 'care_log' | 'profile_weight';
}

interface InspectedSeasonPoint {
  seasonKey: string;
  littersBornCount: number;
  missedCount: number;
  liveBirthRatePct: number | null;
  weaningSurvivalRatePct: number | null;
  avg3WeekGrams: number | null;
  avg6WeekGrams: number | null;
  avg8WeekGrams: number | null;
}

export function GrowthAndSurvivalLab({
  activeData,
  settings,
  preselectedAnimalIds,
  onConsumePreselectedAnimalIds,
  onSaveTargetWeightCurve,
  onOpenBreedingOutcome,
}: GrowthAndSurvivalLabProps) {
  const { speciesProfile, animals, breedings, careLogs } = activeData;
  const sectionRef = useRef<HTMLElement | null>(null);
  const baseId = useId();
  const unit = useMemo(
    () =>
      resolveSpeciesWeightUnit(
        speciesProfile,
        settings ?? { preferredUnit: speciesProfile.preferredUnit || 'lbs_oz' }
      ),
    [speciesProfile, settings]
  );
  const weightMeta = useMemo(() => getWeightInputMeta(unit), [unit]);

  const [activeTab, setActiveTab] = useState<LabTab>('growth');
  const [chartMode, setChartMode] = useState<ChartMetricMode>('weight');
  const [showTargetCurve, setShowTargetCurve] = useState<boolean>(true);
  const [showCohortBenchmark, setShowCohortBenchmark] = useState<boolean>(true);
  const [animalSearch, setAnimalSearch] = useState<string>('');
  const [animalSexFilter, setAnimalSexFilter] = useState<'all' | 'Male' | 'Female'>('all');
  const [includeArchivedAnimals, setIncludeArchivedAnimals] = useState<boolean>(false);
  const [inspectedPoint, setInspectedPoint] = useState<InspectedChartPoint | null>(null);

  // Survival tab controls
  const [survivalRole, setSurvivalRole] = useState<SurvivalRole>('dam');
  const [seasonFilter, setSeasonFilter] = useState<string>('all');
  const [expandedParentKey, setExpandedParentKey] = useState<string | null>(null);
  const [inspectedSeason, setInspectedSeason] = useState<InspectedSeasonPoint | null>(null);

  // Target Curve Inline Editor
  const [editingTargetCurve, setEditingTargetCurve] = useState<boolean>(false);
  const [draftTargetPoints, setDraftTargetPoints] = useState<
    Array<{ id: string; ageDaysInput: string; weightInput: string; label: string }>
  >([]);
  const targetSaveLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });

  // Index weight log counts per animal for quick picker badges/presets
  const weightLogCountByAnimalId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of careLogs) {
      if (log.weightGrams <= 0) continue;
      counts.set(log.animalId, (counts.get(log.animalId) || 0) + 1);
    }
    return counts;
  }, [careLogs]);

  // Default smart initial selection: up to 4 animals in the active species with birthDate & weigh-ins
  const defaultAnimalIds = useMemo(() => {
    const scored = animals
      .filter((a) => !isAnimalArchived(a))
      .map((a) => ({
        animal: a,
        logsCount: weightLogCountByAnimalId.get(a.id) || 0,
        hasWeight: a.weightGrams > 0,
        hasDob: Boolean(a.birthDateIso),
      }))
      .filter((x) => x.hasDob && (x.logsCount > 0 || x.hasWeight))
      .sort(
        (a, b) =>
          b.logsCount - a.logsCount ||
          (b.animal.birthDateIso || '').localeCompare(a.animal.birthDateIso || '') ||
          a.animal.name.localeCompare(b.animal.name)
      );
    return scored.slice(0, 4).map((x) => x.animal.id);
  }, [animals, weightLogCountByAnimalId]);

  const [selectedAnimalIds, setSelectedAnimalIds] = useState<string[]>(defaultAnimalIds);

  // Re-initialize cleanly when switching species
  useEffect(() => {
    setSelectedAnimalIds(defaultAnimalIds);
    setAnimalSearch('');
    setAnimalSexFilter('all');
    setInspectedPoint(null);
    setSeasonFilter('all');
    setExpandedParentKey(null);
    setInspectedSeason(null);
    setEditingTargetCurve(false);
  }, [speciesProfile.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Consume external pre-selection (e.g. from HerdScreen "Compare Rate of Gain")
  useEffect(() => {
    if (!preselectedAnimalIds || preselectedAnimalIds.length === 0) return;
    const validIds = preselectedAnimalIds.filter((id) => animals.some((a) => a.id === id));
    if (validIds.length > 0) {
      setActiveTab('growth');
      setSelectedAnimalIds(validIds.slice(0, 8));
      setInspectedPoint(null);
      if (sectionRef.current && typeof sectionRef.current.scrollIntoView === 'function') {
        sectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    onConsumePreselectedAnimalIds?.();
  }, [preselectedAnimalIds, animals, onConsumePreselectedAnimalIds]);

  const selectedIdSet = useMemo(() => new Set(selectedAnimalIds), [selectedAnimalIds]);

  const candidateAnimals = useMemo(() => {
    const q = animalSearch.trim().toLowerCase();
    return animals
      .filter((a) => {
        if (!includeArchivedAnimals && isAnimalArchived(a) && !selectedIdSet.has(a.id)) {
          return false;
        }
        if (animalSexFilter !== 'all' && a.sex !== animalSexFilter) return false;
        if (!q) return true;
        return (
          a.name.toLowerCase().includes(q) ||
          (a.tattoo || '').toLowerCase().includes(q) ||
          (a.breed || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aSel = selectedIdSet.has(a.id) ? 1 : 0;
        const bSel = selectedIdSet.has(b.id) ? 1 : 0;
        if (aSel !== bSel) return bSel - aSel;
        const aLogs = weightLogCountByAnimalId.get(a.id) || 0;
        const bLogs = weightLogCountByAnimalId.get(b.id) || 0;
        if (aLogs !== bLogs) return bLogs - aLogs;
        return a.name.localeCompare(b.name);
      });
  }, [
    animals,
    includeArchivedAnimals,
    selectedIdSet,
    animalSexFilter,
    animalSearch,
    weightLogCountByAnimalId,
  ]);

  const toggleAnimalSelection = (animalId: string) => {
    setInspectedPoint(null);
    setSelectedAnimalIds((prev) => {
      if (prev.includes(animalId)) {
        return prev.filter((id) => id !== animalId);
      }
      if (prev.length >= 8) {
        return [...prev.slice(1), animalId];
      }
      return [...prev, animalId];
    });
  };

  const applyPresetSelection = (preset: 'multi' | 'juniors' | 'littermates' | 'clear') => {
    setInspectedPoint(null);
    if (preset === 'clear') {
      setSelectedAnimalIds([]);
      return;
    }
    if (preset === 'multi') {
      const ids = animals
        .filter((a) => (weightLogCountByAnimalId.get(a.id) || 0) >= 2 && Boolean(a.birthDateIso))
        .sort(
          (a, b) =>
            (weightLogCountByAnimalId.get(b.id) || 0) -
            (weightLogCountByAnimalId.get(a.id) || 0)
        )
        .slice(0, 6)
        .map((a) => a.id);
      setSelectedAnimalIds(ids);
      return;
    }
    if (preset === 'juniors') {
      const ids = animals
        .filter((a) => !isAnimalArchived(a) && a.status === 'Junior' && Boolean(a.birthDateIso))
        .slice(0, 6)
        .map((a) => a.id);
      setSelectedAnimalIds(ids);
      return;
    }
    if (preset === 'littermates') {
      // Find largest group of animals sharing (damId + birthDateIso)
      const groups = new Map<string, Animal[]>();
      for (const a of animals) {
        if (!a.birthDateIso || !a.damId) continue;
        const key = `${a.damId}::${a.birthDateIso}`;
        const list = groups.get(key) || [];
        list.push(a);
        groups.set(key, list);
      }
      const best = Array.from(groups.values()).sort((a, b) => b.length - a.length)[0];
      if (best && best.length > 0) {
        setSelectedAnimalIds(best.slice(0, 8).map((a) => a.id));
      }
    }
  };

  const chartModel = useMemo(
    () =>
      buildComparativeGrowthChartModel({
        animals,
        selectedAnimalIds,
        careLogs,
        speciesProfile,
        includeCohortBenchmark: showCohortBenchmark,
      }),
    [animals, selectedAnimalIds, careLogs, speciesProfile, showCohortBenchmark]
  );

  // Full survival evaluation (unfiltered first so seasonal dropdown has all seasons)
  const fullSurvivalEval = useMemo(
    () =>
      evaluateLitterSurvivalAndMilestones({
        speciesProfile,
        breedings,
        animals,
        careLogs,
      }),
    [speciesProfile, breedings, animals, careLogs]
  );

  const survivalEval = useMemo(() => {
    if (seasonFilter === 'all') return fullSurvivalEval;
    return evaluateLitterSurvivalAndMilestones({
      speciesProfile,
      breedings,
      animals,
      careLogs,
      seasonFilter,
    });
  }, [fullSurvivalEval, speciesProfile, breedings, animals, careLogs, seasonFilter]);

  const openTargetEditor = () => {
    const existing = normalizeTargetWeightCurve(speciesProfile.targetWeightCurve);
    if (existing.length > 0) {
      setDraftTargetPoints(
        existing.map((pt, idx) => ({
          id: `tp-${idx}-${pt.ageDays}`,
          ageDaysInput: String(pt.ageDays),
          weightInput: formatWeightInputValue(pt.weightGrams, unit),
          label: pt.label || '',
        }))
      );
    } else {
      const weanDay = Math.max(21, speciesProfile.weanDaysAfterBirth || 42);
      setDraftTargetPoints([
        { id: 'tp-new-1', ageDaysInput: '21', weightInput: '', label: '3-Week Target' },
        {
          id: 'tp-new-2',
          ageDaysInput: String(weanDay),
          weightInput: '',
          label: 'Weaning Target',
        },
        { id: 'tp-new-3', ageDaysInput: '56', weightInput: '', label: '8-Week Target' },
      ]);
    }
    setEditingTargetCurve(true);
  };

  const handleSaveTargetCurve = async () => {
    if (!onSaveTargetWeightCurve) return;
    await targetSaveLock.runLocked(async () => {
      const points: TargetWeightPoint[] = [];
      for (const row of draftTargetPoints) {
        const ageDays = Number(row.ageDaysInput);
        const weightGrams = parseWeightInputToGrams(row.weightInput, unit);
        if (!Number.isFinite(ageDays) || ageDays < 0 || weightGrams <= 0) continue;
        points.push({
          ageDays: Math.round(ageDays),
          weightGrams,
          ...(row.label.trim() ? { label: row.label.trim() } : {}),
        });
      }
      const ok = await onSaveTargetWeightCurve(speciesProfile.id, points);
      if (ok) {
        setEditingTargetCurve(false);
        setShowTargetCurve(true);
      }
    });
  };

  // SVG Chart Geometry for Comparative Growth & ADG
  const chartGeom = useMemo(() => {
    const width = 760;
    const height = 310;
    const padL = 62;
    const padR = 24;
    const padT = 22;
    const padB = 42;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const minAge = chartModel.minAgeDays;
    const maxAge = Math.max(minAge + 7, chartModel.maxAgeDays);
    const xOfAge = (age: number) => padL + ((age - minAge) / Math.max(1, maxAge - minAge)) * plotW;

    const yMin = chartMode === 'weight' ? 0 : Math.min(0, chartModel.minAdgGramsPerDay * 1.1);
    const yMaxRaw =
      chartMode === 'weight'
        ? chartModel.maxWeightGrams * 1.12
        : Math.max(10, chartModel.maxAdgGramsPerDay * 1.15);
    const yMax = yMaxRaw > yMin ? yMaxRaw : yMin + 10;

    const yOfVal = (val: number) =>
      padT + plotH - ((val - yMin) / Math.max(0.001, yMax - yMin)) * plotH;

    const xTicks: number[] = [];
    const ageSpan = maxAge - minAge;
    const step = ageSpan <= 60 ? 14 : ageSpan <= 140 ? 21 : ageSpan <= 280 ? 30 : 60;
    for (let a = 0; a <= maxAge; a += step) {
      xTicks.push(a);
    }
    if (xTicks[xTicks.length - 1] !== maxAge) {
      xTicks.push(maxAge);
    }

    const yTicks: number[] = [];
    for (let i = 0; i <= 4; i += 1) {
      yTicks.push(yMin + ((yMax - yMin) * i) / 4);
    }

    return { width, height, padL, padR, padT, padB, plotW, plotH, xOfAge, yOfVal, xTicks, yTicks };
  }, [chartModel, chartMode]);

  const seriesWithoutBirthDate = useMemo(
    () => chartModel.series.filter((s) => !s.hasBirthDate),
    [chartModel.series]
  );
  const seriesWithNoWeights = useMemo(
    () => chartModel.series.filter((s) => s.hasBirthDate && s.points.length === 0),
    [chartModel.series]
  );

  const plottedSeries = useMemo(
    () =>
      chartModel.series.map((s, idx) => ({
        ...s,
        color: GROWTH_CHART_COLORS[idx % GROWTH_CHART_COLORS.length],
      })),
    [chartModel.series]
  );

  const parentSummaries: ParentSurvivalPerformanceSummary[] =
    survivalRole === 'dam' ? survivalEval.damSummaries : survivalEval.sireSummaries;
  const roleLabel =
    survivalRole === 'dam' ? speciesProfile.femaleLabel : speciesProfile.maleLabel;

  const activeParentSummary = useMemo(() => {
    if (!expandedParentKey) return parentSummaries[0] ?? null;
    return (
      parentSummaries.find((p) => `${p.role}-${p.parentId || p.parentName}` === expandedParentKey) ??
      parentSummaries[0] ??
      null
    );
  }, [parentSummaries, expandedParentKey]);

  const seasonChartGeom = useMemo(() => {
    const seasons = survivalEval.seasonalSummaries;
    const width = 760;
    const height = 240;
    const padL = 48;
    const padR = 48;
    const padT = 20;
    const padB = 42;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const count = Math.max(1, seasons.length);
    const xAt = (idx: number) =>
      count === 1 ? padL + plotW / 2 : padL + (idx / (count - 1)) * plotW;
    const yPct = (pct: number) => padT + plotH - (Math.max(0, Math.min(100, pct)) / 100) * plotH;
    return { seasons, width, height, padL, padR, padT, padB, plotW, plotH, xAt, yPct };
  }, [survivalEval.seasonalSummaries]);

  const renderSurvivalLitterMilestoneBadges = (litter: LitterSurvivalMetrics) => {
    if (litter.milestones.length === 0) {
      return <span className="text-[var(--barn-muted)]">No weigh milestones</span>;
    }
    return litter.milestones.map((m, idx) => (
      <span key={m.id} className="font-mono tabular-nums">
        {idx > 0 ? ' · ' : ''}
        {m.ageDays}d avg {formatWeight(m.avgWeightGrams, unit)}
        {m.source === 'offspring_logs' ? ' (logs)' : ''}
      </span>
    ));
  };

  return (
    <section
      ref={sectionRef}
      aria-labelledby={`${baseId}-heading`}
      className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-5"
    >
      {/* Header + Segmented View Switch */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--barn-border)] pb-4">
        <div className="space-y-1">
          <h2 id={`${baseId}-heading`} className="font-display text-xl font-semibold">
            {speciesProfile.name} Rate of Gain &amp; Litter Survival Analytics
          </h2>
          <p className="text-xs text-[var(--barn-muted)]">
            Compare individual growth curves against your barn cohort or custom goal curve, and
            track seasonal {speciesProfile.femaleLabel.toLowerCase()} /{' '}
            {speciesProfile.maleLabel.toLowerCase()} litter survival &amp; weaning weights.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Growth and survival analytics tabs"
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] self-start shrink-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'growth'}
            onClick={() => setActiveTab('growth')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'growth'
                ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
            Comparative Rate of Gain
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'survival'}
            onClick={() => setActiveTab('survival')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'survival'
                ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" aria-hidden="true" />
            Litter Survival &amp; Parent Curves
          </button>
        </div>
      </div>

      {/* TAB 1: COMPARATIVE RATE OF GAIN & WEIGHT-AT-AGE */}
      {activeTab === 'growth' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 4 cols: Multi-Select Animal Picker & Curve Overlays */}
          <div className="lg:col-span-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-[var(--barn-muted)]">
                  Select {speciesProfile.name}s to Compare ({selectedAnimalIds.length}/8)
                </h3>
                {selectedAnimalIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => applyPresetSelection('clear')}
                    className="text-[11px] font-medium text-[var(--barn-muted)] hover:text-[var(--barn-ink)] underline"
                  >
                    Clear Selection
                  </button>
                )}
              </div>

              {/* Quick selection presets */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => applyPresetSelection('multi')}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap"
                >
                  Multi-Weighed
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetSelection('juniors')}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap"
                >
                  Active Juniors
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetSelection('littermates')}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap"
                >
                  Largest Litter Cohort
                </button>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search
                    className="w-3.5 h-3.5 text-[var(--barn-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    aria-label={`Search ${speciesProfile.name}s for growth chart`}
                    placeholder="Filter name, ID, breed..."
                    value={animalSearch}
                    onChange={(e) => setAnimalSearch(e.target.value)}
                    className="w-full min-h-[36px] pl-8 pr-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                  />
                </div>
                <select
                  aria-label="Filter comparison candidates by sex"
                  value={animalSexFilter}
                  onChange={(e) =>
                    setAnimalSexFilter(e.target.value as 'all' | 'Male' | 'Female')
                  }
                  className="min-h-[36px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                >
                  <option value="all">All Sexes</option>
                  <option value="Male">{speciesProfile.maleLabel}</option>
                  <option value="Female">{speciesProfile.femaleLabel}</option>
                </select>
              </div>

              <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--barn-muted)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeArchivedAnimals}
                  onChange={(e) => setIncludeArchivedAnimals(e.target.checked)}
                  className="accent-[var(--barn-sage)]"
                />
                Include Archived / Sold / Past Stock
              </label>

              <div className="max-h-64 overflow-y-auto divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl bg-[var(--barn-canvas)]">
                {candidateAnimals.length === 0 ? (
                  <div className="p-4 text-xs text-[var(--barn-muted)] text-center">
                    No {speciesProfile.name.toLowerCase()} records match this filter.
                  </div>
                ) : (
                  candidateAnimals.map((a) => {
                    const isSelected = selectedIdSet.has(a.id);
                    const seriesIdx = selectedAnimalIds.indexOf(a.id);
                    const swatch =
                      seriesIdx >= 0
                        ? GROWTH_CHART_COLORS[seriesIdx % GROWTH_CHART_COLORS.length]
                        : undefined;
                    const logsCount = weightLogCountByAnimalId.get(a.id) || 0;
                    const hasData = logsCount > 0 || a.weightGrams > 0;
                    return (
                      <label
                        key={a.id}
                        className={`flex items-center justify-between gap-2 px-3 py-2 text-xs cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[var(--barn-sage-tint)]/65'
                            : 'hover:bg-[var(--barn-subtle)]/40'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleAnimalSelection(a.id)}
                            className="accent-[var(--barn-sage)] shrink-0"
                          />
                          {swatch && (
                            <span
                              aria-hidden="true"
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: swatch }}
                            />
                          )}
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {a.name}{' '}
                              {a.tattoo && (
                                <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                                  ({a.tattoo})
                                </span>
                              )}
                            </div>
                            <div className="text-[10.5px] text-[var(--barn-muted)] truncate">
                              {formatSexForSpecies(a.sex, speciesProfile)}
                              {' · '}
                              {a.birthDateIso ? `DOB ${formatReadableDate(a.birthDateIso)}` : 'No DOB'}
                            </div>
                          </div>
                        </div>
                        <span className="font-mono tabular-nums text-[10.5px] text-[var(--barn-muted)] shrink-0">
                          {logsCount > 0
                            ? `${logsCount} log${logsCount === 1 ? '' : 's'}`
                            : hasData
                            ? formatWeight(a.weightGrams, unit)
                            : 'No wt'}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Overlay Controls & User-Defined Goal Curve Editor */}
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">Reference Curve Overlays</span>
                {onSaveTargetWeightCurve && (
                  <button
                    type="button"
                    onClick={() =>
                      editingTargetCurve ? setEditingTargetCurve(false) : openTargetEditor()
                    }
                    className="text-[11px] font-medium text-[var(--barn-sage)] hover:underline inline-flex items-center gap-1"
                  >
                    <Edit3 className="w-3 h-3" aria-hidden="true" />
                    {editingTargetCurve ? 'Close Editor' : 'Edit Goal Curve'}
                  </button>
                )}
              </div>

              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span>Barn Cohort Benchmark (7-day mean)</span>
                <input
                  type="checkbox"
                  checked={showCohortBenchmark}
                  onChange={(e) => setShowCohortBenchmark(e.target.checked)}
                  className="accent-[var(--barn-sage)]"
                />
              </label>

              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span>
                  {speciesProfile.name} Target / Goal Curve ({chartModel.targetCurve.length} pts)
                </span>
                <input
                  type="checkbox"
                  checked={showTargetCurve}
                  onChange={(e) => setShowTargetCurve(e.target.checked)}
                  className="accent-[var(--barn-sage)]"
                />
              </label>

              {editingTargetCurve && (
                <div className="pt-2 border-t border-[var(--barn-border)] space-y-2">
                  <p className="text-[11px] text-[var(--barn-muted)]">
                    Define your own goal weight checkpoints ({weightMeta.shortUnit}) by age in days
                    for {speciesProfile.name}.
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                    {draftTargetPoints.map((row, idx) => (
                      <div key={row.id} className="grid grid-cols-12 gap-1.5 items-center">
                        <input
                          type="number"
                          min={0}
                          max={2000}
                          placeholder="Days"
                          aria-label={`Goal checkpoint ${idx + 1} age in days`}
                          value={row.ageDaysInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDraftTargetPoints((prev) =>
                              prev.map((r) => (r.id === row.id ? { ...r, ageDaysInput: val } : r))
                            );
                          }}
                          className="col-span-3 min-h-[34px] px-2 py-1 rounded-md bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-xs tabular-nums"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder={weightMeta.shortUnit}
                          aria-label={`Goal checkpoint ${idx + 1} weight in ${weightMeta.shortUnit}`}
                          value={row.weightInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDraftTargetPoints((prev) =>
                              prev.map((r) => (r.id === row.id ? { ...r, weightInput: val } : r))
                            );
                          }}
                          className="col-span-4 min-h-[34px] px-2 py-1 rounded-md bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-xs tabular-nums"
                        />
                        <input
                          type="text"
                          placeholder="Label"
                          aria-label={`Goal checkpoint ${idx + 1} label`}
                          value={row.label}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDraftTargetPoints((prev) =>
                              prev.map((r) => (r.id === row.id ? { ...r, label: val } : r))
                            );
                          }}
                          className="col-span-4 min-h-[34px] px-2 py-1 rounded-md bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setDraftTargetPoints((prev) => prev.filter((r) => r.id !== row.id))
                          }
                          aria-label={`Remove checkpoint ${idx + 1}`}
                          className="col-span-1 min-h-[34px] flex items-center justify-center rounded-md text-[var(--barn-muted)] hover:text-[var(--barn-danger)]"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setDraftTargetPoints((prev) => [
                          ...prev,
                          {
                            id: `tp-${Date.now()}-${prev.length}`,
                            ageDaysInput: '',
                            weightInput: '',
                            label: '',
                          },
                        ])
                      }
                      className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium inline-flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" aria-hidden="true" />
                      Add Age Point
                    </button>
                    <button
                      type="button"
                      disabled={targetSaveLock.isSubmitting}
                      onClick={() => void handleSaveTargetCurve()}
                      className="min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-55"
                    >
                      <Check className="w-3 h-3" aria-hidden="true" />
                      {targetSaveLock.isSubmitting ? 'Saving...' : 'Save Goal Curve'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right 8 cols: Interactive Age-in-Days Chart + Comparative Table */}
          <div className="lg:col-span-8 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                <button
                  type="button"
                  onClick={() => setChartMode('weight')}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${
                    chartMode === 'weight'
                      ? 'bg-[var(--barn-surface)] text-[var(--barn-ink)] border border-[var(--barn-border)]'
                      : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  Weight at Age ({weightMeta.shortUnit})
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode('adg')}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${
                    chartMode === 'adg'
                      ? 'bg-[var(--barn-surface)] text-[var(--barn-ink)] border border-[var(--barn-border)]'
                      : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  Rate of Gain (ADG)
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--barn-muted)]">
                {showCohortBenchmark && chartModel.cohortCurve.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-4 border-t-2 border-dotted border-[var(--barn-muted)]" />
                    Barn Cohort Avg
                  </span>
                )}
                {showTargetCurve && chartModel.targetCurve.length > 0 && chartMode === 'weight' && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-4 border-t-2 border-dashed border-[var(--barn-terracotta)]" />
                    Target Curve
                  </span>
                )}
              </div>
            </div>

            {/* Interactive SVG Plot */}
            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2">
              {plottedSeries.every((s) => s.points.length === 0) &&
              !(showTargetCurve && chartModel.targetCurve.length > 0 && chartMode === 'weight') &&
              !(showCohortBenchmark && chartModel.cohortCurve.length > 0 && chartMode === 'weight') ? (
                <div className="py-14 px-4 text-center space-y-2">
                  <Scale
                    className="w-7 h-7 mx-auto text-[var(--barn-muted)]/70"
                    aria-hidden="true"
                  />
                  <div className="text-sm font-medium text-[var(--barn-ink)]">
                    No weight-at-age data plotted yet
                  </div>
                  <p className="text-xs text-[var(--barn-muted)] max-w-md mx-auto">
                    Select {speciesProfile.name.toLowerCase()}s with a Birth Date and logged Weight
                    Checks in Herd (or define a Target Goal Curve on the left) to chart growth rate
                    trajectories.
                  </p>
                </div>
              ) : (
                <svg
                  viewBox={`0 0 ${chartGeom.width} ${chartGeom.height}`}
                  role="img"
                  aria-label={`${speciesProfile.name} ${
                    chartMode === 'weight' ? 'Comparative Weight at Age' : 'Rate of Gain ADG'
                  } chart`}
                  className="w-full h-auto overflow-visible select-none"
                >
                  {/* Horizontal Grid Lines + Y-Axis Labels */}
                  {chartGeom.yTicks.map((tick, idx) => {
                    const y = chartGeom.yOfVal(tick);
                    const tickText =
                      chartMode === 'weight'
                        ? formatCompactWeightAxisTick(tick, unit)
                        : `${tick.toFixed(1)} g/d`;
                    return (
                      <g key={`y-${idx}`}>
                        <line
                          x1={chartGeom.padL}
                          y1={y}
                          x2={chartGeom.width - chartGeom.padR}
                          y2={y}
                          stroke="var(--barn-border)"
                          strokeWidth="1"
                          opacity="0.7"
                        />
                        <text
                          x={chartGeom.padL - 8}
                          y={y + 3.5}
                          textAnchor="end"
                          fontSize="10"
                          fontFamily="monospace"
                          fill="var(--barn-muted)"
                        >
                          {tickText}
                        </text>
                      </g>
                    );
                  })}

                  {/* Zero reference line in ADG mode when negative gains occur */}
                  {chartMode === 'adg' && chartModel.minAdgGramsPerDay < 0 && (
                    <line
                      x1={chartGeom.padL}
                      y1={chartGeom.yOfVal(0)}
                      x2={chartGeom.width - chartGeom.padR}
                      y2={chartGeom.yOfVal(0)}
                      stroke="var(--barn-muted)"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                  )}

                  {/* Vertical Grid Lines + X-Axis Age-in-Days Labels */}
                  {chartGeom.xTicks.map((age) => {
                    const x = chartGeom.xOfAge(age);
                    return (
                      <g key={`x-${age}`}>
                        <line
                          x1={x}
                          y1={chartGeom.padT}
                          x2={x}
                          y2={chartGeom.height - chartGeom.padB}
                          stroke="var(--barn-border)"
                          strokeWidth="1"
                          opacity="0.45"
                        />
                        <text
                          x={x}
                          y={chartGeom.height - chartGeom.padB + 16}
                          textAnchor="middle"
                          fontSize="10"
                          fontFamily="monospace"
                          fill="var(--barn-muted)"
                        >
                          {age}d
                        </text>
                      </g>
                    );
                  })}

                  {/* X-Axis Caption */}
                  <text
                    x={chartGeom.padL + chartGeom.plotW / 2}
                    y={chartGeom.height - 6}
                    textAnchor="middle"
                    fontSize="10.5"
                    fill="var(--barn-muted)"
                  >
                    Age (Days from Birth)
                  </text>

                  {/* Barn Cohort Benchmark Overlay (Weight Mode) */}
                  {chartMode === 'weight' &&
                    showCohortBenchmark &&
                    chartModel.cohortCurve.length >= 1 && (
                      <g>
                        {chartModel.cohortCurve.length >= 2 && (
                          <polyline
                            fill="none"
                            stroke="var(--barn-muted)"
                            strokeWidth="2"
                            strokeDasharray="2 4"
                            opacity="0.85"
                            points={chartModel.cohortCurve
                              .map(
                                (c) =>
                                  `${chartGeom.xOfAge(c.ageDays).toFixed(1)},${chartGeom
                                    .yOfVal(c.meanWeightGrams)
                                    .toFixed(1)}`
                              )
                              .join(' ')}
                          />
                        )}
                        {chartModel.cohortCurve.length === 1 && (
                          <circle
                            cx={chartGeom.xOfAge(chartModel.cohortCurve[0].ageDays)}
                            cy={chartGeom.yOfVal(chartModel.cohortCurve[0].meanWeightGrams)}
                            r="3.5"
                            fill="var(--barn-muted)"
                          />
                        )}
                      </g>
                    )}

                  {/* Target / Goal Curve Overlay (Weight Mode) */}
                  {chartMode === 'weight' &&
                    showTargetCurve &&
                    chartModel.targetCurve.length >= 1 && (
                      <g>
                        {chartModel.targetCurve.length >= 2 && (
                          <polyline
                            fill="none"
                            stroke="#b85d3b"
                            strokeWidth="2.2"
                            strokeDasharray="6 4"
                            points={chartModel.targetCurve
                              .map(
                                (t) =>
                                  `${chartGeom.xOfAge(t.ageDays).toFixed(1)},${chartGeom
                                    .yOfVal(t.weightGrams)
                                    .toFixed(1)}`
                              )
                              .join(' ')}
                          />
                        )}
                        {chartModel.targetCurve.map((t) => (
                          <rect
                            key={`goal-${t.ageDays}`}
                            x={chartGeom.xOfAge(t.ageDays) - 3}
                            y={chartGeom.yOfVal(t.weightGrams) - 3}
                            width="6"
                            height="6"
                            fill="#b85d3b"
                          />
                        ))}
                      </g>
                    )}

                  {/* Animal Series Lines & Interactive Points */}
                  {plottedSeries.map((s) => {
                    const plotPts =
                      chartMode === 'weight'
                        ? s.points.map((pt) => ({
                            pt,
                            val: pt.weightGrams,
                          }))
                        : s.points
                            .filter((pt) => pt.segmentAdgGramsPerDay !== null)
                            .map((pt) => ({
                              pt,
                              val: pt.segmentAdgGramsPerDay ?? 0,
                            }));

                    if (plotPts.length === 0) return null;

                    return (
                      <g key={s.animal.id}>
                        {plotPts.length >= 2 && (
                          <polyline
                            fill="none"
                            stroke={s.color}
                            strokeWidth="2.5"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            points={plotPts
                              .map(
                                ({ pt, val }) =>
                                  `${chartGeom.xOfAge(pt.ageDays).toFixed(1)},${chartGeom
                                    .yOfVal(val)
                                    .toFixed(1)}`
                              )
                              .join(' ')}
                          />
                        )}
                        {plotPts.map(({ pt, val }) => {
                          const cx = chartGeom.xOfAge(pt.ageDays);
                          const cy = chartGeom.yOfVal(val);
                          const isActive =
                            inspectedPoint?.animalId === s.animal.id &&
                            inspectedPoint.ageDays === pt.ageDays;
                          const info: InspectedChartPoint = {
                            animalId: s.animal.id,
                            animalName: s.animal.name,
                            color: s.color,
                            ageDays: pt.ageDays,
                            dateIso: pt.dateIso,
                            weightGrams: pt.weightGrams,
                            segmentAdgGramsPerDay: pt.segmentAdgGramsPerDay,
                            label: pt.label,
                            source: pt.source,
                          };
                          return (
                            <circle
                              key={`${s.animal.id}-${pt.ageDays}-${pt.dateIso}`}
                              cx={cx}
                              cy={cy}
                              r={isActive ? 6 : 4.2}
                              fill={s.color}
                              stroke="var(--barn-surface)"
                              strokeWidth="1.5"
                              tabIndex={0}
                              role="button"
                              aria-label={`${s.animal.name} at ${pt.ageDays} days: ${formatWeight(
                                pt.weightGrams,
                                unit
                              )}`}
                              className="cursor-pointer outline-none"
                              onMouseEnter={() => setInspectedPoint(info)}
                              onFocus={() => setInspectedPoint(info)}
                              onClick={() => setInspectedPoint(info)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setInspectedPoint(info);
                                }
                              }}
                            />
                          );
                        })}
                      </g>
                    );
                  })}
                </svg>
              )}

              {/* Point Inspection Readout */}
              {inspectedPoint ? (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold inline-flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: inspectedPoint.color }}
                        aria-hidden="true"
                      />
                      {inspectedPoint.animalName}
                    </span>
                    <span className="font-mono tabular-nums text-[var(--barn-muted)]">
                      Day {inspectedPoint.ageDays} · {formatReadableDate(inspectedPoint.dateIso)}
                    </span>
                    <span className="font-mono tabular-nums font-semibold">
                      {formatWeight(inspectedPoint.weightGrams, unit)}
                    </span>
                    {inspectedPoint.segmentAdgGramsPerDay !== null && (
                      <span className="font-mono tabular-nums text-[var(--barn-sage)]">
                        Segment ADG: {formatRateOfGain(inspectedPoint.segmentAdgGramsPerDay, unit)}
                      </span>
                    )}
                    <span className="text-[var(--barn-muted)]">{inspectedPoint.label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInspectedPoint(null)}
                    aria-label="Clear chart point inspection"
                    className="text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-[var(--barn-muted)] px-1">
                  Hover, tap, or focus any plotted point to inspect exact age, date, weight, and
                  segment Rate of Gain.
                </div>
              )}
            </div>

            {(seriesWithoutBirthDate.length > 0 || seriesWithNoWeights.length > 0) && (
              <div className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)]/50 border border-[var(--barn-terracotta)]/50 text-xs space-y-1">
                {seriesWithoutBirthDate.length > 0 && (
                  <div>
                    <strong>Missing Birth Date:</strong>{' '}
                    {seriesWithoutBirthDate.map((s) => s.animal.name).join(', ')} — add a Birth
                    Date in Herd to align points on the Age (Days) axis.
                  </div>
                )}
                {seriesWithNoWeights.length > 0 && (
                  <div>
                    <strong>No Weight Recorded:</strong>{' '}
                    {seriesWithNoWeights.map((s) => s.animal.name).join(', ')} — log at least 1
                    Weight Check in Herd.
                  </div>
                )}
              </div>
            )}

            {/* Comparative ADG Summary Table */}
            {plottedSeries.length > 0 && (
              <div className="overflow-x-auto border border-[var(--barn-border)] rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--barn-canvas)] border-b border-[var(--barn-border)] text-[var(--barn-muted)]">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2">Animal</th>
                      <th className="text-right font-semibold px-3 py-2">Start</th>
                      <th className="text-right font-semibold px-3 py-2">Latest</th>
                      <th className="text-right font-semibold px-3 py-2">Overall ADG</th>
                      <th className="text-right font-semibold px-3 py-2">Peak Segment</th>
                      <th className="text-right font-semibold px-3 py-2">vs. Goal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--barn-border)]">
                    {plottedSeries.map((s) => (
                      <tr key={s.animal.id} className="hover:bg-[var(--barn-subtle)]/35">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: s.color }}
                            />
                            <span className="font-medium">{s.animal.name}</span>
                            {s.animal.tattoo && (
                              <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                                {s.animal.tattoo}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                          {s.startAgeDays !== null && s.startWeightGrams !== null
                            ? `${s.startAgeDays}d · ${formatWeight(s.startWeightGrams, unit)}`
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                          {s.latestAgeDays !== null && s.latestWeightGrams !== null
                            ? `${s.latestAgeDays}d · ${formatWeight(s.latestWeightGrams, unit)}`
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap font-semibold text-[var(--barn-sage)]">
                          {formatRateOfGain(s.overallAdgGramsPerDay, unit)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                          {formatRateOfGain(s.peakAdgGramsPerDay, unit)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                          {s.targetDeltaGrams !== null ? (
                            <span
                              className={
                                s.targetDeltaGrams >= 0
                                  ? 'text-[var(--barn-sage)]'
                                  : 'text-[var(--barn-terracotta)]'
                              }
                            >
                              {s.targetDeltaGrams >= 0 ? '+' : '-'}
                              {formatWeight(Math.abs(s.targetDeltaGrams), unit)} (
                              {s.targetDeltaPct !== null
                                ? `${s.targetDeltaPct >= 0 ? '+' : ''}${s.targetDeltaPct}%`
                                : ''}
                              )
                            </span>
                          ) : (
                            <span className="text-[var(--barn-muted)]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: LITTER SURVIVAL & PARENT PERFORMANCE CURVES */}
      {activeTab === 'survival' && (
        <div className="space-y-5">
          {/* Controls + KPI Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <button
                type="button"
                onClick={() => {
                  setSurvivalRole('dam');
                  setExpandedParentKey(null);
                }}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${
                  survivalRole === 'dam'
                    ? 'bg-[var(--barn-surface)] text-[var(--barn-ink)] border border-[var(--barn-border)]'
                    : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                }`}
              >
                Maternal ({speciesProfile.femaleLabel}) Performance
              </button>
              <button
                type="button"
                onClick={() => {
                  setSurvivalRole('sire');
                  setExpandedParentKey(null);
                }}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${
                  survivalRole === 'sire'
                    ? 'bg-[var(--barn-surface)] text-[var(--barn-ink)] border border-[var(--barn-border)]'
                    : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                }`}
              >
                Sire ({speciesProfile.maleLabel}) Performance
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor={`${baseId}-season-filter`}
                className="text-xs font-medium text-[var(--barn-muted)]"
              >
                Season:
              </label>
              <select
                id={`${baseId}-season-filter`}
                value={seasonFilter}
                onChange={(e) => setSeasonFilter(e.target.value)}
                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              >
                <option value="all">
                  All Seasons ({fullSurvivalEval.seasonalSummaries.length})
                </option>
                {fullSurvivalEval.seasonalSummaries.map((s) => (
                  <option key={s.seasonKey} value={s.seasonKey}>
                    {s.seasonKey} ({s.littersBornCount} litter
                    {s.littersBornCount === 1 ? '' : 's'})
                  </option>
                ))}
              </select>
              {seasonFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSeasonFilter('all')}
                  aria-label="Reset season filter"
                  className="min-h-[34px] px-2 py-1 rounded-lg border border-[var(--barn-border)] text-xs hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  All
                </button>
              )}
            </div>
          </div>

          {/* 4-Card KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <div className="text-[11px] text-[var(--barn-muted)]">
                Litters / Missed Pairings
              </div>
              <div className="font-mono tabular-nums text-xl font-semibold mt-0.5">
                {survivalEval.overallSummary.littersBornCount}{' '}
                <span className="text-xs font-normal text-[var(--barn-muted)]">
                  / {survivalEval.overallSummary.missedCount} missed
                </span>
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <div className="text-[11px] text-[var(--barn-muted)]">Live Birth Survival</div>
              <div className="font-mono tabular-nums text-xl font-semibold mt-0.5 text-[var(--barn-sage)]">
                {survivalEval.overallSummary.liveBirthRatePct !== null
                  ? `${survivalEval.overallSummary.liveBirthRatePct.toFixed(1)}%`
                  : '—'}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <div className="text-[11px] text-[var(--barn-muted)]">Weaning Survival</div>
              <div className="font-mono tabular-nums text-xl font-semibold mt-0.5 text-[var(--barn-sage)]">
                {survivalEval.overallSummary.weaningSurvivalRatePct !== null
                  ? `${survivalEval.overallSummary.weaningSurvivalRatePct.toFixed(1)}%`
                  : '—'}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <div className="text-[11px] text-[var(--barn-muted)]">Mean 3w · 6w · 8w Avg</div>
              <div className="font-mono tabular-nums text-xs font-semibold mt-1.5 space-x-1.5">
                <span>
                  {survivalEval.overallSummary.avg3WeekGrams !== null
                    ? formatWeight(survivalEval.overallSummary.avg3WeekGrams, unit)
                    : '—'}
                </span>
                <span className="text-[var(--barn-muted)]">·</span>
                <span>
                  {survivalEval.overallSummary.avg6WeekGrams !== null
                    ? formatWeight(survivalEval.overallSummary.avg6WeekGrams, unit)
                    : '—'}
                </span>
                <span className="text-[var(--barn-muted)]">·</span>
                <span>
                  {survivalEval.overallSummary.avg8WeekGrams !== null
                    ? formatWeight(survivalEval.overallSummary.avg8WeekGrams, unit)
                    : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Seasonal Survival Curve SVG */}
          <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold">
                Seasonal Survival Rate Curve (Live Birth % vs. Weaning Survival %)
              </h3>
              <div className="flex items-center gap-4 text-[11px] text-[var(--barn-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-0.5 bg-[#2d5a3d]" />
                  Live Birth %
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-0.5 bg-[#b85d3b]" />
                  Weaning Survival %
                </span>
              </div>
            </div>

            {seasonChartGeom.seasons.length === 0 ? (
              <div className="py-10 text-center text-xs text-[var(--barn-muted)]">
                Log litter birth/weaning outcomes in the Breeding Ledger below to chart seasonal
                survival trends.
              </div>
            ) : (
              <svg
                viewBox={`0 0 ${seasonChartGeom.width} ${seasonChartGeom.height}`}
                role="img"
                aria-label={`${speciesProfile.name} seasonal litter survival curves`}
                className="w-full h-auto overflow-visible select-none"
              >
                {[0, 25, 50, 75, 100].map((pct) => {
                  const y = seasonChartGeom.yPct(pct);
                  return (
                    <g key={`pct-${pct}`}>
                      <line
                        x1={seasonChartGeom.padL}
                        y1={y}
                        x2={seasonChartGeom.width - seasonChartGeom.padR}
                        y2={y}
                        stroke="var(--barn-border)"
                        strokeWidth="1"
                        opacity="0.7"
                      />
                      <text
                        x={seasonChartGeom.padL - 8}
                        y={y + 3.5}
                        textAnchor="end"
                        fontSize="10"
                        fontFamily="monospace"
                        fill="var(--barn-muted)"
                      >
                        {pct}%
                      </text>
                    </g>
                  );
                })}

                {/* Live Birth % Line */}
                {seasonChartGeom.seasons.filter((s) => s.liveBirthRatePct !== null).length >= 2 && (
                  <polyline
                    fill="none"
                    stroke="#2d5a3d"
                    strokeWidth="2.5"
                    points={seasonChartGeom.seasons
                      .map((s, idx) =>
                        s.liveBirthRatePct !== null
                          ? `${seasonChartGeom.xAt(idx).toFixed(1)},${seasonChartGeom
                              .yPct(s.liveBirthRatePct)
                              .toFixed(1)}`
                          : null
                      )
                      .filter(Boolean)
                      .join(' ')}
                  />
                )}

                {/* Weaning Survival % Line */}
                {seasonChartGeom.seasons.filter((s) => s.weaningSurvivalRatePct !== null).length >=
                  2 && (
                  <polyline
                    fill="none"
                    stroke="#b85d3b"
                    strokeWidth="2.5"
                    points={seasonChartGeom.seasons
                      .map((s, idx) =>
                        s.weaningSurvivalRatePct !== null
                          ? `${seasonChartGeom.xAt(idx).toFixed(1)},${seasonChartGeom
                              .yPct(s.weaningSurvivalRatePct)
                              .toFixed(1)}`
                          : null
                      )
                      .filter(Boolean)
                      .join(' ')}
                  />
                )}

                {seasonChartGeom.seasons.map((s, idx) => {
                  const x = seasonChartGeom.xAt(idx);
                  const pointData: InspectedSeasonPoint = {
                    seasonKey: s.seasonKey,
                    littersBornCount: s.littersBornCount,
                    missedCount: s.missedCount,
                    liveBirthRatePct: s.liveBirthRatePct,
                    weaningSurvivalRatePct: s.weaningSurvivalRatePct,
                    avg3WeekGrams: s.avg3WeekGrams,
                    avg6WeekGrams: s.avg6WeekGrams,
                    avg8WeekGrams: s.avg8WeekGrams,
                  };
                  return (
                    <g key={s.seasonKey}>
                      <text
                        x={x}
                        y={seasonChartGeom.height - 12}
                        textAnchor="middle"
                        fontSize="10"
                        fontFamily="monospace"
                        fill="var(--barn-muted)"
                      >
                        {s.seasonKey}
                      </text>
                      {s.liveBirthRatePct !== null && (
                        <circle
                          cx={x}
                          cy={seasonChartGeom.yPct(s.liveBirthRatePct)}
                          r="4.5"
                          fill="#2d5a3d"
                          stroke="var(--barn-surface)"
                          strokeWidth="1.5"
                          tabIndex={0}
                          role="button"
                          aria-label={`${s.seasonKey} live birth rate ${s.liveBirthRatePct}%`}
                          className="cursor-pointer outline-none"
                          onMouseEnter={() => setInspectedSeason(pointData)}
                          onFocus={() => setInspectedSeason(pointData)}
                          onClick={() => setInspectedSeason(pointData)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setInspectedSeason(pointData);
                            }
                          }}
                        />
                      )}
                      {s.weaningSurvivalRatePct !== null && (
                        <circle
                          cx={x}
                          cy={seasonChartGeom.yPct(s.weaningSurvivalRatePct)}
                          r="4.5"
                          fill="#b85d3b"
                          stroke="var(--barn-surface)"
                          strokeWidth="1.5"
                          tabIndex={0}
                          role="button"
                          aria-label={`${s.seasonKey} weaning survival rate ${s.weaningSurvivalRatePct}%`}
                          className="cursor-pointer outline-none"
                          onMouseEnter={() => setInspectedSeason(pointData)}
                          onFocus={() => setInspectedSeason(pointData)}
                          onClick={() => setInspectedSeason(pointData)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setInspectedSeason(pointData);
                            }
                          }}
                        />
                      )}
                    </g>
                  );
                })}
              </svg>
            )}

            {inspectedSeason && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono tabular-nums">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-sans font-semibold">{inspectedSeason.seasonKey}</span>
                  <span>
                    {inspectedSeason.littersBornCount} litter
                    {inspectedSeason.littersBornCount === 1 ? '' : 's'}
                  </span>
                  <span className="text-[var(--barn-sage)]">
                    Live:{' '}
                    {inspectedSeason.liveBirthRatePct !== null
                      ? `${inspectedSeason.liveBirthRatePct}%`
                      : '—'}
                  </span>
                  <span className="text-[var(--barn-terracotta)]">
                    Wean:{' '}
                    {inspectedSeason.weaningSurvivalRatePct !== null
                      ? `${inspectedSeason.weaningSurvivalRatePct}%`
                      : '—'}
                  </span>
                  {inspectedSeason.avg8WeekGrams !== null && (
                    <span>8w Avg: {formatWeight(inspectedSeason.avg8WeekGrams, unit)}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setInspectedSeason(null)}
                  aria-label="Clear season readout"
                  className="text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          {/* Per-Dam / Per-Sire Performance Ranking Table + Drilldown */}
          {parentSummaries.length === 0 ? (
            <div className="p-6 text-center rounded-xl border border-[var(--barn-border)] text-xs text-[var(--barn-muted)]">
              No settled {speciesProfile.name.toLowerCase()} litters recorded yet for{' '}
              {roleLabel.toLowerCase()}s.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto border border-[var(--barn-border)] rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--barn-canvas)] border-b border-[var(--barn-border)] text-[var(--barn-muted)]">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2">{roleLabel}</th>
                      <th className="text-right font-semibold px-3 py-2">Litters</th>
                      <th className="text-right font-semibold px-3 py-2">Live / Weaned</th>
                      <th className="text-right font-semibold px-3 py-2">Live Birth %</th>
                      <th className="text-right font-semibold px-3 py-2">Wean Survival %</th>
                      <th className="text-right font-semibold px-3 py-2">3w Avg</th>
                      <th className="text-right font-semibold px-3 py-2">6w Avg</th>
                      <th className="text-right font-semibold px-3 py-2">8w Avg</th>
                      <th className="text-right font-semibold px-3 py-2">Litter ADG</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--barn-border)]">
                    {parentSummaries.map((p) => {
                      const key = `${p.role}-${p.parentId || p.parentName}`;
                      const isActive =
                        activeParentSummary &&
                        `${activeParentSummary.role}-${
                          activeParentSummary.parentId || activeParentSummary.parentName
                        }` === key;
                      return (
                        <tr
                          key={key}
                          onClick={() => setExpandedParentKey(key)}
                          className={`cursor-pointer transition-colors ${
                            isActive
                              ? 'bg-[var(--barn-sage-tint)]/60'
                              : 'hover:bg-[var(--barn-subtle)]/35'
                          }`}
                        >
                          <td className="px-3 py-2 font-medium">
                            <button
                              type="button"
                              aria-pressed={Boolean(isActive)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedParentKey(key);
                              }}
                              className="text-left font-medium hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--barn-sage)] rounded"
                            >
                              {p.parentName}
                            </button>
                            {p.parentTattoo && (
                              <span className="font-mono text-[11px] text-[var(--barn-muted)] ml-1.5">
                                ({p.parentTattoo})
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {p.littersBornCount}
                            {p.missedCount > 0 ? ` (${p.missedCount} miss)` : ''}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {p.totalLiveBorn} / {p.totalWeaned}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {p.liveBirthRatePct !== null ? `${p.liveBirthRatePct.toFixed(1)}%` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-[var(--barn-sage)]">
                            {p.weaningSurvivalRatePct !== null
                              ? `${p.weaningSurvivalRatePct.toFixed(1)}%`
                              : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                            {p.avg3WeekGrams !== null ? formatWeight(p.avg3WeekGrams, unit) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                            {p.avg6WeekGrams !== null ? formatWeight(p.avg6WeekGrams, unit) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                            {p.avg8WeekGrams !== null ? formatWeight(p.avg8WeekGrams, unit) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                            {formatRateOfGain(p.meanLitterAdgGramsPerDay, unit)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Individual Litters Drilldown for Selected Dam/Sire */}
              {activeParentSummary && activeParentSummary.litters.length > 0 && (
                <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                      <span>
                        {activeParentSummary.parentName} — Litter Milestones &amp; Survival Breakdown
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-[var(--barn-muted)]">
                      Conception:{' '}
                      {activeParentSummary.conceptionRatePct !== null
                        ? `${activeParentSummary.conceptionRatePct}%`
                        : '—'}{' '}
                      · Avg Live/Litter:{' '}
                      {activeParentSummary.avgLivePerLitter !== null
                        ? activeParentSummary.avgLivePerLitter.toFixed(1)
                        : '—'}
                    </span>
                  </div>

                  <div className="divide-y divide-[var(--barn-border)]">
                    {activeParentSummary.litters.map((litter) => (
                      <div
                        key={litter.breeding.id}
                        className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="space-y-0.5">
                          <div className="font-medium">
                            {litter.breeding.damName} × {litter.breeding.sireName}{' '}
                            <span className="text-[var(--barn-muted)] font-normal">
                              · {formatReadableDate(litter.birthDateIso)}
                              {litter.season ? ` (${litter.season.seasonKey})` : ''}
                            </span>
                          </div>
                          <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
                            {litter.liveCount} live / {litter.stillbornCount} stillborn /{' '}
                            {litter.weanedCount} weaned
                            {litter.weaningSurvivalRatePct !== null
                              ? ` (${litter.weaningSurvivalRatePct}% wean survival)`
                              : ''}
                            {' · '}
                            {renderSurvivalLitterMilestoneBadges(litter)}
                          </div>
                        </div>
                        {onOpenBreedingOutcome && (
                          <button
                            type="button"
                            onClick={() => onOpenBreedingOutcome(litter.breeding)}
                            className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap self-start sm:self-center"
                          >
                            Log / Edit Litter Weights
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
```

## `src/components/HerdScreen.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Species-Isolated Herd Registry & Dedicated Single-Animal Profile Screen (`Herd`).
 *
 * Strictly displays ONLY animals where `animal.species === activeData.speciesProfile.name`.
 * Features:
 * - Multi-select checkboxes + Bulk actions (Move to Archived, Restore to Active, Move Species, Delete)
 * - Live (N) counts on all 6 filter tabs (All, Males, Females, Juniors, Active, Archived)
 * - Dedicated full-width Animal Page when inspecting/editing a specific animal
 * - Option to embed primary animal photo on printed .HTM / PDF pedigrees
 */

import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRightLeft,
  Award,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  FileText,
  GitFork,
  Loader2,
  Plus,
  Printer,
  RotateCcw,
  Scissors,
  Search,
  ShieldAlert,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import React, { ComponentProps, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { lazyNamedRoute } from '../utils/lazyRoute';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { useAsyncKeyedLock, useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import { useVirtualWindow } from '../utils/useVirtualWindow';
import {
  AnimalWithdrawalEvaluation,
  buildWithdrawalByAnimalMap,
} from '../core/barnAlerts';
import { getConflictSortPriority } from '../core/animalConflicts';
import {
  analyzeAnimalCarrierLineage,
  AnimalCarrierLineageAnalysis,
  doesAnimalMatchCarrierFilter,
  formatClearedProofBadge,
  getAnimalCarrierDisclosures,
  getCarrierTraitSuggestionsForSpecies,
  HerdCarrierFilterMode,
} from '../core/carrierGenetics';
import {
  analyzeAlleleProvenance,
  formatGenotypeArray,
  getGeneticsSpecForSpecies,
  inferHiddenAlleles,
} from '../core/geneticsEngine';
import { OptimizedImagePayload } from '../core/imageOptimizationSpec';
import {
  addDaysIso,
  Animal,
  AnimalConflictKind,
  BarnDatabaseSnapshot,
  BarnSettings,
  CARE_LOG_TYPES,
  CareLog,
  CareLogType,
  doesAnimalNeedAttention,
  formatCurrencyCents,
  formatReadableDate,
  formatSexForSpecies,
  formatWeight,
  getSpeciesIdentifierLabels,
  getWeightInputMeta,
  IagarbScorecard,
  isAnimalArchived,
  normalizeOwnershipType,
  parseWeightInputToGrams,
  resolveSpeciesWeightUnit,
  SpeciesProfile,
  todayDateIso,
  ULTRASOUND_RESULTS,
  UltrasoundResult,
  WOOL_HARVEST_METHODS,
  WoolHarvest,
  WoolHarvestMethod,
} from '../core/models';
import {
  buildPetBirthCertificateFileName,
  generatePetBirthCertificateHtml,
} from '../core/alternativeCertificates';
import {
  compute90DayEquivalentGrams,
  computeDaysBetweenDateIso,
  computeIagarbScoreTotal,
  evaluateIagarbEligibility,
  IAGARB_JUDGING_POSITIONS,
  summarizeAnimalWoolHarvests,
} from '../core/woolFiber';
import {
  CoiAnalysis,
  createSpeciesCoiEvaluator,
  getPedigreeCompletenessSummary,
} from '../core/pedigreeCalculator';
import { SpeciesMigrationOptions } from '../core/speciesMigration';
import {
  BatchPrintOptions,
  buildBatchPrintFileName,
  buildDefaultBatchPrintOptions,
  computeBatchPrintPageCount,
  generateBatchPrintHtml,
  getBatchPrintLayoutSpec,
  resolveBatchPrintAnimals,
} from '../core/batchPrint';
import {
  buildShareablePedigreeCardFileName,
  generateShareablePedigreeCardHtml,
} from '../core/shareablePedigreeCard';
import { computeAnimalShowSummary } from '../core/showResults';
import {
  generateEvansHtmPedigree,
  generateThermalCageCardHtml,
  PedigreePrintOptions,
} from '../core/syncAndExports';
import { ArchivedHerdIndexEntry } from '../core/backupVault';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import { AnimalPhotoGallery } from './AnimalPhotoGallery';
import { ColorGeneticsNotice } from './ColorGeneticsNotice';
import { ColoredGenotypeDisplay } from './ColoredGenotypeDisplay';
import { PedigreePrintNotice } from './PedigreePrintNotice';

const AnimalEditorModal = lazyNamedRoute<
  ComponentProps<typeof import('./AnimalEditorModal')['AnimalEditorModal']>
>(() => import('./AnimalEditorModal'), 'AnimalEditorModal', 'Animal Editor');

const ArchivedHerdsModal = lazyNamedRoute<
  ComponentProps<typeof import('./ArchivedHerdsModal')['ArchivedHerdsModal']>
>(() => import('./ArchivedHerdsModal'), 'ArchivedHerdsModal', 'Archived Herds');

const PrintPreviewModal = lazyNamedRoute<
  ComponentProps<typeof import('./PrintPreviewModal')['PrintPreviewModal']>
>(() => import('./PrintPreviewModal'), 'PrintPreviewModal', 'Print Preview');

const SpeciesMigrationModal = lazyNamedRoute<
  ComponentProps<typeof import('./SpeciesMigrationModal')['SpeciesMigrationModal']>
>(() => import('./SpeciesMigrationModal'), 'SpeciesMigrationModal', 'Species Migration');

export const HERD_PAGE_SIZE = 50;

interface HerdScreenProps {
  snapshot: BarnDatabaseSnapshot;
  activeData: ActiveSpeciesData;
  allAnimals: Animal[];
  speciesProfiles: SpeciesProfile[];
  settings: BarnSettings;
  selectedAnimalId: string | null;
  onSelectAnimal: (id: string | null) => void;
  onOpenPedigreeForAnimal: (id: string) => void;
  onSaveAnimal: (
    draft: Omit<Animal, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string },
    pendingPhotos?: Array<OptimizedImagePayload & { caption?: string }>
  ) => Promise<string | null | void> | string | void;
  onAddAnimalPhotos: (
    animal: Animal,
    payloads: Array<OptimizedImagePayload & { caption?: string }>
  ) => Promise<number> | Promise<void> | void;
  onSetPrimaryAnimalPhoto: (animalId: string, photoId: string) => Promise<void> | void;
  onUpdateAnimalPhotoCaption: (photoId: string, caption: string) => Promise<void> | void;
  onDeleteAnimalPhoto: (photoId: string) => Promise<void> | void;
  onDeleteAnimal: (animal: Animal) => void;
  onArchiveAnimals: (animalIds: string[], archived: boolean) => Promise<void> | void;
  onDeleteAnimalsBatch: (animalIds: string[]) => void;
  onMigrateAnimalsSpecies: (
    animalIds: string[],
    targetSpecies: string,
    options?: SpeciesMigrationOptions
  ) => Promise<void> | void;
  onToggleIncludePhotoOnPedigree: (include: boolean) => void;
  onAddCareLog: (draft: Omit<CareLog, 'id' | 'createdAt' | 'updatedAt'>) => Promise<boolean | void> | boolean | void;
  onDeleteCareLog: (id: string) => void;
  onIgnoreConflicts?: (animalId: string, kinds: AnimalConflictKind[]) => void;
  onRestoreConflictAlert?: (animalId: string, kinds?: AnimalConflictKind[]) => void;
  requestedConflictFocusNonce?: number;
  requestedWithdrawalFocusNonce?: number;
  onConsumeWithdrawalFocus?: () => void;
  onLoadFullPhoto?: (photoId: string) => Promise<string | null>;
  onLoadFullPhotosBatch?: (photoIds: string[]) => Promise<Record<string, string>>;
  opfsSupported?: boolean;
  archivedHerdBundles?: ArchivedHerdIndexEntry[];
  onOffloadAnimalsToOpfsArchive?: (animalIds: string[]) => Promise<unknown> | void;
  onRestoreArchivedHerdBundle?: (
    archiveKey: string,
    options?: { restoreToActiveStatus?: boolean; deleteArchiveAfterRestore?: boolean }
  ) => Promise<void>;
  onDownloadArchivedHerdBundle?: (archiveKey: string) => Promise<void>;
  onDeleteArchivedHerdBundle?: (archiveKey: string) => Promise<void>;
  onOpenBarnBench?: () => void;
  onCompareGrowthForAnimals?: (animalIds: string[]) => void;
  onUpdateSettings?: (patch: Partial<BarnSettings>, options?: { silent?: boolean }) => void;
  onSaveWoolHarvest?: (
    draft: Omit<WoolHarvest, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<string | null> | void;
  onDeleteWoolHarvest?: (id: string) => void;
  isConstrainedDevice?: boolean;
}

type HerdFilterTab =
  | 'all'
  | 'Male'
  | 'Female'
  | 'Junior'
  | 'Active'
  | 'Archived'
  | 'Withdrawal'
  | 'NeedsAttention'
  | 'Conflicts';

type HerdSortOption =
  | 'default'
  | 'conflicts_first'
  | 'withdrawal_soonest'
  | 'name'
  | 'tattoo'
  | 'newest_dob';

export function HerdScreen({
  snapshot,
  activeData,
  allAnimals,
  speciesProfiles,
  settings,
  selectedAnimalId,
  onSelectAnimal,
  onOpenPedigreeForAnimal,
  onSaveAnimal,
  onAddAnimalPhotos,
  onSetPrimaryAnimalPhoto,
  onUpdateAnimalPhotoCaption,
  onDeleteAnimalPhoto,
  onDeleteAnimal,
  onArchiveAnimals,
  onDeleteAnimalsBatch,
  onMigrateAnimalsSpecies,
  onToggleIncludePhotoOnPedigree,
  onAddCareLog,
  onDeleteCareLog,
  onIgnoreConflicts,
  onRestoreConflictAlert,
  requestedConflictFocusNonce,
  requestedWithdrawalFocusNonce,
  onConsumeWithdrawalFocus,
  onLoadFullPhoto,
  onLoadFullPhotosBatch,
  opfsSupported = false,
  archivedHerdBundles = [],
  onOffloadAnimalsToOpfsArchive,
  onRestoreArchivedHerdBundle,
  onDownloadArchivedHerdBundle,
  onDeleteArchivedHerdBundle,
  onOpenBarnBench,
  onCompareGrowthForAnimals,
  onUpdateSettings,
  onSaveWoolHarvest,
  onDeleteWoolHarvest,
  isConstrainedDevice = false,
}: HerdScreenProps) {
  const {
    speciesProfile,
    animals,
    photosByAnimalId,
    primaryPhotoByAnimalId,
    herdById,
    conflictsByAnimalId,
    conflictedAnimalCount,
    coiByAnimalId,
    cages,
    careLogs,
    shows,
    woolHarvests = [],
  } = activeData;

  const effectiveWeightUnit = resolveSpeciesWeightUnit(speciesProfile, settings);
  const weightMeta = getWeightInputMeta(effectiveWeightUnit);
  const idLabels = getSpeciesIdentifierLabels(speciesProfile.name);

  const [query, setQuery] = useState('');
  const [filterKey, setFilterKey] = useState<HerdFilterTab>('all');
  const [sortBy, setSortBy] = useState<HerdSortOption>('default');
  const [carrierFilterMode, setCarrierFilterMode] = useState<HerdCarrierFilterMode>('all');
  const [carrierTraitQuery, setCarrierTraitQuery] = useState('');
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [migrationModalState, setMigrationModalState] = useState<{
    mode: 'single' | 'multi-select';
    animalIds: string[];
  } | null>(null);

  useEffect(() => {
    setCheckedIds([]);
    setConfirmBatchDelete(false);
    setMigrationModalState(null);
    setBatchPrintSubjects(null);
    setBatchHydratedPhotos({});
    setBatchPhotoHydrating(false);
    setCarrierFilterMode('all');
    setCarrierTraitQuery('');
  }, [speciesProfile.name]);

  useEffect(() => {
    if (requestedConflictFocusNonce && requestedConflictFocusNonce > 0) {
      setFilterKey('Conflicts');
      setSortBy('conflicts_first');
    }
  }, [requestedConflictFocusNonce]);

  useEffect(() => {
    if (requestedWithdrawalFocusNonce && requestedWithdrawalFocusNonce > 0) {
      setFilterKey('Withdrawal');
      setSortBy('withdrawal_soonest');
      onConsumeWithdrawalFocus?.();
    }
  }, [requestedWithdrawalFocusNonce, onConsumeWithdrawalFocus]);

  const [editingAnimal, setEditingAnimal] = useState<Animal | null>(null);
  const [showAnimalModal, setShowAnimalModal] = useState(false);
  const [showArchivedHerdsModal, setShowArchivedHerdsModal] = useState(false);

  // Print preview state
  const [pedigreeDocMode, setPedigreeDocMode] = useState<'formal_certificate' | 'shareable_card'>(
    'formal_certificate'
  );
  const [pedigreePrintOptions, setPedigreePrintOptions] = useState<PedigreePrintOptions>({
    orientation: 'landscape',
    showWeights: true,
    arbaLbsOzDotNotation: false,
    showGenotypes: false,
    showBreederFooter: true,
    breederContactLine: '',
    showBreederLogo: true,
    colorPreset: 'classic_sage',
    borderStyle: 'classic_rule',
    layoutPreset: 'evans_standard',
  });
  const [previewDoc, setPreviewDoc] = useState<{
    title: string;
    filename: string;
    html: string;
    isPedigree?: boolean;
    hasGenetics?: boolean;
    pedigreeSubject?: Animal;
    cageCardSubject?: Animal;
    birthCertSubject?: Animal;
  } | null>(null);
  const [birthCertOptions, setBirthCertOptions] = useState<{
    companionFamilyName: string;
    keepsakeMessage: string;
    includePrimaryPhoto: boolean;
  }>({
    companionFamilyName: '',
    keepsakeMessage: '',
    includePrimaryPhoto: true,
  });
  const [familyPortraitPhotosByAnimalId, setFamilyPortraitPhotosByAnimalId] = useState<
    Record<string, string>
  >({});
  const [includeThermalCageCardQr, setIncludeThermalCageCardQr] = useState(true);
  const [hydratedPedigreePhoto, setHydratedPedigreePhoto] = useState<{
    photoId: string;
    dataUrl: string;
  } | null>(null);
  const [batchPrintSubjects, setBatchPrintSubjects] = useState<Animal[] | null>(null);
  const [batchPrintOptions, setBatchPrintOptions] = useState<BatchPrintOptions>(() =>
    buildDefaultBatchPrintOptions(settings)
  );
  const [batchHydratedPhotos, setBatchHydratedPhotos] = useState<Record<string, string>>({});
  const [batchPhotoHydrating, setBatchPhotoHydrating] = useState(false);

  useEffect(() => {
    const photoSubject = previewDoc?.pedigreeSubject ?? previewDoc?.birthCertSubject;
    const shouldIncludePhoto = previewDoc?.pedigreeSubject
      ? Boolean(settings.includePhotoOnPedigree)
      : previewDoc?.birthCertSubject
      ? birthCertOptions.includePrimaryPhoto
      : false;
    if (!photoSubject || !shouldIncludePhoto) {
      if (hydratedPedigreePhoto !== null) {
        setHydratedPedigreePhoto(null);
      }
      return;
    }
    const primary = primaryPhotoByAnimalId.get(photoSubject.id);
    if (!primary || primary.dataUrl || !onLoadFullPhoto) return;
    if (hydratedPedigreePhoto?.photoId === primary.id) return;
    let cancelled = false;
    void onLoadFullPhoto(primary.id).then((resolved) => {
      if (!cancelled && resolved) {
        setHydratedPedigreePhoto({ photoId: primary.id, dataUrl: resolved });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    previewDoc,
    settings.includePhotoOnPedigree,
    birthCertOptions.includePrimaryPhoto,
    primaryPhotoByAnimalId,
    onLoadFullPhoto,
    hydratedPedigreePhoto,
  ]);

  useEffect(() => {
    if (
      !previewDoc?.isPedigree ||
      !previewDoc.pedigreeSubject ||
      pedigreePrintOptions.layoutPreset !== 'family_portrait'
    ) {
      setFamilyPortraitPhotosByAnimalId((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    const animalById = new Map<string, Animal>(allAnimals.map((a) => [a.id, a]));
    const subj = previewDoc.pedigreeSubject;
    const sire = subj.sireId ? animalById.get(subj.sireId) : undefined;
    const dam = subj.damId ? animalById.get(subj.damId) : undefined;
    const familyIds = [
      subj.id,
      sire?.id,
      dam?.id,
      sire?.sireId,
      sire?.damId,
      dam?.sireId,
      dam?.damId,
    ].filter((id): id is string => Boolean(id));

    const nextImmediate: Record<string, string> = {};
    const photoIdsToHydrate: Array<{ animalId: string; photoId: string }> = [];
    for (const animalId of familyIds) {
      const rec = primaryPhotoByAnimalId.get(animalId);
      if (!rec) continue;
      if (rec.dataUrl) {
        nextImmediate[animalId] = rec.dataUrl;
      } else {
        if (rec.thumbnailDataUrl) nextImmediate[animalId] = rec.thumbnailDataUrl;
        if (onLoadFullPhotosBatch) {
          photoIdsToHydrate.push({ animalId, photoId: rec.id });
        }
      }
    }
    setFamilyPortraitPhotosByAnimalId(nextImmediate);

    if (photoIdsToHydrate.length === 0 || !onLoadFullPhotosBatch) return;
    let cancelled = false;
    void onLoadFullPhotosBatch(photoIdsToHydrate.map((x) => x.photoId)).then((loadedMap) => {
      if (cancelled) return;
      setFamilyPortraitPhotosByAnimalId((prev) => {
        const merged = { ...prev };
        for (const item of photoIdsToHydrate) {
          if (loadedMap[item.photoId]) {
            merged[item.animalId] = loadedMap[item.photoId];
          }
        }
        return merged;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [previewDoc, pedigreePrintOptions.layoutPreset, allAnimals, primaryPhotoByAnimalId, onLoadFullPhotosBatch]);

  useEffect(() => {
    if (!batchPrintSubjects || batchPrintSubjects.length === 0 || !batchPrintOptions.includePhotos) {
      setBatchPhotoHydrating(false);
      return;
    }
    const layoutSpec = getBatchPrintLayoutSpec(batchPrintOptions.layout);
    if (!layoutSpec.prefersFullResPhotos) {
      setBatchPhotoHydrating(false);
      return;
    }

    const missingPhotoIds: string[] = [];
    for (const animal of batchPrintSubjects) {
      if (missingPhotoIds.length >= 40) break;
      const primary = primaryPhotoByAnimalId.get(animal.id);
      if (primary && !primary.dataUrl && !(primary.id in batchHydratedPhotos)) {
        missingPhotoIds.push(primary.id);
      }
    }
    if (missingPhotoIds.length === 0) {
      setBatchPhotoHydrating(false);
      return;
    }

    let cancelled = false;
    setBatchPhotoHydrating(true);

    const hydrate = async () => {
      try {
        const nextEntries: Record<string, string> = {};
        if (onLoadFullPhotosBatch) {
          const loaded = await onLoadFullPhotosBatch(missingPhotoIds);
          for (const photoId of missingPhotoIds) {
            nextEntries[photoId] = loaded[photoId] || '';
          }
        } else if (onLoadFullPhoto) {
          for (const photoId of missingPhotoIds) {
            if (cancelled) return;
            const url = await onLoadFullPhoto(photoId);
            nextEntries[photoId] = url || '';
          }
        }
        if (!cancelled && Object.keys(nextEntries).length > 0) {
          setBatchHydratedPhotos((prev) => ({ ...prev, ...nextEntries }));
        }
      } catch {
        // Fall back cleanly to thumbnails when full-res hydration fails
      } finally {
        if (!cancelled) {
          setBatchPhotoHydrating(false);
        }
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [
    batchPrintSubjects,
    batchPrintOptions.includePhotos,
    batchPrintOptions.layout,
    primaryPhotoByAnimalId,
    batchHydratedPhotos,
    onLoadFullPhotosBatch,
    onLoadFullPhoto,
  ]);

  // Quick Cage-Side Care/Weight Log state
  const [showLogForm, setShowLogForm] = useState(false);
  const [logType, setLogType] = useState<CareLogType>('Weight Check');
  const [logTitle, setLogTitle] = useState('');
  const [logDateIso, setLogDateIso] = useState(todayDateIso());
  const [logWeightInput, setLogWeightInput] = useState('');
  const [logShowLeg, setLogShowLeg] = useState(false);
  const [logNotes, setLogNotes] = useState('');
  const [logMedicationName, setLogMedicationName] = useState('');
  const [logDosage, setLogDosage] = useState('');
  const [logAdministrationRoute, setLogAdministrationRoute] = useState('');
  const [logWithdrawalDays, setLogWithdrawalDays] = useState('');
  const [logBodyConditionScore, setLogBodyConditionScore] = useState('');
  const [logFamachaScore, setLogFamachaScore] = useState('');
  const [logFecalEggCount, setLogFecalEggCount] = useState('');
  const [logUltrasoundResult, setLogUltrasoundResult] = useState<UltrasoundResult>('');
  const [logUltrasoundFetalCount, setLogUltrasoundFetalCount] = useState('');

  const todayIso = todayDateIso();
  const withdrawalByAnimalId = useMemo<Map<string, AnimalWithdrawalEvaluation>>(
    () => buildWithdrawalByAnimalMap(careLogs, { todayIso }),
    [careLogs, todayIso]
  );

  // Live filter tab counts (single O(n) pass)
  const {
    maleCount,
    femaleCount,
    juniorCount,
    activeCount,
    archivedCount,
    needsAttentionCount,
    withdrawalCount,
  } = useMemo(() => {
    let male = 0;
    let female = 0;
    let junior = 0;
    let active = 0;
    let archived = 0;
    let needsAttention = 0;
    let withdrawal = 0;
    for (const a of animals) {
      if (a.sex === 'Male') male++;
      else if (a.sex === 'Female') female++;
      if (a.status === 'Junior') junior++;
      if (isAnimalArchived(a)) archived++;
      else active++;
      if (doesAnimalNeedAttention(a)) needsAttention++;
      if (withdrawalByAnimalId.get(a.id)?.isActive) withdrawal++;
    }
    return {
      maleCount: male,
      femaleCount: female,
      juniorCount: junior,
      activeCount: active,
      archivedCount: archived,
      needsAttentionCount: needsAttention,
      withdrawalCount: withdrawal,
    };
  }, [animals, withdrawalByAnimalId]);

  const speciesGeneticsSpec = useMemo(
    () => getGeneticsSpecForSpecies(speciesProfile.name),
    [speciesProfile.name]
  );

  const carrierSuggestions = useMemo(
    () => getCarrierTraitSuggestionsForSpecies(speciesProfile.name),
    [speciesProfile.name]
  );

  const hasCarrierFilter =
    carrierFilterMode !== 'all' || carrierTraitQuery.trim().length > 0;

  const filteredCarrierAnalysisById = useMemo(() => {
    const map = new Map<string, AnimalCarrierLineageAnalysis>();
    if (!hasCarrierFilter) return map;
    for (const a of animals) {
      map.set(a.id, analyzeAnimalCarrierLineage(a, herdById));
    }
    return map;
  }, [hasCarrierFilter, animals, herdById]);

  const filteredAnimals = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = animals.filter((a) => {
      const archived = isAnimalArchived(a);
      if (filterKey === 'Male' && a.sex !== 'Male') return false;
      if (filterKey === 'Female' && a.sex !== 'Female') return false;
      if (filterKey === 'Junior' && a.status !== 'Junior') return false;
      if (filterKey === 'Active' && archived) return false;
      if (filterKey === 'Archived' && !archived) return false;
      if (filterKey === 'Withdrawal' && !withdrawalByAnimalId.get(a.id)?.isActive) return false;
      if (filterKey === 'NeedsAttention' && !doesAnimalNeedAttention(a)) return false;
      if (filterKey === 'Conflicts' && !conflictsByAnimalId.get(a.id)?.hasAnyConflict) {
        return false;
      }

      if (hasCarrierFilter) {
        const analysis = filteredCarrierAnalysisById.get(a.id);
        if (!analysis || !doesAnimalMatchCarrierFilter(analysis, carrierFilterMode, carrierTraitQuery)) {
          return false;
        }
      }

      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.tattoo.toLowerCase().includes(q) ||
        a.registrationNumber.toLowerCase().includes(q) ||
        a.grandChampionNumber.toLowerCase().includes(q) ||
        a.breed.toLowerCase().includes(q) ||
        a.variety.toLowerCase().includes(q) ||
        a.cageLocation.toLowerCase().includes(q)
      );
    });

    if (sortBy === 'default') return filtered;

    return [...filtered].sort((a, b) => {
      if (sortBy === 'conflicts_first') {
        const pa = getConflictSortPriority(conflictsByAnimalId.get(a.id));
        const pb = getConflictSortPriority(conflictsByAnimalId.get(b.id));
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'withdrawal_soonest') {
        const wa = withdrawalByAnimalId.get(a.id)?.daysRemaining ?? Number.POSITIVE_INFINITY;
        const wb = withdrawalByAnimalId.get(b.id)?.daysRemaining ?? Number.POSITIVE_INFINITY;
        if (wa !== wb) return wa - wb;
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'tattoo') {
        return (a.tattoo || '').localeCompare(b.tattoo || '') || a.name.localeCompare(b.name);
      }
      if (sortBy === 'newest_dob') {
        return (b.birthDateIso || '').localeCompare(a.birthDateIso || '') || a.name.localeCompare(b.name);
      }
      return 0;
    });
  }, [
    animals,
    query,
    filterKey,
    sortBy,
    hasCarrierFilter,
    carrierFilterMode,
    carrierTraitQuery,
    filteredCarrierAnalysisById,
    conflictsByAnimalId,
    withdrawalByAnimalId,
  ]);

  // Only show dedicated Animal Page when user explicitly opened an animal (`selectedAnimalId`)
  const activeAnimal = useMemo(() => {
    if (selectedAnimalId && herdById.has(selectedAnimalId)) {
      return herdById.get(selectedAnimalId)!;
    }
    return null;
  }, [selectedAnimalId, herdById]);

  const activeAnimalLogs = useMemo(
    () => (activeAnimal ? careLogs.filter((l) => l.animalId === activeAnimal.id) : []),
    [careLogs, activeAnimal]
  );

  const activeAnimalWithdrawal = useMemo(
    () => (activeAnimal ? withdrawalByAnimalId.get(activeAnimal.id) ?? null : null),
    [activeAnimal, withdrawalByAnimalId]
  );

  const activeAnimalShowSummary = useMemo(
    () => (activeAnimal ? computeAnimalShowSummary(activeAnimal, shows, careLogs) : null),
    [activeAnimal, shows, careLogs]
  );

  const activeAnimalWoolHarvests = useMemo(
    () => (activeAnimal ? woolHarvests.filter((wh) => wh.animalId === activeAnimal.id) : []),
    [activeAnimal, woolHarvests]
  );

  const activeAnimalWoolSummary = useMemo(
    () =>
      activeAnimal
        ? summarizeAnimalWoolHarvests(activeAnimalWoolHarvests, activeAnimal.id)
        : null,
    [activeAnimal, activeAnimalWoolHarvests]
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
  const [woolIagarbScore, setWoolIagarbScore] = useState<IagarbScorecard>(() => ({
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
  }));
  const woolSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });

  const [eLegLightbox, setELegLightbox] = useState<{
    imageUrl: string;
    title: string;
    subtitle?: string;
  } | null>(null);
  const closeELegLightbox = useCallback(() => setELegLightbox(null), []);
  const eLegLightboxRef = useAccessibleDialog({
    isOpen: Boolean(eLegLightbox),
    onClose: closeELegLightbox,
  });

  const editingAnimalCareLogs = useMemo(
    () => (editingAnimal ? careLogs.filter((l) => l.animalId === editingAnimal.id) : []),
    [careLogs, editingAnimal]
  );

  const [visibleCareLogCount, setVisibleCareLogCount] = useState(30);
  const careLogSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const inlineAnimalLock = useAsyncKeyedLock();

  useEffect(() => {
    setVisibleCareLogCount(30);
  }, [activeAnimal?.id]);

  const weightPoints = useMemo(
    () =>
      [...activeAnimalLogs]
        .filter((l) => l.weightGrams > 0)
        .sort((a, b) => a.dateIso.localeCompare(b.dateIso)),
    [activeAnimalLogs]
  );

  const offspring = useMemo(
    () =>
      activeAnimal
        ? animals.filter((a) => a.sireId === activeAnimal.id || a.damId === activeAnimal.id)
        : [],
    [animals, activeAnimal]
  );

  const alleleInference = useMemo(
    () =>
      activeAnimal
        ? inferHiddenAlleles(activeAnimal, herdById, animals, speciesProfile.name)
        : null,
    [activeAnimal, herdById, animals, speciesProfile.name]
  );

  const activeAlleleProvenance = useMemo(
    () =>
      activeAnimal
        ? analyzeAlleleProvenance(activeAnimal, herdById, animals, speciesProfile.name, {
            includeInferred: true,
          })
        : null,
    [activeAnimal, herdById, animals, speciesProfile.name]
  );

  const activeCarriers = useMemo(
    () => getAnimalCarrierDisclosures(activeAnimal),
    [activeAnimal]
  );

  const isLowMemMode = Boolean(isConstrainedDevice);

  const herdVirtual = useVirtualWindow({
    itemCount: filteredAnimals.length,
    estimateSize: 80,
    overscan: isLowMemMode ? 3 : 8,
    initialFallbackCount: isLowMemMode ? 20 : HERD_PAGE_SIZE,
    resetKey: `${speciesProfile.name}::${filterKey}::${sortBy}::${query}::${carrierFilterMode}::${carrierTraitQuery}`,
  });

  const visibleAnimals = useMemo(
    () =>
      filteredAnimals.length > 0 &&
      herdVirtual.windowRange.endIndex >= herdVirtual.windowRange.startIndex
        ? filteredAnimals.slice(
            herdVirtual.windowRange.startIndex,
            herdVirtual.windowRange.endIndex + 1
          )
        : [],
    [
      filteredAnimals,
      herdVirtual.windowRange.startIndex,
      herdVirtual.windowRange.endIndex,
    ]
  );

  const visibleCarrierAnalysisById = useMemo(() => {
    if (hasCarrierFilter) return filteredCarrierAnalysisById;
    const map = new Map<string, AnimalCarrierLineageAnalysis>();
    if (activeAnimal) {
      map.set(activeAnimal.id, analyzeAnimalCarrierLineage(activeAnimal, herdById));
    }
    for (const a of visibleAnimals) {
      if (!map.has(a.id)) {
        map.set(a.id, analyzeAnimalCarrierLineage(a, herdById));
      }
    }
    return map;
  }, [hasCarrierFilter, filteredCarrierAnalysisById, activeAnimal, visibleAnimals, herdById]);

  const activeLineageAnalysis = useMemo(
    () => (activeAnimal ? visibleCarrierAnalysisById.get(activeAnimal.id) ?? null : null),
    [activeAnimal, visibleCarrierAnalysisById]
  );

  const coiEvaluator = useMemo(() => createSpeciesCoiEvaluator(herdById), [herdById]);

  const visibleCoiByAnimalId = useMemo(() => {
    const map = new Map<string, CoiAnalysis>();
    if (activeAnimal) {
      map.set(
        activeAnimal.id,
        coiByAnimalId.get(activeAnimal.id) ?? coiEvaluator.calculateAnimalCoi(activeAnimal)
      );
    }
    for (const a of visibleAnimals) {
      if (!map.has(a.id)) {
        map.set(a.id, coiByAnimalId.get(a.id) ?? coiEvaluator.calculateAnimalCoi(a));
      }
    }
    return map;
  }, [activeAnimal, visibleAnimals, coiByAnimalId, coiEvaluator]);

  const checkedIdSet = useMemo(() => new Set(checkedIds), [checkedIds]);
  const filteredIds = useMemo(() => filteredAnimals.map((a) => a.id), [filteredAnimals]);
  const filteredIdSet = useMemo(() => new Set(filteredIds), [filteredIds]);
  const allShownChecked =
    filteredIds.length > 0 && filteredIds.every((id) => checkedIdSet.has(id));

  const toggleChecked = (id: string) => {
    setConfirmBatchDelete(false);
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllShown = () => {
    setConfirmBatchDelete(false);
    if (allShownChecked) {
      setCheckedIds((prev) => prev.filter((id) => !filteredIdSet.has(id)));
    } else {
      setCheckedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const resetLogFields = () => {
    setLogType('Weight Check');
    setLogDateIso(todayDateIso());
    setLogTitle('');
    setLogWeightInput('');
    setLogShowLeg(false);
    setLogNotes('');
    setLogMedicationName('');
    setLogDosage('');
    setLogAdministrationRoute('');
    setLogWithdrawalDays('');
    setLogBodyConditionScore('');
    setLogFamachaScore('');
    setLogFecalEggCount('');
    setLogUltrasoundResult('');
    setLogUltrasoundFetalCount('');
  };

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
    setWoolIagarbScore({
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
    });
  };

  useEffect(() => {
    setShowLogForm(false);
    resetLogFields();
    setShowWoolForm(false);
    resetWoolFields();
  }, [speciesProfile.id, selectedAnimalId]);

  const submitWoolHarvest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAnimal || !onSaveWoolHarvest) return;
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
        animalId: activeAnimal.id,
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

  const safeNonNegNumber = (raw: string, roundInt = false, max = Number.MAX_SAFE_INTEGER): number => {
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) return 0;
    const bounded = Math.min(max, num);
    return roundInt ? Math.round(bounded) : bounded;
  };

  const submitCareLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAnimal) return;
    await careLogSubmitLock.runLocked(async () => {
      const effectiveDate = logDateIso || todayDateIso();
      const withdrawalDays =
        logType === 'Health / Vet' ? safeNonNegNumber(logWithdrawalDays, true, 3650) : 0;
      const withdrawalClearDateIso =
        withdrawalDays > 0 ? addDaysIso(effectiveDate, withdrawalDays) : '';
      const isHealthScore = logType === 'Health Score / BCS';
      const isScan = logType === 'Ultrasound' || logType === 'Palpation';
      const parsedWeight = parseWeightInputToGrams(logWeightInput, effectiveWeightUnit);

      const saved = await onAddCareLog({
        species: speciesProfile.name,
        animalId: activeAnimal.id,
        dateIso: effectiveDate,
        type: logType,
        title: logTitle.trim() || logType,
        weightGrams: Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : 0,
        showLegEarned: logShowLeg,
        medicationName: logType === 'Health / Vet' ? logMedicationName.trim() : '',
        dosage: logType === 'Health / Vet' ? logDosage.trim() : '',
        administrationRoute: logType === 'Health / Vet' ? logAdministrationRoute.trim() : '',
        withdrawalDays,
        withdrawalClearDateIso,
        bodyConditionScore: isHealthScore ? safeNonNegNumber(logBodyConditionScore, false, 20) : 0,
        famachaScore: isHealthScore ? safeNonNegNumber(logFamachaScore, true, 5) : 0,
        fecalEggCount: isHealthScore ? safeNonNegNumber(logFecalEggCount, true, 1_000_000) : 0,
        ultrasoundResult: isScan ? logUltrasoundResult : '',
        ultrasoundFetalCount: isScan ? safeNonNegNumber(logUltrasoundFetalCount, true, 100) : 0,
        notes: logNotes.trim(),
      });
      if (saved !== false) {
        resetLogFields();
        setShowLogForm(false);
      }
    });
  };

  const openFormalPedigreePreview = (subject: Animal) => {
    const primaryPhotoRecord = settings.includePhotoOnPedigree
      ? primaryPhotoByAnimalId.get(subject.id)
      : undefined;
    const primaryPhoto = primaryPhotoRecord
      ? primaryPhotoRecord.dataUrl ||
        (hydratedPedigreePhoto?.photoId === primaryPhotoRecord.id
          ? hydratedPedigreePhoto.dataUrl
          : primaryPhotoRecord.thumbnailDataUrl)
      : undefined;
    setBatchPrintSubjects(null);
    setBatchHydratedPhotos({});
    setPedigreeDocMode('formal_certificate');
    setPreviewDoc({
      title: `Formal Pedigree (.HTM / PDF) — ${subject.name}`,
      filename: `pedigree-${subject.tattoo || subject.id}.htm`,
      isPedigree: true,
      pedigreeSubject: subject,
      html: generateEvansHtmPedigree(
        subject,
        allAnimals,
        speciesProfiles,
        settings,
        settings.defaultGenerations,
        primaryPhoto,
        {
          ...pedigreePrintOptions,
          shows,
          careLogs,
          woolHarvests,
          ancestorPhotosByAnimalId:
            pedigreePrintOptions.layoutPreset === 'family_portrait'
              ? familyPortraitPhotosByAnimalId
              : undefined,
        }
      ),
    });
  };

  const openBirthCertificatePreview = (subject: Animal) => {
    setBatchPrintSubjects(null);
    setBatchHydratedPhotos({});
    setBirthCertOptions((prev) => ({
      ...prev,
      companionFamilyName: subject.buyerName || prev.companionFamilyName || '',
    }));
    const primaryRec = primaryPhotoByAnimalId.get(subject.id);
    const photoUrl =
      primaryRec && birthCertOptions.includePrimaryPhoto
        ? primaryRec.dataUrl || primaryRec.thumbnailDataUrl
        : undefined;
    setPreviewDoc({
      title: `Pet Birth Certificate — ${subject.name}`,
      filename: buildPetBirthCertificateFileName(subject),
      birthCertSubject: subject,
      html: generatePetBirthCertificateHtml(subject, allAnimals, speciesProfiles, settings, {
        primaryPhotoDataUrl: photoUrl,
        companionFamilyName: subject.buyerName || birthCertOptions.companionFamilyName,
        keepsakeMessage: birthCertOptions.keepsakeMessage,
      }),
    });
  };

  const openBatchPrintPreview = () => {
    const resolved = resolveBatchPrintAnimals(
      checkedIds,
      filteredAnimals,
      animals,
      speciesProfile.name
    );
    if (resolved.length === 0) return;
    setPreviewDoc(null);
    setHydratedPedigreePhoto(null);
    setBatchHydratedPhotos({});
    setBatchPrintSubjects(resolved);
  };

  const batchPhotoDataUrlByAnimalId = useMemo<Record<string, string> | undefined>(() => {
    if (!batchPrintSubjects || !batchPrintOptions.includePhotos) return undefined;
    const map: Record<string, string> = {};
    for (const animal of batchPrintSubjects) {
      const primary = primaryPhotoByAnimalId.get(animal.id);
      if (!primary) continue;
      const src =
        primary.dataUrl || batchHydratedPhotos[primary.id] || primary.thumbnailDataUrl || '';
      if (src) {
        map[animal.id] = src;
      }
    }
    return map;
  }, [
    batchPrintSubjects,
    batchPrintOptions.includePhotos,
    primaryPhotoByAnimalId,
    batchHydratedPhotos,
  ]);

  const appBaseUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';

  const batchPrintHtml = useMemo(() => {
    if (!batchPrintSubjects || batchPrintSubjects.length === 0) return '';
    return generateBatchPrintHtml({
      subjects: batchPrintSubjects,
      allAnimals,
      speciesProfiles,
      settings,
      speciesName: speciesProfile.name,
      options: batchPrintOptions,
      photoDataUrlByAnimalId: batchPhotoDataUrlByAnimalId,
      appBaseUrl,
    });
  }, [
    batchPrintSubjects,
    allAnimals,
    speciesProfiles,
    settings,
    speciesProfile.name,
    batchPrintOptions,
    batchPhotoDataUrlByAnimalId,
    appBaseUrl,
  ]);

  const batchPrintPageCount = useMemo(
    () =>
      batchPrintSubjects
        ? computeBatchPrintPageCount(batchPrintSubjects.length, batchPrintOptions)
        : 0,
    [batchPrintSubjects, batchPrintOptions]
  );

  return (
    <div className="space-y-5">
      {/* Dedicated Single Animal Profile View */}
      {activeAnimal ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onSelectAnimal(null)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Back to {speciesProfile.name} Herd
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={inlineAnimalLock.isKeyLocked(`archive-${activeAnimal.id}`)}
                onClick={() =>
                  void inlineAnimalLock.runKeyLocked(`archive-${activeAnimal.id}`, () =>
                    onArchiveAnimals([activeAnimal.id], !isAnimalArchived(activeAnimal))
                  )
                }
                className={`min-h-[40px] px-3.5 py-2 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-55 ${
                  isAnimalArchived(activeAnimal)
                    ? 'border-[var(--barn-sage)] text-[var(--barn-sage)] bg-[var(--barn-sage-tint)]'
                    : 'border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)]'
                }`}
              >
                {isAnimalArchived(activeAnimal) ? (
                  <>
                    <ArchiveRestore className="w-3.5 h-3.5" aria-hidden="true" />
                    Restore to Active Herd
                  </>
                ) : (
                  <>
                    <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                    Move to Archived
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  setMigrationModalState({ mode: 'single', animalIds: [activeAnimal.id] })
                }
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
                Move Species
              </button>
            </div>
          </div>

          {activeAnimalWithdrawal?.isActive && (
            <div
              role="status"
              className="bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <ShieldAlert
                  className="w-5 h-5 text-[var(--barn-terracotta)] mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <div className="text-xs space-y-1 min-w-0">
                  <div className="font-semibold text-[var(--barn-ink)] font-mono tabular-nums">
                    Active Medication Withdrawal · {activeAnimalWithdrawal.countdownLabel} · Clears{' '}
                    {formatReadableDate(activeAnimalWithdrawal.clearDateIso)}
                  </div>
                  <p className="text-[var(--barn-muted)]">
                    Medications: <strong className="text-[var(--barn-ink)]">{activeAnimalWithdrawal.medicationSummary}</strong>.
                    Hold off on processing, sale without disclosure, or exhibition overlapping the withdrawal window.
                  </p>
                </div>
              </div>
            </div>
          )}

          {doesAnimalNeedAttention(activeAnimal) && (
            <div className="bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <AlertCircle
                  className="w-5 h-5 text-[var(--barn-terracotta)] mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    This {speciesProfile.name.toLowerCase()} record is marked Needs Attention
                  </div>
                  <p className="text-[var(--barn-muted)]">
                    Complete any missing details ({idLabels.shortLabel.toLowerCase()}, breed, pedigree, or owner), then resolve
                    to clear the Home &amp; Hub reminders.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 max-w-full">
                <button
                  type="button"
                  onClick={() => {
                    setEditingAnimal(activeAnimal);
                    setShowAnimalModal(true);
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                  Edit Details
                </button>
                <button
                  type="button"
                  disabled={inlineAnimalLock.isKeyLocked(`attention-${activeAnimal.id}`)}
                  onClick={() =>
                    void inlineAnimalLock.runKeyLocked(`attention-${activeAnimal.id}`, () =>
                      onSaveAnimal({ ...activeAnimal, needsAttention: false })
                    )
                  }
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Mark Attention Resolved
                </button>
              </div>
            </div>
          )}

          {/* Profile Conflict Alert OR Ignored Soft Warning */}
          {(() => {
            const conflictSummary = conflictsByAnimalId.get(activeAnimal.id);
            if (!conflictSummary || !conflictSummary.hasAnyConflict) return null;
            const urgent = conflictSummary.hasActiveConflict;
            return (
              <div
                role={urgent ? 'alert' : 'status'}
                className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                  urgent
                    ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)]'
                    : 'bg-[var(--barn-surface)] border-[var(--barn-terracotta)]/65 border-dashed'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  {urgent ? (
                    <ShieldAlert
                      className="w-5 h-5 text-[var(--barn-terracotta)] mt-0.5 shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <AlertTriangle
                      className="w-5 h-5 text-[var(--barn-terracotta)]/85 mt-0.5 shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <div className="text-xs space-y-1.5 min-w-0">
                    <div className="font-semibold text-[var(--barn-ink)]">
                      {urgent
                        ? 'Profile Data Conflict Detected'
                        : 'Soft Warning — Conflict Alert Ignored'}
                    </div>
                    <ul className="space-y-1 text-[var(--barn-muted)]">
                      {conflictSummary.duplicateTattooPeers.length > 0 && (
                        <li>
                          Same {speciesProfile.name} {idLabels.shortLabel.toLowerCase()} &ldquo;
                          <span className="font-mono font-semibold text-[var(--barn-ink)]">
                            {activeAnimal.tattoo}
                          </span>
                          &rdquo; matches:{' '}
                          {conflictSummary.duplicateTattooPeers.map((dp, idx) => (
                            <React.Fragment key={dp.peer.id}>
                              {idx > 0 && ', '}
                              <button
                                type="button"
                                onClick={() => onSelectAnimal(dp.peer.id)}
                                className="underline font-medium text-[var(--barn-ink)] hover:text-[var(--barn-sage)]"
                              >
                                {dp.peer.name} ({formatSexForSpecies(dp.peer.sex, speciesProfile)})
                              </button>
                            </React.Fragment>
                          ))}
                        </li>
                      )}
                      {conflictSummary.sireSexMismatch && (
                        <li>
                          Linked Sire{' '}
                          <button
                            type="button"
                            onClick={() => onSelectAnimal(conflictSummary.sireSexMismatch!.parent.id)}
                            className="underline font-medium text-[var(--barn-ink)] hover:text-[var(--barn-sage)]"
                          >
                            {conflictSummary.sireSexMismatch.parent.name}
                          </button>{' '}
                          is recorded as{' '}
                          <strong>
                            {formatSexForSpecies(conflictSummary.sireSexMismatch.actualSex, speciesProfile)}
                          </strong>{' '}
                          instead of {speciesProfile.maleLabel}.
                        </li>
                      )}
                      {conflictSummary.damSexMismatch && (
                        <li>
                          Linked Dam{' '}
                          <button
                            type="button"
                            onClick={() => onSelectAnimal(conflictSummary.damSexMismatch!.parent.id)}
                            className="underline font-medium text-[var(--barn-ink)] hover:text-[var(--barn-sage)]"
                          >
                            {conflictSummary.damSexMismatch.parent.name}
                          </button>{' '}
                          is recorded as{' '}
                          <strong>
                            {formatSexForSpecies(conflictSummary.damSexMismatch.actualSex, speciesProfile)}
                          </strong>{' '}
                          instead of {speciesProfile.femaleLabel}.
                        </li>
                      )}
                    </ul>
                    {conflictSummary.isIgnoredWithSoftWarning && (
                      <p className="text-[11px] text-[var(--barn-muted)]">
                        Active alert is ignored, but this soft warning stays visible until the
                        underlying duplicate {idLabels.shortLabel.toLowerCase()} or parent sex mismatch is fixed.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 max-w-full">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAnimal(activeAnimal);
                      setShowAnimalModal(true);
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                    Edit Details
                  </button>
                  {urgent && onIgnoreConflicts && (
                    <button
                      type="button"
                      onClick={() => onIgnoreConflicts(activeAnimal.id, conflictSummary.activeKinds)}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] whitespace-nowrap"
                    >
                      Ignore Conflict (Keep Soft Warning)
                    </button>
                  )}
                  {!urgent && onRestoreConflictAlert && (
                    <button
                      type="button"
                      onClick={() => onRestoreConflictAlert(activeAnimal.id)}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                      Re-enable Alert
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {activeAnimal.offloadedArchiveKey && (
            <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5 min-w-0">
                <div className="font-semibold text-[var(--barn-ink)] flex items-center gap-1.5">
                  <Archive className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  <span>Pedigree Reference Stub (Photos &amp; Care Logs in OPFS /archives)</span>
                </div>
                <p className="text-[var(--barn-muted)]">
                  Full-resolution photos and historical care logs were offloaded
                  {activeAnimal.offloadedAtIso
                    ? ` on ${new Date(activeAnimal.offloadedAtIso).toLocaleDateString()}`
                    : ''}{' '}
                  while keeping lineage links intact for descendants.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 max-w-full">
                {onRestoreArchivedHerdBundle && (
                  <button
                    type="button"
                    onClick={() =>
                      void onRestoreArchivedHerdBundle(activeAnimal.offloadedArchiveKey!, {
                        restoreToActiveStatus: false,
                        deleteArchiveAfterRestore: true,
                      })
                    }
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" aria-hidden="true" />
                    Restore Full Photos &amp; Logs
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowArchivedHerdsModal(true)}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap"
                >
                  Open /archives
                </button>
              </div>
            </div>
          )}

          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-6">
            {/* Header & Cage-Side Print/Tree Actions */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-[var(--barn-border)] pb-5">
              <div className="space-y-1">
                <div className="text-xs text-[var(--barn-muted)] font-mono">
                  {activeAnimal.tattoo || 'UNMARKED'} · {activeAnimal.species} ·{' '}
                  {activeAnimal.status}
                  {normalizeOwnershipType(activeAnimal.ownershipType) !== 'Owned'
                    ? ` · ${normalizeOwnershipType(activeAnimal.ownershipType)}`
                    : ''}
                  {activeAnimal.culled ? ' · Flagged for Cull' : ''}
                  {isAnimalArchived(activeAnimal) ? ' · Archived (Pedigree Retained)' : ''}
                  {activeAnimal.cageLocation ? ` · ${activeAnimal.cageLocation}` : ''}
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-semibold">
                  {activeAnimal.name}
                </h2>
                <p className="text-sm text-[var(--barn-muted)]">
                  {formatSexForSpecies(activeAnimal.sex, speciesProfile)} · {activeAnimal.breed}{' '}
                  {activeAnimal.variety} · DOB {formatReadableDate(activeAnimal.birthDateIso)}
                </p>
                {(activeAnimal.culled ||
                  activeAnimal.status === 'Sold' ||
                  activeAnimal.status === 'Deceased') && (
                  <p className="text-xs text-[var(--barn-muted)] font-mono tabular-nums pt-0.5">
                    {[
                      activeAnimal.culled
                        ? `Cull Flag${activeAnimal.cullDateIso ? ` (${formatReadableDate(activeAnimal.cullDateIso)})` : ''}${activeAnimal.cullReason ? `: ${activeAnimal.cullReason}` : ''}`
                        : '',
                      activeAnimal.status === 'Sold' &&
                      (activeAnimal.soldDateIso ||
                        (activeAnimal.salePriceCents ?? 0) > 0 ||
                        activeAnimal.buyerName)
                        ? `Sold${activeAnimal.soldDateIso ? ` ${formatReadableDate(activeAnimal.soldDateIso)}` : ''}${(activeAnimal.salePriceCents ?? 0) > 0 ? ` · ${formatCurrencyCents(activeAnimal.salePriceCents, settings.currencyCode)}` : ''}${activeAnimal.buyerName ? ` · Buyer: ${activeAnimal.buyerName}` : ''}`
                        : '',
                      activeAnimal.status === 'Deceased' &&
                      (activeAnimal.deceasedDateIso || activeAnimal.deathCause)
                        ? `Deceased${activeAnimal.deceasedDateIso ? ` ${formatReadableDate(activeAnimal.deceasedDateIso)}` : ''}${activeAnimal.deathCause ? ` · Cause: ${activeAnimal.deathCause}` : ''}`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>

              <div className="space-y-2 shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenPedigreeForAnimal(activeAnimal.id)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <GitFork className="w-3.5 h-3.5" aria-hidden="true" />
                    Pedigree Tree
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewDoc({
                        title: `Cage Card — ${activeAnimal.name}`,
                        filename: `cage-card-${activeAnimal.tattoo || activeAnimal.id}.htm`,
                        html: generateThermalCageCardHtml(
                          activeAnimal,
                          allAnimals,
                          speciesProfiles,
                          settings,
                          {
                            includeQrCode: includeThermalCageCardQr,
                            appBaseUrl,
                          }
                        ),
                        cageCardSubject: activeAnimal,
                        hasGenetics: Boolean(
                          activeAnimal.genotypeRaw || activeAnimal.genotype.length > 0
                        ),
                      })
                    }
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                    Cage Card
                  </button>
                  <button
                    type="button"
                    onClick={() => openFormalPedigreePreview(activeAnimal)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                    .HTM / PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => openBirthCertificatePreview(activeAnimal)}
                    title="Print keepsake Birth Certificate (omits breeder contact & sale pricing)"
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Award className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                    Birth Cert
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAnimal(activeAnimal);
                      setShowAnimalModal(true);
                    }}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                    Edit
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <PedigreePrintNotice compact />
                  {primaryPhotoByAnimalId.has(activeAnimal.id) && (
                    <label className="flex items-center gap-2 text-xs text-[var(--barn-muted)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(settings.includePhotoOnPedigree)}
                        onChange={(e) => onToggleIncludePhotoOnPedigree(e.target.checked)}
                      />
                      <span>Print primary photo on .HTM / PDF pedigree</span>
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Key Metrics Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs border-b border-[var(--barn-border)] pb-5">
              <div>
                <div className="text-[var(--barn-muted)]">Weight</div>
                <div className="font-mono text-sm font-semibold tabular-nums mt-0.5">
                  {formatWeight(activeAnimal.weightGrams, effectiveWeightUnit)}
                </div>
              </div>
              <div>
                <div className="text-[var(--barn-muted)]">Wright COI</div>
                {(() => {
                  const activeCoi = visibleCoiByAnimalId.get(activeAnimal.id);
                  const comp = activeCoi ? getPedigreeCompletenessSummary(activeCoi) : null;
                  return (
                    <div className="mt-0.5">
                      <div className="font-mono text-sm font-semibold tabular-nums">
                        {(activeCoi?.coiPercent ?? 0).toFixed(2)}% (
                        {activeCoi?.risk.label || 'Outcross'})
                      </div>
                      {comp && (
                        <div className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                          {comp.known3Gen}/{comp.max3Gen} 3-gen ({comp.percent3Gen}%)
                          {comp.isIncompleteZeroOutcross ? ' · incomplete pedigree' : ''}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div>
                <div className="text-[var(--barn-muted)]">Registration / GC</div>
                <div className="font-mono text-sm font-semibold mt-0.5 truncate">
                  {activeAnimal.registrationNumber || 'Unregistered'}
                  {activeAnimal.grandChampionNumber
                    ? ` · ${activeAnimal.grandChampionNumber}`
                    : ''}
                </div>
              </div>
              <div>
                <div className="text-[var(--barn-muted)]">Show Legs / GC</div>
                <div className="font-mono text-sm font-semibold tabular-nums mt-0.5">
                  {activeAnimalShowSummary?.effectiveLegs ?? activeAnimal.legsCount}
                </div>
                {activeAnimalShowSummary && (
                  <div className="text-[11px] font-mono text-[var(--barn-sage)] truncate">
                    {activeAnimalShowSummary.gcProgress.shortLabel}
                  </div>
                )}
              </div>
            </div>

            {/* Multi-Photo Optimized Animal Gallery */}
            <AnimalPhotoGallery
              animal={activeAnimal}
              photos={photosByAnimalId.get(activeAnimal.id) || []}
              optimizationPresetId={settings.imageOptimizationPreset}
              onLoadFullPhoto={onLoadFullPhoto}
              onAddPhotos={async (payloads) => {
                await onAddAnimalPhotos(activeAnimal, payloads);
              }}
              onSetPrimary={(photoId) => onSetPrimaryAnimalPhoto(activeAnimal.id, photoId)}
              onUpdateCaption={(photoId, caption) =>
                onUpdateAnimalPhotoCaption(photoId, caption)
              }
              onDeletePhoto={(photoId) => onDeleteAnimalPhoto(photoId)}
            />

            {/* Direct Lineage Links (Sire, Dam, Offspring) */}
            <div className="space-y-3 border-b border-[var(--barn-border)] pb-5">
              <h3 className="text-sm font-semibold">Direct Lineage</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {(['sireId', 'damId'] as const).map((field) => {
                  const isSire = field === 'sireId';
                  const parent = activeAnimal[field] ? herdById.get(activeAnimal[field]) : null;
                  const activeConflict = conflictsByAnimalId.get(activeAnimal.id);
                  const sexMismatch = isSire
                    ? activeConflict?.sireSexMismatch
                    : activeConflict?.damSexMismatch;
                  return (
                    <div
                      key={field}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                        sexMismatch
                          ? 'bg-[var(--barn-terracotta-tint)]/55 border-[var(--barn-terracotta)]'
                          : 'bg-[var(--barn-canvas)] border-[var(--barn-border)]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-[var(--barn-muted)]">
                          {isSire
                            ? `Sire (${speciesProfile.maleLabel})`
                            : `Dam (${speciesProfile.femaleLabel})`}
                        </div>
                        {parent ? (
                          <>
                            <button
                              type="button"
                              onClick={() => onSelectAnimal(parent.id)}
                              className="font-medium text-sm underline hover:text-[var(--barn-sage)] truncate block mt-0.5"
                            >
                              {parent.name} ({parent.tattoo || 'No ID'})
                              {isAnimalArchived(parent) ? ' [Archived]' : ''}
                            </button>
                            {sexMismatch && (
                              <div className="text-[11px] font-medium text-[var(--barn-terracotta)] mt-0.5 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
                                Sex mismatch: recorded as{' '}
                                {formatSexForSpecies(sexMismatch.actualSex, speciesProfile)}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-sm text-[var(--barn-muted)] italic mt-0.5">
                            Unknown / Foundation
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {offspring.length > 0 && (
                <div className="text-xs text-[var(--barn-muted)] pt-1">
                  Recorded {speciesProfile.offspringLabel}s ({offspring.length}):{' '}
                  {offspring.map((kid, idx) => (
                    <React.Fragment key={kid.id}>
                      {idx > 0 && ' · '}
                      <button
                        type="button"
                        onClick={() => onSelectAnimal(kid.id)}
                        className="underline text-[var(--barn-ink)] hover:text-[var(--barn-sage)]"
                      >
                        {kid.name} ({kid.tattoo})
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>

            {/* Show Honors, Grand Champion Progress & E-Leg Vault */}
            {activeAnimalShowSummary &&
              (activeAnimalShowSummary.showsEntered > 0 ||
                activeAnimalShowSummary.effectiveLegs > 0 ||
                Boolean(activeAnimal.grandChampionNumber) ||
                activeAnimalShowSummary.eLegAttachments.length > 0) && (
                <div className="space-y-3 border-b border-[var(--barn-border)] pb-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                      <span>Show Honors, GC Progress &amp; E-Leg Vault</span>
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-lg text-xs font-mono font-semibold ${
                        activeAnimalShowSummary.gcProgress.isGrandChampion ||
                        activeAnimalShowSummary.gcProgress.isEligible
                          ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                          : 'bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-ink)]'
                      }`}
                    >
                      {activeAnimalShowSummary.gcProgress.statusLabel}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
                      <span>
                        Shows: <strong>{activeAnimalShowSummary.showsEntered}</strong>
                        {activeAnimalShowSummary.awardsSummaryText
                          ? ` · Awards: ${activeAnimalShowSummary.awardsSummaryText}`
                          : ''}
                        {activeAnimalShowSummary.totalPoints > 0
                          ? ` · Points: ${activeAnimalShowSummary.totalPoints}`
                          : ''}
                      </span>
                      <span className="text-[var(--barn-muted)]">
                        {activeAnimalShowSummary.gcProgress.progressPercent}% toward{' '}
                        {activeAnimalShowSummary.gcProgress.legsTarget}-leg GC
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--barn-surface)] border border-[var(--barn-border)] overflow-hidden">
                      <div
                        className="h-full bg-[var(--barn-sage)] transition-all"
                        style={{
                          width: `${activeAnimalShowSummary.gcProgress.progressPercent}%`,
                        }}
                      />
                    </div>
                  </div>

                  {activeAnimalShowSummary.entries.length > 0 && (
                    <div className="space-y-2 text-xs">
                      {activeAnimalShowSummary.entries.map((entry) => (
                        <div
                          key={entry.showId}
                          className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-1"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-semibold text-[var(--barn-ink)]">
                              {entry.showName}{' '}
                              <span className="font-normal text-[var(--barn-muted)]">
                                · {entry.sanctioningBody} · {formatReadableDate(entry.eventDateIso)}
                                {entry.location ? ` · ${entry.location}` : ''}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {entry.result?.classPlacement && (
                                <span className="px-1.5 py-0.5 rounded bg-[var(--barn-surface)] border border-[var(--barn-border)] font-medium text-[10.5px]">
                                  {entry.result.classPlacement}
                                </span>
                              )}
                              {entry.result?.awards.map((code) => (
                                <span
                                  key={code}
                                  className="px-1.5 py-0.5 rounded bg-[var(--barn-sage-tint)] text-[var(--barn-sage)] font-mono font-semibold text-[10px]"
                                >
                                  {code}
                                </span>
                              ))}
                              {(entry.result?.legsEarned ?? 0) > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-[var(--barn-terracotta-tint)] text-[var(--barn-terracotta)] font-mono font-semibold text-[10px]">
                                  +{entry.result!.legsEarned} Leg
                                  {entry.result!.legsEarned === 1 ? '' : 's'}
                                </span>
                              )}
                              {(entry.result?.pointsEarned ?? 0) > 0 && (
                                <span className="font-mono text-[10.5px] text-[var(--barn-muted)]">
                                  {entry.result!.pointsEarned} pts
                                </span>
                              )}
                            </div>
                          </div>
                          {(entry.result?.judgeName ||
                            entry.result?.legCertificateNumber ||
                            entry.result?.judgeNotes) && (
                            <div className="text-[11px] text-[var(--barn-muted)]">
                              {entry.result.judgeName ? `Judge: ${entry.result.judgeName}` : ''}
                              {entry.result.judgeName && entry.result.legCertificateNumber
                                ? ' · '
                                : ''}
                              {entry.result.legCertificateNumber
                                ? `Cert #${entry.result.legCertificateNumber}`
                                : ''}
                              {(entry.result.judgeName || entry.result.legCertificateNumber) &&
                              entry.result.judgeNotes
                                ? ' — '
                                : ''}
                              {entry.result.judgeNotes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {activeAnimalShowSummary.eLegAttachments.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium text-[var(--barn-muted)]">
                        E-Leg Certificate Vault ({activeAnimalShowSummary.eLegAttachments.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {activeAnimalShowSummary.eLegAttachments.map((att) => (
                          <button
                            key={att.id}
                            type="button"
                            onClick={() =>
                              setELegLightbox({
                                imageUrl: att.dataUrl || att.thumbnailDataUrl,
                                title: `${activeAnimal.name} — ${att.showName}`,
                                subtitle: [
                                  att.caption || att.fileName,
                                  att.legCertificateNumber
                                    ? `Cert #${att.legCertificateNumber}`
                                    : '',
                                  formatReadableDate(att.eventDateIso),
                                ]
                                  .filter(Boolean)
                                  .join(' · '),
                              })
                            }
                            className="group w-20 rounded-xl overflow-hidden border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:border-[var(--barn-sage)] text-left"
                          >
                            <img
                              src={att.thumbnailDataUrl || att.dataUrl}
                              alt={att.caption || att.fileName}
                              className="w-full h-16 object-cover"
                            />
                            <div className="px-1.5 py-1 text-[10px] truncate text-[var(--barn-muted)]">
                              {att.caption || att.showName}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

            {/* Coat Color Genotype, Carrier Disclosures & Allele Inference Panel */}
            {(activeAnimal.genotypeRaw ||
              activeAnimal.genotype.length > 0 ||
              speciesGeneticsSpec ||
              activeAnimal.rufusLevel ||
              activeCarriers.hasAny ||
              Boolean(activeLineageAnalysis?.hasAnyLineagePotential) ||
              (activeLineageAnalysis?.genotypeCleared.length ?? 0) > 0 ||
              (activeLineageAnalysis?.blockedBranches.length ?? 0) > 0) && (
              <div className="space-y-3 border-b border-[var(--barn-border)] pb-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">
                      Genetics, Carrier Disclosures &amp; Allele Inference
                    </h3>
                    <ColorGeneticsNotice compact />
                  </div>
                  {alleleInference && alleleInference.notes.length > 0 && (
                    <button
                      type="button"
                      disabled={inlineAnimalLock.isKeyLocked(`alleles-${activeAnimal.id}`)}
                      onClick={() =>
                        void inlineAnimalLock.runKeyLocked(`alleles-${activeAnimal.id}`, () =>
                          onSaveAnimal({
                            ...activeAnimal,
                            genotype: alleleInference.updatedPairs,
                            genotypeRaw: alleleInference.formatted,
                          })
                        )
                      }
                      className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold whitespace-nowrap disabled:opacity-60"
                    >
                      Save Inferred Alleles ({alleleInference.notes.length})
                    </button>
                  )}
                </div>

                {(activeAnimal.genotypeRaw ||
                  activeAnimal.genotype.length > 0 ||
                  speciesGeneticsSpec ||
                  activeAnimal.rufusLevel) && (
                  <div className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm">
                    <ColoredGenotypeDisplay
                      provenance={activeAlleleProvenance}
                      fallbackText={
                        activeAnimal.genotypeRaw ||
                        formatGenotypeArray(activeAnimal.genotype) ||
                        'No loci entered yet'
                      }
                      showLegend
                    />
                    {activeAnimal.rufusLevel && (
                      <span className="text-xs font-medium text-[var(--barn-terracotta)] shrink-0">
                        Rufus Intensity: {activeAnimal.rufusLevel}
                      </span>
                    )}
                  </div>
                )}

                {(activeCarriers.hasAny || (activeLineageAnalysis?.genotypeCleared.length ?? 0) > 0) && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                      <div className="text-[var(--barn-muted)] font-medium">Confirmed Carrier Of</div>
                      <div className="mt-1 font-medium text-[var(--barn-ink)]">
                        {activeCarriers.confirmed.length > 0
                          ? activeCarriers.confirmed.join(', ')
                          : 'None recorded'}
                      </div>
                    </div>
                    <div className="px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                      <div className="text-[var(--barn-muted)] font-medium">Suspected Carrier Of</div>
                      <div className="mt-1 font-medium text-[var(--barn-terracotta)]">
                        {activeCarriers.suspected.length > 0
                          ? activeCarriers.suspected.join(', ')
                          : 'None recorded'}
                      </div>
                    </div>
                    <div className="px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                      <div className="text-[var(--barn-muted)] font-medium">
                        Cleared / Verified Non-Carrier
                      </div>
                      <div className="mt-1 font-medium text-[var(--barn-sage)]">
                        {activeCarriers.cleared.length > 0 ||
                        (activeLineageAnalysis?.genotypeCleared.length ?? 0) > 0
                          ? [
                              ...activeCarriers.cleared.map(
                                (c) => `${c.trait} (${formatClearedProofBadge(c)})`
                              ),
                              ...(activeLineageAnalysis?.genotypeCleared || []).map(
                                (g) => `${g.trait} (${g.pair})`
                              ),
                            ].join(', ')
                          : 'None recorded'}
                      </div>
                    </div>
                  </div>
                )}

                {activeLineageAnalysis && activeLineageAnalysis.lineagePotential.length > 0 && (
                  <div className="px-3 py-2.5 rounded-xl bg-[var(--barn-terracotta-tint)]/60 border border-[var(--barn-terracotta)]/70 text-xs space-y-1">
                    <div className="font-semibold text-[var(--barn-ink)]">
                      Lineage Potential Carriers (Inherited from Uncleared Pedigree Branches)
                    </div>
                    {activeLineageAnalysis.lineagePotential.map((lp) => (
                      <div key={lp.trait} className="text-[var(--barn-ink)]">
                        <span className="font-medium">{lp.trait}</span>{' '}
                        <span className="text-[var(--barn-muted)]">
                          via {lp.viaBranches.join(' & ')} line (
                          {lp.sourceAncestors
                            .slice(0, 2)
                            .map((s) => `${s.name} [Gen ${s.generation}, ${s.status}]`)
                            .join(', ')}
                          )
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {activeLineageAnalysis && activeLineageAnalysis.blockedBranches.length > 0 && (
                  <div className="px-3 py-2 rounded-xl bg-[var(--barn-sage-tint)]/60 border border-[var(--barn-sage)]/70 text-xs space-y-0.5">
                    <div className="font-medium text-[var(--barn-ink)]">
                      Cleared Pedigree Branch Firewalls Active
                    </div>
                    {activeLineageAnalysis.blockedBranches.map((blk, i) => (
                      <div
                        key={`${blk.branch}-${blk.trait}-${i}`}
                        className="text-[11px] text-[var(--barn-muted)]"
                      >
                        {blk.trait} on {blk.branch} line stopped by{' '}
                        <strong className="text-[var(--barn-ink)]">{blk.clearedByName}</strong> (
                        {blk.proofLabel})
                      </div>
                    ))}
                  </div>
                )}

                {alleleInference && alleleInference.notes.length > 0 && (
                  <div className="space-y-1 text-xs text-[var(--barn-sage)]">
                    {alleleInference.notes.map((n, i) => {
                      const locusDef = speciesGeneticsSpec?.loci.find((l) => l.locus === n.locus);
                      return (
                        <div key={i}>
                          Inferred {locusDef ? `${locusDef.name} (${n.locus})` : n.locus}:{' '}
                          <span className="font-mono">{n.before}</span> →{' '}
                          <span className="font-mono font-semibold">{n.after}</span> — {n.reason}
                        </div>
                      );
                    })}
                  </div>
                )}

                {alleleInference && alleleInference.conflicts.length > 0 && (
                  <div className="space-y-1 text-xs text-[var(--barn-danger)] font-medium">
                    {alleleInference.conflicts.map((c, i) => (
                      <div key={i}>Genetic Conflict: {c}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Weight Sparkline & Cage-Side Care / Show Leg Journal */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">
                    Weights, Show Legs &amp; Care Journal ({activeAnimalLogs.length})
                  </h3>
                  <p className="text-xs text-[var(--barn-muted)]">
                    Logging a weight or show leg updates {activeAnimal.name}&apos;s record
                    automatically
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {onCompareGrowthForAnimals && (
                    <button
                      type="button"
                      onClick={() => onCompareGrowthForAnimals([activeAnimal.id])}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <TrendingUp className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                      Growth Chart
                    </button>
                  )}
                  <button
                    type="button"
                    aria-expanded={showLogForm}
                    onClick={() => setShowLogForm((v) => !v)}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    Log Weight / Care
                  </button>
                </div>
              </div>

              {weightPoints.length >= 2 && (
                <WeightTrendSvg points={weightPoints} unit={effectiveWeightUnit} />
              )}

              {showLogForm && (
                <form
                  onSubmit={submitCareLog}
                  className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3 text-xs"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <select
                      aria-label="Care or weight log entry type"
                      value={logType}
                      onChange={(e) => setLogType(e.target.value as CareLogType)}
                      className="min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]"
                    >
                      {CARE_LOG_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      aria-label="Entry date"
                      value={logDateIso}
                      onChange={(e) => setLogDateIso(e.target.value)}
                      className="min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono"
                    />
                    <input
                      type="number"
                      aria-label={`Weight (${weightMeta.shortUnit})`}
                      step="0.01"
                      min="0"
                      placeholder={`Weight (${weightMeta.shortUnit})`}
                      value={logWeightInput}
                      onChange={(e) => setLogWeightInput(e.target.value)}
                      className="min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono tabular-nums"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      aria-label="Short summary"
                      placeholder="Short summary (e.g. 12-week cage weight)"
                      value={logTitle}
                      onChange={(e) => setLogTitle(e.target.value)}
                      className="min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]"
                    />
                    <label className="flex items-center gap-2 px-2">
                      <input
                        type="checkbox"
                        checked={logShowLeg}
                        onChange={(e) => setLogShowLeg(e.target.checked)}
                      />
                      <span>Earned Official Show Leg (+1 leg)</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    aria-label="Optional notes"
                    placeholder="Optional notes"
                    value={logNotes}
                    onChange={(e) => setLogNotes(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]"
                  />

                  {logType === 'Health / Vet' && (
                    <div className="p-3 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-2">
                      <div className="font-semibold text-[var(--barn-ink)]">
                        Medication &amp; Withdrawal Details
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <input
                          type="text"
                          aria-label="Medication or vaccine name"
                          placeholder="Medication / vaccine name"
                          value={logMedicationName}
                          onChange={(e) => setLogMedicationName(e.target.value)}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                        />
                        <input
                          type="text"
                          aria-label="Dosage"
                          placeholder="Dosage (e.g. 0.5 mL)"
                          value={logDosage}
                          onChange={(e) => setLogDosage(e.target.value)}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                        />
                        <div>
                          <input
                            type="text"
                            aria-label="Administration route"
                            list="care-admin-route-suggestions"
                            placeholder="Route (e.g. Oral, SubQ)"
                            value={logAdministrationRoute}
                            onChange={(e) => setLogAdministrationRoute(e.target.value)}
                            className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                          />
                          <datalist id="care-admin-route-suggestions">
                            <option value="Oral" />
                            <option value="SubQ" />
                            <option value="IM" />
                            <option value="Topical" />
                            <option value="Ear / Drops" />
                          </datalist>
                        </div>
                        <input
                          type="number"
                          aria-label="Withdrawal days"
                          min="0"
                          max="365"
                          placeholder="Withdrawal days"
                          value={logWithdrawalDays}
                          onChange={(e) => setLogWithdrawalDays(e.target.value)}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                        />
                      </div>
                      {(Number(logWithdrawalDays) || 0) > 0 && (logDateIso || todayDateIso()) && (
                        <div className="text-[11px] font-mono text-[var(--barn-terracotta)]">
                          Withdrawal clears:{' '}
                          {formatReadableDate(
                            addDaysIso(
                              logDateIso || todayDateIso(),
                              Math.round(Number(logWithdrawalDays) || 0)
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {logType === 'Health Score / BCS' && (
                    <div className="p-3 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-2">
                      <div className="font-semibold text-[var(--barn-ink)]">
                        Body Condition &amp; Parasite Scores
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="number"
                          aria-label="Body condition score"
                          step="0.5"
                          min="0"
                          max="9"
                          placeholder="BCS (e.g. 1–5 or 1–9)"
                          value={logBodyConditionScore}
                          onChange={(e) => setLogBodyConditionScore(e.target.value)}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                        />
                        <input
                          type="number"
                          aria-label="FAMACHA eye score"
                          step="1"
                          min="0"
                          max="5"
                          placeholder="FAMACHA eye score (1–5)"
                          value={logFamachaScore}
                          onChange={(e) => setLogFamachaScore(e.target.value)}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                        />
                        <input
                          type="number"
                          aria-label="Fecal egg count (EPG)"
                          step="1"
                          min="0"
                          placeholder="Fecal Egg Count (EPG)"
                          value={logFecalEggCount}
                          onChange={(e) => setLogFecalEggCount(e.target.value)}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                        />
                      </div>
                    </div>
                  )}

                  {(logType === 'Ultrasound' || logType === 'Palpation') && (
                    <div className="p-3 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-2">
                      <div className="font-semibold text-[var(--barn-ink)]">
                        {logType === 'Ultrasound' ? 'Ultrasound Scan Result' : 'Palpation Finding'}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <select
                          aria-label="Scan or palpation result"
                          value={logUltrasoundResult}
                          onChange={(e) =>
                            setLogUltrasoundResult(e.target.value as UltrasoundResult)
                          }
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                        >
                          {ULTRASOUND_RESULTS.map((opt) => (
                            <option key={opt.value || 'none'} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          aria-label="Estimated offspring count"
                          min="0"
                          max="30"
                          placeholder="Estimated offspring count (optional)"
                          value={logUltrasoundFetalCount}
                          onChange={(e) => setLogUltrasoundFetalCount(e.target.value)}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono tabular-nums"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={careLogSubmitLock.isSubmitting}
                      onClick={() => {
                        resetLogFields();
                        setShowLogForm(false);
                      }}
                      className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={careLogSubmitLock.isSubmitting}
                      aria-busy={careLogSubmitLock.isSubmitting}
                      className="min-h-[34px] px-4 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold inline-flex items-center gap-1.5 disabled:opacity-65"
                    >
                      {careLogSubmitLock.isSubmitting && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      )}
                      {careLogSubmitLock.isSubmitting ? 'Saving...' : 'Save Entry'}
                    </button>
                  </div>
                </form>
              )}

              {activeAnimalLogs.length === 0 ? (
                <p className="text-xs text-[var(--barn-muted)]">No care or weight entries yet.</p>
              ) : (
                <div className="divide-y divide-[var(--barn-border)]">
                  {activeAnimalLogs.slice(0, visibleCareLogCount).map((log) => {
                    const extraDetails = [
                      log.medicationName
                        ? `${log.medicationName}${log.dosage ? ` (${log.dosage})` : ''}${log.administrationRoute ? ` via ${log.administrationRoute}` : ''}`
                        : '',
                      (log.withdrawalDays ?? 0) > 0
                        ? `Withdrawal ${log.withdrawalDays}d${log.withdrawalClearDateIso ? ` (clears ${formatReadableDate(log.withdrawalClearDateIso)})` : ''}`
                        : '',
                      (log.bodyConditionScore ?? 0) > 0 ? `BCS ${log.bodyConditionScore}` : '',
                      (log.famachaScore ?? 0) > 0 ? `FAMACHA ${log.famachaScore}` : '',
                      (log.fecalEggCount ?? 0) > 0 ? `FEC ${log.fecalEggCount} EPG` : '',
                      log.ultrasoundResult
                        ? `Scan: ${log.ultrasoundResult}${(log.ultrasoundFetalCount ?? 0) > 0 ? ` (est. ${log.ultrasoundFetalCount})` : ''}`
                        : '',
                      log.notes || '',
                    ]
                      .filter(Boolean)
                      .join(' · ');

                    return (
                      <div
                        key={log.id}
                        className="flex items-center justify-between gap-2 py-2.5 text-xs"
                      >
                        <div>
                          <div className="font-medium">
                            {log.title || log.type}
                            {log.weightGrams > 0 && (
                              <span className="font-mono tabular-nums text-[var(--barn-sage)] ml-2">
                                {formatWeight(log.weightGrams, effectiveWeightUnit)}
                              </span>
                            )}
                            {log.showLegEarned && (
                              <span className="text-[var(--barn-terracotta)] ml-2 font-semibold">
                                +1 Leg
                              </span>
                            )}
                          </div>
                          <div className="text-[var(--barn-muted)]">
                            {formatReadableDate(log.dateIso)} · {log.type}
                            {extraDetails ? ` · ${extraDetails}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteCareLog(log.id)}
                          aria-label="Delete care log"
                          className="min-h-[34px] min-w-[34px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                  {activeAnimalLogs.length > visibleCareLogCount && (
                    <div className="pt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-[var(--barn-muted)]">
                        Showing {visibleCareLogCount} of {activeAnimalLogs.length} care logs
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setVisibleCareLogCount((n) => n + 30)}
                          className="min-h-[44px] sm:min-h-[32px] px-3 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] font-medium"
                        >
                          Show Next 30
                        </button>
                        <button
                          type="button"
                          onClick={() => setVisibleCareLogCount(activeAnimalLogs.length)}
                          className="min-h-[44px] sm:min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-[var(--barn-muted)]"
                        >
                          Show All
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Wool / Fiber Harvests & IAGARB Angora Evaluation */}
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

              {activeAnimalWoolSummary && activeAnimalWoolSummary.harvestCount > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs">
                  <div>
                    <div className="text-[11px] text-[var(--barn-muted)]">Lifetime Total</div>
                    <div className="font-mono font-semibold tabular-nums mt-0.5">
                      {activeAnimalWoolSummary.totalGrams} g ({activeAnimalWoolSummary.harvestCount} clip{activeAnimalWoolSummary.harvestCount === 1 ? '' : 's'})
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[var(--barn-muted)]">Prime vs Grade</div>
                    <div className="font-mono font-semibold tabular-nums mt-0.5">
                      {activeAnimalWoolSummary.primeGrams}g Prime / {activeAnimalWoolSummary.gradeGrams}g Grade
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[var(--barn-muted)]">Latest 90-Day Rate</div>
                    <div className="font-mono font-semibold tabular-nums mt-0.5">
                      {activeAnimalWoolSummary.latest90DayRateGrams !== null
                        ? `${activeAnimalWoolSummary.latest90DayRateGrams} g/90d`
                        : '—'}
                      {activeAnimalWoolSummary.eligibility.meets90DayYieldThreshold && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-[var(--barn-sage-tint)] text-[var(--barn-sage)] text-[10px]">
                          ≥325g Pass
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[var(--barn-muted)]">Best IAGARB Score</div>
                    <div className="font-mono font-semibold tabular-nums mt-0.5">
                      {activeAnimalWoolSummary.highestIagarbScore !== null
                        ? `${activeAnimalWoolSummary.highestIagarbScore.totalPts}/100`
                        : '—'}
                      {activeAnimalWoolSummary.eligibility.meetsPointsThreshold && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-[var(--barn-sage-tint)] text-[var(--barn-sage)] text-[10px]">
                          Reg Eligible
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
                          const lastDate = activeAnimalWoolHarvests[0]?.harvestDateIso;
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
                        <span className="font-mono text-[11px]">
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
                            <span className="text-[11px] text-[var(--barn-muted)] block truncate" title={pos.guidance}>
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

              {activeAnimalWoolHarvests.length > 0 && (
                <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl bg-[var(--barn-surface)]">
                  {activeAnimalWoolHarvests.map((wh) => {
                    const total = wh.primeWeightGrams + wh.gradeWeightGrams;
                    const eq90 = compute90DayEquivalentGrams(total, wh.shearingIntervalDays);
                    const pts = wh.iagarbScore ? computeIagarbScoreTotal(wh.iagarbScore) : null;
                    return (
                      <div key={wh.id} className="px-3 py-2.5 flex items-start justify-between gap-2 text-xs">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5 font-medium">
                            <span className="font-mono">{formatReadableDate(wh.harvestDateIso)}</span>
                            <span className="px-1.5 py-0.5 rounded bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[10.5px]">
                              {wh.harvestMethod}
                            </span>
                            <span className="font-mono tabular-nums font-semibold">
                              {total} g total ({wh.primeWeightGrams}g Prime / {wh.gradeWeightGrams}g Grade)
                            </span>
                            {eq90 !== null && (
                              <span className="font-mono text-[10.5px] text-[var(--barn-muted)]">
                                · {eq90} g/90d
                              </span>
                            )}
                            {pts !== null && (
                              <span
                                className={`px-1.5 py-0.5 rounded font-mono text-[10.5px] font-semibold ${
                                  pts >= 80
                                    ? 'bg-[var(--barn-sage-tint)] text-[var(--barn-sage)]'
                                    : 'bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-muted)]'
                                }`}
                              >
                                IAGARB {pts}/100
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
                            className="min-h-[32px] min-w-[32px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
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

            {activeAnimal.notes && (
              <div className="border-t border-[var(--barn-border)] pt-4 text-xs text-[var(--barn-muted)]">
                <strong className="text-[var(--barn-ink)]">Notes:</strong> {activeAnimal.notes}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Species-Isolated Herd List View with Multi-Select */
        <>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 min-w-0">
              <div className="relative flex-1 max-w-md">
                <Search
                  className="w-4 h-4 text-[var(--barn-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  aria-label={`Search ${speciesProfile.name} by name, ID, or tag`}
                  placeholder={`Search by name, ID, ${idLabels.shortLabel.toLowerCase()}, breed, variety, or cage...`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full min-h-[42px] pl-10 pr-9 py-2 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-sm"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Clear herd search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[30px] min-w-[30px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] overflow-x-auto">
                {(
                  [
                    ['all', `All (${animals.length})`],
                    ['Male', `${speciesProfile.maleLabel}s (${maleCount})`],
                    ['Female', `${speciesProfile.femaleLabel}s (${femaleCount})`],
                    ['Junior', `Juniors (${juniorCount})`],
                    ['Active', `Active (${activeCount})`],
                    ['Archived', `Archived (${archivedCount})`],
                    ...(withdrawalCount > 0 || filterKey === 'Withdrawal'
                      ? ([['Withdrawal', `Withdrawal (${withdrawalCount})`]] as const)
                      : []),
                    ...(needsAttentionCount > 0 || filterKey === 'NeedsAttention'
                      ? ([['NeedsAttention', `Needs Attention (${needsAttentionCount})`]] as const)
                      : []),
                    ...(conflictedAnimalCount > 0 || filterKey === 'Conflicts'
                      ? ([['Conflicts', `Conflicts (${conflictedAnimalCount})`]] as const)
                      : []),
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={filterKey === key}
                    onClick={() => setFilterKey(key)}
                    className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                      filterKey === key
                        ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                        : key === 'Withdrawal' || key === 'NeedsAttention' || key === 'Conflicts'
                        ? 'text-[var(--barn-terracotta)] hover:bg-[var(--barn-terracotta-tint)]'
                        : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 max-w-full">
              <label htmlFor="herd-sort-select" className="sr-only">
                Sort Herd Records
              </label>
              <select
                id="herd-sort-select"
                aria-label="Sort herd list"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as HerdSortOption)}
                className="min-h-[42px] max-w-full px-3 py-2 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium"
              >
                <option value="default">Sort: Default Order</option>
                <option value="conflicts_first">Sort: Conflicts First</option>
                <option value="withdrawal_soonest">Sort: Withdrawal Clear Date</option>
                <option value="name">Sort: Name (A–Z)</option>
                <option value="tattoo">Sort: {idLabels.shortLabel}</option>
                <option value="newest_dob">Sort: Newest DOB</option>
              </select>

              {onOpenBarnBench && (
                <button
                  type="button"
                  onClick={onOpenBarnBench}
                  title="Open fast sequential Barn Bench entry mode (Shortcut: K)"
                  className="min-h-[42px] max-w-full px-3.5 py-2 rounded-xl border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] text-[var(--barn-ink)] hover:brightness-105 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                >
                  <ClipboardCheck className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  <span>Barn Bench</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setEditingAnimal(null);
                  setShowAnimalModal(true);
                }}
                className="min-h-[42px] max-w-full px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Add {speciesProfile.name}</span>
              </button>
            </div>
          </div>

          {/* Carrier Trait Screening & Finder Strip */}
          <div className="flex flex-wrap items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs">
            <span className="font-medium text-[var(--barn-muted)] shrink-0">
              Carrier Finder:
            </span>
            <select
              aria-label="Carrier disclosure filter mode"
              value={carrierFilterMode}
              onChange={(e) => setCarrierFilterMode(e.target.value as HerdCarrierFilterMode)}
              className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
            >
              <option value="all">All Carrier States</option>
              <option value="any_risk">Any Risk (Confirmed, Suspected, or Lineage)</option>
              <option value="confirmed">Confirmed Carriers Only</option>
              <option value="suspected">Suspected Carriers Only</option>
              <option value="lineage_potential">Lineage Potential Only</option>
              <option value="cleared">Cleared / Homozygous Non-Carrier</option>
            </select>
            <input
              type="search"
              list="herd-carrier-trait-list"
              aria-label="Filter by carrier trait"
              placeholder="Filter specific trait (e.g. Dilute, ww, cc)..."
              value={carrierTraitQuery}
              onChange={(e) => setCarrierTraitQuery(e.target.value)}
              className="flex-1 min-w-[200px] max-w-xs min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
            />
            <datalist id="herd-carrier-trait-list">
              {carrierSuggestions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            {(carrierFilterMode !== 'all' || carrierTraitQuery.trim()) && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="font-mono tabular-nums text-[var(--barn-muted)]">
                  {filteredAnimals.length} matching
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCarrierFilterMode('all');
                    setCarrierTraitQuery('');
                  }}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs"
                >
                  Clear Filter
                </button>
              </div>
            )}
          </div>

          {/* Multi-Select Bulk Action Bar */}
          {checkedIds.length > 0 && (
            <div className="bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] rounded-2xl px-4 py-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-semibold font-mono tabular-nums">
                  {checkedIds.length} {speciesProfile.name}
                  {checkedIds.length === 1 ? '' : 's'} selected
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openBatchPrintPreview}
                    title="Print cage cards, 4-up mini pedigree sheets, 4×6 photo cards, or stacked pedigrees in one pass"
                    className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                    Batch Print ({checkedIds.length})
                  </button>

                  {onCompareGrowthForAnimals && (
                    <button
                      type="button"
                      onClick={() => onCompareGrowthForAnimals(checkedIds)}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <TrendingUp className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                      Compare Rate of Gain ({checkedIds.length})
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      onArchiveAnimals(checkedIds, true);
                      setCheckedIds([]);
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                    Move to Archived
                  </button>

                  {opfsSupported && onOffloadAnimalsToOpfsArchive && (
                    <button
                      type="button"
                      onClick={async () => {
                        await onOffloadAnimalsToOpfsArchive(checkedIds);
                        setCheckedIds([]);
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Archive className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                      Offload to OPFS /archives
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      onArchiveAnimals(checkedIds, false);
                      setCheckedIds([]);
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" aria-hidden="true" />
                    Restore to Active
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setMigrationModalState({ mode: 'multi-select', animalIds: checkedIds })
                    }
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
                    Move to Species
                  </button>

                  {confirmBatchDelete ? (
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteAnimalsBatch(checkedIds);
                          setCheckedIds([]);
                          setConfirmBatchDelete(false);
                        }}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-xs font-semibold whitespace-nowrap"
                      >
                        Confirm Delete ({checkedIds.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmBatchDelete(false)}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmBatchDelete(true)}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Delete Selected
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setCheckedIds([]);
                      setConfirmBatchDelete(false);
                    }}
                    className="min-h-[36px] px-2.5 py-1.5 text-xs underline text-[var(--barn-muted)]"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Herd List Card */}
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl overflow-hidden">
            {filteredAnimals.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm text-[var(--barn-muted)]">
                  No {speciesProfile.name.toLowerCase()} records match this filter.
                </p>
                {animals.length > 0 && query.trim() && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="min-h-[38px] px-4 py-1.5 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium"
                  >
                    Clear Search &ldquo;{query.trim()}&rdquo;
                  </button>
                )}
                {animals.length === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAnimal(null);
                      setShowAnimalModal(true);
                    }}
                    className="min-h-[40px] px-4 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold"
                  >
                    Register First {speciesProfile.name}
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="px-4 py-2.5 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/50 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--barn-muted)]">
                  <label className="inline-flex items-center gap-2.5 cursor-pointer font-medium text-[var(--barn-ink)]">
                    <input
                      type="checkbox"
                      checked={allShownChecked}
                      onChange={toggleSelectAllShown}
                      className="w-4 h-4 accent-[var(--barn-sage)]"
                    />
                    <span>Select All Shown ({filteredAnimals.length})</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    {(opfsSupported || archivedHerdBundles.length > 0) && (
                      <button
                        type="button"
                        onClick={() => setShowArchivedHerdsModal(true)}
                        className="text-xs font-medium text-[var(--barn-sage)] hover:underline inline-flex items-center gap-1"
                      >
                        <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                        Archived Herds /archives ({archivedHerdBundles.length})
                      </button>
                    )}
                    <span>Tap any animal row to open its full page</span>
                  </div>
                </div>

                <div
                  ref={herdVirtual.scrollContainerRef}
                  className="max-h-[72vh] overflow-y-auto"
                >
                  {herdVirtual.windowRange.paddingTop > 0 && (
                    <div
                      aria-hidden="true"
                      style={{ height: `${herdVirtual.windowRange.paddingTop}px` }}
                    />
                  )}
                  <div className="divide-y divide-[var(--barn-border)]">
                    {visibleAnimals.map((a, localIdx) => {
                      const rowIndex = herdVirtual.windowRange.startIndex + localIdx;
                      const isChecked = checkedIdSet.has(a.id);
                      const isArch = isAnimalArchived(a);
                      const coi = visibleCoiByAnimalId.get(a.id);
                      const coverPhoto = primaryPhotoByAnimalId.get(a.id);
                      const photoCount = photosByAnimalId.get(a.id)?.length || 0;
                      const sexColor =
                        a.sex === 'Male'
                          ? 'text-[var(--barn-slate)]'
                          : a.sex === 'Female'
                          ? 'text-[var(--barn-terracotta)]'
                          : 'text-[var(--barn-muted)]';

                      return (
                        <div
                          key={a.id}
                          ref={herdVirtual.measureRowRef(rowIndex)}
                          className={`flex items-center gap-2 px-4 py-3 transition-colors ${
                            isChecked
                              ? 'bg-[var(--barn-sage-tint)]/60'
                              : 'hover:bg-[var(--barn-subtle)]/40'
                          }`}
                        >
                          <label
                            className="min-h-[44px] min-w-[40px] flex items-center justify-center cursor-pointer shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleChecked(a.id)}
                              aria-label={`Select ${a.name}`}
                              className="w-4 h-4 accent-[var(--barn-sage)]"
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => onSelectAnimal(a.id)}
                            className="flex-1 text-left flex items-center justify-between gap-3 min-w-0 min-h-[44px]"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="relative w-10 h-10 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] overflow-hidden flex items-center justify-center shrink-0">
                                {coverPhoto && (coverPhoto.thumbnailDataUrl || coverPhoto.dataUrl) ? (
                                  <img
                                    src={coverPhoto.thumbnailDataUrl || coverPhoto.dataUrl}
                                    alt={a.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span className={`font-display text-sm font-semibold ${sexColor}`}>
                                    {(a.name || '?').charAt(0).toUpperCase()}
                                  </span>
                                )}
                                {photoCount > 1 && (
                                  <span className="absolute bottom-0 right-0 px-1 rounded-tl-md bg-black/75 text-white font-mono text-[9px] leading-tight">
                                    {photoCount}
                                  </span>
                                )}
                              </div>

                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span className="font-medium text-sm truncate">{a.name}</span>
                                  {a.tattoo && (
                                    <span className="font-mono text-xs text-[var(--barn-muted)] shrink-0">
                                      {a.tattoo}
                                    </span>
                                  )}
                                  {isArch && (
                                    <span className="text-[11px] font-medium text-[var(--barn-muted)] shrink-0">
                                      · Archived
                                    </span>
                                  )}
                                  {doesAnimalNeedAttention(a) && (
                                    <span className="text-[11px] font-semibold text-[var(--barn-terracotta)] shrink-0">
                                      · Needs Attention
                                    </span>
                                  )}
                                  {(() => {
                                    const rowWithdrawal = withdrawalByAnimalId.get(a.id);
                                    if (!rowWithdrawal?.isActive) return null;
                                    return (
                                      <span
                                        title={`Medication: ${rowWithdrawal.medicationSummary}`}
                                        className="text-[11px] font-semibold text-[var(--barn-terracotta)] inline-flex items-center gap-1 shrink-0 font-mono tabular-nums"
                                      >
                                        · <ShieldAlert className="w-3 h-3" aria-hidden="true" />
                                        Withdrawal: {rowWithdrawal.shortCountdownLabel} (clears{' '}
                                        {formatReadableDate(rowWithdrawal.clearDateIso)})
                                      </span>
                                    );
                                  })()}
                                  {(() => {
                                    const rowConflict = conflictsByAnimalId.get(a.id);
                                    if (!rowConflict?.hasAnyConflict) return null;
                                    if (rowConflict.hasActiveConflict) {
                                      return (
                                        <span
                                          title={rowConflict.headlineReasons.join('; ')}
                                          className="text-[11px] font-semibold text-[var(--barn-terracotta)] inline-flex items-center gap-1 shrink-0"
                                        >
                                          · <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                                          Conflict Alert
                                        </span>
                                      );
                                    }
                                    return (
                                      <span
                                        title={rowConflict.headlineReasons.join('; ')}
                                        className="text-[11px] font-medium text-[var(--barn-terracotta)]/80 inline-flex items-center gap-1 shrink-0"
                                      >
                                        · <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                                        Soft Warning (Ignored)
                                      </span>
                                    );
                                  })()}
                                </div>
                                <div className="text-xs text-[var(--barn-muted)] mt-0.5 truncate">
                                  <span className={`font-medium ${sexColor}`}>
                                    {formatSexForSpecies(a.sex, speciesProfile)}
                                  </span>{' '}
                                  · {a.breed} {a.variety} · {a.status}
                                  {normalizeOwnershipType(a.ownershipType) !== 'Owned'
                                    ? ` · ${normalizeOwnershipType(a.ownershipType)}`
                                    : ''}
                                  {a.culled ? ' · Flagged Cull' : ''}
                                  {a.offloadedArchiveKey ? ' · Offloaded Stub' : ''}
                                  {a.cageLocation ? ` · ${a.cageLocation}` : ''}
                                </div>
                                {(() => {
                                  const rowAnalysis = visibleCarrierAnalysisById.get(a.id);
                                  const parts: string[] = [];
                                  if (a.rufusLevel) parts.push(`Rufus: ${a.rufusLevel} (in dev)`);
                                  if (rowAnalysis?.confirmed.length) {
                                    parts.push(`Conf: ${rowAnalysis.confirmed.join(', ')}`);
                                  }
                                  if (rowAnalysis?.suspected.length) {
                                    parts.push(`Susp: ${rowAnalysis.suspected.join(', ')}`);
                                  }
                                  if (rowAnalysis?.lineagePotential.length) {
                                    parts.push(
                                      `Lineage: ${rowAnalysis.lineagePotential
                                        .map((l) => l.trait)
                                        .join(', ')}`
                                    );
                                  }
                                  if (rowAnalysis?.cleared.length) {
                                    parts.push(
                                      `Cleared: ${rowAnalysis.cleared.map((c) => c.trait).join(', ')}`
                                    );
                                  }
                                  if (parts.length === 0) return null;
                                  return (
                                    <div className="text-[11px] text-[var(--barn-terracotta)] mt-0.5 truncate">
                                      {parts.join(' · ')}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>

                            <div className="text-right shrink-0 font-mono tabular-nums">
                              <div className="text-xs font-medium">
                                {formatWeight(a.weightGrams, effectiveWeightUnit)}
                              </div>
                              <div className="text-[11px] text-[var(--barn-muted)]">
                                COI {(coi?.coiPercent ?? 0).toFixed(1)}% ·{' '}
                                {coi?.knownAncestorsIn3Gen ?? 0}/14
                              </div>
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {herdVirtual.windowRange.paddingBottom > 0 && (
                    <div
                      aria-hidden="true"
                      style={{ height: `${herdVirtual.windowRange.paddingBottom}px` }}
                    />
                  )}
                </div>

                <div className="px-4 py-2.5 border-t border-[var(--barn-border)] bg-[var(--barn-canvas)]/50 flex items-center justify-between gap-3 text-xs">
                  <span className="text-[var(--barn-muted)] font-mono tabular-nums">
                    Viewing {herdVirtual.windowRange.startIndex + 1}–
                    {herdVirtual.windowRange.endIndex + 1} of {filteredAnimals.length}
                  </span>
                  {herdVirtual.windowRange.startIndex > 0 && (
                    <button
                      type="button"
                      onClick={herdVirtual.scrollToTop}
                      className="min-h-[36px] px-3 py-1 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] whitespace-nowrap"
                    >
                      Back to Top
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {showAnimalModal && (
        <Suspense fallback={null}>
          <AnimalEditorModal
            initialAnimal={editingAnimal}
            speciesProfile={speciesProfile}
            speciesAnimals={animals}
            speciesCages={cages}
            animalCareLogs={editingAnimalCareLogs}
            preferredUnit={effectiveWeightUnit}
            currencyCode={settings.currencyCode}
            optimizationPresetId={settings.imageOptimizationPreset}
            defaultBreederName={settings.breederName}
            defaultOwnerName={settings.barnName}
            opfsSupported={opfsSupported}
            autoOffloadRetiredToOpfs={Boolean(settings.autoOffloadRetiredToOpfs)}
            onSave={onSaveAnimal}
            onOffloadRetiredAnimal={
              onOffloadAnimalsToOpfsArchive
                ? async (animalId) => {
                    await onOffloadAnimalsToOpfsArchive([animalId]);
                  }
                : undefined
            }
            onSetAutoOffloadRetired={
              onUpdateSettings
                ? (enabled) => onUpdateSettings({ autoOffloadRetiredToOpfs: enabled }, { silent: true })
                : undefined
            }
            onDelete={onDeleteAnimal}
            onClose={() => setShowAnimalModal(false)}
          />
        </Suspense>
      )}

      {showArchivedHerdsModal && (
        <Suspense fallback={null}>
          <ArchivedHerdsModal
            isOpen={showArchivedHerdsModal}
            opfsSupported={opfsSupported}
            archives={archivedHerdBundles}
            autoOffloadEnabled={Boolean(settings.autoOffloadRetiredToOpfs)}
            onToggleAutoOffload={(enabled) =>
              onUpdateSettings?.({ autoOffloadRetiredToOpfs: enabled }, { silent: true })
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
        </Suspense>
      )}

      {migrationModalState && (
        <Suspense fallback={null}>
          <SpeciesMigrationModal
            snapshot={snapshot}
            sourceSpecies={speciesProfile.name}
            directAnimalIds={migrationModalState.animalIds}
            mode={migrationModalState.mode}
            onConfirmMigrate={async (ids, target, options) => {
              await onMigrateAnimalsSpecies(ids, target, options);
              setCheckedIds([]);
            }}
            onClose={() => setMigrationModalState(null)}
          />
        </Suspense>
      )}

      {previewDoc && (() => {
        const resolvedPedigreeSubject = previewDoc.pedigreeSubject;
        const resolvedBirthCertSubject = previewDoc.birthCertSubject;
        const resolvedSubjectForPhoto = resolvedPedigreeSubject ?? resolvedBirthCertSubject;
        const shouldUseSubjectPhoto = resolvedPedigreeSubject
          ? Boolean(settings.includePhotoOnPedigree)
          : resolvedBirthCertSubject
          ? birthCertOptions.includePrimaryPhoto
          : false;
        const resolvedSubjectPhoto =
          resolvedSubjectForPhoto && shouldUseSubjectPhoto
            ? (() => {
                const primaryRec = primaryPhotoByAnimalId.get(resolvedSubjectForPhoto.id);
                if (!primaryRec) return undefined;
                return (
                  primaryRec.dataUrl ||
                  (hydratedPedigreePhoto?.photoId === primaryRec.id
                    ? hydratedPedigreePhoto.dataUrl
                    : primaryRec.thumbnailDataUrl)
                );
              })()
            : undefined;
        const resolvedPedigreePhoto = resolvedPedigreeSubject ? resolvedSubjectPhoto : undefined;
        const isShareableCard =
          Boolean(resolvedPedigreeSubject) && pedigreeDocMode === 'shareable_card';
        const effectivePedigreeOptions: PedigreePrintOptions = {
          ...pedigreePrintOptions,
          shows,
          careLogs,
          woolHarvests,
          ancestorPhotosByAnimalId:
            pedigreePrintOptions.layoutPreset === 'family_portrait'
              ? familyPortraitPhotosByAnimalId
              : undefined,
        };
        return (
          <Suspense fallback={null}>
            <PrintPreviewModal
            title={
              isShareableCard && resolvedPedigreeSubject
                ? `Shareable Pedigree Card — ${resolvedPedigreeSubject.name}`
                : previewDoc.title
            }
            filename={
              isShareableCard && resolvedPedigreeSubject
                ? buildShareablePedigreeCardFileName(resolvedPedigreeSubject)
                : previewDoc.filename
            }
            htmlContent={
              resolvedPedigreeSubject
                ? isShareableCard
                  ? generateShareablePedigreeCardHtml(
                      resolvedPedigreeSubject,
                      allAnimals,
                      speciesProfiles,
                      settings,
                      settings.defaultGenerations,
                      resolvedPedigreePhoto,
                      {
                        ...effectivePedigreeOptions,
                        appBaseUrl,
                        includeQrCode: Boolean(appBaseUrl),
                      }
                    )
                  : generateEvansHtmPedigree(
                      resolvedPedigreeSubject,
                      allAnimals,
                      speciesProfiles,
                      settings,
                      settings.defaultGenerations,
                      resolvedPedigreePhoto,
                      effectivePedigreeOptions
                    )
                : resolvedBirthCertSubject
                  ? generatePetBirthCertificateHtml(
                      resolvedBirthCertSubject,
                      allAnimals,
                      speciesProfiles,
                      settings,
                      {
                        primaryPhotoDataUrl: resolvedSubjectPhoto,
                        companionFamilyName: birthCertOptions.companionFamilyName,
                        keepsakeMessage: birthCertOptions.keepsakeMessage,
                      }
                    )
                : previewDoc.cageCardSubject
                  ? generateThermalCageCardHtml(
                      previewDoc.cageCardSubject,
                      allAnimals,
                      speciesProfiles,
                      settings,
                      {
                        includeQrCode: includeThermalCageCardQr,
                        appBaseUrl,
                      }
                    )
                  : previewDoc.html
            }
            includePrimaryPhoto={
              previewDoc.isPedigree
                ? settings.includePhotoOnPedigree
                : resolvedBirthCertSubject
                ? birthCertOptions.includePrimaryPhoto
                : undefined
            }
            onToggleIncludePrimaryPhoto={
              previewDoc.isPedigree
                ? onToggleIncludePhotoOnPedigree
                : resolvedBirthCertSubject
                ? (inc) => setBirthCertOptions((prev) => ({ ...prev, includePrimaryPhoto: inc }))
                : undefined
            }
            includeCageCardQr={
              previewDoc.cageCardSubject ? includeThermalCageCardQr : undefined
            }
            onToggleIncludeCageCardQr={
              previewDoc.cageCardSubject ? setIncludeThermalCageCardQr : undefined
            }
            pedigreePrintOptions={previewDoc.isPedigree ? pedigreePrintOptions : undefined}
            onChangePedigreePrintOptions={
              previewDoc.isPedigree ? setPedigreePrintOptions : undefined
            }
            pedigreeDocMode={previewDoc.isPedigree ? pedigreeDocMode : undefined}
            onChangePedigreeDocMode={
              previewDoc.isPedigree ? setPedigreeDocMode : undefined
            }
            breederLogoDataUrl={previewDoc.isPedigree ? settings.breederLogoDataUrl : undefined}
            onUpdateBreederLogo={
              previewDoc.isPedigree && onUpdateSettings
                ? (dataUrl) => onUpdateSettings({ breederLogoDataUrl: dataUrl }, { silent: true })
                : undefined
            }
            onDownloadPdf={
              resolvedPedigreeSubject && !isShareableCard
                ? async () => {
                    const { buildAndDownloadPedigreePdf } = await import(
                      '../utils/webPdfActions'
                    );
                    return buildAndDownloadPedigreePdf({
                      subject: resolvedPedigreeSubject,
                      allAnimals,
                      speciesProfiles,
                      settings,
                      generations: settings.defaultGenerations,
                      printOptions: effectivePedigreeOptions,
                      primaryPhotoDataUrl: resolvedPedigreePhoto,
                      pdfFilename: `${previewDoc.filename.replace(/\.html?$/i, '')}.pdf`,
                    });
                  }
                : undefined
            }
            extraToolbarContent={
              resolvedBirthCertSubject ? (
                <div className="flex flex-wrap items-center gap-2.5">
                  <input
                    type="text"
                    value={birthCertOptions.companionFamilyName}
                    onChange={(e) =>
                      setBirthCertOptions((prev) => ({
                        ...prev,
                        companionFamilyName: e.target.value,
                      }))
                    }
                    placeholder="Companion / adopter family name (optional)"
                    aria-label="Companion or adopter family name"
                    className="min-h-[30px] min-w-[200px] px-2.5 py-0.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                  />
                  <input
                    type="text"
                    value={birthCertOptions.keepsakeMessage}
                    onChange={(e) =>
                      setBirthCertOptions((prev) => ({
                        ...prev,
                        keepsakeMessage: e.target.value,
                      }))
                    }
                    placeholder="Optional keepsake welcome note..."
                    aria-label="Optional keepsake welcome note"
                    className="flex-1 min-w-[220px] min-h-[30px] px-2.5 py-0.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                  />
                  <span className="text-[11px] text-[var(--barn-muted)]">
                    Privacy mode: Breeder contact info &amp; pricing omitted.
                  </span>
                </div>
              ) : undefined
            }
            headerNotice={
              previewDoc.isPedigree ? (
                <PedigreePrintNotice />
              ) : previewDoc.hasGenetics ? (
                <ColorGeneticsNotice compact />
              ) : undefined
            }
            onClose={() => {
              setPreviewDoc(null);
              setHydratedPedigreePhoto(null);
              setFamilyPortraitPhotosByAnimalId({});
            }}
          />
          </Suspense>
        );
      })()}

      {batchPrintSubjects && batchPrintSubjects.length > 0 && (
        <Suspense fallback={null}>
          <PrintPreviewModal
            title={`Batch Print — ${getBatchPrintLayoutSpec(batchPrintOptions.layout).label} (${batchPrintSubjects.length} ${speciesProfile.name})`}
            filename={buildBatchPrintFileName(
              settings.barnName,
              speciesProfile.name,
              batchPrintOptions.layout,
              batchPrintSubjects.length
            )}
            htmlContent={batchPrintHtml}
            batchPrintOptions={batchPrintOptions}
            onChangeBatchPrintOptions={setBatchPrintOptions}
            batchAnimalCount={batchPrintSubjects.length}
            batchPageCount={batchPrintPageCount}
            batchPhotoHydrating={batchPhotoHydrating}
            headerNotice={
              batchPrintOptions.layout !== 'cage_cards' ? <PedigreePrintNotice /> : undefined
            }
            onClose={() => {
              setBatchPrintSubjects(null);
              setBatchHydratedPhotos({});
              setBatchPhotoHydrating(false);
            }}
          />
        </Suspense>
      )}

      {/* E-Leg Certificate Full-Screen Lightbox */}
      {eLegLightbox && (
        <div
          ref={eLegLightboxRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={eLegLightbox.title}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeELegLightbox();
          }}
          className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-[var(--barn-border)] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{eLegLightbox.title}</div>
                {eLegLightbox.subtitle && (
                  <div className="text-xs text-[var(--barn-muted)] truncate">
                    {eLegLightbox.subtitle}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={closeELegLightbox}
                aria-label="Close certificate preview"
                className="min-h-[36px] min-w-[36px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-black/15 flex items-center justify-center max-h-[76dvh]">
              <img
                src={eLegLightbox.imageUrl}
                alt={eLegLightbox.title}
                className="max-h-[70dvh] w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WeightTrendSvg({
  points,
  unit,
}: {
  points: CareLog[];
  unit: BarnSettings['preferredUnit'];
}) {
  const width = 460;
  const height = 84;
  const padX = 14;
  const padY = 14;

  const weights = points.map((p) => p.weightGrams);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const span = Math.max(1, maxW - minW);

  const coords = points.map((p, idx) => {
    const x = padX + (idx / Math.max(1, points.length - 1)) * (width - padX * 2);
    const y = height - padY - ((p.weightGrams - minW) / span) * (height - padY * 2);
    return { x, y, log: p };
  });

  const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ');

  return (
    <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
      <div className="flex justify-between text-[11px] text-[var(--barn-muted)] font-mono tabular-nums mb-1">
        <span>
          Start: {formatWeight(points[0].weightGrams, unit)} ({points[0].dateIso})
        </span>
        <span>
          Latest: {formatWeight(points[points.length - 1].weightGrams, unit)} (
          {points[points.length - 1].dateIso})
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Weight trend chart from ${formatWeight(points[0].weightGrams, unit)} on ${
          points[0].dateIso
        } to ${formatWeight(points[points.length - 1].weightGrams, unit)} on ${
          points[points.length - 1].dateIso
        } across ${points.length} measurements`}
        className="w-full h-20 overflow-visible"
      >
        <polyline
          fill="none"
          stroke="var(--barn-sage)"
          strokeWidth="2.2"
          points={polyline}
        />
        {coords.map((c) => (
          <circle key={c.log.id} cx={c.x} cy={c.y} r="3.5" fill="var(--barn-sage)" />
        ))}
      </svg>
    </div>
  );
}
```

## `src/components/HomeSpeciesScreen.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Multi-Species Barn Home Landing Screen (`Home`).
 *
 * Displays first-time Farm/Barn Name onboarding, optional condensed summary strip,
 * reorderable per-species workspace cards with targeted Due/Overdue Task alerts and
 * Upcoming Birth alerts, and a bottom "Add Species" link into Settings.
 */

import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ArrowUpToLine,
  Baby,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  GripVertical,
  Plus,
  ShieldAlert,
  StickyNote,
  X,
} from 'lucide-react';
import React, { useId, useMemo, useState } from 'react';
import {
  buildWithdrawalByAnimalMap,
  evaluateSpeciesActiveWithdrawalsAlert,
  evaluateSpeciesArrivingBabiesAlert,
  evaluateSpeciesCagesOccupancy,
  evaluateSpeciesDueTasksAlert,
  evaluateSpeciesMemoReminderAlert,
  evaluateSpeciesNeedsAttentionAlert,
} from '../core/barnAlerts';
import { buildMultiSpeciesAgenda, formatSystemTaskTitle } from '../core/calendarExport';
import {
  BarnDatabaseSnapshot,
  BarnSettings,
  BarnTask,
  formatReadableDate,
  isAnimalArchived,
  todayDateIso,
} from '../core/models';
import { WorkspaceRoute } from '../hooks/useBarnStore';
import type { DeviceCapabilityController } from '../storage/deviceCapabilityDetector';
import { DeviceCapabilityCard } from './DeviceCapabilityCard';
import type { ImportExportHubSection } from './ImportExportHubScreen';

interface HomeSpeciesScreenProps {
  snapshot: BarnDatabaseSnapshot;
  onOpenSpecies: (speciesName: string, route?: WorkspaceRoute) => void;
  onMoveSpeciesCard: (speciesId: string, direction: 'up' | 'down' | 'top') => void;
  onReorderSpeciesCards: (orderedIds: string[]) => void;
  onSaveBarnName: (name: string) => void;
  onHideSummaryGrid: () => void;
  onIgnoreTaskAlerts: (taskIds: string[]) => void;
  onClearTaskAlertGroup: (speciesName: string, groupSignature: string | string[]) => void;
  onDismissMemoAlert?: (speciesName: string, signature: string) => void;
  dismissedWithdrawalSpecies?: readonly string[];
  onDismissWithdrawalAlert?: (speciesName: string) => void;
  onOpenWithdrawalHerd?: (speciesName: string) => void;
  onToggleTaskCompleted?: (task: BarnTask) => void;
  onExportTasksToCalendar?: (tasks: BarnTask[], filenameHint?: string) => void;
  onNavigateToAddSpecies: () => void;
  deviceCapability?: DeviceCapabilityController;
  onApplyLowMemorySettings?: (patch: Partial<BarnSettings>) => void;
  onOpenSettings?: () => void;
  onOpenImportExportHub?: (section?: ImportExportHubSection) => void;
}

export function HomeSpeciesScreen({
  snapshot,
  onOpenSpecies,
  onMoveSpeciesCard,
  onReorderSpeciesCards,
  onSaveBarnName,
  onHideSummaryGrid,
  onIgnoreTaskAlerts,
  onClearTaskAlertGroup,
  onDismissMemoAlert,
  dismissedWithdrawalSpecies,
  onDismissWithdrawalAlert,
  onOpenWithdrawalHerd,
  onToggleTaskCompleted,
  onExportTasksToCalendar,
  onNavigateToAddSpecies,
  deviceCapability,
  onApplyLowMemorySettings,
  onOpenSettings,
  onOpenImportExportHub,
}: HomeSpeciesScreenProps) {
  const [draggedSpeciesId, setDraggedSpeciesId] = useState<string | null>(null);
  const [dragOverSpeciesId, setDragOverSpeciesId] = useState<string | null>(null);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [agendaHorizonDays, setAgendaHorizonDays] = useState<7 | 14>(7);
  const [agendaSpeciesFilter, setAgendaSpeciesFilter] = useState<string>('');
  const [onboardingBarnName, setOnboardingBarnName] = useState<string>(
    snapshot.settings.barnName === 'My Barn' ? '' : snapshot.settings.barnName
  );

  const onboardingInputId = useId();
  const today = todayDateIso();
  const pinnedName = snapshot.settings.pinnedLandingSpecies;
  const showOnboarding = !snapshot.settings.barnNameOnboarded;
  const showSummaryGrid = snapshot.settings.showHomeSummaryGrid !== false;

  const archivedIdSet = useMemo(
    () => new Set(snapshot.animals.filter((a) => isAnimalArchived(a)).map((a) => a.id)),
    [snapshot.animals]
  );
  const ignoredTaskIdSet = useMemo(
    () => new Set(snapshot.settings.ignoredTaskIds || []),
    [snapshot.settings.ignoredTaskIds]
  );

  const activeTasks = useMemo(
    () => snapshot.tasks.filter((t) => !t.linkedAnimalId || !archivedIdSet.has(t.linkedAnimalId)),
    [snapshot.tasks, archivedIdSet]
  );

  const activeGestations = useMemo(
    () =>
      snapshot.breedings.filter((b) =>
        ['Planned', 'Bred', 'Palpated Positive'].includes(b.status)
      ).length,
    [snapshot.breedings]
  );
  const openTasks = useMemo(
    () => activeTasks.filter((t) => !t.completed).length,
    [activeTasks]
  );

  const totalBarnRecords =
    snapshot.animals.length +
    (snapshot.animalPhotos?.length ?? 0) +
    snapshot.breedings.length +
    snapshot.cages.length +
    snapshot.tasks.length +
    snapshot.careLogs.length +
    snapshot.shows.length;

  const withdrawalByAnimalId = useMemo(
    () => buildWithdrawalByAnimalMap(snapshot.careLogs, { todayIso: today }),
    [snapshot.careLogs, today]
  );

  const dismissedWithdrawalKeySet = useMemo(
    () =>
      new Set(
        (dismissedWithdrawalSpecies || [])
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      ),
    [dismissedWithdrawalSpecies]
  );

  const speciesAlertRows = useMemo(
    () =>
      snapshot.speciesProfiles.map((sp) => {
        const spKey = sp.name.trim().toLowerCase();
        const rawCleared = snapshot.settings.dismissedTaskGroupKeys?.[spKey];
        const dueAlert = evaluateSpeciesDueTasksAlert(activeTasks, sp.name, {
          todayIso: today,
          ignoredTaskIds: ignoredTaskIdSet,
          clearedGroupSignature: typeof rawCleared === 'string' ? rawCleared : undefined,
        });
        const dueTasks = dueAlert.tasks;
        const dueTaskIds = dueTasks.map((t) => t.id);
        const legacyDismissed = Array.isArray(rawCleared) ? new Set(rawCleared) : null;
        const showDueTaskAlert =
          dueAlert.shouldShow &&
          (!legacyDismissed || dueTaskIds.some((id) => !legacyDismissed.has(id)));

        const arrivingAlert = evaluateSpeciesArrivingBabiesAlert(snapshot.breedings, sp, {
          todayIso: today,
        });
        const attentionAlert = evaluateSpeciesNeedsAttentionAlert(snapshot.animals, sp.name);
        const withdrawalAlert = evaluateSpeciesActiveWithdrawalsAlert(
          snapshot.animals,
          snapshot.careLogs,
          sp.name,
          {
            todayIso: today,
            withdrawalByAnimalId,
            dismissedSpeciesKeys: dismissedWithdrawalKeySet,
          }
        );
        const memoAlert = evaluateSpeciesMemoReminderAlert(sp, {
          dismissedSignature: snapshot.settings.dismissedMemoAlertSignatures?.[spKey],
        });
        const cagesOccupancy = evaluateSpeciesCagesOccupancy(
          snapshot.cages,
          snapshot.animals,
          sp.name
        );

        return {
          sp,
          dueAlert,
          dueTasks,
          dueTaskIds,
          showDueTaskAlert,
          arrivingAlert,
          attentionAlert,
          withdrawalAlert,
          memoAlert,
          cagesOccupancy,
        };
      }),
    [
      snapshot.speciesProfiles,
      snapshot.settings.dismissedTaskGroupKeys,
      snapshot.settings.dismissedMemoAlertSignatures,
      snapshot.breedings,
      snapshot.animals,
      snapshot.cages,
      snapshot.careLogs,
      activeTasks,
      today,
      ignoredTaskIdSet,
      withdrawalByAnimalId,
      dismissedWithdrawalKeySet,
    ]
  );

  const agenda = useMemo(
    () =>
      buildMultiSpeciesAgenda({
        tasks: snapshot.tasks,
        animals: snapshot.animals,
        breedings: snapshot.breedings,
        speciesProfiles: snapshot.speciesProfiles,
        calendarSync: snapshot.settings.calendarSync,
        todayIso: today,
        horizonDays: agendaHorizonDays,
        speciesFilter: agendaSpeciesFilter || undefined,
      }),
    [
      snapshot.tasks,
      snapshot.animals,
      snapshot.breedings,
      snapshot.speciesProfiles,
      snapshot.settings.calendarSync,
      today,
      agendaHorizonDays,
      agendaSpeciesFilter,
    ]
  );

  const handleDropOnCard = (targetId: string) => {
    if (!draggedSpeciesId || draggedSpeciesId === targetId) {
      setDraggedSpeciesId(null);
      setDragOverSpeciesId(null);
      return;
    }
    const ids = snapshot.speciesProfiles.map((sp) => sp.id);
    const fromIdx = ids.indexOf(draggedSpeciesId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx !== -1 && toIdx !== -1) {
      const nextIds = [...ids];
      const [moved] = nextIds.splice(fromIdx, 1);
      nextIds.splice(toIdx, 0, moved);
      onReorderSpeciesCards(nextIds);
    }
    setDraggedSpeciesId(null);
    setDragOverSpeciesId(null);
  };

  return (
    <div className="space-y-6">
      {/* First-Time Barn / Farm Name Onboarding Prompt */}
      {showOnboarding && (
        <section
          aria-label="Set Your Barn or Farm Name"
          className="bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] rounded-2xl p-4 sm:p-5 space-y-3"
        >
          <div className="space-y-1">
            <h2 className="font-display text-lg font-semibold">
              Welcome — Name Your Barn, Rabbitry, or Farm
            </h2>
            <p className="text-xs text-[var(--barn-muted)]">
              This name appears on your barn dashboard and printed pedigrees. You can change it
              anytime in Settings.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSaveBarnName(onboardingBarnName.trim() || 'My Barn');
            }}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
          >
            <label htmlFor={onboardingInputId} className="sr-only">
              Barn, Rabbitry, or Farm Name
            </label>
            <input
              id={onboardingInputId}
              type="text"
              placeholder="e.g. Copper Creek Rabbitry or Maple Hill Homestead"
              value={onboardingBarnName}
              onChange={(e) => setOnboardingBarnName(e.target.value)}
              className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-sm"
            />
            <div className="flex flex-wrap items-center gap-2 max-w-full">
              <button
                type="submit"
                className="min-h-[42px] max-w-full px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Save Farm Name</span>
              </button>
              <button
                type="button"
                onClick={() => onSaveBarnName(snapshot.settings.barnName || 'My Barn')}
                className="min-h-[42px] max-w-full px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)]"
              >
                Use &ldquo;{snapshot.settings.barnName || 'My Barn'}&rdquo;
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Device Capability Onboarding & Low-Memory Protection Box */}
      {deviceCapability && (
        <DeviceCapabilityCard
          location="home"
          controller={deviceCapability}
          settings={snapshot.settings}
          totalBarnRecords={totalBarnRecords}
          isOnboardingActive={showOnboarding}
          onApplyLowMemorySettings={onApplyLowMemorySettings}
          onOpenSettings={onOpenSettings}
        />
      )}

      {/* Barn Hero Header */}
      <section className="space-y-3.5">
        <div className="space-y-1.5 max-w-2xl">
          <div className="space-y-0.5">
            <p className="text-xs text-[var(--barn-muted)]">
              Community Pedigree &mdash; Multi-Species Management System
            </p>
            <p className="text-xs text-[var(--barn-muted)]">
              100% local app ownership — offline-first with zero cloud lock-in.
            </p>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-balance pt-1">
            {snapshot.settings.barnName || 'My Barn'}
          </h1>
          <div
            role="note"
            className="flex items-start gap-2 px-3 py-2 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)]/70 text-xs text-[var(--barn-ink)]"
          >
            <AlertTriangle
              className="w-3.5 h-3.5 text-[var(--barn-terracotta)] mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <span>
              <strong>Pre-alpha:</strong> Use at your own risk — always back up your data before
              upgrading or deleting records.
            </span>
          </div>
          <p className="text-sm text-[var(--barn-muted)]">
            Choose a livestock species below to open its isolated barn hub, manage records, or
            reorder cards to match your daily chore route.
          </p>
        </div>

        {/* Ultra-Compact Optional 4-Metric Summary Bar */}
        {showSummaryGrid && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex-1 bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-xl p-1.5 grid grid-cols-2 sm:grid-cols-4 gap-1">
              <div className="px-2.5 py-1 rounded-lg flex items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--barn-muted)] truncate">Species</span>
                <span className="font-mono text-xs font-semibold tabular-nums">
                  {snapshot.speciesProfiles.length}
                </span>
              </div>
              <div className="px-2.5 py-1 rounded-lg flex items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--barn-muted)] truncate">Gestations</span>
                <span className="font-mono text-xs font-semibold tabular-nums">
                  {activeGestations}
                </span>
              </div>
              <div className="px-2.5 py-1 rounded-lg flex items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--barn-muted)] truncate">Open Chores</span>
                <span className="font-mono text-xs font-semibold tabular-nums">
                  {openTasks}
                </span>
              </div>
              <div className="px-2.5 py-1 rounded-lg flex items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--barn-muted)] truncate">Startup</span>
                <span className="text-[11px] font-semibold truncate">
                  {pinnedName ? `${pinnedName}` : 'Home'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onHideSummaryGrid}
              className="self-end sm:self-center text-[11px] text-[var(--barn-muted)] hover:text-[var(--barn-ink)] underline whitespace-nowrap shrink-0"
            >
              Hide strip
            </button>
          </div>
        )}
      </section>

      {/* Multi-Species Week-Ahead Barn Agenda (All Added Species) */}
      {snapshot.speciesProfiles.length > 0 && (
        <section
          aria-label="Multi-Species Barn Calendar Agenda"
          className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl overflow-hidden"
        >
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setAgendaOpen((prev) => !prev)}
              aria-expanded={agendaOpen}
              className="flex items-center gap-2 text-left min-w-0"
            >
              <CalendarDays className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span className="text-xs sm:text-sm font-semibold text-[var(--barn-ink)]">
                Barn Agenda &mdash; Next {agendaHorizonDays} Days
              </span>
              <span className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                {agenda.items.length === 0
                  ? 'Clear'
                  : `${agenda.overdueCount > 0 ? `${agenda.overdueCount} overdue · ` : ''}${agenda.todayCount} today · ${agenda.upcomingCount} upcoming`}
              </span>
              {agendaOpen ? (
                <ChevronUp className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
              )}
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {onExportTasksToCalendar && (
                <button
                  type="button"
                  disabled={agenda.exportableTasks.length === 0}
                  onClick={() =>
                    onExportTasksToCalendar(
                      agenda.exportableTasks,
                      agendaSpeciesFilter
                        ? `${agendaSpeciesFilter}-next-${agendaHorizonDays}d-agenda`
                        : `barn-all-species-next-${agendaHorizonDays}d-agenda`
                    )
                  }
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-45 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  Export Agenda .ICS ({agenda.exportableTasks.length})
                </button>
              )}
            </div>
          </div>

          {agendaOpen && (
            <div className="px-4 pb-4 pt-2 border-t border-[var(--barn-border)] space-y-3 bg-[var(--barn-canvas)]/45">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAgendaHorizonDays(7)}
                    aria-pressed={agendaHorizonDays === 7}
                    className={`min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                      agendaHorizonDays === 7
                        ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] border-[var(--barn-sage)]'
                        : 'bg-[var(--barn-surface)] text-[var(--barn-ink)] border-[var(--barn-border)]'
                    }`}
                  >
                    Next 7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgendaHorizonDays(14)}
                    aria-pressed={agendaHorizonDays === 14}
                    className={`min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                      agendaHorizonDays === 14
                        ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] border-[var(--barn-sage)]'
                        : 'bg-[var(--barn-surface)] text-[var(--barn-ink)] border-[var(--barn-border)]'
                    }`}
                  >
                    Next 14 Days
                  </button>
                </div>

                {snapshot.speciesProfiles.length > 1 && (
                  <select
                    aria-label="Filter agenda by added species"
                    value={agendaSpeciesFilter}
                    onChange={(e) => setAgendaSpeciesFilter(e.target.value)}
                    className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                  >
                    <option value="">All Added Species ({snapshot.speciesProfiles.length})</option>
                    {snapshot.speciesProfiles.map((sp) => (
                      <option key={sp.id} value={sp.name}>
                        {sp.name} Only
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {agenda.items.length === 0 ? (
                <div className="py-4 text-center text-xs text-[var(--barn-muted)]">
                  No chores or expected births scheduled within the next {agendaHorizonDays} days.
                </div>
              ) : (
                <ul className="divide-y divide-[var(--barn-border)]/70 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] overflow-hidden">
                  {agenda.items.map((item) => (
                    <li
                      key={item.id}
                      className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        {item.kind === 'task' && item.task && onToggleTaskCompleted ? (
                          <button
                            type="button"
                            onClick={() => onToggleTaskCompleted(item.task!)}
                            aria-label={`Complete task ${item.title}`}
                            title="Mark task completed"
                            className="w-5 h-5 mt-0.5 rounded border border-[var(--barn-border)] hover:border-[var(--barn-sage)] flex items-center justify-center shrink-0"
                          />
                        ) : (
                          <Baby
                            className="w-4 h-4 mt-0.5 text-[var(--barn-sage)] shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-[var(--barn-ink)] truncate">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-[var(--barn-muted)]">
                            <span
                              className={`font-mono font-medium mr-1.5 ${
                                item.isOverdue
                                  ? 'text-[var(--barn-danger)]'
                                  : item.isDueToday
                                    ? 'text-[var(--barn-terracotta)]'
                                    : 'text-[var(--barn-ink)]'
                              }`}
                            >
                              {item.dueDateIso}
                              {item.isOverdue
                                ? ' (Overdue)'
                                : item.isDueToday
                                  ? ' (Today)'
                                  : ''}
                            </span>
                            &middot; {item.subtitle}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          onOpenSpecies(
                            item.species,
                            item.kind === 'birth' ? 'breeding' : 'dashboard'
                          )
                        }
                        className="self-start sm:self-center min-h-[28px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium whitespace-nowrap shrink-0"
                      >
                        Open {item.species}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {/* Reorderable Species Hub Cards Grid */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-semibold">
            Your Livestock ({snapshot.speciesProfiles.length})
          </h2>
          <span className="text-xs text-[var(--barn-muted)]">
            Use ↑ ↓ / ⤒ arrows (or drag cards) to sort
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {speciesAlertRows.map(
            (
              {
                sp,
                dueAlert,
                dueTasks,
                dueTaskIds,
                showDueTaskAlert,
                arrivingAlert,
                attentionAlert,
                withdrawalAlert,
                memoAlert,
                cagesOccupancy,
              },
              index
            ) => {
            const isFirst = index === 0;
            const isLast = index === snapshot.speciesProfiles.length - 1;
            const isDragTarget =
              dragOverSpeciesId === sp.id && draggedSpeciesId !== null && draggedSpeciesId !== sp.id;

            return (
              <article
                key={sp.id}
                draggable
                onDragStart={(e: React.DragEvent<HTMLElement>) => {
                  setDraggedSpeciesId(sp.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e: React.DragEvent<HTMLElement>) => {
                  e.preventDefault();
                  if (dragOverSpeciesId !== sp.id) {
                    setDragOverSpeciesId(sp.id);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverSpeciesId === sp.id) {
                    setDragOverSpeciesId(null);
                  }
                }}
                onDrop={(e: React.DragEvent<HTMLElement>) => {
                  e.preventDefault();
                  handleDropOnCard(sp.id);
                }}
                onDragEnd={() => {
                  setDraggedSpeciesId(null);
                  setDragOverSpeciesId(null);
                }}
                className={`bg-[var(--barn-surface)] border rounded-2xl p-5 flex flex-col justify-between gap-4 transition-colors ${
                  isDragTarget
                    ? 'border-[var(--barn-sage)] ring-2 ring-[var(--barn-sage)]/40'
                    : 'border-[var(--barn-border)]'
                }`}
              >
                <div className="space-y-3">
                  {/* Card Header: Drag Grip + Invisibly Linked Name + Open Hub + Reorder Arrows */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span
                        title="Drag card to reorder"
                        className="text-[var(--barn-muted)] cursor-grab active:cursor-grabbing hidden sm:inline-flex shrink-0"
                        aria-hidden="true"
                      >
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <h3 className="font-display text-lg font-semibold leading-snug truncate min-w-0">
                        <button
                          type="button"
                          onClick={() => onOpenSpecies(sp.name, 'dashboard')}
                          aria-label={`Open ${sp.name} hub`}
                          className="rounded text-left text-inherit font-inherit truncate max-w-full hover:opacity-80 focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--barn-sage)] cursor-pointer"
                        >
                          {sp.name}
                        </button>
                      </h3>
                      <span className="text-[11px] font-mono text-[var(--barn-muted)] tabular-nums shrink-0">
                        #{index + 1}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenSpecies(sp.name, 'dashboard')}
                        className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold hover:opacity-95 transition-opacity inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                      >
                        Open Hub
                        <ArrowRight className="w-3 h-3" aria-hidden="true" />
                      </button>

                      <div
                        role="group"
                        aria-label={`Reorder ${sp.name} card`}
                        className="inline-flex items-center rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-0.5 shrink-0"
                      >
                        {index > 1 && (
                          <button
                            type="button"
                            onClick={() => onMoveSpeciesCard(sp.id, 'top')}
                            title={`Move ${sp.name} to top (#1)`}
                            aria-label={`Move ${sp.name} to top`}
                            className="min-h-[32px] min-w-[28px] rounded-md text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] flex items-center justify-center transition-colors"
                          >
                            <ArrowUpToLine className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isFirst}
                          onClick={() => onMoveSpeciesCard(sp.id, 'up')}
                          title={`Move ${sp.name} up`}
                          aria-label={`Move ${sp.name} up`}
                          className="min-h-[32px] min-w-[28px] rounded-md text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={isLast}
                          onClick={() => onMoveSpeciesCard(sp.id, 'down')}
                          title={`Move ${sp.name} down`}
                          aria-label={`Move ${sp.name} down`}
                          className="min-h-[32px] min-w-[28px] rounded-md text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Active Medication Withdrawal Safety Alert (closable until app reload) */}
                  {withdrawalAlert.shouldShow && (
                    <div
                      role="status"
                      className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] space-y-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <ShieldAlert
                            className="w-4 h-4 text-[var(--barn-terracotta)] mt-0.5 shrink-0"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-[var(--barn-ink)] font-mono tabular-nums">
                              {withdrawalAlert.items.length} Medication Withdrawal Hold
                              {withdrawalAlert.items.length === 1 ? '' : 's'}
                            </div>
                            <div className="text-[11px] text-[var(--barn-muted)] truncate">
                              {withdrawalAlert.items
                                .slice(0, 2)
                                .map(
                                  (item) =>
                                    `${item.animal.name} (${item.evaluation.shortCountdownLabel} · clears ${formatReadableDate(item.evaluation.clearDateIso)})`
                                )
                                .join(' · ')}
                              {withdrawalAlert.items.length > 2
                                ? ` +${withdrawalAlert.items.length - 2} more`
                                : ''}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              onOpenWithdrawalHerd
                                ? onOpenWithdrawalHerd(sp.name)
                                : onOpenSpecies(sp.name, 'herd')
                            }
                            className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-terracotta)]/50 text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold whitespace-nowrap"
                          >
                            View Herd
                          </button>
                          {onDismissWithdrawalAlert && (
                            <button
                              type="button"
                              onClick={() => onDismissWithdrawalAlert(sp.name)}
                              title="Close withdrawal alert until reload"
                              aria-label={`Close ${sp.name} withdrawal alert`}
                              className="min-h-[32px] min-w-[32px] rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center"
                            >
                              <X className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Babies About to Arrive Alert (gestation nearly complete) */}
                  {arrivingAlert.shouldShow && (
                    <div className="p-3 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <Baby
                            className="w-4 h-4 text-[var(--barn-sage)] mt-0.5 shrink-0"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-[var(--barn-ink)]">
                              {arrivingAlert.items.length} {arrivingAlert.offspringPluralLabel} Due Soon
                            </div>
                            <div className="text-[11px] text-[var(--barn-muted)] truncate">
                              {arrivingAlert.items
                                .slice(0, 2)
                                .map((item) => `${item.breeding.damName} (${item.timingLabel})`)
                                .join(' · ')}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenSpecies(sp.name, 'breeding')}
                          className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap shrink-0"
                        >
                          View Breeding
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Needs Attention Animals Notice (e.g., quick-added unlisted parents) */}
                  {attentionAlert.shouldShow && (
                    <div className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)]/80 space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <AlertCircle
                            className="w-4 h-4 text-[var(--barn-terracotta)] mt-0.5 shrink-0"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-[var(--barn-ink)]">
                              {attentionAlert.animals.length}{' '}
                              {attentionAlert.animals.length === 1 ? 'Record' : 'Records'} Need
                              Attention
                            </div>
                            <div className="text-[11px] text-[var(--barn-muted)] truncate">
                              {attentionAlert.animals
                                .slice(0, 2)
                                .map((a) => a.name)
                                .join(' · ')}
                              {attentionAlert.animals.length > 2
                                ? ` +${attentionAlert.animals.length - 2} more`
                                : ''}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenSpecies(sp.name, 'herd')}
                          className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-terracotta)]/50 text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold whitespace-nowrap shrink-0"
                        >
                          Review
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Over-Capacity Housing Welfare Alert */}
                  {cagesOccupancy.shouldShowOverCapacityAlert && (
                    <div
                      role="status"
                      className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-danger)] space-y-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <AlertTriangle
                            className="w-4 h-4 text-[var(--barn-danger)] mt-0.5 shrink-0"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-[var(--barn-ink)] font-mono tabular-nums">
                              {cagesOccupancy.totalOverCapacityCount}{' '}
                              {cagesOccupancy.totalOverCapacityCount === 1
                                ? 'Cage Over Capacity'
                                : 'Cages Over Capacity'}
                            </div>
                            <div className="text-[11px] text-[var(--barn-muted)] truncate font-mono tabular-nums">
                              {cagesOccupancy.overCapacityCages
                                .slice(0, 2)
                                .map((ev) => `${ev.cage.label} (${ev.ratioLabel})`)
                                .join(' · ')}
                              {cagesOccupancy.overCapacityCages.length > 2
                                ? ` +${cagesOccupancy.overCapacityCages.length - 2} more`
                                : ''}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenSpecies(sp.name, 'dashboard')}
                          className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-danger)]/50 text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold whitespace-nowrap shrink-0"
                        >
                          Inspect Cages
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Due / Overdue Tasks Alert (only shown when non-ignored tasks are due/overdue) */}
                  {showDueTaskAlert && (
                    <div className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] space-y-2 text-xs">
                      <div className="flex items-start gap-2">
                        <AlertTriangle
                          className="w-4 h-4 text-[var(--barn-terracotta)] mt-0.5 shrink-0"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-[var(--barn-ink)] font-mono tabular-nums">
                            {dueTasks.length} Due / Overdue Task
                            {dueTasks.length === 1 ? '' : 's'}
                          </div>
                          <div className="text-[11px] text-[var(--barn-muted)] truncate">
                            {dueTasks
                              .slice(0, 2)
                              .map((t) =>
                                formatSystemTaskTitle(t, snapshot.settings.calendarSync, {
                                  animals: snapshot.animals,
                                  breedings: snapshot.breedings,
                                  speciesProfiles: snapshot.speciesProfiles,
                                })
                              )
                              .join(' · ')}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenSpecies(sp.name, 'dashboard')}
                          className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap"
                        >
                          Do Tasks
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onClearTaskAlertGroup(sp.name, dueAlert.groupSignature)
                          }
                          className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap"
                        >
                          Clear Alert
                        </button>
                        <button
                          type="button"
                          onClick={() => onIgnoreTaskAlerts(dueTaskIds)}
                          className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] text-[var(--barn-muted)] hover:text-[var(--barn-danger)] whitespace-nowrap"
                        >
                          Ignore Permanently
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Subtle Memo Pad Notes Reminder (closable; returns automatically when memo text is edited) */}
                  {memoAlert.shouldShow && (
                    <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)]/70 border border-[var(--barn-border)] text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <StickyNote
                            className="w-3.5 h-3.5 text-[var(--barn-muted)] mt-0.5 shrink-0"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <div className="font-medium text-[var(--barn-ink)]">
                              Memo Pad Notes
                            </div>
                            <div className="text-[11px] text-[var(--barn-muted)] truncate">
                              {memoAlert.previewText}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => onOpenSpecies(sp.name, 'memo')}
                            className="min-h-[28px] px-2 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] whitespace-nowrap"
                          >
                            Open Pad
                          </button>
                          <button
                            type="button"
                            onClick={() => onDismissMemoAlert?.(sp.name, memoAlert.signature)}
                            title="Close memo reminder (reappears if memo pad is edited)"
                            aria-label={`Close ${sp.name} memo reminder`}
                            className="min-h-[28px] min-w-[28px] rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center"
                          >
                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {/* Add Species & Import/Export Hub CTAs below all species cards */}
        <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onNavigateToAddSpecies}
            className="w-full min-h-[48px] px-5 py-3 rounded-2xl border border-dashed border-[var(--barn-border)] bg-[var(--barn-surface)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)]/50 text-xs font-semibold text-[var(--barn-ink)] inline-flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
            Add Species (Configure Livestock &amp; Prefix in Settings)
          </button>

          {onOpenImportExportHub && (
            <button
              type="button"
              onClick={() => onOpenImportExportHub('all')}
              className="w-full min-h-[48px] px-5 py-3 rounded-2xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)]/50 text-xs font-semibold text-[var(--barn-ink)] inline-flex items-center justify-center gap-2 transition-colors"
            >
              <ArrowLeftRight className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
              Open Import / Export Hub (Backups, Restore &amp; Sync)
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
```

## `src/components/ImageCompressionNotice.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Compact inline notice displayed alongside image compression level selectors.
 */

import { AlertTriangle } from 'lucide-react';

interface ImageCompressionNoticeProps {
  className?: string;
}

export function ImageCompressionNotice({ className = '' }: ImageCompressionNoticeProps) {
  return (
    <div
      role="note"
      className={`flex items-start gap-2 px-3 py-2 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)]/60 text-[11px] text-[var(--barn-ink)] ${className}`}
    >
      <AlertTriangle
        className="w-3.5 h-3.5 text-[var(--barn-terracotta)] mt-0.5 shrink-0"
        aria-hidden="true"
      />
      <span>
        <strong>Low-power devices:</strong> If any device using your farm or livestock data is
        older or low-power, select the smallest, most compressed file size you can tolerate — excess
        image size can cause memory trouble in stored data on those devices.
      </span>
    </div>
  );
}
```

## `src/components/ImportExportHubScreen.tsx`

```tsx
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
import type { PreRestoreArchiveInspection } from '../core/archiveInspector';
import type { BackupStatusEvaluation } from '../core/backupStatus';
import {
  ArchivedHerdIndexEntry,
  VaultBackupMetadata,
} from '../core/backupVault';
import {
  getHeavyZipExportGate,
  getTierStoragePolicy,
} from '../core/deviceCapability';
import {
  wrapEncryptedZipContainer,
  tryExtractEncryptedEnvelopeFromZip,
  tryParseEncryptedEnvelopeJson,
  EncryptedPayloadEnvelope,
} from '../core/encryptedExport';
import type {
  ExporterCategory,
  ExternalExporterDescriptor,
} from '../core/exporters/exporterTypes';
import {
  normalizePedigreeGenerationDepth,
  PedigreeGenerationDepth,
} from '../core/models';
import {
  BUILTIN_NON_NATIVE_EXPORTERS,
  PLANNED_EXTERNAL_SCHEMA_TARGETS,
  runExternalExporter,
} from '../core/exporters/registry';
import { formatByteSizePure } from '../core/imageOptimizationSpec';
import type { ConflictSelectionMap } from '../core/importers/conflictResolver';
import type { PlatformImportPreview } from '../core/importers/importerTypes';
import {
  formatReadableByteLimit,
  MAX_DELTA_BATCH_FILES,
  MAX_DELTA_BATCH_TOTAL_BYTES,
  MAX_DELTA_JSON_BYTES,
  MAX_JSON_BACKUP_BYTES,
  MAX_SQLITE_DB_BYTES,
  MAX_ZIP_ARCHIVE_BYTES,
  validateUploadFileSize,
} from '../core/inputSanitization';
import {
  AnimalPhoto,
  BarnDatabaseSnapshot,
  BarnSettings,
  isAnimalArchived,
  isSameSpecies,
} from '../core/models';
import {
  exportBarnBackupJson,
  formatTimestampedBackupSlug,
  generateBarnBackupJsonChunks,
} from '../core/syncAndExports';
import type { SyncConflictEntry, SyncOperation } from '../core/syncOutbox';
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
import {
  getAdjustedNowMs,
  RollingBackupMeta,
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
          ? await onHydrateSnapshotForExport(snapshot)
          : snapshot;
        const stampSlug = formatTimestampedBackupSlug();
        const baseFilename = `community-pedigree-full-backup-${stampSlug}.json`;
        if (encryptBackupExport) {
          const rawJson = exportBarnBackupJson(exportSnapshot);
          const filename = `community-pedigree-full-backup-${stampSlug}-encrypted.json`;
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
        const lightSnapshot = stripPhotoDataUrlsFromSnapshot(snapshot);
        const stampSlug = formatTimestampedBackupSlug();
        const baseFilename = `community-pedigree-records-only-${stampSlug}.json`;
        if (encryptBackupExport) {
          const rawJson = exportBarnBackupJson(lightSnapshot);
          const filename = `community-pedigree-records-only-${stampSlug}-encrypted.json`;
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
          ? await onHydrateSnapshotForExport(snapshot)
          : snapshot;
        const stampSlug = formatTimestampedBackupSlug();
        const baseFilename = `community-pedigree-archive-${stampSlug}.zip`;
        if (encryptBackupExport) {
          const archive = await buildCompleteBackupZipOffThread(exportSnapshot);
          const env = await encryptBytesWithPassphrase(archive.bytes, backupExportPassphrase, {
            payloadKind: 'zip_archive',
            originalFileName: baseFilename,
          });
          const finalBytes = wrapEncryptedZipContainer(env, baseFilename);
          const filename = `community-pedigree-archive-${stampSlug}-encrypted.zip`;
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
          ? await onHydrateSnapshotForExport(snapshot)
          : snapshot;
        const stampSlug = formatTimestampedBackupSlug();
        const baseFilename = `community-pedigree-photos-${stampSlug}.zip`;
        if (encryptBackupExport) {
          const archive = await buildPhotosOnlyZipOffThread(exportSnapshot);
          const env = await encryptBytesWithPassphrase(archive.bytes, backupExportPassphrase, {
            payloadKind: 'zip_archive',
            originalFileName: baseFilename,
          });
          const finalBytes = wrapEncryptedZipContainer(env, baseFilename);
          const filename = `community-pedigree-photos-${stampSlug}-encrypted.zip`;
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
      const bytes = await onExportSqliteBytes();
      if (!bytes) {
        setBackupError('Raw SQLite binary export is unavailable in fallback mode.');
        return;
      }
      const stampSlug = formatTimestampedBackupSlug();
      const filename = `community-pedigree-${stampSlug}.sqlite`;
      await downloadBinaryFile(filename, bytes, 'application/x-sqlite3');
      void recordBackupExport('sqlite', filename);
      setBackupFeedback(`Downloaded raw SQLite database (${filename}).`);
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
          settings.includePhotoOnPedigree !== false &&
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

        await downloadTextFile(artifact.filename, artifact.content, artifact.mimeType);
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
                    title: 'Community Pedigree Multi-Device Delta Log',
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
                  Restore or merge native Community Pedigree backup files first, or import records
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

          {/* Extensible External Schema Roadmap */}
          <div className="border-t border-[var(--barn-border)] pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold text-[var(--barn-ink)]">
                  Extensible External Schema Registry
                </h3>
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Pure TypeScript descriptors in{' '}
                  <code className="font-mono">src/core/exporters/registry.ts</code> allow future
                  external platform templates to drop in with zero UI rewrites.
                </p>
              </div>
              <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                {BUILTIN_NON_NATIVE_EXPORTERS.length} active ·{' '}
                {PLANNED_EXTERNAL_SCHEMA_TARGETS.length} reserved schemas
              </span>
            </div>

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
```

## `src/components/PWAInstallButton.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * In-App PWA Install Prompt (`PWAInstallButton`) & Offline Mode Banner (`OfflineIndicator`).
 */

import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import React, { useState } from 'react';
import { useOnlineStatus, usePWAInstall } from '../storage/storageProtection';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';

export const PWAInstallButton: React.FC<{ variant?: 'header' | 'card' }> = ({
  variant = 'header',
}) => {
  const { canPromptInstall, isInstalled, isIos, promptInstall } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const iosDialogRef = useAccessibleDialog({
    isOpen: showIOSGuide,
    onClose: () => setShowIOSGuide(false),
  });

  if (isInstalled) {
    return null;
  }

  if (canPromptInstall) {
    return (
      <button
        type="button"
        onClick={() => void promptInstall()}
        title="Install Community Pedigree for offline barn use"
        className={
          variant === 'header'
            ? 'min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 transition-opacity inline-flex items-center gap-1.5 whitespace-nowrap shrink-0'
            : 'min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 transition-opacity inline-flex items-center justify-center gap-1.5 whitespace-nowrap'
        }
      >
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        Install App
      </button>
    );
  }

  if (isIos) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            variant === 'header'
              ? 'min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs font-semibold hover:bg-[var(--barn-subtle)] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0'
              : 'min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-semibold hover:bg-[var(--barn-subtle)] transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap'
          }
        >
          <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
          Install on iOS
        </button>

        {showIOSGuide && (
          <div
            ref={iosDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Install on iPhone or iPad"
            className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-xl">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-lg font-semibold text-[var(--barn-ink)]">
                  Install on iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="text-xs text-[var(--barn-muted)] space-y-2 list-decimal list-inside leading-relaxed">
                <li>
                  Tap the <strong className="text-[var(--barn-ink)]">Share</strong> button in the
                  Safari toolbar.
                </li>
                <li>
                  Scroll down and tap{' '}
                  <strong className="text-[var(--barn-ink)]">Add to Home Screen</strong>.
                </li>
                <li>
                  Open <strong className="text-[var(--barn-ink)]">Pedigree</strong> from your home
                  screen to use it in the barn with zero cell signal.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[40px] rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-16 md:bottom-4 left-4 z-40 flex items-center gap-2 rounded-xl border border-[var(--barn-terracotta)]/50 bg-[var(--barn-surface)]/95 backdrop-blur-sm px-3 py-2 text-xs font-medium text-[var(--barn-ink)] shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 text-[var(--barn-terracotta)] shrink-0" aria-hidden="true" />
      <span>Offline Mode — Local SQLite database active</span>
    </div>
  );
};
```

<!-- END OF PART 05 OF 16 (6 files) -->
