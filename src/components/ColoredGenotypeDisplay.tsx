/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Reusable Color-Coded Allele Provenance Renderer & Legend.
 *
 * Visually distinguishes each allele's provenance using theme-aware tokens:
 * - Sire-inherited: Slate (`--barn-slate`)
 * - Dam-inherited: Terracotta (`--barn-terracotta`)
 * - Inferred from offspring: Sage (`--barn-sage`, dotted underline)
 * - Manually entered: Ink (`--barn-ink`)
 * - Unverified slot (`_`): Muted (`--barn-muted`)
 */

import React from 'react';
import {
  AlleleProvenanceSource,
  AnimalAlleleProvenanceResult,
  AnnotatedAllele,
} from '../core/geneticsEngine';

const SOURCE_CLASS_MAP: Record<AlleleProvenanceSource, string> = {
  sire: 'text-[var(--barn-slate)] font-semibold',
  dam: 'text-[var(--barn-terracotta)] font-semibold',
  offspring:
    'text-[var(--barn-sage)] font-semibold underline decoration-dotted underline-offset-2',
  manual: 'text-[var(--barn-ink)]',
  unknown: 'text-[var(--barn-muted)]',
};

const SOURCE_SHORT_LABEL: Record<AlleleProvenanceSource, string> = {
  sire: 'From Sire',
  dam: 'From Dam',
  offspring: 'Inferred from Offspring',
  manual: 'Manually Entered',
  unknown: 'Unverified (_)',
};

export interface AlleleProvenanceLegendProps {
  compact?: boolean;
  className?: string;
}

export function AlleleProvenanceLegend({
  compact = false,
  className = '',
}: AlleleProvenanceLegendProps) {
  return (
    <div
      aria-label="Allele provenance color key"
      className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 ${
        compact ? 'text-[10px]' : 'text-[11px]'
      } text-[var(--barn-muted)] ${className}`.trim()}
    >
      <span className="font-medium text-[var(--barn-muted)]">Alleles:</span>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className="w-2 h-2 rounded-full bg-[var(--barn-slate)] shrink-0"
        />
        <span className="text-[var(--barn-slate)] font-semibold">Sire</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className="w-2 h-2 rounded-full bg-[var(--barn-terracotta)] shrink-0"
        />
        <span className="text-[var(--barn-terracotta)] font-semibold">Dam</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className="w-2 h-2 rounded-full bg-[var(--barn-sage)] shrink-0"
        />
        <span className="text-[var(--barn-sage)] font-semibold underline decoration-dotted underline-offset-2">
          Offspring
        </span>
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className="w-2 h-2 rounded-full bg-[var(--barn-ink)] shrink-0"
        />
        <span className="text-[var(--barn-ink)] font-medium">Manual</span>
      </span>
    </div>
  );
}

export interface ColoredGenotypeDisplayProps {
  provenance: AnimalAlleleProvenanceResult | null | undefined;
  fallbackText?: string;
  compact?: boolean;
  showLegend?: boolean;
  className?: string;
}

function renderAlleleSpan(
  allele: AnnotatedAllele,
  locus: string,
  locusName: string,
  slotKey: string
) {
  const baseClass = SOURCE_CLASS_MAP[allele.source];
  const uncommittedClass = allele.isInferredUncommitted ? ' italic' : '';
  const tooltip = `${locusName} (${locus}): ${allele.allele} — ${allele.detail}${
    allele.isInferredUncommitted ? ' (uncommitted inference)' : ''
  }`;
  return (
    <span
      key={slotKey}
      title={tooltip}
      data-provenance={allele.source}
      className={`${baseClass}${uncommittedClass}`}
    >
      {allele.allele}
    </span>
  );
}

export function ColoredGenotypeDisplay({
  provenance,
  fallbackText = '',
  compact = false,
  showLegend = false,
  className = '',
}: ColoredGenotypeDisplayProps) {
  if (!provenance || provenance.isCustomSpeciesFallback || provenance.loci.length === 0) {
    const text = provenance?.rawFallback || fallbackText;
    if (!text) return null;
    return <span className={`font-mono ${className}`.trim()}>{text}</span>;
  }

  const ariaSummary = provenance.loci
    .map(
      (pair) =>
        `${pair.locus}: ${pair.allele1.allele} (${SOURCE_SHORT_LABEL[pair.allele1.source]}), ${
          pair.allele2.allele
        } (${SOURCE_SHORT_LABEL[pair.allele2.source]})`
    )
    .join('; ');

  const content = (
    <span
      aria-label={`Genotype with allele provenance: ${ariaSummary}`}
      className={`font-mono ${compact ? '' : 'tracking-tight'} ${className}`.trim()}
    >
      {provenance.loci.map((pair, idx) => (
        <React.Fragment key={`${pair.locus}-${idx}`}>
          {idx > 0 && ' '}
          <span className="inline-block">
            {renderAlleleSpan(pair.allele1, pair.locus, pair.locusName, `${pair.locus}-1`)}
            {renderAlleleSpan(pair.allele2, pair.locus, pair.locusName, `${pair.locus}-2`)}
          </span>
        </React.Fragment>
      ))}
    </span>
  );

  if (!showLegend) {
    return content;
  }

  return (
    <div className="space-y-1.5 min-w-0">
      <div className="break-words">{content}</div>
      <AlleleProvenanceLegend compact={compact} />
    </div>
  );
}
