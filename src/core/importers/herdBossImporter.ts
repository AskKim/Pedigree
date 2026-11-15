/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * HerdBoss Two-Zip / Multi-Archive Importer (`src/core/importers/herdBossImporter.ts`).
 *
 * Unpacks 1, 2, or more HerdBoss `.zip` (or `.csv`/`.json`) export files simultaneously into a
 * unified workspace, resolves cross-archive Animal / Pedigree / Breeding / Weight / Treatment /
 * Group relationships, auto-creates missing custom `SpeciesProfile` schedules, skips binary
 * photos per Phase 1 guardrails, and generates a privacy-safe QA column diagnostic report.
 */

import { parseGenotypeString } from '../geneticsEngine';
import {
  addDaysIso,
  Animal,
  AnimalStatus,
  BarnDatabaseSnapshot,
  BarnTask,
  BiologicalSex,
  BreedingRecord,
  BreedingStatus,
  CageLocation,
  CareLog,
  CareLogType,
  isSameSpecies,
  nowIsoUtc,
  PREDEFINED_SPECIES_PRESETS,
  resolveSpeciesProfile,
  ShowEvent,
  SpeciesProfile,
  todayDateIso,
} from '../models';
import {
  extractVirtualEntries,
  normalizeColumnKey,
  normalizeFlexibleDateIso,
  parseDelimitedTable,
  parseFlexibleWeightToGrams,
} from './archiveAndCsvUtils';
import {
  AnimalImportConflict,
  buildAnimalContradictions,
  findPreexistingAnimalMatch,
  PreexistingAnimalMatch,
} from './conflictResolver';
import {
  CustomSpeciesImportOverride,
  DetectedTableDiagnostic,
  ImportedTableClassification,
  ImporterRunOptions,
  PlatformImporter,
  PlatformImportPreview,
  RawArchiveInput,
  StagedImportedPhoto,
  VirtualArchiveEntry,
} from './importerTypes';

interface NormalizedTable {
  archiveName: string;
  entryPath: string;
  baseName: string;
  headers: string[];
  normHeaderMap: Map<string, string>; // normalizedKey -> actualHeader
  rows: Array<Record<string, string>>;
}

interface PendingLineageRef {
  animalId: string;
  species: string;
  breed: string;
  sireRef: string;
  damRef: string;
  paternalGrandsireRef: string;
  paternalGranddamRef: string;
  maternalGrandsireRef: string;
  maternalGranddamRef: string;
}

const SPECIES_SYNONYMS: Record<string, string> = {
  rabbit: 'Rabbit',
  rabbits: 'Rabbit',
  goat: 'Goat',
  goats: 'Goat',
  caprine: 'Goat',
  sheep: 'Sheep',
  ovine: 'Sheep',
  lamb: 'Sheep',
  lambs: 'Sheep',
  cattle: 'Cattle',
  cow: 'Cattle',
  cows: 'Cattle',
  bovine: 'Cattle',
  beef: 'Cattle',
  dairy: 'Cattle',
  pig: 'Swine / Pig',
  pigs: 'Swine / Pig',
  swine: 'Swine / Pig',
  hog: 'Swine / Pig',
  hogs: 'Swine / Pig',
  porcine: 'Swine / Pig',
  guineapig: 'Guinea Pig',
  guineapigs: 'Guinea Pig',
  cavy: 'Guinea Pig',
  cavies: 'Guinea Pig',
  chinchilla: 'Chinchilla',
  chinchillas: 'Chinchilla',
  ferret: 'Ferret',
  ferrets: 'Ferret',
  alpaca: 'Alpaca',
  alpacas: 'Alpaca',
  llama: 'Llama',
  llamas: 'Llama',
  dog: 'Dog',
  dogs: 'Dog',
  canine: 'Dog',
  horse: 'Horse',
  horses: 'Horse',
  equine: 'Horse',
  donkey: 'Donkey',
  donkeys: 'Donkey',
  chicken: 'Chicken',
  chickens: 'Chicken',
  poultry: 'Chicken',
  duck: 'Duck',
  ducks: 'Duck',
  waterfowl: 'Duck',
  goose: 'Goose',
  geese: 'Goose',
  turkey: 'Turkey',
  turkeys: 'Turkey',
  quail: 'Quail',
  quails: 'Quail',
  yak: 'Yak',
  yaks: 'Yak',
  bison: 'Bison',
  buffalo: 'Water Buffalo',
  waterbuffalo: 'Water Buffalo',
  deer: 'Deer',
  cervid: 'Deer',
  elk: 'Elk',
  camel: 'Camel',
  camels: 'Camel',
  cat: 'Cat',
  cats: 'Cat',
  feline: 'Cat',
  hedgehog: 'Hedgehog',
  hedgehogs: 'Hedgehog',
  emu: 'Emu',
  emus: 'Emu',
};

const CUSTOM_SPECIES_DEFAULTS: Record<
  string,
  {
    gestationDays: number;
    weanDays: number;
    rebreedDays: number;
    birthLabel: string;
    maleLabel: string;
    femaleLabel: string;
    offspringLabel: string;
  }
> = {
  Dog: {
    gestationDays: 63,
    weanDays: 56,
    rebreedDays: 180,
    birthLabel: 'Whelping',
    maleLabel: 'Sire / Dog',
    femaleLabel: 'Dam / Bitch',
    offspringLabel: 'Puppy',
  },
  Cat: {
    gestationDays: 65,
    weanDays: 56,
    rebreedDays: 120,
    birthLabel: 'Queening',
    maleLabel: 'Tom / Sire',
    femaleLabel: 'Queen / Dam',
    offspringLabel: 'Kitten',
  },
  Horse: {
    gestationDays: 340,
    weanDays: 150,
    rebreedDays: 30,
    birthLabel: 'Foaling',
    maleLabel: 'Stallion',
    femaleLabel: 'Mare',
    offspringLabel: 'Foal',
  },
  Donkey: {
    gestationDays: 365,
    weanDays: 150,
    rebreedDays: 45,
    birthLabel: 'Foaling',
    maleLabel: 'Jack',
    femaleLabel: 'Jenny',
    offspringLabel: 'Foal',
  },
  Llama: {
    gestationDays: 350,
    weanDays: 180,
    rebreedDays: 21,
    birthLabel: 'Unpacking',
    maleLabel: 'Male',
    femaleLabel: 'Female',
    offspringLabel: 'Cria',
  },
  Yak: {
    gestationDays: 258,
    weanDays: 180,
    rebreedDays: 60,
    birthLabel: 'Calving',
    maleLabel: 'Bull',
    femaleLabel: 'Cow',
    offspringLabel: 'Calf',
  },
  Bison: {
    gestationDays: 283,
    weanDays: 210,
    rebreedDays: 60,
    birthLabel: 'Calving',
    maleLabel: 'Bull',
    femaleLabel: 'Cow',
    offspringLabel: 'Calf',
  },
  'Water Buffalo': {
    gestationDays: 310,
    weanDays: 210,
    rebreedDays: 60,
    birthLabel: 'Calving',
    maleLabel: 'Bull',
    femaleLabel: 'Cow',
    offspringLabel: 'Calf',
  },
  Deer: {
    gestationDays: 201,
    weanDays: 100,
    rebreedDays: 140,
    birthLabel: 'Fawning',
    maleLabel: 'Buck / Stag',
    femaleLabel: 'Doe / Hind',
    offspringLabel: 'Fawn',
  },
  Elk: {
    gestationDays: 250,
    weanDays: 120,
    rebreedDays: 115,
    birthLabel: 'Calving',
    maleLabel: 'Bull',
    femaleLabel: 'Cow',
    offspringLabel: 'Calf',
  },
  Camel: {
    gestationDays: 390,
    weanDays: 270,
    rebreedDays: 90,
    birthLabel: 'Calving',
    maleLabel: 'Bull',
    femaleLabel: 'Cow',
    offspringLabel: 'Calf',
  },
  Chicken: {
    gestationDays: 21,
    weanDays: 42,
    rebreedDays: 14,
    birthLabel: 'Hatching',
    maleLabel: 'Rooster / Cock',
    femaleLabel: 'Hen',
    offspringLabel: 'Chick',
  },
  Duck: {
    gestationDays: 28,
    weanDays: 49,
    rebreedDays: 14,
    birthLabel: 'Hatching',
    maleLabel: 'Drake',
    femaleLabel: 'Hen / Duck',
    offspringLabel: 'Duckling',
  },
  Goose: {
    gestationDays: 30,
    weanDays: 56,
    rebreedDays: 21,
    birthLabel: 'Hatching',
    maleLabel: 'Gander',
    femaleLabel: 'Goose',
    offspringLabel: 'Gosling',
  },
  Turkey: {
    gestationDays: 28,
    weanDays: 56,
    rebreedDays: 14,
    birthLabel: 'Hatching',
    maleLabel: 'Tom',
    femaleLabel: 'Hen',
    offspringLabel: 'Poult',
  },
  Quail: {
    gestationDays: 18,
    weanDays: 28,
    rebreedDays: 7,
    birthLabel: 'Hatching',
    maleLabel: 'Cock / Male',
    femaleLabel: 'Hen',
    offspringLabel: 'Chick',
  },
  Emu: {
    gestationDays: 52,
    weanDays: 90,
    rebreedDays: 30,
    birthLabel: 'Hatching',
    maleLabel: 'Male',
    femaleLabel: 'Female',
    offspringLabel: 'Chick',
  },
  Hedgehog: {
    gestationDays: 35,
    weanDays: 42,
    rebreedDays: 60,
    birthLabel: 'Birth',
    maleLabel: 'Boar',
    femaleLabel: 'Sow',
    offspringLabel: 'Hoglet',
  },
};

function slugifyKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function deterministicEntityId(prefix: string, species: string, rawKey: string): string {
  return `hb-${prefix}-${slugifyKey(species)}-${slugifyKey(rawKey)}`;
}

