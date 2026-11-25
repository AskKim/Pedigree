/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Interactive "What-If" Genetic Variety & Coat Explorer Sandbox (`src/components/CoatExplorerSandbox.tsx`).
 *
 * Lets breeders experiment with hypothetical loci combinations, variety presets, and What-If
 * Sire × Dam Punnett crosses inside Breeding Lab without creating temporary animal records.
 * Strictly ephemeral React state — never writes to IndexedDB/SQLite or `useBarnStore`.
 */

import {
  AlertTriangle,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  Dna,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  buildPresetGenotypeWithConfirmations,
  buildSandboxHypotheticalAnimal,
  evaluateSingleGenotypeSandbox,
  getGeneticsSpecForSpecies,
  getSpeciesVarietyPresets,
  parseGenotypeString,
  setLocusInGenotypeString,
  simulatePairingGenetics,
  SingleGenotypeEvaluation,
  SpeciesGeneticsSpec,
  VarietyPresetDefinition,
} from '../domain/geneticsEngine';
import { Animal, BiologicalSex, SpeciesProfile } from '../domain/models';
import { ColorGeneticsNotice } from './ColorGeneticsNotice';

type SandboxMode = 'single' | 'cross';

interface CoatExplorerSandboxProps {
  speciesProfile: SpeciesProfile;
  males: Animal[];
  females: Animal[];
  activeSire?: Animal;
  activeDam?: Animal;
}

interface SandboxGenotypeEditorProps {
  idPrefix: string;
  title: string;
  accentTone: 'neutral' | 'sire' | 'dam';
  speciesProfile: SpeciesProfile;
  spec: SpeciesGeneticsSpec;
  varietyPresets: VarietyPresetDefinition[];
  herdPool: Animal[];
  genotypeRaw: string;
  sex: BiologicalSex;
  onChangeGenotype: (next: string) => void;
  evaluation: SingleGenotypeEvaluation;
  compactGrid?: boolean;
}

