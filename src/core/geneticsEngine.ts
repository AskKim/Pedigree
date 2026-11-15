/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Coat Color Genetics, Allele Inference & Test-Breeding Punnett Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM dependencies.
 *
 * Designed around ARBA rabbit genetics (Evans Software workflow model) with special
 * attention to New Zealand Red (`A_ B_ C_ D_ ee ww`) and standard coat color loci
 * (`A`, `B`, `C`, `D`, `E`, `En`, `Du`, `V`, `W`), while cleanly supporting custom loci
 * for any livestock species.
 */

import { Animal, GenotypeAllelePair } from './models';

export interface LocusDefinition {
  locus: string;
  name: string;
  alleles: string[]; // Ordered from most dominant to most recessive
  description: string;
}

/**
 * Standard ARBA Rabbit Coat Color Loci ordered by dominance hierarchy.
 */
export const RABBIT_COLOR_LOCI: LocusDefinition[] = [
  {
    locus: 'A',
    name: 'Agouti',
    alleles: ['A', 'at', 'a'],
    description: 'A = Agouti/Red/Chestnut, at = Tan/Otter, a = Self (Black/Blue/Chocolate)',
  },
  {
    locus: 'B',
    name: 'Black / Brown',
    alleles: ['B', 'b'],
    description: 'B = Black pigment base, b = Chocolate/Brown pigment base',
  },
  {
    locus: 'C',
    name: 'Color / Fullness',
    alleles: ['C', 'chd', 'chl', 'ch', 'c'],
    description: 'C = Full color, chd = Chinchilla, chl = Sable, ch = Himalayan, c = REW',
  },
  {
    locus: 'D',
    name: 'Dense / Dilute',
    alleles: ['D', 'd'],
    description: 'D = Dense pigment (Red/Black/Chocolate), d = Dilute (Fawn/Blue/Lilac)',
  },
  {
    locus: 'E',
    name: 'Extension',
    alleles: ['Es', 'E', 'ej', 'e'],
    description: 'E = Normal extension, e = Non-extension red/orange/tort (ee in New Zealand Red)',
  },
  {
    locus: 'W',
    name: 'Wide Band',
    alleles: ['W', 'w'],
    description: 'W = Normal agouti band, w = Wide-band rich red belly/undercolor (ww in NZ Red)',
  },
  {
    locus: 'En',
    name: 'English / Broken',
    alleles: ['En', 'en'],
    description: 'Enen = Broken pattern, EnEn = Charlie, enen = Solid coat',
  },
  {
    locus: 'V',
    name: 'Vienna',
    alleles: ['V', 'v'],
    description: 'VV = Non-Vienna, Vv = Vienna carrier, vv = Blue-Eyed White (BEW)',
  },
  {
    locus: 'Du',
    name: 'Dutch',
    alleles: ['Du', 'du'],
    description: 'Du = Non-Dutch solid, du = Dutch belted markings',
  },
];

/**
 * Known Rabbit Variety -> Baseline Phenotype Genotype Presets (Evans-style auto-fill).
 */
export const RABBIT_VARIETY_GENOTYPE_PRESETS: Record<string, string> = {
  Red: 'A_ B_ C_ D_ ee ww',
  'New Zealand Red': 'A_ B_ C_ D_ ee ww',
  White: '__ __ cc __ __',
  'Ruby-Eyed White (REW)': '__ __ cc __ __',
  Black: 'aa B_ C_ D_ E_',
  Broken: 'A_ B_ C_ D_ E_ Enen',
  'Broken Red': 'A_ B_ C_ D_ ee ww Enen',
  Chestnut: 'A_ B_ C_ D_ E_ W_',
  Chocolate: 'aa bb C_ D_ E_',
  Blue: 'aa B_ C_ dd E_',
  Fawn: 'A_ B_ C_ dd ee',
  Chinchilla: 'A_ B_ chd_ D_ E_',
  'Blue-Eyed White (BEW)': '__ __ __ __ __ vv',
};

/**
 * Formats a `GenotypeAllelePair[]` array into a clean shorthand string (e.g., `"A_ B_ C_ D_ ee ww"`).
 */
export function formatGenotypeArray(pairs: GenotypeAllelePair[]): string {
  if (!pairs || pairs.length === 0) return '';
  return pairs
    .filter((p) => p.allele1 || p.allele2)
    .map((p) => `${p.allele1 || '_'}${p.allele2 || '_'}`)
    .join(' ');
}

