/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Multi-Species Coat Color Genetics, Allele Inference & Test-Breeding Punnett Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) dependencies so the exact
 * same genetics logic runs offline in Web PWAs and native mobile apps.
 *
 * Key Safety & Accuracy Rules:
 * 1. Species-scoped registry across all 11 predefined species (`Rabbit`, `Cat`, `Dog`, `Goat`,
 *    `Sheep`, `Cattle`, `Swine / Pig`, `Alpaca`, `Guinea Pig`, `Chinchilla`, `Ferret`), with
 *    strict `null` plain-text fallback for user-created custom species (zero Rabbit bleed-through).
 * 2. Conservative variety presets (e.g., Rabbit `Red` / `New Zealand Red` = `A_ B_ C_ D_ ee __`)
 *    never silently assume unverified Wide-Band (`ww`); breeders verify `ww` explicitly.
 * 3. Unknown `_` slots never synthesize fake homozygous blank (`__`) certainty in Punnett outputs.
 */

import { Animal, BiologicalSex, GenotypeAllelePair } from './models';

export type InheritanceMode = 'autosomal' | 'x_linked' | 'incomplete_dominant' | 'codominant';

export interface LocusDefinition {
  locus: string;
  name: string;
  alleles: string[]; // Ordered from most dominant to most recessive
  inheritanceMode?: InheritanceMode;
  description: string;
}

export interface VarietyPresetOption {
  locus: string;
  suggestedAlleles: string;
  label: string;
  explanation: string;
}

export interface VarietyPresetDefinition {
  variety: string;
  conservativeGenotype: string;
  optionalConfirmations?: VarietyPresetOption[];
  note?: string;
}

export interface BreedingGeneticAlert {
  severity: 'danger' | 'warning' | 'info';
  title: string;
  detail: string;
  locus?: string;
}

export interface SpeciesGeneticsSpec {
  speciesKey: string;
  displayName: string;
  aliases: string[];
  loci: LocusDefinition[];
  corePhenotypeLoci: string[];
  varietyPresets: VarietyPresetDefinition[];
  supportsRufusIntensity?: boolean;
  classifyPhenotype: (loci: Record<string, string>, sex?: BiologicalSex) => string;
  evaluatePairingAlerts?: (
    breakdownsByLocus: Map<string, LocusPunnettOutcome>,
    sire: Animal,
    dam: Animal
  ) => BreedingGeneticAlert[];
}

// ─── 1. RABBIT (ARBA Coat Color Genetics) ──────────────────────────────────────

export const RABBIT_COLOR_LOCI: LocusDefinition[] = [
  {
    locus: 'A',
    name: 'Agouti',
    alleles: ['A', 'at', 'a'],
    description: 'A = Agouti/Red/Chestnut, at = Tan/Otter/Silver Marten, a = Self (Black/Blue/Chocolate)',
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
    description: 'C = Full color, chd = Chinchilla, chl = Sable/Seal, ch = Himalayan/Pointed, c = REW',
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
    description:
      'Es = Steel, E = Normal extension, ej = Harlequin/Japanese, e = Non-extension red/orange/tort',
  },
  {
    locus: 'W',
    name: 'Wide Band',
    alleles: ['W', 'w'],
    description:
      'W = Normal agouti band, w = Wide-band red belly/undercolor (ww verified separately from Rufus depth)',
  },
  {
    locus: 'En',
    name: 'English / Broken',
    alleles: ['En', 'en'],
    inheritanceMode: 'incomplete_dominant',
    description: 'Enen = Broken pattern, EnEn = Charlie (megacolon risk), enen = Solid coat',
  },
  {
    locus: 'V',
    name: 'Vienna',
    alleles: ['V', 'v'],
    description: 'VV = Non-Vienna, Vv = Vienna carrier (blue-eyed marks), vv = Blue-Eyed White (BEW)',
  },
  {
    locus: 'Du',
    name: 'Dutch',
    alleles: ['Du', 'du'],
    description: 'Du = Non-Dutch solid, du = Dutch belted markings',
  },
];

const WIDE_BAND_CONFIRM_OPTION: VarietyPresetOption = {
  locus: 'W',
  suggestedAlleles: 'ww',
  label: 'Confirm Wide-Band (ww)',
  explanation:
    'Many show Reds are Ww or WW with Rufus polygenes rather than true ww. Only check if Wide-Band (ww) is proven by pedigree or test breeding.',
};

export const RABBIT_VARIETY_PRESET_DEFS: VarietyPresetDefinition[] = [
  {
    variety: 'Red',
    conservativeGenotype: 'A_ B_ C_ D_ ee __',
    optionalConfirmations: [WIDE_BAND_CONFIRM_OPTION],
    note: 'Rufus intensity is tracked separately on the profile selector.',
  },
  {
    variety: 'New Zealand Red',
    conservativeGenotype: 'A_ B_ C_ D_ ee __',
    optionalConfirmations: [WIDE_BAND_CONFIRM_OPTION],
    note: 'Leaves Wide-Band (__ / W) open unless confirmed ww.',
  },
  {
    variety: 'Broken Red',
    conservativeGenotype: 'A_ B_ C_ D_ ee __ Enen',
    optionalConfirmations: [WIDE_BAND_CONFIRM_OPTION],
  },
  {
    variety: 'White',
    conservativeGenotype: '__ __ cc __ __',
  },
  {
    variety: 'Ruby-Eyed White (REW)',
    conservativeGenotype: '__ __ cc __ __',
  },
  {
    variety: 'Blue-Eyed White (BEW)',
    conservativeGenotype: '__ __ __ __ __ vv',
  },
  {
    variety: 'Black',
    conservativeGenotype: 'aa B_ C_ D_ E_',
  },
  {
    variety: 'Broken',
    conservativeGenotype: 'A_ B_ C_ D_ E_ Enen',
  },
  {
    variety: 'Chestnut',
    conservativeGenotype: 'A_ B_ C_ D_ E_ W_',
  },
  {
    variety: 'Chocolate',
    conservativeGenotype: 'aa bb C_ D_ E_',
  },
  {
    variety: 'Blue',
    conservativeGenotype: 'aa B_ C_ dd E_',
  },
  {
    variety: 'Fawn',
    conservativeGenotype: 'A_ B_ C_ dd ee __',
    optionalConfirmations: [WIDE_BAND_CONFIRM_OPTION],
  },
  {
    variety: 'Chinchilla',
    conservativeGenotype: 'A_ B_ chd_ D_ E_',
  },
  {
    variety: 'Black Otter',
    conservativeGenotype: 'at_ B_ C_ D_ E_',
  },
  {
    variety: 'Siamese Sable',
    conservativeGenotype: 'aa B_ chl_ D_ E_',
  },
  {
    variety: 'Californian / Himalayan',
    conservativeGenotype: 'aa B_ chch D_ E_',
  },
  {
    variety: 'Dutch',
    conservativeGenotype: 'aa B_ C_ D_ E_ dudu',
  },
  {
    variety: 'Harlequin',
    conservativeGenotype: 'A_ B_ C_ D_ ej_',
  },
];

/**
 * Backward-compatible flat map of conservative baseline presets (never assumes unverified `ww`).
 */
export const RABBIT_VARIETY_GENOTYPE_PRESETS: Record<string, string> = Object.fromEntries(
  RABBIT_VARIETY_PRESET_DEFS.map((d) => [d.variety, d.conservativeGenotype])
);

function classifyRabbitPhenotype(loci: Record<string, string>): string {
  const c = loci['C'] || 'C_';
  const v = loci['V'] || 'V_';
  if (v === 'vv') return 'Blue-Eyed White (BEW)';
  if (c === 'cc') return 'Ruby-Eyed White (REW)';

  const a = loci['A'] || 'A_';
  const b = loci['B'] || 'B_';
  const d = loci['D'] || 'D_';
  const e = loci['E'] || 'E_';
  const w = loci['W'] || '__';
  const en = loci['En'] || 'enen';
  const du = loci['Du'] || 'Du_';

  const patternParts: string[] = [];
  if (en === 'EnEn') patternParts.push('Charlie');
  else if (en.startsWith('En')) patternParts.push('Broken');
  if (du === 'dudu') patternParts.push('Dutch');
  const patternPrefix = patternParts.length > 0 ? `${patternParts.join(' ')} ` : '';

  const isSelf = a === 'aa';
  const isTan = a === 'at_' || a === 'atat' || a === 'ata';
  const isChocolate = b === 'bb';
  const isDilute = d === 'dd';
  const isNonExtension = e === 'ee';
  const isHarlequin = e === 'ejej' || e === 'eje' || e === 'ej_';
  const isSteel = e.startsWith('Es');
  const isConfirmedWideBand = w === 'ww';
  const isConfirmedNormalBand = w.startsWith('W') && w !== 'W_';
  const hasUnknownWideBand = w.includes('_');

  if (c === 'chch' || c === 'chc' || c === 'ch_') {
    if (isChocolate && isDilute) return `${patternPrefix}Lilac Himalayan / Pointed White`;
    if (isChocolate) return `${patternPrefix}Chocolate Himalayan / Pointed White`;
    if (isDilute) return `${patternPrefix}Blue Himalayan / Pointed White`;
    return `${patternPrefix}Black Himalayan / Californian Pointed`;
  }

  if (c.startsWith('chl')) {
    if (isDilute && isSelf) return `${patternPrefix}Smoke Pearl`;
    if (isSelf) return `${patternPrefix}${c === 'chlchl' ? 'Seal / ' : ''}Siamese Sable`;
    if (isTan) return `${patternPrefix}Sable Marten`;
    if (isNonExtension) return `${patternPrefix}Sable Point`;
    return `${patternPrefix}Sable Chinchilla`;
  }

  if (isHarlequin) {
    return `${patternPrefix}${en.startsWith('En') ? 'Tricolor' : 'Harlequin'}`;
  }

  if (isNonExtension) {
    if (isSelf) {
      if (isChocolate && isDilute) return `${patternPrefix}Lilac Tortoise`;
      if (isChocolate) return `${patternPrefix}Chocolate Tortoise`;
      if (isDilute) return `${patternPrefix}Blue Tortoise`;
      return `${patternPrefix}Black Tortoise`;
    }
    if (isDilute) return `${patternPrefix}Fawn / Cream`;
    if (isChocolate) return `${patternPrefix}Chocolate Orange / Amber`;
    if (isConfirmedWideBand) return `${patternPrefix}New Zealand Red (Wide-Band ww)`;
    if (hasUnknownWideBand) return `${patternPrefix}Red / Orange (Wide-Band Unverified)`;
    if (isConfirmedNormalBand || w === 'W_') {
      return `${patternPrefix}Orange / Non-Wide-Band Red (W_)`;
    }
    return `${patternPrefix}Red / Orange`;
  }

  if (isSteel) {
    if (c.startsWith('chd')) return `${patternPrefix}Silver-Tipped Steel`;
    if (isDilute) return `${patternPrefix}Blue Steel`;
    return `${patternPrefix}Gold-Tipped Steel`;
  }

  if (isSelf) {
    if (c.startsWith('chd')) return `${patternPrefix}${isDilute ? 'Blue' : 'Black'} Self Chinchilla`;
    if (isChocolate && isDilute) return `${patternPrefix}Lilac`;
    if (isChocolate) return `${patternPrefix}Chocolate`;
    if (isDilute) return `${patternPrefix}Blue`;
    return `${patternPrefix}Black`;
  }

  if (isTan) {
    const colorName = isChocolate && isDilute ? 'Lilac' : isChocolate ? 'Chocolate' : isDilute ? 'Blue' : 'Black';
    if (c.startsWith('chd')) return `${patternPrefix}${colorName} Silver Marten`;
    return `${patternPrefix}${colorName} Otter / Tan`;
  }

  if (c.startsWith('chd')) {
    if (isDilute) return `${patternPrefix}Squirrel (Blue Chinchilla)`;
    return `${patternPrefix}Chinchilla`;
  }

  if (isChocolate && isDilute) return `${patternPrefix}Lynx`;
  if (isChocolate) return `${patternPrefix}Chocolate Agouti`;
  if (isDilute) return `${patternPrefix}Opal`;
  return `${patternPrefix}Chestnut Agouti`;
}