function formatCustomSpeciesDisplayName(raw: string): string {
  const clean = raw.trim().replace(/\s+/g, ' ');
  if (!clean) return 'Rabbit';
  // If user already typed mixed capitalization (e.g. "McNab Dog"), preserve it; otherwise Title Case words
  const isAllLowerOrAllUpper =
    clean === clean.toLowerCase() || (clean.length > 3 && clean === clean.toUpperCase());
  if (!isAllLowerOrAllUpper) {
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  return clean
    .toLowerCase()
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
    .join(' ');
}

function normalizeSpeciesName(
  rawSpecies: string | undefined,
  fileBaseName: string,
  existingProfiles: SpeciesProfile[],
  fallbackSpecies: string
): string {
  const tryMatch = (candidate: string): string | null => {
    const trimmed = candidate.trim();
    if (!trimmed) return null;
    const existingDirect = existingProfiles.find((p) => isSameSpecies(p.name, trimmed));
    if (existingDirect) return existingDirect.name;

    const presetDirect = PREDEFINED_SPECIES_PRESETS.find((p) => isSameSpecies(p.name, trimmed));
    if (presetDirect) return presetDirect.name;

    const key = trimmed.toLowerCase().replace(/[^a-z]/g, '');
    if (SPECIES_SYNONYMS[key]) {
      const mapped = SPECIES_SYNONYMS[key];
      const existing = existingProfiles.find((p) => isSameSpecies(p.name, mapped));
      return existing ? existing.name : mapped;
    }
    return formatCustomSpeciesDisplayName(trimmed);
  };

  if (rawSpecies && rawSpecies.trim()) {
    const direct = tryMatch(rawSpecies);
    if (direct) return direct;
  }

  // Check filename tokens (e.g. "goats.csv", "sheep_animals.csv", "cattle_export.csv")
  const fileTokens = fileBaseName
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .split(/[^a-z]+/);
  for (const tok of fileTokens) {
    if (SPECIES_SYNONYMS[tok]) {
      const mapped = SPECIES_SYNONYMS[tok];
      const existing = existingProfiles.find((p) => isSameSpecies(p.name, mapped));
      return existing ? existing.name : mapped;
    }
  }

  const resolvedFallback = tryMatch(fallbackSpecies);
  return resolvedFallback || 'Rabbit';
}

function parseHerdBossSex(raw: string | undefined): { sex: BiologicalSex; castratedNote?: string } {
  const s = (raw || '').trim().toLowerCase();
  if (!s) return { sex: 'Unknown' };

  if (/\b(?:steer|wether|barrow|gelding|neuter|neutered|castrated)\b/.test(s)) {
    return { sex: 'Male', castratedNote: `Recorded sex/status in HerdBoss: ${raw!.trim()}` };
  }
  if (/\b(?:spayed|freemartin)\b/.test(s)) {
    return { sex: 'Female', castratedNote: `Recorded sex/status in HerdBoss: ${raw!.trim()}` };
  }
  if (
    s === 'm' ||
    s === 'male' ||
    /\b(?:bull|buck|buckling|ram|boar|sire|stallion|jack|cock|rooster|macho|hob|dog|intact male)\b/.test(
      s
    )
  ) {
    return { sex: 'Male' };
  }
  if (
    s === 'f' ||
    s === 'female' ||
    /\b(?:cow|heifer|doe|doeling|ewe|ewes|sow|gilt|dam|mare|jenny|hen|hembra|jill|bitch|intact female)\b/.test(
      s
    )
  ) {
    return { sex: 'Female' };
  }
  return { sex: 'Unknown' };
}

function parseHerdBossAnimalStatus(
  rawStatus: string | undefined,
  rawSoldDate?: string,
  rawDeathDate?: string,
  rawReferenceFlag?: string
): AnimalStatus {
  if (rawDeathDate && rawDeathDate.trim()) return 'Deceased';
  if (rawSoldDate && rawSoldDate.trim()) return 'Sold';

  const ref = (rawReferenceFlag || '').trim().toLowerCase();
  if (ref === 'true' || ref === '1' || ref === 'yes' || ref === 'reference') {
    return 'Retired';
  }

  const s = (rawStatus || '').trim().toLowerCase();
  if (!s) return 'Active';
  if (/\b(?:dead|deceased|died|culled|cull|butchered|harvested|euthanized|lost)\b/.test(s)) {
    return 'Deceased';
  }
  if (/\b(?:sold|sale|transferred|marketed)\b/.test(s)) {
    return 'Sold';
  }
  if (/\b(?:ref|reference|ancestor|pedigree|retired|archived|inactive|historical|external)\b/.test(s)) {
    return 'Retired';
  }
  if (/\b(?:junior|weanling|nursing|kid|calf|lamb|kit|cria|foal|puppy|chick|feeder)\b/.test(s)) {
    return 'Junior';
  }
  return 'Active';
}

function buildNormalizedTablesFromEntry(entry: VirtualArchiveEntry): NormalizedTable[] {
  if (entry.isMediaOrBinary || !entry.textContent) return [];

  if (entry.extension === 'json') {
    try {
      const parsed = JSON.parse(entry.textContent);
      const out: NormalizedTable[] = [];

      const convertObjArray = (nameSuffix: string, arr: unknown[]) => {
        const validObjs = arr.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) as Array<
          Record<string, unknown>
        >;
        if (validObjs.length === 0) return;
        const headerSet = new Set<string>();
        for (const item of validObjs) {
          for (const k of Object.keys(item)) headerSet.add(k);
        }
        const headers = Array.from(headerSet);
        const normHeaderMap = new Map<string, string>();
        for (const h of headers) normHeaderMap.set(normalizeColumnKey(h), h);
        const rows = validObjs.map((item) => {
          const r: Record<string, string> = {};
          for (const h of headers) {
            const v = item[h];
            r[h] =
              v === null || v === undefined
                ? ''
                : typeof v === 'object'
                ? JSON.stringify(v)
                : String(v).trim();
          }
          return r;
        });
        out.push({
          archiveName: entry.archiveName,
          entryPath: nameSuffix ? `${entry.entryPath}#${nameSuffix}` : entry.entryPath,
          baseName: nameSuffix || entry.baseName,
          headers,
          normHeaderMap,
          rows,
        });
      };

      if (Array.isArray(parsed)) {
        convertObjArray('', parsed);
      } else if (parsed && typeof parsed === 'object') {
        for (const [key, val] of Object.entries(parsed)) {
          if (Array.isArray(val)) {
            convertObjArray(key, val);
          }
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  if (entry.extension === 'csv' || entry.extension === 'tsv' || entry.extension === 'txt') {
    const { headers, rows } = parseDelimitedTable(entry.textContent);
    if (headers.length === 0) return [];
    const normHeaderMap = new Map<string, string>();
    for (const h of headers) {
      const nk = normalizeColumnKey(h);
      if (nk && !normHeaderMap.has(nk)) normHeaderMap.set(nk, h);
    }
    return [
      {
        archiveName: entry.archiveName,
        entryPath: entry.entryPath,
        baseName: entry.baseName,
        headers,
        normHeaderMap,
        rows,
      },
    ];
  }

  return [];
}

function pickCell(
  row: Record<string, string>,
  normHeaderMap: Map<string, string>,
  usedCols: Set<string>,
  candidates: string[]
): string {
  for (const cand of candidates) {
    const actual = normHeaderMap.get(cand);
    if (actual !== undefined) {
      usedCols.add(actual);
      const val = row[actual];
      if (val !== undefined && val !== '') return val;
    }
  }
  return '';
}

function hasAnyColumn(normHeaderMap: Map<string, string>, candidates: string[]): boolean {
  return candidates.some((c) => normHeaderMap.has(c));
}

function classifyHerdBossTable(table: NormalizedTable): ImportedTableClassification {
  const fname = table.baseName.toLowerCase();
  const h = table.normHeaderMap;

  // 0. Photo / Image / Attachment Manifest tables (often 1-to-many rows per animal with captions/notes)
  // Must run BEFORE `notes_tasks` so multi-photo manifests aren't misclassified as CareLogs!
  if (
    (/\b(?:photo|photos|image|images|picture|pictures|media|attachment|attachments|gallery)\b/.test(
      fname
    ) &&
      !hasAnyColumn(h, ['sex', 'gender', 'birthdate', 'dob', 'sire', 'dam'])) ||
    (hasAnyColumn(h, [
      'filename',
      'filepath',
      'photofile',
      'imagefile',
      'photourl',
      'imageurl',
      'mimetype',
      'contenttype',
    ]) &&
      !hasAnyColumn(h, ['sex', 'gender', 'birthdate', 'dob', 'sire', 'dam']))
  ) {
    return 'media_manifest';
  }

  // 1. Weight logs
  if (
    /\b(?:weight|weights|weigh|weighin|weighins)\b/.test(fname) ||
    (hasAnyColumn(h, ['weight', 'weightlbs', 'weightkg', 'weightvalue']) &&
      hasAnyColumn(h, ['weighdate', 'weightdate', 'date', 'recordedat']) &&
      !hasAnyColumn(h, ['sex', 'gender', 'birthdate', 'dob']))
  ) {
    return 'weights';
  }

  // 2. Treatments / Medications / Health / Hoof / Breeding Soundness
  if (
    /\b(?:treatment|treatments|medication|medications|medicine|health|vaccine|vaccination|vaccinations|deworm|parasite|hoof|shearing|vet|medical)\b/.test(
      fname
    ) ||
    hasAnyColumn(h, [
      'medication',
      'medicine',
      'drug',
      'dosage',
      'dose',
      'withdrawaldate',
      'meatwithdrawal',
      'milkwithdrawal',
      'treatment',
      'treatmenttype',
      'vaccine',
      'famacha',
    ])
  ) {
    return 'treatments_care';
  }

  // 3. Breedings / Matings / Exposures / Pregnancies / Birthing
  if (
    /\b(?:breeding|breedings|mating|matings|exposure|exposures|pregnancy|pregnancies|kidding|lambing|calving|kindling|farrowing|whelping|litter|litters|birth|births)\b/.test(
      fname
    ) ||
    (hasAnyColumn(h, [
      'breddate',
      'breedingdate',
      'matingdate',
      'exposurestart',
      'startdate',
      'duedate',
      'expectedduedate',
      'kiddingdate',
      'lambingdate',
      'calvingdate',
      'kindlingdate',
    ]) &&
      hasAnyColumn(h, [
        'sire',
        'sireid',
        'siretag',
        'sirename',
        'male',
        'buck',
        'ram',
        'bull',
        'dam',
        'damid',
        'damtag',
        'damname',
        'female',
        'doe',
        'ewe',
        'cow',
      ]))
  ) {
    return 'breedings';
  }

  // 4. Dedicated Pedigree / Parent Link table (without full animal demographics)
  if (
    /\b(?:pedigree|pedigrees|lineage|parents|ancestors)\b/.test(fname) &&
    !hasAnyColumn(h, ['sex', 'gender', 'birthdate', 'dob'])
  ) {
    return 'pedigree_links';
  }

  // 5. Groups / Herds / Pastures / Pens / Locations
  if (
    /\b(?:group|groups|pasture|pastures|pen|pens|paddock|location|locations|cage|cages)\b/.test(
      fname
    ) &&
    !hasAnyColumn(h, ['sex', 'gender', 'birthdate', 'dob', 'sire', 'dam'])
  ) {
    return 'cages_groups';
  }

  // 6. Shows / Exhibitions
  if (
    /\b(?:show|shows|exhibition|fair|award|awards|leg|legs)\b/.test(fname) &&
    hasAnyColumn(h, ['showdate', 'eventdate', 'showname', 'judge', 'placing', 'class'])
  ) {
    return 'shows';
  }

  // 7. Animals / Herd / Stock / Reference Ancestors
  if (
    /\b(?:animal|animals|herd|flock|livestock|stock|goat|goats|sheep|cattle|cow|cows|rabbit|rabbits|pig|pigs|swine|dog|dogs|alpaca|alpacas|reference)\b/.test(
      fname
    ) ||
    (hasAnyColumn(h, [
      'name',
      'animalname',
      'tag',
      'primarytag',
      'visualtag',
      'eartag',
      'tattoo',
      'eid',
      'registrationnumber',
    ]) &&
      hasAnyColumn(h, [
        'sex',
        'gender',
        'birthdate',
        'dob',
        'breed',
        'sire',
        'dam',
        'sireid',
        'damid',
      ]))
  ) {
    return 'animals';
  }

  // 8. Notes / Tasks / Reminders
  if (
    /\b(?:note|notes|journal|task|tasks|reminder|reminders|todo|chore|observation)\b/.test(
      fname
    ) ||
    hasAnyColumn(h, ['note', 'notes', 'comment', 'comments', 'duedate', 'task', 'title'])
  ) {
    return 'notes_tasks';
  }

  return 'metadata_other';
}

function createMissingSpeciesProfile(
  speciesName: string,
  sortOrder: number,
  ts: string,
  override?: CustomSpeciesImportOverride
): SpeciesProfile {
  const preset = PREDEFINED_SPECIES_PRESETS.find((p) => isSameSpecies(p.name, speciesName));
  if (preset && !override) {
    return {
      ...preset,
      sortOrder,
      createdAt: ts,
      updatedAt: ts,
    };
  }
  const customBase = preset
    ? {
        gestationDays: preset.gestationDays,
        weanDays: preset.weanDaysAfterBirth,
        rebreedDays: preset.rebreedDaysAfterBirth,
        birthLabel: preset.birthEventLabel,
        maleLabel: preset.maleLabel,
        femaleLabel: preset.femaleLabel,
        offspringLabel: preset.offspringLabel,
      }
    : CUSTOM_SPECIES_DEFAULTS[speciesName] || {
        gestationDays: 145,
        weanDays: 60,
        rebreedDays: 45,
        birthLabel: 'Birth',
        maleLabel: 'Sire',
        femaleLabel: 'Dam',
        offspringLabel: 'Offspring',
      };

  const gestationDays = Math.max(
    1,
    Math.round(override?.gestationDays ?? customBase.gestationDays)
  );
  const weanDays = Math.max(1, Math.round(override?.weanDaysAfterBirth ?? customBase.weanDays));
  const rebreedDays = Math.max(
    1,
    Math.round(override?.rebreedDaysAfterBirth ?? customBase.rebreedDays)
  );
  const birthLabel = (override?.birthEventLabel || '').trim() || customBase.birthLabel;
  const maleLabel = (override?.maleLabel || '').trim() || customBase.maleLabel;
  const femaleLabel = (override?.femaleLabel || '').trim() || customBase.femaleLabel;
  const offspringLabel = (override?.offspringLabel || '').trim() || customBase.offspringLabel;

  return {
    id: preset?.id || `species-${slugifyKey(speciesName)}`,
    name: speciesName,
    sortOrder,
    gestationDays,
    rebreedDaysAfterBirth: rebreedDays,
    weanDaysAfterBirth: weanDays,
    birthEventLabel: birthLabel,
    maleLabel,
    femaleLabel,
    offspringLabel,
    exampleBreeds: preset?.exampleBreeds || [],
    milestones: preset?.milestones || [
      {
        label: 'Pregnancy / Fertility Check',
        relativeTo: 'AFTER_BRED',
        daysOffset: Math.max(5, Math.round(gestationDays * 0.25)),
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: `Prepare ${birthLabel} Pen`,
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: Math.min(7, Math.max(2, Math.round(gestationDays * 0.08))),
        category: 'Nestbox',
        priority: 'High',
      },
      {
        label: `Wean ${offspringLabel}s`,
        relativeTo: 'AFTER_BIRTH',
        daysOffset: weanDays,
        category: 'Weaning',
        priority: 'High',
      },
    ],
    createdAt: ts,
    updatedAt: ts,
  };
}

export const HerdBossImporter: PlatformImporter = {
  id: 'herdboss',
  name: 'HerdBoss (2-ZIP / CSV Export)',
  badge: 'Multi-ZIP Supported',
  supportsMultiZip: true,
  acceptedExtensions: ['.zip', '.csv', '.tsv', '.json'],
  summary:
    'Imports HerdBoss multi-ZIP exports (animals, multi-generation Sire/Dam pedigrees, tags/EID/tattoos, breedings, weights, treatments, herd locations, and multi-photo animal galleries with automatic storage optimization).',
  instructions:
    'Stage both HerdBoss export .ZIP files together (either select both at once or click "+ Add Companion .ZIP" for Part 1 and Part 2), review the detected records & auto-optimized photo preview below, then click Merge Into Barn.',

  parse(
    inputs: RawArchiveInput[],
    existingSnapshot: BarnDatabaseSnapshot,
    options: ImporterRunOptions
  ): PlatformImportPreview {
    const ts = nowIsoUtc();
    const warnings: string[] = [];
    const archiveNames = inputs.map((i) => i.fileName);

    const entries = extractVirtualEntries(inputs);
    let deferredMediaCount = 0;
    let deferredMediaBytes = 0;
    const deferredMediaSampleNames: string[] = [];
    const imageArchiveEntries: VirtualArchiveEntry[] = [];
    const imageByNormPath = new Map<string, VirtualArchiveEntry>();
    const imagesByBaseName = new Map<string, VirtualArchiveEntry[]>();
    let deferredManifestRowCount = 0;
    let missingPhotoZipRefsCount = 0;
    const perAnimalImages = new Map<string, Set<string>>();

    interface QueuedAnimalImage {
      entry: VirtualArchiveEntry;
      caption: string;
      preferPrimary: boolean;
    }
    const queuedImagesByAnimal = new Map<string, QueuedAnimalImage[]>();
    const claimedImagePaths = new Set<string>();
    const inlinePhotoRefs: Array<{
      animalId: string;
      tokens: string[];
      rawPhotoRef: string;
      preferPrimary: boolean;
    }> = [];

    const recordDeferredImageForAnimal = (animalId: string, imageLabel: string) => {
      const clean = imageLabel.trim();
      if (!animalId || !clean) return;
      let set = perAnimalImages.get(animalId);
      if (!set) {
        set = new Set<string>();
        perAnimalImages.set(animalId, set);
      }
      set.add(clean);
    };

    const queueBinaryImageForAnimal = (
      animalId: string,
      entry: VirtualArchiveEntry,
      caption = '',
      preferPrimary = false
    ) => {
      if (!animalId || !entry.imageBytes) return;
      let list = queuedImagesByAnimal.get(animalId);
      if (!list) {
        list = [];
        queuedImagesByAnimal.set(animalId, list);
      }
      const existing = list.find((q) => q.entry.entryPath === entry.entryPath);
      if (existing) {
        if (caption && !existing.caption) existing.caption = caption;
        if (preferPrimary) existing.preferPrimary = true;
        return;
      }
      list.push({ entry, caption, preferPrimary });
      claimedImagePaths.add(`${entry.archiveName}::${entry.entryPath}`);
      recordDeferredImageForAnimal(animalId, entry.baseName);
    };

    const resolveImageEntry = (
      rawRef: string,
      animalHintTokens: string[]
    ): VirtualArchiveEntry | undefined => {
      const cleaned = rawRef
        .trim()
        .split('?')[0]
        .replace(/\\/g, '/')
        .replace(/^\.?\/+/, '');
      if (!cleaned) return undefined;
      const lower = cleaned.toLowerCase();

      const exact = imageByNormPath.get(lower);
      if (exact) return exact;

      // Suffix match (e.g. CSV says `1042/front.jpg`, ZIP has `export/photos/1042/front.jpg`)
      for (const [pathKey, ent] of imageByNormPath.entries()) {
        if (pathKey.endsWith(`/${lower}`)) return ent;
      }

      const base = lower.split('/').pop() || lower;
      const baseMatches = imagesByBaseName.get(base);
      if (!baseMatches || baseMatches.length === 0) return undefined;
      if (baseMatches.length === 1) return baseMatches[0];

      // Disambiguate shared filenames (`photo1.jpg`) using animal ID/tag folder tokens
      const cleanHints = animalHintTokens
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0);
      for (const ent of baseMatches) {
        const pLower = ent.entryPath.toLowerCase();
        if (cleanHints.some((tok) => pLower.includes(`/${tok}/`) || pLower.includes(tok))) {
          return ent;
        }
      }
      return baseMatches[0];
    };

    const diagnostics: DetectedTableDiagnostic[] = [];
    const classifiedTables: Array<{
      table: NormalizedTable;
      classification: ImportedTableClassification;
      usedCols: Set<string>;
    }> = [];

    for (const entry of entries) {
      if (entry.isMediaOrBinary) {
        if (entry.imageBytes && entry.mimeHint) {
          imageArchiveEntries.push(entry);
          const normPath = entry.entryPath.replace(/\\/g, '/').replace(/^\.?\/+/, '').toLowerCase();
          if (!imageByNormPath.has(normPath)) {
            imageByNormPath.set(normPath, entry);
          }
          const baseLower = entry.baseName.toLowerCase();
          const bucket = imagesByBaseName.get(baseLower) || [];
          bucket.push(entry);
          imagesByBaseName.set(baseLower, bucket);
        } else {
          // Non-image binary attachments (.pdf, .doc, .mp4, etc.)
          deferredMediaCount++;
          deferredMediaBytes += entry.sizeBytes;
          if (deferredMediaSampleNames.length < 6) {
            deferredMediaSampleNames.push(entry.entryPath);
          }
        }
        continue;
      }
      const tables = buildNormalizedTablesFromEntry(entry);
      for (const table of tables) {
        const classification = classifyHerdBossTable(table);
        classifiedTables.push({
          table,
          classification,
          usedCols: new Set<string>(),
        });
      }
    }

    // Track known + newly discovered species profiles
    const workingSpeciesProfiles: SpeciesProfile[] = [...existingSnapshot.speciesProfiles];
    const newSpeciesProfiles: SpeciesProfile[] = [];
    const speciesDetectedSet = new Set<string>();

    const ensureSpecies = (rawSpecies: string | undefined, fileBaseName: string): SpeciesProfile => {
      const resolvedName = normalizeSpeciesName(
        rawSpecies,
        fileBaseName,
        workingSpeciesProfiles,
        options.fallbackSpeciesName
      );
      speciesDetectedSet.add(resolvedName);
      const found = workingSpeciesProfiles.find((p) => isSameSpecies(p.name, resolvedName));
      if (found) return found;

      const override = options.customSpeciesOverrides?.[resolvedName.trim().toLowerCase()];
      const created = createMissingSpeciesProfile(
        resolvedName,
        workingSpeciesProfiles.length,
        ts,
        override
      );
      workingSpeciesProfiles.push(created);
      newSpeciesProfiles.push(created);
      return created;
    };

    // Entity accumulators
    const animalsById = new Map<string, Animal>();
    const matchedExistingByAnimalId = new Map<string, PreexistingAnimalMatch>();
    // Per-species lookup index: key = `${species.toLowerCase()}::${lookupToken.toLowerCase()}` -> animal.id
    const animalLookup = new Map<string, string>();
    const pendingLineage: PendingLineageRef[] = [];
    const cagesByKey = new Map<string, CageLocation>();
    const breedings: BreedingRecord[] = [];
    const careLogs: CareLog[] = [];
    const tasks: BarnTask[] = [];
    const shows: ShowEvent[] = [];

    const registerLookupToken = (
      species: string,
      token: string | undefined,
      animalId: string,
      overwrite = false
    ) => {
      const clean = (token || '').trim().toLowerCase();
      if (!clean) return;
      const key = `${species.trim().toLowerCase()}::${clean}`;
      if (overwrite || !animalLookup.has(key)) {
        animalLookup.set(key, animalId);
      }
    };

    // Also index existing barn animals so cross-archive or incremental imports can link to existing stock!
    for (const existingAnimal of existingSnapshot.animals) {
      registerLookupToken(existingAnimal.species, existingAnimal.id, existingAnimal.id);
      registerLookupToken(existingAnimal.species, existingAnimal.tattoo, existingAnimal.id);
      registerLookupToken(existingAnimal.species, existingAnimal.name, existingAnimal.id);
      registerLookupToken(
        existingAnimal.species,
        existingAnimal.registrationNumber,
        existingAnimal.id
      );
    }

    const ensureCageLocation = (species: string, labelRaw: string, sectionRaw = 'Imported Group') => {
      const label = labelRaw.trim();
      if (!label) return;
      const key = `${species.toLowerCase()}::${label.toLowerCase()}`;
      if (cagesByKey.has(key)) return;
      const existingCage = existingSnapshot.cages.find(
        (c) => isSameSpecies(c.species, species) && c.label.toLowerCase() === label.toLowerCase()
      );
      if (existingCage) return;
      cagesByKey.set(key, {
        id: deterministicEntityId('cage', species, label),
        species,
        label,
        section: sectionRaw,
        capacity: 10,
        notes: 'Imported from HerdBoss',
        createdAt: ts,
        updatedAt: ts,
      });
    };

    // PASS 1: Process `cages_groups` and `animals` tables first so all primary animals are indexed
    for (const item of classifiedTables) {
      if (item.classification !== 'cages_groups') continue;
      const { table, usedCols } = item;
      for (const row of table.rows) {
        const rawSpecies = pickCell(row, table.normHeaderMap, usedCols, [
          'species',
          'animaltype',
          'livestocktype',
        ]);
        const sp = ensureSpecies(rawSpecies, table.baseName);
        const label = pickCell(row, table.normHeaderMap, usedCols, [
          'name',
          'groupname',
          'group',
          'pasture',
          'pasturename',
          'pen',
          'location',
          'label',
        ]);
        const section =
          pickCell(row, table.normHeaderMap, usedCols, ['section', 'barn', 'type', 'category']) ||
          'HerdBoss Group';
        const notes = pickCell(row, table.normHeaderMap, usedCols, [
          'notes',
          'description',
          'comments',
        ]);
        if (label) {
          ensureCageLocation(sp.name, label, section);
          const created = cagesByKey.get(`${sp.name.toLowerCase()}::${label.toLowerCase()}`);
          if (created && notes) created.notes = notes;
        }
      }
    }

    for (const item of classifiedTables) {
      if (item.classification !== 'animals') continue;
      const { table, usedCols } = item;

      table.rows.forEach((row, rowIdx) => {
        const rawSpecies = pickCell(row, table.normHeaderMap, usedCols, [
          'species',
          'animaltype',
          'livestocktype',
          'speciestype',
        ]);
        const sp = ensureSpecies(rawSpecies, table.baseName);

        const extId = pickCell(row, table.normHeaderMap, usedCols, [
          'id',
          'animalid',
          'herdbossid',
          'uuid',
          'recordid',
          'guid',
        ]);
        const primaryTag = pickCell(row, table.normHeaderMap, usedCols, [
          'primarytag',
          'visualtag',
          'tag',
          'tagnumber',
          'eartag',
          'animaltag',
          'number',
        ]);
        const tattooField = pickCell(row, table.normHeaderMap, usedCols, [
          'tattoo',
          'eartattoo',
          'lefttattoo',
          'lefteartattoo',
          'righttattoo',
          'righteartattoo',
          'herdmark',
          'brand',
        ]);
        const rightTattoo = pickCell(row, table.normHeaderMap, usedCols, [
          'righttattoo',
          'righteartattoo',
        ]);
        const eid = pickCell(row, table.normHeaderMap, usedCols, [
          'eid',
          'rfid',
          'rfidtag',
          'electronicid',
          'microchip',
        ]);
        const scrapie = pickCell(row, table.normHeaderMap, usedCols, [
          'scrapietag',
          'scrapie',
          'scrapieid',
          'flockid',
        ]);

        const combinedTattoo =
          tattooField && rightTattoo && tattooField !== rightTattoo
            ? `${tattooField} / ${rightTattoo}`
            : primaryTag || tattooField || scrapie || eid;

        const rawName = pickCell(row, table.normHeaderMap, usedCols, [
          'name',
          'animalname',
          'registeredname',
          'callname',
          'barnname',
        ]);
        const displayName = rawName || combinedTattoo || `Animal #${rowIdx + 1}`;

        const breed = pickCell(row, table.normHeaderMap, usedCols, [
          'breed',
          'primarybreed',
          'breedname',
          'breedcomposition',
          'crossbreed',
        ]);
        const variety = pickCell(row, table.normHeaderMap, usedCols, [
          'color',
          'variety',
          'coatcolor',
          'markings',
          'pattern',
          'coloration',
        ]);
        const rawSex = pickCell(row, table.normHeaderMap, usedCols, [
          'sex',
          'gender',
          'biologicalsex',
        ]);
        const { sex, castratedNote } = parseHerdBossSex(rawSex);

        const rawStatus = pickCell(row, table.normHeaderMap, usedCols, [
          'status',
          'herdstatus',
          'animalstatus',
          'state',
          'disposition',
        ]);
        const soldDate = pickCell(row, table.normHeaderMap, usedCols, ['solddate', 'datesold']);
        const deathDate = pickCell(row, table.normHeaderMap, usedCols, [
          'deathdate',
          'deceaseddate',
          'dieddate',
          'culldate',
        ]);
        const refFlag = pickCell(row, table.normHeaderMap, usedCols, [
          'isreference',
          'reference',
          'pedigreeonly',
          'archived',
        ]);
        const status = parseHerdBossAnimalStatus(rawStatus, soldDate, deathDate, refFlag);

        const birthDateIso = normalizeFlexibleDateIso(
          pickCell(row, table.normHeaderMap, usedCols, [
            'birthdate',
            'dob',
            'dateofbirth',
            'born',
            'borndate',
          ])
        );

        const weightUnitCol = pickCell(row, table.normHeaderMap, usedCols, [
          'weightunit',
          'unit',
          'units',
        ]);
        const currentWeightRaw = pickCell(row, table.normHeaderMap, usedCols, [
          'currentweight',
          'weight',
          'lastweight',
          'weightlbs',
          'weightkg',
        ]);
        const birthWeightRaw = pickCell(row, table.normHeaderMap, usedCols, [
          'birthweight',
          'bornweight',
        ]);
        const weanWeightRaw = pickCell(row, table.normHeaderMap, usedCols, [
          'weaningweight',
          'weanweight',
        ]);

        const currentGrams = parseFlexibleWeightToGrams(currentWeightRaw, weightUnitCol);
        const weanGrams = parseFlexibleWeightToGrams(weanWeightRaw, weightUnitCol);
        const birthGrams = parseFlexibleWeightToGrams(birthWeightRaw, weightUnitCol);
        const bestWeightGrams = currentGrams || weanGrams || birthGrams || 0;

        const regNum = pickCell(row, table.normHeaderMap, usedCols, [
          'registrationnumber',
          'registration',
          'regnumber',
          'regno',
          'registrynumber',
          'associationnumber',
        ]);
        const gcNum = pickCell(row, table.normHeaderMap, usedCols, [
          'grandchampionnumber',
          'gcnumber',
          'championnumber',
        ]);
        const genotypeRaw = pickCell(row, table.normHeaderMap, usedCols, [
          'genotype',
          'dna',
          'dnamarkers',
          'colorgenetics',
          'codon171',
          'scrapiegenotype',
        ]);

        const location = pickCell(row, table.normHeaderMap, usedCols, [
          'group',
          'groupname',
          'subherd',
          'pasture',
          'pen',
          'cage',
          'cagelocation',
          'location',
          'barn',
        ]);
        if (location) {
          ensureCageLocation(sp.name, location);
        }

        const breederName = pickCell(row, table.normHeaderMap, usedCols, [
          'breeder',
          'breedername',
          'bredby',
          'origin',
          'purchasedfrom',
          'seller',
        ]);
        const rawOwner = pickCell(row, table.normHeaderMap, usedCols, ['owner', 'ownername']);

        const baseNotes = pickCell(row, table.normHeaderMap, usedCols, [
          'notes',
          'note',
          'comments',
          'comment',
          'description',
          'remarks',
        ]);

        const extraMetaParts: string[] = [];
        if (castratedNote) extraMetaParts.push(castratedNote);
        if (primaryTag && tattooField && primaryTag !== tattooField) {
          extraMetaParts.push(`Tag: ${primaryTag}, Tattoo: ${tattooField}`);
        }
        if (eid && eid !== combinedTattoo) extraMetaParts.push(`EID/RFID: ${eid}`);
        if (scrapie && scrapie !== combinedTattoo) extraMetaParts.push(`Scrapie: ${scrapie}`);
        if (baseNotes) extraMetaParts.push(baseNotes);

        const stableSeed = extId || combinedTattoo || regNum || `${displayName}-${birthDateIso || rowIdx}`;
        const candidateDeterministicId = deterministicEntityId('animal', sp.name, stableSeed);

        // Check if this animal already exists in the barn within the same species!
        const preexistingMatch = findPreexistingAnimalMatch(existingSnapshot.animals, {
          species: sp.name,
          candidateDeterministicId,
          externalId: extId,
          tattoo: combinedTattoo,
          registrationNumber: regNum,
          name: rawName || combinedTattoo,
          birthDateIso,
        });

        const animalId = preexistingMatch ? preexistingMatch.animal.id : candidateDeterministicId;
        if (preexistingMatch) {
          matchedExistingByAnimalId.set(animalId, preexistingMatch);
        }

        const ownerName =
          rawOwner || (preexistingMatch ? '' : existingSnapshot.settings.barnName);

        const resolvedStatus =
          rawStatus || soldDate || deathDate || refFlag
            ? status
            : preexistingMatch?.animal.status || status;
        const detectedArchived =
          resolvedStatus === 'Deceased' ||
          resolvedStatus === 'Sold' ||
          resolvedStatus === 'Retired' ||
          /^(?:1|true|yes|y|archived|inactive|ref|reference)$/i.test(refFlag) ||
          /^(?:archived|inactive|culled|harvested|butchered|dead|died|sold|pet|gone|retired|reference)$/i.test(
            rawStatus
          );

        const animal: Animal = {
          id: animalId,
          tattoo: combinedTattoo,
          name: displayName,
          species: sp.name,
          breed,
          variety,
          sex,
          status: resolvedStatus,
          archived:
            rawStatus || soldDate || deathDate || refFlag
              ? detectedArchived
              : Boolean(preexistingMatch?.animal.archived),
          birthDateIso,
          weightGrams: bestWeightGrams,
          genotype: parseGenotypeString(genotypeRaw),
          genotypeRaw,
          registrationNumber: regNum,
          grandChampionNumber: gcNum,
          legsCount: preexistingMatch?.animal.legsCount || 0,
          cageLocation: location,
          breederName,
          ownerName,
          sireId: '',
          damId: '',
          notes: extraMetaParts.join(' · '),
          createdAt: preexistingMatch?.animal.createdAt || ts,
          updatedAt: ts,
        };

        animalsById.set(animalId, animal);

        // Index every identifier so Sire/Dam, Breeding, Weight, Treatment, and Photo rows resolve cleanly
        registerLookupToken(sp.name, extId, animalId, true);
        registerLookupToken(sp.name, primaryTag, animalId, true);
        registerLookupToken(sp.name, tattooField, animalId, true);
        registerLookupToken(sp.name, combinedTattoo, animalId, true);
        registerLookupToken(sp.name, eid, animalId, true);
        registerLookupToken(sp.name, scrapie, animalId, true);
        registerLookupToken(sp.name, regNum, animalId, true);
        registerLookupToken(sp.name, rawName, animalId, true);
        registerLookupToken(sp.name, displayName, animalId, true);

        // Detect inline single or multi-image columns (e.g. Photo, Photos, Image1, Image2, Attachments)
        const animalHintTokens = [extId, primaryTag, tattooField, combinedTattoo, rawName].filter(
          Boolean
        );
        for (const [normKey, actualHeader] of table.normHeaderMap.entries()) {
          if (
            /^(?:photo|photos|image|images|picture|pictures|pic|pics|avatar|profilephoto|primaryphoto|attachment|attachments)\d*(?:url|file|path|name)?$/.test(
              normKey
            )
          ) {
            usedCols.add(actualHeader);
            const rawCell = (row[actualHeader] || '').trim();
            if (rawCell && !/^(?:none|null|false|0|n\/a)$/i.test(rawCell)) {
              const isPrimaryCol = /^(?:avatar|profilephoto|primaryphoto|photo1|image1)$/.test(
                normKey
              );
              const refs = rawCell
                .split(/[;|\n]+|,\s*(?=(?:https?:\/\/|[\w./-]+\.[a-z0-9]{2,5}\b))/i)
                .map((t) => t.trim())
                .filter(Boolean);
              refs.forEach((refItem, refIdx) => {
                inlinePhotoRefs.push({
                  animalId,
                  tokens: animalHintTokens,
                  rawPhotoRef: refItem,
                  preferPrimary: isPrimaryCol && refIdx === 0,
                });
              });
            }
          }
        }

        // Record inline birth/weaning weights as CareLogs if present
        if (birthGrams > 0) {
          careLogs.push({
            id: deterministicEntityId('care', sp.name, `${stableSeed}-birth-wt`),
            species: sp.name,
            animalId,
            dateIso: birthDateIso || todayDateIso(),
            type: 'Weight Check',
            title: 'Birth Weight (HerdBoss)',
            weightGrams: birthGrams,
            showLegEarned: false,
            notes: '',
            createdAt: ts,
            updatedAt: ts,
          });
        }
        if (weanGrams > 0) {
          careLogs.push({
            id: deterministicEntityId('care', sp.name, `${stableSeed}-wean-wt`),
            species: sp.name,
            animalId,
            dateIso: birthDateIso ? addDaysIso(birthDateIso, sp.weanDaysAfterBirth) : todayDateIso(),
            type: 'Weight Check',
            title: 'Weaning Weight (HerdBoss)',
            weightGrams: weanGrams,
            showLegEarned: false,
            notes: '',
            createdAt: ts,
            updatedAt: ts,
          });
        }

        // Capture Sire & Dam + optional Grandsire/Granddam columns for Pass 2 resolution
        const sireRef = pickCell(row, table.normHeaderMap, usedCols, [
          'sireid',
          'sire',
          'siretag',
          'sirevisualtag',
          'sirename',
          'sireregistrationnumber',
          'father',
          'fatherid',
        ]);
        const damRef = pickCell(row, table.normHeaderMap, usedCols, [
          'damid',
          'dam',
          'damtag',
          'damvisualtag',
          'damname',
          'damregistrationnumber',
          'geneticdam',
          'birthdam',
          'mother',
          'motherid',
        ]);
        const patGrandsire = pickCell(row, table.normHeaderMap, usedCols, [
          'siresire',
          'siressire',
          'paternalgrandsire',
          'siresireid',
        ]);
        const patGranddam = pickCell(row, table.normHeaderMap, usedCols, [
          'siredam',
          'siresdam',
          'paternalgranddam',
          'siredamid',
        ]);
        const matGrandsire = pickCell(row, table.normHeaderMap, usedCols, [
          'damsire',
          'damssire',
          'maternalgrandsire',
          'damsireid',
        ]);
        const matGranddam = pickCell(row, table.normHeaderMap, usedCols, [
          'damdam',
          'damsdam',
          'maternalgranddam',
          'damdamid',
        ]);

        if (sireRef || damRef) {
          pendingLineage.push({
            animalId,
            species: sp.name,
            breed,
            sireRef,
            damRef,
            paternalGrandsireRef: patGrandsire,
            paternalGranddamRef: patGranddam,
            maternalGrandsireRef: matGrandsire,
            maternalGranddamRef: matGranddam,
          });
        }
      });
    }

    // Also process standalone `pedigree_links` tables if HerdBoss exported one separately
    for (const item of classifiedTables) {
      if (item.classification !== 'pedigree_links') continue;
      const { table, usedCols } = item;
      for (const row of table.rows) {
        const rawSpecies = pickCell(row, table.normHeaderMap, usedCols, ['species', 'animaltype']);
        const sp = ensureSpecies(rawSpecies, table.baseName);
        const childRef = pickCell(row, table.normHeaderMap, usedCols, [
          'animalid',
          'id',
          'animal',
          'tag',
          'primarytag',
          'name',
        ]);
        const sireRef = pickCell(row, table.normHeaderMap, usedCols, [
          'sireid',
          'sire',
          'siretag',
          'sirename',
        ]);
        const damRef = pickCell(row, table.normHeaderMap, usedCols, [
          'damid',
          'dam',
          'damtag',
          'damname',
        ]);
        const childId = animalLookup.get(`${sp.name.toLowerCase()}::${childRef.trim().toLowerCase()}`);
        if (childId && (sireRef || damRef)) {
          const child = animalsById.get(childId);
          pendingLineage.push({
            animalId: childId,
            species: sp.name,
            breed: child?.breed || '',
            sireRef,
            damRef,
            paternalGrandsireRef: '',
            paternalGranddamRef: '',
            maternalGrandsireRef: '',
            maternalGranddamRef: '',
          });
        }
      }
    }

    // PASS 2: Resolve all Sire/Dam references (synthesizing foundation/reference ancestors when external)
    let parentLinksResolved = 0;
    let placeholderAncestorsCreated = 0;

    const resolveOrCreateAncestor = (
      species: string,
      refRaw: string,
      expectedSex: 'Male' | 'Female',
      defaultBreed: string,
      disallowSelfId: string
    ): string => {
      const cleanRef = refRaw.trim();
      if (!cleanRef || /^(?:unknown|none|n\/a|na|null|-|0)$/i.test(cleanRef)) return '';

      const existingId = animalLookup.get(`${species.toLowerCase()}::${cleanRef.toLowerCase()}`);
      if (existingId && existingId !== disallowSelfId) {
        return existingId;
      }

      // Synthesize a clean Reference / Foundation Ancestor so zero pedigree history is lost
      const ancId = deterministicEntityId('ancestor', species, `${expectedSex}-${cleanRef}`);
      if (ancId === disallowSelfId) return '';

      if (!animalsById.has(ancId)) {
        const looksLikeCode = /^[A-Z0-9#-]{1,12}$/i.test(cleanRef) && /\d/.test(cleanRef);
        const anc: Animal = {
          id: ancId,
          tattoo: looksLikeCode ? cleanRef : '',
          name: cleanRef,
          species,
          breed: defaultBreed,
          variety: '',
          sex: expectedSex,
          status: 'Retired',
          archived: true,
          birthDateIso: '',
          weightGrams: 0,
          genotype: [],
          genotypeRaw: '',
          registrationNumber: '',
          grandChampionNumber: '',
          legsCount: 0,
          cageLocation: '',
          breederName: '',
          ownerName: '',
          sireId: '',
          damId: '',
          notes: 'Reference ancestor synthesized from HerdBoss pedigree link.',
          createdAt: ts,
          updatedAt: ts,
        };
        animalsById.set(ancId, anc);
        registerLookupToken(species, cleanRef, ancId);
        placeholderAncestorsCreated++;
      }
      return ancId;
    };

    for (const link of pendingLineage) {
      const subject = animalsById.get(link.animalId);
      if (!subject) continue;

      if (link.sireRef) {
        const resolvedSireId = resolveOrCreateAncestor(
          link.species,
          link.sireRef,
          'Male',
          link.breed,
          subject.id
        );
        if (resolvedSireId) {
          subject.sireId = resolvedSireId;
          parentLinksResolved++;

          const sireRecord = animalsById.get(resolvedSireId);
          if (sireRecord) {
            if (link.paternalGrandsireRef && !sireRecord.sireId) {
              const pgs = resolveOrCreateAncestor(
                link.species,
                link.paternalGrandsireRef,
                'Male',
                link.breed,
                sireRecord.id
              );
              if (pgs) {
                sireRecord.sireId = pgs;
                parentLinksResolved++;
              }
            }
            if (link.paternalGranddamRef && !sireRecord.damId) {
              const pgd = resolveOrCreateAncestor(
                link.species,
                link.paternalGranddamRef,
                'Female',
                link.breed,
                sireRecord.id
              );
              if (pgd) {
                sireRecord.damId = pgd;
                parentLinksResolved++;
              }
            }
          }
        }
      }

      if (link.damRef) {
        const resolvedDamId = resolveOrCreateAncestor(
          link.species,
          link.damRef,
          'Female',
          link.breed,
          subject.id
        );
        if (resolvedDamId) {
          subject.damId = resolvedDamId;
          parentLinksResolved++;

          const damRecord = animalsById.get(resolvedDamId);
          if (damRecord) {
            if (link.maternalGrandsireRef && !damRecord.sireId) {
              const mgs = resolveOrCreateAncestor(
                link.species,
                link.maternalGrandsireRef,
                'Male',
                link.breed,
                damRecord.id
              );
              if (mgs) {
                damRecord.sireId = mgs;
                parentLinksResolved++;
              }
            }
            if (link.maternalGranddamRef && !damRecord.damId) {
              const mgd = resolveOrCreateAncestor(
                link.species,
                link.maternalGranddamRef,
                'Female',
                link.breed,
                damRecord.id
              );
              if (mgd) {
                damRecord.damId = mgd;
                parentLinksResolved++;
              }
            }
          }
        }
      }
    }

    // Helper to resolve an animal across imported + existing barn animals
    const findAnimalByAnyToken = (rawToken: string, preferredSpecies?: string): Animal | undefined => {
      const clean = rawToken.trim().toLowerCase();
      if (!clean) return undefined;

      if (preferredSpecies) {
        const id = animalLookup.get(`${preferredSpecies.toLowerCase()}::${clean}`);
        if (id) {
          return (
            animalsById.get(id) || existingSnapshot.animals.find((a) => a.id === id)
          );
        }
      }

      for (const [key, id] of animalLookup.entries()) {
        if (key.endsWith(`::${clean}`)) {
          return (
            animalsById.get(id) || existingSnapshot.animals.find((a) => a.id === id)
          );
        }
      }
      return undefined;
    };

    // PASS 3: Process Breedings, Weights, Treatments/Care, Notes/Tasks, and Shows across both ZIPs
    for (const item of classifiedTables) {
      const { table, classification, usedCols } = item;

      if (classification === 'weights') {
        table.rows.forEach((row, idx) => {
          const rawSpecies = pickCell(row, table.normHeaderMap, usedCols, ['species', 'animaltype']);
          const animalToken = pickCell(row, table.normHeaderMap, usedCols, [
            'animalid',
            'animal',
            'tag',
            'primarytag',
            'visualtag',
            'eartag',
            'tattoo',
            'name',
            'animalname',
          ]);
          const matchedAnimal = findAnimalByAnyToken(animalToken, rawSpecies);
          if (!matchedAnimal) return;

          const dateIso =
            normalizeFlexibleDateIso(
              pickCell(row, table.normHeaderMap, usedCols, [
                'weighdate',
                'weightdate',
                'date',
                'recordedat',
                'createdat',
              ])
            ) || todayDateIso();
          const unitCol = pickCell(row, table.normHeaderMap, usedCols, ['unit', 'units', 'weightunit']);
          const weightVal = pickCell(row, table.normHeaderMap, usedCols, [
            'weight',
            'weightlbs',
            'weightkg',
            'value',
            'amount',
          ]);
          const grams = parseFlexibleWeightToGrams(weightVal, unitCol);
          if (grams <= 0) return;

          const label =
            pickCell(row, table.normHeaderMap, usedCols, ['type', 'stage', 'label', 'title']) ||
            'Weight Check';
          const notes = pickCell(row, table.normHeaderMap, usedCols, [
            'notes',
            'note',
            'comments',
            'adg',
          ]);

          careLogs.push({
            id: deterministicEntityId(
              'weight',
              matchedAnimal.species,
              `${matchedAnimal.id}-${dateIso}-${grams}-${idx}`
            ),
            species: matchedAnimal.species,
            animalId: matchedAnimal.id,
            dateIso,
            type: 'Weight Check',
            title: label,
            weightGrams: grams,
            showLegEarned: false,
            notes,
            createdAt: ts,
            updatedAt: ts,
          });

          // Keep the animal's primary weightGrams synced with latest weigh-in
          const mutableAnimal = animalsById.get(matchedAnimal.id);
          if (mutableAnimal) {
            mutableAnimal.weightGrams = grams;
          }
        });
      } else if (classification === 'treatments_care') {
        table.rows.forEach((row, idx) => {
          const rawSpecies = pickCell(row, table.normHeaderMap, usedCols, ['species', 'animaltype']);
          const animalToken = pickCell(row, table.normHeaderMap, usedCols, [
            'animalid',
            'animal',
            'tag',
            'primarytag',
            'visualtag',
            'eartag',
            'tattoo',
            'name',
            'animalname',
          ]);
          const matchedAnimal = findAnimalByAnyToken(animalToken, rawSpecies);
          if (!matchedAnimal) return;

          const dateIso =
            normalizeFlexibleDateIso(
              pickCell(row, table.normHeaderMap, usedCols, [
                'treatmentdate',
                'date',
                'administereddate',
                'givenon',
                'recordedat',
              ])
            ) || todayDateIso();

          const medName = pickCell(row, table.normHeaderMap, usedCols, [
            'medication',
            'medicine',
            'product',
            'drug',
            'vaccine',
            'treatment',
            'treatmenttype',
            'procedure',
            'title',
          ]);
          const dosage = pickCell(row, table.normHeaderMap, usedCols, [
            'dosage',
            'dose',
            'amount',
          ]);
          const route = pickCell(row, table.normHeaderMap, usedCols, ['route', 'method', 'site']);
          const withdrawal = pickCell(row, table.normHeaderMap, usedCols, [
            'withdrawaldate',
            'meatwithdrawal',
            'milkwithdrawal',
            'withdrawal',
          ]);
          const famacha = pickCell(row, table.normHeaderMap, usedCols, ['famacha', 'bcs', 'score']);
          const notes = pickCell(row, table.normHeaderMap, usedCols, [
            'notes',
            'note',
            'comments',
            'reason',
          ]);

          const detailParts: string[] = [];
          if (dosage) detailParts.push(`Dose: ${dosage}`);
          if (route) detailParts.push(`Route: ${route}`);
          if (withdrawal) detailParts.push(`Withdrawal: ${withdrawal}`);
          if (famacha) detailParts.push(`Score: ${famacha}`);
          if (notes) detailParts.push(notes);

          const isHoofOrShear = /hoof|trim|shear|groom/i.test(`${table.baseName} ${medName}`);
          const logType: CareLogType = isHoofOrShear ? 'Grooming & Hoof' : 'Health / Vet';

          careLogs.push({
            id: deterministicEntityId(
              'treat',
              matchedAnimal.species,
              `${matchedAnimal.id}-${dateIso}-${medName || idx}`
            ),
            species: matchedAnimal.species,
            animalId: matchedAnimal.id,
            dateIso,
            type: logType,
            title: medName || 'Health / Treatment',
            weightGrams: 0,
            showLegEarned: false,
            notes: detailParts.join(' · '),
            createdAt: ts,
            updatedAt: ts,
          });
        });
      } else if (classification === 'breedings') {
        table.rows.forEach((row, idx) => {
          const rawSpecies = pickCell(row, table.normHeaderMap, usedCols, ['species', 'animaltype']);
          const sireToken = pickCell(row, table.normHeaderMap, usedCols, [
            'sireid',
            'sire',
            'siretag',
            'sirename',
            'male',
            'buck',
            'ram',
            'bull',
            'boar',
          ]);
          const damToken = pickCell(row, table.normHeaderMap, usedCols, [
            'damid',
            'dam',
            'damtag',
            'damname',
            'female',
            'doe',
            'ewe',
            'cow',
            'sow',
          ]);

          const matchedDam = findAnimalByAnyToken(damToken, rawSpecies);
          const matchedSire = findAnimalByAnyToken(
            sireToken,
            matchedDam?.species || rawSpecies
          );

          const spName =
            matchedDam?.species ||
            matchedSire?.species ||
            ensureSpecies(rawSpecies, table.baseName).name;
          const spProfile = resolveSpeciesProfile(spName, workingSpeciesProfiles);

          const bredDateIso = normalizeFlexibleDateIso(
            pickCell(row, table.normHeaderMap, usedCols, [
              'breddate',
              'breedingdate',
              'matingdate',
              'exposurestart',
              'startdate',
              'aidate',
              'servicedate',
              'date',
            ])
          );
          const actualBirthIso = normalizeFlexibleDateIso(
            pickCell(row, table.normHeaderMap, usedCols, [
              'birthdate',
              'actualbirthdate',
              'kiddingdate',
              'lambingdate',
              'calvingdate',
              'kindlingdate',
              'farrowingdate',
              'whelpingdate',
              'deliverydate',
            ])
          );
          const dueDateRaw = normalizeFlexibleDateIso(
            pickCell(row, table.normHeaderMap, usedCols, [
              'duedate',
              'expectedduedate',
              'estimatedduedate',
            ])
          );

          const effectiveBredIso =
            bredDateIso ||
            (actualBirthIso ? addDaysIso(actualBirthIso, -spProfile.gestationDays) : todayDateIso());
          const effectiveDueIso =
            dueDateRaw || addDaysIso(effectiveBredIso, spProfile.gestationDays);

          const liveCount =
            Number(
              pickCell(row, table.normHeaderMap, usedCols, [
                'livecount',
                'bornalive',
                'liveborn',
                'live',
                'offspringcount',
                'kidcount',
                'lambcount',
                'kitcount',
              ])
            ) || 0;
          const stillbornCount =
            Number(
              pickCell(row, table.normHeaderMap, usedCols, [
                'stillborncount',
                'stillborn',
                'borndead',
                'dead',
              ])
            ) || 0;
          const weanedCount =
            Number(pickCell(row, table.normHeaderMap, usedCols, ['weanedcount', 'weaned'])) || 0;

          const rawStatus = pickCell(row, table.normHeaderMap, usedCols, [
            'status',
            'outcome',
            'result',
            'pregnancycheck',
          ]).toLowerCase();

          let bStatus: BreedingStatus = 'Bred';
          if (weanedCount > 0 || /wean/.test(rawStatus)) bStatus = 'Weaned';
          else if (actualBirthIso || liveCount > 0 || /born|kid|lamb|calv|kindl|deliver/.test(rawStatus))
            bStatus = 'Born';
          else if (/open|miss|fail|aborted|empty/.test(rawStatus)) bStatus = 'Missed';
          else if (/preg|confirm|positive/.test(rawStatus)) bStatus = 'Palpated Positive';
          else if (/plan/.test(rawStatus)) bStatus = 'Planned';

          const notes = pickCell(row, table.normHeaderMap, usedCols, [
            'notes',
            'note',
            'comments',
            'method',
            'breedingtype',
          ]);

          if (!matchedDam && !matchedSire && !damToken && !sireToken) return;

          const damId =
            matchedDam?.id ||
            (damToken
              ? resolveOrCreateAncestor(spName, damToken, 'Female', '', '')
              : '');
          const sireId =
            matchedSire?.id ||
            (sireToken
              ? resolveOrCreateAncestor(spName, sireToken, 'Male', '', damId)
              : '');

          breedings.push({
            id: deterministicEntityId(
              'breeding',
              spName,
              `${sireId || sireToken}-${damId || damToken}-${effectiveBredIso}-${idx}`
            ),
            species: spName,
            sireId,
            damId,
            sireName: matchedSire?.name || sireToken || 'Unknown Sire',
            damName: matchedDam?.name || damToken || 'Unknown Dam',
            bredDateIso: effectiveBredIso,
            expectedDueDateIso: effectiveDueIso,
            actualBirthDateIso: actualBirthIso,
            projectedCoiPercent: 0,
            liveCount,
            stillbornCount,
            fosteredCount: 0,
            weanedCount,
            offspringCreated: false,
            status: bStatus,
            notes,
            createdAt: ts,
            updatedAt: ts,
          });
        });
      } else if (classification === 'notes_tasks') {
        table.rows.forEach((row, idx) => {
          const rawSpecies = pickCell(row, table.normHeaderMap, usedCols, ['species', 'animaltype']);
          const animalToken = pickCell(row, table.normHeaderMap, usedCols, [
            'animalid',
            'animal',
            'tag',
            'primarytag',
            'name',
          ]);
          const matchedAnimal = findAnimalByAnyToken(animalToken, rawSpecies);
          const dateIso =
            normalizeFlexibleDateIso(
              pickCell(row, table.normHeaderMap, usedCols, ['duedate', 'date', 'createdat'])
            ) || todayDateIso();
          const title = pickCell(row, table.normHeaderMap, usedCols, [
            'title',
            'task',
            'subject',
            'summary',
          ]);
          const body = pickCell(row, table.normHeaderMap, usedCols, [
            'notes',
            'note',
            'comment',
            'comments',
            'description',
            'body',
          ]);

          if (matchedAnimal && (body || title)) {
            careLogs.push({
              id: deterministicEntityId(
                'note',
                matchedAnimal.species,
                `${matchedAnimal.id}-${dateIso}-${idx}`
              ),
              species: matchedAnimal.species,
              animalId: matchedAnimal.id,
              dateIso,
              type: 'Journal Note',
              title: title || 'Imported HerdBoss Note',
              weightGrams: 0,
              showLegEarned: false,
              notes: body,
              createdAt: ts,
              updatedAt: ts,
            });
          } else if (title || body) {
            const sp = ensureSpecies(rawSpecies, table.baseName);
            const completedRaw = pickCell(row, table.normHeaderMap, usedCols, [
              'completed',
              'done',
              'status',
            ]).toLowerCase();
            tasks.push({
              id: deterministicEntityId('task', sp.name, `${title || body}-${dateIso}-${idx}`),
              species: sp.name,
              title: title || body.slice(0, 80),
              category: 'Other',
              priority: 'Normal',
              dueDateIso: dateIso,
              linkedAnimalId: '',
              linkedAnimalName: '',
              linkedBreedingId: '',
              completed: completedRaw === 'true' || completedRaw === '1' || completedRaw === 'done',
              createdAt: ts,
              updatedAt: ts,
            });
          }
        });
      } else if (classification === 'shows') {
        table.rows.forEach((row, idx) => {
          const rawSpecies = pickCell(row, table.normHeaderMap, usedCols, ['species', 'animaltype']);
          const sp = ensureSpecies(rawSpecies, table.baseName);
          const showName =
            pickCell(row, table.normHeaderMap, usedCols, ['showname', 'name', 'event', 'fair']) ||
            'Imported Show';
          const eventDateIso =
            normalizeFlexibleDateIso(
              pickCell(row, table.normHeaderMap, usedCols, ['showdate', 'eventdate', 'date'])
            ) || todayDateIso();
          const location = pickCell(row, table.normHeaderMap, usedCols, ['location', 'city', 'venue']);
          const notes = pickCell(row, table.normHeaderMap, usedCols, [
            'placing',
            'award',
            'judge',
            'notes',
          ]);
          shows.push({
            id: deterministicEntityId('show', sp.name, `${showName}-${eventDateIso}-${idx}`),
            species: sp.name,
            name: showName,
            location,
            sanctioningBody: 'Imported',
            eventDateIso,
            entryDeadlineIso: '',
            enteredAnimalIds: [],
            notes,
            createdAt: ts,
            updatedAt: ts,
          });
        });
      } else if (classification === 'media_manifest') {
        table.rows.forEach((row, idx) => {
          deferredManifestRowCount++;
          const rawSpecies = pickCell(row, table.normHeaderMap, usedCols, ['species', 'animaltype']);
          const animalToken = pickCell(row, table.normHeaderMap, usedCols, [
            'animalid',
            'animal',
            'tag',
            'primarytag',
            'visualtag',
            'eartag',
            'tattoo',
            'name',
            'animalname',
            'recordid',
          ]);
          const fileLabel = pickCell(row, table.normHeaderMap, usedCols, [
            'filename',
            'filepath',
            'photofile',
            'imagefile',
            'file',
            'path',
            'photo',
            'image',
            'photourl',
            'imageurl',
            'url',
            'title',
          ]);
          const caption = pickCell(row, table.normHeaderMap, usedCols, [
            'caption',
            'notes',
            'note',
            'description',
          ]);
          const primaryRaw = pickCell(row, table.normHeaderMap, usedCols, [
            'isprimary',
            'primary',
            'default',
            'cover',
          ]).toLowerCase();
          const preferPrimary =
            primaryRaw === 'true' || primaryRaw === '1' || primaryRaw === 'yes';

          // Mark remaining metadata columns as recognized so QA unmapped list stays clean
          pickCell(row, table.normHeaderMap, usedCols, [
            'id',
            'photoid',
            'imageid',
            'sortorder',
            'position',
            'mimetype',
            'contenttype',
            'filesize',
            'createdat',
            'date',
          ]);

          const matchedAnimal = findAnimalByAnyToken(animalToken, rawSpecies);
          if (matchedAnimal) {
            const matchedEntry = fileLabel
              ? resolveImageEntry(fileLabel, [animalToken, matchedAnimal.tattoo, matchedAnimal.name])
              : undefined;
            if (matchedEntry) {
              queueBinaryImageForAnimal(matchedAnimal.id, matchedEntry, caption, preferPrimary);
            } else {
              missingPhotoZipRefsCount++;
              recordDeferredImageForAnimal(matchedAnimal.id, fileLabel || `photo-${idx + 1}`);
            }
          }
        });
      }
    }

    // Resolve inline photo columns collected during Pass 1
    for (const inlineRef of inlinePhotoRefs) {
      const matchedEntry = resolveImageEntry(inlineRef.rawPhotoRef, inlineRef.tokens);
      if (matchedEntry) {
        queueBinaryImageForAnimal(
          inlineRef.animalId,
          matchedEntry,
          '',
          inlineRef.preferPrimary
        );
      } else {
        missingPhotoZipRefsCount++;
        recordDeferredImageForAnimal(inlineRef.animalId, inlineRef.rawPhotoRef);
      }
    }

    // Match any remaining binary ZIP image entries (e.g. `photos/1042/side.jpg` or `OR-101_2.jpg`)
    // directly to animals so multi-image folders/prefixes import even without a CSV manifest.
    for (const imgEntry of imageArchiveEntries) {
      const entryKey = `${imgEntry.archiveName}::${imgEntry.entryPath}`;
      if (claimedImagePaths.has(entryKey)) continue;

      const segments = imgEntry.entryPath.replace(/\\/g, '/').split('/').filter(Boolean);
      let matched: Animal | undefined;

      // 1. Check parent folder names (`photos/<animalId>/img1.jpg`)
      for (let i = segments.length - 2; i >= 0; i--) {
        const folderToken = segments[i];
        if (
          folderToken &&
          !/^(?:photo|photos|image|images|media|attachment|attachments|files|export|animals|herd)$/i.test(
            folderToken
          )
        ) {
          matched = findAnimalByAnyToken(folderToken);
          if (matched) break;
        }
      }

      // 2. Check filename stem or prefix before `_` / `-` sequence index (`OR-101_2.jpg`, `OR-101-front.jpg`)
      if (!matched) {
        const stem = imgEntry.baseName.replace(/\.[^.]+$/, '');
        matched = findAnimalByAnyToken(stem);
        if (!matched) {
          const strippedIndex = stem.replace(
            /[_\-\s]+(?:\d+|front|side|rear|left|right|head|profile|ear|tattoo)$/i,
            ''
          );
          if (strippedIndex && strippedIndex !== stem) {
            matched = findAnimalByAnyToken(strippedIndex);
          }
        }
      }

      if (matched) {
        queueBinaryImageForAnimal(matched.id, imgEntry, '', false);
      } else {
        // Unmatched orphan image in ZIP
        deferredMediaCount++;
        deferredMediaBytes += imgEntry.sizeBytes;
        if (deferredMediaSampleNames.length < 6) {
          deferredMediaSampleNames.push(imgEntry.entryPath);
        }
      }
    }

    // Materialize `stagedPhotos` ordered per animal with deterministic IDs
    const stagedPhotos: StagedImportedPhoto[] = [];
    let stagedPhotosRawBytes = 0;
    const existingPhotosList = existingSnapshot.animalPhotos ?? [];

    for (const [animalId, queuedList] of queuedImagesByAnimal.entries()) {
      const ownerAnimal =
        animalsById.get(animalId) || existingSnapshot.animals.find((a) => a.id === animalId);
      if (!ownerAnimal || queuedList.length === 0) continue;

      const existingForAnimal = existingPhotosList.filter((p) => p.animalId === ownerAnimal.id);
      const alreadyHasPrimary = existingForAnimal.some((p) => p.isPrimary);

      const ordered = [...queuedList].sort((a, b) => {
        if (a.preferPrimary !== b.preferPrimary) return a.preferPrimary ? -1 : 1;
        return 0;
      });

      ordered.forEach((q, idx) => {
        if (!q.entry.imageBytes) return;
        const photoId = deterministicEntityId(
          'photo',
          ownerAnimal.species,
          `${ownerAnimal.id}-${idx}-${q.entry.baseName}`
        );
        const existingSamePhoto = existingForAnimal.find((p) => p.id === photoId);
        stagedPhotosRawBytes += q.entry.sizeBytes;
        stagedPhotos.push({
          id: photoId,
          species: ownerAnimal.species,
          animalId: ownerAnimal.id,
          animalName: ownerAnimal.name,
          isPrimary: existingSamePhoto
            ? existingSamePhoto.isPrimary
            : !alreadyHasPrimary && idx === 0,
          sortOrder: existingSamePhoto ? existingSamePhoto.sortOrder : existingForAnimal.length + idx,
          caption: q.caption,
          originalFileName: q.entry.baseName,
          entryPath: q.entry.entryPath,
          mimeHint: q.entry.mimeHint || 'image/jpeg',
          bytes: q.entry.imageBytes,
        });
      });
    }

    let animalsWithMultipleImagesCount = 0;
    for (const [animalId, imgSet] of perAnimalImages.entries()) {
      if (imgSet.size >= 2) {
        animalsWithMultipleImagesCount++;
      }
      if (options.appendDeferredImageFilenamesToNotes && imgSet.size > 0) {
        const target = animalsById.get(animalId);
        if (target) {
          const allNames = Array.from(imgSet);
          const shown = allNames.slice(0, 5).join(', ');
          const overflow = allNames.length > 5 ? ` (+${allNames.length - 5} more)` : '';
          const noteSuffix = `Original HerdBoss photo files (${allNames.length}): ${shown}${overflow}`;
          target.notes = target.notes ? `${target.notes} · ${noteSuffix}` : noteSuffix;
        }
      }
    }

    // Build preexisting animal contradiction items now that all Sire/Dam, Weight, and Note fields are resolved!
    const allKnownAnimalsById = new Map<string, Animal>();
    for (const ex of existingSnapshot.animals) {
      allKnownAnimalsById.set(ex.id, ex);
    }
    for (const inc of animalsById.values()) {
      if (!allKnownAnimalsById.has(inc.id)) {
        allKnownAnimalsById.set(inc.id, inc);
      }
    }

    const conflicts: AnimalImportConflict[] = [];
    for (const [animalId, match] of matchedExistingByAnimalId.entries()) {
      const incomingAnimal = animalsById.get(animalId);
      if (!incomingAnimal) continue;
      const contradictions = buildAnimalContradictions(match.animal, incomingAnimal, {
        preferredUnit: existingSnapshot.settings.preferredUnit,
        speciesProfiles: workingSpeciesProfiles,
        allKnownAnimalsById,
      });
      if (contradictions.length > 0) {
        conflicts.push({
          animalId,
          species: match.animal.species,
          displayName: match.animal.name || incomingAnimal.name,
          displayTag: match.animal.tattoo || incomingAnimal.tattoo,
          matchedBy: match.matchedBy,
          existingAnimal: match.animal,
          incomingAnimal,
          contradictions,
        });
      }
    }

    // Build table diagnostics & QA schema report (privacy-safe: filenames, row counts, and column headers only!)
    for (const { table, classification, usedCols } of classifiedTables) {
      const matchedColumns = table.headers.filter((h) => usedCols.has(h));
      const unmappedColumns = table.headers.filter((h) => !usedCols.has(h));
      diagnostics.push({
        archiveName: table.archiveName,
        entryPath: table.entryPath,
        classification,
        rowCount: table.rows.length,
        headers: table.headers,
        matchedColumns,
        unmappedColumns,
      });
    }

    if (animalsById.size === 0 && breedings.length === 0 && careLogs.length === 0 && stagedPhotos.length === 0) {
      if (imageArchiveEntries.length > 0 || deferredMediaCount > 0 || deferredManifestRowCount > 0) {
        warnings.push(
          `Found ${imageArchiveEntries.length + deferredMediaCount} photo/media files in the staged archive(s), but the animal CSV spreadsheet hasn't been staged yet. Click "+ Add Companion .ZIP" above to add the HerdBoss data .ZIP so photos can link to each animal!`
        );
      } else {
        warnings.push(
          'No animal, breeding, or care rows matched yet. Expand "Inspect ZIP Manifest & Columns" below and copy the schema report if your HerdBoss export uses custom filenames.'
        );
      }
    } else if (missingPhotoZipRefsCount > 0 && imageArchiveEntries.length === 0) {
      warnings.push(
        `Detected ${missingPhotoZipRefsCount} animal photo reference(s) in your CSV data, but no image files are staged yet. Add the companion HerdBoss Photos .ZIP above if you'd like to import & optimize those photos automatically.`
      );
    }

    const reportLines: string[] = [
      `Importer: ${this.name}`,
      `Archives (${archiveNames.length}): ${archiveNames.join(', ')}`,
      `Preexisting Barn Animals Matched: ${matchedExistingByAnimalId.size} (${conflicts.length} with data contradictions)`,
      `Matched Animal Photos Staged for Optimization: ${stagedPhotos.length} (${stagedPhotosRawBytes} raw bytes)`,
      `Animals With Detected Photos: ${perAnimalImages.size} (${animalsWithMultipleImagesCount} with 2+ photos)`,
      `Missing Companion Photo ZIP References: ${missingPhotoZipRefsCount}`,
      `Unmatched/Non-Image Media Skipped: ${deferredMediaCount} (${deferredMediaBytes} bytes)`,
      `Tables Detected (${diagnostics.length}):`,
      ...diagnostics.map(
        (d) =>
          `- [${d.classification}] ${d.archiveName} :: ${d.entryPath} (${d.rowCount} rows)\n  Headers: ${d.headers.join(', ')}${
            d.unmappedColumns.length > 0 ? `\n  Unmapped: ${d.unmappedColumns.join(', ')}` : ''
          }`
      ),
    ];

    return {
      platformId: this.id,
      platformName: this.name,
      archiveNames,
      diagnostics,
      stagedPhotos,
      stagedPhotosRawBytes,
      missingPhotoZipRefsCount,
      deferredMediaCount,
      deferredMediaBytes,
      deferredMediaSampleNames,
      deferredManifestRowCount,
      animalsWithMultipleImagesCount,
      warnings,
      speciesDetected: Array.from(speciesDetectedSet),
      newSpeciesProfiles,
      animals: Array.from(animalsById.values()),
      matchedExistingAnimalsCount: matchedExistingByAnimalId.size,
      conflicts,
      parentLinksResolved,
      placeholderAncestorsCreated,
      cages: Array.from(cagesByKey.values()),
      breedings,
      tasks,
      careLogs,
      shows,
      schemaDiagnosticReport: reportLines.join('\n'),
    };
  },
};