/**
 * Parses a shorthand genotype string (such as `"Aa B_ Cc Dd ee ww"`) into structured `GenotypeAllelePair[]`.
 */
export function parseGenotypeString(raw: string): GenotypeAllelePair[] {
  const clean = (raw || '').trim();
  if (!clean) return [];

  const tokens = clean.split(/\s+/);
  const result: GenotypeAllelePair[] = [];

  const knownTokens: Array<{ locus: string; alleles: string[] }> = RABBIT_COLOR_LOCI.map((l) => ({
    locus: l.locus,
    alleles: [...l.alleles].sort((a, b) => b.length - a.length), // Match multi-char alleles like chd, En first
  }));

  tokens.forEach((token, index) => {
    let matched = false;
    for (const def of knownTokens) {
      for (const a1 of [...def.alleles, '_']) {
        if (token.startsWith(a1)) {
          const rest = token.slice(a1.length);
          if ([...def.alleles, '_'].includes(rest)) {
            result.push({ locus: def.locus, allele1: a1, allele2: rest });
            matched = true;
            break;
          }
        }
      }
      if (matched) break;
    }

    if (!matched && token.length >= 2) {
      const half = Math.ceil(token.length / 2);
      result.push({
        locus: `L${index + 1}`,
        allele1: token.slice(0, half),
        allele2: token.slice(half) || '_',
      });
    }
  });

  return result;
}

export interface InferredGenotypeNote {
  locus: string;
  before: string;
  after: string;
  reason: string;
}

export interface GenotypeInferenceResult {
  updatedPairs: GenotypeAllelePair[];
  formatted: string;
  notes: InferredGenotypeNote[];
  conflicts: string[];
}

/**
 * Infers hidden recessive alleles on a subject animal using its parents AND its recorded offspring.
 * Flags impossible genetic outcomes if a homozygous parent conflicts with a recorded offspring.
 */
export function inferHiddenAlleles(
  subject: Animal,
  herdById: Map<string, Animal>,
  allSpeciesAnimals: Animal[]
): GenotypeInferenceResult {
  const basePairs =
    subject.genotype.length > 0 ? subject.genotype : parseGenotypeString(subject.genotypeRaw);

  const byLocus = new Map<string, GenotypeAllelePair>();
  for (const p of basePairs) {
    byLocus.set(p.locus, { ...p });
  }

  const sire = subject.sireId ? herdById.get(subject.sireId) : undefined;
  const dam = subject.damId ? herdById.get(subject.damId) : undefined;
  const offspring = allSpeciesAnimals.filter(
    (a) => a.sireId === subject.id || a.damId === subject.id
  );

  const notes: InferredGenotypeNote[] = [];
  const conflicts: string[] = [];

  for (const locusDef of RABBIT_COLOR_LOCI) {
    const current = byLocus.get(locusDef.locus);
    if (!current) continue;

    const mostRecessive = locusDef.alleles[locusDef.alleles.length - 1];

    // 1. Parent-to-Subject Inference: If either parent is homozygous recessive (e.g. ee or bb or cc or dd),
    // the parent MUST pass that recessive allele to every offspring.
    for (const [parentLabel, parent] of [
      ['Sire', sire],
      ['Dam', dam],
    ] as const) {
      if (!parent) continue;
      const pPairs =
        parent.genotype.length > 0 ? parent.genotype : parseGenotypeString(parent.genotypeRaw);
      const pLocus = pPairs.find((x) => x.locus === locusDef.locus);
      if (!pLocus) continue;

      if (
        pLocus.allele1 !== '_' &&
        pLocus.allele1 === pLocus.allele2 &&
        pLocus.allele1 !== current.allele1
      ) {
        const passedAllele = pLocus.allele1;
        if (current.allele2 === '_') {
          const before = `${current.allele1}${current.allele2}`;
          current.allele2 = passedAllele;
          notes.push({
            locus: locusDef.locus,
            before,
            after: `${current.allele1}${current.allele2}`,
            reason: `${parentLabel} (${parent.name}) is homozygous ${passedAllele}${passedAllele} and must pass '${passedAllele}'.`,
          });
        } else if (current.allele1 !== passedAllele && current.allele2 !== passedAllele) {
          conflicts.push(
            `${locusDef.name} (${locusDef.locus}): ${parentLabel} ${parent.name} is ${passedAllele}${passedAllele}, which conflicts with ${subject.name}'s recorded ${current.allele1}${current.allele2}.`
          );
        }
      }
    }

    // 2. Offspring-to-Subject Inference: If any offspring is homozygous recessive (e.g. cc REW, bb Chocolate, dd Dilute, ee Non-extension),
    // BOTH parents must carry at least one copy of that recessive allele.
    for (const kit of offspring) {
      const kPairs = kit.genotype.length > 0 ? kit.genotype : parseGenotypeString(kit.genotypeRaw);
      const kLocus = kPairs.find((x) => x.locus === locusDef.locus);
      if (!kLocus) continue;

      if (kLocus.allele1 === mostRecessive && kLocus.allele2 === mostRecessive) {
        if (current.allele2 === '_' && current.allele1 !== mostRecessive) {
          const before = `${current.allele1}${current.allele2}`;
          current.allele2 = mostRecessive;
          notes.push({
            locus: locusDef.locus,
            before,
            after: `${current.allele1}${current.allele2}`,
            reason: `Offspring ${kit.name} expresses ${mostRecessive}${mostRecessive}, proving ${subject.name} carries '${mostRecessive}'.`,
          });
        } else if (
          current.allele1 !== '_' &&
          current.allele2 !== '_' &&
          current.allele1 !== mostRecessive &&
          current.allele2 !== mostRecessive
        ) {
          conflicts.push(
            `${locusDef.name} (${locusDef.locus}): Offspring ${kit.name} is ${mostRecessive}${mostRecessive}, impossible if ${subject.name} is ${current.allele1}${current.allele2}.`
          );
        }
      }
    }
  }

  const updatedPairs = Array.from(byLocus.values());
  return {
    updatedPairs,
    formatted: formatGenotypeArray(updatedPairs),
    notes,
    conflicts,
  };
}

