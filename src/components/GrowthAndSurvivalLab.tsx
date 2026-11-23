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
