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
 * Evaluates shared Confirmed, Suspected, and Lineage-Potential carrier risks between Sire and Dam.
 */
export function analyzePairingCarrierRisks(
  sire: Animal,
  dam: Animal,
  herdById: Map<string, Animal>
): PairingCarrierRisk[] {
  const sAnalysis = analyzeAnimalCarrierLineage(sire, herdById);
  const dAnalysis = analyzeAnimalCarrierLineage(dam, herdById);

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