export interface LocusPunnettOutcome {
  locus: string;
  locusName: string;
  sirePair: string;
  damPair: string;
  outcomes: Array<{
    genotype: string;
    probabilityPercent: number;
    hasUnknownCarrier: boolean;
  }>;
}

export interface PunnettSimulationSummary {
  locusBreakdowns: LocusPunnettOutcome[];
  predictedPhenotypes: Array<{
    label: string;
    genotypeSummary: string;
    probabilityPercent: number;
  }>;
  hasUnknownAlleles: boolean;
}

function orderPair(locusDef: LocusDefinition | undefined, a1: string, a2: string): string {
  if (a1 === '_' && a2 === '_') return '__';
  if (a1 === '_') return `${a2}_`;
  if (a2 === '_') return `${a1}_`;
  if (!locusDef) return a1 <= a2 ? `${a1}${a2}` : `${a2}${a1}`;
  const i1 = locusDef.alleles.indexOf(a1);
  const i2 = locusDef.alleles.indexOf(a2);
  if (i1 === -1 || i2 === -1) return `${a1}${a2}`;
  return i1 <= i2 ? `${a1}${a2}` : `${a2}${a1}`;
}

/**
 * Simulates a Sire × Dam test-breeding across shared coat-color loci and predicts offspring
 * genotype probabilities and primary ARBA rabbit coat color outcomes.
 */