// ─── 2. CAT (X-Linked Orange O/o & Feline Loci) ───────────────────────────────

const CAT_COLOR_LOCI: LocusDefinition[] = [
  { locus: 'A', name: 'Agouti / Tabby', alleles: ['A', 'a'], description: 'A = Tabby expressed, a = Solid non-agouti' },
  { locus: 'B', name: 'Black / Chocolate / Cinnamon', alleles: ['B', 'b', 'b1'], description: 'B = Black, b = Chocolate, b1 = Cinnamon' },
  { locus: 'C', name: 'Colorpoint / Albino', alleles: ['C', 'cb', 'cs', 'c'], description: 'C = Full, cb = Burmese sepia, cs = Siamese point, cbcs = Mink, c = Albino' },
  { locus: 'D', name: 'Dense / Dilute', alleles: ['D', 'd'], description: 'D = Dense, d = Dilute (Blue, Lilac, Fawn, Cream)' },
  {
    locus: 'O',
    name: 'Red / Orange (X-Linked)',
    alleles: ['O', 'o'],
    inheritanceMode: 'x_linked',
    description: 'X-linked: O = Red/Orange, o = Non-Red. Oo females produce Tortoiseshell / Calico; males carry 1 allele (OY / oY).',
  },
  { locus: 'W', name: 'White / Spotting', alleles: ['W', 'Ws', 'w'], description: 'W = Dominant White, Ws = White Spotting / Bicolor, w = Solid' },
  { locus: 'Ta', name: 'Tabby Pattern', alleles: ['Ta', 'Mc', 'mc'], description: 'Ta = Ticked, Mc = Mackerel, mc = Classic blotched' },
  { locus: 'I', name: 'Inhibitor (Silver / Smoke)', alleles: ['I', 'i'], description: 'I = Silver/Smoke undercoat, i = Non-silver' },
];

function classifyCatPhenotype(loci: Record<string, string>, sex?: BiologicalSex): string {
  const w = loci['W'] || 'w_';
  if (w.startsWith('W') && !w.startsWith('Ws')) return 'Dominant White';
  const c = loci['C'] || 'C_';
  if (c === 'c' || c === 'cc') return 'Albino (Pink-Eyed White)';

  const b = loci['B'] || 'B_';
  const d = loci['D'] || 'D_';
  const a = loci['A'] || 'A_';
  const o = loci['O'] || 'o_';
  const i = loci['I'] || 'i_';

  const isDilute = d === 'dd';
  const hasSilver = i.startsWith('I');
  const hasBicolor = w.startsWith('Ws');
  const pointSuffix =
    c === 'cbcs' || c === 'cscb'
      ? ' Mink'
      : c === 'cscs' || c === 'csc' || c === 'cs_'
      ? ' Point'
      : c === 'cbcb' || c === 'cbc' || c === 'cb_'
      ? ' Sepia'
      : '';

  const baseDark =
    b === 'b1b1'
      ? isDilute
        ? 'Fawn'
        : 'Cinnamon'
      : b.startsWith('b') && b !== 'Bb1' && !b.startsWith('B')
      ? isDilute
        ? 'Lilac'
        : 'Chocolate'
      : isDilute
      ? 'Blue'
      : 'Black';

  const orangeColor = isDilute ? 'Cream' : 'Red / Orange';
  const cleanO = o.replace(/Y/gi, '');
  const isAllOrange = cleanO === 'O' || cleanO === 'OO';
  const isTortie = cleanO === 'Oo' || cleanO === 'oO';

  const sexTag = sex === 'Male' ? 'Male ' : sex === 'Female' ? 'Female ' : '';
  const bicolorTag = hasBicolor ? (isTortie ? ' Calico' : ' & White Bicolor') : '';
  const silverTag = hasSilver ? (a === 'aa' ? ' Smoke' : ' Silver') : '';

  if (isTortie) {
    return `${sexTag}${isDilute ? 'Dilute ' : ''}${hasBicolor ? 'Calico' : 'Tortoiseshell'}${pointSuffix}`;
  }
  if (isAllOrange) {
    return `${sexTag}${orangeColor}${silverTag} Tabby${pointSuffix}${hasBicolor ? ' & White' : ''}`;
  }
  const tabbyTag = a === 'aa' ? '' : ' Tabby';
  return `${sexTag}${baseDark}${silverTag}${tabbyTag}${pointSuffix}${bicolorTag}`;
}

// ─── 3. DOG (K / A / E Epistasis & Double Merle Alert) ─────────────────────────

const DOG_COLOR_LOCI: LocusDefinition[] = [
  { locus: 'A', name: 'Agouti', alleles: ['ay', 'aw', 'at', 'a'], description: 'ay = Sable/Fawn, aw = Wolf Sable, at = Tan Points, a = Recessive Black' },
  { locus: 'K', name: 'Dominant Black / Brindle', alleles: ['KB', 'kbr', 'ky'], description: 'KB = Dominant Black, kbr = Brindle, kyky = Expresses A locus' },
  { locus: 'E', name: 'Extension', alleles: ['Em', 'Eg', 'E', 'e'], description: 'Em = Mask, E = Normal, ee = Recessive Red/Cream (epistatic over K/A)' },
  { locus: 'B', name: 'Black / Liver (Brown)', alleles: ['B', 'b'], description: 'B = Black nose/coat pigment, b = Liver/Chocolate' },
  { locus: 'D', name: 'Dense / Dilute', alleles: ['D', 'd'], description: 'D = Dense, d = Dilute (Blue / Isabella)' },
  { locus: 'M', name: 'Merle', alleles: ['M', 'm'], inheritanceMode: 'incomplete_dominant', description: 'Mm = Merle pattern, MM = Double Merle (deafness/eye risk), mm = Non-merle' },
  { locus: 'S', name: 'White Spotting', alleles: ['S', 'si', 'sp'], description: 'S = Solid, si = Irish Spotting, sp = Piebald' },
  { locus: 'H', name: 'Harlequin (Merle Mod.)', alleles: ['H', 'h'], description: 'Hh on Merle lightens background to white' },
  { locus: 'I', name: 'Phaeomelanin Intensity', alleles: ['I', 'i'], description: 'I = Rich Red/Fawn, ii = Cream/White' },
];

function classifyDogPhenotype(loci: Record<string, string>): string {
  const e = loci['E'] || 'E_';
  const k = loci['K'] || 'kyky';
  const a = loci['A'] || 'at_';
  const b = loci['B'] || 'B_';
  const d = loci['D'] || 'D_';
  const m = loci['M'] || 'mm';
  const s = loci['S'] || 'S_';
  const intensity = loci['I'] || 'I_';

  const isLiver = b === 'bb';
  const isDilute = d === 'dd';
  const whiteNote = s === 'spsp' ? ' Piebald' : s === 'sisi' ? ' (Irish Trim)' : '';
  const merlePrefix = m === 'MM' ? 'Double Merle ' : m.startsWith('M') ? 'Merle ' : '';

  if (e === 'ee') {
    const shade = intensity === 'ii' ? 'Cream' : 'Red / Gold';
    return `${merlePrefix}${shade}${isLiver ? ' (Liver Nose)' : ''}${whiteNote}`;
  }

  const baseColor =
    isLiver && isDilute
      ? 'Isabella / Lilac'
      : isLiver
      ? 'Chocolate / Liver'
      : isDilute
      ? 'Blue'
      : 'Black';

  if (k.startsWith('KB')) return `${merlePrefix}Solid ${baseColor}${whiteNote}`;
  if (k.startsWith('kbr')) return `${merlePrefix}${baseColor} Brindle${whiteNote}`;

  if (a === 'aa') return `${merlePrefix}Recessive ${baseColor}${whiteNote}`;
  if (a === 'at_' || a === 'atat' || a === 'ata') return `${merlePrefix}${baseColor} & Tan Point${whiteNote}`;
  if (a.startsWith('aw')) return `${merlePrefix}${baseColor} Wolf Sable / Agouti${whiteNote}`;
  return `${merlePrefix}${intensity === 'ii' ? 'Cream' : 'Fawn / Red'} Sable${whiteNote}`;
}

// ─── 4. GOAT (Caprine Codominant Agouti Series) ────────────────────────────────