function SandboxGenotypeEditor({
  idPrefix,
  title,
  accentTone,
  speciesProfile,
  spec,
  varietyPresets,
  herdPool,
  genotypeRaw,
  sex,
  onChangeGenotype,
  evaluation,
  compactGrid = false,
}: SandboxGenotypeEditorProps) {
  const [stagedPreset, setStagedPreset] = useState<VarietyPresetDefinition | null>(null);
  const [stagedChecks, setStagedChecks] = useState<Record<string, boolean>>({});
  const [showLocusGrid, setShowLocusGrid] = useState(true);

  useEffect(() => {
    setStagedPreset(null);
    setStagedChecks({});
  }, [speciesProfile.name]);

  const parsedByLocus = useMemo(() => {
    const map = new Map<string, { allele1: string; allele2: string }>();
    for (const pair of parseGenotypeString(genotypeRaw, speciesProfile.name)) {
      map.set(pair.locus, { allele1: pair.allele1 || '_', allele2: pair.allele2 || '_' });
    }
    return map;
  }, [genotypeRaw, speciesProfile.name]);

  const handleSelectPreset = (varietyName: string) => {
    if (!varietyName) return;
    const preset = varietyPresets.find((p) => p.variety === varietyName);
    if (!preset) return;
    if (preset.optionalConfirmations && preset.optionalConfirmations.length > 0) {
      setStagedPreset(preset);
      setStagedChecks({});
    } else {
      setStagedPreset(null);
      setStagedChecks({});
      onChangeGenotype(preset.conservativeGenotype);
    }
  };

  const handleApplyStagedPreset = () => {
    if (!stagedPreset) return;
    const confirmedLoci = Object.entries(stagedChecks)
      .filter(([, checked]) => checked)
      .map(([locus]) => locus);
    onChangeGenotype(
      buildPresetGenotypeWithConfirmations(stagedPreset, confirmedLoci, speciesProfile.name)
    );
    setStagedPreset(null);
    setStagedChecks({});
  };

  const handleSeedFromHerd = (animalId: string) => {
    if (!animalId) return;
    const picked = herdPool.find((a) => a.id === animalId);
    if (!picked) return;
    setStagedPreset(null);
    onChangeGenotype(picked.genotypeRaw || '');
  };

  const borderClass =
    accentTone === 'sire'
      ? 'border-[var(--barn-slate)]/50'
      : accentTone === 'dam'
      ? 'border-[var(--barn-terracotta)]/50'
      : 'border-[var(--barn-border)]';

  const titleColorClass =
    accentTone === 'sire'
      ? 'text-[var(--barn-slate)]'
      : accentTone === 'dam'
      ? 'text-[var(--barn-terracotta)]'
      : 'text-[var(--barn-ink)]';

  return (
    <div className={`p-4 rounded-xl bg-[var(--barn-canvas)] border ${borderClass} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={`text-xs font-semibold ${titleColorClass}`}>{title}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {herdPool.length > 0 && (
            <select
              aria-label={`Copy genotype from ${speciesProfile.name} herd for ${title}`}
              value=""
              onChange={(e) => handleSeedFromHerd(e.target.value)}
              className="min-h-[32px] max-w-[190px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[11px]"
            >
              <option value="">Seed from herd...</option>
              {herdPool.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.tattoo || 'No ID'})
                  {a.genotypeRaw ? ` · ${a.genotypeRaw}` : ' · no genotype'}
                </option>
              ))}
            </select>
          )}
          {varietyPresets.length > 0 && (
            <select
              aria-label={`Load variety preset for ${title}`}
              value=""
              onChange={(e) => handleSelectPreset(e.target.value)}
              className="min-h-[32px] max-w-[200px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[11px]"
            >
              <option value="">Variety preset...</option>
              {varietyPresets.map((preset) => (
                <option key={preset.variety} value={preset.variety}>
                  {preset.variety} ({preset.conservativeGenotype})
                </option>
              ))}
            </select>
          )}
          {genotypeRaw.trim() && (
            <button
              type="button"
              onClick={() => {
                setStagedPreset(null);
                onChangeGenotype('');
              }}
              className="min-h-[32px] px-2 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium text-[var(--barn-muted)] hover:text-[var(--barn-ink)] inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              Clear
            </button>
          )}
        </div>
      </div>

      {stagedPreset && (
        <div className="p-3 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-sage)] space-y-2 text-xs">
          <div className="font-semibold text-[var(--barn-ink)]">
            Verify Optional Modifiers for &ldquo;{stagedPreset.variety}&rdquo;
          </div>
          <div className="text-[11px] text-[var(--barn-muted)]">
            Preview:{' '}
            <code className="font-mono text-[var(--barn-ink)]">
              {buildPresetGenotypeWithConfirmations(
                stagedPreset,
                Object.entries(stagedChecks)
                  .filter(([, checked]) => checked)
                  .map(([locus]) => locus),
                speciesProfile.name
              )}
            </code>
          </div>
          {(stagedPreset.optionalConfirmations || []).map((opt) => (
            <label
              key={opt.locus}
              className="flex items-start gap-2 p-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] cursor-pointer"
            >
              <input
                type="checkbox"
                checked={Boolean(stagedChecks[opt.locus])}
                onChange={(e) =>
                  setStagedChecks((prev) => ({
                    ...prev,
                    [opt.locus]: e.target.checked,
                  }))
                }
                className="mt-0.5 rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
              />
              <span>
                <strong className="text-[var(--barn-ink)]">{opt.label}</strong>
                <span className="block text-[11px] text-[var(--barn-muted)] mt-0.5">
                  {opt.explanation}
                </span>
              </span>
            </label>
          ))}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setStagedPreset(null);
                setStagedChecks({});
              }}
              className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyStagedPreset}
              className="min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
            >
              Apply Preset
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <label htmlFor={`${idPrefix}-raw`} className="sr-only">
            {title} shorthand genotype
          </label>
          <input
            id={`${idPrefix}-raw`}
            type="text"
            placeholder={
              varietyPresets[0]?.conservativeGenotype ||
              spec.loci.map(() => '__').join(' ')
            }
            value={genotypeRaw}
            onChange={(e) => onChangeGenotype(e.target.value)}
            className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowLocusGrid((v) => !v)}
          aria-expanded={showLocusGrid}
          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium whitespace-nowrap"
        >
          {showLocusGrid ? 'Hide Loci' : `Edit ${spec.loci.length} Loci`}
        </button>
      </div>

      {/* Live Single-Genotype Prediction Readout */}
      <div className="p-3 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-2 text-xs">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <span className="text-[11px] text-[var(--barn-muted)] mr-1.5">Predicted Coat:</span>
            <span
              className={`font-semibold ${
                evaluation.hasInsufficientLoci
                  ? 'text-[var(--barn-muted)]'
                  : 'text-[var(--barn-ink)]'
              }`}
            >
              {evaluation.predictedVariety}
            </span>
          </div>
          {!evaluation.hasInsufficientLoci && evaluation.normalizedGenotype && (
            <span className="font-mono text-[11px] text-[var(--barn-muted)]">
              {evaluation.normalizedGenotype}
            </span>
          )}
        </div>

        {!evaluation.hasInsufficientLoci && evaluation.unverifiedCoreLoci.length > 0 && (
          <div className="text-[11px] text-[var(--barn-terracotta)]">
            Unverified core loci ({evaluation.unverifiedCoreLoci.join(', ')}) — prediction assumes
            dominant/default expression where blank.
          </div>
        )}

        {evaluation.recessiveCarriers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[10px] font-medium text-[var(--barn-muted)]">
              Hidden / Heterozygous Carriers:
            </span>
            {evaluation.recessiveCarriers.map((c) => (
              <span
                key={`${c.locus}-${c.allele}`}
                title={`${c.locusName} (${c.pair}): ${c.description}`}
                className="px-1.5 py-0.5 rounded bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/40 font-mono text-[10px] text-[var(--barn-ink)]"
              >
                {c.locus}: carries {c.allele} ({c.pair})
              </span>
            ))}
          </div>
        )}

        {evaluation.healthAlerts.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {evaluation.healthAlerts.map((alert, idx) => (
              <div
                key={`${alert.title}-${idx}`}
                className={`p-2 rounded-lg border text-[11px] ${
                  alert.severity === 'danger'
                    ? 'bg-[var(--barn-danger)]/10 border-[var(--barn-danger)] text-[var(--barn-ink)]'
                    : alert.severity === 'warning'
                    ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)] text-[var(--barn-ink)]'
                    : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] text-[var(--barn-muted)]'
                }`}
              >
                <div className="font-semibold flex items-center gap-1.5">
                  {alert.severity !== 'info' && (
                    <AlertTriangle
                      className={`w-3.5 h-3.5 shrink-0 ${
                        alert.severity === 'danger'
                          ? 'text-[var(--barn-danger)]'
                          : 'text-[var(--barn-terracotta)]'
                      }`}
                      aria-hidden="true"
                    />
                  )}
                  <span>{alert.title}</span>
                </div>
                <p className="text-[10px] text-[var(--barn-muted)] mt-0.5">{alert.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Locus Allele Picker Grid */}
      {showLocusGrid && (
        <div
          className={`grid gap-2 ${
            compactGrid
              ? 'grid-cols-2 sm:grid-cols-3'
              : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
          }`}
        >
          {spec.loci.map((locusDef) => {
            const pair = parsedByLocus.get(locusDef.locus);
            const isXLinkedMale = locusDef.inheritanceMode === 'x_linked' && sex === 'Male';
            const a1 = pair?.allele1 || '_';
            const a2 = isXLinkedMale ? 'Y' : pair?.allele2 || '_';

            return (
              <div
                key={locusDef.locus}
                title={locusDef.description}
                className="p-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-1"
              >
                <div className="flex items-center justify-between gap-1 text-[11px]">
                  <span className="font-semibold text-[var(--barn-ink)] truncate">
                    <span className="font-mono">{locusDef.locus}</span> · {locusDef.name}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <select
                    aria-label={`${title} ${locusDef.name} allele 1`}
                    value={a1}
                    onChange={(e) =>
                      onChangeGenotype(
                        setLocusInGenotypeString(
                          genotypeRaw,
                          locusDef.locus,
                          e.target.value,
                          a2,
                          speciesProfile.name,
                          sex
                        )
                      )
                    }
                    className="flex-1 min-w-0 min-h-[32px] px-1.5 py-0.5 rounded bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
                  >
                    <option value="_">_</option>
                    {locusDef.alleles.map((al) => (
                      <option key={al} value={al}>
                        {al}
                      </option>
                    ))}
                  </select>
                  {isXLinkedMale ? (
                    <span className="min-h-[32px] px-2 py-0.5 rounded bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono text-[var(--barn-muted)] inline-flex items-center">
                      Y
                    </span>
                  ) : (
                    <select
                      aria-label={`${title} ${locusDef.name} allele 2`}
                      value={a2}
                      onChange={(e) =>
                        onChangeGenotype(
                          setLocusInGenotypeString(
                            genotypeRaw,
                            locusDef.locus,
                            a1,
                            e.target.value,
                            speciesProfile.name,
                            sex
                          )
                        )
                      }
                      className="flex-1 min-w-0 min-h-[32px] px-1.5 py-0.5 rounded bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
                    >
                      <option value="_">_</option>
                      {locusDef.alleles.map((al) => (
                        <option key={al} value={al}>
                          {al}
                        </option>
                      ))}
                    </select>
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

export function CoatExplorerSandbox({
  speciesProfile,
  males,
  females,
  activeSire,
  activeDam,
}: CoatExplorerSandboxProps) {
  const baseId = useId();
  const [isExpanded, setIsExpanded] = useState(true);
  const [mode, setMode] = useState<SandboxMode>('single');
  const [singleSex, setSingleSex] = useState<BiologicalSex>('Female');

  const spec = useMemo(
    () => getGeneticsSpecForSpecies(speciesProfile.name),
    [speciesProfile.name]
  );
  const varietyPresets = useMemo(
    () => getSpeciesVarietyPresets(speciesProfile.name),
    [speciesProfile.name]
  );

  const defaultSingleRaw = varietyPresets[0]?.conservativeGenotype || '';
  const defaultSireRaw = varietyPresets[0]?.conservativeGenotype || '';
  const defaultDamRaw =
    varietyPresets[1]?.conservativeGenotype || varietyPresets[0]?.conservativeGenotype || '';

  const [singleRaw, setSingleRaw] = useState<string>(defaultSingleRaw);
  const [sireRaw, setSireRaw] = useState<string>(defaultSireRaw);
  const [damRaw, setDamRaw] = useState<string>(defaultDamRaw);
  const [customNotesRaw, setCustomNotesRaw] = useState<string>('');

  // Reset sandbox cleanly whenever species changes
  useEffect(() => {
    const nextPresets = getSpeciesVarietyPresets(speciesProfile.name);
    setSingleRaw(nextPresets[0]?.conservativeGenotype || '');
    setSireRaw(nextPresets[0]?.conservativeGenotype || '');
    setDamRaw(nextPresets[1]?.conservativeGenotype || nextPresets[0]?.conservativeGenotype || '');
    setCustomNotesRaw('');
  }, [speciesProfile.name]);

  const allHerdPool = useMemo(() => [...females, ...males], [females, males]);

  const singleEval = useMemo(
    () => evaluateSingleGenotypeSandbox(singleRaw, speciesProfile.name, singleSex),
    [singleRaw, speciesProfile.name, singleSex]
  );

  const sireEval = useMemo(
    () => evaluateSingleGenotypeSandbox(sireRaw, speciesProfile.name, 'Male'),
    [sireRaw, speciesProfile.name]
  );

  const damEval = useMemo(
    () => evaluateSingleGenotypeSandbox(damRaw, speciesProfile.name, 'Female'),
    [damRaw, speciesProfile.name]
  );

  const hasXLinkedLocus = useMemo(
    () => Boolean(spec?.loci.some((l) => l.inheritanceMode === 'x_linked')),
    [spec]
  );

  const crossSimulation = useMemo(() => {
    if (!spec || mode !== 'cross') return null;
    const hypoSire = buildSandboxHypotheticalAnimal({
      id: '__sandbox_sire__',
      name: `Hypothetical ${speciesProfile.maleLabel}`,
      speciesName: speciesProfile.name,
      sex: 'Male',
      genotypeRaw: sireRaw,
    });
    const hypoDam = buildSandboxHypotheticalAnimal({
      id: '__sandbox_dam__',
      name: `Hypothetical ${speciesProfile.femaleLabel}`,
      speciesName: speciesProfile.name,
      sex: 'Female',
      genotypeRaw: damRaw,
    });
    return simulatePairingGenetics(hypoSire, hypoDam, speciesProfile.name);
  }, [spec, mode, speciesProfile.name, speciesProfile.maleLabel, speciesProfile.femaleLabel, sireRaw, damRaw]);

  const canSeedFromActiveLogger = Boolean(activeSire?.genotypeRaw || activeDam?.genotypeRaw);

  const handleSeedBothFromLogger = () => {
    if (activeSire) setSireRaw(activeSire.genotypeRaw || '');
    if (activeDam) setDamRaw(activeDam.genotypeRaw || '');
    setMode('cross');
    setIsExpanded(true);
  };

  const handleSwapParents = () => {
    const prevSire = sireRaw;
    const prevDam = damRaw;
    setSireRaw(prevDam);
    setDamRaw(prevSire);
  };

  return (
    <section
      aria-label="Genetic Variety and Coat Explorer Sandbox"
      className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-semibold inline-flex items-center gap-2">
              <Dna className="w-5 h-5 text-[var(--barn-sage)]" aria-hidden="true" />
              Genetic Variety &amp; Coat Explorer Sandbox
            </h2>
            <ColorGeneticsNotice compact />
          </div>
          <p className="text-xs text-[var(--barn-muted)]">
            What-If genotype playground for {speciesProfile.name} — experiment with hypothetical
            loci, presets, and test crosses with zero database writes or temporary animal records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {spec && (
            <div
              role="group"
              aria-label="Coat Explorer Sandbox Mode"
              className="inline-flex rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] p-1"
            >
              <button
                type="button"
                aria-pressed={mode === 'single'}
                onClick={() => {
                  setMode('single');
                  setIsExpanded(true);
                }}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${
                  mode === 'single'
                    ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                    : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                Single Genotype
              </button>
              <button
                type="button"
                aria-pressed={mode === 'cross'}
                onClick={() => {
                  setMode('cross');
                  setIsExpanded(true);
                }}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${
                  mode === 'cross'
                    ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                    : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                }`}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
                What-If Cross
              </button>
            </div>
          )}

          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((v) => !v)}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
          >
            {isExpanded ? (
              <>
                Collapse <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              </>
            ) : (
              <>
                Open Sandbox <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </div>

      {isExpanded && !spec && (
        <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3 text-xs">
          <p className="text-[var(--barn-muted)]">
            <strong className="text-[var(--barn-ink)]">{speciesProfile.name}</strong> uses custom
            species rules — built-in coat color locus presets and Rabbit Punnett rules are not
            applied. You can still jot temporary DNA or color notes below without saving an animal
            record.
          </p>
          <div>
            <label htmlFor={`${baseId}-custom-notes`} className="sr-only">
              Custom species scratchpad genotype notes
            </label>
            <input
              id={`${baseId}-custom-notes`}
              type="text"
              value={customNotesRaw}
              onChange={(e) => setCustomNotesRaw(e.target.value)}
              placeholder={`Temporary ${speciesProfile.name} color / DNA scratchpad (not saved)...`}
              className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono"
            />
          </div>
        </div>
      )}

      {isExpanded && spec && mode === 'single' && (
        <div className="space-y-3">
          {hasXLinkedLocus && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[var(--barn-muted)] font-medium">
                Simulated Sex (for X-linked loci):
              </span>
              <div
                role="group"
                aria-label="Simulated animal sex"
                className="inline-flex rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] p-0.5"
              >
                {(['Female', 'Male'] as const).map((sexOpt) => (
                  <button
                    key={sexOpt}
                    type="button"
                    aria-pressed={singleSex === sexOpt}
                    onClick={() => setSingleSex(sexOpt)}
                    className={`min-h-[30px] px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      singleSex === sexOpt
                        ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                        : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                    }`}
                  >
                    {sexOpt === 'Male' ? speciesProfile.maleLabel : speciesProfile.femaleLabel}
                  </button>
                ))}
              </div>
            </div>
          )}

          <SandboxGenotypeEditor
            idPrefix={`${baseId}-single`}
            title={`Hypothetical ${speciesProfile.name} Genotype`}
            accentTone="neutral"
            speciesProfile={speciesProfile}
            spec={spec}
            varietyPresets={varietyPresets}
            herdPool={allHerdPool}
            genotypeRaw={singleRaw}
            sex={singleSex}
            onChangeGenotype={setSingleRaw}
            evaluation={singleEval}
          />
        </div>
      )}

      {isExpanded && spec && mode === 'cross' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-[var(--barn-muted)]">
              Tweak either parent&apos;s loci or seed from your herd to preview hypothetical Punnett
              ratios.
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {canSeedFromActiveLogger && (
                <button
                  type="button"
                  onClick={handleSeedBothFromLogger}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] text-[11px] font-semibold text-[var(--barn-ink)] hover:brightness-95"
                >
                  Copy Active Logger Parents
                </button>
              )}
              <button
                type="button"
                onClick={handleSwapParents}
                className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium inline-flex items-center gap-1"
              >
                <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
                Swap Sire &amp; Dam
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <SandboxGenotypeEditor
              idPrefix={`${baseId}-sire`}
              title={`Hypothetical Sire (${speciesProfile.maleLabel})`}
              accentTone="sire"
              speciesProfile={speciesProfile}
              spec={spec}
              varietyPresets={varietyPresets}
              herdPool={males}
              genotypeRaw={sireRaw}
              sex="Male"
              onChangeGenotype={setSireRaw}
              evaluation={sireEval}
              compactGrid
            />
            <SandboxGenotypeEditor
              idPrefix={`${baseId}-dam`}
              title={`Hypothetical Dam (${speciesProfile.femaleLabel})`}
              accentTone="dam"
              speciesProfile={speciesProfile}
              spec={spec}
              varietyPresets={varietyPresets}
              herdPool={females}
              genotypeRaw={damRaw}
              sex="Female"
              onChangeGenotype={setDamRaw}
              evaluation={damEval}
              compactGrid
            />
          </div>

          {/* What-If Pairing Cross Output */}
          {crossSimulation && (
            <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--barn-ink)]">
                  What-If {crossSimulation.speciesName} Offspring Projections
                </h3>
                {crossSimulation.hasUnknownAlleles && (
                  <span className="text-[11px] text-[var(--barn-terracotta)] font-medium">
                    Contains unverified &lsquo;_&rsquo; allele slots
                  </span>
                )}
              </div>

              {crossSimulation.lethalOrHealthAlerts.length > 0 && (
                <div className="space-y-2 text-xs">
                  {crossSimulation.lethalOrHealthAlerts.map((alert, idx) => (
                    <div
                      key={`${alert.title}-${idx}`}
                      className={`p-3 rounded-xl border ${
                        alert.severity === 'danger'
                          ? 'bg-[var(--barn-danger)]/10 border-[var(--barn-danger)]'
                          : alert.severity === 'warning'
                          ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)]'
                          : 'bg-[var(--barn-surface)] border-[var(--barn-border)]'
                      }`}
                    >
                      <div className="font-semibold text-[var(--barn-ink)]">{alert.title}</div>
                      <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">{alert.detail}</p>
                    </div>
                  ))}
                </div>
              )}

              {crossSimulation.uncertainLociNotes.length > 0 && (
                <div className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)]/55 border border-[var(--barn-terracotta)]/60 space-y-1 text-xs">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    Provisional &lsquo;_&rsquo; Loci Uncertainty ({crossSimulation.uncertainLociNotes.length})
                  </div>
                  <ul className="space-y-0.5 text-[11px] text-[var(--barn-muted)] list-disc pl-4">
                    {crossSimulation.uncertainLociNotes.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}

              {crossSimulation.locusBreakdowns.length === 0 ? (
                <p className="text-xs text-[var(--barn-muted)]">
                  Enter at least one shared locus on both the hypothetical Sire and Dam above to
                  compute Punnett percentages.
                </p>
              ) : (
                <>
                  {crossSimulation.predictedPhenotypes.length > 0 && (
                    <div className="space-y-1.5 text-xs">
                      {crossSimulation.predictedPhenotypes.map((ph, idx) => (
                        <div
                          key={`${ph.sexGroup || 'all'}-${ph.label}-${idx}`}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]"
                        >
                          <div className="min-w-0">
                            {ph.sexGroup && (
                              <span className="font-mono text-[11px] text-[var(--barn-slate)] mr-1.5">
                                [{ph.sexGroup}]
                              </span>
                            )}
                            <span className="font-medium text-[var(--barn-ink)]">{ph.label}</span>
                            <span className="font-mono text-[var(--barn-muted)] ml-2">
                              {ph.genotypeSummary}
                            </span>
                            {ph.hasUnknownCarrier && (
                              <span className="text-[11px] text-[var(--barn-terracotta)] ml-2">
                                (provisional &lsquo;_&rsquo;)
                              </span>
                            )}
                          </div>
                          <span className="font-mono font-semibold tabular-nums shrink-0">
                            {ph.probabilityPercent.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
                    {crossSimulation.locusBreakdowns.map((lb) => (
                      <div
                        key={lb.locus}
                        className="p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-1.5"
                      >
                        <div className="font-semibold text-[var(--barn-ink)]">
                          {lb.locusName}{' '}
                          <span className="font-mono text-[var(--barn-muted)]">
                            ({lb.sirePair} × {lb.damPair})
                          </span>
                        </div>
                        {lb.sexSplitOutcomes ? (
                          <div className="font-mono text-[11px] text-[var(--barn-muted)] space-y-1 tabular-nums">
                            <div>
                              <span className="font-sans font-medium text-[var(--barn-slate)]">
                                Male (XY):
                              </span>
                              {lb.sexSplitOutcomes.male.map((o) => (
                                <div key={`m-${o.genotype}`} className="flex justify-between gap-2">
                                  <span className="truncate">{o.displayLabel || o.genotype}</span>
                                  <span>{o.probabilityPercent}%</span>
                                </div>
                              ))}
                            </div>
                            <div className="border-t border-[var(--barn-border)]/60 pt-1">
                              <span className="font-sans font-medium text-[var(--barn-terracotta)]">
                                Female (XX):
                              </span>
                              {lb.sexSplitOutcomes.female.map((o) => (
                                <div key={`f-${o.genotype}`} className="flex justify-between gap-2">
                                  <span className="truncate">{o.displayLabel || o.genotype}</span>
                                  <span>{o.probabilityPercent}%</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="font-mono text-[11px] text-[var(--barn-muted)] space-y-0.5 tabular-nums">
                            {lb.outcomes.map((o) => (
                              <div key={o.genotype} className="flex justify-between gap-2">
                                <span className="truncate" title={o.displayLabel || o.genotype}>
                                  {o.displayLabel || o.genotype}
                                </span>
                                <span className="shrink-0">{o.probabilityPercent}%</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