export function simulatePairingGenetics(sire: Animal, dam: Animal): PunnettSimulationSummary {
  const sirePairs = sire.genotype.length > 0 ? sire.genotype : parseGenotypeString(sire.genotypeRaw);
  const damPairs = dam.genotype.length > 0 ? dam.genotype : parseGenotypeString(dam.genotypeRaw);

  const sireMap = new Map(sirePairs.map((p) => [p.locus, p]));
  const damMap = new Map(damPairs.map((p) => [p.locus, p]));

  const allLoci = Array.from(new Set([...sireMap.keys(), ...damMap.keys()]));
  const locusBreakdowns: LocusPunnettOutcome[] = [];
  let hasUnknownAlleles = false;

  for (const locus of allLoci) {
    const s = sireMap.get(locus);
    const d = damMap.get(locus);
    if (!s || !d) continue;

    const locusDef = RABBIT_COLOR_LOCI.find((l) => l.locus === locus);
    const sGametes = [s.allele1 || '_', s.allele2 || '_'];
    const dGametes = [d.allele1 || '_', d.allele2 || '_'];

    if (sGametes.includes('_') || dGametes.includes('_')) {
      hasUnknownAlleles = true;
    }

    const tally = new Map<string, number>();
    for (const sg of sGametes) {
      for (const dg of dGametes) {
        const combo = orderPair(locusDef, sg, dg);
        tally.set(combo, (tally.get(combo) ?? 0) + 25);
      }
    }

    const outcomes = Array.from(tally.entries())
      .map(([genotype, probabilityPercent]) => ({
        genotype,
        probabilityPercent,
        hasUnknownCarrier: genotype.includes('_'),
      }))
      .sort((a, b) => b.probabilityPercent - a.probabilityPercent);

    locusBreakdowns.push({
      locus,
      locusName: locusDef?.name ?? `Locus ${locus}`,
      sirePair: `${s.allele1}${s.allele2}`,
      damPair: `${d.allele1}${d.allele2}`,
      outcomes,
    });
  }

  // Compute combined top phenotype predictions across A, B, C, D, E, W, En
  const coreLoci = ['A', 'B', 'C', 'D', 'E', 'W', 'En'];
  const activeBreakdowns = locusBreakdowns.filter((b) => coreLoci.includes(b.locus));

  if (activeBreakdowns.length === 0) {
    return { locusBreakdowns, predictedPhenotypes: [], hasUnknownAlleles };
  }

  type ComboAcc = { map: Record<string, string>; prob: number };
  let combinations: ComboAcc[] = [{ map: {}, prob: 1 }];

  for (const b of activeBreakdowns) {
    const next: ComboAcc[] = [];
    for (const existing of combinations) {
      for (const out of b.outcomes) {
        next.push({
          map: { ...existing.map, [b.locus]: out.genotype },
          prob: existing.prob * (out.probabilityPercent / 100),
        });
      }
    }
    combinations = next;
  }

  const phenotypeMap = new Map<string, { prob: number; sampleGenotype: string }>();

  for (const c of combinations) {
    const label = classifyRabbitPhenotype(c.map);
    const genoStr = coreLoci
      .filter((l) => c.map[l])
      .map((l) => c.map[l])
      .join(' ');
    const prev = phenotypeMap.get(label);
    if (prev) {
      prev.prob += c.prob;
    } else {
      phenotypeMap.set(label, { prob: c.prob, sampleGenotype: genoStr });
    }
  }

  const predictedPhenotypes = Array.from(phenotypeMap.entries())
    .map(([label, info]) => ({
      label,
      genotypeSummary: info.sampleGenotype,
      probabilityPercent: Math.round(info.prob * 1000) / 10,
    }))
    .sort((a, b) => b.probabilityPercent - a.probabilityPercent)
    .slice(0, 6);

  return {
    locusBreakdowns,
    predictedPhenotypes,
    hasUnknownAlleles,
  };
}

function classifyRabbitPhenotype(loci: Record<string, string>): string {
  const c = loci['C'] || 'C_';
  if (c === 'cc') return 'Ruby-Eyed White (REW)';

  const a = loci['A'] || 'A_';
  const b = loci['B'] || 'B_';
  const d = loci['D'] || 'D_';
  const e = loci['E'] || 'E_';
  const w = loci['W'] || 'W_';
  const en = loci['En'] || 'enen';

  const isSelf = a === 'aa';
  const isChocolate = b === 'bb';
  const isDilute = d === 'dd';
  const isNonExtension = e === 'ee';
  const isWideBand = w === 'ww';
  const patternPrefix =
    en === 'EnEn' ? 'Charlie ' : en.startsWith('En') ? 'Broken ' : '';

  if (isNonExtension) {
    if (!isSelf) {
      if (isDilute) return `${patternPrefix}Fawn / Cream`;
      if (isChocolate) return `${patternPrefix}Chocolate Orange / Amber`;
      return isWideBand ? `${patternPrefix}New Zealand Red (Wide-Band)` : `${patternPrefix}Orange / Red`;
    }
    if (isChocolate && isDilute) return `${patternPrefix}Lilac Tortoise`;
    if (isChocolate) return `${patternPrefix}Chocolate Tortoise`;
    if (isDilute) return `${patternPrefix}Blue Tortoise`;
    return `${patternPrefix}Black Tortoise`;
  }

  if (isSelf) {
    if (isChocolate && isDilute) return `${patternPrefix}Lilac`;
    if (isChocolate) return `${patternPrefix}Chocolate`;
    if (isDilute) return `${patternPrefix}Blue`;
    return `${patternPrefix}Black`;
  }

  if (c.startsWith('chd')) {
    return `${patternPrefix}Chinchilla`;
  }

  if (isChocolate && isDilute) return `${patternPrefix}Lynx`;
  if (isChocolate) return `${patternPrefix}Chocolate Agouti`;
  if (isDilute) return `${patternPrefix}Opal`;
  return `${patternPrefix}Chestnut Agouti`;
}