const GOAT_COLOR_LOCI: LocusDefinition[] = [
  {
    locus: 'A',
    name: 'Agouti (Codominant)',
    alleles: ['Awt', 'Ab', 'As', 'At', 'A', 'a'],
    inheritanceMode: 'codominant',
    description: 'Awt = White/Tan, Ab = Badgerface, As = Swiss Markings, At = Black & Tan, A = Bezoar, a = Recessive Black',
  },
  { locus: 'B', name: 'Brown / Black', alleles: ['B', 'b'], description: 'B = Black pigment, b = Chocolate/Brown' },
  { locus: 'E', name: 'Extension', alleles: ['ED', 'E+', 'e'], description: 'ED = Dominant Black, E+ = Wild-type (allows Agouti), e = Recessive Red' },
  { locus: 'Sp', name: 'White Spotting', alleles: ['Sp', 'sp'], description: 'Sp = Spotted / Piebald, sp = Solid' },
  { locus: 'Ms', name: 'Moonspots', alleles: ['Ms', 'ms'], description: 'Ms = Moonspots present, ms = None' },
  { locus: 'Rn', name: 'Roan', alleles: ['Rn', 'rn'], description: 'Rn = Roaning, rn = Solid pigment' },
];

function classifyGoatPhenotype(loci: Record<string, string>): string {
  const e = loci['E'] || 'E+_';
  const a = loci['A'] || 'Awt_';
  const b = loci['B'] || 'B_';
  const sp = loci['Sp'] || 'sp_';
  const ms = loci['Ms'] || 'ms_';
  const rn = loci['Rn'] || 'rn_';

  const modSuffix = [
    ms.startsWith('Ms') ? 'with Moonspots' : '',
    rn.startsWith('Rn') ? 'Roan' : '',
    sp.startsWith('Sp') ? 'Spotted' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const tail = modSuffix ? ` (${modSuffix})` : '';
  const baseDark = b === 'bb' ? 'Chocolate / Brown' : 'Black';

  if (e === 'ee') return `Red / Tan Goat${tail}`;
  if (e.startsWith('ED')) return `Dominant ${baseDark}${tail}`;
  if (a === 'aa') return `Recessive Solid ${baseDark}${tail}`;
  if (a.includes('Awt') && !a.startsWith('a')) return `White / Buckskin Tan${tail}`;
  if (a.includes('Ab') && a.includes('As')) return `Codominant Badgerface + Swiss Markings${tail}`;
  if (a.includes('Ab')) return `Badgerface (${baseDark})${tail}`;
  if (a.includes('As')) return `Swiss Marked / Sundgau (${baseDark})${tail}`;
  if (a.includes('At')) return `${baseDark} & Tan${tail}`;
  return `Wild Bezoar / Chamoisee${tail}`;
}

// ─── 5. SHEEP ──────────────────────────────────────────────────────────────────

const SHEEP_COLOR_LOCI: LocusDefinition[] = [
  { locus: 'A', name: 'Agouti', alleles: ['Awt', 'Ab', 'At', 'Aa'], inheritanceMode: 'codominant', description: 'Awt = White/Tan, Ab = Badgerface, At = Black & Tan / Mouflon, Aa = Self Black' },
  { locus: 'B', name: 'Black / Moorit', alleles: ['B', 'b'], description: 'B = Black pigment, b = Moorit / Brown' },
  { locus: 'E', name: 'Extension', alleles: ['ED', 'E+'], description: 'ED = Dominant Black, E+ = Normal (Agouti expressed)' },
  { locus: 'S', name: 'Spotting', alleles: ['S', 's'], description: 'S = Solid fleece, s = Piebald / Spotted' },
];

function classifySheepPhenotype(loci: Record<string, string>): string {
  const e = loci['E'] || 'E+_';
  const a = loci['A'] || 'Awt_';
  const b = loci['B'] || 'B_';
  const s = loci['S'] || 'S_';
  const base = b === 'bb' ? 'Moorit Brown' : 'Black';
  const spot = s === 'ss' ? ' Piebald / Spotted' : '';

  if (e.startsWith('ED')) return `Dominant ${base}${spot}`;
  if (a.includes('Awt')) return `White / Tan Fleece${spot}`;
  if (a.includes('Ab')) return `Badgerface (${base})${spot}`;
  if (a.includes('At')) return `Mouflon / ${base} & Tan${spot}`;
  return `Solid ${base}${spot}`;
}

// ─── 6. CATTLE ─────────────────────────────────────────────────────────────────

const CATTLE_COLOR_LOCI: LocusDefinition[] = [
  { locus: 'E', name: 'Extension', alleles: ['ED', 'E+', 'e'], description: 'ED = Dominant Black, E+ = Wild/Agouti, e = Recessive Red' },
  { locus: 'D', name: 'Dun Dilution', alleles: ['D', 'd'], inheritanceMode: 'incomplete_dominant', description: 'DD/Dd = Dun/Diluted coat, dd = Non-dilute (wild pigment)' },
  { locus: 'R', name: 'Roan', alleles: ['R', 'r'], inheritanceMode: 'codominant', description: 'RR = White, Rr = Roan (Blue/Red Roan), rr = Solid' },
  { locus: 'S', name: 'Spotting / Belt', alleles: ['SH', 'SB', 'S', 's'], description: 'SH = Hereford Whiteface, SB = Belted, S = Solid, s = Recessive Spotted' },
];

function classifyCattlePhenotype(loci: Record<string, string>): string {
  const e = loci['E'] || 'E_';
  const d = loci['D'] || 'dd';
  const r = loci['R'] || 'rr';
  const s = loci['S'] || 'S_';

  const whiteMark = s.startsWith('SH')
    ? ' Whiteface'
    : s.startsWith('SB')
    ? ' Belted'
    : s === 'ss'
    ? ' Spotted'
    : '';
  const base = e === 'ee' ? 'Red' : e.startsWith('ED') ? 'Black' : 'Wild Red/Brown';
  if (r === 'RR') return `Roan-White${whiteMark}`;
  if (r.startsWith('R')) return `${base} Roan${whiteMark}`;
  if (d.startsWith('D')) return `${base === 'Red' ? 'Yellow / Palomino' : 'Dun'}${whiteMark}`;
  return `${base}${whiteMark}`;
}

// ─── 7. SWINE / PIG ────────────────────────────────────────────────────────────

const SWINE_COLOR_LOCI: LocusDefinition[] = [
  { locus: 'E', name: 'Extension', alleles: ['ED', 'E+', 'ep', 'e'], description: 'ED = Dominant Black, E+ = Wild, ep = Spotted-Red, e = Red (Duroc)' },
  { locus: 'I', name: 'Dominant White', alleles: ['I', 'i'], description: 'I = Dominant White (Yorkshire/Landrace), ii = Colored' },
  { locus: 'Be', name: 'Belt', alleles: ['Be', 'be'], description: 'Be = Hampshire White Belt, bebe = Unbelted' },
  { locus: 'Rn', name: 'Roan', alleles: ['Rn', 'rn'], description: 'Rn = Blue/Red Roan' },
];

function classifySwinePhenotype(loci: Record<string, string>): string {
  const i = loci['I'] || 'ii';
  if (i.startsWith('I')) return 'Dominant White';
  const e = loci['E'] || 'E+_';
  const be = loci['Be'] || 'bebe';
  const rn = loci['Rn'] || 'rnrn';
  const belt = be.startsWith('Be') ? ' Hampshire Belted' : '';
  const roan = rn.startsWith('Rn') ? ' Roan' : '';
  if (e === 'ee') return `Red${belt}${roan}`;
  if (e.startsWith('ep')) return `Black-Spotted Red${belt}${roan}`;
  if (e.startsWith('ED')) return `Black${belt}${roan}`;
  return `Agouti / Wild Pattern${belt}${roan}`;
}

// ─── 8. ALPACA ─────────────────────────────────────────────────────────────────

const ALPACA_COLOR_LOCI: LocusDefinition[] = [
  { locus: 'E', name: 'Extension', alleles: ['E', 'e'], description: 'E = Eumelanin pigment allowed, ee = Light Fawn / White (pheomelanin)' },
  { locus: 'A', name: 'Agouti', alleles: ['A', 'at', 'a'], description: 'A = Bay / Fawn-Brown, at = Black & Tan / Brown, aa = True Black' },
  { locus: 'G', name: 'Grey', alleles: ['G', 'g'], description: 'G = Classic Silver/Rose Grey' },
  { locus: 'S', name: 'Spotting / Tuxedo', alleles: ['S', 's'], description: 's = Appaloosa / Pinto / Tuxedo pattern' },
];

function classifyAlpacaPhenotype(loci: Record<string, string>): string {
  const e = loci['E'] || 'E_';
  const a = loci['A'] || 'A_';
  const g = loci['G'] || 'gg';
  const s = loci['S'] || 'S_';
  const mod = [g.startsWith('G') ? 'Grey' : '', s === 'ss' ? 'Pinto/Appaloosa' : ''].filter(Boolean).join(' ');
  const tail = mod ? ` (${mod})` : '';
  if (e === 'ee') return `White / Light Fawn${tail}`;
  if (a === 'aa') return `True Black${tail}`;
  if (a.startsWith('at')) return `Dark Brown / Bay Black${tail}`;
  return `Medium / Dark Fawn${tail}`;
}

// ─── 9. GUINEA PIG (Cavy) ──────────────────────────────────────────────────────

const GUINEA_PIG_COLOR_LOCI: LocusDefinition[] = [
  { locus: 'A', name: 'Agouti', alleles: ['A', 'ar', 'a'], description: 'A = Agouti, ar = Solid ticked, a = Self' },
  { locus: 'B', name: 'Black / Chocolate', alleles: ['B', 'b'], description: 'B = Black pigment, b = Chocolate' },
  { locus: 'C', name: 'Color / Dilution', alleles: ['C', 'ck', 'cd', 'cr', 'ca'], description: 'C = Full, ck = Dark-dilute, cd = Cream/Buff, cr = Red-eyed Himalayan, ca = Albino (PEW)' },
  { locus: 'E', name: 'Extension', alleles: ['E', 'ep', 'e'], description: 'E = Normal, ep = Tortoiseshell/Brindle, e = Red/Gold/White' },
  { locus: 'P', name: 'Pink-Eyed Dilution', alleles: ['P', 'p'], description: 'P = Dark eye, p = Pink-eye (Lilac, Beige, Saffron)' },
  { locus: 'S', name: 'Dutch / White Spotting', alleles: ['S', 's'], description: 'S = Solid, ss = Dutch / Broken white' },
  { locus: 'Rn', name: 'Roan / Dalmatian', alleles: ['Rn', 'rn'], inheritanceMode: 'incomplete_dominant', description: 'Rn = Roan/Dalmatian (RnRn Lethal White risk!)' },
];

function classifyGuineaPigPhenotype(loci: Record<string, string>): string {
  const c = loci['C'] || 'C_';
  if (c === 'ca' || c === 'caca') return 'Pink-Eyed White (Albino)';
  const a = loci['A'] || 'A_';
  const b = loci['B'] || 'B_';
  const e = loci['E'] || 'E_';
  const p = loci['P'] || 'P_';
  const rn = loci['Rn'] || 'rnrn';
  const s = loci['S'] || 'S_';

  const roan = rn === 'RnRn' ? 'Lethal White (RnRn) ' : rn.startsWith('Rn') ? 'Roan / Dalmatian ' : '';
  const white = s === 'ss' ? ' & White' : '';
  const pinkEye = p === 'pp';

  if (c === 'cr' || c === 'crcr' || c === 'crca' || c === 'cr_') return `${roan}Himalayan / California Pointed${white}`;
  if (e === 'ee') return `${roan}${pinkEye ? 'Saffron / Gold (Pink-Eyed)' : c.startsWith('cd') ? 'Cream' : 'Red / Golden'}${white}`;
  if (e.startsWith('ep')) return `${roan}Tortoiseshell / Brindle${white}`;

  const base =
    b === 'bb'
      ? pinkEye
        ? 'Beige'
        : 'Chocolate'
      : pinkEye
      ? 'Lilac'
      : 'Black';
  if (a === 'aa') return `${roan}Self ${base}${white}`;
  if (a.startsWith('ar')) return `${roan}${base} Solid Ticked Agouti${white}`;
  return `${roan}${base} Agouti${white}`;
}

// ─── 10. CHINCHILLA (Lethal Wh / TO tracking) ─────────────────────────────────

const CHINCHILLA_COLOR_LOCI: LocusDefinition[] = [
  { locus: 'Wh', name: 'Wilson White (Lethal)', alleles: ['Wh', 'wh'], inheritanceMode: 'incomplete_dominant', description: 'Whwh = Wilson White / Mosaic; WhWh = Embryonic Lethal' },
  { locus: 'TO', name: 'Black Velvet / TOV (Lethal)', alleles: ['TO', 'to'], inheritanceMode: 'incomplete_dominant', description: 'TOto = Black Velvet; TOTO = Embryonic Lethal' },
  { locus: 'Bg', name: 'Beige', alleles: ['Bg', 'bg'], inheritanceMode: 'incomplete_dominant', description: 'Bgbg = Hetero Beige, BgBg = Homo Beige' },
  { locus: 'V', name: 'Violet', alleles: ['V', 'v'], description: 'vv = Afro/Deutsch Violet' },
  { locus: 'S', name: 'Sapphire', alleles: ['S', 's'], description: 'ss = Sapphire' },
  { locus: 'Eb', name: 'Ebony / Charcoal', alleles: ['Eb', 'eb'], inheritanceMode: 'incomplete_dominant', description: 'eb = Ebony / Extra Dark Charcoal' },
  { locus: 'Al', name: 'Albino', alleles: ['Al', 'al'], description: 'alal = Recessive Albino' },
];

function classifyChinchillaPhenotype(loci: Record<string, string>): string {
  const wh = loci['Wh'] || 'whwh';
  const to = loci['TO'] || 'toto';
  if (wh === 'WhWh') return 'Embryonic Lethal (WhWh)';
  if (to === 'TOTO') return 'Embryonic Lethal (TOTO)';

  const al = loci['Al'] || 'Al_';
  if (al === 'alal') return 'Pink-Eyed White / Albino';

  const bg = loci['Bg'] || 'bgbg';
  const v = loci['V'] || 'V_';
  const s = loci['S'] || 'S_';
  const eb = loci['Eb'] || 'Eb_';

  const mods: string[] = [];
  if (wh.startsWith('Wh')) mods.push('White');
  if (to.startsWith('TO')) mods.push('Velvet / TOV');
  if (bg === 'BgBg') mods.push('Homozygous Beige');
  else if (bg.startsWith('Bg')) mods.push('Beige');
  if (v === 'vv') mods.push('Violet');
  if (s === 'ss') mods.push('Sapphire');
  if (eb === 'ebeb') mods.push('Ebony');

  return mods.length > 0 ? mods.join(' ') : 'Standard Grey';
}

// ─── 11. FERRET (Waardenburg Blaze/Panda Deafness Tracking) ─────────────────────

const FERRET_COLOR_LOCI: LocusDefinition[] = [
  { locus: 'B', name: 'Sable / Chocolate', alleles: ['B', 'b'], description: 'B = Sable base, bb = Chocolate / Champagne' },
  { locus: 'C', name: 'Albino', alleles: ['C', 'c'], description: 'cc = Albino (Ruby-Eyed White)' },
  { locus: 'Pa', name: 'Panda', alleles: ['Pa', 'pa'], description: 'Pa = Panda head/bib white (Waardenburg deafness risk)' },
  { locus: 'Bl', name: 'Blaze', alleles: ['Bl', 'bl'], description: 'Bl = White head blaze (Waardenburg deafness risk)' },
  { locus: 'Ro', name: 'Roan / Silver', alleles: ['Ro', 'ro'], description: 'Ro = Silver / Roan guard hairs' },
  { locus: 'Mt', name: 'Mitts', alleles: ['Mt', 'mt'], description: 'Mt = White paws / mitts' },
];

function classifyFerretPhenotype(loci: Record<string, string>): string {
  const c = loci['C'] || 'C_';
  if (c === 'cc') return 'Albino (REW)';
  const b = loci['B'] || 'B_';
  const pa = loci['Pa'] || 'papa';
  const bl = loci['Bl'] || 'blbl';
  const ro = loci['Ro'] || 'roro';
  const mt = loci['Mt'] || 'mtmt';

  const base = b === 'bb' ? 'Chocolate / Champagne' : 'Sable';
  const pattern = [
    pa.startsWith('Pa') ? 'Panda' : '',
    bl.startsWith('Bl') ? 'Blaze' : '',
    ro.startsWith('Ro') ? 'Silver / Roan' : '',
    mt.startsWith('Mt') ? 'Mitts' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return pattern ? `${base} (${pattern})` : base;
}

// ─── SPECIES REGISTRY ──────────────────────────────────────────────────────────

export const SPECIES_GENETICS_SPECS: SpeciesGeneticsSpec[] = [
  {
    speciesKey: 'rabbit',
    displayName: 'Rabbit',
    aliases: ['rabbit', 'rabbits', 'oryctolagus'],
    loci: RABBIT_COLOR_LOCI,
    corePhenotypeLoci: ['A', 'B', 'C', 'D', 'E', 'W', 'En', 'V', 'Du'],
    varietyPresets: RABBIT_VARIETY_PRESET_DEFS,
    supportsRufusIntensity: true,
    classifyPhenotype: classifyRabbitPhenotype,
    evaluatePairingAlerts: (byLocus) => {
      const alerts: BreedingGeneticAlert[] = [];
      const en = byLocus.get('En');
      const enEn = en?.outcomes.find((o) => o.genotype === 'EnEn');
      if (enEn && enEn.probabilityPercent > 0) {
        alerts.push({
          severity: 'danger',
          locus: 'En',
          title: `Charlie / Megacolon Risk (${enEn.probabilityPercent}% EnEn)`,
          detail:
            'Crossing two Broken/English carriers (En_) can produce EnEn Charlie kits predisposed to megacolon digestive syndrome.',
        });
      }
      const w = byLocus.get('W');
      if (w && (w.sirePair.includes('_') || w.damPair.includes('_'))) {
        alerts.push({
          severity: 'info',
          locus: 'W',
          title: 'Wide-Band (W/w) Unverified on One or Both Parents',
          detail:
            'Because W_ / __ leaves Wide-Band open, Red crosses may produce non-wideband (W_) or variable undercolor offspring until ww is verified.',
        });
      }
      return alerts;
    },
  },
  {
    speciesKey: 'cat',
    displayName: 'Cat',
    aliases: ['cat', 'cats', 'feline'],
    loci: CAT_COLOR_LOCI,
    corePhenotypeLoci: ['A', 'B', 'C', 'D', 'O', 'W', 'I'],
    varietyPresets: [
      { variety: 'Black / Solid', conservativeGenotype: 'aa B_ C_ D_ oo ww ii' },
      { variety: 'Blue / Russian Blue', conservativeGenotype: 'aa B_ C_ dd oo ww ii' },
      { variety: 'Red Tabby (Male)', conservativeGenotype: 'A_ B_ C_ D_ OY ww ii' },
      { variety: 'Tortoiseshell (Female)', conservativeGenotype: 'A_ B_ C_ D_ Oo ww ii' },
      { variety: 'Siamese Seal Point', conservativeGenotype: 'aa B_ cscs D_ oo ww ii' },
    ],
    classifyPhenotype: classifyCatPhenotype,
    evaluatePairingAlerts: (byLocus) => {
      const alerts: BreedingGeneticAlert[] = [];
      const w = byLocus.get('W');
      if (w && w.outcomes.some((o) => o.genotype.startsWith('W') && !o.genotype.startsWith('Ws'))) {
        alerts.push({
          severity: 'warning',
          locus: 'W',
          title: 'Dominant White (W) Sensory Screening Note',
          detail:
            'Dominant White cats (especially blue-eyed kittens) carry elevated congenital deafness screening needs (BAER testing recommended).',
        });
      }
      return alerts;
    },
  },
  {
    speciesKey: 'dog',
    displayName: 'Dog',
    aliases: ['dog', 'dogs', 'canine'],
    loci: DOG_COLOR_LOCI,
    corePhenotypeLoci: ['A', 'K', 'E', 'B', 'D', 'M', 'S', 'I'],
    varietyPresets: [
      { variety: 'Black & Tan', conservativeGenotype: 'atat kyky E_ B_ D_ mm S_' },
      { variety: 'Recessive Red / Yellow', conservativeGenotype: 'A_ K_ ee B_ D_ mm S_' },
      { variety: 'Blue Merle', conservativeGenotype: 'A_ KB_ E_ B_ D_ Mm S_' },
      { variety: 'Solid Black', conservativeGenotype: 'A_ KB_ E_ B_ D_ mm S_' },
    ],
    classifyPhenotype: classifyDogPhenotype,
    evaluatePairingAlerts: (byLocus) => {
      const alerts: BreedingGeneticAlert[] = [];
      const m = byLocus.get('M');
      const mm = m?.outcomes.find((o) => o.genotype === 'MM');
      if (mm && mm.probabilityPercent > 0) {
        alerts.push({
          severity: 'danger',
          locus: 'M',
          title: `Double Merle Alert (${mm.probabilityPercent}% MM)`,
          detail:
            'Merle × Merle pairings carry a high risk of Double Merle (MM) puppies with congenital deafness and microphthalmia / blindness.',
        });
      }
      return alerts;
    },
  },
  {
    speciesKey: 'goat',
    displayName: 'Goat',
    aliases: ['goat', 'goats', 'caprine'],
    loci: GOAT_COLOR_LOCI,
    corePhenotypeLoci: ['A', 'B', 'E', 'Sp', 'Ms', 'Rn'],
    varietyPresets: [
      { variety: 'Swiss / Oberhasli Markings', conservativeGenotype: 'As_ B_ E+_ spsp' },
      { variety: 'Badgerface / Chamoisee', conservativeGenotype: 'Ab_ B_ E+_ spsp' },
      { variety: 'Solid Black', conservativeGenotype: 'aa B_ E+_ spsp' },
      { variety: 'Gold / Red', conservativeGenotype: 'A_ B_ ee spsp' },
    ],
    classifyPhenotype: classifyGoatPhenotype,
  },
  {
    speciesKey: 'sheep',
    displayName: 'Sheep',
    aliases: ['sheep', 'ovine'],
    loci: SHEEP_COLOR_LOCI,
    corePhenotypeLoci: ['A', 'B', 'E', 'S'],
    varietyPresets: [
      { variety: 'White Wool', conservativeGenotype: 'Awt_ B_ E+_ S_' },
      { variety: 'Black Self', conservativeGenotype: 'AaAa B_ E+_ S_' },
      { variety: 'Moorit Brown', conservativeGenotype: 'AaAa bb E+_ S_' },
      { variety: 'Badgerface', conservativeGenotype: 'Ab_ B_ E+_ S_' },
    ],
    classifyPhenotype: classifySheepPhenotype,
  },
  {
    speciesKey: 'cattle',
    displayName: 'Cattle',
    aliases: ['cattle', 'cow', 'bovine'],
    loci: CATTLE_COLOR_LOCI,
    corePhenotypeLoci: ['E', 'D', 'R', 'S'],
    varietyPresets: [
      { variety: 'Black Angus', conservativeGenotype: 'ED_ dd rr S_' },
      { variety: 'Red', conservativeGenotype: 'ee dd rr S_' },
      { variety: 'Blue Roan', conservativeGenotype: 'ED_ dd Rr S_' },
      { variety: 'Hereford Whiteface', conservativeGenotype: 'ee dd rr SH_' },
    ],
    classifyPhenotype: classifyCattlePhenotype,
  },
  {
    speciesKey: 'swine',
    displayName: 'Swine / Pig',
    aliases: ['swine / pig', 'swine', 'pig', 'pigs', 'porcine'],
    loci: SWINE_COLOR_LOCI,
    corePhenotypeLoci: ['E', 'I', 'Be', 'Rn'],
    varietyPresets: [
      { variety: 'Duroc Red', conservativeGenotype: 'ee ii bebe' },
      { variety: 'Hampshire Belted', conservativeGenotype: 'ED_ ii Be_' },
      { variety: 'Yorkshire White', conservativeGenotype: 'E+_ I_ bebe' },
    ],
    classifyPhenotype: classifySwinePhenotype,
  },
  {
    speciesKey: 'alpaca',
    displayName: 'Alpaca',
    aliases: ['alpaca', 'alpacas'],
    loci: ALPACA_COLOR_LOCI,
    corePhenotypeLoci: ['E', 'A', 'G', 'S'],
    varietyPresets: [
      { variety: 'White / Light Fawn', conservativeGenotype: 'ee A_ gg S_' },
      { variety: 'True Black', conservativeGenotype: 'E_ aa gg S_' },
      { variety: 'Silver / Rose Grey', conservativeGenotype: 'E_ A_ G_ S_' },
    ],
    classifyPhenotype: classifyAlpacaPhenotype,
  },
  {
    speciesKey: 'guinea_pig',
    displayName: 'Guinea Pig',
    aliases: ['guinea pig', 'guinea pigs', 'cavy', 'cavies'],
    loci: GUINEA_PIG_COLOR_LOCI,
    corePhenotypeLoci: ['A', 'B', 'C', 'E', 'P', 'S', 'Rn'],
    varietyPresets: [
      { variety: 'Golden Agouti', conservativeGenotype: 'A_ B_ C_ E_ P_ S_ rnrn' },
      { variety: 'Self Black', conservativeGenotype: 'aa B_ C_ E_ P_ S_ rnrn' },
      { variety: 'Roan / Dalmatian', conservativeGenotype: 'aa B_ C_ E_ P_ S_ Rnrn' },
    ],
    classifyPhenotype: classifyGuineaPigPhenotype,
    evaluatePairingAlerts: (byLocus) => {
      const alerts: BreedingGeneticAlert[] = [];
      const rn = byLocus.get('Rn');
      const rnrn = rn?.outcomes.find((o) => o.genotype === 'RnRn');
      if (rnrn && rnrn.probabilityPercent > 0) {
        alerts.push({
          severity: 'danger',
          locus: 'Rn',
          title: `Lethal White Risk (${rnrn.probabilityPercent}% RnRn)`,
          detail:
            'Roan × Roan or Dalmatian crosses carry a 25%+ risk of Lethal White (RnRn) pups with severe eye/ear/dental defects.',
        });
      }
      return alerts;
    },
  },
  {
    speciesKey: 'chinchilla',
    displayName: 'Chinchilla',
    aliases: ['chinchilla', 'chinchillas'],
    loci: CHINCHILLA_COLOR_LOCI,
    corePhenotypeLoci: ['Wh', 'TO', 'Bg', 'V', 'S', 'Eb', 'Al'],
    varietyPresets: [
      { variety: 'Standard Grey', conservativeGenotype: 'whwh toto bgbg V_ S_ Eb_ Al_' },
      { variety: 'Wilson White', conservativeGenotype: 'Whwh toto bgbg V_ S_ Eb_ Al_' },
      { variety: 'Black Velvet', conservativeGenotype: 'whwh TOto bgbg V_ S_ Eb_ Al_' },
      { variety: 'Afro Violet', conservativeGenotype: 'whwh toto bgbg vv S_ Eb_ Al_' },
    ],
    classifyPhenotype: classifyChinchillaPhenotype,
    evaluatePairingAlerts: (byLocus) => {
      const alerts: BreedingGeneticAlert[] = [];
      const wh = byLocus.get('Wh');
      const whWh = wh?.outcomes.find((o) => o.genotype === 'WhWh');
      if (whWh && whWh.probabilityPercent > 0) {
        alerts.push({
          severity: 'danger',
          locus: 'Wh',
          title: `Wilson White Lethal Factor (${whWh.probabilityPercent}% WhWh)`,
          detail:
            'Wilson White × Wilson White produces ~25% homozygous WhWh embryonic lethal kits (reduced litter size / resorption risk).',
        });
      }
      const to = byLocus.get('TO');
      const toTo = to?.outcomes.find((o) => o.genotype === 'TOTO');
      if (toTo && toTo.probabilityPercent > 0) {
        alerts.push({
          severity: 'danger',
          locus: 'TO',
          title: `Black Velvet / TOV Lethal Factor (${toTo.probabilityPercent}% TOTO)`,
          detail:
            'Velvet × Velvet pairings carry ~25% homozygous TOTO embryonic lethality.',
        });
      }
      return alerts;
    },
  },
  {
    speciesKey: 'ferret',
    displayName: 'Ferret',
    aliases: ['ferret', 'ferrets'],
    loci: FERRET_COLOR_LOCI,
    corePhenotypeLoci: ['B', 'C', 'Pa', 'Bl', 'Ro', 'Mt'],
    varietyPresets: [
      { variety: 'Sable', conservativeGenotype: 'B_ C_ papa blbl roro mtmt' },
      { variety: 'Albino (REW)', conservativeGenotype: 'B_ cc papa blbl roro mtmt' },
      { variety: 'Blaze', conservativeGenotype: 'B_ C_ papa Blbl roro mtmt' },
      { variety: 'Panda', conservativeGenotype: 'B_ C_ Papa blbl roro mtmt' },
    ],
    classifyPhenotype: classifyFerretPhenotype,
    evaluatePairingAlerts: (byLocus) => {
      const alerts: BreedingGeneticAlert[] = [];
      const pa = byLocus.get('Pa');
      const bl = byLocus.get('Bl');
      const paRisk =
        pa &&
        pa.sirePair.toLowerCase().includes('pa') &&
        !pa.sirePair.includes('papa') &&
        pa.damPair.toLowerCase().includes('pa') &&
        !pa.damPair.includes('papa');
      const blRisk =
        bl &&
        bl.sirePair.toLowerCase().includes('bl') &&
        !bl.sirePair.includes('blbl') &&
        bl.damPair.toLowerCase().includes('bl') &&
        !bl.damPair.includes('blbl');
      const crossPatternRisk =
        ((pa && !pa.sirePair.includes('papa')) || (bl && !bl.sirePair.includes('blbl'))) &&
        ((pa && !pa.damPair.includes('papa')) || (bl && !bl.damPair.includes('blbl')));

      if (paRisk || blRisk || crossPatternRisk) {
        alerts.push({
          severity: 'warning',
          title: 'Waardenburg Syndrome / Deafness Risk (Blaze / Panda Cross)',
          detail:
            'Pairing Blaze or Panda patterned ferrets elevates neural-crest Waardenburg deafness risk in kits.',
        });
      }
      return alerts;
    },
  },
];

/**
 * Looks up the coat color genetics ruleset for any species name.
 * Returns `null` for manually created / custom species so Rabbit rules never leak into custom livestock.
 */
export function getGeneticsSpecForSpecies(speciesName?: string): SpeciesGeneticsSpec | null {
  const clean = (speciesName || '').trim().toLowerCase();
  if (!clean) return SPECIES_GENETICS_SPECS[0]; // Default legacy calls without species param to Rabbit
  for (const spec of SPECIES_GENETICS_SPECS) {
    if (spec.speciesKey === clean || spec.aliases.includes(clean)) {
      return spec;
    }
  }
  return null;
}

/**
 * Returns conservative variety presets + optional confirmation prompts for the requested species.
 */
export function getSpeciesVarietyPresets(speciesName?: string): VarietyPresetDefinition[] {
  const spec = getGeneticsSpecForSpecies(speciesName);
  return spec ? spec.varietyPresets : [];
}

/**
 * Resolves a VarietyPresetDefinition with breeder-checked optional locus confirmations
 * (e.g. only replacing Wide-Band `__` with `ww` if the user explicitly confirms `W`).
 */
export function buildPresetGenotypeWithConfirmations(
  preset: VarietyPresetDefinition,
  confirmedLoci: string[],
  speciesName?: string
): string {
  const spec = getGeneticsSpecForSpecies(speciesName);
  if (!spec) return preset.conservativeGenotype;

  const basePairs = parseGenotypeString(preset.conservativeGenotype, spec.displayName);
  const byLocus = new Map<string, GenotypeAllelePair>(basePairs.map((p) => [p.locus, { ...p }]));
  const confirmedSet = new Set(confirmedLoci.map((l) => l.trim().toLowerCase()));

  for (const opt of preset.optionalConfirmations || []) {
    if (!confirmedSet.has(opt.locus.trim().toLowerCase())) continue;
    const parsedOpt = parseGenotypeString(opt.suggestedAlleles, spec.displayName);
    for (const pair of parsedOpt) {
      byLocus.set(pair.locus, pair);
    }
  }

  return formatGenotypeArray(Array.from(byLocus.values()));
}

/**
 * Normalizes an allele pair so any unknown `'_'` slot is always placed second (`allele_`, never `_allele`).
 */
function normalizePairWithSpec(
  locusDef: LocusDefinition | undefined,
  rawA1: string,
  rawA2: string
): { allele1: string; allele2: string } {
  const a1 = (rawA1 || '_').trim() || '_';
  const a2 = (rawA2 || '_').trim() || '_';
  if (a1 === '_' && a2 === '_') return { allele1: '_', allele2: '_' };
  if (a1 === '_') return { allele1: a2, allele2: '_' };
  if (a2 === '_') return { allele1: a1, allele2: '_' };

  if (locusDef?.inheritanceMode === 'x_linked') {
    if (a2 === 'Y') return { allele1: a1, allele2: 'Y' };
    if (a1 === 'Y') return { allele1: a2, allele2: 'Y' };
  }

  if (!locusDef) {
    return a1 <= a2 ? { allele1: a1, allele2: a2 } : { allele1: a2, allele2: a1 };
  }
  const i1 = locusDef.alleles.indexOf(a1);
  const i2 = locusDef.alleles.indexOf(a2);
  if (i1 === -1 || i2 === -1) return { allele1: a1, allele2: a2 };
  return i1 <= i2 ? { allele1: a1, allele2: a2 } : { allele1: a2, allele2: a1 };
}

/**
 * Formats a `GenotypeAllelePair[]` array into a clean shorthand string (e.g., `"A_ B_ C_ D_ ee __"`).
 */
export function formatGenotypeArray(pairs: GenotypeAllelePair[]): string {
  if (!pairs || pairs.length === 0) return '';
  return pairs
    .filter((p) => p.allele1 || p.allele2)
    .map((p) => {
      const a1 = p.allele1 || '_';
      const a2 = p.allele2 || '_';
      if (a1 === '_' && a2 !== '_') return `${a2}_`;
      return `${a1}${a2}`;
    })
    .join(' ');
}

/**
 * Updates a single locus within a shorthand genotype string while preserving canonical species
 * locus ordering and positional `'__'` alignment for preceding blank loci.
 */
export function setLocusInGenotypeString(
  raw: string,
  locusCode: string,
  rawAllele1: string,
  rawAllele2: string,
  speciesName?: string,
  sex?: BiologicalSex
): string {
  const spec = getGeneticsSpecForSpecies(speciesName);
  if (!spec) return (raw || '').trim();

  const locusDef = spec.loci.find((l) => l.locus === locusCode);
  if (!locusDef) return (raw || '').trim();

  const existingPairs = parseGenotypeString(raw, speciesName);
  const byLocus = new Map<string, GenotypeAllelePair>();
  for (const p of existingPairs) {
    byLocus.set(p.locus, { ...p });
  }

  const cleanA1 = (rawAllele1 || '_').trim() || '_';
  const cleanA2 =
    locusDef.inheritanceMode === 'x_linked' && sex === 'Male'
      ? 'Y'
      : (rawAllele2 || '_').trim() || '_';

  const normalized = normalizePairWithSpec(locusDef, cleanA1, cleanA2);
  const isUnsetXMale =
    locusDef.inheritanceMode === 'x_linked' &&
    normalized.allele2 === 'Y' &&
    normalized.allele1 === '_';
  const isUnsetPair = normalized.allele1 === '_' && normalized.allele2 === '_';

  if (isUnsetPair || isUnsetXMale) {
    byLocus.delete(locusCode);
  } else {
    byLocus.set(locusCode, {
      locus: locusCode,
      allele1: normalized.allele1,
      allele2: normalized.allele2,
    });
  }

  let lastActiveIdx = -1;
  spec.loci.forEach((def, idx) => {
    const pair = byLocus.get(def.locus);
    if (pair && (pair.allele1 !== '_' || (pair.allele2 !== '_' && pair.allele2 !== 'Y'))) {
      lastActiveIdx = idx;
    }
  });

  if (lastActiveIdx === -1) return '';

  const ordered: GenotypeAllelePair[] = [];
  for (let i = 0; i <= lastActiveIdx; i++) {
    const def = spec.loci[i];
    const existing = byLocus.get(def.locus);
    if (existing) {
      ordered.push(existing);
    } else {
      ordered.push({
        locus: def.locus,
        allele1: '_',
        allele2: def.inheritanceMode === 'x_linked' && sex === 'Male' ? 'Y' : '_',
      });
    }
  }

  return formatGenotypeArray(ordered);
}

/**
 * Parses a shorthand genotype string into structured `GenotypeAllelePair[]` for the given species.
 * Returns `[]` when `speciesName` is a custom/unrecognized species (zero Rabbit cross-bleed).
 */
export function parseGenotypeString(raw: string, speciesName?: string): GenotypeAllelePair[] {
  const clean = (raw || '').trim();
  if (!clean) return [];

  const spec = getGeneticsSpecForSpecies(speciesName);
  if (!spec) return [];

  const tokens = clean.split(/\s+/);
  const result: GenotypeAllelePair[] = [];

  const knownTokens = spec.loci.map((l) => ({
    def: l,
    locus: l.locus,
    alleles: [...l.alleles].sort((a, b) => b.length - a.length),
  }));

  tokens.forEach((token, index) => {
    let matched = false;

    if (token === '__' || token === '_') {
      const positional = knownTokens[index];
      result.push({
        locus: positional ? positional.locus : `L${index + 1}`,
        allele1: '_',
        allele2: '_',
      });
      return;
    }

    const positionalEntry = knownTokens[index];
    const searchOrder = positionalEntry
      ? [positionalEntry, ...knownTokens.filter((_, i) => i !== index)]
      : knownTokens;

    // Special handling for single-allele or hemizygous Y tokens on X-linked loci (e.g. Cat `O`, `OY`, `oY`, `o-`)
    for (const entry of searchOrder) {
      if (entry.def.inheritanceMode === 'x_linked') {
        for (const a1 of [...entry.alleles, '_']) {
          if (token === a1 || token === `${a1}Y` || token === `${a1}-`) {
            result.push({
              locus: entry.locus,
              allele1: a1,
              allele2: 'Y',
            });
            matched = true;
            break;
          }
        }
        if (matched) break;
      }

      const validSingles = [...entry.alleles, '_'];
      for (const a1 of validSingles) {
        if (token.startsWith(a1)) {
          const rest = token.slice(a1.length);
          if (validSingles.includes(rest)) {
            const norm = normalizePairWithSpec(entry.def, a1, rest);
            result.push({ locus: entry.locus, allele1: norm.allele1, allele2: norm.allele2 });
            matched = true;
            break;
          }
        }
      }
      if (matched) break;
    }

    if (!matched && token.length >= 2) {
      const half = Math.ceil(token.length / 2);
      const norm = normalizePairWithSpec(undefined, token.slice(0, half), token.slice(half) || '_');
      result.push({
        locus: `L${index + 1}`,
        allele1: norm.allele1,
        allele2: norm.allele2,
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

function getAnimalPairsForSpecies(animal: Animal, speciesName: string): GenotypeAllelePair[] {
  if (animal.genotype && animal.genotype.length > 0 && !animal.genotypeRaw) {
    return animal.genotype;
  }
  const parsedFromRaw = parseGenotypeString(animal.genotypeRaw, speciesName);
  if (parsedFromRaw.length > 0) return parsedFromRaw;
  return animal.genotype ?? [];
}

/**
 * Infers hidden alleles on a subject animal using its parents AND its recorded offspring.
 * - Supports homozygous dominant AND homozygous recessive parental inference (and catches conflicts)
 * - Normalizes partial slots to `allele_` (never `_allele`)
 * - Expands offspring inference across intermediate recessive alleles (e.g. `atat`, `chdchd`, `cbcb`)
 */
export function inferHiddenAlleles(
  subject: Animal,
  herdById: Map<string, Animal>,
  allSpeciesAnimals: Animal[],
  speciesName?: string
): GenotypeInferenceResult {
  const effectiveSpecies = speciesName || subject.species || 'Rabbit';
  const spec = getGeneticsSpecForSpecies(effectiveSpecies);
  if (!spec) {
    return {
      updatedPairs: [],
      formatted: subject.genotypeRaw || '',
      notes: [],
      conflicts: [],
    };
  }

  const basePairs = getAnimalPairsForSpecies(subject, effectiveSpecies);
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

  for (const locusDef of spec.loci) {
    const current = byLocus.get(locusDef.locus);
    if (!current) continue;

    // Normalize initial ordering so `'_'` is always allele2
    const initNorm = normalizePairWithSpec(locusDef, current.allele1, current.allele2);
    current.allele1 = initNorm.allele1;
    current.allele2 = initNorm.allele2;

    if (locusDef.inheritanceMode === 'x_linked') {
      // X-linked inference:
      // 1) Male XY gets his single X allele from Dam; Female XX gets Sire's single X allele
      if (subject.sex === 'Male' && dam) {
        const damPairs = getAnimalPairsForSpecies(dam, effectiveSpecies);
        const damLocus = damPairs.find((x) => x.locus === locusDef.locus);
        if (damLocus && damLocus.allele1 !== '_' && damLocus.allele1 === damLocus.allele2) {
          const dAllele = damLocus.allele1;
          if (current.allele1 === '_') {
            const before = `${current.allele1}${current.allele2}`;
            current.allele1 = dAllele;
            notes.push({
              locus: locusDef.locus,
              before,
              after: `${current.allele1}${current.allele2}`,
              reason: `Dam (${dam.name}) is homozygous ${dAllele}${dAllele} and must pass '${dAllele}' to male offspring.`,
            });
          } else if (current.allele1 !== dAllele) {
            conflicts.push(
              `${locusDef.name} (${locusDef.locus}): Dam ${dam.name} is ${dAllele}${dAllele}, conflicting with male ${subject.name}'s recorded ${current.allele1}Y.`
            );
          }
        }
      } else if (subject.sex === 'Female' && sire) {
        const sirePairs = getAnimalPairsForSpecies(sire, effectiveSpecies);
        const sireLocus = sirePairs.find((x) => x.locus === locusDef.locus);
        if (sireLocus && sireLocus.allele1 !== '_') {
          const sAllele = sireLocus.allele1;
          const hasAllele = current.allele1 === sAllele || current.allele2 === sAllele;
          if ((current.allele1 === '_' || current.allele2 === '_') && !hasAllele) {
            const before = `${current.allele1}${current.allele2}`;
            const filled = normalizePairWithSpec(
              locusDef,
              current.allele1 === '_' ? sAllele : current.allele1,
              current.allele2 === '_' ? sAllele : current.allele2
            );
            current.allele1 = filled.allele1;
            current.allele2 = filled.allele2;
            notes.push({
              locus: locusDef.locus,
              before,
              after: `${current.allele1}${current.allele2}`,
              reason: `Sire (${sire.name}) is ${sAllele}Y and must pass '${sAllele}' to female offspring.`,
            });
          } else if (current.allele1 !== '_' && current.allele2 !== '_' && !hasAllele) {
            conflicts.push(
              `${locusDef.name} (${locusDef.locus}): Sire ${sire.name} is ${sAllele}Y, conflicting with female ${subject.name}'s recorded ${current.allele1}${current.allele2}.`
            );
          }
        }
      }

      // 2) Dam gets proven X-linked allele from any recorded Male offspring (kY -> Dam carries k)
      if (subject.sex === 'Female') {
        for (const kit of offspring) {
          if (kit.sex !== 'Male') continue;
          const kLocus = getAnimalPairsForSpecies(kit, effectiveSpecies).find(
            (x) => x.locus === locusDef.locus
          );
          if (!kLocus || kLocus.allele1 === '_') continue;
          const sonAllele = kLocus.allele1;
          const hasAllele = current.allele1 === sonAllele || current.allele2 === sonAllele;
          if ((current.allele1 === '_' || current.allele2 === '_') && !hasAllele) {
            const before = `${current.allele1}${current.allele2}`;
            const filled = normalizePairWithSpec(
              locusDef,
              current.allele1 === '_' ? sonAllele : current.allele1,
              current.allele2 === '_' ? sonAllele : current.allele2
            );
            current.allele1 = filled.allele1;
            current.allele2 = filled.allele2;
            notes.push({
              locus: locusDef.locus,
              before,
              after: `${current.allele1}${current.allele2}`,
              reason: `Son ${kit.name} expresses ${sonAllele}Y, proving Dam ${subject.name} carries '${sonAllele}'.`,
            });
          } else if (current.allele1 !== '_' && current.allele2 !== '_' && !hasAllele) {
            conflicts.push(
              `${locusDef.name} (${locusDef.locus}): Son ${kit.name} is ${sonAllele}Y, impossible if Dam ${subject.name} is ${current.allele1}${current.allele2}.`
            );
          }
        }
      }
      continue;
    }

    const sireLocus = sire
      ? getAnimalPairsForSpecies(sire, effectiveSpecies).find((x) => x.locus === locusDef.locus)
      : undefined;
    const damLocus = dam
      ? getAnimalPairsForSpecies(dam, effectiveSpecies).find((x) => x.locus === locusDef.locus)
      : undefined;

    // 1A. Dual homozygous parent guarantee (e.g., AA × AA on subject A_ -> AA)
    if (
      sireLocus &&
      damLocus &&
      sireLocus.allele1 !== '_' &&
      sireLocus.allele1 === sireLocus.allele2 &&
      damLocus.allele1 !== '_' &&
      damLocus.allele1 === damLocus.allele2
    ) {
      const sAllele = sireLocus.allele1;
      const dAllele = damLocus.allele1;
      const expected = normalizePairWithSpec(locusDef, sAllele, dAllele);
      if (current.allele1 === '_' || current.allele2 === '_') {
        if (
          current.allele1 === '_' ||
          current.allele1 === expected.allele1 ||
          current.allele1 === expected.allele2
        ) {
          const before = `${current.allele1}${current.allele2}`;
          current.allele1 = expected.allele1;
          current.allele2 = expected.allele2;
          notes.push({
            locus: locusDef.locus,
            before,
            after: `${current.allele1}${current.allele2}`,
            reason: `Sire (${sire!.name}, ${sAllele}${sAllele}) and Dam (${dam!.name}, ${dAllele}${dAllele}) uniquely determine ${expected.allele1}${expected.allele2}.`,
          });
        }
      }
    }

    // 1B. Single Homozygous Parent Inference & Conflict Check (works for AA, cc, chdchd, atat, ww, DD, etc.)
    for (const [parentLabel, parent, pLocus] of [
      ['Sire', sire, sireLocus],
      ['Dam', dam, damLocus],
    ] as const) {
      if (!parent || !pLocus) continue;
      if (pLocus.allele1 === '_' || pLocus.allele1 !== pLocus.allele2) continue;

      const passedAllele = pLocus.allele1;
      const hasAlleleAlready =
        current.allele1 === passedAllele || current.allele2 === passedAllele;

      if ((current.allele1 === '_' || current.allele2 === '_') && !hasAlleleAlready) {
        const before = `${current.allele1}${current.allele2}`;
        const filled = normalizePairWithSpec(
          locusDef,
          current.allele1 === '_' ? passedAllele : current.allele1,
          current.allele2 === '_' ? passedAllele : current.allele2
        );
        current.allele1 = filled.allele1;
        current.allele2 = filled.allele2;
        notes.push({
          locus: locusDef.locus,
          before,
          after: `${current.allele1}${current.allele2}`,
          reason: `${parentLabel} (${parent.name}) is homozygous ${passedAllele}${passedAllele} and must pass '${passedAllele}'.`,
        });
      } else if (
        current.allele1 !== '_' &&
        current.allele2 !== '_' &&
        !hasAlleleAlready
      ) {
        conflicts.push(
          `${locusDef.name} (${locusDef.locus}): ${parentLabel} ${parent.name} is ${passedAllele}${passedAllele}, which conflicts with ${subject.name}'s recorded ${current.allele1}${current.allele2}.`
        );
      }
    }

    // 2. Offspring-to-Subject Inference: ANY homozygous non-top-dominant offspring (k/k, including intermediates like `atat` or `chdchd`)
    // proves BOTH parents carry at least one copy of `k`.
    const topDominant = locusDef.alleles[0];
    for (const kit of offspring) {
      const kLocus = getAnimalPairsForSpecies(kit, effectiveSpecies).find(
        (x) => x.locus === locusDef.locus
      );
      if (!kLocus) continue;

      if (
        kLocus.allele1 !== '_' &&
        kLocus.allele1 === kLocus.allele2 &&
        kLocus.allele1 !== topDominant
      ) {
        const homAllele = kLocus.allele1;
        const subjectHasAllele = current.allele1 === homAllele || current.allele2 === homAllele;

        if ((current.allele1 === '_' || current.allele2 === '_') && !subjectHasAllele) {
          const before = `${current.allele1}${current.allele2}`;
          const filled = normalizePairWithSpec(
            locusDef,
            current.allele1 === '_' ? homAllele : current.allele1,
            current.allele2 === '_' ? homAllele : current.allele2
          );
          current.allele1 = filled.allele1;
          current.allele2 = filled.allele2;
          notes.push({
            locus: locusDef.locus,
            before,
            after: `${current.allele1}${current.allele2}`,
            reason: `Offspring ${kit.name} expresses ${homAllele}${homAllele}, proving ${subject.name} carries '${homAllele}'.`,
          });
        } else if (
          current.allele1 !== '_' &&
          current.allele2 !== '_' &&
          !subjectHasAllele
        ) {
          conflicts.push(
            `${locusDef.name} (${locusDef.locus}): Offspring ${kit.name} is ${homAllele}${homAllele}, impossible if ${subject.name} is ${current.allele1}${current.allele2}.`
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

export interface LocusOutcomeEntry {
  genotype: string;
  probabilityPercent: number;
  hasUnknownCarrier: boolean;
  displayLabel?: string;
}

export interface LocusPunnettOutcome {
  locus: string;
  locusName: string;
  inheritanceMode?: InheritanceMode;
  sirePair: string;
  damPair: string;
  outcomes: LocusOutcomeEntry[];
  sexSplitOutcomes?: {
    male: LocusOutcomeEntry[];
    female: LocusOutcomeEntry[];
  };
  uncertaintyNote?: string;
}

export interface PredictedPhenotypeRow {
  label: string;
  genotypeSummary: string;
  probabilityPercent: number;
  hasUnknownCarrier?: boolean;
  sexGroup?: 'Male' | 'Female';
}

export interface PunnettSimulationSummary {
  speciesName: string;
  isCustomSpeciesFallback: boolean;
  sireRaw?: string;
  damRaw?: string;
  locusBreakdowns: LocusPunnettOutcome[];
  predictedPhenotypes: PredictedPhenotypeRow[];
  hasUnknownAlleles: boolean;
  uncertainLociNotes: string[];
  lethalOrHealthAlerts: BreedingGeneticAlert[];
}

function formatOutcomeDisplay(locusDef: LocusDefinition | undefined, genotype: string): string {
  if (!genotype.includes('_')) return genotype;
  if (genotype === '__') return 'Unverified (unknown at both slots)';
  const a1 = genotype.replace(/_/g, '');
  if (!locusDef) return `${genotype} (unverified carrier slot)`;
  const otherPossibilities = locusDef.alleles.filter((a) => a !== a1).slice(0, 3).join('/');
  return `${genotype} (known ${a1}; could be ${otherPossibilities || 'recessive'} carrier)`;
}

function orderPairString(locusDef: LocusDefinition | undefined, a1: string, a2: string): string {
  const norm = normalizePairWithSpec(locusDef, a1, a2);
  return `${norm.allele1}${norm.allele2}`;
}

/**
 * Simulates a Sire × Dam test-breeding across shared coat-color loci for the active species.
 * - Custom species (`getGeneticsSpecForSpecies(sp) === null`) isolate safely to raw side-by-side notes.
 * - Unknown `_` slots never fabricate homozygous blank `__` certainty in UI summaries.
 * - X-linked loci (`Cat O/o`) compute sex-stratified Male (`XY`) vs Female (`XX`) probabilities.
 */
export function simulatePairingGenetics(
  sire: Animal,
  dam: Animal,
  speciesName?: string
): PunnettSimulationSummary {
  const effectiveSpecies = speciesName || sire.species || dam.species || 'Rabbit';
  const spec = getGeneticsSpecForSpecies(effectiveSpecies);

  if (!spec) {
    return {
      speciesName: effectiveSpecies,
      isCustomSpeciesFallback: true,
      sireRaw: sire.genotypeRaw || '',
      damRaw: dam.genotypeRaw || '',
      locusBreakdowns: [],
      predictedPhenotypes: [],
      hasUnknownAlleles: false,
      uncertainLociNotes: [],
      lethalOrHealthAlerts: [],
    };
  }

  const sirePairs = getAnimalPairsForSpecies(sire, effectiveSpecies);
  const damPairs = getAnimalPairsForSpecies(dam, effectiveSpecies);

  const sireMap = new Map(sirePairs.map((p) => [p.locus, p]));
  const damMap = new Map(damPairs.map((p) => [p.locus, p]));

  const allLoci = Array.from(new Set([...sireMap.keys(), ...damMap.keys()]));
  const locusBreakdowns: LocusPunnettOutcome[] = [];
  const uncertainLociNotes: string[] = [];
  let hasUnknownAlleles = false;

  for (const locus of allLoci) {
    const s = sireMap.get(locus);
    const d = damMap.get(locus);
    const locusDef = spec.loci.find((l) => l.locus === locus);
    if (!s || !d) {
      if (sirePairs.length > 0 && damPairs.length > 0) {
        hasUnknownAlleles = true;
        uncertainLociNotes.push(
          `${locusDef?.name ?? `Locus ${locus}`} (${locus}): Recorded on ${s ? sire.name : dam.name} only — enter ${locus} on ${s ? dam.name : sire.name} to simulate this locus.`
        );
      }
      continue;
    }

    if (locusDef?.inheritanceMode === 'x_linked') {
      const sX = s.allele1 || '_';
      const dGametes = [d.allele1 || '_', d.allele2 || '_'];
      if (sX === '_' || dGametes.includes('_')) {
        hasUnknownAlleles = true;
        uncertainLociNotes.push(
          `${locusDef.name} (${locus}): Unverified X-linked slot ('_') leaves sex-linked percentages tentative.`
        );
      }

      const maleTally = new Map<string, number>();
      const femaleTally = new Map<string, number>();

      for (const dg of dGametes) {
        const mGeno = `${dg}Y`;
        maleTally.set(mGeno, (maleTally.get(mGeno) ?? 0) + 50);

        const fGeno = orderPairString(locusDef, sX, dg);
        femaleTally.set(fGeno, (femaleTally.get(fGeno) ?? 0) + 50);
      }

      const toOutcomeList = (tally: Map<string, number>, scaleOverall: number): LocusOutcomeEntry[] =>
        Array.from(tally.entries())
          .map(([genotype, pct]) => ({
            genotype,
            probabilityPercent: Math.round(pct * scaleOverall * 10) / 10,
            hasUnknownCarrier: genotype.includes('_'),
            displayLabel: genotype.includes('_') ? formatOutcomeDisplay(locusDef, genotype) : undefined,
          }))
          .sort((a, b) => b.probabilityPercent - a.probabilityPercent);

      const maleOutcomes = toOutcomeList(maleTally, 1);
      const femaleOutcomes = toOutcomeList(femaleTally, 1);

      const overallMap = new Map<string, number>();
      for (const m of maleOutcomes) {
        overallMap.set(m.genotype, (overallMap.get(m.genotype) ?? 0) + m.probabilityPercent * 0.5);
      }
      for (const f of femaleOutcomes) {
        overallMap.set(f.genotype, (overallMap.get(f.genotype) ?? 0) + f.probabilityPercent * 0.5);
      }
      const combinedOutcomes = toOutcomeList(overallMap, 1);

      locusBreakdowns.push({
        locus,
        locusName: locusDef.name,
        inheritanceMode: 'x_linked',
        sirePair: `${sX}Y`,
        damPair: `${d.allele1 || '_'}${d.allele2 || '_'}`,
        outcomes: combinedOutcomes,
        sexSplitOutcomes: {
          male: maleOutcomes,
          female: femaleOutcomes,
        },
        uncertaintyNote:
          sX === '_' || dGametes.includes('_')
            ? 'Contains unverified allele slot (_); split male/female odds are provisional.'
            : undefined,
      });
      continue;
    }

    const sGametes = [s.allele1 || '_', s.allele2 || '_'];
    const dGametes = [d.allele1 || '_', d.allele2 || '_'];
    const hasBlank = sGametes.includes('_') || dGametes.includes('_');
    if (hasBlank) {
      hasUnknownAlleles = true;
      uncertainLociNotes.push(
        `${locusDef?.name ?? `Locus ${locus}`} (${locus}): Contains unverified allele slot ('_') — carrier outcomes cannot confirm homozygosity.`
      );
    }

    const tally = new Map<string, number>();
    for (const sg of sGametes) {
      for (const dg of dGametes) {
        const combo = orderPairString(locusDef, sg, dg);
        tally.set(combo, (tally.get(combo) ?? 0) + 25);
      }
    }

    const outcomes: LocusOutcomeEntry[] = Array.from(tally.entries())
      .map(([genotype, probabilityPercent]) => ({
        genotype,
        probabilityPercent,
        hasUnknownCarrier: genotype.includes('_'),
        displayLabel: genotype.includes('_')
          ? formatOutcomeDisplay(locusDef, genotype)
          : undefined,
      }))
      .sort((a, b) => b.probabilityPercent - a.probabilityPercent);

    locusBreakdowns.push({
      locus,
      locusName: locusDef?.name ?? `Locus ${locus}`,
      inheritanceMode: locusDef?.inheritanceMode ?? 'autosomal',
      sirePair: orderPairString(locusDef, s.allele1, s.allele2),
      damPair: orderPairString(locusDef, d.allele1, d.allele2),
      outcomes,
      uncertaintyNote: hasBlank
        ? 'Unverified slot (_) included: dashed outcomes indicate unconfirmed second-allele possibilities.'
        : undefined,
    });
  }

  const breakdownsByLocus = new Map(locusBreakdowns.map((b) => [b.locus, b]));
  const lethalOrHealthAlerts = spec.evaluatePairingAlerts
    ? spec.evaluatePairingAlerts(breakdownsByLocus, sire, dam)
    : [];

  // Compute combined top phenotype predictions across core phenotype loci
  const coreLoci = spec.corePhenotypeLoci;
  const activeBreakdowns = locusBreakdowns.filter((b) => coreLoci.includes(b.locus));

  if (activeBreakdowns.length === 0) {
    return {
      speciesName: spec.displayName,
      isCustomSpeciesFallback: false,
      locusBreakdowns,
      predictedPhenotypes: [],
      hasUnknownAlleles,
      uncertainLociNotes,
      lethalOrHealthAlerts,
    };
  }

  const hasXLinkedActive = activeBreakdowns.some((b) => b.inheritanceMode === 'x_linked');

  type ComboAcc = { map: Record<string, string>; prob: number; hasUncertain: boolean };

  const computePhenotypesForSex = (targetSex?: BiologicalSex): PredictedPhenotypeRow[] => {
    let combinations: ComboAcc[] = [{ map: {}, prob: 1, hasUncertain: false }];

    for (const b of activeBreakdowns) {
      const outcomesForRun =
        b.inheritanceMode === 'x_linked' && b.sexSplitOutcomes
          ? targetSex === 'Male'
            ? b.sexSplitOutcomes.male
            : targetSex === 'Female'
            ? b.sexSplitOutcomes.female
            : b.outcomes
          : b.outcomes;

      const next: ComboAcc[] = [];
      for (const existing of combinations) {
        for (const out of outcomesForRun) {
          next.push({
            map: { ...existing.map, [b.locus]: out.genotype },
            prob: existing.prob * (out.probabilityPercent / 100),
            hasUncertain: existing.hasUncertain || out.hasUnknownCarrier,
          });
        }
      }
      combinations = next;
    }

    const phenotypeMap = new Map<
      string,
      { prob: number; sampleGenotype: string; hasUnknownCarrier: boolean }
    >();

    for (const c of combinations) {
      const label = spec.classifyPhenotype(c.map, targetSex);
      const genoStr = coreLoci
        .filter((l) => c.map[l])
        .map((l) => c.map[l])
        .join(' ');
      const prev = phenotypeMap.get(label);
      if (prev) {
        prev.prob += c.prob;
        prev.hasUnknownCarrier = prev.hasUnknownCarrier || c.hasUncertain;
      } else {
        phenotypeMap.set(label, {
          prob: c.prob,
          sampleGenotype: genoStr,
          hasUnknownCarrier: c.hasUncertain,
        });
      }
    }

    const scale = hasXLinkedActive && targetSex ? 0.5 : 1;
    return Array.from(phenotypeMap.entries()).map(([label, info]) => ({
      label,
      genotypeSummary: info.sampleGenotype,
      probabilityPercent: Math.round(info.prob * scale * 1000) / 10,
      hasUnknownCarrier: info.hasUnknownCarrier,
      sexGroup: targetSex === 'Male' || targetSex === 'Female' ? targetSex : undefined,
    }));
  };

  let predictedPhenotypes: PredictedPhenotypeRow[] = [];
  if (hasXLinkedActive) {
    predictedPhenotypes = [
      ...computePhenotypesForSex('Female'),
      ...computePhenotypesForSex('Male'),
    ]
      .sort((a, b) => b.probabilityPercent - a.probabilityPercent)
      .slice(0, 8);
  } else {
    predictedPhenotypes = computePhenotypesForSex(undefined)
      .sort((a, b) => b.probabilityPercent - a.probabilityPercent)
      .slice(0, 6);
  }

  return {
    speciesName: spec.displayName,
    isCustomSpeciesFallback: false,
    locusBreakdowns,
    predictedPhenotypes,
    hasUnknownAlleles,
    uncertainLociNotes,
    lethalOrHealthAlerts,
  };
}
